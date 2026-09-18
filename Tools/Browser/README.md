# Browser acceptance

Start the WASM server on port 8090. With Node, Playwright and Google Chrome installed:

```sh
NODE_PATH=/tmp/sahur-browser/node_modules node Tools/Browser/verify_sahur.cjs
```

The script uses real mouse joystick input to harvest, sell and buy all four upgrades.
Navigation maps world targets through the rotated camera and sweeps long crop rows.
It reads game state for assertions/navigation but never assigns position, money or
progression. It checks the final Button, continued play, portrait layout at desktop
size, touch movement/release, a fixed joystick anchor and continued movement at the
viewport edge, gzip responses and browser errors. Clicks have a 150 ms
press duration so both transitions reach the frame-based input system.

Outputs: `Work/Sahur-gameplay.webm`, `Work/ScreenShots/50_*.png` through `65_*.png`
and `Work/ScreenShots/browser-validation.json`. Video is evidence, not part of the
5 MB playable package. The native performance suite measures a separate 4800-frame
soak, cached bounds and conservative view culling; browser FPS is collected from the engine's five-second heartbeat.
