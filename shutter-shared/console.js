// The shutter's console, laid out at 1600 x 900, all in Japanese: the title block; on the left the state with the push
// buttons (開ける・止める・閉める), the obstacle, the manual opening and a one-line explanation; on the right the
// instruments (opening, speed, coil radius, shaft torque, motor load with 力行/制動/保持), the views, the isolates and
// the display toggles; along the bottom the shaft torque over the whole stroke with the present point on it, and the
// last obstacle stop. update(s) redraws every live part from the frame's state; nothing here keeps time.
import {C, createChrome, MONO, SANS} from '../building-kit/ui.js';
import {holdTorque, SPEC, strokeTime, torqueCurve, torquePeak} from './kin.js';

export const VIEWS = ['all', 'drum', 'seat'];
export const VIEW_LABEL = {all: '全景', drum: '巻取り', seat: '座板'};
export const ISOS = ['drive', 'coil'];
export const ISO_LABEL = {drive: '開閉機', coil: '巻取り'};
export const DISPLAY = ['cut', 'labels'];
export const DISPLAY_LABEL = {cut: 'カットアウェイ', labels: 'ラベル'};
export const CMDS = ['open', 'stop', 'close'];
export const CMD_LABEL = {open: '開ける', stop: '止める', close: '閉める'};
const fx = (n, d) => (Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n).toFixed(d);
const unit = (u, px = 16) => `<span style="font-size:${px}px;font-weight:500"> ${u}</span>`;
const S = SPEC;
const STROKE = strokeTime();
const PEAK = torquePeak();

