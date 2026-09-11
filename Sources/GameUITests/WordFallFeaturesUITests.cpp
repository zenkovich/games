#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

#include "o2/Utils/System/Time/Time.h"

#include <functional>

// Фичи экрана: подложка формы поля, сообщение о дубле слова, туториал, читы,
// попап финала со звёздами, полёт букв от бонусов в бар. Рендер + скриншоты по WORDFALL_CLIPS_DIR
class WordFallFeaturesUI: public WordFallUI
{
protected:
	bool UseCampaign() const override { return true; }

	static String ClipsDir()
	{
		auto dir = ::getenv("WORDFALL_CLIPS_DIR");
		return dir ? String(dir) : String();
	}

	// Покадровый клип длиной seconds игрового времени (для видео-отчёта)
	void CaptureClip(const String& name, float seconds, const std::function<void()>& step = {})
	{
		String dir = ClipsDir();
		if (dir.IsEmpty())
		{
			AppTestDriver::Wait(seconds);
			return;
		}

		String clipDir = dir + "/" + name + "/";
		o2FileSystem.FolderCreate(clipDir, true);

		// несколько вызовов подряд с одним именем продолжают один клип
		if (mClipName != name)
		{
			mClipName = name;
			mClipFrame = 0;
			mClipSeconds = 0.0f;
		}

		float elapsed = 0.0f;
		while (elapsed < seconds)
		{
			EXPECT_TRUE(AppTestDriver::SaveScreenshot(clipDir + String::Format("f%03i.png", mClipFrame)));
			if (step)
				step();
			float dt = Math::Clamp(o2Time.GetDeltaTime(), 0.001f, 0.05f);
			elapsed += dt;
			mClipSeconds += dt;
			mClipFrame++;
		}

		DataDocument info;
		info["frames"] = mClipFrame;
		info["seconds"] = mClipSeconds;
		info.SaveToFile(clipDir + "clip.json");
	}

	String mClipName;
	int mClipFrame = 0;
	float mClipSeconds = 0.0f;

	void Shot(const String& name)
	{
		String dir = ClipsDir();
		if (dir.IsEmpty())
			return;
		o2FileSystem.FolderCreate(dir, true);
		EXPECT_TRUE(AppTestDriver::SaveScreenshot(dir + "/" + name + ".png"));
	}

	Ref<Actor> Screen() { return o2Scene.FindActor("WordFall")->GetChild("Screen"); }

	// Тап по центру виджета
	void Tap(const Ref<Actor>& actor)
	{
		auto widget = DynamicCast<Widget>(actor);
		ASSERT_TRUE(widget);
		Click(widget->layout->GetWorldRect().Center());
	}

	// Сценарии со свободной игрой: обучение помечается показанным до старта уровня
	void SkipTutorials()
	{
		const char* keys[9] = { "basics", "boosters", "ice", "stone", "bonus", "crate", "chain", "snow", "parcel" };
		for (auto key : keys)
			mService->MarkTutorialSeen(key);
	}

	void DismissTutorial()
	{
		auto dim = Screen()->GetChild("Tutorial/Dim");
		for (int i = 0; i < 12 && dim && dim->IsEnabled(); i++)
		{
			Tap(dim);
			AppTestDriver::PumpFrames(3);
		}
	}
};

TEST_F(WordFallFeaturesUI, BoardBackingFollowsTheFieldShape)
{
	mService->StartLevel(0); // первый уровень кампании — с дырами
	AppTestDriver::PumpFrames(4);
	auto board = Screen()->GetChild("Board");
	auto& model = mService->GetLevel().GetBoard();
	int holes = 0, shownHoles = 0, shownCells = 0;
	for (int c = 0; c < model.GetColumns(); c++)
	{
		for (int r = 0; r < model.GetRows(); r++)
		{
			auto back = board->GetChild(String::Format("CellBack_%i_%i", c, r));
			ASSERT_TRUE(back);
			if (model.IsHole(Vec2I(c, r)))
			{
				holes++;
				shownHoles += back->IsEnabled() ? 1 : 0;
			}
			else
				shownCells += back->IsEnabled() ? 1 : 0;
		}
	}
	EXPECT_GT(holes, 0);
	EXPECT_EQ(shownHoles, 0) << "у дыр подложки нет";
	EXPECT_EQ(shownCells, model.GetColumns()*model.GetRows() - holes);
	EXPECT_FALSE(board->GetChild("Panel")) << "единой квадратной подложки больше нет";
	DismissTutorial();
	Shot("feature_board_shape");
}

