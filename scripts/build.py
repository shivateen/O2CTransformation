#!/usr/bin/env python3
"""
build.py — Assemble the ProcessIQ Cognitive Cockpit into a single self-contained
public/processiq.html (CSS + data + engine + UI inlined, no CDN, runs from file://).

Mirrors the FinTran/CloseIQ build pattern: edit sources in src/, run this, serve public/.

  python scripts/build.py
  python -m http.server 3000 --directory public   ->  http://localhost:3000/processiq.html
"""
import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
PUB = os.path.join(ROOT, "public")


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def main():
    # Re-generate data first so the build is always current with the xlsx.
    import build_patterns, build_portfolio, build_roi, build_discovery, build_taxonomy, build_cfo  # noqa
    build_patterns.main()
    build_portfolio.main()
    build_roi.main()
    build_discovery.main()
    build_taxonomy.main()   # depends on patterns.json above
    build_cfo.main()        # depends on patterns.json above

    css = read("src", "css", "app.css")
    body = read("src", "html", "cockpit_body.html")
    engine = read("src", "js", "engine.js")
    # load order matters: shell defines window.PIQ, modules self-register, then boot
    js_modules = "\n".join([
        read("src", "js", "shell.js"),
        read("src", "js", "studio.js"),
        read("src", "js", "fitment.js"),
        read("src", "js", "build.js"),
        read("src", "js", "runtime.js"),
        read("src", "js", "provocation.js"),
        read("src", "js", "cockpit.js"),
        read("src", "js", "library.js"),
        read("src", "js", "governance.js"),
        read("src", "js", "roi.js"),
        read("src", "js", "discovery.js"),
        read("src", "js", "processmap.js"),
        read("src", "js", "cfo.js"),
    ])
    patterns = read("src", "data", "patterns.json")
    portfolio = read("src", "data", "portfolio.json")
    roi = read("src", "data", "roi.json")
    discovery = read("src", "data", "discovery.json")
    taxonomy = read("src", "data", "taxonomy.json")
    processmaps = read("src", "data", "processmaps.json")
    cfo = read("src", "data", "cfo.json")

    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Cache-Control" content="no-cache"/>
<title>Tiger Mission Control · Tiger Analytics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
{css}
</style>
</head>
<body>
{body}
<script>window.PROCESSIQ_PATTERNS = {patterns};</script>
<script>window.PROCESSIQ_PORTFOLIO = {portfolio};</script>
<script>window.PROCESSIQ_ROI = {roi};</script>
<script>window.PROCESSIQ_DISCOVERY = {discovery};</script>
<script>window.PROCESSIQ_TAXONOMY = {taxonomy};</script>
<script>window.PROCESSIQ_PROCESSMAPS = {processmaps};</script>
<script>window.PROCESSIQ_CFO = {cfo};</script>
<script>
{engine}
</script>
<script>
{js_modules}
</script>
<script>window.PIQ.boot();</script>
</body>
</html>
""".format(css=css, body=body, patterns=patterns, portfolio=portfolio, roi=roi,
           discovery=discovery, taxonomy=taxonomy, processmaps=processmaps, cfo=cfo,
           engine=engine, js_modules=js_modules)

    os.makedirs(PUB, exist_ok=True)
    out = os.path.join(PUB, "processiq.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    # landing page
    with open(os.path.join(PUB, "index.html"), "w", encoding="utf-8") as f:
        f.write(read("src", "apps", "index.html"))
    kb = len(html.encode("utf-8")) / 1024
    print(f"\nBuilt {os.path.relpath(out, ROOT)}  ({kb:.0f} KB, self-contained)")
    print(f"Built {os.path.relpath(os.path.join(PUB, 'index.html'), ROOT)}  (landing)")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
