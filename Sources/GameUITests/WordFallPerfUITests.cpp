#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include <chrono>

#include "WordFallUITestSupport.h"
#include "o2/Assets/Types/VectorImageAsset.h"
#include "o2/Render/VectorRasterCache.h"
#include "o2/Render/VectorSprite.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Application/Input.h"
#include "o2/Utils/Debug/Profiling/NanoProfiler.h"

// Цена векторной графики главного экрана: холодный старт сцены, кадр в покое, ход с обвалом и смена масштаба
// камеры (так зумится окно сцены редактора). Меши картинок запечены сборщиком ассетов: тесселяций нет нигде;
// картинки рисуются растрами из атласа, пока растр не готов - треугольниками
class WordFallPerfUI: public WordFallUI
{
protected:
	using Clock = std::chrono::steady_clock;

	double mStartupMs = 0;
	UInt   mStartupTessellations = 0;
	double mStartupTessellationMs = 0;

	static double Ms(Clock::time_point from) { return std::chrono::duration<double, std::milli>(Clock::now() - from).count(); }

	void SetUp() override
	{
		UInt count = VectorImageAsset::GetTessellationsCount();
		double time = VectorImageAsset::GetTessellationTime();
		auto start = Clock::now();
		WordFallUI::SetUp();
		mStartupMs = Ms(start);
		mStartupTessellations = VectorImageAsset::GetTessellationsCount() - count;
		mStartupTessellationMs = (VectorImageAsset::GetTessellationTime() - time)*1000.0;
	}

	struct Frames
	{
		double total = 0, max = 0;
		int    count = 0;
		UInt   tessellations = 0;
		double tessellationMs = 0;

		double Mean() const { return count > 0 ? total/count : 0; }
	};

	Frames Pump(int frames)
	{
		Frames out;
		UInt count = VectorImageAsset::GetTessellationsCount();
		double time = VectorImageAsset::GetTessellationTime();
		for (int i = 0; i < frames; i++)
		{
			auto start = Clock::now();
			AppTestDriver::PumpFrames(1);
			double ms = Ms(start);
			out.total += ms;
			out.max = Math::Max(out.max, ms);
			out.count++;
		}
		out.tessellations = VectorImageAsset::GetTessellationsCount() - count;
		out.tessellationMs = (VectorImageAsset::GetTessellationTime() - time)*1000.0;
		return out;
	}

	static void Report(const char* what, const Frames& f)
	{
		printf("PERF %-34s frames %3d  mean %7.1f ms  max %7.1f ms  tessellations %4u (%7.1f ms)\n",
			   what, f.count, f.Mean(), f.max, f.tessellations, f.tessellationMs);
	}

	Ref<CameraActor> Camera()
	{
		for (auto& actor : o2Scene.GetRootActors())
		{
			if (auto camera = DynamicCast<CameraActor>(actor))
				return camera;
		}
		return nullptr;
	}
};

TEST_F(WordFallPerfUI, VectorScreenCost)
{
	printf("PERF startup (scene + 10 frames)       %7.1f ms  tessellations %4u (%7.1f ms)\n",
		   mStartupMs, mStartupTessellations, mStartupTessellationMs);

	auto rastersStart = Clock::now();
	int rastersFrames = 0;
	while (o2VectorRasters.GetRasterizingCount() > 0 && rastersFrames < 600)
	{
		AppTestDriver::PumpFrames(1);
		rastersFrames++;
	}

	printf("PERF rasters ready                     %7.1f ms  frames %3d  rasters %d, pages %d, usage %.2f\n",
		   Ms(rastersStart), rastersFrames, o2VectorRasters.GetRastersCount(), o2VectorRasters.GetPagesCount(),
		   o2VectorRasters.GetUsage());

	Frames idle = Pump(30);
	Report("idle", idle);
	int primitives = o2Render.GetSceneDrawnPrimitives();
	auto before = VectorSprite::GetStatistics();
	AppTestDriver::PumpFrames(1);
	auto after = VectorSprite::GetStatistics();
	printf("PERF drawn primitives per frame        %d (vector sprites: %llu drawn, %llu from rasters, %llu culled, %llu triangles)\n",
		   primitives, (unsigned long long)(after.draws - before.draws), (unsigned long long)(after.rasterDraws - before.rasterDraws),
		   (unsigned long long)(after.culledDraws - before.culledDraws), (unsigned long long)(after.drawnTriangles - before.drawnTriangles));

	PlantWord("КОТ");
	for (int i = 1; i <= 3; i++)
		ClickTile(i, 0);
	Click(AcceptPosition());
	Frames move = Pump(120);
	Report("word accepted: flights and fall", move);

	auto camera = Camera();
	ASSERT_TRUE(camera);
	Vec2F fitted = kScreenSize;
	Frames zoom;
	const float steps[] = { 0.9f, 0.75f, 0.6f, 0.5f, 0.4f, 0.33f, 0.5f, 0.75f, 1.0f, 1.3f, 1.0f };
	for (float k : steps)
	{
		camera->SetFittedSize(fitted*k);
		Frames step = Pump(4);
		zoom.total += step.total;
		zoom.max = Math::Max(zoom.max, step.max);
		zoom.count += step.count;
		zoom.tessellations += step.tessellations;
		zoom.tessellationMs += step.tessellationMs;
	}
	auto s0 = VectorSprite::GetStatistics();
	Frames settle = Pump(60);
	auto s1 = VectorSprite::GetStatistics();
	Report("zoom steps (4 frames each)", zoom);
	Report("after zoom", settle);
	printf("PERF after zoom per frame: rebuilt %llu, shifted %llu, recolored %llu vertices, %llu draws\n",
		   (unsigned long long)((s1.rebuiltVertices - s0.rebuiltVertices)/60), (unsigned long long)((s1.shiftedVertices - s0.shiftedVertices)/60),
		   (unsigned long long)((s1.recoloredVertices - s0.recoloredVertices)/60), (unsigned long long)((s1.draws - s0.draws)/60));
	camera->SetFittedSize(fitted);
	Pump(10);

	EXPECT_EQ(mStartupTessellations, 0u) << "the meshes come baked with the assets";
	EXPECT_EQ(idle.tessellations + move.tessellations + zoom.tessellations + settle.tessellations, 0u)
		<< "one mesh of an image for any scale";
	EXPECT_LT(primitives, 20000) << "the vector images are drawn from their rasters";
	EXPECT_EQ(o2VectorRasters.GetRasterizingCount(), 0) << "the rasters of the screen are ready";
}

