// ============ 游戏主逻辑 ============
let level = null;
let game = null;
let flashFx = 0;               // 闪光弹白闪（主机本地 + 客户端经快照同步）
let _prevKeys = {}, _lastKeys = {};   // 按键边沿检测（E / G / H / Q / 9 / 0 等）
let _prevMD = false, _prevMR = false; // 鼠标左/右键边沿检测（投掷蓄力 / 拔插销）
function pressedOnce(k) { return !!Input.keys[k] && !_prevKeys[k]; }

// ---------- 通用阵营判定 ----------
// 敌我判定统一入口：若双方都有 team（竞技/攻防模式），用 team 相等性；否则回退 faction 比较（原逃亡模式）
function hostile(a, b) {
  if (!a || !b) return false;
  if (a.team != null && b.team != null) return a.team !== b.team;
  return a.faction !== b.faction;
}
// 是否友军（与 hostile 相反）
function allied(a, b) { return !hostile(a, b); }

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const HUMAN_NAMES = ['阿强','小美','大刘','老王','阿杰','小李','丽丽','东子','小芳','阿豪','小雅','铁柱','娜娜','石头','阿凯'];

// ---------- 训练营模式 ----------
// dummyMode：靶场木桩行为（stand 站立 / left 左移 / right 右移 / jump 跳跃），入场时通过界面控制栏切换
const Training = { mode: false, kind: 'range', ztype: 'normal', weapon: 'm4a1', dummyMode: 'stand' };

// 训练营阵营切换：重建玩家实体（人类手持测试武器 / 僵尸保留原类型），并重刷反向木桩
Training.switchCamp = function (camp) {
  if (!game || !game.training) return;
  const old = game.player;
  const px = old ? old.x : 140;
  const py = old ? (old.y + old.h) : level.groundTop;
  if (old) old.dead = true;
  if (camp === 'zombie') {
    const zt = (Training.ztype && ZOMBIES[Training.ztype]) ? Training.ztype : 'mother';
    const z = makeZombie(zt, { x: px, y: py - (ZOMBIES[zt] ? ZOMBIES[zt].h : 40), isPlayer: true });
    z.hp = z.maxHp = 99999;                                   // 训练营玩家无敌，便于放技能测试
    z.buffs = { passive: 'unstop', active: 'dash', activeCd: 0 };
    game.entities.push(z); game.player = z;
    UI.centerMsg(`已切换为【${ZOMBIES[zt].name}】· 右键/E 技能 · Q 召唤/Buff · 玩家无敌`, 2.5);
    UI.pushFeed(`<b>训练营 · 僵尸阵营 · ${ZOMBIES[zt].name}</b>`, 'zombie-kill');
  } else {
    const h = makeHuman({ x: px, y: py - 36, isPlayer: true, weapon: 'm4a1', name: '玩家' });
    for (const k of WEAPON_KEYS) {
      const wk = WEAPONS[k];
      h.arsenal[k] = wk.grenade ? { count: Infinity } : { mag: Infinity };   // 无限弹药
    }
    const tw = (Training.weapon && WEAPONS[Training.weapon]) ? Training.weapon : 'm4a1';
    switchWeapon(h, tw);
    h.mag = Infinity; h.count = Infinity;
    game.entities.push(h); game.player = h;
    UI.centerMsg(`已切换为【人类】· ${WEAPONS[tw].name}（无限弹药，射击木桩测试）`, 2.5);
    UI.pushFeed(`<b>训练营 · 人类阵营 · ${WEAPONS[tw].name}</b>`, '');
  }
  Training.ensureDummies(camp === 'zombie' ? 'human' : 'zombie');
  updateTrainingCtl();
  if (typeof Settings !== 'undefined' && Settings.refresh) Settings.refresh();
};

// 清空并重刷木桩（dummyCamp：'zombie' 生成无敌僵尸木桩 / 'human' 生成人类沙包）
Training.ensureDummies = function (dummyCamp) {
  if (!game) return;
  for (let i = game.entities.length - 1; i >= 0; i--) {
    const e = game.entities[i];
    if (e === game.player) continue;
    if (e.invuln || e.sandbag) { e.dead = true; game.entities.splice(i, 1); }
  }
  const top = level.groundTop;
  if (dummyCamp === 'zombie') {
    ['normal', 'sprinter', 'boomer', 'mother'].forEach((zt, i) => {
      const z = makeZombie(zt, { x: 480 + i * 90, y: top, invuln: true });
      z.hp = z.maxHp = 99999;
      z.y -= z.h;
      game.entities.push(z);
    });
  } else {
    for (let i = 0; i < 4; i++) {
      const h = makeHuman({ x: 700 + i * 320, y: top, isPlayer: false, weapon: 'm4a1', name: '沙包' });
      h.sandbag = true; h.hp = h.maxHp = 99999;
      h.y -= h.h;
      game.entities.push(h);
    }
  }
};

// 在玩家右侧生成单个测试木桩（faction：'human' 沙包 / 'zombie' 无敌木桩）
Training.spawnDummy = function (faction) {
  if (!game || !game.training) return;
  const top = level.groundTop;
  const px = game.player ? game.player.x + 140 : 600;
  if (faction === 'human') {
    const h = makeHuman({ x: px, y: top, isPlayer: false, weapon: 'm4a1', name: '沙包' });
    h.sandbag = true; h.hp = h.maxHp = 99999;
    h.y -= h.h;
    game.entities.push(h);
  } else {
    const z = makeZombie('normal', { x: px, y: top, invuln: true });
    z.hp = z.maxHp = 99999;
    z.y -= z.h;
    game.entities.push(z);
  }
};

// 清空全部木桩/沙包（保留玩家）
Training.clearDummies = function () {
  if (!game) return;
  for (let i = game.entities.length - 1; i >= 0; i--) {
    const e = game.entities[i];
    if (e === game.player) continue;
    if (e.invuln || e.sandbag) { e.dead = true; game.entities.splice(i, 1); }
  }
};

// 单机面板「训练营」开始训练：加载训练关卡并直接进入战斗
function startTraining(kind, ztype, weapon) {
  Training.mode = true;
  Training.kind = kind === 'skill' ? 'skill' : 'range';
  Training.ztype = ztype || 'normal';
  if (weapon && WEAPONS[weapon]) Training.weapon = weapon;
  UI.hideMenu();
  UI.hideOver();
  UI.showHUD();
  AudioFX.unlock();
  setupRoom(1);
  game._lastN = -1;
  if (game.training.kind === 'skill') {
    UI.centerMsg(`你已变身【${ZOMBIES[game.training.ztype].name}】！攻击人类沙包测试技能`, 3);
    UI.pushFeed(`<b>训练营 · ${ZOMBIES[game.training.ztype].name}技能测试</b>（E/右键 放技能，Q 放 Buff）`, 'zombie-kill');
  } else {
    UI.centerMsg(`枪械靶场 · 手持【${WEAPONS[Training.weapon].name}】，射击木桩观察扩散/音效/特效；顶部可切换木桩行为`, 3);
    UI.pushFeed('<b>训练营 · 枪械靶场</b>（木桩无敌，可反复测试）', '');
  }
  updateTrainingCtl();
}

// ---------- 房间初始化 ----------
// vsMode：null=原逃亡模式；'arena'=竞技场（红蓝 PvP 死亡竞赛）；'siege'=战术攻防
function setupRoom(size, vsMode, mapId) {
  if (typeof ArtEvents !== 'undefined') ArtEvents.cancelAll('reset');   // 新局：视觉事件与对象全部归零
  if (typeof HitArt !== 'undefined') HitArt.reset('reset');
  const isTraining = Training.mode;
  // 数值调试器只在训练营开放（面板不暂停游戏，边打边改）
  if (typeof Debugger !== 'undefined') Debugger.setMode(isTraining);
  const vsOn = vsMode === 'arena' || vsMode === 'siege';
  // 自定义地图：菜单勾选（或 URL ?custom=1）且存在已保存地图时使用（训练营/竞技/攻防忽略）
  const wantCustom = !isTraining && !vsOn && ((document.getElementById('useCustomMap') && document.getElementById('useCustomMap').checked)
    || /[?&]custom=1/.test(location.search));
  const saved = wantCustom ? localStorage.getItem('zombie_custom_map') : null;
  // 别墅突袭：同一套攻防回合逻辑，只把地图换成程序化别墅。seed 可用 ?villaSeed= 固定下来复现。
  let villaSeed = null;
  // mapId 允许写成 'villa:<seed>' 指定地图（验证脚本与回放要用），否则随机或取 ?villaSeed=
  if (vsMode === 'siege' && mapId && String(mapId).indexOf('villa') === 0) {
    const q = /[?&]villaSeed=([^&]+)/.exec(location.search);
    villaSeed = (String(mapId).indexOf('villa:') === 0 ? String(mapId).slice(6) : '')
      || (q ? decodeURIComponent(q[1]) : 'V' + Math.floor(Math.random() * 1e6));
  }
  // 阴森古堡：生化模式专用的单张固定地图。开发期只能从调试入口进入
  // （?bio=1 走完整回合、?castleWalk=1 只游览地图），正式模式入口阶段十才开放。
  // seed 用 ?castleSeed= 固定以便复现；mapId 支持 'castle:<seed>' 供验证脚本指定。
  let castleSeed = null;
  if (mapId && String(mapId).indexOf('castle') === 0) {
    const q = /[?&]castleSeed=([^&]+)/.exec(location.search);
    castleSeed = (String(mapId).indexOf('castle:') === 0 ? String(mapId).slice(7) : '')
      || (q ? decodeURIComponent(q[1]) : 'CASTLE-1');
  }
  // 疾驰列车：逃亡回合 + 程序化列车地图。seed 用 ?trainSeed= 固定以便复现；
  // mapId 支持 'train:<seed>' 供验证脚本指定（与 villa/castle 同一口径）。
  let trainSeed = null;
  if (mapId && String(mapId).indexOf('train') === 0) {
    const q = /[?&]trainSeed=([^&]+)/.exec(location.search);
    trainSeed = (String(mapId).indexOf('train:') === 0 ? String(mapId).slice(6) : '')
      || (q ? decodeURIComponent(q[1]) : 'TR00-0');
  }
  level = saved ? Level.load(JSON.parse(saved))
    : (isTraining ? Level.buildTraining(Training.kind)
       : (vsMode === 'arena' ? Level.buildArena()
         : (trainSeed ? Level.buildTrain(trainSeed)
           : (castleSeed ? Level.buildCastle(castleSeed)
             : (vsMode === 'siege' ? (villaSeed ? Level.buildVilla(villaSeed) : Level.buildSiege()) : Level.build())))));
  if (villaSeed) level.villaSeed = villaSeed;
  if (castleSeed) level.castleSeed = castleSeed;
  if (trainSeed) level.trainSeed = trainSeed;
  bullets.length = 0; particles.length = 0; texts.length = 0; areas.length = 0;
  game = {
    state: isTraining ? 'playing' : 'countdown', countdown: 10.0,
    timeLeft: isTraining ? 9999 : CFG.ROUND_TIME, escapeProg: 0,
    hurtFlash: 0, infectFlash: 0, camera: { x: 0, y: 0 },
    entities: [], roomSize: size,
    stats: { kills: 0, damage: 0, infect: 0, survivors: 0 },
    motherAlive: false,
    training: isTraining ? { kind: Training.kind, ztype: Training.ztype } : null,
    _lastHitTarget: null,
    // ---- 多关卡 / 复活点 / 触发器 / 机关 / 刷新点 ----
    stage: 0, guardT: -1, guardMax: 0, guardGrace: -1, advanceOpen: false,
    activeRespawns: [], respawnT: 0, respawnCd: 4,
    shortcutOpen: false, escapeActive: false,
    portals: [], mechs: [],
    pickups: { ammo: [], weapons: [], caps: [], keys: [], crystals: [] },
    keyTaken: false,
    zRespawns: [], guardStage: 0, guardPortalX: null,
    // 生化背包：追击专用背包道具（补给点 E 切换）+ 背包选择界面状态
    hasBackpackItem: (document.getElementById('backpackItem') && document.getElementById('backpackItem').checked) !== false,
    backpackUI: false, backpackUIAnchor: null, bpRatios: null,
    _hint: null,
    vs: vsOn ? makeVsRuntime(vsMode) : null,
    // ---- 生化模式（阶段四起）----
    // bio 为空时，下面所有普通模式的伤害/复活/HUD/地图/联机判定保持原有行为不变。
    bio: null,
    walk: vsMode === 'walk',                                   // 灰盒游览：只检验地图能走能绕能追
    bioDebug: /[?&]bioDebug=1/.test(location.search),          // 通行图/出生点编号/碰撞轮廓
  };
  initStageRuntime(game);
  if (isTraining) { buildTrainingEntities(game); return; }
  if ((castleSeed || trainSeed) && vsMode === 'walk') { buildWalkEntities(game); return; }
  if (vsOn) {
    buildVsEntities(game, vsMode);
    if (vsMode === 'arena') Replay.start();   // 竞技模式：开局即开始记录回放
    return;
  }

  // 开局全员人类：10 秒倒计时结束后随机选 4 名变异为母体（无开局僵尸堵路）
  const st0 = level.stages[0];
  const sx = st0.spawnHuman.x;
  for (let i = 0; i < size; i++) {
    const isP = i === 0;
    const h = makeHuman({
      x: sx + (i % 5) * 46,
      y: st0.spawnHuman.y,
      isPlayer: isP,
      weapon: isP ? 'm4a1' : GUN_KEYS[Math.floor(Math.random() * GUN_KEYS.length)],
      name: isP ? '玩家' : HUMAN_NAMES[Math.floor(Math.random() * HUMAN_NAMES.length)],
    });
    h.y -= h.h;
    game.entities.push(h);
    if (isP) game.player = h;
  }
  game.motherAlive = false;
}

// 灰盒游览：只放一个可操作人类进图，无回合判定 —— 用来肉眼/脚本检查「能走、能绕、能追」
// 出生点读 level.spawnHuman（契约字段），不再读 level.castle.humanSpawns：
// 后者把这条入口钉死在古堡一张图上，火车图一走进来就 Cannot read 'humanSpawns'。
function buildWalkEntities(g) {
  g.state = 'playing'; g.countdown = 0; g.timeLeft = 99999;
  const sp = level.spawnHuman || (level.castle && level.castle.humanSpawns && level.castle.humanSpawns[0]);
  if (!sp) throw new Error('游览图没有 spawnHuman，无法放置可操作角色');
  const p = makeHuman({ x: sp.x, y: sp.y, isPlayer: true, weapon: 'm4a1', name: '玩家' });
  p.y -= p.h;
  g.entities.push(p); g.player = p;
  UI.centerMsg(level.train ? '疾驰列车 · A/D 移动，W / 空格跳跃；梯口按住 W 上梯、S 下梯' : '古堡探索 · A/D 移动，W / 空格跳跃', 3);
}

// 训练营实体：靶场（人类+无敌木桩） / 技能测试（所选僵尸+人类沙包）
function buildTrainingEntities(g) {
  const dummies = (level.stages[0] && level.stages[0].dummies) || [];
  if (g.training.kind === 'range') {
    const p = makeHuman({ x: 140, y: level.groundTop - 36, isPlayer: true, weapon: 'm4a1', name: '玩家' });
    for (const k of WEAPON_KEYS) {
      const wk = WEAPONS[k];
      p.arsenal[k] = wk.grenade ? { count: Infinity } : { mag: Infinity };   // 无限弹药
    }
    // 入场直接装备面板选中的测试武器（makeHuman 会被开局背包主武器覆盖，故这里再切一次）
    const tw = WEAPONS[Training.weapon] ? Training.weapon : 'm4a1';
    switchWeapon(p, tw);
    p.mag = Infinity; p.count = Infinity;
    p.y -= p.h;
    game.entities.push(p); g.player = p;
    for (const d of dummies) {
      const z = makeZombie(d.ztype, { x: d.x, y: d.y, invuln: true });
      z.hp = z.maxHp = 99999;
      z.y -= z.h;
      game.entities.push(z);
    }
  } else {
    const z = makeZombie(g.training.ztype, { x: 140, y: level.groundTop - 40, isPlayer: true });
    z.hp = z.maxHp = 99999;
    z.buffs = { passive: 'unstop', active: 'dash', activeCd: 0 };   // 全 Buff：无畏意志 + 飞身强击
    game.entities.push(z); g.player = z;
    for (const d of dummies) {
      if (!d.human) continue;
      const h = makeHuman({ x: d.x, y: d.y, isPlayer: false, weapon: 'm4a1', name: '沙包' });
      h.sandbag = true; h.hp = h.maxHp = 99999;   // 沙包不死亡
      h.y -= h.h;
      game.entities.push(h);
    }
  }
}

// ---------- VS 运行时（竞技场 / 战术攻防 共用）----------
// mode：'arena' 竞技场 · 红蓝 PvP 死亡竞赛；'siege' 战术攻防 · 攻守回合
// 队伍标记：竞技场用 team 'A'(玩家红队) / 'B'(蓝队)；攻防用 team 'ATK'(玩家攻方) / 'DEF'(守方)
function makeVsRuntime(mode) {
  const cfg = mode === 'arena' ? {
    roundTime: 90,            // 单回合限时（秒）
    points: { A: 0, B: 0 },   // 队伍比分（竞技场=击杀数）
    winTarget: 20,            // 竞技场：先到 20 击杀获胜
    respawnSec: 2,            // 死后复活延迟
    bestOf: 1,                // 竞技场单局定胜负（击杀数与时间双因子）
  } : {
    roundTime: 180,           // 攻防行动阶段限时（秒）
    points: { A: 0, B: 0 },   // 固定队伍积分；攻守职责每回合交换
    bestOf: 5,                // 五局三胜（3 点先胜）
    respawnSec: 0,            // 攻防无复活：死亡本回合出局，下一回合重生
    prepT: 20,                // 准备阶段（守方布防：放绊线雷 / 加固墙）
    phase: 'prep',
  };
  const r = {
    mode, round: 1, phase: cfg.phase || 'fight', roundT: cfg.roundTime, prepT: cfg.prepT || 0,
    points: cfg.points, respawnSec: cfg.respawnSec, bestOf: cfg.bestOf,
    killStreak: {},           // 竞技场连杀追踪（entId -> 连击数）
    killTarget: cfg.winTarget || Infinity,
    obj: mode === 'siege' ? pickSiegeObj() : (cfg.obj || null),
    // 守方布防状态：已放置的绊线雷 / 已加固墙（配额由干员调整，见 siegePlaceTrap）
    bp: { traps: [], walls: [], maxTraps: 2, maxWalls: 2 },
    breakables: mode === 'siege' ? level.solids.filter(s => s.breakable) : [],
    // 攻防回合切换用
    atkTeam: 'ATK', defTeam: 'DEF',
    atkSquad: 'A', defSquad: 'B',
    winner: null,             // 已产生整局胜者（触发 endRound）
  };
  if (mode === 'arena') { r.killTarget = cfg.winTarget; r.defTeam = null; }
  return r;
}

// 攻防目标激活：从 buildSiege 的 objList 随机选一个（secure 区域占领 / bomb 拆弹）
function pickSiegeObj(previous) {
  const list = (level && level.objList) || [];
  if (!list.length) return { kind: 'secure', name: '加油罩棚', x: 1500, y: level.groundTop - 24, w: 180, hold: 6 };
  const choices = list.length > 1 ? list.filter(o => o !== previous) : list;
  return choices[Math.floor(Math.random() * choices.length)];
}

// ---------- 攻防干员 ----------
// 大厅所选干员：优先读 DOM 下拉，其次 localStorage，最后默认值
function selectedSiegeRole(team) {
  const el = document.getElementById(team === 'ATK' ? 'siegeAtkRole' : 'siegeDefRole');
  let v = el ? el.value : '';
  if (!v) v = localStorage.getItem(team === 'ATK' ? 'zombie_siege_atk_role' : 'zombie_siege_def_role') || '';
  return v || (team === 'ATK' ? 'breacher' : 'anchor');
}

// 干员被动应用（出生 / 换边后调用；先重置到基础值避免重复叠加）
function applySiegeRole(h, role) {
  if (h._baseMaxHp == null) h._baseMaxHp = h.maxHp;
  h.maxHp = h._baseMaxHp;
  h._slowImmune = false;
  h.role = role || null;
  h.roleCd = 0;
  if (h.isPlayer) { h.equipFx.speedMul = 1; computeHumanEquipFx(h); }   // 重置速度被动（护甲/战术靴聚合重算）
  if (role === 'anchor') { h.maxHp += 30; h._slowImmune = true; }
  else if (role === 'scout') h.equipFx.speedMul = (h.equipFx.speedMul || 1) * 1.1;
  if (h.dead) return;
  h.hp = Math.min(h.hp, h.maxHp);
}

