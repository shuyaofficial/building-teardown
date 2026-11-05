// The automatic door film: the door (door.js) in its studio (stage.js) under the Japanese console (console.js). The
// operator sends one walker through from the street, opens the header to watch the engine close the door and the
// belt open it, goes to the floor plan and cuts the detection depth from 1.50 m to 1.00 m (837 → 421 mm on arrival:
// the next walker slows down), watches someone step into the closing door from the leading edge (the beams, 0.2 s,
// open again), switches to the 高齢者・子ども speeds and ends with people both ways. A pure function of t: every pose
// comes from one stored simulate() run.
import {runSim} from 'teardown-kit/runtime.js';
import * as THREE from 'three';
import {makeCursor} from '../building-kit/cursor.js';
import {createConsole, ISOS} from './console.js';
import {L} from './door.js';
import {idxOf, lastWalker, SPEC, ST, stateAt} from './kin.js';
import {DISPLAY0, DURATION, SCRIPT, scenarioOf} from './script.js';
import {simulate} from './kin.js';
import {createDoorStage} from './stage.js';

export {DISPLAY0, DURATION, SCRIPT};
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'autodoor', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the motion: one stored run of the whole tour
export const REC = simulate(scenarioOf());
export const motionAt = (t) => stateAt(REC, t);

export const displayAt = (t) => {
  const out = {...DISPLAY0};
  for (const e of SCRIPT) if (e.display && e.t <= t) out[e.display] = out[e.display] ? 0 : 1;
  return out;
};
// isolate presses: a key toggles itself, another key replaces it
const ISO_FLIPS = (() => {
  const flips = Object.fromEntries(ISOS.map((k) => [k, []]));
  let cur = null;
  for (const e of SCRIPT) {
    if (!e.iso) continue;
    const next = cur === e.iso ? null : e.iso;
    if (cur) flips[cur].push([e.t, 0]);
    if (next) flips[next].push([e.t, 1]);
    cur = next;
  }
  return flips;
})();
export const isoAt = (t) => {
  let cur = null;
  for (const e of SCRIPT) if (e.iso && e.t <= t) cur = cur === e.iso ? null : e.iso;
  return cur;
};
/** 0..1 for each isolate key, eased over 0.7 s */
export const isoEased = (t) => {
  const out = {};
  for (const k of ISOS) {
    const f = ISO_FLIPS[k].filter(([ft]) => ft <= t);
    if (!f.length) {
      out[k] = 0;
      continue;
    }
    const [ft, on] = f[f.length - 1];
    const x = ss(ft, ft + 0.7, t);
    out[k] = on ? x : 1 - x;
  }
  return out;
};
/** the walk speed slider (the tour never moves it) and the walk button lit for 0.6 s after a press */
export const walkLitAt = (t) => {
  let lit = null;
  for (const e of SCRIPT) if (e.walk && e.t <= t && t < e.t + 0.6) lit = e.walk;
  return lit;
};

// ------------------------------------------------------------ views; u = seconds since the view came on
export const VIEW_FN = {
  all: (u) => ({tx: 0.1, ty: 1.35, tz: 0.4, az: 30 + 0.6 * u, el: 12, d: 13.5, sx: -10, sy: -46}),
  header: (u) => ({tx: 0.98, ty: 2.31, tz: -0.07, az: 20 + 0.4 * u, el: 2, d: 2.75, sx: -10, sy: -30}),
  floor: (u) => ({tx: 0, ty: 0, tz: 0.1, az: 0.4 * Math.sin(u * 0.2), el: 88, d: 8.2, sx: -10, sy: -44}),
  edge: (u) => ({tx: 0.1, ty: 1.22, tz: 0.25, az: 32 + 0.5 * u, el: 8, d: 7.2, sx: -10, sy: -10}),
};
const VIEWS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
// blend two cameras: the distance in log space, so a zoom reads as one move
export const blendCam = (a, b, k) => {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  o.d = Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k);
  return o;
};
export const viewAt = (t) => VIEWS.filter(([a]) => a <= t).pop();
export const camAt = (t) => {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[VIEWS[i][1]](t - VIEWS[i][0]);
  if (i > 0) {
    const k = ss(VIEWS[i][0], VIEWS[i][0] + 1.8, t);
    if (k < 1) return blendCam(VIEW_FN[VIEWS[i - 1][1]](t - VIEWS[i - 1][0]), cur, k);
  }
  return cur;
};

