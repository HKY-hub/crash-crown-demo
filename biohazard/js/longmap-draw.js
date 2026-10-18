// ============ 横版长地图 · 渲染层 ============
// 只读数据模型（LongMapGen.build 的产物），不写回任何字段。
// 视觉规范：统一像素网格（px()/pxRect 取整）、有限色板、关闭图像平滑，
// 全部形状由 fillRect 组合，不用平滑渐变、不用高清矢量线、不用预制图。
const LongMapDraw = (() => {
  // ---------- 有限色板：一套基色 + 三档时间光照派生，所有主题共用 ----------
  const BASE = {
    sky: ['#8fa3b8', '#5f6b86', '#1b2334'],
    asphalt: '#3a3f47', asphaltHi: '#4a5058', asphaltLo: '#2a2e35',
    concrete: '#6b6a63', concreteHi: '#807e75', concreteLo: '#4d4c47',
    brick: '#8a5140', brickHi: '#a06350', brickLo: '#5f3729', brickMortar: '#9c9186',
    glass: '#4d6b7a', glassHi: '#7fa3b5', glassDark: '#28333c',
    metal: '#5c6672', metalHi: '#7d8996', metalLo: '#39424c', metalRust: '#8a5a3c',
    wood: '#8a6238', woodHi: '#a6794a', woodLo: '#5c3f22',
    tile: '#a8b3ad', tileHi: '#c4cdc7', tileLo: '#77827d',
    granite: '#7b7d84', graniteHi: '#93969d', graniteLo: '#55575d',
    grating: '#4a5158', gratingHi: '#68727a', gratingLo: '#2b3136',
    ballast: '#5a544c', ballastHi: '#6e675d', ballastLo: '#3e3a34',
    dirt: '#5c4a38', dirtHi: '#6f5a44', dirtLo: '#3b2f24',
    membrane: '#575b58', membraneHi: '#6b7069', membraneLo: '#3c3f3d',
    pavement: '#71685c', pavementHi: '#877d6f', pavementLo: '#4e483f',
    paint: '#d8d2b6', paintDim: '#a8a288', warn: '#d8a53a', danger: '#b4483a',
    grass: '#4f6b3a', grassHi: '#63844a', grassLo: '#33472a',
    infection: '#6f9a3e', infectionHi: '#9ac95a', infectionLo: '#3f5a26',
    blood: '#6e2222', bloodLo: '#431414',
    dark: '#14181f', line: '#0d1116',
  };
  // 三档光照：乘性压暗 + 加性偏色，一次派生全部材质变体，避免逐像素计算
  const TOD = {
    day: { mul: 1.0, add: [6, 6, 8], sky: 0, amb: 'rgba(255,240,210,0.05)', grade: 'rgba(120,130,150,0.06)', sun: '#fff0c8', lamp: 0.10 },
    dusk: { mul: 0.74, add: [26, 6, -12], sky: 1, amb: 'rgba(255,140,60,0.10)', grade: 'rgba(90,50,60,0.16)', sun: '#ff9a4a', lamp: 0.55 },
    night: { mul: 0.40, add: [-4, 2, 22], sky: 2, amb: 'rgba(70,90,180,0.10)', grade: 'rgba(10,16,40,0.30)', sun: '#cdd8ff', lamp: 1.0 },
  };
  function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rgb2hex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function shade(hex, t) {
    const p = TOD[t], a = p.add;
    return rgb2hex(hex2rgb(hex)[0] * p.mul + a[0], hex2rgb(hex)[1] * p.mul + a[1], hex2rgb(hex)[2] * p.mul + a[2]);
  }
  // 预派生：PAL[tod].asphalt / .asphaltHi / ...
  const PAL = {};
  for (const t of Object.keys(TOD)) {
    const o = {};
    for (const k of Object.keys(BASE)) o[k] = typeof BASE[k] === 'string' && BASE[k][0] === '#' && !BASE[k].includes(',') ? shade(BASE[k], t) : BASE[k];
    o.skyList = BASE.sky.map(s => shade(s, t));
    o.tod = t; o.lamp = TOD[t].lamp;
    PAL[t] = o;
  }

  // ---------- 确定性抖动 ----------
  function h2(seed, i) { let x = (seed * 2654435761 + i * 40503) >>> 0; x ^= x >> 13; return ((x * 1274126177) >>> 0) % 1000 / 1000; }

  // ---------- 材质库：七种可复用纹理 + 边缘处理 ----------
  const MATDEF = {
    asphalt: { base: 'asphalt', hi: 'asphaltHi', lo: 'asphaltLo', tex: 'speck' },
    paving: { base: 'pavement', hi: 'pavementHi', lo: 'pavementLo', tex: 'slab' },
    pavement: { base: 'pavement', hi: 'pavementHi', lo: 'pavementLo', tex: 'slab' },
    concrete: { base: 'concrete', hi: 'concreteHi', lo: 'concreteLo', tex: 'panel' },
    granite: { base: 'granite', hi: 'graniteHi', lo: 'graniteLo', tex: 'slab' },
    brick: { base: 'brick', hi: 'brickHi', lo: 'brickLo', tex: 'brick' },
    tile: { base: 'tile', hi: 'tileHi', lo: 'tileLo', tex: 'tile' },
    metal: { base: 'metal', hi: 'metalHi', lo: 'metalLo', tex: 'metal' },
    wood: { base: 'wood', hi: 'woodHi', lo: 'woodLo', tex: 'wood' },
    grating: { base: 'grating', hi: 'gratingHi', lo: 'gratingLo', tex: 'grate' },
    ballast: { base: 'ballast', hi: 'ballastHi', lo: 'ballastLo', tex: 'speck' },
    dirt: { base: 'dirt', hi: 'dirtHi', lo: 'dirtLo', tex: 'speck' },
    membrane: { base: 'membrane', hi: 'membraneHi', lo: 'membraneLo', tex: 'seam' },
    glass: { base: 'glass', hi: 'glassHi', lo: 'glassDark', tex: 'glass' },
  };
  function pal(pal, key) { return pal[key] || pal.concrete; }

  // 主体填充：底色 + 该材质自己的纹理，全部走整数矩形
  function matBody(p, ctx, mat, x, y, w, h, seed, opt) {
    const d = MATDEF[mat] || MATDEF.concrete;
    const base = pal(p, d.base), hi = pal(p, d.hi), lo = pal(p, d.lo);
    ctx.fillStyle = base; ctx.fillRect(px(x), px(y), px(w), px(h));
    const o = opt || {};
    switch (d.tex) {
      case 'speck':
        pxNoise(ctx, x, y, w, h, hi, seed, 0.10);
        pxNoise(ctx, x, y, w, h, lo, seed + 7, 0.07);
        break;
      case 'slab': {
        const s = 26;
        ctx.fillStyle = lo;
        for (let gx = x + s; gx < x + w; gx += s) ctx.fillRect(px(gx), px(y), 1, px(h));
        for (let gy = y + s; gy < y + h; gy += s) ctx.fillRect(px(x), px(gy), px(w), 1);
        break;
      }
      case 'panel': {
        const s = 44;
        ctx.fillStyle = lo;
        for (let gx = x + s; gx < x + w; gx += s) ctx.fillRect(px(gx), px(y), 1, px(h));
        ctx.fillStyle = hi;
        for (let gy = y + s; gy < y + h; gy += s * 2) ctx.fillRect(px(x), px(gy), px(w), 1);
        break;
      }
      case 'brick': {
        const bw = 22, bh = 8;
        ctx.fillStyle = pal(p, 'brickMortar');
        for (let row = 0, gy = y; gy < y + h; gy += bh, row++) {
          ctx.fillRect(px(x), px(gy), px(w), 1);
          const off = (row % 2) * (bw / 2);
          for (let gx = x + off; gx < x + w; gx += bw) ctx.fillRect(px(gx), px(gy), 1, Math.min(bh, px(y + h - gy)));
        }
        ctx.fillStyle = hi;
        for (let gy = y + bh; gy < y + h; gy += bh * 3) ctx.fillRect(px(x), px(gy), px(w), 1);
        break;
      }
      case 'tile': {
        // 14px 网格铺在大面积上就是雪花噪点，肉眼无法读出「瓷砖」；放到 26px 并去掉抖动
        const s = 26;
        ctx.fillStyle = lo;
        for (let gx = x; gx < x + w; gx += s) ctx.fillRect(px(gx), px(y), 1, px(h));
        for (let gy = y; gy < y + h; gy += s) ctx.fillRect(px(x), px(gy), px(w), 1);
        break;
      }
      case 'metal': {
        ctx.fillStyle = hi;
        for (let gy = y + 3; gy < y + h; gy += 12) ctx.fillRect(px(x), px(gy), px(w), 1);
        ctx.fillStyle = lo;
        for (let gx = x + 8; gx < x + w - 4; gx += 30) { ctx.fillRect(px(gx), px(y + 4), 2, 2); ctx.fillRect(px(gx), px(y + h - 6), 2, 2); }
        if (h2(seed, 3) > 0.55) { ctx.fillStyle = pal(p, 'metalRust'); ctx.fillRect(px(x + w * 0.6), px(y), px(w * 0.18), px(h * h2(seed, 4) * 0.7 + 0.2)); }
        break;
      }
      case 'wood': {
        ctx.fillStyle = lo;
        for (let gy = y + 4; gy < y + h; gy += 7) ctx.fillRect(px(x), px(gy), px(w), 1);
        ctx.fillStyle = hi;
        for (let gx = x + 18; gx < x + w; gx += 34) ctx.fillRect(px(gx), px(y), 1, px(h));
        break;
      }
      case 'grate': {
        ctx.fillStyle = lo;
        for (let gx = x; gx < x + w; gx += 7) ctx.fillRect(px(gx), px(y), 3, px(h));
        ctx.fillStyle = hi;
        for (let gy = y + 2; gy < y + h; gy += 9) ctx.fillRect(px(x), px(gy), px(w), 1);
        break;
      }
      case 'seam': {
        ctx.fillStyle = lo;
        for (let gx = x + 40; gx < x + w; gx += 40) ctx.fillRect(px(gx), px(y), 2, px(h));
        ctx.fillStyle = hi; ctx.fillRect(px(x), px(y), px(w), 1);
        break;
      }
      case 'glass': {
        ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x), px(y), px(w), px(h));
        ctx.fillStyle = hi;
        ctx.fillRect(px(x), px(y), px(w * 0.42), px(h * 0.30));
        ctx.fillRect(px(x + w * 0.10), px(y + h * 0.55), px(w * 0.18), px(h * 0.18));
        break;
      }
    }
    if (!o.noEdge) matEdge(p, ctx, mat, x, y, w, h);
  }
  // 边缘处理：顶面提亮、底面压暗、四周一根硬描边（像素风的「线」必须只有 1px）
  function matEdge(p, ctx, mat, x, y, w, h) {
    const d = MATDEF[mat] || MATDEF.concrete;
    ctx.fillStyle = pal(p, d.hi); ctx.fillRect(px(x), px(y), px(w), 2);
    ctx.fillStyle = pal(p, d.lo); ctx.fillRect(px(x), px(y + h - 2), px(w), 2);
    ctx.fillStyle = pal(p, 'line');
    ctx.fillRect(px(x), px(y), 1, px(h)); ctx.fillRect(px(x + w - 1), px(y), 1, px(h));
  }

  // ---------- 破损 / 污渍 / 涂鸦 / 藤蔓 / 感染 ----------
  function drawCrack(p, ctx, x, y, w, h, seed) {
    ctx.fillStyle = pal(p, 'line');
    let cx = x + w * 0.5, cy = y;
    for (let i = 0; i < 10; i++) {
      const nx = cx + (h2(seed, i * 2) - 0.5) * 9, ny = cy + h / 10;
      ctx.fillRect(px(Math.min(cx, nx)), px(cy), px(Math.abs(nx - cx)) + 1, px(ny - cy) + 1);
      if (h2(seed, i + 30) > 0.62) ctx.fillRect(px(nx), px(ny), px(6 + h2(seed, i + 31) * 8), 1);
      cx = nx; cy = ny;
    }
  }
  function drawStain(p, ctx, x, y, w, h, seed, col) {
    ctx.fillStyle = col || pal(p, 'lo') || pal(p, 'concreteLo');
    for (let i = 0; i < 5; i++) {
      const r = 2 + h2(seed, i) * (h / 2);
      ctx.fillRect(px(x + h2(seed, i + 9) * w - r), px(y + h2(seed, i + 21) * h - r / 2), px(r * 2), px(r));
    }
  }
  function drawGrowth(p, ctx, x, y, w, h, seed, inf) {
    const c1 = inf ? pal(p, 'infection') : pal(p, 'grass'), c2 = inf ? pal(p, 'infectionHi') : pal(p, 'grassHi');
    for (let i = 0; i < Math.max(3, w / 6); i++) {
      const bx = x + h2(seed, i) * w, bh = 3 + h2(seed, i + 40) * h;
      ctx.fillStyle = i % 3 === 0 ? c2 : c1;
      ctx.fillRect(px(bx), px(y + h - bh), 2, px(bh));
      if (i % 4 === 0) ctx.fillRect(px(bx - 2), px(y + h - bh), 5, 2);
    }
  }
  function drawGraffiti(p, ctx, x, y, w, h, seed) {
    const cols = [pal(p, 'danger'), pal(p, 'warn'), pal(p, 'glass'), pal(p, 'infection')];
    ctx.fillStyle = cols[Math.floor(h2(seed, 1) * cols.length) % cols.length];
    for (let i = 0; i < 4; i++) {
      const bx = x + i * (w / 4) + 2, bw = w / 4 - 5;
      ctx.fillRect(px(bx), px(y + 2 + h2(seed, i) * 4), px(bw), 4);
      ctx.fillRect(px(bx + bw * 0.3), px(y), 3, px(h));
    }
  }

  // ---------- 天空 / 远景 ----------
  function drawSky(p, ctx, M, cam, W, H, t) {
    const bands = 26, sky = p.skyList;
    const top = sky[2], mid = sky[1], hor = sky[0];
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      const c = k < 0.55 ? rgb2hex(...hex2rgb(top).map((v, j) => v + (hex2rgb(mid)[j] - v) * (k / 0.55))
      ) : rgb2hex(...hex2rgb(mid).map((v, j) => v + (hex2rgb(hor)[j] - v) * ((k - 0.55) / 0.45)));
      ctx.fillStyle = c;
      ctx.fillRect(0, px(i * H * 0.62 / bands), W, px(H * 0.62 / bands) + 1);
    }
    // 太阳/月亮 + 远处骚动的火光（夜里更亮，随时间轻微闪动）
    const cx = W * 0.72 - cam.x * 0.02, cy = H * 0.16;
    ctx.fillStyle = 'rgba(255,240,200,0.10)'; pxCircle(ctx, cx, cy, 30);
    ctx.fillStyle = p.tod === 'night' ? pal(p, 'glass') : shade('#ffe9a8', p.tod); pxCircle(ctx, cx, cy, 21);
    ctx.fillStyle = p.tod === 'night' ? pal(p, 'glassHi') : p.tod === 'dusk' ? shade(BASE.warn, 'dusk') : shade('#fff3cf', 'day');
    pxCircle(ctx, cx, cy, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.30)'; pxCircle(ctx, cx - 5, cy - 5, 5);
    if (p.tod !== 'day') {
      for (let i = 0; i < 90; i++) {
        const sx = (h2(991, i) * W * 2 - cam.x * 0.03) % W, sy = h2(777, i) * H * 0.4;
        ctx.fillStyle = h2(555, i) > 0.6 ? pal(p, 'glassHi') : pal(p, 'glass');
        ctx.fillRect(px(sx < 0 ? sx + W : sx), px(sy), 2, 2);
      }
    }
    // 远处骚动：城市方向的地平线红光，夜里跳动
    const glow = p.tod === 'night' ? 0.16 + 0.06 * Math.sin(t * 1.7) : p.tod === 'dusk' ? 0.09 : 0.04;
    ctx.fillStyle = 'rgba(190,80,45,' + glow.toFixed(3) + ')';
    for (let i = 0; i < 2; i++) ctx.fillRect(0, px(H * 0.30 + i * 4), W, 4);
  }

  function drawFar(p, ctx, M, cam, W, H) {
    const par = 0.22, baseY = H * 0.62 - cam.y * 0.10;
    ctx.fillStyle = pal(p, 'graniteLo'); ctx.fillRect(0, px(baseY), W, H);
    ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(0, px(baseY + 26), W, H);
    for (const f of M.far) {
      const sx = (f.x - cam.x) * par;
      if (sx + f.w * par < -40 || sx > W + 40) continue;
      const h = f.h, w = Math.max(6, f.w * par);
      const x = px(sx), y = px(baseY - h * 0.72);
      ctx.fillStyle = pal(p, 'graniteLo');
      ctx.fillRect(x, y, px(w), px(h * 0.72));
      ctx.fillStyle = pal(p, 'granite');
      ctx.fillRect(x, y, px(w), 3);
      if (f.kind === 'chimney') { ctx.fillStyle = pal(p, 'graniteLo'); ctx.fillRect(x + px(w * 0.3), y - 26, 8, 26); ctx.fillRect(x + px(w * 0.6), y - 18, 6, 18); }
      else if (f.kind === 'dome') { ctx.fillStyle = pal(p, 'granite'); ctx.fillRect(x + px(w * 0.25), y - 14, px(w * 0.5), 14); }
      else if (f.kind === 'crane') {
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(x + px(w * 0.5), y - 60, 3, 60); ctx.fillRect(x - 10, y - 60, px(w + 20), 3);
        ctx.fillRect(x + px(w * 0.2), y - 57, 2, 16);
      }
      // 远景窗格只在夜里点灯，白天压成剪影
      if (p.tod !== 'day') {
        for (let i = 0; i < f.win * 3; i++) {
          if (h2(f.x + i, 5) > 0.62) continue;
          ctx.fillStyle = h2(f.x + i, 9) > 0.5 ? 'rgba(255,210,120,0.55)' : 'rgba(150,190,220,0.35)';
          ctx.fillRect(x + 3 + px(h2(f.x + i, 2) * (w - 7)), y + 6 + px(h2(f.x + i, 3) * (h * 0.6)), 2, 3);
        }
      }
    }
    // 地平线雾带（分带，不用平滑渐变）
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(120,130,150,' + (0.05 - i * 0.006).toFixed(3) + ')';
      ctx.fillRect(0, px(baseY - 20 + i * 6), W, 6);
    }
  }

  // 土体：三层深浅 + 碎石 + 一根市政管 + 树根，纯 fillRect，不用渐变
  function drawSubsoil(p, ctx, x, y, w, h, seed) {
    if (h <= 0) return;
    const bands = [[0, 16, 'pavementLo'], [16, 52, 'ballastLo'], [52, 9999, 'dark']];
    for (const [a, b, key] of bands) {
      const top = y + a, hh = Math.max(0, Math.min(h, b) - a);
      if (hh <= 0) continue;
      ctx.fillStyle = pal(p, key); ctx.fillRect(px(x), px(top), px(w), px(hh));
    }
    ctx.fillStyle = pal(p, 'ballast');
    for (let i = 0; i < w / 9; i++) {
      const sx = x + h2(seed, i) * w, sy = y + 12 + h2(seed, i + 60) * Math.max(1, h - 16);
      ctx.fillRect(px(sx), px(sy), 3 + (i % 3), 2 + (i % 2));
    }
    const py = y + 62 + h2(seed, 7) * 26;
    ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x), px(py), px(w), 9);
    ctx.fillStyle = pal(p, 'metal'); ctx.fillRect(px(x), px(py), px(w), 2);
    for (let i = 0; i < w; i += 46) ctx.fillRect(px(x + i + 8), px(py - 2), 4, 13);
    ctx.fillStyle = pal(p, 'woodLo');
    for (let i = 0; i < 3; i++) {
      const rx = x + h2(seed, i + 30) * w;
      ctx.fillRect(px(rx), px(y + 4), 2, px(14 + h2(seed, i + 31) * 22));
      ctx.fillRect(px(rx - 4), px(y + 16), 9, 2);
    }
  }

  // 地下段的「洞室」：恒定 118px 净高，顶板随剖面走，配立柱/拱脚/管廊/电缆桥架。
  // 不加这层，「地下维修通道」就只是路面凹下去一块，完全读不出在地下。
  function drawUndercroft(p, ctx, M, cam, W) {
    for (const s of M.segments) {
      if (s.level !== 'under') continue;
      if (s.x1 - cam.x < -60 || s.x0 - cam.x > W + 60) continue;
      for (let x = s.x0; x <= s.x1; x += 8) {
        const fy = M.groundAt(x), cy = fy - 118, X = px(x - cam.x), Y = px(cy - cam.y);
        ctx.fillStyle = pal(p, 'dark'); ctx.fillRect(X, Y + 10, 9, px(110));            // 挖出来的暗腔
        ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(X, Y, 9, 10);                 // 顶板
        ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(X, Y, 9, 2);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(X, Y + 16, 9, 5);                // 管廊
        ctx.fillStyle = pal(p, 'metal'); ctx.fillRect(X, Y + 16, 9, 2);
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(X, fy - 4 - cam.y, 9, 4);           // 墙脚阴影
      }
      for (let x = s.x0 + 30; x < s.x1; x += 148) {
        const cy = M.groundAt(x) - 118, X = px(x - cam.x), Y = px(cy - cam.y);
        ctx.fillStyle = pal(p, 'concrete'); ctx.fillRect(X, Y, 13, 118);
        ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(X, Y, 13, 3); ctx.fillRect(X - 5, Y + 6, 23, 5);
        ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(X - 3, Y + 112, 19, 6);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(X + 3, Y + 40, 7, 3);
      }
    }
  }

  // ---------- 中景：地面 / 建筑 / 室内 / 支路 ----------
  function visible(list, x0, x1, pad) {
    const out = [];
    for (const it of list) { const a = it.x === undefined ? it.x0 : it.x; if (a + (it.w || 0) + pad > x0 && a - pad < x1) out.push(it); }
    return out;
  }

  function drawGround(p, ctx, M, cam, W, H) {
    const x0 = cam.x - 40, x1 = cam.x + W + 40;
    for (const s of M.solids) {
      if (s.bound || !s.main) continue;
      if (s.x + s.w < x0 || s.x > x1) continue;
      const y = s.y - cam.y, x = s.x - cam.x;
      const seg = M.segAt(s.x);
      // 剖面里的「地面」不是一堵墙：只有最上面十几像素是可行走的路面材质，
      // 往下必须是土体。整块按路面材质铺，74px 厚的道面就会变成一面巨大的瓷砖墙。
      const surf = 14;
      matBody(p, ctx, seg.ground, x, y, s.w, surf, s.x >> 3);
      ctx.fillStyle = pal(p, (MATDEF[seg.ground] || MATDEF.concrete).hi);
      ctx.fillRect(px(x), px(y), px(s.w), 2);
      // 可行走面的「恒亮」描边：夜晚材质被压到 40% 亮度后，泥地/沥青与下面的土体几乎分不开，
      // 而规格要求玩家始终能分辨地面、危险处和出口 —— 这条线不随时间光照变暗。
      ctx.fillStyle = p.tod === 'day' ? 'rgba(255,255,255,0.12)' : p.tod === 'dusk' ? 'rgba(255,235,200,0.24)' : 'rgba(205,228,255,0.30)';
      ctx.fillRect(px(x), px(y), px(s.w), 1);
      if (seg.ground === 'asphalt' || seg.ground === 'paving') {
        ctx.fillStyle = pal(p, 'paintDim');
        if (s.w > 90) for (let mx = x + 30; mx < x + s.w - 20; mx += 74) ctx.fillRect(px(mx), px(y + 5), 30, 3);
      }
      if (seg.ground === 'ballast') {
        ctx.fillStyle = pal(p, 'woodLo');
        for (let mx = x + 6; mx < x + s.w - 6; mx += 22) ctx.fillRect(px(mx), px(y + 3), 14, 4);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y), px(s.w), 2);
      }
      if (seg.ground === 'grating') {
        ctx.fillStyle = pal(p, 'gratingHi');
        for (let mx = x + 4; mx < x + s.w - 4; mx += 16) ctx.fillRect(px(mx), px(y), 2, 8);
      }
      if (seg.ground === 'dirt') {
        ctx.fillStyle = pal(p, 'dirtLo');
        for (let mx = x + 5; mx < x + s.w; mx += 17) ctx.fillRect(px(mx), px(y + 3 + (mx % 3)), 6, 4);
        drawGrowth(p, ctx, x, y - 7, s.w, 9, s.x >> 2, seg.variant === 1);
      }
      if (seg.ground === 'pavement' || seg.ground === 'granite') {
        ctx.fillStyle = pal(p, 'line');
        for (let mx = x + 26; mx < x + s.w; mx += 26) ctx.fillRect(px(mx), px(y + 2), 1, px(surf - 2));
      }
      // 路缘：行人道与车行道之间那道 4px 立边
      ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(px(x), px(y + surf), px(s.w), 3);
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(px(x), px(y + surf + 3), px(s.w), 3);
      drawSubsoil(p, ctx, x, y + surf + 6, s.w, Math.max(0, H - y - surf) + 60, s.x >> 3);
    }
    // 断口里的积水与外露钢筋
    for (const seg of M.segments) {
      for (const t of seg.trenches) {
        if (t.x1 < x0 || t.x0 > x1) continue;
        const x = t.x0 - cam.x, y = t.y + t.depth - cam.y;
        ctx.fillStyle = 'rgba(40,60,70,0.55)'; ctx.fillRect(px(x), px(y + 6), px(t.x1 - t.x0), 6);
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 4; i++) ctx.fillRect(px(x + 4 + i * 13), px(y - 6 - (i % 2) * 5), 2, 12);
      }
    }
  }

  // 窗框：外框 + 中竖 + 玻璃 + 夜里的室内灯光
  function drawWindow(p, ctx, x, y, w, h, seed, lit, broken) {
    matBody(p, ctx, 'metal', x, y, w, h, seed, { noEdge: true });
    ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 2), px(y + 2), px(w - 4), px(h - 4));
    if (broken) {
      ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + 2), px(y + 2), px(w - 4), px(h - 4));
      ctx.fillStyle = pal(p, 'glass');
      ctx.fillRect(px(x + 2), px(y + 2), px(w * 0.4), px(h * 0.25));
      ctx.fillStyle = pal(p, 'line');
      for (let i = 0; i < 3; i++) ctx.fillRect(px(x + 3 + i * (w / 3)), px(y + h * 0.5 + i * 2), 2, px(h * 0.4));
    } else {
      matBody(p, ctx, 'glass', x + 3, y + 3, w - 6, h - 6, seed + 1, { noEdge: true });
      ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + w / 2 - 1), px(y + 2), 2, px(h - 4));
      ctx.fillRect(px(x + 2), px(y + h / 2 - 1), px(w - 4), 2);
    }
    ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(px(x - 2), px(y + h), px(w + 4), 3);   // 窗台
    if (lit && p.tod !== 'day') {
      ctx.fillStyle = 'rgba(255,205,120,0.30)'; ctx.fillRect(px(x + 3), px(y + 3), px(w - 6), px(h - 6));
    }
  }

  function drawFacade(p, ctx, M, b, cam, W, H) {
    const x = b.x - cam.x, y = b.y - cam.y;
    // 后一层（2.5D 深度）：整体压暗并右移
    if (b.depth) {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(px(x + 12), px(y + 8), px(b.w), px(b.h));
    }
    matBody(p, ctx, b.mat, x, y, b.w, b.h, b.x >> 2);
    // 楼层线 + 楼板厚度
    ctx.fillStyle = pal(p, 'concreteLo');
    for (let f = 1; f < b.floors; f++) ctx.fillRect(px(x), px(y + f * b.fh), px(b.w), 4);
    // 窗格阵列
    const cols = Math.max(2, b.bays), cw = b.w / cols;
    for (let f = 0; f < b.floors; f++) {
      for (let c = 0; c < cols; c++) {
        const seed = b.x * 7 + f * 31 + c * 5;
        const r = h2(seed, 2);
        const wx = x + 6 + c * cw, wy = y + f * b.fh + 18;
        const ww = Math.max(12, cw - 14), wh = Math.min(b.fh - 34, 40);
        if (r < 0.14) { drawDoorish(p, ctx, wx, wy, ww, wh, seed); continue; }
        drawWindow(p, ctx, wx, wy, ww, wh, seed, r > 0.55, r < 0.24);
      }
    }
    // 地下室：街面以下再走一层，带高窗与台阶井；纯视觉，不参与通行
    if (h2(b.x, 77) < 0.52) {
      const by = y + b.h, bh = 58;
      matBody(p, ctx, 'concrete', x, by, b.w, bh, b.x >> 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px(x), px(by), px(b.w), px(bh));
      ctx.fillStyle = pal(p, 'glassDark');
      for (let i = 0; i < Math.max(2, b.w / 54); i++) ctx.fillRect(px(x + 12 + i * 54), px(by + 8), 26, 10);
      ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + b.w * 0.5 - 12), px(by + 10), 24, px(bh - 10));
      ctx.fillStyle = pal(p, 'concreteLo');
      for (let i = 0; i < 5; i++) ctx.fillRect(px(x + b.w * 0.5 - 12 + i * 4), px(by + bh - 8 - i * 9), 20 - i * 4, 3);
    }
    // 屋顶构件
    if (b.roof === 'parapet') {
      ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(px(x - 3), px(y - 8), px(b.w + 6), 8);
      ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(px(x - 3), px(y - 8), px(b.w + 6), 2);
    } else if (b.roof === 'slope') {
      ctx.fillStyle = pal(p, 'brickLo');
      for (let i = 0; i < b.w; i += 4) { const k = i / b.w, hh = Math.round(26 * (1 - Math.abs(k - 0.5) * 2)); ctx.fillRect(px(x + i), px(y - 8 - hh), 4, hh + 8); }
    } else if (b.roof === 'gear') {
      ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 8), px(y - 22), 30, 22);
      ctx.fillRect(px(x + b.w - 44), px(y - 14), 26, 14);
      ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 8), px(y - 22), 30, 2);
    }
    if (b.roof === 'flat' || b.roof === 'gear') {
      ctx.fillStyle = pal(p, 'metal'); ctx.fillRect(px(x + b.w * 0.3), px(y - 30), 22, 30);   // 水箱
      ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + b.w * 0.3), px(y - 30), 22, 3);
      ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + b.w * 0.72), px(y - 18), 12, 18); // 通风井
    }
    // 排水管 + 空调外机 + 电缆
    ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + b.w - 10), px(y), 4, px(b.h));
    for (let f = 0; f < b.floors; f++) {
      if (h2(b.x + f, 11) > 0.55) {
        const ax = x + 10 + h2(b.x + f, 12) * (b.w - 40), ay = y + f * b.fh + b.fh - 22;
        matBody(p, ctx, 'metal', ax, ay, 22, 14, f + b.x, { noEdge: true });
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(ax + 3), px(ay + 3), 16, 8);
      }
    }
    // 招牌 / 雨棚
    if (b.sign) {
      const sw = Math.min(b.w - 16, 96), sx = x + (b.w - sw) / 2, sy = y + b.h - 46;
      matBody(p, ctx, 'metal', sx, sy, sw, 22, b.x + 3, { noEdge: true });
      ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(sx + 2), px(sy + 2), px(sw - 4), 18);
      ctx.fillStyle = pal(p, 'paint');
      for (let i = 0; i < 4; i++) ctx.fillRect(px(sx + 8 + i * (sw / 5)), px(sy + 8), px(sw / 9), 6);
      if (p.tod !== 'day') { ctx.fillStyle = 'rgba(255,220,140,0.35)'; ctx.fillRect(px(sx - 4), px(sy - 4), px(sw + 8), 30); }
    }
    if (b.awning) {
      const aw = Math.min(b.w - 10, 84), ax = x + 6, ay = y + b.h - 66;
      ctx.fillStyle = pal(p, 'danger');
      for (let i = 0; i < 6; i++) ctx.fillRect(px(ax + i * (aw / 6)), px(ay), px(aw / 6) - 1, 14);
      ctx.fillStyle = pal(p, 'paint'); ctx.fillRect(px(ax), px(ay + 14), px(aw), 3);
    }
    // 破损：缺角 + 裂缝 + 渗水
    const ruin = M.opts.ruin;
    if (h2(b.x, 31) < ruin * 0.7) {
      const cw = 10 + h2(b.x, 32) * 30, ch = 8 + h2(b.x, 33) * 26;
      const cx = x + h2(b.x, 34) * (b.w - cw), cy = y + h2(b.x, 35) * (b.h - ch);
      ctx.fillStyle = pal(p, 'dark'); ctx.fillRect(px(cx), px(cy), px(cw), px(ch));
      ctx.fillStyle = pal(p, 'concreteLo');
      for (let i = 0; i < 4; i++) ctx.fillRect(px(cx + i * (cw / 4)), px(cy + ch), 3, 3 + h2(b.x + i, 4) * 6);
    }
    if (h2(b.x, 41) < ruin) drawCrack(p, ctx, x + h2(b.x, 42) * b.w * 0.7, y + h2(b.x, 43) * b.h * 0.6, 40, 60, b.x);
    if (h2(b.x, 51) < ruin * 0.8) {
      ctx.fillStyle = 'rgba(30,40,45,0.30)';
      ctx.fillRect(px(x + h2(b.x, 52) * b.w), px(y + 10), 6, px(b.h * (0.2 + h2(b.x, 53) * 0.5)));
    }
    if (h2(b.x, 61) < M.opts.infection * 0.6) drawGrowth(p, ctx, x, y + b.h - 40, b.w, 40, b.x + 5, M.opts.infection > 0.5);
    if (h2(b.x, 71) < 0.4) drawGraffiti(p, ctx, x + 8, y + b.h - 30, Math.min(b.w - 16, 60), 16, b.x);
  }
  function drawDoorish(p, ctx, x, y, w, h, seed) {
    matBody(p, ctx, 'wood', x, y, w, h, seed, { noEdge: true });
    ctx.fillStyle = pal(p, 'woodLo'); ctx.fillRect(px(x), px(y), px(w), px(h));
    ctx.fillStyle = pal(p, 'woodHi'); ctx.fillRect(px(x + 2), px(y + 2), px(w - 4), px(h - 4));
    ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + w / 2), px(y + 2), 1, px(h - 4));
    ctx.fillStyle = pal(p, 'gold' in p ? p.gold : BASE.warn); ctx.fillRect(px(x + w / 2 + 3), px(y + h / 2), 2, 2);
  }

  // 室内剖面：楼板厚、墙面材质、房间用途家具、内部灯光
  const ROOMITEM = {
    shop: [['shelf', 0.15], ['cart', 0.5], ['vending', 0.8]],
    flat: [['sofa', 0.2], ['table', 0.5], ['bed', 0.78]],
    lobby: [['bench', 0.3], ['plant', 0.7]],
    ward: [['bed', 0.18], ['ivstand', 0.45], ['bed', 0.68]],
    triage: [['stretcher', 0.25], ['medicalcart', 0.6]],
    pharmacy: [['rack', 0.2], ['counter', 0.6]],
    corridor: [['bench', 0.4]],
    storage: [['palletstack', 0.25], ['drum', 0.6], ['rack', 0.8]],
    workshop: [['workbench', 0.3], ['toolchest', 0.7]],
    dock: [['crate', 0.3], ['forklift', 0.65]],
    concourse: [['turnstile', 0.3], ['ticketmachine', 0.65]],
    kiosk: [['vending', 0.4]],
  };
  function drawRoom(p, ctx, r, cam, M) {
    const x = r.x - cam.x, y = r.y - cam.y;
    ctx.fillStyle = pal(p, 'dark'); ctx.fillRect(px(x), px(y), px(r.w), px(r.h));
    // 后墙
    const wallMat = r.type === 'ward' || r.type === 'pharmacy' ? 'tile' : (r.type === 'flat' || r.type === 'lobby' ? 'wallpaper' : 'concrete');
    matBody(p, ctx, wallMat === 'wallpaper' ? 'brick' : wallMat, x + 2, y + 2, r.w - 4, r.h - 4, r.x + 1, { noEdge: true });
    if (wallMat === 'wallpaper') {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i < r.w; i += 12) ctx.fillRect(px(x + i), px(y + 2), 4, px(r.h - 4));
    }
    // 楼板厚度（剖面感的关键：地面不是一条线，而是一块有厚度的板）
    matBody(p, ctx, 'concrete', x, r.floorY - cam.y, r.w, 14, r.x + 2);
    // 家具
    const items = ROOMITEM[r.type] || ROOMITEM.shop;
    for (const [k, at] of items) drawProp(p, ctx, { kind: k, w: 0, h: 0, seed: r.x + Math.round(at * 99) }, x + 10 + at * (r.w - 60), r.floorY - cam.y, M);
    // 内部灯光
    if (r.lit) {
      const g = p.tod === 'day' ? 0.06 : 0.20;
      ctx.fillStyle = 'rgba(255,210,140,' + g.toFixed(3) + ')';
      ctx.fillRect(px(x + 4), px(y + 4), px(r.w - 8), px(r.h - 8));
      ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + r.w / 2 - 8), px(y + 6), 16, 3);
    }
    // 门洞（对准主路线高度）
    ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(r.doorX - cam.x), px(r.floorY - 62 - cam.y), r.doorW, 62);
    ctx.fillStyle = pal(p, 'woodHi'); ctx.fillRect(px(r.doorX - cam.x + 2), px(r.floorY - 60 - cam.y), r.doorW - 4, 60);
  }

  function drawBranch(p, ctx, br, cam) {
    for (const q of br.plats) {
      const x = q.x - cam.x, y = q.y - cam.y;
      matBody(p, ctx, q.mat, x, y, q.w, q.h, q.x);
      // 栏杆 + 斜撑：让人一眼看出「这是可以走的」
      ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - 26), 2, 26); ctx.fillRect(px(x + q.w - 2), px(y - 26), 2, 26);
      ctx.fillRect(px(x), px(y - 26), px(q.w), 2);
      ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + q.w * 0.4), px(y + q.h), 3, 14);
    }
    // 汇入点标记
    const jx = br.joinX - cam.x, jy = br.joinY - cam.y;
    ctx.fillStyle = 'rgba(120,220,160,0.5)'; ctx.fillRect(px(jx), px(jy - 34), 3, 34);
  }

  // ---------- 地标：每段一个可辨认的东西 ----------
  function drawLandmark(p, ctx, lm, cam, M) {
    const x = lm.x - cam.x, y = lm.y - cam.y;
    const k = lm.kind;
    const box = (w, h, mat, ox, oy) => matBody(p, ctx, mat, x + (ox || 0), y - h + (oy || 0), w, h, lm.x + w);
    switch (k) {
      case 'barricade_gate':
        box(220, 74, 'metal', 0, 0); box(220, 8, 'concrete', 0, -74);
        ctx.fillStyle = pal(p, 'warn');
        for (let i = 0; i < 8; i++) ctx.fillRect(px(x + i * 28), px(y - 66), 14, 6);
        box(16, 120, 'concrete', -18, 0); box(16, 120, 'concrete', 222, 0);
        break;
      case 'watchtower':
        box(20, 150, 'metal', 0, 0); box(20, 150, 'metal', 70, 0);
        box(110, 26, 'metal', -10, -150); box(110, 8, 'concrete', -10, -176);
        ctx.fillStyle = 'rgba(255,230,150,0.35)'; ctx.fillRect(px(x + 30), px(y - 170), 50, 20);
        break;
      case 'neon_store':
        box(190, 96, 'brick', 0, 0); matBody(p, ctx, 'glass', x + 12, y - 78, 166, 56, lm.x);
        box(150, 20, 'metal', 20, -120);
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'danger') : 'rgba(255,90,140,0.9)';
        ctx.fillRect(px(x + 26), px(y - 116), 138, 12);
        if (p.tod !== 'day') { ctx.fillStyle = 'rgba(255,120,160,0.22)'; ctx.fillRect(px(x - 10), px(y - 130), 220, 120); }
        break;
      case 'apartment_door':
        box(96, 150, 'brick', 0, 0);
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 26), px(y - 88), 44, 88);
        ctx.fillStyle = pal(p, 'woodHi'); ctx.fillRect(px(x + 30), px(y - 84), 36, 84);
        box(80, 10, 'metal', 8, -150);
        ctx.fillStyle = pal(p, 'glassHi'); ctx.fillRect(px(x + 12), px(y - 146), 72, 6);
        break;
      case 'fallen_pier':
        ctx.fillStyle = pal(p, 'concreteLo');
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x + i * 12), px(y - 120 + i * 16), 40, 22);
        box(160, 34, 'concrete', 60, -40);
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + 70 + i * 30), px(y - 46), 3, 16);
        break;
      case 'tilted_sign':
        ctx.save(); ctx.translate(px(x + 40), px(y - 10)); ctx.rotate(-0.28);
        box(14, 120, 'metal', -6, -110); box(120, 54, 'metal', -50, -170);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x - 56), px(y - 166), 112, 46);
        ctx.restore();
        break;
      case 'hospital_sign':
        box(16, 170, 'concrete', 0, 0); box(150, 46, 'tile', -60, -170);
        ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x - 54), px(y - 164), 138, 34);
        ctx.fillStyle = pal(p, 'paint');
        ctx.fillRect(px(x - 10), px(y - 156), 12, 18); ctx.fillRect(px(x - 17), px(y - 149), 26, 6);
        break;
      case 'triage_tent':
        ctx.fillStyle = pal(p, 'paint');
        for (let i = 0; i < 90; i += 2) { const hh = Math.round(70 * (1 - Math.abs(i / 90 - 0.5) * 1.4)); ctx.fillRect(px(x + i), px(y - hh), 2, hh); }
        ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x + 30), px(y - 46), 30, 6);
        break;
      case 'water_tower':
        box(14, 120, 'metal', 0, -120); box(14, 120, 'metal', 70, -120);
        box(96, 66, 'metal', -2, -240);
        ctx.fillStyle = pal(p, 'metalRust'); ctx.fillRect(px(x + 6), px(y - 226), 82, 12);
        break;
      case 'crane_arm':
        box(18, 210, 'metal', 0, -210);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x - 40), px(y - 218), 220, 12);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 120), px(y - 206), 3, 60);
        break;
      case 'metro_canopy':
        box(210, 16, 'metal', 0, -96); box(14, 96, 'metal', 6, 0); box(14, 96, 'metal', 190, 0);
        ctx.fillStyle = pal(p, 'graniteLo');
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x + 40 + i * 22), px(y - 10 - i * 12), 120 - i * 22, 12);
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'graniteHi') : 'rgba(120,200,255,0.8)';
        ctx.fillRect(px(x + 20), px(y - 92), 170, 8);
        break;
      case 'collapsed_entrance':
        box(150, 60, 'concrete', 0, -60);
        ctx.fillStyle = pal(p, 'dark'); ctx.fillRect(px(x + 20), px(y - 30), 110, 30);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(px(x + 10 + i * 24), px(y - 66 - h2(lm.x + i, 3) * 22), 18, 14); }
        break;
      case 'flood_gate':
        box(200, 110, 'metal', 0, -110);
        ctx.fillStyle = pal(p, 'metalHi');
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + 8 + i * 40), px(y - 104), 6, 100);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + 60), px(y - 60), 80, 14);
        break;
      case 'generator_hall':
        box(170, 90, 'metal', 0, -90); box(30, 40, 'metal', 20, -130); box(30, 40, 'metal', 120, -130);
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'warn') : 'rgba(255,120,90,0.9)';
        ctx.fillRect(px(x + 70), px(y - 70), 30, 10);
        break;
      case 'silo':
        box(90, 230, 'metal', 0, -230);
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x), px(y - 224 + i * 36), 90, 4);
        ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(px(x + 20), px(y - 250), 50, 22);
        break;
      case 'gantry_crane':
        box(16, 200, 'metal', 0, -200); box(16, 200, 'metal', 150, -200);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x - 20), px(y - 208), 210, 14);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 80), px(y - 194), 4, 50);
        box(40, 22, 'metal', 62, -144);
        break;
      case 'evac_blimp':
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'paint') : 'rgba(240,235,210,0.9)';
        for (let i = -60; i <= 60; i += 4) { const hh = Math.round(34 * Math.sqrt(1 - (i / 60) * (i / 60))); ctx.fillRect(px(x + i), px(y - 250 - hh), 4, hh * 2); }
        ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x - 30), px(y - 258), 60, 16);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x - 4), px(y - 216), 8, 40);
        if (p.tod !== 'day') { ctx.fillStyle = 'rgba(255,230,150,0.18)'; ctx.fillRect(px(x - 80), px(y - 300), 160, 120); }
        break;
      case 'extraction_gate':
        box(240, 150, 'concrete', 0, -150);
        ctx.fillStyle = pal(p, 'dark'); ctx.fillRect(px(x + 60), px(y - 120), 120, 120);
        ctx.fillStyle = pal(p, 'warn');
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x + 66 + i * 20), px(y - 116), 10, 112);
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'paintDim') : 'rgba(160,255,180,0.85)';
        ctx.fillRect(px(x + 90), px(y - 168), 60, 14);
        break;
      case 'stacked_cars':
        box(150, 56, 'metal', 0, -56); box(140, 52, 'metal', 20, -108); box(130, 50, 'metal', 8, -158);
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 20), px(y - 40), 30, 14);
        break;
      case 'roof_access_ramp':
        ctx.fillStyle = pal(p, 'concreteLo');
        for (let i = 0; i < 12; i++) ctx.fillRect(px(x + i * 14), px(y - 12 - i * 11), 14, 12 + i * 11);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - 150), 170, 3);
        break;
      case 'shutter_row':
        for (let i = 0; i < 3; i++) {
          box(70, 86, 'metal', i * 76, -86);
          ctx.fillStyle = pal(p, 'metalLo');
          for (let j = 0; j < 9; j++) ctx.fillRect(px(x + i * 76 + 4), px(y - 82 + j * 9), 62, 3);
        }
        break;
      case 'billboard':
        box(14, 130, 'metal', 10, -130); box(14, 130, 'metal', 150, -130);
        box(190, 84, 'metal', 0, -214);
        ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + 6), px(y - 208), 178, 72);
        ctx.fillStyle = pal(p, 'paintDim'); ctx.fillRect(px(x + 20), px(y - 190), 120, 10); ctx.fillRect(px(x + 20), px(y - 170), 80, 8);
        break;
      case 'derailed_tram':
        ctx.save(); ctx.translate(px(x + 90), px(y)); ctx.rotate(-0.16);
        box(220, 76, 'metal', -110, -76);
        ctx.fillStyle = pal(p, 'glassDark'); for (let i = 0; i < 5; i++) ctx.fillRect(px(x - 96 + i * 42), px(y - 66), 32, 26);
        ctx.restore();
        ctx.fillStyle = pal(p, 'dust' in p ? p.dust : BASE.woodLo); ctx.fillRect(px(x + 30), px(y - 8), 150, 8);
        break;
      case 'broken_catenary':
        box(16, 180, 'concrete', 0, -180);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x - 30), px(y - 182), 90, 5);
        ctx.fillStyle = pal(p, 'line');
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + 60 + i * 18), px(y - 176 + i * 9), 2, 22);
        break;
      case 'bus_hay':
        box(240, 92, 'metal', 0, -92); box(230, 88, 'metal', 30, -180);
        ctx.fillStyle = pal(p, 'glassDark');
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x + 16 + i * 38), px(y - 76), 28, 30);
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x + 46 + i * 36), px(y - 168), 26, 28);
        break;
      case 'service_pit':
        box(200, 14, 'concrete', 0, -14);
        ctx.fillStyle = pal(p, 'dark'); ctx.fillRect(px(x + 30), px(y - 60), 140, 46);
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 7; i++) ctx.fillRect(px(x + 34 + i * 20), px(y - 58), 3, 42);
        break;
      case 'stranded_tram':
        box(230, 82, 'metal', 0, -82); box(210, 20, 'metal', 10, -102);
        ctx.fillStyle = pal(p, 'glassDark');
        for (let i = 0; i < 6; i++) ctx.fillRect(px(x + 14 + i * 35), px(y - 66), 26, 30);
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 20), px(y - 10), 26, 10); ctx.fillRect(px(x + 180), px(y - 10), 26, 10);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 110), px(y - 150), 4, 50);
        ctx.fillStyle = pal(p, 'grassLo'); ctx.fillRect(px(x + 40), px(y - 88), 22, 8);
        break;
      case 'tilted_catenary':
        ctx.save(); ctx.translate(px(x + 10), px(y)); ctx.rotate(0.22);
        box(14, 160, 'concrete', -7, -160); ctx.restore();
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x - 30), px(y - 150), 150, 4);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x - 20 + i * 22), px(y - 146 + i * 4), 2, 18); }
        break;
      case 'broken_fountain':
        box(150, 34, 'granite', 0, -34); box(96, 22, 'granite', 27, -56);
        ctx.fillStyle = 'rgba(90,130,150,0.45)'; ctx.fillRect(px(x + 8), px(y - 30), 134, 8);
        ctx.fillStyle = pal(p, 'graniteLo'); ctx.fillRect(px(x + 62), px(y - 96), 14, 40);
        ctx.fillStyle = pal(p, 'graniteHi'); ctx.fillRect(px(x + 40), px(y - 104), 60, 10);
        drawGrowth(p, ctx, x, y - 20, 150, 18, lm.x, true);
        break;
      case 'big_dead_tree':
        ctx.fillStyle = pal(p, 'dirtLo'); ctx.fillRect(px(x + 30), px(y - 210), 22, 210);
        ctx.fillStyle = pal(p, 'woodLo');
        for (let i = 0; i < 6; i++) {
          const bx = x + 41, by = y - 90 - i * 24, dirn = i % 2 ? 1 : -1;
          ctx.fillRect(px(bx), px(by), dirn * (34 + i * 6), 5);
          ctx.fillRect(px(bx + dirn * (30 + i * 6)), px(by - 18), 4, 22);
        }
        break;
      case 'tower_crane':
        box(20, 250, 'metal', 20, -250); box(20, 250, 'metal', 60, -250);
        for (let i = 0; i < 9; i++) { ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 20), px(y - 30 - i * 26), 60, 4); }
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x - 60), px(y - 262), 260, 12);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 150), px(y - 250), 4, 60); box(34, 20, 'metal', 140, -190);
        break;
      case 'mixer_rig':
        box(120, 90, 'metal', 0, -90); box(70, 60, 'metal', 130, -60);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 12), px(y - 84), 96, 22);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + 130), px(y - 120), 60, 8);
        ctx.fillStyle = pal(p, 'line'); for (let i = 0; i < 3; i++) ctx.fillRect(px(x + 16 + i * 44), px(y - 14), 22, 14);
        break;
      case 'atrium_skylight':
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x - 20), px(y - 210), 260, 8);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = pal(p, 'glass'); ctx.fillRect(px(x - 14 + i * 32), px(y - 206 - Math.sin(i / 7 * Math.PI) * 34), 28, 34);
          ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x - 14 + i * 32), px(y - 206 - Math.sin(i / 7 * Math.PI) * 34), 28, 3);
        }
        ctx.fillStyle = 'rgba(200,230,255,0.10)';
        for (let i = 0; i < 10; i++) ctx.fillRect(px(x + i * 22), px(y - 170 + i * 12), 22, 12);
        break;
      case 'collapsed_escalator':
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 14; i++) { const yy = y - 150 + i * 11; ctx.fillRect(px(x + i * 12), px(yy), 13, 11); }
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - 158), 168, 5);
        ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x + 40), px(y - 96), 60, 6);
        break;
      case 'cargo_crane':
        box(22, 230, 'metal', 0, -230); box(22, 230, 'metal', 120, -230);
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x - 40), px(y - 240), 250, 14);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 170), px(y - 226), 4, 70);
        box(46, 26, 'metal', 150, -156);
        ctx.fillStyle = pal(p, 'container' in p ? p.container : BASE.metal); ctx.fillRect(px(x + 152), px(y - 130), 42, 22);
        break;
      case 'container_wall':
        for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - (r === 2 ? 1 : 0); i++) {
          const cc = [BASE.danger, BASE.warn, BASE.granite, BASE.metal][(r * 3 + i) % 4];
          ctx.fillStyle = shade(cc, p.tod); ctx.fillRect(px(x + i * 92), px(y - 34 - r * 34), 88, 32);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (let k = 0; k < 8; k++) ctx.fillRect(px(x + i * 92 + 4 + k * 10), px(y - 32 - r * 34), 3, 28);
        }
        break;
      case 'flood_wall':
        for (let i = 0; i < 7; i++) { ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(px(x + i * 24), px(y - 70), 22, 70); }
        ctx.fillStyle = pal(p, 'concreteHi'); ctx.fillRect(px(x - 4), px(y - 76), 176, 8);
        ctx.fillStyle = 'rgba(70,110,130,0.55)'; ctx.fillRect(px(x - 30), px(y - 34), 230, 34);
        break;
      case 'roof_island':
        box(150, 26, 'brick', 0, -26);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 20), px(y - 52), 18, 26); ctx.fillRect(px(x + 96), px(y - 46), 14, 20);
        ctx.fillStyle = 'rgba(70,110,130,0.5)'; ctx.fillRect(px(x - 26), px(y - 6), 200, 8);
        ctx.fillStyle = pal(p, 'grassLo'); ctx.fillRect(px(x + 58), px(y - 34), 22, 8);
        break;
      case 'ramp_gate':
        ctx.fillStyle = pal(p, 'concreteLo');
        for (let i = 0; i < 10; i++) ctx.fillRect(px(x + i * 16), px(y - 8 - i * 9), 16, 10 + i * 9);
        box(190, 12, 'metal', 0, -100); box(14, 100, 'metal', 0, -100); box(14, 100, 'metal', 176, -100);
        ctx.fillStyle = pal(p, 'warn'); for (let i = 0; i < 6; i++) ctx.fillRect(px(x + 24 + i * 26), px(y - 96), 14, 8);
        break;
      case 'stairwell_cage':
        box(96, 150, 'concrete', 0, -150);
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 14), px(y - 140), 68, 140);
        ctx.fillStyle = pal(p, 'concreteLo');
        for (let i = 0; i < 8; i++) ctx.fillRect(px(x + 16 + i * 4), px(y - 12 - i * 16), 60 - i * 6, 5);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 10), px(y - 152), 80, 5);
        break;
      case 'glass_bridge':
        box(240, 12, 'metal', 0, -120);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = pal(p, 'glass'); ctx.fillRect(px(x + 8 + i * 40), px(y - 190), 34, 70); }
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - 194), 240, 5);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 6), px(y - 120), 10, 120); ctx.fillRect(px(x + 224), px(y - 120), 10, 120);
        break;
      case 'snapped_span':
        box(110, 14, 'metal', 0, -130);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + 4), px(y - 130), 10, 130);
        box(80, 14, 'metal', 150, -70);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 112), px(y - 118), 36, 4);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = pal(p, 'concreteLo'); ctx.fillRect(px(x + 118 + i * 9), px(y - 100 + i * 14), 8, 8); }
        break;
      case 'humvee_checkpoint':
        box(150, 40, 'metal', 90, -40);
        ctx.fillStyle = pal(p, 'sandbag' in p ? p.sandbag : BASE.pavement);
        for (let i = 0; i < 5; i++) { ctx.fillStyle = pal(p, 'pavementHi'); ctx.fillRect(px(x + i * 22), px(y - 24 - (i % 2) * 12), 20, 14); }
        box(120, 10, 'metal', 0, -70); box(10, 70, 'metal', 0, -70); box(10, 70, 'metal', 110, -70);
        ctx.fillStyle = pal(p, 'warn'); for (let i = 0; i < 4; i++) ctx.fillRect(px(x + 14 + i * 26), px(y - 66), 18, 8);
        break;
      case 'watchtower2':
        box(16, 130, 'metal', 0, -130); box(16, 130, 'metal', 84, -130);
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + 16), px(y - 26 - i * 24), 68, 4);
        box(120, 30, 'metal', -14, -160); box(120, 8, 'concrete', -14, -190);
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'warn') : 'rgba(255,150,110,0.9)'; ctx.fillRect(px(x + 30), px(y - 156), 50, 20);
        break;
      default:
        box(120, 90, 'concrete', 0, -90);
    }
  }

  // ---------- 道具：一个 kind 一个画法，同类共用底座 ----------
  function drawProp(p, ctx, pr, x, y, M) {
    const k = pr.kind, seed = pr.seed || 1;
    const W = pr.w || 40, H = pr.h || 30;
    const R = (w, h, mat, ox, oy) => matBody(p, ctx, mat, x + (ox || 0), y - h + (oy || 0), w, h, seed + w);
    switch (k) {
      case 'crate': case 'militarycrate': case 'pallet': case 'medkitcrate': case 'ticketmachine':
        R(W, H, k === 'medkitcrate' ? 'tile' : 'wood');
        ctx.fillStyle = pal(p, 'woodLo'); ctx.fillRect(px(x + 2), px(y - H / 2), px(W - 4), 2);
        if (k === 'medkitcrate') { ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x + W / 2 - 5), px(y - H * 0.7), 10, 4); ctx.fillRect(px(x + W / 2 - 2), px(y - H * 0.85), 4, 12); }
        break;
      case 'barrel': case 'drum':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'metalRust'); ctx.fillRect(px(x + 2), px(y - H * 0.7), px(W - 4), 4);
        break;
      case 'cone':
        ctx.fillStyle = pal(p, 'warn'); for (let i = 0; i < 5; i++) ctx.fillRect(px(x + i), px(y - H + i * 5), Math.max(2, W - i * 2), 5);
        ctx.fillStyle = pal(p, 'paint'); ctx.fillRect(px(x + 2), px(y - H * 0.55), px(W - 4), 3);
        break;
      case 'sandbag': case 'sandbagwall': case 'tirepile': case 'barricade':
        for (let i = 0; i < Math.max(2, W / 22); i++) {
          R(22, 13, 'concrete', i * 21, -(i % 2) * 12 - (i > 3 ? 12 : 0));
        }
        if (k === 'barricade') { ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x), px(y - H), px(W), 6); }
        break;
      case 'roadblock': case 'barrier': case 'fencepanel': case 'shutter_row':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'warn');
        for (let i = 0; i < W; i += 16) ctx.fillRect(px(x + i), px(y - H + 4), 8, px(H - 8));
        break;
      case 'carwreck': case 'truck': case 'forklift': case 'tramcar': case 'busframe': {
        R(W, H * 0.7, 'metal'); R(W * 0.62, H * 0.34, 'metal', W * 0.18, -H * 0.7);
        ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + W * 0.24), px(y - H * 0.98), px(W * 0.5), px(H * 0.26));
        ctx.fillStyle = pal(p, 'line');
        ctx.fillRect(px(x + 6), px(y - 10), 14, 10); ctx.fillRect(px(x + W - 20), px(y - 10), 14, 10);
        ctx.fillStyle = pal(p, 'metalRust'); ctx.fillRect(px(x + W * 0.7), px(y - H * 0.6), px(W * 0.16), px(H * 0.2));
        break;
      }
      case 'shelf': case 'rack': case 'displayrack': case 'toolchest': case 'workbench': case 'medicalcart': {
        R(W, H, 'metal');
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 1; i < 4; i++) ctx.fillRect(px(x + 2), px(y - H * i / 4), px(W - 4), 3);
        ctx.fillStyle = pal(p, 'wood');
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (h2(seed + i * 7 + j, 2) > 0.4)
          ctx.fillRect(px(x + 5 + j * (W / 3)), px(y - H * (i + 1) / 4 + 3), px(W / 4 - 4), px(H / 4 - 6));
        break;
      }
      case 'vending': case 'adboard': case 'warningboard': case 'parkingsign': case 'sign':
        R(W, H, 'metal');
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'glass') : 'rgba(120,220,255,0.75)';
        ctx.fillRect(px(x + 4), px(y - H + 6), px(W - 8), px(H * 0.55));
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 4), px(y - H + 6), px(W - 8), 2);
        break;
      case 'cart': case 'shoppingcart': case 'stretcher': case 'jackstand':
        R(W, H * 0.6, 'metal'); ctx.fillStyle = pal(p, 'line');
        ctx.fillRect(px(x + 4), px(y - 4), 4, 4); ctx.fillRect(px(x + W - 8), px(y - 4), 4, 4);
        break;
      case 'trashbag': case 'luggage': case 'luggageset': case 'fallrock': case 'debrispile': case 'oilpan':
        ctx.fillStyle = k === 'trashbag' ? pal(p, 'dark') : pal(p, 'concreteLo');
        ctx.fillRect(px(x), px(y - H * 0.8), px(W), px(H * 0.8));
        ctx.fillStyle = k === 'trashbag' ? pal(p, 'line') : pal(p, 'concreteHi');
        ctx.fillRect(px(x + 2), px(y - H * 0.8), px(W - 4), 3);
        break;
      case 'oilspill': case 'manhole': case 'helipadmark': case 'rail': case 'sleeper':
        ctx.fillStyle = k === 'helipadmark' ? pal(p, 'paintDim') : k === 'manhole' ? pal(p, 'metalLo') : pal(p, 'line');
        ctx.fillRect(px(x), px(y - 4), px(W), k === 'rail' ? 3 : 6);
        if (k === 'helipadmark') { ctx.fillStyle = pal(p, 'paint'); ctx.fillRect(px(x + W / 2 - 16), px(y - 6), 8, 8); ctx.fillRect(px(x + W / 2 + 8), px(y - 6), 8, 8); }
        break;
      case 'chairset': case 'wheelchair': case 'ivstand': case 'valve': case 'flagpole': case 'antenna':
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + W / 2 - 1), px(y - H), 3, px(H));
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x), px(y - H * 0.55), px(W), 4);
        if (k === 'flagpole') { ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x + 2), px(y - H), 18, 10); }
        break;
      case 'bed': case 'stretcherbed':
        R(W, H * 0.55, 'metal', 0, -6);
        ctx.fillStyle = pal(p, 'paint'); ctx.fillRect(px(x + 2), px(y - H * 0.62), px(W - 4), px(H * 0.3));
        ctx.fillStyle = pal(p, 'glassHi'); ctx.fillRect(px(x + 4), px(y - H * 0.66), 16, 8);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + W - 6), px(y - H - 18), 3, 24);
        break;
      case 'curtainrail':
        R(W, 5, 'metal', 0, -H); ctx.fillStyle = pal(p, 'paintDim');
        for (let i = 0; i < 4; i++) ctx.fillRect(px(x + 6 + i * (W / 4)), px(y - H + 5), px(W / 6), px(H * 0.7));
        break;
      case 'biohazardbin':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + 4), px(y - H * 0.7), px(W - 8), 6);
        break;
      case 'quarantinegate':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x), px(y - H), px(W), 5);
        ctx.fillStyle = pal(p, 'warn'); for (let i = 0; i < 5; i++) ctx.fillRect(px(x + 6 + i * (W / 5)), px(y - H + 8), 8, px(H - 14));
        break;
      case 'acunit': case 'pump': case 'maintank': case 'generator':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 3), px(y - H + 4), px(W * 0.6), px(H - 8));
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - H), px(W), 2);
        break;
      case 'watertank': case 'container':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'metalRust'); ctx.fillRect(px(x + 2), px(y - H * 0.4), px(W - 4), px(H * 0.18));
        break;
      case 'ventduct': case 'skylight': case 'solarpanel':
        R(W, H, 'metal'); if (k === 'solarpanel') { ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + 2), px(y - H + 2), px(W - 4), px(H - 4)); }
        break;
      case 'fireladder': case 'conveyor': case 'stairrail':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < W; i += 12) ctx.fillRect(px(x + i), px(y - H), 2, px(H));
        break;
      case 'pottedplant': case 'flowerpot':
        R(W, H * 0.45, 'brick', 0, 0); ctx.fillStyle = pal(p, 'grass');
        ctx.fillRect(px(x + 2), px(y - H), px(W - 4), px(H * 0.6));
        ctx.fillStyle = pal(p, 'grassHi'); ctx.fillRect(px(x + W / 2 - 2), px(y - H - 4), 4, 8);
        break;
      case 'girder': case 'rebar': case 'concreteblock':
        R(W, H, 'concrete'); ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < 4; i++) ctx.fillRect(px(x + 4 + i * (W / 4)), px(y - H - 6), 2, 10);
        break;
      case 'turnstile':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + 2), px(y - H + 2), px(W - 4), 4);
        break;
      case 'bench': case 'sofa':
        R(W, H * 0.6, 'wood'); R(W, H * 0.5, 'wood', 0, -H * 0.6);
        break;
      case 'table':
        R(W, 6, 'wood', 0, -H * 0.6); ctx.fillStyle = pal(p, 'woodLo');
        ctx.fillRect(px(x + 3), px(y - H * 0.6), 4, px(H * 0.6)); ctx.fillRect(px(x + W - 7), px(y - H * 0.6), 4, px(H * 0.6));
        break;
      case 'pipebundle': case 'cablespool': case 'chainhoist': case 'hoist':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'metalHi');
        for (let i = 0; i < 3; i++) ctx.fillRect(px(x), px(y - H + i * (H / 3) + 2), px(W), 3);
        break;
      case 'searchlight': case 'spotlight':
        R(W * 0.5, H * 0.4, 'metal', W * 0.25, -H); ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + W / 2 - 2), px(y - H * 0.6), 4, px(H * 0.6));
        if (p.tod !== 'day') {
          ctx.fillStyle = 'rgba(255,240,190,0.14)';
          for (let i = 0; i < 10; i++) ctx.fillRect(px(x + W / 2 - 20 + i * 2), px(y - H - 120 + i * 8), 44 - i * 2, 8);
        }
        break;
      case 'steamvent':
        ctx.fillStyle = 'rgba(220,225,230,0.30)';
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + i), px(y - H - i * 10), px(W - i * 2), 8);
        break;
      case 'bicycle':
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x), px(y - 14), 14, 14); ctx.fillRect(px(x + W - 14), px(y - 14), 14, 14);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 8), px(y - H + 4), px(W - 16), 3);
        break;
      case 'marketstall': case 'awning':
        R(W, H * 0.7, 'wood'); ctx.fillStyle = pal(p, 'danger');
        for (let i = 0; i < W; i += 14) ctx.fillRect(px(x + i), px(y - H), 7, 8);
        break;
      case 'tree': {
        ctx.fillStyle = pal(p, 'dirtLo'); ctx.fillRect(px(x + W / 2 - 4), px(y - H * 0.62), 9, px(H * 0.62));
        ctx.fillStyle = pal(p, 'woodLo'); ctx.fillRect(px(x + W / 2 - 14), px(y - H * 0.5), 12, 4);
        ctx.fillStyle = pal(p, 'grassLo');
        for (let i = 0; i < 7; i++) ctx.fillRect(px(x + 4 + h2(seed, i) * (W - 18)), px(y - H + h2(seed, i + 20) * H * 0.4), 17, 14);
        ctx.fillStyle = pal(p, 'grass');
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + 10 + h2(seed, i + 40) * (W - 26)), px(y - H + 5 + h2(seed, i + 60) * H * 0.24), 13, 10);
        break;
      }
      case 'fountain':
        R(W, H * 0.42, 'granite'); R(W * 0.6, H * 0.3, 'granite', W * 0.2, -H * 0.42);
        ctx.fillStyle = 'rgba(90,130,150,0.5)'; ctx.fillRect(px(x + 4), px(y - H * 0.4), px(W - 8), 6);
        ctx.fillStyle = pal(p, 'graniteHi'); ctx.fillRect(px(x + W / 2 - 3), px(y - H), 6, px(H * 0.5));
        break;
      case 'playground':
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + 6), px(y - H), 5, px(H)); ctx.fillRect(px(x + W - 11), px(y - H), 5, px(H));
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 6), px(y - H + 8), px(W - 10), 4);
        ctx.fillStyle = pal(p, 'danger');
        for (let i = 0; i < 4; i++) ctx.fillRect(px(x + 12 + i * (W - 26) / 4), px(y - H + 12), 3, px(H * 0.45));
        break;
      case 'lamppost2':
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + W / 2 - 2), px(y - H), 5, px(H));
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - H), px(W), 5);
        if (p.tod !== 'day') { ctx.fillStyle = 'rgba(255,220,150,0.55)'; ctx.fillRect(px(x + 2), px(y - H + 5), px(W - 4), 3); }
        break;
      case 'scaffold':
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i <= 2; i++) ctx.fillRect(px(x + i * (W / 2) - 2), px(y - H), 4, px(H));
        ctx.fillStyle = pal(p, 'metalHi');
        for (let j = 0; j < 4; j++) ctx.fillRect(px(x), px(y - H + j * (H / 4)), px(W), 3);
        ctx.fillStyle = pal(p, 'wood'); ctx.fillRect(px(x), px(y - H * 0.55), px(W), 5);
        break;
      case 'cementmixer':
        R(W * 0.5, H * 0.5, 'metal', 0, -H * 0.55); R(W * 0.5, H * 0.45, 'metal', W * 0.5, -H * 0.45);
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x + 6), px(y - H * 0.92), px(W * 0.36), px(H * 0.3));
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 8), px(y - 12), 16, 12); ctx.fillRect(px(x + W - 26), px(y - 12), 16, 12);
        break;
      case 'cautiontape':
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x), px(y - H), 3, px(H)); ctx.fillRect(px(x + W - 3), px(y - H), 3, px(H));
        for (let i = 0; i < W - 6; i += 12) {
          ctx.fillStyle = (i / 12) % 2 === 0 ? pal(p, 'warn') : pal(p, 'line');
          ctx.fillRect(px(x + 3 + i), px(y - H + 4), 12, 7);
        }
        break;
      case 'escalator':
        ctx.fillStyle = pal(p, 'metalLo');
        for (let i = 0; i < W; i += 8) { const yy = y - H * (1 - i / W); ctx.fillRect(px(x + i), px(yy), 9, px(H * i / W + 6)); }
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - H - 2), px(W), 4);
        ctx.fillStyle = pal(p, 'glass'); ctx.fillRect(px(x), px(y - H - 16), px(W), 13);
        break;
      case 'kiosk':
        R(W, H * 0.72, 'wood'); R(W + 10, 10, 'metal', -5, -H);
        ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + 8), px(y - H * 0.62), px(W - 16), px(H * 0.3));
        ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x + 6), px(y - H + 12), px(W - 12), 5);
        break;
      case 'planter':
        R(W, H * 0.6, 'granite'); ctx.fillStyle = pal(p, 'grass'); ctx.fillRect(px(x + 3), px(y - H), px(W - 6), px(H * 0.45));
        break;
      case 'bollard':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'warn'); ctx.fillRect(px(x), px(y - H + 4), px(W), 4);
        break;
      case 'cargoNet':
        R(W, H * 0.7, 'wood'); ctx.fillStyle = pal(p, 'line');
        for (let i = 0; i < W; i += 9) ctx.fillRect(px(x + i), px(y - H * 0.7), 1, px(H * 0.7));
        for (let j = 0; j < H * 0.7; j += 9) ctx.fillRect(px(x), px(y - H * 0.7 + j), px(W), 1);
        break;
      case 'buoy':
        ctx.fillStyle = pal(p, 'danger'); ctx.fillRect(px(x), px(y - H * 0.6), px(W), px(H * 0.6));
        ctx.fillStyle = pal(p, 'paint'); ctx.fillRect(px(x), px(y - H * 0.4), px(W), 5);
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x + W / 2 - 2), px(y - H), 4, px(H * 0.4));
        break;
      case 'halfSubmergedCar':
        ctx.fillStyle = 'rgba(60,90,105,0.55)'; ctx.fillRect(px(x - 8), px(y - H * 0.55), px(W + 16), px(H * 0.55));
        R(W, H * 0.5, 'metal', 0, -H * 0.5); R(W * 0.5, H * 0.3, 'metal', W * 0.25, -H * 0.8);
        ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + W * 0.3), px(y - H * 0.78), px(W * 0.4), px(H * 0.24));
        break;
      case 'glassPanel':
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x), px(y - H), 3, px(H)); ctx.fillRect(px(x + W - 3), px(y - H), 3, px(H));
        matBody(p, ctx, 'glass', x + 3, y - H + 4, W - 6, H - 8, seed, { noEdge: true });
        break;
      case 'railing2':
        ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x), px(y - H), px(W), 3);
        for (let i = 0; i < W; i += 14) ctx.fillRect(px(x + i + 3), px(y - H), 3, px(H));
        break;
      case 'razorwire':
        ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x), px(y - H), 4, px(H)); ctx.fillRect(px(x + W - 4), px(y - H), 4, px(H));
        ctx.fillStyle = pal(p, 'metalHi');
        for (let i = 0; i < 5; i++) { const cx = x + 6 + i * (W - 12) / 5; pxCircle(ctx, cx, y - H * 0.62, 7); pxCircle(ctx, cx + 9, y - H * 0.34, 6); }
        break;
      case 'humvee':
        R(W, H * 0.5, 'metal', 0, -H * 0.5); R(W * 0.42, H * 0.34, 'metal', W * 0.2, -H * 0.84);
        ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + W * 0.24), px(y - H * 0.8), px(W * 0.32), px(H * 0.24));
        ctx.fillStyle = pal(p, 'line'); ctx.fillRect(px(x + 10), px(y - 12), 20, 12); ctx.fillRect(px(x + W - 30), px(y - 12), 20, 12);
        ctx.fillStyle = pal(p, 'grassLo'); ctx.fillRect(px(x + W * 0.62), px(y - H * 0.62), 12, 5);
        break;
      case 'sentrybox':
        R(W, H, 'metal'); ctx.fillStyle = pal(p, 'glassDark'); ctx.fillRect(px(x + 6), px(y - H + 8), px(W - 12), 14);
        ctx.fillStyle = p.tod === 'day' ? pal(p, 'warn') : 'rgba(255,120,90,0.85)'; ctx.fillRect(px(x + 4), px(y - H - 6), px(W - 8), 6);
        break;
      default:
        R(W, H, 'concrete');
    }
  }

  function drawDecal(p, ctx, d, cam) {
    const x = d.x - cam.x, y = d.y - cam.y;
    switch (d.kind) {
      case 'crack': drawCrack(p, ctx, x, y - 3, d.w, d.h + 6, d.seed); break;
      case 'stain': drawStain(p, ctx, x, y - d.h, d.w, d.h, d.seed, 'rgba(40,44,50,0.5)'); break;
      case 'rubble':
        ctx.fillStyle = pal(p, 'concreteLo');
        for (let i = 0; i < 5; i++) ctx.fillRect(px(x + h2(d.seed, i) * d.w), px(y - 3 - h2(d.seed, i + 9) * 4), 4, 3);
        break;
      case 'growth': drawGrowth(p, ctx, x, y - d.h, d.w, d.h, d.seed, true); break;
      case 'slime': drawStain(p, ctx, x, y - d.h, d.w, d.h, d.seed, 'rgba(110,160,60,0.45)'); break;
      default: break;
    }
  }

  function drawNear(p, ctx, M, cam, W) {
    const x0 = cam.x - 120, x1 = cam.x + W + 120;
    for (const n of M.near) {
      if (n.x + n.w < x0 || n.x > x1) continue;
      const x = n.x - cam.x * 1.12 + 30, y = n.y - cam.y * 1.06;
      ctx.fillStyle = pal(p, 'dark');
      switch (n.kind) {
        case 'fence':
          for (let i = 0; i < n.w; i += 12) ctx.fillRect(px(x + i), px(y - n.h), 3, px(n.h));
          ctx.fillRect(px(x), px(y - n.h), px(n.w), 3); ctx.fillRect(px(x), px(y - n.h * 0.5), px(n.w), 3);
          break;
        case 'pole':
          ctx.fillRect(px(x), px(y - n.h), 5, px(n.h));
          ctx.fillRect(px(x - 12), px(y - n.h), 30, 4);
          break;
        case 'cable':
          ctx.fillRect(px(x), px(y - n.h), 4, px(n.h)); ctx.fillRect(px(x + n.w - 4), px(y - n.h), 4, px(n.h));
          ctx.fillRect(px(x), px(y - n.h - 3), px(n.w), 3);
          for (let i = 0; i < n.w; i += 3) { const sag = Math.sin(i / n.w * Math.PI) * 14; ctx.fillRect(px(x + i), px(y - n.h + sag), 3, 1); }
          break;
        case 'weed':
          drawGrowth(p, ctx, x, y - n.h * 0.5, n.w, n.h * 0.5, n.seed, false);
          break;
        default:
          ctx.fillRect(px(x), px(y - n.h * 0.5), px(n.w * 0.7), px(n.h * 0.5));
      }
    }
  }

  function drawLights(p, ctx, M, cam, W, H, t) {
    if (p.tod === 'day') return;
    const x0 = cam.x - 260, x1 = cam.x + W + 260;
    for (const L of M.lights) {
      if (L.x < x0 || L.x > x1) continue;
      const fl = L.flicker ? (0.62 + 0.38 * Math.abs(Math.sin(t * (3 + L.flicker * 5) + L.x))) : 1;
      const a = (p.tod === 'night' ? 0.075 : 0.045) * fl;
      const x = L.x - cam.x, y = L.y - cam.y;
      // 光必须有个「来源」：先画灯杆与灯头，再画光晕，否则就是一团团浮在空中的圆盘
      const gy = M.groundAt(L.x) - cam.y;
      ctx.fillStyle = pal(p, 'metalLo'); ctx.fillRect(px(x - 2), px(y + 6), 4, px(Math.max(0, gy - y - 6)));
      ctx.fillStyle = pal(p, 'metal'); ctx.fillRect(px(x - 2), px(y + 6), 1, px(Math.max(0, gy - y - 6)));
      ctx.fillStyle = pal(p, 'metalHi'); ctx.fillRect(px(x - 7), px(y - 2), 14, 6);
      ctx.fillStyle = 'rgba(' + L.hue + ',' + Math.min(0.95, a * 12).toFixed(3) + ')';
      ctx.fillRect(px(x - 5), px(y + 2), 10, 4);
      const rr = Math.round(L.r * 0.22);
      for (let i = 4; i >= 1; i--) {
        ctx.fillStyle = 'rgba(' + L.hue + ',' + (a * i).toFixed(3) + ')';
        pxCircle(ctx, x, y, Math.round(rr * i / 4));
      }
      ctx.fillStyle = 'rgba(' + L.hue + ',' + Math.min(0.9, a * 9).toFixed(3) + ')';
      pxCircle(ctx, x, y, 3);
      if (L.kind === 'floodlight') {
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = 'rgba(' + L.hue + ',' + (a * 0.5 * (1 - i / 16)).toFixed(3) + ')';
          ctx.fillRect(px(x - 8 - i * 4), px(y + i * 11), px(16 + i * 8), 11);
        }
      }
    }
  }

  // 整体压色 + 暗角：分带，不用平滑渐变
  function drawGrade(p, ctx, W, H) {
    ctx.fillStyle = TOD[p.tod].grade;
    for (let i = 0; i < 8; i++) ctx.fillRect(0, px(i * H / 8), W, px(H / 8));
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 4; i++) { ctx.fillRect(0, px(i * 6), W, 6); ctx.fillRect(0, px(H - (i + 1) * 6), W, 6); }
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let i = 0; i < 4; i++) { ctx.fillRect(px(i * 7), 0, 7, H); ctx.fillRect(px(W - (i + 1) * 7), 0, 7, H); }
  }

  // 区段变体的「氛围层」：绿陷 / 灰烬 / 浓雾。
  // 用逐列矩形而不是 ctx.clip()：验证闸门里的 mock ctx 只实现了 fillRect 一族，
  // 引入 clip 会让无头渲染冒烟测试直接抛错，而逐列矩形本来就是像素风的画法。
  function drawMood(p, ctx, M, cam, W, H, t) {
    const x0 = cam.x - 60, x1 = cam.x + W + 60;
    for (const s of M.segments) {
      if (s.x1 < x0 || s.x0 > x1) continue;
      if (!s.variant) continue;
      const a = Math.max(s.x0, x0), b = Math.min(s.x1, x1);
      for (let x = a; x < b; x += 16) {
        const gy = M.groundAt(x) - cam.y, X = px(x - cam.x);
        if (s.variant === 1) {                       // 绿陷：低处绿雾 + 路边蔓生
          ctx.fillStyle = 'rgba(70,120,60,0.055)'; ctx.fillRect(X, px(gy - 90), 17, 90);
          ctx.fillStyle = 'rgba(60,110,55,0.04)'; ctx.fillRect(X, 0, 17, px(gy - 90));
          if ((x | 0) % 64 === 0) drawGrowth(p, ctx, x - cam.x, gy - 22, 26, 22, (x + s.vSeed) >> 3, true);
        } else if (s.variant === 2) {                 // 灰烬：灰黑底 + 飘灰 + 两处烟柱
          ctx.fillStyle = 'rgba(30,22,20,0.10)'; ctx.fillRect(X, px(gy - 150), 17, 150);
          ctx.fillStyle = 'rgba(40,34,32,0.06)'; ctx.fillRect(X, 0, 17, px(gy - 150));
        } else {                                      // 浓雾：贴地三层雾带
          ctx.fillStyle = 'rgba(190,205,225,0.07)'; ctx.fillRect(X, px(gy - 46), 17, 46);
          ctx.fillStyle = 'rgba(180,196,218,0.05)'; ctx.fillRect(X, px(gy - 96), 17, 50);
          ctx.fillStyle = 'rgba(170,188,212,0.03)'; ctx.fillRect(X, px(gy - 150), 17, 54);
        }
      }
      if (s.variant === 2) {
        for (let i = 0; i < 2; i++) {
          const sx = s.x0 + (i + 0.5) * (s.w / 2) + h2(s.vSeed, i) * 120;
          if (sx < x0 - 40 || sx > x1 + 40) continue;
          const gy = M.groundAt(sx) - cam.y;
          for (let k = 0; k < 9; k++) {
            ctx.fillStyle = 'rgba(60,55,55,' + (0.10 - k * 0.010).toFixed(3) + ')';
            ctx.fillRect(px(sx - cam.x - 6 - k), px(gy - 30 - k * 22), px(20 + k * 3), 22);
          }
        }
        for (let i = 0; i < 26; i++) {
          const ax = s.x0 + h2(s.vSeed, i * 3) * s.w;
          if (ax < x0 || ax > x1) continue;
          const ay = ((h2(s.vSeed, i * 3 + 1) * 1.4 + t * 0.06 * (1 + i % 3)) % 1) * H;
          ctx.fillStyle = 'rgba(210,205,200,0.35)'; ctx.fillRect(px(ax - cam.x), px(ay), 2, 2);
        }
      }
    }
  }

  // ---------- 主渲染 ----------
  function render(ctx, M, cam, o) {
    const opt = o || {};
    const W = opt.w || 960, H = opt.h || 540, t = opt.t || 0;
    const p = PAL[opt.timeOfDay || M.opts.timeOfDay || 'day'];
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    drawSky(p, ctx, M, cam, W, H, t);
    drawFar(p, ctx, M, cam, W, H);
    const x0 = cam.x - 200, x1 = cam.x + W + 200;
    drawGround(p, ctx, M, cam, W, H);
    for (const b of M.structs) { if (b.x + b.w < x0 || b.x > x1) continue; drawFacade(p, ctx, M, b, cam, W, H); }
    for (const r of M.rooms) { if (r.x + r.w < x0 || r.x > x1) continue; drawRoom(p, ctx, r, cam, M); }
    drawUndercroft(p, ctx, M, cam, W);
    for (const br of M.branches) { if (br.x1 + 140 < x0 || br.x0 > x1) continue; drawBranch(p, ctx, br, cam); }
    for (const lm of M.landmarks) { if (lm.x + 320 < x0 || lm.x > x1) continue; drawLandmark(p, ctx, lm, cam, M); }
    for (const d of M.decals) { if (d.x + d.w < x0 || d.x > x1) continue; drawDecal(p, ctx, d, cam); }
    for (const pr of M.props) { if (pr.x + pr.w < x0 || pr.x > x1) continue; drawProp(p, ctx, pr, pr.x - cam.x, pr.y + pr.h - cam.y, M); }
    for (const c of M.checkpoints) {
      if (c.x < x0 || c.x > x1) continue;
      const x = c.x - cam.x, y = c.y - cam.y;
      ctx.fillStyle = 'rgba(120,220,160,0.55)'; ctx.fillRect(px(x), px(y - 96), 4, 96);
      ctx.fillStyle = 'rgba(120,220,160,0.30)'; ctx.fillRect(px(x - 26), px(y - 12), 56, 12);
      ctx.fillStyle = 'rgba(180,255,210,0.8)'; ctx.fillRect(px(x), px(y - 96), 22, 12);
    }
    drawMood(p, ctx, M, cam, W, H, t);
    drawLights(p, ctx, M, cam, W, H, t);
    drawNear(p, ctx, M, cam, W);
    drawGrade(p, ctx, W, H);
    ctx.restore();
  }

  // 整图预览：等比缩到一张离屏画布上（导出 PNG 用）
  function renderFull(canvas, M, scale) {
    const s = scale || 0.18;
    // 按内容裁高：从最高的楼顶到最深的地下路面。整幅世界高里有大半是土，
    // 不裁的话导出图就是一条几乎全黑的带子，看不出任何构图。
    let yTop = 1e9, yBot = -1e9;
    for (const b of M.structs) yTop = Math.min(yTop, b.y - 40);
    for (const br of M.branches) yTop = Math.min(yTop, br.y - 40);
    for (const q of M.prof.y) yBot = Math.max(yBot, q + 90);
    yTop = Math.max(0, Math.min(yTop, M.world.h - 200));
    const band = Math.max(260, yBot - yTop);
    const W = Math.round(M.world.w * s), H = Math.round(band * s);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.scale(s, s);
    render(ctx, M, { x: 0, y: yTop }, { w: W / s, h: band, t: 0, timeOfDay: M.opts.timeOfDay });
    ctx.restore();
    return { w: W, h: H };
  }

  return { render, renderFull, PAL, BASE, shade, matBody };
})();