// 干员主动技能（F 键）：突破手爆破弹 / 侦察标记
function useSiegeRoleSkill(p) {
  const role = p.role;
  if ((p.roleCd || 0) > 0) return;
  if (role === 'breacher') {
    const ang = p.aim;
    bullets.push({
      x: p.x + p.w / 2 + Math.cos(ang) * 12,
      y: entityFireY(p),
      vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620 - 170,
      dmg: 120, owner: p, faction: p.faction, team: p.team,
      life: 5, key: 'breach', grenade: true, effect: 'boom', splash: 96,
      fuse: 1.1, radius: 8, grav: true, trail: 'comet',
    });
    p.roleCd = SIEGE_ROLES.breacher.cooldown;
    UI.centerMsg('爆破弹！', 1);
    AudioFX.boom();
  } else if (role === 'scout') {
    let best = null, bd = 900;
    for (const e of game.entities) {
      if (e.kind !== 'human' || e.dead || e.team !== 'DEF') continue;
      const d = Math.hypot(e.x + e.w / 2 - (p.x + p.w / 2), e.y + e.h / 2 - (p.y + p.h / 2));
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { best._scoutT = 3; p.roleCd = SIEGE_ROLES.scout.cooldown; UI.centerMsg('已标记目标（3s 透视）', 1); AudioFX.count(); }
    else UI.centerMsg('附近没有可标记的守方', 1);
  }
}

// 根据 teams 生成两队实体；玩家恒为 teamA（左队，红 / 攻方）
const VS_TEAM_COLORS = { A: '#ff5252', B: '#448aff', ATK: '#ffa726', DEF: '#7e57c2' };
function vsTeamName(team) {
  if (team === 'A') return '红队'; if (team === 'B') return '蓝队';
  if (team === 'ATK') return '攻方'; return '守方';
}
function buildVsEntities(g, vsMode) {
  const st = level.stages[0];
  const W = level.worldW;
  // 队伍出生区：A/ATK 左侧，B/DEF 右侧
  const leftSpawns = [{ x: level.spawnHuman.x, y: level.spawnHuman.y }];
  const rightSpawn = level.spawnZombie || { x: W - 120, y: st.spawnHuman.y };
  const rightX = rightSpawn.x;
  const isArena = vsMode === 'arena';
  const teamA = isArena ? 'A' : 'ATK';
  const teamB = isArena ? 'B' : 'DEF';
  // 人数分配：玩家 + 每队 AI（房间人数对半）
  const perTeam = Math.max(1, Math.min(4, Math.floor(g.roomSize / 2)));
  const GUNS = GUN_KEYS;
  let idx = 0;
  // 左队（玩家所在）
  for (let i = 0; i < perTeam; i++) {
    const isP = i === 0;
    const h = makeHuman({
      x: leftSpawns[0].x + i * 46,
      y: leftSpawns[0].y,
      isPlayer: isP, team: teamA,
      weapon: isP ? 'm4a1' : GUNS[Math.floor(Math.random() * GUNS.length)],
      name: isP ? '玩家' : vsTeamName(teamA) + '队员' + (i + 1),
    });
    if (isArena) h.y -= h.h;
    else { h.squad = 'A'; h.squadIndex = i; }
    g.entities.push(h);
    if (isP) { g.player = h; if (vsMode === 'siege') applySiegeRole(h, selectedSiegeRole(teamA)); }
  }
  // 右队
  for (let i = 0; i < perTeam; i++) {
    const h = makeHuman({
      x: rightX - i * 46,
      y: rightSpawn.y,
      isPlayer: false, team: teamB,
      weapon: GUNS[Math.floor(Math.random() * GUNS.length)],
      name: vsTeamName(teamB) + '队员' + (i + 1),
    });
    if (isArena) h.y -= h.h;
    else { h.squad = 'B'; h.squadIndex = i; h.x = rightX + (i - (perTeam - 1) / 2) * 32 - h.w / 2; }
    g.entities.push(h);
  }
  const defY = rightSpawn.y;
  g._teamSpawns = { A: leftSpawns, B: [{ x: rightX, y: defY }],
                    ATK: leftSpawns, DEF: [{ x: rightX, y: defY }] };
  // 玩家出生即显示队伍标识
  UI.pushFeed(isArena
    ? `<b>竞技场 · ${vsTeamName(teamA)} 对  ${vsTeamName(teamB)}</b>（Kill to Win ${g.vs.killTarget}）`
    : `<b>战术攻防 · 你是【${vsTeamName(teamA)}】</b>（目标：${g.vs.obj.name} · ${g.vs.obj.kind === 'bomb' ? '安装炸弹' : '占领区域'}）`, '');
}

// VS 模式实体死亡分流：竞技场登记击杀+延迟复活；攻防标记出局、判定回合
function vsOnDeath(t, from) {
  t.dead = true;
  const vs = game.vs; if (!vs) return;
  const isArena = vs.mode === 'arena';
  // 击杀登记：攻击方给己方队伍+1（own 自己动手）
  if (from && from !== t) {
    const killerTeam = from.team || (from.faction === 'zombie' ? vs.defTeam : vs.atkTeam);
    if (isArena && killerTeam) {
      vs.points[killerTeam]++;
      if (from.isPlayer) game.stats.kills++;
      from.vsKills = (from.vsKills || 0) + 1;      // 击杀榜统计
      t.vsDeaths = (t.vsDeaths || 0) + 1;         // 击杀榜统计
      vs.killStreak[from.id] = (vs.killStreak[from.id] || 0) + 1;
      const ks = vs.killStreak[from.id];
      if (ks >= 2) UI.pushFeed(`<b>${from.name} 连杀 ×${ks}！</b>`, '');
      if (ks >= 5) { FX.shakeMag = 6; UI.pushFeed(`<b>${from.name} 主宰战场！</b>`, 'zombie-kill'); }
    }
    Replay.onKill(from, t);   // 记录追踪击杀，供赛后击杀榜 / 回放时间线
  }
  // 生成死亡特效
  const col = VS_TEAM_COLORS[t.team] || '#fff';
  for (let i = 0; i < 14; i++) spawnParticle(t.x + t.w / 2, t.y + t.h / 2, col, { size: 3, life: 0.5 });
  AudioFX.boom();
  UI.pushFeed(`<b>${from === t || !from ? '自雷' : (from.isPlayer ? '你' : (from.name || ''))} 击败了 ${t.name}</b>`, '');
  if (from) spawnText(t.x + t.w / 2, t.y - 22, '击杀!', '#fff', 14);
  // 竞技场：登记延迟复活（不立即移除，防止实体引用悬空）
  if (isArena) {
    if (t.isPlayer || !t.isNet) vs._respawns = vs._respawns || [];
    const delay = vs.respawnSec;
    vs._respawns = vs._respawns || [];
    vs._respawns.push({ ent: t, t: delay, team: t.team, spawn: pickVsSpawn(t.team) });
    if (t.isPlayer) UI.centerMsg(`你被击败，${delay}s 后复活…`, 2);
    updateVsArenaEnd();
  } else {
    // 攻防：出局不复活，逐回合结算胜负
    checkSiegeEnd(game);
  }
}

// 选择该队伍出生点（避开死亡位置，就近回己方半场）
function pickVsSpawn(team) {
  const st = level.stages[0];
  const W = level.worldW;
  const right = W - 120;
  const base = (team === 'B' || team === 'DEF') ? { x: right, y: st.spawnHuman.y } : { x: 120, y: st.spawnHuman.y };
  return { x: base.x + (Math.random() - 0.5) * 120, y: base.y - 24 };
}

// VS 每帧推进（entity 复活 / 攻防目标点 / 计时与判负 / 整局胜者）
function updateVs(dt) {
  const vs = game.vs; if (!vs || game.state === 'over') return;
  const isArena = vs.mode === 'arena';
  // 复活
  if (vs._respawns && vs._respawns.length) {
    for (let i = vs._respawns.length - 1; i >= 0; i--) {
      const r = vs._respawns[i];
      r.t -= dt;
      if (r.t <= 0) {
        vs._respawns.splice(i, 1);
        respawnVsEntity(r);
      }
    }
  }
  if (isArena) {
    vs.roundT -= dt;
    if (vs.roundT <= 0) endVsArenaByTime();
  } else {
    // 攻防：计时
    if (vs.phase === 'prep') {
      vs.prepT = Math.max(0, vs.prepT - dt);
      if (vs.prepT <= 0) { vs.phase = 'fight'; UI.centerMsg('行动阶段开始！', 1.2); }
      return;
    }
    if (vs.phase !== 'fight') return;
    vs.roundT = Math.max(0, vs.roundT - dt);
    // 炸弹已安装：时间耗尽不判负，由爆炸/拆除裁决（加时）
    if (vs.roundT <= 0 && !vs.defuser) { endSiegeRound('DEF', '时间到，目标未被夺取', game); return; }
    const round = vs.round;
    updateSiegeObjective(dt);
    if (game.state === 'over' || vs.round !== round || vs.phase !== 'fight') return;
    updateSiegeFortify(dt);
  }
}

// 竞技场：击杀目标判定
function updateVsArenaEnd() {
  const vs = game.vs; if (!vs || vs.mode !== 'arena' || game.state === 'over') return;
  if (vs.points.A >= vs.killTarget) endVs('A', '红队达到击杀目标', localWinnerTeam());
  else if (vs.points.B >= vs.killTarget) endVs('B', '蓝队达到击杀目标', localWinnerTeam());
}
function localWinnerTeam() { return null; }   // 整局胜者先在 endVs 统一结算

// 竞技场：回合时间到，按击杀数比分定该回合（若平分再战）
function endVsArenaByTime() {
  const vs = game.vs;
  const p = vs.points;
  if (p.A === p.B) { UI.centerMsg('平局！加时 30s', 2); vs.roundT = 30; return; }
  endVs(p.A > p.B ? 'A' : 'B', p.A > p.B ? '红队比分领先' : '蓝队比分领先', p.A > p.B ? 'A' : 'B');
}

// 竞技场整局结束（死亡竞赛：单回合即整局）
function endVs(winnerTeam, reason, localWinner) {
  if (game.state === 'over') return;
  const vs = game.vs;
  game.state = 'over'; game.winner = winnerTeam === 'A' ? 'humans' : 'zombies';
  const s = game.stats;
  const title = winnerTeam === 'A' ? '红队获胜！' : '蓝队获胜！';
  const stats =
    `本回合结果：${reason}\n` +
    `红队 [${vs.points.A}]  ·  蓝队 [${vs.points.B}]  击杀目标 ${vs.killTarget}\n` +
    `你的击杀：${s.kills} 　　你造成的伤害：${Math.round(s.damage)}`;
  UI.showOver(title, stats);
  buildVsLeaderboard();        // 赛后击杀榜
  wireReplayButton();          // 有回放数据则显示「看本局回放」
  AudioFX.win();
  if (Net.active()) document.getElementById('againBtn').classList.add('hidden');
}

// 赛后击杀榜：按击杀数降序列出全部参战者（含玩家/展示排名）
function buildVsLeaderboard() {
  const board = document.getElementById('killBoard');
  if (!board) return;
  const rows = game.entities
    .filter(e => e.kind === 'human' && !e.isNet)
    .map(e => ({
      name: e.name || '?', team: e.team, isPlayer: !!e.isPlayer,
      kills: e.vsKills || 0, deaths: e.vsDeaths || 0,
    }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const hdr = `<div class="kb-head"><span>名次</span><span>玩家</span><span>阵营</span><span>击杀</span><span>阵亡</span></div>`;
  const body = rows.map((r, i) => {
    const tc = VS_TEAM_COLORS[r.team] || '#fff';
    return `<div class="kb-row"><span><b>#${i + 1}</b></span>` +
      `<span>${r.isPlayer ? '◆ ' : ''}${r.name}</span>` +
      `<span style="color:${tc}">${vsTeamName(r.team)}</span>` +
      `<span>${r.kills}</span><span>${r.deaths}</span></div>`;
  }).join('');
  board.innerHTML = hdr + body;
  board.classList.remove('hidden');
}

// 竞技模式：有累积回放帧则显示回放入口（仅本局数据有效时）
function wireReplayButton() {
  const row = document.getElementById('replayRow');
  const btn = document.getElementById('replayBtn');
  if (!row || !btn) return;
  const usable = game.vs && game.vs.mode === 'arena' && Replay.getFramesLength() > 1;
  row.classList.toggle('hidden', !usable);
  if (usable) btn.onclick = () => Replay.play();
}

// ---------- VS 复活实体 ----------
function respawnVsEntity(r) {
  if (!r.ent || r.ent.dead !== true) return;   // 仅重生死去的实体
  const e = r.ent;
  e.dead = false;
  if (typeof ArtEvents !== 'undefined') ArtEvents.cancel(e.id, 'respawn');
  e.x = r.spawn.x; e.y = r.spawn.y; e.vx = 0; e.vy = 0; e.onGround = false;
  e.hp = e.maxHp; e.facing = e.x < level.worldW / 2 ? 1 : -1;
  e.bloom = 0; e.fireT = 0; e.invulnT = 1.0 || e.invulnT;   // 复活短暂无敌，避免连击
  // 运力：重置武器与弹药到满配
  for (const k of WEAPON_KEYS) {
    const wk = WEAPONS[k];
    if (e.arsenal[k]) e.arsenal[k].count = wk.grenade ? (wk.count || 0) : (wk.melee ? Infinity : wk.mag);
  }
  if (!e.kind || e.kind === 'human') {
    const pw = WEAPONS[e.weapon];
    if (pw) e.mag = pw.grenade || pw.melee ? Infinity : magCapacityFor(e, pw);
    e.count = pw && pw.count || 0;
  }
  spawnParticle(e.x + e.w / 2, e.y + e.h / 2, VS_TEAM_COLORS[e.team] || '#fff', { type: 'ring', size: 14, life: 0.4 });
  if (e.isPlayer) UI.centerMsg('你已复活！', 1);
}

// ---------- 攻防回合结算 ----------
// 结果：谁赢本轮积分；再判整局（bestOf 先胜）
function checkSiegeEnd(g) {
  const vs = g.vs; if (!vs || vs.mode !== 'siege' || vs.phase !== 'fight' || g.state === 'over') return;
  const alive = (team) => g.entities.some(e => !e.dead && e.team === team);

  // 敌方全灭则胜；攻方还需完成目标
  const aliveDef = alive('DEF');
  const aliveAtk = alive('ATK');
  if (!aliveDef) return endSiegeRound('ATK', '守方被全灭', g);
  if (!aliveAtk && !vs.defuser) return endSiegeRound('DEF', '攻方被全灭', g);
}

// 攻防目标点推进：secure=区域占领（区内无守方才推进） / bomb=拆弹流程
function updateSiegeObjective(dt) {
  const vs = game.vs; if (!vs || vs.mode !== 'siege' || vs.phase !== 'fight') return;
  const obj = vs.obj; if (!obj) return;
  if (obj.kind === 'bomb') { updateSiegeBomb(dt); return; }
  // ---- secure：区域占领（R6 规则：区内有守方则暂停，无攻方则回退） ----
  vs._holdT = vs._holdT || 0;
  const atkIn = game.entities.filter(e => !e.dead && inSiegeObj(e, obj) && e.team === 'ATK');
  const defIn = game.entities.filter(e => !e.dead && inSiegeObj(e, obj) && e.team === 'DEF');
  if (atkIn.length > 0 && defIn.length === 0) {
    vs._holdT += dt * atkIn.length;   // 多人在内可加速
    if (vs._holdT >= obj.hold) endSiegeRound('ATK', '目标点被夺取', game);
  } else if (defIn.length > 0) {
    vs._holdT = Math.max(vs._holdT, 0);   // 守方控制中：进度暂停
  } else {
    vs._holdT = Math.max(0, vs._holdT - dt * 2);   // 无攻方：进度回退
  }
  UI.drawObjectiveBar(vs._holdT, obj.hold, 'secure', 'hold');
}

// bomb：安包（攻方 7s 驻留）→ 爆炸倒计时 45s → 拆除（守方 5s 驻留）
function updateSiegeBomb(dt) {
  const vs = game.vs;
  const obj = vs.obj;
  // 进行中的安包/拆除：移动 / 受击 / 离开范围 即中断
  if (vs._plant) {
    const pl = vs._plant, ent = pl.ent;
    if (!ent || ent.dead) { vs._plant = null; }
    else {
      const moved = Math.hypot(ent.x - pl.sx, ent.y - pl.sy) > 26;
      const hit = ent.hp < pl.hp;
      const away = pl.kind === 'plant' ? !inSiegeObj(ent, obj) : !nearDefuser(ent, vs.defuser);
      if (moved || hit || away) {
        vs._plant = null;
        UI.centerMsg(pl.kind === 'plant' ? '安装被中断！' : '拆除被中断！', 1);
      } else {
        pl.t += dt;
        if (pl.t >= pl.need) {
          if (pl.kind === 'plant') {
            vs.defuser = { x: obj.x + obj.w / 2 - 13, y: obj.y + 2, w: 26, h: 12, boomT: 45 };
            UI.pushFeed('<b>炸弹已安装 · 45s 后爆炸</b>', '');
            UI.centerMsg('炸弹已安装！守方按 E 拆除（5s）', 2);
            AudioFX.boom();
          } else {
            vs.defuser = null;
            endSiegeRound('DEF', '炸弹被拆除', game);
            return;
          }
          vs._plant = null;
        }
      }
    }
  }
  // 已安装炸弹：爆炸倒计时（安装后由爆炸/拆除裁决胜负）
  if (vs.defuser) {
    const df = vs.defuser;
    df.boomT -= dt;
    if (df.boomT <= 0) {
      vs.defuser = null;
      endSiegeRound('ATK', '炸弹爆炸，目标完成', game);
      return;
    }
  }
  const prog = vs._plant ? vs._plant.t : (vs.defuser ? vs.defuser.boomT : 0);
  const need = vs._plant ? vs._plant.need : 45;
  const st = vs._plant ? (vs._plant.kind === 'plant' ? 'plant' : 'defuse') : (vs.defuser ? 'boom' : 'none');
  UI.drawObjectiveBar(prog, need, 'bomb', st);
}

// 目标区判定：脚部落点贴目标平台（站上面或微陷入）
function inSiegeObj(e, obj) {
  return e.x + e.w > obj.x && e.x < obj.x + obj.w
    && e.y + e.h > obj.y - 70 && e.y + e.h < obj.y + 30;
}
// 拆除判定：靠近已安装炸弹
function nearDefuser(e, df) {
  return !!df && Math.abs(e.x + e.w / 2 - (df.x + df.w / 2)) < 52
    && Math.abs(e.y + e.h / 2 - (df.y + df.h / 2)) < 70;
}

// ---------- 守方布防：绊线雷 + 加固墙 ----------
// 准备阶段守方玩家按 1 放置绊线雷（配额 + 陷阱师 +1）
function siegePlaceTrap(p) {
  const vs = game.vs; if (!vs || vs.mode !== 'siege') return;
  const maxN = vs.bp.maxTraps + (p.role === 'trapper' ? 1 : 0);
  if (vs.bp.traps.length >= maxN) { UI.centerMsg('绊线雷配额已用完', 1.2); return; }
  let best = null, bd = 200;
  for (const s of (level.fortifySpots || [])) {
    if (s.type !== 'trap' || vs.bp.traps.some(t => t.spot === s)) continue;
    const d = Math.abs(p.x + p.w / 2 - s.x);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) { UI.centerMsg('需靠近可放置绊线雷的门廊/走廊', 1.2); return; }
  vs.bp.traps.push({ spot: best, x: best.x - 32, y: best.y, w: 64, h: 10, dmg: p.role === 'trapper' ? 55 : 40 });
  UI.centerMsg('绊线雷已放置！', 1);
  UI.pushFeed(`<b>绊线雷部署完成（${vs.bp.traps.length}/${maxN}）</b>`, '');
  AudioFX.count();
}

// 准备阶段守方玩家按 2 加固墙体（软墙 → 400hp 实体加固墙）
function siegeReinforceWall(p) {
  const vs = game.vs; if (!vs || vs.mode !== 'siege') return;
  if (vs.bp.walls.length >= vs.bp.maxWalls) { UI.centerMsg('加固墙配额已用完', 1.2); return; }
  let best = null, bd = 280;
  for (const s of (level.fortifySpots || [])) {
    if (s.type !== 'wall' || vs.bp.walls.some(w => w.spot === s)) continue;
    const d = Math.abs(p.x + p.w / 2 - (s.x + s.w / 2));
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) { UI.centerMsg('需靠近可加固的墙段', 1.2); return; }
  const wall = { spot: best, x: best.x, y: best.y, w: best.w, h: best.h, hp: 400, maxHp: 400, solid: null };
  wall.solid = { x: best.x, y: best.y, w: best.w, h: best.h, reinforce: true, wall };
  level.solids.push(wall.solid);
  vs.bp.walls.push(wall);
  UI.centerMsg('墙体已加固！', 1);
  UI.pushFeed(`<b>加固墙完成（${vs.bp.walls.length}/${vs.bp.maxWalls}）</b>`, '');
  AudioFX.boom();
}

// 布防每帧推进（行动阶段）：绊线雷对攻方触发
function updateSiegeFortify(dt) {
  const vs = game.vs; if (!vs || vs.mode !== 'siege') return;
  const traps = vs.bp.traps;
  for (let i = traps.length - 1; i >= 0; i--) {
    const tr = traps[i];
    let hit = null;
    for (const h of game.entities) {
      if (h.kind !== 'human' || h.dead || h.team !== 'ATK') continue;
      if (h.x + h.w > tr.x && h.x < tr.x + tr.w
        && h.y + h.h > tr.y - 6 && h.y < tr.y + tr.h + 6) { hit = h; break; }
    }
    if (hit) {
      traps.splice(i, 1);
      damageEntity(hit, tr.dmg || 40, null);
      hit.slowT = 1.5; hit.slowMul = 0.45;
      spawnParticle(tr.x + tr.w / 2, tr.y + 2, '#ff8a50', { type: 'ring', size: 12, life: 0.4 });
      for (let j = 0; j < 10; j++)
        spawnParticle(tr.x + tr.w / 2, tr.y + 2, '#ffd54f', { size: 3, life: 0.4 });
      AudioFX.boom();
      UI.pushFeed('<b>绊线雷触发！</b>', 'zombie-kill');
    }
  }
}

// 命中加固墙：扣耐久，摧毁后移除实体墙（攻方破拆）
// 可破坏墙（别墅图）：拆掉后同时从碰撞体与 VillaDraw 的墙表里消失
function damageBreakableWall(solid, dmg) {
  solid.hp -= dmg;
  spawnParticle(solid.x + solid.w / 2, solid.y + 20, '#d8cbb2', { size: 3, life: 0.3 });
  if (solid.hp > 0) return;
  const i = level.solids.indexOf(solid);
  if (i >= 0) level.solids.splice(i, 1);
  if (solid.view) solid.view.broken = true;
  spawnParticle(solid.x + solid.w / 2, solid.y + solid.h / 2, '#e8d9b8', { type: 'ring', size: 18, life: 0.5 });
  UI.pushFeed('<b>可破坏墙被轰开了！</b>', '');
  AudioFX.boom();
}
function damageReinforcedWall(solid, dmg, attacker) {
  const wall = solid.wall;
  if (!wall) return;
  wall.hp -= dmg;
  spawnParticle(solid.x + solid.w / 2, solid.y + 16, '#ffb74d', { size: 3, life: 0.35 });
  if (wall.hp <= 0) {
    const i = level.solids.indexOf(solid);
    if (i >= 0) level.solids.splice(i, 1);
    const vs = game.vs;
    if (vs && vs.bp) {
      const wi = vs.bp.walls.indexOf(wall);
      if (wi >= 0) vs.bp.walls.splice(wi, 1);
    }
    spawnParticle(solid.x + solid.w / 2, solid.y + solid.h / 2, '#ffb74d', { type: 'ring', size: 16, life: 0.5 });
    UI.pushFeed('<b>加固墙被摧毁！</b>', '');
    AudioFX.boom();
  }
}

// 攻防回合结束：积分 + 判整局 + 换边/结束
function endSiegeRound(winnerTeam, reason, g) {
  if (!g || g.state === 'over') return;
  const vs = g.vs;
  if (!vs || vs.mode !== 'siege' || vs.phase !== 'fight' || vs._settledRound === vs.round) return;
  const winnerSquad = winnerTeam === 'ATK' ? vs.atkSquad : vs.defSquad;
  if (!winnerSquad) return;
  vs._settledRound = vs.round;
  vs.points[winnerSquad]++;
  const need = Math.ceil((vs.bestOf + 1) / 2);       // 五局三胜 need=3
  // 整局结束？
  if (vs.points[winnerSquad] >= need) {
    g.winner = winnerSquad;
    g.reason = reason;
    vs.winner = winnerSquad;
    g.state = 'over';
    const title = winnerSquad === (g.player && g.player.squad) ? '你的队伍获胜！' : '敌方队伍获胜！';
    UI.showOver(title,
      `整局结果：A 队 [${vs.points.A}]  ·  B 队 [${vs.points.B}] （先 ${need} 胜）\n${reason}\n` +
      `你的击杀：${g.stats.kills}`);
    if (winnerSquad === (g.player && g.player.squad)) AudioFX.win(); else AudioFX.lose();
    if (Net.active()) document.getElementById('againBtn').classList.add('hidden');
    return;
  }
  // 未分胜负：开始下一回合（换边）
  UI.pushFeed(`<b>${reason} · A 队 [${vs.points.A}] · B 队 [${vs.points.B}]</b>`, '');
  nextSiegeRound(g);
}

// 攻防下一回合：换边 + 全队重生（本回合死亡的在下一回合复活）
function nextSiegeRound(g) {
  const vs = g.vs;
  const st = level.stages[0];
  const W = level.worldW;
  vs.round++;
  vs.roundT = 180;
  vs.phase = 'prep'; vs.prepT = 20;
  vs._holdT = 0;
  vs._plant = null; vs.defuser = null;
  vs.obj = pickSiegeObj(vs.obj);
  // 清空旧守方布防：新一轮由新守方重新布置（加固墙实体墙同步移除，恢复软墙）
  for (const w of vs.bp.walls) {
    if (w.solid) { const i = level.solids.indexOf(w.solid); if (i >= 0) level.solids.splice(i, 1); }
  }
  vs.bp.traps.length = 0; vs.bp.walls.length = 0;
  for (const s of vs.breakables || []) {
    s.hp = s.maxHp;
    if (s.view) { s.view.hp = s.maxHp; s.view.broken = false; }
    if (!level.solids.includes(s)) level.solids.push(s);
  }
  // 真正换边：ATK/DEF 队伍标签整体互换，玩家跟随队伍攻守轮转
  const priorAtk = vs.atkSquad;
  vs.atkSquad = vs.defSquad; vs.defSquad = priorAtk;
  for (const e of g.entities) {
    if (e.team === 'ATK') e.team = 'DEF';
    else if (e.team === 'DEF') e.team = 'ATK';
  }
  // 换边后玩家切换对应侧干员（先重置再应用，避免被动叠加）
  const p = g.player;
  if (p && vs.mode === 'siege') applySiegeRole(p, selectedSiegeRole(p.team));
  // 全体重生至己方半场
  const defCount = g.entities.filter(e => e.team === 'DEF').length;
  for (const e of g.entities) {
    e.dead = false; e.hp = e.maxHp;
    const isDef = e.team === 'DEF';
    const spawn = isDef ? (level.spawnZombie || { x: W - 120, y: st.spawnHuman.y }) : level.spawnHuman;
    const index = e.squadIndex || 0;
    const offset = isDef ? (index - (defCount - 1) / 2) * 32 : index * 46;
    e.x = spawn.x + offset - (isDef ? e.w / 2 : 0);
    e.y = spawn.y; e.vx = 0; e.vy = 0; e.onGround = false;
    e.facing = isDef ? -1 : 1;
    e.fireT = 0; e.reloadT = 0; e.reloading = false; e._wantE = false;
    refillAmmo(e);
  }
  // 清理过期子弹/区
  bullets.length = 0; areas.length = 0;
  for (const b of ((g.pickups && g.pickups.ammo[g.stage]) || [])) b.taken = false;
  UI.pushFeed(isArenaCheck() ? '' : `<b>第 ${vs.round} 回合 · ${p ? (p.team === 'ATK' ? '你是攻方' : '你是守方') : ''} · ${vs.obj.name}</b>`, '');
  if (p && p.team === 'DEF') UI.centerMsg('准备阶段 · 你是守方：按 1 放置绊线雷 / 按 2 加固墙体', 2.5);
  else if (p) UI.centerMsg(`准备阶段 · 你是攻方（目标：${vs.obj.name}）等待行动…`, 2.5);
}

function isArenaCheck() { return game && game.vs && game.vs.mode === 'arena'; }
function initStageRuntime(g) {
  const st0 = level.stages[0];
  g.portals = level.stages.map(s => (s.portal ? { ...s.portal, opened: !s.portal.need || s.portal.need === 'none' } : null));
  g.mechs = level.stages.map(s => (s.mechanisms || []).map(m => ({
    ...m,
    hp: m.hp != null ? m.hp : 0,
    closed: m.type === 'bridge' ? false : !!m.closed,
    active: false,
    x0: m.x, px: m.x, dir: m.dir || 1,
    _px: m.x,
  })));
  const pk = g.pickups;
  pk.ammo = level.stages.map(s => (s.ammoBoxes || []).map(b => ({ ...b, taken: false })));
  pk.weapons = level.stages.map(s => (s.weaponBoxes || []).map(b => ({ ...b, taken: false })));
  pk.caps = level.stages.map(s => (s.capsules || []).map(b => ({ ...b, taken: false })));
  pk.keys = level.stages.map(s => (s.keys || []).map(b => ({ ...b, taken: false })));
  pk.crystals = level.stages.map(s => (s.crystals || []).map(b => ({ ...b, taken: false })));
  g.activeRespawns = (st0.respawns || []).map(r => ({ ...r }));
  g.respawnT = 0; g.respawnCd = 4;
  g.stage = 0; g.guardT = -1; g.guardGrace = -1; g.advanceOpen = false; g.shortcutOpen = false; g.escapeActive = false; g.escapeProg = 0;
}

// ---------- 物理移动 ----------
// 换层爬梯（火车图专用）。判定带、梯顶/梯底、爬速与出梯跨距全部读关卡数据
// （js/train-level.js 从 TrainGen.LIM/LAD 原样搬过来），引擎里不再另定一套 ——
// 条件与 js/train-gen.js:854 那段 mover 逐条同口径，独立页能走通的梯在这里才是同一把梯。
// 调用点在 moveEntity 里带数据门控：不带 level.ladders 的地图连这个函数都不会被叫到。
function tryClimb(e, dt) {
  const LADS = level.ladders;
  e.onLadder = false;
  const up = e.isPlayer ? Input.jumpBuffered() : !!e.wantClimbUp;
  const down = e.isPlayer ? Input.any('s', 'arrowdown') : !!e.wantClimbDown;
  if (!up && !down) return false;
  for (const L of LADS) {
    if (e.x + e.w < L.x - 2 || e.x > L.x + L.w - 2) continue;
    if (e.y + e.h <= L.y1 - 2 || e.y >= L.y0 + 2) continue;   // 身体没压在梯身上
    e.onLadder = true; e.vx = 0; e.vy = 0; e.onGround = true;
    if (up) {
      e.y -= L.speed * dt;
      // 爬到顶要「跨出」检修口而不是停在洞口：停在缺口上，下一帧就直接掉回梯底
      if (e.y + e.h <= L.y1) { e.y = L.y1 - e.h; e.x = L.x + L.exit; }
    } else {
      e.y += L.speed * dt;
      if (e.y + e.h >= L.y0) { e.y = L.y0 - e.h; }
    }
    return true;                    // 一帧只爬一把梯（= train-gen.js:874 的 break outer）
  }
  return false;
}

function moveEntity(e, dt) {
  const vs = game.vs;
  // 攻防准备阶段：全员冻结移动，仅守方玩家可移动布防（防攻方 prep 抢跑）
  if (vs && vs.mode === 'siege' && e.kind === 'human'
    && (game.state === 'countdown' || (vs.phase === 'prep' && !(e.isPlayer && e.team === 'DEF')))) {
    e.vx = 0; e.vy = 0;
    return;
  }
  const prevBottom = e.y + e.h;
  const prevGround = e.onGround;
  let mv = 0, spd = CFG.HUMAN_SPEED;

  if (e.kind === 'human') {
    if (e.isPlayer) {
      const L = Input.any('a', 'arrowleft'), R = Input.any('d', 'arrowright');
      mv = (R ? 1 : 0) - (L ? 1 : 0);
    } else mv = e.ai.move;
    spd = CFG.HUMAN_SPEED * ((e.isPlayer && e.equipFx && e.equipFx.speedMul) || 1);
  } else {
    if (e.isPlayer) {
      const L = Input.any('a', 'arrowleft'), R = Input.any('d', 'arrowright');
      mv = (R ? 1 : 0) - (L ? 1 : 0);
    } else mv = e.aiMove || 0;
    spd = e.speed * (e.buffs && e.buffs.passive === 'speed' ? 1.3 : 1) * (e.termT > 0 ? 1.45 : 1);
  }

  if (e.dashing) { e.vx = e.facing * e.speed * 2.3; }
  else if (e.knockT > 0) {
    e.knockT -= dt;
    e.vx *= Math.max(0, 1 - dt * 3);   // 击退惯性：期间 AI 不追，缓慢衰减形成明显位移
  }
  else {
    const unstop = e._slowImmune || (e.kind === 'zombie' && e.buffs && e.buffs.passive === 'unstop');
    if (e.freezeT > 0) { e.freezeT -= dt; if (!unstop) spd *= 0.35; }   // 闪光/烟雾减速（无畏意志 / 锚点免疫）
    if (e.stunT > 0 && !unstop) spd = 0;                               // 震荡弹眩晕（无畏意志 / 锚点免疫）
    else if (e.slowT > 0 && !unstop) spd *= e.slowMul;                 // 减速/急冻弹
    const target = mv * spd;
    e.vx += (target - e.vx) * Math.min(1, dt * 12);
    if (Math.abs(e.vx) < 1) e.vx = 0;
  }
  if (e.vx > 1) e.facing = 1; else if (e.vx < -1) e.facing = -1;
  if (Math.abs(e.vx) > 30) e.animT += dt * 9; else e.animT += dt;

  // 换层爬梯：门控写在这里，别的地图（逃亡/竞技/攻防/生化/古堡）level.ladders 为空，
  // 整条分支一次都不执行 —— 凭证不是注释，是 tools/_check_train_climb.js 的四类地图 × 150 帧逐帧轨迹黄金档。
  if (level.ladders && level.ladders.length && tryClimb(e, dt)) return;

  const wantJump = e.isPlayer ? Input.jumpBuffered() : !!e.wantJump;
  if (wantJump && e.onGround) {
    e.vy = CFG.JUMP_V * ((e.isPlayer && e.equipFx && e.equipFx.jumpMul) || 1);
    e.onGround = false;
    if (e.isPlayer && e.kind === 'human') AudioFX.jump();
  }

  if (e.flyT > 0) { e.vy = 0; e.onGround = false; }   // 飞身强击：腾空滑行不受重力
  e.vy += CFG.G * dt;
  if (e.vy > CFG.MAX_FALL) e.vy = CFG.MAX_FALL;

  // X 轴
  e.x += e.vx * dt;
  for (const s of level.solids) {
    if (s.oneway) continue;
    if (e.x < s.x + s.w && e.x + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y) {
      if (e.vx > 0) e.x = s.x - e.w; else if (e.vx < 0) e.x = s.x + s.w;
      e.vx = 0;
    }
  }
  // 机关门：阻挡幽灵（人类可自由通过）
  if (e.kind === 'zombie' && game && game.mechs) {
    for (const m of game.mechs[game.stage]) {
      if (m.type !== 'door' || m.broken || !m.closed) continue;
      if (e.x < m.x + m.w && e.x + e.w > m.x && e.y < m.y + m.h && e.y + e.h > m.y) {
        if (e.vx > 0) e.x = m.x - e.w; else if (e.vx < 0) e.x = m.x + m.w;
        e.vx = 0;
      }
    }
  }
  // 关卡推进线：防守/钥匙开启前人类与僵尸都不可越界（母体/召唤物也不得刷到封锁线前方）
  if ((e.kind === 'human' || e.kind === 'zombie') && game && game.stage < level.stages.length - 1) {
    const st = level.stages[game.stage];
    if (st && !game.advanceOpen) {
      const lx = advanceLineX(st);
      if (e.x + e.w > lx) { e.x = lx - e.w; e.vx = 0; }
    }
  }
  // 移动总闸：僵尸始终不得越过人类阵线（母体跳跃/冲刺/高速跑动都可能甩到人类前方堵路，任何阶段都拦截；训练营无敌木桩除外，否则会被拖回玩家身边）
  // 生化模式（game.bio）与灰盒游览（game.walk）是「一张固定地图全域攻防」，没有前进方向，
  // 这道闸门会把感染方永久钉在人类身后 —— 必须整条旁路，普通逃亡模式行为不变。
  if (e.kind === 'zombie' && game && !e.invuln && !game.bio && !game.walk) {
    const front = humanFrontX();
    if (front != null && e.x + e.w > front) { e.x = front - e.w; e.vx = Math.min(0, e.vx); }
  }
  // Y 轴
  e.y += e.vy * dt;
  e.onGround = false;
  for (const s of level.solids) {
    if (e.x >= s.x + s.w || e.x + e.w <= s.x) continue;
    if (e.y >= s.y + s.h || e.y + e.h <= s.y) continue;
    if (s.oneway) {
      if (e.vy > 0 && prevBottom <= s.y + 12) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; }
      continue;
    }
    if (e.vy > 0) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; }
    else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
  }
  // 世界边界
  if (e.x < 0) { e.x = 0; e.vx = 0; }
  if (e.x + e.w > level.worldW) { e.x = level.worldW - e.w; e.vx = 0; }

  // 落地事件（母体猛击）
  if (!prevGround && e.onGround && e.slamLaunch) doSlam(e);

  // 掉落死亡
  if (e.y > (level && level.killY || CFG.KILL_Y)) handleFall(e);   // 多层地图有自己的死亡线（地下室在 565 以下）
}

// 就近悬崖复活点：人类/幽灵掉崖统一传送到最近的悬崖边（不处死、不等待）
function nearestCliffRespawn(x) {
  const list = level.cliffRespawns || [];
  let best = null, bd = Infinity;
  for (const p of list) {
    const d = Math.abs(p.x - x);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function handleFall(e) {
  // 人类掉崖：就近传送到悬崖边复活点，不处死、不变幽灵
  if (e.kind === 'human') {
    const pt = nearestCliffRespawn(e.x + e.w / 2);
    if (pt) {
      e.x = Math.max(4, Math.min(level.worldW - e.w - 4, pt.x));
      e.y = pt.y - e.h;
      e.vx = 0; e.vy = 0;
      if (e.isPlayer) UI.centerMsg('你掉下悬崖，已被传送到悬崖边！', 1.2);
      spawnParticle(e.x + e.w / 2, e.y + e.h / 2, '#4fc3f7', { type: 'ring', size: 22, life: 0.6 });
      return;
    }
    infect(e, null);                                 // 兜底：无悬崖复活点（理论不发生）→ 感染
    return;
  }
  // 幽灵跳崖自杀：保持原行为（热比雷等靠跳崖/自爆技能的玩法依赖死亡入队）
  // 按死亡处理，清空 Buff 并在冷却后于人类身后追尾重生
  if (game) queueZombieDeath(e);
  e.hp = 0;
  e.dead = true;
}

// ---------- 实体分离：人类与僵尸互为实心碰撞（互相顶住），队友之间无碰撞（可穿行），僵尸之间无碰撞 ----------
function separateEntities() {
  const es = game.entities;
  // 人类 × 僵尸：实心碰撞，重叠时双方各让一半，互相顶得动（一方压过来另一方被挡住）
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.kind !== 'human') continue;
    for (let j = 0; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.kind !== 'zombie') continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 0 || oy <= 0) continue;
      const dir = (b.x + b.w / 2) - (a.x + a.w / 2) >= 0 ? 1 : -1;
      const h = ox * 0.5;
      a.x -= dir * h;
      b.x += dir * h;
    }
  }
  // 分离后将被推入地形的实体弹回（避免穿墙 / 卡在平台内）
  for (const e of es) {
    if (e.dead) continue;
    for (const s of level.solids) {
      if (s.oneway) continue;
      if (e.x < s.x + s.w && e.x + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y) {
        const cxm = (e.x + e.w / 2) - (s.x + s.w / 2);
        if (cxm > 0) e.x = s.x + s.w; else e.x = s.x - e.w;
      }
    }
    if (e.x < 0) e.x = 0;
    if (e.x + e.w > level.worldW) e.x = level.worldW - e.w;
  }
}

