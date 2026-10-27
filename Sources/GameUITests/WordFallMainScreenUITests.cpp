#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

// Главный экран по концепту: слова уровня — рядами плашек в отдельной панели (лишние — «ещё N»),
// прочие задачи — иконками в полосе, цвет плашек под буквами случайный и едет с плиткой
class WordFallMainScreenUI: public WordFallUI
{
protected:
	String Eval(const String& code) { return o2Scripts.Eval(code).ToString(); }

	// Уровень 0 с заданными словами и без задач, стартует сразу
	void StartWithWords(const String& wordsJson)
	{
		o2Scripts.Eval("(function() { var c = WordFallGame.service.GetLevelConfig(0); c.words = " + wordsJson +
					   "; c.wordsAuto = 0; c.tasks = []; c.targetScore = 10; WordFallGame.service.SetLevelConfig(0, c); WordFallGame.service.StartLevel(0); })()");
		AppTestDriver::PumpFrames(3);
	}

	String Shown() { return Eval("JSON.stringify(WordFallViews.tasks.GetShownWords())"); }
};

TEST_F(WordFallMainScreenUI, WordsPanelListsEveryWordAndFoldsTheRest)
{
	StartWithWords("[\"КОТ\", \"ДОМ\", \"ЛУНА\"]");
	EXPECT_EQ(Shown(), String("{\"words\":[{\"word\":\"КОТ\",\"found\":false},{\"word\":\"ДОМ\",\"found\":false},{\"word\":\"ЛУНА\",\"found\":false}],\"more\":\"\"}"));

	StartWithWords("[\"КОТ\", \"ДОМ\", \"ЛУНА\", \"САД\", \"ЛЕС\", \"МОРЕ\"]");
	EXPECT_EQ(Shown(), String("{\"words\":[{\"word\":\"КОТ\",\"found\":false},{\"word\":\"ДОМ\",\"found\":false},{\"word\":\"ЛУНА\",\"found\":false}],\"more\":\"ещё 3 слова\"}"))
		<< "слов больше, чем рядов: последний ряд — сколько не поместилось";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "30_words_overflow.png"));

	// найденное слово уходит в конец списка видимых, на его место встаёт следующее
	PlantWord("ДОМ");
	for (int i = 1; i <= 3; i++)
		ClickTile(i, 0);
	Click(AcceptPosition());
	AppTestDriver::Wait(2.5f);
	EXPECT_EQ(Shown(), String("{\"words\":[{\"word\":\"КОТ\",\"found\":false},{\"word\":\"ЛУНА\",\"found\":false},{\"word\":\"САД\",\"found\":false}],\"more\":\"ещё 3 слова\"}"));
	EXPECT_EQ(Eval("JSON.stringify(WordFallGame.service.GetWords()[1])"), String("{\"word\":\"ДОМ\",\"found\":true}"));
}

TEST_F(WordFallMainScreenUI, FoundWordTurnsOrangeAndTypedPrefixLightsUp)
{
	StartWithWords("[\"КОТ\", \"ЛУНА\"]");
	auto words = o2Scene.FindActor("WordFall")->GetChild("Screen/Tasks/Words");
	auto tile = DynamicCast<Widget>(words->GetChild("W1_0"));
	ASSERT_TRUE(tile);

	PlantWord("ЛУН");
	ClickTile(1, 0);
	ClickTile(2, 0);
	auto color = tile->GetLayer("back")->GetDrawable()->GetColor();
	EXPECT_LT(color.r, 220) << "набранный префикс ЛУ подсвечен в слове ЛУНА";
	auto third = DynamicCast<Widget>(words->GetChild("W1_2"));
	EXPECT_EQ(third->GetLayer("back")->GetDrawable()->GetColor().r, 255) << "дальше префикса — обычная плашка";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "31_words_prefix.png"));
	Click(ClearPosition());
	AppTestDriver::PumpFrames(3);

	PlantWord("КОТ");
	for (int i = 1; i <= 3; i++)
		ClickTile(i, 0);
	Click(AcceptPosition());
	AppTestDriver::Wait(2.5f);
	auto found = DynamicCast<Widget>(words->GetChild("W0_0")); // слова помещаются — порядок списка
	EXPECT_TRUE(found->GetLayer("found")->IsEnabled());
	EXPECT_FALSE(found->GetLayer("back")->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "32_word_found.png"));
}

