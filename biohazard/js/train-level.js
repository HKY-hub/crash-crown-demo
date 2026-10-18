// ============ 火车图 → 主循环关卡适配器 ============
// 为什么单独一个文件，而不是把字段塞进 train-gen 或 level.js：
//   js/train-gen.js 产的是「列车自身坐标系」的模型（碰撞世界永远静止，trainX 只推进镜头与
//   世界采样），主循环要的是 level 契约（solids / stages / 推进线 / 坚守 / 撤离区 / 出生）。
//   这一层只做翻译，不产生任何新几何 —— 翻译对不对由 tools/_check_train_ingame.js 逐字段核对。
// 三条翻译规则（都是「搬既有机制」，不是「新造机制」）：
//   ① 检查点 → stages[]：主循环原生的「踩线 → guardTimer → 推进线开启 → 超时留在旧区判死」
//      与火车的「守住 N 秒才开锁」是同一件事，所以一个 checkpoint 出一关，不新增回合逻辑。
//   ② 车厢连接处的门 → mechanisms type:'door'：主循环的门语义是「只挡幽灵、人类随便穿」，
//      火车的门本来也是给追兵减速用的，语义对得上；火车那套「按住 0.22s 开门」留在独立页，
//      不在这里改引擎。
//   ③ 梯子 → level.ladders 单独成表：主循环的 moveEntity 没有攀爬，这是唯一真正的引擎缺口，
//      由阶段二带数据门控补上（level.ladders 为空的地图完全不进那条分支）。
const TrainLevel = (() => {
  const FLOOR = () => TrainGen.FLOOR, WH = () => TrainGen.WORLD_H;
  const kmh2px = v => v * 1000 / 3600 * 20;      // 与 train-play 同一换算：1px = 1/20 m

  // ---------- 检查点 → 关卡序列 ----------
  // 火车的检查点是「跑到 CP_i → 守住 hold_i 秒 → 下一段开锁」。主循环里 stage 的推进线
  // 落在 endX-30，坚守由踩线触发器启动。所以：
  //   stage_i.endX   = CP_i.x + 前沿余量（守完之后要能越过检查点再走一段才算真进下一段）
  //   stage_i.triggers = 在 CP_i 前 260px 踩线，启动 stage_i 自己的坚守
  //   stage_i.guardTimer = CP_i.hold（写进关卡数据的那个秒数，不是运行时随机）
  // 最后一关没有检查点：终点是机车驾驶室，交给撤离区判胜。
  function stagesOf(M, cps) {
    const F = FLOOR(), out = [];
    let startX = 0;
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      const endX = Math.min(M.trainLen, cp.x + 520);
      out.push({
        idx: i, startX, endX, name: cp.name, theme: 'highway',
        spawnHuman: { x: Math.round(cp.x - 40), y: F },
        respawns: [{ x: Math.round(Math.max(60, cp.x - 900)), y: F }, { x: Math.round(cp.x + 260), y: F }],
        shortcutSpawns: [],
        ammoBoxes: [{ x: Math.round(cp.x - 120), y: F - 40 }],
        weaponBoxes: [], capsules: [], keys: [], crystals: [],
        triggers: [{ x: Math.round(cp.x - 260), y: F - 90, w: 60, h: 90,
          event: { respawn: i + 1, guard: i } }],
        mechanisms: [], portal: null, guardTimer: cp.hold, escapeZone: null, decor: [],
      });
      startX = endX;
    }
    const 终 = M.headGoal;
    out.push({
      idx: out.length, startX, endX: M.trainLen + 260, name: '机车驾驶室 · 撤离', theme: 'highway',
      spawnHuman: { x: Math.round(终.x - 200), y: F },
      respawns: [{ x: Math.round(startX + 120), y: F }, { x: Math.round(终.x - 60), y: F }],
      shortcutSpawns: [], ammoBoxes: [{ x: Math.round(终.x - 320), y: F - 40 }],
      weaponBoxes: [], capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 0, escapeZone: null, decor: [],
    });
    return out;
  }

  function build(seed, opts) {
    if (typeof TrainGen === 'undefined')
      throw new Error('TrainLevel.build 需要 train-gen.js（请先于 level.js 加载）');
    const o = Object.assign({ minutes: 10, ruin: 0.6, speedKmh: 210, chase: 3, tod: 'dusk' }, opts || {});
    const M = TrainGen.build(String(seed), o);
    const F = FLOOR();
    // 主循环只读 x/y/w/h/oneway/mat，扩展字段（car/main/roof/hatch/ladderId/door/doorId/jammed/open/
    // seam/deck/gantry）一律无视 —— 但**原样带着**，闸门要靠它们核对「碰撞台账没被翻译改窄」。
    // 唯一的例外是门：门实体是 14×146 的**通高**板（每节车道一道，实测 61 块），主循环不认识
    // door 字段会把它当实心墙，玩家在第一节课厢里就出不去。所以门一律从 solids 里摘出来，
    // 改走主循环自己的 door 机关（语义：只挡幽灵、人类随便穿），并由 view() 把机关状态
    // 回填给 TrainDraw 的 S.opened，保证「画成开着」与「穿得过去」是同一件事。
    const solids = M.solids.filter(s => !s.door).map(s => ({
      x: s.x, y: s.y, w: s.w, h: s.h, oneway: !!s.oneway, mat: s.mat || 'steel',
      car: s.car, main: s.main, roof: s.roof, hatch: s.hatch, door: s.door, doorId: s.doorId,
      ladderId: s.ladderId, seam: s.seam, deck: s.deck, gantry: s.gantry,
    }));
    const cps = M.checkpoints || [];
    const stages = stagesOf(M, cps);
    // 门机关一律从「开着」起步：火车那套「按住 0.22s 才推开」是独立页的玩法，
    // 主循环的门是二值开关。玩家可以按 E 把身后的门**关上**去挡幽灵 —— 这条交互
    // 与火车「关门减速追兵」的原意一致，且不需要改引擎。
    for (const st of stages) {
      for (const s of M.solids) {
        if (!s.door || s.x < st.startX || s.x >= st.endX) continue;
        st.mechanisms.push({ type: 'door', x: s.x, y: s.y, w: s.w, h: s.h,
          hp: s.jammed ? 260 : 320, closed: false, doorId: s.doorId, jammed: !!s.jammed });
      }
    }
    const ez = { x: Math.round(M.headGoal.x - 40), y: F - 64, w: 240, h: 64 };
    stages[stages.length - 1].escapeZone = ez;
    const out = {
      solids, buildings: [], escapeZone: ez,
      spawnHuman: { x: Math.round(M.spawn.x), y: M.spawn.y },
      spawnZombie: { x: Math.round(M.rearSpawn), y: F },
      worldW: Math.round(M.trainLen + 260), groundTop: F, stages,
      cliffRespawns: [], objList: [], fortifySpots: [],
      train: M, worldH: WH(), killY: WH() - 12,
      // 编组长度单独再给一份：主循环只认 worldW，而 HUD/回合/量具要知道「车头在哪」，
      // 让它们去读 level.train.trainLen 会把模型细节漏进回合逻辑里。
      // （漏过一次：出图代码写 level.trainLen 拿到 undefined → 玩家被传送到 NaN，
      //   整帧什么都没画，看着像渲染坏了，其实是字段没给。）
      trainLen: Math.round(M.trainLen),
      // 攀爬表：引擎（moveEntity → tryClimb）读它。爬速与出梯跨距一律取自列车模型自己的 LIM，
      // 不在引擎里另定一套 —— 独立页能走通的梯，接进游戏后必须是同一把梯（口径见 train-gen.js:848 mover）。
      ladders: M.ladders.map(L => ({ x: L.x, y0: L.y0, y1: L.y1, w: TrainGen.LAD.band,
        speed: TrainGen.LIM.ladder, exit: TrainGen.LIM.exit,
        car: L.car, id: L.id, ladderId: L.id })),
      trainX: 0, trainTime: 0, trainV: kmh2px(o.speedKmh),
      opened: new Set(), doorAnim: {}, hatchAnim: {}, seenOpen: null,
      // 检修盖板（顶板在梯井处断开的那块）：动画推进要按名字找它，与 train-play.js:40 同一份来源
      hatchList: M.solids.filter(s => s.hatch),
    };
    // 昼夜：主循环自己没有连续相位，接过来由 tick() 推进。tod 名到相位的锚点用
    // TrainDraw.ANCHOR（独立页顶部那排「白/白末/黄昏/入夜/黑夜」按钮用的就是它），
    // 这样游戏里的火车与独立页同一档看到的是同一套色板，不会出现两处各调一遍。
    out.day = typeof DayNight !== 'undefined' ? DayNight.newState(597, o.dayMode || 'once') : null;
    if (out.day && typeof TrainDraw !== 'undefined' && TrainDraw.ANCHOR && TrainDraw.ANCHOR[o.tod] !== undefined) {
      out.day.override = TrainDraw.ANCHOR[o.tod];
      DayNight.sync(out.day);
    }
    return out;
  }

  // 该用哪份色板：读连续相位，不读档位名（与 train-play.js:551 同一条口径）
  function palette(level) {
    if (typeof TrainDraw === 'undefined') return null;
    if (level && level.day) return TrainDraw.PAL_AT(level.day.p);
    return TrainDraw.PAL[(level && level.todName) || 'dusk'] || TrainDraw.PAL.dusk;
  }

  // ---------- 疾驰参考系 ----------
  // 碰撞世界固定在车厢坐标系（train-gen.js:3 就是这个约定），只有 trainX 在推进；
  // 渲染时把 camX 平移 trainX，于是背景与路基飞速后退、车厢与玩家相对静止。
  // 主循环的实体/AI/子弹全部不知道 trainX 的存在 —— 这是它能接进共用引擎的前提。
  function tick(level, dt, game) {
    if (!level || !level.train) return 0;
    level.trainX += level.trainV * dt;
    level.trainTime += dt;
    if (level.day && typeof DayNight !== 'undefined') DayNight.tick(level.day, dt);
    animTick(level, dt, game);
    return level.trainX;
  }

  // ---------- 门与检修盖的动画推进（逐句搬自 train-play.js:89 animTick）----------
  // `opened` 是一切碰撞与通行判据，这里一个字都不改它；doorAnim / hatchAnim 只记「开了几秒」，
  // 绘制层按它把门扇与盖板抬起来（train-draw.js:2507 与 :2879）。
  // 少了这一段，游戏里会出现「人从还盖着的检修口穿过去」—— 画成关着、实际穿得过去就是两本账分家。
  function animTick(level, dt, game) {
    const mechs = (game && game.mechs) ? (game.mechs[game.stage] || []) : [];
    const opened = level.opened; opened.clear();
    for (const m of mechs) if (m.type === 'door' && m.doorId !== undefined && !m.closed) opened.add(m.doorId);
    if (!level.seenOpen) {                       // 首帧：开局就预开的门不起动画（独立页同一处理）
      level.seenOpen = Object.create(null);
      for (const id of opened) level.seenOpen[id] = 1;
    } else {
      for (const id of opened) if (!level.seenOpen[id]) { level.seenOpen[id] = 1; level.doorAnim[id] = 0; }
      for (const id in level.seenOpen) if (!opened.has(id)) delete level.seenOpen[id];   // 关门后再开要能重放
    }
    for (const id in level.doorAnim) { level.doorAnim[id] += dt; if (level.doorAnim[id] > 1.9) delete level.doorAnim[id]; }
    const 压住 = (s, e) => e.x + e.w > s.x && e.x < s.x + s.w && e.y + e.h > s.y - 46 && e.y < s.y + 40;
    const ents = (game && game.entities) || [];
    for (const hk of level.hatchList) {
      const id = hk.ladderId === undefined ? hk.x : hk.ladderId;
      let 有人 = false;
      for (const e of ents) if (!e.dead && 压住(hk, e)) { 有人 = true; break; }
      if (有人) level.hatchAnim[id] = 0.45;        // 正有人顶盖：保持在打开
      else if (level.hatchAnim[id]) { level.hatchAnim[id] -= dt; if (level.hatchAnim[id] <= 0) delete level.hatchAnim[id]; }
    }
  }

  // ---------- 喂给 TrainDraw.scene 的 state 垫片 ----------
  // train-draw 从 S 读 17 项。除 opened/chasers/shots/player 之外全部有 ||/&& 兜底，
  // 这四项是裸读，缺一个就是运行时 TypeError，所以在这里一次性补齐。
  // opened 必须**从机关现算**，不能存快照：玩家按 E 关上一道门之后，画面上那道门就得合上，
  // 否则「画成开着 / 实际挡人」两本账又分家了（这正是本仓库反复禁止的半拉子状态）。
  function view(game, level) {
    const p = game && game.player;
    // opened 由 animTick（每帧 tick 调）从机关现算并存在关卡上，这里只读不改：
    // 「哪扇门现在开着」必须与碰撞用的是同一个集合，否则又会分家成两本账。
    const opened = level.opened;
    return {
      trainX: level.trainX, time: level.trainTime, px: 2, viewK: 1,
      day: level.day, dbg: level.dbg || {}, blackout: false,
      blastDoor: 0, doorAnim: level.doorAnim, hatchAnim: level.hatchAnim,
      opened, cpIdx: game && game.stage != null ? game.stage : 0,
      player: p ? { e: p } : { e: { x: level.spawnHuman.x, y: level.spawnHuman.y - 36, w: 22, h: 36 } },
      chasers: (game && game.entities ? game.entities : [])
        .filter(e => e.kind === 'zombie' && !e.dead).map(e => ({ e })),
      shots: (game && game.bullets ? game.bullets : []).map(b => ({ x: b.x, y: b.y, len: b.len || 14 })),
    };
  }

  return { build, tick, view, palette, kmh2px };
})();
if (typeof window !== 'undefined') window.TrainLevel = TrainLevel;
if (typeof module !== 'undefined' && module.exports) module.exports = TrainLevel;