// ---------- 射击 ----------
// 配件 + 开镜对本枪的影响（乘法系数；无配件时均为 1）
function attachShotMods(e, w) {
  const fx = e.attFx || null;
  const mods = {
    spreadMul: fx ? fx.spreadMul : 1,
    recoilMul: fx ? fx.recoilMul : 1,
    bspeedMul: fx ? fx.bspeedMul : 1,
    rangeMul:  fx ? fx.rangeMul : 1,
    volMul:    fx ? fx.volMul : 1,
    flashMul:  fx ? fx.flashMul : 1,
    hideTracer: fx ? fx.hideTracer : false,
    // 弹药效果（穿甲/爆破/曳光）
    pierce:   fx && fx.pierce ? fx.pierce : 0,
    explosive: fx ? fx.explosive : false,
    splash:   fx && fx.explosive ? (fx.splash || 46) : 0,
    dmgMul:   fx && fx.dmgMul != null ? fx.dmgMul : 1,
    trailBoost: fx && fx.trailBoost != null ? fx.trailBoost : 0,
  };
  if (e.ads && w && !w.melee && !w.grenade) mods.spreadMul *= 0.55;   // 开镜额外压枪
  return mods;
}
function tryFire(e, dt) {
  if (e.kind !== 'human' || e.dead) return;
  const w = WEAPONS[e.weapon];
  e.fireT -= dt;
  if (e.emptyBeep == null) e.emptyBeep = false;

  // 投掷：玩家=按下蓄力/松开投掷（点按基准力度，长按加力）；AI/网络=fire 即丢
  if (w.grenade) {
    if (e.count <= 0) {
      if (e.isPlayer && !e.emptyBeep) { AudioFX.empty(); e.emptyBeep = true; }
      e.charging = false;
      return;
    }
    if (e.isPlayer) {
      if (Input.mouse.down && !_prevMD) { e.charging = true; e.chargeT = 0; e.throwPower = 0; }
      if (e.charging) {
        e.chargeT += dt;
        e.throwPower = Math.min(1, e.chargeT / CFG.THROW_CHARGE);
      }
      if (!Input.mouse.down && _prevMD && e.charging) {
        e.charging = false;
        e.count--;
        e.fireT = 0.35;
        AudioFX.throwGrenade();
        // 只有"投出去"之后才发视觉事件（开始蓄力不扣数量、不发事件）
        if (!(typeof ArtEvents !== 'undefined' && ArtEvents.emit('throw', e))) e.muzzleT = 0.05;
        throwGrenade(e, w, e.throwPower);
        e.throwPower = 0; e.chargeT = 0;
      }
      return;
    }
    // AI / 网络投掷：原逻辑（fire 即丢，基准力度）
    if (!e.ai.fire || e.reloading) return;
    if (e.fireT > 0) return;
    e.fireT = 1 / (w.rpm || 0.6);
    e.count--;
    if (!(typeof ArtEvents !== 'undefined' && ArtEvents.emit('throw', e))) e.muzzleT = 0.05;
    throwGrenade(e, w, 0);
    return;
  }

  const want = e.isPlayer ? Input.mouse.down : e.ai.fire;
  if (!want) { e.fireHeld = false; if (e.windup) e.windup = Math.max(0, e.windup - dt * 4); return; }
  if (e.reloading) return;

  // 近战：无弹药消耗，范围挥砍
  if (w.melee) {
    if (e.fireT > 0) return;
    e.fireT = 1 / w.rpm;
    meleeSwing(e, w);
    return;
  }

  // 枪械
  if (e.mag <= 0) {
    if (e.isPlayer && !e.emptyBeep) { AudioFX.empty(); e.emptyBeep = true; }
    startReload(e); return;
  }
  if (e.isPlayer && !w.auto && e.fireHeld) return;
  // 加特林预热：按住扳机即加速（累积风速），松手冷却
  if (w.windup) e.windup = Math.min(1, (e.windup || 0) + dt * 3);
  if (e.fireT > 0) return;
  if (e.isPlayer) e.fireHeld = true;
  // 加特林射速随预热提升
  let rpm = w.rpm;
  if (w.windup) rpm = 4 + (w.rpm - 4) * e.windup;
  e.fireT = 1 / (rpm * (CFG.GLOBAL_RPM_MUL || 1));
  e.mag--;
  e.muzzleT = 0.05;
  // 配件：散布/后坐/弹速/射程/音量/闪光（开镜额外压枪）
  const mods = attachShotMods(e, w);
  const recoil = w.recoil * mods.recoilMul * (CFG.GLOBAL_RECOIL_MUL || 1);
  const feel = w.feel || {};   // 每把枪独立手感档案（config.js 注入）
  // 弹道扩散增长（bloom）：持续开火散布增大（霰弹靠 pellets 本身大散布，不叠加）
  if (w.bloom != null) e.bloom = Math.min(w.bloomMax || 1, (e.bloom || 0) + w.bloom * (CFG.GLOBAL_BLOOM_MUL || 1));
  // 移动射击惩罚：跑打更飘
  let spreadMul = mods.spreadMul;
  if (Math.abs(e.vx) > 60) spreadMul *= 1.35;
  const bloomMul = 1 + (e.bloom || 0);
  AudioFX.shoot(e.weapon, mods.volMul);
  // burst：一次扣弹多发（如 FAMAS 三连发）
  const bursts = w.burst || 1;
  const span = (bursts - 1) * 0.006;
  for (let i = 0; i < bursts; i++) {
    const ang = e.aim + (i * 0.006 - span / 2) + (Math.random() - 0.5) * recoil;
    const pl = fireBullet(e, e.weapon, ang, {
      spreadMul, bspeedMul: mods.bspeedMul,
      rangeMul: mods.rangeMul, hideTracer: mods.hideTracer, bloomMul,
      pierce: mods.pierce, explosive: mods.explosive, splash: mods.splash,
      dmgMul: mods.dmgMul, trailBoost: mods.trailBoost,
    });
    for (const b of pl) bullets.push(b);
  }
  FX.shakeMag = Math.min(6, FX.shakeMag + recoil * 55 * (feel.shake || 1));
  if (e.isPlayer) {
    // 上抬上限按枪（狙击大、手枪小）+ 水平漂移（AK 明显右飘、SCAR 平稳）
    e.recoilKick = Math.min(feel.kickMax != null ? feel.kickMax : 0.09, e.recoilKick + recoil);
    e.recoilSide = Math.max(-0.06, Math.min(0.06, (e.recoilSide || 0) + (Math.random() - 0.32) * (feel.kickSide || 0.02)));
  }
  const mx = e.x + e.w / 2 + Math.cos(e.aim) * (e.w / 2 + 10);
  const my = entityFireY(e) + Math.sin(e.aim) * (e.w / 2 + 10);
  e.lastMuzzleX = mx; e.lastMuzzleY = my;
  // 视觉事件：只有"已扣弹、已生成弹体"的真实发射才发事件。
  // 枪口火光时序与抛壳时机由 ArtEvents 的时间轴按机制决定；旧版兼容路径保留在 else 分支。
  if (typeof ArtEvents !== 'undefined' && ArtEvents.emit('shot', e, { fired: true, shots: bursts })) {
    // 走事件系统（第 3 阶段）
  } else {
  // 枪口火光粒子（数量按手感档案：霰弹多、手枪少）
  for (let i = 0; i < (feel.flashSize || 4); i++) {
    spawnParticle(mx, my, Math.random() < 0.5 ? '#ffd54f' : '#ffb300', {
      vx: Math.cos(e.aim) * (130 + Math.random() * 160) + (Math.random() - 0.5) * 70,
      vy: Math.sin(e.aim) * (130 + Math.random() * 160) + (Math.random() - 0.5) * 70,
      size: 1.8 + Math.random() * 2.2, life: 0.1 + Math.random() * 0.12, grav: 260,
    });
  }
  // 弹壳抛射：力度按手感档案（狙击弹壳飞得远、手枪轻）
  const shells = w.g === 'shotgun' ? (w.name === '双管猎枪' ? 2 : 1) : 1;
  const shellCol = (w.g === 'shotgun' || w.g === 'sniper') ? '#d84315' : '#ffb300';
  const shellSize = w.g === 'pistol' || w.g === 'smg' ? 4.5 : (w.g === 'sniper' ? 8 : 6);
  const shellPow = feel.shellPow || 1;
  for (let i = 0; i < shells; i++) {
    ejectShell(e.x + e.w / 2 - Math.cos(e.aim) * 8, e.y + e.h * 0.2, {
      vx: -Math.cos(e.aim) * (120 + Math.random() * 90) * shellPow + (Math.random() - 0.5) * 80,
      vy: -(200 + Math.random() * 170) * shellPow,
      size: shellSize, color: shellCol,
    });
  }
  }
}

