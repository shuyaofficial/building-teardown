// The automatic door's math, no three.js. Every number lives in SPEC (sources in ../autodoor/refs.md); the geometry,
// the console and the tests all read it from here. One input drives the page: time. simulate() steps pedestrians →
// sensors → controller → door motion → loads at a fixed 1 ms and stores the run in typed arrays, so the film reads a
// pure function of t; the live page steps the same createSim() in real time from wherever the tour left it.
//
// Coordinates (metres): x along the facade, y up, z across it; the door leaves run in the plane z = 0, the street is
// +z (外), the lobby −z (内). The door's position x is one leaf's travel from closed (0) to fully open (SPEC.travel);
// the two leaves move apart by the same amount, so the clear gap between them is 2x.

export const SPEC = {
  g: 9.81,
  // ドア
  openW: 1.6, // 有効開口 幅
  openH: 2.1, // 有効開口 高さ
  leafW: 0.85, // 戸1枚（重なり 0.05 を含む）
  leafT: 0.04,
  leafKg: 70,
  overlap: 0.05,
  travel: 0.8, // 1枚の走行距離 = 有効開口の半分
  // 速度と時間
  modes: {
    normal: {name: '一般', vOpen: 0.5, vClose: 0.35},
    gentle: {name: '高齢者・子ども', vOpen: 0.4, vClose: 0.25},
  },
  aOpen: 0.8,
  aClose: 0.5,
  creep: 0.03, // 終端の低速区間
  vCreepOpen: 0.1,
  vCreepClose: 0.08,
  keMax: 10, // 戸1枚の運動エネルギーの上限 J
  holdT: 3.0, // 開放保持タイマ
  reverseT: 0.2, // 反転：検出から停止まで
  sensorDelay: 0.1, // 起動センサーの応答遅れ
  // センサー
  detD: 1.5, // 検出範囲の奥行（既定）
  detDMin: 1.0,
  detDMax: 2.5,
  detW: 1.9, // 有効開口 + 左右 150 mm
  auxBand: 0.15, // 補助光電の保護領域：走行面の前後 150 mm
  auxH: [0.45, 1.0], // 光線の高さ
  // 駆動系
  motorV: 24,
  ratio: 12,
  pulleyD: 0.04,
  mu: 0.02,
  eta: 0.85,
  // 歩行者
  pedH: 1.7,
  pedShoulder: 0.45,
  passGap: 0.7, // 通れるすき間（肩幅 + 余裕）
  walk: 1.2,
  walkMin: 0.8,
  walkMax: 1.6,
  // ---- 仮定（refs.md に無い。人形の動きと起動センサーの種類のために置く）
  pedDepth: 0.25, // 人の前後の厚み
  pedAcc: 1.0, // 歩き出しの加速度 m/s²
  pedDec: 1.5, // 足を緩めるときの減速度 m/s²
  motionMin: 0.2, // 起動センサーは動体検知：これより遅い人は見えない（だから補助光電が要る）
  shuffle: 0.15, // 戸の間へにじり寄る速さ（動体検知にかからない）
  lingerZ: 0.4, // 「立ち止まる」人が待つ位置（戸の面から）
  standT: 2.0, // 戸の間で立っている時間
  startPad: 1.0, // 歩行者は検出範囲の 1.0 m 手前から歩き出す
  exitLen: 4.0, // 戸を抜けてから歩く距離
  dt: 0.001,
};
SPEC.massKg = 2 * SPEC.leafKg; // ベルトで2枚がつながっているので、モーターは 140 kg を動かす

export const ST = {CLOSED: 0, OPENING: 1, HOLD: 2, CLOSING: 3, REV: 4};
export const STATE_NAME = ['閉', '開動作', '開放保持', '閉動作', '反転'];
export const CAUSE_NAME = ['', '起動センサー', '補助光電'];
export const MODES = ['normal', 'gentle'];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const modeOf = (mode, spec = SPEC) => spec.modes[mode] ?? spec.modes.normal;
/** speed limit, acceleration and creep speed for one direction (+1 open, −1 close) */
export function motionParams(dir, mode = 'normal', spec = SPEC) {
  const m = modeOf(mode, spec);
  return dir > 0 ? {vMax: m.vOpen, a: spec.aOpen, vc: spec.vCreepOpen} : {vMax: m.vClose, a: spec.aClose, vc: spec.vCreepClose};
}

