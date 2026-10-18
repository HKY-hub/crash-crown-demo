// ============ 疾驰列车 · 车厢骨架（程序化美术 阶段一） ============
// 这一层只做一件事：把「一节车厢在侧视剖面上有哪些构件、它们怎么连、谁撑着谁」变成数据，
// 再由 check() 用几何证明它成立。尺寸全部从玩法常量反推（TrainGen 的 FLOOR/CEIL/ROOF/UNDER），
// 所以美术不可能和碰撞打架 —— 本模块不写模型任何字段，纯几何 + 纯渲染。
//
// 剖面读法（后续阶段都按这套约定，不再重复解释）：
//   1) 沿列车纵向切掉近侧半边：看到的「墙面」是远侧墙，窗是墙上的洞（洞后面就是世界）；
//   2) 角色走在切面上：车顶 202 / 地板 348 / 车底走道 408 都是被剖到的构件，角色盖在其前面；
//   3) 所以「部件挡不挡路」只对三个「看得进去的空腔」判定 —— 车底维修道、通过台、门口净空。
//      遮挡率由「录制下来的绘制指令」做格点实测（rasterize/coverage），不用常数冒充；
//      它们一旦被糊住，玩家就看不出落脚面（本项目已因「看不见落脚面」吃过即死教训）。
//
// 尺度基准：一切以角色身高 H = 36px 为参照；20px = 1m 只用于沿途远景，两种换算都在 scale() 里给。
const CarArt = (() => {

  // ---------- 可调结构参数（预览页 car.html 的滑杆就是这几项） ----------
  const BASE = {
    unit: 20,               // 世界像素 / 米
    bodyH: 36,              // 角色身高 H
    carLen: 680,            // 样板车车长（实编组用 car.len）
    floorY: 348,            // 地板面（= TrainGen.FLOOR，动它必须同步动碰撞）
    interiorH: 132,         // 内部净高（= FLOOR - CEIL）
    roofSkin: 14,           // 车顶拱起（外皮）厚度
    deckThk: 10,            // 车顶甲板剖面厚（可行走面是它的顶线，即 ROOF 层）
    ceilThk: 4,             // 顶棚衬板厚
    floorThk: 12,           // 地板剖面厚（= 碰撞地板实体厚）
    sillThk: 10,            // 侧梁（边梁）厚
    underY: 408,            // 车底维修道面（= TrainGen.UNDER）
    walkThk: 10,            // 车底走道格栅厚
    railY: 450,             // 钢轨顶面（= UNDER + 42；只改底盘位置时它会跟着走）
    wheelR: 16,             // 轮半径。原来 11 ⇒ 轮径 22px，只有车厢内高的 17%，看着像玩具脚轮。
                            // 上限由既有几何卡死：车底走道板面在 408、厚 10 ⇒ 板底 418；
                            // 轨面 450 ⇒ 轮顶 = 450 − 2R 必须 ≥ 418，即 R ≤ 16。
                            // 再要大轮（真实比例 φ840 ≈ 49px）必须抬车体或把走道板在轮位开缺，
                            // 那会动落脚面与碰撞 —— 留作下一步，不在本轮偷做。
                            // 自适应那行 walkway 厚度公式保留：它保证以后改轮径不会再撞进轮子里。
    wheelBase: [150, 360],  // 轮基（同一转向架两轮中心距），按车长 0.22 取值并夹在这里
    wheelBaseMax: 0.45,       // 轮基不超过车长的这个比例，否则两轮会首尾相接
    bogieAt: [0.25, 0.75],    // 转向架中心位置（车长比例）
    wallThk: 12,            // 端墙剖面带厚（= TrainGen.WALL）
    gap: 26,                // 车厢间隙（连接处总宽）
    trussPitch: 40,         // 底架桁架间距（越密越堵车底维修道，实测见闸门）
    art: { wear: 0.5, chip: 0.5, soot: 0.35, hue: null, hue2: null },
    win: { w0: 52, w1: 78, h: 46, sill: 70, jamb: 3 },
    door: { jamb: 3, lintel: 10, fromEnd: 6, w: 14 },
  };
  // 每项都有明确区间：滑杆拖出界外时 check 直接判「配置非法」，而不是画出穿模的车
  const INVALID = {
    interiorH: ['内部净高', v => v >= 80 && v <= 180],
    roofSkin: ['车顶拱厚', v => v >= 6 && v <= 28],
    deckThk: ['车顶甲板厚', v => v >= 4 && v <= 24],
    ceilThk: ['顶棚厚', v => v >= 2 && v <= 12],
    floorThk: ['地板厚', v => v >= 6 && v <= 24],
    sillThk: ['侧梁厚', v => v >= 6 && v <= 24],
    walkThk: ['走道格栅厚', v => v >= 4 && v <= 24],
    underY: ['底盘位置', v => v >= 380 && v <= 440],
    railY: ['轨面标高', v => v >= 420 && v <= 520],
    wheelR: ['轮半径', v => v >= 6 && v <= 30],
    carLen: ['车体长度', v => v >= 360 && v <= 1000],
    gap: ['车间隙', v => v >= 16 && v <= 80],
    wallThk: ['端墙厚', v => v >= 4 && v <= 28],
    trussPitch: ['桁架间距', v => v >= 30 && v <= 60],   // 下限是实测出来的：再密就看不清车底落脚面
    'win.sill': ['窗台距地板', v => v >= 30 && v <= 130],
    'win.h': ['窗洞高', v => v >= 14 && v <= 80],
    'win.jamb': ['窗框边宽', v => v >= 1 && v <= 8],
    'wheelBase.max': ['轮基上限', v => v >= 60 && v <= 520],
    'door.lintel': ['门楣高', v => v >= 4 && v <= 24],
    'door.jamb': ['门立边宽', v => v >= 1 && v <= 8],
    'door.w': ['门宽', v => v >= 6 && v <= 40],
  };
  function badCfg(sp) {
    const bad = [];
    for (const k in INVALID) {
      const nm = INVALID[k][0], f = INVALID[k][1];
      const v = k.indexOf('.') > 0 ? sp[k.split('.')[0]][k.split('.')[1]] : sp[k];
      if (v !== undefined && !f(v)) bad.push(nm + '=' + v);
    }
    if (sp.railY < sp.sillBot + 18) bad.push('轨面 ' + sp.railY + ' 高出底架 ' + sp.sillBot + '（车体埋进道床）');
    if (sp.wheelBase < sp.wheelR * 2 + 12) bad.push('轮基 ' + sp.wheelBase + ' 小于两轮直径加余量（轮对会相互穿插）');
    if (sp.winHead <= sp.ceilY) bad.push('净高放不下窗模数：窗顶 ' + sp.winHead + ' 已经在顶棚 ' + sp.ceilY + ' 之上');
    if (sp.win.sill > sp.bodyH * 2.2) bad.push('窗台 ' + sp.win.sill + 'px = ' + (sp.win.sill / sp.bodyH).toFixed(2) + 'H，超出角色尺度上限 2.2H');
    if (sp.win.jamb * 2 + 6 > sp.win.w0) bad.push('窗框边宽吃掉窗洞');
    return bad;
  }

  // 把 BASE 展开成一套派生标高：改任何一项都在这里重算，杜绝「两处硬编码不一致」。
  function spec(o) {
    o = o || {};
    const sp = Object.assign({}, BASE, o);
    sp.win = Object.assign({}, BASE.win, o.win || {});
    sp.door = Object.assign({}, BASE.door, o.door || {});
    sp.ceilY = sp.floorY - sp.interiorH;
    sp.roofY = sp.ceilY - sp.deckThk - sp.ceilThk;
    sp.crestY = sp.roofY - sp.roofSkin;
    sp.ceilBandY = sp.roofY + sp.deckThk;              // 甲板带下沿（顶棚上沿）
    sp.floorBot = sp.floorY + sp.floorThk;
    sp.sillBot = sp.floorBot + sp.sillThk;
    sp.walkBot = sp.underY + sp.walkThk;
    sp.railY = o.railY === undefined ? sp.underY + 42 : o.railY;
    sp.winSill = sp.floorY - sp.win.sill;              // 窗台：距地板固定，不随净高漂移
    sp.winHead = sp.winSill - sp.win.h;
    sp.cavityUnder = sp.underY - sp.bodyH;             // 车底维修道的头顶（默认 372）
    sp.cavityGang = sp.floorY - sp.bodyH - 6;          // 通过台的头顶（默认 306）
    sp.railsY = Math.max(sp.railY, sp.sillBot + 18);   // 真实落轨标高：轨面高过底架就往下顶
    sp.art = Object.assign({}, BASE.art, o.art || {});
    sp.wheelBaseRange = (o.wheelBase && o.wheelBase.length) ? o.wheelBase : BASE.wheelBase;
    sp.wheelBase = Math.max(sp.wheelBaseRange[0], Math.min(sp.wheelBaseRange[1], Math.round(sp.carLen * 0.22)));
    sp.bogieAt = o.bogieAt || BASE.bogieAt;
    sp.bad = badCfg(sp);
    return sp;
  }

  // ---------- 构件登记表：层序 / 材质 / 分组 / 允许挂靠的邻件前缀 ----------
  // g=分组（同组允许重叠，如框套洞、带内管线）；on=允许挂靠的邻件（kind 名或 id 前缀）；
  // see=半透（允许出现在窗净空里）；noDraw=由碰撞层绘制，骨架只作锚点；thin=细杆（允许穿过空腔）。
  // 九类车厢的出厂配色（上带色 / 下带色）。手动涂装（sp.art.hue）优先级更高，
  // 所以预览台的涂装下拉仍然能把这套默认值整套覆盖掉。
  const TYPEHUE = {
    coach: ['#2f6f4f', '#d8d2c4'], luggage: ['#7a6236', '#c9bda2'], sleeper: ['#2b4f7a', '#d5dbe2'],
    diner: ['#7a2f3a', '#e0d3bd'], medical: ['#b9c2c6', '#2f8f8a'], freight: ['#5d5a52', '#b4661f'],
    maintenance: ['#b08a2a', '#4a4a4a'], security: ['#23406e', '#c8ccd2'], locomotive: ['#24506e', '#cfd6dd'],
  };
  // 阶段七：运营涂装族。一列车里相邻几节属于同一个运营单元，外壳应当共享涂装；
  // 章节再在自己的区段里插一个色彩重点（accent 由编组层按 chapter 指定族号）。
  // 这是「外观」分层，不改任何几何 —— 阶段四那套「关掉标签认车型」的判据不看颜色，照旧成立。
  const LIVERY_FAM = [
    null,                       // 0 = 不覆盖，用各型出厂色
    ['#2c5a44', '#cfc8b4'],     // 1 国铁绿皮
    ['#2f4f74', '#dfe4ea'],     // 2 蓝白快车
    ['#5a4a2e', '#b8a887'],     // 3 军列橄榄
    ['#6a3030', '#c9bda2'],     // 4 事故回厂锈红
    ['#3b4a52', '#9fb2ad'],     // 5 工程灰绿
  ];

  const KINDS = {
    'rail':         { layer: 0, g: 'rail', noDraw: true },
    'wheel':        { layer: 0, g: 'bogie', on: ['rail', 'bogie-side', 'axle', 'axle-box'] },
    'axle':         { layer: 1, g: 'bogie', on: ['wheel'], mat: 'metal' },
    'bogie-side':   { layer: 2, g: 'bogie', on: ['wheel', 'axle', 'axle-box', 'journal', 'spring', 'walkway'], mat: 'metal' },
    'axle-box':     { layer: 2, g: 'bogie', on: ['bogie-side', 'wheel', 'journal', 'spring', 'axle'], mat: 'metal' },
    'journal':      { layer: 2, g: 'bogie', on: ['axle-box', 'spring', 'bogie-side', 'wheel', 'walkway', 'skirt-edge'], mat: 'metal' },
    'spring':       { layer: 3, g: 'bogie', on: ['journal', 'bolster', 'walkway', 'bogie-side', 'axle-box', 'skirt-edge'], mat: 'metal' },
    'bolster':      { layer: 3, g: 'bogie', on: ['spring', 'walkway', 'hanger', 'bogie-side', 'journal', 'skirt-edge'], mat: 'metal' },
    'hanger':       { layer: 4, g: 'bogie', on: ['sill', 'bolster', 'walkway', 'truss', 'buffer-beam', 'skirt-edge'], mat: 'metal', thin: true },
    'buffer-beam':  { layer: 4, g: 'under', on: ['sill', 'walkway', 'coupler', 'draft-gear', 'truss', 'skirt-edge', 'hanger'], mat: 'metal', thin: true },
    'coupler':      { layer: 4, g: 'under', on: ['buffer-beam', 'draft-gear'], mat: 'metal' },
    'draft-gear':   { layer: 4, g: 'under', on: ['sill', 'buffer-beam', 'truss', 'coupler'], mat: 'metal' },
    'brake-pipe':   { layer: 5, g: 'under', on: ['sill', 'pipe-valve', 'truss', 'walkway'], mat: 'pipe' },
    'pipe-valve':   { layer: 5, g: 'under', on: ['brake-pipe', 'sill'], mat: 'metal' },
    'truss':        { layer: 5, g: 'under', on: ['sill', 'walkway', 'skirt-edge', 'hanger', 'brake-pipe'], mat: 'metal' },
    'skirt-edge':   { layer: 6, g: 'under', on: ['truss', 'walkway', 'sill', 'hanger', 'journal', 'spring', 'bolster'], mat: 'metal' },
    'walkway':      { layer: 6, g: 'under', on: ['truss', 'skirt-edge', 'spring', 'bolster', 'buffer-beam', 'hanger', 'journal', 'brake-pipe'], mat: 'grate' },
    'sill':         { layer: 7, g: 'under', on: ['floor', 'brake-pipe', 'truss', 'draft-gear', 'pipe-valve', 'hanger', 'buffer-beam', 'end-sill', 'skirt-edge', 'wall-base', 'walk', 'side', 'coupler'], mat: 'metal' },
    'floor':        { layer: 8, g: 'deck', on: ['wall-base', 'wall-knee', 'walk', 'sill', 'door-sill', 'gang-floor', 'end-sill', 'side', 'door-jamb', 'radiator', 'hazard', 'door-head', 'pipe-valve'], mat: 'wood' },
    'walk':         { layer: 8, g: 'deck', on: ['floor', 'wall-base', 'sill', 'hazard'], mat: 'metal' },
    'wall-base':    { layer: 9, g: 'wall', on: ['wall-knee', 'floor', 'radiator', 'end-sill', 'hazard', 'sill', 'side', 'door-frame', 'walk', 'truss'], mat: 'plastic' },
    'radiator':     { layer: 9, g: 'wall', on: ['wall-knee', 'wall-base', 'floor', 'mold', 'side', 'door-frame'], mat: 'metal' },
    'wall-pier':    { layer: 9, g: 'wall', on: ['wall-upper', 'wall-knee', 'win-head', 'win-sill', 'side', 'door-frame', 'mold', 'glazing'], mat: 'panel' },
    'wall-knee':    { layer: 9, g: 'wall', on: ['wall-base', 'wall-pier', 'wall-upper', 'radiator', 'floor', 'mold', 'number-board', 'side', 'door-frame', 'hazard'], mat: 'panel' },
    'wall-upper':   { layer: 9, g: 'wall', on: ['ceiling', 'wall-pier', 'mold', 'side', 'sill', 'door-frame', 'skin', 'glazing'], mat: 'panel' },
    'cove':         { layer: 10, g: 'deck', on: ['ceiling', 'side', 'wall-upper', 'deck', 'door-frame'], mat: 'metal' },
    'ceiling':      { layer: 10, g: 'deck', on: ['deck', 'wall-upper', 'cove', 'roof-rib', 'side', 'door-frame', 'skin'], mat: 'paint' },
    'roof-rib':     { layer: 11, g: 'deck', on: ['deck', 'skin', 'ceiling', 'door-frame', 'end-lintel'], mat: 'metal' },
    'deck':         { layer: 11, g: 'deck', on: ['skin', 'ceiling', 'roof-rib', 'walk', 'end-lintel', 'door-frame', 'gang-canopy', 'side', 'gang-floor', 'door-sill'], mat: 'wood' },
    'skin':         { layer: 12, g: 'roof', on: ['deck', 'eave', 'side', 'gutter', 'livery', 'end-roof', 'gang-roof', 'wall-upper', 'sill', 'ceiling', 'crest', 'shoulder', 'roof-rib', 'door-frame'], mat: 'panel' },
    'side':         { layer: 12, g: 'end', on: ['wall-upper', 'wall-pier', 'wall-knee', 'wall-base', 'end-lintel', 'door-frame', 'gang-canopy', 'deck', 'ceiling', 'cove', 'floor', 'sill', 'end-roof', 'end-sill', 'skin', 'walk', 'hazard', 'radiator', 'gang-post', 'handrail', 'mold', 'number-board', 'glazing', 'livery', 'gutter', 'gang-roof'], mat: 'panel' },
    'eave':         { layer: 13, g: 'roof', on: ['skin', 'shoulder', 'gutter', 'gang-roof', 'livery', 'end-roof', 'door-frame'], mat: 'panel' },
    'shoulder':     { layer: 14, g: 'roof', on: ['eave', 'crest', 'end-roof', 'livery', 'gutter', 'skin', 'door-frame'], mat: 'panel' },
    'crest':        { layer: 15, g: 'roof', on: ['shoulder', 'end-roof', 'skin'] },
    'gutter':       { layer: 15, g: 'roof', on: ['eave', 'skin', 'side', 'shoulder', 'end-roof', 'livery', 'door-frame'], mat: 'metal' },
    'end-roof':     { layer: 16, g: 'end', on: ['skin', 'side', 'end-lintel', 'deck', 'shoulder', 'crest', 'eave', 'gutter', 'livery', 'mold', 'door-frame', 'gang-roof'], mat: 'metal' },
    'end-lintel':   { layer: 16, g: 'end', on: ['side', 'end-roof', 'door-frame', 'deck', 'skin', 'gang-canopy', 'cove', 'roof-rib', 'ceiling', 'gang-roof', 'wall-upper', 'mold'], mat: 'metal' },
    'end-sill':     { layer: 16, g: 'end', on: ['floor', 'sill', 'side', 'door-sill', 'hazard', 'wall-base', 'wall-knee', 'wall-upper', 'door-frame', 'radiator', 'mold', 'brake-pipe', 'walk', 'buffer-beam', 'coupler', 'draft-gear', 'pipe-valve', 'truss', 'gang-floor', 'deck'], mat: 'metal' },
    'door-frame':   { layer: 17, g: 'gang', on: ['gang-canopy', 'deck', 'side', 'gang-roof', 'floor', 'end-sill', 'handrail', 'gang-floor', 'hazard', 'wall-base', 'wall-knee', 'wall-upper', 'wall-pier', 'roof-rib', 'ceiling', 'end-lintel', 'cove', 'mold', 'radiator', 'end-roof', 'skin', 'sill', 'door-head', 'door-jamb', 'door-sill', 'gang-post', 'glazing', 'win-head'], mat: 'metal' },
    'gang-canopy':  { layer: 18, g: 'gang', on: ['end-lintel', 'door-frame', 'handrail', 'skin', 'side', 'deck', 'gang-post', 'gang-roof', 'gang-floor', 'end-roof'], mat: 'rubber' },
    'gang-roof':    { layer: 19, g: 'gang', on: ['eave', 'skin', 'gang-canopy', 'shoulder', 'door-frame', 'end-roof', 'crest', 'gutter', 'livery', 'side'], mat: 'metal' },
    'gang-post':    { layer: 19, g: 'gang', on: ['gang-canopy', 'side', 'handrail', 'door-frame', 'wall-upper', 'wall-knee', 'wall-base', 'radiator', 'mold'], mat: 'metal', thin: true },
    'handrail':     { layer: 20, g: 'gang', on: ['door-frame', 'gang-canopy', 'gang-post', 'side', 'wall-upper'], mat: 'metal', thin: true },
    'gang-floor':   { layer: 20, g: 'gang', on: ['floor', 'walk', 'door-sill', 'side', 'end-sill', 'door-frame', 'wall-base', 'radiator', 'sill'], noDraw: true },
    'glazing':      { layer: 21, g: 'glazing', on: ['win-head', 'win-sill', 'win-jamb', 'win-mullion', 'wall-pier', 'side', 'wall-upper', 'door-frame', 'mold'], see: true },
    'win-head':     { layer: 22, g: 'win', on: ['wall-upper', 'wall-pier', 'glazing', 'win-jamb', 'win-sill', 'mold', 'door-frame', 'side', 'radiator'], mat: 'metal' },
    'win-sill':     { layer: 22, g: 'win', on: ['wall-knee', 'wall-pier', 'glazing', 'win-jamb', 'radiator', 'mold', 'door-frame', 'side'], mat: 'metal' },
    'win-jamb':     { layer: 22, g: 'win', on: ['win-head', 'win-sill', 'wall-pier', 'glazing', 'door-frame', 'side'], mat: 'metal' },
    'win-mullion':  { layer: 22, g: 'win', on: ['win-head', 'win-sill', 'glazing'], mat: 'metal' },
    'mold':         { layer: 23, g: 'mark', on: ['wall-knee', 'wall-upper', 'radiator', 'number-board', 'win-head', 'win-sill', 'end-roof', 'door-frame', 'side', 'floor', 'end-sill', 'glazing', 'wall-pier'], mat: 'paint' },
    'hazard':       { layer: 23, g: 'mark', on: ['door-sill', 'end-sill', 'floor', 'gang-floor', 'wall-base', 'walk', 'sill', 'side', 'wall-knee', 'door-frame', 'deck', 'skin', 'roof-rib', 'ceiling', 'gutter', 'crest', 'shoulder', 'eave', 'brake-pipe', 'radiator', 'truss', 'number-board', 'end-roof'], mat: 'metal' },
    'number-board': { layer: 23, g: 'mark', on: ['wall-knee', 'wall-upper', 'side', 'mold', 'glazing', 'win-sill'], mat: 'metal' },
    'livery':       { layer: 23, g: 'mark', on: ['skin', 'wall-knee', 'side', 'eave', 'shoulder', 'wall-upper', 'gutter', 'end-roof', 'mold', 'crest', 'door-frame'], mat: 'paint' },
  };
  const LAYER = k => (KINDS[k] ? KINDS[k].layer : 30);
  // 外皮：吃「涂装 + 边角掉漆 + 雨痕」；其中 LOWER 是腰带以下，配色要压暗一档
  const EXT = { crest: 1, shoulder: 1, eave: 1, skin: 1, gutter: 1, livery: 1, side: 1, 'end-roof': 1, 'end-lintel': 1, 'end-sill': 1, sill: 1, 'skirt-edge': 1, 'buffer-beam': 1, 'bogie-side': 1, bolster: 1, 'gang-roof': 1, 'door-frame': 1, 'win-head': 1, 'win-sill': 1, 'win-jamb': 1, 'win-mullion': 1, 'number-board': 1 };
  const LOWER = { sill: 1, 'skirt-edge': 1, 'end-sill': 1, 'buffer-beam': 1, 'bogie-side': 1, bolster: 1, 'gang-post': 1 };
  // 任何车型都必须具备的构件（阶段四扩车型时，缺一项就是骨架没画全）
  const MANDATORY_ID = ['door-head', 'door-apron', 'door-jambL', 'door-jambR', 'door-sill', 'hazard-d'];
  const MANDATORY = ['crest', 'shoulder', 'eave', 'skin', 'gutter', 'livery', 'deck', 'roof-rib', 'ceiling', 'cove',
    'wall-upper', 'wall-pier', 'wall-knee', 'wall-base', 'mold', 'radiator', 'floor', 'sill', 'brake-pipe',
    'pipe-valve', 'truss', 'skirt-edge', 'walkway', 'wheel', 'axle', 'axle-box', 'journal', 'bogie-side',
    'spring', 'bolster', 'hanger', 'side', 'end-roof', 'end-lintel', 'end-sill', 'hazard', 'door-frame',
    'win-head', 'win-sill', 'win-jamb', 'glazing', 'number-board', 'rail'];

  const A = (P, id, kind, x, y, w, h, o) => {
    const K = KINDS[kind] || {};
    P.push(Object.assign({
      id, kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
      on: [], layer: K.layer === undefined ? 30 : K.layer, g: K.g || kind, mat: K.mat || 'metal',
      see: !!K.see, noDraw: !!K.noDraw, thin: !!K.thin,
    }, o || {}));
    return P[P.length - 1];
  };

  // 区间运算：covered 合并 → [x0,x1] 减去 covered → 再减去授权洞口
  const merge = iv => {
    const s = iv.slice().sort((a, b) => a[0] - b[0]), o = [];
    for (const n of s) { const l = o[o.length - 1]; if (l && n[0] <= l[1] + 1) l[1] = Math.max(l[1], n[1]); else o.push([n[0], n[1]]); }
    return o;
  };
  const minus = (a, b) => {
    const B = merge(b), out = [];
    for (const [s, e] of a) {
      let cur = s;
      for (const [c, d] of B) { if (d <= cur || c >= e) continue; if (c > cur) out.push([cur, Math.min(c, e)]); cur = Math.max(cur, Math.min(d, e)); }
      if (cur < e) out.push([cur, e]);
    }
    return out;
  };
  const gapsIn = (covered, x0, x1, holes) =>
    minus(minus([[x0, x1]], merge(covered)), (holes || []).map(h => [h[0] - 0.5, h[1] + 0.5]))
      .map(v => [Math.round(v[0]), Math.round(v[1])]).filter(v => v[1] - v[0] > 0);

  // ---------- 骨架：一节车 → 构件清单 + 洞口清单（只读 car，一个字段都不写） ----------
  function skeleton(car, sp) {
    sp = sp || spec();
    const P = [], OP = [];
    const x0 = Math.round(car.x0), x1 = Math.round(car.x1), len = Math.round(car.x1 - car.x0);
    const floorY = car.yFloor === undefined ? sp.floorY : car.yFloor;
    const ceilY = car.yCeil === undefined ? sp.ceilY : car.yCeil;
    const roofY = car.yRoof === undefined ? sp.roofY : car.yRoof;
    // 转向架按「中心跨度」落在车体内部（车长的 0.22，夹在 bogieSpan 区间里）：
    // 车再短也不会出现同一转向架两轮相互穿插，车再长也不会两头悬空。
    const rg = sp.wheelBaseRange || BASE.wheelBase;
    const span = Math.min(len * sp.wheelBaseMax, Math.max(rg[0], Math.min(rg[1], Math.round(len * 0.22))));
    const at = sp.bogieAt || BASE.bogieAt;
    const g = {
      floorY, ceilY, roofY, crestY: roofY - sp.roofSkin, ceilBandY: roofY + sp.deckThk,
      winSill: floorY - sp.win.sill, winHead: floorY - sp.win.sill - sp.win.h,
      floorBot: floorY + sp.floorThk, sillBot: floorY + sp.floorThk + sp.sillThk,
      underY: sp.underY, walkBot: sp.underY + sp.walkThk, railY: sp.railY, railsY: sp.railsY,
    };
    if (!car.windows && typeof TrainGen !== 'undefined' && TrainGen.carWindows) TrainGen.carWindows(car);
    const win = (car.windows || []).slice().sort((a, b) => a.x - b.x);
    const jt = sp.win.jamb, dr = sp.door;

    // 0) 钢轨：整列共用的虚拟锚点，轮对靠它落地（载荷通路的根；由远景层实际绘制）。
    //    锚点带与轮底重叠 1px —— 像素级贴合，BFS 才算得出「压在轨面上」。
    A(P, 'rail', 'rail', x0, g.railsY - 1, len, 3, { root: 'ground' });

    // 1) 车顶拱：四级台阶，每级都比下一级宽 —— 剖面上读得出弧度，不是「一块平板」
    A(P, 'crest', 'crest', x0 + 14, g.crestY, len - 28, 3);
    A(P, 'shoulder', 'shoulder', x0 + 8, g.crestY + 3, len - 16, 4);
    A(P, 'eave', 'eave', x0 + 3, g.crestY + 7, len - 6, 4);
    A(P, 'skin', 'skin', x0, g.crestY + 11, len, g.roofY - (g.crestY + 11));
    A(P, 'gutter-L', 'gutter', x0 - 1, g.roofY - 4, 4, 4);
    A(P, 'gutter-R', 'gutter', x1 - 3, g.roofY - 4, 4, 4);
    A(P, 'livery', 'livery', x0 + 14, g.crestY + 9, len - 28, 2);

    // 2) 车顶甲板剖面带（可行走面 = 它的顶线）+ 肋骨 + 顶棚 + 圆角
    A(P, 'deck', 'deck', x0, g.roofY, len, g.ceilBandY - g.roofY);
    for (let i = 0; 20 + i * 46 < len - 20; i++) A(P, 'roof-rib#' + i, 'roof-rib', x0 + 20 + i * 46, g.roofY + 1, 3, g.ceilBandY - g.roofY - 2);
    A(P, 'ceiling', 'ceiling', x0, g.ceilBandY, len, g.ceilY - g.ceilBandY);
    A(P, 'cove-L', 'cove', x0 + 2, g.ceilY - 5, 8, 5);
    A(P, 'cove-R', 'cove', x1 - 10, g.ceilY - 5, 8, 5);

    // 3) 远侧墙按模数切成四条带：上墙 / 窗间柱 / 窗下墙 / 踢脚。
    //    窗洞是「不画东西」的洞，所以只有窗间柱那条带按洞口断开 —— 结构上保证每扇窗
    //    看到的都是它自己那个世界位置（不需要为窗单独算视差，也就不会算错）。
    A(P, 'wall-upper', 'wall-upper', x0, g.ceilY, len, g.winHead - g.ceilY);
    const segs = []; let wx = x0;
    for (const q of win) { segs.push([wx, q.x]); wx = q.x + q.w; }
    segs.push([wx, x1]);
    segs.forEach((s, i) => {
      if (s[1] - s[0] < 2) return;
      A(P, 'wall-pier#' + i, 'wall-pier', s[0], g.winHead, s[1] - s[0], g.winSill - g.winHead);
    });
    A(P, 'wall-knee', 'wall-knee', x0, g.winSill, len, floorY - 10 - g.winSill);
    A(P, 'wall-base', 'wall-base', x0, floorY - 10, len, 10);
    A(P, 'mold', 'mold', x0, g.winSill + 5, len, 2);
    win.forEach((q, i) => {
      if (q.w < 56) return;
      A(P, 'radiator#' + i, 'radiator', q.x + 6, g.winSill + 8, q.w - 12, 8);
    });

    // 4) 窗：洞口 + 3px 框环 + 中竖（宽窗）+ 上亮玻璃。框只占环，净窗洞保持可看穿。
    win.forEach((q, i) => {
      const oh = g.winSill - g.winHead;
      OP.push({ id: 'window#' + i, kind: 'window', x: q.x, y: g.winHead, w: q.w, h: oh,
        clear: { x: q.x + jt, y: g.winHead + jt, w: q.w - 2 * jt, h: oh - 2 * jt } });
      A(P, 'win-head#' + i, 'win-head', q.x, g.winHead, q.w, jt);
      A(P, 'win-sill#' + i, 'win-sill', q.x, g.winSill - jt, q.w, jt + 1);
      A(P, 'win-jambL#' + i, 'win-jamb', q.x, g.winHead, jt, oh);
      A(P, 'win-jambR#' + i, 'win-jamb', q.x + q.w - jt, g.winHead, jt, oh);
      if (q.w >= sp.win.w1 - 6) A(P, 'win-mullion#' + i, 'win-mullion', q.x + (q.w / 2 | 0) - 1, g.winHead + jt, 2, oh - 2 * jt);
      A(P, 'glazing#' + i, 'glazing', q.x + jt, g.winHead + jt, q.w - 2 * jt, 7);
    });

    // 5) 地板 / 侧梁 / 制动管 / 底架桁架 / 车底走道
    //    底架画成开放桁架而不是实心裙板：中间那段是玩家真会走进去的维修道，
    //    实心填充会让「看得见撞不着」的假墙出现在落脚面上。
    A(P, 'floor', 'floor', x0, floorY, len, g.floorBot - floorY);
    A(P, 'sill', 'sill', x0, g.floorBot, len, sp.sillThk);
    A(P, 'brake-pipe', 'brake-pipe', x0, g.floorBot + 1, len, 4);
    win.forEach((q, i) => A(P, 'pipe-valve#' + i, 'pipe-valve', q.x, g.floorBot, 5, sp.sillThk - 1));
    // 底架带把「这一节是什么车」传进绘制层：设备组合按车型不同、格内细节按 seed 不同，
    // 于是整列车不会是一模一样的复制粘贴（既有判据也盯着这个）。
    A(P, 'truss', 'truss', x0, g.sillBot, len, g.underY - g.sillBot,
      { s: (car.seed | 0) & 0xffff, ty: car.type, ci: car.i | 0 });
    A(P, 'skirt-edge', 'skirt-edge', x0, g.underY - 3, len, 3);
    // 走道板厚度自适应轮径：板面在 underY，往下最多只能长到轮顶（railsY − 2R）为止 ——
    // 真实车底侧走道板本来就不许插进轮子里。轮半径 11 时这个上限是 20，取 spec 的 6~10，
    // 与改动前完全一致；轮半径加大到 17 时上限自动收到 8，于是不会再报
    // `walkway 盖在 wheel 上却没登记要贴`。落脚面标高 underY 一字未动，不影响碰撞。
    A(P, 'walkway', 'walkway', x0 - 13, g.underY, len + 26,
      Math.max(3, Math.min(sp.walkThk, g.railsY - 2 * sp.wheelR - g.underY)));

    // 6) 转向架叠层：轮对 → 轴箱 → 承载鞍 → 侧架 → 板簧 → 均衡梁 → 吊杆 → 侧梁，一级搭一级。
    //    轮底严格落在真实落轨标高 railsY 上（旧代码轮底比轨面高 33px，整列车看着在轨面上方飘）。
    //    轴箱／承载鞍／板簧／侧架／摇枕的基准是**轴心标高**（railsY − 轮半径），不是轮顶标高
    //    （railsY − 2×轮半径）：这些零件装在轴端与弹簧座上，跟着轴心走。
    //    原来按轮顶写，轮半径 11→20 时整族上移 18px，轴箱钻进了底架桁架的矩形里
    //    （结构证明报 `truss 盖在 axle-box 上却没登记要贴`）。
    const wr = sp.wheelR, cy = g.railsY - wr, half = span / 2 | 0, 轴 = g.railsY - wr;
    const st = { wheel: [], axleBox: [], journal: [], side: [], spring: [], bolster: [], hanger: [] };
    at.forEach((f, bi) => {
      const cx = Math.round(x0 + len * f);
      ['A', 'B'].forEach((sf, k) => {
        const xw = cx + (k ? half : -half);
        A(P, 'wheel#' + bi + '-' + sf, 'wheel', xw - wr, cy - wr, wr * 2, wr * 2, { r: wr, cx: xw, cy: cy });
        A(P, 'axle-box#' + bi + '-' + sf, 'axle-box', xw - 5, 轴 - 4, 10, 8);
        A(P, 'journal#' + bi + '-' + sf, 'journal', xw - 7, 轴 - 9, 14, 4);
        A(P, 'spring#' + bi + '-' + sf, 'spring', xw - 8, 轴 - 14, 16, 6);
        st.wheel.push([xw - wr, cy - wr, xw + wr, cy + wr]);
        st.axleBox.push([xw - 5, 轴 - 4, xw + 5, 轴 + 4]);
        st.journal.push([xw - 7, 轴 - 9, xw + 7, 轴 - 5]);
        st.spring.push([xw - 8, 轴 - 14, xw + 8, 轴 - 8]);
      });
      A(P, 'axle#' + bi, 'axle', cx - half, cy - 2, half * 2, 4);
      A(P, 'bogie-side#' + bi, 'bogie-side', cx - half - 9, 轴 - 13, (half + 9) * 2, 12);
      A(P, 'bolster#' + bi, 'bolster', cx - half - 14, 轴 - 19, (half + 14) * 2, 7);
      A(P, 'hanger#' + bi, 'hanger', cx - 2, g.sillBot, 4, (轴 - 19) - g.sillBot);
      st.side.push([cx - half - 9, 轴 - 13, cx + half + 9, 轴 - 1]);
      st.bolster.push([cx - half - 14, 轴 - 19, cx + half + 14, 轴 - 12]);
      st.hanger.push([cx - 2, g.sillBot, cx + 2, 轴 - 19]);
    });

    // 7) 车端：端墙只画「剖到的一条带」+ 门楣 + 门槛，中间整段留空。
    //    画成实心带等于凭空造一堵看不见的墙 —— 本项目真出过「看着有门、门边一堵墙堵死路」。
    const ec = sp.wallThk;
    ['L', 'R'].forEach(side => {
      const ex = side === 'L' ? x0 : x1 - ec;
      A(P, 'side-' + side, 'side', ex, g.roofY + dr.lintel, 2, floorY - (g.roofY + dr.lintel), { cut: true });
      A(P, 'end-roof-' + side, 'end-roof', ex, g.crestY, ec, g.roofY - g.crestY, { cut: true });
      A(P, 'end-lintel-' + side, 'end-lintel', ex, g.roofY, ec, dr.lintel, { cut: true });
      A(P, 'end-sill-' + side, 'end-sill', ex, floorY, ec, sp.floorThk + sp.sillThk, { cut: true });
      A(P, 'hazard-' + side, 'hazard', ex, floorY - 2, ec, 2);
      A(P, 'walk-' + side, 'walk', side === 'L' ? x0 : x1 - 30, floorY, 30, 2);
    });

    // 8) 门框：位置严格取门实体（car.doors）的矩形，框 = 洞口外扩 3px、上亮 10px。
    //    门楣贴在甲板带里（不挡 212 以下的净空），门墩从顶棚下沿探出 —— 一眼读得出「这是个门洞」。
    //    这一步让「门在不在框里」变成可核对的几何关系（以前门框跟着门一起消失，门开着就没框）。
    (car.doors || []).forEach((d, i) => {
      const fw = d.w || dr.w, fy = d.y, dh = d.h || (floorY - d.y);
      const inGap = d.x >= x1 - 2;                       // 通过台门：门框上沿铺满整个间隙，才接得住两端车体
      const hx = inGap ? x1 : d.x - dr.jamb, hw = inGap ? sp.gap : fw + 2 * dr.jamb;
      OP.push({ id: 'door#' + i, kind: 'door', x: d.x, y: fy + dr.lintel, w: fw, h: dh - dr.lintel,
        clear: { x: d.x, y: fy + dr.lintel, w: fw, h: dh - dr.lintel } });
      A(P, 'door-head#' + i, 'door-frame', hx, fy, hw, dr.lintel);
      A(P, 'door-apron#' + i, 'door-frame', d.x - dr.jamb, g.ceilBandY, fw + 2 * dr.jamb, 24);
      A(P, 'door-jambL#' + i, 'door-frame', d.x - dr.jamb, fy, dr.jamb, dh);
      A(P, 'door-jambR#' + i, 'door-frame', d.x + fw, fy, dr.jamb, dh);
      A(P, 'door-sill#' + i, 'door-frame', d.x - dr.jamb - 2, floorY - 3, fw + 2 * dr.jamb + 4, 3);
      A(P, 'hazard-d#' + i, 'hazard', d.x - dr.jamb - 2, floorY - 3, fw + 2 * dr.jamb + 4, 2);
    });

    // 9) 通过台（跨接两节车的柔性通道）：顶棚褶皱 + 侧柱 + 扶手 + 端框 + 车钩。
    //    风挡只围「通道以上」，净空从 cavityGang(306) 起 ——
    //    旧代码是一坨 26px 高的实心橡胶糊在门口，正好盖住过路人的下半身。
    (car.seams || []).filter(s => Math.abs(s.y - floorY) < 2).forEach((s, i) => {
      const sx0 = Math.round(s.x0), sx1 = Math.round(s.x1), sw = sx1 - sx0;
      const cTop = g.ceilBandY, cBot = sp.cavityGang - 4;
      A(P, 'gang-roof#' + i, 'gang-roof', sx0 - 4, g.crestY + 6, sw + 8, 5);
      A(P, 'gang-canopy#' + i, 'gang-canopy', sx0, cTop, sw, cBot - cTop);
      A(P, 'handrail#' + i, 'handrail', sx0, cBot, sw, 3);
      A(P, 'gang-post#' + i, 'gang-post', sx0 + 1, cBot + 3, 3, floorY - 6 - (cBot + 3));
      A(P, 'door-frame#' + i, 'door-frame', sx1 - 3, g.roofY, 3, floorY - g.roofY);
      A(P, 'gang-floor#' + i, 'gang-floor', sx0, floorY, sw, sp.floorThk);
      // 缓冲梁的底端锚在**固定标高**上，不跟轮径走：真实车钩中心线距轨面约 880mm，
      // 轮径磨耗与换轮型由一系/二系悬挂补偿，不会把车钩抬起来。
      // 原来写成 `railsY - 2*wr - 2`，于是 wheelR 11→20 时整条缓冲梁上移 18px，
      // 与车钩（锚在走道标高，本来就是定值）脱开 —— 结构证明立即报 `coupler 悬空`。
      A(P, 'buffer-beam-R#' + i, 'buffer-beam', x1 - 6, g.sillBot - 2, 6, (g.railsY - 26) - (g.sillBot - 2));
      A(P, 'coupler#' + i, 'coupler', sx0 - 4, g.walkBot + 4, sw + 2, 10, { on: ['buffer-beam-R#' + i] });
      A(P, 'draft-gear#' + i, 'draft-gear', x1 - 24, g.sillBot - 6, 24, 9);
    });

    // 车顶层的接缝 = 走道上的真断口（必须跳过去）：两端断面各画一条硬边 + 警示条，
    // 不铺板 —— 铺了就把「这里要跳」的信息抹掉了。
    (car.seams || []).filter(s => Math.abs(s.y - floorY) >= 2).forEach((s, i) => {
      A(P, 'gap-mark#' + i, 'hazard', Math.round(s.x0) - 6, g.roofY - 2, 6, 2);
      A(P, 'gap-edge#' + i, 'end-sill', Math.round(s.x0) - 2, g.roofY, 2, sp.deckThk, { cut: true });
      A(P, 'gap-edgeR#' + i, 'end-sill', Math.round(s.x1), g.roofY, 2, sp.deckThk, { cut: true });
    });

    // 车号铭牌：贴在「最宽的窗间柱」上（那里永远不会撞上暖气片/窗框），找不到就不画
    const plate = segs.map(v => v[1] - v[0]).indexOf(Math.max.apply(null, segs.map(v => v[1] - v[0])));
    if (segs[plate] && segs[plate][1] - segs[plate][0] >= 30) {
      const pw = segs[plate][1] - segs[plate][0];
      A(P, 'number-board', 'number-board', segs[plate][0] + (pw / 2 | 0) - Math.min(20, pw / 2 - 3 | 0),
        g.winSill + 14, Math.min(40, pw - 6), 12);
    }

    P.forEach(p => { p.layer = LAYER(p.kind); p.seedKey = (car.seed | 0) + p.x; });
    return { car, sp, g, parts: P, openings: OP, x0, x1, len, span, stack: st, seed: car.seed | 0,
      type: car.type || 'coach', i: car.i | 0, ink: {} };
  }

  // ---------- 样板车：预览页用（字段与真实 car 对齐，好让同一份骨架代码两边都跑） ----------
  function demoCar(i, type, sp, TG) {
    const len = sp.carLen, x0 = i * (len + sp.gap);
    const car = {
      i, type, name: (TG && TG.CAR[type] ? TG.CAR[type].name : type), x0, len, x1: x0 + len,
      yFloor: sp.floorY, yCeil: sp.ceilY, yRoof: sp.roofY, h: sp.interiorH,
      seed: 1000 + i * 7717, chapter: i, doors: [], seams: [], links: [], ladders: [], decks: [], holes: [],
      uid: type + '-' + String(i).padStart(2, '0'),
      artSeed: TG && TG.artStreams ? TG.artStreams(1000 + i * 7717) : null,
      roofBlocks: [], gantries: [], furniture: [], damage: [], lights: [], props: [],
      routeIn: 'FLOOR', routeOut: 'FLOOR',
    };
    car.doors.push({ x: car.x1 + sp.door.fromEnd, y: car.yRoof, w: sp.door.w, h: car.yFloor - car.yRoof, jammed: i === 1, id: 'pd' + i, side: 'R' });
    if (i === 0) car.doors.push({ x: car.x0 + 10, y: car.yRoof, w: sp.door.w, h: car.yFloor - car.yRoof, jammed: false, id: 'pd-entry', side: 'L' });
    // 洞口交给生成器的同一个函数：样板车和实编组用同一套模数，不会两边长得不一样
    car.windows = TG && TG.carWindows ? TG.carWindows(car) : [];
    return car;
  }
  function demoRig(n, type, sp, TG) {
    const cars = [];
    for (let i = 0; i < n; i++)
      cars.push(demoCar(i, type === 'mixed' ? ['coach', 'luggage', 'sleeper'][i % 3] : type, sp, TG));
    for (let i = 0; i < cars.length - 1; i++)
      cars[i].seams.push({ x0: cars[i].x1, x1: cars[i + 1].x0, y: cars[i].yFloor, broken: false, sag: 1 });
    return cars;
  }

  // ---------- 三个落脚空腔（遮挡率实测用） ----------
  function cavities(sk, sp) {
    sp = sp || sk.sp;
    const out = [
      ['车底维修道', { x: sk.x0 - 13, y: sp.cavityUnder, w: sk.len + 26, h: sp.underY - sp.cavityUnder }],
      ['通过台', { x: sk.x1, y: sp.cavityGang, w: sp.gap, h: sp.floorY - sp.cavityGang }],
    ];
    const d = (sk.car.doors || []).filter(x => x.side !== 'L')[0] || (sk.car.doors || [])[0];
    if (d) out.push(['门口', { x: d.x, y: sk.g.floorY - sp.bodyH, w: d.w || sp.door.w, h: sp.bodyH - 4 }, []]);
    out[1][2] = ['door-', 'handrail', 'gang-post'];      // 门框/扶手/侧柱本来就在通道里，查的是「还有别的东西挡着吗」
    return out;
  }
  // 逐个构件录制绘制指令，再按空腔要求剔除允许的构件 —— 这样遮挡率是「画出来的」，不是估出来的
  function measure(sk, pen, rec, step) {
    pen.sp = sk.sp;
    const boxes = cavities(sk, sk.sp);
    const keep = boxes.map(b => (b[2] || []).slice());
    const ops = boxes.map(() => []);
    const list = sk.parts.slice().sort((a, b) => a.layer - b.layer || a.x - b.x);
    for (const p of list) {
      rec._ops = [];
      CarArt_self.drawPart(pen, p);
      const got = rec._ops;
      for (let i = 0; i < boxes.length; i++) {
        const ex = keep[i];
        if (ex.some(pre => p.id.indexOf(pre) === 0 || p.kind.indexOf(pre) === 0)) continue;
        for (const o of got) ops[i].push(o);
      }
    }
    return boxes.map((b, i) => {
      const cols = Math.max(1, Math.ceil(b[1].w / (step || 2))), rows = Math.max(1, Math.ceil(b[1].h / (step || 2)));
      const occ = new Uint8Array(cols * rows);
      for (const o of ops[i]) {
        const a0 = Math.max(0, Math.floor((o[0] - b[1].x) / (step || 2))), a1 = Math.min(cols, Math.ceil((o[0] + o[2] - b[1].x) / (step || 2)));
        const c0 = Math.max(0, Math.floor((o[1] - b[1].y) / (step || 2))), c1 = Math.min(rows, Math.ceil((o[1] + o[3] - b[1].y) / (step || 2)));
        for (let y = c0; y < c1; y++) { const base = y * cols; for (let x = a0; x < a1; x++) occ[base + x] = 1; }
      }
      let n = 0;
      for (let k = 0; k < occ.length; k++) n += occ[k];
      return [b[0], n / occ.length];
    });
  }
  const CarArt_self = { drawPart };
  // 把绘制指令录成格点占用位图：材质纹理（铆钉、流痕、褶皱、轮辐）也一并算进去
  function rasterize(ops, boxes, step) {
    step = step || 2;
    return boxes.map((b, i) => {
      const cols = Math.max(1, Math.ceil(b.w / step)), rows = Math.max(1, Math.ceil(b.h / step));
      const occ = new Uint8Array(cols * rows);
      for (const o of ops) {
        const a0 = Math.max(0, Math.floor((o[0] - b.x) / step)), a1 = Math.min(cols, Math.ceil((o[0] + o[2] - b.x) / step));
        const c0 = Math.max(0, Math.floor((o[1] - b.y) / step)), c1 = Math.min(rows, Math.ceil((o[1] + o[3] - b.y) / step));
        for (let y = c0; y < c1; y++) { const base = y * cols; for (let x = a0; x < a1; x++) occ[base + x] = 1; }
      }
      let n = 0;
      for (let k = 0; k < occ.length; k++) n += occ[k];
      return [n / occ.length, occ, cols, rows];
    });
  }
  function coverage(ops, boxes, step) {
    return rasterize(ops, boxes.map(b => b[1]), step).map((r, i) => [boxes[i][0], r[0]]);
  }

  // ---------- 结构证明 ----------
  const touch = (a, b, tol) => a.x - tol < b.x + b.w && b.x - tol < a.x + a.w && a.y - tol < b.y + b.h && b.y - tol < a.y + a.h;
  const over = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const ovl = (a, b) => over(a, b) > 1;

  function check(sk, opt) {
    opt = opt || {};
    const sp = sk.sp, P = sk.parts, g = sk.g;
    const bad = { cfg: [], float: [], unstruck: [], link: [], cross: [], cover: [], align: [], ink: [], scale: [] };
    const byId = {}; P.forEach(p => { byId[p.id] = p; });
    if (sp.bad && sp.bad.length) bad.cfg.push(sp.bad.join('，'));

    // 0) 形状：坐标有限、整数、面积为正；登记表覆盖所有出现的 kind
    for (const p of P) {
      if (!isFinite(p.x) || !isFinite(p.y) || !(p.w > 0) || !(p.h > 0) || p.x !== Math.round(p.x) || p.y !== Math.round(p.y))
        bad.float.push(p.id + '(' + p.kind + ') 尺寸非法 ' + [p.x, p.y, p.w, p.h].join(','));
      if (!KINDS[p.kind]) bad.float.push(p.id + ' 的构件类型 ' + p.kind + ' 没登记');
    }

    // A 挂靠：每个部件都要贴住某个「登记过」或「自己声明过」的邻件（接地根除外）。
    //    前缀同时匹配 kind 名与 id 前缀，所以 'gang-canopy' 能找到 'gang-canopy#0'。
    const matchOf = (p, pre) => P.filter(q => q !== p && (q.kind === pre || q.id === pre || q.id.indexOf(pre) === 0));
    for (const p of P) {
      if (p.root === 'ground') continue;
      const all = ((KINDS[p.kind] || {}).on || []).concat(p.on || []);
      const cand = [];
      for (const pre of all) for (const q of matchOf(p, pre)) if (cand.indexOf(q) < 0) cand.push(q);
      p._hit = cand.filter(q => touch(p, q, 1));
      if (!p._hit.length) bad.float.push(p.id + '(' + p.kind + ') 悬空：没贴到任何允许的连接件');
    }
    // B 载荷通路：从钢轨出发 BFS。够不到地面 = 这构件不知道被谁撑着
    const seen = new Set(); let frontier = P.filter(p => p.root === 'ground');
    frontier.forEach(p => seen.add(p.id));
    for (let guard = 0; frontier.length && guard++ < 40; ) {
      const nx = [];
      for (const p of frontier) for (const r of P) {
        if (seen.has(r.id)) continue;
        const link = (r._hit || []).some(t => t.id === p.id) || (p._hit || []).some(t => t.id === r.id);
        if (link && touch(r, p, 1)) { seen.add(r.id); nx.push(r); }
      }
      frontier = nx;
    }
    P.forEach(p => { if (!seen.has(p.id)) bad.unstruck.push(p.id + '(' + p.kind + ')'); });

    // C 显式声明的连接必须成立：前缀要命中构件，且至少一个真的挨着
    for (const p of P) for (const e of (p.on || [])) {
      const m = matchOf(p, e);
      if (!m.length) bad.link.push(p.id + ' → 声明了不存在的 ' + e);
      else if (!m.some(q => touch(p, q, 1))) bad.link.push(p.id + ' → ' + e + ' 没有一个真的挨着（超过 1px）');
    }

    // D 穿插：跨分组的两个构件要重合，必须是「更靠前的那一件登记过要贴在后一件上」。
    //    这条抓的是「A 本该贴 B 却盖到了 C」——例如门楣画薄了露在顶棚外、窗框偏到墙上。
    const bins = {};
    for (const p of P) { if (p.noDraw) continue; const b = Math.floor(p.x / 200); for (let k = b - 1; k <= b + 1; k++) (bins[k] = bins[k] || []).push(p); }
    const allows = (f, b) => {
      const ok = (q, list) => list.some(pre => q.kind === pre || q.id === pre || q.id.indexOf(pre) === 0);
      return (f.on || []).length ? ok(b, f.on) : ok(b, (KINDS[f.kind] || {}).on || []);
    };
    const done = new Set();
    for (const k in bins) for (const a of bins[k]) for (const b of bins[k]) {
      if (a === b || a.g === b.g) continue;
      const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if (done.has(key)) continue; done.add(key);
      if (!ovl(a, b)) continue;
      const front = a.layer >= b.layer ? a : b, back = front === a ? b : a;
      if (!allows(front, back))
        bad.cross.push(front.id + ' 盖在 ' + back.id + ' 上却没登记要贴它（' + front.kind + '/' + back.kind + '，' + over(a, b) + 'px²）');
    }

    // E 带覆盖：每条横向带沿车长连续（窗间柱带允许被洞口断开）。
    //    细线构件（腰线、门槛高光、行走面亮线）不算覆盖来源，否则一条 2px 的线就能冒充整条带。
    const bandOf = (lo, hi) => P.filter(p => p.h > 0 && !p.thin && p.kind !== 'brake-pipe' &&
      p.y + p.h > lo + 0.5 && p.y < hi - 0.5 && !(hi - lo > 20 && p.h < 3))
      .map(p => [p.x, p.x + p.w]);
    const BAND = [
      ['车顶外皮', () => [g.crestY + 11, g.roofY], null],
      ['车顶甲板', () => [g.roofY, g.ceilBandY], null],
      ['顶棚', () => [g.ceilBandY, g.ceilY], null],
      ['上墙', () => [g.ceilY, g.winHead], null],
      ['窗间柱', () => [g.winHead, g.winSill], sk.openings.filter(o => o.kind === 'window').map(o => [o.x, o.x + o.w])],
      ['窗下墙', () => [g.winSill, g.floorY - 10], null],
      ['踢脚', () => [g.floorY - 10, g.floorY], null],
      ['地板', () => [g.floorY, g.floorBot], null],
      ['侧梁', () => [g.floorBot, g.sillBot], null],
      ['底架', () => [g.sillBot, g.underY], null],
    ];
    for (const row of BAND) {
      const nm = row[0], rg = row[1], hole = row[2];
      const yy = rg();
      const gs = gapsIn(bandOf(yy[0], yy[1]), sk.x0, sk.x1, hole);
      if (gs.length) bad.cover.push(nm + ' 带在 ' + gs.map(v => v[0] + '~' + v[1]).join(',') + ' 断开');
    }

    // F 竖向剖面：沿车长取样，除洞口外从拱顶到走道底一条不落（不封闭就是破的）
    for (let x = sk.x0 + 16; x <= sk.x1 - 16; x += 24) {
      const col = P.filter(p => p.h > 0 && !p.thin && p.kind !== 'brake-pipe' && p.x <= x && p.x + p.w >= x)
        .map(p => [p.y, p.y + p.h]);
      const hole = sk.openings.filter(o => o.kind === 'window' && o.x < x && o.x + o.w > x).map(o => [o.y, o.y + o.h]);
      const gs = gapsIn(col, g.crestY, g.walkBot, hole);
      if (gs.length) bad.cover.push('竖向剖面 x=' + x + ' 在 ' + gs.map(v => v[0] + '~' + v[1]).join(',') + ' 处是空的');
    }

    // G 对齐与落地：地板线=碰撞值、轮底=轨面、两轮不相交、轮在车下、窗洞在墙面带内、净窗洞无遮挡
    if (opt.floorY !== undefined && g.floorY !== opt.floorY)
      bad.align.push('地板线 ' + g.floorY + ' ≠ 碰撞地板 ' + opt.floorY + '（美术与通行已经脱钩）');
    if (opt.roofY !== undefined && g.roofY !== opt.roofY)
      bad.align.push('车顶可行走线 ' + g.roofY + ' ≠ 碰撞车顶 ' + opt.roofY + '：净高/板厚改动没有同步到碰撞');
    for (const w of sk.stack.wheel) {
      if (Math.abs(w[3] - g.railsY) > 1) bad.align.push('轮底 ' + w[3] + ' 没落在轨面 ' + g.railsY + ' 上（悬空 ' + (g.railsY - w[3]) + 'px）');
      if (w[0] < sk.x0 || w[2] > sk.x1) bad.align.push('车轮 ' + w.join(',') + ' 越出车体范围');
    }
    if (sk.span < 2 * sp.wheelR + 12) bad.align.push('轴距 ' + sk.span + ' 小于两轮直径之和，轮对相互穿插');
    for (let i = 0; i < sk.stack.wheel.length; i++) for (let j = i + 1; j < sk.stack.wheel.length; j++) {
      const a = sk.stack.wheel[i], b = sk.stack.wheel[j];
      if (a[2] > b[0] && b[2] > a[0]) bad.align.push('两轮水平相交（' + a.join(',') + ' vs ' + b.join(',') + '）');
    }
    for (const bo of sk.stack.bolster) if (bo[0] < sk.x0 - 13 || bo[2] > sk.x1 + 13) bad.align.push('转向架超出车体');
    const near = (a, b) => !(a[1] > b[3] + 1 || b[1] > a[3] + 1) && !(a[0] >= b[2] || b[0] >= a[2]);
    [['axleBox', 'wheel'], ['journal', 'axleBox'], ['spring', 'journal'], ['spring', 'bolster'], ['hanger', 'bolster']].forEach(pr => {
      const la = sk.stack[pr[0]] || [], lb = sk.stack[pr[1]] || [];
      for (const a of la) if (!lb.some(b => near(a, b))) bad.align.push(pr[0] + ' 没搭在 ' + pr[1] + ' 上（x=' + a[0] + '）');
    });
    for (const h of sk.stack.hanger)
      if (!(h[1] >= g.floorBot - 2 && h[1] <= g.sillBot + 4)) bad.align.push('吊杆没搭到侧梁上（y=' + h[1] + '）');
    for (const o of sk.openings.filter(v => v.kind === 'window')) {
      if (o.y < g.ceilY || o.y + o.h > g.floorY) bad.align.push(o.id + ' 窗洞越出墙面带（净高 ' + (g.floorY - g.ceilY) + ' 放不下窗台 ' + sp.win.sill + '+洞高 ' + sp.win.h + '）');
      const intr = P.filter(p => !p.see && !p.noDraw && p.g !== 'win' && ovl(p, o.clear));
      if (intr.length) bad.align.push(o.id + ' 净窗洞被 ' + intr.map(v => v.id).join(',') + ' 挡住');
    }
    for (const d of (sk.car.doors || [])) {
      const fw = d.w || sp.door.w;
      const head = P.find(p => p.id.indexOf('door-head') === 0 && p.y === d.y && Math.abs(p.h - sp.door.lintel) < 2 && p.x <= d.x && p.x + p.w >= d.x + fw);
      const sill = P.find(p => p.id.indexOf('door-sill') === 0 && Math.abs(p.y + p.h - g.floorY) <= 3 && p.x <= d.x && p.x + p.w >= d.x + fw);
      const jl = P.find(p => p.id.indexOf('door-jambL') === 0 && p.x === d.x - sp.door.jamb && p.h === (d.h || (g.floorY - d.y)));
      const jr = P.find(p => p.id.indexOf('door-jambR') === 0 && p.x === d.x + fw);
      if (!head) bad.align.push('门 ' + d.id + ' 没有门楣（框应与门实体 x 完全重合）→ 看着就是虚空里悬着一扇门');
      if (!sill) bad.align.push('门 ' + d.id + ' 没有门槛（应与地板线齐平）');
      if (!jl || !jr) bad.align.push('门 ' + d.id + ' 少一侧立边（门框没包住门）');
    }
    for (const s of (sk.car.seams || []).filter(v => Math.abs(v.y - g.floorY) < 2)) {
      const cov = gapsIn(P.filter(p => p.kind === 'gang-floor' || p.kind === 'gang-canopy').map(p => [p.x, p.x + p.w]), s.x0, s.x1, null);
      if (cov.length) bad.align.push('通过台在 ' + cov.map(v => v[0] + '~' + v[1]).join(',') + ' 没铺满（缺口=虚空）');
      if (Math.abs(s.y - g.floorY) > 0 && Math.abs(s.y - g.roofY) > 0)
        bad.align.push('接缝标高 ' + s.y + ' 既不是地板 ' + g.floorY + ' 也不是车顶 ' + g.roofY + '，美术不知道该在哪儿铺面');
    }

    // H 空腔遮挡：实测值由闸门/预览页用 coverage() 录绘制指令算出来，这里只判定
    sk.ink = {};
    (opt.cov || []).forEach(r => {
      sk.ink[r[0]] = r[1];
      if (r[1] > (r[0] === '门口' ? 0.12 : 0.34)) bad.ink.push(r[0] + ' 实测被挡 ' + (r[1] * 100).toFixed(0) + '%（看不出落脚面）');
    });

    // I 尺度：以角色身高 H 为参照，失衡直接说（不许偷偷失衡）
    const sc = scale(sk, sp);
    if (sc.interiorInH < 2.4) bad.scale.push('净高只有 ' + sc.interiorInH.toFixed(2) + 'H，角色站不直');
    if (sc.doorClearInH < 1) bad.scale.push('门净高不足 1H');
    if (sc.sillInH > 2.2) bad.scale.push('窗台高 ' + sc.sillInH.toFixed(2) + 'H，与角色尺度对不上');
    if (sc.winInH < 0.5) bad.scale.push('窗高只有 ' + sc.winInH.toFixed(2) + 'H，不像窗了');
    if (sc.gangClearInH < 1) bad.scale.push('通过台净空不足 1H，人过不去');
    return { ok: !Object.keys(bad).some(k => bad[k].length), bad, scale: sc, ink: sk.ink, parts: P.length };
  }

  function scale(sk, sp) {
    const H = sp.bodyH, g = sk.g;
    return {
      H, unit: sp.unit, lenInH: sk.len / H, lenInM: sk.len / sp.unit,
      interiorInH: (g.floorY - g.ceilY) / H, interiorInM: (g.floorY - g.ceilY) / sp.unit,
      bodyTopInM: (g.railsY - g.crestY) / sp.unit,
      doorClearInH: (g.floorY - (g.roofY + sp.door.lintel)) / H,
      sillInH: (g.floorY - g.winSill) / H, winInH: (g.winSill - g.winHead) / H,
      underInH: (sp.underY - g.floorY) / H, gangClearInH: (sp.floorY - sp.cavityGang) / H,
      windowCount: sk.openings.filter(o => o.kind === 'window').length,
      gapInH: sp.gap / H, spanInM: sk.span / sp.unit, wheelDiaM: 2 * sp.wheelR / sp.unit,
    };
  }

  // ---------- 渲染：按层序逐个构件，全部走 pen 的原语（材质沿用 train-draw 的 MAT） ----------
  const R = {
    'crest'(pen, p, x, y, w, h) {
      const P = pen.p;
      pen.strip(x + 2, y, w - 4, 1, P.paint); pen.strip(x, y + 1, w, 1, P.panelLo);
      pen.strip(x + 6, y + 2, w - 12, 1, P.panelHi); pen.strip(x, y + h - 1, w, 1, P.panelEdge);
    },
    'wheel'(pen, p, x, y, w, h) {
      const P = pen.p, r = p.r, cx = x + r, cy = y + r;
      pen.circle(cx, cy, r, P.steelDark);
      pen.circle(cx, cy, r - 3, P.steel);
      pen.circle(cx, cy, 2, P.steelHi);
      const ph = pen.roll ? pen.roll(r) : 0;
      for (let k = 0; k < 4; k++) {                      // 四等分辐条标记：转得出来才读得出车速
        const a = (ph + k / 4) * Math.PI * 2;
        pen.strip(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4), 2, 2, P.steelHi);
      }
      pen.strip(cx - r, cy - 1, w, 1, P.steelLo);
    },
    // ---------- 底架设备带（原来这里是一整条重复的「□×」斜撑，占画面约 1/4 而读不出任何东西） ----------
    // 约束（写在 skeleton 的注释里，这里必须守住）：`y+h` 那一条 408 是玩家真会走的维修道，
    // 所以设备只挂在上下弦之间，且**每 4 格至少留 1 格通透** —— 否则就从
    // 「看得见撞不着的假墙」升级成「看不见也撞不着的堵墙」。
    // 随机源用本地整数哈希：不依赖外部 API，且同 seed 同格必然同结果（确定性闸门要复现）。
    'truss'(pen, p, x, y, w, h, q) {
      const P = pen.p, pit = Math.max(34, ((pen.sp || BASE).trussPitch | 0) + 6);
      const 哈 = (a, b) => { let v = (a * 374761393 + b * 668265263) >>> 0;
        v = ((v ^ (v >>> 13)) * 1274126177) >>> 0; return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
      // 参数挂在构件自己身上：drawPart 只按 (pen, p, x, y, w, h) 六个实参派发，没有第七个。
      // 早先这里读的是 `q` —— 于是每一节车都拿到 s=0、ty=''，整列车共用同一条默认设备池和同一条随机流，
      // 相邻两节车的底架排布**逐字符相同**（闸门 ② 的「从最前面几件开始就不同」就是为此而加）。
      const 参 = p || {}, s = (参.s) | 0, ty = 参.ty || '';
      // 车型 → 设备池。机车/发电车以机组为主，货车以风缸与箱柜为主，客/卧/餐/医各有侧重。
      const 池 = { locomotive: ['gen', 'gen', 'radiator', 'reservoir', 'exhaust', 'box', 'pipes', 'cyl'],
        power: ['gen', 'radiator', 'radiator', 'reservoir', 'exhaust', 'cyl', 'box', 'pipes'],
        freight: ['tank', 'tank', 'box', 'reservoir', 'pipes', 'cyl', 'ladder', 'radiator'],
        hopper: ['tank', 'reservoir', 'pipes', 'box', 'cyl', 'ladder', 'tank', 'pipes'],
        coach: ['reservoir', 'pipes', 'tank', 'box', 'cyl', 'pipes', 'ladder', 'radiator'],
        sleeper: ['reservoir', 'reservoir', 'tank', 'box', 'pipes', 'cyl', 'box', 'ladder'],
        diner: ['tank', 'box', 'exhaust', 'pipes', 'reservoir', 'cyl', 'box', 'ladder'],
        medical: ['tank', 'reservoir', 'box', 'box', 'pipes', 'cyl', 'exhaust', 'ladder'],
        security: ['box', 'gen', 'cyl', 'reservoir', 'pipes', 'tank', 'ladder', 'box'],
        luggage: ['box', 'box', 'tank', 'ladder', 'pipes', 'cyl', 'reservoir', 'tank'] }[ty]
        || ['tank', 'reservoir', 'box', 'pipes', 'cyl', 'ladder', 'radiator', 'gen'];
      const 带上 = y + 2, 底 = y + h - 3;
      // 设备只准挂在带子的**下 44%**，上部留空给吊架与通风间隙 —— 闸门「车底维修道看得穿」量的是空腔面积
      // 被盖掉的 fraction（实测把整条带填满时遮挡 53%，阈值 34%，本档 28%）。
      const 顶 = 带上 + Math.round((底 - 带上) * 0.56), 净高 = Math.max(10, 底 - 顶);
      // 上下弦 + 端部竖梁：结构读得出来，但不再用对角 X 铺满（那正是「看不出是啥」的来源）
      pen.strip(x, y, w, 2, P.steelLo); pen.strip(x, y + h - 2, w, 2, P.steelLo);
      pen.strip(x, y, 2, h, P.steelDark); pen.strip(x + w - 2, y, 2, h, P.steelDark);
      for (let i = 0, k = 0; i + pit <= w; i += pit, k++) {
        const r1 = 哈(s, k * 7 + 1), r2 = 哈(s, k * 7 + 2), r3 = 哈(s, k * 7 + 3);
        // 每疏格强制一格通透（只留一根竖腹杆），其余格放设备
        // 通透率必须跟着节距走：节距被配小（参数扫描里有 30）时格数变多，固定「每四格留一格」
        // 会让总遮挡超阈值 —— 所以小节距时每三格就留一格。密度上限的账由闸门 ink 判据实测把关，不写在这里。
        const 疏 = pit <= 40 ? 3 : 4;
        const 通 = (k % 疏 === 疏 - 1) || r1 > 0.82;
        pen.strip(x + i + (pit >> 1), 带上, 2, 底 - 带上, P.steelLo);      // 竖腹杆贯通上下弦
        // 带上沿这一格是走线区：只画断开的电缆卡子与分段电缆，不画通长实带 —— 通长一条 2px 就要吃掉
        // 维修道可见面积的百分之几，而「一格一格、中间断开」的卡子读起来同样是布线，代价小得多。
        pen.strip(x + i + 6, 带上 + 4, 4, 2, P.steel);                    // 电缆卡子
        pen.strip(x + i + pit - 12, 带上 + 4, 4, 2, P.steel);
        if (k % 2 === 0) pen.strip(x + i + 10, 带上 + 5, pit - 22, 1, P.steelDark);   // 每隔一格一段电缆
        if (r3 > 0.55) pen.strip(x + i + 9, 带上 + 8, 3, 3, P.warn);                   // 接线盒（黄色盖）
        if (k % 3 === 1 && !通) {                                     // 少数格留一道斜撑，破掉纯网格节奏
          for (let t = 0; t < 净高; t += 3) pen.strip(x + i + 3 + (t / 净高 * (pit - 8) | 0), 顶 + t, 2, 2, P.steelDark);
        }
        if (通) continue;
        // 步长 3 之外再叠一格一格的哈希偏移：只用「池子长度取模」的话，同车型且 seed 相差 8 的倍数的两节车
        // 会得到**逐格相同**的设备序列（实测相邻两节车前四件一模一样），看上去就是复制粘贴。
        const kind = 池[(k * 3 + (哈(s, k * 13 + 5) * 池.length | 0)) % 池.length];
        // 设备 footprint 左右各缩 3px（原来 bx=+4、bw=pit-12）：省下来的这约 3% 空腔面积不是白省的 ——
        // 它正好抵掉上方走线区那点新增落笔，让「更丰富」不把「车底维修道看得穿」（阈值 34%）顶破。
        // 省出来的宽度同时给了**逐格尺寸抖动**：带子只有 15px 高，高度方向已经没有任何自由度
        // （原来的 `净高 - th - 8` 算出来是负数，r2 完全没用上，于是一整排设备全是同一个 24×9 的方块，
        // 相邻两节车也长得一模一样）。宽度与左右位置才是这里唯一还能动起来的量。
        const bw = Math.max(12, ((pit - 18) * (0.70 + r2 * 0.30)) | 0);
        const bx = x + i + 4 + Math.round((pit - 24 - bw) * r3);
        const by = 顶 + 2 + (r2 * Math.max(0, 净高 - 16) | 0) * 0 | 0;
        const 吊 = () => { pen.strip(bx + (bw >> 1) - 1, 顶, 2, 4, P.steelDark); };   // 吊挂到上弦
        if (kind === 'tank' || kind === 'reservoir') {                 // 横置风缸／储气罐
          const th = Math.min(净高 - 6, 14), tc = 顶 + 4 + (r2 * Math.max(0, 净高 - th - 8) | 0);
          pen.strip(bx + 2, tc, bw - 4, th, P.steelLo);
          pen.circle(bx + 3, tc + (th >> 1), (th >> 1) - 1, P.steel);
          pen.circle(bx + bw - 4, tc + (th >> 1), (th >> 1) - 1, P.steel);
          for (let g2 = bx + 5; g2 < bx + bw - 5; g2 += 6) pen.strip(g2, tc, 1, th, P.steelHi);   // 箍带
          pen.strip(bx + (bw >> 1) - 2, tc + th, 4, 2, P.steelDark);                              // 排水阀
          if (kind === 'reservoir') pen.strip(bx + bw - 8, tc - 3, 3, 3, P.steelHi);              // 安全阀
          吊();
        } else if (kind === 'gen') {                                   // 柴油／发电机组：机体 + 鳍片 + 排气 + 底座
          const gh = Math.min(净高 - 5, 18), gy = 底 - gh;
          pen.strip(bx, gy, bw, gh, P.steelDark);
          pen.strip(bx + 1, gy + 1, bw - 2, 3, P.steelHi);
          for (let f = bx + 3; f < bx + bw - 3; f += 3) pen.strip(f, gy + 5, 1, gh - 8, P.steel);  // 散热鳍片
          pen.circle(bx + 5, gy + (gh >> 1), 3, P.steelLo);                                        // 端盖
          pen.strip(bx + bw - 6, gy - 4, 3, 5, P.steelLo);                                         // 排气管
          pen.strip(bx + bw - 7, gy - 5, 5, 2, P.steelHi);
          pen.strip(bx - 1, 底, bw + 2, 2, P.steelLo);                                             // 底座
          if (P.lampCol) pen.strip(bx + 2, gy + gh - 3, 2, 2, P.lampCol);                          // 运行指示灯
        } else if (kind === 'radiator') {                              // 散热器格栅 + 风扇罩
          pen.strip(bx, 顶 + 3, bw, 净高 - 7, P.steelDark);
          for (let f = bx + 2; f < bx + bw - 1; f += 2) pen.strip(f, 顶 + 4, 1, 净高 - 9, P.steelHi);
          pen.strip(bx, 顶 + 3, bw, 1, P.steelLo); pen.strip(bx, 底 - 4, bw, 1, P.steelLo);
          pen.circle(bx + (bw >> 1), 顶 + 3 + ((净高 - 7) >> 1), Math.min(5, (净高 >> 1) - 3), P.steel);
        } else if (kind === 'pipes') {                                 // 管线束 + 卡箍
          for (let j = 0; j < 3; j++) {
            const py = 顶 + 4 + j * 4; if (py > 底 - 2) break;
            pen.strip(bx, py, bw, 2, j === 1 ? P.steelHi : P.steelLo);
            for (let c2 = bx + 3; c2 < bx + bw - 2; c2 += 9) pen.strip(c2, py - 1, 1, 4, P.steelDark);
          }
        } else if (kind === 'box') {                                   // 接线箱／工具箱：盖、铰链、铭牌
          const bh = Math.min(净高 - 6, 13), byy = 顶 + 3 + (r3 * Math.max(0, 净高 - bh - 6) | 0);
          pen.strip(bx + 2, byy, bw - 6, bh, P.steelDark);
          pen.strip(bx + 2, byy, bw - 6, 1, P.steelHi);
          pen.strip(bx + 3, byy + 2, 1, bh - 4, P.steel);
          pen.strip(bx + bw - 6, byy + 3, 2, 2, P.steelLo);            // 锁扣
          if (P.paintHi) pen.strip(bx + 5, byy + bh - 3, 4, 2, P.paintHi);   // 铭牌／色标
          吊();
        } else if (kind === 'cyl') {                                   // 制动缸 + 活塞杆 + 吊架
          const cc = 顶 + 4 + (净高 >> 1), r4 = Math.min(5, (净高 >> 1) - 3);
          pen.circle(bx + 5, cc, r4, P.steelLo);
          pen.strip(bx + 5, cc - 1, bw - 12, 2, P.steelHi);
          pen.strip(bx + bw - 7, cc - 1, 6, 2, P.steel);
          pen.strip(bx + 5 - 1, cc - r4, 2, r4 * 2, P.steelDark);
        } else if (kind === 'exhaust') {                               // 排气筒／消音器（与车顶烟囱呼应）
          const eh = Math.min(净高 - 4, 16);
          pen.circle(bx + 6, 顶 + 4 + (eh >> 1), 5, P.steelDark);
          pen.strip(bx + 6, 顶 + 4, 10, eh, P.steelDark);
          pen.strip(bx + 4, 顶 + 4, 14, 2, P.steelHi);
          pen.strip(bx + 4, 顶 + 4 + eh - 2, 14, 2, P.steelHi);
          pen.strip(bx + 18, 顶 + 6, bw - 22, 3, P.steelLo);
        } else {                                                       // 检修梯（只挂在通透格边上，不挡道）
          pen.strip(bx + 2, 顶, 1, 净高, P.steelLo); pen.strip(bx + 7, 顶, 1, 净高, P.steelLo);
          for (let t = 顶 + 3; t < 底 - 1; t += 5) pen.strip(bx + 2, t, 6, 1, P.steelHi);
        }
      }
    },
    'gang-canopy'(pen, p, x, y, w, h) {
      const P = pen.p; skin(pen, p, x, y, w, h, 'rubber');
      for (let i = 0; i < h; i += 6) pen.strip(x, y + i, w, 2, i % 12 ? P.rubberHi : P.rubberLo);
      pen.strip(x, y + h - 2, w, 2, P.steelLo);
    },
    'handrail'(pen, p, x, y, w, h) {
      const P = pen.p; pen.strip(x, y, w, 2, P.steelHi); pen.strip(x, y + 2, w, 1, P.steelDark);
    },
    'glazing'(pen, p, x, y, w, h) { skin(pen, p, x, y, w, h, 'glass'); },
    'number-board'(pen, p, x, y, w, h) {
      const P = pen.p; skin(pen, p, x, y, w, h, 'steel');
      pen.strip(x + 2, y + 2, w - 4, h - 4, P.dark);
      pen.strip(x + 4, y + 4, 2, 2, P.hazard); pen.strip(x + 8, y + 4, 2, 2, P.hazard);
      pen.strip(x + 12, y + 6, 6, 1, P.steelHi); pen.strip(x + 22, y + 4, 3, 3, P.warn);
    },
    'hazard'(pen, p, x, y, w, h) {
      const P = pen.p;
      for (let i = 0; i < w; i += 6) pen.strip(x + i, y, 3, h, (i / 6 | 0) % 2 ? P.warn : P.dark);
    },
    'radiator'(pen, p, x, y, w, h) {
      const P = pen.p; skin(pen, p, x, y, w, h, 'steel');
      for (let i = 1; i < w; i += 4) pen.strip(x + i, y + 2, 2, Math.max(1, h - 4), P.steelLo);
      pen.strip(x, y, w, 2, P.steelHi); pen.strip(x, y + h - 2, w, 2, P.steelDark);
    },
    'livery'(pen, p, x, y, w, h) { pen.strip(x, y, w, h, pen.p.paintHi); },
    'buffer-beam'(pen, p, x, y, w, h) {
      const P = pen.p; skin(pen, p, x, y, w, h, 'steel');
      pen.strip(x, y + 1, w, 2, P.warn); pen.strip(x, y + h - 3, w, 3, P.steelDark);
    },
    'coupler'(pen, p, x, y, w, h) {
      const P = pen.p; skin(pen, p, x, y + 2, w, h - 4, 'steel');
      skin(pen, p, x + (w / 2 | 0) - 4, y, 8, h, 'steel');
      pen.strip(x, y + (h / 2 | 0) - 1, w, 2, P.steelHi);
      pen.strip(x + w - 2, y + 2, 2, h - 4, P.danger);
    },
    'draft-gear'(pen, p, x, y, w, h) { skin(pen, p, x, y, w, h, 'steel'); },
    'spring'(pen, p, x, y, w, h) {
      const P = pen.p;
      for (let i = 0; i < 3; i++) pen.strip(x, y + i * 2, w - i * 2, 2, i % 2 ? P.steelHi : P.steel);
    },
    'bolster'(pen, p, x, y, w, h) {
      skin(pen, p, x, y, w, h, 'steel'); pen.strip(x, y + h - 1, w, 1, pen.p.steelDark);
    },
    'walk'(pen, p, x, y, w, h) { pen.strip(x, y, w, h, pen.p.steelHi); },
    'roof-rib'(pen, p, x, y, w, h) { pen.strip(x, y, w, h, pen.p.steelLo); pen.strip(x, y, 1, h, pen.p.steelHi); },
    'cove'(pen, p, x, y, w, h) {
      const P = pen.p; pen.strip(x, y, w, h - 1, P.steelLo); pen.strip(x, y + h - 1, w, 1, P.panelEdge);
    },
    'walkway'(pen, p, x, y, w, h) {
      skin(pen, p, x, y, w, h, 'grate'); pen.strip(x, y, w, 1, pen.p.steelHi);
    },
  };
  // 所有「铺一面材质」的动作都从这里走：材质系统负责方向纹理、接缝、铆钉、缺陷、
  // 接触带磨损与雨痕，并且把每一笔裁剪在构件矩形内。
  function skin(pen, p, x, y, w, h, mat) {
    const sp = pen.sp || {}, a = sp.art || {};
    const ext = !!EXT[p.kind];
    // 阶段七：每节车自己的磨损系数（wear 流）。之前整列共用一个 wear，
    // 「使用状态逐层生成」就成了空话 —— 现在同一张配方下，新车与旧车真的差得出来。
    const wk = pen.wearK === undefined ? 1 : pen.wearK;
    // 涂装族（livery 流）：没手动指定涂装时，先取本车所属运营涂装族，再退回九类出厂色。
    const fam = pen.livery && LIVERY_FAM[pen.livery % LIVERY_FAM.length];
    const th = fam || TYPEHUE[pen.type] || [null, null];
    const hue = ext ? (LOWER[p.kind] ? (a.hue2 || a.hue || th[1]) : (a.hue || th[0])) : null;
    if (typeof CarMat === 'undefined') {                     // 材质层没加载时退回纯色，不报错
      pen.strip(x, y, w, h, pen.p[(KINDS[p.kind] || {}).mat === 'panel' ? 'panel' : 'steel']);
      return;
    }
    CarMat.paint(pen, mat || p.mat || 'steel', x, y, w, h, {
      seed: p.seedKey | 0, face: CarMat.faceOf(p.kind), zone: CarMat.zoneOf(p.kind),
      wear: (a.wear === undefined ? 0.5 : a.wear) * (ext ? 1 : 0.55) * wk,
      chip: (a.chip === undefined ? 0.5 : a.chip) * (ext ? 1 : 0.7) * wk,
      soot: (a.soot === undefined ? 0.35 : a.soot) * (ext ? 1 : 0.4) * wk,
      hue: hue || null, px: pen.px || 1,
    });
  }
  function drawPart(pen, p) {
    if (p.noDraw) return;
    const x = pen.X(p.x), y = pen.Y(p.y), w = p.w, h = p.h;
    if (!(w > 0 && h > 0)) return;
    const fn = R[p.kind];
    if (fn) fn(pen, p, x, y, w, h);
    else skin(pen, p, x, y, w, h);
    if (p.cut) {                              // 剖切面补硬边：一眼看出「这里被切开了」
      pen.strip(x, y, 1, h, pen.p.panelEdge); pen.strip(x + w - 1, y, 1, h, pen.p.panelEdge);
      pen.strip(x, y, w, 1, pen.p.panelLo);
    }
  }
  function draw(pen, sk) {
    pen.sp = sk.sp;
    pen.type = sk.car && sk.car.type;          // 外壳配色按车型走（用户没手动选涂装时）
    // 阶段七：本车的磨损系数与所属涂装族。wear 走自己的随机流（0.55~1.45），
    // livery 由编组层分配（相邻几节共享一族），两者都不碰几何也不碰通行。
    pen.wearK = sk.car && sk.car.wearK !== undefined ? sk.car.wearK
      : +(0.55 + (as(sk.car, 'wear') % 1000) / 1000 * 0.9).toFixed(3);
    pen.livery = sk.car ? sk.car.livery : null;
    const list = sk.parts.slice().sort((a, b) => a.layer - b.layer || a.x - b.x);
    for (const p of list) drawPart(pen, p);
    return list.length;
  }

  // 轮对转角：走过一个周长 = 一整圈。之前是 (trainX / (r*1.6)) % 1 这种「看着像在转」的系数，
  // 现在这条关系可以被闸门直接核对（角速度 × 半径 = 车速）。
  const rollAngle = (dist, r) => ((dist / (2 * Math.PI * r)) % 1 + 1) % 1;

  // 阶段七：取某一层自己的随机流种子。
  // 允许 artSeed 缺失（手搭的测试 car、旧存档），退化成 car.seed 的一个稳定派生值 ——
  // 退化也必须确定，不能每帧变，否则「同 seed 重载一致」这条就破了。
  const STREAMS = ['livery', 'fit', 'wear', 'life', 'wreck', 'prop', 'lamp'];
  function as(car, k) {
    if (car && car.artSeed && car.artSeed[k] !== undefined) return car.artSeed[k] | 0;
    let h = 2166136261 >>> 0;
    const s = String(k), base = ((car && car.seed) | 0) >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (base + h) >>> 0;
  }

  return { BASE, INVALID, badCfg, spec, KINDS, MANDATORY, MANDATORY_ID, skeleton, check, scale, draw, drawPart, measure, R, TYPEHUE,
    demoCar, demoRig, LAYER, gapsIn, touch, over, ovl, rollAngle, cavities, coverage, rasterize, as, STREAMS, LIVERY_FAM };
})();
