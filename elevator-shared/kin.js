// The elevator's math, no three.js. Every number lives in SPEC (sources in ../elevator/refs.md); the geometry, the
// console and the tests all read it from here. One input poses the whole machine: the car's height pos (m above the
// 1F floor). The trip profile gives pos, v, a, j as closed-form functions of time; state() turns them into every pose
// and readout (counterweight, sheave, ropes, tensions, motor torque, door opening).

export const SPEC = {
  g: 9.80665,
  // 建物
  floors: 10,
  floorH: 3.8, // 階高（仮定）
  pit: 1.6, // ピット深さ（仮定）
  overhead: 4.8, // オーバーヘッド（仮定）
  // かご・ドア
  persons: 15, // 定員 = 1000 / 65
  personKg: 65, // 建築基準法施行令の定員算定
  ratedKg: 1000,
  cabW: 1.6, // かご内法 幅
  cabD: 1.5, // 奥行
  cabH: 2.3, // 高さ
  doorW: 0.9, // 出入口有効幅、2枚戸中央開き
  doorH: 2.1, // 出入口高さ（仮定）
  shaftW: 2.15, // 昇降路内法（仮定）
  shaftD: 2.2,
  doorOpen: 2.0, // 戸開時間 s（仮定）
  doorClose: 3.0, // 戸閉時間 s（仮定）
  doorHold: 2.0, // 戸開放保持 s（仮定）
  // 駆動系
  vMax: 1.75, // 定格速度 105 m/分
  aMax: 0.9, // 最大加速度 m/s²（仮定）
  jMax: 1.2, // 加加速度 m/s³（仮定）
  carKg: 1200, // かご自重（仮定）
  balance: 0.45, // おもりの釣り合い率（Hollister-Whitney: 40〜50%）
  cwtKg: 1650, // = 1200 + 1000 × 0.45
  ropes: 5, // 主索本数
  ropeD: 0.01, // 主索径
  ropeKgM: 0.35, // 主索 1本あたり kg/m（仮定）
  sheaveD: 0.5, // 綱車ピッチ径（D/d = 50、EN 81 は 40 以上）
  deflD: 0.4, // そらせ車ピッチ径（仮定）
  // 納まり（図形の仮定。綱長さはここから決まる）
  sheaveLift: 0.75, // 機械室床から綱車中心まで
  deflLift: 0.35, // 機械室床からそらせ車中心まで
  hitchCar: 3.1, // かご床からかご側綱止めまで
};
// heights rounded to 1 µm so 9 × 3.8 reads 34.2, not 34.199999999999996
const um = (x) => Math.round(x * 1e6) / 1e6;
SPEC.travel = um(SPEC.floorH * (SPEC.floors - 1)); // 34.2 m
SPEC.mrFloor = SPEC.travel + SPEC.overhead; // 機械室床 39.0 m
SPEC.sheaveY = SPEC.mrFloor + SPEC.sheaveLift; // 綱車中心
SPEC.deflY = SPEC.mrFloor + SPEC.deflLift; // そらせ車中心
// 1:1 ローピング: かごが最下階のとき、おもりの綱止めは最上階のかごの綱止めと同じ高さ
SPEC.cwtHitch0 = SPEC.travel + SPEC.hitchCar;

export const floorY = (f, spec = SPEC) => um((f - 1) * spec.floorH);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

// ------------------------------------------------------------ the trip: a jerk-limited S-curve
/**
 * Peak speed and phase times for a run of L metres. Full profile: jerk up, constant a, jerk down, cruise, and the
 * mirror. A short run that cannot reach vMax drops the cruise and lowers the peak; a very short one never reaches aMax.
 */
export function profile(L, {vMax: V, aMax: A, jMax: J} = SPEC) {
  const accDist = (v, aP) => v * (aP / J + v / aP); // distance to reach v and come back down: v × Tacc
  let v = V;
  let aP = v >= (A * A) / J ? A : Math.sqrt(v * J);
  if (L < accDist(v, aP)) {
    // the cruise vanishes: solve L = v²/A + v·A/J for v, assuming aMax is still reached
    v = (-(A * A) / J + Math.sqrt((A * A * A * A) / (J * J) + 4 * A * L)) / 2;
    aP = A;
    if (v < (A * A) / J) {
      // aMax is never reached: L = 2 v sqrt(v/J)
      v = Math.cbrt((L * L * J) / 4);
      aP = Math.sqrt(v * J);
    }
  }
  const tj = aP / J;
  const ta = v / aP - aP / J;
  const tc = (L - accDist(v, aP)) / v;
  return {vPeak: v, aPeak: aP, tj, ta: Math.max(0, ta), tc: Math.max(0, tc)};
}

