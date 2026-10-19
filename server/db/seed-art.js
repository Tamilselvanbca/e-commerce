// Generates SVG illustrations for the demo sweets & snacks catalog: the food
// on a brass thali, banana leaf or bowl, plus a gift-pack shot. Purely
// decorative placeholders; replace them with real product photos in the admin.

const W = 800;
const H = 1000;

/** Deterministic PRNG so every seed run draws identical images. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (n) => Number(n.toFixed(1));

// ---------------------------------------------------------------------------
// Backgrounds and surfaces
// ---------------------------------------------------------------------------
function rangoliFlower(cx, cy, r, color, opacity) {
  const petals = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const px = cx + Math.cos(a) * r * 0.55;
    const py = cy + Math.sin(a) * r * 0.55;
    return `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(r * 0.42)}" ry="${f(r * 0.18)}" transform="rotate(${(i * 45).toFixed(0)} ${f(px)} ${f(py)})"/>`;
  }).join('');
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    return `<circle cx="${f(cx + Math.cos(a) * r * 1.08)}" cy="${f(cy + Math.sin(a) * r * 1.08)}" r="${f(r * 0.045)}"/>`;
  }).join('');
  return `<g fill="${color}" opacity="${opacity}">${petals}<circle cx="${cx}" cy="${cy}" r="${f(r * 0.16)}"/>${dots}</g>`;
}

function frame(inner, { label, bg = '#FBF1E1', accent = '#9A3412', scale = 1.22 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${shade(bg, 8)}"/><stop offset="1" stop-color="${shade(bg, -22)}"/></radialGradient>
  <radialGradient id="brass" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#F6DE97"/><stop offset=".55" stop-color="#D6A548"/><stop offset="1" stop-color="#9E6F25"/></radialGradient>
  <radialGradient id="brassIn" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#F3D27E"/><stop offset="1" stop-color="#C08B35"/></radialGradient>
  <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FA155"/><stop offset="1" stop-color="#2E6F35"/></linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${rangoliFlower(70, 70, 120, accent, 0.07)}${rangoliFlower(730, 70, 120, accent, 0.07)}
<g transform="translate(400 520) scale(${scale}) translate(-400 -540)">${inner}</g>
<text x="400" y="945" font-family="Georgia, 'Times New Roman', serif" font-size="32" fill="${accent}" text-anchor="middle" letter-spacing="3">${esc(label.toUpperCase())}</text>
</svg>`;
}

function brassPlate(cy) {
  return `<ellipse cx="400" cy="${cy + 26}" rx="340" ry="104" fill="#000" opacity=".1"/>
<ellipse cx="400" cy="${cy}" rx="340" ry="104" fill="url(#brass)"/>
<ellipse cx="400" cy="${cy - 6}" rx="296" ry="84" fill="url(#brassIn)"/>
<ellipse cx="400" cy="${cy - 6}" rx="296" ry="84" fill="none" stroke="#FBE7AE" stroke-width="3" opacity=".6"/>`;
}

function bananaLeaf(cy) {
  const veins = Array.from({ length: 11 }, (_, i) => {
    const x = 150 + i * 50;
    return `<path d="M${x} ${cy - 2} Q ${x + 24} ${cy - 60} ${x + 40} ${cy - 92}" stroke="#7CC47F" stroke-width="2" fill="none" opacity=".45"/>
<path d="M${x} ${cy + 2} Q ${x + 24} ${cy + 52} ${x + 40} ${cy + 80}" stroke="#7CC47F" stroke-width="2" fill="none" opacity=".35"/>`;
  }).join('');
  return `<path d="M50 ${cy + 28} C 180 ${cy - 170}, 620 ${cy - 170}, 760 ${cy - 8} C 640 ${cy + 130}, 200 ${cy + 150}, 50 ${cy + 28} Z" fill="#000" opacity=".1" transform="translate(0 18)"/>
<path d="M50 ${cy + 28} C 180 ${cy - 170}, 620 ${cy - 170}, 760 ${cy - 8} C 640 ${cy + 130}, 200 ${cy + 150}, 50 ${cy + 28} Z" fill="url(#leaf)"/>
${veins}
<path d="M60 ${cy + 26} Q 400 ${cy - 4} 752 ${cy - 6}" stroke="#A7D9A0" stroke-width="5" fill="none" opacity=".8"/>`;
}

/** Brass/terracotta bowl; returns { back, front } so contents can sit between. */
function bowl(cy, color = '#C9973E') {
  const back = `<ellipse cx="400" cy="${cy + 210}" rx="250" ry="40" fill="#000" opacity=".12"/>
<path d="M150 ${cy} C 160 ${cy + 230}, 640 ${cy + 230}, 650 ${cy} Z" fill="${shade(color, -10)}"/>
<ellipse cx="400" cy="${cy}" rx="250" ry="62" fill="${shade(color, -45)}"/>`;
  const front = `<path d="M150 ${cy} C 160 ${cy + 230}, 640 ${cy + 230}, 650 ${cy} C 600 ${cy + 52}, 200 ${cy + 52}, 150 ${cy} Z" fill="${color}"/>
<path d="M190 ${cy + 40} C 220 ${cy + 150}, 300 ${cy + 185}, 380 ${cy + 192}" stroke="#fff" stroke-opacity=".25" stroke-width="10" fill="none" stroke-linecap="round"/>
<ellipse cx="400" cy="${cy}" rx="250" ry="62" fill="none" stroke="${shade(color, 40)}" stroke-width="8"/>`;
  return { back, front };
}

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------
function ball(id, x, y, r, color, texture, rand) {
  let tex = '';
  if (texture === 'boondi') {
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      tex += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="${f(5 + rand() * 3)}" fill="${shade(color, Math.round(rand() * 40 - 20))}" stroke="${shade(color, -45)}" stroke-width="1" stroke-opacity=".5"/>`;
    }
  } else if (texture === 'coconut') {
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r * 0.95;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      tex += `<path d="M${f(px)} ${f(py)} l${f(rand() * 10 - 5)} ${f(rand() * 8 - 4)}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>`;
    }
  } else if (texture === 'grainy') {
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      tex += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="${f(1.5 + rand() * 1.5)}" fill="${shade(color, -35)}" opacity=".5"/>`;
    }
  } else if (texture === 'nutty') {
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r * 0.85;
      const nut = ['#E8C99A', '#8BB35A', '#6B3A1E', '#F3E2C0'][i % 4];
      tex += `<ellipse cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" rx="${f(7 + rand() * 6)}" ry="${f(4 + rand() * 3)}" fill="${nut}" transform="rotate(${Math.round(rand() * 180)} ${f(x + Math.cos(a) * d)} ${f(y + Math.sin(a) * d)})"/>`;
    }
  }
  return `<clipPath id="c${id}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>
<radialGradient id="g${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${shade(color, 45)}"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -50)}"/></radialGradient>
<circle cx="${x}" cy="${y}" r="${r}" fill="url(#g${id})"/>
<g clip-path="url(#c${id})">${tex}</g>
<ellipse cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.42)}" rx="${f(r * 0.32)}" ry="${f(r * 0.18)}" fill="#fff" opacity=".22" transform="rotate(-25 ${f(x - r * 0.35)} ${f(y - r * 0.42)})"/>`;
}

