/* =========================================================================
   Ordkollen – ADAPTIV NIVÅ & SPELIFIERING – FRISTÅENDE LAGER
   - Anpassar CEFR-nivån automatiskt utifrån hur det går (höj/sänk-förslag).
   - Gör sidan roligare: XP, rank, dagsstreak, combo + konfetti och medaljer.

   Andra moduler rapporterar resultat via globala funktioner:
     window.OK_recordResult(correct, levelOverride)   // correct = bool, levelOverride = valfri "B1" osv
   Rör INTE app.js / akademin.js internals – allt sker via localStorage + DOM.
   ========================================================================= */
(function () {
  "use strict";

  var LS = "ordkollen_adaptive";
  var LS_LEVEL = "ordkollen_ak_level";
  var LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
  var RECENT_KEEP = 6;        // hur många senaste resultat vi minns per nivå
  var UP_NEEDED = 5;          // antal rätt i rad (på nivån) för höjningsförslag
  var DOWN_WINDOW = 5;        // fönster för sänkningsförslag
  var DOWN_WRONG = 3;         // antal fel i fönstret för sänkningsförslag

  var RANKS = [
    { min: 0,    icon: "🌱", name: "Nyfiken nybörjare" },
    { min: 100,  icon: "📒", name: "Ordsamlare" },
    { min: 300,  icon: "🧭", name: "Ordutforskare" },
    { min: 650,  icon: "🎯", name: "Ordkännare" },
    { min: 1100, icon: "🏅", name: "Ordmästare" },
    { min: 2000, icon: "🎩", name: "Ordvirtuos" },
    { min: 3500, icon: "👑", name: "Ordkung" }
  ];

  var BADGES = [
    { id: "first",    icon: "✨", name: "Första rätt" },
    { id: "combo5",   icon: "🔥", name: "5 i rad" },
    { id: "combo10",  icon: "🚀", name: "10 i rad" },
    { id: "streak3",  icon: "📅", name: "3 dagar i rad" },
    { id: "streak7",  icon: "🗓️", name: "En hel vecka" },
    { id: "climber",  icon: "⛰️", name: "Klättrare (höjde nivå)" },
    { id: "century",  icon: "💯", name: "100 svar" },
    { id: "master",   icon: "🏆", name: "Nådde Ordmästare" }
  ];

  var PRAISE = [
    "Snyggt!", "Rätt!", "Bra jobbat!", "Precis!", "Toppen!", "Helt rätt!",
    "Vasst!", "Kanon!", "Skickligt!", "Där satt den!"
  ];

  /* ----------------------------- State ----------------------------- */
  function today() { return new Date().toLocaleDateString("sv-SE"); }
  function defState() {
    return {
      xp: 0, combo: 0, bestCombo: 0,
      dayStreak: 0, bestDayStreak: 0, lastDay: "",
      totalCorrect: 0, totalAnswered: 0,
      perLevel: {}, badges: {}, collapsed: false
    };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS) || "{}");
      var d = defState();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      return s;
    } catch (e) { return defState(); }
  }
  function save(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }
  function curLevel() { return localStorage.getItem(LS_LEVEL) || "B1"; }

  var state = load();

  /* ----------------------------- Rank/XP ----------------------------- */
  function rankFor(xp) {
    var r = RANKS[0], next = null;
    for (var i = 0; i < RANKS.length; i++) {
      if (xp >= RANKS[i].min) { r = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    return { rank: r, next: next };
  }

  /* ----------------------------- UI: HUD ----------------------------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function ensureHud() {
    if (document.getElementById("okHud")) return;
    if (!document.body) return;

    var hud = el("div", "okHud");
    hud.id = "okHud";
    hud.title = "Din framsteg – klicka för detaljer";
    document.body.appendChild(hud);
    hud.addEventListener("click", togglePanel);

    var panel = el("div", "hidden");
    panel.id = "okPanel";
    document.body.appendChild(panel);

    var tw = el("div");
    tw.id = "okToastWrap";
    document.body.appendChild(tw);

    if (state.collapsed) hud.classList.add("okhud-min");
    updateHud();
  }

  function updateHud() {
    var hud = document.getElementById("okHud");
    if (!hud) return;
    var ri = rankFor(state.xp);
    hud.innerHTML =
      '<span class="okhud-stat" title="Dagar i rad">🔥 ' + state.dayStreak + '</span>' +
      '<span class="okhud-sep"></span>' +
      '<span class="okhud-stat" title="Poäng">⭐ ' + state.xp + '</span>' +
      '<span class="okhud-sep okhud-full"></span>' +
      '<span class="okhud-rank okhud-full">' + ri.rank.icon + ' ' + ri.rank.name + '</span>';
    if (!document.getElementById("okPanel").classList.contains("hidden")) renderPanel();
  }

  function togglePanel() {
    var p = document.getElementById("okPanel");
    if (!p) return;
    if (p.classList.contains("hidden")) { renderPanel(); p.classList.remove("hidden"); }
    else p.classList.add("hidden");
  }

  function renderPanel() {
    var p = document.getElementById("okPanel");
    if (!p) return;
    var ri = rankFor(state.xp);
    var floor = ri.rank.min;
    var ceil = ri.next ? ri.next.min : ri.rank.min;
    var pct = ri.next ? Math.min(100, Math.round((state.xp - floor) / (ceil - floor) * 100)) : 100;
    var acc = state.totalAnswered ? Math.round(state.totalCorrect / state.totalAnswered * 100) : 0;

    var badgeHtml = BADGES.map(function (b) {
      var owned = !!state.badges[b.id];
      return '<span class="okp-badge' + (owned ? "" : " locked") + '" title="' + b.name + '">' +
        b.icon + " " + b.name + "</span>";
    }).join("");

    p.innerHTML =
      '<h4>🎮 Dina framsteg</h4>' +
      '<div class="okp-rank">' + ri.rank.icon + " " + ri.rank.name + '</div>' +
      '<div class="okp-bar"><div class="okp-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="okp-sub">' + (ri.next
        ? (ceil - state.xp) + " XP till " + ri.next.icon + " " + ri.next.name
        : "Högsta rangen uppnådd! 👑") + '</div>' +
      '<div class="okp-grid">' +
        '<div class="okp-cell"><b>🔥 ' + state.dayStreak + '</b><span>dagar i rad (rekord ' + state.bestDayStreak + ')</span></div>' +
        '<div class="okp-cell"><b>⚡ ' + state.bestCombo + '</b><span>bästa combo</span></div>' +
        '<div class="okp-cell"><b>' + acc + '%</b><span>rätt (' + state.totalCorrect + '/' + state.totalAnswered + ')</span></div>' +
        '<div class="okp-cell"><b>🎓 ' + curLevel() + '</b><span>aktuell nivå</span></div>' +
      '</div>' +
      '<div style="font-weight:700;margin-bottom:4px">Medaljer</div>' +
      '<div class="okp-badges">' + badgeHtml + '</div>';
  }

  /* ----------------------------- Toaster ----------------------------- */
  function toast(opts) {
    ensureHud();
    var tw = document.getElementById("okToastWrap");
    if (!tw) return;
    var t = el("div", "ok-toast" + (opts.kind ? " okt-" + opts.kind : ""));
    var html = '<span class="okt-emoji">' + (opts.emoji || "✨") + '</span><span>' + opts.text + '</span>';
    t.innerHTML = html;
    if (opts.actions && opts.actions.length) {
      var wrap = el("span", "okt-actions");
      opts.actions.forEach(function (a) {
        var btn = el("button", a.ghost ? "okt-ghost" : "");
        btn.textContent = a.label;
        btn.addEventListener("click", function () { remove(); if (a.onClick) a.onClick(); });
        wrap.appendChild(btn);
      });
      t.appendChild(wrap);
    }
    tw.appendChild(t);
    var to = setTimeout(remove, opts.actions ? 9000 : 2600);
    function remove() {
      clearTimeout(to);
      if (!t.parentNode) return;
      t.classList.add("okt-out");
      setTimeout(function () { if (t.parentNode) t.remove(); }, 320);
    }
  }

  function xpPop(amount) {
    var hud = document.getElementById("okHud");
    if (!hud) return;
    var r = hud.getBoundingClientRect();
    var pop = el("div", "ok-xp-pop", "+" + amount + " ⭐");
    pop.style.left = (r.left + 30) + "px";
    pop.style.top = (r.top - 6) + "px";
    document.body.appendChild(pop);
    setTimeout(function () { pop.remove(); }, 1000);
  }

  /* ----------------------------- Spel-logik ----------------------------- */
  function bumpDayStreak() {
    var t = today();
    if (state.lastDay === t) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yest = y.toLocaleDateString("sv-SE");
    if (state.lastDay === yest) state.dayStreak += 1;
    else state.dayStreak = 1;
    state.lastDay = t;
    if (state.dayStreak > state.bestDayStreak) state.bestDayStreak = state.dayStreak;
    if (state.dayStreak >= 3) earn("streak3");
    if (state.dayStreak >= 7) earn("streak7");
    if (state.dayStreak > 1) toast({ emoji: "🔥", kind: "good", text: state.dayStreak + " dagar i rad – fortsätt så!" });
  }

  function earn(id) {
    if (state.badges[id]) return;
    state.badges[id] = today();
    var b = null;
    for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) b = BADGES[i];
    if (b) {
      toast({ emoji: b.icon, kind: "good", text: "Ny medalj: <b>" + b.name + "</b>" });
      if (window.OK_fireConfetti) window.OK_fireConfetti();
    }
  }

  function addXp(n) {
    var prev = rankFor(state.xp).rank;
    state.xp += n;
    var now = rankFor(state.xp).rank;
    if (now.min > prev.min) {
      toast({ emoji: now.icon, kind: "good", text: "Ny rang: <b>" + now.name + "</b>!" });
      if (window.OK_fireConfetti) window.OK_fireConfetti();
      if (now.name === "Ordmästare") earn("master");
    }
  }

  function nextLevel(lv) { var i = LEVELS.indexOf(lv); return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null; }
  function prevLevel(lv) { var i = LEVELS.indexOf(lv); return i > 0 ? LEVELS[i - 1] : null; }

  function applyLevel(lv) {
    localStorage.setItem(LS_LEVEL, lv);
    // Driv Akademins egna nivåknappar om vyn finns, så dess interna state följer med.
    var btns = document.querySelectorAll("#akLevelPicker .ak-lvl");
    btns.forEach(function (b) { if (b.textContent.trim() === lv) b.click(); });
    window.dispatchEvent(new CustomEvent("ok:levelchange", { detail: lv }));
    state.perLevel[lv] = [];
    earn("climber");
    if (window.OK_fireConfetti) window.OK_fireConfetti();
    toast({ emoji: "🎓", kind: "good", text: "Nivå ändrad till <b>" + lv + "</b>." });
    save(state); updateHud();
  }

  function maybeSuggest(level) {
    var arr = state.perLevel[level] || [];
    // Höj: senaste UP_NEEDED är alla rätt
    if (arr.length >= UP_NEEDED) {
      var lastUp = arr.slice(-UP_NEEDED);
      if (lastUp.every(function (x) { return x; })) {
        var nl = nextLevel(level);
        if (nl) {
          state.perLevel[level] = []; save(state);
          toast({
            emoji: "📈", kind: "good",
            text: "Det här ser lätt ut! Vill du testa <b>" + nl + "</b>?",
            actions: [
              { label: "Höj till " + nl, onClick: function () { applyLevel(nl); } },
              { label: "Stanna", ghost: true }
            ]
          });
          return;
        }
      }
    }
    // Sänk: minst DOWN_WRONG fel i senaste DOWN_WINDOW
    if (arr.length >= DOWN_WINDOW) {
      var lastDown = arr.slice(-DOWN_WINDOW);
      var wrong = lastDown.filter(function (x) { return !x; }).length;
      if (wrong >= DOWN_WRONG) {
        var pl = prevLevel(level);
        if (pl) {
          state.perLevel[level] = []; save(state);
          toast({
            emoji: "🧩", kind: "warn",
            text: "Vill du öva lite mer på <b>" + pl + "</b> först? Det är helt okej.",
            actions: [
              { label: "Sänk till " + pl, onClick: function () { applyLevel(pl); } },
              { label: "Fortsätt här", ghost: true }
            ]
          });
        }
      }
    }
  }

  /* ----------------------------- Publikt API ----------------------------- */
  // correct: true/false. levelOverride: valfri sträng ("B1" osv).
  window.OK_recordResult = function (correct, levelOverride) {
    correct = !!correct;
    ensureHud();
    var level = levelOverride || curLevel();

    bumpDayStreak();
    state.totalAnswered += 1;
    if (correct) state.totalCorrect += 1;

    if (correct) {
      state.combo += 1;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      var gain = 10 + Math.min(20, (state.combo - 1) * 2);   // combo-bonus
      addXp(gain);
      xpPop(gain);
      if (window.OK_playSound) window.OK_playSound("pop");
      earn("first");
      if (state.combo === 3) toast({ emoji: "🔥", kind: "good", text: "3 i rad – " + pick(PRAISE) });
      if (state.combo === 5) { earn("combo5"); if (window.OK_fireConfetti) window.OK_fireConfetti(); }
      if (state.combo === 10) { earn("combo10"); if (window.OK_fireConfetti) window.OK_fireConfetti(); }
    } else {
      state.combo = 0;
      addXp(2); // tröstpoäng för att man försökte
    }

    if (state.totalAnswered >= 100) earn("century");

    // logga per nivå för adaptiviteten
    var arr = state.perLevel[level] || [];
    arr.push(correct);
    if (arr.length > RECENT_KEEP) arr = arr.slice(-RECENT_KEEP);
    state.perLevel[level] = arr;

    save(state);
    updateHud();
    maybeSuggest(level);
  };

  // Valfritt: rapportera en uppmätt CEFR-nivå (t.ex. från meningsgranskningen).
  window.OK_recordCEFR = function (detected) {
    // reserverat för framtida finjustering – sparar inget destruktivt nu.
    if (!detected) return;
  };

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ----------------------------- Start ----------------------------- */
  function init() { ensureHud(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
