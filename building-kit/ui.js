// The console chrome every building-system page shares: the palette, the Japanese font stack (the bundled fonts are
// Latin only, so Japanese falls through to the system's), panels with a numbered header, buttons, the operator's
// cursor and click ring. Fixed 1600 x 900 layout, as in the teardown examples.
export const C = {
  ink: '#262420',
  sub: '#5f584e',
  mute: '#8f8577',
  faint: '#d8cfc1',
  line: '#e6ddcf',
  panel: 'rgba(252,250,246,.95)',
  btn: '#fffdf9',
  bg: '#efe9df',
  accent: '#e3562a',
  ok: '#2f9b67',
};
export const JP = `'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif`;
export const SANS = `Inter,${JP}`;
export const MONO = `'JetBrains Mono',${JP}`;

const CSS = `
html,body{background:${C.bg}}
#app{font-family:${SANS};color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:${MONO}}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(110,90,60,.08)}
.ph{position:absolute;display:flex;align-items:center;gap:8px;font:700 15px ${SANS};letter-spacing:.06em;white-space:nowrap}
.ph i{display:block;width:3px;height:15px;background:${C.accent}}
.pn{position:absolute;font:500 11px ${MONO};color:${C.mute};letter-spacing:1px}
.sm{font:500 13px ${SANS};letter-spacing:.04em;color:${C.mute};white-space:nowrap}
.bt{position:absolute;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:5px;background:${C.btn};font:700 14px ${SANS};letter-spacing:.04em;color:${C.ink};white-space:nowrap}
.call{position:absolute;white-space:nowrap}
.call b{display:flex;align-items:center;gap:7px;font:700 16px ${SANS};color:${C.ink};text-shadow:0 0 4px ${C.bg},0 0 8px ${C.bg}}
.call b i{display:block;width:7px;height:7px;background:${C.accent}}
.call span{display:block;font:500 13px ${SANS};color:${C.sub};margin:2px 0 0 14px;text-shadow:0 0 4px ${C.bg},0 0 8px ${C.bg}}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:1.6px solid ${C.accent};opacity:0;z-index:49}
`;

export const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

/** The overlay root with add(html), panel(x, y, w, h, title, n), onBtn(node, on) and the cursor's pointer(c). */
export function createChrome(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el(`<div class="ui"></div>`);
  app.appendChild(root);
  const add = (h) => {
    const n = el(h);
    root.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 12}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };
  const onBtn = (b, on) => {
    b.style.background = on ? C.accent : C.btn;
    b.style.color = on ? '#fff' : C.ink;
    b.style.borderColor = on ? C.accent : C.faint;
  };
  // the cursor and its ring go on last so they sit above everything
  const late = () => {
    const ring = add(`<div class="ring"></div>`);
    const cur = add(`<div class="cur"><svg width="24" height="24" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
    return (c) => {
      cur.style.display = c.x < 0 ? 'none' : 'block';
      cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
      ring.style.left = `${c.ringX}px`;
      ring.style.top = `${c.ringY}px`;
      ring.style.opacity = String(c.ring * 0.85);
      ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
    };
  };
  const centre = (n) => {
    const x = parseFloat(n.style.left) + parseFloat(n.style.width) / 2;
    const y = parseFloat(n.style.top) + parseFloat(n.style.height) / 2;
    return [x, y];
  };
  return {root, add, panel, onBtn, late, centre};
}
