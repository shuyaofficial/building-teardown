// node parking/kin.test.mjs — checks parking-shared/kin.js against the hand-worked numbers in parking/refs.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {beatsOf, commandsOf, DURATION, INIT, SCRIPT, tourRun} from '../parking-shared/script.js';
import {drive, forces, histAt, moveSegments, plan, pressureOf, segAt, SPEC, stateAt, stopSegment, strokeTime} from '../parking-shared/kin.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log(`ok  ${name}`);
};
const g = SPEC.g;
const kg = (k) => SPEC.cars[k].kg;

test('plunger area π/4 × 63² = 31.17 cm²; pump 19 cm³ × 1450 rpm = 27.55 L/min', () => {
  near(SPEC.area * 1e4, 31.17, 0.005, 'area cm²');
  near(SPEC.flow * 60000, 27.55, 1e-9, 'flow L/min');
  near(SPEC.flow, 4.5917e-4, 1e-8, 'flow m³/s');
});

test('pallet speed v = Q / A = 147.3 mm/s (plunger 73.6 mm/s), under the 150 mm/s limit', () => {
  near(SPEC.vRated * 1000, 147.3, 0.05, 'pallet');
  near((SPEC.vRated / SPEC.ratio) * 1000, 73.6, 0.05, 'plunger');
  assert.ok(SPEC.vRated <= SPEC.vLimit, 'limit');
  near(SPEC.vRated * 60, 8.84, 0.005, 'm/min');
});

test('one stroke of 1.75 m: 0.982 s (0.072 m) + 10.899 s + 0.982 s = 12.863 s', () => {
  const segs = moveSegments(0, SPEC.stroke);
  assert.equal(segs.length, 3);
  near(segs[0].dur, 0.982, 5e-4, 'accelerate');
  near(segAt(segs, segs[0].dur).h, 0.072, 5e-4, 'accelerate distance');
  near(segs[1].dur, 10.899, 5e-4, 'cruise');
  near(segs[2].dur, 0.982, 5e-4, 'brake');
  near(strokeTime(), 12.863, 5e-4, 'total');
  near(segAt(segs, 99).h, SPEC.stroke, 1e-12, 'lands exactly');
});

test('oil pressure p = (Wsd + car) g / A: 2.831 / 5.663 / 8.179 / 9.123 / 10.067 MPa', () => {
  near(pressureOf(0) / 1e6, 2.831, 5e-4, 'empty');
  near(pressureOf(kg('kei')) / 1e6, 5.663, 5e-4, '軽');
  near(pressureOf(kg('small')) / 1e6, 8.179, 5e-4, '小型');
  near(pressureOf(kg('mid')) / 1e6, 9.123, 5e-4, '中型');
  near(pressureOf(kg('large')) / 1e6, 10.067, 5e-4, '大型');
  near(forces(SPEC.frameKg + kg('large'), SPEC.acc).p / 1e6, 10.221, 5e-4, 'accelerating 大型');
});

test('Pascal: each plunger pushes F = p × A = (Wsd + car) g = 31.38 kN for 大型, twice its share of the load', () => {
  const M = SPEC.frameKg + kg('large');
  const f = forces(M);
  near(f.F / 1000, 31.38, 0.005, 'plunger force');
  near(f.p * SPEC.area, f.F, 1e-6, 'p × A');
  near(SPEC.cylinders * f.F, SPEC.ratio * M * g, 1e-6, 'two plungers push twice the load');
});

test('relief valve: 1.5 × 10.067 MPa = 15.10 MPa', () => {
  near(SPEC.pRated / 1e6, 10.067, 5e-4, 'rated pressure');
  near(SPEC.pRelief / 1e6, 15.1, 5e-3, 'relief');
});

test('power at constant speed up: oil 4.622 kW (= M g v), motor shaft ÷ 0.85 = 5.438 kW = 98.9 % of 5.5 kW; 中型 4.928, 軽 3.059 kW', () => {
  const v = SPEC.vRated;
  const big = drive(pressureOf(kg('large')), v);
  near(big.pHyd / 1000, 4.622, 5e-4, 'oil power 大型');
  near(big.pHyd, (SPEC.frameKg + kg('large')) * g * v, 1e-6, '= M g v');
  near(big.shaft / 1000, 5.438, 5e-4, 'shaft 大型');
  near((big.shaft / (SPEC.motorKW * 1000)) * 100, 98.9, 0.05, 'load 大型');
  near(drive(pressureOf(kg('mid')), v).shaft / 1000, 4.928, 5e-4, 'shaft 中型');
  near(drive(pressureOf(kg('kei')), v).shaft / 1000, 3.059, 5e-4, 'shaft 軽');
  near(big.Lmin, 27.55, 1e-6, 'flow');
  near(big.rpm, SPEC.motorRpm, 1e-6, 'motor at rated speed');
});

