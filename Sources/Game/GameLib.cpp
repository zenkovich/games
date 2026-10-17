extern void __RegisterEnum__ObbyGameComponent__Screen();
extern void __RegisterEnum__obby__Tile();
extern void __RegisterEnum__obby__EventType();
extern void __RegisterClass__ObbyGameComponent();
extern void __RegisterClass__PyramidSpawner();
extern void __RegisterClass__RotatorBalance();
extern void __RegisterClass__RotatorComponent();


extern void InitializeTypesGameLib()
{
    __RegisterEnum__ObbyGameComponent__Screen();
    __RegisterEnum__obby__Tile();
    __RegisterEnum__obby__EventType();
    __RegisterClass__ObbyGameComponent();
    __RegisterClass__PyramidSpawner();
    __RegisterClass__RotatorBalance();
    __RegisterClass__RotatorComponent();
}