TEST_F(WordFallMainScreenUI, OtherTasksShowIconsCountsAndTheFinalCheck)
{
	o2Scripts.Eval("(function() { var c = WordFallGame.service.GetLevelConfig(0); c.words = []; c.wordsAuto = 0;"
				   " c.tasks = [{taskType: 'Letter', letter: 'О', count: 10}, {taskType: 'AnyWords', count: 2}, {taskType: 'Powerup', powerupKind: 'bomb', count: 1}];"
				   " c.targetScore = 10; WordFallGame.service.SetLevelConfig(0, c); WordFallGame.service.StartLevel(0); })()");
	AppTestDriver::PumpFrames(3);
	auto others = o2Scene.FindActor("WordFall")->GetChild("Screen/Tasks/Others");
	auto letterTile = DynamicCast<Widget>(others->GetChild("Item0/Icon"));
	ASSERT_TRUE(letterTile);
	EXPECT_EQ(String(letterTile->GetLayerDrawable<Text>("letter")->GetText()), String("О"));
	EXPECT_EQ(String(DynamicCast<Label>(others->GetChild("Item0/Count"))->GetText()), String("0/10"));
	EXPECT_TRUE(letterTile->GetLayer("back")->IsEnabled());
	EXPECT_TRUE(DynamicCast<Widget>(others->GetChild("Item2/Icon"))->GetLayer("image")->IsEnabled()) << "бонус — иконкой";
	EXPECT_FALSE(others->GetChild("Item3")->IsEnabled());
	auto check = DynamicCast<Widget>(others->GetChild("AllDone"));
	EXPECT_LT(check->GetTransparency(), 0.5f) << "не всё закрыто — галочка бледная";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "33_tasks_strip.png"));

	mService->DebugCompleteTasks();
	AppTestDriver::PumpFrames(3);
	EXPECT_TRUE(others->GetChild("Item0/Done")->IsEnabled());
	EXPECT_FALSE(others->GetChild("Item0/Count")->IsEnabled());
	EXPECT_FLOAT_EQ(check->GetTransparency(), 1.0f);
}

TEST_F(WordFallMainScreenUI, TileColoursAreRandomAndTravelWithTheTiles)
{
	StartWithWords("[]"); // без слов и задач поле не подсевается — цвета меняет только обвал
	auto tint = [&](int c, int r) { return o2Scripts.Eval(String::Format("WordFallViews.board.GetTileTint(%i, %i)", c, r)).GetValue<int>(); };
	auto model = [&](int c, int r) { return o2Scripts.Eval(String::Format("WordFallGame.service.GetTile(%i, %i).tint", c, r)).GetValue<int>(); };

	int counts[4] = { 0, 0, 0, 0 };
	for (int c = 0; c < 7; c++)
	{
		for (int r = 0; r < 8; r++)
		{
			int shown = tint(c, r);
			EXPECT_EQ(shown, model(c, r)) << c << "," << r;
			if (shown >= 0 && shown < 4)
				counts[shown]++;
		}
	}
	// смена картинки плашки не меняет её размер: плашка ровно в прямоугольнике слоя
	auto board = o2Scene.FindActor("WordFall")->GetChild("Screen/Board");
	for (int c = 0; c < 7; c++)
	{
		for (int r = 0; r < 8; r++)
		{
			auto back = DynamicCast<Widget>(board->GetChild(String::Format("Tile_%i_%i", c, r)))->GetLayer("back");
			EXPECT_NEAR(back->GetDrawable()->GetRect().Width(), back->GetRect().Width(), 0.5f) << c << "," << r;
		}
	}

	int kinds = 0;
	for (int i = 0; i < 4; i++)
		kinds += counts[i] > 0 ? 1 : 0;
	EXPECT_GE(kinds, 3) << "плашки разных цветов";

	// принятое слово в нижнем ряду: плитки над ним падают со своим цветом
	PlantWord("КОТ");
	int fallen = model(2, 1);
	for (int i = 1; i <= 3; i++)
		ClickTile(i, 0);
	Click(AcceptPosition());
	AppTestDriver::Wait(2.5f);
	EXPECT_EQ(model(2, 0), fallen) << "плитка из ряда выше упала вместе со своим цветом";
	EXPECT_EQ(tint(2, 0), model(2, 0));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "34_tints_after_fall.png"));
}
