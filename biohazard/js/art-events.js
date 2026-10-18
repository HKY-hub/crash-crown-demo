// ============ 美术地基 C：视觉事件模型 · 动作时间轴 · 弹壳/弹匣视觉对象 ============
// 第 3 阶段核心。原则：
// 1) 事件只在**真实玩法动作发生**时由 game.js 发出（已扣弹、已生成弹体、已投出、已挥砍）；
//    从"鼠标按下"不推断发射。空弹/冷却/换弹中不会进入这些分支，因此不会有假枪火。
// 2) 事件是纯视觉的：不决定何时补弹、不造成伤害、不改弹道。动画时长与玩法时长解耦，
//    换弹只读"本次实际总时长"（含配件与全局倍率）做 0→1 归一化。
// 3) 每条事件带：类型、武器 ID、实体 ID、视觉时刻、每实体单调序号、朝向、瞄准角、
//    配件快照、第 2 阶段锚点、以及**只用于视觉的稳定随机种子**。
// 4) 队列有容量上限、过期即回收；粒子/弹壳不在每帧重新随机，暂停（不再 step）时长不出新特效。
// 5) 纯函数求值：给定 (事件, 局部时间) 得到同一形状与时间过程 → 工位可逐帧/慢放/重播。

const ArtEvents = (() => {
  const CAP_EVENT = 160;         // 活跃事件上限
  const CAP_HISTORY = 512;       // 诊断/重建用环形历史
  const CAP_SHELL = 120;         // 弹壳对象上限
  const CAP_MAG = 24;            // 弹匣/弹巢/弹链视觉对象上限
  const SHELL_LIFE = 2.2;
  const MAG_LIFE = 1.6;

  let clock = 0;                 // 视觉时钟：只由 step(dt) 推进 → 暂停即冻结
  let nextId = 1;
  const active = [];
  const history = [];
  const seqByEnt = {};
  const shells = [];
  const mags = [];
  const stats = { emitted: 0, dropped: 0, byType: {} };

  // ---------- 稳定随机 ----------
  function hash32(a, b) {
    let h = 2166136261 >>> 0;
    h = (h ^ a) * 16777619 >>> 0; h = (h ^ (b | 0)) * 16777619 >>> 0;
    h ^= h >>> 13; h = h * 1274126177 >>> 0; h ^= h >>> 16;
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- 时间轴：按机制给出阶段表（归一化 0..1） ----------
  // stage: { n 名称, a 起点, b 终点 }
  const TIMELINES = {
    // 自动/半自动枪机循环：短促后坐 + 套筒/枪机往复 + 循环中抛壳
    fire: {
      // flash 窗口必须**不短于 2 帧**（60fps 下 ≥0.033s），否则枪口焰在一个积分步内就结束，实机永远看不见。
      // 第 6 阶段实测：原 1%–9%（0.14s 循环里只有 1.4–12.6ms）短于一帧，火光实际不可见 → 已按机制放宽。
      ar:       { dur: 0.14, stages: [['trigger', 0, .05], ['flash', .01, .40], ['recoil', 0, .18], ['bolt', .04, .42], ['eject', .22, .40], ['recover', .18, 1]] },
      blowback: { dur: 0.12, stages: [['trigger', 0, .05], ['flash', .01, .42], ['recoil', 0, .16], ['bolt', .03, .38], ['eject', .2, .36], ['recover', .16, 1]] },
      openbolt: { dur: 0.12, stages: [['trigger', 0, .04], ['flash', .01, .46], ['recoil', 0, .16], ['bolt', .02, .34], ['eject', .18, .34], ['recover', .16, 1]] },
      slide:    { dur: 0.13, stages: [['trigger', 0, .05], ['flash', .01, .40], ['recoil', 0, .2], ['bolt', .04, .46], ['eject', .26, .44], ['recover', .2, 1]] },
      bullpup:  { dur: 0.14, stages: [['trigger', 0, .05], ['flash', .01, .40], ['recoil', 0, .18], ['bolt', .04, .42], ['eject', .22, .4], ['recover', .18, 1]] },
      rotary:   { dur: 0.16, stages: [['flash', .01, .35], ['recoil', 0, .14], ['barrelSpin', 0, 1], ['eject', .2, .4], ['recover', .14, 1]] },
      recoil:   { dur: 0.3,  stages: [['trigger', 0, .04], ['flash', .01, .22], ['recoil', 0, .3], ['bolt', .1, .55], ['eject', .4, .6], ['recover', .3, 1]] },
      energy:   { dur: 0.1,  stages: [['trigger', 0, .06], ['flash', 0, .55], ['recoil', 0, .12], ['charge', .1, .5], ['recover', .12, 1]] },   // 无抛壳阶段
      flame:    { dur: 0.16, stages: [['pilot', 0, 1], ['jet', 0, .6], ['recoil', 0, .1], ['recover', .1, 1]] },                              // 无抛壳
      draw:     { dur: 0.22, stages: [['anchor', 0, .25], ['release', .25, .35], ['flash', .28, .62], ['limb', .3, .6], ['recover', .4, 1]] },
      none:     { dur: 0.1,  stages: [['trigger', 0, .1], ['flash', .02, .5], ['recover', .1, 1]] },
    },
    // 非自动武器射击之后的"人工循环"（拉栓 / 泵动 / 开膛）
    cycle: {
      bolt:   { dur: 0.42, stages: [['boltLift', 0, .22], ['boltBack', .18, .5], ['eject', .3, .52], ['caseOut', .5, .7], ['boltFwd', .52, .82], ['boltDown', .8, 1]] },
      pump:   { dur: 0.4,  stages: [['pumpBack', 0, .3], ['eject', .18, .4], ['caseOut', .38, .6], ['pumpFwd', .5, .8], ['cock', .75, .95]] },
      break:  { dur: 0.5,  stages: [['breakOpen', 0, .25], ['eject', .2, .45], ['caseOut', .4, .65], ['breakClose', .7, 1]] },
      revolver: { dur: 0.18, stages: [['hammerBack', 0, .3], ['cylinderIndex', .3, .62], ['hammerFwd', .55, .85]] },   // 不抛壳：弹壳留在弹巢里
    },
    // 换弹：按供弹路径给不同阶段（0→1 归一化到"本次实际总时长"）
    reload: {
      'box-mag':      { dur: 1, stages: [['supportOff', 0, .12], ['magRelease', .1, .24], ['magOut', .2, .36], ['magGrab', .3, .48], ['magInsert', .46, .68], ['magSeat', .66, .76], ['boltRack', .74, .88], ['supportBack', .84, 1]] },
      'bullpup-mag':  { dur: 1, stages: [['supportOff', 0, .14], ['magRelease', .12, .26], ['magOut', .22, .36], ['magGrab', .32, .48], ['magInsert', .46, .7], ['magSeat', .68, .78], ['supportBack', .8, 1]] },
      'drum':         { dur: 1, stages: [['supportOff', 0, .16], ['drumRelease', .14, .3], ['drumOut', .26, .4], ['drumGrab', .36, .52], ['drumMount', .5, .76], ['drumLock', .74, .84], ['supportBack', .84, 1]] },
      'belt':         { dur: 1, stages: [['coverOpen', 0, .16], ['magOut', .14, .32], ['beltFeed', .3, .62], ['beltPull', .58, .74], ['coverClose', .72, .88], ['supportBack', .86, 1]] },
      'pan-top':      { dur: 1, stages: [['magOut', 0, .2], ['panFlip', .18, .42], ['panMount', .4, .7], ['boltRack', .7, .88], ['supportBack', .86, 1]] },
      'top-mag':      { dur: 1, stages: [['supportOff', 0, .14], ['magOut', .12, .32], ['magFlip', .3, .5], ['magMount', .48, .74], ['chargeHandle', .72, .88], ['supportBack', .86, 1]] },
      'tubular':      { dur: 1, stages: [['shellGrab', 0, .18], ['shellLoad', .14, .42], ['shellGrab2', .4, .56], ['shellLoad2', .52, .8], ['pumpCycle', .8, .96]] },   // 逐发填管式弹仓
      'stripper':     { dur: 1, stages: [['supportOff', 0, .16], ['stripperIn', .14, .46], ['press', .44, .68], ['stripperOut', .66, .84], ['boltCycle', .82, .96]] },
      'cylinder':     { dur: 1, stages: [['gateOpen', 0, .14], ['ejectRod', .12, .34], ['casesOut', .3, .52], ['shellsIn', .5, .78], ['gateClose', .76, .92]] },        // 左轮：先集中退壳再装填
      'break-load':  { dur: 1, stages: [['breakOpen', 0, .16], ['extractor', .14, .36], ['casesOut', .32, .5], ['shellsIn', .48, .74], ['breakClose', .74, .92]] },
      'muzzle-load':  { dur: 1, stages: [['supportOff', 0, .2], ['tubeBack', .18, .44], ['roundLoad', .42, .72], ['tubeFwd', .7, .88], ['arm', .86, 1]] },
      'cell':         { dur: 1, stages: [['supportOff', 0, .18], ['cellOut', .16, .38], ['cellIn', .36, .68], ['cellPrime', .66, .86], ['supportBack', .84, 1]] },
      'tank':         { dur: 1, stages: [['valveClose', 0, .18], ['tankOff', .16, .42], ['tankOn', .4, .7], ['valveOpen', .68, .88]] },
      'none':         { dur: 1, stages: [] },
    },
    // 近战：接触必须排在最前。近战判定在按下那一帧就同步结算（game.js:1112-1116 → meleeSwing），
    // 旧版把 wind/strike 放在 contact 之前，画面上的"接触"落在判定后 6~9 帧 —— 看起来像先掉血后挨刀。
    // 判定属玩法不能挪，所以时间轴改成"接触帧＝判定帧，随势收招在后"。
    melee: { dur: 0.3, stages: [['contact', 0, .08], ['follow', .06, .34], ['sweep', .3, .62], ['recover', .58, .88], ['settle', .86, 1]] },
    throw: { dur: 0.42, stages: [['draw', 0, .16], ['pin', .14, .3], ['cock', .28, .58], ['release', .58, .7], ['follow', .68, 1]] },
    draw2: { dur: 0.24, stages: [['present', 0, .4], ['settle', .4, 1]] },
    holster: { dur: 0.2, stages: [['lower', 0, .6], ['stow', .5, 1]] },
  };

  function tlOf(group, variant) { return (TIMELINES[group] && TIMELINES[group][variant]) || (TIMELINES[group] && TIMELINES[group].none) || null; }
  function stageAt(tl, u) {
    // stages 允许是空数组（reload.none：该件的供弹路径还没有对应的换弹阶段表）。
    // 这里必须把空表也当作"没有阶段"，否则越界分支读 stages[0][1] 会在主循环里抛 TypeError，
    // 换弹事件在册的每一帧都炸一次（实测命中 hero_xuan / turret_shot 两件）。
    if (!tl || !tl.stages || !tl.stages.length) return null;
    for (const s of tl.stages) if (u >= s[1] && u <= s[2]) return s[0];
    return u < tl.stages[0][1] ? tl.stages[0][0] : tl.stages[tl.stages.length - 1][0];
  }
  // 某阶段在归一化时间轴上的局部进度（0..1），不在该阶段返回 null
  function stageProgress(tl, name, u) {
    if (!tl || !tl.stages) return null;
    for (const s of tl.stages) if (s[0] === name) {
      if (u < s[1] || u > s[2]) return null;
      const span = Math.max(1e-6, s[2] - s[1]);
      return (u - s[1]) / span;
    }
    return null;
  }

  // ---------- 事件 ----------
  function emit(type, e, data) {
    if (!e || typeof WeaponArt === 'undefined') return null;
    const key = (data && data.key) || e.weapon;
    const art = WeaponArt.get(key);
    if (!art) return null;
    const seq = (seqByEnt[e.id] || 0) + 1;
    seqByEnt[e.id] = seq;
    const anchors = WeaponArt.anchorsWorld(e, key, e.aim);
    const ev = {
      id: nextId++, type, key, mech: art.mech, ent: e.id, entRef: e, seq,
      t0: clock, dur: 0, tl: null, u: 0, stage: null, done: false,
      face: e.facing >= 0 ? 1 : -1, aim: e.aim || 0,
      att: (e.attachments || []).slice(),
      anchors, seed: hash32(e.id * 1000003 + seq, nextId),
      fired: !!(data && data.fired), shots: (data && data.shots) || 1,
      reason: (data && data.reason) || null,
    };
    switch (type) {
      case 'shot': {
        const cyc = art.mechDef.cycle;
        ev.tl = tlOf('fire', cyc) || tlOf('fire', 'none');
        ev.dur = ev.tl.dur;
        ev.shellAt = art.shell;
        // 能量/火焰/英雄能量武器：明确不产生弹壳
        if (art.mechDef.energy || art.mechDef.flame || art.mechDef.hero) ev.shellAt = 'none';
        // 折膛枪（双管）：射击瞬间不开膛，弹壳在随后的开膛/换弹事件里退出
        if (ev.shellAt === 'on-break') ev.shellAt = 'none';
        // 非自动武器：把人工循环排成紧随其后的独立事件
        const w = WEAPONS[key];
        if (w && !w.auto && !art.mechDef.melee && !art.mechDef.thrown) {
          const cv = art.mechDef.cycle === 'bolt' ? 'bolt' : art.mechDef.cycle === 'pump' ? 'pump'
            : art.mechDef.cycle === 'break' ? 'break' : art.mechDef.cycle === 'revolver' ? 'revolver' : null;
          if (cv) queueCycle(cv, e, key, anchors, ev.seed ^ 0x9e37);
        }
        break;
      }
      case 'cycle': ev.tl = data.tl; ev.dur = data.tl.dur; ev.shellAt = data.shellAt; break;
      case 'reloadStart': {
        const path = art.reloadPath;
        ev.tl = tlOf('reload', path) || tlOf('reload', 'none');
        ev.dur = Math.max(0.001, (data && data.total) || 1);
        ev.reloadTotal = ev.dur;
        ev.reloadFrom = (e.mag != null && isFinite(e.mag)) ? e.mag : 0;   // 开始换弹时的余弹：决定退壳数量
        ev.shellAt = art.shell;   // 换弹事件也要带抛壳策略，否则"左轮/折膛集中退壳"判不出来
        break;
      }
      // 近战/投掷允许逐件换时间轴（重武器挥砍更长、匕首更短），默认仍走分类时间轴
      case 'melee': ev.tl = art.meleeTimeline || TIMELINES.melee; ev.dur = ev.tl.dur; ev.shellAt = 'none'; break;
      case 'throw': ev.tl = art.throwTimeline || TIMELINES.throw; ev.dur = ev.tl.dur; ev.shellAt = 'none'; break;
      case 'draw':  ev.tl = TIMELINES.draw2; ev.dur = TIMELINES.draw2.dur; ev.shellAt = 'none'; break;
      case 'holster': ev.tl = TIMELINES.holster; ev.dur = TIMELINES.holster.dur; ev.shellAt = 'none'; break;
      default: ev.tl = null; ev.dur = 0.2;
    }
    if (active.length >= CAP_EVENT) { active.shift(); stats.dropped++; }
    active.push(ev);
    if (history.length >= CAP_HISTORY) history.shift();
    history.push(ev);
    stats.emitted++; stats.byType[type] = (stats.byType[type] || 0) + 1;
    return ev;
  }

  function queueCycle(variant, e, key, anchors, seed) {
    const tl = tlOf('cycle', variant);
    if (!tl) return;
    const art = WeaponArt.get(key);
    const ev = {
      id: nextId++, type: 'cycle', key, mech: art.mech, ent: e.id, entRef: e, seq: (seqByEnt[e.id] || 0) + 1,
      t0: clock + 0.02, dur: tl.dur, tl, u: 0, stage: null, done: false,
      face: e.facing >= 0 ? 1 : -1, aim: e.aim || 0, att: (e.attachments || []).slice(),
      anchors, seed, fired: false, shots: 0, cycleVariant: variant,
      shellAt: (art.mechDef.cycle === 'bolt' || art.mechDef.cycle === 'pump' || art.mechDef.cycle === 'break') ? art.shell : 'none',
    };
    seqByEnt[e.id] = (seqByEnt[e.id] || 0) + 1;
    if (active.length >= CAP_EVENT) { active.shift(); stats.dropped++; }
    active.push(ev);
    if (history.length >= CAP_HISTORY) history.shift();
    history.push(ev);
    stats.emitted++; stats.byType['cycle:' + variant] = (stats.byType['cycle:' + variant] || 0) + 1;
  }

  // ---------- 视觉对象：弹壳 / 弹匣 ----------
  let quality = 1;               // 1=全量；0.5=远处弹壳减半（只影响呈现，不影响发射次数）
  function spawnShell(ev, at) {
    if (!at) return;
    if (shells.length >= CAP_SHELL) { shells.shift(); stats.dropped++; }
    const r = rng(ev.seed ^ 0x51ed);
    const a = ev.aim, f = ev.face;
    const art = (typeof WeaponArt !== 'undefined') ? WeaponArt.get(ev.key) : null;
    const ej = art && art.emit && art.emit.eject;
    const e = ev.entRef;
    let dirX, dirY, spd;
    if (ej) {
      // 枪体局部系：+x 沿枪管朝枪口，垂直分量"向上"为正，再按朝向镜像（抛壳口在枪的哪一侧）
      const ca = Math.cos(a), sa = Math.sin(a);
      const lvx = ej.fwd != null ? ej.fwd : 0;
      const lvy = -((ej.up != null ? ej.up : 1.1) + r() * (ej.spread != null ? ej.spread * 0.6 : 0.3)) * f;
      dirX = lvx * ca - lvy * sa;
      dirY = lvx * sa + lvy * ca;
      spd = (ej.spd != null ? ej.spd : 190) * (0.75 + r() * 0.5);
    } else {
      // 第 3 阶段默认公式：未验收的枪保持原样
      const side = f * (0.9 + r() * 0.7);
      const back = -0.25 - r() * 0.35;
      spd = 150 + r() * 120;
      dirX = Math.cos(a) * back - Math.sin(a) * side;
      dirY = Math.sin(a) * back + Math.cos(a) * side;
      dirY = dirY - (150 + r() * 90) / spd;      // 原式里的"上抛"项
    }
    shells.push({
      x: at.x, y: at.y,
      vx: dirX * spd + (e && e.vx ? e.vx * 0.35 : 0), vy: dirY * spd,
      rot: r() * 6.283, spin: (r() - 0.5) * (ej && ej.spin != null ? ej.spin : 26),
      life: SHELL_LIFE, maxLife: SHELL_LIFE, bounces: 2,
      size: (ej && ej.shell ? ej.shell.len : 5) + (at.heavy ? 2 : 0),
      w: ej && ej.shell ? ej.shell.w : 2,
      rest: false, seed: ev.seed, key: ev.key, ent: ev.ent, ev: ev.id,
    });
  }
  function spawnMag(ev, at, kind, dir) {
    if (!at) return;
    if (mags.length >= CAP_MAG) { mags.shift(); stats.dropped++; }
    const r = rng(ev.seed ^ 0x2f2b);
    mags.push({
      x: at.x, y: at.y, vx: (r() - 0.5) * 40 + (dir || 0) * 26, vy: -30 - r() * 40,
      rot: r() * 6.283, spin: (r() - 0.5) * 9, life: MAG_LIFE, maxLife: MAG_LIFE,
      kind: kind || 'mag', key: ev.key, ent: ev.ent, ev: ev.id, seed: ev.seed,
    });
  }

  // 就近落面：弹壳与弹匣是纯视觉件，必须落在"它脚下那一层的实际表面"上。
  // 原来只用整张图唯一的一条 level.groundTop —— 单层地面没问题，但别墅有四层楼板、
  // 逃亡有坑上踏板与站台棚、列车有车内地板/车顶/车底维修道，于是弹壳会穿楼板、
  // 或在地下层悬空 126px 静止。这里按 x 列找脚下最近的实心顶面，命中实体内部就停在该实体顶面。
  function surfaceAt(x, y) {
    const lv = (typeof level !== 'undefined' && level) ? level : null;
    const 底 = (lv && lv.groundTop != null) ? lv.groundTop : 470;
    if (!lv || !Array.isArray(lv.solids)) return { y: 底, x0: -1e9, x1: 1e9 };
    let best = null;
    for (const s of lv.solids) {
      if (x < s.x || x > s.x + s.w) continue;
      if (y >= s.y - 1 && y <= s.y + s.h) return { y: s.y, x0: s.x, x1: s.x + s.w };
      if (s.y >= y && (best == null || s.y < best.y)) best = { y: s.y, x0: s.x, x1: s.x + s.w };
    }
    return best || { y: 底, x0: -1e9, x1: 1e9 };
  }

  // ---------- 推进 ----------
  function step(dt) {
    clock += dt;
    for (let i = active.length - 1; i >= 0; i--) {
      const ev = active[i];
      const local = clock - ev.t0;
      if (local < 0) { ev.u = 0; continue; }
      ev.u = ev.dur > 0 ? Math.min(1, local / ev.dur) : 1;
      ev.stage = stageAt(ev.tl, ev.u);
      drive(ev, dt);
      if (ev.u >= 1) { ev.done = true; active.splice(i, 1); }
    }
    // 弹壳物理
    const g = (typeof CFG !== 'undefined' ? CFG.G : 2100) * 0.55;
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.life -= dt;
      if (s.life <= 0) { shells.splice(i, 1); continue; }
      if (s.rest) continue;
      s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.spin * dt;
      // 落面按 x 列缓存：横向滚出这一块表面（走出阳台、飘过井口）才重新查一次
      if (!s.floor || s.x < s.floor.x0 || s.x > s.floor.x1) s.floor = surfaceAt(s.x, s.y);
      const gt = s.floor.y;
      if (s.y >= gt - 2) {
        s.y = gt - 2;
        if (s.bounces-- > 0 && Math.abs(s.vy) > 40) { s.vy = -s.vy * 0.34; s.vx *= 0.55; s.spin *= 0.5; }
        else { s.rest = true; s.vx = s.vy = 0; s.spin = 0; }
      }
    }
    for (let i = mags.length - 1; i >= 0; i--) {
      const m = mags[i];
      m.life -= dt;
      if (m.life <= 0) { mags.splice(i, 1); continue; }
      if (m.rest) continue;
      m.vy += (typeof CFG !== 'undefined' ? CFG.G : 2100) * 0.42 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.spin * dt;
      // 弹匣原先完全没有落地判定：一路穿过楼板掉出世界，直到生命期到点才凭空消失
      if (!m.floor || m.x < m.floor.x0 || m.x > m.floor.x1) m.floor = surfaceAt(m.x, m.y);
      if (m.y >= m.floor.y - 3) {
        m.y = m.floor.y - 3;
        m.bounces = m.bounces == null ? 1 : m.bounces;
        if (m.bounces-- > 0 && Math.abs(m.vy) > 60) { m.vy = -m.vy * 0.22; m.vx *= 0.5; m.spin *= 0.4; }
        else { m.rest = true; m.vx = m.vy = 0; m.spin = 0; }
      }
    }
  }

  // 事件在其时间轴上应当产出的东西（只在跨过阶段点时产出一次）
  function drive(ev) {
    if (!ev.tl) return;
    const u = ev.u;
    // 换弹：弹匣脱离 / 集中退壳由换弹时间轴自己决定，不看 shellAt（左轮 shellAt 是 on-reload，
    // 但换弹时确实要退壳 —— 早先用 shellAt 当总开关会让换弹动作整体失效）
    if (ev.type === 'reloadStart' && ev.tl.stages) {
      const out = stageProgress(ev.tl, 'magOut', u);
      if (out !== null && !ev._magOut) {
        ev._magOut = true;
        const kind = /cylinder/.test(ev.mech) ? 'cylinder' : /drum|pan/.test(ev.mech) ? 'drum' : /belt/.test(ev.mech) ? 'belt' : 'mag';
        if (kind !== 'belt' && kind !== 'cylinder') spawnMag(ev, anchorOf(ev, 'mag'), kind, ev.face);
      }
      const eo = stageProgress(ev.tl, 'casesOut', u);
      if (eo !== null && !ev._casesOut) {
        ev._casesOut = true;
        const w = WEAPONS[ev.key] || {};
        // 退出的是"已射弹壳"：容量 − 开始换弹时的余弹
        const cap = (typeof magCapacityFor === 'function' && ev.entRef) ? (magCapacityFor(ev.entRef, w) || w.mag || 6) : (w.mag || 6);
        const firedRounds = Math.max(0, Math.min(cap, cap - (ev.reloadFrom || 0)));
        // 左轮/折膛：一次集中退出已射弹壳；其它机制的开膛退壳按 2 发上限表现
        const n = ev.shellAt === 'on-reload' ? Math.max(1, Math.min(6, firedRounds || cap || 1))
          : Math.max(1, Math.min(2, firedRounds || 1));
        for (let i = 0; i < n; i++) {
          const fake = { seed: ev.seed + i * 7919, aim: ev.aim, face: ev.face, entRef: ev.entRef, key: ev.key, id: ev.ent, ent: ev.ent };
          spawnShell(fake, anchorOf(ev, 'eject'));
        }
      }
      const sl = stageProgress(ev.tl, 'shellLoad', u);
      if (sl !== null && !ev._shellLoaded) { ev._shellLoaded = true; ev.reloadShellsLoaded = (ev.reloadShellsLoaded || 0) + 1; }
      const sl2 = stageProgress(ev.tl, 'shellLoad2', u);
      if (sl2 !== null && !ev._shellLoaded2) { ev._shellLoaded2 = true; ev.reloadShellsLoaded = (ev.reloadShellsLoaded || 0) + 1; }
      return;
    }
    if (ev.shellAt && ev.shellAt !== 'none' && ev.tl.stages) {
      const ej = stageProgress(ev.tl, 'eject', u);
      const co = stageProgress(ev.tl, 'caseOut', u);
      const gate = ev.type === 'shot' ? ej : (ej !== null ? ej : co);
      if (gate !== null && !ev._ejected) {
        ev._ejected = true;
        // 左轮：射击时保留已弹壳，只有换弹才集中退出
        if (ev.shellAt !== 'on-reload') spawnShell(ev, anchorOf(ev, 'eject'));
      }
    }
  }
  function anchorOf(ev, name) {
    const a = ev.anchors;
    if (!a) return null;
    if (a[name]) return a[name];
    return a.muzzle ? { x: a.muzzle.x, y: a.muzzle.y + 3 } : null;
  }

  // ---------- 终止 / 清理 ----------
  // reason='reloadDone' 只结束换弹事件（不打断同时进行的射击/循环）；
  // 其它 reason（切枪/死亡/感染/变身/回合结束）清掉该实体的全部视觉动作。
  function cancel(entId, reason) {
    let n = 0;
    const onlyReload = reason === 'reloadDone';
    for (let i = active.length - 1; i >= 0; i--) {
      const ev = active[i];
      if (ev.ent !== entId) continue;
      if (onlyReload && ev.type !== 'reloadStart') continue;
      active.splice(i, 1); n++;
    }
    for (let i = mags.length - 1; i >= 0; i--) if (mags[i].ent === entId) { mags[i].life = Math.min(mags[i].life, 0.18); }
    if (reason === 'death' || reason === 'infect' || reason === 'round') {
      for (let i = shells.length - 1; i >= 0; i--) if (shells[i].ent === entId) shells.splice(i, 1);
    }
    return n;
  }
  function cancelAll(reason) {
    const n = active.length;
    active.length = 0; shells.length = 0; mags.length = 0;
    for (const k in seqByEnt) delete seqByEnt[k];
    if (reason === 'reset') { clock = 0; history.length = 0; }
    return n;
  }

  // ---------- 查询（工位/诊断用） ----------
  function list() { return active.slice(); }
  function forEntity(entId) { return active.filter(e => e.ent === entId); }
  function recent(n) { return history.slice(-(n || 40)); }
  function info() {
    return { clock: +clock.toFixed(3), active: active.length, history: history.length, shells: shells.length, mags: mags.length, cap: { active: CAP_EVENT, history: CAP_HISTORY, shells: CAP_SHELL, mags: CAP_MAG }, stats };
  }
  // 纯函数重播：给定事件与局部时间，返回该时刻的阶段/归一化进度/各部件位移（供工位逐帧与断言）
  function replay(ev, localT) {
    const u = ev.dur > 0 ? Math.max(0, Math.min(1, (localT - ev.t0) / ev.dur)) : 1;
    const r = rng(ev.seed);
    const jitter = r();
    const rec = stageProgress(ev.tl, 'recoil', u);
    const bolt = stageProgress(ev.tl, 'bolt', u) || stageProgress(ev.tl, 'pumpBack', u) || stageProgress(ev.tl, 'boltBack', u);
    const flash = stageProgress(ev.tl, 'flash', u);
    // 能量武器的"充能/聚能"阶段：TIMELINES.fire.energy 里早就有 charge 段，但一直没人消费，
    // 于是能量枪的开火与机械枪完全同形。这里开一条只读通道给绘制侧（不改任何判定与时长）。
    const charge = stageProgress(ev.tl, 'charge', u) || stageProgress(ev.tl, 'draw', u);
    return {
      u, stage: stageAt(ev.tl, u), jitter,
      recoil: rec == null ? 0 : Math.sin(rec * Math.PI) * (1 - rec * 0.35),
      boltTravel: bolt == null ? 0 : Math.sin(bolt * Math.PI),
      flash: flash == null ? 0 : Math.sin(flash * Math.PI),
      charge: charge == null ? 0 : Math.sin(charge * Math.PI),
      shellsPlanned: ev.shellAt === 'none' || ev.shellAt === 'on-reload' ? 0 : 1,
    };
  }

  return { emit, step, cancel, cancelAll, list, forEntity, recent, info, replay, spawnShell, spawnMag,
    TIMELINES, tlOf, stageAt, stageProgress, anchorOf, setQuality: v => { quality = v; }, get quality() { return quality; },
    get clock() { return clock; }, get shells() { return shells; }, get mags() { return mags; },
    get activeEvents() { return active; } };
})();

