#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/FileSystem.h"

#include <filesystem>
#include <fstream>
#include <regex>
#include <set>
#include <sstream>

using namespace o2;

// Runs the game's JS tests (Scripts/*.test.js): every file is a gtest suite named after it, every
// test("Name", ...) inside is a test case. Names come from the file text, so listing needs no engine
namespace
{
	struct JsTestFile
	{
		String path;
		String suite;
		Vector<String> tests;
	};

	std::string ReadText(const std::filesystem::path& path)
	{
		std::ifstream file(path, std::ios::binary);
		std::stringstream buffer;
		buffer << file.rdbuf();
		return buffer.str();
	}

	Vector<JsTestFile> ScanTestFiles()
	{
		Vector<JsTestFile> files;
		std::error_code ec;
		std::vector<std::filesystem::path> paths;
		for (auto& entry : std::filesystem::directory_iterator(GAME_JS_TESTS_DIR, ec))
		{
			auto name = entry.path().filename().string();
			if (name.size() > 8 && name.compare(name.size() - 8, 8, ".test.js") == 0)
				paths.push_back(entry.path());
		}
		std::sort(paths.begin(), paths.end());

		static const std::regex testPattern("\\btest\\(\\s*\"([A-Za-z0-9_]+)\"");
		for (auto& path : paths)
		{
			JsTestFile file;
			file.path = String(path.string().c_str());
			auto stem = path.filename().string();
			file.suite = String(stem.substr(0, stem.size() - 8).c_str());

			auto text = ReadText(path);
			for (std::sregex_iterator it(text.begin(), text.end(), testPattern), end; it != end; ++it)
				file.tests.Add(String((*it)[1].str().c_str()));

			files.Add(file);
		}
		return files;
	}

	bool RunScript(const String& path, String& error)
	{
		auto parsed = o2Scripts.Parse(FileSystem::ReadFile(path), path);
		if (!parsed.IsOk())
		{
			error = parsed.GetError();
			return false;
		}

		auto result = o2Scripts.Run(parsed);
		if (result.GetValueType() == ScriptValue::ValueType::Error)
		{
			error = result.GetError();
			return false;
		}
		return true;
	}

	// Runs the prelude and the suite file once per process
	bool LoadSuite(const JsTestFile& file, String& error)
	{
		static bool preludeLoaded = false;
		static std::set<std::string> loadedSuites;

		if (!preludeLoaded)
		{
			if (!RunScript(String(GAME_JS_TESTS_DIR) + "JsTestsPrelude.js", error))
				return false;
			preludeLoaded = true;
		}

		if (loadedSuites.count(file.suite.Data()))
			return true;

		auto jsTests = o2Scripts.GetGlobal().GetProperty("JsTests");
		auto suite = ScriptValue::EmptyObject();
		jsTests.GetProperty("suites").SetProperty(ScriptValue(file.suite), suite);
		jsTests.SetProperty("current", suite);

		if (!RunScript(file.path, error))
			return false;

		loadedSuites.insert(file.suite.Data());
		return true;
	}

	class JsTestCase: public ::testing::Test
	{
	public:
		JsTestCase(const JsTestFile& file, const String& name):
			mFile(file), mName(name)
		{}

		void TestBody() override
		{
			String error;
			ASSERT_TRUE(LoadSuite(mFile, error)) << mFile.path.Data() << ": " << error.Data();

			auto jsTests = o2Scripts.GetGlobal().GetProperty("JsTests");
			auto body = jsTests.GetProperty("suites").GetProperty(ScriptValue(mFile.suite)).GetProperty(ScriptValue(mName));
			ASSERT_TRUE(body.IsFunction()) << "no test " << mName.Data() << " in " << mFile.path.Data();

			jsTests.SetProperty("failures", ScriptValue::EmptyArray());
			auto result = body.InvokeRaw(Vector<ScriptValue>());
			if (result.GetValueType() == ScriptValue::ValueType::Error)
				ADD_FAILURE() << result.GetError().Data();

			auto failures = jsTests.GetProperty("failures");
			for (int i = 0; i < failures.GetLength(); i++)
				ADD_FAILURE() << failures.GetElement(i).ToString().Data();
		}

	private:
		JsTestFile mFile;
		String     mName;
	};
}

void RegisterJsTests()
{
	for (auto& file : ScanTestFiles())
	{
		for (auto& name : file.tests)
		{
			::testing::RegisterTest(file.suite.Data(), name.Data(), nullptr, nullptr, file.path.Data(), 0,
									[file, name]() -> JsTestCase* { return new JsTestCase(file, name); });
		}
	}
}
