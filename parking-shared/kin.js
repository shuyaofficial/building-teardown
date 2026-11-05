// The pit two-level parking lift's math, no three.js. Every number lives in SPEC (sources in ../parking/refs.md); the
// geometry, the console and the tests all read it from here. One input poses the machine: the pallet height h (m, how
// far the frame has risen, 0 = the upper pallet at ground level and the lower one in the pit, SPEC.stroke = the lower
// pallet at ground level). plan() turns a list of operator commands into closed-form pieces of time (the gate, the
// latch, the trapezoidal lift) with the interlocks decided at each command; stateAt() reads any moment of it. The film
// and the live page both run plan(): the live page just appends the visitor's commands and plans again.
//
// Coordinates (metres): x across the pallet, y up (0 = ground), z along the car, the entrance (the gate) toward +z.

export const SPEC = {
  g: 9.80665,
  // 装置
  stroke: 1.75, // パレットの間隔 = 昇降行程（仮定。駐車室 1.63 m ≥ 告示 1.6 m）
  palletL: 5.6,
  palletW: 2.3,
  palletT: 0.12,
  roomMin: 1.6, // 告示第8条 駐車室の高さ
  frameKg: 900, // 可動部 Wsd（仮定）
  cars: {
    kei: {name: '軽', kg: 900, L: 3.4, W: 1.48, H: 1.65},
    small: {name: '小型', kg: 1700, L: 4.7, W: 1.7, H: 1.47},
    mid: {name: '中型', kg: 2000, L: 5.05, W: 1.85, H: 1.47},
    large: {name: '大型', kg: 2300, L: 5.3, W: 1.95, H: 1.5},
  },
  carMaxKg: 2300, // 許容（表 C.2 の大型自動車）
  // 油圧
  cylinders: 2,
  plungerD: 0.063,
  ratio: 2, // チェーン 2:1（パレットはプランジャの 2 倍動く）
  chains: 4,
  chainBreak: 56700, // N, RS80 相当（仮定）
  chainFactor: 7, // 認証基準 C.6.3.1: 引張強さ ≥ 最大荷重 × 7
  pumpCc: 19, // cm³/rev
  motorRpm: 1450,
  motorKW: 5.5,
  eta: 0.85, // ポンプの総合効率（仮定）
  vLimit: 0.15, // 認証基準 3.7.3 b) 1)
  reliefK: 1.5, // 認証基準 3.6.3.2
  acc: 0.15, // 加減速（仮定）
  aStop: 0.5, // 停止ボタンの減速（仮定）
  // 安全装置
  latchT: 0.5, // ラッチの出入り（仮定）
  latchGap: 0.03, // 掛かりのすき間（≤ 50 mm）
  latchMax: 0.05, // 認証基準 3.5.4.2
  latchBeta: 2.0, // 衝撃係数 β
  gateV: 0.3, // 閉鎖型の扉 ≤ 300 mm/s
  gateTravel: 1.15, // 片側の扉の走行
  gateZ: 3.1, // ゲートの面
  beamZ: 2.85, // はみ出し検知の光線（パレット端 2.80 の外）
  carRearZ: -2.7, // 車止め：車の後端
  shiftPast: 0.15, // 「はみ出す」: 前端が光線を越えて止まる量（仮定）
  // 人
  pedH: 1.7,
  walk: 1.2,
  pedDepth: 0.25,
  pedOutZ: 4.6, // 外で待つ／消える位置
  pedInZ: 1.6, // 乗降領域の中で立つ位置
  pedWaitZ: 3.55, // ゲートが閉じていたら外で待つ
  pedX: 0.35,
  sprocketR: 0.1,
};
const um = (x) => Math.round(x * 1e6) / 1e6;
SPEC.area = (Math.PI / 4) * SPEC.plungerD * SPEC.plungerD; // m², one plunger
SPEC.flow = (SPEC.pumpCc * 1e-6 * SPEC.motorRpm) / 60; // m³/s
// both cylinders share the flow (each plunger at v/2) and the chain doubles it: v = Q / A
SPEC.vRated = SPEC.flow / ((SPEC.cylinders * SPEC.area) / SPEC.ratio);
SPEC.gateT = SPEC.gateTravel / SPEC.gateV;
SPEC.zoneZ0 = -SPEC.palletL / 2;
SPEC.zoneZ1 = SPEC.gateZ - 0.05; // 乗降領域：パレットの奥からゲートまで
SPEC.roomH = um(SPEC.stroke - SPEC.palletT);
/** 常用圧力: the heaviest allowed car at constant speed, Pa */
SPEC.pRated = (((SPEC.frameKg + SPEC.carMaxKg) * SPEC.g) / SPEC.cylinders) * SPEC.ratio / SPEC.area;
SPEC.pRelief = SPEC.reliefK * SPEC.pRated;