// ------------------------------------------------------------ the operator's pointer
export function makeFilmCursor(ui) {
  const presses = [];
  let D = SPEC.detD;
  for (const e of SCRIPT) {
    if (e.t <= 0) continue;
    const late = SCRIPT.some((x) => x.view && x.t === e.t && x !== e) && !e.view ? 0.3 : 0;
    if (e.view) presses.push({t: e.t, spot: ui.spots[`v_${e.view}`]});
    if (e.iso) presses.push({t: e.t + late, spot: ui.spots[`i_${e.iso}`]});
    if (e.display) presses.push({t: e.t, spot: ui.spots[`d_${e.display}`]});
    if (e.walk) presses.push({t: e.t, spot: ui.spots[`w_${e.walk}`]});
    if (e.mode) presses.push({t: e.t, spot: ui.spots[`m_${e.mode}`]});
    if (e.slide === 'D') {
      // a drag: grab the knob, glide it to the new value
      presses.push({t: e.t - 0.05, spot: ui.spots.slD(D)}, {t: e.t + e.dur, spot: ui.spots.slD(e.to)});
      D = e.to;
    }
  }
  return makeCursor(presses);
}

// ------------------------------------------------------------ the labels, per view, in world coordinates
const V3 = THREE.Vector3;
const leafX = (s, sgn) => sgn * (SPEC.leafW / 2 + s.x);
const mm = (x) => `${Math.round(x * 1000)} mm`;
const PARTS = [
  {v: ['all'], name: '無目（むめ）', sub: '戸の上の箱・中にエンジン', at: () => new V3(-1.15, L.hdr.y1, L.hdr.z1)},
  {v: ['all'], name: '起動センサー（外）', sub: (s) => (s.sOut ? '人を検出中' : '動く人を見る'), at: () => new V3(0.1, L.sensY - 0.03, L.hdr.z1 + 0.05)},
  {v: ['all'], name: '検出範囲（外）', sub: (s) => `奥行 ${s.D.toFixed(2)} m × 幅 ${SPEC.detW.toFixed(2)} m`, at: (s) => new V3(-0.6, 0, s.D)},
  {v: ['all'], name: '戸（両引き 2枚）', sub: (s) => `1枚 ${SPEC.leafKg} kg・すき間 ${mm(s.gap)}`, at: (s) => new V3(leafX(s, 1), 1.55, 0.02)},
  {v: ['all'], name: 'FIX（はめ殺し）', sub: '開いた戸はこの前に入る', at: () => new V3(-1.3, 1.6, L.fixZ)},
  {v: ['all', 'edge'], name: '補助光電センサー', sub: (s) => (s.sAux ? '光線が遮られた' : `光線 2本・高さ ${SPEC.auxH[0].toFixed(2)} / ${SPEC.auxH[1].toFixed(2)} m`), at: () => new V3(SPEC.openW / 2 + 0.025, 1.08, L.beamZ)},
  {v: ['header'], name: 'DCブラシレスモーター', sub: (s) => `${SPEC.motorV} V・${Math.round(s.rpmMotor)} rpm`, at: () => new V3(1.15, L.motor.y + L.motor.r, L.motor.z)},
  {v: ['header'], name: '減速機 1:12', sub: '回転を 1/12 に・力は 12 倍', at: () => new V3(1.5, L.gear.y1, L.gear.z1)},
  {v: ['header'], name: '駆動プーリー φ40 mm', sub: (s) => `${s.rpmPulley.toFixed(1)} rpm`, at: () => new V3(L.pulX, L.pulY - L.pulR, L.beltZ + 0.012)},
  {v: ['header'], name: '歯付きベルト・上の走り', sub: '左の戸を留める・開くとき左へ', at: () => new V3(0.45, L.runTop, L.beltZ)},
  {v: ['header'], name: '下の走り', sub: '右の戸を留める・開くとき右へ', at: () => new V3(0.3, L.runBot, L.beltZ + 0.01)},
  {v: ['header'], name: '留め金（右の戸）', sub: '下の走りをつかむ', at: (s) => new V3(leafX(s, 1) + 0.1, L.runBot - 0.009, L.beltZ + 0.016)},
  {v: ['header'], name: '吊車', sub: '戸1枚に2個・レールに乗る', at: (s) => new V3(leafX(s, 1) - 0.27, L.railY + L.rollR, L.railZ + 0.012)},
  {v: ['header'], name: 'レール', sub: '戸をつり下げる', at: () => new V3(0.62, L.railY - 0.01, L.railZ + 0.012)},
  {v: ['floor'], name: '検出範囲（外）', sub: (s) => `奥行 ${s.D.toFixed(2)} m・動く人を見る`, at: (s) => new V3(SPEC.detW / 2, 0, s.D * 0.75)},
  {v: ['floor'], name: '検出範囲（内）', sub: (s) => `奥行 ${s.D.toFixed(2)} m`, at: (s) => new V3(SPEC.detW / 2, 0, -s.D * 0.75)},
  {v: ['floor'], name: '保護領域（補助光電）', sub: `戸の前後 ${SPEC.auxBand * 1000} mm`, at: () => new V3(-SPEC.openW / 2, 0, SPEC.auxBand)},
  {v: ['edge'], name: '戸先', sub: (s) => `すき間 ${mm(s.gap)}・${Math.round(s.speedMM)} mm/s`, at: (s) => new V3(leafX(s, 1) - SPEC.leafW / 2, 1.75, 0.02)},
  {v: ['edge'], name: '保護領域', sub: `走行面の前後 ${SPEC.auxBand * 1000} mm`, at: () => new V3(-0.55, 0, SPEC.auxBand)},
];
const VP = {x0: 360, x1: 1240, y0: 112, y1: 740};
// views whose subject is a long horizontal box: the labels go in a row above it and a row below, never over it
const ROWS = {header: {top: 168, bot: 590, w: 226, mid: () => new V3(0.98, L.pulY, L.beltZ)}};
export function makeLabels(st) {
  return (s, view, o) => {
    if (o < 0.02) return [];
    const rows = ROWS[view];
    const pts = PARTS.filter((p) => p.v.includes(view))
      .map((p) => ({p, at: st.project(...p.at(s).toArray())}))
      .filter((x) => x.at && x.at[1] > VP.y0 + 10 && x.at[1] < VP.y1 - 10 && (rows ? x.at[0] > VP.x0 + 20 && x.at[0] < VP.x1 - 20 : x.at[0] > VP.x0 + 250 && x.at[0] < VP.x1 - 250));
    const out = [];
    const sub = (c) => (typeof c.p.sub === 'function' ? c.p.sub(s) : c.p.sub);
    if (rows) {
      // split at the subject's middle, place left to right, and slide a row back if it runs past the right edge
      // above the belt's centre line → the upper row, below it → the lower one
      const mid = st.project(...rows.mid().toArray())?.[1] ?? 450;
      // left to right with a fixed pitch, the line slid back if it runs past the right edge
      const place = (list) => {
        const xs = [];
        let prev = -1e9;
        for (const c of list) {
          prev = Math.max(c.at[0] - rows.w / 2, prev + rows.w + 14);
          xs.push(prev);
        }
        const over = Math.max(0, (xs[xs.length - 1] ?? 0) + rows.w - VP.x1);
        return xs.map((x) => x - over);
      };
      for (const [list, y0, dy] of [[pts.filter((x) => x.at[1] < mid), rows.top, -52], [pts.filter((x) => x.at[1] >= mid), rows.bot, 52]]) {
        list.sort((a, b) => a.at[0] - b.at[0]);
        let xs = place(list);
        // one line too crowded: every other label steps one line further from the box, each line spaced on its own
        const two = xs.length > 0 && xs[0] < VP.x0;
        const line = list.map((_, i) => (two ? i % 2 : 0));
        if (two) {
          const l0 = place(list.filter((_, i) => i % 2 === 0));
          const l1 = place(list.filter((_, i) => i % 2 === 1));
          xs = list.map((_, i) => (i % 2 ? l1[(i - 1) / 2] : l0[i / 2]));
        }
        list.forEach((c, i) => out.push({name: c.p.name, sub: sub(c), at: c.at, label: [Math.max(VP.x0, xs[i]), y0 + line[i] * dy], w: rows.w, o, up: y0 < mid}));
      }
      return out;
    }
    // two columns, stacked by height so no two labels touch
    const Lc = pts.filter((x) => x.at[0] < 800).sort((a, b) => a.at[1] - b.at[1]);
    const Rc = pts.filter((x) => x.at[0] >= 800).sort((a, b) => a.at[1] - b.at[1]);
    const stack = (col, x, w) => {
      const ys = [];
      let y = VP.y0 + 8;
      for (const c of col) {
        y = Math.max(y, c.at[1] - 12);
        ys.push(y);
        y += 50;
      }
      const over = Math.max(0, (ys[ys.length - 1] ?? 0) - (VP.y1 - 44));
      col.forEach((c, i) => out.push({name: c.p.name, sub: sub(c), at: c.at, label: [x, Math.max(VP.y0 + 8 + i * 50, ys[i] - over)], w, o}));
    };
    stack(Lc, VP.x0, 236);
    stack(Rc, VP.x1 - 236, 236);
    return out;
  };
}

