/* =========================================================================
   Ordkollen – AKADEMIN (CEFR-styrd AI-träning) – FRISTÅENDE LAGER
   Hela träningsmodulen i ett fil – dynamiskt genererad via Gemini.
   Innehåller alla nivåer (A1–C2) och alla facktyper (Myndighetssvenska,
   Kulturcoach, Mediecoach, Grammatik, Sambandsord, Skrivande, etc).
   Rör INTE app.js.
   ========================================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const LS_LEVEL = "ordkollen_ak_level";
  const LS_PLAN = "ordkollen_ak_plan";

  function geminiKey() { return localStorage.getItem("ordkollen_gemini_key") || ""; }
  function geminiModel() { return localStorage.getItem("ordkollen_gemini_model") || "gemini-3.1-flash-lite"; }

  // =========================================================================
  // ANTI-UPPREPNING: historik per övning så att inget svar återkommer.
  // =========================================================================
  const HIST_MAX = 60;            // hur många tidigare svar vi minns per övning
  const HIST_PROMPT = 28;         // hur många vi skickar till AI:n som "undvik"
  function histKey(id) { return "ordkollen_ak_hist_" + id; }
  function loadHist(id) { try { return JSON.parse(localStorage.getItem(histKey(id)) || "[]"); } catch (e) { return []; } }
  function saveHist(id, arr) { try { localStorage.setItem(histKey(id), JSON.stringify(arr.slice(-HIST_MAX))); } catch (e) {} }
  function normKey(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9åäö ]/gi, "").trim().slice(0, 120); }

  // Plocka ut en jämförbar "nyckel" ur ett AI-svar beroende på övningstyp.
  function resultKey(type, data) {
    if (type === "interactive_read") return normKey(typeof data === "string" ? data.slice(0, 100) : "");
    if (!data || typeof data !== "object") return normKey(data);
    if (type === "translate") return normKey(data.source);
    if (type === "article_quiz") return normKey((data.text || "").slice(0, 100));
    if (type === "build") return normKey(data.target);
    return normKey(data.q); // quiz / fill
  }

  // Bygg "undvik dessa"-instruktion utifrån historiken.
  function avoidNote(id) {
    const h = loadHist(id);
    if (!h.length) return "";
    const list = h.slice(-HIST_PROMPT).map(x => "• " + x).join("\n");
    return "\n\nDu HAR REDAN använt följande exempel – skapa något HELT ANNAT och återanvänd dem ALDRIG:\n" + list;
  }

  // Generera ett svar som garanterat inte redan finns i historiken.
  async function generateUnique(t, basePrompt, isJson) {
    const id = t.id;
    let last = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const data = await callGemini(basePrompt + avoidNote(id), isJson);
      last = data;
      const key = resultKey(t.aiType, data);
      const hist = loadHist(id);
      if (!key || !hist.includes(key)) {
        if (key) { hist.push(key); saveHist(id, hist); }
        return data;
      }
      // Dubblett – försök igen med ny variation.
    }
    // Efter flera försök: spara ändå nyckeln och returnera (mycket sällsynt).
    const key = resultKey(t.aiType, last);
    if (key) { const hist = loadHist(id); hist.push(key); saveHist(id, hist); }
    return last;
  }

  // Nuvarande vald nivå
  let currentLevel = localStorage.getItem(LS_LEVEL) || "B1";
  const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

  // =========================================================================
  // GEMENSAM LÄRARINSTRUKTION
  // Återanvänds i alla feedback-prompter så att roboten resonerar som en
  // kritisk men saklig svensk lärare – inte som en överpositiv AI.
  // =========================================================================
  const TEACHER_INSTRUCTION = [
    "Du är en kritisk men saklig svensk språklärare. Följ dessa regler:",
    "• Ge aldrig beröm om det finns språkliga brister.",
    "• Säg inte ”Bra skrivet” om en text är grammatiskt korrekt men låter onaturlig – skriv då ”grammatiskt korrekt men något onaturlig”.",
    "• Skilj tydligt mellan grammatik, idiomatik (naturlighet) och stil. En mening kan vara grammatisk men ändå oidiomatisk.",
    "• Var försiktig med CEFR-nivåer. En enda avancerad mening räcker inte för C2.",
    "• Bedöm endast det som faktiskt finns i texten och överdriv inte ordförrådets nivå.",
    "• Förklara ord sakligt och grammatiskt (t.ex. ”används korrekt som ett substantiv som beskriver stöd eller motivation”) och undvik svepande, AI-aktiga formuleringar (t.ex. om ”positiv energi”).",
    "• Föredra formuleringar som en svensk modersmålstalare faktiskt skulle använda.",
    "• Var återhållsam med beröm.",
    "",
    "CEFR-riktlinjer (var sträng och konservativ):",
    "• A1–A2: enkel huvudsats och vardagsord.",
    "• B1: enklare bisatser och viss variation.",
    "• B2: mer nyanserat språk och någon formell stil.",
    "• C1: avancerat ordförråd och komplex struktur.",
    "• C2: mycket hög idiomatisk säkerhet och konsekvent stilistisk kontroll – en enskild mening ska nästan aldrig klassas som C2.",
    "Vid minsta tvekan: välj den LÄGRE nivån."
  ].join("\n");

  // =========================================================================
  // MODULER OCH TEMAN (Detta är menyn)
  // =========================================================================
  const MODULES = [
    {
      cat: "Kultur & Humor",
      icon: "🎭",
      items: [
        { id: "culture_joke", title: "Svenska Skämt", desc: "Förstår du ordvitsen?", aiType: "quiz", prompt: "Skapa ett typiskt svenskt skämt eller ordvits på {lvl}-nivå. Förklara varför det är roligt. Format: JSON med { q:'Skämtet', opts:['Fel betydelse','Fel betydelse','Rätt betydelse (dold)','Fel betydelse'], ans:2, exp:'Förklaringen till skämtet.' }" },
        { id: "culture_irony", title: "Ironidetektor", desc: "Vad menas mellan raderna?", aiType: "quiz", prompt: "Ge en kort svensk dialog (nivå {lvl}) där någon använder ironi, sarkasm eller underförstådd kritik (t.ex. 'Det var ju typiskt'). Format: JSON med { q:'Dialogen', opts:['Bokstavligt menat','Helt fel tolkning','Den ironiska meningen','En annan fel tolkning'], ans:2, exp:'Förklaring av undertonen.' }" },
        { id: "culture_idiom", title: "Idiom & Ordspråk", desc: "Klassiska svenska uttryck.", aiType: "quiz", prompt: "Ge ett vanligt svenskt idiom eller ordspråk (anpassat för {lvl}). Format: JSON med { q:'Idiomet/Ordspråket i en mening', opts:['Fel','Fel','Rätt betydelse','Fel'], ans:2, exp:'Berättelse om uttrycket.' }" }
      ]
    },
    {
      cat: "Samhälle & Myndighet",
      icon: "🏛️",
      items: [
        { id: "civic_letter", title: "Brev från Skatteverket/Försäkringskassan", desc: "Avkoda myndighetssvenskan.", aiType: "translate", prompt: "Ge ett kort, fiktivt brev (ca 3 meningar) från en svensk myndighet skrivet med typisk myndighetssvenska och byråkratiska ord (men anpassat i svårighet för {lvl}). Skapa sedan en 'översättning' till klarspråk. Format: JSON med { source:'Myndighetstexten', target:'Klarspråksöversättningen', exp:'Förklaring av 2-3 byråkratiska ord.' }" },
        { id: "civic_legal", title: "Avtal & Villkor", desc: "Förstå försäkringar & avtal.", aiType: "translate", prompt: "Ge en kort paragraf (2-3 meningar) från ett svenskt hyresavtal eller försäkringsvillkor (nivå {lvl}). Format: JSON med { source:'Avtalstexten', target:'Vad det egentligen betyder (klarspråk)', exp:'Juridiska termer förklarade.' }" },
        { id: "civic_simplifier", title: "Juridisk Förenklare", desc: "Klistra in en svår text.", aiType: "freeform", prompt: "Användaren klistrar in en svår byråkratisk/juridisk text. Din uppgift är att skriva om den till klarspråk (lämpligt för nivå {lvl}), samt lista de 3 svåraste orden med förklaringar." }
      ]
    },
    {
      cat: "Svensk Mediecoach",
      icon: "📺",
      items: [
        { id: "media_news", title: "Nyhetsläsaren", desc: "Läs en fiktiv nyhetsnotis & gör quiz.", aiType: "article_quiz", prompt: "Skriv en kort, fiktiv svensk nyhetsartikel (ca 80 ord) i Dagens Nyheter-stil (nivå {lvl}). Gör sedan ett läsförståelse-quiz på den. Format: JSON med { text:'Artikeln', words:[{word:'Svårt ord', def:'Förklaring'}], q:'En fråga om texten', opts:['Fel','Fel','Rätt','Fel'], ans:2, exp:'Varför det är rätt.' }" },
        { id: "media_podcast", title: "Poddsnack (Vardagligt)", desc: "Förstå utfyllnadsord & talspråk.", aiType: "article_quiz", prompt: "Skriv ett utdrag ur en fiktiv svensk samtalspodd (ca 80 ord) med talspråk, utfyllnadsord (liksom, typ, alltså) anpassat för {lvl}. Format: JSON med { text:'Poddutdraget', words:[{word:'Slang/utfyllnad', def:'Förklaring'}], q:'Vad pratar de om?', opts:['Fel','Fel','Rätt','Fel'], ans:2, exp:'Förklaring av jargongen.' }" }
      ]
    },
    {
      cat: "Grammatik & Struktur",
      icon: "🛠️",
      items: [
        { id: "gram_connect", title: "Sambandsordstränare", desc: "Därför, däremot, dessutom...", aiType: "fill", prompt: "Skapa en kort text (nivå {lvl}) som saknar ETT viktigt sambandsord (använd ___ där ordet ska in). Format: JSON med { q:'Texten med ___', opts:['däremot','därför','dessutom','följaktligen'] (eller andra relevanta val), ans:1 (index för rätt val), exp:'Varför detta sambandsord passar.' }" },
        { id: "gram_build", title: "Meningsbyggare", desc: "Sätt orden i rätt ordning.", aiType: "build", prompt: "Skapa en välformulerad svensk mening på {lvl}-nivå. Dela upp den i sina enskilda ord. Format: JSON med { target:'Hela korrekta meningen', words:['Meningen','uppdelad','i','ord','som','array'], exp:'Förklaring av ordföljden (t.ex. V2-regeln).' }" },
        { id: "gram_base", title: "Grundgrammatik", desc: "En/ett, verb, substantiv.", aiType: "quiz", prompt: "Skapa en grammatikfråga (nivå {lvl}) om en/ett, tempusböjning eller adjektivkongruens. Format: JSON med { q:'Frågan (t.ex. fill-in-the-blank)', opts:['Fel','Fel','Rätt','Fel'], ans:2, exp:'Grammatikregeln.' }" },
        { id: "gram_colloc", title: "Kollokationer", desc: "Ord som hör ihop.", aiType: "quiz", prompt: "Skapa en fråga om svenska kollokationer (ord som naturligt hör ihop, t.ex. 'stark kaffe' är fel, 'starkt kaffe' är rätt) för nivå {lvl}. Format: JSON med { q:'Vilket ord passar bäst i luckan: Han har ett ___ intresse för...', opts:['stort','högt','djupt','tjockt'], ans:0, exp:'Förklaring av kollokationen.' }" }
      ]
    },
    {
      cat: "Skrivande & Läsning",
      icon: "📝",
      items: [
        { id: "write_rewrite", title: "Omskrivningsutmaning", desc: "Gör meningen mer avancerad.", aiType: "translate", prompt: "Ge en extremt enkel svensk mening (t.ex. 'Hon var mycket trött.'). Skapa sedan en avancerad och snygg omformulering anpassad för {lvl} (t.ex. 'Hon var fullkomligt utmattad efter arbetsdagen.'). Format: JSON med { source:'Enkla meningen', target:'Avancerade meningen', exp:'Förklaring av de bättre orden.' }" },
        { id: "write_genre", title: "Genreträning", desc: "Skriv ett formellt e-post / debattartikel.", aiType: "freeform", prompt: "Användaren vill träna på att skriva en specifik texttyp (E-post, debattartikel, rapport) på nivå {lvl}. Din uppgift: Ge användaren ett ämne att skriva om, visa strukturen för texttypen, och ge 3 användbara fraser de bör inkludera." },
        { id: "read_smart", title: "Smart Läsläge", desc: "Klickbar text med definitioner.", aiType: "interactive_read", prompt: "Skapa en intressant text på ca 100 ord om svensk kultur eller natur (nivå {lvl}). Ingen JSON, svara enbart med texten i klartext. Jag kommer att göra orden klickbara lokalt." },
        { id: "read_register", title: "Registeranalys", desc: "Är texten formell eller vardaglig?", aiType: "quiz", prompt: "Skriv en kort text (nivå {lvl}). Användaren ska gissa registret (formellt, vardagligt, akademiskt, juridiskt). Format: JSON med { q:'Texten här', opts:['Vardagligt','Formellt','Akademiskt','Myndighetsspråk'], ans:1, exp:'Förklaring av språkbruket i texten.' }" }
      ]
    },
    {
      cat: "AI-coaching",
      icon: "🎯",
      items: [
        { id: "coach_cefr", title: "CEFR-Checklista", desc: "Vad krävs för varje nivå?", aiType: "checklist", prompt: "" },
        { id: "coach_weak", title: "Målstyrning & Svaghetsanalys", desc: "Låt AI bygga en plan åt dig.", aiType: "plan", prompt: "" }
      ]
    }
  ];

  // =========================================================================
  // API-ANROP MOT GEMINI
  // =========================================================================
  async function callGemini(promptText, isJson = true) {
    const key = geminiKey();
    if (!key) throw new Error("Du måste lägga in en Gemini-API-nyckel (⚙️) för att använda Akademin. Det är gratis!");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel() + ":generateContent?key=" + encodeURIComponent(key);
    
    // Tvinga JSON om så begärs
    const sys = isJson ? "Du MÅSTE svara med enbart en giltig, ren JSON-struktur. Inga Markdown-block (som ```json), ingen text före eller efter. Endast JSON." : "";
    
    // Variationsfrö + hög temperatur => undvik att samma svar upprepas varje gång.
    const seed = Math.random().toString(36).slice(2) + "-" + Date.now();
    const varyNote = "\n\nVIKTIGT: Ge ett HELT NYTT och annorlunda exempel än du brukar. " +
      "Undvik de vanligaste standardexemplen och upprepa inte tidigare svar. " +
      "Variera ämne, ord och formulering. Slumpmässigt frö (ignorera i svaret): " + seed + ".";

    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: sys + "\n\n" + promptText + varyNote }] }],
        generationConfig: { temperature: 1.15, topP: 0.95 }
      })
    });
    if (res.status === 429) throw new Error("API-kvoten är slut (429). Byt modell eller vänta.");
    if (!res.ok) { const txt = await res.text(); throw new Error(`API-fel (${res.status}): ` + txt.slice(0, 100)); }
    
    const j = await res.json();
    let textOut = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text) || "";
    
    if (isJson) {
      textOut = textOut.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      try {
        return JSON.parse(textOut);
      } catch (e) {
        console.error("Gemini svarade inte med giltig JSON:", textOut);
        throw new Error("Kunde inte tolka AI-svaret. Försök igen!");
      }
    }
    return textOut;
  }

  // =========================================================================
  // UI & RENDER
  // =========================================================================
  
  function init() {
    if ($("akNavTab")) return; // Redan byggd
    const nav = document.querySelector("#appView nav");
    const viewSok = $("view-sok");
    if (!nav || !viewSok) { setTimeout(init, 500); return; }

    // 1. Skapa tab
    const tab = document.createElement("button");
    tab.id = "akNavTab"; tab.className = "navtab"; tab.dataset.view = "akademin";
    tab.textContent = "🎓 Akademin";
    tab.addEventListener("click", () => {
      document.querySelectorAll(".navtab").forEach(t => t.classList.remove("navtab-active"));
      tab.classList.add("navtab-active");
      document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
      $("view-akademin").classList.remove("hidden");
    });
    nav.appendChild(tab);

    // 2. Skapa vy
    const view = document.createElement("section");
    view.id = "view-akademin"; view.className = "view hidden";
    view.innerHTML = `
      <div class="ak-head">
        <h2>🎓 Akademin – Oändlig AI-träning</h2>
        <div class="ak-levels" id="akLevelPicker"></div>
      </div>
      <p class="ak-sub">Lär dig förstå byråkratsvenska, svenska skämt, ironi, mediebruset och skrivande. 
        Alla övningar genereras i realtid av AI utifrån din valda nivå.</p>
      
      <div id="akPlanBar" class="ak-planbar hidden">
        <div style="font-size:1.5rem">🧭</div>
        <div class="ak-plan-txt" id="akPlanText"></div>
      </div>

      <div id="akContent"></div>
    `;
    viewSok.parentNode.appendChild(view);

    // 3. Skapa modal
    const modal = document.createElement("div");
    modal.id = "akModal"; modal.className = "hidden";
    modal.innerHTML = `
      <div id="akModalCard">
        <div class="ak-modal-head">
          <h3 id="akModalTitle">Övning</h3>
          <button id="akModalClose" aria-label="Stäng">&times;</button>
        </div>
        <div id="akModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    $("akModalClose").addEventListener("click", closeModal);

    renderLevels();
    renderGrid();
    checkPlan();
  }

  function renderLevels() {
    const wrap = $("akLevelPicker");
    wrap.innerHTML = `<span class="ak-lvl-label">Din nivå:</span>`;
    LEVELS.forEach(l => {
      const b = document.createElement("button");
      b.className = "ak-lvl" + (currentLevel === l ? " sel" : "");
      b.textContent = l;
      b.addEventListener("click", () => {
        currentLevel = l;
        localStorage.setItem(LS_LEVEL, l);
        renderLevels();
        checkPlan();
      });
      wrap.appendChild(b);
    });
  }

  function renderGrid() {
    const wrap = $("akContent");
    wrap.innerHTML = "";
    MODULES.forEach(cat => {
      const h = document.createElement("h3");
      h.className = "ak-cat-h";
      h.innerHTML = `<span>${cat.icon} ${cat.cat}</span> <span class="ak-cat-tag">A1-C2</span>`;
      
      const grid = document.createElement("div");
      grid.className = "ak-grid";
      
      cat.items.forEach(t => {
        const card = document.createElement("div");
        card.className = "ak-card";
        card.innerHTML = `<div class="ak-badge ai">AI-SKAPAD</div>
          <div class="ak-ico">${cat.icon}</div>
          <h4>${t.title}</h4>
          <p>${t.desc}</p>`;
        card.addEventListener("click", () => openTool(t));
        grid.appendChild(card);
      });
      
      const sec = document.createElement("div");
      sec.className = "ak-cat";
      sec.appendChild(h);
      sec.appendChild(grid);
      wrap.appendChild(sec);
    });
  }

  function closeModal() {
    $("akModal").classList.add("hidden");
    $("akModalBody").innerHTML = "";
  }

  // =========================================================================
  // KÖRA ÖVNINGAR (Tool Logic)
  // =========================================================================
  async function openTool(t) {
    $("akModal").classList.remove("hidden");
    $("akModalTitle").textContent = t.icon + " " + t.title + " (Nivå: " + currentLevel + ")";
    const body = $("akModalBody");
    body.innerHTML = `<div class="ak-thinking">Laddar övning och genererar innehåll (detta tar några sekunder)...</div>`;

    if (t.aiType === "checklist") { return renderCEFRChecklist(body); }
    if (t.aiType === "plan") { return renderPlanMaker(body); }
    if (t.aiType === "freeform") { return renderFreeform(body, t); }

    try {
      const p = t.prompt.replace(/\{lvl\}/g, currentLevel);
      
      if (t.aiType === "quiz" || t.aiType === "fill") {
        const json = await generateUnique(t, p, true);
        renderQuiz(body, json, t.title);
      } 
      else if (t.aiType === "translate") {
        const json = await generateUnique(t, p, true);
        renderTranslate(body, json);
      }
      else if (t.aiType === "article_quiz") {
        const json = await generateUnique(t, p, true);
        renderArticleQuiz(body, json);
      }
      else if (t.aiType === "build") {
        const json = await generateUnique(t, p, true);
        renderBuilder(body, json);
      }
      else if (t.aiType === "interactive_read") {
        const txt = await generateUnique(t, p, false);
        renderInteractiveRead(body, txt);
      }
      // Lägg till en "Generera ny övning"-knapp längst ner i ALLA AI-övningar.
      addRegenButton(body, t);
    } catch (e) {
      body.innerHTML = `<div class="ak-output" style="color:#ea4335">⚠️ Fel: ${e.message}</div>`;
    }
  }

  // ---- Gemensam "Generera ny övning"-knapp (läggs i ALLA övningar) ----
  function addRegenButton(body, t) {
    if (!body || body.querySelector("#akRegenBtn")) return;
    const btn = document.createElement("button");
    btn.id = "akRegenBtn";
    btn.className = "ak-btn ak-btn-primary";
    btn.style.cssText = "margin-top:16px;align-self:flex-start";
    btn.textContent = "🔁 Generera ny övning";
    btn.addEventListener("click", () => openTool(t));
    body.appendChild(btn);
  }

  // ---- Quiz (Flerval) ----
  function renderQuiz(body, data, title) {
    body.innerHTML = `
      <div class="ak-quiz-prog">${title} • ${currentLevel}</div>
      <div class="ak-quiz-q">${data.q}</div>
      <div class="ak-quiz-opts" id="akOpts"></div>
      <div id="akExp" class="ak-explain hidden"></div>
    `;
    const optsDiv = body.querySelector("#akOpts");
    const expDiv = body.querySelector("#akExp");

    data.opts.forEach((opt, idx) => {
      const b = document.createElement("button");
      b.className = "ak-opt";
      b.textContent = opt;
      b.addEventListener("click", () => {
        // Lås andra knappar
        Array.from(optsDiv.children).forEach(cb => cb.disabled = true);
        if (window.OK_recordResult) window.OK_recordResult(idx === data.ans);
        if (idx === data.ans) {
          b.classList.add("correct");
          if (window.OK_playSound) window.OK_playSound("pop");
          if (window.OK_fireConfetti) window.OK_fireConfetti();
        } else {
          b.classList.add("wrong");
          if (window.OK_playSound) window.OK_playSound("lose");
          optsDiv.children[data.ans].classList.add("correct");
        }
        expDiv.innerHTML = "<b>Förklaring:</b> " + data.exp;
        expDiv.classList.remove("hidden");
      });
      optsDiv.appendChild(b);
    });
  }

  // ---- Översättning (Byråkratsvenska -> Klarspråk) ----
  function renderTranslate(body, data) {
    body.innerHTML = `
      <div class="ak-label">Källa (Byråkratiskt/Avancerat):</div>
      <div class="ak-output" style="margin-bottom:12px;border-left:4px solid var(--border)">${data.source}</div>
      <button id="akShowTrBtn" class="ak-btn ak-btn-primary" style="align-self:flex-start">Visa klarspråksöversättning</button>
      <div id="akTrWrap" class="hidden" style="margin-top:12px">
        <div class="ak-label">Betyder egentligen:</div>
        <div class="ak-output" style="border-left:4px solid var(--g-blue)">${data.target}</div>
        <div class="ak-explain" style="margin-top:12px"><b>Begrepp:</b> ${data.exp}</div>
      </div>
    `;
    body.querySelector("#akShowTrBtn").addEventListener("click", (e) => {
      e.target.classList.add("hidden");
      body.querySelector("#akTrWrap").classList.remove("hidden");
    });
  }

  // ---- Läsförståelse (Nyheter/Podd med ordlista & quiz) ----
  function renderArticleQuiz(body, data) {
    body.innerHTML = `
      <div class="ak-output" style="line-height:1.7;margin-bottom:12px">${data.text}</div>
      <div class="ak-label">Ordlista:</div>
      <div class="ak-output ak-muted" style="margin-bottom:16px">${data.words.map(w => `<b>${w.word}</b>: ${w.def}`).join("<br>")}</div>
      <hr style="border:0;border-top:1px solid var(--border);margin-bottom:12px">
      <div class="ak-quiz-q">${data.q}</div>
      <div class="ak-quiz-opts" id="akOpts"></div>
      <div id="akExp" class="ak-explain hidden"></div>
    `;
    const optsDiv = body.querySelector("#akOpts");
    const expDiv = body.querySelector("#akExp");

    data.opts.forEach((opt, idx) => {
      const b = document.createElement("button");
      b.className = "ak-opt";
      b.textContent = opt;
      b.addEventListener("click", () => {
        Array.from(optsDiv.children).forEach(cb => cb.disabled = true);
        if (window.OK_recordResult) window.OK_recordResult(idx === data.ans);
        if (idx === data.ans) { b.classList.add("correct"); if(window.OK_fireConfetti) window.OK_fireConfetti(); }
        else { b.classList.add("wrong"); optsDiv.children[data.ans].classList.add("correct"); }
        expDiv.innerHTML = "<b>Svar:</b> " + data.exp;
        expDiv.classList.remove("hidden");
      });
      optsDiv.appendChild(b);
    });
  }

  // ---- Meningsbyggare (Dra ordrätt) ----
  function renderBuilder(body, data) {
    // Shuffla orden
    let w = [...data.words];
    for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; }
    
    body.innerHTML = `
      <p class="ak-build-target">Sätt ihop meningen i rätt ordning (V2-regeln!). Klicka på orden för att bygga meningen.</p>
      <div class="ak-tileline" id="akLine"></div>
      <div class="ak-tilebank" id="akBank"></div>
      <div class="ak-row" style="margin-top:12px">
        <button id="akCheckBtn" class="ak-btn ak-btn-primary">Rätta mening</button>
        <button id="akResetBtn" class="ak-btn">Nollställ</button>
      </div>
      <div id="akRes" class="ak-explain hidden" style="margin-top:12px"></div>
    `;
    const bank = body.querySelector("#akBank");
    const line = body.querySelector("#akLine");
    
    w.forEach((word, idx) => {
      const tile = document.createElement("div");
      tile.className = "ak-tile"; tile.textContent = word; tile.dataset.idx = idx;
      tile.addEventListener("click", () => {
        if (tile.parentElement === bank) line.appendChild(tile);
        else bank.appendChild(tile);
      });
      bank.appendChild(tile);
    });

    body.querySelector("#akResetBtn").addEventListener("click", () => {
      Array.from(line.children).forEach(c => bank.appendChild(c));
      body.querySelector("#akRes").classList.add("hidden");
    });
    
    body.querySelector("#akCheckBtn").addEventListener("click", () => {
      const current = Array.from(line.children).map(c => c.textContent).join(" ");
      const res = body.querySelector("#akRes");
      res.classList.remove("hidden");
      if (current === data.target || current.toLowerCase().replace(/[^a-zåäö]/g,'') === data.target.toLowerCase().replace(/[^a-zåäö]/g,'')) {
        res.innerHTML = "✅ <b>Helt rätt!</b><br><br>" + data.exp;
        if(window.OK_fireConfetti) window.OK_fireConfetti();
      } else {
        res.innerHTML = "❌ Inte helt rätt ännu. Tänk på ordföljden!<br>Rätt svar: <i>" + data.target + "</i>";
        if (window.OK_playSound) window.OK_playSound("lose");
      }
    });
  }

  // ---- Smart Läsläge (Klickbara ord) ----
  function renderInteractiveRead(body, text) {
    body.innerHTML = `
      <p style="color:var(--text-2);font-size:.85rem;margin-bottom:12px">
        Klicka på vilket ord som helst i texten för att slå upp det med AI i realtid.
      </p>
      <div id="akReadArea" class="ak-read"></div>
      <div id="akDictPop" class="ak-pop hidden" style="margin-top:16px"></div>
    `;
    const area = body.querySelector("#akReadArea");
    // Dela texten i ord men behåll skiljetecken utanför span
    const words = text.split(/(\\s+)/);
    words.forEach(part => {
      if (!part.trim()) { area.appendChild(document.createTextNode(part)); return; }
      
      const clean = part.replace(/^[^\\wåäöÅÄÖ]+|[^\\wåäöÅÄÖ]+$/g, "");
      if (!clean) { area.appendChild(document.createTextNode(part)); return; }
      
      const before = part.substring(0, part.indexOf(clean));
      const after = part.substring(part.indexOf(clean) + clean.length);
      
      if (before) area.appendChild(document.createTextNode(before));
      
      const span = document.createElement("span");
      span.className = "ak-word";
      span.textContent = clean;
      span.addEventListener("click", () => lookupInteractiveWord(clean, text));
      area.appendChild(span);
      
      if (after) area.appendChild(document.createTextNode(after));
    });
  }

  async function lookupInteractiveWord(word, context) {
    const pop = $("akDictPop");
    pop.classList.remove("hidden");
    pop.innerHTML = `<i>Slår upp "${word}"...</i>`;
    try {
      const p = `Ordet "${word}" förekommer i denna kontext: "${context.substring(0, 150)}...". 
      Ge mig följande som JSON: { word:'grundform', def:'kort förklaring på svenska', syn:['synonym1','synonym2'], ex:'Exempelmening' }`;
      const j = await callGemini(p, true);
      pop.innerHTML = `
        <h4>${j.word}</h4>
        <div class="ak-pop-row">${j.def}</div>
        <div class="ak-pop-row"><b>Synonymer:</b> ${j.syn.join(", ")}</div>
        <div class="ak-pop-row"><b>Exempel:</b> <i>${j.ex}</i></div>
      `;
    } catch (e) {
      pop.innerHTML = `<span style="color:#ea4335">Kunde inte slå upp ordet just nu.</span>`;
    }
  }

  // ---- Fritext / Assistans (Juridisk förenklare / Genreträning) ----
  function renderFreeform(body, t) {
    body.innerHTML = `
      <div class="ak-label">${t.desc}</div>
      <textarea id="akFreeInp" class="ak-textarea" placeholder="Skriv din text eller begäran här..."></textarea>
      <button id="akFreeBtn" class="ak-btn ak-btn-primary" style="margin-top:10px">✨ Generera feedback</button>
      <div id="akFreeOut" class="ak-output hidden" style="margin-top:16px"></div>
    `;
    body.querySelector("#akFreeBtn").addEventListener("click", async () => {
      const val = body.querySelector("#akFreeInp").value.trim();
      if (!val) return;
      const out = body.querySelector("#akFreeOut");
      out.classList.remove("hidden"); out.innerHTML = "<i>AI analyserar...</i>";
      
      const p = TEACHER_INSTRUCTION + "\n\n" + t.prompt.replace(/\{lvl\}/g, currentLevel) + "\\n\\nAnvändarens inmatning:\\n" + val;
      try {
        const res = await callGemini(p, false);
        // Tillåt markdown i detta svar (h1, bold etc)
        const htmlSafe = res.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
        out.innerHTML = htmlSafe;
        if(window.OK_playSound) window.OK_playSound("pop");
      } catch(e) {
        out.innerHTML = `<span style="color:#ea4335">${e.message}</span>`;
      }
    });
  }

  // ---- Coaching: CEFR Checklist ----
  function renderCEFRChecklist(body) {
    body.innerHTML = `
      <p class="ak-sub">Dessa punkter krävs generellt för nivå ${currentLevel}. Markera det du känner dig säker på.</p>
      <div id="akChecks" style="display:flex;flex-direction:column;gap:8px"></div>
    `;
    const lsKey = "ordkollen_cefr_checks_" + currentLevel;
    const checksData = {
      "A1": ["Förstår enkla vardagsord","Kan presentera mig själv","Förstår siffror och tid","Kan ställa enkla frågor"],
      "A2": ["Kan beskriva min bakgrund","Klarar rutinsituationer (butik)","Förstår korta, enkla texter","Kan skriva enkla meddelanden"],
      "B1": ["Förstår huvuddrag i nyheter","Kan hantera resor i Sverige","Kan skriva sammanhängande text","Kan beskriva erfarenheter och drömmar"],
      "B2": ["Förstår komplexa facktexter","Kan delta flytande i samtal","Förstår TV-nyheter och radio","Kan argumentera och skriva debattartiklar"],
      "C1": ["Förstår långa, krävande texter","Kan uttrycka mig spontant och flytande","Förstår underförstådd mening (ironi)","Kan skriva akademiska texter"],
      "C2": ["Förstår praktiskt taget allt","Kan sammanfatta från olika källor","Kan nyansera mig exakt i komplexa ämnen","Kan förstå fackspråk och slang flytande"]
    };
    
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(lsKey) || "{}"); } catch(e){}
    
    const wrap = body.querySelector("#akChecks");
    (checksData[currentLevel] || ["Inga mål definierade"]).forEach((txt, i) => {
      const row = document.createElement("div");
      row.className = "ak-check-item" + (saved[i] ? " done" : "");
      row.innerHTML = `<div class="box">${saved[i] ? "✓" : ""}</div> <span class="txt">${txt}</span>`;
      row.addEventListener("click", () => {
        saved[i] = !saved[i];
        localStorage.setItem(lsKey, JSON.stringify(saved));
        row.classList.toggle("done", saved[i]);
        row.querySelector(".box").textContent = saved[i] ? "✓" : "";
        if(saved[i] && window.OK_playSound) window.OK_playSound("pop");
      });
      wrap.appendChild(row);
    });
  }

  // ---- Coaching: Målstyrning & Plan ----
  function renderPlanMaker(body) {
    body.innerHTML = `
      <p class="ak-sub">Berätta vad du kämpar med just nu (t.ex. "Jag förstår när jag läser nyheter, men när svenskar pratar snabbt på fikarasten tappar jag bort mig. Jag har svårt med en/ett."). AI bygger en personlig plan.</p>
      <textarea id="akPlanInp" class="ak-textarea" placeholder="Mina svagheter är..."></textarea>
      <button id="akPlanGenBtn" class="ak-btn ak-btn-primary" style="margin-top:10px">✨ Skapa min studieplan</button>
      <div id="akPlanRes" class="ak-output hidden" style="margin-top:16px"></div>
      <button id="akPlanSaveBtn" class="ak-btn hidden" style="margin-top:10px">📌 Fäst planen på min dashboard</button>
    `;
    let currentPlanText = "";
    
    body.querySelector("#akPlanGenBtn").addEventListener("click", async () => {
      const val = body.querySelector("#akPlanInp").value.trim();
      if (!val) return;
      const out = body.querySelector("#akPlanRes");
      const sbtn = body.querySelector("#akPlanSaveBtn");
      out.classList.remove("hidden"); sbtn.classList.add("hidden");
      out.innerHTML = "<i>AI analyserar dina svagheter...</i>";
      
      const p = `Användaren är på nivå ${currentLevel} i svenska. De beskriver sina svagheter så här: "${val}".
      Gör en Svaghetsanalys och Studieplan. 
      Skriv KORT, sakligt och uppmuntrande men ärligt (max 4 punkter), utan överdrivet beröm. Föreslå VILKA specifika moduler i denna "Akademi" de ska köra. 
      Svara INTE med JSON, bara ren text.`;
      
      try {
        const res = await callGemini(p, false);
        currentPlanText = res;
        out.innerHTML = res.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
        sbtn.classList.remove("hidden");
        if(window.OK_playSound) window.OK_playSound("win");
      } catch(e) {
        out.innerHTML = `<span style="color:#ea4335">${e.message}</span>`;
      }
    });

    body.querySelector("#akPlanSaveBtn").addEventListener("click", () => {
      localStorage.setItem(LS_PLAN, currentPlanText);
      checkPlan();
      closeModal();
    });
  }

  function checkPlan() {
    const p = localStorage.getItem(LS_PLAN);
    const bar = $("akPlanBar");
    if (!bar) return;
    if (p) {
      bar.classList.remove("hidden");
      $("akPlanText").innerHTML = "<b>Din aktiva studieplan:</b><br>" + p.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
    } else {
      bar.classList.add("hidden");
    }
  }

  // Start
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
