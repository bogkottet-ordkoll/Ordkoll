/* =========================================================================
   Ordkollen – AI-FELSÖKARE (debug-guard)
   Fristående lager. Fångar VARJE runtime-fel och avbruten promise så att
   appen inte kraschar, loggar felet, och kan be Gemini förklara + föreslå
   en fix på svenska. Rör inte kärnlogiken – kopplar bara via window-events
   och localStorage.
   ========================================================================= */
(function () {
  "use strict";

  var LS_LOG   = "ordkollen_errlog";
  var LS_GKEY  = "ordkollen_gemini_key";
  var LS_GMODEL = "ordkollen_gemini_model";
  var MAX = 50; // behåll de senaste 50 felen

  /* ---------------- Lagring ---------------- */
  function load() { try { return JSON.parse(localStorage.getItem(LS_LOG) || "[]"); } catch (e) { return []; } }
  function store(list) { try { localStorage.setItem(LS_LOG, JSON.stringify(list.slice(-MAX))); } catch (e) {} }

  function logError(kind, message, stack, source) {
    var list = load();
    var last = list[list.length - 1];
    // Hoppa över exakta dubbletter i rad (t.ex. samma fel som upprepas)
    if (last && last.message === message && last.kind === kind) {
      last.count = (last.count || 1) + 1;
      last.time = Date.now();
    } else {
      list.push({
        kind: kind || "fel",
        message: String(message || "Okänt fel"),
        stack: String(stack || ""),
        source: String(source || ""),
        time: Date.now(),
        count: 1
      });
    }
    store(list);
    paintBadge();
  }

  /* ---------------- Globala fällor ---------------- */
  window.addEventListener("error", function (e) {
    // Resursfel (bild/script som inte laddar) har inget e.error
    if (e && e.error) {
      logError("fel", e.error.message || e.message, e.error.stack, (e.filename || "") + ":" + (e.lineno || ""));
    } else if (e && e.message) {
      logError("fel", e.message, "", (e.filename || "") + ":" + (e.lineno || ""));
    }
    // Vi sväljer inte felet helt (loggas redan i konsolen av webbläsaren),
    // men appen fortsätter köra eftersom vi inte kastar vidare.
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    var msg = (r && (r.message || r)) || "Avbruten promise utan orsak";
    logError("promise", msg, (r && r.stack) || "", "");
    // Förhindra att webbläsaren loggar den som ohanterad – appen kraschar inte.
    try { e.preventDefault(); } catch (x) {}
  });

  /* ---------------- Gemini-diagnos ---------------- */
  function getKey()   { return localStorage.getItem(LS_GKEY) || ""; }
  function getModel() { return localStorage.getItem(LS_GMODEL) || "gemini-3.1-flash-lite"; }

  async function askGemini(err) {
    var key = getKey();
    if (!key) return "⚠️ Ingen Gemini-nyckel sparad. Lägg in en via ⚙️ uppe till höger så kan jag förklara felet.";
    var model = getModel();
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      model + ":generateContent?key=" + encodeURIComponent(key);
    var prompt =
      "Du är en hjälpsam felsökare för en webbapp skriven i vanlig JavaScript (ingen build, körs i webbläsaren). " +
      "Förklara KORT och enkelt på svenska vad detta fel troligen betyder och ge ett konkret förslag på hur man fixar det. " +
      "Svara i max 4 meningar. Fel: \"" + err.message + "\"." +
      (err.stack ? ("\nStack:\n" + err.stack.slice(0, 800)) : "") +
      (err.source ? ("\nKälla: " + err.source) : "");
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (res.status === 429) return "⏸ Gemini-kvoten är slut (429). Byt modell i ⚙️ eller vänta en stund.";
    if (!res.ok) { var t = await res.text(); return "API-fel (" + res.status + "). " + t.slice(0, 160); }
    var j = await res.json();
    return (j && j.candidates && j.candidates[0] && j.candidates[0].content &&
      j.candidates[0].content.parts && j.candidates[0].content.parts[0] &&
      j.candidates[0].content.parts[0].text) || "(tomt svar)";
  }

  /* ---------------- UI ---------------- */
  function injectStyle() {
    if (document.getElementById("okDbgStyle")) return;
    var s = document.createElement("style");
    s.id = "okDbgStyle";
    s.textContent = [
      "#okDbgBtn{position:fixed;left:16px;bottom:16px;z-index:90;width:46px;height:46px;border-radius:50%;",
      "border:none;cursor:pointer;font-size:20px;background:rgba(32,33,37,.85);color:#fff;",
      "box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .15s}",
      "#okDbgBtn:hover{transform:scale(1.08)}",
      "#okDbgBadge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;",
      "background:#ea4335;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;line-height:18px}",
      "#okDbgPanel{position:fixed;left:16px;bottom:72px;z-index:91;width:min(380px,calc(100vw - 32px));max-height:60vh;",
      "overflow:auto;background:#fff;color:#202124;border:1px solid #dadce0;border-radius:14px;",
      "box-shadow:0 12px 40px rgba(0,0,0,.25);padding:14px;font:13px/1.45 system-ui,sans-serif}",
      ".dark #okDbgPanel{background:#202125;color:#e8eaed;border-color:#3c4043}",
      "#okDbgPanel.hidden{display:none}",
      "#okDbgPanel h4{margin:0 0 8px;font-size:14px;font-weight:700;display:flex;justify-content:space-between;align-items:center}",
      ".okDbgItem{border-top:1px solid #eceff1;padding:10px 0}",
      ".dark .okDbgItem{border-top-color:#3c4043}",
      ".okDbgItem .m{font-weight:600;color:#c5221f;word-break:break-word}",
      ".dark .okDbgItem .m{color:#f28b82}",
      ".okDbgItem .meta{color:#80868b;font-size:11px;margin-top:2px}",
      ".okDbgItem pre{white-space:pre-wrap;word-break:break-word;background:#f1f3f4;border-radius:8px;padding:6px;margin:6px 0 0;font-size:11px;max-height:120px;overflow:auto}",
      ".dark .okDbgItem pre{background:#303134}",
      ".okDbgAsk{margin-top:6px;padding:5px 10px;border-radius:8px;border:none;cursor:pointer;background:#1a73e8;color:#fff;font-size:12px;font-weight:600}",
      ".okDbgAsk:disabled{opacity:.6;cursor:default}",
      ".okDbgAns{margin-top:6px;background:#e8f0fe;border-radius:8px;padding:8px;font-size:12px;color:#174ea6}",
      ".dark .okDbgAns{background:#1f3a5f;color:#aecbfa}",
      "#okDbgClear{background:none;border:1px solid #dadce0;border-radius:8px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit}",
      ".dark #okDbgClear{border-color:#5f6368}",
      "#okDbgEmpty{color:#80868b;padding:8px 0}"
    ].join("");
    document.head.appendChild(s);
  }

  function fmtTime(t) {
    try { return new Date(t).toLocaleString("sv-SE"); } catch (e) { return ""; }
  }

  function paintBadge() {
    var b = document.getElementById("okDbgBadge");
    if (!b) return;
    var n = load().length;
    if (n > 0) { b.textContent = n > 99 ? "99+" : String(n); b.style.display = "flex"; }
    else { b.style.display = "none"; }
  }

  function renderPanel() {
    var panel = document.getElementById("okDbgPanel");
    if (!panel) return;
    var list = load().slice().reverse();
    var head =
      '<h4><span>🐞 Felsökare (' + list.length + ')</span>' +
      '<button id="okDbgClear">Rensa</button></h4>';
    if (!list.length) {
      panel.innerHTML = head + '<div id="okDbgEmpty">✓ Inga fel fångade. Allt rullar på.</div>';
    } else {
      panel.innerHTML = head + list.map(function (e, idx) {
        var rep = (e.count && e.count > 1) ? ' ×' + e.count : '';
        return '<div class="okDbgItem" data-i="' + idx + '">' +
          '<div class="m">' + esc(e.message) + rep + '</div>' +
          '<div class="meta">' + (e.kind === "promise" ? "Promise · " : "") +
          fmtTime(e.time) + (e.source ? (' · ' + esc(e.source)) : '') + '</div>' +
          (e.stack ? '<pre>' + esc(e.stack) + '</pre>' : '') +
          '<button class="okDbgAsk" data-i="' + idx + '">🤖 Fråga Gemini om felet</button>' +
          '<div class="okDbgAns hidden" data-ans="' + idx + '" style="display:none"></div>' +
        '</div>';
      }).join("");
    }
    // Bind
    var clr = document.getElementById("okDbgClear");
    if (clr) clr.onclick = function () { store([]); paintBadge(); renderPanel(); };
    var revList = list;
    panel.querySelectorAll(".okDbgAsk").forEach(function (btn) {
      btn.onclick = async function () {
        var i = +btn.getAttribute("data-i");
        var ansEl = panel.querySelector('[data-ans="' + i + '"]');
        btn.disabled = true; var orig = btn.textContent; btn.textContent = "🤖 Tänker…";
        try {
          var txt = await askGemini(revList[i]);
          if (ansEl) { ansEl.style.display = "block"; ansEl.classList.remove("hidden"); ansEl.textContent = txt; }
        } catch (err) {
          if (ansEl) { ansEl.style.display = "block"; ansEl.classList.remove("hidden"); ansEl.textContent = "⚠️ " + (err.message || err); }
        } finally { btn.disabled = false; btn.textContent = orig; }
      };
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function build() {
    injectStyle();
    if (document.getElementById("okDbgBtn")) return;
    var btn = document.createElement("button");
    btn.id = "okDbgBtn"; btn.title = "AI-felsökare"; btn.setAttribute("aria-label", "Öppna felsökaren");
    btn.innerHTML = '🐞<span id="okDbgBadge"></span>';
    var panel = document.createElement("div");
    panel.id = "okDbgPanel"; panel.className = "hidden";
    btn.onclick = function () {
      var hidden = panel.classList.toggle("hidden");
      if (!hidden) renderPanel();
    };
    document.addEventListener("click", function (e) {
      if (!panel.classList.contains("hidden") &&
          !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.classList.add("hidden");
      }
    });
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    paintBadge();
  }

  // Exponera ett litet API om andra lager vill logga själva.
  window.OK_logError = function (msg, stack, source) { logError("manuellt", msg, stack, source); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
