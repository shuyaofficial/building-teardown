// The elevator film: the hoist (hoist.js) in its studio (stage.js) under the Japanese console (console.js). The
// operator sends 15 people from 1F to 10F (力行 all the way), watches the counterweight pass the car, opens the
// traction machine, rides the door cycle at 10F where 12 people step off, takes 3 people down to 5F (力行 while the
// light car lifts the heavier counterweight, 回生 as it brakes), closes and reopens the building, and finishes with a
// one-floor hop that never reaches rated speed. A pure function of t: every pose comes from kin.js's schedule.
import {runSim} from 'teardown-kit/runtime.js';
import * as THREE from 'three';
import {makeCursor} from '../building-kit/cursor.js';
import {createConsole, DISPLAY, ISOS} from './console.js';
import {L} from './hoist.js';
import {floorY, schedule, SPEC, state, tripPhase} from './kin.js';
import {createElevatorStage} from './stage.js';

export const SCRIPT = [
  {t: 0, view: 'all'},
  {t: 0.35, call: 10},
  {t: 0.8, trip: [1, 10], persons: 15},
  {t: 4.2, view: 'follow'},
  {t: 8.4, view: 'cwt'},
  {t: 9.0, iso: 'cwt'},
  {t: 13.4, iso: 'cwt'},
  {t: 13.7, view: 'machine'},
  {t: 14.3, iso: 'machine'},
  {t: 18.7, iso: 'machine'},
  {t: 18.9, view: 'all'},
  {t: 21.4, view: 'door'},
  {t: 22.2, iso: 'door'},
  {t: 23.3, door: 10, persons: [15, 3]},
  {t: 30.35, iso: 'door'},
  {t: 30.35, view: 'follow'},
  {t: 30.6, call: 5},
  {t: 31.0, trip: [10, 5], persons: 3},
  {t: 34.0, view: 'machine'},
  {t: 37.6, view: 'all'},
  {t: 38.6, display: 'cut'},
  {t: 40.4, display: 'cut'},
  {t: 41.0, view: 'follow'},
  {t: 44.8, call: 6},
  {t: 45.1, trip: [5, 6], persons: 3},
];
export const DURATION = 51.2;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'elevator', subtitle: ''}, director: {enabled: false}, watermark: ''};
// display toggles start on: the cut is open, the labels shown
export const DISPLAY0 = {cut: 1, labels: 1};
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the motion: one schedule of trips and door cycles
export const SCHED = schedule(
  SCRIPT.filter((e) => e.trip || e.door).map((e) =>
    e.trip ? {kind: 'trip', t0: e.t, from: e.trip[0], to: e.trip[1], persons: e.persons} : {kind: 'door', t0: e.t, floor: e.door, persons: e.persons},
  ),
  {floor: 1, persons: 15},
);
export const motionAt = (t) => SCHED.motionAt(t);
/** the calls lit at film time t: pressed, not yet arrived */
export const callsAt = (t) => {
  const out = new Set();
  for (const e of SCRIPT) {
    if (!e.call || e.t > t) continue;
    const tr = SCHED.list.find((x) => x.kind === 'trip' && x.to === e.call && x.t0 >= e.t);
    if (!tr || t < tr.t1) out.add(e.call);
  }
  return out;
};
export const displayAt = (t) => {
  const out = {...DISPLAY0};
  for (const e of SCRIPT) if (e.display && e.t <= t) out[e.display] = out[e.display] ? 0 : 1;
  return out;
};
export const isoAt = (t) => {
  let cur = null;
  let t0 = -9;
  for (const e of SCRIPT) {
    if (!e.iso || e.t > t) continue;
    cur = cur === e.iso ? null : e.iso;
    t0 = e.t;
  }
  return [cur, t0];
};
/** 0..1 for each isolate key, eased over 0.7 s */
export const isoEased = (t) => {
  const out = Object.fromEntries(ISOS.map((k) => [k, 0]));
  for (const k of ISOS) {
    const flips = SCRIPT.filter((e) => e.iso === k && e.t <= t);
    if (!flips.length) continue;
    const on = flips.length % 2 === 1;
    const x = ss(flips[flips.length - 1].t, flips[flips.length - 1].t + 0.7, t);
    out[k] = on ? x : 1 - x;
  }
  return out;
};

