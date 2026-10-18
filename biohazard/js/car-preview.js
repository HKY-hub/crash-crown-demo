// ============ 车厢剖面预览台（程序化美术 阶段一起的检查入口） ============
// 这一页不是游戏页面：它是美术的「工作台」。后续每个阶段都在同一个视图里加东西，
// 所以这里先把三件事做稳：① 三节以上连续车厢的固定侧视剖面；② 平移/缩放/角色比例参照；
// ③ 结构读数（构件数、违规清单、三个落脚空腔的实测遮挡率、当前参数）。
// 几何全部来自 js/car-art.js，材质与色板来自 js/train-draw.js —— 这里不重画任何结构。
const CarPreview = (() => {
  const ZOOMS = [1, 2, 3, 4, 6, 8];
  const st = {
    view: { x: -40, y: 150, z: 2 },          // 世界坐标左上角 + 整数倍放大（保证像素网格不糊）
    n: 3, type: 'coach', seed: 'TR00-0', tod: 'dusk', mode: 'live', carIdx: 1,
    cfg: {}, showSolids: true, showHuman: true, showGrid: true, showParts: false,
    sk: [], sp: null, cars: [], M: null, hover: null,
    fitOn: true, variant: -1, lifeOn: true, cond: -1, far: false,
    W: 0, H: 0, cv: null,
    // 阶段八（整体精修与验收）新增：细节密度 / 暂停动态 / 光照层开关 / 导出用一次性状态
    density: 1,           // 0~1，只驱动已有旋钮（见 applyDensity）
    dFar: false,          // 密度或「远看 LOD」任一要求收碎点时为真
    paused: false,        // 暂停动态：时间轴与轮对都冻住，光留在原位
    time: 0, lastT: 0,    // CarLight 的相位基准（秒），暂停时不再前进
    lightOn: true,        // 阶段六光照/运动层是否叠进这张图（关掉可和阶段七的验收图对照）
    exp: false, gen: 0,   // exp = 当前这一帧是导出帧（不画读数/HUD/网格）；gen = 缓存世代
    // 材质旋钮（阶段二）：磨损 / 掉漆 / 落灰 / 涂装配色，全部透传给 CarArt 的 spec.art
    art: { wear: 0.5, chip: 0.5, soot: 0.35, hue: null, hue2: null }, showSwatch: false,
  };
  // 涂装配色预设（本阶段只上外壳；分车型涂装在阶段四/七）
  const LIVERY = {
    none: [null, null], green: ['#2f6f4f', '#d8d2c4'], blue: ['#2b5b8c', '#cfd6dd'],
    army: ['#5a5f3a', '#b6ad8e'], rust: ['#7a4a35', '#c8bfa8'],
  };
  const REC = { _ops: [], fillRect(x, y, w, h) { this._ops.push([x | 0, y | 0, w | 0, h | 0]); } };

  // ---------- 参数：滑杆项集中在这里 ----------
  const CTRL = [
    ['carLen', '车长', 360, 1000, 20],
    ['interiorH', '内部净高', 100, 180, 2],
    ['roofSkin', '车顶拱厚', 6, 28, 1],
    ['deckThk', '车顶甲板厚', 4, 24, 1],
    ['floorThk', '地板厚', 6, 24, 1],
    ['sillThk', '侧梁厚', 6, 24, 1],
    ['underY', '底盘位置', 380, 440, 2],
    ['wallThk', '端墙厚', 4, 28, 1],
    ['gap', '车间隙', 16, 80, 2],
    ['trussPitch', '桁架间距', 30, 60, 2],
    ['wheelBaseMax', '轮基/车长上限', 0.2, 0.45, 0.01],
  ];
  const WIN = [['sill', '窗台距地板', 30, 79, 1], ['h', '窗洞高', 14, 80, 1], ['jamb', '窗框边宽', 1, 8, 1]];
  const DOOR = [['lintel', '门楣高', 4, 24, 1], ['jamb', '门立边宽', 1, 8, 1], ['w', '门宽', 6, 40, 1]];

  // ---------- 阶段八之一：细节密度 ----------
  // 不新造任何绘制路径：d 只按同一个系数去压「前面几个阶段本来就留了旋钮」的地方 ——
  //   ① CarLight.MOTION 的四个运动分量（摆动 / 松动抖 / 频闪 / 风箱伸缩），阶段六就设计成可以整体收放；
  //   ② 每节车的 wearK（阶段七那条 wear 随机流，CarArt.skin 直接读它）；
  //   ③ 材质三项（磨损 / 掉漆 / 落灰）的「有效值」—— 滑杆显示用户值，这里只乘系数，不去改滑杆；
  //   ④ far（阶段七的边缘降级）：d < 0.34 时屏幕上不到 4px 的碎点整批收掉。
  // d = 1 时四档全部回到本阶段之前的取值（系数 m = 1、MOTION = 1、far 不由密度触发），
  // 所以「密度 1.00」的画面与阶段七的验收图是同一张 —— 这条必须成立，否则等于偷偷改了前面的配方。
  const wearM = () => 0.08 + 0.92 * Math.max(0, Math.min(1, st.density));
  // pen.px 是 CarMat 的「近看 / 远看」细节档位（本页的材质样本面板就是拿 px:4 | 0.5 演示这件事的）：
  // 密度低时把它整体压低，所有材质的细纹两档 LOD（fine ≥4px、veryFine ≥9px）一起收掉 ——
  // 它只改「一块面里画多少纹理」，不改任何矩形的位置与尺寸，所以碰不到碰撞与通行。
  const lodK = () => 0.4 + 0.6 * Math.max(0, Math.min(1, st.density));
  function applyDensity() {
    st.density = Math.max(0, Math.min(1, +st.density || 0));
    if (typeof CarLight !== 'undefined') {
      CarLight.MOTION.sway = CarLight.MOTION.rattle = CarLight.MOTION.flicker = CarLight.MOTION.bellows = st.density;
    }
    st.dFar = st.far || st.density < 0.34;
    return st.density;
  }
  // 透给 CarArt/CarMat 的那一份 art：用户值 × 密度系数（hue / hue2 不参与密度，配色不是细节）
  function effArt() {
    const m = wearM();
    return { wear: st.art.wear * m, chip: st.art.chip * m, soot: st.art.soot * m };
  }
  // 本车的磨损系数：原值只记一次（wearK0），此后每次按密度重算 —— 与 CarArt.draw 那条默认公式同源
  function applyWear(car) {
    if (!car) return 0;
    if (car.wearK0 === undefined)
      car.wearK0 = car.wearK !== undefined ? car.wearK
        : +(0.55 + (CarArt.as(car, 'wear') % 1000) / 1000 * 0.9).toFixed(3);
    car.wearK = +(car.wearK0 * wearM()).toFixed(3);
    return car.wearK;
  }
  // ---------- 阶段八之二：暂停动态效果 ----------
  // 冻结的是「随时间变化」这件事本身：时间轴不再前进、轮对不再转、S.opt.motion = 0
  // （CarLight 里 opt.motion 只管变化不管光 —— 见 js/car-light.js 第 310 行的注释），
  // 所以静态光照、窗景、构图全部留在原位，可以逐帧比对。
  function setPaused(v) { st.paused = v === undefined ? !st.paused : !!v; return st.paused; }
  function togglePause() { return setPaused(); }
  // CarLight 要吃的那个「列车此刻的状态」：预览台的列车线位置固定在 0（预览不跑图），
  // 只有时间在走 —— 于是频闪/摆动/风箱随时间变，窗景与隧道深度不随时间变。
  function lightState() {
    return {
      trainX: 0, time: st.time, px: 2, blackout: false, gust: 0, boost: 0, shake: 0,
      opt: { tod: st.tod, motion: st.paused ? 0 : 1 },
      opened: typeof Set === 'function' ? new Set() : { has: () => false },
    };
  }

  // 一节课要画的四件套（骨架 / 家具 / 生活 / 光照）按车缓存。
  // 为什么必须缓存：CarLight.sway 这张摆动表的键是「家具构件对象本身」，
  // 而 CarFit/CarLife 每重建一次就是一批新对象 —— 每帧重建的话查找必然落空，
  // 摆动会「代码接上了但画面一动不动」。rebuild() 递增 st.gen 让整批缓存作废。
  // 生活层与光照层单独一次装配（rigLife）是有原因的：CarLife.audit 判「悬空」时读的是
  // 模块内部最后一次 build 留下的 FIT —— 所以 build 与 audit 必须紧挨着同一节车调用，
  // 不能先把整列都 build 完再回头 audit（试过那样会拿后一节车的家具去审前一节）。
  const RIG = typeof WeakMap === 'function' ? new WeakMap() : null;
  function rigOf(car) {
    if (typeof TrainGen !== 'undefined' && TrainGen.carWindows) TrainGen.carWindows(car);
    applyWear(car);
    const hit = RIG && RIG.get(car);
    if (hit && hit.gen === st.gen && hit.sp === st.sp && hit.variant === st.variant && hit.cond === st.cond) return hit;
    const sk = CarArt.skeleton(car, st.sp);
    const fit = typeof CarFit === 'undefined' ? { parts: [], shadow: [], floor: [], variant: { id: '-' } }
      : CarFit.build(car, sk, car.furniture, st.variant);
    const r = { gen: st.gen, sp: st.sp, variant: st.variant, cond: st.cond, sk, fit, life: null, L: null, hasLife: false, hasLight: false, litOn: st.lightOn };
    if (RIG) RIG.set(car, r);
    return r;
  }
  function rigLife(R, car) {
    const M = st.M || { cars: [car], events: [], opts: { ruin: 0.6 } };
    if (!R.hasLife) {
      R.life = (typeof CarLife === 'undefined' || typeof CarFit === 'undefined')
        ? { parts: [], zones: [], cond: 0, condName: '-' } : CarLife.build(car, R.sk, R.fit, M, st.cond);
      R.hasLife = true;
    }
    if (!R.hasLight || R.litOn !== st.lightOn) {
      R.L = (st.lightOn && typeof CarLight !== 'undefined') ? CarLight.build(car, R.sk, R.fit, R.life, M, lightState()) : null;
      R.hasLight = true; R.litOn = st.lightOn;
    }
    return R;
  }

  function buildSpec(TG) {
    const o = Object.assign({}, st.cfg, { art: Object.assign({}, st.art, effArt()) });
    const win = {}, dr = {};
    WIN.forEach(r => { if (o[r[0]] !== undefined) { win[r[0]] = o[r[0]]; delete o[r[0]]; } });
    DOOR.forEach(r => { if (o[r[0]] !== undefined) { dr[r[0]] = o[r[0]]; delete o[r[0]]; } });
    if (Object.keys(win).length) o.win = win;
    if (Object.keys(dr).length) o.door = dr;
    return CarArt.spec(Object.assign({ unit: 20, bodyH: (TG && TG.MOVE ? TG.MOVE.h : 36) }, o));
  }

  // 样板车原本只有空壳（阶段一只管骨架）。阶段三要看的「座椅摆法/行李/设施」得有数据才画得出来，
  // 所以这里现造一套演示占位 —— 位置全部躲开门与车间连接处，且只进 demo 模式，实编组模式仍用关卡真数据。
  function demoFurniture(cars) {
    cars.forEach(c => {
      const f = [], fH = CarFit.px(CarFit.PROTO.backH), y = c.yFloor - fH;
      [0.10, 0.34, 0.58].forEach(t => f.push({ kind: 'seatRow', x: Math.round(c.x0 + c.len * t), y, w: 92, h: fH, seed: c.i * 7 + 3 }));
      [0.80, 0.90].forEach(t => f.push({ kind: 'luggageSet', x: Math.round(c.x0 + c.len * t), y: c.yFloor - 26, w: 34, h: 26, seed: c.i * 5 + 9 }));
      c.furniture = f;
    });
  }
  // ---------- 重建：样板车组 + 一份实编组（用于对照碰撞） ----------
  function rebuild(TG) {
    st.gen++;                                   // 世代 +1：每节车的四件套缓存整体作废，下面重新装配
    applyDensity();
    // 两种模式：live = 直接拿实编组的车（可以叠碰撞体，验证美术与通行是否对得上）；
    //           demo = 样板车，滑杆全开，用来看参数改完结构还成不成立。
    if (TG) {
      const plan = TG.planForMinutes(10);
      st.M = TG.build(st.seed, { cars: plan.cars, change: plan.change, minutes: 10, ruin: 0.6, speedKmh: 210 });
      st.M.cars.forEach(c => TG.carWindows(c));
    }
    if (st.mode === 'live' && st.M) {
      st.sp = TrainDraw.spec();
      st.sp.art = Object.assign({}, st.sp.art, st.art, effArt());   // 实编组模式锁死几何，但美术旋钮仍然可调
      st.carIdx = Math.max(0, Math.min(st.M.cars.length - st.n, st.carIdx));
      st.cars = st.M.cars.slice(st.carIdx, st.carIdx + st.n);
    } else {
      st.sp = buildSpec(TG);
      st.cars = CarArt.demoRig(st.n, st.type, st.sp, TG);
      if (typeof CarFit !== 'undefined') demoFurniture(st.cars);
    }
    // 骨架/家具/生活/光照一律走 rigOf+rigLife（同一批对象，摆动表才查得到）
    st.sk = st.cars.map(c => rigOf(c).sk);
    st.fit = st.cars.map(c => rigOf(c).fit);
    measure();
    st.life = st.sk.map(sk => rigLife(rigOf(sk.car), sk.car).life);
    fit();
  }
  // 三个落脚空腔的实测遮挡率 + 结构证明（用录制指令，不估）
  function measure() {
    st.report = st.sk.map(sk => {
      const pen = TrainDraw.pen(REC, TrainDraw.PAL[st.tod], v => v, v => v, 0, 1);
      const cov = CarArt.measure(sk, pen, REC);
      return CarArt.check(sk, { cov, floorY: st.M ? st.M.floorY : undefined, roofY: sk.car.yRoof });
    });
    st.bad = st.report.flatMap(r => Object.keys(r.bad).flatMap(k => r.bad[k].map(v => k + ':' + v)));
    // 阶段三：家具层同一套逻辑 —— 每台都现场自检，违规直接进 st.bad（左上角与 tag 会变红）
    st.fitBad = []; st.fitN = 0; st.shN = 0;
    if (typeof CarFit !== 'undefined') st.sk.forEach((sk, i) => {
      const f = st.fit[i], a = CarFit.audit(f, sk, sk.car.furniture);
      st.fitN += f.parts.length; st.shN += f.shadow.length;
      Object.keys(a.bad).forEach(k => a.bad[k].forEach(s => st.fitBad.push('家具' + k + ':' + s)));
    });
    // 阶段五：生活层同一套现场自检（rigLife 装配 → 立刻 audit：这两步之间不许插入别的车）
    st.lifeBad = []; st.lifeN = 0; st.conds = [];
    if (typeof CarLife !== 'undefined' && st.fit) st.sk.forEach((sk, i) => {
      const M = st.M || { cars: st.cars, events: [], opts: { ruin: 0.6 } };
      const R = rigLife(rigOf(sk.car), sk.car), L = R.life;
      const a = CarLife.audit(L, sk, sk.car, M);
      st.lifeN += L.parts.length; st.conds.push(L.condName);
      if (!a.ok) Object.keys(a.bad).forEach(k => a.bad[k].forEach(x => st.lifeBad.push('生活' + k + ':' + x)));
    });
    st.bad = st.bad.concat(st.fitBad, st.lifeBad);
  }
  function fit() {
    const cv = st.cv || { width: st.W || 1200, height: st.H || 600 };
    st.W = cv.width; st.H = cv.height;
    const x0 = -200, x1 = st.cars[st.cars.length - 1].x1 + 200;
    const y0 = st.sp.crestY - 40, y1 = st.sp.railY + 24;
    let z = ZOOMS[0];
    for (const c of ZOOMS) if ((st.W - 40) / c >= (x1 - x0) && (st.H - 40) / c >= (y1 - y0)) z = c;
    st.view.z = z;
    st.view.x = x0 - ((st.W / z) - (x1 - x0)) / 2;
    st.view.y = y0 - ((st.H / z) - (y1 - y0)) / 2;
  }

  // ---------- 绘制 ----------
  // 洞后面必须有点东西：窗是「不画东西」的洞，预览台若给纯黑底，窗就看不出来是窗。
  // 这里只画最简的三层（天空带 / 远山轮廓 / 地平线以下的路基），真正的沿途世界在阶段六接 train-draw 的 world()。
  function backdrop(g, pal, sp) {
    const z = st.view.z, sy = y => (y - st.view.y) * z, sx = x => (x - st.view.x) * z;
    const sky = pal.skyList;
    g.fillStyle = sky[0]; g.fillRect(0, sy(sp.crestY - 260), st.W, sy(sp.railsY - 90) - sy(sp.crestY - 260));
    g.fillStyle = sky[1]; g.fillRect(0, sy(sp.railsY - 90), st.W, sy(sp.railsY - 34) - sy(sp.railsY - 90));
    g.fillStyle = sky[2]; g.fillRect(0, sy(sp.railsY - 34), st.W, sy(sp.railsY) - sy(sp.railsY - 34));
    g.fillStyle = pal.steelLo;
    for (let x = Math.floor(st.view.x / 24) * 24; x < st.view.x + st.W / z + 24; x += 24) {
      const k = Math.floor(x / 24), h = 26 + Math.abs(Math.sin(k * 1.7) * 44) + (k % 3) * 7;
      g.fillRect(sx(x), sy(sp.railsY - 34 - h), 25 * z, h * z);
    }
    g.fillStyle = pal.floorLo; g.fillRect(0, sy(sp.railsY - 34), st.W, 34 * z);
    g.fillStyle = pal.grime;
    for (let x = Math.floor(st.view.x / 90) * 90; x < st.view.x + st.W / z + 90; x += 90)
      g.fillRect(sx(x), sy(sp.railsY - 20), 34 * z, 3 * z);
  }
  function ground(g, pal, sp) {
    backdrop(g, pal, sp);
    g.fillStyle = pal.dark; g.fillRect(0, (sp.railsY + 6 - st.view.y) * st.view.z, st.W, st.H);
    g.fillStyle = pal.ballastLo; g.fillRect(0, (sp.railsY + 3 - st.view.y) * st.view.z, st.W, 3 * st.view.z);
    g.fillStyle = pal.ballast;
    for (let x = Math.floor(st.view.x / 26) * 26; x < st.view.x + st.W / st.view.z; x += 26)
      g.fillRect((x - st.view.x) * st.view.z, (sp.railsY - 1) * st.view.z, 12 * st.view.z, 4 * st.view.z);
    g.fillStyle = pal.rail; g.fillRect(0, (sp.railsY - 3) * st.view.z, st.W, 2 * st.view.z);
    g.fillStyle = pal.railHi; g.fillRect(0, (sp.railsY - 3) * st.view.z, st.W, 1 * st.view.z);
    g.fillStyle = pal.rail; g.fillRect(0, (sp.railsY + 3) * st.view.z, st.W, 2 * st.view.z);
    g.fillStyle = pal.line; g.fillRect(0, (sp.railsY + 6) * st.view.z, st.W, st.H);
  }
  // 角色参照：在世界坐标系里画（由调用方设好变换），标注与网格在屏幕坐标系里画
  function humanRef(g, pal, sp) {
    if (!st.showHuman) return;
    const z = st.view.z, H = sp.bodyH, hx = Math.round(st.cars[0].x0 + 80), hy = sp.floorY - H;
    drawHuman(TrainDraw.pen(g, pal, v => v, v => v, 0, z), hx, hy, H);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = 'rgba(186,255,92,0.8)'; g.lineWidth = 1; g.setLineDash([4, 3]); g.beginPath();
    for (let k = 0; k <= 4; k++) {
      const sy = (hy + H - k * H / 4 - st.view.y) * z + 0.5;
      g.moveTo((hx - 34 - st.view.x) * z, sy); g.lineTo((hx - 6 - st.view.x) * z, sy);
    }
    g.stroke(); g.setLineDash([]);
    g.fillStyle = '#baff5c'; g.font = '11px monospace';
    g.fillText('H=' + H + 'px', (hx - 96 - st.view.x) * z, (hy + H / 2 - st.view.y) * z);
    for (let k = 1; k <= 4; k++) g.fillText((k / 4).toFixed(2) + 'H', (hx - 30 - st.view.x) * z, (hy + H - k * H / 4 - st.view.y) * z + 3);
  }
  function ruler(g, pal, sp) {
    const z = st.view.z;
    if (st.showGrid) {
      g.strokeStyle = 'rgba(120,160,190,0.15)'; g.lineWidth = 1; g.beginPath();
      for (let x = Math.floor(st.view.x / 20) * 20; x < st.view.x + st.W / z; x += 20) {
        const sx = (x - st.view.x) * z + 0.5; g.moveTo(sx, 0); g.lineTo(sx, st.H);
      }
      for (let y = Math.floor(st.view.y / 20) * 20; y < st.view.y + st.H / z; y += 20) {
        const sy = (y - st.view.y) * z + 0.5; g.moveTo(0, sy); g.lineTo(st.W, sy);
      }
      g.stroke();
    }
    const tag = (x0, y0, x1, y1, txt) => {
      g.strokeStyle = 'rgba(120,220,255,0.75)'; g.lineWidth = 1; g.beginPath();
      g.moveTo((x0 - st.view.x) * z + 0.5, (y0 - st.view.y) * z); g.lineTo((x1 - st.view.x) * z + 0.5, (y1 - st.view.y) * z); g.stroke();
      g.fillStyle = 'rgba(140,230,255,0.95)'; g.font = '11px monospace';
      g.fillText(txt, ((x0 + x1) / 2 - st.view.x) * z + 4, ((y0 + y1) / 2 - st.view.y) * z);
    };
    const c0 = st.cars[0], c1 = st.cars[st.cars.length - 1];
    tag(c0.x0 + 120, sp.ceilY, c0.x0 + 120, sp.floorY, '净高 ' + (sp.floorY - sp.ceilY) + 'px = ' + ((sp.floorY - sp.ceilY) / sp.bodyH).toFixed(2) + 'H');
    tag(c0.x0, sp.crestY - 16, c0.x1, sp.crestY - 16, '车长 ' + c0.len + 'px = ' + (c0.len / sp.unit).toFixed(1) + 'm');
    if (st.cars.length > 1) tag(c0.x1, sp.railY + 20, c1.x0, sp.railY + 20, '间隙 ' + sp.gap + 'px');
    tag(c0.x0 + sp.wheelBase / 2 + (c0.len - sp.wheelBase) / 2 * 0, sp.railY - 2 * sp.wheelR, c0.x0 + (c0.len - sp.wheelBase) / 2 + sp.wheelBase, sp.railY - 2 * sp.wheelR, '轮基 ' + sp.wheelBase + 'px');
  }
  function drawHuman(pen, x, y, H) {
    const w = Math.round(H * 0.61);
    const p = pen.p;
    pen.strip(x, y + H * 0.30, w, H * 0.44, p.vest || '#6a86e8');
    pen.strip(x + w * 0.20, y, w * 0.6, H * 0.3, p.skin);
    pen.strip(x + w * 0.15, y - 1, w * 0.7, H * 0.1, p.hair || '#24355c');
    pen.strip(x + w * 0.12, y + H * 0.74, w * 0.3, H * 0.26, p.clothDark || '#22315e');
    pen.strip(x + w * 0.58, y + H * 0.74, w * 0.3, H * 0.26, p.clothDark || '#22315e');
    pen.strip(x - w * 0.35, y + H * 0.4, w * 0.4, H * 0.08, p.metal || '#39424e');
  }

  // 整列共用的一张摆动表（构件对象 → 摆动参数），与 js/train-draw.js 的 scene() 同一套用法
  const SWAY = typeof Map === 'function' ? new Map() : { clear() {}, set() {}, size: 0 };
  // frame(g, TG, o)：o 只给导出帧用 —— { far: 强制收碎点, tag: 右下角角标文字 }
  function frame(g, TG, o) {
    o = o || {};
    const sp = st.sp, z = st.view.z, pal = TrainDraw.PAL[st.tod];
    const LT = st.lightOn && typeof CarLight !== 'undefined';
    const S = lightState();
    const far = st.dFar || !!o.far;
    st.W = g.canvas.width; st.H = g.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1017'; g.fillRect(0, 0, st.W, st.H);
    g.fillStyle = pal.skyList[0]; g.fillRect(0, 0, st.W, Math.max(0, (sp.crestY - 60 - st.view.y) * z));
    ground(g, pal, sp);
    if (st.showSolids && st.M) drawSolids(g, pal, sp);
    // 世界坐标系：一次 setTransform，构件的 x/y/w/h 全部按世界像素画，缩放由变换负责
    g.setTransform(z, 0, 0, z, -st.view.x * z, -st.view.y * z);
    const pen = TrainDraw.pen(g, pal, v => v, v => v, st.roll || 0, +(z * lodK()).toFixed(3));
    // 阶段六：摆动表先按「画出来的那批构件对象」建好，再交给家具层与生活层（rigLife 缓存保证对象不换身份）
    if (LT) {
      SWAY.clear();
      for (const sk of st.sk) { const R = rigLife(rigOf(sk.car), sk.car); if (R.L) R.L.sway.forEach((e, q) => SWAY.set(q, e)); }
    }
    const XF = LT ? CarLight.xform(SWAY, S, S.time) : null;
    for (const sk of st.sk) CarArt.draw(pen, sk);
    // 阶段六：窗景画在车壳之后（把骨架那层玻璃盖掉重画）、家具之前（窗帘挂在窗前）
    if (LT) for (const sk of st.sk) CarLight.drawWindows(pen, sk, S, st.M);
    if (st.fitOn) for (let i = 0; i < st.sk.length; i++) CarFit.draw(pen, rigLife(rigOf(st.sk[i].car), st.sk[i].car).fit, { xform: XF, far: far });
    // 阶段五：生活细节与灾难叙事，画在家具之上（同一套构件记录，可单独关掉做对照）
    st.life = [];
    if (st.fitOn && st.lifeOn && typeof CarLife !== 'undefined')
      for (const sk of st.sk) {
        const R = rigLife(rigOf(sk.car), sk.car);
        st.life.push(R.life); CarLife.draw(pen, R.life, { xform: XF, far: far });
      }
    // 阶段六：光照与风箱伸缩最后叠上来 —— 光必须落在地板/家具之上，否则会被不透明的构件盖掉
    if (LT) for (const sk of st.sk) {
      const R = rigLife(rigOf(sk.car), sk.car);
      if (R.L) { CarLight.draw(pen, R.L, S, S.time); CarLight.drawFlex(pen, R.L, S, S.time); }
    }
    if (st.showSolids && st.M) overlayTop(g);
    humanRef(g, pal, sp);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!st.exp) ruler(g, pal, sp);
    // 车顶设备/台阶塔不属于骨架（那是玩法实体），这里只在对照模式下画出，避免「看得见上不去」
    if (st.showParts) outline(g, sp);
    if (st.showSwatch) swatches(g, pal);
    if (st.exp) expTag(g, o); else hud(g, sp);
  }
  // 导出帧不打 HUD/网格/读数，只在右下角留一行来源说明（哪一版配方、什么密度、几档新旧）
  function expTag(g, o) {
    const t = o.tag || '';
    if (!t) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = '12px monospace'; g.fillStyle = 'rgba(6,10,14,0.8)';
    const w = Math.min(st.W - 8, g.measureText(t).width + 10);
    g.fillRect(st.W - w - 4, st.H - 20, w, 16);
    g.fillStyle = '#baff5c'; g.fillText(t, st.W - w + 1, st.H - 8);
  }
  // 叠在美术之上的那一层：主路线黄线 + 数据层占位框（青色）。
  // 阶段三之后这一层才有意义 —— 要看的正是「每个高过 24px 的家具构件是不是都待在关卡给的那块占位里」。
  // 注意：调用时世界变换（setTransform）已经生效，这里一律用世界坐标，不再自己乘 z。
  function overlayTop(g) {
    const z = st.view.z, L = st.view.x, R = st.view.x + st.W / z;
    g.lineWidth = Math.max(0.5, 1.4 / z);
    g.strokeStyle = 'rgba(255,220,120,0.95)'; g.beginPath();
    for (const s of st.M.solids) {
      if (!s.main || s.door || s.x + s.w < L || s.x > R) continue;
      g.moveTo(s.x, s.y); g.lineTo(s.x + s.w, s.y);
    }
    g.stroke();
    if (!st.fitOn) return;
    g.strokeStyle = 'rgba(110,255,220,0.9)';
    for (const f of st.fit) for (const b of f.floor) {
      if (b.h < 4 || b.x + b.w < L || b.x > R) continue;
      g.strokeRect(b.x, b.y, b.w, b.h);
    }
  }
  function drawSolids(g, pal, sp) {
    const z = st.view.z;
    g.fillStyle = 'rgba(255,90,90,0.34)';
    for (const s of st.M.solids) {
      if (s.x + s.w < st.view.x - 20 || s.x > st.view.x + st.W / z + 20) continue;
      if (!(s.main || s.door || s.catwalk || s.under || s.stair)) continue;
      g.fillRect((s.x - st.view.x) * z, (s.y - st.view.y) * z, s.w * z, s.h * z);
    }
    g.strokeStyle = 'rgba(255,220,120,0.9)'; g.lineWidth = 2; g.beginPath();
    for (const s of st.M.solids) {
      if (!s.main || s.door || s.x + s.w < st.view.x || s.x > st.view.x + st.W / z) continue;
      g.moveTo((s.x - st.view.x) * z, (s.y - st.view.y) * z); g.lineTo((s.x + s.w - st.view.x) * z, (s.y - st.view.y) * z);
    }
    g.stroke();
  }
  function outline(g, sp) {
    const z = st.view.z;
    g.lineWidth = 1;
    if (st.fitOn) for (const f of st.fit) for (const p of f.parts) {
      const hit = st.hover && st.hover.id === '家具 ' + (p.kind || '?') && st.hover.x === p.x && st.hover.y === p.y;
      g.strokeStyle = hit ? '#ffe94a' : 'rgba(255,140,220,0.30)';
      g.strokeRect((p.x - st.view.x) * z + 0.5, (p.y - st.view.y) * z + 0.5, p.w * z - 1, p.h * z - 1);
    }
    for (const sk of st.sk) for (const p of sk.parts) {
      if (p.noDraw) continue;
      const hit = st.hover && st.hover.id === p.id;
      g.strokeStyle = hit ? '#ffe94a' : 'rgba(120,220,255,0.30)';
      g.strokeRect((p.x - st.view.x) * z + 0.5, (p.y - st.view.y) * z + 0.5, p.w * z - 1, p.h * z - 1);
      if (hit) {
        g.strokeStyle = 'rgba(255,120,120,0.9)'; g.beginPath();
        for (const q of (p._hit || [])) { g.moveTo((p.x + p.w / 2 - st.view.x) * z, (p.y + p.h / 2 - st.view.y) * z); g.lineTo((q.x + q.w / 2 - st.view.x) * z, (q.y + q.h / 2 - st.view.y) * z); }
        g.stroke();
      }
    }
  }
  function hud(g, sp) {
    const lines = [];
    lines.push((st.mode === 'live' ? '实编组 第 ' + (st.carIdx + 1) + '~' + (st.carIdx + st.n) + ' 节' : '样板车 ' + st.n + ' 节') +      ' · 车型 ' + st.cars.map(c => c.type).join('/') + ' · 构件 ' + st.sk.reduce((a, s) => a + s.parts.length, 0) +      '（' + st.sk.map(s => s.parts.length).join('+') + '）');
    lines.push('车长 ' + sp.carLen + ' · 净高 ' + sp.interiorH + ' · 窗台 ' + sp.win.sill + ' · 洞高 ' + sp.win.h + ' · 底盘 ' + sp.underY + ' · 轨面 ' + sp.railY + ' → 落轨 ' + sp.railsY);
    lines.push('轮基 ' + sp.wheelBase + ' · 轮径 ' + sp.wheelR * 2 + ' · 端墙 ' + sp.wallThk + ' · 间隙 ' + sp.gap + ' · 桁架 ' + sp.trussPitch);
    const sc = st.report[0] ? st.report[0].scale : null;
    if (sc) lines.push('尺度 H=' + sc.H + 'px：净高 ' + sc.interiorInH.toFixed(2) + 'H · 门净高 ' + sc.doorClearInH.toFixed(2) + 'H · 窗台 ' + sc.sillInH.toFixed(2) + 'H · 通过台 ' + sc.gangClearInH.toFixed(2) + 'H');
    const cov = st.sk.map(s => s.ink || {});
    const mx = k => Math.max.apply(null, cov.map(c => c[k] || 0));
    lines.push('实测遮挡：车底维修道 ' + (mx('车底维修道') * 100).toFixed(0) + '% · 通过台 ' + (mx('通过台') * 100).toFixed(0) + '% · 门口 ' + (mx('门口') * 100).toFixed(0) + '%');
    if (typeof CarFit !== 'undefined') {
      const V = st.fit.map(f => f.variant.id).join('/'), F = st.mode === 'demo' ? '演示' : '关卡';
      lines.push('家具（' + F + '占位）：构件 ' + st.fitN + '（均 ' + (st.fitN / st.fit.length | 0) + '/节）· 变体 ' + V +
        ' · 接触阴影 ' + st.shN + ' 条 · 自检违规 ' + st.fitBad.length + ' 条' + (st.fitBad.length ? '：' + st.fitBad.slice(0, 2).join(' | ') : ''));
    }
    if (typeof CarLife !== 'undefined' && st.conds) {
      lines.push('生活层（' + (st.cond < 0 ? '档位由关卡数据推' : '手动锁 ' + CarLife.COND[st.cond].name) + '）：构件 ' + st.lifeN +
        ' · 档位 ' + st.conds.join('/') + ' · 自检违规 ' + (st.lifeBad || []).length + ' 条' +
        ((st.lifeBad || []).length ? '：' + st.lifeBad.slice(0, 2).join(' | ') : ''));
    }
    if (sp.bad.length) lines.push('配置非法：' + sp.bad.join('，'));
    // 阶段八读数：密度实际按了多少个旋钮、动态是否冻住（截图上要能直接读出这一帧的状态）
    const wk = st.sk.length ? st.sk[0].car.wearK : null;
    lines.push('细节密度 ' + st.density.toFixed(2) + '：运动分量 ×' + st.density.toFixed(2) + ' · 材质/磨损系数 ×' +
      wearM().toFixed(2) + '（本车 wearK ' + wk + '）· 碎点 ' + (st.dFar ? '已收（far）' : '全铺') +
      ' · 光照层 ' + (st.lightOn ? '开' : '关') + ' · ' + (st.paused ? '【动态已暂停】t=' + st.time.toFixed(2) + 's' : '动态运行中 t=' + st.time.toFixed(2) + 's'));
    lines.push(st.bad.length ? '结构违规 ' + st.bad.length + ' 条：' + st.bad.slice(0, 3).join(' | ') : '结构违规 0 条（悬空/穿插/载荷/覆盖/对齐/遮挡/尺度全过）');
    if (st.M && st.mode === 'demo' && st.sp.interiorH !== st.M.cars[0].yFloor - st.M.cars[0].yCeil)
      lines.push('注意：净高与碰撞不一致 —— 实编组 ' + (st.M.cars[0].yFloor - st.M.cars[0].yCeil) + 'px，这里 ' + st.sp.interiorH + 'px（改它必须同步改玩法常量）');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(6,10,14,0.82)'; g.fillRect(8, 8, Math.min(560, st.W - 16), lines.length * 16 + 12);
    g.fillStyle = st.bad.length || sp.bad.length ? '#ff8a7a' : '#baff5c'; g.font = '12px monospace';
    lines.forEach((t, i) => g.fillText(t, 16, 26 + i * 16));
    if (st.hover) {
      const h = st.hover;
      const txt = h.id + ' · ' + h.kind + ' · ' + h.w + '×' + h.h + ' @' + h.x + ',' + h.y + ' · 层' + h.layer + ' · 贴：' + (h._hit || []).map(q => q.id).join(',');
      g.fillStyle = 'rgba(6,10,14,0.9)'; g.fillRect(8, st.H - 30, Math.min(760, st.W - 16), 22);
      g.fillStyle = '#ffe94a'; g.fillText(txt, 16, st.H - 14);
    }
  }

  // 材质样本：同一块矩形左半「近看」、右半「远看」，直接检验「近看可辨识、远看不杂乱」
  const SW = ['paint', 'steel', 'rubber', 'glass', 'fabric', 'plastic', 'antiskid', 'wood', 'grate'];
  function swatches(g, pal) {
    const W = 132, H = 46, gap = 8, x0 = 12, y0 = st.H - (H + 22) * 2 - 18;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(6,10,14,0.88)'; g.fillRect(x0 - 6, y0 - 20, (W + gap) * 5 + 10, (H + 22) * 2 + 26);
    g.font = '11px monospace';
    for (let i = 0; i < SW.length; i++) {
      const col = i % 5, row = i / 5 | 0, x = x0 + col * (W + gap), y = y0 + row * (H + 22);
      const pen = TrainDraw.pen(g, pal, v => v, v => v, 0, 4);
      const o = { seed: 9910 + i * 7, face: 'side', zone: 'corner', wear: st.art.wear, chip: st.art.chip, soot: st.art.soot };
      CarMat.paint(pen, SW[i], x, y, W / 2, H, Object.assign({ px: 4 }, o));
      CarMat.paint(pen, SW[i], x + W / 2, y, W / 2, H, Object.assign({ px: 0.5 }, o));
      g.fillStyle = '#8ea6b4'; g.fillText(SW[i], x + 1, y + H + 11);
      g.fillStyle = '#4f6b7a'; g.fillText('近|远', x + W - 26, y + H + 11);
    }
  }

  // ---------- 九类样板墙（阶段四检查视图） ----------
  // 一屏画完九类车厢，每类一节完整样板。标签可关 —— 关掉之后还能认出类型，
  // 才算满足阶段四那条「不靠换墙色、靠轮廓与家具认车型」。
  const MTYPES = ['coach', 'luggage', 'sleeper', 'diner', 'medical', 'freight', 'maintenance', 'security', 'locomotive'];
  function montage(g, TG, o) {
    o = o || {};
    const sp = buildSpec(TG), z = o.z || 1, W = g.canvas.width, H = g.canvas.height;
    const cardH = Math.round((sp.railsY - sp.crestY + 34) * z) + 26;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, H);
    const pal = TrainDraw.PAL[o.tod || 'dusk'];
    const rows = [];
    const list = o.types && o.types.length ? o.types : MTYPES;
    list.forEach((t, i) => {
      const car = CarArt.demoCar(0, t, sp, TG);
      if (typeof CarFit !== 'undefined') CarFit.demoProto(car);
      applyWear(car);
      const sk = CarArt.skeleton(car, sp);
      const fit = typeof CarFit === 'undefined' ? { parts: [], shadow: [] } : CarFit.build(car, sk, car.furniture, -1);
      const oy = 16 + i * cardH, ox = 14;
      g.setTransform(z, 0, 0, z, ox - (sk.x0 - 12) * z, oy + 14 - (sp.crestY - 14) * z);
      const pen = TrainDraw.pen(g, pal, v => v, v => v, 0, z);
      CarArt.draw(pen, sk);
      if (fit.parts.length) CarFit.draw(pen, fit, { far: o.far || st.dFar });
      g.setTransform(1, 0, 0, 1, 0, 0);
      const a = CarFit.audit(fit, sk, car.furniture);
      if (o.labels !== false) {
        g.fillStyle = '#baff5c'; g.font = '13px monospace';
        g.fillText((TG.CAR[t] ? TG.CAR[t].name : t) + ' · ' + t + ' · 构件 ' + fit.parts.length +
          ' · 自检 ' + (a.ok ? '0 违规' : '有违规'), ox + 2, oy + 10);
      }
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.strokeRect(ox - 6.5, oy - 0.5, W - 18, cardH - 12);
      rows.push({ t, parts: fit.parts.length, ok: a.ok });
    });
    return { cardH, h: 16 + list.length * cardH + 8, W: W, rows };
  }

  // ---------- 阶段五检查视图：四档新旧对照 + 事件组合墙 ----------
  // 同一节车、同一套构件，只换档位 / 只换事件，横向一比就知道「细节是不是真的成组在变」。
  function card(g, TG, o, i, ox, oy, wpx) {
    const sp = o.sp;
    const car = CarArt.demoCar(0, o.type || 'coach', sp, TG);
    if (typeof CarFit !== 'undefined') CarFit.demoProto(car);
    if (o.props) car.props = o.props(car, sp);
    applyWear(car);
    const sk = CarArt.skeleton(car, sp);
    const fit = CarFit.build(car, sk, car.furniture, o.variant === undefined ? -1 : o.variant);
    const M = { cars: [car], events: o.ev ? [{ kind: o.ev, x: car.x0 + car.len * 0.45 }] : [], opts: { ruin: o.ruin === undefined ? 0.6 : o.ruin } };
    const life = CarLife.build(car, sk, fit, M, o.cond);
    const z = o.z || 1;
    g.setTransform(z, 0, 0, z, ox - (sk.x0 - 12) * z, oy + 14 - (sp.crestY - 14) * z);
    const pen = TrainDraw.pen(g, TrainDraw.PAL[o.tod || 'dusk'], v => v, v => v, 0, z);
    CarArt.draw(pen, sk); CarFit.draw(pen, fit, { far: o.far || st.dFar }); CarLife.draw(pen, life, { far: o.far || st.dFar });
    g.setTransform(1, 0, 0, 1, 0, 0);
    const a = CarLife.audit(life, sk, car, M);
    if (o.labels !== false) {
      g.fillStyle = '#baff5c'; g.font = '13px monospace';
      g.fillText(o.title(i), ox + 2, oy + 10);
      g.fillStyle = a.ok ? '#7fd0ff' : '#ff8a7a';
      g.fillText('生活构件 ' + life.parts.length + ' · 自检 ' + (a.ok ? '0 违规' : flatBad(a.bad).length + ' 条'), ox + 2, oy + 24);
    }
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.strokeRect(ox - 6.5, oy - 0.5, wpx, (o.cardH || 300) - 12);
    return { parts: life.parts.length, ok: a.ok, cond: life.cond };
  }
  const flatBad = b => Object.keys(b).reduce((t, k) => t.concat(b[k].map(v => k + ':' + v)), []);

  // 四档新旧程度：同一节车连画四遍
  function ladder(g, TG, o) {
    o = o || {};
    const sp = buildSpec(TG); o = Object.assign({}, o, { sp });
    const z = o.z || 1, cardH = Math.round((sp.railsY - sp.crestY + 34) * z) + 30;
    const W = g.canvas.width, ox = 14;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, g.canvas.height);
    const rows = CarLife.COND.map((C, i) => card(g, TG, Object.assign({}, o, {
      cond: i, cardH, type: o.type || 'coach',
      title: k => '第 ' + (k + 1) + ' 档 · ' + C.name + '（' + C.id + '）· 小件保留 ' + Math.round(C.props * 100) + '%',
    }), i, ox, 16 + i * cardH, W - 28));
    return { cardH, h: 16 + CarLife.COND.length * cardH + 8, rows };
  }
  // 事件组合墙：同一节车，一次只开一种事件
  function eventWall(g, TG, o) {
    o = o || {};
    const sp = buildSpec(TG); o = Object.assign({}, o, { sp });
    const kinds = Object.keys(CarLife.COMBO);
    const z = o.z || 1, cardH = Math.round((sp.railsY - sp.crestY + 34) * z) + 30;
    const W = g.canvas.width, ox = 14;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, g.canvas.height);
    const rows = kinds.map((k, i) => card(g, TG, Object.assign({}, o, {
      ev: k, cond: 1, cardH, type: o.type || 'coach', ruin: 0.5,
      title: () => TrainGen.EVENTS[k].name + '（' + k + '）· 影响时长 ' + TrainGen.EVENTS[k].dur + 's',
    }), i, ox, 16 + i * cardH, W - 28));
    return { cardH, h: 16 + kinds.length * cardH + 8, rows };
  }

  // ---------- 分区新旧程度检查视图 ----------
  // 「整节一个档」是看不出新旧梯度的，这条规则本身又是隐形的（它只是让别处少画/多画几件）。
  // 所以这里从实编组里挑出「同车内确实出现了不止一个档」的车，把 CarLife 实测的
  // life.zones 按 60px 一段铺在地板下方，并把破损点、事件点标在同一根轴上 ——
  // 色带为什么在这里变深，一眼能对上因果。
  const ZCOL = ['#3fd07c', '#c9d34a', '#e8a03c', '#e35b4b'];
  function zones(g, TG, o) {
    o = o || {};
    const sp = TrainDraw.spec(), z = o.z || 1, max = o.max || 3;
    const W = g.canvas.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, g.canvas.height);
    const rows = [];
    if (!st.M) return { rows, h: 0 };
    const cardH = Math.round((sp.railsY - sp.crestY + 46) * z) + 30;
    for (const car of st.M.cars) {
      if (rows.length >= max) break;
      const sk = CarArt.skeleton(car, sp);
      applyWear(car);
      const fit = CarFit.build(car, sk, car.furniture, -1);
      const life = CarLife.build(car, sk, fit, st.M, -1);
      const lv = life.zones;
      if (new Set(lv).size < 2) continue;                          // 整节统一档的车不在这张图的话言范围
      const oy = 16 + rows.length * cardH, ox = 14;
      const K = i => ox + (i - (sk.x0 - 12)) * z, L = i => oy + 14 + (i - (sp.crestY - 14)) * z;
      g.setTransform(z, 0, 0, z, ox - (sk.x0 - 12) * z, oy + 14 - (sp.crestY - 14) * z);
      const pen = TrainDraw.pen(g, TrainDraw.PAL[o.tod || 'dusk'], v => v, v => v, 0, z);
      CarArt.draw(pen, sk); CarFit.draw(pen, fit, { far: o.far || st.dFar }); CarLife.draw(pen, life, { far: o.far || st.dFar });
      // 色带 + 因果标记：位置一律按每节车自己的 yFloor 走（阶段一那条教训：不许用常数冒充实测）
      const by = (car.yFloor === undefined ? sp.floorY : car.yFloor) + 4;
      for (let i = 0; i < lv.length; i++) {
        const x = sk.x0 + i * 60;
        g.fillStyle = ZCOL[lv[i]]; g.fillRect(x, by, 58, 9);
      }
      g.fillStyle = '#ffffff';
      for (const d of (car.damage || [])) g.fillRect(d.x - 1, by - 4, 2, 3);
      g.fillStyle = '#ff5ad0';
      for (const e of st.M.events) if (e.x >= car.x0 && e.x <= car.x1) g.fillRect(e.x - 1, by - 4, 2, 3);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = '9px monospace';
      for (let i = 0; i < lv.length; i++) {
        g.fillStyle = '#0b1017'; g.fillText(String(lv[i]), K(sk.x0 + i * 60 + 25), L(by + 8));
      }
      const a = CarLife.audit(life, sk, car, st.M);
      if (o.labels !== false) {
        g.fillStyle = '#baff5c'; g.font = '13px monospace';
        g.fillText((TG.CAR[car.type] ? TG.CAR[car.type].name : car.type) + ' 第 ' + (st.M.cars.indexOf(car) + 1) +
          ' 节 · 基准 ' + life.condName + ' · 分区 ' + lv.join('') + '（' + new Set(lv).size + ' 档）· 破损 ' +
          (car.damage || []).length + ' 处', ox + 2, oy + 10);
        g.fillStyle = a.ok ? '#7fd0ff' : '#ff8a7a';
        g.fillText('白点=破损处 粉点=事件点 · 生活构件 ' + life.parts.length + ' · 自检 ' +
          (a.ok ? '0 违规' : flatBad(a.bad).length + ' 条'), ox + 2, oy + 24);
      }
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.strokeRect(ox - 6.5, oy - 0.5, W - 18, cardH - 12);
      rows.push({ type: car.type, zones: lv.join(''), levels: new Set(lv).size, parts: life.parts.length, ok: a.ok });
    }
    return { rows, cardH, h: 16 + rows.length * cardH + 8 };
  }

  // ---------- 阶段八之三：三档导出 ----------
  // 一条铁律：绝不为了「一张图画完」去开一个几万像素宽的 canvas —— 浏览器要么给你一张空白图，
  // 要么直接拒绝分配（整列 51713px 宽就是这种情况）。所以：
  //   ① 单车厢高清：只装当前那一节，按 ZOOMS 里能装进 2048px 的最大整数倍放大；
  //   ② 分段长图：按 ≤2048px 的窗口逐段渲染（每段一张画布、一段一个文件），拼完即释放；
  //   ③ 整列缩略图：仍是一节一节按原始尺寸画进一张小画布，再等比缩着贴进总览格子里 —— 缩放交给
  //      drawImage（关掉平滑，保持像素网格），绘制路径还是主视图那一条 frame()，没有第二套。
  const EXP = { side: 2048, hd: 4096, per: 9, slotW: 152 };
  function boxOf(cars, sp, pad) {
    pad = pad === undefined ? 16 : pad;
    let x0 = Infinity, x1 = -Infinity;
    for (const c of cars) { if (c.x0 < x0) x0 = c.x0; if (c.x1 > x1) x1 = c.x1; }
    return { x0: x0 - pad, x1: x1 + pad, y0: sp.crestY - 40, y1: sp.railY + 24, h: (sp.railY + 24) - (sp.crestY - 40) };
  }
  const carNo = car => (st.M && st.M.cars.indexOf(car) >= 0 ? st.M.cars.indexOf(car) + 1 : (car.i || 0) + 1);
  function stamp(extra) {
    return extra + ' · seed ' + st.seed + ' · ' + st.tod + ' · 密度 ' + st.density.toFixed(2) +
      (st.dFar ? '（碎点已收）' : '') + ' · 新旧 ' + (st.cond < 0 ? '由关卡数据推' : st.cond + ' 档') + (st.paused ? ' · 已暂停' : '');
  }
  // 把 st 的相机与车组临时换成导出用的这一份，画完原样换回来 —— 主视图与导出共用同一条绘制路径
  function shot(cars, x0, y0, z, W, H, o) {
    o = o || {};
    const cv = o.cv || document.createElement('canvas');
    cv.width = Math.max(16, W | 0); cv.height = Math.max(16, H | 0);
    const keep = { W: st.W, H: st.H, view: st.view, cars: st.cars, sk: st.sk, fit: st.fit, life: st.life,
      exp: st.exp, hover: st.hover, showSolids: st.showSolids, showHuman: st.showHuman,
      showGrid: st.showGrid, showParts: st.showParts, showSwatch: st.showSwatch, lightOn: st.lightOn };
    st.W = cv.width; st.H = cv.height; st.view = { x: x0, y: y0, z: z };
    st.cars = cars; st.sk = cars.map(c => rigOf(c).sk); st.fit = cars.map(c => rigOf(c).fit);
    st.life = cars.map(c => rigLife(rigOf(c), c).life);
    st.exp = true; st.hover = null; st.showGrid = false; st.showParts = false; st.showSwatch = false;
    st.showSolids = !!o.solids; st.showHuman = !!o.human;
    if (o.light === false) st.lightOn = false;
    let g;
    try { g = cv.getContext('2d'); g.imageSmoothingEnabled = false; frame(g, null, { far: o.far, tag: o.tag }); }
    finally { Object.assign(st, keep); }
    return cv;
  }
  // ① 单车厢高清：只装当前这一节，按 ZOOMS 里能装进 hd 边的最大整数倍放大（面积同时封顶 8M px）
  function exportCar(TG, i) {
    const car = st.cars[Math.max(0, Math.min(st.cars.length - 1, i === undefined ? 0 : i))];
    const b = boxOf([car], st.sp);
    let z = ZOOMS[0];
    for (const c of ZOOMS)
      if (Math.round((b.x1 - b.x0) * c) <= EXP.hd && Math.round(b.h * c) <= EXP.hd &&
        Math.round((b.x1 - b.x0) * c) * Math.round(b.h * c) <= 8e6) z = c;
    const W = Math.round((b.x1 - b.x0) * z), H = Math.round(b.h * z);
    const tag = stamp('单车厢 第' + carNo(car) + '节 ' + (car.uid || car.type) + ' ×' + z);
    return [{ name: 'car-' + st.seed + '-第' + carNo(car) + '节-' + car.type + '-高清-Z' + z + '.png',
      canvas: shot([car], b.x0, b.y0, z, W, H, { tag: tag }), w: W, h: H, z: z }];
  }
  // ② 分段长图：单张不超过 2048px；总宽超出就自动切成 _p1 / _p2 / …
  //    分法是按段数均分（不是「先塞满 2048 再剩下一条尾巴」）：三节车 2184px 会切成两张 1092，
  //    而不是一张 2048 + 一张 136 —— 尾巴那张几乎没法看。
  function exportSegments(TG, o) {
    o = o || {};
    const cars = o.cars || st.cars, z = o.z || 1;
    const b = boxOf(cars, st.sp);
    const total = Math.ceil((b.x1 - b.x0) * z);
    const n = Math.max(1, Math.ceil(total / EXP.side)), segPx = Math.ceil(total / n);
    const H = Math.round(b.h * z), out = [];
    for (let k = 0; k < n; k++) {
      const x0 = b.x0 + k * segPx / z, wpx = Math.min(segPx, total - k * segPx);
      const set = cars.filter(c => c.x1 > x0 - 8 && c.x0 < x0 + wpx / z + 8);
      if (!set.length) continue;
      out.push({ name: 'car-' + st.seed + '-' + cars.length + '节-长图_p' + (k + 1) + '.png',
        canvas: shot(set, x0, b.y0, z, wpx, H, { tag: stamp('长图 段 ' + (k + 1) + '/' + n) }), w: wpx, h: H, part: k + 1, of: n });
    }
    return out;
  }
  // ③ 整列缩略图：全部车厢等比缩进一张小图（每行 9 节），一次只开一节车宽的画布
  function exportOverview(TG, o) {
    o = o || {};
    const cars = o.cars || (st.M ? st.M.cars : st.cars), sp = st.sp;
    let maxLen = 0; for (const c of cars) if (c.len > maxLen) maxLen = c.len;
    const s = Math.min(1, EXP.slotW / (maxLen + 32));            // 全列共用一个缩放系数：长短车的比例关系要诚实
    const b = boxOf([cars[0]], sp), Hh = Math.round(b.h * s), hh = Math.round((maxLen + 32) * s);
    const per = o.per || EXP.per, slotW = hh + 6, rowH = Hh + 20, pad = 12;
    const rowsN = Math.ceil(cars.length / per);
    const W = pad * 2 + per * slotW, H = pad * 2 + rowsN * rowH;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, H);
    const scratch = document.createElement('canvas');
    cars.forEach((c, i) => {
      const r = rigOf(c), sk = r.sk;
      const cw = Math.round((c.len + 32) * 1), chh = Math.round(b.h * 1);
      shot([c], sk.x0 - 16, b.y0, 1, cw, chh, { cv: scratch, far: true, light: o.light });
      const col = i % per, row = (i / per) | 0;
      const dx = pad + col * slotW, dy = pad + row * rowH;
      g.drawImage(scratch, 0, 0, cw, chh, dx, dy, Math.max(8, Math.round(cw * s)), Hh);
      g.fillStyle = '#7fd0ff'; g.font = '10px monospace';
      g.fillText(i + 1 + ' ' + (c.uid || c.type) + ' ' + r.life.condName, dx + 1, dy + Hh + 11);
    });
    g.fillStyle = '#baff5c'; g.font = '11px monospace';
    g.fillText(stamp('整列缩略 ' + cars.length + ' 节 ×' + s.toFixed(3)), pad, H - 4);
    return [{ name: 'car-' + st.seed + '-整列' + cars.length + '节-缩略.png', canvas: cv, w: W, h: H, scale: +s.toFixed(4) }];
  }
  // 下载：大图走 Blob（dataURL 几 MB 的字符串会把标签页拖死），拿不到 toBlob 时退回 dataURL
  function save(item) {
    const a = document.createElement('a'); a.download = item.name;
    const go = url => { a.href = url; a.click(); };
    if (item.canvas.toBlob) item.canvas.toBlob(b => { const u = URL.createObjectURL(b); go(u); setTimeout(() => URL.revokeObjectURL(u), 8000); }, 'image/png');
    else go(item.canvas.toDataURL('image/png'));
    return item;
  }

  // ---------- 交互 ----------
  function hitTest(mx, my) {
    const z = st.view.z, wx = mx / z + st.view.x, wy = my / z + st.view.y;
    let best = null;
    // 家具画在骨架之上，所以命中测试也先问家具
    if (st.fitOn) for (const f of st.fit) for (const p of f.parts)
      if (wx >= p.x && wx < p.x + p.w && wy >= p.y && wy < p.y + p.h)
        if (!best || p.y >= best.y) best = { id: '家具 ' + (p.kind || '?'), kind: p.mat + '·' + p.face + (p.zone ? '·' + p.zone : ''), w: p.w, h: p.h, x: p.x, y: p.y, layer: 99, _hit: [] };
    if (best) return best;
    for (const sk of st.sk) for (const p of sk.parts) {
      if (p.noDraw) continue;
      if (wx >= p.x && wx < p.x + p.w && wy >= p.y && wy < p.y + p.h)
        if (!best || p.layer >= best.layer) best = p;
    }
    return best;
  }
  function wire(canvas, TG, onCfg) {
    st.cv = canvas;
    let drag = null;
    canvas.addEventListener('mousedown', e => { drag = { x: e.offsetX, y: e.offsetY, vx: st.view.x, vy: st.view.y }; });
    window.addEventListener('mouseup', () => { drag = null; });
    canvas.addEventListener('mousemove', e => {
      if (drag) {
        st.view.x = st.view.vx - (e.offsetX - drag.x) / st.view.z;
        st.view.y = st.view.vy - (e.offsetY - drag.y) / st.view.z;
      } else st.hover = hitTest(e.offsetX, e.offsetY);
      onCfg();
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const i = ZOOMS.indexOf(st.view.z), k = Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)));
      if (k === i) return;
      const wx = e.offsetX / st.view.z + st.view.x, wy = e.offsetY / st.view.z + st.view.y;
      st.view.z = ZOOMS[k];
      st.view.x = wx - e.offsetX / st.view.z; st.view.y = wy - e.offsetY / st.view.z;
      onCfg();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      const s = 40 / st.view.z;
      if (e.key === 'ArrowLeft') st.view.x -= s; else if (e.key === 'ArrowRight') st.view.x += s;
      else if (e.key === 'ArrowUp') st.view.y -= s; else if (e.key === 'ArrowDown') st.view.y += s;
      else if (e.key === '+' || e.key === '=') st.view.z = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(st.view.z) + 1)];
      else if (e.key === '-') st.view.z = ZOOMS[Math.max(0, ZOOMS.indexOf(st.view.z) - 1)];
      else if (e.key === 'f' || e.key === 'F') fit();
      else if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        // 空格 = 暂停/恢复动态效果。焦点在控件上时不抢（否则会把按钮的「空格按下=点击」抢掉）
        const tg = e.target;
        if (tg && /INPUT|SELECT|TEXTAREA|BUTTON/.test(tg.tagName)) return;
        e.preventDefault(); setPaused();
      }
      else return;
      onCfg();
    });
    // 车速演示：轮对按「距离/周长」转，不是随便一个系数。暂停 = 时间轴与轮对同时冻住
    const tick = t => {
      if (!st.paused) {
        const dt = st.lastT ? Math.min(0.1, (t - st.lastT) / 1000) : 0;
        st.time += dt; st.roll = (st.roll || 0) + 210 / 60;
      }
      st.lastT = t;
      frame(canvas.getContext('2d'), TG); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return { st, CTRL, WIN, DOOR, LIVERY, ART: ['wear', 'chip', 'soot'], buildSpec, rebuild, measure, fit, frame, wire, ZOOMS,
    hitTest, montage, ladder, eventWall, zones, MTYPES, rigOf, rigLife, EXP, applyDensity, effArt, wearM, applyWear,
    setPaused, togglePause, lightState, boxOf, stamp, shot, exportCar, exportSegments, exportOverview, save };
})();
