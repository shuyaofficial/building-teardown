// The automatic door, built from code in metres (y up, 0 = the floor; x along the facade; the street toward +z): the
// glass facade with its two FIX panels, the two sliding leaves (frame and glass) in the plane z = 0 running in front
// of the FIX panels, and the 無目 (the header box) over them, whose front cover the cutaway removes. Inside the header:
// the rail, two hanger rollers per leaf, one toothed belt looped round a drive pulley (gearbox 1:12, DC motor) and an
// idler, and the clamps (left leaf on the upper run, right leaf on the lower one). The start sensors on both faces of
// the header with their floor zones, the auxiliary beams across the opening, the walkers. update(s, look) poses it
// from kin.js's frame state: nothing here keeps time.
import * as THREE from 'three';
import {boxSpan} from '../building-kit/slice.js';
import {C} from '../building-kit/ui.js';
import {SPEC} from './kin.js';

const V3 = THREE.Vector3;
const S = SPEC;
const HALF = S.openW / 2; // 0.8
/** layout of everything, metres; the callouts and the cameras read it too */
export const L = {
  doorTop: S.openH, // 2.10
  hdr: {x: 1.75, y0: S.openH, y1: 2.46, z0: -0.2, z1: 0.1}, // the 無目
  railY: 2.19, // the rail's top
  railZ: 0.03, // in front of the hanger plates, so the rollers show from the street side
  rollR: 0.025,
  beltZ: -0.075,
  pulY: 2.33, // pulley centres
  pulX: 1.5, // drive at +x, idler at −x
  pulR: S.pulleyD / 2,
  motor: {x0: 1.0, x1: 1.4, y: 2.375, z: -0.14, r: 0.035},
  gear: {x0: 1.4, x1: 1.6, y0: 2.27, y1: 2.43, z0: -0.185, z1: -0.095},
  fixZ: -0.07, // FIX panels sit behind the leaves
  beamZ: 0.05, // the auxiliary beams run just outside the leaves
  sensY: 2.17,
  facadeX: 3.6,
};
L.runTop = L.pulY + L.pulR; // the belt's upper run
L.runBot = L.pulY - L.pulR; // its lower run
export const ISOS = ['engine', 'belt', 'sensor'];
const ISO = {engine: ['engine', 'belt'], belt: ['belt', 'leaf', 'engine'], sensor: ['sensor', 'ped', 'leaf']};
// kept but half ghosted, so the isolated part reads in place
const PARTIAL = {engine: {belt: 0.55}, belt: {leaf: 0.5, engine: 0.6}, sensor: {leaf: 0.55}};
export const MAX_PEDS = 7;

// a moving belt run: dark teeth every 5 mm would alias, so paint marks every 50 mm and a white one every 250 mm, both
// travelling with the run (world x plus the run's displacement)
function markBelt(m) {
  const u = {value: 0};
  m.userData.uOff = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOff = u;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWx;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWx = (modelMatrix * vec4(transformed, 1.0)).x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWx;\nuniform float uOff;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat bx = vWx + uOff;\nfloat tooth = step(mod(bx, 0.05), 0.012);\nfloat mk = step(mod(bx, 0.25), 0.02);\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.9 + 0.06, tooth * 0.55);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.96, 0.93), mk);',
      );
  };
  m.customProgramCacheKey = () => `beltmark${m.uuid}`;
  return m;
}

