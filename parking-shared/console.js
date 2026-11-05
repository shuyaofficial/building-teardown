// The parking lift's console, laid out at 1600 x 900, all in Japanese: the title block; on the left the state (with
// the four safety indicators), the operating buttons, the car's weight and a one-line explanation; on the right the
// instruments (pallet height, speed, oil pressure against the relief valve, motor shaft power, chain tension against
// the 7× rule), the views, the isolates and the display toggles; along the bottom the oil pressure of the last 30 s
// and Pascal's sum with the live numbers. update(s) redraws every live part from the frame's state; nothing here
// keeps time.
import {C, createChrome, MONO, SANS} from '../building-kit/ui.js';
import {CARS, SPEC} from './kin.js';

export const VIEWS = ['all', 'hyd', 'safe'];
export const VIEW_LABEL = {all: '全景', hyd: '油圧ユニット', safe: '安全装置'};
export const ISOS = ['hyd', 'chain'];
export const ISO_LABEL = {hyd: '油圧', chain: 'チェーン'};
export const DISPLAY = ['cut', 'labels'];
export const DISPLAY_LABEL = {cut: 'カットアウェイ', labels: 'ラベル'};
export const OPS = ['up', 'down', 'stop', 'in', 'out', 'shift'];
export const OP_LABEL = {up: '上げる', down: '下げる', stop: '止める', in: '人が入る', out: '人が出る', shift: '車を前に出す'};
const fx = (n, d) => (Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n).toFixed(d);
const unit = (u, px = 16) => `<span style="font-size:${px}px;font-weight:500"> ${u}</span>`;
const kgs = (n) => n.toLocaleString('en-US');

