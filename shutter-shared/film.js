// The shutter film: the shutter (shutter.js) in its studio (stage.js) under the Japanese console (console.js). The
// operator closes the open shop front, opens the case to watch the coil thin out and the torque climb as it unwinds,
// isolates the opener (chain, gearbox, motor, brake), goes down to the bottom edge, puts a 0.30 m box under the curtain
// (touch, switch, stop within 20 mm, climb back), takes the box away and closes. A pure function of t: every pose comes
// from one plan built from the script's presses.
import {runSim} from 'teardown-kit/runtime.js';
import * as THREE from 'three';
import {makeCursor} from '../building-kit/cursor.js';
import {createConsole, ISOS} from './console.js';
import {frameState, holdTorque, SPEC, torquePeak} from './kin.js';
import {DISPLAY0, DURATION, SCRIPT, tourPlan} from './script.js';
import {L} from './shutter.js';
import {createShutterStage} from './stage.js';

export {DISPLAY0, DURATION, SCRIPT};
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'shutter', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const S = SPEC;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the motion: one plan of the whole tour
export const REC = tourPlan();
export const motionAt = (t) => frameState(REC, t);

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
/** the push button lit for 0.6 s after a press */
export const litAt = (t) => {
  let lit = null;
  for (const e of SCRIPT) if (e.cmd && e.t <= t && t < e.t + 0.6) lit = e.cmd === 'obsOn' || e.cmd === 'obsOff' ? 'obs' : e.cmd;
  return lit;
};

// ------------------------------------------------------------ views; u = seconds since the view came on
export const VIEW_FN = {
  all: (u) => ({tx: 0.25, ty: 1.85, tz: 0, az: 24 + 0.45 * u, el: 8, d: 12.2, sx: -10, sy: -40}),
  drum: (u) => ({tx: 1.92, ty: 3.15, tz: -0.13, az: 38 + 0.3 * u, el: 13, d: 2.7, sx: -10, sy: -14}),
  seat: (u) => ({tx: 0.2, ty: 0.48, tz: 0.05, az: 24 + 0.3 * u, el: 12, d: 4.0, sx: -10, sy: -40}),
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
    if (e.cmd === 'obsOn' || e.cmd === 'obsOff') presses.push({t: e.t, spot: ui.spots.obs});
    else if (e.cmd) presses.push({t: e.t, spot: ui.spots[`c_${e.cmd}`]});
  }
  return makeCursor(presses);
}