// 近战挥砍：前方扇形范围伤害
function meleeSwing(e, w) {
  // 近战不再借用枪口火光计时（第 0 阶段缺陷 #8）；有事件系统时走挥砍时间轴
  if (!(typeof ArtEvents !== 'undefined' && ArtEvents.emit('melee', e))) e.muzzleT = 0.08;
  if (e.isPlayer) AudioFX.melee();
  const cx = e.x + e.w / 2, cy = entityFireY(e);
  const ang = e.aim;
  FX.shakeMag = Math.min(6, FX.shakeMag + 3);
  for (const t of game.entities) {
    if (t.dead || allied(t, e)) continue;
    const dx = (t.x + t.w / 2) - cx, dy = (t.y + t.h / 2) - cy;
    const d = Math.hypot(dx, dy);
    if (d > w.range) continue;
    if (Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - ang), Math.cos(Math.atan2(dy, dx) - ang))) > 1.4) continue;
    const r = w.fx ? weaponHitDamage(t, w.fx, e, w.dmg) : { dmg: w.dmg, crit: false };
    damageEntity(t, r.dmg, e, { key: e.weapon, x: t.x + t.w / 2 + Math.cos(ang) * t.w * 0.3,
      y: t.y + t.h * 0.45, dir: ang, method: 'melee' });
    if (r.crit) spawnText(t.x + t.w / 2, t.y - 22, '暴击!', '#ffd54f', 15);
    if (w.fx) applyWeaponFx(t, w.fx, e, r.dmg);
    t.vx += Math.cos(ang) * 90;
  }
  // 近战可破拆面前加固墙（伤害低，主破拆手段是爆破弹）
  for (const s of level.solids) {
    if (!s.reinforce) continue;
    const wx = s.x + s.w / 2, wy = s.y + s.h / 2;
    if (Math.hypot(wx - cx, wy - cy) > w.range + 40) continue;
    if (Math.abs(Math.atan2(Math.sin(Math.atan2(wy - cy, wx - cx) - ang), Math.cos(Math.atan2(wy - cy, wx - cx) - ang))) > 1.4) continue;
    damageReinforcedWall(s, 15, e);
    break;
  }
  spawnParticle(cx + Math.cos(ang) * w.range * 0.7, cy + Math.sin(ang) * w.range * 0.7, '#ffffff', { size: 3, life: 0.15, grav: 0 });
}

// 投掷：抛物线弹体（含重力）。power 0~1 = 蓄力力度（0=点按基准，1=满蓄 1.65 倍初速，曲线更远更直）
function throwGrenade(e, w, power) {
  const ang = e.aim;
  const mul = 1 + CFG.THROW_POWER_MAX * (power || 0);
  const speed = w.bspeed * mul;
  // 引信：拔销后按剩余引信计时（可空爆），未拔销=完整引信；无 fuse 的投掷物碰触/超时触发
  const fuseTotal = w.fuse || null;
  let bFuse = null;
  if (fuseTotal != null) bFuse = Math.max(0, fuseTotal - (e.pinPulled ? (e.fuseLeft || 0) : 0));
  e.pinPulled = false; e.fuseLeft = 0;
  bullets.push({
    x: e.x + e.w / 2 + Math.cos(ang) * 12,
    y: entityFireY(e),
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed - 120,
    dmg: w.dmg || 0, owner: e, faction: e.faction, team: e.team != null ? e.team : null,
    life: fuseTotal != null ? fuseTotal + 5 : 3.5,
    key: e.weapon,
    grenade: true, effect: w.effect, splash: w.splash || 100,
    fuse: bFuse, radius: 8,
    grav: true,
  });
}

// 投掷抛物线轨迹模拟（与 throwGrenade 初速一致）：返回世界坐标路径点 + 是否落地
function buildThrowTrajectory(x, y, aim, bspeed, power, maxSteps) {
  const mul = 1 + CFG.THROW_POWER_MAX * (power || 0);
  const spd = bspeed * mul;
  let vx = Math.cos(aim) * spd;
  let vy = Math.sin(aim) * spd - 120;
  let px = x, py = y;
  const pts = [{ x: px, y: py }];
  const gTop = level.groundTop;
  const dt2 = 1 / 60;
  let landed = false;
  const steps = maxSteps || 90;
  for (let i = 0; i < steps; i++) {
    vy += CFG.G * dt2;
    px += vx * dt2; py += vy * dt2;
    pts.push({ x: px, y: py });
    if (py >= gTop) { landed = true; break; }
  }
  return { pts, landed, endX: px, endY: landed ? gTop : py };
}

// 投掷物生效：爆炸 / 闪光 / 烟 / 火 / 毒
function spawnGrenadeEffect(b) {
  const cx = b.x, cy = b.y;
  if (b.effect === 'boom' || b.effect === 'impact') {
    explodeArea(cx, cy, b.splash, b.dmg, b.owner, { key: b.key });
  } else if (b.effect === 'flash') {
    AudioFX.boom();
    FX.shakeMag = Math.min(10, FX.shakeMag + 6);
    spawnParticle(cx, cy, '#ffffff', { type: 'ring', size: 16, life: 0.5, grav: 0 });
    flashFx = 0.5;
    for (const e of game.entities)
      if (e.kind === 'zombie' && !e.dead &&
          Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= b.splash)
        e.freezeT = 2;
  } else if (b.effect === 'smoke') {
    areas.push({ type: 'smoke', x: cx, y: cy, r: b.splash, life: 5, maxLife: 5, owner: b.owner });
  } else if (b.effect === 'fire') {
    areas.push({ type: 'fire', x: cx, y: cy, r: b.splash, life: 3, maxLife: 3, dmg: b.dmg, owner: b.owner });
  } else if (b.effect === 'bio') {
    areas.push({ type: 'bio', x: cx, y: cy, r: b.splash, life: 5, maxLife: 5, dmg: b.dmg, owner: b.owner });
  } else if (b.effect === 'heal') {
    spawnParticle(cx, cy, '#ff8a65', { type: 'ring', size: 12, life: 0.5 });
    for (const e of game.entities) {
      if (e.dead || !allied(e, b.owner)) continue;
      if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= b.splash)
        e.hp = Math.min(e.maxHp, e.hp + 40);
    }
  } else if (b.effect === 'freeze') {
    // 冰冻手雷：范围内僵尸冻结（复用 freezeT 减速机制）
    AudioFX.boom();
    FX.shakeMag = Math.min(10, FX.shakeMag + 6);
    spawnParticle(cx, cy, '#81d4fa', { type: 'ring', size: 14, life: 0.5 });
    for (let i = 0; i < 14; i++)
      spawnParticle(cx + (Math.random() - 0.5) * b.splash, cy + (Math.random() - 0.5) * b.splash,
        i % 2 ? '#b3e5fc' : '#e1f5fe', { size: 5, life: 0.6 });
    for (const e of game.entities)
      if (e.kind === 'zombie' && !e.dead &&
          Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= b.splash)
        e.freezeT = 3;
  }
}

// 范围爆炸（榴弹 / 手雷共用）
function explodeArea(cx, cy, radius, dmg, owner, src) {
  AudioFX.boom();
  FX.shakeMag = Math.min(10, FX.shakeMag + 6);
  spawnParticle(cx, cy, '#ff8a50', { type: 'ring', size: 10, life: 0.45 });
  for (let i = 0; i < 16; i++) spawnParticle(cx, cy, '#ffb74d', { size: 4, life: 0.5 });
  spawnText(cx, cy - 10, 'BOOM!', '#ff8a50', 16);
  for (const e of game.entities) {
    if (e.dead || allied(e, owner)) continue;
    if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= radius) {
      // 接触点：目标盒面上最接近爆心的一点（无精确射线，标为估算）
      const px = Math.max(e.x, Math.min(e.x + e.w, cx)), py = Math.max(e.y, Math.min(e.y + e.h, cy));
      damageEntity(e, dmg, owner, { key: (src && src.key) || null, x: px, y: py,
        dir: Math.atan2(py - cy, px - cx), method: 'explosion', estimated: true });
    }
  }
  // 爆破可破拆范围内的加固墙（爆破弹破拆主手段）
  for (let i = level.solids.length - 1; i >= 0; i--) {
    const s = level.solids[i];
    if (!s.reinforce) continue;
    if (Math.hypot((s.x + s.w / 2) - cx, (s.y + s.h / 2) - cy) <= radius + 24)
      damageReinforcedWall(s, dmg, owner);
  }
}

// 效果区每帧推进（火 / 毒持续伤害，烟减速）
function updateAreas(dt) {
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i];
    a.life -= dt;
    if (a.life <= 0) { areas.splice(i, 1); continue; }
    for (const e of game.entities) {
      if (e.dead || allied(e, a.owner)) continue;
      const d = Math.hypot(e.x + e.w / 2 - a.x, e.y + e.h / 2 - a.y);
      if (d > a.r) continue;
      if (a.type === 'fire' || a.type === 'bio') damageEntity(e, a.dmg * dt, a.owner);
      else if (a.type === 'smoke' && e.kind === 'zombie') e.freezeT = Math.max(e.freezeT, 0.15);
    }
  }
}

// 当前武器的满弹匣容量（含扩容弹匣 magMul；近战/拾取武器无限或定额不受影响）
function magCapacityFor(h, w) {
  if (w.melee) return Infinity;
  if (w.pickup) return (h.arsenal && h.arsenal[h.weapon] && h.arsenal[h.weapon].mag) || w.mag || 0;
  const mul = (h.attFx && h.attFx.magMul) || 1;
  return Math.round((w.mag || 0) * mul);
}

// 切换武器（槽位内具体武器），同步弹匣 / 投掷数量 / 预热
function switchWeapon(e, key) {
  const prev = e.weapon;
  const w = WEAPONS[key];
  const g = WEAPON_GROUP_OF[key];
  if (g) e.groupSel[g.id] = key;
  const slot = slotOfWeapon(key);
  if (slot) e.groupSel[slot] = key;
  e.weapon = key;
  if (typeof computeHumanAttachments === 'function') computeHumanAttachments(e);
  e.mag = magCapacityFor(e, w);
  e.count = e.arsenal[key].count != null ? e.arsenal[key].count : (w.count || 0);
  e.reloading = false; e.reloadT = 0; e.fireT = 0.12; e.windup = 0;
  // 切换武器：重置投掷蓄力与引信（避免跨武器残留）
  e.pinPulled = false; e.fuseLeft = 0;
  e.charging = false; e.throwPower = 0; e.chargeT = 0;
  // 视觉：终止上一把枪的动作（不留漂浮弹匣/残留枪火/错误手势），再播本次出枪
  if (typeof ArtEvents !== 'undefined' && prev && prev !== key) {
    ArtEvents.cancel(e.id, 'switch');
    ArtEvents.emit('draw', e, { key });
  }
}

function startReload(e) {
  const w = WEAPONS[e.weapon];
  if (w.pickup) return;   // 拾取武器定额弹药，无法换弹（打空直接消失）
  const cap = magCapacityFor(e, w);
  if (e.reloading || e.mag >= cap) return;
  e.reloading = true;
  e.reloadT = w.reload * ((e.attFx && e.attFx.reloadMul) || 1) * (CFG.GLOBAL_RELOAD_MUL || 1);
  e.reloadTotal = e.reloadT;   // 本次实际总时长（含配件与全局倍率）：只供视觉归一化使用
  if (e.isPlayer) AudioFX.reload(e.weapon);
  // 视觉换弹：把"本次实际总时长"交给时间轴做 0→1 归一化；动画不决定何时补弹
  if (typeof ArtEvents !== 'undefined') ArtEvents.emit('reloadStart', e, { total: e.reloadTotal });
}

function updateReload(e, dt) {
  if (!e.reloading) return;
  e.reloadT -= dt;
  if (e.reloadT <= 0) {
    e.mag = magCapacityFor(e, WEAPONS[e.weapon]); e.reloading = false;
    if (typeof ArtEvents !== 'undefined') ArtEvents.cancel(e.id, 'reloadDone');
  }
}

// ---------- 子弹 ----------
function explodeBullet(b) {
  explodeArea(b.x, b.y, b.splash, b.dmg, b.owner, { key: b.key });
}

// 弹丸打到地图表面：走同一套类别级受击视觉，材质由碰撞体 mat 标记决定
function surfaceHit(b, s) {
  if (typeof HitArt !== 'undefined' && HitArt.emit({ key: b.key, solid: s, x: b.x, y: b.y,
    dir: Math.atan2(b.vy, b.vx) + Math.PI, method: 'surface' })) return;
  spawnParticle(b.x, b.y, '#ffd54f', { vx: -b.vx * 0.1, vy: -b.vy * 0.1, life: 0.2, size: 2 });
}

function updateBullets(dt) {
  for (const b of bullets) {
    const previousX = b.x, previousY = b.y;
    // 投掷物有重力，呈抛物线
    if (b.grav) { b.vy += CFG.G * dt; if (b.vy > CFG.MAX_FALL) b.vy = CFG.MAX_FALL; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    // 引信倒计时：归零即触发（可空中引爆 / 落地后定时引爆）
    if (b.fuse != null) {
      b.fuse -= dt;
      if (b.fuse <= 0) { spawnGrenadeEffect(b); b.dead = true; continue; }
    }
    let hit = false;
    const castleHit = level.castle && typeof CastleCollisionSweep !== 'undefined'
      ? CastleCollisionSweep.firstHit(level.solids, previousX, previousY, b.x, b.y) : null;
    if (castleHit) { b.x = castleHit.x; b.y = castleHit.y; }
    // 地形
    for (const s of level.solids) {
      if (s.oneway) continue;
      if (castleHit ? s === castleHit.solid :
          b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h) {
        if (s.breakable) {
          // 步枪约十发轰开一面，爆破弹/榴弹一发
          damageBreakableWall(s, (b.grenade || b.explosive) ? (b.dmg || 0) * 1.6 : (b.dmg || 0) * 0.55);
          surfaceHit(b, s);
          hit = true;
        } else if (s.reinforce && !b.grenade && !b.explosive) {
          // 加固墙：普通子弹伤害极低（破拆依赖爆破弹），弹着火花
          damageReinforcedWall(s, Math.max(1, (b.dmg || 0) * 0.05), b.owner);
          surfaceHit(b, s);
          hit = true;
        } else if (b.grenade && b.fuse != null) {
          // 引信投掷物落地：首次轻微弹跳，之后停住等引信归零
          if (castleHit && castleHit.normalX) {
            // Side impacts remain at their real contact height. A tall castle
            // wall must not send a grenade to its top as if it were a floor.
            b.vx = b._bounced ? 0 : -b.vx * 0.35;
            b._bounced = true;
          } else if (castleHit && castleHit.normalY > 0) {
            b.vy = Math.abs(b.vy) * 0.35; b.vx *= 0.5; b._bounced = true;
          } else if (!b._bounced) { b.vy = -b.vy * 0.35; b.vx *= 0.5; b.y = s.y - 6; b._bounced = true; }
          else { b.vx = 0; b.vy = 0; b.y = s.y - 6; }
        } else {
          surfaceHit(b, s);
          hit = true;
        }
        break;
      }
    }
    if (hit) {
      if (b.grenade) spawnGrenadeEffect(b);
      else if (b.explosive) explodeBullet(b);
      b.dead = true; continue;
    }
    // 投掷物命中敌对实体：无引信投掷物立即触发；引信投掷物保持等待（不打断计时）
    if (b.grenade) {
      let ghit = false;
      for (const e of game.entities) {
        if (e.dead || allied(e, b)) continue;
        const box = entityHurtBox(e);
        if (b.x > box.x && b.x < box.x + box.w && b.y > box.y && b.y < box.y + box.h) { ghit = true; break; }
      }
      if (ghit && b.fuse == null) { spawnGrenadeEffect(b); b.dead = true; }
      continue;
    }
    // 普通子弹 / 榴弹弹头 / 激光
    for (const e of game.entities) {
      if (e.dead || allied(e, b)) continue;
      const box = entityHurtBox(e);
      if (b.x > box.x && b.x < box.x + box.w && b.y > box.y && b.y < box.y + box.h) {
        if (b.explosive) { explodeBullet(b); b.dead = true; break; }
        let dmg = b.dmg, crit = false;
        if (b.fx) { const r = weaponHitDamage(e, b.fx, b.owner, b.dmg); dmg = r.dmg; crit = r.crit; }
        // 类别取 b.key（发射时定死的武器 ID），不取 b.owner.weapon（飞行期间可能已切枪）
        damageEntity(e, dmg, b.owner, { key: b.key, x: b.x, y: b.y,
          dir: Math.atan2(b.vy, b.vx), method: b.pierce ? 'pierce' : 'bullet' });
        if (crit) spawnText(e.x + e.w / 2, e.y - 22, '暴击!', '#ffd54f', 15);
        if (b.fx) applyWeaponFx(e, b.fx, b.owner, dmg);
        if (b.pierce > 0) {
          b._hit = b._hit || {};
          if (b._hit[e.id]) { b.dead = true; break; }
          b._hit[e.id] = 1; b.pierce--;
          break;   // 穿透后继续飞行，可命中下一目标
        }
        b.dead = true; break;
      }
    }
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.dead || b.life <= 0) {
      if (b.grenade && !b.dead) spawnGrenadeEffect(b);
      else if (b.explosive && !b.dead) explodeBullet(b);
      bullets.splice(i, 1);
    }
  }
}

// ---------- 武器特色（fx）----------
// 特效飘字：仅训练营可见（正式模式不刷屏，状态数据照常生效）
function fxText(t, text, color, size) {
  if (!(game && game.training)) return;
  spawnText(t.x + t.w / 2, t.y - 30, text, color || '#fff', size || 13);
}
// 计算命中伤害：暴击翻倍 / 狂热递增（调用后需用返回值替换原伤害）
function weaponHitDamage(t, fx, attacker, baseDmg) {
  const m = FX_META[fx];
  let dmg = baseDmg, crit = false;
  if (m && m.critChance && attacker && Math.random() < m.critChance) { dmg *= m.critMul; crit = true; }
  if (m && fx === 'ramp' && attacker) {
    if (t.rampKey === attacker.id) t.rampDmg = Math.min(m.rampMax, (t.rampDmg || 0) + 0.08);
    else { t.rampKey = attacker.id; t.rampDmg = 0.08; }
    dmg *= (1 + t.rampDmg);
    fxText(t, '狂热 x' + (1 + t.rampDmg).toFixed(2), '#ff8a65', 12);
  }
  return { dmg, crit };
}

