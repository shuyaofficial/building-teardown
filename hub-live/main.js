// 入口のページ（GitHub Pages では docs/index.html）: Building Tools で組んだ10階建ての商業ビルがゆっくり回り、
// 各設備の位置に札が立つ。札を押すとその設備のページへ。縦長の画面では札を下に一覧で並べ、ビルには番号だけを打つ。
// ビルの形と札の位置は building/building.glb（building/make_building.py が書き出す）の anchor_* ノードから読む。
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {C, JP} from '../building-kit/ui.js';
import glb from '../building/building.glb';

// 札の中身。href は docs/ に並ぶ各ページへの相対リンク。href が無いものは準備中で押せない
const DEVICES = [
  {key: 'elevator', name: 'エレベーター', note: 'つり合いおもりとモーターのトルク、力行と回生', href: 'elevator-live.html'},
  {key: 'autodoor', name: '自動ドア', note: 'センサーの検出範囲と、着いたときのすき間', href: 'autodoor-live.html'},
  {key: 'shutter', name: 'シャッター', note: '巻き取りの半径と、降りる速さ・トルクの変わり方', href: 'shutter-live.html'},
  {key: 'parking', name: '立体駐車場', note: '載せた車の重さと、パレットを押し上げる油圧', href: 'parking-live.html'},
  {key: 'aircon', name: '空調', note: '屋上の室外機と冷媒の流れ', href: null},
];
const CREDITS = [
  ['teardown', 'https://github.com/elvarofficial/teardown', 'elvarofficial/teardown, MIT'],
  ['Building Tools', 'https://github.com/ranjian0/building_tools', 'ranjian0/building_tools, MIT'],
  ['three.js', 'https://github.com/mrdoob/three.js', 'MIT'],
];

const SPIN = 0.07; // rad/s。1周およそ90秒
const BUILDING_H = 42.5; // 屋上の機械室の上まで（m）
const BUILDING_R = 11.6; // 回したときの半径（m）

const CSS = `
html,body{background:${C.bg}}
#app{font-family:${JP};color:${C.ink};-webkit-font-smoothing:antialiased}
#gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.hub{position:absolute;inset:0;pointer-events:none}
.hd{position:absolute;left:28px;top:24px}
.hd h1{margin:0;display:flex;align-items:center;gap:10px;font:700 26px ${JP};letter-spacing:.06em}
.hd h1 i{display:block;width:4px;height:26px;background:${C.accent}}
.hd p{margin:8px 0 0 14px;font:500 14px ${JP};color:${C.sub};letter-spacing:.04em}
.lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.dot{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:${C.accent};color:#fff;
  font:700 12px Inter,${JP};display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(239,233,223,.85);transition:opacity .25s}
.dot.off{background:${C.mute}}
.tag{position:absolute;left:0;top:0;width:var(--tw);box-sizing:border-box;padding:10px 14px 11px;pointer-events:auto;text-decoration:none;color:${C.ink};
  background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(110,90,60,.10);transition:border-color .15s,box-shadow .15s,opacity .25s}
.tag b{display:flex;align-items:center;gap:8px;font:700 17px ${JP};letter-spacing:.05em}
.tag b em{font:700 11px Inter,${JP};font-style:normal;color:#fff;background:${C.accent};border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex:none}
.tag span{display:block;margin:4px 0 0 26px;font:500 13px/1.45 ${JP};color:${C.sub};letter-spacing:.02em}
.tag u{text-decoration:none;margin-left:auto;font:600 12px Inter,${JP};color:${C.accent};letter-spacing:.04em}
a.tag:hover,a.tag:focus-visible{border-color:${C.accent};box-shadow:0 3px 14px rgba(227,86,42,.18);outline:none}
.tag.soon{color:${C.mute};background:rgba(252,250,246,.82);cursor:default}
.tag.soon b em{background:${C.mute}}
.tag.soon u{color:${C.mute};border:1px solid ${C.faint};border-radius:3px;padding:1px 6px}
.tag.hid{opacity:.62}
.cr{position:absolute;right:20px;bottom:14px;font:500 11.5px Inter,${JP};color:${C.mute};letter-spacing:.02em;text-align:right;pointer-events:auto;line-height:1.6}
.cr a{color:${C.sub};text-decoration:none;border-bottom:1px solid ${C.faint}}
.cr a:hover{color:${C.accent};border-color:${C.accent}}
.list{display:none}
.tall .list{display:flex;flex-direction:column;gap:8px;position:absolute;left:14px;right:14px;bottom:52px;pointer-events:auto;overflow:auto}
.tall .list .tag{position:relative;width:auto;padding:9px 12px 10px}
.tall .float{display:none}
.tall .dot{width:18px;height:18px;margin:-9px 0 0 -9px;font-size:11px}
.tall .hd{left:16px;top:14px}
.tall .hd h1{font-size:20px}
.tall .hd h1 i{height:20px}
.tall .hd p{font-size:12px;margin-left:14px}
.tall .cr{left:14px;right:14px;bottom:10px;text-align:left;font-size:10.5px}
`;

