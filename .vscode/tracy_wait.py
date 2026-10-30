# Opens the Tracy GUI on the profiled program once it listens: a connection the GUI tries before that ends in a
# "dropped handshake" and the GUI gives up
import subprocess
import sys
import time

tracy, program = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ""


def listeners():
    out = subprocess.run(["lsof", "-nP", "-iTCP:8086-8105", "-sTCP:LISTEN", "-Fpcn"], capture_output=True, text=True).stdout
    result, pid, name = [], None, ""
    for line in out.splitlines():
        if line.startswith("p"):
            pid = int(line[1:])
        elif line.startswith("c"):
            name = line[1:]
        elif line.startswith("n"):
            result.append((pid, name, int(line.rsplit(":", 1)[1])))
    return result


# Another o2 program running takes 8086: the new one listens on the next port
existing = {pid for pid, _, _ in listeners()}
deadline = time.time() + 300
while time.time() < deadline:
    for pid, name, port in listeners():
        if pid not in existing and (not program or name == program):
            subprocess.Popen([tracy, "-a", "127.0.0.1", "-p", str(port)], stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            sys.exit(0)

    time.sleep(0.2)
