// ============ 疾驰列车 · 材质系统（程序化美术 阶段二） ============
// 阶段一给了「骨架」，这一层给「皮」。规则只有三条，但每条都可实测：
//   ① 每种材质有自己的配方（底色 + 纹理走向 + 接缝 + 高光 + 细小缺陷 + 磨损形态），
//      不允许所有平面共用同一种噪点 —— 闸门用「同尺寸样本画出来指令序列必须互不相同」来卡；
//   ② 纹理随表面方向变化：同一个材质，朝上的面（车顶/地板/走道）纹理沿长边、
//      朝外的面（侧墙/端墙）纹理竖向、朝下的面（顶棚）反向打光；
//   ③ 磨损只出现在该出现的地方：门坎、把手、轮罩、边角、经常摸到的立边 ——
//      闸门用「磨损矩形的质心必须落在声明的接触带里」来卡，不靠肉眼说好。
// 全部落笔都是整数矩形、全部裁剪在对象自身矩形内（闸门逐条扫描指令边界）、
// 全部由 seed 决定（不读时间、不用 Math.random）→ 同 seed 逐帧一致，移动时不闪。
const CarMat = (() => {
  const h2 = (seed, i) => { let x = (Math.imul(seed | 0, 2654435761) + Math.imul(i | 0, 40503)) >>> 0; x ^= x >> 13; return ((Math.imul(x, 1274126177)) >>> 0) % 1000 / 1000; };
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb2hex = (r, g, b) => { const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); };
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const dark = (a, t) => rgb2hex(hex2rgb(a)[0] * t, hex2rgb(a)[1] * t, hex2rgb(a)[2] * t);
  // 锈：钢往棕黑偏。掉漆露钢、锈斑都从这条来，不额外要求色板加键
  const rustOf = c => mix(c, '#6b3a1c', 0.62);

  // ---------- 材质配方 ----------
  // grain: 纹理走向（v 竖 / h 横 / d 斜 / plate 防滑菱形 / pleat 褶皱 / weave 织纹 / band 分带 / none）
  // seam : 接缝方向与间距；rivet: 铆钉排；defects: 细小缺陷种类权重；wear: 磨损形态
  const LIB = {
    paint:      { base: 'panel', hi: 'panelHi', lo: 'panelLo', edge: 'panelEdge', grain: 'v', pitch: 17, seam: 'v', seamGap: 96, rivet: 13, gloss: 0.55, defects: ['chip', 'scratch', 'dent'], wear: 'edge' },
    steel:      { base: 'steel', hi: 'steelHi', lo: 'steelLo', edge: 'steelDark', grain: 'h', pitch: 3, seam: 'v', seamGap: 64, rivet: 8, gloss: 0.8, defects: ['scratch', 'rustpits', 'pit'], wear: 'polish' },
    rubber:     { base: 'rubber', hi: 'rubberHi', lo: 'rubberLo', edge: 'line', grain: 'pleat', pitch: 4, seam: 'h', seamGap: 22, rivet: 0, gloss: 0.12, defects: ['crack', 'chip'], wear: 'crack' },
    glass:      { base: 'glassDark', hi: 'glassHi', lo: 'glassDark', edge: 'glass', grain: 'band', pitch: 0, seam: 'none', seamGap: 0, rivet: 0, gloss: 1, defects: ['crack', 'speck'], wear: 'none' },
    fabric:     { base: 'fabric', hi: 'fabricHi', lo: 'fabricLo', edge: 'fabricLo', grain: 'weave', pitch: 2, seam: 'h', seamGap: 14, rivet: 0, gloss: 0.1, defects: ['snag', 'fade'], wear: 'shine' },
    plastic:    { base: 'panelLo', hi: 'steel', lo: 'steelDark', edge: 'line', grain: 'h', pitch: 2, seam: 'v', seamGap: 48, rivet: 0, gloss: 0.3, defects: ['scuff', 'scratch'], wear: 'shine' },
    antiskid:   { base: 'steelLo', hi: 'steelHi', lo: 'dark', edge: 'line', grain: 'plate', pitch: 6, seam: 'v', seamGap: 40, rivet: 0, gloss: 0.25, defects: ['worn', 'pit'], wear: 'polish' },
    wood:       { base: 'floorcloth', hi: 'floorHi', lo: 'floorLo', edge: 'floorLo', grain: 'h', pitch: 18, seam: 'v', seamGap: 18, rivet: 0, gloss: 0.35, defects: ['scratch', 'splinter', 'knot'], wear: 'shine' },
    grate:      { base: 'steelLo', hi: 'steel', lo: 'line', edge: 'dark', grain: 'pleat', pitch: 4, seam: 'none', seamGap: 0, rivet: 0, gloss: 0.2, defects: ['pit', 'rustpits'], wear: 'polish' },
    // 顶棚/内饰烤漆：极窄三段明度，横向分块
    paintin:    { base: 'paint', hi: 'paintHi', lo: 'paintLo', edge: 'paintLo', grain: 'h', pitch: 22, seam: 'v', seamGap: 22, rivet: 0, gloss: 0.4, defects: ['fade', 'stain'], wear: 'shine' },
    crate:      { base: 'crate', hi: 'crateHi', lo: 'crateLo', edge: 'crateLo', grain: 'h', pitch: 7, seam: 'h', seamGap: 7, rivet: 0, gloss: 0.3, defects: ['scratch', 'splinter', 'stain'], wear: 'shine' },
  };
  // 阶段一/旧代码的名字映射进来，避免两处定义（panel/metal/floorcloth 都是别名）
  const ALIAS = { panel: 'paint', metal: 'steel', floorcloth: 'wood', paint: 'paintin' };

  // ---------- 表面方向：决定纹理走向、接缝方向、打光方向 ----------
  const FACE = {
    side: { grain: 1, seam: 1, litFrom: 'top' },     // 朝外（侧墙、端墙、裙板）
    top: { grain: 0, seam: 0, litFrom: 'top' },      // 朝上（车顶走道、地板、平台）
    bottom: { grain: 0, seam: 0, litFrom: 'bottom' },// 朝下（顶棚、车底）
    edge: { grain: 1, seam: 1, litFrom: 'left' },    // 窄边（框、立边、压条）
  };

  // ---------- 接触带：磨损只允许出现在这里 ----------
  // zone 由调用方（骨架构件）声明；band 给出「接触带」在构件内的相对位置
  const ZONE = {
    sill: { band: [0, 0.34, 1, 0.62], kind: 'polish' },      // 门槛/踏面中间被踩亮
    handle: { band: [0.62, 0.34, 0.94, 0.62], kind: 'polish' }, // 把手周围
    corner: { band: [0, 0, 1, 1], kind: 'chip' },            // 边角掉漆（四角加权）
    wheelarch: { band: [0, 0.45, 1, 1], kind: 'spray' },     // 轮罩甩污：下沿向上后方
    touch: { band: [0, 0, 1, 0.28], kind: 'shine' },         // 常摸的上棱
    tread: { band: [0, 0.2, 1, 0.9], kind: 'worn' },         // 走道踩踏磨平
    rain: { band: [0, 0, 1, 0.7], kind: 'streak' },          // 雨痕/流污（竖向）
  };

  // ---------- 主入口 ----------
  // o = { seed, face, zone, wear, chip, soot, hue, px, gloss }
  function paint(pen, id, x, y, w, h, o) {
    o = o || {};
    const M = LIB[ALIAS[id] || id] || LIB.steel;
    const P = pen.p, seed = (o.seed | 0) + (x | 0) * 3 + (y | 0) * 7;
    const F = FACE[o.face || 'side'] || FACE.side;
    const px = o.px === undefined ? 1 : o.px;
    const base = o.hue ? mix(P[M.base] || P.steel, o.hue, 0.55) : (P[M.base] || P.steel);
    const hi = o.hue ? mix(P[M.hi] || P.steelHi, o.hue, 0.4) : (P[M.hi] || P.steelHi);
    const lo = P[M.lo] || P.steelLo, ed = P[M.edge] || P.steelDark;
    const rust = o.under || rustOf(base);
    const clipX = v => Math.max(x, Math.min(x + w, v));
    const clipY = v => Math.max(y, Math.min(y + h, v));
    const R = (rx, ry, rw, rh, c) => {                       // 唯一出口：一律裁剪在对象矩形内
      rx = clipX(rx); ry = clipY(ry);
      rw = Math.max(0, Math.min(rw, x + w - rx)); rh = Math.max(0, Math.min(rh, y + h - ry));
      if (rw > 0 && rh > 0) pen.strip(Math.round(rx), Math.round(ry), Math.round(rw), Math.round(rh), c);
    };
    const fine = Math.min(w, h) * px >= 4;                   // LOD：远看不画细纹，避免糊成一片
    const veryFine = Math.min(w, h) * px >= 9;

    R(x, y, w, h, base);
    if (!fine) {
      // 远看不画纹理，但亮暗边仍要走同一个表面的朝向：这里原先写死「上亮下暗」，
      // 于是薄于 4px 的顶棚条受光方向和它所属的朝下表面正好相反 —— 同一节车厢里
      // 厚构件说光从上头来、薄构件说光从下头来，阴影方向就散了。
      const up = F.litFrom !== 'bottom';
      R(x, y, w, 1, up ? hi : lo); R(x, y + h - 1, w, 1, up ? lo : hi);
      return;
    }

    // ① 纹理：走向随表面方向转 90°
    const g = M.grain, vertical = F.grain === 1;
    if (g === 'v' || g === 'h') {
      const step = Math.max(2, M.pitch);
      const n = vertical ? Math.ceil(w / step) : Math.ceil(h / step);
      for (let i = 0; i < n; i++) {
        const t = h2(seed, i);
        if (t > 0.72) continue;                              // 疏密不匀，才不像程序格
        if (vertical) R(x + i * step, y, 1, h, t > 0.5 ? hi : lo);
        else R(x, y + i * step, w, 1, t > 0.5 ? hi : lo);
      }
    } else if (g === 'pleat') {
      const step = Math.max(3, M.pitch);
      const n = Math.ceil((vertical ? w : h) / step);
      for (let i = 0; i < n; i++) {
        if (vertical) { R(x + i * step, y, step / 2 | 0, h, hi); R(x + i * step + (step / 2 | 0), y, step - (step / 2 | 0), h, lo); }
        else { R(x, y + i * step, w, step / 2 | 0, hi); R(x, y + i * step + (step / 2 | 0), w, step - (step / 2 | 0), lo); }
      }
    } else if (g === 'weave') {
      for (let j = 0; j < h; j += 2) R(x, y + j, w, 1, (j / 2 | 0) % 2 ? lo : hi);
      if (veryFine) for (let i = 0; i < w; i += 4) R(x + i, y, 1, h, mix(base, ed, 0.25));
    } else if (g === 'plate') {                              // 防滑菱形花：成对短斜杠，跟着表面方向转
      for (let j = 0; j + 4 <= (vertical ? h : w); j += 5) for (let i = 0; i + 4 <= (vertical ? w : h); i += 7) {
        const off = ((j / 5 | 0) % 2) * 3;
        if (vertical) { R(x + i + off, y + j + 1, 3, 1, hi); R(x + i + off + 1, y + j + 2, 2, 1, hi); R(x + i + off, y + j + 3, 3, 1, lo); }
        else { R(x + j + 1, y + i + off, 1, 3, hi); R(x + j + 2, y + i + off + 1, 1, 2, hi); R(x + j + 3, y + i + off, 1, 3, lo); }
      }
    } else if (g === 'band') {                               // 玻璃：分带反光（不用平滑渐变）
      const b = Math.max(2, h / 5 | 0);
      for (let i = 0; i < 5; i++) R(x, y + i * b, w, b, i === 1 ? lo : i === 3 ? hi : base);
      R(x, y, Math.max(2, w * 0.34 | 0), Math.max(1, h * 0.5 | 0), hi);
    } else if (g === 'diag') {
      for (let i = -h; i < w; i += 6) for (let j = 0; j < h; j += 2) R(x + i + j, y + j, 2, 1, lo);
    }

    // ② 接缝：方向也随表面转；缝 = 一条暗线 + 旁边一条亮线（金属压边）
    if (M.seam !== 'none' && veryFine) {
      const gap = Math.max(10, M.seamGap), n = Math.ceil((F.grain ? w : h) / gap);
      for (let i = 1; i <= n; i++) {
        const at = i * gap + (h2(seed + i, 9) * 5 | 0) - 2;
        if (F.grain === 1) { if (at >= w) break; R(x + at, y, 1, h, ed); R(x + at + 1, y, 1, h, hi); }
        else { if (at >= h) break; R(x, y + at, w, 1, ed); R(x, y + at + 1, w, 1, hi); }
      }
    }
    // ③ 铆钉：只沿接缝排，且要有高光+阴影两点才读得出凸起
    if (M.rivet && veryFine) {
      const step = Math.max(6, M.rivet);
      for (let i = 3; i < w; i += step) for (let j = 3; j < h; j += step) {
        if (h2(seed, i * 31 + j) > 0.22) continue;
        R(x + i, y + j, 1, 1, hi); R(x + i + 1, y + j + 1, 1, 1, ed);
      }
    }
    // ④ 打光：朝上的面顶亮底暗，朝下的面反过来（顶棚就靠这条读得出「在上面」）
    if (F.litFrom === 'top') { R(x, y, w, 1, hi); R(x, y + 1, w, 1, mix(base, hi, 0.4)); R(x, y + h - 1, w, 1, ed); }
    else { R(x, y, w, 1, ed); R(x, y + h - 1, w, 1, hi); R(x, y + h - 2, w, 1, mix(base, hi, 0.4)); }
    R(x, y, 1, h, mix(base, hi, 0.3)); R(x + w - 1, y, 1, h, mix(base, ed, 0.5));

    // ⑤ 细小缺陷：每种材质权重不同（钢是划伤+锈坑，漆是掉漆+磕痕，橡胶是老化裂…）
    const W = (o.wear === undefined ? 0.5 : o.wear) * (M.gloss > 0.4 ? 1 : 0.7);
    const CH = o.chip === undefined ? 0.5 : o.chip;
    const soot = o.soot === undefined ? 0.35 : o.soot;
    const area = Math.max(1, w * h);
    const nDef = Math.round(area / 2600 * (0.15 + CH)) * (M.defects.length ? 1 : 0);
    for (let k = 0; k < nDef; k++) {
      const t = h2(seed, k * 7 + 3), u = h2(seed, k * 13 + 5), v = h2(seed, k * 29 + 7);
      const kind = M.defects[(t * M.defects.length) | 0];
      const ex = x + (u * (w - 2) | 0), ey = y + (v * (h - 2) | 0);
      if (kind === 'chip') {                                  // 掉漆露底：边缘概率高
        const e = Math.min(ex - x, x + w - ex, ey - y, y + h - ey);
        if (e > Math.min(w, h) * 0.3 && h2(seed, k) > 0.28) continue;
        R(ex, ey, 1 + (t * 3 | 0), 1 + (u * 2 | 0), rust);
        R(ex, ey - 1, 2, 1, mix(base, hi, 0.5));
      } else if (kind === 'scratch') {
        const L = 3 + (t * 12 | 0);
        if (F.grain === 1) R(ex, ey, 1, L, mix(base, hi, 0.55));
        else R(ex, ey, L, 1, mix(base, hi, 0.55));
      } else if (kind === 'dent') { R(ex, ey, 2 + (t * 3 | 0), 1, ed); R(ex, ey + 1, 2 + (t * 3 | 0), 1, mix(base, hi, 0.5)); }
      else if (kind === 'rustpits' || kind === 'pit') { R(ex, ey, 1 + (t * 2 | 0), 1, kind === 'pit' ? ed : rust); R(ex + 1, ey + 1, 1, 1, mix(rust, ed, 0.5)); }
      else if (kind === 'crack') { for (let j = 0; j < 4 + (t * 6 | 0); j++) R(ex + (h2(seed, k + j) * 3 | 0) - 1, ey + j, 1, 1, ed); }
      else if (kind === 'snag') { R(ex, ey, 1 + (t * 4 | 0), 1, mix(base, hi, 0.6)); R(ex, ey + 1, 1, 2, lo); }
      else if (kind === 'fade') { R(ex, ey, 4 + (t * 10 | 0), 2 + (u * 4 | 0), mix(base, hi, 0.25)); }
      else if (kind === 'stain') { R(ex, ey, 3 + (t * 7 | 0), 2 + (u * 5 | 0), mix(base, ed, 0.35)); }
      else if (kind === 'scuff') { for (let j = 0; j < 3; j++) R(ex, ey + j * 2, 2 + (t * 5 | 0), 1, mix(base, hi, 0.45)); }
      else if (kind === 'splinter') { R(ex, ey, 1, 2 + (t * 4 | 0), hi); }
      else if (kind === 'knot') { R(ex, ey, 2, 2, lo); R(ex + 1, ey + 1, 2, 1, mix(base, ed, 0.4)); }
      else if (kind === 'worn') { R(ex, ey, 5 + (t * 9 | 0), 2 + (u * 3 | 0), mix(base, hi, 0.3)); }
    }
    // ⑥ 接触带磨损：只有声明了 zone 的构件才有，且严格落在带内
    const z = ZONE[o.zone];
    if (z && veryFine) {
      const b = z.band, bx = x + b[0] * w, by = y + b[1] * h, bw = Math.max(1, (b[2] - b[0]) * w), bh = Math.max(1, (b[3] - b[1]) * h);
      const n = Math.round(bw * bh / 620 * W);          // wear=0 就一笔都不画，闸门才能隔离出「磨损只出现在接触带」
      for (let k = 0; k < n; k++) {
        const u = h2(seed + 71, k * 5 + 1), v = h2(seed + 97, k * 7 + 2), t = h2(seed + 13, k * 11 + 3);
        const ex = bx + (u * (bw - 2) | 0), ey = by + (v * (bh - 1) | 0);
        if (z.kind === 'polish') { R(ex, ey, 2 + (t * 5 | 0), 1, mix(base, hi, 0.62)); }
        else if (z.kind === 'shine') { R(ex, ey, 1 + (t * 3 | 0), 1, mix(base, hi, 0.5)); }
        else if (z.kind === 'chip') {
          const corner = (u < 0.2 || u > 0.8) && (v < 0.25 || v > 0.75);
          if (!corner && h2(seed, k) > 0.2) continue;
          R(ex, ey, 1 + (t * 2 | 0), 1 + (v * 2 | 0), rust);
        } else if (z.kind === 'spray') {
          const L = 2 + (t * (bh * 0.8) | 0);
          R(ex, Math.min(ey + L, y + h - 1), 1, Math.max(1, Math.min(L, y + h - ey)), mix(base, ed, 0.55));
        } else if (z.kind === 'streak') {
          const L = 3 + (t * h | 0);
          R(ex, ey, 1, Math.max(1, Math.min(L, y + h - ey)), mix(base, ed, 0.42));
        } else if (z.kind === 'worn') { R(ex, ey, 3 + (t * 8 | 0), 1 + (v * 2 | 0), mix(base, hi, 0.35)); }
      }
      if (z.kind === 'polish' && W > 0.08) R(bx, by, bw, 1, mix(base, hi, 0.5));   // 踩出来的亮边
    }
    // ⑦ 落灰/油污：只从构件上沿往下挂（重力方向），且侧墙比朝上的面重
    if (veryFine && soot > 0.05) {
      const n = Math.round(w / 9 * soot * (F.grain === 1 ? 1 : 0.35));
      for (let k = 0; k < n; k++) {
        const ex = x + (h2(seed + 311, k) * (w - 1) | 0), L = (h2(seed + 419, k) * (F.grain === 1 ? h * 0.55 : h * 0.2)) | 0;
        R(ex, y, 1, Math.max(1, L), mix(base, ed, 0.3 + 0.25 * h2(seed + 53, k)));
      }
    }
  }

  // 供骨架/预览台查询：这个材质该用哪张「脸」
  function faceOf(kind) {
    return ({
      crest: 'top', shoulder: 'top', eave: 'top', skin: 'side', gutter: 'side', livery: 'side',
      deck: 'top', ceiling: 'bottom', cove: 'bottom', roofrib: 'side',
      'wall-upper': 'side', 'wall-pier': 'side', 'wall-knee': 'side', 'wall-base': 'side', mold: 'side',
      floor: 'top', sill: 'side', truss: 'side', 'skirt-edge': 'side', walkway: 'top',
      'brake-pipe': 'side', 'pipe-valve': 'side', 'buffer-beam': 'side', coupler: 'side', 'draft-gear': 'side',
      wheel: 'side', axle: 'side', 'bogie-side': 'side', 'axle-box': 'side', journal: 'top', spring: 'top',
      bolster: 'top', hanger: 'side', side: 'side', 'end-roof': 'side', 'end-lintel': 'side', 'end-sill': 'top',
      'door-frame': 'side', 'door-sill': 'top', 'gang-canopy': 'side', 'gang-roof': 'top', 'gang-post': 'side',
      handrail: 'top', 'gang-floor': 'top', glazing: 'side', 'win-head': 'side', 'win-sill': 'top',
      'win-jamb': 'side', 'win-mullion': 'side', hazard: 'top', 'number-board': 'side', radiator: 'side',
    })[String(kind).replace(/#.*$/, '')] || 'side';
  }
  // 接触带：门坎 / 把手 / 轮罩 / 边角 / 常摸 / 走道 / 雨痕
  function zoneOf(kind) {
    const k = String(kind).replace(/#.*$/, '');
    if (k === 'door-sill' || k === 'end-sill' || k === 'walkway' || k === 'gang-floor' || k === 'walk') return 'sill';
    if (k === 'handrail' || k === 'door-jamb' || k === 'door-frame') return 'handle';
    if (k === 'bogie-side' || k === 'skirt-edge' || k === 'bolster') return 'wheelarch';
    if (k === 'skin' || k === 'eave' || k === 'shoulder' || k === 'crest' || k === 'deck') return 'corner';
    if (k === 'side' || k === 'end-roof' || k === 'end-lintel') return 'corner';
    if (k === 'wall-base' || k === 'wall-knee') return 'rain';
    if (k === 'floor' || k === 'sill' || k === 'truss') return 'tread';
    if (k === 'win-sill' || k === 'win-head' || k === 'win-jamb' || k === 'radiator') return 'touch';
    return '';
  }

  return { LIB, ALIAS, FACE, ZONE, paint, faceOf, zoneOf, h2, mix, dark, rustOf };
})();
