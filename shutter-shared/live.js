// The shutter as a page you drive: the film's shutter, studio and console in real time. The push buttons (開ける・止める
// ・閉める), the obstacle, the manual opening slider; the three views, the two isolates, the cutaway and the labels; an
// orbit you drag and a zoom on the wheel. Left alone it plays the film's script as an auto tour with the operator's
// cursor, looped; a click, drag, wheel or key hands control to the visitor, who takes over the shutter where the tour
// left it (the tour's presses replayed into a plan up to that moment, then the visitor's presses appended to it in
// real time); 25 s of quiet hands it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {CMDS, createConsole, DISPLAY, ISOS, VIEWS} from './console.js';
import {blendCam, camAt, DISPLAY0, displayAt, DURATION, isoAt, isoEased, litAt, makeConsoleFrame, makeFilmCursor, motionAt, viewAt, VIEW_FN} from './film.js';
import {command, frameState, obsOnAt, SPEC} from './kin.js';
import {tourPlan} from './script.js';
import {createShutterStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const CSS = (top) => `
html,body{overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:${top}px;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.bt{pointer-events:auto;cursor:pointer}
.bt:hover{filter:brightness(.96)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:104px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:28px;padding:0 14px;border:1px solid #e6ddcf;border-radius:5px;background:rgba(252,250,246,.95);color:#262420;font:700 13px 'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;letter-spacing:.04em;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:#e3562a}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 13px/1.4 'Hiragino Sans','Noto Sans JP',sans-serif;color:#8f8577;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS(top);
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createShutterStage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeFilmCursor(ui);
  const frameConsole = makeConsoleFrame(ui, st);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 8, ao: true, shadow: 4096, pr: 2},
    {samples: 4, ao: false, shadow: 2048, pr: 1.5},
    {samples: 2, ao: false, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    const h = innerHeight - top;
    scale = Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(h - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.textContent = '横向きにすると操作盤がすべて見えます';
  document.body.appendChild(turn);

  // ------------------------------------------------------------ state
  let T = 0;
  let plan = null; // the visitor's plan, null during the tour
  let tau = 0; // the visitor's plan time
  let lit = {k: null, t: -9};
  let view = 'all';
  let viewAt0 = 0;
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: DISPLAY0[k], t: -9}]));
  let iso = null;
  const isoT = Object.fromEntries(ISOS.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  const pulse = (k) => {
    const sp = typeof ui.spots[k] === 'function' ? null : ui.spots[k];
    if (sp) ring = {t: T, x: sp[0], y: sp[1]};
  };
  const eased = (o, dur = 0.7) => {
    const x = ss(o.t, o.t + dur, T);
    return o.on ? x : 1 - x;
  };
  const setIso = (k) => {
    iso = k;
    for (const i of ISOS) {
      const on = i === k ? 1 : 0;
      if (isoT[i].on !== on) isoT[i] = {on, t: T};
    }
  };

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    plan = null;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  // the visitor takes the shutter where the tour left it: the tour's presses replayed to this moment
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    plan = tourPlan(cyc);
    tau = cyc;
    const [t0, v] = viewAt(cyc);
    view = v;
    viewAt0 = T - (cyc - t0);
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });
  // the tour's toggles land in the same state the visitor drives, so a takeover keeps them
  const syncTour = (cyc) => {
    const want = displayAt(cyc);
    for (const k of DISPLAY) if (disp[k].on !== want[k]) disp[k] = {on: want[k], t: T};
    const k = isoAt(cyc);
    if (k !== iso) setIso(k);
  };

  // ------------------------------------------------------------ controls
  for (const k of CMDS)
    ui.btn[`c_${k}`].addEventListener('click', () => {
      takeOver();
      pulse(`c_${k}`);
      lit = {k, t: T};
      command(plan, tau, k);
    });
  ui.btn.obs.addEventListener('click', () => {
    takeOver();
    pulse('obs');
    lit = {k: 'obs', t: T};
    command(plan, tau, obsOnAt(plan, tau) ? 'obsOff' : 'obsOn');
  });
  for (const v of VIEWS)
    ui.btn[`v_${v}`].addEventListener('click', () => {
      takeOver();
      pulse(`v_${v}`);
      view = v;
      viewAt0 = T;
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  for (const k of ISOS)
    ui.btn[`i_${k}`].addEventListener('click', () => {
      takeOver();
      pulse(`i_${k}`);
      setIso(iso === k ? null : k);
    });
  for (const k of DISPLAY)
    ui.btn[`d_${k}`].addEventListener('click', () => {
      takeOver();
      pulse(`d_${k}`);
      disp[k] = {on: disp[k].on ? 0 : 1, t: T};
    });
  // the manual opening: dragging sets the opening directly (like the hand chain), the curtain stands still there
  {
    const SL = ui.SL;
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${SL.x - 10}px`, top: `${SL.y - 14}px`, width: `${SL.w + 20}px`, height: '28px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      command(plan, tau, 'set', clamp((x - SL.x) / SL.w, 0, 1) * SPEC.H);
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const keys = {o: 'c_open', s: 'c_stop', c: 'c_close', b: 'obs', x: 'd_cut', l: 'd_labels'};
    if (keys[key]) ui.btn[keys[key]].click();
    else if (key === 'v') ui.btn[`v_${VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]}`].click();
    else if (key === 'arrowup' || key === 'arrowdown') {
      takeOver();
      const h = frameState(plan, tau).h;
      command(plan, tau, 'set', clamp(h + (key === 'arrowup' ? 0.05 : -0.05), 0, SPEC.H));
    } else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az -= ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 60);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.35, 2.5);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let s;
    let tgt;
    let cursor;
    let since;
    let lk;
    // 25 s of quiet hands the page back to the tour, before this frame picks its source
    if (!AP.on && T - lastInput > IDLE) startTour();
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      s = motionAt(cyc);
      syncTour(cyc);
      tgt = camAt(cyc);
      const [t0, v] = viewAt(cyc);
      view = v;
      since = cyc - t0;
      cursor = tourCursor(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
      lk = litAt(cyc);
    } else {
      tau += dt;
      s = frameState(plan, tau);
      since = T - viewAt0;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
      lk = T - lit.t < 0.6 ? lit.k : null;
    }
    if (!tgt) {
      tgt = {...VIEW_FN[view](since)};
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -20, 89);
      tgt.d *= off.k;
    }
    // the camera eases toward its target
    if (!cam) cam = {...tgt};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.35));
    const az = cam.az + wrap(tgt.az - cam.az) * k;
    cam = {...blendCam(cam, tgt, k), az};
    const isoK = AP.on ? isoEased((T - AP.t0) % DURATION) : Object.fromEntries(ISOS.map((i) => [i, eased(isoT[i])]));
    st.frame(s, {cut: disp.cut.on, iso: isoK}, {...cam, az: cam.az * D2R, el: cam.el * D2R});
    const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
    frameConsole({
      st: s,
      view,
      iso,
      display,
      lit: lk,
      labels: eased(disp.labels, 0.5) * ss(1.4, 2.0, since),
      cursor,
    });
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>自動ツアー中・クリックで操作できます' : '▶ ツアーに戻る';
    }
    window.LIVE.s = s;
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  window.LIVE = {
    st,
    startTour,
    takeOver,
    s: null,
    get tier() {
      return tier;
    },
    get T() {
      return T;
    },
    get tour() {
      return AP.on;
    },
    get plan() {
      return plan;
    },
  };
  // every shader compiles at once off the main thread before the first frame (kit/warm.js)
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
}