// 命中后附加特色状态（减速/燃烧/毒蚀/标记/眩晕/吸血/击退/电磁连锁）
function applyWeaponFx(t, fx, from, dmg) {
  const m = FX_META[fx];
  if (!m || !t || t.dead || t.kind !== 'zombie') return;
  const tx0 = t.x + t.w / 2;
  if (m.slow) { t.slowT = Math.max(t.slowT || 0, m.slowDur); t.slowMul = m.slow; fxText(t, fx === 'frost' ? '急冻!' : '减速!', '#80deea', 13); }
  if (m.dps && (fx === 'burn' || fx === 'frost')) { t.burnT = m.dur; t.burnDps = m.dps; t.doTFx = fx; if (fx === 'burn') fxText(t, '燃烧!', '#ff7043', 13); }
  if (fx === 'poison') { t.poisonT = m.dur; t.poisonDps = m.dps; fxText(t, '中毒!', '#aed581', 13); }
  if (m.markMul) { t.markT = m.markDur; t.markMul = m.markMul; fxText(t, '标记!', '#ce93d8', 13); }
  if (m.knock && from && from.aim != null && !(t.buffs && t.buffs.passive === 'unstop')) { t.vx += Math.cos(from.aim) * m.knock; t.knockT = 0.3; fxText(t, '击退!', '#ffab91', 13); }   // 击退：沿射击方向推开（无畏意志免疫），0.3s 内 AI 不追保证明显位移
  if (m.stunChance && from && Math.random() < m.stunChance) {
    t.stunT = Math.max(t.stunT || 0, m.stunDur);
    fxText(t, '眩晕!', '#fff176', 12);
  }
  if (m.vamp && from && from.kind === 'human') {
    const heal = Math.max(1, Math.round(dmg * m.vamp));
    from.hp = Math.min(from.maxHp, from.hp + heal);
    if (game && game.training) spawnText(from.x + from.w / 2, from.y - 8, '+' + heal, '#81c784', 12);
  }
  if (m.chainChance && from && Math.random() < m.chainChance) {
    fxText(t, '电磁!', '#b388ff', 13);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    let chained = 0;
    for (const o of game.entities) {
      if (o.dead || o === t || o.faction !== 'zombie') continue;
      if (chained >= m.chainN) break;
      if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) > 160) continue;
      damageEntity(o, dmg * m.chainMul, from);
      spawnParticle(o.x + o.w / 2, o.y + o.h / 2, '#b388ff', { type: 'ring', size: 6, life: 0.3, grav: 0 });
      chained++;
    }
  }
}

// 状态每帧推进：燃烧/毒蚀持续伤害（累计取整避免每帧飘字），计时器递减
function updateStatuses(dt) {
  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.stunT > 0) e.stunT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.freezeT > 0) e.freezeT -= dt;
    if (e.markT > 0) e.markT -= dt;
    if (e._scoutT > 0) e._scoutT -= dt;   // 侦察干员标记倒计时
    if (e.kind !== 'zombie') continue;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnAcc = (e.burnAcc || 0) + e.burnDps * dt;
      if (e.burnAcc >= 1) { const d = Math.floor(e.burnAcc); e.burnAcc -= d; damageEntity(e, d, null); }
    }
    if (e.poisonT > 0) {
      e.poisonT -= dt; e.poisonAcc = (e.poisonAcc || 0) + e.poisonDps * dt;
      if (e.poisonAcc >= 1) { const d = Math.floor(e.poisonAcc); e.poisonAcc -= d; damageEntity(e, d, null); }
    }
  }
}

// ---------- 伤害 / 击杀 / 感染 ----------
// 单位 → 语音键：僵尸按类型、英雄专属、其余人类统一
function unitVoiceKey(e) {
  if (e.kind === 'zombie') return 'z_' + e.ztype;
  if (e.hero) return 'hero_' + e.hero;
  return 'human';
}

// hitCtx（可选）：{ key, x, y, dir, method, pellets, solid } —— 只有"确实发生了接触"的命中才传，
// 传了就由 HitArt 出基础受击视觉（类别共享）；没传（燃烧/毒蚀等持续伤害、陷阱、电磁连锁）
// 保留原有通用粒子，两套互斥，绝不叠加。
function damageEntity(t, dmg, from, hitCtx) {
  if (t.dead) return;
  if (t.kind === 'zombie' && t.buffs && t.buffs.passive === 'armor') dmg *= 0.7;   // 护体装甲减伤
  if (t.kind === 'zombie' && t.markT > 0 && t.markMul) dmg *= t.markMul;           // 标记弹增伤
  if (t.kind === 'human' && t.equipFx && t.equipFx.dmgMul != null) dmg *= t.equipFx.dmgMul;   // 人类护甲减伤（人物装备）
  if (t.invuln) {
    if (t._vhp == null) t._vhp = t.maxHp;
    t._vhp = Math.max(0, t._vhp - dmg);   // 读数面板虚拟生命：持续递减反映伤害
  } else {
    t.hp -= dmg;
  }
  spawnText(t.x + t.w / 2, t.y - 8, String(Math.round(dmg)), t.kind === 'zombie' ? '#ffd54f' : '#ff6b6b', t.kind === 'zombie' ? 15 : 13);
  if (hitCtx && typeof HitArt !== 'undefined') {
    // 真实接触命中：迁移到类别级受击视觉（旧通用粒子不再同时播放，避免双倍闪烁）
    HitArt.emit({
      key: hitCtx.key, target: t, x: hitCtx.x != null ? hitCtx.x : t.x + t.w / 2,
      y: hitCtx.y != null ? hitCtx.y : t.y + t.h * 0.5,
      dir: hitCtx.dir != null ? hitCtx.dir : 0,
      method: hitCtx.method || 'bullet', pellets: hitCtx.pellets || 1,
      estimated: !!hitCtx.estimated || hitCtx.x == null,
    });
  } else {
    const col = t.kind === 'zombie' ? '#6dff4b' : '#ff5252';
    for (let i = 0; i < 5; i++)
      spawnParticle(t.x + t.w / 2, t.y + t.h / 2, col, { size: 2.5 });
  }
  AudioFX.unitVoice(unitVoiceKey(t), 'hurt');   // 受击：每类单位独立叫声
  if (from && from.isPlayer && t.kind === 'zombie') game.stats.damage += dmg;
  if (from && from.isPlayer && t !== from) game._lastHitTarget = t;   // 训练营读数面板：记录玩家最后命中的目标
  if (t.hp <= 0 && !t.invuln) {
    const isVS = game && game.vs;
    if (isVS) vsOnDeath(t, from);
    else if (t.kind === 'zombie') killZombie(t, from);
    else infect(t, from);
  }
}

function killZombie(z, killer) {
  z.dead = true;
  if (game) queueZombieDeath(z);   // 幽灵死亡：清空 Buff，冷却后于激活复活点重生
  const col = ZOMBIES[z.ztype].color;
  for (let i = 0; i < 16; i++)
    spawnParticle(z.x + z.w / 2, z.y + z.h / 2, col, { size: 3, life: 0.6 });
  AudioFX.boom();
  AudioFX.unitVoice('z_' + z.ztype, 'death');   // 死亡：该僵尸类型专属嚎叫
  if (killer && killer.isPlayer) game.stats.kills++;
  UI.pushFeed(`${killer && killer.isPlayer ? '你' : (killer ? killer.name : '队友')} 击杀了 ${ZOMBIES[z.ztype].name}`);
  if (isMotherType(z.ztype) && z.ztype !== 'mother_mini') {
    game.motherAlive = false;
    FX.shakeMag = 12;
    UI.pushFeed('<b>大母体被消灭！僵尸陷入狂暴</b>', 'zombie-kill');
    for (const e of game.entities)
      if (e.kind === 'zombie' && !e.dead && !e.isPlayer) e.speed = Math.round(e.speed * 1.2);
  }
  spawnParticle(z.x + z.w / 2, z.y + z.h / 2, '#ffffff', { type: 'ring', size: 10, life: 0.4 });
}

function infect(h, by, ztype) {
  if (h.dead || h.kind !== 'human') return;
  // VS 模式（竞技/攻防）无「感染变僵尸」概念：任何致死一律按死亡处理
  // （竞技延迟重生 / 攻防出局）。覆盖掉崖兜底、残留僵尸近战抓死等所有直接
  // 调 infect 的路径，杜绝竞技玩家死后仍变异成僵尸 —— 模式彻底分离。
  if (game && game.vs) { vsOnDeath(h, by); return; }
  const bigMother = !!ztype;
  const miniMother = !ztype && by && by.kind === 'zombie' && isMotherType(by.ztype);
  const zt = ztype || (miniMother ? 'mother_mini' : 'normal');
  const mother = bigMother;                       // 仅大母体计入 motherAlive / 狂暴
  const wasPlayer = h.isPlayer;
  if (wasPlayer) closeBackpackUI();   // 被抓变幽灵：背包切换功能失效
  clearPickupWeapons(h);   // 被抓变幽灵：地面拾取特殊武器销毁
  // 视觉：感染瞬间终止该实体所有武器动作（不留上一把枪的手势/枪火/弹匣）
  if (typeof ArtEvents !== 'undefined') ArtEvents.cancel(h.id, 'infect');
  // 原地转换为僵尸，保持房间人数恒定（≤30）
  const z = makeZombie(zt, {
    x: h.x, y: h.y + h.h - ZOMBIES[zt].h, isPlayer: wasPlayer,
  });
  z.id = h.id;
  Object.assign(h, z);
  h.dead = false;
  h.ads = false; h.adsT = 0; h.attFx = null; h.attachments = [];   // 变异后配件/开镜失效
  h.equipFx = { dmgMul: 1, jumpMul: 1, speedMul: 1 };              // 变异后人物装备失效
  // 变异后不留在人堆中间（否则新僵尸原地开咬瞬间连锁感染团灭）：移到人类阵线身后追尾
  const pt = behindRespawnPoint();
  if (pt) {
    h.x = Math.max(5, Math.min(level.worldW - 30, pt.x + (Math.random() - 0.5) * 70));
    h.y = pt.y - h.h;
  }
  h.vx = Math.min(0, h.vx);
  if (mother) game.motherAlive = true;
  if (wasPlayer) {
    game.player = h;
    game.infectFlash = 0.6;
    AudioFX.unitVoice('human', 'death');   // 变异前最后一声人类惨叫
    AudioFX.infect();
    UI.pushFeed(mother ? `<b>你变异成了${ZOMBIES[zt].name}！追猎幸存者！</b>`
               : miniMother ? '<b>你被母体抓伤，变异为小母体！</b>'
               : '<b>你被感染了，化为僵尸继续作战！</b>', 'zombie-kill');
    UI.centerMsg(mother ? `你变异成了${ZOMBIES[zt].name}！` : miniMother ? '你被母体抓伤，变异为小母体！' : '你被感染了！点击左键攻击人类', 2.4);
  } else {
    AudioFX.unitVoice('human', 'death');
    AudioFX.infect();
    UI.pushFeed(mother ? `${h.name} 变异为${ZOMBIES[zt].name}！` : miniMother ? `${h.name} 被母体抓伤，变异为小母体！` : `${h.name} 被感染，化为僵尸！`, 'zombie-kill');
  }
  game.stats.infect++;
  spawnParticle(h.x + h.w / 2, h.y + h.h / 2, '#7bff5e', { type: 'ring', size: 8, life: 0.5 });
}

// 开局母体：10 秒倒计时结束后，从全体人类中随机选 n 名变异为（多种）大母体
function selectMothers(n) {
  const humans = game.entities.filter(e => e.kind === 'human' && !e.dead);
  for (let i = humans.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [humans[i], humans[j]] = [humans[j], humans[i]];
  }
  const picks = humans.slice(0, Math.min(n, humans.length));
  picks.forEach((h, i) => infect(h, null, BIG_MOTHERS[i % BIG_MOTHERS.length]));
  if (picks.length) UI.pushFeed(`<b>${picks.length} 名幸存者变异为大母体！追猎开始！</b>`, 'zombie-kill');
  AudioFX.go();
}

// ---------- 僵尸攻击 / 技能 ----------
function zombieMelee(z, dt) {
  z.attackCd = Math.max(0, z.attackCd - dt);
  z.lastAttack = Math.max(0, z.lastAttack - dt);
  if (z.stunT > 0) return;   // 震荡眩晕：无法攻击
  let target = null, best = Infinity;
  for (const h of game.entities) {
    if (h.kind !== 'human' || h.dead) continue;
    const d = Math.hypot(h.x + h.w / 2 - (z.x + z.w / 2), h.y + h.h / 2 - (z.y + z.h / 2));
    if (d < best) { best = d; target = h; }
  }
  if (!target) return;
  z.facing = target.x + target.w / 2 > z.x + z.w / 2 ? 1 : -1;
  const reach = z.w / 2 + target.w / 2 + 8;
  const trigger = z.isPlayer ? Input.mouse.down : (z.isNet ? !!Net.inputFor(z.netId).fire : true);
  if (best <= reach && z.attackCd <= 0 && z.slamPrep <= 0 && trigger) {
    z.attackCd = ZOMBIES[z.ztype].meleeCd * (CFG.ZOMBIE_CD_MUL || 1);
    z.lastAttack = 0.25;
    AudioFX.unitVoice('z_' + z.ztype, 'roar');   // 攻击：该僵尸类型专属嘶吼
    const dmg = zombieDmg(z);
    target.hp -= dmg;
    if (target.isPlayer) { game.hurtFlash = 0.3; FX.shakeMag = 5; }
    spawnText(target.x + target.w / 2, target.y - 8, String(dmg), '#ff6b6b', 13);
    target.vx += z.facing * z.knock;
    AudioFX.unitVoice(unitVoiceKey(target), 'hurt');   // 被击人类/英雄的受击叫声
    if (target.hp <= 0) infect(target, z);
  }
}

function doSlam(z) {
  const zc = ZOMBIES[z.ztype];
  z.slamLaunch = false;
  AudioFX.unitVoice('z_mother', 'roar');   // 母体专属猛击怒吼
  AudioFX.slam();
  FX.shakeMag = 10;
  const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
  spawnParticle(cx, cy, '#ff8a50', { type: 'ring', size: 12, life: 0.45 });
  for (let i = 0; i < 14; i++) spawnParticle(cx, cy, '#ffb74d', { size: 4, life: 0.5 });
  UI.pushFeed(`<b>${zc.name}发动跳跃猛击！</b>`, 'zombie-kill');
  for (const h of game.entities) {
    if (h.kind !== 'human' || h.dead) continue;
    if (Math.hypot(h.x + h.w / 2 - cx, h.y + h.h / 2 - cy) <= zc.slamRadius) {
      h.hp -= zombieDmg(z);
      if (h.isPlayer) { game.hurtFlash = 0.35; }
      if (h.hp <= 0) infect(h, z);
    }
  }
}

// 母体召唤：在人类阵线身后刷出小僵尸（受封锁线 + 人类阵线双约束）
function doSummon(z) {
  const zc = ZOMBIES[z.ztype];
  const n = zc.summonCount || 2;
  const pt = behindRespawnPoint();
  for (let i = 0; i < n; i++) {
    if (game.entities.filter(e => !e.dead).length >= game.roomSize) break;
    const bx = pt ? pt.x : z.x;
    const sx = Math.max(5, Math.min(level.worldW - 30, bx + (Math.random() - 0.5) * 90));
    const gy = Level.groundBelow(sx, level.groundTop, ZOMBIES.normal.w);
    const mz = makeZombie('normal', { x: sx, y: (gy > 0 ? gy : level.groundTop) - ZOMBIES.normal.h, isPlayer: false });
    // 钳制在人类阵线后方（封锁线由 moveEntity 兜底）
    const front = humanFrontX();
    if (front != null && mz.x + mz.w > front) mz.x = Math.max(5, front - mz.w - 4);
    game.entities.push(mz);
  }
  spawnParticle(z.x + z.w / 2, z.y + z.h / 2, '#7bff5e', { type: 'ring', size: 16, life: 0.5 });
  AudioFX.infect();
  UI.pushFeed(`<b>${zc.name} 召唤了 ${n} 只小僵尸！</b>`, 'zombie-kill');
}

// 猩红母皇光环：强化半径内友方僵尸（回血 + 伤害提升），被动常驻
function applyMotherAura(z, dt) {
  const zc = ZOMBIES[z.ztype];
  if (!zc.auraRadius || z.dead) return;
  z.auraT = (z.auraT || 0) + dt;
  for (const e of game.entities) {
    if (e.kind !== 'zombie' || e.dead || e === z) continue;
    if (Math.hypot(e.x + e.w / 2 - (z.x + z.w / 2), e.y + e.h / 2 - (z.y + z.h / 2)) <= zc.auraRadius) {
      if (zc.auraHp) e.hp = Math.min(e.maxHp, e.hp + (zc.auraHp || 60) * dt);
      e._auraDmg = (e._auraDmg || 0) >= 1 ? 1 : Math.min(1, (e._auraDmg || 0) + dt);
      e._auraMul = zc.auraDmg || 1;
    } else {
      e._auraDmg = 0;
    }
  }
}

// 僵尸实际伤害：猩红母皇光环内的友军按 auraDmg 倍率提升；再乘设置里的全局攻击力倍率
function zombieDmg(z) {
  const mul = (z._auraDmg && z._auraMul) ? (1 + z._auraDmg * (z._auraMul - 1)) : 1;
  return Math.round(z.dmg * mul * (CFG.ZOMBIE_DMG_MUL || 1));
}

// ---------- 玩家僵尸手动技能 ----------
function playerZombieSkill(z) {
  const net = z.isNet ? Net.inputFor(z.netId) : null;
  const trigSkill = net ? !!net.skill : (Input.mouse.rDown || Input.pressed('e'));
  const trigFire = net ? !!net.fire : Input.mouse.down;
  const trigBuff = net ? !!(net.buff) : pressedOnce('q');   // Q 释放主动 Buff
  const zc = ZOMBIES[z.ztype];
  if (z.ztype === 'sprinter' && trigSkill && z.skillCd <= 0 && z.onGround) {
    z.dashing = true; z.dashT = ZOMBIES.sprinter.dashDur; z.skillCd = ZOMBIES.sprinter.dashCd;
    AudioFX.unitVoice('z_sprinter', 'roar');   // 疾行鬼冲刺嘶叫
    AudioFX.dash();
    UI.pushFeed('疾行冲刺！', '');
  }
  // 大母体：右键/E = 跳跃猛击（有 slamRadius 的类型）；Q = 召唤小僵尸（有 summonCd 的类型）
  if (isMotherType(z.ztype) && z.ztype !== 'mother_mini') {
    if (zc.slamRadius && trigSkill && z.skillCd <= 0 && z.onGround) {
      z.slamPrep = 0.55; z.skillCd = zc.slamCd;
    }
    if (zc.summonCd && trigBuff && z.spawnT <= 0 && z.onGround) {
      doSummon(z); z.spawnT = zc.summonCd;
    }
  }
  if (z.ztype === 'boomer' && trigFire) {
    let t = null, best = Infinity;
    for (const h of game.entities) {
      if (h.kind !== 'human' || h.dead) continue;
      const d = Math.hypot(h.x + h.w / 2 - (z.x + z.w / 2), h.y + h.h / 2 - (z.y + z.h / 2));
      if (d < best) { best = d; t = h; }
    }
    if (t && best <= ZOMBIES.boomer.boomRadius) explodeBoomer(z);
  }
  if (trigBuff && z.buffs && z.buffs.active && z.buffs.activeCd <= 0 && !(z.ztype === 'mother' || z.ztype === 'mother_titan' || z.ztype === 'mother_queen')) releaseActiveBuff(z);
}

// 玩家/联网僵尸技能状态计时：技能冷却、蓄力、冲刺、召唤、光环
// （玩家主动技能在 playerZombieSkill 触发；联网幽灵召唤冷却到点自动释放；AI 走 aiZombieUpdate）
function updateZombieSkillTimers(z, dt) {
  z.skillCd = Math.max(0, z.skillCd - dt);
  z.slamPrep = Math.max(0, z.slamPrep - dt);
  if (z.dashT > 0) {
    z.dashT -= dt;
    if (z.dashT <= 0) z.dashing = false;
  }
  const zc = ZOMBIES[z.ztype];
  if (zc.summonCd && !z.invuln) {
    z.spawnT = Math.max(0, (z.spawnT || 0) - dt);
    if (z.isNet && z.spawnT <= 0 && z.onGround) {
      doSummon(z); z.spawnT = zc.summonCd;
    }
  }
  if (zc.auraRadius) applyMotherAura(z, dt);
}

