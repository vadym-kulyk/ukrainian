// Читалка: відкриває файл книги, який учень має на своєму пристрої (.fb2, .zip з .fb2, .txt),
// знаходить у ньому частини історій за першими словами («якорями») і зберігає текст
// лише в цьому браузері (IndexedDB). Нікуди текст не надсилається.
window.Reader = (() => {
  const DBN = "meso-books", ST = "texts";

  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction(ST, mode), req = fn(t.objectStore(ST));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  const get = id => tx("readonly", s => s.get(id)).catch(() => null);
  const put = (id, v) => tx("readwrite", s => s.put(v, id));
  const keys = () => tx("readonly", s => s.getAllKeys()).catch(() => []);
  const clear = () => tx("readwrite", s => s.clear());

  // ---------- zip (лише читання; стиснення deflate або без стиснення) ----------
  function unzip(buf) {
    const dv = new DataView(buf);
    let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error("Це не схоже на zip-архів.");
    const n = dv.getUint16(e + 10, true);
    let off = dv.getUint32(e + 16, true);
    const out = [];
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(new Uint8Array(buf, off + 46, nlen));
      off += 46 + nlen + xlen + clen;
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      out.push({ name, method, data: new Uint8Array(buf, start, csize) });
    }
    return out;
  }
  async function inflate(u8) {
    if (!("DecompressionStream" in window)) throw new Error("Браузер не вміє розпаковувати zip. Розпакуй архів і відкрий файл .fb2.");
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function decode(u8) {
    const head = new TextDecoder("latin1").decode(u8.slice(0, 300));
    const m = head.match(/encoding=["']([\w-]+)["']/i);
    try { return new TextDecoder(m ? m[1].toLowerCase() : "utf-8").decode(u8); }
    catch (e) { return new TextDecoder().decode(u8); }
  }

  function fb2paras(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      return xml.replace(/<binary[\s\S]*?<\/binary>/g, "").split(/<\/p>|<\/v>/).map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    }
    const out = [];
    for (const b of doc.getElementsByTagNameNS("*", "body")) {
      if (b.getAttribute("name") === "notes") continue;
      const w = doc.createTreeWalker(b, NodeFilter.SHOW_ELEMENT);
      for (let el = w.currentNode; el; el = w.nextNode()) {
        if (["p", "v", "subtitle"].includes(el.localName)) {
          const t = el.textContent.replace(/\s+/g, " ").trim();
          if (t) out.push(t);
        }
      }
    }
    return out;
  }
  const txtparas = s => s.split(/\r?\n+/).map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);

  async function fileParas(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
    let paras = [];
    if (isZip) {
      for (const f of unzip(buf)) {
        if (!/\.(fb2|txt)$/i.test(f.name)) continue;
        const raw = f.method === 0 ? f.data : await inflate(f.data);
        const text = decode(raw);
        paras = paras.concat(/\.fb2$/i.test(f.name) ? fb2paras(text) : txtparas(text));
      }
    } else {
      const text = decode(u8);
      paras = /<FictionBook/i.test(text.slice(0, 2000)) ? fb2paras(text) : txtparas(text);
    }
    return paras;
  }

  // ---------- пошук частин ----------
  const nk = s => String(s).toLowerCase().replace(/[’ʼ`ʹ‘']/g, "'").replace(/[«»"“”„]/g, "").replace(/[—–‒-]/g, "-").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const STOP = /^(конец ознакомительного|кінець ознайомчого|текст предоставлен|прочитайте эту книгу)/i;

  function locate(norm, anchor) {
    const a = nk(anchor);
    for (let i = 0; i < norm.length; i++) {
      const j = norm[i].indexOf(a);
      if (j >= 0) return { i, w: norm[i].slice(0, j).split(" ").filter(Boolean).length };
    }
    return null;
  }

  function split(paras, stories) {
    const norm = paras.map(nk);
    const points = [];
    for (const s of stories) {
      s.parts.forEach((p, k) => {
        const at = locate(norm, p.anchor);
        if (at) points.push({ s, k, ...at });
      });
      if (s.end) {
        const at = locate(norm, s.end);
        if (at) points.push({ s, k: -1, i: at.i + 1, w: 0, end: true });
      }
    }
    points.sort((a, b) => a.i - b.i || a.w - b.w);
    const stopAt = paras.findIndex(p => STOP.test(p));
    const res = {};
    points.forEach((pt, n) => {
      if (pt.end) return;
      const nx = points[n + 1];
      let endI = nx ? nx.i : paras.length, endW = nx ? nx.w : 0;
      if (stopAt > pt.i && stopAt < endI) { endI = stopAt; endW = 0; }
      const out = [];
      for (let i = pt.i; i <= Math.min(endI, paras.length - 1); i++) {
        let words = paras[i].split(/\s+/);
        if (i === endI) { if (!endW) break; words = words.slice(0, endW); }
        if (i === pt.i) words = words.slice(pt.w);
        const t = words.join(" ").trim();
        if (t) out.push(t);
      }
      if (!nx || nx.s !== pt.s || nx.end) {
        while (out.length > 1 && out[out.length - 1].split(" ").length < 4 && !/^[—–-]/.test(out[out.length - 1])) out.pop();
      }
      (res[pt.s.id] = res[pt.s.id] || {})[pt.k] = out;
    });
    return res;
  }

  async function open(file, stories) {
    const paras = await fileParas(file);
    if (!paras.length) throw new Error("У файлі не знайшлося тексту.");
    const found = split(paras, stories);
    const report = [];
    for (const s of stories) {
      const f = found[s.id];
      if (!f) continue;
      const old = (await get(s.id)) || { parts: [] };
      const parts = s.parts.map((_, k) => f[k] || old.parts[k] || null);
      await put(s.id, { parts, name: file.name, at: Date.now() });
      report.push({ id: s.id, title: s.title, got: parts.filter(Boolean).length, total: s.parts.length });
    }
    return report;
  }

  async function part(storyId, k) {
    const v = await get(storyId);
    return v && v.parts[k] ? v.parts[k] : null;
  }
  async function list() {
    const out = {};
    for (const k of await keys()) { const v = await get(k); if (v) out[k] = { got: v.parts.filter(Boolean).length, name: v.name, at: v.at }; }
    return out;
  }

  return { open, part, list, clear };
})();
