extern void __RegisterEnum__WordBoard__SelectResult();
extern void __RegisterEnum__WordTaskType();
extern void __RegisterEnum__WordLevel__State();
extern void __RegisterEnum__WordLevel__Booster();
extern void __RegisterClass__PyramidSpawner();
extern void __RegisterClass__RotatorComponent();
extern void __RegisterClass__PlayerProgress();
extern void __RegisterClass__LetterDef();
extern void __RegisterClass__WordTaskConfig();
extern void __RegisterClass__WordLevelConfig();
extern void __RegisterClass__WordBoardConfig();
extern void __RegisterClass__WordFallBootstrap();
extern void __RegisterClass__WordFallGameService();
extern void __RegisterClass__WordFallVfx();


extern void InitializeTypesGameLib()
{
    __RegisterEnum__WordBoard__SelectResult();
    __RegisterEnum__WordTaskType();
    __RegisterEnum__WordLevel__State();
    __RegisterEnum__WordLevel__Booster();
    __RegisterClass__PyramidSpawner();
    __RegisterClass__RotatorComponent();
    __RegisterClass__PlayerProgress();
    __RegisterClass__LetterDef();
    __RegisterClass__WordTaskConfig();
    __RegisterClass__WordLevelConfig();
    __RegisterClass__WordBoardConfig();
    __RegisterClass__WordFallBootstrap();
    __RegisterClass__WordFallGameService();
    __RegisterClass__WordFallVfx();
}