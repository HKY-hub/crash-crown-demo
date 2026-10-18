// ============ 阴森古堡 · 程序化美术 ============
// 复用现成能力，不另建渲染器：
//   · 形状一律走 pixel.js 的 pxRect/pxLine/pxArch/pxNoise（逻辑像素取整、确定性抖动）
//   · 大面积材质走本文件的「瓦片缓存 + 源矩形裁切 blit」（阶段二性能底座）
//   · 木纹/灰泥/地砖直接复用 VillaDraw.surface（同一套 hsl 材质语言，两张室内图不会各画各的）
// 图层顺序（世界坐标，随相机 translate）：
//   天空 → 远景剪影 → 区域背墙与建筑语言 → 结构体（楼板/墙/台阶/跳台）→ 家具器物 →
//   火把与水光 → 动态浮尘 → 剖面暗角
// 几何只读：本文件不产生、不移动任何碰撞体，只按 level.castle.solids 已有的语义字段
// （deck / wall / lintel / stair / ledge / oneway / mat）决定画法。
const CastleDraw = (() => {
  const VD = (typeof VillaDraw !== 'undefined') ? VillaDraw : null;
  const P = n => Math.round(n);
  const mod = (v, n) => ((v % n) + n) % n;
  const hsl = (h, s, l, a) => (a === undefined ? 'hsl(' + P(h) + ',' + P(s) + '%,' + P(l) + '%)'
    : 'hsla(' + P(h) + ',' + P(s) + '%,' + P(l) + '%,' + a + ')');
  const line = (ctx, x0, y0, x1, y1, color, width = 1, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    for (let i = 0; i < width; i++) pxLine(ctx, x0, y0 + i, x1, y1 + i);
    ctx.restore();
  };
  const poly = (ctx, points, color, stroke, width = 1, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(P(points[0][0]), P(points[0][1]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(P(points[i][0]), P(points[i][1]));
    ctx.closePath(); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    ctx.restore();
  };

  // ---------- 视觉规范（唯一真源；阶段九按这张表复校全图） ----------
  const STYLE = {
    // 1) 视角：横版侧视剖面。只画「切开后看到的 face + 顶/底边」，不画透视消亡点、不画斜交立面。
    view: 'section-cut',
    // 2) 光源恒为左上（月夜）；火把是唯一的第二光源且只照下半区。明面=顶与左，暗面=底与右。
    light: { dir: -1, topHi: 0.17, leftHi: 0.08, botSh: 0.30, rightSh: 0.16 },
    // 3) 线宽纪律：描边 1px、压顶亮带 2px、体块底沿暗带 3px。不允许混用 0.5/2px 描边。
    line: 1, lipW: 2, baseW: 3,
    // 4) 可通行边缘恒比后方墙体更明确：2px 高亮压顶 + 1px 冷暗下沿 + 端头 3px 立边。
    //    这三笔只允许画在「有碰撞的落脚面」上；无碰撞装饰禁止使用这组值。
    walkLip: { hi: 'rgba(224,236,255,0.44)', in: 'rgba(255,255,255,0.13)', sh: 'rgba(0,0,0,0.58)' },
    // 5) 接触阴影：任何「站在别人顶面上」的东西，接缝处画 3px 深色 + 端头各内缩 2px。
    contact: 'rgba(0,0,0,0.36)',
    // 6) 材质密度上限（防止用满屏噪点冒充细节）：抖动只用 pixel.js 的 2×2 基元且 density≤0.05、
    //    块状 speckle 用 3~4px 且 density≤0.10；石块砌缝 48×26、砖 24×10、木纹板宽≥24。
    //    低于这个尺度的重复不算细节，超出这个密度的点阵一律删掉。
    dens: { ditherCell: 2, ditherMax: 0.05, speckleCell: 3, speckleMax: 0.10,
      blockW: 48, blockH: 26, brickW: 24, brickH: 10, grainMin: 24 },
    // 7) 背景层退后规则：无碰撞装饰一律 alpha≤0.72、饱和度取 0.55、明度取 0.72，
    //    且自带投影、不带压顶亮线 —— 让人一眼读出「这是墙面/进深，不是可站的台面」。
    back: { alpha: 0.68, desat: 0.55, lift: 0.72 },
    // 8) 人物分离：以人物剪影正后方（上半弧 + 两侧）为背景取样，与角色主色的相对亮度差 ≥0.22；
    //    整圈椭圆只作参考、门线 0.75 倍 —— 整圈必然采到脚下地面与身后楼梯踏板，而那些按规则 4
    //    就该是全图最亮，拿它当「背景」要求人物比它更亮是自相矛盾。人物头顶以上 96px 的背墙
    //    恒压暗 headroomDark，分离度是从背景这边买来的，不去改角色配色。
    sep: { minDelta: 0.22, ringFactor: 0.75, headroomDark: 0.38 },
    // 9) 细节上限：单屏（960×540）内非结构装饰件数 ≤ 260，超出即视为过度细节，删而不加。
    maxDecorPerScreen: 260,
  };

  // ---------- 层与材质 ----------
  // CastleGen owns the real eight-band coordinate system. Keep legacy aliases
  // only for the old sample scenes; every render syncs these values from M.Y.
  let LVY = { TT: 62, RF: 150, F2: 300, F1: 470, B1: 655 };
  let LVS = ['TT', 'RF', 'F2', 'F1', 'B1'];
  const SLB = 18;
  // 灰盒时期遗留的 PAL 仍导出，供 tools 断言「材质只有这四种」
  const PAL = {
    stone: { face: '#4a5160', top: '#8b93a6', edge: '#2b303a', grain: 'rgba(255,255,255,0.05)' },
    brick: { face: '#5a4740', top: '#8f7566', edge: '#302622', grain: 'rgba(0,0,0,0.18)' },
    wood: { face: '#4e3b28', top: '#8a6a45', edge: '#2a1f16', grain: 'rgba(255,220,170,0.06)' },
    plaster: { face: '#6b6252', top: '#a09580', edge: '#3a352c', grain: 'rgba(255,255,255,0.04)' },
  };
  // 美术分区（按 x 分段，与 castle-gen 的 REGIONS 同界；塔楼取到 3520 与 deck f1_tower 对齐，
  // gen 的 REGIONS.tower.x1=3360 是标签瑕疵，属阶段三通行图验收范围，这里不改地图数据）
  const ART = [
    { id: 'moat', x0: 0, x1: 430, hue: 208, amb: 0.58, masonry: 'rubble', desc: '护城河与吊桥（室外）' },
    { id: 'gate', x0: 430, x1: 760, hue: 34, amb: 0.66, masonry: 'ashlar', desc: '外城门楼' },
    { id: 'court', x0: 760, x1: 1620, hue: 44, amb: 0.74, masonry: 'ashlar', desc: '内庭与马厩' },
    { id: 'hall', x0: 1620, x1: 2320, hue: 22, amb: 0.60, masonry: 'ashlar', desc: '守卫大厅' },
    { id: 'banquet', x0: 2320, x1: 2880, hue: 36, amb: 0.68, masonry: 'ashlar', desc: '宴会厅' },
    { id: 'tower', x0: 2880, x1: 3520, hue: 220, amb: 0.80, masonry: 'ashlar', desc: '中央塔楼' },
    { id: 'library', x0: 3520, x1: 4060, hue: 18, amb: 0.56, masonry: 'brick', desc: '图书馆与书房' },
    { id: 'chapel', x0: 4060, x1: 4760, hue: 48, amb: 0.72, masonry: 'ashlar', desc: '礼拜堂与回廊' },
    { id: 'ewing', x0: 4760, x1: 5240, hue: 8, amb: 0.50, masonry: 'brick', desc: '东旧翼楼（残破）' },
    { id: 'eastout', x0: 5240, x1: 5600, hue: 200, amb: 0.84, masonry: 'rubble', desc: '东城墙与外部平台（室外）' },
  ];
  let LV_AMB = { TT: 1.0, RF: 0.88, F2: 0.66, F1: 0.56, B1: 0.40 };
  function syncLevels(M) {
    if (!M || !M.Y) return;
    const y = M.Y;
    LVY = Object.assign({}, y, { TT: y.SP, RF: y.RW, F2: y.U2, F1: y.G1, B1: y.C1 });
    LVS = Array.isArray(M.LVS) ? M.LVS.slice() : LVS;
    LV_AMB = Object.assign({ SP: 1.0, RW: 0.90, U2: 0.78, U1: 0.68, G2: 0.58, G1: 0.52, C1: 0.40, C0: 0.30 }, {
      TT: 1.0, RF: 0.90, F2: 0.78, F1: 0.52, B1: 0.40,
    });
  }
  const isUnder = lv => lv === 'C1' || lv === 'C0' || lv === 'B1';
  const isGround = lv => lv === 'G1' || lv === 'G2' || lv === 'F1';
  const isHigh = lv => lv === 'U1' || lv === 'U2' || lv === 'F2';
  const isRoof = lv => lv === 'RW' || lv === 'RF';
  const artOf = x => { for (const a of ART) if (x >= a.x0 && x < a.x1) return a; return x < 0 ? ART[0] : ART[ART.length - 1]; };
  const isOutdoor = a => a.id === 'moat' || a.id === 'eastout';

  // ---------- 确定性随机（只在生成期调用，逐帧不再采样） ----------
  function lcg(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  // ---------- 瓦片缓存（静态纹理只生成一次；世界原点对齐 → 不随相机游动） ----------
  const TEX = {};
  function buildTile(key, tw, th, draw) {
    if (key in TEX) return TEX[key];
    let t = null;
    try {
      const c = document.createElement('canvas');
      c.width = tw; c.height = th; c._px = true;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      draw(g, tw, th);
      t = { c, tw, th };
    } catch (e) { t = null; }        // 无头基座没有真 canvas：退化为纯色面
    TEX[key] = t;
    return t;
  }
  function fillFace(ctx, key, x, y, w, h) {
    const t = TEX[key];
    if (!t) { ctx.fillStyle = '#3a4049'; pxRect(ctx, x, y, w, h); return; }
    let sy = mod(y, t.th);
    for (let yy = y; yy < y + h;) {
      const dh = Math.min(t.th - sy, y + h - yy);
      let sx = mod(x, t.tw);
      for (let xx = x; xx < x + w;) {
        const dw = Math.min(t.tw - sx, x + w - xx);
        ctx.drawImage(t.c, sx, sy, dw, dh, P(xx), P(yy), dw, dh);
        xx += dw; sx = 0;
      }
      yy += dh; sy = 0;
    }
  }
  // 石砌大块（券面）：每块轻微明度抖动 + 上左高光 / 下右灰浆
  function tileMasonry(name, hue, bw, bh, sat, base, rough) {
    buildTile(name, bw * 2, bh * 2, (g) => {
      g.fillStyle = hsl(hue, sat, base); g.fillRect(0, 0, bw * 2, bh * 2);
      const rnd = lcg(name.length * 7777 + hue * 131);
      for (let row = 0; row < 2; row++) {
        const off = row % 2 ? bw : 0;
        for (let k = -1; k < 2; k++) {
          const bx = mod(off + k * bw, bw * 2), by = row * bh;
          const l = base + (rnd() - 0.5) * (rough ? 7 : 4);
          g.fillStyle = hsl(hue + (rnd() - 0.5) * 6, sat, l);
          g.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
          if (rough) g.fillRect(bx + 2 + Math.floor(rnd() * (bw - 8)), by + 3, 1, bh - 6);
          g.fillStyle = 'rgba(255,255,255,0.05)';       // 左上受光（灰浆缝压到 0.14 以下，否则整面图像坐标纸）
          g.fillRect(bx + 1, by + 1, bw - 2, 1); g.fillRect(bx + 1, by + 1, 1, bh - 2);
          g.fillStyle = 'rgba(0,0,0,0.14)';
          g.fillRect(bx, by + bh - 1, bw, 1); g.fillRect(bx + bw - 1, by, 1, bh);
        }
      }
      pxNoise(g, 0, 0, bw * 2, bh * 2, 'rgba(0,0,0,0.06)', hue * 31 + 7, 0.045);
      pxNoise(g, 0, 0, bw * 2, bh * 2, 'rgba(230,240,255,0.035)', hue * 17 + 3, 0.03);
    });
  }
  function initTiles() {
    tileMasonry('ashlar-34', 34, STYLE.dens.blockW, STYLE.dens.blockH, 8, 42, false);
    tileMasonry('rubble-208', 208, 30, 20, 9, 34, true);  // 毛石：尺度刻意小于方整石，读作粗砌基座/地坪
    // 哥特砖：24×10 错缝
    buildTile('brick-12', STYLE.dens.brickW * 2, 20, (g) => {
      g.fillStyle = hsl(12, 20, 34); g.fillRect(0, 0, 48, 20);
      const rnd = lcg(4242);
      for (let row = 0; row < 2; row++) {
        const off = row % 2 ? 12 : 0;
        for (let k = -1; k < 3; k++) {
          const bx = mod(off + k * 24, 48), by = row * 10;
          g.fillStyle = hsl(10 + rnd() * 8, 22 + rnd() * 8, 32 + rnd() * 9);
          g.fillRect(bx + 1, by + 1, 22, 8);
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(bx + 1, by + 1, 22, 1);
        }
      }
      pxNoise(g, 0, 0, 48, 20, 'rgba(0,0,0,0.12)', 909, 0.06);
    });
    // 板岩屋面（鱼鳞瓦）
    buildTile('slate', 24, 16, (g) => {
      g.fillStyle = hsl(216, 8, 24); g.fillRect(0, 0, 24, 16);
      for (let row = 0; row < 2; row++) for (let k = -1; k < 2; k++) {
        const x = mod(k * 12 + (row % 2 ? 6 : 0), 24), y = row * 8;
        g.fillStyle = hsl(216, 9, 30 + row * 3);
        g.fillRect(x + 1, y + 1, 10, 7);
        g.fillStyle = 'rgba(210,225,245,0.10)'; g.fillRect(x + 1, y + 1, 10, 1);
        g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x + 1, y + 7, 10, 1);
      }
    });
    // 铅条玻璃（教堂窗，BACK 层用）
    buildTile('glasslead', 24, 24, (g) => {
      g.fillStyle = 'rgba(120,150,170,0.30)'; g.fillRect(0, 0, 24, 24);
      g.fillStyle = 'rgba(200,220,235,0.16)'; g.fillRect(0, 0, 11, 11); g.fillRect(12, 12, 11, 11);
      g.fillStyle = 'rgba(20,26,34,0.55)'; g.fillRect(11, 0, 2, 24); g.fillRect(0, 11, 24, 2);
    });
  }
  initTiles();

  // ---------- 体块通用笔法 ----------
  // 可通行边缘三笔（只有落脚面能画）
  function walkLip(ctx, x, y, w) {
    ctx.fillStyle = STYLE.walkLip.hi; pxRect(ctx, x, y, w, 1);
    ctx.fillStyle = STYLE.walkLip.in; pxRect(ctx, x, y + 1, w, 1);
    ctx.fillStyle = STYLE.walkLip.sh; pxRect(ctx, x, y + STYLE.lipW, w, 1);
  }
  // 顶受光 / 底与右背光：给体块「有厚度」而不是贴片
  function faceShade(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,' + STYLE.light.botSh + ')'; pxRect(ctx, x, y + h - STYLE.baseW, w, STYLE.baseW);
    ctx.fillStyle = 'rgba(0,0,0,' + STYLE.light.rightSh + ')'; pxRect(ctx, x + w - STYLE.line, y, STYLE.line, h);
    ctx.fillStyle = 'rgba(224,236,255,' + STYLE.light.leftHi + ')'; pxRect(ctx, x, y, STYLE.line, h);
  }
  function contactShadow(ctx, x, y, w, up) {
    ctx.fillStyle = STYLE.contact;
    pxRect(ctx, x + 2, y, w - 4, up ? 2 : STYLE.baseW - 1);
  }
  function outline(ctx, x, y, w, h, col) { pxOutline(ctx, x, y, w, h, col || 'rgba(0,0,0,0.5)'); }

  // ---------- 场景派生数据（生成期一次算完，逐帧只画不采样的随机） ----------
  let SCENE = null, SCENE_FOR = null;
  function scene(M) {
    if (SCENE_FOR === M) return SCENE;
    const bands = [];
    for (const d of M.decks) {
      const i = LVS.indexOf(d.lv), above = LVS[i - 1];
      // 天花板：上一层若有楼板压在这一段上，本段才是「室内」；否则它是屋顶/城墙道/室外平台，
      // 背墙要让位给天空与远景 —— 剖面图里给露天平台画一面室内墙，读者就会以为走不过去。
      let ceil = null;
      if (above) {
        const mid = (d.x0 + d.x1) / 2;
        if (M.decks.some(u => u.lv === above && mid >= u.x0 && mid <= u.x1)) ceil = LVY[above] + SLB;
      }
      const open = ceil == null && !isUnder(d.lv);
      bands.push({ id: d.id, lv: d.lv, deck: d, x0: d.x0, x1: d.x1, floor: LVY[d.lv], ceil, open,
        art: artOf((d.x0 + d.x1) / 2), amb: LV_AMB[d.lv] });
    }
    // 门洞（lintel 实体下方那段空白）
    const portals = [];
    for (const s of M.solids) if (s.lintel) portals.push({
      lv: s.lv, x: s.x, w: s.w, spring: s.y + s.h, floor: s.y + s.h,
      top: s.y, h0: s.h,
    });
    for (const p of portals) {
      const wl = M.walls.find(v => v.lv === p.lv && Math.abs(v.x - p.x) < 30);
      p.op = wl ? wl.op : null;
      const o = p.op && M.OPEN ? M.OPEN[p.op] : null;
      p.clear = o ? o.h : 96;
      p.y0 = LVY[p.lv] - p.clear;
      p.y1 = LVY[p.lv];
    }
    // 火把：沿每段内侧背墙等距布置（间距 ≥170），位置与明暗在生成期定死
    const torches = [], banners = [], ribs = [];
    for (const b of bands) {
      if (b.open) continue;                     // 露天的不做室内布置
      const top = b.ceil == null ? b.floor - 150 : b.ceil;
      const h = b.floor - top;
      if (!b.open) {
        for (let x = b.x0 + 96; x < b.x1 - 70; x += 214) {
          const r = lcg((x * 31 + b.floor * 7) >>> 0);
          if (r() < 0.34) continue;                     // 有空缺才像老房子
          torches.push({ x: P(x), y: P(top + Math.min(h * 0.42, 74)), lv: b.lv, reg: b.art.id,
            warm: r() < 0.78, lit: r() < 0.88 });
        }
      }
      // 礼拜堂/塔楼：肋拱；宴会厅/大厅：锤梁屋顶
      // b1_outlet 也上肋拱：7.2 把这段从填土里放出来之后，头顶那块 18px 的台地楼板必须读成
      // 「架在拱上的通道」，否则玩家会以为踩在一块悬空石板上。
      if (h > 120 && (b.art.id === 'chapel' || b.art.id === 'tower' || b.id === 'b1_outlet')) ribs.push({ k: 'vault', b });
      if (h > 120 && (b.art.id === 'banquet' || b.art.id === 'hall')) ribs.push({ k: 'truss', b });
      if (b.art.id === 'gate' && isHigh(b.lv)) ribs.push({ k: 'slit', b });
      if (b.art.id === 'court' && b.lv === 'G1') {
        // 内庭拱廊 = 马厩阁楼（f2_stable 声明 bgSupport:'arcade'）的背景承重表达：
        // 上面压着楼板的那一段要把传力路径画全（拱脚→墙基、拱肩→被托楼板底）。
        const above = LVS[LVS.indexOf(b.lv) - 1];
        const carried = M.decks.some(d => d.lv === above && d.x1 > b.x0 + 40 && d.x0 < b.x1 - 40);
        ribs.push({ k: 'arcade', b, carries: carried });
      }
      if (b.id === 'b1_cells') ribs.push({ k: 'cells', b });
      if (b.id === 'f1_banq') banners.push({ x: 2400, y: (b.ceil || 318) + 8 }, { x: 2800, y: (b.ceil || 318) + 8 });
    }
    // 门楼二层内墙挂毯：垂在 F2 背墙平面内（168~300），下端不进任何落脚面，不会读成障碍
    banners.push({ x: 500, y: 178 }, { x: 662, y: 178 });
    // 屋顶女墙（RF 各段外侧）：无碰撞 → 只按 BACK 层画（读作墙道另一侧的远端）
    const merlons = [];
    for (const d of M.decks) {
      if (!isRoof(d.lv)) continue;
      for (let x = d.x0 + 6; x < d.x1 - 10; x += 34) {
        if (lcg((x * 17) >>> 0)() < 0.18) continue;      // 缺齿：破损城垛
        merlons.push({ x: P(x), y: LVY.RF - 22, w: 20, h: 22, reg: artOf(x).id });
      }
    }
    // 家具跳台「真能站的那几列」：头顶被梁/门楣压到不足一个人高（36）的地方不算落脚面。
    // 压顶亮线只允许画在真能站的那段（规则 4），否则玩家会朝一段画亮着、实际撞头的台面起跳。
    const PH = 36, ledgeRuns = {};
    for (const s of M.solids) {
      if (!s.oneway || !s.ledge) continue;
      const runs = [], blocked = []; let open = null, bad = null;
      const mark = (arr, from, to) => { if (to - from >= 8) arr.push([from, to]); };
      for (let x = s.x; x <= s.x + s.w; x += 2) {
        let clear = true;
        for (const t of M.solids) {
          if (t.oneway || x < t.x + 1 || x > t.x + t.w - 1) continue;
          if (t.y < s.y && t.y + t.h > s.y - PH) { clear = false; break; }
        }
        if (clear) { if (bad != null) { mark(blocked, bad, x); bad = null; } if (open == null) open = x; }
        else { if (open != null) { mark(runs, open, x); open = null; } if (bad == null) bad = x; }
      }
      mark(runs, open == null ? s.x + s.w : open, s.x + s.w);
      mark(blocked, bad == null ? s.x + s.w : bad, s.x + s.w);
      ledgeRuns[s.ledge] = { ok: runs.length ? runs : [[s.x, s.x + s.w]], bad: blocked };
    }
    SCENE = { bands, byDeck: {}, portals, torches, banners, ribs, merlons, ledgeRuns };
    for (const b of bands) SCENE.byDeck[b.id] = b;
    SCENE_FOR = M;
    return SCENE;
  }

  // ---------- 1 天空 ----------
  function skyLayer(ctx, M, V, amb) {
    const B = 6, top = 0, bot = M.world.h;
    for (let y = top; y < bot; y += B) {
      const t = (y - top) / (bot - top);
      // 月夜：天顶冷蓝 → 地平线灰紫 → 地面近黑；带高 6px、相邻 alpha 差 < 1 色阶
      const l = 13 - 9 * Math.pow(t, 0.6);
      ctx.fillStyle = hsl(222 - t * 20, 22 - t * 10, Math.max(3, l));
      pxRect(ctx, V.x0, y, V.x1 - V.x0, B);
    }
    // 星点：世界坐标固定（逐帧一致，不闪烁）
    const rnd = lcg(20260929);
    ctx.fillStyle = 'rgba(214,232,255,0.55)';
    for (let i = 0; i < 240; i++) {
      const x = P(rnd() * M.world.w), y = P(rnd() * 190);
      if (x < V.x0 || x > V.x1) continue;
      pxRect(ctx, x, y, rnd() < 0.15 ? 2 : 1, 1);
    }
    // 月：固定在世界 x=1180/3400 两处高处，作为「左上光源」的证据
    for (const mx of [1180, 3980]) {
      if (mx < V.x0 - 120 || mx > V.x1 + 120) continue;
      ctx.fillStyle = 'rgba(226,238,252,0.90)'; pxCircle(ctx, mx, 74, 20);
      ctx.fillStyle = 'rgba(20,26,40,0.92)'; pxCircle(ctx, mx + 9, 68, 17);       // 亏月：受光方向在左
      ctx.fillStyle = 'rgba(180,206,240,0.07)'; pxCircle(ctx, mx, 74, 52);
    }
    if (amb < 1) { ctx.fillStyle = 'rgba(6,10,18,' + (0.30 * (1 - amb)).toFixed(3) + ')'; pxRect(ctx, V.x0, 0, V.x1 - V.x0, M.world.h); }
  }

  // ---------- 2 远景剪影（视差 0.25：世界坐标 += cam.x*0.75） ----------
  function farLayer(ctx, M, V, cam) {
    const off = P(cam.x * 0.75);
    const rnd = lcg(555_001);
    // 地平线取 F1（470）而不是 B1：护城河在剖面里被自身地坪墙挡住，若把远景坐在 655，
    // 室外那半屏的天空就什么剪影都看不见（第一版截图左半屏一片死黑的原因）。
    const gy = LVY.F1;
    // 地平线冷光：没有它，剪影和夜空同明度，室外那半屏就是一片死黑（第一版截图的毛病）
    ctx.fillStyle = 'rgba(58,74,96,0.20)'; pxRect(ctx, V.x0, gy - 250, V.x1 - V.x0, 250);
    ctx.fillStyle = 'rgba(70,90,116,0.14)'; pxRect(ctx, V.x0, gy - 120, V.x1 - V.x0, 120);
    for (let i = 0; i < 46; i++) {
      const bx = P(rnd() * 1500 + i * 170) + off;
      if (bx < V.x0 - 320 || bx > V.x1 + 320) continue;
      const h = 90 + P(rnd() * 150), w = 54 + P(rnd() * 70);
      // 远处残塔：底边落在地平线上，绝不悬空；比夜空亮一档（空气透视），否则等于没画
      ctx.fillStyle = 'rgba(52,66,86,0.92)';
      pxRect(ctx, bx, gy - h, w, h);
      ctx.fillStyle = 'rgba(42,54,72,0.92)';
      pxRect(ctx, bx - 6, gy - h - 12, w + 12, 12);           // 塔帽
      ctx.fillStyle = 'rgba(74,92,116,0.92)';
      pxRect(ctx, bx - 6, gy - h - 12, w + 12, 2);            // 受光顶线
      ctx.fillStyle = 'rgba(12,16,24,0.75)';
      for (let k = 0; k < 3; k++) pxRect(ctx, bx + 8 + k * 16, gy - h + 20, 5, 9);   // 箭窗
    }
    // 枯树剪影（只有室外段看得见）
    for (let i = 0; i < 30; i++) {
      const bx = P(rnd() * 1400 + i * 260) + off;
      if (bx < V.x0 - 60 || bx > V.x1 + 60) continue;
      ctx.fillStyle = 'rgba(26,32,42,0.92)';
      const th = 40 + P(rnd() * 26);
      pxRect(ctx, bx, gy - th, 3, th);
      for (let k = 0; k < 4; k++) {
        const yy = gy - th + 6 + k * 8, d = rnd() < 0.5 ? -1 : 1;
        pxLine(ctx, bx + 1, yy, bx + 1 + d * (7 + P(rnd() * 9)), yy - 6 - P(rnd() * 6));
      }
    }
    ctx.fillStyle = 'rgba(10,14,22,0.72)'; pxRect(ctx, V.x0, gy - 6, V.x1 - V.x0, 6);   // 地平暗带
  }

  // Exterior silhouettes give open shafts and courtyards a readable castle mass
  // while staying behind all collision-driven room surfaces.
  function massingLayer(ctx, M, S, V) {
    for (const m of M.MASSING || []) {
      if (m.x1 < V.x0 || m.x0 > V.x1 || m.kind === 'open') continue;
      const floor = Number(LVY[m.g] || M.Y?.[m.g] || LVY.F1);
      const eave = Number(m.eave);
      if (!Number.isFinite(eave) || floor <= eave + 18) continue;
      const top = Math.max(20, Number(m.top ?? m.ridge ?? eave - 90));
      const a = artOf((m.x0 + m.x1) / 2);
      const body = hsl(a.hue, 17, 18, 0.78);
      const edge = hsl(a.hue, 24, 42, 0.34);
      ctx.save();
      ctx.globalAlpha = 0.76;
      ctx.fillStyle = body;
      pxRect(ctx, m.x0, top, m.x1 - m.x0, floor - top);
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      pxRect(ctx, m.x0, floor - 28, m.x1 - m.x0, 28);
      ctx.fillStyle = edge;
      pxRect(ctx, m.x0, top, m.x1 - m.x0, 2);
      ctx.fillStyle = 'rgba(220,232,255,0.08)';
      pxRect(ctx, m.x0 + 2, top + 3, 2, Math.max(0, floor - top - 6));

      const span = Math.max(1, m.x1 - m.x0);
      const winY = Math.min(floor - 76, top + 76);
      const winH = Math.max(18, Math.min(34, floor - winY - 20));
      for (let x = m.x0 + 34; x < m.x1 - 24; x += Math.max(66, Math.round(span / 6))) {
        ctx.fillStyle = hsl(a.hue + 12, 32, 61, 0.18);
        pxRect(ctx, x, winY, 9, winH);
        ctx.fillStyle = 'rgba(8,12,20,0.55)';
        pxRect(ctx, x + 3, winY + 3, 3, Math.max(8, winH - 6));
      }

      if (m.kind === 'gable') {
        const ridge = Math.max(20, Number(m.ridge ?? top));
        poly(ctx, [[m.x0 - 8, eave], [(m.x0 + m.x1) / 2, ridge], [m.x1 + 8, eave]],
          hsl(a.hue, 18, 16, 0.92), edge, 2, 0.86);
        line(ctx, m.x0, eave, (m.x0 + m.x1) / 2, ridge, edge, 2, 0.72);
        line(ctx, (m.x0 + m.x1) / 2, ridge, m.x1, eave, edge, 2, 0.72);
      } else if (m.kind === 'spire') {
        const apex = Math.max(16, Number(m.top ?? top));
        poly(ctx, [[m.x0 - 12, eave], [m.x0 + (m.x1 - m.x0) * .22, apex + 70], [(m.x0 + m.x1) / 2, apex],
          [m.x1 - (m.x1 - m.x0) * .22, apex + 70], [m.x1 + 12, eave]], hsl(a.hue, 22, 14, 0.95), edge, 2, 0.92);
        line(ctx, (m.x0 + m.x1) / 2, apex, (m.x0 + m.x1) / 2, Math.max(0, apex - 24), edge, 2, .75);
      } else if (m.kind === 'bell') {
        ctx.fillStyle = hsl(a.hue, 22, 14, 0.95);
        poly(ctx, [[m.x0 - 10, eave], [m.x0 + 20, eave - 42], [m.x1 - 20, eave - 42], [m.x1 + 10, eave]],
          hsl(a.hue, 22, 14, 0.95), edge, 2, 0.92);
        for (let x = m.x0 + 28; x < m.x1 - 22; x += 32) pxRect(ctx, x, eave - 34, 8, 18);
      } else if (m.kind === 'crenel') {
        for (let x = m.x0 + 8; x < m.x1 - 12; x += 34) {
          pxRect(ctx, x, eave - 24, 19, 24);
          ctx.fillStyle = 'rgba(0,0,0,0.24)'; pxRect(ctx, x + 16, eave - 24, 3, 24);
        }
      } else if (m.kind === 'broken') {
        const cuts = m.broken || [];
        for (const cut of cuts) {
          ctx.fillStyle = 'rgba(4,7,12,0.82)';
          pxRect(ctx, cut[0], top - 2, cut[1] - cut[0], Math.max(8, eave - top + 6));
          for (let x = cut[0]; x < cut[1]; x += 22) {
            ctx.fillStyle = hsl(a.hue + 8, 18, 28, .45);
            pxRect(ctx, x, eave - 18 - ((x / 22) | 0) % 3 * 5, 14, 4);
          }
        }
      }
      // Buttresses and ivy break up long rectangles without entering the play surface.
      if (m.buttress || m.kind === 'spire' || m.kind === 'gable') {
        for (let x = m.x0 + 18; x < m.x1 - 12; x += 104) {
          poly(ctx, [[x, floor], [x + 12, floor], [x + 9, top + 40], [x + 3, top + 58]], hsl(a.hue, 16, 24, .82), null, 1, .8);
          line(ctx, x + 3, top + 58, x + 8, floor - 4, edge, 1, .34);
        }
      }
      ctx.restore();
    }
  }

  // ---------- 3 区域背墙与建筑语言（全部走 BACK 退后规则） ----------
  function backTone(b) {
    const a = b.art;
    return { hue: a.hue, sat: 7 * STYLE.back.desat + 4, l: (26 + 16 * a.amb) * STYLE.back.lift * (0.6 + b.amb * 0.55) };
  }
  function backWallLayer(ctx, M, S, V) {
    for (const b of S.bands) {
      if (b.open || b.x1 < V.x0 || b.x0 > V.x1) continue;
      const top = b.ceil == null ? b.floor - 156 : b.ceil;
      // 背墙一直铺到「本层楼板底面」：楼梯井把楼板挖掉一段时，那 18px 板厚位置若留空，
      // 井口就会露出一条透明的横缝（2× 放大截图里门洞右侧那条黑带就是这个）。
      const h = b.floor + SLB - top, w = b.x1 - b.x0;
      const t = backTone(b);
      // 背墙 = 深色底 + 40% 石材 + 色调罩层。直接铺 68% 石材会把远墙画得比近处楼板还亮，
      // 剖面图立刻失去「哪一层在前」的次序（第一版截图就是这个毛病）。
      ctx.fillStyle = hsl(t.hue, t.sat * 0.7, 13); pxRect(ctx, b.x0, top, w, h);
      ctx.globalAlpha = 0.40;
      if (isUnder(b.lv)) fillFace(ctx, 'rubble-208', b.x0, top, w, h);
      else fillFace(ctx, b.art.masonry === 'brick' ? 'brick-12' : 'rubble-208', b.x0, top, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hsl(t.hue, t.sat, t.l, 0.52); pxRect(ctx, b.x0, top, w, h);
      ctx.globalAlpha = STYLE.back.alpha;
      // 天花板下压一道（远墙进深）
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxRect(ctx, b.x0, top, w, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; pxRect(ctx, b.x0, top + 6, w, 8);
      ctx.globalAlpha = 1;
      // 头顶带（STYLE.sep.headroomDark）：人物脚底以上 96px 是「背墙正后方」，压暗它才换来
      // 人物轮廓。对比度自检里 23 条不合格全是母体（0.467 亮度的绿皮）撞中灰石墙，
      // 靠这一条把背景从 0.25~0.35 拉到 0.22 以下，而不是去改角色配色。
      ctx.fillStyle = 'rgba(4,7,12,' + (STYLE.sep.headroomDark * 0.42).toFixed(3) + ')'; pxRect(ctx, b.x0, b.floor - 96, w, 32);
      ctx.fillStyle = 'rgba(4,7,12,' + (STYLE.sep.headroomDark * 0.72).toFixed(3) + ')'; pxRect(ctx, b.x0, b.floor - 64, w, 32);
      ctx.fillStyle = 'rgba(4,7,12,' + STYLE.sep.headroomDark.toFixed(3) + ')'; pxRect(ctx, b.x0, b.floor - 32, w, 32 + SLB);
      ctx.fillStyle = 'rgba(0,0,0,0.20)'; pxRect(ctx, b.x0, b.floor - 34, w, 2);   // 墙裙线
      ctx.globalAlpha = STYLE.back.alpha;
      backFeature(ctx, b, t, top, h, w);
      ctx.globalAlpha = 1;
    }
  }
  function backFeature(ctx, b, t, top, h, w) {
    const hue = b.art.hue;
    switch (b.art.id) {
      case 'gate': {
        // 门楼内侧：闸槽（portcullis 槽）+ 二层哨位箭窗
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        pxRect(ctx, b.x0 + 8, top, 4, h); pxRect(ctx, b.x1 - 12, top, 4, h);
        if (b.lv === 'G1') {
          ctx.fillStyle = hsl(hue, 8, t.l * 0.7);
          for (let x = b.x0 + 30; x < b.x1 - 40; x += 46) pxRect(ctx, x, b.floor - 96, 30, 60);
        }
        break;
      }
      case 'banquet': {
        // 护墙板 + 挂毯（低饱和、带挂杆与穗边，密度受 STYLE.dens 约束：间距 150）
        ctx.fillStyle = hsl(hue, 16, t.l * 0.62);
        pxRect(ctx, b.x0 + 6, b.floor - 44, w - 12, 40);
        ctx.fillStyle = 'rgba(255,236,200,0.06)';
        pxRect(ctx, b.x0 + 6, b.floor - 44, w - 12, 2);
        const tw2 = 52, th2 = Math.min(84, h - 62);
        for (let x = b.x0 + 56; x < b.x1 - 70; x += 150) {
          const ty = top + 30;
          ctx.fillStyle = hsl(28, 22, 22); pxRect(ctx, x - 5, ty - 4, tw2 + 10, 4);        // 挂杆
          ctx.fillStyle = hsl(352, 20, 22); pxRect(ctx, x, ty, tw2, th2);            // 毯身：暗红是宴会厅的色彩重点，但明度必须低于压顶亮线
          for (let k = 0; k < 4; k++) {                                                    // 褶：竖向明暗带
            ctx.fillStyle = k % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,232,190,0.05)';
            pxRect(ctx, x + 2 + k * 13, ty, 6, th2);
          }
          ctx.fillStyle = hsl(40, 26, 34); pxRect(ctx, x, ty + th2 - 8, tw2, 3);           // 金线
          for (let k = 0; k < 6; k++) { ctx.fillStyle = hsl(40, 22, 28); pxRect(ctx, x + 3 + k * 9, ty + th2, 3, 5); }
          ctx.fillStyle = hsl(hue, 12, t.l * 0.42); pxRect(ctx, x, ty + th2, tw2, 2);      // 下沿投影
        }
        break;
      }
      case 'chapel': {
        // 连尖拱廊 + 铅条玻璃高窗
        for (let x = b.x0 + 26; x < b.x1 - 60; x += 112) {
          const aw = 74, ah = Math.min(h - 26, 96);
          ctx.fillStyle = 'rgba(8,12,20,0.55)'; pxRect(ctx, x, b.floor - ah, aw, ah);
          ctx.fillStyle = 'rgba(150,180,210,0.16)'; pxArch(ctx, x + aw / 2, b.floor - ah + 10, aw / 2);
          if (TEX.glasslead) fillFace(ctx, 'glasslead', x + 10, b.floor - ah + 12, aw - 20, Math.max(6, ah - 30));
        }
        break;
      }
      case 'library': {
        ctx.fillStyle = hsl(18, 20, t.l * 0.6);
        for (let x = b.x0 + 18; x < b.x1 - 40; x += 62) pxRect(ctx, x, b.floor - Math.min(h - 20, 96), 44, Math.min(h - 20, 96));
        break;
      }
      case 'court': {
        // 内庭：马厩木隔栏 + 饮水槽（贴地，读作地面细节而非障碍）
        ctx.fillStyle = hsl(32, 18, t.l * 0.7);
        pxRect(ctx, b.x0 + 20, b.floor - 40, w - 40, 4);
        pxRect(ctx, b.x0 + 20, b.floor - 22, w - 40, 4);
        for (let x = b.x0 + 20; x < b.x1 - 20; x += 58) pxRect(ctx, x, b.floor - 44, 5, 44);
        break;
      }
      case 'ewing': {
        // 残翼：塌了一半的抹灰，露出砖芯
        const rnd = lcg((b.x0 * 13) >>> 0);
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = hsl(12, 20, 30);
          pxRect(ctx, b.x0 + rnd() * w, top + rnd() * h * 0.6, 26 + rnd() * 40, 16 + rnd() * 26);
        }
        break;
      }
      case 'moat': case 'eastout': {
        // 室外：岩壁层理
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let y = top + 14; y < b.floor; y += 22) pxRect(ctx, b.x0, y, w, 2);
        break;
      }
      default: break;
    }
  }

  // ---------- 4 结构层（楼板 / 墙 / 台阶 / 跳台） ----------
  function matKey(s, b) {
    if (s.mat === 'wood') return 'wood';
    if (s.mat === 'brick') return 'brick-12';
    return b && isUnder(b.lv) ? 'rubble-208' : 'ashlar-34';
  }
  // 5.2 视线切分墩：读的是 M.piers（同一份数据也生成碰撞体），所以画在哪、挡在哪永远一致。
  // 造型语言：柱础+基身+压顶斜面，明显比墙矮一档，一眼能看出「这是个能跳过去的矮墩」而不是门。
  function pierLayer(ctx, M, S, V) {
    for (const p of M.piers || []) {
      const s = (M.solids || []).find(q => q.pier && Math.abs(q.x + q.w / 2 - p.x) < 2 && q.h === p.h);
      if (!s || s.x + s.w < V.x0 || s.x > V.x1) continue;
      const feet = s.y + s.h;
      fillFace(ctx, 'ashlar-34', s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(4,7,12,0.20)'; pxRect(ctx, s.x, s.y, s.w, s.h);                 // 竖面压暗（与墙同规则）
      ctx.fillStyle = 'rgba(0,0,0,0.26)'; pxRect(ctx, s.x + 2, s.y + 12, s.w - 4, 2);        // 横向拉结石
      ctx.fillStyle = 'rgba(214,230,250,0.13)'; pxRect(ctx, s.x, s.y, 1, s.h);               // 受光立边（光在左）
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; pxRect(ctx, s.x + s.w - 1, s.y, 1, s.h);           // 背光立边
      ctx.fillStyle = 'rgba(226,238,255,0.16)'; pxRect(ctx, s.x - 3, s.y - 4, s.w + 6, 4);   // 压顶石出檐
      ctx.fillStyle = 'rgba(0,0,0,0.42)'; pxRect(ctx, s.x - 3, s.y, s.w + 6, 2);             // 出檐下的阴影线
      ctx.fillStyle = 'rgba(198,214,236,0.10)'; pxRect(ctx, s.x - 4, feet - 5, s.w + 8, 5);  // 柱础
      ctx.fillStyle = 'rgba(0,0,0,0.36)'; pxRect(ctx, s.x - 7, feet - 1, s.w + 14, 3);       // 接地阴影
      outline(ctx, s.x - 4, s.y - 4, s.w + 8, s.h + 4, 'rgba(0,0,0,0.5)');
    }
  }
  function deckLayer(ctx, M, S, V) {
    for (const s of M.solids) {
      if (s.stair || s.wall || s.ledge || s.oneway) continue;
      if (s.x + s.w < V.x0 || s.x > V.x1) continue;
      const b = S.byDeck[s.deck];
      const h = s.h, y = s.y;
      // 楼板：上表面是可行走的 → 石材面 + 压顶三笔；下表面是天花板 → 灰泥/梁
      if ((b && isUnder(b.lv)) || h > 60) {
        // 地坪：14px 石板面层（带横向接缝）+ 以下迅速压暗。整块铺石纹会读成「一面墙」，
        // 而地下层必须读成「可以走的地面」。h>60 的填实段（东城外台地）同属地面，
        // 否则那根从 F1 直插世界底的高柱会在缩略图里亮成一块方尖碑。
        ctx.fillStyle = hsl(208, 7, 30); pxRect(ctx, s.x, y + 3, s.w, 13);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        for (let x = s.x + 32; x < s.x + s.w; x += 32) pxRect(ctx, x, y + 4, 1, 12);
        ctx.fillStyle = 'rgba(214,230,250,0.06)'; pxRect(ctx, s.x, y + 3, s.w, 1);
        // 面层以下再给两层砌石（13→22→17 明度），第三层以后才压成近黑：
        // 只有一道亮边 + 立刻全黑，会让地坪读成「悬空的搁板」而不是厚地面。
        ctx.fillStyle = hsl(208, 7, 22); pxRect(ctx, s.x, y + 16, s.w, Math.min(14, Math.max(0, h - 16)));
        ctx.fillStyle = hsl(208, 7, 17); pxRect(ctx, s.x, y + 30, s.w, Math.min(14, Math.max(0, h - 30)));
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        for (let x = s.x + 48; x < s.x + s.w; x += 48) pxRect(ctx, x, y + 17, 1, 12);
        ctx.fillStyle = hsl(208, 8, 12); pxRect(ctx, s.x, y + 44, s.w, Math.max(0, h - 44));
        ctx.fillStyle = 'rgba(0,0,0,0.42)'; pxRect(ctx, s.x, y + Math.min(h, 46), s.w, Math.max(0, h - 46));
        ctx.fillStyle = 'rgba(0,0,0,0.42)'; pxRect(ctx, s.x, y + Math.min(h, 92), s.w, Math.max(0, h - 92));
      } else if (s.mat === 'wood') {
        if (VD) VD.surface(ctx, 'wood', s.x, y, s.w, h, 30, (s.x * 3 + s.y * 7) >>> 0, 1); else fillFace(ctx, 'ashlar-34', s.x, y, s.w, h);
      } else {
        fillFace(ctx, 'ashlar-34', s.x, y, s.w, h);
      }
      faceShade(ctx, s.x, y, s.w, h);
      ctx.fillStyle = 'rgba(4,7,12,0.16)'; pxRect(ctx, s.x, y + STYLE.lipW + 1, s.w, Math.max(0, h - STYLE.lipW - 1));
      // 板底天花板线：让楼板的 18px 厚度被读出来
      ctx.fillStyle = 'rgba(0,0,0,0.42)'; pxRect(ctx, s.x, y + h - 3, s.w, 3);
      ctx.fillStyle = 'rgba(210,226,250,0.07)'; pxRect(ctx, s.x, y + h - 4, s.w, 1);
      walkLip(ctx, s.x, y, s.w);
      // 端头立边：只有真的接空才画（否则长板每块接缝都会出现「假坑沿」，墙体根部也会被画成悬崖）
      const cov = x => M.solids.some(t => !t.oneway &&
        (t.wall ? (x >= t.x - 2 && x <= t.x + t.w + 2 && y >= t.y && y <= t.y + t.h + 2)
          : (t.y === y && x >= t.x - 1 && x <= t.x + t.w + 1)));
      if (!cov(s.x - 2)) { ctx.fillStyle = STYLE.walkLip.hi; pxRect(ctx, s.x, y, 3, 14); }
      if (!cov(s.x + s.w + 2)) { ctx.fillStyle = STYLE.walkLip.hi; pxRect(ctx, s.x + s.w - 3, y, 3, 14); }
      // 木地板的钉列 / 石地坪的排水槽（细节尺度 ≥ STYLE.dens.grainMin）
      if (s.mat === 'wood') { ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let x = s.x + 12; x < s.x + s.w - 6; x += STYLE.dens.grainMin) pxRect(ctx, x, y + 6, 2, 2); }
    }
  }
  function wallLayer(ctx, M, S, V) {
    for (const s of M.solids) {
      if (!s.wall) continue;
      if (s.x + s.w < V.x0 || s.x > V.x1) continue;
      const b = S.byDeck && artOf(s.x);
      fillFace(ctx, s.h > 60 ? 'ashlar-34' : 'rubble-208', s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(4,7,12,0.22)'; pxRect(ctx, s.x, s.y, s.w, s.h);              // 竖面统一压暗一档
      // 剖面：墙体是「被切开的实心」，用横向拉结石 + 内外两侧立边把 20px 厚度讲清楚
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      for (let y = s.y + 14; y < s.y + s.h - 8; y += 26) pxRect(ctx, s.x + 2, y, s.w - 4, 2);
      ctx.fillStyle = 'rgba(214,230,250,0.10)'; pxRect(ctx, s.x, s.y, 1, s.h);
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; pxRect(ctx, s.x + s.w - 1, s.y, 1, s.h);
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxRect(ctx, s.x, s.y + s.h - 3, s.w, 3);
      outline(ctx, s.x, s.y, s.w, s.h, 'rgba(0,0,0,0.45)');
      if (s.lintel) portal(ctx, M, S, s, V);
    }
  }
  // 门楣 + 门洞背后的进深（拱心石、闸门、远端墙面）。门洞里没有任何碰撞体 → 一律 BACK 层
  function portal(ctx, M, S, s, V) {
    const p = S.portals.find(q => q.x === s.x && q.lv === s.lv);
    if (!p) return;
    const oy0 = p.y0, oy1 = p.y1;
    ctx.globalAlpha = STYLE.back.alpha;
    // 洞内进深：只比背墙暗一档，且横向不外溢 —— 外溢会在门两侧的地板上压出一条黑带，
    // 第一版截图里那些「看着像坑」的黑方块就是这么来的。
    ctx.fillStyle = 'rgba(6,9,15,0.40)'; pxRect(ctx, s.x - 12, oy0, s.w + 24, oy1 - oy0);
    const r = Math.min(30, (oy1 - oy0) * 0.30);
    // 拱圈：一整条环带 + 放射状券缝。用 4×4 方块拼弧线在截图里是「一串虚线笑嘴」。
    const acx = s.x + s.w / 2;
    arcStroke(ctx, acx, oy0 + 6, s.w / 2 + 9, r, hsl(34, 8, 30), 7, true);
    arcStroke(ctx, acx, oy0 + 6, s.w / 2 + 9, r, 'rgba(214,230,250,0.13)', 1, true);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
    for (let a = 1; a < 6; a++) {
      const th = Math.PI + (a / 6) * Math.PI, ox = Math.cos(th), oy = Math.sin(th);
      ctx.beginPath();
      ctx.moveTo(acx + ox * (s.w / 2 + 5), oy0 + 6 + oy * (r - 5));
      ctx.lineTo(acx + ox * (s.w / 2 + 13), oy0 + 6 + oy * (r + 5));
      ctx.stroke();
    }
    ctx.fillStyle = hsl(34, 10, 40); pxRect(ctx, acx - 4, oy0 + 6 - r - 4, 8, 7);         // 拱心石
    ctx.fillStyle = 'rgba(0,0,0,0.34)';                   // 门侧壁（洞口的左右两壁）
    pxRect(ctx, s.x - 12, oy0 + 2, 4, oy1 - oy0 - 2); pxRect(ctx, s.x + s.w + 8, oy0 + 2, 4, oy1 - oy0 - 2);
    ctx.fillStyle = 'rgba(214,230,250,0.12)';
    pxRect(ctx, s.x - 12, oy0 + 2, 1, oy1 - oy0 - 4); pxRect(ctx, s.x + s.w + 8, oy0 + 2, 1, oy1 - oy0 - 4);
    // 收起的闸门：只堆在洞口顶上，脚下完全走得通 —— 与碰撞一致
    ctx.fillStyle = hsl(210, 6, 24); pxRect(ctx, s.x - 10, oy0 + 3, s.w + 20, 12);
    ctx.fillStyle = 'rgba(158,176,194,0.45)';
    for (let x = s.x - 8; x < s.x + s.w + 8; x += 7) pxRect(ctx, x, oy0 + 3, 2, 12);
    ctx.globalAlpha = 1;
    // 门楣底面（拱背）压暗，避免和可行走面同明度
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; pxRect(ctx, s.x, s.y + s.h - 4, s.w, 4);
  }
  function stairLayer(ctx, M, S, V) {
    const bySid = {};
    for (const s of M.solids) if (s.stair) (bySid[s.sid] || (bySid[s.sid] = [])).push(s);
    for (const sid in bySid) {
      const arr = bySid[sid].slice().sort((a, b) => a.x - b.x);
      const u = M.stairs.find(v => v.id === sid);
      const floorY = u ? LVY[u.from] : arr[0].y + 200;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (a.x + a.w < V.x0 || a.x > V.x1) continue;
        // 把每级向下延伸到「相邻较低一级的底面」：这一格补上之后，整道楼梯才是一块
        // 实心石梯，而不是几块悬空搁板；延伸区正是楼梯本体占的地方，不侵入梯下拱洞。
        const nb = [arr[i - 1], arr[i + 1]].filter(Boolean).sort((p, q) => q.y - p.y)[0];
        const depth = nb ? Math.max(a.h, Math.min(nb.y + nb.h, floorY) - a.y) : a.h;
        fillFace(ctx, 'ashlar-34', a.x, a.y, a.w, depth);
        ctx.fillStyle = 'rgba(4,7,12,0.22)'; pxRect(ctx, a.x, a.y + 3, a.w, depth - 3);   // 竖面压暗：只有顶面亮
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxRect(ctx, a.x, a.y + depth - 3, a.w, 3);   // 底沿（拱顶线）
        ctx.fillStyle = 'rgba(0,0,0,0.34)'; pxRect(ctx, a.x, a.y, 1, depth);             // 踢面背光
        ctx.fillStyle = 'rgba(214,230,250,0.10)'; pxRect(ctx, a.x + a.w - 1, a.y, 1, depth);
        walkLip(ctx, a.x, a.y, a.w);                                                     // 每级踏面都是落脚面
      }
      if (!u) continue;
      // 梯下拱洞的起拱脚：画在首级两端、拱线以下保持全空（净空 ≥46，人要从这里穿过去）。
      // 这里不画弧线：向下的弧线会悬在通道中间，读起来像吊着的缆绳而不是石拱。
      const base = arr.reduce((m, a) => Math.max(m, a.y), -1e9);
      const bx0 = u.dir > 0 ? arr[0].x : arr[arr.length - 1].x;
      const bx1 = u.dir > 0 ? arr[0].x + arr[0].w : arr[arr.length - 1].x + arr[arr.length - 1].w;
      ctx.fillStyle = hsl(34, 8, 30);
      pxRect(ctx, bx0 - 7, base + 24 - 6, 7, Math.max(6, floorY - base - 18));
      pxRect(ctx, bx1, base + 24 - 6, 7, Math.max(6, floorY - base - 18));
      ctx.fillStyle = 'rgba(214,230,250,0.10)';
      pxRect(ctx, bx0 - 7, base + 24 - 6, 7, 1); pxRect(ctx, bx1, base + 24 - 6, 7, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      pxRect(ctx, bx0, base + 24 - 2, bx1 - bx0, 2);                     // 拱顶阴影：把「头顶有石拱」讲清楚
    }
  }
  // 真正的弧线：用 stroke 而不是「一串 4×3 方块」（方块拼出来的拱在截图里像拉花彩带）
  function arcStroke(ctx, cx, baseY, rx, ry, col, lw, up) {
    ctx.strokeStyle = col; ctx.lineWidth = lw || 3;
    ctx.beginPath();
    if (up) ctx.ellipse(P(cx), P(baseY), P(rx), P(ry), 0, Math.PI, 2 * Math.PI);
    else ctx.ellipse(P(cx), P(baseY), P(rx), P(ry), 0, 0, Math.PI);
    ctx.stroke();
  }
  function ledgeLayer(ctx, M, S, V) {
    for (const s of M.solids) {
      if (!s.oneway) continue;
      if (s.x + s.w < V.x0 || s.x > V.x1) continue;
      const lg = M.ledges.find(l => l.id === s.ledge);
      // 单向薄跳台 = 家具台面（餐桌/长凳/书架/饲料箱）。台面可站 → 亮压顶；支撑画在 BACK 层
      const kind = lg ? lg.id : '';
      ctx.globalAlpha = STYLE.back.alpha;
      ctx.fillStyle = hsl(28, 16, 20);
      const b = S.byDeck[lg ? lg.on : ''];
      const fy = b ? b.floor : s.y + 120;
      for (let x = s.x + 6; x < s.x + s.w - 8; x += 46) pxRect(ctx, x, s.y + s.h, 7, Math.max(6, fy - s.y - s.h));
      pxRect(ctx, s.x + 3, s.y + s.h + 3, s.w - 6, 3);
      ctx.globalAlpha = 1;
      if (s.mat === 'wood' && VD) VD.surface(ctx, 'wood', s.x, s.y, s.w, s.h, 28, (s.x * 5) >>> 0, 0.9);
      else fillFace(ctx, 'rubble-208', s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; pxRect(ctx, s.x, s.y + s.h - 3, s.w, 3);
      // 压顶只画在真能站的那几段；被梁压住的那几段反过来压暗，读成「这里进不去」
      const lr = (S.ledgeRuns || {})[s.ledge] || { ok: [[s.x, s.x + s.w]], bad: [] };
      for (const r0 of lr.ok) walkLip(ctx, r0[0], s.y, r0[1] - r0[0]);
      for (const r0 of lr.bad) {
        ctx.fillStyle = 'rgba(4,7,12,0.45)'; pxRect(ctx, r0[0], s.y, r0[1] - r0[0], 3);
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxRect(ctx, r0[0], s.y - 2, r0[1] - r0[0], 2);
      }
      // 台面上的器物：让「跳台」有存在理由（餐桌摆盘、书架立书、饲料箱溢料）
      if (/table|feed|pew|shelf|statue|read|ammo/i.test(kind)) ledgeWares(ctx, kind, s);
    }
  }
  function ledgeWares(ctx, kind, s) {
    if (/table/.test(kind)) {                          // 长餐桌：器皿 + 面包 + 烛台
      ctx.fillStyle = hsl(40, 12, 78); for (let x = s.x + 8; x < s.x + s.w - 10; x += 26) pxRect(ctx, x, s.y - 3, 9, 3);
      ctx.fillStyle = hsl(30, 34, 46); for (let x = s.x + 20; x < s.x + s.w - 14; x += 34) pxRect(ctx, x, s.y - 5, 12, 5);
      ctx.fillStyle = hsl(44, 40, 62); pxRect(ctx, s.x + s.w / 2 - 2, s.y - 14, 4, 12);
    } else if (/shelf/.test(kind)) {
      ctx.fillStyle = hsl(22, 22, 26); pxRect(ctx, s.x + 2, s.y - 16, s.w - 4, 16);
      const rnd = lcg(s.x >>> 0);
      for (let x = s.x + 5; x < s.x + s.w - 6; x += 5) { ctx.fillStyle = hsl(rnd() * 360, 30, 36 + rnd() * 16); pxRect(ctx, x, s.y - 13, 4, 12); }
    } else if (/pew/.test(kind)) {
      ctx.fillStyle = hsl(28, 20, 24); pxRect(ctx, s.x + 3, s.y - 10, 3, 10); pxRect(ctx, s.x + s.w - 6, s.y - 10, 3, 10);
    } else if (/feed|ammo/.test(kind)) {
      ctx.fillStyle = hsl(38, 30, 44); pxRect(ctx, s.x + 6, s.y - 8, s.w - 12, 8);
      ctx.fillStyle = hsl(44, 34, 58); for (let x = s.x + 8; x < s.x + s.w - 10; x += 7) pxRect(ctx, x, s.y - 10, 3, 3);
    } else if (/statue/.test(kind)) {
      ctx.fillStyle = hsl(40, 6, 44); pxRect(ctx, s.x + s.w / 2 - 11, s.y - 46, 22, 46);
      ctx.fillStyle = hsl(40, 6, 54); pxRect(ctx, s.x + s.w / 2 - 8, s.y - 58, 16, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxRect(ctx, s.x + s.w / 2 + 2, s.y - 56, 5, 54);
    }
    contactShadow(ctx, s.x, s.y + s.h, s.w, false);
  }

  // ---------- 4c 区域施工缝 / 背景护栏 / 桥头（7.2：只补「读得出结构」的笔，一律不进碰撞）----------
  // ① 施工缝：两套砌体在同一根竖线上硬切，读起来像两张图拼接。补一道中性色壁柱 +
  //    两侧各 1px 冷暗缝 + 每 26px 一道砌缝出檐，让它读成「后砌的接缝」。
  function jointLayer(ctx, M, S, V) {
    for (let i = 1; i < ART.length; i++) {
      const x = ART[i].x0, a0 = ART[i - 1], a1 = ART[i];
      if (x < V.x0 - 24 || x > V.x1 + 24) continue;
      for (const L of S.bands) {
        if (L.x1 !== x) continue;
        const R = S.bands.find(b => b.lv === L.lv && b.x0 === x);
        if (!R || R.art.id === L.art.id) continue;
        const y0 = Math.max(h0(L), h0(R)), y1 = L.floor;
        if (y1 - y0 < 24) continue;
        ctx.fillStyle = hsl((a0.hue + a1.hue) / 2, 6, 27); pxRect(ctx, x - 4, y0, 8, y1 - y0);
        ctx.fillStyle = 'rgba(0,0,0,0.40)'; pxRect(ctx, x - 5, y0, 1, y1 - y0); pxRect(ctx, x + 4, y0, 1, y1 - y0);
        ctx.fillStyle = 'rgba(214,230,250,0.06)'; pxRect(ctx, x - 4, y0, 1, y1 - y0);
        for (let y = y0 + 6; y < y1 - 4; y += 26) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; pxRect(ctx, x - 6, y, 12, 2); }
      }
    }
  }
  // ② 背景护栏：只画在背墙平面上、离开可行走前沿 44px 以上。
  //    它只说明「这条走廊外侧有栏杆」，绝不画在真能走过去的边沿上 —— 画在那里等于谎称过不去。
  //    真正阻挡的栏杆必须是碰撞实体、由 wallLayer 画；两者线宽与明度都不是一档，不许混用。
  function railingLayer(ctx, M, S, V) {
    for (const b of S.bands) {
      const d = M.decks.find(x => x.id === b.id);
      if (!d || !d.rail || b.x1 < V.x0 || b.x0 > V.x1) continue;
      const ry = b.floor - 44;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = hsl(b.art.hue, 5, 33);
      pxRect(ctx, b.x0 + 10, ry - 14, b.x1 - b.x0 - 20, 3);
      for (let x = b.x0 + 16; x < b.x1 - 12; x += 34) pxRect(ctx, x, ry - 14, 3, 14);
      ctx.globalAlpha = 1;
    }
  }
  // ③ 桥头：吊桥西端原本直接顶在世界边界（x=0 处没有任何支撑可画，读成断头路）。
  //    桥墩只画在桥面底以下（不侵占可行走面），桥亭退到背层压暗，系缆桩矮到能跨过。
  function sceneBridge(ctx, M, S, V) {
    const deck = (M.decks || []).find(d => d.abutment === 'pier');
    const br = deck && M.solids.find(s => s.deck === deck.id);
    if (!br || V.x0 > 120) return;
    const w = 34, top = br.y + br.h, bot = LVY.B1;
    ctx.fillStyle = hsl(208, 7, 28); pxRect(ctx, 0, top, w, bot - top);
    fillFace(ctx, 'rubble-208', 0, top, w, bot - top);
    ctx.fillStyle = 'rgba(4,7,12,0.34)'; pxRect(ctx, 0, top, w, bot - top);
    ctx.fillStyle = 'rgba(6,10,18,0.85)'; pxRect(ctx, 6, top + 26, 22, bot - top - 26);   // 桥墩拱洞
    pxArch(ctx, 17, top + 28, 11);
    ctx.fillStyle = 'rgba(214,230,250,0.07)'; pxRect(ctx, 0, top, w, 1);
    ctx.globalAlpha = STYLE.back.alpha;                                                    // 桥亭：背层，不挡行走
    ctx.fillStyle = hsl(208, 7, 30); pxRect(ctx, 0, br.y - 52, 26, 52);
    ctx.fillStyle = hsl(208, 6, 24); pxRect(ctx, 0, br.y - 56, 30, 5);
    ctx.fillStyle = 'rgba(8,12,20,0.6)'; pxRect(ctx, 8, br.y - 40, 12, 26);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hsl(28, 14, 24); pxRect(ctx, 40, br.y - 12, 6, 12);                     // 系缆桩（12 高，跨过即可）
    ctx.fillStyle = hsl(28, 12, 32); pxRect(ctx, 39, br.y - 14, 8, 3);
  }

  // ---------- 5 家具器物与区域识别（阶段一只做三个样板点的完整度，其余区域留基线） ----------
  function propLayer(ctx, M, S, V, cam) {
    sceneGate(ctx, M, S, V);
    sceneBanquet(ctx, M, S, V);
    sceneCells(ctx, M, S, V);
    sceneOutlet(ctx, M, S, V);
    for (const r of S.ribs) if (r.b.x1 > V.x0 && r.b.x0 < V.x1) ribFeature(ctx, r);
    for (const m of S.merlons) if (m.x + m.w > V.x0 && m.x < V.x1) merlon(ctx, m);
    for (const bn of S.banners) if (Math.abs(bn.x - (V.x0 + V.x1) / 2) < 620) banner(ctx, bn);
  }
  function ribFeature(ctx, r) {
    const b = r.b, top = b.ceil == null ? b.floor - 156 : b.ceil;
    ctx.globalAlpha = STYLE.back.alpha;
    if (r.k === 'vault') {
      for (let x = b.x0 + 60; x < b.x1 - 40; x += 150) {
        // 肋拱：4px 的石肋 + 拱顶合龙石。1px 细线在 2× 下读成挂在墙上的电线。
        ctx.strokeStyle = hsl(b.art.hue, 8, 32); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 56, b.floor - 26); ctx.quadraticCurveTo(x, top + 8, x + 56, b.floor - 26); ctx.stroke();
        ctx.strokeStyle = 'rgba(214,230,250,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 56, b.floor - 27); ctx.quadraticCurveTo(x, top + 7, x + 56, b.floor - 27); ctx.stroke();
        ctx.fillStyle = hsl(b.art.hue, 8, 38); pxRect(ctx, x - 6, top + 2, 12, 12);
        ctx.fillStyle = hsl(b.art.hue, 8, 34); pxRect(ctx, x - 62, b.floor - 30, 12, 12);   // 拱脚托石
        pxRect(ctx, x + 50, b.floor - 30, 12, 12);
      }
    } else if (r.k === 'truss') {
      // 锤梁屋顶：只占房间上部三分之一，立柱不穿过行走空间（否则读成栅栏）
      const wy = top + 46, ty = top + Math.min(64, h0(b) * 0.42);
      ctx.fillStyle = hsl(28, 20, 20);
      pxRect(ctx, b.x0 + 8, top + 12, b.x1 - b.x0 - 16, 9);                 // 屋脊梁
      pxRect(ctx, b.x0 + 8, ty, b.x1 - b.x0 - 16, 8);                        // 拉梁
      for (let x = b.x0 + 34; x < b.x1 - 30; x += 108) {
        pxRect(ctx, x, wy - 30, 9, 38);                                      // 锤梁 + 托木
        pxRect(ctx, x - 9, wy - 4, 27, 5);
        ctx.strokeStyle = hsl(28, 18, 26); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 4, ty); ctx.lineTo(x + 4, wy - 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 8, wy - 2); ctx.lineTo(x - 30, ty + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 16, wy - 2); ctx.lineTo(x + 38, ty + 8); ctx.stroke();
      }
    } else if (r.k === 'slit') {
      ctx.fillStyle = 'rgba(8,12,20,0.85)';
      for (let x = b.x0 + 40; x < b.x1 - 30; x += 64) pxRect(ctx, x, top + 34, 7, 40);
    } else if (r.k === 'arcade') {
      const h = h0(b);
      for (let x = b.x0 + 20; x < b.x1 - 60; x += 118) {
        const aw = 96, ah = Math.min(h - 24, 104);
        ctx.fillStyle = 'rgba(8,12,20,0.50)'; pxRect(ctx, x + 12, b.floor - ah, aw, ah);
        ctx.fillStyle = hsl(b.art.hue, 9, 34); pxRect(ctx, x, b.floor - ah, 12, ah);
        pxCircle(ctx, x + 6, b.floor - ah - 5, 8);                            // 柱头
        pxRect(ctx, x - 3, b.floor - 8, 18, 8);                              // 柱础
        arcStroke(ctx, x + 12 + aw / 2, b.floor - ah, aw / 2 + 6, 26, hsl(b.art.hue, 9, 38), 5, true);
        ctx.fillStyle = hsl(b.art.hue, 8, 30); pxRect(ctx, x + 12 + aw / 2 - 5, b.floor - ah - 30, 10, 8);  // 拱心石
      }
      if (r.carries) {
        const ah = Math.min(h0(b) - 24, 104);                          // 起拱线（上面循环里的同名变量在这里已出作用域）
        // ① 拱脚往下：一道连续墙基（stylobate）把所有柱脚串成同一条基础，
        //    否则每个柱础各自坐在地面上，读不出「整排拱共同托住上面那块板」。
        const bh = 10;
        ctx.fillStyle = hsl(b.art.hue, 7, 27); pxRect(ctx, b.x0 + 6, b.floor - bh, b.x1 - b.x0 - 12, bh);
        ctx.fillStyle = 'rgba(214,230,250,0.07)'; pxRect(ctx, b.x0 + 6, b.floor - bh, b.x1 - b.x0 - 12, 1);
        for (let x = b.x0 + 6; x < b.x1 - 10; x += 40) { ctx.fillStyle = 'rgba(0,0,0,0.26)'; pxRect(ctx, x, b.floor - bh, 1, bh); }
        // ② 拱肩往上：每个柱头接一段短砌体顶到被托楼板的底，把竖向传力画断在板底而不是消失在背墙里。
        //    只画 16px 宽的墩段，不画整片墙 —— 规则 7：无碰撞装饰不许抢前景体块的读法，
        //    玩家必须能一眼看出这不是可以躲的柱子（它挡不住子弹，也不该看起来像能挡）。
        if (b.ceil != null) {
          const top = b.ceil, y0 = b.floor - ah - 5;
          for (let x = b.x0 + 20; x < b.x1 - 60; x += 118) {
            ctx.fillStyle = hsl(b.art.hue, 7, 29); pxRect(ctx, x - 2, top, 16, y0 - top);
            ctx.fillStyle = 'rgba(0,0,0,0.24)'; pxRect(ctx, x + 13, top, 1, y0 - top);
            ctx.fillStyle = hsl(b.art.hue, 8, 33); pxRect(ctx, x - 5, y0 - 4, 22, 4);      // 檐口/ impost 线脚
          }
          ctx.fillStyle = hsl(b.art.hue, 8, 31); pxRect(ctx, b.x0 + 8, y0 - 8, b.x1 - b.x0 - 16, 4);
        }
      }
    } else if (r.k === 'cells') {
      // 牢房：贴背墙的铁栅（远侧），不落在通道上 → 不构成障碍
      for (let x = b.x0 + 24; x < b.x1 - 30; x += 132) {
        ctx.fillStyle = 'rgba(10,14,20,0.55)'; pxRect(ctx, x, b.floor - 92, 104, 92);
        ctx.fillStyle = hsl(210, 6, 24);
        for (let k = 0; k < 6; k++) pxRect(ctx, x + 8 + k * 17, b.floor - 92, 3, 92);
        pxRect(ctx, x, b.floor - 92, 104, 4); pxRect(ctx, x, b.floor - 4, 104, 4);
        ctx.fillStyle = 'rgba(200,214,232,0.10)';
        for (let k = 0; k < 6; k++) pxRect(ctx, x + 8 + k * 17, b.floor - 90, 1, 88);
        ctx.fillStyle = hsl(40, 22, 30); pxRect(ctx, x + 14, b.floor - 12, 34, 10);   // 草垫
      }
    }
    ctx.globalAlpha = 1;
  }
  const h0 = b => b.floor - (b.ceil == null ? b.floor - 156 : b.ceil);
  function merlon(ctx, m) {
    ctx.globalAlpha = STYLE.back.alpha;                    // 女墙在墙道另一侧 → 背景层
    ctx.fillStyle = hsl(34, 8, 32); pxRect(ctx, m.x, m.y, m.w, m.h);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxRect(ctx, m.x, m.y + m.h - 3, m.w, 3);
    ctx.fillStyle = 'rgba(214,230,250,0.08)'; pxRect(ctx, m.x, m.y, m.w, 1);
    ctx.globalAlpha = 1;
  }
  function banner(ctx, bn) {
    // 挂毯/旗：暗红底 + 一道金线。之前画了三道亮金横条，缩看像挂在墙上的梯子。
    const hue = 352;
    ctx.fillStyle = hsl(hue, 22, 22); pxRect(ctx, bn.x - 14, bn.y, 28, 62);
    ctx.fillStyle = hsl(28, 20, 22); pxRect(ctx, bn.x - 17, bn.y - 3, 34, 4);            // 挂杆
    ctx.fillStyle = 'rgba(226,196,120,0.20)'; pxRect(ctx, bn.x - 9, bn.y + 26, 18, 2);   // 徽记金线
    ctx.fillStyle = hsl(hue, 18, 16);
    for (let k = 0; k < 4; k++) pxRect(ctx, bn.x - 12 + k * 7, bn.y + 62, 4, 7);         // 穗
    ctx.fillStyle = 'rgba(0,0,0,0.26)'; pxRect(ctx, bn.x + 8, bn.y, 6, 62);              // 右侧背光褶
  }

  // ---------- 样板点一：室外城门 + 吊桥 + 护城河 ----------
  function sceneGate(ctx, M, S, V) {
    if (V.x1 < -20 || V.x0 > 800) return;
    // 护城河水面（B1 地坪之上的一层浅水：能站、但视觉上明显低于可行走压顶）
    const wy = LVY.B1;
    if (wy > V.y0 && wy < V.y1) {
      ctx.fillStyle = 'rgba(22,46,64,0.78)'; pxRect(ctx, 0, wy, 430, 26);
      ctx.fillStyle = 'rgba(70,140,168,0.22)';
      const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 900;
      for (let x = 4; x < 426; x += 26) pxRect(ctx, x, wy + 4 + Math.round(Math.sin(t + x * 0.11) * 1.5), 14, 2);
      ctx.fillStyle = 'rgba(150,200,220,0.16)'; pxRect(ctx, 0, wy, 430, 1);
    }
    // 吊桥（f1_bridge：木楼板）上的桥结构：铁箍 + 悬链 + 铰轴
    const br = M.deckById.f1_bridge;
    if (br) {
      ctx.fillStyle = hsl(210, 8, 26);
      for (let x = br.x0 + 26; x < br.x1; x += 78) pxRect(ctx, x, LVY.F1, 10, SLB);
      ctx.globalAlpha = STYLE.back.alpha;
      ctx.strokeStyle = hsl(30, 14, 26); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(br.x1 - 8, LVY.F1 - 96); ctx.lineTo(120, LVY.F1 - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(br.x1 - 8, LVY.F1 - 96); ctx.lineTo(300, LVY.F1 - 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = hsl(210, 10, 34); pxRect(ctx, br.x1 - 16, LVY.F1 - 10, 12, 10);   // 铰轴
    }
    // 外侧城墙立面（x=430 那道墙的「外侧面」）：毛石基 + 券门 + 箭窗
    const gw = M.solids.filter(s => s.wall && s.x >= 424 && s.x <= 452 && s.lv === 'G1');
    for (const s of gw) {
      fillFace(ctx, 'ashlar-34', s.x - 22, s.y, 22, s.h);
      ctx.fillStyle = 'rgba(0,0,0,0.26)'; pxRect(ctx, s.x - 22, s.y, 22, s.h);
      ctx.fillStyle = 'rgba(214,230,250,0.06)'; pxRect(ctx, s.x - 22, s.y, 1, s.h);
      for (let y = s.y + 20; y < s.y + s.h - 10; y += 30) { ctx.fillStyle = 'rgba(0,0,0,0.24)'; pxRect(ctx, s.x - 20, y, 18, 2); }
    }
    // 城门券脸：拱的跨度必须落在两侧壁柱上（406~474），否则半张拱悬在护城河空气里，
    // 违反「拱门须有可信支撑」。
    const p = S.portals.find(q => q.lv === 'G1' && q.x >= 424 && q.x <= 452);
    if (p) {
      const cx = p.x + p.w / 2, rx = 34, ry = Math.min(26, (p.y1 - p.y0) * 0.24);
      arcStroke(ctx, cx, p.y0 + 8, rx, ry, hsl(34, 10, 44), 11, true);            // 券脸环带（整条，不是点）
      arcStroke(ctx, cx, p.y0 + 8, rx, ry, 'rgba(214,230,250,0.16)', 1, true);    // 外缘受光
      ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1;
      for (let a = 1; a < 8; a++) {                                               // 券石接缝沿半径放射
        const th = Math.PI + (a / 8) * Math.PI, ox = Math.cos(th), oy = Math.sin(th);
        ctx.beginPath();
        ctx.moveTo(cx + ox * (rx - 6), p.y0 + 8 + oy * (ry - 6));
        ctx.lineTo(cx + ox * (rx + 6), p.y0 + 8 + oy * (ry + 6));
        ctx.stroke();
      }
      ctx.fillStyle = hsl(34, 12, 52); pxRect(ctx, cx - 8, p.y0 + 8 - ry - 6, 16, 13);   // 拱心石
      ctx.fillStyle = 'rgba(214,230,250,0.16)'; pxRect(ctx, cx - 8, p.y0 + 8 - ry - 6, 16, 1);
      ctx.fillStyle = hsl(34, 8, 30);                                             // 两侧券脚（拱必须落在东西上）
      pxRect(ctx, cx - rx - 8, p.y0 + 2, 16, 26); pxRect(ctx, cx + rx - 8, p.y0 + 2, 16, 26);
    }
    // 门侧壁柱
    ctx.fillStyle = hsl(34, 8, 38); pxRect(ctx, 408, LVY.F1 - 128, 10, 128); pxRect(ctx, 462, LVY.F1 - 128, 10, 128);
    ctx.fillStyle = hsl(34, 8, 46); pxRect(ctx, 406, LVY.F1 - 134, 14, 8); pxRect(ctx, 460, LVY.F1 - 134, 14, 8);
  }

  // ---------- 样板点二：宴会厅一角 ----------
  function sceneBanquet(ctx, M, S, V) {
    if (V.x1 < 2300 || V.x0 > 2900) return;
    const fy = LVY.F1;
    // 壁炉：烟囱凸出背墙，炉膛口是黑的（能看过去、不能走 —— 它在背墙平面上）
    const hx = 2600;
    ctx.globalAlpha = STYLE.back.alpha;
    fillFace(ctx, 'ashlar-34', hx - 34, fy - 150, 68, 150);
    ctx.fillStyle = 'rgba(8,10,16,0.85)'; pxRect(ctx, hx - 22, fy - 58, 44, 58);
    ctx.fillStyle = hsl(34, 8, 50); pxRect(ctx, hx - 38, fy - 158, 76, 12);             // 壁炉台
    ctx.globalAlpha = 1;
    const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 240;
    for (let i = 0; i < 5; i++) {
      const fx = hx - 14 + i * 7, fh = 10 + Math.abs(Math.sin(t + i)) * 12;
      ctx.fillStyle = i % 2 ? 'rgba(255,168,66,0.55)' : 'rgba(255,214,120,0.50)';
      pxRect(ctx, fx, fy - fh, 5, fh);
    }
    // 条凳（贴地、可穿过：BACK 层 + 明确投影）
    ctx.globalAlpha = STYLE.back.alpha;
    for (const bx of [2360, 2470, 2560, 2700]) {
      ctx.fillStyle = hsl(28, 18, 26); pxRect(ctx, bx, fy - 20, 74, 7); pxRect(ctx, bx + 5, fy - 13, 6, 13); pxRect(ctx, bx + 62, fy - 13, 6, 13);
    }
    ctx.globalAlpha = 1;
    // 宴会厅 F1 用地砖分区（与守卫大厅的石地坪拉开识别度）
    ctx.globalAlpha = 0.5;
    for (let x = 2324; x < 2876; x += 32) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; pxRect(ctx, x, fy + 4, 1, 8); }
    for (let x = 2340; x < 2876; x += 32) { ctx.fillStyle = 'rgba(214,226,240,0.06)'; pxRect(ctx, x, fy + 1, 16, 1); }
    ctx.globalAlpha = 1;
  }

  // ---------- 样板点三：地下牢房一角 ----------
  function sceneCells(ctx, M, S, V) {
    if (V.x1 < 740 || V.x0 > 1640) return;
    const fy = LVY.B1, ceil = LVY.F1 + SLB;
    // 交叉肋拱：起拱点在人的头顶以上（≥110px），拱向上顶到天花板，不与可行走面争读
    ctx.globalAlpha = STYLE.back.alpha;
    for (let x = 800; x < 1600; x += 148) {
      arcStroke(ctx, x, fy - 22, 68, (fy - 22) - (ceil + 12), hsl(208, 8, 36), 3, true);
      arcStroke(ctx, x, ceil + 14, 68, ((fy - 40) - (ceil + 14)) * 0.5, 'rgba(0,0,0,0.34)', 2, false);
      ctx.fillStyle = hsl(208, 8, 40); pxRect(ctx, x - 5, ceil + 6, 10, 10);
      ctx.fillStyle = hsl(208, 8, 34); pxRect(ctx, x - 7, fy - 30, 14, 10);            // 拱脚托木
    }
    ctx.globalAlpha = 1;
    // 墙脚排水沟：在可行走压顶内侧的一道暗槽，读作地面细节而不是坑
    ctx.fillStyle = 'rgba(0,0,0,0.34)'; pxRect(ctx, 762, fy + 9, 856, 3);
    ctx.fillStyle = 'rgba(214,230,250,0.05)'; pxRect(ctx, 762, fy + 8, 856, 1);
    // 水渍 / 潮痕：确定性斜向条带，密度按 STYLE.dens 上限
    ctx.globalAlpha = 0.34;
    for (let x = 770; x < 1600; x += 96) {
      const r = lcg(x >>> 0), hgt = 30 + r() * 60;
      ctx.fillStyle = 'rgba(24,44,52,0.7)'; pxRect(ctx, x, fy - hgt, 26, hgt);
      ctx.fillStyle = 'rgba(88,124,116,0.35)'; pxRect(ctx, x, fy - hgt, 26, 3);
    }
    ctx.globalAlpha = 1;
    // 刑具与杂物（贴背墙，全部 BACK 层）
    ctx.globalAlpha = STYLE.back.alpha;
    for (const ix of [900, 1240, 1480]) {
      ctx.fillStyle = hsl(28, 20, 24); pxRect(ctx, ix, fy - 46, 22, 46); pxRect(ctx, ix + 3, fy - 52, 16, 8);
      ctx.fillStyle = hsl(210, 6, 30); pxRect(ctx, ix + 6, fy - 40, 10, 26);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 样板点四：排水道水门（7.2 把 b1_outlet 从填土里放出来之后，东端要读得出「水从这里出城」）----------
  function sceneOutlet(ctx, M, S, V) {
    const b = S.byDeck['b1_outlet'];
    if (!b || V.x1 < b.x0 - 80 || V.x0 > b.x1 + 80) return;
    // 走廊东端被哪块实体堵死，水门就开在那块实体的西立面上 —— 读数据，不把坐标写死在绘制里
    const cap = M.solids.filter(s => !s.oneway && s.y < b.floor && s.y + s.h > b.floor + 40 &&
      s.x >= b.x0 - 20 && s.x <= b.x1 + 20).sort((p, q) => q.x - p.x)[0];
    if (!cap) return;
    const mx = cap.x, mw = 26, mh = 46, my = b.floor - mh;              // 洞口贴地、比人矮：一看就是「钻出去」的口
    ctx.globalAlpha = STYLE.back.alpha;
    ctx.fillStyle = hsl(208, 7, 34);                                     // 门柱 + 顶部过梁（明度低于可行走压顶）
    pxRect(ctx, mx - mw - 7, my - 10, 7, mh + 10); pxRect(ctx, mx, my - 10, 7, mh + 10);
    pxRect(ctx, mx - mw - 7, my - 16, mw + 14, 6);
    ctx.fillStyle = hsl(208, 7, 40); pxRect(ctx, mx - mw / 2 - 6, my - 22, 12, 8);       // 合龙石
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(3,6,11,0.94)'; pxRect(ctx, mx - mw, my, mw, mh);               // 洞内：越深越黑
    pxArch(ctx, mx - mw / 2, my + 2, mw / 2);
    ctx.fillStyle = 'rgba(126,140,156,0.55)';                                            // 铁栅在洞的最外侧
    for (let i = 0; i < 4; i++) pxRect(ctx, mx - mw + 4 + i * 6, my - 6, 2, mh + 6);
    pxRect(ctx, mx - mw + 2, my + 14, mw - 2, 2);
    ctx.fillStyle = 'rgba(18,34,44,0.72)'; pxRect(ctx, b.x0 + 12, b.floor - 4, mx - b.x0 - 12, 4);
    ctx.fillStyle = 'rgba(96,146,164,0.20)';
    for (let x = b.x0 + 26; x < mx - 8; x += 34) pxRect(ctx, x, b.floor - 3, 12, 1);      // 波纹只用 1px 长划
    ctx.fillStyle = 'rgba(24,44,56,0.6)'; pxEllipse(ctx, mx - mw / 2, b.floor - 2, 22, 4);
    for (let i = 0; i < 3; i++) {                                                         // 外面进来的冷光：向西渐弱
      ctx.fillStyle = 'rgba(150,196,220,' + (0.09 - i * 0.026).toFixed(3) + ')';
      pxRect(ctx, mx - mw - 22 - i * 26, b.floor - 30 - i * 8, 26, 30 + i * 8);
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(52,84,66,0.7)'; pxRect(ctx, mx - mw - 7, b.floor - 12, 7, 12);   // 门柱苔痕与水蚀
    ctx.fillStyle = 'rgba(30,52,44,0.7)'; pxRect(ctx, mx, b.floor - 9, 7, 9);
    ctx.globalAlpha = 1;
  }

  // decor 跳台 = 纯建筑构件（没有碰撞、不进导航）。按「卡在屋架下的草料阁」画：
  // 关键是不画 walkLip 那三笔 —— 规则 4 说压顶亮线只允许出现在真有落脚碰撞的面上，
  // 画了就等于向玩家承诺「这能站」，而它恰恰不能站（这就是 7.1 查出来的假跳台）。
  function loftLayer(ctx, M, S, V) {
    for (const lg of (M.ledges || [])) {
      if (!lg.decor || lg.x1 < V.x0 || lg.x0 > V.x1) continue;
      const b = S.byDeck[lg.on], fy = lg.y, x0 = lg.x0, x1 = lg.x1, w = x1 - x0;
      const foot = b && isRoof(b.lv) ? LVY.F2 : fy + 120;                 // 立柱落到下面那层的楼板上
      ctx.globalAlpha = STYLE.back.alpha;
      ctx.fillStyle = hsl(28, 17, 21); pxRect(ctx, x0, fy, w, 12);          // 阁板
      ctx.fillStyle = hsl(28, 15, 15); pxRect(ctx, x0 + 3, fy + 12, w - 6, 5);   // 板底横梁
      for (let x = x0 + 7; x < x1 - 6; x += 21) { ctx.fillStyle = 'rgba(0,0,0,0.34)'; pxRect(ctx, x, fy + 1, 1, 11); }
      ctx.fillStyle = hsl(28, 16, 18);                                      // 两根立柱：托住阁板
      pxRect(ctx, x0 + 8, fy + 17, 6, foot - fy - 17); pxRect(ctx, x1 - 14, fy + 17, 6, foot - fy - 17);
      ctx.fillStyle = hsl(28, 14, 24);                                      // 柱头斜托
      pxRect(ctx, x0 + 4, fy + 14, 14, 4); pxRect(ctx, x1 - 18, fy + 14, 14, 4);
      ctx.fillStyle = hsl(42, 26, 34);                                      // 草料：堆在阁板上，高出板面
      for (let i = 0; i < 5; i++) pxRect(ctx, x0 + 6 + i * ((w - 16) / 5 | 0), fy - 4 - (i % 2) * 3, ((w - 14) / 5 | 0), 5 + (i % 2) * 3);
      ctx.fillStyle = 'rgba(214,196,132,0.22)';
      for (let x = x0 + 8; x < x1 - 8; x += 13) pxRect(ctx, x, fy - 8, 6, 1);
      ctx.fillStyle = hsl(28, 15, 19);                                      // 挡料栏（不是护栏：细、暗、无压顶）
      pxRect(ctx, x0 + 2, fy - 14, w - 4, 3);
      for (let x = x0 + 6; x < x1 - 4; x += 26) pxRect(ctx, x, fy - 14, 3, 14);
      ctx.globalAlpha = 1;
      contactShadow(ctx, x0 + 8, foot, 6, false); contactShadow(ctx, x1 - 14, foot, 6, false);
    }
  }

  // ---------- 6 光：火把光池（画在结构之前，保证压顶亮线不被冲淡）+ 火焰本体 ----------
  function lightLayer(ctx, S, V) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of S.torches) {
      if (t.x < V.x0 - 130 || t.x > V.x1 + 130 || !t.lit) continue;
      const g = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 96);
      const c = t.warm ? '255,196,120' : '150,224,190';
      g.addColorStop(0, 'rgba(' + c + ',0.22)'); g.addColorStop(0.5, 'rgba(' + c + ',0.08)'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; pxRect(ctx, t.x - 96, t.y - 96, 192, 192);
    }
    ctx.restore();
  }
  function flameLayer(ctx, S, V) {
    const t = (typeof performance !== 'undefined' ? performance.now() : 0);
    for (const k of S.torches) {
      if (k.x < V.x0 - 20 || k.x > V.x1 + 20) continue;
      ctx.fillStyle = hsl(28, 14, 24); pxRect(ctx, k.x - 2, k.y, 4, 12);           // 铁支架
      ctx.fillStyle = hsl(210, 6, 34); pxRect(ctx, k.x - 5, k.y - 4, 10, 5);
      if (!k.lit) { ctx.fillStyle = 'rgba(60,66,74,0.6)'; pxRect(ctx, k.x - 3, k.y - 8, 6, 4); continue; }
      const f = Math.abs(Math.sin(t / 190 + k.x)), h2 = 9 + f * 7;
      ctx.fillStyle = k.warm ? 'rgba(255,176,72,0.75)' : 'rgba(120,236,196,0.70)';
      pxRect(ctx, k.x - 3, k.y - 5 - h2, 6, h2);
      ctx.fillStyle = 'rgba(255,238,180,0.85)'; pxRect(ctx, k.x - 1, k.y - 4 - h2 * 0.6, 3, h2 * 0.6);
    }
  }
  // 浮尘：世界坐标相位固定，只有 y 随时间极缓下沉（不逐帧重采样 → 不闪）
  function dustLayer(ctx, V) {
    const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    const rnd = lcg(31337);
    ctx.fillStyle = 'rgba(226,236,255,0.13)';
    for (let i = 0; i < 90; i++) {
      const wx = P(rnd() * 5600), ph = rnd();
      if (wx < V.x0 || wx > V.x1) continue;
      const wy = P(120 + ((ph * 620 + t * (6 + ph * 9)) % 620));
      pxRect(ctx, wx + P(Math.sin(t * 0.6 + i) * 4), wy, 1, 1);
    }
  }

  // ---------- 7 剖面边缘（世界左右边界 + 独立预览页的暗角） ----------
  function gradeLayer(ctx, M, V, screen) {
    ctx.fillStyle = 'rgba(6,9,16,0.55)';
    pxRect(ctx, -26, 0, 26, M.world.h); pxRect(ctx, M.world.w, 0, 26, M.world.h);
    if (!screen) return;
    const band = 5, depth = 74, max = 0.26, rows = Math.ceil(depth / band);
    for (let i = 0; i < rows; i++) {
      const a = (max * (1 - i / rows)).toFixed(3);
      ctx.fillStyle = 'rgba(8,6,14,' + a + ')';
      pxRect(ctx, V.x0, i * band, V.x1 - V.x0, band);
      pxRect(ctx, V.x0, M.world.h - (i + 1) * band, V.x1 - V.x0, band);
    }
  }

  // ---------- 主流程 ----------
  function layers(ctx, M, cam, V, o) {
    syncLevels(M);
    const S = scene(M);
    const amb = o.amb === undefined ? 1 : o.amb;
    skyLayer(ctx, M, V, amb);
    farLayer(ctx, M, V, cam);
    massingLayer(ctx, M, S, V);
    backWallLayer(ctx, M, S, V);
    lightLayer(ctx, S, V);
    deckLayer(ctx, M, S, V);
    wallLayer(ctx, M, S, V);
    pierLayer(ctx, M, S, V);
    stairLayer(ctx, M, S, V);
    ledgeLayer(ctx, M, S, V);
    loftLayer(ctx, M, S, V);
    jointLayer(ctx, M, S, V);
    railingLayer(ctx, M, S, V);
    sceneBridge(ctx, M, S, V);
    propLayer(ctx, M, S, V, cam);
    flameLayer(ctx, S, V);
    dustLayer(ctx, V);
    gradeLayer(ctx, M, V, o.screen);
  }
  function viewOf(cam, o) {
    const vw = o.vw || 960, vh = o.vh || 540;
    return { x0: cam.x - 40, x1: cam.x + vw + 40, y0: cam.y - 40, y1: cam.y + vh + 40 };
  }
  function renderWorld(ctx, M, cam, o) {
    o = o || {};
    ctx.save();
    ctx.translate(-P(cam.x), -P(cam.y));
    layers(ctx, M, cam, viewOf(cam, o), o);
    ctx.restore();
  }
  function render(ctx, M, o) {
    o = Object.assign({ cam: { x: 0, y: 0 } }, o || {}, { screen: true });
    ctx.save();
    ctx.translate(-P(o.cam.x), -P(o.cam.y));
    layers(ctx, M, o.cam, viewOf(o.cam, o), o);
    ctx.restore();
  }

  // ---------- 调试叠加（只有 ?bioDebug=1 走到这里，正式画面不出现） ----------
  function overlay(ctx, M, cam) {
    ctx.strokeStyle = 'rgba(80,200,255,0.30)';
    for (const e of M.edges) {
      const a = M.nodes[e.a], b = M.nodes[e.b];
      if (Math.abs(a.x - cam.x - 480) > 900 || Math.abs(b.x - cam.x - 480) > 900) continue;
      ctx.strokeStyle = e.type === 'drop' ? 'rgba(255,120,80,0.5)' : e.type === 'jumpUp' ? 'rgba(255,220,90,0.5)' :
        e.type === 'gapJump' ? 'rgba(200,120,255,0.5)' : 'rgba(80,200,255,0.30)';
      ctx.beginPath(); ctx.moveTo(a.x - cam.x, a.y - cam.y); ctx.lineTo(b.x - cam.x, b.y - cam.y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,220,255,0.9)';
    for (const n of M.nodes) { if (Math.abs(n.x - cam.x - 480) > 520) continue; ctx.fillRect(n.x - cam.x - 1.5, n.y - cam.y - 1.5, 3, 3); }
    ctx.font = '10px monospace';
    for (const p of M.humanSpawns) {
      if (Math.abs(p.x - cam.x - 480) > 520) continue;
      ctx.fillStyle = '#57d0ff'; ctx.fillRect(p.x - cam.x - 5, p.y - cam.y - 40, 10, 40);
      ctx.fillText(p.id, p.x - cam.x - 6, p.y - cam.y - 44);
    }
    for (const p of M.zombieSpawns) {
      if (Math.abs(p.x - cam.x - 480) > 520) continue;
      ctx.fillStyle = '#ff5b5b'; ctx.fillRect(p.x - cam.x - 5, p.y - cam.y - 40, 10, 40);
      ctx.fillText(p.id, p.x - cam.x - 6, p.y - cam.y - 44);
    }
    for (const p of M.supplies) {
      if (Math.abs(p.x - cam.x - 480) > 520) continue;
      ctx.fillStyle = p.kind === 'medic' ? '#7dff9b' : '#ffd75e';
      ctx.fillRect(p.x - cam.x - 7, p.y - cam.y - 16, 14, 16);
      ctx.fillStyle = '#0b0f14'; ctx.fillText(p.kind[0].toUpperCase(), p.x - cam.x - 3, p.y - cam.y - 4);
    }
    ctx.fillStyle = 'rgba(200,220,255,0.5)'; ctx.font = '11px monospace';
    for (const r of M.regions) {
      const cxp = (r.x0 + r.x1) / 2 - cam.x;
      if (cxp < -60 || cxp > 1020) continue;
      ctx.fillText(r.name, cxp - r.name.length * 5.5, 12);
      ctx.strokeStyle = 'rgba(200,220,255,0.12)';
      ctx.beginPath(); ctx.moveTo(r.x0 - cam.x, 16); ctx.lineTo(r.x0 - cam.x, 540); ctx.stroke();
    }
  }
  function renderOverlay(ctx, M, cam) { overlay(ctx, M, cam); }

  return { renderWorld, render, renderOverlay, PAL, LVY, STYLE, ART, TEX, scene };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CastleDraw;
