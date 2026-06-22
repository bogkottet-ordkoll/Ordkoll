:root{
  --glass: rgba(255,255,255,0.12);
  --glass-strong: rgba(255,255,255,0.24);
  --stroke: rgba(255,255,255,0.30);
  --txt:#f4f7fb;
  --accent:#5fd0e6;
  --accent2:#ff8fb0;
  --blur: 16px;
  font-family: ui-sans-serif,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;width:100%;overflow:hidden;background:#05080c}
svg{width:60%;height:60%;fill:currentColor;display:block}

/* ---- PLAYER fills viewport on every device ---- */
.player{
  position:fixed;inset:0;width:100%;height:100%;
  height:100dvh;background:#05080c;overflow:hidden;
}
#video{
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:contain;        /* show the WHOLE frame, never over-zoom */
  background:#05080c;display:block;
}

/* ---- label tags ---- */
.label-layer{position:absolute;inset:0;z-index:5;display:none}
.player.mode-label .label-layer,.player.mode-hd .label-layer{display:block}
.tag{position:absolute;transform:translate(-50%,-50%) scale(.7);
  color:#fff;font-weight:600;font-size:clamp(12px,3.6vw,15px);
  text-shadow:0 2px 14px rgba(0,0,0,.9);opacity:0;pointer-events:none;
  white-space:nowrap;transition:opacity .45s,transform .5s cubic-bezier(.2,.9,.2,1)}
.tag .pin{display:inline-block;width:9px;height:9px;border-radius:50%;
  background:var(--accent);margin-right:7px;box-shadow:0 0 12px var(--accent);vertical-align:middle}
.tag.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.tag.hide{opacity:0;transform:translate(-50%,-60%) scale(1.05)}

.flash{position:absolute;inset:0;z-index:30;pointer-events:none;opacity:0;transition:opacity .4s}
.flash.go{opacity:1;background:radial-gradient(120% 120% at 50% 50%,rgba(255,255,255,.25),transparent 75%)}

/* ---- top bar ---- */
.topbar{position:absolute;top:0;left:0;right:0;z-index:20;
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:max(10px,env(safe-area-inset-top)) 12px 10px;
  background:linear-gradient(180deg,rgba(5,8,12,.55),transparent)}
.brand{font-weight:700;font-size:clamp(13px,3.6vw,16px);text-shadow:0 2px 8px rgba(0,0,0,.6)}
.mode-pills{display:flex;gap:6px}
.pill{border:1px solid var(--stroke);color:var(--txt);background:var(--glass);
  backdrop-filter:blur(var(--blur));-webkit-backdrop-filter:blur(var(--blur));
  padding:7px 12px;border-radius:999px;font-size:clamp(11px,3vw,13px);font-weight:600;
  cursor:pointer;transition:.3s;white-space:nowrap}
.pill.ghost{background:transparent;opacity:.7}
.pill.active{background:var(--glass-strong);box-shadow:0 4px 18px rgba(95,208,230,.25)}

.hint{position:absolute;z-index:25;top:56px;left:50%;transform:translateX(-50%) translateY(-6px);
  background:rgba(8,12,18,.6);backdrop-filter:blur(12px);border:1px solid var(--stroke);
  padding:7px 14px;border-radius:999px;font-size:12px;opacity:0;transition:.35s}
.hint.show{opacity:1;transform:translateX(-50%) translateY(0)}

/* ---- AI overview ---- */
.ai-overview{position:absolute;z-index:22;right:12px;top:54px;width:min(280px,72vw);
  background:var(--glass);backdrop-filter:blur(var(--blur));-webkit-backdrop-filter:blur(var(--blur));
  border:1px solid var(--stroke);border-radius:16px;padding:12px 14px;
  opacity:0;transform:translateY(-8px) scale(.98);pointer-events:none;transition:.45s}