// ------------------------------------------------------------ the door's motion
/**
 * One step toward fully open (dir +1) or closed (dir −1). The speed command is the lower of the limit and the speed
 * from which the door can still brake to the creep speed 30 mm before the end; the change per step is held to the
 * acceleration limit. The last 30 mm run at the creep speed and the door stops on the end stop.
 * Returns a new {x, v, a, done}.
 */
export function doorStep(x, v, dir, P, spec = SPEC, dt = spec.dt) {
  const L = spec.travel;
  const r = dir > 0 ? L - x : x;
  const s = v * dir;
  const cmd = r <= spec.creep + 1e-12 ? P.vc : Math.min(P.vMax, Math.sqrt(P.vc * P.vc + 2 * P.a * (r - spec.creep)));
  const sNew = s + clamp(cmd - s, -P.a * dt, P.a * dt);
  const xn = x + dir * sNew * dt;
  if ((dir > 0 ? L - xn : xn) <= 0) return {x: dir > 0 ? L : 0, v: 0, a: 0, done: true};
  return {x: xn, v: dir * sNew, a: (dir * (sNew - s)) / dt, done: false};
}

/**
 * The opening motion from (x0, v0 ≥ 0) as constant-acceleration segments [{t0, x0, v0, a, dur}], the continuous form
 * of doorStep: accelerate, cruise, brake to the creep speed at 30 mm, creep to the end.
 */
export function openSegments(x0, v0, mode = 'normal', spec = SPEC, t0 = 0) {
  const {vMax, a, vc} = motionParams(1, mode, spec);
  const L = spec.travel;
  const xc = L - spec.creep; // where the creep starts
  const segs = [];
  let t = t0;
  let x = x0;
  let v = Math.max(0, v0);
  const push = (acc, dur) => {
    if (dur <= 1e-12) return;
    segs.push({t0: t, x0: x, v0: v, a: acc, dur});
    x += v * dur + (acc * dur * dur) / 2;
    v += acc * dur;
    t += dur;
  };
  if (x < xc) {
    // peak speed: reach vMax, or meet the braking curve first
    const vp = Math.min(vMax, Math.sqrt(Math.max(v * v, a * (xc - x) + (v * v + vc * vc) / 2)));
    if (vp > v) push(a, (vp - v) / a);
    const xb = xc - (vp * vp - vc * vc) / (2 * a); // braking starts here
    if (xb > x) push(0, (xb - x) / vp);
    if (vp > vc) push(-a, (vp - vc) / a);
    x = xc;
    v = vc;
  }
  push(0, (L - x) / vc);
  return segs;
}

/** position at time t on a segment list (the last segment's end after it) */
export function segX(segs, t) {
  if (!segs.length) return 0;
  for (const g of segs) {
    if (t <= g.t0 + g.dur) {
      const u = Math.max(0, t - g.t0);
      return g.x0 + g.v0 * u + (g.a * u * u) / 2;
    }
  }
  const g = segs[segs.length - 1];
  return g.x0 + g.v0 * g.dur + (g.a * g.dur * g.dur) / 2;
}

/** the first time the position reaches x ≥ target on a segment list; Infinity if it never does */
export function segT(segs, target) {
  for (const g of segs) {
    const x1 = g.x0 + g.v0 * g.dur + (g.a * g.dur * g.dur) / 2;
    if (g.x0 >= target - 1e-12) return g.t0;
    if (x1 < target) continue;
    // solve x0 + v0 u + a u²/2 = target for the smallest u in [0, dur]
    if (Math.abs(g.a) < 1e-12) return g.t0 + (target - g.x0) / g.v0;
    const disc = Math.max(0, g.v0 * g.v0 + 2 * g.a * (target - g.x0));
    const us = [(-g.v0 + Math.sqrt(disc)) / g.a, (-g.v0 - Math.sqrt(disc)) / g.a].filter((u) => u >= -1e-9 && u <= g.dur + 1e-9);
    return g.t0 + Math.max(0, Math.min(...us));
  }
  return Infinity;
}