// ------------------------------------------------------------ views; u = seconds since the view came on, st = state
export const VIEW_FN = {
  all: (u) => ({tx: -0.3, ty: 19.6, tz: 0.4, az: 54 + 1.0 * u, el: 9, d: 112, sx: -8, sy: -40}),
  follow: (u, st) => ({tx: 0.2, ty: st.carY + 1.4, tz: 0.15, az: 56 + 1.6 * u, el: 9, d: 14.5, sx: 0, sy: -30}),
  machine: (u) => ({tx: -0.15, ty: SPEC.sheaveY - 0.15, tz: -0.3, az: 70 + 1.6 * u, el: 16, d: 5.6, sx: 0, sy: -30}),
  door: (u, st) => ({tx: 0.05, ty: st.carY + 1.3, tz: 0.95, az: 40 + 1.0 * u, el: 7, d: 7.8, sx: 0, sy: -30}),
  // from behind and to the cut side: the counterweight's broad face, the car beyond it
  cwt: (u, st) => ({tx: 0.0, ty: Math.max(-0.2, st.cwtY - 1.7), tz: -0.7, az: 132 + 1.4 * u, el: 8, d: 10, sx: 0, sy: -26}),
};
const VIEWS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
// blend two cameras: the distance in log space so a 118 m to 11 m move reads as one zoom
export const blendCam = (a, b, k, bump = true) => {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  o.d = Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k);
  // a long move of the target backs the camera off on the way, so it never grazes the walls
  const far = bump ? Math.hypot(b.tx - a.tx, b.ty - a.ty, b.tz - a.tz) : 0;
  o.d += Math.min(far, 30) * 0.9 * Math.sin(Math.PI * k);
  return o;
};
export const viewAt = (t) => VIEWS.filter(([a]) => a <= t).pop();
export const camAt = (t, st) => {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[VIEWS[i][1]](t - VIEWS[i][0], st);
  if (i > 0) {
    const k = ss(VIEWS[i][0], VIEWS[i][0] + 1.8, t);
    if (k < 1) return blendCam(VIEW_FN[VIEWS[i - 1][1]](t - VIEWS[i - 1][0], st), cur, k);
  }
  return cur;
};

// ------------------------------------------------------------ the operator's pointer
export function makeFilmCursor(ui) {
  const presses = [];
  for (const e of SCRIPT) {
    if (e.t <= 0) continue;
    if (e.call) presses.push({t: e.t, spot: ui.spots[`f${e.call}`]});
    if (e.view) presses.push({t: e.t, spot: ui.spots[`v_${e.view}`]});
    if (e.iso) presses.push({t: e.t + (SCRIPT.some((x) => x.view && x.t === e.t) ? 0.3 : 0), spot: ui.spots[`i_${e.iso}`]});
    if (e.display) presses.push({t: e.t, spot: ui.spots[`d_${e.display}`]});
  }
  return makeCursor(presses);
}