export const CARS = Object.keys(SPEC.cars);
/** the car's front end: against the rear stop, or (shift) driven on until it stops past the front beam */
export const carFrontZ = (car, shift, spec = SPEC) => (shift ? spec.beamZ + spec.shiftPast : spec.carRearZ + car.L);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------ the physics of one moment
/**
 * Forces for a total moving mass M (kg) accelerating at a (m/s², + up) while the cylinders carry it. The two plungers
 * share the weight, and the 2:1 chain makes each plunger push twice its share: F = M (g + a) per plunger. Pascal: the
 * pressure is that force over one plunger's area, the same everywhere in the oil. Each of the 4 chains holds a quarter.
 */
export function forces(M, a = 0, spec = SPEC) {
  const W = M * (spec.g + a);
  const F = (W / spec.cylinders) * spec.ratio; // one plunger
  return {W, F, p: F / spec.area, T: W / spec.chains};
}
/** pressure for a car class (or kg) at constant speed, Pa */
export const pressureOf = (carKg, spec = SPEC) => forces(spec.frameKg + carKg, 0, spec).p;

/**
 * The pump and the motor at pallet speed v (+ up). Up: the motor turns the pump, the flow is Q = A_total / 2 × v, the
 * oil power p·Q leaves the pump and the motor shaft gives p·Q / η. Down: the motor stands; the flow control valve lets
 * the same Q back to the tank and turns p·Q into heat.
 */
export function drive(p, v, spec = SPEC) {
  const Q = ((spec.cylinders * spec.area) / spec.ratio) * Math.abs(v); // m³/s
  const up = v > 1e-6;
  const down = v < -1e-6;
  const pHyd = up ? p * Q : 0;
  return {
    Q,
    Lmin: Q * 60000,
    rpm: up ? spec.motorRpm * (v / spec.vRated) : 0,
    pHyd,
    shaft: pHyd / spec.eta,
    heat: down ? p * Q : 0,
    regime: up ? '力行' : down ? '自重' : '停止',
  };
}

// ------------------------------------------------------------ the lift: trapezoids of constant acceleration
/** Segments [{t0, h0, v0, a, dur}] taking the frame from rest at h0 to rest at h1, starting at t0. */
export function moveSegments(h0, h1, t0 = 0, spec = SPEC) {
  const L = Math.abs(h1 - h0);
  const s = Math.sign(h1 - h0);
  if (L < 1e-12) return [];
  const a = spec.acc;
  const vp = Math.min(spec.vRated, Math.sqrt(a * L));
  const ta = vp / a;
  const tc = (L - (vp * vp) / a) / vp;
  const segs = [];
  let t = t0;
  let h = h0;
  let v = 0;
  for (const [acc, dur] of [[s * a, ta], [0, tc], [-s * a, ta]]) {
    if (dur <= 1e-12) continue;
    segs.push({t0: t, h0: h, v0: v, a: acc, dur});
    h += v * dur + (acc * dur * dur) / 2;
    v += acc * dur;
    t += dur;
  }
  return segs;
}
/** a stop from (h, v) at the stop button's deceleration */
export function stopSegment(h, v, t0, spec = SPEC) {
  if (Math.abs(v) < 1e-9) return [];
  return [{t0, h0: h, v0: v, a: -Math.sign(v) * spec.aStop, dur: Math.abs(v) / spec.aStop}];
}
export const strokeTime = (spec = SPEC) => moveSegments(0, spec.stroke, 0, spec).reduce((x, g) => x + g.dur, 0);

