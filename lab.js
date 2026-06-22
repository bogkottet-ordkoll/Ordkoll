/* =========================================================================
   Ordkollen – LABBET (Mega-Plugin) – FRISTÅENDE LAGER
   Kopplar BARA via DOM/localStorage. Rör inte app.js interna funktioner.
   Använder appens egna klasser: .navtab / .navtab-active / .view / .hidden
   ========================================================================= */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ---- Hjälpare: läs sparade ord utan att bero på app.js ---- */
  function sessionUser() {
    try { return JSON.parse(localStorage.getItem("ordkollen_session")); } catch (e) { return null; }
  }
  function getSavedWords() {
    const u = sessionUser(); if (!u) return [];
    try { return JSON.parse(localStorage.getItem("ordkollen_saved_" + u)) || []; } catch (e) { return []; }
  }
  function ordbok() { return window.ORDBOK || {}; }
  function geminiKey() { return localStorage.getItem("ordkollen_gemini_key") || ""; }
  function geminiModel() { return localStorage.getItem("ordkollen_gemini_model") || "gemini-2.5-flash-lite"; }

  const TOOLS = [
    { id:'dialect', icon:'🚜', title:'Dialekt-översättare', desc:'Gör om text till skånska & göteborgska (på skoj).', prompt:'Översätt följande text till grov, stereotyp och rolig skånska OCH göteborgska. Visa båda tydligt uppdelade.' },
    { id:'emoji', icon:'😎', title:'Emoji-tolken', desc:'Text → emojis, eller emojis → text.', prompt:'Om inmatningen är emojis: översätt till svenska. Om det är text: översätt till ENBART emojis (inga ord).' },
    { id:'poem', icon:'📜', title:'Dikt-generator', desc:'Skriv ett ämne, få en dikt med vackra ord.', prompt:'Skriv en vacker dikt på svenska om ämnet. Använd avancerade och poetiska svenska ord.' },
    { id:'story', icon:'📖', title:'Story-startare', desc:'Få en mikronovell utifrån dina ord.', prompt:'Skriv en mycket kort mikronovell (max 4 meningar) baserat på inmatningen.' },
    { id:'metaphor', icon:'🧠', title:'Metafor-maskinen', desc:'Förklarar något med klockrena metaforer.', prompt:'Ge 3 kreativa och oväntade metaforer för följande koncept/ord.' },
    { id:'spell', icon:'✅', title:'Stavning & Särskrivning', desc:'Rättar text och förklarar felen.', prompt:'Rätta stavning, grammatik och särskrivningar i texten. Förklara sedan kort vad du ändrade.' },
    { id:'tone', icon:'🎭', title:'Tonläge-analys', desc:'Är texten arg, glad eller passiv-aggressiv?', prompt:'Analysera tonläget i texten. Formell, arg, passiv-aggressiv, glad? Motivera kort.' },
    { id:'easy', icon:'👶', title:'Lättläst-omvandlare', desc:'Gör krångligt språk superlätt.', prompt:'Skriv om texten till mycket lättläst svenska (klarspråk). Korta meningar, enkla ord.' },
    { id:'cefr', icon:'📏', title:'CEFR-nivåmätare', desc:'Vilken nivå (A1–C2) ligger texten på?', prompt:'Bedöm CEFR-nivå (A1–C2) för texten. Motivera med ordförråd och grammatik.' },
    { id:'cliche', icon:'🥱', title:'Klichédetektor', desc:'Hittar utslitna uttryck.', prompt:'Identifiera klichéer och utslitna uttryck i texten. Ge fräschare alternativ.' },
    { id:'etym', icon:'🌳', title:'Etymologi-träd', desc:'Varifrån kommer ordet?', prompt:'Förklara etymologin för ordet. Visa resan från urnordiska/latin/tyska till idag.' },
    { id:'false', icon:'🕵️', title:'Falska vänner', desc:'Luriga ord mellan svenska & engelska.', prompt:'Vilka falska vänner finns för ordet på engelska? Förklara skillnaden. (T.ex. eventuellt vs eventually.)' },
    { id:'idioms', icon:'🌉', title:'Tvärspråkliga idiom', desc:'Hur säger man det på andra språk?', prompt:'Ge motsvarigheten till idiomet på engelska, tyska och spanska. Är inmatningen ett vanligt ord: ge 3 idiom med ordet.' },
    { id:'lists', icon:'📋', title:'Smala ordlistor', desc:'Palindrom, ljudhärmande, slang, färgord…', prompt:'Generera 10 svenska ord i kategorin inmatningen beskriver (t.ex. onomatopoetiska, palindrom, gaming-slang). Förklara varje kort.' },
    { id:'bingo', icon:'🎲', title:'Ord-bingo', desc:'Bingo med dina sparade ord!', action:'bingo' },
    { id:'spelling', icon:'🐝', title:'Stavningsbi', desc:'Lyssna och stava rätt.', action:'spelling' },
    { id:'collage', icon:'🔊', title:'Ljudkollage', desc:'Hör alla synonymer i en kör.', action:'collage' }
  ];

  function renderGrid() {
    const grid = $("labGrid"); if (!grid) return;
    grid.innerHTML = "";
    TOOLS.forEach((t) => {
      const card = document.createElement("div");
      card.className = "lab-card";
      card.innerHTML = `<div class="icon">${t.icon}</div><h4>${t.title}</h4><p>${t.desc}</p>`;
      card.addEventListener("click", () => openTool(t));
      grid.appendChild(card);
    });
  }

  function openTool(t) {
    $("labModal").classList.remove("hidden");
    $("labModalTitle").textContent = t.icon + " " + t.title;
    const body = $("labModalBody");

    if (t.action === "bingo") {
      let words = getSavedWords().slice();
      if (words.length < 24) {
        body.innerHTML = `<p style="color:var(--text)">Du har sparat <b>${words.length}</b> ord. Spara minst <b>24</b> ord (⭐) för att spela bingo!</p>`;
        return;
      }
      words = words.sort(() => 0.5 - Math.random()).slice(0, 24);
      words.splice(12, 0, "GRATIS ⭐");
      body.innerHTML = `<p style="color:var(--text)">Klicka på ord när de nämns under lektionen!</p>
        <div class="bingo-board">${words.map((w, i) =>
          `<div class="bingo-cell ${i === 12 ? "free" : ""}">${w}</div>`).join("")}</div>`;
      body.querySelectorAll(".bingo-cell").forEach((c, i) => {
        if (i !== 12) c.addEventListener("click", () => { c.classList.toggle("marked"); if (window.OK_playSound) window.OK_playSound("pop"); });
      });

    } else if (t.action === "spelling") {
      body.innerHTML = `
        <p style="color:var(--text)">Klicka, lyssna noga och stava ordet!</p>
        <button id="beePlay" class="lab-btn lab-btn-primary">🔊 Spela upp ord</button>
        <input type="text" id="beeInput" class="lab-input" placeholder="Stava ordet här…" autocomplete="off">
        <button id="beeCheck" class="lab-btn lab-btn-primary">Rätta</button>
        <div id="beeRes" style="font-weight:700;text-align:center;margin-top:8px;color:var(--text)"></div>`;
      const keys = Object.keys(ordbok()).filter((w) => w.length >= 6);
      const pool = keys.length ? keys : ["konkordans", "exekvera", "oförtröttlig", "synpunkt", "förtjusning"];
      let current = "";
      $("beePlay").addEventListener("click", () => {
        current = pool[Math.floor(Math.random() * pool.length)];
        const u = new SpeechSynthesisUtterance(current); u.lang = "sv-SE";
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        $("beeRes").textContent = "🔈 Lyssna…";
      });
      $("beeCheck").addEventListener("click", () => {
        if (!current) { $("beeRes").textContent = "Tryck på 🔊 först!"; return; }
        const guess = ($("beeInput").value || "").trim().toLowerCase();
        if (guess === current.toLowerCase()) {
          $("beeRes").innerHTML = "✅ Helt rätt! +10 poäng";
          if (window.OK_fireConfetti) window.OK_fireConfetti();
        } else {
          $("beeRes").innerHTML = `❌ Fel. Rätt stavning: <span style="color:#ea4335">${current}</span>`;
          if (window.OK_playSound) window.OK_playSound("lose");
        }
      });

    } else if (t.action === "collage") {
      body.innerHTML = `<p style="color:var(--text)">Sök upp ett ord på 🔍 Sök-fliken först. Kom sedan hit och klicka – appen läser upp alla synonymer i en kör med olika röstlägen!</p>
        <button id="colPlay" class="lab-btn lab-btn-primary">🔊 Spela kollage</button>
        <div id="colRes" style="margin-top:8px;color:var(--text-2);font-size:13px"></div>`;
      $("colPlay").addEventListener("click", () => {
        const h = document.querySelector("#view-sok .word-title, #view-sok h2, #resultArea h2");
        const word = h ? h.textContent.trim().toLowerCase() : "";
        const data = ordbok()[word] || {};
        const syns = (data.synonymer || []).slice(0, 12);
        if (!syns.length) { $("colRes").textContent = "Hittade inga synonymer – sök upp ett ord först."; return; }
        $("colRes").textContent = "🎶 Spelar: " + syns.join(", ");
        speechSynthesis.cancel();
        syns.forEach((s, i) => setTimeout(() => {
          const u = new SpeechSynthesisUtterance(s); u.lang = "sv-SE";
          u.pitch = 0.5 + Math.random() * 1.2; u.rate = 0.8 + Math.random() * 0.5;
          speechSynthesis.speak(u);
        }, i * 550));
      });

    } else {
      body.innerHTML = `
        <p style="color:var(--text-2);font-size:13px">${t.desc}</p>
        <textarea id="labInput" class="lab-input" style="height:120px;resize:vertical" placeholder="Skriv in text eller ord här…"></textarea>
        <button id="labRunBtn" class="lab-btn lab-btn-primary">✨ Kör Gemini-magi</button>
        <div id="labOutput" class="lab-output hidden"></div>`;
      $("labRunBtn").addEventListener("click", async () => {
        const val = ($("labInput").value || "").trim(); if (!val) return;
        const out = $("labOutput"); out.classList.remove("hidden");
        out.textContent = "🤖 Tänker… (några sekunder)";
        try {
          const key = geminiKey();
          if (!key) throw new Error("Lägg först in en Gemini-nyckel via ⚙️ uppe till höger.");
          const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
            geminiModel() + ":generateContent?key=" + encodeURIComponent(key);
          const res = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: t.prompt + "\n\nInmatning:\n" + val }] }] })
          });
          if (res.status === 429) throw new Error("Gemini-kvoten är slut (429). Byt modell i ⚙️ eller vänta en stund.");
          if (!res.ok) { const tx = await res.text(); throw new Error("API-fel (" + res.status + "). " + tx.slice(0, 140)); }
          const j = await res.json();
          out.textContent = (j.candidates && j.candidates[0] && j.candidates[0].content &&
            j.candidates[0].content.parts && j.candidates[0].content.parts[0].text) || "(tomt svar)";
          if (window.OK_playSound) window.OK_playSound("pop");
        } catch (e) {
          out.textContent = "⚠️ " + e.message;
          if (window.OK_playSound) window.OK_playSound("lose");
        }
      });
    }
  }

  function showLab() {
    document.querySelectorAll(".navtab").forEach((t) => t.classList.remove("navtab-active"));
    const tab = $("labNavTab"); if (tab) tab.classList.add("navtab-active");
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    const view = $("view-lab"); if (view) view.classList.remove("hidden");
  }

  function init() {
    if ($("labNavTab")) return; // redan byggt
    const nav = document.querySelector("#appView nav");
    const viewSok = $("view-sok");
    if (!nav || !viewSok) { return; } // appen inte redo ännu

    // 1) Lägg till flik som ANVÄNDER appens egna klasser
    const tab = document.createElement("button");
    tab.id = "labNavTab"; tab.className = "navtab"; tab.dataset.view = "lab";
    tab.textContent = "🧪 Labbet";
    tab.addEventListener("click", showLab);
    nav.appendChild(tab);

    // 2) Lägg till vy som syskon till de andra vyerna
    const view = document.createElement("section");
    view.id = "view-lab"; view.className = "view hidden";
    view.innerHTML = `
      <div class="lab-head">
        <h2>🧪 Labbet &amp; magiska verktyg</h2>
        <button id="labDyslexicBtn" class="lab-btn">👁️ Dyslexi-läge</button>
      </div>
      <p class="lab-sub">Experimentella AI-verktyg, minispel och djupdykningar. AI-verktygen kräver en Gemini-nyckel (⚙️).</p>
      <div id="labGrid" class="lab-grid"></div>`;
    viewSok.parentNode.appendChild(view);

    // 3) Modal
    const modal = document.createElement("div");
    modal.id = "labModal"; modal.className = "hidden";
    modal.innerHTML = `
      <div id="labModalCard">
        <div class="lab-modal-head">
          <h3 id="labModalTitle">Verktyg</h3>
          <button id="labModalClose" aria-label="Stäng">&times;</button>
        </div>
        <div id="labModalBody"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
    $("labModalClose").addEventListener("click", () => modal.classList.add("hidden"));

    $("labDyslexicBtn").addEventListener("click", () => document.body.classList.toggle("dyslexic-mode"));

    renderGrid();
  }

  // Försök bygga när appView dyker upp (efter inloggning visas nav).
  function tryInit() {
    init();
    if (!$("labNavTab")) setTimeout(tryInit, 600);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryInit);
  else tryInit();
})();
