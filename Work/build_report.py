#!/usr/bin/env python3
"""Inlines every {{IMG:path}} placeholder of report_template.html as a data URI."""
import base64
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def inline(match):
    path = os.path.join(HERE, match.group(1))
    data = base64.b64encode(open(path, "rb").read()).decode()
    return "data:image/png;base64," + data


src = open(os.path.join(HERE, "report_template.html")).read()
out = re.sub(r"\{\{IMG:([^}]+)\}\}", inline, src)

dst = os.path.join(HERE, "report.html")
open(dst, "w").write(out)
print(f"report.html: {os.path.getsize(dst)//1024} KB")
