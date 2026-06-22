/* =========================================================================
   Ordkollen – FLYTANDE VÄRLDSKLOCKA
   En dragbar glasklocka (analog + digital + datum + tidszon).
   Välj land i en kategorilista (per kontinent) → klockan byter tidszon
   och visar landets lokala tid, datum och tidszonsförkortning.

   • Visar RÄTT tid även om enhetens klocka är fel (hämtar verklig tid från
     nätet, latenskompenserat). Faller tillbaka på enhetens klocka offline.
   • Sekundvisaren TICKAR stadigt (svepar inte) – inget "flyt".
   • Klockan ligger STILLA där den placerats (kan dras, men rör sig inte själv).
   Fristående lager – kopplar bara via DOM/localStorage.
   ========================================================================= */
(function () {
  "use strict";
  const LS_ZONE = "ordkollen_clock_zone";
  const LS_MINI = "ordkollen_clock_mini";

  /* ---- Länder grupperade per kontinent (kategorilista) ---- */
  const GROUPS = [
    ["🌍 Europa", [
      ["se", "🇸🇪 Sverige",        "Europe/Stockholm", "sv-SE"],
      ["no", "🇳🇴 Norge",          "Europe/Oslo",      "nb-NO"],
      ["dk", "🇩🇰 Danmark",        "Europe/Copenhagen","da-DK"],
      ["fi", "🇫🇮 Finland",        "Europe/Helsinki",  "fi-FI"],
      ["is", "🇮🇸 Island",         "Atlantic/Reykjavik","is-IS"],
      ["gb", "🇬🇧 Storbritannien", "Europe/London",    "en-GB"],
      ["ie", "🇮🇪 Irland",         "Europe/Dublin",    "en-IE"],
      ["de", "🇩🇪 Tyskland",       "Europe/Berlin",    "de-DE"],
      ["nl", "🇳🇱 Nederländerna",  "Europe/Amsterdam", "nl-NL"],
      ["fr", "🇫🇷 Frankrike",      "Europe/Paris",     "fr-FR"],
      ["es", "🇪🇸 Spanien",        "Europe/Madrid",    "es-ES"],
      ["pt", "🇵🇹 Portugal",       "Europe/Lisbon",    "pt-PT"],
      ["it", "🇮🇹 Italien",        "Europe/Rome",      "it-IT"],
      ["ch", "🇨🇭 Schweiz",        "Europe/Zurich",    "de-CH"],
      ["pl", "🇵🇱 Polen",          "Europe/Warsaw",    "pl-PL"],
      ["gr", "🇬🇷 Grekland",       "Europe/Athens",    "el-GR"],
      ["tr", "🇹🇷 Turkiet",        "Europe/Istanbul",  "tr-TR"],
      ["ru", "🇷🇺 Ryssland (Moskva)","Europe/Moscow",  "ru-RU"],
    ]],
    ["🌎 Nord- & Centralamerika", [
      ["us-e", "🇺🇸 USA – New York",    "America/New_York",    "en-US"],
      ["us-c", "🇺🇸 USA – Chicago",     "America/Chicago",     "en-US"],
      ["us-w", "🇺🇸 USA – Los Angeles", "America/Los_Angeles", "en-US"],
      ["ca",   "🇨🇦 Kanada – Toronto",  "America/Toronto",     "en-CA"],
      ["mx",   "🇲🇽 Mexiko",            "America/Mexico_City", "es-MX"],
    ]],
    ["🌎 Sydamerika", [
      ["br", "🇧🇷 Brasilien",  "America/Sao_Paulo",               "pt-BR"],
      ["ar", "🇦🇷 Argentina",  "America/Argentina/Buenos_Aires",  "es-AR"],
      ["cl", "🇨🇱 Chile",      "America/Santiago",                "es-CL"],
      ["co", "🇨🇴 Colombia",   "America/Bogota",                  "es-CO"],
    ]],
    ["🌏 Asien", [
      ["jp", "🇯🇵 Japan",         "Asia/Tokyo",     "ja-JP"],
      ["cn", "🇨🇳 Kina",          "Asia/Shanghai",  "zh-CN"],
      ["kr", "🇰🇷 Sydkorea",      "Asia/Seoul",     "ko-KR"],
      ["in", "🇮🇳 Indien",        "Asia/Kolkata",   "hi-IN"],
      ["th", "🇹🇭 Thailand",      "Asia/Bangkok",   "th-TH"],
      ["sg", "🇸🇬 Singapore",     "Asia/Singapore", "en-SG"],
      ["ae", "🇦🇪 Förenade Arabemiraten", "Asia/Dubai", "ar-AE"],
      ["il", "🇮🇱 Israel",        "Asia/Jerusalem", "he-IL"],
    ]],
    ["🌍 Afrika", [
      ["za", "🇿🇦 Sydafrika", "Africa/Johannesburg", "en-ZA"],
      ["eg", "🇪🇬 Egypten",   "Africa/Cairo",        "ar-EG"],
      ["ng", "🇳🇬 Nigeria",   "Africa/Lagos",        "en-NG"],
      ["ke", "🇰🇪 Kenya",     "Africa/Nairobi",      "sw-KE"],
      ["ma", "🇲🇦 Marocko",   "Africa/Casablanca",   "fr-MA"],
    ]],
    ["🌏 Oceanien", [
      ["au-e", "🇦🇺 Australien – Sydney", "Australia/Sydney", "en-AU"],
      ["au-w", "🇦🇺 Australien – Perth",  "Australia/Perth",  "en-AU"],
      ["nz",   "🇳🇿 Nya Zeeland",         "Pacific/Auckland", "en-NZ"],
    ]],
  ];

  const BY_ID = {};
  GROUPS.forEach(([, list]) => list.forEach(c => { BY_ID[c[0]] = c; }));

  const load = (k, f) => { try { const v = localStorage.getItem(k); return v == null ? f : v; } catch { return f; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  let current = BY_ID[load(LS_ZONE, "se")] || BY_ID["se"];
  let root, faceHands, elDigital, elDate, elTz, elLoc, elSelect;
  let tickTimer = null;

  /* ---- Nätverkssynkad, latenskompenserad tid ----
     Klockan litar inte blint på enhetens klocka. Vi hämtar verklig tid och
     räknar ut en offset; tidszoner härleds lokalt via Intl. */
  let timeOffset = 0;   // ms att lägga till Date.now()
  let synced = false;
  function nowReal() { return new Date(Date.now() + timeOffset); }

  async function fetchServerNow() {
    // a) Samma origin – HTTP "Date"-header (+ ev. Age), cache-busting
    try {
      const base = location.href.split("#")[0];
      const url = base + (base.includes("?") ? "&" : "?") + "_ts=" + Date.now();
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      const d = res.headers.get("date");
      const age = parseInt(res.headers.get("age") || "0", 10) || 0;
      const t = d ? Date.parse(d) : NaN;
      if (!isNaN(t)) return t + age * 1000;
    } catch (e) {}
    // b) worldtimeapi (ISO med offset)
    try {
      const res = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", { cache: "no-store" });
      if (res.ok) { const j = await res.json(); const t = Date.parse(j.utc_datetime || j.datetime); if (!isNaN(t)) return t; }
    } catch (e) {}
    // c) timeapi.io (UTC utan suffix → lägg till Z)
    try {
      const res = await fetch("https://timeapi.io/api/time/current/zone?timeZone=UTC", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json(); let s = j.dateTime || "";
        if (s && !/[zZ]$|[+\-]\d\d:?\d\d$/.test(s)) s += "Z";
        const t = Date.parse(s); if (!isNaN(t)) return t;
      }
    } catch (e) {}
    return null;
  }

  async function syncTime() {
    const t0 = Date.now();
    const serverNow = await fetchServerNow();
    if (serverNow == null) return false;       // offline → behåll enhetsklockan
    const t1 = Date.now();
    const rtt = t1 - t0;
    const candidate = Math.round(serverNow + rtt / 2 - t1); // latenskompensation
    // Första synken sätts alltid; därefter bara om driften är märkbar (undvik "flyt")
    if (!synced || Math.abs(candidate - timeOffset) > 1500) timeOffset = candidate;
    synced = true;
    return true;
  }

  /* ---- Tidszons-hjälpare ---- */
  function partsInZone(tz) {
    const now = nowReal();
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour12: false,
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p = {};
    dtf.formatToParts(now).forEach(x => { p[x.type] = x.value; });
    return { h: +p.hour % 24, m: +p.minute, s: +p.second };
  }
  function tzAbbr(tz, locale) {
    try {
      const part = new Intl.DateTimeFormat(locale || "en-GB", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(nowReal()).find(x => x.type === "timeZoneName");
      return part ? part.value : "";
    } catch { return ""; }
  }
  function dateStr(tz, locale) {
    try {
      return new Intl.DateTimeFormat(locale || "sv-SE", {
        timeZone: tz, weekday: "long", day: "numeric", month: "long",
      }).format(nowReal());
    } catch {
      return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(nowReal());
    }
  }
  const pad = n => String(n).padStart(2, "0");

  /* ---- SVG-urtavla ---- */
  function buildFace() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "ok-clock-face");
    const dial = document.createElementNS(NS, "circle");
    dial.setAttribute("class", "dial");
    dial.setAttribute("cx", "50"); dial.setAttribute("cy", "50"); dial.setAttribute("r", "47");
    svg.appendChild(dial);
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const a = (i / 60) * 2 * Math.PI;
      const r1 = major ? 39 : 42, r2 = 46;
      const ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", (50 + r1 * Math.sin(a)).toFixed(2));
      ln.setAttribute("y1", (50 - r1 * Math.cos(a)).toFixed(2));
      ln.setAttribute("x2", (50 + r2 * Math.sin(a)).toFixed(2));
      ln.setAttribute("y2", (50 - r2 * Math.cos(a)).toFixed(2));
      ln.setAttribute("class", "tick" + (major ? " major" : ""));
      svg.appendChild(ln);
    }
    const mk = (cls, len) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", "50"); l.setAttribute("y1", "50");
      l.setAttribute("x2", "50"); l.setAttribute("y2", String(50 - len));
      l.setAttribute("class", cls);
      l.style.transformOrigin = "50px 50px";
      svg.appendChild(l); return l;
    };
    const hH = mk("hand-h", 26), hM = mk("hand-m", 36), hS = mk("hand-s", 40);
    const cap = document.createElementNS(NS, "circle");
    cap.setAttribute("class", "cap"); cap.setAttribute("cx", "50"); cap.setAttribute("cy", "50"); cap.setAttribute("r", "2.6");
    svg.appendChild(cap);
    return { svg, hH, hM, hS };
  }

  /* ---- Stadig tickning (en gång per sekund, snäpper till hel sekund) ---- */
  function renderTick() {
    const { h, m, s } = partsInZone(current[2]);
    faceHands.hS.style.transform = `rotate(${s * 6}deg)`;
    faceHands.hM.style.transform = `rotate(${(m + s / 60) * 6}deg)`;
    faceHands.hH.style.transform = `rotate(${((h % 12) + m / 60) * 30}deg)`;
    elDigital.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function scheduleTick() {
    renderTick();
    const ms = nowReal().getMilliseconds();
    tickTimer = setTimeout(scheduleTick, 1000 - ms); // linjera mot nästa hela sekund
  }

  function refreshMeta() {
    elLoc.innerHTML = `<span class="flag">${current[1].split(" ")[0]}</span><span class="name">${current[1].replace(/^\S+\s/, "")}</span>`;
    elDate.textContent = dateStr(current[2], current[3]);
    const abbr = tzAbbr(current[2], current[3]);
    elTz.textContent = abbr || current[2].split("/").pop().replace(/_/g, " ");
  }

  /* ---- (Position/drag borttaget – klockan ligger fast i flödet under sökrutan) ---- */

  function buildSelect() {
    const sel = document.createElement("select");
    sel.className = "ok-clock-select";
    sel.setAttribute("aria-label", "Välj land för klockan");
    GROUPS.forEach(([label, list]) => {
      const og = document.createElement("optgroup");
      og.label = label;
      list.forEach(c => {
        const o = document.createElement("option");
        o.value = c[0]; o.textContent = c[1];
        if (c[0] === current[0]) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.addEventListener("change", () => {
      current = BY_ID[sel.value] || current;
      save(LS_ZONE, current[0]);
      refreshMeta(); renderTick();
    });
    return sel;
  }

  function build() {
    if (document.getElementById("okClock")) return;
    root = document.createElement("div");
    root.id = "okClock";
    root.className = "ok-clock hidden";

    const top = document.createElement("div");
    top.className = "ok-clock-top";
    elLoc = document.createElement("div");
    elLoc.className = "ok-clock-loc";
    const minBtn = document.createElement("button");
    minBtn.className = "ok-clock-min"; minBtn.type = "button";
    minBtn.title = "Minimera / visa"; minBtn.setAttribute("aria-label", "Minimera klockan");
    minBtn.textContent = "–";
    top.appendChild(elLoc); top.appendChild(minBtn);

    faceHands = buildFace();
    elDigital = document.createElement("div"); elDigital.className = "ok-clock-digital"; elDigital.textContent = "––:––:––";
    elDate = document.createElement("div"); elDate.className = "ok-clock-date";
    elTz = document.createElement("div"); elTz.className = "ok-clock-tz";
    elSelect = buildSelect();

    root.appendChild(top);
    root.appendChild(faceHands.svg);
    root.appendChild(elDigital);
    root.appendChild(elDate);
    root.appendChild(elTz);
    root.appendChild(elSelect);

    // Förankra klockan FAST i flödet, direkt under sökrutan (inte flytande).
    // Ligger inuti #view-sok → försvinner automatiskt när man byter flik.
    const mountClock = () => {
      const input = document.getElementById("searchInput");
      const searchRow = input ? input.closest(".flex") : null;
      if (searchRow && searchRow.parentNode) {
        searchRow.parentNode.insertBefore(root, searchRow.nextSibling);
      } else {
        const sok = document.getElementById("view-sok");
        (sok || document.body).appendChild(root);
      }
    };
    mountClock();

    function setMini(on) {
      root.classList.toggle("mini", on);
      minBtn.textContent = on ? "+" : "–";
      save(LS_MINI, on ? "1" : "0");
    }
    minBtn.addEventListener("click", () => setMini(!root.classList.contains("mini")));
    if (load(LS_MINI, "0") === "1") setMini(true);

    // Ingen drag, ingen flytande positionering – klockan ligger helt fast i flödet.
    refreshMeta();
  }

  function show() { if (root) { root.classList.remove("hidden"); if (!tickTimer) scheduleTick(); } }
  function hide() { if (root) { root.classList.add("hidden"); if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; } } }

  function init() {
    build();
    syncTime().then(() => { if (root) { refreshMeta(); renderTick(); } });
    setInterval(() => syncTime().then(() => { if (root) { refreshMeta(); renderTick(); } }), 15 * 60 * 1000);
    const appView = document.getElementById("appView");
    const sokView = document.getElementById("view-sok");
    // Klockan ska bara synas (och ticka) på Sök-fliken – inte följa med till andra flikar.
    const onSok = () =>
      appView && !appView.classList.contains("hidden") &&
      sokView && !sokView.classList.contains("hidden");
    const syncVis = () => { onSok() ? show() : hide(); };
    if ("MutationObserver" in window) {
      const mo = new MutationObserver(syncVis);
      if (appView) mo.observe(appView, { attributes: true, attributeFilter: ["class"] });
      if (sokView) mo.observe(sokView, { attributes: true, attributeFilter: ["class"] });
    }
    syncVis();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
