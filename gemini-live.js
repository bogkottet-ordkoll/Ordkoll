/* =========================================================================
   Ordkollen – GEMINI LIVE – FRISTÅENDE LAGER
   Fullskärms live-röstläge med Gemini (modell från ⚙️, standard
   gemini-3.1-flash-lite). Prata om vad som helst. Gemini kan dessutom
   UTFÖRA det du säger i appen:
     • lägga till ord     • ta bort ord      • spara ord
     • markera/färga ord  • söka/slå upp ord • klistra in text i sökrutan
   Kan minimeras (går ur men stängs INTE) → flytande bubbla → tillbaka till
   fullskärm. Krysset (✕) stänger helt. Rör inte app.js – bara DOM/localStorage.
   ========================================================================= */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var ORDBOK = function () { return window.ORDBOK || {}; };
  function norm(s) { return String(s || "").trim().toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  /* ---------- session + sparade ord ---------- */
  function sessionUser() { try { return JSON.parse(localStorage.getItem("ordkollen_session")); } catch (e) { return null; } }
  function savedKey() { var u = sessionUser(); return u ? "ordkollen_saved_" + u : null; }
  function getSaved() { var k = savedKey(); if (!k) return []; try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } }
  function setSaved(arr) {
    var k = savedKey(); if (!k) return;
    arr = Array.from(new Set(arr));
    localStorage.setItem(k, JSON.stringify(arr));
    try { if (window.FirebaseSync && window.FirebaseSync.setWords) window.FirebaseSync.setWords(arr); } catch (e) {}
    var v = $("view-sparade");
    if (v && !v.classList.contains("hidden")) { var t = document.querySelector('.navtab[data-view="sparade"]'); if (t) t.click(); }
  }
  function markWord(word, color) {
    var all = {}; try { all = JSON.parse(localStorage.getItem("ordkollen_wcolor")) || {}; } catch (e) {}
    all[norm(word)] = color || "#fbbc04"; localStorage.setItem("ordkollen_wcolor", JSON.stringify(all));
    // se till att ordet finns bland sparade så markeringen syns
    var s = getSaved(); if (!s.includes(norm(word))) { s.push(norm(word)); setSaved(s); }
  }
  var COLORS = { "gul": "#fbbc04", "gult": "#fbbc04", "röd": "#ea4335", "rött": "#ea4335", "grön": "#34a853", "grönt": "#34a853", "blå": "#1a73e8", "blått": "#1a73e8", "lila": "#9334e6", "rosa": "#e46bd0" };

  /* ---------- Gemini ---------- */
  function geminiKey() { try { return localStorage.getItem("ordkollen_gemini_key") || ""; } catch (e) { return ""; } }
  function geminiModel() { try { return localStorage.getItem("ordkollen_gemini_model") || "gemini-3.1-flash-lite"; } catch (e) { return "gemini-3.1-flash-lite"; } }
  function callGemini(prompt, history) {
    var key = geminiKey();
    if (!key) return Promise.reject(new Error("no-key"));
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel() + ":generateContent?key=" + encodeURIComponent(key);
    var contents = (history || []).slice(-8).map(function (h) { return { role: h.role, parts: [{ text: h.text }] }; });
    contents.push({ role: "user", parts: [{ text: prompt }] });
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: contents }) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error("api " + r.status + " " + t.slice(0, 100)); }); return r.json(); })
      .then(function (j) { return (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || ""; });
  }

  var SYSTEM =
    "Du är Gemini Live inuti appen Ordkollen (en svensk ordapp med synonymer, slang, uttryck och idiom). " +
    "Du pratar med användaren i realtid och svarar ALLTID kort och naturligt på svenska (1–3 meningar), eftersom svaret läses upp högt. " +
    "Du kan även UTFÖRA saker i appen. Om användaren vill ändra sina ord ska du BÖRJA svaret med EN rad på exakt detta format:\n" +
    "@@ACTION {\"add\":[\"ord\"],\"remove\":[\"ord\"],\"mark\":{\"word\":\"ord\",\"color\":\"#hex\"},\"search\":\"ord\",\"insert\":\"text\"}@@\n" +
    "Ta bara med de fält som behövs, utelämna resten. Skriv sedan ett kort, vänligt bekräftande svar. " +
    "Om inget ska ändras, hoppa över ACTION-raden och svara bara vänligt.";

  /* ---------- tal (TTS) ---------- */
  var chosenVoiceName = null;
  try { chosenVoiceName = localStorage.getItem("ordkollen_live_voice") || null; } catch (e) {}
  function voices() { try { return speechSynthesis.getVoices() || []; } catch (e) { return []; } }
  function pickVoice() {
    var vs = voices();
    if (chosenVoiceName) { var f = vs.filter(function (v) { return v.name === chosenVoiceName; })[0]; if (f) return f; }
    return vs.filter(function (v) { return /sv/i.test(v.lang); })[0] || vs[0] || null;
  }
  var speaking = false;
  function speak(text, done) {
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "sv-SE"; var v = pickVoice(); if (v) u.voice = v;
      u.onstart = function () { speaking = true; setPill("speaking"); };
      u.onend = function () { speaking = false; setPill(listening ? "listening" : "idle"); if (done) done(); };
      speechSynthesis.speak(u);
    } catch (e) { if (done) done(); }
  }

  /* ---------- state ---------- */
  var root = null, recog = null, listening = false, wantLive = false, history = [], camStream = null;
  var elTitle, elStream, elStatus, elCam, elPill, elMicBtn;

  /* ---------- namn ---------- */
  function userName() {
    var who = $("whoami");
    if (who && who.textContent) { var t = who.textContent.replace(/^[^A-Za-zÅÄÖåäö0-9]+/, "").trim(); if (t) return t; }
    try { var u = sessionUser(); if (u) { var users = JSON.parse(localStorage.getItem("ordkollen_users") || "{}"); if (users[u] && users[u].name) return users[u].name; } } catch (e) {}
    return "";
  }
  function appName() { try { return JSON.parse(localStorage.getItem("ordkollen_app_name")) || "Ordkollen"; } catch (e) { return "Ordkollen"; } }

  /* ---------- ikoner (SVG) ---------- */
  var STAR = '<svg class="gl-star" viewBox="0 0 100 100"><defs><linearGradient id="glG" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#f94fd0"/><stop offset=".35" stop-color="#8a5cff"/><stop offset=".7" stop-color="#4285f4"/><stop offset="1" stop-color="#34d39a"/></linearGradient></defs>' +
    '<path fill="url(#glG)" d="M50 4 C54 30 70 46 96 50 C70 54 54 70 50 96 C46 70 30 54 4 50 C30 46 46 30 50 4 Z"/></svg>';
  var IC_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l1.5-2h7L18 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  var IC_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M12 16V9M9 12l3-3 3 3"/></svg>';
  var IC_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var IC_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ---------- bygg UI ---------- */
  function build() {
    if (root) return root;
    root = document.createElement("div");
    root.className = "gl-root hidden";
    root.innerHTML =
      '<div class="gl-top">' +
        '<button class="gl-iconbtn gl-min" title="Minimera (stänger inte)">≡</button>' +
        '<div class="gl-top-right">' +
          '<button class="gl-iconbtn gl-newbtn" title="Ny konversation">🗒️</button>' +
          '<button class="gl-iconbtn gl-morebtn" title="Fler val">⋮</button>' +
        '</div>' +
      '</div>' +
      '<div class="gl-voicehint">Välj Geminis röst</div>' +
      '<div class="gl-voicepick hidden"></div>' +
      '<div class="gl-center">' +
        STAR +
        '<h1 class="gl-title"></h1>' +
        '<video class="gl-cam" playsinline muted></video>' +
        '<div class="gl-stream"></div>' +
      '</div>' +
      '<div class="gl-status"></div>' +
      '<div class="gl-controls">' +
        '<button class="gl-cbtn gl-cam-btn" title="Kamera">' + IC_CAM + '</button>' +
        '<button class="gl-cbtn gl-up-btn" title="Ladda upp bild">' + IC_UP + '</button>' +
        '<button class="gl-pill idle" title="Live"><span class="gl-wave"><span></span><span></span><span></span><span></span><span></span></span></button>' +
        '<button class="gl-cbtn gl-mic-btn" title="Mikrofon">' + IC_MIC + '</button>' +
        '<button class="gl-cbtn close gl-close-btn" title="Stäng">' + IC_X + '</button>' +
      '</div>' +
      '<input type="file" accept="image/*" class="gl-file" style="display:none">';
    document.body.appendChild(root);

    elTitle = root.querySelector(".gl-title");
    elStream = root.querySelector(".gl-stream");
    elStatus = root.querySelector(".gl-status");
    elCam = root.querySelector(".gl-cam");
    elPill = root.querySelector(".gl-pill");
    elMicBtn = root.querySelector(".gl-mic-btn");

    root.querySelector(".gl-min").addEventListener("click", minimize);
    root.querySelector(".gl-morebtn").addEventListener("click", toggleVoicePick);
    root.querySelector(".gl-voicehint").addEventListener("click", toggleVoicePick);
    root.querySelector(".gl-newbtn").addEventListener("click", function () { history = []; elStream.innerHTML = ""; setTitle(); addNote("Ny konversation"); });
    root.querySelector(".gl-close-btn").addEventListener("click", closeFull);
    root.querySelector(".gl-cam-btn").addEventListener("click", toggleCam);
    root.querySelector(".gl-up-btn").addEventListener("click", function () { root.querySelector(".gl-file").click(); });
    root.querySelector(".gl-file").addEventListener("change", onFile);
    elMicBtn.addEventListener("click", function () { wantLive ? stopListen(true) : startListen(); });
    elPill.addEventListener("click", function () { wantLive ? stopListen(true) : startListen(); });

    buildVoicePick();
    applyDeviceClass();
    return root;
  }

  /* ---------- enhetsdetektering (telefon / surfplatta) ---------- */
  function detectDevice() {
    var ua = navigator.userAgent || "";
    var touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    var isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch); // iPadOS maskerar sig som Mac
    var isTabletUA = /Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 10|SM-T|GT-P/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
    var isPhoneUA = /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|BB10/i.test(ua);
    if (isIPad || isTabletUA) return "tablet";
    if (isPhoneUA) return "phone";
    // reserv: liten touch-skarm -> surfplatta/telefon
    if (touch && Math.min(window.innerWidth, window.innerHeight) <= 820 && Math.max(window.innerWidth, window.innerHeight) <= 1200) return "tablet";
    if (touch && Math.min(window.innerWidth, window.innerHeight) <= 500) return "phone";
    return "desktop";
  }
  function applyDeviceClass() {
    if (!root) return;
    var d = detectDevice();
    root.classList.remove("gl-phone", "gl-tablet");
    if (d === "phone") root.classList.add("gl-phone");
    else if (d === "tablet") root.classList.add("gl-tablet");
  }

  function setTitle() {
    var n = userName();
    elTitle.textContent = n ? ("Fråga på, " + n + "!") : "Fråga på!";
  }
  function setPill(mode) {
    if (!elPill) return;
    elPill.classList.toggle("idle", mode !== "listening" && mode !== "speaking");
    if (mode === "listening") elStatus.textContent = "🎙️ Lyssnar…";
    else if (mode === "speaking") elStatus.textContent = "🔊 Gemini svarar…";
    else if (mode === "thinking") elStatus.textContent = "💭 Tänker…";
    else elStatus.textContent = wantLive ? "" : "Tryck på mikrofonen för att prata";
    elMicBtn.classList.toggle("active", listening);
  }

  function addBubble(role, text, cls) {
    var b = document.createElement("div");
    b.className = "gl-bubble " + role + (cls ? " " + cls : "");
    b.textContent = text;
    elStream.appendChild(b);
    b.scrollIntoView({ behavior: "smooth", block: "end" });
    return b;
  }
  function addNote(text) { var n = document.createElement("div"); n.className = "gl-action-note"; n.textContent = "⚡ " + text; elStream.appendChild(n); n.scrollIntoView({ behavior: "smooth", block: "end" }); }

  /* ---------- röstväljare ---------- */
  function buildVoicePick() {
    var pick = root.querySelector(".gl-voicepick");
    function render() {
      var vs = voices().filter(function (v) { return /sv|en/i.test(v.lang); });
      if (!vs.length) vs = voices();
      pick.innerHTML = vs.map(function (v) {
        return '<div class="gl-vp-item' + (v.name === chosenVoiceName ? " sel" : "") + '" data-v="' + esc(v.name) + '"><span>' + esc(v.name) + '</span><span style="opacity:.6">' + esc(v.lang) + '</span></div>';
      }).join("") || '<div class="gl-vp-item">Inga röster hittades i webbläsaren</div>';
      pick.querySelectorAll(".gl-vp-item[data-v]").forEach(function (it) {
        it.addEventListener("click", function () {
          chosenVoiceName = it.dataset.v; try { localStorage.setItem("ordkollen_live_voice", chosenVoiceName); } catch (e) {}
          render(); speak("Hej! Så här låter jag nu."); pick.classList.add("hidden");
        });
      });
    }
    render();
    try { speechSynthesis.onvoiceschanged = render; } catch (e) {}
  }
  function toggleVoicePick() {
    var pick = root.querySelector(".gl-voicepick");
    root.querySelector(".gl-voicehint").classList.add("hidden");
    pick.classList.toggle("hidden");
  }

  /* ---------- kamera + bild ---------- */
  function toggleCam() {
    var btn = root.querySelector(".gl-cam-btn");
    if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; elCam.classList.remove("show"); btn.classList.remove("active"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }).then(function (s) {
      camStream = s; elCam.srcObject = s; elCam.classList.add("show"); elCam.play(); btn.classList.add("active");
    }).catch(function () { addNote("Kunde inte öppna kameran"); });
  }
  function onFile(e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      addBubble("user", "🖼️ (bild uppladdad)");
      if (geminiKey()) { describeImage(r.result, f.type); }
      else addBubble("ai", "Lägg in en Gemini-nyckel via ⚙️ så kan jag beskriva bilden.");
    };
    r.readAsDataURL(f);
    e.target.value = "";
  }
  function describeImage(dataUrl, mime) {
    setPill("thinking");
    var key = geminiKey();
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel() + ":generateContent?key=" + encodeURIComponent(key);
    var b64 = dataUrl.split(",")[1];
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Beskriv kort på svenska vad du ser på bilden." }, { inline_data: { mime_type: mime || "image/jpeg", data: b64 } }] }] }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { var t = (j.candidates && j.candidates[0] && j.candidates[0].content.parts[0].text) || "Kunde inte tolka bilden."; addBubble("ai", t); speak(t); })
      .catch(function () { addBubble("ai", "Kunde inte analysera bilden (kräver en vision-kapabel modell)."); setPill("idle"); });
  }

  /* ---------- STT (live) ---------- */
  function SR() { return window.SpeechRecognition || window.webkitSpeechRecognition; }
  function startListen() {
    var C = SR();
    if (!C) { addBubble("ai", "Röstinmatning stöds inte i den här webbläsaren. Du kan ändå ladda upp bilder och skriva i sökrutan."); return; }
    wantLive = true;
    try { recog && recog.abort(); } catch (e) {}
    recog = new C(); recog.lang = "sv-SE"; recog.interimResults = true; recog.continuous = false;
    var interimEl = null, finalText = "";
    recog.onstart = function () { listening = true; setPill("listening"); };
    recog.onerror = function (ev) { listening = false; if (ev.error === "not-allowed") { addNote("Mikrofonbehörighet nekad"); wantLive = false; } };
    recog.onend = function () {
      listening = false; setPill("idle");
      if (interimEl) { interimEl.remove(); interimEl = null; }
      var t = finalText.trim(); finalText = "";
      if (t) handleUtterance(t);
      else if (wantLive && !speaking) setTimeout(function () { if (wantLive) startListen(); }, 400);
    };
    recog.onresult = function (e) {
      var txt = ""; for (var i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      finalText = txt;
      if (!interimEl) interimEl = addBubble("user", txt, "interim"); else interimEl.textContent = txt;
    };
    try { recog.start(); } catch (e) {}
  }
  function stopListen(userStopped) {
    if (userStopped) wantLive = false;
    listening = false; try { recog && recog.stop(); } catch (e) {}
    setPill("idle");
  }
  function continueLive() { if (wantLive && !speaking) setTimeout(function () { if (wantLive && !listening) startListen(); }, 350); }

  /* ---------- lokala snabbkommandon (funkar utan nyckel) ---------- */
  function localCommand(text) {
    var low = norm(text), m;
    if ((m = low.match(/^(lägg till|spara|lagra)\s+(.+)/))) {
      var w = splitWords(m[2]); var s = getSaved(); w.forEach(function (x) { if (x && !s.includes(x)) s.push(x); }); setSaved(s);
      return { done: true, note: "Lade till: " + w.join(", "), say: "Klart, jag la till " + w.join(", ") + "." };
    }
    if ((m = low.match(/^(ta bort|radera|släng)\s+(.+)/))) {
      var w2 = splitWords(m[2]); setSaved(getSaved().filter(function (x) { return w2.indexOf(x) < 0; }));
      return { done: true, note: "Tog bort: " + w2.join(", "), say: "Klart, jag tog bort " + w2.join(", ") + "." };
    }
    if ((m = low.match(/^(markera|färga|maka)\s+(\S+)(?:\s+(?:med\s+)?(\w+))?/))) {
      var col = COLORS[m[3]] || "#fbbc04"; markWord(m[2], col);
      return { done: true, note: "Markerade: " + m[2], say: "Jag markerade " + m[2] + "." };
    }
    if ((m = low.match(/^(sök|slå upp|leta efter|leta)\s+(.+)/))) {
      doSearchApp(m[2].trim());
      return { done: true, note: "Sökte: " + m[2].trim(), say: "Jag söker " + m[2].trim() + "." };
    }
    if ((m = low.match(/^(klistra in|infoga|skriv)\s+(.+)/))) {
      insertSearch(m[2]); return { done: true, note: "Klistrade in i sökrutan", say: "Klart." };
    }
    return null;
  }
  function splitWords(s) { return s.replace(/[.?!]+$/, "").split(/,| och | samt /).map(norm).filter(Boolean); }
  function doSearchApp(q) {
    var inp = $("searchInput"), sb = $("searchBtn");
    if (inp) { inp.value = q; if (sb) sb.click(); else inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }
  }
  function insertSearch(t) { var inp = $("searchInput"); if (inp) { inp.value = t; inp.focus(); } try { navigator.clipboard && navigator.clipboard.writeText(t); } catch (e) {} }

  /* ---------- utför ACTION-JSON från Gemini ---------- */
  function runAction(a) {
    var notes = [];
    if (a.add && a.add.length) { var s = getSaved(); a.add.map(norm).forEach(function (w) { if (w && !s.includes(w)) s.push(w); }); setSaved(s); notes.push("La till: " + a.add.join(", ")); }
    if (a.remove && a.remove.length) { var rm = a.remove.map(norm); setSaved(getSaved().filter(function (w) { return rm.indexOf(w) < 0; })); notes.push("Tog bort: " + a.remove.join(", ")); }
    if (a.mark && a.mark.word) { markWord(a.mark.word, a.mark.color || "#fbbc04"); notes.push("Markerade: " + a.mark.word); }
    if (a.search) { doSearchApp(a.search); notes.push("Sökte: " + a.search); }
    if (a.insert) { insertSearch(a.insert); notes.push("Klistrade in text"); }
    notes.forEach(addNote);
  }
  function parseAction(text) {
    var m = text.match(/@@ACTION\s*([\s\S]*?)@@/);
    if (!m) return { clean: text, action: null };
    var action = null; try { action = JSON.parse(m[1].trim()); } catch (e) {}
    return { clean: text.replace(m[0], "").trim(), action: action };
  }

  /* ---------- hantera en yttring ---------- */
  function handleUtterance(text) {
    addBubble("user", text);
    history.push({ role: "user", text: text });

    // 1) lokalt snabbkommando (fungerar även utan nyckel)
    var local = localCommand(text);
    if (local) {
      addNote(local.note);
      addBubble("ai", local.say);
      history.push({ role: "model", text: local.say });
      speak(local.say, continueLive);
      return;
    }
    // 2) annars fråga Gemini
    if (!geminiKey()) {
      var msg = "Lägg in en Gemini-nyckel via ⚙️ så kan vi prata fritt. Du kan ändå säga t.ex. \"lägg till lycklig\", \"ta bort glad\", \"markera hund gul\" eller \"sök katt\".";
      addBubble("ai", msg); speak(msg, continueLive); return;
    }
    setPill("thinking");
    callGemini(SYSTEM + "\n\nAnvändaren säger: " + text, history).then(function (raw) {
      var pa = parseAction(raw);
      if (pa.action) runAction(pa.action);
      var reply = pa.clean || "Klart.";
      addBubble("ai", reply);
      history.push({ role: "model", text: reply });
      speak(reply, continueLive);
    }).catch(function (err) {
      var m2 = "Något gick fel med Gemini (" + (err && err.message ? err.message : "okänt") + "). Kontrollera nyckel/modell i ⚙️.";
      addBubble("ai", m2); setPill("idle"); continueLive();
    });
  }

  /* ---------- botten-FAB ("Gemini Live-kanten") + radial meny ---------- */
  var fab = null, fabOpen = false;
  var IC_SPARK = '<svg viewBox="0 0 100 100"><path fill="currentColor" d="M50 8 C54 32 68 46 92 50 C68 54 54 68 50 92 C46 68 32 54 8 50 C32 46 46 32 50 8 Z"/></svg>';
  function ensureFab() {
    if (fab) return fab;
    fab = document.createElement("div");
    fab.className = "gl-fab";
    fab.innerHTML =
      '<button class="gl-fab-item live" title="Öppna live"><span class="gl-fab-lbl">Live-läge</span>' + IC_SPARK + '</button>' +
      '<button class="gl-fab-item mic" title="Mikrofon på/av"><span class="gl-fab-lbl">Mik på/av</span>' + IC_MIC + '</button>' +
      '<button class="gl-fab-item stop" title="Stäng live"><span class="gl-fab-lbl">Stäng</span>' + IC_X + '</button>' +
      '<button class="gl-fab-main" title="Gemini Live">' + IC_SPARK + '</button>';
    document.body.appendChild(fab);
    fab.querySelector(".gl-fab-main").addEventListener("click", function (e) { e.stopPropagation(); toggleFabMenu(); });
    fab.querySelector(".gl-fab-item.live").addEventListener("click", function (e) { e.stopPropagation(); collapseFabMenu(); enterLive(); });
    fab.querySelector(".gl-fab-item.mic").addEventListener("click", function (e) {
      e.stopPropagation(); collapseFabMenu();
      if (!root || root.classList.contains("hidden")) { enterLive(); }
      else { wantLive ? stopListen(true) : startListen(); }
      syncFab();
    });
    fab.querySelector(".gl-fab-item.stop").addEventListener("click", function (e) { e.stopPropagation(); collapseFabMenu(); closeFull(); });
    document.addEventListener("click", function () { if (fabOpen) collapseFabMenu(); });
    return fab;
  }
  function toggleFabMenu() { fabOpen ? collapseFabMenu() : expandFabMenu(); }
  function expandFabMenu() { ensureFab(); fab.classList.add("open"); fabOpen = true; }
  function collapseFabMenu() { if (fab) fab.classList.remove("open"); fabOpen = false; }
  function showFab(active) { ensureFab(); fab.classList.remove("hidden"); fab.classList.toggle("active", !!active); syncFab(); }
  function hideFab() { if (fab) { fab.classList.add("hidden"); collapseFabMenu(); } }
  function syncFab() {
    if (!fab) return;
    var micItem = fab.querySelector(".gl-fab-item.mic");
    if (micItem) micItem.classList.toggle("on", listening);
    fab.classList.toggle("active", !!wantLive && !!root && root.classList.contains("hidden"));
  }
  function enterLive() {
    if (root && !root.classList.contains("hidden")) return;
    if (root && root._greeted) restore(); else openFull(true);
  }

  /* ---------- öppna / minimera / stänga ---------- */
  function openFull(autoListen) {
    build();
    setTitle();
    applyDeviceClass();
    root.classList.remove("hidden");
    hideFab();
    setPill("idle");
    // greeting endast första gången per session
    if (!root._greeted) {
      root._greeted = true;
      var n = userName();
      var hi = "Hej" + (n ? " " + n : "") + "! Jag är Gemini Live i " + appName() + ". Fråga vad du vill, eller be mig lägga till, ta bort eller markera ord.";
      setTimeout(function () { speak(hi, function () { if (wantLive) continueLive(); }); }, 350);
    }
    if (autoListen !== false) setTimeout(startListen, 300);
  }
  function minimize() {           // "gå ur" men INTE stänga – session lever vidare
    if (!root) return;
    root.classList.add("hidden");
    showFab(true);                // botten-kanten pulserar = session aktiv
    // fortsätter lyssna i bakgrunden om live var på
  }
  function restore() {            // tillbaka till fullskärm
    if (!root) return;
    applyDeviceClass();
    root.classList.remove("hidden");
    hideFab();
    if (wantLive && !listening) startListen();
  }
  function closeFull() {          // ✕ stänger helt (kanten finns kvar, redo att öppna igen)
    wantLive = false; stopListen(true);
    try { speechSynthesis.cancel(); } catch (e) {}
    if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; if (elCam) elCam.classList.remove("show"); }
    if (root) { root.classList.add("hidden"); root._greeted = false; }
    showFab(false);
    history = [];
  }
  window.OK_openGeminiLive = openFull;

  // Re-detektera enhet vid rotation/omskalning
  window.addEventListener("resize", function () { applyDeviceClass(); });
  window.addEventListener("orientationchange", function () { setTimeout(applyDeviceClass, 200); });

  /* ---------- launch-knapp(ar) ---------- */
  var LAUNCH_ICON = '<svg viewBox="0 0 100 100"><path fill="currentColor" d="M50 8 C54 32 68 46 92 50 C68 54 54 68 50 92 C46 68 32 54 8 50 C32 46 46 32 50 8 Z"/></svg>';
  function ensureLaunch() {
    var view = $("view-sok");
    if (view && !view.querySelector(".gl-launch")) {
      var actions = view.querySelector(".flex.flex-wrap") || view.querySelector(".gem-hero") || view;
      var b = document.createElement("button");
      b.className = "gl-launch"; b.type = "button"; b.innerHTML = LAUNCH_ICON + "Gemini Live";
      b.addEventListener("click", function () { openFull(true); });
      actions.appendChild(b);
    }
  }

  function loggedIn() {
    var app = $("appView");
    return app && !app.classList.contains("hidden");
  }
  function syncFabVisibility() {
    // Kanten ska finnas när man är inloggad, men inte ovanpå fullskärms-live.
    if (root && !root.classList.contains("hidden")) { hideFab(); return; }
    if (loggedIn()) showFab(!!wantLive); else hideFab();
  }

  function init() {
    ensureLaunch();
    ensureFab();
    syncFabVisibility();
    var app = $("appView");
    if (app && "MutationObserver" in window && !app.dataset.globs) {
      new MutationObserver(function () { ensureLaunch(); syncFabVisibility(); }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      app.dataset.globs = "1";
    }
    setInterval(function () { ensureLaunch(); syncFabVisibility(); }, 2000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
