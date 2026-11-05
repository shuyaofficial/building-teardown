// Headless check of a built live page: no console errors, the auto tour runs, and a click on a button takes over and
// changes the machine. Uses the teardown skill's playwright and the system Chrome (Metal WebGL).
//   node tools/live-check.mjs [teardown-out/dist/elevator-live.html] [--floor 3] [--shot teardown-out/live-check.png]
//     elevator (no --click): clicks the floor button and checks the car moves > 1 m toward it.
//   node tools/live-check.mjs teardown-out/dist/autodoor-live.html --click "外から歩く" --watch gap [--within 2] [--expect up|change]
//     any page: clicks the .bt whose text is exactly --click, then reads window.LIVE.s[--watch] every 0.25 s and checks
//     that it rose (--expect up, the default) or changed within --within seconds.
// Both: the click must hand the tour over, and 25 s of quiet must hand it back. Run from a normal shell with GPU access
// (the system Chrome needs the GPU).
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SKILL = process.env.SKILL_DIR || path.join(os.homedir(), '.claude/skills/teardown');
const {chromium} = createRequire(path.join(SKILL, 'node_modules/x.js'))('playwright');
const CHROME = process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const file = path.resolve(args.find((a) => a.endsWith('.html')) || 'teardown-out/dist/elevator-live.html');
const floor = Number(opt('floor', 3));
const click = opt('click', null);
const watch = opt('watch', null);
const within = Number(opt('within', 2));
const expect = opt('expect', 'up');
const shot = path.resolve(opt('shot', 'teardown-out/live-check.png'));
if (click && !watch) {
  console.error('--click needs --watch <key of window.LIVE.s>');
  process.exit(2);
}

const browser = await chromium.launch({executablePath: CHROME, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl']});
const page = await browser.newPage({viewport: {width: 1600, height: 900}});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => window.LIVE && window.LIVE.s, null, {timeout: 30000});
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!click) {
  // ------------------------------------------------------------ the elevator's original check
  const read = () => page.evaluate(() => ({T: window.LIVE.T, tour: window.LIVE.tour, pos: window.LIVE.s.pos, v: window.LIVE.s.v, floor: window.LIVE.s.floor, queue: window.LIVE.queue}));
  const before = await read();
  await page.locator('.bt', {hasText: new RegExp(`^${floor}$`)}).click();
  const clicked = await read();
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    samples.push(await read());
  }
  await page.screenshot({path: shot});
  const after = samples[samples.length - 1];
  // 25 s of quiet hands the page back to the tour
  await page.waitForFunction(() => window.LIVE.tour, null, {timeout: 40000}).catch(() => {});
  const idle = await read();
  const moved = Math.max(...samples.map((s) => Math.abs(s.pos - clicked.pos)));
  console.log(JSON.stringify({before, clicked, after, idle, maxMoveM: +moved.toFixed(3), errors}, null, 1));
  await browser.close();
  const ok = errors.length === 0 && idle.tour && !clicked.tour && moved > 1 && (clicked.queue.includes(floor) || after.floor === floor || samples.some((s) => s.queue.includes(floor)));
  console.log(ok ? `PASS: ${floor}F clicked, tour handed over, car moved ${moved.toFixed(2)} m, 0 console errors, tour back after ${(idle.T - clicked.T).toFixed(1)} s idle → ${shot}` : 'FAIL');
  process.exit(ok ? 0 : 1);
}

// ------------------------------------------------------------ the generic check: click a button, watch a value
const read = () => page.evaluate((k) => ({T: window.LIVE.T, tour: window.LIVE.tour, value: window.LIVE.s[k]}), watch);
// the tour must be running on its own before the click
await page.waitForTimeout(500);
const before = await read();
await page.locator('.bt', {hasText: new RegExp(`^${escape(click)}$`)}).click();
const clicked = await read();
const samples = [];
const n = Math.max(1, Math.round(within / 0.25));
for (let i = 0; i < n; i++) {
  await page.waitForTimeout(250);
  samples.push(await read());
}
await page.screenshot({path: shot});
await page.waitForFunction(() => window.LIVE.tour, null, {timeout: 40000}).catch(() => {});
const idle = await read();
const delta = Math.max(...samples.map((s) => s.value - clicked.value));
const changed = Math.max(...samples.map((s) => Math.abs(s.value - clicked.value)));
const firstT = samples.find((s) => (expect === 'up' ? s.value - clicked.value : Math.abs(s.value - clicked.value)) > 1e-6);
console.log(JSON.stringify({before, clicked, samples: samples.map((s) => ({dt: +(s.T - clicked.T).toFixed(2), tour: s.tour, value: +Number(s.value).toFixed(4)})), idle, errors}, null, 1));
await browser.close();
const moved = expect === 'up' ? delta > 1e-6 : changed > 1e-6;
const ok = errors.length === 0 && before.tour && !clicked.tour && samples.every((s) => !s.tour) && moved && idle.tour;
console.log(
  ok
    ? `PASS: 「${click}」 clicked, tour handed over, ${watch} ${expect === 'up' ? 'rose' : 'changed'} by ${(expect === 'up' ? delta : changed).toFixed(4)} within ${within} s (first after ${(firstT.T - clicked.T).toFixed(2)} s), 0 console errors, tour back after ${(idle.T - clicked.T).toFixed(1)} s idle → ${shot}`
    : `FAIL: errors ${errors.length}, tour before ${before.tour}, handed over ${!clicked.tour}, ${watch} ${expect} ${moved}, tour back ${idle.tour}`,
);
process.exit(ok ? 0 : 1);
