// The pit two-level parking lift, built from code in metres (y up, 0 = the ground; x across the pallet; the entrance
// toward +z): the ground around a 2.9 × 5.9 m pit (the earth to the right of it comes off for the cutaway), the frame
// of two pallets joined by side posts, two single-acting plungers in the pit with a sprocket on each head and two
// chains over each (anchored on the barrel, hung on the lower pallet: 2:1), the power unit (tank, motor, pump, valves)
// with its pipes, the latches on two columns, the front gate, the boarding zone's area sensor, the end beams, the car
// and the person. update(s, look) poses it from kin.js's frame state: nothing here keeps time.
import * as THREE from 'three';
import {boxSpan} from '../building-kit/slice.js';
import {C} from '../building-kit/ui.js';
import {CARS, SPEC} from './kin.js';

const V3 = THREE.Vector3;
const S = SPEC;
const PW = S.palletW / 2; // 1.15
const PL = S.palletL / 2; // 2.80
/** layout of everything, metres; the callouts and the cameras read it too */
export const L = {
  pit: {x: 1.45, z: 2.95, floor: -(S.stroke + S.palletT + 0.2)}, // floor top −2.07
  earthY: -2.45,
  cutZ: [-1.9, 2.5], // the earth window the cutaway removes, right of the pit, out to cutX
  cutX: 6,
  postX: 1.2, // the frame's side posts
  postZ: 2.2,
  cylX: 1.33,
  cylZ: 0,
  barrelR: 0.06,
  barrelTop: -0.85,
  headY0: -0.62, // the plunger head (sprocket centre) with the frame down
  anchorY: -0.95,
  attachY0: -1.62, // the chain's hitch on the lower pallet, frame down
  sprR: S.sprocketR,
  colX: 1.4, // latch columns
  colZ: 2.45,
  colTop: 1.68,
  gateZ: S.gateZ,
  gateH: 1.9,
  beamY: 0.35,
  sensor: {x: -1.75, y: 1.05, z: 3.0},
  unit: {x0: 1.85, x1: 2.55, z0: -2.75, z1: -2.2, h: 0.5},
};
L.pawlY = S.stroke - S.palletT - 0.06 - S.latchGap; // the pawl's top face, 30 mm under the catch at the top
export const ISOS = ['hyd', 'chain'];
const ISO = {hyd: ['hyd'], chain: ['chain']};
// kept but half ghosted, so the isolated part reads in place
const PARTIAL = {hyd: {chain: 0.5, pallet: 0.7, safety: 0.7}, chain: {hyd: 0.5, pallet: 0.6, safety: 0.7}};

