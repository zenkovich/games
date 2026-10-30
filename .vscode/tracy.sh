#!/bin/sh
# Opens the Tracy profiler GUI on the program (Game, Editor) started next; rebuilds the GUI when it is missing or stale
set -e

root="$(cd "$(dirname "$0")/.." && pwd)"
program="${1:-}"
tracy="$("$root/Tools/Tracy/build_gui.sh")"

pkill -f "tracy_wait.py" 2>/dev/null || true
pkill -f "$tracy" 2>/dev/null || true

# A new session: the task terminal closing doesn't take it with it. The GUI opens once the program listens
python3 -c 'import subprocess, sys
subprocess.Popen([sys.executable] + sys.argv[1:], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                 stderr=subprocess.DEVNULL, start_new_session=True)' "$root/.vscode/tracy_wait.py" "$tracy" "$program"
