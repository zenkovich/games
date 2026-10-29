#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

#include "o2/Render/Text.h"
#include "o2/Scene/UI/Widgets/VerticalScrollBar.h"

// Редактор уровней: отдельный экран из читов. Уровни с id и именами, список с бегунком, поле
// правится инструментами (ЛКМ — поставить, ПКМ — убрать, колесо — прочность ящика), «назад /
// вперёд», слова уровня и агент подбора, задачи с выбором типа иконками, файлы и импорт поля
// из «три в ряд»; правки уходят в сервис и файл, «Играть» стартует уровень на игровом экране
class WordFallLevelEditorUI: public WordFallUI
{
protected:
	Ref<Actor> Game() { return o2Scene.FindActor("WordFall"); }
	Ref<Actor> Editor() { return o2Scene.FindActor("LevelEditor"); }
	Ref<Actor> Screen() { return Editor()->GetChild("Screen"); }

	Vec2F CenterOf(const Ref<Actor>& actor)
	{
		auto widget = DynamicCast<Widget>(actor);
		EXPECT_TRUE(widget);
		return widget ? widget->layout->GetWorldRect().Center() : Vec2F();
	}

	void Tap(const Ref<Actor>& actor)
	{
		ASSERT_TRUE(actor);
		Click(CenterOf(actor));
		AppTestDriver::PumpFrames(3);
	}

	void Tap(const String& path) { Tap(Screen()->GetChild(path)); }

	void RightTap(const String& path)
	{
		AppTestDriver::RightClick(ToWindow(CenterOf(Screen()->GetChild(path))));
		AppTestDriver::PumpFrames(2);
	}

	void Wheel(const String& path, float delta)
	{
		AppTestDriver::Scroll(ToWindow(CenterOf(Screen()->GetChild(path))), delta);
		AppTestDriver::PumpFrames(2);
	}

	void OpenEditor()
	{
		auto screen = Game()->GetChild("Screen");
		Tap(screen->GetChild("Cheats/Toggle"));
		Tap(screen->GetChild("Cheats/Panel/EditorBtn/Btn"));
		AppTestDriver::PumpFrames(5);
	}

	String Eval(const String& code) { return o2Scripts.Eval(code).ToString(); }
	int EvalInt(const String& code) { return o2Scripts.Eval(code).GetValue<int>(); }
	int Index() { return EvalInt("WordFallViews.levelEditor.GetLevelIndex()"); }

	String LevelField(int index, const char* field)
	{
		return Eval(String::Format("JSON.stringify(WordFallGame.service.GetLevelConfig(%i).%s)", index, field));
	}

	String Cell(int index, int c, int r)
	{
		return Eval(String::Format("JSON.stringify(new WordFallLevelDraft(WordFallGame.service.GetLevelConfig(%i), 7, 8).GetCell({c: %i, r: %i}))", index, c, r));
	}

	String Caption(const String& path)
	{
		auto button = DynamicCast<Button>(Screen()->GetChild(path));
		return button ? String(button->GetCaption()) : String();
	}

	String Text(const String& path)
	{
		auto label = DynamicCast<Label>(Screen()->GetChild(path));
		return label ? String(label->GetText()) : String();
	}
};

