#!/usr/bin/env python3
"""Inline the CSS and JS of each page into a single self-contained file.

The standalone files are meant to be opened on their own — AirDropped to a
phone, opened offline — so cross-links between the two modes are rewritten to
the published URLs, which work from anywhere.
"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SITE = "https://pmomot.github.io/game-of-life/"

BUILDS = [
    ("index.html", "game-of-life.html", ["patterns.js", "app.js"]),
    ("versus.html", "game-of-life-versus.html", ["patterns.js", "versus.js"]),
    ("puzzle.html", "game-of-life-puzzles.html", ["levels.js", "puzzle.js"]),
]


def build(page, out, scripts):
    html = (HERE / page).read_text()
    css = (HERE / "styles.css").read_text().rstrip()

    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")

    joined = "\n".join(f"/* {s} */\n{(HERE / s).read_text().rstrip()}" for s in scripts)
    for s in scripts[1:]:
        html = html.replace(f'<script src="{s}"></script>', "")
    html = html.replace(f'<script src="{scripts[0]}"></script>', f"<script>\n{joined}\n</script>")

    # links to the other mode must resolve away from this file
    html = re.sub(r'href="(index|versus|puzzle)\.html"', lambda m: f'href="{SITE}{m.group(1)}.html"', html)

    assert "<style>" in html and "src=" not in html, f"{page} did not fully inline"
    (HERE / out).write_text(html)
    print(f"{page:14} -> {out:26} {len(html) // 1024} KB")


if __name__ == "__main__":
    for args in BUILDS:
        build(*args)
