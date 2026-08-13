#!/usr/bin/env python3
"""Serves Bin/WebAssembly and drives headless Chrome over CDP: collects console output
and takes a screenshot, so the browser build can be verified without a human."""
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
PORT = 8731
WAIT = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0

os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # SharedArrayBuffer-friendly headers, harmless otherwise
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

    def log_message(self, fmt, *args):
        line = fmt % args
        if " 404 " in line or " 500 " in line:
            print("HTTP MISS:", line)


server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()

chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
proc = subprocess.Popen([
    chrome, "--headless=new", "--remote-debugging-port=9333",
    "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--remote-allow-origins=*", "--window-size=560,1000", "--user-data-dir=" + OUT + "/chrome-profile",
    "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

time.sleep(3)

try:
    import websocket  # type: ignore
except ImportError:
    print("MISSING: pip install websocket-client")
    proc.kill()
    sys.exit(2)

targets = json.load(urllib.request.urlopen("http://127.0.0.1:9333/json"))
page = next(t for t in targets if t["type"] == "page")
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=WAIT + 30, suppress_origin=True)

msg_id = 0


def send(method, params=None):
    global msg_id
    msg_id += 1
    ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
    return msg_id


def wait_for(target_id, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        data = json.loads(ws.recv())
        if data.get("id") == target_id:
            return data
        collect(data)
    return None


logs = []
errors = []


def collect(data):
    method = data.get("method")
    if method == "Runtime.consoleAPICalled":
        parts = [str(a.get("value", a.get("description", ""))) for a in data["params"]["args"]]
        logs.append(data["params"]["type"] + ": " + " ".join(parts))
    elif method == "Runtime.exceptionThrown":
        details = data["params"]["exceptionDetails"]
        errors.append(details.get("text", "") + " " + str(details.get("exception", {}).get("description", "")))
    elif method == "Log.entryAdded":
        entry = data["params"]["entry"]
        logs.append(entry["level"] + ": " + entry["text"])


send("Runtime.enable")
send("Log.enable")
send("Page.enable")
nav = send("Page.navigate", {"url": f"http://127.0.0.1:{PORT}/Game.html"})
wait_for(nav)

end = time.time() + WAIT
ws.settimeout(1.0)
while time.time() < end:
    try:
        collect(json.loads(ws.recv()))
    except Exception:
        pass

ws.settimeout(30)


def drain(seconds):
    stop = time.time() + seconds
    ws.settimeout(0.3)
    while time.time() < stop:
        try:
            collect(json.loads(ws.recv()))
        except Exception:
            pass
    ws.settimeout(30)


def click(x, y, hold=0.35):
    move = send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 0})
    wait_for(move, 10)
    drain(0.2)
    down = send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y,
                                             "button": "left", "clickCount": 1, "buttons": 1})
    wait_for(down, 10)
    drain(hold)                       # the game needs frames between press and release
    up = send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y,
                                           "button": "left", "clickCount": 1, "buttons": 0})
    wait_for(up, 10)
    drain(0.3)


if len(sys.argv) > 2 and sys.argv[2] == "play":
    click(280, 812)          # START RUN
    drain(6)
    shot = send("Page.captureScreenshot", {"format": "png"})
    res = wait_for(shot)
    if res and "result" in res:
        open(OUT + "/wasm_run.png", "wb").write(base64.b64decode(res["result"]["data"]))
        print("run screenshot saved")

    click(240, 700)          # drag the ship around
    drain(4)
    shot = send("Page.captureScreenshot", {"format": "png"})
    res = wait_for(shot)
    if res and "result" in res:
        open(OUT + "/wasm_run2.png", "wb").write(base64.b64decode(res["result"]["data"]))
        print("run screenshot 2 saved")

shot = send("Page.captureScreenshot", {"format": "png"})
res = wait_for(shot)
if res and "result" in res:
    open(OUT + "/wasm_screen.png", "wb").write(base64.b64decode(res["result"]["data"]))
    print("screenshot saved")

canvas = send("Runtime.evaluate", {"expression":
    "(() => { const c = document.querySelector('canvas');"
    " return c ? c.width + 'x' + c.height : 'no canvas'; })()"})
res = wait_for(canvas)
print("canvas:", res["result"]["result"].get("value") if res else "?")

print("\n--- console (%d) ---" % len(logs))
for line in logs[-60:]:
    print(line)

print("\n--- exceptions (%d) ---" % len(errors))
for line in errors[-20:]:
    print(line)

ws.close()
proc.kill()
server.shutdown()