TEST_F(WordFallFeaturesUI, TutorialGuidesFirstWordAndRemembersItself)
{
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	auto caption = Screen()->GetChild("Tutorial/Caption");
	auto hand = Screen()->GetChild("Tutorial/Hand");
	ASSERT_TRUE(caption && hand);
	EXPECT_FALSE(Screen()->GetChild("Tutorial/Panel")) << "подложки у текста обучения нет";
	EXPECT_TRUE(caption->IsEnabled()) << "на первом уровне показывается обучение";
	EXPECT_TRUE(hand->IsEnabled());
	EXPECT_TRUE(mService->IsTutorialSeen("basics"));
	Shot("feature_tutorial_basics");

	// шаг ведётся действием: выбор слова-задания переводит к принятию
	auto seeded = mService->GetLevel().GetBoard().GetSeededCells();
	ASSERT_GE(seeded.Count(), 3);
	CaptureClip("tutorial", 1.2f); // рука водит по подсвеченным буквам
	for (auto& cell : seeded)
	{
		ClickTile(cell.x, cell.y);
		CaptureClip("tutorial", 0.35f);
	}
	AppTestDriver::PumpFrames(3);
	EXPECT_TRUE(caption->IsEnabled());
	Shot("feature_tutorial_accept");

	DismissTutorial();
	mService->ResetTutorials();
	EXPECT_FALSE(mService->IsTutorialSeen("basics"));
}

// Пояснительный шаг перекрывает и вырез: тап по подсвеченному бустеру не тратит заряд,
// а просто ведёт к следующему шагу
// Первый шаг ведёт по буквам: подсветка и текст переезжают на следующую нужную букву
TEST_F(WordFallFeaturesUI, TutorialLeadsLetterByLetter)
{
	mService->StartLevel(0);
	AppTestDriver::Wait(0.9f);

	auto text = DynamicCast<Label>(Screen()->GetChild("Tutorial/Caption/Text"));
	auto hand = DynamicCast<Widget>(Screen()->GetChild("Tutorial/Hand"));
	ASSERT_TRUE(text && hand);

	auto seeded = mService->GetLevel().GetBoard().GetSeededCells();
	ASSERT_GE(seeded.Count(), 3);
	auto board = o2Scene.FindActor("WordFall")->GetChild("Screen/Board");
	auto tileCenter = [&](const Vec2I& cell)
	{
		auto tile = DynamicCast<Widget>(board->GetChild(String::Format("Tile_%i_%i", cell.x, cell.y)));
		return tile ? tile->layout->GetWorldRect().Center() : Vec2F();
	};

	for (int i = 0; i < seeded.Count(); i++)
	{
		WString before = text->GetText();
		EXPECT_LT((hand->layout->GetWorldRect().Center() - tileCenter(seeded[i])).Length(), 90.0f)
			<< "рука показывает на букву " << i;
		Shot(String::Format("feature_tutorial_letter%i", i));

		ClickTile(seeded[i].x, seeded[i].y);
		AppTestDriver::Wait(0.15f);
		if (i + 1 < seeded.Count())
			EXPECT_NE(text->GetText(), before) << "подсказка не перешла на следующую букву";
	}

	// слово набрано — шаг сменился на принятие
	EXPECT_TRUE(text->GetText().Contains(WString("Нажми ✓"))) << "после набора ведёт к кнопке принятия";
}

