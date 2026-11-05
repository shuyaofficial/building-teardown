// The electric shutter's math, no three.js. Every number lives in SPEC (sources in ../shutter/refs.md); the geometry,
// the console and the tests all read it from here. One input poses everything: the opening h (the bottom edge's height
// above the floor, 0 = 全閉, SPEC.H = 全開). In operation h is a closed form of time: the shaft angle runs in
// constant-acceleration segments (ramp, constant speed, ramp), and h follows from the angle through the spiral of the
// coil. A plan is the list of those segments; commands (開ける・止める・閉める, the obstacle) rewrite its future, so the
// film reads a pure function of t and the live page appends the visitor's commands to the same plan.
//
// Coordinates (metres): x along the facade, y up, z across it; the curtain hangs in the plane z = 0, the street is +z.
// The shaft angle p (rad) counts from fully closed; raising the curtain winds it, so p grows with h.

export const SPEC = {
  g: 9.81,
  // 開口とカーテン
  W: 3.0, // 内のり幅
  H: 2.5, // 内のり高さ = 座板の行程
  railIn: 0.1, // 片側のレールのみ込み（カーテン幅 = W + 0.2）
  slat: {name: 'S-76', t: 0.0016, pitch: 0.074, kgm2: 22.91},
  seatKgPerM: 5, // 座板（カーテン幅 1 m あたり）
  // 巻取り
  yShaft: 3.0, // 巻取りシャフト中心の高さ（H + 0.5）
  s0: 0.2, // 全閉でも巻胴に残っているカーテンの長さ（H + 0.7 = 吊り 3.0 m + 0.2 m）
  shaftOD: 0.1143, // 巻取りシャフト（鋼管 φ114.3）
  layer: 0.018, // 1巻きごとに増える半径（スラットの山の高さ）
  // 開閉機
  motorKW: 0.4,
  motorV: 200, // 三相 200 V
  motorRpm: 1440, // 4極・50 Hz
  gearRatio: 48, // 減速機
  zMotor: 15, // 開閉機側スプロケット
  zShaft: 50, // シャフトスプロケット
  chainPitch: 0.0127, // ローラチェーン 40 番
  etaGear: 0.8,
  etaChain: 0.95,
  tRamp: 0.3, // 加速・減速にかける時間
  // 障害物感知
  obsH: 0.3, // 障害物（箱）の高さ = 試験で人が挟まれる位置
  edgeComp: 0.01, // 座板の感知ゴムがスイッチを入れるまでの押し込み
  detDelay: 0.05, // 感知 → 送信 → 制御盤 → ブレーキ
  brakeT: 0.15, // ブレーキがかかってから止まるまで
  revT: 1.5, // 止まったあと反転上昇する時間
  stopMax: 0.05, // 告示：接触を検知してから停止するまで 5 cm 以下
  testSpring: 3, // N/mm（試験ばね：5 cm で 150 N）
  pressMax: 150, // N
  forceMax: 700, // JIS：障害物感知で停止するまでの最大荷重
  vAvgMin: 1.6, // JIS 表3：電動開閉時の平均速度 m/min（内のり高さ 2〜4 m）
  vAvgMax: 6.5,
  keMax: 10, // J（告示：質量 × 速度² ≤ 20）
};
{
  const S = SPEC;
  S.Wc = S.W + 2 * S.railIn; // 3.2 m
  S.kgPerM = S.slat.kgm2 * S.Wc; // 吊ったカーテン 1 m あたり 73.3 kg
  S.seatKg = S.seatKgPerM * S.Wc; // 16 kg
  S.curtainKg = S.kgPerM * (S.yShaft + S.s0) + S.seatKg; // スラット H + 0.7 m と座板
  S.ratio = (S.gearRatio * S.zShaft) / S.zMotor; // 160
  S.shaftRpm = S.motorRpm / S.ratio; // 9 rpm
  S.omega = (S.shaftRpm * 2 * Math.PI) / 60; // rad/s
  S.alpha = S.omega / S.tRamp;
  S.eta = S.etaGear * S.etaChain; // 0.76
  S.r0 = S.shaftOD / 2;
  S.rc = S.r0 + S.layer / 2; // 1巻き目のカーテン中心の半径
  S.Trated = (S.motorKW * 1000) / ((S.motorRpm * 2 * Math.PI) / 60); // モーター軸の定格トルク
  S.rSprShaft = S.chainPitch / (2 * Math.sin(Math.PI / S.zShaft));
  S.rSprMotor = S.chainPitch / (2 * Math.sin(Math.PI / S.zMotor));
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------ the coil: an Archimedean spiral of the slat's depth
/** wound length on the drum at opening h (m of curtain) */
export const woundOf = (h, spec = SPEC) => spec.s0 + h;
/** radius where the curtain leaves the drum: s = π (r² − rc²) / layer */
export const rOfH = (h, spec = SPEC) => Math.sqrt(spec.rc * spec.rc + (spec.layer * woundOf(h, spec)) / Math.PI);
/** shaft angle from fully closed: each turn adds one layer, r = r(0) + layer · p / 2π */
export const phiOfH = (h, spec = SPEC) => (2 * Math.PI * (rOfH(h, spec) - rOfH(0, spec))) / spec.layer;
export function hOfPhi(p, spec = SPEC) {
  const r = rOfH(0, spec) + (spec.layer * p) / (2 * Math.PI);
  return (Math.PI * (r * r - spec.rc * spec.rc)) / spec.layer - spec.s0;
}
export const phiOpen = (spec = SPEC) => phiOfH(spec.H, spec);
/** the hanging curtain (from the take-off at the shaft's height down to the bottom edge) and the bottom bar, kg */
export const hangKg = (h, spec = SPEC) => spec.kgPerM * (spec.yShaft - h) + spec.seatKg;
/** shaft torque holding the hanging curtain still: weight × radius at the take-off, N·m */
export const holdTorque = (h, spec = SPEC) => hangKg(h, spec) * spec.g * rOfH(h, spec);
/** the opening where that torque peaks: d/dh[(A − Bh)·√(C + Dh)] = 0 → h = (AD − 2BC) / 3BD */
export function torquePeak(spec = SPEC) {
  const A = spec.kgPerM * spec.yShaft + spec.seatKg;
  const B = spec.kgPerM;
  const C = spec.rc * spec.rc + (spec.layer * spec.s0) / Math.PI;
  const D = spec.layer / Math.PI;
  const h = clamp((A * D - 2 * B * C) / (3 * B * D), 0, spec.H);
  return {h, T: holdTorque(h, spec)};
}
/** time for one full stroke (ramp, constant speed, ramp) and its average speed in m/min */
export function strokeTime(spec = SPEC) {
  const t = phiOpen(spec) / spec.omega + spec.tRamp;
  return {t, vAvg: (spec.H / t) * 60};
}

// ------------------------------------------------------------ loads
/**
 * From the opening h, the curtain's speed v = dh/dt and acceleration a (m/s, m/s², up positive) and the shaft's
 * angular speed w (rad/s, + winding): the tension at the take-off F = m_hang (g + a), the shaft torque F·r, the shaft
 * power F·r·w, and the motor through 1:160 at η = 0.76: ÷η when the motor lifts (力行), ×η when the curtain's weight
 * drives it (制動). Standing still the brake holds and the motor carries nothing (保持).
 */
export function loads(h, v, a, w, spec = SPEC) {
  const m = hangKg(h, spec);
  const r = rOfH(h, spec);
  const F = m * (spec.g + a);
  const Ts = F * r;
  const moving = Math.abs(w) > 1e-6;
  const Ps = Ts * w;
  const regime = !moving ? '保持' : Ps > 0 ? '力行' : '制動';
  const Tm = !moving ? 0 : Ps > 0 ? Ts / spec.ratio / spec.eta : (Ts / spec.ratio) * spec.eta;
  return {
    hangKg: m,
    r,
    F,
    Ts,
    Ps,
    Tm,
    load: Tm / spec.Trated,
    brakeT: Ts / spec.ratio, // what the brake holds on the motor shaft while still
    regime,
    rpmShaft: (Math.abs(w) * 60) / (2 * Math.PI),
    rpmMotor: ((Math.abs(w) * 60) / (2 * Math.PI)) * spec.ratio,
    ke: 0.5 * spec.curtainKg * v * v,
  };
}

// ------------------------------------------------------------ the plan: shaft-angle segments
// seg: {t0, p0, w0, a, dur, kind}; kind: 'rest' | 'restObs' (still, after an obstacle stop) | 'up' | 'down' |
// 'stopping' | 'obs' (detected: the delay, then the brake) | 'rev' (the short climb after an obstacle stop)
const REST = new Set(['rest', 'restObs']);
const segAt = (segs, t) => {
  let i = 0;
  while (i < segs.length - 1 && segs[i + 1].t0 <= t + 1e-12) i++;
  return i;
};
const kinOf = (g, t) => {
  const u = clamp(t - g.t0, 0, g.dur);
  return {p: g.p0 + g.w0 * u + (g.a * u * u) / 2, w: g.w0 + g.a * u, a: u < g.dur ? g.a : 0};
};

/** A plan starting at rest at opening h0 (default 全開). Commands rewrite its future; its segments are its state. */
export function createPlan(spec = SPEC, {h0 = spec.H} = {}) {
  return {spec, segs: [{t0: 0, p0: phiOfH(h0, spec), w0: 0, a: 0, dur: Infinity, kind: 'rest'}], obs: [], events: [], log: []};
}

/** cut the plan at t and return the state there; everything after t is dropped */
function truncate(P, t) {
  const i = segAt(P.segs, t);
  const g = P.segs[i];
  const k = kinOf(g, t);
  P.segs.length = i + 1;
  g.dur = Math.max(0, t - g.t0);
  if (g.dur <= 1e-12 && P.segs.length > 1) P.segs.pop();
  return k;
}
function push(P, g) {
  if (g.dur > 1e-12) P.segs.push(g);
  const u = g.dur;
  return {t: g.t0 + u, p: g.p0 + g.w0 * u + (g.a * u * u) / 2, w: g.w0 + g.a * u};
}
const rest = (P, t, p, kind = 'rest') => P.segs.push({t0: t, p0: p, w0: 0, a: 0, dur: Infinity, kind});

/** run in direction dir from (p, w) to stop exactly at pLim: ramp up to ω, run, ramp down (a triangle if short) */
function runTo(P, t, p, w, dir, pLim, kind) {
  const {omega, alpha} = P.spec;
  const s = Math.max(0, dir * w);
  const dist = Math.max(0, dir * (pLim - p));
  let st = {t, p, w};
  if (dist <= 1e-12) return st;
  const sp = Math.min(omega, Math.sqrt(alpha * dist + (s * s) / 2));
  if (sp > s) st = push(P, {t0: st.t, p0: st.p, w0: dir * s, a: dir * alpha, dur: (sp - s) / alpha, kind});
  const cruise = dist - (sp * sp - s * s) / (2 * alpha) - (sp * sp) / (2 * alpha);
  if (cruise > 1e-12) st = push(P, {t0: st.t, p0: st.p, w0: dir * sp, a: 0, dur: cruise / sp, kind});
  st = push(P, {t0: st.t, p0: st.p, w0: dir * sp, a: -dir * alpha, dur: sp / alpha, kind});
  return {t: st.t, p: pLim, w: 0};
}

/** the first time at or after t0 the plan's angle falls to pT while winding down; Infinity if never */
function crossDown(P, t0, pT) {
  for (const g of P.segs) {
    if (g.t0 + g.dur < t0 || g.kind !== 'down') continue;
    const u0 = Math.max(0, t0 - g.t0);
    const pa = kinOf(g, g.t0 + u0).p;
    const pb = kinOf(g, g.t0 + g.dur).p;
    if (pa < pT || pb > pT) continue;
    // p0 + w0 u + a u²/2 = pT, the smallest root in [u0, dur]
    let u;
    if (Math.abs(g.a) < 1e-12) u = (pT - g.p0) / g.w0;
    else {
      const disc = Math.max(0, g.w0 * g.w0 + 2 * g.a * (pT - g.p0));
      const us = [(-g.w0 + Math.sqrt(disc)) / g.a, (-g.w0 - Math.sqrt(disc)) / g.a].filter((x) => x >= u0 - 1e-9 && x <= g.dur + 1e-9);
      u = Math.min(...us);
    }
    return g.t0 + clamp(u, u0, g.dur);
  }
  return Infinity;
}

export const obsOnAt = (P, t) => P.obs.some((o) => o.t0 <= t + 1e-12 && t < o.t1);

/**
 * With the obstacle in place, look for the moment the descending bottom edge has pressed the sensing rubber by
 * edgeComp: the switch closes, the signal takes detDelay to stop the motor, the brake stops the curtain in brakeT,
 * then the curtain climbs for revT and stops (JIS: 直ちに停止後、反転上昇して停止).
 */
function planObstacle(P, t) {
  const S = P.spec;
  if (!obsOnAt(P, t)) return;
  const hDet = S.obsH - S.edgeComp;
  const tD = crossDown(P, t, phiOfH(hDet, S));
  if (!Number.isFinite(tD)) return;
  const k = truncate(P, tD);
  let st = push(P, {t0: tD, p0: k.p, w0: k.w, a: 0, dur: S.detDelay, kind: 'obs'});
  st = push(P, {t0: st.t, p0: st.p, w0: st.w, a: -st.w / S.brakeT, dur: S.brakeT, kind: 'obs'});
  const hStop = hOfPhi(st.p, S);
  const v = rOfH(hDet, S) * Math.abs(k.w);
  P.events.push({t: tD, type: 'detect', v, hDet, hStop, after: hDet - hStop, dist: S.obsH - hStop, tStop: st.t});
  const climb = S.omega * (S.revT - S.tRamp);
  st = runTo(P, st.t, st.p, 0, 1, Math.min(phiOpen(S), st.p + climb), 'rev');
  rest(P, st.t, st.p, 'restObs');
}

/**
 * A command at time t: 'open', 'close', 'stop', 'obsOn', 'obsOff', or 'set' (arg: h, the manual opening). Following
 * JIS A 4705 the switch does nothing in the other direction while the curtain moves (止める first). Returns whether it
 * took effect; every command is logged.
 */
export function command(P, t, cmd, arg) {
  const S = P.spec;
  const i = segAt(P.segs, t);
  const g = P.segs[i];
  const k = kinOf(g, t);
  const moving = !REST.has(g.kind) && t < g.t0 + g.dur - 1e-12;
  const pOpen = phiOpen(S);
  let ok = false;
  if (cmd === 'open' && !moving && k.p < pOpen - 1e-9) {
    truncate(P, t);
    const st = runTo(P, t, k.p, 0, 1, pOpen, 'up');
    rest(P, st.t, pOpen);
    ok = true;
  } else if (cmd === 'close' && !moving && k.p > 1e-9) {
    truncate(P, t);
    const st = runTo(P, t, k.p, 0, -1, 0, 'down');
    rest(P, st.t, 0);
    planObstacle(P, t);
    ok = true;
  } else if (cmd === 'stop' && moving && (g.kind === 'up' || g.kind === 'down' || g.kind === 'rev')) {
    truncate(P, t);
    const st = push(P, {t0: t, p0: k.p, w0: k.w, a: -Math.sign(k.w) * S.alpha, dur: Math.abs(k.w) / S.alpha, kind: 'stopping'});
    rest(P, st.t, st.p);
    ok = true;
  } else if (cmd === 'obsOn' && !obsOnAt(P, t) && hOfPhi(k.p, S) >= S.obsH + 0.05) {
    P.obs.push({t0: t, t1: Infinity});
    planObstacle(P, t);
    ok = true;
  } else if (cmd === 'obsOff' && obsOnAt(P, t)) {
    P.obs[P.obs.length - 1].t1 = t;
    // a detection still ahead never happens: the curtain runs on down
    const ahead = P.events.findIndex((e) => e.type === 'detect' && e.t > t);
    if (ahead >= 0) {
      P.events.splice(ahead, 1);
      truncate(P, t);
      const st = runTo(P, t, k.p, k.w, -1, 0, 'down');
      rest(P, st.t, 0);
    }
    ok = true;
  } else if (cmd === 'set') {
    const lo = obsOnAt(P, t) ? S.obsH : 0;
    truncate(P, t);
    rest(P, t, phiOfH(clamp(arg, lo, S.H), S));
    ok = true;
  }
  P.log.push({t, cmd, ok});
  return ok;
}

/** a plan built from a list of [{t, cmd, arg}] */
export function planOf(cmds, spec = SPEC, init = {}) {
  const P = createPlan(spec, init);
  for (const c of [...cmds].sort((a, b) => a.t - b.t)) command(P, c.t, c.cmd, c.arg);
  return P;
}

/** the curtain at time t: shaft angle p, speed w, acceleration of the angle, and the opening h with its v and a */
export function poseAt(P, t) {
  const S = P.spec;
  const g = P.segs[segAt(P.segs, t)];
  const k = kinOf(g, t);
  const p = Math.max(0, k.p);
  const h = clamp(hOfPhi(p, S), 0, S.H);
  const r = rOfH(h, S);
  // ds = r dp, and r grows by layer/2π per radian: d²h/dt² = r·α + w²·layer/2π
  return {p, w: k.w, ap: k.a, h, r, v: r * k.w, a: r * k.a + (k.w * k.w * S.layer) / (2 * Math.PI), kind: g.kind};
}

export const STATE_NAME = {rest: '停止', restObs: '感知後に停止', up: '上昇', down: '下降', stopping: '停止中', obs: '障害物を感知', rev: '反転上昇'};

/** Everything the page draws for one moment of a plan. */
export function frameState(P, t) {
  const S = P.spec;
  const q = poseAt(P, t);
  const L = loads(q.h, q.v, q.a, q.w, S);
  const atOpen = q.h >= S.H - 1e-6;
  const atClosed = q.h <= 1e-6;
  let stateName = STATE_NAME[q.kind];
  if (q.kind === 'rest') stateName = atOpen ? '全開' : atClosed ? '全閉' : '途中で停止';
  // the obstacle: in place, popping in or out over 0.4 s
  let obsK = 0;
  for (const o of P.obs) {
    if (t < o.t0) continue;
    const kin = clamp((t - o.t0) / 0.4, 0, 1);
    const kout = Number.isFinite(o.t1) ? clamp((t - o.t1) / 0.3, 0, 1) : 0;
    obsK = Math.max(obsK, kin * (1 - kout));
  }
  const obsOn = obsOnAt(P, t);
  // the sensing rubber pressed against the obstacle
  const comp = obsOn ? clamp(S.obsH - q.h, 0, 0.03) : 0;
  let det = null;
  for (const e of P.events) if (e.type === 'detect' && e.t <= t) det = e;
  const sinceDet = det ? t - det.t : Infinity;
  const work = clamp(Math.abs(q.w) / (0.15 * S.omega), 0, 1);
  return {
    t,
    ...q,
    ...L,
    open: q.h / S.H,
    openPct: (100 * q.h) / S.H,
    vMpm: q.v * 60,
    rMM: q.r * 1000,
    turns: q.p / (2 * Math.PI),
    kind: q.kind,
    stateName,
    atOpen,
    atClosed,
    obsOn,
    obsK,
    comp,
    sensing: comp >= S.edgeComp - 1e-9 && sinceDet < Infinity,
    det,
    sinceDet,
    work,
    brake: REST.has(q.kind) || (q.kind === 'obs' && det && t >= det.t + S.detDelay) ? 1 : 0,
  };
}

/** the shaft torque over the whole stroke for the chart: [{open (0..1), T}] */
export function torqueCurve(n = 100, spec = SPEC) {
  return Array.from({length: n + 1}, (_, i) => ({open: i / n, T: holdTorque((i / n) * spec.H, spec)}));
}
