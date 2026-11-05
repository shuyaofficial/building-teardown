// node elevator/kin.test.mjs — checks elevator-shared/kin.js against hand-worked numbers.
import assert from 'node:assert/strict';
import {doorAt, doorDur, ropeCar, ropeCwt, schedule, SPEC, state, tensions, trip} from '../elevator-shared/kin.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const sample = (tr, n = 4000) => Array.from({length: n + 1}, (_, i) => tr.at((i / n) * tr.dur));
let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log(`ok  ${name}`);
};

test('SPEC: travel 34.2 m, counterweight 1200 + 1000 × 0.45 = 1650 kg, 15 persons', () => {
  near(SPEC.travel, 34.2, 1e-12, 'travel');
  assert.equal(SPEC.cwtKg, SPEC.carKg + SPEC.ratedKg * SPEC.balance);
  assert.equal(Math.floor(SPEC.ratedKg / SPEC.personKg), SPEC.persons);
});

test('sheave rpm at 1.75 m/s = 1.75 / (π × 0.50) × 60 = 66.85', () => {
  const s = state({pos_m: 10, v: 1.75, a: 0});
  near(s.rpm, 66.85, 0.05, 'rpm');
});

test('1F→10F: reaches exactly 1.75 m/s, ends at 34.2 m with v = 0', () => {
  const tr = trip(1, 10);
  const pts = sample(tr);
  const vmax = Math.max(...pts.map((p) => p.v));
  near(vmax, 1.75, 1e-9, 'peak speed');
  assert.ok(Math.max(...pts.map((p) => Math.abs(p.a))) <= SPEC.aMax + 1e-9, 'a never exceeds aMax');
  // the integrated profile itself lands on the floor (not only the clamp at tau = dur)
  near(tr.end.pos_m, 34.2, 1e-9, 'integrated end position');
  near(tr.end.v, 0, 1e-9, 'integrated end speed');
  near(tr.end.a, 0, 1e-9, 'integrated end acceleration');
  const last = tr.at(tr.dur);
  assert.equal(last.pos_m, 34.2);
  assert.equal(last.v, 0);
  // dur = L/v + v/a + a/j = 19.543 + 1.944 + 0.75
  near(tr.dur, 34.2 / 1.75 + 1.75 / 0.9 + 0.9 / 1.2, 1e-9, 'trip time');
  // continuity: no jump in position or speed anywhere
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i].pos_m - pts[i - 1].pos_m) < 0.02, 'position continuous');
    assert.ok(Math.abs(pts[i].v - pts[i - 1].v) < 0.01, 'speed continuous');
  }
});

test('1-floor trip (3.8 m): peak below 1.75, ends at 3.8 m with v = 0', () => {
  const tr = trip(1, 2);
  const vmax = Math.max(...sample(tr).map((p) => p.v));
  assert.ok(vmax < 1.75, `peak ${vmax}`);
  // solving 3.8 = v²/0.9 + v·0.75 by hand: v = (−0.675 + √(0.675² + 4·0.9·3.8)) / 2 = 1.5424
  near(vmax, 1.5424, 1e-3, 'short-trip peak');
  near(tr.end.pos_m, 3.8, 1e-9, 'integrated end position');
  near(tr.end.v, 0, 1e-9, 'integrated end speed');
  assert.equal(tr.at(tr.dur).pos_m, 3.8);
  // accelerating to 1.75 alone takes 1.75 × (1.75/0.9 + 0.75) / 2 = 2.358 m: twice that is more than one floor
  near((1.75 * (1.75 / 0.9 + 0.75)) / 2, 2.358, 1e-3, 'refs.md: 約2.36 m to reach rated speed');
});

test('downward trip mirrors: 10F→5F ends at 15.2 m, speed negative', () => {
  const tr = trip(10, 5);
  near(tr.end.pos_m, 15.2, 1e-9, 'end');
  assert.ok(Math.min(...sample(tr).map((p) => p.v)) < -1.74);
});

test('very short run never reaches aMax (closed form still lands)', () => {
  // not a floor trip, but the profile must stay valid: L = 0.5 m
  const SP = {...SPEC, floorH: 0.5};
  const tr = trip(1, 2, SP);
  assert.ok(tr.aPeak < SPEC.aMax);
  near(tr.end.pos_m, 0.5, 1e-9, 'end');
});

test('450 kg load (45 %), constant speed, rope weight excluded: torque ≈ 0', () => {
  for (const pos of [0, 17.1, 34.2]) {
    const T = tensions({pos, a: 0, loadKg: 450, ropes: false});
    near(((T.tCar - T.tCwt) * SPEC.sheaveD) / 2, 0, 1e-9, `torque at ${pos} m`);
  }
});

