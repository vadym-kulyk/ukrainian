/**
 * «Месопотамія» — збереження профілів і результатів у Google Таблиці.
 * Встановлення: див. mesopotamia/README.md, розділ «Google Таблиця».
 *
 * Аркуші (створюються самі):
 *   Учні          — один рядок на учня: рівень, XP, досягнення, % за кожною історією.
 *   Результати    — кожна завершена спроба частини.
 *   Відкриті      — кожна перевірка відкритої відповіді (текст, бал, знайдені ідеї).
 *   Досягнення    — коли й хто отримав досягнення.
 *   _Дані         — службовий: збережений прогрес профілів (не редагуйте).
 */

const SH = {
  students: "Учні",
  results: "Результати",
  open: "Відкриті",
  ach: "Досягнення",
  data: "_Дані",
};
const HEAD = {
  students: ["ID", "Прізвище", "Ім'я", "Клас", "Рівень", "Назва рівня", "XP", "Досягнень", "Правильних відповідей", "Частин пройдено", "Частин 10/10", "Відкритих ≥60%", "Днів поспіль", "Остання активність", "Список досягнень"],
  results: ["Час", "ID", "Учень", "Клас", "Історія", "Частина", "Назва частини", "Спроба", "Правильно", "З", "%", "Хвилин"],
  open: ["Час", "ID", "Учень", "Клас", "Історія", "№", "Питання", "Відповідь учня", "Бал, %", "Спроба", "Знайдені ідеї"],
  ach: ["Час", "ID", "Учень", "Клас", "Досягнення"],
  data: ["ID", "PIN-хеш", "Оновлено"],
};
const CHUNK = 45000;

function onOpen() {
  SpreadsheetApp.getUi().createMenu("📚 Месопотамія")
    .addItem("Підготувати аркуші", "setup")
    .addItem("Скинути PIN учня…", "resetPin")
    .addToUi();
}

function setup() {
  Object.keys(SH).forEach(k => sheet_(k));
  const d = sheet_("data");
  d.hideSheet();
}

function sheet_(k) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SH[k]);
  if (!sh) {
    sh = ss.insertSheet(SH[k]);
    sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight("bold").setBackground("#eef7d4");
    sh.setFrozenRows(1);
    if (k === "data") sh.hideSheet();
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.a === "exists") {
      return json_({ ok: true, exists: !!findRow_(sheet_("data"), String(p.id || "")) });
    }
    if (p.a === "load") {
      const sh = sheet_("data"), row = findRow_(sh, String(p.id || ""));
      if (!row) return json_({ ok: false, err: "none" });
      const vals = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
      if (vals[1] && vals[1] !== p.h) return json_({ ok: false, err: "pin" });
      const text = vals.slice(3).join("");
      return json_({ ok: true, state: text ? JSON.parse(text) : null });
    }
    return json_({ ok: true, hello: "Месопотамія API працює" });
  } catch (err) {
    return json_({ ok: false, err: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const b = JSON.parse(e.postData.contents);
    if (b.a !== "sync") return json_({ ok: false, err: "unknown" });
    return json_(sync_(b));
  } catch (err) {
    return json_({ ok: false, err: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function sync_(b) {
  const id = String(b.id || "");
  if (!id || !b.h) return { ok: false, err: "bad" };
  const now = new Date();

  // 1. службовий прогрес
  const d = sheet_("data");
  let row = findRow_(d, id);
  if (row) {
    const h = d.getRange(row, 2).getValue();
    if (h && h !== b.h) return { ok: false, err: "pin" };
  } else {
    row = d.getLastRow() + 1;
  }
  const text = JSON.stringify(b.state || {});
  const parts = [];
  for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));
  const width = Math.max(d.getLastColumn(), 3 + parts.length);
  const rowVals = [id, b.h, now].concat(parts);
  while (rowVals.length < width) rowVals.push("");
  if (d.getMaxColumns() < width) d.insertColumnsAfter(d.getMaxColumns(), width - d.getMaxColumns());
  d.getRange(row, 1, 1, width).setValues([rowVals]);

  // 2. зведення в «Учні»
  const s = b.summary || {}, st = sheet_("students");
  let head = st.getRange(1, 1, 1, st.getLastColumn()).getValues()[0];
  const cols = s.cols || {};
  Object.keys(cols).forEach(k => {
    if (head.indexOf(k) < 0) {
      st.getRange(1, head.length + 1).setValue(k).setFontWeight("bold").setBackground("#efe6fb");
      head.push(k);
    }
  });
  const base = {
    "ID": id, "Прізвище": b.last, "Ім'я": b.first, "Клас": b.cls, "Рівень": s.level, "Назва рівня": s.levelName, "XP": s.xp,
    "Досягнень": s.ach, "Правильних відповідей": s.correct, "Частин пройдено": s.partsDone, "Частин 10/10": s.perfect,
    "Відкритих ≥60%": s.openGood, "Днів поспіль": s.streak, "Остання активність": now, "Список досягнень": s.achList,
  };
  const vals = head.map(h => (h in base ? base[h] : h in cols ? cols[h] : ""));
  const sr = findRow_(st, id) || st.getLastRow() + 1;
  st.getRange(sr, 1, 1, vals.length).setValues([vals]);

  // 3. події
  const who = (b.last + " " + b.first).trim();
  const res = [], opn = [], ach = [];
  (b.events || []).forEach(ev => {
    const t = new Date(ev.t || now);
    if (ev.type === "result") res.push([t, id, who, b.cls, ev.story, ev.part, ev.partTitle, ev.att, ev.score, ev.n, Math.round(ev.score / ev.n * 100), ev.min]);
    if (ev.type === "open") opn.push([t, id, who, b.cls, ev.story, ev.n, ev.q, ev.text, ev.score, ev.att, ev.ideas]);
    if (ev.type === "ach") ach.push([t, id, who, b.cls, ev.title]);
  });
  append_("results", res);
  append_("open", opn);
  append_("ach", ach);
  return { ok: true };
}

function append_(k, rows) {
  if (!rows.length) return;
  const sh = sheet_(k);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/** Меню: скинути PIN. Учень зможе ввійти з новим PIN (той, що введе першим). */
function resetPin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Скинути PIN", "Встав ID учня з аркуша «Учні» (стовпчик A):", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const id = r.getResponseText().trim();
  const d = sheet_("data"), row = findRow_(d, id);
  if (!row) return ui.alert("Такого ID немає.");
  d.getRange(row, 2).setValue("");
  ui.alert("Готово. Учень входить через «Я вже маю профіль» з новим PIN.");
}