// ------------------------------------------------------------ the labels, per view, in world coordinates
const V3 = THREE.Vector3;
const H = SPEC;
const PARTS = [
  {v: ['all'], name: '巻上機・機械室', sub: '屋上の機械室', at: () => new V3(0, H.sheaveY, -0.1)},
  {v: ['all'], name: 'かご', sub: (s) => `${s.floor}階付近・${s.persons}人`, at: (s) => new V3(0, s.carY + 1.2, 0.2)},
  {v: ['all'], name: 'つり合いおもり', sub: '1650 kg・かごと逆に動く', at: (s) => new V3(0, s.cwtY - 1.6, L.cwtZ)},
  {v: ['all'], name: 'ピット', sub: '深さ 1.6 m・緩衝器', at: () => new V3(0, -1.2, 0)},
  {v: ['follow'], name: 'かご室', sub: '内法 1.60 × 1.50 m', at: (s) => new V3(0.8, s.carY + 1.3, 0.4)},
  {v: ['follow'], name: 'かご枠・綱止め', sub: 'ロープ5本でつる', at: (s) => new V3(0, s.carY + 2.9, L.carZ)},
  {v: ['follow', 'cwt'], name: '主索（ロープ）', sub: (s) => `φ10 mm × 5本・${s.tCar.toFixed(1)} kN`, at: (s) => new V3(0, s.carY + 4.6, L.carZ)},
  {v: ['follow'], name: 'ガイドレール', sub: 'かごを案内するT形レール', at: (s) => new V3(1.0, s.carY + 0.6, L.carZ)},
  {v: ['follow'], name: 'ドア装置', sub: 'かごの上の戸開閉機', at: (s) => new V3(0.6, s.carY + 2.45, 0.95)},
  {v: ['machine'], name: '綱車', sub: (s) => `ピッチ径 500 mm・${s.rpm.toFixed(1)} rpm`, at: () => new V3(0.086, H.sheaveY + 0.15, L.sheaveZ + 0.1)},
  {v: ['machine'], name: 'そらせ車', sub: 'ロープをおもり側へ振る', at: () => new V3(0.06, H.deflY, L.deflZ)},
  {v: ['machine'], name: 'PMモーター', sub: 'ギヤレス・綱車を直接回す', at: () => new V3(-0.3, H.sheaveY + 0.33, L.sheaveZ + 0.1)},
  {v: ['machine'], name: 'ブレーキ', sub: (s) => (s.dir ? '開放・走行中' : '保持・停止中'), at: () => new V3(-0.59, H.sheaveY + 0.44, L.sheaveZ)},
  {v: ['machine'], name: '制御盤', sub: 'インバーターでモーターを制御', at: () => new V3(-1.2, H.mrFloor + 1.3, -0.95)},
  {v: ['machine'], name: '主索', sub: (s) => `かご側 ${s.tCar.toFixed(1)} kN`, at: () => new V3(0, H.mrFloor - 0.4, L.carZ)},
  {v: ['door'], name: 'ドアモーター', sub: 'ベルトを回す', at: (s) => new V3(0.8, s.carY + 2.48, 0.9)},
  {v: ['door'], name: '歯付きベルト', sub: '上下の帯が逆向きに動く', at: (s) => new V3(-0.3, s.carY + 2.455, 1.03)},
  {v: ['door'], name: 'ハンガー', sub: '戸をつるすローラー', at: (s) => new V3(-0.47 / 2 - 0.45 * s.door - 0.14, s.carY + 2.23, 1.0)},
  {v: ['door'], name: 'ベーン（係合装置）', sub: '乗場戸のローラーをつかむ', at: (s) => new V3(-0.08 - 0.45 * s.door, s.carY + 1.9, 1.04)},
  {v: ['door'], name: 'かご戸', sub: '2枚戸中央開き 900 mm', at: (s) => new V3(0.235 + 0.45 * s.door, s.carY + 0.9, 1.02)},
  {v: ['door'], name: '乗場戸', sub: 'かご戸に引かれて開く', at: (s) => new V3(0.3 + 0.45 * s.door, floorY(s.floor) + 0.5, 1.085)},
  {v: ['cwt'], name: 'つり合いおもり', sub: '1650 kg（かご＋積載の45%）', at: (s) => new V3(0.45, s.cwtY - 1.6, L.cwtZ + 0.05)},
  {v: ['cwt'], name: 'おもり用レール', sub: 'おもりの案内', at: (s) => new V3(0.6, Math.max(s.cwtY - 2.8, -1.0), L.cwtZ)},
  {v: ['cwt'], name: '緩衝器（油入）', sub: 'ピット床に立つ', at: () => new V3(0, L.cwtBufTop - 0.1, L.cwtZ)},
  {v: ['cwt'], name: 'かご', sub: (s) => `${s.persons}人・${s.loadKg} kg`, at: (s) => new V3(0.8, s.carY + 1.4, 0.2)},
];
const VP = {x0: 360, x1: 1240, y0: 112, y1: 740};
export function makeLabels(st) {
  return (s, view, o) => {
    if (o < 0.02) return [];
    const pts = PARTS.filter((p) => p.v.includes(view))
      .map((p) => ({p, at: st.project(...p.at(s).toArray())}))
      .filter((x) => x.at && x.at[0] > VP.x0 + 250 && x.at[0] < VP.x1 - 250 && x.at[1] > VP.y0 + 10 && x.at[1] < VP.y1 - 10);
    // two columns, stacked by height so no two labels touch
    const Lc = pts.filter((x) => x.at[0] < 800).sort((a, b) => a.at[1] - b.at[1]);
    const Rc = pts.filter((x) => x.at[0] >= 800).sort((a, b) => a.at[1] - b.at[1]);
    const out = [];
    const stack = (col, x, w) => {
      const ys = [];
      let y = VP.y0 + 8;
      for (const c of col) {
        y = Math.max(y, c.at[1] - 12);
        ys.push(y);
        y += 50;
      }
      // a column that runs past the bottom slides up as one, never above the top
      const over = Math.max(0, (ys[ys.length - 1] ?? 0) - (VP.y1 - 44));
      col.forEach((c, i) => out.push({name: c.p.name, sub: typeof c.p.sub === 'function' ? c.p.sub(s) : c.p.sub, at: c.at, label: [x, Math.max(VP.y0 + 8 + i * 50, ys[i] - over)], w, o}));
    };
    stack(Lc, VP.x0, 236);
    stack(Rc, VP.x1 - 236, 236);
    return out;
  };
}
const TAG_PT = (f) => [L.outline[0], floorY(f) + 0.25, L.outline[3]];
export function floorTags(st, view, o) {
  if (view !== 'all' || o < 0.02) return [];
  const out = [];
  for (let f = 1; f <= SPEC.floors; f++) {
    const p = st.project(...TAG_PT(f));
    if (p) out.push([p[0] - 30, p[1], f, o]);
  }
  return out;
}

