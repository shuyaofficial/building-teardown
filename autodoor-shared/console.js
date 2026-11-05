// The automatic door's console, laid out at 1600 x 900, all in Japanese: the title block; on the left the controller's
// state (with the hold timer and the three sensors), the walk buttons, the settings (detection depth, walking speed,
// mode) and a one-line explanation; on the right the instruments (leaf speed, gap, motor rpm, torque with 力行/制動,
// power, kinetic energy against the 10 J line), the views, the isolates and the display toggles; along the bottom the
// leaf speed of the last 8 s and the gap the last walker found on arriving. update(s) redraws every live part from the
// frame's state; nothing here keeps time.
import {C, createChrome, MONO, SANS} from '../building-kit/ui.js';
import {SPEC} from './kin.js';

export const VIEWS = ['all', 'header', 'floor', 'edge'];
export const VIEW_LABEL = {all: '全景', header: '無目の中', floor: '足元・センサー', edge: '戸先'};
export const ISOS = ['engine', 'belt', 'sensor'];
export const ISO_LABEL = {engine: 'エンジン', belt: 'ベルトと吊車', sensor: 'センサー'};
export const DISPLAY = ['cut', 'labels'];
export const DISPLAY_LABEL = {cut: 'カットアウェイ', labels: 'ラベル'};
export const WALKS = ['out', 'in', 'diag', 'linger'];
export const WALK_LABEL = {out: '外から歩く', in: '内から歩く', diag: '斜めから歩く', linger: '戸の間で立ち止まる'};
export const MODE_LABEL = {normal: '一般', gentle: '高齢者・子ども'};
const fx = (n, d) => (Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n).toFixed(d);
const sgn = (n, d) => `${n > 0.5 * Math.pow(10, -d) ? '+' : n < -0.5 * Math.pow(10, -d) ? '−' : ''}${fx(Math.abs(n), d)}`;
const unit = (u, px = 16) => `<span style="font-size:${px}px;font-weight:500"> ${u}</span>`;

