(() => {
"use strict";
const CFG = window.MESO_CONFIG || {};
const API = (CFG.API_URL || "").trim();
const TRIES = CFG.OPEN_TRIES || 3;
const STORIES = MESO.stories;
const SBY = Object.fromEntries(STORIES.map(s => [s.id, s]));
const $app = document.getElementById("app");

/* ---------- утиліти ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function seed(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
function shuffle(arr, key) { const r = seed(key), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function orderStart(n, key) { let a = shuffle([...Array(n).keys()], key); if (a.every((v, i) => v === i)) a = a.reverse(); return a; }
const norm = s => String(s || "").toLowerCase().replace(/[’ʼ`ʹ‘]/g, "'").replace(/ё/g, "е").replace(/[«»"“”„.,!?:;()…—–\-]/g, " ").replace(/\s+/g, " ").trim();
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const initials = p => ((p.first || "?")[0] + (p.last || "")[0]).toUpperCase();
const fullName = p => `${p.last} ${p.first}`.trim();
const pk = (sid, i) => `${sid}:${i}`;

function toast(msg, cls = "") {
  const el = document.createElement("div");
  el.className = "toast " + cls; el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), cls ? 4200 : 2600);
}

/* ---------- сховище на пристрої ---------- */
const LS = "meso-v1";
function loadDB() { try { const v = JSON.parse(localStorage.getItem(LS)); if (v && v.profiles) return v; } catch (e) {} return { profiles: {}, current: null, big: false }; }
let DB = loadDB();
function persist() { try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { toast("Не вдалося зберегти на пристрої"); } }
const cur = () => (DB.current ? DB.profiles[DB.current] : null);

function makeId(last, first, cls) { return `${norm(cls).replace(/\s/g, "")}|${norm(last)} ${norm(first)}`; }
async function pinHash(id, pin) {
  const s = `meso:${id}:${pin}`;
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  let h = 0; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 2654435761); return "x" + (h >>> 0).toString(16);
}
function blank(id, first, last, cls, h) {
  return { id, first, last, cls, h, created: Date.now(), updated: Date.now(), parts: {}, open: {}, days: [], flags: {}, run: 0, runBest: 0, ach: {}, outbox: [], syncedAt: 0 };
}

/* ---------- рівні ---------- */
const LEVELS = [
  [0, "Перехожий"], [150, "Пасажир електрички"], [400, "Мешканець набережної"], [800, "Знавець подвір'їв"],
  [1300, "Сусід по під'їзду"], [2000, "Свідок історій"], [2900, "Хранитель мостів"], [4000, "Оповідач"],
  [5300, "Літописець міста"], [6800, "Мудрець межиріччя"], [8500, "Шумер"]
];
function levelOf(xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const [from, name] = LEVELS[i], to = LEVELS[i + 1] ? LEVELS[i + 1][0] : null;
  return { n: i + 1, name, from, to, pct: to ? Math.round((xp - from) / (to - from) * 100) : 100 };
}

/* ---------- підрахунки ---------- */
function partNow(st) { return st ? Object.values(st.ans || {}).filter(a => a.ok).length : 0; }
function storyStats(p, s) {
  let total = 0, best = 0, done = 0, perfect = 0;
  s.parts.forEach((pt, i) => {
    total += pt.q.length;
    const st = p.parts[pk(s.id, i)];
    if (!st) return;
    best += Math.max(st.best || 0, partNow(st));
    if (st.cnt) done++;
    if (st.best === pt.q.length) perfect++;
  });
  let openGood = 0, openDeep = 0, openSum = 0;
  s.open.forEach((_, i) => { const st = p.open[pk(s.id, i)]; if (st) { openSum += st.best || 0; if (st.best >= 60) openGood++; if (st.best >= 80) openDeep++; } });
  return { total, best, done, perfect, openGood, openDeep, openSum, pct: total ? Math.round(best / total * 100) : 0, complete: done === s.parts.length };
}
function stats(p) {
  const c = { xp: 0, answered: 0, correct: 0, partsDone: 0, perfect: 0, storiesDone: 0, openGood: 0, openDeep: 0, openStoryAll: false, per: {} };
  for (const s of STORIES) {
    const ss = storyStats(p, s); c.per[s.id] = ss;
    c.xp += ss.best * 10 + ss.perfect * 20 + Math.round(ss.openSum * 0.3) + (ss.complete ? 100 : 0);
    c.partsDone += ss.done; c.perfect += ss.perfect; c.openGood += ss.openGood; c.openDeep += ss.openDeep;
    if (ss.complete) c.storiesDone++;
    if (s.open.length && ss.openGood === s.open.length) c.openStoryAll = true;
  }
  for (const st of Object.values(p.parts)) {
    c.correct += (st.hist || []).reduce((a, h) => a + h.s, 0) + (st.cnt < st.att ? partNow(st) : 0);
    c.answered += (st.hist || []).reduce((a, h) => a + h.n, 0) + (st.cnt < st.att ? Object.keys(st.ans || {}).length : 0);
  }
  c.level = levelOf(c.xp);
  c.streak = streak(p.days);
  return c;
}
function streak(days) {
  const set = new Set(days); let n = 0; const d = new Date();
  if (!set.has(today(d))) d.setDate(d.getDate() - 1);
  while (set.has(today(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- досягнення ---------- */
const ACH = [
  ["first", "✍️", "Перше слово", "Дай першу відповідь", c => c.answered >= 1],
  ["part", "📗", "Перша частина", "Пройди будь-яку частину до кінця", c => c.partsDone >= 1],
  ["perfect", "🎯", "Без жодної помилки", "10 з 10 у частині", c => c.perfect >= 1],
  ["perfect5", "💎", "П'ять бездоганних", "5 частин на 10 з 10", c => c.perfect >= 5],
  ["perfect15", "👑", "Ювелір", "15 частин на 10 з 10", c => c.perfect >= 15],
  ["story", "📖", "Історію завершено", "Пройди всі частини однієї історії", c => c.storiesDone >= 1],
  ["story3", "🧭", "Три долі", "Заверши три історії", c => c.storiesDone >= 3],
  ["story_all", "🏛️", "Уся Месопотамія", "Заверши всі дев'ять історій", c => c.storiesDone >= STORIES.length],
  ["open1", "💬", "Своїми словами", "Відкрита відповідь на 60% і більше", c => c.openGood >= 1],
  ["open10", "🔍", "Глибокий читач", "10 відкритих відповідей на 80% і більше", c => c.openDeep >= 10],
  ["essay", "🖋️", "Есеїст", "Усі відкриті питання однієї історії на 60%+", c => c.openStoryAll],
  ["c100", "💯", "Сотня", "100 правильних відповідей", c => c.correct >= 100],
  ["c300", "🏃", "Марафон", "300 правильних відповідей", c => c.correct >= 300],
  ["run15", "🎯", "Снайпер", "15 правильних відповідей поспіль", (c, p) => p.runBest >= 15],
  ["streak3", "🔥", "Три дні поспіль", "Працюй три дні поспіль", (c, p) => c.streak >= 3 || p.flags.streak3],
  ["streak7", "📅", "Тиждень із книгою", "Сім днів поспіль", (c, p) => c.streak >= 7 || p.flags.streak7],
  ["night", "🌙", "Нічна зміна", "Відповідай після 22:00", (c, p) => p.flags.night],
  ["early", "🌅", "Ранній птах", "Відповідай до 7:30 ранку", (c, p) => p.flags.early],
  ["comeback", "🔁", "Друга спроба", "Покращ результат частини", (c, p) => p.flags.comeback],
  ["book", "📂", "Відкрита книга", "Відкрий файл книги в читалці", (c, p) => p.flags.book],
  ["lvl5", "🌉", "Сусід по під'їзду", "Досягни 5-го рівня", c => c.level.n >= 5],
  ["lvl8", "🗺️", "Оповідач", "Досягни 8-го рівня", c => c.level.n >= 8],
];
function checkAch(p) {
  const c = stats(p);
  if (c.streak >= 3) p.flags.streak3 = true;
  if (c.streak >= 7) p.flags.streak7 = true;
  for (const [id, ic, title, , test] of ACH) {
    if (!p.ach[id] && test(c, p)) {
      p.ach[id] = Date.now();
      toast(`${ic} Досягнення: ${title}`, "ach");
      p.outbox.push({ type: "ach", t: Date.now(), title: `${ic} ${title}` });
    }
  }
}

/* ---------- синхронізація з Google Таблицею ---------- */
let syncTimer = null, syncing = false;
function summary(p, c) {
  const cols = {};
  for (const s of STORIES) { const ss = c.per[s.id]; cols[`${s.title}, %`] = ss.pct; cols[`${s.title}: відкриті`] = `${ss.openGood}/${s.open.length}`; }
  return {
    level: c.level.n, levelName: c.level.name, xp: c.xp, ach: Object.keys(p.ach).length,
    achList: ACH.filter(a => p.ach[a[0]]).map(a => a[2]).join(", "),
    correct: c.correct, answered: c.answered, partsDone: c.partsDone, perfect: c.perfect, openGood: c.openGood, streak: c.streak, cols
  };
}
function packState(p) { const { outbox, syncErr, ...rest } = p; return rest; }
function scheduleSync(ms = 2500) { if (!API) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  const p = cur(); if (!p || !API || syncing) return;
  syncing = true;
  const events = p.outbox.slice(0, 40);
  const body = { a: "sync", id: p.id, h: p.h, first: p.first, last: p.last, cls: p.cls, summary: summary(p, stats(p)), state: packState(p), events };
  try {
    const r = await fetch(API, { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (j.ok) { p.outbox.splice(0, events.length); p.syncedAt = Date.now(); p.syncErr = ""; if (p.outbox.length) scheduleSync(500); }
    else p.syncErr = j.err === "pin" ? "PIN не збігається з таблицею" : (j.err || "помилка таблиці");
  } catch (e) { p.syncErr = "немає зв'язку з таблицею"; }
  syncing = false; persist(); renderTop();
  const s = document.getElementById("syncState"); if (s) s.outerHTML = syncLine(p);
}
async function apiGet(params) {
  const r = await fetch(API + "?" + new URLSearchParams(params).toString());
  return r.json();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncNow(); });

/* ---------- збереження змін ---------- */
function touch(p) {
  p.updated = Date.now();
  const d = today(); if (!p.days.includes(d)) p.days.push(d);
  if (p.days.length > 400) p.days = p.days.slice(-400);
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 22 || h < 4) p.flags.night = true;
  if (h >= 4 && h < 7.5) p.flags.early = true;
  checkAch(p); persist(); renderTop(); scheduleSync();
}

/* ---------- маршрути ---------- */
let AUTH = { mode: "pick", err: "", pickId: null, busy: false };
const DRAFT = {};
function route() { const h = location.hash.replace(/^#\/?/, ""); return h.split("/").filter(Boolean); }
function go(h) { if (location.hash === h) render(); else location.hash = h; }
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

function renderTop() {
  const p = cur(), me = document.getElementById("me");
  if (!p) { me.hidden = true; return; }
  const c = stats(p);
  me.hidden = false;
  me.innerHTML = `<span class="av">${esc(initials(p))}</span><span class="nm">${esc(p.first)}</span><span class="lv">${c.level.n} рів · ${c.xp} XP</span>`;
}

function render() {
  document.documentElement.classList.toggle("big", !!DB.big);
  renderTop();
  const p = cur(), r = route();
  let html;
  if (!p) html = vAuth();
  else if (r[0] === "s" && SBY[r[1]]) {
    const s = SBY[r[1]];
    if (r[2] === "p" && s.parts[+r[3]]) html = vPart(s, +r[3]);
    else if (r[2] === "open" && s.open.length) html = vOpen(s);
    else html = vStory(s);
  }
  else if (r[0] === "me") html = vMe();
  else if (r[0] === "books") html = vBooks();
  else html = vHome();
  $app.innerHTML = `<div class="view">${html}</div><footer class="foot">created by <b>Vadym Kulyk</b></footer>`;
  afterRender(r);
}

/* ---------- вхід і профілі ---------- */
function vAuth() {
  const list = Object.values(DB.profiles).sort((a, b) => b.updated - a.updated);
  const err = AUTH.err ? `<p class="err">${esc(AUTH.err)}</p>` : "";
  const hero = `<section class="hero"><img class="mark m1" src="img/wave.png" alt=""><img class="mark m2" src="img/spiral.png" alt="">
    <span class="eyebrow">Сергій Жадан · «Месопотамія»</span><h1><span>Месопотамія</span></h1>
    <p class="sub">Дев'ять історій про місто між двома ріками</p>
    <p class="lede">Читай частинами, відповідай на запитання, пиши власні думки — і збирай рівні та досягнення. Прогрес зберігається в профілі.</p></section>`;
  if (AUTH.mode === "pin") {
    const pr = DB.profiles[AUTH.pickId];
    return hero + `<form class="panel" data-form="pin"><h2>${esc(fullName(pr))}</h2><p class="muted">${esc(pr.cls)}</p>
      <div class="field"><label for="pin">PIN-код</label><input class="in" id="pin" name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required autofocus></div>
      ${err}<div class="row"><button class="btn" type="submit">Увійти</button><button class="btn ghost" type="button" data-act="auth" data-mode="pick">Назад</button></div></form>`;
  }
  if (AUTH.mode === "new" || AUTH.mode === "login") {
    const isNew = AUTH.mode === "new";
    return hero + `<form class="panel" data-form="${AUTH.mode}">
      <h2>${isNew ? "Новий профіль" : "Увійти у свій профіль"}</h2>
      <p class="muted">${isNew ? "Запам'ятай PIN: з ним ти зможеш продовжити з будь-якого пристрою." : "Введи ті самі дані й PIN, що й під час створення профілю."}</p>
      <div class="grid2">
        <div class="field"><label for="last">Прізвище</label><input class="in" id="last" name="last" required autocomplete="family-name"></div>
        <div class="field"><label for="first">Ім'я</label><input class="in" id="first" name="first" required autocomplete="given-name"></div>
        <div class="field"><label for="cls">Клас</label><input class="in" id="cls" name="cls" required placeholder="Напр., 11-А"></div>
        <div class="field"><label for="pin">PIN (4 цифри)</label><input class="in" id="pin" name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"></div>
      </div>
      ${err}<div class="row"><button class="btn" type="submit" ${AUTH.busy ? "disabled" : ""}>${AUTH.busy ? "Зачекай…" : isNew ? "Створити профіль" : "Увійти"}</button>
      <button class="btn ghost" type="button" data-act="auth" data-mode="pick">Назад</button></div>
      ${API ? "" : `<p class="tip muted" style="font-size:13px">Таблицю ще не підключено, тому профіль живе лише на цьому пристрої.</p>`}
    </form>`;
  }
  return hero + `<section class="panel"><div class="sec-h"><h2>Хто читає?</h2></div>
    ${list.length ? `<div class="plist">${list.map(pr => { const c = stats(pr); return `<button class="prof" type="button" data-act="prof" data-id="${esc(pr.id)}"><span class="av">${esc(initials(pr))}</span><span><b>${esc(fullName(pr))}</b><small>${esc(pr.cls)} · ${c.level.n} рівень · ${c.xp} XP</small></span></button>`; }).join("")}</div>` : `<p class="muted">На цьому пристрої ще немає профілів.</p>`}
    <div class="row"><button class="btn" type="button" data-act="auth" data-mode="new">Створити профіль</button>
    <button class="btn ghost" type="button" data-act="auth" data-mode="login">Я вже маю профіль</button></div></section>`;
}

async function onAuthSubmit(form) {
  const f = Object.fromEntries(new FormData(form).entries());
  const pin = String(f.pin || "").trim();
  if (!/^\d{4}$/.test(pin)) { AUTH.err = "PIN має складатися з 4 цифр."; return render(); }
  if (form.dataset.form === "pin") {
    const pr = DB.profiles[AUTH.pickId];
    if ((await pinHash(pr.id, pin)) !== pr.h) { AUTH.err = "Неправильний PIN."; return render(); }
    DB.current = pr.id; AUTH = { mode: "pick", err: "" }; persist(); syncNow(); return go("#/");
  }
  const first = f.first.trim(), last = f.last.trim(), cls = f.cls.trim().toUpperCase();
  if (!first || !last || !cls) { AUTH.err = "Заповни всі поля."; return render(); }
  const id = makeId(last, first, cls), h = await pinHash(id, pin);
  AUTH.busy = true; AUTH.err = ""; render();
  try {
    if (form.dataset.form === "new") {
      if (DB.profiles[id]) throw new Error("Такий профіль уже є на цьому пристрої. Обери його в списку.");
      if (API) { const j = await apiGet({ a: "exists", id }); if (j.exists) throw new Error("Такий профіль уже є в таблиці. Натисни «Я вже маю профіль»."); }
      DB.profiles[id] = blank(id, first, last, cls, h);
      DB.current = id; persist(); toast("Профіль створено"); scheduleSync(200);
    } else {
      const local = DB.profiles[id];
      if (local && local.h !== h) throw new Error("Неправильний PIN.");
      let remote = null;
      if (API) {
        const j = await apiGet({ a: "load", id, h });
        if (!j.ok && j.err === "pin") throw new Error("Неправильний PIN.");
        if (!j.ok && !local) throw new Error("Профіль не знайдено. Перевір прізвище, ім'я та клас.");
        if (j.ok && j.state) remote = j.state;
      }
      if (!local && !remote) throw new Error("Профіль не знайдено на цьому пристрої.");
      const pick = remote && (!local || remote.updated > local.updated) ? remote : local;
      DB.profiles[id] = Object.assign(blank(id, first, last, cls, h), pick, { h, outbox: (local && local.outbox) || [] });
      DB.current = id; persist(); toast("З поверненням!");
    }
    AUTH = { mode: "pick", err: "" }; go("#/");
  } catch (e) { AUTH.busy = false; AUTH.err = e.message || "Не вдалося. Спробуй ще раз."; render(); }
}

/* ---------- головна ---------- */
function nextStep(p) {
  for (const s of STORIES) for (let i = 0; i < s.parts.length; i++) { const st = p.parts[pk(s.id, i)]; if (!st || !st.cnt) return { s, i }; }
  return null;
}
function levelCard(c) {
  return `<section class="panel"><div class="lvl"><div class="ring" style="--p:${c.level.pct}"><span>${c.level.n}</span></div>
    <div><span class="eyebrow">Рівень ${c.level.n} з ${LEVELS.length}</span><b>${esc(c.level.name)}</b>
    <div class="bar" style="margin:8px 0 4px"><i style="width:${c.level.pct}%"></i></div>
    <span class="mono muted" style="font-size:12px">${c.xp} XP${c.level.to ? ` · до наступного ${c.level.to - c.xp}` : " · найвищий рівень"}</span></div></div>
    <div class="stats"><div class="stat"><span class="n">${c.partsDone}</span><span class="l">${plural(c.partsDone, "частину", "частини", "частин")} пройдено</span></div>
    <div class="stat"><span class="n">${c.correct}</span><span class="l">правильних відповідей</span></div>
    <div class="stat"><span class="n">${c.streak}🔥</span><span class="l">${plural(c.streak, "день", "дні", "днів")} поспіль</span></div></div></section>`;
}
function vHome() {
  const p = cur(), c = stats(p), nx = nextStep(p);
  const totalParts = STORIES.reduce((a, s) => a + s.parts.length, 0);
  return `<section class="hero"><img class="mark m1" src="img/wave.png" alt=""><img class="mark m2" src="img/spiral.png" alt="">
    <span class="eyebrow">Привіт, ${esc(p.first)}!</span><h1><span>Месопотамія</span></h1>
    <p class="sub">Дев'ять історій · ${totalParts} частин · ${STORIES.reduce((a, s) => a + s.open.length, 0)} відкритих питань</p>
    <div class="row">${nx ? `<a class="btn" href="#/s/${nx.s.id}/p/${nx.i}">${c.answered ? "Продовжити" : "Почати"}: ${esc(nx.s.title)}, частина ${nx.i + 1}</a>` : `<a class="btn" href="#/me">Усе пройдено! Мої досягнення</a>`}
    <a class="btn ghost" href="#/books">📂 Файл книги</a></div></section>
    ${levelCard(c)}
    <div class="sec-h"><h2>Історії</h2><span class="mono">${c.storiesDone}/${STORIES.length} завершено</span></div>
    <div class="stories">${STORIES.map(s => storyCard(s, c.per[s.id])).join("")}</div>`;
}
function storyCard(s, ss) {
  return `<a class="story" href="#/s/${s.id}"><div class="tags">${s.fragment ? `<span class="tag y">ознайомчий фрагмент</span>` : ""}${ss.complete ? `<span class="tag g">✓ пройдено</span>` : ""}</div>
    <h3>${esc(s.title)}</h3><p>${esc(s.sub)}</p>
    <div class="bar"><i style="width:${ss.pct}%"></i></div>
    <div class="meta"><span>${ss.done}/${s.parts.length} ${plural(s.parts.length, "частина", "частини", "частин")}</span><span>${ss.pct}%</span></div></a>`;
}

/* ---------- історія ---------- */
function vStory(s) {
  const p = cur(), ss = storyStats(p, s);
  return `<section class="hero"><img class="mark m1" src="img/spiral.png" alt="">
    <span class="eyebrow">Історія з книги «Месопотамія»</span><h1><span>${esc(s.title)}</span></h1><p class="sub">${esc(s.sub)}</p>
    <div class="bar"><i style="width:${ss.pct}%"></i></div>
    <span class="mono muted" style="font-size:12px">Тести: ${ss.best}/${ss.total} · Відкриті: ${ss.openGood}/${s.open.length} · Бездоганних частин: ${ss.perfect}</span></section>
    ${s.fragment ? `<div class="note"><b>Це ознайомчий фрагмент</b><span>${esc(s.fragment)}</span></div>` : ""}
    <div class="sec-h"><h2>Частини</h2><span class="mono">по ${s.parts[0].q.length} запитань</span></div>
    <div class="parts">${s.parts.map((pt, i) => { const st = p.parts[pk(s.id, i)], n = pt.q.length, now = st ? Object.keys(st.ans || {}).length : 0;
      const cls = st && st.cnt ? "done" : now ? "part" : "";
      return `<a class="pitem ${cls}" href="#/s/${s.id}/p/${i}"><span class="num">${st && st.cnt ? "✓" : i + 1}</span><span><b>${esc(pt.title)}</b>${pt.theme ? `<small>${esc(pt.theme)}</small>` : ""}</span>
      <span class="cnt">${st && st.cnt ? `${st.best}/${n}` : now ? `${now}/${n}…` : `0/${n}`}</span></a>`; }).join("")}
    ${s.open.length ? `<a class="pitem ${ss.openGood === s.open.length ? "done" : ss.openGood ? "part" : ""}" href="#/s/${s.id}/open"><span class="num">✎</span><span><b>Відкриті питання</b><small>Пиши своїми словами — перевірка за ключовими ідеями</small></span><span class="cnt">${ss.openGood}/${s.open.length}</span></a>` : ""}
    </div>
    <div class="row"><a class="btn ghost" href="#/">← Усі історії</a></div>`;
}

/* ---------- частина ---------- */
const KIND = { single: "Один варіант", device: "Художній засіб", multi: "Кілька варіантів", tf: "Правда чи неправда", input: "Впиши відповідь", quote: "Знайди в тексті", match: "Відповідність", order: "Послідовність" };
function getPart(p, s, i) {
  const k = pk(s.id, i);
  if (!p.parts[k]) p.parts[k] = { ans: {}, att: 1, cnt: 0, best: 0, hist: [], t0: null };
  return p.parts[k];
}
function vPart(s, i) {
  const p = cur(), pt = s.parts[i], st = p.parts[pk(s.id, i)] || { ans: {}, att: 1, cnt: 0, best: 0 };
  const n = pt.q.length, answered = Object.keys(st.ans).length, ok = partNow(st);
  const finished = answered === n;
  return `<nav class="chips">${s.parts.map((_, k) => { const x = p.parts[pk(s.id, k)]; return `<a class="chip ${k === i ? "on" : ""} ${x && x.cnt ? "done" : ""}" href="#/s/${s.id}/p/${k}"><span class="d">${x && x.cnt ? "✓" : k + 1}</span>${k === i ? esc(s.parts[k].title) : ""}</a>`; }).join("")}
    ${s.open.length ? `<a class="chip" href="#/s/${s.id}/open"><span class="d">✎</span>Відкриті</a>` : ""}</nav>
    <div class="phead"><span class="eyebrow"><a href="#/s/${s.id}">${esc(s.title)}</a> · частина ${i + 1} з ${s.parts.length}</span><h2>${esc(pt.title)}</h2>
    <div class="tags">${pt.theme ? `<span class="tag">${esc(pt.theme)}</span>` : ""}<span class="tag g">${answered}/${n} · ${ok} правильно</span>${st.cnt ? `<span class="tag y">найкраще: ${st.best}/${n}</span>` : ""}${st.att > 1 ? `<span class="tag">спроба ${st.att}</span>` : ""}</div></div>
    <div id="ptext"></div>
    <div class="qhead"><h3>Перевір себе</h3><span class="mono muted" style="font-size:12px">відповідь зараховується з першої перевірки</span></div>
    ${pt.q.map((q, qi) => vQ(s, i, qi, q, st)).join("")}
    ${finished ? `<section class="result"><span class="eyebrow">Результат спроби ${st.att}</span><span class="big">${ok}/${n}</span>
      <span>${ok === n ? "Бездоганно! +20 XP бонусу" : ok >= n * 0.7 ? "Добре! Перечитай пояснення до помилок." : "Перечитай частину й спробуй ще раз."}</span>
      <div class="row"><button class="btn ghost sm" type="button" data-act="retry" data-s="${s.id}" data-i="${i}">↻ Пройти ще раз</button>${s.open.length ? `<a class="btn violet sm" href="#/s/${s.id}/open">Відкриті питання</a>` : ""}</div></section>` : ""}
    <div class="pager"><a class="btn ghost" href="${i > 0 ? `#/s/${s.id}/p/${i - 1}` : `#/s/${s.id}`}">← ${i > 0 ? "Назад" : "До історії"}</a>
    ${i < s.parts.length - 1 ? `<a class="btn" href="#/s/${s.id}/p/${i + 1}">Далі →</a>` : s.open.length ? `<a class="btn violet" href="#/s/${s.id}/open">Відкриті питання →</a>` : `<a class="btn" href="#/s/${s.id}">Готово</a>`}</div>`;
}
async function fillText(s, i) {
  const box = document.getElementById("ptext"); if (!box) return;
  let paras = null;
  try { paras = await Reader.part(s.id, i); } catch (e) {}
  if (!document.getElementById("ptext")) return;
  if (paras) {
    const words = paras.join(" ").split(/\s+/).length;
    box.innerHTML = `<details class="txt" open><summary>Текст частини <span class="mono muted" style="font-size:12px">≈ ${Math.max(1, Math.round(words / 150))} хв</span></summary>
      <article class="reading">${paras.map(t => `<p class="${/^[—–-]/.test(t) ? "dlg" : ""}">${esc(t)}</p>`).join("")}</article></details>`;
  } else {
    box.innerHTML = `<div class="note v"><b>Текст частини</b><span>Прочитай частину в книжці або відкрий свій файл книги (.fb2, .zip чи .txt) — сайт сам знайде цю частину. Файл відкривається лише в твоєму браузері й нікуди не надсилається.</span>
      <div class="row"><label class="btn violet sm">📂 Відкрити файл<input type="file" accept=".fb2,.zip,.txt" data-file hidden></label><a class="btn ghost sm" href="#/books">Докладніше</a></div></div>`;
  }
}

function vQ(s, i, qi, q, st) {
  const id = `${s.id}:${i}:${qi}`, a = st.ans[qi], locked = !!a;
  const key = `${id}:${st.att || 1}`;
  const val = locked ? a.v : DRAFT[id];
  let body = "", ready = false;
  const btn = (k, cls, label, r) => `<button class="opt ${r ? "r" : ""} ${cls}" type="button" data-act="pick" data-q="${id}" data-v="${k}" ${locked ? "disabled" : ""}><span class="bx">${cls === "good" ? "✓" : cls === "miss" ? "✕" : ""}</span><span>${esc(label)}</span></button>`;
  if (q.t === "single" || q.t === "device" || q.t === "tf") {
    const opts = q.t === "tf" ? ["Правда", "Неправда"] : q.o;
    const order = q.t === "tf" ? [0, 1] : shuffle([...opts.keys()], key);
    const correct = q.t === "tf" ? (q.a ? 0 : 1) : q.a;
    body = `<div class="opts ${q.t === "tf" ? "two" : ""}">${order.map(k => btn(k, locked ? (k === correct ? "good" : val === k ? "miss" : "") : val === k ? "sel" : "", opts[k], true)).join("")}</div>`;
    ready = val != null;
  } else if (q.t === "multi") {
    const sel = val || [];
    body = `<div class="opts">${shuffle([...q.o.keys()], key).map(k => { const on = sel.includes(k), should = q.a.includes(k);
      return btn(k, locked ? (should ? "good" : on ? "miss" : "") : on ? "sel" : "", q.o[k] + (locked && should && !on ? " (пропущено)" : ""), false); }).join("")}</div>`;
    ready = sel.length > 0;
  } else if (q.t === "input" || q.t === "quote") {
    body = `<input class="in" data-inp="${id}" value="${esc(val || "")}" placeholder="${esc(q.ph || "Твоя відповідь")}" ${locked ? "disabled" : ""} autocomplete="off">`;
    ready = !!(val && String(val).trim());
  } else if (q.t === "match") {
    const sel = val || [], ropt = shuffle([...q.r.keys()], key);
    body = `<div class="opts">${q.l.map((l, li) => `<div class="mrow"><span class="ml">${esc(l)}</span>
      <select class="in ${locked ? (sel[li] === li ? "good" : "miss") : ""}" data-sel="${id}" data-li="${li}" ${locked ? "disabled" : ""}><option value="">— обери —</option>${ropt.map(k => `<option value="${k}" ${sel[li] === k ? "selected" : ""}>${esc(q.r[k])}</option>`).join("")}</select>
      ${locked && sel[li] !== li ? `<small class="muted">Правильно: ${esc(q.r[li])}</small>` : ""}</div>`).join("")}</div>`;
    ready = q.l.every((_, li) => sel[li] != null && sel[li] !== "");
  } else if (q.t === "order") {
    const ord = val || orderStart(q.items.length, key);
    if (!locked && !DRAFT[id]) DRAFT[id] = ord;
    body = `<div class="ord">${ord.map((k, pos) => `<div class="oi ${locked ? (k === pos ? "good" : "miss") : ""}"><span class="k">${pos + 1}</span><span>${esc(q.items[k])}</span>
      ${locked ? "" : `<span class="ar"><button type="button" data-act="mv" data-q="${id}" data-pos="${pos}" data-d="-1" ${pos === 0 ? "disabled" : ""} aria-label="Вище">↑</button><button type="button" data-act="mv" data-q="${id}" data-pos="${pos}" data-d="1" ${pos === ord.length - 1 ? "disabled" : ""} aria-label="Нижче">↓</button></span>`}</div>`).join("")}</div>`;
    ready = true;
  }
  let fb = "";
  if (locked) {
    let ca = "";
    if (!a.ok) {
      if (q.t === "input") ca = `Правильна відповідь: <b>${esc(q.a[0])}</b>`;
      if (q.t === "quote") ca = `Наприклад: <b>«${esc(q.a[0])}»</b>`;
      if (q.t === "order") ca = `Правильний порядок: ${q.items.map((t, k) => `${k + 1}) ${esc(t)}`).join("; ")}`;
    }
    fb = `<div class="fb ${a.ok ? "ok" : "bad"}"><b>${a.ok ? "Правильно!" : "Не зовсім."}</b>${esc(q.e || "")}${ca ? `<div class="ca">${ca}</div>` : ""}</div>`;
  }
  return `<article class="q ${locked ? (a.ok ? "ok" : "bad") : ""}" id="q-${qi}"><div class="top2"><span class="no">${qi + 1}</span><div style="display:grid;gap:4px"><span class="kind">${KIND[q.t] || ""}</span><span class="txt">${esc(q.q)}</span></div></div>
    ${body}${locked ? fb : `<div><button class="btn sm" type="button" data-act="check" data-q="${id}" ${ready ? "" : "disabled"}>Перевірити</button></div>`}</article>`;
}
function isRight(q, v) {
  switch (q.t) {
    case "single": case "device": return v === q.a;
    case "tf": return (v === 0) === q.a;
    case "multi": return v.length === q.a.length && q.a.every(x => v.includes(x));
    case "input": return q.a.some(x => norm(x) === norm(v));
    case "quote": { const n = norm(v); return n.length >= 6 && q.a.some(x => n.includes(norm(x))); }
    case "match": return q.l.every((_, i) => v[i] === i);
    case "order": return v.every((k, i) => k === i);
  }
  return false;
}
function onCheck(qid) {
  const [sid, si, sqi] = qid.split(":"), s = SBY[sid], i = +si, qi = +sqi, q = s.parts[i].q[qi], p = cur();
  const st = getPart(p, s, i);
  if (st.ans[qi]) return;
  const v = DRAFT[qid];
  const ok = isRight(q, v);
  if (!st.t0) st.t0 = Date.now();
  st.ans[qi] = { v, ok };
  delete DRAFT[qid];
  p.run = ok ? (p.run || 0) + 1 : 0; p.runBest = Math.max(p.runBest || 0, p.run);
  const n = s.parts[i].q.length;
  if (Object.keys(st.ans).length === n) {
    const score = partNow(st), prev = st.best || 0;
    if (st.cnt >= 1 && score > prev) p.flags.comeback = true;
    st.cnt = st.att; st.best = Math.max(prev, score);
    const min = Math.max(1, Math.round((Date.now() - st.t0) / 60000));
    st.hist.push({ d: Date.now(), s: score, n, att: st.att, min });
    p.outbox.push({ type: "result", t: Date.now(), story: s.title, part: i + 1, partTitle: s.parts[i].title, att: st.att, score, n, min });
    toast(score === n ? `Бездоганно: ${score}/${n}!` : `Частину пройдено: ${score}/${n}`);
  }
  touch(p);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

/* ---------- відкриті питання ---------- */
function scoreOpen(q, text) {
  const n = " " + norm(text) + " ";
  const words = n.trim().split(" ").filter(Boolean);
  // ключ «слово=» — лише ціле слово; інакше — початок слова (основа)
  const hit = st => st.endsWith("=") ? n.includes(" " + norm(st.slice(0, -1)) + " ") : n.includes(" " + norm(st));
  const found = q.keys.map((g, gi) => g.k.some(hit) ? gi : -1).filter(gi => gi >= 0);
  if (String(text).trim().length < q.min) return { score: 0, found, short: true };
  let score = Math.min(1, found.length / q.need);
  if (new Set(words).size < 25) score *= 0.6;
  return { score: Math.round(score * 100), found };
}
function vOpen(s) {
  const p = cur(), ss = storyStats(p, s);
  return `<nav class="chips">${s.parts.map((_, k) => { const x = p.parts[pk(s.id, k)]; return `<a class="chip ${x && x.cnt ? "done" : ""}" href="#/s/${s.id}/p/${k}"><span class="d">${x && x.cnt ? "✓" : k + 1}</span></a>`; }).join("")}<a class="chip on" href="#/s/${s.id}/open"><span class="d">✎</span>Відкриті</a></nav>
    <div class="phead"><span class="eyebrow"><a href="#/s/${s.id}">${esc(s.title)}</a> · відкриті питання</span><h2>Своїми словами</h2>
    <div class="tags"><span class="tag g">${ss.openGood}/${s.open.length} на 60%+</span><span class="tag">до ${TRIES} перевірок на питання</span></div></div>
    <div class="note"><b>Як перевіряється</b><span>Сайт шукає у твоїй відповіді ключові ідеї (не точні слова, а думки: героїв, деталі, причини). Що більше ідей ти розкриєш і пояснив(-ла), то вищий бал. Після перевірки видно, яких ідей бракує. Зразок відповіді з'являється, коли спроби закінчаться або ти сам(-а) його відкриєш — після цього відповідь уже не змінити.</span></div>
    ${s.open.map((q, qi) => vOQ(s, qi, q, p.open[pk(s.id, qi)])).join("")}
    <div class="row"><a class="btn ghost" href="#/s/${s.id}">← До історії</a></div>`;
}
function vOQ(s, qi, q, st) {
  st = st || { text: "", best: 0, tries: 0, locked: false };
  const id = `${s.id}:${qi}`, text = DRAFT["o:" + id] ?? st.text ?? "";
  const last = st.last;
  return `<article class="q oq ${st.locked ? (st.best >= 60 ? "ok" : "bad") : ""}" id="o-${qi}"><div class="top2"><span class="no">${qi + 1}</span><span class="txt">${esc(q.q)}</span></div>
    <textarea class="in" data-otext="${id}" ${st.locked ? "disabled" : ""} placeholder="Мінімум ${q.min} знаків. Пиши повними реченнями, спирайся на деталі тексту.">${esc(text)}</textarea>
    <div class="row" style="justify-content:space-between"><span class="cnt ${text.trim().length >= q.min ? "ok" : ""}" data-ocnt="${id}">${text.trim().length}/${q.min}</span>
    ${st.locked ? `<span class="mono">Бал: <b>${st.best}%</b></span>` : `<span class="row"><button class="btn sm" type="button" data-act="ocheck" data-o="${id}">Перевірити (${TRIES - (st.tries || 0)})</button>${st.tries ? `<button class="btn ghost sm" type="button" data-act="olock" data-o="${id}">Зразок і завершити</button>` : ""}</span>`}</div>
    ${last ? `<div class="fb ${last.score >= 60 ? "ok" : "bad"}"><b>${last.short ? `Закоротко: потрібно щонайменше ${q.min} знаків.` : `Бал: ${last.score}%${st.best > last.score ? ` (найкращий ${st.best}%)` : ""}`}</b>
      <div class="ideas">${q.keys.map((g, gi) => `<span class="idea ${last.found.includes(gi) ? "ok" : "no"}">${last.found.includes(gi) ? "✓ " : ""}${esc(g.l)}</span>`).join("")}</div>
      <small class="muted">Для 100% достатньо ${q.need} ${plural(q.need, "ідеї", "ідей", "ідей")} з ${q.keys.length}.</small></div>` : ""}
    ${st.locked ? `<div class="model"><b>Зразок відповіді.</b> ${esc(q.model)}</div>` : ""}</article>`;
}
function onOpenCheck(oid, lockOnly) {
  const [sid, sqi] = oid.split(":"), s = SBY[sid], qi = +sqi, q = s.open[qi], p = cur();
  const k = pk(sid, qi);
  const st = p.open[k] || (p.open[k] = { text: "", best: 0, tries: 0, locked: false });
  if (st.locked) return;
  if (lockOnly) { st.locked = true; touch(p); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const text = DRAFT["o:" + oid] ?? st.text ?? "";
  const r = scoreOpen(q, text);
  st.text = text; st.last = r;
  if (!r.short) {
    st.tries = (st.tries || 0) + 1;
    st.best = Math.max(st.best || 0, r.score);
    if (st.tries >= TRIES || r.score === 100) st.locked = true;
    p.outbox.push({ type: "open", t: Date.now(), story: s.title, n: qi + 1, q: q.q, text, score: r.score, att: st.tries, ideas: r.found.map(i => q.keys[i].l).join("; ") });
  }
  delete DRAFT["o:" + oid];
  touch(p);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

/* ---------- профіль ---------- */
function syncLine(p) {
  if (!API) return `<span class="sync" id="syncState">💾 Зберігається лише на цьому пристрої (таблицю не підключено)</span>`;
  if (p.syncErr) return `<span class="sync bad" id="syncState">⚠️ ${esc(p.syncErr)}${p.outbox.length ? ` · у черзі ${p.outbox.length}` : ""}</span>`;
  if (p.syncedAt) return `<span class="sync ok" id="syncState">☁️ Збережено в таблиці о ${new Date(p.syncedAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}${p.outbox.length ? ` · у черзі ${p.outbox.length}` : ""}</span>`;
  return `<span class="sync" id="syncState">☁️ Ще не синхронізовано</span>`;
}
function vMe() {
  const p = cur(), c = stats(p), got = ACH.filter(a => p.ach[a[0]]).length;
  return `<section class="hero"><span class="eyebrow">${esc(p.cls)}</span><h1><span>${esc(p.first)}</span></h1><p class="sub">${esc(fullName(p))}</p>
    <div class="row">${syncLine(p)}</div>
    <div class="row">${API ? `<button class="btn ghost sm" type="button" data-act="sync">Зберегти зараз</button>` : ""}<button class="btn ghost sm" type="button" data-act="logout">Вийти з профілю</button></div></section>
    ${levelCard(c)}
    <div class="sec-h"><h2>Досягнення</h2><span class="mono">${got}/${ACH.length}</span></div>
    <div class="achs">${ACH.map(([id, ic, t, d]) => `<div class="ach ${p.ach[id] ? "" : "off"}"><span class="ic">${ic}</span><b>${esc(t)}</b><small>${esc(d)}</small>${p.ach[id] ? `<small class="mono">${new Date(p.ach[id]).toLocaleDateString("uk-UA")}</small>` : ""}</div>`).join("")}</div>
    <div class="sec-h"><h2>Прогрес за історіями</h2></div>
    <section class="panel"><table class="table"><thead><tr><th>Історія</th><th class="r">Тести</th><th class="r">Відкриті</th><th class="r">%</th></tr></thead>
    <tbody>${STORIES.map(s => { const ss = c.per[s.id]; return `<tr><td><a href="#/s/${s.id}">${esc(s.title)}</a></td><td class="r">${ss.best}/${ss.total}</td><td class="r">${ss.openGood}/${s.open.length}</td><td class="r">${ss.pct}</td></tr>`; }).join("")}</tbody></table></section>
    <section class="panel"><div class="sec-h"><h2>Рівні</h2></div><table class="table"><tbody>${LEVELS.map(([xp, n], k) => `<tr ${c.level.n === k + 1 ? 'style="font-weight:800"' : ""}><td>${k + 1}. ${esc(n)}</td><td class="r">${xp} XP</td></tr>`).join("")}</tbody></table>
    <p class="muted" style="font-size:13.5px">XP: 10 за кожну правильну відповідь (зараховується найкраща спроба частини), +20 за частину без помилок, до 30 за відкриту відповідь, +100 за завершену історію.</p></section>`;
}

/* ---------- файл книги ---------- */
function vBooks() {
  return `<div class="phead"><span class="eyebrow">Читалка</span><h2>Файл книги</h2></div>
    <div class="note v"><b>Як це працює</b><span>Відкрий файл «Месопотамії» або окремої історії, який маєш на своєму пристрої: .fb2, .zip із .fb2 або .txt. Сайт знайде в ньому частини історій і показуватиме текст над запитаннями. Файл обробляється лише в твоєму браузері: текст не надсилається в інтернет і не зберігається на сайті.</span></div>
    <label class="drop" id="drop"><span style="font-size:34px">📂</span><b>Обери файл або перетягни його сюди</b><span class="muted" style="font-size:13px">Можна кілька файлів по черзі — кожен доповнює вже знайдене</span><input type="file" accept=".fb2,.zip,.txt" data-file multiple hidden><span class="btn violet sm">Обрати файл</span></label>
    <div id="bookList" class="panel"><p class="muted">Завантаження…</p></div>
    <div class="row"><a class="btn ghost" href="#/">← На головну</a><button class="btn danger sm" type="button" data-act="clearbooks">Видалити тексти з цього браузера</button></div>`;
}
async function fillBooks() {
  const box = document.getElementById("bookList"); if (!box) return;
  let have = {}; try { have = await Reader.list(); } catch (e) {}
  box.innerHTML = `<table class="table"><thead><tr><th>Історія</th><th class="r">Знайдено частин</th></tr></thead><tbody>${STORIES.map(s => { const h = have[s.id];
    return `<tr><td>${esc(s.title)}${h ? `<br><small class="muted">${esc(h.name)}</small>` : ""}</td><td class="r">${h ? `${h.got}/${s.parts.length}` : "—"}</td></tr>`; }).join("")}</tbody></table>`;
}
async function openFiles(files) {
  const p = cur();
  for (const f of files) {
    try {
      const rep = await Reader.open(f, STORIES);
      if (!rep.length) toast(`У «${f.name}» не знайшлося частин історій`);
      else { toast(`Знайдено: ${rep.map(r => `${r.title} ${r.got}/${r.total}`).join(", ")}`); if (p) { p.flags.book = true; touch(p); } }
    } catch (e) { toast(e.message || "Не вдалося відкрити файл"); }
  }
  render();
}

/* ---------- після рендеру й події ---------- */
function afterRender(r) {
  if (r[0] === "s" && r[2] === "p") fillText(SBY[r[1]], +r[3]);
  if (r[0] === "books") {
    fillBooks();
    const d = document.getElementById("drop");
    if (d) {
      d.addEventListener("dragover", e => { e.preventDefault(); d.classList.add("over"); });
      d.addEventListener("dragleave", () => d.classList.remove("over"));
      d.addEventListener("drop", e => { e.preventDefault(); d.classList.remove("over"); openFiles([...e.dataTransfer.files]); });
    }
  }
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "auth") { AUTH = { mode: b.dataset.mode, err: "" }; return render(); }
  if (act === "prof") { AUTH = { mode: "pin", err: "", pickId: b.dataset.id }; return render(); }
  if (act === "pick") {
    const qid = b.dataset.q, [sid, si, sqi] = qid.split(":"), q = SBY[sid].parts[+si].q[+sqi], v = +b.dataset.v;
    if (q.t === "multi") { const cur = DRAFT[qid] || []; DRAFT[qid] = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]; }
    else DRAFT[qid] = v;
    return rerenderQ(qid);
  }
  if (act === "mv") {
    const qid = b.dataset.q, pos = +b.dataset.pos, d = +b.dataset.d, a = DRAFT[qid].slice();
    [a[pos], a[pos + d]] = [a[pos + d], a[pos]]; DRAFT[qid] = a; return rerenderQ(qid);
  }
  if (act === "check") return onCheck(b.dataset.q);
  if (act === "retry") {
    const p = cur(), s = SBY[b.dataset.s], st = getPart(p, s, +b.dataset.i);
    st.att += 1; st.ans = {}; st.t0 = null; persist(); render(); window.scrollTo(0, 0); return;
  }
  if (act === "ocheck") return onOpenCheck(b.dataset.o, false);
  if (act === "olock") return onOpenCheck(b.dataset.o, true);
  if (act === "logout") { syncNow(); DB.current = null; persist(); AUTH = { mode: "pick", err: "" }; return go("#/"); }
  if (act === "sync") return syncNow();
  if (act === "clearbooks") { if (confirm("Видалити всі відкриті тексти з цього браузера? Прогрес профілю залишиться.")) Reader.clear().then(() => { toast("Тексти видалено"); render(); }); }
});
function rerenderQ(qid) {
  const [sid, si, sqi] = qid.split(":"), s = SBY[sid], i = +si, qi = +sqi;
  const st = cur().parts[pk(sid, i)] || { ans: {}, att: 1 };
  const el = document.getElementById("q-" + qi);
  if (el) el.outerHTML = vQ(s, i, qi, s.parts[i].q[qi], st);
}
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.inp) {
    DRAFT[t.dataset.inp] = t.value;
    const btn = t.closest(".q").querySelector('[data-act="check"]'); if (btn) btn.disabled = !t.value.trim();
  }
  if (t.dataset.otext) {
    DRAFT["o:" + t.dataset.otext] = t.value;
    const [sid, qi] = t.dataset.otext.split(":"), q = SBY[sid].open[+qi];
    const c = document.querySelector(`[data-ocnt="${t.dataset.otext}"]`);
    if (c) { c.textContent = `${t.value.trim().length}/${q.min}`; c.classList.toggle("ok", t.value.trim().length >= q.min); }
    const p = cur(), st = p.open[pk(sid, qi)] || (p.open[pk(sid, qi)] = { text: "", best: 0, tries: 0, locked: false });
    st.text = t.value; persist();
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.sel) {
    const qid = t.dataset.sel, li = +t.dataset.li, a = (DRAFT[qid] || []).slice();
    a[li] = t.value === "" ? null : +t.value; DRAFT[qid] = a; rerenderQ(qid);
  }
  if (t.dataset.file != null && t.files && t.files.length) openFiles([...t.files]);
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault(); onAuthSubmit(f);
});
document.getElementById("fontBtn").addEventListener("click", () => { DB.big = !DB.big; persist(); render(); });

render();
if (cur()) scheduleSync(1500);
})();