// Фризы по сценариям игры (запуск: WORDFALL_PROFILE=1; WORDFALL_PROFILE=js — ещё и методы скриптов игры в каждом
// долгом кадре): каждый кадр дольше бюджета 60 FPS выводится отдельно с самыми дорогими зонами
class WordFallFrameProfile: public WordFallUI
{
protected:
	static constexpr double kBudgetMs = 16.7;

	struct Spike { double ms = 0; int frame = 0; String zones; String js; };
	struct Scenario
	{
		const char*   name;
		int           frames = 0;
		double        maxMs = 0;
		Vector<Spike> spikes;
	};

	Vector<Scenario> mScenarios;
	bool             mJs = false;
	String           mLastJs; // методы скриптов кадра, который профайлер опубликует следующим

	bool UseCampaign() const override { return true; }

	void SetUp() override
	{
		WordFallUI::SetUp();
		const char* keys[9] = { "basics", "boosters", "ice", "stone", "bonus", "crate", "chain", "snow", "parcel" };
		for (auto key : keys)
			mService->MarkTutorialSeen(key);
		NanoProfiler::SetEnabled(true);
		AppTestDriver::PumpFrames(30);
	}

	void TearDown() override
	{
		NanoProfiler::SetEnabled(false);
		WordFallUI::TearDown();
	}

	static String ShortName(const char* name)
	{
		String s(name);
		int paren = s.Find("(");
		if (paren > 0)
			s = s.SubStr(0, paren);
		int space = s.FindLast(" ");
		return space >= 0 ? s.SubStr(space + 1) : s;
	}

	Scenario& Begin(const char* name)
	{
		mScenarios.Add(Scenario());
		mScenarios.Last().name = name;
		return mScenarios.Last();
	}

	// Кадр приложения; профайлер к этому моменту опубликовал предыдущий кадр — его и разбираем
	void Frame(Scenario& s)
	{
		AppTestDriver::PumpFrames(1);

		String js = mLastJs;
		if (mJs)
		{
			mLastJs = o2Scripts.Eval("WordFallProfileJs.Report(8)").ToString();
			o2Scripts.Eval("WordFallProfileJs.Reset()");
		}

		double ms = NanoProfiler::GetFrameDuration()/1.0e6;
		s.frames++;
		s.maxMs = Math::Max(s.maxMs, ms);
		if (ms <= kBudgetMs)
			return;

		static NanoProfiler::AggregatedSample buffer[NanoProfiler::maxAggregatedSamples];
		int count = NanoProfiler::AggregateFrame(buffer, NanoProfiler::maxAggregatedSamples);
		Vector<std::pair<const char*, Int64>> zones;
		for (int i = 0; i < count; i++)
			zones.Add({ buffer[i].name, buffer[i].time });
		zones.SortBy<Int64>([](auto& x) { return -x.second; });

		Spike spike;
		spike.ms = ms;
		spike.frame = s.frames;
		for (int i = 0; i < Math::Min(5, zones.Count()); i++)
			spike.zones += String::Format("  %s %.1f", ShortName(zones[i].first).Data(), zones[i].second/1.0e6);
		spike.js = js;
		s.spikes.Add(spike);
	}

	void Frames(Scenario& s, int count)
	{
		for (int i = 0; i < count; i++)
			Frame(s);
	}

	void Tap(Scenario& s, const Vec2F& worldPos)
	{
		Vec2F at = ToWindow(worldPos);
		o2Input.OnCursorMoved(at, 0, false);
		o2Input.OnCursorPressed(at);
		Frame(s);
		o2Input.OnCursorReleased();
		Frame(s);
	}

