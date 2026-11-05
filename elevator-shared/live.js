// The elevator as a page you drive: the film's hoist, studio and console in real time. The destination buttons queue
// trips (the same kin.trip the film uses) with a door cycle at every stop, the slider sets the passengers, the five
// views, the three isolates, the cutaway and the labels; an orbit you drag and a zoom on the wheel. Left alone it plays
// the film's script as an auto tour with the operator's cursor, looped; a click, drag, wheel or key hands control to
// the visitor, who takes over the car where the tour left it; 25 s of quiet hands it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {createConsole, DISPLAY, ISOS, VIEWS} from './console.js';
import {blendCam, callsAt, camAt, DISPLAY0, displayAt, DURATION, isoAt, makeConsoleFrame, makeFilmCursor, motionAt, SCRIPT, stateOf, viewAt, VIEW_FN} from './film.js';
import {doorAt, doorDur, floorY, SPEC, trip} from './kin.js';
import {createElevatorStage} from './stage.js';

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
.tourchip{position:absolute;left:820px;top:44px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:28px;padding:0 14px;border:1px solid #e6ddcf;border-radius:5px;background:rgba(252,250,246,.95);color:#262420;font:700 13px 'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;letter-spacing:.04em;white-space:nowrap;cursor:pointer;pointer-events:auto}
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
  const st = createElevatorStage({canvas});
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
  // the car: what it is doing now (a trip, a door cycle or nothing), where it stands, who is on board
  let act = null; // {kind: 'trip', t0, trip} | {kind: 'door', t0, floor, hold}
  let floor = 1;
  let persons = 15;
  let lastTrip = null;
  const queue = [];
  let view = 'all';
  let viewAt0 = 0;
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: DISPLAY0[k], t: -9}]));
  let iso = null;
  const isoT = Object.fromEntries(ISOS.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  const pulse = (k) => (ring = {t: T, x: ui.spots[k][0], y: ui.spots[k][1]});
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
  let tourMo = null;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    queue.length = 0;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  // the visitor takes the car where the tour left it: mid-trip, mid-door-cycle or standing
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    const mo = motionAt(cyc);
    persons = mo.persons;
    floor = mo.floor;
    lastTrip = mo.trip;
    act = null;
    if (mo.act && mo.act.kind === 'trip' && cyc < mo.act.t1) {
      act = {kind: 'trip', t0: T - (cyc - mo.act.t0), trip: mo.act.trip};
      floor = mo.act.from;
    } else if (mo.act && mo.act.kind === 'door' && cyc < mo.act.t1) act = {kind: 'door', t0: T - (cyc - mo.act.t0), floor: mo.act.floor, hold: mo.act.hold};
    for (const f of callsAt(cyc)) if (!(act && act.kind === 'trip' && act.trip.to === f)) queue.push(f);
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
    const [k] = isoAt(cyc);
    if (k !== iso) setIso(k);
  };

  // ------------------------------------------------------------ controls
  const call = (f) => {
    const busyTo = act && act.kind === 'trip' ? act.trip.to : null;
    if (queue.includes(f) || busyTo === f) return;
    queue.push(f);
  };
  for (let f = 1; f <= SPEC.floors; f++)
    ui.btn[`f${f}`].addEventListener('click', () => {
      takeOver();
      pulse(`f${f}`);
      call(f);
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
  {
    // the passenger slider
    const {x: x0, w, y} = ui.SL;
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x0 - 10}px`, top: `${y - 14}px`, width: `${w + 20}px`, height: '28px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      persons = Math.round(clamp((x - x0) / w, 0, 1) * SPEC.persons);
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
    if (/^[0-9]$/.test(key)) ui.btn[`f${key === '0' ? 10 : key}`].click();
    else if (key === 'c') ui.btn.d_cut.click();
    else if (key === 'l') ui.btn.d_labels.click();
    else if (key === 'v') ui.btn[`v_${VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]}`].click();
    else if (key === 'arrowup' || key === 'arrowdown') {
      takeOver();
      persons = clamp(persons + (key === 'arrowup' ? 1 : -1), 0, SPEC.persons);
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

  // ------------------------------------------------------------ the visitor's car: trips and door cycles in real time
  const liveMotion = () => {
    // finish what is done, start what is queued
    for (let guard = 0; guard < 4; guard++) {
      if (act && act.kind === 'trip' && T - act.t0 >= act.trip.dur) {
        floor = act.trip.to;
        act = {kind: 'door', t0: act.t0 + act.trip.dur, floor, hold: SPEC.doorHold};
        continue;
      }
      if (act && act.kind === 'door' && T - act.t0 >= doorDur(act.hold)) {
        act = null;
        continue;
      }
      if (!act && queue.length) {
        const f = queue.shift();
        if (f === floor) act = {kind: 'door', t0: T, floor, hold: SPEC.doorHold};
        else {
          lastTrip = trip(floor, f);
          act = {kind: 'trip', t0: T, trip: lastTrip};
        }
        continue;
      }
      break;
    }
    if (act && act.kind === 'trip') {
      const tau = T - act.t0;
      return {m: act.trip.at(tau), persons, door: 0, doorMoving: 0, doorPhase: '戸閉', trip: act.trip, tripTau: tau, floor};
    }
    const m = {pos_m: floorY(floor), v: 0, a: 0, j: 0};
    if (act && act.kind === 'door') {
      const d = doorAt(T - act.t0, act.hold);
      return {m, persons, door: d.open, doorMoving: d.moving, doorPhase: d.phase, trip: lastTrip, tripTau: lastTrip ? lastTrip.dur : 0, floor};
    }
    return {m, persons, door: 0, doorMoving: 0, doorPhase: '戸閉', trip: lastTrip, tripTau: lastTrip ? lastTrip.dur : 0, floor};
  };
  const liveCalls = () => {
    const out = new Set(queue);
    if (act && act.kind === 'trip') out.add(act.trip.to);
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

    let mo;
    let tgt;
    let cursor;
    let since;
    let calls;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      mo = motionAt(cyc);
      tourMo = mo;
      syncTour(cyc);
      const s0 = stateOf(mo);
      tgt = camAt(cyc, s0);
      const [t0, v] = viewAt(cyc);
      view = v;
      since = cyc - t0;
      calls = callsAt(cyc);
      cursor = tourCursor(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (T - lastInput > IDLE) startTour();
      mo = liveMotion();
      since = T - viewAt0;
      calls = liveCalls();
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    const s = stateOf(mo);
    if (!tgt) {
      tgt = {...VIEW_FN[view](since, s)};
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -20, 80);
      tgt.d *= off.k;
    }
    // the camera eases toward its target; the target follows the car, so it never lags far behind it
    if (!cam) cam = {...tgt};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.35));
    const az = cam.az + wrap(tgt.az - cam.az) * k;
    cam = {...blendCam(cam, tgt, k, false), az};
    const isoK = Object.fromEntries(ISOS.map((i) => [i, eased(isoT[i])]));
    st.frame(s, {cut: disp.cut.on, iso: isoK}, {...cam, az: cam.az * D2R, el: cam.el * D2R});
    const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
    frameConsole({st: s, trip: mo.trip, tripTau: mo.tripTau, calls, view, iso, display, labels: eased(disp.labels, 0.5) * ss(1.4, 2.0, since), cursor});
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
    get queue() {
      return [...queue];
    },
    get tourMo() {
      return tourMo;
    },
  };
  // every shader compiles at once off the main thread before the first frame (kit/warm.js)
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  void SCRIPT;
}
