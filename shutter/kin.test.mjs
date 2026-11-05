// node shutter/kin.test.mjs — checks shutter-shared/kin.js against the hand-worked numbers in shutter/refs.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {beatsOf, commandsOf, DURATION, SCRIPT, tourPlan} from '../shutter-shared/script.js';
import {command, createPlan, frameState, hangKg, hOfPhi, holdTorque, loads, phiOfH, phiOpen, planOf, poseAt, rOfH, SPEC, strokeTime, torquePeak} from '../shutter-shared/kin.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log(`ok  ${name}`);
};
const S = SPEC;
/** the plan's first segment of a kind at or after t0 */
const firstSeg = (P, kind, t0 = 0) => P.segs.find((g) => g.kind === kind && g.t0 >= t0 - 1e-12);

test('curtain: 73.31 kg/m hanging, 16 kg bottom bar, 250.6 kg in all (slat 22.91 kg/m² × 3.2 m)', () => {
  near(S.Wc, 3.2, 1e-12, 'width');
  near(S.kgPerM, 73.31, 0.005, 'per metre');
  near(S.seatKg, 16, 1e-12, 'bottom bar');
  near(S.curtainKg, 250.6, 0.05, 'whole curtain');
  near(S.yShaft + S.s0, S.H + 0.7, 1e-12, 'slat length = H + 0.7');
});

test('drive: 48 × 50/15 = 160, shaft 9.0 rpm = 0.9425 rad/s, η = 0.76, rated 2.653 N·m', () => {
  near(S.ratio, 160, 1e-12, 'ratio');
  near(S.shaftRpm, 9.0, 1e-12, 'shaft rpm');
  near(S.omega, 0.9425, 5e-5, 'rad/s');
  near(S.eta, 0.76, 1e-12, 'efficiency');
  near(S.Trated, 2.653, 5e-4, 'rated torque');
});

test('coil radius 74.3 mm closed → 140.9 mm open (×1.90), 23.24 rad = 3.70 turns', () => {
  near(rOfH(0) * 1000, 74.3, 0.05, 'closed');
  near(rOfH(S.H) * 1000, 140.9, 0.05, 'open');
  near(rOfH(S.H) / rOfH(0), 1.9, 0.005, 'ratio');
  near(phiOpen(), 23.24, 0.005, 'rad');
  near(phiOpen() / (2 * Math.PI), 3.7, 0.005, 'turns');
  // the spiral inverts exactly
  for (const h of [0, 0.3, 1.1, 2.5]) near(hOfPhi(phiOfH(h)), h, 1e-12, `h ${h}`);
});

test('same 9 rpm, different speed: 4.20 m/min near closed, 7.97 m/min near open', () => {
  near(S.omega * rOfH(0), 0.07, 5e-5, 'closed m/s');
  near(S.omega * rOfH(0) * 60, 4.2, 0.005, 'closed m/min');
  near(S.omega * rOfH(S.H), 0.1328, 5e-5, 'open m/s');
  near(S.omega * rOfH(S.H) * 60, 7.97, 0.005, 'open m/min');
});

test('full stroke 24.95 s, average 6.01 m/min, inside JIS A 4705 表3 (1.6–6.5 m/min); the plan takes the same time', () => {
  const st = strokeTime();
  near(st.t, 24.95, 0.005, 'closed form');
  near(st.vAvg, 6.01, 0.005, 'average');
  assert.ok(st.vAvg >= S.vAvgMin && st.vAvg <= S.vAvgMax);
  const P = planOf([{t: 1, cmd: 'close'}, {t: 30, cmd: 'open'}]);
  const closed = P.segs.find((g) => g.kind === 'rest' && g.t0 > 1);
  near(closed.t0 - 1, st.t, 1e-9, 'closing in the plan');
  near(poseAt(P, closed.t0).h, 0, 1e-12, 'at the floor');
  const opened = P.segs.find((g) => g.kind === 'rest' && g.t0 > 30);
  near(opened.t0 - 30, st.t, 1e-9, 'opening in the plan');
  near(poseAt(P, opened.t0).h, S.H, 1e-12, 'at the top');
});