// ============ 视觉对象的绘制（弹壳 / 弹匣 / 枪口火光时序） ============
const ArtFX = (() => {
  function drawShells(ctx, cam) {
    const sh = ArtEvents.shells;
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i];
      const x = s.x - cam.x, y = s.y - cam.y;
      if (x < -24 || x > CFG.CW + 24) continue;                 // 屏幕外回收绘制
      const a = Math.max(0, Math.min(1, s.life / s.maxLife * 1.6));
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.rot);
      const L = s.size, W = s.w;
      ctx.fillStyle = ART_SPEC.outline; ctx.fillRect(-Math.round(L * 0.6) - 1, -Math.round(W / 2) - 1, Math.round(L * 1.6) + 2, W + 2);
      const m = ART_SPEC.materials.brass;
      ctx.fillStyle = m.base; ctx.fillRect(-Math.round(L * 0.6), -Math.round(W / 2), Math.round(L * 1.6), W);
      ctx.fillStyle = m.hi; ctx.fillRect(-Math.round(L * 0.6), -Math.round(W / 2), Math.round(L * 1.6), 1);
      ctx.fillStyle = m.lo; ctx.fillRect(Math.round(L * 0.9), -Math.round(W / 2), Math.max(1, Math.round(L * 0.12)), W);   // 弹底
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  function drawMags(ctx, cam) {
    const mg = ArtEvents.mags;
    for (let i = 0; i < mg.length; i++) {
      const o = mg[i];
      const x = o.x - cam.x, y = o.y - cam.y;
      if (x < -30 || x > CFG.CW + 30) continue;
      const art = WeaponArt.get(o.key);
      const curved = art && /longstroke|ak|drum|rpk|galil|type81/.test(art.mech + (o.key || ''));
      const a = Math.max(0, Math.min(1, o.life / o.maxLife * 1.8));
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot);
      const m = ART_SPEC.materials.polymer;
      ctx.fillStyle = ART_SPEC.outline; ctx.fillRect(-4, -1, 9, 12);
      if (o.kind === 'drum') {
        ctx.fillStyle = m.base; pxCircle(ctx, 0, 4, 6);
        ctx.fillStyle = m.hi; pxCircle(ctx, -2, 2, 2);
      } else if (o.kind === 'cylinder') {
        ctx.fillStyle = ART_SPEC.materials.steel.base; pxCircle(ctx, 0, 4, 5);
        ctx.fillStyle = ART_SPEC.outline; for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(Math.cos(k) * 3), Math.round(4 + Math.sin(k) * 3), 1, 1);
      } else {
        // 弹匣：弯曲（AK 系）与直匣（STANAG 系）在视觉上必须不同
        for (let r = 0; r < 10; r++) {
          const bend = curved ? Math.round(Math.pow(r / 10, 1.6) * 4) : 0;
          ctx.fillStyle = r === 0 ? m.hi : (r > 8 ? m.lo : m.base);
          ctx.fillRect(-2 + bend, r, 5, 1);
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  // 枪口火光：由事件的 flash 阶段驱动，短促起落，不是常亮灯泡。
  // 形状参数取自该枪档案 art.emit.flash（瓣数/前突芒/侧芒/焰核/尾迹/抖动）；
  // 没有档案时逐项退回第 3 阶段的通用十字星，保证未验收的枪表现不变。
  function drawMuzzleFlash(ctx, cam, ev, opts) {
    const o = opts || {};
    const rp = ArtEvents.replay(ev, clock0());
    let flash = rp.flash;
    const u = rp.u;
    const art = (typeof WeaponArt !== 'undefined') ? WeaponArt.get(ev.key) : null;
    const ef = art && art.emit && art.emit.flash;
    const es = art && art.emit && art.emit.smoke;
    // 逐枪可覆盖焰的起止（归一化 u）：短管卡宾"啪"一下，长枪管/大装药枪焰更绵长
    if (ef && ef.win) {
      const w0 = ef.win[0], w1 = ef.win[1];
      flash = (u >= w0 && u <= w1) ? Math.sin((u - w0) / Math.max(1e-4, w1 - w0) * Math.PI) : 0;
    }
    const a = ev.anchors && ev.anchors.muzzle;
    if (!a) return 0;
    const off = o.off || { x: 0, y: 0 };
    const x = a.x - cam.x + off.x, y = a.y - cam.y + off.y;
    // 无后坐/火箭类推弹的**尾部后喷**：从该件档案的尾部锚点向后张开，与枪口焰同一事件时序。
    // 为什么必须单独有：RPG-7 一类武器没有抛壳、枪口焰也短，真实可见特征是尾喷锥与烟，
    // 只画通用星焰就等于把发射方式画错了。
    if (art && art.emit && art.emit.backblast) drawBackblast(ctx, cam, ev, art, off, u);
    // 枪口烟：焰之后才起，沿膛线前飘并上浮扩大淡出（纯事件时序函数，不新增粒子池）
    if (es && u >= es.at) drawMuzzleSmoke(ctx, ev, es, x, y, u);
    if (flash <= 0) return 0;
    const feel = (WEAPONS[ev.key] || {}).feel || {};
    const size = (feel.flashSize || 4) * (o.sizeMul || 1) * (0.6 + flash * 0.9);
    // 消音器等配件的 flashMul 继续生效（视觉与最终装备状态一致）
    const ent = ev.entRef || (typeof game !== 'undefined' ? game.player : null);
    const attMul = (ent && ent.attFx && ent.attFx.flashMul != null) ? ent.attFx.flashMul : 1;
    const alpha = Math.min(1, flash * 1.5) * (feel.flashMul || 1) * attMul * (o.mul == null ? 1 : o.mul);
    if (alpha <= 0.01) return 0;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = (ef && ef.col) || '#ffe94a';
    pxCircle(ctx, x, y, Math.max(1, size * (ef && ef.ball != null ? ef.ball : 0.55)));
    ctx.fillStyle = (ef && ef.edgeCol) || ART_SPEC.materials.energy.edge;
    // 芒：第一瓣沿膛线（前突芒），其余按瓣数分布；抖动来自事件种子 → 同一事件重播同形
    const petals = ef && ef.petals != null ? ef.petals : 4;
    const fwdLen = ef && ef.fwd != null ? ef.fwd : 1.5;
    const sideLen = ef && ef.side != null ? ef.side : 0.7;
    const jit = ef && ef.jitter ? ((ev.seed % 97) / 97 - 0.5) * 2 * ef.jitter : 0;
    for (let k = 0; k < petals; k++) {
      const ang = ef ? ev.aim + (k === 0 ? jit : Math.PI + jit * 0.6 + (k - 1) * ((Math.PI * 2 - 1.2) / Math.max(1, petals - 1)))
        : ev.aim + k * Math.PI / 2;
      const len = Math.round(size * (ef ? (k === 0 ? fwdLen : (k % 2 ? sideLen : sideLen * 1.3)) * flash
        : (k % 2 ? 0.7 : 1.5) * flash));
      pxLine(ctx, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    }
    // 尾迹：枪口后方一小段未燃尽药光（短管卡宾的特征）
    if (ef && ef.tail) {
      const tl = Math.round(size * ef.tail * flash);
      ctx.fillStyle = ef.tailCol || '#ffb300';
      pxLine(ctx, x, y, x - Math.cos(ev.aim) * tl, y - Math.sin(ev.aim) * tl);
    }
    // 能量/火焰类：用细亮芯代替黄铜火星。颜色原本按机制名硬写死成 #ff8a80，
    // 金色系的圣光之枪会顶着一道红色芯 —— 改为档案可覆盖（emit.energy.col / flash.col）。
    if (ev.mech && /energy|flame/.test(ev.mech)) {
      const ec = (ef && (ef.coreCol || ef.col)) || (art && art.emit && art.emit.energy && art.emit.energy.col) || '#ff8a80';
      ctx.fillStyle = ec;
      const clen = size * ((ef && ef.coreLen) != null ? ef.coreLen : 2.4);
      pxLine(ctx, x, y, x + Math.cos(ev.aim) * clen, y + Math.sin(ev.aim) * clen);
      if (ef && ef.coreLen2) {
        ctx.fillStyle = ef.edgeCol || ec;
        pxLine(ctx, x, y, x + Math.cos(ev.aim) * clen * 0.55, y + Math.sin(ev.aim) * clen * 0.55);
      }
    }
    ctx.globalAlpha = 1;
    return alpha;
  }
  // 枪口烟：完全由事件时序算出（无新增状态、可重播）；配件的 smokeMul 若存在则一并压小
  function drawMuzzleSmoke(ctx, ev, es, x, y, u) {
    const k = Math.max(0, Math.min(1, (u - es.at) / Math.max(0.001, 1 - es.at)));
    if (k >= 1) return;
    const ent = ev.entRef || (typeof game !== 'undefined' ? game.player : null);
    const mul = (ent && ent.attFx && ent.attFx.smokeMul != null) ? ent.attFx.smokeMul : 1;
    const life = es.alpha * (1 - k) * mul;
    if (life <= 0.01) return;
    const d = es.drift * k, r = es.rise * k;
    const sx = x + Math.cos(ev.aim) * d - Math.sin(ev.aim) * r;
    const sy = y + Math.sin(ev.aim) * d + Math.cos(ev.aim) * r;
    ctx.globalAlpha = Math.min(0.5, life);
    ctx.fillStyle = es.col || '#8d9198';
    pxCircle(ctx, sx, sy, Math.max(1, es.puff * (0.5 + k * 1.6)));
    if (es.puff > 2) {
      ctx.fillStyle = es.col2 || '#6f747a';
      pxCircle(ctx, sx - Math.sin(ev.aim) * 2, sy + Math.cos(ev.aim) * 2, Math.max(1, es.puff * 0.6));
    }
    ctx.globalAlpha = 1;
  }
  // 尾部后喷（火箭筒/无后坐炮一类）：从该件档案的尾部锚点沿"瞄准反方向"张开一个锥，
  // 长度与不透明度都由击发事件的 u 决定，可重播、不占粒子池。
  // eb = { at:'stock', len, spread, cols:[热核, 焰体, 烟], win:[起,止], smoke:{...} }
  function drawBackblast(ctx, cam, ev, art, off, u) {
    const eb = art.emit.backblast;
    const pt = ev.anchors && ev.anchors[eb.at || 'stock'];
    if (!pt) return;
    const w0 = eb.win ? eb.win[0] : 0, w1 = eb.win ? eb.win[1] : 0.42;
    if (u < w0 || u > w1) return;
    const k = (u - w0) / Math.max(1e-4, w1 - w0);          // 0→1：喷出到散逸
    const back = ev.aim + Math.PI;
    const x = pt.x - cam.x + (off ? off.x : 0), y = pt.y - cam.y + (off ? off.y : 0);
    const cols = eb.cols || ['#fff3c4', '#ffb74d', '#9e9e9e'];
    const L = (eb.len || 12) * (0.45 + k * 1.15);
    const sp = eb.spread == null ? 0.42 : eb.spread;
    const rays = eb.rays == null ? 5 : eb.rays;
    ctx.globalAlpha = Math.max(0, (1 - k) * (eb.alpha == null ? 0.85 : eb.alpha));
    for (let i = 0; i < rays; i++) {
      const t = rays === 1 ? 0 : i / (rays - 1) * 2 - 1;    // -1..1 横向分布
      const ang = back + t * sp;
      const len = L * (1 - Math.abs(t) * 0.45);
      ctx.fillStyle = i === 0 ? cols[0] : (Math.abs(t) < 0.6 ? cols[1] : cols[2]);
      pxLine(ctx, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    }
    // 尾烟：喷口后方一团散开的尘雾，随 k 扩大淡出（只画 2 个圆，控制遮挡与开销）
    if (eb.smoke && k > 0.15) {
      const sd = eb.smoke.dist * k;
      ctx.globalAlpha = Math.max(0, (1 - k) * eb.smoke.alpha);
      ctx.fillStyle = eb.smoke.col || '#8d9198';
      pxCircle(ctx, x + Math.cos(back) * sd, y + Math.sin(back) * sd, eb.smoke.r * (0.6 + k * 1.5));
      ctx.fillStyle = eb.smoke.col2 || '#6f747a';
      pxCircle(ctx, x + Math.cos(back) * sd * 1.5, y + Math.sin(back) * sd * 1.5 + 1, eb.smoke.r * k * 1.4);
    }
    ctx.globalAlpha = 1;
  }
  function clock0() { return ArtEvents.clock; }
  return { drawShells, drawMags, drawMuzzleFlash, drawBackblast };
})();

if (typeof window !== 'undefined') { window.ArtEvents = ArtEvents; window.ArtFX = ArtFX; }