// moving marks along a run, in world y (chains) or along a tube's length (pipes): offset uOff, colour ramped by uK
function markRun(m, axis, pitch = 0.05, dark = 0.55) {
  const u = {value: 0};
  m.userData.uOff = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOff = u;
    const src = axis === 'uv' ? 'uv.x' : `(modelMatrix * vec4(transformed, 1.0)).${axis}`;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRun;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvRun = ${src};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRun;\nuniform float uOff;')
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat bx = vRun - uOff;\nfloat link = step(mod(bx, ${pitch.toFixed(3)}), ${(pitch * 0.42).toFixed(3)});\ndiffuseColor.rgb *= mix(1.0, ${dark.toFixed(2)}, link);`);
  };
  m.customProgramCacheKey = () => `run${axis}${m.uuid}`;
  return m;
}

export function buildLift() {
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
    sect: mk('earth', {color: '#cdbfa8', roughness: 0.92}),
    wall: mk('earth', {color: '#d8cdbb', roughness: 0.9}),
    floor: mk('earth', {color: '#c4b8a4', roughness: 0.9}),
    pallet: mk('pallet', {color: '#aab0b6', roughness: 0.5, metalness: 0.5}),
    palletDark: mk('pallet', {color: '#7c838b', roughness: 0.5, metalness: 0.45}),
    post: mk('pallet', {color: '#8b9198', roughness: 0.45, metalness: 0.55}),
    stop: mk('pallet', {color: '#e0b84a', roughness: 0.6}),
    barrel: mk('hyd', {color: '#59606a', roughness: 0.45, metalness: 0.55}, 'up'),
    plunger: mk('hyd', {color: '#c9ced3', roughness: 0.28, metalness: 0.85}),
    tank: mk('hyd', {color: '#6d7681', roughness: 0.5, metalness: 0.4}),
    motor: mk('hyd', {color: '#3e444c', roughness: 0.5, metalness: 0.4}, 'pump'),
    pump: mk('hyd', {color: '#7a828c', roughness: 0.4, metalness: 0.6}, 'pump'),
    valve: mk('hyd', {color: '#4b5560', roughness: 0.45, metalness: 0.5}, 'valve'),
    gaugeFace: mk('hyd', {color: '#f4f1ea', roughness: 0.4}),
    pipe: markRun(mk('hyd', {color: '#5d646d', roughness: 0.45, metalness: 0.5}, 'flow'), 'uv', 0.12, 0.4),
    head: mk('chain', {color: '#6e757d', roughness: 0.45, metalness: 0.55}),
    spr: mk('chain', {color: '#8d949b', roughness: 0.4, metalness: 0.7}, 'move'),
    chainA: markRun(mk('chain', {color: '#4a4e54', roughness: 0.55, metalness: 0.5}, 'move'), 'y', 0.0254, 0.5),
    chainF: markRun(mk('chain', {color: '#4a4e54', roughness: 0.55, metalness: 0.5}, 'move'), 'y', 0.0254, 0.5),
    chainW: mk('chain', {color: '#4a4e54', roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide}, 'move'),
    bracket: mk('chain', {color: '#5b6168', roughness: 0.5, metalness: 0.45}),
    col: mk('safety', {color: '#8a9097', roughness: 0.45, metalness: 0.55}),
    pawl: mk('safety', {color: '#e0b84a', roughness: 0.5, metalness: 0.3}, 'latch'),
    catch: mk('pallet', {color: '#6c7279', roughness: 0.5, metalness: 0.5}),
    gateFrame: mk('safety', {color: '#8f959c', roughness: 0.45, metalness: 0.55}, 'gate'),
    gateMesh: mk('safety', {color: '#9aa4ad', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6}),
    sensor: mk('safety', {color: '#3f444b', roughness: 0.45, metalness: 0.35}),
    lens: mk('safety', {color: '#22252a', roughness: 0.25, metalness: 0.2}, 'sens'),
    zone: mk('safety', {color: C.mute, transparent: true, opacity: 0.14, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4}, null, THREE.MeshBasicMaterial),
    beam: mk('safety', {color: '#b9aea0', transparent: true, opacity: 0.9}, null, THREE.MeshBasicMaterial),
    carBody: mk('car', {color: '#6d87a8', roughness: 0.35, metalness: 0.35}),
    carGlass: mk('car', {color: '#3a4552', roughness: 0.15, metalness: 0.2}),
    tyre: mk('car', {color: '#2a2c30', roughness: 0.8}),
    ped: mk('ped', {color: '#8b8f96', roughness: 0.8}),
    pedDark: mk('ped', {color: '#6c7077', roughness: 0.8}),
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
  const cyl = (parent, mat, r, [x, y, z], len, axis = 'y', seg = 28) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat));
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  };
  const G = {};

  // ------------------------------------------------------------ the earth: pit walls and sections (the ground's top is the stage's)
  const earth = new THREE.Group();
  root.add(earth);
  const P = L.pit;
  const E = 30;
  const eb = (xs, zs) => box(earth, M.sect, xs, [L.earthY, -0.01], zs, false);
  eb([-E, -P.x], [-E, E]);
  eb([-P.x, E], [-E, -P.z]);
  eb([-P.x, P.x], [P.z, E]);
  eb([P.x, E], [-P.z, L.cutZ[0]]);
  eb([P.x, E], [L.cutZ[1], E]);
  eb([L.cutX, E], [L.cutZ[0], L.cutZ[1]]);
  G.cutEarth = eb([P.x, L.cutX], [L.cutZ[0], L.cutZ[1]]);
  // the pit's lining (a thin skin so the walls read lighter than the cut earth) and its floor
  box(earth, M.wall, [-P.x, -P.x + 0.02], [P.floor, -0.01], [-P.z, P.z], false);
  box(earth, M.wall, [-P.x, P.x], [P.floor, -0.01], [-P.z, -P.z + 0.02], false);
  box(earth, M.wall, [-P.x, P.x], [P.floor, -0.01], [P.z - 0.02, P.z], false);
  G.cutWall = box(earth, M.wall, [P.x - 0.02, P.x], [P.floor, -0.01], [-P.z, P.z], false);
  box(earth, M.floor, [-P.x, P.x], [P.floor - 0.15, P.floor], [-P.z, P.z], false);
  // the stops the frame rests on at the bottom
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(earth, M.palletDark, [sx * 0.9 - 0.08, sx * 0.9 + 0.08], [P.floor, P.floor + 0.2], [sz * 2.3 - 0.1, sz * 2.3 + 0.1]);

  // ------------------------------------------------------------ the frame: two pallets and the side posts (moves as one)
  const frame = new THREE.Group();
  root.add(frame);
  G.frame = frame;
  const pallet = (top) => {
    const t0 = top - S.palletT;
    box(frame, M.pallet, [-PW, PW], [t0, top - 0.004], [-PL, PL]);
    // the deck: two shallow wheel lanes and the side curbs
    for (const s of [-1, 1]) {
      box(frame, M.palletDark, [s * PW - (s > 0 ? 0.08 : 0), s * PW + (s > 0 ? 0 : 0.08)], [top - 0.004, top + 0.05], [-PL, PL]);
      box(frame, M.palletDark, [s * 0.78 - 0.17, s * 0.78 + 0.17], [top - 0.006, top - 0.002], [-PL + 0.1, PL - 0.1], false);
    }
    // the wheel stop at the back
    box(frame, M.stop, [-0.95, 0.95], [top - 0.004, top + 0.07], [S.carRearZ - 0.1, S.carRearZ - 0.02]);
  };
  pallet(0); // the upper pallet's top at the frame's origin
  pallet(-S.stroke); // the lower one
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) box(frame, M.post, [sx * L.postX - 0.04, sx * L.postX + 0.04], [-S.stroke - S.palletT, 0.05], [sz * L.postZ - 0.06, sz * L.postZ + 0.06]);
  // side beams joining the posts under the upper pallet, with the latch catches
  for (const sx of [-1, 1]) {
    // its underside level with the catch, so the pawl clears it by the same 30 mm
    box(frame, M.post, [sx * L.postX - 0.04, sx * L.postX + 0.04], [-S.palletT - 0.06, -S.palletT], [-L.postZ, L.postZ]);
    box(frame, M.catch, sx > 0 ? [PW, 1.31] : [-1.31, -PW], [-S.palletT - 0.06, -S.palletT], [L.colZ - 0.06, L.colZ + 0.06]);
  }
  // the chain hitches on the lower pallet's sides
  for (const sx of [-1, 1]) box(frame, M.bracket, sx > 0 ? [PW, L.cylX + 0.03] : [-L.cylX - 0.03, -PW], [-S.stroke - S.palletT, L.attachY0 + 0.02], [L.cylZ + L.sprR - 0.03, L.cylZ + L.sprR + 0.04]);

  // ------------------------------------------------------------ the cylinders, heads, sprockets and chains
  const hyd = new THREE.Group();
  root.add(hyd);
  const chainG = new THREE.Group();
  root.add(chainG);
  const heads = [];
  const chainLegs = [];
  for (const sx of [-1, 1]) {
    const x = sx * L.cylX;
    const bl = L.barrelTop - P.floor;
    cyl(hyd, M.barrel, L.barrelR, [x, P.floor + bl / 2, L.cylZ], bl, 'y', 32);
    cyl(hyd, M.plunger, L.barrelR * 1.15, [x, L.barrelTop - 0.03, L.cylZ], 0.06, 'y', 32); // the gland
    cyl(hyd, M.barrel, L.barrelR * 1.25, [x, P.floor + 0.04, L.cylZ], 0.08, 'y', 32); // the base
    // the anchor bracket on the gland
    box(chainG, M.bracket, [x - 0.06, x + 0.06], [L.anchorY - 0.03, L.anchorY + 0.03], [L.cylZ - L.sprR - 0.03, L.cylZ - 0.05]);
    // the moving head: plunger, crosshead, sprocket (axis x), two chain wraps
    const h = new THREE.Group();
    root.add(h);
    const plen = 1.25;
    cyl(h, M.plunger, S.plungerD / 2, [x, -0.06 - plen / 2, L.cylZ], plen, 'y', 24);
    box(h, M.head, [x - 0.07, x + 0.07], [-0.07, -0.02], [-0.06, 0.06]);
    for (const dx of [-0.055, 0.055]) box(h, M.head, [x + dx - 0.008, x + dx + 0.008], [-0.06, 0.035], [-0.03, 0.03]);
    const spr = new THREE.Group();
    spr.position.set(x, 0, L.cylZ);
    h.add(spr);
    const disc = add(spr, new THREE.Mesh(new THREE.CylinderGeometry(L.sprR - 0.008, L.sprR - 0.008, 0.07, 32), M.spr));
    disc.rotation.z = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const sp = add(spr, new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.012, L.sprR * 1.7), M.head));
      sp.rotation.x = (k * Math.PI) / 3;
    }
    G[`spr${sx}`] = spr;
    for (const dx of [-0.025, 0.025]) {
      const w = add(h, new THREE.Mesh(new THREE.CylinderGeometry(L.sprR + 0.006, L.sprR + 0.006, 0.016, 24, 1, true, 0, Math.PI), M.chainW), false);
      // the open half-cylinder's arc (local x ≥ 0) turned to face up, its axis along x
      w.rotation.z = Math.PI / 2;
      w.position.set(x + dx, 0, L.cylZ);
      // legs: anchor side (−z, fixed links) and frame side (+z, moving with the frame); scaled in update()
      const a = add(chainG, new THREE.Mesh(new THREE.BoxGeometry(0.016, 1, 0.012), M.chainA), false);
      const f = add(chainG, new THREE.Mesh(new THREE.BoxGeometry(0.016, 1, 0.012), M.chainF), false);
      a.position.set(x + dx, 0, L.cylZ - L.sprR);
      f.position.set(x + dx, 0, L.cylZ + L.sprR);
      chainLegs.push({a, f});
    }
    heads.push(h);
  }
  G.heads = heads;

  // ------------------------------------------------------------ the power unit and the pipes
  const U = L.unit;
  box(hyd, M.tank, [U.x0, U.x1], [0, U.h], [U.z0, U.z1]);
  box(hyd, M.palletDark, [U.x0 - 0.02, U.x1 + 0.02], [U.h, U.h + 0.02], [U.z0 - 0.02, U.z1 + 0.02]);
  cyl(hyd, M.motor, 0.11, [2.28, U.h + 0.13, -2.58], 0.3, 'z', 32);
  for (let i = 0; i < 5; i++) cyl(hyd, M.pump, 0.116, [2.28, U.h + 0.13, -2.7 + 0.05 + i * 0.05], 0.008, 'z', 32);
  G.pump = cyl(hyd, M.pump, 0.07, [2.28, U.h + 0.13, -2.33], 0.1, 'z', 24);
  G.valve = box(hyd, M.valve, [1.88, 2.12], [U.h + 0.02, U.h + 0.2], [-2.36, -2.22]);
  // the pressure gauge on the valve block, facing the street
  const gauge = add(hyd, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 32), M.gaugeFace));
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(2.0, U.h + 0.3, -2.2);
  box(hyd, M.valve, [1.99, 2.01], [U.h + 0.2, U.h + 0.24], [-2.22, -2.2]);
  const needle = add(hyd, new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), M.valve), false);
  needle.geometry.translate(0, 0.022, 0);
  needle.position.set(2.0, U.h + 0.3, -2.188);
  G.needle = needle;
  const tube = (pts, r = 0.016) => {
    const path = new THREE.CurvePath();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(new V3(...pts[i - 1]), new V3(...pts[i])));
    const len = path.getLength();
    const g = new THREE.TubeGeometry(path, pts.length * 24, r, 8, false);
    // uv.x runs 0..1 along the tube: scale it to metres for the marks
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
    return add(hyd, new THREE.Mesh(g, M.pipe), false);
  };
  const yb = P.floor + 0.08;
  tube([[1.9, U.h + 0.1, -2.15], [1.6, U.h + 0.1, -2.15], [1.6, 0.04, -2.15], [1.41, 0.04, -2.15], [1.41, yb, -2.15], [1.41, yb, -0.12], [L.cylX, yb, -0.12], [L.cylX, yb, -0.065]]);
  tube([[L.cylX, yb, -0.12], [L.cylX, yb, 0.3], [-L.cylX, yb, 0.3], [-L.cylX, yb, 0.065]]);

  // ------------------------------------------------------------ safety: latch columns and pawls, the gate, the sensors
  const safety = new THREE.Group();
  root.add(safety);
  const pawls = [];
  for (const sx of [-1, 1]) {
    const x = sx * L.colX;
    box(safety, M.col, [x - 0.04, x + 0.04], [P.floor, L.colTop], [L.colZ - 0.04, L.colZ + 0.04]);
    box(safety, M.col, [x - 0.05, x + 0.05], [L.colTop, L.colTop + 0.02], [L.colZ - 0.05, L.colZ + 0.05]);
    // the pawl pivots on the column's inner face; in = horizontal under the catch, out = standing up
    const piv = new THREE.Group();
    piv.position.set(x - sx * 0.045, L.pawlY - 0.025, L.colZ);
    safety.add(piv);
    const pw = add(piv, boxSpan(M.pawl, sx > 0 ? [-0.22, 0.02] : [-0.02, 0.22], [-0.025, 0.025], [-0.06, 0.06]));
    pw.userData.sx = sx;
    pawls.push({piv, sx});
    cyl(safety, M.col, 0.02, [x - sx * 0.045, L.pawlY - 0.025, L.colZ], 0.1, 'z', 16);
  }
  G.pawls = pawls;
  // the gate: a header on two posts, two mesh leaves parting from the middle
  const GZ = L.gateZ;
  for (const sx of [-1, 1]) box(safety, M.gateFrame, [sx * 2.55 - 0.05, sx * 2.55 + 0.05], [0, L.gateH + 0.18], [GZ - 0.05, GZ + 0.05]);
  box(safety, M.gateFrame, [-2.6, 2.6], [L.gateH + 0.05, L.gateH + 0.18], [GZ - 0.06, GZ + 0.06]);
  const leaves = [-1, 1].map((sx) => {
    const g = new THREE.Group();
    safety.add(g);
    const x0 = sx > 0 ? 0 : -1.2;
    const x1 = sx > 0 ? 1.2 : 0;
    box(g, M.gateFrame, [x0, x1], [0.03, 0.08], [GZ - 0.02, GZ + 0.02]);
    box(g, M.gateFrame, [x0, x1], [L.gateH - 0.05, L.gateH], [GZ - 0.02, GZ + 0.02]);
    box(g, M.gateFrame, [x0, x0 + 0.05], [0.03, L.gateH], [GZ - 0.02, GZ + 0.02]);
    box(g, M.gateFrame, [x1 - 0.05, x1], [0.03, L.gateH], [GZ - 0.02, GZ + 0.02]);
    add(g, boxSpan(M.gateMesh, [x0 + 0.05, x1 - 0.05], [0.08, L.gateH - 0.05], [GZ - 0.004, GZ + 0.004]), false);
    return g;
  });
  G.leaves = leaves;
  // the boarding zone's area sensor on a post at the front left, its zone over the pallet at ground and the apron
  const Sn = L.sensor;
  box(safety, M.sensor, [Sn.x - 0.03, Sn.x + 0.03], [0, Sn.y], [Sn.z - 0.03, Sn.z + 0.03]);
  box(safety, M.sensor, [Sn.x - 0.07, Sn.x + 0.07], [Sn.y, Sn.y + 0.11], [Sn.z - 0.07, Sn.z + 0.07]);
  G.lens = box(safety, M.lens, [Sn.x + 0.07, Sn.x + 0.074], [Sn.y + 0.02, Sn.y + 0.09], [Sn.z - 0.05, Sn.z + 0.05]);
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(2 * PW, S.zoneZ1 - S.zoneZ0), M.zone);
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(0, 0.006, (S.zoneZ0 + S.zoneZ1) / 2);
  zone.renderOrder = 2;
  safety.add(zone);
  G.zone = zone;
  // the end beams: emitter posts outside the pit, a beam across each end of the pallet
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      box(safety, M.sensor, [sx * 1.55 - 0.03, sx * 1.55 + 0.03], [0, 0.48], [sz * S.beamZ - 0.03, sz * S.beamZ + 0.03]);
      box(safety, M.lens, [sx * 1.52 - 0.006, sx * 1.52 + 0.006], [L.beamY - 0.02, L.beamY + 0.02], [sz * S.beamZ - 0.02, sz * S.beamZ + 0.02]);
    }
    const b = cyl(safety, M.beam, 0.005, [0, L.beamY, sz * S.beamZ], 3.04, 'x', 8);
    b.castShadow = false;
  }

  // ------------------------------------------------------------ the car (one model per class), on the lower pallet
  const carRoot = new THREE.Group();
  root.add(carRoot);
  const cars = {};
  for (const k of CARS) {
    const c = S.cars[k];
    const g = new THREE.Group();
    carRoot.add(g);
    const r = 0.3;
    const lo = 0.16;
    box(g, M.carBody, [-c.W / 2, c.W / 2], [lo, 0.82], [-c.L / 2 + 0.05, c.L / 2 - 0.05]);
    box(g, M.carBody, [-c.W / 2 + 0.02, c.W / 2 - 0.02], [0.3, 0.74], [-c.L / 2, c.L / 2]);
    const cabL = k === 'kei' ? c.L * 0.72 : c.L * 0.5;
    const cabZ = k === 'kei' ? -0.05 : -0.12 * c.L;
    box(g, M.carGlass, [-c.W / 2 + 0.1, c.W / 2 - 0.1], [0.82, c.H - 0.04], [cabZ - cabL / 2, cabZ + cabL / 2]);
    box(g, M.carBody, [-c.W / 2 + 0.12, c.W / 2 - 0.12], [c.H - 0.05, c.H], [cabZ - cabL / 2 + 0.08, cabZ + cabL / 2 - 0.08]);
    const wb = k === 'kei' ? 1.23 : c.L * 0.31;
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) cyl(g, M.tyre, r, [sx * (c.W / 2 - 0.12), r, sz * wb], 0.2, 'x', 24);
    cars[k] = g;
  }
  G.cars = cars;

  // ------------------------------------------------------------ the person
  const pedG = new THREE.Group();
  root.add(pedG);
  const hipY = 0.86;
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.09, hipY, 0);
    pedG.add(hip);
    const leg = add(hip, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, hipY - 0.12, 4, 10), M.pedDark));
    leg.position.y = -hipY / 2;
    return hip;
  });
  const torso = add(pedG, new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 4, 12), M.ped));
  torso.scale.set(1, 1, 0.62);
  torso.position.y = 1.18;
  const sh = add(pedG, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.33, 4, 10), M.ped));
  sh.rotation.z = Math.PI / 2;
  sh.position.y = 1.42;
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.185, 1.42, 0);
    pedG.add(p);
    const a = add(p, new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.52, 4, 8), M.ped));
    a.position.y = -0.3;
    return p;
  });
  const head = add(pedG, new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), M.pedDark));
  head.scale.set(0.9, 1.1, 1);
  head.position.y = S.pedH - 0.11;
  G.ped = pedG;

  // ------------------------------------------------------------ ghosting and the accent
  const ghostNow = {};
  const setGhost = (sys, k) => {
    if (Math.abs((ghostNow[sys] ?? 0) - k) < 1e-3) return;
    const was = ghostNow[sys] ?? 0;
    ghostNow[sys] = k;
    for (const m of reg[sys]) {
      m.opacity = m.userData.op0 * (1 - (sys === 'earth' || sys === 'car' ? 0.94 : 0.85) * k);
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

  /**
   * s: kin.js frame state. look: {cut 0..1 (1 = the earth right of the pit removed), iso: {hyd, chain} 0..1}.
   */
  const update = (s, look = {}) => {
    const cut = (look.cut ?? 1) >= 0.5;
    G.cutEarth.visible = !cut;
    G.cutWall.visible = !cut;
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
    // the frame: the upper pallet's top at h
    frame.position.y = s.h;
    const yHead = L.headY0 + s.plunger;
    for (const h of heads) h.position.y = yHead;
    G['spr-1'].rotation.x = -s.sprocket;
    G.spr1.rotation.x = -s.sprocket;
    // chain legs: anchor (fixed) from the bracket up to the sprocket's back, frame leg from the hitch up to its front
    const yAtt = L.attachY0 + s.h;
    for (const {a, f} of chainLegs) {
      const la = yHead - L.anchorY;
      a.scale.y = la;
      a.position.y = L.anchorY + la / 2;
      const lf = yHead - yAtt;
      f.scale.y = Math.max(0.01, lf);
      f.position.y = yAtt + lf / 2;
    }
    // the frame-side links travel with the frame; the anchor side stands still
    M.chainA.userData.uOff.value = 0;
    M.chainF.userData.uOff.value = s.h;
    M.pipe.userData.uOff.value = -s.h * 4;
    // the accent: what works now. Up: the motor, pump, pipes, cylinders; down: the valve and the pipes; the chain while
    // it runs; the latch while it holds or moves; the gate while it moves
    const up = s.v > 1e-6 ? s.work : 0;
    const dn = s.v < -1e-6 ? s.work : 0;
    tint(M.motor, up * 0.9);
    tint(M.pump, up * 0.9);
    tint(M.barrel, Math.max(up, dn) * 0.6);
    tint(M.valve, Math.max(up * 0.5, dn) * 0.92);
    tint(M.pipe, Math.max(up, dn) * 0.85);
    tint(M.spr, s.work * 0.8);
    for (const m of [M.chainA, M.chainF, M.chainW]) tint(m, s.work * 0.85);
    tint(M.pawl, s.latch > 0 ? 0.92 : 0);
    tint(M.gateFrame, s.gateMoving ? 0.85 : 0);
    // the gauge needle: 0 at −135°, the relief pressure at +135°
    G.needle.rotation.z = -(-135 + (Math.min(s.p, S.pRelief) / S.pRelief) * 270) * (Math.PI / 180);
    // the latch pawls: out = standing up (90°), in = flat under the catch
    for (const {piv, sx} of pawls) piv.rotation.z = sx * (1 - s.latch) * (Math.PI / 2) * -1;
    // the gate leaves part from the middle
    leaves[0].position.x = -S.gateTravel * s.gate;
    leaves[1].position.x = S.gateTravel * s.gate;
    // the zone and the beams light when they detect
    M.zone.color.set(s.person ? C.accent : C.mute);
    M.zone.opacity = (s.person ? 0.32 : 0.14) * (1 - 0.85 * (ghostNow.safety ?? 0));
    M.beam.color.set(s.overhang ? C.accent : M.beam.userData.base);
    tint(M.lens, s.person || s.overhang ? 0.9 : 0);
    // the car: on the lower pallet, against the rear stop (or pushed past the front beam)
    for (const k of CARS) cars[k].visible = k === s.car;
    const c = S.cars[s.car];
    cars[s.car].position.set(0, s.hLower, s.carFront - c.L / 2);
    // the person: walking along z, legs swinging with the distance walked
    pedG.visible = !!s.ped;
    if (s.ped) {
      pedG.position.set(s.ped.x, 0, s.ped.z);
      pedG.rotation.y = s.ped.dir < 0 ? Math.PI : 0;
      const ph = (s.ped.z / 1.4) * Math.PI * 2;
      const amp = s.ped.walking ? 0.42 : 0;
      legs[0].rotation.x = Math.sin(ph) * amp;
      legs[1].rotation.x = -Math.sin(ph) * amp;
      arms[0].rotation.x = -Math.sin(ph) * amp * 0.7;
      arms[1].rotation.x = Math.sin(ph) * amp * 0.7;
    }
  };
  return {root, update, M, reg, all, G, L};
}
export {V3};