	void PlayWord(Scenario& s, const char* word)
	{
		PlantWord(word);
		WString letters((String(word)));
		for (int i = 0; i < letters.Length(); i++)
			Tap(s, TilePosition(1 + i, 0));
		Tap(s, AcceptPosition());
	}

	void Report()
	{
		for (auto& s : mScenarios)
		{
			printf("\nPROFILE %-24s frames %4d  max %6.1f ms  over %.1f ms: %d\n", s.name, s.frames, s.maxMs, kBudgetMs,
				   s.spikes.Count());
			for (auto& spike : s.spikes)
			{
				printf("  frame %4d %6.1f ms:%s\n", spike.frame, spike.ms, spike.zones.Data());
				if (!spike.js.IsEmpty())
					printf("%s", spike.js.Data());
			}
		}
	}

	// Обёртки методов классов скриптов игры: время с вложенными вызовами и число вызовов. Date.now — миллисекунды,
	// для фризов в десятки миллисекунд этого хватает
	void InstallJsProfiler()
	{
		auto res = o2Scripts.Eval(R"JS(
(function() {
	var stats = {};
	WordFallProfileJs = {
		Reset: function() { stats = {}; },
		Report: function(count) {
			var rows = Object.keys(stats).map(function(k) { return [k, stats[k].t, stats[k].n]; })
				.filter(function(r) { return r[1] > 0; });
			rows.sort(function(a, b) { return b[1] - a[1]; });
			return rows.slice(0, count).map(function(r) {
				return "      " + ("     " + r[1]).slice(-5) + " ms " + ("    " + r[2]).slice(-5) + "x  " + r[0];
			}).join("\n") + (rows.length ? "\n" : "");
		}
	};
	function wrap(owner, label) {
		Object.getOwnPropertyNames(owner).forEach(function(key) {
			if (key == "constructor" || key == "prototype" || key == "length" || key == "name")
				return;
			var d = Object.getOwnPropertyDescriptor(owner, key);
			if (!d || typeof d.value !== "function" || !d.writable)
				return;
			var f = d.value, id = label + "." + key;
			owner[key] = function() {
				var t = Date.now();
				try { return f.apply(this, arguments); }
				finally {
					var s = stats[id] || (stats[id] = { t: 0, n: 0 });
					s.t += Date.now() - t; s.n++;
				}
			};
		});
	}
	var wrapped = 0;
	Object.getOwnPropertyNames(globalThis).forEach(function(name) {
		if (!/^(WordFall|Word|PlayerProgress)/.test(name) || name == "WordFallProfileJs")
			return;
		var v = globalThis[name];
		if (typeof v !== "function" || !v.prototype)
			return;
		wrap(v.prototype, name);
		wrap(v, name);
		wrapped++;
	});
	return wrapped;
})())JS");
		printf("PROFILE js: wrapped %d classes\n", res.GetValue<int>());
	}
};

TEST_F(WordFallFrameProfile, Freezes)
{
	auto mode = ::getenv("WORDFALL_PROFILE");
	if (!mode)
		GTEST_SKIP() << "профиль снимается по запросу: WORDFALL_PROFILE=1 или js";

	mJs = String(mode) == "js";
	if (mJs)
		InstallJsProfiler();

	Frames(Begin("idle"), 180);

	// как играет человек: подсказка находит слово, буквы прощёлкиваются в лоток, слово принимается
	auto playHints = [&](Scenario& s)
	{
		mService->DebugAddCharges(20);
		Frames(s, 30);
		for (int move = 0; move < 12; move++)
		{
			Tap(s, BoosterPosition(2));
			Frames(s, 70);
			Tap(s, AcceptPosition());
			Frames(s, 150);
		}
	};
	playHints(Begin("hint + accept, 12 moves"));

	{
		// задание «слово на N очков»: после каждого хода уровень проверяет, что такое слово ещё собирается
		int level = o2Scripts.Eval("(function() { var s = WordFallGame.service; for (var i = 0; i < s.GetLevelCount(); i++)"
								   " if (s.GetLevelConfig(i).tasks.some(function(t) { return t.taskType == 'WordScore'; })) return i;"
								   " return -1; })()").GetValue<int>();
		ASSERT_GE(level, 0);
		auto& s = Begin("hint + accept, word score");
		mService->StartLevel(level);
		playHints(s);
	}

	{
		auto& s = Begin("select letters");
		PlantWord("КОТ");
		for (int i = 1; i <= 3; i++)
			Tap(s, TilePosition(i, 0));
		Frames(s, 30);
		Tap(s, ClearPosition());
		Frames(s, 30);
	}

	const char* bonuses[3] = { "bomb", "rocket", "fireworks" };
	const char* words[3] = { "ТОК", "КИТ", "ТИК" };
	for (int i = 0; i < 3; i++)
	{
		auto& s = Begin(bonuses[i]);
		mService->DebugSetPowerup(1, 1, bonuses[i]);
		PlayWord(s, words[i]);
		Frames(s, 300);
	}

	{
		auto& s = Begin("shuffle booster");
		Tap(s, BoosterPosition(1));
		Frames(s, 120);
	}

	{
		auto& s = Begin("level start");
		mService->StartLevel(1);
		Frames(s, 180);
	}

	Report();
}
