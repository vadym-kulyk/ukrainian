"""Збирає урок: вшиває знаки Midgard (base64) у src/lesson.html.
Результат: index.html (повна сторінка) і, якщо передано шлях, фрагмент для артефакта."""
import re, sys, pathlib
root = pathlib.Path(__file__).parent
src = (root / "src/lesson.html").read_text(encoding="utf-8").replace("/*%%BASECSS%%*/", (root / "src/base.css").read_text(encoding="utf-8"))
logos = dict(re.findall(r'export const (\w+) = "([^"]+)"', (root / "src/logos.js").read_text()))
for key, name in {"LOGO": "LOGO_WORDMARK", "WAVE": "MARK_GREEN_WAVE", "SPIRAL": "MARK_PURPLE_SPIRAL", "FEATHER": "MARK_YELLOW_FEATHER"}.items():
    src = src.replace(f"%%{key}%%", logos[name])
import re as _re
def _px(t):
    return _re.sub(r'(?<![\w.#-])(\d+(?:\.\d+)?)px', lambda m: m.group(0) if m.group(1) in ('0',) else f'calc({m.group(1)}*var(--u))', t)
def _style(m):
    css = m.group(1)
    keep = []
    css = _re.sub(r'@media[^{]*\{', lambda x: (keep.append(x.group(0)), f'@@M{len(keep)-1}@@')[1], css)
    css = _px(css)
    css = _re.sub(r'@@M(\d+)@@', lambda x: keep[int(x.group(1))], css)
    return '<style>\n:root{--u:clamp(1px,calc(100vw / 1360),2.2px)}\n' + css + '</style>'
src = _re.sub(r'<style>(.*?)</style>', _style, src, flags=_re.S)
src = _re.sub(r'style="([^"]*)"', lambda m: 'style="' + _px(m.group(1)) + '"', src)
page = ('<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + src.replace("</style>", "</style>\n</head>\n<body>", 1) + "\n</body>\n</html>\n")
(root / "index.html").write_text(page, encoding="utf-8")
if len(sys.argv) > 1:
    pathlib.Path(sys.argv[1]).write_text(src, encoding="utf-8")