// ------------------------------------------------------------ the one-line explanation
export function noteFor(s, iso) {
  if (iso === 'machine') return '綱車とロープの摩擦（トラクション）でかごを動かす。ギヤのないPMモーターが綱車を直接回し、止まるとブレーキが綱車を押さえる。';
  if (iso === 'cwt') return 'おもり＝かご自重＋積載の45%。かごと逆向きに動くので、モーターは両側の重さの差だけを動かせばよい。約7人でちょうどつり合う。';
  if (iso === 'door' || s.doorMoving > 0.5) return 'かごの上のドアモーターがベルトを回し、2枚の戸が左右に開く。かご戸のベーンが乗場戸のローラーをはさみ、乗場戸も一緒に動く。';
  if (s.mode === '力行') return '力行：重い側を持ち上げる向きに回すので、モーターが電力を使って押し出す。';
  if (s.mode === '回生') return '回生：重い側が下がる向き。モーターは発電機になってブレーキをかけ、電力を建物へ戻す。';
  if (s.door > 0.99) return `戸開中：乗り降りの間、かごは着床位置で止まる。今 ${s.persons}人・${s.loadKg} kg。`;
  return '停止中：ブレーキが綱車を押さえる。トルクはロープ張力の差 ×（綱車径÷2）。';
}

/** draws the console from the frame's state */
export function makeConsoleFrame(ui, st) {
  const labels = makeLabels(st);
  return (s) => {
    ui.update({
      st: s.st,
      phase: s.st.dir ? tripPhase(s.trip, s.tripTau) : s.st.doorPhase === '戸閉' ? '待機' : '乗降',
      calls: s.calls,
      view: s.view,
      iso: s.iso,
      display: s.display,
      trip: s.trip,
      tripTau: s.tripTau,
      note: noteFor(s.st, s.iso),
      callouts: labels(s.st, s.view, s.labels),
      floorTags: floorTags(st, s.view, s.labels),
      cursor: s.cursor,
    });
  };
}

/** the pose for a motion sample */
export const stateOf = (mo) => state(mo.m, {persons: mo.persons, door: mo.door, doorMoving: mo.doorMoving, doorPhase: mo.doorPhase});

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createElevatorStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeFilmCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.EL = st;
    return {
      resize,
      render(t) {
        const mo = motionAt(t);
        const s = stateOf(mo);
        const disp = displayAt(t);
        const [iso] = isoAt(t);
        const cam = camAt(t, s);
        st.frame(s, {cut: disp.cut, iso: isoEased(t)}, {...cam, az: cam.az * D2R, el: cam.el * D2R});
        const [vt0, view] = viewAt(t);
        frame({st: s, trip: mo.trip, tripTau: mo.tripTau, calls: callsAt(t), view, iso, display: disp, labels: disp.labels * (vt0 === 0 ? 1 : ss(vt0 + 1.4, vt0 + 2.0, t)), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
void DISPLAY;