function cashew(x, y, s = 1, rot = 0) {
  return `<path d="M${x} ${y} c ${-10 * s} ${-14 * s}, ${6 * s} ${-30 * s}, ${22 * s} ${-22 * s} c ${-8 * s} ${4 * s}, ${-14 * s} ${12 * s}, ${-10 * s} ${22 * s} z" fill="#F1DDB3" stroke="#C9A46A" stroke-width="1.5" transform="rotate(${rot} ${x} ${y})"/>`;
}

function laddus(o, rand) {
  const base = 600;
  const r = 70;
  const spots = [
    [270, base - 30], [400, base - 22], [530, base - 30],
    [335, base - 128], [465, base - 128],
    [400, base - 226],
  ];
  const balls = spots.map(([x, y], i) => ball(`b${i}`, x, y, r, o.color, o.texture, rand)).join('');
  const nuts = o.toppings ? spots.map(([x, y], i) => (i % 2 === 0 ? cashew(x - 8, y - r + 14, 0.9, -20) : `<ellipse cx="${x + 10}" cy="${y - r + 18}" rx="9" ry="6" fill="#5B2A1A"/>`)).join('') : '';
  return brassPlate(base + 40) + balls + nuts;
}

/** Iso-style block piece with top face + two sides. */
function block(x, y, w, d, h, color, top) {
  const t = `M${x} ${y} l${w / 2} ${-d / 2} l${w / 2} ${d / 2} l${-w / 2} ${d / 2} z`;
  const left = `M${x} ${y} l${w / 2} ${d / 2} l0 ${h} l${-w / 2} ${-d / 2} z`;
  const right = `M${x + w} ${y} l${-w / 2} ${d / 2} l0 ${h} l${w / 2} ${-d / 2} z`;
  return `<path d="${left}" fill="${shade(color, -28)}"/><path d="${right}" fill="${shade(color, -14)}"/><path d="${t}" fill="${color}"/>${top ?? ''}`;
}

