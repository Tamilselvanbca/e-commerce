// Generator for traditional South Indian *sikku* (line) kolams.
//
// A sikku kolam is drawn as one or more closed lines that weave around a grid
// of dots (pulli) without ever touching them. They can be described with the
// "mirror curve" model: the line travels diagonally between the dots, crosses
// itself at the midpoint between two neighbouring dots, and bounces off the
// border of the grid and off "mirrors" placed between some pairs of dots.
// Different mirror layouts give different kolams.
//
// Coordinates use a doubled grid: dot (i, j) sits at (2i + 1, 2j + 1), and the
// line passes through the points with an odd coordinate sum (the midpoints
// between dots and the half-steps outside the border). The output is
// deterministic for a given seed, so server and client renders match.

export type KolamOptions = {
  /** Dots per side for a square kolam (`cols` and `rows` default to this). */
  size?: number;
  cols?: number;
  rows?: number;
  /** Seed for the mirror layout. */
  seed?: number;
  /** Share of crossing points that become mirrors (0–1). Traditional designs sit around 0.2–0.4. */
  mirrorDensity?: number;
  /** Apply 8-fold (square) symmetry to the mirror layout. Ignored for non-square grids. */
  symmetric?: boolean;
  /**
   * Dot layout: a full square grid, or the traditional diamond (1-3-5-…-5-3-1 dots per row).
   * Diamond needs an odd `size`.
   */
  shape?: "square" | "diamond";
};

export type KolamLoop = { d: string; length: number };

export type Kolam = {
  /** Width and height of the drawing in grid units (dots are 2 units apart). */
  width: number;
  height: number;
  dots: [number, number][];
  loops: KolamLoop[];
};

type Mirror = 0 | "flipX" | "flipY";
type Pt = [number, number];

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KAPPA = 0.5523; // cubic Bézier approximation of a quarter circle