export function buildDoor() {
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
  const glass = (sys, color, op) => mk(sys, {color, roughness: 0.12, metalness: 0.1, transparent: true, opacity: op, depthWrite: false, envMapIntensity: 0.9});
  const M = {
    alu: mk('bldg', {color: '#a7abb0', roughness: 0.45, metalness: 0.55}),
    aluDark: mk('bldg', {color: '#6f747b', roughness: 0.48, metalness: 0.5}),
    stone: mk('bldg', {color: '#ddd5c8', roughness: 0.85}),
    hdr: mk('bldg', {color: '#b9bcc0', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide}),
    glass: glass('glass', '#b9d3dc', 0.22),
    leafFrame: mk('leaf', {color: '#8d9298', roughness: 0.42, metalness: 0.6}),
    leafGlass: glass('leaf', '#a9cbd6', 0.26),
    rail: mk('belt', {color: '#9a9ea4', roughness: 0.4, metalness: 0.7}),
    hanger: mk('belt', {color: '#a3a8ae', roughness: 0.45, metalness: 0.55}),
    roller: mk('belt', {color: '#2f3237', roughness: 0.55, metalness: 0.2}),
    clamp: mk('belt', {color: '#4a4d52', roughness: 0.5, metalness: 0.4}, 'work'),
    beltTop: markBelt(mk('belt', {color: '#34363a', roughness: 0.7}, 'work')),
    beltBot: markBelt(mk('belt', {color: '#34363a', roughness: 0.7}, 'work')),
    beltWrap: mk('belt', {color: '#34363a', roughness: 0.7, side: THREE.DoubleSide}, 'work'),
    motor: mk('engine', {color: '#3d4148', roughness: 0.48, metalness: 0.45}, 'work'),
    motorLight: mk('engine', {color: '#8b9097', roughness: 0.4, metalness: 0.6}),
    gear: mk('engine', {color: '#55595f', roughness: 0.5, metalness: 0.5}, 'work'),
    pulley: mk('engine', {color: '#6c7178', roughness: 0.38, metalness: 0.7}, 'work'),
    ctrl: mk('engine', {color: '#d6d3cc', roughness: 0.6}),
    sensor: mk('sensor', {color: '#4b4f56', roughness: 0.5, metalness: 0.3}),
    sensorLens: mk('sensor', {color: '#22252a', roughness: 0.25, metalness: 0.2}, 'sens'),
    zone: mk('sensor', {color: C.mute, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4}, null, THREE.MeshBasicMaterial),
    zoneIn: mk('sensor', {color: C.mute, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4}, null, THREE.MeshBasicMaterial),
    band: mk('sensor', {color: '#8a7f70', transparent: true, opacity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6}, null, THREE.MeshBasicMaterial),
    beam: mk('sensor', {color: '#b9aea0', transparent: true, opacity: 0.9}, null, THREE.MeshBasicMaterial),
    post: mk('sensor', {color: '#55595f', roughness: 0.5, metalness: 0.4}),
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
  const cylX = (parent, mat, r, x0, x1, y, z, seg = 32) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, seg), mat));
    m.rotation.z = Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, z);
    return m;
  };
  const cylZ = (parent, mat, r, x, y, z0, z1, seg = 24) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, seg), mat));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, (z0 + z1) / 2);
    return m;
  };
  const G = {};

  // ------------------------------------------------------------ the facade
  const bldg = new THREE.Group();
  root.add(bldg);
  const H = L.hdr;
  const FX = L.facadeX;
  const topY = 3.6;
  // stone plinth strips either side, the floor guide under the leaves
  box(bldg, M.stone, [-FX - 0.3, FX + 0.3], [-0.02, 0.0], [-0.35, 0.25], false);
  box(bldg, M.alu, [-HALF - S.leafW, HALF + S.leafW], [0, 0.006], [-0.012, 0.012], false);
  // jambs at the opening's edges, behind the leaves; FIX panels between the jambs and the outer mullions
  for (const s of [-1, 1]) {
    const xs = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    box(bldg, M.aluDark, xs(HALF, HALF + 0.06), [0, H.y0], [L.fixZ - 0.04, L.fixZ + 0.04]);
    box(bldg, M.alu, xs(HALF + 0.06, 1.7), [0, 0.1], [L.fixZ - 0.03, L.fixZ + 0.03]);
    add(bldg, boxSpan(M.glass, xs(HALF + 0.06, 1.7), [0.1, H.y0], [L.fixZ - 0.005, L.fixZ + 0.005]), false);
    box(bldg, M.aluDark, xs(1.7, 1.8), [0, topY], [L.fixZ - 0.05, L.fixZ + 0.05]);
    // the curtain wall beyond, one more bay
    add(bldg, boxSpan(M.glass, xs(1.8, FX - 0.05), [0.1, topY - 0.15], [L.fixZ - 0.005, L.fixZ + 0.005]), false);
    box(bldg, M.alu, xs(1.8, FX - 0.05), [0, 0.1], [L.fixZ - 0.03, L.fixZ + 0.03]);
    box(bldg, M.alu, xs(1.8, FX - 0.05), [H.y0 + 0.3, H.y0 + 0.36], [L.fixZ - 0.03, L.fixZ + 0.03]);
    box(bldg, M.aluDark, xs(FX - 0.05, FX + 0.05), [0, topY], [L.fixZ - 0.05, L.fixZ + 0.05]);
  }
  // transom glass over the header, the beam on top
  add(bldg, boxSpan(M.glass, [-1.7, 1.7], [H.y1, topY - 0.15], [L.fixZ - 0.005, L.fixZ + 0.005]), false);
  box(bldg, M.aluDark, [-FX - 0.05, FX + 0.05], [topY - 0.15, topY], [L.fixZ - 0.06, L.fixZ + 0.06]);

  // ------------------------------------------------------------ the 無目 (header box)
  const hdr = new THREE.Group();
  root.add(hdr);
  G.hdr = hdr;
  box(hdr, M.hdr, [-H.x, H.x], [H.y1 - 0.012, H.y1], [H.z0, H.z1]); // top
  box(hdr, M.hdr, [-H.x, H.x], [H.y0, H.y1], [H.z0, H.z0 + 0.008]); // back
  box(hdr, M.hdr, [-H.x, H.x], [H.y0, H.y0 + 0.012], [H.z0, -0.012]); // soffit, a slot for the hangers
  box(hdr, M.hdr, [-H.x, H.x], [H.y0, H.y0 + 0.012], [0.012, H.z1]);
  for (const s of [-1, 1]) box(hdr, M.hdr, s > 0 ? [H.x - 0.008, H.x] : [-H.x, -H.x + 0.008], [H.y0, H.y1], [H.z0, H.z1]);
  // the front cover, the part the cutaway takes off
  const cover = box(hdr, M.hdr, [-H.x, H.x], [H.y0, H.y1], [H.z1 - 0.008, H.z1]);
  G.cover = cover;
  // the rail, carried on a web that stands on the soffit in front of the hanger slot
  box(hdr, M.rail, [-H.x + 0.03, H.x - 0.03], [L.railY - 0.02, L.railY], [L.railZ - 0.012, L.railZ + 0.012]);
  box(hdr, M.rail, [-H.x + 0.03, H.x - 0.03], [H.y0 + 0.012, L.railY - 0.02], [L.railZ - 0.004, L.railZ + 0.004]);

  // ------------------------------------------------------------ the engine: motor, gearbox, pulleys, controller
  const eng = new THREE.Group();
  root.add(eng);
  G.eng = eng;
  const Mo = L.motor;
  cylX(eng, M.motor, Mo.r, Mo.x0 + 0.03, Mo.x1, Mo.y, Mo.z, 36);
  cylX(eng, M.motorLight, Mo.r * 0.8, Mo.x0, Mo.x0 + 0.03, Mo.y, Mo.z, 28); // the end cap
  for (let i = 0; i < 6; i++) cylX(eng, M.motorLight, Mo.r * 1.04, Mo.x0 + 0.08 + i * 0.045, Mo.x0 + 0.088 + i * 0.045, Mo.y, Mo.z, 36); // cooling ribs
  const Gb = L.gear;
  box(eng, M.gear, [Gb.x0, Gb.x1], [Gb.y0, Gb.y1], [Gb.z0, Gb.z1]);
  box(eng, M.gear, [Gb.x0 + 0.02, Gb.x1 - 0.02], [Gb.y1, Gb.y1 + 0.012], [Gb.z0 + 0.01, Gb.z1 - 0.01]);
  box(eng, M.motorLight, [Gb.x0 - 0.004, Gb.x0], [Mo.y - 0.045, Mo.y + 0.045], [Mo.z - 0.045, Mo.z + 0.045]); // flange
  cylZ(eng, M.motorLight, 0.007, L.pulX, L.pulY, Gb.z1, L.beltZ + 0.016, 12); // output shaft
  const pulley = (x, drive) => {
    const g = new THREE.Group();
    g.position.set(x, L.pulY, L.beltZ);
    eng.add(g);
    const c = add(g, new THREE.Mesh(new THREE.CylinderGeometry(L.pulR - 0.0015, L.pulR - 0.0015, 0.022, 32), M.pulley));
    c.rotation.x = Math.PI / 2;
    for (const dz of [-0.012, 0.012]) {
      const f = add(g, new THREE.Mesh(new THREE.CylinderGeometry(L.pulR + 0.006, L.pulR + 0.006, 0.002, 32), M.pulley));
      f.rotation.x = Math.PI / 2;
      f.position.z = dz;
    }
    // a spoke mark on the outer face so the turn reads
    const sp = add(g, new THREE.Mesh(new THREE.BoxGeometry(L.pulR * 1.7, 0.004, 0.002), drive ? M.motorLight : M.motorLight));
    sp.position.z = 0.0135;
    const dot = add(g, new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.002), M.sensorLens));
    dot.position.set(L.pulR * 0.6, 0, 0.0145);
    return g;
  };
  const pulD = pulley(L.pulX, true);
  const pulI = pulley(-L.pulX, false);
  G.pulD = pulD;
  G.pulI = pulI;
  // the idler's bracket and tensioner
  box(eng, M.gear, [-L.pulX - 0.03, -L.pulX + 0.03], [L.pulY - 0.04, L.pulY + 0.04], [H.z0 + 0.008, L.beltZ - 0.014]);
  cylZ(eng, M.motorLight, 0.005, -L.pulX, L.pulY, L.beltZ - 0.014, L.beltZ + 0.016, 10);
  // the controller
  G.ctrl = box(eng, M.ctrl, [-1.3, -0.7], [2.36, 2.44], [-0.185, -0.105]);
  box(eng, M.aluDark, [-1.25, -1.1], [2.392, 2.41], [-0.106, -0.102]);

  // ------------------------------------------------------------ the belt: two runs and the two wraps
  const belt = new THREE.Group();
  root.add(belt);
  const bw = 0.02;
  const bt = 0.003;
  const runTop = box(belt, M.beltTop, [-L.pulX, L.pulX], [L.runTop - bt / 2, L.runTop + bt / 2], [L.beltZ - bw / 2, L.beltZ + bw / 2], false);
  const runBot = box(belt, M.beltBot, [-L.pulX, L.pulX], [L.runBot - bt / 2, L.runBot + bt / 2], [L.beltZ - bw / 2, L.beltZ + bw / 2], false);
  G.runTop = runTop;
  G.runBot = runBot;
  for (const s of [-1, 1]) {
    const w = add(belt, new THREE.Mesh(new THREE.CylinderGeometry(L.pulR + bt / 2, L.pulR + bt / 2, bw, 24, 1, true, s > 0 ? 0 : Math.PI, Math.PI), M.beltWrap), false);
    w.rotation.x = Math.PI / 2;
    w.position.set(s * L.pulX, L.pulY, L.beltZ);
  }

  // ------------------------------------------------------------ the leaves, their hangers and clamps
  const leaves = [-1, 1].map((s) => {
    const g = new THREE.Group();
    root.add(g);
    const w2 = S.leafW / 2;
    const t2 = S.leafT / 2;
    const y0 = 0.012;
    const y1 = L.doorTop;
    box(g, M.leafFrame, [-w2, -w2 + 0.05], [y0, y1], [-t2, t2]);
    box(g, M.leafFrame, [w2 - 0.05, w2], [y0, y1], [-t2, t2]);
    box(g, M.leafFrame, [-w2 + 0.05, w2 - 0.05], [y1 - 0.08, y1], [-t2, t2]);
    box(g, M.leafFrame, [-w2 + 0.05, w2 - 0.05], [y0, 0.11], [-t2, t2]);
    add(g, boxSpan(M.leafGlass, [-w2 + 0.05, w2 - 0.05], [0.11, y1 - 0.08], [-0.006, 0.006]), false);
    // the meeting stile's rubber edge
    const lead = s < 0 ? w2 : -w2;
    box(g, M.aluDark, s < 0 ? [lead - 0.006, lead] : [lead, lead + 0.006], [y0 + 0.02, y1 - 0.02], [-t2 + 0.006, t2 - 0.006]);
    // the hanger plate with two rollers on the rail
    box(g, M.hanger, [-w2 + 0.08, w2 - 0.08], [y1, y1 + 0.16], [-0.006, 0.006]);
    const rollers = [-0.27, 0.27].map((x) => {
      cylZ(g, M.hanger, 0.006, x, L.railY + L.rollR, 0.006, L.railZ, 10);
      return cylZ(g, M.roller, L.rollR, x, L.railY + L.rollR, L.railZ - 0.011, L.railZ + 0.011, 24);
    });
    // the clamp: up from the plate, back over the rail and the rollers to its run of the belt
    const run = s < 0 ? L.runTop : L.runBot;
    const cx = s < 0 ? -0.1 : 0.1;
    box(g, M.clamp, [cx - 0.012, cx + 0.012], [y1 + 0.15, run + 0.008], [-0.006, 0.006]);
    box(g, M.clamp, [cx - 0.012, cx + 0.012], [run - 0.008, run + 0.008], [L.beltZ + 0.012, 0.006]);
    box(g, M.clamp, [cx - 0.025, cx + 0.025], [run - 0.009, run + 0.009], [L.beltZ - 0.016, L.beltZ + 0.016]);
    return {g, rollers, clampX: cx};
  });
  G.leaves = leaves;

  // ------------------------------------------------------------ sensors: start sensors, zones, auxiliary beams
  const sens = new THREE.Group();
  root.add(sens);
  const sensBox = (side) => {
    const z = side > 0 ? H.z1 : H.z0;
    const zs = side > 0 ? [z, z + 0.05] : [z - 0.05, z];
    box(sens, M.sensor, [-0.13, 0.13], [L.sensY - 0.03, L.sensY + 0.04], zs);
    return box(sens, side > 0 ? M.sensorLens : M.sensorLens, [-0.1, 0.1], [L.sensY - 0.036, L.sensY - 0.03], side > 0 ? [z + 0.01, z + 0.045] : [z - 0.045, z - 0.01]);
  };
  G.sensOut = sensBox(1);
  G.sensIn = sensBox(-1);
  const zone = (mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    m.renderOrder = 2;
    sens.add(m);
    return m;
  };
  const zOut = zone(M.zone);
  const zIn = zone(M.zoneIn);
  const band = zone(M.band);
  band.scale.set(S.openW, 2 * S.auxBand, 1);
  band.position.y = 0.005;
  // zone outlines and the sensor's view lines to the far corners
  const lineMat = (c, o) => {
    const m = new THREE.LineBasicMaterial({color: c, transparent: true, opacity: o, depthWrite: false});
    (reg.sensor ||= []).push(m);
    m.userData = {sys: 'sensor', base: m.color.clone(), acc: null, op0: o, line: true};
    return m;
  };
  const outlineOf = (mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(5 * 3), 3));
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    sens.add(l);
    return l;
  };
  const lOut = outlineOf(lineMat(C.sub, 0.7));
  const lIn = outlineOf(lineMat(C.sub, 0.7));
  const viewGeo = (n) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    return geo;
  };
  const vOut = new THREE.LineSegments(viewGeo(8), lineMat(C.mute, 0.35));
  const vIn = new THREE.LineSegments(viewGeo(8), lineMat(C.mute, 0.35));
  for (const l of [vOut, vIn]) {
    l.frustumCulled = false;
    sens.add(l);
  }
  // the auxiliary beams: posts at the opening's edges just outside the leaves, two beams across
  for (const s of [-1, 1]) {
    box(sens, M.post, s > 0 ? [HALF + 0.005, HALF + 0.045] : [-HALF - 0.045, -HALF - 0.005], [0, 1.12], [L.beamZ - 0.02, L.beamZ + 0.02]);
    for (const h of S.auxH) box(sens, M.sensorLens, s > 0 ? [HALF, HALF + 0.006] : [-HALF - 0.006, -HALF], [h - 0.012, h + 0.012], [L.beamZ - 0.012, L.beamZ + 0.012]);
  }
  const beams = S.auxH.map((h) => cylX(sens, M.beam, 0.0045, -HALF, HALF, h, L.beamZ, 8));
  beams.forEach((b) => (b.castShadow = false));

  // ------------------------------------------------------------ walkers: a pool of simple figures
  const pedRoot = new THREE.Group();
  root.add(pedRoot);
  const figs = Array.from({length: MAX_PEDS}, () => {
    const g = new THREE.Group();
    g.visible = false;
    pedRoot.add(g);
    const hipY = 0.86;
    const legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.09, hipY, 0);
      g.add(hip);
      const leg = add(hip, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, hipY - 0.12, 4, 10), M.pedDark));
      leg.position.y = -hipY / 2;
      return hip;
    });
    const torso = add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 4, 12), M.ped));
    torso.scale.set(1, 1, 0.62);
    torso.position.y = 1.18;
    // shoulders: 0.45 m across at y = 1.42
    const sh = add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, S.pedShoulder - 0.12, 4, 10), M.ped));
    sh.rotation.z = Math.PI / 2;
    sh.position.y = 1.42;
    const arms = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * (S.pedShoulder / 2 - 0.04), 1.42, 0);
      g.add(p);
      const a = add(p, new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.52, 4, 8), M.ped));
      a.position.y = -0.3;
      return p;
    });
    const neck = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), M.pedDark));
    neck.position.y = 1.5;
    const head = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), M.pedDark));
    head.scale.set(0.9, 1.1, 1);
    head.position.y = S.pedH - 0.11;
    return {g, legs, arms};
  });
  // ------------------------------------------------------------ ghosting and the accent
  const ghostNow = {};
  const setGhost = (sys, k) => {
    if (Math.abs((ghostNow[sys] ?? 0) - k) < 1e-3) return;
    const was = ghostNow[sys] ?? 0;
    ghostNow[sys] = k;
    for (const m of reg[sys]) {
      m.opacity = m.userData.op0 * (1 - (sys === 'bldg' || sys === 'glass' ? 0.9 : 0.85) * k);
      const tr = k > 0.001 || m.userData.op0 < 1 || !!m.userData.line;
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
  const setLine = (l, pts) => {
    const a = l.geometry.attributes.position.array;
    pts.forEach((p, i) => a.set(p, i * 3));
    l.geometry.attributes.position.needsUpdate = true;
  };

  /**
   * s: kin.js frame state. look: {cut 0..1 (1 = the header's front cover off), iso: {engine, belt, sensor} 0..1}.
   */
  const update = (s, look = {}) => {
    cover.visible = (look.cut ?? 1) < 0.5;
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
    // the accent: the drive while the door moves
    for (const sys of ['engine', 'belt']) for (const m of reg[sys]) if (m.userData.acc === 'work') tint(m, s.work * 0.92);
    // leaves: the left one moves −x, the right one +x, by the same travel
    leaves.forEach((lf, i) => {
      const sgn = i === 0 ? -1 : 1;
      // a closed leaf spans [−0.85, 0] or [0, 0.85]: its 0.05 m beyond the opening laps the jamb (the 重なり)
      lf.g.position.x = sgn * (S.leafW / 2 + s.x);
      for (const r of lf.rollers) r.rotation.y = (-sgn * s.x) / L.rollR;
    });
    // belt marks move with the runs (upper −x as it opens, lower +x); the pulleys turn counter-clockwise from the front
    M.beltTop.userData.uOff.value = s.x;
    M.beltBot.userData.uOff.value = -s.x;
    pulD.rotation.z = s.pulleyAngle;
    pulI.rotation.z = s.pulleyAngle;
    // the start sensors' zones, lit while their (delayed) output is on
    const W2 = S.detW / 2;
    const D = s.D;
    zOut.scale.set(S.detW, D, 1);
    zOut.position.z = D / 2;
    zIn.scale.set(S.detW, D, 1);
    zIn.position.z = -D / 2;
    for (const [mat, on] of [[M.zone, s.sOut], [M.zoneIn, s.sIn]]) {
      mat.color.set(on ? C.accent : C.mute);
      mat.opacity = (on ? 0.3 : 0.16) * (1 - 0.85 * (ghostNow.sensor ?? 0));
    }
    const y = 0.006;
    setLine(lOut, [[-W2, y, 0], [W2, y, 0], [W2, y, D], [-W2, y, D], [-W2, y, 0]]);
    setLine(lIn, [[-W2, y, 0], [W2, y, 0], [W2, y, -D], [-W2, y, -D], [-W2, y, 0]]);
    const so = [0, L.sensY - 0.04, L.hdr.z1 + 0.03];
    const si = [0, L.sensY - 0.04, L.hdr.z0 - 0.03];
    setLine(vOut, [so, [-W2, 0, D], so, [W2, 0, D], so, [-W2, 0, 0.02], so, [W2, 0, 0.02]]);
    setLine(vIn, [si, [-W2, 0, -D], si, [W2, 0, -D], si, [-W2, 0, -0.02], si, [W2, 0, -0.02]]);
    vOut.material.color.set(s.sOut ? C.accent : C.mute);
    vIn.material.color.set(s.sIn ? C.accent : C.mute);
    tint(M.sensorLens, Math.max(s.sOut, s.sIn) * 0.9);
    M.beam.color.set(s.sAux ? C.accent : M.beam.userData.base);
    M.band.color.set(s.sAux ? C.accent : M.band.userData.base);
    beams.forEach((b) => (b.scale.y = 1));
    // walkers: legs swing with the distance walked, the arms opposite
    figs.forEach((f, i) => {
      const p = s.peds[i];
      f.g.visible = !!p;
      if (!p) return;
      f.g.position.set(p.x, 0, p.z);
      f.g.rotation.y = Math.atan2(p.hx, p.hz);
      const ph = (p.s / 1.4) * Math.PI * 2;
      const amp = Math.min(1, p.v / 0.6) * 0.42;
      f.legs[0].rotation.x = Math.sin(ph) * amp;
      f.legs[1].rotation.x = -Math.sin(ph) * amp;
      f.arms[0].rotation.x = -Math.sin(ph) * amp * 0.7;
      f.arms[1].rotation.x = Math.sin(ph) * amp * 0.7;
    });
  };
  return {root, update, M, reg, all, G, L, figs};
}
export {V3};