export function createConsole(app) {
  const ui = createChrome(app);
  const {add, panel, onBtn} = ui;
  const btn = {};

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:150px;height:92px;background:${C.accent}"></div>`);
  add(`<svg style="position:absolute;left:44px;top:18px" width="62" height="58" viewBox="0 0 62 58"><rect x="3" y="4" width="56" height="8" fill="#fff"/><rect x="8" y="14" width="20" height="40" fill="none" stroke="#fff" stroke-width="3"/><rect x="34" y="14" width="20" height="40" fill="none" stroke="#fff" stroke-width="3"/><path d="M15 34h-8m0 0l4-4m-4 4l4 4M47 34h8m0 0l-4-4m4 4l-4 4" stroke="#fff" stroke-width="2.4" fill="none"/></svg>`);
  add(`<div class="sm" style="position:absolute;left:172px;top:16px;letter-spacing:.12em">ビル設備のしくみ　02</div>`);
  add(`<div style="position:absolute;left:170px;top:34px;font:700 34px ${SANS};letter-spacing:.02em;line-height:1">自動ドア <span style="color:${C.accent};font-weight:400">/</span> <span style="font-size:24px">両引き・ベルト駆動</span></div>`);
  add(`<div style="position:absolute;left:172px;top:76px;font:500 14px ${SANS};color:${C.sub};letter-spacing:.04em">商業ビル正面入口・有効開口 ${SPEC.openW.toFixed(2)} × ${SPEC.openH.toFixed(2)} m・戸1枚 ${SPEC.leafKg} kg・DCブラシレス ${SPEC.motorV} V</div>`);
  [['開 / 閉の速さ', `${SPEC.modes.normal.vOpen * 1000} / ${SPEC.modes.normal.vClose * 1000}`, 'mm/s'], ['開放保持', SPEC.holdT.toFixed(1), '秒'], ['運動エネルギー', `≤ ${SPEC.keMax}`, 'J']].forEach(([k, v, u], i) => {
    const x = 1060 + i * 172;
    if (i) add(`<div style="position:absolute;left:${x - 14}px;top:30px;width:1px;height:44px;background:${C.faint}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:28px">${k}</div>`);
    add(`<div style="position:absolute;left:${x}px;top:48px;font:700 22px ${SANS};white-space:nowrap">${v}${unit(u, 13)}</div>`);
  });

  // ------------------------------------------------------------ 01 the controller
  panel(28, 108, 300, 214, '運転状態', '01');
  const stChip = add(`<div style="position:absolute;left:44px;top:144px;height:44px;padding:0 14px;border-radius:5px;display:flex;align-items:center;font:700 28px ${SANS};color:#fff;letter-spacing:.04em"></div>`);
  const stSub = add(`<div class="sm" style="position:absolute;left:44px;top:198px;font-size:14px;color:${C.sub}"></div>`);
  add(`<div style="position:absolute;left:44px;top:228px;width:268px;height:5px;border-radius:3px;background:#ebe2d4"></div>`);
  const holdBar = add(`<div style="position:absolute;left:44px;top:228px;height:5px;border-radius:3px;background:${C.ok}"></div>`);
  const SENS = [['sOut', '起動・外'], ['sIn', '起動・内'], ['sAux', '補助光電']];
  const sensDot = {};
  SENS.forEach(([k, label], i) => {
    const x = 44 + i * 92;
    sensDot[k] = add(`<div style="position:absolute;left:${x}px;top:252px;width:84px;height:54px;border-radius:5px;border:1px solid ${C.faint}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:258px;width:84px;text-align:center;font-size:12px;color:${C.sub}">${label}</div>`);
    sensDot[`${k}T`] = add(`<div style="position:absolute;left:${x}px;top:276px;width:84px;text-align:center;font:700 18px Inter,${SANS}"></div>`);
  });

  // ------------------------------------------------------------ 02 walkers
  panel(28, 336, 300, 132, '人を歩かせる', '02');
  WALKS.forEach((k, i) => {
    const x = 44 + (i % 2) * 138;
    const y = 372 + Math.floor(i / 2) * 44;
    btn[`w_${k}`] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:130px;height:36px;font-size:${k === 'linger' ? 12.5 : 14}px">${WALK_LABEL[k]}</div>`);
  });

  // ------------------------------------------------------------ 03 settings
  panel(28, 482, 300, 212, '設定', '03');
  const slider = (y, label, min, max, marks) => {
    add(`<div class="sm" style="position:absolute;left:44px;top:${y}px;font-size:13px">${label}</div>`);
    const val = add(`<div style="position:absolute;left:180px;top:${y - 4}px;width:132px;text-align:right;font:700 18px Inter,${SANS}"></div>`);
    const SL = {x: 50, w: 254, y: y + 32, min, max};
    add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y - 2}px;width:${SL.w}px;height:4px;border-radius:2px;background:#ebe2d4"></div>`);
    const fill = add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y - 2}px;height:4px;border-radius:2px;background:${C.accent}"></div>`);
    for (const [v, t] of marks) {
      const x = SL.x + ((v - min) / (max - min)) * SL.w;
      // a mark at the left end reads to the right of its tick, so it never leaves the panel
      const atMin = v === min;
      add(`<div style="position:absolute;left:${x}px;top:${SL.y - 8}px;width:1.5px;height:16px;background:${C.ink}"></div>`);
      add(`<div class="sm" style="position:absolute;left:${atMin ? x - 4 : x - 50}px;top:${SL.y + 10}px;width:100px;text-align:${atMin ? 'left' : 'center'};font-size:11px">${t}</div>`);
    }
    const knob = add(`<div style="position:absolute;top:${SL.y - 9}px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#fff;border:2px solid ${C.accent};box-sizing:border-box"></div>`);
    return {SL, val, fill, knob};
  };
  const slD = slider(518, '検出範囲の奥行', SPEC.detDMin, SPEC.detDMax, [[SPEC.detDMin, '推奨の下限'], [SPEC.detD, '既定']]);
  const slW = slider(586, '歩く速さ', SPEC.walkMin, SPEC.walkMax, [[SPEC.walk, '普通']]);
  ['normal', 'gentle'].forEach((k, i) => {
    btn[`m_${k}`] = add(`<div class="bt" style="left:${i ? 126 : 44}px;top:652px;width:${i ? 186 : 74}px;height:30px">${MODE_LABEL[k]}${i ? 'が多い建物' : ''}</div>`);
  });

  // ------------------------------------------------------------ 04 note
  panel(28, 708, 300, 164, 'しくみ', '04');
  const note = add(`<div style="position:absolute;left:44px;top:740px;width:268px;font:500 13.5px/1.62 ${SANS};color:${C.ink}"></div>`);

  // ------------------------------------------------------------ 05 instruments
  panel(1262, 108, 310, 440, '計器', '05');
  const row = (y, label, line = true) => {
    add(`<div class="sm" style="position:absolute;left:1278px;top:${y}px">${label}</div>`);
    if (line) add(`<div style="position:absolute;left:1278px;top:${y + 60}px;width:278px;height:1px;background:${C.line}"></div>`);
  };
  const big = (x, y, w = 200) => add(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:700 28px Inter,${SANS};line-height:1;white-space:nowrap"></div>`);
  const sub = (x, y, w = 110) => add(`<div class="mo" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;text-align:right;font-size:13px;color:${C.sub};white-space:nowrap"></div>`);
  row(140, '戸の速度');
  const vMain = big(1278, 162, 180);
  const vSub = sub(1446, 170);
  row(206, 'すき間（2枚の戸の間）');
  const gMain = big(1278, 228, 160);
  add(`<div style="position:absolute;left:1440px;top:240px;width:116px;height:6px;border-radius:3px;background:#ebe2d4"></div>`);
  const gBar = add(`<div style="position:absolute;left:1440px;top:240px;height:6px;border-radius:3px;background:${C.ink}"></div>`);
  add(`<div style="position:absolute;left:${1440 + (SPEC.passGap / SPEC.openW) * 116}px;top:234px;width:1.5px;height:18px;background:${C.accent}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${1440 + (SPEC.passGap / SPEC.openW) * 116 - 40}px;top:252px;width:80px;text-align:center;font-size:10.5px">${SPEC.passGap * 1000} mm</div>`);
  row(272, 'モーター回転数');
  const rpmMain = big(1278, 294, 170);
  const rpmSub = sub(1446, 302);
  row(338, 'モーター軸トルク');
  const tqMain = big(1278, 360, 190);
  const modeChip = add(`<div style="position:absolute;left:1478px;top:354px;width:78px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 20px ${SANS};color:#fff"></div>`);
  row(404, '電力（モーター入力）');
  const pMain = big(1278, 426, 170);
  const pSub = sub(1446, 434);
  row(470, '運動エネルギー（戸1枚）', false);
  const keMain = big(1278, 490, 130);
  const KB = {x: 1410, w: 146, max: 12};
  add(`<div style="position:absolute;left:${KB.x}px;top:500px;width:${KB.w}px;height:10px;border-radius:2px;background:#ebe2d4"></div>`);
  const keBar = add(`<div style="position:absolute;left:${KB.x}px;top:500px;height:10px;border-radius:2px;background:${C.ink}"></div>`);
  const keMark = add(`<div style="position:absolute;left:${KB.x}px;top:500px;width:2px;height:10px;background:${C.sub}"></div>`);
  add(`<div style="position:absolute;left:${KB.x + (10 / KB.max) * KB.w}px;top:493px;width:2px;height:24px;background:${C.accent}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${KB.x + (10 / KB.max) * KB.w - 30}px;top:518px;width:60px;text-align:center;font-size:11px;color:${C.accent}">上限 10 J</div>`);
  const keSub = add(`<div class="sm" style="position:absolute;left:1278px;top:524px;font-size:11.5px"></div>`);

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

  // ------------------------------------------------------------ 09 the leaf speed of the last 8 s, the arrival gap
  panel(352, 752, 886, 120, '戸の速度・直近 8 秒', '09');
  add(`<div class="sm" style="position:absolute;left:530px;top:766px;font-size:11px">開く向き ＋ ／ 閉じる向き −（mm/s）</div>`);
  const CH = {x: 372, y: 794, w: 470, h: 54, back: 8};
  const chart = add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}"></svg>`);
  add(`<div style="position:absolute;left:900px;top:766px;width:1px;height:96px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:918px;top:764px;font-size:13px;color:${C.ink};font-weight:700">着いたときのすき間</div>`);
  const arrMain = add(`<div style="position:absolute;left:918px;top:786px;font:700 30px Inter,${SANS};white-space:nowrap;line-height:1"></div>`);
  const arrSub = add(`<div class="sm" style="position:absolute;left:918px;top:822px;font-size:13px;color:${C.sub};line-height:1.5;white-space:nowrap"></div>`);

  // ------------------------------------------------------------ footer, labels, the pointer
  add(`<div class="sm" style="position:absolute;left:358px;top:878px;font-size:11px;letter-spacing:.1em">仕組みの模型・寸法と数値は refs.md の仕様から計算・1 ms 刻みのシミュレーション（歩行者 → センサー → 制御 → 戸）ですべてが動く</div>`);
  // the tracks stay inside the 3D viewport, between the panels
  const trackSvg = add(`<svg style="position:absolute;left:340px;top:100px;overflow:hidden" width="910" height="645" viewBox="340 100 910 645"></svg>`);
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const pointer = ui.late();
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, ui.centre(n)]));
  const knobAt = (sl, v) => [sl.SL.x + ((v - sl.SL.min) / (sl.SL.max - sl.SL.min)) * sl.SL.w, sl.SL.y];
  spots.slD = (v) => knobAt(slD, v);
  spots.slW = (v) => knobAt(slW, v);
  const setSlider = (sl, v, txt) => {
    const k = (v - sl.SL.min) / (sl.SL.max - sl.SL.min);
    sl.fill.style.width = `${(k * sl.SL.w).toFixed(1)}px`;
    sl.knob.style.left = `${(sl.SL.x + k * sl.SL.w).toFixed(1)}px`;
    sl.val.innerHTML = txt;
  };

  const VY = 0.55; // m/s full scale on the chart
  const yOf = (v) => CH.h / 2 - (v / VY) * (CH.h / 2 - 2);
  const chartGrid = (m) => {
    const lim = (v, t) => `<line x1="0" x2="${CH.w}" y1="${yOf(v).toFixed(1)}" y2="${yOf(v).toFixed(1)}" stroke="${C.mute}" stroke-width="1" stroke-dasharray="4 4"/><text x="${CH.w + 6}" y="${(yOf(v) + 4).toFixed(1)}" font-size="11" fill="${C.mute}" font-family="${SANS}">${t}</text>`;
    return (
      `<line x1="0" x2="${CH.w}" y1="${CH.h / 2}" y2="${CH.h / 2}" stroke="${C.ink}" stroke-width="1"/>` +
      lim(m.vOpen, `開 ${m.vOpen * 1000}`) +
      lim(-m.vClose, `閉 ${m.vClose * 1000}`) +
      `<text x="${CH.w}" y="${CH.h + 13}" text-anchor="end" font-size="11" fill="${C.mute}" font-family="${SANS}">いま</text>` +
      `<text x="0" y="${CH.h + 13}" font-size="11" fill="${C.mute}" font-family="${SANS}">8 秒前</text>`
    );
  };

  return {
    btn,
    spots,
    root: ui.root,
    SL: {D: slD.SL, W: slW.SL},
    update(s) {
      const st = s.st;
      // 01 the controller
      const moving = st.state === 1 || st.state === 3 || st.state === 4;
      stChip.textContent = st.stateName;
      stChip.style.background = st.state === 4 ? C.accent : moving ? C.accent : st.state === 2 ? C.ok : C.mute;
      stSub.textContent =
        st.state === 2
          ? `開放保持 残り ${st.hold.toFixed(1)} 秒`
          : st.state === 4
            ? `${st.causeName}が人を検出 → 0.2 秒で停止`
            : st.state === 1
              ? `${st.causeName || '起動センサー'}の検出で開く`
              : st.state === 3
                ? '誰もいない：閉じる'
                : '待機中（誰も検出していない）';
      holdBar.style.width = `${((st.state === 2 ? st.hold / SPEC.holdT : 0) * 268).toFixed(1)}px`;
      for (const [k] of SENS) {
        const on = !!st[k];
        sensDot[k].style.background = on ? C.accent : 'transparent';
        sensDot[k].style.borderColor = on ? C.accent : C.faint;
        sensDot[`${k}T`].textContent = on ? 'ON' : 'OFF';
        sensDot[`${k}T`].style.color = on ? '#fff' : C.mute;
      }
      // 02 walkers: the last button pressed rings for a moment
      for (const k of WALKS) onBtn(btn[`w_${k}`], s.walkLit === k);
      // 03 settings
      setSlider(slD, st.D, `${st.D.toFixed(2)}${unit('m', 13)}`);
      setSlider(slW, s.walk, `${s.walk.toFixed(1)}${unit('m/s', 13)}`);
      for (const k of ['normal', 'gentle']) onBtn(btn[`m_${k}`], st.mode === k);
      note.textContent = s.note;
      // 05 instruments
      vMain.innerHTML = `${fx(st.speedMM, 0)}${unit('mm/s')}`;
      vSub.textContent = `上限 ${fx(st.vLimitMM, 0)}`;
      gMain.innerHTML = `${fx(st.gapMM, 0)}${unit('mm')}`;
      gBar.style.width = `${((st.gap / SPEC.openW) * 116).toFixed(1)}px`;
      gBar.style.background = st.gap >= SPEC.passGap ? C.ink : C.mute;
      rpmMain.innerHTML = `${fx(st.rpmMotor, 0)}${unit('rpm')}`;
      rpmSub.textContent = `プーリー ${fx(st.rpmPulley, 1)}`;
      tqMain.innerHTML = `${sgn(st.Tm, 3)}${unit('N·m')}`;
      modeChip.textContent = st.regime;
      modeChip.style.background = st.regime === '力行' ? C.accent : st.regime === '制動' ? C.ok : C.mute;
      pMain.innerHTML = `${sgn(st.pElec, 1)}${unit('W')}`;
      pSub.textContent = `力 ${sgn(st.F, 1)} N`;
      keMain.innerHTML = `${fx(st.ke, 2)}${unit('J')}`;
      keBar.style.width = `${((Math.min(st.ke, KB.max) / KB.max) * KB.w).toFixed(1)}px`;
      keBar.style.background = st.ke > 0.01 ? C.accent : C.ink;
      // the mode's top speed marked on the bar: where the needle settles while the door runs flat out
      keMark.style.left = `${(KB.x + (st.keOpen / KB.max) * KB.w - 1).toFixed(1)}px`;
      keSub.textContent = `開 ${st.keOpen.toFixed(2)} J ／ 閉 ${st.keClose.toFixed(2)} J（${st.modeName}）`;
      // 06–08 buttons
      for (const v of VIEWS) onBtn(btn[`v_${v}`], s.view === v);
      for (const i of ISOS) onBtn(btn[`i_${i}`], s.iso === i);
      for (const d of DISPLAY) onBtn(btn[`d_${d}`], !!s.display[d]);
      // 09 the speed chart: s.hist holds the signed speed (m/s) over the last 8 s, oldest first
      {
        const h = s.hist;
        let p = '';
        for (let i = 0; i < h.length; i++) p += `${i ? 'L' : 'M'}${((i / (h.length - 1)) * CH.w).toFixed(1)} ${yOf(h[i]).toFixed(1)}`;
        const area = `${p}L${CH.w} ${CH.h / 2}L0 ${CH.h / 2}Z`;
        chart.innerHTML = chartGrid(st.mode === 'gentle' ? SPEC.modes.gentle : SPEC.modes.normal) + `<path d="${area}" fill="${C.accent}" opacity=".14"/><path d="${p}" fill="none" stroke="${C.accent}" stroke-width="2.2"/><circle cx="${CH.w}" cy="${yOf(h[h.length - 1]).toFixed(1)}" r="4.5" fill="#fff" stroke="${C.accent}" stroke-width="2.2"/>`;
      }
      const w = s.walker;
      if (!w) {
        arrMain.innerHTML = `<span style="font-size:18px;color:${C.mute}">— 人が来ると出ます</span>`;
        arrSub.innerHTML = '検出範囲の奥行と歩く速さで決まる';
      } else {
        const tight = w.noYield < SPEC.passGap;
        arrMain.innerHTML = `<span style="color:${tight ? C.accent : C.ink}">${Math.round(w.noYield * 1000)}</span>${unit('mm')}<span style="font:500 13px ${SANS};color:${C.sub}">　歩調そのままなら</span>`;
        const ctx = `検出 ${w.D.toFixed(2)} m・${w.w.toFixed(1)} m/s`;
        arrSub.innerHTML =
          w.arrived === null
            ? `${ctx}<br>${tight ? `${SPEC.passGap * 1000} mm に足りない → 足を緩める` : `${SPEC.passGap * 1000} mm 以上 → そのまま通れる`}`
            : `${ctx}<br>実際 ${Math.round(w.arrived * 1000)} mm・${w.slowed ? '足を緩めた' : '足を緩めずに通った'}`;
      }
      // the walkers' tracks in the plan view: a dotted line from where they started, the newest darkest
      trackSvg.innerHTML = (s.tracks || [])
        .map((p, i, a) => {
          if (p.length < 4) return '';
          let d = '';
          for (let k = 0; k < p.length; k += 2) d += `${k ? 'L' : 'M'}${p[k].toFixed(1)} ${p[k + 1].toFixed(1)}`;
          const o = (s.trackK ?? 1) * (i === a.length - 1 ? 0.85 : 0.4);
          return `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round" opacity="${o.toFixed(2)}"/>`;
        })
        .join('');
      // labels: a square, the name, the note, a thin leader to the part
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const row = c.up !== undefined;
        const right = row || lx > ax;
        // a column label's leader leaves from its side; a row label's from its square, down or up to the part
        const [ex, ey] = row ? [lx + 3.5, c.up ? ly + 44 : ly - 2] : [right ? lx - 6 : lx + c.w + 6, ly + 9];
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${C.accent}" stroke-width="1" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3" fill="${C.accent}" opacity="${c.o.toFixed(2)}"/>`;
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
