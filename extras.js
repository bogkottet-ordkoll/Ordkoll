/* =========================================================================
   Ordkollen – EXTRAS (nya verktyg)
   Fristående lager ovanpå app.js. Rör inte app.js interna logik – allt här
   kopplar sig via DOM/localStorage så att kärnan inte kan gå sönder.
   Funktioner: tema-växel, uttal (TTS), kopiera, senaste sökningar,
   dagens ord, överraska mig, exportera sparade, "/"-genväg.
   ========================================================================= */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LS_THEME  = "ordkollen_theme";
  const LS_RECENT = "ordkollen_recent";
  const LS_SESSION = "ordkollen_session";

  let currentWord = null;

  /* ---------------- Tema (ljust/mörkt) ---------------- */
  function isDark() { return document.documentElement.classList.contains("dark"); }
  function paintThemeIcon() {
    const b = $("themeToggle"); if (!b) return;
    b.textContent = isDark() ? "☀️" : "🌙";
    b.title = isDark() ? "Byt till ljust läge" : "Byt till mörkt läge";
  }
  function toggleTheme() {
    const next = isDark() ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem(LS_THEME, next); } catch (e) {}
    paintThemeIcon();
  }

  /* ---------------- Hjälpare ---------------- */
  function fireSearch(word) {
    if (!word) return;
    const nav = document.querySelector('.navtab[data-view="sok"]');
    if (nav) nav.click();
    const input = $("searchInput"), btn = $("searchBtn");
    if (input && btn) { input.value = word; btn.click(); }
  }
  function ordbok() { return window.ORDBOK || {}; }
  function detailedKeys() {
    const k = Object.keys(ordbok());
    return k.length ? k : (window.WORDLIST || []);
  }

  /* ---------------- Uttal (text-to-speech) ---------------- */
  // Läs valt appspråk (sätts av settings.js, JSON-sparat i localStorage).
  function currentLang() {
    try { return JSON.parse(localStorage.getItem("ordkollen_lang")) || "sv"; }
    catch { return "sv"; }
  }
  // Föredragna BCP-47-taggar per 2-bokstavskod → bästa röstmatchning.
  const LANG_TAG = {
    sv:"sv-SE", en:"en-US", es:"es-ES", fr:"fr-FR", de:"de-DE", it:"it-IT",
    pt:"pt-PT", nl:"nl-NL", no:"nb-NO", nb:"nb-NO", da:"da-DK", fi:"fi-FI",
    is:"is-IS", pl:"pl-PL", cs:"cs-CZ", sk:"sk-SK", hu:"hu-HU", ro:"ro-RO",
    bg:"bg-BG", el:"el-GR", uk:"uk-UA", ru:"ru-RU", tr:"tr-TR", ar:"ar-SA",
    he:"he-IL", hi:"hi-IN", ja:"ja-JP", ko:"ko-KR", zh:"zh-CN", th:"th-TH",
    vi:"vi-VN", id:"id-ID", ms:"ms-MY", ca:"ca-ES", hr:"hr-HR", sr:"sr-RS",
    sl:"sl-SI", et:"et-EE", lv:"lv-LV", lt:"lt-LT", fa:"fa-IR", ta:"ta-IN"
  };
  // Plocka den röst som bäst matchar valt språk (eller null om ingen finns).
  function pickVoice(code, tag) {
    const voices = speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const lc = String(code).toLowerCase();
    const ft = String(tag || "").toLowerCase();
    const norm = (l) => String(l || "").toLowerCase().replace("_", "-");
    const same = voices.filter(v => norm(v.lang).split("-")[0] === lc);
    if (!same.length) return null;                       // ingen röst för språket
    return same.find(v => norm(v.lang) === ft)            // 1) exakt locale (de-DE)
        || same.find(v => v.default)                      // 2) språkets standardröst
        || same[0];                                       // 3) första bästa
  }
  // Språknamn på svenska, för tydliga meddelanden.
  function langName(code) {
    try { return new Intl.DisplayNames(["sv"], { type: "language" }).of(code) || code; }
    catch { return code; }
  }
  // Liten avisering – återanvänder appens toast-element (#okToast).
  let toastTimer = null;
  function toast(msg) {
    const t = $("okToast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
  }
  // Läs det VISADE ordet direkt från resultatrubriken (översatt till valt språk).
  function liveWord() {
    const h = document.querySelector("#resultArea h3.capitalize");
    const t = h ? h.textContent.trim() : "";
    return t || currentWord || null;
  }

  /* ---- Manuell röstväljare (kom ihåg val PER språk) ---- */
  const LS_VOICES = "ordkollen_voices"; // { langkod: voiceURI }
  function loadVoiceMap() { try { return JSON.parse(localStorage.getItem(LS_VOICES)) || {}; } catch { return {}; } }
  function saveVoiceMap(m) { try { localStorage.setItem(LS_VOICES, JSON.stringify(m)); } catch {} }
  function savedVoiceURI(code) { return loadVoiceMap()[code] || ""; }
  function setSavedVoice(code, uri) { const m = loadVoiceMap(); if (uri) m[code] = uri; else delete m[code]; saveVoiceMap(m); }

  // Slutgiltigt röstval: användarens sparade val för språket → annars auto-val.
  function resolveVoice(code, tag) {
    const voices = speechSynthesis.getVoices() || [];
    const uri = savedVoiceURI(code);
    if (uri) { const v = voices.find(x => x.voiceURI === uri); if (v) return v; }
    return pickVoice(code, tag);
  }

  /* ---- Namngivna Gemini-röster för uppläsning (samma som Gemini Live) ----
     Enhetens (Microsoft-)röster används inte som förval – i stället väljs en
     namngiven röst (Capella, Glow, Flare, Orbit, Orion, Dipper, Pegasus, Ursa,
     Vega, Eclipse) med egen ton/hastighet. Går att välja på alla enheter. */
  const GEM_VOICES = [
    { name: "Capella", g: "f", pitch: 1.15, rate: 1.00, desc: "varm" },
    { name: "Glow",    g: "f", pitch: 1.32, rate: 1.05, desc: "ljus" },
    { name: "Flare",   g: "f", pitch: 1.12, rate: 1.16, desc: "energisk" },
    { name: "Orbit",   g: "n", pitch: 1.00, rate: 0.96, desc: "lugn" },
    { name: "Orion",   g: "m", pitch: 0.80, rate: 0.96, desc: "djup" },
    { name: "Dipper",  g: "f", pitch: 1.26, rate: 1.10, desc: "lekfull" },
    { name: "Pegasus", g: "m", pitch: 0.90, rate: 1.00, desc: "mjuk" },
    { name: "Ursa",    g: "m", pitch: 0.70, rate: 0.90, desc: "mörk" },
    { name: "Vega",    g: "f", pitch: 1.20, rate: 1.00, desc: "klar" },
    { name: "Eclipse", g: "m", pitch: 0.85, rate: 0.92, desc: "dämpad" }
  ];
  function gemVoice(name) { return GEM_VOICES.find(v => v.name === name) || null; }
  const GEM_FEMALE = /(female|kvinn|alva|elin|klara|astrid|google svenska|samantha|victoria|zira|serena|karen|moira|tessa|fiona)/i;
  const GEM_MALE   = /(male|man|oskar|erik|magnus|daniel|alex|fred|david|george|mark|rishi)/i;
  function underlyingForGem(prof, code) {
    const vs = speechSynthesis.getVoices() || []; if (!vs.length) return null;
    const lc = String(code).toLowerCase();
    const same = vs.filter(v => String(v.lang || "").toLowerCase().split("-")[0] === lc);
    const pool = same.length ? same : vs;
    if (prof.g === "m") { const m = pool.find(v => GEM_MALE.test(v.name)); if (m) return m; }
    if (prof.g === "f") { const f = pool.find(v => GEM_FEMALE.test(v.name)); if (f) return f; }
    return pool[0] || vs[0] || null;
  }

  let voiceSel = null;
  function buildVoicePicker() {
    const tts = $("ttsBtn");
    if (!tts || !tts.parentElement || $("okVoiceSel")) return;
    const wrap = document.createElement("label");
    wrap.className = "ok-voice-pick";
    wrap.title = "Välj röst för uppläsning (sparas per språk)";
    wrap.setAttribute("data-noi18n", "");          // settings.js ska inte översätta röstnamnen
    wrap.innerHTML = '<span class="ok-voice-ico" aria-hidden="true">🗣️</span>';
    voiceSel = document.createElement("select");
    voiceSel.id = "okVoiceSel";
    voiceSel.className = "ok-voice-sel";
    voiceSel.setAttribute("aria-label", "Välj röst för uppläsning");
    wrap.appendChild(voiceSel);
    tts.parentElement.appendChild(wrap);
    voiceSel.addEventListener("change", () => {
      setSavedVoice(currentLang(), voiceSel.value);
      if (currentWord) speak(currentWord);            // förhandslyssna direkt
    });
    populateVoicePicker();
  }
  function populateVoicePicker() {
    if (!voiceSel) return;
    const voices = speechSynthesis.getVoices() || [];
    const code = currentLang(), lc = code.toLowerCase();
    const norm = (l) => String(l || "").toLowerCase().replace("_", "-");
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const match = voices.filter(v => norm(v.lang).split("-")[0] === lc);
    const others = voices.filter(v => norm(v.lang).split("-")[0] !== lc);
    const opt = (v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`;
    let html = `<option value="">Auto – bästa för ${esc(langName(code))}</option>`;
    // Namngivna Gemini-röster överst – väljbara på alla enheter (även mobil).
    html += `<optgroup label="✨ Gemini-röster">${GEM_VOICES.map(g => `<option value="gem:${g.name}">${esc(g.name)} – ${esc(g.desc)}</option>`).join("")}</optgroup>`;
    if (match.length)  html += `<optgroup label="🎯 ${esc(langName(code))}">${match.map(opt).join("")}</optgroup>`;
    if (others.length) html += `<optgroup label="Enhetens röster">${others.map(opt).join("")}</optgroup>`;
    voiceSel.innerHTML = html;
    voiceSel.value = savedVoiceURI(code) || "";
  }

  function speak(word) {
    word = liveWord() || word;       // uttala det som faktiskt visas, inte det svenska originalet
    if (!word || !("speechSynthesis" in window)) return;
    const code = currentLang();
    const tag = LANG_TAG[code] || code;
    let done = false;
    const go = () => {
      if (done) return; done = true;
      try {
        let v, pitch = 1, rate = 0.95;
        const savedVal = savedVoiceURI(code);
        if (savedVal && savedVal.indexOf("gem:") === 0) {
          const prof = gemVoice(savedVal.slice(4));
          if (prof) { v = underlyingForGem(prof, code); pitch = prof.pitch; rate = prof.rate; }
        }
        if (!v) v = resolveVoice(code, tag);
        const u = new SpeechSynthesisUtterance(word);
        u.lang = v ? v.lang : tag;   // röstens locale styr uttalet/brytningen
        u.rate = rate; u.pitch = pitch;
        if (v) u.voice = v;
        try { speechSynthesis.resume(); } catch (e) {}
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        // Saknas röst för språket faller webbläsaren tillbaka på standardrösten – berätta varför.
        if (!v && code !== "sv") {
          toast("🔊 Ingen " + langName(code) + "-röst är installerad på enheten – ordet uttalas med standardrösten. Installera språkrösten i systemets inställningar för rätt brytning.");
        }
      } catch (e) {}
    };
    // Rösterna kan ladda asynkront – vänta in dem vid behov.
    const voices = speechSynthesis.getVoices();
    if (voices && voices.length) go();
    else { try { speechSynthesis.addEventListener("voiceschanged", go, { once: true }); } catch (e) {} setTimeout(go, 400); }
  }

  /* ---------------- Kopiera ord + synonymer ---------------- */
  function copyCurrent() {
    const area = $("resultArea"); if (!area || !currentWord) return;
    const chips = [...area.querySelectorAll(".chip")].map(c => c.textContent.trim());
    const desc = area.querySelector("p")?.textContent?.trim() || "";
    let txt = liveWord() || currentWord;
    if (desc && !desc.startsWith("💡")) txt += "\n" + desc;
    if (chips.length) txt += "\n" + chips.join(", ");
    navigator.clipboard?.writeText(txt).then(() => flash($("copyBtn"), "✓ Kopierat"));
  }
  function flash(btn, label) {
    if (!btn) return;
    const old = btn.textContent; btn.textContent = label;
    setTimeout(() => { btn.textContent = old; }, 1300);
  }

  /* ---------------- Senaste sökningar ---------------- */
  function loadRecent() { try { return JSON.parse(localStorage.getItem(LS_RECENT)) || []; } catch (e) { return []; } }
  function pushRecent(word) {
    if (!word) return;
    let r = loadRecent().filter(w => w.toLowerCase() !== word.toLowerCase());
    r.unshift(word); r = r.slice(0, 8);
    try { localStorage.setItem(LS_RECENT, JSON.stringify(r)); } catch (e) {}
    renderRecent();
  }
  function renderRecent() {
    const bar = $("recentBar"); if (!bar) return;
    const r = loadRecent();
    if (!r.length) { bar.innerHTML = ""; return; }
    bar.innerHTML = '<span class="text-slate-400 text-xs self-center mr-1">🕘 Senaste:</span>' +
      r.map(w => `<button class="chip" data-rw="${w.replace(/"/g, "&quot;")}">${w}</button>`).join("") +
      '<button id="recentClear" class="chip" title="Rensa">🗑️</button>';
    bar.querySelectorAll("[data-rw]").forEach(b => b.addEventListener("click", () => fireSearch(b.dataset.rw)));
    const c = $("recentClear");
    if (c) c.addEventListener("click", () => { try { localStorage.removeItem(LS_RECENT); } catch (e) {} renderRecent(); });
  }

  /* ---------------- Dagens ord / Överraska mig ---------------- */
  function wordOfDay() {
    const keys = detailedKeys(); if (!keys.length) return;
    const day = Math.floor(Date.now() / 86400000);
    fireSearch(keys[day % keys.length]);
  }
  function surprise() {
    const keys = detailedKeys(); if (!keys.length) return;
    fireSearch(keys[Math.floor(Math.random() * keys.length)]);
  }

  /* ---------------- Exportera sparade ord ---------------- */
  function exportSaved() {
    let key = null;
    try { key = localStorage.getItem(LS_SESSION); } catch (e) {}
    let words = [];
    try { words = JSON.parse(localStorage.getItem("ordkollen_saved_" + key)) || []; } catch (e) {}
    if (!words.length) { alert("Inga sparade ord att exportera än."); return; }
    const OB = ordbok();
    const lines = words.map(w => {
      const d = OB[w] || {};
      const parts = [w.toUpperCase()];
      if (d.ordklass) parts.push("(" + d.ordklass + ")");
      let s = parts.join(" ");
      if (d.beskrivning) s += "\n  " + d.beskrivning;
      if (d.synonymer && d.synonymer.length) s += "\n  Synonymer: " + d.synonymer.join(", ");
      if (d.slang && d.slang.length) s += "\n  Slang: " + d.slang.join(", ");
      if (d.uttryck && d.uttryck.length) s += "\n  Uttryck: " + d.uttryck.join(", ");
      if (d.idiom && d.idiom.length) s += "\n  Idiom: " + d.idiom.join(", ");
      return s;
    });
    const header = "Ordkollen – mina sparade ord (" + words.length + " st)\n" +
                   new Date().toLocaleString("sv-SE") + "\n" + "=".repeat(40) + "\n\n";
    const blob = new Blob([header + lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ordkollen-sparade-ord.txt";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  /* ---------------- Följ aktuellt sökresultat ---------------- */
  let recentTimer = null;
  function refreshFromResult() {
    const h = document.querySelector("#resultArea h3.capitalize");
    const word = h ? h.textContent.trim() : null;
    const tts = $("ttsBtn"), cp = $("copyBtn");
    if (word) {
      currentWord = word;
      if (tts) tts.disabled = false;
      if (cp) cp.disabled = false;
      // Spara det VISADE ordet i historiken. På annat språk: vänta in översättningen
      // (settings.js översätter resultatet på plats) så historiken inte fastnar på svenska.
      clearTimeout(recentTimer);
      const delay = currentLang() === "sv" ? 0 : 650;
      recentTimer = setTimeout(() => { const w = liveWord(); if (w) pushRecent(w); }, delay);
    } else {
      currentWord = null;
      if (tts) tts.disabled = true;
      if (cp) cp.disabled = true;
    }
  }

  /* ---------------- Init ---------------- */
  function init() {
    paintThemeIcon();
    renderRecent();

    $("themeToggle")?.addEventListener("click", toggleTheme);
    $("ttsBtn")?.addEventListener("click", () => speak(currentWord));
    $("copyBtn")?.addEventListener("click", copyCurrent);
    $("wotdBtn")?.addEventListener("click", wordOfDay);
    $("surpriseBtn")?.addEventListener("click", surprise);
    $("exportSavedBtn")?.addEventListener("click", exportSaved);

    // Förladda röster för TTS + bygg röstväljaren
    if ("speechSynthesis" in window) {
      try { speechSynthesis.getVoices(); } catch (e) {}
      buildVoicePicker();
      try { speechSynthesis.addEventListener("voiceschanged", populateVoicePicker); } catch (e) {}
    }

    // Uppdatera röstväljaren när appspråket byts (settings.js sätter <html lang>)
    if ("MutationObserver" in window) {
      new MutationObserver(populateVoicePicker)
        .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    }

    // Bevaka sökresultatet utan att röra app.js
    const area = $("resultArea");
    if (area && "MutationObserver" in window) {
      new MutationObserver(refreshFromResult).observe(area, { childList: true, subtree: true });
    }

    // Tangentbord: "/" fokuserar sökrutan
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        const s = $("searchInput");
        if (s && !$("appView").classList.contains("hidden")) { e.preventDefault(); s.focus(); }
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
