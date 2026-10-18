// ============ 美术地基 D：武器绘制与姿态合成（读取第 2 阶段锚点 + 第 3 阶段事件） ============
// 战斗尺度下：先由 WeaponArt 的权威枪口反推整枪位置，再叠加事件驱动的部件位移
// （后坐、枪机/套筒/泵柄往复、换弹阶段），最后画旧版兼容轮廓或已验收轮廓。
// 注意：本文件的轮廓绘制对 legacy 档案刻意保持与第 0 阶段"同样的部件集合"，只修正位置与时序；
// 逐件最终造型由第 5/6 阶段的单件提示词通过 WeaponArt.define() 填入。

const ArtDraw = (() => {
  // 取该实体当前驱动武器表现的事件（shot / cycle / reload / melee / throw）
  function pose(e) {
    const out = { recoil: 0, bolt: 0, flash: 0, charge: 0, spin: 0, stage: null, ev: null, reload: null, swing: null, throwing: null, hammer: 0, cylinder: 0 };
    if (typeof ArtEvents === 'undefined') return out;
    const list = ArtEvents.forEntity(e.id);
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      const rp = ArtEvents.replay(ev, ev.t0 + (ArtEvents.clock - ev.t0));
      const u = rp.u;
      if (ev.type === 'shot') { out.recoil = Math.max(out.recoil, rp.recoil); out.bolt = Math.max(out.bolt, rp.boltTravel); out.flash = Math.max(out.flash, rp.flash); out.charge = Math.max(out.charge, rp.charge || 0); out.ev = ev; out.stage = ev.stage; }
      else if (ev.type === 'cycle') { out.bolt = Math.max(out.bolt, rp.boltTravel); out.stage = out.stage || ev.stage; if (ev.cycleVariant === 'revolver') { out.hammer = rp.boltTravel; out.cylinder = u; } }
      else if (ev.type === 'reloadStart') out.reload = { u, stage: ev.stage, tl: ev.tl, ev };
      else if (ev.type === 'melee') out.swing = { u, stage: ev.stage, ev };
      else if (ev.type === 'throw') out.throwing = { u, stage: ev.stage, ev };
      else if (ev.type === 'holster') out.holster = { u, stage: ev.stage };
    }
    const art = WeaponArt.get(e.weapon);
    if (art && art.mechDef.rotary) {
      const w = WEAPONS[e.weapon] || {};
      out.spin = (e.windup != null ? e.windup : (w.windup ? (e.windup || 0) : 0));
    }
    return out;
  }

  // 事件驱动的部件位移（枪体局部坐标，+x 朝枪口）
  // 行程长度：有档案按该枪真实机件行程（art.emit.bolt.stroke），没有则用第 3 阶段的分类默认值
  function partTravel(p, art) {
    const cyc = art.mechDef.cycle;
    const custom = art.emit && art.emit.bolt && art.emit.bolt.stroke;
    const stroke = custom != null ? custom
      : (cyc === 'bolt' ? 6 : cyc === 'pump' ? 7 : cyc === 'slide' ? 4 : cyc === 'rotary' ? 0 : 3);
    return { bolt: -p.bolt * stroke, pump: -p.bolt * stroke * (cyc === 'pump' ? 1 : 0.35) };
  }

  // 旧版兼容轮廓：与第 0 阶段 drawHandGun 相同的部件集合（枪管/机匣/弹匣/握把/瞄具/刀身/手雷体），
  // 但改为按档案锚点与权威枪口定位；突击步枪不再因为 'rifle' 判错而只剩两块。
  function legacyParts(ctx, art, p, opts) {
    const lay = art.layout, L = lay.len;
    const pen = ArtPen.pen(ctx, ART_SPEC.materials);
    const g = (WEAPONS[art.key] || {}).g;
    const w = WEAPONS[art.key] || {};
    const mt = art.mats || { body: 'metal', furniture: 'polymer', barrel: 'steel' };
    // 机匣/主体
    const recW = Math.max(8, Math.round(L * 0.42)), recH = g === 'pistol' ? 4 : 5;
    pen.bar(-recW, -recH + 1, recW, recH, mt.body);
    // 枪管
    const barrelH = w.pellets > 1 ? 3 : 2;
    pen.bar(0, -barrelH, L - recW, barrelH, mt.barrel);
    // 弹匣 / 弹鼓 / 弹链盒（按供弹路径分形，不再统一"一块直匣"）
    const rp = art.reloadPath;
    if (rp === 'drum' || rp === 'pan-top') { pen.block(-recW + 1, 3, 7, 6, mt.body); }
    else if (rp === 'belt') { pen.block(-recW, 4, 9, 5, mt.furniture); }
    else if (rp === 'top-mag') { pen.bar(-recW + 2, -recH - 4, 8, 3, mt.furniture); }
    else if (rp === 'cylinder') { pen.block(-4, 1, 5, 5, mt.barrel); }
    else if (rp === 'tubular') { pen.bar(2, 2, L - 8, 2, mt.body); }
    else if (rp === 'box-mag' || rp === 'bullpup-mag' || rp === 'stripper' || rp === 'cell') {
      const mh = g === 'pistol' ? 5 : 7, curved = /longstroke/.test(art.mech);
      const mx = rp === 'bullpup-mag' ? -recW + 6 : -4;
      for (let r = 0; r < mh; r++) {
        const bend = curved ? Math.round(Math.pow(r / mh, 1.5) * 3) : 0;
        ctx.fillStyle = r === 0 ? ART_SPEC.materials.polymer.hi : ART_SPEC.materials.polymer.base;
        pxRect(ctx, mx + bend, 4 + r, 4, 1);
      }
    }
    // 握把 / 枪托
    if (g !== 'melee' && g !== 'throw') {
      pen.block(-recW + 1, 3, 3, g === 'pistol' ? 6 : 4, mt.furniture);
      if (!/bullpup/.test(art.mech) && g !== 'pistol') pen.bar(-recW - 5, -1, 5, 3, mt.furniture);
      else if (/bullpup/.test(art.mech)) pen.bar(-recW - 3, -1, 3, 4, mt.furniture);
    }
    // 瞄具
    if (art.mechDef.melee || art.mechDef.thrown) { /* 近战/投掷无瞄具 */ }
    else if (g === 'sniper' || g === 'pistol') { pen.bar(-recW + 3, -recH - 2, 6, 2, 'glass'); }
    else { pen.bar(-recW + 4, -recH - 1, 3, 1, mt.barrel); }
    // 近战/投掷的专用体
    if (g === 'melee') {
      ctx.fillStyle = ART_SPEC.materials.steel.hi; pxRect(ctx, 0, -2, L - 4, 2);
      ctx.fillStyle = ART_SPEC.materials.steel.base; pxRect(ctx, L - 5, -2, 3, 1);
      pen.block(-4, -1, 4, 3, mt.furniture);
    } else if (g === 'throw') {
      pen.block(-3, -3, 6, 7, mt.body);
      ctx.fillStyle = ART_SPEC.materials.steel.hi; pxRect(ctx, -1, -4, 2, 1);
    }
    // 配件覆盖件（消音器/枪口装置/瞄具/激光）——第 2 阶段要求"视觉与最终装备状态一致"
    if (!opts || !opts.noAtt) attachments(ctx, art, p);   // 兼容旧调用点：无档案轮廓时仍在这里画
  }

  // 配件层：画在枪体局部系里（+x 朝枪口），所以必须由 gun() 在同一个 translate 帧内调用。
  // 第 6 阶段把逐件轮廓接上后，这里曾被漏掉：有 silhouette 的枪不再显示消音器/瞄具/下挂/激光，
  // 而配件数值（flashMul、hideTracer）仍在生效 → 画面与弹道不一致。现在两条路径共用同一层。
  function attachments(ctx, art, p) {
    const e = p && p.ent;
    const list = (e && e.attachments) || art.attachments || [];
    if (!list.length) return;
    const lay = art.layout;
    const pen = ArtPen.pen(ctx, ART_SPEC.materials);
    for (const ak of list) {
      const meta = (typeof ATTACH_META !== 'undefined' && ATTACH_META[ak]) || null;
      if (!meta) continue;
      // 安装位置一律优先取该件档案声明的锚点；只有档案没写安装点的（未验收的 legacy 件）才按枪长比例兜底。
      // 原来全部按 muzzle 距离的固定比例算，结果瞄具飘在机匣上方 3px、枪口件还超出权威枪口 2px，
      // 看着像"消音器前面又空出一截"，而枪口焰与弹丸仍从旧枪管末端出来 —— 画面与弹道各说各话。
      if (meta.slot === 'muzzle') {
        const len = ak === 'silencer' ? 8 : 3;
        pen.bar(lay.muzzle[0] - len, -2, len, 4, 'steel');          // 外端正好收在权威枪口点
      } else if (meta.slot === 'optics') {
        const sx = lay.sight ? lay.sight[0] - 3.5 : lay.muzzle[0] * 0.28 - 3;
        const sy = lay.sight ? lay.sight[1] - 3 : -7;
        pen.bar(sx, sy, 7, 3, 'glass');
      } else if (meta.slot === 'under') {
        const ux = lay.fore ? lay.fore[0] - 2 : lay.muzzle[0] * 0.55;
        const uy = lay.fore ? lay.fore[1] + 2 : 3;
        pen.bar(ux, uy, 4, 3, 'polymer');
      } else if (meta.slot === 'laser') {
        const lx = lay.fore ? (lay.grip[0] + lay.fore[0]) / 2 : lay.muzzle[0] * 0.4;
        const ly = lay.sight ? Math.min(-3, lay.sight[1] + 1) : -5;
        pen.block(lx, ly, 3, 2, 'energy');
      }
    }
  }

  // 近战/投掷的整件姿态：由档案 emit.swing 的关键帧曲线给出「绕支点转角 + 沿瞄准方向推出量」。
  // 转角曲线 keys＝[[归一化时间, 弧度], …]，线性插值；接触帧必须与 meleeSwing 的结算帧对齐。
  function curveAt(keys, u) {
    if (!keys || !keys.length) return 0;
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i];
        const k = (u - a[0]) / Math.max(1e-6, b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return keys[keys.length - 1][1];
  }
  function swingOf(art, p) {
    const sw = art && art.emit && art.emit.swing;
    if (!sw || !p || !p.swing) return null;
    const u = Math.max(0, Math.min(1, p.swing.u));
    const rot = curveAt(sw.keys, u);
    const lg = sw.lunge || {};
    const at = lg.at == null ? 0.06 : lg.at, px = lg.px == null ? 0 : lg.px;
    // 接触帧推出最远：之前线性送出、之后线性收回（不引入独立计时器，全部由事件 u 决定）
    const lunge = u <= at ? px * (at > 0 ? u / at : 1) : px * Math.max(0, 1 - (u - at) / Math.max(1e-6, 1 - at));
    return { rot, lunge };
  }

  // 主入口：在实体上绘制武器（战斗尺度）
  function gun(ctx, cam, e, opts) {
    const art = WeaponArt.get(e.weapon);
    if (!art) return;
    const p = pose(e);
    p.ent = e;
    const A = WeaponArt.anchorsWorld(e, e.weapon, e.aim, swingOf(art, p));
    if (!A) return;
    const m = A.muzzle;
    const off = (opts && opts.off) || { x: 0, y: 0 };
    // 挥砍轨迹要压在刀与手之下：先画轨迹，再画刀体，最后 ui.js 画手 → 不会把刀洗成一片白
    if (p.swing && art.mechDef.melee) {
      if (art.emit && art.emit.swing) bladeTrail(ctx, cam, e, art, p.swing);
      else swingArc(ctx, cam, e, art, p.swing);
    }
    ctx.save();
    ctx.translate(m.x - cam.x + off.x, m.y - cam.y + off.y);
    // A.rot：近战挥砍时整件绕握点再转一个角度（锚点已按同一转角换算，手不会脱开）
    ctx.rotate((e.aim || 0) + (A.rot || 0));
    if (A.facing < 0) ctx.scale(1, -1);          // 镜像：抛壳口/弹匣换到另一侧，枪口仍指瞄准方向
    // 事件驱动的整体后坐（沿 -x）与换弹时枪体下沉
    let dx = -p.recoil * 3;
    let dy = p.recoil * 0.6;
    if (p.reload) {
      const u = p.reload.u;
      dy += Math.sin(Math.min(1, u * 2) * Math.PI) * 2.2;      // 检视/换弹时枪体略下压
      dx += Math.sin(u * Math.PI) * 1.2;
    }
    if (p.throwing) { dx -= (1 - p.throwing.u) * 2; dy -= Math.sin(p.throwing.u * Math.PI) * 2.5; }
    ctx.translate(Math.round(dx), Math.round(dy));
    // 枪口以权威点为原点 → 局部坐标里枪口在 (0,0)
    ctx.save();
    ctx.translate(-art.layout.muzzle[0], -art.layout.muzzle[1]);
    if (art.silhouette) {
      art.silhouette(ctx, art, p, ArtPen, opts);
      // 有逐件轮廓的枪同样要画配件：配件数值一直生效（消音器压焰、曳光加长），
      // 不画就等于"画面没有、弹道有"。legacyParts 走它自己的那次调用。
      if (!(opts && opts.noAtt)) attachments(ctx, art, p);
    } else legacyParts(ctx, art, p, opts);
    ctx.restore();
    // 机件层：套筒/枪机/泵柄往复（在枪口局部系里画）
    // 有档案给出 art.emit.bolt 时按该枪的真实安装位置与行程画（M4 顶部拉机柄 / AK 右侧柄 / 手枪套筒…），
    // 没有则退回第 3 阶段的通用占位画法，保证未验收的枪表现不变。
    const tv = partTravel(p, art);
    if (tv.bolt !== 0) {
      ctx.save();
      ctx.translate(-art.layout.muzzle[0], -art.layout.muzzle[1]);
      const bm = art.emit && art.emit.bolt;
      if (bm) {
        const bx = bm.x + tv.bolt;
        ctx.fillStyle = ART_SPEC.outline; ctx.fillRect(px(bx) - 1, px(bm.y) - 1, bm.w + 2, bm.h + 2);
        ctx.fillStyle = ART_SPEC.materials.steel.hi; ctx.fillRect(px(bx), px(bm.y), bm.w, bm.h);
        ctx.fillStyle = ART_SPEC.materials.steel.lo; ctx.fillRect(px(bx), px(bm.y) + bm.h - 1, bm.w, 1);
        if (bm.mount === 'side' && p.bolt > 0.15) { ctx.fillStyle = ART_SPEC.materials.steel.edge; ctx.fillRect(px(bx) + bm.w, px(bm.y) - 1, 1, bm.h); }
      } else {
        const cyc = art.mechDef.cycle;
        const bx = (cyc === 'pump' ? art.layout.muzzle[0] * 0.62 : art.layout.muzzle[0] * 0.3) + tv.bolt;
        ctx.fillStyle = ART_SPEC.materials.steel.hi;
        pxRect(ctx, bx, cyc === 'top-mag' ? -6 : -3, 3, 2);
        if (cyc === 'bolt' && p.bolt > 0.15) { pxRect(ctx, bx + 3, -4, 2, 2); }
      }
      ctx.restore();
    }
    ctx.restore();
    return { A, p };
  }

  // 刃尖轨迹：把最近 N 帧的刃尖世界位置连成一条渐隐折线。
  // 半径/角度全部来自该件档案的支点与转角曲线，所以轨迹必然与画面上的刀重合，
  // 不再是第 3 阶段那种"按判定半径画的脱离武器的大弧光"。
  function bladeTrail(ctx, cam, e, art, sw) {
    const sd = art.emit.swing, tr = sd.trail || {};
    const dur = (art.meleeTimeline || { dur: 0.3 }).dur;
    const n = tr.samples == null ? 5 : tr.samples;
    const du = (1 / 60) / dur;
    const col = tr.col || (art.mats && art.mats.edge) || ART_SPEC.materials.steel.edge;
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const uk = Math.max(0, sw.u - k * du);
      const B = WeaponArt.anchorsWorld(e, e.weapon, e.aim, swingOf(art, { swing: { u: uk } }));
      if (!B) return;
      pts.push({ x: B.muzzle.x - cam.x, y: B.muzzle.y - cam.y });
      if (uk <= 0) break;
    }
    const a0 = tr.fade == null ? 0.42 : tr.fade;
    for (let i = 1; i < pts.length; i++) {
      ctx.globalAlpha = Math.max(0.04, a0 * (1 - (i - 0.5) / pts.length));
      ctx.fillStyle = col;
      pxLine(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (tr.width > 1) pxLine(ctx, pts[i - 1].x, pts[i - 1].y + 1, pts[i].x, pts[i].y + 1);
    }
    ctx.globalAlpha = 1;
  }

  function swingArc(ctx, cam, e, art, sw) {
    const u = sw.u;
    if (u < 0.15 || u > 0.75) return;
    const r = (WEAPONS[e.weapon] || {}).range || 60;
    const cx = e.x + e.w / 2 - cam.x, cy = entityFireY(e) - cam.y;
    const t = (u - 0.15) / 0.6;
    const span = 1.4 * 2;                              // 与命中扇区同宽，但只是画出来
    const a0 = e.aim - span / 2 + t * span;
    ctx.globalAlpha = 0.55 * (1 - t) + 0.15;
    ctx.fillStyle = ART_SPEC.materials.glass.edge;
    for (let k = 0; k < 3; k++) {
      const rr = r * (0.62 + k * 0.16);
      pxLine(ctx, cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr,
        cx + Math.cos(a0 + 0.16) * rr, cy + Math.sin(a0 + 0.16) * rr);
    }
    ctx.globalAlpha = 1;
  }

  // 双手连接：把前后手画到锚点上（用于工位与"手部是否连着枪"的实机检查）
  function hands(ctx, cam, e, col) {
    const A = WeaponArt.anchorsWorld(e, e.weapon, e.aim);
    if (!A) return;
    const pts = [A.grip, A.fore].filter(Boolean);
    for (const q of pts) {
      ctx.fillStyle = col || ART_SPEC.materials.fabric.hi;
      pxCircle(ctx, q.x - cam.x, q.y - cam.y, 2);
    }
  }
  // 双手连接：从肩膀到该枪档案的握点/前握点画小臂与手，并跟随枪体同样的后坐与换弹位移。
  // 为什么必须画：角色像素帧里的手位是固定的（躯干右缘第 4 行），而每把枪的握点由各自档案决定，
  // 两者不重合就会出现"手握空气"。第 6 阶段要求"手与枪连接"，所以由锚点反推手的位置。
  function arms(ctx, cam, e, opts) {
    const art = WeaponArt.get(e.weapon);
    if (!art) return;
    const p = pose(e);
    // 与 gun() 用同一个挥砍变换求锚点：近战时手必须跟着刀一起转
    const A = WeaponArt.anchorsWorld(e, e.weapon, e.aim, swingOf(art, p));
    if (!A || typeof PX_CHARS === 'undefined') return;
    const skinArt = typeof OperatorSkins !== 'undefined' ? OperatorSkins.get(e.operatorSkin) : null;
    const u = e.hero
      ? (PX_CHARS.UNITS['hero_' + e.hero] || PX_CHARS.UNITS.human)
      : (skinArt
        ? skinArt.palette
        : (typeof OperatorVanguard !== 'undefined' ? OperatorVanguard.palette : PX_CHARS.UNITS.human));
    const off = (opts && opts.off) || { x: 0, y: 0 };
    // 与 gun() 完全相同的位移公式，保证手不会在开火/换弹时与枪脱开
    let dx = -p.recoil * 3, dy = p.recoil * 0.6;
    if (p.reload) { const u2 = p.reload.u; dy += Math.sin(Math.min(1, u2 * 2) * Math.PI) * 2.2; dx += Math.sin(u2 * Math.PI) * 1.2; }
    if (p.throwing) { dx -= (1 - p.throwing.u) * 2; dy -= Math.sin(p.throwing.u * Math.PI) * 2.5; }
    const ca = Math.cos(e.aim || 0), sa = Math.sin(e.aim || 0);
    const ox = dx * ca - (dy * A.facing) * sa + off.x, oy = dx * sa + (dy * A.facing) * ca + off.y;
    const face = A.facing;
    const shoulderY = e.kind === 'human' && !e.hero
      ? e.y + e.h - humanVisualHeight(e) * 0.70
      : e.y + e.h * 0.30;
    const sh = { x: e.x + e.w / 2 + face * e.w * 0.28 - cam.x, y: shoulderY - cam.y };
    const draw = (pt, sleeve) => {
      if (!pt) return;
      const hx = pt.x - cam.x + ox, hy = pt.y - cam.y + oy;
      ctx.fillStyle = sleeve;
      // 小臂：两点式连线，粗 2px
      const x0 = Math.round(sh.x), y0 = Math.round(sh.y), x1 = Math.round(hx), y1 = Math.round(hy);
      let ddx = Math.abs(x1 - x0), ddy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = ddx - ddy, x = x0, y = y0, guard = 0;
      while (guard++ < 90) {
        ctx.fillRect(x, y, 2, 2);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -ddy) { err -= ddy; x += sx; }
        if (e2 < ddx) { err += ddx; y += sy; }
      }
      ctx.fillStyle = u.glove || u.skin; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
    };
    draw(A.fore, u.clothS);       // 支撑手（先画，压在枪下方）
    draw(A.grip, u.cloth);        // 主握手（握把上）
  }

  function anchorsOverlay(ctx, cam, e, key) {
    const A = WeaponArt.anchorsWorld(e, key || e.weapon, e.aim);
    if (!A) return;
    const marks = [['muzzle', '#ffe94a'], ['eject', '#ff5252'], ['grip', '#4d6fe0'], ['fore', '#39ff14'], ['mag', '#ce93d8'], ['magBase', '#ff9800'], ['sight', '#00e5ff'], ['stock', '#b0bec5']];
    ctx.font = '9px monospace';
    for (const [n, c] of marks) {
      const q = A[n]; if (!q) continue;
      const x = Math.round(q.x - cam.x), y = Math.round(q.y - cam.y);
      ctx.fillStyle = c; ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = '#000'; ctx.fillRect(x, y - 8, 1, 6);
      ctx.fillStyle = c; ctx.fillText(n, x + 4, y - 3);
    }
  }
  // 枪口火光：交给事件时间轴决定出现与消失的时刻（短促起落），并跟随与枪体相同的身体偏移
  // 枪口是否埋进实心体：贴墙、上楼梯、在 46px 门框里举长枪时都会出现。
  // 这时子弹下一帧就撞墙消失，却在墙面上画出一团火球 —— 看起来像隔墙开火。
  // 只压掉这一帧的可见枪口焰（连发时墙外那几帧照常闪），不改弹道、不改判定。
  function muzzleBuried(e, off) {
    const lv = (typeof level !== 'undefined' && level) ? level : null;
    if (!lv || !Array.isArray(lv.solids)) return false;
    const m = WeaponArt.muzzleWorld(e);
    const x = m.x + ((off && off.x) || 0), y = m.y + ((off && off.y) || 0);
    for (const s of lv.solids) {
      if (s.oneway) continue;
      if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
    }
    return false;
  }

  function flash(ctx, cam, e, off) {
    if (typeof ArtEvents === 'undefined') return 0;
    if (muzzleBuried(e, off)) return 0;
    const list = ArtEvents.forEntity(e.id);
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].type !== 'shot') continue;
      acc = Math.max(acc, ArtFX.drawMuzzleFlash(ctx, cam, list[i], { off }));
    }
    return acc;
  }
  return { gun, pose, hands, arms, anchorsOverlay, legacyParts, attachments, partTravel, flash, swingOf, curveAt, bladeTrail };
})();

if (typeof window !== 'undefined') window.ArtDraw = ArtDraw;