// ------------------------------------------------------------ the labels, per view, in world coordinates
const V3 = THREE.Vector3;
const Cs = L.case;
const PARTS = [
  {v: ['all'], name: 'シャッターケース', sub: '中に巻取りシャフト', at: () => new V3(-1.2, Cs.y1 - 0.1, Cs.z1)},
  {v: ['all'], name: 'スラット（鋼板 1.6 mm）', sub: `ピッチ ${S.slat.pitch * 1000} mm・${S.slat.kgm2} kg/m²`, at: (s) => new V3(-0.7, Math.min(S.H - 0.25, s.h + 0.6), 0.01)},
  {v: ['all'], name: 'ガイドレール', sub: 'カーテンの両端を案内', at: () => new V3(L.railX - 0.05, 1.7, L.railZ)},
  {v: ['all'], name: '座板', sub: (s) => `床から ${s.h.toFixed(2)} m`, at: (s) => new V3(0.8, s.h + 0.05, 0.03)},
  {v: ['all'], name: '押しボタン', sub: '開・停・閉', at: () => new V3((L.btn.x0 + L.btn.x1) / 2, L.btn.y1, L.wallZ1 + 0.04)},
  {v: ['all'], name: '開閉機', sub: 'ケースの右端', at: () => new V3(2.2, L.motY, L.shaftZ + 0.08)},
  {v: ['drum'], name: '巻いたスラット（渦巻き）', sub: (s) => `半径 ${s.rMM.toFixed(0)} mm・1巻き ${S.layer * 1000} mm ずつ`, at: (s) => new V3(S.Wc / 2, L.shaftY - s.r * 0.7, L.shaftZ + s.r * 0.7)},
  {v: ['drum'], name: '巻取りシャフト', sub: `鋼管 φ${(S.shaftOD * 1000).toFixed(1)}`, at: () => new V3(1.78, L.shaftY - S.r0, L.shaftZ + 0.02)},
  {v: ['drum'], name: 'シャフトスプロケット', sub: `${S.zShaft} 歯・${(S.shaftRpm).toFixed(0)} rpm`, at: () => new V3(L.sprX, L.shaftY - S.rSprShaft, L.shaftZ + 0.03)},
  {v: ['drum'], name: 'ローラチェーン', sub: `${S.zMotor}T → ${S.zShaft}T`, at: () => new V3(L.sprX, L.shaftY + 0.13, L.shaftZ + 0.085)},
  {v: ['drum'], name: '減速機 1:48', sub: '電動機の回転を落とす', at: () => new V3(2.0, L.motY + 0.12, L.shaftZ)},
  {v: ['drum'], name: 'モーター 0.4 kW', sub: (s) => `三相 200 V・${s.rpmMotor.toFixed(0)} rpm`, at: () => new V3(2.2, L.motY + 0.075, L.shaftZ)},
  {v: ['drum'], name: 'ブレーキ', sub: (s) => (s.regime === '保持' ? '止まっている間カーテンを支える' : '開閉中は解放'), at: () => new V3(2.38, L.motY + 0.078, L.shaftZ)},
  {v: ['seat'], name: '座板', sub: (s) => `床から ${s.h.toFixed(3)} m`, at: (s) => new V3(-0.15, s.h + L.edgeH + L.seatH, 0.02), dy: -92},
  {v: ['seat'], name: '感知ゴム・座板スイッチ', sub: (s) => (s.comp >= S.edgeComp - 1e-6 ? `押し込み ${(s.comp * 1000).toFixed(0)} mm → 感知` : `${S.edgeComp * 1000} mm 押されると入る`), at: (s) => new V3(0.9, s.h + 0.012, 0.018), dy: 40},
  {v: ['seat'], name: '送信機', sub: '感知を制御盤へ送る', at: (s) => new V3(-0.48, s.h + L.edgeH + L.seatH + 0.05, 0.046), dy: -112},
  {v: ['seat'], name: '障害物（箱）', sub: `高さ ${S.obsH.toFixed(2)} m`, at: () => new V3(L.obs.x1, S.obsH * 0.5, L.obs.z1), when: (s) => s.obsK > 0.5},
];
const VP = {x0: 360, x1: 1240, y0: 112, y1: 740};
// views whose subject is a long horizontal band: the labels go in a row above it and a row below, never over it
const ROWS = {drum: {top: 128, bot: 610, w: 206, mid: () => new V3(1.9, L.motY - 0.06, L.shaftZ)}};
export function makeLabels(st) {
  return (s, view, o) => {
    if (o < 0.02) return [];
    const rows = ROWS[view];
    const pts = PARTS.filter((p) => p.v.includes(view) && (!p.when || p.when(s)))
      .map((p) => ({p, at: st.project(...p.at(s).toArray())}))
      .filter((x) => x.at && x.at[1] > VP.y0 + 10 && x.at[1] < VP.y1 - 10 && x.at[0] > VP.x0 + 20 && x.at[0] < VP.x1 - 20);
    const out = [];
    const sub = (c) => (typeof c.p.sub === 'function' ? c.p.sub(s) : c.p.sub);
    if (rows) {
      // split at the subject's middle, place left to right with a fixed pitch, slide a row back if it runs past the edge
      const mid = st.project(...rows.mid().toArray())?.[1] ?? 450;
      const place = (list) => {
        const xs = [];
        let prev = -1e9;
        for (const c of list) {
          prev = Math.max(c.at[0] - rows.w / 2, prev + rows.w + 12, VP.x0);
          xs.push(prev);
        }
        const over = Math.max(0, (xs[xs.length - 1] ?? 0) + rows.w - VP.x1);
        return xs.map((x) => x - over);
      };
      for (const [list, y0] of [[pts.filter((x) => x.at[1] < mid), rows.top], [pts.filter((x) => x.at[1] >= mid), rows.bot]]) {
        list.sort((a, b) => a.at[0] - b.at[0]);
        const xs = place(list);
        list.forEach((c, i) => out.push({name: c.p.name, sub: sub(c), at: c.at, label: [Math.max(VP.x0, xs[i]), y0], w: rows.w, o, up: y0 < mid}));
      }
      return out;
    }
    // two columns at the viewport's sides, stacked by where each label wants to sit so no two labels touch
    const want = (c) => c.at[1] - 12 + (c.p.dy ?? 0);
    const Lc = pts.filter((x) => x.at[0] < 800).sort((a, b) => want(a) - want(b));
    const Rc = pts.filter((x) => x.at[0] >= 800).sort((a, b) => want(a) - want(b));
    const stack = (col, x, w) => {
      const ys = [];
      let y = VP.y0 + 8;
      for (const c of col) {
        y = Math.max(y, want(c));
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
const PK = torquePeak();
export function noteFor(s, iso, view) {
  if (s.kind === 'obs' || s.kind === 'rev' || (s.det && s.sinceDet < 4))
    return `座板が箱に触れ、感知ゴムが ${S.edgeComp * 1000} mm 押されるとスイッチが入る。送信機から制御盤へ、${S.detDelay} 秒でブレーキ、${S.brakeT} 秒で停止。触れてから ${s.det ? (s.det.dist * 1000).toFixed(0) : '20'} mm（基準 ${S.stopMax * 1000} mm 以下）。そのあと少し上げて止まる。`;
  if (iso === 'coil')
    return `スラットは巻くたびに山の高さ ${S.layer * 1000} mm ずつ外へ重なる（渦巻き）。巻取り半径は全閉 ${(rClosed() * 1000).toFixed(0)} mm → 全開 ${(rOpen() * 1000).toFixed(0)} mm。シャフトは同じ ${S.shaftRpm} rpm でも、半径が大きいほど速く巻き取り・繰り出す。`;
  if (iso === 'drive')
    return `開閉機：三相 ${S.motorV} V・${S.motorKW} kW のモーター → 減速機 1:${S.gearRatio} → チェーン ${S.zMotor}T→${S.zShaft}T で巻取りシャフトを ${S.shaftRpm} rpm で回す。スプリングは無く、止まっている間はモーター軸のブレーキがカーテンの重さを支える。`;
  if (view === 'seat' && s.obsOn) return `箱の高さ ${S.obsH.toFixed(2)} m は、試験で人が挟まれる位置（閉まった位置から 30 cm）。座板が触れたら 5 cm 以内に止まらなければならない（告示）。`;
  if (s.kind === 'down')
    return `下降：カーテンの重さが下ろす向きにシャフトを回すので、モーターは制動。下りるほど吊り重量は増え、巻取り半径は減る。トルク = 吊り重量 × 半径。最大は開度 ${((100 * PK.h) / S.H).toFixed(0)} % の ${PK.T.toFixed(0)} N·m。`;
  if (s.kind === 'up') return `上昇：モーターがカーテンを持ち上げる（力行）。巻くほど半径が増え、同じ ${S.shaftRpm} rpm でも速くなる。`;
  if (s.atClosed) return `全閉：吊り重量 ${s.hangKg.toFixed(0)} kg・半径 ${s.rMM.toFixed(0)} mm でトルク ${s.Ts.toFixed(0)} N·m。最大はもう少し開いた ${((100 * PK.h) / S.H).toFixed(0)} % の ${PK.T.toFixed(0)} N·m。ブレーキが支えている。`;
  if (s.atOpen) return `全開：カーテンは ${s.turns.toFixed(1)} 回転ぶん巻かれ、半径 ${s.rMM.toFixed(0)} mm。吊っているのは ${s.hangKg.toFixed(0)} kg だけで、トルクは ${s.Ts.toFixed(0)} N·m。`;
  return `途中で停止：ブレーキがトルク ${holdTorque(s.h).toFixed(0)} N·m を支えている。開ける・閉めるで動き出す。`;
}
const rClosed = () => Math.sqrt(S.rc * S.rc + (S.layer * S.s0) / Math.PI);
const rOpen = () => Math.sqrt(S.rc * S.rc + (S.layer * (S.s0 + S.H)) / Math.PI);

/** draws the console from the frame's state */
export function makeConsoleFrame(ui, st) {
  const labels = makeLabels(st);
  return (s) => {
    ui.update({
      st: s.st,
      view: s.view,
      iso: s.iso,
      display: s.display,
      lit: s.lit,
      note: noteFor(s.st, s.iso, s.view),
      callouts: labels(s.st, s.view, s.labels),
      cursor: s.cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createShutterStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeFilmCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.SH = st;
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
          lit: litAt(t),
          labels: disp.labels * (vt0 === 0 ? 1 : ss(vt0 + 1.4, vt0 + 2.0, t)),
          cursor: cursorAt(t),
        });
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
