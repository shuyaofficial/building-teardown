// The auto tour's script and the commands it sends, no three.js (the tests and the timeline check read it in node).
// SCRIPT is the operator's moves: views, isolates, the weight buttons, the up / down buttons and the person. The
// buttons become plan()'s commands; everything else only moves the camera and the console. beatsOf() lists the moments
// timeline.json carries, some read off the planned run (the lift starting and landing, the refusal), so the timeline
// can never drift from the motion.
import {plan, strokeTime} from './kin.js';

export const SCRIPT = [
  // 1 全景: the 中型 car waits in the pit; raise it. The gate is already shut, nobody is inside.
  {t: 0, view: 'all'},
  {t: 0.2, car: 'mid'},
  {t: 0.6, cmd: 'up'},
  // 2 油圧: the pump pushes oil into two plungers; the pressure reads the weight (Pascal), the flow sets the speed
  {t: 3.0, view: 'hyd'},
  {t: 3.4, iso: 'hyd'},
  // the chain over the plunger's head doubles the stroke and halves the speed... and doubles the force
  {t: 8.4, iso: 'chain'},
  // 3 安全: it lands, the latches go in, the gate opens; a lighter car, someone steps in, 下げる is refused
  {t: 12.0, iso: 'chain'},
  {t: 12.0, view: 'safe'},
  {t: 17.9, car: 'kei'},
  {t: 18.1, person: 'in'},
  {t: 19.8, cmd: 'down'},
  {t: 20.3, person: 'out'},
  {t: 21.8, cmd: 'down'},
  // 4 全景: the gate shuts, the latches come out, it sinks on its own weight: the motor stands
  {t: 25.0, view: 'all'},
];
export const DURATION = 39.6;
export const INIT = {h: 0, gate: 0, latch: 0, car: 'kei', shift: 0};
export const DISPLAY0 = {cut: 1, labels: 1};

/** the commands plan() runs */
export function commandsOf(script = SCRIPT) {
  const out = [];
  for (const e of script) {
    if (e.cmd) out.push({t: e.t, cmd: e.cmd});
    if (e.car) out.push({t: e.t, car: e.car});
    if (e.person) out.push({t: e.t, person: e.person});
    if (e.shift !== undefined) out.push({t: e.t, shift: e.shift});
  }
  return out;
}
export const tourRun = () => plan(commandsOf(), INIT);

/** the moments the timeline carries: every scripted move, plus the lift's own events read off the run */
export function beatsOf(run, script = SCRIPT) {
  const out = {};
  const n = {};
  const key = (k) => {
    n[k] = (n[k] || 0) + 1;
    return n[k] > 1 ? `${k}${n[k]}` : k;
  };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (const e of script) {
    if (e.t <= 0) continue;
    if (e.view) out[key(`view_${e.view}`)] = e.t;
    if (e.iso) out[key(`iso_${e.iso}`)] = e.t;
    if (e.car) out[key(`car_${e.car}`)] = e.t;
    if (e.person) out[key(`person_${e.person}`)] = e.t;
  }
  for (const e of run.log) {
    if (e.type === 'start') out[key(`start_${e.cmd}`)] = r3(e.t);
    if (e.type === 'refuse') out[key(`refuse_${e.reason}`)] = r3(e.t);
  }
  for (const p of run.phases) {
    if (p.kind === 'up' || p.kind === 'down') out[key(`land_${p.kind}`)] = r3(p.t1);
    if (p.kind === 'latch') out[key('latch')] = r3(p.t1);
    if (p.kind === 'gateOpen') out[key('gate_open')] = r3(p.t1);
    if (p.kind === 'gateClose') out[key('gate_shut')] = r3(p.t1);
  }
  return Object.fromEntries(Object.entries(out).sort((x, y) => x[1] - y[1]));
}
export {strokeTime};
