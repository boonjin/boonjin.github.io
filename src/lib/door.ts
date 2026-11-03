import { squareToQuad } from './homography';

// Door geometry in the door drawing's viewBox (0 0 320 560).
export const DOOR = { hinge: 74, top: 54, bottom: 520, width: 172, cx: 160, cy: 287, focal: 520 };

const f = (n: number) => n.toFixed(1);

/** The leaf as a quad after swinging `theta` radians away from the viewer, in perspective. */
export function leafQuad(theta: number): number[][] {
  const { hinge, top, bottom, width, cx, cy, focal } = DOOR;
  const s = focal / (focal + width * Math.sin(theta));
  const x = cx + (hinge + width * Math.cos(theta) - cx) * s;
  return [
    [hinge, top],
    [x, cy + (top - cy) * s],
    [x, cy + (bottom - cy) * s],
    [hinge, bottom]
  ];
}

export function leafPaths(theta: number) {
  const map = squareToQuad(leafQuad(theta));
  const rect = (u0: number, v0: number, u1: number, v1: number) =>
    'M' +
    [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => map(u, v).map(f).join(' ')).join('L') +
    'Z';
  const [kx, ky] = map(0.895, 0.53);
  const squash = (map(0.9, 0.53)[0] - map(0.89, 0.53)[0]) / (0.01 * DOOR.width);
  return {
    leaf: rect(0, 0, 1, 1),
    // Panel and bevel together, filled even-odd, give the hatched moulding ring.
    moulding:
      rect(0.116, 0.056, 0.884, 0.464) + rect(0.163, 0.073, 0.837, 0.447) +
      rect(0.116, 0.528, 0.884, 0.936) + rect(0.163, 0.545, 0.837, 0.919),
    panels: rect(0.116, 0.056, 0.884, 0.464) + rect(0.116, 0.528, 0.884, 0.936),
    bevels: rect(0.163, 0.073, 0.837, 0.447) + rect(0.163, 0.545, 0.837, 0.919),
    plate: rect(0.872, 0.49, 0.918, 0.575),
    knob: { cx: f(kx), cy: f(ky), rx: f(6 * squash), ry: '6' }
  };
}