// ------------------------------------------------------------ the one-line explanation
const M = SPEC.modes;
export function noteFor(s, iso, view) {
  if (iso === 'engine')
    return `DCブラシレスモーター（${SPEC.motorV} V）の回転を減速機で 1/${SPEC.ratio} に落とし、φ${SPEC.pulleyD * 1000} mm の駆動プーリーが歯付きベルトを回す。いま ${Math.round(s.rpmMotor)} rpm → プーリー ${s.rpmPulley.toFixed(0)} rpm。`;
  if (iso === 'belt') return 'ベルトは1本のループ。左の戸は上の走り、右の戸は下の走りに留めてあるので、上下が逆向きに動き、2枚は左右へ同じ速さで開く。戸は吊車でレールにつり下がる。';
  if (s.state === ST.REV) return `閉まる途中で補助光電の光線が遮られた。${SPEC.reverseT} 秒で止めて開き直す（反転）。起動センサーは止まっている人を見ないので、戸の間はこの光線が守る。`;
  if (iso === 'sensor' || view === 'floor')
    return `起動センサーは床の検出範囲で動く人を見る。奥行が浅いと、着いたとき戸が開ききっていない（${SPEC.detDMin.toFixed(2)} m・${SPEC.walk} m/s で約 421 mm）。${SPEC.passGap * 1000} mm に足りないと人は足を緩める。`;
  if (s.mode === 'gentle') return `高齢者・子どもが多い建物：開 ${M.gentle.vOpen * 1000}・閉 ${M.gentle.vClose * 1000} mm/s 以下。戸1枚 ${SPEC.leafKg} kg の運動エネルギーは開 ${s.keOpen.toFixed(1)} J・閉 ${s.keClose.toFixed(2)} J。`;
  if (s.state === ST.OPENING) return `起動センサーの検出から ${SPEC.sensorDelay} 秒で開き始める。${SPEC.aOpen} m/s² で加速、${M.normal.vOpen * 1000} mm/s で走り、最後の ${SPEC.creep * 1000} mm は低速で寄せる。`;
  if (s.state === ST.HOLD) return `人を検出している間は保持タイマーが ${SPEC.holdT.toFixed(1)} 秒に戻る。誰もいなくなって ${SPEC.holdT.toFixed(1)} 秒で閉じ始める。`;
  if (s.state === ST.CLOSING) return `閉の速さは ${M.normal.vClose * 1000} mm/s 以下。戸1枚の運動エネルギー ½mv² を ${SPEC.keMax} J 以下に収め、ぶつかっても重いけがにならないようにする。`;
  return `待機中。起動センサーが人を待つ。開 ${M.normal.vOpen * 1000} mm/s で戸1枚 ${s.keOpen.toFixed(2)} J、上限は ${SPEC.keMax} J。`;
}

