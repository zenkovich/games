#!/usr/bin/env python3
"""Builds Work/report.html from report_template.html, inlining {{img:path}} as data URIs."""
import base64, os, re

root = os.path.dirname(os.path.abspath(__file__))
template = open(os.path.join(root, "report_template.html")).read()

def inline(match):
    path = os.path.join(root, match.group(1))
    data = base64.b64encode(open(path, "rb").read()).decode()
    return f"data:image/png;base64,{data}"

html = re.sub(r"\{\{img:([^}]+)\}\}", inline, template)
out = os.path.join(root, "report.html")
open(out, "w").write(html)
print(f"wrote {out}: {len(html)//1024} KB")