function diamonds(o, rand) {
  const base = 600;
  const pieces = [];
  const layers = [
    { y: base - 10, xs: [120, 250, 380, 510], d: 92 },
    { y: base - 70, xs: [185, 315, 445], d: 92 },
    { y: base - 130, xs: [250, 380], d: 92 },
  ];
  for (const layer of layers) {
    for (const x of layer.xs) {
      const w = 170;
      const foil = Array.from({ length: 10 }, () => `<circle cx="${f(x + 40 + rand() * 90)}" cy="${f(layer.y - 18 + rand() * 36)}" r="${f(2 + rand() * 4)}" fill="#fff" opacity="${f(0.4 + rand() * 0.5)}"/>`).join('');
      const top = `<path d="M${x} ${layer.y} l${w / 2} ${-layer.d / 2} l${w / 2} ${layer.d / 2} l${-w / 2} ${layer.d / 2} z" fill="url(#gloss)" opacity=".7"/>${o.foil ? foil : ''}`;
      pieces.push(block(x, layer.y, w, layer.d, 18, o.color, top));
    }
  }
  return brassPlate(base + 50) + pieces.join('');
}

function squares(o, rand) {
  const base = 610;
  const pieces = [];
  const rows = [
    { y: base - 10, xs: [150, 290, 430] },
    { y: base - 70, xs: [220, 360] },
    { y: base - 130, xs: [290] },
  ];
  for (const row of rows) {
    for (const x of row.xs) {
      const w = 180;
      const d = 100;
      const bits = (o.topping ?? []).flatMap((c) =>
        Array.from({ length: 6 }, () => {
          const px = x + 50 + rand() * 80;
          const py = row.y - 22 + rand() * 44;
          return `<rect x="${f(px)}" y="${f(py)}" width="${f(8 + rand() * 6)}" height="4" rx="2" fill="${c}" transform="rotate(${Math.round(rand() * 180)} ${f(px)} ${f(py)})"/>`;
        }),
      ).join('');
      pieces.push(block(x, row.y, w, d, 40, o.color, `<path d="M${x} ${row.y} l${w / 2} ${-d / 2} l${w / 2} ${d / 2} l${-w / 2} ${d / 2} z" fill="url(#gloss)" opacity=".35"/>${bits}`));
    }
  }
  return brassPlate(base + 60) + pieces.join('');
}

function porousBars(o, rand) {
  const base = 610;
  const pieces = [];
  const rows = [
    { y: base, xs: [130, 280, 430] },
    { y: base - 75, xs: [205, 355] },
    { y: base - 150, xs: [280] },
  ];
  for (const row of rows) {
    for (const x of row.xs) {
      const w = 200;
      const d = 90;
      const h = 56;
      const pores = Array.from({ length: 18 }, () => {
        const side = rand() < 0.5;
        const px = side ? x + 10 + rand() * 80 : x + 110 + rand() * 80;
        const py = row.y + 12 + rand() * (h - 8) + (side ? (px - x) * 0.45 : (x + w - px) * 0.45);
        return `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(3 + rand() * 4)}" ry="${f(2 + rand() * 3)}" fill="${shade(o.color, -60)}" opacity=".55"/>`;
      }).join('');
      pieces.push(block(x, row.y, w, d, h, o.color, `<path d="M${x} ${row.y} l${w / 2} ${-d / 2} l${w / 2} ${d / 2} l${-w / 2} ${d / 2} z" fill="url(#gloss)" opacity=".45"/>`) + pores);
    }
  }
  return brassPlate(base + 70) + pieces.join('');
}