/** the leaf speed over the last 8 s (161 samples, oldest first) from the stored run */
export function histAt(t, R = REC) {
  const out = new Array(161);
  for (let k = 0; k <= 160; k++) {
    const tt = t - 8 + (k / 160) * 8;
    out[k] = tt < 0 ? 0 : R.v[idxOf(R, tt)];
  }
  return out;
}
/** the walkers' tracks for the plan view: floor points every 40 ms from where each started to now, the latest 4 */
export function tracksAt(t, R = REC) {
  const i = idxOf(R, t);
  return R.peds.filter((p) => p.i0 <= i && i - p.i1 < 14000).slice(-4).map((p) => {
    const end = Math.min(i, p.i1);
    const pts = [];
    for (let k = p.i0; k <= end; k += 40) {
      const s = p.s[k - p.i0];
      pts.push(p.p0x + p.ux * s, p.p0z + p.uz * s);
    }
    return pts;
  });
}

/** floor tracks [[x, z, ...]] to screen polylines [[px, py, ...]] (drawn by the console, crisp at any size) */
export function projectTracks(st, tracks) {
  return tracks.map((pts) => {
    const out = [];
    for (let k = 0; k < pts.length; k += 2) {
      const p = st.project(pts[k], 0.01, pts[k + 1]);
      if (p) out.push(p[0], p[1]);
    }
    return out;
  });
}