// ---------- 玩家人类更新 ----------
function updatePlayerHuman(p, dt) {
  const cx = p.x + p.w / 2, cy = entityFireY(p);
  p.aim = Math.atan2(Input.mouse.wy - cy, Input.mouse.wx - cx) + p.recoilKick + (p.recoilSide || 0);
  // 攻防准备阶段：仅可瞄准；守方玩家按 1 放绊线雷 / 按 2 加固墙，禁武器切换与开火
  if (game.vs && game.vs.mode === 'siege' && game.vs.phase === 'prep') {
    if (p.team === 'DEF') {
      if (pressedOnce('1')) siegePlaceTrap(p);
      if (pressedOnce('2')) siegeReinforceWall(p);
    }
    return;
  }
  // 干员主动技能（攻防行动阶段 F 键）
  if (pressedOnce('f') && game.vs && game.vs.mode === 'siege' && game.vs.phase === 'fight') useSiegeRoleSkill(p);
  // 后坐恢复速率按武器 recoilRecover（机枪/加特林慢回、手枪快回），水平漂移同步回正
  const rr = (WEAPONS[p.weapon] && WEAPONS[p.weapon].recoilRecover) || 2;
  p.recoilKick = Math.max(0, p.recoilKick - dt * rr);
  p.recoilSide = Math.max(0, Math.abs(p.recoilSide) - dt * rr * 0.7) * (p.recoilSide < 0 ? -1 : 1);
  // 右键开镜（ADS）：仅枪械类可开镜；无瞄具时机瞄 1.25x，装瞄具后按 zoom 放大
  const pw = WEAPONS[p.weapon];
  const canAds = !p.hero && pw && !pw.melee && !pw.grenade;
  if (CFG.ADS_MODE === 'toggle') {
    if (canAds && Input.mouse.rDown && !_prevMR) p.ads = !p.ads;   // 点击开镜：右键边沿翻转
    else if (!canAds) p.ads = false;
  } else {
    p.ads = canAds ? Input.mouse.rDown : false;                    // 长按开镜（默认）
  }
  const adsSpeed = (p.attFx && p.attFx.adsSpeedMul) || 1;
  p.adsT = Math.max(0, Math.min(1, p.adsT + (p.ads ? 1 : -1) * dt * (1 / (0.16 * adsSpeed * (CFG.ADS_SPEED_MUL || 1)))));
  // 背包冷却计时（补给点 E 切换 3s；B 键属性 30s）
  p.backpackCd = Math.max(0, p.backpackCd - dt);
  p.attribCd = Math.max(0, p.attribCd - dt);
  if (Input.pressed('r')) startReload(p);
  // 背包选择界面：1-8 切换背包（E 关闭在 interactFor 处理），此时禁用武器切换
  if (game.backpackUI) {
    for (let i = 0; i < BACKPACKS.length; i++)
      if (pressedOnce(String(i + 1))) { trySwitchBackpack(p, i, 'box'); break; }
    return;
  }
  // 投掷物引信：右键拔插销→引信立即计时（可控制空爆/延迟引爆）；仅引信类投掷物生效，拔销后倒计时归零原地触发
  const thrW = WEAPONS[p.weapon];
  if (thrW && thrW.fuse && !p.hero) {
    if (Input.mouse.rDown && !_prevMR && !p.pinPulled && p.count > 0) {
      p.pinPulled = true;
      p.fuseLeft = thrW.fuse;
      AudioFX.pullPin();
      UI.pushFeed('引信已点燃！', '');
    }
    if (p.pinPulled) {
      p.fuseLeft -= dt;
      if (p.fuseLeft <= 0) {
        spawnGrenadeEffect({ x: p.x + p.w / 2, y: p.y + p.h * 0.4,
          effect: thrW.effect, splash: thrW.splash || 100, dmg: thrW.dmg || 0, owner: p });
        p.pinPulled = false; p.fuseLeft = 0;
      }
    }
  }
  // 英雄形态：武器锁定为英雄武器，禁用常规切换与背包
  if (!p.hero) {
    // 武器切换：数字键 1-4 切换背包槽位（边沿检测，避免背包选择后同键落入武器切换），滚轮在当前武器类别内选择具体武器
    for (let i = 0; i < WEAPON_GROUP_ORDER.length; i++)
      if (pressedOnce(String(i + 1))) {
        const gid = WEAPON_GROUP_ORDER[i];
        switchWeapon(p, p.groupSel[gid] || slotDefaultWeapon(gid));
        break;
      }
    let change = Input.mouse.wheel;
    Input.mouse.wheel = 0;
    if (change !== 0) {
      const g = WEAPON_GROUP_OF[p.weapon];
      if (g) {
        const idx = g.keys.indexOf(p.weapon);
        const ni = (idx + (change > 0 ? 1 : -1) + g.keys.length) % g.keys.length;
        switchWeapon(p, g.keys[ni]);
      }
    }
    // 地面拾取武器槽（9 / 0 选择，G 丢弃）
    if (pressedOnce('9')) equipPickup(p, 0);
    else if (pressedOnce('0')) equipPickup(p, 1);
    if (pressedOnce('g')) {
      const idx = p.pickupSlots.findIndex(s => s.weapon != null);
      if (idx >= 0) discardPickup(p, idx);
    }
    // 角色属性：B 键全图切换背包（30s 冷却，切到下一号背包）
    if (pressedOnce('b')) trySwitchBackpack(p, (p.backpackIdx + 1) % BACKPACKS.length, 'attrib');
    // 英雄变身（能量满）
    if (pressedOnce('h') && p.energy >= p.maxEnergy) transformHero(p);
  }
}

// ---------- 撤离 / 胜负 ----------
function updateRound(dt) {
  if (game.training || game.vs || game.walk) return;   // 训练营/VS/灰盒游览：不扣时间、不判胜负
  const humansAlive = game.entities.filter(e => e.kind === 'human' && !e.dead).length;
  const zombiesAlive = game.entities.filter(e => e.kind === 'zombie' && !e.dead).length;

  // 撤离（仅最终关卡可用）
  const ez = (game.stage >= level.stages.length - 1) ? level.escapeZone : null;
  const inZone = ez ? game.entities.filter(e =>
    e.kind === 'human' && !e.dead &&
    e.x + e.w > ez.x && e.x < ez.x + ez.w) : [];
  if (inZone.length > 0) game.escapeProg += dt;
  else game.escapeProg = Math.max(0, game.escapeProg - dt * 2);

  if (game.escapeProg >= CFG.ESCAPE_TIME) return endRound('humans', '人类成功撤离！');
  if (humansAlive <= 0) return endRound('zombies', '人类全军覆没');
  // 幽灵拥有复活机制（复活点冷却重生）：仅当无存活且无待复活幽灵时才判「全灭」
  if (zombiesAlive <= 0 && game.zRespawns.length === 0) return endRound('humans', '僵尸被全部消灭！');

  game.timeLeft -= dt;
  if (game.timeLeft <= 0) return endRound(humansAlive > 0 ? 'humans' : 'zombies', humansAlive > 0 ? '时间到，人类存活！' : '时间到，人类未存活');
}

function endRound(winner, reason) {
  if (game.state === 'over') return;
  game.state = 'over';
  if (typeof ArtEvents !== 'undefined') ArtEvents.cancelAll('round');   // 回合结束：清掉所有残留枪火/弹壳/弹匣
  if (typeof HitArt !== 'undefined') HitArt.reset('round');
  game.winner = winner; game.reason = reason;   // 供联网快照同步
  const s = game.stats;
  const title = winner === 'humans'
    ? (reason === '人类成功撤离！' ? '人类胜利 · 成功撤离' : '人类胜利')
    : '僵尸胜利 · 生化蔓延';
  const stats =
    `本局结果：${reason}\n` +
    `击杀僵尸：${s.kills} 只　　造成伤害：${Math.round(s.damage)}\n` +
    `感染 / 被感染：${s.infect} 人　　存活：${game.entities.filter(e => e.kind === 'human' && !e.dead).length} 人\n` +
    `房间人数：${game.roomSize} / ${CFG.ROOM_CAP}`;
  UI.showOver(title, stats);
  if (Net.active()) document.getElementById('againBtn').classList.add('hidden');
  if (winner === 'humans') AudioFX.win(); else AudioFX.lose();
}

// ============================================================
// 多关卡机制：幽灵复活点 / 踩线触发器 / 传送门 / 机关 / 刷新点 / 拾取武器 / Buff / 英雄变身
// ============================================================

// ---------- 幽灵复活点 ----------
function queueZombieDeath(z) {
  clearBuffs(z);                                  // 死亡（含跳崖）清空 Buff
  const cd = 4 + game.stage * 2;                  // 冷却随关卡推进逐步变长
  game.zRespawns.push({ t: cd, ztype: z.ztype, ent: (z.isPlayer || z.isNet) ? z : null });
  if (z.isPlayer) UI.centerMsg(`你将在 ${Math.ceil(cd)} 秒后重生…`, 2);
}

// 人类阵线最前方 x（存活人类中最靠右的右边缘）
function humanFrontX() {
  let front = -Infinity;
  for (const e of game.entities) {
    if (e.kind !== 'human' || e.dead) continue;
    const r = e.x + e.w;
    if (r > front) front = r;
  }
  return front === -Infinity ? null : front;
}

// 动态身后复活点：生成在人类阵线后方（已走过的区域），僵尸从后追而非堵在前面
function behindRespawnPoint() {
  let backX = 0, found = false;
  for (const e of game.entities) {
    if (e.kind !== 'human' || e.dead) continue;
    const right = e.x + e.w;
    if (!found || right < backX) { backX = right; found = true; }
  }
  if (!found) return null;                       // 无人类存活（即将判负）
  // 从人类阵线身后 420~180 像素范围找可站立地面（保持追尾间距，避免刷在人堆边上），避免掉进坑/虚空
  for (let off = 420; off >= 180; off -= 20) {
    const x = Math.max(5, backX - off);
    const gy = Level.groundBelow(x, level.groundTop, 24);
    if (gy > 0) return { x: x + (Math.random() - 0.5) * 40, y: gy - 40 };
  }
  return { x: Math.max(5, backX - 180), y: level.groundTop - 40 };
}

function updateZRespawns(dt) {
  for (let i = game.zRespawns.length - 1; i >= 0; i--) {
    const r = game.zRespawns[i];
    r.t -= dt;
    if (r.t > 0) continue;
    game.zRespawns.splice(i, 1);
    if (game.entities.filter(e => !e.dead).length >= game.roomSize) continue;   // 房间满不刷
    // 复活点：一律生成在人类阵线身后（追尾），绝不堵在人类前进路线前方
    const pt = behindRespawnPoint();
    if (!pt) continue;
    const rx = Math.max(5, Math.min(level.worldW - 30, pt.x + (Math.random() - 0.5) * 70));
    if (r.ent) {
      const e = r.ent;
      if (!game.entities.includes(e)) continue;
      e.dead = false; e.hp = e.maxHp; e.x = rx; e.y = pt.y - e.h;
      e.vx = 0; e.vy = 0; e.freezeT = 0; e.knockT = 0; e.animT = Math.random() * 10;
      UI.centerMsg('你已重生！', 1.2);
    } else {
      const z = makeZombie(r.ztype, { x: rx, y: pt.y });
      z.y -= z.h;
      game.entities.push(z);
    }
    spawnParticle(pt.x, pt.y - 18, '#b388ff', { type: 'ring', size: 16, life: 0.6 });
    AudioFX.unitVoice('z_' + r.ztype, 'roar');   // 复活：该僵尸类型咆哮
  }
}

// 清理死亡的非玩家 / 非联网实体（防止数组无限膨胀）
function cleanupEntities() {
  for (let i = game.entities.length - 1; i >= 0; i--) {
    const e = game.entities[i];
    if (e.dead && !e.isPlayer && !e.isNet && e.kind === 'zombie') game.entities.splice(i, 1);
  }
}

// ---------- 踩线触发器（任意 1 名人类触碰全局触发，幽灵无法触发） ----------
function updateTriggers(dt) {
  const st = level.stages[game.stage];
  if (!st) return;
  for (const tr of (st.triggers || [])) {
    if (tr._fired) continue;
    for (const e of game.entities) {
      if (e.kind !== 'human' || e.dead) continue;
      // 踩线触发器：只按水平范围判定。原先的垂直碰撞条件会让玩家跳跃越墙时
      // 在空中错过触发器（y+h < tr.y），导致防守/开门事件永远不触发、人类被封锁线卡死
      if (e.x + e.w > tr.x && e.x < tr.x + tr.w) {
        fireTrigger(tr);
        tr._fired = true;
        break;
      }
    }
  }
}

function fireTrigger(tr) {
  const ev = tr.event || {};
  if (ev.respawn != null) {                        // 1. 幽灵复活点前移（小地图标记前移，实际仍从身后追尾）
    const st = level.stages[ev.respawn];
    if (st && st.respawns) game.activeRespawns = st.respawns.map(r => ({ ...r }));
    UI.pushFeed('<b>幽灵复活点前移！注意身后追尾</b>', 'zombie-kill');
    AudioFX.count();
  }
  if (ev.guard != null) startGuard(ev.guard);      // 2. 启动本关防守倒计时
  if (ev.shortcut) openShortcut();                 // 3. 解锁幽灵近路
  if (ev.close) {                                  // 4. 关门
    for (const m of game.mechs[game.stage]) if (m.type === 'door' && !m.broken) m.closed = true;
    UI.pushFeed('大门关闭，阻挡幽灵！', '');
    AudioFX.count();
  }
  if (ev.bridge) {                                 // 4. 断桥
    // 本关移动平台（桥梁）延迟 2.5s 坍塌：先让正在过桥的人类走完，再断开阻断幽灵追击
    for (const m of game.mechs[game.stage]) if ((m.type === 'bridge' || m.type === 'platform') && !m.broken) m._breakAt = 2.5;
    UI.pushFeed('断桥已摧毁，幽灵无法跨越！', '');
    AudioFX.boom();
  }
}

// ---------- 防守倒计时 / 蓝色传送门 / 超时阵亡 ----------
function startGuard(stageIdx) {
  if (game.guardT >= 0) return;
  const st = level.stages[stageIdx];
  if (!st) return;
  game.guardStage = stageIdx;
  game.guardT = st.guardTimer || 45;
  game.guardMax = game.guardT;
  UI.pushFeed(`<b>防守开始！守住 ${st.name} ${Math.ceil(game.guardT)} 秒</b>`, '');
  AudioFX.go();
}

function updateGuard(dt) {
  if (game.guardT < 0) return;
  game.guardT -= dt;
  if (game.guardT > 0) return;
  game.guardT = -1;
  const st = level.stages[game.guardStage];
  if (st) {
    game.advanceOpen = true;                       // 防守完成，前线开启
    game.guardGrace = 18;                          // 超时留在旧区域直接阵亡
    game.guardPortalX = advanceLineX(st);
    UI.pushFeed('<b>防守完成！越过前线前进，未通过的幸存者将被感染</b>', 'zombie-kill');
  }
  openShortcut();                                  // 倒计时到点自动开启幽灵近路
}

function openShortcut() {
  if (game.shortcutOpen) return;
  game.shortcutOpen = true;
  const st = level.stages[game.stage];
  if (st && st.shortcutSpawns) {
    for (const r of st.shortcutSpawns) game.activeRespawns.push({ ...r });   // 近路出口标记为复活区（小地图展示）
  }
  UI.pushFeed('<b>幽灵近路已开启！</b>', 'zombie-kill');
  AudioFX.count();
}

function updateGuardGrace(dt) {
  if (game.guardGrace < 0) return;
  game.guardGrace -= dt;
  if (game.guardGrace > 0) return;
  game.guardGrace = -1;
  const px = game.guardPortalX;
  for (const e of game.entities) {
    if (e.kind !== 'human' || e.dead) continue;
    if (px != null && e.x < px) infect(e, null);
  }
  UI.pushFeed('前线封锁！滞留的幸存者被感染！', 'zombie-kill');
}

// 关卡推进线：某关的出口 x（防守/钥匙开启前人类不可越过）
function advanceLineX(st) {
  return st.portal ? st.portal.x : (st.endX - 30);
}

function updateAdvance() {
  const st = level.stages[game.stage];
  if (!st || !game.advanceOpen) return;
  const lx = advanceLineX(st);
  for (const e of game.entities) {
    if (e.kind !== 'human' || e.dead) continue;
    if (e.x + e.w >= lx) { advanceStage(e); break; }
  }
}

function advanceStage(h) {
  if (game.stage >= level.stages.length - 1) return;
  const oldStage = game.stage;
  game.stage++;
  const st = level.stages[game.stage];
  game.activeRespawns = (st.respawns || []).map(r => ({ ...r }));   // 旧关复活点失效，强制新关复活点
  game.guardT = -1; game.guardGrace = -1; game.guardPortalX = null; game.advanceOpen = false;
  clearPickupWeapons(h);                            // 切换关卡：拾取武器销毁
  h.hp = Math.min(h.maxHp, h.hp + 50);              // 回复 50HP
  const sp = st.spawnHuman || (st.respawns[0]);
  if (sp) {
    let px = sp.x, py = sp.y - h.h;
    // 出生点安全校验：若被地形（台阶/墙）卡住会原地弹回，表现为「传送门卡人」——就近落到可站立平地
    const blocked = () => level.solids.some(s => !s.oneway &&
      px < s.x + s.w && px + h.w > s.x && py < s.y + s.h && py + h.h > s.y);
    if (blocked()) {
      for (let off = 20; off <= 300; off += 20) {
        const g = Level.groundBelow(px + off, py + 80, h.w);
        if (g > 0 && g - h.h >= 0) {
          px += off; py = g - h.h;
          if (!blocked()) break;
        }
      }
    }
    h.x = px; h.y = py; h.vx = 0; h.vy = 0;
  }
  h.hasKey = false;
  // 全队一起前进：前线后方的队友随之传送，避免脱节被围
  const lx = advanceLineX(level.stages[oldStage]);
  for (const e of game.entities) {
    if (e === h || e.dead || e.faction !== 'human') continue;
    if (e.x < lx) {
      if (sp) { e.x = sp.x + (Math.random() - 0.5) * 60; e.y = sp.y - e.h; e.vx = 0; e.vy = 0; }
      e.hasKey = false;
    }
  }
  UI.pushFeed(`<b>进入 ${st.name}</b>`, '');
  UI.showStageBanner(st.name, st.theme);
  spawnParticle(h.x + h.w / 2, h.y + h.h / 2, '#4fc3f7', { type: 'ring', size: 20, life: 0.7 });
  AudioFX.jump();
}

// ---------- 地图机关 ----------
function updateMechs(dt) {
  const ms = game.mechs[game.stage] || [];
  const st = level.stages[game.stage];
  for (const m of ms) {
    if (m._breakAt != null) {                    // 断桥倒计时：到点后平台坍塌（不可再站立/携带）
      m._breakAt -= dt;
      if (m._breakAt <= 0) { m.broken = true; continue; }
    }
    if (m.broken) continue;
    if (m.type === 'door') {
      // 幽灵近战破坏有血量的门
      if (m.closed && m.hp > 0) {
        for (const z of game.entities) {
          if (z.kind !== 'zombie' || z.dead) continue;
          if (z.x + z.w > m.x - 6 && z.x < m.x + m.w + 6 && z.y + z.h > m.y && z.y < m.y + m.h) {
            m._atkT = (m._atkT || 0) - dt;
            if (m._atkT <= 0) {
              m._atkT = 0.8; m.hp -= 25;
              spawnParticle(m.x + m.w / 2, m.y + m.h / 2, '#ff8a50', { size: 3, life: 0.4 });
              if (m.hp <= 0) {
                m.broken = true; m.closed = false;
                UI.pushFeed('大门被幽灵打碎了！', 'zombie-kill');
                AudioFX.boom();
              }
            }
            break;
          }
        }
      }
    } else if (m.type === 'trap') {
      // 伤害陷阱：对幽灵持续灼烧 + 强击退，对人类无伤害（可叠加减速）
      for (const z of game.entities) {
        if (z.kind !== 'zombie' || z.dead) continue;
        if (z.x + z.w > m.x && z.x < m.x + m.w && z.y + z.h > m.y && z.y < m.y + m.h) {
          damageEntity(z, 55 * dt, null);
          z.vx += (z.x + z.w / 2 > m.x + m.w / 2 ? 1 : -1) * 320 * dt;
          z.freezeT = Math.max(z.freezeT, 0.1);
          if (Math.random() < dt * 14) spawnParticle(z.x + z.w / 2, z.y + z.h / 2, '#ff8a50', { size: 2, life: 0.3 });
        }
      }
    } else if (m.type === 'turret') {
      // 自动炮台：锁定射程内最近幽灵，周期性发射子弹（打向幽灵）
      m._t = (m._t || 0) + dt;
      m._cooldown = Math.max(0, (m._cooldown || 0) - dt);
      let zt = null, bd = m.range || 340;
      for (const z of game.entities) {
        if (z.kind !== 'zombie' || z.dead) continue;
        const d = Math.hypot(z.x + z.w / 2 - (m.x + m.w / 2), z.y + z.h / 2 - (m.y + m.h / 2));
        if (d < bd) { bd = d; zt = z; }
      }
      if (zt && m._cooldown <= 0) {
        m._cooldown = m.rate || 1.1;
        const ang = Math.atan2(zt.y + zt.h / 2 - (m.y + m.h / 2), zt.x + zt.w / 2 - (m.x + m.w / 2));
        m._lastAng = ang;
        for (const p of fireBullet({ x: m.x + m.w / 2, y: m.y + m.h / 2, w: 0, h: 0, faction: 'human' }, 'turret_shot', ang)) {
          p.dmg = m.dmg || 22;
          bullets.push(p);
        }
        m._muzzle = 0.12;
        AudioFX.shoot('turret');
      } else if (zt) {
        m._lastAng = Math.atan2(zt.y + zt.h / 2 - (m.y + m.h / 2), zt.x + zt.w / 2 - (m.x + m.w / 2));
      }
      if (m._muzzle != null) m._muzzle -= dt;
    } else if (m.type === 'heal') {
      // 人类治疗站：站在范围内缓慢回血（幽灵无效果）
      for (const h of game.entities) {
        if (h.kind !== 'human' || h.dead) continue;
        if (h.x + h.w > m.x && h.x < m.x + m.w && h.y + h.h > m.y && h.y < m.y + m.h) {
          h.hp = Math.min(h.maxHp, h.hp + (m.hps || 12) * dt);
        }
      }
    } else if (m.type === 'booster') {
      // 加速带：人类通过时获得短暂冲刺加速（沿地面方向）
      for (const h of game.entities) {
        if (h.kind !== 'human' || h.dead) continue;
        if (h.x + h.w > m.x && h.x < m.x + m.w && h.y + h.h > m.y && h.y < m.y + m.h) {
          h.boostT = (m.dur || 1.2);
          h.boostMul = m.mul || 1.6;
        }
      }
    } else if (m.type === 'wind') {
      // 气流风场：无差别吹动双方
      for (const e of game.entities) {
        if (e.dead) continue;
        if (e.x + e.w > m.x && e.x < m.x + m.w && e.y + e.h > m.y && e.y < m.y + m.h) {
          e.vx += (m.dir || 1) * (m.power || 200) * dt;
          e.vy += (m.up || 0) * 400 * dt;
        }
      }
    } else if (m.type === 'beam') {
      // 反弹传送光线：打回关卡起点
      for (const e of game.entities) {
        if (e.dead) continue;
        if (e.x + e.w > m.x && e.x < m.x + m.w && e.y + e.h > m.y && e.y < m.y + m.h) {
          e.x = st.startX + 60; e.y = level.groundTop - e.h - 4; e.vx = 0; e.vy = 0;
          spawnParticle(e.x + e.w / 2, e.y, '#ffe082', { type: 'ring', size: 14, life: 0.5 });
        }
      }
    } else if (m.type === 'platform' || m.type === 'lift') {
      // 移动平台 / 升降台：往返运动并携带站在上面的实体
      const span = m.span || 120, spd = m.speed || 60;
      m._t = (m._t || 0) + dt * spd / 100;
      if (m.type === 'platform') {
        const nx = m.x0 + (Math.sin(m._t * 2) * 0.5 + 0.5) * span;
        const dx = nx - m.x;
        m.x = nx;
        for (const e of game.entities) {
          if (e.dead) continue;
          if (Math.abs(e.y + e.h - (m.y + m.h)) < 6 && e.x + e.w > m.x && e.x < m.x + m.w) e.x += dx;
        }
      } else {
        const ny = m.y0 - (Math.sin(m._t * 2) * 0.5 + 0.5) * span;
        const dy = ny - m.y;
        m.y = ny;
        for (const e of game.entities) {
          if (e.dead) continue;
          if (Math.abs(e.y + e.h - m.y) < 6 && e.x + e.w > m.x && e.x < m.x + m.w) e.y += dy;
        }
      }
    } else if (m.type === 'void') {
      // 猩红女巫虚空门：E 开启临时传送通道，技能结束消失（不是永久复活点）
      if (!m.active) {
        for (const z of game.entities) {
          if (z.kind !== 'zombie' || z.dead) continue;
          const near = Math.abs(z.x + z.w / 2 - (m.x + m.w / 2)) < 80 && Math.abs(z.y + z.h - (m.y + m.h)) < 90;
          if (!near) continue;
          const wantE = z.isPlayer ? pressedOnce('e') : (z.isNet ? !!Net.inputFor(z.netId).skill : false);
          if (z.isPlayer) promptE(m.x + m.w / 2, m.y - 12, '按 E 开启虚空传送门');
          if (wantE) {
            m.active = true; m._t = m.dur || 8;
            UI.pushFeed('<b>猩红女巫虚空门开启！幽灵可瞬移穿越</b>', 'zombie-kill');
            AudioFX.go();
          }
          break;
        }
      }
      if (m.active) {
        m._t -= dt;
        if (m._t <= 0) {
          m.active = false; m.broken = true;
          UI.pushFeed('虚空门技能结束，通道消失', 'zombie-kill');
          break;
        }
        for (const z of game.entities) {
          if (z.kind !== 'zombie' || z.dead) continue;
          if (z.x + z.w > m.x && z.x < m.x + m.w && z.y + z.h > m.y && z.y < m.y + m.h) {
            const to = m.to || { x: m.x + 260, y: level.groundTop - 40 };
            z.x = to.x; z.y = to.y; z.vx = 0; z.vy = 0;
            spawnParticle(z.x + z.w / 2, z.y + z.h / 2, '#ce93d8', { type: 'ring', size: 18, life: 0.6 });
            AudioFX.jump();
          }
        }
      }
    }
  }
}