test('going down: the motor stands (0 kW), the valve turns p × Q into heat: 2.600 kW for 軽', () => {
  const d = drive(pressureOf(kg('kei')), -SPEC.vRated);
  assert.equal(d.shaft, 0);
  assert.equal(d.rpm, 0);
  assert.equal(d.regime, '自重');
  near(d.heat / 1000, 2.6, 5e-4, 'heat');
});

test('chain: a quarter of the weight each, 7.845 kN for 大型 = 7.23 × under 56.7 kN (≥ 7); 中型 7.110 kN, 7.97 ×', () => {
  const T = forces(SPEC.frameKg + kg('large')).T;
  near(T / 1000, 7.845, 5e-4, '大型');
  near(SPEC.chainBreak / T, 7.23, 0.005, 'factor 大型');
  assert.ok(SPEC.chainBreak / T >= SPEC.chainFactor);
  const Tm = forces(SPEC.frameKg + kg('mid')).T;
  near(Tm / 1000, 7.11, 5e-4, '中型');
  near(SPEC.chainBreak / Tm, 7.97, 0.005, 'factor 中型');
});

test('latch design load β (Wsd + car) g = 62.76 kN; the latch gap 30 mm ≤ 50 mm', () => {
  near((SPEC.latchBeta * (SPEC.frameKg + SPEC.carMaxKg) * g) / 1000, 62.76, 0.005, 'design');
  assert.ok(SPEC.latchGap <= SPEC.latchMax);
});

test('stop button: 147.3 mm/s → 0 in 0.295 s over 21.7 mm', () => {
  const [s] = stopSegment(1, SPEC.vRated, 0);
  near(s.dur, 0.295, 5e-4, 'time');
  near((segAt([s], 9, 1).h - 1) * 1000, 21.7, 0.05, 'distance');
});

test('parking room 1.75 − 0.12 = 1.63 m ≥ 1.6 m; the 大型 car fits between the end beams', () => {
  near(SPEC.roomH, 1.63, 1e-9, 'room');
  assert.ok(SPEC.roomH >= SPEC.roomMin);
  for (const k of Object.keys(SPEC.cars)) assert.ok(SPEC.carRearZ + SPEC.cars[k].L < SPEC.beamZ, k);
  assert.ok(SPEC.carRearZ > -SPEC.beamZ);
});

test('the speed is the flow, not the weight: 軽 and 大型 take the same time and never pass 150 mm/s', () => {
  for (const car of ['kei', 'large']) {
    const r = plan([{t: 0, cmd: 'up'}], {car});
    const ph = r.phases.find((p) => p.kind === 'up');
    near(ph.t1 - ph.t0, 12.863, 5e-4, car);
    let vmax = 0;
    for (let t = 0; t < 14; t += 0.01) vmax = Math.max(vmax, Math.abs(stateAt(r, t).v));
    assert.ok(vmax <= SPEC.vLimit + 1e-12, `${car} ${vmax}`);
  }
});

test('up from the pit: the gate shuts first (3.83 s), then the lift, then the latches (0.5 s), then the gate opens', () => {
  const r = plan([{t: 1, cmd: 'up'}], {gate: 1});
  const kinds = r.phases.map((p) => p.kind);
  assert.deepEqual(kinds, ['gateClose', 'up', 'latch', 'gateOpen']);
  near(r.phases[0].t1 - r.phases[0].t0, 3.833, 5e-4, 'gate');
  assert.equal(stateAt(r, r.phases[1].t0 + 0.5).gate, 0, 'gate shut while moving');
  const top = stateAt(r, 30);
  assert.ok(top.atTop && top.latched && top.gate === 1);
  assert.equal(top.p, 0, 'the latches carry it: no oil pressure');
  // while the latches go in, the oil still holds it
  near(stateAt(r, r.phases[2].t0 + 0.2).pMPa, 9.123, 5e-4, 'holding before the latch');
});