export function generateKolam(options: KolamOptions = {}): Kolam {
  const cols = options.cols ?? options.size ?? 5;
  const rows = options.rows ?? options.size ?? 5;
  const W = cols * 2;
  const H = rows * 2;
  const random = rng(options.seed ?? 1);
  const density = options.mirrorDensity ?? 0.3;
  const symmetric = (options.symmetric ?? true) && cols === rows;
  const key = (x: number, y: number) => `${x},${y}`;

  // --- Dots ------------------------------------------------------------------
  const present = new Set<string>();
  const dots: [number, number][] = [];
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (options.shape === "diamond" && Math.abs(i - cx) + Math.abs(j - cy) > Math.min(cx, cy) + 1e-9) continue;
      present.add(key(2 * i + 1, 2 * j + 1));
      dots.push([2 * i + 1, 2 * j + 1]);
    }
  }
  const hasDot = (x: number, y: number) => present.has(key(x, y));

  /** Number of dots on either side of a line point (0, 1 or 2). */
  const neighbours = (x: number, y: number) =>
    x % 2 === 0 ? Number(hasDot(x - 1, y)) + Number(hasDot(x + 1, y)) : Number(hasDot(x, y - 1)) + Number(hasDot(x, y + 1));

  // --- Mirror layout on interior crossing points --------------------------
  const mirrors = new Map<string, Mirror>();
  // Interior = the line can cross here: dots on both sides.
  const isInterior = (x: number, y: number) => (x + y) % 2 === 1 && x > 0 && x < W && y > 0 && y < H && neighbours(x, y) === 2;
  const swap = (m: Mirror): Mirror => (m === "flipX" ? "flipY" : m === "flipY" ? "flipX" : 0);
  const pickMirror = (): Mirror => (random() < density ? (random() < 0.5 ? "flipX" : "flipY") : 0);

  // The 8 symmetries of the square; `swaps` marks those that turn horizontal mirrors into vertical ones.
  const transforms: { fn: (x: number, y: number) => Pt; swaps: boolean }[] = [
    { fn: (x, y) => [x, y], swaps: false },
    { fn: (x, y) => [y, W - x], swaps: true },
    { fn: (x, y) => [W - x, H - y], swaps: false },
    { fn: (x, y) => [H - y, x], swaps: true },
    { fn: (x, y) => [W - x, y], swaps: false },
    { fn: (x, y) => [x, H - y], swaps: false },
    { fn: (x, y) => [y, x], swaps: true },
    { fn: (x, y) => [W - y, H - x], swaps: true },
  ];

  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      if (!isInterior(x, y) || mirrors.has(key(x, y))) continue;
      const m = pickMirror();
      if (!symmetric) {
        mirrors.set(key(x, y), m);
        continue;
      }
      for (const t of transforms) {
        const [tx, ty] = t.fn(x, y);
        if (!mirrors.has(key(tx, ty))) mirrors.set(key(tx, ty), t.swaps ? swap(m) : m);
      }
    }
  }

  // --- Trace the closed lines ----------------------------------------------
  const visited = new Set<string>();
  const segKey = (a: Pt, b: Pt) => {
    const ka = key(a[0], a[1]);
    const kb = key(b[0], b[1]);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  /**
   * Each diagonal step runs along one side of the diamond around exactly one
   * dot; the step is part of the kolam only if that dot exists.
   */
  const validStep = (p: Pt, d: Pt) => {
    const [x, y] = p;
    const dot: Pt = x % 2 === 0 ? [x + d[0], y] : [x, y + d[1]];
    return hasDot(dot[0], dot[1]);
  };

  /** Direction after arriving at `p` while moving in direction `d`. */
  const turn = (p: Pt, d: Pt): Pt => {
    const [x, y] = p;
    let [dx, dy] = d;
    if (neighbours(x, y) < 2) {
      // Border: bounce back around the single neighbouring dot.
      if (x % 2 === 0) dx = -dx;
      else dy = -dy;
    } else {
      const m = mirrors.get(key(x, y)) ?? 0;
      if (m === "flipX") dx = -dx;
      else if (m === "flipY") dy = -dy;
    }
    return [dx, dy];
  };

  const loops: Pt[][] = [];
  const dirs: Pt[] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) {
      if ((x + y) % 2 !== 1) continue;
      for (const d of dirs) {
        const start: Pt = [x, y];
        const next: Pt = [x + d[0], y + d[1]];
        if (!validStep(start, d) || visited.has(segKey(start, next))) continue;
        // Walk until we come back to the starting segment.
        const pts: Pt[] = [];
        let p = start;
        let dir = d;
        for (let guard = 0; guard < 100_000; guard++) {
          const q: Pt = [p[0] + dir[0], p[1] + dir[1]];
          visited.add(segKey(p, q));
          pts.push(p);
          dir = turn(q, dir);
          p = q;
          if (p[0] === start[0] && p[1] === start[1] && dir[0] === d[0] && dir[1] === d[1]) break;
        }
        loops.push(pts);
      }
    }
  }

  // --- Smooth rendering ------------------------------------------------------
  // Each segment's midpoint is joined to the next with a cubic curve whose
  // control points lean towards the shared vertex. Straight runs (crossings)
  // stay straight; 90° bounces become quarter circles around a dot.
  const fmt = (n: number) => Number(n.toFixed(3));
  const toPath = (pts: Pt[]): KolamLoop => {
    const n = pts.length;
    const mid = (i: number): Pt => {
      const a = pts[(i + n) % n];
      const b = pts[(i + 1 + n) % n];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    };
    let m0 = mid(-1);
    let d = `M${fmt(m0[0])} ${fmt(m0[1])}`;
    let length = 0;
    for (let i = 0; i < n; i++) {
      const v = pts[i];
      const m1 = mid(i);
      const straight = Math.abs((v[0] - m0[0]) * (m1[1] - v[1]) - (v[1] - m0[1]) * (m1[0] - v[0])) < 1e-9;
      if (straight) {
        d += `L${fmt(m1[0])} ${fmt(m1[1])}`;
        length += Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
      } else {
        const c1: Pt = [m0[0] + KAPPA * (v[0] - m0[0]), m0[1] + KAPPA * (v[1] - m0[1])];
        const c2: Pt = [m1[0] + KAPPA * (v[0] - m1[0]), m1[1] + KAPPA * (v[1] - m1[1])];
        d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(m1[0])} ${fmt(m1[1])}`;
        length += (Math.PI / 2) * Math.hypot(m0[0] - v[0], m0[1] - v[1]); // quarter arc
      }
      m0 = m1;
    }
    return { d: `${d}Z`, length };
  };

  return { width: W, height: H, dots, loops: loops.map(toPath).sort((a, b) => b.length - a.length) };
}
