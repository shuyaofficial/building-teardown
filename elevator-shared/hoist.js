// The elevator, built from code in metres (y up, 0 = the 1F floor, the landing side toward +z): a 10-storey slice of
// an office building, the hoistway with its walls (the +x side can be cut away), two car rails and two counterweight
// rails, the car (sling, cab, 2-panel centre-opening doors and the door operator on top with its motor, belt, hangers
// and the vane that drags the landing doors), the counterweight, 5 hoist ropes, the machine room with the gearless PM
// traction machine (sheave Ø0.5 m, deflector sheave, brake) and the buffers in the pit. update(s, look) poses it from
// kin.js's state: nothing here keeps time.
import * as THREE from 'three';
import {boxSpan, buildSlabs, slabGeometry} from '../building-kit/slice.js';
import {C} from '../building-kit/ui.js';
import {floorY, SPEC} from './kin.js';

const V3 = THREE.Vector3;
const S = SPEC;
const HW = S.shaftW / 2; // 1.075
const HD = S.shaftD / 2; // 1.1
const WALL = 0.2;
const R1 = S.sheaveD / 2;
const R2 = S.deflD / 2;
/** layout of everything, metres; the numbers the callouts and cameras read too */
export const L = {
  HW,
  HD,
  WALL,
  cutX: HW - 0.015, // the cutaway planes: everything at x above this goes
  cutZ: -HD + 0.002, // and everything behind the hoistway's back face
  outline: [-3.6, 2.8, -1.3, 3.6], // the building slice's floor plate
  ground: -S.pit - 0.3,
  carZ: 0.2, // the car's centre (rails, sling, ropes) front to back
  cabFront: 0.98, // the cab's outer front face
  carDoorZ: 1.005,
  landDoorZ: 1.07,
  railX: 0.95, // car rail blade tip
  cwtZ: -0.88,
  cwtRailX: 0.53,
  cwtH: 3.25,
  sheaveZ: 0.2 - R1, // the car ropes drop from the sheave's front at z = carZ
  deflZ: -0.88 + R2, // the counterweight ropes drop from the deflector's rear at z = cwtZ
  ropeX: [-0.032, -0.016, 0, 0.016, 0.032],
  panelW: 0.47,
  doorTravel: S.doorW / 2, // each panel moves 0.45 m
  mrTop: S.mrFloor + 2.6,
  topOfShaft: S.mrFloor - 0.25,
};
export const ISO = {machine: ['machine', 'rope'], cwt: ['cwt', 'cwtRail', 'rope', 'cwtBuffer'], door: ['door', 'landDoor']};
// kept but half ghosted: the landing doors, so the car door and its vane read through them
const PARTIAL = {door: {landDoor: 0.6}};

// a rope's paint marks move with it: stripes in world y offset by the rope's travel
function markRope(m) {
  const u = {value: 0};
  m.userData.uOff = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOff = u;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWy;\nuniform float uOff;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat mk = step(mod(vWy + uOff, 1.6), 0.07);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.96, 0.93), mk * 0.9);');
  };
  m.customProgramCacheKey = () => 'ropemark';
  return m;
}

