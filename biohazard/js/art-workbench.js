// ============ 美术工位：视觉事件 / 锚点 / 动作时间轴的逐帧诊断台 ============
// QA 工具。两种模式：
//   检视：不产生伤害，手工放置一个"持枪者"，把事件摆到任意归一化进度上逐帧看。
//   训练场：调用真实 tryFire / startReload / meleeSwing / throwGrenade 产生事件，再逐帧看同一套时间轴。
// 显示：事件 ID、武器 ID、机制、阶段名、归一化进度、锚点（枪口/抛壳口/握点/弹匣）、视觉对象数量。
// 部件线框与锚点标记是**调试用**，不是成品美术。
(function () {
  // 工位自己接管帧调度：停掉 game.js 的自动主循环（后台跑整局会干扰受击格的确定性），
  // 播放改用 setTimeout，保证同一事件在同一相位只画同一张图。
  window.requestAnimationFrame = () => 0;
  const stage = document.getElementById('stage');
  const sctx = stage.getContext('2d');
  const gridC = document.getElementById('grid');
  const logEl = document.getElementById('log');
  const el = id => document.getElementById(id);
  const OPT = { anchors: true, wire: true, labels: true };
  let mode = 'inspect', playT = 0, playing = false, slow = 1;

  // 全部 88 条 ID 进入下拉
  (function fill() {
    const operators = el('operator');
    if (typeof OperatorSkins !== 'undefined') {
      for (const id of OperatorSkins.ids) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = OperatorSkins.info[id].name;
        operators.append(option);
      }
      operators.value = OperatorSkins.normalize(new URLSearchParams(location.search).get('operator') || OperatorSkins.selected());
    }
    const sel = el('weapon');
    sel.innerHTML = WEAPON_KEYS.map(k => `<option value="${k}">${k} · ${WEAPONS[k].name}</option>`).join('');
    sel.value = 'ak47';
  })();

  // 检视模式下的"持枪者"：只带绘制需要的字段，不进任何玩法集合
  function holder(key) {
    const w = WEAPONS[key] || {};
    return { id: 900001, kind: 'human', faction: 'human', isPlayer: true, weapon: key,
      operatorSkin: el('operator').value,
      x: 40, y: 30, w: 22, h: 36, vx: 0, vy: 0, aim: 0, facing: 1, muzzleT: 0,
      attachments: [], attFx: null, onGround: true, hero: null, animT: 0,
      mag: w.melee || w.grenade ? Infinity : (w.mag || 30), count: w.count || 0 };
  }

  // 造一个事件并把它摆到指定归一化进度
  function arm(e, action, u, key) {
    ArtEvents.cancelAll('reset');
    bullets.length = 0; particles.length = 0;
    let ev = null;
    if (action === 'shot') ev = ArtEvents.emit('shot', e, { fired: true, shots: 1 });
    else if (action === 'reload') { e.mag = Math.max(0, (WEAPONS[key].mag || 6) - 3); ev = ArtEvents.emit('reloadStart', e, { total: WEAPONS[key].reload || 1.6 }); }
    else if (action === 'melee') ev = ArtEvents.emit('melee', e);
    else if (action === 'throw') ev = ArtEvents.emit('throw', e);
    else if (action === 'cycle') {
      ev = ArtEvents.emit('shot', e, { fired: true, shots: 1 });
      const art = WeaponArt.get(key);
      const cv = art.mechDef.cycle === 'bolt' ? 'bolt' : art.mechDef.cycle === 'pump' ? 'pump' : art.mechDef.cycle === 'break' ? 'break' : art.mechDef.cycle === 'revolver' ? 'revolver' : 'bolt';
      ev = ArtEvents.recent(10).find(x => x.type === 'cycle') || ev;
      u = Math.max(0.01, u);
    }
    if (ev) {
      // 把事件"倒带"到 u：直接推进视觉时钟
      const target = ev.t0 + ev.dur * u;
      let guard = 0;
      while (ArtEvents.clock < target && guard++ < 4000) ArtEvents.step(1 / 240);
    }
    return ev;
  }

  function drawBody(ctx, e, scale, ox, oy, insigniaOnly) {
    const skin = !e.hero && typeof OperatorSkins !== 'undefined' ? OperatorSkins.get(e.operatorSkin) : null;
    const img = insigniaOnly
      ? (skin && skin.getInsignia ? skin.getInsignia('idle', 0) : null)
      : e.hero
      ? PX_CHARS.get('hero_' + e.hero, 'idle', 0, true)
      : (skin
        ? skin.get('idle', 0, 'level')
        : PX_CHARS.get('human', 'idle', 0, true));
    if (!img) return;
    ctx.imageSmoothingEnabled = false;
    const h = (skin ? CFG.HUMAN_VISUAL_H * 60 / 56 : e.h * 1.02) * scale;
    const w = (img.width / img.height) * h;
    ctx.save();
    ctx.translate(ox + (e.x + e.w / 2 - cam0.x) * scale, oy + (e.y + e.h - cam0.y) * scale);
    ctx.scale(e.facing < 0 ? -1 : 1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }
  const cam0 = { x: 0, y: 0 };

  function readout(ev, e) {
    const lines = [];
    const operatorName = typeof OperatorSkins !== 'undefined'
      ? OperatorSkins.info[OperatorSkins.normalize(e.operatorSkin)].name : '默认';
    lines.push(`模式 ${mode}   队员 ${operatorName}   武器 ${e.weapon} · ${WEAPONS[e.weapon].name}`);
    const art = WeaponArt.get(e.weapon);
    lines.push(`机制 ${art.mech}  循环 ${art.mechDef.cycle}  抛壳 ${art.shell}  供弹 ${art.reloadPath}  档案 ${art.legacy ? '旧版兼容(未验收)' : art.ver}`);
    if (ev) {
      const rp = ArtEvents.replay(ev, ArtEvents.clock);
      lines.push(`事件 #${ev.id} type=${ev.type} seq=${ev.seq} 种子=${ev.seed} 阶段=${rp.stage} u=${rp.u.toFixed(3)} dur=${ev.dur.toFixed(3)}s`);
      lines.push(`朝向 ${ev.face}  瞄准 ${(ev.aim * 180 / Math.PI).toFixed(1)}°  配件 [${ev.att.join(',') || '无'}]`);
      const A = ev.anchors || {};
      const fmt = p => p ? `(${(p.x - e.x).toFixed(1)},${(p.y - e.y).toFixed(1)})` : '—';
      lines.push(`锚点 枪口${fmt(A.muzzle)} 抛壳口${fmt(A.eject)} 握把${fmt(A.grip)} 前手${fmt(A.fore)} 弹匣井${fmt(A.mag)} 瞄具${fmt(A.sight)}`);
    }
    const info = ArtEvents.info();
    lines.push(`视觉对象  事件 ${info.active}/${info.cap.active}   弹壳 ${info.shells}/${info.shells && info.cap.shells}   弹匣 ${info.mags}/${info.cap.mags}   历史 ${info.history}`);
    lines.push(`玩法侧    弹体 ${bullets.length}   旧粒子 ${particles.length}   余弹 ${e.mag}   投掷 ${e.count}`);
    return lines;
  }

  // 右侧读数面板：事件 ID / 武器 / 机制 / 阶段 / 归一化进度 / 锚点 / 视觉对象数量
  function panel(lines, x, y) {
    sctx.save();
    sctx.translate(x, y);
    sctx.fillStyle = '#0b1218'; sctx.fillRect(0, 0, 286, 424);
    sctx.strokeStyle = '#223140'; sctx.strokeRect(0.5, 0.5, 286, 424);
    sctx.fillStyle = '#baff5c'; sctx.font = '11px monospace';
    let row = 0;
    for (const ln of lines) {
      const seg = ln.match(/.{1,40}/g) || [''];
      for (const one of seg) { sctx.fillText(one, 7, 16 + row * 13); row++; }
      row += 0.35;
    }
    sctx.restore();
  }

  function render() {
    const key = el('weapon').value;
    const action = el('action').value;
    const u = parseFloat(el('u').value);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = '#0a0f14'; sctx.fillRect(0, 0, stage.width, stage.height);
    let e, ev;
    if (mode === 'inspect') {
      e = holder(key);
      e.attachments = key === 'ak47' ? ['silencer', 'scope4x', 'grip'] : [];
      e.attFx = e.attachments.length ? aggregateAttachFx(e.attachments) : null;
      ev = arm(e, action, u, key);
      const S = 5;
      // 检视尺度：放大画身体 + 枪体 + 锚点线框
      sctx.save();
      sctx.translate(18, 22);
      sctx.scale(S, S);
      sctx.fillStyle = '#141d26'; sctx.fillRect(0, 0, 96, 70);
      sctx.strokeStyle = '#223140'; sctx.lineWidth = 0.25; sctx.strokeRect(0.5, 0.5, 96, 70);
      drawBody(sctx, e, 1, 0, 0);
      ArtDraw.gun(sctx, cam0, e, {});
      ArtDraw.arms(sctx, cam0, e, {});
      drawBody(sctx, e, 1, 0, 0, true);
      if (OPT.wire) wire(sctx, e);
      sctx.restore();
      // 战斗尺度 1:1：正常镜头里实际有多大
      sctx.save();
      sctx.translate(18, 372);
      sctx.fillStyle = '#141d26'; sctx.fillRect(0, 0, 560, 78);
      sctx.strokeStyle = '#223140'; sctx.strokeRect(0.5, 0.5, 560, 78);
      sctx.save(); sctx.translate(240, 8); drawBody(sctx, e, 1, 0, 0); ArtDraw.gun(sctx, cam0, e, {}); ArtDraw.arms(sctx, cam0, e, {}); drawBody(sctx, e, 1, 0, 0, true); sctx.restore();
      sctx.save(); sctx.translate(400, 8); e.facing = -1; e.aim = Math.PI; drawBody(sctx, e, 1, 0, 0); ArtDraw.gun(sctx, cam0, e, {}); ArtDraw.arms(sctx, cam0, e, {}); drawBody(sctx, e, 1, 0, 0, true); sctx.restore();
      sctx.restore();
      sctx.fillStyle = '#7dffb0'; sctx.font = 'bold 11px monospace';
      sctx.fillText('检视尺度 ×5（调试线框与锚点，非成品美术）', 18, 14);
      sctx.fillText('战斗尺度 ×1：右朝向 / 左朝向（正常镜头人物 62px）', 18, 366);
      panel(readout(ev, e), 600, 22);
    } else {
      // 训练场：真实 tryFire / startReload / meleeSwing / throwGrenade 驱动
      e = liveSetup(key);
      ev = liveFire(e, action, u);
      const cam = { x: Math.max(0, e.x + e.w / 2 - 280), y: Math.max(0, e.y - 120) };
      sctx.save();
      sctx.beginPath(); sctx.rect(0, 0, 600, stage.height); sctx.clip();
      UI.drawWorld(sctx, cam, 0, 0);
      sctx.restore();
      if (OPT.anchors) {
        const A = WeaponArt.anchorsWorld(e, e.weapon, e.aim);
        sctx.save(); sctx.translate(-cam.x, -cam.y); wireAt(sctx, A); sctx.restore();
      }
      panel(readout(ev, e).concat(['训练场：事件由真实 tryFire/startReload/', 'meleeSwing/throwGrenade 产生']), 600, 22);
    }
    logEl.textContent = readout(ev, e).join('\n');
  }

  // 检视模式的调试线框：把档案里的锚点画成十字 + 名称
  function wire(ctx, e) {
    if (!OPT.anchors) return;
    const A = WeaponArt.anchorsWorld(e, e.weapon, e.aim);
    if (!A) return;
    const marks = [['muzzle', '#ffe94a'], ['eject', '#ff5252'], ['grip', '#4d6fe0'], ['fore', '#39ff14'], ['mag', '#ce93d8'], ['sight', '#00e5ff'], ['stock', '#b0bec5']];
    for (const [n, c] of marks) {
      const q = A[n]; if (!q) continue;
      ctx.fillStyle = c;
      ctx.fillRect(q.x - 0.6, q.y - 0.15, 1.2, 0.3);
      ctx.fillRect(q.x - 0.15, q.y - 0.6, 0.3, 1.2);
      if (OPT.labels) { ctx.fillStyle = c; ctx.font = '1.6px monospace'; ctx.fillText(n[0], q.x + 0.7, q.y + 0.6); }
    }
  }

  // 训练场模式下的锚点标记（世界坐标，1:1）
  function wireAt(ctx, A) {
    if (!A) return;
    const marks = [['muzzle', '#ffe94a'], ['eject', '#ff5252'], ['grip', '#4d6fe0'], ['fore', '#39ff14'], ['mag', '#ce93d8'], ['sight', '#00e5ff']];
    ctx.font = '9px monospace';
    for (const [n, c] of marks) {
      const q = A[n]; if (!q) continue;
      ctx.fillStyle = c;
      ctx.fillRect(q.x - 3, q.y - 1, 7, 2); ctx.fillRect(q.x - 1, q.y - 3, 2, 7);
      if (OPT.labels) ctx.fillText(n, q.x + 5, q.y - 2);
    }
  }

  // ---------- 训练场模式 ----------
  let LIVE = null;
  function liveSetup(key) {
    if (!LIVE || LIVE.key !== key) {
      Training.mode = true; Training.kind = 'range'; Training.weapon = key;
      setupRoom(1);
      for (let i = game.entities.length - 1; i >= 0; i--) if (game.entities[i].kind === 'zombie') game.entities.splice(i, 1);
      LIVE = { key, p: game.player };
    }
    const p = LIVE.p;
    p.operatorSkin = el('operator').value;
    p.invuln = true; p.x = 400; p.y = level.groundTop - p.h; p.vx = 0; p.vy = 0; p.onGround = true;
    p.aim = 0; p.facing = 1; p.recoilKick = 0; p.recoilSide = 0; p.bloom = 0;
    if (p.weapon !== key) switchWeapon(p, key);
    p.mag = 99999; p.count = 99; p.fireT = 0; p.reloading = false; p.reloadT = 0;
    bullets.length = 0; particles.length = 0;
    ArtEvents.cancelAll('reset');
    return p;
  }
  function liveFire(p, action, u) {
    let ev = null;
    if (action === 'reload') { p.mag = 2; startReload(p); ev = ArtEvents.recent(1)[0]; }
    else if (action === 'melee') { meleeSwing(p, WEAPONS[p.weapon]); ev = ArtEvents.recent(1)[0]; }
    else if (action === 'throw') { throwGrenade(p, WEAPONS[p.weapon], 0.5); ev = ArtEvents.emit('throw', p); }
    else { tryFire(p, 0.016); ev = ArtEvents.recent(1)[0]; }
    if (ev) { const target = ev.t0 + ev.dur * u; let g = 0; while (ArtEvents.clock < target && g++ < 4000) ArtEvents.step(1 / 240); }
    return ev;
  }

  // ---------- 10 个机制样板 ----------
  const SAMPLES = [
    ['ak47', 'shot', 'AK-47 自动射击'], ['famas', 'shot', 'FAMAS 三连发'],
    ['rex', 'cycle', 'Rex 左轮转巢'], ['m1014', 'cycle', 'M1014 泵动抽壳'],
    ['dbbl', 'cycle', '双管猎枪开膛'], ['gatling', 'shot', '加特林旋转'],
    ['laser', 'shot', '激光毁灭者(无壳)'], ['grenade', 'throw', '普通手雷投掷'],
    ['knife', 'melee', '军用匕首挥砍'], ['hero_light', 'shot', '英雄武器(无壳)'],
  ];
  function buildGrid() {
    const COLS = 5, CW = 250, CH = 150, ROWS = Math.ceil(SAMPLES.length / COLS);
    gridC.width = COLS * CW; gridC.height = ROWS * (CH + 26);
    const g = gridC.getContext('2d');
    g.imageSmoothingEnabled = false;
    SAMPLES.forEach(([key, action, label], i) => {
      const gx = (i % COLS) * CW, gy = Math.floor(i / COLS) * (CH + 26);
      g.fillStyle = i % 2 ? '#0d141c' : '#111a22'; g.fillRect(gx, gy, CW, CH + 26);
      const e = holder(key);
      e.attachments = []; e.attFx = null;
      arm(e, action, 0.35, key);
      g.save();
      g.translate(gx + 22, gy + 30);
      g.scale(3.2, 3.2);
      drawBody(g, e, 1, 0, 0);
      ArtDraw.gun(g, cam0, e, {});
      wire(g, e);
      g.restore();
      const art = WeaponArt.get(key);
      g.fillStyle = '#baff5c'; g.font = 'bold 11px monospace';
      g.fillText(label, gx + 6, gy + CH + 4);
      g.fillStyle = '#7d8fa5'; g.font = '10px monospace';
      g.fillText(`${key} · ${art.mechDef.cycle}/${art.shell} · 旧版兼容`, gx + 6, gy + CH + 18);
    });
    ArtEvents.cancelAll('reset');
  }

  // ---------- 受击侧对照：必须走生产用的 HitArtEvent 绘制路径 ----------
  // 工位可能在训练场模式之外运行，因此自带一个最小"攻击者"，只用于 damageEntity 的归属判定
  function attacker0() {
    return { id: 900002, kind: 'human', faction: 'human', team: null, isPlayer: false,
      x: -400, y: 0, w: 22, h: 36, weapon: 'ak47', aim: 0, facing: 1, hp: 100, maxHp: 100, dead: false };
  }
  // 状态层：单独量一次，证明"关掉基础受击，状态数值照旧"
  const STATUS = {};
  function statusProbe(k) {
    const z = dummyTarget(60, 70);
    applyWeaponFx(z, k, attacker0(), 10);
    STATUS[k] = { slowT: +z.slowT.toFixed(3), slowMul: z.slowMul, burnT: +z.burnT.toFixed(3), markT: +z.markT.toFixed(3), markMul: z.markMul };
    return STATUS[k];
  }
  const hitC = document.getElementById('hitwall-canvas');
  const CATS6 = ['assault', 'sniper', 'smg', 'shotgun', 'lmg', 'pistol'];
  const CAT_REP = { assault: 'ak47', sniper: 'awm', smg: 'vector', shotgun: 'm1014', lmg: 'm249', pistol: 'usp' };
  const CW = 200, CH = 150;

  // 造一个"只用于呈现"的僵尸靶：不进 game.entities，因此不会被 AI 干扰
  function dummyTarget(x, y) {
    const z = makeZombie('normal', { x, y, isPlayer: false });
    z.speed = 0; z.attackCd = 99999; z.invuln = true;   // invuln：读数面板式，不真死
    return z;
  }
  function drawZombie(ctx, z, camx, camy) {
    const img = PX_CHARS.get('z_normal', 'idle');
    const h = z.h * 1.02, w = (img.width / img.height) * h;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, z.x - camx + z.w / 2 - w / 2, z.y - camy + z.h - h, w, h);
  }
  // 一次受击：通过生产入口 damageEntity 带 hitCtx 发事件，再推进到指定相位并绘制
  function hitCell(ctx, ox, oy, opt) {
    const z = dummyTarget(60, 70);
    const cam = { x: 0, y: 0 };
    // 固定背景
    ctx.fillStyle = opt.bg || '#121a22'; ctx.fillRect(ox, oy, CW, CH);
    ctx.fillStyle = '#1b2530'; ctx.fillRect(ox, oy + CH - 26, CW, 26);
    if (opt.solid) {
      ctx.fillStyle = opt.solid === 'metal' ? '#3a4550' : (opt.solid === 'stone' ? '#4a4a4a' : (opt.solid === 'nomat' ? '#3d4148' : '#5a3f22'));
      ctx.fillRect(ox + 44, oy + 40, 60, 70);
    }
    if (!opt.solid) drawZombie(ctx, z, -ox, -oy);
    // 干净的事件环境
    HitArt.reset('reset');
    const px = opt.solid ? 74 : z.x + z.w / 2, py = opt.solid ? 74 : z.y + z.h * 0.42;
    const hits = opt.burst || 1;
    for (let i = 0; i < hits; i++) {
      if (opt.solid) HitArt.emit({ key: opt.key, solid: { x: 44, y: 40, w: 60, h: 70, mat: opt.solid === 'nomat' ? undefined : opt.solid }, x: px + (i % 3) * 4, y: py, dir: 0, method: 'surface' });
      else {
        const zz = z;
        zz.x = px - 11; zz.y = py - 15;
        damageEntity(zz, 10, attacker0(), { key: opt.key, x: px + (i % 3) * 4, y: py, dir: 0, method: opt.method || 'bullet' });
      }
      HitArt.step(1 / 120);
    }
    const u = opt.u == null ? 0.18 : opt.u;
    const ev0 = HitArt.events[0];
    const need = ev0 ? ev0.dur * u : 0;
    let guard = 0;
    while (HitArt.info().clock < need && guard++ < 400) HitArt.step(1 / 240);
    ctx.save(); ctx.translate(ox, oy);
    HitArt.draw(ctx, cam);
    ctx.restore();
    const info = HitArt.info();
    return { cat: ev0 ? ev0.cat : '—', parts: info.parts, events: info.events, mat: ev0 ? ev0.matKey : '—' };
  }

  function buildHitWall() {
    const u = parseFloat(document.getElementById('hu').value);
    const rows = 4, ROW = CH + 34;
    hitC.width = CW * 6; hitC.height = ROW * rows + 18;
    const g = hitC.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#05080b'; g.fillRect(0, 0, hitC.width, hitC.height);
    const showLabels = OPT.labels;
    // 第 1 行：六类各命中一次
    CATS6.forEach((c, i) => {
      hitCell(g, i * CW, 0, { key: CAT_REP[c], u });
      if (showLabels) { g.fillStyle = '#baff5c'; g.font = 'bold 11px monospace'; g.fillText(`单次 · ${c}`, i * CW + 6, 0 * ROW + CH + 13); }
    });
    // 第 2 行：六类连续命中（8 发聚合节奏）
    CATS6.forEach((c, i) => {
      hitCell(g, i * CW, ROW, { key: CAT_REP[c], u, burst: 8 });
      if (showLabels) { g.fillStyle = '#7dffb0'; g.font = '11px monospace'; g.fillText(`连射 8 发 · ${c}`, i * CW + 6, 1 * ROW + CH + 13); }
    });
    // 第 3 行：四组关键对照 —— 同族两把 / 材质
    const row3 = [
      { key: 'ak47', tag: 'AK-47 打僵尸' }, { key: 'm4a1', tag: 'M4A1 打僵尸（应与左同）' },
      { key: 'awm', tag: 'AWM 打僵尸' }, { key: 'svd', tag: 'SVD 打僵尸（应与左同）' },
      { key: 'ak47', solid: 'stone', tag: '同枪打石墙' }, { key: 'ak47', solid: 'metal', tag: '同枪打金属' },
    ];
    row3.forEach((o, i) => {
      hitCell(g, i * CW, ROW * 2, o);
      if (showLabels) { g.fillStyle = '#8fb0c8'; g.font = '11px monospace'; g.fillText(o.tag, i * CW + 6, 2 * ROW + CH + 13); }
    });
    // 第 4 行：材质三种 + 状态叠加三种 + 未知材质
    const row4 = [
      { key: 'ak47', solid: 'wood', tag: '木' }, { key: 'ak47', solid: 'nomat', tag: '无材质标记(保守)' },
      { key: 'ak47', tag: '普通命中' }, { key: 'ak47', tag: '命中+燃烧', status: 'burn' },
      { key: 'ak47', tag: '命中+减速', status: 'slow' }, { key: 'ak47', tag: '命中+标记', status: 'mark' },
    ];
    row4.forEach((o, i) => {
      hitCell(g, i * CW, ROW * 3, o);
      if (o.status) { const st = statusProbe(o.status);
        if (showLabels) { g.fillStyle = '#ffd54f'; g.font = '10px monospace';
          g.fillText('状态数值 ' + JSON.stringify(st).slice(0, 26), i * CW + 6, 3 * ROW + CH + 26); } }
      if (showLabels) { g.fillStyle = '#8fb0c8'; g.font = '11px monospace'; g.fillText(o.tag, i * CW + 6, 3 * ROW + CH + 13); }
    });
    if (showLabels) {
      g.fillStyle = '#7d8fa5'; g.font = '11px monospace';
      g.fillText('第 4 行：材质两种 + 同一把枪的普通命中与三种状态叠加 —— 基础受击完全相同，状态数值另层生效（本墙不画状态视觉）', 6, ROW * rows + 12);
    }
    HitArt.reset('reset');
    return { cells: row3.length + row4.length + 12, u };
  }

  // ---------- 控件 ----------
  ['mode', 'operator', 'weapon', 'action', 'u'].forEach(id => el(id).addEventListener('change', () => { mode = el('mode').value; render(); }));
  el('u').addEventListener('input', () => render());
  el('step1').addEventListener('click', () => { el('u').value = Math.min(1, parseFloat(el('u').value) + 0.02); render(); });
  el('stepn').addEventListener('click', () => { el('u').value = Math.min(1, parseFloat(el('u').value) + 0.2); render(); });
  el('play').addEventListener('click', () => { playing = !playing; el('play').classList.toggle('on', playing); if (playing) loop(); });
  el('slow').addEventListener('change', () => { slow = parseFloat(el('slow').value); });
  ['anchors', 'wire', 'labels'].forEach(id => el(id).addEventListener('click', () => { OPT[id] = !OPT[id]; el(id).classList.toggle('on', OPT[id]); render(); }));
  el('grid10').addEventListener('click', buildGrid);
  el('hitwall').addEventListener('click', buildHitWall);
  el('hu').addEventListener('input', () => { if (hitC.width) buildHitWall(); });
  function loop() {
    if (!playing) return;
    const v = parseFloat(el('u').value) + 0.008 * slow;
    el('u').value = v > 1 ? 0 : v;
    render();
    setTimeout(loop, 16);
  }
  mode = el('mode').value;
  render();
  buildGrid();
  window.WB = { render, buildGrid, buildHitWall, hitCell, arm, holder, get mode() { return mode; } };
})();
