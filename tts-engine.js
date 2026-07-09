/* =========================================================================
   Ordkollen – TTS-MOTOR (hybrid "smart switcher") – FRISTÅENDE LAGER
   -------------------------------------------------------------------------
   Samma idé som Python-skriptet (USE_ELEVENLABS): en knapp växlar mellan
     • GRATIS  = webbläsarens inbyggda tal (Web Speech API) – standard
     • PREMIUM = riktiga ElevenLabs-röster via deras REST-API
   (Edge-TTS / Python-SDK kan inte köras i en webbläsare – därför används
    Web Speech som gratismotor här. Se tools/tts_switcher.py för offline-läge.)

   Exponerar window.OK_TTS som extras.js och gemini-live.js använder.
   Nycklar sparas ENDAST lokalt (localStorage), aldrig i repot.
   ========================================================================= */
(function () {
  "use strict";

  var LS_ENGINE = "ordkollen_tts_engine";      // "free" | "elevenlabs"
  var LS_KEY    = "ordkollen_elevenlabs_key";  // ElevenLabs API-nyckel
  var LS_VOICE  = "ordkollen_elevenlabs_voice";// valfritt: tvinga ETT röst-ID
  var LS_MODEL  = "ordkollen_elevenlabs_model";

  function lget(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Namngivna röster → ElevenLabs standard-röst-ID (kan bytas i Inställningar).
  var MAP = {
    Capella: "21m00Tcm4TlvDq8ikWAM", // Rachel  (varm, kvinna)
    Glow:    "EXAVITQu4vr4xnSDxMaL", // Bella   (ljus, kvinna)
    Flare:   "AZnzlk1XvdvUeBnXmlld", // Domi    (energisk, kvinna)
    Orbit:   "MF3mGyEYCl7XYWbV9V6O", // Elli    (lugn)
    Orion:   "VR6AewLTigWG4xSOukaG", // Arnold  (djup, man)
    Dipper:  "jsCqWAovK2LkecY7zXl4", // Freya   (lekfull, kvinna)
    Pegasus: "pNInz6obpgDQGcFmaJgB", // Adam    (mjuk, man)
    Ursa:    "yoZ06aMxZJJ28mfd3POQ", // Sam     (mörk, man)
    Vega:    "21m00Tcm4TlvDq8ikWAM", // Rachel  (klar, kvinna)
    Eclipse: "TxGEqnHWrfWFTfGW9XjX"  // Josh    (dämpad, man)
  };
  var DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
  function model() { return lget(LS_MODEL) || "eleven_turbo_v2_5"; }

  function engine() { return lget(LS_ENGINE) === "elevenlabs" ? "elevenlabs" : "free"; }
  function key() { return lget(LS_KEY); }
  function enabled() { return engine() === "elevenlabs" && !!key(); }

  function voiceIdFor(name) {
    var forced = lget(LS_VOICE);
    if (forced) return forced;
    if (!name) return DEFAULT_VOICE;
    name = String(name).replace(/^gem:/, "");
    return MAP[name] || DEFAULT_VOICE;
  }

  var audio = null;
  function stop() {
    try { if (audio) { audio.pause(); audio = null; } } catch (e) {}
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  }

  // Anropar ElevenLabs och spelar upp mp3:n. Returnerar ett Promise som
  // avvisas vid fel så anroparen kan falla tillbaka på gratis-rösten.
  function playPremium(text, voiceId, hooks) {
    hooks = hooks || {};
    var k = key();
    if (!k) return Promise.reject(new Error("no-key"));
    var url = "https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId || DEFAULT_VOICE);
    return fetch(url, {
      method: "POST",
      headers: { "xi-api-key": k, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({
        text: text,
        model_id: model(),
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error("eleven " + r.status + " " + String(t).slice(0, 120)); });
        return r.blob();
      })
      .then(function (blob) {
        stop();
        var u = URL.createObjectURL(blob);
        audio = new Audio(u);
        if (hooks.onstart) audio.addEventListener("playing", hooks.onstart, { once: true });
        audio.addEventListener("ended", function () { URL.revokeObjectURL(u); if (hooks.onend) hooks.onend(); });
        audio.addEventListener("error", function () { URL.revokeObjectURL(u); if (hooks.onend) hooks.onend(); });
        return audio.play();
      });
  }

  window.OK_TTS = {
    engine: engine, key: key, enabled: enabled,
    voiceIdFor: voiceIdFor, playPremium: playPremium, stop: stop, MAP: MAP
  };

  /* ---------------- Inställnings-UI (kopplas till fälten i modalen) -------- */
  function wireSettings() {
    var cb = document.getElementById("ttsUseEleven");
    var keyEl = document.getElementById("elevenKey");
    var showEl = document.getElementById("showElevenKey");
    var voiceEl = document.getElementById("elevenVoice");

    if (cb && !cb.dataset.wired) {
      cb.dataset.wired = "1";
      cb.checked = engine() === "elevenlabs";
      cb.addEventListener("change", function () { lset(LS_ENGINE, cb.checked ? "elevenlabs" : "free"); });
    }
    if (keyEl && !keyEl.dataset.wired) {
      keyEl.dataset.wired = "1";
      keyEl.value = key();
      keyEl.addEventListener("input", function () { lset(LS_KEY, keyEl.value.trim()); });
    }
    if (showEl && keyEl && !showEl.dataset.wired) {
      showEl.dataset.wired = "1";
      showEl.addEventListener("change", function () { keyEl.type = showEl.checked ? "text" : "password"; });
    }
    if (voiceEl && !voiceEl.dataset.wired) {
      voiceEl.dataset.wired = "1";
      voiceEl.value = lget(LS_VOICE);
      voiceEl.addEventListener("input", function () { lset(LS_VOICE, voiceEl.value.trim()); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireSettings);
  else wireSettings();
  setInterval(wireSettings, 2000); // säkerhetsnät om modalen byggs sent
})();
