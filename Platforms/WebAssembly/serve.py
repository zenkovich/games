#!/usr/bin/env python3
"""Dev server for the wasm build: no-store cache headers, otherwise Chrome's heuristic
caching keeps serving a stale Game.data for hours after relinks."""
import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
directory = sys.argv[2] if len(sys.argv) > 2 else "."


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if ("gzip" in self.headers.get("Accept-Encoding", "") and os.path.isfile(path + ".gz")
                and os.path.isfile(path) and os.path.getmtime(path + ".gz") >= os.path.getmtime(path)):
            stream = open(path + ".gz", "rb")
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(os.fstat(stream.fileno()).st_size))
            self.end_headers()
            return stream
        return super().send_head()


print(f"Serving HTTP on 0.0.0.0 port {port} (no-store) from {directory}", flush=True)
http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