export function createConsole(app) {
  const ui = createChrome(app);
  const {add, panel, onBtn} = ui;
  const btn = {};

  // ------------------------------------------------------------ header (a pale band, so the close views never run under the type)
  add(`<div style="position:absolute;left:0;top:0;width:1600px;height:96px;background:linear-gradient(${C.bg}f0 78%, ${C.bg}00)"></div>`);
  add(`<div style="position:absolute;left:0;top:0;width:150px;height:92px;background:${C.accent}"></div>`);
  add(`<svg style="position:absolute;left:44px;top:16px" width="62" height="62" viewBox="0 0 62 62"><rect x="4" y="4" width="54" height="13" rx="2" fill="none" stroke="#fff" stroke-width="3"/><circle cx="31" cy="10.5" r="3.5" fill="#fff"/><rect x="8" y="17" width="3" height="41" fill="#fff"/><rect x="51" y="17" width="3" height="41" fill="#fff"/><path d="M12 24h38M12 31h38M12 38h38" stroke="#fff" stroke-width="2.4"/><rect x="11" y="42" width="40" height="5" fill="#fff"/></svg>`);
  add(`<div class="sm" style="position:absolute;left:172px;top:16px;letter-spacing:.12em">ビル設備のしくみ　03</div>`);
  add(`<div style="position:absolute;left:170px;top:34px;font:700 34px ${SANS};letter-spacing:.02em;line-height:1">電動シャッター <span style="color:${C.accent};font-weight:400">/</span> <span style="font-size:24px">重量シャッター・巻取り式</span></div>`);
  add(`<div style="position:absolute;left:172px;top:76px;font:500 14px ${SANS};color:${C.sub};letter-spacing:.04em">店舗正面・内のり ${S.W.toFixed(2)} × ${S.H.toFixed(2)} m・スラット ${S.slat.name}（鋼板 ${S.slat.t * 1000} mm）・三相 ${S.motorV} V ${S.motorKW} kW・スプリングなし</div>`);
  [['平均の速さ', fx(STROKE.vAvg, 1), 'm/min'], ['減速比', `1:${S.ratio}`, ''], ['感知から停止', `≤ ${S.stopMax * 1000}`, 'mm']].forEach(([k, v, u], i) => {
    const x = 1066 + i * 170;
    if (i) add(`<div style="position:absolute;left:${x - 14}px;top:30px;width:1px;height:44px;background:${C.faint}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:28px">${k}</div>`);
    add(`<div style="position:absolute;left:${x}px;top:48px;font:700 22px ${SANS};white-space:nowrap">${v}${u ? unit(u, 13) : ''}</div>`);
  });

  // ------------------------------------------------------------ 01 state and the push buttons
  panel(28, 108, 300, 206, '運転状態', '01');
  const stChip = add(`<div style="position:absolute;left:44px;top:144px;height:44px;padding:0 14px;border-radius:5px;display:flex;align-items:center;font:700 28px ${SANS};color:#fff;letter-spacing:.04em"></div>`);
  const stSub = add(`<div class="sm" style="position:absolute;left:44px;top:198px;font-size:13.5px;color:${C.sub}"></div>`);
  CMDS.forEach((k, i) => {
    btn[`c_${k}`] = add(`<div class="bt" style="left:${44 + i * 92}px;top:228px;width:84px;height:38px;font-size:15px">${CMD_LABEL[k]}</div>`);
  });
  add(`<div class="sm" style="position:absolute;left:44px;top:280px;font-size:11.5px">動いている間は逆向きのボタンが効かない（JIS）</div>`);

  // ------------------------------------------------------------ 02 the obstacle
  panel(28, 328, 300, 120, '障害物', '02');
  btn.obs = add(`<div class="bt" style="left:44px;top:364px;width:132px;height:36px">障害物を置く</div>`);
  const edgeChip = add(`<div style="position:absolute;left:186px;top:364px;width:126px;height:36px;border-radius:5px;border:1px solid ${C.faint};display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15"></div>`);
  add(`<div class="sm" style="position:absolute;left:44px;top:412px;font-size:11.5px;line-height:1.45;white-space:normal;width:270px">高さ ${S.obsH.toFixed(2)} m の箱（試験で人が挟まれる位置）。<br>座板のゴムが ${S.edgeComp * 1000} mm 押されるとスイッチが入る</div>`);

  // ------------------------------------------------------------ 03 the manual opening
  panel(28, 462, 300, 96, '開度を動かす（手動）', '03');
  const val = add(`<div style="position:absolute;left:180px;top:470px;width:132px;text-align:right;font:700 18px Inter,${SANS}"></div>`);
  const SL = {x: 50, w: 254, y: 516, min: 0, max: 1};
  add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y - 2}px;width:${SL.w}px;height:4px;border-radius:2px;background:#ebe2d4"></div>`);
  const fill = add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y - 2}px;height:4px;border-radius:2px;background:${C.accent}"></div>`);
  for (const [v, t, al] of [[0, '全閉', 'left'], [PEAK.h / S.H, 'トルク最大', 'left'], [1, '全開', 'right']]) {
    const x = SL.x + v * SL.w;
    add(`<div style="position:absolute;left:${x}px;top:${SL.y - 8}px;width:1.5px;height:16px;background:${C.ink}"></div>`);
    add(`<div class="sm" style="position:absolute;left:${al === 'left' ? x + (v ? 6 : -4) : x - 96}px;top:${SL.y + 10}px;width:100px;text-align:${al};font-size:11px">${t}</div>`);
  }
  const knob = add(`<div style="position:absolute;top:${SL.y - 9}px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#fff;border:2px solid ${C.accent};box-sizing:border-box"></div>`);

  // ------------------------------------------------------------ 04 note
  panel(28, 572, 300, 300, 'しくみ', '04');
  const note = add(`<div style="position:absolute;left:44px;top:604px;width:268px;font:500 13.5px/1.7 ${SANS};color:${C.ink}"></div>`);

  // ------------------------------------------------------------ 05 instruments
  panel(1262, 108, 310, 400, '計器', '05');
  const row = (y, label, line = true) => {
    add(`<div class="sm" style="position:absolute;left:1278px;top:${y}px">${label}</div>`);
    if (line) add(`<div style="position:absolute;left:1278px;top:${y + 64}px;width:278px;height:1px;background:${C.line}"></div>`);
  };
  const big = (x, y, w = 200) => add(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:700 28px Inter,${SANS};line-height:1;white-space:nowrap"></div>`);
  const sub = (x, y, w = 130) => add(`<div class="mo" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;text-align:right;font-size:12.5px;color:${C.sub};white-space:nowrap"></div>`);
  row(140, '開度');
  const oMain = big(1278, 162, 130);
  add(`<div style="position:absolute;left:1420px;top:172px;width:136px;height:6px;border-radius:3px;background:#ebe2d4"></div>`);
  const oBar = add(`<div style="position:absolute;left:1420px;top:172px;height:6px;border-radius:3px;background:${C.ink}"></div>`);
  const oSub = sub(1426, 184);
  row(210, 'カーテンの速さ');
  const vMain = big(1278, 232, 170);
  const vSub = sub(1426, 240);
  row(280, '巻取り半径（カーテンが離れる位置）');
  const rMain = big(1278, 302, 150);
  const rSub = sub(1426, 310);
  row(350, 'シャフトのトルク（吊り重量 × 半径）');
  const tMain = big(1278, 372, 160);
  const tSub = sub(1426, 380);
  row(420, 'モーターの負荷（定格比）', false);
  const lMain = big(1278, 442, 110);
  const modeChip = add(`<div style="position:absolute;left:1386px;top:436px;width:66px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 19px ${SANS};color:#fff"></div>`);
  const lSub = add(`<div class="mo" style="position:absolute;left:1460px;top:440px;width:100px;text-align:right;font-size:12px;color:${C.sub};line-height:1.35;white-space:nowrap"></div>`);
  add(`<div style="position:absolute;left:1278px;top:484px;width:278px;height:6px;border-radius:3px;background:#ebe2d4"></div>`);
  const lBar = add(`<div style="position:absolute;left:1278px;top:484px;height:6px;border-radius:3px;background:${C.ink}"></div>`);

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
      x += w + 8;
    }
  };
  panel(1262, 522, 310, 84, '視点', '06');
  btnRow(VIEWS, VIEW_LABEL, 'v_', 1276, 560);
  panel(1262, 620, 310, 84, '分離表示', '07');
  btnRow(ISOS, ISO_LABEL, 'i_', 1276, 658);
  panel(1262, 718, 310, 84, '表示', '08');
  btnRow(DISPLAY, DISPLAY_LABEL, 'd_', 1276, 756);

  // ------------------------------------------------------------ 09 the torque over the stroke, the last obstacle stop
  panel(352, 752, 886, 120, 'シャフトのトルクと開度（全行程・止まって吊っているとき）', '09');
  const CH = {x: 386, y: 798, w: 420, h: 46, tMax: 200};
  const xOf = (o) => CH.x + o * CH.w;
  const yOf = (T) => CH.y + CH.h - (T / CH.tMax) * CH.h;
  {
    const pts = torqueCurve(120).map((q) => `${xOf(q.open).toFixed(1)},${yOf(q.T).toFixed(1)}`);
    const pk = [xOf(PEAK.h / S.H), yOf(PEAK.T)];
    const T0 = holdTorque(0);
    const T1 = holdTorque(S.H);
    const tx = (x, y, t, a = 'start', c = C.mute) => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="11" fill="${c}" font-family="${SANS}">${t}</text>`;
    add(
      `<svg style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none" width="1600" height="900">` +
        `<line x1="${CH.x}" x2="${CH.x + CH.w}" y1="${CH.y + CH.h}" y2="${CH.y + CH.h}" stroke="${C.ink}" stroke-width="1"/>` +
        `<line x1="${CH.x}" x2="${CH.x}" y1="${CH.y}" y2="${CH.y + CH.h}" stroke="${C.faint}" stroke-width="1"/>` +
        [100, 200].map((v) => `<line x1="${CH.x}" x2="${CH.x + CH.w}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="${C.line}" stroke-dasharray="3 4"/>` + tx(CH.x - 6, yOf(v) + 4, v, 'end')).join('') +
        tx(CH.x - 6, CH.y + CH.h + 4, 0, 'end') +
        tx(CH.x, CH.y + CH.h + 14, '全閉 0 %') +
        tx(CH.x + CH.w, CH.y + CH.h + 14, '全開 100 %', 'end') +
        tx(CH.x + CH.w / 2, CH.y + CH.h + 14, '開度 →', 'middle') +
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.ink}" stroke-width="2"/>` +
        `<circle cx="${pk[0].toFixed(1)}" cy="${pk[1].toFixed(1)}" r="3" fill="${C.ink}"/>` +
        `<line x1="${pk[0].toFixed(1)}" x2="${pk[0].toFixed(1)}" y1="${(pk[1] + 4).toFixed(1)}" y2="${CH.y + CH.h - 4}" stroke="${C.ink}" stroke-dasharray="2 3"/>` +
        tx(pk[0] + 6, CH.y + CH.h - 6, `最大 ${PEAK.T.toFixed(0)} N·m（開度 ${((100 * PEAK.h) / S.H).toFixed(0)} %）`, 'start', C.ink) +
        tx(CH.x + 4, yOf(T0) + 15, `${T0.toFixed(0)}`, 'start') +
        tx(CH.x + CH.w + 10, yOf(T1) + 4, `${T1.toFixed(0)} N·m`, 'start') +
        `</svg>`,
    );
  }
  const dot = add(`<svg style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none" width="1600" height="900"></svg>`);
  add(`<div style="position:absolute;left:900px;top:766px;width:1px;height:96px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:918px;top:764px;font-size:13px;color:${C.ink};font-weight:700">障害物感知・触れてから止まるまで</div>`);
  const detMain = add(`<div style="position:absolute;left:918px;top:788px;font:700 30px Inter,${SANS};white-space:nowrap;line-height:1"></div>`);
  const detSub = add(`<div class="sm" style="position:absolute;left:918px;top:824px;font-size:12.5px;color:${C.sub};line-height:1.5;white-space:nowrap"></div>`);

  // ------------------------------------------------------------ footer, labels, the pointer
  add(`<div class="sm" style="position:absolute;left:358px;top:878px;font-size:11px;letter-spacing:.1em">仕組みの模型・寸法と数値は refs.md の仕様から計算・開度はシャフト角の閉形式（加速・定速・減速）と巻取りの渦巻きから出す</div>`);
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const pointer = ui.late();
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, ui.centre(n)]));
  spots.sl = (v) => [SL.x + v * SL.w, SL.y];

  return {
    btn,
    spots,
    root: ui.root,
    SL,
    update(s) {
      const st = s.st;
      // 01 state
      const moving = Math.abs(st.w) > 1e-6;
      stChip.textContent = st.stateName;
      stChip.style.background = st.kind === 'obs' || st.kind === 'rev' ? C.accent : moving ? C.accent : st.atClosed || st.atOpen ? C.ok : C.mute;
      stSub.textContent =
        st.kind === 'obs'
          ? '座板スイッチ → 0.05 秒でブレーキ'
          : st.kind === 'rev'
            ? '止まったあと少し上げて止まる'
            : st.kind === 'down'
              ? 'カーテンの重さで下りる・モーターは制動'
              : st.kind === 'up'
                ? 'モーターが持ち上げる（力行）'
                : st.kind === 'stopping'
                  ? '減速して止まる'
                  : `ブレーキが ${st.hangKg.toFixed(0)} kg を支えている`;
      for (const k of CMDS) onBtn(btn[`c_${k}`], s.lit === k);
      // 02 obstacle
      btn.obs.textContent = st.obsOn ? '障害物をどける' : '障害物を置く';
      onBtn(btn.obs, s.lit === 'obs');
      const sensing = st.comp >= S.edgeComp - 1e-6;
      edgeChip.style.background = sensing ? C.accent : 'transparent';
      edgeChip.style.borderColor = sensing ? C.accent : C.faint;
      edgeChip.innerHTML = `<span style="font:500 11px ${SANS};color:${sensing ? '#fff' : C.sub}">座板スイッチ</span><span style="font:700 16px ${SANS};color:${sensing ? '#fff' : C.mute}">${sensing ? '感知' : st.obsOn ? '監視中' : 'OFF'}</span>`;
      // 03 the opening slider
      const k = st.open;
      fill.style.width = `${(k * SL.w).toFixed(1)}px`;
      knob.style.left = `${(SL.x + k * SL.w).toFixed(1)}px`;
      val.innerHTML = `${fx(st.openPct, 0)}${unit('%', 13)}`;
      note.textContent = s.note;
      // 05 instruments
      oMain.innerHTML = `${fx(st.openPct, 0)}${unit('%')}`;
      oBar.style.width = `${(st.open * 136).toFixed(1)}px`;
      oSub.textContent = `座板の高さ ${fx(st.h, 2)} m`;
      const arrow = st.v > 1e-5 ? '↑' : st.v < -1e-5 ? '↓' : '';
      vMain.innerHTML = `<span style="color:${C.accent}">${arrow}</span>${fx(Math.abs(st.vMpm), 2)}${unit('m/min')}`;
      vSub.textContent = `シャフト ${fx(st.rpmShaft, 1)} rpm`;
      rMain.innerHTML = `${fx(st.rMM, 1)}${unit('mm')}`;
      rSub.textContent = `全閉から ${fx(st.turns, 2)} 回転`;
      tMain.innerHTML = `${fx(st.Ts, 0)}${unit('N·m')}`;
      tSub.textContent = `吊り ${fx(st.hangKg, 0)} kg`;
      lMain.innerHTML = `${fx(Math.abs(st.load) * 100, 0)}${unit('%')}`;
      modeChip.textContent = st.regime;
      modeChip.style.background = st.regime === '力行' ? C.accent : st.regime === '制動' ? C.ok : C.mute;
      lSub.innerHTML = st.regime === '保持' ? `ブレーキ保持<br>${fx(st.brakeT, 2)} N·m` : `モーター軸<br>${fx(Math.abs(st.Tm), 2)} N·m`;
      lBar.style.width = `${(Math.min(1, Math.abs(st.load)) * 278).toFixed(1)}px`;
      lBar.style.background = st.regime === '力行' ? C.accent : st.regime === '制動' ? C.ok : C.mute;
      // 06–08 buttons
      for (const v of VIEWS) onBtn(btn[`v_${v}`], s.view === v);
      for (const i of ISOS) onBtn(btn[`i_${i}`], s.iso === i);
      for (const d of DISPLAY) onBtn(btn[`d_${d}`], !!s.display[d]);
      // 09 the present point on the torque curve (standing torque at this opening; the gauge adds the acceleration)
      const T = holdTorque(st.h);
      const cx = xOf(st.open);
      dot.innerHTML = `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${CH.y - 2}" y2="${CH.y + CH.h}" stroke="${C.accent}" stroke-width="1" opacity=".6"/><circle cx="${cx.toFixed(1)}" cy="${yOf(T).toFixed(1)}" r="5" fill="#fff" stroke="${C.accent}" stroke-width="2.4"/>`;
      const e = st.det;
      if (!e) {
        detMain.innerHTML = `<span style="font-size:18px;color:${C.mute}">— 箱を置いて閉めると出ます</span>`;
        detSub.innerHTML = `基準 ${S.stopMax * 1000} mm 以下（告示）・押す力 ${S.forceMax} N 以下（JIS）`;
      } else {
        detMain.innerHTML = `${fx(e.dist * 1000, 1)}${unit('mm')}<span style="font:500 13px ${SANS};color:${C.sub}">　基準 ${S.stopMax * 1000} mm 以下</span>`;
        detSub.innerHTML = `感知 ${fx(e.v * 60, 2)} m/min・押し込み ${S.edgeComp * 1000} + 感知後 ${fx(e.after * 1000, 1)} mm<br>試験ばね ${S.testSpring} N/mm なら ${fx(e.dist * 1000 * S.testSpring, 0)} N（≤ ${S.pressMax} N）`;
      }
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
