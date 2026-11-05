// The electric shutter, built from code in metres (y up, 0 = the floor; x along the facade; the street toward +z): the
// shop front with its jambs and the fascia over the opening, which is the case's front cover the cutaway removes.
// Inside the case: the shaft on two bearings, the coil wound on it as a true spiral (one layer per turn, gaps between
// layers so the spiral reads from the end), the curtain running from the coil down through the lintel into the guide
// rails, the bottom bar with its sensing rubber and transmitter; at the +x end the 50T sprocket, the roller chain and
// the opener (15T sprocket, gearbox, motor, brake). The push-button box on the jamb, the shop inside, the 0.30 m box.
// update(s, look) poses it from kin.js's frame state: nothing here keeps time.
import * as THREE from 'three';
import {boxSpan} from '../building-kit/slice.js';
import {C} from '../building-kit/ui.js';
import {SPEC} from './kin.js';

const V3 = THREE.Vector3;
const S = SPEC;
const HW = S.W / 2; // 1.5: the clear opening between the rails
const CW = S.Wc / 2; // 1.6: the curtain runs 0.1 m into each rail
/** layout of everything, metres; the callouts and the cameras read it too */
export const L = {
  railX: HW + 0.14, // the rails' outer face = the jambs
  railZ: 0.045,
  wallZ0: -0.3,
  wallZ1: 0.08,
  wallX: 3.6,
  wallTop: 4.3,
  case: {x0: -1.84, x1: 2.46, y0: S.H, y1: S.H + 0.98, z0: -0.44, z1: 0.07},
  shaftY: S.yShaft,
  shaftZ: -0.13,
  shaftX0: -1.76,
  shaftX1: 1.93,
  bearX: 1.71,
  sprX: 1.87,
  motY: S.yShaft + 0.34,
  seatH: 0.06,
  edgeH: 0.025,
  obs: {x0: 0.12, x1: 0.57, z0: -0.2, z1: 0.2},
  btn: {x0: 2.5, x1: 2.68, y0: 1.0, y1: 1.32},
};
export const ISOS = ['drive', 'coil'];
// what each isolate keeps; PARTIAL keeps a system half ghosted so the isolated part reads in place
const ISO = {drive: ['drive', 'shaft'], coil: ['curtain', 'shaft', 'rail']};
const PARTIAL = {drive: {curtain: 0.6, rail: 0.7}, coil: {drive: 0.55}};

// slat joints every 74 mm along the curtain; s is the curtain coordinate (from the bottom edge up)
const SLAT_FRAG = `
float sf = fract(vS / ${S.slat.pitch.toFixed(4)});
float joint = 1.0 - smoothstep(0.0, 0.085, min(sf, 1.0 - sf));
diffuseColor.rgb *= (1.0 - 0.42 * joint) * (0.93 + 0.1 * sin(sf * 6.2832));`;
function slatMat(m, attr) {
  const u = {value: 0};
  m.userData.uBot = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBot = u;
    sh.vertexShader = attr
      ? sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aS;\nvarying float vS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;')
      : sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vS;\nuniform float uBot;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = (modelMatrix * vec4(transformed, 1.0)).y - uBot;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vS;').replace('#include <color_fragment>', `#include <color_fragment>\n${SLAT_FRAG}`);
  };
  m.customProgramCacheKey = () => `slat${attr ? 'A' : 'W'}${m.uuid}`;
  return m;
}

/** a sprocket with z teeth on pitch radius r, its axis along x */
function sprocketGeo(z, r, w) {
  const sh = new THREE.Shape();
  const ro = r + 0.0045;
  const ri = r - 0.004;
  for (let i = 0; i < z; i++) {
    const a = (i / z) * Math.PI * 2;
    const da = (Math.PI * 2) / z;
    const pts = [
      [ri, a],
      [ro, a + da * 0.3],
      [ro, a + da * 0.5],
      [ri, a + da * 0.8],
    ];
    pts.forEach(([rr, aa], k) => (i === 0 && k === 0 ? sh.moveTo(rr * Math.cos(aa), rr * Math.sin(aa)) : sh.lineTo(rr * Math.cos(aa), rr * Math.sin(aa))));
  }
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.35, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, {depth: w, bevelEnabled: false, curveSegments: 4});
  g.translate(0, 0, -w / 2);
  // shape x → −z, shape y → y, extrusion → x
  g.rotateY(Math.PI / 2);
  return g;
}

