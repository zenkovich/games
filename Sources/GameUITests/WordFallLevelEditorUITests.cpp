#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

#include "o2/Render/Text.h"

// Редактор уровней: отдельный экран из читов, инструменты правят клетки, правки уходят
// в сервис и файл, «Играть» стартует уровень на игровом экране
class WordFallLevelEditorUI: public WordFallUI
{
protected:
	Ref<Actor> Game() { return o2Scene.FindActor("WordFall"); }
	Ref<Actor> Editor() { return o2Scene.FindActor("LevelEditor"); }

	void Tap(const Ref<Actor>& actor)
	{
		auto widget = DynamicCast<Widget>(actor);
		ASSERT_TRUE(widget);
		Click(widget->layout->GetWorldRect().Center());
		AppTestDriver::PumpFrames(3);
	}

	void OpenEditor()
	{
		auto screen = Game()->GetChild("Screen");
		Tap(screen->GetChild("Cheats/Toggle"));
		Tap(screen->GetChild("Cheats/Panel/EditorBtn/Btn"));
		AppTestDriver::PumpFrames(5);
	}

	String LevelField(int index, const char* field)
	{
		return o2Scripts.Eval(String::Format("JSON.stringify(WordFallGame.service.GetLevelConfig(%i).%s)", index, field)).ToString();
	}
};