export function createConsole(app) {
  const ui = createChrome(app);
  const {add, panel, onBtn} = ui;
  const btn = {};

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:150px;height:92px;background:${C.accent}"></div>`);
  add(`<svg style="position:absolute;left:44px;top:16px" width="62" height="62" viewBox="0 0 62 62"><rect x="6" y="8" width="50" height="5" fill="#fff"/><rect x="6" y="32" width="50" height="5" fill="#fff"/><path d="M10 13v19M52 13v19" stroke="#fff" stroke-width="3"/><path d="M3 44h56v14H3z" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M31 50v-9m0 0l-4 4m4-4l4 4" stroke="#fff" stroke-width="2.4" fill="none"/></svg>`);
  add(`<div class="sm" style="position:absolute;left:172px;top:16px;letter-spacing:.12em">ビル設備のしくみ　04</div>`);
  add(`<div style="position:absolute;left:170px;top:34px;font:700 34px ${SANS};letter-spacing:.02em;line-height:1">機械式駐車装置 <span style="color:${C.accent};font-weight:400">/</span> <span style="font-size:24px">ピット2段・油圧昇降</span></div>`);
  add(`<div style="position:absolute;left:172px;top:76px;font:500 14px ${SANS};color:${C.sub};letter-spacing:.04em">2台収容・パレット間隔 ${SPEC.stroke.toFixed(2)} m・単動油圧シリンダ 2本 ＋ チェーン 2:1・つり合いおもりなし</div>`);
  [['昇降速度', `${fx(SPEC.vRated * 1000, 0)}`, `mm/s（上限 ${SPEC.vLimit * 1000}）`], ['載せられる車', `≤ ${kgs(SPEC.carMaxKg)}`, 'kg'], ['安全弁', fx(SPEC.pRelief / 1e6, 1), 'MPa']].forEach(([k, v, u], i) => {
    const x = 1010 + i * 196;
    if (i) add(`<div style="position:absolute;left:${x - 14}px;top:30px;width:1px;height:44px;background:${C.faint}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:28px">${k}</div>`);
    add(`<div style="position:absolute;left:${x}px;top:48px;font:700 22px ${SANS};white-space:nowrap">${v}${unit(u, 13)}</div>`);
  });

  // ------------------------------------------------------------ 01 the state and the safety indicators
  panel(28, 108, 300, 228, '運転状態', '01');
  const stChip = add(`<div style="position:absolute;left:44px;top:144px;height:44px;padding:0 14px;border-radius:5px;display:flex;align-items:center;font:700 26px ${SANS};color:#fff;letter-spacing:.04em;white-space:nowrap"></div>`);
  const stSub = add(`<div class="sm" style="position:absolute;left:44px;top:198px;width:268px;font-size:13.5px;color:${C.sub};white-space:normal;line-height:1.4"></div>`);
  const SAFE = [['person', '人検知'], ['overhang', 'はみ出し'], ['gate', 'ゲート'], ['latch', 'ラッチ']];
  const ind = {};
  SAFE.forEach(([k, label], i) => {
    const x = 44 + i * 68;
    ind[k] = add(`<div style="position:absolute;left:${x}px;top:262px;width:62px;height:58px;border-radius:5px;border:1px solid ${C.faint}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:268px;width:62px;text-align:center;font-size:11.5px;color:${C.sub}">${label}</div>`);
    ind[`${k}T`] = add(`<div style="position:absolute;left:${x}px;top:288px;width:62px;text-align:center;font:700 16px ${SANS}"></div>`);
  });

  // ------------------------------------------------------------ 02 operation
  panel(28, 350, 300, 138, '操作', '02');
  OPS.forEach((k, i) => {
    const x = 44 + (i % 3) * 92;
    const y = 386 + Math.floor(i / 3) * 48;
    btn[`o_${k}`] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:84px;height:38px;font-size:${k === 'shift' ? 11.5 : 15}px">${OP_LABEL[k]}</div>`);
  });

  // ------------------------------------------------------------ 03 the car's weight
  panel(28, 502, 300, 192, '載せる車の重さ', '03');
  CARS.forEach((k, i) => {
    const c = SPEC.cars[k];
    const x = 44 + (i % 2) * 138;
    const y = 538 + Math.floor(i / 2) * 46;
    btn[`c_${k}`] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:130px;height:38px;font-size:14px">${c.name} ${kgs(c.kg)} kg</div>`);
  });
  add(`<div class="sm" style="position:absolute;left:182px;top:628px;width:130px;text-align:center;font-size:10.5px;color:${C.accent}">↑ 許容の上限</div>`);
  const massLine = add(`<div style="position:absolute;left:44px;top:650px;width:268px;font:500 13px ${SANS};color:${C.sub};line-height:1.45;white-space:nowrap"></div>`);

  // ------------------------------------------------------------ 04 note
  panel(28, 708, 300, 164, 'しくみ', '04');
  const note = add(`<div style="position:absolute;left:44px;top:740px;width:268px;font:500 13.5px/1.62 ${SANS};color:${C.ink}"></div>`);

  // ------------------------------------------------------------ 05 instruments
  panel(1262, 108, 310, 480, '計器', '05');
  const row = (y, label, line = true, dy = 60) => {
    add(`<div class="sm" style="position:absolute;left:1278px;top:${y}px">${label}</div>`);
    if (line) add(`<div style="position:absolute;left:1278px;top:${y + dy}px;width:278px;height:1px;background:${C.line}"></div>`);
  };
  const big = (x, y, w = 200) => add(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:700 28px Inter,${SANS};line-height:1;white-space:nowrap"></div>`);
  const sub = (x, y, w = 110) => add(`<div class="mo" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;text-align:right;font-size:13px;color:${C.sub};white-space:nowrap"></div>`);
  const bar = (x, y, w, mark, markText) => {
    add(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:6px;border-radius:3px;background:#ebe2d4"></div>`);
    const b = add(`<div style="position:absolute;left:${x}px;top:${y}px;height:6px;border-radius:3px;background:${C.ink}"></div>`);
    if (mark !== undefined) {
      add(`<div style="position:absolute;left:${x + mark * w - 1}px;top:${y - 5}px;width:1.5px;height:16px;background:${C.accent}"></div>`);
      add(`<div class="sm" style="position:absolute;left:${x + mark * w - 82}px;top:${y - 19}px;width:78px;text-align:right;font-size:10.5px;color:${C.accent}">${markText}</div>`);
    }
    return b;
  };
  // six rows, 74 px apart: label, the big number, one small line, the rule
  const R = (i) => 140 + i * 74;
  const small = (y) => add(`<div class="mo" style="position:absolute;left:1278px;top:${y}px;width:278px;font-size:11.5px;color:${C.sub};white-space:nowrap"></div>`);
  row(R(0), 'パレットの高さ（下段の床）', true, 68);
  const hMain = big(1278, R(0) + 22, 160);
  const hBar = bar(1440, R(0) + 32, 116);
  const hSub = add(`<div class="sm" style="position:absolute;left:1440px;top:${R(0) + 44}px;width:116px;text-align:right;font-size:11px"></div>`);
  row(R(1), '昇降速度', true, 68);
  const vMain = big(1278, R(1) + 22, 170);
  const vSub = sub(1446, R(1) + 30);
  row(R(2), '油圧（シリンダの中）', true, 68);
  const pMain = big(1278, R(2) + 22, 150);
  const pBar = bar(1440, R(2) + 32, 116, 1, '安全弁');
  const pSub = small(R(2) + 52);
  row(R(3), 'モーター軸の出力', true, 68);
  const wMain = big(1278, R(3) + 22, 150);
  const modeChip = add(`<div style="position:absolute;left:1478px;top:${R(3) + 14}px;width:78px;height:34px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 19px ${SANS};color:#fff"></div>`);
  const wSub = small(R(3) + 52);
  row(R(4), 'チェーン張力（1本）', true, 68);
  const tMain = big(1278, R(4) + 22, 150);
  const tBar = bar(1440, R(4) + 32, 116, 1 / SPEC.chainFactor, `1/${SPEC.chainFactor}`);
  const tSub = small(R(4) + 52);
  row(R(5), '流量（ポンプ ／ 弁）', false);
  const qMain = big(1278, R(5) + 22, 150);
  const qSub = sub(1446, R(5) + 30);

  // ------------------------------------------------------------ 06 views, 07 isolate, 08 display
  const btnRow = (keys, labels, prefix, x0, y, wmax = 282, h = 30) => {
    let x = x0;
    let yy = y;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 14 + 22);
      if (x + w > x0 + wmax) {
        x = x0;
        yy += h + 8;
      }
      btn[prefix + k] = add(`<div class="bt" style="left:${x}px;top:${yy}px;width:${w}px;height:${h}px">${labels[k]}</div>`);
      x += w + 7;
    }
  };
  panel(1262, 600, 310, 76, '視点', '06');
  btnRow(VIEWS, VIEW_LABEL, 'v_', 1276, 636);
  panel(1262, 688, 310, 76, '分離表示', '07');
  btnRow(ISOS, ISO_LABEL, 'i_', 1276, 724);
  panel(1262, 776, 310, 76, '表示', '08');
  btnRow(DISPLAY, DISPLAY_LABEL, 'd_', 1276, 812);

  // ------------------------------------------------------------ 09 the oil pressure of the last 30 s, Pascal's sum
  panel(352, 752, 886, 120, '油圧・直近 30 秒', '09');
  add(`<div class="sm" style="position:absolute;left:520px;top:766px;font-size:11px">MPa（ラッチ・ピットの受けが支える間は 0）</div>`);
  const CH = {x: 372, y: 796, w: 440, h: 52};
  const chart = add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}"></svg>`);
  add(`<div style="position:absolute;left:876px;top:766px;width:1px;height:96px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:894px;top:764px;font-size:13px;color:${C.ink};font-weight:700">パスカルの原理（1本・定速で上げるとき）</div>`);
  const pasA = add(`<div style="position:absolute;left:894px;top:788px;font:700 17px Inter,${SANS};white-space:nowrap;line-height:1"></div>`);
  const pasB = add(`<div class="sm" style="position:absolute;left:894px;top:814px;font-size:12px;color:${C.sub};line-height:1.6;white-space:nowrap"></div>`);

  // ------------------------------------------------------------ footer, labels, the pointer
  add(`<div class="sm" style="position:absolute;left:358px;top:878px;font-size:11px;letter-spacing:.1em">仕組みの模型・寸法と数値は refs.md の仕様から計算・パレットの高さ 1 つの入力（時間の閉形式：加速・定速・減速）ですべてが動く</div>`);
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const pointer = ui.late();
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, ui.centre(n)]));

  const PMAX = 16; // MPa full scale on the chart
  const yOf = (p) => CH.h - (p / PMAX) * (CH.h - 2);
  const chartGrid = (pCar) => {
    const lim = (v, t, c) => `<line x1="0" x2="${CH.w}" y1="${yOf(v).toFixed(1)}" y2="${yOf(v).toFixed(1)}" stroke="${c}" stroke-width="1" stroke-dasharray="4 4"/><text x="${CH.w + 6}" y="${(yOf(v) + 4).toFixed(1)}" font-size="11" fill="${c}" font-family="${SANS}">${t}</text>`;
    return (
      `<line x1="0" x2="${CH.w}" y1="${CH.h}" y2="${CH.h}" stroke="${C.ink}" stroke-width="1"/>` +
      lim(SPEC.pRelief / 1e6, `安全弁 ${fx(SPEC.pRelief / 1e6, 1)}`, C.accent) +
      lim(pCar, `いまの車 ${fx(pCar, 2)}`, C.mute) +
      `<text x="${CH.w}" y="${CH.h + 13}" text-anchor="end" font-size="11" fill="${C.mute}" font-family="${SANS}">いま</text>` +
      `<text x="0" y="${CH.h + 13}" font-size="11" fill="${C.mute}" font-family="${SANS}">30 秒前</text>`
    );
  };

  return {
    btn,
    spots,
    root: ui.root,
    update(s) {
      const st = s.st;
      // 01 the state
      const moving = st.phase !== 'idle';
      const refused = st.refusal;
      stChip.textContent = refused ? '起動しない' : st.phaseName;
      stChip.style.background = refused ? C.accent : moving ? C.accent : st.latched ? C.ok : C.mute;
      stSub.textContent = refused
        ? `${refused.text}（インタロック）`
        : st.phase === 'up'
          ? 'ポンプが油を送り、プランジャが押し上げる'
          : st.phase === 'down'
            ? 'モーターは止まり、重さで下がる。弁が油の戻りを絞る'
            : st.phase === 'gateClose'
              ? 'ゲートが閉じるまで装置は動かない'
              : st.phase === 'gateOpen'
                ? 'ラッチが掛かってからゲートが開く'
                : st.phase === 'latch'
                  ? '上段のパレットの下にラッチを差し込む'
                  : st.phase === 'unlatch'
                    ? '油圧が重さを受け取ってからラッチを抜く'
                    : st.phase === 'stopping'
                      ? '逆止弁が油を閉じ込め、その場で止まる'
                      : st.latched
                        ? '上段はラッチが支えている（油圧 0）'
                        : st.atBottom
                          ? '格納中。枠はピットの受けに乗っている'
                          : '途中で停止。逆止弁が油を保っている';
      const IND = {
        person: [st.person, st.person ? '検知' : 'なし'],
        overhang: [st.overhang, st.overhang ? '検知' : 'なし'],
        gate: [st.gateMoving, st.gate > 0.999 ? '開' : st.gate < 0.001 ? '閉' : '動作'],
        latch: [st.latch > 0.001, st.latched ? '掛' : st.latch > 0.001 ? '動作' : '外'],
      };
      for (const [k] of SAFE) {
        const [on, txt] = IND[k];
        ind[k].style.background = on ? C.accent : 'transparent';
        ind[k].style.borderColor = on ? C.accent : C.faint;
        ind[`${k}T`].textContent = txt;
        ind[`${k}T`].style.color = on ? '#fff' : C.ink;
      }
      // 02 operation: the last button pressed rings for a moment; the shift button reads its state
      for (const k of OPS) onBtn(btn[`o_${k}`], s.opLit === k);
      btn.o_shift.textContent = st.shift ? '車を戻す' : OP_LABEL.shift;
      // 03 the weight
      for (const k of CARS) onBtn(btn[`c_${k}`], st.car === k);
      massLine.innerHTML = `車 ${kgs(st.carKg)} ＋ 可動部 ${kgs(SPEC.frameKg)} ＝ <b style="color:${C.ink}">${kgs(st.M)} kg</b><br>重いほど油圧が上がる・速さは変わらない`;
      note.textContent = s.note;
      // 05 instruments
      hMain.innerHTML = `${fx(st.hLower, 2)}${unit('m')}`;
      hBar.style.width = `${(st.open * 116).toFixed(1)}px`;
      hSub.textContent = st.atTop ? '下段が地上' : st.atBottom ? '上段が地上' : '移動中';
      vMain.innerHTML = `${st.v < -1e-6 ? '↓' : st.v > 1e-6 ? '↑' : ''}${fx(st.speedMM, 0)}${unit('mm/s')}`;
      vSub.textContent = `上限 ${SPEC.vLimit * 1000}`;
      pMain.innerHTML = `${fx(st.pMPa, 2)}${unit('MPa')}`;
      pBar.style.width = `${((Math.min(st.p, SPEC.pRelief) / SPEC.pRelief) * 126).toFixed(1)}px`;
      pBar.style.background = st.p > 0 ? C.accent : C.ink;
      pSub.textContent = `押す力 ${fx(st.F / 1000, 1)} kN／本・安全弁 ${fx(SPEC.pRelief / 1e6, 2)} MPa で開く`;
      wMain.innerHTML = `${fx(st.shaft / 1000, 2)}${unit('kW')}`;
      modeChip.textContent = st.regime;
      modeChip.style.background = st.regime === '力行' ? C.accent : st.regime === '自重' ? C.ok : C.mute;
      wSub.textContent = st.v < -1e-6 ? `弁で熱に ${fx(st.heat / 1000, 2)} kW` : `定格 ${SPEC.motorKW} kW の ${fx(st.load * 100, 0)} %・${fx(st.rpm, 0)} rpm`;
      tMain.innerHTML = `${fx(st.T / 1000, 2)}${unit('kN')}`;
      tBar.style.width = `${((Math.min(st.T, SPEC.chainBreak) / SPEC.chainBreak) * 126).toFixed(1)}px`;
      tBar.style.background = st.T > 0 ? C.accent : C.ink;
      tSub.textContent = st.T > 0 ? `引張強さ ${fx(SPEC.chainBreak / 1000, 1)} kN ÷ ${fx(st.factor, 2)}（${SPEC.chainFactor} 倍以上の決まり）` : '張っていない（受け・ラッチが支える）';
      qMain.innerHTML = `${fx(st.Lmin, 1)}${unit('L/min')}`;
      qSub.textContent = st.v > 1e-6 ? 'ポンプ → シリンダ' : st.v < -1e-6 ? 'シリンダ → タンク' : '流れていない';
      // 06–08 buttons
      for (const v of VIEWS) onBtn(btn[`v_${v}`], s.view === v);
      for (const i of ISOS) onBtn(btn[`i_${i}`], s.iso === i);
      for (const d of DISPLAY) onBtn(btn[`d_${d}`], !!s.display[d]);
      // 09 the pressure chart: s.hist holds MPa over the last 30 s, oldest first
      {
        const h = s.hist;
        let p = '';
        for (let i = 0; i < h.length; i++) p += `${i ? 'L' : 'M'}${((i / (h.length - 1)) * CH.w).toFixed(1)} ${yOf(h[i]).toFixed(1)}`;
        const area = `${p}L${CH.w} ${CH.h}L0 ${CH.h}Z`;
        chart.innerHTML = chartGrid(s.pCar) + `<path d="${area}" fill="${C.accent}" opacity=".14"/><path d="${p}" fill="none" stroke="${C.accent}" stroke-width="2.2"/><circle cx="${CH.w}" cy="${yOf(h[h.length - 1]).toFixed(1)}" r="4.5" fill="#fff" stroke="${C.accent}" stroke-width="2.2"/>`;
      }
      const pc = s.pCar;
      const u13 = (t) => `<span style="font-size:12px;font-weight:500"> ${t}</span>`;
      pasA.innerHTML = `F = p × A = ${fx(pc, 2)}${u13('MPa')} × ${fx(SPEC.area * 1e4, 1)}${u13('cm²')} = ${fx((pc * 1e6 * SPEC.area) / 1000, 1)}${u13('kN')}`;
      pasB.innerHTML = `2 本で分け、2:1 で力は倍 → 1 本で ${kgs(st.M)} kg 分<br>v = Q ÷ A = ${fx(SPEC.flow * 60000, 2)} L/min ÷ ${fx(SPEC.area * 1e4, 1)} cm² = ${fx(SPEC.vRated * 1000, 0)} mm/s`;
      // labels: a square, the name, the note, a thin leader to the part
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const right = lx > ax;
        const [ex, ey] = [right ? lx - 6 : lx + c.w + 6, ly + 9];
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
