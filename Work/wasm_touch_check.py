#!/usr/bin/env python3
"""Touch-drives the WebAssembly build in a phone-sized headless Chrome and reports whether the
ship follows the finger. Fire-and-forget CDP: commands are sent, replies are drained by time."""
import base64
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = "/Users/andreizenkovich/work/zenkovich.space/gamesTemplate2/Bin/WebAssembly"
OUT = "/private/tmp/claude-501/-Users-andreizenkovich-work-zenkovich-space-gamesTemplate2/2fed6f35-2d50-4c14-a0f8-cbc033416ed0/scratchpad"
PORT = 8737
TAG = sys.argv[1] if len(sys.argv) > 1 else "touch"
TOUCH_ID = int(sys.argv[2]) if len(sys.argv) > 2 else 7

os.chdir(ROOT)
subprocess.run(["pkill", "-f", "remote-debugging-port=9337"], capture_output=True)
time.sleep(1)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()

proc = subprocess.Popen([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "--headless=new", "--remote-debugging-port=9337", "--remote-allow-origins=*",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--window-size=430,860", "--user-data-dir=" + OUT + "/chrome-touch2",
    "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

import websocket  # type: ignore

page = next(t for t in json.load(urllib.request.urlopen("http://127.0.0.1:9337/json"))
            if t["type"] == "page")
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=5, suppress_origin=True)

state = {"id": 0}
logs = []
results = {}


def send(method, params=None):
    state["id"] += 1
    ws.send(json.dumps({"id": state["id"], "method": method, "params": params or {}}))
    return state["id"]


def pump(seconds):
    stop = time.time() + seconds
    ws.settimeout(0.25)
    while time.time() < stop:
        try:
            data = json.loads(ws.recv())
        except Exception:
            continue
        if data.get("method") == "Runtime.consoleAPICalled":
            logs.append(" ".join(str(a.get("value", "")) for a in data["params"]["args"]))
        elif "id" in data:
            results[data["id"]] = data.get("result")


def shot(name):
    sid = send("Page.captureScreenshot", {"format": "png"})
    pump(3)
    res = results.get(sid)
    if res and "data" in res:
        open(f"{OUT}/{name}", "wb").write(base64.b64decode(res["data"]))
        print("saved", name)
    else:
        print("screenshot failed:", name)


def touch(kind, x=0, y=0):
    points = [] if kind == "touchEnd" else [{"x": x, "y": y, "id": TOUCH_ID}]
    send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
    pump(0.15)


send("Runtime.enable")
send("Page.enable")
send("Emulation.setDeviceMetricsOverride",
     {"width": 430, "height": 860, "deviceScaleFactor": 1, "mobile": True})
send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
send("Page.navigate", {"url": f"http://127.0.0.1:{PORT}/Game.html"})
pump(16)
shot(f"{TAG}_01_loaded.png")

print("touch id used:", TOUCH_ID)

# tap START RUN
touch("touchStart", 215, 772)
pump(0.4)
touch("touchEnd")
pump(5)
shot(f"{TAG}_02_after_tap.png")

# hold and drag the finger to the lower left
touch("touchStart", 215, 700)
pump(0.5)
for i in range(14):
    touch("touchMove", 215 - i * 11, 700 - i * 3)
pump(2.5)
shot(f"{TAG}_03_dragged.png")
touch("touchEnd")
pump(1)

print("\n--- console tail ---")
for line in logs[-8:]:
    print(line)

ws.close()
proc.kill()
server.shutdown()
