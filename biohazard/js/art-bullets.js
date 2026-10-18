// ============ 子弹弹道绘制（从 ui.js 世界循环原样抽出，供玩法与提取台共用同一入口） ============
// 抽出前这段代码是 ui.js 世界渲染里的一段内层循环，外部无法单独调用，
// 于是"枪械发射时的子弹"是七类元素里唯一没法同源比对的一个。这里只做搬移：
// 形状、取整、alpha 时序、曳光裁剪账本全部逐字保留，唯一的语法变换是
// 循环里的 continue 变成函数里的 return（每次调用只画一发，语义等价）。
// 依赖：pixel.js 的 pxLine/pxCircle，art-core.js 的 WeaponArt，art-throw-nine.js 的 ThrowNineArt。
const BulletArt = (() => {
  // 曳光裁剪用：记住每发弹"第一次被画到"的位置。绘制层的私有账本，不进玩法对象、
  // 不参与任何结算，弹丸被回收后 WeakMap 条目自动消失。
  const 尾迹起点 = new WeakMap();

  // 弹丸本体绘制：某些弹种（火箭弹/榴弹）的真实可见主体是"一枚弹"而不是一条曳光。
  // 只有该武器档案里显式写了 emit.projectile 才走这里；尾烟按"距弹头多少像素"画，
  // 不依赖逐帧历史状态 → 多枚同时飞行时各画各的，不会串用计时器或随机数。
  function drawWeaponProjectile(ctx, b, tx, ty, ux, uy, pj, dim) {
    // 能量弹（bolt）：亮芯 + 光晕 + 沿速度方向的短拖尾，没有尾翼与药型罩
    if (pj.kind === 'bolt') {
      const tl = pj.tail || { segs: 5, len: 16, col: '#fff9c4', fade: 0.5 };
      for (let i = 0; i < tl.segs; i++) {
        const f = (i + 1) / tl.segs;
        ctx.globalAlpha = Math.max(0, (1 - f) * (tl.fade == null ? 0.5 : tl.fade)) * dim;
        ctx.fillStyle = tl.col;
        const w = Math.max(1, Math.round((pj.core ? pj.core.r : 1.6) * 2 * (1 - f * 0.6)));
        pxLine(ctx, tx - ux * tl.len * f, ty - uy * tl.len * f,
          tx - ux * tl.len * (f + 1 / tl.segs), ty - uy * tl.len * (f + 1 / tl.segs));
        if (w > 1) pxLine(ctx, tx - ux * tl.len * f, ty - uy * tl.len * f + 1,
          tx - ux * tl.len * (f + 1 / tl.segs), ty - uy * tl.len * (f + 1 / tl.segs) + 1);
      }
      const hl = pj.halo || { r: 3, col: '#fff59d', alpha: 0.55 };
      ctx.globalAlpha = hl.alpha * dim; ctx.fillStyle = hl.col; pxCircle(ctx, tx, ty, hl.r);
      ctx.globalAlpha = dim; ctx.fillStyle = pj.core ? pj.core.col : '#ffffff';
      pxCircle(ctx, tx, ty, pj.core ? pj.core.r : 1.6);
      ctx.globalAlpha = 1;
      return;
    }
    const bd = pj.body || { len: 7, w: 2.2 };
    const nos = pj.nose || { len: 2.4, col: '#c9a15a' };
    const fin = pj.fins || { w: 3.2, h: 2.4, col: '#4e5a45' };
    const px0 = tx - ux * bd.len, py0 = ty - uy * bd.len;         // 弹尾
    ctx.globalAlpha = dim;
    // 尾烟：沿弹体后方按固定间距铺开，越远越大越淡
    const st = pj.smoke || { n: 5, gap: 4, r: 1.8, col: '#8d9198', fade: 0.34 };
    for (let i = 1; i <= st.n; i++) {
      const d = bd.len + i * st.gap;
      ctx.globalAlpha = Math.max(0, (1 - i / (st.n + 1)) * st.fade) * dim;
      ctx.fillStyle = i % 2 ? st.col : (st.col2 || '#616161');
      pxCircle(ctx, tx - ux * d, ty - uy * d + (i % 2 ? 1 : -1), st.r * (0.6 + i * 0.35));
    }
    ctx.globalAlpha = dim;
    // 弹体：沿速度方向画一条粗线（3 排像素，中线最亮）
    ctx.fillStyle = pj.bodyCol || '#5d6b52';
    for (let o = -1; o <= 1; o++) {
      const ox = -uy * o * (bd.w / 2), oy = ux * o * (bd.w / 2);
      pxLine(ctx, px0 + ox, py0 + oy, tx + ox, ty + oy);
    }
    ctx.fillStyle = pj.bodyHi || '#8a9a7b';
    pxLine(ctx, px0 - uy, py0 + ux, tx - uy, ty + ux);            // 上缘高光
    // 尾翼：弹尾两侧垂直外展
    ctx.fillStyle = fin.col;
    pxLine(ctx, px0, py0, px0 - ux * fin.h + uy * fin.w * 0.5, py0 - uy * fin.h - ux * fin.w * 0.5);
    pxLine(ctx, px0, py0, px0 - ux * fin.h - uy * fin.w * 0.5, py0 - uy * fin.h + ux * fin.w * 0.5);
    // 战斗部：前段锥形（药型罩铜色）
    ctx.fillStyle = nos.col;
    for (let i = 0; i <= 2; i++) {
      const t = i / 2, w = (1 - t) * (bd.w * 0.5 + 0.6);
      const cx = tx + ux * (nos.len * t), cy = ty + uy * (nos.len * t);
      for (let o = -w; o <= w; o++) { ctx.fillRect(Math.round(cx - uy * o), Math.round(cy + ux * o), 1, 1); }
    }
    ctx.globalAlpha = 1;
  }

  // 一发弹的完整弹道绘制：坐标按 cam 折算到屏幕，与原循环一致
  function draw(ctx, b, cam) {
    if (b.grenade && typeof ThrowNineArt !== 'undefined' && ThrowNineArt.drawProjectile(ctx, b, cam)) return;
    // b.trail 也可能是形状名（攻防爆破弹是 'comet'）：不展开的话 tr.len 是 undefined，
    // 整条尾迹坐标算成 NaN，那发弹在空中就完全看不见。
    const tr = typeof b.trail === 'string'
      ? { shape: b.trail, color: '#ffb300', glowColor: '#ffd54f', width: 3, len: 16, glow: 0.6 }
      : (b.trail || { color: '#ffe066', glowColor: '#fff3c4', width: 2, len: 12, glow: 0.5, shape: 'line' });
    const dim = b.hideTracer ? 0.32 : 1;   // 消音器：隐藏弹道（变暗）
    const boost = b.trailBoost || 1;       // 曳光弹：弹道更长更亮
    // 尾长只能占"弹头真正飞过的距离"：w.trail.len 是固定值（9~34，曳光弹再 ×1.8），而单帧只飞
    // bspeed/60 ≈ 12~32px —— 起飞那一两帧按固定尾长反推，尾端会落在弹头从未到过的空间，
    // 也就是从射手背后穿进实际挡弹的墙里（合同 三.1：视觉尾迹不得误导射击方向／穿墙）。
    let 首 = 尾迹起点.get(b);
    if (!首) { 首 = { x: b.x, y: b.y }; 尾迹起点.set(b, 首); }
    const 一帧 = Math.hypot(b.vx, b.vy) / 60;
    const 已飞 = Math.hypot(b.x - 首.x, b.y - 首.y) + 一帧;   // 首帧补一帧：出生到首次绘制之间确实已经飞过一段
    const trLen = Math.min(tr.len * boost, 已飞);
    const trGlow = Math.min(1, tr.glow * (0.7 + 0.3 * boost));
    const tx = b.x - cam.x, ty = b.y - cam.y;
    if (tr.shape === 'dot') {   // 火焰喷射等无飞行弹道：原地火球
      ctx.globalAlpha = Math.min(1, trGlow + 0.25) * dim;
      ctx.fillStyle = tr.color;
      pxCircle(ctx, tx, ty, tr.width);
      ctx.globalAlpha = 1;
      return;
    }
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp, uy = b.vy / sp;
    // 有弹体档案的弹种（火箭弹/榴弹）：画"一枚弹"而不是加粗曳光，画完直接进下一发
    const pj = (typeof WeaponArt !== 'undefined' && b.key)
      ? ((WeaponArt.get(b.key) || {}).emit || {}).projectile : null;
    if (pj) { drawWeaponProjectile(ctx, b, tx, ty, ux, uy, pj, dim); return; }
    const hx = tx - ux * trLen, hy = ty - uy * trLen;
    if (tr.shape === 'tracer') {   // 普通枪械曳光：前端亮点 + 由粗到细的短拖尾（告别长亮线）
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs, f1 = (i + 1) / segs;
        const x0 = tx - ux * trLen * f0, y0 = ty - uy * trLen * f0;
        const x1 = tx - ux * trLen * f1, y1 = ty - uy * trLen * f1;
        ctx.globalAlpha = Math.max(0, trGlow * (1 - i * 0.22)) * dim;
        ctx.fillStyle = i === 0 ? tr.glowColor : tr.color;
        pxLine(ctx, x0, y0, x1, y1);
      }
      ctx.globalAlpha = dim;
      ctx.fillStyle = '#ffffff';
      pxCircle(ctx, tx, ty, Math.max(1.3, tr.width * 0.55));
      return;
    }
    if (tr.shape === 'scatter') {   // 霰弹散射：短促由亮到暗的弹丸拖尾
      const segs = 3;
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs, f1 = (i + 1) / segs;
        const x0 = tx - ux * trLen * f0, y0 = ty - uy * trLen * f0;
        const x1 = tx - ux * trLen * f1, y1 = ty - uy * trLen * f1;
        ctx.globalAlpha = Math.max(0, trGlow * (0.85 - i * 0.25)) * dim;
        ctx.fillStyle = tr.color;
        pxLine(ctx, x0, y0, x1, y1);
      }
      ctx.globalAlpha = dim;
      ctx.fillStyle = '#ffffff';
      pxCircle(ctx, tx, ty, Math.max(1.2, tr.width * 0.5));
      return;
    }
    if (tr.shape === 'comet') {   // 英雄武器彗星拖尾：白热头部 + 拉长锥形彩尾
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs, f1 = (i + 1) / segs;
        const x0 = tx - ux * trLen * f0, y0 = ty - uy * trLen * f0;
        const x1 = tx - ux * trLen * f1, y1 = ty - uy * trLen * f1;
        ctx.globalAlpha = Math.max(0, trGlow * (1 - i * 0.13)) * dim;
        ctx.fillStyle = i === 0 ? tr.glowColor : (i < 3 ? tr.color : tr.glowColor);
        pxLine(ctx, x0, y0, x1, y1);
      }
      ctx.globalAlpha = dim;
      ctx.fillStyle = '#ffffff';
      pxCircle(ctx, tx, ty, Math.max(1.8, tr.width * 0.9));
      return;
    }
    if (tr.shape === 'spark') {   // 震撼弹火星：放射状粒子火花（随机闪烁）
      const baseA = Math.atan2(uy, ux);
      for (let s = 0; s < 5; s++) {
        const sa = baseA + (Math.random() - 0.5) * 0.9;
        const sl = 5 + Math.random() * 9;
        ctx.globalAlpha = Math.max(0, trGlow * (0.5 + Math.random() * 0.5)) * dim;
        ctx.fillStyle = tr.color;
        pxLine(ctx, tx, ty, tx + Math.cos(sa) * sl, ty + Math.sin(sa) * sl);
      }
      ctx.globalAlpha = dim;
      ctx.fillStyle = tr.color;
      pxCircle(ctx, tx, ty, tr.width);
      return;
    }
    // 光晕层（宽透明线 → 双像素线）
    ctx.globalAlpha = Math.min(1, trGlow * 0.7) * dim;
    ctx.fillStyle = tr.glowColor;
    pxLine(ctx, hx, hy, tx, ty);
    // 核心亮线
    ctx.globalAlpha = 1 * dim;
    ctx.fillStyle = tr.color;
    pxLine(ctx, hx - ux * 2, hy - uy * 2, tx, ty);
    // 弹头亮点（火箭/激光更亮）
    ctx.fillStyle = (tr.shape === 'rocket' || tr.shape === 'laser') ? '#ffffff' : tr.glowColor;
    pxCircle(ctx, tx, ty, Math.max(1.4, tr.width * 0.7));
  }

  return { draw, projectile: drawWeaponProjectile, 尾迹起点 };
})();

if (typeof window !== 'undefined') window.BulletArt = BulletArt;
