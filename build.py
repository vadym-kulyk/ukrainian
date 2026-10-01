"""Збирає урок: вшиває знаки Midgard (base64) у src/lesson.html.
Результат: index.html (повна сторінка) і, якщо передано шлях, фрагмент для артефакта."""
import re, sys, pathlib
root = pathlib.Path(__file__).parent
src = (root / "src/lesson.html").read_text(encoding="utf-8")
logos = dict(re.findall(r'export const (\w+) = "([^"]+)"', (root / "src/logos.js").read_text()))
for key, name in {"LOGO": "LOGO_WORDMARK", "WAVE": "MARK_GREEN_WAVE", "SPIRAL": "MARK_PURPLE_SPIRAL", "FEATHER": "MARK_YELLOW_FEATHER"}.items():
    src = src.replace(f"%%{key}%%", logos[name])
page = ('<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + src.replace("</style>", "</style>\n</head>\n<body>", 1) + "\n</body>\n</html>\n")
(root / "index.html").write_text(page, encoding="utf-8")
if len(sys.argv) > 1:
    pathlib.Path(sys.argv[1]).write_text(src, encoding="utf-8")