test('hanging weight 235.9 kg closed, 52.7 kg open; torque 172.0 / 72.8 N·m; peak 179.2 N·m at 17.2 % (0.430 m)', () => {
  near(hangKg(0), 235.9, 0.05, 'closed kg');
  near(hangKg(S.H), 52.7, 0.05, 'open kg');
  near(holdTorque(0), 172.0, 0.05, 'closed torque');
  near(holdTorque(S.H), 72.8, 0.05, 'open torque');
  const pk = torquePeak();
  near(pk.h, 0.43, 5e-4, 'peak h');
  near((100 * pk.h) / S.H, 17.2, 0.05, 'peak %');
  near(pk.T, 179.2, 0.05, 'peak torque');
  near(hangKg(pk.h), 204.4, 0.05, 'kg at the peak');
  near(rOfH(pk.h) * 1000, 89.4, 0.05, 'radius at the peak');
  // it is the maximum: a fine scan agrees
  let best = 0;
  for (let i = 0; i <= 5000; i++) best = Math.max(best, holdTorque((i / 5000) * S.H));
  near(best, pk.T, 1e-3, 'scan');
  assert.ok(holdTorque(0) < pk.T, 'the closed curtain is not the heaviest load');
});

test('motor shaft at the peak, constant speed: raising 1.474 N·m (55.6 %, 力行), lowering 0.851 N·m (32.1 %, 制動)', () => {
  const {h} = torquePeak();
  const up = loads(h, S.omega * rOfH(h), 0, S.omega);
  near(up.Ts, 179.2, 0.05, 'shaft torque');
  near(up.Tm, 1.474, 5e-4, 'raising');
  near(up.load * 100, 55.6, 0.05, 'raising %');
  assert.equal(up.regime, '力行');
  const dn = loads(h, -S.omega * rOfH(h), 0, -S.omega);
  near(dn.Tm, 0.851, 5e-4, 'lowering');
  near(dn.load * 100, 32.1, 0.05, 'lowering %');
  assert.equal(dn.regime, '制動');
  near(loads(0, S.omega * rOfH(0), 0, S.omega).Tm, 1.414, 5e-4, 'closed, raising');
  near(loads(0, S.omega * rOfH(0), 0, S.omega).load * 100, 53.3, 0.05, 'closed %');
  near(loads(S.H, S.omega * rOfH(S.H), 0, S.omega).Tm, 0.598, 5e-4, 'open, raising');
  near(loads(S.H, S.omega * rOfH(S.H), 0, S.omega).load * 100, 22.6, 0.05, 'open %');
  const still = loads(h, 0, 0, 0);
  assert.equal(still.regime, '保持');
  assert.equal(still.Tm, 0);
});

test('power at the peak: 168.9 W at the shaft, 222.2 W out of the motor shaft (÷ 0.76)', () => {
  const {h} = torquePeak();
  const up = loads(h, S.omega * rOfH(h), 0, S.omega);
  near(up.Ps, 168.9, 0.05, 'shaft');
  near(up.Ps / S.eta, 222.2, 0.05, 'motor shaft');
  near(up.Tm * S.omega * S.ratio, 222.2, 0.05, 'motor torque × motor speed');
});

test('kinetic energy at top speed: ½ × 250.6 × 0.1328² = 2.21 J ≤ 10 J', () => {
  const L = loads(S.H, S.omega * rOfH(S.H), 0, S.omega);
  near(L.ke, 2.21, 0.005, 'J');
  assert.ok(L.ke <= S.keMax);
});

test('obstacle 0.30 m: detect at 0.290 m at 0.0799 m/s, 9.97 mm after detection, 19.97 mm after touching (≤ 50 mm), 59.9 N', () => {
  const P = planOf([{t: 0.5, cmd: 'obsOn'}, {t: 1, cmd: 'close'}]);
  const e = P.events.find((x) => x.type === 'detect');
  assert.ok(e, 'detected');
  near(e.hDet, 0.29, 1e-12, 'detect height');
  near(e.v, 0.0799, 5e-5, 'speed');
  near(e.v * 60, 4.79, 0.005, 'm/min');
  near(e.after * 1000, 9.97, 0.01, 'after detection');
  near(e.dist * 1000, 19.97, 0.01, 'after touching');
  near(e.hStop, 0.28, 5e-4, 'stops at');
  assert.ok(e.dist <= S.stopMax, 'notice 2563: ≤ 5 cm');
  near(e.dist * 1000 * S.testSpring, 59.9, 0.05, 'force on the 3 N/mm test spring');
  assert.ok(e.dist * 1000 * S.testSpring <= S.pressMax && e.dist * 1000 * S.testSpring <= S.forceMax);
  // the plan: closing from fully open reaches the detection 20.94 s after the press, stops, climbs, stops
  near(e.t - 1, 20.94, 0.005, 'time to detection');
  near(poseAt(P, e.tStop).h, e.hStop, 1e-12, 'stopped where it said');
  assert.ok(Math.abs(poseAt(P, e.tStop).w) < 1e-9, 'standing still');
  const climbed = firstSeg(P, 'restObs');
  near(climbed.t0 - e.tStop, S.revT, 1e-9, 'climbs for 1.5 s');
  near(poseAt(P, climbed.t0).h, 0.377, 5e-4, 'climbs to 0.377 m');
  // the bottom edge never goes below the stop height (no passing through the box)
  for (let t = e.t; t < climbed.t0 + 2; t += 0.001) assert.ok(poseAt(P, t).h >= e.hStop - 1e-9);
});