export function buildHoist() {
  const root = new THREE.Group();
  // ------------------------------------------------------------ materials, each tagged with its subsystem
  const reg = {};
  const accent = new THREE.Color(C.accent);
  const mk = (sys, opts, acc = null) => {
    const m = new THREE.MeshStandardMaterial({roughness: 0.6, metalness: 0, envMapIntensity: 0.6, ...opts});
    (reg[sys] ||= []).push(m);
    m.userData.sys = sys;
    m.userData.base = m.color.clone();
    m.userData.acc = acc;
    return m;
  };
  const M = {
    slab: mk('bldg', {color: '#e4ddd0', roughness: 0.85, side: THREE.DoubleSide}),
    earth: mk('bldg', {color: '#d5c6ad', roughness: 0.95, side: THREE.DoubleSide}),
    wall: mk('bldg', {color: '#d9d2c5', roughness: 0.9, side: THREE.DoubleSide}),
    frame: mk('bldg', {color: '#b9b6b0', roughness: 0.45, metalness: 0.5}),
    rail: mk('rail', {color: '#4c4f55', roughness: 0.45, metalness: 0.7}),
    cwtRail: mk('cwtRail', {color: '#4c4f55', roughness: 0.45, metalness: 0.7}),
    sling: mk('car', {color: '#55595f', roughness: 0.5, metalness: 0.5}, 'travel'),
    cab: mk('car', {color: '#ece8e0', roughness: 0.55}),
    cabDark: mk('car', {color: '#7d7a73', roughness: 0.6}),
    panel: mk('door', {color: '#c4c7cb', roughness: 0.42, metalness: 0.55}),
    landPanel: mk('landDoor', {color: '#bfc2c6', roughness: 0.42, metalness: 0.55}),
    opr: mk('door', {color: '#4a4d52', roughness: 0.5, metalness: 0.4}, 'door'),
    oprPlate: mk('door', {color: '#9a9890', roughness: 0.55, metalness: 0.3}),
    ropeCar: markRope(mk('rope', {color: '#4d4f53', roughness: 0.5, metalness: 0.6}, 'travel')),
    ropeCwt: markRope(mk('rope', {color: '#4d4f53', roughness: 0.5, metalness: 0.6}, 'travel')),
    ropeFix: mk('rope', {color: '#4d4f53', roughness: 0.5, metalness: 0.6}, 'travel'),
    mach: mk('machine', {color: '#3d4148', roughness: 0.48, metalness: 0.45}),
    machLight: mk('machine', {color: '#8b9097', roughness: 0.4, metalness: 0.6}),
    sheave: mk('machine', {color: '#6c7178', roughness: 0.38, metalness: 0.7}, 'travel'),
    brake: mk('machine', {color: '#2f3237', roughness: 0.5, metalness: 0.3}),
    panelBox: mk('machine', {color: '#d6d3cc', roughness: 0.6}),
    cwt: mk('cwt', {color: '#5d6066', roughness: 0.6, metalness: 0.3}),
    filler: mk('cwt', {color: '#73767b', roughness: 0.7, metalness: 0.2}),
    buffer: mk('buffer', {color: '#5a5d63', roughness: 0.5, metalness: 0.5}),
    cwtBuffer: mk('cwtBuffer', {color: '#5a5d63', roughness: 0.5, metalness: 0.5}),
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
  const cylX = (parent, mat, r, x0, x1, y, z, seg = 40) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, seg), mat));
    m.rotation.z = Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, z);
    return m;
  };
  const cylY = (parent, mat, r, x, y0, y1, z, seg = 24) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, seg), mat));
    m.position.set(x, (y0 + y1) / 2, z);
    return m;
  };
  const cylZ = (parent, mat, r, x, y, z0, z1, seg = 24) => {
    const m = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, seg), mat));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, (z0 + z1) / 2);
    return m;
  };
  const G = {}; // named groups for the callouts and the cameras

  // ------------------------------------------------------------ building slice
  const bldg = new THREE.Group();
  root.add(bldg);
  const core = [-HW - WALL + 0.005, HW + WALL - 0.005, -HD - WALL + 0.005, HD + WALL - 0.005];
  const levels = Array.from({length: S.floors}, (_, i) => floorY(i + 1));
  const roofY = floorY(S.floors) + S.floorH;
  add(bldg, buildSlabs({levels: [...levels.slice(1), roofY], outline: L.outline, hole: core, t: 0.22, mat: M.slab}), false);
  bldg.children[0].children.forEach((m) => (m.receiveShadow = true));
  // the ground floor sits on a cut block of earth with the pit sunk into it
  const earth = add(bldg, new THREE.Mesh(slabGeometry(L.outline, core, -L.ground), M.earth), false);
  earth.position.y = 0;
  // hoistway walls from the pit slab to the machine room floor; the +x one is the one the cutaway removes
  const yb = L.ground;
  const yt = L.topOfShaft;
  box(bldg, M.wall, [-HW - WALL, HW + WALL], [yb, yt], [-HD - WALL, -HD], false);
  box(bldg, M.wall, [-HW - WALL, -HW], [yb, yt], [-HD, HD + WALL], false);
  box(bldg, M.wall, [HW, HW + WALL], [yb, yt], [-HD, HD + WALL], false);
  box(bldg, M.wall, [-HW, HW], [yb, -S.pit], [-HD, HD], false); // pit floor
  // the landing side: full-height piers beside the openings, a header over each door, a sill and a frame
  box(bldg, M.wall, [-HW, -0.5], [yb, yt], [HD, HD + WALL], false);
  box(bldg, M.wall, [0.5, HW], [yb, yt], [HD, HD + WALL], false);
  box(bldg, M.wall, [-0.5, 0.5], [yb, 0], [HD, HD + WALL], false);
  levels.forEach((y, i) => {
    const top = i < S.floors - 1 ? levels[i + 1] : yt;
    box(bldg, M.wall, [-0.5, 0.5], [y + S.doorH + 0.1, top], [HD, HD + WALL], false);
    // stainless three-sided frame on the lobby face and the sill
    box(bldg, M.frame, [-0.5, -0.45], [y, y + S.doorH + 0.1], [HD + WALL, HD + WALL + 0.02], false);
    box(bldg, M.frame, [0.45, 0.5], [y, y + S.doorH + 0.1], [HD + WALL, HD + WALL + 0.02], false);
    box(bldg, M.frame, [-0.5, 0.5], [y + S.doorH, y + S.doorH + 0.1], [HD + WALL, HD + WALL + 0.02], false);
    box(bldg, M.frame, [-0.55, 0.55], [y - 0.03, y], [HD - 0.06, HD + WALL + 0.02], false);
    // hall call button plate
    box(bldg, M.frame, [0.68, 0.78], [y + 1.0, y + 1.25], [HD + WALL, HD + WALL + 0.015], false);
  });
  // the machine room on the roof: floor with two rope holes, walls, roof
  const mrO = [-1.6, 1.6, -1.5, 1.5];
  const ropeHoles = [
    [-0.1, 0.1, L.carZ - 0.08, L.carZ + 0.08],
    [-0.1, 0.1, L.cwtZ - 0.08, L.cwtZ + 0.08],
  ];
  const mrFloor = add(bldg, new THREE.Mesh(slabGeometry(mrO, ropeHoles, 0.25), M.slab), false);
  mrFloor.position.y = S.mrFloor;
  box(bldg, M.wall, [-1.6, 1.6], [S.mrFloor, L.mrTop], [-1.5, -1.35], false);
  box(bldg, M.wall, [-1.6, -1.45], [S.mrFloor, L.mrTop], [-1.35, 1.5], false);
  box(bldg, M.wall, [-1.45, 1.6], [S.mrFloor, L.mrTop], [1.35, 1.5], false);
  box(bldg, M.wall, [1.45, 1.6], [S.mrFloor, L.mrTop], [-1.35, 1.35], false);
  box(bldg, M.wall, [-1.6, 1.6], [L.mrTop, L.mrTop + 0.2], [-1.5, 1.5], false);

  // ------------------------------------------------------------ guide rails (T section), brackets to the walls
  const rails = new THREE.Group();
  root.add(rails);
  const railY = [-S.pit, yt];
  const brkY = [];
  for (let y = -S.pit + 0.6; y < yt - 0.3; y += 2.5) brkY.push(y);
  const brk = (mat, n) => {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
    im.castShadow = true;
    im.receiveShadow = true;
    all.push(im);
    return im;
  };
  const carBrk = brk(M.rail, brkY.length * 2);
  const cwtBrk = brk(M.cwtRail, brkY.length * 2);
  const mtx = new THREE.Matrix4();
  let bi = 0;
  let ci = 0;
  for (const s of [-1, 1]) {
    // car rail: blade toward the car, flange against the bracket
    box(rails, M.rail, s > 0 ? [L.railX, 1.04] : [-1.04, -L.railX], railY, [L.carZ - 0.008, L.carZ + 0.008]);
    box(rails, M.rail, s > 0 ? [1.04, 1.056] : [-1.056, -1.04], railY, [L.carZ - 0.063, L.carZ + 0.063]);
    // counterweight rail
    box(rails, M.cwtRail, s > 0 ? [L.cwtRailX, 0.6] : [-0.6, -L.cwtRailX], railY, [L.cwtZ - 0.006, L.cwtZ + 0.006]);
    box(rails, M.cwtRail, s > 0 ? [0.6, 0.612] : [-0.612, -0.6], railY, [L.cwtZ - 0.04, L.cwtZ + 0.04]);
    for (const y of brkY) {
      mtx.compose(new V3(s * 1.0655, y, L.carZ), new THREE.Quaternion(), new V3(0.019, 0.2, 0.2));
      carBrk.setMatrixAt(bi++, mtx);
      // from the back wall (z = −HD) to the rail's flange (z = cwtZ − 0.04)
      mtx.compose(new V3(s * 0.62, y + 1.2, (L.cwtZ - 0.04 - HD) / 2), new THREE.Quaternion(), new V3(0.04, 0.16, HD + L.cwtZ - 0.04));
      cwtBrk.setMatrixAt(ci++, mtx);
    }
  }
  rails.add(carBrk, cwtBrk);

  // ------------------------------------------------------------ the car
  const car = new THREE.Group();
  root.add(car);
  G.car = car;
  const cz0 = L.carZ - S.cabD / 2 - 0.03; // cab outer back
  const cx = S.cabW / 2; // 0.8 inner half width
  // platform, walls, ceiling
  box(car, M.cabDark, [-cx - 0.05, cx + 0.05], [-0.18, 0], [cz0 - 0.02, L.cabFront + 0.02]);
  box(car, M.cab, [-cx - 0.03, -cx], [0, S.cabH + 0.03], [cz0, L.cabFront]);
  box(car, M.cab, [cx, cx + 0.03], [0, S.cabH + 0.03], [cz0, L.cabFront]);
  box(car, M.cab, [-cx, cx], [0, S.cabH + 0.03], [cz0, cz0 + 0.03]);
  box(car, M.cab, [-cx - 0.03, cx + 0.03], [S.cabH, S.cabH + 0.03], [cz0, L.cabFront]);
  // the front return walls and the transom over the doorway
  box(car, M.cab, [-cx, -0.45], [0, S.cabH], [L.cabFront - 0.03, L.cabFront]);
  box(car, M.cab, [0.45, cx], [0, S.cabH], [L.cabFront - 0.03, L.cabFront]);
  box(car, M.cab, [-0.45, 0.45], [S.doorH, S.cabH], [L.cabFront - 0.03, L.cabFront]);
  box(car, M.frame, [-0.55, 0.55], [-0.03, 0], [L.cabFront, 1.035]); // car sill
  // a handrail and the operating panel inside, seen through the open door
  box(car, M.cabDark, [-0.6, 0.6], [0.88, 0.92], [cz0 + 0.03, cz0 + 0.07]);
  box(car, M.cabDark, [0.5, 0.62], [0.9, 1.45], [L.cabFront - 0.05, L.cabFront - 0.03]);
  // the sling: stiles, crosshead, safety plank, guide shoes, the rope hitch
  const sling = new THREE.Group();
  car.add(sling);
  for (const s of [-1, 1]) {
    box(sling, M.sling, s > 0 ? [0.86, 0.93] : [-0.93, -0.86], [-0.5, 2.98], [L.carZ - 0.06, L.carZ + 0.06]);
    for (const y of [-0.42, 2.86]) {
      // a guide shoe: two cheeks either side of the rail blade and a back plate
      const xs = s > 0 ? [0.92, 1.0] : [-1.0, -0.92];
      box(sling, M.cabDark, xs, [y - 0.07, y + 0.07], [L.carZ + 0.009, L.carZ + 0.04]);
      box(sling, M.cabDark, xs, [y - 0.07, y + 0.07], [L.carZ - 0.04, L.carZ - 0.009]);
      box(sling, M.cabDark, s > 0 ? [0.92, 0.95] : [-0.95, -0.92], [y - 0.07, y + 0.07], [L.carZ - 0.04, L.carZ + 0.04]);
    }
  }
  box(sling, M.sling, [-0.93, 0.93], [2.8, 2.98], [L.carZ - 0.07, L.carZ + 0.07]);
  box(sling, M.sling, [-0.93, 0.93], [-0.5, -0.3], [L.carZ - 0.07, L.carZ + 0.07]);
  box(sling, M.sling, [-0.08, 0.08], [-0.53, -0.5], [L.carZ - 0.08, L.carZ + 0.08]); // buffer striker
  for (const x of L.ropeX) {
    cylY(sling, M.machLight, 0.006, x, 2.98, S.hitchCar, L.carZ, 8);
    cylY(sling, M.cabDark, 0.0075, x, 3.0, 3.07, L.carZ, 10);
  }
  // car top balustrade
  for (const x of [-0.75, 0.75]) cylY(car, M.cabDark, 0.012, x, S.cabH + 0.03, S.cabH + 0.75, cz0 + 0.06, 8);
  cylX(car, M.cabDark, 0.012, -0.75, 0.75, S.cabH + 0.75, cz0 + 0.06, 8);

  // ------------------------------------------------------------ car doors and the door operator
  const door = new THREE.Group();
  car.add(door);
  G.door = door;
  const pw = L.panelW;
  const carPanels = [-1, 1].map((s) => {
    const g = new THREE.Group();
    door.add(g);
    box(g, M.panel, [-pw / 2, pw / 2], [0, S.doorH], [L.carDoorZ - 0.015, L.carDoorZ + 0.015]);
    // the safety edge on the leading edge, and the hanger plate with its two rollers on the rail
    box(g, M.opr, s < 0 ? [pw / 2 - 0.015, pw / 2] : [-pw / 2, -pw / 2 + 0.015], [0.05, S.doorH - 0.05], [L.carDoorZ + 0.015, L.carDoorZ + 0.022]);
    // the plate hangs in front of the rail; its rollers sit on the rail's top
    box(g, M.oprPlate, [-pw / 2 + 0.02, pw / 2 - 0.02], [S.doorH, S.doorH + 0.12], [1.004, 1.018]);
    for (const x of [-0.14, 0.14]) cylZ(g, M.opr, 0.025, x, 2.225, 0.99, 1.004, 18);
    return g;
  });
  // the vane on the left panel near its leading edge: two blades the landing door's rollers sit between
  const vaneX = pw / 2 - 0.08;
  for (const dx of [-0.031, 0.031]) box(carPanels[0], M.opr, [vaneX + dx - 0.006, vaneX + dx + 0.006], [1.72, 2.06], [L.carDoorZ + 0.015, 1.05]);
  // header plate, hanger rail, pulleys, belt, motor
  const opr = new THREE.Group();
  door.add(opr);
  box(opr, M.oprPlate, [-0.98, 0.98], [S.doorH + 0.02, 2.6], [L.cabFront, L.cabFront + 0.008]);
  box(opr, M.oprPlate, [-0.98, 0.98], [2.18, 2.2], [L.cabFront + 0.008, 1.003]); // hanger rail
  const PUL = {x: 0.8, y: 2.42, r: 0.035};
  const pulleys = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * PUL.x, PUL.y, L.carDoorZ + 0.02);
    opr.add(g);
    const c = add(g, new THREE.Mesh(new THREE.CylinderGeometry(PUL.r, PUL.r, 0.02, 24), M.opr));
    c.rotation.x = Math.PI / 2;
    const sp = add(g, new THREE.Mesh(new THREE.BoxGeometry(PUL.r * 1.7, 0.008, 0.024), M.oprPlate));
    sp.position.z = 0;
    return g;
  });
  for (const dy of [PUL.r, -PUL.r]) box(opr, M.opr, [-PUL.x, PUL.x], [PUL.y + dy - 0.004, PUL.y + dy + 0.004], [L.carDoorZ + 0.012, L.carDoorZ + 0.028]);
  // belt clamps: the left panel rides the top run, the right one the bottom run, so the two always move apart
  const clamps = [
    box(opr, M.opr, [-0.02, 0.02], [S.doorH + 0.12, PUL.y + PUL.r], [1.01, 1.024]),
    box(opr, M.opr, [-0.02, 0.02], [S.doorH + 0.12, PUL.y - PUL.r], [1.01, 1.024]),
  ];
  // the door motor behind the header, over the cab roof, its shaft through to the right pulley
  const motor = cylZ(opr, M.opr, 0.065, PUL.x, PUL.y, L.cabFront - 0.17, L.cabFront - 0.01, 28);
  cylZ(opr, M.oprPlate, 0.045, PUL.x, PUL.y, L.cabFront - 0.2, L.cabFront - 0.17, 20);
  cylZ(opr, M.machLight, 0.01, PUL.x, PUL.y, L.cabFront - 0.01, L.carDoorZ + 0.01, 10);
  box(opr, M.opr, [-0.3, 0.3], [S.cabH + 0.03, S.cabH + 0.18], [L.cabFront - 0.2, L.cabFront - 0.02]); // controller
  G.motorDoor = motor;

  // ------------------------------------------------------------ landing doors, one pair per floor
  const landing = levels.map((y) => {
    const g = new THREE.Group();
    g.position.y = y;
    root.add(g);
    box(g, M.oprPlate, [-0.98, 0.98], [S.doorH + 0.1, S.doorH + 0.12], [L.landDoorZ - 0.02, HD]);
    const panels = [-1, 1].map((s) => {
      const p = new THREE.Group();
      g.add(p);
      box(p, M.landPanel, [-pw / 2, pw / 2], [0, S.doorH], [L.landDoorZ - 0.015, L.landDoorZ + 0.015], false);
      box(p, M.oprPlate, [-pw / 2 + 0.03, pw / 2 - 0.03], [S.doorH, S.doorH + 0.08], [L.landDoorZ - 0.012, L.landDoorZ]);
      return p;
    });
    // the two rollers the car's vane closes on, on the left panel
    for (const yy of [1.8, 1.98]) {
      cylZ(panels[0], M.opr, 0.02, vaneX, yy, 1.03, L.landDoorZ - 0.015, 16);
      box(panels[0], M.oprPlate, [vaneX - 0.008, vaneX + 0.008], [yy - 0.008, yy + 0.008], [1.03, L.landDoorZ - 0.015]);
    }
    return {g, panels};
  });

  // ------------------------------------------------------------ the counterweight
  const cwt = new THREE.Group();
  root.add(cwt);
  G.cwt = cwt;
  // local frame: y = 0 is the rope hitch on top
  for (const s of [-1, 1]) {
    box(cwt, M.cwt, s > 0 ? [0.46, 0.52] : [-0.52, -0.46], [-L.cwtH, -0.05], [L.cwtZ - 0.06, L.cwtZ + 0.06]);
    for (const y of [-0.25, -L.cwtH + 0.2]) {
      const xs = s > 0 ? [0.505, 0.56] : [-0.56, -0.505];
      box(cwt, M.cwt, xs, [y - 0.06, y + 0.06], [L.cwtZ + 0.008, L.cwtZ + 0.035]);
      box(cwt, M.cwt, xs, [y - 0.06, y + 0.06], [L.cwtZ - 0.035, L.cwtZ - 0.008]);
    }
  }
  box(cwt, M.cwt, [-0.52, 0.52], [-0.2, -0.05], [L.cwtZ - 0.065, L.cwtZ + 0.065]);
  box(cwt, M.cwt, [-0.52, 0.52], [-L.cwtH, -L.cwtH + 0.15], [L.cwtZ - 0.065, L.cwtZ + 0.065]);
  {
    const n = 26;
    const h = (L.cwtH - 0.4) / n;
    const fg = new THREE.BoxGeometry(0.9, h - 0.008, 0.1);
    for (let i = 0; i < n; i++) {
      const m = add(cwt, new THREE.Mesh(fg, M.filler));
      m.position.set(0, -L.cwtH + 0.15 + h * (i + 0.5), L.cwtZ);
    }
  }
  for (const x of L.ropeX) cylY(cwt, M.machLight, 0.006, x, -0.06, 0, L.cwtZ, 8);

  // ------------------------------------------------------------ the traction machine, the deflector, the brake
  const mach = new THREE.Group();
  root.add(mach);
  G.mach = mach;
  const SY = S.sheaveY;
  const DY = S.deflY;
  const F = S.mrFloor;
  // along the shaft (x): the outer bearing on the cut side, the sheave, the PM motor, the brake drum at the far end,
  // so the sheave faces the cutaway and nothing stands between it and the camera
  for (const z of [-0.44, 0.3]) box(mach, M.mach, [-0.8, 0.3], [F, F + 0.15], [z, z + 0.12]);
  box(mach, M.mach, [-0.44, -0.13], [F + 0.15, SY - 0.3], [-0.4, 0.36]); // motor feet on both bedplate rails
  // the PM motor: a short, wide drum beside the sheave
  const housing = cylX(mach, M.mach, 0.4, -0.45, -0.12, SY, L.sheaveZ, 56);
  cylX(mach, M.machLight, 0.36, -0.47, -0.45, SY, L.sheaveZ, 56);
  box(mach, M.mach, [-0.4, -0.2], [SY + 0.38, SY + 0.48], [L.sheaveZ - 0.12, L.sheaveZ + 0.12]); // terminal box
  G.motor = housing;
  // the rotor: sheave, brake drum and shaft turn together
  const rotor = new THREE.Group();
  rotor.position.set(0, SY, L.sheaveZ);
  mach.add(rotor);
  cylX(rotor, M.machLight, 0.05, -0.74, 0.22, 0, 0, 20);
  cylX(rotor, M.sheave, R1 + 0.003, -0.055, 0.055, 0, 0, 64);
  for (const x of [-0.062, 0.062]) cylX(rotor, M.sheave, R1 + 0.025, x - 0.008, x + 0.008, 0, 0, 64);
  // a web with six holes on each face so the turn reads
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R1 - 0.01, 0, Math.PI * 2, false);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.045, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    const web = new THREE.ExtrudeGeometry(sh, {depth: 0.01, bevelEnabled: false, curveSegments: 24});
    web.rotateY(-Math.PI / 2);
    for (const x of [-0.071, 0.081]) add(rotor, new THREE.Mesh(web, M.machLight)).position.x = x;
  }
  cylX(rotor, M.machLight, 0.24, -0.66, -0.52, 0, 0, 56); // brake drum
  box(rotor, M.brake, [-0.66, -0.52], [0.2, 0.243], [-0.02, 0.02]); // a painted index mark on the drum
  cylX(rotor, M.mach, 0.07, -0.76, -0.7, 0, 0, 24); // encoder
  // the brake: two arms either side of the drum, shoes on it, the magnet and spring across the top
  const brake = new THREE.Group();
  mach.add(brake);
  G.brake = brake;
  for (const s of [-1, 1]) {
    const z = L.sheaveZ + s * 0.29;
    box(brake, M.brake, [-0.64, -0.54], [F, SY + 0.32], [z - 0.025, z + 0.025]);
    box(brake, M.brake, [-0.65, -0.53], [SY - 0.12, SY + 0.12], [L.sheaveZ + s * 0.24, L.sheaveZ + s * 0.265].sort((a, b) => a - b));
  }
  box(brake, M.brake, [-0.64, -0.54], [SY + 0.3, SY + 0.44], [L.sheaveZ - 0.12, L.sheaveZ + 0.12]);
  cylZ(brake, M.machLight, 0.012, -0.59, SY + 0.37, L.sheaveZ - 0.32, L.sheaveZ + 0.32, 10);
  // the outer bearing: a pedestal and a cap round the shaft
  box(mach, M.mach, [0.12, 0.22], [F + 0.15, SY - 0.05], [L.sheaveZ - 0.1, L.sheaveZ + 0.1]);
  cylX(mach, M.mach, 0.08, 0.12, 0.22, SY, L.sheaveZ, 28);
  // the deflector sheave on its stand
  const defl = new THREE.Group();
  defl.position.set(0, DY, L.deflZ);
  mach.add(defl);
  cylX(defl, M.machLight, R2 - 0.002, -0.05, 0.05, 0, 0, 56);
  for (const x of [-0.055, 0.055]) cylX(defl, M.machLight, R2 + 0.02, x - 0.006, x + 0.006, 0, 0, 56);
  box(defl, M.brake, [-0.062, 0.062], [-0.02, 0.02], [-0.16, 0.16]);
  cylX(mach, M.machLight, 0.02, -0.11, 0.11, DY, L.deflZ, 12);
  for (const s of [-1, 1]) box(mach, M.mach, s > 0 ? [0.075, 0.1] : [-0.1, -0.075], [F, DY + 0.04], [L.deflZ - 0.05, L.deflZ + 0.05]);
  G.defl = defl;
  // the controller cabinet
  const cab = box(mach, M.panelBox, [-1.42, -1.0], [F, F + 1.6], [-1.33, -0.95]);
  box(mach, M.mach, [-1.4, -1.02], [F + 1.35, F + 1.48], [-0.951, -0.94]);
  G.panel = cab;

  // ------------------------------------------------------------ hoist ropes
  const ropes = new THREE.Group();
  root.add(ropes);
  const unit = new THREE.CylinderGeometry(S.ropeD / 2, S.ropeD / 2, 1, 6, 1);
  unit.translate(0, 0.5, 0);
  const ropeC = L.ropeX.map((x) => {
    const m = add(ropes, new THREE.Mesh(unit, M.ropeCar), false);
    m.position.set(x, 0, L.carZ);
    return m;
  });
  const ropeW = L.ropeX.map((x) => {
    const m = add(ropes, new THREE.Mesh(unit, M.ropeCwt), false);
    m.position.set(x, 0, L.cwtZ);
    return m;
  });
  // the fixed run: over the sheave, across to the deflector, around it. The outer tangent of the two pitch circles.
  {
    const c1 = new THREE.Vector2(L.sheaveZ, SY);
    const c2 = new THREE.Vector2(L.deflZ, DY);
    const d = c2.clone().sub(c1);
    const len = d.length();
    const phi = Math.atan2(d.y, d.x);
    const psi = Math.acos((R1 - R2) / len);
    // the normal pointing up and back, away from both centres
    const cands = [phi + psi, phi - psi].map((a) => new THREE.Vector2(Math.cos(a), Math.sin(a)));
    const n = cands[0].y > cands[1].y ? cands[0] : cands[1];
    const a1 = Math.atan2(n.y, n.x);
    const pts = [];
    // over the sheave from its front (angle 0) to the tangent point
    for (let i = 0; i <= 24; i++) {
      const a = (a1 * i) / 24;
      pts.push([c1.x + R1 * Math.cos(a), c1.y + R1 * Math.sin(a)]);
    }
    // around the deflector from the tangent point to its rear (angle π)
    for (let i = 0; i <= 16; i++) {
      const a = a1 + ((Math.PI - a1) * i) / 16;
      pts.push([c2.x + R2 * Math.cos(a), c2.y + R2 * Math.sin(a)]);
    }
    for (const x of L.ropeX) {
      const curve = new THREE.CatmullRomCurve3(pts.map(([z, y]) => new V3(x, y, z)), false, 'centripetal');
      add(ropes, new THREE.Mesh(new THREE.TubeGeometry(curve, 90, S.ropeD / 2, 6, false), M.ropeFix), false);
    }
    L.wrapDeg = (a1 * 180) / Math.PI + (180 - (a1 * 180) / Math.PI);
  }
  // a 1 px line down each rope bundle so the ropes still read from the far view
  const lineMat = new THREE.LineBasicMaterial({color: '#3d3f43', transparent: true, opacity: 0.85});
  (reg.rope ||= []).push(lineMat);
  lineMat.userData = {sys: 'rope', base: lineMat.color.clone(), acc: 'travel', line: true};
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  ropes.add(lines);

  // ------------------------------------------------------------ the pit: oil buffers under the car and the counterweight
  const pit = new THREE.Group();
  root.add(pit);
  const bufTop = -0.5 - 0.3; // 300 mm below the car's striker when the car stands at 1F
  cylY(pit, M.buffer, 0.08, 0, -S.pit, bufTop - 0.2, L.carZ, 28);
  cylY(pit, M.machLight, 0.04, 0, bufTop - 0.2, bufTop - 0.02, L.carZ, 20);
  cylY(pit, M.buffer, 0.07, 0, bufTop - 0.02, bufTop, L.carZ, 24);
  const cwtBufTop = S.cwtHitch0 - S.travel - L.cwtH - 0.3;
  cylY(pit, M.cwtBuffer, 0.07, 0, -S.pit, cwtBufTop - 0.2, L.cwtZ, 28);
  cylY(pit, M.cwtBuffer, 0.035, 0, cwtBufTop - 0.2, cwtBufTop - 0.02, L.cwtZ, 20);
  cylY(pit, M.cwtBuffer, 0.06, 0, cwtBufTop - 0.02, cwtBufTop, L.cwtZ, 24);
  L.bufTop = bufTop;
  L.cwtBufTop = cwtBufTop;

  // ------------------------------------------------------------ the cutaway plane, ghosting, the accent
  const CLIP = new THREE.Plane(new V3(-1, 0, 0), 1e4);
  const CLIPZ = new THREE.Plane(new V3(0, 0, 1), 1e4);
  const CLIPS = [CLIP, CLIPZ];
  for (const m of reg.bldg) m.clippingPlanes = CLIPS;
  const ghostNow = {};
  const setGhost = (sys, k) => {
    if (Math.abs((ghostNow[sys] ?? 0) - k) < 1e-3) return;
    const was = ghostNow[sys] ?? 0;
    ghostNow[sys] = k;
    for (const m of reg[sys]) {
      const base = m.userData.line ? 0.85 : 1;
      m.opacity = base * (1 - (sys === 'bldg' ? 0.93 : 0.86) * k);
      const tr = k > 0.001 || m.userData.line;
      const dw = k < 0.5;
      if (m.transparent !== tr || m.depthWrite !== dw || (was === 0) !== (k === 0)) {
        m.transparent = tr;
        m.depthWrite = dw;
        m.needsUpdate = true;
      }
    }
  };
  const tmpC = new THREE.Color();
  /**
   * s: kin.js state. look: {cut 0..1 (1 = the +x wall cut away), iso: {machine, cwt, door} 0..1 each}.
   */
  const update = (s, look = {}) => {
    const cut = look.cut ?? 1;
    CLIP.constant = cut > 0.5 ? L.cutX : 1e4;
    CLIPZ.constant = cut > 0.5 ? -L.cutZ : 1e4;
    // ghost every subsystem the isolate leaves out
    const iso = look.iso || {};
    const ghost = {};
    for (const sys of Object.keys(reg)) ghost[sys] = 0;
    for (const [key, k] of Object.entries(iso)) {
      if (k <= 0) continue;
      for (const sys of Object.keys(reg)) {
        const part = PARTIAL[key]?.[sys];
        if (part) ghost[sys] = Math.max(ghost[sys], k * part);
        else if (!ISO[key].includes(sys)) ghost[sys] = Math.max(ghost[sys], k);
      }
    }
    for (const sys of Object.keys(reg)) setGhost(sys, ghost[sys]);
    // the accent: the working part
    for (const sys of Object.keys(reg))
      for (const m of reg[sys]) {
        const a = m.userData.acc;
        if (!a) continue;
        const w = a === 'travel' ? s.workTravel : s.workDoor;
        m.color.copy(tmpC.copy(m.userData.base).lerp(accent, w * 0.92));
      }
    // the car and the counterweight
    car.position.y = s.carY;
    cwt.position.y = s.cwtY;
    // ropes: car side from the hitch to the sheave, counterweight side from the hitch to the deflector
    const yc = s.carY + S.hitchCar;
    for (const m of ropeC) {
      m.position.y = yc;
      m.scale.y = SY - yc;
    }
    for (const m of ropeW) {
      m.position.y = s.cwtY;
      m.scale.y = DY - s.cwtY;
    }
    // marks travel with the rope: the car side moves with the car, the counterweight side the other way
    M.ropeCar.userData.uOff.value = -s.carY;
    M.ropeCwt.userData.uOff.value = s.carY;
    const lp = lineGeo.attributes.position.array;
    lp.set([0, yc, L.carZ, 0, SY, L.carZ, 0, s.cwtY, L.cwtZ, 0, DY, L.cwtZ]);
    lineGeo.attributes.position.needsUpdate = true;
    // the sheave turns with the rope: car up → the front of the sheave moves up
    rotor.rotation.x = -s.sheaveAngle;
    defl.rotation.x = -s.deflAngle;
    // doors: the car's pair, and the landing pair at the floor the car stands level with (the vane drags it)
    const k = s.door;
    const dx = L.doorTravel * k;
    carPanels[0].position.x = -pw / 2 - dx;
    carPanels[1].position.x = pw / 2 + dx;
    clamps[0].position.x = -pw / 2 - dx;
    clamps[1].position.x = pw / 2 + dx;
    for (const p of pulleys) p.rotation.z = dx / PUL.r;
    landing.forEach((ld, i) => {
      const kk = s.level && s.floor === i + 1 ? k : 0;
      ld.panels[0].position.x = -pw / 2 - L.doorTravel * kk;
      ld.panels[1].position.x = pw / 2 + L.doorTravel * kk;
    });
  };
  return {root, update, M, reg, all, G, CLIP, CLIPS, car, cwt, rotor, defl, landing, carPanels};
}
