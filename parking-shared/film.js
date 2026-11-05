// The parking lift film: the lift (lift.js) in its studio (stage.js) under the Japanese console (console.js). The
// operator picks the 中型 car and raises it out of the pit, goes to the power unit to watch the pump fill two plungers
// (Pascal: the pressure reads the weight; the flow sets the speed) and the chain double the stroke, watches the
// latches go in and the gate open, swaps in a 軽 car, sends someone into the boarding zone so 下げる is refused, and
// lowers it again with the motor standing still. A pure function of t: every pose comes from one planned run.
import {runSim} from 'teardown-kit/runtime.js';
import * as THREE from 'three';
import {makeCursor} from '../building-kit/cursor.js';
import {createConsole, ISOS} from './console.js';
import {histAt, pressureOf, SPEC, stateAt} from './kin.js';
import {L} from './lift.js';
import {DISPLAY0, DURATION, SCRIPT, tourRun} from './script.js';
import {createLiftStage} from './stage.js';

export {DISPLAY0, DURATION, SCRIPT};
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'parking', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the motion: one planned run of the whole tour
export const REC = tourRun();
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
/** the operating button lit for 0.6 s after a press */
export const opLitAt = (t) => {
  let lit = null;
  for (const e of SCRIPT) {
    const k = e.cmd ?? e.person;
    if (k && e.t <= t && t < e.t + 0.6) lit = k;
  }
  return lit;
};

// ------------------------------------------------------------ views; u = seconds since the view came on
export const VIEW_FN = {
  all: (u) => ({tx: 0.35, ty: -0.25, tz: 0.2, az: 40 + 0.45 * u, el: 25, d: 15.5, sx: -10, sy: -26}),
  hyd: (u) => ({tx: 1.75, ty: -0.6, tz: -1.25, az: 66 + 0.3 * u, el: 13, d: 11, sx: -30, sy: -22}),
  safe: (u) => ({tx: 0.15, ty: 0.7, tz: 1.6, az: 30 + 0.3 * u, el: 14, d: 12.5, sx: 70, sy: -20}),
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
  for (const e of SCRIPT) {
    if (e.t <= 0) continue;
    const late = SCRIPT.some((x) => x.view && x.t === e.t && x !== e) && !e.view ? 0.3 : 0;
    if (e.view) presses.push({t: e.t, spot: ui.spots[`v_${e.view}`]});
    if (e.iso) presses.push({t: e.t + late, spot: ui.spots[`i_${e.iso}`]});
    if (e.display) presses.push({t: e.t, spot: ui.spots[`d_${e.display}`]});
    if (e.cmd) presses.push({t: e.t, spot: ui.spots[`o_${e.cmd}`]});
    if (e.person) presses.push({t: e.t, spot: ui.spots[`o_${e.person}`]});
    if (e.car) presses.push({t: e.t, spot: ui.spots[`c_${e.car}`]});
  }
  return makeCursor(presses);
}

// ------------------------------------------------------------ the labels, per view, in world coordinates
const V3 = THREE.Vector3;
const U = L.unit;
const mpa = (p) => `${(p / 1e6).toFixed(2)} MPa`;
const PARTS = [
  {v: ['all'], name: '上段パレット', sub: (s) => (s.atBottom ? '地上が床・空き' : `床 ${s.h.toFixed(2)} m・空き`), at: (s) => new V3(-1.1, s.h, -2.4)},
  {v: ['all'], name: '下段パレット', sub: (s) => `${s.carName} ${s.carKg.toLocaleString('en-US')} kg を載せる`, at: (s) => new V3(-1.15, s.hLower, 1.6)},
  {v: ['all'], name: '油圧シリンダ（単動）', sub: '左右 2 本・ピットの中', at: () => new V3(L.cylX, -1.35, L.barrelR)},
  {v: ['all'], name: '油圧ユニット', sub: `モーター ${SPEC.motorKW} kW・タンク`, at: () => new V3(U.x1, U.h, (U.z0 + U.z1) / 2)},
  {v: ['all'], name: 'ゲート', sub: (s) => (s.gate > 0.999 ? '開' : s.gate < 0.001 ? '閉：閉じないと動かない' : '動作中'), at: (s) => new V3(1.2 + SPEC.gateTravel * s.gate - 0.3, L.gateH, L.gateZ)},
  {v: ['hyd'], name: `モーター ${SPEC.motorKW} kW`, sub: (s) => `${Math.round(s.rpm)} rpm`, at: () => new V3(2.28, U.h + 0.24, -2.62)},
  {v: ['hyd'], name: `ポンプ ${SPEC.pumpCc} cm³/回転`, sub: (s) => `${s.Lmin.toFixed(1)} L/min`, at: () => new V3(2.28, U.h + 0.06, -2.33)},
  {v: ['hyd'], name: '弁（逆止・安全・下降）', sub: (s) => (s.v < -1e-6 ? '下降弁が開き、流量を絞る' : '止まると逆止弁が閉じる'), at: () => new V3(1.88, U.h + 0.12, -2.22)},
  {v: ['hyd'], name: '圧力計', sub: (s) => mpa(s.p), at: () => new V3(2.0, U.h + 0.36, -2.19)},
  {v: ['hyd'], name: `プランジャ φ${SPEC.plungerD * 1000}`, sub: (s) => `押す力 ${(s.F / 1000).toFixed(1)} kN`, at: (s) => new V3(L.cylX, L.headY0 + s.plunger - 0.35, 0.03)},
  {v: ['hyd'], name: 'スプロケット', sub: 'チェーンを折り返す：2:1', at: (s) => new V3(L.cylX + 0.04, L.headY0 + s.plunger + L.sprR, 0)},
  {v: ['hyd'], name: '吊チェーン（片側 2 本）', sub: (s) => `1 本 ${(s.T / 1000).toFixed(2)} kN`, at: (s) => new V3(L.cylX + 0.025, (L.attachY0 + s.h + L.headY0 + s.plunger) / 2, L.sprR)},
  {v: ['hyd'], name: 'シリンダ', sub: '油が入るとプランジャが伸びる', at: () => new V3(L.cylX + 0.06, -1.55, 0)},
  {v: ['safe'], name: 'ラッチ（降下制限装置）', sub: (s) => (s.latched ? '上段を機械で支える' : s.latch > 0 ? '動作中' : '外れている'), at: () => new V3(L.colX - 0.15, L.pawlY, L.colZ)},
  {v: ['safe'], name: 'エリアセンサー', sub: (s) => (s.person ? '人を検知 → 起動しない' : '乗降領域の人を見る'), at: () => new V3(L.sensor.x, L.sensor.y + 0.06, L.sensor.z)},
  {v: ['safe'], name: '乗降領域', sub: '地上にあるパレットの上', at: () => new V3(-1.0, 0.01, 2.7)},
  {v: ['safe'], name: 'はみ出し検知の光線', sub: (s) => (s.overhang ? '車がはみ出している' : 'パレットの前後端'), at: () => new V3(0.9, L.beamY, SPEC.beamZ)},
];
const VP = {x0: 360, x1: 1240, y0: 112, y1: 740};
// where the two label columns stand, per view (the hydraulic view keeps its left column just right of the cylinder)
const COLS = {hyd: [620, 1004]};
export function makeLabels(st) {
  return (s, view, o) => {
    if (o < 0.02) return [];
    const pts = PARTS.filter((p) => p.v.includes(view))
      .map((p) => ({p, at: st.project(...p.at(s).toArray())}))
      .filter((x) => x.at && x.at[1] > VP.y0 + 10 && x.at[1] < VP.y1 - 10 && x.at[0] > VP.x0 + 10 && x.at[0] < VP.x1 - 10);
    const out = [];
    const sub = (c) => (typeof c.p.sub === 'function' ? c.p.sub(s) : c.p.sub);
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
    const [cl, cr] = COLS[view] ?? [VP.x0, VP.x1 - 236];
    stack(Lc, cl, 236);
    stack(Rc, cr, 236);
    return out;
  };
}