/**
 * Where the door will be, if it opens for someone now: the segments from the present state. pending is the time
 * before a detection reaches the controller (the sensor's response delay still to run).
 */
export function forecast(door, mode = 'normal', spec = SPEC, pending = spec.sensorDelay) {
  const {x, v, state} = door;
  if (state === ST.HOLD) return [{t0: 0, x0: spec.travel, v0: 0, a: 0, dur: 1e9}];
  if (state === ST.OPENING) return openSegments(x, v, mode, spec);
  if (state === ST.CLOSED) return [{t0: 0, x0: x, v0: 0, a: 0, dur: pending}, ...openSegments(x, 0, mode, spec, pending)];
  // closing or already reversing: run on for the delay, brake in 0.2 s, then open from where it stopped
  const segs = [];
  let t = 0;
  let xx = x;
  if (state === ST.CLOSING && pending > 0) {
    segs.push({t0: 0, x0: x, v0: v, a: 0, dur: pending});
    xx += v * pending;
    t = pending;
  }
  const dec = state === ST.REV ? door.revDec : Math.abs(v) / spec.reverseT;
  const tb = dec > 0 ? Math.abs(v) / dec : 0;
  if (tb > 0) {
    segs.push({t0: t, x0: xx, v0: v, a: dec, dur: tb});
    xx += v * tb + (dec * tb * tb) / 2;
    t += tb;
  }
  return [...segs, ...openSegments(Math.max(0, xx), 0, mode, spec, t)];
}

/**
 * The gap a walker finds on reaching the door plane from distance d at speed w, starting with the door closed and
 * nobody detected: the sensor sees them at once, the controller 0.1 s later. The refs.md table, in closed form.
 */
export const arrivalGap = (d, w, mode = 'normal', spec = SPEC) => 2 * segX(forecast({x: 0, v: 0, state: ST.CLOSED}, mode, spec), d / w);

// ------------------------------------------------------------ loads on the drive
/**
 * Force on the belt F = μ·m·g·sign v + m·a (both leaves, 140 kg), the drive pulley's torque F·r, the motor's torque
 * through 1:12 at η = 0.85 (÷η when the motor drives, ×η when the door's momentum drives it), the electric power
 * F·v ÷ η (力行) or F·v × η (制動, negative), rpm, and each leaf's kinetic energy ½ m v².
 */
export function loads(v, a, spec = SPEC) {
  const m = spec.massKg;
  const moving = Math.abs(v) > 1e-4;
  const F = spec.mu * m * spec.g * (moving ? Math.sign(v) : 0) + m * a;
  const r = spec.pulleyD / 2;
  const Tp = F * r;
  const pMech = F * v;
  const motoring = pMech > 0;
  const Tm = motoring ? Tp / spec.ratio / spec.eta : (Tp / spec.ratio) * spec.eta;
  const pElec = motoring ? pMech / spec.eta : pMech * spec.eta;
  const rpmPulley = (Math.abs(v) / (Math.PI * spec.pulleyD)) * 60;
  return {
    F,
    Tp,
    Tm,
    pMech,
    pElec,
    rpmPulley,
    rpmMotor: rpmPulley * spec.ratio,
    regime: !moving ? '停止' : motoring ? '力行' : '制動',
    ke: 0.5 * spec.leafKg * v * v,
  };
}

// ------------------------------------------------------------ the simulation
/**
 * A running simulation. params: {D (検出の奥行), mode, yield (false: walkers never slow down)}. step() advances 1 ms:
 * pedestrians (from the door as it was), the sensors (the start sensors through a 0.1 s delay line, the auxiliary
 * beams at once), the controller, the door. addPed(kind, opts) sends someone: 'out' (from the street), 'in' (from the
 * lobby), 'diag' (from the street at 30°), 'linger' (walks up, stops 0.4 m short, steps into the gap while the door
 * closes, stands there, walks on). Mutates its own state only; the same calls give the same run.
 */
