// ============ 别墅横截面 · 程序化生成器（数据层，纯数据不画图） ============
// 输出一个可被渲染、也可被游戏拿去做碰撞/寻路的建筑模型：
//   levels / walls / slabs / rooms / doors / windows / stairs / elevator /
//   furniture / props / lights / yard / destructibles
// 确定性：同 seed + 同 opts 必须产出逐字段相同的模型。
// 结构策略：先立「跨层对齐的结构网格」，再在格子里填房间 —— 这样承重墙天然上下对齐，
// 楼梯井占住固定一格贯通各层，连通性由「每间朝梯厅方向的邻格开门」这条规则保证，
// 而不是事后靠随机切割碰运气。
const VillaGen = (() => {
  const FH = 124;                 // 楼层间距（含楼板）
  const SLAB = 14;                // 楼板截面厚
  const ROOM_H = FH - SLAB;       // 净高 110
  const GROUND_Y = 470;           // 一层地板面（与游戏 GROUND_TOP 对齐，便于日后接入）
  // 梯井尺寸：两条梯带 + 中间休息平台，两侧各留 MARGIN。
  // 这些数字必须同时喂给「格宽适配」和「台阶排布」，否则第二道梯带会戳出梯井格、压进邻屋
  // （上一版 fitHub 用的是 7 步直跑时代的 260/324，改成 4 步 120 宽之后就没再对过）。
  const MARGIN = 12, BAND = 120, LAND_E = 72, LAND_MIN = 44;
  const hubNeed = withElev => MARGIN * 2 + BAND * 2 + (withElev ? LAND_E : LAND_MIN);
  // 默认：建筑 90..1490（宽 1400，才放得下沙发级家具 + 两侧门洞），世界 1580×700（2.26:1）。
  // 接入游戏时用 opts.bx0/bw/worldW 把别墅整体搬到世界中央，两侧留出庭院出生区。
  const DEF = { bx0: 90, bw: 1400, worldH: 700 };
  const WORLD_H = DEF.worldH;
  const DOOR_W = 46, DOOR_H = 86;
  const LEVELS = ['B1', 'F1', 'F2', 'F3'];

  // 房间池：minW 决定它至少要多宽的格子，public 决定它离梯厅多近
  const POOL = {
    B1: [
      { t: 'garage', minW: 240, pub: 0 }, { t: 'workshop', minW: 170, pub: 1 },
      { t: 'storage', minW: 150, pub: 1 }, { t: 'cellar', minW: 170, pub: 2 },
      { t: 'media', minW: 230, pub: 2 },
    ],
    F1: [
      { t: 'entry', minW: 140, pub: 0 }, { t: 'living', minW: 240, pub: 1 },
      { t: 'kitchen', minW: 200, pub: 1 }, { t: 'dining', minW: 190, pub: 2 },
      { t: 'study', minW: 170, pub: 2 }, { t: 'powder', minW: 120, pub: 2 },
    ],
    F2: [
      { t: 'master', minW: 230, pub: 3 }, { t: 'kids', minW: 180, pub: 2 },
      { t: 'guest', minW: 170, pub: 2 }, { t: 'bath', minW: 140, pub: 1 },
      { t: 'closet', minW: 120, pub: 3 },
    ],
    F3: [
      { t: 'studio', minW: 210, pub: 2 }, { t: 'gym', minW: 200, pub: 2 },
      { t: 'greenhouse', minW: 190, pub: 3 }, { t: 'lounge', minW: 200, pub: 1 },
      { t: 'terrace', minW: 180, pub: 2 },
    ],
  };
  // 每层必须出现的房型（其余从池里抽）
  const MUST = { B1: ['garage'], F1: ['living', 'kitchen'], F2: ['master', 'bath'], F3: [] };
  const REQUIRED_ALL = ['living', 'kitchen', 'bath'];

  // 家具尺寸表：anchor 决定贴地/挂墙/吊顶，keep 表示周围要多留空
  const ITEM = {
    sofa: { w: 128, h: 48, a: 'floor', keep: 26 }, sofaSmall: { w: 88, h: 46, a: 'floor', keep: 20 },
    armchair: { w: 56, h: 46, a: 'floor', keep: 16 }, coffeeTable: { w: 84, h: 26, a: 'floor', keep: 18 },
    tvStand: { w: 104, h: 34, a: 'floor', keep: 20 }, tv: { w: 72, h: 42, a: 'on', keep: 0 },
    bookshelf: { w: 76, h: 92, a: 'floor', keep: 12 }, cabinet: { w: 68, h: 60, a: 'floor', keep: 12 },
    sideboard: { w: 96, h: 44, a: 'floor', keep: 14 }, plant: { w: 34, h: 62, a: 'floor', keep: 8 },
    plantSmall: { w: 22, h: 30, a: 'on', keep: 0 }, rug: { w: 150, h: 8, a: 'floorFlat', keep: 0 },
    desk: { w: 104, h: 40, a: 'floor', keep: 30 }, chair: { w: 34, h: 46, a: 'floor', keep: 8 },
    stool: { w: 26, h: 30, a: 'floor', keep: 6 }, lampFloor: { w: 22, h: 88, a: 'floor', keep: 8 },
    lampTable: { w: 24, h: 32, a: 'on', keep: 0 }, ceilingLamp: { w: 34, h: 26, a: 'ceil', keep: 0 },
    pendantLamp: { w: 26, h: 34, a: 'ceil', keep: 0 }, wallLamp: { w: 16, h: 20, a: 'wall', keep: 0 },
    bed: { w: 150, h: 52, a: 'floor', keep: 30 }, bedSingle: { w: 108, h: 48, a: 'floor', keep: 24 },
    nightstand: { w: 34, h: 34, a: 'floor', keep: 6 }, wardrobe: { w: 84, h: 100, a: 'floor', keep: 10 },
    dresser: { w: 88, h: 52, a: 'floor', keep: 12 }, mirror: { w: 40, h: 56, a: 'wall', keep: 0 },
    painting: { w: 46, h: 34, a: 'wall', keep: 0 }, clock: { w: 24, h: 24, a: 'wall', keep: 0 },
    shelf: { w: 62, h: 16, a: 'wall', keep: 0 }, curtains: { w: 0, h: 0, a: 'none' },
    kitchenRun: { w: 170, h: 46, a: 'floor', keep: 26 }, upperCabinet: { w: 150, h: 34, a: 'wall', keep: 0 },
    fridge: { w: 56, h: 92, a: 'floor', keep: 12 }, stove: { w: 54, h: 46, a: 'floor', keep: 10 },
    sink: { w: 56, h: 46, a: 'floor', keep: 10 }, diningTable: { w: 124, h: 40, a: 'floor', keep: 34 },
    bin: { w: 22, h: 30, a: 'floor', keep: 4 }, bathtub: { w: 130, h: 42, a: 'floor', keep: 20 },
    shower: { w: 84, h: 96, a: 'floor', keep: 12 }, toilet: { w: 40, h: 40, a: 'floor', keep: 14 },
    vanity: { w: 62, h: 44, a: 'floor', keep: 10 }, towelRail: { w: 44, h: 10, a: 'wall', keep: 0 },
    workbench: { w: 130, h: 46, a: 'floor', keep: 26 }, toolChest: { w: 66, h: 56, a: 'floor', keep: 12 },
    shelfRack: { w: 96, h: 96, a: 'floor', keep: 10 }, boxStack: { w: 56, h: 62, a: 'floor', keep: 8 },
    barrel: { w: 40, h: 52, a: 'floor', keep: 8 }, wineRack: { w: 88, h: 78, a: 'floor', keep: 12 },
    car: { w: 230, h: 92, a: 'floor', keep: 34 }, liftPlatform: { w: 150, h: 16, a: 'floorFlat', keep: 20 },
    arcade: { w: 52, h: 88, a: 'floor', keep: 12 }, projector: { w: 40, h: 24, a: 'wall', keep: 0 },
    screenFlat: { w: 150, h: 88, a: 'wall', keep: 0 }, easel: { w: 54, h: 96, a: 'floor', keep: 16 },
    canvas: { w: 60, h: 74, a: 'floor', keep: 10 }, treadmill: { w: 120, h: 56, a: 'floor', keep: 26 },
    weightsRack: { w: 84, h: 74, a: 'floor', keep: 14 }, matYoga: { w: 90, h: 6, a: 'floorFlat', keep: 8 },
    potPlant: { w: 40, h: 70, a: 'floor', keep: 8 }, glassShelf: { w: 90, h: 84, a: 'floor', keep: 10 },
    lounger: { w: 116, h: 40, a: 'floor', keep: 22 }, parasol: { w: 30, h: 110, a: 'floor', keep: 10 },
    crib: { w: 90, h: 52, a: 'floor', keep: 16 }, toyBox: { w: 52, h: 40, a: 'floor', keep: 8 },
    fuseBox: { w: 34, h: 44, a: 'wall', keep: 0 }, boiler: { w: 46, h: 78, a: 'floor', keep: 10 },
    crates: { w: 62, h: 56, a: 'floor', keep: 8 }, ladderTool: { w: 34, h: 92, a: 'floor', keep: 8 },
  };

  // 房间配方：big 先摆，opt 按密度抽，wall/ceil 贴附，clutter 落在 big 之上做环境叙事
  const RECIPE = {
    living: { big: ['sofa', 'tvStand', 'coffeeTable'], opt: ['armchair', 'bookshelf', 'plant', 'lampFloor'], wall: ['painting', 'clock', 'shelf'], ceil: ['ceilingLamp'], on: { coffeeTable: ['mug', 'book', 'remote'], tvStand: ['tv'], bookshelf: ['bookrow'], sideboard: ['vase'] }, hue: 18 },
    kitchen: { big: ['kitchenRun', 'fridge', 'diningTable'], opt: ['sink', 'stove', 'bin', 'stool'], wall: ['upperCabinet', 'clock', 'shelf'], ceil: ['pendantLamp', 'pendantLamp'], on: { diningTable: ['dishes', 'bottle'], kitchenRun: ['kettle', 'pan'] }, hue: 34 },
    dining: { big: ['diningTable', 'sideboard'], opt: ['plant', 'stool'], wall: ['painting', 'shelf'], ceil: ['pendantLamp'], on: { diningTable: ['dishes', 'vase'], sideboard: ['bottle'] }, hue: 26 },
    entry: { big: ['cabinet', 'shelfRack'], opt: ['plant', 'mirror'], wall: ['mirror', 'clock', 'shelf'], ceil: ['ceilingLamp'], on: { cabinet: ['keys', 'book'] }, hue: 40 },
    study: { big: ['desk', 'bookshelf', 'chair'], opt: ['lampFloor', 'plant', 'cabinet'], wall: ['shelf', 'painting', 'shelf'], ceil: ['ceilingLamp'], on: { desk: ['laptop', 'bookrow', 'mug'], bookshelf: ['bookrow'] }, hue: 22 },
    powder: { big: ['vanity', 'toilet'], opt: ['plantSmall'], wall: ['mirror', 'towelRail'], ceil: ['wallLamp'], on: { vanity: ['bottle'] }, hue: 44 },
    master: { big: ['bed', 'nightstand', 'nightstand'], opt: ['dresser', 'armchair', 'lampFloor', 'plant'], wall: ['painting', 'mirror'], ceil: ['ceilingLamp', 'pendantLamp'], on: { nightstand: ['lampTable', 'book', 'mug'], dresser: ['vase'] }, hue: 8 },
    kids: { big: ['bedSingle', 'toyBox', 'desk'], opt: ['chair', 'plantSmall', 'shelfRack'], wall: ['painting', 'shelf', 'clock'], ceil: ['ceilingLamp'], on: { desk: ['bookrow', 'toyRobot'], toyBox: ['toyCar'], bedSingle: ['teddy'] }, hue: 300 },
    guest: { big: ['bedSingle', 'nightstand', 'wardrobe'], opt: ['chair', 'lampFloor'], wall: ['painting', 'mirror'], ceil: ['ceilingLamp'], on: { nightstand: ['lampTable', 'book'] }, hue: 200 },
    bath: { big: ['bathtub', 'vanity', 'toilet'], opt: ['shower', 'plantSmall', 'bin'], wall: ['mirror', 'towelRail'], ceil: ['wallLamp'], on: { vanity: ['bottle', 'towel'] }, hue: 190 },
    closet: { big: ['wardrobe', 'shelfRack'], opt: ['boxStack', 'dresser'], wall: ['shelf'], ceil: ['wallLamp'], on: { shelfRack: ['shoeRow'] }, hue: 46 },
    garage: { big: ['car', 'workbench'], opt: ['toolChest', 'shelfRack', 'barrel', 'ladderTool'], wall: ['shelf', 'fuseBox'], ceil: ['ceilingLamp', 'ceilingLamp'], on: { workbench: ['wrench', 'can'], toolChest: ['wrench'] }, hue: 210 },
    workshop: { big: ['workbench', 'toolChest'], opt: ['shelfRack', 'crates', 'ladderTool', 'stool'], wall: ['shelf', 'fuseBox'], ceil: ['ceilingLamp'], on: { workbench: ['wrench', 'drill'], shelfRack: ['can'] }, hue: 30 },
    storage: { big: ['shelfRack', 'boxStack', 'crates'], opt: ['barrel', 'ladderTool', 'bin'], wall: ['shelf'], ceil: ['ceilingLamp'], on: { crates: ['can'] }, hue: 50 },
    cellar: { big: ['wineRack', 'barrel', 'boxStack'], opt: ['crates', 'shelfRack'], wall: ['shelf'], ceil: ['wallLamp'], on: { wineRack: ['bottleRow'], barrel: ['can'] }, hue: 12 },
    media: { big: ['screenFlat', 'cabinet', 'sofa'], opt: ['arcade', 'lampTable', 'projector'], wall: ['projector'], ceil: ['wallLamp'], on: { cabinet: ['console', 'can'] }, hue: 260 },
    studio: { big: ['easel', 'canvas', 'cabinet'], opt: ['plant', 'stool', 'shelfRack'], wall: ['painting', 'shelf'], ceil: ['pendantLamp', 'ceilingLamp'], on: { cabinet: ['brush', 'can'], easel: ['brush'] }, hue: 340 },
    gym: { big: ['treadmill', 'weightsRack'], opt: ['matYoga', 'stool', 'bin'], wall: ['mirror', 'clock'], ceil: ['ceilingLamp'], on: { weightsRack: ['dumbbell'] }, hue: 160 },
    greenhouse: { big: ['glassShelf', 'potPlant', 'potPlant'], opt: ['plant', 'stool', 'barrel'], wall: ['shelf'], ceil: ['wallLamp'], on: { glassShelf: ['pot'] }, hue: 120 },
    lounge: { big: ['sofaSmall', 'coffeeTable', 'lounger'], opt: ['plant', 'lampFloor', 'cabinet'], wall: ['painting', 'clock'], ceil: ['pendantLamp'], on: { coffeeTable: ['mug', 'book'] }, hue: 52 },
    terrace: { big: ['lounger', 'parasol', 'plant'], opt: ['stool', 'crateSmall'], wall: [], ceil: [], on: { lounger: ['towel'] }, hue: 170 },
    stairhall: { big: ['plant', 'bench'], opt: [], wall: ['painting', 'clock'], ceil: ['ceilingLamp'], on: {}, hue: 40 },
    shaft: { big: [], opt: [], wall: [], ceil: [], on: {}, hue: 210 },
  };
  // 小杂物尺寸（都必须落在大件顶面上，anchor:'on'）
  const PROP_ITEM = {
    mug: 8, book: 12, bookrow: 40, dishes: 22, bottle: 6, bottleRow: 40, kettle: 11, pan: 20,
    vase: 9, keys: 9, laptop: 14, remote: 10, toyCar: 14, teddy: 11, toyRobot: 10, wrench: 15,
    drill: 18, can: 7, console: 12, brush: 14, shoeRow: 40, towel: 12, dumbbell: 15, pot: 8,
  };
  Object.keys(PROP_ITEM).forEach(k => {
    ITEM[k] = { w: PROP_ITEM[k], h: Math.max(6, Math.round(PROP_ITEM[k] * 0.6)), a: 'on', keep: 0 };
  });
  ITEM.towel.h = 10; ITEM.bookrow.h = 16; ITEM.shoeRow.h = 12; ITEM.dishes.h = 10; ITEM.bottleRow.h = 16;

  // 少量配方里没有但 on 里会引用的小件，给个尺寸兜底
  ITEM.bench = { w: 78, h: 34, a: 'floor', keep: 10 };
  ITEM.crateSmall = { w: 34, h: 30, a: 'floor', keep: 6 };

  // ---------- 确定性随机 ----------
  function makeRng(seed) {
    let s = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
    s = (s ^ 0x9e3779b9) >>> 0;
    return {
      next() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; },
      int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
      chance(p) { return this.next() < p; },
      shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    };
  }

  const LEVEL_Y = { B1: GROUND_Y + FH, F1: GROUND_Y, F2: GROUND_Y - FH, F3: GROUND_Y - FH * 2 };
  const roomTopOf = lv => LEVEL_Y[lv] - ROOM_H;

  // ---------- 结构网格 ----------
  // 把梯井格撑到 need 宽，差额从最宽的普通格里扣（总宽恒定，格线仍然对齐）
  function fitHub(grid, idx, need) {
    if (grid.w[idx] >= need) return grid;
    let lack = need - grid.w[idx];
    let guard = 0;
    while (lack > 0 && guard++ < 8) {
      let best = -1;
      for (let i = 0; i < grid.count; i++) if (i !== idx && grid.w[i] > 200 && (best < 0 || grid.w[i] > grid.w[best])) best = i;
      if (best < 0) break;
      const take = Math.min(lack, grid.w[best] - 200);
      if (take <= 0) break;
      grid.w[best] -= take; grid.w[idx] += take; lack -= take;
    }
    let acc = grid.x[0];
    for (let i = 0; i < grid.count; i++) { grid.x[i] = acc; acc += grid.w[i]; }
    return grid;
  }

  function buildGrid(rng, BX0, BX1) {
    const BW = BX1 - BX0;
    const n = rng.int(5, 6);
    const raw = [];
    for (let i = 0; i < n; i++) raw.push(rng.int(240, 340));
    const sum = raw.reduce((a, b) => a + b, 0);
    const scale = BW / sum;
    const w = raw.map(v => Math.max(120, Math.round(v * scale / 2) * 2));
    // 误差补到最后一格，保证总宽恰好等于 BW
    w[w.length - 1] += BW - w.reduce((a, b) => a + b, 0);
    const x = [];
    let acc = BX0;
    for (const v of w) { x.push(acc); acc += v; }
    return { count: n, x, w };
  }

  function build(seed, opts) {
    const o = Object.assign({ density: 1, floors: 4, basement: true, elevator: null, roof: true }, opts || {});
    const rng = makeRng(seed);
    const BX0 = o.bx0 === undefined ? DEF.bx0 : o.bx0;
    const BW = o.bw || DEF.bw;
    const useElevator0 = (o.elevator === null ? rng.chance(0.55) : !!o.elevator);
    const BX1 = BX0 + BW;
    const WORLD_W = o.worldW || (BX1 + BX0);   // 默认左右留白对称
    const model = {
      seed: String(seed), opts: o, world: { w: WORLD_W, h: WORLD_H, groundY: GROUND_Y, bx0: BX0, bx1: BX1, bw: BW },
      const: { FH, SLAB, ROOM_H, DOOR_W, DOOR_H },
      levels: [], bays: [], rooms: [], walls: [], slabs: [], doors: [], windows: [],
      stairs: [], elevator: null, furniture: [], props: [], lights: [], destructibles: [], yard: null, roof: null,
    };
    const grid = buildGrid(rng, BX0, BX1);
    const stairBay = rng.int(1, grid.count - 2);
    // 电梯不另占一格：它和楼梯共用梯井核心（真实别墅就是这么布的）。
    // 旧版让井道单独占一格，会把那一格两侧的房间与梯厅断开 —— 校验器报「不可达房间」。
    // 梯井格宽 = 两条 120 宽梯带 + 中间休息平台（有电梯时平台兼作 68 宽井道）+ 两侧留边。
    // 不够就从最宽的普通格里借，总宽与格线对齐关系不变。
    fitHub(grid, stairBay, hubNeed(useElevator0));
    const hubW = grid.w[stairBay];
    const useElevator = useElevator0 && hubW >= hubNeed(true);
    const shaftBay = -1;
    const levels = o.basement ? LEVELS.slice() : LEVELS.slice(1);
    model.levels = levels.map(lv => ({
      id: lv, y: LEVEL_Y[lv], top: roomTopOf(lv), basement: lv.id === 'B1',
      isRoofLevel: lv === levels[levels.length - 1],
    }));
    model.grid = grid;
    model.stairBay = stairBay; model.shaftBay = shaftBay;

    // ---- 楼板与地基截面 ----
    for (const lv of model.levels) {
      model.slabs.push({ x: BX0 - 16, y: lv.y, w: BW + 32, h: SLAB, mat: 'stone', kind: 'floor', level: lv.id });
      if (lv.id === 'F1') model.slabs.push({ x: BX0 - 26, y: lv.y + SLAB, w: BW + 52, h: 20, mat: 'stone', kind: 'foundation' });
    }
    if (o.roof) {
      const rt = roomTopOf(levels[levels.length - 1]);
      model.slabs.push({ x: BX0 - 20, y: rt - SLAB, w: BW + 40, h: SLAB, mat: 'stone', kind: 'ceiling' });
      model.roof = { y: rt - SLAB, h: 62, pitch: rng.chance(0.5) ? 'gable' : 'flat', tiles: rng.pick(['slate', 'shingle']) };
    }

    // ---- 外墙 ----
    const bottomY = LEVEL_Y[levels[0]] + SLAB;
    const topY = (o.roof ? model.roof.y : roomTopOf(levels[levels.length - 1])) ;
    model.walls.push({ x: BX0 - 16, y: topY, w: 16, h: bottomY - topY, kind: 'ext', mat: 'plaster', side: 'left' });
    model.walls.push({ x: BX1, y: topY, w: 16, h: bottomY - topY, kind: 'ext', mat: 'plaster', side: 'right' });

    // ---- 每层填房间 ----
    const typeSeen = {};
    for (const lv of model.levels) {
      const pool = POOL[lv.id];
      const bays = [];
      for (let i = 0; i < grid.count; i++) bays.push(i);
      const usable = bays.filter(i => i !== stairBay && i !== shaftBay);
      // 先保证必需房型，再按「离梯厅越近越公共」排序填其余
      let want = MUST[lv.id].slice();
      const rest = pool.filter(p => want.indexOf(p.t) < 0);
      const shuffled = rng.shuffle(rest);
      for (const u of usable) if (want.length < usable.length) { const cand = shuffled.shift(); if (cand) want.push(cand.t); }
      while (want.length < usable.length) want.push(rng.pick(pool).t);
      want = rng.shuffle(want);
      // 公共房（pub 小）靠近梯厅，私密房（pub 大）靠外
      // 大件房（车库/客厅）配最宽的格子，否则 230 的车在 214 的库里只能凭空消失
      const minWOf = t => { const p = pool.find(q => q.t === t); return p ? p.minW : 150; };
      const byWidth = usable.slice().sort((a, b) => grid.w[b] - grid.w[a]);
      const bySize = want.slice().sort((a, b) => minWOf(b) - minWOf(a));
      const assign = {};
      byWidth.forEach((bayIdx, k) => { assign[bayIdx] = bySize[k] || rng.pick(pool).t; });
      // 兜底：格子不够时 MUST 房型可能被挤出，这里强制补回（换掉一个非必需房）
      for (const need of MUST[lv.id]) {
        if (Object.values(assign).indexOf(need) >= 0) continue;
        const swap = Object.keys(assign).find(k => MUST[lv.id].indexOf(assign[k]) < 0);
        if (swap !== undefined) assign[swap] = need;
      }

      for (const i of bays) {
        const t = (i === stairBay) ? 'stairhall' : (i === shaftBay ? 'shaft' : assign[i]);
        const bx = grid.x[i], bw = grid.w[i];
        const room = {
          id: lv.id + '_' + i, level: lv.id, bay: i, type: t,
          x: bx, w: bw, y: roomTopOf(lv.id), h: ROOM_H, floorY: LEVEL_Y[lv.id],
          matWall: wallMatFor(t, lv.id, rng), matFloor: floorMatFor(t, rng), basement: lv.id === 'B1',
          hue: (RECIPE[t] ? RECIPE[t].hue : 30) + rng.int(-8, 8),
          lit: rng.chance(0.8), variant: rng.int(0, 2),
        };
        model.rooms.push(room);
        typeSeen[t] = (typeSeen[t] || 0) + 1;
        // 分格承重墙（梯厅/井道两侧留门洞，所以不砌死）
        if (i > 0 && i !== stairBay && i - 1 !== stairBay) {
          const brk = false;   // 门洞砖墙改由游戏侧做成房内可轰掩体，见 level.js buildVilla
          const w = { x: bx - 7, y: room.y, w: 14, h: ROOM_H, kind: brk ? 'breakable' : 'load', mat: brk ? 'plaster' : 'stone', level: lv.id, hp: brk ? 120 : 0 };
          model.walls.push(w);
          if (brk) model.destructibles.push({ wall: model.walls.length - 1, hp: 120, maxHp: 120, room: room.id });
        }
      }
    }

    // ---- 门：每间朝梯厅方向开；梯厅本身向两侧连通 ----
    for (const lv of levels) {
      const rs = model.rooms.filter(r => r.level === lv);
      rs.sort((a, b) => a.bay - b.bay);
      for (const r of rs) {
        if (r.type === 'stairhall' || r.type === 'shaft') continue;
        const dir = r.bay < stairBay ? 1 : (r.bay > stairBay ? -1 : 0);
        if (dir === 0) continue;
        const wx = dir > 0 ? r.x + r.w : r.x;
        model.doors.push({
          x: Math.round(wx - DOOR_W / 2), y: r.floorY - DOOR_H, w: DOOR_W, h: DOOR_H,
          level: lv, roomA: r.id, kind: 'interior', open: rng.chance(0.5), flip: dir > 0,
        });
      }
      // 梯厅不再额外开门：上面「每间朝梯厅开一道」已经覆盖了共用边界，
      // 再开一次会在同一个门洞上叠两个 door 对象（家具禁放区也被算两遍）。
    }
    // 入户门：一层最外侧格
    const entryBay = rng.chance(0.5) ? 0 : grid.count - 1;
    const entryRoom = model.rooms.find(r => r.level === 'F1' && r.bay === entryBay && r.type !== 'shaft');
    if (entryRoom) {
      const ex = entryBay === 0 ? BX0 - 16 : BX1;
      model.doors.push({ x: ex, y: LEVEL_Y.F1 - 96, w: 16, h: 96, level: 'F1', roomA: entryRoom.id, kind: 'exterior', open: false, flip: entryBay === 0 });
    }

    // ---- 窗：后墙（剖面里可见的外墙内表面）+ 山墙 ----
    for (const r of model.rooms) {
      if (r.type === 'shaft') continue;
      const n = r.w > 220 ? 2 : 1;
      const segw = Math.round(r.w / n);
      for (let k = 0; k < n; k++) {
        const ww = Math.min(78, Math.round(segw * 0.42));
        const wh = r.basement ? 30 : (r.h - 52);
        const wx = Math.round(r.x + segw * k + (segw - ww) / 2);
        if (wx < BX0 + 8 || wx + ww > BX1 - 8) continue;
        if (model.doors.some(d => d.level === r.level && Math.abs(d.x - wx) < DOOR_W + 10)) continue;
        model.windows.push({
          x: wx, y: Math.round(r.floorY - (r.basement ? 84 : r.h - 14) + (r.basement ? 0 : 0)), w: ww, h: wh,
          level: r.level, room: r.id, mull: rng.int(1, 2), variant: rng.int(0, 2), lit: r.lit,
        });
      }
    }

    // ---- 楼梯：井格里左右两条梯带，梯段按 0,1,2,3… 依次轮换用哪条带和哪个方向。----
    // 关键认识：每道梯段整体只生活在「相邻两层楼板之间」，所以楼板不用开洞——
    // 楼板本身就是休息平台。之前给楼板掏了个大洞，玩家在二层走到井口就悬空/掉层。
    // 两条带必须分开：同一水平段里「下层梯的顶」和「上层梯的底」会上下重叠 18px，
    // 人站上去身体被卡进上一道梯的第一级，实测就是永远爬不到三层。
    const LANDW = useElevator ? LAND_E : LAND_MIN;   // 两带之间的休息平台：楼板在这里必须是实的
    const bandX = [grid.x[stairBay] + MARGIN, grid.x[stairBay] + MARGIN + BAND + LANDW];
    for (let li = 0; li < model.levels.length - 1; li++) {
      const lo = model.levels[li], hi = model.levels[li + 1];
      const b = li % 2;                            // 0,1,0,1 轮换梯带
      const dir = (li % 4 < 2) ? 1 : -1;           // +1,+1,-1,-1 轮换上下行端点
      // 踏面必须 ≥ 角色宽度（28px），否则人同时跨压两级台阶，两侧立面互相把身体挤回去、跳不上去
      const steps = 4, rise = FH / steps, run = Math.floor(BAND / steps);
      const totalRun = run * steps;
      const arr = [];
      for (let k = 1; k <= steps; k++) {
        const sx = dir > 0 ? bandX[b] + (k - 1) * run : bandX[b] + BAND - k * run;
        arr.push({ x: Math.round(sx), y: Math.round(lo.y - rise * k), w: run, h: Math.round(rise * k) });
      }
      const topX = dir > 0 ? bandX[b] + BAND - run : bandX[b];
      model.stairs.push({
        from: lo.id, to: hi.id, bay: stairBay, dir, band: b, steps: arr, rise, run,
        landing: { x: Math.round(topX), y: hi.y, w: run, h: 6 },
        rail: { x0: Math.round(bandX[b]), x1: Math.round(bandX[b] + BAND), yTop: hi.y, yBot: lo.y },
      });
    }

    // ---- 电梯：贴在梯井格的另一侧 ----
    if (useElevator) {
      const bx = bandX[0] + BAND + (bandX[1] - bandX[0] - BAND) / 2 - 34;   // 井道夹在两条梯带中间
      const top = roomTopOf(levels[levels.length - 1]);
      const bot = LEVEL_Y[levels[0]];
      model.elevator = {
        x: bx, w: 68, shaft: { y: top, h: bot - top }, bay: stairBay,
        car: { y: LEVEL_Y[rng.pick(levels.filter(l => l !== 'B1'))] - 40, h: 40 },
        doors: model.levels.map(lv => ({ level: lv.id, y: lv.y - 88, h: 88, open: rng.chance(0.3) })),
        speed: 46,
      };
    }

    // ---- 家具与杂物 ----
    placeFurniture(model, rng, o.density);

    // ---- 灯 ----
    for (const r of model.rooms) {
      if (r.type === 'shaft') continue;
      const lamps = r.w > 240 ? 2 : 1;
      for (let k = 0; k < lamps; k++) {
        model.lights.push({
          x: Math.round(r.x + r.w * (lamps === 1 ? 0.5 : (k === 0 ? 0.3 : 0.7))),
          y: r.y + 18, r: Math.round(70 + r.w * 0.28), room: r.id,
          warm: r.hue < 60 || r.hue > 330 ? 1 : 0, on: r.lit,
        });
      }
    }

    // ---- 庭院 ----
    model.yard = buildYard(model, rng);
    return model;
  }

  function wallMatFor(t, lv, rng) {
    if (lv === 'B1') return rng.chance(0.55) ? 'concrete' : 'brick';
    if (t === 'bath' || t === 'kitchen' || t === 'powder') return 'tile';
    if (t === 'greenhouse') return 'glass';
    return rng.chance(0.35) ? 'plaster' : 'wallpaper';
  }
  function floorMatFor(t, rng) {
    if (t === 'garage' || t === 'workshop' || t === 'storage') return 'concrete';
    if (t === 'bath' || t === 'powder' || t === 'kitchen') return 'tile';
    if (t === 'terrace') return 'stone';
    return rng.chance(0.25) ? 'tile' : 'wood';
  }

  // ---------- 家具布置 ----------
  // 同一锚点（贴地/挂墙/吊顶）的家具共用一条「已占 x 区间」账本，位置一律从空闲区间里取，
  // 所以「不互相重叠、不越墙」是构造出来的保证，不是事后检测（旧版逐格 try 会漏判）。
  // 门口与梯井另设 keep-out；小件只能落在宿主顶面剩下的区间里。
  function placeFurniture(model, rng, density) {
    for (const r of model.rooms) {
      const rec = RECIPE[r.type];
      if (!rec) continue;
      const L = r.x + 6, R = r.x + r.w - 6;
      const ledgers = { floor: [], wall: [], ceil: [] };
      const hostLedger = {};
      const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      // 只把「本间房边界上的门」当禁放区。旧版按整层筛门，于是每间房两端都被
      // 邻居的门扩出去 34px 封死，稍宽的家具一件都放不下（车库/客厅直接空房）。
      const keepOut = model.doors
        .filter(d => d.level === r.level && d.x + d.w > r.x - 6 && d.x < r.x + r.w + 6)
        .map(d => ({ x: d.x - 10, y: d.y, w: d.w + 20, h: d.h }));
      if (r.bay === model.stairBay) {
        for (const s of model.stairs) {
          if (s.from !== r.level && s.to !== r.level) continue;
          keepOut.push({ x: model.grid.x[model.stairBay], y: s.rail.yTop, w: model.grid.w[model.stairBay], h: s.rail.yBot - s.rail.yTop });
        }
      }
      // 一维区间扣减：账本里的已占位 + 门口禁放带，一起从 [L,R] 里挖掉再取空闲段
      const freeSpans = (list, lo, hi, blockers) => {
        const occ = list.map(o => [o.x, o.x + o.w]);
        for (const k of (blockers || [])) occ.push([k.x, k.x + k.w]);
        occ.sort((a, b) => a[0] - b[0]);
        const out = [];
        let cur = lo;
        for (const [a, b] of occ) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
        if (cur < hi) out.push([cur, hi]);
        return out;
      };
      // 高件（≥60）挡住窗就变成「柜子糊住玻璃」，读起来像贴图错误；矮件（沙发背）挡窗是正常的，不管
      const winKeep = model.windows.filter(d => d.level === r.level && d.x + d.w > r.x - 6 && d.x < r.x + r.w + 6)
        .map(d => ({ x: d.x - 6, y: d.y, w: d.w + 12, h: d.h }));
      const slot = (list, w, y, h, spread, tall) => {
        const blocks = tall ? keepOut.concat(winKeep) : keepOut;
        const cands = freeSpans(list, L, R, blocks).filter(s => s[1] - s[0] >= w);
        if (!cands.length) return null;
        if (spread === 'random') { for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = cands[i]; cands[i] = cands[j]; cands[j] = t; } }
        const s = spread === 'right' ? cands[cands.length - 1] : cands[0];
        const slack = s[1] - s[0] - w;
        const x = spread === 'right' ? s[1] - w : s[0] + Math.round(slack * (spread === 'fill' ? 0 : rng.next() * 0.7));
        return { x: Math.round(x), y, w, h };
      };

      const placed = {};
      const put = (kind, hostName) => {
        const it = ITEM[kind];
        if (!it) return null;
        // 房间比家具还窄时按比例收窄，而不是整件丢弃（小车库放得下「短车身」，比空着更像真房间）
        const iw = Math.max(20, Math.min(it.w, r.w - 18));
        let b = null;
        if (it.a === 'floor' || it.a === 'floorFlat' || it.a === 'wall' || it.a === 'ceil') {
          const key = it.a === 'floorFlat' ? 'floor' : it.a;
          const y = (it.a === 'floor' || it.a === 'floorFlat') ? r.floorY - it.h
            : it.a === 'ceil' ? r.y + 4 : Math.max(r.y + 6, r.floorY - 12 - it.h - Math.round(rng.next() * 30));
          const spread = (it.a === 'wall' || it.a === 'ceil') ? 'random'
            : (placed[kind] ? 'random' : (kind === 'fridge' || kind === 'wardrobe' || kind === 'shelfRack' ? 'right' : 'fill'));
          b = slot(ledgers[key], iw, y, it.h, spread, it.h >= 60);
          if (!b) {
            // 还是放不下：按当前最宽空档再缩一次。空房间比「尺寸标准但挤不进」更糟，
            // 一辆 140 宽的短车仍然读得出是车，而 230 的车在 214 的车库里只能消失。
            const widest = freeSpans(ledgers[key], L, R, it.h >= 60 ? keepOut.concat(winKeep) : keepOut).reduce((mx, sp) => Math.max(mx, sp[1] - sp[0]), 0);
            if (widest >= 40) b = slot(ledgers[key], Math.min(iw, widest), y, it.h, 'fill', it.h >= 60);
          }
        } else if (it.a === 'on') {
          const host = hostName && placed[hostName] && placed[hostName][0];
          if (!host) return null;
          const hi = model.furniture.indexOf(host);
          const list = hostLedger[hi] = hostLedger[hi] || [];
          const hw = Math.max(6, Math.min(iw, host.w - 8));
          const s = freeSpans(list, host.x + 3, host.x + host.w - 3, null).find(sp => sp[1] - sp[0] >= hw);
          if (!s) return null;
          b = { x: Math.round(s[0]), y: host.y - it.h, w: hw, h: it.h, host };
          list.push(b);
        }
        if (!b) return null;
        const f = {
          kind, room: r.id, level: r.level, x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h,
          anchor: it.a, host: b.host ? model.furniture.indexOf(b.host) : -1,
          flip: rng.chance(0.5) ? -1 : 1, variant: rng.int(0, 2), hue: r.hue,
          seed: Math.round(rng.next() * 1e6),
        };
        model.furniture.push(f);
        if (it.a !== 'on') ledgers[it.a === 'floorFlat' ? 'floor' : it.a].push(f);
        (placed[kind] = placed[kind] || []).push(f);
        return f;
      };

      for (const k of rec.big) put(k);
      const nOpt = Math.round(rec.opt.length * Math.max(0.25, Math.min(1.4, density)));
      for (let k = 0; k < nOpt; k++) put(rng.pick(rec.opt));
      for (const k of rec.wall) put(k);
      for (const k of rec.ceil) put(k);
      if (r.basement) put('boiler');
      // 环境叙事：只要宿主真放下了就撒 1~3 件小物，让每间房留下「正在被使用」的痕迹
      const onKeys = Object.keys(rec.on);
      let hostKeys = onKeys.filter(h => placed[h]);
      if (!hostKeys.length) {
        // 配方宿主没放下（房间太窄）时退一步，任选够宽的台面当宿主，
        // 否则这间房只剩大件，读起来像样板间而不是有人住
        hostKeys = Object.keys(placed).filter(k => ITEM[k] && ITEM[k].a === 'floor' && placed[k][0] && placed[k][0].w >= 60).slice(0, 2);
      }
      const GENERIC = ['mug', 'book', 'can', 'bottle', 'keys'];
      for (const hk of hostKeys) {
        const list = rec.on[hk] || GENERIC;
        const n2 = rng.int(1, Math.min(3, list.length));
        for (let j = 0; j < n2; j++) put(rng.pick(list), hk);
      }
    }
  }

  // ---------- 庭院 ----------
  function buildYard(model, rng) {
    const y = GROUND_Y;
    const WORLD_W = model.world.w, BX0 = model.world.bx0, BX1 = model.world.bx1;
    const yard = { groundY: y, trees: [], bushes: [], fence: [], path: null, lamps: [], far: [], debris: [] };
    for (let x = 20; x < WORLD_W - 20; x += rng.int(70, 130)) {
      if (x > BX0 - 40 && x < BX1 + 40) continue;
      if (rng.chance(0.45)) yard.bushes.push({ x, y, w: rng.int(26, 46), h: rng.int(16, 30), variant: rng.int(0, 2) });
    }
    for (let i = 0; i < 3; i++) {
      const tx = rng.pick([[24, 90], [WORLD_W - 120, WORLD_W - 30]][i % 2]);
      const x = rng.int(tx[0], tx[1]);
      if (x > BX0 - 60 && x < BX1 + 60) continue;
      yard.trees.push({ x, y, h: rng.int(120, 190), w: rng.int(70, 110), variant: rng.int(0, 2) });
    }
    for (let x = 10; x < WORLD_W - 10; x += 34) {
      if (x > BX0 - 30 && x < BX1 + 30) continue;
      yard.fence.push({ x, y, h: rng.chance(0.15) ? 22 : 44 });
    }
    const door = model.doors.find(d => d.kind === 'exterior');
    if (door) yard.path = { x: door.flip ? door.x - 120 : door.x + 16, y, w: 150, h: 10 };
    for (let i = 0; i < 6; i++) yard.lamps.push({ x: rng.int(30, WORLD_W - 30), y, h: rng.int(70, 96) });
    for (let i = 0; i < 26; i++) yard.debris.push({ x: rng.int(0, WORLD_W), y: y + rng.int(2, 40), w: rng.int(3, 9), h: rng.int(2, 5) });
    for (let i = 0; i < 9; i++) yard.far.push({ x: rng.int(0, WORLD_W), w: rng.int(60, 150), h: rng.int(60, 170) });
    return yard;
  }

  return { build, LEVELS, LEVEL_Y, FH, SLAB, ROOM_H, GROUND_Y, WORLD_H, DEF, ITEM, RECIPE, POOL, makeRng };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VillaGen;
