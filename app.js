// ===== Ordkollen – applogik =====
(function () {
  "use strict";

  // 👉 Klistra in ditt Google OAuth Client ID här för att aktivera Google-inloggning.
  //    Skapa det gratis på https://console.cloud.google.com/apis/credentials
  //    (OAuth 2.0 Client ID, typ "Web"). Lägg till din Netlify-domän under
  //    "Authorized JavaScript origins", t.ex. https://din-sajt.netlify.app
  const GOOGLE_CLIENT_ID = ""; // <-- t.ex. "1234567890-abcd.apps.googleusercontent.com"

  const LS_USERS = "ordkollen_users";
  const LS_SESSION = "ordkollen_session";
  const savedKey = (u) => `ordkollen_saved_${u}`;

  let currentUser = null;
  let authMode = "login";
  let lastResultWord = null;

  const $ = (id) => document.getElementById(id);
  const ORDBOK = window.ORDBOK || {};
  const WORDLIST = window.WORDLIST || [];

  function hash(str) { let h = 5381; for (let i=0;i<str.length;i++) h=(h*33)^str.charCodeAt(i); return (h>>>0).toString(16); }
  function loadJSON(k,f){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } }
  function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // ===================== GOOGLE SIGN-IN =====================
  function decodeJwt(token){ try{ const p=token.split(".")[1]; return JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g,"+").replace(/_/g,"/"))))); }catch{ return null; } }

  function initGoogle(){
    const hint = $("gsiHint");
    if (!GOOGLE_CLIENT_ID) {
      hint.classList.remove("hidden");
      hint.innerHTML = "ℹ️ Google-inloggning aktiveras genom att lägga in ditt Client ID i <code>app.js</code>.";
      return;
    }
    const tryInit = () => {
      if (!(window.google && google.accounts && google.accounts.id)) { setTimeout(tryInit, 300); return; }
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
      google.accounts.id.renderButton($("gsiBtn"), { theme:"filled_black", size:"large", shape:"pill", text:"continue_with", width:300 });
    };
    tryInit();
  }

  function onGoogleCredential(resp){
    const info = decodeJwt(resp.credential);
    if (!info) return;
    const name = info.name || info.email || "Google-användare";
    const users = loadJSON(LS_USERS, {});
    const key = (info.email || name).toLowerCase();
    if (!users[key]) { users[key] = { name, google:true }; saveJSON(LS_USERS, users); }
    login(users[key].name, key);
  }

  // ===================== AUTH =====================
  function setAuthMode(mode){
    authMode = mode; const isLogin = mode==="login";
    $("tabLogin").classList.toggle("auth-tab-active", isLogin);
    $("tabRegister").classList.toggle("auth-tab-active", !isLogin);
    $("authSubmit").textContent = isLogin ? "Logga in" : "Skapa konto";
    // E-post används som inloggningsuppgift (Firebase) → visa alltid.
    const emailEl = $("authEmail");
    if (emailEl){ emailEl.classList.remove("hidden"); emailEl.required = true; }
    // Användarnamn behövs bara när man skapar konto.
    const userEl = $("authUser");
    if (userEl){ userEl.classList.toggle("hidden", isLogin); userEl.required = !isLogin; }
    $("authPass").autocomplete = isLogin ? "current-password" : "new-password";
    $("authMsg").textContent = "";
  }

  async function handleAuthSubmit(e){
    e.preventDefault();
    const user = $("authUser").value.trim(), pass = $("authPass").value, msg = $("authMsg");
    const email = ($("authEmail") ? $("authEmail").value.trim() : "");
    const fbOn = !!window.FirebaseAuth;
    const minPass = fbOn ? 6 : 4;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ msg.textContent = "Ange en giltig e-postadress."; return; }
    if (pass.length < minPass){ msg.textContent = "Lösenord måste vara minst " + minPass + " tecken."; return; }
    if (authMode === "register" && user.length < 2){ msg.textContent = "Användarnamn måste vara minst 2 tecken."; return; }

    // ---------- Firebase (e-post sparas i molnet) ----------
    if (fbOn){
      msg.textContent = "";
      const btn = $("authSubmit"); btn.disabled = true; const label = btn.textContent; btn.textContent = "…";
      try {
        if (authMode === "register"){
          const u = await FirebaseAuth.register(email, pass, user || email.split("@")[0]);
          finishFirebaseLogin(u, user || email.split("@")[0]);
        } else {
          const cred = await FirebaseAuth.login(email, pass);
          const u = (cred && cred.user) ? cred.user : cred;
          finishFirebaseLogin(u, (u && u.displayName) || email.split("@")[0]);
        }
      } catch (err){
        msg.textContent = firebaseErr(err);
      } finally {
        btn.disabled = false; btn.textContent = label;
      }
      return;
    }

    // ---------- Lokalt läge (utan Firebase) ----------
    const localName = user || email.split("@")[0];
    const users = loadJSON(LS_USERS, {}); const key = email.toLowerCase();
    if (authMode === "register"){
      if (localName.length < 2){ msg.textContent = "Användarnamn måste vara minst 2 tecken."; return; }
      if (users[key]){ msg.textContent = "E-postadressen är redan registrerad."; return; }
      users[key] = { name:localName, email:email, pass:hash(pass) }; saveJSON(LS_USERS, users); login(localName, key);
    } else {
      const rec = users[key];
      if (!rec || rec.google){ msg.textContent = "Fel e-post eller lösenord."; return; }
      if (rec.pass !== hash(pass)){ msg.textContent = "Fel e-post eller lösenord."; return; }
      login(rec.name, key);
    }
  }

  // Spegla Firebase-användaren lokalt så sparade ord m.m. fungerar, och starta sessionen.
  function finishFirebaseLogin(fbUser, name){
    const email = (fbUser && fbUser.email) ? fbUser.email : "";
    const key = (email || name).toLowerCase();
    const users = loadJSON(LS_USERS, {});
    if (!users[key]) users[key] = { name: name, email: email, firebase: true };
    else { users[key].name = users[key].name || name; users[key].email = email; }
    saveJSON(LS_USERS, users);
    login(name, key);
    // Hämta & slå ihop sparade ord från molnet (följer kontot mellan enheter).
    syncCloudWords();
  }

  function firebaseErr(err){
    const c = (err && err.code) ? String(err.code) : "";
    if (c.includes("email-already-in-use")) return "E-postadressen är redan registrerad.";
    if (c.includes("invalid-email")) return "Ogiltig e-postadress.";
    if (c.includes("weak-password")) return "Lösenordet är för svagt (minst 6 tecken).";
    if (c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-credential") || c.includes("invalid-login")) return "Fel e-post eller lösenord.";
    if (c.includes("too-many-requests")) return "För många försök – vänta en stund och försök igen.";
    if (c.includes("network")) return "Nätverksfel – kontrollera din anslutning.";
    if (c.includes("operation-not-allowed")) return "E-post/lösenord är inte aktiverat i Firebase. Aktivera det under Authentication → Sign-in method.";
    return (err && err.message) ? err.message : "Något gick fel. Försök igen.";
  }

  function login(name, key){
    currentUser = key || name.toLowerCase();
    saveJSON(LS_SESSION, currentUser);
    $("authForm").reset(); $("authMsg").textContent = "";
    $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
    $("whoami").textContent = "👤 " + name;
    mergeUserWords();
    renderSuggestions(); renderSaved(); buildBrowseControls(); switchView("sok");
    $("resultArea").innerHTML = welcomeHtml(name); $("searchInput").focus();
  }

  function logout(){
    currentUser = null; localStorage.removeItem(LS_SESSION);
    cloudReady = false;
    if (cloudUnsub) { try { cloudUnsub(); } catch (e) {} cloudUnsub = null; }
    if (profileUnsub) { try { profileUnsub(); } catch (e) {} profileUnsub = null; }
    try { if (window.FirebaseAuth) FirebaseAuth.logout(); } catch (e) {}
    $("appView").classList.add("hidden"); $("authView").classList.remove("hidden"); setAuthMode("login");
  }

  // ===================== FLIKAR =====================
  function switchView(view){
    document.querySelectorAll(".navtab").forEach(t => t.classList.toggle("navtab-active", t.dataset.view===view));
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $("view-"+view).classList.remove("hidden");
    if (view==="sparade") renderSaved();
  }

  // ===================== SÖK =====================
  function normalize(s){ return s.trim().toLowerCase(); }
  const WORDSET = new Set(WORDLIST);
  function lookup(word){
    const w = normalize(word);
    if (ORDBOK[w]) return { word:w, data:ORDBOK[w] };
    if (WORDSET.has(w)) return { word:w, data:{}, plain:true };
    for (const key in ORDBOK){ if (key.startsWith(w) && w.length>=2) return { word:key, data:ORDBOK[key] }; }
    return null;
  }

  function category(title, items, cls, icon){
    if (!items || !items.length) return "";
    const chips = items.map(t => `<button class="chip ${cls}" data-term="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("");
    return `<div class="mb-4"><h4 class="font-semibold mb-2 flex items-center gap-1.5">${icon} ${title}
      <span class="text-slate-400 font-normal text-xs">(${items.length})</span></h4>
      <div class="flex flex-wrap gap-2">${chips}</div></div>`;
  }

  function renderResult(res){
    if (!res){
      const q = $("searchInput").value.trim();
      $("resultArea").innerHTML = `<div class="card text-center">
        <p class="text-slate-500 mb-3">🔍 "${escapeHtml(q)}" hittades inte i ordboken.</p>
        <div class="flex flex-wrap justify-center gap-2">
          <button id="addMissingBtn" class="px-3 py-2 rounded-lg btn-grad text-white font-semibold">➕ Lägg till ordet</button>
          <button id="askMissingBtn" class="px-3 py-2 rounded-lg border border-violet-300 dark:border-violet-800 text-violet-600 dark:text-violet-300">🤖 Fråga Gemini</button>
        </div></div>`;
      const ab = $("addMissingBtn"); if (ab) ab.addEventListener("click", () => { switchView("lagg"); $("addWord").value = q; });
      const qb = $("askMissingBtn"); if (qb) qb.addEventListener("click", () => { openChat(); askGemini(`Förklara ordet "${q}" enkelt på svenska och ge synonymer, slang, uttryck och idiom om det finns.`); });
      return;
    }
    lastResultWord = res.word; const d = res.data; const isSaved = getSaved().includes(res.word);
    const sentMap = { positiv:["sent-pos","🟢 Positivt ord"], negativ:["sent-neg","🔴 Negativt ord"], neutral:["sent-neu","⚪ Neutralt ord"] };
    const sent = d.sentiment ? sentMap[d.sentiment] : null;
    const sentExplMap = { positiv:"🟢 Positivt – ger en bra/glad känsla.", negativ:"🔴 Negativt – ger en dålig/ledsen känsla.", neutral:"⚪ Neutralt – varken positivt eller negativt." };
    const sentExpl = d.sentiment ? sentExplMap[d.sentiment] : null;
    $("resultArea").innerHTML = `
      <div class="card">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex flex-col gap-1.5">
            <h3 class="text-2xl font-black capitalize">${escapeHtml(res.word)}</h3>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-slate-400 text-xs italic">${escapeHtml(d.ordklass||"")}</span>
              ${sent ? `<span class="sent-badge ${sent[0]}">${sent[1]}</span>` : ``}
            </div>
          </div>
          <button id="saveWordBtn" class="shrink-0 px-3 py-2 rounded-lg font-semibold transition ${isSaved
            ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
            : "btn-grad text-white"}">${isSaved ? "✓ Sparat" : "⭐ Spara"}</button>
        </div>
        ${d.beskrivning ? `<p class="mb-2 text-slate-600 dark:text-slate-300">📝 ${escapeHtml(d.beskrivning)}</p>` : ``}
        ${sentExpl ? `<p class="mb-4 text-slate-400 text-xs">${sentExpl}</p>` : ``}
        ${category("Synonymer", d.synonymer, "chip-syn", "🟢")}
        ${category("Slang", d.slang, "chip-slang", "🟡")}
        ${category("Uttryck", d.uttryck, "chip-uttryck", "🔵")}
        ${category("Idiom", d.idiom, "chip-idiom", "🟣")}
        ${res.plain ? `<div class="text-sm rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/30 p-3">
          <p class="text-slate-600 dark:text-slate-300 mb-2">📘 Ordet finns i ordlistan men saknar detaljer.</p>
          ${getGeminiKey() ? `` : `<button id="aiWordBtn" class="px-3 py-2 rounded-lg btn-grad text-white font-semibold text-sm">🤖 Låt Gemini fylla i allt</button>`}
          <p id="aiWordStatus" class="text-xs mt-2"></p>
          <p class="text-slate-400 text-xs mt-2">${getGeminiKey()
            ? "Fylls i automatiskt av Gemini: ordklass, betydelse (förenklat), synonymer, slang, uttryck, idiom – och färgen: 🟢 positivt · 🔴 negativt · ⚪ neutralt."
            : "Lägg in en Gemini-nyckel via ⚙️ så fylls ord i automatiskt när du söker dem."}</p>
        </div>` : ``}
        <p class="text-slate-400 text-xs mt-2">💡 Klicka på ett ord för att slå upp det.</p>
      </div>`;
    $("saveWordBtn").addEventListener("click", () => toggleSave(res.word));
    $("resultArea").querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => doSearch(c.dataset.term)));
    const aiw = $("aiWordBtn");
    if (aiw) aiw.addEventListener("click", () => aiFillWord(res.word));
    // Fyll i automatiskt direkt vid sökning om en Gemini-nyckel finns
    if (res.plain && getGeminiKey()) aiFillWord(res.word);
    return;
  }

  function doSearch(term){ switchView("sok"); $("searchInput").value = term; renderResult(lookup(term)); }

  function renderSuggestions(){
    const words = Object.keys(ORDBOK).sort();
    $("suggestions").innerHTML = `<span class="text-slate-400 text-xs self-center mr-1">Förslag:</span>` +
      words.slice(0,14).map(w => `<button class="chip bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" data-w="${w}">${w}</button>`).join("");
    $("suggestions").querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => doSearch(c.dataset.w)));
  }

  function welcomeHtml(name){
    return `<div class="card text-center"><div class="text-3xl mb-2">👋</div>
      <h3 class="font-bold text-lg mb-1">Välkommen, ${escapeHtml(name)}!</h3>
      <p class="text-slate-500">Sök ett ord för att se synonymer, slang, uttryck och idiom – och spara dina favoriter.</p></div>`;
  }

  // ===================== BLÄDDRA (doon.se) =====================
  function buildBrowseControls(){
    const alpha = "abcdefghijklmnopqrstuvwxyzåäö".split("");
    $("alphabet").innerHTML = alpha.map(l => `<button class="alpha-btn" data-l="${l}">${l.toUpperCase()}</button>`).join("");
    $("alphabet").querySelectorAll(".alpha-btn").forEach(b => b.addEventListener("click", () => {
      $("alphabet").querySelectorAll(".alpha-btn").forEach(x => x.classList.remove("alpha-btn-active"));
      b.classList.add("alpha-btn-active"); renderBrowse();
    }));
    const lens = [...new Set(WORDLIST.map(w => w.length))].sort((a,b)=>a-b);
    $("filterLen").innerHTML = `<option value="">Alla</option>` + lens.map(n => `<option value="${n}">${n} bokstäver</option>`).join("");
    $("filterClass").addEventListener("change", renderBrowse);
    $("filterLen").addEventListener("change", renderBrowse);
    $("longestBtn").addEventListener("click", () => {      $("alphabet").querySelectorAll(".alpha-btn").forEach(x => x.classList.remove("alpha-btn-active"));
      const longest = [...WORDLIST].sort((a,b)=>b.length-a.length).slice(0,30);
      paintTiles("browseResult","browseCount",longest,"Topp 30 längsta orden");
    });
  }

  function renderBrowse(){
    const letter = $("alphabet").querySelector(".alpha-btn-active")?.dataset.l;
    const cls = $("filterClass").value, len = $("filterLen").value;
    let words = WORDLIST.slice();
    if (letter) words = words.filter(w => w.startsWith(letter));
    if (len) words = words.filter(w => w.length === +len);
    if (cls) words = words.filter(w => ORDBOK[w]?.ordklass === cls);
    paintTiles("browseResult","browseCount",words, letter ? `Ord på "${letter.toUpperCase()}"` : "Alla ord");
  }

  const TILE_LIMIT = 600;
  function paintTiles(target, counter, words, label){
    if (!words.length){ $(target).innerHTML = `<p class="text-slate-400 col-span-full">Inga ord matchar.</p>`; $(counter).textContent=""; return; }
    const shown = words.slice(0, TILE_LIMIT);
    $(target).innerHTML = shown.map(w => `<div class="word-tile" data-w="${escapeHtml(w)}">${escapeHtml(w)}</div>`).join("");
    const extra = words.length > TILE_LIMIT ? ` (visar ${TILE_LIMIT} – förfina filtret för fler)` : "";
    $(counter).textContent = `${label} – ${words.length} ord${extra}`;
    $(target).querySelectorAll(".word-tile").forEach(t => t.addEventListener("click", () => doSearch(t.dataset.w)));
  }

  // ===================== KORSORD (korsordx) =====================
  function solvePattern(pat){
    const p = normalize(pat).replace(/\*/g,"?").replace(/[ .]/g,"?");
    if (!p) return [];
    const re = new RegExp("^" + p.split("").map(c => c==="?" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("") + "$");
    return WORDLIST.filter(w => re.test(w));
  }

  function runPattern(){
    const matches = solvePattern($("patternInput").value);
    if (!$("patternInput").value.trim()){ $("crosswordResult").innerHTML=""; $("crosswordCount").textContent=""; return; }
    if (!matches.length){ $("crosswordResult").innerHTML = `<p class="text-slate-400 col-span-full">Inga ord matchar mönstret.</p>`; $("crosswordCount").textContent=""; return; }
    paintTiles("crosswordResult","crosswordCount",matches, `Mönster "${$("patternInput").value}"`);
  }

  // ===================== SPARADE =====================
  function getSaved(){ return loadJSON(savedKey(currentUser), []); }
  function setSaved(a){ saveJSON(savedKey(currentUser), a); updateSavedBadge(); pushCloudWords(); }

  // ---------- Moln-synk av sparade ord (Firestore) ----------
  let cloudReady = false;
  let cloudUnsub = null;
  let cloudApplying = false; // hindrar eko tillbaka till molnet

  function pushCloudWords(){
    if (!cloudReady || cloudApplying || !window.FirebaseSync) return;
    try { FirebaseSync.setWords(getSaved()); } catch (e) {}
  }

  let profileApplying = false;
  let profileUnsub = null;

  function getProfilePayload() {
    return {
      customWords: getUserWords(),
      theme: localStorage.getItem("ordkollen_theme"),
      lang: localStorage.getItem("ordkollen_lang"),
      langTs: localStorage.getItem("ordkollen_lang_ts"),
      logo: localStorage.getItem("ordkollen_logo"),
      geminiKey: localStorage.getItem("ordkollen_gemini_key"),
      geminiModel: localStorage.getItem("ordkollen_gemini_model"),
      openaiKey: localStorage.getItem("ordkollen_openai_key"),
      openaiModel: localStorage.getItem("ordkollen_openai_model")
    };
  }

  // Anropas när någon inställning eller egna ord ändras
  window.pushCloudProfile = function(){
    if (!cloudReady || profileApplying || !window.FirebaseSync) return;
    try { FirebaseSync.setProfileData(getProfilePayload()); } catch (e) {}
  };

  // Hämta molnets ord, slå ihop med lokala och spegla tillbaka unionen.
  async function syncCloudWords(){
    if (!window.FirebaseSync) return;
    cloudReady = true;
    try {
      const cloud = (await FirebaseSync.loadWords()).map(normalize).filter(Boolean);
      const local = getSaved();
      const union = Array.from(new Set([...local, ...cloud]));
      setSaved(union);          // sparar lokalt + skickar unionen till molnet
      renderSaved();
      // Realtids-uppdatering om ord ändras på en annan enhet.
      if (cloudUnsub) { try { cloudUnsub(); } catch (e) {} cloudUnsub = null; }
      if (FirebaseSync.subscribeProfile) {
        if (profileUnsub) { try { profileUnsub(); } catch(e){} profileUnsub = null; }
        profileUnsub = FirebaseSync.subscribeProfile((prof, isInit) => {
          if (!prof) return;
          profileApplying = true;

          // Egna ord
          if (prof.customWords) {
            const currentUw = getUserWords();
            const newUw = { ...currentUw, ...prof.customWords }; // behåll lokala som saknas i molnet (eller omvänt, union)
            saveJSON(userWordsKey(currentUser), newUw);
            for (const w in newUw){ ORDBOK[w] = newUw[w]; WORDSET.add(w); if(!WORDLIST.includes(w)) WORDLIST.push(w); }
          }

          // Inställningar
          if (prof.theme) localStorage.setItem("ordkollen_theme", prof.theme);
          // Språk: skriv bara över det lokala valet om molnets val är NYARE (nyast vinner).
          // Annars nollställer en gammal synk från en annan enhet det språk man just valt.
          if (prof.lang) {
            const localTs = parseInt(localStorage.getItem("ordkollen_lang_ts") || "0", 10);
            const remoteTs = parseInt(prof.langTs || "0", 10);
            // Strikt ">": en eko-uppdatering med SAMMA tidsstämpel (vår egen skrivning)
            // får INTE skriva över det vi just valde. Bara ett bevisligen nyare val vinner.
            if (!localTs || remoteTs > localTs) {
              const prevLang = localStorage.getItem("ordkollen_lang");
              localStorage.setItem("ordkollen_lang", prof.lang);
              if (prof.langTs) localStorage.setItem("ordkollen_lang_ts", String(remoteTs));
              // Tillämpa språket på sidan – ÄVEN vid första inläsningen – så att det
              // lagrade valet och det som faktiskt visas aldrig glider isär.
              if (prevLang !== prof.lang) {
                let lv = prof.lang; try { lv = JSON.parse(prof.lang); } catch (e) {}
                if (window.OrdkollenSyncLangSelect) window.OrdkollenSyncLangSelect(lv);
                if (window.OrdkollenApplyLang) window.OrdkollenApplyLang(lv);
              }
            }
          }
          if (prof.logo) localStorage.setItem("ordkollen_logo", prof.logo);
          if (prof.geminiKey) localStorage.setItem("ordkollen_gemini_key", prof.geminiKey);
          if (prof.geminiModel) localStorage.setItem("ordkollen_gemini_model", prof.geminiModel);
          if (prof.openaiKey) localStorage.setItem("ordkollen_openai_key", prof.openaiKey);
          if (prof.openaiModel) localStorage.setItem("ordkollen_openai_model", prof.openaiModel);

          profileApplying = false;

          // Tvinga UI att uppdateras om detta kom från en annan enhet (inte vid första inläsning för då görs det ändå)
          if (!isInit) {
            if (document.documentElement.classList.contains("dark") && prof.theme==="light") document.documentElement.classList.remove("dark");
            else if (!document.documentElement.classList.contains("dark") && prof.theme==="dark") document.documentElement.classList.add("dark");
          }
        });
      }

      if (FirebaseSync.subscribe){
        cloudUnsub = FirebaseSync.subscribe((words) => {
          const incoming = Array.from(new Set((words || []).map(normalize).filter(Boolean)));
          const cur = getSaved();
          if (incoming.length === cur.length && incoming.every(w => cur.includes(w))) return;
          cloudApplying = true;
          saveJSON(savedKey(currentUser), incoming); updateSavedBadge();
          cloudApplying = false;
          renderSaved();
        });
      }
    } catch (e) {}
  }
  function updateSavedBadge(){ const n = getSaved().length; $("navSavedCount").textContent = n ? `(${n})` : ""; }

  // Lägg till i sparade och fira var 10:e insamlat ord
  function addToSaved(words){
    const s = getSaved(); const prev = s.length;
    words.forEach(w => { w = normalize(w); if (w && !s.includes(w)) s.push(w); });
    setSaved(s);
    const now = s.length;
    if (now > prev && Math.floor(now/10) > Math.floor(prev/10)) celebrateExplosion(now);
    return now;
  }

  // Firande-explosion (emoji-partiklar) när man når 10, 20, 30 …
  function celebrateExplosion(count){
    const layer = $("celebrateLayer");
    if (!layer) return;
    layer.innerHTML = ""; layer.classList.remove("hidden");
    const msg = document.createElement("div");
    msg.className = "celebrate-msg";
    msg.textContent = `💥 ${count} ord! 🎉`;
    layer.appendChild(msg);
    const emojis = ["💥","🎉","⭐","✨","🎊","🟢","🔴","🏆","🎈"];
    const cx = window.innerWidth/2, cy = window.innerHeight*0.42;
    for (let i=0;i<40;i++){
      const p = document.createElement("div");
      p.className = "particle";
      p.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      p.style.left = cx + "px"; p.style.top = cy + "px";
      const ang = Math.random()*Math.PI*2, dist = 120 + Math.random()*260;
      p.style.setProperty("--dx", (Math.cos(ang)*dist).toFixed(0) + "px");
      p.style.setProperty("--dy", (Math.sin(ang)*dist + 60).toFixed(0) + "px");
      p.style.setProperty("--rot", (Math.random()*720-360).toFixed(0) + "deg");
      p.style.animationDelay = (Math.random()*0.15).toFixed(2) + "s";
      layer.appendChild(p);
    }
    setTimeout(()=>{ layer.classList.add("hidden"); layer.innerHTML=""; }, 1800);
  }

  function toggleSave(word){
    const s = getSaved();
    if (s.includes(word)) setSaved(s.filter(w=>w!==word));
    else addToSaved([word]);
    renderSaved(); if (lastResultWord) renderResult(lookup(lastResultWord));
  }
  function removeWord(word){ setSaved(getSaved().filter(w=>w!==word)); renderSaved(); if (lastResultWord) renderResult(lookup(lastResultWord)); }
  function removeSelected(){
    const checked = [...document.querySelectorAll(".saved-check:checked")].map(c=>c.value);
    if (!checked.length) return;
    setSaved(getSaved().filter(w=>!checked.includes(w))); renderSaved();
  }
  function removeAll(){ if (!getSaved().length) return; if (!confirm("Ta bort alla sparade ord?")) return; setSaved([]); renderSaved(); }

  function savedCardHtml(w){
    const d = ORDBOK[w] || {};
    const sentMap = { positiv:["sent-pos","🟢 Positivt"], negativ:["sent-neg","🔴 Negativt"], neutral:["sent-neu","⚪ Neutralt"] };
    const sentExplMap = { positiv:"🟢 Positivt – ger en bra/glad känsla.", negativ:"🔴 Negativt – ger en dålig/ledsen känsla.", neutral:"⚪ Neutralt – varken positivt eller negativt." };
    const sent = d.sentiment ? sentMap[d.sentiment] : null;
    const sentExpl = d.sentiment ? sentExplMap[d.sentiment] : null;
    const hasDetail = !!(d.beskrivning || d.ordklass || d.sentiment || (d.synonymer && d.synonymer.length));
    const syn = (d.synonymer && d.synonymer.length)
      ? `<div class="mt-2"><span class="text-xs font-semibold text-slate-500">🟢 Synonymer (liknande ord):</span>
           <div class="flex flex-wrap gap-1.5 mt-1">${d.synonymer.map(t=>`<button class="chip chip-syn saved-syn" data-term="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}</div></div>`
      : ``;
    return `<li class="saved-card card">
      <div class="flex items-start gap-2">
        <input type="checkbox" class="saved-check accent-fuchsia-600 w-4 h-4 mt-1.5 shrink-0" value="${escapeHtml(w)}" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <button class="saved-open text-left capitalize font-bold text-lg" data-w="${escapeHtml(w)}">${escapeHtml(w)}</button>
            <div class="flex items-center gap-2 shrink-0">
              ${sent ? `<span class="sent-badge ${sent[0]}">${sent[1]}</span>` : ``}
              <button class="saved-del text-rose-500 hover:text-rose-700 px-1" data-w="${escapeHtml(w)}" title="Ta bort">✕</button>
            </div>
          </div>
          ${d.ordklass ? `<div class="text-slate-400 text-xs italic">${escapeHtml(d.ordklass)}</div>` : ``}
          ${d.beskrivning ? `<p class="text-slate-600 dark:text-slate-300 text-sm mt-1">📝 ${escapeHtml(d.beskrivning)}</p>` : ``}
          ${sentExpl ? `<p class="text-slate-400 text-xs mt-1">${sentExpl}</p>` : ``}
          ${syn}
          ${!hasDetail ? `<div class="mt-2 text-sm rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/30 p-2.5">
            <p class="text-slate-600 dark:text-slate-300">📘 Saknar detaljer (betydelse, färg 🟢/🔴, synonymer).</p>
            <button class="saved-fill px-3 py-1.5 mt-1.5 rounded-lg btn-grad text-white font-semibold text-xs" data-w="${escapeHtml(w)}">🤖 Låt Gemini fylla i</button>
            <span class="saved-fill-status text-xs ml-2"></span>
          </div>` : ``}
        </div>
      </div>
    </li>`;
  }

  function renderSaved(){
    updateSavedBadge();
    const saved = getSaved();
    $("savedCount").textContent = saved.length ? `(${saved.length})` : "";
    $("savedEmpty").style.display = saved.length ? "none" : "block";
    $("savedList").innerHTML = saved.map(savedCardHtml).join("");
    $("savedList").querySelectorAll(".saved-open").forEach(b => b.addEventListener("click", () => doSearch(b.dataset.w)));
    $("savedList").querySelectorAll(".saved-del").forEach(b => b.addEventListener("click", () => {
      const w = b.dataset.w;
      const card = b.closest(".saved-card");
      if (card){ card.classList.add("vacuuming"); setTimeout(() => removeWord(w), 600); }
      else removeWord(w);
    }));
    $("savedList").querySelectorAll(".saved-syn").forEach(b => b.addEventListener("click", () => doSearch(b.dataset.term)));
    $("savedList").querySelectorAll(".saved-fill").forEach(b => b.addEventListener("click", () => {
      const box = b.parentElement;
      const status = box ? box.querySelector(".saved-fill-status") : null;
      aiFillWord(b.dataset.w, status, b, () => renderSaved());
    }));
  }

  // ===================== EGNA ORD =====================
  const userWordsKey = (u) => `ordkollen_words_${u}`;
  function getUserWords(){ return loadJSON(userWordsKey(currentUser), {}); }
  function setUserWords(uw){
    saveJSON(userWordsKey(currentUser), uw);
    pushCloudProfile(); // Sync profile when custom words change
  }

  function mergeUserWords(){
    const uw = getUserWords();
    for (const w in uw){ ORDBOK[w] = uw[w]; WORDSET.add(w); }
  }
  function parseList(s){ return s.split(",").map(x=>x.trim()).filter(Boolean); }

  function handleAddWord(e){
    e.preventDefault();
    const word = normalize($("addWord").value); const msg = $("addMsg");
    if (!word){ msg.className="text-xs text-rose-500"; msg.textContent="Skriv ett ord."; return; }
    const entry = {
      ordklass: $("addClass").value,
      sentiment: (document.querySelector('input[name=addSent]:checked')||{}).value || "neutral",
      beskrivning: $("addBesk").value.trim(),
      synonymer: parseList($("addSyn").value),
      slang: parseList($("addSlang").value),
      uttryck: parseList($("addUttryck").value),
      idiom: parseList($("addIdiom").value),
    };
    const uw = loadJSON(userWordsKey(currentUser), {});
    uw[word] = entry; setUserWords(uw);
    ORDBOK[word] = entry; WORDSET.add(word);
    if (!WORDLIST.includes(word)) WORDLIST.push(word);
    msg.className="text-xs text-emerald-600"; msg.textContent=`✓ "${word}" sparades! Slår upp det…`;
    $("addForm").reset();
    setTimeout(() => doSearch(word), 600);
  }

  async function aiFill(){
    const word = normalize($("addWord").value); const msg = $("addMsg");
    if (!word){ msg.className="text-xs text-rose-500"; msg.textContent="Skriv ett ord först."; return; }
    if (!getGeminiKey()){ openSettings(); return; }
    msg.className="text-xs text-slate-500"; msg.textContent="🤖 Gemini fyller i…";
    const prompt = `Du är en svensk ordboksexpert. Returnera ENBART giltig JSON (inga kodblock) för ordet "${word}" med exakt dessa nycklar: ordklass (substantiv/verb/adjektiv/adverb), sentiment (positiv/negativ/neutral), beskrivning (kort enkel förklaring på svenska), synonymer (array), slang (array), uttryck (array), idiom (array).`;
    try {
      let txt = await callGemini(prompt);
      txt = txt.replace(/```json|```/g,"").trim();
      const data = JSON.parse(txt);
      if (data.ordklass) $("addClass").value = data.ordklass;
      if (data.beskrivning) $("addBesk").value = data.beskrivning;
      if (data.synonymer) $("addSyn").value = (data.synonymer||[]).join(", ");
      if (data.slang) $("addSlang").value = (data.slang||[]).join(", ");
      if (data.uttryck) $("addUttryck").value = (data.uttryck||[]).join(", ");
      if (data.idiom) $("addIdiom").value = (data.idiom||[]).join(", ");
      const sb = document.querySelector(`input[name=addSent][value="${data.sentiment}"]`); if (sb) sb.checked = true;
      msg.className="text-xs text-emerald-600"; msg.textContent="✓ Ifyllt av Gemini – kontrollera och spara.";
    } catch(err){
      msg.className="text-xs text-rose-500"; msg.textContent="Kunde inte hämta från Gemini: " + err.message;
    }
  }

  // Fyller i ALLA detaljer för ett ord som saknar info (det "gröna/röda" m.m.),
  // sparar det och visar resultatet direkt – förenklat för alla.
  function hasDetailFor(w){
    const d = ORDBOK[w];
    return !!(d && (d.beskrivning || d.ordklass || d.sentiment || (d.synonymer && d.synonymer.length)));
  }

  // Gör själva Gemini-anropet + sparar ordet. Kastar fel (t.ex. 429) vidare.
  async function fillWordCore(word){
    word = normalize(word);
    const prompt = `Du är en svensk ordboksexpert som förklarar enkelt så att alla förstår (även barn). Returnera ENBART giltig JSON (inga kodblock, ingen extra text) för ordet "${word}" med EXAKT dessa nycklar: ordklass (en av: substantiv/verb/adjektiv/adverb), sentiment (en av: positiv/negativ/neutral), beskrivning (mycket enkel förklaring på svenska, max en kort mening), synonymer (array av ord), slang (array), uttryck (array), idiom (array). Om något saknas, använd en tom array [].`;
    let txt = await callGemini(prompt);
    txt = txt.replace(/```json|```/g,"").trim();
    const data = JSON.parse(txt);
    const arr = (v) => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
    const entry = {
      ordklass: data.ordklass || "",
      sentiment: ["positiv","negativ","neutral"].includes(data.sentiment) ? data.sentiment : "neutral",
      beskrivning: (data.beskrivning || "").trim(),
      synonymer: arr(data.synonymer),
      slang: arr(data.slang),
      uttryck: arr(data.uttryck),
      idiom: arr(data.idiom),
    };
    const uw = loadJSON(userWordsKey(currentUser), {});
    uw[word] = entry; setUserWords(uw);
    ORDBOK[word] = entry; WORDSET.add(word);
    if (!WORDLIST.includes(word)) WORDLIST.push(word);
    return entry;
  }

  async function aiFillWord(word, statusEl, btnEl, onDone){
    word = normalize(word);
    if (!word) return;
    if (!getGeminiKey()){ openSettings(); return; }
    const status = statusEl || $("aiWordStatus");
    const btn = btnEl || $("aiWordBtn");
    if (btn){ btn.disabled = true; btn.classList.add("opacity-60"); }
    if (status){ status.className = (status.className||"") + " text-violet-600 dark:text-violet-300"; status.textContent = "🤖 Gemini fyller i alla detaljer…"; }
    try {
      await fillWordCore(word);
      if (typeof onDone === "function") onDone();
      else renderResult(lookup(word));
    } catch(err){
      if (btn){ btn.disabled = false; btn.classList.remove("opacity-60"); }
      if (status){ status.className = "text-xs text-rose-500"; status.textContent = "Kunde inte hämta från Gemini: " + err.message; }
    }
  }

  // ===================== AUTO-FYLL (BAKGRUND) =====================
  let autoFillBusy = false, autoFillStop = false;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function setAutoFillUI(running){
    const stop = $("autoFillStopBtn"), all = $("autoFillAllBtn"), vis = $("autoFillVisibleBtn"), bar = $("autoFillBar");
    if (running){ bar.classList.remove("hidden"); stop.classList.remove("hidden"); }
    else { stop.classList.add("hidden"); }
    [all, vis].forEach(b => { b.disabled = running; b.classList.toggle("opacity-60", running); });
  }

  function visibleBrowseWords(){
    return [...$("browseResult").querySelectorAll(".word-tile")].map(t => t.dataset.w);
  }

  async function autoFill(words){
    if (autoFillBusy) return;
    if (!getGeminiKey()){ openSettings(); return; }
    const status = $("autoFillStatus"), barInner = $("autoFillBarInner");
    const todo = words.filter(w => !hasDetailFor(w));
    if (!todo.length){ status.className = "text-xs mt-2 text-emerald-600"; status.textContent = "✓ Alla dessa ord har redan detaljer."; return; }
    autoFillBusy = true; autoFillStop = false; setAutoFillUI(true);
    barInner.style.width = "0%";
    let done = 0, fail = 0, quota = false;
    for (let i = 0; i < todo.length; i++){
      if (autoFillStop) break;
      try { await fillWordCore(todo[i]); done++; }
      catch(err){
        if (/429|[Kk]vot/.test(err.message)){ quota = true; break; }
        fail++;
      }
      const pct = Math.round((i + 1) / todo.length * 100);
      barInner.style.width = pct + "%";
      status.className = "text-xs mt-2 text-slate-500";
      status.textContent = `🤖 Fyller i… ${done}/${todo.length} klara${fail ? ` (${fail} hoppade över)` : ""}`;
      await sleep(1100);
    }
    autoFillBusy = false; setAutoFillUI(false);
    if (quota){ status.className = "text-xs mt-2 text-rose-500"; status.textContent = `⏸ Kvoten tog slut efter ${done} ord. Byt modell i ⚙️ eller vänta – tryck sedan på knappen igen för att fortsätta där du slutade.`; }
    else if (autoFillStop){ status.className = "text-xs mt-2 text-slate-500"; status.textContent = `⏹ Stoppat. ${done} ord ifyllda – tryck igen för att fortsätta.`; }
    else { status.className = "text-xs mt-2 text-emerald-600"; status.textContent = `✓ Klart! ${done} ord ifyllda${fail ? `, ${fail} kunde inte hämtas` : ""}.`; }
    renderBrowse();
  }

  // ===================== GENERERA ORD (CEFR-nivåer + tema) =====================
  let genItems = [];

  function getGenLevels(){
    return [...document.querySelectorAll("#genLevels input:checked")].map(c => c.value);
  }
  function getGenTheme(){
    const sel = $("genTheme").value;
    if (sel === "__custom") return ($("genCustom").value || "").trim();
    return sel;
  }

  function mergeGenerated(items){
    const uw = loadJSON(userWordsKey(currentUser), {});
    items.forEach(it => {
      const w = normalize(it.ord || "");
      if (!w) return;
      const entry = {
        ordklass: it.ordklass || "",
        sentiment: ["positiv","negativ","neutral"].includes(it.sentiment) ? it.sentiment : "neutral",
        beskrivning: (it.beskrivning || "").trim(),
        synonymer: Array.isArray(it.synonymer) ? it.synonymer.map(x => String(x).trim()).filter(Boolean) : [],
        slang: [], uttryck: [], idiom: [],
        niva: it.niva || "",
      };
      ORDBOK[w] = entry; WORDSET.add(w);
      if (!WORDLIST.includes(w)) WORDLIST.push(w);
      uw[w] = entry;
    });
    setUserWords(uw);
  }

  function genCardHtml(it){
    const w = normalize(it.ord || "");
    const sentMap = { positiv:["sent-pos","🟢 Positivt"], negativ:["sent-neg","🔴 Negativt"], neutral:["sent-neu","⚪ Neutralt"] };
    const sent = sentMap[it.sentiment] || sentMap.neutral;
    const isSaved = getSaved().includes(w);
    const syn = (it.synonymer && it.synonymer.length)
      ? `<div class="flex flex-wrap gap-1.5 mt-2">${it.synonymer.map(t=>`<button class="chip chip-syn gen-syn" data-term="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}</div>` : ``;
    return `<div class="card">
      <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
        <button class="gen-open text-left capitalize font-bold text-lg" data-w="${escapeHtml(w)}">${escapeHtml(w)}</button>
        <div class="flex items-center gap-1.5 shrink-0">
          ${it.niva ? `<span class="level-badge">${escapeHtml(it.niva)}</span>` : ``}
          <span class="sent-badge ${sent[0]}">${sent[1]}</span>
        </div>
      </div>
      ${it.ordklass ? `<div class="text-slate-400 text-xs italic">${escapeHtml(it.ordklass)}</div>` : ``}
      ${it.beskrivning ? `<p class="text-slate-600 dark:text-slate-300 text-sm mt-1">📝 ${escapeHtml(it.beskrivning)}</p>` : ``}
      ${syn}
      <button class="gen-save mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold ${isSaved ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300" : "btn-grad text-white"}" data-w="${escapeHtml(w)}">${isSaved ? "✓ Sparat" : "⭐ Spara"}</button>
    </div>`;
  }

  function renderGenResults(){
    const grid = $("genResult");
    if (!genItems.length){ grid.innerHTML = ""; $("genSaveAllBtn").classList.add("hidden"); return; }
    grid.innerHTML = genItems.map(genCardHtml).join("");
    $("genSaveAllBtn").classList.remove("hidden");
    grid.querySelectorAll(".gen-open").forEach(b => b.addEventListener("click", () => doSearch(b.dataset.w)));
    grid.querySelectorAll(".gen-syn").forEach(b => b.addEventListener("click", () => doSearch(b.dataset.term)));
    grid.querySelectorAll(".gen-save").forEach(b => b.addEventListener("click", () => { toggleSave(b.dataset.w); renderGenResults(); }));
  }

  async function generateWords(){
    if (!getGeminiKey()){ openSettings(); return; }
    const levels = getGenLevels();
    const theme = getGenTheme();
    const count = Math.max(3, Math.min(30, parseInt($("genCount").value || "10", 10)));
    const status = $("genStatus");
    if (!levels.length){ status.className = "text-xs text-rose-500"; status.textContent = "Välj minst en nivå."; return; }
    if (!theme){ status.className = "text-xs text-rose-500"; status.textContent = "Välj eller skriv ett tema."; return; }
    const btn = $("genBtn"); btn.disabled = true; btn.classList.add("opacity-60");
    status.className = "text-xs text-violet-600 dark:text-violet-300"; status.textContent = "✨ Gemini genererar ord…";
    const prompt = `Du är en svensk språklärare. Skapa en ordlista för svenska elever.
Tema: "${theme}". Nivåer (CEFR): ${levels.join(", ")}.
För VARJE vald nivå, ge exakt ${count} vanliga svenska ord som passar nivån och temat (lättare ord på A1/A2, svårare på C1/C2).
Returnera ENBART giltig JSON (ingen extra text, inga kodblock): en array av objekt med EXAKT nycklarna:
ord (svenska), niva (en av: ${levels.join("/")}), ordklass (substantiv/verb/adjektiv/adverb), sentiment (en av: positiv/negativ/neutral), beskrivning (mycket enkel förklaring på svenska, max en kort mening), synonymer (array av ord, får vara tom []).`;
    try {
      let txt = await callGemini(prompt);
      txt = txt.replace(/```json|```/g,"").trim();
      const data = JSON.parse(txt);
      genItems = Array.isArray(data) ? data.filter(x => x && x.ord) : [];
      if (!genItems.length) throw new Error("Inga ord i svaret.");
      mergeGenerated(genItems);
      renderGenResults();
      status.className = "text-xs text-emerald-600";
      status.textContent = `✓ ${genItems.length} ord skapade (${levels.join(", ")}). Klicka ett ord för mer, eller spara.`;
    } catch(err){
      status.className = "text-xs text-rose-500"; status.textContent = "Kunde inte generera: " + err.message;
    } finally {
      btn.disabled = false; btn.classList.remove("opacity-60");
    }
  }

  function saveAllGenerated(){
    if (!genItems.length) return;
    addToSaved(genItems.map(it => normalize(it.ord||"")));
    renderGenResults();
    $("genStatus").className = "text-xs text-emerald-600";
    $("genStatus").textContent = `⭐ Alla ${genItems.length} ord sparade.`;
  }

  // ===================== SLUMPA 5 ORD =====================
  let randomItems = [];

  function randomCardHtml(it){
    const w = normalize(it.ord || "");
    const sentMap = { positiv:["sent-pos","🟢 Positivt"], negativ:["sent-neg","🔴 Negativt"], neutral:["sent-neu","⚪ Neutralt"] };
    const sent = sentMap[it.sentiment] || sentMap.neutral;
    const isSaved = getSaved().includes(w);
    const syn = (it.synonymer && it.synonymer.length)
      ? `<div class="flex flex-wrap gap-1.5 mt-2">${it.synonymer.slice(0,6).map(t=>`<span class="chip chip-syn">${escapeHtml(t)}</span>`).join("")}</div>` : ``;
    return `<div class="card">
      <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
        <span class="capitalize font-bold text-lg">${escapeHtml(w)}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          ${it.niva ? `<span class="level-badge">${escapeHtml(it.niva)}</span>` : ``}
          <span class="sent-badge ${sent[0]}">${sent[1]}</span>
        </div>
      </div>
      ${it.ordklass ? `<div class="text-slate-400 text-xs italic">${escapeHtml(it.ordklass)}</div>` : ``}
      ${it.beskrivning ? `<p class="text-slate-600 dark:text-slate-300 text-sm mt-1">📝 ${escapeHtml(it.beskrivning)}</p>` : ``}
      ${syn}
      <button class="rnd-save mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold ${isSaved ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300" : "btn-grad text-white"}" data-w="${escapeHtml(w)}">${isSaved ? "✓ Sparat" : "⭐ Spara"}</button>
    </div>`;
  }

  function renderRandomCards(){
    const grid = $("randomCards");
    grid.innerHTML = randomItems.map(randomCardHtml).join("");
    grid.querySelectorAll(".rnd-save").forEach(b => b.addEventListener("click", () => {
      const w = b.dataset.w;
      const it = randomItems.find(x => normalize(x.ord||"") === w);
      if (getSaved().includes(w)) setSaved(getSaved().filter(x => x !== w));
      else if (it){ mergeGenerated([it]); addToSaved([w]); }
      renderRandomCards(); renderSaved();
    }));
  }

  async function generateRandomCards(){
    if (!getGeminiKey()){ openSettings(); return; }
    const sub = $("randomSub");
    sub.className = "text-violet-600 dark:text-violet-300 text-xs mb-3";
    sub.textContent = "🎲 Gemini slumpar fram ord…";
    $("randomCards").innerHTML = `<p class="text-slate-400 text-sm col-span-full">🎲 Hämtar…</p>`;
    const prompt = `Du är en kreativ svensk språklärare. Välj SJÄLV ett slumpmässigt vardagligt tema och ge exakt 5 svenska ord.
Varje ord ska ha en slumpmässig CEFR-nivå mellan A1 och C2 (blanda nivåerna).
Returnera ENBART giltig JSON (ingen extra text, inga kodblock): en array med 5 objekt med EXAKT nycklarna:
ord (svenska), niva (en av: A1/A2/B1/B2/C1/C2), ordklass (substantiv/verb/adjektiv/adverb), sentiment (positiv/negativ/neutral), beskrivning (mycket enkel förklaring på svenska, max en kort mening), synonymer (array av ord, får vara tom []).`;
    try {
      let txt = await callGemini(prompt);
      txt = txt.replace(/```json|```/g,"").trim();
      const data = JSON.parse(txt);
      randomItems = (Array.isArray(data) ? data : []).filter(x => x && x.ord).slice(0,5);
      if (!randomItems.length) throw new Error("Inga ord i svaret.");
      sub.className = "text-slate-500 dark:text-slate-400 text-xs mb-3";
      sub.textContent = "Välj de ord du vill spara ⭐. Resten försvinner när du stänger.";
      renderRandomCards();
    } catch(err){
      sub.className = "text-rose-500 text-xs mb-3";
      sub.textContent = "Kunde inte slumpa: " + err.message;
      $("randomCards").innerHTML = "";
    }
  }

  function openRandom(){
    if (!getGeminiKey()){ openSettings(); return; }
    randomItems = [];
    $("randomModal").classList.remove("hidden");
    generateRandomCards();
  }
  function closeRandom(){ $("randomModal").classList.add("hidden"); randomItems = []; }

  // ===================== GEMINI =====================
  const LS_GKEY = "ordkollen_gemini_key";
  const LS_GMODEL = "ordkollen_gemini_model";
  function getGeminiKey(){ return localStorage.getItem(LS_GKEY) || ""; }
  function getGeminiModel(){ return localStorage.getItem(LS_GMODEL) || "gemini-3.1-flash-lite"; }
  // OpenAI (ChatGPT) - anvands av "Miljo & kontext" (context.js)
  const LS_OKEY = "ordkollen_openai_key";
  const LS_OMODEL = "ordkollen_openai_model";
  function getOpenaiKey(){ return localStorage.getItem(LS_OKEY) || ""; }
  function getOpenaiModel(){ return localStorage.getItem(LS_OMODEL) || "gpt-4o-mini"; }
  function refreshKeyStatus(){
    const st = $("keyStatus"); if (!st) return;
    if (getGeminiKey()){ st.className = "text-[11px] mt-1 text-emerald-600"; st.textContent = "✓ En nyckel är sparad."; }
    else { st.className = "text-[11px] mt-1 text-slate-400"; st.textContent = "Ingen nyckel sparad."; }
  }
  function openSettings(){ $("geminiKey").value = getGeminiKey(); $("geminiModel").value = getGeminiModel(); $("showKey").checked = false; $("geminiKey").type = "password"; if ($("openaiKey")) { $("openaiKey").value = getOpenaiKey(); $("openaiKey").type = "password"; } if ($("openaiModel")) $("openaiModel").value = getOpenaiModel(); if ($("showOpenaiKey")) $("showOpenaiKey").checked = false; refreshKeyStatus(); $("settingsModal").classList.remove("hidden"); }
  function closeSettings(){ $("settingsModal").classList.add("hidden"); }
  function saveKey(){ localStorage.setItem(LS_GKEY, $("geminiKey").value.trim()); localStorage.setItem(LS_GMODEL, $("geminiModel").value); if ($("openaiKey")) localStorage.setItem(LS_OKEY, $("openaiKey").value.trim()); if ($("openaiModel")) localStorage.setItem(LS_OMODEL, $("openaiModel").value); refreshKeyStatus(); closeSettings(); }
  function clearKey(){ localStorage.removeItem(LS_GKEY); $("geminiKey").value = ""; localStorage.removeItem(LS_OKEY); if ($("openaiKey")) $("openaiKey").value = ""; refreshKeyStatus(); }
  function toggleShowKey(){ $("geminiKey").type = $("showKey").checked ? "text" : "password"; }
  function toggleShowOpenaiKey(){ if ($("openaiKey")) $("openaiKey").type = $("showOpenaiKey").checked ? "text" : "password"; }

  async function callGemini(prompt){
    const key = getGeminiKey();
    if (!key) throw new Error("Ingen API-nyckel. Klicka ⚙️ för att lägga in din Gemini-nyckel.");
    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) });
    if (res.status === 429) throw new Error("Kvoten är slut (429) för modellen " + model + ". Öppna ⚙️ och byt till en annan modell (t.ex. Flash-Lite), eller vänta en stund.");
    if (!res.ok){ const t = await res.text(); throw new Error("API-fel (" + res.status + "). " + t.slice(0,120)); }
    const j = await res.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || "(tomt svar)";
  }

  // ===================== CHAT =====================
  function seedChat(){ if (!$("chatMessages").children.length) addMsg("Hej! 🤖 Jag är din Gemini-assistent. Fråga mig om synonymer, slang, uttryck, idiom eller om ett ord är positivt/negativt. (Kräver en Gemini-nyckel via ⚙️.)", "bot"); }
  function openChat(){ seedChat(); $("chatPanel").classList.remove("hidden"); $("chatText").focus(); }
  function closeChat(){ $("chatPanel").classList.add("hidden"); }
  function toggleChat(){ seedChat(); $("chatPanel").classList.toggle("hidden"); if (!$("chatPanel").classList.contains("hidden")) $("chatText").focus(); }
  function addMsg(text, who){
    const div = document.createElement("div");
    div.className = "msg " + (who==="user" ? "msg-user" : "msg-bot");
    div.textContent = text; $("chatMessages").appendChild(div);
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
    return div;
  }
  async function askGemini(prompt){
    if (!getGeminiKey()){ addMsg("Lägg först in din Gemini-nyckel via ⚙️ uppe till höger.", "bot"); openSettings(); return; }
    addMsg(prompt, "user");
    const loading = addMsg("🤖 Tänker…", "bot");
    try {
      var persona = "";
      try { persona = (window.OK_personaPrefix && window.OK_personaPrefix()) || ""; } catch (e) {}
      const ctx = "Du är en hjälpsam svensk ordbok-assistent. Svara kort och tydligt på svenska. Hjälp med synonymer, slang, uttryck, idiom, betydelser och om ord är positiva/negativa." + persona + "\n\nFråga: ";
      const ans = await callGemini(ctx + prompt);
      loading.textContent = ans;
    } catch(err){ loading.textContent = "⚠️ " + err.message; }
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
  }
  function handleChatSubmit(e){
    e.preventDefault();
    const t = $("chatText").value.trim(); if (!t) return;
    $("chatText").value = ""; askGemini(t);
  }

  // ===================== INIT =====================
  function init(){
    $("tabLogin").addEventListener("click", () => setAuthMode("login"));
    $("tabRegister").addEventListener("click", () => setAuthMode("register"));
    $("authForm").addEventListener("submit", handleAuthSubmit);
    $("logoutBtn").addEventListener("click", logout);
    $("searchBtn").addEventListener("click", () => renderResult(lookup($("searchInput").value)));
    $("searchInput").addEventListener("keydown", e => { if (e.key==="Enter") renderResult(lookup($("searchInput").value)); });
    $("patternBtn").addEventListener("click", runPattern);
    $("patternInput").addEventListener("keydown", e => { if (e.key==="Enter") runPattern(); });
    $("removeSelectedBtn").addEventListener("click", removeSelected);
    $("removeAllBtn").addEventListener("click", removeAll);
    document.querySelectorAll(".navtab").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));

    // Auto-fyll
    $("autoFillVisibleBtn").addEventListener("click", () => autoFill(visibleBrowseWords()));
    $("autoFillAllBtn").addEventListener("click", () => {
      if (confirm("Fyll i ALLA saknade ord? Ordlistan har ~118 000 ord – det tar mycket lång tid, slår troligen i kvoten och kanske inte får plats i webbläsaren. Du kan stoppa och återuppta när som helst. Fortsätta?"))
        autoFill(WORDLIST.slice());
    });
    $("autoFillStopBtn").addEventListener("click", () => { autoFillStop = true; });

    // Generera ord
    $("genBtn").addEventListener("click", generateWords);
    $("genSaveAllBtn").addEventListener("click", saveAllGenerated);
    $("genTheme").addEventListener("change", () => {
      $("genCustomWrap").classList.toggle("hidden", $("genTheme").value !== "__custom");
      if ($("genTheme").value === "__custom") $("genCustom").focus();
    });
    // Slumpa 5 ord
    $("randomBtn").addEventListener("click", openRandom);
    $("randomClose").addEventListener("click", closeRandom);
    $("randomDoneBtn").addEventListener("click", closeRandom);
    $("randomMoreBtn").addEventListener("click", generateRandomCards);
    $("randomModal").addEventListener("click", e => { if (e.target.id === "randomModal") closeRandom(); });

    // Lägg till ord
    $("addForm").addEventListener("submit", handleAddWord);
    $("aiFillBtn").addEventListener("click", aiFill);
    // Inställningar
    $("settingsBtn").addEventListener("click", openSettings);
    $("settingsClose").addEventListener("click", closeSettings);
    $("saveKeyBtn").addEventListener("click", saveKey);
    $("clearKeyBtn").addEventListener("click", clearKey);
    $("showKey").addEventListener("change", toggleShowKey);
  if ($("showOpenaiKey")) $("showOpenaiKey").addEventListener("change", toggleShowOpenaiKey);
    $("settingsModal").addEventListener("click", e => { if (e.target.id==="settingsModal") closeSettings(); });
    // Chat
    $("chatToggle").addEventListener("click", toggleChat);
    $("chatClose").addEventListener("click", closeChat);
    $("chatForm").addEventListener("submit", handleChatSubmit);

    initGoogle();

    // Firebase: håll kvar inloggningen mellan besök (sparad session i molnet).
    if (window.firebase && firebase.auth) {
      try {
        firebase.auth().onAuthStateChanged((u) => {
          if (!u) return;
          if (!currentUser) {
            finishFirebaseLogin(u, u.displayName || (u.email ? u.email.split("@")[0] : "Användare"));
          } else if (!cloudReady) {
            // Sessionen återställdes redan lokalt – starta molnsynken ändå.
            syncCloudWords();
          }
        });
      } catch (e) {}
    }

    const session = loadJSON(LS_SESSION, null);
    const users = loadJSON(LS_USERS, {});
    if (session && users[session]) login(users[session].name, session);
    else setAuthMode("login");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
