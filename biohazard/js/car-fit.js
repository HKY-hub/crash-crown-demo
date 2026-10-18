// ============ 疾驰列车 · 普通客车样板与家具构件（程序化美术 阶段三） ============
// 这一层管三件事：
//   ① 家具比例统一：所有尺寸以角色身高 H = 36px 为基准（PROTO 里写死，画的时候只乘系数），
//      这样「座椅多高、桌子多高、行李架多厚」在九类车里是同一套人体工学，不会各画各的；
//   ② 构件级画法：一把椅子不再是「两块布」，而是 座框/坐垫/靠背/头枕/扶手/椅腿/横梁 逐个拼，
//      每件再走阶段二的材质系统铺面（fabric/steel/plastic/wood），所以近看认得出是什么；
//   ③ 布置变体：同一节客车按 seed 选 A/B/C 三种摆法，改的是「座椅组合 + 行李位置 + 设施有无」，
//      不是换颜色。
//
// 一条硬规矩（阶段三最重要的设计决定）：
//   地板上的家具占位一律沿用数据层 `car.furniture` 已经算好的 x/w/h —— 那套占位是过了
//   「20 seed 机器人真实通行 + 走道净宽 34px」闸门的。变体只允许在**同一个占位内部**重新摆，
//   或者往墙上/顶上加装（行李架、阅读灯、窗帘、挂钩、广告框），因为后者根本不参与通行。
//   违反这条就会把美术改动变成关卡改动，而美术阶段不该有这个权限。check() 里有专门的断言守着。
const CarFit = (() => {
  const H = 36;                              // 角色身高（= TrainGen.MOVE.h），所有比例的基准
  const px = f => Math.max(1, Math.round(H * f));

  // ---------- 统一人体工学比例（相对 H） ----------
  const PROTO = {
    seatRise: 0.26,   // 座面高 9px  ← 真人 45cm/180cm ≈ 0.25
    seatDeep: 0.42,   // 座深 15px
    backH: 0.60,      // 靠背总高 22px
    headH: 0.12,      // 头枕 4px
    armH: 0.40,       // 扶手 14px
    tableRise: 0.36,  // 桌面高 13px
    tableThk: 0.08,   // 台面厚 3px
    benchRise: 0.24,
    rackThk: 0.30,    // 行李架厚 11px
    lightThk: 0.10,
    curtainW: 0.30,   // 半幅窗帘占洞口宽
    hook: 0.09,
    bin: 0.40,        // 垃圾桶高 14px
    kit: 0.60,        // 应急箱高 22px
    counterH: 0.95,   // 吧台 34px
    stoolH: 0.55,     // 高脚凳 20px
    poleW: 0.07,      // 立杆 3px
    legW: 0.06,
    shadow: 0.06,     // 接触阴影 2px
    clearance: 0.90,  // 头顶余量：家具高不得超过净高的 90%
  };

  // ---------- 三种客车布置变体（改组合，不改颜色） ----------
  const VARIANTS = [
    { id: 'A', name: '标准硬座 3+2', seat: 'row', perBay: 5, facing: false, table: false,
      rack: 'both', light: 'row', curtain: true, hook: false, bin: 1, kit: true, luggage: 'rack', net: false },
    { id: 'B', name: '桌位 2+1', seat: 'row', perBay: 3, facing: true, table: true,
      rack: 'one', light: 'table', curtain: false, hook: true, bin: 1, kit: true, luggage: 'table', net: false },
    { id: 'C', name: '通勤长椅 + 吊网', seat: 'bench', perBay: 2, facing: false, table: false,
      rack: 'net', light: false, curtain: true, hook: true, bin: 2, kit: false, luggage: 'floor', net: true },
  ];
  function variantOf(car, force) {
    const list = variantsFor(car.type);
    if (force >= 0 && list[force | 0]) return list[force | 0];
    const k = (CarArt.as(car, 'fit') ^ (car.i | 0) * 7919) % list.length;
    return list[k];
  }
  // ---------- 阶段七：每个车种自己的三套变体 ----------
  // 之前只有客车有 A/B/C，其余八类的 TYPEEXTRA 根本不读 V —— 闸门量出来
  // 「三套变体两两几何签名 0 对不同」，等于另外八类只有一套布置。
  // 三条通用轴就够让同一车种长出不同几何：
  //   step —— 设施间距（疏 / 中 / 密）；from —— 从哪一端开始排；drop —— 每格按概率空着。
  // 空在哪一格由本车的 fit 流决定，所以同车种不同车也不会排成镜像复读。
  const AXES = [
    { step: 0.78, from: 'head', drop: 0.08, mode: 0 },
    { step: 1.00, from: 'both', drop: 0.26, mode: 1 },
    { step: 1.32, from: 'tail', drop: 0.44, mode: 2 },
  ];
  const TYPEVARS = {
    sleeper: ['隔间式 · 密排上铺网', '半开放 · 两端向中', '通铺式 · 疏排靠车尾'],
    diner: ['座席朝车头 · 密', '吧台居中 · 中距', '座席朝车尾 · 疏'],
    medical: ['担架排 · 靠车头', '隔离笼交替 · 居中', '疏排 + 观察位 · 靠车尾'],
    freight: ['绑扎道密排', '双侧货架 + 中通道', '疏排 + 端头堆料'],
    luggage: ['吊网密排', '货架为主', '地堆为主 · 疏'],
    maintenance: ['工具板密排', '工作台居中', '设备墙靠车尾'],
    security: ['笼位密排', '检查台居中', '疏排 + 端头哨位'],
    locomotive: ['控制台朝车头', '双端操作位', '设备区靠车尾'],
  };
  function variantsFor(type) {
    if (type === 'coach' || !TYPEVARS[type]) return VARIANTS;
    return VARIANTS.map((base, i) => Object.assign({}, base, AXES[i],
      { id: base.id, name: TYPEVARS[type][i], vtype: type }));
  }
  // 按变体轴给出一排摆放位 x：疏密、起始端、逐格留空都体现在这里，
  // 各 TYPEEXTRA 只管「这一格放什么」，不再各自写死 for (x += 150)。
  function units(sk, V, rng, pitch, pad) {
    const p = Math.max(40, (pitch || 150) * (V.step || 1));
    const lo = sk.x0 + (pad || 30), hi = sk.x1 - (pad || 30) - p * 0.6;
    const xs = [];
    if (V.from === 'tail') for (let x = hi; x >= lo; x -= p) xs.push(Math.round(x));
    else if (V.from === 'both') { let a = lo, b = hi, flip = 0;
      while (a <= b) { xs.push(Math.round(flip % 2 ? (b -= p) : (a += p))); flip++; } }
    else for (let x = lo; x <= hi; x += p) xs.push(Math.round(x));
    return xs.filter((x, i) => rng(x, 900 + i) >= (V.drop || 0));
  }

  const P = [];                              // 内部：构件累加
  let CUR = '';                              // 当前在装配哪一类东西（自检报告里指得出名字）
  let CURM = 'floor';                          // 当前挂载面：onWall/onCeil 期间画的东西一律不算落地件
  function put(x, y, w, h, mat, o) {   // kind 与 mount 都自动带上当前上下文（CUR / CURM），显式传参可覆盖
    if (!(w > 0 && h > 0)) return null;
    const p = Object.assign({ kind: CUR, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
      mat: mat || 'steel', face: 'side', zone: '', mount: CURM }, o || {});
    P.push(p); return p;
  }

  // ---------- 构件级装配 ----------
  // 侧视投影的一条硬逻辑（阶段三第一版就是栽在这里）：
  //   一排同向座椅，从侧面看过去 N 个靠背是**重合**在排的后端同一个 x 上的，
  //   看得见的只有：一整条坐垫 + 一个靠背 + 一个头枕 + 两端扶手 + 椅腿。
  //   座位个数靠「坐垫上的分缝」和扶手来读。
  //   原来给每个座位都画一根靠背，结果一排下来就是一把梳子，近看根本认不出是椅子。
  function seatBay(x, w, g, o) {
    const rise = o.rise || px(PROTO.seatRise), back = px(PROTO.backH), head = px(PROTO.headH);
    const arm = px(PROTO.armH), bw = Math.max(5, px(0.16)), panT = 4, by = g.floorY;
    const n = Math.max(1, Math.min(5, o.n || 1));
    const bx = o.dir < 0 ? x : x + w - bw;                    // 靠背所在的一端
    put(x, by - rise, w, 3, 'steel', { face: 'top', zone: 'tread' });                                  // 座框（整条）
    put(x + 1, by - rise - panT + 1, w - 2, panT, 'fabric', { face: 'top', zone: 'touch' });            // 坐垫（整条）
    for (let i = 1; i < n; i++) put(Math.round(x + i * w / n), by - rise - panT + 1, 1, panT, 'plastic', { face: 'edge' });   // 座位分缝
    put(bx, by - back, bw, back - rise + 1, 'fabric', { face: 'side', zone: 'touch' });                 // 靠背
    put(bx, by - back - 1, bw, 1, 'plastic', { face: 'top' });                                          // 靠背顶盖
    put(bx + (o.dir < 0 ? 1 : 0), by - back - head - 2, bw - 1, head + 1, 'fabric', { face: 'side' });  // 头枕
    put(o.dir < 0 ? x + w - 3 : x, by - arm, 3, 2, 'plastic', { face: 'top' });                         // 近端扶手
    put(o.dir < 0 ? bx + bw : bx - 3, by - arm, 3, 2, 'plastic', { face: 'top' });                      // 靠背侧扶手
    put(x + 2, by - rise, 2, rise, 'steel', { face: 'edge', zone: 'touch' });                           // 前腿
    put(x + w - 4, by - rise, 2, rise, 'steel', { face: 'edge' });                                      // 后腿
    if (w > 60) put(x + (w / 2 | 0), by - rise, 2, rise, 'steel', { face: 'edge' });                    // 长排中腿
    put(x + 1, by - rise + 3, w - 2, 1, 'steel', { face: 'edge' });                                     // 底部横撑
  }
  // 一排座椅：perBay 个座位；facing = 两排面对面（靠背各自在外端，中间空出来放桌子）
  function seatRow(x, w, g, opt) {
    const n = Math.max(1, Math.min(5, opt.perBay || 3));
    if (opt.facing && w >= 44) {
      const half = (w / 2 | 0) - 2;
      seatBay(x, half, g, { n: Math.ceil(n / 2), dir: -1 });
      seatBay(x + w - half, half, g, { n: Math.max(1, Math.floor(n / 2)), dir: 1 });
    } else seatBay(x, w, g, { n, dir: 1 });
  }
  function bench(x, w, g) { seatBay(x, w, g, { n: 2, dir: 1, rise: px(PROTO.benchRise) }); }

  // 行李架：架面必须**留出上方空间**给行李 —— 顶棚下沿就是架面的话，行李只能穿到车顶外面去。
  // 所以从顶棚往下先留 lg 高的行李位，再画架面、前沿挡条、吊撑。
  function wallRack(x, w, g, side) {
    const t = px(PROTO.rackThk), lg = Math.max(6, t - 3), y = g.ceilY + 2 + lg;
    put(x, y, w, 3, 'steel', { face: 'top', mount: 'ceiling' });                                   // 架面
    put(x, y + 3, w, 2, 'steel', { face: 'edge', mount: 'ceiling' });                              // 前沿挡条
    for (let i = 4; i < w; i += 22) put(x + i, y + 5, 1, t - lg - 2, 'steel', { face: 'edge', mount: 'ceiling' });   // 吊撑
    put(x + 1, y - lg + 1, Math.max(6, w * 0.22 | 0), lg - 1, 'fabric', { face: 'side', mount: 'ceiling' });        // 行李①
    put(x + w * 0.30 | 0, y - lg + 2, Math.max(5, w * 0.16 | 0), lg - 2, 'crate', { face: 'side', mount: 'ceiling' });
    if (side !== 'one') put(x + w * 0.55 | 0, y - lg + 3, Math.max(5, w * 0.14 | 0), lg - 3, 'plastic', { face: 'side', mount: 'ceiling' });
  }
  function cargoNet(x, w, g) {
    const y = g.ceilY + 2, t = px(PROTO.rackThk);
    put(x, y, w, 1, 'steel', { face: 'top', mount: 'ceiling' });
    for (let i = 0; i < w; i += 5) put(x + i, y + 1, 1, t - 1, 'rubber', { face: 'edge', mount: 'ceiling' });
    for (let j = 1; j < t; j += 3) put(x, y + j, w, 1, 'rubber', { face: 'side', mount: 'ceiling' });
  }
  function readingLights(x, w, g, mode) {
    const y = g.ceilY + 1, n = mode === 'table' ? 2 : 3, step = Math.max(12, w / n | 0);
    for (let i = 0; i < n; i++) {
      const lx = x + i * step + 4;
      put(lx, y, 6, 2, 'plastic', { face: 'bottom', mount: 'ceiling', lamp: true });
      put(lx + 1, y + 2, 4, 1, 'steel', { face: 'bottom', mount: 'ceiling' });
      put(lx + 2, y + 3, 2, 1, 'glass', { face: 'bottom', mount: 'ceiling', lamp: true });
    }
  }
  function curtains(bay, g) {
    const w = Math.max(4, bay.w * PROTO.curtainW | 0);
    put(bay.x, g.winHead + 3, w, g.winSill - g.winHead - 6, 'fabric', { face: 'side', mount: 'window', zone: 'touch' });
    put(bay.x + bay.w - w, g.winHead + 3, w, g.winSill - g.winHead - 6, 'fabric', { face: 'side', mount: 'window' });
    put(bay.x - 1, g.winHead + 1, bay.w + 2, 2, 'steel', { face: 'top', mount: 'window' });      // 窗帘导轨
  }
  function hooks(x, w, g) {
    const s = px(PROTO.hook);
    for (let i = 6; i < w - 6; i += 30) {
      put(x + i, g.winSill + 6, s, 1, 'steel', { face: 'edge', mount: 'wall' });
      put(x + i, g.winSill + 6, 1, s + 1, 'steel', { face: 'edge', mount: 'wall' });
    }
  }
  function bin(x, g) {
    const h = px(PROTO.bin);
    put(x, g.floorY - h, 9, h, 'plastic', { face: 'side', zone: 'touch' });
    put(x, g.floorY - h, 9, 2, 'steel', { face: 'top' });
    put(x + 2, g.floorY - h + 4, 5, 4, 'paint', { face: 'side' });
  }
  function emergencyKit(x, g) {
    const h = px(PROTO.kit);
    put(x, g.floorY - h, 16, h, 'plastic', { face: 'side', zone: 'touch' });
    put(x, g.floorY - h, 16, 2, 'steel', { face: 'top' });
    put(x + 6, g.floorY - h + 5, 4, 10, 'danger', { face: 'side' });                              // 红底
    put(x + 3, g.floorY - h + 8, 10, 3, 'paintHi', { face: 'side' });                             // 白十字
    put(x + 1, g.floorY - h + 3, 14, 1, 'steel', { face: 'edge' });
  }
  function foldTable(x, w, g) {
    const rise = px(PROTO.tableRise), t = px(PROTO.tableThk);
    put(x, g.floorY - rise, w, t, 'paint', { face: 'top', zone: 'touch' });
    put(x + 1, g.floorY - rise + t, 2, rise - t, 'steel', { face: 'edge' });
    put(x + w - 3, g.floorY - rise + t, 2, rise - t, 'steel', { face: 'edge' });
    put(x + (w / 2 | 0) - 1, g.floorY - rise + t, 2, rise - t - 2, 'steel', { face: 'edge' });    // 折叠中柱
    put(x + 2, g.floorY - rise - 1, w - 4, 1, 'paintHi', { face: 'top' });
  }
  function floorLuggage(x, g, seed) {
    const h = 12 + (seed % 3) * 4;
    put(x, g.floorY - h, 18, h, 'crate', { face: 'side', zone: 'touch' });
    put(x + 2, g.floorY - h - 5, 13, 6, 'fabric', { face: 'side' });
    put(x, g.floorY - h, 18, 2, 'wood', { face: 'top' });
  }
  function pole(x, g) {
    put(x, g.ceilY, px(PROTO.poleW), g.floorY - g.ceilY, 'steel', { face: 'side', zone: 'touch', mount: 'floor' });
    put(x - 2, g.floorY - 2, 6, 2, 'steel', { face: 'top' });                                     // 底座
    for (let i = 0; i < 2; i++) put(x - 1, g.ceilY + 6 + i * 26, 5, 2, 'plastic', { face: 'top' }); // 横握把
  }

  // ---------- 阶段四：九类车厢各自的构件配方 ----------
  // 三条硬约定，违反就会被 audit 或闸门抓住：
  //   ① 只在自己的占位 (x, w, h) 里画，或明确挂到墙/顶/窗（mount 不是 floor）；
  //   ② 占位高度 h 是数据层记的「这东西有多大」，配方要把它**填满** ——
  //      填不满就变成「一屋子矮箱子」，九类车的轮廓又会长得一模一样；
  //   ③ 落地件必须能连到地（float 用连通性证明），悬着的必须挂在面上。
  const bunkRise = () => px(0.34);          // 下铺床面 12px
  const bunkUp = () => px(1.15);            // 上铺床面 41px：比角色高 5px，蹲得过去
  // 数据层真有「可站上去的床板/货架」实体时，美术跟着那块板画，不自己编高度
  function deckAt(car, x, w) {
    for (const d of (car.decks || []))
      if (d.kind === 'berth' && d.x < x + w && d.x + d.w > x) return d;
    return null;
  }
  // 样板车演示占位：把该类型的六种专属家具按真实尺寸一件件排开。
  // 只给预览台和闸门造「完整样板」用；真实关卡一律走数据层的 car.furniture。
  function demoProto(car) {
    const G = typeof TrainGen !== 'undefined' ? TrainGen : null;
    const kinds = G && G.CAR[car.type] ? G.CAR[car.type].fit.slice()
      : ['seatRow', 'rack', 'partition', 'luggageSet', 'poleGroup'];
    const f = [], x1 = car.x1 - 28;
    let cx = car.x0 + 28, i = 0;
    for (const k of kinds) {
      const it = G && G.ITEM[k] ? G.ITEM[k] : { w: 60, h: 40 };
      if (cx + it.w > x1) break;
      f.push({ kind: k, x: cx, y: car.yFloor - it.h, w: it.w, h: it.h, seed: 13 + i * 7 });
      cx += it.w + 24; i++;
    }
    car.furniture = f;
    // 完整样板还得带上私人物品：没有 props 的话「正常使用」档画出来和生活无关，四档对照看不出差别。
    // 位置一律贴着家具占位，具体坐哪儿由 CarLife 按类型挑面。
    const PK = ['cup', 'paper', 'notebook', 'bottle', 'blanket', 'shoe', 'toy', 'pillPack'];
    car.props = f.slice(0, 6).map((b, i) => ({
      kind: PK[i % PK.length], x: b.x + 4 + (i % 3) * 6, y: b.y + b.h - 10, w: 14, h: 10, seed: 101 + i * 13,
    }));
    return f;
  }

  // 小构件词汇表：配方只组合这些，材质与面（face）统一在这里管
  const T = {
    body(x, y, w, h, mat, o) { put(x, y, w, h, mat, o); put(x, y, w, 2, 'steel', { face: 'top' }); },
    crateBox(x, y, w, h, mat) {
      put(x, y, w, h, mat || 'crate', { face: 'side', zone: 'touch' });
      put(x, y, w, 2, 'wood', { face: 'top' });
      put(x, y + (h / 3 | 0), w, 1, 'wood', { face: 'edge' });
      put(x + 2, y + 3, Math.max(4, w / 4 | 0), 3, 'paintHi', { face: 'side' });      // 手写标记条
    },
    barrel(x, y, w, h) {
      put(x, y, w, h, 'steel', { face: 'side', zone: 'touch' });
      put(x, y + 3, w, 2, 'paint', { face: 'edge' });
      put(x, y + h - 6, w, 2, 'paint', { face: 'edge' });
      put(x, y, w, 2, 'steel', { face: 'top' });
      put(x + w - 4, y + 1, 3, 1, 'rubber', { face: 'top' });                          // 桶塞
    },
    // 网格：横竖各一排 1px，是笼子/网罩/背板的共同语言
    mesh(x, y, w, h, step, mat) {
      for (let i = 0; i <= w; i += step) put(x + i, y, 1, h, mat || 'steel', { face: 'edge', mount: CURM });
      for (let j = 0; j <= h; j += step) put(x, y + j, w, 1, mat || 'steel', { face: 'side', mount: CURM });
    },
    dial(x, y, r, mat) {                                                               // 圆：三条矩形近似
      put(x, y, r * 2, r * 2, mat || 'glass', { face: 'side' });
      put(x + 1, y - 1, r * 2 - 2, 1, 'steel', { face: 'top' });
      put(x + 1, y + r * 2, r * 2 - 2, 1, 'steel', { face: 'bottom' });
      put(x + r, y + 1, 1, r, 'paintHi', { face: 'edge' });
    },
    wheel(x, y, r) {
      put(x, y - r, r * 2, r * 2, 'rubber', { face: 'side' });
      put(x + r - 1, y - 1, 2, 2, 'steel', { face: 'side' });
    },
    glassPane(x, y, w, h) { put(x, y, w, h, 'glass', { face: 'side' }); put(x, y, w, 1, 'steel', { face: 'top' }); },
    lampBar(x, y, w, h) { const p = put(x, y, w, h, 'plastic', { face: 'bottom', mount: CURM }); if (p) p.lamp = true; },
    strap(x, y, h) { put(x, y, 2, h, 'rubber', { face: 'edge' }); },
    post(x, y0, h, w, mat) { put(x, y0 - h, w || 2, h, mat || 'steel', { face: 'edge', zone: 'touch' }); },
  };
  const inMount = (m, f) => { const s = CURM; CURM = m; try { f(); } finally { CURM = s; } };
  const onWall = f => inMount('wall', f);
  const onCeil = f => inMount('ceiling', f);

  const RECIPES = {
    // ---- 行李补给车：堆得高、捆得紧 ----
    crateStack(x, w, h, g) {
      const p = g.floorY, u = h / 3;
      T.crateBox(x, p - u, w * 0.55 | 0, u);
      T.crateBox(x + w * 0.5, p - u, w - w * 0.5, u);
      T.crateBox(x + w * 0.12, p - u * 2, w * 0.6 | 0, u);
      T.crateBox(x + w * 0.28, p - u * 3, w * 0.4 | 0, u);
      T.strap(x + w * 0.2, p - h, h); T.strap(x + w * 0.7, p - h, h);
    },
    trunk(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'crate', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 2, 'wood', { face: 'top' });
      put(x, p - h + (h / 2 | 0), w, 1, 'steel', { face: 'edge' });                     // 盖缝
      put(x + 3, p - h, 2, h - 2, 'steel', { face: 'edge' }); put(x + w - 5, p - h, 2, h - 2, 'steel', { face: 'edge' });
      put(x + (w / 2 | 0) - 3, p - h - 3, 6, 3, 'plastic', { face: 'top' });            // 提手
      put(x + 8, p - h + (h / 2 | 0) - 1, 4, 3, 'steel', { face: 'side' });             // 锁扣
    },
    sackPile(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h * 0.62 | 0, w * 0.62 | 0, h * 0.62 | 0, 'fabric', { face: 'side', zone: 'touch' });
      put(x + w * 0.4, p - h * 0.55 | 0, w * 0.6 | 0, h * 0.55 | 0, 'fabric', { face: 'side' });
      put(x + w * 0.22, p - h, w * 0.5 | 0, h * 0.45 | 0, 'fabric', { face: 'side' });
      put(x + w * 0.4, p - h - 2, 4, 3, 'rubber', { face: 'top' });                     // 扎口
    },
    handcart(x, w, h, g) {
      const p = g.floorY, r = 5, wy = p - r * 2, ty = wy - 3;            // 轮顶 / 台面
      put(x, ty, w * 0.8 | 0, 3, 'steel', { face: 'top', zone: 'tread' });
      put(x + 2, ty - 12, w * 0.5 | 0, 12, 'crate', { face: 'side', zone: 'touch' });   // 台上货
      T.wheel(x + w * 0.1, p - r, r); T.wheel(x + w * 0.45, p - r, r); T.wheel(x + w * 0.7, p - r, r);
      put(x + w * 0.7, ty - (h - 15), 2, h - 15, 'steel', { face: 'edge' });            // 立把柱
      put(x + w * 0.68, ty - (h - 15) - 2, w * 0.3 | 0, 2, 'steel', { face: 'top' });   // 横把
    },
    shelfRow(x, w, h, g) {
      const p = g.floorY, n = 4, step = (h - 4) / n;
      T.post(x + 1, p, h, 3); T.post(x + w - 4, p, h, 3); T.post(x + (w / 2 | 0) - 1, p, h, 2);
      onWall(() => T.mesh(x + 3, p - h + 2, w - 6, h - 4, 7, 'steel'));                  // 背网
      for (let i = 0; i < n; i++) {
        const y = p - (i + 1) * step;
        put(x, y, w, 3, 'wood', { face: 'top', zone: 'tread' });
        put(x, y + 3, w, 2, 'steel', { face: 'edge' });                                   // 前沿挡条
        const cw = (w - 8) / 3;
        if (i % 2 === 0) { T.crateBox(x + 3 + i * 2, y - step * 0.62 | 0, cw | 0, step * 0.62 | 0); }
        else { put(x + 4, y - step * 0.55 | 0, cw * 1.4 | 0, step * 0.55 | 0, 'fabric', { face: 'side' }); }
        T.barrel(x + w - 22, y - step * 0.7 | 0, 14, step * 0.7 | 0);
      }
    },
    strappedCase(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h, 'crate', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 2, 'steel', { face: 'top' });
      for (let i = 1; i <= 2; i++) T.strap(x + (w * i / 3 | 0), p - h, h);
      put(x, p - h, 4, 4, 'steel', { face: 'side' }); put(x + w - 4, p - h, 4, 4, 'steel', { face: 'side' });   // 护角
      put(x + (w / 2 | 0) - 4, p - h - 3, 8, 3, 'steel', { face: 'top' });               // 吊环
    },
    // ---- 卧铺车：两层床 + 隔间门 + 帘子 ----
    berthLower(x, w, h, g) {
      const p = g.floorY, y = p - Math.max(h, bunkRise());
      put(x, y, w, 3, 'steel', { face: 'top', zone: 'tread' });                          // 床框
      put(x + 1, y - 4, w - 2, 4, 'fabric', { face: 'top', zone: 'touch' });             // 床垫
      put(x + w * 0.3, y - 7, w * 0.68 | 0, 3, 'fabric', { face: 'top' });               // 被褥
      put(x + 3, y - 8, 14, 4, 'plastic', { face: 'top' });                              // 枕头
      for (let i = 0; i < 3; i++) T.post(x + 3 + i * ((w - 8) / 2 | 0), p, p - y - 3, 3);
      T.crateBox(x + 5, p - 14, 24, 14, 'crate');                                        // 床下的箱子
    },
    berthUpper(x, w, h, g, C) {
      const d = deckAt(C.car, x, w);
      const y = d ? d.y : g.floorY - bunkUp();
      const x0 = d ? Math.max(x, d.x) : x, x1 = d ? Math.min(x + w, d.x + d.w) : x + w;
      const bw = Math.max(24, x1 - x0);
      if (d) {                                                                            // 真有床板：只铺床垫和护栏
        onWall(() => {
          put(x0, y - 4, bw, 4, 'fabric', { face: 'top', zone: 'touch' });
          put(x0 + bw * 0.3, y - 7, bw * 0.6 | 0, 3, 'fabric', { face: 'top' });
          put(x0 + 2, y - 5, 12, 4, 'plastic', { face: 'top' });                          // 枕头
          for (let i = 0; i < 3; i++) T.post(x0 + 2 + i * ((bw - 6) / 2 | 0), y - 4, 12, 1);
          put(x0, y - 16, bw, 2, 'steel', { face: 'top' });                               // 护栏横杆
        });
      } else {
        onWall(() => {
          put(x, y, bw, 3, 'steel', { face: 'top', zone: 'tread' });
          put(x + 1, y - 4, bw - 2, 4, 'fabric', { face: 'top', zone: 'touch' });
          put(x + bw * 0.3, y - 7, bw * 0.6 | 0, 3, 'fabric', { face: 'top' });
          put(x + 2, y - 8, 12, 4, 'plastic', { face: 'top' });
          for (let i = 0; i < 3; i++) T.post(x + 2 + i * ((bw - 6) / 2 | 0), y - 4, 12, 1);
          put(x, y - 16, bw, 2, 'steel', { face: 'top' });
          put(x + 4, y + 3, 2, 8, 'steel', { face: 'edge' });                             // 墙支架
          put(x + bw - 8, y + 3, 2, 8, 'steel', { face: 'edge' });
        });
        T.post(x + 2, g.floorY, y - g.floorY + 3, 3);                                     // 立柱落地：整张床有支撑
        T.post(x + bw - 5, g.floorY, y - g.floorY + 3, 3);
      }
    },
    compartmentDoor(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, 2, h, 'steel', { face: 'edge' }); put(x + w - 2, p - h, 2, h, 'steel', { face: 'edge' });
      put(x, p - h, w, 2, 'steel', { face: 'top' });                                      // 上导轨
      put(x + 1, p - h + 3, w - 2, h - 5, 'paint', { face: 'side', zone: 'touch' });      // 门板
      put(x + 2, p - h + 8, w - 4, 10, 'glass', { face: 'side' });                        // 磨砂小窗
      put(x + w - 4, p - (h / 2 | 0), 2, 6, 'steel', { face: 'edge' });                   // 把手
      put(x + 1, p - 2, w - 2, 1, 'steel', { face: 'edge' });                             // 下导轨
    },
    sideTable(x, w, h, g) {
      const p = g.floorY, y = p - Math.max(h * 0.7 | 0, px(PROTO.tableRise));
      put(x, y, w, 3, 'wood', { face: 'top', zone: 'touch' });
      put(x + (w / 2 | 0) - 1, y + 3, 2, p - y - 3, 'steel', { face: 'edge' });
      put(x + 2, p - 2, w - 4, 2, 'steel', { face: 'top' });
      put(x + 4, y - 9, 6, 9, 'glass', { face: 'side' });                                 // 暖瓶
      put(x + 5, y - 11, 4, 2, 'plastic', { face: 'top' });
      put(x + w - 12, y - 3, 8, 3, 'paintHi', { face: 'side' });                          // 报纸
    },
    curtainRail(x, w, h, g) {
      const y = g.ceilY + 4;
      onCeil(() => {
        put(x, y, w, 2, 'steel', { face: 'top' });
        for (let i = 0; i < 3; i++) put(x + 2 + i * (w / 3 | 0), y + 2, 2, 2, 'plastic', { face: 'bottom' });
      });
      onWall(() => {                                                                      // 两片垂到床面的隔帘
        const cw = w * 0.34 | 0;
        put(x, y + 2, cw, g.floorY - bunkUp() - y - 4, 'fabric', { face: 'side', zone: 'touch' });
        put(x + w - cw, y + 2, cw, g.floorY - bunkUp() - y - 4, 'fabric', { face: 'side' });
        for (let i = 2; i < cw; i += 4) { put(x + i, y + 2, 1, g.floorY - bunkUp() - y - 6, 'plastic', { face: 'edge' }); }
      });
    },
    personalKit(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w * 0.6 | 0, h, 'fabric', { face: 'side', zone: 'touch' });           // 洗漱包
      put(x, p - h, w * 0.6 | 0, 2, 'plastic', { face: 'top' });
      put(x + w * 0.65 | 0, p - 4, w * 0.35 | 0, 4, 'plastic', { face: 'top' });          // 拖鞋
      put(x + 2, p - h - 3, 6, 3, 'glass', { face: 'side' });                             // 水杯
    },
    // ---- 餐车：吧台 + 灶台 + 吊灯 ----
    barCounter(x, w, h, g) {
      const p = g.floorY, y = p - Math.max(h, px(PROTO.counterH));
      put(x, y, w, p - y, 'paint', { face: 'side', zone: 'touch' });                      // 前板
      put(x - 2, y - 4, w + 4, 4, 'wood', { face: 'top', zone: 'touch' });                // 台面出檐
      put(x, p - 8, w, 3, 'steel', { face: 'top' });                                      // 脚踏杆
      for (let i = 0; i < 3; i++) {                                                       // 三张高脚凳
        const sx = x + 14 + i * ((w - 20) / 3 | 0);
        put(sx, p - 20, 12, 3, 'fabric', { face: 'top', zone: 'touch' });
        put(sx + 5, p - 17, 2, 17, 'steel', { face: 'edge' });
        put(sx + 1, p - 2, 10, 2, 'steel', { face: 'top' });
        put(sx + 2, p - 9, 8, 1, 'steel', { face: 'edge' });                              // 脚踏环
      }
      onWall(() => { for (let i = 0; i < 4; i++) put(x + 6 + i * 9, y - 12, 6, 8, 'glass', { face: 'side' }); });
    },
    dinerTable(x, w, h, g) {
      const p = g.floorY, y = p - Math.max(h * 0.72 | 0, px(PROTO.tableRise));
      put(x + w * 0.15, y, w * 0.7 | 0, 3, 'wood', { face: 'top', zone: 'touch' });
      put(x + (w / 2 | 0) - 2, y + 3, 4, p - y - 3, 'steel', { face: 'edge' });
      put(x + w * 0.3, p - 2, w * 0.4 | 0, 2, 'steel', { face: 'top' });
      put(x + (w / 2 | 0) - 2, y - 6, 4, 6, 'glass', { face: 'side' });                   // 调味瓶
      for (const sx of [x, x + w - 14]) {                                                 // 两侧长凳
        put(sx, p - 14, 14, 3, 'wood', { face: 'top', zone: 'tread' });
        put(sx + 1, p - 11, 2, 11, 'steel', { face: 'edge' }); put(sx + 11, p - 11, 2, 11, 'steel', { face: 'edge' });
      }
    },
    kitchenUnit(x, w, h, g) {
      const p = g.floorY, y = p - h;
      put(x, y + 6, w, h - 6, 'steel', { face: 'side', zone: 'touch' });                  // 灶体
      put(x, y + 4, w, 3, 'steel', { face: 'top', zone: 'tread' });                       // 台面
      for (let i = 0; i < 2; i++) { T.dial(x + 12 + i * 30, y + 5, 6, 'rubber'); }        // 两个灶眼
      put(x, y - 10, w, 4, 'steel', { face: 'bottom' });                                  // 油烟机罩
      put(x + 4, y - 12, w - 8, 2, 'steel', { face: 'top' });
      onCeil(() => { put(x + (w / 2 | 0) - 5, g.ceilY, 10, y - 12 - g.ceilY, 'steel', { face: 'side' }); });   // 排风管到顶
      for (let i = 0; i < 4; i++) put(x + 6 + i * 22, y + h - 14, 14, 2, 'plastic', { face: 'edge' });         // 抽屉拉手
    },
    dishCabinet(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'paint', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 2, 'steel', { face: 'top' });
      T.glassPane(x + 3, p - h + 6, w - 6, h * 0.42 | 0);                                 // 玻璃门
      for (let i = 0; i < 4; i++) put(x + 5, p - h + 10 + i * 7, w - 10, 1, 'paintHi', { face: 'edge' });     // 碗盘
      for (let i = 0; i < 3; i++) put(x + 6, (p - h * 0.42 | 0) + i * 9, w - 12, 2, 'steel', { face: 'edge' });
    },
    stallPartition(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h, 'steel', { face: 'side', zone: 'touch' });
      put(x - 1, p - h, w + 2, 2, 'steel', { face: 'top' });
      T.glassPane(x + 1, p - h + 10, w - 2, 16);                                          // 传菜口
      put(x, p - 12, w, 2, 'paintHi', { face: 'edge' });                                  // 防撞条
    },
    potRack(x, w, h, g) {
      const y = g.ceilY + 6;
      onCeil(() => {
        put(x, y, w, 2, 'steel', { face: 'top' });
        put(x + 3, y + 2, 1, 6, 'steel', { face: 'edge' }); put(x + w - 4, y + 2, 1, 6, 'steel', { face: 'edge' });
        for (let i = 0; i < 3; i++) {
          const px2 = x + 6 + i * ((w - 20) / 3 | 0), r = 6 + (i % 2) * 3;
          put(px2, y + 8 + i * 2, r * 2, r, 'steel', { face: 'bottom', zone: 'touch' });  // 锅
          put(px2 + r - 1, y + 2 + i * 2, 2, 6, 'steel', { face: 'edge' });               // 挂钩
        }
      });
    },
    // ---- 医疗隔离车：帘子隔位 + 监护 + 生物危害 ----
    gurney(x, w, h, g) {
      const p = g.floorY, y = p - Math.max(h, px(0.55));
      put(x, y, w, 3, 'steel', { face: 'top', zone: 'tread' });
      put(x + 1, y - 3, w - 2, 3, 'fabric', { face: 'top', zone: 'touch' });              // 床单
      put(x + w * 0.62, y - 5, w * 0.3 | 0, 2, 'fabric', { face: 'top' });                // 被
      put(x + 3, y - 5, 10, 3, 'plastic', { face: 'top' });                               // 枕
      put(x + 2, y - 12, 1, 12, 'steel', { face: 'edge' });                               // 护栏
      put(x + 2, y - 12, 16, 1, 'steel', { face: 'top' });
      T.post(x + w - 8, y, 26, 1);                                                        // 输液杆
      put(x + w - 12, y - 24, 8, 6, 'glass', { face: 'side' });                           // 输液袋
      put(x + 6, y + 3, 2, p - 6 - y - 3, 'steel', { face: 'edge' });                                          // 两条腿接到轮轴
      put(x + w - 10, y + 3, 2, p - 6 - y - 3, 'steel', { face: 'edge' });
      for (const wx of [x + 6, x + w * 0.4 | 0, x + w - 10]) T.wheel(wx, p - 3, 3);
    },
    curtainTrack(x, w, h, g) {
      const y = g.ceilY + 3;
      onCeil(() => put(x, y, w, 2, 'steel', { face: 'top' }));
      onWall(() => {
        const cw = w * 0.22 | 0, drop = g.floorY - y - 10;
        for (let i = 0; i < 3; i++) {
          const cx = x + i * ((w - cw) / 2 | 0);
          put(cx, y + 2, cw, drop, 'fabric', { face: 'side', zone: 'touch' });
          for (let k = 2; k < cw; k += 4) put(cx + k, y + 2, 1, drop - 2, 'plastic', { face: 'edge' });
        }
      });
    },
    monitorCart(x, w, h, g) {
      const p = g.floorY, y = p - h;
      put(x, y, w, h * 0.55 | 0, 'paint', { face: 'side' });                              // 机箱
      T.glassPane(x + 3, y + 3, w - 6, h * 0.34 | 0);                                     // 屏幕
      for (let i = 0; i < 4; i++) put(x + 5 + i * 7, y + 6 + (i % 2) * 3, 4, 1, 'paintHi', { face: 'edge' });   // 波形
      put(x + 2, y + (h * 0.55 | 0), w - 4, (p - y - (h * 0.55 | 0)) - 6, 'steel', { face: 'side' });
      for (const wx of [x + 4, x + w - 8]) T.wheel(wx, p - 3, 3);
      put(x + w - 3, y + 4, 2, h - 10, 'rubber', { face: 'edge' });                       // 线缆
    },
    medCabinet(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'paintin', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 2, 'steel', { face: 'top' });
      T.glassPane(x + 4, p - h + 8, w - 8, h * 0.4 | 0);
      for (let i = 0; i < 4; i++) put(x + 6, p - h + 12 + i * 6, w - 12, 1, 'plastic', { face: 'edge' });      // 药格
      put(x + (w / 2 | 0) - 5, p - (h * 0.42 | 0), 10, 3, 'danger', { face: 'side' });      // 红十字
      put(x + (w / 2 | 0) - 1, (p - (h * 0.42 | 0)) - 3, 3, 9, 'paintHi', { face: 'side' });
    },
    bioBarrel(x, w, h, g) {
      const p = g.floorY;
      T.barrel(x, p - h, w, h);
      put(x, p - h, w, 3, 'plastic', { face: 'top' });                                    // 盖
      put(x + (w / 2 | 0) - 3, p - (h * 0.6 | 0), 6, 6, 'danger', { face: 'side' });        // 生物危害
      put(x + (w / 2 | 0) - 1, (p - (h * 0.6 | 0)) + 1, 2, 2, 'paintHi', { face: 'side' });
    },
    quarantineFrame(x, w, h, g) {
      const p = g.floorY;
      T.post(x, p, h, 3); T.post(x + w - 3, p, h, 3);
      put(x, p - h, w, 3, 'steel', { face: 'top' });
      onWall(() => T.mesh(x + 3, p - h + 3, w - 6, h - 6, 6, 'plastic'));                 // 膜面
      put(x, p - 3, w, 3, 'rubber', { face: 'bottom', zone: 'tread' });                   // 底部密封
      onCeil(() => T.lampBar(x + w * 0.3 | 0, p - h + 5, w * 0.4 | 0, 2));                // 紫外灯
    },
    // ---- 货运车：整墙集装箱 + 网 + 桶 ----
    palletStack(x, w, h, g) {
      const p = g.floorY, ph = 8;
      put(x, p - ph, w, ph, 'wood', { face: 'side', zone: 'tread' });                     // 木托盘
      for (let i = 0; i < w; i += 16) put(x + i, p - ph, 2, ph, 'paint', { face: 'edge' });
      const rows = 3, ch = Math.max(8, Math.round((h - ph) / rows));
      for (let r = 0; r < rows; r++) {
        const cols = 2 + (r % 2), cw2 = ((w - 6) / cols | 0), y = p - ph - (r + 1) * ch;
        for (let i = 0; i < cols; i++) T.crateBox(x + 2 + i * cw2, y, cw2 - 2, ch, 'crate');   // 整层画满：上下层与共用的托盘才连得上
      }
      onWall(() => { for (let i = 4; i < w - 2; i += 13) put(x + i, p - h, 2, h - ph, 'plastic', { face: 'edge' }); });   // 缠绕膜
    },
    crateWall(x, w, h, g) {
      const p = g.floorY;
      let y = p, row = 0;
      while (y - 8 > p - h) {
        const ch = Math.max(8, Math.min(22, y - (p - h))), n = 2 + (row % 2);
        const cw = (w - (n - 1) * 3) / n;
        for (let i = 0; i < n; i++) {
          const cx = x + i * (cw + 3);
          T.crateBox(cx, y - ch, cw | 0, ch, row % 2 ? 'crate' : 'wood');
          put(cx, y - ch, 2, ch, 'steel', { face: 'edge' });                              // 缝阴影
        }
        y -= ch; row++;
      }
      T.strap(x + w * 0.25 | 0, p - h, h); T.strap(x + w * 0.72 | 0, p - h, h);
    },
    strapPost(x, w, h, g) {
      const p = g.floorY;
      T.post(x + (w / 2 | 0) - 1, p, h, 3);
      put(x, p - h, w, 2, 'steel', { face: 'top' });
      put(x + 1, p - h + 4, w - 2, 3, 'steel', { face: 'side' });                         // 系留环座
      put(x + 2, p - h + 3, w - 4, 1, 'rubber', { face: 'top' });
      put(x - 3, p - 2, w + 6, 2, 'steel', { face: 'top' });                              // 底座
      onWall(() => { put(x + (w / 2 | 0), p - h + 8, 1, h * 0.5 | 0, 'rubber', { face: 'edge' }); });         // 斜拉带
    },
    forkPallet(x, w, h, g) {
      const p = g.floorY;
      put(x, p - 10, w * 0.62 | 0, 10, 'wood', { face: 'side', zone: 'tread' });          // 托盘
      T.crateBox(x + 2, p - h, (w * 0.55 | 0) - 4, h - 10, 'crate');
      put(x + w * 0.6, p - 16, w * 0.4 | 0, 4, 'steel', { face: 'top' });                 // 空叉齿
      put(x + w * 0.6, p - 12, 4, 12, 'steel', { face: 'edge' });
      put(x + w * 0.72, p - 26, 3, 14, 'steel', { face: 'edge' });
      T.wheel(x + w * 0.8, p - 4, 4);
    },
    barrelRow(x, w, h, g) {
      const p = g.floorY, n = 3, bw = w / n;
      for (let i = 0; i < n; i++) T.barrel(x + i * bw + 1, p - h, bw - 2, h);
      put(x, p - h - 2, w, 2, 'steel', { face: 'top' });                                  // 防滚挡条
      put(x + 2, p - h - 6, 2, 4, 'steel', { face: 'edge' }); put(x + w - 4, p - h - 6, 2, 4, 'steel', { face: 'edge' });
    },
    cargoNet(x, w, h, g) {
      const p = g.floorY;
      put(x + 2, p - (h * 0.6 | 0), w - 4, h * 0.6 | 0, 'crate', { face: 'side' });        // 网里的货（落地）
      onWall(() => { T.mesh(x, p - h, w, h, 7, 'rubber'); put(x, p - h, w, 2, 'steel', { face: 'top' }); });
    },
    // ---- 维修车：工具柜 + 配电盘 + 发电机 ----
    toolCabinet(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'paint', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 3, 'steel', { face: 'top', zone: 'tread' });                       // 台面
      for (let i = 0; i < 5; i++) {
        const dy = p - h + 6 + i * ((h - 10) / 5 | 0);
        put(x + 2, dy, w - 4, ((h - 10) / 5 | 0) - 2, 'steel', { face: 'side' });
        put(x + (w / 2 | 0) - 6, dy + 2, 12, 1, 'plastic', { face: 'edge' });             // 抽屉拉手
      }
      onWall(() => {                                                                      // 上部挂板：扳手轮廓（画在占位里面）
        put(x + 2, p - h + 4, w - 4, 16, 'paintin', { face: 'side' });
        for (let i = 0; i < 4; i++) put(x + 4 + i * ((w - 10) / 4 | 0), p - h + 6, 2, 11, 'steel', { face: 'edge' });
      });
    },
    panelBank(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'paintin', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 2, 'steel', { face: 'top' });
      for (let i = 0; i < 4; i++) T.dial(x + 8 + i * 22, p - h + 8, 6, 'glass');          // 一排仪表
      for (let i = 0; i < 6; i++) put(x + 6 + i * 18, p - h * 0.42 | 0, 6, 3, 'plastic', { face: 'side' });   // 开关
      for (let i = 0; i < 3; i++) { const q = put(x + 10 + i * 30, p - h + 26, 4, 3, i === 2 ? 'danger' : 'paint', { face: 'side' }); if (i !== 1) q.lamp = true; }
      onWall(() => { for (let i = 0; i < 4; i++) put(x + 8 + i * 30, p - 8, 3, 8, 'rubber', { face: 'edge' }); });        // 底部电缆
    },
    pipeRack(x, w, h, g) {
      const p = g.floorY - h - 6;
      onWall(() => {
        put(x, p, w, 2, 'steel', { face: 'top' });                                        // 上托
        put(x, p + h - 2, w, 2, 'steel', { face: 'bottom' });
        for (let i = 0; i < 3; i++) {
          const py = p + 3 + i * ((h - 6) / 3 | 0);
          put(x, py, w, 4 - i, 'steel', { face: 'side', zone: 'rain' });                  // 三根不同粗细
          for (let k = 8; k < w; k += 34) put(x + k, py - 1, 2, 6, 'plastic', { face: 'edge' });   // 卡箍
        }
        for (let i = 0; i < 4; i++) put(x + i * (w / 4 | 0) + 4, p - 4, 2, 4, 'steel', { face: 'edge' });      // 墙锚
      });
    },
    workbench2(x, w, h, g) {
      const p = g.floorY, y = p - Math.max(h, px(PROTO.tableRise) + 4);
      put(x, y, w, 4, 'wood', { face: 'top', zone: 'touch' });
      put(x, y + 4, w, 6, 'paint', { face: 'side' });                                     // 抽屉带
      for (let i = 0; i < 3; i++) put(x + 6 + i * 30, y + 6, 18, 4, 'steel', { face: 'side' });
      put(x + 3, y + 10, 3, p - y - 10, 'steel', { face: 'edge' });
      put(x + w - 6, y + 10, 3, p - y - 10, 'steel', { face: 'edge' });
      put(x + w - 26, y - 7, 12, 7, 'steel', { face: 'side' });                           // 台钳
      put(x + w - 24, y - 10, 3, 3, 'plastic', { face: 'top' });
      for (let i = 0; i < 3; i++) put(x + 8 + i * 16, y - 2, 9, 2, 'steel', { face: 'top' });   // 散落工具
    },
    generatorSet(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h + 6, w * 0.66 | 0, h - 6, 'paint', { face: 'side', zone: 'touch' });   // 机体
      for (let i = 0; i < 6; i++) put(x + 4, p - h + 10 + i * 5, (w * 0.6 | 0) - 8, 2, 'steel', { face: 'edge' });   // 散热格栅
      put(x + w * 0.68, p - (h * 0.7 | 0), w * 0.3 | 0, (h * 0.7 | 0) - 4, 'steel', { face: 'side' });            // 油箱
      T.dial(x + w * 0.72, p - (h * 0.62 | 0), 5, 'glass');
      onCeil(() => put(x + w - 14, g.ceilY + 2, 6, p - h + 4 - g.ceilY, 'steel', { face: 'side', zone: 'rain' }));   // 排气管到顶
      put(x + 2, p - 4, w - 4, 4, 'rubber', { face: 'bottom', zone: 'tread' });           // 减震脚
    },
    hoseCoil(x, w, h, g) {
      const p = g.floorY - h - 8;
      onWall(() => {
        put(x + 2, p - 3, w - 4, 3, 'steel', { face: 'top' });                            // 挂架
        for (let i = 0; i < 3; i++) put(x + 3 + i * 4, p, w - 6 - i * 8, h - 6 - i * 6, 'rubber', { face: 'side' });   // 卷
        put(x + w / 2 | 0, p + h - 6, 2, 12, 'rubber', { face: 'edge' });                 // 垂下的一段
      });
    },
    // ---- 安保车：笼、闸机、监控墙 ----
    checkGate(x, w, h, g) {
      const p = g.floorY;
      T.post(x, p, h, 4); T.post(x + w - 4, p, h, 4);
      put(x, p - h, w, 5, 'paint', { face: 'top' });                                      // 横梁
      put(x + 4, p - h + 5, w - 8, 6, 'steel', { face: 'bottom' });                       // 传感器条
      put(x + w * 0.3, p - 14, w * 0.4 | 0, 12, 'paint', { face: 'side' });               // 传送带矮台
      put(x + w * 0.3, p - 14, w * 0.4 | 0, 2, 'rubber', { face: 'top', zone: 'tread' });
      T.glassPane(x + w - 26, p - h + 5, 20, 14);                                         // 显示屏：挂在横梁下
      onCeil(() => { const q = put(x + 6, p - h - 4, 6, 4, 'danger', { face: 'side' }); if (q) q.lamp = true; });
    },
    armorLocker(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'paintin', { face: 'side', zone: 'touch' });
      put(x, p - h, w, 2, 'steel', { face: 'top' });
      put(x + (w / 2 | 0) - 1, p - h + 3, 2, h - 6, 'steel', { face: 'edge' });           // 双门缝
      for (let i = 0; i < 2; i++) {
        put(x + 6 + i * (w / 2 | 0), p - h + 10, 10, 18, 'fabric', { face: 'side' });     // 防弹衣轮廓
        put(x + 8 + i * (w / 2 | 0), p - h + 12, 6, 2, 'plastic', { face: 'top' });
      }
      for (let i = 0; i < 3; i++) put(x + 5 + i * 16, p - h - 6, 12, 6, 'steel', { face: 'bottom' });          // 头盔架
      put(x + 4, p - h + 40, w - 8, 4, 'paintHi', { face: 'side' });                      // 编号牌
    },
    monitorRack(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, w, h - 2, 'paint', { face: 'side', zone: 'touch' });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const sx = x + 4 + c * ((w - 10) / 3 | 0), sy = p - h + 5 + r * (h * 0.34 | 0);
        put(sx, sy, ((w - 12) / 3 | 0), h * 0.28 | 0, 'glass', { face: 'side' });
        const q = put(sx + 2, sy + 2, 3, 2, 'paintHi', { face: 'side' }); if (q) q.lamp = true;
      }
      for (let i = 0; i < 6; i++) put(x + 6 + i * 12, p - 10, 6, 2, 'steel', { face: 'edge' });   // 散热孔
      onWall(() => put(x + w - 4, p - h + 6, 2, h - 14, 'rubber', { face: 'edge' }));     // 线缆
    },
    barricade2(x, w, h, g) {
      const p = g.floorY;
      put(x, p - 6, w, 6, 'steel', { face: 'top', zone: 'tread' });                       // 底座
      for (let i = 0; i < 4; i++) {                                                       // 折叠栅
        const bx = x + i * (w / 4 | 0);
        put(bx, p - h, 2, h - 6, 'steel', { face: 'edge' });
        put(bx, p - h, w / 4 | 0, 2, 'steel', { face: 'top' });
        for (let k = 2; k < (w / 4 | 0); k += 6) put(bx + k, p - h + 2, 1, h - 8, 'paint', { face: 'edge' });
      }
      for (let i = 0; i < 3; i++) put(x + 4 + i * (w / 4 | 0), p - h + 2, 12, 3, 'paintHi', { face: 'side' }); // 反光条：压在顶横杆上
      put(x + 2, p - h - 6, 3, 6, 'danger', { face: 'edge' });                            // 警示柱
    },
    cameraMast(x, w, h, g) {
      const p = g.floorY;
      T.post(x + (w / 2 | 0) - 1, p, h, 3);
      put(x - 4, p - 3, w + 8, 3, 'steel', { face: 'top' });                              // 底座法兰
      put(x + (w / 2 | 0) - 6, p - h, 14, 2, 'steel', { face: 'top' });                   // 顶横臂
      put(x + (w / 2 | 0) - 8, p - h + 2, 8, 5, 'paint', { face: 'side' });               // 摄像头头
      put(x + (w / 2 | 0) - 9, p - h + 3, 3, 3, 'glass', { face: 'side' });               // 镜头
      put(x + (w / 2 | 0) - 6, p - h + 7, 4, 2, 'steel', { face: 'bottom' });             // 云台
    },
    cageSection(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h, 3, h, 'steel', { face: 'edge' }); put(x + w - 3, p - h, 3, h, 'steel', { face: 'edge' });
      put(x, p - h, w, 3, 'steel', { face: 'top' }); put(x, p - 3, w, 3, 'steel', { face: 'bottom' });
      onWall(() => T.mesh(x + 3, p - h + 3, w - 6, h - 6, 5, 'steel'));                   // 密网
      put(x + w * 0.4, p - h + 3, 2, h - 6, 'steel', { face: 'edge' });                   // 门缝
      put(x + w * 0.4 - 3, p - (h / 2 | 0), 3, 4, 'plastic', { face: 'side' });           // 挂锁
      put(x + 6, p - 16, w * 0.3 | 0, 3, 'wood', { face: 'top', zone: 'tread' });         // 笼内长凳
    },
    // ---- 机车：操纵台 + 手柄 + 前窗 + 整流罩 ----
    consoleBank(x, w, h, g) {
      const p = g.floorY, y = p - h;
      put(x, y + 10, w, h - 10, 'paintin', { face: 'side', zone: 'touch' });              // 台面下体
      put(x, y + 6, w, 6, 'steel', { face: 'top', zone: 'tread' });                       // 台面
      put(x + 4, y, w - 8, 8, 'paint', { face: 'side' });                                 // 斜面板
      for (let i = 0; i < 5; i++) T.dial(x + 8 + i * 22, y + 9, 5, 'glass');              // 仪表组
      for (let i = 0; i < 6; i++) put(x + 6 + i * 20, y + h - 16, 8, 3, 'plastic', { face: 'side' });          // 开关排
      T.glassPane(x + w - 34, y + 12, 26, 14);                                            // 显示屏
      const q = put(x + 8, y + 20, 5, 3, 'danger', { face: 'side' }); if (q) q.lamp = true;
    },
    pilotSeat(x, w, h, g) {
      seatBay(x, w, g, { n: 1, dir: 1, rise: px(PROTO.seatRise) });
      put(x + w - 8, g.floorY - h, 6, h - px(PROTO.backH) + 1, 'fabric', { face: 'side' });   // 高靠背
      put(x + w - 8, g.floorY - h - 5, 6, 5, 'fabric', { face: 'side' });                     // 头枕
      put(x + (w / 2 | 0) - 2, g.floorY - px(PROTO.seatRise) - 14, 4, 14, 'steel', { face: 'edge' });         // 单柱底座
    },
    throttleLever(x, w, h, g) {
      const p = g.floorY;
      put(x - 6, p - 14, w + 12, 14, 'paintin', { face: 'side', zone: 'touch' });          // 手柄底座（带一小块面板，单独一根也要读得出是机车）
      T.dial(x - 4, p - 12, 3, 'glass'); T.dial(x + w - 1, p - 12, 3, 'glass');            // 扇形两侧小仪表
      for (let i = 0; i < 3; i++) put(x + 1, p - 10 + i * 3, w - 2, 1, 'paintHi', { face: 'edge' });   // 刻度
      put(x + (w / 2 | 0) - 1, p - h, 3, h - 14, 'steel', { face: 'edge' });               // 杆
      put(x + (w / 2 | 0) - 2, p - h - 4, 5, 5, 'danger', { face: 'side', zone: 'touch' });// 红握把
    },
    pipeBundle2(x, w, h, g) {
      const p = g.floorY - h - 4;
      onWall(() => {
        for (let i = 0; i < 5; i++) {
          const py = p + i * ((h - 4) / 5 | 0), len = w - i * 9;
          put(x, py, len, 3, 'steel', { face: 'side', zone: 'rain' });
          put(x + len, py, 3, 8 + i * 2, 'steel', { face: 'edge' });                      // 弯头
          for (let k = 12; k < len; k += 26) put(x + k, py - 1, 2, 5, 'plastic', { face: 'edge' });            // 卡箍
        }
        put(x, p - 3, w, 2, 'steel', { face: 'top' });
      });
    },
    cabWindow(x, w, h, g) {
      const y = g.ceilY + 6;
      onWall(() => {
        put(x, y, w, 4, 'steel', { face: 'top' });                                        // 粗上框
        put(x, y + h, w, 4, 'steel', { face: 'bottom' });                                 // 下框
        put(x, y, 5, h + 4, 'steel', { face: 'side' }); put(x + w - 5, y, 5, h + 4, 'steel', { face: 'side' });
        put(x + (w / 2 | 0) - 2, y, 4, h + 4, 'steel', { face: 'edge' });                 // 中柱
        put(x + 5, y + 4, (w / 2 | 0) - 7, h - 4, 'glass', { face: 'side' });
        put(x + (w / 2 | 0) + 2, y + 4, (w / 2 | 0) - 7, h - 4, 'glass', { face: 'side' });
        for (let i = 0; i < 2; i++) { put(x + 20 + i * (w / 2 | 0), y + h - 6, 26, 1, 'rubber', { face: 'edge' });   // 雨刷
          put(x + 26 + i * (w / 2 | 0), y + h - 12, 1, 7, 'steel', { face: 'edge' }); }
        onCeil(() => put(x + 5, g.ceilY + 1, w - 10, 5, 'fabric', { face: 'bottom' }));   // 遮阳板
      });
    },
    '整流罩'(x, w, h, g) {
      const p = g.floorY;
      put(x, p - h + 8, w, h - 8, 'paintin', { face: 'side', zone: 'touch' });
      for (let i = 0; i < 4; i++) {                                                       // 弧顶分带
        const bw = w - i * 10;
        put(x + i * 5, p - h + 8 - (i + 1) * 3, bw, 3, 'paint', { face: 'top' });
      }
      for (let i = 0; i < 6; i++) put(x + 6 + i * 16, p - h + 14, 10, 2, 'steel', { face: 'edge' });           // 散热百叶
      put(x + w * 0.3, p - h + 22, w * 0.4 | 0, h - 30, 'steel', { face: 'side' });       // 检修门
      for (let i = 0; i < 4; i++) put(x + w * 0.3 + 2 + i * 8, p - h + 24, 2, 2, 'plastic', { face: 'side' }); // 螺栓
    },
  };
  // coach 沿用阶段三那套（座椅/行李架/窗帘…），这里只登记没被阶段三覆盖的件
  RECIPES.seatRow = (x, w, h, g, C) => { if (C.V.seat === 'bench') bench(x, w, g); else seatRow(x, w, g, { perBay: C.V.perBay, facing: C.V.facing }); };
  RECIPES.rack = (x, w, h, g, C) => wallRack(x, w, g, C.V.rack);
  RECIPES.poleGroup = (x, w, h, g) => pole(x, g);
  RECIPES.luggageSet = (x, w, h, g, C) => floorLuggage(x, g, C.it.seed | 0);
  RECIPES.partition = (x, w, h, g) => {
    const p = g.floorY;
    put(x, p - h, w, h, 'paintin', { face: 'side', zone: 'touch' });
    put(x - 1, p - h, w + 2, 2, 'steel', { face: 'top' });
    T.glassPane(x + 1, p - h + 8, w - 2, 12);                                             // 上部观察窗
    put(x, p - 10, w, 2, 'steel', { face: 'edge' });                                      // 踢脚
  };

  // ---------- 阶段四：各类型自己的顶/墙设施 ----------
  // 家具配方管「地上站什么」，这一层管「头顶和墙上有什么」——两类合起来才让九类车
  // 在关掉标签后仍能靠轮廓认出来。全部挂顶/墙，不参与通行。
  function stripLight(x, w, g) {
    onCeil(() => {
      put(x, g.ceilY + 2, w, 2, 'steel', { face: 'bottom' });
      const q = put(x + 2, g.ceilY + 4, w - 4, 2, 'glass', { face: 'bottom' }); if (q) q.lamp = true;
    });
  }
  function pendantLamp(x, g) {
    onCeil(() => {
      put(x, g.ceilY + 2, 1, 8, 'steel', { face: 'edge' });
      put(x - 7, g.ceilY + 8, 15, 2, 'plastic', { face: 'bottom' });
      const q = put(x - 6, g.ceilY + 10, 13, 3, 'glass', { face: 'bottom' }); if (q) q.lamp = true;
    });
  }
  function domeCam(x, g) {
    onCeil(() => {
      put(x, g.ceilY + 2, 8, 3, 'steel', { face: 'top' });
      put(x, g.ceilY + 5, 8, 4, 'glass', { face: 'bottom' });
      const q = put(x + 2, g.ceilY + 8, 4, 3, 'paint', { face: 'side' }); if (q) q.lamp = true;
    });
  }
  function lashingTrack(x, w, g) {
    onCeil(() => {
      put(x, g.ceilY + 6, w, 2, 'steel', { face: 'top' });
      for (let i = 4; i < w; i += 18) put(x + i, g.ceilY + 8, 2, 5, 'steel', { face: 'edge' });   // 系留滑扣
    });
  }
  function conduit(x, w, g) {
    onWall(() => {
      put(x, g.ceilY + 10, w, 3, 'plastic', { face: 'side' });
      for (let i = 6; i < w; i += 26) put(x + i, g.ceilY + 9, 2, 5, 'steel', { face: 'edge' });   // 线卡
    });
  }
  function toolBoard(x, w, g) {
    onWall(() => {
      put(x, g.winSill - 26, w, 22, 'paintin', { face: 'side' });
      for (let i = 3; i < w - 3; i += 9) put(x + i, g.winSill - 22, 2, 12, 'steel', { face: 'edge' });   // 挂扳手
    });
  }
  function speaker(x, g) {
    onWall(() => {
      put(x, g.ceilY + 12, 7, 7, 'plastic', { face: 'side' });
      for (let i = 1; i < 6; i += 2) put(x + i, g.ceilY + 14, 1, 3, 'steel', { face: 'edge' });   // 喇叭孔
    });
  }
  // 警示带贴在身高带内（会被撞到），所以必须像落地件一样躲开门、梯口、台阶塔：分段画
  function warningStrip(x, w, g, C) {
    onWall(() => {
      for (let i = 0; i < w - 16; i += 22) {
        const sx = x + i;
        if (C && C.blocked && C.blocked(sx, 20)) continue;
        put(sx, g.floorY - 26, 20, 3, 'paintHi', { face: 'side' });
        for (let k = 0; k < 20; k += 8) put(sx + k, g.floorY - 26, 3, 3, 'danger', { face: 'side' });   // 斜纹
      }
    });
  }
  function ivRail(x, w, g) {
    onCeil(() => {
      put(x, g.ceilY + 5, w, 2, 'steel', { face: 'top' });
      for (let i = 6; i < w; i += 22) { put(x + i, g.ceilY + 7, 1, 6, 'steel', { face: 'edge' }); put(x + i - 2, g.ceilY + 13, 5, 2, 'plastic', { face: 'bottom' }); }
    });
  }
  function headLamp(x, g) {
    onCeil(() => {
      put(x, g.ceilY + 3, 10, 4, 'steel', { face: 'bottom' });
      const q = put(x + 2, g.ceilY + 7, 6, 3, 'glass', { face: 'bottom' }); if (q) q.lamp = true;
    });
  }
  // 每种车「头顶/墙上有什么」。coach 保持阶段三那一套，其余类型各配自己的：
  // 餐车吊灯、医疗车输液轨、货运车顶系留轨、维修车工具板与线槽、安保车球机与警示带、机车前照灯。
  const TYPEEXTRA = {
    coach: (g, sk, bays, V, rng) => {
      bays.forEach((b, i) => {
        if (V.curtain && rng(i, 3) > 0.35) { CUR = 'curtain'; curtains(b, g); }
        if (V.hook && rng(i, 5) > 0.5) { CUR = 'hook'; hooks(b.x, b.w, g); }
      });
      units(sk, V, rng, 150, 30).forEach(x => {
        if (V.rack === 'net') { CUR = 'net'; cargoNet(x, 96, g); }
        else if (V.rack && rng(x, 7) > (V.rack === 'one' ? 0.55 : 0.25)) { CUR = 'rack'; wallRack(x, 96, g, V.rack); }
        if (V.light) { CUR = 'light'; readingLights(x + 8, 80, g, V.light); }
      });
    },
    sleeper: (g, sk, bays, V, rng) => {
      units(sk, V, rng, 150, 30).forEach(x => {
        if (V.mode === 2) { CUR = 'berthRail'; onCeil(() => put(x + 40, g.ceilY + 3, 2, 9, 'steel', { face: 'edge' })); }
        else { CUR = 'net'; cargoNet(x, 96, g); }
        CUR = 'light'; readingLights(x + 8, 80, g, V.mode === 1 ? 'table' : 'row');
      });
      bays.forEach((b, i) => { if (rng(i, 11) > (V.mode === 0 ? 0.32 : 0.62)) { CUR = 'curtain'; curtains(b, g); } });
    },
    diner: (g, sk, bays, V, rng) => {
      units(sk, V, rng, 96, 70).forEach(x => { CUR = 'pendant'; pendantLamp(x, g); });
      CUR = 'board'; onWall(() => {                                                   // 菜单板：mode 决定挂哪一头
        const bx = V.mode === 2 ? sk.x1 - 94 : sk.x0 + 24;
        put(bx, g.ceilY + 22, 70, 16, 'paintin', { face: 'side' });
        for (let i = 0; i < 4; i++) put(bx + 4 + i * 16, g.ceilY + 26, 12, 2, 'paintHi', { face: 'edge' });
      });
    },
    medical: (g, sk, bays, V, rng, C) => {
      units(sk, V, rng, 110, 30).forEach(x => { CUR = 'ivrail'; ivRail(x, 96, g); });
      CUR = 'strip'; stripLight(sk.x0 + 40, sk.len - 120, g);
      CUR = 'warn'; warningStrip(V.mode === 2 ? sk.x1 - 80 : sk.x0 + 20, 60, g, C);
    },
    freight: (g, sk, bays, V, rng) => {
      units(sk, V, rng, 120, 26).forEach(x => { CUR = 'lashing'; lashingTrack(x, 108, g); });
      CUR = 'strip'; stripLight(sk.x0 + 60, sk.len - 160, g);
      CUR = 'hook'; hooks(V.mode === 0 ? sk.x0 + 30 : sk.x1 - 90, 60, g);
    },
    luggage: (g, sk, bays, V, rng) => {
      units(sk, V, rng, 130, 30).forEach(x => {
        if (V.mode === 1) { CUR = 'rack'; wallRack(x, 100, g, 'both'); }
        else { CUR = 'net'; cargoNet(x, 100, g); }
      });
      CUR = 'lashing'; lashingTrack(sk.x0 + 24, sk.len - 60, g);
      CUR = 'strip'; stripLight(sk.x0 + 80, sk.len - 200, g);
    },
    maintenance: (g, sk, bays, V, rng) => {
      units(sk, V, rng, 150, 30).forEach(x => {
        if (V.mode === 2) { CUR = 'shelf'; onWall(() => put(x, g.ceilY + 30, 96, 4, 'steel', { face: 'top' })); }
        else { CUR = 'board'; toolBoard(x, 110, g); }
      });
      CUR = 'conduit'; conduit(sk.x0 + 20, sk.len - 50, g);
      CUR = 'light'; readingLights(V.mode === 1 ? sk.x0 + sk.len / 2 - 45 : sk.x0 + 60, 90, g, 'row');
    },
    security: (g, sk, bays, V, rng, C) => {
      units(sk, V, rng, 170, 60).forEach(x => { CUR = 'dome'; domeCam(x, g); });
      CUR = 'warn'; warningStrip(sk.x0 + 24, sk.len - 60, g, C);
      CUR = 'speaker';
      if (V.mode === 2) { speaker(sk.x1 - 40, g); } else { speaker(sk.x0 + 30, g); speaker(sk.x1 - 40, g); }
    },
    locomotive: (g, sk, bays, V, rng) => {
      units(sk, V, rng, 120, 50).forEach(x => { CUR = 'headlamp'; headLamp(x, g); });
      CUR = 'conduit'; conduit(sk.x0 + 20, sk.len - 50, g);
      CUR = 'strip'; stripLight(V.mode === 0 ? sk.x0 + 40 : sk.x1 - 160, 120, g);
    },
  };
  // 各类型自己的「落地小件配额」：垃圾桶 / 应急箱 / 地上行李
  const TYPEKIT = {
    coach: { bin: 1, kit: 1, luggage: 1 }, sleeper: { bin: 1, kit: 1, luggage: 0 }, diner: { bin: 1, kit: 1, luggage: 0 },
    medical: { bin: 2, kit: 0, luggage: 0 }, freight: { bin: 1, kit: 1, luggage: 0 }, luggage: { bin: 1, kit: 0, luggage: 1 },
    maintenance: { bin: 1, kit: 1, luggage: 0 }, security: { bin: 1, kit: 1, luggage: 0 }, locomotive: { bin: 0, kit: 1, luggage: 0 },
  };

  // ---------- 阶段四：窗间墙上的车型徽记 ----------
  // 有一节行李车整节只塞得下一只行李箱（净空被台阶塔和梯子吃光），剖面里它就是一间空盒子。
  // 地板上的东西归关卡管，但**窗间墙是美术的**：把每类的身份记号画在墩墙上，
  // 既不占落地占位、也不碰门与梯口，净空再紧的车也还认得出是谁。
  function piers(sk) {
    const bs = (sk.openings || []).filter(o => o.kind === 'window').sort((a, b) => a.x - b.x);
    const out = []; let x = sk.x0 + 14;
    for (const b of bs) { if (b.x - x >= 13) out.push([x, b.x]); x = Math.max(x, b.x + b.w); }
    if (sk.x1 - 14 - x >= 13) out.push([x, sk.x1 - 14]);
    return out;
  }
  const WALLSIGN = {
    coach(g, sk, x0, x1, y0, hh) {                                                    // 扶手 + 支架
      put(x0, y0 + hh * 0.55 | 0, x1 - x0, 2, 'wood', { face: 'top' });
      put(x0 + 1, y0 + hh * 0.55 | 0 + 2, 2, hh * 0.3 | 0, 'steel', { face: 'edge' });
      put(x1 - 3, y0 + hh * 0.55 | 0 + 2, 2, hh * 0.3 | 0, 'steel', { face: 'edge' });
    },
    luggage(g, sk, x0, x1, y0, hh) {                                                  // 挂网 + 吊钩
      onWall(() => T.mesh(x0, y0 + 4, x1 - x0, hh * 0.5 | 0, 3, 'steel'));
      for (let i = 0; i < 3; i++) put(x0 + 2 + i * 4, y0 + (hh * 0.5 | 0) + 6, 1, 6, 'steel', { face: 'edge' });
    },
    sleeper(g, sk, x0, x1, y0, hh) {                                                  // 铺位号牌
      for (let i = 0; i < 3; i++) { put(x0, y0 + 6 + i * 14, x1 - x0, 9, 'paintin', { face: 'side' }); put(x0 + 1, y0 + 8 + i * 14, 3, 5, 'paintHi', { face: 'side' }); }
    },
    diner(g, sk, x0, x1, y0, hh) {                                                    // 三个圆通风口 + 腰线
      for (let i = 0; i < 3; i++) T.dial(x0, y0 + 6 + i * 16, Math.min(4, (x1 - x0) / 2 | 0), 'steel');
      put(x0, y0 + hh - 10, x1 - x0, 2, 'wood', { face: 'top' });
    },
    medical(g, sk, x0, x1, y0, hh) {                                                  // 红十字
      const w = x1 - x0;
      put(x0 + (w / 2 | 0) - 2, y0 + 6, 4, 26, 'danger', { face: 'side' });
      put(x0, y0 + 15, w, 4, 'danger', { face: 'side' });
      put(x0 + (w / 2 | 0) - 1, y0 + 7, 2, 24, 'paintHi', { face: 'side' });
    },
    freight(g, sk, x0, x1, y0, hh) {                                                  // 承重标牌 + 斜撑
      put(x0, y0 + 8, x1 - x0, 12, 'paintin', { face: 'side' });
      put(x0 + 1, y0 + 10, x1 - x0 - 2, 2, 'paintHi', { face: 'edge' });
      for (let i = 0; i < 4; i++) put(x0 + i * 3, y0 + 24, 1, hh - 30, 'steel', { face: 'edge' });
    },
    maintenance(g, sk, x0, x1, y0, hh) {                                              // 工具挂板
      put(x0, y0 + 6, x1 - x0, hh * 0.42 | 0, 'paintin', { face: 'side' });
      for (let i = 1; i < x1 - x0 - 1; i += 3) put(x0 + i, y0 + 9, 1, (hh * 0.42 | 0) - 8, 'steel', { face: 'edge' });
    },
    security(g, sk, x0, x1, y0, hh) {                                                 // 钢网 + 警示斜纹
      onWall(() => T.mesh(x0, y0 + 4, x1 - x0, hh * 0.55 | 0, 2, 'steel'));
      put(x0, y0 + (hh * 0.55 | 0) + 8, x1 - x0, 3, 'paintHi', { face: 'side' });
      for (let i = 0; i < x1 - x0; i += 4) put(x0 + i, y0 + (hh * 0.55 | 0) + 8, 2, 3, 'danger', { face: 'side' });
    },
    locomotive(g, sk, x0, x1, y0, hh) {                                               // 副仪表板 + 高压标识
      put(x0, y0 + 6, x1 - x0, 20, 'paintin', { face: 'side' });
      T.dial(x0 + 1, y0 + 9, Math.min(4, (x1 - x0) / 2 | 0), 'glass');
      T.dial(x0 + 1, y0 + 17, Math.min(4, (x1 - x0) / 2 | 0), 'glass');
      put(x0, y0 + 30, x1 - x0, 6, 'danger', { face: 'side' });
    },
  };
  function wallSign(type, g, sk) {
    const fn = WALLSIGN[type]; if (!fn) return;
    // 徽记整体必须留在角色身高带以上（floorY-36 以下就算「会撞到」，要占位、要躲台阶塔）
    const y0 = g.ceilY + 5, hh = Math.max(20, g.floorY - 40 - y0);
    const ps = piers(sk).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 3);
    CUR = 'sign';
    ps.forEach(p => { if (p[1] - p[0] >= 12) onWall(() => fn(g, sk, p[0], p[1], y0, hh)); });
    CUR = '';
  }

  // ---------- 主装配：一节车 → 构件清单 ----------
  function build(car, sk, items, force) {
    P.length = 0;
    const g = sk.g, sp = sk.sp, V = variantOf(car, force), FITS = CarArt.as(car, 'fit'), rng = (n, m) => ((FITS * 2654435761 + n * 40503 + m * 7919) >>> 0) % 1000 / 1000;
    const bays = (sk.openings || []).filter(o => o.kind === 'window');
    const list = items || car.furniture || [];
    // 「这块地板能不能堆东西」——门、梯子口、台阶塔都是主路线上的必经点，
    // 左右各留 20px 余量（角色宽 22px，堆到边上就等于卡住）。
    const blocked = (x, w) => {
      const a = x - 20, b = x + w + 20;
      for (const d of (sk.car.doors || [])) if (a < d.x + (d.w || 14) + 2 && b > d.x - 2) return true;
      // 爬梯让位区按「梯井 + 出梯后身体所占那一段」算，不是只让开那一根杆。
      // 只有路线换层梯（links）带 exit 描述；车底维修道那种逃生梯是后来另加的、没有 exit 字段，
      // 它的出梯落点同样是 L.x + 跨距，所以按同一个宽度兜底，别让整节车因为 undefined 报错。
      for (const L of (sk.car.ladders || [])) {
        const exitX1 = L.exit ? L.exit.x1 : L.x + 26 + 22;
        if (x < exitX1 && x + w > L.x - 2) return true;      // 与 car-life/audit 同一条区间，见那里的注释
      }
      return false;
    };
    const free = (w, pref, dir) => {
      for (let s = 0; s < 90; s++) {
        const x = Math.round(pref + dir * s * 8);
        if (x > sk.x0 + 8 && x + w < sk.x1 - 8 && !blocked(x, w)) return x;
      }
      return null;
    };
    const out = { type: car.type, variant: V, parts: P.slice(), bays, floor: [], wall: [] };
    // ① 地板件：占位严格等于数据层给的那块（这是通行验证过的），配方只往里填构件
    list.forEach((it, i) => {
      const k = String(it.kind);
      const box = { x: it.x, y: it.y, w: it.w, h: it.h, kind: k, i }; CUR = k;
      out.floor.push(box);
      const R = RECIPES[k];
      if (R) { CURM = 'floor'; R(it.x, it.w, it.h, g, { car, sk, V, rng, it, i }); CURM = 'floor'; }
      else if (/seat|pilotSeat/.test(k)) seatRow(it.x, it.w, g, { perBay: V.perBay, facing: V.facing });
      else { put(it.x, g.floorY - it.h, it.w, it.h, 'crate', { face: 'side', zone: 'touch' }); out.missing = (out.missing || []).concat(k); }
      if (/luggageSet|personalKit|crateStack|sackPile|trunk|strappedCase/.test(k) && !blocked(it.x + it.w - 6, 18))
        floorLuggage(it.x + it.w - 6, g, (it.seed || i) | 0);
    });
    // ② 顶/墙设施：按车型各配一套（不落地，所以完全不影响通行）
    CUR = '';
    (TYPEEXTRA[car.type] || TYPEEXTRA.coach)(g, sk, bays, V, rng, { car, sk, blocked, free, it: null });
    wallSign(car.type, g, sk);   // 窗间墙上的车型徽记：净空再紧也认得出这是哪节车
    // ③ 自己加的落地小件（垃圾桶/应急箱/地上行李）必须躲开门、梯口、台阶塔：
    //    门在数据层是「必须能过」的账本，美术把垃圾桶怼在门口等于凭空造一堵墙。
    const KIT = TYPEKIT[car.type] || TYPEKIT.coach;
    CUR = 'bin';
    for (let k = 0; k < KIT.bin; k++) {
      const bx = free(9, sk.x0 + 40 + k * (sk.len - 90) / Math.max(1, KIT.bin), 1);
      if (bx !== null) bin(bx, g);
    }
    CUR = 'kit';
    if (KIT.kit) { const kx = free(16, sk.x1 - 34, -1); if (kx !== null) emergencyKit(kx, g); }
    CUR = 'luggage';
    if (KIT.luggage && V.luggage === 'floor') { const lx = free(20, sk.x0 + 34, 1); if (lx !== null) floorLuggage(lx, g, CarArt.as(car, 'fit')); }
    // 立杆只认数据层放过的 poleGroup：自己往地板上插一根 132px 高的杆，
    // 等于美术偷偷改了通行账本 —— 那是关卡改动，美术阶段没这个权限。
    CUR = '';

    // ④ 接触阴影：所有落地件统一一条 —— 底边沿、向背光侧偏 1px、高 2px
    out.shadow = [];
    const sh = px(PROTO.shadow);
    out.floor.forEach(b => {
      if (b.h < 3) return;
      out.shadow.push({ x: b.x - 1, y: g.floorY - sh, w: b.w + 2, h: sh, kind: b.kind });   // 一条规则：落地件底边整条压影
    });
    out.parts = P.slice();
    return out;
  }

  // ---------- 绘制 ----------
  // opt.xform(p, frac) => dx：阶段六的摆动变换。frac 是「从上到下第几成」，
  // 所以窗帘/吊带这类悬挂件会画成上端不动、下端摆的剪切，而不是整块平移。
  function draw(pen, fit, opt) {
    const P2 = pen.p, X = pen.X, Y = pen.Y, xf = opt && opt.xform, far = !!(opt && opt.far);
    for (const s of fit.shadow) {                                        // 先铺阴影，家具压在上面
      pen.strip(X(s.x), Y(s.y), s.w, s.h, P2.dark);
    }
    for (const p of fit.parts) {
      // 阶段七：边缘降级。小于 4px 的装饰件在屏幕上本来就糊成一团，
      // 但它是「整列一次性重画」时最大的一笔开销 —— 远处与只露一小截的车一律不画。
      if (far && Math.max(p.w, p.h) < 4) continue;
      const x = X(p.x), y = Y(p.y);
      const at0 = xf ? xf(p, 0) : null;                       // null = 这个构件不动
      if (at0 === null || at0 === undefined) { onePart(pen, P2, p, x, y); continue; }
      const at1 = xf(p, 1);
      // 上下端位移不同才值得切片（悬挂件剪切）；整体平移的（松动面板振动）一层就够
      if (at1 === at0 || p.h < 6) { onePart(pen, P2, p, x + at1, y); continue; }
      for (let yy = 0; yy < p.h; yy += 4) {                              // 3px 一层，逐层错开
        onePart(pen, P2, p, x + xf(p, (yy + 3) / p.h), y + yy, p.w, Math.min(4, p.h - yy));
      }
    }
    return fit.parts.length;
  }
  function onePart(pen, P2, p, x, y, w, h) {
    w = w === undefined ? p.w : w; h = h === undefined ? p.h : h;
    if (p.mat === 'danger') { pen.strip(x, y, w, h, P2.danger); return; }
    if (p.mat === 'paintHi') { pen.strip(x, y, w, h, P2.paintHi); return; }
    // 2px 见方的碎件跑一遍完整材质配方毫无意义（噪点根本落不下），
    // 但它是摆动切片开销的大头 —— 切片后每个小片都跑一次配方，等于白算。
    if (w <= 2 && h <= 5) {
      pen.strip(x, y, w, h, P2[p.mat] || P2.steel);
      if (p.lamp) pen.strip(x, y, w, h, P2.lampCol);
      return;
    }
    if (typeof CarMat !== 'undefined') {
      CarMat.paint(pen, p.mat, x, y, w, h, {
        seed: (p.x * 7 + p.y) | 0, face: p.face, zone: p.zone,
        wear: 0.35, chip: 0.25, soot: 0.25, px: pen.px || 1,
      });
    } else pen.strip(x, y, w, h, P2.steel);
    if (p.lamp) { pen.strip(x, y, w, h, P2.lampCol); }
  }

  // ---------- 自检：给闸门和预览台用 ----------
  // 悬空判定用连通性（和阶段一骨架同一套证法）：
  //   种子 = 贴在地板线上的件 + 所有标了 wall/ceiling/window 的件（它们挂在骨架已验证过的结构上）；
  //   沿矩形相接/重叠做 BFS，凡是 mount:'floor' 却连不到地也连不到任何锚面的，就是画在空中的家具。
  function reach(parts, floorY) {
    const cand = parts.filter(p => p.mount === 'floor');
    const anchor = parts.filter(p => p.mount !== 'floor');
    const bucket = new Map();
    const add = (p, i) => {
      for (let c = Math.floor(p.x / 16), e = Math.floor((p.x + p.w) / 16); c <= e; c++) {
        let a = bucket.get(c); if (!a) bucket.set(c, a = []); a.push(i);
      }
    };
    cand.forEach(add);
    const hit = (p, q) => p.x <= q.x + q.w + 1 && q.x <= p.x + p.w + 1 && p.y <= q.y + q.h + 1 && q.y <= p.y + p.h + 1;
    const seen = new Uint8Array(cand.length), st = [];
    cand.forEach((p, i) => { if (Math.abs(p.y + p.h - floorY) <= 2) { seen[i] = 1; st.push(i); } });
    // 锚件也当种子：从锚件接触到的落地件开始扩散
    for (const a of anchor) for (let c = Math.floor(a.x / 16), e = Math.floor((a.x + a.w) / 16); c <= e; c++) {
      const arr = bucket.get(c); if (!arr) continue;
      for (const j of arr) if (!seen[j] && hit(a, cand[j])) { seen[j] = 1; st.push(j); }
    }
    while (st.length) {
      const i = st.pop(), p = cand[i];
      for (let c = Math.floor(p.x / 16); c <= Math.floor((p.x + p.w) / 16); c++) {
        const a = bucket.get(c); if (!a) continue;
        for (const j of a) if (!seen[j] && hit(p, cand[j])) { seen[j] = 1; st.push(j); }
      }
    }
    return cand.filter((p, i) => !seen[i]);
  }

  function audit(fit, sk, items) {
    const g = sk.g, bad = { float: [], noShadow: [], scale: [], outside: [], mount: [], door: [], stair: [], comb: [], recipe: [] };
    const Hh = sk.sp.bodyH;
    for (const b of fit.floor) {
      const src = (items || []).find(it => it.x === b.x && it.w === b.w);
      if (!src) bad.outside.push(b.kind + '@' + b.x);
    }
    for (const p of reach(fit.parts, g.floorY)) bad.float.push(p.kind + '@' + p.x + ' 离地 ' + (g.floorY - p.y - p.h) + 'px，下面没有任何支撑');
    for (const p of fit.parts) {
      const inBody = p.y + p.h > g.floorY - Hh;      // 底边落在角色身高带内 = 会撞到/走到，必须按落地件管
      if (p.mount === 'floor' && p.y + p.h > g.floorY) bad.float.push(p.kind + '@' + p.x + ' 穿进地板以下');
      // 门口与台阶塔入口是主路线上的必经点，前面不许堆东西（挂在墙上/顶上但垂进身高带的同样算）
      if (inBody) {
        for (const d of (sk.car.doors || []))
          if (p.x + p.w > d.x - 2 && p.x < d.x + (d.w || 14) + 2) bad.door.push(p.kind + '@' + p.x + ' 挡在门 ' + d.id + ' 前');
        // 塔已废除；这条判据改成审「家具有没有堵住爬梯」，比原来更严：
        // 原来只禁踏面投影区，现在连出梯落点也禁 —— 堵住梯口就是假通道。
        for (const L of (sk.car.links || []))
          if (p.x + p.w > L.x - 2 && p.x < L.exit.x1) bad.stair.push(p.kind + '@' + p.x + ' 挡在爬梯 ' + L.id + ' 的梯井或出梯口上');
      }
      // 落地件要么落在数据层已验证的占位里，要么小到人一抬腿就跨过去（≤24px 高）
      if ((p.mount === 'floor' || inBody) && p.h > 24) {
        const inside = fit.floor.some(bb => p.x >= bb.x - 2 && p.x + p.w <= bb.x + bb.w + 2);
        if (!inside) bad.outside.push(p.kind + '@' + p.x + ' ' + p.w + '×' + p.h + ' 不在任何已验证占位内');
      }
      if (p.mount === 'floor' && p.h > Hh * 4) bad.scale.push(p.x + ' 高 ' + p.h + ' 超过 4H');
      if (p.mount === 'ceiling' && p.y < g.ceilY) bad.mount.push('顶上的件高过顶棚线');
      if (p.mount === 'window' && (p.y < g.winHead - 3 || p.y + p.h > g.winSill + 3)) bad.mount.push('窗帘跑出窗洞');
    }
    if ((fit.missing || []).length) bad.recipe = fit.missing.map(k => '没有配方：' + k);
    // 侧视投影规则（阶段三第一版栽过的坑，写成可检的）：
    //   一排同向座椅的 N 个靠背在侧视里必须重合在同一个 x 上（面对面最多两个）。
    //   一排里出现 3 个以上不同 x 的靠背 = 画成了梳子，近看认不出是座椅。
    for (const b of fit.floor) {
      if (!/seat|bench|berth|bunk/i.test(b.kind)) continue;
      const xs = new Set(fit.parts.filter(p => p.mount === 'floor' && p.mat === 'fabric' && p.face === 'side' && p.w >= 5 && p.h >= 12 &&
        p.x >= b.x && p.x + p.w <= b.x + b.w).map(p => p.x));   // 严格含在本占位里，否则相邻两排会被并成一条；mount 过滤掉窗帘
      if (xs.size > 2) bad.comb.push(b.kind + '@' + b.x + ' 一排里画出 ' + xs.size + ' 个不重合的靠背（梳子）');
    }
    // 每件落地家具都要有阴影
    for (const b of fit.floor) {
      if (b.h < 4) continue;
      if (!fit.shadow.some(s => s.x <= b.x + b.w && s.x + s.w >= b.x)) bad.noShadow.push(b.kind + '@' + b.x);
    }
    return { ok: !Object.keys(bad).some(k => bad[k].length), bad, variant: fit.variant.id };
  }
  // 变体之间必须真的换了组合（不是换色）：比较「设施清单」
  function diffVariants() {
    const sig = VARIANTS.map(v => [v.seat, v.perBay, v.facing ? 1 : 0, v.table ? 1 : 0, v.rack, v.light,
      v.curtain ? 1 : 0, v.hook ? 1 : 0, v.bin, v.kit ? 1 : 0, v.luggage].join('|'));
    const dup = []; for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) if (sig[i] === sig[j]) dup.push(i + '=' + j);
    return { sig, dup, n: VARIANTS.length };
  }

  return { H, PROTO, VARIANTS, variantOf, variantsFor, units, AXES, build, draw, audit, diffVariants, reach, RECIPES, TYPEEXTRA, TYPEKIT, WALLSIGN, piers, demoProto, deckAt, px };
})();
