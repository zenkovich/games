extern void __RegisterClass__dragon__DragonBootstrapComponent();
extern void __RegisterClass__dragon__DragonSpineComponent();
extern void __RegisterClass__PyramidSpawner();
extern void __RegisterClass__RotatorBalance();
extern void __RegisterClass__RotatorComponent();


extern void InitializeTypesGameLib()
{
    __RegisterClass__dragon__DragonBootstrapComponent();
    __RegisterClass__dragon__DragonSpineComponent();
    __RegisterClass__PyramidSpawner();
    __RegisterClass__RotatorBalance();
    __RegisterClass__RotatorComponent();
}