// node autodoor/kin.test.mjs — checks autodoor-shared/kin.js against the hand-worked numbers in autodoor/refs.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {beatsOf, DURATION, scenarioOf, SCRIPT} from '../autodoor-shared/script.js';
import {arrivalGap, createSim, doorStep, idxOf, loads, motionParams, openSegments, segT, simulate, SPEC, ST} from '../autodoor-shared/kin.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log(`ok  ${name}`);
};

/** time for doorStep alone to run a full stroke from rest */
const stroke = (dir, mode = 'normal') => {
  let x = dir > 0 ? 0 : SPEC.travel;
  let v = 0;
  let n = 0;
  let vmax = 0;
  for (;;) {
    const s = doorStep(x, v, dir, motionParams(dir, mode), SPEC);
    n++;
    x = s.x;
    v = s.v;
    vmax = Math.max(vmax, Math.abs(v));
    if (s.done) break;
  }
  return {t: n * SPEC.dt, vmax};
};
/** first index at or after i0 where the stored state is st */
const firstState = (R, st, i0 = 0) => {
  for (let i = i0; i < R.n; i++) if (R.state[i] === st) return i;
  return -1;
};

test('SPEC: travel = half the clear opening, 140 kg on the belt', () => {
  near(SPEC.travel, SPEC.openW / 2, 1e-12, 'travel');
  assert.equal(SPEC.massKg, 140);
  near(SPEC.leafW - SPEC.overlap, SPEC.openW / 2, 1e-12, 'leaf minus overlap covers half the opening');
});

test('open stroke: 0.625 + 0.928 + 0.500 + 0.300 = 2.353 s (closed form and 1 ms stepping, ±0.01 s)', () => {
  const segs = openSegments(0, 0);
  const durs = segs.map((g) => g.dur);
  near(durs[0], 0.625, 1e-9, 'accelerate');
  near(durs[1], 0.928, 1e-3, 'cruise');
  near(durs[2], 0.5, 1e-9, 'brake to creep');
  near(durs[3], 0.3, 1e-9, 'creep');
  near(segs[0].v0 * 0 + 0.5 * 0.8 * 0.625 ** 2, 0.156, 1e-3, 'accelerate distance 0.156 m');
  const tot = durs.reduce((a, b) => a + b, 0);
  near(tot, 2.353, 5e-4, 'closed form');
  near(stroke(1).t, 2.353, 0.01, 'stepped');
});

test('close stroke: 0.700 + 1.518 + 0.540 + 0.375 = 3.133 s (1 ms stepping, ±0.01 s)', () => {
  // the closing profile is the opening one with the closing limits: same formulae, mirrored
  const {vMax, a, vc} = motionParams(-1);
  const acc = vMax / a;
  const brake = (vMax - vc) / a;
  const creep = SPEC.creep / vc;
  const cruise = (SPEC.travel - (vMax * vMax) / (2 * a) - (vMax * vMax - vc * vc) / (2 * a) - SPEC.creep) / vMax;
  near(acc, 0.7, 1e-9, 'accelerate');
  near(cruise, 1.518, 1e-3, 'cruise');
  near(brake, 0.54, 1e-9, 'brake');
  near(creep, 0.375, 1e-9, 'creep');
  near(acc + cruise + brake + creep, 3.133, 5e-4, 'closed form');
  near(stroke(-1).t, 3.133, 0.01, 'stepped');
});

test('the full simulation opens in 2.353 s and closes in 3.133 s (state changes, ±0.01 s)', () => {
  const R = simulate({duration: 16, events: [{t: 0.2, ped: {kind: 'out'}}]});
  const i1 = firstState(R, ST.OPENING);
  const i2 = firstState(R, ST.HOLD, i1);
  const i3 = firstState(R, ST.CLOSING, i2);
  const i4 = firstState(R, ST.CLOSED, i3);
  assert.ok(i1 > 0 && i2 > i1 && i3 > i2 && i4 > i3, 'open → hold → close → closed');
  near((i2 - i1) * R.dt, 2.353, 0.01, 'open');
  near((i4 - i3) * R.dt, 3.133, 0.01, 'close');
  near(R.x[i2], SPEC.travel, 1e-12, 'fully open');
  assert.equal(R.x[i4], 0);
});

test('kinetic energy per leaf: 8.75 J at 500 mm/s, 4.29 J at 350 mm/s; 10 J at 0.5345 m/s', () => {
  near(loads(0.5, 0).ke, 8.75, 1e-9, 'open');
  near(loads(0.35, 0).ke, 4.29, 5e-3, 'close');
  near(Math.sqrt((2 * SPEC.keMax) / SPEC.leafKg), 0.5345, 5e-5, '10 J speed');
});

test('高齢者・子ども mode: open 400 mm/s → 5.6 J, close 250 mm/s → 2.19 J', () => {
  near(loads(SPEC.modes.gentle.vOpen, 0).ke, 5.6, 1e-9, 'open');
  near(loads(SPEC.modes.gentle.vClose, 0).ke, 2.19, 5e-3, 'close');
});

