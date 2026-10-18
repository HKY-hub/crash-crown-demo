// ============ 疾驰列车生化追击 · 编组与路线生成（数据层） ============
// 参考系约定（整张关卡的地基）：
//   碰撞与物理全部在「列车自身坐标系」里，是一个静止的世界；
//   列车的世界位置 trainX 只用于渲染沿途景物的滚动。
//   这样「站在地板上随车移动 / 起跳后落回原地 / 落地不瞬移」是结构性成立的，
//   而不是靠每帧给角色补一个车速 —— 加减速时用惯性力（-a·dt）体现即可。
// 生成顺序严格按规格：章节与车厢用途 → 主路线（可达性通过）→ 家具 → 破损 → 灯光装饰。
// 四条独立随机流 rig / fit / damage / world：改一种小装饰不会让整张编组变样。
const TrainGen = (() => {
  const CW = 960, CH = 540;
  // 20px = 1m（角色 36px ≈ 1.8m），所以一节 25~38m 的客车就是 500~760px
  // 全编组共用一条车顶线：车顶面一旦按车型浮动 16~22px，就会同时出现两类死锁 ——
  //   a) 接缝台按左车铺 → 右车车顶更低时接缝右缘成了 16px 侧墙（STUCK@36996）；
  //   b) 接缝台按较低车铺 → 通高车门的门楣戳进屋顶走道，机器人既撞不到「门」也绕不过去（STUCK@6869，8/20 seed）。
  // 真实编组里客车/行李车/发电车的顶面本来就基本平齐，高度差异放在长度、走道宽、内饰与色相上。
  const ROOF_H = 132;
  const FLOOR = 348;        // 车厢内部地板面
  const CEIL = 216;         // 车厢内部顶
  const ROOF = 202;         // 车顶可行走面
  const UNDER = 408;        // 车底维修道
  const WORLD_H = 560;
  const WALL = 12;          // 车体端墙厚

  // 通行上限由测试角色反推：跑速 275、JUMP_V 745、G 2100 → 顶点 132px、滞空 0.71s、水平射程 ≈195px。
  const LIM = {
    riser: 44,              // 单级可跳高差（走道障碍上限，也是「同层小落差直接跳、不必专门找换层口」的上限）
    ladder: 150,            // 车底支路爬梯速度 px/s（比跑慢，天然形成节奏）
    doorT: 0.22,            // 开门耗时
    jamT: 0.62,             // 卡死门：撞两下
    exit: 26,               // 爬到顶后跨出的距离
  };
  const MOVE = { w: 22, h: 36, speed: 275, chaserSpeed: 158, g: 2100, jumpV: 745, step: 7 };
  // ---------- 换层规则（2026-09-29 换层改造阶段二定稿，权威副本同步在 tools/_ph2_plan.js） ----------
  // 车内 ↔ 车顶只走「装在车厢端部、与真实车顶检修口相连的竖直爬梯」。
  // 阶梯塔已整体废除：它的碰撞体、斜向航点与绘制一并删除，不是隐藏美术。
  // 这里的每个数字都会被 buildRoute 之后的自检（verifyLinks）逐条验收，违反即重新规划而不是硬塞。
  const LAD = {
    band: 20,                 // 判定带 [x-2, x+18]，与 mover 的抓取条件严格同口径
    exitX: 26,                // = LIM.exit：出梯后 e.x 被设为 x + exitX，身子占 [x+26, x+48]
    exitW: 22,                // = MOVE.w
    sideClear: 44,            // 洞口左右各留这么多连续车顶，否则「检修口」＝断头路
    nearDoor: 34,             // 门后不许正对梯口
    mountA: 0.06, mountB: 0.20,   // 梯子只装在车厢端部 6%~20% 的设备带内，不切进家具场
    minRoofRun: 3, maxRoofRun: 5,     // 上了车顶就要有一段像样的车顶玩法；也不许一上去就下来
    minFloorRun: 4, maxFloorRun: 8,
    noAdjacent: 2,            // 两座梯之间至少隔 2 节车：爬梯是 break outer、一帧一人，防梯口排队
    maxChangeShare: 0.22,     // 换层车占比上限（拆塔前实测 26.0%）
    minFloorShare: 0.60,      // 地板车占比硬下限（拆塔前实测 54.6%）。设计目标 62%，
                            // 但 62% 有 seed 落不到（高架章按设计整段在车顶），硬闸门只卡 60%。
    // 高架桥章整段在车顶，是**设计意图**（合同阶段五：桥梁段以较长车顶追击为主），
    // 所以「最长车顶段」与「地板占比」两条都必须把它排除在外，否则规则会把想要的东西判成违规。
    longRoofWorld: 'viaduct',
    // 车种权重 = 一节该种车允许装检修口的概率。维修/货运/安保本就是设备与装卸区，讲得通；
    // 客车与卧铺不该每节都有通往车顶的口，需要时必须解释来源（事故后打开的应急检修口）。
    access: { maintenance: 1.00, freight: 0.90, security: 0.80, medical: 0.65, luggage: 0.55,
      locomotive: 0.45, diner: 0.30, coach: 0.18, sleeper: 0.14 },
    // 上面权重低的那几类不是「不该有口」，而是「有了也不能画成标配」。
    // 客车/卧铺/餐车通往车顶的口一律记成**应急检修口（事故后打开）**，
    // 在 link 上留 origin 字段，绘制层据此换画法（掀开的盖板 + 破封把手），
    // 闸门再按这个字段核对「功能身份 ↔ 画法」一致。
    tempAccess: { coach: 1, sleeper: 1, diner: 1 },
    // 安装窗口（车厢长度的相对区间）也按车种给。合同第七阶段第 3 条「不要把所有车厢画成
    // 同一种设备间」与第 6 条「爬梯不能全在相同相对位置，变化应由规则约束」是同一件事：
    // 之前不分车种、一律 [6%, 20%]（下车梯镜像到右端），实测 6 颗 seed 的 32 处梯口
    // 只落在 4 个十分位桶里，等于每节车的换层点都在同一个相对位置。
    // 现在按车种定窗口，九类车各占一段、互不重叠：设备类贴端墙，越靠近「旅客/生活」的车种
    // 越往车厢里走（客车/卧铺/餐车的应急口本就该在中段天窗方向），下车梯一律镜像到另一端。
    // 窗口上限刻意压在 0.44：我先试过把客车/货运放到真正的中部（0.30~0.68），
    // 结果 TR12-5271@60 节整列 STUCK@31757 —— 中部梯口会改变后续 rng 取号，
    // 把「随机梯口 + 既有走道净空」这套组合里潜伏的断路配置翻出来。中部窗口要等
    // 生成侧补上「摆完就验走得到、走不到就重摆」的闭环之后才能开，见交接文档阶段七遗留。
    mountWin: {
      locomotive: [0.04, 0.12], maintenance: [0.06, 0.16], security: [0.08, 0.18],
      medical: [0.10, 0.22], freight: [0.12, 0.26], luggage: [0.16, 0.30],
      coach: [0.20, 0.34], sleeper: [0.24, 0.38], diner: [0.28, 0.44],
    },
  };

  // 时长参数：玩家给「目标游玩分钟数」，生成器换算车厢数与换层密度（规格硬区间 48~72 节）。
  // 下面三个数都是量出来的，不是拍的（72 节、20 seed、同一份 mover）：
  //   纯通行（零犹豫、不打怪、不守点）        3:16~3:23  ≈ 2.7s/车   —— 物理下限
  //   真机按键跑通（只开门+被挡才跳，几乎不打） 4:42       ≈ 3.9s/车   —— 「一路狂奔」的下限
  //   lv1 完美机器人（边跑边打 + 守满 7 个据点）  7:04~7:27 ≈ 6.1s/车   —— 强制停留已含在内
  // 其中「据点坚守」是写进关卡数据的硬停留：7 个检查点 × 20~42 秒 = 240 秒，跑不掉。
  // 真人首次游玩还要加上读图、找路、走错层回头、阵亡重跑，按本项目既有经验 ×1.3~1.45，
  // 所以 8.3s/车（= 10 分钟 / 72 节）落在「lv1 实测 6.1」与「×1.45 ≈ 8.8」之间，是可核对的估计。
  // 车厢数已到规格上限 72，再往上加时长只能靠换层密度与据点时长，不能靠拉长列车。
  const SEC_PER_CAR = 8.3;
  function planForMinutes(m) {
    m = Math.max(9, Math.min(12, m || 10));
    return { cars: Math.max(48, Math.min(72, Math.round(m * 60 / SEC_PER_CAR))), change: 0.6 + Math.max(0, m - 10) * 0.18 };
  }
  function minutesForCars(n) { return n * SEC_PER_CAR / 60; }

  function makeRng(tag) {
    let s = 2166136261 >>> 0;
    const str = String(tag);
    for (let i = 0; i < str.length; i++) { s ^= str.charCodeAt(i); s = Math.imul(s, 16777619) >>> 0; }
    const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    return {
      next, int: (a, b) => a + Math.floor(next() * (b - a + 1)),
      real: (a, b) => a + next() * (b - a),
      pick: a => a[Math.floor(next() * a.length) % a.length],
      chance: p => next() < p,
      shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = r[i]; r[i] = r[j]; r[j] = t; } return r; },
      weighted(w) { const ks = Object.keys(w); let sum = 0; for (const k of ks) sum += w[k]; let r = next() * sum; for (const k of ks) { r -= w[k]; if (r <= 0) return k; } return ks[ks.length - 1]; },
    };
  }

  // ---------- 章节与车厢类型 ----------
  const CAR = {
    luggage: { name: '行李补给车', len: [560, 700], h: 128, aisle: 96, fit: ['crateStack', 'trunk', 'sackPile', 'handcart', 'shelfRow', 'strappedCase'], anchor: ['shelfRow', 'crateStack', 'handcart'], wear: 0.5, hue: [28, 8] },
    coach: { name: '普通客车', len: [600, 760], h: 132, aisle: 104, fit: ['seatRow', 'seatRow', 'rack', 'partition', 'luggageSet', 'poleGroup'], anchor: ['seatRow', 'rack'], wear: 0.45, hue: [200, 12] },
    sleeper: { name: '卧铺车', len: [600, 740], h: 132, aisle: 92, fit: ['berthUpper', 'berthLower', 'compartmentDoor', 'sideTable', 'curtainRail', 'personalKit'], anchor: ['berthLower', 'berthUpper'], wear: 0.5, hue: [42, 10] },
    diner: { name: '餐车', len: [640, 780], h: 136, aisle: 104, fit: ['dinerTable', 'barCounter', 'kitchenUnit', 'dishCabinet', 'stallPartition', 'potRack'], anchor: ['barCounter', 'dinerTable'], wear: 0.55, hue: [30, 14] },
    medical: { name: '医疗隔离车', len: [640, 800], h: 140, aisle: 100, fit: ['gurney', 'curtainTrack', 'monitorCart', 'medCabinet', 'bioBarrel', 'quarantineFrame'], anchor: ['gurney', 'curtainTrack'], wear: 0.72, hue: [168, 10] },
    freight: { name: '货运车', len: [660, 800], h: 148, aisle: 112, fit: ['palletStack', 'crateWall', 'strapPost', 'forkPallet', 'barrelRow', 'cargoNet'], anchor: ['crateWall', 'palletStack', 'barrelRow'], wear: 0.6, hue: [22, 6] },
    maintenance: { name: '维修车', len: [600, 720], h: 132, aisle: 96, fit: ['toolCabinet', 'panelBank', 'pipeRack', 'workbench2', 'generatorSet', 'hoseCoil'], anchor: ['workbench2', 'toolCabinet'], wear: 0.6, hue: [38, 8] },
    security: { name: '安保车', len: [600, 720], h: 132, aisle: 92, fit: ['checkGate', 'armorLocker', 'monitorRack', 'barricade2', 'cameraMast', 'cageSection'], anchor: ['cageSection', 'checkGate', 'barricade2'], wear: 0.66, hue: [210, 8] },
    locomotive: { name: '机车', len: [620, 760], h: 150, aisle: 100, fit: ['consoleBank', 'pilotSeat', 'throttleLever', 'pipeBundle2', 'cabWindow', '整流罩'], anchor: ['consoleBank', 'throttleLever'], wear: 0.4, hue: [220, 10] },
  };
  // 章节：车厢类型组合 + 外部世界 + 色彩 + 追击事件
  const CHAPTERS = [
    { key: 'rear', name: '车尾行李与补给区', world: 'edge', cars: ['luggage', 'luggage', 'freight'], light: 0.9, chase: 0.28, seal: 0.10, roof: 0.10 },
    { key: 'coach', name: '普通客车区', world: 'suburb', cars: ['coach', 'coach', 'luggage'], light: 0.85, chase: 0.5, seal: 0.16, roof: 0.12 },
    { key: 'sleeper', name: '卧铺与餐车区', world: 'field', cars: ['sleeper', 'diner', 'sleeper'], light: 0.7, chase: 0.58, seal: 0.26, roof: 0.26 },
    { key: 'medical', name: '医疗隔离区', world: 'river', cars: ['medical', 'medical', 'coach'], light: 0.62, chase: 0.42, seal: 0.34, roof: 0.18 },
    { key: 'bridge', name: '高架桥与车顶区', world: 'viaduct', cars: ['coach', 'freight', 'sleeper'], light: 0.95, chase: 0.72, seal: 0.30, roof: 0.78 },
    { key: 'cargo', name: '货运与维修区', world: 'industrial', cars: ['freight', 'maintenance', 'freight'], light: 0.55, chase: 0.66, seal: 0.34, roof: 0.34 },
    { key: 'tunnel', name: '隧道与安保区', world: 'tunnel', cars: ['security', 'maintenance', 'security'], light: 0.3, chase: 0.88, seal: 0.26, roof: 0.05 },
    // 机车不在池里：它由 buildRig 精确强制在最后一节（isHead 才画鼻部与排障器）。
    // 原来这里写了两份 locomotive，加上强制那一节就是「三台机车连挂」，而 CH7 去掉机车后
    // 只剩 security 一种，实测第 28~29 节连着四节安保车 —— 终局段一整排同一个盒子。
    { key: 'loco', name: '前段机车与终局', world: 'approach', cars: ['security', 'maintenance', 'coach'], light: 0.68, chase: 0.95, seal: 0.18, roof: 0.22 },
  ];

  // 阶段七：美术逐层随机序列。七条流各自独立派生，改任何一条都不牵动别层
  // （闸门用「换掉一条流的 salt、比其它层输出逐字段不变」来证明分离是真的）。
  const ART_STREAMS = ['livery', 'fit', 'wear', 'life', 'wreck', 'prop', 'lamp'];
  function artStreams(seed) {
    const o = {};
    for (const k of ART_STREAMS) o[k] = makeRng(seed + '|art|' + k).int(0, 999999);
    return o;
  }

  // ---------- 编组：章节 → 车厢序列 ----------
  function buildRig(seed, o) {
    const rng = makeRng(seed + '|rig');
    const cars = [];
    // 章节车厢数：先均分再随机挪动，总数严格等于请求值。
    // 之前是「每章 perChapter±1」，8 章的误差会累加，要 72 节实际给出 78 节 —— 直接违反规格的 48~72。
    const total = Math.max(CHAPTERS.length * 4, Math.min(96, Math.round(o.cars || 60)));
    const per = Math.floor(total / CHAPTERS.length), rem = total % CHAPTERS.length;
    const counts = new Array(CHAPTERS.length).fill(per);
    for (let k = 0; k < rem; k++) counts[k]++;
    for (let t = 0; t < total; t++) {
      const a = rng.int(0, CHAPTERS.length - 1), b = rng.int(0, CHAPTERS.length - 1);
      if (a !== b && counts[a] > 4 && counts[b] < per + 3) { counts[a]--; counts[b]++; }
    }
    let x = 0, chapter = 0;
    const list = [];
    for (let c = 0; c < CHAPTERS.length; c++) for (let i = 0; i < counts[c]; i++) list.push(c);
    for (let ci = 0; ci < list.length; ci++) {
      chapter = list[ci];
      const C = CHAPTERS[chapter];
      // 编组两端的身份：车尾第一节是尸潮通道（行李车），最后一节是驾驶室（机车）。
      // 机车**只留一节**：原来 CHAPTERS[7].cars 里塞了两份 locomotive，实测 TR00-0 尾部
      // 出现 3~4 节机车连挂，而鼻部/排障器只画在 isHead 那一节上 —— 前面那些「机车」
      // 外面看是普通盒子、里面又是一整排重复操纵台，读起来不像一列车的头。
      // 倒数第二节固定检修车：机车后面跟它的支援车，这才是机车该出现的位置。
      const 池 = C.cars.filter(t => t !== 'locomotive');
      const 可用 = 池.length ? 池 : C.cars;
      let type;
      if (ci === list.length - 1) type = 'locomotive';
      else if (ci === list.length - 2) {
        // 支援车优先检修车，但强制位也不能把同一类顶到三节以上（实测 TR00-0 曾出现
        // 「检修 检修 检修 机车」，因为前两节正好随机到了检修）
        const 候选 = ['maintenance', 'security', 'coach'].filter(t => CAR[t]);
        const 前 = cars.slice(-2).map(c => c.type);
        type = 候选.find(t => !(前[0] === t && 前[1] === t)) || (可用[0] || 'luggage');
      }
      else if (ci === 0) type = 'luggage';
      else {
        type = rng.pick(可用);
        // 同种车不得连着三节：原来 `ci < 2` 一律行李车，加上 CH0 自己就爱抽行李车，
        // 车尾数过去是「行李 行李 行李 货运 客车 客车」，一整段没有身份变化。
        if (cars.length >= 2 && cars[cars.length - 1].type === type && cars[cars.length - 2].type === type) {
          const 换 = 可用.filter(t => t !== type);
          type = rng.pick(换.length ? 换 : 可用);
        }
      }
      const T = CAR[type];
      const len = rng.int(T.len[0], T.len[1]);
      const seed = rng.int(0, 99999);
      const car = {
        i: cars.length, type, chapter, name: T.name, x0: x, len, x1: x + len,
        h: ROOF_H, aisle: T.aisle, hue: T.hue,
        // 编组两端的身份。绘制层用它给车头画司机室鼻部、给车尾画端折棚与尾灯 ——
        // 只作为**画法**的开关，不参与碰撞、路线或检查点（那些一律按 x 与构件算）。
        isHead: ci === list.length - 1, isRear: ci === 0,
        // 阶段七：稳定 ID 只由「车种 + 编组序号」决定 —— 换 seed 也还是「第 n 节客车」，
        // 回访比对、调试、存档都认它，不认对象身份。
        uid: type + '-' + String(cars.length).padStart(2, '0'),
        // 七条互不相干的随机流。之前家具变体、生活小件、破损、灯光相位全挤在 car.seed 上，
        // 调任何一层都会连带挪动别层的输出，「逐层生成」就是空话。
        artSeed: artStreams(seed),
        yFloor: FLOOR, yCeil: FLOOR - ROOF_H, yRoof: FLOOR - ROOF_H - 14,
        sealed: false, routeIn: 'FLOOR', routeOut: 'FLOOR',
        doors: [], ladders: [], links: [], decks: [], holes: [], roofBlocks: [], gantries: [],
        seams: [], furniture: [], damage: [], lights: [], props: [],
        seed: seed,
      };
      cars.push(car);
      x += len + 26;                                  // 26px 车厢连接处
    }
    // 机车顶就是控制室入口：最后一节强制走车内
    cars[cars.length - 1].routeOut = 'FLOOR';
    assignLivery(cars);
    return cars;
  }
  // 阶段七：运营涂装族。相邻几节属于同一个运营单元，外壳共享一族涂装；
  // 每章另有一节「地标车」用本章的色彩重点族。分组与族号都从本车的 livery 随机流取，
  // 所以换掉那条流会整族换装、而换别的流一件衣服都不动。完全不碰几何，通行账本不变。
  function assignLivery(cars) {
    let fam = 0, left = 0, chSeen = {};
    for (const car of cars) {
      const lv = (car.artSeed ? car.artSeed.livery : car.seed) | 0;
      if (left <= 0) { left = 3 + (lv % 3); fam = 1 + ((lv / 3 | 0) % 4); }
      left--;
      if (!chSeen[car.chapter]) { chSeen[car.chapter] = 1; car.landmark = true; car.livery = 1 + (car.chapter % 5); }
      else car.livery = fam;
    }
    return cars;
  }

  // ---------- 主路线与换层构件（2026-09-29 换层改造 · 阶段三） ----------
  // 层切换只发生在车厢内部装了竖直爬梯的位置，车厢边界永远同层 —— 不会出现「门后面是实心墙」。
  // 与旧版的根本差别不是「把塔画成梯子」，而是**换了决策方向**：
  //   旧版：先按概率定每节车走哪一层，再在换层车右端硬塞一座 150px 台阶塔。
  //   新版：先算「哪些车有资格装检修口」，层序列由它反推 —— 找不到合格车的换层直接放弃。
  // 于是「有换层 ⇔ 有爬梯 ⇔ 有真开洞 ⇔ 有盖板」是构造性成立的，不靠事后校验兜底。
  function linkX(car, toRoof, rnd) {
    const minSide = LAD.sideClear + 2;
    const win = LAD.mountWin[car.type] || [LAD.mountA, LAD.mountB];
    const a0 = Math.round(car.len * win[0]), a1 = Math.round(car.len * win[1]);
    const zL = [car.x0 + a0, car.x0 + a1];
    const zR = [car.x1 - a1 - LAD.band, car.x1 - a0 - LAD.band];
    const z = toRoof ? zL : zR;                      // 上车梯靠车厢入口端，下车梯靠出口端
    let x = Math.round(z[0] + (z[1] - z[0]) * rnd());
    if (car.doors.some(d => Math.abs(d.x - x) < LAD.nearDoor))
      x = Math.round(z[0] + (z[1] - z[0]) * rnd());
    return Math.max(car.x0 + minSide, Math.min(car.x1 - minSide - LAD.band, x));
  }
  function makeLink(car, x, from, to) {
    return {
      id: 'L' + car.i, car: car.i, kind: 'ladder', x, y0: car.yFloor, y1: car.yRoof, dir: 0,
      from, to, route: true, state: 'open',
      // 这口的**身份**：设备车是标配检修通道，客车/卧铺/餐车是事故后打开的应急口。
      // 只写进数据不算完成 —— 绘制层必须换画法，闸门必须核对，否则「解释来源」只是一句注释。
      origin: LAD.tempAccess && LAD.tempAccess[car.type] ? 'emergency' : 'service',
      mount: x - car.x0 < car.x1 - x ? 'bulkhead-L' : 'bulkhead-R',
      // 梯井左右沿的唯一真相。写成 x + band 会多算 2px（band 是宽度 20，左沿已经是 x-2），
      // 于是「顶板是否在梯井处断开」这类判据会差 2px 误判 —— 闸门就是这么报出 2 处「没断开」的。
      band0: x - 2, band1: x + LAD.band - 2,
      entry: { layer: from === 'ROOF' ? car.yRoof : car.yFloor, x0: x - 2, x1: x + LAD.band - 2 },
      exit: { layer: to === 'ROOF' ? car.yRoof : car.yFloor, x0: x + LAD.exitX, x1: x + LAD.exitX + LAD.exitW },
      opening: { x0: x - 2, x1: x + LAD.band - 2, plate: 'grate' },
      needs: { band: LAD.band, sideClear: LAD.sideClear, nearDoor: LAD.nearDoor, exitX: LAD.exitX },
    };
  }
  function buildRoute(seed, cars, o) {
    const n = cars.length, rng = makeRng(seed + '|rig2');
    const lay = new Array(n).fill('FLOOR');
    const force = c => CHAPTERS[c.chapter].world === 'tunnel' ? 'FLOOR'
      : (CHAPTERS[c.chapter].world === 'viaduct' ? 'ROOF' : null);
    // 车种资格 = 这节车适不适合开车顶检修口（维修/货运常见，客车/卧铺罕见）。
    // 光按权重随机不够：换层要「两把梯」，两把梯之间才是车顶段，所以节奏需要的是
    // **一对间距合法的资格车**，不是若干个散点。实测纯随机时 20 颗 seed 里 11 颗的客车章、
    // 10 颗的机车章整章零换层 —— 补进去的车根本凑不出一对。合同禁止「一条直线」。
    const eligible = cars.map(c => rng.chance(LAD.access[c.type] === undefined ? 0.2 : LAD.access[c.type]));
    const pairGap = [LAD.minFloorRun, LAD.maxRoofRun];      // 4~5：对车顶段与地板段都合法
    const hasPair = (a0, a1) => {
      for (let p = Math.max(1, a0); p + pairGap[0] <= a1; p++) {
        if (!eligible[p]) continue;
        for (let g = pairGap[0]; g <= pairGap[1] && p + g <= a1; g++) if (eligible[p + g]) return true;
      }
      return false;
    };
    {
      const span = {};
      for (let j = 0; j < n; j++) (span[cars[j].chapter] = span[cars[j].chapter] || [j, j])[1] = j;
      for (const [a0, a1] of Object.values(span)) {
        if (a1 - a0 + 1 < pairGap[0] + 1) continue;
        if (hasPair(a0, a1)) continue;
        const p = Math.max(1, a0), q = p + pairGap[0];
        if (q <= a1) { eligible[p] = true; eligible[q] = true; }
      }
    }
    // 1) 前向构造层序列：每段长度受 [min,max] 约束，换层点必须落在有资格的车上
    let i = 0, layer = 'FLOOR';
    const budget = Math.max(4, Math.round(n * LAD.maxChangeShare));
    const picks = [];
    for (let guard = 0; guard < 400 && i < n; guard++) {
      const minR = layer === 'ROOF' ? LAD.minRoofRun : LAD.minFloorRun;
      const maxR = layer === 'ROOF' ? LAD.maxRoofRun : LAD.maxFloorRun;
      let target = -1;
      // 窗口内没有合格车时**先放宽搜索**（最多多走 8 节）再考虑放弃。
      // 只按 [minR,maxR] 硬找的话，客车/卧铺这种低权重车种扎堆的章节会连续几次找不到换层点，
      // 上一版因此把车顶段并成了 25 节长的「一掠而过」，比塔时代还糟。
      const maxTry = maxR + 8;
      // 换层预算只掐「还可以再等一等」的那一侧：段长没到上限时可以先不换；一到上限就必须换。
      // 两头都超限都不行：车顶侧超长 = 整段跳过多节车厢、浪费车内美术；地板侧超长 = 长时间只在一层。
      // 早先把预算判断写在整段搜索外面（`if (picks.length < budget) { for d... }`），出预算后
      // 贪心彻底不再换层，实测铺出 18 节车顶段和 27 节地板段 —— 救援分支根本进不去。
      for (let d = minR; d <= maxTry; d++) {
        const j = i + d;
        if (j >= n - 1) break;                                  // 末节留给地板终点
        const want = layer === 'FLOOR' ? 'ROOF' : 'FLOOR';
        // 段长超过上限就进救援模式：车种资格与换层预算都让位给几何上限。
        // 客车(0.18)/卧铺(0.14) 扎堆时窗口内可能真的没有一辆「有资格」的车。
        const rescue = d >= maxR;
        if (!rescue && picks.length >= budget) break;
        // 判据方向别写反：要问的是「j 被章节钉死的那一层是不是恰好不是我要去的那层」。
        // 写成 `force(cars[j]) === want` 会变成「被钉死成 FLOOR 的车禁止我换成 FLOOR」，
        // 正好把隧道段放行成上车顶 —— 第一版就是这个反向条件，实测 69 节「隧道上车顶」。
        const fj = force(cars[j]);
        if ((fj && fj !== want) || (!eligible[j] && !rescue)) continue;
        if (picks.length && j - picks[picks.length - 1] < LAD.noAdjacent) continue;
        target = j; break;
      }
      if (target < 0) {                                           // 换不了：本层铺到下一个章节强制点
        let e = n - 1, fNext = null;
        for (let j = i; j < n; j++) { const f = force(cars[j]); if (f && f !== layer) { e = j - 1; fNext = f; break; } }
        e = Math.max(e, i);
        for (let j = i; j <= e; j++) lay[j] = layer;
        i = e + 1;
        // 必须切到章节要求的那一层再继续。少了这一行，进入隧道时 layer 还停在 ROOF，
        // 于是整段隧道被铺成车顶路线 —— 而隧道里根本没有车顶可走（渲染层整屏替换成洞壁），
        // 实测 20 个 seed 里累计 62 节车「隧道上车顶」。
        // 这个边界换层即使落在没资格的车上也照样要建梯：连通性优先于车种合理性。
        if (fNext) layer = fNext;
        continue;
      }
      for (let j = i; j < target; j++) lay[j] = layer;
      layer = layer === 'FLOOR' ? 'ROOF' : 'FLOOR';
      lay[target] = layer; picks.push(target);
      i = target + 1;
    }

    // 3) 修补：三个约束互相拉扯，必须交替迭代到收敛，不能一条固定顺序走完。
    //    上一版按「占比修补 → 章节覆盖 → 碎段合并」的顺序做，占比修补的结果被后两步改回车顶，
    //    实测有 seed 地板占比只有 59%（要求 ≥60%）却已经没有任何一步再管它。
    const stat = () => {
      let roofN = 0, tot = 0;
      for (let j = 0; j < n; j++) { if (CHAPTERS[cars[j].chapter].world === LAD.longRoofWorld) continue; tot++; if (lay[j] === 'ROOF') roofN++; }
      return tot ? (tot - roofN) / tot : 1;
    };
    const runs = () => {
      const out = [];
      for (let j = 0; j < n; j++) {
        if (j && lay[j] === lay[j - 1]) { out[out.length - 1][1] = j; continue; }
        out.push([j, j, lay[j]]);
      }
      return out;
    };
    // 不被章节钉死的连续车顶段。必须按「段内的自由部分」来量长度，不能按整条层段：
    // 高架章那 4~12 节是设计要上车顶的，它前后的自由车顶节跟它连成一条长段，
    // 早先只要段里含有高架车就整段豁免，实测 TR09/TR18 的医疗章因此 13 节连着走车顶。
    const freeRoofRuns = () => {
      const out = [];
      for (let j = 0; j < n; j++) {
        if (lay[j] !== 'ROOF' || force(cars[j])) continue;
        const s = j;
        while (j + 1 < n && lay[j + 1] === 'ROOF' && !force(cars[j + 1])) j++;
        out.push([s, j]);
      }
      return out;
    };
    // 自由段边界：从 j 往两侧扩到「同层且不被章节钉死」为止，用于判断能不能在段里切一刀
    const freeSpan = (j) => {
      let a = j; while (a > 0 && lay[a - 1] === lay[j] && !force(cars[a - 1])) a--;
      let b = j; while (b + 1 < n && lay[b + 1] === lay[j] && !force(cars[b + 1])) b++;
      return [a, b];
    };
    const chapterSpan = () => {
      const span = {};
      for (let j = 0; j < n; j++) (span[cars[j].chapter] = span[cars[j].chapter] || [j, j])[1] = j;
      return span;
    };
    // 层序列的硬锚点，三步合一，每次修补后统一重申：
    //   ① 章节钉死层（隧道无车顶、高架无车顶可走）
    //   ② 首节必须是地板 —— 出生点就在车尾站台上（M.spawn.y = FLOOR），
    //      而第 5 步的换层梯从 j=1 起建，lay[0]=ROOF 会出现「没有梯的换层」，直接断链。
    //   ③ 末节必须是地板 —— 终点必须落地板；原来它写在修补循环**外面**，
    //      于是循环最后一轮 coverChapters 补的车顶段又落回车顶，实测 1 例「首末未落地板」。
    const anchor = () => {
      for (let j = 0; j < n; j++) { const f = force(cars[j]); if (f) lay[j] = f; }
      lay[0] = 'FLOOR';
      for (let j = n - 1; j >= 0 && lay[j] === 'ROOF'; j--) lay[j] = 'FLOOR';
    };
    // 3a) 碎段合并：被章节覆盖逼出来的 1~2 节长段并回前一层（强制车不动）
    const mergeShort = () => {
      let changed = false;
      for (const [a, b, v] of runs()) {
        if (force(cars[a])) continue;
        const minR = v === 'ROOF' ? LAD.minRoofRun : LAD.minFloorRun;
        if (b - a + 1 >= minR || a === 0) continue;
        for (let k = a; k <= b; k++) if (!force(cars[k])) lay[k] = lay[a - 1];
        changed = true;
      }
      return changed;
    };
    // 3b) 章节节奏：除隧道与高架（这两章的层由设计钉死）外，每一章内部至少要有一次「车内↔车顶」。
    //     实测缺这一步时 20 颗 seed 里有 6~9 颗的客车章/卧铺章整章零换层 —— 合同禁止的「一条直线」。
    //     可行性按**全局段长**判，不按「本章车数 ≥ 最小两段之和」判：一段地板本来就可以跨章，
    //     所以 4 节长的行李章照样能在长地板段中间开出一段 3 节的车顶。原先按章长设门槛，
    //     实测 16 个「整章零换层」里有 12 个是被这个假门槛挡掉的。
    const coverChapters = () => {
      let changed = false;
      const span = chapterSpan();
      for (const ch of Object.keys(span).map(Number)) {
        const w = CHAPTERS[ch].world;
        if (w === 'tunnel' || w === LAD.longRoofWorld) continue;
        const [a0, a1] = span[ch];
        let forced = false;
        for (let j = a0; j <= a1; j++) if (force(cars[j])) { forced = true; break; }
        if (forced) continue;
        if (lay.slice(a0, a1 + 1).some((v, k) => k > 0 && v !== lay[a0 + k - 1])) continue;
        const orig = lay[a0];
        const want = orig === 'FLOOR' ? 'ROOF' : 'FLOOR';
        const lo = want === 'ROOF' ? LAD.minRoofRun : LAD.minFloorRun;
        const hi = want === 'ROOF' ? LAD.maxRoofRun : LAD.maxFloorRun;
        const need = orig === 'ROOF' ? LAD.minRoofRun : LAD.minFloorRun;
        const [s0, e0] = freeSpan(a0);
        const mid = Math.round((a0 + a1) / 2);
        // 找一对资格车 (p, q)：p 上建换层梯、q 上建回切梯，中间 [p, q) 就是 want 段。
        // 回切梯落在 q 而不是 q-1（第 5 步按 lay[j]!==lay[j-1] 在 j 上建梯），早先查错了一格，
        // 再叠上只允许 ±6 的窄窗口，实测补出来的段要么超 maxRoofRun 被 3d 压平、要么干脆找不到。
        let pick = null;
        // 两档：0 档要求两端都是「适合作检修口」的车种；1 档只要求不被章节钉死层。
        // 车种资格是我加的美学偏好，合同要求的节奏是硬约束 —— 偏好不能把约束顶掉。
        // 实测纯按资格时，12 个零换层章节里 5 个几何上明明装得下，只是凑不出一对资格车。
        for (let tier = 0; tier < 2 && !pick; tier++) {
          const ok = j => (tier === 1 || eligible[j]) && !force(cars[j]);
          // p 从 1 起：第 5 步只给 j>=1 建梯，锚点又强制 lay[0]=FLOOR，
          // 把换层点落在首节上等于「补了又消失」，实测会让修补循环转到上限仍不收敛。
          // q 允许越过 a1：要求的是「本章里出现换层点」，不是「一整趟车顶都装在本章里」；
          // 4~6 节长的短章若必须把车顶段连同两端残段都塞进本章，实测 12 个缺节奏的章里有 9 个是假的不可行。
          const headNeed = s0 === 0 ? 1 : need;      // 起点那一趟前面没有梯，3a 也豁免 a===0
          for (let p = Math.max(1, a0); p <= a1; p++) {
            if (!ok(p) || p - s0 < headNeed) continue;
            for (let g = lo; g <= hi; g++) {
              const q = p + g;
              if (q > e0 - need + 1) break;
              if (!ok(q)) continue;
              const score = Math.abs(p + g / 2 - mid);
              if (!pick || score < pick.score) pick = { score, p, q };
            }
          }
        }
        // 塞不下就放过：这一章太薄或两端残段不够长，属于阶段二段长规则本身的冲突，
        // 由 tools/_ph3_rhythm.js 逐章复算可行性把关（可塞却没塞才算漏洞）。
        if (!pick) continue;
        for (let j = pick.p; j < pick.q; j++) lay[j] = want;
        changed = true;
      }
      return changed;
    };
    const altOf = () => {
      const alt = {};
      for (let j = 1; j < n; j++) if (lay[j] !== lay[j - 1]) alt[cars[j].chapter] = (alt[cars[j].chapter] || 0) + 1;
      return alt;
    };
    // 在一段车顶中间「开洞」：切出 [s, t] 的地板，两侧仍各留 minRoofRun 节车顶。
    // 开洞比整段压平好得多 —— 压平会连带毁掉 3b 刚补出来的本章节奏，实测 ch1/ch3 的交替就是这么丢的。
    // 找洞位分两档：先按车种资格，凑不出就退到「只要求不被章节钉死层」（理由同 3b）。
    const carveFloor = (a, b) => {
      if (lay.filter((v, j) => j && v !== lay[j - 1]).length + 2 > Math.floor(n * LAD.maxChangeShare)) return null;
      const mid = (a + b) / 2;
      for (let tier = 0; tier < 2; tier++) {
        const ok = j => (tier === 1 || eligible[j]) && !force(cars[j]);
        let pick = null;
        for (let s = a + LAD.minRoofRun; s + LAD.minFloorRun - 1 <= b - LAD.minRoofRun; s++) {
          if (!ok(s)) continue;
          for (let len = LAD.maxFloorRun; len >= LAD.minFloorRun; len--) {
            const t = s + len - 1;
            if (t + 1 > b - LAD.minRoofRun + 1) continue;
            if (!ok(t + 1)) continue;
            const score = Math.abs(s + len / 2 - mid);
            if (!pick || score < pick.score) pick = { score, s, t };
          }
        }
        if (pick) return pick;
      }
      return null;
    };
    // 与 carveFloor 镜像：在一段地板中间开一段车顶（两侧地板各留 minFloorRun）。
    // 两侧的「地板余量」必须**越过本段**去数：紧挨着的隧道段被章节钉死在地板上，那同样是
    // 实打实的车内走法，不该在本段外面就当作零。原来只数本段内的自由节，4+3+4=11 使得
    // 9~10 节长的自由地板段永远开不了洞，而它的边界又挪不动（邻侧车顶段已在 maxRoofRun 上），
    // 实测 TR06-7622 整列只剩 6 次换层 < 50/8 —— 合同禁止的「一条直线」。
    const 地板余量 = (from, step) => {
      let m = 0;
      for (let j = from; j >= 0 && j < n && lay[j] === 'FLOOR'; j += step) m++;
      return m;
    };
    const carveRoof = (a, b) => {
      if (lay.filter((v, j) => j && v !== lay[j - 1]).length + 2 > Math.floor(n * LAD.maxChangeShare)) return null;
      const mid = (a + b) / 2;
      for (let tier = 0; tier < 2; tier++) {
        const ok = j => (tier === 1 || eligible[j]) && !force(cars[j]);
        let pick = null;
        for (let s = a; s <= b - LAD.minRoofRun; s++) {
          if (!ok(s) || 地板余量(s - 1, -1) < LAD.minFloorRun) continue;
          for (let len = LAD.maxRoofRun; len >= LAD.minRoofRun; len--) {
            const t = s + len - 1;
            if (t > b) continue;
            // 下车梯必须落在自由车上（不能落在被章节钉死层的车上），它自己算 1 节尾巴
            if (!ok(t + 1) || 1 + 地板余量(t + 2, 1) < LAD.minFloorRun) continue;
            const score = Math.abs(s + len / 2 - mid);
            if (!pick || score < pick.score) pick = { score, s, t };
          }
        }
        if (pick) return pick;
      }
      return null;
    };
    // 3c) 地板占比不足 → 削掉一段车顶。候选优先牺牲「本章还有其它交替」的段，
    //     没有这层偏好时它与 3b 互相抵消（3b 补一段车顶、3c 立刻压平），迭代不收敛。
    const fixShare = () => {
      if (stat() >= LAD.minFloorShare) return false;
      const alt = altOf();
      let best = null;
      for (const [a, b] of freeRoofRuns()) {
        const cand = { len: b - a + 1, a, b, keep: (alt[cars[a].chapter] || 0) > 1 ? 1 : 0 };
        if (!best || (cand.keep !== best.keep ? cand.keep > best.keep : cand.len > best.len)) best = cand;
      }
      if (!best || best.len < 2) return false;
      const c = carveFloor(best.a, best.b);
      const lo = c ? c.s : best.a, hi = c ? c.t : best.b;
      for (let j = lo; j <= hi; j++) lay[j] = 'FLOOR';
      return true;
    };
    // 3d) 自由车顶段长度封顶。贪心在「连续 8 节没有有资格的车」时会把车顶段一路铺下去，
    //     实测两颗 seed 出现 18 / 13 节长的车顶段 —— 那就是合同反对的「一掠而过好几节车厢」。
    const trimLong = () => {
      const alt = altOf();
      let off = null;
      for (const [a, b] of freeRoofRuns()) {
        if (b - a + 1 <= LAD.maxRoofRun) continue;
        // 排序：开得了洞 > 削了不毁掉本章唯一交替 > 更长。整段压平只会毁节奏，排最后。
        const c = carveFloor(a, b);
        const cand = { a, b, cut: c, score: (c ? 2 : 0) + ((alt[cars[a].chapter] || 0) > 1 ? 1 : 0), len: b - a + 1 };
        if (!off || cand.score > off.score || (cand.score === off.score && cand.len > off.len)) off = cand;
      }
      if (!off) return false;
      const lo = off.cut ? off.cut.s : off.a, hi = off.cut ? off.cut.t : off.b;
      for (let j = lo; j <= hi; j++) lay[j] = 'FLOOR';
      return true;
    };
    // 3e) 地板段长度封顶。「长时间只在一层」和「长时间只在车顶」是合同的两头，
    //     只封顶车顶会让贪心和占比修补把长段都堆到地板上（实测 10 颗 seed 出现 9~15 节连续车内）。
    //     先挪边界：把地板段两头的若干节改判成车顶，由相邻车顶段吸收（它们各自到 maxRoofRun 还有余量），
    //     这样不新增梯子、只换位置；吸收不了才在段中开一段车顶；都开不动才留着由闸门报出来。
    const trimFloor = () => {
      for (let j = 0; j < n; j++) {
        if (lay[j] !== 'FLOOR' || force(cars[j])) continue;
        const a = j; while (j + 1 < n && lay[j + 1] === 'FLOOR' && !force(cars[j + 1])) j++;
        const b = j;
        const over = b - a + 1 - LAD.maxFloorRun;
        if (over <= 0) continue;
        const slack = (side) => {                            // 邻侧自由车顶段还能吸收几节
          const k = side < 0 ? a - 1 : b + 1;
          if (k < 0 || k >= n || lay[k] !== 'ROOF' || force(cars[k])) return 0;
          const seg = freeSpan(k);
          return Math.max(0, LAD.maxRoofRun - (seg[1] - seg[0] + 1));
        };
        const sl = slack(-1), sr = slack(1);
        if (sl + sr >= over) {
          const x = Math.min(sl, over);
          for (let k = a; k < a + x; k++) lay[k] = 'ROOF';            // 左边界右移
          for (let k = 0; k < over - x; k++) lay[b - k] = 'ROOF';     // 右边界左移
          return true;
        }
        const c = carveRoof(a, b);
        if (c) { for (let k = c.s; k <= c.t; k++) lay[k] = 'ROOF'; return true; }
        // 这一段救不动就继续看下一段。原来在这里 `return false`，于是队首一段 9 节长的
        // 「挪不动也开不了洞」把后面 15~27 节长的整段跳过都挡掉了，实测 3 颗 seed 卡在收尾。
      }
      return false;
    };
    // 修补循环跑到上限也没停稳（约束互相拉扯、谁也不肯让）时，以最后一次 anchor() 的结果为准，
    // 残留违规由 _ph3_rule.js / _ph3_rhythm.js 报出来，不在这里静默兜住。
    let g = 0;
    for (; g < 120; g++) {
      const snap = lay.join('');
      mergeShort(); anchor();
      coverChapters(); anchor();
      const touched = fixShare() | trimLong() | trimFloor(); anchor();
      mergeShort(); anchor();
      if (!touched && lay.join('') === snap) break;
    }
    // 4) 回填每节的层字段（大量既有代码读 routeIn/routeOut/onRoof/sealed，字段语义不变）
    for (let j = 0; j < n; j++) {
      const car = cars[j], C = CHAPTERS[car.chapter];
      car.routeIn = j === 0 ? 'FLOOR' : lay[j - 1];
      car.routeOut = lay[j];
      car.onRoof = lay[j] === 'ROOF';
      car.routeLayer = lay[j];
      car.sealed = lay[j] !== 'FLOOR' || (car.routeIn === 'FLOOR' && rng.chance(C.seal * 0.35));
    }
    // 5) 由最终层序列反推爬梯：先装门（梯口要避门），再定位
    for (let j = 0; j < n; j++) {
      const car = cars[j];
      const dh = car.yFloor - car.yRoof;
      car.doors.push({ x: car.x1 + 6, y: car.yRoof, w: 14, h: dh, jammed: rng.chance(0.22), id: 'd' + j, side: 'R' });
      if (j === 0) car.doors.push({ x: car.x0 + 10, y: car.yRoof, w: 14, h: dh, jammed: false, id: 'd-entry', side: 'L' });
      if (j === n - 1) car.doors[car.doors.length - 1].id = 'd-final';
    }
    for (let j = 1; j < n; j++) {
      if (lay[j] === lay[j - 1]) continue;
      const car = cars[j];
      const L = makeLink(car, linkX(car, lay[j] === 'ROOF', () => rng.next()), lay[j - 1], lay[j]);
      car.links.push(L);
      car.ladders.push(L);            // 同一对象：mover 只认 car.ladders，路线只认 car.links，不分两份数据
    }
    // 落几何
    for (let i2 = 0; i2 < cars.length; i2++) {
      const car = cars[i2], C = CHAPTERS[car.chapter];
      const onRoof = car.routeIn === 'ROOF';
      // 通过台门在第 5 步就装好了（梯口净空要读到门，必须先行）。这里曾经是塔时代那份重复装门
      // 的代码：同一个连接处叠两道门，机器人顶住第一道、开后第二道照旧挡路（实测 0.867s 开门、
      // 四颗 seed 卡在车厢连接处 STUCK），而且它引用的还是外层残留的 i，id 全是错的。已删除。
      // 车内 / 车顶构件统一走一张「净空账本」：
      //   mustFree  = 门与梯口，任何构件都不能压（压住梯子 = 假通道，实测机器人顶在箱子上够不到梯子）
      //   headroom  = 走道障碍，起跳需要它上方 132px 内没有横板（床板正下方放箱子就永远跳不过去）
      const mustFree = [], headroom = [];
      for (const d of car.doors) mustFree.push([d.x - 26, d.x + d.w + 26]);
      for (const L of car.ladders) mustFree.push([L.x - 26, L.x + 30]);
      // 梯口让位区只有塔时代的四分之一多一点：[x-26, x+26+22+6]。
      // 旧塔要 [x0-250, x1+20]，那是 26% 编组长度被清空的来源。
      for (const L of car.links) mustFree.push([L.x - 26, L.x + LAD.exitX + LAD.exitW + 6]);
      const hits = (list, a, b) => list.some(k => a < k[1] && b > k[0]);

      if (!onRoof) {
        // 先钉「破地板 + 回梯」，再摆障碍与床板：梯子若后放，会正好落在已经摆好的
        // 走道箱子下面（实测两处 STUCK 都是货箱压在梯子上，人看得见梯子但够不到）。
        // 只给长车开洞：洞口(56~96) + 回梯让位(74) + 换层梯让位(80) 在一节 575px 的行李车上
        // 会把家具可放区压到只剩两段 54px，货架/箱堆/手推车全放不下，
        // 「关掉标签认车型」的最近邻分类就把 luggage 读成了 coach（实测 luggage-04/TR33-23757）。
        if (rng.chance(0.3) && i2 < cars.length - 2 && car.len >= 700) {
          const wd = rng.int(56, 96);
          let x = 0, ok = false;
          for (let tr = 0; tr < 16 && !ok; tr++) {
            x = Math.round(car.x0 + rng.real(110, Math.max(120, car.len - wd - 220)));
            ok = !hits(mustFree, x - 6, x + wd + 6);
          }
          if (ok) {
            car.holes.push({ x, w: wd });
            mustFree.push([x - 14, x + wd + 14]);
            // 回梯立在洞口内侧：爬上来就是地板边缘。留 20px 而不是原来的 12px ——
            // 判定带是 [x-2, x+18] 共 20px 宽，按 12px 内缩会让带的最右 6px 压进洞口外侧
            // 的实心地面板里（梯子画进地板边、爬梯人身半截埋进板里）。20px 保证整条梯井在洞内。
            const back = Math.round(x + wd - 20);
            car.ladders.push({ x: back, y0: UNDER, y1: car.yFloor, id: i2 + 'u' });
            // 让位区间必须盖到「出梯后身体所占的那一段」：爬上来的人落在 back + exit(26)，
            // 身子宽 22，所以右界要到 back + 48 再加一点余量。原来只让到 back + 34，
            // 实测 TRP7-55446 第6节一只装饰行李箱就正好立在梯口 4368 上，角色从箱子中间钻出来。
            mustFree.push([back - 30, back + LIM.exit + MOVE.w + 6]);
          }
        }
        const obst = rng.int(1, 3);                                // 走道障碍：可跳过的箱子/隔断
        for (let k = 0; k < obst; k++) {
          const h = rng.int(26, LIM.riser), w = rng.int(46, 92);
          let bx = 0, ok = false;
          for (let tr = 0; tr < 14 && !ok; tr++) {
            bx = Math.round(car.x0 + 90 + (car.len - 190) * ((k + rng.real(0.1, 0.9)) / obst));
            ok = !hits(mustFree, bx - 6, bx + w + 6) && !hits(headroom, bx - 6, bx + w + 6);
          }
          if (!ok) continue;
          car.decks.push({ x: bx, y: car.yFloor - h, w, h, mat: 'crate', kind: 'aisleObstacle' });
          headroom.push([bx - 26, bx + w + 26]);
        }
        if (rng.chance(0.42)) {                                    // 双层床板/货架：可站上去抄近路
          const w = rng.int(120, 210);
          let x = 0, ok = false;
          for (let tr = 0; tr < 14 && !ok; tr++) {
            x = Math.round(car.x0 + rng.real(50, Math.max(60, car.len - w - 50)));
            ok = !hits(mustFree, x - 6, x + w + 6) && !hits(headroom, x - 6, x + w + 6);
          }
          if (ok) car.decks.push({ x, y: car.yFloor - rng.int(62, 84), w, h: 14, mat: 'steel', kind: 'berth' });
        }
      } else {
        // 车顶：可跳过的设备 + 偶发低限高（逼回车内）
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) {
          const w = rng.int(40, 86), h = rng.int(24, LIM.riser);
          let x = 0, ok = false;
          for (let tr = 0; tr < 14 && !ok; tr++) {
            x = Math.round(car.x0 + 60 + (car.len - 140) * ((k + rng.real(0.1, 0.9)) / n));
            ok = !hits(mustFree, x - 26, x + w + 26) && !hits(headroom, x - 6, x + w + 6);
          }
          if (!ok) continue;
          car.roofBlocks.push({ x, w, h, kind: rng.pick(['duct', 'vent', 'tank', 'pipe']) });
          headroom.push([x - 26, x + w + 26]);
        }
        if (rng.chance(0.22)) {
          const gx = Math.round(car.x0 + car.len * rng.real(0.3, 0.7));
          if (!hits(mustFree, gx - 30, gx + 126) && !hits(headroom, gx - 30, gx + 126))
            car.gantries.push({ x: gx, w: 96 });
        }
      }
      // 连接处：只要前后同层就铺过桥板，铺在这一层自己的走面上。
      // 这一句曾经引用外层贪心的游标 i（循环变量改名成 i2 时漏改），于是**所有**接缝都不铺板：
      // 走车顶的人在每一节车厢连接处掉进 26px 的缝里，实测四颗 seed 卡死在连接处。
      // 同一处漏改还把「破地板 + 回梯」整段判成永远不成立（i 恒等于车数）。
      if (i2 < cars.length - 1) {
        const nx = cars[i2 + 1];
        if (car.routeOut === nx.routeIn) {
          // 接缝必须始终可走：26px 的「断裂风挡」看着像小装饰，实际是一个主路线上的坑 ——
          // 人不会「被挡住」所以不会起跳，直接掉进车底（回放验证器在每个接缝报 LAYER-MISMATCH）。
          // 断裂感交给下层破洞与车顶断口去做，那里有明确的起跳点与回梯。
          const sy = car.routeOut === 'FLOOR' ? car.yFloor : car.yRoof;
          car.seams.push({ x0: car.x1, x1: nx.x0, y: sy, broken: false, sag: rng.real(0.4, 1) });
        }
      }
    }
    return cars;
  }

  // ---------- 碰撞体 ----------
  function buildSolids(seed, cars, o) {  /* exported via repairRoute */
    const rng = makeRng(seed + '|rig3');
    const S = [];
    const push = (x, y, w, h, ex) => { if (w > 0 && h > 0) S.push(Object.assign({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), oneway: false, mat: 'steel' }, ex || {})); };
    for (const car of cars) {
      const roof = car.routeIn === 'ROOF' || car.routeOut === 'ROOF';
      // 地板：穿过地板的回梯同样要开洞
      const floorCut = car.holes.map(h => [h.x, h.x + h.w]).sort((a, b) => a[0] - b[0]);
      // 地板：破洞按洞切开，但上面必须铺一块临时跳板 ——
      // 主路线是「沿地板跑到车头」，洞把地板切断就等于把主路线切断（回放验证器在第一个洞就报
      // LAYER-MISMATCH：机器人掉进车底维修道，再也回不到 348 这条线上）。
      // 跳板让破洞变成「可选的下层支路」而不是必经的坑，视觉上仍然是塌穿的地板。
      let fx = car.x0;
      for (const cut of floorCut) {
        if (cut[0] > fx) push(fx, car.yFloor, cut[0] - fx, 12, { mat: 'floor', car: car.i, main: true });
        fx = Math.max(fx, cut[1]);
      }
      push(fx, car.yFloor, car.x1 - fx, 12, { mat: 'floor', car: car.i, main: true });
      for (const hole of car.holes) {
        // 跳板铺满整个洞口，等于把回梯的梯井也盖住：爬梯分支绕开碰撞求解，物理上不会卡，
        // 但画面上就是穿过一块实心木板站起来 —— 与车顶检修口同一类穿模，用同一个办法处理：
        // 在梯井那一段把跳板让开。让开的部分要么落在洞内（两侧仍被跳板/地板托住，
        // 22px 的角色身永远比 20px 的梯井宽，不会整只掉进去），要么本来就被埋在地面板下面。
        const xa = hole.x - 6, xb = hole.x + hole.w + 6;
        const shafts = car.ladders
          .filter(L => Math.min(L.y0, L.y1) < car.yFloor + 12 && Math.max(L.y0, L.y1) > car.yFloor + 3)
          .map(L => [L.x - 2, L.x + 18]).sort((p, q) => p[0] - q[0]);
        const plank = (a, b) => push(a, car.yFloor + 3, b - a, 7,
          { mat: 'wood', car: car.i, plank: true, main: true, hole: hole });
        let px0 = xa;
        for (const s of shafts) {
          const a = Math.max(px0, s[0]), b = Math.min(xb, s[1]);
          if (b <= a) continue;
          if (a > px0) plank(px0, a);
          px0 = Math.max(px0, b);
        }
        if (xb > px0) plank(px0, xb);
      }

      // 车顶行走面（只有需要走车顶的车才做实体，避免「看得见上不去」）
      // 顶板只在台阶塔的开口处断开，断口宽度恰好等于塔的进深：塔的最高一级踏面
      // 就是被断掉的那块板，踩上去与车顶齐平、可以直接跨出去，不需要检修口。
      if (roof) {
        // 爬到车顶的梯子必须在顶板上开真洞口。爬梯分支走 `break outer`、绕开全部碰撞求解，
        // 不开洞就等于让角色穿过一整块 12px 实心顶板站起来 —— 这正是判断标准⑥禁止的「穿模通道」。
        // 既有约定本来就是这么办的：穿过地板的回梯立在 car.holes 的真洞口内侧（:269-272）。
        const roofLads = car.links.filter(L => Math.min(L.y0, L.y1) <= car.yRoof + 2);
        // 必须按 x 排序后再断顶板（旧版踩过坑：乱序会先发射「到第一处」的整段板把后面的占地
        // 盖住，再算出负宽度）。塔已经不存在，顶板的断口现在只有一个来源：爬梯的梯井。
        const cuts = roofLads.map(L => [L.band0, L.band1]).sort((a, b) => a[0] - b[0]);
        let rx = car.x0;
        for (const c of cuts) {
          if (c[0] <= rx) { rx = Math.max(rx, c[1]); continue; }
          push(rx, car.yRoof, c[0] - rx, 12, { mat: 'paint', car: car.i, roof: true, main: true });
          rx = c[1];
        }
        push(rx, car.yRoof, car.x1 - rx, 12, { mat: 'paint', car: car.i, roof: true, main: true });
        // 洞口铺一块与车顶齐平的**单向**盖板，做法与地板破洞上那块跳板同源（:352）：
        // 沿车顶跑的玩家与追兵踩得住 ⇒ 主路线不被切断；从下往上爬时单向板自动放行。
        for (const L of roofLads)
          push(L.band0, car.yRoof, L.band1 - L.band0, 12, { mat: 'grate', car: car.i, roof: true, main: true,
            oneway: true, hatch: true, ladderId: L.id });
      }
      // 端墙不做实体：边界通行完全交给「门 + 门楣」，
      // 否则会出现「看着有门、门边一堵墙把路堵死」的假通道（实测机器人卡在车 0 左端）。
      // 车顶低限高：从车顶往下垂的横梁，人跳不过去也钻不过去 → 只能回车内的岔路代价
      for (const g of car.gantries) push(car.x0 + g.x - car.x0, car.yRoof - 34, g.w, 34, { mat: 'steel', car: car.i, gantry: true });
      for (const d of car.decks) push(d.x, d.y, d.w, d.h, { mat: d.mat === 'steel' ? 'steel' : 'crate', car: car.i, deck: true, kind: d.kind });
      for (const rb of car.roofBlocks) push(rb.x, car.yRoof - rb.h, rb.w, rb.h, { mat: 'paint', car: car.i, roofGear: true });
      for (const dr of car.doors)
        push(dr.x, dr.y, dr.w, dr.h, { mat: 'door', car: car.i, door: true, doorId: dr.id, jammed: dr.jammed, open: false });
      for (const s of car.seams) push(s.x0, s.y, s.x1 - s.x0, 10, { mat: 'rubber', car: car.i, seam: true, main: true });
      // 接缝处再补一条与地板同高的检修走道（不是主路线，main:false）。
      // 少了它，走错层的人会在车厢端头一脚踩空掉进车底维修道 —— 那里没有任何回到主路线的手段，
      // 实测普通玩家机器人就是这样卡在 x=4229 长达十几分钟：ROOF 段的车厢地板到车端就断了，
      // 而接缝板铺在 202 的车顶高度上。补上这条走道之后，走错层也能沿地板一路走到下一处换层梯归位。
      push(car.x1 - 2, FLOOR, 30, 12, { mat: 'grate', car: car.i, catwalk: true });
      // 车底维修道：整条连续，破洞掉下去还能往前绕
      push(car.x0 - 13, UNDER, car.len + 26, 10, { mat: 'grate', car: car.i, under: true });
      // 车顶路线的接缝断口：跳不过去也不至于死 —— 底下就是车底维修道
    }
    // 起点平台与终点撤离平台
    push(-420, FLOOR, 420, 14, { mat: 'concrete', platform: true, main: true });
    const last = cars[cars.length - 1];
    // 站台必须与车厢地板同高且无缝：高 6px 就变成一堵侧墙，
    // 玩家走出车尾时被侧面顶住、随即掉进车底空隙（实测在终点前 12px 掉出世界）。
    push(last.x1, FLOOR, 560, 14, { mat: 'concrete', platform: true, main: true, end: true });
    return S;
  }

  // ---------- 空间索引 ----------
  function indexLinks(M) {
    M.ladders = []; M.links = [];
    for (const c of M.cars) {
      for (const L of c.ladders) M.ladders.push(Object.assign({ car: c.i }, L));
      for (const L of c.links) M.links.push(Object.assign({ car: c.i }, L));
    }
  }
  function indexSolids(M) {
    const B = 160, nb = Math.ceil((M.trainLen + 1200) / B) + 2;
    const buckets = new Array(nb).fill(0).map(() => []);
    M.solids.forEach((s, i) => {
      const a = Math.max(0, Math.floor((s.x + 500) / B)), b = Math.min(nb - 1, Math.floor((s.x + s.w + 500) / B));
      for (let q = a; q <= b; q++) buckets[q].push(i);
    });
    M.buckets = buckets; M.bucketSize = B;
  }
  function nearSolids(M, x0, x1) {
    const B = M.bucketSize, a = Math.max(0, Math.floor((x0 + 500) / B)), b = Math.min(M.buckets.length - 1, Math.floor((x1 + 500) / B));
    const out = [];
    for (let q = a; q <= b; q++) for (const i of M.buckets[q]) out.push(M.solids[i]);
    return out;
  }

  // ---------- 移动器：与游戏同构的 AABB + 门 + 梯 ----------
  // 验证器与追击者共用同一份代码，所以「闸门里能走通」==「游戏里追得上」。
  function mover(M, e, dt, cmd, opened) {
    const solids = nearSolids(M, e.x - 200, e.x + e.w + 200);
    e.onLadder = false;
    // 梯子：与梯身重叠即可抓住。旧写法用 `e.y+e.h >= L.y0-6` 判定，
    // 意思是「脚必须在梯底附近」，于是站在车顶的人永远抓不到自己脚下那把梯子的顶端，
    // 从车顶进入最后一节车的机器人只能一路冲出车尾掉下去。
    outer:
    for (const car of M.cars) {
      if (e.x + e.w < car.x0 - 40 || e.x > car.x1 + 40) continue;
      for (const L of car.ladders) {
        if (e.x + e.w < L.x - 2 || e.x > L.x + 18) continue;
        if (e.y + e.h <= L.y1 - 2 || e.y >= L.y0 + 2) continue;      // 身体没压在梯身上
        if (!cmd.up && !cmd.down) continue;
        e.onLadder = true; e.vx = 0; e.vy = 0;
        if (cmd.up) {
          e.y -= LIM.ladder * dt;
          if (e.y + e.h <= L.y1) {
            e.y = L.y1 - e.h;
            // 爬到顶要「跨出」检修口而不是停在洞口：停在缺口上下一帧就直接掉回梯底
            e.x = L.x + LIM.exit; e.onGround = true; e.vy = 0;
          }
        } else {
          e.y += LIM.ladder * dt;
          if (e.y + e.h >= L.y0) { e.y = L.y0 - e.h; e.onGround = true; e.vy = 0; }
        }
        e.onGround = true;
        break outer;                       // 一帧只爬一把梯子
      }
    }
    if (!e.onLadder) {
      const target = cmd.dir * e.speed;
      e.vx += (target - e.vx) * Math.min(1, dt * 14);
      if (Math.abs(e.vx) < 1) e.vx = 0;
      if (cmd.jump && e.onGround) { e.vy = -MOVE.jumpV; e.onGround = false; }
      e.vy += MOVE.g * dt;
      if (e.vy > MOVE.g * 0 + 1250) e.vy = 1250;
      // X
      e.x += e.vx * dt;
      for (const s of solids) {
        if (s.oneway) continue;
        if (s.door && opened.has(s.doorId)) continue;
        if (e.x < s.x + s.w && e.x + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y) {
          // 路缘：相邻车厢顶板、地板与跳板之间那几像素的高差不算墙。碰撞用严格重叠，
          // 而「前方有墙」的探测留了 4px 容差 —— 4px 的接缝落差能挡住人却探不出来，
          // 实测机器人顶在车缝上原地不动到 STUCK。真人和追兵在这里都是直接迈上去。
          const lip = (e.y + e.h) - s.y;
          if (!s.door && e.onGround && lip >= -0.5 && lip <= MOVE.step) { e.y = s.y - e.h; e.vy = 0; continue; }
          // 最小穿透轴解算：只有「横向比纵向浅」才是真的从侧面撞上墙，才把 x 弹到实体边缘。
          // 否则一块 477px 宽的顶板会把只纵向压进去 5px 的人横向甩到板的另一头
          // （实测追兵 #3 单帧 x 6188 → 5711，一次没有任何梯子参与的换层 = 瞬移）。
          // 纵向更浅的交给下面的 Y 解算：该站上去就站上去，该被顶住就顶住。
          const ovx = Math.min(e.x + e.w, s.x + s.w) - Math.max(e.x, s.x);
          const ovy = Math.min(e.y + e.h, s.y + s.h) - Math.max(e.y, s.y);
          if (ovy < ovx) continue;
          if (e.vx > 0) e.x = s.x - e.w; else if (e.vx < 0) e.x = s.x + s.w;
          e.vx = 0; e.bumped = s.door ? s.doorId : 'wall';
        }
      }
      // Y
      const prevBottom = e.y + e.h;
      e.y += e.vy * dt;
      e.onGround = false;
      for (const s of solids) {
        // 开着的门必须在 Y 轴也一起失效：只在 X 轴跳过，就等于留了一块
        // 「看不见的地板」在门框里，人一走到门口就被判定成落在门顶上报（实测 feet 348→206）。
        if (s.door && opened.has(s.doorId)) continue;
        if (e.x >= s.x + s.w || e.x + e.w <= s.x) continue;
        if (e.y >= s.y + s.h || e.y + e.h <= s.y) continue;
        if (s.oneway) { if (e.vy > 0 && prevBottom <= s.y + 12) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; } continue; }
        if (e.vy > 0) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; } else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
      }
    }
    return e;
  }

  // 路线回放：把每节车的 routeLayer 展开成一条「 waypoint 序列」，
  // 验证器只按这条路线给输入（跑到梯口→按上/下→到高度→继续跑→撞门→开门）。
  // 反应式「被挡就跳」的机器人验证不了三层路线：它会在一把看得见的梯子前反复顶箱子，
  // 而那些情况既可能是路线真的断了、也可能只是策略太笨 —— 分不清就修不动。
  function buildRouteWalk(M) {
    const wp = [];
    M.routeBad = [];                       // 每次重走都重新收集：repairRoute 会 delete M.waypoints 触发重建
    for (const car of M.cars) {
      const yIn = car.routeIn === 'ROOF' ? car.yRoof : car.yFloor;
      const yOut = car.routeOut === 'ROOF' ? car.yRoof : car.yFloor;
      wp.push({ x: car.x0 + 30, y: yIn, car: car.i, kind: 'run' });
      if (yIn !== yOut) {
        // 换层口：梯口在当前层，出梯带在目标层，两端都与车体板齐平
        const L = car.links.find(q => q.from === car.routeIn && q.to === car.routeOut);
        if (!L) { car.routeBad = true; M.routeBad.push(car.i); continue; }
        // 换层只发**一个**航点，而且上/下的 x 不一样 —— 这是爬梯与台阶塔的根本区别：
        // mover 爬到顶会把 e.x 强制设为 x + LIM.exit（跨出洞口），而降到底只改 y、x 原地不动。
        // 所以「先走到梯口再爬」这种两段式航点是不成立的：身体一压到判定带就开始爬，
        // 第一个点永远等不到「同层 + 同 x」，实测机器人 TIMEOUT 在第 42 节。
        // 上梯点必须落在**抓梯判定带内**（L.x-2 ~ L.x+18），不能落在跨出洞口之后的落点上：
        // 原来取 exit 中心（L.x+26+11），机器人一旦从车顶掉回地板、正好停在那个 x 上，
        // 身体左缘 L.x+37 > L.x+18 → 再也抓不住梯，只能对着 33px 高的货台反复起跳，
        // 实测 TR03-3811 在 x=37176 原地抖到 14 分钟封顶（身后 37px 就是那把它需要的梯）。
        // 取 L.x+15：判定带内（差 3px），而爬完的落点 L.x+26 与它相距 11 < 14 → 照样能收点。
        const up = yOut < yIn;
        wp.push({ x: up ? L.x + 15 : L.x + 8, y: yOut, car: car.i,
          kind: up ? 'climb' : 'descend', link: L });
      }
      wp.push({ x: car.x1 + 13, y: yOut, car: car.i, kind: 'seam' });
    }
    wp.push({ x: M.trainLen + 240, y: FLOOR, car: M.cars.length - 1, kind: 'end' });
    return wp;
  }

  // 正前方那扇还没开的门：验证器与玩家/追兵共用，开门耗时才有同一个定义。
  // dir 决定「正前方」是哪一侧。原来写死只朝右看，在塔时代无所谓（换层塔就在路线右端），
  // 换成爬梯以后不行了：梯口平均六节车一个，掉到错误层之后能满足目标层的最近一把
  // 经常在身后（实测 TR00-0 在身后 503px），而连接处的隔断门正好横在回头路上。
  // 机器人往左顶住关门（bumped=门 id）、开门判据却只朝右看 → 永远不开、原地冻死。
  function doorInFront(M, e, opened, dir) {
    const back = dir < 0;
    return nearSolids(M, back ? e.x - 30 : e.x, back ? e.x + e.w : e.x + e.w + 30)
      .find(s => s.door && !opened.has(s.doorId) &&
        (back ? s.x + s.w > e.x - 22 && s.x < e.x + e.w : s.x < e.x + e.w + 22 && s.x + s.w > e.x) &&
        e.y + e.h > s.y && e.y < s.y + s.h);
  }

  // 车窗：纯装饰数据，不参与碰撞，由车厢自身 seed 派生 ——
  // 改破损强度、改家具都不会挪动窗格，否则「逐窗采样各自世界位置」没有稳定的观察点。
  function carWindows(car) {
    if (car.windows) return car.windows;
    const rng = makeRng(car.seed + '|win');
    const out = [];
    let x = car.x0 + 46;
    while (x + 74 < car.x1 - 40) {
      const w = rng.int(52, 78);
      out.push({ x, w, y: car.yCeil + 16, h: 46 });
      x += w + rng.int(26, 46);
    }
    car.windows = out;
    return out;
  }

  // 主路线在某个本地 x 处走的是哪一层：塔之前是 routeIn，塔之后是 routeOut。
  // 放置/重定位追兵必须按这个来，否则会出现「放在车顶上，而这一节车下车顶的那把梯已经在它身后」的死局
  // （实测 2 例 NO-ROUTE@feet186 全是这么造出来的，不是路线断）。
  function routeYAt(M, x) {
    const car = M.carAt(x);
    const L = car.links[0];
    const lay = (L && x >= L.x) ? car.routeOut : car.routeIn;
    return lay === 'ROOF' ? car.yRoof : FLOOR;
  }

  // ---------- 新手（首次游玩）模型参数 ----------
  // 这五个旋钮是**假设**，不是实测到的真人数据 —— 所以每一项都单独列出来、可以单独关掉，
  // 报告里给「关掉某一项省下多少秒」的 ablation，而不是把 lv3 的总时长当成真人结论。
  // 真人首次试玩仍然没有做过，这一条必须留在「未完成」里（见交接文档阶段八 §九 第 7 项）。
  const NOVICE = {
    speedK: 0.86,             // 不会一路贴最大速：普通玩家实际平均速度约满速的 86%
    pauseEvery: [3.5, 9],     // 读图停顿的间隔（秒）
    pauseRange: [0.3, 1.2],   // 每次停顿多久（秒）
    missGrab: 0.10,           // 到梯口一次没抓住的概率（要退回来重跑）
    grabBack: 0.35,           // 没抓住之后愣多久（秒）
    missJump: 0.15,           // 起跳时机差的概率（顶上路缘再重来）
    doorHesit: 0.35,          // 门前先愣一下的概率
    doorHesitT: 0.4,          // 愣多久（秒）
  };
  // over：把某一项关掉/改掉做 ablation；随机流独立于地图与战斗，重载不影响地形与家具
  function makeNovice(seed, over) {
    return Object.assign({ rng: makeRng(seed + '|novice') }, NOVICE, over || {});
  }

  // ---------- 每帧路线决策（验证器与游戏追兵共用同一份） ----------
  // 「闸门里能走通」必须等价于「游戏里追得上」。两边各写一份策略，早晚变成
  // 「闸门绿了但追兵在游戏里卡进墙里」，那种 bug 没法在无头环境复现，只能靠共用代码根除。
  // st.stopX 可选：追兵用它把目标压在玩家身后，其余逻辑完全一致。
  function routeState(M, e, o) {
    const opt = o || {};
    const wp = M.waypoints || (M.waypoints = buildRouteWalk(M));
    let wi = 0;
    while (wi < wp.length - 1 && wp[wi].x < e.x - 20) wi++;
    return { M, e, wp, wi, opened: opt.opened || new Set(), t: 0, f: 0, dir: 1, jump: 0, doorT: 0,
      wantUp: 0, wantDown: 0, stuck: 0, lastX: e.x, tail: [], perCar: new Array(M.cars.length).fill(0),
      stopX: opt.stopX, locked: opt.locked || null, hold: false, recDir: 0, recLad: null,
      novice: opt.novice || null, novHold: 0, novNext: 0, novWasUp: 0, novWasJ: 0, novWasD: 0,
      endX: opt.endX === undefined ? Infinity : opt.endX };
  }
  function routeStep(M, st, dt) {
    const e = st.e, wp = st.wp, opened = st.opened;
    st.t += dt; st.f++;
    st.perCar[M.carAt(e.x).i] += dt;
    const snap = () => ({ f: st.f, x: Math.round(e.x), feet: Math.round(e.y + e.h),
      g: e.onGround ? 1 : 0, vy: Math.round(e.vy), lad: e.onLadder ? 1 : 0,
      u: st.wantUp ? 1 : 0, d: st.wantDown ? 1 : 0, j: st.jump, b: e.bumped === 'wall' ? 'W' : (e.bumped ? 'D' : ''),
      car: M.carAt(e.x).i, opened: opened.size });
    const fail = reason => { st.bad = { reason, x: Math.round(e.x), car: M.carAt(e.x).i, t: +st.t.toFixed(1),
      wp: wp[Math.min(st.wi, wp.length - 1)], scene: scene(M, e, st.tail) }; return reason; };
    const feet = e.y + e.h;
    while (st.wi < wp.length - 1 && Math.abs(e.x - wp[st.wi].x) < 14 && Math.abs(feet - wp[st.wi].y) < 12) st.wi++;
    const W = wp[Math.min(st.wi, wp.length - 1)];
    const tx = st.stopX === undefined ? W.x : Math.min(W.x, st.stopX);

    // 换层策略：统一车顶线之后，「朝右跑 + 被挡就跳一级 + 到口就抓梯上下」已经覆盖全部正常走法。
    // 这里只补一种真的会走死的情形：换层构件被甩在身后、自己还停在它的尾层、
    // 而目标层是它的头层（横风或急刹把人推回去、或掉到错误层）→ 退回口那里再走一次。
    // 必须带「前方 1400px 内还有别的构件能满足目标层」这个前置守卫：
    // 少了它，机器人会把自己刚爬上来的那座梯当成「要退回去的梯」倒着走下去（实测 19/20 seed STUCK）。
    // 朝向必须在「前面有没有门」之前定下来：门判据看的是哪一侧，取决于这一步想往哪走。
    function pickFacing() {
      if (Math.abs(feet - W.y) <= 12) { st.recDir = 0; st.recLad = null; return tx > e.x ? 1 : -1; }
      // 腾空的那几十帧里 feet 谁都不等：behind/ahead 那两条判据是拿脚层去比对构件端点的，
      // 于是跳起来的一瞬间判据全体失灵、方向被翻回「朝航点」，人就在空中被推回右边
      // （实测 TR00-0 在 3300↔3530 之间来回弹 90 秒，一次都没退到身后那把梯）。
      // 所以空中沿用上一次的落地决策，落回地面再重算。
      if (!e.onGround && st.recDir) return st.recDir;
      // 身后/前方各自找「能把我送到目标层」的构件，然后**按距离取最近的那个**。
      // 两头都要在：只问「前方有没有」→ 身后 37px 就是那把我需要的梯时它照样朝右顶死；
      // 只要「有就回头」→ 机器人把自己刚爬上来的那座梯当目标倒着走下去（实测 19/20 seed STUCK）。
      // 搜索**不设距离上限**（原来写死身后 900／前方 1400）：116 个实测梯间距的分布是
      // min=3071 / p50=3411 / max=12755，那两个上限比任何一把真梯都近，等于「回头找回错过的换层口」
      // 这条策略在绝大多数位置上是死代码。实测把人放到 TR00-0 x=5013 的地板上，
      // 身后 1969px 就是能上到目标层的梯，它却原地抖 13 秒判 STUCK —— 合同明令禁止的那种抖动。
      // 判据从 M.links 换成 M.ladders：梯身本来就是双向可爬的，而 links 记录是单向的
      // （原来 ahead 只比对口端、不比对起始端，于是会选中一把「我在地板、它从车顶开始下」的梯，
      // 朝那把走 4000px 走到死的断头路上）。
      // 梯子两端：y0 是低端（地板 348）、y1 是高端（车顶 202）。
      // 「能用」= 从我这一头上梯，另一头正好落在目标层。
      // 梯子的两端里「我这一头」是 lo 还是 hi：用两端的**中点**判，不用 feet 去逐端比对。
      // 原来写成 `|梯端 - feet| < 6`，于是人踩在货箱上（feet=310）时，身后那把
      // 「348→202」的梯既不满足 348 也不满足 202，判据全体失灵 → 决策翻回「朝航点走」，
      // 而朝航点走又会翻回来 —— 实测 TR00-0 落在 x=17800 时，机器人在 17486↔17589
      // 之间来回走了 90 秒，一次都没上梯（C6 抓到的）。
      const wt = W.y === undefined ? FLOOR : W.y;                       // 目标层（ty 在下面才算，这里不能引用）
      // 注意 y 轴向下：lo（小 y）是**车顶那一头**，hi（大 y）是**地板那一头**。
      // 所以「脚在 hi 一侧」时，上梯要去的对岸是 lo；反过来是 hi。写反过一次，
      // 结果 usable 在全图任何位置都返回 false（等价于「永远找不到回头梯」）。
      const usable = L => {
        const lo = Math.min(L.y0, L.y1), hi = Math.max(L.y0, L.y1);
        return Math.abs((feet >= (lo + hi) / 2 ? lo : hi) - wt) < 6;
      };
      // 定下「去哪把梯」之后要**认死它**，中途踩上货箱、跳起来、被顶一下都不改主意：
      // 只有真的到口（或层已经对上）才放手。否则上面那条判据修好了，逐帧重算照样会抖。
      if (st.recLad) {
        const R = st.recLad;
        if (Math.abs(e.x - R.x) < LAD.band + MOVE.w) st.recLad = null;
        else { st.recDir = e.x > R.x ? -1 : 1; return st.recDir; }
      }
      let behind = null, ahead = null;
      for (const L of M.ladders) {
        if (!usable(L)) continue;
        // 两条边界必须**互补**：身后 = 整把梯都在身体左边，前方 = 整把梯都在身体右边，
        // 压在身上/身体跨着它的那把交给下面的 wantUp/wantDown 抓梯分支处理。
        // 原来身后那条多减了一个 LAD.band，于是「梯在身后 20px」既不算身后也不算前方，
        // 机器人就在 2815~2835 这条死区里朝右/朝左逐帧翻转（实测 TR01-7919 x=2835 抖满 90 秒）。
        if (L.x + 18 < e.x) { if (!behind || L.x > behind.x) behind = L; }
        else if (L.x > e.x + e.w) { if (!ahead || L.x < ahead.x) ahead = L; }
      }
      if (behind && (!ahead || e.x - (behind.x + 18) <= ahead.x - e.x)) { st.recLad = behind; st.recDir = -1; return -1; }
      if (ahead) { st.recLad = ahead; st.recDir = 1; return 1; }
      st.recDir = 1;
      return tx > e.x ? 1 : -1;
    }
    const facing = pickFacing();

    // 策略：朝目标走；被门挡住就开门；被墙挡住先找梯；跳不过去就爬梯
    // 障碍与门的探测都跟着 facing 走。原来两头都写死「只看右侧」：往回退的机器人
    // 顶在一块 34px 高的床板上（实测 TR00-0 x=3312），aheadWall 恒为假 → 既不开门也不跳，
    // 一路冻到 STUCK。塔时代不会往回走这么久，爬梯时代「退回身后那把梯」是常规动作。
    const probe = (x0, x1) => nearSolids(M, x0, x1).some(s => !s.oneway && !s.door &&
      (facing > 0 ? s.x < e.x + e.w + 20 && s.x + s.w > e.x
                  : s.x + s.w > e.x - 20 && s.x < e.x + e.w) &&
      e.y + e.h > s.y + 4 && e.y < s.y + s.h - 4);
    const aheadWall = facing > 0 ? probe(e.x, e.x + e.w + 26) : probe(e.x - 26, e.x + e.w);
    const doorAhead = doorInFront(M, e, opened, facing);
    st.wantUp = st.wantDown = 0;
    const feetNow = e.y + e.h;
    // 已经在目标层之上时不要再起跳：车顶段一次跳跃就把人抬到比 waypoint 还高 30~50px，
    // 而「出梯落点已在目标层」的判据随即不再匹配，回放会误报。
    // 容差只有 2px：不同车型的车顶板高差最大 22px，卡在 8px 落差上时（实测 STUCK@20254）
    // 必须允许起跳，否则「已经到层」的宽松判定会把这一跳吞掉，人就顶在路缘上不动了。
    const atTarget = feetNow <= (W.y || FLOOR) + 2;
    // 门优先于跳：被门挡住时「跳一下」会让人离开地面，而开门要求站在地上，
    // 于是又跳又不开门，机器人对着车门一直原地起跳到超时（实测卡在第 1 节车的上车门）。
    if (doorAhead) {
      if (st.locked && st.locked.has(doorAhead.doorId)) { st.doorT = 0; }   // 据点没守满，这扇门谁也打不开
      else {
        st.doorT += dt;
        if (st.doorT >= (doorAhead.jammed ? LIM.jamT : LIM.doorT)) { opened.add(doorAhead.doorId); st.doorT = 0; }
      }
    } else {
      st.doorT = 0;
      if (aheadWall) {
        // 被挡：只有**身体正压着梯身**的那把梯才算「现在就爬」（车底维修道的逃生梯：梯底就在我脚上）。
        // 抓取窗口必须与 mover 的判据同口径（L.x-2 < e.x+e.w && L.x+18 > e.x）。
        // 原来写成 facing 方向 130px 的前向带，而 wantUp 会把 dir 归零（见下面 mover 调用），
        // 于是「梯子在 113px 外、中间隔着一块 40px 高的走道障碍」时它选择按上而不是跳，
        // 人既不走也不跳，原地顶到超时 —— 实测 TR01-7919 STUCK@16211、TR13-3217 STUCK@17765，
        // 两处都是「中部应急梯 + 梯前一块 aisleObstacle」同一个形状。
        const grab = L => L.x - 2 < e.x + e.w && L.x + 18 > e.x;
        const lad = M.ladders.find(L => grab(L) && Math.abs(L.y0 - (e.y + e.h)) < 30);
        const ladDown = M.ladders.find(L => grab(L) && Math.abs(L.y1 - (e.y + e.h)) < 30);
        if (lad && !ladDown) st.wantUp = 1; else if (!atTarget) st.jump = 9;
      }
    }
    // 已经在梯子上、目标层还在更上（或更下）方 → 继续按着，直到真的到层。
    // 上面那一支只在「前方有墙」时才置 wantUp，并且要求脚离梯底 <30px：于是爬到一半
    // 离开那个 30px 带就没人再按上，人掉回去、再抓、再掉。真机实测（浏览器里把玩家丢进
    // #47 死角）：在梯子上上上下下 601 帧，最后停在脚层 316，而车顶是 202 ——
    // 死角并没有真的出去，只是从「走不出去」变成了「爬不上去」。
    // 注意不能用 atTarget 当「不需要换层」：它是**单边**判据（feet <= 目标层 + 2），
    // 站在车顶而目标是地板时它同样为真，于是下车梯永远不触发 —— 实测机器人在
    // TR08-3 第 8 节 x=6243~6248 之间来回抖 72000 帧直到 TIMEOUT。这里要的是双边判据。
    const ty = W.y === undefined ? FLOOR : W.y;
    const offLayer = Math.abs(feetNow - ty) > 2;
    if (!st.wantUp && !st.wantDown && offLayer) {
      // 压梯身的判定必须与 mover 的排除式同容差：mover 用的是 `feet <= y1 - 2` 才算没压上，
      // 所以站在车顶面上（feet 恰等于 y1）**是**压在梯身上的。这里原来写成严格 `>`，
      // 结果下车梯永远不触发 —— 实测 TR08-3 卡在第 8 节 x=6243 直到 TIMEOUT。
      const on = M.ladders.find(L => e.x + e.w > L.x - 2 && e.x < L.x + 18 &&
        feetNow > Math.min(L.y0, L.y1) - 2 && e.y < Math.max(L.y0, L.y1) + 2);
      if (on && feetNow > ty + 2 && Math.min(on.y0, on.y1) <= ty + 2) st.wantUp = 1;
      else if (on && feetNow < ty - 2 && Math.max(on.y0, on.y1) >= ty - 2) st.wantDown = 1;
    }

    // 换层：目标是「本段路线右端所在的层」，不是左端。三层（车顶/地板/车底）统一处理。
    // 注意用「走过去」而不是「把坐标往梯口挪」：直接改 e.x 会让人物瞬进/瞬出实体，
    // 下一帧被碰撞解算弹到几十像素外，机器人就在原地来回抽搐（实测卡在 x=330↔201）。
    st.dir = facing;
    if (Math.abs(tx - e.x) < 8 && !e.onGround && e.y > WORLD_H - 80) return fail('OFF-TRAIN');
    if (st.hold) { st.dir = 0; st.jump = 0; st.stuck = 0; st.lastX = e.x; st.hist = []; }   // 玩家模型主动停下清怪时用；不影响任何几何判定
    e.bumped = null;
    // 跳跃指令是持续 9 帧的：爬到顶那一帧如果还带着上一次「被挡住」攒下的 jump，
    // 人立刻从车顶起跳、升到比 waypoint 高 60~70px 的位置，回放就误判「找不到换层构件」。
    if (atTarget || e.onLadder || st.wantUp || st.wantDown) st.jump = 0;
    // ---- 新手（首次游玩）模型：只有 st.novice 存在才生效，追兵与 lv1/lv2 完全不受影响 ----
    // 为什么必须有这一段：合同第四节要「不用固定倍率代替实际体验」，而实测 lv2 与 lv1 通关只差
    // 0.5s —— 两档的移动都是满速、都不失手，「普通玩家更慢、更容易失手」这一层根本没被建模，
    // ×1.4 只是个拍的系数。这里把新手代价**逐项**写出来，每项都能单独关掉，
    // _run_final_playthrough.js --novablate= knob 会给逐项 ablation（哪一项吃掉多少秒）。
    if (st.novice && !st.hold) {
      const nv = st.novice;
      if (st.novHold > 0) {                       // 正在停：不推进、不抓梯、不开门
        st.novHold -= dt; st.dir = 0; st.jump = 0; st.wantUp = 0; st.wantDown = 0; st.doorT = 0;
      } else {
        st.novNext -= dt;
        if (st.novNext <= 0) {                    // 读图：每隔几秒站一下下决定往哪走
          st.novHold = nv.rng.real(nv.pauseRange[0], nv.pauseRange[1]);
          st.novNext = nv.rng.real(nv.pauseEvery[0], nv.pauseEvery[1]);
        }
        const 要抓 = !!st.wantUp || !!st.wantDown;
        if (要抓 && !st.novWasUp) {               // 只在「刚决定抓梯」那一帧掷一次，逐帧掷会把爬梯否死
          st.novWasUp = 1;
          if (nv.rng.chance(nv.missGrab)) { st.wantUp = 0; st.wantDown = 0; st.novHold = nv.grabBack; }
        } else if (!要抓) st.novWasUp = 0;
        if (st.jump > 0 && !st.novWasJ) {         // 起跳时机差：这一跳按早了/没按下，撞上路缘再重来
          st.novWasJ = 1;
          if (nv.rng.chance(nv.missJump)) st.jump = 0;
        } else if (!st.jump) st.novWasJ = 0;
        if (doorAhead && !st.novWasD) {           // 门前犹豫：先愣一下才推
          st.novWasD = 1;
          if (nv.rng.chance(nv.doorHesit)) st.novHold = nv.doorHesitT;
        } else if (!doorAhead) st.novWasD = 0;
      }
    }
    mover(M, e, dt, { dir: st.wantUp || st.wantDown ? 0 : st.dir, jump: st.jump > 0, up: st.wantUp > 0, down: st.wantDown > 0 }, opened);
    // 这里原来还有一句 `if (!st.wantUp && !st.wantDown) st.dir = 1;`：mover 之后复位，
    // 于是 st.dir 打印出来永远是 1，看不出机器人这一刻其实在往左退（交接文档里那条
    // 「日志里 dir=1 却往左走」的疑问就是它）。朝向现在每帧由 pickFacing 重算，不必再复位。
    if (st.jump > 0) st.jump--;
    if (Math.abs(e.x - st.lastX) < 0.4 && e.onGround) st.stuck++; else st.stuck = 0;
    // 上面那条只看相邻两帧，会被 ±1px 的原地抖动一路复位：实测 TR03-3811 在 x=37176
    // 反复起跳抖了 11 分钟，闸门一声不响，最后只表现为「14:00 没通关」而看不出原因。
    // 所以再加一条**看 10.5 秒净位移**的：每 30 帧记一个位置，攒满 21 个点后如果首尾两点
    // x 与脚层都差不到 4px，就是真的走不动了（方向来回没关系，净位移才算数）。
    // 但只针对「目标层还不在我这层」的情形：被僵尸人墙顶住十几秒是玩法问题，
    // 不是路线断了 —— 不加这个限定实测两颗 seed 从 ok 变 STUCK（机器人正在清怪）。
    st.hist = st.hist || [];
    if (st.f % 30 === 0) {
      st.hist.push({ x: e.x, y: e.y + e.h });
      if (st.hist.length > 21) st.hist.shift();
      if (st.hist.length === 21) {
        const b = st.hist[0];
        const noNet = Math.abs(e.x - b.x) < 4 && Math.abs((e.y + e.h) - b.y) < 4;
        st.stuck = noNet && Math.abs(feet - W.y) > 12 ? 999 : 0;
      }
    }
    st.lastX = e.x;
    st.tail.push(snap()); if (st.tail.length > 40) st.tail.shift();
    if (e.y > WORLD_H + 60) return fail('FELL');
    if (st.stuck > 90) return fail('STUCK');
    return '';
  }

  // 只走地板的行为验证：无视主路线，一直朝右、被挡就跳、撞门就开。
  // 这条断言的真正含义是「玩家走错层之后还能不能沿地板走到终点」——
  // 用几何扫描写会陷进容差细节（每节车右端天然差几像素），跑一遍比扫一遍准。
  function traverseFloorOnly(M) {
    const e = { x: M.rearSpawn !== undefined ? M.rearSpawn : -260, y: FLOOR - MOVE.h - 1, vx: 0, vy: 0, w: MOVE.w, h: MOVE.h,
      onGround: false, speed: MOVE.speed, onLadder: false, drift: 0 };
    const opened = new Set();
    let jump = 0, doorT = 0;
    for (let f = 0; f < 60 * 60 * 8; f++) {
      const dt = 1 / 60;
      const door = doorInFront(M, e, opened);
      if (door) { doorT += dt; if (doorT >= (door.jammed ? LIM.jamT : LIM.doorT)) { opened.add(door.doorId); doorT = 0; } }
      else {
        doorT = 0;
        const wall = nearSolids(M, e.x, e.x + e.w + 26).some(sl => !sl.oneway && !sl.door &&
          e.x + e.w + 20 > sl.x && e.x < sl.x + sl.w && e.y + e.h > sl.y + 4 && e.y < sl.y + sl.h - 4);
        if (wall && e.onGround) jump = 9;
      }
      mover(M, e, dt, { dir: 1, jump: jump > 0, up: 0, down: 0 }, opened);
      if (jump > 0) jump--;
      if (e.y > WORLD_H + 40) return { ok: false, reason: 'FELL', x: Math.round(e.x) };
      if (e.x >= M.trainLen + 200) return { ok: true, t: +(f / 60).toFixed(1), x: Math.round(e.x) };
    }
    return { ok: false, reason: 'TIMEOUT', x: Math.round(e.x) };
  }

  // 失败现场：把卡住点附近的几何原样打出来，避免靠猜修路线
  function scene(M, e, tail) {
    const car = M.carAt(e.x);
    const near = nearSolids(M, e.x - 120, e.x + 200)
      .map(s => '[' + s.x + ',' + s.y + ' ' + s.w + 'x' + s.h + ']' + (s.main ? 'M' : '') + (s.roof ? 'R' : '') +
        (s.door ? 'D' + (s.open ? '' : 'x') : '') + (s.lintel ? 'L' : '') + (s.deck ? 'K' : '') + (s.under ? 'U' : '') + (s.end ? 'E' : ''));
    return { car: car.i, type: car.type, ch: car.chapter, in: car.routeIn, out: car.routeOut,
      yFloor: car.yFloor, yRoof: car.yRoof, ladders: car.ladders.map(L => [L.x, L.y0, L.y1]),
      links: car.links.map(L => [L.x, L.y0, L.y1, L.from, L.to, L.state]),
      doors: car.doors.map(d => [d.x, d.id]), decks: car.decks.map(d => [d.x, d.y, d.w, d.h]),
      seams: car.seams, near, tail };
  }

  // ---------- 通关模拟：按路线回放，产出真实时长 ----------
  function traverse(M, o) {
    const opt = o || {};
    const y0 = opt.fromY === undefined ? FLOOR : opt.fromY;
    const e = { x: opt.fromX === undefined ? -260 : opt.fromX, y: y0 - MOVE.h - 1, vx: 0, vy: 0, w: MOVE.w, h: MOVE.h,
      onGround: false, speed: opt.speed || MOVE.speed, onLadder: false };
    const st = routeState(M, e, { opened: opt.opened, endX: opt.toX === undefined ? M.trainLen + 240 : opt.toX });
    const maxF = opt.maxFrames || 60 * 60 * 20;
    for (let f = 0; f < maxF; f++) {
      const bad = routeStep(M, st, 1 / 60);
      if (bad) return { ok: false, reason: bad, x: st.bad.x, t: +st.t.toFixed(1), perCar: st.perCar, ctx: st.bad };
      if (e.x >= st.endX) return { ok: true, t: +st.t.toFixed(1), frames: st.f, perCar: st.perCar, opened: st.opened.size, x: Math.round(e.x) };
    }
    return { ok: false, reason: 'TIMEOUT', x: Math.round(e.x), t: +st.t.toFixed(1), perCar: st.perCar, ctx: { scene: scene(M, e, st.tail) } };
  }

  // 逐段自检与修复：整条路线跑不通时，光看最后一个失败点是修不完的 ——
  // 每节车自己模拟一次「从本车入口到下一车入口」，过不去就把本车的障碍/破洞/床板撤掉
  // （换层梯与门保留，它们是路线本身），重建碰撞后再验一遍。最多三轮，只会越修越通。
  function repairRoute(M) {
    for (let pass = 0; pass < 3; pass++) {
      let stripped = 0;
      for (const car of M.cars) {
        const nx = M.cars[car.i + 1];
        const fromY = car.routeIn === 'ROOF' ? car.yRoof : FLOOR;
        const toX = (nx ? nx.x0 + 30 : M.trainLen + 240);
        if (car.i === 0) { /* 起点段单独验 */ }
        const r = traverse(M, { fromX: car.x0 + 24, fromY: fromY, toX, maxFrames: 2400 });
        if (r.ok) continue;
        if (!car.decks.length && !car.holes.length && !car.roofBlocks.length && !car.gantries.length) continue;
        car.decks = []; car.holes = []; car.roofBlocks = []; car.gantries = [];
        // 只撤「车底支路梯」；换层爬梯带 route 标记，绝不能被这条路删掉
        car.ladders = car.ladders.filter(L => L.route || L.y0 !== UNDER);
        stripped++;
      }
      if (!stripped) return M;
      M.solids = buildSolids(M.seed, M.cars, M.opts);
      indexLinks(M);
      indexSolids(M);
      delete M.waypoints;
    }
    return M;
  }

  // ---------- 家具 / 破损 / 灯光（路线通过后才填） ----------
  const ITEM = {
    crateStack: { w: 74, h: 86 }, trunk: { w: 52, h: 30 }, sackPile: { w: 46, h: 34 }, handcart: { w: 86, h: 52 },
    shelfRow: { w: 130, h: 104 }, strappedCase: { w: 92, h: 54 },
    seatRow: { w: 96, h: 62 }, rack: { w: 120, h: 26 }, partition: { w: 16, h: 96 }, luggageSet: { w: 56, h: 34 }, poleGroup: { w: 10, h: 100 },
    berthUpper: { w: 150, h: 20 }, berthLower: { w: 150, h: 34 }, compartmentDoor: { w: 16, h: 96 }, sideTable: { w: 46, h: 40 },
    curtainRail: { w: 120, h: 10 }, personalKit: { w: 30, h: 20 },
    dinerTable: { w: 66, h: 44 }, barCounter: { w: 150, h: 56 }, kitchenUnit: { w: 110, h: 78 }, dishCabinet: { w: 70, h: 96 },
    stallPartition: { w: 14, h: 92 }, potRack: { w: 80, h: 16 },
    gurney: { w: 110, h: 40 }, curtainTrack: { w: 140, h: 12 }, monitorCart: { w: 52, h: 66 }, medCabinet: { w: 60, h: 96 },
    bioBarrel: { w: 40, h: 50 }, quarantineFrame: { w: 120, h: 92 },
    palletStack: { w: 110, h: 92 }, crateWall: { w: 160, h: 110 }, strapPost: { w: 14, h: 88 }, forkPallet: { w: 120, h: 62 },
    barrelRow: { w: 110, h: 46 }, cargoNet: { w: 90, h: 60 },
    toolCabinet: { w: 66, h: 96 }, panelBank: { w: 140, h: 84 }, pipeRack: { w: 150, h: 30 }, workbench2: { w: 120, h: 48 },
    generatorSet: { w: 110, h: 74 }, hoseCoil: { w: 46, h: 44 },
    checkGate: { w: 110, h: 104 }, armorLocker: { w: 60, h: 100 }, monitorRack: { w: 90, h: 88 }, barricade2: { w: 120, h: 46 },
    cameraMast: { w: 16, h: 110 }, cageSection: { w: 140, h: 96 },
    consoleBank: { w: 150, h: 66 }, pilotSeat: { w: 52, h: 58 }, throttleLever: { w: 20, h: 56 }, pipeBundle2: { w: 120, h: 36 },
    cabWindow: { w: 160, h: 70 }, '整流罩': { w: 140, h: 60 },
  };
  function buildFurniture(seed, M) {
    const rng = makeRng(seed + '|fit');
    // 侧视角里「立在地板上的高大家具」就是路上的墙，两件之间必须留出一条能过人的缝；
    // 矮件（≤56px，角色原地一跳就过去）可以紧贴，视觉上的拥挤是允许的。
    const AISLE = 34, TALL = 56;
    for (const car of M.cars) {
      const T = CAR[car.type], pool = T.fit;
      const free = spansFree(car);
      // opt.best  = 取最宽的空档（签名件用，别赌随机）；opt.tight = 放宽走道余量（兜底用）
      const tryPlace = (key, opt) => {
        const it = ITEM[key]; if (!it) return false;
        const tall = it.h > TALL;
        // 兜底档也不能把走道夹到人过不去：闸门按「两个障碍之间 ≥ 角色宽 + 6」量，这里取 30px
        const A = (opt && opt.tight) ? 30 : (tall ? AISLE : 4);
        // 先按随机档试一次；不行就把剩下的空档从宽到窄全试一遍。
        // 原来只试随机的那一档，试不上就放弃 —— 结果一整节车只落下一件行李，
        // 剖面里既空得像样板间，又因为「什么都没画」被认成别的车型。
        const byWide = free.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
        const cands = (opt && opt.best) ? byWide : [rng.pick(free)].concat(byWide);
        let cand = null;
        for (const c of cands) { if (c && c[1] - c[0] >= it.w + A * 2) { cand = c; break; } }
        if (!cand) return false;
        const x = Math.round(rng.real(cand[0] + A, cand[1] - it.w - A));
        car.furniture.push({ kind: key, x, y: Math.round(car.yFloor - it.h), w: it.w, h: it.h, seed: rng.int(0, 9999) });
        for (let k = 0; k < free.length; k++) {
          const f = free[k];
          if (x < f[1] && x + it.w > f[0]) { free.splice(k, 1, [f[0], Math.max(f[0], x)], [Math.min(f[1], x + it.w), f[1]]); break; }
        }
        return true;
      };
      // 类型签名件先放，并且给它挑最宽的空档：等随机池把净空啃完再想放 150px 宽的操纵台就塞不进去了
      // （实测有一节机车只分到三根手柄 + 两扇窗，剖面里看就是一间没有控制台的车厢）。
      // 严格档放不下就退一档余量再试一次 —— 走道余量只是「别画得太挤」的观感规则，
      // 家具本身不是碰撞体（可跳的障碍走 car.decks），所以放宽它不影响通行；门与梯口的 mustFree 一条没动。
      for (const k of (T.anchor || [])) {
        if (car.furniture.some(f => f.kind === k)) continue;
        tryPlace(k, { best: true }) || tryPlace(k, { best: true, tight: true });
      }
      let want = rng.int(4, 8), tries = 0;
      while (car.furniture.length < want && tries++ < 90) tryPlace(rng.pick(pool));
      // 保底 4 件：净空账本收紧后高件经常塞不下，车厢会空得像样板间。
      // 用矮件补齐 —— 矮件不参与走道净宽判定，所以补得越多也不会挤出人形通道。
      const lows = pool.filter(k => ITEM[k] && ITEM[k].h <= TALL);
      for (let g = 0; g < 30 && car.furniture.length < 4; g++) tryPlace(rng.pick(lows.length ? lows : pool));
      // 类型签名件必须出现：没有座位的客车、没有吧台的餐车，美术再怎么画也认不出这是哪节车。
      // 这里只借用同一个 tryPlace —— 走道净宽、门与梯口避让的规则一条都没改，
      // 而且 car.furniture 本来就不是碰撞体（可跳的障碍走 car.decks），所以通行账本不受影响。
      const anchor = T.anchor || [];
      for (const k of anchor) if (!car.furniture.some(f => f.kind === k)) tryPlace(k);
      // 两类签名件都塞不下（净空被台阶塔/梯子占满）时，退一步放该类池子里最小的件，
      // 宁可少一件大货架，也不能让这节车在剖面里变成「没有身份的通用箱车」。
      if (!anchor.some(k => car.furniture.some(f => f.kind === k))) {
        const small = pool.filter(k => ITEM[k]).sort((a, b) => ITEM[a].w * ITEM[a].h - ITEM[b].w * ITEM[b].h);
        for (const k of small) if (tryPlace(k, { best: true, tight: true })) break;
      }
      // 生活小件：只在已经放了大件的位置附近，制造「人突然离开」的痕迹
      const n = rng.int(2, 5);
      for (let i = 0; i < n && car.furniture.length; i++) {
        const host = rng.pick(car.furniture);
        const kind = rng.pick(['bottle', 'paper', 'blanket', 'shoe', 'cup', 'toy', 'pillPack', 'notebook']);
        car.props.push({ kind, x: Math.round(host.x + rng.real(-26, host.w + 8)), y: Math.round(host.y + host.h - rng.int(8, 14)), w: 14, h: 10, seed: rng.int(0, 999) });
      }
    }
  }
  function spansFree(car) {
    const occ = [[car.x0 + 60, car.x0 + 90]];                       // 端头留通道
    for (const d of car.decks) occ.push([d.x - 10, d.x + d.w + 10]);
    // 家具必须让开的不是「梯子那一根杆」，而是「梯子 + 爬上来之后身体所占的那一段」：
    // 出梯时 e.x 被设为 L.x + LIM.exit，身子宽 MOVE.w，所以右界要到 L.x + 26 + 22。
    // 原来只让到 L.x + 34，实测 TR44-3999 第1节、TRP7-55446 第6节各有一件装饰家具
    // 正好压在梯口落点上，角色从箱子中间钻出来（家具不是碰撞体，所以通行闸门抓不到它）。
    for (const L of car.ladders) occ.push([L.x - 26, L.x + LIM.exit + MOVE.w + 6]);
    for (const L of car.links) occ.push([L.x - 26, L.x + LAD.exitX + LAD.exitW + 6]);
    for (const h of car.holes) occ.push([h.x - 16, h.x + h.w + 16]);
    occ.sort((a, b) => a[0] - b[0]);
    const free = []; let cur = car.x0 + 24;
    for (const o of occ) {
      if (o[0] > cur) free.push([cur, Math.min(o[0], car.x1 - 24)]);
      cur = Math.max(cur, o[1]);
    }
    if (cur < car.x1 - 24) free.push([cur, car.x1 - 24]);
    return free.filter(f => f[1] - f[0] > 30);
  }
  function buildDamage(seed, M, o) {
    const rng = makeRng(seed + '|damage');
    for (const car of M.cars) {
      const C = CHAPTERS[car.chapter], wear = CAR[car.type].wear * o.ruin;
      const n = Math.round((car.len / 190) * (0.5 + wear));
      for (let i = 0; i < n; i++) {
        const kind = rng.weighted({ scuff: 30, stain: 22, crack: 16, blood: 10 + C.chase * 26, dent: 14, wire: 8, glass: 8 });
        car.damage.push({ kind, x: Math.round(rng.real(car.x0 + 8, car.x1 - 40)), y: Math.round(rng.real(car.yCeil + 10, car.yFloor - 6)),
          w: rng.int(16, 70), h: rng.int(6, 26), seed: rng.int(0, 9999) });
      }
      const lights = Math.max(1, Math.round(car.len / 240));
      for (let i = 0; i < lights; i++) {
        car.lights.push({ x: Math.round(car.x0 + (i + 0.5) * car.len / lights), y: car.yCeil + 14,
          on: rng.chance(C.light), flicker: rng.chance(0.22) ? rng.real(2, 6) : 0, hue: C.world === 'tunnel' ? '255,190,120' : '235,240,255' });
      }
    }
  }

  // ---------- 沿途世界：按「列车世界位置」划分区段 ----------
  // 世界坐标 worldX = trainX + 车厢本地 x。列车跑得比人在车里跑快得多，
  // 所以人前进到本地 x 时，世界已经推进了约 x·K（K = 1 + 车速/人速）。
  // 章节对应的世界区间就按这个 K 铺开：既保证「玩家在这一章时窗外是这一章的景」，
  // 又天然让车头与车尾看到完全不同的景色（两者相差整列车长）。
  function kmh2px(v) { return v * 1000 / 3600 * 20; }        // 20px = 1m
  function buildWorld(seed, M, o) {
    const rng = makeRng(seed + '|world');
    const v = kmh2px(o.speedKmh || 210);
    const K = 1 + v / MOVE.speed;
    M.trainPxPerSec = v; M.worldK = K;
    const zones = [];
    let x = -4000;
    for (let c = 0; c < CHAPTERS.length; c++) {
      const span = M.chapterSpan[c] || 2000;
      const w = Math.round(span * K) + rng.int(1200, 2600);
      zones.push({ kind: CHAPTERS[c].world, chapter: c, x0: x, x1: x + w, seed: rng.int(0, 99999) });
      x += w;
    }
    zones.push({ kind: 'approach', chapter: CHAPTERS.length - 1, x0: x, x1: x + 9000, seed: rng.int(0, 99999) });
    M.worldZones = zones;
    M.worldLen = x + 9000;
    M.zoneAt = wx => { for (const z of zones) if (wx >= z.x0 && wx < z.x1) return z; return zones[zones.length - 1]; };
    // 沿线设施按世界 x 生成；渲染时只取镜头覆盖的那一小段
    M.poleStep = rng.int(330, 480);
    M.sleeperStep = 46;
    M.worldSeed = rng.int(0, 999999);
  }

  // ---------- 章节事件（追击节奏的骨架，玩法层只负责执行） ----------
  // 事件是关卡内容而不是运行时状态，所以放在生成器里、走独立随机流 |event：
  // 改事件不影响编组/路线/碰撞，反之亦然。每个事件都带 x（触发用的列车本地坐标），
  // 这样「事件里还能不能走通」是可以实测的，而不是靠嘴说「不影响通行」。
  // ch = 允许出现的章节 key（不是 world 名：世界只决定窗外是什么，事件讲的是这一章在演什么）
  const EVENTS = {
    blackout: { name: '隧道断电', dur: 6.5, ch: ['tunnel', 'sleeper'] },        // 车内灯全灭，只剩应急带
    gust:     { name: '高架横风', dur: 7.0, ch: ['bridge', 'rear'] },           // 持续把人往车尾推
    breach:   { name: '地板塌陷', dur: 5.0, ch: ['cargo', 'medical', 'rear'] },
    gas:      { name: '隔离区毒雾', dur: 6.0, ch: ['medical'] },                // 区域内持续掉血
    patrol:   { name: '安保闸门连锁', dur: 5.5, ch: ['tunnel', 'loco', 'coach'] },
    sprint:   { name: '车头加速冲刺', dur: 8.0, ch: ['loco', 'bridge'] },
    stampede: { name: '成群涌来', dur: 7.5, ch: ['coach', 'sleeper', 'cargo', 'loco', 'rear'] },
  };
  function buildEvents(seed, M, o) {
    const rng = makeRng(seed + '|event');
    const ev = [];
    for (let c = 0; c < CHAPTERS.length; c++) {
      const C = CHAPTERS[c];
      const cars = M.cars.filter(q => q.chapter === c);
      const x0 = cars[0].x0, x1 = cars[cars.length - 1].x1;
      const pool = Object.keys(EVENTS).filter(k => EVENTS[k].ch.indexOf(C.key) >= 0);
      const n = 1 + (C.chase > 0.6 ? 1 : 0);
      for (let i = 0; i < n && pool.length; i++) {
        const kind = pool[(rng.int(0, 999) + i) % pool.length];
        const e = { kind, name: EVENTS[kind].name, dur: EVENTS[kind].dur, chapter: c,
          x: Math.round(x0 + (i + 0.35) * (x1 - x0) / (n + 0.3)), power: +(0.6 + C.chase * 0.9).toFixed(2) };
        if (!ev.some(q => q.chapter === c && q.kind === kind)) ev.push(e);
      }
    }
    ev.sort((a, b) => a.x - b.x);
    M.events = ev;
    M.eventAt = x => ev.filter(q => x >= q.x && x <= q.x + 520);
    return ev;
  }

  // ---------- 检查点 ----------
  function buildCheckpoints(M, o) {
    const n = Math.max(5, Math.min(7, Math.round(M.cars.length / 10)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const car = M.cars[Math.round((i + 0.5) * (M.cars.length - 1) / n)];
      const C = CHAPTERS[car.chapter];
      // 据点坚守：这个品类真正吃时间的不是「跑」，是「站住打完一波」。
      // 时长写进关卡数据（不是运行时随机），所以闸门能把它算进通关时间、总览能把它画出来。
      const gate = null;
      const cpx = Math.round(car.x0 + car.len * 0.35);
      // 检查点的 y 必须落在「这个 x 处主路线真的走的那一层」上。
      // 原来一律写 FLOOR：实测 7 个点里有 4 个所在 x 的路线层是车顶 202
      // （cp0@3785、cp2@18158、cp3@26141、cp4@33371）。于是死在这些点会被重生到车顶车的地板上，
      // 而 down 车（ROOF→FLOOR）的地板被自家塔的高侧面封死（踏面实心到 yFloor+12，158px > 单跳 132px），
      // 玩家就再也回不到路线层 —— 这才是 lv2「静默死锁」的真实起因，不是路线策略算错。
      out.push({ id: i, x: cpx, y: routeYAt(M, cpx), car: car.i, chapter: car.chapter,
        hold: 20 + Math.round(22 * C.chase), gate, cleared: false,
        name: 'CP' + (i + 1) + ' · ' + CHAPTERS[car.chapter].name });
    }
    // 每个检查点后面第一道有人行走的地板门就是它的「锁」：守不满时间就打不开。
    // 找不到门（该点之后整段都走车顶，比如终点前那几节机车）就明确不计时长：
    // 没有锁却写一个 hold 数字，等于在时长账本上凭空记账。
    for (const cp of out) {
      for (const c of M.cars.slice(cp.car)) { const d = c.doors.find(q => q.x > cp.x); if (d) { cp.gate = d.id; cp.gateCar = c.i; break; } }
      if (!cp.gate) cp.hold = 0;
    }
    M.checkpoints = out;
  }

  // ---------- 主入口 ----------
  function build(seed, opts) {
    const plan = opts && opts.minutes ? planForMinutes(opts.minutes) : { cars: 60, change: 0.6 };
    const o = Object.assign({ cars: plan.cars, change: plan.change, ruin: 0.6, speedKmh: 210 }, opts || {});
    if (opts && opts.minutes) { o.cars = plan.cars; if (opts.change === undefined) o.change = plan.change; }
    const cars = buildRig(seed, o);
    const trainLen = cars[cars.length - 1].x1;
    const M = { seed: String(seed), opts: o, cars, trainLen, floorY: FLOOR, underY: UNDER, roofY: cars[0].yRoof,
      chapters: CHAPTERS, carAt(x) {
        let i = 0; for (let k = 0; k < cars.length; k++) { if (cars[k].x0 - 14 <= x) i = k; } return cars[i];
      } };
    buildRoute(seed, cars, o);
    M.chapterSpan = {};
    for (const c of cars) M.chapterSpan[c.chapter] = (M.chapterSpan[c.chapter] || 0) + c.len + 26;
    M.solids = buildSolids(seed, cars, o);
    indexLinks(M);
    indexSolids(M);
    repairRoute(M);
    const chk = traverse(M, { speed: MOVE.speed });
    // 声明要换层却找不到对应塔 = 路线本身残缺。这个标记以前写完就没人读，等于校验白做：
    // 现在把它折进通关判据，于是「不通就不摆家具」的门禁会跟着生效，验证脚本也会原样报出是哪几节。
    if (M.routeBad.length) { chk.ok = false; chk.reason = 'ROUTE-BAD@' + M.routeBad.join(','); }
    M.traverse = chk;
    if (chk.ok) { buildFurniture(seed, M); buildDamage(seed, M, o); }
    buildWorld(seed, M, o);
    buildCheckpoints(M, o);
    buildEvents(seed, M, o);
    // 车尾 = 僵尸唯一刷新方向；人类出生在「倒数第二节车厢」（从车尾数第二辆），
    // 出生点前面留一整节行李车给尸潮涌进来，开局就有方向感：往后是死路，往前是机车。
    M.rearSpawn = Math.round(cars[0].x0 - 120);
    M.spawn = { x: Math.round(cars[Math.min(1, cars.length - 1)].x0 + 90), y: FLOOR,
      car: Math.min(1, cars.length - 1), name: '车尾倒数第二节 · ' + cars[Math.min(1, cars.length - 1)].name };
    M.headGoal = { x: Math.round(cars[cars.length - 1].x1 - 140), y: FLOOR, car: cars.length - 1, name: '机车驾驶室' };
    M.fitClash = countClashes(M);
    return M;
  }
  function countClashes(M) {
    let n = 0;
    for (const car of M.cars) {
      const keep = [];
      for (const d of car.decks) keep.push([d.x - 8, d.x + d.w + 8]);
      for (const L of car.ladders) keep.push([L.x - 22, L.x + 30]);
      for (const L of car.links) keep.push([L.x - 12, L.x + LAD.band + 12]);
      for (const h of car.holes) keep.push([h.x - 12, h.x + h.w + 12]);
      for (const f of car.furniture) {
        if (f.x < car.x0 || f.x + f.w > car.x1) { n++; continue; }
        for (const k of keep) if (f.x < k[1] && f.x + f.w > k[0]) { n++; break; }
      }
    }
    return n;
  }

  return {
    build, traverse, traverseFloorOnly, mover, routeState, routeStep, doorInFront, carWindows, routeYAt, EVENTS,
    artStreams, ART_STREAMS, assignLivery,
    nearSolids, indexSolids, makeRng, CAR, CHAPTERS, ITEM, LIM, MOVE,
    planForMinutes, minutesForCars, SEC_PER_CAR, LAD, NOVICE, makeNovice,
    FLOOR, CEIL, ROOF, UNDER, WALL, WORLD_H, CW, CH,
  };
})();