export function createSim(spec = SPEC, params = {}) {
  const P = {D: spec.detD, mode: 'normal', yield: true, ...params};
  const dt = spec.dt;
  const nDelay = Math.max(1, Math.round(spec.sensorDelay / dt));
  const ring = {out: new Uint8Array(nDelay), in: new Uint8Array(nDelay), k: 0};
  const door = {x: 0, v: 0, a: 0, state: ST.CLOSED, hold: 0, since: 0, cause: 0, revDec: 0};
  const sens = {outRaw: 0, inRaw: 0, out: 0, in: 0, aux: 0, outOn: -9, inOn: -9};
  const peds = [];
  const events = [];
  const sim = {spec, P, door, sens, peds, events, t: 0, steps: 0, nextId: 1};

  const posOf = (p) => [p.p0x + p.ux * p.s, p.p0z + p.uz * p.s];
  // in the start sensor's zone on its own side (side +1 outside, −1 inside)
  const inZone = (x, z, side) => Math.abs(x) <= spec.detW / 2 && z * side > 0 && z * side <= P.D;
  const inBand = (x, z) => Math.abs(x) <= spec.openW / 2 && Math.abs(z) < spec.auxBand + spec.pedDepth / 2;

  sim.addPed = (kind = 'out', o = {}) => {
    const side = kind === 'in' ? -1 : 1;
    const ang = kind === 'diag' ? (30 * Math.PI) / 180 : 0;
    const w = o.w ?? spec.walk;
    const z0 = side * (o.z0 ?? P.D + spec.startPad);
    const xc = o.x ?? (kind === 'in' ? -0.12 : kind === 'diag' ? 0.05 : 0.12);
    const ux = Math.sin(ang);
    const uz = -side * Math.cos(ang);
    const sc = Math.abs(z0) / Math.cos(ang);
    const p = {
      id: sim.nextId++,
      kind,
      w,
      side,
      p0x: xc - ux * sc,
      p0z: z0,
      ux,
      uz,
      sc,
      sEnd: sc + spec.exitLen / Math.cos(ang),
      s: 0,
      v: w,
      phase: 'walk',
      slowed: false,
      crossed: false,
      noYield: null,
      standLeft: 0,
      t0: sim.t,
      done: false,
    };
    peds.push(p);
    return p;
  };
  sim.set = (o) => Object.assign(P, o);

  // seconds until the gap reaches the walker's 700 mm, as they can see it from the door's motion
  const timeToGap = (p) => {
    // a walker aims a hair wide (2 mm a leaf) so they never arrive at 699 mm
    const xt = spec.passGap / 2 + 0.002;
    const {state} = door;
    if (state === ST.HOLD || ((state === ST.OPENING || state === ST.REV) && door.x >= xt)) return 0;
    const raw = sens.outRaw || sens.inRaw;
    const on = Math.max(sens.outRaw ? sens.outOn : -9, sens.inRaw ? sens.inOn : -9);
    const pending = Math.max(0, spec.sensorDelay - (sim.t - on));
    if (state === ST.CLOSED || state === ST.CLOSING) {
      if (!raw && !sens.aux) return Infinity;
      return segT(forecast(door, P.mode, spec, sens.aux ? 0 : pending), xt);
    }
    return segT(forecast(door, P.mode, spec, 0), xt);
  };

  const stepPed = (p) => {
    const d = p.sc - p.s;
    let vT = p.w;
    if (p.phase === 'walk') {
      if (p.kind === 'linger') {
        const sStop = p.sc - spec.lingerZ / Math.abs(p.uz);
        vT = Math.min(p.w, Math.sqrt(2 * spec.pedDec * Math.max(0, sStop - p.s)));
        if (sStop - p.s < 2e-3 && p.v < 0.06) {
          p.phase = 'wait';
          p.v = 0;
          vT = 0;
        }
      } else if (P.yield && d > 0) {
        const tn = timeToGap(p);
        if (tn === Infinity) {
          if (d < 0.6) vT = Math.min(p.w, Math.sqrt(2 * spec.pedDec * Math.max(0, d - 0.3)));
        } else if (tn > 0) vT = Math.min(p.w, d / tn);
      }
    } else if (p.phase === 'wait') {
      vT = 0;
      if ((door.state === ST.CLOSING && sim.t - door.since >= 0.4) || door.state === ST.CLOSED) p.phase = 'shuffle';
    } else if (p.phase === 'shuffle') {
      vT = spec.shuffle;
      if (p.s >= p.sc) {
        p.phase = 'stand';
        p.standLeft = spec.standT;
        p.v = 0;
        vT = 0;
      }
    } else if (p.phase === 'stand') {
      vT = 0;
      p.standLeft -= dt;
      if (p.standLeft <= 0) p.phase = 'go';
    }
    p.v += clamp(vT - p.v, -spec.pedDec * dt, spec.pedAcc * dt);
    if (p.phase === 'stand') p.v = 0;
    p.s += p.v * dt;
    const [x, z] = posOf(p);
    if (p.kind !== 'linger' && !p.crossed) {
      if (p.v < 0.95 * p.w) p.slowed = true;
      // entering the zone: the gap this walker would find without slowing down
      if (p.noYield === null && inZone(x, z, p.side)) {
        // timed from the zone's edge, where the sensor saw them (they are at most one step past it)
        const dEdge = Math.min(p.sc, P.D / Math.abs(p.uz));
        p.noYield = 2 * segX(forecast(door, P.mode, spec, door.state === ST.CLOSED || door.state === ST.CLOSING ? spec.sensorDelay : 0), dEdge / p.w);
        events.push({t: sim.t, type: 'predict', id: p.id, gap: p.noYield, D: P.D, w: p.w});
      }
    }
    if (!p.crossed && p.s >= p.sc) {
      p.crossed = true;
      if (p.kind !== 'linger') events.push({t: sim.t, type: 'arrive', id: p.id, gap: 2 * door.x, slowed: p.slowed, noYield: p.noYield, D: P.D, w: p.w});
    }
    if (p.s >= p.sEnd) p.done = true;
  };

  sim.step = () => {
    sim.t = (sim.steps + 1) * dt;
    sim.steps++;
    // 1 pedestrians
    for (const p of peds) if (!p.done) stepPed(p);
    for (let i = peds.length - 1; i >= 0; i--) if (peds[i].done) peds.splice(i, 1);
    // 2 sensors
    let outRaw = 0;
    let inRaw = 0;
    let aux = 0;
    for (const p of peds) {
      const [x, z] = posOf(p);
      const moving = p.v >= spec.motionMin;
      if (moving && inZone(x, z, 1)) outRaw = 1;
      if (moving && inZone(x, z, -1)) inRaw = 1;
      if (inBand(x, z)) aux = 1;
    }
    if (outRaw && !sens.outRaw) sens.outOn = sim.t;
    if (inRaw && !sens.inRaw) sens.inOn = sim.t;
    sens.outRaw = outRaw;
    sens.inRaw = inRaw;
    sens.out = ring.out[ring.k];
    sens.in = ring.in[ring.k];
    ring.out[ring.k] = outRaw;
    ring.in[ring.k] = inRaw;
    ring.k = (ring.k + 1) % nDelay;
    sens.aux = aux;
    // 3 the controller
    const trig = sens.out || sens.in || sens.aux;
    const go = (st) => {
      door.state = st;
      door.since = sim.t;
    };
    if (door.state === ST.CLOSED && trig) {
      door.cause = sens.aux && !(sens.out || sens.in) ? 2 : 1;
      go(ST.OPENING);
    } else if (door.state === ST.HOLD) {
      door.hold = trig ? spec.holdT : door.hold - dt;
      if (door.hold <= 0) {
        door.hold = 0;
        go(ST.CLOSING);
      }
    } else if (door.state === ST.CLOSING && trig) {
      door.cause = sens.aux ? 2 : 1;
      door.revDec = Math.max(Math.abs(door.v) / spec.reverseT, 1e-9);
      go(ST.REV);
    }
    // 4 the door
    if (door.state === ST.OPENING || door.state === ST.CLOSING) {
      const dir = door.state === ST.OPENING ? 1 : -1;
      const n = doorStep(door.x, door.v, dir, motionParams(dir, P.mode, spec), spec, dt);
      door.x = n.x;
      door.v = n.v;
      door.a = n.a;
      if (n.done) {
        if (dir > 0) {
          go(ST.HOLD);
          door.hold = spec.holdT;
        } else {
          go(ST.CLOSED);
          door.cause = 0;
        }
      }
    } else if (door.state === ST.REV) {
      // braking a closing door: v < 0, the deceleration points toward open
      const vn = door.v + door.revDec * dt;
      if (vn >= -1e-9) {
        door.x += (door.v * dt) / 2;
        door.a = -door.v / dt;
        door.v = 0;
        go(ST.OPENING);
      } else {
        door.x += ((door.v + vn) / 2) * dt;
        door.v = vn;
        door.a = door.revDec;
      }
      door.x = Math.max(0, door.x);
    } else {
      door.v = 0;
      door.a = 0;
    }
  };
  sim.runTo = (T) => {
    while (sim.t < T - dt / 2) sim.step();
  };
  return sim;
}