// ---------- 全局刷新点（物件生成） ----------
function updatePickups(dt) {
  game._hint = null;
  const pk = game.pickups;
  // 触碰拾取：能量胶囊 / 钥匙（人类）；紫色水晶（幽灵）；人类 E 交互（弹药箱 / 武器箱 / 机关）
  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.kind === 'human') {
      for (const b of pk.caps[game.stage]) {
        if (b.taken) continue;
        if (Math.abs(e.x + e.w / 2 - b.x) < 34 && Math.abs(e.y + e.h / 2 - b.y) < 46) {
          b.taken = true;
          gainEnergy(e, 25);
        }
      }
      for (const b of pk.keys[game.stage]) {
        if (b.taken) continue;
        // 钥匙按水平距离判定（跳跃越墙经过钥匙上方时垂直条件会漏拾，导致前进路线永不开启、人类被卡死）
        if (Math.abs(e.x + e.w / 2 - b.x) < 34) {
          b.taken = true;
          e.hasKey = true;
          game.advanceOpen = true;                 // 钥匙开启前进路线（取代传送门）
          UI.pushFeed('获得钥匙！前进路线已开启', '');
          AudioFX.jump();
        }
      }
      interactFor(e);
    } else {
      for (const b of pk.crystals[game.stage]) {
        if (b.taken) continue;
        if (Math.abs(e.x + e.w / 2 - b.x) < 30 && Math.abs(e.y + e.h / 2 - b.y) < 40) {
          b.taken = true;
          grantCrystalBuff(e);
        }
      }
    }
  }
  // 背包选择界面：锚定者离开补给点 / 阵亡 / 变身英雄 / 被抓时自动关闭
  if (game.backpackUI) {
    const a = game.backpackUIAnchor;
    const ok = a && a.kind === 'human' && !a.dead && !a.hero && nearAmmoBox(a);
    if (!ok) closeBackpackUI();
  }
}

// 人类 E 交互：弹药箱 / 地面武器箱 / 机关（本地玩家显示提示）
function interactFor(e) {
  const wantE = e.isPlayer && !e.isNet ? pressedOnce('e') : e._wantE;
  e._wantE = false;
  // 攻防 bomb 目标：安包 / 拆除（E 键驻留交互，行动阶段内）
  const vsG = game.vs;
  if (vsG && vsG.mode === 'siege' && vsG.phase === 'fight' && vsG.obj && vsG.obj.kind === 'bomb') {
    const obj = vsG.obj;
    if (!vsG.defuser && e.team === 'ATK' && inSiegeObj(e, obj)) {
      if (e.isPlayer) promptE(obj.x + obj.w / 2, obj.y - 16, vsG._plant && vsG._plant.kind === 'plant' ? '安装中…' : '按 E 安装炸弹（7s）');
      if (wantE && !vsG._plant) { vsG._plant = { kind: 'plant', ent: e, t: 0, need: 7, sx: e.x, sy: e.y, hp: e.hp }; return; }
    } else if (vsG.defuser && e.team === 'DEF' && nearDefuser(e, vsG.defuser)) {
      if (e.isPlayer) promptE(vsG.defuser.x + vsG.defuser.w / 2, vsG.defuser.y - 16, vsG._plant && vsG._plant.kind === 'defuse' ? '拆除中…' : '按 E 拆除炸弹（5s）');
      if (wantE && !vsG._plant) { vsG._plant = { kind: 'defuse', ent: e, t: 0, need: 5, sx: e.x, sy: e.y, hp: e.hp }; return; }
    }
  }
  const pk = game.pickups;
  for (const b of pk.ammo[game.stage]) {
    if (b.taken) continue;
    if (Math.abs(e.x + e.w / 2 - b.x) < 44 && Math.abs(e.y + e.h - (b.y + 20)) < 64) {
      if (e.isPlayer) promptE(b.x, b.y - 16, game.hasBackpackItem && !e.hero ? '按 E 补满弹药 / 切换背包' : '按 E 补满弹药');
      if (wantE) {
        // 补弹前先快照各武器槽消耗比例，供切背包按比例继承（补弹会拉满，晚快照会丢比例）
        if (game.hasBackpackItem && !e.hero) game.bpRatios = snapshotReserve(e);
        refillAmmo(e);
        // 追击专用背包道具：补给点额外开启背包选择界面（英雄 / 幽灵锁定）
        if (game.hasBackpackItem && !e.hero) {
          if (game.backpackUI) closeBackpackUI();
          else openBackpackUI(e);
        }
      }
      return;
    }
  }
  for (const b of pk.weapons[game.stage]) {
    if (b.taken) continue;
    if (Math.abs(e.x + e.w / 2 - b.x) < 44 && Math.abs(e.y + e.h - (b.y + 20)) < 64) {
      if (e.isPlayer) promptE(b.x, b.y - 16, '按 E 拾取 ' + WEAPONS[b.weapon].name);
      if (wantE) pickupWeaponBox(e, b);
      return;
    }
  }
  const ms = game.mechs[game.stage] || [];
  for (const m of ms) {
    if (m.broken) continue;
    const near = Math.abs(e.x + e.w / 2 - (m.x + m.w / 2)) < 72 && Math.abs(e.y + e.h - (m.y + m.h)) < 84;
    if (!near) continue;
    if (m.type === 'rope' && m.to) {
      if (e.isPlayer) promptE(m.x + m.w / 2, m.y - 12, '按 E 使用滑索');
      if (wantE) { e.x = m.to.x; e.y = m.to.y - e.h; e.vx = 0; e.vy = 0; UI.centerMsg('滑索！', 1); AudioFX.jump(); }
    } else if (m.type === 'bridge') {
      if (e.isPlayer) promptE(m.x + m.w / 2, m.y - 12, '按 E 破坏断桥');
      if (wantE) { m.broken = true; UI.pushFeed('你破坏了断桥，幽灵无法跨越！', ''); AudioFX.boom(); }
    } else if (m.type === 'door') {
      if (e.isPlayer) promptE(m.x + m.w / 2, m.y - 12, m.closed ? '大门已关闭' : '按 E 关门');
      if (wantE && !m.closed) { m.closed = true; UI.pushFeed('大门关闭！', ''); AudioFX.count(); }
    }
    return;
  }
}

function promptE(x, y, text) {
  game._hint = { x, y, text, t: performance.now() };
}

// 弹药补给箱：补满背包武器弹药（不补地面拾取 / 英雄武器）
function refillAmmo(p) {
  for (const k of WEAPON_KEYS) {
    const wk = WEAPONS[k];
    if (wk.pickup || wk.hero) continue;
    const a = p.arsenal[k];
    if (!a) continue;
    if (wk.grenade) { if (a.count != null && a.count < wk.count) a.count = wk.count; }
    else if (!wk.melee && a.mag != null && a.mag < wk.mag) a.mag = wk.mag;
  }
  const cw = WEAPONS[p.weapon];
  if (cw && !cw.pickup && !cw.hero && !cw.melee) {
    if (cw.grenade) p.count = p.arsenal[p.weapon].count != null ? p.arsenal[p.weapon].count : cw.count;
    else p.mag = p.arsenal[p.weapon].mag != null ? p.arsenal[p.weapon].mag : cw.mag;
  }
  // 补给点同时补满当前手持的拾取武器弹药（拾取武器不因弹尽消失，可反复补充）
  if (cw && cw.pickup) {
    const pi = p.pickupSlots.findIndex(s => s.weapon === p.weapon);
    if (pi >= 0) {
      p.pickupSlots[pi].ammo = cw.grenade ? (cw.count || 3) : (cw.mag || 10);
      if (cw.grenade) p.count = cw.count || 3; else p.mag = cw.mag || 10;
    }
  }
  p.reloading = false;
  UI.centerMsg('弹药已补满！', 1);
  AudioFX.reload();
  spawnParticle(p.x + p.w / 2, p.y, '#ffd54f', { type: 'ring', size: 12, life: 0.5 });
}

// ---------- 生化背包（追击专用 E 切换 + 角色属性 B 切换） ----------
function nearAmmoBox(p) {
  for (const b of game.pickups.ammo[game.stage]) {
    if (b.taken) continue;
    if (Math.abs(p.x + p.w / 2 - b.x) < 44 && Math.abs(p.y + p.h - (b.y + 20)) < 64) return true;
  }
  return false;
}

// 快照各武器槽当前备用弹药消耗比例（本局已消耗比例），供切背包按比例继承
function snapshotReserve(p) {
  const snap = {};
  for (const gid of WEAPON_GROUP_ORDER) {
    const cur = p.groupSel[gid];
    const cw = cur ? WEAPONS[cur] : null;
    if (!cur || !cw) { snap[gid] = 1; continue; }
    const a = p.arsenal[cur];
    if (cw.grenade) snap[gid] = (a && a.count != null && cw.count) ? a.count / cw.count : 1;
    else if (cw.melee) snap[gid] = 1;
    else snap[gid] = (a && a.mag != null && cw.mag) ? a.mag / cw.mag : 1;
  }
  return snap;
}

function openBackpackUI(e) {
  if (!game || game.backpackUI) return;
  if (!e || e.dead || e.kind !== 'human' || e.hero) return;
  game.backpackUI = true;
  game.backpackUIAnchor = e;
  UI.showBackpackUI();
  UI.renderBackpackUI();
  UI.centerMsg('按 1-8 选择背包 · E 关闭', 1.6);
}

function closeBackpackUI() {
  if (!game || !game.backpackUI) return;
  game.backpackUI = false;
  game.backpackUIAnchor = null;
  game.bpRatios = null;   // 清空补给点比例快照
  UI.hideBackpackUI();
}

// 核心切换逻辑：mode='box'=补给点 E（3s 冷却，投掷物拉满）；mode='attrib'=B 键属性（30s 冷却，全按比例）
function applyBackpack(p, idx, mode) {
  const bp = BACKPACKS[idx];
  if (!bp) return;
  // 各武器槽当前备用弹药消耗比例（reserve / max），供新背包按比例继承。
  // 补给点 E：用补弹前快照（game.bpRatios）；B 键属性：直接用当前状态实时计算。
  const ratios = (mode === 'box' && game.bpRatios) ? game.bpRatios : snapshotReserve(p);
  const wasPickup = WEAPONS[p.weapon] && WEAPONS[p.weapon].pickup;
  const refSlot = wasPickup
    ? (slotOfWeapon(p._lastCatWeapon) || 'primary')
    : (slotOfWeapon(p.weapon) || 'primary');
  // 应用新背包配置：更新各槽位武器 + 备用弹药（比例继承；E 模式投掷物直接读目标背包配置拉满）
  for (const gid of WEAPON_GROUP_ORDER) {
    const nk = bp.loadout[gid];
    if (!nk) continue;
    const nw = WEAPONS[nk];
    p.groupSel[gid] = nk;
    if (!p.arsenal[nk]) p.arsenal[nk] = {};
    const ratio = Math.max(0, Math.min(1, ratios[gid] != null ? ratios[gid] : 1));
    if (nw.grenade) {
      p.arsenal[nk].count = (mode === 'box') ? nw.count : Math.max(1, Math.round(nw.count * ratio));
    } else if (!nw.melee) {
      p.arsenal[nk].mag = Math.max(1, Math.round(nw.mag * ratio));
    }
  }
  p.backpackIdx = idx;
  // 前置弹夹：当前手持槽位切到目标背包对应武器并直接拉满（拾取武器不受影响，完整保留）
  if (!wasPickup) {
    const nk = bp.loadout[refSlot] || p.weapon;
    const nw = WEAPONS[nk];
    p.weapon = nk;
    if (nw.grenade) p.count = (p.arsenal[nk] && p.arsenal[nk].count != null) ? p.arsenal[nk].count : nw.count;
    else if (nw.melee) p.mag = Infinity;
    else p.mag = nw.mag;   // 前置弹夹直接拉满
    p.reloading = false; p.reloadT = 0; p.fireT = 0; p.windup = 0;
  } else {
    const nk = bp.loadout[refSlot] || p._lastCatWeapon;
    if (WEAPONS[nk]) p._lastCatWeapon = nk;   // 丢弃拾取武器后回退到新背包对应槽位武器
  }
  if (typeof computeHumanAttachments === 'function') computeHumanAttachments(p);
  if (typeof computeHumanEquipFx === 'function') computeHumanEquipFx(p);
  // 换背包后重拉满当前武器弹匣（含扩容弹匣）
  if (!wasPickup && !WEAPONS[p.weapon].grenade && !WEAPONS[p.weapon].melee) p.mag = magCapacityFor(p, WEAPONS[p.weapon]);
  if (game.backpackUI) UI.renderBackpackUI();
}

function trySwitchBackpack(p, idx, mode) {
  if (p.kind !== 'human' || p.dead || !game) return;
  if (p.hero) { UI.centerMsg('英雄形态：背包已锁定', 1.2); return; }
  if (idx === p.backpackIdx) { if (mode === 'box') UI.centerMsg('已在使用该背包', 1); return; }
  if (mode === 'box') {
    if (p.backpackCd > 0) { UI.centerMsg(`背包切换冷却 ${p.backpackCd.toFixed(1)}s`, 1); return; }
    applyBackpack(p, idx, 'box');
    p.backpackCd = CFG.BACKPACK_CD || 3;
    closeBackpackUI();   // 补给点选择成功后自动关闭选择界面
  } else {
    if (p.attribCd > 0) { UI.centerMsg(`B 键属性冷却 ${p.attribCd.toFixed(1)}s`, 1); return; }
    applyBackpack(p, idx, 'attrib');
    p.attribCd = CFG.ATTRIB_CD || 30;
  }
  UI.centerMsg(`已切换背包：${BACKPACKS[idx].name}`, 1.2);
  AudioFX.reload();
  spawnParticle(p.x + p.w / 2, p.y, '#4fc3f7', { type: 'ring', size: 14, life: 0.5 });
}

// ---------- 地面拾取特殊武器（拾取槽 1/2，最多 2 把） ----------
function pickupWeaponBox(p, b) {
  const idx = p.pickupSlots.findIndex(s => s.weapon === null);
  if (idx < 0) { UI.centerMsg('拾取槽已满（最多 2 把），按 G 丢弃', 2); return; }
  const w = WEAPONS[b.weapon];
  b.taken = true;
  p.pickupSlots[idx].weapon = b.weapon;
  // 训练营靶场：拾取即满弹
  p.pickupSlots[idx].ammo = (game.training && game.training.kind === 'range') ? Infinity : (w.grenade ? (w.count || 3) : (w.mag || 10));
  // 拾取后自动装备到当前武器（无需再按 9/0）；手持期间弹药走拾取槽，补给点可补满
  if (!p.hero) equipPickup(p, idx);
  UI.pushFeed(`拾取并装备 ${w.name}！(${idx + 1}) 号槽`, '');
  AudioFX.jump();
  spawnParticle(b.x, b.y, '#ffd740', { type: 'ring', size: 14, life: 0.6 });
}

function equipPickup(p, idx) {
  const s = p.pickupSlots[idx];
  if (!s || !s.weapon || p.hero) return;
  if (!(WEAPONS[p.weapon] && WEAPONS[p.weapon].pickup)) p._lastCatWeapon = p.weapon;
  p.weapon = s.weapon;
  p.mag = s.ammo;
  p.count = WEAPONS[s.weapon].count || 0;
  p.reloading = false; p.reloadT = 0; p.fireT = 0; p.windup = 0;
  UI.centerMsg(`已装备 ${WEAPONS[s.weapon].name}`, 1);
}

function discardPickup(p, idx) {
  const s = p.pickupSlots[idx];
  if (!s || !s.weapon) return;
  const wasEquipped = p.weapon === s.weapon;
  s.weapon = null; s.ammo = 0;
  if (wasEquipped) {
    p.weapon = p._lastCatWeapon || 'm4a1';
    p.mag = (p.arsenal[p.weapon] && p.arsenal[p.weapon].mag != null) ? p.arsenal[p.weapon].mag : WEAPONS[p.weapon].mag;
    p.count = (p.arsenal[p.weapon] && p.arsenal[p.weapon].count != null) ? p.arsenal[p.weapon].count : (WEAPONS[p.weapon].count || 0);
    p.fireT = 0; p.windup = 0;
    UI.centerMsg('已丢弃拾取武器', 1);
  }
}

function updatePickupAuto(p, dt) {
  const w = WEAPONS[p.weapon];
  if (!w || !w.pickup) return;
  const idx = p.pickupSlots.findIndex(s => s.weapon === p.weapon);
  if (idx < 0) return;
  p.pickupSlots[idx].ammo = w.grenade ? p.count : p.mag;
  if ((w.grenade ? p.count : p.mag) <= 0) {
    p.pickupSlots[idx].weapon = null; p.pickupSlots[idx].ammo = 0;
    p.weapon = p._lastCatWeapon || 'm4a1';
    p.mag = (p.arsenal[p.weapon] && p.arsenal[p.weapon].mag != null) ? p.arsenal[p.weapon].mag : WEAPONS[p.weapon].mag;
    p.count = (p.arsenal[p.weapon] && p.arsenal[p.weapon].count != null) ? p.arsenal[p.weapon].count : (WEAPONS[p.weapon].count || 0);
    p.reloading = false; p.fireT = 0; p.windup = 0;
    UI.centerMsg('拾取武器弹药耗尽，已消失！', 1.4);
  }
}

function clearPickupWeapons(p) {
  for (const s of p.pickupSlots) { s.weapon = null; s.ammo = 0; }
  const cw = WEAPONS[p.weapon];
  if (cw && cw.pickup) {
    p.weapon = p._lastCatWeapon || 'm4a1';
    p.mag = (p.arsenal[p.weapon] && p.arsenal[p.weapon].mag != null) ? p.arsenal[p.weapon].mag : WEAPONS[p.weapon].mag;
    p.count = (p.arsenal[p.weapon] && p.arsenal[p.weapon].count != null) ? p.arsenal[p.weapon].count : (WEAPONS[p.weapon].count || 0);
    p.fireT = 0; p.windup = 0;
    // 视觉：变身结束同样终止英雄武器动作
    if (typeof ArtEvents !== 'undefined') { ArtEvents.cancel(p.id, 'hero'); ArtEvents.emit('draw', p, { key: p._prevWeapon }); }
  }
}

// ---------- 英雄变身（能量胶囊攒满触发，独立武器组） ----------
function gainEnergy(p, amt) {
  if (p.hero || p.kind !== 'human') return;
  p.energy = Math.min(p.maxEnergy, p.energy + amt);
  UI.centerMsg(`能量 ${Math.round(p.energy)}/${p.maxEnergy}`, 1);
  if (p.energy >= p.maxEnergy) UI.pushFeed('<b>能量已满！按 H 变身英雄</b>', '');
  AudioFX.reload();
}

function transformHero(p) {
  if (p.hero || p.energy < p.maxEnergy || p.kind !== 'human') return;
  if (game && game.vs) { UI.centerMsg('竞技模式：英雄变身已禁用', 1.2); return; }   // VS 模式禁英雄，保持队伍平衡
  closeBackpackUI();   // 变身英雄：背包系统锁死
  const key = Math.random() < 0.5 ? 'light' : 'xuan';
  const ht = HERO_TYPES[key];
  // 变身瞬间清空拾取武器；若手持拾取武器，还原目标记回变身前的背包武器
  const curIsPickup = WEAPONS[p.weapon] && WEAPONS[p.weapon].pickup;
  if (curIsPickup) {
    p._prevWeapon = p._lastCatWeapon || 'm4a1';
    p._prevMag = p.arsenal[p._prevWeapon] && p.arsenal[p._prevWeapon].mag != null ? p.arsenal[p._prevWeapon].mag : WEAPONS[p._prevWeapon].mag;
  } else {
    p._prevWeapon = p.weapon;
    p._prevMag = p.mag;
  }
  clearPickupWeapons(p);
  p.hero = key; p.heroT = ht.dur;
  p.maxHp = ht.hp; p.hp = ht.hp;
  p.weapon = ht.weapon; p.mag = 999;
  p.energy = 0;
  // 视觉：变身清空旧武器动作，并按英雄武器重新出枪
  if (typeof ArtEvents !== 'undefined') { ArtEvents.cancel(p.id, 'hero'); ArtEvents.emit('draw', p, { key: ht.weapon }); }
  UI.pushFeed(`<b>变身 ${ht.name}！${ht.dur} 秒</b>`, '');
  UI.centerMsg(`变身 ${ht.name}！`, 2);
  AudioFX.unitVoice('hero_' + key, 'roar');   // 英雄专属登场语音
  AudioFX.win();
  spawnParticle(p.x + p.w / 2, p.y + p.h / 2, ht.color, { type: 'ring', size: 24, life: 0.8 });
}

