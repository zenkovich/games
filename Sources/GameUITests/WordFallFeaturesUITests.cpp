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

	// Подложка поля по его форме: фон живой клетки включён, дыры — нет, у каждой четверти фона кусок
	// по соседям её угла (как WordFallBoardView.BackKind). Возвращает дыры
	Vector<Vec2I> ExpectBackingFollowsShape()
	{
		auto board = Screen()->GetChild("Board");
		auto& model = mService->GetLevel().GetBoard();
		auto inside = [&](int c, int r) {
			return c >= 0 && c < model.GetColumns() && r >= 0 && r < model.GetRows() && !model.IsHole(Vec2I(c, r));
		};
		struct Quarter { const char* name; int dx, dy; };
		const Quarter quarters[4] = { { "tl", -1, 1 }, { "tr", 1, 1 }, { "bl", -1, -1 }, { "br", 1, -1 } };
		Vector<Vec2I> holes;
		for (int c = 0; c < model.GetColumns(); c++)
		{
			for (int r = 0; r < model.GetRows(); r++)
			{
				auto back = DynamicCast<Widget>(board->GetChild(String::Format("Back_%i_%i", c, r)));
				EXPECT_TRUE(back) << c << "," << r;
				if (!back)
					continue;
				EXPECT_EQ(back->IsEnabled(), inside(c, r)) << c << "," << r;
				if (!inside(c, r))
				{
					holes.Add(Vec2I(c, r));
					EXPECT_FALSE(board->GetChild(String::Format("Tile_%i_%i", c, r))->IsEnabled()) << "в дыре плитки нет";
					continue;
				}
				for (auto& q : quarters)
				{
					String kind = String(inside(c + q.dx, r) ? "h" : "") + (inside(c, r + q.dy) ? "v" : "") + (inside(c + q.dx, r + q.dy) ? "d" : "");
					if (kind.IsEmpty())
						kind = "o";
					auto piece = DynamicCast<Sprite>(back->GetLayer(q.name)->GetDrawable());
					EXPECT_TRUE(piece && piece->GetImageName() == String::Format("WordFall/ScreenUI/board_%s_%s.png", q.name, kind.Data()))
						<< c << "," << r << " " << q.name << ": " << (piece ? piece->GetImageName().Data() : "-") << ", ждали " << kind.Data();
				}
			}
		}
		return holes;
	}

	// В дыре — фон экрана; рамка вокруг неё той же толщины, что у левого края поля
	void ExpectEvenRimAroundHoles(const Ref<Bitmap>& frame, const Vector<Vec2I>& holes)
	{
		auto& model = mService->GetLevel().GetBoard();
		int row = 0;
		while (row < model.GetRows() && model.IsHole(Vec2I(0, row)))
			row++;
		float outer = FrameWidth(frame, TileRect(0, row), Vec2F(-1, 0));
		EXPECT_GT(outer, 5.0f);
		const Vec2I sides[4] = { Vec2I(-1, 0), Vec2I(1, 0), Vec2I(0, -1), Vec2I(0, 1) };
		int rims = 0;
		for (auto& hole : holes)
		{
			EXPECT_TRUE(IsPaper(ScreenPixel(frame, TilePosition(hole.x, hole.y)))) << "дыра " << hole.x << "," << hole.y;
			for (auto& side : sides)
			{
				Vec2I next = hole + side;
				if (next.x < 0 || next.x >= model.GetColumns() || next.y < 0 || next.y >= model.GetRows() || model.IsHole(next))
					continue;
				float width = FrameWidth(frame, TileRect(next.x, next.y), Vec2F((float)-side.x, (float)-side.y));
				EXPECT_NEAR(width, outer, 1.5f) << "рамка у дыры " << hole.x << "," << hole.y << " со стороны " << next.x << "," << next.y;
				rims++;
			}
		}
		EXPECT_GT(rims, 0);
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

// Подложка повторяет форму поля: дыры не рисуются, рамка обходит края дыр
TEST_F(WordFallFeaturesUI, BoardBackingFollowsTheFieldShape)
{
	SkipTutorials();
	mService->StartLevel(0); // первый уровень кампании — с дырами зубцами сверху и снизу
	AppTestDriver::Wait(0.8f);
	auto board = Screen()->GetChild("Board");
	EXPECT_FALSE(board->GetChild("Panel")) << "прямоугольной подложки со всеми клетками нет";
	Vector<Vec2I> holes = ExpectBackingFollowsShape();
	ASSERT_FALSE(holes.IsEmpty());

	Ref<Bitmap> frame = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(frame);
	ExpectEvenRimAroundHoles(frame, holes);
	EXPECT_TRUE(frame->Save(kScreenshotsDir + "41_board_shape.png", Bitmap::ImageType::Png));
}

// Форма с дырой внутри поля, дырой-уголком, столбиком в клетку и касанием клеток углами
TEST_F(WordFallFeaturesUI, BoardBackingFramesInnerHoles)
{
	SkipTutorials();
	o2Scripts.Eval("(function() { var svc = WordFallGame.service; var config = svc.GetLevelConfig(1);"
				   " config.holeCells = [[3, 4], [1, 2], [1, 1], [2, 1], [0, 3], [0, 5], [5, 6], [6, 5], [6, 0]]"
				   ".map(function(p) { return { c: p[0], r: p[1] }; });"
				   " svc.SetLevelConfig(1, config); })()");
	mService->StartLevel(1);
	AppTestDriver::Wait(0.8f);
	Vector<Vec2I> holes = ExpectBackingFollowsShape();
	EXPECT_EQ(holes.Count(), 9);
	Ref<Bitmap> frame = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(frame);
	ExpectEvenRimAroundHoles(frame, holes);
	EXPECT_TRUE(frame->Save(kScreenshotsDir + "42_board_inner_holes.png", Bitmap::ImageType::Png));
}

// Ящик стоит посередине своей картинки — на плитке он по центру клетки, а не выше
TEST_F(WordFallFeaturesUI, CrateArtIsCentredInItsSprite)
{
	for (const char* name : { "ui_crate", "ui_crate_cracked" })
	{
		Bitmap bitmap;
		ASSERT_TRUE(bitmap.Load(String::Format("../../Assets/WordFall/Sprites/%s.png", name))) << name;
		ASSERT_EQ(bitmap.GetFormat(), PixelFormat::R8G8B8A8) << name;
		Vec2I size = bitmap.GetSize();
		int left = size.x, right = -1, top = size.y, bottom = -1;
		for (int y = 0; y < size.y; y++)
		{
			for (int x = 0; x < size.x; x++)
			{
				if (bitmap.GetData()[(y*size.x + x)*4 + 3] <= 128)
					continue;
				left = Math::Min(left, x);
				right = Math::Max(right, x);
				top = Math::Min(top, y);
				bottom = Math::Max(bottom, y);
			}
		}
		EXPECT_LE(Math::Abs(left - (size.x - 1 - right)), 1) << name << ": поля слева и справа";
		EXPECT_LE(Math::Abs(top - (size.y - 1 - bottom)), 1) << name << ": поля сверху и снизу";
	}
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
	auto caption = Screen()->GetChild("Tutorial/Caption");
	auto glow = Screen()->GetChild("Tutorial/Dim/Glow0");
	ASSERT_TRUE(caption && glow);
	AppTestDriver::Wait(0.9f);
	for (int i = 0; i < 30 && !caption->IsEnabled(); i++) // под нагрузкой параллельного прогона шаг появляется позже
		AppTestDriver::Wait(0.1f);
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
	Click(AcceptPosition());
	AppTestDriver::Wait(2.5f);
	EXPECT_TRUE(mService->IsWordUsed("КОТ"));

	int moves = mService->GetMovesLeft();
	PlantKot();
	ClickTile(1, 0); ClickTile(2, 0); ClickTile(3, 0);
	Click(AcceptPosition());
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(mService->GetMovesLeft(), moves) << "дубль не тратит ход";
	EXPECT_TRUE(message->IsEnabled()) << "сообщение о дубле";
	RectF bar = DynamicCast<Widget>(Screen()->GetChild("Hud/ScorePanel/Bar"))->layout->GetWorldRect();
	EXPECT_TRUE(DynamicCast<Widget>(message)->layout->GetWorldRect().IsInside(bar.Center())) << "плашкой поверх полосы прогресса";
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
	EXPECT_FALSE(panel->IsEnabled()) << "короткий тап по невидимой кнопке ничего не открывает";
	AppTestDriver::Wait(0.5f); // иначе следующее нажатие o2 засчитает двойным кликом

	OpenCheats();
	EXPECT_TRUE(panel->IsEnabled());
	Shot("feature_cheats");

	// экран читов во весь экран: карточка выше большей части окна
	auto card = DynamicCast<Widget>(panel->GetChild("Card"));
	ASSERT_TRUE(card);
	EXPECT_GT(card->layout->GetWorldRect().Height(), 900.0f);

	SelectCheatsTab(5);
	EXPECT_TRUE(panel->GetChild("Content/Page5")->IsEnabled());
	EXPECT_FALSE(panel->GetChild("Content/Page0")->IsEnabled());

	SelectCheatsTab(1);
	EXPECT_TRUE(panel->GetChild("Content/Page1")->IsEnabled());
	EXPECT_FALSE(panel->GetChild("Content/Page5")->IsEnabled());

	int moves = mService->GetMovesLeft();
	Tap(panel->GetChild("Content/Page1/MovesBtn/Btn")); // +5 ходов
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
	Click(AcceptPosition());

	// буквы от бомбы появляются в момент взрыва, когда буквы слова уже долетели, —
	// считаются все плашки пула, побывавшие в полёте
	auto fx = Screen()->GetChild("Fx");
	bool flew[24] = {};
	bool shot = false;
	for (int i = 0; i < 150; i++)
	{
		AppTestDriver::Wait(0.02f);
		for (int k = 0; k < 24; k++)
		{
			auto letter = fx->GetChild(String::Format("FxLetter%i", k));
			if (letter && letter->IsEnabled())
				flew[k] = true;
		}
		if (flew[3] && !shot)
		{
			Shot("feature_bonus_letters");
			shot = true;
		}
	}
	int flown = 0;
	for (bool f : flew)
		flown += f ? 1 : 0;
	EXPECT_GT(flown, 3) << "кроме трёх букв слова летят буквы, выбитые бомбой";
	AppTestDriver::Wait(2.0f);
}
