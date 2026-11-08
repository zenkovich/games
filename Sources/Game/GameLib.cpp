extern void __RegisterClass__LongPressButton();
extern void __RegisterClass__PyramidSpawner();
extern void __RegisterClass__RotatorBalance();
extern void __RegisterClass__RotatorComponent();
extern void __RegisterClass__TouchScrollArea();


extern void InitializeTypesGameLib()
{
    __RegisterClass__LongPressButton();
    __RegisterClass__PyramidSpawner();
    __RegisterClass__RotatorBalance();
    __RegisterClass__RotatorComponent();
    __RegisterClass__TouchScrollArea();
}