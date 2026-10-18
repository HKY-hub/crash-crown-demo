// ============ 疾驰列车 · 可玩验证场景（阶段二：移动参考系 + 操作 + 追兵 + 计时） ============
// 参考系约定（与 js/train-gen.js 头部一致）：
//   碰撞世界是「列车自身坐标系」，永远静止；S.trainX 只推进镜头与世界采样。
//   所以「站地板随车走 / 恒速起跳落回原地 / 落地不瞬移」是结构性成立的。
//   车窗是车体面板上的洞，世界在洞后面按 1:1 画 —— 每扇窗看到自己那个世界位置的景，
//   不需要「给每扇窗算一次视差」这种代码，也就不可能算错。
// 物理与追兵策略都直接调 TrainGen.mover / routeStep，与无头闸门同一份代码。
const TrainPlay = (() => {
  const G = TrainGen;
  const CW = 960, CH = 540, ZOOM = 2, VW = CW / ZOOM, VH = CH / ZOOM;
  const INERTIA = 3.5;                     // 惯性放大系数：真实列车 0.5m/s² 在 0.7s 滞空里只挪 6px，读不出来
  const A_MAX = 22;                        // 列车加速度上限 px/s²（≈1.1m/s²），也是伪力的上限
  const DEF = { minutes: 10, ruin: 0.6, speedKmh: 210, chase: 3, tod: 'dusk',
    dbg: { solids: false, route: true, chase: false, win: false } };

  let M = null, S = null, cvs = null, ctx = null, raf = 0, lastNow = 0;
  const keys = Object.create(null);
  const kmh2px = v => v * 1000 / 3600 * 20;
  // 撤离两段的时长（秒）。EVAC_T 是用户明确指定的「防守 20S」，不是可调的验收口径。
  const EVAC_T = 20, BLAST_T = 3;

  function entity(x, y, speed) {
    return { x, y, vx: 0, vy: 0, w: G.MOVE.w, h: G.MOVE.h, onGround: false, onLadder: false,
      speed, bumped: null, drift: 0, face: 1 };
  }
  function msg(s, col) { S.log.unshift({ s, t: S.time, col: col || '#cfe0f2' }); if (S.log.length > 6) S.log.pop(); }

  // ---------- 生成与重置 ----------
  function reset(seed, p) {
    const opt = Object.assign({}, DEF, p || {});
    const plan = G.planForMinutes(opt.minutes);
    M = G.build(seed, { cars: opt.cars || plan.cars, change: opt.change === undefined ? plan.change : opt.change,
      ruin: opt.ruin, speedKmh: opt.speedKmh });
    S = { seed: String(seed), opt, shake: 0, trainX: 0, trainV: kmh2px(opt.speedKmh), targetV: kmh2px(opt.speedKmh),
      trainA: 0, time: 0, alive: true, won: false, finishT: 0, deaths: 0, kills: 0, doorT: 0, fireCd: 0,
      player: { e: entity(M.spawn.x, M.spawn.y - G.MOVE.h - 1, G.MOVE.speed), hp: 100 },
      opened: new Set(), chasers: [], shots: [], log: [], cpIdx: -1, spawnT: 0, autoSt: null, autoBad: '',
      // 门动画：opened 是「能不能过」的二值碰撞状态，一律不动它；
      // doorAnim / hatchAnim 只记「这扇门开了多久（秒）」，纯绘制用，所以通关路线与检查点不受影响。
      doorAnim: {}, hatchAnim: {}, hatchList: M.solids.filter(s => s.hatch),
      blastDoor: 0, blastClosing: false, evac: null,
      splitT: new Array(G.CHAPTERS.length).fill(0),
      hold: null, gate: null, gateHint: false, holdTotal: 0,
      phase: 'CALM', phaseT: 0, dwell: { CALM: 0, TELEGRAPH: 0, BURST: 0, PURSUIT: 0 }, wave: 0,
      events: [], evDone: 0, blackout: 0, gust: 0, gasT: 0, jamAll: false, boost: 0,
      // dbg.ladder=false 只关「梯子这一绘制层」，不动 car.ladders 的数据：
      // 家具与生活层的让位规则读的就是那份数据，清掉它会连带挪动家具，
      // 于是「关掉梯子做 A/B」量的就不再是梯子本身（阶段七 V1 的坑）。
      cam: { x: M.spawn.x - VW / 2, y: 250 }, dbg: Object.assign({ solids: false, route: true, chase: false, win: false, ladder: true, far: true }, opt.dbg),
      chaseStuck: 0, frameMs: 0 };
    for (let i = 0; i < opt.chase; i++) spawnChaser(i);
    // ---------- 昼夜时间系统 ----------
    // 参考时长与 HUD 的「预估」同一个式子：改时长滑条（节数变）时曲线自动跟着缩放。
    const T_ref = Math.max(60, M.cars.length * G.SEC_PER_CAR);
    S.day = DayNight.newState(T_ref, opt.dayMode || 'once');
    S.cpTime = [];                                   // 各检查点被抵达时的 levelTime（不写进 M，地图台账必须一字不动）
    return M;
  }
  // 刷点不许落在爬梯的口上：梯井只有 20px 宽，僵尸卡在里头既推不开也绕不过，
  // 玩家更爬不上去（塔时代实测两只正面伏击者把自动通关的玩家钉死在踏面上、连死 3 次）。
  // 现在梯口比塔口窄得多，偏移量也跟着缩小，否则会把僵尸推到玩家脸前。
  function clearOfStair(x, dir) {
    for (let t = 0; t < 12; t++) {
      const hit = M.links.find(L => x > L.x - 60 && x < L.exit.x1 + 60);
      if (!hit) return x;
      x += dir < 0 ? -90 : 110;
    }
    return x;
  }
  // 僵尸只从车尾方向来：死掉就回刷新点重来，不会凭空出现在玩家前面。
  // 玩家出生在倒数第二节车厢，身后那一整节行李车 + 车尾平台就是尸潮的进场通道，
  // 所以开局的方向感是明确的：往后是死路（而且全是僵尸），往前是机车。
  function spawnChaser(i) {
    const e = S.player.e;
    // 至少 900px 开外：实测放在 300px 处时，站着的玩家 2 秒内就被贴脸杀掉，
    // 玩家连「听到声音 → 转身 → 开枪」的余量都没有。再往后不超过车尾刷新点。
    const raw = Math.max(M.rearSpawn, e.x - 900 - i * 220);
    const x = clearOfStair(raw, -1);
    const c = entity(x, G.routeYAt(M, x) - G.MOVE.h - 1, G.MOVE.chaserSpeed);
    const st = G.routeState(M, c, { opened: S.opened });
    // 开局身后没有 900px，三只会被同一个下界钳到同一坐标、互相顶住。
    // 用错峰出场而不是把它们塞到玩家脸上：wait 秒内不推进，读起来就是「后面还有东西在赶来」。
    S.chasers.push({ e: c, st, hp: 100, dead: 0, i, wait: i * 1.4, side: -1 });
  }

  // ---------- 门 / 检修盖的动画推进 ----------
  // opened 是一切碰撞与通关判据，这里一个字都不改它；doorAnim 只记「这扇门开了几秒」，
  // 绘制层按门型把它换算成 0..1 的开度。所以门有中间帧，而路线、检查点、跳跃能力全部不变。
  function animTick(dt) {
    if (!S.seenOpen) {                                   // 首帧，以及重生后那批「预开的据点闸门」：不起动画
      S.seenOpen = Object.create(null);
      for (const id of S.opened) S.seenOpen[id] = 1;
    }
    // 自动通关与验证器是直接往 opened 里加的（不走按键那一段），所以按差集补启动画：
    // 机器人跑的那一局和玩家手打的那一局必须看到同一套门。
    for (const id of S.opened) if (!S.seenOpen[id]) { S.seenOpen[id] = 1; S.doorAnim[id] = 0; }
    for (const id in S.doorAnim) { S.doorAnim[id] += dt; if (S.doorAnim[id] > 1.9) delete S.doorAnim[id]; }
    const 压住 = (s, e) => e.x + e.w > s.x && e.x < s.x + s.w && e.y + e.h > s.y - 46 && e.y < s.y + 40;
    for (const hk of S.hatchList) {
      const id = hk.ladderId === undefined ? hk.x : hk.ladderId;
      const 有人 = 压住(hk, S.player.e) || S.chasers.some(c => !c.dead && 压住(hk, c.e));
      if (有人) S.hatchAnim[id] = 0.45;                   // 正有人顶盖：保持在打开
      else if (S.hatchAnim[id]) { S.hatchAnim[id] -= dt; if (S.hatchAnim[id] <= 0) delete S.hatchAnim[id]; }
    }
  }

  // ---------- 推进 ----------
  // dt = 物理步长（钳过 0.033s，保碰撞稳定）；rawDt = 这一帧真实过了多久。
  // 世界时间必须累加 rawDt 而不是 dt：否则 20fps 下每帧被砍掉 0.017s，
  // 同一局在低帧率下天色会比高帧率慢一半地走 —— 合同第 1 条明令「不依赖帧率」。
  function update(dt, rawDt) {
    if (!S || S.won) return;
    if (S.paused) return;                              // 暂停：整个模拟与世界时间一起停
    S.time += dt;
    DayNight.tick(S.day, rawDt === undefined ? dt : rawDt);
    const pv = S.trainV;
    // 列车速度用「有界加速度」逼近目标，而不是指数逼近：指数曲线的初始 a 是无穷大，
    // 惯性伪力会瞬间把人甩出几百像素，看着像 bug。这里 a 恒定且等于 A_MAX，可核对。
    S.targetV = kmh2px(S.opt.speedKmh + (S.speedBias || 0));
    const dv = Math.max(-A_MAX * dt, Math.min(A_MAX * dt, S.targetV - S.trainV));
    S.trainV += dv;
    S.trainA = dv / dt;
    S.trainX += S.trainV * dt;
    const e = S.player.e;

    if (S.alive) {
      let cmd;
      if (S.autoSt) {
        // 自动通关：玩家也走验证器那份 routeStep —— 「闸门里能走通」与「游戏里能通关」必须是同一句话
        const bad = G.routeStep(M, S.autoSt, dt);
        // 但「被僵尸用身体堵住」不是路线断了：那是玩法状态，清掉那只就该继续走。
        // 不区分的话普通玩家机器人会永远通不了关，遭遇停留也就量不出来。
        if (bad === 'STUCK' && S.chasers.some(c => !c.dead && c.e.x > e.x && c.e.x - e.x < 46 && Math.abs(c.e.y - e.y) < 34)) {
          S.autoSt.stuck = 0; S.autoBlocked = (S.autoBlocked || 0) + 1;
        } else if (bad && !S.autoBad) { S.autoBad = bad; msg('自动通关失败 ' + bad, '#ff8f8f'); }
        cmd = null;
      } else {
        // 注意：未绑定的方向键是 undefined，直接相加会得到 NaN，
        // 而 NaN > 0 是 false —— 实测「只按 D 角色根本不跑」就是这么来的，必须先各自归一。
        const on = v => (v ? 1 : 0);
        cmd = { dir: (on(keys.d) + on(keys.ArrowRight)) - (on(keys.a) + on(keys.ArrowLeft)),
          jump: !!(keys.w || keys[' '] || keys.ArrowUp), up: !!(keys.w || keys.ArrowUp), down: !!(keys.s || keys.ArrowDown) };
        if (cmd.dir) e.face = cmd.dir;
        // 开门：与验证器同一判据、同一耗时（撞上去按住 0.22s，卡死门 0.62s）
        // 按**推的方向**那一侧的门，左右都算：掉下车顶要退回身后再找梯时，挡路的是左手边那扇
        const door = G.doorInFront(M, e, S.opened, cmd.dir);
        if (door && S.gate === door.doorId) { S.doorT = 0; S.gateHint = true; }
        else if (door && cmd.dir !== 0) {
          S.doorT += dt;
          if (S.doorT >= (door.jammed ? G.LIM.jamT : G.LIM.doorT)) { S.opened.add(door.doorId); S.doorT = 0; S.doorAnim[door.doorId] = 0; msg(door.jammed ? '踹开卡死的门' : '开门', '#8fe3a0'); }
        } else S.doorT = 0;
      }
      if (cmd) G.mover(M, e, dt, cmd, S.opened);
      if (S.autoSt) autoCombat(dt);
      applyInertia(e, dt);
      // 僵尸不给玩家上物理路障：实测「僵尸有体积」会在 30px 宽的楼梯踏面上形成死墙，
      // 普通玩家机器人 40 分钟都走不出第一章。遭遇的时间代价改由玩家模型的决策产生
      // ——「前面有怪就先停下清掉再走」，参数（反应 0.25s / 命中 55% / 射速 0.3s / 停火距离 150px）全部公开。
      if (keys.j && S.fireCd <= 0) fire();
      S.fireCd -= dt;
      // 检查点
      const cps = M.checkpoints;
      for (let i = S.cpIdx + 1; i < cps.length; i++) if (e.x >= cps[i].x) { S.cpIdx = i; startHold(cps[i]); }
      if (S.hold) S.holdTotal += dt;
      // ---------- 车头撤离：到撤离点 → 防守 20s → 防爆门关闭（3s 行程）→ 撤离成功 ----------
      // 判区只向车头方向无限延伸、不夹上界：从鼻部平台跑过头也算还在区内，
      // 否则「冲过门」的玩家会站在一个永远赢不了的地方（旧版就在这里直接判胜）。
      if (!S.evac && e.x >= M.headGoal.x) {
        S.evac = { t: 0, need: EVAC_T, warn: 0 }; S.evacStart = S.time;
        msg('抵达撤离点 · 守住 ' + EVAC_T + 's 防爆门关闭', '#ffd45e');
      }
      if (S.evac && !S.blastClosing) {
        if (e.x >= M.headGoal.x - 40) {
          S.evac.t += dt; S.evac.warn = 0;
          if (S.evac.t >= EVAC_T) { S.blastClosing = true; msg('防爆门开始关闭', '#8fe3a0'); }
        } else if (S.evac.warn < 1) { S.evac.warn = 1; msg('离开撤离点 · 防守暂停', '#ff8f8f'); }
      }
      if (S.blastClosing) {
        S.blastDoor = Math.min(1, S.blastDoor + dt / BLAST_T);
        if (S.blastDoor >= 1) { S.won = true; S.finishT = S.time; msg('防爆门到位 · 撤离成功', '#8fe3a0'); }
      }
      animTick(dt);
    }
    if (!S.noDirector) { director(dt); events(dt); }
    holdTick(dt);
    updateChasers(dt);
    for (const sh of S.shots) sh.t += dt;
    S.shots = S.shots.filter(sh => sh.t < 0.12);
    camera(dt);
  }

  // 惯性：列车坐标系里的伪力 -a·dt。地面摩擦吃掉大部分，空中几乎不衰减 → 加速时起跳会落到后面。
  // 玩家与追兵共用这一份（原来两边各写一遍，追兵那份**不做碰撞回退**：实测 TR00-0 追兵#3
  // 在梯道上被 -10px/s 的 drift 一路横向拖出 20px 的抓梯判定带，脱离梯子后卡进顶板，
  // 再被 mover 的「弹到实体边缘」解算甩到 477px 之外 —— 一次没有梯子参与的换层）。
  // 在梯子上时整条规则跳过：手抓梯档，人和车厢之间没有相对滑移。
  function applyInertia(e, dt) {
    if (e.onLadder) { e.drift = 0; return; }         // 手抓梯档：与车厢没有相对滑移，不该被惯性横向拽出梯井
    e.drift += (-S.trainA - (S.gust ? S.gust * 150 : 0)) * dt * INERTIA;
    e.drift *= Math.exp(-dt * (e.onGround ? 7 : 0.5));
    if (Math.abs(e.drift) <= 0.02) return;
    const keep = e.x;
    e.x += e.drift * dt;
    if (G.nearSolids(M, e.x - 4, e.x + e.w + 4).some(s => !s.oneway && !(s.door && S.opened.has(s.doorId)) &&
      e.x < s.x + s.w && e.x + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y)) e.x = keep;
  }

  function contact(c, dt) {
    if (!S.alive || c.dead) return;
    const e = S.player.e;
    // 27px：僵尸被「让位」规则推到贴身距离就停，接触判定必须覆盖这个距离，
    // 否则玩家永远挤得过去、僵尸根本咬不到人（实测死亡回归测试因此失效）。
    if (Math.abs((c.e.x + c.e.w / 2) - (e.x + e.w / 2)) < 27 && Math.abs(c.e.y - e.y) < 30) {
      // 16hp/s：26 时配 55% 命中的普通玩家机器人是必死循环（守不住任何一个检查点）。
      S.player.hp -= 16 * dt;
      if (S.player.hp <= 0) {
        // diagNoDeath：只给验证脚本用的诊断开关。它**只**把致命伤钳成 1 血，
        // 不改变速度、跳跃、碰撞、地图、航点、僵尸行为，也不给玩家任何增益
        // （伤害照算、僵尸照贴身、hp 照样被打到 1）。默认 false，生产路径完全不受影响。
        // 用途：把「几何/路线本身走不走得通」与「战斗难度会不会把人打死」分开量，
        // 否则 lv2 的失败里两者混在一起，分不清是卡死还是被打死。
        if (S.diagNoDeath) { S.player.hp = 1; return; }
        die();
      }
    }
  }
  function updateChasers(dt) {
    const e = S.player.e;
    for (const c of S.chasers) {
      if (c.dead) { c.dead += dt; continue; }
      if (c.wait > 0) { c.wait -= dt; continue; }
      c.st.stopX = e.x - 12;                       // 目标压在玩家身后，其余决策与验证器完全同一份代码
      const bad = G.routeStep(M, c.st, dt);
      if (bad) {
        // 追兵贴到玩家身后 12px 时，目标点就压在脚下，dir 每帧正负翻转 → 原地不动 → routeStep 报 STUCK。
        // 那是「追上了」不是「路线断了」，不能算缺陷；掉出世界、或隔着 60px 以上还过不去才是真问题。
        // 三类要分开：贴脸抖动(caught)、被横风/加速压得暂时落后(lag)、以及真正的路线断裂(stuck)。
        // 只有 NO-ROUTE / FELL 说明「闸门里走通的路线在游戏里走不通」，那才是缺陷。
        const gap = Math.abs(e.x - c.e.x);
        c.caught = bad === 'STUCK' && gap <= 60;
        // 掉进车底维修道（走了不该走的洞）与暂时落后一样，属于「这一只追兵绕错了」，
        // 重生成即可；只有 NO-ROUTE 才说明主路线在游戏里真的走不通。
        const lost = bad === 'FELL' || c.e.y + c.e.h > G.UNDER - 40;
        if (bad === 'STUCK' && !c.caught && !c.lagging) { S.chaseLag = (S.chaseLag || 0) + 1; c.lagging = 1; }
        if (lost) { S.chaseFall = (S.chaseFall || 0) + 1; c.lagging = 1; }
        else if (bad !== 'STUCK') {
          S.chaseStuck++; S.chaseBad = (S.chaseBad || '') + bad + '@' + Math.round(c.e.x) + ' ';
          const rx = Math.max(M.rearSpawn, e.x - 900);
          c.e.x = rx; c.e.y = G.routeYAt(M, rx) - c.e.h - 1;
          c.e.vx = c.e.vy = c.e.drift = 0;
          c.st.wi = 0; while (c.st.wi < c.st.wp.length - 1 && c.st.wp[c.st.wi].x < c.e.x - 20) c.st.wi++;
          c.st.stuck = 0; c.st.tail.length = 0; c.st.badLive = bad;
          c.lagging = 0;
        }
      } else { c.caught = false; c.lagging = 0; }
      c.e.speed = G.MOVE.chaserSpeed * (S.phase === 'PURSUIT' ? 1.22 : 1);
      applyInertia(c.e, dt);
      contact(c, dt);
    }
    S.chasers = S.chasers.filter(c => c.dead < 1.2);
    // 在场硬上限：超出上限的旧追兵直接离场（它们已经追不上了，留着只会堆成墙）
    if (S.chasers.filter(c => !c.dead).length > 12) {
      const far = S.chasers.filter(c => !c.dead && c.e.x < S.player.e.x - 1200);
      if (far.length) far[0].dead = 1.19;
    }
    S.chaseCaught = Math.max(S.chaseCaught || 0, S.chasers.filter(c => c.caught).length);
    if (S.noSpawn) return;                    // 调试/验证开关：只测机制时把「源源不断的援军」关掉
    S.spawnT += dt;
    const C = G.CHAPTERS[M.carAt(e.x).chapter];
    const want = Math.round(2 + C.chase * (S.opt.chase + 2));
    // 同时逼近的数量要设上限，否则「一波没打完下一波已经贴上」，普通玩家模型永远守不住据点
    const aliveN = S.chasers.filter(c => !c.dead).length;
    const near = S.chasers.filter(c => !c.dead && c.e.x < e.x && e.x - c.e.x < 900).length;
    if (S.spawnT > 4.5 && aliveN < want && near < 3) { S.spawnT = 0; spawnChaser(S.chasers.length); }
  }

  // ---------- 追击节奏导演：缓冲 → 预兆 → 爆发 → 追逐 ----------
  // 四态不是「刷怪参数」而是「玩家该在做什么」：缓冲=推进与清点、预兆=给信息不给怪、
  // 爆发=被迫停下打、追逐=边跑边打且车在加速。每态的实际停留时间记在 S.dwell 里，
  // 通关时长由这些实测值相加得到，不用「目标时长 × 系数」倒推。
  const PH_ORDER = ['CALM', 'TELEGRAPH', 'BURST', 'PURSUIT'];
  const PH_NAME = { CALM: '缓冲', TELEGRAPH: '预兆', BURST: '爆发', PURSUIT: '追逐' };
  function phaseLen(ph, C) {
    return { CALM: 12 - 7 * C.chase, TELEGRAPH: 2.8, BURST: 5 + 9 * C.chase, PURSUIT: 4 + 11 * C.chase }[ph];
  }
  function nextPhase() {
    const i = PH_ORDER.indexOf(S.phase);
    return PH_ORDER[(i + 1) % PH_ORDER.length];
  }
  function director(dt) {
    const here = M.carAt(S.player.e.x);
    S.splitT[here.chapter] += dt;
    const C = G.CHAPTERS[here.chapter];
    S.phaseT += dt; S.dwell[S.phase] += dt;
    if (S.phaseT >= phaseLen(S.phase, C)) {
      S.phase = nextPhase(); S.phaseT = 0;
      if (S.phase === 'TELEGRAPH') { S.wave = Math.round(2 + C.chase * (S.opt.chase + 1)); msg('后方有动静 · 预警', '#ffb04a'); }
      if (S.phase === 'BURST') { for (let i = 0; i < S.wave && S.chasers.filter(c => !c.dead).length < 10; i++) spawnChaser(i); msg('成群涌来 ×' + S.wave, '#ff8f8f'); }
      if (S.phase === 'PURSUIT') { S.boost = 1; msg('列车提速 · 边跑边打', '#ffd45e'); }
      if (S.phase === 'CALM') { S.boost = 0; }
    }
    // 追逐段：车真的在加速，玩家被伪力往后拽，跑不快就要挨打
    S.speedBias = S.boost ? 70 : 0;
  }
  function events(dt) {
    const x = S.player.e.x;
    for (const ev of M.events) {
      if (ev.hit) continue;
      if (x >= ev.x && x <= ev.x + 520) {
        ev.hit = true; S.evDone++;
        S.active = ev; S.evT = ev.dur;
        msg('事件 · ' + ev.name, '#8fd0ff');
        if (ev.kind === 'blackout') S.blackout = 1;
        if (ev.kind === 'gust') { S.gust = ev.power; S.shake = 10; }
        if (ev.kind === 'patrol') S.jamAll = true;
        if (ev.kind === 'sprint') S.boost = 1;
        if (ev.kind === 'stampede') for (let i = 0; i < 4 + (ev.power * 3 | 0); i++) if (S.chasers.filter(c => !c.dead).length < 10) spawnChaser(i);
        if (ev.kind === 'breach') { S.gust = -ev.power * 1.6; S.shake = 14; for (let i = 0; i < 2; i++) spawnChaser(i); }
      }
    }
    if (S.active) {
      S.evT -= dt;
      if (S.active.kind === 'gas') { S.player.hp -= 7 * S.active.power * dt; if (S.player.hp <= 0) die(); }
      if (S.evT <= 0) {
        if (S.active.kind === 'blackout') S.blackout = 0;
        if (S.active.kind === 'gust' || S.active.kind === 'breach') S.gust = 0;
        if (S.active.kind === 'patrol') S.jamAll = false;
        if (S.active.kind === 'sprint') S.boost = 0;
        S.active = null;
      }
    }
  }

  function autoCombat(dt) {
    // 自动通关的机器人也要会还手，否则「遭遇耗时」量不出来：它只会被动地被打死。
    const e = S.player.e, au = S.auto;
    let rear = null, rd = 1e9, front = null, fd = 1e9;
    for (const c of S.chasers) {
      if (c.dead || c.wait > 0) continue;
      const d = c.e.x - e.x;
      if (d < 0 && -d < 300 && -d < rd) { rd = -d; rear = c; }
      if (d > 0 && d < 260 && d < fd) { fd = d; front = c; }
    }
    const want = front || rear;
    if (au && au.lv > 1) {
      // 普通玩家：从「看到目标」到「扣扳机」有 0.25s 反应延迟，射速 0.3s，命中率 55%
      // 只在「从没有目标变成有目标」时起反应延迟。多个僵尸同时在场时「最近的那只」
      // 会逐帧换人，按目标身份重置会让计时器永远走不完 —— 实测整局只开出 2 枪。
      if (!want) { au.rt = 0; au.tgt = null; }
      else {
        if (!au.tgt) au.rt = 0.25;
        au.tgt = want;
        if (au.rt > 0) { au.rt -= dt; return; }
      }
    }
    // 只有在「真的挡在身前」时才站住打：阈值 150px 时，源源不断的援军会让机器人
    // 永远原地据守（实测 lv2 停在 x=4229 十几分钟、在场僵尸堆到 40 只）。
    if (S.autoSt) S.autoSt.hold = !!(au && au.lv > 1 && front && fd < 70);
    if (front) { e.face = 1; if (S.fireCd <= 0) fire(); return; }   // 正面有货：lv2 会停下打穿，lv1 边走边打
    if (rear) { e.face = -1; if (S.fireCd <= 0) fire(); }
  }

  function fire() {
    const e = S.player.e;
    // 射速按档位给：写在「开火之前」会把 if (fireCd <= 0) fire() 自己掐死（实测 lv2 整局只开几枪）
    S.fireCd = S.auto && S.auto.lv > 1 ? 0.3 : 0.17;
    const y = e.y + 14, x0 = e.x + (e.face > 0 ? e.w : 0);
    let hit = null, best = 1e9;
    for (const c of S.chasers) {
      if (c.dead) continue;
      const cx = c.e.x + c.e.w / 2;
      if ((cx - x0) * e.face < 0 || Math.abs(c.e.y + 18 - y) > 26) continue;
      const d = Math.abs(cx - x0);
      if (d > 430 || d >= best) continue;
      // 中间有实心板就打不到（开着的门不算阻挡）
      const blocked = G.nearSolids(M, Math.min(x0, cx), Math.max(x0, cx)).some(s => !s.oneway && !(s.door && S.opened.has(s.doorId)) &&
        s.y < y + 3 && s.y + s.h > y - 3 && (e.face > 0 ? s.x > x0 + 2 && s.x < cx - 2 : s.x + s.w < x0 - 2 && s.x + s.w > cx + 2));
      if (blocked) continue;
      hit = c; best = d;
    }
    S.shots.push({ x: x0, y, len: hit ? best : 430, t: 0 });
    if (hit) {
      const au = S.auto;
      if (au && au.lv > 1) { au.shots++; if (!au.acc.chance(0.55)) { au.miss++; return; } }
      hit.hp -= 34; if (hit.hp <= 0) { hit.dead = 0.01; S.kills++; }
    }
  }

  function die() {
    S.deaths++; S.player.hp = 100; S.alive = true;
    // 已经开始撤离防守之后，撤离点本身就是重生锚点：
    // 否则「跑到车头 → 被打死 → 从最后一颗检查点重跑 4000px → 再守 20s」会滚成死亡螺旋
    // （实测 TR02-5865 这样连死 18 次，整局从 8 分钟顶到 14 分钟）。
    // 这不算放水：改造前「踏进车头」本来就是直接判胜，回到车头是它原本的位置。
    const cp = S.evac ? { x: M.headGoal.x - 40, y: G.FLOOR }
      : S.cpIdx >= 0 ? M.checkpoints[S.cpIdx] : { x: M.spawn.x, y: G.FLOOR };
    const e = S.player.e;
    e.x = cp.x; e.y = cp.y - e.h - 1; e.vx = e.vy = e.drift = 0;
    S.chasers.length = 0;
    // 重跑要重新开门（这是「代价」），但已经守完的据点闸门必须保持开启：
    // 之前一律清空，而 cp.cleared 已经是 true、不会再开一次 → 死一次就永久封路（lv2 卡死在第二章）。
    const gates = M.checkpoints.filter(c => c.cleared && c.gate).map(c => c.gate);
    S.opened.clear(); gates.forEach(g => S.opened.add(g));
    // 门的「开度表」跟着 opened 一起作废，下一帧 animTick 会以新的 opened 重新打底：
    // 这样重生后预开的据点闸门不会凭空播一遍上提动画，而之后重开的门照样有中间帧。
    S.seenOpen = null; S.doorAnim = {}; S.hatchAnim = {};
    // 撤离防守的**累计秒数跨死亡保留**，防爆门退回全开：
    // 这和 `startHold` 对据点坚守的处理是同一条决定（「死亡付的代价是已经跑过的路，不是清零目标」）。
    // 之前在这里把 S.evac 清零，实测普通玩家机器人在最后一颗检查点连死十几次、
    // 每次都要重跑 4000px 再重守 20s，TR02-5865 的整局时长被顶到 14:08（真人估算 18~20 分钟，直接出带）。
    S.blastClosing = false; S.blastDoor = 0;
    if (S.evac) { S.evac.warn = 0; S.evac.t = Math.min(S.evac.t, S.evac.need); }
    // 航点游标必须跟着人一起回去：routeState 会按当前 x 重算 wi。
    // 少了这一步，阵亡回到据点后 wi 还停在「已经爬完的那把梯」后面，
    // 目标点在车顶而人在车内、梯子在身后 → 永远走不到，实测四颗 seed 这样 STUCK 到超时。
    if (S.autoSt) S.autoSt = G.routeState(M, e, { opened: S.opened, novice: noviceOf() });
    for (let i = 0; i < S.opt.chase; i++) spawnChaser(i);
    const cur = S.cpIdx >= 0 ? M.checkpoints[S.cpIdx] : null;
    // 世界时间回到该检查点被抵达时的那一刻：天色与位置一起复原，不会出现「人回到第三章、天已经黑了」。
    // 这是有界的回退（最多回退到本检查点），不是「中途重置为白天」。
    if (cur && S.cpTime[cur.id] !== undefined) DayNight.restore(S.day, { levelTime: S.cpTime[cur.id] });
    if (cur) startHold(cur);
    msg('阵亡 · 回到 ' + (cur ? cur.name : '起点'), '#ff8f8f');
  }

  function startHold(cp) {
    // 抵达检查点时记下世界时间：死亡回到这里，天色也跟着回到这一刻（合同第 1 条）。
    // 记在 S.cpTime 里而不是 cp 上 —— M 是地图台账，_p6_ledger 逐字段哈希盯着它。
    if (cp && S.cpTime[cp.id] === undefined) S.cpTime[cp.id] = S.day.levelTime;
    // 坚守进度记在检查点上、跨死亡保留：否则「死一次从头守」会让普通玩家永远出不去
    // （实测 lv2 机器人连死 5 次、16 分钟走不出第三章）。死亡付的代价是已经跑过的路，不是清零目标。
    S.hold = cp && cp.hold && cp.gate && !cp.cleared ? { cp, t: cp.holdT || 0, need: cp.hold } : null;
    S.gate = S.hold ? cp.gate : null;
    if (S.autoSt) { S.autoSt.locked = S.hold ? new Set([cp.gate]) : null; S.autoSt.hold = false; }
    msg(S.hold ? '固守 ' + cp.name + ' · 守住 ' + cp.hold + ' 秒开锁' : '到达 ' + (cp ? cp.name : ''), '#ffd45e');
  }
  function holdTick(dt) {
    if (!S.hold) return;
    S.hold.t += dt; S.hold.cp.holdT = S.hold.t;
    if (S.autoSt) S.autoSt.hold = true;
    if (S.hold.t >= S.hold.need) {
      S.opened.add(S.hold.cp.gate); S.hold.cp.cleared = true;
      S.player.hp = 100;   // 守满回血：这是「缓冲」的奖励，也是下一段能活下来的前提
      if (S.autoSt) { S.autoSt.locked = null; S.autoSt.hold = false; }
      msg('坚守成功 · 闸门开启', '#8fe3a0');
      S.hold = null; S.gate = null;
    }
  }
  function camera(dt) {
    const e = S.player.e, worldX = S.trainX + e.x;
    const sh = S.shake || 0;
    const jx = sh ? (Math.random() * 2 - 1) * sh * 0.5 : 0, jy = sh ? (Math.random() * 2 - 1) * sh * 0.5 : 0;
    if (sh) S.shake = Math.max(0, sh - dt * 26);
    const tx = worldX + e.face * 70 - VW / 2 + jx, ty = Math.max(0, Math.min(G.WORLD_H - VH, e.y + e.h - VH * 0.62)) + jy;
    S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 7);
    S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 5);
  }

  // ---------- 调试叠加层（美术由 js/train-draw.js 负责，这里只画验证用的东西） ----------
  function dbgView() { return { x: v => v + S.trainX - S.cam.x, y: v => v - S.cam.y }; }
  function drawDebug(g) {
    const V = dbgView();
    if (S.dbg.solids) {
      g.fillStyle = 'rgba(255,255,255,0.20)'; g.strokeStyle = 'rgba(255,255,255,0.55)';
      for (const s of M.solids) {
        const x = V.x(s.x), y = V.y(s.y);
        if (x + s.w < -20 || x > VW + 20) continue;
        g.fillRect(x, y, s.w, s.h); g.strokeRect(x + 0.5, y + 0.5, s.w, s.h);
      }
    }
    if (S.dbg.route) {
      g.strokeStyle = 'rgba(120,255,200,0.55)'; g.lineWidth = 1;
      for (const car of M.cars) {
        if (V.x(car.x1) < -40 || V.x(car.x0) > VW + 40) continue;
        const pts = routePts(car);
        g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(V.x(q[0]), V.y(q[1])) : g.moveTo(V.x(q[0]), V.y(q[1]))); g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (const L of M.links) { g.fillRect(V.x(L.x - 2) - 1, V.y(L.y0) - 4, 2, 4); g.fillRect(V.x(L.exit.x0) - 1, V.y(L.y1) - 4, 2, 4); }
    }
    if (S.dbg.chase) {
      g.strokeStyle = 'rgba(255,120,120,0.5)';
      for (const c of S.chasers) {
        if (c.dead) continue;
        g.beginPath(); let started = false;
        for (let i = c.st.wi; i < Math.min(c.st.wp.length, c.st.wi + 30); i++) {
          const q = c.st.wp[i]; started ? g.lineTo(V.x(q.x), V.y(q.y)) : (g.moveTo(V.x(q.x), V.y(q.y)), started = true);
        }
        g.stroke();
      }
    }
    if (S.dbg.win) {
      g.strokeStyle = 'rgba(127,208,255,0.8)';
      for (const car of M.cars) {
        if (V.x(car.x1) < -40 || V.x(car.x0) > VW + 40) continue;
        for (const w of G.carWindows(car)) g.strokeRect(V.x(w.x) + 0.5, V.y(w.y) + 0.5, w.w, w.h);
      }
    }
  }
  function routePts(car) {
    const yIn = car.routeIn === 'ROOF' ? car.yRoof : car.yFloor, yOut = car.routeOut === 'ROOF' ? car.yRoof : car.yFloor;
    const pts = [[car.x0, yIn]]; const L = car.links[0];
    // 换层段画成「走到梯口 → 竖直爬 → 跨出洞口」，与真实运动一致；
    // 旧版沿 5 级踏面画斜线，那条斜线本身就是一张「这里其实可以斜着走」的假承诺。
    if (L) { pts.push([L.x + 8, yIn]); pts.push([L.x + 8, yOut]); pts.push([L.exit.x1, yOut]); }
    pts.push([car.x1 + 26, yOut]);
    return pts;
  }

  function drawHud(g) {
    g.fillStyle = 'rgba(6,10,14,0.72)'; g.fillRect(0, 0, VW, 26);
    g.font = '9px monospace'; g.textBaseline = 'middle';
    const car = M.carAt(S.player.e.x), C = G.CHAPTERS[car.chapter];
    const behind = S.chasers.filter(c => !c.dead).map(c => Math.round(S.player.e.x - c.e.x)).filter(d => d > 0);
    const near = behind.length ? Math.min.apply(null, behind) : 0;
    const line1 = `用时 ${fmt(S.time)} / 预估 ${fmt(M.cars.length * G.SEC_PER_CAR)}  ·  CH${car.chapter} ${C.name}  ·  车厢 ${car.i + 1}/${M.cars.length} ${car.type}`;
    const 撤Txt = S.blastClosing ? `  ·  【撤离】防爆门关闭 ${(BLAST_T * (1 - S.blastDoor)).toFixed(1)}s`
      : S.evac ? `  ·  【撤离】防守还需 ${(S.evac.need - S.evac.t).toFixed(0)}s${S.evac.warn ? '（已离开撤离点）' : ''}` : '';
    const holdTxt = (S.hold ? `  ·  【固守】还需 ${(S.hold.need - S.hold.t).toFixed(0)}s` : (S.gateHint ? '  ·  闸门未开' : '')) + 撤Txt;
    const line2 = `车速 ${(S.trainV / 20 * 3.6).toFixed(0)}km/h (a=${S.trainA.toFixed(0)})  ·  生命 ${Math.max(0, S.player.hp).toFixed(0)}  ·  击杀 ${S.kills}  ·  阵亡 ${S.deaths}  ·  检查点 ${S.cpIdx + 1}/${M.checkpoints.length}  ·  身后追兵 ${near ? near + 'px' : '-'}  ·  路线断裂 ${S.chaseStuck}  ·  坚守累计 ${Math.round(S.holdTotal)}s` + holdTxt;
    g.fillStyle = '#cfe0f2'; g.fillText(line1, 4, 8);
    g.fillStyle = near && near < 160 ? '#ff9a9a' : '#8fa8bd'; g.fillText(line2, 4, 19);
    // 从 HUD 条下方开始画：之前从 y=8 起，第一行正好压在「预估 / 检查点」那一段上，糊成一团
    for (let i = 0; i < S.log.length; i++) {
      const w = g.measureText(S.log[i].s).width;
      // 垫板必须是暗的，不能用字色 —— 原来 `fillStyle = col` 之后再 `fillRect` 同一块，
      // 于是第一行（α=1）成了**一条实心黄杠上写着同色的字**，整块屏幕右上角被糊住，
      // 字完全读不出来。真机运行截图里抓到的，不是静态预览能看见的。
      g.globalAlpha = Math.max(0.35, 1 - i * 0.16);
      g.fillStyle = 'rgba(6,10,14,0.72)'; g.fillRect(VW - w - 8, 30 + i * 11, w + 6, 10);
      g.fillStyle = S.log[i].col;
      g.fillText(S.log[i].s, VW - 5 - w, 35 + i * 11);
    }
    g.globalAlpha = 1;
    g.globalAlpha = 1;
    if (S.won) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, VH / 2 - 20, VW, 40); g.fillStyle = '#39ff14'; g.font = '16px monospace'; g.fillText('撤离成功 · ' + fmt(S.finishT), VW / 2 - 60, VH / 2); }
  }
  // 调试覆盖：on=false 交还给自动时间流；on=true 把视觉时间钉在 p。
  // 只写 S.day.override —— levelTime / S.time / 检查点时间 / 任何玩法状态都不碰。
  function 覆盖(on, p) {
    if (!S || !S.day) return;
    S.day.override = on ? Math.max(0, Math.min(DayNight.P_MAX, p)) : null;
    DayNight.sync(S.day);
    if (typeof document === 'undefined') return;           // 无头工具里没有 DOM，状态改完就该返回
    const el = document.getElementById('dayMode');
    if (el) el.textContent = S.day.override === null
      ? '自动 t=' + S.day.levelTime.toFixed(1) + 's p=' + S.day.p.toFixed(3)
      : '覆盖 p=' + S.day.p.toFixed(3);
  }
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  // 当前该用哪一份色板：读连续相位，不读 S.opt.tod。
  // S.opt.tod 只作为「旧工具/旧按钮」的兼容入口保留 —— 没有 S.day 时才按档名取锚点。
  function PAL_NOW() {
    if (S && S.day) return TrainDraw.PAL_AT(S.day.p);
    return TrainDraw.PAL[(S && S.opt && S.opt.tod)] || TrainDraw.PAL.dusk;
  }

  // 关卡缩放滑块的当前值。放在模块级而不是 S 上，是因为 reset 会整份换掉 state 对象，
  // 挂在 S 上的话每局重建就把滑块位置吞掉了。
  let 视图K = 1;
  function draw() {
    if (!S || !ctx) return;
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CW, CH);
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0); ctx.imageSmoothingEnabled = false;
    const pal = PAL_NOW();
    S.viewK = 视图K;                                    // 关卡缩放：只影响画面，物理与碰撞一字不动
    // 整体 canvas 缩放（以画面中心为锚点）。为什么不在 train-draw 的 X/Y 上乘 K：
    // 那套绘制里大量构件是「位置走 X/Y、宽高用固定世界像素」混写的，一乘就散架（真机 1.8× 实测）。
    // 交给画布做相似变换，几何一定一致；人物与追兵在 train-draw 里各自反向补偿，所以关卡变大而人不变。
    const 缩K = Math.max(1, Math.min(2.5, 视图K));
    if (缩K !== 1) { ctx.save(); ctx.translate(VW / 2, VH / 2); ctx.scale(缩K, 缩K); ctx.translate(-VW / 2, -VH / 2); }
    TrainDraw.scene(ctx, pal, M, S, { camX: S.cam.x, camY: S.cam.y, VW, VH });
    if (缩K !== 1) ctx.restore();
    if (S.dbg.solids || S.dbg.route || S.dbg.chase || S.dbg.win) drawDebug(ctx);
    drawHud(ctx);
    S.frameMs = performance.now() - t0;
  }

  // ---------- 循环（时钟必须单调：dt 只钳上界，倒拨会把实体倒推进几何体） ----------
  function frame(now) {
    const t = now || performance.now();
    const raw = lastNow ? Math.max(0, (t - lastNow) / 1000) : 1 / 60;
    const dt = Math.min(0.033, raw);                   // 只钳物理，不钳世界时间
    lastNow = t;
    update(dt, raw); draw();
    raf = requestAnimationFrame(frame);
  }
  function step(dt) { update(dt || 1 / 60, dt || 1 / 60); draw(); }
  // 分段高清导出：整列 5 万像素不可能一张画完，按章节切片，每张覆盖一章。
  function grabAt(x, w, h) {
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const g = off.getContext('2d'); g.imageSmoothingEnabled = false;
    const save = { cx: S.cam.x, cy: S.cam.y };
    S.cam.x = S.trainX + x; S.cam.y = 60;
    const pal = PAL_NOW();
    TrainDraw.scene(g, pal, M, S, { camX: S.cam.x, camY: S.cam.y, VW: w, VH: h });
    if (S.dbg.route || S.dbg.solids) drawDebug(g);
    S.cam.x = save.cx; S.cam.y = save.cy;
    return off;
  }
  function exportSegments() {
    const W = 1600, H = 300, seen = [];
    for (const car of M.cars) if (!seen.includes(car.chapter)) seen.push(car.chapter);
    seen.forEach(ch => {
      const cs = M.cars.filter(c => c.chapter === ch);
      const off = grabAt(cs[0].x0, W, H);
      const a = document.createElement('a');
      a.href = off.toDataURL('image/png'); a.download = 'train-seg-' + S.seed + '-CH' + ch + '-' + G.CHAPTERS[ch].key + '.png'; a.click();
    });
    msg('已按章节导出 ' + seen.length + ' 张分段高清图', '#8fe3a0');
  }
  // 全车缩略图：整列压到一张里，用来看节奏与换层分布（等同 train-overview 的实时版）
  function exportSheet() {
    const W = 2400, H = 300, off = document.createElement('canvas');
    off.width = W; off.height = H;
    const g = off.getContext('2d'); g.imageSmoothingEnabled = false;
    const k = W / (M.trainLen + 900);
    g.fillStyle = '#10151c'; g.fillRect(0, 0, W, H);
    const Y = v => (v - 150) * (H / 300);
    for (const car of M.cars) {
      const x = (car.x0 + 420) * k, w = Math.max(1, car.len * k);
      g.fillStyle = ['#8d6e2f', '#3f6ea8', '#a84343', '#2f8f86', '#c2b06a', '#8a5a2b', '#2f3f57', '#7c4a94'][car.chapter];
      g.fillRect(x, Y(car.yRoof - 14), w, 3);
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x, Y(car.yRoof), w, Y(car.yFloor) - Y(car.yRoof));
      const yIn = car.routeIn === 'ROOF' ? car.yRoof : G.FLOOR, yOut = car.routeOut === 'ROOF' ? car.yRoof : G.FLOOR;
      g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.beginPath();
      g.moveTo(x, Y(yIn)); g.lineTo(x + w, Y(yOut)); g.stroke();
      for (const L of car.links) { g.fillStyle = '#39ff14'; g.fillRect((L.x + 420) * k, Y(Math.min(yIn, yOut)), Math.max(1, L.needs.band * k), Math.max(1, Math.abs(yOut - yIn))); }
    }
    for (const cp of M.checkpoints) { g.fillStyle = '#ffd45e'; g.fillRect((cp.x + 420) * k, Y(G.FLOOR) - 9, 2, 9); }
    g.font = '11px monospace'; g.fillStyle = '#cfe0f2';
    g.fillText('seed ' + S.seed + ' · ' + M.cars.length + ' 节 · 换层 ' + M.links.length + ' · 检查点 ' + M.checkpoints.length +
      ' · 纯通行 ' + fmt(M.traverse.t) + ' · 坚守 ' + Math.round(M.checkpoints.reduce((a, c) => a + (c.hold || 0), 0)) + 's', 8, 14);
    const a = document.createElement('a');
    a.href = off.toDataURL('image/png'); a.download = 'train-sheet-' + S.seed + '.png'; a.click();
    msg('已导出全车缩略图', '#8fe3a0');
  }
  function timingText() {
    const hold = M.checkpoints.reduce((a, c) => a + (c.hold || 0), 0);
    // 撤离这两段（防守 20s + 关门 3s）现在也是通关的必要时间，必须出现在台账里，
    // 否则「坚守累计 / 需」会少算 23s，用它反推纯通行时长就会偏。
    const 撤 = S.evac ? Math.min(EVAC_T, S.evac.t) + (S.blastClosing ? S.blastDoor * BLAST_T : 0) : 0;
    return '用时 ' + fmt(S.time) + '｜纯通行 ' + fmt(M.traverse.t) + '｜坚守累计 ' + Math.round(S.holdTotal) + 's / 需 ' + hold + 's' +
      '｜撤离 ' + 撤.toFixed(1) + 's / 需 ' + (EVAC_T + BLAST_T) + 's' +
      '｜阵亡 ' + S.deaths + '｜击杀 ' + S.kills + '｜节奏 ' + PH_NAME[S.phase] +
      '｜分章 ' + S.splitT.map((v, i) => 'CH' + i + ' ' + Math.round(v) + 's').join(' ');
  }
  function setKey(k, v) { keys[k] = v ? 1 : 0; }
  function setSpeed(kmh) { S.opt.speedKmh = kmh; S.targetV = kmh2px(kmh + (S.speedBias || 0)); }
  // level 1 = 完美输入（零延迟、枪枪命中），只用来证明「路线本身走得通」；
  // level 2 = 普通玩家模型：有反应延迟、会打空、射速受限 —— 通关时长要由它来量。
  // 拿完美机器人的 3 分钟乘一个系数冒充 10 分钟是不诚实的，所以这里把「玩家」也做成可测的对象。
  // level 3 = 首次游玩模型：在 level 2 之上再把**移动**变笨 —— 不满速、读图停顿、到梯口失手、
  // 起跳时机差、门前犹豫。加这一档的原因写在合同第四节：「不用固定倍率代替实际体验」。
  // 实测 lv1 与 lv2 通关只差 0.5s，说明「普通玩家比高手慢」这一层在 lv2 里根本没被建模，
  // ×1.4 只是拍的系数。旋钮集中在 TrainGen.NOVICE，每一项都能单独关掉做 ablation。
  function noviceOf() {
    if (!S.auto || S.auto.lv < 3) return null;
    return G.makeNovice(S.seed, S.noviceOver);
  }
  function setAutopilot(on, level) {
    S.auto = on ? { lv: level || 1, rt: 0, tgt: null, acc: G.makeRng(S.seed + '|auto'), miss: 0, shots: 0 } : null;
    const nov = noviceOf();
    // 速度系数作用在实体上：mover 读 e.speed，追兵各自有自己的 e.speed，不受这里影响
    S.player.e.speed = G.MOVE.speed * (nov ? nov.speedK : 1);
    S.autoSt = on ? G.routeState(M, S.player.e, { opened: S.opened, novice: nov }) : null;
    S.autoBad = '';
  }

  function start() {
    cvs = document.getElementById('game'); ctx = cvs.getContext('2d');
    cvs.width = CW; cvs.height = CH; ctx.imageSmoothingEnabled = false;
    const p = () => ({ minutes: +document.getElementById('minutes').value, ruin: +document.getElementById('ruin').value,
      speedKmh: +document.getElementById('speed').value, chase: +document.getElementById('chase').value,
      tod: document.querySelector('[data-t].on') ? document.querySelector('[data-t].on').dataset.t : 'dusk' });
    window.__P = p;
    reset(document.getElementById('seed').value || 'TR00-0', p());
    setSpeed(S.opt.speedKmh);
    document.getElementById('go').onclick = () => reset(document.getElementById('seed').value, p());
    document.getElementById('rnd').onclick = () => { const s = 'TRX-' + (Math.floor(performance.now()) % 99999); document.getElementById('seed').value = s; reset(s, p()); };
    ['minutes', 'ruin', 'chase'].forEach(id => document.getElementById(id).oninput = () => reset(document.getElementById('seed').value, p()));
    document.getElementById('speed').oninput = () => setSpeed(+document.getElementById('speed').value);
    document.getElementById('acc').onclick = () => setSpeed(Math.min(320, S.opt.speedKmh + 60));
    document.getElementById('dec').onclick = () => setSpeed(Math.max(60, S.opt.speedKmh - 60));
    // 「光线」三个按钮 = 覆盖模式的三个锚点；再点一次「自动」回到正式时间流。
    // 覆盖只改 S.day.override（视觉时间），S.time / levelTime / 碰撞 / AI / 进度 / 存档一律不动。
    document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
      document.querySelectorAll('[data-t]').forEach(q => q.classList.remove('on')); b.classList.add('on');
      S.opt.tod = b.dataset.t;
      覆盖(true, TrainDraw.ANCHOR[b.dataset.t] === undefined ? 0.58 : TrainDraw.ANCHOR[b.dataset.t]);
    });
    const dsl = document.getElementById('dayU');
    if (dsl) dsl.oninput = () => 覆盖(true, +dsl.value);
    // 关卡缩放滑块：拖动时只改渲染倍率，物理/碰撞/跳跃完全不动（人物尺寸由「锚点缩放 + 部件固定像素」
    // 自然保持不变）。所以它不会影响通关时长，也不会违反「昼夜不改碰撞」那条合同。
    const vK = document.getElementById('viewK'), vKV = document.getElementById('viewKV');
    const 写K = () => {
      视图K = Math.max(1, Math.min(2.5, +(vK ? vK.value : 1) || 1));
      S.viewK = 视图K;
      if (vKV) vKV.textContent = 视图K.toFixed(2) + '×';
    };
    if (vK) { vK.oninput = 写K; 写K(); }
    const dan = document.getElementById('dayAuto');
    if (dan) dan.onclick = () => 覆盖(false, 0);
    const dlp = document.getElementById('dayLoop');
    if (dlp) dlp.onchange = () => { S.day.mode = dlp.checked ? 'loop' : 'once'; DayNight.sync(S.day); };
    const dpz = document.getElementById('pause');
    if (dpz) dpz.onclick = () => { S.paused = !S.paused; dpz.textContent = S.paused ? '继续' : '暂停'; };
    ['0.00', '0.27', '0.58', '0.72', '1.00'].forEach((v, i) => {
      const el = document.getElementById('dayP' + i);
      if (el) el.onclick = () => { 覆盖(true, +v); if (dsl) dsl.value = v; };
    });
    ['solids', 'route', 'chase', 'win'].forEach(k => { const el = document.getElementById('dbg-' + k); if (el) { el.checked = S.dbg[k]; el.onchange = () => S.dbg[k] = el.checked; } });
    document.getElementById('bot').onchange = e => setAutopilot(e.target.checked, +document.getElementById('botLv').value);
    document.getElementById('botLv').onchange = () => { if (S.autoSt) setAutopilot(true, +document.getElementById('botLv').value); };
    document.getElementById('png').onclick = () => { const a = document.createElement('a'); a.href = cvs.toDataURL('image/png'); a.download = 'train-' + S.seed + '-' + Math.round(S.player.e.x) + '.png'; a.click(); };
    document.getElementById('pngSeg').onclick = exportSegments;
    document.getElementById('pngSheet').onclick = exportSheet;
    document.getElementById('jump').onclick = () => { const n = +document.getElementById('jumpTo').value; const cp = M.checkpoints[Math.max(0, Math.min(M.checkpoints.length - 1, n - 1))]; if (cp) { S.player.e.x = cp.x; S.player.e.y = cp.y - S.player.e.h - 1; S.cpIdx = Math.max(S.cpIdx, cp.id); msg('跳转到 ' + cp.name, '#8fe3a0'); } };
    window.addEventListener('keydown', ev => { const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; setKey(k, 1); if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(k) >= 0) ev.preventDefault(); });
    window.addEventListener('keyup', ev => { const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; setKey(k, 0); });
    raf = requestAnimationFrame(frame);
    window.__READY = true;
  }
  if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => TrainPlay.start());

  return { start, reset, step, frame, setKey, setSpeed, setAutopilot, update, draw, keys, kmh2px, grabAt, timingText, exportSheet,
    setDay: 覆盖, PAL_NOW,
    get model() { return M; }, get state() { return S; }, CW, CH, ZOOM, VW, VH, INERTIA };
})();
