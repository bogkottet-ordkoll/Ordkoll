/* =========================================================================
   Ordkollen – MILJÖ & KONTEXT (CEFR A1–C2) – FRISTÅENDE LAGER
   Lägger en "🌍 Miljö & kontext"-ruta PRECIS UNDER synonymer/uttryck/idiom i
   resultatkortet. För VARJE ord (alla ord man slår upp) visas en exempelmening
   och en miljö-/sammanhangsbeskrivning för nivåerna A1, A2, B1, B2, C1 och C2.

   • Genereras automatiskt med appens befintliga OpenAI-nyckel (samma som
     resten av appen använder) och cachas lokalt per ord.
   • Saknas nyckel visas en enkel offline-fallback så att rutan ALLTID finns,
     plus en knapp för att generera djupare A1–C2-exempel.
   Rör INTE app.js – kopplar bara via DOM/localStorage.
   ========================================================================= */
(function () {
  "use strict";

  var LS_GKEY   = "ordkollen_gemini_key";
  var LS_GMODEL = "ordkollen_gemini_model";
  // ChatGPT / OpenAI – används av "Miljö & kontext": omskrivningsutmaningen och skrivhjälpen.
  var LS_OKEY   = "ordkollen_openai_key";    // OpenAI API-nyckel (sk-...)
  var LS_OMODEL = "ordkollen_openai_model";  // t.ex. gpt-4o-mini
  var DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
  var CACHE_PFX = "ordkollen_ctx_";   // + ord  -> JSON med a1..c2
  var RW_PFX    = "ordkollen_rw_";    // + ord  -> avancerat exempel (str\u00e4ng)

  // [nyckel, etikett, nivånamn, ENKEL förklaring av VAR ordet används]
  var LEVELS = [
    ["a1", "A1", "Nybörjare",          "Vardagsord – hemma och i skolan."],
    ["a2", "A2", "Grundläggande",      "Enkla samtal med vänner och familj."],
    ["b1", "B1", "Mellannivå",         "Vardagstexter, bloggar och berättelser."],
    ["b2", "B2", "Övre mellannivå",    "Nyheter, jobbmejl och formella samtal."],
    ["c1", "C1", "Avancerad",          "Debattartiklar och facktexter."],
    ["c2", "C2", "Behärskar språket",  "Litteratur, retorik och avancerat språk."]
  ];

  function $(id) { return document.getElementById(id); }
  function openaiKey()   { try { return localStorage.getItem(LS_OKEY) || ""; } catch (e) { return ""; } }
  function openaiModel() { try { return localStorage.getItem(LS_OMODEL) || DEFAULT_OPENAI_MODEL; } catch (e) { return DEFAULT_OPENAI_MODEL; } }
  function gemKey()      { try { return localStorage.getItem(LS_GKEY) || ""; } catch (e) { return ""; } }
  function gemModel()    { try { return localStorage.getItem(LS_GMODEL) || "gemini-2.5-flash-lite"; } catch (e) { return "gemini-2.5-flash-lite"; } }
  // Finns nagon AI-nyckel? - styr om rutan kor AI eller offline-fallback.
  function key()   { return openaiKey() || gemKey(); }
  function model() { return openaiModel(); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function norm(w) { return String(w || "").trim().toLowerCase(); }

  function getCache(w) {
    try { return JSON.parse(localStorage.getItem(CACHE_PFX + norm(w)) || "null"); }
    catch (e) { return null; }
  }
  function setCache(w, obj) {
    try { localStorage.setItem(CACHE_PFX + norm(w), JSON.stringify(obj)); } catch (e) {}
  }
  function rwCache(w) { try { return localStorage.getItem(RW_PFX + norm(w)) || ""; } catch (e) { return ""; } }
  function rwSet(w, v) { try { localStorage.setItem(RW_PFX + norm(w), v || ""); } catch (e) {} }

  /* ---------- Cache av AI-granskningen (snabbare: samma mening granskas inte två gånger) ---------- */
  var GV_PFX = "ordkollen_gv3_";   // + ord + hash(mening) -> JSON med granskningen (v2: skärpt adjektivkongruens)
  function ghash(str) { var h = 5381; str = String(str || ""); for (var i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i); return (h >>> 0).toString(16); }
  function gvKey(w, txt) { return GV_PFX + norm(w) + "_" + ghash(String(txt || "").trim().toLowerCase()); }
  function gvGet(w, txt) { try { return JSON.parse(localStorage.getItem(gvKey(w, txt)) || "null"); } catch (e) { return null; } }
  function gvSet(w, txt, obj) { try { localStorage.setItem(gvKey(w, txt), JSON.stringify(obj)); } catch (e) {} }

  /* ---------- Slå upp ordets egna data (om det finns) ---------- */
  function entryFor(w) {
    var ob = window.ORDBOK || {};
    return ob[norm(w)] || ob[w] || null;
  }

  /* ---------- Offline-fallback: enkel men ordspecifik ---------- */
  function fallbackLevels(word, d) {
    var w = word;
    var kls = (d && d.ordklass) || "ord";
    var bes = (d && d.beskrivning) || "";
    var syn = (d && d.synonymer && d.synonymer[0]) || "";
    var utt = (d && d.uttryck && d.uttryck[0]) || "";
    var idi = (d && d.idiom && d.idiom[0]) || "";
    function row(ex, where) { return { exempel: ex, kontext: where }; }
    return {
      a1: row("Det här ordet är: \u201d" + w + "\u201d.",
              "Vardagligt tal, enkla meningar \u2013 t.ex. hemma eller i klassrummet."),
      a2: row("Jag lärde mig ordet \u201d" + w + "\u201d idag." + (syn ? " Det betyder ungefär \u201d" + syn + "\u201d." : ""),
              "Enkelt samtal med vänner eller familj."),
      b1: row(bes ? (w.charAt(0).toUpperCase() + w.slice(1) + ": " + bes) : ("Man använder ofta \u201d" + w + "\u201d i vanligt skriftspråk."),
              "Vardagsberättelser, bloggar och enklare texter."),
      b2: row(utt ? ("Uttrycket \u201d" + utt + "\u201d bygger på ordet \u201d" + w + "\u201d.")
                  : ("I en diskussion kan \u201d" + w + "\u201d användas för att nyansera det man säger."),
              "Nyheter, arbetsmejl och mer formella samtal."),
      c1: row(idi ? ("Idiomatiskt: \u201d" + idi + "\u201d.")
                  : ("\u201d" + (w.charAt(0).toUpperCase() + w.slice(1)) + "\u201d kan användas bildligt och med stilistisk avsikt."),
              "Debattartiklar, facktexter och kvalificerade samtal."),
      c2: row("På en mästerlig nivå vävs \u201d" + w + "\u201d in med exakt ton och register.",
              "Litteratur, retorik och avancerat skriftspråk.")
    };
  }

  /* ---------- OpenAI: generera A1–C2 ---------- */
  function buildPrompt(word, d) {
    var meta = [];
    if (d && d.ordklass) meta.push("ordklass: " + d.ordklass);
    if (d && d.beskrivning) meta.push("betydelse: " + d.beskrivning);
    var metaStr = meta.length ? " (" + meta.join(", ") + ")" : "";
    return (
      "Du \u00e4r en svensk spr\u00e5kl\u00e4rare. Skriv EN kort, enkel exempelmening p\u00e5 SVENSKA som inneh\u00e5ller ordet \u201d" +
      word + "\u201d" + metaStr + " f\u00f6r VARJE CEFR-niv\u00e5: A1, A2, B1, B2, C1 och C2. " +
      "Meningarna ska \u00f6ka i sv\u00e5righetsgrad: A1 mycket enkel och vardaglig, C2 avancerad och nyanserad. " +
      "H\u00e5ll varje mening kort och tydlig. " +
      "Returnera ENBART giltig JSON (inga kodblock, ingen extra text) med EXAKT nycklarna " +
      "a1, a2, b1, b2, c1, c2 d\u00e4r varje v\u00e4rde \u00e4r exempelmeningen som en str\u00e4ng."
    );
  }

  /* ---------- Bas-stil & ton för AI-svaren (ändra fritt här) ----------
     Detta är "grundstilen" som styr ton och språk i ALLA AI-svar nedan
     (omskrivningsutmaning + skrivhjälp). Justera meningen för att ändra känslan. */
  var BASE_STYLE =
    "Du är Ordkollens svenska språkcoach: pedagogisk och saklig, men ärlig. " +
    "Du skriver tydlig, korrekt och modern svenska, är konkret och håller dig kort utan onödiga facktermer. " +
    "Du uppmuntrar eleven att våga skriva, men sköljer inte över brister och följer alltid formatanvisningarna exakt.";

  /* ---------- Gemensam lärarinstruktion för SPRÅKGRANSKNING ----------
     Används vid bedömning av elevens egna meningar. Syftet är att roboten ska
     låta som en kritisk men saklig svensk lärare – inte som en överpositiv AI.
     Ändra fritt här för att justera hur sträng granskningen är. */
  var TEACHER_RULES =
    "Du är en kritisk men saklig svensk språklärare. Följ dessa regler strikt: " +
    "Ge aldrig beröm om det finns språkliga brister. " +
    "Säg inte ”Bra skrivet” om en mening är grammatiskt korrekt men låter onaturlig. " +
    "Skilj tydligt mellan grammatik, idiomatik (naturlighet) och stil – en mening kan vara grammatiskt korrekt men ändå låta oidiomatisk. " +
    "Om en formulering är möjlig men ovanlig: beskriv den som ”grammatiskt korrekt men mindre idiomatisk”. " +
    "Föredra formuleringar som en svensk modersmålstalare faktiskt skulle använda. " +
    "Var försiktig med CEFR-nivåer – en enda avancerad mening räcker inte för C2. " +
    "Bedöm endast det som faktiskt finns i texten och överdriv inte ordförrådets nivå. " +
    "Förklara ord sakligt och grammatiskt (t.ex. ”används korrekt som ett substantiv som beskriver stöd eller motivation”) och undvik svepande, AI-aktiga formuleringar (t.ex. om ”den positiva energin”). " +
    "Var återhållsam med beröm. ";

  /* ---------- ChatGPT / OpenAI: textgenerering ---------- */
  async function callOpenAI(prompt, opts) {
    var k = openaiKey();
    if (!k) throw new Error("Ingen OpenAI-nyckel.");
    opts = opts || {};
    var body = {
      model: openaiModel(),
      messages: [
        { role: "system", content: BASE_STYLE },
        { role: "user", content: prompt }
      ],
      temperature: (opts.temperature != null ? opts.temperature : 0.7)
    };
    if (opts.json) body.response_format = { type: "json_object" };
    var res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + k },
      body: JSON.stringify(body)
    });
    if (res.status === 429) throw new Error("OpenAI-kvoten är slut (429). Lägg till fakturering/krediter på platform.openai.com – eller använd Gemini.");
    if (res.status === 401) throw new Error("Ogiltig OpenAI-nyckel (401).");
    if (!res.ok) { var t = await res.text(); throw new Error("OpenAI API-fel (" + res.status + "). " + t.slice(0, 120)); }
    var j = await res.json();
    return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  }

  /* ---------- Gemini: textgenerering (reserv när OpenAI saknas/strular) ---------- */
  async function callGeminiAPI(prompt) {
    var k = gemKey();
    if (!k) throw new Error("Ingen Gemini-nyckel.");
    var fullPrompt = BASE_STYLE + "\n\n" + prompt;
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + gemModel() + ":generateContent?key=" + encodeURIComponent(k);
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
    });
    if (res.status === 429) throw new Error("Gemini-kvoten är slut (429). Byt modell i ⚙️ eller vänta en stund.");
    if (!res.ok) { var t = await res.text(); throw new Error("Gemini API-fel (" + res.status + "). " + t.slice(0, 120)); }
    var j = await res.json();
    return (j && j.candidates && j.candidates[0] && j.candidates[0].content &&
            j.candidates[0].content.parts && j.candidates[0].content.parts[0] &&
            j.candidates[0].content.parts[0].text) || "";
  }

  /* ---------- Smart router: ChatGPT först, annars/vid fel -> Gemini ----------
     Alla AI-anrop i filen går via callGemini(). Vi provar OpenAI när en
     OpenAI-nyckel finns; misslyckas det (kvot/401/404) faller vi tillbaka till
     Gemini om en Gemini-nyckel finns. Så rutan funkar så länge MINST en
     nyckel finns och har kvot. */
  async function callGemini(prompt, opts) {
    var hasOpenAI = !!openaiKey();
    var hasGemini = !!gemKey();
    if (hasOpenAI) {
      try { return await callOpenAI(prompt, opts); }
      catch (err) {
        if (hasGemini) { try { return await callGeminiAPI(prompt); } catch (e2) { throw err; } }
        throw err;
      }
    }
    if (hasGemini) return await callGeminiAPI(prompt);
    throw new Error("Ingen AI-nyckel. Lägg in en OpenAI- eller Gemini-nyckel via ⚙️.");
  }


  function normalizeLevels(obj) {
    var out = {};
    LEVELS.forEach(function (L) {
      var v = obj ? (obj[L[0]] || obj[L[1]] || obj[L[1].toLowerCase()]) : null;
      if (typeof v === "string") v = { exempel: v, kontext: "" };
      out[L[0]] = {
        exempel: (v && (v.exempel || v.mening || v.example)) || "",
        kontext: (v && (v.kontext || v.miljo || v.where)) || ""
      };
    });
    return out;
  }

  async function generate(word, d) {
    var txt = await callGemini(buildPrompt(word, d), { json: true });
    txt = txt.replace(/```json|```/g, "").trim();
    var data;
    try { data = JSON.parse(txt); }
    catch (e) {
      var m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Kunde inte tolka svaret.");
      data = JSON.parse(m[0]);
    }
    var levels = normalizeLevels(data);
    setCache(word, levels);
    return levels;
  }

  /* ---------- Rendering ---------- */
  function rowHtml(L, val) {
    // Var ordet används = fast, enkel förklaring per nivå (L[3]).
    return (
      '<div class="ok-ctx-row ok-ctx-' + L[0] + '">' +
        '<span class="ok-ctx-badge">' + L[1] + '</span>' +
        '<div class="ok-ctx-body">' +
          '<div class="ok-ctx-level">' + esc(L[2]) + '</div>' +
          '<div class="ok-ctx-ex">' + esc(val.exempel || "\u2013") + '</div>' +
          '<div class="ok-ctx-where">' + esc(L[3]) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------- Omskrivningsutmaning ("G\u00f6r meningen mer avancerad") ---------- */
  function baseSentence(word, levels) {
    var l = levels || {};
    return (l.a2 && l.a2.exempel) || (l.a1 && l.a1.exempel) || (l.b1 && l.b1.exempel) ||
           ("Jag anv\u00e4nde ordet \u201d" + word + "\u201d i en mening.");
  }

  function offlineAdvanced(word, base, d) {
    var syn = (d && d.synonymer && d.synonymer[0]) || "";
    var idi = (d && d.idiom && d.idiom[0]) || "";
    var utt = (d && d.uttryck && d.uttryck[0]) || "";
    var core = String(base || "").replace(/\s*[.!?]+\s*$/, "");
    var tail = idi ? (", n\u00e4st intill \u201d" + idi + "\u201d")
             : utt ? (", likt uttrycket \u201d" + utt + "\u201d") : "";
    var jmf = syn ? (" \u2013 d\u00e4r \u201d" + word + "\u201d ocks\u00e5 kan f\u00f6rst\u00e5s som \u201d" + syn + "\u201d" + tail + ")")
                  : (tail ? (" (" + tail.replace(/^,\s*/, "") + ")") : "");
    return "Med ett rikare spr\u00e5k: \u201d" + core + ", vilket p\u00e5 ett mer nyanserat s\u00e4tt framh\u00e4ver inneb\u00f6rden av \u201d" + word + "\u201d\u201d" + jmf + ".";
  }

  function advCardHtml(text) {
    return '<div class="ok-rw-card"><div class="ok-rw-label">\u2728 Avancerat exempel</div>' + esc(text) + '</div>';
  }
  function fbCardHtml(text) {
    return '<div class="ok-rw-card"><div class="ok-rw-label">\ud83e\udd16 Feedback</div>' + esc(text) + '</div>';
  }

  /* =========================================================================
     SKRIVHJÄLP – meningsbyggnad, bindeord & meningsmallar per CEFR-nivå.
     Visas under Omskrivningsutmaningen. Klick på ett bindeord/mall infogar
     texten i skrivrutan. Helt offline – inga externa anrop.
     ========================================================================= */
  var SKRIV_GUIDE = {
    A1: {
      namn: "Nybörjare",
      bygg: "Skriv korta huvudsatser: subjekt + verb + objekt. En tanke per mening. Sätt punkt ofta.",
      bindeord: ["och", "men", "eller", "så", "för", "också"],
      mallar: ["Jag …", "Det är …", "Här är …", "Jag tycker om …"],
      undvik: "Försök inte trycka in flera idéer i en mening – dela upp dem i två korta meningar."
    },
    A2: {
      namn: "Grundläggande",
      bygg: "Bind ihop två korta satser. Börjar du med ett tidsord (Sedan, Först, Efteråt) kommer verbet före subjektet: \u201dSedan gick jag hem.\u201d",
      bindeord: ["och", "men", "eller", "så", "sedan", "först", "efteråt", "därför", "till exempel"],
      mallar: ["Först … sedan …", "Jag tycker att …", "Det beror på …", "På morgonen … på kvällen …"],
      undvik: "Glöm inte omvänd ordföljd efter inledande tidsord (inte \u201dSedan jag gick\u201d utan \u201dSedan gick jag\u201d)."
    },
    B1: {
      namn: "Mellannivå",
      bygg: "Använd bisatser med att, som och eftersom. I en bisats står inte före verbet: \u201d… eftersom jag inte hann\u201d. Variera mening­längden.",
      bindeord: ["eftersom", "därför att", "fast", "trots att", "medan", "om", "när", "både … och", "dels … dels"],
      mallar: ["Eftersom … blir …", "Trots att … ändå …", "Det som är viktigt är att …", "Om … så …"],
      undvik: "Blanda inte ihop huvudsats- och bisatsordföljd. Bisatsen har \u201dinte\u201d före verbet."
    },
    B2: {
      namn: "Övre mellannivå",
      bygg: "Inled gärna med en bisats för variation: \u201dEftersom det regnade, stannade vi inne.\u201d Knyt ihop med sambandsord och använd passiv när det passar.",
      bindeord: ["däremot", "dessutom", "följaktligen", "nämligen", "således", "i och med att", "förutsatt att", "å ena sidan", "å andra sidan"],
      mallar: ["Å ena sidan … å andra sidan …", "Det innebär att …", "En förklaring kan vara att …", "Inte bara … utan även …"],
      undvik: "Staplar du för många bisatser tappar läsaren tråden – varva långa och korta meningar."
    },
    C1: {
      namn: "Avancerad",
      bygg: "Variera satsbyggnaden: inskjutna bisatser, particip­fraser och nominaliseringar. Styr informationsflödet så det kända kommer först och det nya sist.",
      bindeord: ["emellertid", "icke desto mindre", "i synnerhet", "med andra ord", "tvärtom", "för det första", "för det andra", "i synnerhet", "vilket innebär att"],
      mallar: ["Det bör betonas att …", "I synnerhet gäller detta …", "Med andra ord …", "Detta får till följd att …"],
      undvik: "Överdriv inte nominaliseringar (\u201dgenomförandet av analysen\u201d) – byt till verb när det blir tungt."
    },
    C2: {
      namn: "Behärskar språket",
      bygg: "Full stilistisk kontroll: anpassa register, rytm och retoriska figurer. Kombinera korta och långa meningar medvetet och undvik onödig komplexitet.",
      bindeord: ["likväl", "förvisso", "i ljuset av", "därigenom", "varvid", "såtillvida att", "ehuru", " inte minst"],
      mallar: ["Förvisso … men …", "I ljuset av detta framträder …", "Därigenom uppnås …", "Det är just därför …"],
      undvik: "Komplext betyder inte krångligt – välj det enklare ordet när det säger samma sak."
    }
  };
  var SKRIV_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

  function chip(text, kind) {
    return '<button type="button" class="ok-sw-chip ' + kind + '" data-insert="' + esc(text) + '">' + esc(text) + '</button>';
  }
  function skrivPanelHtml(lv) {
    var g = SKRIV_GUIDE[lv];
    return (
      '<div class="ok-sw-panel" data-lvl="' + lv + '">' +
        '<div class="ok-sw-row"><span class="ok-sw-rl">🧱 Meningsbyggnad</span>' +
          '<p class="ok-sw-text">' + esc(g.bygg) + '</p></div>' +
        '<div class="ok-sw-row"><span class="ok-sw-rl">🔗 Bindeord</span>' +
          '<div class="ok-sw-chips">' + g.bindeord.map(function (t) { return chip(t, "bind"); }).join("") + '</div></div>' +
        '<div class="ok-sw-row"><span class="ok-sw-rl">✏️ Meningsmallar</span>' +
          '<div class="ok-sw-chips">' + g.mallar.map(function (t) { return chip(t, "frame"); }).join("") + '</div></div>' +
        '<div class="ok-sw-row ok-sw-avoid"><span class="ok-sw-rl">⚠️ Undvik</span>' +
          '<p class="ok-sw-text">' + esc(g.undvik) + '</p></div>' +
      '</div>'
    );
  }
  function skrivhjalpHtml() {
    var pills = SKRIV_ORDER.map(function (lv, i) {
      return '<button type="button" class="ok-sw-lvl' + (i === 0 ? ' sel' : '') + '" data-lvl="' + lv + '">' +
        lv + ' <span class="ok-sw-lvlname">' + esc(SKRIV_GUIDE[lv].namn) + '</span></button>';
    }).join("");
    var panels = SKRIV_ORDER.map(function (lv, i) {
      return '<div class="ok-sw-wrap' + (i === 0 ? ' show' : '') + '" data-lvl="' + lv + '">' + skrivPanelHtml(lv) + '</div>';
    }).join("");
    return (
      '<details class="ok-sw">' +
        '<summary class="ok-sw-summary">🧰 Skrivhjälp – meningsbyggnad & bindeord (A1–C2)</summary>' +
        '<p class="ok-sw-lead">Välj en nivå och klicka på ett bindeord eller en mall så läggs det in i din mening ovanför. Så kan du skriva på alla nivåer utan att fastna.</p>' +
        '<div class="ok-sw-levels">' + pills + '</div>' +
        '<div class="ok-sw-panels">' + panels + '</div>' +
        '<div class="ok-sw-ai">' +
          '<button type="button" class="ok-ctx-btn ok-sw-aibtn">\u2728 Skr\u00e4ddarsy tips med AI</button>' +
          '<span class="ok-sw-aistatus"></span>' +
          '<div class="ok-sw-aiout"></div>' +
        '</div>' +
      '</details>'
    );
  }

  function wireSkrivhjalp(box, word) {
    var root = box.querySelector(".ok-sw");
    if (!root) return;
    var input = box.querySelector(".ok-rw-input");
    // Nivåväxling
    root.querySelectorAll(".ok-sw-lvl").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lv = btn.getAttribute("data-lvl");
        root.querySelectorAll(".ok-sw-lvl").forEach(function (b) { b.classList.toggle("sel", b === btn); });
        root.querySelectorAll(".ok-sw-wrap").forEach(function (w) {
          w.classList.toggle("show", w.getAttribute("data-lvl") === lv);
        });
      });
    });
    // Infoga bindeord/mall i skrivrutan
    root.querySelectorAll(".ok-sw-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        if (!input) return;
        var ins = c.getAttribute("data-insert") || "";
        var cur = input.value;
        var sep = (cur && !/\s$/.test(cur)) ? " " : "";
        input.value = cur + sep + ins + " ";
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    // AI-tips (ChatGPT): skraddarsy skrivhjalp for vald niva + ordet/utkastet.
    var aibtn = root.querySelector(".ok-sw-aibtn");
    if (aibtn) aibtn.addEventListener("click", function () { aiWritingHelp(box, root, word); });
  }

  function selectedSkrivLvl(root) {
    var sel = root.querySelector(".ok-sw-lvl.sel");
    return (sel && sel.getAttribute("data-lvl")) || "B1";
  }

  function aiTipsCardHtml(lv, tips, exempel) {
    var items = (tips || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var ex = exempel ? '<div class="ok-rw-corrected"><span class="ok-rw-corr-tag">Exempel</span> ' + esc(exempel) + '</div>' : "";
    return '<div class="ok-rw-card"><div class="ok-rw-label">\u2728 AI-skrivtips f\u00f6r ' + esc(lv) + '</div>' +
      (items ? '<ul class="ok-rw-errlist">' + items + '</ul>' : '') + ex + '</div>';
  }

  /* Skraddarsydd skrivhjalp via ChatGPT/OpenAI; offline-guiden ovan ar fallback. */
  async function aiWritingHelp(box, root, word) {
    var lv = selectedSkrivLvl(root);
    var out = root.querySelector(".ok-sw-aiout");
    var status = root.querySelector(".ok-sw-aistatus");
    var btn = root.querySelector(".ok-sw-aibtn");
    var base = readBase(box);
    var input = box.querySelector(".ok-rw-input");
    var draft = input ? input.value.trim() : "";
    if (!key()) {
      if (status) { status.classList.add("err"); status.textContent = "L\u00e4gg in en OpenAI-nyckel via \u2699\ufe0f f\u00f6r AI-tips \u2013 anv\u00e4nd guiden ovan s\u00e5 l\u00e4nge."; }
      var g = SKRIV_GUIDE[lv] || {};
      if (out) out.innerHTML = aiTipsCardHtml(lv, [g.bygg, g.undvik].filter(Boolean), "");
      return;
    }
    if (btn) btn.disabled = true;
    if (status) { status.classList.remove("err"); status.textContent = "\ud83e\udd16 AI skr\u00e4ddarsyr skrivtips\u2026"; }
    try {
      var prompt = "Eleven \u00f6var p\u00e5 att skriva svenska p\u00e5 CEFR-niv\u00e5 " + lv + ". " +
        "Ge konkret skrivhj\u00e4lp om MENINGSBYGGNAD och BINDEORD f\u00f6r just den niv\u00e5n, anpassad till ordet \u201d" + word + "\u201d" +
        (base ? (" och grundmeningen \u201d" + base + "\u201d") : "") +
        (draft ? (" och elevens utkast \u201d" + draft + "\u201d") : "") + ". " +
        "Returnera ENBART giltig JSON med nycklarna: tips (en lista med 3 korta, konkreta tips p\u00e5 svenska om hur man bygger meningar och binder ihop dem p\u00e5 niv\u00e5 " + lv + ") " +
        "och exempel (EN exempelmening p\u00e5 svenska, p\u00e5 niv\u00e5 " + lv + ", som inneh\u00e5ller ordet \u201d" + word + "\u201d).";
      var txt = (await callGemini(prompt, { json: true })).replace(/```json|```/g, "").trim();
      var data;
      try { data = JSON.parse(txt); }
      catch (e) { var m = txt.match(/\{[\s\S]*\}/); data = m ? JSON.parse(m[0]) : { tips: [txt], exempel: "" }; }
      if (out) out.innerHTML = aiTipsCardHtml(lv, Array.isArray(data.tips) ? data.tips : [data.tips], data.exempel || "");
      if (status) status.textContent = "";
    } catch (err) {
      if (status) { status.classList.add("err"); status.textContent = "Kunde inte h\u00e4mta AI-tips: " + err.message; }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function challengeHtml(word, base) {
    var cached = rwCache(word);
    return (
      '<div class="ok-rw">' +
        '<h4 class="ok-rw-head">\u270d\ufe0f Omskrivningsutmaning</h4>' +
        '<p class="ok-rw-task">G\u00f6r meningen mer avancerad \u2013 skriv om den med ett rikare och mer nyanserat spr\u00e5k (beh\u00e5ll ordet \u201d' + esc(word) + '\u201d).</p>' +
        '<div class="ok-rw-base">' + esc(base) + '</div>' +
        '<textarea class="ok-rw-input" placeholder="Skriv din mer avancerade version h\u00e4r\u2026"></textarea>' +
        '<div class="ok-rw-actions">' +
          '<button class="ok-ctx-btn ok-rw-eval">\u2705 Klar \u2013 visa resultat</button>' +
          '<button class="ok-ctx-btn ok-rw-reveal">\u2728 Visa ett avancerat exempel</button>' +
        '</div>' +
        '<span class="ok-rw-status"></span>' +
        '<div class="ok-rw-feedback' + (cached ? ' show' : '') + '">' + (cached ? advCardHtml(cached) : '') + '</div>' +
        skrivhjalpHtml() +
      '</div>'
    );
  }

  function boxHtml(word, levels, mode) {
    var rows = LEVELS.map(function (L) { return rowHtml(L, levels[L[0]] || {}); }).join("");
    var foot = "";
    if (mode === "fallback") {
      foot = '<div class="ok-ctx-foot">' +
        '<button class="ok-ctx-btn" data-ctx-gen="' + esc(word) + '">\u2728 Generera A1\u2013C2 med AI</button>' +
        '<span class="ok-ctx-note">Lägg in en OpenAI-nyckel via \u2699\ufe0f f\u00f6r mer tr\u00e4ffs\u00e4kra exempel.</span>' +
        '<span class="ok-ctx-status"></span>' +
      '</div>';
    } else if (mode === "ai") {
      foot = '<div class="ok-ctx-foot">' +
        '<button class="ok-ctx-btn" data-ctx-gen="' + esc(word) + '">\u21bb Generera om</button>' +
        '<span class="ok-ctx-status"></span>' +
      '</div>';
    } else if (mode === "loading") {
      foot = '<div class="ok-ctx-foot"><span class="ok-ctx-status">\ud83e\udd16 AI skriver exempel f\u00f6r A1\u2013C2\u2026</span></div>';
    }
    return (
      '<div class="ok-ctx" id="okCtxBox">' +
        '<h4 class="ok-ctx-head">\ud83c\udf0d Milj\u00f6 &amp; kontext ' +
          '<span class="ok-ctx-count">(A1\u2013C2)</span></h4>' +
        '<p class="ok-ctx-lead">S\u00e5 h\u00e4r anv\u00e4nds \u201d' + esc(word) + '\u201d i olika milj\u00f6er \u2013 fr\u00e5n nyb\u00f6rjare (A1) till den som beh\u00e4rskar spr\u00e5ket (C2).</p>' +
        '<div class="ok-ctx-list">' + rows + '</div>' +
        foot +
        challengeHtml(word, baseSentence(word, levels)) +
      '</div>'
    );
  }

  /* ---------- Injektion i resultatkortet ---------- */
  var injecting = false;

  function injectInto(card, word) {
    var d = entryFor(word);
    var cached = getCache(word);
    var levels, mode;
    if (cached) { levels = cached; mode = "ai"; }
    else { levels = fallbackLevels(word, d); mode = key() ? "loading" : "fallback"; }

    var box = document.createElement("div");
    box.innerHTML = boxHtml(word, levels, mode);
    box = box.firstChild;

    // Placera PRECIS UNDER synonymer/uttryck/idiom: dvs efter sista kategori-
    // blocket men före tips-raden ("💡 Klicka på ett ord ...").
    var tip = null;
    card.querySelectorAll("p").forEach(function (p) {
      if (!tip && /Klicka p\u00e5 ett ord/.test(p.textContent)) tip = p;
    });
    if (tip) card.insertBefore(box, tip);
    else card.appendChild(box);

    wireBox(box, word);

    // Auto-generera om nyckel finns och inget är cachat
    if (mode === "loading") runGenerate(word, box, true);
  }

  async function runGenerate(word, box, silent) {
    if (!key()) {
      // Öppna inställningar så användaren kan lägga in nyckel
      var ob = $("settingsBtn") || $("openSettings") || $("gearBtn");
      var status = box.querySelector(".ok-ctx-status");
      if (status) { status.classList.add("err"); status.textContent = "L\u00e4gg in en OpenAI-nyckel via \u2699\ufe0f f\u00f6rst."; }
      if (ob) ob.click();
      return;
    }
    var status = box.querySelector(".ok-ctx-status");
    var btn = box.querySelector("[data-ctx-gen]");
    if (btn) btn.disabled = true;
    if (status) { status.classList.remove("err"); status.textContent = "\ud83e\udd16 AI skriver exempel f\u00f6r A1\u2013C2\u2026"; }
    try {
      var d = entryFor(word);
      var levels = await generate(word, d);
      // Bygg om hela rutan i "ai"-läge på plats
      var holder = document.createElement("div");
      holder.innerHTML = boxHtml(word, levels, "ai");
      var fresh = holder.firstChild;
      box.parentNode.replaceChild(fresh, box);
      wireBox(fresh, word);
    } catch (err) {
      if (btn) btn.disabled = false;
      if (status) { status.classList.add("err"); status.textContent = "Kunde inte generera: " + err.message; }
    }
  }

  /* ---------- Observera resultatområdet ---------- */
  /* Koppla alla knappar i rutan (kontext + omskrivningsutmaning) */
  function wireBox(box, word) {
    var gen = box.querySelector("[data-ctx-gen]");
    if (gen) gen.addEventListener("click", function () { runGenerate(word, box); });
    var rev = box.querySelector(".ok-rw-reveal");
    if (rev) rev.addEventListener("click", function () { revealAdvanced(word, box); });
    var ev = box.querySelector(".ok-rw-eval");
    if (ev) ev.addEventListener("click", function () { evalRewrite(word, box); });
    wireSkrivhjalp(box, word);
  }

  function readBase(box) {
    var b = box.querySelector(".ok-rw-base");
    return b ? b.textContent.trim() : "";
  }

  /* Visa ett mer avancerat exempel p\u00e5 meningen (Gemini, annars offline) */
  async function revealAdvanced(word, box) {
    var fb = box.querySelector(".ok-rw-feedback");
    var status = box.querySelector(".ok-rw-status");
    var btn = box.querySelector(".ok-rw-reveal");
    var base = readBase(box);
    var cached = rwCache(word);
    if (cached) { if (fb) { fb.innerHTML = advCardHtml(cached); fb.classList.add("show"); } return; }
    if (!key()) {
      var adv = offlineAdvanced(word, base, entryFor(word));
      if (fb) { fb.innerHTML = advCardHtml(adv); fb.classList.add("show"); }
      if (status) { status.classList.remove("err"); status.textContent = "L\u00e4gg in en OpenAI-nyckel via \u2699\ufe0f f\u00f6r ett skarpare exempel."; }
      return;
    }
    if (btn) btn.disabled = true;
    if (status) { status.classList.remove("err"); status.textContent = "\ud83e\udd16 AI skriver ett avancerat exempel\u2026"; }
    try {
      var prompt = "Skriv om f\u00f6ljande svenska mening s\u00e5 att den blir tydligt mer avancerad, nyanserad och stilistiskt rik, " +
        "men beh\u00e5ll ordet \u201d" + word + "\u201d och samma grundbetydelse. Svara ENBART med den omskrivna meningen, utan citattecken. Mening: \u201d" + base + "\u201d";
      var out = (await callGemini(prompt)).replace(/```/g, "").replace(/^[\s\u201d\u201c"']+|[\s\u201d\u201c"']+$/g, "").trim();
      rwSet(word, out);
      if (fb) { fb.innerHTML = advCardHtml(out); fb.classList.add("show"); }
      if (status) status.textContent = "";
    } catch (err) {
      if (status) { status.classList.add("err"); status.textContent = "Kunde inte generera: " + err.message; }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* Bed\u00f6m anv\u00e4ndarens egna mer avancerade mening (Gemini) */
  /* Visa ett positivt slutresultat + ord fr\u00e5n ordboken man kunde ha haft med.
     Ingen AI-feedback som tjatar om att byta ord \u2013 bara uppmuntran + ordtips. */
  function suggestFromOrdbok(word, d, userText) {
    if (!d) return [];
    var lc = String(userText || "").toLowerCase();
    var seen = {}, out = [];
    // Synonymer är de mest relevanta "ord du kunde ha haft med" – de visas först.
    // Uttryck/idiom/slang tas bara med om de är korta (enstaka ord eller mycket
    // korta fraser), annars blir förslagen irrelevanta och förvirrande.
    function add(list, maxWords) {
      (list || []).forEach(function (t) {
        t = String(t || "").trim();
        var k = t.toLowerCase();
        if (!t || k === norm(word) || seen[k]) return;
        if (lc.indexOf(k) !== -1) return;                 // redan med i meningen
        if (maxWords && t.split(/\s+/).length > maxWords) return; // hoppa över långa fraser
        seen[k] = 1; out.push(t);
      });
    }
    add(d.synonymer, 0);   // alla synonymer (mest relevanta)
    add(d.slang, 1);       // bara enstaka slangord
    add(d.uttryck, 3);     // korta uttryck
    add(d.idiom, 3);       // korta idiom
    return out.slice(0, 6);
  }

  /* Enkel lokal nonsens-koll (offline, n\u00e4r ingen OpenAI-nyckel finns) */
  function looksLikeNonsense(text) {
    var t = String(text || "").trim();
    if (t.length < 3) return true;
    var letters = t.replace(/[^a-zA-Z\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6]/g, "");
    if (!letters) return true;
    var vowels = (letters.match(/[aeiouy\u00e5\u00e4\u00f6AEIOUY\u00c5\u00c4\u00d6]/g) || []).length;
    var ratio = vowels / letters.length;
    var words = t.split(/\s+/).filter(Boolean);
    var longNoVowel = words.some(function (w) {
      var L = w.replace(/[^a-zA-Z\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6]/g, "");
      return L.length >= 5 && !/[aeiouy\u00e5\u00e4\u00f6AEIOUY\u00c5\u00c4\u00d6]/.test(L);
    });
    return ratio < 0.18 || longNoVowel;
  }

  /* ---------- CEFR-niv\u00e5 (A1\u2013C2) f\u00f6r elevens egen mening ---------- */
  var LEVEL_NAMES = {
    A1: "Nyb\u00f6rjare", A2: "Grundl\u00e4ggande", B1: "Mellanniv\u00e5",
    B2: "\u00d6vre mellanniv\u00e5", C1: "Avancerad", C2: "Beh\u00e4rskar spr\u00e5ket"
  };
  function normLevel(v) {
    var m = String(v || "").toUpperCase().replace(/\s+/g, "").match(/[ABC][12]\+?/);
    return m ? m[0] : "";
  }
  function levelCardHtml(niva, motivering) {
    var lv = normLevel(niva);
    if (!lv) return "";
    var name = LEVEL_NAMES[lv.replace("+", "")] || "";
    return '<div class="ok-rw-card ok-rw-level"><div class="ok-rw-label">\ud83d\udcd0 Uppskattad niv\u00e5: ' +
      esc(lv) + (name ? ' \u2013 ' + esc(name) : '') + '</div>' + esc(motivering || "") + '</div>';
  }
  /* Lokal, grov niv\u00e5uppskattning n\u00e4r ingen OpenAI-nyckel finns. */
  function estimateLevel(text) {
    var t = String(text || "").trim();
    if (!t) return { niva: "", mot: "" };
    var words = t.split(/\s+/).filter(Boolean);
    var n = words.length;
    var avgLen = words.reduce(function (a, w) { return a + w.length; }, 0) / (n || 1);
    var commas = (t.match(/,/g) || []).length;
    var conj = (t.match(/\b(som|att|eftersom|d\u00e4rf\u00f6r|trots|medan|vilket|d\u00e5|n\u00e4r|om|f\u00f6r att|s\u00e5som)\b/gi) || []).length;
    var score = 0;
    if (n >= 8) score++;
    if (n >= 14) score++;
    if (avgLen >= 5) score++;
    if (avgLen >= 6.5) score++;
    if (commas >= 1) score++;
    if (conj >= 1) score++;
    if (conj >= 2) score++;
    var levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    var idx = Math.min(score, 5);
    return {
      niva: levels[idx],
      mot: "Grov uppskattning utifr\u00e5n meningens l\u00e4ngd (" + n + " ord), ordl\u00e4ngd och bisatser. " +
        "L\u00e4gg in en OpenAI-nyckel via \u2699\ufe0f f\u00f6r en s\u00e4krare niv\u00e5bed\u00f6mning."
    };
  }

  function verdictCardHtml(status, omdome) {
    var head, cls;
    if (status === "nonsens") { head = "\u26a0\ufe0f Det ser ut som nonsens"; cls = "ok-rw-warn"; }
    else if (status === "fel") { head = "\u270f\ufe0f N\u00e4stan r\u00e4tt"; cls = "ok-rw-warn"; }
    else { head = "\u2705 Grammatiskt korrekt"; cls = "ok-rw-good"; }
    return '<div class="ok-rw-card ' + cls + '"><div class="ok-rw-label">' + head + '</div>' + esc(omdome || "") + '</div>';
  }

  /* Naturlighet/idiomatik \u2013 separat fr\u00e5n grammatiken. */
  function naturalnessCardHtml(naturlighet, kommentar) {
    var v = String(naturlighet || "").toLowerCase();
    if (!v) return "";
    var head, cls;
    if (v.indexOf("onaturlig") !== -1 && v.indexOf("n\u00e5got") === -1) { head = "\u26a0\ufe0f Onaturlig formulering"; cls = "ok-rw-warn"; }
    else if (v.indexOf("onaturlig") !== -1) { head = "\u26a0\ufe0f N\u00e5got onaturlig"; cls = "ok-rw-warn"; }
    else { head = "\ud83d\udc4d L\u00e5ter naturlig"; cls = "ok-rw-good"; }
    return '<div class="ok-rw-card ' + cls + '"><div class="ok-rw-label">' + head + '</div>' + esc(kommentar || "") + '</div>';
  }

  /* Platshallare for grammatik/en-ett nar ingen AI-nyckel finns (sa kortet inte forsvinner helt). */
  function offlineGrammarNoteHtml() {
    return '<div class="ok-rw-card ok-rw-grammar">' +
      '<div class="ok-rw-label">\u270f\ufe0f Grammatik &amp; en/ett</div>' +
      '<div class="ok-rw-errwhy">en/ett- och grammatikkollen k\u00f6rs av AI. L\u00e4gg in en OpenAI- eller Gemini-nyckel via \u2699\ufe0f s\u00e5 granskas din mening p\u00e5 riktigt \u2013 med r\u00e4ttad mening och en/ett-f\u00f6rklaring.</div>' +
    '</div>';
  }

  function wordTipsHtml(word, userText) {
    var sugg = suggestFromOrdbok(word, entryFor(word), userText);
    if (!sugg.length) {
      return '<div class="ok-rw-card">Snyggt \u2013 du fick redan med starka ord fr\u00e5n ordboken! \ud83d\udc4f</div>';
    }
    return '<div class="ok-rw-card">' +
      '<div class="ok-rw-label">\ud83d\udcda Ord fr\u00e5n ordboken du kunde ha haft med</div>' +
      '<div class="ok-rw-chips">' +
        sugg.map(function (t) { return '<button class="ok-rw-chip" data-term="' + esc(t) + '">' + esc(t) + '</button>'; }).join("") +
      '</div></div>';
  }

  /* Markera AI:ns r\u00e4ttningar: [[...]] blir en markerad (highlightad) del. */
  function highlightFixes(rattad) {
    var s = esc(String(rattad || ""));
    return s.replace(/\[\[([\s\S]*?)\]\]/g, '<mark class="ok-rw-fix">$1</mark>');
  }

  /* Grammatikkort: en/ett + \u00f6vriga spr\u00e5kfel, plus den r\u00e4ttade meningen
     d\u00e4r exakt de \u00e4ndrade orden \u00e4r markerade s\u00e5 man ser VAR de ska ligga. */
  function grammarCardHtml(rattad, fellista) {
    var list = Array.isArray(fellista) ? fellista : [];
    if (!list.length && !rattad) return "";
    var rows = list.map(function (f) {
      f = f || {};
      var typ = f.typ ? '<span class="ok-rw-errtype">' + esc(f.typ) + '</span>' : "";
      var change = "";
      if (f.fel && f.ratt) change = '<s>' + esc(f.fel) + '</s> \u2192 <b>' + esc(f.ratt) + '</b>';
      else if (f.ratt) change = '<b>' + esc(f.ratt) + '</b>';
      else if (f.fel) change = '<s>' + esc(f.fel) + '</s>';
      var why = f.forklaring ? '<div class="ok-rw-errwhy">' + esc(f.forklaring) + '</div>' : "";
      return '<li>' + typ + (change ? ' ' + change : '') + why + '</li>';
    }).join("");
    var corrected = rattad
      ? '<div class="ok-rw-corrected"><span class="ok-rw-corr-tag">R\u00e4tt</span> ' + highlightFixes(rattad) + '</div>'
      : "";
    var body = list.length
      ? '<ul class="ok-rw-errlist">' + rows + '</ul>'
      : '<div class="ok-rw-errwhy">Inga en/ett- eller grammatikfel hittades \u2013 snyggt! \ud83d\udc4d</div>';
    return '<div class="ok-rw-card ok-rw-grammar">' +
      '<div class="ok-rw-label">\u270f\ufe0f Grammatik &amp; en/ett</div>' +
      corrected + body +
    '</div>';
  }

  function showVerdict(box, html, userText) {
    var fb = box.querySelector(".ok-rw-feedback");
    if (!fb) return;
    fb.innerHTML = html;
    fb.classList.add("show");
    fb.querySelectorAll(".ok-rw-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var term = c.getAttribute("data-term");
        var si = $("searchInput");
        if (si) {
          si.value = term;
          si.dispatchEvent(new Event("input", { bubbles: true }));
          var form = si.closest("form"); if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          si.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      });
    });
  }

  /* Granska meningen: nonsens? korrekt? + analys av hur ordet anv\u00e4nds.
     AI (Gemini) n\u00e4r nyckel finns, annars lokal koll. Inga tjatiga byt-ord-r\u00e5d. */
  /* Bygg HTML f\u00f6r en (ev. cachad) AI-granskning. Samma utseende oavsett om
     resultatet just h\u00e4mtades eller l\u00e4stes fr\u00e5n cachen. */
  function buildVerdictHtml(data, word, user) {
    data = data || {};
    var st = ["ok", "nonsens", "fel"].indexOf(data.status) !== -1 ? data.status : "ok";
    var html = verdictCardHtml(st, data.omdome || "");
    if (st !== "nonsens") html += naturalnessCardHtml(data.naturlighet, data.naturlighetskommentar);
    if (st !== "nonsens") html += levelCardHtml(data.niva, data.nivamotivering);
    if (data.ordanalys) html += '<div class="ok-rw-card"><div class="ok-rw-label">\ud83d\udd0e Ordanalys</div>' + esc(data.ordanalys) + '</div>';
    if (st !== "nonsens" && data.idiomatiskt_alternativ && String(data.idiomatiskt_alternativ).trim())
      html += '<div class="ok-rw-card ok-rw-tip"><div class="ok-rw-label">\ud83d\udca1 Mer idiomatiskt alternativ</div>' + esc(data.idiomatiskt_alternativ) + '</div>';
    if (st !== "nonsens") html += grammarCardHtml(data.rattad, data.grammatik);
    if (st !== "nonsens") html += wordTipsHtml(word, user);
    return html;
  }

  async function evalRewrite(word, box) {
    var status = box.querySelector(".ok-rw-status");
    var btn = box.querySelector(".ok-rw-eval");
    var input = box.querySelector(".ok-rw-input");
    var user = input ? input.value.trim() : "";
    if (!user) {
      if (status) { status.classList.add("err"); status.textContent = "Skriv din mening f\u00f6rst."; }
      if (input) input.focus();
      return;
    }
    if (status) { status.classList.remove("err"); status.textContent = ""; }

    // ---- Snabbare: återanvänd en tidigare AI-granskning av exakt samma mening ----
    if (key()) {
      var cachedV = gvGet(word, user);
      if (cachedV) {
        showVerdict(box, buildVerdictHtml(cachedV, word, user), user);
        if (status) status.textContent = "";
        return;
      }
    }

    // ---- Offline (ingen nyckel): lokal nonsens-koll + ordtips ----
    if (!key()) {
      if (looksLikeNonsense(user)) {
        showVerdict(box, verdictCardHtml("nonsens", "Det h\u00e4r ser inte ut som en riktig mening. F\u00f6rs\u00f6k skriva en hel, vettig mening med ordet \u201d" + word + "\u201d."), user);
      } else {
        var est = estimateLevel(user);
        showVerdict(box,
          verdictCardHtml("ok", "Din mening h\u00e5ller och anv\u00e4nder \u201d" + word + "\u201d.") +
            levelCardHtml(est.niva, est.mot) + offlineGrammarNoteHtml() + wordTipsHtml(word, user),
          user);
        if (status) status.textContent = "L\u00e4gg in en OpenAI- eller Gemini-nyckel via \u2699\ufe0f f\u00f6r en djupare AI-granskning (en/ett, r\u00e4ttning m.m.).";
      }
      return;
    }

    // ---- AI-granskning (Gemini) ----
    if (btn) btn.disabled = true;
    if (status) { status.classList.remove("err"); status.textContent = "\ud83e\udd16 AI granskar din mening\u2026"; }
    try {
      var d = entryFor(word);
      var meta = d && d.beskrivning ? (" Ordets betydelse: \u201d" + d.beskrivning + "\u201d.") : "";
      var prompt = TEACHER_RULES +
        " Analysera nu elevens mening som en kritisk men saklig svensk spr\u00e5kgranskare. Ordet som skulle anv\u00e4ndas: \u201d" + word + "\u201d." + meta +
        " Mening: \u201d" + user + "\u201d. Bed\u00f6m om meningen \u00e4r (a) en vettig och korrekt svensk mening, (b) nonsens/slumpm\u00e4ssig text, eller (c) riktiga ord men med spr\u00e5kfel. " +
        "Returnera ENBART giltig JSON (inga kodblock) med nycklarna: " +
        "status (en av: \"ok\", \"nonsens\", \"fel\"), " +
        "omdome (en kort mening p\u00e5 svenska som f\u00f6rklarar bed\u00f6mningen), " +
        "ordanalys (en kort, KONKRET mening p\u00e5 svenska om ordet \u201d" + word + "\u201d: ange ordklass/form och s\u00e4g specifikt om det anv\u00e4nds IDIOMATISKT och passar i just det h\u00e4r sammanhanget. Skriv inget inneh\u00e5llsl\u00f6st, t.ex. \u201danv\u00e4nds f\u00f6r att beskriva handlingen att ge st\u00f6d\u201d \u2013 skriv hellre \u201dverbformen passar idiomatiskt h\u00e4r\u201d. Undvik AI-aktiga omd\u00f6men om \u201dpositiv energi\u201d), " +
        "naturlighet (bed\u00f6m hur idiomatisk meningen \u00e4r f\u00f6r en svensk modersm\u00e5lstalare, OBEROENDE av grammatiken \u2013 EN av: \"naturlig\", \"n\u00e5got onaturlig\", \"onaturlig\". En grammatiskt korrekt mening kan \u00e4nd\u00e5 vara n\u00e5got onaturlig.), " +
        "naturlighetskommentar (en kort mening p\u00e5 svenska som f\u00f6rklarar varf\u00f6r meningen l\u00e5ter naturlig eller onaturlig \u2013 peka p\u00e5 det konkreta problemet, t.ex. betydelse\u00f6verlapp eller tung konstruktion), " +
        "idiomatiskt_alternativ (om meningen INTE \u00e4r helt naturlig: skriv en omformulerad, mer idiomatisk version av HELA elevens mening som beh\u00e5ller betydelsen. Om meningen redan \u00e4r naturlig: l\u00e4mna tom str\u00e4ng), " +
        "niva (bedöm STRÄNGT och KONSERVATIVT vilken CEFR-nivå elevens egen mening är skriven på. Välj EN av: A1, A2, B1, B1+, B2, B2+, C1, C1+, C2 – använd plusvarianten (t.ex. B1+) när meningen ligger i överkant av en nivå men inte fullt når nästa. Var INTE generös. Riktlinjer: A1/A2 = mycket korta, enkla huvudsatser; B1 = enstaka bisats (att/som/eftersom) och vardagligt ordförråd; B1+ = korrekt bisats och något mer formellt uttryckssätt men fortfarande relativt enkel meningsbyggnad; B2 = flera satser, tydligt formellare ordval och någon mer avancerad konstruktion; C1 = ENDAST om meningen verkligen har komplex struktur (flera eller inbäddade bisatser, avancerade konnektorer) och nyanserat/ovanligt ordförråd; C2 = mästerlig stilistisk kontroll. En enda kort och rak mening med en bisats når i regel HÖGST B1+ även om den är helt korrekt; korrekt grammatik räcker ALDRIG för B2 eller högre. Vid minsta tvekan, välj den LÄGRE nivån.), " +
        "nivamotivering (en kort mening i KLARSPRÅK, som en svensk lärare – beskriv KONKRET vad meningen faktiskt innehåller, t.ex. \u201den korrekt bisats\u201d, \u201dett något mer formellt uttryckssätt\u201d eller \u201drelativt enkel meningsbyggnad\u201d. Förbjudna fraser: undvik abstrakta AI-uttryck som \u201dsyntaktisk variation\u201d, \u201dlexikalt djup\u201d eller \u201dstilistisk komplexitet\u201d – skriv istället enkelt och handfast). " +
        "grammatik (en lista \u2013 ETT objekt per spr\u00e5kfel du hittar. Varje objekt har f\u00e4lten: " +
          "typ (kort etikett, t.ex. \"en/ett\", \"ordf\u00f6ljd\", \"verbform\", \"bestämdhet\", \"stavning\"), " +
          "fel (den felaktiga delen ur meningen, ordagrant), " +
          "ratt (exakt samma del korrekt skriven), " +
          "forklaring (kort p\u00e5 svenska som f\u00f6rklarar VARF\u00d6R det \u00e4r fel och VAR det r\u00e4tta ska st\u00e5 \u2013 f\u00f6rklara s\u00e4rskilt en/ett-genus, t.ex. varf\u00f6r ett ord tar \"en\" eller \"ett\"). " +
          "L\u00e4mna listan tom ([]) om meningen redan \u00e4r grammatiskt korrekt. " +
          "Hitta s\u00e4rskilt fel p\u00e5 en/ett (genus), bestämd/obestämd form, ordf\u00f6ljd, verbform och ADJEKTIVKONGRUENS. Adjektiv MÅSTE böjas efter sitt huvudord/subjekt: ett-ord (neutrum) får -t (t.ex. ”ett prekärt läge”), plural får -a, och detta gäller ÄVEN i PREDIKATIV ställning efter är/blir/verkar samt när subjektet är en infinitiv- eller att-sats (som räknas som neutrum, t.ex. ”Att simma är farligt”, ”Att riskera det är mycket prekärt”). Rätta aldrig ett adjektiv till en form som inte kongruerar med subjektets genus/numerus.), " +
        "rattad (hela elevens mening helt korrekt skriven; markera EXAKT varje ord du \u00e4ndrat, lagt till eller flyttat genom att omsluta det med dubbla hakparenteser, t.ex. \"Det var [[ett]] stort hus.\". Om inget beh\u00f6ver \u00e4ndras: returnera meningen of\u00f6r\u00e4ndrad utan hakparenteser.). " +
        "SÄKERSTÄLL att fältet rattad är en HELT grammatiskt korrekt och självkonsistent mening utan några nya fel: varje adjektiv ska kongruera (neutrum -t, plural -a) och varje rättning du gör i grammatik-listan ska vara grammatiskt korrekt i sig. Om du ändrar ett adjektiv, kontrollera en extra gång att den nya formen stämmer med subjektets genus och numerus innan du svarar. L\u00e4gg INTE in f\u00f6rslag p\u00e5 att byta ut ord.";
      var txt = (await callGemini(prompt, { json: true })).replace(/```json|```/g, "").trim();
      var data;
      try { data = JSON.parse(txt); }
      catch (e) { var m = txt.match(/\{[\s\S]*\}/); data = m ? JSON.parse(m[0]) : { status: "ok", omdome: txt, ordanalys: "" }; }
      data.status = ["ok", "nonsens", "fel"].indexOf(data.status) !== -1 ? data.status : "ok";
      if (window.OK_recordResult && data.status !== "nonsens") window.OK_recordResult(data.status === "ok");
      if (window.OK_recordCEFR && data.niva) window.OK_recordCEFR(data.niva);
      gvSet(word, user, data);   // cacha granskningen så samma mening går direkt nästa gång
      showVerdict(box, buildVerdictHtml(data, word, user), user);
      if (status) status.textContent = "";
    } catch (err) {
      if (status) { status.classList.add("err"); status.textContent = "Kunde inte granska: " + err.message; }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function sync() {
    if (injecting) return;
    var area = $("resultArea");
    if (!area) return;
    var card = area.querySelector(".card");
    var h = area.querySelector("h3.capitalize");
    if (!card || !h) return;
    var word = h.textContent.trim();
    if (!word) return;
    // Redan injicerad för detta ord?
    if (card.getAttribute("data-okctx") === word && card.querySelector("#okCtxBox")) return;
    injecting = true;
    try {
      var old = card.querySelector("#okCtxBox");
      if (old) old.remove();
      card.setAttribute("data-okctx", word);
      injectInto(card, word);
    } finally {
      // Släpp spärren efter att DOM-ändringarna lagt sig
      setTimeout(function () { injecting = false; }, 0);
    }
  }

  function init() {
    var area = $("resultArea");
    if (!area) { setTimeout(init, 400); return; }
    if ("MutationObserver" in window) {
      new MutationObserver(function () { sync(); }).observe(area, { childList: true, subtree: true });
    }
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
