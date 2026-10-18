// ============ 联网多人客户端（主持人权威同步） ============
// 主机：运行完整本地模拟 + 广播快照；客户端：发送输入 + 接收快照插值渲染。
const Net = (() => {
  let ws = null;
  let mode = null;            // 'host' | 'client' | null
  let roomName = '';
  let myId = null;
  let myName = '';
  let myOperatorSkin = 'vanguard';
  let size = 8;
  let customMap = null;
  let seq = 0;
  let inputAcc = 0, snapAcc = 0;

  const players = new Map();        // id -> { name, operatorSkin }
  const latestInput = new Map();    // id -> 最近输入（主机用）
  let prevSnap = null, curSnap = null, snapT0 = 0;
  const renderEnts = [];
  const renderMap = new Map();      // id -> 渲染实体

  function active() { return mode !== null && ws && ws.readyState === 1; }
  function isHost() { return mode === 'host'; }
  function inputFor(id) { return latestInput.get(id) || {}; }

  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  const OPERATOR_SKINS = ['vanguard', 'bulwark', 'shade', 'medic', 'hazmat'];
  function operatorSkinOrDefault(skin) {
    return OPERATOR_SKINS.includes(skin) ? skin : 'vanguard';
  }

  function defaultUrl() {
    if (location.protocol.startsWith('http'))
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return 'ws://localhost:8123';
  }

  // ---------- 连接 ----------
  function connect(opts) {
    mode = opts.role; roomName = opts.room; myName = opts.name; size = opts.size || 8;
    myOperatorSkin = operatorSkinOrDefault(opts.operatorSkin);
    customMap = opts.custom || null;
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(opts.url || defaultUrl()); } catch (e) { reject(e); return; }
      _setWs(ws);
      ws.onopen = () => {
        send(mode === 'host'
          ? { t: 'createRoom', room: roomName, name: myName, size, custom: customMap, operatorSkin: myOperatorSkin }
          : { t: 'joinRoom', room: roomName, name: myName, operatorSkin: myOperatorSkin });
      };
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'room') { myId = m.id; size = m.size || size; onRoom(m); resolve(m); }
        else if (m.t === 'err') { reject(new Error(m.msg)); }
        else if (m.t === 'playerJoin') {
          const operatorSkin = operatorSkinOrDefault(m.operatorSkin);
          players.set(m.id, { name: m.name, operatorSkin });
          if (isHost()) hostAddPlayer(m.id, m.name, operatorSkin);
          if (UI) UI.pushFeed(`${m.name} 加入了房间`, '');
          if (Net.onPlayers) Net.onPlayers();
        } else if (m.t === 'playerLeave') {
          players.delete(m.id);
          if (isHost()) hostRemovePlayer(m.id);
          if (UI) UI.pushFeed('有玩家离开了房间', '');
          if (Net.onPlayers) Net.onPlayers();
        } else if (m.t === 'remoteInput') {
          if (isHost()) latestInput.set(m.id, {
            move: m.move, jump: m.jump, fire: m.fire, skill: m.skill,
            reload: m.reload, aim: m.aim, weaponIdx: m.weaponIdx, buff: m.buff,
          });
        } else if (m.t === 'snap') { if (!isHost()) applySnap(m); }
        else if (m.t === 'roomClosed') { if (UI) UI.centerMsg('房主已离开，房间关闭', 3); disconnect(); }
      };
      ws.onclose = () => { mode = null; if (Net.onDisconnect) Net.onDisconnect(); };
      ws.onerror = () => { if (mode) reject(new Error('无法连接服务器')); };
    });
  }

  function _setWs(w) { ws = w; }

  function disconnect() {
    if (ws) { try { ws.close(); } catch (e) {} }
    ws = null; mode = null; players.clear(); latestInput.clear();
    prevSnap = curSnap = null; renderEnts.length = 0; renderMap.clear();
    game = null; level = Level.build();
    if (UI) { UI.showMenu(); document.getElementById('hud').classList.add('hidden'); UI.hideOver(); }
  }

  // ---------- 房间就绪（客户端） ----------
  function onRoom(m) {
    players.clear();
    for (const p of (m.players || [])) players.set(p.id, { name: p.name, operatorSkin: operatorSkinOrDefault(p.operatorSkin) });
    if (!isHost()) {
      level = Level.load(m.map || null);
      game = {
        state: 'waiting', timeLeft: CFG.ROUND_TIME, countdown: 5, escapeProg: 0,
        camera: { x: 0, y: 0 }, entities: renderEnts, player: null, roomSize: size,
        stats: { kills: 0, damage: 0, infect: 0, survivors: 0 },
        motherAlive: true, hurtFlash: 0, infectFlash: 0, _lastN: -1,
        stage: 0, guardT: -1, guardMax: 0, guardGrace: -1,
        activeRespawns: [], respawnT: 0, respawnCd: 4,
        shortcutOpen: false, escapeActive: false,
        portals: [], mechs: [],
        pickups: { ammo: [], weapons: [], caps: [], keys: [], crystals: [] },
        keyTaken: false, zRespawns: [], guardStage: 0, guardPortalX: null, _hint: null,
      };
      if (typeof initStageRuntime === 'function') initStageRuntime(game);
      if (UI) { UI.hideMenu(); UI.showHUD(); }
    }
    if (Net.onPlayers) Net.onPlayers();
  }

  // ---------- 主机：远端玩家实体 ----------
  function hostAddPlayer(id, name, operatorSkin) {
    if (!game || !level) return;
    const humans = game.entities.filter(e => e.kind === 'human' && !e.dead).length;
    const h = makeHuman({
      x: level.spawnHuman.x + (humans % 5) * 46,
      y: level.spawnHuman.y, isPlayer: false,
      weapon: GUN_KEYS[Math.floor(Math.random() * GUN_KEYS.length)],
      name: name || '玩家',
    });
    h.operatorSkin = operatorSkinOrDefault(operatorSkin);
    h.y -= h.h;
    h.netId = id; h.isNet = true;
    game.entities.push(h);
    if (UI) UI.pushFeed(`${name} 加入了战斗`, '');
  }
  function hostRemovePlayer(id) {
    const e = game.entities.find(x => x.netId === id);
    if (e) e.dead = true;
  }
  // 房主开局时，为开局前已加入的玩家补建实体
  function hostSyncExisting() {
    if (!game || !level) return;
    for (const [id, p] of players) if (id !== myId) hostAddPlayer(id, p.name, p.operatorSkin);
  }

  // ---------- 主机：广播快照（~15Hz） ----------
  function hostUpdate(dt) {
    if (!game) return;
    snapAcc += dt;
    if (snapAcc < 0.066) return;
    snapAcc = 0;
    const ents = game.entities.filter(e => !e.dead && (e.isPlayer || e.netId));
    const curPt = game.portals && game.portals[game.stage];
    const snap = {
      t: 'snap', s: game.state, timeLeft: game.timeLeft, countdown: game.countdown,
      escapeProg: game.escapeProg, winner: game.winner, reason: game.reason,
      stage: {
        idx: game.stage, guardT: game.guardT, guardMax: game.guardMax,
        guardGrace: game.guardGrace, shortcutOpen: game.shortcutOpen,
        respawns: (game.activeRespawns || []).map(r => ({ x: r.x, y: r.y })),
        portal: curPt ? { opened: !!curPt.opened } : null,
        mechs: (game.mechs[game.stage] || []).map(m => ({ type: m.type, closed: !!m.closed, broken: !!m.broken, active: !!m.active })),
        pickups: {
          ammo: (game.pickups.ammo[game.stage] || []).map(b => !!b.taken),
          weapons: (game.pickups.weapons[game.stage] || []).map(b => !!b.taken),
          caps: (game.pickups.caps[game.stage] || []).map(b => !!b.taken),
          keys: (game.pickups.keys[game.stage] || []).map(b => !!b.taken),
          crystals: (game.pickups.crystals[game.stage] || []).map(b => !!b.taken),
        },
      },
      players: ents.map(e => ({
        id: e.netId || myId, kind: e.kind, faction: e.faction, ztype: e.ztype, weapon: e.weapon,
        operatorSkin: e.kind === 'human' ? operatorSkinOrDefault(e.operatorSkin) : undefined,
        x: e.x, y: e.y, vx: e.vx, vy: e.vy, aim: e.aim, facing: e.facing, name: e.name,
        hp: e.hp, maxHp: e.maxHp, animT: e.animT,
        firing: e.muzzleT > 0, atk: e.lastAttack > 0.12, dashing: !!e.dashing, slamPrep: e.slamPrep || 0,
        mag: e.mag, count: e.count || 0, reloading: e.reloading, reloadT: e.reloadT, skillCd: e.skillCd || 0,
        energy: e.energy || 0, maxEnergy: e.maxEnergy || 100, hero: e.hero || null, heroT: e.heroT || 0,
        pickupSlots: e.pickupSlots || null, hasKey: !!e.hasKey,
        buffs: e.buffs || null, termT: e.termT || 0, invisT: e.invisT || 0, flyT: e.flyT || 0,
      })),
      bullets: bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        key: b.grenade ? b.key : undefined })),
      areas: areas.map(a => ({ type: a.type, x: a.x, y: a.y, r: a.r, life: a.life, maxLife: a.maxLife })),
      flashFx: flashFx,
    };
    send(snap);
  }

  // ---------- 客户端：渲染实体 ----------
  function applySnap(snap) { prevSnap = curSnap; curSnap = snap; snapT0 = performance.now(); }

  function getRenderEnt(sp) {
    let e = renderMap.get(sp.id);
    if (!e) { e = { id: sp.id, netEnt: true }; renderMap.set(sp.id, e); renderEnts.push(e); }
    return e;
  }
  function applyFields(e, sp) {
    e.kind = sp.kind; e.faction = sp.faction; e.ztype = sp.ztype; e.weapon = sp.weapon;
    e.operatorSkin = e.kind === 'human' ? operatorSkinOrDefault(sp.operatorSkin) : null;
    if (e.kind === 'human') { e.w = 22; e.h = 36; }
    else { const z = ZOMBIES[sp.ztype] || ZOMBIES.normal; e.w = z.w; e.h = z.h; }
    e.name = sp.name; e.isPlayer = sp.id === myId;
    e.vx = sp.vx; e.vy = sp.vy; e.aim = sp.aim; e.facing = sp.facing;
    e.hp = sp.hp; e.maxHp = sp.maxHp; e.animT = sp.animT;
    e.muzzleT = sp.firing ? 0.05 : 0; e.lastAttack = sp.atk ? 0.25 : 0;
    e.dashing = sp.dashing; e.slamPrep = sp.slamPrep;
    e.mag = sp.mag; e.count = sp.count || 0; e.reloading = sp.reloading; e.reloadT = sp.reloadT; e.skillCd = sp.skillCd;
    e.energy = sp.energy || 0; e.maxEnergy = sp.maxEnergy || 100; e.hero = sp.hero || null; e.heroT = sp.heroT || 0;
    e.pickupSlots = sp.pickupSlots || e.pickupSlots || [{ weapon: null, ammo: 0 }, { weapon: null, ammo: 0 }];
    e.hasKey = !!sp.hasKey;
    e.buffs = sp.buffs || e.buffs || { passive: null, active: null, activeCd: 0 };
    e.termT = sp.termT || 0; e.invisT = sp.invisT || 0; e.flyT = sp.flyT || 0;
  }

  // ---------- 客户端：每帧推进 ----------
  function clientUpdate(dt) {
    if (!game) return;
    Input.update(game.camera);

    if (curSnap) {
      const frac = Math.min(1, (performance.now() - snapT0) / 66);
      const prev = prevSnap;
      for (const sp of curSnap.players) {
        const e = getRenderEnt(sp);
        if (prev) {
          const pp = prev.players.find(p => p.id === sp.id);
          if (pp) { e.x = pp.x + (sp.x - pp.x) * frac; e.y = pp.y + (sp.y - pp.y) * frac; }
        } else { e.x = sp.x; e.y = sp.y; }
        applyFields(e, sp);
      }
      for (const [id, e] of renderMap)
        if (!curSnap.players.find(p => p.id === id)) {
          renderMap.delete(id);
          const i = renderEnts.indexOf(e); if (i >= 0) renderEnts.splice(i, 1);
        }
      bullets.length = 0;
      for (const b of curSnap.bullets) bullets.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        key: b.key, grenade: !!(b.key && WEAPONS[b.key] && WEAPONS[b.key].grenade) });

      if (game.state !== 'over' && curSnap.s === 'over') showOverClient();
      game.state = curSnap.s; game.timeLeft = curSnap.timeLeft;
      game.countdown = curSnap.countdown; game.escapeProg = curSnap.escapeProg || 0;
      game.player = renderMap.get(myId) || null;
      if (curSnap.stage) {
        const stg = curSnap.stage;
        game.stage = stg.idx; game.guardT = stg.guardT; game.guardMax = stg.guardMax;
        game.guardGrace = stg.guardGrace; game.shortcutOpen = stg.shortcutOpen;
        game.activeRespawns = stg.respawns || [];
        const pt = game.portals && game.portals[game.stage];
        if (pt && stg.portal) pt.opened = !!stg.portal.opened;
        const ms = game.mechs[game.stage] || [];
        (stg.mechs || []).forEach((m, i) => {
          if (ms[i]) { ms[i].closed = !!m.closed; ms[i].broken = !!m.broken; ms[i].active = !!m.active; }
        });
        if (stg.pickups) {
          const applyTaken = (arr, flags) => (arr || []).forEach((b, i) => { if (b) b.taken = !!flags[i]; });
          applyTaken(game.pickups.ammo[game.stage], stg.pickups.ammo);
          applyTaken(game.pickups.weapons[game.stage], stg.pickups.weapons);
          applyTaken(game.pickups.caps[game.stage], stg.pickups.caps);
          applyTaken(game.pickups.keys[game.stage], stg.pickups.keys);
          applyTaken(game.pickups.crystals[game.stage], stg.pickups.crystals);
        }
      }
      areas.length = 0;
      for (const a of (curSnap.areas || [])) areas.push({ ...a, owner: { faction: 'human' } });
      flashFx = curSnap.flashFx || 0;
    }

    // 摄像机跟随自己
    const p = game.player;
    if (p) {
      const tx = p.x + p.w / 2 - CFG.CW / 2;
      game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 8);
    }
    game.camera.x = Math.max(0, Math.min(level.worldW - CFG.CW, game.camera.x));
    game.camera.y = 0;

    // 倒计时提示
    if (game.state === 'countdown') {
      const n = Math.ceil(game.countdown);
      if (n !== game._lastN) { game._lastN = n; UI.centerMsg(n > 0 ? String(n) : '', n > 0 ? 1 : 0); }
    } else if (game._lastN !== 0) { game._lastN = 0; }

    sendInput(dt);
  }

  function showOverClient() {
    if (!UI) return;
    document.getElementById('againBtn').classList.add('hidden');
    const w = curSnap.winner === 'humans';
    UI.showOver(w ? '人类胜利' : '僵尸胜利',
      `本局结果：${curSnap.reason || ''}\n房间：${roomName} · ${size} 人`);
    if (w) AudioFX.win(); else AudioFX.lose();
  }

  // ---------- 客户端：发送输入（~20Hz） ----------
  function sendInput(dt) {
    inputAcc += dt;
    if (inputAcc < 0.05) return;
    inputAcc = 0;
    const p = renderMap.get(myId);
    if (!p || !game) return;
    const L = Input.any('a', 'arrowleft'), R = Input.any('d', 'arrowright');
    const move = (R ? 1 : 0) - (L ? 1 : 0);
    let wi = WEAPON_KEYS.indexOf(p.weapon);
    if (wi < 0) wi = 0;
    // 数字键 1-4：切到槽位武器（客户端不知道主机背包配置，发槽位默认武器）
    for (let i = 0; i < WEAPON_GROUP_ORDER.length; i++)
      if (Input.pressed(String(i + 1))) {
        const d = slotDefaultWeapon(WEAPON_GROUP_ORDER[i]);
        if (d) wi = WEAPON_KEYS.indexOf(d);
        break;
      }
    // 滚轮：在当前类别内滚动
    const curG = WEAPON_GROUP_OF[p.weapon];
    let change = Input.mouse.wheel;
    Input.mouse.wheel = 0;
    if (change !== 0 && curG) {
      const idx = curG.keys.indexOf(p.weapon);
      const ni = (idx + (change > 0 ? 1 : -1) + curG.keys.length) % curG.keys.length;
      wi = WEAPON_KEYS.indexOf(curG.keys[ni]);
    }

    let aim = 0;
    if (p.kind === 'human') {
      const cx = p.x + p.w / 2, cy = entityFireY(p);
      aim = Math.atan2(Input.mouse.wy - cy, Input.mouse.wx - cx);
    }
    const fired = Input.mouse.down;
    if (fired && p.kind === 'human') p.muzzleT = 0.05;
    let buff = false;
    if (typeof pressedOnce === 'function' && p.kind === 'zombie' && pressedOnce('q')) buff = true;
    send({ t: 'input', seq: seq++, move, jump: Input.jumpBuffered(), fire: fired,
           skill: Input.mouse.rDown || Input.pressed('e'), reload: Input.pressed('r'),
           aim, weaponIdx: wi, buff });
    if (Input.pressed('r') && p.kind === 'human' && !p.reloading) {
      p.reloading = true; p.reloadT = WEAPONS[p.weapon].reload;
    }
  }

  // ---------- 主机：应用远端人类输入 ----------
  function applyNetHuman(e) {
    const inp = latestInput.get(e.netId);
    if (!inp) return;
    e.ai.move = inp.move || 0;
    e.ai.wantJump = !!inp.jump;
    e.wantJump = !!inp.jump;
    e.ai.fire = !!inp.fire;
    if (inp.aim != null) { e.ai.aim = inp.aim; e.aim = inp.aim; }
    if (inp.weaponIdx != null) {
      const wi = ((inp.weaponIdx % WEAPON_KEYS.length) + WEAPON_KEYS.length) % WEAPON_KEYS.length;
      if (WEAPON_KEYS[wi] !== e.weapon) switchWeapon(e, WEAPON_KEYS[wi]);
    }
    if (inp.reload && !e.reloading) startReload(e);
  }

  return {
    active, isHost, inputFor, connect, disconnect,
    hostUpdate, clientUpdate, applyNetHuman, hostSyncExisting,
    get mode() { return mode; },
    get room() { return roomName; },
    get myId() { return myId; },
    get players() { return players; },
    get started() { return mode !== null; },
    onPlayers: null, onDisconnect: null,
  };
})();
