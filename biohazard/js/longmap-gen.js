// ============ 横版长地图程序化生成器 · 数据层 ============
// 只做数据：区段序列 → 连续主路径剖面 → 碰撞体 → 建筑骨架 → 支路 → 道具 → 污损/灯光。
// 不碰 canvas、不碰颜色，渲染全在 longmap-draw.js；这样同一份模型既能无头校验也能画出来。
// 确定性：所有随机都来自 makeRng(seed)，且每个生成步骤只按固定顺序取数，
//         同 seed + 同参数必须产出逐字段相同的模型（无头闸门里用绘制指令序列再验一遍）。
const LongMapGen = (() => {
  const CW = 960, CH = 540;          // 一屏
  const GY = 470;                    // 街道基准地面（与游戏 GROUND_TOP 对齐）
  const WH = 760;                    // 世界高：地下层 + 屋顶层都装得下
  const COL = 8;                     // 剖面采样步长

  // 通行上限由测试角色的运动能力反推，不是拍脑袋：
  //   跑速 275、JUMP_V 745、G 2100 → 顶点 132px、滞空 0.71s、满速水平射程 ≈195px。
  //   追击者按 152 速算，滞空同样 0.71s → 水平射程只有 ≈107px。
  //   所以「主路线上的断口」必须按追击者而不是玩家来限，否则玩家跳过去了、追击者原地卡死。
  const LIM = {
    riser: 44,        // 单级台阶高（跳跃余量 3 倍）
    gapMain: 84,      // 主路线断口：追击者也跳得过
    gapSide: 130,     // 支路断口：允许只有玩家跳得过的近路
    climbOut: 40,     // 断口底到路面的最大下凹：超过一跳高度就成了追击者爬不出来的死坑
    joinDropMax: 190, // 支路汇合点允许的最大落差：再大就成了单向坠楼，玩家回不了头
    sideMax: 3,       // 同时存在的支路数
  };
  const MOVE = { w: 22, h: 36, speed: 275, chaserSpeed: 152, g: 2100, jumpV: 745 };

  // 「目标时长 → 地图长度」的换算系数，是量出来的不是拍的：
  // 用同一个 walker 在 12/15/18 屏 × 8 seed 上跑，纯跑通关稳定落在 ≈3.5 秒/屏。
  // 真人边打边跑更慢，但逃命关的时长上限应该按「不被卡住时的下限」来给，
  // 所以这里用 3.5，宁可把图做得偏长也不要偏短。
  const SEC_PER_SCREEN = 3.5;
  const screensForMinutes = m => Math.max(12, Math.min(350, Math.round(m * 60 / SEC_PER_SCREEN)));
  const minutesForScreens = n => n * SEC_PER_SCREEN / 60;

  // ---------- 确定性随机 ----------
  function makeRng(seed) {
    let s = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) s = (s * 131 + str.charCodeAt(i)) >>> 0;
    s = (s ^ 0x9e3779b9) >>> 0;
    const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return {
      next,
      int: (a, b) => a + Math.floor(next() * (b - a + 1)),
      real: (a, b) => a + next() * (b - a),
      pick: arr => arr[Math.floor(next() * arr.length) % arr.length],
      chance: p => next() < p,
      shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
      // 权重抽样：w 为 {k:权重}
      weighted(w) { const ks = Object.keys(w); let sum = 0; for (const k of ks) sum += w[k]; let r = next() * sum; for (const k of ks) { r -= w[k]; if (r <= 0) return k; } return ks[ks.length - 1]; },
    };
  }

  // ---------- 主题区段 ----------
  // ground=路面材质；feat=地形特征权重；props=专属道具池；decal=污损倾向；
  // level=路线所在层（street 地面 / raised 抬升 / under 地下）；indoor=是否穿建筑内部
  const THEMES = {
    blockade: { name: '封锁街区', ground: 'asphalt', level: 'street', indoor: false, danger: 0.30, len: [820, 1080],
      band: [GY - 8, GY + 8],
      feat: { flat: 40, stepUp: 14, stepDown: 12, trench: 10, stair: 8, ledge: 10 },
      props: ['barricade', 'sandbag', 'tirepile', 'cone', 'roadblock', 'militarycrate', 'searchlight'],
      decal: { crack: 0.5, stain: 0.3, scorch: 0.2, graffiti: 0.3, vine: 0.05, infection: 0.2 },
      landmark: ['barricade_gate', 'watchtower'], facade: 'concrete' },
    market: { name: '便利店与公寓', ground: 'pavement', level: 'street', indoor: true, danger: 0.42, len: [1080, 1420],
      band: [GY - 10, GY + 6],
      feat: { flat: 44, stepUp: 10, stepDown: 10, trench: 4, stair: 14, curb: 12, ledge: 6 },
      props: ['shelf', 'cart', 'vending', 'crate', 'trashbag', 'awning', 'pallet', 'luggage'],
      decal: { crack: 0.3, stain: 0.4, scorch: 0.1, graffiti: 0.5, vine: 0.1, infection: 0.25 },
      landmark: ['neon_store', 'apartment_door'], facade: 'brick' },
    overpass: { name: '倒塌高架桥', ground: 'concrete', level: 'raised', indoor: false, danger: 0.62, len: [1180, 1520],
      band: [GY - 96, GY - 24],
      feat: { flat: 26, stepUp: 16, ramp: 12, trench: 16, gap: 12, stair: 12, ledge: 12 },
      props: ['girder', 'concreteblock', 'rebar', 'fallrock', 'barrier', 'oilspill', 'carwreck'],
      decal: { crack: 0.9, stain: 0.3, scorch: 0.25, graffiti: 0.2, vine: 0.05, infection: 0.15 },
      landmark: ['fallen_pier', 'tilted_sign'], facade: 'concrete' },
    hospital: { name: '医院与临时隔离点', ground: 'tile', level: 'indoor', indoor: true, danger: 0.72, len: [1220, 1560],
      band: [GY - 40, GY - 4],
      feat: { flat: 40, stepUp: 8, stepDown: 8, stair: 14, curb: 10, ledge: 6, trench: 2 },
      props: ['bed', 'ivstand', 'curtainrail', 'wheelchair', 'medicalcart', 'biohazardbin', 'stretcher', 'quarantinegate'],
      decal: { crack: 0.2, stain: 0.7, scorch: 0.05, graffiti: 0.1, vine: 0.05, infection: 0.55 },
      landmark: ['hospital_sign', 'triage_tent'], facade: 'tile' },
    rooftop: { name: '楼顶与消防梯', ground: 'membrane', level: 'raised', indoor: false, danger: 0.66, len: [1120, 1460],
      band: [GY - 170, GY - 96],
      feat: { flat: 24, stepUp: 18, gap: 16, ledge: 18, stair: 14, trench: 4 },
      props: ['acunit', 'watertank', 'ventduct', 'antenna', 'solarpanel', 'pottedplant', 'skylight', 'fireladder'],
      decal: { crack: 0.35, stain: 0.35, scorch: 0.15, graffiti: 0.05, vine: 0.2, infection: 0.2 },
      landmark: ['water_tower', 'crane_arm'], facade: 'brick' },
    metro: { name: '地铁入口', ground: 'granite', level: 'street', indoor: true, danger: 0.80, len: [900, 1180],
      band: [GY - 20, GY + 14],
      feat: { flat: 26, stepDown: 22, stair: 22, stepUp: 8, trench: 6, ledge: 8 },
      props: ['turnstile', 'ticketmachine', 'adboard', 'bench', 'luggageset', 'manhole', 'stairrail'],
      decal: { crack: 0.3, stain: 0.5, scorch: 0.1, graffiti: 0.6, vine: 0.05, infection: 0.4 },
      landmark: ['metro_canopy', 'collapsed_entrance'], facade: 'granite' },
    tunnel: { name: '地下维修通道', ground: 'grating', level: 'under', indoor: true, danger: 0.88, len: [1080, 1420],
      band: [GY + 96, GY + 150],
      feat: { flat: 34, stepUp: 12, stepDown: 12, trench: 12, ledge: 12, stair: 10 },
      props: ['pipebundle', 'valve', 'pump', 'cablespool', 'maintank', 'warningboard', 'steamvent'],
      decal: { crack: 0.4, stain: 0.6, scorch: 0.15, graffiti: 0.2, vine: 0.05, infection: 0.6 },
      landmark: ['flood_gate', 'generator_hall'], facade: 'concrete' },
    warehouse: { name: '工业仓库', ground: 'concrete', level: 'street', indoor: true, danger: 0.58, len: [1220, 1560],
      band: [GY - 16, GY + 10],
      feat: { flat: 36, stepUp: 12, ledge: 14, trench: 8, stair: 10, curb: 8 },
      props: ['rack', 'palletstack', 'drum', 'forklift', 'conveyor', 'container', 'chainhoist'],
      decal: { crack: 0.45, stain: 0.4, scorch: 0.3, graffiti: 0.25, vine: 0.05, infection: 0.3 },
      landmark: ['silo', 'gantry_crane'], facade: 'metal' },
    plaza: { name: '撤离广场', ground: 'paving', level: 'street', indoor: false, danger: 0.35, len: [980, 1240],
      gapMul: 2.6, floorsMax: 3,
      band: [GY - 10, GY + 6],
      feat: { flat: 48, stepUp: 8, stepDown: 10, curb: 12, ledge: 8, trench: 4 },
      props: ['helipadmark', 'sandbagwall', 'spotlight', 'truck', 'flagpole', 'barrier', 'medkitcrate'],
      decal: { crack: 0.25, stain: 0.2, scorch: 0.2, graffiti: 0.15, vine: 0.05, infection: 0.1 },
      landmark: ['evac_blimp', 'extraction_gate'], facade: 'concrete' },
    // 可选插入的过渡主题（让 8~12 段的组合每次都不同）
    parking: { name: '废弃停车场', ground: 'asphalt', level: 'street', indoor: false, danger: 0.46, len: [820, 1080],
      gapMul: 2.0, floorsMax: 2,
      band: [GY - 14, GY + 8],
      feat: { flat: 40, stepUp: 12, curb: 16, trench: 8, ledge: 10, stair: 8 },
      props: ['carwreck', 'parkingsign', 'concretepyramid', 'shoppingcart', 'tirepile', 'fencepanel'],
      decal: { crack: 0.5, stain: 0.4, scorch: 0.15, graffiti: 0.4, vine: 0.15, infection: 0.3 },
      landmark: ['stacked_cars', 'roof_access_ramp'], facade: 'concrete' },
    sidewalk: { name: '沿街店铺', ground: 'pavement', level: 'street', indoor: true, danger: 0.38, len: [860, 1120],
      band: [GY - 8, GY + 6],
      feat: { flat: 46, curb: 16, stepUp: 10, stepDown: 10, stair: 8, trench: 2 },
      props: ['displayrack', 'marketstall', 'flowerpot', 'chairset', 'crate', 'trashbag', 'bicycle'],
      decal: { crack: 0.3, stain: 0.35, scorch: 0.1, graffiti: 0.55, vine: 0.15, infection: 0.25 },
      landmark: ['shutter_row', 'billboard'], facade: 'brick' },
    railway: { name: '废弃轻轨段', ground: 'ballast', level: 'raised', indoor: false, danger: 0.60, len: [1020, 1320],
      band: [GY - 70, GY - 10],
      feat: { flat: 30, stepUp: 14, trench: 12, gap: 10, ledge: 12, stair: 12 },
      props: ['rail', 'sleeper', 'tramcar', 'catenary', 'signalbox', 'debrispile'],
      decal: { crack: 0.5, stain: 0.35, scorch: 0.2, graffiti: 0.3, vine: 0.25, infection: 0.3 },
      landmark: ['derailed_tram', 'broken_catenary'], facade: 'concrete' },
    depot: { name: '维修车间', ground: 'concrete', level: 'street', indoor: true, danger: 0.52, len: [980, 1260],
      band: [GY - 12, GY + 8],
      feat: { flat: 38, stepUp: 12, ledge: 14, trench: 8, stair: 10, curb: 8 },
      props: ['workbench', 'jackstand', 'tirestack', 'toolchest', 'oilpan', 'busframe', 'hoist'],
      decal: { crack: 0.4, stain: 0.55, scorch: 0.25, graffiti: 0.2, vine: 0.05, infection: 0.25 },
      landmark: ['bus_hay', 'service_pit'], facade: 'metal' },
  };
  // 长图要撑到 10 分钟就是 ~170 屏、按 3 屏一段算 55+ 段。
  // 13 个主题不够分：要么一段拖到 15 屏（同质感最强），要么同一主题十几轮后开始复读。
  // 所以补 9 个「几何真的不同」的主题（不是换色），把可用组合抬到 22 主题 × 3 变体。
  const MORE = {
    tramline: { name: '有轨电车街', ground: 'asphalt', level: 'street', indoor: false, danger: 0.44, len: [760, 980],
      band: [GY - 12, GY + 8],
      feat: { flat: 38, curb: 14, stepUp: 10, trench: 8, ledge: 10, stair: 8 },
      props: ['rail', 'sleeper', 'tramcar', 'catenary', 'signalbox', 'shoppingcart', 'trashbag', 'debrispile'],
      decal: { crack: 0.4, stain: 0.4, scorch: 0.15, graffiti: 0.45, vine: 0.15, infection: 0.3 },
      landmark: ['stranded_tram', 'tilted_catenary'], facade: 'brick' },
    park: { name: '废弃公园', ground: 'dirt', level: 'street', indoor: false, danger: 0.34, len: [720, 960],
      gapMul: 3.4, floorsMax: 2, wall: 'fence',
      band: [GY - 20, GY + 10],
      feat: { flat: 46, curb: 12, stepUp: 8, stepDown: 8, trench: 4, ledge: 6 },
      props: ['tree', 'bench', 'fountain', 'playground', 'trashbag', 'pottedplant', 'lamppost2'],
      decal: { crack: 0.2, stain: 0.3, scorch: 0.05, graffiti: 0.3, vine: 0.7, infection: 0.45 },
      landmark: ['broken_fountain', 'big_dead_tree'], facade: 'brick' },
    construction: { name: '建筑工地', ground: 'dirt', level: 'street', indoor: false, danger: 0.50, len: [780, 1020],
      gapMul: 2.2, floorsMax: 3,
      band: [GY - 26, GY + 12],
      feat: { flat: 26, stepUp: 16, ledge: 16, trench: 14, stair: 12, ramp: 10 },
      props: ['scaffold', 'cementmixer', 'cautiontape', 'rebar', 'concreteblock', 'fallrock', 'barrel'],
      decal: { crack: 0.5, stain: 0.3, scorch: 0.1, graffiti: 0.2, vine: 0.1, infection: 0.15 },
      landmark: ['tower_crane', 'mixer_rig'], facade: 'concrete' },
    mall: { name: '商场中庭', ground: 'tile', level: 'indoor', indoor: true, danger: 0.68, len: [900, 1180],
      gapMul: 1.8, floorsMax: 5,
      band: [GY - 44, GY - 6],
      feat: { flat: 40, stepUp: 8, stepDown: 8, stair: 16, curb: 10, ledge: 6 },
      props: ['escalator', 'kiosk', 'planter', 'bench', 'vending', 'trashbag', 'luggage'],
      decal: { crack: 0.2, stain: 0.45, scorch: 0.1, graffiti: 0.2, vine: 0.1, infection: 0.35 },
      landmark: ['atrium_skylight', 'collapsed_escalator'], facade: 'tile' },
    dock: { name: '货运码头', ground: 'concrete', level: 'street', indoor: false, danger: 0.56, len: [860, 1120],
      gapMul: 2.2, floorsMax: 2,
      band: [GY - 18, GY + 10],
      feat: { flat: 34, stepUp: 12, ledge: 14, trench: 10, stair: 10, curb: 10 },
      props: ['container', 'bollard', 'cargoNet', 'palletstack', 'drum', 'crate', 'chainhoist'],
      decal: { crack: 0.35, stain: 0.5, scorch: 0.15, graffiti: 0.3, vine: 0.1, infection: 0.2 },
      landmark: ['cargo_crane', 'container_wall'], facade: 'metal' },
    flooded: { name: '被淹街区', ground: 'asphalt', level: 'street', indoor: false, danger: 0.62, len: [780, 1020],
      gapMul: 1.6, floorsMax: 3,
      band: [GY - 6, GY + 26],
      feat: { flat: 36, stepUp: 10, stepDown: 12, trench: 12, curb: 10, ledge: 8 },
      props: ['halfSubmergedCar', 'buoy', 'sandbagwall', 'trashbag', 'barrel', 'fencepanel'],
      decal: { crack: 0.3, stain: 0.6, scorch: 0.05, graffiti: 0.25, vine: 0.25, infection: 0.3 },
      landmark: ['flood_wall', 'roof_island'], facade: 'brick' },
    sublevel: { name: '地下停车场', ground: 'concrete', level: 'under', indoor: true, danger: 0.78, len: [820, 1060],
      band: [GY + 92, GY + 148],
      feat: { flat: 40, curb: 14, stepUp: 10, stepDown: 10, ledge: 10, trench: 6 },
      props: ['carwreck', 'parkingsign', 'concretepyramid', 'shoppingcart', 'pipebundle', 'fencepanel'],
      decal: { crack: 0.35, stain: 0.55, scorch: 0.1, graffiti: 0.4, vine: 0.05, infection: 0.45 },
      landmark: ['ramp_gate', 'stairwell_cage'], facade: 'concrete' },
    skybridge: { name: '空中连廊', ground: 'grating', level: 'raised', indoor: false, danger: 0.70, len: [720, 940],
      gapMul: 3.0, floorsMax: 2,
      band: [GY - 160, GY - 92],
      feat: { flat: 30, gap: 18, stepUp: 16, ledge: 16, stair: 12, trench: 4 },
      props: ['glassPanel', 'railing2', 'acunit', 'planter', 'ventduct', 'trashbag'],
      decal: { crack: 0.25, stain: 0.3, scorch: 0.1, graffiti: 0.15, vine: 0.1, infection: 0.25 },
      landmark: ['glass_bridge', 'snapped_span'], facade: 'glass' },
    military: { name: '军事检查站', ground: 'concrete', level: 'street', indoor: false, danger: 0.84, len: [760, 980],
      gapMul: 1.9, floorsMax: 2,
      band: [GY - 14, GY + 8],
      feat: { flat: 32, curb: 16, stepUp: 12, trench: 12, ledge: 12, stair: 8 },
      props: ['sandbagwall', 'razorwire', 'humvee', 'sentrybox', 'searchlight', 'barrier', 'cone'],
      decal: { crack: 0.4, stain: 0.3, scorch: 0.4, graffiti: 0.15, vine: 0.05, infection: 0.15 },
      landmark: ['humvee_checkpoint', 'watchtower2'], facade: 'concrete' },
  };
  Object.assign(THEMES, MORE);
  // 推荐顺序（首尾固定，中间允许插入过渡主题）
  const SPINE = ['blockade', 'market', 'overpass', 'hospital', 'rooftop', 'metro', 'tunnel', 'warehouse', 'plaza'];
  const EXTRAS = ['parking', 'sidewalk', 'railway', 'depot', 'tramline', 'park', 'construction',
    'mall', 'dock', 'flooded', 'sublevel', 'skybridge', 'military'];

  // ---------- 剖面工具 ----------
  // prof 是一个「每个 COL 采样一次」的地面高度数组。所有台阶/断口/楼梯都写进这里，
  // 于是「道路高度在区段之间真实连接」是结构性保证，而不是事后对齐。
  function makeProfile(nCols) {
    const y = new Array(nCols).fill(GY);
    return {
      n: nCols, y, xMax: nCols * COL,     // 截断上界：特征不许写进下一段的交接区

      colOf(x) { return Math.max(0, Math.min(nCols - 1, Math.round(x / COL))); },
      at(x) { return y[this.colOf(x)]; },
      set(x0, x1, v) { const e = this.colOf(Math.min(x1, this.xMax)); for (let k = this.colOf(x0); k <= e; k++) y[k] = v; },
      ramp(x0, x1, v0, v1) {
        const k0 = this.colOf(x0), k1 = Math.max(k0, this.colOf(Math.min(x1, this.xMax)));
        for (let k = k0; k <= k1; k++) y[k] = Math.round(v0 + (v1 - v0) * (k1 === k0 ? 1 : (k - k0) / (k1 - k0)));
      },
    };
  }

  // 剖面上实际发生的落差次数（≥9px 记一次）：这是「有没有起伏」的硬指标，
  // 不能靠数楼梯/断口的条数——特征被 band 夹住时高度其实没变。
  function levelChanges(P, x0, x1) {
    let n = 0, prev = null;
    for (let k = P.colOf(x0); k <= P.colOf(x1); k++) {
      const v = P.y[k];
      if (prev !== null && Math.abs(v - prev) >= 9) n++;
      prev = v;
    }
    return n;
  }

  // 剖面收口：任何相邻列的高差都必须 ≤ 一跳极限，否则那一跳就是设计之外的墙。
  // 特征内部的写入边界用 x+w-1 / x+3COL+w 这类表达式，round 到列时偶尔会漏写一两列，
  // 漏掉的那一列留着上一轮的旧高度，于是出现「8px 宽、54px 深」的假断层 —— 与其继续
  // 逐个特征抠边界，不如在剖面完成后统一收口：超限的高差就地摊成几级台阶（啃掉的是
  // 后面的平地，视觉上正好是一小段碎石台阶，不是补丁）。
  function smoothSteps(P) {
    let fixed = 0;
    for (let k = 1; k < P.n - 1; k++) {
      const d = P.y[k] - P.y[k - 1];
      if (Math.abs(d) <= LIM.riser) continue;
      const m = Math.max(2, Math.ceil(Math.abs(d) / LIM.riser) + 1);
      for (let i = 0; i < m && k + i < P.n; i++) P.y[k + i] = Math.round(P.y[k - 1] + d * (i + 1) / m);
      fixed++;
      k += m - 1;
    }
    return fixed;
  }

  // 区段变体：同一主题在长图里会出现十几轮，光换 seed 换不掉「刚走过这里」的感觉。
  // 变体改的是「这里发生过什么」——植被侵占 / 火烧废墟，几何细节与色调一起变。
  const VARIANT = [
    { key: 'plain', suffix: '', mul: { crack: 1, stain: 1, scorch: 1, graffiti: 1, vine: 1, infection: 1 } },
    { key: 'overgrown', suffix: '绿陷', mul: { crack: 0.7, stain: 1.1, scorch: 0.4, graffiti: 1.1, vine: 2.6, infection: 1.9 } },
    { key: 'burnt', suffix: '灰烬', mul: { crack: 1.3, stain: 1.4, scorch: 2.8, graffiti: 0.6, vine: 0.3, infection: 0.6 } },
    { key: 'fog', suffix: '浓雾', mul: { crack: 1, stain: 1.2, scorch: 0.9, graffiti: 0.7, vine: 0.7, infection: 1.1 } },
  ];

  // ---------- 区段序列 ----------
  function pickSegments(rng, wantCount) {
    const n = Math.max(8, Math.min(80, wantCount));
    // 只有「中段主题」可以循环推进；blockade（开局）与 plaza（撤离终点）各只出现一次。
    // 早期版本整条 SPINE 连首尾一起循环，结果 10 分钟的图里「到达撤离广场」发生六次。
    const MID = SPINE.slice(1, -1);
    const body = [];
    let guard = 0;
    while (body.length < n - 2 && guard++ < 40) {
      const act = MID.slice();
      const swaps = rng.int(1, 3);
      for (let i = 0; i < swaps; i++) {
        const at = rng.int(0, act.length - 1);
        for (let t = 0; t < 8; t++) {
          const cand = rng.pick(EXTRAS);
          const prev = act[at - 1], next = act[at + 1];
          if (cand !== prev && cand !== next) { act[at] = cand; break; }
        }
      }
      body.push(...act);
    }
    const seq = ['blockade', ...body.slice(0, n - 2), 'plaza'];
    // 相邻同主题兜底去重。注意不能改最后一个元素：它刚被钉成 plaza，
    // 上一版在这里把「撤离广场」换掉了，首尾骨架就断了 —— 撞在末位时改它前一个。
    for (let pass = 0; pass < 3; pass++) {
      let dirty = false;
      for (let i = 1; i < n; i++) {
        if (seq[i] !== seq[i - 1]) continue;
        if (i === n - 1) {
          const av = new Set([seq[i - 2], seq[i]]);
          const alt2 = EXTRAS.filter(t => !av.has(t));
          if (alt2.length) { seq[i - 1] = rng.pick(alt2); dirty = true; }
          continue;
        }
        const av = new Set([seq[i - 1], seq[i + 1]]);
        const alt = EXTRAS.filter(t => !av.has(t));
        if (alt.length) { seq[i] = rng.pick(alt); dirty = true; }
      }
      if (!dirty) break;
    }
    return seq;
  }

  // ---------- 地形特征 ----------
  // 每个特征返回「出口高度」，出口必须与入口连续，且任何一级高差都不得超过 LIM.riser。
  function applyFeature(P, rng, kind, x, y, band, seg) {
    const len = () => rng.int(3, 6) * COL;
    const clampBand = v => Math.max(band[0], Math.min(band[1], v));
    switch (kind) {
      case 'flat': {
        const w = rng.int(8, 20) * COL;
        P.set(x, x + w, y);
        return { x: x + w, y };
      }
      case 'curb': {                                 // 路缘石：抬 16~22，可跳可跨
        const h = rng.int(16, 22), w = rng.int(8, 16) * COL;
        P.set(x, x + 2 * COL - 1, y);
        P.set(x + 2 * COL, x + w, y - h);
        P.set(x + w + COL, x + w + 3 * COL, y - h);
        P.set(x + w + 4 * COL, x + w + 6 * COL, y);
        return { x: x + w + 6 * COL, y };
      }
      case 'stepUp': {                               // 单级跳台：≤LIM.riser
        const h = rng.int(26, LIM.riser), w = rng.int(6, 12) * COL;
        P.set(x, x + w - 1, y);
        P.set(x + w, x + w + rng.int(6, 14) * COL, clampBand(y - h));
        return { x: x + w + 8 * COL, y: clampBand(y - h) };
      }
      case 'stepDown': {
        const h = rng.int(26, LIM.riser), w = rng.int(6, 12) * COL;
        P.set(x, x + w - 1, y);
        const ny = clampBand(y + h);
        P.set(x + w, x + w + rng.int(6, 14) * COL, ny);
        return { x: x + w + 8 * COL, y: ny };
      }
      case 'ramp': {                                 // 坡道＝一串 18~22 的台阶（AABB 引擎里没有斜坡行走）
        const up = rng.chance(0.6), steps = rng.int(4, 7), rise = up ? -rng.int(18, 22) : rng.int(18, 22);
        let yy = y, cx = x;
        for (let i = 0; i < steps; i++) {
          const t = rng.int(3, 4) * COL;
          P.set(cx, cx + t - 1, yy);
          yy = clampBand(yy + rise); cx += t;
        }
        P.set(cx, cx + 4 * COL, yy);
        return { x: cx + 4 * COL, y: yy };
      }
      case 'stair': {                                // 楼梯井：连续小踏步，视觉与碰撞都是台阶
        const up = rng.chance(0.55), steps = rng.int(5, 9), rise = (up ? -1 : 1) * rng.int(18, 22), run = 3 * COL;
        let yy = y, cx = x;
        for (let i = 0; i < steps; i++) {
          P.set(cx, cx + run - 1, yy);
          yy = clampBand(yy + rise); cx += run;
        }
        seg.stairs.push({ x0: x, x1: cx, y0: y, y1: yy, up, run, rise });
        P.set(cx, cx + 5 * COL, yy);
        return { x: cx + 5 * COL, y: yy };
      }
      case 'ledge': {                                // 塌落平台：先下 30~44 再上一段，形成两层
        const h = rng.int(30, LIM.riser), w = rng.int(10, 18) * COL;
        P.set(x, x + COL, y);
        P.set(x + 2 * COL, x + w, clampBand(y + h));
        return { x: x + w + COL, y: clampBand(y + h) };
      }
      case 'trench': {                               // 小型断口：掉下去也爬得出来
        // 深度必须 ≤LIM.riser：断口底到路面若超过一跳的高度，掉进去就是死坑，
        // 玩家靠跳跃跨过去不算数 —— 追击者会掉进来，然后永远出不去。
        const g = rng.int(4, Math.max(4, Math.round(LIM.gapMain / COL))), d = rng.int(28, LIM.climbOut);
        const w = g * COL;
        P.set(x, x + COL, y);
        P.set(x + 2 * COL, x + 2 * COL + w - 1, y + d);
        P.set(x + 2 * COL + w, x + 3 * COL + w, y);
        seg.trenches.push({ x0: x + 2 * COL, x1: x + 2 * COL + w, y, depth: d });
        return { x: x + 4 * COL + w, y };
      }
      case 'gap': {                                  // 断桥断口：底下仍有一层可站（不能是死坑）
        const w = rng.int(5, 8) * COL, d = rng.int(30, LIM.climbOut);
        P.set(x, x + COL, y);
        P.set(x + 2 * COL, x + 2 * COL + w, y + d);
        P.set(x + 3 * COL + w, x + 4 * COL + w, y);
        seg.trenches.push({ x0: x + 2 * COL, x1: x + 2 * COL + w, y, depth: d });
        return { x: x + 5 * COL + w, y };
      }
      default: {
        const w = rng.int(8, 16) * COL;
        P.set(x, x + w, y);
        return { x: x + w, y };
      }
    }
  }

  // ---------- 建筑骨架 ----------
  // 建筑永远贴着已确定的剖面生成：地基落在路面上、门洞对准路线高度，
  // 所以「先路径后建筑」，不会出现门开在半空、楼梯悬空。
  function buildStructures(rng, M, seg, opts) {
    const dens = opts.density;
    const L = THEMES[seg.theme];
    let x = seg.x0;
    const out = [];
    while (x < seg.x1 - 120) {
      const w = rng.int(150, 320);
      // 底边取范围内最低的路面：取「中心路面」会在相邻建筑高差处留下一条缝，
      // 从缝里能看见后面的天空，楼就像浮起来。
      let gyLow = -1e9;
      for (let q = x; q <= x + w; q += COL) gyLow = Math.max(gyLow, M.prof.at(q));
      const gy = gyLow;
      const fmax = seg.level === 'under' ? 1 : (L.floorsMax || 4);
      const floors = rng.int(1, fmax);
      const fh = rng.int(88, 116);
      const h = Math.max(70, floors * fh + rng.int(10, 30));
      const depth = rng.chance(0.35) ? 1 : 0;        // 是否往镜头后来一层（2.5D）
      out.push({
        kind: 'block', x: Math.round(x), y: Math.round(gy - h), w, h, floors, fh,
        mat: THEMES[seg.theme].facade, seg: seg.i, depth,
        roof: rng.weighted({ flat: 50, parapet: 30, slope: 18, gear: 22 }),
        sign: rng.chance(seg.theme === 'market' || seg.theme === 'sidewalk' ? 0.75 : 0.28),
        awning: rng.chance(0.3), bays: Math.max(2, Math.round(w / rng.int(52, 74))),
      });
      x += w + Math.round(rng.int(26, 86) * (L.gapMul || 1) / Math.max(0.4, dens));
    }
    return out;
  }

  // ---------- 支路（楼上 / 地下 / 室内），必须重汇入主路线 ----------
  // 「重汇入」不是画个箭头就算：末端必须存在一个汇合点，满足
  //   路面不高于平台末端（踏空落回主线）或 平台末端只比路面低一跳以内（往上跳回来）。
  // 找不到就把平台链往主线方向续几级再找；仍找不到就整条丢弃 —— 留下回不去的支路比没有支路糟得多。
  function joinPoint(M, endY, fromX) {
    for (let x = fromX; x < fromX + 900 && x < M.world.w - 60; x += COL) {
      const gy = M.prof.at(x);
      // 落回主线：路面可以更低（往下跳），但不能低太多，否则「近路」变成一次单向坠楼
      if (gy >= endY - LIM.riser && gy <= endY + LIM.joinDropMax) return x;
    }
    return -1;
  }
  function buildBranches(rng, M, seg, opts) {
    const out = [];
    const v = opts.vertical;
    if (!rng.chance(0.42 + v * 0.4)) return out;
    const x0 = seg.x0 + rng.int(120, Math.max(140, seg.w - 560));
    const w = rng.int(260, 520);
    const gy = M.prof.at(x0 + w / 2);
    const up = seg.level !== 'under';
    const plats = [];
    let px = x0, py = gy;
    const stepN = rng.int(4, 8);
    for (let i = 0; i < stepN; i++) {
      const t = rng.int(76, 118);
      py = Math.round(py + (up ? -1 : 1) * rng.int(26, LIM.riser));
      plats.push({ x: Math.round(px), y: py, w: t, h: 14, mat: 'metal' });
      px += t + rng.int(26, 58);
    }
    if (!plats.length) return out;
    let endY = plats[plats.length - 1].y;
    let joinX = joinPoint(M, endY, px + 20);
    let extra = 0;
    while (joinX < 0 && extra++ < 8) {                 // 续几级台阶朝主线方向找回落点
      const t = rng.int(70, 100);
      py = Math.round(py + (up ? 1 : -1) * rng.int(26, LIM.riser));
      plats.push({ x: Math.round(px), y: py, w: t, h: 14, mat: 'metal' });
      px += t + rng.int(26, 52);
      endY = py;
      joinX = joinPoint(M, endY, px + 20);
    }
    if (joinX < 0) return out;                         // 回不去 → 丢弃
    out.push({
      kind: up ? 'roof' : 'cellar', seg: seg.i, x0: Math.round(x0), x1: Math.round(px),
      y: Math.min(...plats.map(p => p.y)), plats, joinX: Math.round(joinX),
      joinY: Math.round(M.prof.at(joinX)), entryY: Math.round(gy), endY: Math.round(endY),
      joinDrop: Math.round(M.prof.at(joinX) - endY),   // 正=落回主线，负=需往上跳（|·|≤LIM.riser）
    });
    return out;
  }

  // ---------- 道具：区间账本放置 + 挡路检查 ----------
  const ITEM = {
    // w/h=占位，solid=是否参与碰撞（默认装饰），block=会不会挡住通行
    barricade: { w: 74, h: 46 }, sandbag: { w: 52, h: 26 }, tirepile: { w: 40, h: 30 }, cone: { w: 16, h: 26 },
    roadblock: { w: 96, h: 30 }, militarycrate: { w: 44, h: 40 }, searchlight: { w: 26, h: 62 },
    shelf: { w: 86, h: 92 }, cart: { w: 52, h: 44 }, vending: { w: 46, h: 86 }, crate: { w: 40, h: 34 },
    trashbag: { w: 34, h: 26 }, awning: { w: 120, h: 26 }, pallet: { w: 62, h: 18 }, luggage: { w: 34, h: 28 },
    girder: { w: 150, h: 30 }, concreteblock: { w: 70, h: 48 }, rebar: { w: 46, h: 34 }, fallrock: { w: 34, h: 26 },
    barrier: { w: 66, h: 34 }, oilspill: { w: 90, h: 8 }, carwreck: { w: 150, h: 62 },
    bed: { w: 96, h: 40 }, ivstand: { w: 20, h: 66 }, curtainrail: { w: 110, h: 12 }, wheelchair: { w: 46, h: 52 },
    medicalcart: { w: 52, h: 42 }, biohazardbin: { w: 36, h: 44 }, stretcher: { w: 86, h: 22 }, quarantinegate: { w: 130, h: 78 },
    acunit: { w: 54, h: 34 }, watertank: { w: 74, h: 62 }, ventduct: { w: 46, h: 30 }, antenna: { w: 14, h: 86 },
    solarpanel: { w: 76, h: 22 }, pottedplant: { w: 30, h: 40 }, skylight: { w: 56, h: 16 }, fireladder: { w: 96, h: 14 },
    turnstile: { w: 40, h: 34 }, ticketmachine: { w: 44, h: 78 }, adboard: { w: 96, h: 62 }, bench: { w: 86, h: 30 },
    luggageset: { w: 56, h: 30 }, manhole: { w: 44, h: 8 }, stairrail: { w: 120, h: 40 },
    pipebundle: { w: 130, h: 34 }, valve: { w: 30, h: 34 }, pump: { w: 56, h: 52 }, cablespool: { w: 52, h: 44 },
    maintank: { w: 78, h: 56 }, warningboard: { w: 46, h: 40 }, steamvent: { w: 34, h: 22 },
    rack: { w: 120, h: 108 }, palletstack: { w: 66, h: 62 }, drum: { w: 34, h: 44 }, forklift: { w: 96, h: 62 },
    conveyor: { w: 160, h: 30 }, container: { w: 200, h: 78 }, chainhoist: { w: 26, h: 70 },
    helipadmark: { w: 150, h: 8 }, sandbagwall: { w: 96, h: 40 }, spotlight: { w: 30, h: 78 }, truck: { w: 190, h: 86 },
    flagpole: { w: 12, h: 110 }, medkitcrate: { w: 44, h: 36 },
    parkingpyramid: { w: 30, h: 22 }, concretepyramid: { w: 30, h: 22 }, parkingsign: { w: 16, h: 90 }, shoppingcart: { w: 52, h: 44 }, fencepanel: { w: 120, h: 52 },
    displayrack: { w: 70, h: 84 }, marketstall: { w: 96, h: 60 }, flowerpot: { w: 30, h: 34 }, chairset: { w: 40, h: 36 }, bicycle: { w: 66, h: 46 }, billboard: { w: 150, h: 90 }, shutter_row: { w: 140, h: 70 },
    rail: { w: 200, h: 8 }, sleeper: { w: 60, h: 10 }, tramcar: { w: 220, h: 84 }, catenary: { w: 20, h: 120 },
    signalbox: { w: 40, h: 56 }, debrispile: { w: 70, h: 34 },
    tree: { w: 56, h: 112 }, fountain: { w: 112, h: 56 }, playground: { w: 92, h: 66 }, lamppost2: { w: 14, h: 96 },
    scaffold: { w: 96, h: 122 }, cementmixer: { w: 112, h: 70 }, cautiontape: { w: 120, h: 26 },
    escalator: { w: 172, h: 112 }, kiosk: { w: 122, h: 80 }, planter: { w: 46, h: 38 },
    bollard: { w: 16, h: 34 }, cargoNet: { w: 72, h: 54 }, buoy: { w: 28, h: 32 }, halfSubmergedCar: { w: 152, h: 46 },
    glassPanel: { w: 82, h: 98 }, railing2: { w: 112, h: 42 }, razorwire: { w: 92, h: 46 },
    humvee: { w: 162, h: 76 }, sentrybox: { w: 54, h: 66 },
    workbench: { w: 110, h: 44 }, jackstand: { w: 30, h: 48 }, tirestack: { w: 46, h: 46 }, toolchest: { w: 52, h: 60 },
    oilpan: { w: 44, h: 10 }, busframe: { w: 230, h: 96 }, hoist: { w: 34, h: 88 },
  };
  // 会挡路的大型件：不得压在门口/楼梯口/检查点/断口起落点/支路汇合点
  const KEEP_CLEAR = 46;

  // 只有「大件」才需要避开关键点位： cone / 垃圾袋 / 油渍 这类小件挡不住任何人，
  // 全按同一标准留空会把整段刷成禁区（上一版实测：20 seed 道具数直接归零）。
  const isHard = (key, it) => it.w >= 60 || it.h >= 40;
  function placeProps(rng, M, seg, opts) {
    const out = [];
    const pool = THEMES[seg.theme].props;
    const n = Math.round((seg.w / 105) * opts.props * (0.7 + opts.detail * 0.5));
    seg.propTried = n;
    const keep = seg.clear.map(c => [c.x0 - KEEP_CLEAR, c.x1 + KEEP_CLEAR]);
    const occ = [];
    const small = pool.filter(k => (ITEM[k] || { w: 40 }).w <= 46);
    for (let i = 0; i < n; i++) {
      let tries = 0, placed = false;
      while (tries++ < 26 && !placed) {
        // 前 12 次按主题池随机；老是塞不下就退化成小件 ——
        // 否则「大件放不下」会直接变成道具数量缺口，密集参数下实测成功率只有 45%。
        const key = tries > 12 && small.length ? rng.pick(small) : rng.pick(pool);
        const it = ITEM[key] || { w: 40, h: 30 };
        const w = it.w, h = it.h, hard = isHard(key, it);
        const x = Math.round(seg.x0 + rng.real(16, Math.max(24, seg.w - w - 16)));
        const span = [x, x + w];
        if (occ.some(o => span[0] < o[1] && span[1] > o[0])) continue;          // 任何道具都不许互相压
        if (hard && keep.some(b => span[0] < b[1] && span[1] > b[0])) continue;  // 大件还得避开要冲
        const gy = M.prof.at(x + w / 2);
        out.push({ kind: key, x, y: Math.round(gy - h), w, h, seg: seg.i, hard, seed: rng.int(0, 9999) });
        occ.push(span);
        placed = true;
      }
    }
    return out;
  }

  // ---------- 污损 / 感染 / 灯光 ----------
  function buildDecals(rng, M, seg, opts) {
    const dd = THEMES[seg.theme].decal, mul = VARIANT[seg.variant || 0].mul;
    const d = {}; for (const k in dd) d[k] = dd[k] * (mul[k] === undefined ? 1 : mul[k]);
    const out = [], lights = [];
    const ruin = opts.ruin, inf = opts.infection;
    const put = (kind, w, h) => {
      const x = Math.round(seg.x0 + rng.real(0, Math.max(1, seg.w - w)));
      out.push({ kind, x, y: Math.round(M.prof.at(x + w / 2) - rng.int(0, 3)), w, h, seed: rng.int(0, 9999), seg: seg.i });
    };
    const cnt = Math.round((seg.w / 150) * (0.4 + ruin));
    for (let i = 0; i < cnt; i++) {
      const r = rng.next();
      if (r < d.crack * 0.4 * ruin) put('crack', rng.int(40, 130), 6);
      else if (r < (d.crack * 0.4 + d.stain * 0.3) * ruin) put('stain', rng.int(30, 90), rng.int(8, 22));
      else if (r < 0.86) put('rubble', rng.int(10, 34), rng.int(4, 12));
    }
    const ic = Math.round((seg.w / 300) * d.infection * inf);
    for (let i = 0; i < ic; i++) put(rng.chance(0.5) ? 'growth' : 'slime', rng.int(24, 80), rng.int(10, 34));
    // 局部灯光：由区段类型决定，夜里才显眼
    const lc = Math.max(1, Math.round(seg.w / rng.int(300, 460)));
    for (let i = 0; i < lc; i++) {
      const x = Math.round(seg.x0 + (i + 0.5) * (seg.w / lc) + rng.real(-40, 40));
      const gy = M.prof.at(x);
      const kind = seg.theme === 'hospital' ? 'emergency' : seg.theme === 'tunnel' ? 'tunnelLamp' :
        seg.theme === 'metro' ? 'platform' : seg.theme === 'plaza' ? 'floodlight' :
          seg.theme === 'market' || seg.theme === 'sidewalk' ? 'neon' : 'street';
      lights.push({ kind, x, y: Math.round(gy - rng.int(70, 150)), r: rng.int(90, 190),
        hue: kind === 'emergency' ? '255,80,70' : kind === 'neon' ? '120,220,255' : kind === 'floodlight' ? '255,240,190' : '255,205,120',
        flicker: kind === 'neon' || kind === 'emergency' ? rng.real(0.2, 0.6) : 0, seg: seg.i });
    }
    return { out, lights };
  }

  // ---------- 碰撞体 + 空间分桶 ----------
  function emitSolids(M, opts) {
    const S = [];
    const push = (x, y, w, h, o) => { if (w > 0 && h > 0) S.push(Object.assign({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), oneway: false, mat: 'concrete' }, o || {})); };
    // 主路线：把剖面里连续同高的列并成一条矩形，底下一直填到世界底
    let k = 0;
    while (k < M.prof.n) {
      let j = k;
      while (j + 1 < M.prof.n && M.prof.y[j + 1] === M.prof.y[k]) j++;
      push(k * COL, M.prof.y[k], (j - k + 1) * COL, WH - M.prof.y[k], { mat: M.segAt(k * COL).ground, main: true });
      k = j + 1;
    }
    // 世界两侧边界
    push(-40, 0, 40, WH, { mat: 'concrete', bound: true });
    push(M.world.w, 0, 40, WH, { mat: 'concrete', bound: true });
    // 立面不做碰撞：背景建筑是「看得见走不进」的剖面，
    // 一旦在路面高度补一段实墙，就会把主路线像切蛋糕一样切开（第一版实测画面被墙糊满）。
    // 真正需要「穿过去」的建筑由 rooms 表达，那里的门洞与楼板高差都是按剖面生成的。
    // 支路平台：单向，可跳上、可跳下
    for (const br of M.branches) for (const p of br.plats) push(p.x, p.y, p.w, p.h, { oneway: true, mat: p.mat, side: true });
    // 检查点/地标不做碰撞，纯视觉
    M.solids = S;
    // 分桶：128px 一桶，渲染裁剪与物理查询都用它
    const B = 128, nb = Math.ceil(M.world.w / B) + 2;
    const buckets = M.buckets = new Array(nb).fill(0).map(() => []);
    S.forEach((s, i) => {
      const a = Math.max(0, Math.floor(s.x / B)), b = Math.min(nb - 1, Math.floor((s.x + s.w) / B));
      for (let q = a; q <= b; q++) buckets[q].push(i);
    });
    M.bucketSize = B;
  }
  function nearSolids(M, x0, x1) {
    const B = M.bucketSize, a = Math.max(0, Math.floor(x0 / B)), b = Math.min(M.buckets.length - 1, Math.floor(x1 / B));
    const out = [], seen = M._seen || (M._seen = new Set());
    seen.clear();
    for (let q = a; q <= b; q++) for (const i of M.buckets[q]) if (!seen.has(i)) { seen.add(i); out.push(M.solids[i]); }
    return out;
  }

  // ---------- 通行验证器：与游戏同构的 AABB + 跳跃 ----------
  // 这不是「几何近似」，而是真的按 dt 积分、真的撞 solids、真的起跳，
  // 所以它过了就是真的能走通；追击者用同一份代码（速度档不同）。
  function walker(M, o) {
    const e = { x: o.x, y: o.y, vx: 0, vy: 0, w: MOVE.w, h: MOVE.h, onGround: false };
    const speed = o.speed || MOVE.speed, g = MOVE.g, jv = -MOVE.jumpV;
    const dir = o.dir || 1, maxF = o.maxFrames || 4000;
    let stuck = 0, lastX = e.x, jumpHold = 0, frames = 0, minDx = 1e9, blockedAt = null;
    const land = [];
    for (let i = 0; i < maxF; i++) {
      const dt = 1 / 60;
      const solids = nearSolids(M, e.x - 200, e.x + 200);
      // 被挡住就起跳：和 ai.js 的人类/僵尸同一策略
      const ahead = e.x + dir * (e.w + 2);
      const wall = !e.onGround ? false : solids.some(s => !s.oneway &&
        ahead < s.x + s.w && ahead + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y);
      if (wall || stuck > 8) jumpHold = 8;
      if (o.forceJump && o.forceJump(e, i)) jumpHold = 8;
      e.vx = dir * speed * (o.speedMul || 1);
      if (jumpHold > 0 && e.onGround) { e.vy = jv; e.onGround = false; }
      if (jumpHold > 0) jumpHold--;
      e.vy += g * dt; if (e.vy > 1250) e.vy = 1250;
      // X
      e.x += e.vx * dt;
      for (const s of solids) {
        if (s.oneway) continue;
        if (e.x < s.x + s.w && e.x + e.w > s.x && e.y < s.y + s.h && e.y + e.h > s.y) {
          if (e.vx > 0) e.x = s.x - e.w; else if (e.vx < 0) e.x = s.x + s.w;
          e.vx = 0;
        }
      }
      // Y
      const prevBottom = e.y + e.h;
      e.y += e.vy * dt;
      e.onGround = false;
      for (const s of solids) {
        if (e.x >= s.x + s.w || e.x + e.w <= s.x) continue;
        if (e.y >= s.y + s.h || e.y + e.h <= s.y) continue;
        if (s.oneway) { if (e.vy > 0 && prevBottom <= s.y + 12) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; } continue; }
        if (e.vy > 0) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; } else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
      }
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return { ok: false, reason: 'NaN', x: e.x, frames: i };
      if (e.y > WH + 80) return { ok: false, reason: 'FELL', x: e.x, frames: i };
      const dx = Math.abs(e.x - lastX);
      if (dx < 0.5 && e.onGround) stuck++; else stuck = 0;
      if (e.onGround) minDx = Math.min(minDx, dx);
      lastX = e.x;
      if (blockedAt === null && stuck > 40) blockedAt = Math.round(e.x);
      if (o.onStep) o.onStep(e, i);
      if (e.x >= (o.to || M.world.w)) { land.push(Math.round(e.x)); return { ok: true, x: e.x, frames: i, stuckAt: blockedAt }; }
      frames = i;
      if (stuck > 150) return { ok: false, reason: 'STUCK', x: Math.round(e.x), frames: i, stuckAt: blockedAt };
    }
    return { ok: false, reason: 'TIMEOUT', x: Math.round(e.x), frames, stuckAt: blockedAt };
  }

  // 支路验证：从入口沿平台链跳，末端必须能落回主路线（joinX 处高度差 ≤ 安全坠落）
  function validateSide(M, br) {
    const r = walker(M, { x: br.x0, y: M.prof.at(br.x0) - MOVE.h - 1, to: br.x1 + 20, speed: MOVE.speed, maxFrames: 1200, dir: 1 });
    return { ok: !!r.ok, drop: br.joinDrop, reason: r.reason || '' };
  }

  // ---------- 主入口 ----------
  function build(seed, opts0) {
    const o = Object.assign({
      minutes: 0, screens: 15, chase: 0.55, density: 1, indoor: 0.5, vertical: 0.6,
      ruin: 0.55, infection: 0.5, props: 1, detail: 1, timeOfDay: 'day',
      solidBuildings: false,
    }, opts0 || {});
    // 给了「目标时长」就按时长反算屏数；时长参数优先于屏数参数
    if (o.minutes) o.screens = screensForMinutes(o.minutes);
    o.eta = +minutesForScreens(o.screens).toFixed(2);
    const rng = makeRng(seed);
    // 一段 ≈3 屏：短图守住「8~12 段」，长图按比例扩段 ——
    // 否则 170 屏会被摊成 11 个 15 屏巨型区段，同质感直接爆表。
    const wantN = o.screens <= 18 ? Math.round(o.screens * 0.72) : Math.round(o.screens / 3.1);
    const seq = pickSegments(rng, wantN);
    const WW = Math.round(o.screens * CW);
    // 按权重把 WW 分给各段，每段 ≥700
    const weights = seq.map(t => THEMES[t].len[1]);
    const wsum = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    const hubUsed = {};
    const segs = seq.map((t, i) => {
      const L = THEMES[t];
      let w = Math.round(WW * weights[i] / wsum);
      w = Math.max(700, Math.min(w, WW - acc - 700 * (seq.length - i - 1)));
      // 变体按「这个主题还没用过的变体优先」分配：纯随机下 55 段只能凑到 33 个唯一组合，
      // 同一副面孔要看到三四遍；错开分配后唯一度直接抬到 0.8 以上。
      const used = (hubUsed[t] = hubUsed[t] || []);
      const free = VARIANT.map((_, k) => k).filter(k => used.indexOf(k) < 0);
      const v = free.length ? rng.pick(free) : rng.int(0, VARIANT.length - 1);
      used.push(v);
      const prog = seq.length > 1 ? i / (seq.length - 1) : 0;
      const s = { i, theme: t, variant: v, vSeed: rng.int(0, 99999),
        name: L.name + (VARIANT[v].suffix ? ' · ' + VARIANT[v].suffix : ''),
        x0: acc, w, x1: acc + w, level: L.level, indoor: L.indoor,
        // 危险度随全图进度递增：开头是「预兆」，越靠近撤离点越是「加速逃跑」
        danger: +(L.danger * (0.6 + o.chase * 0.8) * (0.72 + prog * 0.62)).toFixed(3),
        band: L.band.slice(), ground: L.ground,
        stairs: [], trenches: [], clear: [] };
      acc += w;
      return s;
    });
    // 最后一段吃掉舍入误差
    segs[segs.length - 1].x1 = WW; segs[segs.length - 1].w = WW - segs[segs.length - 1].x0;

    const M = {
      seed: String(seed), opts: o, world: { w: WW, h: WH, cw: CW, ch: CH, groundY: GY },
      lim: LIM, move: MOVE, segments: segs, structs: [], rooms: [], branches: [], props: [],
      decals: [], lights: [], far: [], near: [], checkpoints: [], landmarks: [], solids: [],
      prof: makeProfile(Math.ceil(WW / COL) + 2),
      segAt(x) { let i = 0; for (const s of segs) { if (x >= s.x0) i = s.i; } return segs[i] || segs[0]; },
      groundAt(x) { return this.prof.at(x); },
    };

    // 1) 剖面：逐段生成特征，段尾强制用一串小台阶过渡到下一段的入口高度（无缝连接）
    let y = GY;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], L = THEMES[s.theme];
      s.yIn = y;
      const tail = 300;                                // 段尾预留：交接过渡
      // 所有写入必须落在 COL 网格上：区段起点是任意像素，不对齐会让相邻特征各自
      // round 到不同列，中间留下一列「谁都没覆盖」的孤儿高度（实测 8px 宽、67px 深的假断层）。
      const bodyEnd = Math.floor((s.x1 - tail) / COL) * COL;
      M.prof.xMax = bodyEnd;                           // 本段特征只能写在交接区之前
      let x = Math.ceil(s.x0 / COL) * COL;
      M.prof.set(x, bodyEnd, y);
      let guard = 0;
      while (x < bodyEnd - 120 && guard++ < 400) {
        const kind = rng.weighted(L.feat);
        const r = applyFeature(M.prof, rng, kind, x, y, L.band, s);
        if (r.x <= x) { x += 4 * COL; continue; }      // 防死循环：特征必须推进
        x = r.x; y = r.y;
        // 特征之间留一段平地，保证追击者有加速距离
        const flat = rng.int(6, 16) * COL;
        M.prof.set(x, x + flat, y);
        x += flat;
      }
      M.prof.set(Math.max(s.x0, x), bodyEnd, y);
      s.yMid = y;
      // 保底起伏：band 夹得太平的区段（如开局街道）会整段零落差，
      // 而「主路线间歇出现障碍」是硬要求，所以不足 2 次落差就补一段楼梯 / 一道断口。
      // 必须在「交接段」之前做，否则会盖掉段尾的过渡台阶、把区段之间重新撕开。
      let guard2 = 0;
      while (levelChanges(M.prof, s.x0, bodyEnd) < 2 && guard2++ < 4) {
        const fx = Math.round((s.x0 + s.w * (0.2 + guard2 * 0.18)) / COL) * COL;
        applyFeature(M.prof, rng, guard2 % 2 ? 'stair' : 'trench', fx, M.prof.at(fx), L.band, s);
      }
      // 交接：把 y 平滑（小台阶）拉到下一段基准
      const nextBand = i + 1 < segs.length ? THEMES[segs[i + 1].theme].band : L.band;
      const ty = Math.max(nextBand[0], Math.min(nextBand[1], y));
      const yFrom = M.prof.y[M.prof.colOf(bodyEnd)];     // 以实际写入结果为准，避免特征越界后断层
      const steps = Math.max(1, Math.ceil(Math.abs(ty - yFrom) / LIM.riser));
      const seg2 = Math.max(1, Math.floor((s.x1 - bodyEnd) / COL / steps));
      M.prof.xMax = M.prof.n * COL;                    // 交接区解禁：否则下面的写入全被截断
      let cy = yFrom, cx = bodyEnd;
      for (let k = 0; k < steps; k++) {
        M.prof.set(cx, cx + seg2 * COL, cy);
        cy = Math.round(cy + (ty - yFrom) / steps); cx += seg2 * COL;
      }
      M.prof.set(cx, s.x1, ty);
      s.yOut = ty; y = ty;
      s.groundY = Math.round(M.prof.at((s.x0 + s.x1) / 2));
      s.changes = levelChanges(M.prof, s.x0, s.x1);
    }

    // 1b) 剖面收口：先清孤儿列，再算每段起伏，保证「相邻列高差 ≤ 一跳极限」
    // 采样数组按「+2 列」建的，尾部那两列一直是默认 GY：长图末端高度离 470 远时，
    // 会在世界边缘外留下 160px 的假断层（玩家走不到，但剖面不变式会被它打破）。
    const lastReal = M.prof.colOf(WW);
    for (let k = lastReal + 1; k < M.prof.n; k++) M.prof.y[k] = M.prof.y[lastReal];
    M.smoothed = 0;
    for (let pass = 0; pass < 3; pass++) { const n = smoothSteps(M.prof); M.smoothed += n; if (!n) break; }

    // 2) 建筑 + 支路 + 地标 + 检查点（都贴着剖面）
    for (const s of segs) {
      const L = THEMES[s.theme];
      s.clear = [];
      M.structs.push(...buildStructures(rng, M, s, o));
      M.branches.push(...buildBranches(rng, M, s, o));
      const lm = rng.pick(L.landmark);
      const lx = Math.round(s.x0 + s.w * rng.real(0.3, 0.62));
      M.landmarks.push({ kind: lm, x: lx, y: Math.round(M.prof.at(lx)), seg: s.i, w: 200, h: 200 });
      s.clear.push({ x0: lx - 60, x1: lx + 260, why: 'landmark' });
    }
    // 支路的落点与入口必须留空
    for (const br of M.branches) {
      const s = segs[br.seg];
      s.clear.push({ x0: br.x0 - 40, x1: br.x0 + 90, why: 'sideEntry' });
      s.clear.push({ x0: br.joinX - 60, x1: br.joinX + 60, why: 'sideJoin' });
    }
    // 断口两端留空（起跳/落地点不能堆东西）
    for (const s of segs) for (const t of s.trenches) s.clear.push({ x0: t.x0 - 70, x1: t.x1 + 70, why: 'trench' });
    for (const s of segs) for (const st of s.stairs) s.clear.push({ x0: st.x0 - 40, x1: st.x0 + 60, why: 'stair' });

    // 3) 检查点 3~5 个：优先放在高压段之后的开阔平地
    const cpN = Math.max(3, Math.min(24, Math.round(segs.length / 2.4)));
    const cand = segs.slice().sort((a, b) => b.danger - a.danger);
    const chosen = [];
    for (const s of cand) {
      if (chosen.length >= cpN) break;
      // 找一段 200px 内高度不变的平地
      let best = null;
      for (let x = s.x0 + 80; x < s.x1 - 300; x += COL * 4) {
        let flat = true;
        for (let k = 0; k < Math.round(200 / COL); k++) if (M.prof.y[M.prof.colOf(x) + k] !== M.prof.y[M.prof.colOf(x)]) { flat = false; break; }
        if (flat) { best = x; break; }
      }
      if (best !== null) chosen.push({ seg: s.i, x: best });
    }
    if (!chosen.length) chosen.push({ seg: 0, x: segs[0].x0 + 200 });
    chosen.sort((a, b) => a.x - b.x);
    M.checkpoints = chosen.map((c, i) => ({
      id: i, x: c.x, y: Math.round(M.prof.at(c.x)), seg: c.seg,
      name: 'CP' + (i + 1) + ' · ' + segs[c.seg].name, safe: true,
    }));
    for (const c of M.checkpoints) segs[c.seg].clear.push({ x0: c.x - 80, x1: c.x + 120, why: 'cp' });

    // 4) 室内剖面房间（穿建筑的区段）：楼板高差全部取自剖面，保证门洞对得上
    for (const s of segs) {
      if (!s.indoor && rng.chance(1 - o.indoor)) continue;
      if (s.level === 'under') continue;
      let x = s.x0 + 60;
      while (x < s.x1 - 260) {
        const w = rng.int(200, 360);
        const fy = Math.round(M.prof.at(x + w / 2));
        const h = rng.int(104, 132);
        M.rooms.push({
          x: Math.round(x), y: fy - h, w, h, floorY: fy, seg: s.i,
          type: rng.pick(s.theme === 'hospital' ? ['ward', 'triage', 'pharmacy', 'corridor'] :
            s.theme === 'warehouse' || s.theme === 'depot' ? ['storage', 'workshop', 'dock'] :
            s.theme === 'metro' ? ['concourse', 'kiosk'] : ['shop', 'flat', 'lobby']),
          doorX: Math.round(x + (rng.chance(0.5) ? 8 : w - 46)), doorW: 38,
          lit: rng.chance(0.6), seed: rng.int(0, 9999),
        });
        x += w + rng.int(40, 160);
      }
    }

    // 5) 碰撞体（先建，道具的挡路检查要用到剖面与平台）
    emitSolids(M, o);

    // 6) 道具 + 挡路检查
    for (const s of segs) M.props.push(...placeProps(rng, M, s, o));
    M.propClash = countClashes(M);

    // 7) 污损 / 灯光 / 前景 / 远景
    for (const s of segs) {
      const d = buildDecals(rng, M, s, o);
      M.decals.push(...d.out); M.lights.push(...d.lights);
    }
    buildLayers(rng, M, o);

    // 8) 支路重汇入检查
    M.sides = M.branches.map(br => validateSide(M, br));
    M.validate = {
      main: walker(M, { x: 40, y: M.prof.at(40) - MOVE.h - 1, to: WW - 60, speed: MOVE.speed,
        maxFrames: Math.ceil(WW / MOVE.speed * 60 * 4) }),
      chaser: walker(M, { x: 40, y: M.prof.at(40) - MOVE.h - 1, to: WW - 60, speed: MOVE.chaserSpeed,
        maxFrames: Math.ceil(WW / MOVE.chaserSpeed * 60 * 4) }),
    };
    return M;
  }

  function countClashes(M) {
    let n = 0;
    for (const p of M.props) {
      if (!p.hard) continue;                          // 小件挡不住通行，不计冲突
      const s = M.segAt(p.x);
      for (const c of s.clear) if (p.x < c.x1 + KEEP_CLEAR && p.x + p.w > c.x0 - KEEP_CLEAR) { n++; break; }
    }
    return n;
  }

  // 远景天际线 / 前景遮挡物：按区段主题给轮廓，纯装饰不参与通行
  function buildLayers(rng, M, o) {
    for (let x = 0; x < M.world.w; x += rng.int(120, 260)) {
      const h = rng.int(120, 340), w = rng.int(90, 190);
      M.far.push({ x, w, h, kind: rng.weighted({ tower: 40, block: 34, chimney: 12, dome: 8, crane: 6 }),
        win: rng.int(2, 6), seg: M.segAt(x).i });
    }
    for (const s of M.segments) {
      const n = Math.round(s.w / rng.int(320, 560));
      for (let i = 0; i < n; i++) {
        const x = Math.round(s.x0 + (i + rng.real(0.1, 0.6)) * (s.w / n));
        M.near.push({ kind: rng.weighted({ fence: 34, pole: 26, cable: 22, weed: 26, wreck: 8 }),
          x, y: Math.round(M.prof.at(x)), h: rng.int(46, 120), w: rng.int(40, 150), seg: s.i, seed: rng.int(0, 9999) });
      }
    }
  }

  return { build, walker, validateSide, makeRng, THEMES, SPINE, EXTRAS, VARIANT, LIM, MOVE, CW, CH, GY, WH, COL, ITEM,
    nearSolids, countClashes, SEC_PER_SCREEN, screensForMinutes, minutesForScreens };
})();
