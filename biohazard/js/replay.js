// ============ 竞技场回放：记录 + 回放 ============
// 对局进行中每帧捕获人类实体关键状态（走位/朝向/血量/开火），
// 结束后可在结算界面切换「幽灵回放」：用真实地形与角色贴图按时间线重放整局，
// 支持 播放/暂停/拖拽进度/变速。
const Replay = (() => {
  let meta = null;        // id -> {name,team,weapon,isPlayer,operatorSkin}
  let frames = [];        // [{ t, e:[[id,x,y,vx,vy,og,hp,max,facing,aim,muzzle,w,h],...] }]
  let events = [];        // [{ t, killer, victim, kteam, vteam }]
  let capturing = false;
  let playing = false, paused = false, speed = 1;
  let time = 0, duration = 0, lastT = 0;
  let ghosts = {}, ghostOrder = [], playerGhost = null;
  let vcam = { x: 0, y: 0, w: 0, h: 0 };
  let lastPlayAt = 0;

  const $ = id => document.getElementById(id);
  function q(sel, parent){ return (parent || document).querySelector(sel); }

  // ---------- 写入记录 ----------
  function reset() {
    meta = null; frames = []; events = []; capturing = false;
    stopPlayback(true);
  }
  function start() {
    if (!game || !game.vs || game.vs.mode !== 'arena') return;
    reset();
    capturing = true;
    meta = {};
    for (const e of game.entities) {
      if (e.kind !== 'human' || e.isNet) continue;
      meta[e.id] = { name: e.name || '', team: e.team, weapon: e.weapon, isPlayer: !!e.isPlayer,
        operatorSkin: e.operatorSkin || 'vanguard', w: e.w, h: e.h };
    }
    lastT = 0; duration = 0;
  }
  function sample(dt) {
    if (!capturing) return;
    lastT += dt;
    const rows = [];
    for (const e of game.entities) {
      if (e.kind !== 'human' || e.dead || e.isNet) continue;
      rows.push([e.id, e.x, e.y, e.vx, e.vy, e.onGround ? 1 : 0, e.hp, e.maxHp, e.facing, e.aim, e.muzzleT > 0 ? 1 : 0, e.w, e.h]);
    }
    frames.push({ t: lastT, e: rows });
    duration = lastT;
  }
  function onKill(killer, victim) {
    if (!capturing || !victim) return;
    events.push({ t: lastT, killer: killer ? killer.id : null, victim: victim.id, kteam: killer && killer.team, vteam: victim.team });
  }

  // ---------- 播放 ----------
  function play() {
    if (!frames.length) return;
    playing = true; paused = false; time = 0; speed = 1; lastPlayAt = 0;
    ghosts = {}; ghostOrder = []; playerGhost = null;
    vcam = { x: 0, y: 0, w: CFG.CW, h: CFG.CH };
    $('over').classList.add('hidden');
    $('replayBar').classList.remove('hidden');
    window.ReplayActive = true;
    applyGhost(_frameAt(0));
    updateControllers();
  }
  function stopPlayback(silent) {
    if (playing && !silent) return;   // 已有一场，防重入；内部重置(silent)可直接走
    playing = false; paused = true; speed = 1; time = 0; duration = 0;
    ghosts = {}; ghostOrder = []; playerGhost = null;
    if (typeof document !== 'undefined' && $('replayBar')) $('replayBar').classList.add('hidden');
    if (typeof window !== 'undefined') window.ReplayActive = false;
  }
  function endPlayback() {
    playing = false; paused = true; time = 0;
    ghosts = {}; ghostOrder = []; playerGhost = null;
    $('replayBar').classList.add('hidden');
    window.ReplayActive = false;
    $('over').classList.remove('hidden');   // 回到结算面板
  }
  function isPlaying() { return playing; }

  function _frameAt(t) {
    if (!frames.length) return null;
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1; }
    return frames[lo];
  }
  function _makeGhost(id, row, m) {
    return {
      id, kind: 'human', faction: 'human', team: m.team, isPlayer: !!m.isPlayer, isNet: false,
      name: m.name || '', weapon: m.weapon, operatorSkin: m.operatorSkin || 'vanguard',
      w: row[11], h: row[12], animT: 0, hero: undefined,
      e: null, x: row[1], y: row[2], vx: row[3], vy: row[4], onGround: !!row[5],
      hp: row[6], maxHp: row[7], facing: row[8], aim: row[9], muzzleT: row[10] ? 0.05 : 0,
      dead: false,
    };
  }
  function applyGhost(f) {
    if (!f) return;
    const alive = new Set();
    for (const row of f.e) {
      const id = row[0];
      let g = ghosts[id];
      if (!g) { g = ghosts[id] = _makeGhost(id, row, meta[id] || { name: '??', weapon: 'm4a1' }); ghostOrder.push(id); if (g.isPlayer) playerGhost = g; }
      g.x = row[1]; g.y = row[2]; g.vx = row[3]; g.vy = row[4]; g.onGround = !!row[5];
      g.hp = row[6]; g.maxHp = row[7]; g.facing = row[8]; g.aim = row[9]; g.muzzleT = row[10] ? 0.05 : 0;
      g.dead = false; g.animT += 0.016;
      alive.add(id);
    }
    for (const id of ghostOrder) { const g = ghosts[id]; if (g && !alive.has(id)) g.dead = true; }
    updateCam();
  }
  function updateCam() {
    const W = level.worldW;
    const fr = playerGhost ? (playerGhost.x + playerGhost.w / 2) : (ghostOrder.length ? (ghosts[ghostOrder[0]].x + ghosts[ghostOrder[0]].w / 2) : W / 2);
    const target = Math.max(0, Math.min(W - vcam.w, fr - vcam.w / 2));
    vcam.x += (target - vcam.x) * 0.18;
    vcam.y = 0;
  }
  function tick() {
    if (paused) return;
    const now = performance.now();
    if (!lastPlayAt) lastPlayAt = now;
    const dt = Math.min(0.05, (now - lastPlayAt) / 1000) * speed;
    lastPlayAt = now;
    time += dt;
    if (time >= duration) { time = duration; paused = true; }
    updateControllers();
  }

  function renderFrame(ctx, shake) {
    if (!frames.length) { endPlayback(); return; }
    if (playing) tick();
    const f = _frameAt(time);
    if (!f) { endPlayback(); return; }
    applyGhost(f);
    const list = Object.keys(ghosts).map(k => ghosts[k]).filter(g => !g.dead);
    const player = playerGhost && !playerGhost.dead ? playerGhost : null;
    const prev = game;
    game = {
      camera: vcam, entities: list, player, particles: [], bullets: [], areas: [], faunaToDraw: [],
      vs: prev ? prev.vs : null, timeGone: time, timeLeft: Math.max(0, duration - time),
      hurtFlash: 0, infectFlash: 0, _lastN: 0, state: 'playing', escapeProg: 0,
    };
    UI.drawWorld(ctx, vcam, shake || 0, 0);
    game = prev;
    drawHud(ctx);
  }

  function drawHud(ctx) {
    const mm = d => { const m = Math.floor(d / 60), s = Math.floor(d % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; };
    const plate = (x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); };
    ctx.fillStyle = 'rgba(6,14,10,.55)';
    plate(CFG.CW / 2 - 150, 12, 300, 30);
    ctx.fillStyle = '#7dffb0'; ctx.font = 'bold 15px ' + PX_FONT; ctx.textAlign = 'center';
    ctx.fillText(`${paused ? '∥ 已暂停  ' : '▶ 回放 '}${mm(time)} / ${mm(duration)}${speed !== 1 ? '  · ' + speed + 'x' : ''}`, CFG.CW / 2, 32);
    ctx.textAlign = 'left';
    // 最近击杀记录
    const recent = events.filter(ev => ev.t <= time).slice(-2);
    let yy = CFG.CH - 84;
    ctx.font = '13px ' + PX_FONT; ctx.textAlign = 'center';
    for (const ev of recent) {
      const kc = VS_TEAM_COLORS[ev.kteam] || '#fff';
      const vc = VS_TEAM_COLORS[ev.vteam] || '#fff';
      ctx.fillStyle = 'rgba(6,14,10,.6)';
      plate(CFG.CW / 2 - 120, yy - 14, 240, 24);
      ctx.fillStyle = kc;
      ctx.fillText(`${nameOf(ev.killer)} 击败`, CFG.CW / 2 - 26, yy + 2);
      ctx.fillStyle = '#fff'; ctx.fillText(' / ', CFG.CW / 2 + 26, yy + 2);
      ctx.fillStyle = vc;
      ctx.fillText(nameOf(ev.victim), CFG.CW / 2 + 34, yy + 2);
      yy += 22;
    }
    ctx.textAlign = 'left';
  }
  function nameOf(id) {
    if (id == null) return '环境';
    return (meta[id] && meta[id].name) || '?';
  }

  function updateControllers() {
    const rpTime = $('rpTime'); if (rpTime) rpTime.textContent = (() => { const m = Math.floor(time / 60), s = Math.floor(time % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; })();
    const scrub = $('rpScrub'); if (scrub) { scrub.max = String(Math.max(1, Math.round(duration * 1000))); scrub.value = String(Math.round(time * 1000)); }
    const tg = $('rpToggle'); if (tg) tg.textContent = paused ? '▶' : '⏸';
    const sp = $('rpSpeed'); if (sp) sp.textContent = speed + 'x';
  }

  // ---------- 控件绑定 ----------
  function bind() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('rpExit',    endPlayback);
    on('rpRestart', () => { time = 0; paused = false; lastPlayAt = 0; updateControllers(); });
    on('rpToggle',  () => { paused = !paused; lastPlayAt = paused ? lastPlayAt : performance.now(); updateControllers(); });
    on('rpSpeed',   () => { speed = speed === 0.5 ? 1 : (speed === 1 ? 2 : 0.5); lastPlayAt = 0; updateControllers(); });
    const scrub = $('rpScrub');
    if (scrub) scrub.addEventListener('input', () => { time = (parseInt(scrub.value, 10) || 0) / 1000; paused = true; lastPlayAt = 0; updateControllers(); });
  }
  if (typeof document !== 'undefined') bind();

  return { reset, start, sample, onKill, play, endPlayback, isPlaying, getDuration: () => duration, getFramesLength: () => frames.length, renderFrame };
})();
if (typeof window !== 'undefined') window.ReplayActive = false;
