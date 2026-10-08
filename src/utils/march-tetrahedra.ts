/**
 * Surfaces of a signed scalar field on a uniform grid, by marching tetrahedra:
 * the +level sheet and the −level sheet, extracted separately.
 *
 * Marching the signed field rather than its magnitude is what keeps two lobes
 * apart across a node: when a grid edge straddles the node with both samples
 * beyond the contour, |f| is "inside" at both ends and the lobes fuse, while
 * f = +c and f = −c each cross that edge once and the gap stays empty.
 *
 * Two users: the MO isosurfaces (extended-huckel/mo-surface.ts) and the π-cloud
 * highlight (render/pi-systems.ts).
 */

export type Vec3 = [number, number, number];

/** A field sampled on a uniform grid, x fastest. */
export interface SignedGrid {
  values: Float32Array;
  /** The grid's lower corner. */
  origin: Vec3;
  /** Grid points along each axis. */
  dimensions: Vec3;
  /** Grid step. */
  spacing: number;
}

export interface MarchedSheets {
  positions: number[];
  normals: number[];
  /** +1 / −1 per vertex: which sheet it belongs to */
  phases: number[];
}

/** The six tetrahedra of a cube, as corner-index quadruples around the
 *  (0,0,0)–(1,1,1) diagonal. The same decomposition in every cube, so
 *  neighbouring cubes agree on their shared faces. */
const TETRAHEDRA: number[][] = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
const CORNER: number[][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const EDGE: number[][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

/**
 * The f = +isovalue and f = −isovalue sheets of `grid`. `outwardAt(x, y, z,
 * sign)` gives the outward unit normal at a point on the sheet of that sign;
 * an analytic gradient there is exact where a grid-interpolated one is not.
 * Triangles are wound so their face normal agrees with it.
 */
export function marchSignedField(
  grid: SignedGrid,
  isovalue: number,
  outwardAt: (x: number, y: number, z: number, sign: number) => Vec3,
): MarchedSheets {
  const { values: field, spacing: step } = grid;
  const [minX, minY, minZ] = grid.origin;
  const [nx, ny, nz] = grid.dimensions;
  const positions: number[] = [];
  const normals: number[] = [];
  const phases: number[] = [];
  if (isovalue <= 0) return { positions, normals, phases };

  // Scratch for one tetrahedron and its crossings, allocated once: the
  // extraction visits a million of them on a fine grid, and a per-tet object
  // or closure was most of the cost.
  const cx = new Float64Array(4);
  const cy = new Float64Array(4);
  const cz = new Float64Array(4);
  const cSigned = new Float64Array(4);
  const px = new Float64Array(4);
  const py = new Float64Array(4);
  const pz = new Float64Array(4);
  const pSign = new Float64Array(4);

  /** Append one triangle of crossings a, b, c (indices into the scratch). */
  function emit(a: number, b: number, c: number): void {
    const abx = px[b] - px[a], aby = py[b] - py[a], abz = pz[b] - pz[a];
    const acx = px[c] - px[a], acy = py[c] - py[a], acz = pz[c] - pz[a];
    const gx = aby * acz - abz * acy;
    const gy = abz * acx - abx * acz;
    const gz = abx * acy - aby * acx;
    // all three crossings lie on one sheet, so one sign covers the triangle
    const mid = outwardAt((px[a] + px[b] + px[c]) / 3, (py[a] + py[b] + py[c]) / 3, (pz[a] + pz[b] + pz[c]) / 3, pSign[a]);
    const swap = gx * mid[0] + gy * mid[1] + gz * mid[2] < 0;
    const order = swap ? [a, c, b] : [a, b, c];
    for (const v of order) {
      const normal = outwardAt(px[v], py[v], pz[v], pSign[v]);
      positions.push(px[v], py[v], pz[v]);
      normals.push(normal[0], normal[1], normal[2]);
      phases.push(pSign[v]);
    }
  }

  for (const positive of [true, false]) {
    const level = positive ? isovalue : -isovalue;
    for (let gz = 0; gz < nz - 1; gz++) {
      for (let gy = 0; gy < ny - 1; gy++) {
        for (let gx = 0; gx < nx - 1; gx++) {
          for (const tet of TETRAHEDRA) {
            let mask = 0;
            for (let c = 0; c < 4; c++) {
              const corner = tet[c];
              const index = (gx + CORNER[corner][0]) + (gy + CORNER[corner][1]) * nx + (gz + CORNER[corner][2]) * nx * ny;
              const signed = field[index];
              cx[c] = minX + (gx + CORNER[corner][0]) * step;
              cy[c] = minY + (gy + CORNER[corner][1]) * step;
              cz[c] = minZ + (gz + CORNER[corner][2]) * step;
              cSigned[c] = signed;
              const inside = positive ? signed > isovalue : signed < -isovalue;
              if (inside) mask |= 1 << c;
            }
            if (mask === 0 || mask === 15) continue;

            let crossings = 0;
            for (const [i, j] of EDGE) {
              const insideI = (mask >> i) & 1;
              const insideJ = (mask >> j) & 1;
              if (insideI === insideJ) continue;
              const denom = cSigned[j] - cSigned[i];
              const t = denom === 0 ? 0.5 : (level - cSigned[i]) / denom;
              px[crossings] = cx[i] + t * (cx[j] - cx[i]);
              py[crossings] = cy[i] + t * (cy[j] - cy[i]);
              pz[crossings] = cz[i] + t * (cz[j] - cz[i]);
              pSign[crossings] = positive ? 1 : -1;
              crossings++;
            }
            if (crossings === 3) {
              emit(0, 1, 2);
            } else if (crossings === 4) {
              // the quad in edge order (a-c, a-d, b-d, b-c for inside a,b)
              emit(0, 1, 3);
              emit(0, 3, 2);
            }
            // 6 crossings would mean a degenerate tet; the 6-tet decomposition
            // cannot produce one, and emitting nothing keeps the mesh closed
          }
        }
      }
    }
  }
  return { positions, normals, phases };
}
