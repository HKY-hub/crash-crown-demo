// ============ 地形 / 多关卡（stage）生成 ============
// 世界为连续横版地形，按 x 边界划分为多个「关」；每关有自己的幽灵复活点、
// 刷新点（弹药箱/武器箱/能量胶囊/钥匙/水晶）、踩线触发器、机关与传送门。
const Level = (() => {
  let solids = [];
  let buildings = [];                       // 建筑视觉立面（不参与碰撞，ui.js 渲染）
  let escapeZone = null, spawnHuman = null, spawnZombie = null;
  let worldW = 0, groundTop = CFG.GROUND_TOP, cx = 0;
  let stages = [];
  // The active castle model owns the same collision arrays as this closure.
  // Clear it before building another map so support/export rules never leak.
  let castleCurrent = null;

  function rect(x, y, w, h, oneway, mat) { solids.push({ x, y, w, h, oneway: !!oneway, mat }); }
  function ground(w) { rect(cx, groundTop, w, CFG.WORLD_H - groundTop); cx += w; }
  function pit(span, platY) {
    if (platY) {
      const n = Math.ceil(span / 112);
      for (let i = 0; i < n; i++) rect(cx + 12 + i * 112, platY, 90, 14, true);
    }
    cx += span;
  }
  function stairsUp(n) {
    for (let i = 0; i < n; i++) {
      const top = groundTop - (i + 1) * 48;
      rect(cx, top, 64, CFG.WORLD_H - top);
      cx += 64;
    }
  }
  function stairsDown(n) {
    for (let i = 0; i < n; i++) {
      const top = groundTop - (n - i) * 48;
      rect(cx, top, 64, CFG.WORLD_H - top);
      cx += 64;
    }
  }
  // 材质墙段：任意宽高的墙（h≤120 保证 AI 可跳），opts.win 登记视觉窗
  function wallSeg(w, h, opts) {
    const mat = (opts && opts.mat) || 'brick';
    rect(cx, groundTop - h, w, h, false, mat);
    if (opts && opts.win) buildings.push({ type: 'wall', x: cx, w, h, mat, win: opts.win });
    cx += w;
  }
  // 复合建筑：物理矮层（≤120 可跳）+ 视觉立面（任意高）
  // cfg: { x, w, physH, visH, mat, doors:[{x,w}], windows:[{x,y,w,h}], posts:[{x,w}], gable }
  function building(cfg) {
    const x = cfg.x, w = cfg.w, physH = cfg.physH, visH = cfg.visH;
    const mat = cfg.mat || 'brick';
    const doors = cfg.doors || [];
    // 建筑 footprint 整块铺实地：矮层只填到 groundTop，其下 470~540 若不补地面，
    // 门洞就成了直通 KILL_Y 的无底洞（屋顶线上走到门洞会莫名掉虚空），
    // 楼体下方也会露出一条背景色的黑洞。
    rect(x, groundTop, w, CFG.WORLD_H - groundTop);
    let segStart = 0;
    for (const d of doors) {
      const dx = d.x, dw = d.w;
      if (dx > segStart) rect(x + segStart, groundTop - physH, dx - segStart, physH, false, mat);
      segStart = dx + dw;
    }
    if (segStart < w) rect(x + segStart, groundTop - physH, w - segStart, physH, false, mat);
    buildings.push({ type: 'building', x, w, physH, visH, mat, doors, windows: cfg.windows || [], posts: cfg.posts || [], gable: !!cfg.gable });
    cx = x + w;
  }
  // 站台棚：两根柱 + 顶棚 oneway（柱顶 110 → 跳 40 上棚顶）
  function stationCanopy(x, w) {
    rect(x, groundTop - 110, 60, 110, false, 'metal');
    rect(x + w - 60, groundTop - 110, 60, 110, false, 'metal');
    rect(x + 60, groundTop - 150, w - 120, 14, true);
    rect(x, groundTop, w, CFG.WORLD_H - groundTop);   // 棚下整块铺实地（同 building，否则两柱之间是无底洞）
    buildings.push({ type: 'canopy', x, w, physH: 110, visH: 150, mat: 'metal', windows: [], posts: [{ x: 0, w: 60 }, { x: w - 60, w: 60 }], gable: false });
    cx = x + w;
  }
  // 支撑柱：40 宽 ≤120 高（可跳越，柱列做拱廊）
  function pillar(h) { rect(cx, groundTop - h, 40, h, false, 'concrete'); cx += 40; }
  // 加油罩棚：4 根 16 宽细柱（≤110 可跳）+ 18 厚 oneway 顶棚 + 视觉招牌檐带
  // 与第三关 stationCanopy 的区别刻意做在剪影上：细柱 ×4 + 厚板，而不是粗柱 ×2 + 薄板
  function gasCanopy(x, w) {
    for (const c of [x + 8, x + 88, x + w - 104, x + w - 24]) rect(c, groundTop - 110, 16, 110, false, 'metal');
    rect(x, groundTop - 168, w, 18, true);
    buildings.push({ type: 'gasCanopy', x, w, physH: 110, visH: 168, mat: 'metal' });
  }
  // 公路招牌立柱：40 宽混凝土柱（可跳越）+ 上方纯视觉牌面（不参与碰撞）
  function signPost(x) {
    rect(x, groundTop - 120, 40, 120, false, 'concrete');
    buildings.push({ type: 'sign', x: x - 40, w: 120, physH: 120, visH: 260, mat: 'concrete' });
  }
  // crates 支持材质（默认木箱；metal=集装箱垛）
  function crates(rows, mat) {
    const cols = 3, ch = 40, cw = 52;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        rect(cx + c * cw, groundTop - (r + 1) * ch, cw, ch, false, mat || 'wood');
    cx += cols * cw;
  }
  // ---------- 对称 PvP 图布局 ----------
  // ground()/crates() 这类「向右累加」的写法，和硬编码坐标的门框必然对不上：
  // 攻防图曾累计到 3672px（worldW=3000），右半地形被画到世界外，两处「门框」成了
  // 210 高的实心死墙（跳跃极限 132），攻方走不到守方。这里改成显式坐标 + 自动镜像。
  // items 只声明左半（x 从中轴向左），mid=true 的元素本身居中、只摆一次。
  // it: { x, w?|cols?, rows?, h, mat, plat?, mid? }  plat=单向平台（厚 14）
  function symMap(W, items) {
    for (let x = 0; x < W; x += 250) ground(Math.min(250, W - x));   // 连续实地基：不存在无底洞
    for (const it of items) {
      const w = it.w || it.cols * 52;
      place(it, w);
      if (!it.mid) place({ ...it, x: W - it.x - w }, w);
    }
    function place(it, w) {
      if (it.plat) { rect(it.x, groundTop - it.h, w, 14, true, it.mat); return; }
      if (it.cols) {
        for (let r = 0; r < it.rows; r++)
          for (let c = 0; c < it.cols; c++)
            rect(it.x + c * 52, groundTop - (r + 1) * 40, 52, 40, false, it.mat);
        return;
      }
      rect(it.x, groundTop - it.h, w, it.h, false, it.mat);
    }
  }
  // 视觉立面（不参与碰撞）：让 120 高的物理门墩看起来是 210 高的塔楼
  function facade(x, w, physH, visH, mat, opts) {
    const o = opts || {};
    buildings.push({ type: 'building', x, w, physH, visH, mat, doors: o.doors || [],
      windows: o.windows || [], posts: o.posts || [], gable: !!o.gable });
  }

  // ---------- 六个主题关卡布局 ----------
  // 世界为连续横版（约 13900px），每关 2200~2500px；theme 驱动背景/配色/装饰风格
  // 机关配置：炮台(自动打幽灵) / 治疗站(人类回血) / 加速带(人类冲刺) / 陷阱(幽灵灼烧)
  //           风场(吹退幽灵) / 断桥(阻断追击) / 虚空门(幽灵瞬移) / 大门(幽灵破坏)
  function buildStages() {
    const S = [];
    // 落点吸附：机关/拾取物 y 自动贴到其下方可站立表面（木箱顶/台阶/坑/平台），杜绝配置悬空
    const snap = (o, h) => {
      if (!o || o.x == null) return;
      const top = groundBelow(o.x, CFG.GROUND_TOP, 30);
      if (top > 0) o.y = top - h;
    };
    const snapStage = st => {
      snap(st.spawnHuman, 40);
      for (const o of (st.respawns || [])) snap(o, 40);
      for (const o of (st.shortcutSpawns || [])) snap(o, 40);
      for (const o of (st.ammoBoxes || [])) snap(o, 40);
      for (const o of (st.weaponBoxes || [])) snap(o, 40);
      for (const o of (st.capsules || [])) snap(o, 40);
      for (const o of (st.keys || [])) snap(o, 40);
      for (const o of (st.crystals || [])) snap(o, 40);
      for (const m of (st.mechanisms || [])) {
        if (m.type === 'platform' || m.type === 'bridge' || m.type === 'lift' || m.type === 'rope') continue;
        snap(m, m.h);
      }
    };

    // Stage 0：隔离区（0 ~ 2174）—— 深夜城市（废弃公寓街区：两栋棚架式公寓楼 + 下水道 + 砖墙街）
    ground(180);
    building({ x: 180, w: 340, physH: 120, visH: 150, mat: 'brick',
      doors: [{ x: 120, w: 100 }],
      windows: [{ x: 30, y: 60, w: 24, h: 30 }, { x: 70, y: 60, w: 24, h: 30 }, { x: 230, y: 60, w: 24, h: 30 }] });
    ground(140);
    building({ x: 660, w: 340, physH: 120, visH: 150, mat: 'brick',
      doors: [{ x: 120, w: 100 }],
      windows: [{ x: 30, y: 60, w: 24, h: 30 }, { x: 70, y: 60, w: 24, h: 30 }, { x: 230, y: 60, w: 24, h: 30 }] });
    ground(140);
    pit(150, 350);
    ground(160);
    wallSeg(52, 95, { mat: 'brick', win: true });
    ground(280);
    crates(1, 'wood');
    ground(110);
    pit(80, 350);
    ground(46);                                  // 关底留实地段，传送门立于地面（不悬空于坑上）
    S.push({
      idx: 0, startX: 0, endX: cx, name: '第一关 · 隔离区', theme: 'city',
      spawnHuman: { x: 140, y: groundTop - 40 },
      respawns: [{ x: 1105, y: groundTop - 40 }],   // 实地上（坑 1140 前），亦是全局幽灵出生点
      shortcutSpawns: [],
      ammoBoxes: [{ x: 550, y: groundTop - 40 }],
      weaponBoxes: [{ x: 1050, y: groundTop - 40, weapon: 'adrenaline' }],
      capsules: [{ x: 1120, y: groundTop - 40 }],
      keys: [],                       // 第一关为守卫关：拾钥匙会误开 advanceOpen 绕过防守，故不放钥匙
      crystals: [],
      triggers: [
        { x: 1400, y: groundTop - 90, w: 60, h: 90, event: { respawn: 1, guard: 0 } },
      ],
      mechanisms: [
        { type: 'trap', x: 1600, y: groundTop - 40, w: 70, h: 40 },
        { type: 'turret', x: 1340, y: groundTop - 56, w: 56, h: 56, range: 340, rate: 1.1, dmg: 22 },
        { type: 'heal', x: 1720, y: groundTop - 36, w: 70, h: 36, hps: 12 },
        { type: 'booster', x: 2000, y: groundTop - 40, w: 100, h: 40, mul: 1.6, dur: 1.2 },
      ],
      portal: { x: cx - 44, y: groundTop - 60, w: 44, h: 60, need: 'guard', opened: false },
      guardTimer: 20,
      escapeZone: null,
      decor: [
        { type: 'lamp', x: 150 }, { type: 'barrel', x: 620 },
        { type: 'billboard', x: 1060 }, { type: 'lamp', x: 1420 }, { type: 'barrel', x: 1500 },
        { type: 'crate', x: 1700 }, { type: 'lamp', x: 1850 }, { type: 'barrel', x: 2050 },
      ],
    });

    // Stage 1：码头仓库（2174 ~ 4346）—— 黄昏港口（大仓库 + 集装箱垛 + 砖墙）
    stairsUp(2);
    ground(130);
    building({ x: 2432, w: 380, physH: 110, visH: 150, mat: 'metal',
      doors: [{ x: 90, w: 200 }],
      windows: [{ x: 20, y: 40, w: 40, h: 26 }, { x: 320, y: 40, w: 40, h: 26 }],
      posts: [{ x: 90, w: 10 }, { x: 280, w: 10 }], gable: true });
    ground(96);
    pit(170, 350);
    ground(284);                              // 坑整体西移 44px：门前可站带由 38 加宽到 82
    crates(2, 'metal');                      // 集装箱垛
    ground(220);
    wallSeg(52, 90, { mat: 'brick' });
    ground(200);
    ground(120);
    pit(130, 350);
    ground(106);
    S.push({
      idx: 1, startX: 2174, endX: cx, name: '第二关 · 码头仓库', theme: 'dock',
      spawnHuman: { x: 2350, y: groundTop - 40 },   // 楼梯后平地，避免出生在台阶实体内
      respawns: [{ x: 3140, y: groundTop - 40 }],
      shortcutSpawns: [{ x: 4260, y: groundTop - 40 }],   // 近路出口（坑后平地，门后）
      ammoBoxes: [],
      weaponBoxes: [{ x: 2830, y: groundTop - 40, weapon: 'rpg7' }],
      capsules: [],
      keys: [{ x: 3330, y: groundTop - 40 }],   // 墙后平地，玩家可达
      crystals: [{ x: 4280, y: groundTop - 40 }],   // 门后空地（门在 3160-3220）
      triggers: [
        { x: 3100, y: groundTop - 90, w: 60, h: 90, event: { respawn: 2, shortcut: true, close: true } },
      ],
      mechanisms: [
        { type: 'heal', x: 2400, y: groundTop - 36, w: 70, h: 36, hps: 12 },
        { type: 'turret', x: 3240, y: groundTop - 56, w: 56, h: 56, range: 320, rate: 1.2, dmg: 24 },
        { type: 'door', x: 3160, y: groundTop - 140, w: 60, h: 140, hp: 320, closed: true },   // 高门立于地面，需幽灵打碎
        { type: 'trap', x: 3600, y: groundTop - 40, w: 70, h: 40 },
      ],
      portal: { x: cx - 44, y: groundTop - 60, w: 44, h: 60, need: 'key', opened: false },
      guardTimer: 20,
      escapeZone: null,
      decor: [
        { type: 'container', x: 2300 }, { type: 'crane', x: 2850 }, { type: 'barrel', x: 2900 },
        { type: 'pallet', x: 3150 }, { type: 'container', x: 3220 }, { type: 'lamp', x: 3500 },
        { type: 'crane', x: 3800 }, { type: 'container', x: 4000 }, { type: 'lamp', x: 4250 },
      ],
    });

    // Stage 2：遗弃车站（4346 ~ 6780）—— 落日铁锈（站台棚 + 候车室砖墙）
    ground(300);
    stationCanopy(4646, 250);
    ground(190);
    wallSeg(52, 95, { mat: 'brick', win: true });
    ground(300);
    pit(160, 350);
    ground(300);
    crates(2, 'wood');
    ground(200);
    pit(150, 350);
    ground(64);
    crates(1, 'wood');
    ground(156);                                 // 关底留实地段，传送门立于地面（不压箱顶）
    S.push({
      idx: 2, startX: 4346, endX: cx, name: '第三关 · 遗弃车站', theme: 'station',
      spawnHuman: { x: 4400, y: groundTop - 40 },
      respawns: [{ x: 5200, y: groundTop - 40 }],
      shortcutSpawns: [],
      ammoBoxes: [],
      weaponBoxes: [{ x: 5180, y: groundTop - 40, weapon: 'flamer' }],
      capsules: [{ x: 5320, y: groundTop - 40 }],
      keys: [],
      crystals: [{ x: 5650, y: groundTop - 40 }],
      triggers: [
        { x: 5700, y: groundTop - 90, w: 60, h: 90, event: { respawn: 3, guard: 2 } },
        { x: 6100, y: groundTop - 90, w: 60, h: 90, event: { bridge: true } },
      ],
      mechanisms: [
        { type: 'wind', x: 4900, y: groundTop - 130, w: 140, h: 130, dir: -1, power: 200 },   // 棚后平地风场（棚柱上会悬空）
        { type: 'trap', x: 5400, y: groundTop - 40, w: 70, h: 40 },
        { type: 'turret', x: 6120, y: groundTop - 56, w: 56, h: 56, range: 330, rate: 1.1, dmg: 22 },
        { type: 'platform', x: 5920, y: groundTop - 150, w: 70, h: 16, span: 120, speed: 75 },   // 断桥：触发后坍塌
        { type: 'void', x: 6620, y: groundTop - 60, w: 40, h: 60, dur: 8, to: { x: 6680, y: groundTop - 40 } },
      ],
      portal: { x: cx - 44, y: groundTop - 60, w: 44, h: 60, need: 'guard', opened: false },
      guardTimer: 20,
      escapeZone: null,
      decor: [
        { type: 'rail', x: 4450 }, { type: 'signal', x: 4600 }, { type: 'train', x: 4750 },
        { type: 'rail', x: 5000 }, { type: 'bench', x: 5150 }, { type: 'luggage', x: 5600 },
        { type: 'sign', x: 5750 }, { type: 'rail', x: 6080 }, { type: 'bench', x: 6200 },
        { type: 'barrel', x: 6500 }, { type: 'signal', x: 6700 },
      ],
    });

    // Stage 3：地下隧道（6780 ~ 9096）—— 阴暗矿井（支撑柱廊 + 滑索跨坑捷径）
    ground(180);
    wallSeg(52, 104, { mat: 'concrete', win: true });   // 隧道口混凝土墙（视觉窗）
    ground(60); pillar(120); ground(60); pillar(120); ground(40);   // 拱廊双柱（240 宽）
    pit(150, 350);                            // 移动平台保留
    ground(180);                              // 平整段（钉住 endX=9096：拱廊区 240 + 此段 180）
    wallSeg(52, 96, { mat: 'concrete', win: true });   // 隧道中段混凝土墙（视觉窗）
    ground(200);
    crates(2, 'metal');
    ground(180);
    pit(140, 350);                            // 滑索跨坑：rope 传送高台（下方追加 oneway）
    rect(8200, groundTop - 190, 120, 14, true);   // 滑索落点高台（不占 cx，仅 rope 可达）
    ground(200);
    crates(1, 'wood');
    ground(120);
    pit(130, 350);
    ground(180);
    S.push({
      idx: 3, startX: 6780, endX: cx, name: '第四关 · 地下隧道', theme: 'tunnel',
      spawnHuman: { x: 6820, y: groundTop - 40 },   // 第一道矮墙后的平地
      respawns: [{ x: 7410, y: groundTop - 40 }],   // 平整段实地上（7402 起），避开坑沿平台
      shortcutSpawns: [{ x: 9000, y: groundTop - 40 }],   // 近路出口（隧道尽头）
      ammoBoxes: [{ x: 7700, y: groundTop - 40 }],
      weaponBoxes: [{ x: 7150, y: groundTop - 40, weapon: 'gl' }],
      capsules: [{ x: 8350, y: groundTop - 40 }],
      keys: [],
      crystals: [{ x: 8700, y: groundTop - 40 }],
      triggers: [
        { x: 8100, y: groundTop - 90, w: 60, h: 90, event: { respawn: 3, guard: 3 } },
      ],
      mechanisms: [
        { type: 'platform', x: 7300, y: groundTop - 150, w: 70, h: 16, span: 110, speed: 80 },   // 坑上移动平台
        { type: 'rope', x: 8190, y: groundTop - 40, w: 60, h: 40, to: { x: 8260, y: groundTop - 190 } },   // 滑索捷径：跨坑传送高台
        { type: 'trap', x: 8480, y: groundTop - 40, w: 70, h: 40 },
        { type: 'turret', x: 7660, y: groundTop - 56, w: 56, h: 56, range: 330, rate: 1.1, dmg: 22 },
        { type: 'heal', x: 8000, y: groundTop - 36, w: 70, h: 36, hps: 12 },
        { type: 'booster', x: 8970, y: groundTop - 40, w: 100, h: 40, mul: 1.6, dur: 1.2 },
      ],
      portal: { x: cx - 44, y: groundTop - 60, w: 44, h: 60, need: 'guard', opened: false },
      guardTimer: 20,
      escapeZone: null,
      decor: [
        { type: 'pipe', x: 6820 }, { type: 'slime', x: 6950 }, { type: 'wallLamp', x: 7100 },
        { type: 'pipe', x: 7300 }, { type: 'slime', x: 7500 }, { type: 'grate', x: 7680 },
        { type: 'wallLamp', x: 7900 }, { type: 'slime', x: 8150 }, { type: 'pipe', x: 8400 },
        { type: 'wallLamp', x: 8650 }, { type: 'slime', x: 8850 }, { type: 'wallLamp', x: 9050 },
      ],
    });

    // Stage 4：科研基地（9096 ~ 11338）—— 无菌实验室（双层走廊：二层 oneway 可从楼梯顶跳上）
    ground(200);
    stairsUp(2);
    ground(170);
    pit(150, 350);                            // platform 移动平台保留
    ground(220);
    stairsDown(2);
    ground(260);                              // 双走廊段：上放 oneway 二层走廊
    rect(10120, groundTop - 150, 260, 14, true);   // 二层走廊 oneway（从 stairsDown 顶 96 跳 54 上），不占 cx
    ground(220);
    pit(130, 350);
    crates(1, 'metal');
    ground(140);
    pit(140, 350);
    ground(200);
    S.push({
      idx: 4, startX: 9096, endX: cx, name: '第五关 · 科研基地', theme: 'lab',
      spawnHuman: { x: 9450, y: groundTop - 40 },   // 上行台阶后的平地
      respawns: [{ x: 9800, y: groundTop - 40 }],
      shortcutSpawns: [{ x: 11290, y: groundTop - 40 }],   // 近路出口（门后）
      ammoBoxes: [{ x: 10400, y: groundTop - 40 }],   // 走廊实地上（坑 10572 前）
      weaponBoxes: [{ x: 9880, y: groundTop - 40, weapon: 'xuanyuan' }],
      capsules: [{ x: 10500, y: groundTop - 40 }],
      keys: [{ x: 10250, y: groundTop - 40 }],   // 钥匙开传送门
      crystals: [{ x: 11235, y: groundTop - 40 }],
      triggers: [
        { x: 10900, y: groundTop - 90, w: 60, h: 90, event: { respawn: 4 } },
      ],
      mechanisms: [
        { type: 'platform', x: 9700, y: groundTop - 150, w: 70, h: 16, span: 120, speed: 80 },   // 坑上移动平台
        { type: 'trap', x: 10960, y: groundTop - 40, w: 70, h: 40 },
        { type: 'door', x: 10120, y: groundTop - 120, w: 60, h: 120, hp: 320, closed: true },   // 门后即钥匙
        { type: 'turret', x: 10290, y: groundTop - 56, w: 56, h: 56, range: 330, rate: 1.1, dmg: 22 },
        { type: 'heal', x: 11160, y: groundTop - 36, w: 70, h: 36, hps: 12 },
        { type: 'booster', x: 11255, y: groundTop - 40, w: 80, h: 40, mul: 1.6, dur: 1.2 },
      ],
      portal: { x: cx - 44, y: groundTop - 60, w: 44, h: 60, need: 'key', opened: false },
      guardTimer: 20,
      escapeZone: null,
      decor: [
        { type: 'tank', x: 9200 }, { type: 'equipment', x: 9400 }, { type: 'caution', x: 9550 },
        { type: 'glowpipe', x: 9700 }, { type: 'tank', x: 9850 }, { type: 'monitor', x: 10100 },
        { type: 'caution', x: 10350 }, { type: 'glowpipe', x: 10600 }, { type: 'tank', x: 10850 },
        { type: 'equipment', x: 11100 }, { type: 'caution', x: 11300 },
      ],
    });

    // Stage 5：最终防线（11338 ~ 13846）—— 燃烧堡垒 + 撤离点（混凝土外墙 + 金属箱垛纵深阵地）
    ground(220);
    wallSeg(52, 96, { mat: 'concrete', win: true });   // 堡垒外墙（混凝土材质 + 视觉窗）
    ground(120);
    wallSeg(52, 64, { mat: 'concrete' });              // 外墙内第一道矮护墙（64 高，AI 可跳）
    ground(48);
    crates(2, 'metal');                       // 金属箱垛
    ground(160);
    pit(150, 350);                            // platform 移动平台保留
    ground(264);
    wallSeg(52, 88, { mat: 'concrete', win: true });   // 纵深阵地第二道墙（避开复活点 12480 与坑沿）
    ground(84);                               // 纵深阵地段收尾（原 400 拆为 264+52+84，总宽不变）
    pit(130, 350);
    ground(200);
    ground(140);
    pit(140, 350);
    ground(200);
    const ezX = cx + 60;
    ground(340);
    S.push({
      idx: 5, startX: 11338, endX: cx, name: '第六关 · 最终防线', theme: 'finale',
      spawnHuman: { x: 11380, y: groundTop - 40 },   // 第一道矮墙后的平地
      respawns: [{ x: 12480, y: groundTop - 40 }],
      shortcutSpawns: [{ x: 13450, y: groundTop - 40 }],   // 近路出口
      ammoBoxes: [{ x: 13120, y: groundTop - 40 }],
      weaponBoxes: [{ x: 11680, y: groundTop - 40, weapon: 'laser' }],
      capsules: [{ x: 11500, y: groundTop - 40 }],
      keys: [],
      crystals: [{ x: 12320, y: groundTop - 40 }],
      triggers: [
        { x: 13350, y: groundTop - 90, w: 60, h: 90, event: { respawn: 5, guard: 5, finale: true } },
      ],
      mechanisms: [
        { type: 'platform', x: 12250, y: groundTop - 150, w: 70, h: 16, span: 120, speed: 80 },   // 坑上移动平台
        { type: 'door', x: 12300, y: groundTop - 120, w: 60, h: 120, hp: 350, closed: true },
        { type: 'trap', x: 12900, y: groundTop - 40, w: 60, h: 40 },
        { type: 'turret', x: 13100, y: groundTop - 56, w: 56, h: 56, range: 340, rate: 1.1, dmg: 22 },
        { type: 'heal', x: 13700, y: groundTop - 36, w: 70, h: 36, hps: 12 },
        { type: 'booster', x: 13750, y: groundTop - 40, w: 100, h: 40, mul: 1.6, dur: 1.2 },
      ],
      portal: null,
      guardTimer: 20,
      escapeZone: { x: ezX, y: groundTop - 64, w: 240, h: 64 },
      decor: [
        { type: 'barbed', x: 11400 }, { type: 'sandbag', x: 11650 }, { type: 'fire', x: 11900 },
        { type: 'barricade', x: 12050 }, { type: 'barbed', x: 12400 }, { type: 'redlamp', x: 12750 },
        { type: 'sandbag', x: 13000 }, { type: 'fire', x: 13250 }, { type: 'redlamp', x: 13500 },
        { type: 'sandbag', x: 13700 },
      ],
    });
    for (const st of S) snapStage(st);
    return S;
  }

  // ---------- 训练营关卡：平坦竞技场（靶场木桩 / 技能沙包） ----------
  // kind: 'range' 枪械靶场（右侧无敌木桩，武器在入场面板选择），'skill' 僵尸技能测试（中场 AI 人类沙包）
  function buildTraining(kind) {
    castleCurrent = null;
    solids = []; buildings = []; cx = 0; groundTop = CFG.GROUND_TOP; stages = [];
    const dummies = [];
    let weaponBoxes = [], W;
    if (kind === 'range') {
      // 靶场：平坦地面 + 玩家右侧不远处的 4 个无敌木桩（覆盖全部僵尸体型），不再摆放武器箱（武器由入场面板选择）
      ground(5660);
      W = cx;
      ['normal', 'sprinter', 'boomer', 'mother'].forEach((zt, i) =>
        dummies.push({ ztype: zt, x: 480 + i * 90, y: groundTop }));
    } else {
      // 技能测试：中场 4 个 AI 人类沙包
      ground(2800);
      W = cx;
      for (let i = 0; i < 4; i++) dummies.push({ human: true, x: 700 + i * 320, y: groundTop });
    }
    spawnHuman = { x: 140, y: groundTop - 40 };
    spawnZombie = { x: 1200, y: groundTop - 40 };
    escapeZone = null;                  // 训练营无撤离点
    worldW = W;
    stages = [{
      idx: 0, startX: 0, endX: W,
      name: '训练营 · ' + (kind === 'range' ? '枪械靶场' : '僵尸技能测试'), theme: 'test',
      spawnHuman, respawns: [spawnZombie], shortcutSpawns: [],
      ammoBoxes: [], weaponBoxes, capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 20, escapeZone: null,
      decor: [], dummies,
    }];
    return { solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop, stages, cliffRespawns: buildCliffRespawns() };
  }

  function build() {
    castleCurrent = null;
    solids = []; buildings = []; cx = 0; groundTop = CFG.GROUND_TOP;
    stages = buildStages();
    const last = stages[stages.length - 1];
    spawnHuman = { ...stages[0].spawnHuman };
    spawnZombie = { ...stages[0].respawns[0] };
    escapeZone = last.escapeZone;
    worldW = last.endX + 60;
    return { solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop, stages, cliffRespawns: buildCliffRespawns() };
  }

  // 编辑器导出/导入：兼容 stages 与旧格式
  function exportMap() {
    const map = {
      solids: solids.map(s => castleCurrent ? JSON.parse(JSON.stringify(s))
        : ({ x: s.x, y: s.y, w: s.w, h: s.h, oneway: s.oneway, mat: s.mat })),
      spawnHuman, spawnZombie, escapeZone, worldW, groundTop,
      buildings: buildings.map(b => JSON.parse(JSON.stringify(b))),
      stages: stages.map(s => JSON.parse(JSON.stringify(s))),
    };
    if (castleCurrent && castleCurrent.source) {
      map.kind = 'castle-fixed';
      map.castleFormat = 1;
      map.castleScale = castleCurrent.scaleFactor || 1;
      // Recompile the authored input, not the derived shaft-cut surfaces.
      // Serializing the latter would apply the compiler twice on reconnect.
      map.castleSource = JSON.parse(JSON.stringify(castleCurrent.originalSource || castleCurrent.source));
      map.worldH = castleCurrent.world.h;
      map.killY = castleCurrent.world.killY;
      map.cliffRespawns = [];
    }
    return map;
  }

  function load(map) {
    if (map && (map.kind === 'castle-fixed' || map.castleSource)) {
      if (!map.castleSource || !map.castleSource.world || !Array.isArray(map.castleSource.surfaces)) {
        throw new Error('固定古堡存档缺少结构源，不能退回旧地图');
      }
      const out = compileCastleSource(map.castleSource);
      return installCastle(map.castleScale && map.castleScale !== 1
        ? CastleMapScaleModel.scaleLevel(out, map.castleScale) : out);
    }
    castleCurrent = null;
    if (!map || !Array.isArray(map.solids)) return build();
    buildings = Array.isArray(map.buildings) ? map.buildings.map(b => ({ ...b })) : [];
    solids = map.solids.map(s => ({ x: +s.x || 0, y: +s.y || 0, w: Math.max(1, +s.w || 1), h: Math.max(1, +s.h || 1), oneway: !!s.oneway, mat: s.mat }));
    spawnHuman = map.spawnHuman || { x: 140, y: groundTop - 40 };
    spawnZombie = map.spawnZombie || { x: 780, y: groundTop - 40 };
    escapeZone = map.escapeZone || { x: 1200, y: groundTop - 64, w: 240, h: 64 };
    worldW = Math.max(400, map.worldW || 2000);
    groundTop = map.groundTop || CFG.GROUND_TOP;
    stages = Array.isArray(map.stages) && map.stages.length
      ? map.stages.map((s, i) => ({ idx: i, startX: s.startX || 0, endX: s.endX || 0, name: s.name || ('第' + (i + 1) + '关'),
          theme: s.theme || 'city', spawnHuman: s.spawnHuman || null, respawns: s.respawns || [], shortcutSpawns: s.shortcutSpawns || [],
          ammoBoxes: s.ammoBoxes || [], weaponBoxes: s.weaponBoxes || [], capsules: s.capsules || [],
          keys: s.keys || [], crystals: s.crystals || [], triggers: s.triggers || [], mechanisms: s.mechanisms || [],
          portal: s.portal || null, guardTimer: s.guardTimer || 20, escapeZone: s.escapeZone || null,
          decor: s.decor || [] }))
      : buildStagesFromOld(map);
    return { solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop, stages, cliffRespawns: buildCliffRespawns() };
  }

  // 旧格式地图（无 stages）时，构造单关占位
  function buildStagesFromOld(map) {
    return [{
      idx: 0, startX: 0, endX: worldW, name: '单关',
      spawnHuman, respawns: [spawnZombie], shortcutSpawns: [],
      ammoBoxes: [], weaponBoxes: [], capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 20, escapeZone,
      theme: 'city', decor: [],
    }];
  }

  // 实体可站立的地面最高点查询（用于 AI 感知脚下）
  function groundBelow(x, y, w) {
    if (castleCurrent) {
      let nearest = Infinity;
      for (const s of solids) {
        if (s.wall || s.kind === 'wall' || s.collisionKind === 'wall') continue;
        if (s.x + s.w <= x || s.x >= x + w) continue;
        if (y <= s.y && s.y < nearest) nearest = s.y;
      }
      return nearest === Infinity ? -1 : nearest;
    }
    let best = -1;
    for (const s of solids) {
      if (s.x + s.w <= x || s.x >= x + w) continue;
      if (y <= s.y && s.y > best) best = s.y;
    }
    return best;
  }

  // 悬崖复活点：扫描地面段（延伸到底部的实心地面）之间的空隙，空隙内无实心体即为悬崖；
  // 每处悬崖提供左岸/右岸两个统一就近传送点（人类/幽灵掉崖共用，不处死不等待）。
  function buildCliffRespawns() {
    if (castleCurrent) return [];
    const out = [];
    const grounds = solids
      .filter(s => !s.oneway && s.y >= groundTop - 2 && s.y + s.h >= CFG.WORLD_H - 2)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < grounds.length; i++) {
      const prev = grounds[i - 1], cur = grounds[i];
      const g0 = prev.x + prev.w, g1 = cur.x;
      if (g1 - g0 < 90) continue;                                   // 过窄不算悬崖（台阶/墙体接缝）
      const filled = solids.some(s => !s.oneway && s.x < g1 && s.x + s.w > g0);
      if (filled) continue;                                         // 空隙被台阶/墙填满 → 非悬崖
      out.push({ x: g0 - 34, y: groundTop - 40 });                  // 左岸复活点
      out.push({ x: g1 + 6, y: groundTop - 40 });                   // 右岸复活点
    }
    return out;
  }

  // 秘密实验基地：竞技场（战火英雄式对称 PvP 图，约 2400px 宽）
  // 左右对称：两端队伍出生区、中央多层平台 + 掩体 + 高低差 + 中央补给
  function buildArena() {
    castleCurrent = null;
    solids = []; buildings = []; cx = 0; groundTop = CFG.GROUND_TOP; stages = [];
    const W = 2400, AX = W / 2;                    // 中轴对称线

    // 全图连续实地基 + 左半元素（自动镜像到右半）；所有障碍 ≤120 高，人和 AI 都跳得过去
    symMap(W, [
      { cols: 3, rows: 2, x: 240, mat: 'wood' },            // 240-396 掩体堆（顶 390，可跳上）
      { plat: true, x: 420, w: 200, h: 150 },               // 420-620 高位狙击台（从箱顶跳 70 上）
      { x: 660, w: 52, h: 96, mat: 'concrete' },            // 660-712 左外墙
      { cols: 3, rows: 1, x: 760, mat: 'wood' },            // 760-916 中转掩体
      { plat: true, x: 940, w: 220, h: 150 },               // 940-1160 中层平台（左）
      { x: 1166, w: 68, h: 120, mat: 'concrete', mid: true },// 中央高掩体柱（左右各让 2px）
    ]);

    spawnHuman = { x: 120, y: groundTop - 40 };
    spawnZombie = { x: W - 120, y: groundTop - 40 };
    escapeZone = null;
    worldW = W;
    stages = [{
      idx: 0, startX: 0, endX: W, name: '竞技场 · 中距对枪', theme: 'city',
      spawnHuman, respawns: [
        { x: 120, y: groundTop }, { x: 200, y: groundTop },          // 红队出生区
        { x: W - 120, y: groundTop }, { x: W - 200, y: groundTop },  // 蓝队出生区
        { x: AX - 120, y: groundTop }, { x: AX + 120, y: groundTop },// 中央中转点
      ],
      shortcutSpawns: [],
      ammoBoxes: [{ x: AX - 120, y: groundTop - 40 }, { x: AX + 120, y: groundTop - 40 }],
      weaponBoxes: [{ x: 180, y: groundTop - 40, weapon: 'adrenaline' },
                    { x: W - 180, y: groundTop - 40, weapon: 'adrenaline' }],
      capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 20, escapeZone: null,
      decor: [],
    }];
    return { solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop, stages, cliffRespawns: buildCliffRespawns() };
  }

  // 战术攻防：镜像据点（彩虹六号式，约 3000px 宽）
  // 攻方(ATK)从左出生推进，守方(DEF)在右侧目标点固守；回合目标：攻方占点/安包，守方阻止
  // objList：双目标点位（secure=区域占领 / bomb=拆弹），每回合随机激活一个
  // fortifySpots：守方布防点（trap=绊线雷位 / wall=可加固墙段）
  function buildSiege() {
    castleCurrent = null;
    solids = []; buildings = []; cx = 0; groundTop = CFG.GROUND_TOP; stages = [];
    const W = 3000;
    // 左半声明 + 自动镜像（每个元素满足 x+w ≤ 1500），中轴 1500 即加油罩棚区
    // 实体障碍全部 ≤120 高（跳跃极限 132）；「门」是门墩之间的通行口，不是 210 高的死墙
    symMap(W, [
      { cols: 3, rows: 1, x: 260, mat: 'metal' },            // 260-416   攻方出生掩体（集装箱）
      { x: 470, w: 52, h: 88, mat: 'concrete' },             // 470-522   可跳掩体墙
      { plat: true, x: 880, w: 170, h: 145 },                // 880-1050  侧翼高台
      { x: 1060, w: 56, h: 48, mat: 'metal' },               // 1060-1116 门前缓冲坎（站上面再跳 72 上门墩）
      { x: 1140, w: 80, h: 120, mat: 'concrete' },           // 1140-1220 左门墩
      { x: 1412, w: 40, h: 64, mat: 'metal' },               // 1412-1452 油泵机（占点区内掩体，镜像到 1548）
                                                             // 刻意做矮宽：与罩棚 16 宽细柱拉开剪影，否则一排竖条分不清谁是谁
    ]);

    // 站房（破旧便利店）：物理 120 矮层 + 视觉 190 立面，中间 100 宽门洞是一条能穿过的侧路
    for (const bx of [560, W - 860]) {
      building({ x: bx, w: 300, physH: 120, visH: 190, mat: 'concrete',
        doors: [{ x: 100, w: 100 }],
        windows: [{ x: 24, y: 44, w: 40, h: 26 }, { x: 236, y: 44, w: 40, h: 26 }] });
    }
    gasCanopy(1270, 460);                                    // 中轴加油罩棚：四根细柱 + 18 厚顶棚（可架高的 perch）
    signPost(180); signPost(W - 220);                        // 两端公路招牌立柱：这张图的身份证

    // 攻防图的建筑质感：物理门墩只有 120 高（跳得过去），视觉立面补到 210，
    // 看起来才是真正拦得住人的塔楼 —— buildings 不参与碰撞，碰撞体一个没动。
    for (const fx of [1136, W - 1136 - 88]) {
      buildings.push({ type: 'building', x: fx, w: 88, physH: 120, visH: 210, mat: 'concrete',
        doors: [], windows: [{ x: 26, y: 148, w: 36, h: 24 }],
        posts: [{ x: 0, w: 8 }, { x: 80, w: 8 }], gable: false });
    }

    spawnHuman = { x: 120, y: groundTop - 40 };                 // 攻方出生
    spawnZombie = { x: W - 120, y: groundTop - 40 };            // 守方目标区
    escapeZone = null;
    worldW = W;
    stages = [{
      idx: 0, startX: 0, endX: W, name: '废弃服务区 · 攻防', theme: 'highway',
      spawnHuman, respawns: [
        { x: 120, y: groundTop }, { x: 200, y: groundTop },                 // 攻方出生区
        { x: W - 120, y: groundTop }, { x: W - 250, y: groundTop },         // 守方目标区
        { x: 2050, y: groundTop },                                          // 目标点近旁
      ],
      shortcutSpawns: [],
      ammoBoxes: [{ x: 1250, y: groundTop - 40 }, { x: W - 220, y: groundTop - 40 }],
      weaponBoxes: [], capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 20, escapeZone: null,
      decor: [{ type: 'truckwreck', x: 940 }, { type: 'truckwreck', x: W - 940 }],
    }];
    const objY = x => Level.groundBelow(x, groundTop, 40);
    const objList = [
      { kind: 'secure', name: '加油罩棚',   x: 1500, y: objY(1500) - 24, w: 180, hold: 6 },
      { kind: 'bomb',   name: '守方站房区', x: 2880, y: objY(2880) - 24, w: 200, hold: 6 },
    ];
    const fortifySpots = [
      { type: 'trap', x: 1250, y: groundTop - 8 },    // 左门内侧走廊
      { type: 'trap', x: 1500, y: groundTop - 8 },    // 争夺房间中部
      { type: 'trap', x: W - 1250, y: groundTop - 8 },// 右门内侧走廊
      { type: 'wall', x: 1140, y: groundTop - 120, w: 80, h: 120 },    // 左门墩墙段
      { type: 'wall', x: W - 1220, y: groundTop - 120, w: 80, h: 120 },// 右门墩墙段
    ];
    return { solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop, stages, cliffRespawns: buildCliffRespawns(), objList, fortifySpots };
  }

  // ---------- 别墅横截面 · 可玩关卡（战术攻防「别墅突袭」） ----------
  // 把 VillaGen 的模型翻成游戏碰撞体，规则：
  //  · 楼板只在「有梯段穿过的那一层」开洞（= 该梯段到达的上层），地下室楼板不开洞，
  //    否则一楼往下的楼梯会把脚下整层掏空。
  //  · 隔墙按门洞拆成左右两段 + 门楣，门洞本身不留实体，玩家/僵尸都能穿。
  //  · 楼梯逐阶做成实体，每阶升高 FH/7 ≈ 18px，远低于跳跃极限，AI 的
  //    「被挡住就起跳」逻辑能自动上下楼，不需要额外寻路。
  //  · 家具一律不参与碰撞：130 件家具全设成实体会把房间堵死，它只负责「看得懂这是房间」。
  //  · 可破坏墙走 solids + breakable 标记（不是既有的 door 机关 —— 那个只拦僵尸、人类随便穿）。
  function buildVilla(seed) {
    castleCurrent = null;
    if (typeof VillaGen === 'undefined') throw new Error('buildVilla 需要 villa-gen.js（请先于 level.js 加载）');
    solids = []; buildings = []; cx = 0; groundTop = CFG.GROUND_TOP; stages = [];
    const M = VillaGen.build(seed || 'VILLA-1', { density: 1, bx0: 250 });
    const WW = M.world.w, WH = M.world.h, BX0 = M.world.bx0, BX1 = M.world.bx1, GY = M.world.groundY;
    const SL = M.const.SLAB, RH = M.const.ROOM_H, DW = M.const.DOOR_W, DH = M.const.DOOR_H, FH = M.const.FH;
    const LV = {};
    M.levels.forEach(l => { LV[l.id] = l; });
    const topId = M.levels[M.levels.length - 1].id;

    // 院外地面：建筑范围内绝不铺，否则地下室被填实。标 bound：它是地板不是障碍
    solids.push({ x: 0, y: GY, w: BX0 - 16, h: WH - GY, oneway: false, mat: 'concrete', bound: true });
    solids.push({ x: BX1 + 16, y: GY, w: WW - (BX1 + 16), h: WH - GY, oneway: false, mat: 'concrete', bound: true });

    // 楼板开洞：只在「到达该层的那道梯段所在的梯带」上方开。
    // 不开洞就没有头顶净空 —— 梯段上行时头顶正好是上一层楼板的下沿，实测只剩 39px，
    // 38px 高的身体卡得刚好好，但完全跳不起来，于是永远爬不到上一层。
    // 也不能整格掏空（那样玩家在本层走到井格里就踩空），所以一条带对应一层洞。
    const shaftCut = {};
    for (const st of M.stairs) shaftCut[st.to] = [st.rail.x0, st.rail.x1];        // 不额外放边：放边会把两带之间的休息平台啃穿
    for (const sl of M.slabs) {
      if (sl.kind === 'foundation') continue;             // 纯视觉，留着会压掉地下室净高
      const cut = sl.kind === 'floor' ? shaftCut[sl.level] : null;
      if (!cut) { rect(sl.x, sl.y, sl.w, sl.h, false, 'concrete'); continue; }
      if (cut[0] > sl.x) rect(sl.x, sl.y, cut[0] - sl.x, sl.h, false, 'concrete');
      if (cut[1] < sl.x + sl.w) rect(cut[1], sl.y, sl.x + sl.w - cut[1], sl.h, false, 'concrete');
    }

    // 外墙（bound：几何闸门据此豁免「不可跳过的墙」判定，边界墙本来就不该被越过）
    const bodyTop = LV[topId].top - SL;
    const bodyBot = GY + FH + SL;
    // 前后两道外墙都要开一层门洞：生成器只在一侧放「入户门」，
    // 而攻方固定出生在左院，于是门开在右侧时整张图对攻方是封死的（自动机顶着外墙原地跳）。
    const doorTop = GY - 96, doorBot = GY;
    for (const w of M.walls) {
      if (w.kind !== 'ext') continue;
      if (doorTop > bodyTop) solids.push({ x: w.x, y: bodyTop, w: w.w, h: doorTop - bodyTop, oneway: false, mat: 'plaster', bound: true });
      if (doorBot < bodyBot) solids.push({ x: w.x, y: doorBot, w: w.w, h: bodyBot - doorBot, oneway: false, mat: 'plaster', bound: true });
    }
    // 前后都有入户门 → 任何一道门洞被砌死都还有别的路，可破坏墙因此一律做成房内掩体（见下方），
    // 不再在门洞上做文章。

    // 隔墙 + 门洞 + 可破坏墙。
    // 门洞宽 46 > 墙厚 14，所以「有门」等价于这一格边界整段没有墙，只剩门楣；
    // 可破坏墙因此不能只是「给墙换个材质」——它就是把门洞砌死，必须轰开才通。
    // 生成器已保证梯厅两侧不砌墙，房子永远有正常门可走，不会因没人拆墙而卡死。
    const doorAt = (lv, gx) => M.doors.find(d => d.level === lv && Math.abs(d.x + DW / 2 - gx) < 40);
    let brkN = 0;
    for (const lv of M.levels) {
      const top = lv.top;
      for (let i = 1; i < M.grid.count; i++) {
        const gx = M.grid.x[i], wx = gx - 7;
        const d = doorAt(lv.id, gx);
        if (!d) { rect(wx, top, 14, RH, false, 'stone'); continue; }
        if (RH - DH > 4) solids.push({ x: d.x, y: top, w: DW, h: RH - DH, oneway: false, mat: 'stone', bound: true });
      }
    }

    // 可破坏掩体：房间链是线性的，把任何一道门砌死都可能让不会开枪的 AI/僵尸永远绕不过去，
    // 所以「可破坏墙」做成房内的独立掩体（能轰开、也跳得过去），而不是封门的砖墙。
    // 生成器 roll 出来的门洞砖墙仍然保留，但它绝不落在「入户门 → 梯厅」这条唯一进场路上。
    for (const r of M.rooms) {
      if (brkN >= 4) break;
      if (r.w < 230 || r.type === 'shaft' || r.type === 'stairhall') continue;
      const d0 = M.doors.find(x => x.level === r.level && x.roomA === r.id);
      const ccx = Math.round(r.x + r.w / 2 - 7);
      if (d0 && Math.abs(ccx - (d0.x + DW / 2)) < 78) continue;        // 别堵门口
      const view = { x: ccx - 7, y: r.y, w: 14, h: 120, kind: 'breakable', level: r.level, hp: 140, broken: false };
      M.walls.push(view);
      brkN++;
      solids.push({ x: view.x, y: view.y, w: view.w, h: view.h, oneway: false, mat: 'plaster', bound: true,
        breakable: true, hp: 140, maxHp: 140, view });
    }

    // 楼梯台阶（stair 标记：下面的梯井净空裁剪要豁免它们）
    for (const st of M.stairs) {
      for (const s of st.steps) solids.push({ x: s.x, y: s.y, w: s.w, h: s.h, oneway: false, mat: 'wood', stair: true });
      solids.push({ x: st.landing.x, y: st.landing.y - 4, w: st.landing.w, h: 4, oneway: false, mat: 'wood', stair: true });
    }

    // 梯井净空：任何非台阶实体都不许伸进梯段的行进体积，否则把净空削成「跳不起来」的高度。
    // 实测踩坑：B1 入户门楣（y 484..508）压进梯带左沿 11px，玩家站上一级踏面起跳后
    // 头顶只剩 19px，于是原地反复弹跳、永远到不了二层 —— 台阶本身跳得上去，是门楣削掉的。
    const shaftVol = M.stairs.map(st => ({ x0: st.rail.x0, x1: st.rail.x1, y0: st.rail.yTop - SL, y1: st.rail.yBot }));
    const hitShaft = (x0, x1, y0, y1) =>
      shaftVol.some(v => x1 > v.x0 && x0 < v.x1 && y1 > v.y0 && y0 < v.y1);
    solids = solids.filter(s => !(s.breakable && hitShaft(s.x, s.x + s.w, s.y, s.y + s.h))).map(s => {
      if (s.stair) return s;
      let spans = [[s.x, s.x + s.w]];
      for (const v of shaftVol) {
        if (s.y + s.h <= v.y0 || s.y >= v.y1) continue;
        const next = [];
        for (const sp of spans) {
          if (sp[1] <= v.x0 || sp[0] >= v.x1) next.push(sp);
          else {
            if (sp[0] < v.x0) next.push([sp[0], v.x0]);
            if (sp[1] > v.x1) next.push([v.x1, sp[1]]);
          }
        }
        spans = next;
      }
      if (spans.length === 1 && spans[0][0] === s.x && spans[0][1] === s.x + s.w) return s;
      return spans.filter(sp => sp[1] - sp[0] >= 3)
        .map(sp => Object.assign({}, s, { x: Math.round(sp[0]), w: Math.round(sp[1] - sp[0]) }));
    }).flat();

    // 目标点：按用户要求「一层不刷包点」，B1 / F2 / F3 各一个
    const NAMES = { garage: '车库', cellar: '酒窖', storage: '储藏室', media: '影音室', workshop: '工具间',
      master: '主卧', kids: '儿童房', guest: '客房', bath: '浴室', closet: '衣帽间',
      studio: '画室', gym: '健身房', greenhouse: '温室', lounge: '休闲室', terrace: '露台' };
    const objList = [];
    for (const id of ['B1', 'F2', 'F3']) {
      if (!LV[id]) continue;
      const cand = M.rooms.filter(r => r.level === id && r.type !== 'shaft' && r.type !== 'stairhall' && r.w >= 170);
      const r = cand.find(x => x.w >= 190) || cand[0];
      if (!r) continue;
      const w = Math.min(160, r.w - 60);
      objList.push({
        kind: id === 'B1' ? 'bomb' : 'secure', hold: 6,
        x: Math.round(r.x + (r.w - w) / 2), y: r.floorY - 24, w, level: id,
        name: (NAMES[r.type] || r.type) + ' · ' + id,
      });
    }

    // 布防点：绊线雷落在各层门洞，加固墙落在可破坏隔墙
    const fortifySpots = [];
    for (const d of M.doors.filter(x => x.kind === 'interior')) {
      if (fortifySpots.filter(f => f.type === 'trap').length >= 6) break;
      fortifySpots.push({ type: 'trap', x: Math.round(d.x + DW / 2), y: d.y + d.h - 8 });
    }
    for (const s of solids) {
      if (!s.breakable) continue;
      if (fortifySpots.filter(f => f.type === 'wall').length >= 4) break;
      fortifySpots.push({ type: 'wall', x: s.x, y: s.y, w: s.w, h: s.h });
    }

    // 出生与复活点：攻方在左院，守方在顶层房内
    const yardY = GY - 40;
    // 每层错开取不同的房间当落点，否则六层复活点全挤在同一 x 上
    const inRoom = (lv, k) => {
      const rs = M.rooms.filter(r => r.level === lv && r.type !== 'shaft' && r.type !== 'stairhall');
      return rs.length ? rs[(k || 0) % rs.length] : M.rooms.find(r => r.level === lv);
    };
    const defRoom = inRoom(topId, 1) || inRoom('F2', 1);
    spawnHuman = { x: Math.round(BX0 / 2), y: yardY };
    spawnZombie = { x: Math.round(defRoom.x + defRoom.w / 2), y: defRoom.floorY - 40 };
    escapeZone = null;
    worldW = WW;
    const resp = [{ x: 120, y: yardY }, { x: WW - 120, y: yardY }];
    M.levels.forEach((lv, i) => {
      const r = inRoom(lv.id, i + 1);
      resp.push({ x: Math.round(r.x + r.w / 2), y: r.floorY - 40 });
    });
    stages = [{
      idx: 0, startX: 0, endX: WW, name: '别墅突袭 · 室内攻防', theme: 'highway',
      spawnHuman, respawns: resp, shortcutSpawns: [],
      ammoBoxes: [{ x: Math.round(BX0 + 60), y: LV.F1.y - 40 }, { x: Math.round(BX1 - 60), y: LV.F1.y - 40 }],
      weaponBoxes: [], capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 20, escapeZone: null, decor: [],
    }];
    const out = {
      solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop: GY, stages,
      cliffRespawns: [], objList, fortifySpots,
      villa: M, worldH: WH, killY: WH - 12,
    };
    return out;
  }

  // ---------- 疾驰列车 · 接进主循环 ----------
  // 翻译层在 js/train-level.js，那里写明三条翻译规则（检查点→stage 坚守+推进线、
  // 门→door 机关、梯子→level.ladders 待引擎补）。这里只做依赖守卫与闭包接线，
  // 照 installCastle 的写法：solids/stages/… 是主循环其它部分直接读的模块级变量，
  // 不接上就会出现「out 里有、游戏读不到」。
  function buildTrain(seed, opts) {
    castleCurrent = null;
    if (typeof TrainLevel === 'undefined')
      throw new Error('buildTrain 需要 train-level.js（请先于 level.js 加载）');
    const out = TrainLevel.build(seed || 'TRAIN-1', opts);
    solids = out.solids; buildings = out.buildings; stages = out.stages; cx = 0;
    groundTop = out.groundTop; worldW = out.worldW; escapeZone = out.escapeZone;
    spawnHuman = out.spawnHuman; spawnZombie = out.spawnZombie;
    return out;
  }

  // ---------- 阴森古堡 · 生化模式固定竞技地图 ----------
  // 单张手工坐标固定地图（非每局随机重排）。几何由 CastleGen 展开成 solids，这里只补上
  // 游戏主循环需要的 stage / 出生 / 补给外壳，并把 worldH / killY 交给纵向镜头契约
  // （game.js:2940 只有 worldH > CFG.WORLD_H 时才启用 camY，其余地图行为不变）。
  function compileCastleSource(data) {
    // The adapter owns source/model caching and shares its compiler with art.
    if (typeof CastleRebuildModel !== 'undefined') return CastleRebuildModel.buildLevel(data);
    if (typeof CastleCollisionCompiler !== 'undefined') return CastleCollisionCompiler.buildLevel(data);
    throw new Error('固定古堡需要 CastleRebuildModel 或 CastleCollisionCompiler');
  }
  function installCastle(out) {
    solids = out.solids; buildings = out.buildings; stages = out.stages; cx = 0;
    groundTop = out.groundTop; worldW = out.worldW; escapeZone = out.escapeZone;
    spawnHuman = out.spawnHuman; spawnZombie = out.spawnZombie;
    castleCurrent = out.castle;
    out.source = castleCurrent.source;
    out.cliffRespawns = [];
    return out;
  }
  function applyCastleScale(out) {
    if (!castleCurrent || !out.castle || out.castle.originalSource !== castleCurrent.originalSource) {
      throw new Error('只能缩放当前固定古堡');
    }
    return installCastle(out);
  }
  function buildCastle(seed) {
    // Art and exploration share the accepted fixed JSON. Keep the closure in
    // sync so groundBelow sees the same collision spans as the renderer.
    if (typeof CastleRebuildModel !== 'undefined' || typeof CastleCollisionCompiler !== 'undefined') {
      if (!window.CastleArtGeometry) throw new Error('古堡数据尚未加载，请等待 CastleArtDataReady');
      return installCastle(compileCastleSource(window.CastleArtGeometry));
    }
    if (typeof CastleGen === 'undefined') throw new Error('buildCastle 需要 castle-gen.js（请先于 level.js 加载）');
    solids = []; buildings = []; cx = 0; stages = [];
    const M = CastleGen.build(seed || 'CASTLE-1');
    castleCurrent = M;
    for (const s of M.solids) solids.push(s);
    groundTop = M.Y.F1;
    worldW = M.world.w;
    escapeZone = null;
    spawnHuman = { x: M.humanSpawns[0].x, y: M.humanSpawns[0].y };
    spawnZombie = { x: M.zombieSpawns[0].x, y: M.zombieSpawns[0].y };
    stages = [{
      idx: 0, startX: 0, endX: worldW, name: '阴森古堡 · 生化', theme: 'castle',
      spawnHuman, respawns: M.humanSpawns.map(p => ({ x: p.x, y: p.y })),
      shortcutSpawns: [], ammoBoxes: M.supplies.map(p => ({ x: p.x, y: p.y, kind: p.kind })),
      weaponBoxes: [], capsules: [], keys: [], crystals: [],
      triggers: [], mechanisms: [], portal: null, guardTimer: 0, escapeZone: null, decor: [],
    }];
    return {
      solids, buildings, escapeZone, spawnHuman, spawnZombie, worldW, groundTop, stages,
      cliffRespawns: [], castle: M, worldH: M.world.h, killY: M.world.killY,
    };
  }

  return { build, buildArena, buildSiege, buildVilla, buildTrain, buildCastle, buildTraining, load, exportMap, groundBelow, buildCliffRespawns, applyCastleScale };
})();
