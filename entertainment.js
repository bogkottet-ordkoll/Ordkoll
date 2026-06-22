/* =========================================================================
   Ordkollen – Underhållning (Entertainment)
   A functional, themed YouTube-style video browser.
   • Real search + endless (infinite-scroll) popular feed via YouTube Data API v3
   • Inline player + a recommendations column on the watch page
   • "Your account" = the existing Ordkollen login. Watch Later / Saved / History
     persist per-user to Firebase (merge writes) with a localStorage fallback.
   • API key is supplied by each user in Settings (localStorage: ordkollen_yt_key),
     never committed. Same pattern as the Gemini key.
   Standalone layer – does not touch app.js core logic.
   ========================================================================= */
(function () {
  "use strict";

  var API = "https://www.googleapis.com/youtube/v3/";
  var REGION = "US";
  var ytKey = function () { try { return localStorage.getItem("ordkollen_yt_key") || ""; } catch (e) { return ""; } };
  // ---- Reklamfritt (Piped) – EXPERIMENT -----------------------------------
  // Spelar videon via en community-driven Piped-instans i en <video>-spelare,
  // helt utan annonser. Instanserna är gratis/öppna och kan vara långsamma
  // eller tillfälligt nere – därför "beta". Faller tillbaka mellan instanser.
  var ADFREE_LS = "ordkollen_yt_adfree";
  function isAdfree() { try { return localStorage.getItem(ADFREE_LS) === "1"; } catch (e) { return false; } }
  function setAdfree(v) { try { localStorage.setItem(ADFREE_LS, v ? "1" : "0"); } catch (e) {} }
  var PIPED_APIS = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.private.coffee",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi.reallyaweso.me"
  ];
  // Invidious-instans för Reklamfritt (FreeTube-stil: spela via instansens
  // lokala proxy så det funkar i webbläsaren). Kan ändras i localStorage.
  var INVIDIOUS_DEFAULT = "https://inv.thepixora.com";
  function invBase() { try { return (localStorage.getItem("ordkollen_invidious") || INVIDIOUS_DEFAULT).replace(/\/+$/, ""); } catch (e) { return INVIDIOUS_DEFAULT; } }
  var sessionUser = function () { try { return JSON.parse(localStorage.getItem("ordkollen_session")); } catch (e) { return null; } };

  // ---------------------------------------------------------------- library
  var DEFAULT_LIB = { watchLater: [], saved: [], liked: [], history: [] };
  var lib = JSON.parse(JSON.stringify(DEFAULT_LIB));

  function libKey() { return "ordkollen_yt_lib_" + (sessionUser() || "guest"); }
  function loadLib() {
    try { lib = Object.assign(JSON.parse(JSON.stringify(DEFAULT_LIB)), JSON.parse(localStorage.getItem(libKey())) || {}); }
    catch (e) { lib = JSON.parse(JSON.stringify(DEFAULT_LIB)); }
  }
  function saveLib() {
    try { localStorage.setItem(libKey(), JSON.stringify(lib)); } catch (e) {}
    // Cloud sync (merge so we never clobber the rest of the user's profile)
    try {
      if (window.firebase && firebase.auth && firebase.auth().currentUser) {
        firebase.firestore().collection("users").doc(firebase.auth().currentUser.uid)
          .set({ ytLibrary: lib }, { merge: true });
      }
    } catch (e) {}
  }
  function cloudLoadLib() {
    try {
      if (window.firebase && firebase.auth && firebase.auth().currentUser) {
        firebase.firestore().collection("users").doc(firebase.auth().currentUser.uid).get()
          .then(function (snap) {
            if (snap.exists && snap.data().ytLibrary) {
              lib = Object.assign(JSON.parse(JSON.stringify(DEFAULT_LIB)), snap.data().ytLibrary);
              try { localStorage.setItem(libKey(), JSON.stringify(lib)); } catch (e) {}
              if (currentRoute.name === "library" || ["watchlater", "saved", "liked", "history"].indexOf(currentRoute.name) >= 0) render();
            }
          }).catch(function () {});
      }
    } catch (e) {}
  }

  function inList(name, id) { return lib[name].some(function (v) { return v.id === id; }); }
  function toggle(name, video) {
    var i = lib[name].findIndex(function (v) { return v.id === video.id; });
    if (i >= 0) lib[name].splice(i, 1); else lib[name].unshift(video);
    saveLib();
  }
  function pushHistory(video) {
    lib.history = lib.history.filter(function (v) { return v.id !== video.id; });
    lib.history.unshift(video);
    if (lib.history.length > 200) lib.history.length = 200;
    saveLib();
  }

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "md";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    var u = [["år", 31536000], ["mån", 2592000], ["v", 604800], ["d", 86400], ["h", 3600], ["min", 60]];
    for (var i = 0; i < u.length; i++) { var v = Math.floor(s / u[i][1]); if (v >= 1) return v + " " + u[i][0] + " sedan"; }
    return "nyss";
  }
  function dur(pt) {
    if (!pt) return "";
    var m = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return "";
    var h = +m[1] || 0, mi = +m[2] || 0, se = +m[3] || 0;
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return h ? h + ":" + p(mi) + ":" + p(se) : mi + ":" + p(se);
  }

  // ---------------------------------------------------------------- API
  function api(path, params) {
    var key = ytKey();
    if (!key) return Promise.reject({ code: "NOKEY" });
    var qs = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(API + path + "?" + qs + "&key=" + encodeURIComponent(key))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }
  // Normalise either a search result or a videos.list item into one shape.
  function norm(it) {
    var id = (it.id && it.id.videoId) || it.id;
    var sn = it.snippet || {};
    var th = (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.high || sn.thumbnails.default)) || {};
    return {
      id: id, title: sn.title || "", channel: sn.channelTitle || "",
      thumb: th.url || ("https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"),
      published: sn.publishedAt || "",
      views: it.statistics ? it.statistics.viewCount : null,
      likes: it.statistics ? it.statistics.likeCount : null,
      duration: it.contentDetails ? dur(it.contentDetails.duration) : "",
      desc: sn.description || ""
    };
  }

  // ---------------------------------------------------------------- state
  var view, main, sentinel, io;
  var currentRoute = { name: "home" };
  var feed = { token: "", loading: false, done: false, mode: "home", q: "" };
  // Endless recommendations on the watch page (separate paginated feed).
  var reco = { token: "", loading: false, done: false, q: "", curId: "", mode: "search" };
  var recoIo = null;
  var subscribed = true;     // visual subscribe state
  var notifyOn = true;       // bell toggle state

  // ---------------------------------------------------------------- icons
  var IC = {
    eye:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    up:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>',
    person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m23 7-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
  };

  // ---------------------------------------------------------------- demo data
  // (StarTalk channel content removed on request – this is now a clean,
  //  generic video browser. The recommended feed comes from the live API.)

  // ---------------------------------------------------------------- render
  function card(v) {
    return '<a class="et-card" href="#" data-vid="' + esc(v.id) + '">' +
      '<div class="et-thumb"><img src="' + esc(v.thumb) + '" alt="" loading="lazy">' +
      (v.duration ? '<span class="et-dur">' + esc(v.duration) + '</span>' : "") + "</div>" +
      '<div class="et-card-title">' + esc(v.title) + "</div>" +
      '<div class="et-card-meta">' + esc(v.channel) + (v.views ? " · " + fmt(v.views) + " visningar" : "") +
      (v.published ? " · " + ago(v.published) : "") + "</div></a>";
  }
  function grid(title, videos) {
    return (title ? '<h2 class="et-section-h">' + esc(title) + "</h2>" : "") +
      '<div class="et-cards et-feed-grid">' + videos.map(card).join("") + "</div>";
  }

  function show(html) { main.innerHTML = html; wireCards(main); }
  function wireCards(root) {
    root.querySelectorAll(".et-card[data-vid]").forEach(function (c) {
      c.addEventListener("click", function (e) { e.preventDefault(); openWatch(c.dataset.vid); });
    });
  }

  function keyPromptHTML() {
    return '<div class="et-keyprompt">' +
      "<h2>Lägg till en YouTube-nyckel för att titta</h2>" +
      "<p>Sökning och videoflödet drivs av YouTube Data API. Klistra in en gratis API-nyckel " +
      "i Inställningar – den sparas bara lokalt i din webbläsare.</p>" +
      '<p><a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Skaffa en nyckel (Google Cloud → YouTube Data API v3) →</a></p>' +
      '<button class="et-subscribed" id="etOpenSettings">Öppna inställningar</button>' +
      "</div>";
  }

  // ---- routes
  function setActiveNav(name) {
    view.querySelectorAll(".et-side-item[data-et-nav]").forEach(function (a) {
      a.classList.toggle("active", a.dataset.etNav === name);
    });
  }

  // ---- (channel-specific demo cards removed with StarTalk) --------------

  function renderHome() {
    setActiveNav("home");
    feed.mode = "home";
    var hasKey = !!ytKey();
    var html =
      '<div class="et-banner-strip" role="img" aria-label="Underhållning"></div>' +
      '<div class="et-hero-sm">Rekommenderat för dig</div>' +
      (hasKey
        ? '<div class="et-cards et-feed-grid" id="etFeedGrid"></div>' +
          '<div class="et-loader hidden" id="etLoader">Laddar…</div>'
        : '<div class="et-livehint">📺 Vill du se riktiga, aktuella videor här? ' +
          '<a id="etAddKey">Lägg till en gratis YouTube-nyckel</a> så fylls flödet med ' +
          'oändliga rekommendationer – precis som på YouTube.</div>');

    main.innerHTML = html;
    wireHome();
    if (hasKey) { feed.token = ""; feed.done = false; feed.loading = false; loadMore(true); }
  }

  function wireHome() {
    var addKey = main.querySelector("#etAddKey");
    if (addKey) addKey.addEventListener("click", function () {
      var s = document.getElementById("settingsBtn"); if (s) s.click();
      var yt = document.getElementById("ytKey"); if (yt) setTimeout(function () { yt.focus(); }, 200);
    });
  }

  function render() {
    if (currentRoute.name === "watch") { renderWatch(currentRoute.id); return; }
    if (["watchlater", "saved", "liked", "history", "library"].indexOf(currentRoute.name) >= 0) { renderLibrary(currentRoute.name); return; }
    if (feed.mode === "search") { renderFeed(); return; }
    renderHome();
  }

  function renderLibrary(name) {
    setActiveNav(name === "library" ? "library" : name);
    var map = { watchlater: ["watchLater", "Watch Later"], saved: ["saved", "Sparade"], liked: ["liked", "Gillade"], history: ["history", "Historik"] };
    if (name === "library") {
      var html = "";
      ["watchLater", "history", "liked", "saved"].forEach(function (k) {
        var titles = { watchLater: "Watch Later", history: "Historik", liked: "Gillade", saved: "Sparade" };
        if (lib[k].length) html += grid(titles[k], lib[k].slice(0, 10));
      });
      show('<div class="et-hero-sm">Ditt bibliotek</div>' + (html || '<p class="et-empty">Tomt än. Titta på något så dyker det upp här.</p>'));
      return;
    }
    var pair = map[name], list = lib[pair[0]];
    show('<div class="et-hero-sm">' + pair[1] + "</div>" +
      (list.length ? grid("", list) : '<p class="et-empty">Inget här än.</p>'));
  }

  function renderFeed() {
    setActiveNav(feed.mode === "search" ? "" : "home");
    show('<div class="et-banner-strip" role="img" aria-label="Rymd"></div>' +
      '<div class="et-hero-sm">' + (feed.mode === "search" ? 'Resultat för "' + esc(feed.q) + '"' : "Rekommenderat för dig") + "</div>" +
      '<div class="et-cards et-feed-grid" id="etFeedGrid"></div>' +
      '<div class="et-loader hidden" id="etLoader">Laddar…</div>');
    feed.token = ""; feed.done = false; feed.loading = false;
    loadMore(true);
  }

  function loadMore(first) {
    if (feed.loading || feed.done) return;
    var gridEl = main.querySelector("#etFeedGrid"); if (!gridEl) return;
    var loader = main.querySelector("#etLoader");
    feed.loading = true; if (loader) loader.classList.remove("hidden");

    var p, mapper;
    if (feed.mode === "search") {
      p = api("search", { part: "snippet", type: "video", q: feed.q, maxResults: 24, pageToken: feed.token });
      mapper = function (j) { return enrich(j.items.map(function (i) { return i.id.videoId; })).then(function (vs) { return { items: vs, next: j.nextPageToken }; }); };
    } else {
      p = api("videos", { part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode: REGION, maxResults: 24, pageToken: feed.token });
      mapper = function (j) { return Promise.resolve({ items: j.items.map(norm), next: j.nextPageToken }); };
    }
    p.then(mapper).then(function (res) {
      gridEl.insertAdjacentHTML("beforeend", res.items.map(card).join(""));
      wireCards(gridEl);
      feed.token = res.next || ""; feed.done = !res.next; feed.loading = false;
      if (loader) loader.classList.toggle("hidden", true);
      // Endless feed: if the page still isn't tall enough to scroll, keep
      // pulling the next page automatically so results never feel "few".
      if (!feed.done && document.documentElement.scrollHeight <= window.innerHeight + 600) {
        setTimeout(function () { loadMore(false); }, 120);
      }
    }).catch(function (err) { feed.loading = false; handleErr(err); });
  }

  // fetch statistics+duration for a list of ids (search.list lacks them)
  function enrich(ids) {
    ids = ids.filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    return api("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") })
      .then(function (j) { return j.items.map(norm); });
  }

  // ---- Reklamfritt: spela via Invidious (inv.thepixora.com) först, annars Piped --
  // Sätter src/HLS på <video>-spelaren. Returnerar ett promise.
  function attachStream(videoEl, obj) {
    var hls = obj.hls;
    if (hls && videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = hls;                                   // Safari/iOS: HLS direkt
    } else if (hls && window.Hls && window.Hls.isSupported()) {
      try { if (videoEl._hls) videoEl._hls.destroy(); } catch (e) {}
      var h = new window.Hls({ maxBufferLength: 30 });
      h.loadSource(hls); h.attachMedia(videoEl); videoEl._hls = h;
    } else if (obj.src) {
      videoEl.src = obj.src;
    } else {
      throw new Error("ingen spelbar ström");
    }
    videoEl.play().catch(function () {});
  }

  // Invidious lokal-API: hämta video, bygg en instans-proxad ström (local=true)
  // så att den spelas direkt i webbläsaren utan annonser.
  function invidiousStream(id) {
    var base = invBase();
    return fetch(base + "/api/v1/videos/" + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error("Invidious " + r.status); return r.json(); })
      .then(function (j) {
        if (j && j.hlsUrl) return { hls: j.hlsUrl };          // livesändningar
        var fs = (j && j.formatStreams) || [];                // muxade (ljud+bild)
        // föredra 720p (itag 22), annars 360p (itag 18), annars första
        var pick = fs.filter(function (s) { return String(s.itag) === "22"; })[0]
                || fs.filter(function (s) { return String(s.itag) === "18"; })[0]
                || fs[0];
        if (!pick) throw new Error("inga muxade strömmar");
        // local=true => instansen proxar bytes (CORS + rätt IP) = spelas i browsern
        return { src: base + "/latest_version?id=" + encodeURIComponent(id) +
                       "&itag=" + encodeURIComponent(pick.itag) + "&local=true" };
      });
  }

  // Piped som reserv (om Invidious-instansen är nere)
  function pipedStreams(id) {
    var i = 0;
    function tryNext() {
      if (i >= PIPED_APIS.length) return Promise.reject(new Error("alla Piped-instanser svarar inte"));
      var b = PIPED_APIS[i++];
      return fetch(b + "/streams/" + encodeURIComponent(id))
        .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
        .then(function (j) {
          if (!j || (!j.hls && !(j.videoStreams && j.videoStreams.length))) throw new Error("inga strömmar");
          if (j.hls) return { hls: j.hls };
          var mux = (j.videoStreams || []).filter(function (s) { return s && !s.videoOnly && s.url; });
          if (!mux.length) throw new Error("ingen muxad ström");
          return { src: mux[0].url };
        })
        .catch(function () { return tryNext(); });
    }
    return tryNext();
  }

  function loadAdfree(id, videoEl) {
    if (!videoEl) return;
    var stage = (videoEl.closest && videoEl.closest(".et-stage")) || videoEl.parentNode;
    function note(msg, err) {
      if (!stage) return;
      var old = stage.querySelector(".et-adfree-note"); if (old) old.remove();
      if (msg === null) return;
      var d = document.createElement("div");
      d.className = "et-adfree-note" + (err ? " err" : "");
      d.textContent = msg; stage.appendChild(d);
    }
    note("Reklamfritt: spelar via Invidious (" + invBase().replace(/^https?:\/\//, "") + ")…");
    invidiousStream(id)
      .then(function (obj) { attachStream(videoEl, obj); note(null); })
      .catch(function () {
        // Reserv: Piped
        note("Invidious svarade inte – provar Piped…");
        return pipedStreams(id).then(function (obj) { attachStream(videoEl, obj); note(null); });
      })
      .catch(function (err) {
        note("Reklamfritt kunde inte spela just nu (" + ((err && err.message) || "fel") +
             "). Stäng av Reklamfritt för den vanliga spelaren.", true);
      });
  }

  function renderWatch(id) {
    setActiveNav("");
    show('<div class="et-loader">Laddar video…</div>');
    api("videos", { part: "snippet,statistics,contentDetails", id: id }).then(function (j) {
      var v = j.items && j.items[0] ? norm(j.items[0]) : { id: id, title: "", channel: "", views: 0, likes: 0, desc: "", published: "" };
      pushHistory(v);
      var wl = inList("watchLater", id), sv = inList("saved", id), lk = inList("liked", id);
      show(
        '<div class="et-watch">' +
          '<div class="et-watch-main">' +
            '<div class="et-stage">' +
              '<div class="et-player">' + (isAdfree()
                ? '<video id="etPlayer" class="et-video" controls autoplay playsinline></video>'
                : '<iframe id="etPlayer" src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?autoplay=1&rel=0&enablejsapi=1" title="' + esc(v.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>') + '</div>' +
            '</div>' +
            '<h1 class="et-watch-title">' + esc(v.title) + "</h1>" +
            '<div class="et-watch-bar">' +
              '<div class="et-watch-meta"><b>' + esc(v.channel) + "</b><span>" + (v.views ? fmt(v.views) + " visningar" : "") + (v.published ? " · " + ago(v.published) : "") + "</span></div>" +
              '<div class="et-watch-actions">' +
                '<button class="et-act et-adfree-btn' + (isAdfree() ? " on" : "") + '" id="etAdfreeBtn" title="Reklamfritt (beta): spelar via en Piped-instans, utan annonser. Instanser kan vara långsamma eller tillfälligt nere."><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16"/><path d="M2 12s3.5-7 10-7c2.1 0 3.9.7 5.4 1.6M21.8 12.2S20.8 14 19 15.6"/><path d="M9.9 5.3A3 3 0 0 1 15 12"/></svg> <span class="et-adfree-lbl">' + (isAdfree() ? "Reklamfritt på" : "Reklamfritt") + '</span></button>' +
                '<button class="et-act et-mix-btn" id="etMixBtn" data-mix="0" title="Spela YouTube-Mix (oändlig auto-spellista)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg> <span class="et-mix-lbl">Mix</span></button>' +
                '<button class="et-act et-hd-btn" id="etHdBtn" title="AI HD – skarpare bild med ett lätt GPU-filter (belastar inte enheten)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3.1.9 4.9L12 14.8 8.1 17l.9-4.9L5.5 9l4.6-1.4z"/></svg> <span class="et-hd-lbl">AI HD</span></button>' +
                '<button class="et-act et-aa-btn" id="etAaBtn" title="Kantutjämning (anti-aliasing 1–16x) – mjukare kanter, helt GPU-lätt (ingen lagg/överhettning)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 20 4"/><path d="M4 14h6"/><path d="M14 4h6v6"/></svg> <span class="et-aa-lbl">AA 16x</span></button>' +
                '<button class="et-act' + (lk ? " on" : "") + '" data-act="liked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg> ' + (v.likes ? fmt(v.likes) : "Gilla") + "</button>" +
                '<button class="et-act' + (wl ? " on" : "") + '" data-act="watchLater"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> ' + (wl ? "Sparad" : "Watch Later") + "</button>" +
                '<button class="et-act' + (sv ? " on" : "") + '" data-act="saved"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> ' + (sv ? "Sparad" : "Spara") + "</button>" +
                '<a class="et-act" href="https://www.youtube.com/watch?v=' + esc(id) + '" target="_blank" rel="noopener">Öppna på YouTube</a>' +
              "</div>" +
            "</div>" +
            '<div class="et-aa-panel" id="etAaPanel" hidden><span class="et-aa-cap">Kantutjämning (AA)</span><input type="range" id="etAaRange" min="1" max="16" step="1" value="16"><output class="et-aa-val" id="etAaVal">16x</output><button type="button" class="et-aa-off" id="etAaToggle">Av</button></div>' +
            '<div id="etAiOverview" class="et-ai"></div>' +
            '<div class="et-watch-desc">' + esc(v.desc).replace(/\n/g, "<br>") + "</div>" +
          "</div>" +
          '<aside class="et-reco"><h3>Rekommenderat</h3><div id="etReco"></div>' +
            '<div class="et-loader hidden" id="etRecoLoader">Laddar…</div>' +
            '<div class="et-sentinel" id="etRecoSentinel"></div></aside>' +
        "</div>"
      );
      // Reklamfritt (Piped) – växla spelarläge / starta uppspelning
      var adfreeBtn = main.querySelector("#etAdfreeBtn");
      if (adfreeBtn) adfreeBtn.addEventListener("click", function () {
        setAdfree(!isAdfree());
        renderWatch(id);   // byt spelarläge (spelaren måste laddas om)
      });
      if (isAdfree()) {
        var adfreeVideo = main.querySelector("#etPlayer");
        if (adfreeVideo && adfreeVideo.tagName === "VIDEO") loadAdfree(id, adfreeVideo);
      }
      // wire action buttons
      main.querySelectorAll(".et-act[data-act]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          var act = b.dataset.act;
          toggle(act, v);
          var on = inList(act, id);
          b.classList.toggle("on", on);
          var label = act === "watchLater" ? (on ? "Sparad" : "Watch Later")
                    : act === "saved"      ? (on ? "Sparad" : "Spara")
                    : (v.likes ? fmt(v.likes) : "Gilla");
          var svg = b.querySelector("svg");
          b.innerHTML = (svg ? svg.outerHTML : "") + " " + label;
        });
      });
      // Mix-knapp: växlar spelaren till YouTubes auto-genererade Mix (radio).
      // YouTube bygger en oändlig "Mix" från video-id via spellista RD<id>.
      // Detta är den riktiga "Mixen YouTube gör åt dig" och funkar i embed.
      var mixBtn = main.querySelector("#etMixBtn");
      if (mixBtn) mixBtn.addEventListener("click", function () {
        var iframe = main.querySelector("#etPlayer"); if (!iframe || iframe.tagName !== "IFRAME") return;
        var on = mixBtn.dataset.mix === "1";
        var lbl = mixBtn.querySelector(".et-mix-lbl");
        if (!on) {
          // Bygg en RIKTIG, embed-bar Mix av rekommendationerna. YouTubes egna
          // RD-mixar går INTE att bädda in ("This video is unavailable"), men
          // en spellista av vanliga video-id:n (playlist=...) spelas oändligt.
          var ids = [];
          main.querySelectorAll("#etReco .et-card[data-vid]").forEach(function (c) {
            var vid = c.dataset.vid;
            if (vid && vid !== id && ids.indexOf(vid) < 0) ids.push(vid);
          });
          ids = ids.slice(0, 40);
          var hd = main.querySelector("#etPlayer") && /et-hd/.test((main.querySelector(".et-player")||{}).className||"");
          if (ids.length) {
            iframe.src = "https://www.youtube-nocookie.com/embed/" + esc(id) +
              "?autoplay=1&rel=0&enablejsapi=1&playlist=" + ids.map(esc).join(",");
          } else {
            // Inga rekommendationer laddade än → loopa nuvarande video som reserv.
            iframe.src = "https://www.youtube-nocookie.com/embed/" + esc(id) +
              "?autoplay=1&rel=0&enablejsapi=1&loop=1&playlist=" + esc(id);
          }
          mixBtn.dataset.mix = "1"; mixBtn.classList.add("on");
          if (lbl) lbl.textContent = "Mix på";
        } else {
          iframe.src = "https://www.youtube-nocookie.com/embed/" + esc(id) + "?autoplay=1&rel=0&enablejsapi=1";
          mixBtn.dataset.mix = "0"; mixBtn.classList.remove("on");
          if (lbl) lbl.textContent = "Mix";
        }
      });

      // AI HD: lätt GPU-skärpa + klarhet på spelaren (ingen tung bearbetning,
      // så den belastar inte laptop/telefon). Valet sparas lokalt.
      var hdBtn = main.querySelector("#etHdBtn");
      var playerBox = main.querySelector(".et-player");
      function applyHd(on) {
        if (playerBox) playerBox.classList.toggle("et-hd", on);
        if (hdBtn) {
          hdBtn.classList.toggle("on", on);
          var l = hdBtn.querySelector(".et-hd-lbl"); if (l) l.textContent = on ? "AI HD på" : "AI HD";
        }
        try { localStorage.setItem("ordkollen_yt_hd", on ? "1" : "0"); } catch (e) {}
      }
      var hdSaved = false; try { hdSaved = localStorage.getItem("ordkollen_yt_hd") === "1"; } catch (e) {}
      applyHd(hdSaved);
      if (hdBtn) hdBtn.addEventListener("click", function () {
        applyHd(!(playerBox && playerBox.classList.contains("et-hd")));
      });

      // ---- Kantutjämning (anti-aliasing 1–16x) – ENBART GPU-lätta filter ----
      // Mjukar upp "trappstegs"-kanter (FXAA-känsla). Allt komponeras på GPU
      // (blur + lätt kontrast) → ingen pixel-återläsning → ingen lagg/överhettning,
      // ens på en budget-laptop. Nivå och på/av sparas lokalt (som en inställning).
      var aaBtn = main.querySelector("#etAaBtn");
      var aaPanel = main.querySelector("#etAaPanel");
      var aaRange = main.querySelector("#etAaRange");
      var aaVal = main.querySelector("#etAaVal");
      var aaToggle = main.querySelector("#etAaToggle");
      function aaRead() {
        var lv = 16, on = false;
        try { lv = parseInt(localStorage.getItem("ordkollen_yt_aa") || "16", 10) || 16; } catch (e) {}
        try { on = localStorage.getItem("ordkollen_yt_aa_on") === "1"; } catch (e) {}
        return { lv: Math.max(1, Math.min(16, lv)), on: on };
      }
      function applyAa(lv, on) {
        lv = Math.max(1, Math.min(16, lv | 0));
        // 1 → knappt märkbart, 16 → tydlig kantutjämning (max ~0.6px mjukhet).
        var soft = on ? (lv / 16 * 0.6) : 0;
        if (playerBox) playerBox.style.filter = on
          ? ("blur(" + soft.toFixed(3) + "px) contrast(" + (1 + lv * 0.003).toFixed(3) + ")")
          : "";
        if (aaRange) aaRange.value = lv;
        if (aaVal) aaVal.textContent = lv + "x";
        if (aaToggle) aaToggle.textContent = on ? "På" : "Av";
        if (aaBtn) {
          aaBtn.classList.toggle("on", on);
          var l = aaBtn.querySelector(".et-aa-lbl"); if (l) l.textContent = "AA " + lv + "x";
        }
        try {
          localStorage.setItem("ordkollen_yt_aa", String(lv));
          localStorage.setItem("ordkollen_yt_aa_on", on ? "1" : "0");
        } catch (e) {}
      }
      (function () { var s = aaRead(); applyAa(s.lv, s.on); })();
      if (aaBtn) aaBtn.addEventListener("click", function () {
        if (aaPanel) aaPanel.hidden = !aaPanel.hidden;
      });
      if (aaRange) aaRange.addEventListener("input", function () {
        applyAa(parseInt(aaRange.value, 10), true);  // dra i reglaget = sätt på direkt
      });
      if (aaToggle) aaToggle.addEventListener("click", function () {
        var on = !(playerBox && playerBox.style.filter);  // wrapper-filter = AA är på
        applyAa(parseInt((aaRange && aaRange.value) || "16", 10), on);
      });


      // Lång beskrivning: bryt långa länkar och fäll ihop med "Visa mer".
      var desc = main.querySelector(".et-watch-desc");
      if (desc) {
        desc.classList.add("et-desc-clamp");
        if (desc.scrollHeight > desc.clientHeight + 8) {
          var tg = document.createElement("button");
          tg.className = "et-act et-desc-toggle"; tg.type = "button"; tg.textContent = "Visa mer";
          desc.insertAdjacentElement("afterend", tg);
          tg.addEventListener("click", function () {
            var ex = desc.classList.toggle("et-desc-open");
            desc.classList.toggle("et-desc-clamp", !ex);
            tg.textContent = ex ? "Visa mindre" : "Visa mer";
          });
        } else {
          desc.classList.remove("et-desc-clamp");
        }
      }

      // Endless recommendations: search by title keywords (YouTube removed the
      // related-videos API), paginated + infinite-scroll like the home feed.
      reco.q = (v.title.split(/\s+/).slice(0, 5).join(" ") + " " + v.channel).trim();
      reco.curId = id; reco.token = ""; reco.done = false; reco.loading = false; reco.mode = "search";
      loadMoreReco(true);
      // Observe the reco sentinel so more recommendations load as you scroll.
      var rs = main.querySelector("#etRecoSentinel");
      if (recoIo) { try { recoIo.disconnect(); } catch (e) {} }
      if (rs && "IntersectionObserver" in window) {
        recoIo = new IntersectionObserver(function (ents) {
          if (ents[0].isIntersecting && currentRoute.name === "watch") loadMoreReco(false);
        }, { rootMargin: "600px" });
        recoIo.observe(rs);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(handleErr);
  }
  function recoCard(v) {
    return '<a class="et-reco-card et-card" href="#" data-vid="' + esc(v.id) + '">' +
      '<div class="et-reco-thumb"><img src="' + esc(v.thumb) + '" alt="" loading="lazy">' + (v.duration ? '<span class="et-dur">' + esc(v.duration) + "</span>" : "") + "</div>" +
      '<div class="et-reco-info"><div class="et-reco-title">' + esc(v.title) + "</div>" +
      '<div class="et-card-meta">' + esc(v.channel) + (v.views ? " · " + fmt(v.views) + " visn." : "") + "</div></div></a>";
  }

  // Endless recommendations feed for the watch page. Pages the title-keyword
  // search and appends results, so the column never runs out ("infinite").
  function loadMoreReco(first) {
    if (reco.loading || reco.done) return;
    var box = main.querySelector("#etReco"); if (!box) return;
    var loader = main.querySelector("#etRecoLoader");
    reco.loading = true; if (loader) loader.classList.remove("hidden");

    // Two-stage endless feed: first page through a title-keyword SEARCH; when
    // that runs out (videos with rare/short titles return few results), fall
    // back to the endless "most popular" chart so recommendations NEVER run
    // short on any video.
    var req, mapper;
    if (reco.mode === "popular") {
      req = api("videos", { part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode: REGION, maxResults: 12, pageToken: reco.token });
      mapper = function (j) {
        var vs = j.items.map(norm).filter(function (v) { return v.id !== reco.curId; });
        return Promise.resolve({ items: vs, next: j.nextPageToken });
      };
    } else {
      req = api("search", { part: "snippet", type: "video", q: reco.q, maxResults: 12, pageToken: reco.token });
      mapper = function (s) {
        var ids = s.items.map(function (i) { return i.id.videoId; })
          .filter(function (x) { return x && x !== reco.curId; });
        return enrich(ids).then(function (vs) { return { items: vs, next: s.nextPageToken }; });
      };
    }

    req.then(mapper)
      .then(function (res) {
        if (box) { box.insertAdjacentHTML("beforeend", res.items.map(recoCard).join("")); wireCards(box); }
        if (res.next) {
          reco.token = res.next;                 // more of the current source
          // Om en titel-sökning ger väldigt få träffar → komplettera direkt med
          // populärt så listan aldrig blir kort/tom på vissa videor.
          if (first && reco.mode !== "popular" && res.items.length < 6) {
            reco.mode = "popular"; reco.token = "";
          }
        } else if (reco.mode !== "popular") {
          reco.mode = "popular"; reco.token = ""; // search slut → fortsätt med populärt
        } else {
          reco.done = true;                       // även populärt slut (mycket sällsynt)
        }
        reco.loading = false;
        if (loader) loader.classList.add("hidden");
        // If the column is still too short to scroll, pull the next page now.
        if (!reco.done && document.documentElement.scrollHeight <= window.innerHeight + 600) {
          setTimeout(function () { loadMoreReco(false); }, 150);
        }
      })
      .catch(function () {
        // Sök-fel (t.ex. konstig titel) → falla tillbaka på populärt istället för att sluta.
        reco.loading = false; if (loader) loader.classList.add("hidden");
        if (reco.mode !== "popular") { reco.mode = "popular"; reco.token = ""; setTimeout(function () { loadMoreReco(false); }, 200); }
        else reco.done = true;
      });
  }

  // ======================================================================
  //  LIVE-SCEN (Gemini 3.1) – "vad är det / vad händer" ovanpå videon
  //  ----------------------------------------------------------------------
  //  Trycker man på knappen läses scenen av Gemini 3.1 och vit text ("Detta
  //  är en vägg", "Detta är en stol", …) tonas in med en skanlinje-övergång.
  //  Videon PAUSAS ALDRIG: overlayn ligger ovanpå och släpper igenom klick
  //  (pointer-events:none), så uppspelningen fortsätter hela tiden.
  // ======================================================================
  var SCENE_MODEL = "gemini-3.1-flash";          // använder Gemini 3.1
  var lastSceneTime = 0;                          // senast kända uppspelningstid (sek)
  function geminiKeyLS() { try { return localStorage.getItem("ordkollen_gemini_key") || ""; } catch (e) { return ""; } }

  // Läs currentTime från YouTube-iframen via postMessage (enablejsapi=1).
  (function initYTTime() {
    if (window.__okYtTimeWired) return; window.__okYtTimeWired = true;
    window.addEventListener("message", function (e) {
      if (typeof e.data !== "string" || String(e.origin).indexOf("youtube") < 0) return;
      try {
        var d = JSON.parse(e.data);
        if (d && d.info && typeof d.info.currentTime === "number") lastSceneTime = d.info.currentTime;
      } catch (x) {}
    });
  })();
  function ytStartListening() {
    try {
      var f = document.getElementById("etPlayer");
      if (f && f.contentWindow) f.contentWindow.postMessage('{"event":"listening","id":1,"channel":"widget"}', "*");
    } catch (e) {}
  }

  function sceneAsk(id, v, startSec, key) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + SCENE_MODEL + ":generateContent?key=" + encodeURIComponent(key);
    var instr =
      "Du tittar på en YouTube-video. Beskriv vad som SYNS i bilden runt " + startSec + " sekunder in i videon.\n" +
      "Svara på svenska. Returnera ENBART giltig JSON, inget annat, i exakt detta format:\n" +
      '{"labels":["Detta är en vägg","Detta är en stol","Detta är ett fönster"],"happening":"Kort mening om vad som händer just nu."}\n' +
      'Regler: 3–6 korta "labels", var och en MÅSTE börja med "Detta är ". "happening" = en kort mening som översätter/förklarar vad som händer i bilden.';
    var ctx = "Titel: " + (v.title || "") + "\nKanal: " + (v.channel || "") + "\nBeskrivning: " + String(v.desc || "").slice(0, 600);

    function parseOut(j) {
      var c = j && j.candidates && j.candidates[0] && j.candidates[0].content;
      var txt = (c && c.parts && c.parts.map(function (p) { return p.text || ""; }).join("")) || "";
      return parseScene(txt);
    }
    // 1) Försök låta Gemini 3.1 verkligen SE videon (YouTube-URL som videoinput
    //    med en tidsstämpel runt nuläget).
    var bodyVideo = {
      contents: [{
        parts: [
          { fileData: { fileUri: "https://www.youtube.com/watch?v=" + id },
            videoMetadata: { startOffset: { seconds: startSec }, endOffset: { seconds: startSec + 3 } } },
          { text: instr + "\n\n" + ctx }
        ]
      }]
    };
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyVideo) })
      .then(function (r) { if (!r.ok) return r.text().then(function () { throw new Error("video"); }); return r.json(); })
      .then(parseOut)
      .catch(function () {
        // 2) Reserv: utan videoinput (vissa videor går ej att analysera) – gissa
        //    rimligt utifrån titel/beskrivning så läget ALLTID ger ett svar.
        var body2 = { contents: [{ parts: [{ text: instr + "\n\n(Du kan inte se bilden just nu – gissa rimligt utifrån detta:)\n" + ctx }] }] };
        return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body2) })
          .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error("Gemini " + r.status + ": " + t.slice(0, 120)); }); return r.json(); })
          .then(parseOut);
      });
  }

  function parseScene(txt) {
    var labels = [], happening = "";
    try {
      var m = txt.match(/\{[\s\S]*\}/);
      if (m) { var o = JSON.parse(m[0]); labels = o.labels || []; happening = o.happening || ""; }
    } catch (e) {}
    if (!labels.length) {
      labels = txt.split(/\n+/).map(function (s) { return s.replace(/^[-*•\d.\s"]+/, "").trim(); })
        .filter(Boolean).slice(0, 5);
    }
    labels = labels.slice(0, 6).map(function (s) { return String(s).trim(); }).filter(Boolean);
    return { labels: labels, happening: String(happening || "").trim() };
  }

  function startSceneTransition(overlay) {
    overlay.innerHTML = '<div class="et-scene-scan"></div><div class="et-scene-tag et-scene-loading">Läser scenen…</div>';
    overlay.classList.add("show");
  }
  function renderSceneLabels(overlay, res) {
    var html = '<div class="et-scene-scan"></div>';
    var labels = res.labels || [];
    labels.forEach(function (lbl, i) {
      html += '<div class="et-scene-tag" style="animation-delay:' + (i * 0.45 + 0.15).toFixed(2) + 's">' + esc(lbl) + "</div>";
    });
    if (res.happening) {
      html += '<div class="et-scene-happening" style="animation-delay:' + (labels.length * 0.45 + 0.3).toFixed(2) + 's">' + esc(res.happening) + "</div>";
    }
    if (!labels.length && !res.happening) html = '<div class="et-scene-tag">Inget tydligt att beskriva just nu.</div>';
    overlay.innerHTML = html;
    overlay.classList.add("show");
    clearTimeout(overlay._hideT);
    overlay._hideT = setTimeout(function () { overlay.classList.remove("show"); }, (labels.length * 0.45 + 4.8) * 1000);
  }
  function showSceneError(overlay, msg) {
    overlay.innerHTML = '<div class="et-scene-tag et-scene-err">' + esc(msg) + "</div>";
    overlay.classList.add("show");
    clearTimeout(overlay._hideT);
    overlay._hideT = setTimeout(function () { overlay.classList.remove("show"); }, 4500);
  }

  function handleErr(err) {
    if (err && err.code === "NOKEY") { show(keyPromptHTML()); bindKeyPrompt(); return; }
    var reason = (err && err.error && err.error.errors && err.error.errors[0] && err.error.errors[0].reason) || "";
    var apiMsg = (err && err.error && err.error.message) || "";
    var msg =
      reason === "quotaExceeded" ? "Dagens API-kvot är slut. Försök igen imorgon." :
      (reason === "keyInvalid" || reason === "API_KEY_INVALID") ? "API-nyckeln är ogiltig. Kontrollera den i Inställningar." :
      reason === "accessNotConfigured" ? "YouTube Data API v3 är inte aktiverat för din nyckels Google Cloud-projekt. Aktivera det och försök igen." :
      (reason === "ipRefererBlocked" || reason === "forbidden") ? "Nyckeln blockeras av HTTP-referrer-begränsningar. Lägg till denna sajts domän i nyckelns tillåtna referrers i Google Cloud." :
        "Kunde inte ladda videor just nu.";
    show('<div class="et-keyprompt"><h2>' + esc(msg) + "</h2>" +
      (apiMsg ? '<p style="opacity:.78;font-size:.85rem;margin:6px 0 12px;max-width:520px">' + esc(apiMsg) + (reason ? " (" + esc(reason) + ")" : "") + "</p>" : "") +
      '<button class="et-subscribed" id="etOpenSettings">Öppna inställningar</button></div>');
    bindKeyPrompt();
  }
  function bindKeyPrompt() {
    var b = main.querySelector("#etOpenSettings");
    if (b) b.addEventListener("click", function () { var s = document.getElementById("settingsBtn"); if (s) s.click(); var yt = document.getElementById("ytKey"); if (yt) setTimeout(function () { yt.focus(); }, 200); });
  }

  function openWatch(id) { currentRoute = { name: "watch", id: id }; render(); }

  // ---------------------------------------------------------------- nav wiring
  function go(name) {
    var map = { home: "home", trending: "home", subs: "home", library: "library", history: "history", watchlater: "watchlater", liked: "liked" };
    if (name === "home" || name === "trending" || name === "subs") { feed.mode = "home"; currentRoute = { name: "home" }; }
    else currentRoute = { name: map[name] || "home" };
    render();
  }

  function init() {
    view = document.getElementById("view-underhallning");
    if (!view || view.dataset.wired) return;
    view.dataset.wired = "1";
    main = view.querySelector("#etMain");
    sentinel = view.querySelector("#etSentinel");

    loadLib(); cloudLoadLib();

    // search
    var form = view.querySelector("#etSearchForm");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = view.querySelector("#etSearchInput").value.trim();
      if (!q) return;
      feed.mode = "search"; feed.q = q; currentRoute = { name: "home" }; render();
    });

    // sidebar nav
    view.querySelectorAll(".et-side-item[data-et-nav]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); go(a.dataset.etNav); });
    });

    // masthead: theme toggle (reuses the app's real light/dark theme)
    var themeBtn = view.querySelector("#etThemeToggle");
    if (themeBtn) themeBtn.addEventListener("click", function () {
      var g = document.getElementById("themeToggle");
      if (g) g.click();
      else {
        var html = document.documentElement, dark = html.classList.toggle("dark");
        try { localStorage.setItem("ordkollen_theme", dark ? "dark" : "light"); } catch (e) {}
      }
      themeBtn.classList.toggle("active", document.documentElement.classList.contains("dark"));
    });

    // masthead: settings (opens the existing settings modal where the YouTube key lives)
    var setBtn = view.querySelector("#etSettingsBtn");
    if (setBtn) setBtn.addEventListener("click", function () {
      var s = document.getElementById("settingsBtn"); if (s) s.click();
      var yt = document.getElementById("ytKey"); if (yt) setTimeout(function () { yt.focus(); }, 200);
    });

    // YouTube API key field in the settings modal (load + save locally)
    var ytField = document.getElementById("ytKey");
    if (ytField) {
      ytField.value = ytKey();
      var persist = function () { try { localStorage.setItem("ordkollen_yt_key", ytField.value.trim()); } catch (e) {} };
      ytField.addEventListener("input", persist);
      ytField.addEventListener("change", function () { persist(); if (currentRoute.name === "home") render(); });
    }
    var showYt = document.getElementById("showYtKey");
    if (showYt && ytField) showYt.addEventListener("change", function () { ytField.type = showYt.checked ? "text" : "password"; });

    // user avatar reflects login
    var u = sessionUser();
    var av = view.querySelector("#etUserAvatar");
    if (av && u) av.title = "Inloggad: " + u;

    // infinite scroll
    if (sentinel && "IntersectionObserver" in window) {
      io = new IntersectionObserver(function (ents) {
        // Fire on the home feed AND on search results (both render into #etFeedGrid).
        var onFeed = currentRoute.name === "home" && (feed.mode === "home" || feed.mode === "search");
        if (ents[0].isIntersecting && onFeed) loadMore(false);
      }, { rootMargin: "800px" });
      io.observe(sentinel);
    }

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // re-sync library when login state changes (Firebase auth ready after init)
  try {
    var poll = setInterval(function () {
      if (window.firebase && firebase.auth && firebase.auth().currentUser) { loadLib(); cloudLoadLib(); clearInterval(poll); }
    }, 1500);
    setTimeout(function () { clearInterval(poll); }, 30000);
  } catch (e) {}
})();