TEST_F(WordFallLevelEditorUI, OpensFromCheatsAsASeparateScreen)
{
	OpenEditor();
	auto editor = Editor();
	ASSERT_TRUE(editor);
	EXPECT_TRUE(editor->IsEnabled());
	EXPECT_FALSE(Game()->IsEnabled()) << "игровой экран спрятан за редактором";

	auto screen = editor->GetChild("Screen");
	ASSERT_TRUE(screen);
	auto label = DynamicCast<Label>(screen->GetChild("LevelLabel"));
	ASSERT_TRUE(label);
	EXPECT_EQ(String(label->GetText()), String("УРОВЕНЬ 1 / 100"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15_level_editor.png"));

	Tap(screen->GetChild("NextBtn/Btn"));
	EXPECT_EQ(String(label->GetText()), String("УРОВЕНЬ 2 / 100"));

	Tap(screen->GetChild("CloseBtn/Btn"));
	EXPECT_FALSE(editor->IsEnabled());
	EXPECT_TRUE(Game()->IsEnabled());
	EXPECT_EQ(mService->GetLevelIndex(), 0) << "просмотр уровня в редакторе игру не переключает";
}

TEST_F(WordFallLevelEditorUI, ToolsEditCellsAndPlayStartsTheLevel)
{
	OpenEditor();
	auto screen = Editor()->GetChild("Screen");
	ASSERT_TRUE(screen);
	int index = o2Scripts.Eval("WordFallViews.levelEditor.GetLevelIndex()").GetValue<int>();
	int movesBefore = mService->GetLevelConfigMoves(index);

	Tap(screen->GetChild("Tools/Tool_ice"));
	Tap(screen->GetChild("Board/Tile_2_3"));
	// удалённая клетка: подложки нет, плитка — бледный контур; «добавить клетку» возвращает её
	Tap(screen->GetChild("Tools/Tool_removeCell"));
	Tap(screen->GetChild("Board/Tile_0_0"));
	auto holeTile = DynamicCast<Widget>(screen->GetChild("Board/Tile_0_0"));
	ASSERT_TRUE(holeTile);
	EXPECT_FALSE(screen->GetChild("Board/CellBack_0_0")->IsEnabled());
	EXPECT_TRUE(holeTile->IsEnabled());
	EXPECT_LT(holeTile->GetLayer("back")->GetTransparency(), 0.5f);
	Tap(screen->GetChild("Tools/Tool_addCell"));
	Tap(holeTile);
	EXPECT_TRUE(screen->GetChild("Board/CellBack_0_0")->IsEnabled()) << "клетка вернулась";
	EXPECT_EQ(LevelField(index, "holeCells").Find("{\"c\":0,\"r\":0}"), -1);
	Tap(screen->GetChild("Tools/Tool_removeCell"));
	Tap(holeTile);
	Tap(screen->GetChild("Tools/Tool_bomb"));
	Tap(screen->GetChild("Board/Tile_6_7"));

	// буква выбирается в палитре
	Tap(screen->GetChild("Tools/Tool_letter"));
	Tap(screen->GetChild("Board/Tile_3_3"));
	auto palette = screen->GetChild("Palette");
	ASSERT_TRUE(palette);
	EXPECT_TRUE(palette->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15d_level_editor_palette.png"));
	Tap(palette->GetChild("Letter10")); // К
	EXPECT_FALSE(palette->IsEnabled());
	auto tile = DynamicCast<Widget>(screen->GetChild("Board/Tile_3_3"));
	ASSERT_TRUE(tile);
	EXPECT_EQ(String(tile->GetLayerDrawable<Text>("letter")->GetText()), String("К"));

	Tap(screen->GetChild("MovesPlus/Btn"));
	Tap(screen->GetChild("MovesPlus/Btn")); // быстрый повторный тап тоже считается
	Tap(screen->GetChild("Charge0/Btn")); // 3 -> 5

	EXPECT_NE(LevelField(index, "iceCells").Find("{\"c\":2,\"r\":3}"), -1);
	EXPECT_NE(LevelField(index, "holeCells").Find("{\"c\":0,\"r\":0}"), -1);
	EXPECT_EQ(LevelField(index, "powerupCells"), String("[{\"c\":6,\"r\":7}]"));
	EXPECT_EQ(LevelField(index, "powerupKinds"), String("[\"bomb\"]"));
	EXPECT_EQ(LevelField(index, "letterCells"), String("[{\"c\":3,\"r\":3,\"letter\":\"К\"}]"));
	EXPECT_EQ(LevelField(index, "moves"), (String)(movesBefore + 2));
	EXPECT_EQ(LevelField(index, "boosterCharges[0]"), String("5"));
	EXPECT_TRUE(o2FileSystem.IsFileExist(kTestLevelsPath)) << "правки сохранены в файл";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15b_level_editor_edited.png"));

	Tap(screen->GetChild("PlayBtn/Btn"));
	AppTestDriver::PumpFrames(5);
	EXPECT_TRUE(Game()->IsEnabled());
	EXPECT_FALSE(Editor()->IsEnabled());
	EXPECT_EQ(mService->GetLevelIndex(), index);
	EXPECT_EQ(mService->GetMovesLeft(), movesBefore + 2);
	EXPECT_EQ(mService->GetBoosterCharges(0), 5);

	auto& board = mService->GetLevel().GetBoard();
	EXPECT_TRUE(board.IsHole(Vec2I(0, 0)));
	EXPECT_EQ(board.GetTile(Vec2I(2, 3)).ice, 1);
	EXPECT_EQ(board.GetTile(Vec2I(3, 3)).letter, WString("К"));
	EXPECT_EQ(board.GetTile(Vec2I(6, 7)).powerup, WString("bomb"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15c_level_editor_play.png"));

	// снятие правок возвращает исходный уровень
	OpenEditor();
	Tap(screen->GetChild("ResetBtn/Btn"));
	EXPECT_EQ(LevelField(index, "letterCells"), String("[]"));
	EXPECT_EQ(LevelField(index, "moves"), (String)movesBefore);
	EXPECT_FALSE(o2FileSystem.IsFileExist(kTestLevelsPath)) << "без правок файла нет";
}

TEST_F(WordFallLevelEditorUI, TasksOverlayEditsLevelGoals)
{
	OpenEditor();
	auto screen = Editor()->GetChild("Screen");
	ASSERT_TRUE(screen);
	int index = o2Scripts.Eval("WordFallViews.levelEditor.GetLevelIndex()").GetValue<int>();
	auto tasks = screen->GetChild("Tasks");
	ASSERT_TRUE(tasks);
	EXPECT_FALSE(tasks->IsEnabled());

	Tap(screen->GetChild("TasksBtn/Btn"));
	EXPECT_TRUE(tasks->IsEnabled());
	int count = o2Scripts.Eval(String::Format("WordFallGame.service.GetLevelConfig(%i).tasks.length", index)).GetValue<int>();
	EXPECT_EQ(LevelField(index, "tasks[0].taskType"), String("\"Word\"")) << "первая задача процедурного уровня — слово";

	// слово первой задачи правится в палитре: старое стирается, набирается К, О, Т
	Tap(tasks->GetChild("Task0Value/Btn"));
	auto palette = screen->GetChild("Palette");
	EXPECT_TRUE(palette->IsEnabled());
	for (int i = 0; i < 8 && LevelField(index, "tasks[0].word") != String("\"\""); i++)
		Tap(palette->GetChild("RandomBtn/Btn")); // стереть последнюю
	EXPECT_EQ(LevelField(index, "tasks[0].word"), String("\"\""));
	Tap(palette->GetChild("Letter10"));
	Tap(palette->GetChild("Letter14"));
	Tap(palette->GetChild("Letter18"));
	EXPECT_TRUE(palette->IsEnabled()) << "палитра слова открыта до «Готово»";
	Tap(palette->GetChild("RandomBtn/Btn")); // стереть последнюю
	Tap(palette->GetChild("Letter18"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15e_level_editor_word.png"));
	Tap(palette->GetChild("CancelBtn/Btn")); // готово
	EXPECT_FALSE(palette->IsEnabled());
	EXPECT_EQ(LevelField(index, "tasks[0].word"), String("\"КОТ\""));

	// новая задача, смена типа по кругу и счётчик
	Tap(tasks->GetChild("AddTaskBtn/Btn"));
	EXPECT_EQ(LevelField(index, "tasks.length"), (String)(count + 1));
	String added = String::Format("Task%i", count);
	EXPECT_EQ(LevelField(index, String::Format("tasks[%i].taskType", count)), String("\"AnyWords\""));
	Tap(tasks->GetChild(added + "BPlus/Btn"));
	EXPECT_EQ(LevelField(index, String::Format("tasks[%i].count", count)), String("4"));
	Tap(tasks->GetChild(added + "Type/Btn"));
	EXPECT_EQ(LevelField(index, String::Format("tasks[%i].taskType", count)), String("\"WordScore\""));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "15f_level_editor_tasks.png"));

	Tap(tasks->GetChild(added + "Delete/Btn"));
	EXPECT_EQ(LevelField(index, "tasks.length"), (String)count);

	Tap(tasks->GetChild("TasksDoneBtn/Btn"));
	EXPECT_FALSE(tasks->IsEnabled());

	// уровень стартует с новым словом-заданием на поле
	Tap(screen->GetChild("PlayBtn/Btn"));
	AppTestDriver::PumpFrames(5);
	EXPECT_EQ(mService->GetLevelIndex(), index);
	EXPECT_EQ(mService->GetLevel().GetBoard().GetSeededCells().Count(), 3);
}
