// ============ 疾驰列车 · 地图总览（调试工具，画的是「碰撞世界 + 主路线」本身） ============
// 阶段一的产物是数据，不是美术，所以总览刻意不做任何美化：
// 直接把 buildSolids 出来的每一块实体、每一把换层爬梯与它的检修口、每一扇门的通高矩形、
// 以及验证器走过的那条主路线原样描出来 —— 图上一眼能看出的毛病，就是闸门下一步要断言的毛病。
const TrainOverview = (() => {
  const YTOP = 140, YBOT = 430;                  // 世界纵向范围：横梁顶(≈150) → 车底维修道(418)
  const COL = {
    bg: '#10151c', panel: '#1a222c', body: '#26313d',
    floor: '#6f8399', plank: '#9a6b3a', roof: '#4d6076', stair: '#f2d34a',
    door: '#d75a4f', seam: '#3fbfa8', deckCrate: '#c98b3c', deckSteel: '#8fa3b8',
    gear: '#6d5f9c', gantry: '#a35fb0', under: '#39485a', platform: '#7c7f86',
    route: '#ffffff', routeRoof: '#9ff2e0', fit: 'rgba(140,190,255,0.22)',
    cp: '#ffd45e', text: '#cfe0f2', dim: '#6b7d92',
  };
  const CH_COL = ['#8d6e2f', '#3f6ea8', '#a84343', '#2f8f86', '#c2b06a', '#8a5a2b', '#2f3f57', '#7c4a94'];
  const t = (ctx, s, x, y, col, size, align) => {
    ctx.fillStyle = col || COL.text; ctx.font = (size || 11) + 'px monospace';
    ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); ctx.textAlign = 'left';
  };

  // 主路线在这一节车里走过的折线：入层平跑 → 爬梯竖直一段 → 出层平跑到接缝
  function carRoutePath(car) {
    const yIn = car.routeIn === 'ROOF' ? car.yRoof : car.yFloor;
    const yOut = car.routeOut === 'ROOF' ? car.yRoof : car.yFloor;
    const pts = [[car.x0 + 4, yIn]];
    const L = car.links[0];
    // 换层画成竖直线而不是沿踏面的斜线：真实运动就是竖直爬，斜线是一张「可以斜着走」的假承诺
    if (L) { pts.push([L.x + 8, yIn]); pts.push([L.x + 8, yOut]); pts.push([L.exit.x1, yOut]); }
    pts.push([car.x1 + 24, yOut]);
    return pts;
  }

  function rowMap(X0, Y0, W, H, x0, x1) {
    const sx = W / (x1 - x0), sy = H / (YBOT - YTOP);
    return { sx, sy, X: x => X0 + (x - x0) * sx, Y: y => Y0 + (y - YTOP) * sy };
  }

  // 一块碰撞体：颜色按「它在路线里扮演什么角色」分，而不是按材质
  function solidColor(s) {
    if (s.door) return COL.door;
    if (s.seam) return COL.seam;
    if (s.plank) return COL.plank;
    if (s.roof) return COL.roof;
    if (s.gantry) return COL.gantry;
    if (s.roofGear) return COL.gear;
    if (s.deck) return s.mat === 'steel' ? COL.deckSteel : COL.deckCrate;
    if (s.under) return COL.under;
    if (s.platform) return COL.platform;
    return COL.floor;
  }

  function drawSolids(ctx, M, lo, hi, m, minW) {
    for (const s of M.solids) {
      if (s.x + s.w < lo || s.x > hi) continue;
      const X = m.X(s.x), Y = m.Y(s.y), W = Math.max(minW || 1, s.w * m.sx), H = Math.max(1, s.h * m.sy);
      ctx.fillStyle = solidColor(s); ctx.fillRect(X, Y, W, H);
      if (s.main) { ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(X, Y, W, 1); }
    }
  }

  function drawRoute(ctx, M, lo, hi, m) {
    ctx.lineWidth = 1.6;
    for (const car of M.cars) {
      if (car.x1 < lo || car.x0 > hi) continue;
      const pts = carRoutePath(car);
      ctx.strokeStyle = car.routeIn === 'ROOF' || car.routeOut === 'ROOF' ? COL.routeRoof : COL.route;
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(m.X(p[0]), m.Y(p[1])) : ctx.moveTo(m.X(p[0]), m.Y(p[1])));
      ctx.stroke();
    }
    for (const L of M.links) {                        // 换层点：梯底与梯顶两个落点
      if (L.exit.x1 < lo || L.x > hi) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(m.X(L.x + 8) - 1.5, m.Y(L.y0) - 3, 3, 3);
      ctx.fillRect(m.X(L.x + 8) - 1.5, m.Y(L.y1) - 3, 3, 3);
    }
  }

  // ---------- 顶部：整列车一张纵剖面 ----------
  function profile(ctx, M, X0, Y0, W, H) {
    const m = rowMap(X0, Y0, W, H, -460, M.trainLen + 600);
    ctx.fillStyle = COL.panel; ctx.fillRect(X0, Y0, W, H);
    for (const layer of ['ROOF', 'FLOOR', 'UNDER']) {
      const y = layer === 'ROOF' ? M.cars[0].yRoof : layer === 'FLOOR' ? TrainGen.FLOOR : TrainGen.UNDER;
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(X0, m.Y(y), W, 1);
      t(ctx, layer, X0 - 46, m.Y(y) + 3, COL.dim, 10);
    }
    let ch = -1;
    for (const car of M.cars) {
      if (car.chapter !== ch) { ch = car.chapter; ctx.fillStyle = CH_COL[ch]; ctx.fillRect(m.X(car.x0), Y0, Math.max(1, (car.x1 - car.x0) * m.sx), 3); }
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(m.X(car.x0), m.Y(car.yRoof), Math.max(1, car.len * m.sx), (car.yFloor - car.yRoof) * m.sy);
    }
    drawRoute(ctx, M, -460, M.trainLen + 600, m);
    for (const L of M.links) { ctx.fillStyle = COL.stair; ctx.fillRect(m.X(L.x) - 0.5, m.Y(L.y1), 1.5, Math.max(1, (L.y0 - L.y1) * m.sy)); }
    for (const cp of M.checkpoints) {
      ctx.fillStyle = COL.cp; ctx.fillRect(m.X(cp.x) - 1, Y0 - 8, 2, 8);
      ctx.fillRect(m.X(cp.x) - 1, Y0 - 8, 6, 3);
    }
    // 章节事件与据点锁门：时长构成里「强制且可测」的那一段，总览必须看得见，否则账对不上
    for (const ev of (M.events || [])) {
      const x = m.X(ev.x);
      ctx.fillStyle = '#e06ad0';
      ctx.beginPath(); ctx.moveTo(x, Y0 + H + 30); ctx.lineTo(x + 4, Y0 + H + 34); ctx.lineTo(x, Y0 + H + 38); ctx.lineTo(x - 4, Y0 + H + 34); ctx.fill();
      t(ctx, ev.name, x + 6, Y0 + H + 37, '#b98fc4', 9);
    }
    for (const cp of M.checkpoints) {
      if (!cp.gate) continue;
      const x = m.X(cp.x);
      let gx = x + 8;
      for (const c of M.cars) { const d = c.doors.find(q => q.id === cp.gate); if (d) gx = m.X(d.x); }
      ctx.fillStyle = 'rgba(255,212,94,0.6)'; ctx.fillRect(Math.min(x, gx), Y0 + H + 42, Math.max(2, gx - x), 3);
      t(ctx, '守' + cp.hold + 's', x + 2, Y0 + H + 53, COL.cp, 9);
    }
    t(ctx, '整列 ' + M.cars.length + ' 节 / ' + Math.round(M.trainLen) + 'px ≈ ' + (M.trainLen / 1000).toFixed(2) + 'km（20px=1m）',
      X0, Y0 + H + 13, COL.text, 11);
    const holdSum = M.checkpoints.reduce((a, c) => a + (c.hold || 0), 0);
    t(ctx, '纯通行 ' + fmt(M.traverse.t) + ' · 据点坚守合计 ' + Math.round(holdSum) + 's · 换层 ' + M.links.length +
      ' 次 · 事件 ' + (M.events || []).length + ' 个 · 黄=爬梯与检修口 白点=检查点 紫菱=章节事件 黄条=锁门',
      X0 + W * 0.30, Y0 + H + 13, COL.dim, 11);
    // 章节刻度
    let x = -460, i = 0;
    for (const c of M.cars) if (c.chapter !== i) { i = c.chapter; ctx.fillStyle = CH_COL[i]; ctx.fillRect(m.X(c.x0), Y0 + H + 18, 3, 4); t(ctx, 'CH' + i, m.X(c.x0) + 5, Y0 + H + 24, COL.dim, 9); }
    return m;
  }
  function fmt(s) { if (!s) return '--'; return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0'); }

  // ---------- 一个章节一行放大 ----------
  function chapterRow(ctx, M, ch, X0, Y0, W, H) {
    const cars = M.cars.filter(c => c.chapter === ch);
    const x0 = cars[0].x0 - 20, x1 = cars[cars.length - 1].x1 + 30;
    const m = rowMap(X0, Y0, W, H, x0, x1);
    ctx.fillStyle = COL.panel; ctx.fillRect(X0, Y0, W, H);
    ctx.fillStyle = CH_COL[ch]; ctx.fillRect(X0, Y0, 3, H);
    // 车体轮廓不参与碰撞，先铺一层：否则「这节车没有车顶实体」和「车顶是空的」看起来一样
    for (const car of cars) {
      const X = m.X(car.x0), Wd = Math.max(2, car.len * m.sx);
      ctx.fillStyle = 'rgba(58,74,92,0.45)';
      ctx.fillRect(X, m.Y(car.yCeil), Wd, Math.max(1, (car.yFloor - car.yCeil) * m.sy));
      ctx.fillStyle = '#2e3b49';
      ctx.fillRect(X, m.Y(car.yRoof - 14), Wd, 2);
      ctx.fillRect(X, m.Y(car.yRoof), 1, (car.yFloor - car.yRoof) * m.sy);
      ctx.fillRect(m.X(car.x1) - 1, m.Y(car.yRoof), 1, (car.yFloor - car.yRoof) * m.sy);
    }
    drawSolids(ctx, M, x0, x1, m);
    for (const car of cars) {                          // 家具是非实体装饰，半透明画出来
      ctx.fillStyle = COL.fit;
      for (const f of car.furniture) ctx.fillRect(m.X(f.x), m.Y(car.yFloor - f.h), Math.max(1, f.w * m.sx), Math.max(1, f.h * m.sy));
    }
    drawRoute(ctx, M, x0, x1, m);
    for (const car of cars) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(m.X(car.x0), Y0 + H - 13, Math.max(2, car.len * m.sx), 12);
      t(ctx, car.type.slice(0, 3).toUpperCase(), m.X(car.x0) + 3, Y0 + H - 3, car.routeIn === 'ROOF' ? COL.routeRoof : COL.text, 9);
    }
    const span = x1 - x0, secs = M.traverse.perCar ? cars.reduce((a, c) => a + (M.traverse.perCar[c.i] || 0), 0) : 0;
    const lad = cars.reduce((a, c) => a + c.ladders.length, 0), hol = cars.reduce((a, c) => a + c.holes.length, 0);
    t(ctx, 'CH' + ch + ' ' + TrainGen.CHAPTERS[ch].name + ' · ' + cars.length + ' 节 ' + Math.round(span) + 'px · '
      + fmt(secs) + ' · 门 ' + cars.reduce((a, c) => a + c.doors.length, 0) + ' 换层梯 ' + cars.reduce((a, c) => a + c.links.length, 0)
      + ' 洞 ' + hol + ' 支梯 ' + lad + ' 家具 ' + cars.reduce((a, c) => a + c.furniture.length, 0)
      + ' 坚守 ' + M.checkpoints.filter(q => q.chapter === ch).reduce((a, q) => a + (q.hold || 0), 0) + 's',
      X0 + 8, Y0 - 5, COL.text, 11);
    return m;
  }

  // 版面只在这里算一次：页面要先按它开 canvas，再画，两处公式不能各写一份
  function layout(o) {
    const opt = o || {};
    const W = opt.w || 2000, rowH = opt.rowH || 250, pad = 22, gap = 40;
    const profY = 44, profH = 96, first = profY + profH + 92;   // 92：剖面下方还要放章节事件菱形与据点锁门条
    const rows = TrainGen.CHAPTERS.map((c, ch) => ({ ch, y: first + ch * (rowH + gap), h: rowH }));
    const last = rows[rows.length - 1];
    return { W, H: last.y + last.h + 90, pad, rowH, profY, profH, rows };
  }

  // ---------- 整张总览 ----------
  function sheet(ctx, M, o) {
    const L = layout(o), W = L.W, H = L.H, pad = L.pad;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
    t(ctx, '疾驰列车生化追击 · 编组与主路线总览（画的是碰撞世界本身，不是美术）', pad, 26, '#eaf2fb', 15);
    t(ctx, 'seed ' + M.seed + ' · 目标 ' + (M.opts.minutes || '-') + ' 分 / 车厢 ' + (M.opts.cars || '-')
      + ' · ruin ' + M.opts.ruin + ' · 车速 ' + M.opts.speedKmh + 'km/h（K=' + M.worldK.toFixed(2) + '）'
      + ' · 通行 ' + fmt(M.traverse.t) + (M.traverse.ok ? '' : ' FAIL ' + M.traverse.reason), pad + W - 900, 26, COL.dim, 11);
    profile(ctx, M, pad, L.profY, W - pad * 2, L.profH);
    for (const r of L.rows) chapterRow(ctx, M, r.ch, pad, r.y, W - pad * 2, r.h);
    // 图例
    let ly = L.H - 62, lx = pad;
    const leg = [['爬梯＋车顶检修口（实测逐把爬得上）', COL.stair], ['车顶板', COL.roof], ['车厢地板', COL.floor],
      ['车门（通高，必须开）', COL.door], ['车厢接缝', COL.seam], ['走道障碍箱', COL.deckCrate], ['床板/货架', COL.deckSteel],
      ['破洞跳板', COL.plank], ['车顶设备', COL.gear], ['低限高横梁', COL.gantry], ['车底维修道', COL.under],
      ['起终点站台', COL.platform], ['家具（非实体）', COL.fit], ['车体轮廓（无实体，纯装饰）', '#2e3b49'],
      ['章节事件', '#e06ad0'], ['据点锁门（守满才开）', COL.cp]];
    ctx.font = '11px monospace';
    for (const [name, col] of leg) {
      ctx.fillStyle = col; ctx.fillRect(lx, ly, 12, 9);
      t(ctx, name, lx + 16, ly + 8, COL.text, 11);
      lx += 24 + ctx.measureText(name).width;
      if (lx > W - 240) { lx = pad; ly += 16; }
    }
    return { w: W, h: H };
  }

  return { sheet, layout, profile, chapterRow, carRoutePath, COL };
})();