function revertHero(p) {
  if (!p.hero) return;
  p.hero = null; p.heroT = 0;
  p.maxHp = 100; p.hp = Math.min(100, p.hp);
  if (p._prevWeapon) {
    p.weapon = p._prevWeapon;
    p.mag = p._prevMag != null ? p._prevMag : WEAPONS[p._prevWeapon].mag;
    p.fireT = 0; p.windup = 0;
  }
}

function updateHero(p, dt) {
  if (!p.hero) return;
  p.heroT -= dt;
  if (p.heroT <= 0) { revertHero(p); UI.centerMsg('变身结束', 1.2); }
}

// ---------- 幽灵水晶 Buff（1 被动 + 1 主动，Q 释放主动） ----------
function clearBuffs(z) {
  z.buffs = { passive: null, active: null, activeCd: 0 };
  z.termT = 0; z.invisT = 0; z.flyT = 0;
}

function grantCrystalBuff(z) {
  const b = z.buffs;
  let key = null;
  if (!b.passive) {
    key = COMMON_BUFF_KEYS[(Math.random() * COMMON_BUFF_KEYS.length) | 0];
    b.passive = key;
  } else if (!b.active) {
    key = RARE_BUFF_KEYS[(Math.random() * RARE_BUFF_KEYS.length) | 0];
    b.active = key;
  } else {
    key = RARE_BUFF_KEYS[(Math.random() * RARE_BUFF_KEYS.length) | 0];
    b.active = key;
  }
  const bt = BUFF_TYPES[key];
  UI.pushFeed(`幽灵获得 Buff：<b>${bt.name}</b>（${bt.desc}）`, 'zombie-kill');
  spawnParticle(z.x + z.w / 2, z.y, '#b388ff', { type: 'ring', size: 16, life: 0.7 });
  AudioFX.zombieHit();
}

function releaseActiveBuff(z) {
  const b = z.buffs;
  if (!b.active || b.activeCd > 0 || z.dead) return;
  const key = b.active;
  b.active = null;
  b.activeCd = BUFF_TYPES[key].cd || 8;
  if (key === 'term') {
    z.termT = BUFF_TYPES[key].dur || 12;
    z.hp = Math.min(z.maxHp, z.hp + 200);
    UI.pushFeed('<b>幽灵变身终结者！</b>', 'zombie-kill');
    spawnParticle(z.x + z.w / 2, z.y + z.h / 2, '#ff1744', { type: 'ring', size: 22, life: 0.8 });
    AudioFX.dash();
  } else if (key === 'dash') {
    z.flyT = 0.55;
    z.vx = z.facing * 720; z.vy = -150;
    UI.pushFeed('幽灵发动飞身强击！', 'zombie-kill');
    AudioFX.dash();
  } else if (key === 'invis') {
    z.invisT = BUFF_TYPES[key].dur || 6;
    UI.pushFeed('<b>幽灵进入隐身！人类无法锁定</b>', 'zombie-kill');
    spawnParticle(z.x + z.w / 2, z.y + z.h / 2, '#b388ff', { type: 'ring', size: 20, life: 0.7 });
    AudioFX.jump();
  }
}

function updateBuffs(z, dt) {
  const b = z.buffs;
  b.activeCd = Math.max(0, b.activeCd - dt);
  z.termT = Math.max(0, z.termT - dt);
  z.invisT = Math.max(0, z.invisT - dt);
  z.flyT = Math.max(0, z.flyT - dt);
  if (b.passive === 'regen') z.hp = Math.min(z.maxHp, z.hp + 8 * dt);   // 自愈因子
  // 终结者：近身持续伤害
  if (z.termT > 0) {
    z.hp = Math.min(z.maxHp, z.hp + 6 * dt);
    z._termAtkT = (z._termAtkT || 0) - dt;
    for (const h of game.entities) {
      if (h.kind !== 'human' || h.dead) continue;
      if (Math.hypot(h.x + h.w / 2 - (z.x + z.w / 2), h.y + h.h / 2 - (z.y + z.h / 2)) < z.w + 12) {
        if (z._termAtkT <= 0) {
          z._termAtkT = 0.3; h.hp -= 40;
          if (h.isPlayer) { game.hurtFlash = 0.3; FX.shakeMag = 5; }
          spawnText(h.x + h.w / 2, h.y - 8, '40', '#ff5252', 13);
          if (h.hp <= 0) infect(h, z);
        }
      }
    }
  }
  // 飞身强击：撞击伤害
  if (z.flyT > 0) {
    for (const h of game.entities) {
      if (h.kind !== 'human' || h.dead) continue;
      if (Math.hypot(h.x + h.w / 2 - (z.x + z.w / 2), h.y + h.h / 2 - (z.y + z.h / 2)) < z.w + 16) {
        h.hp -= 60;
        h.vx += z.facing * 160;
        if (h.isPlayer) { game.hurtFlash = 0.35; FX.shakeMag = 6; }
        spawnText(h.x + h.w / 2, h.y - 8, '60', '#ff5252', 14);
        if (h.hp <= 0) infect(h, z);
      }
    }
  }
}

// ---------- 主更新 ----------
// 训练营木桩行为：站立原地 / 左移 / 右移 / 原地跳跃。左右移在出生点 ±500px 内往返巡逻，
// 避免木桩走到玩家身边干扰射击；跳跃为持续原地蹦跳（落地即再起跳）。
function dummyBehavior(e) {
  const dm = Training.dummyMode || 'stand';
  if (dm === 'stand') { e.aiMove = 0; e.wantJump = false; return; }
  if (dm === 'jump') { e.aiMove = 0; e.wantJump = true; return; }
  // 首次进入或切换左/右模式时重置巡逻方向，保证点击「左移动」立刻向左
  if (!e.dummyPatrol || e.dummyMode !== dm) {
    const wEnd = level && level.worldW ? level.worldW - e.w - 10 : e.x + 500;
    e.dummyPatrol = { min: Math.max(60, e.x - 500), max: Math.min(e.x + 500, wEnd) };
    e.dummyDir = dm === 'left' ? -1 : 1;
    e.dummyMode = dm;
  }
  const cx = e.x + e.w / 2;
  if (cx <= e.dummyPatrol.min) e.dummyDir = 1;
  if (cx >= e.dummyPatrol.max) e.dummyDir = -1;
  e.aiMove = e.dummyDir;
  e.wantJump = false;
}

// 训练营木桩行为控制栏（仅枪械靶场显示）
function updateTrainingCtl() {
  const ctl = document.getElementById('trainingCtl');
  if (!ctl) return;
  const show = Training.mode && Training.kind === 'range';
  ctl.classList.toggle('hidden', !show);
  if (show) {
    ctl.querySelectorAll('.tctl-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === Training.dummyMode));
  }
}

function update(dt) {
  if (!game) { _prevKeys = { ...Input.keys }; return; }   // 主菜单阶段空转
  if (typeof Settings !== 'undefined' && Settings.paused) { _prevKeys = { ...Input.keys }; return; }   // 局内设置暂停
  if (typeof Debugger !== 'undefined' && Debugger.pauseGame) { _prevKeys = { ...Input.keys }; return; }  // 调试器勾了「开着面板时暂停」
  // 视觉事件时钟：暂停时不推进（暂停后不会继续长出新的火光/弹壳）
  if (typeof ArtEvents !== 'undefined') ArtEvents.step(dt);
  if (typeof HitArt !== 'undefined') { HitArt.step(dt); HitArt.prune(); }
  // 联网客户端：不跑本地物理，改由快照插值驱动
  if (Net.active() && Net.mode === 'client') { _prevKeys = { ...Input.keys }; Net.clientUpdate(dt); return; }
  // 联网主机：每帧广播快照
  if (Net.active() && Net.isHost()) Net.hostUpdate(dt);

  const counting = game.state === 'countdown';
  if (counting) {
    game.countdown -= dt;
    const n = Math.ceil(game.countdown);
    if (n !== game._lastN) {
      game._lastN = n;
      UI.centerMsg(n > 0 ? String(n) : '', n > 0 ? 1 : 0);
      AudioFX.count();
    }
    if (game.countdown <= 0) {
      game.state = 'playing';
      if (!game.vs) selectMothers(3); // 10 秒倒计时结束：随机 3 名人类变异为母体（VS 模式无母体）
      UI.centerMsg(game.vs && game.vs.mode === 'siege' ? '准备阶段开始！' : '战斗开始！', 1.2);
      AudioFX.go();
    }
  }
  if (game.state === 'over') { _prevKeys = { ...Input.keys }; return; }

  Input.update(game.camera);
  game.hurtFlash = Math.max(0, game.hurtFlash - dt);
  game.infectFlash = Math.max(0, game.infectFlash - dt);

  // 实体更新
  const siegePrep = game.vs && game.vs.mode === 'siege' && game.vs.phase === 'prep';
  for (const e of game.entities) {
    if (e.dead) continue;
    e.muzzleT = Math.max(0, e.muzzleT - dt);
    if (e.kind === 'human') {
      if (e.roleCd > 0) e.roleCd = Math.max(0, e.roleCd - dt);
      if (siegePrep) {
        // 准备阶段：全员禁火；攻方/AI 冻结等待（moveEntity 内拦截移动），守方玩家可移动布防
        if (e.isPlayer && !counting) { updatePlayerHuman(e, dt); e.wantJump = false; }
        else { e.ai.move = 0; e.ai.fire = false; e.wantJump = false; }
        moveEntity(e, dt);
        continue;
      }
      if (e.isPlayer) updatePlayerHuman(e, dt);
      else if (e.isNet) Net.applyNetHuman(e);
      else if (e.sandbag) { e.ai.move = 0; e.ai.fire = false; e.wantJump = false; }   // 训练营沙包：站立不动
      else aiHumanUpdate(e, dt, game);
      // 弹道扩散（bloom）回落：未开火时逐渐恢复精准
      const firing = e.isPlayer ? Input.mouse.down : e.ai.fire;
      if (!firing) e.bloom = Math.max(0, (e.bloom || 0) - dt * 3);
      tryFire(e, dt);
      updateReload(e, dt);
      updatePickupAuto(e, dt);
      updateHero(e, dt);
    } else {
      if (e.isPlayer) {
        playerZombieSkill(e);
        updateZombieSkillTimers(e, dt);
      } else if (e.isNet) {
        const inp = Net.inputFor(e.netId);
        e.aiMove = inp.move || 0;
        e.wantJump = !!inp.jump;
        e.netFire = !!inp.fire;
        playerZombieSkill(e);
        updateZombieSkillTimers(e, dt);
      } else if (e.invuln) { dummyBehavior(e); }   // 训练营木桩：按行为（站立/左移/右移/跳跃）驱动
      else aiZombieUpdate(e, dt, game);
      if (e.ztype === 'boomer' && !e.isPlayer && !e.invuln && e.boomNow) { explodeBoomer(e); continue; }
      updateBuffs(e, dt);
    }
    moveEntity(e, dt);
  }

  // 母体跳跃猛击触发（蓄力结束起跳）
  for (const e of game.entities) {
    if (e.dead || e.kind !== 'zombie' || !isMotherType(e.ztype) || e.ztype === 'mother_mini') continue;
    if (e.slamPrep <= 0 && e._prepping) {
      e.slamLaunch = true;
      e.vy = -950;
      let t = e.target;
      if (e.isPlayer) {
        let bd = Infinity;
        for (const h of game.entities)
          if (h.kind === 'human' && !h.dead) {
            const d = Math.hypot(h.x + h.w / 2 - (e.x + e.w / 2), h.y + h.h / 2 - (e.y + e.h / 2));
            if (d < bd) { bd = d; t = h; }
          }
      }
      e.vx = (t && t.x + t.w / 2 > e.x + e.w / 2 ? 1 : -1) * 420;
    }
    e._prepping = e.slamPrep > 0;
  }

  // 近战攻击（含玩家僵尸）
  for (const e of game.entities) {
    if (e.dead || e.kind !== 'zombie') continue;
    if (e.invuln) continue;   // 训练营木桩不攻击
    zombieMelee(e, dt);
  }

  separateEntities();
  updateBullets(dt);
  updateAreas(dt);
  updateStatuses(dt);
  flashFx = Math.max(0, flashFx - dt * 2);

  // ---- 多关卡机制：踩线 / 幽灵复活 / 防守倒计时 / 前进 / 机关 / 刷新点（倒计时阶段不推进） ----
  if (!counting) {
    if (game.vs) {
      if (game.vs.mode === 'siege' && game.state === 'playing') updatePickups(dt);
      updateVs(dt);
      Replay.sample(dt);      // 竞技模式对局中逐帧捕获实体状态供赛后回放
    }
    else {
      updateTriggers(dt);
      updateZRespawns(dt);
      updateGuard(dt);
      updateGuardGrace(dt);
      updateAdvance();
      updateMechs(dt);
      updatePickups(dt);
      cleanupEntities();
    }
  }

  // 粒子 / 飘字
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'shell') {
      p.rot += p.spin * dt;
      const gy = Level.groundBelow(p.x, p.y + p.width, 4);
      if (gy > 0) p._g = gy;
      const gTop = gy > 0 ? gy : p._g;   // 穿越地面后沿用上次探测到的地面，避免跳过落地判定
      if (gTop > 0 && p.y + p.width >= gTop) {
        if (p.bounces > 0 && p.vy > 0) {   // 落地弹跳
          p.y = gTop - p.width;
          p.vy = -p.vy * 0.32;
          p.vx *= 0.6;
          if (--p.bounces <= 0) { p.vy = 0; p.vx *= 0.15; p.spin = 0; p.rot = 0; }
        } else if (p.bounces <= 0) {        // 停稳贴地
          p.y = gTop - p.width; p.vy = 0; p.vx = 0;
        }
      }
    }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.vy *= (1 - dt * 3); t.y += t.vy * dt; t.life -= dt;
    if (t.life <= 0) texts.splice(i, 1);
  }

  // 摄像机跟随玩家
  const p = game.player;
  if (p && !p.dead) {
    const tx = p.x + p.w / 2 - CFG.CW / 2;
    game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 8);
  }
  game.camera.x = Math.max(0, Math.min(level.worldW - CFG.CW, game.camera.x));
  // 疾驰列车的参考系：碰撞世界永远静止在「列车自身坐标系」里，只有 trainX 在推进，
  // 由 ui.js 把它加到渲染相机上（背景与路基飞速后退、车厢与玩家相对静止）。
  // 实体、AI、子弹、相机全都不知道 trainX 存在 —— 这是它能接进共用引擎的前提。
  if (level.train && typeof TrainLevel !== 'undefined') TrainLevel.tick(level, dt, game);
  // 纵向跟随：只有多层地图（别墅）会给出 level.worldH > CFG.WORLD_H，
  // 其余地图算出来的 camYMax 为 0 → camera.y 恒等于 0，行为与从前完全一致。
  const camYMax = Math.max(0, (level.worldH || CFG.WORLD_H) - CFG.CH);
  if (p && !p.dead) {
    const ty = p.y + p.h / 2 - CFG.CH / 2;
    game.camera.y += (Math.max(0, Math.min(camYMax, ty)) - game.camera.y) * Math.min(1, dt * 8);
  }
  game.camera.y = Math.max(0, Math.min(camYMax, game.camera.y || 0));

  if (!counting) updateRound(dt);
  _prevKeys = { ...Input.keys };
  // 鼠标左/右键边沿（投掷蓄力按下/松开、右键拔插销）
  _prevMD = Input.mouse.down;
  _prevMR = Input.mouse.rDown;
}

// ---------- 渲染 ----------
function render() {
  ctx.clearRect(0, 0, CFG.CW, CFG.CH);
  FX.shakeT -= 1 / 60;
  const shaking = FX.shakeMag > 0;
  const shk = CFG.SHAKE_MUL;
  const sx = shaking ? (Math.random() - 0.5) * FX.shakeMag * shk : 0;
  const sy = shaking ? (Math.random() - 0.5) * FX.shakeMag * shk : 0;
  FX.shakeMag = Math.max(0, FX.shakeMag - 0.4);

  if (game) {
    // 赛后回放接管绘制（游戏已结束，ReplayActive 期间播放历史帧替换实时画面）
    if (window.ReplayActive && typeof Replay !== 'undefined' && Replay.isPlaying()) {
      Replay.renderFrame(ctx, sx);
      return;
    }
    UI.drawWorld(ctx, game.camera, sx, sy);
    if (game.state === 'playing' || game.state === 'countdown') UI.drawOverlays(ctx);
    if (flashFx > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, flashFx)})`;
      ctx.fillRect(0, 0, CFG.CW, CFG.CH);
    }
  }
  if (game && game.state !== 'over') {
    UI.drawMinimap();
    UI.updateHUD();
    UI.renderFeed();
  }
}

// ---------- 启动 ----------
// 生化模式调试入口（阶段二~九）：模式选择界面里看不到它，只有 URL 开关能进。
//   ?castleWalk=1  灰盒游览（只验地图能走能绕能追）
//   ?bio=1         完整生化回合（阶段四起）；&bioSize=12 人数；&castleSeed=X 固定地图；&bioDebug=1 叠加通行图
// 正式入口在阶段十验收通过后加进 #modeRadios。
function bioDebugRoute() {
  const q = location.search;
  if (!/[?&](bio|castleWalk|trainWalk)=1/.test(q)) return null;
  const n = parseInt((/[?&]bioSize=(\d+)/.exec(q) || [])[1] || '12', 10);
  // ?trainWalk=1 是火车图的灰盒游览入口：只验「能走能看能追」，不套回合，
  // 出图与截图验收都从这条进，避免被倒计时与刷怪干扰。
  const 图 = /[?&]trainWalk=1/.test(q) ? 'train' : 'castle';
  return { mode: /[?&]bio=1/.test(q) ? 'bio' : 'walk', mapId: 图, size: Math.max(2, Math.min(CFG.ROOM_CAP, n)) };
}
function startGame() {
  const dbg = bioDebugRoute();
  const sizeEl = document.querySelector('input[name="room"]:checked');
  const size = dbg ? dbg.size : parseInt(sizeEl ? sizeEl.value : '8', 10);
  const modeEl = document.querySelector('input[name="mode"]:checked');
  const rawMode = dbg ? dbg.mode : (modeEl && modeEl.value !== 'escape' ? modeEl.value : null);
  // 别墅突袭沿用攻防回合机制，只是换地图：对外仍是 vsMode='siege'
  // 疾驰列车反过来：它借的是**默认逃亡回合**（跑到检查点→守住 N 秒→推进线开锁），
  // 所以只把 mapId 换掉、mode 归回 null（null 就是逃亡），不要把它塞进任何 vs 模式。
  const mode = rawMode === 'villa' ? 'siege' : (rawMode === 'train' ? null : rawMode);
  const mapId = dbg ? dbg.mapId
    : (rawMode === 'villa' ? 'villa' : (rawMode === 'train' ? 'train' : null));
  UI.hideMenu();
  UI.hideOver();
  UI.showHUD();
  AudioFX.unlock();
  setupRoom(size, mode, mapId);
  game._lastN = -1;
  UI.centerMsg(mode === 'arena' ? '竞技模式 · 战火英雄式红蓝对枪'
    : (mapId === 'villa' ? '别墅突袭 · 四层室内攻防（包点不在一层）'
      : (mode === 'walk' ? '阴森古堡 · 探索'
        : (mode === 'bio' ? '生化模式 · 阴森古堡（调试入口）'
          : (mode === 'siege' ? '战术攻防 · 彩虹六号式攻守回合' : '准备…')))), 1);
  UI.pushFeed(mode
    ? `<b>${mode === 'walk' ? '古堡探索' : (mode === 'arena' ? '⚔ 竞技模式' : (mapId === 'villa' ? '⌂ 别墅突袭' : '⌖ 战术攻防'))} · ${mode === 'walk' ? '自由探索' : size + ' 人'}</b>${level.villaSeed ? ` · 地图 seed ${level.villaSeed}` : ''}`
    : `房间已创建：${size} 人`, '');
}

// ---------- 启动（联网主机） ----------
function startMPHost() {
  const size = parseInt(document.querySelector('input[name="mpSize"]:checked').value, 10);
  UI.hideMenu();
  UI.hideOver();
  UI.showHUD();
  AudioFX.unlock();
  setupRoom(size);
  if (Net.active()) Net.hostSyncExisting();   // 开局前已加入的玩家补建实体
  game.countdown = 10;         // 联网给其他玩家留加入时间（与单人一致，结束后随机母体）
  game._lastN = -1;
  UI.centerMsg('准备…', 1);
  UI.pushFeed(`房间「${Net.room}」开始！${size} 人`, '');
}

const fps = { last: 0, frames: 0, time: 0 };

function frame(now) {
  const dt = Math.min(0.033, (now - (fps.last || now)) / 1000);
  fps.last = now;
  if (typeof PauseMenu !== 'undefined' && PauseMenu.active()) { requestAnimationFrame(frame); return; }
  update(dt);
  render();
  requestAnimationFrame(frame);
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('againBtn').addEventListener('click', startGame);

// 训练营「开始训练」：读取场景、僵尸类型与测试武器
if (document.getElementById('trainingStartBtn')) {
  document.getElementById('trainingStartBtn').addEventListener('click', () => {
    const kindEl = document.querySelector('input[name="training"]:checked');
    const ztEl = document.querySelector('input[name="trainingZtype"]:checked');
    const wSel = document.getElementById('trainingWeapon');
    startTraining(kindEl ? kindEl.value : 'range', ztEl ? ztEl.value : 'normal', wSel ? wSel.value : 'm4a1');
  });
}

// 训练营木桩行为控制栏：点击切换站立/左移/右移/跳跃
if (document.getElementById('trainingCtl')) {
  document.getElementById('trainingCtl').addEventListener('click', e => {
    const btn = e.target.closest('.tctl-btn');
    if (!btn) return;
    Training.dummyMode = btn.dataset.mode;
    updateTrainingCtl();
  });
}

Input.attach();
requestAnimationFrame(frame);

// 生化模式调试入口：URL 带 ?castleWalk=1 / ?bio=1 时自动开局（等 index.html 内联脚本把菜单接好）
if (bioDebugRoute()) {
  const castleReady = window.CastleArtDataReady || Promise.resolve();
  castleReady.then(() => requestAnimationFrame(() => startGame())).catch(() => {
    // boot.js displays the actual load failure; keep the menu available.
  });
}

// 启动时直接构建关卡用于背景（主菜单下的空世界）
level = Level.build();
game = null;
