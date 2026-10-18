// ============ 像素绘制基础设施（程序化像素风统一渲染） ============
// 全局视觉规范：一切形状由 fillRect 组合，逻辑像素取整，关闭平滑插值。
// - px()          逻辑坐标取整
// - pxRect        取整矩形
// - pxCircle      像素圆（同心方块近似）
// - pxOutline     1px 外描边（双层硬边的外层）
// - pxNoise       确定性 2×2 抖动噪点（seed 固定 → 逐帧一致不闪烁）
// - makePixelFrame 离屏低分辨率帧 → 放大生成（供角色/武器/道具复用）
// - PX            全局像素调色板
// - PX_FONT       canvas 统一像素字体栈
const PX = (() => {
  // 主色板（像素霓虹：暗底 + 霓虹绿主色 + 阵营红蓝）
  const C = {
    bgDeep: '#080c10', bgMid: '#0d141c', bgTop: '#121b26', bgHorizon: '#1a2533',
    ground: '#1c2430', groundHi: '#283444', groundLine: '#0e141b', groundDot: '#2c3a4d',
    green: '#39ff14', greenDark: '#1d7a45', greenDim: '#2fc85a', greenText: '#baff5c',
    red: '#ff5252', redDark: '#a02820', blue: '#4d6fe0', blueDark: '#33479a',
    // 人类
    skin: '#f2c49b', skinShade: '#c99a6e', hair: '#24355c',
    cloth: '#4d6fe0', clothShade: '#3a53a8', clothDark: '#22315e', vest: '#6a86e8',
    // 英雄
    hGold: '#ffd54f', hGoldS: '#c9a83a', hGoldD: '#8a6a20', hGoldL: '#fff59d',
    hPurple: '#ce93d8', hPurpleS: '#9d6ab0', hPurpleD: '#5a3a70', hPurpleL: '#e1bee7',
    // 僵尸
    zSkin: '#6fae6a', zSkinS: '#4d7f4a', zSkinD: '#2f4f2d',
    zSprintSkin: '#c96a4a', zSprintS: '#a04e30', zSprintD: '#6e3220',
    zBoomSkin: '#8a5aa8', zBoomS: '#6a4290', zBoomD: '#452a5c',
    zMotherSkin: '#5f9a70', zMotherS: '#43704e', zMotherD: '#2a4a34',
    zEye: '#ff5252', zBlood: '#8a1a1a',
    // 金属与武器
    metal: '#39424e', metalLight: '#4b5866', metalDark: '#2c3640', steel: '#5a6a7a',
    muzzle: '#ffe94a', shell: '#e8c060', wood: '#8a5a2a', woodDark: '#5f3a1c',
    // 通用
    white: '#eafff0', black: '#0a0a0a', gold: '#ffd740', warn: '#ff8f2a',
  };
  return { ...C, FONT: '"Zpix Pixel","Press Start 2P",monospace' };
})();

const PX_FONT = PX.FONT;

const px = n => Math.round(n);

function pxRect(ctx, x, y, w, h) { ctx.fillRect(px(x), px(y), px(w), px(h)); }

// 像素圆：按行扫描填充（每行一条 fillRect）
// 旧实现是 dx/dy 双重循环 + 每格一次 fillRect，半径 200 的开镜镜筒每帧要 16 万次
// fillRect，直接掉帧。逐行扫描的像素集合与旧版完全一致（同样的 dx²≤R²+0.4R-dy² 判定），
// 但调用数从 (2R+1)² 降到 2R+1。
function pxCircle(ctx, cx, cy, r) {
  const x = px(cx), y = px(cy), R = px(r);
  const rr = R * R + R * 0.4;
  for (let dy = -R; dy <= R; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
    ctx.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
}

// 镜筒遮罩：整屏 w×h 铺当前颜色，但留出以 pxCircle 同口径的像素圆。
// 不能用 destination-out + pxCircle：那会把底下已经画好的世界一起擦成透明，
// 露出 canvas 的黑色底 → 开镜时镜筒里是一片黑。逐行只填圆外两段。
function pxLensMask(ctx, cx, cy, r, w, h) {
  const x = px(cx), y = px(cy), R = Math.max(1, px(r));
  const rr = R * R + R * 0.4;
  for (let row = 0; row < h; row++) {
    const dy = row - y;
    if (dy < -R || dy > R) { ctx.fillRect(0, row, w, 1); continue; }
    const half = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
    ctx.fillRect(0, row, x - half, 1);
    ctx.fillRect(x + half + 1, row, w - x - half - 1, 1);
  }
}

// 1px 外描边（画在矩形四周外侧，颜色默认黑）
function pxOutline(ctx, x, y, w, h, col) {
  ctx.fillStyle = col || PX.black;
  const X = px(x), Y = px(y), W = px(w), H = px(h);
  ctx.fillRect(X - 1, Y - 1, W + 2, 1);
  ctx.fillRect(X - 1, Y + H, W + 2, 1);
  ctx.fillRect(X - 1, Y - 1, 1, H + 2);
  ctx.fillRect(X + W, Y - 1, 1, H + 2);
}

// 像素线段：逐格步进 1px（Bresenham 近似），颜色取当前 fillStyle
function pxLine(ctx, x0, y0, x1, y1) {
  const X0 = px(x0), Y0 = px(y0), X1 = px(x1), Y1 = px(y1);
  const dx = X1 - X0, dy = Y1 - Y0;
  // 水平/垂直线：步进逐格画出来就是一条矩形，直接一次 fillRect（开镜十字线长几百像素）
  if (dx === 0) { ctx.fillRect(X0, Math.min(Y0, Y1), 1, Math.abs(dy) + 1); return; }
  if (dy === 0) { ctx.fillRect(Math.min(X0, X1), Y0, Math.abs(dx) + 1, 1); return; }
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    ctx.fillRect(X0 + Math.round(dx * i / steps), Y0 + Math.round(dy * i / steps), 1, 1);
  }
}