/** A trip between two floors. at(tau) → {pos_m, v, a, j}: pos_m is the car floor's height above 1F, v/a/j signed (+ up). */
export function trip(fromFloor, toFloor, spec = SPEC) {
  const y0 = floorY(fromFloor, spec);
  const y1 = floorY(toFloor, spec);
  const L = Math.abs(y1 - y0);
  const s = Math.sign(y1 - y0);
  if (L < 1e-9) return {from: fromFloor, to: toFloor, L: 0, dir: 0, dur: 0, vPeak: 0, at: () => ({pos_m: y0, v: 0, a: 0, j: 0}), end: {pos_m: y0, v: 0}};
  const P = profile(L, spec);
  const J = spec.jMax;
  const segs = [
    [P.tj, J],
    [P.ta, 0],
    [P.tj, -J],
    [P.tc, 0],
    [P.tj, -J],
    [P.ta, 0],
    [P.tj, J],
  ];
  // start state of every segment, integrated exactly (constant jerk inside a segment)
  const starts = [];
  let t = 0;
  let p = 0;
  let v = 0;
  let a = 0;
  for (const [d, j] of segs) {
    starts.push({t, p, v, a, j});
    p += v * d + (a * d * d) / 2 + (j * d * d * d) / 6;
    v += a * d + (j * d * d) / 2;
    a += j * d;
    t += d;
  }
  const dur = t;
  const end = {pos_m: y0 + s * p, v: s * v, a: s * a};
  const at = (tau) => {
    if (tau <= 0) return {pos_m: y0, v: 0, a: 0, j: 0};
    if (tau >= dur) return {pos_m: y1, v: 0, a: 0, j: 0};
    let i = starts.length - 1;
    while (i > 0 && starts[i].t > tau) i--;
    const S = starts[i];
    const u = tau - S.t;
    const pp = S.p + S.v * u + (S.a * u * u) / 2 + (S.j * u * u * u) / 6;
    const vv = S.v + S.a * u + (S.j * u * u) / 2;
    const aa = S.a + S.j * u;
    return {pos_m: y0 + s * pp, v: s * vv, a: s * aa, j: s * S.j};
  };
  return {from: fromFloor, to: toFloor, L, dir: s, dur, vPeak: P.vPeak, aPeak: P.aPeak, phases: P, at, end};
}

/** Which part of the S-curve tau is in, as the console's phase line. */
export function tripPhase(tr, tau) {
  if (!tr || tr.dur === 0) return '停止';
  if (tau <= 0) return '発車待ち';
  if (tau >= tr.dur) return '着床';
  const {tj, ta, tc} = tr.phases;
  const acc = 2 * tj + ta;
  if (tau < acc) return '加速';
  if (tau < acc + tc) return '定速走行';
  return '減速';
}

// ------------------------------------------------------------ the door cycle
export const doorDur = (hold = SPEC.doorHold) => SPEC.doorOpen + hold + SPEC.doorClose;
/** Door opening 0..1 at tau seconds into a cycle: open 2.0 s, hold, close 3.0 s (smooth, as a door operator drives it). */
export function doorAt(tau, hold = SPEC.doorHold) {
  const o = SPEC.doorOpen;
  const c = SPEC.doorClose;
  if (tau <= 0) return {open: 0, moving: 0, phase: '戸閉'};
  if (tau < o) return {open: smoother(tau / o), moving: 1, phase: '戸開中'};
  if (tau < o + hold) return {open: 1, moving: 0, phase: '戸開'};
  if (tau < o + hold + c) return {open: 1 - smoother((tau - o - hold) / c), moving: 1, phase: '戸閉中'};
  return {open: 0, moving: 0, phase: '戸閉'};
}

// ------------------------------------------------------------ forces
/**
 * Rope tensions at the traction sheave (N). pos: car height, a: the car's acceleration (+ up), loadKg on the car.
 * ropes: count the hanging rope weight on each side (no compensating ropes). The counterweight moves opposite (1:1).
 */
export function tensions({pos, a = 0, loadKg = 0, ropes = true}, spec = SPEC) {
  const lc = ropeCar(pos, spec);
  const lw = ropeCwt(pos, spec);
  const rk = ropes ? spec.ropes * spec.ropeKgM : 0;
  const mCar = spec.carKg + loadKg + rk * lc;
  const mCwt = spec.cwtKg + rk * lw;
  return {mCar, mCwt, tCar: mCar * (spec.g + a), tCwt: mCwt * (spec.g - a)};
}
/** vertical rope from the sheave down to the car's hitch, m */
export const ropeCar = (pos, spec = SPEC) => spec.sheaveY - (pos + spec.hitchCar);
/** the counterweight's hitch height: it rises as the car goes down */
export const cwtHitch = (pos, spec = SPEC) => spec.cwtHitch0 - pos;
/** vertical rope from the deflector sheave down to the counterweight's hitch, m */
export const ropeCwt = (pos, spec = SPEC) => spec.deflY - cwtHitch(pos, spec);

/**
 * Every pose and readout for one moment. m = {pos_m, v, a, j}; persons on board; door 0..1 open; doorMoving 0..1.
 * Torque is the motor's, positive when it pulls the car side up: (T_car − T_cwt) × D/2. Power = torque × ω; positive
 * is 力行 (the motor drives the load), negative is 回生 (the load drives the motor, which brakes it and feeds power back).
 */