TEST_F(WordFallLevelEditorUI, OpensFromCheatsAsASeparateScreen)
{
	OpenEditor();
	auto editor = Editor();
	ASSERT_TRUE(editor);
	EXPECT_TRUE(editor->IsEnabled());
	EXPECT_FALSE(Game()->IsEnabled()) << "игровой экран спрятан за редактором";
	EXPECT_EQ(Caption("LevelPick/Btn"), String("1/100 · L001"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15_level_editor.png"));

	Tap("NextBtn/Btn");
	EXPECT_EQ(Caption("LevelPick/Btn"), String("2/100 · L002"));

	Tap("CloseBtn/Btn");
	EXPECT_FALSE(editor->IsEnabled());
	EXPECT_TRUE(Game()->IsEnabled());
	EXPECT_EQ(mService->GetLevelIndex(), 0) << "просмотр уровня в редакторе игру не переключает";
}

// Одна кнопка клетки: левый клик добавляет, правый убирает; правый клик снимает и любой элемент
TEST_F(WordFallLevelEditorUI, LeftClickPlacesRightClickRemoves)
{
	OpenEditor();
	int index = Index();
	int movesBefore = mService->GetLevelConfigMoves(index);

	Tap("Tools/Tool_cell");
	RightTap("Board/Tile_0_0");
	EXPECT_NE(LevelField(index, "holeCells").Find("{\"c\":0,\"r\":0}"), -1) << "ПКМ инструментом клетки — дыра";
	EXPECT_FALSE(Screen()->GetChild("Board/CellBack_0_0")->IsEnabled());
	Tap("Board/Tile_0_0");
	EXPECT_EQ(LevelField(index, "holeCells").Find("{\"c\":0,\"r\":0}"), -1) << "ЛКМ возвращает клетку";
	RightTap("Board/Tile_0_0");

	Tap("Tools/Tool_ice");
	Tap("Board/Tile_2_3");
	EXPECT_EQ(Cell(index, 2, 3), String("{\"hole\":false,\"letter\":\"\",\"overlay\":\"ice\",\"crate\":0,\"item\":\"\"}"));
	Tap("Tools/Tool_bomb");
	Tap("Board/Tile_6_7");
	RightTap("Board/Tile_2_3");
	EXPECT_EQ(Cell(index, 2, 3), String("{\"hole\":false,\"letter\":\"\",\"overlay\":\"\",\"crate\":0,\"item\":\"\"}")) << "бомбой ПКМ снят лёд — верхний элемент";

	// буква выбирается в палитре, снимается правым кликом
	Tap("Tools/Tool_letter");
	Tap("Board/Tile_3_3");
	auto palette = Screen()->GetChild("Palette");
	EXPECT_TRUE(palette->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15d_level_editor_palette.png"));
	Tap(palette->GetChild("Letter10")); // К
	EXPECT_FALSE(palette->IsEnabled());
	EXPECT_EQ(LevelField(index, "letterCells"), String("[{\"c\":3,\"r\":3,\"letter\":\"К\"}]"));
	Tap("Board/Tile_4_4");
	Tap(palette->GetChild("Letter0")); // А
	RightTap("Board/Tile_4_4");
	EXPECT_EQ(LevelField(index, "letterCells"), String("[{\"c\":3,\"r\":3,\"letter\":\"К\"}]")) << "ПКМ снимает заданную букву";

	Tap("MovesPlus/Btn");
	Tap("MovesPlus/Btn"); // быстрый повторный тап тоже считается
	Tap("Charge0/Btn"); // 3 -> 5
	EXPECT_TRUE(o2FileSystem.IsFileExist(kTestLevelsPath)) << "правки сохранены в файл";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15b_level_editor_edited.png"));

	Tap("PlayBtn/Btn");
	AppTestDriver::PumpFrames(5);
	EXPECT_TRUE(Game()->IsEnabled());
	EXPECT_FALSE(Editor()->IsEnabled());
	EXPECT_EQ(mService->GetLevelIndex(), index);
	EXPECT_EQ(mService->GetMovesLeft(), movesBefore + 2);
	EXPECT_EQ(mService->GetBoosterCharges(0), 5);
	auto& board = mService->GetLevel().GetBoard();
	EXPECT_TRUE(board.IsHole(Vec2I(0, 0)));
	EXPECT_EQ(board.GetTile(Vec2I(3, 3)).letter, WString("К"));
	EXPECT_EQ(board.GetTile(Vec2I(6, 7)).powerup, WString("bomb"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15c_level_editor_play.png"));

	OpenEditor();
	Tap("ResetBtn/Btn");
	EXPECT_EQ(LevelField(index, "letterCells"), String("[]"));
	EXPECT_EQ(LevelField(index, "moves"), (String)movesBefore);
	EXPECT_FALSE(o2FileSystem.IsFileExist(kTestLevelsPath)) << "без правок файла нет";
}

// Колесо над инструментом ящика — прочность кисти, ящики ставятся подряд с ней; колесо над
// ящиком на поле — прочность этого ящика
TEST_F(WordFallLevelEditorUI, MouseWheelSetsCrateGrade)
{
	OpenEditor();
	int index = Index();
	Tap("Tools/Tool_crate");
	EXPECT_EQ(EvalInt("WordFallViews.levelEditor.GetCrateGrade()"), 1);
	Wheel("Tools/Tool_crate", 1.0f);
	Wheel("Tools/Tool_crate", 1.0f);
	EXPECT_EQ(EvalInt("WordFallViews.levelEditor.GetCrateGrade()"), 3);
	EXPECT_NE(Text("ToolLabel").Find("прочность 3"), -1) << Text("ToolLabel").Data();

	Tap("Board/Tile_1_1");
	Tap("Board/Tile_2_1");
	Tap("Board/Tile_3_1");
	EXPECT_EQ(LevelField(index, "crateGrades"), String("[3,3,3]")) << "три ящика прочности 3 подряд";

	Wheel("Board/Tile_2_1", -1.0f);
	EXPECT_EQ(LevelField(index, "crateGrades"), String("[3,2,3]"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "16_editor_crate_wheel.png"));
	RightTap("Board/Tile_3_1");
	EXPECT_EQ(LevelField(index, "crateGrades"), String("[3,2]"));
}

TEST_F(WordFallLevelEditorUI, UndoAndRedoStepThroughEdits)
{
	OpenEditor();
	int index = Index();
	String initial = LevelField(index, "iceCells");
	EXPECT_LT(DynamicCast<Widget>(Screen()->GetChild("UndoBtn"))->GetTransparency(), 0.5f) << "назад некуда — кнопка бледная";

	Tap("Tools/Tool_stone");
	Tap("Board/Tile_0_1");
	Tap("Board/Tile_1_1");
	Tap("Board/Tile_2_1");
	Tap("MovesPlus/Btn");
	EXPECT_EQ(LevelField(index, "stoneCells"), String("[{\"c\":0,\"r\":1},{\"c\":1,\"r\":1},{\"c\":2,\"r\":1}]"));

	Tap("UndoBtn/Btn");
	Tap("UndoBtn/Btn");
	EXPECT_EQ(LevelField(index, "stoneCells"), String("[{\"c\":0,\"r\":1},{\"c\":1,\"r\":1}]")) << "два шага назад: ходы и третий камень";
	Tap("RedoBtn/Btn");
	EXPECT_EQ(LevelField(index, "stoneCells"), String("[{\"c\":0,\"r\":1},{\"c\":1,\"r\":1},{\"c\":2,\"r\":1}]"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "17_editor_undo.png"));

	for (int i = 0; i < 5; i++)
		Tap("UndoBtn/Btn");
	EXPECT_EQ(LevelField(index, "stoneCells"), String("[]"));
	EXPECT_FALSE(o2FileSystem.IsFileExist(kTestLevelsPath)) << "все правки откачены — файла правок нет";

	// уровень можно сменить: шаг назад возвращает к уровню правки
	Tap("Board/Tile_5_5");
	Tap("NextBtn/Btn");
	Tap("UndoBtn/Btn");
	EXPECT_EQ(Index(), index);
	EXPECT_EQ(LevelField(index, "stoneCells"), String("[]"));
}

// Список уровней: колесо по строкам, бегунок для дальних переходов, тап — открыть уровень
TEST_F(WordFallLevelEditorUI, LevelListJumpsWithTheSlider)
{
	OpenEditor();
	Tap("LevelPick/Btn");
	auto levels = Screen()->GetChild("Levels");
	ASSERT_TRUE(levels->IsEnabled());
	EXPECT_EQ(EvalInt("WordFallViews.levelEditor.GetListFirst()"), 0);
	EXPECT_NE(Caption("Levels/LevelRow0/Btn").Find("> 1. L001"), -1) << Caption("Levels/LevelRow0/Btn").Data();

	Wheel("Levels/LevelRow3", -1.0f);
	Wheel("Levels/LevelRow3", -1.0f);
	EXPECT_EQ(EvalInt("WordFallViews.levelEditor.GetListFirst()"), 2) << "колесо крутит список";

	// бегунок: тянем ручку в самый низ — конец кампании
	auto scroll = DynamicCast<VerticalScrollBar>(levels->GetChild("LevelsScroll"));
	ASSERT_TRUE(scroll);
	auto rect = scroll->layout->GetWorldRect();
	Vec2F handle(rect.Center().x, rect.top - rect.Height()*0.02f - 30.0f);
	AppTestDriver::Drag(ToWindow(handle), ToWindow(Vec2F(rect.Center().x, rect.bottom - 10.0f)), 16);
	AppTestDriver::PumpFrames(30);
	EXPECT_EQ(EvalInt("WordFallViews.levelEditor.GetListFirst()"), 100 - 12) << "одним движением — к последним уровням";
	EXPECT_NE(Caption("Levels/LevelRow11/Btn").Find("100. L100"), -1) << Caption("Levels/LevelRow11/Btn").Data();
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "18_editor_level_list.png"));

	Tap("Levels/LevelRow11/Btn");
	EXPECT_FALSE(levels->IsEnabled());
	EXPECT_EQ(Index(), 99);
	EXPECT_EQ(Caption("LevelPick/Btn"), String("100/100 · L100"));
}

// Структура кампании: новый, копия, перестановка, удаление, имя; id едет с уровнем, шаг назад всё возвращает
TEST_F(WordFallLevelEditorUI, LevelsAreCreatedCopiedMovedRenamedAndDeleted)
{
	OpenEditor();
	Tap("NewBtn/Btn");
	EXPECT_EQ(Index(), 1);
	EXPECT_EQ(Caption("LevelPick/Btn"), String("2/101 · L101"));
	EXPECT_TRUE(o2Scripts.Eval("WordFallGame.service.IsLevelNew(1)").ToBool());

	// имя набирается в палитре: буквы, цифры, пробел
	Tap("RenameBtn/Btn");
	auto palette = Screen()->GetChild("Palette");
	EXPECT_TRUE(palette->IsEnabled());
	EXPECT_TRUE(palette->GetChild("Key1")->IsEnabled()) << "для имени видны цифры";
	Tap(palette->GetChild("Letter11")); // Л
	Tap(palette->GetChild("Letter4"));  // Д
	Tap(palette->GetChild("Key10"));    // пробел
	Tap(palette->GetChild("Key2"));     // 2
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "19_editor_rename.png"));
	Tap(palette->GetChild("CancelBtn/Btn")); // готово
	EXPECT_EQ(Caption("LevelPick/Btn"), String("2/101 · L101 · ЛД 2"));

	Tap("CopyBtn/Btn");
	EXPECT_EQ(Caption("LevelPick/Btn"), String("3/102 · L102 · ЛД 2 копия"));
	Tap("UpBtn/Btn");
	EXPECT_EQ(Caption("LevelPick/Btn"), String("2/102 · L102 · ЛД 2 копия")) << "копия поднялась выше оригинала";
	EXPECT_EQ(Eval("WordFallGame.service.GetLevelId(2)"), String("L101"));

	Tap("DeleteBtn/Btn");
	EXPECT_EQ(EvalInt("WordFallGame.service.GetLevelCount()"), 101);
	EXPECT_EQ(Eval("WordFallGame.service.GetLevelId(1)"), String("L101"));

	Tap("UndoBtn/Btn");
	EXPECT_EQ(EvalInt("WordFallGame.service.GetLevelCount()"), 102) << "удаление отменяется";
	EXPECT_EQ(Eval("WordFallGame.service.GetLevelId(1)"), String("L102"));

	// новый уровень после перезапуска на месте, с именем
	auto saved = Eval("JSON.stringify(JSON.parse(o2.FileSystem.ReadFile('" + kTestLevelsPath + "')).order.slice(0, 3))");
	EXPECT_EQ(saved, String("[\"L001\",\"L102\",\"L101\"]"));
}

// Тип задачи — сеткой иконок; все задачи видны на основном экране редактора
TEST_F(WordFallLevelEditorUI, TaskTypesArePickedFromIconsAndAllTasksStayVisible)
{
	OpenEditor();
	int index = Index();
	o2Scripts.Eval(String::Format("(function() { var c = WordFallGame.service.GetLevelConfig(%i); c.tasks = []; WordFallGame.service.SetLevelConfig(%i, c); WordFallViews.levelEditor.Open(%i); })()", index, index, index));
	AppTestDriver::PumpFrames(2);

	Tap("TasksBtn/Btn");
	auto tasks = Screen()->GetChild("Tasks");
	ASSERT_TRUE(tasks->IsEnabled());
	const char* types[5] = { "Crates", "Letter", "Deliver", "Melt", "Powerup" };
	for (auto type : types)
	{
		Tap("Tasks/AddTaskBtn/Btn");
		auto picker = Screen()->GetChild("TypePicker");
		ASSERT_TRUE(picker->IsEnabled()) << "новая задача начинается с выбора типа";
		Tap(picker->GetChild(String("Type") + type + "/Btn"));
		EXPECT_FALSE(picker->IsEnabled());
	}
	EXPECT_EQ(LevelField(index, "tasks.map(function(t) { return t.taskType; })"), String("[\"Crates\",\"Letter\",\"Deliver\",\"Melt\",\"Powerup\"]"));
	EXPECT_TRUE(tasks->GetChild("Task1IconLetter")->IsEnabled()) << "у строки задачи — иконка её типа";
	EXPECT_FALSE(tasks->GetChild("Task1IconCrates")->IsEnabled());
	EXPECT_FALSE(tasks->GetChild("AddTaskBtn")->IsEnabled()) << "лимит пять задач";

	// смена типа существующей задачи — тем же выбором
	Tap("Tasks/Task0Type/Btn");
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15f_level_editor_tasks.png"));
	Tap("TypePicker/TypeAnyWords/Btn");
	EXPECT_EQ(LevelField(index, "tasks[0].taskType"), String("\"AnyWords\""));
	Tap("Tasks/Task0BPlus/Btn");
	EXPECT_EQ(LevelField(index, "tasks[0].count"), String("2"));
	Tap("Tasks/TasksDoneBtn/Btn");

	// пять задач — пять строк в своём блоке, ни одна не уходит под кнопки
	auto panel = DynamicCast<Widget>(Screen()->GetChild("TasksPanel"));
	for (int i = 0; i < 5; i++)
	{
		auto line = DynamicCast<Widget>(Screen()->GetChild(String::Format("TaskLine%i", i)));
		EXPECT_FALSE(Text(String::Format("TaskLine%i", i)).IsEmpty()) << i;
		EXPECT_TRUE(panel->layout->GetWorldRect().IsInside(line->layout->GetWorldRect().Center())) << i;
	}
	EXPECT_NE(Text("TaskLine4").Find("Бомба"), -1) << Text("TaskLine4").Data();
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "20_editor_all_tasks.png"));
}

