"""Збирає завдання ЗНО з української мови (zno.osvita.ua) за темами.
Результат: zno/ukrmova.json, zno/README.md (зміст) і zno/md/NN.md (по файлу на тему).
Підкреслені літери (<u>…</u>) зберігаються, бо від них залежить зміст завдання."""
import base64, hashlib, json, pathlib, re, time, urllib.request
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, Comment, NavigableString

SITE = "https://zno.osvita.ua/"

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
    ("1.3. Лексикологія", "Лексичне значення слова", "leksichne_znachennya_slova"),
    ("1.3. Лексикологія", "Синоніми", "sinonimi"),
    ("1.3. Лексикологія", "Антоніми", "antonimi"),
    ("1.3. Лексикологія", "Лексична помилка", "leksichna_pomilka"),
    ("1.3. Лексикологія", "Фразеологія", "frazeologiya"),
    ("1.4. Будова слова. Словотвір", "Будова слова. Словотвір", "budova_slova_slovotvir_2"),
    ("1.5. Морфологія", "Класифікація частин мови", "klasifikaciya_chastin_movi_1"),
    ("1.5. Морфологія", "Іменник: рід і число іменників", "imennik_rid_i_chislo_imennikiv"),
    ("1.5. Морфологія", "Іменник: відмінювання іменників", "imennik_vidminyuvannya_imennikiv"),
    ("1.5. Морфологія", "Іменник: написання імен по батькові", "imennik_napisannya_imen_po_batkovi"),
    ("1.5. Морфологія", "Прикметник", "prikmetnik_1"),
    ("1.5. Морфологія", "Числівник", "chislivnik_1"),
    ("1.5. Морфологія", "Займенник", "zajmennik_1"),
    ("1.5. Морфологія", "Дієслово", "diyeslovo_1"),
    ("1.5. Морфологія", "Дієприкметник", "diyeprikmetnik_1"),
    ("1.5. Морфологія", "Дієприслівник", "diyeprislivnik_1"),
    ("1.5. Морфологія", "Прислівник", "prislivnik_1"),
    ("1.5. Морфологія", "Прийменник", "prijmennik_1"),
    ("1.5. Морфологія", "Сполучник", "spoluchnik_1"),
    ("1.5. Морфологія", "Частка", "chastka_1"),
    ("1.6. Синтаксис. Пунктуація", "Словосполучення", "slovospoluchennya_1"),
    ("1.6. Синтаксис. Пунктуація", "Класифікація речень", "klasifikaciya_rechen_1"),
    ("1.6. Синтаксис. Пунктуація", "Головні члени речення", "golovni_chleni_rechennya_1"),
    ("1.6. Синтаксис. Пунктуація", "Другорядні члени речення", "drugoryadni_chleni_rechennya_1"),
    ("1.6. Синтаксис. Пунктуація", "Односкладні речення", "odnoskladni_rechennya_1"),
    ("1.6. Синтаксис. Пунктуація", "Ускладнене речення: однорідні члени речення", "uskladnene_rechennya_odnoridni_chleni_rechennya"),
    ("1.6. Синтаксис. Пунктуація", "Ускладнене речення: звертання, вставні слова, словосполучення, речення", "uskladnene_rechennya_zvertannya_vstavni_slovahennya"),
    ("1.6. Синтаксис. Пунктуація", "Відокремлені члени речення: відокремлене означення", "vidokremleni_chleni_rechennya_vidokremlene_oznachennya"),
    ("1.6. Синтаксис. Пунктуація", "Відокремлені члени речення: відокремлена обставина", "vidokremleni_chleni_rechennya_vidokremlena_obstavina"),
    ("1.6. Синтаксис. Пунктуація", "Відокремлені члени речення: відокремлений додаток", "vidokremleni_chleni_rechennya_vidokremlenij_dodatok"),
    ("1.6. Синтаксис. Пунктуація", "Складне речення: складносурядне речення", "skladne_rechennya_skladnosuryadne_rechennya"),
    ("1.6. Синтаксис. Пунктуація", "Складне речення: складнопідрядне речення", "skladne_rechennya_skladnopidryadne_rechennya"),
    ("1.6. Синтаксис. Пунктуація", "Складне речення: складне безсполучникове речення", "skladne_rechennya_skladne_bezspoluchnikove_rechennya"),
    ("1.6. Синтаксис. Пунктуація", "Складне речення: складне речення з різними видами зв’язку", "skladne_rechennya_skladne_rechennya_z_riznimi_yazku"),
    ("1.6. Синтаксис. Пунктуація", "Чуже мовлення", "chuzhe_movlennya_1"),
    ("1.6. Синтаксис. Пунктуація", "Засоби міжфразової єдності", "zasobi_mizhfrazovoyi_yednosti"),
]
LETTERS = dict(zip("abcde", "АБВГД"))


SHAPES = {"treug": "△", "treyg": "△", "krug": "○", "kryg": "○", "romb": "◇",
          "kvadrat": "□", "trapeciya": "⏢", "trapec": "⏢"}  # позначки речень у завданнях на порядок
EMPHASIS = {"b": "**", "strong": "**", "i": "*", "em": "*"}  # «виділене слово» в завданнях
BLOCKS = {"p", "div", "tr", "table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"}
ROOT = pathlib.Path(__file__).parent


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=60).read()


