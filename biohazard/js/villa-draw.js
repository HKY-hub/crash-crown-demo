// ============ 别墅横截面 · 程序化生成器（渲染层，只读模型不产生随机） ============
// 分层顺序：远景 → 庭院 → 背墙 → 墙面细节/门窗 → 楼板与侧墙 → 楼梯电梯 →
//          大家具 → 小物件 → 前景结构 → 灯光氛围
// 所有纹理走「线条 / 接缝 / 反光 / 边缘高光 / 阴影 / 细微色变」的组合，
// 不用文生图、不用预制贴图；随机一律取模型里已固化的 f.seed，保证同 seed 同画面。
const VillaDraw = (() => {
  const P = n => Math.round(n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const PAL = {
    day: {
      sky: ['#8fb4cc', '#a9c6d6', '#c9dbdf'], hill: '#6f8a7a', far: '#7d8f95',
      ground: ['#6b7f5e', '#5a6b4e'], dirt: '#6a5a48', ambient: 1.0,
      winOut: '#9fc0cf', star: 0,
    },
    night: {
      sky: ['#0d1622', '#152233', '#1d2c3d'], hill: '#16222c', far: '#1b2836',
      ground: ['#26332c', '#1d2822'], dirt: '#2a2419', ambient: 0.34,
      winOut: '#1a2733', star: 1,
    },
  };

  // ---------- 材质 ----------
  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    return a === undefined ? 'hsl(' + P(h) + ',' + P(s) + '%,' + P(l) + '%)'
      : 'hsla(' + P(h) + ',' + P(s) + '%,' + P(l) + '%,' + a + ')';
  }
  // 确定性抖动噪点（同 seed 同图案）
  function speckle(ctx, x, y, w, h, color, seed, density, cell) {
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const c = cell || 3;
    ctx.fillStyle = color;
    for (let j = 0; j < h; j += c) for (let i = 0; i < w; i += c) if (rnd() < density) ctx.fillRect(P(x + i), P(y + j), c, c);
  }
  function edge(ctx, x, y, w, h, light, dark) {
    ctx.fillStyle = light; ctx.fillRect(P(x), P(y), P(w), 1); ctx.fillRect(P(x), P(y), 1, P(h));
    ctx.fillStyle = dark; ctx.fillRect(P(x), P(y + h - 1), P(w), 1); ctx.fillRect(P(x + w - 1), P(y), 1, P(h));
  }

  // 六种可复用材质表面
  function surface(ctx, mat, x, y, w, h, hue, seed, amb) {
    const L = v => v * (0.55 + amb * 0.45);
    switch (mat) {
      case 'wood': {
        ctx.fillStyle = hsl(hue, 38, L(38)); ctx.fillRect(P(x), P(y), P(w), P(h));
        const pw = 26;
        for (let i = 0; i < w; i += pw) {
          ctx.fillStyle = hsl(hue, 40, L(30)); ctx.fillRect(P(x + i), P(y), 1, P(h));
          ctx.fillStyle = hsl(hue, 34, L(46), 0.5); ctx.fillRect(P(x + i + 1), P(y), 1, P(h));
        }
        let s = (seed >>> 0) || 1;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        ctx.fillStyle = hsl(hue, 42, L(26), 0.45);
        for (let i = 0; i < w; i += 26) for (let k = 0; k < 3; k++) {
          const gy = y + 3 + rnd() * (h - 6);
          ctx.fillRect(P(x + i + 3), P(gy), P(16 + rnd() * 6), 1);
        }
        break;
      }
      case 'tile': {
        ctx.fillStyle = hsl(hue, 14, L(72)); ctx.fillRect(P(x), P(y), P(w), P(h));
        const ts = 18;
        ctx.fillStyle = hsl(hue, 12, L(52));
        for (let i = 0; i <= w; i += ts) ctx.fillRect(P(x + i), P(y), 1, P(h));
        for (let j = 0; j <= h; j += ts) ctx.fillRect(P(x), P(y + j), P(w), 1);
        ctx.fillStyle = hsl(hue, 20, L(88), 0.5);
        for (let i = 0; i < w; i += ts) for (let j = 0; j < h; j += ts) ctx.fillRect(P(x + i + 2), P(y + j + 2), 3, 2);
        break;
      }
      case 'stone': {
        ctx.fillStyle = hsl(hue, 8, L(52)); ctx.fillRect(P(x), P(y), P(w), P(h));
        speckle(ctx, x, y, w, h, hsl(hue, 8, L(40), 0.55), seed, 0.1, 3);
        speckle(ctx, x, y, w, h, hsl(hue, 10, L(66), 0.4), seed ^ 0x5bf, 0.06, 3);
        break;
      }
      case 'concrete': {
        ctx.fillStyle = hsl(hue, 6, L(46)); ctx.fillRect(P(x), P(y), P(w), P(h));
        speckle(ctx, x, y, w, h, hsl(hue, 6, L(36), 0.5), seed, 0.09, 4);
        ctx.fillStyle = hsl(hue, 6, L(30), 0.5);
        let s = (seed >>> 0) || 1;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let k = 0; k < Math.max(1, Math.round(w / 90)); k++) {
          const cx = x + rnd() * w, cy = y + rnd() * h;
          ctx.fillRect(P(cx), P(cy), P(6 + rnd() * 14), 1);
          ctx.fillRect(P(cx + 4), P(cy + 1), 1, P(3 + rnd() * 5));
        }
        break;
      }
      case 'plaster': {
        ctx.fillStyle = hsl(hue, 12, L(64)); ctx.fillRect(P(x), P(y), P(w), P(h));
        speckle(ctx, x, y, w, h, hsl(hue, 12, L(56), 0.35), seed, 0.05, 4);
        break;
      }
      case 'wallpaper': {
        ctx.fillStyle = hsl(hue, 22, L(58)); ctx.fillRect(P(x), P(y), P(w), P(h));
        ctx.fillStyle = hsl(hue, 24, L(50), 0.55);
        for (let i = 0; i < w; i += 14) ctx.fillRect(P(x + i), P(y), 2, P(h));
        ctx.fillStyle = hsl(hue, 26, L(70), 0.30);
        for (let i = 7; i < w; i += 14) ctx.fillRect(P(x + i), P(y), 1, P(h));
        break;
      }
      case 'glass': {
        ctx.fillStyle = hsl(hue, 22, L(70), 0.35); ctx.fillRect(P(x), P(y), P(w), P(h));
        ctx.fillStyle = hsl(hue, 30, L(92), 0.25);
        for (let i = 0; i < w; i += 9) ctx.fillRect(P(x + i), P(y), 2, P(h));
        break;
      }
      default: {
        ctx.fillStyle = hsl(hue, 10, L(58)); ctx.fillRect(P(x), P(y), P(w), P(h));
      }
    }
  }
  // 金属 / 织物 / 玻璃件（家具用，不是大面积表面）
  function metal(ctx, x, y, w, h, hue, tone) {
    const t = tone === undefined ? 0 : tone;
    ctx.fillStyle = hsl(210 + hue * 0.02, 8, 44 + t); ctx.fillRect(P(x), P(y), P(w), P(h));
    ctx.fillStyle = hsl(200, 10, 68 + t, 0.85); ctx.fillRect(P(x), P(y), P(w), 2);
    ctx.fillStyle = hsl(210, 12, 24 + t, 0.9); ctx.fillRect(P(x), P(y + h - 2), P(w), 2);
    ctx.fillStyle = hsl(210, 10, 56 + t, 0.5); ctx.fillRect(P(x), P(y), 2, P(h));
  }
  function fabric(ctx, x, y, w, h, hue, sat) {
    ctx.fillStyle = hsl(hue, sat === undefined ? 34 : sat, 44); ctx.fillRect(P(x), P(y), P(w), P(h));
    ctx.fillStyle = hsl(hue, sat === undefined ? 34 : sat, 54, 0.5); ctx.fillRect(P(x), P(y), P(w), 2);
    ctx.fillStyle = hsl(hue, sat === undefined ? 34 : sat, 30, 0.45); ctx.fillRect(P(x), P(y + h - 2), P(w), 2);
    speckle(ctx, x, y, w, h, hsl(hue, 30, 36, 0.30), (x * 7 + y * 13) >>> 0, 0.08, 2);
  }

  // ---------- 家具绘制 ----------
  function legs(ctx, x, y, w, h, hue) {
    ctx.fillStyle = hsl(hue, 20, 26);
    ctx.fillRect(P(x + 3), P(y), 4, P(h)); ctx.fillRect(P(x + w - 7), P(y), 4, P(h));
  }
  function drawers(ctx, x, y, w, h, rows, hue, knobHue) {
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const ry = y + i * rh;
      ctx.fillStyle = hsl(hue, 26, 40); ctx.fillRect(P(x + 2), P(ry + 2), P(w - 4), P(rh - 4));
      ctx.fillStyle = hsl(hue, 24, 52, 0.6); ctx.fillRect(P(x + 2), P(ry + 2), P(w - 4), 1);
      ctx.fillStyle = hsl(knobHue === undefined ? 42 : knobHue, 40, 62);
      ctx.fillRect(P(x + w / 2 - 6), P(ry + rh / 2 - 1), 12, 2);
    }
  }
  function booksIn(ctx, x, y, w, h, seed) {
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let cx = x + 1;
    while (cx < x + w - 3) {
      const bw = 2 + Math.floor(rnd() * 3), bh = h * (0.6 + rnd() * 0.38);
      ctx.fillStyle = hsl(rnd() * 360, 34, 40 + rnd() * 16);
      ctx.fillRect(P(cx), P(y + h - bh), bw, P(bh));
      cx += bw + (rnd() < 0.12 ? 3 : 0);
    }
  }

  const FD = {
    sofa(ctx, f) {
      const { x, y, w, h } = f, hue = f.hue + 8;
      fabric(ctx, x, y + h * 0.34, w, h * 0.5, hue);
      fabric(ctx, x, y, w * 0.16, h * 0.72, hue);
      fabric(ctx, x + w * 0.84, y, w * 0.16, h * 0.72, hue);
      fabric(ctx, x + w * 0.1, y + h * 0.06, w * 0.8, h * 0.36, hue - 6);
      for (let i = 0; i < 3; i++) {
        const cw = (w * 0.76) / 3;
        fabric(ctx, x + w * 0.11 + i * cw, y + h * 0.4, cw - 3, h * 0.24, hue + 6);
      }
      legs(ctx, x + 4, y + h - 4, w - 8, 5, 26);
    },
    sofaSmall(ctx, f) { FD.sofa(ctx, Object.assign({}, f, { w: f.w })); },
    armchair(ctx, f) {
      const { x, y, w, h } = f, hue = f.hue + 14;
      fabric(ctx, x, y + h * 0.36, w, h * 0.5, hue);
      fabric(ctx, x, y, w * 0.22, h * 0.74, hue);
      fabric(ctx, x + w * 0.78, y, w * 0.22, h * 0.74, hue);
      fabric(ctx, x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.32, hue - 8);
      legs(ctx, x + 3, y + h - 4, w - 6, 4, 26);
    },
    coffeeTable(ctx, f) {
      const { x, y, w, h } = f, hue = f.hue;
      ctx.fillStyle = hsl(hue, 30, 34); ctx.fillRect(P(x), P(y), P(w), 6);
      ctx.fillStyle = hsl(hue, 30, 48, 0.7); ctx.fillRect(P(x), P(y), P(w), 2);
      ctx.fillStyle = hsl(hue, 26, 26); ctx.fillRect(P(x + 6), P(y + 6), 4, P(h - 6));
      ctx.fillRect(P(x + w - 10), P(y + 6), 4, P(h - 6));
      ctx.fillStyle = hsl(hue, 26, 30); ctx.fillRect(P(x + 6), P(y + h * 0.6), P(w - 12), 3);
    },
    table(ctx, f, clothHue) {
      const { x, y, w, h } = f;
      if (clothHue !== undefined) {
        fabric(ctx, x - 3, y, w + 6, h * 0.34, clothHue, 26);
      }
      ctx.fillStyle = hsl(f.hue, 28, 36); ctx.fillRect(P(x), P(y), P(w), 7);
      ctx.fillStyle = hsl(f.hue, 28, 52, 0.7); ctx.fillRect(P(x), P(y), P(w), 2);
      ctx.fillStyle = hsl(f.hue, 24, 26);
      ctx.fillRect(P(x + 4), P(y + 7), 5, P(h - 7)); ctx.fillRect(P(x + w - 9), P(y + 7), 5, P(h - 7));
    },
    diningTable(ctx, f) { FD.table(ctx, f, f.variant === 1 ? f.hue + 180 : undefined); },
    desk(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 26, 34); ctx.fillRect(P(x), P(y), P(w), 7);
      ctx.fillStyle = hsl(f.hue, 26, 50, 0.7); ctx.fillRect(P(x), P(y), P(w), 2);
      ctx.fillStyle = hsl(f.hue, 24, 26); ctx.fillRect(P(x + w - 34), P(y + 7), 30, P(h - 7));
      drawers(ctx, x + w - 33, y + 9, 28, h - 14, 2, f.hue);
      ctx.fillRect(P(x + 4), P(y + 7), 5, P(h - 7));
    },
    tvStand(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(24, 18, 26); ctx.fillRect(P(x), P(y + 6), P(w), P(h - 6));
      ctx.fillStyle = hsl(24, 18, 34); ctx.fillRect(P(x), P(y), P(w), 7);
      ctx.fillStyle = hsl(220, 10, 12); ctx.fillRect(P(x + 6), P(y + 12), P(w * 0.38), P(h - 20));
      drawers(ctx, x + w * 0.5, y + 11, w * 0.46, h - 18, 2, 24);
      legs(ctx, x + 4, y + h - 3, w - 8, 4, 24);
    },
    tv(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(220, 8, 14); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(200, 40, 30); ctx.fillRect(P(x + 3), P(y + 3), P(w - 6), P(h - 8));
      ctx.fillStyle = hsl(195, 60, 52, 0.55); ctx.fillRect(P(x + 3), P(y + 3), P(w - 6), P((h - 8) * 0.42));
      ctx.fillStyle = hsl(220, 8, 22); ctx.fillRect(P(x + w / 2 - 8), P(y + h - 5), 16, 5);
    },
    bookshelf(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 24, 26); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue, 24, 34); ctx.fillRect(P(x + 3), P(y + 3), P(w - 6), P(h - 6));
      const rows = Math.max(2, Math.floor(h / 24));
      for (let i = 0; i < rows; i++) {
        const ry = y + 4 + i * ((h - 8) / rows);
        ctx.fillStyle = hsl(f.hue, 22, 20); ctx.fillRect(P(x + 3), P(ry + (h - 8) / rows - 4), P(w - 6), 3);
        booksIn(ctx, x + 5, ry, w - 10, (h - 8) / rows - 7, f.seed + i * 97);
      }
    },
    shelving(ctx, f, backPanel) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 10, 30); ctx.fillRect(P(x), P(y), P(w), P(h));
      const rows = Math.max(2, Math.floor(h / 26));
      for (let i = 0; i <= rows; i++) {
        const ry = y + i * (h / rows);
        metal(ctx, x, ry - 2, w, 4, f.hue, i % 2 ? -6 : 0);
      }
      if (backPanel) { ctx.fillStyle = hsl(f.hue, 8, 22, 0.5); ctx.fillRect(P(x), P(y), P(w), P(h)); }
    },
    bookshelf2(ctx, f) { FD.bookshelf(ctx, f); },
    cabinet(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 22, 32); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue, 22, 44, 0.7); ctx.fillRect(P(x), P(y), P(w), 3);
      ctx.fillStyle = hsl(f.hue, 22, 22);
      ctx.fillRect(P(x + w / 2 - 1), P(y + 4), 2, P(h - 8));
      ctx.fillStyle = hsl(42, 45, 62);
      ctx.fillRect(P(x + w / 2 - 8), P(y + h / 2 - 1), 4, 4); ctx.fillRect(P(x + w / 2 + 4), P(y + h / 2 - 1), 4, 4);
      legs(ctx, x + 3, y + h - 3, w - 6, 4, f.hue);
    },
    sideboard(ctx, f) { FD.cabinet(ctx, f); },
    nightstand(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 22, 30); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue, 22, 42, 0.7); ctx.fillRect(P(x), P(y), P(w), 2);
      drawers(ctx, x + 3, y + 4, w - 6, h - 8, 2, f.hue + 6);
    },
    wardrobe(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 20, 28); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue, 20, 40, 0.6); ctx.fillRect(P(x), P(y), P(w), 3);
      for (let i = 0; i < 2; i++) {
        const dx = x + i * (w / 2);
        ctx.fillStyle = hsl(f.hue, 18, 34); ctx.fillRect(P(dx + 2), P(y + 4), P(w / 2 - 4), P(h - 8));
        ctx.fillStyle = hsl(f.hue, 18, 22, 0.6); ctx.fillRect(P(dx + 4), P(y + 8), P(w / 2 - 8), P(h - 16));
      }
      ctx.fillStyle = hsl(42, 40, 60);
      ctx.fillRect(P(x + w / 2 - 6), P(y + h / 2 - 5), 3, 10); ctx.fillRect(P(x + w / 2 + 3), P(y + h / 2 - 5), 3, 10);
    },
    dresser(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 22, 30); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue, 22, 44, 0.7); ctx.fillRect(P(x), P(y), P(w), 3);
      drawers(ctx, x + 3, y + 5, w - 6, h - 9, 3, f.hue + 8);
      legs(ctx, x + 3, y + h - 3, w - 6, 4, f.hue);
    },
    bed(ctx, f) {
      const { x, y, w, h } = f;
      const single = w < 120;                       // 单人/双人由宽度决定，不接受外部布尔
      ctx.fillStyle = hsl(f.hue, 20, 26); ctx.fillRect(P(x), P(y + h * 0.3), 8, P(h * 0.7));
      ctx.fillStyle = hsl(f.hue, 22, 32); ctx.fillRect(P(x + (f.flip > 0 ? 0 : w - 10)), P(y), 10, P(h));
      ctx.fillStyle = hsl(f.hue, 18, 30); ctx.fillRect(P(x + 6), P(y + h * 0.42), P(w - 12), P(h * 0.5));
      fabric(ctx, x + 6, y + h * 0.24, w - 12, h * 0.3, f.hue + 190, 26);
      const pw = single ? 26 : 34;
      for (let i = 0; i < (single ? 1 : 2); i++) {
        fabric(ctx, x + 14 + i * (pw + 6), y + h * 0.16, pw, h * 0.2, 40, 18);
      }
      fabric(ctx, x + w * 0.42, y + h * 0.4, w * 0.56, h * 0.34, f.hue + 6, 30);
      ctx.fillStyle = hsl(f.hue, 20, 22); ctx.fillRect(P(x + 6), P(y + h - 6), P(w - 12), 4);
    },
    crib(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 20, 34); ctx.fillRect(P(x), P(y + h * 0.4), P(w), P(h * 0.55));
      ctx.fillStyle = hsl(f.hue, 22, 44); ctx.fillRect(P(x), P(y + h * 0.4), P(w), 3);
      ctx.fillStyle = hsl(f.hue, 18, 28);
      for (let i = 4; i < w - 2; i += 8) ctx.fillRect(P(x + i), P(y + 4), 3, P(h * 0.4));
      ctx.fillRect(P(x), P(y), P(w), 4);
      fabric(ctx, x + 4, y + h * 0.5, w - 8, h * 0.3, f.hue + 180, 30);
    },
    kitchenRun(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 14, 34); ctx.fillRect(P(x), P(y + 8), P(w), P(h - 8));
      ctx.fillStyle = hsl(f.hue, 10, 62); ctx.fillRect(P(x), P(y), P(w), 8);
      ctx.fillStyle = hsl(f.hue, 12, 74, 0.8); ctx.fillRect(P(x), P(y), P(w), 2);
      const n = Math.max(2, Math.round(w / 46));
      for (let i = 0; i < n; i++) {
        const dx = x + 3 + i * ((w - 6) / n);
        ctx.fillStyle = hsl(f.hue, 14, 28); ctx.fillRect(P(dx), P(y + 12), P((w - 6) / n - 4), P(h - 20));
        ctx.fillStyle = hsl(42, 40, 62); ctx.fillRect(P(dx + (w - 6) / n / 2 - 6), P(y + 16), 10, 2);
      }
      ctx.fillStyle = hsl(f.hue, 12, 24); ctx.fillRect(P(x + 2), P(y + h - 4), P(w - 4), 4);
    },
    upperCabinet(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 12, 40); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue, 12, 54, 0.7); ctx.fillRect(P(x), P(y), P(w), 2);
      const n = Math.max(2, Math.round(w / 44));
      for (let i = 0; i < n; i++) {
        const dx = x + 2 + i * ((w - 4) / n);
        ctx.fillStyle = hsl(f.hue, 12, 32); ctx.fillRect(P(dx), P(y + 3), P((w - 4) / n - 3), P(h - 6));
        ctx.fillStyle = hsl(42, 40, 62); ctx.fillRect(P(dx + (w - 4) / n / 2 - 5), P(y + h - 7), 8, 2);
      }
    },
    fridge(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, h, f.hue, 6);
      ctx.fillStyle = hsl(210, 8, 30); ctx.fillRect(P(x + 3), P(y + h * 0.36), P(w - 6), 2);
      ctx.fillStyle = hsl(210, 10, 62); ctx.fillRect(P(x + w - 10), P(y + 8), 3, P(h * 0.28));
      ctx.fillRect(P(x + w - 10), P(y + h * 0.42), 3, P(h * 0.34));
    },
    stove(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, h, f.hue, 2);
      ctx.fillStyle = hsl(210, 6, 18); ctx.fillRect(P(x + 2), P(y), P(w - 4), 5);
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = hsl(210, 6, 12); ctx.beginPath();
        ctx.arc(P(x + w * (i ? 0.68 : 0.3)), P(y + 2), 5, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = hsl(210, 8, 24); ctx.fillRect(P(x + 6), P(y + h * 0.42), P(w - 12), P(h * 0.44));
      ctx.fillStyle = hsl(30, 40, 22, 0.8); ctx.fillRect(P(x + 8), P(y + h * 0.46), P(w - 16), P(h * 0.3));
    },
    sink(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, h, f.hue, 4);
      ctx.fillStyle = hsl(210, 8, 26); ctx.fillRect(P(x + 5), P(y + 4), P(w - 10), P(h * 0.3));
      ctx.fillStyle = hsl(210, 10, 66); ctx.fillRect(P(x + w / 2 - 2), P(y - 14), 3, 16);
      ctx.fillRect(P(x + w / 2 - 2), P(y - 16), 10, 3);
    },
    vanity(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 14, 40); ctx.fillRect(P(x), P(y + 10), P(w), P(h - 10));
      metal(ctx, x, y, w, 12, f.hue, 10);
      ctx.fillStyle = hsl(200, 12, 26); ctx.fillRect(P(x + w * 0.28), P(y + 2), P(w * 0.44), 7);
      ctx.fillStyle = hsl(f.hue, 14, 30); ctx.fillRect(P(x + 4), P(y + 16), P(w - 8), P(h - 22));
      ctx.fillStyle = hsl(42, 40, 62); ctx.fillRect(P(x + w / 2 - 6), P(y + 20), 12, 2);
    },
    toilet(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(200, 8, 88); ctx.fillRect(P(x + 2), P(y + h * 0.45), P(w - 4), P(h * 0.5));
      ctx.fillStyle = hsl(200, 8, 92); ctx.fillRect(P(x + 4), P(y + h * 0.4), P(w - 8), 5);
      ctx.fillStyle = hsl(200, 8, 86); ctx.fillRect(P(x + 4), P(y), P(w - 8), P(h * 0.44));
      ctx.fillStyle = hsl(200, 8, 70); ctx.fillRect(P(x + 6), P(y + 2), P(w - 12), 3);
      ctx.fillStyle = hsl(200, 10, 60); ctx.fillRect(P(x + 8), P(y + h - 6), P(w - 16), 4);
    },
    bathtub(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(200, 8, 90); ctx.fillRect(P(x), P(y + h * 0.3), P(w), P(h * 0.7));
      ctx.fillStyle = hsl(200, 14, 66); ctx.fillRect(P(x + 6), P(y + h * 0.38), P(w - 12), P(h * 0.4));
      ctx.fillStyle = hsl(200, 8, 96); ctx.fillRect(P(x), P(y + h * 0.3), P(w), 3);
      metal(ctx, x + w - 10, y + h * 0.1, 4, h * 0.25, f.hue, 8);
      ctx.fillStyle = hsl(200, 8, 84); ctx.fillRect(P(x + 4), P(y + h - 6), 5, 6); ctx.fillRect(P(x + w - 9), P(y + h - 6), 5, 6);
    },
    shower(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(200, 16, 70, 0.28); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(200, 10, 40); ctx.fillRect(P(x), P(y), P(w), 3);
      ctx.fillRect(P(x), P(y), 3, P(h)); ctx.fillRect(P(x + w - 3), P(y), 3, P(h));
      ctx.fillStyle = hsl(200, 14, 82, 0.5); ctx.fillRect(P(x + 5), P(y + 5), 2, P(h - 10));
      metal(ctx, x + w * 0.5, y + 6, 3, 12, f.hue, 10);
      ctx.fillStyle = hsl(210, 10, 60); ctx.fillRect(P(x + w * 0.5 - 5), P(y + 16), 13, 3);
    },
    mirror(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(40, 22, 40); ctx.fillRect(P(x - 2), P(y - 2), P(w + 4), P(h + 4));
      ctx.fillStyle = hsl(200, 22, 62); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(200, 30, 82, 0.7);
      ctx.fillRect(P(x + 3), P(y + 3), P(w * 0.3), P(h * 0.5));
      ctx.fillRect(P(x + 4), P(y + h * 0.6), P(w * 0.16), P(h * 0.3));
    },
    painting(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(38, 30, 34); ctx.fillRect(P(x - 3), P(y - 3), P(w + 6), P(h + 6));
      ctx.fillStyle = hsl(40, 26, 52); ctx.fillRect(P(x - 1), P(y - 1), P(w + 2), P(h + 2));
      const hue = (f.seed % 360);
      ctx.fillStyle = hsl(hue, 30, 46); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(hue + 30, 34, 58); ctx.fillRect(P(x), P(y + h * 0.55), P(w), P(h * 0.45));
      ctx.fillStyle = hsl(hue + 60, 26, 34); ctx.fillRect(P(x + w * 0.1), P(y + h * 0.2), P(w * 0.34), P(h * 0.26));
      ctx.fillStyle = hsl(45, 60, 72, 0.8); ctx.fillRect(P(x + w * 0.6), P(y + h * 0.14), 6, 6);
    },
    clock(ctx, f) {
      const { x, y, w, h } = f, cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      ctx.fillStyle = hsl(38, 24, 30); ctx.beginPath(); ctx.arc(P(cx), P(cy), P(r), 0, 6.283); ctx.fill();
      ctx.fillStyle = hsl(48, 30, 88); ctx.beginPath(); ctx.arc(P(cx), P(cy), P(r - 2), 0, 6.283); ctx.fill();
      ctx.strokeStyle = hsl(220, 20, 20); ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
      ctx.moveTo(cx, cy); ctx.lineTo(cx - r * 0.1, cy - r * 0.6); ctx.stroke();
    },
    shelf(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 22, 32); ctx.fillRect(P(x), P(y + h - 4), P(w), 4);
      booksIn(ctx, x + 2, y, w - 4, h - 4, f.seed);
    },
    plant(ctx, f) {
      const { x, y, w, h } = f, potH = Math.max(12, h * 0.28);
      ctx.fillStyle = hsl(18, 34, 38); ctx.fillRect(P(x + w * 0.2), P(y + h - potH), P(w * 0.6), P(potH));
      ctx.fillStyle = hsl(18, 30, 48); ctx.fillRect(P(x + w * 0.2), P(y + h - potH), P(w * 0.6), 3);
      ctx.fillStyle = hsl(100, 30, 30);
      const cx = x + w / 2, cy = y + h - potH;
      for (let i = 0; i < 7; i++) {
        const a = -1.57 + (i - 3) * 0.36, len = h * (0.4 + (i % 3) * 0.12);
        ctx.beginPath();
        ctx.ellipse(P(cx + Math.cos(a) * len * 0.55), P(cy - 6 + Math.sin(a) * len * 0.5), P(len * 0.22), P(len * 0.5), a, 0, 6.283);
        ctx.fill();
      }
      ctx.fillStyle = hsl(105, 34, 40, 0.8);
      ctx.beginPath(); ctx.arc(P(cx - 4), P(cy - h * 0.42), P(w * 0.16), 0, 6.283); ctx.fill();
    },
    potPlant(ctx, f) { FD.plant(ctx, f); },
    plantSmall(ctx, f) { FD.plant(ctx, f); },
    lampFloor(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(38, 16, 30); ctx.fillRect(P(x + w / 2 - 2), P(y + h * 0.3), 4, P(h * 0.66));
      ctx.fillRect(P(x + w * 0.25), P(y + h - 4), P(w * 0.5), 4);
      ctx.fillStyle = hsl(44, 40, 72); ctx.beginPath();
      ctx.moveTo(x + w * 0.1, y + h * 0.32); ctx.lineTo(x + w * 0.9, y + h * 0.32);
      ctx.lineTo(x + w * 0.72, y); ctx.lineTo(x + w * 0.28, y); ctx.closePath(); ctx.fill();
    },
    lampTable(ctx, f) { FD.lampFloor(ctx, f); },
    ceilingLamp(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(40, 14, 34); ctx.fillRect(P(x + w / 2 - 1), P(y), 2, 6);
      ctx.fillStyle = hsl(44, 34, 66); ctx.beginPath();
      ctx.moveTo(x + w * 0.15, y + h); ctx.lineTo(x + w * 0.85, y + h);
      ctx.lineTo(x + w * 0.66, y + 6); ctx.lineTo(x + w * 0.34, y + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hsl(50, 70, 86); ctx.fillRect(P(x + w * 0.4), P(y + h - 4), P(w * 0.2), 4);
    },
    pendantLamp(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(40, 14, 30); ctx.fillRect(P(x + w / 2 - 1), P(y), 2, P(h * 0.45));
      ctx.fillStyle = hsl(28, 30, 46); ctx.beginPath();
      ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w * 0.7, y + h * 0.45);
      ctx.lineTo(x + w * 0.3, y + h * 0.45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hsl(48, 80, 82); ctx.fillRect(P(x + w * 0.36), P(y + h - 3), P(w * 0.28), 3);
    },
    wallLamp(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(40, 14, 34); ctx.fillRect(P(x), P(y + h - 4), P(w), 4);
      ctx.fillStyle = hsl(46, 40, 70); ctx.fillRect(P(x + 2), P(y), P(w - 4), P(h - 4));
    },
    rug(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue + 340, 30, 34); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue + 340, 26, 46); ctx.fillRect(P(x + 3), P(y + 1), P(w - 6), P(h - 2));
      ctx.fillStyle = hsl(f.hue + 20, 30, 56, 0.7); ctx.fillRect(P(x + 8), P(y + 2), P(w - 16), 2);
    },
    bin(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y + 3, w, h - 3, f.hue, -4);
      ctx.fillStyle = hsl(210, 8, 40); ctx.fillRect(P(x - 1), P(y), P(w + 2), 4);
    },
    stool(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 22, 38); ctx.fillRect(P(x), P(y), P(w), 5);
      ctx.fillStyle = hsl(f.hue, 22, 26);
      ctx.fillRect(P(x + 2), P(y + 5), 3, P(h - 5)); ctx.fillRect(P(x + w - 5), P(y + 5), 3, P(h - 5));
    },
    chair(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue, 22, 32); ctx.fillRect(P(x), P(y), 5, P(h * 0.62));
      ctx.fillStyle = hsl(f.hue, 24, 42); ctx.fillRect(P(x), P(y + h * 0.55), P(w), 6);
      ctx.fillStyle = hsl(f.hue, 22, 24);
      ctx.fillRect(P(x + 2), P(y + h * 0.61), 3, P(h * 0.39)); ctx.fillRect(P(x + w - 5), P(y + h * 0.61), 3, P(h * 0.39));
      fabric(ctx, x + 5, y + 4, w * 0.6, h * 0.48, f.hue + 20, 28);
    },
    workbench(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(30, 22, 34); ctx.fillRect(P(x), P(y), P(w), 8);
      ctx.fillStyle = hsl(30, 22, 48, 0.6); ctx.fillRect(P(x), P(y), P(w), 2);
      ctx.fillStyle = hsl(210, 6, 32);
      ctx.fillRect(P(x + 5), P(y + 8), 7, P(h - 8)); ctx.fillRect(P(x + w - 12), P(y + 8), 7, P(h - 8));
      ctx.fillStyle = hsl(30, 18, 26); ctx.fillRect(P(x + 5), P(y + h * 0.6), P(w - 10), 5);
      ctx.fillStyle = hsl(210, 8, 40); ctx.fillRect(P(x + w * 0.62), P(y - 6), 16, 6);
    },
    toolChest(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(4, 58, 38); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(4, 60, 50, 0.6); ctx.fillRect(P(x), P(y), P(w), 3);
      drawers(ctx, x + 3, y + 5, w - 6, h - 10, 3, 4, 40);
      ctx.fillStyle = hsl(210, 8, 30); ctx.fillRect(P(x + w * 0.3), P(y - 5), P(w * 0.4), 5);
    },
    shelfRack(ctx, f) { FD.shelving(ctx, f, true); },
    glassShelf(ctx, f) {
      FD.shelving(ctx, f, false);
      const rows = Math.max(2, Math.floor(f.h / 26));
      for (let i = 0; i < rows; i++) {
        const ry = f.y + (i + 1) * (f.h / rows) - 10;
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = hsl(110, 34, 34);
          ctx.fillRect(P(f.x + 6 + k * (f.w / 3)), P(ry), 10, 10);
          ctx.fillStyle = hsl(115, 40, 48);
          ctx.fillRect(P(f.x + 6 + k * (f.w / 3)), P(ry - 4), 10, 5);
        }
      }
    },
    boxStack(ctx, f) {
      const { x, y, w, h } = f;
      const n = Math.max(2, Math.round(h / 20));
      for (let i = 0; i < n; i++) {
        const bh = h / n, by = y + h - (i + 1) * bh, inset = (i % 2) * 4;
        ctx.fillStyle = hsl(34, 34, 38 - i * 2); ctx.fillRect(P(x + inset), P(by), P(w - inset * 2), P(bh - 2));
        ctx.fillStyle = hsl(34, 30, 52, 0.5); ctx.fillRect(P(x + inset), P(by), P(w - inset * 2), 2);
        ctx.fillStyle = hsl(34, 20, 26); ctx.fillRect(P(x + w / 2 - 1), P(by), 2, P(bh - 2));
      }
    },
    crates(ctx, f) { FD.boxStack(ctx, f); },
    crateSmall(ctx, f) { FD.boxStack(ctx, f); },
    barrel(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(26, 26, 32); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(26, 24, 42, 0.6);
      for (let i = 3; i < w; i += 7) ctx.fillRect(P(x + i), P(y), 2, P(h));
      ctx.fillStyle = hsl(210, 8, 34);
      ctx.fillRect(P(x), P(y + h * 0.22), P(w), 3); ctx.fillRect(P(x), P(y + h * 0.7), P(w), 3);
      ctx.fillStyle = hsl(26, 20, 24); ctx.fillRect(P(x), P(y), P(w), 3);
    },
    wineRack(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(24, 24, 26); ctx.fillRect(P(x), P(y), P(w), P(h));
      const rows = Math.max(2, Math.floor(h / 18)), cols = Math.max(3, Math.floor(w / 18));
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const bx = x + 5 + j * ((w - 10) / cols), by = y + 4 + i * ((h - 8) / rows);
        ctx.fillStyle = hsl(150, 30, 22); ctx.fillRect(P(bx), P(by), 7, P((h - 8) / rows - 4));
        ctx.fillStyle = hsl(40, 30, 60, 0.5); ctx.fillRect(P(bx), P(by), 7, 2);
      }
    },
    car(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue + 200, 30, 30); ctx.fillRect(P(x), P(y + h * 0.42), P(w), P(h * 0.42));
      ctx.fillStyle = hsl(f.hue + 200, 32, 38);
      ctx.beginPath();
      ctx.moveTo(P(x + w * 0.2), P(y + h * 0.45)); ctx.lineTo(P(x + w * 0.34), P(y + h * 0.1));
      ctx.lineTo(P(x + w * 0.7), P(y + h * 0.1)); ctx.lineTo(P(x + w * 0.84), P(y + h * 0.45));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = hsl(200, 20, 22);
      ctx.fillRect(P(x + w * 0.36), P(y + h * 0.16), P(w * 0.15), P(h * 0.24));
      ctx.fillRect(P(x + w * 0.55), P(y + h * 0.16), P(w * 0.14), P(h * 0.24));
      ctx.fillStyle = hsl(210, 8, 14);
      ctx.beginPath(); ctx.arc(P(x + w * 0.24), P(y + h * 0.86), P(h * 0.16), 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(P(x + w * 0.76), P(y + h * 0.86), P(h * 0.16), 0, 6.283); ctx.fill();
      ctx.fillStyle = hsl(210, 6, 34);
      ctx.beginPath(); ctx.arc(P(x + w * 0.24), P(y + h * 0.86), P(h * 0.07), 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(P(x + w * 0.76), P(y + h * 0.86), P(h * 0.07), 0, 6.283); ctx.fill();
      ctx.fillStyle = hsl(40, 60, 70, 0.8); ctx.fillRect(P(x + w - 6), P(y + h * 0.5), 5, 5);
      ctx.fillStyle = hsl(0, 0, 100, 0.12); ctx.fillRect(P(x + 2), P(y + h * 0.45), P(w - 4), 2);
    },
    liftPlatform(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, h, f.hue, -8);
      ctx.fillStyle = hsl(210, 8, 22);
      for (let i = 4; i < w; i += 12) ctx.fillRect(P(x + i), P(y + 2), 5, P(h - 4));
    },
    ladderTool(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(38, 20, 40);
      ctx.fillRect(P(x), P(y), 4, P(h)); ctx.fillRect(P(x + w - 4), P(y), 4, P(h));
      for (let i = 6; i < h; i += 14) ctx.fillRect(P(x), P(y + i), P(w), 3);
    },
    arcade(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(280, 30, 30); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(280, 34, 42); ctx.fillRect(P(x), P(y), P(w), 10);
      ctx.fillStyle = hsl(210, 40, 18); ctx.fillRect(P(x + 5), P(y + 12), P(w - 10), P(h * 0.34));
      ctx.fillStyle = hsl(190, 70, 50, 0.7); ctx.fillRect(P(x + 8), P(y + 16), P(w - 16), P(h * 0.22));
      ctx.fillStyle = hsl(20, 60, 46); ctx.fillRect(P(x + 4), P(y + h * 0.55), P(w - 8), 6);
      ctx.fillStyle = hsl(0, 70, 55); ctx.beginPath(); ctx.arc(P(x + w * 0.35), P(y + h * 0.58), 3, 0, 6.283); ctx.fill();
    },
    screenFlat(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(220, 8, 12); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(222, 46, 26); ctx.fillRect(P(x + 4), P(y + 4), P(w - 8), P(h - 8));
      ctx.fillStyle = hsl(210, 60, 44, 0.55); ctx.fillRect(P(x + 4), P(y + 4), P(w - 8), P((h - 8) * 0.5));
      ctx.fillStyle = hsl(220, 8, 20); ctx.fillRect(P(x + w / 2 - 20), P(y + h), 40, 5);
    },
    projector(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(210, 8, 30); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(210, 8, 44); ctx.fillRect(P(x), P(y), P(w), 3);
      ctx.fillStyle = hsl(40, 60, 70); ctx.beginPath(); ctx.arc(P(x + w * 0.7), P(y + h * 0.55), 4, 0, 6.283); ctx.fill();
    },
    easel(ctx, f) {
      const { x, y, w, h } = f;
      ctx.strokeStyle = hsl(30, 24, 32); ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + 4, y + h);
      ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w - 4, y + h);
      ctx.moveTo(x + w * 0.5, y + h * 0.2); ctx.lineTo(x + w * 0.5, y + h * 0.95);
      ctx.stroke();
      ctx.fillStyle = hsl(30, 18, 28); ctx.fillRect(P(x + 2), P(y + h * 0.62), P(w - 4), 4);
    },
    canvas(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(40, 24, 88); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl((f.seed % 360), 34, 52); ctx.fillRect(P(x + 4), P(y + h * 0.5), P(w - 8), P(h * 0.34));
      ctx.fillStyle = hsl((f.seed % 360) + 40, 30, 66); ctx.fillRect(P(x + 6), P(y + 6), P(w * 0.4), P(h * 0.22));
      ctx.fillStyle = hsl(40, 20, 70); ctx.fillRect(P(x), P(y), P(w), 2);
    },
    treadmill(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(210, 8, 24); ctx.fillRect(P(x), P(y + h * 0.66), P(w), P(h * 0.3));
      ctx.fillStyle = hsl(210, 6, 16); ctx.fillRect(P(x + 6), P(y + h * 0.72), P(w - 12), P(h * 0.16));
      ctx.fillStyle = hsl(210, 8, 34);
      ctx.fillRect(P(x + w - 10), P(y), 6, P(h * 0.7));
      ctx.fillRect(P(x + w - 34), P(y + 4), 26, 4);
      ctx.fillStyle = hsl(160, 30, 40); ctx.fillRect(P(x + w - 14), P(y + 12), 12, 8);
    },
    weightsRack(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(210, 6, 30);
      ctx.fillRect(P(x), P(y + h * 0.3), 5, P(h * 0.7)); ctx.fillRect(P(x + w - 5), P(y + h * 0.3), 5, P(h * 0.7));
      for (let i = 0; i < 3; i++) {
        const ry = y + h * (0.34 + i * 0.2);
        ctx.fillStyle = hsl(210, 6, 40); ctx.fillRect(P(x), P(ry), P(w), 3);
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = hsl(210, 4, 18);
          ctx.fillRect(P(x + 6 + k * (w - 14) / 4), P(ry - 9), 6, 12);
        }
      }
    },
    matYoga(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue + 140, 34, 40); ctx.fillRect(P(x), P(y), P(w), P(h));
      ctx.fillStyle = hsl(f.hue + 140, 34, 52, 0.6); ctx.fillRect(P(x), P(y), P(w), 2);
    },
    lounger(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(30, 20, 34); ctx.fillRect(P(x), P(y + h * 0.5), P(w), P(h * 0.4));
      ctx.fillStyle = hsl(f.hue + 20, 30, 52); ctx.fillRect(P(x + 2), P(y + h * 0.36), P(w - 4), P(h * 0.2));
      ctx.fillStyle = hsl(30, 20, 26);
      ctx.fillRect(P(x + 4), P(y + h * 0.9), 4, P(h * 0.1)); ctx.fillRect(P(x + w - 8), P(y + h * 0.9), 4, P(h * 0.1));
      ctx.fillStyle = hsl(f.hue + 20, 32, 58);
      ctx.beginPath(); ctx.moveTo(P(x), P(y + h * 0.4)); ctx.lineTo(P(x + w * 0.3), P(y));
      ctx.lineTo(P(x + w * 0.34), P(y + h * 0.38)); ctx.closePath(); ctx.fill();
    },
    parasol(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(30, 14, 34); ctx.fillRect(P(x + w / 2 - 2), P(y + h * 0.28), 4, P(h * 0.72));
      ctx.fillStyle = hsl(f.hue + 10, 40, 52);
      ctx.beginPath(); ctx.moveTo(P(x - 14), P(y + h * 0.3)); ctx.lineTo(P(x + w + 14), P(y + h * 0.3));
      ctx.lineTo(P(x + w / 2), P(y)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hsl(0, 0, 100, 0.18);
      ctx.beginPath(); ctx.moveTo(P(x + w / 2), P(y)); ctx.lineTo(P(x + w * 0.2), P(y + h * 0.3));
      ctx.lineTo(P(x + w * 0.42), P(y + h * 0.3)); ctx.closePath(); ctx.fill();
    },
    toyBox(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(f.hue + 190, 30, 40); ctx.fillRect(P(x), P(y + 6), P(w), P(h - 6));
      ctx.fillStyle = hsl(f.hue + 190, 30, 52); ctx.fillRect(P(x - 2), P(y), P(w + 4), 7);
      ctx.fillStyle = hsl(f.hue + 40, 40, 46);
      for (let i = 0; i < 3; i++) ctx.fillRect(P(x + 5 + i * 13), P(y - 4), 8, 7);
      ctx.fillStyle = hsl(20, 50, 50); ctx.beginPath(); ctx.arc(P(x + w * 0.7), P(y - 1), 5, 0, 6.283); ctx.fill();
    },
    bench(ctx, f) {
      const { x, y, w, h } = f;
      ctx.fillStyle = hsl(30, 20, 32); ctx.fillRect(P(x), P(y + h * 0.45), P(w), P(h * 0.28));
      ctx.fillStyle = hsl(30, 22, 44); ctx.fillRect(P(x), P(y + h * 0.45), P(w), 2);
      ctx.fillStyle = hsl(30, 18, 24);
      ctx.fillRect(P(x + 3), P(y + h * 0.73), 5, P(h * 0.27)); ctx.fillRect(P(x + w - 8), P(y + h * 0.73), 5, P(h * 0.27));
    },
    boiler(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, h, f.hue, 4);
      ctx.fillStyle = hsl(210, 8, 30); ctx.fillRect(P(x + 4), P(y + h * 0.6), P(w - 8), P(h * 0.22));
      ctx.fillStyle = hsl(20, 60, 50); ctx.beginPath(); ctx.arc(P(x + w / 2), P(y + h * 0.7), 3, 0, 6.283); ctx.fill();
      ctx.fillStyle = hsl(210, 8, 40); ctx.fillRect(P(x + w / 2 - 2), P(y - 12), 4, 12);
    },
    fuseBox(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, h, f.hue, -6);
      ctx.fillStyle = hsl(50, 70, 55); ctx.fillRect(P(x + 4), P(y + 5), P(w - 8), 3);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = hsl(210, 6, 22); ctx.fillRect(P(x + 6 + i * 8), P(y + h * 0.4), 5, P(h * 0.3)); }
    },
    towelRail(ctx, f) {
      const { x, y, w, h } = f;
      metal(ctx, x, y, w, 3, f.hue, 10);
      ctx.fillStyle = hsl(f.hue + 180, 26, 72); ctx.fillRect(P(x + 6), P(y + 3), 12, P(h + 14));
      ctx.fillStyle = hsl(f.hue + 180, 26, 60); ctx.fillRect(P(x + 6), P(y + 3 + h * 0.5), 12, 2);
    },
  };

  // 单人床与双人床共用画法：FD.bed 按宽度自行判断枕头数量
  FD.bedSingle = FD.bed;
  FD.sofaSmall = FD.sofa;
  FD.sink2 = FD.sink;
  const PROPS = {
    mug(ctx, f) { ctx.fillStyle = hsl(f.hue + 10, 30, 82); ctx.fillRect(P(f.x), P(f.y), 7, 8); ctx.fillStyle = hsl(f.hue + 10, 30, 60); ctx.fillRect(P(f.x + 7), P(f.y + 2), 3, 4); },
    book(ctx, f) { ctx.fillStyle = hsl((f.seed % 360), 40, 40); ctx.fillRect(P(f.x), P(f.y + 2), 12, 4); ctx.fillStyle = hsl(48, 30, 86); ctx.fillRect(P(f.x + 1), P(f.y + 3), 10, 2); },
    bookrow(ctx, f) { booksIn(ctx, f.x, f.y, f.w, f.h, f.seed); },
    dishes(ctx, f) { for (let i = 0; i < 3; i++) { ctx.fillStyle = hsl(40, 14, 86 - i * 6); ctx.beginPath(); ctx.ellipse(P(f.x + i * 6), P(f.y + f.h - 3 - i), 5, 2.5, 0, 0, 6.283); ctx.fill(); } },
    bottle(ctx, f) { ctx.fillStyle = hsl(140, 30, 26); ctx.fillRect(P(f.x), P(f.y + 4), 6, P(f.h - 4)); ctx.fillRect(P(f.x + 2), P(f.y), 2, 5); ctx.fillStyle = hsl(140, 40, 46, 0.6); ctx.fillRect(P(f.x + 1), P(f.y + 6), 2, P(f.h - 8)); },
    bottleRow(ctx, f) { for (let i = 0; i < Math.max(1, Math.floor(f.w / 8)); i++) { const g = Object.assign({}, f, { x: f.x + i * 8, w: 6 }); PROPS.bottle(ctx, g); } },
    kettle(ctx, f) { ctx.fillStyle = hsl(210, 8, 40); ctx.fillRect(P(f.x), P(f.y + 3), 10, P(f.h - 3)); ctx.fillStyle = hsl(210, 8, 54); ctx.fillRect(P(f.x), P(f.y + 3), 10, 2); ctx.fillRect(P(f.x + 9), P(f.y + 5), 4, 2); },
    pan(ctx, f) { ctx.fillStyle = hsl(210, 6, 24); ctx.fillRect(P(f.x), P(f.y + 3), 12, 5); ctx.fillRect(P(f.x + 12), P(f.y + 4), 8, 2); },
    vase(ctx, f) { ctx.fillStyle = hsl(f.hue + 200, 30, 52); ctx.beginPath(); ctx.ellipse(P(f.x + 4), P(f.y + f.h - 5), 5, 6, 0, 0, 6.283); ctx.fill(); ctx.fillRect(P(f.x + 2), P(f.y), 4, 5); ctx.fillStyle = hsl(120, 30, 40); ctx.fillRect(P(f.x + 1), P(f.y - 4), 6, 5); },
    keys(ctx, f) { ctx.fillStyle = hsl(44, 60, 60); ctx.fillRect(P(f.x), P(f.y + 2), 5, 3); ctx.fillRect(P(f.x + 5), P(f.y + 3), 4, 2); },
    laptop(ctx, f) { ctx.fillStyle = hsl(210, 8, 34); ctx.fillRect(P(f.x), P(f.y + f.h - 3), 14, 3); ctx.fillStyle = hsl(210, 8, 22); ctx.fillRect(P(f.x + 1), P(f.y), 12, P(f.h - 3)); ctx.fillStyle = hsl(190, 50, 50, 0.7); ctx.fillRect(P(f.x + 2), P(f.y + 1), 10, P(f.h - 5)); },
    remote(ctx, f) { ctx.fillStyle = hsl(220, 6, 20); ctx.fillRect(P(f.x), P(f.y + 2), 10, 4); },
    toyCar(ctx, f) { ctx.fillStyle = hsl((f.seed % 360), 60, 48); ctx.fillRect(P(f.x), P(f.y + 3), 14, 5); ctx.fillStyle = hsl(210, 6, 16); ctx.fillRect(P(f.x + 2), P(f.y + 7), 3, 3); ctx.fillRect(P(f.x + 9), P(f.y + 7), 3, 3); },
    teddy(ctx, f) { ctx.fillStyle = hsl(30, 34, 46); ctx.beginPath(); ctx.arc(P(f.x + 5), P(f.y + 6), 5, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(P(f.x + 2), P(f.y + 1), 2, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(P(f.x + 8), P(f.y + 1), 2, 0, 6.283); ctx.fill(); },
    toyRobot(ctx, f) { ctx.fillStyle = hsl(200, 20, 56); ctx.fillRect(P(f.x + 1), P(f.y + 3), 8, 8); ctx.fillStyle = hsl(200, 20, 40); ctx.fillRect(P(f.x + 2), P(f.y), 6, 4); ctx.fillStyle = hsl(120, 70, 60); ctx.fillRect(P(f.x + 3), P(f.y + 1), 2, 2); },
    wrench(ctx, f) { ctx.fillStyle = hsl(210, 6, 52); ctx.fillRect(P(f.x), P(f.y + 3), 13, 3); ctx.fillRect(P(f.x + 11), P(f.y + 1), 4, 7); },
    drill(ctx, f) { ctx.fillStyle = hsl(28, 60, 44); ctx.fillRect(P(f.x), P(f.y + 2), 10, 7); ctx.fillStyle = hsl(210, 6, 56); ctx.fillRect(P(f.x + 10), P(f.y + 4), 8, 2); },
    can(ctx, f) { ctx.fillStyle = hsl((f.seed % 360), 30, 48); ctx.fillRect(P(f.x), P(f.y), 7, P(f.h)); ctx.fillStyle = hsl((f.seed % 360), 30, 66); ctx.fillRect(P(f.x), P(f.y), 7, 2); },
    console(ctx, f) { ctx.fillStyle = hsl(220, 8, 24); ctx.fillRect(P(f.x), P(f.y + 3), 12, 5); ctx.fillStyle = hsl(190, 60, 50); ctx.fillRect(P(f.x + 2), P(f.y + 5), 3, 2); },
    brush(ctx, f) { ctx.fillStyle = hsl(34, 40, 50); ctx.fillRect(P(f.x), P(f.y + 2), 11, 2); ctx.fillStyle = hsl((f.seed % 360), 50, 46); ctx.fillRect(P(f.x + 10), P(f.y + 1), 4, 4); },
    shoeRow(ctx, f) { for (let i = 0; i < Math.max(1, Math.floor(f.w / 10)); i++) { ctx.fillStyle = hsl(220 + i * 30, 20, 30); ctx.fillRect(P(f.x + i * 10), P(f.y + f.h - 5), 8, 5); } },
    towel(ctx, f) { ctx.fillStyle = hsl(f.hue + 20, 26, 76); ctx.fillRect(P(f.x), P(f.y), P(Math.max(8, f.w)), P(f.h)); ctx.fillStyle = hsl(f.hue + 20, 26, 60, 0.6); ctx.fillRect(P(f.x), P(f.y + 2), P(Math.max(8, f.w)), 2); },
    dumbbell(ctx, f) { ctx.fillStyle = hsl(210, 6, 24); ctx.fillRect(P(f.x + 3), P(f.y + 3), 8, 3); ctx.fillRect(P(f.x), P(f.y), 4, 9); ctx.fillRect(P(f.x + 11), P(f.y), 4, 9); },
    pot(ctx, f) { ctx.fillStyle = hsl(18, 40, 40); ctx.fillRect(P(f.x), P(f.y + 4), 8, 6); ctx.fillStyle = hsl(110, 34, 38); ctx.fillRect(P(f.x + 1), P(f.y), 6, 5); },
  };

  // ---------- 结构与场景 ----------
  function drawSky(ctx, m, pal, W, H) {
    const bands = 72, bh = Math.ceil(H / bands);
    for (let i = 0; i < bands; i++) {
      const t = (i + 0.5) / bands;
      const c = t <= 0.5 ? mix(pal.sky[0], pal.sky[1], t * 2) : mix(pal.sky[1], pal.sky[2], (t - 0.5) * 2);
      ctx.fillStyle = 'rgb(' + c + ')'; ctx.fillRect(0, i * bh, W, bh);
    }
    if (pal.star) {
      let s = 12345;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 90; i++) {
        const x = P(rnd() * W), y = P(rnd() * H * 0.42);
        ctx.fillStyle = 'rgba(220,235,255,' + (0.25 + rnd() * 0.5).toFixed(2) + ')';
        ctx.fillRect(x, y, rnd() < 0.2 ? 2 : 1, 1);
      }
      ctx.fillStyle = 'rgba(226,240,255,0.85)';
      ctx.beginPath(); ctx.arc(W - 150, 90, 26, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(226,240,255,0.10)';
      ctx.beginPath(); ctx.arc(W - 150, 90, 46, 0, 6.283); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,246,220,0.85)';
      ctx.beginPath(); ctx.arc(W - 160, 84, 22, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,220,0.12)';
      ctx.beginPath(); ctx.arc(W - 160, 84, 44, 0, 6.283); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const cx = 120 + i * 260, cy = 70 + (i % 3) * 34;
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillRect(P(cx), P(cy), 70, 8); ctx.fillRect(P(cx + 16), P(cy - 7), 44, 8); ctx.fillRect(P(cx + 8), P(cy + 8), 56, 6);
      }
    }
  }
  function mix(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return pa.map((v, i) => P(v + (pb[i] - v) * t)).join(',');
  }
  function drawFar(ctx, m, pal) {
    const gy = m.yard.groundY;
    ctx.fillStyle = pal.hill;
    for (const f of m.yard.far) {
      ctx.beginPath();
      ctx.moveTo(P(f.x), P(gy)); ctx.lineTo(P(f.x), P(gy - f.h));
      ctx.lineTo(P(f.x + f.w * 0.5), P(gy - f.h - 18)); ctx.lineTo(P(f.x + f.w), P(gy - f.h));
      ctx.lineTo(P(f.x + f.w), P(gy)); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = pal.far;
    ctx.fillRect(0, P(gy - 26), m.world.w, 26);
  }
  function drawYard(ctx, m, pal, night) {
    const gy = m.yard.groundY;
    ctx.fillStyle = pal.ground[0]; ctx.fillRect(0, P(gy), m.world.w, m.world.h - gy);
    ctx.fillStyle = pal.ground[1]; ctx.fillRect(0, P(gy), m.world.w, 6);
    ctx.fillStyle = pal.dirt; ctx.fillRect(0, P(gy + 26), m.world.w, m.world.h - gy - 26);
    speckle(ctx, 0, gy + 6, m.world.w, 20, 'rgba(0,0,0,0.14)', 777, 0.05, 4);
    if (m.yard.path) {
      const p = m.yard.path;
      ctx.fillStyle = hsl(36, 10, 46); ctx.fillRect(P(p.x), P(p.y), P(p.w), P(p.h));
      ctx.fillStyle = hsl(36, 10, 56, 0.5);
      for (let i = 0; i < p.w; i += 18) ctx.fillRect(P(p.x + i), P(p.y), 2, P(p.h));
    }
    // 地基以下：土层分层 + 碎石 + 树根 + 排水管，避免整幅底部是一条死空的纯色带
    const fz = gy + 34;
    ctx.fillStyle = hsl(28, 16, 22); ctx.fillRect(0, P(fz), m.world.w, m.world.h - fz);
    ctx.fillStyle = hsl(28, 14, 28); ctx.fillRect(0, P(fz), m.world.w, 5);
    speckle(ctx, 0, fz + 6, m.world.w, m.world.h - fz - 6, 'rgba(0,0,0,0.30)', 4242, 0.06, 5);
    speckle(ctx, 0, fz + 10, m.world.w, m.world.h - fz - 10, 'rgba(180,170,150,0.10)', 9091, 0.03, 4);
    ctx.fillStyle = hsl(28, 10, 34);
    for (let i = 0; i < m.world.w; i += 96) { ctx.fillRect(P(i + 12), P(fz + 16), 14, 5); ctx.fillRect(P(i + 58), P(fz + 30), 10, 4); }
    ctx.strokeStyle = hsl(30, 14, 18); ctx.lineWidth = 2;
    for (const t of m.yard.trees) {
      ctx.beginPath();
      ctx.moveTo(P(t.x), P(t.y + 2)); ctx.lineTo(P(t.x - 16), P(t.y + 26));
      ctx.moveTo(P(t.x), P(t.y + 2)); ctx.lineTo(P(t.x + 14), P(t.y + 30));
      ctx.moveTo(P(t.x), P(t.y + 2)); ctx.lineTo(P(t.x + 2), P(t.y + 40));
      ctx.stroke();
    }
    // 基础底板 + 排水管
    ctx.fillStyle = hsl(210, 6, 30); ctx.fillRect(P(m.world.bx0 - 34), P(gy + 26), P(m.world.bx1 - m.world.bx0 + 68), 12);
    ctx.fillStyle = hsl(210, 6, 40); ctx.fillRect(P(m.world.bx0 - 34), P(gy + 26), P(m.world.bx1 - m.world.bx0 + 68), 2);
    ctx.fillStyle = hsl(210, 6, 26);
    ctx.fillRect(P(m.world.bx1 + 30), P(gy - 6), 7, 46);
    ctx.fillStyle = hsl(210, 6, 36); ctx.fillRect(P(m.world.bx1 + 30), P(gy + 6), 7, 3);
    for (const t of m.yard.trees) {
      ctx.fillStyle = hsl(28, 22, 24); ctx.fillRect(P(t.x - 5), P(t.y - t.h * 0.55), 10, P(t.h * 0.55));
      ctx.fillStyle = night ? hsl(120, 18, 18) : hsl(100, 24, 30);
      ctx.beginPath(); ctx.arc(P(t.x), P(t.y - t.h * 0.66), P(t.w * 0.34), 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(P(t.x - t.w * 0.2), P(t.y - t.h * 0.52), P(t.w * 0.26), 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(P(t.x + t.w * 0.22), P(t.y - t.h * 0.5), P(t.w * 0.24), 0, 6.283); ctx.fill();
      ctx.fillStyle = night ? 'rgba(120,160,140,0.06)' : 'rgba(200,240,180,0.14)';
      ctx.beginPath(); ctx.arc(P(t.x - t.w * 0.1), P(t.y - t.h * 0.72), P(t.w * 0.18), 0, 6.283); ctx.fill();
    }
    for (const b of m.yard.bushes) {
      ctx.fillStyle = night ? hsl(120, 16, 16) : hsl(96, 22, 26);
      ctx.beginPath(); ctx.ellipse(P(b.x + b.w / 2), P(b.y - b.h / 2), P(b.w / 2), P(b.h / 2), 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = night ? 'rgba(140,180,150,0.05)' : 'rgba(190,230,170,0.16)';
      ctx.beginPath(); ctx.ellipse(P(b.x + b.w * 0.35), P(b.y - b.h * 0.7), P(b.w * 0.22), P(b.h * 0.2), 0, 0, 6.283); ctx.fill();
    }
    for (const s of m.yard.debris) {
      ctx.fillStyle = night ? 'rgba(30,34,28,0.7)' : 'rgba(90,84,66,0.5)';
      ctx.fillRect(P(s.x), P(s.y), s.w, s.h);
    }
    for (const s of m.yard.fence) {
      ctx.fillStyle = night ? hsl(30, 8, 20) : hsl(32, 14, 34);
      ctx.fillRect(P(s.x), P(s.y - s.h), 5, P(s.h));
    }
    const railY = m.yard.fence.length ? m.yard.fence[0].y - 30 : 0;
    ctx.fillStyle = night ? hsl(30, 8, 24) : hsl(32, 14, 40);
    if (m.yard.fence.length) { ctx.fillRect(0, P(railY), m.world.w, 3); }
    for (const l of m.yard.lamps) {
      ctx.fillStyle = hsl(210, 6, 26); ctx.fillRect(P(l.x - 2), P(l.y - l.h), 4, P(l.h));
      ctx.fillRect(P(l.x - 2), P(l.y - l.h), 14, 3);
      if (night) {
        ctx.fillStyle = 'rgba(255,220,140,0.85)'; ctx.fillRect(P(l.x + 8), P(l.y - l.h + 3), 6, 5);
        ctx.fillStyle = 'rgba(255,220,140,0.10)';
        ctx.beginPath(); ctx.arc(P(l.x + 11), P(l.y - l.h + 6), 22, 0, 6.283); ctx.fill();
      }
    }
  }

  function drawRoomBack(ctx, m, r, pal, amb) {
    const hue = r.hue;
    surface(ctx, r.matWall, r.x, r.y, r.w, r.h, hue, r.bay * 31 + r.level.charCodeAt(0) * 7, amb);
    // 墙裙 + 踢脚线
    const wains = Math.round(r.h * 0.3);
    ctx.fillStyle = hsl(hue, 16, 34, 0.30); ctx.fillRect(P(r.x), P(r.floorY - wains), P(r.w), P(wains));
    ctx.fillStyle = hsl(hue, 14, 26); ctx.fillRect(P(r.x), P(r.floorY - 7), P(r.w), 7);
    ctx.fillStyle = hsl(hue, 14, 44, 0.5); ctx.fillRect(P(r.x), P(r.floorY - 7), P(r.w), 1);
    // 顶角线
    ctx.fillStyle = hsl(hue, 10, 70, 0.25); ctx.fillRect(P(r.x), P(r.y), P(r.w), 3);
  }

  function drawWindow(ctx, w, pal, amb, night) {
    ctx.fillStyle = night ? pal.winOut : pal.winOut;
    ctx.fillRect(P(w.x), P(w.y), P(w.w), P(w.h));
    if (!night) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(P(w.x), P(w.y + w.h)); ctx.lineTo(P(w.x + w.w * 0.55), P(w.y));
      ctx.lineTo(P(w.x + w.w), P(w.y)); ctx.lineTo(P(w.x + w.w), P(w.y + w.h * 0.4)); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(150,190,230,0.10)'; ctx.fillRect(P(w.x), P(w.y), P(w.w), P(w.h * 0.5));
    }
    ctx.fillStyle = hsl(38, 12, 40 * (0.5 + amb * 0.5));
    ctx.fillRect(P(w.x - 4), P(w.y - 4), P(w.w + 8), 5);
    ctx.fillRect(P(w.x - 4), P(w.y + w.h - 1), P(w.w + 8), 5);
    ctx.fillRect(P(w.x - 4), P(w.y - 4), 5, P(w.h + 9));
    ctx.fillRect(P(w.x + w.w - 1), P(w.y - 4), 5, P(w.h + 9));
    ctx.fillStyle = hsl(38, 10, 34);
    if (w.mull > 1) ctx.fillRect(P(w.x + w.w / 2 - 1), P(w.y), 3, P(w.h));
    ctx.fillRect(P(w.x), P(w.y + w.h / 2 - 1), P(w.w), 2);
    ctx.fillStyle = hsl(40, 14, 26); ctx.fillRect(P(w.x - 7), P(w.y + w.h + 4), P(w.w + 14), 4);
  }

  function drawDoor(ctx, d, amb) {
    ctx.fillStyle = hsl(28, 18, 20); ctx.fillRect(P(d.x), P(d.y), P(d.w), P(d.h));
    if (d.kind === 'exterior') {
      ctx.fillStyle = hsl(24, 26, 32); ctx.fillRect(P(d.x + 1), P(d.y + 2), P(d.w - 2), P(d.h - 2));
      ctx.fillStyle = hsl(24, 26, 44, 0.6); ctx.fillRect(P(d.x + 1), P(d.y + 2), 2, P(d.h - 2));
      ctx.fillStyle = hsl(44, 50, 66); ctx.fillRect(P(d.x + d.w - 5), P(d.y + d.h * 0.5), 3, 3);
    } else if (d.open) {
      ctx.fillStyle = hsl(30, 16, 26);
      ctx.fillRect(P(d.flip ? d.x + d.w - 8 : d.x), P(d.y), 8, P(d.h));
    } else {
      ctx.fillStyle = hsl(26, 24, 34); ctx.fillRect(P(d.x + 2), P(d.y + 2), P(d.w - 4), P(d.h - 4));
      ctx.fillStyle = hsl(26, 22, 44, 0.55); ctx.fillRect(P(d.x + 2), P(d.y + 2), P(d.w - 4), 2);
      ctx.fillStyle = hsl(26, 20, 26);
      ctx.fillRect(P(d.x + 5), P(d.y + 8), P(d.w - 10), P(d.h * 0.32));
      ctx.fillRect(P(d.x + 5), P(d.y + d.h * 0.48), P(d.w - 10), P(d.h * 0.4));
      ctx.fillStyle = hsl(44, 50, 66); ctx.fillRect(P(d.x + d.w - 8), P(d.y + d.h * 0.52), 3, 3);
    }
    ctx.fillStyle = hsl(30, 14, 22);
    ctx.fillRect(P(d.x - 3), P(d.y - 4), 3, P(d.h + 4)); ctx.fillRect(P(d.x + d.w), P(d.y - 4), 3, P(d.h + 4));
    ctx.fillRect(P(d.x - 3), P(d.y - 6), P(d.w + 6), 4);
  }

  function drawStairs(ctx, st, m, amb) {
    const bayX = m.grid.x[m.stairBay], bayW = m.grid.w[m.stairBay];
    for (const s of st.steps) {
      surface(ctx, 'wood', s.x, s.y, s.w, s.h, 30, s.x * 7, amb);
      ctx.fillStyle = hsl(30, 20, 58, 0.55); ctx.fillRect(P(s.x), P(s.y), P(s.w), 2);
      ctx.fillStyle = hsl(30, 20, 20, 0.5); ctx.fillRect(P(s.x), P(s.y + s.h - 2), P(s.w), 2);
    }
    // 栏杆：扶手斜线 + 立柱，画在家具之后（前景层）
    const y0 = st.rail.yTop, y1 = st.rail.yBot;
    const xA = st.dir > 0 ? st.rail.x0 : st.rail.x1, xB = st.dir > 0 ? st.rail.x1 : st.rail.x0;
    ctx.strokeStyle = hsl(30, 16, 26); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(P(xA), P(y0 - 34)); ctx.lineTo(P(xB), P(y1 - 34)); ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, px2 = xA + (xB - xA) * t, py = (y0 - 34) + ((y1 - 34) - (y0 - 34)) * t;
      const step = st.steps[Math.min(st.steps.length - 1, Math.floor(t * st.steps.length))];
      ctx.strokeStyle = hsl(30, 14, 34);
      ctx.beginPath(); ctx.moveTo(P(px2), P(py)); ctx.lineTo(P(px2), P(step ? step.y : py + 20)); ctx.stroke();
    }
    ctx.fillStyle = hsl(30, 16, 24);
    ctx.fillRect(P(st.landing.x), P(st.landing.y - 4), P(st.landing.w), 4);
    void bayX; void bayW;
  }

  function drawElevator(ctx, el, amb) {
    surface(ctx, 'concrete', el.x - 6, el.shaft.y, 6, el.shaft.h, 210, 55, amb);
    surface(ctx, 'concrete', el.x + el.w, el.shaft.y, 6, el.shaft.h, 210, 56, amb);
    ctx.fillStyle = hsl(210, 8, 18, 0.55); ctx.fillRect(P(el.x), P(el.shaft.y), P(el.w), P(el.shaft.h));
    ctx.fillStyle = hsl(210, 6, 26);
    for (let y = el.shaft.y; y < el.shaft.y + el.shaft.h; y += 26) ctx.fillRect(P(el.x + 4), P(y), 2, 18);
    metal(ctx, el.x + 2, el.car.y, el.w - 4, el.car.h, 210, 6);
    ctx.fillStyle = hsl(210, 6, 20); ctx.fillRect(P(el.x + el.w / 2 - 1), P(el.car.y + 3), 2, P(el.car.h - 6));
    for (const d of el.doors) {
      ctx.fillStyle = d.open ? hsl(210, 6, 16) : hsl(210, 8, 40);
      ctx.fillRect(P(el.x), P(d.y), P(el.w), P(d.h));
      if (!d.open) {
        ctx.fillStyle = hsl(210, 8, 54, 0.6); ctx.fillRect(P(el.x), P(d.y), P(el.w), 2);
        ctx.fillStyle = hsl(210, 6, 22); ctx.fillRect(P(el.x + el.w / 2 - 1), P(d.y + 2), 2, P(d.h - 2));
      }
      ctx.fillStyle = hsl(44, 60, 60); ctx.fillRect(P(el.x + el.w + 8), P(d.y + d.h * 0.4), 5, 7);
    }
  }

  function drawRoof(ctx, m, pal, amb) {
    if (!m.roof) return;
    const r = m.roof, x0 = m.world.bx0 - 26, x1 = m.world.bx1 + 26, w = x1 - x0;
    if (r.pitch === 'gable') {
      ctx.fillStyle = hsl(206, 10, 30 * (0.5 + amb * 0.5));
      ctx.beginPath();
      ctx.moveTo(P(x0), P(r.y)); ctx.lineTo(P((x0 + x1) / 2), P(r.y - r.h)); ctx.lineTo(P(x1), P(r.y));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hsl(206, 10, 20); ctx.lineWidth = 2;
      for (let i = 1; i < 7; i++) {
        const t = i / 7;
        ctx.beginPath();
        ctx.moveTo(P(x0 + ((x0 + x1) / 2 - x0) * t), P(r.y - r.h * t));
        ctx.lineTo(P(x1 - (x1 - (x0 + x1) / 2) * t), P(r.y - r.h * t)); ctx.stroke();
      }
      ctx.fillStyle = hsl(28, 18, 34); ctx.fillRect(P((x0 + x1) / 2 - 16), P(r.y - r.h - 6), 32, 10);
    } else {
      ctx.fillStyle = hsl(206, 8, 32 * (0.5 + amb * 0.5));
      ctx.fillRect(P(x0 - 6), P(r.y - 16), P(w + 12), 16);
      ctx.fillStyle = hsl(206, 8, 44, 0.5); ctx.fillRect(P(x0 - 6), P(r.y - 16), P(w + 12), 2);
      ctx.fillStyle = hsl(206, 8, 24);
      for (let x = x0; x < x1; x += 30) ctx.fillRect(P(x), P(r.y - 14), 2, 12);
      ctx.fillStyle = hsl(28, 16, 30); ctx.fillRect(P(x0 + 60), P(r.y - 40), 22, 26);
    }
    ctx.fillStyle = hsl(206, 8, 22); ctx.fillRect(P(x0 - 10), P(r.y - 2), P(w + 20), 6);
  }

  function drawLights(ctx, m, pal, night, W, H, screenSpace) {
    if (!night) {
      // 白天的整体提亮只在独立页面里做；游戏内由主题氛围层负责，叠两次会发灰
      if (screenSpace) { ctx.fillStyle = 'rgba(255,250,235,0.05)'; ctx.fillRect(0, 0, W, H); }
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of m.lights) {
      if (!l.on) continue;
      const room = m.rooms.find(r => r.id === l.room);
      // 光必须被本间房的墙体截住：否则一盏顶灯会把光晕泼到楼上楼下和邻室，
      // 剖面图立刻从「一间间房」塌成「一团团亮斑」。
      if (room) { ctx.save(); ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip(); }
      const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
      const c = l.warm ? '255,206,130' : '190,220,255';
      g.addColorStop(0, 'rgba(' + c + ',0.34)');
      g.addColorStop(0.55, 'rgba(' + c + ',0.12)');
      g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(P(l.x - l.r), P(l.y - l.r), P(l.r * 2), P(l.r * 2));
      if (room) ctx.restore();
    }
    ctx.restore();
    // 未开灯房间压暗，形成冷暖分布
    ctx.fillStyle = 'rgba(6,10,18,0.34)';
    for (const r of m.rooms) {
      if (r.lit) continue;
      ctx.fillRect(P(r.x), P(r.y), P(r.w), P(r.h));
    }
    for (const w of m.windows) {
      const room = m.rooms.find(rr => rr.id === w.room);
      if (!room || !room.lit) continue;
      ctx.fillStyle = 'rgba(255,210,140,0.10)';
      ctx.fillRect(P(w.x - 6), P(w.y + w.h), P(w.w + 12), 26);
    }
  }

  function drawVignette(ctx, W, H) {
    const band = 5, depth = 92, max = 0.30;
    const rows = Math.ceil(depth / band);
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = 'rgba(8,6,14,' + (max * (1 - i / rows)).toFixed(3) + ')';
      ctx.fillRect(0, i * band, W, band);
      ctx.fillRect(0, H - (i + 1) * band, W, band);
      ctx.fillRect(i * band, 0, band, H);
      ctx.fillRect(W - (i + 1) * band, 0, band, H);
    }
  }

  // ---------- 主渲染 ----------
  // 图层序列只写一份：villa.html 用 render()（屏幕空间，含天空与暗角），
  // 游戏内用 renderWorld()（世界坐标 + 相机偏移，天空/暗角由游戏主题层负责）。
  function layers(ctx, m, pal, amb, o, screenSpace) {
    if (screenSpace) drawSky(ctx, m, pal, m.world.w, m.world.h);
    drawFar(ctx, m, pal);
    drawYard(ctx, m, pal, o.night);

    for (const r of m.rooms) drawRoomBack(ctx, m, r, pal, amb);
    for (const w of m.windows) drawWindow(ctx, w, pal, amb, o.night);
    for (const d of m.doors) drawDoor(ctx, d, amb);

    for (const s of m.slabs) {
      surface(ctx, s.mat, s.x, s.y, s.w, s.h, 30, (s.x * 3 + s.y * 7) >>> 0, amb);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(P(s.x), P(s.y + s.h - 2), P(s.w), 2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(P(s.x), P(s.y), P(s.w), 1);
    }
    for (const w of m.walls) {
      if (w.broken) continue;                       // 被轰开的可破坏墙：游戏里拆掉后这里也要跟着消失
      if (w.kind === 'breakable') {
        surface(ctx, 'plaster', w.x, w.y, w.w, w.h, 40, (w.x * 5) >>> 0, amb);
        ctx.strokeStyle = hsl(40, 10, 22); ctx.lineWidth = 1.5;
        let s = (w.x * 31) >>> 0 || 1;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let k = 0; k < 5; k++) {
          const cy = w.y + 8 + k * (w.h / 5.5);
          ctx.beginPath(); ctx.moveTo(P(w.x), P(cy));
          ctx.lineTo(P(w.x + w.w * (0.3 + rnd() * 0.4)), P(cy + 6)); ctx.lineTo(P(w.x + w.w), P(cy + 2)); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,170,60,0.18)'; ctx.fillRect(P(w.x), P(w.y), P(w.w), P(w.h));
      } else {
        surface(ctx, w.mat === 'plaster' ? 'plaster' : 'stone', w.x, w.y, w.w, w.h, 30, (w.x * 13) >>> 0, amb);
      }
      edge(ctx, w.x, w.y, w.w, w.h, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.35)');
    }
    drawRoof(ctx, m, pal, amb);
    for (const st of m.stairs) drawStairs(ctx, st, m, amb);
    if (m.elevator) drawElevator(ctx, m.elevator, amb);

    for (const f of m.furniture) if (FD[f.kind] && !PROPS[f.kind]) {
      FD[f.kind](ctx, f);
      if (f.anchor === 'floor') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(P(f.x + 2), P(f.y + f.h - 1), P(f.w - 4), 2);
      }
    }
    for (const f of m.furniture) if (PROPS[f.kind]) PROPS[f.kind](ctx, f);

    // 前景：剖面左右边缘的侧墙厚度，给画面一点纵深
    const topLv = m.levels[m.levels.length - 1];
    ctx.fillStyle = hsl(30, 10, 14);
    ctx.fillRect(P(m.world.bx0 - 22), P(topLv.top - 20), 6, m.world.h - (topLv.top - 20));
    ctx.fillRect(P(m.world.bx1 + 16), P(topLv.top - 20), 6, m.world.h - (topLv.top - 20));

    drawLights(ctx, m, pal, o.night, m.world.w, m.world.h, screenSpace);
    if (screenSpace) drawVignette(ctx, m.world.w, m.world.h);
  }

  function render(ctx, m, opts) {
    const o = Object.assign({ night: false, density: 1 }, opts || {});
    const pal = o.night ? PAL.night : PAL.day;
    ctx.save();
    ctx.clearRect(0, 0, m.world.w, m.world.h);
    layers(ctx, m, pal, o.night ? 0.34 : 1, o, true);
    ctx.restore();
  }

  // 游戏内：世界坐标 + 相机偏移；天空/暗角/雾由 ui.js 的主题层负责
  function renderWorld(ctx, m, cam, opts) {
    const o = Object.assign({ night: false }, opts || {});
    const pal = o.night ? PAL.night : PAL.day;
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    layers(ctx, m, pal, o.night ? 0.34 : 1, o, false);
    ctx.restore();
  }

  return { render, renderWorld, PAL, surface, FD, PROPS, hsl };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VillaDraw;