// Слова уровня: вручную через палитру, агент подбирает по сложности/числу/длине; не влезшие — «ещё N»
TEST_F(WordFallLevelEditorUI, WordsBlockTakesManualWordsAndTheAgent)
{
	OpenEditor();
	int index = Index();
	o2Scripts.Eval(String::Format("(function() { var c = WordFallGame.service.GetLevelConfig(%i); c.words = []; c.wordsAuto = 0; WordFallGame.service.SetLevelConfig(%i, c); WordFallViews.levelEditor.Open(%i); })()", index, index, index));
	AppTestDriver::PumpFrames(2);

	Tap("WordsBtn/Btn");
	auto words = Screen()->GetChild("Words");
	ASSERT_TRUE(words->IsEnabled());
	auto palette = Screen()->GetChild("Palette");
	const int kot[3] = { 10, 14, 18 }, dom[3] = { 4, 14, 12 }; // К О Т, Д О М
	for (auto letters : { kot, dom })
	{
		Tap("Words/AddWordBtn/Btn");
		ASSERT_TRUE(palette->IsEnabled());
		for (int i = 0; i < 3; i++)
			Tap(palette->GetChild(String::Format("Letter%i", letters[i])));
		Tap(palette->GetChild("CancelBtn/Btn")); // готово
	}
	EXPECT_EQ(LevelField(index, "words"), String("[\"КОТ\",\"ДОМ\"]"));
	EXPECT_NE(Caption("Words/WordRow1/Btn").Find("ДОМ"), -1);

	// агент: ещё три слова длиной 4–6
	for (int i = 0; i < 3; i++)
		Tap("Words/AgentCountPlus/Btn");
	for (int i = 0; i < 4; i++)
		Tap("Words/AgentMinPlus/Btn");
	EXPECT_EQ(LevelField(index, "wordsAuto"), String("3"));
	EXPECT_NE(Text("Words/AgentPreview").Find("длина"), -1) << Text("Words/AgentPreview").Data();
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "21_editor_words_agent.png"));
	Tap("Words/WordsDoneBtn/Btn");

	auto shown = Eval("JSON.stringify(WordFallViews.levelEditor.GetShownWords())");
	EXPECT_NE(shown.Find("\"КОТ\",\"ДОМ\""), -1) << shown.Data();
	EXPECT_NE(shown.Find("ещё 2 слова"), -1) << "пять слов в четырёх рядах: " << shown.Data();
	EXPECT_NE(Text("WordsTitle").Find("СЛОВА RU: 2 + 3 агент"), -1) << Text("WordsTitle").Data();

	// цель по очкам считает агент
	Tap("AutoTargetBtn/Btn");
	EXPECT_EQ(LevelField(index, "autoTarget"), String("true"));
	int preview = EvalInt(String::Format("WordFallGame.service.PreviewTargetScore(WordFallGame.service.GetLevelConfig(%i))", index));
	EXPECT_EQ(Text("TargetValue"), (String)preview);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "22_editor_words_block.png"));

	// «зафиксировать» превращает слова агента в обычные
	Tap("WordsBtn/Btn");
	Tap("Words/AgentPickBtn/Btn");
	EXPECT_EQ(LevelField(index, "wordsAuto"), String("0"));
	EXPECT_EQ(EvalInt(String::Format("WordFallGame.service.GetLevelConfig(%i).words.length", index)), 5);
	Tap("Words/WordsDoneBtn/Btn");

	Tap("PlayBtn/Btn");
	AppTestDriver::PumpFrames(5);
	EXPECT_EQ(EvalInt("WordFallGame.service.GetWords().length"), 5);
	EXPECT_EQ(mService->GetTargetScore(), preview) << "игрок получил цель, которую показал редактор";
}

