// The auto tour's script and the scenario it runs, no three.js (the tests and the timeline check read it in node).
// SCRIPT is the operator's moves: views, isolates, toggles, the walk buttons, the detection slider and the mode. The
// walkers, the slider and the mode become the simulation's scenario; everything else only moves the camera and the
// console. beatsOf() lists the moments timeline.json carries, some read off the simulated run (the door opening,
// the reversal), so the timeline can never drift from the motion.
import {SPEC, ST} from './kin.js';

export const SCRIPT = [
  // 1 全景: one walker from the street at 1.2 m/s, detection 1.50 m. The door opens, they pass, 3 s later it closes.
  {t: 0, view: 'all'},
  {t: 0.4, walk: 'out', w: 1.2},
  // 2 無目の中: the engine while it closes, the belt and hangers while it opens for someone from the lobby
  {t: 6.3, view: 'header'},
  {t: 6.9, iso: 'engine'},
  {t: 9.9, iso: 'belt'},
  {t: 10.3, walk: 'in', w: 1.2},
  // 3 足元・センサー: the plan. That walker found 837 mm; the zone goes to 1.00 m and the next one finds 421 mm
  {t: 12.4, iso: 'belt'},
  {t: 12.4, view: 'floor'},
  {t: 13.0, iso: 'sensor'},
  {t: 14.6, slide: 'D', to: 1.0, dur: 0.7},
  {t: 19.3, walk: 'out', w: 1.2},
  // 4 戸先: someone stops short, then steps into the closing door → the beams → 0.2 s, it opens again
  {t: 22.6, iso: 'sensor'},
  {t: 22.6, view: 'edge'},
  {t: 23.1, walk: 'linger', w: 1.0},
  // 5 高齢者・子ども: 400 / 250 mm/s, the energy bar drops
  {t: 32.6, mode: 'gentle'},
  // 6 全景: people both ways
  {t: 38.6, view: 'all'},
  {t: 39.0, slide: 'D', to: 1.5, dur: 0.7},
  {t: 41.1, walk: 'out', w: 1.2, x: -0.18},
  {t: 41.9, walk: 'in', w: 1.0, x: 0.2},
  {t: 42.9, walk: 'diag', w: 1.3},
];
export const DURATION = 54.4;
export const DISPLAY0 = {cut: 1, labels: 1};

/** the scenario simulate() runs: walkers, the slider as a ramp of settings, the mode */
export function scenarioOf(script = SCRIPT, duration = DURATION) {
  const events = [];
  let D = SPEC.detD;
  for (const e of script) {
    if (e.walk) events.push({t: e.t, ped: {kind: e.walk, w: e.w ?? SPEC.walk, ...(e.x !== undefined ? {x: e.x} : {})}});
    if (e.mode) events.push({t: e.t, set: {mode: e.mode}});
    if (e.slide === 'D') {
      // the knob moves over dur seconds: the zone follows it in 50 ms steps
      const n = Math.max(1, Math.round(e.dur / 0.05));
      for (let k = 1; k <= n; k++) events.push({t: +(e.t + (k / n) * e.dur).toFixed(3), set: {D: +(D + ((e.to - D) * k) / n).toFixed(4)}});
      D = e.to;
    }
  }
  return {duration, D: SPEC.detD, mode: 'normal', events};
}

/** the moments the timeline carries: every scripted move, plus the door's own events read off the run */
export function beatsOf(R, script = SCRIPT) {
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
    if (e.walk) out[key(`walk_${e.walk}`)] = e.t;
    if (e.slide) out[key(`slide_${e.slide}`)] = e.t;
    if (e.mode) out[key(`mode_${e.mode}`)] = e.t;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (let i = 1; i < R.n; i++) {
    const a = R.state[i - 1];
    const b = R.state[i];
    if (a === b) continue;
    const t = r3(i * R.dt);
    if (b === ST.OPENING && a === ST.CLOSED) out[key('open')] = t;
    if (b === ST.CLOSING) out[key('close')] = t;
    if (b === ST.REV) out[key('reverse')] = t;
  }
  for (const e of R.events) if (e.type === 'arrive') out[key('arrive')] = r3(e.t);
  return Object.fromEntries(Object.entries(out).sort((x, y) => x[1] - y[1]));
}
