/* =========================================================================
   Ordkollen – TILLÄGG (11 nya funktioner) – FRISTÅENDE LAGER
   Kopplar BARA via DOM/localStorage. Rör inte app.js interna logik.
   Se enhancements.css för punktlista över alla 11 funktioner.
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
    localStorage.setItem(k, JSON.stringify(Array.from(new Set(arr))));
    try { if (window.FirebaseSync && window.FirebaseSync.setWords) window.FirebaseSync.setWords(arr); } catch (e) {}
    refreshSavedView();
  }
  function refreshSavedView() {
    var v = $("view-sparade");
    if (v && !v.classList.contains("hidden")) {
      var tab = document.querySelector('.navtab[data-view="sparade"]');
      if (tab) tab.click();
    }
    var badge = $("navSavedCount"); // best-effort badge sync
  }

  /* ---------- localStorage-hjälpare ---------- */
  function lsGet(k, f) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- Gemini ---------- */
  function geminiKey() { try { return localStorage.getItem("ordkollen_gemini_key") || ""; } catch (e) { return ""; } }
  function geminiModel() { try { return localStorage.getItem("ordkollen_gemini_model") || "gemini-2.5-flash-lite"; } catch (e) { return "gemini-2.5-flash-lite"; } }
  function callGemini(prompt) {
    var key = geminiKey();
    if (!key) return Promise.reject(new Error("no-key"));
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel() + ":generateContent?key=" + encodeURIComponent(key);
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
      .then(function (r) { if (!r.ok) throw new Error("api " + r.status); return r.json(); })
      .then(function (j) { return (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || ""; });
  }

  /* ---------- toast ---------- */
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "ok2-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ---------- sentiment ---------- */
  function sentOf(word) { var d = ORDBOK()[norm(word)]; return d ? (d.sentiment || null) : null; }
  function descOf(word) { var d = ORDBOK()[norm(word)]; return d ? (d.beskrivning || "") : ""; }
  function sentClass(s) { return s === "positiv" ? "pos" : s === "negativ" ? "neg" : "neu"; }
  function sentLabel(s) { return s === "positiv" ? "🟢 Positivt" : s === "negativ" ? "🔴 Negativt" : "⚪ Neutralt"; }

  /* =====================================================================
     6 + 5) FÖRENKLAD BESKRIVNING – popup (långtryck + bubbla)
     ===================================================================== */
  var popEl = null;
  function hidePop() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener("click", outsidePop, true); } }
  function outsidePop(e) { if (popEl && !popEl.contains(e.target)) hidePop(); }
  function showPop(anchor, word) {
    hidePop();
    var s = sentOf(word), desc = descOf(word);
    popEl = document.createElement("div");
    popEl.className = "ok2-pop";
    popEl.innerHTML =
      '<h5>💬 ' + esc(word) + (s ? ' <span class="ok2-pop-sent ' + sentClass(s) + '">' + esc(sentLabel(s)) + '</span>' : '') + '</h5>' +
      '<div class="ok2-pop-body">' + (desc ? esc(desc) : 'Ingen förenklad beskrivning sparad för det här ordet ännu.') + '</div>';
    document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect();
    var top = r.bottom + 8, left = Math.min(r.left, window.innerWidth - popEl.offsetWidth - 12);
    if (top + popEl.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - popEl.offsetHeight - 8);
    popEl.style.top = top + "px"; popEl.style.left = Math.max(8, left) + "px";
    setTimeout(function () { document.addEventListener("click", outsidePop, true); }, 0);
    if (!desc && geminiKey()) {
      var body = popEl.querySelector(".ok2-pop-body");
      body.textContent = "Genererar en kort förklaring…";
      callGemini('Förklara det svenska ordet "' + word + '" mycket kort och enkelt på svenska i EN mening (max 15 ord). Svara bara med meningen.')
        .then(function (t) { if (popEl && body) body.textContent = t.trim() || "Kunde inte generera."; })
        .catch(function () { if (popEl && body) body.textContent = "Ingen beskrivning tillgänglig."; });
    }
  }

  /* Långtryck-hantering (touch + mus) på ord/synonymer överallt (även söklista) */
  function wordFromEl(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.term) return el.dataset.term;
    if (el.dataset && el.dataset.w) return el.dataset.w;
    return null;
  }
  var pressTimer = null, pressStartEl = null;
  var LONGPRESS_SEL = ".chip[data-term], .chip[data-w], .saved-open[data-w], .saved-syn[data-term]";
  function armPress(e) {
    var el = e.target.closest ? e.target.closest(LONGPRESS_SEL) : null;
    if (!el) return;
    pressStartEl = el;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(function () {
      var w = wordFromEl(el);
      if (w) { showPop(el, w); pressStartEl = null; }
    }, 480);
  }
  function cancelPress() { clearTimeout(pressTimer); }
  document.addEventListener("touchstart", armPress, { passive: true });
  document.addEventListener("touchend", cancelPress, { passive: true });
  document.addEventListener("touchmove", cancelPress, { passive: true });
  document.addEventListener("mousedown", armPress);
  document.addEventListener("mouseup", cancelPress);
  document.addEventListener("mouseleave", cancelPress);
  window.addEventListener("scroll", hidePop, { passive: true });

  /* =====================================================================
     1) FÄRGADE SYNONYMER (grön=positiv, röd=negativ) i resultat + sparade
     ===================================================================== */
  function colorSynonyms(root) {
    var chips = root.querySelectorAll(".chip-syn[data-term], .saved-syn[data-term]");
    chips.forEach(function (c) {
      if (c.dataset.ok2col) return;
      var s = sentOf(c.dataset.term);
      var cls = s === "positiv" ? "ok2-pos" : s === "negativ" ? "ok2-neg" : "ok2-neu";
      c.classList.add(cls);
      var dot = document.createElement("span");
      dot.className = "ok2-syn-dot " + sentClass(s);
      c.insertBefore(dot, c.firstChild);
      c.dataset.ok2col = "1";
    });
  }

  /* =====================================================================
     8) ÖVERSÄTT ordet + synonymer + idiom till engelska
     ===================================================================== */
  function tinyDict(w) {
    var D = { glad: "happy", ledsen: "sad", arg: "angry", trött: "tired", snabb: "fast", stor: "big", liten: "small", vacker: "beautiful", ful: "ugly", stark: "strong", svag: "weak", varm: "warm", kall: "cold", ny: "new", gammal: "old", bra: "good", dålig: "bad", rolig: "fun", tråkig: "boring", rädd: "afraid", modig: "brave" };
    return D[norm(w)] || null;
  }
  function buildTranslatePanel(card, word) {
    var d = ORDBOK()[norm(word)] || {};
    var old = card.querySelector(".ok2-trans-panel"); if (old) { old.remove(); return; }
    var panel = document.createElement("div");
    panel.className = "ok2-trans-panel";
    panel.innerHTML = '<h5>🌐 Engelska</h5><div class="ok2-tr-row">Översätter…</div>';
    card.appendChild(panel);
    var cacheKey = "ordkollen_tr_" + norm(word);
    var cached = lsGet(cacheKey, null);
    if (cached) { renderTrans(panel, word, cached); return; }
    if (geminiKey()) {
      var syns = (d.synonymer || []).join(", ");
      var idioms = (d.idiom || []).join("; ");
      var prompt = 'Översätt till engelska. Svara ENDAST med giltig JSON på formen {"word":"","synonyms":["",""],"idioms":["",""]}. ' +
        'Svenska ordet: "' + word + '". Synonymer: [' + syns + ']. Idiom: [' + idioms + ']. ' +
        'För idiom, ge den engelska motsvarigheten eller en enkel förklaring.';
      callGemini(prompt).then(function (t) {
        var obj = null; try { obj = JSON.parse(t.replace(/```json|```/g, "").trim()); } catch (e) {}
        if (!obj) { obj = { word: t.trim().split("\n")[0] }; }
        lsSet(cacheKey, obj); renderTrans(panel, word, obj);
      }).catch(function () { fallbackTrans(panel, word, d); });
    } else { fallbackTrans(panel, word, d); }
  }
  function fallbackTrans(panel, word, d) {
    var en = tinyDict(word);
    var obj = { word: en || null, synonyms: (d.synonymer || []).map(tinyDict).filter(Boolean), idioms: [] };
    obj._nokey = true;
    renderTrans(panel, word, obj);
  }
  function renderTrans(panel, word, obj) {
    var html = '<h5>🌐 Engelska</h5>';
    html += '<div class="ok2-tr-row"><b>Ord:</b> ' + esc(word) + ' → <b>' + esc(obj.word || "—") + '</b></div>';
    if (obj.synonyms && obj.synonyms.length) html += '<div class="ok2-tr-row"><b>Synonymer:</b> ' + esc(obj.synonyms.join(", ")) + '</div>';
    if (obj.idioms && obj.idioms.length) html += '<div class="ok2-tr-row"><b>Idiom:</b> ' + esc(obj.idioms.join(" · ")) + '</div>';
    if (obj._nokey) html += '<div class="ok2-tr-row" style="opacity:.7;font-size:.78rem;margin-top:6px">💡 Lägg in en Gemini-nyckel via ⚙️ för full översättning av synonymer och idiom.</div>';
    panel.innerHTML = html;
  }

  /* =====================================================================
     Dekorera RESULTATKORTET: 1 (färg) + 8 (översätt-knapp)
     ===================================================================== */
  function decorateResult() {
    var area = $("resultArea"); if (!area) return;
    colorSynonyms(area);
    var save = $("saveWordBtn");
    if (save && !save.dataset.ok2tr) {
      save.dataset.ok2tr = "1";
      var word = null;
      var h3 = area.querySelector("h3"); if (h3) word = h3.textContent.trim();
      if (word) {
        var btn = document.createElement("button");
        btn.className = "ok2-transbtn"; btn.type = "button";
        btn.innerHTML = "🌐 Engelska";
        btn.title = "Översätt ordet, synonymer och idiom till engelska";
        btn.addEventListener("click", function () { buildTranslatePanel(save.closest(".card"), word); });
        save.insertAdjacentElement("afterend", btn);
      }
    }
  }

  /* =====================================================================
     Dekorera SPARADE KORT: 1,4,5,10 + fetstil
     ===================================================================== */
  function checklistStore() { var u = sessionUser(); return "ordkollen_chk_" + (u || "anon"); }
  function getChecklist(w) { var all = lsGet(checklistStore(), {}); return all[norm(w)] || []; }
  function setChecklist(w, arr) { var all = lsGet(checklistStore(), {}); all[norm(w)] = arr; lsSet(checklistStore(), all); }
  function getColor(w) { var all = lsGet("ordkollen_wcolor", {}); return all[norm(w)] || null; }
  function setColor(w, c) { var all = lsGet("ordkollen_wcolor", {}); if (c) all[norm(w)] = c; else delete all[norm(w)]; lsSet("ordkollen_wcolor", all); }
  function getGenExpl(w) { var all = lsGet("ordkollen_genexpl", {}); return all[norm(w)] || ""; }
  function setGenExpl(w, t) { var all = lsGet("ordkollen_genexpl", {}); all[norm(w)] = t; lsSet("ordkollen_genexpl", all); }

  var SWATCHES = ["#ea4335", "#1a73e8", "#34a853", "#fbbc04", "#9334e6", "#00897b"];

  function decorateSaved() {
    var list = $("savedList"); if (!list) return;
    colorSynonyms(list);
    list.querySelectorAll(".saved-card").forEach(function (card) {
      var openBtn = card.querySelector(".saved-open");
      if (!openBtn) return;
      var word = openBtn.dataset.w || openBtn.textContent.trim();

      /* tillämpa sparad textfärg (4) */
      var col = getColor(word); if (col) openBtn.style.color = col;

      if (card.dataset.ok2 === "1") return;
      card.dataset.ok2 = "1";

      /* 5) bubbla med kort förklaring bredvid ordet */
      var bubble = document.createElement("button");
      bubble.type = "button"; bubble.className = "ok2-bubble"; bubble.textContent = "💬";
      bubble.title = "Kort förklaring";
      bubble.addEventListener("click", function (e) { e.stopPropagation(); showPop(bubble, word); });
      openBtn.insertAdjacentElement("afterend", bubble);

      var body = card.querySelector(".flex-1") || card;

      /* 10) cirkel som auto-genererar ny förklaring */
      var genWrap = document.createElement("div");
      genWrap.className = "ok2-genwrap";
      genWrap.innerHTML = '<button type="button" class="ok2-gencircle" title="Generera ny förklaring">↻</button><div class="ok2-genexpl"></div>';
      var genExplEl = genWrap.querySelector(".ok2-genexpl");
      var cachedGen = getGenExpl(word); if (cachedGen) genExplEl.textContent = "🧠 " + cachedGen;
      genWrap.querySelector(".ok2-gencircle").addEventListener("click", function () {
        var circle = this; circle.classList.add("spin");
        generateExplanation(word).then(function (t) {
          genExplEl.textContent = "🧠 " + t; setGenExpl(word, t); circle.classList.remove("spin");
        }).catch(function () { genExplEl.textContent = "Kunde inte generera just nu."; circle.classList.remove("spin"); });
      });
      body.appendChild(genWrap);

      /* 4) verktyg: färga ordet + checklista */
      var tools = document.createElement("div");
      tools.className = "ok2-tools";
      var swHtml = SWATCHES.map(function (c) { return '<span class="ok2-sw" data-c="' + c + '" style="background:' + c + '"></span>'; }).join("");
      tools.innerHTML =
        '<div class="ok2-row"><span class="ok2-label">🎨 Färga ordet:</span>' + swHtml +
        '<button type="button" class="ok2-mini danger ok2-clearcol">Sudda färg</button></div>' +
        '<div class="ok2-row"><span class="ok2-label">✅ Checklista</span></div>' +
        '<div class="ok2-chkadd"><input type="text" placeholder="Lägg till punkt…" /><button type="button" class="ok2-mini ok2-chkaddbtn">+ Lägg till</button></div>' +
        '<ul class="ok2-chklist"></ul>';
      body.appendChild(tools);

      tools.querySelectorAll(".ok2-sw").forEach(function (sw) {
        sw.addEventListener("click", function () { var c = sw.dataset.c; openBtn.style.color = c; setColor(word, c); toast("🎨 Färg satt"); });
      });
      tools.querySelector(".ok2-clearcol").addEventListener("click", function () { openBtn.style.color = ""; setColor(word, null); toast("Färg suddad"); });

      var listEl = tools.querySelector(".ok2-chklist");
      var input = tools.querySelector(".ok2-chkadd input");
      function renderChk() {
        var items = getChecklist(word);
        listEl.innerHTML = items.map(function (it, i) {
          return '<li class="ok2-chkitem' + (it.d ? " done" : "") + '" data-i="' + i + '">' +
            '<input type="checkbox"' + (it.d ? " checked" : "") + ' /><span>' + esc(it.t) + '</span>' +
            '<button type="button" class="ok2-chkdel" title="Ta bort">🗑️</button></li>';
        }).join("");
        listEl.querySelectorAll(".ok2-chkitem").forEach(function (li) {
          var i = +li.dataset.i;
          li.querySelector("input").addEventListener("change", function () { var a = getChecklist(word); a[i].d = this.checked; setChecklist(word, a); renderChk(); });
          li.querySelector(".ok2-chkdel").addEventListener("click", function () { var a = getChecklist(word); a.splice(i, 1); setChecklist(word, a); renderChk(); });
        });
      }
      function addItem() { var v = input.value.trim(); if (!v) return; var a = getChecklist(word); a.push({ t: v, d: false }); setChecklist(word, a); input.value = ""; renderChk(); }
      tools.querySelector(".ok2-chkaddbtn").addEventListener("click", addItem);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addItem(); } });
      renderChk();
    });
  }

  function generateExplanation(word) {
    var d = ORDBOK()[norm(word)] || {};
    if (geminiKey()) {
      return callGemini('Skriv en NY, enkel och kort förklaring (1–2 meningar, vardagligt språk) av det svenska ordet "' + word + '". Sammanfatta vad det betyder. Svara bara med förklaringen.')
        .then(function (t) { return t.trim() || fallbackExpl(word, d); });
    }
    return Promise.resolve(fallbackExpl(word, d));
  }
  function fallbackExpl(word, d) {
    var parts = [];
    if (d.beskrivning) parts.push(d.beskrivning);
    if (d.synonymer && d.synonymer.length) parts.push("Liknar: " + d.synonymer.slice(0, 3).join(", ") + ".");
    if (d.sentiment) parts.push(sentLabel(d.sentiment) + " ord.");
    return parts.length ? parts.join(" ") : ("Ordet \"" + word + "\" – lägg in en Gemini-nyckel via ⚙️ för en automatiskt genererad förklaring.");
  }

  /* =====================================================================
     7) FETSTIL på/av + 2) snabb-scroll + slut-meddelande i sparade
     ===================================================================== */
  function applyBold() { document.body.classList.toggle("ok2-bold", lsGet("ordkollen_bold", false) === true); }
  function ensureSavedToolbar() {
    var view = $("view-sparade"); if (!view) return;
    var header = view.querySelector(".flex.flex-wrap"); // knappraden i sparade-headern
    if (header && !header.dataset.ok2) {
      header.dataset.ok2 = "1";
      var boldBtn = document.createElement("button");
      boldBtn.className = "text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition";
      function paint() { boldBtn.textContent = (lsGet("ordkollen_bold", false) ? "𝗕 Fetstil: PÅ" : "B Fetstil: AV"); }
      paint();
      boldBtn.addEventListener("click", function () { lsSet("ordkollen_bold", !lsGet("ordkollen_bold", false)); applyBold(); paint(); });
      header.insertBefore(boldBtn, header.firstChild);
    }
    /* 2) slut-meddelande + snabb-scroll */
    var card = view.querySelector(".card");
    if (card && !card.dataset.ok2end) {
      card.dataset.ok2end = "1";
      var end = document.createElement("div");
      end.className = "ok2-end"; end.id = "ok2End";
      end.innerHTML = '<div class="ok2-end-line"></div>🎉 Du har nått slutet av dina sparade ord.';
      card.appendChild(end);
      var btn = document.createElement("button");
      btn.className = "ok2-scrollbtn"; btn.type = "button";
      btn.innerHTML = "⬇ Snabbt ner";
      btn.addEventListener("click", function () { end.scrollIntoView({ behavior: "smooth", block: "end" }); });
      card.appendChild(btn);
    }
    var end2 = $("ok2End"), btn2 = view.querySelector(".ok2-scrollbtn");
    var has = getSaved().length > 0;
    if (end2) end2.style.display = has ? "block" : "none";
    if (btn2) btn2.style.display = has ? "flex" : "none";
  }

  /* =====================================================================
     9) BYT NAMN på appen
     ===================================================================== */
  var DEFAULT_NAME = "Ordkollen";
  function currentName() { return lsGet("ordkollen_app_name", DEFAULT_NAME) || DEFAULT_NAME; }
  function applyName() {
    var name = currentName();
    // rubrik i webbläsarfliken
    try { document.title = document.title.replace(DEFAULT_NAME, name); } catch (e) {}
    // ersätt textnoder som exakt är standardnamnet (header + login)
    walkReplace(document.body, DEFAULT_NAME, name);
    walkReplace(document.body, lastApplied, name);
    lastApplied = name;
  }
  var lastApplied = DEFAULT_NAME;
  function walkReplace(root, from, to) {
    if (!from || from === to) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n, hits = [];
    while ((n = walker.nextNode())) { if (n.nodeValue && n.nodeValue.trim() === from) hits.push(n); }
    hits.forEach(function (t) { t.nodeValue = t.nodeValue.replace(from, to); });
  }
  function ensureRenameBtn() {
    var brand = null;
    document.querySelectorAll("header span.font-black").forEach(function (s) {
      if (!brand && s.textContent.trim() === currentName()) brand = s;
    });
    if (brand && !brand.dataset.ok2rn) {
      brand.dataset.ok2rn = "1";
      var pen = document.createElement("button");
      pen.className = "ok2-rename"; pen.type = "button"; pen.textContent = "✏️";
      pen.title = "Byt namn på appen";
      pen.addEventListener("click", function () {
        var v = prompt("Nytt namn på appen:", currentName());
        if (v && v.trim()) { var old = currentName(); lsSet("ordkollen_app_name", v.trim()); walkReplace(document.body, old, v.trim()); try { document.title = document.title.replace(old, v.trim()); } catch (e) {} toast("Namn ändrat till " + v.trim()); }
      });
      brand.insertAdjacentElement("afterend", pen);
    }
  }

  /* =====================================================================
     3) BAKÅTKNAPP + SVEP för att lämna video (YouTube-vyn)
     ===================================================================== */
  function goBackFromVideo() {
    var homeItem = document.querySelector('#view-underhallning .et-side-item[data-et-nav="home"]');
    if (homeItem) { homeItem.click(); return; }
    var back = document.querySelector('#view-underhallning [data-et-nav]');
    if (back) back.click();
  }
  function enhanceWatch() {
    var view = $("view-underhallning"); if (!view) return;
    var watch = view.querySelector(".et-watch");
    if (watch && !watch.dataset.ok2back) {
      watch.dataset.ok2back = "1";
      var stage = watch.querySelector(".et-stage") || watch;
      stage.style.position = stage.style.position || "relative";
      var back = document.createElement("button");
      back.className = "ok2-vidback"; back.type = "button";
      back.innerHTML = "← Tillbaka";
      back.addEventListener("click", function (e) { e.stopPropagation(); goBackFromVideo(); });
      stage.appendChild(back);
      var hint = document.createElement("div");
      hint.className = "ok2-swipe-hint"; hint.textContent = "Svep nedåt för att stänga";
      stage.appendChild(hint);
      // svep-gest (touch + mus)
      var sy = null, sx = null;
      function start(y, x) { sy = y; sx = x; hint.classList.add("show"); setTimeout(function () { hint.classList.remove("show"); }, 1400); }
      function move(y, x) {
        if (sy == null) return;
        var dy = y - sy, dx = x - sx;
        if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { sy = null; goBackFromVideo(); }
        if (dx > 120 && Math.abs(dx) > Math.abs(dy)) { sx = null; goBackFromVideo(); } // svep höger = tillbaka
      }
      stage.addEventListener("touchstart", function (e) { var t = e.touches[0]; start(t.clientY, t.clientX); }, { passive: true });
      stage.addEventListener("touchmove", function (e) { var t = e.touches[0]; move(t.clientY, t.clientX); }, { passive: true });
      stage.addEventListener("touchend", function () { sy = sx = null; }, { passive: true });
    }
  }
  // ESC / webbläsarens bakåt stänger också videon
  document.addEventListener("keydown", function (e) {
    var view = $("view-underhallning");
    if (e.key === "Escape" && view && !view.classList.contains("hidden") && view.querySelector(".et-watch")) goBackFromVideo();
  });

  /* =====================================================================
     11) RÖSTLÄGE (Gemini) + kamera + lägg till/ta bort ord
     ===================================================================== */
  var recog = null, listening = false;
  function speak(text) { try { var u = new SpeechSynthesisUtterance(text); u.lang = "sv-SE"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }

  function handleVoiceCommand(text, ansEl) {
    var t = text.trim(); var low = t.toLowerCase();
    var m;
    if ((m = low.match(/^(lägg till|spara)\s+(.+)/))) {
      var words = m[2].split(/,| och /).map(function (x) { return norm(x); }).filter(Boolean);
      var s = getSaved(); words.forEach(function (w) { if (!s.includes(w)) s.push(w); });
      setSaved(s); ansEl.textContent = "✅ Lade till: " + words.join(", "); speak("Lade till " + words.join(", ")); return;
    }
    if ((m = low.match(/^(ta bort|radera)\s+(.+)/))) {
      var w2 = norm(m[2]); setSaved(getSaved().filter(function (x) { return x !== w2; }));
      ansEl.textContent = "🗑️ Tog bort: " + w2; speak("Tog bort " + w2); return;
    }
    if ((m = low.match(/^(sök|slå upp|leta)\s+(.+)/))) {
      var q = m[2].trim(); var inp = $("searchInput"), sb = $("searchBtn");
      if (inp) { inp.value = q; if (sb) sb.click(); else { var ev = new KeyboardEvent("keydown", { key: "Enter" }); inp.dispatchEvent(ev); } }
      ansEl.textContent = "🔍 Söker: " + q; closeVoice(); return;
    }
    // annars: fråga Gemini
    if (geminiKey()) {
      ansEl.textContent = "🤖 Tänker…";
      callGemini('Du är en hjälpsam svensk språkassistent i appen ' + currentName() + '. Svara kort och enkelt på svenska. Fråga: ' + t)
        .then(function (a) { ansEl.textContent = a.trim(); speak(a.trim()); })
        .catch(function () { ansEl.textContent = "Kunde inte nå Gemini. Kontrollera nyckeln i ⚙️."; });
    } else {
      ansEl.textContent = "💡 Lägg in en Gemini-nyckel via ⚙️ för att prata fritt. Du kan ändå säga t.ex. \"lägg till lycklig\", \"ta bort glad\" eller \"sök hund\".";
    }
  }

  var voiceModal = null;
  function buildVoiceModal() {
    if (voiceModal) return voiceModal;
    voiceModal = document.createElement("div");
    voiceModal.className = "ok2-modal hidden";
    voiceModal.innerHTML =
      '<div class="ok2-modal-card">' +
        '<h3>🎤 Röstläge</h3>' +
        '<p class="ok2-sub">Prata så förstår appen dig (Gemini). Du kan ställa frågor eller styra dina ord med rösten.</p>' +
        '<video class="ok2-cam" playsinline muted></video>' +
        '<button type="button" class="ok2-mic" title="Tryck och prata">🎙️</button>' +
        '<div class="ok2-transcript" data-empty="Tryck på mikrofonen och börja prata…">Tryck på mikrofonen och börja prata…</div>' +
        '<div class="ok2-answer"></div>' +
        '<div class="ok2-modal-actions">' +
          '<button type="button" class="ok2-voicebtn ok2-camtoggle">📷 Kamera</button>' +
          '<button type="button" class="ok2-voicebtn ok2-close">Stäng</button>' +
        '</div>' +
        '<div class="ok2-hintline">Röstkommandon: <code>lägg till &lt;ord&gt;</code> · <code>ta bort &lt;ord&gt;</code> · <code>sök &lt;ord&gt;</code>. Allt annat besvaras av Gemini.</div>' +
      '</div>';
    document.body.appendChild(voiceModal);
    var mic = voiceModal.querySelector(".ok2-mic");
    var trans = voiceModal.querySelector(".ok2-transcript");
    var ans = voiceModal.querySelector(".ok2-answer");
    var cam = voiceModal.querySelector(".ok2-cam");
    var camBtn = voiceModal.querySelector(".ok2-camtoggle");
    var camStream = null;

    voiceModal.querySelector(".ok2-close").addEventListener("click", closeVoice);
    voiceModal.addEventListener("click", function (e) { if (e.target === voiceModal) closeVoice(); });

    camBtn.addEventListener("click", function () {
      if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; cam.classList.remove("show"); camBtn.textContent = "📷 Kamera"; return; }
      navigator.mediaDevices.getUserMedia({ video: true }).then(function (s) {
        camStream = s; cam.srcObject = s; cam.classList.add("show"); cam.play(); camBtn.textContent = "⏹ Stäng kamera";
      }).catch(function () { toast("Kunde inte öppna kameran."); });
    });
    voiceModal._stopCam = function () { if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; cam.classList.remove("show"); camBtn.textContent = "📷 Kamera"; } };

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    mic.addEventListener("click", function () {
      if (!SR) { trans.textContent = "Röstinmatning stöds inte i den här webbläsaren. Skriv istället – du kan fortfarande använda kamera och Gemini via ⚙️."; return; }
      if (listening) { try { recog.stop(); } catch (e) {} return; }
      recog = new SR(); recog.lang = "sv-SE"; recog.interimResults = true; recog.continuous = false;
      var finalText = "";
      recog.onstart = function () { listening = true; mic.classList.add("listening"); trans.textContent = "Lyssnar…"; };
      recog.onerror = function () { trans.textContent = "Mikrofonfel – kontrollera behörigheten."; };
      recog.onend = function () { listening = false; mic.classList.remove("listening"); if (finalText.trim()) handleVoiceCommand(finalText, ans); };
      recog.onresult = function (e) {
        var txt = ""; for (var i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
        finalText = txt; trans.textContent = txt;
      };
      try { recog.start(); } catch (e) {}
    });
    return voiceModal;
  }
  function openVoice() { buildVoiceModal().classList.remove("hidden"); }
  function closeVoice() { if (voiceModal) { voiceModal.classList.add("hidden"); if (voiceModal._stopCam) voiceModal._stopCam(); if (listening && recog) try { recog.stop(); } catch (e) {} } }

  function ensureVoiceBtn() {
    var view = $("view-sok"); if (!view) return;
    if (view.querySelector(".ok2-voicebtn.ok2-open")) return;
    var actions = view.querySelector(".flex.flex-wrap") || view.querySelector(".gem-hero") || view;
    var btn = document.createElement("button");
    btn.className = "ok2-voicebtn ok2-open"; btn.type = "button";
    btn.innerHTML = "🎤 Röstläge";
    btn.style.margin = "8px auto";
    btn.addEventListener("click", openVoice);
    actions.appendChild(btn);
  }

  /* =====================================================================
     OBSERVERS + INIT
     ===================================================================== */
  function decorateAll() {
    try { decorateResult(); } catch (e) {}
    try { decorateSaved(); } catch (e) {}
    try { ensureSavedToolbar(); } catch (e) {}
    try { ensureRenameBtn(); } catch (e) {}
    try { ensureVoiceBtn(); } catch (e) {}
    try { enhanceWatch(); } catch (e) {}
    try { applyBold(); } catch (e) {}
  }

  function observe(id) {
    var el = $(id); if (!el || el.dataset.ok2obs) return;
    if ("MutationObserver" in window) {
      new MutationObserver(function () { setTimeout(decorateAll, 0); }).observe(el, { childList: true, subtree: true });
      el.dataset.ok2obs = "1";
    }
  }

  function init() {
    applyName();
    decorateAll();
    ["resultArea", "savedList", "view-sparade", "view-sok", "view-underhallning"].forEach(observe);
    // Bevaka hela appView så nya vyer också dekoreras
    var app = $("appView");
    if (app && "MutationObserver" in window && !app.dataset.ok2obs) {
      new MutationObserver(function () { setTimeout(decorateAll, 30); ["resultArea", "savedList", "view-sparade", "view-sok", "view-underhallning"].forEach(observe); }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      app.dataset.ok2obs = "1";
    }
    setInterval(decorateAll, 1500); // säkerhetsnät
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
