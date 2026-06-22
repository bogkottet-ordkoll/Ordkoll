/* =========================================================================
   Ordkollen – MAGI (ljud + konfetti) – FRISTÅENDE LAGER
   Den flytande ägg-/drakmaskoten är BORTTAGEN på begäran.
   Kvar finns bara ljud- och konfettieffekterna eftersom labb-spelen
   (lab.js) använder window.OK_playSound och window.OK_fireConfetti.
   ========================================================================= */
(function () {
  "use strict";

  /* ---------------- Ljud ---------------- */
  let actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  window.OK_playSound = function (type) {
    const c = ac(); if (!c) return;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    const now = c.currentTime;
    if (type === "pop") {
      osc.type = "sine"; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12); osc.start(now); osc.stop(now + 0.12);
    } else if (type === "win") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(600, now + 0.1); osc.frequency.setValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.45); osc.start(now); osc.stop(now + 0.45);
    } else if (type === "lose") {
      osc.type = "sawtooth"; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(90, now + 0.3);
      gain.gain.setValueAtTime(0.25, now); gain.gain.linearRampToValueAtTime(0, now + 0.3); osc.start(now); osc.stop(now + 0.3);
    }
  };

  /* ---------------- Konfetti ---------------- */
  window.OK_fireConfetti = function () {
    window.OK_playSound("win");
    const colors = ["#1a73e8", "#ea4335", "#fbbc04", "#34a853"];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement("div");
      c.className = "ok-confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.top = "-12px";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (Math.random() * 2 + 2) + "s";
      c.style.animationDelay = (Math.random() * 0.4) + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  };
})();