function spiralPath(cx, cy, turns, r0, step, squash = 0.62) {
  const pts = [];
  for (let t = 0; t <= turns * Math.PI * 2; t += 0.12) {
    const r = r0 + (step * t) / (Math.PI * 2);
    pts.push(`${f(cx + Math.cos(t) * r)} ${f(cy + Math.sin(t) * r * squash)}`);
  }
  return `M${pts.join(' L')}`;
}

function jalebis(o) {
  const base = 600;
  const spots = [[260, base - 20], [540, base - 20], [400, base + 5], [330, base - 110], [480, base - 110]];
  const j = spots
    .map(([x, y]) => {
      const d = spiralPath(x, y, 2.6, 10, 26);
      return `<path d="${d}" stroke="${shade(o.color, -55)}" stroke-width="30" fill="none" stroke-linecap="round"/>
<path d="${d}" stroke="${o.color}" stroke-width="24" fill="none" stroke-linecap="round"/>
<path d="${d}" stroke="${shade(o.color, 60)}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7" transform="translate(-3 -5)"/>`;
    })
    .join('');
  return brassPlate(base + 60) + j;
}

function coils(o) {
  const base = 600;
  const spots = o.thin
    ? [[270, base - 10], [530, base - 10], [400, base + 10], [400, base - 110]]
    : [[285, base - 10], [515, base - 10], [400, base - 95]];
  const width = o.thin ? 13 : 24;
  const step = o.thin ? 16 : 27;
  const turns = o.thin ? 4.2 : 3;
  return (
    bananaLeaf(base + 40) +
    spots
      .map(([x, y]) => {
        const d = spiralPath(x, y, turns, 8, step, 0.58);
        return `<path d="${d}" stroke="${shade(o.color, -50)}" stroke-width="${width + 6}" fill="none" stroke-linecap="round"/>
<path d="${d}" stroke="${o.color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>
<path d="${d}" stroke="${shade(o.color, -38)}" stroke-width="${Math.round(width * 0.45)}" fill="none" stroke-dasharray="3 7" stroke-linecap="round"/>
<path d="${d}" stroke="${shade(o.color, 50)}" stroke-width="3" fill="none" opacity=".6" transform="translate(-2 -4)"/>`;
      })
      .join('')
  );
}

function mixtureBowl(o, rand) {
  const cy = 520;
  const { back, front } = bowl(cy, '#B8862F');
  let bits = '';
  for (let i = 0; i < 320; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    const x = 400 + Math.cos(a) * d * 230;
    const y = cy - 10 + Math.sin(a) * d * 52 - (1 - d) * 70;
    const k = rand();
    if (k < 0.55) {
      bits += `<path d="M${f(x)} ${f(y)} q ${f(rand() * 14 - 7)} ${f(-6 - rand() * 6)} ${f(rand() * 24 - 12)} ${f(rand() * 6 - 3)}" stroke="${shade('#E8A33D', Math.round(rand() * 30 - 15))}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    } else if (k < 0.75) {
      bits += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="6" fill="${shade('#B5651D', Math.round(rand() * 20 - 10))}" stroke="#7A3E12" stroke-width="1"/>`;
    } else if (k < 0.85) {
      bits += `<path d="M${f(x)} ${f(y)} q 10 -10 20 0 q -10 10 -20 0 z" fill="#2F7A33" transform="rotate(${Math.round(rand() * 180)} ${f(x)} ${f(y)})"/>`;
    } else if (k < 0.95) {
      bits += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(5 + rand() * 3)}" fill="#F5D27A" stroke="#C9973E" stroke-width="1"/>`;
    } else {
      bits += `<rect x="${f(x)}" y="${f(y)}" width="10" height="4" rx="2" fill="${o.spicy ? '#C81E1E' : '#E25822'}"/>`;
    }
  }
  if (o.spicy) {
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand());
      bits += `<circle cx="${f(400 + Math.cos(a) * d * 220)}" cy="${f(cy - 20 + Math.sin(a) * d * 50 - (1 - d) * 60)}" r="2.5" fill="#B91C1C"/>`;
    }
  }
  return `${back}<path d="M160 ${cy} C 220 ${cy - 140}, 580 ${cy - 140}, 640 ${cy} C 580 ${cy + 40}, 220 ${cy + 40}, 160 ${cy} Z" fill="#D9963A"/>${bits}${front}`;
}