test('drive pulley at 0.5 m/s: 238.7 rpm, motor ×12 = 2865 rpm', () => {
  const L = loads(0.5, 0);
  near(L.rpmPulley, 238.7, 0.05, 'pulley');
  near(L.rpmMotor, 2865, 0.5, 'motor');
});

test('accelerating open: 27.5 N + 112 N → 2.79 N·m at the pulley, 0.273 N·m at the motor (力行)', () => {
  const L = loads(0.3, 0.8);
  near(SPEC.mu * SPEC.massKg * SPEC.g, 27.5, 0.05, 'rolling');
  near(L.F, 139.5, 0.05, 'force');
  near(L.Tp, 2.79, 0.005, 'pulley torque');
  near(L.Tm, 0.273, 5e-4, 'motor torque');
  assert.equal(L.regime, '力行');
});

test('power: 27.5 N × 0.5 m/s = 13.7 W at the doors (16.2 W from the supply ÷ 0.85); end of acceleration 82 W', () => {
  const c = loads(0.5, 0);
  near(c.pMech, 13.7, 0.05, 'cruise, mechanical');
  near(c.pElec, 13.7 / 0.85, 0.1, 'cruise, electric');
  near(loads(0.5, 0.8).pElec, 82, 0.1, 'end of acceleration, electric');
});

test('braking the opening door: the force turns negative → 制動, the power negative', () => {
  const L = loads(0.4, -0.8);
  near(L.F, 27.468 - 112, 0.01, 'force');
  assert.equal(L.regime, '制動');
  assert.ok(L.pElec < 0);
});

test('the gap on arrival, refs.md table, closed form and simulated without slowing down (±15 mm)', () => {
  const table = [
    [1.0, 1.0, 588],
    [1.0, 1.2, 421],
    [1.0, 1.4, 302],
    [1.5, 1.0, 1088],
    [1.5, 1.2, 837],
    [1.5, 1.4, 659],
  ];
  for (const [D, w, mm] of table) {
    near(arrivalGap(D, w) * 1000, mm, 1, `closed form D ${D} m, ${w} m/s`);
    const R = simulate({duration: 8, D, yield: false, events: [{t: 0.1, ped: {kind: 'out', w}}]});
    const arr = R.events.find((e) => e.type === 'arrive');
    const pred = R.events.find((e) => e.type === 'predict');
    near(arr.gap * 1000, mm, 15, `simulated D ${D} m, ${w} m/s`);
    near(pred.gap * 1000, mm, 15, `predicted on entering the zone, D ${D} m, ${w} m/s`);
    assert.equal(arr.slowed, false);
  }
});

test('walkers who would find < 700 mm slow down and arrive with ≥ 690 mm; those with room do not', () => {
  const run = (D, w) => simulate({duration: 9, D, events: [{t: 0.1, ped: {kind: 'out', w}}]}).events.find((e) => e.type === 'arrive');
  const tight = run(1.0, 1.2);
  assert.equal(tight.slowed, true);
  assert.ok(tight.gap >= 0.69, `arrived with ${tight.gap}`);
  near(tight.noYield * 1000, 421, 15, 'the gap without slowing, kept for the console');
  const room = run(1.5, 1.2);
  assert.equal(room.slowed, false);
  near(room.gap * 1000, 837, 15, 'the 1.50 m walker');
});

test('reversal: someone stepping into the closing door → stops within 0.2 s and reopens (auxiliary beams)', () => {
  const R = simulate({duration: 22, events: [{t: 0.1, ped: {kind: 'linger', w: 1.0}}]});
  const iRev = firstState(R, ST.REV);
  assert.ok(iRev > 0, 'reversed');
  assert.equal(R.cause[iRev], 2, 'by the auxiliary beams');
  assert.equal(R.state[iRev - 1], ST.CLOSING);
  assert.equal(R.sAux[iRev], 1);
  let iStop = iRev;
  while (R.v[iStop] < 0) iStop++;
  assert.ok((iStop - iRev) * R.dt <= SPEC.reverseT + 1e-9, `stopped after ${(iStop - iRev) * R.dt} s`);
  assert.equal(R.state[iStop], ST.OPENING);
  assert.ok(firstState(R, ST.HOLD, iStop) > 0, 'opens fully again');
  // the start sensor never saw the person standing or shuffling (動体検知), so it was the beams alone
  assert.equal(R.sOut[iRev], 0);
  assert.ok(R.x[iRev] > 0.2, `still a wide gap when it reversed: ${2 * R.x[iRev]} m`);
});