/** {h, v, a} at t on a list of segments, starting from h0 at rest */
export function segAt(segs, t, h0 = 0) {
  let h = h0;
  for (const g of segs) {
    if (t < g.t0) return {h, v: 0, a: 0};
    const u = t - g.t0;
    if (u <= g.dur) return {h: g.h0 + g.v0 * u + (g.a * u * u) / 2, v: g.v0 + g.a * u, a: g.a};
    h = g.h0 + g.v0 * g.dur + (g.a * g.dur * g.dur) / 2;
  }
  return {h, v: 0, a: 0};
}
/** a linear ramp list [{t0, x0, rate, dur}] (the gate, the latch) at t, starting from x0 */
function rampAt(keys, t, x0) {
  let x = x0;
  let rate = 0;
  for (const k of keys) {
    if (t < k.t0) break;
    const u = Math.min(t - k.t0, k.dur);
    x = k.x0 + k.rate * u;
    rate = t - k.t0 < k.dur ? k.rate : 0;
  }
  // the gate and the latch live in 0..1; snap the ends so a finished ramp reads exactly shut or home
  x = clamp(x, 0, 1);
  return {x: x < 1e-9 ? 0 : x > 1 - 1e-9 ? 1 : x, rate};
}
/** the person: walks along z at the walking speed between stops; [{t0, z0, z1}] */
function pedAt(path, t, spec = SPEC) {
  let out = null;
  for (const k of path) {
    if (t < k.t0) break;
    const dur = Math.abs(k.z1 - k.z0) / spec.walk;
    const u = Math.min(t - k.t0, dur);
    const z = k.z0 + Math.sign(k.z1 - k.z0) * spec.walk * u;
    const walking = t - k.t0 < dur;
    out = k.gone && !walking ? null : {x: spec.pedX, z, walking, dir: Math.sign(k.z1 - k.z0) || -1};
  }
  return out;
}

export const PHASE_NAME = {idle: '停止', gateClose: 'ゲートを閉める', unlatch: 'ラッチを外す', up: '上昇', down: '下降', latch: 'ラッチを掛ける', gateOpen: 'ゲートを開ける', stopping: '止める'};
export const REASON = {person: '乗降領域に人がいる', overhang: '車がはみ出している', busy: '動作中', end: 'すでに端にいる', moving: '動作中は替えられない', notTop: '車が地上にいるときだけ'};

// ------------------------------------------------------------ the plan
/**
 * Plans a list of commands [{t, cmd}] in time order. cmd: 'up' | 'down' | 'stop' | {car: key} | {person: 'in'|'out'} |
 * {shift: 0|1}. Each start command checks the interlocks at its moment (a person in the boarding zone, a car past the
 * end beams), then queues: the gate closes, the latch comes out (from the top), the frame runs its trapezoid, and at
 * the top the latch goes in and the gate opens. 'stop' brakes the frame where it is and drops what was queued.
 * init: {h, gate (0 closed … 1 open), latch (0 out … 1 in), car, shift}. Returns the run stateAt() reads.
 */
export function plan(commands, init = {}, spec = SPEC) {
  const I = {h: 0, gate: 0, latch: 0, car: 'mid', shift: 0, ...init};
  const run = {spec, init: I, segs: [], gate: [], latch: [], phases: [], cars: [{t: -1e9, car: I.car}], shifts: [{t: -1e9, shift: I.shift}], ped: [], log: [], busyTo: -1e9};
  const cmds = [...commands].sort((a, b) => a.t - b.t);
  for (const c of cmds) apply(run, c, spec);
  return run;
}

const hOf = (run, t) => segAt(run.segs, t, run.init.h);
const gateOf = (run, t) => rampAt(run.gate, t, run.init.gate);
const latchOf = (run, t) => rampAt(run.latch, t, run.init.latch);
const lastBefore = (list, t) => list.filter((x) => x.t <= t).pop();
const carOf = (run, t) => lastBefore(run.cars, t).car;

