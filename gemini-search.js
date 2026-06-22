/* =========================================================================
   Ordkollen – GEMINI-SÖKRUTA (beteende)
   • Sätter hälsningen "Hej {namn}, vad vill du slå upp?" med inloggningsnamnet.
   • Spelar regnbågs-shimmer en gång vid start och varje gång rutan fokuseras.
   • Visar skicka-pilen när det finns text.
   • "+"-knappen slår upp ett slumpord, mikrofonen startar röstsök (om stöd).
   Fristående lager – rör inte app.js. Kopplar bara via DOM/localStorage.
   ========================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  /* ---- Hämta inloggningsnamnet (samma som användaren loggade in med) ---- */
  function loginName() {
    // 1) whoami sätts av app.js efter inloggning ("👤 Namn")
    var who = $("whoami");
    if (who && who.textContent) {
      var t = who.textContent.replace(/^[^A-Za-zÅÄÖåäö0-9]+/, "").trim();
      if (t) return t;
    }
    // 2) Fallback: läs sessionen/användaren från localStorage
    try {
      var session = JSON.parse(localStorage.getItem("ordkollen_session"));
      if (session) {
        var users = JSON.parse(localStorage.getItem("ordkollen_users") || "{}");
        if (users[session] && users[session].name) return users[session].name;
        return String(session).split("@")[0];
      }
    } catch (e) {}
    return "";
  }

  function setGreeting() {
    var g = $("gemGreeting");
    if (!g) return;
    var name = loginName();
    if (name) {
      g.innerHTML = 'Hej <span class="gem-name"></span>, vad vill du slå upp?';
      g.querySelector(".gem-name").textContent = name;
    } else {
      g.textContent = "Vad vill du slå upp?";
    }
  }

  /* ---- Regnbågs-shimmer (spelas en gång, tas sedan bort) ---- */
  function shimmer() {
    var box = $("gemBox");
    if (!box) return;
    box.classList.remove("gem-shimmer");
    // tvinga reflow så animationen kan startas om
    void box.offsetWidth;
    box.classList.add("gem-shimmer");
  }

  function init() {
    var box = $("gemBox");
    var input = $("searchInput");
    if (!box || !input) { return; }

    setGreeting();

    // Visa skicka-pilen bara när det finns text
    function syncText() { box.classList.toggle("has-text", input.value.trim().length > 0); }
    input.addEventListener("input", syncText);
    syncText();

    // Shimmer vid fokus
    input.addEventListener("focus", shimmer);

    // "+" = överraska mig (slumpord) – återanvänd appens knapp om den finns
    var plus = $("gemPlus");
    if (plus) plus.addEventListener("click", function () {
      var s = $("surpriseBtn"); if (s) s.click(); else input.focus();
    });

    // Mikrofon = röstsök (Web Speech API om webbläsaren stöder det)
    var mic = $("gemMic");
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (mic) {
      if (!SR) { mic.style.display = "none"; }
      else mic.addEventListener("click", function () {
        try {
          var r = new SR(); r.lang = "sv-SE"; r.interimResults = false; r.maxAlternatives = 1;
          mic.classList.add("gem-listening");
          r.onresult = function (ev) {
            var txt = ev.results[0][0].transcript;
            input.value = txt; syncText();
            var btn = $("searchBtn"); if (btn) btn.click();
          };
          r.onend = function () { mic.classList.remove("gem-listening"); };
          r.start();
        } catch (e) {}
      });
    }

    // Spela shimmer en gång när Sök-vyn först visas
    setTimeout(shimmer, 400);
  }

  // Vänta tills appView är synlig (efter inloggning) och kör då init.
  function whenReady() {
    var app = $("appView");
    if (app && !app.classList.contains("hidden") && $("gemBox")) { init(); return; }
    setTimeout(whenReady, 300);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", whenReady);
  else whenReady();

  // Uppdatera hälsningen om man loggar in/byter konto medan sidan är öppen.
  var who = document.getElementById("whoami");
  if (who && "MutationObserver" in window) {
    new MutationObserver(setGreeting).observe(who, { childList: true, characterData: true, subtree: true });
  }
})();