function ribbons(o, rand) {
  const base = 600;
  let r = '';
  for (let i = 0; i < 9; i++) {
    const x = 170 + rand() * 380;
    const y = base - 120 + rand() * 150;
    const rot = Math.round(rand() * 360);
    const d = `M${f(x)} ${f(y)} q 20 -26 40 0 t 40 0 t 40 0 t 40 0`;
    r += `<g transform="rotate(${rot} ${f(x + 80)} ${f(y)})"><path d="${d}" stroke="${shade(o.color, -45)}" stroke-width="30" fill="none" stroke-linecap="round"/>
<path d="${d}" stroke="${o.color}" stroke-width="24" fill="none" stroke-linecap="round"/>
<path d="${d}" stroke="${shade(o.color, -30)}" stroke-width="3" fill="none" stroke-dasharray="2 5"/></g>`;
  }
  return bananaLeaf(base + 40) + r;
}

function smallBalls(o, rand) {
  const base = 600;
  let b = '';
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    const x = 400 + Math.cos(a) * d * 230;
    const y = base - 10 + Math.sin(a) * d * 60 - (1 - d) * 120;
    b += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(10 + rand() * 4)}" fill="${shade(o.color, Math.round(rand() * 36 - 18))}" stroke="${shade(o.color, -50)}" stroke-width="1.2"/>`;
    if (rand() < 0.05) b += `<path d="M${f(x)} ${f(y)} q 12 -12 24 0 q -12 12 -24 0 z" fill="#2F7A33"/>`;
    if (rand() < 0.06) b += `<ellipse cx="${f(x + 6)}" cy="${f(y)}" rx="9" ry="6" fill="#C17A3A" stroke="#7A3E12" stroke-width="1"/>`;
  }
  return bananaLeaf(base + 50) + b;
}

function chips(o, rand) {
  const base = 600;
  let c = '';
  const spots = [];
  for (let i = 0; i < 26; i++) spots.push([170 + rand() * 460, base - 150 + rand() * 170]);
  spots.sort((p, q) => p[1] - q[1]);
  for (const [x, y] of spots) {
    const rot = Math.round(rand() * 180);
    c += `<g transform="rotate(${rot} ${f(x)} ${f(y)})"><ellipse cx="${f(x)}" cy="${f(y)}" rx="48" ry="40" fill="${shade(o.color, -40)}"/>
<ellipse cx="${f(x)}" cy="${f(y)}" rx="44" ry="36" fill="${o.color}"/>
<ellipse cx="${f(x)}" cy="${f(y)}" rx="22" ry="17" fill="none" stroke="${shade(o.color, -25)}" stroke-width="2" opacity=".6"/>
<path d="M${f(x - 30)} ${f(y - 14)} q 20 -16 44 -10" stroke="#fff" stroke-width="5" fill="none" opacity=".35" stroke-linecap="round"/></g>`;
    if (o.pepper) for (let k = 0; k < 6; k++) c += `<circle cx="${f(x - 25 + rand() * 50)}" cy="${f(y - 20 + rand() * 40)}" r="2.2" fill="#222"/>`;
  }
  return bananaLeaf(base + 40) + c;
}

