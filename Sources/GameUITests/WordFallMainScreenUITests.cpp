#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

// Главный экран по вёрстке пайплайна: слова уровня — рядами плашек в отдельной панели (лишние — «ещё N»),
// прочие задачи — плашками с галочками, лоток слова всегда на экране, цвет плашек под буквами случайный и едет с плиткой
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
	String Objectives() { return Eval("JSON.stringify(WordFallViews.tasks.GetShownObjectives())"); }
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
	EXPECT_TRUE(tile->GetLayer("active")->IsEnabled()) << "набранный префикс ЛУ в синей рамке в слове ЛУНА";
	EXPECT_FALSE(tile->GetLayer("back")->IsEnabled());
	auto third = DynamicCast<Widget>(words->GetChild("W1_2"));
	EXPECT_FALSE(third->GetLayer("active")->IsEnabled()) << "дальше префикса — обычная плашка";
	EXPECT_TRUE(third->GetLayer("back")->IsEnabled());
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

TEST_F(WordFallMainScreenUI, ObjectivesArePlaquesWithChecksAndTheScoreGoal)
{
	o2Scripts.Eval("(function() { var c = WordFallGame.service.GetLevelConfig(0); c.words = ['КОТ']; c.wordsAuto = 0;"
				   " c.tasks = [{taskType: 'Letter', letter: 'О', count: 10}, {taskType: 'AnyWords', count: 2}, {taskType: 'Powerup', powerupKind: 'bomb', count: 1}];"
				   " c.targetScore = 10; WordFallGame.service.SetLevelConfig(0, c); WordFallGame.service.StartLevel(0); })()");
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(Objectives(), String("[{\"text\":\"Собрать 0/10\",\"symbol\":\"О\",\"image\":\"\",\"done\":false},"
								   "{\"text\":\"Найти слова: 0/2\",\"symbol\":\"\",\"image\":\"Generated/UI/Screen_Resources/Sprites/icon_search_small.png\",\"done\":false},"
								   "{\"text\":\"Бомба: 0/1\",\"symbol\":\"\",\"image\":\"WordFall/Sprites/powerup_bomb.png\",\"done\":false},"
								   "{\"text\":\"Набрать 10 очков\",\"symbol\":\"\",\"image\":\"Generated/UI/Screen_Resources/Sprites/icon_rainbow_star.png\",\"done\":false}]"))
		<< "три задачи и последней — цель по очкам, с радужной звездой, как у полосы прогресса";
	auto objectives = o2Scene.FindActor("WordFall")->GetChild("Screen/Tasks/Objectives");
	EXPECT_FALSE(objectives->GetChild("Item4")->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "33_objectives.png"));

	mService->DebugCompleteTasks();
	AppTestDriver::PumpFrames(3);
	EXPECT_TRUE(objectives->GetChild("Item0/Check")->IsEnabled()) << "закрытая задача — с галочкой";
	EXPECT_FALSE(objectives->GetChild("Item3/Check")->IsEnabled()) << "очков ещё нет";

	mService->DebugAddScore(10);
	AppTestDriver::PumpFrames(3);
	EXPECT_TRUE(objectives->GetChild("Item3/Check")->IsEnabled());
}

// Пять задач и цель по очкам — три ряда: плашки ужимаются и остаются в блоке, не налезая друг на друга
TEST_F(WordFallMainScreenUI, ManyTasksShrinkThePlaquesToFit)
{
	o2Scripts.Eval("(function() { var c = WordFallGame.service.GetLevelConfig(0); c.words = ['КОТ']; c.wordsAuto = 0;"
				   " c.tasks = [{taskType: 'Letter', letter: 'О', count: 3}, {taskType: 'AnyWords', count: 2}, {taskType: 'Length', length: 4, count: 2},"
				   " {taskType: 'WordScore', scoreThreshold: 15}, {taskType: 'Melt', count: 2}];"
				   " c.targetScore = 10; WordFallGame.service.SetLevelConfig(0, c); WordFallGame.service.StartLevel(0); })()");
	AppTestDriver::PumpFrames(3);
	auto objectives = DynamicCast<Widget>(o2Scene.FindActor("WordFall")->GetChild("Screen/Tasks/Objectives"));
	RectF block = objectives->layout->GetWorldRect();
	Vector<RectF> plaques;
	for (int i = 0; i < 6; i++)
	{
		auto item = DynamicCast<Widget>(objectives->GetChild(String::Format("Item%i", i)));
		ASSERT_TRUE(item->IsEnabled()) << i;
		RectF rect = item->layout->GetWorldRect();
		EXPECT_GE(rect.left, block.left - 0.5f) << i;
		EXPECT_LE(rect.right, block.right + 0.5f) << i;
		EXPECT_GE(rect.bottom, block.bottom - 0.5f) << i;
		EXPECT_LE(rect.top, block.top + 0.5f) << i;
		for (auto& other : plaques)
			EXPECT_FALSE(rect.left < other.right - 0.5f && other.left < rect.right - 0.5f &&
						 rect.bottom < other.top - 0.5f && other.bottom < rect.top - 0.5f) << i;
		plaques.Add(rect);
	}
	EXPECT_LT(plaques[0].Height(), 88.0f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "35_objectives_many.png"));
}