test('hand check: empty car at 1F, standing, rope weight counted', () => {
  // car side rope 39.75 − (0 + 3.1) = 36.65 m; cwt side 39.35 − 37.3 = 2.05 m; 5 ropes × 0.35 kg/m = 1.75 kg/m
  near(ropeCar(0), 36.65, 1e-9, 'car rope');
  near(ropeCwt(0), 2.05, 1e-9, 'cwt rope');
  // car side 1200 + 1.75 × 36.65 = 1264.1375 kg → 12.39695 kN; cwt side 1650 + 1.75 × 2.05 = 1653.5875 kg → 16.21615 kN
  const s = state({pos_m: 0, v: 0, a: 0}, {persons: 0});
  near(s.tCar, 12.39695, 1e-4, 'car tension kN');
  near(s.tCwt, 16.21615, 1e-4, 'cwt tension kN');
  // torque (12.39695 − 16.21615) × 0.25 = −0.95480 kN·m: the counterweight side is heavier, the brake holds
  near(s.torque, -0.9548, 1e-4, 'torque kN·m');
  assert.equal(s.mode, '停止');
  // refs.md's quick check puts the rope on the cwt side; by kin.js's geometry it hangs on the car side at 1F
});

test('hand check: 15 persons accelerating up at 0.9 m/s² from 1F → 力行', () => {
  // car (1200 + 975 + 64.1375) × (9.80665 + 0.9) = 23.97366 kN; cwt 1653.5875 × (9.80665 − 0.9) = 14.72793 kN
  // torque (23.97366 − 14.72793) × 0.25 = 2.31143 kN·m
  const s = state({pos_m: 0, v: 0.5, a: 0.9}, {persons: 15});
  near(s.tCar, 23.97366, 1e-4, 'car tension');
  near(s.tCwt, 14.72793, 1e-4, 'cwt tension');
  near(s.torque, 2.31143, 1e-4, 'torque');
  assert.equal(s.mode, '力行');
});

test('力行 / 回生: full car down regenerates, light car up regenerates, full car up motors', () => {
  assert.equal(state({pos_m: 17, v: -1.75, a: 0}, {persons: 15}).mode, '回生');
  assert.equal(state({pos_m: 17, v: 1.75, a: 0}, {persons: 0}).mode, '回生');
  assert.equal(state({pos_m: 17, v: 1.75, a: 0}, {persons: 15}).mode, '力行');
  assert.equal(state({pos_m: 17, v: -1.75, a: 0}, {persons: 3}).mode, '力行');
});

test('1:1 roping: counterweight moves opposite, rope total constant, sheave angle = travel / R', () => {
  const a = state({pos_m: 5});
  const b = state({pos_m: 12});
  near(b.cwtY - a.cwtY, -7, 1e-9, 'cwt moves opposite');
  near(a.ropeCar + a.ropeCwt, b.ropeCar + b.ropeCwt, 1e-9, 'rope total');
  near(b.sheaveAngle - a.sheaveAngle, 7 / 0.25, 1e-9, 'sheave angle');
});

test('door: open 2.0 s, hold, close 3.0 s', () => {
  assert.equal(doorAt(0).open, 0);
  near(doorAt(1.0).open, 0.5, 1e-9, 'half open at 1 s');
  assert.equal(doorAt(2.0).open, 1);
  assert.equal(doorAt(2.0 + SPEC.doorHold - 0.01).open, 1);
  near(doorAt(2.0 + SPEC.doorHold + 1.5).open, 0.5, 1e-9, 'half closed 1.5 s into closing');
  assert.equal(doorAt(doorDur()).open, 0);
  assert.equal(doorDur(), 2.0 + SPEC.doorHold + 3.0);
});

test('schedule: trips and door cycles in sequence, persons change during the hold', () => {
  const S = schedule([
    {kind: 'trip', t0: 1, from: 1, to: 3, persons: 15},
    {kind: 'door', t0: 10, floor: 3, hold: 2, persons: [15, 3]},
  ], {floor: 1, persons: 15});
  assert.equal(S.motionAt(0).m.pos_m, 0);
  assert.equal(S.motionAt(9.9).m.pos_m, 7.6);
  assert.equal(S.motionAt(11).persons, 15);
  assert.equal(S.motionAt(13.9).persons, 3);
  assert.equal(S.motionAt(13.9).door, 0.0 + doorAt(3.9, 2).open);
  assert.throws(() => schedule([{kind: 'trip', t0: 0, from: 1, to: 10, persons: 0}, {kind: 'trip', t0: 5, from: 10, to: 1, persons: 0}]));
});

console.log(`\n${count} tests passed`);