export function state({pos_m, v = 0, a = 0, j = 0}, {persons = 0, door = 0, doorMoving = 0, doorPhase = '戸閉', ropes = true} = {}, spec = SPEC) {
  const R = spec.sheaveD / 2;
  const loadKg = persons * spec.personKg;
  const T = tensions({pos: pos_m, a, loadKg, ropes}, spec);
  const torque = ((T.tCar - T.tCwt) * R) / 1000; // kN·m
  const omega = v / R; // rad/s, + when the car goes up
  const powerKW = (torque * omega); // kN·m × rad/s = kW
  const moving = Math.abs(v) > 1e-4;
  const mode = !moving ? '停止' : powerKW >= 0 ? '力行' : '回生';
  const fl = clamp(Math.round(pos_m / spec.floorH) + 1, 1, spec.floors);
  const level = Math.abs(pos_m - floorY(fl)) < 0.005;
  return {
    pos: pos_m,
    v,
    a,
    j,
    speedMpm: Math.abs(v) * 60,
    carY: pos_m,
    cwtY: cwtHitch(pos_m, spec),
    sheaveAngle: pos_m / R, // rad turned since the car stood at 1F
    deflAngle: pos_m / (spec.deflD / 2),
    rpm: (Math.abs(v) / (Math.PI * spec.sheaveD)) * 60,
    ropeCar: ropeCar(pos_m, spec),
    ropeCwt: ropeCwt(pos_m, spec),
    mCar: T.mCar,
    mCwt: T.mCwt,
    tCar: T.tCar / 1000,
    tCwt: T.tCwt / 1000,
    torque,
    powerKW,
    mode,
    persons,
    loadKg,
    loadPct: (loadKg / spec.ratedKg) * 100,
    door,
    doorPct: door * 100,
    doorMoving,
    doorPhase,
    floor: fl,
    level,
    dir: !moving ? 0 : Math.sign(v),
    dirText: !moving ? '停止' : v > 0 ? '上昇' : '下降',
    // the accent: what is working right now (ramps so the colour never pops)
    workTravel: clamp(Math.abs(v) / 0.25, 0, 1),
    workDoor: doorMoving,
  };
}

// ------------------------------------------------------------ a schedule of trips and door cycles
/**
 * acts: [{kind: 'trip', t0, from, to, persons} | {kind: 'door', t0, floor, hold, persons: [before, after]}] in time
 * order, each starting after the previous one ends. Returns motionAt(t) → {m, persons, door, doorMoving, doorPhase,
 * trip, tripTau, floor, act}. The trip objects are built once here; motionAt is pure.
 */
export function schedule(acts, {floor = 1, persons = 0} = {}) {
  const list = acts.map((x) => (x.kind === 'trip' ? {...x, trip: trip(x.from, x.to)} : {...x, hold: x.hold ?? SPEC.doorHold}));
  for (const x of list) x.t1 = x.t0 + (x.kind === 'trip' ? x.trip.dur : doorDur(x.hold));
  for (let i = 1; i < list.length; i++) if (list[i].t0 < list[i - 1].t1 - 1e-9) throw new Error(`schedule overlap at ${list[i].t0}`);
  const motionAt = (t) => {
    let cur = null;
    let lastTrip = null;
    for (const x of list) {
      if (x.t0 > t) break;
      cur = x;
      if (x.kind === 'trip') lastTrip = x;
    }
    let fl = floor;
    let p = persons;
    if (cur) {
      fl = cur.kind === 'trip' ? cur.to : cur.floor;
      p = cur.kind === 'trip' ? cur.persons : cur.persons[1];
    }
    // before the current act's start, the car stands where the last act left it
    if (!cur) return {m: {pos_m: floorY(fl), v: 0, a: 0, j: 0}, persons: p, door: 0, doorMoving: 0, doorPhase: '戸閉', trip: null, tripTau: 0, floor: fl, act: null};
    if (cur.kind === 'trip') {
      const tau = t - cur.t0;
      return {m: cur.trip.at(tau), persons: cur.persons, door: 0, doorMoving: 0, doorPhase: '戸閉', trip: cur.trip, tripTau: tau, floor: tau >= cur.trip.dur ? cur.to : cur.from, act: cur};
    }
    const tau = t - cur.t0;
    const d = doorAt(tau, cur.hold);
    // passengers step off and on while the door stands open
    const o = SPEC.doorOpen;
    const k = clamp((tau - o - 0.2) / Math.max(0.1, cur.hold - 0.4), 0, 1);
    const pp = Math.round(cur.persons[0] + (cur.persons[1] - cur.persons[0]) * k);
    const tt = lastTrip ? lastTrip.trip : null;
    return {m: {pos_m: floorY(cur.floor), v: 0, a: 0, j: 0}, persons: pp, door: d.open, doorMoving: d.moving, doorPhase: d.phase, trip: tt, tripTau: tt ? tt.dur : 0, floor: cur.floor, act: cur};
  };
  return {list, motionAt, end: list.length ? list[list.length - 1].t1 : 0};
}
