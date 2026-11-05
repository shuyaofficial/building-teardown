// A slice of a building, built in code: floor slabs with an opening (a hoistway, an escalator well, a pit), and boxes
// given by their extents. Metres; y up; the slab's top face is the floor level.
import * as THREE from 'three';

/** A box mesh spanning [x0,x1] × [y0,y1] × [z0,z1]. */
export function boxSpan(mat, [x0, x1], [y0, y1], [z0, z1]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

/** One slab outline [x0,x1,z0,z1] with optional rectangular holes ([x0,x1,z0,z1] or a list), t thick; top at y = 0. */
export function slabGeometry([x0, x1, z0, z1], holes, t) {
  const sh = new THREE.Shape();
  // shape x → world x, shape y → world −z (after the rotation below)
  sh.moveTo(x0, -z0);
  sh.lineTo(x1, -z0);
  sh.lineTo(x1, -z1);
  sh.lineTo(x0, -z1);
  sh.closePath();
  const list = !holes ? [] : Array.isArray(holes[0]) ? holes : [holes];
  for (const [hx0, hx1, hz0, hz1] of list) {
    const p = new THREE.Path();
    p.moveTo(hx0, -hz0);
    p.lineTo(hx0, -hz1);
    p.lineTo(hx1, -hz1);
    p.lineTo(hx1, -hz0);
    p.closePath();
    sh.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: t, bevelEnabled: false});
  g.rotateX(-Math.PI / 2);
  g.translate(0, -t, 0);
  return g;
}

/** Slabs at every level in `levels`, sharing one geometry. Returns the group. */
export function buildSlabs({levels, outline, hole = null, t = 0.22, mat}) {
  const g = new THREE.Group();
  const geo = slabGeometry(outline, hole, t);
  for (const y of levels) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    g.add(m);
  }
  return g;
}