// Каждый элемент поля получает свой шаг обучения при первом появлении
TEST_F(WordFallFeaturesUI, TutorialExplainsEveryFieldElement)
{
	struct Element { const char* key; const char* word; std::function<bool(const WordTile&)> has; };
	Vector<Element> elements = {
		{ "ice", "Лёд", [](const WordTile& t) { return t.ice > 0; } },
		{ "stone", "Камень", [](const WordTile& t) { return t.stone > 0; } },
		{ "bonus", "Бонус", [](const WordTile& t) { return !t.powerup.IsEmpty(); } },
		{ "crate", "Ящик", [](const WordTile& t) { return t.crate > 0; } },
		{ "chain", "Цепь", [](const WordTile& t) { return t.chained; } },
		{ "snow", "Снежки", [](const WordTile& t) { return t.snow; } },
		{ "parcel", "Конверт", [](const WordTile& t) { return t.parcel; } },
	};

	auto text = DynamicCast<Label>(Screen()->GetChild("Tutorial/Caption/Text"));
	auto caption = Screen()->GetChild("Tutorial/Caption");
	ASSERT_TRUE(text && caption);

	for (auto& element : elements)
	{
		// найти уровень кампании, где элемент есть на старте
		int found = -1;
		for (int index = 0; index < 40 && found < 0; index++)
		{
			mService->StartLevel(index);
			auto& board = mService->GetLevel().GetBoard();
			for (int c = 0; c < board.GetColumns() && found < 0; c++)
				for (int r = 0; r < board.GetRows() && found < 0; r++)
					if (element.has(board.GetTile(Vec2I(c, r))))
						found = index;
		}
		ASSERT_GE(found, 0) << "в кампании нет уровня с элементом " << element.key;

		// показываем только этот шаг: остальные помечены увиденными
		mService->ResetTutorials();
		const char* keys[9] = { "basics", "boosters", "ice", "stone", "bonus", "crate", "chain", "snow", "parcel" };
		for (auto key : keys)
		{
			if (String(key) != String(element.key))
				mService->MarkTutorialSeen(key);
		}

		mService->StartLevel(found);
		AppTestDriver::Wait(0.9f);
		EXPECT_TRUE(caption->IsEnabled()) << "нет шага для " << element.key;
		EXPECT_TRUE(text->GetText().Contains(WString(String(element.word))))
			<< element.key << ": " << String(text->GetText());
		EXPECT_TRUE(mService->IsTutorialSeen(element.key));
		Shot(String("feature_tutorial_") + element.key);
	}
}

TEST_F(WordFallFeaturesUI, BlockingTutorialStepSwallowsClicksInsideTheCutout)
{
	mService->MarkTutorialSeen("basics");
	mService->StartLevel(1); // на втором уровне показывается шаг про бустеры
	AppTestDriver::Wait(0.9f);

	auto caption = Screen()->GetChild("Tutorial/Caption");
	auto glow = Screen()->GetChild("Tutorial/Dim/Glow0");
	ASSERT_TRUE(caption && glow);
	ASSERT_TRUE(caption->IsEnabled());
	EXPECT_TRUE(glow->IsEnabled()) << "вырез подсвечен каймой";

	auto text = DynamicCast<Label>(Screen()->GetChild("Tutorial/Caption/Text"));
	ASSERT_TRUE(text);
	WString before = text->GetText();
	EXPECT_TRUE(before.Contains(WString("Бустеры"))) << "шаг про бустеры";
	Shot("feature_tutorial_boosters");

	int charges = mService->GetBoosterCharges(1); // перемешать
	auto shuffle = Screen()->GetChild("Boosters/Booster1/Btn");
	ASSERT_TRUE(shuffle);
	Tap(shuffle);
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(mService->GetBoosterCharges(1), charges) << "бустер не сработал сквозь обучение";
	EXPECT_NE(text->GetText(), before) << "тап увёл обучение дальше";
}

