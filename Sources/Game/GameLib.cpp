extern void __RegisterClass__PyramidSpawner();
extern void __RegisterClass__RotatorComponent();
extern void __RegisterClass__WordFallBootstrap();


extern void InitializeTypesGameLib()
{
    __RegisterClass__PyramidSpawner();
    __RegisterClass__RotatorComponent();
    __RegisterClass__WordFallBootstrap();
}