/** draws the console from the frame's state */
export function makeConsoleFrame(ui, st) {
  const labels = makeLabels(st);
  return (s) => {
    ui.update({
      st: s.st,
      view: s.view,
      iso: s.iso,
      display: s.display,
      walk: s.walk,
      walkLit: s.walkLit,
      note: noteFor(s.st, s.iso, s.view),
      hist: s.hist,
      walker: s.walker,
      callouts: labels(s.st, s.view, s.labels),
      tracks: s.tracks,
      trackK: s.trackK,
      cursor: s.cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createDoorStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeFilmCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.AD = st;
    return {
      resize,
      render(t) {
        const s = motionAt(t);
        const disp = displayAt(t);
        const iso = isoAt(t);
        const cam = camAt(t);
        const [vt0, view] = viewAt(t);
        const trackK = view === 'floor' ? ss(vt0 + 0.8, vt0 + 1.8, t) : 0;
        st.frame(s, {cut: disp.cut, iso: isoEased(t)}, {...cam, az: cam.az * D2R, el: cam.el * D2R});
        frame({
          st: s,
          view,
          iso,
          display: disp,
          walk: SPEC.walk,
          walkLit: walkLitAt(t),
          hist: histAt(t),
          walker: lastWalker(REC.events, t),
          labels: disp.labels * (vt0 === 0 ? 1 : ss(vt0 + 1.4, vt0 + 2.0, t)),
          tracks: trackK > 0 ? projectTracks(st, tracksAt(t)) : [],
          trackK,
          cursor: cursorAt(t),
        });
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
