// Six photo-referenced melee silhouettes. Loaded after art-melee.js so its
// existing animation/event data survives while only the static model changes.
const MeleeSixArt = (() => {
  const OUT = '#090b0d';
  const C = {
    steel: '#626d75', steelHi: '#aab4ba', steelLo: '#374149',
    edge: '#c4cbd0', rubber: '#343a3e', rubberHi: '#566067',
    wood: '#584538', woodHi: '#83705b', olive: '#48513d',
    oliveHi: '#6c765c', claw: '#44494d', clawHi: '#798187',
  };
  const specs = {};

  function model() {
    const pixels = new Map();
    const details = new Map();
    const key = (x, y) => `${x},${y}`;
    const put = (x, y, color) => pixels.set(key(x, y), color);
    const rect = (color, x, y, w, h) => {
      for (let iy = y; iy < y + h; iy++) for (let ix = x; ix < x + w; ix++) put(ix, iy, color);
    };
    const polygon = (color, points) => {
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
          let inside = false;
          for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i], b = points[j];
            if ((a[1] > y + 0.5) !== (b[1] > y + 0.5) &&
                x + 0.5 < (b[0] - a[0]) * (y + 0.5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
          }
          if (inside) put(x, y, color);
        }
      }
    };
    const stroke = (color, points, radius) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const x0 = Math.floor(Math.min(a[0], b[0]) - radius);
        const x1 = Math.ceil(Math.max(a[0], b[0]) + radius);
        const y0 = Math.floor(Math.min(a[1], b[1]) - radius);
        const y1 = Math.ceil(Math.max(a[1], b[1]) + radius);
        const dx = b[0] - a[0], dy = b[1] - a[1], d2 = dx * dx + dy * dy;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const t = d2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / d2)) : 0;
          if ((x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2 <= radius ** 2) put(x, y, color);
        }
      }
    };
    const ellipse = (color, cx, cy, rx, ry, erase = false) => {
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
        for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
            if (erase) pixels.delete(key(x, y)); else put(x, y, color);
          }
        }
      }
    };
    const detail = (x, y, color) => details.set(key(x, y), color);

    function runs(cells) {
      const rows = new Map();
      for (const [xy, color] of cells) {
        const [x, y] = xy.split(',').map(Number);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x, color });
      }
      const out = [];
      for (const [y, row] of rows) {
        row.sort((a, b) => a.x - b.x);
        for (const p of row) {
          const last = out[out.length - 1];
          if (last && last.y === y && last.color === p.color && last.x + last.w === p.x) last.w++;
          else out.push({ x: p.x, y, w: 1, color: p.color });
        }
      }
      return out;
    }

    let cached = null;
    function paint(ctx, inspect) {
      if (!cached) {
        const positions = [...pixels.keys()].map(k => k.split(',').map(Number));
        const minX = Math.min(...positions.map(p => p[0])) - 1;
        const maxX = Math.max(...positions.map(p => p[0])) + 1;
        const minY = Math.min(...positions.map(p => p[1])) - 1;
        const maxY = Math.max(...positions.map(p => p[1])) + 1;
        // Flood from outside: enclosed holes stay transparent at combat scale.
        const outside = new Set(), queue = [[minX, minY]];
        for (let i = 0; i < queue.length; i++) {
          const [x, y] = queue[i], k = key(x, y);
          if (x < minX || x > maxX || y < minY || y > maxY || outside.has(k) || pixels.has(k)) continue;
          outside.add(k);
          queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        }
        const border = new Map();
        for (const [x, y] of positions) {
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const k = key(x + dx, y + dy);
            if (outside.has(k)) border.set(k, OUT);
          }
        }
        cached = { border: runs(border), body: runs(pixels), detail: runs(details) };
      }
      for (const layer of [cached.border, cached.body, ...(inspect ? [cached.detail] : [])]) {
        for (const r of layer) { ctx.fillStyle = r.color; ctx.fillRect(r.x, r.y, r.w, 1); }
      }
    }
    return { put, rect, polygon, stroke, ellipse, detail, paint };
  }

  function knife() {
    const s = model();
    s.rect(C.rubber, 1, -1, 4, 3);
    s.rect(C.rubberHi, 1, -1, 4, 1);
    s.rect(C.steel, 0, -1, 1, 3);
    s.rect(C.steelHi, 5, -3, 1, 6);
    s.polygon(C.steel, [[6, -2], [12, -2], [17, 0], [13, 2], [6, 2]]);
    s.polygon(C.steelLo, [[6, -2], [12, -2], [15, -1], [6, -1]]);
    s.stroke(C.edge, [[6, 1], [12, 1], [15, 0], [17, 0]], 0.55);
    for (const x of [2, 3, 4]) s.detail(x, 0, C.rubberHi);
    for (const x of [7, 8, 9]) s.detail(x, -2, C.steelHi);
    specs.knife = { art: s, layout: { len: 17, muzzle: [17, 0], grip: [3, 0], fore: null, stock: [0, 0] },
      features: ['short tapered double-bevel blade', 'tall crossguard', 'ribbed dark grip'] };
  }

  function hachet() {
    const s = model();
    s.stroke(C.rubber, [[1, 4], [5, 3], [10, 2], [15, 0]], 1.3);
    s.stroke(C.rubberHi, [[2, 3], [7, 2], [12, 1]], 0.55);
    s.polygon(C.steelLo, [[14, -4], [18, -6], [21, -6], [20, -4], [18, -2], [19, 1], [21, 6], [17, 6], [16, 4], [14, 2], [16, 0]]);
    s.polygon(C.steel, [[17, -5], [21, -6], [20, -3], [19, -1], [20, 2], [21, 5], [18, 6], [17, 3]]);
    s.stroke(C.edge, [[20, -5], [19, -3], [19, 0], [20, 3], [21, 6]], 0.55);
    s.detail(17, -3, C.steelHi);
    s.detail(5, 4, C.rubberHi);
    specs.hachet = { art: s, layout: { len: 21, muzzle: [21, 3], grip: [4, 3], fore: [11, 1], stock: [0, 4] },
      features: ['tall hooked axe head', 'curved cutting edge', 'slender angled handle'] };
  }

  function kukri() {
    const s = model();
    s.polygon(C.wood, [[0, -1], [5, -1], [7, 0], [7, 2], [5, 3], [0, 3], [1, 1]]);
    s.rect(C.woodHi, 1, -1, 4, 1);
    s.rect(C.steelLo, 7, -1, 1, 4);
    s.polygon(C.steel, [[8, 0], [11, -2], [16, -3], [21, -2], [23, -1], [24, 0], [21, 2], [17, 5], [14, 4], [11, 2], [9, 1]]);
    s.polygon(C.steelLo, [[8, 0], [12, -2], [17, -3], [22, -2], [17, 0], [11, 1]]);
    s.stroke(C.edge, [[10, 2], [14, 4], [17, 5], [21, 2], [24, 0]], 0.55);
    s.detail(2, 1, C.steelHi); s.detail(5, 1, C.steelHi);
    s.stroke(C.steelHi, [[12, -1], [18, -2], [21, -1]], 0.55);
    specs.kukri = { art: s, layout: { len: 24, muzzle: [24, 0], grip: [4, 1], fore: null, stock: [0, 1] },
      features: ['forward-heavy curved belly', 'narrow waist at the hilt', 'flared wood pommel'] };
  }

  function machete() {
    const s = model();
    s.polygon(C.rubber, [[0, -1], [5, -1], [6, 0], [6, 2], [4, 3], [0, 2]]);
    s.rect(C.rubberHi, 1, -1, 4, 1);
    s.rect(C.steelLo, 6, -2, 1, 5);
    s.polygon(C.steel, [[7, -2], [23, -2], [25, -1], [26, 0], [25, 2], [22, 3], [7, 2]]);
    s.rect(C.steelLo, 8, -2, 14, 1);
    s.stroke(C.edge, [[8, 2], [21, 2], [24, 2], [26, 0]], 0.55);
    for (const x of [2, 4]) s.detail(x, 1, C.rubberHi);
    s.stroke(C.steelHi, [[10, 0], [21, 0]], 0.55);
    specs.machete = { art: s, layout: { len: 26, muzzle: [26, 0], grip: [4, 1], fore: null, stock: [0, 1] },
      features: ['long almost-straight blade', 'rounded downward tip', 'short black grip'] };
  }

  function spade() {
    const s = model();
    s.stroke(C.olive, [[2, -4], [0, -4], [0, 4], [2, 4]], 1.0);
    s.stroke(C.olive, [[2, -4], [8, 0], [2, 4]], 1.0);
    s.stroke(C.oliveHi, [[1, -4], [2, -4], [7, -1]], 0.55);
    s.stroke(C.olive, [[8, 0], [20, 0]], 1.0);
    s.rect(C.steelLo, 18, -2, 3, 5);
    s.polygon(C.olive, [[20, -5], [26, -5], [29, -3], [31, 0], [29, 3], [26, 5], [20, 5]]);
    s.stroke(C.oliveHi, [[21, -4], [26, -4], [29, -2]], 0.55);
    s.stroke(C.edge, [[29, -3], [31, 0], [29, 3]], 0.55);
    s.detail(19, 0, C.steelHi);
    specs.spade = { art: s, layout: { len: 31, muzzle: [31, 0], grip: [16, 0], fore: [22, 0], stock: [0, 0] },
      features: ['wide angular shovel head', 'long narrow shaft', 'open D-handle'] };
  }

  function claw() {
    const s = model();
    s.ellipse(C.claw, 4, 1, 5, 6);
    s.ellipse(null, 4, 1, 2.7, 3.6, true);
    s.rect(C.claw, 8, -2, 5, 6);
    s.ellipse(C.steelLo, 12, 0, 3, 3);
    // 用户 2026-10-01 指定：原来的多爪太丑，改成一根主爪。
    // 一根爪从轴心一次弯到爪尖，脊线走一道高光，爪尖再内勾一个小钩。
    const 主爪 = [[12, -3], [16, -6], [20, -7], [24, -6], [26, -3]];
    s.stroke(C.claw, 主爪, 2.2);
    s.stroke(C.clawHi, 主爪.slice(0, 4), 0.7);
    s.stroke(C.claw, [[24, -6], [26, -3], [25, -1]], 1.1);
    s.ellipse(C.clawHi, 12, 0, 1.3, 1.3);
    s.detail(11, 0, C.steelHi);
    specs.claw = { art: s, layout: { len: 26, muzzle: [26, -5], grip: [4, 1], fore: null, stock: [0, 1] },
      features: ['single hooked talon', 'central pivot', 'large open finger ring'] };
  }

  knife(); hachet(); kukri(); machete(); spade(); claw();
  for (const [id, spec] of Object.entries(specs)) {
    const previous = WeaponArt.get(id);
    WeaponArt.define(id, {
      ...previous,
      ver: 'melee-six-v1',
      layout: { ...previous.layout, ...spec.layout, eject: null, mag: null, magBase: null, sight: null },
      silhouette(ctx, art, pose, pen, opts) { spec.art.paint(ctx, !!(opts && opts.view === 'inspect')); },
      features: spec.features,
    });
  }
  return { ids: Object.keys(specs), makeModel: model };
})();
