// The auto tour's script, no three.js (the tests and the timeline check read it in node). SCRIPT is the operator's
// moves: views, isolates and the button presses (開ける・止める・閉める, the obstacle). The presses become the plan's
// commands; everything else only moves the camera and the console. beatsOf() lists the moments timeline.json
// carries, some read off the plan (the detection, the stop, fully closed), so the timeline never drifts from the motion.
import {planOf, SPEC} from './kin.js';

export const SCRIPT = [
  // 1 全景: the shop is open; the 閉 button. The curtain comes down fast at first (the coil is fat), slower later
  {t: 0, view: 'all'},
  {t: 1.5, cmd: 'close'},
  // 2 巻取り: the case opened; the coil thins as it unwinds, the torque climbs; then the drive (chain, brake)
  {t: 5.5, view: 'drum'},
  {t: 6.5, iso: 'coil'},
  {t: 11.1, iso: 'drive'},
  // 3 座板: a 0.30 m box under the curtain → the bottom edge touches, the switch, stop within 20 mm, climb back
  {t: 14.9, iso: 'drive'},
  {t: 14.9, view: 'seat'},
  {t: 15.9, cmd: 'obsOn'},
  {t: 25.9, cmd: 'obsOff'},
  {t: 27.1, cmd: 'close'},
  // 4 全景: closed. The brake holds 236 kg.
  {t: 32.7, view: 'all'},
];
export const DURATION = 36.4;
export const DISPLAY0 = {cut: 1, labels: 1};

/** the button presses as plan commands */
export const commandsOf = (script = SCRIPT) => script.filter((e) => e.cmd).map((e) => ({t: e.t, cmd: e.cmd, arg: e.arg}));
/** the tour's plan, optionally only the presses up to time `upTo` (the live page takes over from there) */
export const tourPlan = (upTo = Infinity, spec = SPEC) => planOf(commandsOf().filter((c) => c.t <= upTo + 1e-9), spec);

/** the moments the timeline carries: every scripted move, plus the curtain's own events read off the plan */
export function beatsOf(P, script = SCRIPT) {
  const out = {};
  const n = {};
  const key = (k) => {
    n[k] = (n[k] || 0) + 1;
    return n[k] > 1 ? `${k}${n[k]}` : k;
  };
  for (const e of script) {
    if (e.t <= 0) continue;
    if (e.view) out[key(`view_${e.view}`)] = e.t;
    if (e.iso) out[key(`iso_${e.iso}`)] = e.t;
    if (e.cmd) out[key(`press_${e.cmd}`)] = e.t;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (const e of P.events) if (e.type === 'detect') {
    out[key('detect')] = r3(e.t);
    out[key('stopped')] = r3(e.tStop);
  }
  for (let i = 1; i < P.segs.length; i++) {
    const g = P.segs[i];
    if (g.kind === 'rest' && g.p0 <= 1e-9 && P.segs[i - 1].kind === 'down') out[key('closed')] = r3(g.t0);
    if (g.kind === 'restObs') out[key('climbed')] = r3(g.t0);
  }
  return Object.fromEntries(Object.entries(out).sort((x, y) => x[1] - y[1]));
}
