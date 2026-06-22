/* =========================================================================
   Ordkollen – UNDERHÅLLNING: MOBIL-LÄGE (telefon/surfplatta) – FRISTÅENDE LAGER
   ------------------------------------------------------------------------
   Gör ENBART YouTube-/Underhållnings-vyn till en riktig mobilapp-layout
   (som YouTube-appen på telefonen): alltid synlig sökruta, en kolumn med
   stora videokort, stora tryckytor och en fast bottenmeny.

   VIKTIGT – kräver att en RIKTIG telefon eller surfplatta upptäcks:
     • Det aktiveras via enhetsidentifiering (userAgent + pekskärm), INTE via
       fönsterbredd. En liten/ihopdragen laptop-ruta ändras därför ALDRIG.
     • iPhone, Android-telefon, iPad och Android-surfplatta upptäcks. Allt
       annat (laptop/stationär dator) lämnas helt orört.

   Rör INTE app.js eller entertainment.js – kopplar bara via DOM/CSS-klass.
   Allt går att stänga av genom att ta bort denna fil + entertainment-mobile.css.
   ========================================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- detektion
     Returnerar "phone", "tablet" eller null (= dator → ingen ändring).
     Vi tittar på userAgent OCH antalet pekpunkter. iPadOS 13+ låtsas vara en
     Mac, så den fångas separat via Macintosh + pekskärm.                     */
  function detectDevice() {
    var ua = navigator.userAgent || navigator.vendor || window.opera || "";
    var uaData = navigator.userAgentData || null;
    var touch = (navigator.maxTouchPoints || 0) > 1 ||
                ("ontouchstart" in window);

    // Modern hint (Chrome/Edge) – mest tillförlitlig när den finns.
    if (uaData && typeof uaData.mobile === "boolean") {
      if (uaData.mobile) return "phone";
      // mobile=false men ändå pekskärm + iPad/Android → surfplatta
      if (touch && /iPad|Android/i.test(ua)) return "tablet";
    }

    // iPhone / iPod  → telefon
    if (/iPhone|iPod/i.test(ua)) return "phone";

    // iPad (även iPadOS som maskerar sig som Mac)
    if (/iPad/i.test(ua)) return "tablet";
    if (/Macintosh/i.test(ua) && touch) return "tablet"; // iPadOS 13+

    // Android: "Mobile" i UA betyder telefon, annars surfplatta
    if (/Android/i.test(ua)) {
      return /Mobile/i.test(ua) ? "phone" : "tablet";
    }

    // Övriga mobila operativsystem → telefon
    if (/webOS|BlackBerry|IEMobile|Opera Mini|Windows Phone|Kindle|Silk|PlayBook|Tablet/i.test(ua)) {
      return /Tablet|Kindle|Silk|PlayBook/i.test(ua) ? "tablet" : "phone";
    }

    // Robust reserv: en enhet vars PRIMÄRA inmatning är pekskärm (ingen mus-
    // hover) är en telefon/surfplatta. Laptops/stationära (mus/styrplatta)
    // rapporterar "fine"/hover och fångas därför INTE här – exakt som önskat.
    try {
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      var noHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
      if (coarse && noHover) {
        // Klassa telefon vs surfplatta på enhetens minsta sida (CSS-px).
        var minSide = Math.min(screen.width || 0, screen.height || 0);
        return minSide && minSide >= 600 ? "tablet" : "phone";
      }
    } catch (e) {}

    // Ingen mobil enhet upptäckt → dator: ändra ingenting.
    return null;
  }

  var DEVICE = detectDevice();
  if (!DEVICE) return; // 🖥️ Laptop/dator: lämna allt exakt som det är.

  /* Sätt klasser på <html> så CSS-lagret kan slå till – och bara här. */
  var root = document.documentElement;
  root.classList.add("ok-mobileyt");                 // gemensam flagga
  root.classList.add(DEVICE === "tablet" ? "ok-tablet" : "ok-phone");

  /* ---------------------------------------------------------------- bottenmeny
     Bygger en fast YouTube-liknande bottenmeny och kopplar varje flik till
     appens BEFINTLIGA (dolda) sidomenyval, så ingen kärnlogik behöver röras. */
  var NAV = [
    { nav: "home",       label: "Hem",     icon: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>' },
    { nav: "trending",   label: "Trender", icon: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>' },
    { nav: "subs",       label: "Prenum.", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 8 6 4-6 4z"/>' },
    { nav: "library",    label: "Bibliotek", icon: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>' }
  ];

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
           'stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }

  function buildBottomNav(view) {
    if (view.querySelector(".etm-bottomnav")) return; // redan byggd
    var bar = document.createElement("nav");
    bar.className = "etm-bottomnav";
    bar.setAttribute("aria-label", "Underhållning – navigering");

    NAV.forEach(function (item, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "etm-tab" + (idx === 0 ? " active" : "");
      btn.dataset.etmNav = item.nav;
      btn.innerHTML = '<span class="etm-ic">' + svg(item.icon) + "</span>" +
                      '<span class="etm-lbl">' + item.label + "</span>";
      btn.addEventListener("click", function () {
        // Klicka motsvarande dolda sidomenyval → återanvänder appens egen logik.
        var target = view.querySelector('.et-side-item[data-et-nav="' + item.nav + '"]');
        if (target) target.click();
        setActive(item.nav);
        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
      });
      bar.appendChild(btn);
    });

    view.appendChild(bar);
  }

  function setActive(nav) {
    var view = document.getElementById("view-underhallning");
    if (!view) return;
    view.querySelectorAll(".etm-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.etmNav === nav);
    });
  }

  /* Håll bottenmenyn synkad om man navigerar via sökning/videoklick: spegla
     vilket sidomenyval entertainment.js markerar som "active".              */
  function watchActiveNav(view) {
    if (!("MutationObserver" in window)) return;
    var sidebar = view.querySelector(".et-sidebar");
    if (!sidebar) return;
    new MutationObserver(function () {
      var act = view.querySelector(".et-side-item.active[data-et-nav]");
      if (act) setActive(act.dataset.etNav);
    }).observe(sidebar, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  /* ---------------------------------------------------------------- sök-fokus
     På telefon ska sökrutan vara lätt att hitta. Vi ser till att den syns
     (CSS gör jobbet) och låter en ev. förstoringsglas-ikon fokusera fältet. */
  function wireSearch(view) {
    var input = view.querySelector("#etSearchInput");
    var icon = view.querySelector(".et-search .ic");
    if (icon && input) {
      icon.style.cursor = "pointer";
      icon.addEventListener("click", function () { input.focus(); });
    }
  }

  function enhance() {
    var view = document.getElementById("view-underhallning");
    if (!view) { setTimeout(enhance, 400); return; }
    buildBottomNav(view);
    watchActiveNav(view);
    wireSearch(view);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", enhance);
  else enhance();
})();