test('every mode: speed never above its limit, kinetic energy ≤ 10 J', () => {
  for (const mode of ['normal', 'gentle']) {
    const R = simulate({duration: 30, mode, events: [{t: 0.1, ped: {kind: 'out'}}, {t: 6, ped: {kind: 'linger', w: 1.0}}, {t: 16, ped: {kind: 'in', w: 1.6}}]});
    const m = SPEC.modes[mode];
    let maxO = 0;
    let maxC = 0;
    let ke = 0;
    for (let i = 0; i < R.n; i++) {
      if (R.v[i] > 0) maxO = Math.max(maxO, R.v[i]);
      else maxC = Math.max(maxC, -R.v[i]);
      ke = Math.max(ke, loads(R.v[i], R.a[i]).ke);
    }
    assert.ok(maxO <= m.vOpen + 1e-12, `${mode} open ${maxO}`);
    assert.ok(maxC <= m.vClose + 1e-12, `${mode} close ${maxC}`);
    near(maxO, m.vOpen, 1e-9, `${mode} reaches the open limit`);
    assert.ok(ke <= SPEC.keMax, `${mode} ${ke} J`);
  }
});

test('the hold: 3.0 s after the last detection, renewed while someone is detected', () => {
  const R = simulate({duration: 14, events: [{t: 0.1, ped: {kind: 'out'}}]});
  const iC = firstState(R, ST.CLOSING);
  // the last step with a (delayed) detection
  let iLast = 0;
  for (let i = 0; i < iC; i++) if (R.sOut[i] || R.sIn[i] || R.sAux[i]) iLast = i;
  near((iC - iLast) * R.dt, SPEC.holdT, 2e-3, 'hold after the last detection');
});

test('the sensor delay: the door starts 0.1 s after the walker enters the zone', () => {
  const R = simulate({duration: 4, events: [{t: 0.1, ped: {kind: 'out'}}]});
  const pred = R.events.find((e) => e.type === 'predict');
  near(firstState(R, ST.OPENING) * R.dt - pred.t, SPEC.sensorDelay, 2e-3, 'delay');
});

test('deterministic: the same scenario gives the same arrays', () => {
  const sc = {duration: 20, events: [{t: 0.1, ped: {kind: 'out'}}, {t: 3, set: {D: 1.0}}, {t: 5, ped: {kind: 'diag', w: 1.4}}, {t: 9, set: {mode: 'gentle'}}, {t: 10, ped: {kind: 'linger'}}]};
  const a = simulate(sc);
  const b = simulate(sc);
  for (const k of ['x', 'v', 'a', 'state', 'hold', 'sOut', 'sIn', 'sAux', 'D', 'mode']) assert.deepEqual(a[k], b[k], k);
  assert.equal(a.peds.length, b.peds.length);
  a.peds.forEach((p, i) => assert.deepEqual(p.s, b.peds[i].s));
  assert.deepEqual(a.events, b.events);
});

test('the live stepper continues a stored run exactly', () => {
  const sc = {duration: 12, events: [{t: 0.1, ped: {kind: 'out'}}, {t: 4, ped: {kind: 'in'}}]};
  const R = simulate(sc);
  const sim = createSim(SPEC, {});
  for (const e of sc.events) {
    sim.runTo(e.t - SPEC.dt);
    sim.addPed(e.ped.kind, e.ped);
  }
  sim.runTo(9);
  near(sim.door.x, R.x[idxOf(R, 9)], 1e-12, 'x at 9 s');
  assert.equal(sim.door.state, R.state[idxOf(R, 9)]);
});

test('segT inverts the opening: time to a 700 mm gap from rest = 1.0125 s', () => {
  near(segT(openSegments(0, 0), 0.35), 0.625 + (0.35 - 0.15625) / 0.5, 1e-9, 't');
});

test('the tour: 45–55 s, the timeline matches the script and the run, the beats the brief asks for happen', () => {
  assert.ok(DURATION >= 45 && DURATION <= 55, `duration ${DURATION}`);
  const R = simulate(scenarioOf());
  const tl = JSON.parse(fs.readFileSync(new URL('../autodoor-film/timeline.json', import.meta.url), 'utf8'));
  assert.equal(tl.duration, DURATION);
  assert.deepEqual(tl.beats, beatsOf(R));
  const arr = R.events.filter((e) => e.type === 'arrive');
  // beat 3: 1.50 m → 837 mm (exactly 837.5) without slowing, then 1.00 m → 421 mm, so the walker slows down
  near(arr[1].noYield * 1000, 837, 1, 'the 1.50 m walker');
  assert.equal(arr[1].slowed, false);
  near(arr[2].noYield * 1000, 421, 0.5, 'the 1.00 m walker');
  assert.equal(arr[2].slowed, true);
  assert.ok(arr[2].gap >= SPEC.passGap, `arrived with ${arr[2].gap}`);
  // beat 4: the reversal by the beams; beat 5: the gentle mode closes at 250 mm/s
  const iRev = firstState(R, ST.REV);
  assert.equal(R.cause[iRev], 2);
  const tMode = SCRIPT.find((e) => e.mode).t;
  let vMin = 0;
  for (let i = idxOf(R, tMode); i < R.n; i++) vMin = Math.min(vMin, R.v[i]);
  near(vMin, -SPEC.modes.gentle.vClose, 1e-9, 'gentle close speed');
});

console.log(`\n${count} tests passed`);
