// The automatic door as a page you drive: the film's door, studio and console in real time. The walk buttons send
// people (outside, inside, at 30°, the one who stops in the doorway), the sliders set the detection depth and the
// walking speed, the mode buttons the speed limits; the four views, the three isolates, the cutaway and the labels; an
// orbit you drag and a zoom on the wheel. Left alone it plays the film's script as an auto tour with the operator's
// cursor, looped; a click, drag, wheel or key hands control to the visitor, who takes over the door where the tour
// left it (the same createSim stepped to that moment, then stepped in real time); 25 s of quiet hands it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {createConsole, DISPLAY, ISOS, VIEWS, WALKS} from './console.js';
import {blendCam, camAt, DISPLAY0, displayAt, DURATION, histAt, isoAt, isoEased, makeConsoleFrame, makeFilmCursor, motionAt, projectTracks, REC, tracksAt, viewAt, VIEW_FN, walkLitAt} from './film.js';
import {createSim, lastWalker, SPEC, stateOfSim} from './kin.js';
import {scenarioOf} from './script.js';
import {createDoorStage} from './stage.js';

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
.tourchip{position:absolute;left:840px;top:40px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:28px;padding:0 14px;border:1px solid #e6ddcf;border-radius:5px;background:rgba(252,250,246,.95);color:#262420;font:700 13px 'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;letter-spacing:.04em;white-space:nowrap;cursor:pointer;pointer-events:auto}
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
  const st = createDoorStage({canvas});
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
  let sim = null; // the visitor's simulation, null during the tour
  let simAcc = 0;
  let walk = SPEC.walk;
  let walkLit = {k: null, t: -9};
  let view = 'all';
  let viewAt0 = 0;
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: DISPLAY0[k], t: -9}]));
  let iso = null;
  const isoT = Object.fromEntries(ISOS.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  // the visitor's history: the leaf speed every 50 ms for the chart, each walker's floor track every 40 ms
  const hist = [];
  const tracks = new Map();
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
    sim = null;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  // the visitor takes the door where the tour left it: the tour's scenario replayed to this moment, then live
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    const sc = scenarioOf();
    sim = createSim(SPEC, {D: sc.D, mode: sc.mode});
    for (const e of sc.events) {
      if (e.t > cyc) break;
      sim.runTo(e.t - SPEC.dt);
      if (e.set) sim.set(e.set);
      if (e.ped) sim.addPed(e.ped.kind, e.ped);
    }
    sim.runTo(cyc);
    simAcc = 0;
    hist.length = 0;
    const h = histAt(cyc);
    h.forEach((v, i) => hist.push({t: T - 8 + (i / 160) * 8, v}));
    tracks.clear();
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
  const LANES = [0.12, -0.28, 0.32, -0.08, 0.22, -0.18];
  let nLane = 0;
  for (const k of WALKS)
    ui.btn[`w_${k}`].addEventListener('click', () => {
      takeOver();
      pulse(`w_${k}`);
      walkLit = {k, t: T};
      // each new walker takes the next lane, so two never walk inside each other
      const lane = LANES[nLane++ % LANES.length];
      sim.addPed(k, {w: k === 'linger' ? Math.min(walk, 1.0) : walk, ...(k === 'linger' ? {} : {x: k === 'diag' ? lane / 2 : lane})});
    });
  for (const m of ['normal', 'gentle'])
    ui.btn[`m_${m}`].addEventListener('click', () => {
      takeOver();
      pulse(`m_${m}`);
      sim.set({mode: m});
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
  // the two sliders: detection depth (0.05 m steps) and walking speed (0.1 m/s steps)
  const sliderHit = (SL, apply) => {
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${SL.x - 10}px`, top: `${SL.y - 14}px`, width: `${SL.w + 20}px`, height: '28px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(SL.min + clamp((x - SL.x) / SL.w, 0, 1) * (SL.max - SL.min));
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
  };
  sliderHit(ui.SL.D, (v) => sim.set({D: Math.round(v * 20) / 20}));
  sliderHit(ui.SL.W, (v) => (walk = Math.round(v * 10) / 10));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const keys = {o: 'w_out', i: 'w_in', d: 'w_diag', s: 'w_linger', c: 'd_cut', l: 'd_labels', m: null};
    if (key in keys && keys[key]) ui.btn[keys[key]].click();
    else if (key === 'm') ui.btn[sim && sim.P.mode === 'gentle' ? 'm_normal' : 'm_gentle'].click();
    else if (key === 'v') ui.btn[`v_${VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]}`].click();
    else if (key === 'arrowup' || key === 'arrowdown') {
      takeOver();
      sim.set({D: clamp(Math.round((sim.P.D + (key === 'arrowup' ? 0.05 : -0.05)) * 20) / 20, SPEC.detDMin, SPEC.detDMax)});
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

  // ------------------------------------------------------------ the visitor's door: the simulation in real time
  const stepLive = (dt) => {
    simAcc += dt;
    const n = Math.floor(simAcc / SPEC.dt + 1e-9);
    simAcc -= n * SPEC.dt;
    let nextTrack = sim.t;
    for (let i = 0; i < n; i++) {
      sim.step();
      if (sim.t >= nextTrack) {
        for (const p of sim.peds) {
          if (!tracks.has(p.id)) tracks.set(p.id, {pts: [], last: sim.t});
          const tr = tracks.get(p.id);
          tr.pts.push(p.p0x + p.ux * p.s, p.p0z + p.uz * p.s);
          tr.last = sim.t;
        }
        nextTrack = sim.t + 0.04;
      }
    }
    // keep the last 4 tracks of walkers seen in the last 14 s
    for (const [id, tr] of tracks) if (sim.t - tr.last > 14) tracks.delete(id);
    while (tracks.size > 4) tracks.delete(tracks.keys().next().value);
    hist.push({t: T, v: sim.door.v});
    while (hist.length > 2 && hist[1].t < T - 8.2) hist.shift();
  };
  const liveHist = () => {
    const out = new Array(161);
    let j = 0;
    for (let k = 0; k <= 160; k++) {
      const tt = T - 8 + (k / 160) * 8;
      while (j < hist.length - 1 && hist[j + 1].t <= tt) j++;
      out[k] = hist.length && hist[0].t <= tt ? hist[j].v : 0;
    }
    return out;
  };

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
    let h;
    let walker;
    let trk;
    let lit;
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
      h = histAt(cyc);
      walker = lastWalker(REC.events, cyc);
      trk = view === 'floor' ? tracksAt(cyc) : [];
      lit = walkLitAt(cyc);
    } else {
      stepLive(dt);
      s = stateOfSim(sim);
      since = T - viewAt0;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
      h = liveHist();
      walker = lastWalker(sim.events, sim.t);
      trk = view === 'floor' ? [...tracks.values()].map((x) => x.pts) : [];
      lit = T - walkLit.t < 0.6 ? walkLit.k : null;
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
    const trackK = view === 'floor' ? ss(0.8, 1.8, since) : 0;
    frameConsole({
      st: s,
      view,
      iso,
      display,
      walk: AP.on ? SPEC.walk : walk,
      walkLit: lit,
      hist: h,
      walker,
      labels: eased(disp.labels, 0.5) * ss(1.4, 2.0, since),
      tracks: trackK > 0 ? projectTracks(st, trk) : [],
      trackK,
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
    get sim() {
      return sim;
    },
  };
  // every shader compiles at once off the main thread before the first frame (kit/warm.js)
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
}