// Появление отдаёт буквы покою без рывка: последний кадр влёта совпадает с первым кадром idle
TEST_F(WordFallFeaturesUI, WinPopupHandsLettersOverToIdleWithoutJump)
{
	SkipTutorials();
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	mService->DebugCompleteTasks();
	mService->DebugAddScore(mService->GetTargetScore()*2);

	auto content = Screen()->GetChild("Popup/Content");
	ASSERT_TRUE(content);
	auto tile = DynamicCast<Widget>(content->GetChild("Confetti0"));
	ASSERT_TRUE(tile);

	// влёт: до 1.5 с буквы едут на свои места, дальше их ведёт только покой
	AppTestDriver::Wait(1.5f);

	Vec2F previous = tile->layout->GetWorldRect().Center();
	float maxStep = 0.0f, travel = 0.0f;
	for (int i = 0; i < 120; i++)
	{
		AppTestDriver::Wait(0.03f);
		Vec2F center = tile->layout->GetWorldRect().Center();
		float step = (center - previous).Length();
		maxStep = Math::Max(maxStep, step);
		travel += step;
		previous = center;
	}

	EXPECT_GT(travel, 20.0f) << "буквы стоят на месте — покой не идёт";
	EXPECT_LT(maxStep, 6.0f) << "буква дёрнулась при передаче из появления в покой";
}

TEST_F(WordFallFeaturesUI, WinPopupIdleFloatsLettersAndBumpsStars)
{
	SkipTutorials();
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	mService->DebugCompleteTasks();
	mService->DebugAddScore(mService->GetTargetScore()*2);
	CaptureClip("win", 4.6f); // появление и дальше idle

	auto content = Screen()->GetChild("Popup/Content");
	ASSERT_TRUE(content);
	auto tile = DynamicCast<Widget>(content->GetChild("Confetti0"));
	auto star = DynamicCast<Widget>(content->GetChild("Star0"));
	auto button = DynamicCast<Widget>(content->GetChild("RestartBtn"));
	auto score = DynamicCast<Label>(content->GetChild("ScoreLine"));
	ASSERT_TRUE(tile && star && button && score);

	Vec2F tileStart = tile->layout->GetWorldRect().Center();
	float buttonWidth = button->layout->GetWorldRect().Width();
	WString letterStart = DynamicCast<Text>(tile->GetLayer("letter")->GetDrawable())->GetText();

	Vec2F minTile(FLT_MAX, FLT_MAX), maxTile(-FLT_MAX, -FLT_MAX);
	float minStar = FLT_MAX, maxStar = 0.0f, buttonDrift = 0.0f;
	bool letterChanged = false;
	for (int i = 0; i < 90; i++)
	{
		AppTestDriver::Wait(0.05f);
		Vec2F center = tile->layout->GetWorldRect().Center();
		minTile.x = Math::Min(minTile.x, center.x); maxTile.x = Math::Max(maxTile.x, center.x);
		minTile.y = Math::Min(minTile.y, center.y); maxTile.y = Math::Max(maxTile.y, center.y);
		float starWidth = star->layout->GetWorldRect().Width();
		minStar = Math::Min(minStar, starWidth); maxStar = Math::Max(maxStar, starWidth);
		buttonDrift = Math::Max(buttonDrift, Math::Abs(button->layout->GetWorldRect().Width() - buttonWidth));
		letterChanged = letterChanged ||
			DynamicCast<Text>(tile->GetLayer("letter")->GetDrawable())->GetText() != letterStart;
	}

	EXPECT_GT(maxTile.x - minTile.x, 6.0f) << "буквы не парят по горизонтали";
	EXPECT_GT(maxTile.y - minTile.y, 8.0f) << "буквы не парят по вертикали";
	EXPECT_LT((tileStart - tile->layout->GetWorldRect().Center()).Length(), 60.0f)
		<< "парение уводит букву далеко от точки появления";
	EXPECT_GT(maxStar - minStar, 6.0f) << "звёзды не бампают";
	EXPECT_LT(buttonDrift, 1.5f) << "кнопка должна стоять на месте";
	EXPECT_TRUE(letterChanged) << "буквы не перебираются";
	Shot("feature_popup_idle");
}