/**
 * Runs a scenario once and stores it: {duration, D, mode, yield, events: [{t, ped: {kind, w, x, z0}} | {t, set: {D,
 * mode}}]}. Returns typed arrays per 1 ms step (door, controller, sensors, parameters), every pedestrian's walked
 * distance and speed over its life, and the predict / arrive events. Same scenario, same arrays.
 */
export function simulate(scenario, spec = SPEC) {
  const dt = spec.dt;
  const n = Math.round(scenario.duration / dt) + 1;
  const sim = createSim(spec, {D: scenario.D ?? spec.detD, mode: scenario.mode ?? 'normal', yield: scenario.yield ?? true});
  const R = {
    dt,
    n,
    duration: scenario.duration,
    x: new Float64Array(n),
    v: new Float64Array(n),
    a: new Float64Array(n),
    state: new Uint8Array(n),
    hold: new Float32Array(n),
    cause: new Uint8Array(n),
    sOut: new Uint8Array(n),
    sIn: new Uint8Array(n),
    sAux: new Uint8Array(n),
    D: new Float32Array(n),
    mode: new Uint8Array(n),
    peds: [],
    events: sim.events,
  };
  const evs = [...(scenario.events || [])].sort((a, b) => a.t - b.t);
  let ei = 0;
  const live = new Map();
  const record = (i) => {
    const d = sim.door;
    R.x[i] = d.x;
    R.v[i] = d.v;
    R.a[i] = d.a;
    R.state[i] = d.state;
    R.hold[i] = d.state === ST.HOLD ? d.hold : 0;
    R.cause[i] = d.cause;
    R.sOut[i] = sim.sens.out;
    R.sIn[i] = sim.sens.in;
    R.sAux[i] = sim.sens.aux;
    R.D[i] = sim.P.D;
    R.mode[i] = MODES.indexOf(sim.P.mode);
    for (const p of sim.peds) {
      let r = live.get(p);
      if (!r) {
        r = {id: p.id, kind: p.kind, w: p.w, p0x: p.p0x, p0z: p.p0z, ux: p.ux, uz: p.uz, sc: p.sc, i0: i, i1: i, s: new Float32Array(n - i), v: new Float32Array(n - i), stand: new Uint8Array(n - i)};
        live.set(p, r);
        R.peds.push(r);
      }
      r.s[i - r.i0] = p.s;
      r.v[i - r.i0] = p.v;
      r.stand[i - r.i0] = p.phase === 'stand' || p.phase === 'wait' ? 1 : 0;
      r.i1 = i;
    }
  };
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    while (ei < evs.length && evs[ei].t <= t + 1e-9) {
      const e = evs[ei++];
      if (e.set) sim.set(e.set);
      if (e.ped) sim.addPed(e.ped.kind, e.ped);
    }
    if (i > 0) sim.step();
    record(i);
  }
  return R;
}

