// ============ 第 5 阶段地基：一件物品的四个视图必须同源 ============
// 检视（仓库）、手持（正式游戏）、地面拾取、HUD 四个位置全部调用同一个 ArtDraw.gun，
// 因此它们画的必然是同一份 WeaponArt 档案；差异只有整数倍放大，不允许各画一套。
// 任何"只给某个武器 ID 写一段仓库专用漂亮绘图"的做法都会破坏这个前提。
const WeaponViews = (() => {
  // 放大倍率：像素风用整数倍最近邻放大，不产生模糊
  const ZOOM = { inspect: 5, pickup: 2, hud: 2, combat: 1 };
  const H = 36, W = 22;                       // 人类实体标准包围盒（与 CFG/人物一致）

  // 造一个只用于绘制的虚拟持握者：字段与真实实体同名，ArtDraw/WeaponArt 读哪一项这里就给哪一项
  function holder(key, o) {
    const face = o.facing === -1 ? -1 : 1;
    const e = {
      x: -W / 2, y: -H / 2, w: W, h: H,
      weapon: key, aim: o.angle || 0, facing: face,
      attachments: o.attachments || [], attFx: null,
      vx: 0, vy: 0, onGround: true, dead: false, kind: 'human',
      // 第 9 阶段最小连接：预览也要能按英雄配色画手（ArtDraw.arms 读 e.hero）。
      // 只影响配色，不改尺寸——英雄与普通人共用 22×36 碰撞盒是玩法事实。
      hero: o.hero || null,
      mag: 30, reloading: false, reloadT: 0,
    };
    if (o.attachments && typeof aggregateAttachFx === 'function') e.attFx = aggregateAttachFx(o.attachments);
    return e;
  }

  // ---------- 取景量具：只测量、不落墨的画布替身 ----------
  // 原先检视图/HUD/拾取的取景中心按"锚点框"算，但锚点是一组点（枪口、握点、弹匣口…），
  // 机件却是有宽度的：枪托从 -recW 再往左 5 单位、弹匣从 lay.mag 往下好几行、消音器往枪口
  // 外伸 8 单位。实测 88 件里 78 件的实绘范围超出锚点框，252px 面板上最多偏心 53px。
  // 锚点不该兼任外形边界，所以这里用与成品同一次 ArtDraw.gun 调用跑一遍替身上下文，
  // 按真实落点求包围盒。替身只建模 fillRect（本仓库所有像素图元最终都走 fillRect）；
  // 一旦绘制路径改用 fill/stroke/drawImage/渐变等未建模接口，_未覆盖 会计数，闸门当场失败，
  // 不允许退化成"少算一点也没关系"。
  function MeasureCtx() {
    const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const stack = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, 矩形 = 0, 未覆盖 = 0;
    const mul = (p, q) => ({
      a: p.a * q.a + p.c * q.b, b: p.b * q.a + p.d * q.b,
      c: p.a * q.c + p.c * q.d, d: p.b * q.c + p.d * q.d,
      e: p.a * q.e + p.c * q.f + p.e, f: p.b * q.e + p.d * q.f + p.f });
    const put = (px, py) => {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    };
    const ctx = {
      _是量具: true,                                 // 供调用计数区分"真实落墨"与"只测量"
      fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1,
      imageSmoothingEnabled: false, font: '', textAlign: '', textBaseline: '',
      save() { stack.push({ ...m }); },
      restore() { const s = stack.pop(); if (s) Object.assign(m, s); },
      translate(x, y) { Object.assign(m, mul(m, { a: 1, b: 0, c: 0, d: 1, e: x, f: y })); },
      rotate(r) { const c = Math.cos(r), s = Math.sin(r); Object.assign(m, mul(m, { a: c, b: s, c: -s, d: c, e: 0, f: 0 })); },
      scale(x, y) { Object.assign(m, mul(m, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 })); },
      fillRect(x, y, w, h) {
        矩形++;
        // 四个角都变换：旋转（斜向瞄准）时只取对角两点会漏掉斜放的外伸部分
        put(m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
        put(m.a * (x + w) + m.c * y + m.e, m.b * (x + w) + m.d * y + m.f);
        put(m.a * x + m.c * (y + h) + m.e, m.b * x + m.d * (y + h) + m.f);
        put(m.a * (x + w) + m.c * (y + h) + m.e, m.b * (x + w) + m.d * (y + h) + m.f);
      },
      // 以下都会真正落墨，替身没有建模 → 计数交给闸门判失败，不静默忽略
      fill() { 未覆盖++; }, stroke() { 未覆盖++; }, strokeRect() { 未覆盖++; },
      fillText() { 未覆盖++; }, strokeText() { 未覆盖++; }, drawImage() { 未覆盖++; },
      putImageData() { 未覆盖++; },
      createLinearGradient() { 未覆盖++; return { addColorStop() {} }; },
      createRadialGradient() { 未覆盖++; return { addColorStop() {} }; },
      createPattern() { 未覆盖++; return null; },
      // 纯状态/路径构造：不影响包围盒，留空即可
      clearRect() {}, setTransform() {}, resetTransform() {}, beginPath() {}, closePath() {},
      moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {}, rect() {}, quadraticCurveTo() {},
      bezierCurveTo() {}, setLineDash() {}, getLineDash() { return []; }, clip() {},
      getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
      measureText() { return { width: 0 }; },
      _矩形: () => 矩形, _未覆盖: () => 未覆盖,
      _盒: () => (矩形 && !未覆盖 ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null),
    };
    return ctx;
  }

  // 一件物品的实绘包围盒（世界坐标，枪口已落在权威点上）：按 ID+配件+朝向+视角缓存
  const frameCache = new Map();
  function frame(key, o) {
    if (typeof WeaponArt === 'undefined' || typeof ArtDraw === 'undefined') return null;
    o = o || {};
    const ck = [key, (o.attachments || []).join('+'), o.angle || 0,
      o.facing === -1 ? -1 : 1, o.hero || '', o.scale || 'combat'].join('|');
    if (frameCache.has(ck)) return frameCache.get(ck);
    const mc = MeasureCtx();
    ArtDraw.gun(mc, { x: 0, y: 0 }, holder(key, o), { off: { x: 0, y: 0 }, view: o.scale });
    const f = mc._盒();
    if (frameCache.size > 512) frameCache.clear();
    frameCache.set(ck, f);
    return f;
  }

  // 有效倍率：档位倍率是上限，fit 只允许往下降（绝不把小视图放大成大视图）
  function effZoom(fr, o, z) {
    let zoom = o.zoom || z;
    if (o.fit) {
      const bw = Math.max(4, fr.w), bh = Math.max(4, fr.h);
      const k = Math.floor(Math.min(o.fit[0] / bw, o.fit[1] / bh));
      zoom = Math.max(1, Math.min(zoom, k));
    }
    return zoom;
  }

  // 该件在指定尺度下的实绘尺寸（不绘制）：给"要按自身高度摆放"的调用方用，
  // 免得为了知道多高而先画一遍。zoomOverride 必须与随后 render 用的倍率一致，
  // 否则摆放会差半个高度——地面拾取图原来就是按档位 2x 求高、按 1x 绘制。
  function size(key, scale, zoomOverride) {
    const o = { scale: scale };
    if (zoomOverride != null) o.zoom = zoomOverride;
    const fr = frame(key, o);
    if (!fr) return null;
    const z = effZoom(fr, o, ZOOM[scale] != null ? ZOOM[scale] : 1);
    return { w: fr.w * z, h: fr.h * z, 半高: fr.h * z / 2 };
  }

  // 在 ctx 上以 (x,y) 为物品视觉中心绘制该武器；cam 传 0 原点，靠 holder 自身坐标定位
  function render(ctx, key, o) {
    o = o || {};
    const art = typeof WeaponArt !== 'undefined' ? WeaponArt.get(key) : null;
    if (!art) return false;
    const z = ZOOM[o.scale] != null ? ZOOM[o.scale] : 1;
    const e = holder(key, o);
    const cam = { x: 0, y: 0 };
    const A = WeaponArt.anchorsWorld(e, key, e.aim);
    if (!A) return false;
    const fr = frame(key, o);
    if (!fr) return false;
    // 中心取实绘包围盒：ArtDraw.gun 内部把 layout 平移到"枪口落在 A.muzzle"，
    // 所以替身量到的盒子与真画落在同一个坐标系里，可以直接当取景心用。
    const cx = (fr.x0 + fr.x1) / 2, cy = (fr.y0 + fr.y1) / 2;
    const zoom = effZoom(fr, o, z);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(o.x || 0, o.y || 0);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);                                   // 让物品中心落在 (x,y)
    ArtDraw.gun(ctx, cam, e, { off: { x: 0, y: 0 }, view: o.scale });
    ctx.restore();
    return { zoom, art: art, anchors: A, box: [fr.w, fr.h], 实绘: fr };
  }


  // 直接画到某个 DOM canvas 上（HUD / 仓库预览 / 工位共用这一个入口）
  function paint(canvas, key, o) {
    if (!canvas || !canvas.getContext) return false;
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const r = render(g, key, Object.assign({ x: canvas.width / 2, y: canvas.height / 2 }, o || {}));
    return !!r;
  }

  // 供断言使用：四个视图各自的绘制函数标识，必须全部指向同一次 ArtDraw.gun 调用
  function probe(key, o) {
    const art = WeaponArt.get(key);
    return { key, scale: (o && o.scale) || 'inspect', 档案: art ? art.ver : null,
      轮廓函数: art && art.silhouette ? 'art.silhouette' : 'legacyParts',
      长度: art ? art.layout.len : null, 机制: art ? art.mech : null,
      调用: 'ArtDraw.gun' };
  }

  return { render, paint, holder, probe, size, frame, ZOOM };
})();

if (typeof window !== 'undefined') window.WeaponViews = WeaponViews;
