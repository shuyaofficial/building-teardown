// The elevator console, laid out at 1600 x 900, all in Japanese: the title block; on the left the run state (floor
// indicator, direction, door, a live hoistway schematic), the destination buttons and the passenger load; on the right
// the instruments (speed, acceleration, sheave rpm, motor torque with 力行/回生, rope tensions, door opening), the
// views, the isolate buttons and the display toggles; along the bottom the speed curve of the current trip and a
// one-line explanation. update(s) redraws every live part from the frame's state; nothing here keeps time.
import {C, createChrome, MONO, SANS} from '../building-kit/ui.js';
import {SPEC} from './kin.js';

export const VIEWS = ['all', 'follow', 'machine', 'door', 'cwt'];
export const VIEW_LABEL = {all: '全景', follow: '追従', machine: '機械室', door: 'ドア', cwt: 'おもり・ピット'};
export const ISOS = ['machine', 'cwt', 'door'];
export const ISO_LABEL = {machine: '巻上機', cwt: 'つり合いおもり', door: 'ドア装置'};
export const DISPLAY = ['cut', 'labels'];
export const DISPLAY_LABEL = {cut: 'カットアウェイ', labels: 'ラベル'};
const fx = (n, d) => (Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n).toFixed(d);

export function createConsole(app) {
  const ui = createChrome(app);
  const {add, panel, onBtn} = ui;
  const btn = {};

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:150px;height:92px;background:${C.accent}"></div>`);
  add(`<svg style="position:absolute;left:46px;top:18px" width="58" height="58" viewBox="0 0 58 58"><rect x="9" y="3" width="40" height="52" rx="3" fill="none" stroke="#fff" stroke-width="3"/><path d="M29 6v46" stroke="#fff" stroke-width="2"/><path d="M19 22l6-8 6 8z M33 36l6 8 6-8z" fill="#fff" transform="translate(-5 0)"/></svg>`);
  add(`<div class="sm" style="position:absolute;left:172px;top:16px;letter-spacing:.12em">ビル設備のしくみ　01</div>`);
  add(`<div style="position:absolute;left:170px;top:34px;font:700 34px ${SANS};letter-spacing:.02em;line-height:1">ロープ式エレベーター <span style="color:${C.accent};font-weight:400">/</span></div>`);
  add(`<div style="position:absolute;left:172px;top:76px;font:500 14px ${SANS};color:${C.sub};letter-spacing:.04em">事務所ビル10階・機械室あり・ギヤレス巻上機・1:1ローピング</div>`);
  [['定員', `${SPEC.persons}人 / ${SPEC.ratedKg} kg`], ['定格速度', `${Math.round(SPEC.vMax * 60)} m/分`], ['昇降行程', `${SPEC.travel.toFixed(1)} m`]].forEach(([k, v], i) => {
    const x = 1060 + i * 172;
    if (i) add(`<div style="position:absolute;left:${x - 14}px;top:30px;width:1px;height:44px;background:${C.faint}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:28px">${k}</div>`);
    add(`<div style="position:absolute;left:${x}px;top:48px;font:700 22px ${SANS}">${v}</div>`);
  });

  // ------------------------------------------------------------ 01 run state
  panel(28, 108, 300, 228, '運行状態', '01');
  const flNum = add(`<div style="position:absolute;left:44px;top:140px;width:120px;text-align:right;font:700 76px Inter,${SANS};line-height:1;letter-spacing:-2px"></div>`);
  add(`<div style="position:absolute;left:168px;top:174px;font:700 30px Inter,${SANS}">F</div>`);
  const arrow = add(`<svg style="position:absolute;left:46px;top:228px" width="30" height="30" viewBox="0 0 30 30"></svg>`);
  const dirText = add(`<div style="position:absolute;left:82px;top:226px;font:700 26px ${SANS}"></div>`);
  const phaseText = add(`<div class="sm" style="position:absolute;left:84px;top:260px;font-size:14px"></div>`);
  const doorChip = add(`<div style="position:absolute;left:44px;top:290px;height:30px;padding:0 12px;border-radius:4px;display:flex;align-items:center;font:700 18px ${SANS};color:#fff"></div>`);
  const shaft = add(`<svg style="position:absolute;left:250px;top:132px" width="64" height="196"></svg>`);
  add(`<div class="sm" style="position:absolute;left:186px;top:286px;font-size:12px;line-height:17px"><span style="display:inline-block;width:9px;height:9px;background:${C.ink};margin-right:5px"></span>かご<br><span style="display:inline-block;width:9px;height:9px;background:${C.mute};margin-right:5px"></span>おもり</div>`);

  // ------------------------------------------------------------ 02 destination floors
  panel(28, 350, 300, 160, '行先階', '02');
  const FB = {};
  for (let f = 1; f <= SPEC.floors; f++) {
    const col = (f - 1) % 5;
    const row = f > 5 ? 0 : 1;
    const x = 46 + col * 54;
    const y = 388 + row * 54;
    btn[`f${f}`] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:44px;height:44px;border-radius:50%;font:700 18px Inter,${SANS}">${f}</div>`);
    FB[f] = btn[`f${f}`];
  }

  // ------------------------------------------------------------ 03 passengers
  panel(28, 524, 300, 140, '乗車人数', '03');
  const pNum = add(`<div style="position:absolute;left:44px;top:556px;font:700 30px Inter,${SANS}"></div>`);
  const pKg = add(`<div class="sm" style="position:absolute;left:150px;top:568px;font-size:14px;color:${C.sub}"></div>`);
  const SL = {x: 48, w: 256, y: 622};
  add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y - 2}px;width:${SL.w}px;height:4px;border-radius:2px;background:#ebe2d4"></div>`);
  const slFill = add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y - 2}px;height:4px;border-radius:2px;background:${C.accent}"></div>`);
  // the balance point: 45 % of the rated load, 450 kg ≈ 6.9 persons
  const balP = (SPEC.ratedKg * SPEC.balance) / SPEC.personKg;
  add(`<div style="position:absolute;left:${SL.x + (balP / SPEC.persons) * SL.w}px;top:${SL.y - 9}px;width:1.5px;height:18px;background:${C.ink}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SL.x + (balP / SPEC.persons) * SL.w - 70}px;top:${SL.y + 12}px;width:140px;text-align:center;font-size:12px">つり合い点 約7人（450 kg）</div>`);
  const slKnob = add(`<div style="position:absolute;top:${SL.y - 9}px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#fff;border:2px solid ${C.accent};box-sizing:border-box"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SL.x - 4}px;top:${SL.y + 12}px;font-size:12px">0</div>`);
  add(`<div class="sm" style="position:absolute;left:${SL.x + SL.w - 10}px;top:${SL.y + 12}px;font-size:12px">15</div>`);

  // ------------------------------------------------------------ 04 note
  panel(28, 678, 300, 194, 'しくみ', '04');
  const note = add(`<div style="position:absolute;left:44px;top:714px;width:268px;font:500 15px/1.7 ${SANS};color:${C.ink}"></div>`);

  // ------------------------------------------------------------ 05 instruments
  panel(1262, 108, 310, 440, '計器', '05');
  const row = (y, label) => {
    add(`<div class="sm" style="position:absolute;left:1278px;top:${y}px">${label}</div>`);
    add(`<div style="position:absolute;left:1278px;top:${y + 58}px;width:278px;height:1px;background:${C.line}"></div>`);
  };
  const big = (x, y, w = 200) => add(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:700 30px Inter,${SANS};line-height:1;white-space:nowrap"></div>`);
  row(140, '速度');
  const vMain = big(1278, 160, 180);
  const vSub = add(`<div class="mo" style="position:absolute;left:1462px;top:170px;width:96px;text-align:right;font-size:15px;color:${C.sub}"></div>`);
  row(206, '加速度');
  const aMain = big(1278, 226);
  row(272, '綱車回転数');
  const rpmMain = big(1278, 292);
  const rpmIcon = add(`<svg style="position:absolute;left:1518px;top:284px" width="38" height="38" viewBox="-19 -19 38 38"><g data-r><circle r="15" fill="none" stroke="${C.ink}" stroke-width="2"/>${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${(9 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(9 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="2.6" fill="${C.ink}"/>`).join('')}<path d="M0 -15v5" stroke="${C.accent}" stroke-width="3"/></g></svg>`);
  row(338, 'モータートルク');
  const tqMain = big(1278, 358, 190);
  const modeChip = add(`<div style="position:absolute;left:1478px;top:354px;width:78px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 20px ${SANS};color:#fff"></div>`);
  row(404, 'ロープ張力（綱車にかかる力）');
  add(`<div class="sm" style="position:absolute;left:1278px;top:424px;font-size:12px">かご側</div>`);
  add(`<div class="sm" style="position:absolute;left:1420px;top:424px;font-size:12px">おもり側</div>`);
  const tcMain = big(1278, 440, 140);
  const twMain = big(1420, 440, 140);
  const tcBar = add(`<div style="position:absolute;left:1278px;top:476px;height:4px;border-radius:2px;background:${C.ink}"></div>`);
  const twBar = add(`<div style="position:absolute;left:1420px;top:476px;height:4px;border-radius:2px;background:${C.mute}"></div>`);
  add(`<div class="sm" style="position:absolute;left:1278px;top:496px">ドア開度</div>`);
  const dMain = big(1278, 512, 120);
  add(`<div style="position:absolute;left:1400px;top:524px;width:156px;height:6px;border-radius:3px;background:#ebe2d4"></div>`);
  const dBar = add(`<div style="position:absolute;left:1400px;top:524px;height:6px;border-radius:3px;background:${C.accent}"></div>`);

  // ------------------------------------------------------------ 06 views, 07 isolate, 08 display
  const btnRow = (keys, labels, prefix, x0, y, wmax = 282, h = 30) => {
    let x = x0;
    let yy = y;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 14 + 18);
      if (x + w > x0 + wmax) {
        x = x0;
        yy += h + 8;
      }
      btn[prefix + k] = add(`<div class="bt" style="left:${x}px;top:${yy}px;width:${w}px;height:${h}px">${labels[k]}</div>`);
      x += w + 7;
    }
  };
  panel(1262, 560, 310, 122, '視点', '06');
  btnRow(VIEWS, VIEW_LABEL, 'v_', 1276, 598);
  panel(1262, 694, 310, 84, '分離表示', '07');
  btnRow(ISOS, ISO_LABEL, 'i_', 1276, 732);
  panel(1262, 790, 310, 82, '表示', '08');
  btnRow(DISPLAY, DISPLAY_LABEL, 'd_', 1276, 828);

  // ------------------------------------------------------------ 09 the speed curve of the current trip
  panel(352, 752, 886, 120, '速度曲線', '09');
  const CH = {x: 368, y: 786, w: 560, h: 76};
  const chart = add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}"></svg>`);
  const tripTitle = add(`<div style="position:absolute;left:952px;top:782px;font:700 26px Inter,${SANS};white-space:nowrap"></div>`);
  const tripSub = add(`<div class="sm" style="position:absolute;left:952px;top:818px;font-size:14px;color:${C.sub};line-height:1.55"></div>`);

  // ------------------------------------------------------------ footer, labels, floor tags, the pointer
  add(`<div class="sm" style="position:absolute;left:358px;top:878px;font-size:11px;letter-spacing:.1em">仕組みの模型・寸法と数値は refs.md の仕様から計算・1つの入力（かごの位置）ですべてが動く</div>`);
  const tags = add(`<div style="position:absolute;inset:0"></div>`);
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const pointer = ui.late();
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, ui.centre(n)]));

  let chartTrip = null;
  let chartBase = '';
  const VY = 1.9;
  const X = (t, dur) => (t / dur) * CH.w;
  const Y = (v) => CH.h - (Math.abs(v) / VY) * CH.h;
  const drawBase = (tr) => {
    let p = '';
    let pa = '';
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * tr.dur;
      const m = tr.at(t);
      p += `${i ? 'L' : 'M'}${X(t, tr.dur).toFixed(1)} ${Y(m.v).toFixed(1)}`;
      pa += `${i ? 'L' : 'M'}${X(t, tr.dur).toFixed(1)} ${(CH.h / 2 - (m.a / SPEC.aMax) * (CH.h / 2 - 4)).toFixed(1)}`;
    }
    const yR = Y(SPEC.vMax);
    return {
      line: p,
      area: `${p}L${CH.w} ${CH.h}L0 ${CH.h}Z`,
      grid: `<line x1="0" x2="${CH.w}" y1="${CH.h}" y2="${CH.h}" stroke="${C.ink}" stroke-width="1"/>` +
        `<line x1="0" x2="${CH.w}" y1="${yR}" y2="${yR}" stroke="${C.mute}" stroke-width="1" stroke-dasharray="4 4"/>` +
        `<text x="${CH.w - 2}" y="${yR - 5}" text-anchor="end" font-size="12" fill="${C.mute}" font-family="${SANS}">定格 1.75 m/s</text>` +
        `<path d="${pa}" fill="none" stroke="${C.mute}" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>` +
        `<text x="2" y="12" font-size="12" fill="${C.mute}" font-family="${SANS}">速度（実線）・加速度（点線）</text>`,
    };
  };

  return {
    btn,
    spots,
    root: ui.root,
    SL,
    update(s) {
      const st = s.st;
      // 01 run state
      flNum.textContent = String(st.floor);
      dirText.textContent = st.dir > 0 ? '上昇中' : st.dir < 0 ? '下降中' : '停止中';
      arrow.innerHTML = st.dir === 0 ? `<rect x="5" y="13" width="20" height="4" fill="${C.mute}"/>` : `<path d="${st.dir > 0 ? 'M15 3L28 22H2z' : 'M15 27L28 8H2z'}" fill="${C.accent}"/>`;
      phaseText.textContent = s.phase;
      doorChip.textContent = `ドア　${st.doorPhase}`;
      doorChip.style.background = st.doorMoving > 0.5 ? C.accent : st.door > 0.99 ? C.ok : C.mute;
      {
        // the hoistway schematic: floors, the car (accent while moving) and the counterweight going the other way
        const top = 10;
        const bot = 186;
        const yOf = (y) => bot - ((y + 0.2) / (SPEC.travel + 3.6)) * (bot - top);
        let h = `<rect x="14" y="${top - 4}" width="44" height="${bot - top + 8}" fill="none" stroke="${C.faint}" stroke-width="1.2"/>`;
        for (let f = 1; f <= SPEC.floors; f++) {
          const y = yOf((f - 1) * SPEC.floorH);
          h += `<line x1="8" x2="14" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.mute}" stroke-width="1"/><text x="5" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.mute}" font-family="Inter">${f}</text>`;
        }
        const yc = yOf(st.carY);
        const yw = yOf(st.cwtY - 3.25);
        h += `<line x1="28" x2="28" y1="${top - 4}" y2="${(yc - 14).toFixed(1)}" stroke="${C.ink}" stroke-width="1"/><line x1="49" x2="49" y1="${top - 4}" y2="${(yOf(st.cwtY)).toFixed(1)}" stroke="${C.ink}" stroke-width="1"/>`;
        h += `<rect x="18" y="${(yc - 14).toFixed(1)}" width="22" height="14" fill="${st.dir ? C.accent : C.ink}"/>`;
        h += `<rect x="45" y="${yOf(st.cwtY).toFixed(1)}" width="8" height="${Math.max(4, yw - yOf(st.cwtY)).toFixed(1)}" fill="${C.mute}"/>`;
        shaft.innerHTML = h;
      }
      // 02 destination buttons: lit while called, the floor the car stands at outlined
      for (let f = 1; f <= SPEC.floors; f++) {
        const called = s.calls.has(f);
        FB[f].style.background = called ? C.accent : C.btn;
        FB[f].style.color = called ? '#fff' : C.ink;
        FB[f].style.borderColor = called ? C.accent : f === st.floor && st.level ? C.ink : C.faint;
        FB[f].style.borderWidth = f === st.floor && st.level && !called ? '2px' : '1px';
      }
      // 03 passengers
      pNum.textContent = `${st.persons} 人`;
      pKg.textContent = `${st.loadKg} kg・積載率 ${Math.round(st.loadPct)} %`;
      const k = st.persons / SPEC.persons;
      slFill.style.width = `${(k * SL.w).toFixed(1)}px`;
      slKnob.style.left = `${(SL.x + k * SL.w).toFixed(1)}px`;
      // 04 the note
      note.textContent = s.note;
      // 05 instruments
      vMain.innerHTML = `${fx(st.speedMpm, 1)}<span style="font-size:16px;font-weight:500"> m/分</span>`;
      vSub.textContent = `${fx(Math.abs(st.v), 2)} m/s`;
      aMain.innerHTML = `${st.a > 0.005 ? '+' : st.a < -0.005 ? '−' : ''}${fx(Math.abs(st.a), 2)}<span style="font-size:16px;font-weight:500"> m/s²</span>`;
      rpmMain.innerHTML = `${fx(st.rpm, 1)}<span style="font-size:16px;font-weight:500"> rpm</span>`;
      rpmIcon.querySelector('[data-r]').setAttribute('transform', `rotate(${((-st.sheaveAngle * 180) / Math.PI) % 360})`);
      tqMain.innerHTML = `${st.torque > 0.005 ? '+' : st.torque < -0.005 ? '−' : ''}${fx(Math.abs(st.torque), 2)}<span style="font-size:16px;font-weight:500"> kN·m</span>`;
      modeChip.textContent = st.mode;
      modeChip.style.background = st.mode === '力行' ? C.accent : st.mode === '回生' ? C.ok : C.mute;
      tcMain.innerHTML = `${fx(st.tCar, 1)}<span style="font-size:15px;font-weight:500"> kN</span>`;
      twMain.innerHTML = `${fx(st.tCwt, 1)}<span style="font-size:15px;font-weight:500"> kN</span>`;
      tcBar.style.width = `${Math.min(130, (st.tCar / 30) * 130).toFixed(1)}px`;
      twBar.style.width = `${Math.min(130, (st.tCwt / 30) * 130).toFixed(1)}px`;
      dMain.innerHTML = `${Math.round(st.doorPct)}<span style="font-size:16px;font-weight:500"> %</span>`;
      dBar.style.width = `${(st.door * 156).toFixed(1)}px`;
      // 06–08 buttons
      for (const v of VIEWS) onBtn(btn[`v_${v}`], s.view === v);
      for (const i of ISOS) onBtn(btn[`i_${i}`], s.iso === i);
      for (const d of DISPLAY) onBtn(btn[`d_${d}`], !!s.display[d]);
      // 09 the speed curve
      const tr = s.trip;
      if (tr !== chartTrip) {
        chartTrip = tr;
        chartBase = tr && tr.dur ? drawBase(tr) : null;
      }
      if (chartBase) {
        const tau = Math.min(tr.dur, Math.max(0, s.tripTau));
        const m = tr.at(tau);
        const cx = X(tau, tr.dur);
        chart.innerHTML =
          `<clipPath id="chc"><rect x="0" y="-4" width="${cx.toFixed(1)}" height="${CH.h + 8}"/></clipPath>` +
          chartBase.grid +
          `<path d="${chartBase.area}" fill="${C.accent}" opacity=".14" clip-path="url(#chc)"/>` +
          `<path d="${chartBase.line}" fill="none" stroke="${C.faint}" stroke-width="2"/>` +
          `<path d="${chartBase.line}" fill="none" stroke="${C.accent}" stroke-width="2.4" clip-path="url(#chc)"/>` +
          `<circle cx="${cx.toFixed(1)}" cy="${Y(m.v).toFixed(1)}" r="5" fill="#fff" stroke="${C.accent}" stroke-width="2.4"/>`;
        tripTitle.innerHTML = `${tr.from}F <span style="color:${C.accent}">→</span> ${tr.to}F`;
        tripSub.innerHTML = `${tr.L.toFixed(1)} m・${tr.dur.toFixed(1)} 秒・最高 ${tr.vPeak.toFixed(2)} m/s<br>${tr.vPeak < SPEC.vMax - 1e-6 ? '短い距離：定格速度に届かない' : '加速 → 定速 → 減速（S字カーブ）'}`;
      } else {
        chart.innerHTML = `<line x1="0" x2="${CH.w}" y1="${CH.h}" y2="${CH.h}" stroke="${C.ink}" stroke-width="1"/><text x="${CH.w / 2}" y="${CH.h / 2}" text-anchor="middle" font-size="14" fill="${C.mute}" font-family="${SANS}">行先階を押すと運行の速度曲線が出ます</text>`;
        tripTitle.textContent = '';
        tripSub.textContent = '';
      }
      // floor tags in the far view
      tags.innerHTML = s.floorTags.map(([x, y, f, o]) => `<div class="mo" style="position:absolute;left:${x.toFixed(1)}px;top:${(y - 8).toFixed(1)}px;font-size:12px;color:${C.mute};opacity:${o.toFixed(2)}">${f}F</div>`).join('');
      // labels: a square, the name, the note, a thin leader to the part
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const right = lx > ax;
        const ex = right ? lx - 6 : lx + c.w + 6;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${(ly + 9).toFixed(1)}" fill="none" stroke="${C.accent}" stroke-width="1" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3" fill="${C.accent}" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 1).toFixed(1)}px;opacity:${c.o.toFixed(2)};${right ? '' : `width:${c.w}px;text-align:right`}"><b style="${right ? '' : 'justify-content:flex-end'}"><i></i>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
    MONO,
  };
}