/** index of time t in a stored run */
export const idxOf = (R, t) => clamp(Math.round(t / R.dt), 0, R.n - 1);

/**
 * Everything the page draws for one moment, from a door {x, v, a, state, hold, cause}, the sensors {out, in, aux},
 * the parameters {D, mode} and the pedestrians [{id, kind, x, z, hx, hz, v, s, stand}].
 */
export function frameState({door, sens, P, peds}, spec = SPEC) {
  const L = loads(door.v, door.a, spec);
  const m = modeOf(P.mode, spec);
  const dirV = door.v > 1e-4 ? 1 : door.v < -1e-4 ? -1 : 0;
  return {
    x: door.x,
    v: door.v,
    a: door.a,
    gap: 2 * door.x,
    gapMM: 2000 * door.x,
    speedMM: Math.abs(door.v) * 1000,
    vLimitMM: (dirV < 0 ? m.vClose : m.vOpen) * 1000,
    open: door.x / spec.travel,
    state: door.state,
    stateName: STATE_NAME[door.state],
    hold: door.hold,
    cause: door.cause,
    causeName: CAUSE_NAME[door.cause],
    sOut: sens.out,
    sIn: sens.in,
    sAux: sens.aux,
    D: P.D,
    mode: P.mode,
    modeName: m.name,
    ...L,
    keOpen: 0.5 * spec.leafKg * m.vOpen * m.vOpen,
    keClose: 0.5 * spec.leafKg * m.vClose * m.vClose,
    // the pulley turns with the belt: one leaf's travel over the pitch radius
    pulleyAngle: door.x / (spec.pulleyD / 2),
    peds,
    // the accent: the drive works while the door moves, ramped so the colour never pops
    work: clamp(Math.abs(door.v) / 0.08, 0, 1),
  };
}