TEST_F(WordFallFeaturesUI, DuplicateWordShowsMessage)
{
	SkipTutorials();
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	auto message = Screen()->GetChild("WordBar/Tray/Message");
	ASSERT_TRUE(message);
	EXPECT_FALSE(message->IsEnabled());

	PlantKot();
	ClickTile(1, 0); ClickTile(2, 0); ClickTile(3, 0);
	Click(Vec2F(222, 331));
	AppTestDriver::Wait(2.5f);
	EXPECT_TRUE(mService->IsWordUsed("КОТ"));

	int moves = mService->GetMovesLeft();
	PlantKot();
	ClickTile(1, 0); ClickTile(2, 0); ClickTile(3, 0);
	Click(Vec2F(222, 331));
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(mService->GetMovesLeft(), moves) << "дубль не тратит ход";
	EXPECT_TRUE(message->IsEnabled()) << "сообщение о дубле";
	Shot("feature_duplicate");
}

TEST_F(WordFallFeaturesUI, CheatsPanelOpensAndActs)
{
	SkipTutorials();
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	auto toggle = Screen()->GetChild("Cheats/Toggle");
	auto panel = Screen()->GetChild("Cheats/Panel");
	ASSERT_TRUE(toggle && panel);
	EXPECT_FALSE(panel->IsEnabled());

	Tap(toggle);
	AppTestDriver::PumpFrames(3);
	EXPECT_TRUE(panel->IsEnabled());
	Shot("feature_cheats");

	int moves = mService->GetMovesLeft();
	Tap(panel->GetChild("Cheat2/Btn")); // +5 ходов
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(mService->GetMovesLeft(), moves + 5);
	EXPECT_FALSE(panel->IsEnabled()) << "после действия панель закрывается";
}

TEST_F(WordFallFeaturesUI, WinPopupLightsStarsAndCountsScore)
{
	SkipTutorials();
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	mService->DebugCompleteTasks();
	mService->DebugAddScore(mService->GetTargetScore()*2); // три звезды
	AppTestDriver::Wait(1.0f);
	Shot("feature_popup_win_burst"); // плитки-конфетти и блики в разлёте
	AppTestDriver::Wait(1.6f);

	auto content = Screen()->GetChild("Popup/Content");
	ASSERT_TRUE(content);
	EXPECT_TRUE(content->IsEnabled());
	EXPECT_TRUE(content->GetChild("Star0")->IsEnabled());
	EXPECT_TRUE(content->GetChild("Star2")->IsEnabled());
	auto score = DynamicCast<Label>(content->GetChild("ScoreLine"));
	ASSERT_TRUE(score);
	EXPECT_EQ(String(score->GetText()), String::Format("%i", mService->GetScore()));
	Shot("feature_popup_win");

	// поражение: звёзды не горят, заголовок другой
	Tap(content->GetChild("RestartBtn/Btn"));
	AppTestDriver::Wait(0.8f);
	mService->DebugLoseLevel();
	AppTestDriver::Wait(2.0f);
	EXPECT_TRUE(content->IsEnabled());
	EXPECT_FALSE(content->GetChild("Star0")->IsEnabled());
	Shot("feature_popup_lose");
}

TEST_F(WordFallFeaturesUI, BonusLettersFlyIntoTheBar)
{
	SkipTutorials();
	mService->StartLevel(0);
	AppTestDriver::Wait(0.8f);
	PlantKot();
	mService->DebugSetPowerup(1, 1, "bomb");
	AppTestDriver::PumpFrames(2);
	ClickTile(1, 0); ClickTile(2, 0); ClickTile(3, 0);
	Click(Vec2F(222, 331));

	auto fx = Screen()->GetChild("Fx");
	int maxFlying = 0;
	for (int i = 0; i < 80; i++)
	{
		AppTestDriver::PumpFrames(1);
		int flying = 0;
		for (int k = 0; k < 24; k++)
		{
			auto letter = fx->GetChild(String::Format("FxLetter%i", k));
			if (letter && letter->IsEnabled())
				flying++;
		}
		maxFlying = Math::Max(maxFlying, flying);
		if (i == 30)
			Shot("feature_bonus_letters");
	}
	EXPECT_GT(maxFlying, 3) << "кроме трёх букв слова летят буквы, выбитые бомбой";
	AppTestDriver::Wait(2.0f);
}