// ------------------------------------------------------------ the one-line explanation
export function noteFor(s, iso, view) {
  if (s.refusal) return `${s.refusal.text}ので起動しない。乗降領域の人と車のはみ出しは、動き出す前に必ず確かめる（インタロック）。`;
  if (iso === 'chain')
    return `プランジャの頭のスプロケットにチェーンを掛け、片端はシリンダに、もう片端は下段のパレットに留める。プランジャが ${(s.plunger).toFixed(2)} m 伸びるとパレットは 2 倍の ${s.h.toFixed(2)} m 上がる。力は 2 倍要る。`;
  if (iso === 'hyd' || view === 'hyd')
    return `ポンプが送った油は、シリンダの中でどこも同じ圧力になる（パスカルの原理）。圧力 × 面積が押す力。重さが変わると圧力が変わり、速さは流量で決まる。`;
  if (s.phase === 'down') return `下げるときモーターは回らない。下降弁を開き、流量調整弁が戻る油を ${(SPEC.flow * 60000).toFixed(2)} L/min に絞るので、車の重さによらず同じ速さで下がる。`;
  if (s.latched || s.phase === 'latch' || s.phase === 'gateOpen') return `上で止まるとラッチが上段のパレットの下に入り、機械で支える。油が漏れても ${SPEC.latchGap * 1000} mm で止まる（50 mm 以下の決まり）。`;
  if (view === 'safe') return `ゲートが閉じていないと動かない。乗降領域に人がいる、車がはみ出している、ときも起動しない。`;
  if (s.phase === 'up') return `車 ${s.carKg.toLocaleString('en-US')} kg と可動部 ${SPEC.frameKg} kg を、油圧シリンダ 2 本で押し上げる。つり合いおもりは無いので、重さは全部油が支える。`;
  return `ピット2段：下段の車はピットに沈み、上段のパレットが地上の床になる。下段の車を出すときは枠ごと ${SPEC.stroke.toFixed(2)} m 持ち上げる。`;
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
      opLit: s.opLit,
      note: noteFor(s.st, s.iso, s.view),
      hist: s.hist,
      pCar: pressureOf(s.st.carKg) / 1e6,
      callouts: labels(s.st, s.view, s.labels),
      cursor: s.cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createLiftStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeFilmCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.PK = st;
    return {
      resize,
      render(t) {
        const s = motionAt(t);
        const disp = displayAt(t);
        const iso = isoAt(t);
        const cam = camAt(t);
        const [vt0, view] = viewAt(t);
        st.frame(s, {cut: disp.cut, iso: isoEased(t)}, {...cam, az: cam.az * D2R, el: cam.el * D2R});
        frame({
          st: s,
          view,
          iso,
          display: disp,
          opLit: opLitAt(t),
          hist: histAt(REC, t),
          labels: disp.labels * (vt0 === 0 ? 1 : ss(vt0 + 1.4, vt0 + 2.0, t)),
          cursor: cursorAt(t),
        });
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