/** the chain's closed path round two sprockets (the convex hull of both pitch circles) in the (z, y) plane, CCW */
function chainPath(c1, r1, c2, r2) {
  const pts = [];
  for (const [c, r] of [[c1, r1], [c2, r2]]) for (let i = 0; i < 180; i++) pts.push([c[0] + r * Math.cos((i / 180) * Math.PI * 2), c[1] + r * Math.sin((i / 180) * Math.PI * 2)]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const cum = [0];
  for (let i = 1; i <= hull.length; i++) {
    const a = hull[i - 1];
    const b = hull[i % hull.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const len = cum[cum.length - 1];
  // position and direction at arc length u (wrapped)
  const at = (u) => {
    const x = ((u % len) + len) % len;
    let i = 0;
    while (cum[i + 1] < x) i++;
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const k = (x - cum[i]) / (cum[i + 1] - cum[i]);
    return {z: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, ang: Math.atan2(b[1] - a[1], b[0] - a[0])};
  };
  return {len, at};
}

export function buildShutter() {
  const root = new THREE.Group();
  const reg = {};
  const accent = new THREE.Color(C.accent);
  const mk = (sys, opts, acc = null, Ctor = THREE.MeshStandardMaterial) => {
    const m = new Ctor({...(Ctor === THREE.MeshBasicMaterial ? {} : {roughness: 0.6, metalness: 0, envMapIntensity: 0.6}), ...opts});
    (reg[sys] ||= []).push(m);
    m.userData.sys = sys;
    m.userData.base = m.color.clone();
    m.userData.acc = acc;
    m.userData.op0 = opts.opacity ?? 1;
    return m;
  };
  const M = {
    wall: mk('bldg', {color: '#d2c6b3', roughness: 0.85}),
    wallDark: mk('bldg', {color: '#cfc4b3', roughness: 0.85}),
    tile: mk('bldg', {color: '#e6dfd3', roughness: 0.8}),
    interior: mk('bldg', {color: '#e9e3d8', roughness: 0.9}),
    shelf: mk('bldg', {color: '#b9ad9a', roughness: 0.75}),
    goodsA: mk('bldg', {color: '#a9b7bf', roughness: 0.8}),
    goodsB: mk('bldg', {color: '#c7b79c', roughness: 0.8}),
    fascia: mk('case', {color: '#b8bcc1', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide}),
    caseIn: mk('case', {color: '#9fa4aa', roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide}),
    rail: mk('rail', {color: '#8e9399', roughness: 0.45, metalness: 0.6}),
    lintel: mk('rail', {color: '#7d8288', roughness: 0.45, metalness: 0.6}),
    slat: slatMat(mk('curtain', {color: '#aeb3b8', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide}), false),
    coil: slatMat(mk('curtain', {color: '#aeb3b8', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide}), true),
    coilEnd: mk('curtain', {color: '#5f656c', roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide}),
    seat: mk('curtain', {color: '#70757b', roughness: 0.45, metalness: 0.55}),
    edge: mk('curtain', {color: '#2f3135', roughness: 0.8}, 'sense'),
    tx: mk('curtain', {color: '#e2ddd3', roughness: 0.6}, 'sense'),
    shaft: mk('shaft', {color: '#7b8087', roughness: 0.4, metalness: 0.7}),
    bear: mk('shaft', {color: '#5c6167', roughness: 0.5, metalness: 0.5}),
    sprBig: mk('shaft', {color: '#62676e', roughness: 0.4, metalness: 0.7}, 'work'),
    sprSmall: mk('drive', {color: '#62676e', roughness: 0.4, metalness: 0.7}, 'work'),
    chain: mk('drive', {color: '#3a3d42', roughness: 0.55, metalness: 0.5}, 'work'),
    gear: mk('drive', {color: '#56606a', roughness: 0.5, metalness: 0.45}, 'work'),
    motor: mk('drive', {color: '#3f6f8f', roughness: 0.5, metalness: 0.35}, 'work'),
    motorLight: mk('drive', {color: '#8b9097', roughness: 0.4, metalness: 0.6}),
    brake: mk('drive', {color: '#4a4d52', roughness: 0.5, metalness: 0.45}, 'brake'),
    bracket: mk('drive', {color: '#80868d', roughness: 0.5, metalness: 0.5}),
    box: mk('obst', {color: '#c7a476', roughness: 0.85}),
    tape: mk('obst', {color: '#e8dcc4', roughness: 0.7}),
    panel: mk('panel', {color: '#d9d5cc', roughness: 0.6}),
    btnUp: mk('panel', {color: '#3d7fb0', roughness: 0.5}),
    btnStop: mk('panel', {color: '#c84b3a', roughness: 0.5}),
    btnDown: mk('panel', {color: '#3d7fb0', roughness: 0.5}),
  };
  const all = [];
  const add = (parent, mesh, cast = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    all.push(mesh);
    return mesh;
  };
  const box = (parent, mat, xs, ys, zs, cast = true) => add(parent, boxSpan(mat, xs, ys, zs), cast);
  const cylX = (parent, mat, r, x0, x1, y, z, seg = 32) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, seg), mat));
    m.rotation.z = Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, z);
    return m;
  };
  const G = {};
  const Cs = L.case;

  // ------------------------------------------------------------ the shop front
  const bldg = new THREE.Group();
  root.add(bldg);
  const WX = L.wallX;
  const [wz0, wz1] = [L.wallZ0, L.wallZ1];
  for (const s of [-1, 1]) {
    const xs = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    // the jamb below the case, the pier beside the case, a plinth
    box(bldg, M.wall, xs(L.railX, WX), [0, S.H], [wz0, wz1]);
    box(bldg, M.wall, xs(s > 0 ? Cs.x1 : -Cs.x0, WX), [S.H, Cs.y1], [wz0, wz1]);
    box(bldg, M.wallDark, xs(L.railX, WX), [0, 0.12], [wz1, wz1 + 0.012], false);
  }
  // over the case
  box(bldg, M.wall, [-WX, WX], [Cs.y1, L.wallTop], [wz0, wz1]);
  box(bldg, M.wallDark, [-WX, WX], [L.wallTop - 0.1, L.wallTop], [wz1, wz1 + 0.04]);
  // the shop inside: a back wall, side walls, a floor, two shelves and a counter
  box(bldg, M.interior, [-WX, WX], [0, 3.6], [-4.4, -4.3], false);
  for (const s of [-1, 1]) box(bldg, M.interior, s > 0 ? [WX - 0.1, WX] : [-WX, -WX + 0.1], [0, 3.6], [-4.3, wz0], false);
  box(bldg, M.tile, [-WX, WX], [-0.01, 0.0], [-4.3, wz0], false);
  for (const [x0, x1, z] of [[-2.6, -0.6, -3.2], [0.5, 2.6, -3.2]]) {
    for (const y of [0.05, 0.6, 1.15, 1.7]) box(bldg, M.shelf, [x0, x1], [y, y + 0.03], [z - 0.25, z + 0.25]);
    for (const x of [x0, x1 - 0.04]) box(bldg, M.shelf, [x, x + 0.04], [0, 1.75], [z - 0.25, z + 0.25]);
    for (let i = 0; i < 6; i++) {
      const bx = x0 + 0.12 + i * 0.32;
      for (const y of [0.08, 0.63, 1.18]) box(bldg, (i + Math.round(y * 10)) % 2 ? M.goodsA : M.goodsB, [bx, bx + 0.22], [y, y + 0.28 + ((i * 7) % 3) * 0.06], [z - 0.18, z + 0.12]);
    }
  }
  box(bldg, M.shelf, [-1.1, 0.4], [0, 0.95], [-1.9, -1.4]);

  // ------------------------------------------------------------ the case: fascia (the cutaway takes it off) and shell
  const shell = new THREE.Group();
  root.add(shell);
  box(shell, M.caseIn, [Cs.x0, Cs.x1], [Cs.y1 - 0.01, Cs.y1], [Cs.z0, Cs.z1]); // top
  box(shell, M.caseIn, [Cs.x0, Cs.x1], [Cs.y0, Cs.y1], [Cs.z0, Cs.z0 + 0.01]); // back
  for (const x of [Cs.x0, Cs.x1 - 0.01]) box(shell, M.caseIn, [x, x + 0.01], [Cs.y0, Cs.y1], [Cs.z0, Cs.z1]); // ends
  box(shell, M.caseIn, [Cs.x0, Cs.x1], [Cs.y0, Cs.y0 + 0.01], [Cs.z0, -0.03]); // soffit, a slot for the curtain
  const fascia = box(shell, M.fascia, [Cs.x0, Cs.x1], [Cs.y0, Cs.y1], [Cs.z1, Cs.z1 + 0.012]);
  G.fascia = fascia;

  // ------------------------------------------------------------ the guide rails and the lintel
  const rails = new THREE.Group();
  root.add(rails);
  for (const s of [-1, 1]) {
    const xs = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    box(rails, M.rail, xs(L.railX - 0.018, L.railX), [0, S.H], [-L.railZ, L.railZ]);
    for (const z of [L.railZ - 0.012, -L.railZ]) box(rails, M.rail, xs(HW, L.railX), [0, S.H], [z, z + 0.012]);
  }
  box(rails, M.lintel, [-L.railX, L.railX], [S.H - 0.03, S.H], [0.024, wz1]);
  box(rails, M.lintel, [-L.railX, L.railX], [S.H - 0.03, S.H], [wz0, -0.024]);

  // ------------------------------------------------------------ the shaft, bearings and the 50T sprocket (turn with p)
  const shaftG = new THREE.Group();
  shaftG.position.set(0, L.shaftY, L.shaftZ);
  root.add(shaftG);
  G.shaftG = shaftG;
  cylX(shaftG, M.shaft, S.r0, L.shaftX0, L.shaftX1, 0, 0, 40);
  // a key on the shaft ends and a band of paint, so the turn reads
  for (const [x0, x1] of [[CW + 0.01, L.bearX - 0.03], [L.shaftX0 + 0.02, -CW - 0.01]]) box(shaftG, M.bear, [x0, x1], [S.r0 - 0.004, S.r0 + 0.008], [-0.009, 0.009]);
  const big = add(shaftG, new THREE.Mesh(sprocketGeo(S.zShaft, S.rSprShaft, 0.012), M.sprBig));
  big.position.x = L.sprX;
  cylX(shaftG, M.bear, 0.035, L.sprX - 0.02, L.sprX + 0.02, 0, 0, 20);
  for (const x of [L.bearX, -L.bearX]) {
    // bearing housing and its bracket to the case back
    cylX(root, M.bear, S.r0 + 0.022, x - 0.025, x + 0.025, L.shaftY, L.shaftZ, 28);
    box(root, M.bear, [x - 0.012, x + 0.012], [L.shaftY - 0.08, L.shaftY + 0.08], [Cs.z0 + 0.01, L.shaftZ - 0.03]);
  }

  // ------------------------------------------------------------ the opener: 15T sprocket, gearbox, motor, brake
  const drive = new THREE.Group();
  root.add(drive);
  const small = add(drive, new THREE.Mesh(sprocketGeo(S.zMotor, S.rSprMotor, 0.012), M.sprSmall));
  small.position.set(L.sprX, L.motY, L.shaftZ);
  G.small = small;
  cylX(drive, M.motorLight, 0.012, L.sprX, 1.92, L.motY, L.shaftZ, 14);
  box(drive, M.gear, [1.92, 2.08], [L.motY - 0.1, L.motY + 0.1], [L.shaftZ - 0.1, L.shaftZ + 0.09]);
  box(drive, M.gear, [1.95, 2.05], [L.motY + 0.1, L.motY + 0.12], [L.shaftZ - 0.07, L.shaftZ + 0.06]);
  cylX(drive, M.motor, 0.072, 2.08, 2.33, L.motY, L.shaftZ, 36);
  for (let i = 0; i < 5; i++) cylX(drive, M.motorLight, 0.075, 2.11 + i * 0.045, 2.116 + i * 0.045, L.motY, L.shaftZ, 36);
  box(drive, M.motorLight, [2.15, 2.25], [L.motY + 0.07, L.motY + 0.11], [L.shaftZ - 0.04, L.shaftZ + 0.04]); // terminal box
  G.brake = cylX(drive, M.brake, 0.078, 2.33, 2.42, L.motY, L.shaftZ, 36);
  cylX(drive, M.motorLight, 0.03, 2.42, 2.44, L.motY, L.shaftZ, 20);
  // the bracket from the case back
  box(drive, M.bracket, [1.94, 2.4], [L.motY - 0.13, L.motY - 0.11], [Cs.z0 + 0.01, L.shaftZ + 0.08]);
  // the roller chain: links round the hull of both pitch circles
  const path = chainPath([0, 0], S.rSprShaft, [0, L.motY - L.shaftY], S.rSprMotor);
  const nLinks = Math.round(path.len / S.chainPitch);
  const linkGeo = new THREE.BoxGeometry(0.014, 0.006, S.chainPitch * 0.86);
  const links = new THREE.InstancedMesh(linkGeo, M.chain, nLinks);
  links.castShadow = true;
  links.position.set(L.sprX, L.shaftY, L.shaftZ);
  drive.add(links);
  all.push(links);
  const dummy = new THREE.Object3D();
  const setChain = (p) => {
    const off = p * S.rSprShaft;
    for (let i = 0; i < nLinks; i++) {
      const q = path.at((i / nLinks) * path.len + off);
      dummy.position.set(0, q.y, q.z);
      // the link's length runs along z: turn it about x to the path's direction in the (z, y) plane
      dummy.rotation.set(-q.ang, 0, 0);
      dummy.updateMatrix();
      links.setMatrixAt(i, dummy.matrix);
    }
    links.instanceMatrix.needsUpdate = true;
  };

  // ------------------------------------------------------------ the curtain: hanging part, the run up to the coil
  const curt = new THREE.Group();
  root.add(curt);
  const unitUp = new THREE.BoxGeometry(S.Wc, 1, 0.014);
  unitUp.translate(0, 0.5, 0);
  const hang = add(curt, new THREE.Mesh(unitUp, M.slat));
  const lead = add(curt, new THREE.Mesh(unitUp, M.slat));
  const seat = box(curt, M.seat, [-CW, CW], [0, L.seatH], [-0.022, 0.022]);
  // the sensing rubber: a unit box from y 0 to 1, scaled to its (squeezed) height
  const edgeGeo = new THREE.BoxGeometry(S.Wc, 1, 0.034);
  edgeGeo.translate(0, 0.5, 0);
  const edge = add(curt, new THREE.Mesh(edgeGeo, M.edge), false);
  const tx = box(curt, M.tx, [-0.55, -0.41], [0, 0.05], [0.022, 0.046]);
  // the coil: a spiral strip with thickness, its 4 faces (outer, inner, two ends) rebuilt every frame
  const DPS = 0.075; // radians per sample
  const NMAX = Math.ceil((2 * Math.PI * (0.16 - S.rc)) / S.layer / DPS) + 4;
  const coilGeo = new THREE.BufferGeometry();
  const posA = new Float32Array(NMAX * 8 * 3);
  const nrmA = new Float32Array(NMAX * 8 * 3);
  const sA = new Float32Array(NMAX * 8);
  coilGeo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  coilGeo.setAttribute('normal', new THREE.BufferAttribute(nrmA, 3));
  coilGeo.setAttribute('aS', new THREE.BufferAttribute(sA, 1));
  // the outer and inner faces first, then the two ends (a darker steel, so the spiral reads from the side)
  const idx = [];
  for (const faces of [[0, 1], [2, 3]])
    for (let i = 0; i < NMAX - 1; i++)
      for (const f of faces) {
        const a = i * 8 + f * 2;
        const b = a + 8;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  coilGeo.setIndex(idx);
  const HALF_IDX = (NMAX - 1) * 12;
  const coil = add(curt, new THREE.Mesh(coilGeo, [M.coil, M.coilEnd]));
  coil.frustumCulled = false;
  const DEPTH = 0.012; // the slat's drawn depth, less than the 18 mm layer so the layers show apart
  /** the coil from the take-off angle a0 over the wound length, its outer end at radius R; sOff: curtain s there */
  const setCoil = (R, a0, sOff) => {
    const total = (2 * Math.PI * (R - S.rc)) / S.layer; // radians of spiral
    const n = Math.min(NMAX, Math.max(2, Math.ceil(total / DPS) + 1));
    const cy = L.shaftY;
    const cz = L.shaftZ;
    for (let i = 0; i < n; i++) {
      const u = Math.min(total, i * DPS);
      const r = R - (S.layer * u) / (2 * Math.PI);
      const ang = a0 + u;
      const cz1 = Math.cos(ang);
      const sy1 = Math.sin(ang);
      const arc = R * u - (S.layer * u * u) / (4 * Math.PI);
      const ro = r + DEPTH / 2;
      const ri = r - DEPTH / 2;
      // faces: 0 outer, 1 inner, 2 end −x, 3 end +x; each a pair of vertices (left/right or in/out)
      const V = [
        [[-CW, ro], [CW, ro], [0, cz1, sy1]],
        [[CW, ri], [-CW, ri], [0, -cz1, -sy1]],
        [[-CW, ri], [-CW, ro], [-1, 0, 0]],
        [[CW, ro], [CW, ri], [1, 0, 0]],
      ];
      V.forEach(([p, q, nn], f) => {
        for (const [k, [x, rr]] of [[0, p], [1, q]]) {
          const j = (i * 8 + f * 2 + k) * 3;
          posA[j] = x;
          posA[j + 1] = cy + rr * sy1;
          posA[j + 2] = cz + rr * cz1;
          nrmA[j] = nn[0];
          nrmA[j + 1] = nn[1];
          nrmA[j + 2] = nn[2];
          sA[i * 8 + f * 2 + k] = sOff + arc;
        }
      });
    }
    coilGeo.clearGroups();
    coilGeo.addGroup(0, (n - 1) * 12, 0);
    coilGeo.addGroup(HALF_IDX, (n - 1) * 12, 1);
    coilGeo.attributes.position.needsUpdate = true;
    coilGeo.attributes.normal.needsUpdate = true;
    coilGeo.attributes.aS.needsUpdate = true;
  };

  // ------------------------------------------------------------ the push buttons on the jamb, the obstacle
  const panelG = new THREE.Group();
  root.add(panelG);
  const B = L.btn;
  box(panelG, M.panel, [B.x0, B.x1], [B.y0, B.y1], [wz1, wz1 + 0.035]);
  [[M.btnUp, B.y1 - 0.07], [M.btnStop, (B.y0 + B.y1) / 2], [M.btnDown, B.y0 + 0.07]].forEach(([m, y]) => {
    const c = add(panelG, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 20), m));
    c.rotation.x = Math.PI / 2;
    c.position.set((B.x0 + B.x1) / 2, y, wz1 + 0.043);
  });
  const obsG = new THREE.Group();
  root.add(obsG);
  const O = L.obs;
  const ox = (O.x0 + O.x1) / 2;
  obsG.position.set(ox, 0, 0);
  box(obsG, M.box, [O.x0 - ox, O.x1 - ox], [0, S.obsH], [O.z0, O.z1]);
  box(obsG, M.tape, [O.x0 - ox - 0.001, O.x1 - ox + 0.001], [S.obsH - 0.001, S.obsH + 0.001], [-0.03, 0.03], false);
  box(obsG, M.tape, [-0.03, 0.03], [S.obsH - 0.001, S.obsH + 0.001], [O.z0 - 0.001, O.z1 + 0.001], false);
  G.obsG = obsG;

  // ------------------------------------------------------------ ghosting and the accent
  const ghostNow = {};
  const setGhost = (sys, k) => {
    if (Math.abs((ghostNow[sys] ?? 0) - k) < 1e-3) return;
    const was = ghostNow[sys] ?? 0;
    ghostNow[sys] = k;
    for (const m of reg[sys]) {
      m.opacity = m.userData.op0 * (1 - (sys === 'bldg' || sys === 'case' ? 0.9 : 0.85) * k);
      const tr = k > 0.001 || m.userData.op0 < 1;
      const dw = k < 0.5 && m.userData.op0 >= 1;
      if (m.transparent !== tr || m.depthWrite !== dw || (was === 0) !== (k === 0)) {
        m.transparent = tr;
        m.depthWrite = dw;
        m.needsUpdate = true;
      }
    }
  };
  const tmpC = new THREE.Color();
  const tint = (m, w) => m.color.copy(tmpC.copy(m.userData.base).lerp(accent, w));
  // the lintel slot where the curtain enters the rails, and the tangent from it to a circle round the shaft
  const tangent = (r) => {
    const dz = 0 - L.shaftZ;
    const dy = S.H - L.shaftY;
    const d = Math.hypot(dz, dy);
    const base = Math.atan2(dy, dz);
    // the +z-side tangent point, seen from the slot
    return base + Math.acos(Math.min(1, r / d));
  };

  /**
   * s: kin.js frame state. look: {cut 0..1 (1 = the fascia off), iso: {drive, coil} 0..1}.
   */
  const update = (s, look = {}) => {
    fascia.visible = (look.cut ?? 1) < 0.5;
    const iso = look.iso || {};
    const ghost = Object.fromEntries(Object.keys(reg).map((k) => [k, 0]));
    for (const [key, k] of Object.entries(iso)) {
      if (k <= 0) continue;
      for (const sys of Object.keys(reg)) {
        const part = PARTIAL[key]?.[sys];
        if (part) ghost[sys] = Math.max(ghost[sys], k * part);
        else if (!ISO[key].includes(sys)) ghost[sys] = Math.max(ghost[sys], k);
      }
    }
    for (const sys of Object.keys(reg)) setGhost(sys, ghost[sys]);
    // the accent: the drive while it turns, the brake while it holds, the bottom edge while it senses
    for (const m of [M.sprBig, M.sprSmall, M.chain, M.gear, M.motor]) tint(m, s.work * 0.9);
    tint(M.brake, Math.max(s.brake * (1 - s.work), 0) * 0.85);
    const sense = s.det && s.sinceDet >= 0 && s.sinceDet < 2.2 ? 1 - Math.max(0, (s.sinceDet - 1.6) / 0.6) : 0;
    tint(M.edge, Math.max(sense, s.comp >= S.edgeComp - 1e-6 ? 1 : 0) * 0.95);
    tint(M.tx, sense * 0.9);

    const h = s.h;
    // the shaft and both sprockets turn with the shaft angle (raising turns the street side of the coil up)
    shaftG.rotation.x = -s.p;
    small.rotation.x = -s.p * (S.zShaft / S.zMotor);
    setChain(s.p);
    // the bottom bar, the sensing rubber (squeezed against the box), the transmitter
    const comp = Math.min(s.comp, L.edgeH - 0.006);
    edge.scale.y = L.edgeH - comp;
    edge.position.y = h + comp;
    seat.position.y = h + L.edgeH + L.seatH / 2;
    tx.position.y = h + L.edgeH + L.seatH + 0.025;
    // the hanging curtain: from the bar's top to the lintel
    const yb = h + L.edgeH + L.seatH;
    hang.position.y = yb;
    hang.scale.y = Math.max(1e-4, S.H - yb);
    hang.visible = S.H - yb > 1e-3;
    // the lead: lintel slot to the coil's tangent point
    const r = s.r;
    const at = tangent(r);
    const tz = L.shaftZ + r * Math.cos(at);
    const ty = L.shaftY + r * Math.sin(at);
    const dy = ty - S.H;
    const dz = tz - 0;
    lead.position.set(0, S.H, 0);
    lead.rotation.x = Math.atan2(dz, dy);
    lead.scale.y = Math.hypot(dy, dz);
    const sLead = S.H - h; // curtain coordinate at the slot (from the bottom edge, near enough)
    M.slat.userData.uBot.value = h;
    setCoil(r, at, sLead + Math.hypot(dy, dz));
    // the box pops in and out
    const e = s.obsK;
    obsG.visible = e > 0.01;
    obsG.scale.set(1, Math.max(0.01, 1 - Math.pow(1 - e, 3)), 1);
  };
  return {root, update, M, reg, all, G, L};
}
export {V3};