test('JIS: after the obstacle stop, 閉 again runs down and stops again; with the box gone it closes', () => {
  const P = planOf([{t: 0.5, cmd: 'obsOn'}, {t: 1, cmd: 'close'}, {t: 26, cmd: 'close'}, {t: 33, cmd: 'obsOff'}, {t: 34, cmd: 'close'}]);
  const dets = P.events.filter((x) => x.type === 'detect');
  assert.equal(dets.length, 2, 'detected twice');
  const end = P.segs[P.segs.length - 1];
  assert.equal(end.kind, 'rest');
  near(poseAt(P, end.t0).h, 0, 1e-12, 'closed');
});

test('JIS: the other direction does nothing while moving; 止める stops in 0.3 s', () => {
  const P = createPlan();
  assert.equal(command(P, 1, 'close'), true);
  assert.equal(command(P, 5, 'open'), false, 'open while closing is ignored');
  const h5 = poseAt(P, 5).h;
  assert.equal(command(P, 6, 'stop'), true);
  const g = P.segs[P.segs.length - 1];
  assert.equal(g.kind, 'rest');
  near(g.t0 - 6, S.tRamp, 1e-9, 'ramp down');
  assert.ok(poseAt(P, 7).h < h5);
  assert.equal(command(P, 8, 'open'), true, 'open after stopping');
  assert.ok(poseAt(P, 10).h > poseAt(P, 8).h);
});

test('removing the box before contact cancels the stop: the curtain closes', () => {
  const P = planOf([{t: 0.5, cmd: 'obsOn'}, {t: 1, cmd: 'close'}, {t: 10, cmd: 'obsOff'}]);
  assert.equal(P.events.length, 0);
  const end = P.segs[P.segs.length - 1];
  near(poseAt(P, end.t0).h, 0, 1e-12, 'closed');
  near(end.t0 - 1, strokeTime().t, 1e-9, 'same stroke time');
});

test('deterministic: the same presses give the same plan and the same frames', () => {
  const cmds = [{t: 0.6, cmd: 'close'}, {t: 9, cmd: 'stop'}, {t: 10, cmd: 'obsOn'}, {t: 11, cmd: 'close'}, {t: 20, cmd: 'obsOff'}, {t: 21, cmd: 'close'}, {t: 30, cmd: 'set', arg: 1.2}];
  const a = planOf(cmds);
  const b = planOf(cmds);
  assert.deepEqual(a.segs, b.segs);
  assert.deepEqual(a.events, b.events);
  for (let t = 0; t < 32; t += 0.37) assert.deepEqual(frameState(a, t), frameState(b, t));
});

test('the tour: 30–40 s, the timeline matches the script and the plan, the obstacle beat happens', () => {
  assert.ok(DURATION >= 30 && DURATION <= 40, `duration ${DURATION}`);
  const P = tourPlan();
  const tl = JSON.parse(fs.readFileSync(new URL('../shutter-film/timeline.json', import.meta.url), 'utf8'));
  assert.equal(tl.duration, DURATION);
  assert.deepEqual(tl.beats, beatsOf(P));
  const e = P.events.find((x) => x.type === 'detect');
  assert.ok(e && e.t < SCRIPT.find((x) => x.cmd === 'obsOff').t, 'detected before the box goes');
  const end = frameState(P, DURATION - 0.01);
  assert.equal(end.stateName, '全閉');
  // the live page's takeover replays the same presses: any cut gives the same pose
  for (const t of [3, 15.5, 22, 30]) assert.deepEqual(poseAt(tourPlan(t), t), poseAt(P, t));
  assert.equal(commandsOf().length, 4);
});

console.log(`\n${count} tests passed`);
