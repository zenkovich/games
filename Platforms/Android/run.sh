#!/usr/bin/env bash
# Installs the built apk on the connected device, starts the game and streams its logcat.
#
#   run.sh [debug|release] [--tracy]
#
# --tracy additionally starts the Tracy profiler and points it at the device: at the device's own
# address when the host can reach it, otherwise through an adb port forward over USB. Only the debug
# build carries the Tracy client.

set -u

BUILD="${1:-debug}"
MODE="${2:-}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
PKG="com.o2.template"
APK="$DIR/app/build/outputs/apk/$BUILD/app-$BUILD.apk"

. "$DIR/env.sh"

if [ ! -f "$APK" ]; then
    echo "no apk at $APK, build it first" >&2
    exit 1
fi

if [ "$MODE" = "--tracy" ]; then
    TRACY="$("$ROOT/Tools/Tracy/build_gui.sh")" || exit 1
fi

adb install -r "$APK" || exit 1
adb shell am force-stop "$PKG"
adb logcat -c
adb shell am start -n "$PKG/.MainActivity" || exit 1

PID=""
for _ in $(seq 1 40); do
    PID="$(adb shell pidof -s "$PKG" | tr -d '\r\n')"
    [ -n "$PID" ] && break
    sleep 0.25
done

if [ -z "$PID" ]; then
    echo "the process did not come up, see logcat" >&2
    exec adb logcat
fi

if [ "$MODE" = "--tracy" ]; then
    IP="$(adb shell ip route get 1.1.1.1 2>/dev/null | tr -d '\r' | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)"

    # -G bounds the connect itself: without it an unreachable device address hangs the check
    if [ -n "$IP" ] && nc -z -G 1 -w 1 "$IP" 8086 2>/dev/null; then
        TARGET="$IP"
    else
        adb forward tcp:8086 tcp:8086 > /dev/null 2>&1
        TARGET="127.0.0.1"
    fi

    pkill -f "$TRACY" 2>/dev/null
    sleep 0.2
    nohup "$TRACY" -a "$TARGET" < /dev/null > /dev/null 2>&1 &
    disown

    echo "=== launched; PID=$PID; tracy connects to $TARGET:8086; streaming logcat ==="
else
    echo "=== launched; PID=$PID; streaming logcat ==="
fi

exec adb logcat --pid="$PID"
