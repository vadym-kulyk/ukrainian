"""Збирає завдання ЗНО з української мови (zno.osvita.ua) за темами.
Результат: zno/ukrmova.json і zno/ukrmova.md.
Підкреслені літери (<u>…</u>) зберігаються, бо від них залежить зміст завдання."""
import json, pathlib, re, time, urllib.request
from bs4 import BeautifulSoup, NavigableString

TOPICS = [
    ("1.1. Фонетика. Графіка. Орфоепія", "Склад. Наголос", "sklad_nagolos_1"),
    ("1.1. Фонетика. Графіка. Орфоепія", "Співвідношення звуків і букв", "spivvidnoshennya_zvukiv_i_bukv"),
    ("1.2. Орфографія", "Правопис літер, що позначають ненаголошені голосні е, и, о", "pravopis_liter_sho_poznachayut_nenagolosheni_golosni_e_i_o"),
    ("1.2. Орфографія", "Правопис префіксів", "pravopis_prefiksiv"),
    ("1.2. Орфографія", "Спрощення в групах приголосних", "sproshennya_v_grupah_prigolosnih"),
    ("1.2. Орфографія", "Зміни приголосних при творенні слів", "zmini_prigolosnih_pri_tvorenni_sliv_1"),
    ("1.2. Орфографія", "Апостроф", "apostrof_1"),
    ("1.2. Орфографія", "Мʼякий знак", "myakij_znak"),
    ("1.2. Орфографія", "Сполучення йо, ьо", "spoluchennya_jo_o"),
    ("1.2. Орфографія", "Подвоєння літер", "podvoyennya_liter_1"),
    ("1.2. Орфографія", "Правопис слів іншомовного походження", "pravopis_sliv_inshomovnogo_pohodzhennya"),
    ("1.2. Орфографія", "Велика буква та лапки у власних назвах", "velika_bukva_ta_lapki_u_vlasnih_nazvah"),
    ("1.2. Орфографія", "Складні слова", "skladni_slova_1"),
    ("1.2. Орфографія", "Правопис не з різними частинами мови", "pravopis_ne_z_riznimi_chastinami_movi_1"),
    ("1.2. Орфографія", "Основні випадки чергування у–в, і–й", "osnovni_vipadki_cherguvannya_uv_ij_1"),
]
LETTERS = dict(zip("abcde", "АБВГД"))


def text(el):
    """Текст елемента без розмітки, крім <u>…</u>."""
    for junk in el.find_all(["style", "script"]):
        junk.decompose()
    out = []
    for node in el.descendants:
        if isinstance(node, NavigableString):
            if any(p.name == "u" for p in node.parents if p is not el):
                out.append(f"<u>{node}</u>")
            else:
                out.append(str(node))
        elif node.name == "br":
            out.append("\n")
    s = "".join(out).replace("</u><u>", "").replace("\xa0", " ").replace("\r", "")
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\s*\n\s*", "\n", s).strip()


def explanation(el):
    if el is None:
        return ""
    el.find("strong").extract()  # заголовок «Пояснення»
    lines = []
    for block in el.find_all(["p", "li"]):
        if block.find_parent("li"):
            continue
        t = text(block)
        if t:
            lines.append(("- " if block.name == "li" else "") + t)
    return "\n".join(lines) or text(el)


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    tasks = []
    for card in soup.select("div.task-card"):
        qid = card.find("input", attrs={"name": "q[id]"})["value"]
        result = card.find("input", attrs={"name": "result"})["value"]
        options = [{"key": a.find("span", class_="marker").extract().get_text(strip=True), "text": text(a)}
                   for a in card.select("div.answers div.answer")]
        if ";" in result:  # «впишіть цифри»
            kind, answer = "multiple", result.split(";")
        else:
            kind, answer = "single", LETTERS[result]
        edinfo = card.find("div", class_="edinfo")
        test_no = re.search(r"Тест (\d+)", edinfo.get_text()).group(1) if edinfo else None
        tasks.append({
            "id": int(qid),
            "test": int(test_no) if test_no else None,
            "type": kind,
            "question": text(card.find("div", class_="question")),
            "options": options,
            "answer": answer,
            "explanation": explanation(card.find("div", id=f"commentar_{qid}")),
        })
    return tasks


def to_md(data):
    out = ["# ЗНО. Українська мова — завдання за темами", "",
           "Джерело: zno.osvita.ua. Підкреслені літери позначено тегом <u>.", ""]
    section = None
    for t in data:
        if t["section"] != section:
            section = t["section"]
            out += [f"## {section}", ""]
        out += [f"### {t['topic']} ({len(t['tasks'])})", "", t["url"], ""]
        for i, q in enumerate(t["tasks"], 1):
            out += [f"**{i}.** {q['question']}  ", ""]
            out += [f"- **{o['key']}** {o['text']}" for o in q["options"]]
            ans = ", ".join(q["answer"]) if q["type"] == "multiple" else q["answer"]
            out += ["", f"**Відповідь: {ans}**", ""]
            if q["explanation"]:
                out += ["<details><summary>Пояснення</summary>", "", q["explanation"].replace("\n", "\n\n"), "", "</details>", ""]
    return "\n".join(out)


def main():
    root = pathlib.Path(__file__).parent
    data = []
    for section, topic, slug in TOPICS:
        url = f"https://zno.osvita.ua/ukrmova/tag-{slug}/"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
        tasks = parse(html)
        print(f"{topic}: {len(tasks)}")
        data.append({"section": section, "topic": topic, "url": url, "tasks": tasks})
        time.sleep(1)
    (root / "ukrmova.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (root / "ukrmova.md").write_text(to_md(data), encoding="utf-8")


if __name__ == "__main__":
    main()
