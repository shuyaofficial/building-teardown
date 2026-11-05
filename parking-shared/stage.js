// The parking lift's stage, from the automatic door's: a pale warm studio, an environment of soft boxes, one sun with
// soft VSM shadows whose box follows the camera target, GTAO kept off the floor and off the see-through parts. The
// floor is a shape with the pit cut out of it (and, for the cutaway, the earth window right of the pit), so the
// floor's grid and the shadow catcher never lid the pit. frame(state, look, cam) poses the lift and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {C} from '../building-kit/ui.js';
import {buildLift, L} from './lift.js';

const V3 = THREE.Vector3;
export const COL = {bg: C.bg, ground: '#e8dfd0', grid: '#d9cdb9', shadow: '#6e5a40'};

const GROUND_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FRAG = /* glsl */ `uniform vec3 uG; uniform vec3 uM; uniform vec3 uBg; uniform vec3 uC; uniform float uR; varying vec3 vW;
  void main(){
    // a faint 0.5 m grid, so sizes on the floor read
    vec2 g = abs(fract(vW.xz * 2.0 + 0.5) - 0.5) * 0.5;
    float line = 1.0 - smoothstep(0.0, 0.006, min(g.x, g.y));
    vec3 col = mix(uG, uM, line * 0.5);
    float d = length(vW.xz - uC.xz);
    gl_FragColor = vec4(mix(col, uBg, smoothstep(uR * 0.4, uR, d)), 1.0);
  }`;

/** the floor outline (±R) with the pit as a hole; cut adds the earth window right of the pit to the hole */
function floorShape(cut, R = 60) {
  const sh = new THREE.Shape();
  // shape x → world x, shape y → world −z (the mesh is turned flat by −90° about x)
  sh.moveTo(-R, -R);
  sh.lineTo(R, -R);
  sh.lineTo(R, R);
  sh.lineTo(-R, R);
  sh.closePath();
  const {x, z} = L.pit;
  const [c0, c1] = L.cutZ;
  // the hole, counter-clockwise in shape space; with the cut it bulges right between c0 and c1
  const pts = cut
    ? [[-x, -z], [x, -z], [x, -c1], [L.cutX, -c1], [L.cutX, -c0], [x, -c0], [x, z], [-x, z]]
    : [[-x, -z], [x, -z], [x, z], [-x, z]];
  const hole = new THREE.Path();
  hole.moveTo(...pts[0]);
  for (const p of pts.slice(1)) hole.lineTo(...p);
  hole.closePath();
  sh.holes.push(hole);
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function createLiftStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 20, 80);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 200);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.6;
  gtao.updateGtaoMaterial({radius: 0.25, distanceExponent: 1.4, thickness: 0.6, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  const lift = buildLift();
  scene.add(lift.root);
  const noAO = [];
  const floors = [];
  const aoVis = (v) => () => {
    for (const f of floors) f.visible = v && f.userData.vis !== false;
    for (const m of noAO) m.visible = v && m.userData.vis !== false;
  };
  composer.addPass(new Toggle(aoVis(false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(aoVis(true)));
  composer.addPass(new OutputPass());

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e9e1d3');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.985, 0.96).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.3);
    box(3, 14, new V3(12, 4, 6), 3.0);
    box(3, 14, new V3(-12, 4, -4), 1.8);
    box(18, 2, new V3(0, 2, 14), 1.5);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#d6c8b0', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.95;
    pm.dispose();
  }
  // the sun high from the front right, so the pit reads lit and the raised pallet's shadow falls behind it
  const SUN_DIR = new V3(0.42, 0.85, 0.32).normalize();
  const sun = new THREE.DirectionalLight('#fff6ea', 2.0);
  sun.castShadow = true;
  let EXT = 6;
  const setExt = (e) => {
    EXT = e;
    Object.assign(sun.shadow.camera, {left: -e, right: e, top: e, bottom: -e, near: 0.2, far: 4 * e + 24});
    sun.shadow.camera.updateProjectionMatrix();
  };
  setExt(6);
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.003;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#fffaf2', '#d6c4a4', 0.85));

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: {uG: {value: new THREE.Color(COL.ground)}, uM: {value: new THREE.Color(COL.grid)}, uBg: {value: new THREE.Color(COL.bg)}, uC: {value: new V3()}, uR: {value: 30}},
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const shadeMat = new THREE.ShadowMaterial({color: COL.shadow, opacity: 0.25, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8});
  const ground = {};
  const shade = {};
  for (const cut of [0, 1]) {
    const geo = floorShape(!!cut);
    ground[cut] = new THREE.Mesh(geo, groundMat);
    ground[cut].position.y = -0.0005;
    shade[cut] = new THREE.Mesh(geo, shadeMat);
    shade[cut].receiveShadow = true;
    scene.add(ground[cut], shade[cut]);
    floors.push(ground[cut], shade[cut]);
  }
  lift.root.traverse((o) => {
    if ((o.isMesh || o.isLine) && o.material && !Array.isArray(o.material) && (o.material.transparent || o.isLine)) noAO.push(o);
  });

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const tmp = new V3();
  const right = new V3().crossVectors(new V3(0, 1, 0), SUN_DIR).normalize();
  const upL = new V3().crossVectors(SUN_DIR, right);
  let mapN = 4096;

  // look: {cut, iso}; cam: {tx, ty, tz, az, el, d (radians, metres), sx, sy} in world coordinates
  const frame = (st, look, cam) => {
    lift.update(st, look);
    const cut = (look.cut ?? 1) >= 0.5 ? 1 : 0;
    for (const k of [0, 1]) {
      ground[k].visible = ground[k].userData.vis = k === cut;
      shade[k].visible = shade[k].userData.vis = k === cut;
    }
    for (const m of noAO) m.userData.vis = m.visible;
    const {tx, ty, tz} = cam;
    camera.position.set(tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), ty + cam.d * Math.sin(cam.el), tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    scene.fog.near = cam.d * 2;
    scene.fog.far = cam.d * 6 + 20;
    groundMat.uniforms.uC.value.set(tx, 0, tz);
    groundMat.uniforms.uR.value = Math.max(10, cam.d * 1.4);
    // the shadow box follows the target and grows with the view, snapped to its texels so it never shimmers
    const e = Math.min(10, Math.max(2.5, cam.d * 0.55));
    if (Math.abs(e - EXT) > 1e-6) setExt(e);
    const texel = (2 * EXT) / mapN;
    tmp.set(tx, ty, tz);
    const rr = Math.round(tmp.dot(right) / texel) * texel;
    const uu = Math.round(tmp.dot(upL) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(rr).addScaledVector(upL, uu).addScaledVector(SUN_DIR, tmp.dot(SUN_DIR));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 2 * EXT + 12);
    sun.target.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  const project = (x, y, z) => {
    pv.set(x, y, z).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({samples, ao, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      mapN = shadow;
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  return {renderer, scene, camera, lift, composer, gtao, sun, resize, frame, project, size, setQuality};
}