// 像素空心圆环（宽度 t 格，默认 1px），颜色取当前 fillStyle
// 同 pxCircle 逐行扫描：每行最多两段（左右弧），不再遍历整个外接方格。
function pxRing(ctx, cx, cy, r, t) {
  const x = px(cx), y = px(cy), R = px(r), T = px(t || 1);
  const R1 = (R + 0.4) * (R + 0.4), R0 = Math.max(0, R - T) - 0.4;
  const r0sq = R0 * R0;
  for (let dy = -R - T; dy <= R + T; dy++) {
    const dyy = dy * dy;
    if (dyy > R1) continue;
    const hi = Math.floor(Math.sqrt(R1 - dyy));
    const lo = dyy >= r0sq ? 0 : Math.ceil(Math.sqrt(r0sq - dyy));
    if (lo > hi) continue;
    if (lo === 0) { ctx.fillRect(x - hi, y + dy, hi * 2 + 1, 1); continue; }
    ctx.fillRect(x - hi, y + dy, hi - lo + 1, 1);
    ctx.fillRect(x + lo, y + dy, hi - lo + 1, 1);
  }
}

// 像素拱顶（上半圆，底边在 baseY，半径 r），颜色取当前 fillStyle
function pxArch(ctx, cx, baseY, r) {
  const X = px(cx), B = px(baseY), R = px(r);
  for (let dy = -R; dy <= 0; dy++) {
    const halfW = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)));
    ctx.fillRect(X - halfW, B + dy, halfW * 2, 1);
  }
}

// 像素椭圆（实心，铺地阴影/光斑用）：按行扫描 rx/ry 椭圆填充
function pxEllipse(ctx, cx, cy, rx, ry) {
  const X = px(cx), Y = px(cy), Rx = px(rx), Ry = Math.max(1, px(ry));
  const h = Ry / Rx < 0.5 ? 2 : 1; // 极扁椭圆每行加厚，避免高度不足 1px
  for (let dy = -Ry; dy <= Ry; dy++) {
    const halfW = Math.round(Math.sqrt(Math.max(0, 1 - (dy / Ry) * (dy / Ry))) * Rx);
    ctx.fillRect(X - halfW, Y + dy, halfW * 2, h);
  }
}

// 像素椭圆环（空心，地面光圈用），宽度 t 格
function pxEllipseRing(ctx, cx, cy, rx, ry, t) {
  const X = px(cx), Y = px(cy), Rx = px(rx), Ry = Math.max(1, px(ry)), T = px(t || 1);
  for (let dy = -Ry; dy <= Ry; dy++) {
    const yy = dy / Ry;
    const halfW = Math.round(Math.sqrt(Math.max(0, 1 - yy * yy)) * Rx);
    if (halfW < T) continue;
    ctx.fillRect(X - halfW, Y + dy, T, 1);
    ctx.fillRect(X + halfW - T, Y + dy, T, 1);
  }
}

// 确定性 2×2 抖动噪点：seed 相同 → 每帧图案一致，不闪烁
function pxNoise(ctx, x, y, w, h, col, seed, density) {
  let s = (seed >>> 0) || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  ctx.fillStyle = col;
  const X = px(x), Y = px(y), W = px(w), H = px(h), d = density === undefined ? 0.16 : density;
  for (let j = 0; j < H; j += 2)
    for (let i = 0; i < W; i += 2)
      if (rnd() < d) ctx.fillRect(X + i, Y + j, 2, 2);
}

// 低分辨率帧生成：在 w×h 逻辑网格上绘制（drawFn 内用 1px 逻辑像素），
// 放大 scale 倍输出，返回离屏 canvas；标记 _px 供绘制端做像素化处理（禁用平滑/离散混合）
function makePixelFrame(w, h, scale, drawFn) {
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  c._px = true;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.scale(scale, scale);
  drawFn(ctx, w, h);
  ctx.restore();
  return c;
}

// 队员缓存帧为 40x60，其中可见部分高 56px；绘制高度折算到可见身高 62px。
// 碰撞盒仍保持窄尺寸，低梁下由 humanVisualHeight 限制外观高度。
const SPRITE_SCALE = {
  human: CFG.HUMAN_VISUAL_H * 60 / 56 / 36, hero: 1.02,
  z_normal: 1.02, z_sprinter: 1.0, z_boomer: 1.04, z_mother: 0.95,
};