// Файлы: уровень (по id) и кампания уходят в файл и читаются обратно; поле — из уровня «три в ряд»
TEST_F(WordFallLevelEditorUI, FilesOverlaySavesLoadsAndImportsMatch3Fields)
{
	OpenEditor();
	int index = Index();
	String levelFile = "wordfall_level_L001.json";
	o2FileSystem.FileDelete(levelFile);
	o2FileSystem.FileDelete("wordfall_campaign.json");

	auto files = Screen()->GetChild("Files");
	Tap("FilesBtn/Btn");
	EXPECT_TRUE(files->IsEnabled());
	Tap("Files/SaveLevelBtn/Btn");
	EXPECT_TRUE(o2FileSystem.IsFileExist(levelFile)) << "файл уровня назван по id";
	Tap("Files/SaveCampaignBtn/Btn");
	EXPECT_TRUE(o2FileSystem.IsFileExist("wordfall_campaign.json"));

	DataDocument level;
	level["moves"] = 3;
	level.SaveToFile(levelFile, DataDocument::Format::JSON);
	o2FileSystem.FileDelete("wordfall_campaign.json");
	Tap("Files/LoadBtn/Btn");
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(LevelField(index, "moves"), String("3"));

	// Gardenscapes: ряды сверху вниз, <Cell /> — дыра, box — ящик, locks — цепь
	String match3 = "match3_test_level.xml";
	mService->Set("match3ImportPath", ScriptValue(match3));
	String xml = "<?xml version=\"1.0\"?>\n<root>\n<Level format_version=\"20230303\">\n";
	const char* rows[5] = { " ... ", ".BBB.", ".....", ".L.L.", "....." };
	for (auto row : rows)
	{
		xml += "<Line>\n";
		for (int i = 0; row[i]; i++)
			xml += row[i] == ' ' ? String("<Cell />\n") : row[i] == 'B' ? String("<Cell exists=\"true\" box=\"BOX_EMPTY\" box_level=\"2\" />\n")
				 : row[i] == 'L' ? String("<Cell exists=\"true\" locks=\"1\" />\n") : String("<Cell exists=\"true\" />\n");
		xml += "</Line>\n";
	}
	xml += "</Level>\n</root>\n";
	o2FileSystem.WriteFile(match3, xml);
	Tap("Files/ImportMatch3Btn/Btn");
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(LevelField(index, "crateGrades"), String("[2,2,2]"));
	EXPECT_EQ(EvalInt(String::Format("WordFallGame.service.GetLevelConfig(%i).chainCells.length", index)), 2);
	EXPECT_EQ(EvalInt(String::Format("WordFallGame.service.GetLevelConfig(%i).holeCells.length", index)), 56 - 23);
	EXPECT_NE(Text("Files/FilesStatus").Find("Gardenscapes"), -1) << Text("Files/FilesStatus").Data();
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15g_level_editor_files.png"));
	Tap("Files/FilesDoneBtn/Btn");
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "23_editor_match3_field.png"));

	Tap("UndoBtn/Btn");
	EXPECT_EQ(LevelField(index, "crateGrades"), String("[]")) << "импорт откатывается шагом назад";
	o2FileSystem.FileDelete(levelFile);
	o2FileSystem.FileDelete(match3);
}