function discs(o, rand) {
  const base = 620;
  let d = '';
  const stack = [[400, base, 1], [300, base - 30, 0.95], [500, base - 30, 0.95], [400, base - 70, 0.92], [400, base - 115, 0.9]];
  for (const [x, y, s] of stack) {
    const rx = 120 * s;
    const ry = 42 * s;
    d += `<ellipse cx="${x}" cy="${y + 14}" rx="${f(rx)}" ry="${f(ry)}" fill="${shade(o.color, -40)}"/>
<ellipse cx="${x}" cy="${y}" rx="${f(rx)}" ry="${f(ry)}" fill="${o.color}"/>
<ellipse cx="${x}" cy="${y}" rx="${f(rx * 0.8)}" ry="${f(ry * 0.7)}" fill="${shade(o.color, 18)}" opacity=".5"/>`;
    for (let k = 0; k < 16; k++) d += `<ellipse cx="${f(x - rx * 0.8 + rand() * rx * 1.6)}" cy="${f(y - ry * 0.6 + rand() * ry * 1.2)}" rx="3" ry="1.6" fill="#F7EEDB"/>`;
  }
  return brassPlate(base + 50) + d;
}

function halwaBowl(o, rand) {
  const cy = 520;
  const { back, front } = bowl(cy, '#C9973E');
  let top = `<path d="M165 ${cy} C 230 ${cy - 150}, 570 ${cy - 150}, 635 ${cy} C 570 ${cy + 40}, 230 ${cy + 40}, 165 ${cy} Z" fill="${o.color}"/>
<path d="M240 ${cy - 50} C 320 ${cy - 110}, 470 ${cy - 112}, 560 ${cy - 52}" stroke="#fff" stroke-opacity=".3" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 14; i++) {
    const x = 240 + rand() * 320;
    const y = cy - 70 + rand() * 70;
    top += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="14" ry="6" fill="#F4E3C3" stroke="#C9A46A" stroke-width="1.5" transform="rotate(${Math.round(rand() * 180)} ${f(x)} ${f(y)})"/>`;
  }
  for (let i = 0; i < 10; i++) {
    const x = 250 + rand() * 300;
    const y = cy - 60 + rand() * 60;
    top += `<path d="M${f(x)} ${f(y)} l ${f(rand() * 14 - 7)} ${f(rand() * 10 - 5)}" stroke="#D9480F" stroke-width="2" stroke-linecap="round"/>`;
  }
  return back + top + front;
}

function jamunBowl(o) {
  const cy = 500;
  const { back, front } = bowl(cy, '#C9973E');
  const balls = [[300, cy - 20], [400, cy - 10], [500, cy - 20], [350, cy - 70], [450, cy - 70]]
    .map(([x, y], i) => `<radialGradient id="j${i}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${shade(o.color, 60)}"/><stop offset=".55" stop-color="${o.color}"/><stop offset="1" stop-color="${shade(o.color, -45)}"/></radialGradient>
<circle cx="${x}" cy="${y}" r="58" fill="url(#j${i})"/>
<ellipse cx="${x - 20}" cy="${y - 26}" rx="18" ry="10" fill="#fff" opacity=".45"/>`)
    .join('');
  const syrup = `<ellipse cx="400" cy="${cy + 4}" rx="236" ry="56" fill="#E0A23A" opacity=".85"/>`;
  return back + syrup + balls + front;
}

function bars(o, rand) {
  const base = 600;
  let b = '';
  const rows = [
    { y: base, xs: [130, 300, 470] },
    { y: base - 60, xs: [215, 385] },
  ];
  for (const row of rows) {
    for (const x of row.xs) {
      b += block(x, row.y, 200, 80, 26, o.color, `<path d="M${x} ${row.y} l100 -40 l100 40 l-100 40 z" fill="url(#gloss)" opacity=".5"/>`);
      for (let k = 0; k < 16; k++) {
        const px = x + 40 + rand() * 120;
        const py = row.y - 22 + rand() * 44;
        b += o.seeds === 'sesame'
          ? `<ellipse cx="${f(px)}" cy="${f(py)}" rx="3.5" ry="2" fill="#F7EEDB" transform="rotate(${Math.round(rand() * 180)} ${f(px)} ${f(py)})"/>`
          : `<ellipse cx="${f(px)}" cy="${f(py)}" rx="9" ry="6" fill="#C98B4A" stroke="#8A5424" stroke-width="1"/>`;
      }
    }
  }
  return brassPlate(base + 60) + b;
}

