#!/usr/bin/env python3
"""poly.pizza helpers: search model pages and pull direct GLB links + licenses."""
import json, re, sys, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")

def search(term, limit=15):
    html = get(f"https://poly.pizza/search/{urllib.parse.quote(term)}")
    # model cards link as /m/<id>; titles in aria-labels nearby
    ids = re.findall(r'href="/m/([A-Za-z0-9]+)"', html)
    seen, out = set(), []
    for mid in ids:
        if mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
        if len(out) >= limit:
            break
    # embedded JSON with titles
    titles = dict(re.findall(r'"/m/([A-Za-z0-9]+)"[^>]*aria-label="([^"]+)"', html))
    return [(mid, titles.get(mid, "?")) for mid in out]

def model_info(mid):
    html = get(f"https://poly.pizza/m/{mid}")
    glb = re.search(r'https://static\.poly\.pizza/([0-9a-f-]+)\.glb', html)
    lic = re.search(r'"Licence":"([^"]+)"', html)
    title = re.search(r'"Title":"([^"]+)"', html)
    creator = re.search(r'"Username":"([^"]+)"', html)
    anim = re.search(r'"Animated":(true|false)', html)
    return {
        "id": mid,
        "title": title.group(1) if title else "?",
        "creator": creator.group(1) if creator else "?",
        "licence": lic.group(1) if lic else "?",
        "animated": anim.group(1) if anim else "?",
        "glb": f"https://static.poly.pizza/{glb.group(1)}.glb" if glb else None,
    }

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "search":
        for mid, title in search(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 15):
            print(mid, title)
    elif cmd == "info":
        for mid in sys.argv[2:]:
            print(json.dumps(model_info(mid)))
