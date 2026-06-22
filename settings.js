/* =========================================================================
   Ordkollen – INSTÄLLNINGAR (/settings) + smarta funktioner + synk + footer
   + INTERNATIONELLT SPRÅK: hela appen OCH orden/synonymerna översätts
   automatiskt till valt språk (maskinöversättning, kräver internet).
   Fristående lager – rör inte kärnlogiken i app.js.
   ========================================================================= */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ---------- localStorage ---------- */
  const LS_USERS = "ordkollen_users";
  const LS_SESSION = "ordkollen_session";
  const LS_THEME = "ordkollen_theme";
  const LS_LANG = "ordkollen_lang";
  function load(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); if(window.pushCloudProfile) window.pushCloudProfile(); }
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i); return (h >>> 0).toString(16); }

  function user() { return load(LS_SESSION, null); }
  const kProfile = (u) => `ordkollen_profile_${u}`;
  const kSettings = (u) => `ordkollen_settings_${u}`;
  const kStats = (u) => `ordkollen_stats_${u}`;
  const kSaved = (u) => `ordkollen_saved_${u}`;

  const DEF_SETTINGS = {
    autoTheme: false, dnd: false, dndStart: "22:00", dndEnd: "07:00",
    breakReminders: false, battery: true, persona: "standard"
  };
  function getSettings() { return Object.assign({}, DEF_SETTINGS, load(kSettings(user()), {})); }
  function setSettings(s) { save(kSettings(user()), s); }
  function getProfile() { return load(kProfile(user()), {}); }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $("okToast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* =========================================================================
     SPRÅK – maskinöversättning av hela appen + orden
     ========================================================================= */
  // Google-kompatibla språkkoder. Namn visas på språket självt + svenska.
  const LANGS = [
    ["sv", "Svenska"], ["en", "English"], ["es", "Español"], ["fr", "Français"],
    ["de", "Deutsch"], ["it", "Italiano"], ["pt", "Português"], ["nl", "Nederlands"],
    ["no", "Norsk"], ["da", "Dansk"], ["fi", "Suomi"], ["is", "Íslenska"],
    ["pl", "Polski"], ["cs", "Čeština"], ["sk", "Slovenčina"], ["hu", "Magyar"],
    ["ro", "Română"], ["bg", "Български"], ["el", "Ελληνικά"], ["uk", "Українська"],
    ["ru", "Русский"], ["sr", "Српски"], ["hr", "Hrvatski"], ["sl", "Slovenščina"],
    ["lt", "Lietuvių"], ["lv", "Latviešu"], ["et", "Eesti"], ["tr", "Türkçe"],
    ["ar", "العربية"], ["he", "עברית"], ["fa", "فارسی"], ["ur", "اردو"],
    ["hi", "हिन्दी"], ["bn", "বাংলা"], ["pa", "ਪੰਜਾਬੀ"], ["ta", "தமிழ்"],
    ["te", "తెలుగు"], ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["mr", "मराठी"],
    ["gu", "ગુજરાતી"], ["ne", "नेपाली"], ["si", "සිංහල"], ["th", "ไทย"],
    ["lo", "ລາວ"], ["km", "ខ្មែរ"], ["my", "မြန်မာ"], ["vi", "Tiếng Việt"],
    ["id", "Indonesia"], ["ms", "Melayu"], ["tl", "Filipino"], ["jv", "Jawa"],
    ["zh-CN", "中文 (简体)"], ["zh-TW", "中文 (繁體)"], ["ja", "日本語"], ["ko", "한국어"],
    ["sw", "Kiswahili"], ["am", "አማርኛ"], ["ha", "Hausa"], ["yo", "Yorùbá"],
    ["ig", "Igbo"], ["zu", "isiZulu"], ["xh", "isiXhosa"], ["af", "Afrikaans"],
    ["so", "Soomaali"], ["mg", "Malagasy"], ["ny", "Chichewa"], ["st", "Sesotho"],
    ["sn", "Shona"], ["rw", "Kinyarwanda"], ["ga", "Gaeilge"], ["cy", "Cymraeg"],
    ["gl", "Galego"], ["ca", "Català"], ["eu", "Euskara"], ["sq", "Shqip"],
    ["mk", "Македонски"], ["bs", "Bosanski"], ["hy", "Հայերեն"], ["ka", "ქართული"],
    ["az", "Azərbaycan"], ["kk", "Қазақ"], ["uz", "Oʻzbek"], ["ky", "Кыргызча"],
    ["tg", "Тоҷикӣ"], ["mn", "Монгол"], ["ps", "پښتو"], ["ku", "Kurdî"],
    ["mt", "Malti"], ["lb", "Lëtzebuergesch"], ["fy", "Frysk"], ["la", "Latina"],
    ["eo", "Esperanto"], ["ht", "Kreyòl"], ["haw", "ʻŌlelo Hawaiʻi"], ["mi", "Te Reo Māori"],
    ["sm", "Gagana Samoa"], ["co", "Corsu"], ["gd", "Gàidhlig"]
  ];

  function getLang() { return load(LS_LANG, "sv"); }

  // Översättningscache i localStorage: { "lang|hash": "text" }
  function trCache() { return load("ordkollen_tr", {}); }
  function trCacheSave(c) { try { save("ordkollen_tr", c); } catch (e) {} }

  // Anropa gtx-endpointen (ingen nyckel krävs). texts = array, returnerar array.
  async function gtx(texts, sl, tl) {
    const joined = texts.join("\n");
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(joined)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    let out = ""; (j[0] || []).forEach(seg => { if (seg && seg[0]) out += seg[0]; });
    let parts = out.split("\n");
    if (parts.length !== texts.length) {
      // Fallback: översätt en och en
      const res = [];
      for (const t of texts) {
        try {
          const u2 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(t)}`;
          const r2 = await fetch(u2); const j2 = await r2.json();
          res.push((j2[0] || []).map(s => s[0]).join("") || t);
        } catch (e) { res.push(t); }
      }
      return res;
    }
    return parts;
  }

  // Översätt en lista unika strängar (med cache). sl=källa, tl=mål.
  async function translateMany(strings, sl, tl) {
    const cache = trCache();
    const out = {}; const need = [];
    strings.forEach(s => {
      const key = tl + "|" + hash(sl + ":" + s);
      if (cache[key] != null) out[s] = cache[key]; else need.push(s);
    });
    // Hämta alla saknade bitar PARALLELLT (inte en i taget) – mycket snabbare.
    const chunks = [];
    for (let i = 0; i < need.length; i += 40) chunks.push(need.slice(i, i + 40));
    const results = await Promise.all(chunks.map(c => gtx(c, sl, tl).catch(() => c)));
    results.forEach((res, ci) => {
      chunks[ci].forEach((s, idx) => {
        const val = (res[idx] != null && res[idx] !== "") ? res[idx] : s;
        out[s] = val; cache[tl + "|" + hash(sl + ":" + s)] = val;
      });
    });
    trCacheSave(cache);
    return out;
  }

  // Synkron cache-uppslagning: returnerar bara det som redan är översatt (ingen väntan).
  function cachedMap(strings, sl, tl) {
    const cache = trCache(); const out = {};
    strings.forEach(s => { const k = tl + "|" + hash(sl + ":" + s); if (cache[k] != null) out[s] = cache[k]; });
    return out;
  }

  async function translateText(text, sl, tl) {
    if (!text || sl === tl) return text;
    const m = await translateMany([text.replace(/\s+/g, " ").trim()], sl, tl);
    return m[text.replace(/\s+/g, " ").trim()] || text;
  }

  // ---- DOM-text: samla, översätt, applicera. Original sparas på noden. ----
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "SELECT", "CODE"]);
  function collectTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let p = n.parentElement;
        while (p) {
          if (SKIP_TAGS.has(p.tagName) || p.hasAttribute("data-noi18n")) return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n; while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  let translating = false;
  let appliedLang = "sv";   // vilket språk sidan FAKTISKT visas på just nu
  async function translateDOM(tl, root) {
    if (tl === "sv") return;
    const nodes = root ? textNodesIn(root) : collectTextNodes();
    const uniques = new Set();
    nodes.forEach(n => {
      if (n._okOrig == null) n._okOrig = n.nodeValue;       // spara original (svenska)
      const s = n._okOrig.replace(/\s+/g, " ").trim();
      if (s) uniques.add(s);
    });
    // placeholders
    const ph = [];
    document.querySelectorAll("input[placeholder]").forEach(el => {
      if (el.closest("[data-noi18n]")) return;
      if (el._okPh == null) el._okPh = el.getAttribute("placeholder");
      if (el._okPh) { uniques.add(el._okPh.replace(/\s+/g, " ").trim()); ph.push(el); }
    });
    if (!uniques.size) return;

    const uniqArr = [...uniques];
    // Hjälpare som skriver in en översättnings-map i DOM:en.
    const applyMap = (map) => {
      nodes.forEach(n => {
        const s = (n._okOrig || "").replace(/\s+/g, " ").trim();
        if (s && map[s]) n.nodeValue = (n._okOrig.match(/^\s*/)[0]) + map[s] + (n._okOrig.match(/\s*$/)[0]);
      });
      ph.forEach(el => { const s = (el._okPh || "").replace(/\s+/g, " ").trim(); if (map[s]) el.setAttribute("placeholder", map[s]); });
    };

    // 1) OMEDELBART: tillämpa allt som redan finns i cachen, helt utan att vänta på nätet.
    applyMap(cachedMap(uniqArr, "sv", tl));

    // 2) Hämta bara det som ännu inte är cachat och tillämpa när det kommer.
    const map = await translateMany(uniqArr, "sv", tl);
    applyMap(map);
  }
  function textNodesIn(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let p = n.parentElement;
        while (p && p !== root.parentElement) { if (SKIP_TAGS.has(p.tagName) || p.hasAttribute("data-noi18n")) return NodeFilter.FILTER_REJECT; p = p.parentElement; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n; while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }
  function restoreSwedish() {
    collectTextNodes(); // not needed but harmless
    // återställ från sparade original via en full genomgång
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let n; while ((n = walker.nextNode())) { if (n._okOrig != null) n.nodeValue = n._okOrig; }
    document.querySelectorAll("input[placeholder]").forEach(el => { if (el._okPh != null) el.setAttribute("placeholder", el._okPh); });
  }

  // ---- Observera dynamiskt innehåll (sökresultat m.m.) ----
  let obsTimer = null; const pendingRoots = [];
  function observeDynamic() {
    const app = $("appView"); if (!app || !("MutationObserver" in window)) return;
    new MutationObserver((muts) => {
      if (getLang() === "sv") return;
      muts.forEach(m => m.addedNodes.forEach(node => { if (node.nodeType === 1) pendingRoots.push(node); }));
      clearTimeout(obsTimer);
      obsTimer = setTimeout(async () => {
        const roots = pendingRoots.splice(0); const tl = getLang();
        for (const r of roots) { if (r.isConnected) { try { await translateDOM(tl, r); } catch (e) {} } }
      }, 250);
    }).observe(app, { childList: true, subtree: true });
  }

  // ---- Sök på valfritt språk: översätt query → svenska innan uppslag ----
  let searchBypass = false;
  function hookSearch() {
    const inp = $("searchInput"), btn = $("searchBtn"); if (!inp || !btn) return;
    const handler = (e) => {
      if (searchBypass || getLang() === "sv") return;
      if (e.type === "keydown" && e.key !== "Enter") return;
      const v = inp.value.trim(); if (!v) return;
      e.preventDefault(); e.stopImmediatePropagation();
      // sl="auto": låt Google upptäcka vilket språk användaren faktiskt skrev,
      // istället för att anta att det alltid är det valda gränssnittsspråket.
      translateText(v, "auto", "sv").then(sv => {
        inp.value = sv; searchBypass = true; btn.click(); searchBypass = false;
        setTimeout(() => { inp.value = v; }, 50);
      }).catch(() => { searchBypass = true; btn.click(); searchBypass = false; });
    };
    inp.addEventListener("keydown", handler, true);
    btn.addEventListener("click", handler, true);
  }

  async function applyLang(lang) {
    save(LS_LANG, lang);
    document.documentElement.setAttribute("lang", lang);
    if ($("langSelect")) $("langSelect").value = lang;
    if (lang === "sv") { restoreSwedish(); appliedLang = "sv"; return; }
    if (translating) return; translating = true;
    toast("🌐 Översätter…");
    try { await translateDOM(lang); appliedLang = lang; toast("✅ Klart"); }
    catch (e) { toast("⚠️ Översättning misslyckades (internet?)"); }
    finally { translating = false; }
  }

  // Exponera så att molnsynken (app.js) kan tillämpa ett språk som ändrats på en annan enhet.
  // Hoppar över om sidan redan visas på det språket (undviker dubbelarbete och flimmer).
  window.OrdkollenApplyLang = function (l) {
    try { if (!l || l === appliedLang) return; return applyLang(l); } catch (e) {}
  };
  // Uppdatera språkväljaren utan att rendera om sidan (används av molnsynken).
  window.OrdkollenSyncLangSelect = function (l) { try { if ($("langSelect") && l) $("langSelect").value = l; } catch (e) {} };

  function buildLangOptions() {
    const sel = $("langSelect"); if (!sel) return;
    sel.setAttribute("data-noi18n", "");
    const cur = getLang();
    const fixed = LANGS.slice(0, 1); // Svenska först
    const rest = LANGS.slice(1).sort((a, b) => a[1].localeCompare(b[1], "sv"));
    sel.innerHTML = [...fixed, ...rest].map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
    sel.value = cur;
  }

  /* =========================================================================
     DRAWER
     ========================================================================= */
  function openDrawer() {
    if (!user()) { toast("Logga in först."); return; }
    loadIntoForm();
    $("okDrawerScrim").classList.remove("hidden");
    $("okDrawer").classList.add("open");
    $("okDrawer").setAttribute("aria-hidden", "false");
    if (location.hash !== "#settings") history.replaceState(null, "", "#settings");
  }
  function closeDrawer() {
    $("okDrawer").classList.remove("open");
    $("okDrawer").setAttribute("aria-hidden", "true");
    setTimeout(() => $("okDrawerScrim").classList.add("hidden"), 280);
    if (location.hash === "#settings") history.replaceState(null, "", location.pathname + location.search);
  }

  function loadIntoForm() {
    const u = user(); if (!u) return;
    const users = load(LS_USERS, {});
    const p = getProfile(), s = getSettings();
    $("okDisplayName").value = p.displayName || (users[u] && users[u].name) || "";
    $("okEmail").value = p.email || (u.includes("@") ? u : "");
    $("okNewPass").value = "";
    $("okAutoTheme").checked = s.autoTheme;
    $("okDnd").checked = s.dnd; $("okDndStart").value = s.dndStart; $("okDndEnd").value = s.dndEnd;
    $("okDndTimes").classList.toggle("hidden", !s.dnd);
    $("okBreak").checked = s.breakReminders;
    $("okBattery").checked = s.battery;
    $("okPersona").value = s.persona;
    if ($("langSelect")) $("langSelect").value = getLang();
    renderStats();
  }

  /* =========================================================================
     PROFIL & KONTO
     ========================================================================= */
  function saveProfile() {
    const u = user(); if (!u) return;
    const users = load(LS_USERS, {});
    const name = $("okDisplayName").value.trim();
    const email = $("okEmail").value.trim();
    const newPass = $("okNewPass").value;
    const p = getProfile();
    if (name) { p.displayName = name; if (users[u]) users[u].name = name; }
    p.email = email;
    if (newPass) {
      if (newPass.length < 4) { toast("Lösenord måste vara minst 4 tecken."); return; }
      if (users[u]) users[u].pass = hash(newPass);
    }
    save(kProfile(u), p); save(LS_USERS, users);
    const w = $("whoami"); if (w && name) w.textContent = "👤 " + name;
    toast("✅ Profil sparad");
  }

  /* =========================================================================
     SMARTA FUNKTIONER
     ========================================================================= */
  function applyTheme(dark) {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem(LS_THEME, dark ? "dark" : "light"); } catch (e) {}
    const b = $("themeToggle"); if (b) b.textContent = dark ? "☀️" : "🌙";
  }
  function sunTimes(lat, lng, date) {
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const start = new Date(date.getFullYear(), 0, 0);
    const day = Math.floor((date - start) / 86400000);
    function calc(sunrise) {
      const lngHour = lng / 15;
      const t = day + ((sunrise ? 6 : 18) - lngHour) / 24;
      let M = 0.9856 * t - 3.289;
      let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634; L = (L + 360) % 360;
      let RA = deg * Math.atan(0.91764 * Math.tan(L * rad)); RA = (RA + 360) % 360;
      RA += (Math.floor(L / 90) * 90) - (Math.floor(RA / 90) * 90); RA /= 15;
      const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;
      let H = sunrise ? 360 - deg * Math.acos(cosH) : deg * Math.acos(cosH); H /= 15;
      const T = H + RA - 0.06571 * t - 6.622;
      let UT = (T - lngHour) % 24; if (UT < 0) UT += 24; return UT;
    }
    return { sunriseUTC: calc(true), sunsetUTC: calc(false) };
  }
  let sunTimers = [];
  function clearSunTimers() { sunTimers.forEach(clearTimeout); sunTimers = []; }
  function applyAutoTheme(lat, lng) {
    clearSunTimers();
    const now = new Date(); let riseH, setH, info;
    if (lat != null) {
      const st = sunTimes(lat, lng, now);
      if (st.sunriseUTC != null && st.sunsetUTC != null) { riseH = st.sunriseUTC; setH = st.sunsetUTC; info = "Plats hittad – tema följer solen."; }
    }
    if (riseH == null) { riseH = 6 - (-(now.getTimezoneOffset() / 60)); setH = 20 - (-(now.getTimezoneOffset() / 60)); info = "Plats nekad – fast schema (ljust 07–20)."; }
    const nowUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
    let rise = ((riseH % 24) + 24) % 24, set = ((setH % 24) + 24) % 24;
    const isDay = rise < set ? (nowUTC >= rise && nowUTC < set) : (nowUTC >= rise || nowUTC < set);
    applyTheme(!isDay);
    const si = $("okSunInfo"); if (si) si.textContent = info;
    [[rise, false], [set, true]].forEach(([h, dark]) => {
      let ms = ((((h - nowUTC) % 24) + 24) % 24) * 3600000; if (ms < 1000) ms += 86400000;
      sunTimers.push(setTimeout(() => { if (getSettings().autoTheme) { applyTheme(dark); applyAutoTheme(lat, lng); } }, ms));
    });
  }
  function enableAutoTheme() {
    if (navigator.geolocation) {
      if ($("okSunInfo")) $("okSunInfo").textContent = "Hämtar plats…";
      navigator.geolocation.getCurrentPosition(
        (pos) => applyAutoTheme(pos.coords.latitude, pos.coords.longitude),
        () => applyAutoTheme(null, null), { timeout: 8000, maximumAge: 3600000 });
    } else applyAutoTheme(null, null);
  }
  function inDnd() {
    const s = getSettings(); if (!s.dnd) return false;
    const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = s.dndStart.split(":").map(Number), [eh, em] = s.dndEnd.split(":").map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
  }
  window.OK_notify = function (title, body) {
    if (inDnd()) return false;
    if ("Notification" in window && Notification.permission === "granted") { try { new Notification(title, { body }); return true; } catch (e) {} }
    return false;
  };
  let activeSeconds = 0, breakTimer = null;
  function startBreakWatch() {
    clearInterval(breakTimer);
    breakTimer = setInterval(() => {
      if (document.hidden) return;
      activeSeconds += 30;
      if (getSettings().breakReminders && activeSeconds >= 3600) { activeSeconds = 0; showBreak("⏰ Du har varit inne i en timme nu – glöm inte att sträcka på dig eller ta ett glas vatten! 💧"); }
    }, 30000);
  }
  function showBreak(text) {
    if (inDnd()) return;
    $("okBreakText").textContent = text; $("okBreakToast").classList.remove("hidden");
    window.OK_notify("Ordkollen – paus", text);
  }
  function initBattery() {
    if (!navigator.getBattery) { const b = $("okBatteryInfo"); if (b) b.textContent = "Battery Status API stöds inte här."; return; }
    navigator.getBattery().then((bat) => {
      function update() {
        const s = getSettings(); const low = s.battery && bat.level < 0.2 && !bat.charging;
        document.body.classList.toggle("power-save", low);
        $("ddSaverBadge").classList.toggle("hidden", !low);
        const info = $("okBatteryInfo");
        if (info) info.textContent = `Batteri: ${Math.round(bat.level * 100)}%${bat.charging ? " (laddar)" : ""}.` + (low ? " Strömsparläge på." : "");
      }
      bat.addEventListener("levelchange", update); bat.addEventListener("chargingchange", update);
      window._okBatUpdate = update; update();
    });
  }
  const PERSONAS = {
    standard: "", professional: " Använd en professionell, formell och saklig ton.",
    concise: " Var extremt kortfattad – svara med så få ord som möjligt.",
    pedagogical: " Var pedagogisk: förklara utförligt, steg för steg, och ge gärna exempel.",
    friendly: " Var vänlig, peppig och lättsam med en uppmuntrande ton."
  };
  window.OK_personaPrefix = function () { try { return PERSONAS[getSettings().persona] || ""; } catch (e) { return ""; } };

  /* =========================================================================
     STATISTIK
     ========================================================================= */
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function getStats() { return Object.assign({ days: {}, searches: {} }, load(kStats(user()), {})); }
  function bumpStat(kind) {
    const u = user(); if (!u) return; const st = getStats(); const t = todayKey();
    if (kind === "minute") st.days[t] = (st.days[t] || 0) + 1;
    if (kind === "search") st.searches[t] = (st.searches[t] || 0) + 1;
    save(kStats(u), st);
  }
  function last7() { const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d); } return a; }
  function renderStats() {
    const u = user(); if (!u) return; const st = getStats(); const days = last7();
    let totalMin = 0, totalSearch = 0;
    days.forEach(d => { const k = d.toISOString().slice(0, 10); totalMin += st.days[k] || 0; totalSearch += st.searches[k] || 0; });
    const savedCount = (load(kSaved(u), []) || []).length;
    $("okStatTime").textContent = totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`;
    $("okStatSearch").textContent = totalSearch; $("okStatSaved").textContent = savedCount;
    const max = Math.max(1, ...days.map(d => st.days[d.toISOString().slice(0, 10)] || 0));
    const names = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
    $("okStatBars").innerHTML = days.map(d => {
      const v = st.days[d.toISOString().slice(0, 10)] || 0; const h = Math.round((v / max) * 78);
      return `<div class="ok-bar-wrap"><div class="ok-bar" style="height:${h}px" title="${v} min"></div><div class="ok-bar-lbl">${names[d.getDay()]}</div></div>`;
    }).join("");
  }

  /* =========================================================================
     DATAHANTERING & SYNK
     ========================================================================= */
  function allData() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("ordkollen") === 0) out[k] = localStorage.getItem(k); }
    return out;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportJson() {
    download(`ordkollen-backup-${todayKey()}.json`, JSON.stringify({ _app: "ordkollen", _version: 2, _exported: new Date().toISOString(), data: allData() }, null, 2));
    toast("⬇️ Backup nedladdad – importera den på din andra enhet.");
  }
  function exportCsv() {
    const u = user(); const saved = load(kSaved(u), []) || []; const ORDBOK = window.ORDBOK || {};
    let csv = "\uFEFFord;ordklass;sentiment;synonymer;beskrivning\n";
    saved.forEach(w => { const d = ORDBOK[w] || {}; const syn = (d.synonymer || []).join(", ").replace(/;/g, ","); const desc = (d.beskrivning || "").replace(/;/g, ",").replace(/\n/g, " "); csv += `${w};${d.ordklass || ""};${d.sentiment || ""};${syn};${desc}\n`; });
    download(`ordkollen-sparade-${todayKey()}.csv`, csv, "text/csv"); toast("⬇️ CSV nedladdad");
  }
  function importBackup(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result); const data = obj && obj.data ? obj.data : obj;
        if (!data || typeof data !== "object") throw new Error("Ogiltig fil");
        let n = 0; Object.keys(data).forEach(k => { if (k.indexOf("ordkollen") === 0) { localStorage.setItem(k, data[k]); n++; } });
        toast(`✅ ${n} poster importerade – laddar om…`); setTimeout(() => location.reload(), 1200);
      } catch (e) { toast("⚠️ Kunde inte läsa filen: " + e.message); }
    };
    r.readAsText(file);
  }
  function clearCache() {
    if (!confirm("Rensa lokal cache (senaste sökningar, översättningscache)? Konto och sparade ord påverkas inte.")) return;
    ["ordkollen_recent", "ordkollen_tr"].forEach(k => localStorage.removeItem(k));
    toast("🧹 Cache rensad");
  }
  function cloudPush() {
    const bin = $("okCloudBin").value.trim(), key = $("okCloudKey").value.trim();
    if (!bin || !key) { toast("Fyll i Bin ID + nyckel."); return; }
    save("ordkollen_cloud", { bin }); $("okCloudStatus").textContent = "Synkar upp…";
    fetch(`https://api.jsonbin.io/v3/b/${bin}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": key }, body: JSON.stringify({ _app: "ordkollen", data: allData() }) })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then(() => { $("okCloudStatus").textContent = "✅ Uppsynkad " + new Date().toLocaleTimeString(); toast("☁️ Uppsynkad"); })
      .catch(e => { $("okCloudStatus").textContent = "⚠️ " + e.message; });
  }
  function cloudPull() {
    const bin = $("okCloudBin").value.trim(), key = $("okCloudKey").value.trim();
    if (!bin || !key) { toast("Fyll i Bin ID + nyckel."); return; }
    $("okCloudStatus").textContent = "Hämtar…";
    fetch(`https://api.jsonbin.io/v3/b/${bin}/latest`, { headers: { "X-Master-Key": key } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then(j => { const data = j.record && j.record.data ? j.record.data : null; if (!data) throw new Error("Tom bin");
        let n = 0; Object.keys(data).forEach(k => { if (k.indexOf("ordkollen") === 0) { localStorage.setItem(k, data[k]); n++; } });
        $("okCloudStatus").textContent = `✅ ${n} poster hämtade – laddar om…`; setTimeout(() => location.reload(), 1200);
      }).catch(e => { $("okCloudStatus").textContent = "⚠️ " + e.message; });
  }

  /* =========================================================================
     DANGER ZONE
     ========================================================================= */
  function factoryReset() {
    if (!confirm("Återställ ALLA inställningar till fabriksläge? Sparade ord och konton behålls.")) return;
    const u = user();
    [kSettings(u), kProfile(u), kStats(u), "ordkollen_cloud", "ordkollen_tr", LS_LANG].forEach(k => localStorage.removeItem(k));
    document.body.classList.remove("power-save"); toast("♻️ Återställt – laddar om…"); setTimeout(() => location.reload(), 1000);
  }
  function deleteAccount() {
    const u = user(); if (!u) return;
    if (!confirm("Radera kontot PERMANENT? All din data tas bort. Detta kan inte ångras.")) return;
    if (!confirm("Är du HELT säker? Detta raderar kontot på den här enheten.")) return;
    const users = load(LS_USERS, {}); delete users[u]; save(LS_USERS, users);
    [kSaved(u), kSettings(u), kProfile(u), kStats(u)].forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(LS_SESSION); toast("🗑️ Konto raderat"); setTimeout(() => location.reload(), 1000);
  }

  /* =========================================================================
     JURIDIK
     ========================================================================= */
  const LEGAL = {
    terms: { t: "📜 Användarvillkor", b: `<p>Välkommen till Ordkollen. Genom att använda tjänsten godkänner du dessa villkor.</p>
      <h4>1. Tjänsten</h4><p>Ordkollen tillhandahåller en svensk ordbok med synonymer, slang, uttryck och idiom, "i befintligt skick".</p>
      <h4>2. Konto</h4><p>Du ansvarar för dina inloggningsuppgifter. Konton lagras lokalt i din webbläsare (samt valfri molnsynk).</p>
      <h4>3. Användning</h4><p>Du får inte använda tjänsten för olagliga ändamål.</p>
      <h4>4. Ändringar</h4><p>Villkoren kan uppdateras.</p>
      <p style="opacity:.6">Exempeltext – ersätt med dina egna villkor innan publicering.</p>` },
    privacy: { t: "🔒 Integritetspolicy (GDPR)", b: `<p>Denna policy förklarar hur data hanteras.</p>
      <h4>Vilka uppgifter</h4><p>Visningsnamn, e-post (valfritt), sparade ord och inställningar.</p>
      <h4>Var lagras de</h4><p>All data lagras <strong>lokalt i din webbläsare</strong>. Inget skickas till server om du inte själv aktiverar molnsynk eller Google-inloggning. Vid språkbyte skickas text till Googles översättnings-API.</p>
      <h4>Dina rättigheter (GDPR)</h4><p>Du kan exportera din data (Datahantering) eller radera den permanent (Danger Zone).</p>
      <p style="opacity:.6">Exempeltext – anpassa till din verksamhet.</p>` },
    cookies: { t: "🍪 Hantering av kakor", b: `<p>Ordkollen använder endast <strong>nödvändig lokal lagring</strong> (localStorage).</p>
      <h4>Inga spårningskakor</h4><p>Inga tredjepartskakor för annonsering.</p>
      <h4>Hantera</h4><p>Rensa via <em>Datahantering → Rensa lokal cache</em> eller webbläsarens inställningar.</p>` }
  };
  function openLegal(which) {
    const L = LEGAL[which]; if (!L) return;
    $("okLegalTitle").textContent = L.t; $("okLegalBody").innerHTML = L.b; $("okLegalModal").classList.remove("hidden");
    if (getLang() !== "sv") translateDOM(getLang(), $("okLegalBody")).catch(() => {});
  }

  /* =========================================================================
     INIT
     ========================================================================= */
  function bindSettingPersist() {
    const set = (patch) => { const cur = getSettings(); Object.assign(cur, patch); setSettings(cur); };
    $("okAutoTheme").onchange = e => { set({ autoTheme: e.target.checked }); if (e.target.checked) enableAutoTheme(); else { clearSunTimers(); if ($("okSunInfo")) $("okSunInfo").textContent = "Avstängt."; } };
    $("okDnd").onchange = e => { set({ dnd: e.target.checked }); $("okDndTimes").classList.toggle("hidden", !e.target.checked); };
    $("okDndStart").onchange = e => set({ dndStart: e.target.value });
    $("okDndEnd").onchange = e => set({ dndEnd: e.target.value });
    $("okBreak").onchange = e => {
      set({ breakReminders: e.target.checked }); if (e.target.checked) { activeSeconds = 0; if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); }
    };
    $("okBattery").onchange = e => { set({ battery: e.target.checked }); if (window._okBatUpdate) window._okBatUpdate(); else if (!e.target.checked) { document.body.classList.remove("power-save"); $("ddSaverBadge").classList.add("hidden"); } };
    $("okPersona").onchange = e => set({ persona: e.target.value });
  }

  function init() {
    if (!$("okDrawer")) return;
    $("footYear").textContent = new Date().getFullYear();

    $("menuAvatarBtn").addEventListener("click", openDrawer);
    $("okDrawerClose").addEventListener("click", closeDrawer);
    $("okDrawerScrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && $("okDrawer").classList.contains("open")) closeDrawer(); });

    $("okSaveProfile").addEventListener("click", saveProfile);

    $("okExportJson").addEventListener("click", exportJson);
    $("okExportCsv").addEventListener("click", exportCsv);
    $("okImport").addEventListener("click", () => $("okImportFile").click());
    $("okImportFile").addEventListener("change", e => { if (e.target.files[0]) importBackup(e.target.files[0]); });
    $("okClearCache").addEventListener("click", clearCache);
    $("okCloudPush").addEventListener("click", cloudPush);
    $("okCloudPull").addEventListener("click", cloudPull);

    $("okFactoryReset").addEventListener("click", factoryReset);
    $("okDeleteAccount").addEventListener("click", deleteAccount);

    buildLangOptions();
    $("langSelect").addEventListener("change", e => {
      // Markera att DET HÄR valet är det senaste (används för "nyast vinner" vid molnsynk).
      try { localStorage.setItem("ordkollen_lang_ts", String(Date.now())); } catch (err) {}
      // OBS: ingen pushCloudProfile() här – applyLang() sparar språket och pushar EN gång
      // med rätt värde. Att pusha här skulle skicka det GAMLA språket med ny tidsstämpel,
      // vilket ekade tillbaka och kastade om språket.
      applyLang(e.target.value);
    });
    document.querySelectorAll(".ok-link[data-legal]").forEach(b => b.addEventListener("click", () => openLegal(b.dataset.legal)));
    $("okLegalClose").addEventListener("click", () => $("okLegalModal").classList.add("hidden"));
    $("okLegalModal").addEventListener("click", e => { if (e.target.id === "okLegalModal") $("okLegalModal").classList.add("hidden"); });
    $("okBreakDismiss").addEventListener("click", () => $("okBreakToast").classList.add("hidden"));

    bindSettingPersist();
    observeDynamic();
    hookSearch();

    // statistik
    setInterval(() => { if (!document.hidden && user()) bumpStat("minute"); }, 60000);
    const sBtn = $("searchBtn"), sInp = $("searchInput");
    if (sBtn) sBtn.addEventListener("click", () => { if (sInp && sInp.value.trim() && user()) bumpStat("search"); });
    if (sInp) sInp.addEventListener("keydown", e => { if (e.key === "Enter" && sInp.value.trim() && user()) bumpStat("search"); });

    initBattery();
    startBreakWatch();
    if (location.hash === "#settings" && user()) setTimeout(openDrawer, 400);

    // Tillämpa sparat språk vid start. Läs värdet NÄR timern körs (inte nu),
    // så att en molnsynk som hinner uppdatera valet först får råda. Jämför mot
    // appliedLang så att vi även ÅTERSTÄLLER till svenska om sidan fastnat på ett
    // annat språk medan valet säger "sv".
    setTimeout(() => { const lang = getLang(); if (lang !== appliedLang) applyLang(lang); }, 300);

    const apply = () => {
      if (!user()) return;
      const st = getSettings();
      if (st.autoTheme) enableAutoTheme();
      const p = getProfile(); if (p.displayName) { const w = $("whoami"); if (w) w.textContent = "👤 " + p.displayName; }
      const l = getLang(); if (l !== appliedLang) setTimeout(() => { const cur = getLang(); if (cur !== appliedLang) applyLang(cur); }, 200);
    };
    const appView = $("appView");
    if (appView && "MutationObserver" in window) {
      new MutationObserver(() => { if (!appView.classList.contains("hidden")) apply(); }).observe(appView, { attributes: true, attributeFilter: ["class"] });
    }
    if (appView && !appView.classList.contains("hidden")) apply();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