test('down from the top: the latches come out (0.5 s) before it moves; at the bottom the gate stays shut', () => {
  const r = plan([{t: 0, cmd: 'down'}], {h: SPEC.stroke, latch: 1, gate: 1, car: 'kei'});
  assert.deepEqual(r.phases.map((p) => p.kind), ['gateClose', 'unlatch', 'down']);
  near(stateAt(r, r.phases[1].t0 + 0.1).pMPa, 5.663, 5e-4, 'the oil takes the load back');
  const end = stateAt(r, 30);
  assert.ok(end.atBottom && end.gate === 0 && end.p === 0);
});

test('interlocks: a person in the boarding zone or a car past the beams → the lift does not start', () => {
  const top = {h: SPEC.stroke, latch: 1, gate: 1, car: 'mid'};
  const a = plan([{t: 0, person: 'in'}, {t: 3, cmd: 'down'}], top);
  assert.equal(a.log.find((e) => e.type === 'refuse').reason, 'person');
  assert.equal(stateAt(a, 6).h, SPEC.stroke);
  const b = plan([{t: 0, shift: 1}, {t: 1, cmd: 'down'}], top);
  assert.equal(b.log.find((e) => e.type === 'refuse').reason, 'overhang');
  assert.ok(stateAt(b, 1).overhang);
  // back in place → it goes
  const c = plan([{t: 0, shift: 1}, {t: 1, shift: 0}, {t: 2, cmd: 'down'}], top);
  assert.ok(c.log.some((e) => e.type === 'start'));
  // with the gate shut, a person waits outside it and is not in the zone
  const d = plan([{t: 0, person: 'in'}, {t: 5, cmd: 'up'}], {gate: 0});
  assert.ok(!stateAt(d, 4.9).person);
  assert.ok(d.log.some((e) => e.type === 'start'));
});

test('stop mid-way: it brakes at 0.5 m/s², the check valve holds it (pressure stays), the gate stays shut', () => {
  const r = plan([{t: 0, cmd: 'up'}, {t: 5, cmd: 'stop'}], {car: 'mid'});
  const s = stateAt(r, 8);
  assert.equal(s.v, 0);
  assert.ok(s.h > 0.5 && s.h < 1);
  near(s.pMPa, 9.123, 5e-4, 'held');
  assert.equal(s.gate, 0);
  assert.ok(!r.phases.some((p) => p.kind === 'latch'));
  // it resumes
  const r2 = plan([{t: 0, cmd: 'up'}, {t: 5, cmd: 'stop'}, {t: 7, cmd: 'up'}], {car: 'mid'});
  assert.ok(stateAt(r2, 30).latched);
});

test('deterministic: the same commands give the same run', () => {
  const cmds = commandsOf();
  const a = plan(cmds, INIT);
  const b = plan(cmds, INIT);
  assert.deepEqual(a.segs, b.segs);
  assert.deepEqual(a.gate, b.gate);
  assert.deepEqual(a.log, b.log);
  for (let t = 0; t < DURATION; t += 0.37) assert.deepEqual(stateAt(a, t), stateAt(b, t));
  assert.deepEqual(histAt(a, 30), histAt(b, 30));
});

test('the tour: 30–40 s, the timeline matches the script and the run, the beats the brief asks for happen', () => {
  assert.ok(DURATION >= 30 && DURATION <= 40, `duration ${DURATION}`);
  const r = tourRun();
  const tl = JSON.parse(fs.readFileSync(new URL('../parking-film/timeline.json', import.meta.url), 'utf8'));
  assert.equal(tl.duration, DURATION);
  assert.deepEqual(tl.beats, beatsOf(r));
  // up with the 中型 car at 9.12 MPa, the refusal for the person, down with 軽 at 5.66 MPa and the motor off
  near(stateAt(r, 6).pMPa, 9.123, 5e-4, 'up');
  assert.equal(r.log.find((e) => e.type === 'refuse').reason, 'person');
  const down = r.phases.find((p) => p.kind === 'down');
  const mid = stateAt(r, (down.t0 + down.t1) / 2);
  near(mid.pMPa, 5.663, 5e-4, 'down');
  assert.equal(mid.shaft, 0);
  assert.ok(down.t1 < DURATION - 0.3, 'it lands before the end');
  const end = stateAt(r, DURATION);
  assert.ok(end.atBottom && end.gate === 0, 'ends where it began');
  assert.ok(SCRIPT.filter((e) => e.view).length <= 4);
});

console.log(`\n${count} tests passed`);