// Лоток слова всегда на экране: свой ряд между полосой прогресса и полем, выбранные буквы долетают в него
TEST_F(WordFallMainScreenUI, TrayStaysOnScreenBetweenProgressAndBoard)
{
	StartWithWords("[\"КОТ\"]");
	auto root = o2Scene.FindActor("WordFall");
	auto widget = [&](const char* path) { return DynamicCast<Widget>(root->GetChild(path)); };
	auto visible = [](const Ref<Widget>& w) { return w->IsEnabledInHierarchy() && w->GetResTransparency() > 0.99f; };
	auto progress = widget("Screen/Hud/ScorePanel");
	auto tray = widget("Screen/WordBar/Tray");
	auto accept = widget("Screen/WordBar/AcceptBtn");
	auto clear = widget("Screen/WordBar/ClearBtn");
	auto expectTrayShown = [&](const char* when) {
		EXPECT_TRUE(visible(tray)) << when;
		EXPECT_TRUE(visible(accept)) << when;
		EXPECT_TRUE(visible(clear)) << when;
		EXPECT_TRUE(visible(progress)) << when;
	};
	expectTrayShown("без выбора");

	RectF row = widget("Screen/WordBar")->layout->GetWorldRect();
	RectF progressRect = progress->layout->GetWorldRect();
	RectF board = BoardFrameRect(AppTestDriver::TakeScreenshot());
	EXPECT_LE(row.top, progressRect.bottom) << "лоток — под полосой прогресса";
	EXPECT_GE(row.bottom, board.top) << "и над полем";
	EXPECT_LE(accept->layout->GetWorldRect().right, row.right + 0.5f);
	EXPECT_LE(tray->layout->GetWorldRect().right, accept->layout->GetWorldRect().left);

	PlantWord("КОТ");
	ClickTile(1, 0);
	ClickTile(2, 0);
	AppTestDriver::Wait(0.5f);
	expectTrayShown("с выбором");
	auto slot = widget("Screen/WordBar/Tray/Slot1");
	EXPECT_TRUE(slot->IsEnabled());
	EXPECT_TRUE(tray->layout->GetWorldRect().IsInside(slot->layout->GetWorldRect().Center())) << "буквы долетели в лоток";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "36_tray_on_screen.png"));

	Click(ClearPosition());
	AppTestDriver::Wait(0.3f);
	expectTrayShown("после сброса");
	EXPECT_FALSE(slot->IsEnabled());

	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);
	AppTestDriver::Wait(0.5f);
	Click(AcceptPosition());
	AppTestDriver::Wait(0.3f);
	expectTrayShown("после слова");
	EXPECT_TRUE(mService->IsWordUsed("КОТ"));
}

