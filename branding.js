/* =========================================================================
   Ordkollen – EGEN LOGOTYP (branding)
   Byt ut den regnbågsfärgade logotypen mot: egen färg + symbol, eller en
   egen uppladdad bild. Tillämpas på header, login och footer.
   Sparas lokalt (localStorage). Fristående lager.
   ========================================================================= */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LS = "ordkollen_logo";
  const DEF = { style: "rainbow", color: "#1a73e8", symbol: "📖", image: "" };

  function load() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(LS) || "{}")); } catch { return { ...DEF }; } }
  function store(v) { try { localStorage.setItem(LS, JSON.stringify(v)); if(window.pushCloudProfile) window.pushCloudProfile(); } catch {} }

  function contrast(hex) {
    try {
      const c = hex.replace("#", "");
      const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#202124" : "#ffffff";
    } catch { return "#fff"; }
  }

  function applyTo(badge, cfg) {
    badge.classList.remove("has-image");
    badge.style.background = ""; badge.style.color = ""; badge.innerHTML = "";
    if (cfg.style === "image" && cfg.image) {
      badge.classList.add("has-image");
      const img = document.createElement("img");
      img.src = cfg.image; img.alt = "Logotyp";
      badge.appendChild(img);
    } else if (cfg.style === "color") {
      badge.style.background = cfg.color;
      badge.style.backgroundImage = "none";
      badge.style.color = contrast(cfg.color);
      badge.textContent = cfg.symbol || "📖";
    } else { // rainbow – låt CSS conic-gradient gälla
      badge.textContent = cfg.symbol || "📖";
    }
  }
  function applyAll(cfg) {
    document.querySelectorAll(".logo-badge").forEach(b => { if (b.id === "okLogoPreview") return; applyTo(b, cfg); });
  }

  function toast(m) {
    const t = $("okToast"); if (!t) return;
    t.textContent = m; t.classList.add("show");
    clearTimeout(t._bt); t._bt = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function downscale(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128, cv = document.createElement("canvas");
        cv.width = size; cv.height = size;
        const ctx = cv.getContext("2d");
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        try { cb(cv.toDataURL("image/png")); } catch { cb(reader.result); }
      };
      img.onerror = () => cb(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function init() {
    let cfg = load();
    applyAll(cfg);

    const stylesBox = $("okLogoStyles");
    if (!stylesBox) return; // drawer-UI saknas – men logotypen är redan applicerad

    const preview = $("okLogoPreview");
    const colorWrap = $("okLogoColorWrap"), symbolWrap = $("okLogoSymbolWrap"), imageWrap = $("okLogoImageWrap");
    const colorInp = $("okLogoColor"), symbolInp = $("okLogoSymbol"), imageInp = $("okLogoImage");
    let draft = Object.assign({}, cfg);

    function syncUI() {
      stylesBox.querySelectorAll(".ok-logo-style").forEach(b => b.classList.toggle("sel", b.dataset.style === draft.style));
      colorWrap.style.display = draft.style === "color" ? "" : "none";
      symbolWrap.style.display = draft.style === "image" ? "none" : "";
      imageWrap.style.display = draft.style === "image" ? "" : "none";
      colorInp.value = draft.color || "#1a73e8";
      if (document.activeElement !== symbolInp) symbolInp.value = draft.symbol || "";
      applyTo(preview, draft);
    }

    stylesBox.querySelectorAll(".ok-logo-style").forEach(b =>
      b.addEventListener("click", () => { draft.style = b.dataset.style; syncUI(); }));
    colorInp.addEventListener("input", () => { draft.color = colorInp.value; draft.style = "color"; syncUI(); });
    symbolInp.addEventListener("input", () => { draft.symbol = symbolInp.value; syncUI(); });
    imageInp.addEventListener("change", () => {
      const f = imageInp.files && imageInp.files[0];
      if (!f) return;
      downscale(f, (data) => { draft.image = data; draft.style = "image"; syncUI(); });
    });

    $("okLogoSave").addEventListener("click", () => {
      if (draft.style === "image" && !draft.image) { toast("Välj en bild först"); return; }
      cfg = Object.assign({}, draft); store(cfg); applyAll(cfg); toast("🎨 Logotyp sparad");
    });
    $("okLogoReset").addEventListener("click", () => {
      draft = { ...DEF }; cfg = { ...DEF }; store(cfg); applyAll(cfg); syncUI(); toast("↩️ Återställd till regnbåge");
    });

    syncUI();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
