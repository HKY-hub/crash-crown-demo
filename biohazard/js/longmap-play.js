// ============ 长地图 · 可玩验证场景 ============
// 目的不是做战斗，而是「真的走一遍」：测试角色 + 追击者占位 + 跟随镜头 + 参数面板。
// 物理与主游戏同构（AABB，先 X 后 Y，oneway 平台，重力/跳跃初速取 CFG），
// 所以这里能走通 == 接进游戏后能走通。
const LongMapPlay = (() => {
  let canvas, ctx, M, cam, player, chasers, hud, keys = {}, raf = 0, lastT = 0, params;
  const CW = 960, CH = 540;

  function step(M, e, dt, mv, jump) {
    const solids = LongMapGen.nearSolids(M, e.x - 160, e.x + e.w + 160);
    e.speed = e.speed || LongMapGen.MOVE.speed;
    const target = mv * e.speed;
    e.vx += (target - e.vx) * Math.min(1, dt * 14);
    if (Math.abs(e.vx) < 1) e.vx = 0;
    if (jump && e.onGround) { e.vy = -LongMapGen.MOVE.jumpV; e.onGround = false; }
    e.vy += LongMapGen.MOVE.g * dt;
    if (e.vy > 1250) e.vy = 1250;
    e.x += e.vx * dt;
    for (const s of solids) {
      if (s.oneway) continue;
      if (e.x < s.x + s.w && e.x + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y) {
        if (e.vx > 0) e.x = s.x - e.w; else if (e.vx < 0) e.x = s.x + s.w;
        e.vx = 0; e.bumped = true;
      }
    }
    const prevBottom = e.y + e.h;
    e.y += e.vy * dt;
    const wasGround = e.onGround;
    e.onGround = false;
    for (const s of solids) {
      if (e.x >= s.x + s.w || e.x + e.w <= s.x) continue;
      if (e.y >= s.y + s.h || e.y + e.h <= s.y) continue;
      if (s.oneway) { if (e.vy > 0 && prevBottom <= s.y + 12) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; } continue; }
      if (e.vy > 0) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; } else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
    }
    e.bumped = e.bumped && Math.abs(e.vx) < 8;
    return wasGround;
  }

  function makeMover(M, x, y, speed, kind) {
    return { x, y, vx: 0, vy: 0, w: LongMapGen.MOVE.w, h: LongMapGen.MOVE.h,
      onGround: false, speed, kind, jumpT: 0, stuck: 0, lastX: x, phase: Math.random() * 6 };
  }

  function reset(seed, p) {
    params = p;
    M = LongMapGen.build(seed, p);
    const gy = M.groundAt(60);
    player = makeMover(M, 60, gy - LongMapGen.MOVE.h - 1, LongMapGen.MOVE.speed, 'player');
    chasers = [];
    const n = 3 + Math.round(p.chase * 5);
    for (let i = 0; i < n; i++)
      chasers.push(makeMover(M, -140 - i * 60, gy - LongMapGen.MOVE.h - 1, LongMapGen.MOVE.chaserSpeed * (0.86 + i * 0.05), 'chaser'));
    cam = { x: 0, y: Math.max(0, Math.min(M.world.h - CH, gy - CH * 0.68)), shake: 0 };
    hud = { cp: -1, dist: 0, fps: 60, calls: 0, dead: 0, t: 0, win: false, msg: '', msgT: 0 };
    document.getElementById('seedTag').textContent =
      'seed=' + M.seed + ' · ' + M.segments.length + ' 段 · ' + (M.world.w / CW).toFixed(1) + ' 屏 (' +
      (M.world.w / 1000).toFixed(1) + 'k px) · 预计通关 ' + fmt(M.opts.eta * 60) + ' · 主路线 ' +
      (M.validate.main.ok ? '可通行' : '不通(' + M.validate.main.reason + ')') + ' · 追击者 ' +
      (M.validate.chaser.ok ? '可通行' : '不通(' + M.validate.chaser.reason + ')') +
      ' · 支路 ' + M.branches.length + ' · 道具 ' + M.props.length;
  }

  function respawnPoint() {
    const c = hud.cp >= 0 ? M.checkpoints[hud.cp] : null;
    const x = c ? c.x + 10 : 60;
    return { x, y: M.groundAt(x) - LongMapGen.MOVE.h - 1 };
  }

  function update(dt) {
    hud.t += dt;
    // ---- 玩家 ----
    const mv = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
    const jump = keys[' '] || keys['w'] || keys['arrowup'];
    player.bumped = false;
    step(M, player, dt, mv, jump);
    if (player.y > M.world.h + 60) { const r = respawnPoint(); player.x = r.x; player.y = r.y; player.vx = player.vy = 0; hud.dead++; flash('掉出世界 → 回到检查点'); }
    // ---- 检查点 / 终点 ----
    M.checkpoints.forEach((c, i) => { if (i === hud.cp + 1 && Math.abs(player.x - c.x) < 40) { hud.cp = i; flash('检查点 ' + (i + 1) + ' · ' + c.name); } });
    if (player.x > M.world.w - 120 && !hud.win) { hud.win = true; flash('抵达撤离点'); }
    // ---- 追击者：沿主路线死追，被挡住就跳（与 ai.js 同一策略） ----
    for (const c of chasers) {
      c.bumped = false;
      const dir = player.x > c.x ? 1 : -1;
      if (Math.abs(c.x - player.x) > 900) { const r = respawnPoint(); c.x = r.x - 260 - Math.random() * 200; c.y = M.groundAt(c.x) - c.h - 1; }
      const stuckNow = Math.abs(c.x - c.lastX) < 0.6 && c.onGround;
      c.stuck = stuckNow ? c.stuck + 1 : 0;
      c.lastX = c.x;
      if (c.bumped || c.stuck > 6) c.jumpT = 8;
      step(M, c, dt, dir, c.jumpT > 0);
      if (c.jumpT > 0) c.jumpT--;
      if (c.y > M.world.h + 60) { const r = respawnPoint(); c.x = r.x - 240; c.y = M.groundAt(c.x) - c.h - 1; c.vy = 0; }
      if (Math.abs(c.x - player.x) < 22 && Math.abs(c.y - player.y) < 30) {
        const r = respawnPoint(); player.x = r.x; player.y = r.y; player.vx = player.vy = 0; hud.dead++; flash('被追上 → 回到检查点');
      }
    }
    // ---- 镜头：横向跟随 + 纵向夹取 ----
    const tx = Math.max(0, Math.min(M.world.w - CW, player.x + player.w / 2 - CW * 0.38));
    cam.x += (tx - cam.x) * Math.min(1, dt * 7);
    const camYMax = Math.max(0, M.world.h - CH);
    // 路面放在屏高约 68% 处：再往下就是大片地下空土，横版场景的重量感会整个丢掉
    const ty = Math.max(0, Math.min(camYMax, player.y + player.h / 2 - CH * 0.68));
    cam.y += (ty - cam.y) * Math.min(1, dt * 5);
    hud.dist = player.x / M.world.w;
    if (hud.msgT > 0) hud.msgT -= dt;
  }

  function flash(s) { hud.msg = s; hud.msgT = 2.4; }

  function drawChar(e, col, t, kind) {
    const x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y), w = e.w, h = e.h;
    const run = Math.abs(e.vx) > 20;
    const bob = run ? Math.round(Math.sin(t * 14 + e.phase) * 2) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 1, y + h - 2, w + 2, 3);
    ctx.fillStyle = col.body; ctx.fillRect(x + 3, y + 10 + bob, w - 6, h - 20);
    ctx.fillStyle = col.head; ctx.fillRect(x + 5, y + bob, w - 10, 11);
    ctx.fillStyle = col.dark; ctx.fillRect(x + 4, y + h - 11 + bob, 5, 11); ctx.fillRect(x + w - 9, y + h - 11 + bob, 5, 11);
    ctx.fillStyle = col.arm; ctx.fillRect(x + (e.vx >= 0 ? w - 5 : 0), y + 13 + bob, 5, 12);
    if (kind === 'chaser') { ctx.fillStyle = '#ff5252'; ctx.fillRect(x + 6, y + 3 + bob, 3, 3); ctx.fillRect(x + w - 9, y + 3 + bob, 3, 3); }
    else { ctx.fillStyle = '#baff5c'; ctx.fillRect(x + w - 8, y + 3 + bob, 3, 3); }
  }

  function fmtSpeed() {
    const sec = Math.round(Math.max(0, M.opts.eta * 60 - hud.t));
    return '剩 ' + fmt(sec);
  }
  function draw() {
    const t0 = performance.now();
    LongMapDraw.render(ctx, M, cam, { w: CW, h: CH, t: hud.t, timeOfDay: params.timeOfDay });
    for (const c of chasers) drawChar(c, { body: '#4d7f4a', head: '#6fae6a', dark: '#2f4f2d', arm: '#4d7f4a' }, hud.t, 'chaser');
    drawChar(player, { body: '#3a53a8', head: '#f2c49b', dark: '#22315e', arm: '#6a86e8' }, hud.t, 'player');
    // 区段标 + 进度条
    const seg = M.segAt(player.x);
    ctx.fillStyle = 'rgba(8,12,16,0.72)'; ctx.fillRect(0, 0, CW, 26);
    ctx.fillStyle = '#baff5c'; ctx.font = '12px "Zpix Pixel",monospace'; ctx.textAlign = 'left';
    ctx.fillText(seg.name + '  ·  ' + (seg.i + 1) + '/' + M.segments.length, 10, 17);
    ctx.fillStyle = '#283444'; ctx.fillRect(180, 8, 420, 8);
    ctx.fillStyle = '#39ff14'; ctx.fillRect(180, 8, Math.round(420 * hud.dist), 8);
    for (let i = 0; i < M.checkpoints.length; i++) {
      const cx = 180 + Math.round(420 * (M.checkpoints[i].x / M.world.w));
      ctx.fillStyle = i <= hud.cp ? '#baff5c' : '#5a6a7a'; ctx.fillRect(cx, 6, 2, 12);
    }
    const el = hud.t, eta = M.opts.eta * 60;
    ctx.fillStyle = '#eafff0'; ctx.textAlign = 'right';
    ctx.fillText('已用 ' + fmt(el) + ' / 预计 ' + fmt(eta) + ' · ' + fmtSpeed() + ' · ' +
      hud.fps.toFixed(0) + 'fps · 死亡 ' + hud.dead + (hud.win ? ' · 已撤离' : ''), CW - 10, 17);
    ctx.textAlign = 'left';
    if (hud.msgT > 0) {
      ctx.fillStyle = 'rgba(8,12,16,0.8)'; ctx.fillRect(CW / 2 - 190, 46, 380, 26);
      ctx.fillStyle = '#ffd740'; ctx.textAlign = 'center'; ctx.fillText(hud.msg, CW / 2, 63); ctx.textAlign = 'left';
    }
    hud.fps = hud.fps * 0.9 + (1000 / Math.max(1, performance.now() - t0)) * 0.1;
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - lastT) / 1000 || 0.016);
    lastT = ts;
    update(dt); draw();
    raf = requestAnimationFrame(loop);
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60), r = Math.round(sec % 60);
    return m + ':' + String(r).padStart(2, '0');
  }
  function readParams() {
    const v = id => document.getElementById(id).value;
    return {
      minutes: +v('pMin'), chase: +v('pChase'), density: +v('pDens'), indoor: +v('pIndoor'),
      vertical: +v('pVert'), ruin: +v('pRuin'), infection: +v('pInf'), props: +v('pProps'),
      detail: +v('pDetail'), timeOfDay: v('pTime'),
    };
  }

  function start() {
    canvas = document.getElementById('game'); ctx = canvas.getContext('2d');
    canvas.width = CW; canvas.height = CH;
    ctx.imageSmoothingEnabled = false;
    window.addEventListener('keydown', e => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') e.preventDefault();
      if (e.key.toLowerCase() === 'r') regen(document.getElementById('seed').value);
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
    for (const id of ['pMin', 'pChase', 'pDens', 'pIndoor', 'pVert', 'pRuin', 'pInf', 'pProps', 'pDetail'])
      document.getElementById(id).addEventListener('input', e => {
        const s = e.target.parentNode.querySelector('span'); if (s) s.textContent = (+e.target.value).toFixed(1);
      });
    document.getElementById('go').onclick = () => regen(document.getElementById('seed').value);
    document.getElementById('rnd').onclick = () => { const s = 'LM-' + Math.random().toString(36).slice(2, 8).toUpperCase(); document.getElementById('seed').value = s; regen(s); };
    document.getElementById('png').onclick = exportPng;
    document.getElementById('fit').onclick = () => { cam.x = 0; cam.y = M.world.h * 0.28; };
    for (const b of document.querySelectorAll('.tod button')) b.onclick = () => {
      document.querySelectorAll('.tod button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); params.timeOfDay = b.dataset.t; document.getElementById('pTime').value = b.dataset.t;
    };
    document.getElementById('pTime').addEventListener('change', e => { params.timeOfDay = e.target.value; });
    regen(document.getElementById('seed').value || 'LM-START');
    raf = requestAnimationFrame(loop);
  }

  function regen(seed) {
    const p = readParams();
    p.timeOfDay = params ? params.timeOfDay : p.timeOfDay;
    reset(seed || 'LM-START', p);
  }
  function exportPng() {
    const off = document.createElement('canvas');
    const r = LongMapDraw.renderFull(off, M, 0.16);
    const a = document.createElement('a');
    a.href = off.toDataURL('image/png'); a.download = 'longmap-' + M.seed + '.png'; a.click();
    flash('整图预览 ' + r.w + '×' + r.h + ' 已导出');
  }

  return { start, reset, step, keys,
    // 浏览器标签页被节流时 rAF 会停摆，留出这个手动步进口给验证脚本用
    frame(dt) { update(dt || 1 / 60); draw(); },
    get state() { return { M, player, chasers, cam, hud }; } };
})();
if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => LongMapPlay.start());