function decodeGlb(src) {
  if (src.startsWith('url:')) return fetch(src.slice(4)).then((r) => r.arrayBuffer());
  const bin = atob(src);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Promise.resolve(bytes.buffer);
}

function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.Fog(C.bg, 120, 320);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 600);

  // elevator-shared/stage.js と同じ、淡い暖色のスタジオ（柔らかい箱の光を環境に焼く）
  const env = new THREE.Scene();
  env.background = new THREE.Color('#e9e1d3');
  const box = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.985, 0.96).multiplyScalar(k), side: THREE.DoubleSide}));
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(12, 12, new THREE.Vector3(0, 14, 2), 2.3);
  box(3, 14, new THREE.Vector3(12, 4, 6), 3.0);
  box(3, 14, new THREE.Vector3(-12, 4, -4), 1.8);
  box(18, 2, new THREE.Vector3(0, 2, 14), 1.5);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.02).texture;
  scene.environmentIntensity = 0.95;
  pm.dispose();

  const sun = new THREE.DirectionalLight('#fff6ea', 2.2);
  sun.position.set(0.62, 0.72, 0.32).multiplyScalar(80);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -32, right: 32, top: 32, bottom: -32, near: 20, far: 200});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#fffaf2', '#d6c4a4', 0.75));

  // 製図台のような淡い 1 m 方眼の地面。遠くは背景色に溶かす
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(160, 64),
    new THREE.ShaderMaterial({
      uniforms: {uG: {value: new THREE.Color('#e8dfd0')}, uM: {value: new THREE.Color('#d9cdb9')}, uBg: {value: new THREE.Color(C.bg)}},
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uG; uniform vec3 uM; uniform vec3 uBg; varying vec3 vW;
        void main(){
          vec2 g = abs(fract(vW.xz * 0.5 + 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.012, min(g.x, g.y));
          vec3 col = mix(uG, uM, line * 0.5);
          gl_FragColor = vec4(mix(col, uBg, smoothstep(22.0, 70.0, length(vW.xz))), 1.0);
          #include <colorspace_fragment>
        }`,
      toneMapped: false,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const shade = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.ShadowMaterial({color: '#6e5a40', opacity: 0.22}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.01;
  shade.receiveShadow = true;
  scene.add(shade);
  return {renderer, scene, camera};
}

/** 札（一覧用と浮かせる用の2組）と番号の点、引き出し線を作る。 */
function createTags(root) {
  const tagHtml = (d, i) => {
    const head = `<b><em>${i + 1}</em>${d.name}${d.href ? '<u>開く →</u>' : '<u>準備中</u>'}</b><span>${d.note}</span>`;
    return d.href ? `<a class="tag" href="${d.href}" data-key="${d.key}">${head}</a>` : `<div class="tag soon" aria-disabled="true" data-key="${d.key}">${head}</div>`;
  };
  const make = (h) => {
    const t = document.createElement('div');
    t.innerHTML = h.trim();
    return t.firstElementChild;
  };
  const float = make(`<div class="float"></div>`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lines');
  float.appendChild(svg);
  const items = DEVICES.map((d, i) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', '1.4');
    svg.appendChild(line);
    const dot = make(`<div class="dot">${i + 1}</div>`);
    const tag = make(tagHtml(d, i));
    float.append(dot, tag);
    return {d, dot, tag, line, side: 0, y: 0, x: 0, ready: false};
  });
  const list = make(`<div class="list">${DEVICES.map(tagHtml).join('')}</div>`);
  root.append(float, list);
  return {items, list, float};
}

export async function runHub() {
  document.documentElement.lang = 'ja';
  document.title = '商業ビルの動く設備 — 3Dで分解して見る';
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const ui = document.createElement('div');
  ui.className = 'hub';
  ui.innerHTML = `<div class="hd"><h1><i></i>商業ビルの動く設備</h1><p>札を押すと、その設備を分解して動かせるページが開きます</p></div>
    <div class="cr">出典: ${CREDITS.map(([n, u, l]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>（${l}）`).join(' ・ ')}</div>`;
  app.appendChild(ui);
  const {items, list} = createTags(ui);

  const {renderer, scene, camera} = createStage(canvas);
  const gltf = await new Promise((ok, ng) => decodeGlb(glb).then((buf) => new GLTFLoader().parse(buf, '', ok, ng), ng));
  const building = gltf.scene;
  const meshes = [];
  building.traverse((o) => {
    if (!o.isMesh) return;
    // GLB は法線を持たない（軽くするため）。頂点を面ごとに分けてから法線を出すと、平らな陰影になる
    if (!o.geometry.attributes.normal) {
      o.geometry = o.geometry.toNonIndexed();
      o.geometry.computeVertexNormals();
    }
    o.castShadow = true;
    o.receiveShadow = true;
    meshes.push(o);
  });
  const spinner = new THREE.Group();
  spinner.add(building);
  scene.add(spinner);
  const anchors = items.map((it) => building.getObjectByName(`anchor_${it.d.key}`));
  if (anchors.some((a) => !a)) throw new Error('building.glb に anchor_* が足りない');

  // 札に触れている間は回転を止める
  let hover = 0;
  for (const el of [...items.map((it) => it.tag), ...list.children]) {
    el.addEventListener('pointerenter', () => hover++);
    el.addEventListener('pointerleave', () => (hover = Math.max(0, hover - 1)));
  }
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const size = {w: 0, h: 0, tall: false, areaTop: 0, areaH: 0, tw: 300};
  const resize = () => {
    const w = app.clientWidth;
    const h = app.clientHeight;
    const tall = w / h < 0.85 || w < 640;
    ui.classList.toggle('tall', tall);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 3D を置く帯: 横長は見出しの下から全部、縦長は見出しと一覧のあいだ
    const hd = ui.querySelector('.hd');
    const top = hd.offsetTop + hd.offsetHeight + (tall ? 22 : 14);
    const bottom = tall ? list.offsetHeight + 60 : 34;
    const areaH = Math.max(160, h - top - bottom);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dH = (BUILDING_H * 1.08 * h) / (areaH * 2 * tan);
    const dW = (BUILDING_R * 2.25 * h) / (w * (tall ? 0.95 : 0.5) * 2 * tan);
    Object.assign(size, {w, h, tall, areaTop: top, areaH, d: Math.max(dH, dW), tw: Math.round(Math.min(320, Math.max(250, w * 0.19)))});
    ui.style.setProperty('--tw', `${size.tw}px`);
    // 帯の真ん中にビルの中ほどが来るよう、画面の中心をずらす
    camera.setViewOffset(w, h, 0, h / 2 - (top + areaH / 2), w, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const project = (p) => {
    v.copy(p).project(camera);
    return [(v.x * 0.5 + 0.5) * size.w, (-v.y * 0.5 + 0.5) * size.h];
  };
  const occluded = (p) => {
    const dist = camera.position.distanceTo(p);
    ray.set(camera.position, v.copy(p).sub(camera.position).normalize());
    ray.far = dist - 0.3;
    return ray.intersectObjects(meshes, false).length > 0;
  };

  // 浮かせる札の配置: ビルの左右の列に分け、点の高さに合わせて上から詰める（重なれば下へずらす）
  const layout = () => {
    const [cx] = project(centre.set(0, BUILDING_H / 2, 0));
    const gap = 10;
    const colOff = Math.min(size.w * 0.36, BUILDING_R * (size.h / (2 * size.d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) + 70);
    const pts = items.map((it, i) => {
      const p = anchors[i].getWorldPosition(new THREE.Vector3());
      const [x, y] = project(p);
      const hid = occluded(p);
      // 中心線から 24px 以上はみ出たら左右を入れ替える（行ったり来たりしないように）
      if (!it.ready || Math.abs(x - cx) > 24) it.side = x < cx ? -1 : 1;
      return {it, x, y, hid, h: it.tag.offsetHeight};
    });
    for (const side of [-1, 1]) {
      const col = pts.filter((p) => p.it.side === side).sort((a, b) => a.y - b.y);
      let floor = size.areaTop + 8;
      for (const p of col) {
        p.ty = Math.max(floor, Math.min(p.y - p.h / 2, size.h - 46 - p.h));
        floor = p.ty + p.h + gap;
      }
      // 下にはみ出したら上へ押し戻す
      let ceil = size.h - 46;
      for (const p of [...col].reverse()) {
        if (p.ty + p.h > ceil) p.ty = ceil - p.h;
        ceil = p.ty - gap;
      }
    }
    for (const p of pts) {
      const {it} = p;
      const tx = p.it.side < 0 ? cx - colOff - size.tw : cx + colOff;
      const k = it.ready ? 0.18 : 1; // 札はなめらかに追う
      it.x += (tx - it.x) * k;
      it.y += (p.ty - it.y) * k;
      it.ready = true;
      it.tag.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
      it.tag.classList.toggle('hid', p.hid);
      it.dot.style.left = `${p.x.toFixed(1)}px`;
      it.dot.style.top = `${p.y.toFixed(1)}px`;
      it.dot.style.opacity = p.hid ? '0.45' : '1';
      it.dot.classList.toggle('off', !it.d.href);
      const ex = it.side < 0 ? it.x + size.tw : it.x;
      const ey = it.y + 22;
      const knee = it.side < 0 ? ex + 14 : ex - 14;
      it.line.setAttribute('points', `${p.x.toFixed(1)},${p.y.toFixed(1)} ${knee.toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
      it.line.setAttribute('stroke', it.d.href ? C.accent : C.mute);
      it.line.setAttribute('stroke-dasharray', p.hid ? '3 4' : '');
      it.line.setAttribute('opacity', p.hid ? '0.5' : '0.9');
    }
  };
  // 縦長: ビルには番号の点だけ
  const dotsOnly = () => {
    items.forEach((it, i) => {
      const p = anchors[i].getWorldPosition(new THREE.Vector3());
      const [x, y] = project(p);
      it.dot.style.left = `${x.toFixed(1)}px`;
      it.dot.style.top = `${y.toFixed(1)}px`;
      it.dot.style.opacity = occluded(p) ? '0.45' : '1';
      it.dot.classList.toggle('off', !it.d.href);
    });
  };
  // 縦長のときは点だけを残すため、点を一覧の外に出しておく
  const floatRoot = items[0].dot.parentElement;
  const dotLayer = document.createElement('div');
  dotLayer.className = 'dots';
  ui.insertBefore(dotLayer, floatRoot);
  const placeDots = (tall) => {
    const host = tall ? dotLayer : floatRoot;
    for (const it of items) if (it.dot.parentElement !== host) host.appendChild(it.dot);
  };

  let angle = -0.55;
  let last = performance.now();
  const hub = {frames: 0, ready: false, angle: 0};
  window.HUB = hub;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!hover && !still) angle += SPIN * dt;
    spinner.rotation.y = angle;
    const el = THREE.MathUtils.degToRad(size.tall ? 14 : 11);
    camera.position.set(0, BUILDING_H / 2 + size.d * Math.sin(el), size.d * Math.cos(el));
    camera.lookAt(0, BUILDING_H / 2, 0);
    camera.updateMatrixWorld();
    spinner.updateMatrixWorld(true);
    placeDots(size.tall);
    if (size.tall) dotsOnly();
    else layout();
    renderer.render(scene, camera);
    hub.frames++;
    hub.angle = angle;
    hub.ready = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

runHub().catch((e) => {
  const app = document.getElementById('app');
  const p = document.createElement('p');
  p.style.cssText = `position:absolute;left:24px;top:24px;font:500 14px ${JP};color:${C.ink}`;
  p.textContent = `3D の表示に失敗しました: ${e.message}`;
  app.appendChild(p);
  throw e;
});
