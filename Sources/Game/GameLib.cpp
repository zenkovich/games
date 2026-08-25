extern void __RegisterEnum__CharacterScreen__Mode();
extern void __RegisterClass__ColorTownGame();
extern void __RegisterClass__GlassField();
extern void __RegisterClass__ResourceBall();
extern void __RegisterClass__PyramidSpawner();
extern void __RegisterClass__RotatorComponent();


extern void InitializeTypesGameLib()
{
    __RegisterEnum__CharacterScreen__Mode();
    __RegisterClass__ColorTownGame();
    __RegisterClass__GlassField();
    __RegisterClass__ResourceBall();
    __RegisterClass__PyramidSpawner();
    __RegisterClass__RotatorComponent();
}