def image(src):
    """Фігуру-позначку замінює символом, решту картинок зберігає в zno/img/."""
    if src.startswith("data:"):
        meta, payload = src.split(",", 1)
        name = hashlib.sha1(payload.encode()).hexdigest()[:12] + "." + re.search(r"image/(\w+)", meta).group(1)
        path = ROOT / "img" / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(base64.b64decode(payload))
        return f"![](img/{name})"
    url = urljoin(SITE, src)
    stem = pathlib.PurePosixPath(urlparse(url).path).stem
    if stem in SHAPES:
        return SHAPES[stem]
    name = urlparse(url).path.split("/znotest/")[-1].replace("/", "_")
    path = ROOT / "img" / name
    if not path.exists():
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(fetch(url))
    return f"![](img/{name})"


def render(node):
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return re.sub(r"\s+", " ", str(node))
    if node.name in ("style", "script"):
        return ""
    if node.name == "br":
        return "\n"
    if node.name == "img":
        return image(node["src"])
    inner = "".join(render(c) for c in node.children)
    if node.name == "u":
        return f"<u>{inner}</u>" if inner.strip() else inner
    if node.name in EMPHASIS and inner.strip() and "\n" not in inner and not node.find_parent(node.name):
        mark = EMPHASIS[node.name]
        core = inner.strip()
        return inner[:len(inner) - len(inner.lstrip())] + mark + core + mark + inner[len(inner.rstrip()):]
    if node.name == "li":
        return "\n- " + inner.strip() + "\n"
    if node.name in ("td", "th"):
        return " ".join(inner.split()) + " "
    if node.name in BLOCKS:
        return "\n" + inner + "\n"
    return inner


def text(el):
    """Текст елемента: підкреслення <u>…</u>, жирний і курсив як у Markdown, картинки."""
    s = render(el).replace("</u><u>", "").replace("****", "").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r" *\n[\s]*", "\n", s).strip()


def explanation(el):
    if el is None:
        return ""
    el.find("strong").extract()  # заголовок «Пояснення»
    return text(el)


def items(el):
    return [{"key": a.find("span", class_="marker").extract().get_text(strip=True), "text": text(a)}
            for a in el.select("div.answer")]


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    tasks = []
    for card in soup.select("div.task-card"):
        qid = card.find("input", attrs={"name": "q[id]"})["value"]
        result = card.find("input", attrs={"name": "result"})["value"]
        task = {"id": int(qid), "test": None, "type": "single", "question": text(card.find("div", class_="question"))}
        cols = card.select("div.answers.col")
        if cols:  # «установіть відповідність»
            left, right = cols
            task.update(type="matching",
                        titles=[text(c.find(class_="quest-title")) if c.find(class_="quest-title") else "" for c in cols],
                        left=items(left), right=items(right),
                        answer={pair[:-1]: LETTERS[pair[-1]] for pair in result.split(";")})
        else:
            task["options"] = items(card.find("div", class_="answers"))
            if ";" in result:  # «впишіть цифри»
                task.update(type="multiple", answer=result.split(";"))
            else:
                task["answer"] = LETTERS[result]
        edinfo = card.find("div", class_="edinfo")
        test_no = re.search(r"Тест (\d+)", edinfo.get_text()) if edinfo else None
        task["test"] = int(test_no.group(1)) if test_no else None
        task["explanation"] = explanation(card.find("div", id=f"commentar_{qid}"))
        tasks.append(task)
    return tasks


def answer_str(q):
    if q["type"] == "matching":
        return ", ".join(f"{k} – {v}" for k, v in q["answer"].items())
    return ", ".join(q["answer"]) if q["type"] == "multiple" else q["answer"]


def options_md(opts):
    return [f"- **{o['key']}** {o['text']}".replace("\n", "  \n  ") for o in opts]


def topic_md(t):
    out = [f"# {t['topic']}", "", f"{t['section']} · {len(t['tasks'])} завдань · [джерело]({t['url']})", ""]
    for i, q in enumerate(t["tasks"], 1):
        out += [f"## Завдання {i}", "", q["question"].replace("\n", "\n\n"), ""]
        if q["type"] == "matching":
            for title, side in zip(q["titles"], (q["left"], q["right"])):
                out += ([title if title.startswith("*") else f"*{title}*", ""] if title else []) + options_md(side) + [""]
        else:
            out += options_md(q["options"]) + [""]
        out += [f"**Відповідь: {answer_str(q)}**", ""]
        if q["explanation"]:
            out += ["<details><summary>Пояснення</summary>", "", q["explanation"].replace("\n", "\n\n"), "", "</details>", ""]
    return "\n".join(out).replace("](img/", "](../img/")


def index_md(data):
    out = ["# ЗНО. Українська мова — завдання за темами", "",
           "Джерело: zno.osvita.ua. Підкреслені літери позначено тегом <u>; фігури-позначки речень — символами △ ○ ◇ □ ⏢.",
           f"Усього завдань: {sum(len(t['tasks']) for t in data)}.", ""]
    section = None
    for n, t in enumerate(data, 1):
        if t["section"] != section:
            section = t["section"]
            out += ["", f"## {section}", ""]
        out.append(f"- [{t['topic']}](md/{n:02d}.md) — {len(t['tasks'])}")
    return "\n".join(out) + "\n"


def main():
    data = []
    for section, topic, slug in TOPICS:
        url = f"{SITE}ukrmova/tag-{slug}/"
        tasks = parse(fetch(url).decode("utf-8"))
        print(f"{topic}: {len(tasks)}")
        data.append({"section": section, "topic": topic, "url": url, "tasks": tasks})
        time.sleep(1)
    (ROOT / "ukrmova.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "README.md").write_text(index_md(data), encoding="utf-8")
    (ROOT / "md").mkdir(exist_ok=True)
    for n, t in enumerate(data, 1):
        (ROOT / "md" / f"{n:02d}.md").write_text(topic_md(t), encoding="utf-8")


if __name__ == "__main__":
    main()