/** the interlock sensors at t: a person in the boarding zone, a car past the end beams (only at ground level) */
export function sensorsAt(run, t, spec = SPEC) {
  const ped = pedAt(run.ped, t, spec);
  const person = !!ped && ped.z - spec.pedDepth / 2 < spec.zoneZ1 && ped.z + spec.pedDepth / 2 > spec.zoneZ0;
  const {h} = hOf(run, t);
  const atTop = Math.abs(h - spec.stroke) < 1e-6;
  const car = spec.cars[carOf(run, t)];
  const shift = lastBefore(run.shifts, t).shift;
  const front = carFrontZ(car, shift, spec);
  const overhang = atTop && front > spec.beamZ;
  return {person, overhang, ped};
}

function apply(run, c, spec) {
  const t = c.t;
  const busy = t < run.busyTo - 1e-9;
  const refuse = (reason) => run.log.push({t, type: 'refuse', cmd: c.cmd ?? Object.keys(c).find((k) => k !== 't'), reason});
  if (c.car !== undefined) {
    if (busy) return refuse('moving');
    run.cars.push({t, car: c.car});
    run.shifts.push({t, shift: 0});
    run.log.push({t, type: 'car', car: c.car});
    return;
  }
  if (c.shift !== undefined) {
    const atTop = Math.abs(hOf(run, t).h - spec.stroke) < 1e-6;
    if (busy || !atTop) return refuse(busy ? 'busy' : 'notTop');
    run.shifts.push({t, shift: c.shift});
    return;
  }
  if (c.person) {
    const cur = pedAt(run.ped, t, spec);
    const z0 = cur ? cur.z : spec.pedOutZ;
    if (c.person === 'in') {
      // the gate decides how far they get: wide open → into the zone, otherwise they wait outside it
      const open = gateOf(run, t).x >= 1 - 1e-9;
      run.ped.push({t0: t, z0, z1: open ? spec.pedInZ : spec.pedWaitZ, gone: false});
    } else if (cur) run.ped.push({t0: t, z0, z1: spec.pedOutZ, gone: true});
    return;
  }
  if (c.cmd === 'stop') {
    if (!busy) return;
    // the frame brakes where it is; the gate freezes; a latch already moving finishes; nothing else runs
    const m = hOf(run, t);
    run.segs = run.segs.filter((g) => g.t0 < t).map((g) => (g.t0 + g.dur > t ? {...g, dur: t - g.t0} : g));
    const st = stopSegment(m.h, m.v, t, spec);
    run.segs.push(...st);
    const gk = gateOf(run, t);
    run.gate = run.gate.filter((k) => k.t0 < t).map((k) => (k.t0 + k.dur > t ? {...k, dur: t - k.t0} : k));
    run.gate.push({t0: t, x0: gk.x, rate: 0, dur: 0});
    const lk = run.latch.filter((k) => k.t0 <= t && t < k.t0 + k.dur).pop();
    run.latch = run.latch.filter((k) => k.t0 < t || k === lk);
    run.phases = run.phases.filter((p) => p.t0 < t).map((p) => (p.t1 > t ? {...p, t1: t} : p));
    const tEnd = Math.max(t + (st[0]?.dur ?? 0), lk ? lk.t0 + lk.dur : t);
    run.phases.push({t0: t, t1: tEnd, kind: 'stopping'});
    run.busyTo = tEnd;
    run.log.push({t, type: 'stop'});
    return;
  }
  if (c.cmd !== 'up' && c.cmd !== 'down') return;
  if (busy) return refuse('busy');
  const {h} = hOf(run, t);
  const target = c.cmd === 'up' ? spec.stroke : 0;
  if (Math.abs(h - target) < 1e-6) return refuse('end');
  const S = sensorsAt(run, t, spec);
  if (S.person) return refuse('person');
  if (S.overhang) return refuse('overhang');
  run.log.push({t, type: 'start', cmd: c.cmd});
  let tt = t;
  const phase = (kind, dur) => {
    if (dur <= 1e-12) return;
    run.phases.push({t0: tt, t1: tt + dur, kind});
    tt += dur;
  };
  const g0 = gateOf(run, t).x;
  if (g0 > 1e-9) {
    run.gate.push({t0: tt, x0: g0, rate: -1 / spec.gateT, dur: g0 * spec.gateT});
    phase('gateClose', g0 * spec.gateT);
  }
  const l0 = latchOf(run, tt).x;
  if (l0 > 1e-9) {
    run.latch.push({t0: tt, x0: l0, rate: -1 / spec.latchT, dur: l0 * spec.latchT});
    phase('unlatch', l0 * spec.latchT);
  }
  const segs = moveSegments(h, target, tt, spec);
  run.segs.push(...segs);
  phase(c.cmd, segs.reduce((x, g) => x + g.dur, 0));
  if (target === spec.stroke) {
    run.latch.push({t0: tt, x0: 0, rate: 1 / spec.latchT, dur: spec.latchT});
    phase('latch', spec.latchT);
    run.gate.push({t0: tt, x0: 0, rate: 1 / spec.gateT, dur: spec.gateT});
    phase('gateOpen', spec.gateT);
  }
  run.busyTo = tt;
}