.ai-overview.show{opacity:1;transform:none}
.ov-head{font-weight:700;font-size:12.5px;display:flex;align-items:center;gap:7px;margin-bottom:6px}
.ov-head .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.ov-body{font-size:12px;line-height:1.5;opacity:.92}

/* ---- control bar ---- */
.controlbar{position:absolute;z-index:20;left:10px;right:10px;
  bottom:max(10px,env(safe-area-inset-bottom));
  display:flex;align-items:center;gap:6px;
  background:var(--glass);backdrop-filter:blur(var(--blur));-webkit-backdrop-filter:blur(var(--blur));
  border:1px solid var(--stroke);border-radius:16px;padding:7px 9px}
.cbtn{flex:0 0 auto;border:none;background:rgba(255,255,255,.08);color:var(--txt);
  width:clamp(34px,9vw,40px);height:clamp(34px,9vw,40px);border-radius:11px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:.2s}
.cbtn:hover,.cbtn:active{background:rgba(255,255,255,.2)}
.scrub{flex:1 1 auto;min-width:30px;height:6px;border-radius:6px;background:rgba(255,255,255,.18);position:relative;cursor:pointer;overflow:hidden}
.scrub-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:6px}
.time{flex:0 0 auto;font-size:11px;opacity:.85;min-width:30px;text-align:center;font-variant-numeric:tabular-nums}

/* ---- settings ---- */
.settings{position:absolute;z-index:24;right:10px;left:auto;
  bottom:max(60px,calc(env(safe-area-inset-bottom) + 56px));
  width:min(300px,86vw);max-height:70vh;overflow:auto;
  background:rgba(14,20,28,.82);backdrop-filter:blur(var(--blur));-webkit-backdrop-filter:blur(var(--blur));
  border:1px solid var(--stroke);border-radius:16px;padding:14px;
  opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:.3s}
.settings.show{opacity:1;transform:none;pointer-events:auto}
.set-head{font-weight:700;font-size:13px;margin-bottom:10px}
.set-row{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;margin:10px 0 5px}
.aa-val{font-weight:700;color:var(--accent)}
select,input[type=password]{width:100%;padding:9px 10px;border-radius:10px;
  border:1px solid var(--stroke);background:rgba(255,255,255,.06);color:var(--txt);font-size:13px;outline:none}
select option{background:#11161e;color:#fff}
input[type=range]{width:100%;accent-color:var(--accent);height:6px}
.aa-ticks{display:flex;justify-content:space-between;font-size:10px;opacity:.6;margin-top:3px}
.set-note{font-size:11px;opacity:.7;margin-top:6px;line-height:1.4}
.toggle-row{margin-top:12px}.toggle-row small{opacity:.6}
.switch{width:42px;height:24px;border-radius:999px;border:1px solid var(--stroke);background:rgba(255,255,255,.1);position:relative;cursor:pointer;transition:.3s;flex:0 0 auto}
.switch span{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.3s}
.switch.on{background:rgba(95,208,230,.55)}.switch.on span{left:21px}

/* ---- capture modal ---- */
.capture-result{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(5,8,12,.7);backdrop-filter:blur(6px)}
.capture-result.show{display:flex}
.cap-card{width:min(560px,100%);background:rgba(18,24,32,.92);border:1px solid var(--stroke);border-radius:18px;padding:16px}
.cap-head{font-weight:700;margin-bottom:10px;font-size:14px}
.cap-head span{opacity:.6;font-weight:400;font-size:11px;margin-left:6px}
#capImg{width:100%;border-radius:10px;display:block;background:#000;max-height:55vh;object-fit:contain}
.cap-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.cap-btn{border:1px solid var(--stroke);background:rgba(255,255,255,.08);color:var(--txt);padding:10px 16px;border-radius:11px;font-weight:600;font-size:12.5px;cursor:pointer;text-decoration:none;transition:.2s}
.cap-btn.primary{background:linear-gradient(90deg,var(--accent),#7fc8e6);color:#06222a;border:none}
.cap-btn.ghost{opacity:.75}