function giftBox(o) {
  const c = o.color ?? '#7C222C';
  const gold = '#E9B949';
  const x = 190;
  const y = 380;
  const w = 420;
  const h = 300;
  const kolamDots = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => `<circle cx="${x + w / 2 - 50 + i * 50}" cy="${y - 52 + j * 18}" r="4" fill="${gold}"/>`)).join('');
  return `<ellipse cx="400" cy="${y + h + 30}" rx="300" ry="40" fill="#000" opacity=".12"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${c}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="url(#gloss)" opacity=".18"/>
<rect x="${x + 190}" y="${y}" width="40" height="${h}" fill="${gold}"/>
<path d="M${x - 16} ${y - 90} h ${w + 32} v 90 h ${-(w + 32)} z" fill="${shade(c, 18)}"/>
<path d="M${x - 16} ${y - 90} h ${w + 32} v 18 h ${-(w + 32)} z" fill="${shade(c, 35)}"/>
<rect x="${x + 190}" y="${y - 90}" width="40" height="90" fill="${shade(gold, 10)}"/>
${kolamDots}
<path d="M400 ${y - 92} C 340 ${y - 190}, 270 ${y - 140}, 330 ${y - 100} Z" fill="${gold}" stroke="${shade(gold, -40)}" stroke-width="3"/>
<path d="M400 ${y - 92} C 460 ${y - 190}, 530 ${y - 140}, 470 ${y - 100} Z" fill="${gold}" stroke="${shade(gold, -40)}" stroke-width="3"/>
<circle cx="400" cy="${y - 96}" r="16" fill="${shade(gold, -15)}"/>
${rangoliFlower(300, y + 150, 48, gold, 0.55)}${rangoliFlower(500, y + 150, 48, gold, 0.55)}`;
}

const DRAWERS = {
  laddus,
  diamonds,
  squares,
  porousBars,
  jalebis,
  coils,
  mixtureBowl,
  ribbons,
  smallBalls,
  chips,
  discs,
  halwaBowl,
  jamunBowl,
  bars,
  giftBox,
};

/** Main product illustration. */
export function productArt(name, art, seed) {
  const draw = DRAWERS[art.kind];
  if (!draw) throw new Error(`Unknown art kind ${art.kind}`);
  return frame(draw(art, rng(seed)), { label: name, bg: art.bg ?? '#FBF1E1', accent: '#8A2A1C' });
}

/** Second image: the product's gift pack with the green "vegetarian" mark. */
export function packArt(name, color, seed, storeName) {
  const rand = rng(seed + 99);
  const words = name.split(' ');
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 14) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const box = shade(color, -10);
  const sprinkles = Array.from({ length: 30 }, () => `<circle cx="${f(220 + rand() * 360)}" cy="${f(270 + rand() * 80)}" r="${f(2 + rand() * 3)}" fill="#E9B949" opacity=".7"/>`).join('');
  const text = lines
    .slice(0, 3)
    .map((l, i) => `<text x="400" y="${520 + i * 58}" font-family="Georgia, 'Times New Roman', serif" font-size="50" font-weight="bold" fill="#3B1A12" text-anchor="middle">${esc(l)}</text>`)
    .join('');
  const inner = `<ellipse cx="400" cy="860" rx="280" ry="36" fill="#000" opacity=".12"/>
<path d="M190 250 h420 l-20 600 h-380 z" fill="${box}"/>
<path d="M190 250 h420 l-6 90 h-408 z" fill="${shade(box, 25)}"/>
${sprinkles}
<rect x="235" y="400" width="330" height="330" rx="18" fill="#FFF8EC" stroke="#E9B949" stroke-width="6"/>
${rangoliFlower(400, 448, 30, '#B03A45', 0.85)}
${text}
<text x="400" y="${540 + Math.min(lines.length, 3) * 58}" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#7C6955" text-anchor="middle" letter-spacing="4">FRESHLY MADE</text>
<rect x="510" y="680" width="34" height="34" fill="#fff" stroke="#16A34A" stroke-width="4"/><circle cx="527" cy="697" r="9" fill="#16A34A"/>
<text x="400" y="806" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#FFF3D6" text-anchor="middle" letter-spacing="2">${esc(storeName)}</text>`;
  return frame(inner, { label: `${name} · gift pack`, bg: '#F7EBDD', accent: '#8A2A1C', scale: 1 });
}