// ------------------------------------------------------------ the frame state
/** the latest refusal at or before t, shown for 3 s */
export function refusalAt(run, t) {
  const r = run.log.filter((e) => e.type === 'refuse' && e.t <= t && t - e.t < 3 && e.reason !== 'busy' && e.reason !== 'end').pop();
  return r ? {...r, text: REASON[r.reason]} : null;
}

/** everything the page draws for time t of a run */
export function stateAt(run, t, spec = SPEC) {
  const m = hOf(run, t);
  const moving = Math.abs(m.v) > 1e-9;
  const gate = gateOf(run, t);
  const latch = latchOf(run, t);
  const carKey = carOf(run, t);
  const car = spec.cars[carKey];
  const M = spec.frameKg + car.kg;
  const atBottom = m.h < 1e-6;
  const atTop = Math.abs(m.h - spec.stroke) < 1e-6;
  // the oil carries the frame unless it rests on the pit stops or hangs on the latches
  const carry = moving || (!atBottom && latch.x < 1 - 1e-9);
  const f = forces(M, carry ? m.a : 0, spec);
  const p = carry ? f.p : 0;
  const d = drive(p, m.v, spec);
  const ph = run.phases.filter((x) => x.t0 <= t && t < x.t1).pop();
  const S = sensorsAt(run, t, spec);
  const shift = lastBefore(run.shifts, t).shift;
  return {
    t,
    h: m.h,
    v: m.v,
    a: m.a,
    speedMM: Math.abs(m.v) * 1000,
    hLower: m.h - spec.stroke, // the lower pallet's top
    hUpper: m.h, // the upper pallet's top
    plunger: m.h / spec.ratio,
    open: m.h / spec.stroke,
    atTop,
    atBottom,
    moving,
    phase: ph ? ph.kind : 'idle',
    phaseName: PHASE_NAME[ph ? ph.kind : 'idle'],
    gate: gate.x,
    gateMoving: gate.rate !== 0,
    latch: latch.x,
    latched: latch.x >= 1 - 1e-9,
    car: carKey,
    carName: car.name,
    carKg: car.kg,
    M,
    shift,
    carFront: carFrontZ(car, shift, spec),
    carry,
    p,
    pMPa: p / 1e6,
    F: carry ? f.F : 0,
    T: carry ? f.T : 0,
    factor: carry ? spec.chainBreak / f.T : Infinity,
    ...d,
    load: d.shaft / (spec.motorKW * 1000),
    person: S.person,
    overhang: S.overhang,
    ped: S.ped,
    refusal: refusalAt(run, t),
    // the chain runs over the head sprocket by h/2 relative to the plunger, so the sprocket turns (h/2)/r
    sprocket: m.h / spec.ratio / spec.sprocketR,
    // the accent: the hydraulics while the oil moves the frame, ramped so the colour never pops
    work: clamp(Math.abs(m.v) / 0.03, 0, 1),
  };
}

/** the oil pressure over the last `back` seconds (n + 1 samples, oldest first) */
export function histAt(run, t, back = 30, n = 180) {
  const out = new Array(n + 1);
  for (let k = 0; k <= n; k++) {
    const tt = t - back + (k / n) * back;
    out[k] = tt < 0 ? 0 : stateAt(run, tt).pMPa;
  }
  return out;
}