// Подсказка прицела бустера — плашкой поверх поля лотка, только пока идёт прицел
TEST_F(WordFallMainScreenUI, AimPromptCoversTheTrayField)
{
	StartWithWords("[\"КОТ\"]");
	auto root = o2Scene.FindActor("WordFall");
	auto mode = DynamicCast<Widget>(root->GetChild("Screen/Boosters/ModeLabel"));
	auto tray = DynamicCast<Widget>(root->GetChild("Screen/WordBar/Tray"));
	EXPECT_FALSE(mode->IsEnabledInHierarchy());

	Click(BoosterPosition(0)); // молоток — режим прицела
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(mode->IsEnabledInHierarchy());
	RectF field = tray->layout->GetWorldRect(), prompt = mode->layout->GetWorldRect();
	EXPECT_NEAR(prompt.left, field.left, 1.0f);
	EXPECT_NEAR(prompt.right, field.right, 1.0f);
	EXPECT_NEAR(prompt.Center().y, field.Center().y, 1.0f);
	EXPECT_GT(mode->GetDrawingDepth(), DynamicCast<Widget>(root->GetChild("Screen/WordBar/Tray/Slot0"))->GetDrawingDepth());

	Click(BoosterPosition(0)); // повторный клик — отмена прицела
	AppTestDriver::PumpFrames(2);
	EXPECT_FALSE(mode->IsEnabledInHierarchy());
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

// Мировые прямоугольники узлов вёрстки пайплайна (Generated/UI/Screen.proto) по пути имён: центр экрана — (0, 0), y вверх
class PipelineLayout
{
public:
	explicit PipelineLayout(const String& path)
	{
		if (mDocument.LoadFromFile(path))
			Walk(mDocument["mActor"], RectF(), "");
	}

	bool IsLoaded() const { return mRects.Count() > 0; }
	RectF Get(const String& path) const { RectF rect; mRects.TryGetValue(path, rect); return rect; }

private:
	DataDocument     mDocument;
	Map<String, RectF> mRects;

	static float Field(const DataValue& value, const char* name)
	{
		auto member = value.FindMember(name);
		return member ? (float)*member : 0.0f;
	}

	static Vec2F Point(const DataValue& transform, const char* name)
	{
		auto member = transform.FindMember(name);
		return member ? Vec2F(Field(*member, "x"), Field(*member, "y")) : Vec2F();
	}

	void Walk(const DataValue& node, const RectF& parent, const String& path)
	{
		auto data = node.FindMember("Data");
		if (!data)
			data = node.FindMember("Value");

		Vec2F anchorMin, anchorMax, offsetMin, offsetMax;
		if (auto transform = data->FindMember("Transform"))
		{
			anchorMin = Point(*transform, "anchorMin");
			anchorMax = Point(*transform, "anchorMax");
			offsetMin = Point(*transform, "offsetMin");
			offsetMax = Point(*transform, "offsetMax");
		}
		Vec2F size(parent.right - parent.left, parent.top - parent.bottom);
		RectF rect;
		rect.left = parent.left + anchorMin.x*size.x + offsetMin.x;
		rect.bottom = parent.bottom + anchorMin.y*size.y + offsetMin.y;
		rect.right = parent.left + anchorMax.x*size.x + offsetMax.x;
		rect.top = parent.bottom + anchorMax.y*size.y + offsetMax.y;
		mRects.Add(path, rect);

		if (auto children = data->FindMember("Children"))
		{
			for (int i = 0; i < children->GetElementsCount(); i++)
			{
				auto& item = children->GetElement(i);
				auto itemData = item.FindMember("Data");
				if (!itemData)
					itemData = item.FindMember("Value");
				String name = (String)(*itemData)["mName"];
				Walk(item, rect, path.IsEmpty() ? name : path + "/" + name);
			}
		}
	}
};

// Экран в состоянии макета (мок поля, слов, задач и счёта) — вёрстка пайплайна «Wordfall main» (Generated/UI/Screen.proto),
// уплотнённая по вертикали: блок слов чуть меньше, свой ряд у лотка, поле над уменьшенными бустерами; снимок — для сравнения с превью
TEST_F(WordFallMainScreenUI, ScreenFollowsThePipelineLayout)
{
	PipelineLayout layout("../../Assets/Generated/UI/Screen.proto");
	ASSERT_TRUE(layout.IsLoaded());
	String mock = o2FileSystem.ReadFile("../../Sources/GameUITests/Data/wordfall_layout_mock.json");
	ASSERT_FALSE(mock.IsEmpty());
	o2Scripts.Eval("WordFallGame.service.DebugApplyMock(" + mock + ")");
	o2Scripts.Eval("WordFallViews.hud.scorePrefix = 'Progress: '");
	auto root = o2Scene.FindActor("WordFall");
	DynamicCast<Label>(root->GetChild("Screen/Hud/MovesBox/Caption"))->SetText("Moves Left:");
	AppTestDriver::PumpFrames(5);
	o2Scripts.Eval("WordFallViews.hud.SnapScore()");
	AppTestDriver::PumpFrames(2);

	auto rectOf = [&](const String& path) {
		auto widget = DynamicCast<Widget>(root->GetChild(path));
		EXPECT_TRUE(widget) << path.Data();
		return widget ? widget->layout->GetWorldRect() : RectF();
	};
	// раздел сдвинут по вертикали целиком: по горизонтали и по размерам его узлы — как в вёрстке
	auto expectShifted = [&](const String& path, const String& layoutPath, float shift) {
		RectF rect = rectOf(path), expected = layout.Get(layoutPath);
		EXPECT_NEAR(rect.left, expected.left, 1.5f) << path.Data() << " ~ " << layoutPath.Data();
		EXPECT_NEAR(rect.right, expected.right, 1.5f) << path.Data() << " ~ " << layoutPath.Data();
		EXPECT_NEAR(rect.top, expected.top + shift, 1.5f) << path.Data() << " ~ " << layoutPath.Data();
		EXPECT_NEAR(rect.bottom, expected.bottom + shift, 1.5f) << path.Data() << " ~ " << layoutPath.Data();
	};
	auto shiftOf = [&](const String& path, const String& layoutPath) { return rectOf(path).top - layout.Get(layoutPath).top; };

	expectShifted("Screen", "", 0.0f);
	float shift = shiftOf("Screen/Tasks/Objectives", "objectives");
	expectShifted("Screen/Tasks/Objectives", "objectives", shift);
	expectShifted("Screen/Tasks/Objectives/Item0", "objectives/collect", shift);
	expectShifted("Screen/Tasks/Objectives/Item0/Checkbox", "objectives/collect/checkbox", shift);
	expectShifted("Screen/Tasks/Objectives/Item0/Check", "objectives/collect/check", shift);
	expectShifted("Screen/Tasks/Objectives/Item1", "objectives/bonus", shift);
	expectShifted("Screen/Tasks/Objectives/Item1/Icon", "objectives/bonus/icon", shift);
	expectShifted("Screen/Tasks/Objectives/Item2", "objectives/find", shift);
	expectShifted("Screen/Tasks/Objectives/Item3", "objectives/score", shift);
	shift = shiftOf("Screen/Hud/ScorePanel/Star", "star");
	expectShifted("Screen/Hud/ScorePanel/Star", "star", shift);
	expectShifted("Screen/Hud/ScorePanel/Bar", "progress/track", shift);
	shift = shiftOf("Screen/Board/Tile_0_7", "letters/r0c0");
	expectShifted("Screen/Board/Tile_0_7", "letters/r0c0", shift);
	expectShifted("Screen/Board/Tile_6_0", "letters/r7c6", shift);
	expectShifted("Screen/Board/Tile_3_4", "letters/r3c3", shift);

	// блок слов чуть меньше вёрстки, в тех же пропорциях; плашка ходов справа забирает освободившуюся ширину
	RectF words = rectOf("Screen/Tasks/Words"), layoutWords = layout.Get("word_board");
	float k = words.Height()/layoutWords.Height();
	EXPECT_GT(k, 0.85f);
	EXPECT_LT(k, 0.97f);
	EXPECT_NEAR(words.left, layoutWords.left, 1.5f);
	EXPECT_NEAR(words.Width(), layoutWords.Width()*k, 1.5f);
	auto expectScaled = [&](const String& path, const String& layoutPath) {
		RectF rect = rectOf(path), expected = layout.Get(layoutPath);
		EXPECT_NEAR(rect.left - words.left, (expected.left - layoutWords.left)*k, 1.5f) << path.Data();
		EXPECT_NEAR(words.top - rect.top, (layoutWords.top - expected.top)*k, 1.5f) << path.Data();
		EXPECT_NEAR(rect.Width(), expected.Width()*k, 1.5f) << path.Data();
		EXPECT_NEAR(rect.Height(), expected.Height()*k, 1.5f) << path.Data();
	};
	expectScaled("Screen/Tasks/Words/W0_0", "words/puzzle/p");
	expectScaled("Screen/Tasks/Words/W1_2", "words/brain/a");
	expectScaled("Screen/Tasks/Words/W3_6", "words/connect/t");
	RectF moves = rectOf("Screen/Hud/MovesBox"), layoutMoves = layout.Get("moves");
	EXPECT_NEAR(moves.right, layoutMoves.right, 1.5f);
	EXPECT_NEAR(moves.left - words.right, layoutMoves.left - layoutWords.right, 1.5f);
	EXPECT_NEAR(rectOf("Screen/Hud/MovesBox/Value").Center().x, moves.Center().x, 1.5f);

	// разделы сверху вниз с короткими зазорами, лоток — своим рядом между прогрессом и полем
	Ref<Bitmap> shot = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(shot);
	RectF screen = rectOf("Screen");
	RectF boosters = rectOf("Screen/Boosters/Booster0");
	for (int i = 1; i < 5; i++)
		boosters = boosters.Expand(rectOf(String::Format("Screen/Boosters/Booster%i", i)));
	struct Section { const char* name; RectF rect; };
	Section sections[] = { { "слова", words }, { "задачи", rectOf("Screen/Tasks/Objectives") },
						   { "прогресс", rectOf("Screen/Hud/ScorePanel") }, { "лоток", rectOf("Screen/WordBar") },
						   { "поле", BoardFrameRect(shot) }, { "бустеры", boosters } };
	EXPECT_LE(screen.top - words.top, 16.0f);
	for (int i = 1; i < 6; i++)
	{
		float gap = sections[i - 1].rect.bottom - sections[i].rect.top;
		EXPECT_GE(gap, 4.0f) << sections[i - 1].name << " / " << sections[i].name;
		EXPECT_LE(gap, 14.0f) << sections[i - 1].name << " / " << sections[i].name;
	}
	EXPECT_GE(boosters.bottom - screen.bottom, 8.0f);
	EXPECT_LE(boosters.bottom - screen.bottom, 40.0f);

	// рамка поля одной толщины со всех сторон
	RectF topLeft = rectOf("Screen/Board/Tile_0_7"), bottomRight = rectOf("Screen/Board/Tile_6_0");
	float frameTop = FrameWidth(shot, topLeft, Vec2F(0, 1)), frameLeft = FrameWidth(shot, topLeft, Vec2F(-1, 0));
	float frameBottom = FrameWidth(shot, bottomRight, Vec2F(0, -1)), frameRight = FrameWidth(shot, bottomRight, Vec2F(1, 0));
	EXPECT_NEAR(frameBottom, frameTop, 1.5f);
	EXPECT_NEAR(frameBottom, frameLeft, 1.5f);
	EXPECT_NEAR(frameBottom, frameRight, 1.5f);

	// бустеры меньше кнопок вёрстки, на тех же местах по горизонтали
	const char* buttons[][2] = { { "Booster0", "toolbar/search" }, { "Booster4", "toolbar/search_plus" },
								 { "Booster2", "toolbar/hint_blue" }, { "Booster3", "toolbar/hint_gold" },
								 { "Booster1", "toolbar/shuffle" } };
	for (auto& button : buttons)
	{
		RectF rect = rectOf(String("Screen/Boosters/") + button[0]), expected = layout.Get(button[1]);
		EXPECT_NEAR(rect.Center().x, expected.Center().x, 1.5f) << button[0];
		EXPECT_LT(rect.Width(), expected.Width()*0.9f) << button[0];
		EXPECT_GT(rect.Width(), expected.Width()*0.7f) << button[0];
		EXPECT_NEAR(rect.Height()/rect.Width(), expected.Height()/expected.Width(), 0.01f) << button[0];
	}

	auto wordTiles = root->GetChild("Screen/Tasks/Words");
	EXPECT_TRUE(DynamicCast<Widget>(wordTiles->GetChild("W0_2"))->GetLayer("found")->IsEnabled()) << "найденная буква — оранжевая";
	EXPECT_TRUE(DynamicCast<Widget>(wordTiles->GetChild("W1_2"))->GetLayer("active")->IsEnabled()) << "набираемая — в синей рамке";
	EXPECT_TRUE(DynamicCast<Widget>(wordTiles->GetChild("W0_0"))->GetLayer("back")->IsEnabled());
	EXPECT_FALSE(root->GetChild("Screen/Board/Tile_3_6")->IsEnabled()) << "пустая клетка макета — видно гнездо подложки";
	EXPECT_TRUE(root->GetChild("Screen/Tasks/Objectives/Item0/Check")->IsEnabled());
	for (int i = 0; i < 4; i++)
	{
		auto label = DynamicCast<Widget>(root->GetChild(String::Format("Screen/Tasks/Objectives/Item%i/Label", i)));
		EXPECT_LE(label->GetLayerDrawable<Text>("text")->GetRealSize().x, label->layout->GetWorldRect().Width() + 1.0f)
			<< "подпись задачи " << i << " переносится по словам и не вылезает за плашку";
	}

	// фон одноцветный, как на референсе: поля экрана по краям и над/под разделами — одного цвета
	Ref<Bitmap> frame = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(frame);
	auto pixel = [&](const Vec2F& world) { return ScreenPixel(frame, world); };
	const Color4 paper(240, 214, 179, 255);
	Vector<Vec2F> points = { Vec2F(0, screen.top - 6), Vec2F(0, screen.bottom + 10) };
	for (float y = -850; y <= 850; y += 100)
	{
		points.Add(Vec2F(screen.left + 5, y));
		points.Add(Vec2F(screen.right - 5, y));
	}
	for (auto& point : points)
	{
		Color4 color = pixel(point);
		EXPECT_NEAR(color.r, paper.r, 4) << point.x << ", " << point.y;
		EXPECT_NEAR(color.g, paper.g, 4) << point.x << ", " << point.y;
		EXPECT_NEAR(color.b, paper.b, 4) << point.x << ", " << point.y;
	}
	EXPECT_TRUE(frame->Save(kScreenshotsDir + "40_layout_screen.png", Bitmap::ImageType::Png));
}