/** a stored pedestrian's pose at step i (null when not on stage) */
export function pedAt(r, i) {
  if (i < r.i0 || i > r.i1) return null;
  const k = i - r.i0;
  const s = r.s[k];
  return {id: r.id, kind: r.kind, x: r.p0x + r.ux * s, z: r.p0z + r.uz * s, hx: r.ux, hz: r.uz, v: r.v[k], s, stand: r.stand[k]};
}

/** the frame state of a stored run at time t */
export function stateAt(R, t, spec = SPEC) {
  const i = idxOf(R, t);
  const door = {x: R.x[i], v: R.v[i], a: R.a[i], state: R.state[i], hold: R.hold[i], cause: R.cause[i]};
  const peds = R.peds.map((r) => pedAt(r, i)).filter(Boolean);
  return {...frameState({door, sens: {out: R.sOut[i], in: R.sIn[i], aux: R.sAux[i]}, P: {D: R.D[i], mode: MODES[R.mode[i]]}, peds}, spec), t: i * R.dt};
}

/** the frame state of a running simulation */
export function stateOfSim(sim) {
  const peds = sim.peds.map((p) => ({id: p.id, kind: p.kind, x: p.p0x + p.ux * p.s, z: p.p0z + p.uz * p.s, hx: p.ux, hz: p.uz, v: p.v, s: p.s, stand: p.phase === 'stand' || p.phase === 'wait' ? 1 : 0}));
  return {...frameState({door: sim.door, sens: sim.sens, P: sim.P, peds}, sim.spec), t: sim.t};
}

/** the latest 'predict' and 'arrive' events at or before t (the console's "着いたときのすき間") */
export function lastWalker(events, t) {
  let pred = null;
  let arr = null;
  for (const e of events) {
    if (e.t > t) break;
    if (e.type === 'predict') pred = e;
    else arr = e;
  }
  // the walker on the way in wins over the one who already arrived
  if (pred && (!arr || pred.id > arr.id)) return {id: pred.id, noYield: pred.gap, D: pred.D, w: pred.w, arrived: null, slowed: null};
  if (arr) return {id: arr.id, noYield: arr.noYield, D: arr.D, w: arr.w, arrived: arr.gap, slowed: arr.slowed};
  return null;
}
