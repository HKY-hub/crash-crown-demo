// ============ 疾驰列车 · 渲染层（阶段三建层；阶段一起，车体剖面交给 js/car-art.js 的骨架） ============
// 视觉规范与 js/longmap-draw.js 一致：统一像素网格、有限色板、全部形状由 fillRect 组合，
// 不用平滑渐变、不用高清矢量线、不用预制图。
// 分层顺序（从后到前）：天空 → 三层远景（按世界 x 采样）→ 路基/轨道 → 车体外皮与窗洞 →
//                      车内剖面（壁板/地板/灯光/破损/家具）→ 车顶设备 → 角色与弹幕 → 氛围与速度线。
// 关键结构性事实：车窗是车体上「不画东西」的洞，世界在洞后面已经按 1:1 画好了，
// 所以每扇窗看到的必然是它自己那个世界位置的景 —— 不需要为窗单独算视差，也就不会算错。
const TrainDraw = (() => {
  // ---------- 有限色板：一套基色 + 三档光照派生 ----------
  const BASE = {
    sky: ['#79a7cc', '#6b4f52', '#0e1524'],
    steel: '#5d6b7a', steelHi: '#8494a4', steelLo: '#39434d', steelDark: '#242b33',
    panel: '#8d96a4', panelHi: '#b3bcc8', panelLo: '#5f6773', panelEdge: '#40474f',
    floorcloth: '#6d5f52', floorHi: '#8a7a69', floorLo: '#483d34',
    paint: '#b9b2a2', paintHi: '#d8d2c4', paintLo: '#7d776b',
    glass: '#3f5f74', glassHi: '#8fc0d8', glassDark: '#1b2730',
    fabric: '#7a3b3b', fabricHi: '#a05252', fabricLo: '#4a2323',
    fabricB: '#3b5170', fabricBHi: '#5a76a0', fabricBLo: '#22314a',
    crate: '#9a6b34', crateHi: '#bd8a4a', crateLo: '#5e3f1d',
    rubber: '#2f333a', rubberHi: '#464c56', rubberLo: '#1b1e23',
    grime: '#3a3630', grimeHi: '#57503f', blood: '#5e1f1f',
    ballast: '#4c4740', ballastHi: '#635d52', ballastLo: '#312d28',
    rail: '#9aa3ab', railHi: '#d0d8de', sleeper: '#4a3f33',
    wire: '#2b3138', pole: '#5a5f66', lamp: '#ffe6a8', lampCool: '#cfe0ff',
    sun: '#ffe9c0', shadowTint: '#1a2028',
    warn: '#d8a53a', danger: '#b4483a', hazard: '#c9c3b0',
    dark: '#0d1116', line: '#080b0f',
  };
  const TOD = {
    // 原来每条还带一个 `sky: 0/1/2`，看着像「该档用第几号天空」，实际全项目没有一处读它 ——
    // 天空走的是 BASE.sky → p.skyList（三档各派生一次）。留着只会让人以为改它能换天。
    day: { mul: 1.0, add: [8, 8, 10], amb: 'rgba(255,240,210,0.05)', grade: 'rgba(120,130,150,0.05)', lamp: 0.08 },
    dusk: { mul: 0.72, add: [30, 8, -14], amb: 'rgba(255,140,60,0.10)', grade: 'rgba(80,40,55,0.18)', lamp: 0.55 },
    night: { mul: 0.36, add: [-4, 4, 26], amb: 'rgba(70,90,180,0.10)', grade: 'rgba(8,14,38,0.34)', lamp: 1.0 },
  };
  // 三道山脊各自的 alpha 与绝对色只有一条来源：DayNight.SKY 表（连续相位）。
  // 量具（_ph7_space / _ph6_continuity）要认层，但不许自己抄数字 —— 走下面的 RIDGE_TAG。
  // 历史上这里是一张三档查表 RIDGE_A；第三阶段改成绝对色之后它已经不再被渲染读，
  // 留着只会让人以为改它能换画面（第一版就有人据此判断「夜晚已经拉开到 Δ6/Δ8」）。
  // 两层山脊的 alpha 曾经只有一个来源：渲染与所有量具都读这里。
  // 角色与 HUD 的配色只有一个来源：PX（js/pixel.js 的全局调色板）。
  // 角色与 HUD 的配色只有一个来源：PX（js/pixel.js 的全局调色板）。
  // 之前 train-draw 里自己写了一批 `p.cloth || '#4d6fe0'` 字面量兜底，而 p.skin / p.greenDark /
  // p.metal 三个键既不在色板里也没有兜底 —— canvas 对非法 fillStyle 是静默忽略、沿用上一笔，
  // 于是角色的头和枪口每帧都在用「上一次偶然留下的颜色」画，画面不报错、结构证明也查不出。
  const ACTOR = ['skin', 'skinShade', 'hair', 'cloth', 'clothShade', 'clothDark', 'vest',
    'zSkin', 'zSkinS', 'zSkinD', 'zSprintSkin', 'zEye', 'metal', 'muzzle', 'green', 'greenDark', 'greenText'];
  // 角色配色里「自己就是光源或读数」的四类：不跟着天黑变暗。
  // 只列 ACTOR 里真的存在的键 —— 早先把 lampCol/lampCool/warn 也写在这儿，
  // 但它们不属于 ACTOR、这行对它们是空转，白名单因此变得不可信（闸门按「假声明」判定时就报了三个假阳性）。
  const EMISSIVE = { zEye: 1, muzzle: 1, green: 1, greenText: 1 };
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb2hex = (r, g, b) => { const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); };
  // ---------- 相位 → 色板 ----------
  // day/dusk/night 不再是三个并列的调色预设，而是同一条连续曲线上的三个锚点取样：
  // 锚点处的 mul/add/lamp 与改造前的 TOD 表逐字相同，所以旧基线、旧闸门仍然可比的。
  const 有昼夜模块 = typeof DayNight !== 'undefined';
  if (!有昼夜模块) console.warn('[train-draw] 未加载 js/day-night.js：昼夜退回三档离散锚点，连续曲线与逐层系数全部失效。');
  const ANCHOR = { day: 0, dusk: 0.58, night: 0.90 };
  // 没加载 day-night.js 时的兜底相位：只保证三个锚点与旧 TOD 完全一致，其余旋钮取中性值。
  // 天空/山脊的绝对色在这里也必须给全，否则 skyRamp 会读到 undefined 画出 NaN 颜色 ——
  // canvas 对非法 fillStyle 是静默忽略，那种兜底会把「没加载模块」伪装成「画面正常」。
  const 兜底天空 = {
    day: { zenith: [64, 112, 164], upper: [104, 152, 196], horizon: [176, 202, 216],
      cloudLit: [246, 250, 252], cloudBase: [170, 186, 202],
      ridge: [[132, 162, 190], [100, 132, 162], [70, 98, 128]], ridgeRim: [[176, 198, 216], [142, 168, 192], [108, 134, 160]],
      ridgeA: [0.70, 0.86, 1.0], hazeA: 0.34, sunSize: 13, moonSize: 0 },
    dusk: { zenith: [38, 60, 118], upper: [122, 84, 106], horizon: [244, 140, 74],
      cloudLit: [252, 194, 138], cloudBase: [148, 90, 104],
      ridge: [[96, 98, 136], [68, 70, 104], [48, 50, 80]], ridgeRim: [[142, 132, 158], [106, 100, 130], [74, 70, 98]],
      ridgeA: [0.76, 0.89, 1.0], hazeA: 0.26, sunSize: 19, moonSize: 9 },
    night: { zenith: [10, 18, 44], upper: [18, 28, 60], horizon: [36, 46, 80],
      cloudLit: [72, 86, 122], cloudBase: [30, 40, 66],
      ridge: [[18, 26, 48], [14, 21, 40], [10, 16, 32]], ridgeRim: [[46, 60, 92], [34, 46, 74], [24, 34, 56]],
      ridgeA: [0.88, 0.95, 1.0], hazeA: 0.16, sunSize: 0, moonSize: 14 },
  };
  function 兜底相位(t) {
    const d = TOD[t] || TOD.dusk, s = 兜底天空[t] || 兜底天空.dusk;
    return Object.assign({ p: ANCHOR[t] === undefined ? 0.58 : ANCHOR[t], mul: d.mul, add: d.add.slice(),
      amb: [255, 240, 210], ambA: 0.05, grade: [120, 130, 150], gradeA: 0.05,
      farA: 0.26, nearA: 0.40,
      farK: 1, midK: 1, nearK: 1, shellK: 1, interiorK: 1, actorK: 1,
      sunA: t === 'night' ? 0 : 1, sunY: 0.6, sunCol: [255, 233, 192], moonA: t === 'night' ? 1 : 0,
      moonCol: [207, 224, 255],
      starA: t === 'night' ? 1 : 0, winGain: t === 'night' ? 0.28 : t === 'dusk' ? 0.72 : 1,
      reflectK: 1, lampGain: d.lamp, lampOn: 0.63, cityLit: t === 'night' ? 0.82 : 0,
      walk: t === 'night' ? [205, 228, 255] : t === 'dusk' ? [255, 235, 200] : [255, 255, 255],
      walkA: t === 'night' ? 0.34 : t === 'dusk' ? 0.26 : 0.14,
      isNight: t === 'night', isDusk: t === 'dusk' }, s);
  }
  function phaseOf(x) {
    if (!有昼夜模块) return 兜底相位(typeof x === 'string' ? x : 'dusk');
    return DayNight.phase(typeof x === 'number' ? x : ANCHOR[x] === undefined ? 0.58 : ANCHOR[x]);
  }
  function shadeC(rgbv, ph) { const a = ph.add; return rgb2hex(rgbv[0] * ph.mul + a[0], rgbv[1] * ph.mul + a[1], rgbv[2] * ph.mul + a[2]); }
  const rgbStr = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  function shade(hex, t) { return shadeC(hex2rgb(hex), phaseOf(t)); }
  // 逐层系数：在「已经按全局相位压过」的结果上再整体乘一个系数。
  // 为什么单独有这一层：第一阶段实测，把 night 帧拟合回 day 帧只要一次全屏逐通道线性变换
  // 就够（平均残差 4.4/255），十个场景层里九个的三档比值都挤在色板整体比值附近
  // —— 也就是说「每一层各自怎么随时间变」这件事当时根本不存在。
  function tint(hex, k) { if (k === 1) return hex; const v = hex2rgb(hex); return rgb2hex(v[0] * k, v[1] * k, v[2] * k); }
  function 子色板(o, k) {
    if (k === 1) return o;
    const q = {};
    // 自发光键不参与「逐层明度系数」：一层变暗是「这一层的表面反射更少」，
    // 而灯、枪口、读数、应急带自己是光源，跟着层系数一起缩就没有物理意义，
    // 也会让「按颜色认领灯光笔」的量具对不上（灯光晕的落笔色必须只有一个值）。
    for (const key of Object.keys(o)) {
      const v = o[key];
      q[key] = typeof v === 'string' && v[0] === '#' && !免层缩[key] ? tint(v, k) : v;
    }
    q.skyList = o.skyList.map(s => tint(s, k));
    q.ph = o.ph; q.tod = o.tod;
    return q;
  }
  const 免层缩 = { lamp: 1, lampCol: 1, lampCool: 1, lampCoolE: 1, actorOut: 1, actorOut2: 1,
    zEye: 1, muzzle: 1, green: 1, greenText: 1 };
  function buildPAL(ph) {
    const o = {};
    for (const k of Object.keys(BASE)) o[k] = typeof BASE[k] === 'string' && BASE[k][0] === '#' ? shadeC(hex2rgb(BASE[k]), ph) : BASE[k];
    // 天空三段走**绝对色表**（DayNight.SKY），不再过全局 mul/add。
    // 第三阶段的原因写在 day-night.js 里：走那条路夜里只会得到「深蓝底 + 更深的蓝」，
    // 天顶—上层—地平线—三道山脊的次序读不出来。
    o.skyList = [rgbStr(ph.zenith), rgbStr(ph.upper), rgbStr(ph.horizon)];
    o.skyRaw = { zenith: ph.zenith, upper: ph.upper, horizon: ph.horizon,
      cloudLit: ph.cloudLit, cloudBase: ph.cloudBase, ridge: ph.ridge, ridgeRim: ph.ridgeRim };
    o.tod = ph.p < 0.34 ? 'day' : ph.p < 0.65 ? 'dusk' : 'night';
    o.lamp = ph.lampGain;
    o.grade = 'rgba(' + ph.grade[0] + ',' + ph.grade[1] + ',' + ph.grade[2] + ',' + ph.gradeA + ')';
    o.amb = 'rgba(' + ph.amb[0] + ',' + ph.amb[1] + ',' + ph.amb[2] + ',' + ph.ambA + ')';
    // lamp 被「灯光强度」（一个数）占用了，所以灯的颜色另开一个键。
    // 之前有四处把 p.lamp 当颜色用 —— canvas 会静默忽略非法 fillStyle，于是那些灯画成了
    // 「上一次用的那个颜色」，肉眼看不出、结构证明也查不出，只有比对色板才会暴露。
    // 昼夜改造阶段二：灯色**不再过全局压暗**。它是光源，跟着天黑一起变暗就是第一阶段量到的
    // 「夜里没有任何一盏灯成为光源」（night 比底色亮 >70 的像素只剩 119 个，白天 1054 个）。
    // 它的明暗改由 lampGain 这一条独立旋钮控制：白天被日光照得相对不显眼，夜里满亮。
    o.lampCol = tint(BASE.lamp, 0.62 + 0.38 * ph.lampGain);
    o.lampCoolE = tint(BASE.lampCool, 0.62 + 0.38 * ph.lampGain);
    for (const k of ACTOR) o[k] = EMISSIVE[k] ? PX[k] : shadeC(hex2rgb(PX[k]), ph);
    // 剪影描边的唯一职责是「把人和背景分开」，所以它反过来取：背景亮就描暗线，背景暗就描亮线。
    // 亮线这里刻意取 lampCool 的出厂值而不是夜里派生值 —— 派生后只有 71 的亮度，描在 31 的地板上等于没描。
    // 极性翻转按 starA 连续混合，不是「到某档啪地换色」：描边只有 1px，整屏同时换色就是闪变。
    const 亮线 = hex2rgb(BASE.lampCool), 暗线 = hex2rgb(o.line);
    o.actorOut = rgb2hex(暗线[0] + (亮线[0] - 暗线[0]) * ph.starA,
      暗线[1] + (亮线[1] - 暗线[1]) * ph.starA, 暗线[2] + (亮线[2] - 暗线[2]) * ph.starA);
    // 第二圈取**反极性**：内圈暗时外圈亮、内圈亮时外圈暗（见 figure() 的注释）。
    o.actorOut2 = rgb2hex(亮线[0] + (暗线[0] - 亮线[0]) * ph.starA,
      亮线[1] + (暗线[1] - 亮线[1]) * ph.starA, 亮线[2] + (暗线[2] - 亮线[2]) * ph.starA);
    o.ph = ph;
    o.pFar = 子色板(o, ph.farK); o.pMid = 子色板(o, ph.midK); o.pNear = 子色板(o, ph.nearK);
    o.pShell = 子色板(o, ph.shellK); o.pInner = 子色板(o, ph.interiorK); o.pActor = 子色板(o, ph.actorK);
    return o;
  }
  const PAL = {};
  for (const t of Object.keys(TOD)) PAL[t] = buildPAL(phaseOf(t));
  PAL.at = buildPAL;
  // 每帧最多重建一次：p 连续变化，但一帧内所有绘制读的是同一份色板。
  let _缓存p = -1, _缓存板 = null;
  function PAL_AT(p) {
    if (p !== _缓存p || !_缓存板) { _缓存p = p; _缓存板 = buildPAL(phaseOf(p)); }
    return _缓存板;
  }
  const h2 = (seed, i) => { let x = (Math.imul(seed | 0, 2654435761) + Math.imul(i | 0, 40503)) >>> 0; x ^= x >> 13; return ((Math.imul(x, 1274126177)) >>> 0) % 1000 / 1000; };

  // ---------- 材质库（阶段三建八种，阶段一为骨架补 grate/wood/paint 三种） ----------
  // 每种都是「底色 + 该材质自己的纹理」，纹理一律整数矩形，同一 seed 逐帧一致（不闪）。
  const MAT = {
    panel(p, x, y, w, h, seed) {                       // 车厢壁板：宽间距竖向 ribs + 腰线 + 铆钉带
      fill(p.panel); rect(x, y, w, h);
      bands(x, y, w, h, 16, p.panelLo, 1);
      strip(x, y + h * 0.42 | 0, w, 1, p.panelEdge);
      strip(x, y, w, 2, p.panelHi); strip(x, y + h - 2, w, 2, p.panelEdge);
      ctx.fillStyle = p.panelHi; rivets(x + 3, y + h - 6, w, 14);
    },
    floorcloth(p, x, y, w, h, seed) {                  // 地板革：斜向磨损 + 接缝格
      fill(p.floorcloth); rect(x, y, w, h);
      for (let i = 0; i < w / 7; i++) { const gx = x + i * 7 + (h2(seed, i) * 3 | 0); strip(gx, y, 1, h, i % 3 ? p.floorHi : p.floorLo); }
      for (let gx = x + 34; gx < x + w; gx += 34) strip(gx, y, 1, h, p.floorLo);
      strip(x, y, w, 1, p.floorHi);
    },
    metal(p, x, y, w, h, seed) {                       // 金属骨架：拉丝 + 高光边 + 铆钉
      fill(p.steel); rect(x, y, w, h);
      for (let i = 0; i < h; i += 3) strip(x, y + i, w, 1, i % 6 ? p.steelLo : p.steelHi);
      strip(x, y, w, 1, p.steelHi); strip(x, y + h - 1, w, 1, p.steelDark);
      rivets(x + 2, y + (h / 2 | 0), w, 8, p.steelHi);
    },
    glass(p, x, y, w, h, seed) {                       // 玻璃：分带反光（不用平滑渐变）
      fill(p.glassDark); rect(x, y, w, h);
      const b = Math.max(2, h / 5 | 0);
      for (let i = 0; i < 5; i++) strip(x, y + i * b, w, b, i === 1 ? p.glass : i === 3 ? p.glassHi : p.glassDark);
      strip(x, y, w * 0.36 | 0, h * 0.5 | 0, p.glassHi);
      pxNoise(ctx, x, y + h - 4, w, 4, p.grime, seed, 0.18);
    },
    fabric(p, x, y, w, h, seed, blue) {                // 织物座椅面：横织纹 + 分带明暗
      const b0 = blue ? p.fabricB : p.fabric, b1 = blue ? p.fabricBHi : p.fabricHi, b2 = blue ? p.fabricBLo : p.fabricLo;
      fill(b0); rect(x, y, w, h);
      for (let i = 0; i < h; i += 2) strip(x, y + i, w, 1, i % 4 ? b2 : b1);
      strip(x, y, w, 2, b1); strip(x, y + h - 2, w, 2, b2);
    },
    crate(p, x, y, w, h, seed) {                       // 木货箱：横板条 + 端铁角 + 印字
      fill(p.crate); rect(x, y, w, h);
      for (let i = 0; i < h; i += 7) { strip(x, y + i, w, 1, p.crateLo); strip(x, y + i + 1, w, 5, p.crateHi); }
      strip(x, y, 3, h, p.steelLo); strip(x + w - 3, y, 3, h, p.steelLo);
      if (w > 26 && h > 16) { fill(p.crateLo); rect(x + (w / 2 | 0) - 7, y + (h / 2 | 0) - 3, 14, 6); fill(p.warn); rect(x + (w / 2 | 0) - 5, y + (h / 2 | 0) - 1, 4, 2); rect(x + (w / 2 | 0) + 1, y + (h / 2 | 0) - 1, 3, 2); }
    },
    rubber(p, x, y, w, h, seed) {                      // 橡胶风挡：手风琴褶
      fill(p.rubber); rect(x, y, w, h);
      for (let i = 0; i < w; i += 4) { strip(x + i, y, 2, h, p.rubberHi); strip(x + i + 2, y, 2, h, p.rubberLo); }
      strip(x, y, w, 1, p.rubberHi); strip(x, y + h - 1, w, 1, p.line);
    },
    grime(p, x, y, w, h, seed) {                       // 灰尘污渍：竖向流痕 + 霉点
      for (let i = 0; i < w / 6; i++) { const gx = x + i * 6 + (h2(seed, i + 91) * 4 | 0), hh = (h2(seed, i + 7) * h) | 0; strip(gx, y, 1, hh, p.grimeHi); }
      pxNoise(ctx, x, y, w, h, p.grime, seed + 3, 0.06);
    },
    // 阶段一骨架新增的三种「结构用」材质：仍是「底色 + 整数矩形纹理」，与上面八种同一套规则。
    grate(p, x, y, w, h, seed) {                        // 车底走道格栅：镂空格条，一眼看出踩在钢网上
      fill(p.steelLo); rect(x, y, w, h);
      for (let i = 0; i < w; i += 4) { strip(x + i, y, 2, h, p.steel); strip(x + i + 2, y + 1, 1, h - 1, p.line); }
      strip(x, y, w, 1, p.steelHi); strip(x, y + h - 1, w, 1, p.dark);
    },
    wood(p, x, y, w, h, seed) {                         // 木地板/甲板剖面：板缝 + 年轮短纹
      fill(p.floorcloth); rect(x, y, w, h);
      for (let i = 0; i < w; i += 18) strip(x + i, y, 1, h, p.floorLo);
      strip(x, y, w, 1, p.floorHi); strip(x, y + h - 1, w, 1, p.floorLo);
      for (let i = 3; i < w; i += 7) if (h2(seed, i) > 0.6) strip(x + i, y + 2, 4, 1, p.floorLo);
    },
    plastic(p, x, y, w, h, seed) {                        // 塑料/层压板（墙裙、门框）：哑光 + 细密横纹
      fill(p.panelLo); rect(x, y, w, h);
      for (let i = 0; i < h; i += 2) strip(x, y + i, w, 1, i % 4 ? p.steelLo : p.steel);
      strip(x, y, w, 1, p.steelHi); strip(x, y + h - 1, w, 1, p.line);
      for (let i = 6; i < w; i += 22) strip(x + i, y + 2, 1, h - 4, p.steelDark);
    },
    paint(p, x, y, w, h, seed) {                        // 烤漆平板（顶棚/内饰面）：极窄三段明度
      fill(p.paint); rect(x, y, w, h);
      strip(x, y, w, 1, p.paintHi); strip(x, y + h - 1, w, 1, p.paintLo);
      for (let i = 0; i < w; i += 22) strip(x + i, y + 1, 1, Math.max(1, h - 2), p.paintLo);
    },
  };
  let ctx = null;
  let INK = 0;                                          // 累计落墨面积：闸门用它实测「开放构件真的看得穿」
  const fill = c => { ctx.fillStyle = c; };
  const rect = (x, y, w, h) => { INK += Math.max(0, w) * Math.max(0, h); ctx.fillRect(px(x), px(y), px(w), px(h)); };
  const strip = (x, y, w, h, c) => { ctx.fillStyle = c; rect(x, y, w, h); };
  const bands = (x, y, w, h, gap, c, t) => { ctx.fillStyle = c; for (let i = x + gap; i < x + w; i += gap) rect(i, y, t, h); };
  const rivets = (x, y, w, gap, c) => { ctx.fillStyle = c; for (let i = x; i < x + w; i += gap) rect(i, y, 1, 1); };
  function mat(name, p, x, y, w, h, seed, opt) { (MAT[name] || MAT.metal).call(null, p, x, y, w, h, seed, opt); }

  // ---------- 车内家具：54 个 kind → 16 种画法配方 ----------
  const FIT = {
    seat(p, x, y, w, h, seed, blue) {                       // 座椅排
      const by = y + h;
      mat('fabric', p, x, y + 4, w * 0.62 | 0, h - 4, seed, blue);
      mat('fabric', p, x + (w * 0.66 | 0), y, (w * 0.34) | 0, h - 6, seed + 5, blue);
      strip(x, by - 3, w, 3, p.steelLo);
      rect(x + 3, by - 8, 2, 8); rect(x + w - 6, by - 8, 2, 8);
      ctx.fillStyle = p.steelDark;
    },
    bunk(p, x, y, w, h, seed) {                             // 卧铺（上/下）
      mat('metal', p, x, y, w, 3, seed);
      mat('fabric', p, x + 2, y + 3, w - 4, Math.max(3, h - 5), seed + 2);
      strip(x + 4, y + 3, w * 0.3 | 0, Math.max(2, h - 6), p.paintHi);       // 被子
      strip(x + w - 14, y + 4, 10, Math.max(2, h - 7), p.hazard);            // 枕头
      bands(x, y + 3, w, h - 3, 2, p.floorLo, 1);
    },
    box(p, x, y, w, h, seed) { mat('crate', p, x, y, w, h, seed); },
    cabinet(p, x, y, w, h, seed) {                          // 立柜/药柜/储物
      mat('panel', p, x, y, w, h, seed);
      strip(x + (w / 2 | 0), y + 2, 1, h - 4, p.panelEdge);
      rect(x + (w / 2 | 0) - 3, y + (h / 2 | 0), 2, 2); rect(x + (w / 2 | 0) + 2, y + (h / 2 | 0), 2, 2);
      if (h > 40) { fill(p.glassDark); rect(x + 3, y + 4, w - 6, 12); mat('glass', p, x + 3, y + 4, w - 6, 12, seed); }
    },
    barrel(p, x, y, w, h, seed) {                           // 桶/罐
      fill(p.steelLo); rect(x, y, w, h);
      bands(x, y, w, h, 6, p.steelHi, 2);
      strip(x, y + 2, w, 2, p.warn); strip(x, y + h - 4, w, 2, p.steelDark);
      pxCircle(ctx, x + w / 2, y, w / 2); ctx.fillStyle = p.steel; rect(x, y - 1, w, 3);
    },
    table(p, x, y, w, h, seed) {                            // 桌/工作台
      strip(x, y, w, 3, p.crateHi); strip(x, y + 3, w, 1, p.crateLo);
      rect(x + 3, y + 4, 2, h - 4); rect(x + w - 5, y + 4, 2, h - 4);
      ctx.fillStyle = p.crate; rect(x + w * 0.3 | 0, y + 6, 6, 3);
    },
    counter(p, x, y, w, h, seed) {                          // 吧台/服务台
      mat('crate', p, x, y + 4, w, h - 4, seed);
      strip(x - 2, y, w + 4, 4, p.paintHi); bands(x, y + 8, w, h - 8, 9, p.crateLo, 1);
    },
    rack(p, x, y, w, h, seed) {                             // 行李架/管架
      mat('metal', p, x, y, w, 2, seed);
      for (let i = 0; i < 3; i++) strip(x + 2 + i * (w / 3 | 0), y + 2, 1, h - 2, p.steelLo);
      mat('crate', p, x + 4, y + 2, w * 0.24 | 0, Math.max(4, h - 4), seed + 1);
    },
    partition(p, x, y, w, h, seed) {                        // 隔断/舱门/立柱
      mat('panel', p, x, y, w, h, seed);
      if (w <= 20) { strip(x + w - 1, y, 1, h, p.panelEdge); rect(x + w + 1, y + h * 0.45 | 0, 2, 2); }
    },
    machine(p, x, y, w, h, seed) {                          // 机器/发电机/控制台
      mat('metal', p, x, y, w, h, seed);
      fill(p.dark); rect(x + 3, y + 4, w - 6, (h * 0.34) | 0);
      for (let i = 0; i < 4; i++) rect(x + 5 + i * 4, y + 6, 2, 2);
      strip(x, y + h - 4, w, 2, p.steelDark);
      rect(x + w - 8, y + h - 9, 4, 4);
    },
    screen(p, x, y, w, h, seed) {                           // 监控屏/仪表
      mat('metal', p, x, y, w, h, seed);
      mat('glass', p, x + 2, y + 2, w - 4, (h * 0.55) | 0, seed);
      for (let i = 0; i < 3; i++) rect(x + 4 + i * 5, y + h - 6, 3, 3);
    },
    gurney(p, x, y, w, h, seed) {                           // 担架/推车
      strip(x, y + 2, w, 3, p.paintHi); mat('fabric', p, x + 2, y + 5, w - 4, 3, seed, true);
      rect(x + 4, y + 8, 2, h - 12); rect(x + w - 6, y + 8, 2, h - 12);
      pxCircle(ctx, x + 6, y + h - 2, 2); pxCircle(ctx, x + w - 6, y + h - 2, 2);
      ctx.fillStyle = p.steelDark;
    },
    cage(p, x, y, w, h, seed) {                             // 笼式/栅栏/安检门
      mat('metal', p, x, y, 3, h, seed); mat('metal', p, x + w - 3, y, 3, h, seed);
      bands(x + 3, y, w - 6, h, 5, p.steelLo, 1);
      strip(x, y, w, 3, p.steelHi);
      if (h > 60) { strip(x + 3, y + h * 0.4 | 0, w - 6, 2, p.warn); }
    },
    luggage(p, x, y, w, h, seed) {                          // 堆叠行李箱：分格 + 提手 + 铜扣
      for (let i = 0, yy = y + h; yy > y; i++) {
        const ch = Math.min(9, y + h - yy + 9), cw = w - i * 3;
        mat('crate', p, x + i * 2, yy - ch, cw, ch - 1, seed + i);
        strip(x + cw / 2 | 0, yy - ch, 5, 2, p.warn);
        yy -= ch + 1;
      }
    },
    coil(p, x, y, w, h, seed) {                             // 盘卷水带/线缆：同心方环
      fill(p.rubberLo); rect(x, y, w, h);
      for (let i = 0; i < 4; i++) {
        const t = i * 2;
        strip(x + t, y + t, w - t * 2, 1, i % 2 ? p.rubberHi : p.rubber);
        strip(x + t, y + h - t - 1, w - t * 2, 1, p.rubber);
        strip(x + t, y + t, 1, h - t * 2, p.rubber);
        strip(x + w - t - 1, y + t, 1, h - t * 2, i % 2 ? p.rubberHi : p.rubber);
      }
      rect(x + (w / 2 | 0) - 1, y + (h / 2 | 0) - 1, 3, 3); ctx.fillStyle = p.steelHi;
    },
    sack(p, x, y, w, h, seed) {                             // 麻袋/散落软包
      fill(p.crateLo); rect(x, y + 2, w, h - 2);
      pxCircle(ctx, x + w * 0.3, y + h * 0.55, w * 0.3); ctx.fillStyle = p.floorHi;
      pxCircle(ctx, x + w * 0.68, y + h * 0.5, w * 0.28); ctx.fillStyle = p.floorHi;
      pxNoise(ctx, x, y + 2, w, h - 2, p.floorLo, seed, 0.14);
    },
    cart(p, x, y, w, h, seed) {                             // 手推车/平板车
      mat('metal', p, x, y + h * 0.45 | 0, w, 3, seed);
      rect(x + 2, y + 2, 2, h * 0.45 | 0); ctx.fillStyle = p.steelLo;
      pxCircle(ctx, x + 6, y + h - 3, 3); pxCircle(ctx, x + w - 6, y + h - 3, 3); ctx.fillStyle = p.steelDark;
      mat('crate', p, x + w * 0.25 | 0, y - 2, w * 0.5 | 0, (h * 0.5) | 0, seed + 4);
    },
  };
  const FITMAP = {
    crateStack: 'box', trunk: 'box', strappedCase: 'box', palletStack: 'box', crateWall: 'box', cargoNet: 'box',
    sackPile: 'sack', blanket: 'sack', luggageSet: 'luggage', personalKit: 'luggage', hoseCoil: 'coil',
    handcart: 'cart', forkPallet: 'cart',
    shelfRow: 'cabinet', medCabinet: 'cabinet', dishCabinet: 'cabinet', toolCabinet: 'cabinet', armorLocker: 'cabinet',
    seatRow: 'seat', dinerTable: 'table', sideTable: 'table', workbench2: 'table',
    rack: 'rack', pipeRack: 'rack', pipeBundle2: 'rack', potRack: 'rack', curtainRail: 'rack', curtainTrack: 'rack',
    partition: 'partition', compartmentDoor: 'partition', stallPartition: 'partition', poleGroup: 'partition',
    strapPost: 'partition', cameraMast: 'partition',
    berthUpper: 'bunk', berthLower: 'bunk', quarantineFrame: 'bunk',
    barCounter: 'counter', kitchenUnit: 'counter', barricade2: 'counter',
    gurney: 'gurney', monitorCart: 'gurney', pillPack: 'sack',
    monitorRack: 'screen', cabWindow: 'screen', checkGate: 'cage', cageSection: 'cage',
    generatorSet: 'machine', consoleBank: 'machine', panelBank: 'machine', pilotSeat: 'seat',
    throttleLever: 'partition', '整流罩': 'machine', barrelRow: 'barrel', bioBarrel: 'barrel',
  };
  const PROP = { bottle: [3, 8], cup: [4, 4], paper: [7, 2], shoe: [7, 4], toy: [6, 6], notebook: [6, 4], pillPack: [5, 3], blanket: [8, 4] };

  // 阶段三：客车样板走 CarFit（构件级 + 变体 + 接触阴影），其余类型暂留 FIT 配方（阶段四分化）
  const FITC = typeof WeakMap === 'function' ? new WeakMap() : null;
  function fitFor(car) {
    if (FITC && FITC.has(car)) return FITC.get(car);
    const fit = CarFit.build(car, skeletonFor(car), car.furniture);
    if (FITC) FITC.set(car, fit);
    return fit;
  }
  // 阶段五：生活细节与灾难叙事（小件 / 脏乱 / 破损 / 事件组合），坐在家具之上
  const LIFEC = typeof WeakMap === 'function' ? new WeakMap() : null;
  function lifeFor(car, M) {
    if (typeof CarLife === 'undefined') return null;
    if (LIFEC && LIFEC.has(car)) return LIFEC.get(car);
    const life = CarLife.build(car, skeletonFor(car), fitFor(car), M);
    if (LIFEC) LIFEC.set(car, life);
    return life;
  }
  // 阶段六：光照层要读「列车此刻跑到哪」，所以要按行程重算。缓存键里带线位置，
  // 而且每节车按「自己那条线」错开（+car.x0）—— 若全列共用同一个档位，所有可见车
  // 会在同一帧一起过期，实测那一帧要 11ms，等于每 2.4 秒卡一下。
  const LIC = typeof WeakMap === 'function' ? new WeakMap() : null;
  function lightFor(car, M, S) {
    if (typeof CarLife === 'undefined' || typeof CarLight === 'undefined') return null;
    const box = LIC && LIC.get(car);
    // 缓存戳必须带上「当前点亮比例」：灯光表里含「哪几盏灯亮」，而那是时间的函数。
    // 只按位置建戳的话，时间变了表却不重建 —— 表现就是灯该亮的那几帧没亮、
    // 回访同一节车时前后两次画得不一样（_ph8_revisit 会立刻抓到）。
    // 取整到 1/200 档：点亮集合只可能在 rank 跨过阈值时改变，比这更细的相位变化不影响表内容。
    const 段 = (typeof DayNight !== 'undefined' ? Math.round(DayNight.phase(S && S.day ? S.day.p : 0.58).lampOn * 200) : 0);
    const stamp = (((S.trainX + car.x0) / 512) | 0) + '|' + 段;
    if (box && box.stamp === stamp) return box.L;
    const L = CarLight.build(car, skeletonFor(car), fitFor(car), lifeFor(car, M), M, S);
    if (LIC) LIC.set(car, { L, stamp });
    return L;
  }
  function furniture(p, car, X, Y, trainX, xf, far) {
    if (typeof CarFit !== 'undefined') {
      CarFit.draw(pen(ctx, p, X, Y, trainX, 2), fitFor(car), { xform: xf, far: far });
      return;
    }
    for (const f of car.furniture) {
      const rec = FIT[FITMAP[f.kind] || 'box'];
      rec(p, X(f.x), Y(f.y), f.w, f.h, (car.seed + f.x) | 0, /berth|seat|bunk/.test(f.kind) && car.chapter % 2 === 1);
    }
    for (const q of car.props) {
      const d = PROP[q.kind] || [5, 4];
      strip(X(q.x), Y(q.y), d[0], d[1], h2(q.seed, 1) > 0.5 ? p.hazard : p.floorLo);
    }
  }

  // ---------- 破损 / 污渍 / 灯光 ----------
  function damage(p, car, X, Y) {
    for (const d of car.damage) {
      const x = X(d.x), y = Y(d.y), w = d.w, h = Math.max(1, d.h);
      if (d.kind === 'scuff') pxNoise(ctx, x, y, w, h, p.grime, d.seed, 0.22);
      else if (d.kind === 'stain') { strip(x, y, w, h, p.grimeHi); strip(x, y, w, 1, p.grime); }
      else if (d.kind === 'crack') { for (let i = 0; i < w; i += 3) strip(x + i, y + (h2(d.seed, i) * h | 0), 2, 1, p.line); }
      else if (d.kind === 'blood') { pxNoise(ctx, x, y, w, h, p.blood, d.seed, 0.4); strip(x, y + h, w * 0.3 | 0, 3, p.blood); }
      else if (d.kind === 'dent') { strip(x, y, w, 2, p.panelEdge); strip(x, y + 2, w, 1, p.panelHi); }
      else if (d.kind === 'wire') { for (let i = 0; i < h; i += 2) strip(x + (h2(d.seed, i) * 4 | 0), y + i, 1, 2, p.wire); }
      else if (d.kind === 'glass') { for (let i = 0; i < 5; i++) strip(x + h2(d.seed, i) * w | 0, y + h2(d.seed, i + 3) * h | 0, 2, 1, p.glassHi); }
    }
  }
  // 生活层里那些「本该自己发光」的构件（应急地灯带、蜡烛、警示灯、阅读灯）由这里接管：
  // 骨架与家具画完、灯光层最后叠加，所以断电时只有 lamp==='safe' 的还在亮。
  function lifeLamps(p, X, Y, S, LF) {
    if (typeof CarLife === 'undefined' || !LF) return;
    // 直接用 scene 已经缓存好的那一份生活层：这里原来每次重新 build 一遍，
    // 只为挑出几个发光构件，长编组下是纯粹的浪费。
    // 断电标志由玩法层在事件开始/结束时置 0/1（S.blackout），渲染层只读它 ——
    // 之前这里判的是 S.active.kind，于是玩法层那个 S.blackout 一直是没人用的死状态。
    const dark = !!S.blackout;
    for (const q of LF.parts) {
      if (!q.lamp) continue;
      if (dark && q.lamp !== 'safe') continue;                    // 断电：只剩应急带与明火
      const x = X(q.x), y = Y(q.y), r = q.glow || 12;
      ctx.globalAlpha = q.lamp === 'safe' ? 0.20 : 0.14;
      fill(p.lampCoolE); rect(x - r / 2, y - r / 3, q.w + r, q.h + r * 0.7);
      ctx.globalAlpha = 1;
    }
  }
  function lights(p, car, X, Y, tsec, dark) {
    for (let li = 0; li < car.lights.length; li++) {
      const L = car.lights[li];
      const x = X(L.x), y = Y(L.y);
      // L.on = 这盏灯线路完好（生成期定死，216 盏里 136 盏）；
      // 此刻亮不亮 = 线路完好 且 它的稳定 rank 落在当前启用比例内（DayNight.lampLit）。
      // 拆成两件事的原因：第一阶段实测三档的灯笔数与覆盖像素一字不差（547 笔 / 24760 px），
      // 也就是「夜里让更多灯亮起来」当时根本没有实现。
      const on = (!有昼夜模块 || DayNight.lampLit(p.ph, car.seed | 0, car.i, L, li)) && !dark;
      const flick = L.flicker ? (Math.sin(tsec * L.flicker + L.x) > -0.35 ? 1 : 0.25) : 1;
      strip(x - 7, y, 14, 2, on ? p.lampCol : p.steelLo);
      if (!on || flick < 0.4) continue;
      ctx.globalAlpha = 0.10 * p.lamp * flick + 0.04;
      fill(p.lampCoolE); rect(x - 22, y + 2, 44, 46); rect(x - 12, y + 48, 24, 34);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 车体剖面：几何与结构证明都在 js/car-art.js，这里只提供画笔 ----------
  // 为什么要拆开：骨架必须能被「无头几何证明」（悬空/穿插/覆盖/对齐/落轨），
  // 而绘制函数做不到这一点 —— 之前轮子悬在轨面上方 33px、同一转向架两轮相互穿插、
  // 车顶金属皮被一条负高度 fillRect 整块盖掉，都是「只有画面、没有结构」的结果。
  const SK = typeof WeakMap === 'function' ? new WeakMap() : null;
  let SP = null;
  function spec() {
    if (!SP) SP = CarArt.spec({
      unit: 20, bodyH: TrainGen.MOVE.h, wallThk: TrainGen.WALL,
      underY: TrainGen.UNDER, railY: TrainGen.UNDER + 42,
    });
    return SP;
  }
  function skeletonFor(car) {
    TrainGen.carWindows(car);                        // 先填洞口缓存，骨架自己一个字段都不写
    if (SK && SK.has(car)) return SK.get(car);
    const sk = CarArt.skeleton(car, spec());
    if (SK) SK.set(car, sk);
    return sk;
  }
  function pen(g, p, X, Y, trainX, px) {
    ctx = g;
    return {
      p, X, Y,
      fill: c => { ctx.fillStyle = c; },
      // 灯光层要按不透明度叠光，pen 原来只暴露「设颜色 + 画矩形」，没有 alpha 通道
      alpha: a => { ctx.globalAlpha = Math.max(0, Math.min(1, a)); },
      rect: (x, y, w, h) => rect(x, y, w, h),
      strip: (x, y, w, h, c) => strip(x, y, w, h, c),
      bands: (x, y, w, h, gap, c, t) => bands(x, y, w, h, gap, c, t),
      rivets: (x, y, w, gap, c) => rivets(x, y, w, gap, c),
      mat: (n, x, y, w, h, s, op) => mat(n, p, x, y, w, h, s, op),
      hasMat: n => !!MAT[n],
      circle: (cx, cy, r, c) => { ctx.fillStyle = c || p.steel; pxCircle(ctx, cx, cy, r); },
      noise: (x, y, w, h, c, s, d) => pxNoise(ctx, x, y, w, h, c, s, d),
      h2, px: px || 1,
      roll: r => CarArt.rollAngle(trainX || 0, r),
    };
  }
  // ---------- 编组两端的外形 ----------
  // 2026-09-27 那轮给两端的是**身份**（车尾 `M.rearSpawn` 的尸潮通道、车头 `M.headGoal` 的
  // 驾驶室控制台与地面引导带），不是**外形**：`car-art.js` 里没有任何 isHead/isRear 分支，
  // 机车只是比客车高 18px 的一个盒子，两端朝外那一面都是同一堵平通过台墙。
  // 所以这里在绘制层补外形，**不新增骨架构件** —— 构件会进可行走/碰撞那张图，而合同要求
  // 昼夜与美术阶段一律不得改碰撞、跳跃、主路线与检查点。
  function 端头(p, M, S, X, Y, lo, hi) {
    const q = p.pShell, 夜 = p.ph && p.ph.lampOn > 0.05;
    for (const car of M.cars) {
      if (car.isHead && car.x1 >= lo && car.x1 <= hi) {
        const x = X(car.x1), 顶 = Y(car.yRoof), 底 = Y(car.yFloor + 14);
        // 司机室顶罩：高出可行走甲板 10px 的一截。这是「一眼看出是车头」的关键 ——
        // 端头的一切构件都画在甲板线以下的话，剪影和任何一节客车完全一样，白做。
        fill(q.paint); rect(x + 2, 顶 - 10, 30, 12);
        fill(q.paintHi); rect(x + 2, 顶 - 10, 30, 2);
        for (let i = 0; i < 9; i++) {                       // 鼻部：下直上收，正面读得出前倾
          const y = 底 - 4 - (i + 1) * 18, 深 = i < 4 ? 30 : 30 - (i - 3) * 5;
          fill(q.paint); rect(x + 2, y, 深, 18);
        }
        rect(x, 顶 + 2, 4, 底 - 顶 - 6);                     // 与车体的接缝
        fill(q.paintLo); rect(x + 26, 顶 + 24, 6, 底 - 顶 - 40);   // 正面右缘一道暗边，鼻部才有厚度
        fill(q.glassDark); rect(x + 5, 顶 - 6, 12, 9); rect(x + 19, 顶 - 6, 9, 9);   // 前窗（左/右）
        fill(夜 ? q.lampCol : q.glass); rect(x + 5, 顶 - 6, 12, 3); rect(x + 19, 顶 - 6, 9, 3);
        fill(q.metal); rect(x + 3, 顶 - 16, 16, 6); fill(夜 ? q.lampCol : q.steelHi);
        rect(x + 6, 顶 - 15, 8, 4);                          // 顶灯
        fill(q.paintHi); rect(x + 2, 顶 + 58, 28, 3); rect(x + 2, 顶 + 96, 26, 2);   // 两道腰线绕到鼻部
        fill(q.steelLo);                                     // 排障器：从裙板斜到轨面
        for (let i = 0; i < 6; i++) rect(x + 14 + i * 4, 底 + 4 + i * 9, 16 - i * 2, 11);
        fill(q.metal); rect(x + 24, 底 + 2, 16, 7); fill(q.steelDark); rect(x + 38, 底 + 1, 5, 9);
        if (夜) {                                            // 前照灯的光锥
          ctx.globalAlpha = 0.12; fill(q.lampCool); rect(x + 12, 顶 - 20, 150, 16);
          ctx.globalAlpha = 0.07; rect(x + 12, 顶 - 26, 260, 28); ctx.globalAlpha = 1;
        }
      }
      if (car.isRear && car.x0 >= lo - 40 && car.x0 <= hi) {
        const x = X(car.x0), 顶 = Y(car.yRoof), 底 = Y(car.yFloor + 14);
        fill(q.paint); rect(x - 21, 顶 - 4, 21, 6); rect(x - 19, 顶 - 9, 19, 6); rect(x - 16, 顶 - 14, 16, 6);
        fill(q.paintHi); rect(x - 21, 顶 - 4, 21, 1); rect(x - 19, 顶 - 9, 19, 1); rect(x - 16, 顶 - 14, 16, 1);
        fill(q.metal); rect(x - 9, 顶 - 36, 1, 22);              // 无线电鞭天线：行李车/守车端部本来就有
        fill(q.steelHi); rect(x - 11, 顶 - 18, 5, 4);            // 天线底座
        for (let i = 0; i < 6; i++) {                          // 端折棚：六道风挡
          fill(i % 2 ? q.paintLo : q.paint); rect(x - 17, 顶 + 2 + i * 24, 17, 22);
        }
        fill(q.paintHi); rect(x - 17, 顶 + 2, 17, 2); rect(x - 17, 底 - 8, 17, 2);
        fill(q.steelLo); rect(x - 15, 顶 + 40, 12, 92);        // 端门
        fill(q.glassDark); rect(x - 13, 顶 + 46, 8, 14);
        fill(q.danger);                                        // 反光斜条
        for (let i = 0; i < 5; i++) rect(x - 16 + i * 3, 底 - 30 + i * 5, 3, 5);
        fill(夜 ? q.lampCol : q.danger); rect(x - 17, 顶 - 6, 6, 5); rect(x - 17, 底 - 46, 6, 5);
        fill(q.metal); rect(x - 32, 底 + 2, 15, 7);            // 车钩
        fill(q.steelDark); rect(x - 26, 底 + 9, 3, 9); rect(x - 24, 底 + 14, 8, 2);   // 垂下的风管
      }
    }
  }

  function shell(p, M, S, car, X, Y) {
    const sk = skeletonFor(car);
    CarArt.draw(pen(ctx, p, X, Y, S.trainX, S.px || 2), sk);
    // 窗帘是「挂在窗前的织物」，不是墙体构件，所以留在骨架之外（阶段三改成挂导轨上的独立构件）
    for (const o of sk.openings) {
      if (o.kind !== 'window' || h2(car.seed, o.x | 0) <= 0.62) continue;
      const cw = (o.w * (0.3 + h2(car.seed, o.x | 0) * 0.4)) | 0;
      mat('fabric', p, X(o.x), Y(o.y) + 3, cw, o.h - 6, o.x | 0, car.chapter % 2 === 0);
    }
  }

  // ---------- 车顶设备 ----------
  function roofGear(p, M, car, X, Y) {
    for (const rb of car.roofBlocks) {
      const x = X(rb.x), y = Y(car.yRoof - rb.h), w = rb.w;
      if (rb.kind === 'duct') { mat('metal', p, x, y, w, rb.h, rb.x | 0); bands(x + 3, y, w - 6, rb.h, 7, p.steelHi, 1); }
      else if (rb.kind === 'vent') { mat('metal', p, x, y + 2, w, rb.h - 2, rb.x | 0); for (let i = 2; i < w - 2; i += 4) strip(x + i, y, 2, 3, p.steelDark); }
      else if (rb.kind === 'tank') { mat('metal', p, x, y, w, rb.h, rb.x | 0); strip(x, y + 2, w, 1, p.warn); pxCircle(ctx, x + 2, y + rb.h / 2, 2); ctx.fillStyle = p.steelHi; }
      else { mat('pipe', p, x, y + rb.h - 4, w, 4, rb.x | 0); mat('metal', p, x + 2, y, 2, rb.h - 2, rb.x | 0); mat('metal', p, x + w - 4, y, 2, rb.h - 2, rb.x | 0); }
    }
    for (const g of car.gantries) {                          // 低限高横梁：压着走道，逼回车内的岔路
      const x = X(g.x), y = Y(car.yRoof - 34);
      mat('metal', p, x, y, g.w, 6, g.x | 0);
      for (let i = 0; i < g.w; i += 6) strip(x + i, y + 6, 2, 28, p.steelLo);
      for (let i = 0; i < g.w; i += 8) strip(x + i, y - 3, 5, 3, i % 16 ? p.warn : p.dark);
    }
    // 梯子以前**只有物理、没有画面**：car.ladders 在渲染层一处都没出现，
    // 于是「能爬」这件事在屏幕上完全看不出来 —— 正是「不许用看不见的梯子通过测试」要防的那种。
    // 这里补上：两根立柱 + 等距横档，顶部一道与塔口护栏同色的提示，沿用同一套描边与用色。
  }

  // 梯子单独一层，而且必须排在「结构实体」之后。它的工作就是穿过顶板与地板那两条 12px 的板：
  // 排在板之前时，洞口的盖板与顶板会把它自己的上端 12 行整段埋掉 —— 夜间实测那 12 行的
  // 净亮度贡献只剩 0.9（其余行有中位 10），于是「梯子明明画了，跨过车顶的那一截却看不见」。
  function ladders(p, M, S, X, Y, lo, hi) {
    if (S.dbg && S.dbg.ladder === false) return;   // 纯视角开关：只让这一层不落笔，构件数据一份不改
    for (const car of M.cars) {
      if (car.x1 + 40 < lo || car.x0 - 40 > hi) continue;
      for (const L2 of (car.ladders || [])) {
        const x = X(L2.x), yTop = Y(Math.min(L2.y0, L2.y1)), yBot = Y(Math.max(L2.y0, L2.y1));
        const h = Math.max(4, yBot - yTop);
        // 竖梁两头都要压得住：梁与钢制顶板是同族金属色，交叉行几乎同值。
        // 与角色描边同一个办法 —— 亮梁 + 单侧暗边，落在亮面和暗面上都留一条边界。
        // 试过再往外面加一道亮沿：那一格常常正对着钢制内壁（实测背景就是 steelHi 本身），
        // 亮沿贴在同色墙上等于没贴，反而把真正起作用的暗边挤进一格，V5 的 10 分位从 3.1 掉到 0.9。
        strip(x - 3, yTop, 1, h, p.dark); strip(x + 13, yTop, 1, h, p.dark);
        strip(x - 2, yTop, 2, h, p.steelHi); strip(x + 14, yTop, 2, h, p.steelHi);
        for (let i = 3; i < h - 1; i += 8) strip(x - 2, yTop + i, 18, 2, p.steel);
        // 固定件：每 24px 一道穿墙螺栓 + 顶底两个支座。
        // 没有它们，梯子看着像悬在洞里的两根线 —— 合同要求「爬梯贴附在车厢结构上、有明确固定点」。
        for (let i = 10; i < h - 6; i += 24) {
          strip(x - 5, yTop + i, 3, 2, p.steelDark); strip(x + 17, yTop + i, 3, 2, p.steelDark);
        }
        strip(x - 4, yBot - 2, 22, 3, p.steelDark);          // 底部支座（落在地板上）
        strip(x - 4, yTop - 3, 22, 3, L2.route ? p.warn : p.steelDark);   // 换层梯给一道亮色顶口
        if (L2.origin === 'emergency') {
          // 应急检修口：盖板被从里顶开、立在洞口边上，铅封是断的。
          // 少了这几笔，客车上的临时换层点和维修车的标配检修通道在画面上**完全同形** ——
          // 合同第七阶段第 3 条要的「临时装置必须解释来源」就只剩一个没人看的字段。
          // 盖板画在 x+18（洞口右沿之外、出梯落点 x+26 之前）：立着的盖板不能挡人落脚，
          // 也不能挡梯井，这一段是 audit 与家具避让都认过的净空。
          strip(x + 18, yTop - 12, 2, 12, p.steel);
          strip(x + 18, yTop - 12, 2, 1, p.steelHi);
          strip(x + 17, yTop - 1, 4, 2, p.steelDark);
          strip(x - 6, yTop + 2, 2, 4, p.danger);             // 断开的铅封把手
        }
      }
    }
  }
  MAT.pipe = function (p, x, y, w, h, seed) {
    fill(p.steel); rect(x, y, w, h);
    strip(x, y, w, 1, p.steelHi); strip(x, y + h - 1, w, 1, p.steelDark);
    for (let i = 0; i < w; i += 14) strip(x + i, y, 2, h, p.rust || p.steelLo);
  };

  // ---------- 沿途世界：三层视差 + 路基轨道，全部按世界 x 采样 ----------
  const GZ = TrainGen.UNDER + 42;                      // 世界里的钢轨顶面
  const ZONE = {
    edge: { far: 'hills', mid: 'pylon', near: 'scrub' }, suburb: { far: 'town', mid: 'houses', near: 'fence' },
    field: { far: 'hills', mid: 'field', near: 'crop' }, river: { far: 'hills', mid: 'water', near: 'reeds' },
    viaduct: { far: 'sky', mid: 'city', near: 'girder' }, industrial: { far: 'plant', mid: 'tankrow', near: 'pipe' },
    tunnel: { far: 'tunnel', mid: 'tunnel', near: 'tunnel' }, approach: { far: 'town', mid: 'station', near: 'signal' },
  };
  // 轨旁 1:1 高构件。比例按本作自己反解出来的：车顶到钢轨 248px ≈ 4.2m ⇒ 约 59px/m，
  // 所以一根 6m 的路灯就是 354px 高、顶在世界 96 附近。
  // 为什么非做不可：这一层原来所有构件的顶都压在世界 384 以下，而车顶线是 202、
  // 车窗带是 232~278 —— 「站在车顶看轨旁」等于什么都没有（四十七 §六.2 记的那条），
  // 往车窗里看也只看见一道平土坡（四十九 §五.1）。
  // 每种地貌只给一种它本来就该有的东西，间距取每 4 格一件（step=40 ⇒ 世界 160px ≈ 2.7m 一根，
  // 疏到一屏 2~3 件）：既有最强的「掠过」运动线索，又不至于在障碍带（172~202）上种成一片
  // 竖线、与车顶货箱抢形 —— 那正是合同第 7 条要分开的东西，判据见 _dt4_mid 第 7b 节。
  // ---------- 路基带：钢轨以下到世界底 ----------
  // 为什么非补不可：这一带原来只有 `fill(p.ballast); rect(0, gy, VW, VH-gy)` 一个矩形
  // 加顶部 10px 噪声，而站在车顶时相机把世界 450~560 整条都推进画面 —— 用户看图直接说
  // 「下面太空了」：屏底约四分之一高是一整块平色，既没有道床结构，也没有任何地貌差异。
  // 这里按地貌补真东西：枕木端头与道床肩、排水沟/电缆槽、轨旁杂草、里程标与检查井；
  // 桥梁段本来就没有路基（下面是空的），改画桥墩与横梁；隧道段画仰拱水沟与电缆桥架。
  // 全部按世界 x 取确定性哈希、只画面前这一段，每样都限量（一屏约 150 笔），
  // 反证开关 `S.dbg.ground=false` 与判据配套，见 tools/_check_ground_band.js。
  const 路基层 = {
    edge: { 肩: 1, 草: 1.0, 沟: 1, 管: 0, 标: 1 },
    suburb: { 肩: 1, 草: 0.6, 沟: 1, 管: 1, 标: 1 },
    field: { 肩: 1, 草: 1.4, 沟: 1, 管: 0, 标: 2 },
    river: { 肩: 1, 草: 1.6, 沟: 1, 管: 0, 标: 1 },
    industrial: { 肩: 1, 草: 0.2, 沟: 0, 管: 1, 标: 1 },
    approach: { 肩: 1, 草: 0.3, 沟: 1, 管: 0, 标: 2 },
    viaduct: { 桥: 1 },
    tunnel: { 拱: 1, 沟: 1, 管: 1 },
  };
  const 哈希 = (n, s) => {
    let h = (Math.floor(n) * 374761393 + s * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function 路基细节(p, M, S, camX, gy, VW, VH, kind) {
    if (S && S.dbg && S.dbg.ground === false) return;
    const 底 = VH, 深 = 底 - gy;
    if (深 < 8) return;
    const 型 = 路基层[kind] || 路基层.edge;
    if (型.桥) {                                          // 桥上：下面本来就没有地面，画桥墩与横梁
      const 距 = M.poleStep * 3;
      for (let x = Math.floor(camX / 距) * 距; x < camX + VW + 距; x += 距) {
        const a = x - camX, 宽 = 14 + ((哈希(x, 3) * 6) | 0);
        fill(p.steelDark); rect(a - 宽 / 2, gy + 4, 宽, 底 - gy - 4);          // 墩身
        fill(p.panel); rect(a - 宽 / 2 - 3, gy + 4, 宽 + 6, 4);                 // 墩帽
        fill(p.rail); rect(a - 宽 / 2 + 1, gy + 4, 2, 底 - gy - 4);             // 受光棱
        for (let y = gy + 26; y < 底 - 10; y += 34) { fill(p.steel); rect(a - 宽 / 2 - 8, y, 宽 + 16, 3); }
      }
      fill(p.grime); rect(0, gy + 6, VW, 2);             // 梁底一道阴影，桥面与墩之间才接得上
      return;
    }
    // ⓪ 车底与钢轨之间那一条（世界 420~450）：车尾之外没有车体挡着，这一段原来就是
    //    一整块 ballastLo 平底 —— 用户说的「下面太空」主要指它，先给它三层道床与碎料。
    const 肩顶 = gy - 30;
    if (肩顶 > 0) {
      fill(p.ballastLo); rect(0, 肩顶, VW, 30);
      fill(p.ballast); rect(0, 肩顶 + 8, VW, 3); rect(0, 肩顶 + 19, VW, 2);
      for (let i = 0; i < 52; i++) {
        const wx = Math.floor(camX / 11) * 11 + i * 11, r = 哈希(wx, 4);
        fill(r > 0.5 ? p.ballastHi : p.steelDark);
        rect(wx - camX, 肩顶 + 2 + ((r * 26) | 0), 2 + ((r * 2) | 0), 1);
      }
    }
    // ① 道床肩：轨枕两端往外摊下去的两条斜边（这一笔给整带一个结构，不再是一整块）
    fill(p.ballastHi);
    for (let x = 0; x < VW; x += 8) {
      const wx = camX + x, 坡 = 4 + ((wx / 22) | 0) % 3;
      rect(x, gy + 6 + 坡, 7, 1); rect(x, gy + 16 + (坡 >> 1), 6, 1);
    }
    // ② 枕木端头与砟堆颗粒（分两档明暗，近处大远处小）
    fill(p.sleeper);
    for (let x = Math.floor(camX / M.sleeperStep) * M.sleeperStep; x < camX + VW; x += M.sleeperStep)
      rect(x - camX + 3, gy + 5, 6, 5);
    fill(p.ballastLo);
    for (let i = 0; i < 46; i++) {
      const wx = Math.floor(camX / 13) * 13 + i * 13, r = 哈希(wx, 7);
      rect(wx - camX, gy + 10 + ((r * 26) | 0), 2 + ((r * 3) | 0), 2);
    }
    // ②b 亮砾：钢轨以下到排水沟之间那一截原来只有稀疏暗点，黄昏色板整体压到均亮 34，
    //     量具读出来的边能跟没画一样。真实道床在这里是「碎石反光」——石英颗粒受光后是
    //     整带里最亮的东西，所以补一层稀疏的 railHi 亮砾（每 13px 一粒，一屏约 37 笔）。
    fill(p.railHi);
    for (let i = 0; i < 38; i++) {
      const wx = Math.floor(camX / 13) * 13 + i * 13, r = 哈希(wx, 11);
      if (r < 0.42) continue;
      rect(wx - camX, gy + 12 + ((r * 24) | 0), 2, 1);
    }
    // ③ 排水沟 / 电缆槽：一条贯通的暗沟 + 亮唇 + 分段盖板或管束
    if (型.沟) {
      const y0 = gy + 34;
      fill(p.dark); rect(0, y0, VW, 7);
      fill(p.ballastHi); rect(0, y0 - 1, VW, 1);
      fill(p.steelDark); rect(0, y0 + 7, VW, 2);
      if (型.管) { fill(p.rail); rect(0, y0 + 12, VW, 3); fill(p.metal || p.railHi); rect(0, y0 + 12, VW, 1); }
      for (let x = Math.floor(camX / 60) * 60; x < camX + VW; x += 60) {
        const a = x - camX;
        if (型.管 && 哈希(x, 9) > 0.55) { fill(p.steel); rect(a, y0 + 10, 5, 8); }   // 管卡
        else { fill(p.ballastHi); rect(a, y0 - 3, 26, 3); }                          // 沟盖板
      }
    }
    // ④ 轨旁杂草：长在道床肩上，随风偏一点，密度按地貌给
    if (型.草) {
      const 距 = Math.max(26, Math.round(96 / 型.草));
      fill(p.floorLo);
      for (let x = Math.floor(camX / 距) * 距; x < camX + VW + 距; x += 距) {
        const a = x - camX + (哈希(x, 5) * 14 | 0), h = 4 + (哈希(x, 6) * 7 | 0);
        rect(a, gy + 12 - h, 1, h); rect(a + 2, gy + 12 - h + 2, 1, h - 2); rect(a - 2, gy + 12 - h + 3, 1, h - 3);
      }
    }
    // ⑤ 里程标与检查井：稀疏、但一眼给得出「这是有工程的一列区间」
    if (型.标) {
      const 距 = M.poleStep * (型.标 === 2 ? 2 : 3);
      for (let x = Math.floor(camX / 距) * 距; x < camX + VW + 距; x += 距) {
        const a = x - camX, 井 = 哈希(x, 13) > 0.6;
        if (井) { fill(p.panel); rect(a - 7, gy + 22, 14, 9); fill(p.steelDark); rect(a - 5, gy + 24, 10, 5); }
        else { fill(p.warn); rect(a, gy + 10, 2, 13); fill(p.railHi); rect(a - 2, gy + 10, 6, 2); }
      }
    }
    // ⑥ 隧道：仰拱与侧向电缆桥架（这一段没有露天道床）
    if (型.拱) {
      fill(p.steelDark); rect(0, gy + 22, VW, 3);
      for (let x = Math.floor(camX / 40) * 40; x < camX + VW; x += 40) { const a = x - camX; fill(p.panel); rect(a, gy + 18, 20, 4); }
      // 仰拱以下到底边：电缆沟的湿面 + 反光带，不留一整块平色
      fill(p.dark); rect(0, gy + 30, VW, 底 - gy - 30);
      for (let i = 0; i < 30; i++) {
        const wx = Math.floor(camX / 23) * 23 + i * 23, r = 哈希(wx, 61);
        fill(p.steelDark); rect(wx - camX, gy + 34 + r * Math.max(1, 底 - gy - 40), 8 + (r * 12 | 0), 2);
      }
      return;
    }
    // ⑦ 前景碴坡与地坪：沟以下到画面底边那一截。
    //    原来 `fill(p.ballast); rect(0, gy, VW, VH-gy)` 到这里就结束了，于是车尾之外
    //    屏底约五分之一是一整块平色（量具：路基带 开/关 边能都是 3.89，×1.00）。
    const 坡 = gy + 50;
    if (底 > 坡) {
      fill(p.ballastLo); rect(0, 坡, VW, 底 - 坡);
      // 夯实的道床：6px 一档明暗交替，比整块平色多出一条横向结构，
      // 又不会像逐列噪声那样在夜里被压成一片糊。
      for (let x = 0; x < VW; x += 6) {
        const wx = camX + x;
        fill((((wx / 6) | 0) % 2) ? p.ballast : p.ballastLo);
        rect(x, 坡 + 4, 6, 8);
      }
      fill(p.ballastHi); rect(0, 坡, VW, 2);
      fill(p.steelDark); rect(0, 坡 + 16, VW, 2);
      fill(p.ballastHi);                                 // 排水格栅：明暗相间的齿，给这一带一条规则结构线
      for (let x = Math.floor(camX / 14) * 14; x < camX + VW; x += 14)
        if ((((x / 14) | 0) % 2) === 0) rect(x - camX, 坡 + 20, 8, 4);
      fill(p.steelDark); rect(0, 坡 + 24, VW, 1);
      for (let i = 0; i < 34; i++) {                     // 前景碎石：比上面两档更大颗
        const wx = Math.floor(camX / 19) * 19 + i * 19, r = 哈希(wx, 71);
        fill(r > 0.6 ? p.ballastHi : p.grime);
        rect(wx - camX, 坡 + 30 + r * Math.max(1, 底 - 坡 - 38), 3 + (r * 4 | 0), 2);
      }
      for (let x = Math.floor(camX / 157) * 157; x < camX + VW + 157; x += 157) {
        const a = x - camX, r = 哈希(x, 91);
        if (r > 0.45) {                                  // 碴堆：三层收窄，轮廓是实打实的形而不是噪点
          fill(p.steelDark); rect(a - 2, 底 - 12, 34, 3);
          fill(p.ballast); rect(a, 底 - 18, 30, 8);
          fill(p.ballastHi); rect(a + 5, 底 - 23, 20, 6); rect(a + 10, 底 - 26, 10, 4);
        } else {                                         // 挡车器 / 基础墩：站场端头该有的黄色构件
          fill(p.warn); rect(a, 底 - 16, 16, 5);
          fill(p.steelDark); rect(a + 2, 底 - 11, 4, 11); rect(a + 10, 底 - 11, 4, 11);
        }
      }
      if (型.草) {                                        // 前景草丛：贴着底边长，给画面一个近景参照
        const 距 = Math.max(30, Math.round(120 / 型.草));
        fill(p.floorLo);
        for (let x = Math.floor(camX / 距) * 距; x < camX + VW + 距; x += 距) {
          const a = x - camX + (哈希(x, 81) * 16 | 0), h = 6 + (哈希(x, 82) * 9 | 0);
          rect(a, 底 - h, 1, h); rect(a + 3, 底 - h + 3, 1, h - 3); rect(a - 3, 底 - h + 2, 1, h - 2);
        }
      }
      fill(p.dark); rect(0, 底 - 3, VW, 3);               // 压边，画面底缘不再悬空
    }
  }

  // ---------- 编组两端之外的地面 ----------
  // 看图抓到的真问题：车尾/车头外面那一大片（世界 180~420，屏底约三分之一高）是**一整块平色**。
  // 中段有车体挡着看不出来，只有走到两端「车没了」的地方才露馅 —— 用户说的「下面太空了」是这里。
  // 补的是场站该有的层次：地平过渡三层土、一股远处的平行股道（带枕木与钢轨反光）、
  // 护栏柱与基础、轨旁杂草。全部只在编组范围外画，不碰车体覆盖区，也不新增任何构件。
  function 端外地面(p, M, S, camX, VW, Y) {
    if (S && S.dbg && S.dbg.ground === false) return;
    // 坐标帧：camX 是**世界**坐标（已经含 S.trainX，列车在跑），而 cars[].x0 是**车厢**坐标。
    // 直接把两者相减等于每帧少算一个 trainX（实测跑到 603px 时车尾那一段被判成「不在屏内」，
    // 整层不画 —— 车尾画面照样一片平色，而车头恰好因为落在另一条判据上而看起来是好的）。
    const 偏 = S.trainX || 0;
    const 左 = M.cars[0].x0 + 偏, 右 = M.cars[M.cars.length - 1].x1 + 偏;
    const 顶 = Y(GZ - 74), 底 = Y(GZ + 4);
    if (底 - 顶 < 6) return;
    const 段 = [];
    if (左 - camX > -20) 段.push([Math.max(0, -camX - 900), Math.min(VW, 左 - camX)]);
    if (右 - camX < VW + 20) 段.push([Math.max(0, 右 - camX), Math.min(VW, VW + 900)]);
    for (const [a0, b0] of 段) {
      const w = b0 - a0; if (w < 4) continue;
      fill(p.ballastLo); rect(a0, 顶, w, 底 - 顶);                 // 地平往下三层土
      fill(p.floorLo); rect(a0, 顶 + (底 - 顶) * 0.34, w, 3);
      fill(p.steelDark); rect(a0, 顶 + (底 - 顶) * 0.66, w, 2);
      for (let i = 0; i < 40; i++) {                               // 土面碎料，按世界 x 定死
        const wx = Math.floor((camX + a0) / 17) * 17 + i * 17, r = 哈希(wx, 21);
        fill(r > 0.55 ? p.ballast : p.grime);
        rect(wx - camX, 顶 + 3 + r * (底 - 顶 - 6), 2 + (r * 3 | 0), 1);
      }
      const 股 = 顶 + (底 - 顶) * 0.52;                             // 远处平行股道
      fill(p.rail); rect(a0, 股, w, 2); fill(p.railHi); rect(a0, 股, w, 1);
      fill(p.sleeper);
      for (let x = Math.floor(camX / 74) * 74; x < camX + w + 74; x += 74) {
        const a = x - camX; if (a > a0 - 8 && a < b0) rect(a, 股 + 2, 9, 3);
      }
      fill(p.pole);                                                 // 护栏柱 + 上横杆
      const 距 = 118;
      for (let x = Math.floor(camX / 距) * 距; x < camX + w + 距; x += 距) {
        const a = x - camX; if (a < a0 || a > b0) continue;
        rect(a, 股 - 26, 2, 28);
      }
      fill(p.steel); rect(a0, 股 - 26, w, 2); rect(a0, 股 - 16, w, 1);
      fill(p.floorLo);                                              // 轨旁杂草
      for (let x = Math.floor(camX / 34) * 34; x < camX + w + 34; x += 34) {
        const a = x - camX + (哈希(x, 22) * 12 | 0), h = 3 + (哈希(x, 23) * 6 | 0);
        if (a < a0 || a > b0) continue;
        rect(a, 底 - h, 1, h); rect(a + 2, 底 - h + 2, 1, h - 2);
      }
    }
  }

  // ---------- 端外站场：中景脚线(世界 252) 到路基顶(420) 之间那一大片 ----------
  // 看图抓到的真问题（第二处，也是「下面太空」的主体）：中景地块的脚线钉在 MID.地=252，
  // 而路基底色从 GZ-30=420 才开始，中间 168px 在编组范围内被车体挡着，一走到车外就整片
  // 露成平色（量具读数：屏高 30%~52% 那一带 色数 3、边能 0.33）。
  // 补的是站场纵深：地平逐列接住中景脚线（不是一条直线切上去）、三条由远及近加宽的平行股道、
  // 地坪板缝与黄色安全标线、油渍、栅栏网片、道砟堆与木箱堆、水鹤、信号机。
  // 顶边逐列取 midGround() —— 与中景同一个函数同一个 seed，所以地块的脚和这一带是**接上的**，
  // 不会出现「楼悬在半空」或「一条水平切线啃掉楼底」。视差 0.80 夹在中景 0.55 与近景 1.0 之间。
  const 站场par = 0.80;
  function 端外站场(p, M, S, camX, VW, Y, 板) {
    if (S && S.dbg && S.dbg.ground === false) return;
    // 帧口径与 端外地面 一致：cars[].x0 是车厢坐标，camX 是世界坐标（含 trainX）
    const 偏 = S.trainX || 0;
    const 左 = M.cars[0].x0 + 偏, 右 = M.cars[M.cars.length - 1].x1 + 偏;
    const 段 = [];
    if (左 - camX > -20) 段.push([Math.max(0, -camX - 1200), Math.min(VW, 左 - camX)]);
    if (右 - camX < VW + 20) 段.push([Math.max(0, 右 - camX), Math.min(VW, VW + 1200)]);
    if (!段.length) return;
    const 种 = M.worldSeed + 2, o = camX * 站场par, ox = Math.round(o);
    const 地平 = a => midGround(a + camX * MID.par, 种);          // 与 midBand 完全同一条脚线
    const 底 = Y(GZ - 74) + 4;
    for (const [a0, b0] of 段) {
      const w = b0 - a0; if (w < 4) continue;
      // ⓪ 地坪主体 + 逐列接住中景脚线的那条毛边
      fill(p.grime); rect(a0, Y(MID.地), w, 底 - Y(MID.地));
      fill(p.ballastLo); rect(a0, Y(MID.地) + 4, w, 底 - Y(MID.地) - 4);
      for (let a = a0; a < b0; a += 12) {
        const t = Math.round(地平(a)), h = Y(MID.地) + 4 - t;
        if (h > 0) { fill(p.grime); rect(a, t, 12, h); fill(p.ballastLo); rect(a, t + 4, 12, h - 4); }
      }
      fill(p.steelDark);                                        // 地平那一道的收口线，楼脚与地坪才分得开
      for (let a = a0; a < b0; a += 12) { const t = Math.round(地平(a)); rect(a, t, 12, 2); }
      const 高 = 底 - Y(MID.地);
      // ① 三条平行股道：越近越宽、枕木越厚，靠这个把纵深读出来
      const 股位 = [0.16, 0.40, 0.68];
      for (let gi = 0; gi < 3; gi++) {
        const q = (板 && 板[gi]) || p;                              // 三条股道三档纵深系数
        const y = Math.round(Y(MID.地) + 高 * 股位[gi]), 距 = 30 + gi * 26, 厚 = 1 + gi;
        fill(q.ballast); rect(a0, y - 2 - gi, w, 6 + gi * 3);
        fill(q.rail); rect(a0, y, w, 厚); fill(q.railHi); rect(a0, y, w, 1);
        fill(q.sleeper);
        for (let x = Math.floor(ox / 距) * 距; x < ox + w + 距; x += 距) {
          const a = Math.round(x - ox); if (a < a0 || a > b0) continue;
          rect(a, y + 厚, 4 + gi * 2, 2 + gi);
        }
      }
      // ② 近侧地坪：板缝、黄色安全标线、油渍
      const 坪 = Math.round(Y(MID.地) + 高 * 0.80);
      fill(p.floorLo); rect(a0, 坪, w, 底 - 坪);
      fill(p.steelDark);
      for (let x = Math.floor(ox / 38) * 38; x < ox + w + 38; x += 38) {
        const a = Math.round(x - ox); if (a >= a0 && a <= b0) rect(a, 坪 + 2, 1, 底 - 坪 - 2);
      }
      fill(p.warn);
      for (let x = Math.floor(ox / 260) * 260; x < ox + w + 260; x += 260) {
        const a = Math.round(x - ox); if (a >= a0 && a <= b0) rect(a, 坪 + 4, 104, 2);
      }
      fill(p.grime);
      for (let i = 0; i < 22; i++) {
        const wx = Math.floor((camX + a0) / 61) * 61 + i * 61, r = 哈希(wx, 31);
        rect(Math.round(wx * 站场par - ox), 坪 + 7 + r * Math.max(1, 底 - 坪 - 10), 7 + (r * 13 | 0), 2);
      }
      // ③ 栅栏网片：站在第二、三条股道之间
      const 栏 = Math.round(Y(MID.地) + 高 * 0.62);
      fill(p.pole);
      for (let x = Math.floor(ox / 54) * 54; x < ox + w + 54; x += 54) {
        const a = Math.round(x - ox); if (a < a0 || a > b0) continue; rect(a, 栏 - 22, 2, 24);
      }
      fill(p.wire); rect(a0, 栏 - 22, w, 1); rect(a0, 栏 - 12, w, 1);
      // ④ 堆料：道砟堆 / 木箱堆，位置按世界坐标定死，回访不跳
      for (let x = Math.floor(ox / 173) * 173; x < ox + w + 173; x += 173) {
        const a = Math.round(x - ox); if (a < a0 - 30 || a > b0) continue;
        if (哈希(Math.round(x / 站场par), 41) > 0.5) {
          fill(p.ballastHi);
          rect(a, 坪 - 4, 26, 4); rect(a + 4, 坪 - 8, 18, 4); rect(a + 8, 坪 - 11, 10, 3);
          fill(p.ballastLo); rect(a, 坪 - 1, 26, 1);
        } else {
          fill(p.crate); rect(a, 坪 - 14, 13, 14); rect(a + 15, 坪 - 9, 10, 9);
          fill(p.crateHi); rect(a, 坪 - 14, 13, 2); rect(a + 15, 坪 - 9, 10, 2);
          fill(p.crateLo); rect(a + 5, 坪 - 12, 1, 12); rect(a + 19, 坪 - 7, 1, 7);
        }
      }
      // ⑤ 水鹤与信号机：两个稀疏的「一眼是站场」的剪影
      for (let x = Math.floor(ox / 640) * 640; x < ox + w + 640; x += 640) {
        const a = Math.round(x - ox); if (a < a0 || a > b0) continue;
        fill(p.steel); rect(a, 坪 - 52, 3, 52); rect(a - 13, 坪 - 52, 22, 3); rect(a - 13, 坪 - 49, 3, 11);
        fill(p.steelDark); rect(a - 4, 坪 - 5, 11, 5);
      }
      for (let x = Math.floor(ox / 430) * 430 + 210; x < ox + w + 430; x += 430) {
        const a = Math.round(x - ox); if (a < a0 || a > b0) continue;
        fill(p.pole); rect(a, 栏 - 44, 2, 44); rect(a - 5, 栏 - 44, 12, 2);
        fill(哈希(x, 51) > 0.5 ? p.danger : p.warn); rect(a - 4, 栏 - 41, 5, 5);
      }
      // ⑥ 站场照明：这一带夜里唯一的光源。
      //     为什么必须有：上面那套「按离灯远近逐档变暗」的纵深，在黄昏靠环境光还读得出来，
      //     到 p=0.900 的黑夜就整片沉成一块平深蓝 —— 也就是「下面太空」在夜里又回来了。
      //     灯头吃 lampCol（光源键，不参与逐层明度系数），地面光斑只在夜里按 lampGain 出现。
      const 灯距 = 372;
      const 灯强 = typeof p.lamp === 'number' ? Math.max(0, Math.min(1, p.lamp)) : 0;
      for (let x = Math.floor(ox / 灯距) * 灯距 + 128; x < ox + w + 灯距; x += 灯距) {
        const a = Math.round(x - ox); if (a < a0 + 8 || a > b0 - 8) continue;
        fill(p.steelDark); rect(a, 坪 - 70, 2, 70); rect(a - 10, 坪 - 70, 13, 2);
        fill(p.lampCol); rect(a + 1, 坪 - 68, 5, 3);
        if (灯强 > 0.05) {
          ctx.globalAlpha = 0.15 * 灯强; fill(p.lampCol);
          rect(a - 20, 底 - 13, 42, 4); rect(a - 12, 底 - 17, 26, 4); rect(a - 28, 底 - 9, 58, 3);
          rect(a - 16, 坪 - 4, 34, 3);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function 轨旁高(p, what, gx, step, Y0, t, seed) {
    const ph = p.ph, 亮 = ph && ph.lampOn > 0.05;
    const 存A = ctx.globalAlpha;
    switch (what) {
      case 'scrub': {                                   // 城市边缘：轨旁路灯
        fill(p.pole); rect(gx + 6, Y0 - 330, 2, 330); rect(gx + 6, Y0 - 330, 12, 2);
        fill(亮 ? p.lampCol : p.steelLo); rect(gx + 16, Y0 - 330, 5, 4);
        fill(p.steelLo); rect(gx + 3, Y0 - 6, 8, 6); break;
      }
      case 'fence': {                                   // 镇区：电线杆 + 横担 + 两只瓷瓶
        fill(p.pole); rect(gx + 8, Y0 - 310, 3, 310); rect(gx - 3, Y0 - 302, 26, 2);
        fill(p.steelHi); rect(gx, Y0 - 307, 3, 5); rect(gx + 17, Y0 - 307, 3, 5); break;
      }
      case 'crop': {                                    // 开阔地：行道树
        // 前两版都是「绿色电线杆」：先是五段等宽冠块首尾相接，后是 22~34px 宽、170px 高的
        // 一根柱子 —— 冠的宽高比 1:5，人眼就归给「杆」了。树要读成树，冠必须**横向摊开**
        // （这里 60×118，宽高比约 1:2）并且有一段露出来的树干。
        // 间距也修了：见调用处那张表，原来每 2.7m 一棵，是栅栏不是树。
        const 冠底 = Y0 - 176, 顶 = 冠底 - 118, 中 = gx + 11;
        const 叶 = p.ph ? 叶色(p, p.ph) : (p.greenDark || p.steelLo);
        fill(p.floorLo); rect(中 - 2, 冠底 - 6, 4, Y0 - 冠底 + 6);            // 树干：从地面露到冠底
        fill(叶);
        rect(中 - 22, 顶 + 34, 44, 62);                                        // 主体
        rect(中 - 13, 顶, 26, 46);                                             // 上叶簇
        rect(中 - 30, 顶 + 48, 16, 34); rect(中 + 15, 顶 + 42, 15, 38);         // 左右两簇，破掉矩形轮廓
        fill(p.steelDark); rect(中 - 22, 顶 + 88, 44, 8);                       // 冠底一圈背光
        fill(p.steelLo); rect(中 - 8, Y0 - 4, 16, 4); break;                    // 树根一圈土
      }
      case 'reeds': {                                   // 河滩：航道标杆 —— 本来就该成对（左右各一），
        // 夜里标板要反光（真实航标就是反光板/顶灯）。单根 2px 细杆在夜间只给出 168 个结构像素、
        // 与背景差 9.9 档，卡在判据线下；补成一对 + 夜间反光板之后才读得出来。
        fill(p.pole); rect(gx + 7, Y0 - 330, 2, 330); rect(gx + 22, Y0 - 322, 2, 322);
        fill(p.danger); rect(gx + 5, Y0 - 330, 8, 8); rect(gx + 20, Y0 - 322, 8, 8);
        if (亮) { fill(p.lampCool); rect(gx + 6, Y0 - 329, 6, 6); rect(gx + 21, Y0 - 321, 6, 6); }
        break;
      }
      case 'girder': {                                  // 高架：桥侧灯柱
        fill(p.pole); rect(gx + 5, Y0 - 300, 2, 300); rect(gx + 5, Y0 - 300, 9, 2);
        fill(亮 ? p.lampCool : p.steelHi); rect(gx + 12, Y0 - 298, 4, 3); break;
      }
      case 'pipe': {                                    // 工业区：跨线管架（两腿 + 通格横梁 + 扶手）
        // 横梁钉在世界 120（≈5.5m，正好是限界以上），原来在 158 —— 一条 40×5 的横块浮在
        // 车顶线上方 44px，读起来就是车顶设备。腿仍然穿过障碍带，是 3px 细杆。
        fill(p.steelLo); rect(gx + 2, Y0 - 330, 3, 330); rect(gx + step - 5, Y0 - 330, 3, 330);
        fill(p.steel); rect(gx, Y0 - 332, step, 5);
        fill(p.steelHi); rect(gx, Y0 - 336, step, 1);
        fill(p.steelLo); rect(gx + 10, Y0 - 327, 2, 8); rect(gx + step - 14, Y0 - 327, 2, 8); break;
      }
      // 站场的进站信号机不在这里 —— 它本来就是 `case 'signal'` 的内容，只把那两笔加高了，
      // 在这儿再画一根就是同一格上两座信号机。
      default: break;
    }
    ctx.globalAlpha = 存A;
  }
  // 叶色：树冠/灌木这类漫反射面在某个相位下到底是什么颜色。
  // 子色板是纯倍乘，只把绿色压暗、色相原样保留 ⇒ 黄昏峰「紫天旁边立着一片饱和绿」。
  // 按天光占比把绿色混向中程山脊色，再按 601 权重把亮度乘回原值 —— 色相跟天走，明度阶不动
  // （夜晚的可读性全靠明度阶）。中景的树（m树）与轨旁 1:1 的行道树共用这一份算法，
  // 两处各写一遍迟早会漂开。
  function 叶色(p, ph) {
    const 天占 = Math.max(0, Math.min(0.55, 1 - (ph.sunA * ph.sunCol[2] / 255) / 0.75));
    const 山 = ph.ridge[1], 绿 = hex2rgb(p.greenDark || p.floorLo);
    if (天占 <= 0) return p.greenDark || p.floorLo;
    let 冠 = [绿[0] + (山[0] - 绿[0]) * 天占, 绿[1] + (山[1] - 绿[1]) * 天占,
      绿[2] + (山[2] - 绿[2]) * 天占];
    const L = 0.299 * 冠[0] + 0.587 * 冠[1] + 0.114 * 冠[2], L0 = 0.299 * 绿[0] + 0.587 * 绿[1] + 0.114 * 绿[2];
    if (L > 1) { const k = L0 / L; 冠 = [冠[0] * k, 冠[1] * k, 冠[2] * k]; }
    return rgb2hex(冠[0], 冠[1], 冠[2]);
  }
  function layer(p, kind, which, camX, camY, VW, VH, seed, par, S) {
    const z = ZONE[kind] || ZONE.field, what = z[which];
    // 与 mid/far 同一约定的纯视角开关：只让这一层不落笔，构件数据一份不改。
    // 只管 near —— 给 far 也接上会改变既有闸门里「关掉 far」的口径（那两条测的是 farBand 的
    // 山脊，不含这一层的远处内容），归档过的数字就不可比了。
    if (which === 'near' && S && S.dbg && S.dbg.near === false) return;
    const base = GZ - (which === 'far' ? 128 : which === 'mid' ? 74 : 0);
    const step = which === 'far' ? 96 : which === 'mid' ? 58 : 40;
    const o = -((camX * par) % step);
    const rng = h2;
    for (let i = -1; i * step - o < VW + step; i++) {
      const gx = o + i * step, k = Math.floor(camX * par / step) + i, t = rng(seed, k);
      const Y0 = Y(base) ;
      switch (what) {
        case 'hills': fill(which === 'far' ? p.steelLo : p.steel); rect(gx, Y0 - (18 + t * 40), step + 1, 18 + t * 40); break;
        case 'town': case 'city': fill(p.steelLo); { const h = 22 + t * 66; rect(gx, Y0 - h, step - 6, h); fill(p.steel); for (let wy = Y0 - h + 4; wy < Y0 - 4; wy += 7) for (let wx = gx + 3; wx < gx + step - 10; wx += 6) if (rng(seed, k * 31 + wx) > 0.55) rect(wx, wy, 2, 3);
          // 夜里楼窗点亮：哪扇窗存在由位置哈希定（不随时间变），哪扇窗亮由另一条稳定 rank 定，
          // 点亮比例是相位的连续量 ⇒ 同 seed 同 p 的点亮集合逐扇一致，不会每帧重新随机。
          if (p.ph.cityLit > 0) {
            fill(p.lampCol); ctx.globalAlpha = 0.35 + 0.65 * p.ph.cityLit;
            for (let wy = Y0 - h + 4; wy < Y0 - 4; wy += 7) for (let wx = gx + 3; wx < gx + step - 10; wx += 6)
              if (rng(seed, k * 31 + wx) > 0.55 && 有昼夜模块 && DayNight.cityLitAt(p.ph, seed, wx, wy)) rect(wx, wy, 2, 3);
            ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
          } } break;
        case 'houses': fill(p.paintLo); { const h = 14 + t * 16; rect(gx, Y0 - h, step - 10, h); fill(p.danger); rect(gx - 2, Y0 - h - 4, step - 6, 4); } break;
        case 'plant': fill(p.steelLo); { const h = 40 + t * 46; rect(gx, Y0 - h, step - 14, h); rect(gx + 8, Y0 - h - 18, 6, 18); fill(p.steel); rect(gx + 6, Y0 - h - 22, 10, 5); } break;
        case 'tankrow': fill(p.steel); { const r = 10 + t * 6; rect(gx + 4, Y0 - r * 2, r * 2, r * 2); fill(p.steelHi); rect(gx + 4, Y0 - r * 2, r * 2, 2); } break;
        case 'pylon': fill(p.wire); { const x1 = gx + step / 2 | 0; rect(x1, Y0 - 54, 2, 54); rect(x1 - 9, Y0 - 50, 20, 2); rect(x1 - 6, Y0 - 42, 14, 2); } break;
        case 'field': fill(p.ballastLo); rect(gx, Y0 - 10, step + 1, 10); break;
        case 'crop': fill(p.floorLo); for (let c = 0; c < step; c += 5) rect(gx + c, Y0 - 8 - (rng(seed, gx + c) * 6 | 0), 2, 10); break;
        case 'reeds': fill(p.floorLo); for (let c = 0; c < step; c += 4) rect(gx + c, Y0 - 12 - (rng(seed, c + k) * 8 | 0), 1, 14); break;
        case 'water': fill(p.glassDark); rect(gx, Y0 - 8, step + 1, 8); fill(p.glass); for (let c = 0; c < step; c += 9) rect(gx + c + (rng(seed, c) * 4 | 0), Y0 - 5, 5, 1); break;
        case 'fence': fill(p.steelLo); rect(gx, Y0 - 16, step, 2); for (let c = 0; c < step; c += 12) rect(gx + c, Y0 - 18, 2, 18); break;
        case 'scrub':
          // 城市边缘的轨旁：荒草簇 + 一丛灌木 + 一道碎石带。
          // 这个名字在 ZONE 表里挂了很久但没有 case（default 直接 break），
          // 所以 edge 章的轨旁层一直是空的 —— 第一阶段就记了这条，一直没有修。
          fill(p.floorLo);
          for (let c = 0; c < step; c += 3) { const u = rng(seed, gx + c * 7); rect(gx + c, Y0 - 6 - (u * 9 | 0), 2, 8 + (u * 9 | 0)); }
          fill(p.steelDark); {
            // 灌木：逐列收边的矮丘，不用路径也不用椭圆
            const bx = gx + (rng(seed, k * 13) * (step - 14) | 0), bw = 10 + (t * 8 | 0);
            for (let c = 0; c < bw; c++) rect(bx + c, Y0 - 12 - Math.round(4 * Math.sin(Math.PI * c / bw)), 1, 12);
          }
          fill(p.ballastHi); for (let c = 0; c < step; c += 11) rect(gx + c, Y0 - 2, 3, 2);
          break;
        case 'girder': fill(p.steelLo); rect(gx, Y0 - 26, step, 3); for (let c = 0; c < step; c += 8) { rect(gx + c, Y0 - 26, 2, 26); rect(gx + c + 1, Y0 - 25, 6, 2); } break;
        case 'pipe': fill(p.steel); rect(gx, Y0 - 20, step, 4); fill(p.steelLo); rect(gx + 4, Y0 - 16, 3, 16); break;
        case 'station': fill(p.paintLo); { const h = 26 + t * 20; rect(gx, Y0 - h, step - 4, h); fill(p.hazard); rect(gx, Y0 - h, step - 4, 3); } break;
        // 进站信号机：柱 34→285、机头抬到世界 165（车顶线 202 以上）—— 原来这一格的顶在 416，
        // 站上车顶根本看不见它。机头仍然只有 8×8、柱身 2px，是「一根杆顶上一盏灯」的轮廓，
        // 不是一块坐在车顶线上的矮胖方块（合同第 7 条要分开的正是后者；判据见 _dt4_mid 7b）。
        case 'signal': fill(p.steelLo); { const x1 = gx + 6; rect(x1, Y0 - 285, 2, 285); rect(x1 - 3, Y0 - 293, 8, 10); fill(t > 0.5 ? p.danger : p.greenDark); rect(x1 - 1, Y0 - 291, 4, 4); for (let y = Y0 - 262; y < Y0 - 30; y += 16) rect(x1 - 2, y, 6, 1); } break;
        case 'sky': {
          // 高架章不再自己画山：连续轮廓的远山已由 farBand 统一给出（那种等高矩形叠层
          // 与 farBand 的新轮廓打架，而且它本身就是「像楼」的来源）。这里只留一道高空薄霭，
          // 让桥面视野里的天空有层次、又不与远山轮廓抢形。
          ctx.globalAlpha = 0.18; fill(p.skyList[2]);
          rect(gx, Y0 - 10 - t * 26, step, 3);
          ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
          break;
        }
        default: break;
      }
      // 每 4 格一件，锚在**世界格号** k 上（不是屏幕序号）⇒ 车开过去的位置是确定的，
      // 同一颗 seed 折返回来看到同一批构件（_ph8_revisit 判的就是这个）。
      // 间距按**世界距离**给，不是按格数：这一层的 step 只有 40px ≈ 0.68m（59px/m），
      // 第一版统一「每 4 格一件」= 每 2.7m 一根，出图直接是一排栅栏。
      // 下面每个数换算成米：路灯 10m、电线杆 14m、行道树 18m、航道标 20m、桥侧灯 11m、
      // 跨线管架 15m、信号机 8m（站场里本来就该密）。
      const 距 = { scrub: 15, fence: 21, crop: 27, reeds: 30, girder: 16, pipe: 23, signal: 12 }[what] || 18;
      if (which === 'near' && what !== 'tunnel' && ((k % 距) + 距) % 距 === 0) 轨旁高(p, what, gx, step, Y0, t, seed);
    }
  }
  function Y(y) { return y - camYRef; }
  let camYRef = 0;
  let viewKRef = 1;                                               // 关卡缩放倍率：scene 每帧写进来，human 画之前做反向补偿

  // ==================== 中景（第四阶段）====================
  // 为什么整层重写而不是调参：`layer()` 的 mid 底边硬钉在 GZ-74 = 世界 376。
  // 车顶机位能看到的区间是世界 y 34.6~202（202 以下是车体本身），
  // 也就是说**中景从几何上就永远画在画面外** —— 第一阶段量的「mid 未被遮挡比例 0」
  // 不是遮挡率算错，是底边根本不对。给它接 midK 旋钮也仍然看不见（第二阶段如实记过）。
  //
  // 现在：底边抬到世界 252 附近，并且自己带一条缓坡（合同第 2 条的「坡地」就是它）；
  // 构件从坡面向上长 40~170。于是同一份画法在两个机位都成立：
  //   · 车顶：底边藏在车体后面，高出车顶线的那一截露出来 ⇒ 看见楼身、树冠、桥塔；
  //   · 车内：窗带正好是世界 240~300，落在中景底边附近 ⇒ 从窗户看出去是中景的中段。
  //
  // 布置一律按**背景坐标**（含视差），并且分两级随机：
  //   地块（420 背景像素）的风格走一条**慢噪声**，块内构件按固定节奏排、逐块只抖高度与宽度。
  //   这是合同那句「表现列车经过真实、连续的地区，而不是在每节车厢后面随机换一张背景」的落地：
  //   相邻地块必须像同一个片区的延续，独立随机的逐槽排布做不到。
  const MID = { par: 0.55, 地: 252, 伏: 26, 街: 420 };
  function midGround(bx, seed) {
    return MID.地 - MID.伏 * vnoise(bx, seed + 61, 300) - 10 * vnoise(bx, seed + 17, 96);
  }
  // 地块风格权重：吃「地块序号」的慢噪声 ⇒ 相邻地块连续，跨几个地块才换一次气质
  function 地段w(seed, k, off) { return vnoise(k * 131, seed + off, 2.4); }
  let 中景乘 = 1;                                    // 章节边界交叉淡入时整层的 alpha 乘子
  function mA(a) { ctx.globalAlpha = Math.max(0, Math.min(1, a * 中景乘)); }
  const 天顶色 = ph => 'rgb(' + ph.zenith.join(',') + ')';
  // 障碍带 = 世界 G.ROOF-30 ~ G.ROOF：车顶上的通风器、木箱、爬梯这些**可碰撞**构件就站在这条带里。
  // 合同第 7 条要求背景不得在这条带里造出成片的强边缘，而且解决手段限定为
  // 「移动地标位置 / 降低局部对比 / 调整层级」，明确禁止给所有游戏物体加粗描边。
  // 这里用的是第二条，并且只压**这一层自己的细纹理**（楼层线、竖缝、窗格、圈板缝、桁架层）：
  // 大面墙体、屋顶轮廓、地标剪影照常画 —— 那是「白天读得出材质」的本体，压掉就等于把中景压没了。
  //
  // 为什么不是在整条带上刷一层雾（前作就是这么干的）：刷雾会把身后的天空与远山一起压平，
  // 真机闸门 _ph8_motion 量到夜里「远山那一级 vs 天空」只剩 Δ2.5（判据 ≥6），
  // 也就是为了压中景把远景的色阶毁掉 —— 那是把一个问题换成另一个问题。
  let 带A = -1, 带B = -1;
  const 带压 = (y, h) => {
    if (带A < 0) return 1;
    const hh = h || 1, a = Math.max(y, 带A), b = Math.min(y + hh, 带B);
    const 占 = b > a ? (b - a) / hh : 0;
    return 1 - 0.72 * 占;
  };
  // 中景的细纹理统一走这一条：落在障碍带里的那部分自动降档
  function m细(色, x, y, w, h) { mA(带压(y, h)); fill(色); rect(x, y, w, h); mA(1); }
  // 列程：按「逐列顶边」铺一条地形，相邻列顶边相同就并成一只矩形。
  // 为什么要有它：这一层的成本几乎全花在「一列一笔」上 —— 一个地块 420 列就是 420 笔，
  // 而顶边是慢噪声，实际只有几十段。合并之后落到的像素与逐列一模一样
  // （每一列取的都是同一个 顶(i)，且这些矩形互不重叠，没有半透明叠加的顺序问题）。
  function 列程(顶, x0, x1, 画) {
    let i = Math.max(0, Math.round(x0));
    const 末 = Math.min(VWGL, Math.round(x1));
    while (i < 末) {
      const t = 顶(i); let j = i + 1;
      while (j < 末 && 顶(j) === t) j++;
      画(i, j - i, t); i = j;
    }
  }
  // 夜压：给大面**浅色**构件补一层压暗，混合度由「这面色比身后的天亮多少」连续决定。
  // 为什么需要：站房与民居出厂用 paint 系浅色，过了 midK 0.62 仍有 26~27 的亮度，
  // 而深夜的天顶只有 22 —— 一整栋比天还亮的黑楼糊在天上，第三阶段那条「夜里层次不能塌」
  // 就是被这种大面吃掉的（接近章夜里整帧极差实测 7~10）。
  // 为什么是连续混合而不是「夜里换深色」：整面墙体一次性换色就是闪变，
  // 第三阶段的边界平滑判据要抓的正是这个。压深色用同层最暗的钢色而不是天顶色，
  // 否则又等于把楼体涂成天空的颜色（近地雾那条注释里踩过同一个坑）。
  const 亮601 = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  function 夜压(p, ph, 色, x, y, w, h) {
    const 天 = 亮601(ph.zenith), 面 = 亮601(hex2rgb(色));
    const 混 = Math.max(0, Math.min(1, (面 - 天 + 2) / 10));
    if (混 <= 0) return;
    mA(混); fill(p.steelLo); rect(x, y, w, h); mA(1); ctx.fillStyle = p.dark;
  }

  // 一扇窗该不该亮：位置键用**背景坐标 + 楼层**，比例用 cityLit ⇒
  // 同 seed 同 p 逐扇一致，且只会按稳定次序陆续点亮（合同第 1 条「不能全楼同步闪烁」）。
  function 窗亮(ph, seed, bx, wy) {
    return 有昼夜模块 && DayNight.cityLitAt(ph, seed, bx, wy);
  }
  // 楼体：主体 + 受光侧 + 楼层线 + 窗格 + 屋顶设备 + 夜里亮窗
  function m楼(p, ph, seed, x, bx, 底, w, h, s, 型) {
    const 顶 = 底 - h;
    mA(1); fill(p.steelLo); rect(x, 顶, w, h);
    // 立面分格：白天读「材质」靠的就是这几条楼层线与竖缝，不是靠描边
    for (let y = 顶 + 8; y < 底 - 3; y += 9) m细(p.steelDark, x, y, w, 1);
    for (let cx = x + 6; cx < x + w - 2; cx += 11) m细(p.steelDark, cx, 顶, 1, h);
    // 受光侧：太阳在黄昏往左落，所以左侧亮；夜里换成月光的冷白
    const 亮面 = ph.sunA > 0.05 ? rgbStr(ph.sunCol) : rgbStr(ph.moonCol);
    mA((0.16 + 0.30 * Math.max(ph.sunA, ph.moonA * 0.55)) * 带压(顶, h)); fill(亮面); rect(x, 顶, 2, h);
    mA(1);
    // 窗格：存在由哈希定，亮不亮由 cityLit 的稳定 rank 定
    const 列距 = 型 === '住宅' ? 7 : 9, 行距 = 9;
    for (let wy = 顶 + 4, 层 = 0; wy < 底 - 6; wy += 行距, 层++) {
      const 压 = 带压(wy, 3);
      for (let cx = x + 3; cx < x + w - 4; cx += 列距) {
        const gbx = Math.round(bx + (cx - x)), 有 = h2(seed + 71, gbx * 13 + 层) > 0.34;
        if (!有) continue;
        if (窗亮(ph, seed, gbx, 层 * 7 + (型 === '住宅' ? 1 : 5))) {
          mA((0.55 + 0.45 * ph.cityLit) * 压); fill(p.lampCol); rect(cx, wy, 3, 3);
          mA(0.20 * ph.cityLit * 压); rect(cx - 1, wy - 1, 5, 5);        // 窗光在墙上的溢出
          mA(1);
        } else m细(p.glassDark, cx, wy, 3, 3);
      }
    }
    // 屋顶设备：水箱 / 天线 / 排气机组 / 女儿墙，按 hash 长其中一到两样
    const 设 = h2(seed + 83, Math.round(bx));
    if (型 === '住宅' || 设 > 0.35) { fill(p.steel); rect(x + 2, 顶 - 1, w - 4, 1); }   // 女儿墙
    if (设 > 0.62) { fill(p.panelLo); rect(x + 4, 顶 - 6, 7, 5); fill(p.panelHi); rect(x + 4, 顶 - 6, 7, 1); }
    if (设 > 0.44 && 设 <= 0.62) { fill(p.wire); rect(x + (w >> 1), 顶 - 12, 1, 12);
      rect(x + (w >> 1) - 2, 顶 - 12, 5, 1); }                        // 天线
    if (设 > 0.80) { fill(p.steelDark); rect(x + w - 12, 顶 - 4, 8, 3); fill(p.steelHi); rect(x + w - 12, 顶 - 4, 8, 1); }
    // 屋顶的红色航空障碍灯（高层才有；亮度只由世界位置与相位定，不跟着 S.time 闪 ⇒
    // 回访一致性闸门比的是画面签名，闪灯会让同一位置的两次回访必然不同）
    if (h > 120 && ph.cityLit > 0.1) {
      mA(0.55 + 0.45 * ph.cityLit); fill(p.danger); rect(x + (w >> 1) - 1, 顶 - 14, 2, 2);
      mA(0.18 * ph.cityLit); rect(x + (w >> 1) - 3, 顶 - 16, 6, 6); mA(1);
    }
  }
  // 坡屋顶住宅：比板楼矮、有山墙，夜里是「有节奏的亮窗」而不是整面玻璃
  function m民居(p, ph, seed, x, bx, 底, w, h, s) {
    const 顶 = 底 - h;
    mA(1); fill(p.paintLo); rect(x, 顶 + 4, w, h - 4);
    夜压(p, ph, p.paintLo, x, 顶 + 4, w, h - 4);                       // 夜里退成剪影，见「夜压」
    fill(p.fabricLo);                                              // 坡屋顶：逐列收边，不是三角形贴图
    for (let i = 0; i <= (w >> 1); i += 1) { const t = Math.round(4 * (1 - i / (w / 2 + 1)));
      rect(x + (w >> 1) - i, 顶 + 4 - t + 4, 1, 1); rect(x + (w >> 1) + i, 顶 + 4 - t + 4, 1, 1); }
    fill(p.paint); rect(x, 顶 + 4, w, 1);
    for (let wy = 顶 + 9; wy < 底 - 5; wy += 10) {
      const 压 = 带压(wy, 4);
      for (let cx = x + 3; cx < x + w - 4; cx += 8) {
        const gbx = Math.round(bx + (cx - x));
        if (h2(seed + 91, gbx * 7 + wy) < 0.30) continue;
        if (窗亮(ph, seed, gbx, wy)) {
          mA((0.6 + 0.4 * ph.cityLit) * 压); fill(p.lampCol); rect(cx, wy, 3, 4); mA(1);
        } else m细(p.glassDark, cx, wy, 3, 4);
      }
    }
    if (h2(seed + 97, Math.round(bx)) > 0.55) { fill(p.steelDark); rect(x + w - 6, 顶 - 2, 2, 7); }  // 烟囱
  }
  // 街灯与道路轮廓：路面 + 缘石 + 灯柱（合同第 1 条的「街灯和道路轮廓」）
  function m街道(p, ph, seed, x, bx, 底, w) {
    mA(1); fill(p.ballastLo); rect(x, 底 - 3, w, 4);                 // 路面
    fill(p.steelDark); rect(x, 底 + 1, w, 2);                        // 路缘阴影
    fill(p.ballastHi); rect(x, 底 - 3, w, 1);                        // 白天读得出的路面反光带
    for (let lx = x + 6; lx < x + w; lx += 34) {
      const gbx = Math.round(bx + (lx - x)), 有 = h2(seed + 113, gbx >> 5) > 0.30;
      if (!有) continue;
      fill(p.pole); rect(lx, 底 - 22, 1, 19); rect(lx - 3, 底 - 22, 7, 1);
      // 白天的街灯不该亮 —— 第一版只看 rank，于是正午的街灯全亮，
      // 「白天一扇窗都不亮」那条判据顺带把它抓出来了（量具没白配）。
      const 亮 = ph.lampGain > 0.25 && (!有昼夜模块 || DayNight.rank(seed + 5, gbx, 0, 173) < ph.lampOn * 0.9);
      if (亮) {
        mA(0.30 + 0.62 * ph.lampGain); fill(p.lampCol); rect(lx - 2, 底 - 21, 5, 2);
        mA(0.10 + 0.26 * ph.lampGain); rect(lx - 6, 底 - 20, 13, 12);   // 灯下的一团光
        mA(0.09 + 0.16 * ph.lampGain); fill(p.lampCoolE); rect(lx - 8, 底 - 4, 17, 3);  // 洒在路面上
        mA(1); ctx.fillStyle = p.pole;
      }
    }
  }
  // 树：树干 + 由几团矩形叠出来的树冠（不是圆）
  function m树(p, ph, seed, x, bx, 底, h, s) {
    const 顶 = 底 - h, 冠 = Math.max(7, Math.round(h * 0.42));
    mA(1); fill(p.floorLo); rect(x, 顶 + 冠 - 2, 2, h - 冠 + 2);
    const 团 = [];
    for (let i = 0; i < 5; i++) {
      const t = h2(seed + 127, Math.round(bx) + i), w = Math.round(冠 * (0.55 + t * 0.55));
      团.push([x + 1 - (w >> 1) + Math.round((h2(seed + 131, Math.round(bx) + i) - 0.5) * 冠 * 0.7),
        顶 + Math.round(i * 冠 * 0.32), w, Math.max(2, Math.round(冠 * 0.42))]);
    }
    // 冠色见 叶色()：色相跟着天光走、明度锁回原值。实测（tools/_dt4_tree.js，开阔章车顶机位
    // 6269 个树冠像素，旧→新）中位绿度 白天 63.0→63.0 · 黄昏初 35.7→18.9 · 黄昏峰 13.2→−4.9
    // （同档天空 −47）· 入夜 21.1→5.0 · 黑夜 8.4→2.5；「冠 vs 身后背景」中位亮度差
    // 32.5→32.5 · 15.0→14.7 · 11.2→11.3 · 7.5→7.6 · 9.1→9.2 —— 每一档都不低于改前。
    const 冠色 = 叶色(p, ph);
    fill(冠色);
    for (const g of 团) rect(g[0], g[1], g[2], g[3]);
    // 叶色还要吃到照在它上面的斜阳：黄昏的低角度光是橙的，白天 sunCol 接近白 ⇒ 这一层几乎为 0，
    // 夜里 sunA→0 ⇒ 也归 0，不会和月光打架。只补最上面两团（团按 y 从上往下排，0/1 就是冠顶）：
    // 一是光本来从上方来，二是这层的成本几乎全在落笔笔数上，五团全补一遍等于每棵树多五笔
    // （真机 P95 因此从 16.4 抬到 17.8）。
    const 暖 = Math.max(0, Math.min(1, (1 - ph.sunCol[2] / 255) * ph.sunA));
    if (暖 > 0.06) {
      mA(0.34 * 暖); fill(rgbStr(ph.sunCol));
      for (let i = 0; i < 2; i++) rect(团[i][0], 团[i][1], 团[i][2], 团[i][3]);
      mA(1); ctx.fillStyle = 冠色;
    }
  }
  // 围栏：柱 + 两道横杆（低构件，只有站在坡上才露出车顶线）
  function m围栏(p, ph, seed, x, bx, 底, w) {
    mA(1); fill(p.steelDark);
    for (let cx = x; cx < x + w; cx += 9) rect(cx, 底 - 13, 1, 13);
    rect(x, 底 - 12, w, 1); rect(x, 底 - 7, w, 1);
  }
  // 输电塔：格构 + 横担 + 一串悬垂 + 导线（合同第 2 条的「输电设施」）
  function m输电(p, ph, seed, x, bx, 底, h) {
    const 顶 = 底 - h, 身 = Math.round(h * 0.28);
    mA(1); fill(p.steelDark);
    for (let i = 0; i < 3; i++) {
      const t = i / 2, y0 = 顶 + 14 + (h - 28) * t * 0.6, y1 = y0 + (h - 28) * 0.34;
      rect(x + 1 + Math.round(6 * t), y0, 1, y1 - y0); rect(x + 1 + 身 - Math.round(6 * t), y0, 1, y1 - y0);
    }
    rect(x, 顶 + 12, 身, 1); rect(x + 2, 顶 + 5, 身 - 4, 1);          // 下横担 / 上横担
    rect(x + Math.round(身 / 2), 顶, 1, 12);                          // 塔尖
    fill(p.wire);
    for (const dx of [1, Math.round(身 / 2), 身 - 1]) rect(x + dx, 顶 + 5, 1, 4);
    ctx.globalAlpha = 0.75 * 中景乘; rect(x - 26, 顶 + 6, 26, 1); rect(x + 身, 顶 + 6, 26, 1);
    ctx.globalAlpha = 1; ctx.fillStyle = p.steelDark;
    // 塔顶航空灯：夜里一点红，位置由世界坐标定（不随 S.time 闪，理由见 m楼）
    if (ph.cityLit > 0.08) { mA(0.5 + 0.5 * ph.cityLit); fill(p.danger);
      rect(x + Math.round(身 / 2) - 1, 顶 - 2, 2, 2); mA(1); }
  }
  // 水塔 / 农舍：开阔地上「少量建筑」的那一类
  function m水塔(p, ph, seed, x, bx, 底, h) {
    mA(1); fill(p.steelDark);
    rect(x, 底 - h * 0.55, 1, h * 0.55); rect(x + 8, 底 - h * 0.55, 1, h * 0.55);
    rect(x + 2, 底 - h * 0.30, 5, h * 0.30);
    fill(p.steel); rect(x - 2, 底 - h, 13, h * 0.45);
    fill(p.steelHi); rect(x - 2, 底 - h, 13, 1);
    fill(p.panelLo); rect(x + 1, 底 - h - 3, 7, 3);                   // 顶上的小机房
  }
  // ---------- 高架桥（合同第 3 条）----------
  // 桥塔 + 拉索 + 桥墩 + 护栏 + 下方河谷 + 桥上信号。
  // 「提前出现」不在这段里做：那由 world() 的**进桥预告带**负责（桥段前 1.5 屏就开始画桥塔），
  // 因为中景层是按相机中心取 kind 的，不提前取就会「进桥那一帧整屏换内容」。
  function m桥塔(p, ph, seed, x, bx, 底, h, 逆) {
    const 顶 = 底 - h;
    mA(1); fill(p.panelLo); rect(x, 顶, 7, h); rect(x + 9, 顶, 7, h);
    fill(p.steelLo); rect(x + 2, 顶, 3, h); rect(x + 11, 顶, 3, h);   // 塔身的竖模
    for (let y = 顶 + 10; y < 底 - 6; y += 16) { fill(p.steelDark); rect(x, y, 16, 2); }
    fill(p.panelHi); rect(x, 顶, 16, 2);
    // 拉索：从塔顶斜拉到桥面，逐列落笔（斜线在本项目里就是 1px 列）
    fill(逆 ? rgbStr(ph.sunCol) : rgbStr(ph.moonCol));
    for (let i = 0; i < 26; i++) {
      mA((逆 ? 0.30 * ph.sunA : 0.22 * ph.moonA) * (1 - i / 40));
      rect(x + 8 - Math.round(i * 0.9), 顶 + 4 + i * 3, 1, 3);
      rect(x + 8 + Math.round(i * 0.9), 顶 + 4 + i * 3, 1, 3);
    }
    mA(1);
  }
  function m桥墩(p, ph, seed, x, bx, 底, 桥面, 高) {
    mA(1); fill(p.steelLo); rect(x, 桥面, 11, 底 - 桥面);
    fill(p.panelLo); rect(x + 1, 桥面, 3, 底 - 桥面);                  // 受光面
    fill(p.steelDark); rect(x - 2, 底 - 4, 15, 4);                     // 承台
    for (let y = 桥面 + 8; y < 底 - 6; y += 14) { fill(p.steelDark); rect(x, y, 11, 1); }
  }
  function m桥面(p, ph, seed, x, bx, 桥面, w) {
    mA(1); fill(p.panel); rect(x, 桥面 - 12, w, 12);                   // 主梁
    fill(p.steelDark); rect(x, 桥面 - 3, w, 3);
    fill(p.panelHi); rect(x, 桥面 - 12, w, 1);                         // 白天读得出桥面的上缘
    // 护栏：竖柱 + 两道横杆，夜里只留轮廓
    fill(p.steelDark);
    for (let cx = x; cx < x + w; cx += 11) rect(cx, 桥面 - 19, 1, 7);
    mA(0.9); fill(p.steel); rect(x, 桥面 - 19, w, 1); rect(x, 桥面 - 15, w, 1); mA(1);
  }
  function m信号(p, ph, seed, x, bx, 桥面, s) {
    mA(1); fill(p.pole); rect(x, 桥面 - 30, 2, 18);
    fill(p.steelDark); rect(x - 2, 桥面 - 34, 6, 6);
    const 绿 = s > 0.5;
    mA(0.55 + 0.45 * Math.max(ph.lampGain, 0.35));
    fill(绿 ? (p.green || p.greenDark) : p.danger); rect(x - 1, 桥面 - 33, 3, 3);
    mA(0.16 + 0.20 * ph.lampGain); rect(x - 4, 桥面 - 36, 9, 9); mA(1);
  }
  // ---------- 工业区（合同第 5 条）----------
  // 厂房 / 储罐 / 管道桁架 / 烟囱 / 框架 / 工作灯 —— 明确不许「一排矩形高楼」。
  function m厂房(p, ph, seed, x, bx, 底, w, h, 齿) {
    const 顶 = 底 - h;
    mA(1); fill(p.steelLo); rect(x, 顶, w, h);
    fill(p.steel); rect(x, 顶, w, 2);
    if (齿) {                                                          // 锯齿屋顶： north Facing 采光带
      for (let cx = x; cx < x + w - 6; cx += 14) {
        fill(p.steelDark); rect(cx, 顶 - 6, 8, 6);
        fill(p.glassHi); mA(0.55); rect(cx + 6, 顶 - 5, 2, 5); mA(1); ctx.fillStyle = p.steelLo;
      }
    }
    // 立面：带形窗 + 墙板竖缝 + 卷帘门
    for (let cx = x + 8; cx < x + w - 2; cx += 16) m细(p.steelDark, cx, 顶 + 3, 1, h - 3);
    for (let wy = 顶 + 8; wy < 顶 + 16 && wy < 底 - 8; wy += 6) {
      const 压 = 带压(wy, 3);
      mA(0.9 * 压); fill(p.glassDark); rect(x + 3, wy, w - 6, 3);
      const 亮 = ph.cityLit > 0.05;
      if (亮) { mA((0.30 + 0.45 * ph.cityLit) * 压); fill(p.lampCol);
        for (let cx = x + 4; cx < x + w - 5; cx += 9)
          if (窗亮(ph, seed, Math.round(bx + cx - x), wy)) rect(cx, wy, 5, 3); mA(0.9 * 压); }
      mA(1);
    }
    fill(p.panelLo); rect(x + (w >> 1) - 7, 底 - 12, 14, 12);
    fill(p.steelDark); for (let i = 0; i < 5; i++) rect(x + (w >> 1) - 7, 底 - 12 + i * 2, 14, 1);
  }
  function m储罐(p, ph, seed, x, bx, 底, w, h) {
    const 顶 = 底 - h;
    mA(1); fill(p.panelLo); rect(x, 顶 + 3, w, h - 3);
    fill(p.panel); rect(x, 顶 + 3, w, 2);
    fill(p.steelDark); rect(x, 底 - 3, w, 3);
    for (let y = 顶 + 10; y < 底 - 4; y += 9) m细(p.steelDark, x, y, w, 1);   // 圈板缝
    fill(p.steel); rect(x + 2, 顶, w - 4, 4);                          // 拱顶
    fill(p.hazard || p.paintHi); rect(x + 2, 顶, w - 4, 1);
    m细(p.steelDark, x + w - 3, 顶 + 6, 2, h - 9);                     // 侧爬梯
    for (let y = 顶 + 10; y < 底 - 6; y += 8) m细(p.steelDark, x + w - 5, y, 4, 1);
  }
  function m管架(p, ph, seed, x, bx, 底, w, h) {
    const 顶 = 底 - h;
    mA(1); fill(p.steelDark);
    for (let cx = x; cx < x + w; cx += 26) m细(p.steelDark, cx, 顶 + 4, 2, h - 4);   // 立柱
    m细(p.steelDark, x, 顶 + 4, w, 1); m细(p.steelDark, x, 顶 + 12, w, 1);           // 桁架层
    for (let cx = x; cx + 26 < x + w; cx += 26) { m细(p.steelDark, cx, 顶 + 4, 26, 1);
      for (let i = 0; i < 26; i += 4) m细(p.steelDark, cx + i, 顶 + 5 + (i % 8 ? 1 : 3), 2, 1); }
    fill(p.steel); rect(x, 顶 - 2, w, 3);                               // 主管
    fill(p.steelHi); rect(x, 顶 - 2, w, 1);
    fill(p.rust || p.crateLo); for (let cx = x + 6; cx < x + w; cx += 24) rect(cx, 顶 - 3, 2, 5);
    fill(p.steelLo); rect(x + 3, 顶 + 8, w - 6, 2);                     // 第二根小管
  }
  function m烟囱(p, ph, seed, x, bx, 底, h) {
    const 顶 = 底 - h, w = Math.max(4, Math.round(h * 0.075));
    mA(1);
    for (let i = 0; i < h; i++) {                                      // 逐列收分：下宽上窄
      const t = 1 - i / h, ww = Math.max(3, Math.round(w * (0.72 + 0.55 * t)));
      fill(p.steelLo); rect(x + (w >> 1) - (ww >> 1), 底 - i, ww, 1);
    }
    fill(p.danger); rect(x - 1, 顶 + 6, w + 2, 2); rect(x - 1, 顶 + 14, w + 2, 2);   // 航空色环
    fill(p.steelHi); rect(x, 顶, w, 2);
    if (ph.cityLit > 0.05) { mA(0.55 + 0.45 * ph.cityLit); fill(p.danger);
      rect(x + (w >> 1) - 1, 顶 - 2, 2, 2); mA(0.2); rect(x + (w >> 1) - 3, 顶 - 4, 6, 6); mA(1); }
  }
  function m框架(p, ph, seed, x, bx, 底, w, h) {
    const 顶 = 底 - h;
    mA(1); fill(p.steelDark);
    for (let cx = x; cx <= x + w; cx += 15) m细(p.steelDark, cx, 顶, 2, h);
    for (let y = 顶; y <= 底; y += 13) m细(p.steelDark, x, y, w, 2);
    for (let cx = x; cx + 15 < x + w; cx += 15)                         // 斜撑
      for (let i = 0; i < 13; i += 2) m细(p.steelDark, cx + i * 0.9, 顶 + i, 2, 2);
    fill(p.steel); rect(x, 顶, w, 1);
  }
  // 工作灯：灯头 + 向下的光锥 —— 合同第 5 条「夜晚由有来源的灯光揭示部分结构」
  function m工作灯(p, ph, seed, x, bx, 底, h, 亮) {
    mA(1); fill(p.pole); rect(x, 底 - h, 2, h); rect(x - 8, 底 - h, 11, 2);
    if (!亮) return;
    fill(p.lampCol); mA(0.75 + 0.25 * ph.lampGain); rect(x - 7, 底 - h + 2, 4, 3);
    for (let i = 1; i <= 9; i++) {                                     // 光锥：逐层加宽
      mA((0.16 + 0.14 * ph.lampGain) * (1 - i / 12));
      rect(x - 6 - i, 底 - h + 5 + i * 3, 3 + i * 2, 3);
    }
    mA(0.10 + 0.12 * ph.lampGain); fill(p.lampCoolE); rect(x - 16, 底 - 3, 22, 3);
    mA(1);
  }
  // 站房与雨棚（接近章）
  function m站房(p, ph, seed, x, bx, 底, w, h) {
    const 顶 = 底 - h;
    // 站房是 24 小时有人的一座建筑：它的窗比住宅楼**亮得早、灭得晚**（rank 阈值里带一个底数）。
    // 不这么做的话夜里进站这一段会跟着一栋黑楼，「要到达」这条信息就丢了。
    const 常亮 = (gbx, 层) => 窗亮(ph, seed, gbx, 层) ||
      (ph.lampGain > 0.25 && (!有昼夜模块 ||
        DayNight.rank(seed + 3, gbx, 层, 293) < 0.34 + 0.62 * ph.lampOn));
    mA(1); fill(p.paintLo); rect(x, 顶, w, h);
    夜压(p, ph, p.paintLo, x, 顶, w, h);                               // 夜里退成剪影，见「夜压」
    fill(p.paint); rect(x, 顶, w, 2);
    for (let cy = 顶 + 5; cy < 底 - 12; cy += 13)
      for (let cx = x + 5; cx < x + w - 3; cx += 10) m细(p.steelDark, cx, cy, 5, 7);
    for (let cy = 顶 + 5, 层 = 0; cy < 底 - 12; cy += 13, 层++) {
      const 压 = 带压(cy, 7);
      for (let cx = x + 5; cx < x + w - 3; cx += 10) {
        const gbx = Math.round(bx + cx - x);
        if (!常亮(gbx, 层 * 11)) continue;
        mA((0.62 + 0.38 * ph.lampGain) * 压); fill(p.lampCol); rect(cx, cy, 5, 7);
        mA((0.10 + 0.14 * ph.lampGain) * 压); rect(cx - 2, cy - 2, 9, 11);  // 光在墙面上的溢出
        mA(1); ctx.fillStyle = p.paintLo;
      }
    }
    fill(p.hazard || p.paintHi); rect(x - 4, 顶 + 14, w + 8, 2);       // 雨棚
    for (let cx = x; cx < x + w; cx += 18) m细(p.steelDark, cx, 顶 + 16, 1, 底 - 顶 - 16);
    // 中跨山墙 + 大钟 + 发光站名牌：白天一眼认得出「这是一座站房」而不是一栋普通楼。
    // 钟的指针位置由**相位**定（不是由 S.time 每帧重画），所以回访同一时刻画面逐字节一致。
    const 跨宽 = Math.max(22, Math.round(w * 0.34)), 跨 = x + Math.round(w * 0.33), 跨顶 = 顶 - 18;
    fill(p.paintLo); rect(跨, 跨顶, 跨宽, 20);
    fill(p.paint); rect(跨, 跨顶, 跨宽, 2);
    fill(p.steelDark); rect(跨 + 3, 跨顶 + 4, 9, 9);                    // 钟盘底
    // 钟面是**白珐琅漆**（steelHi），不是光源：用 lampCol 的话，白天量具会把一枚
    // 不亮的钟面数成「发光名牌」，那条判据就在测别的东西了。
    fill(p.steelHi); rect(跨 + 4, 跨顶 + 5, 7, 7);                       // 钟盘
    const 时 = Math.round(ph.p * 11.99), 分 = Math.round((ph.p * 720) % 60 / 15);
    fill(p.steelDark);
    rect(跨 + 7, 跨顶 + 8 - Math.min(2, 时 % 3), 1, 1 + Math.min(2, 时 % 3));      // 时针
    rect(跨 + 7 + (分 % 3) - 1, 跨顶 + 7, 1 + (分 % 2), 3);                          // 分针
    fill(p.steel); rect(跨 + 3, 跨顶 + 4, 9, 1);
    // 站名牌：夜里常亮的一条暖色带。它是这一章在低对比时刻的主要识别物 ——
    // 镇区的民居没有这条，站房有。
    const 牌亮 = ph.lampGain > 0.22;
    fill(p.steelDark); rect(跨 + 13, 跨顶 + 6, 跨宽 - 17, 5);
    if (牌亮) { mA(0.5 + 0.5 * ph.lampGain); fill(p.lampCol); rect(跨 + 14, 跨顶 + 7, 跨宽 - 19, 3); mA(1); }
    else { fill(p.paintHi); rect(跨 + 14, 跨顶 + 7, 跨宽 - 19, 3); mA(1); }
    // 三扇高拱窗（镇区的窗是 3×4 的小方格，站房是通高两层的竖窗）
    fill(p.steelDark);
    for (let i = 0; i < 3; i++) rect(跨 + 3 + i * 6, 跨顶 + 15, 4, 5);
    if (牌亮) { mA(0.45 + 0.5 * ph.lampGain); fill(p.lampCol);
      for (let i = 0; i < 3; i++) rect(跨 + 3 + i * 6, 跨顶 + 15, 4, 5); mA(1); }
  }
  // 站台雨棚：长檐 + 等距柱 + 檐下一排站台灯。
  // 这条灯带是「接近章」夜里最亮的一级台阶 —— 合同第 5 条要的「有来源的灯光」，
  // 来源必须是灯，不能是给整片楼体提亮。
  function m雨棚(p, ph, seed, x, bx, 底, 宽) {
    const 檐 = 底 - 26;
    mA(1); fill(p.panelLo); rect(x, 檐, 宽, 3);
    fill(p.panelHi); rect(x, 檐, 宽, 1);
    fill(p.steelDark);
    for (let cx = x + 8; cx < x + 宽 - 4; cx += 26) rect(cx, 檐 + 3, 1, 底 - 檐 - 3);
    for (let cx = x + 21; cx < x + 宽 - 4; cx += 26) {
      const gbx = Math.round(bx + (cx - x));
      if (h2(seed + 281, gbx) > 0.78) continue;                        // 偶尔坏一盏
      if (!(ph.lampGain > 0.25) || (有昼夜模块 && DayNight.rank(seed + 13, gbx, 0, 271) > ph.lampOn * 0.9)) continue;
      mA(0.55 + 0.45 * ph.lampGain); fill(p.lampCol); rect(cx - 2, 檐 + 3, 4, 2);
      mA(0.10 + 0.20 * ph.lampGain); rect(cx - 6, 檐 + 5, 12, 9);       // 灯下的光团
      mA(0.08 + 0.12 * ph.lampGain); fill(p.lampCoolE); rect(cx - 7, 底 - 3, 14, 3);  // 洒在站台上
      mA(1); ctx.fillStyle = p.panelLo;
    }
  }
  // 门型接触网架：两根立柱 + 顶部横桁 + 挂在桁架上的显示灯。
  // 铁路上「前面有道岔和站场」就是靠这种门架说话，进站段没有它等于少一门语言。
  function m门架(p, ph, seed, x, bx, 底, h) {
    const 顶 = 底 - h;
    mA(1); fill(p.pole); rect(x, 顶, 2, h); rect(x + 30, 顶, 2, h);
    fill(p.steelDark); rect(x, 顶, 32, 2);
    for (let cx = x + 4; cx < x + 29; cx += 6) rect(cx, 顶 + 2, 1, 4);  // 桁架腹杆
    fill(p.wire); rect(x + 2, 顶 + 7, 28, 1);
    const s = h2(seed + 287, Math.round(bx));
    if (ph.lampGain > 0.2) {
      mA(0.55 + 0.45 * Math.max(ph.lampGain, 0.35));
      fill(s > 0.5 ? (p.green || p.greenDark) : p.danger); rect(x + 14, 顶 + 3, 3, 3);
      mA(0.14 + 0.18 * ph.lampGain); rect(x + 11, 顶, 9, 9);
      mA(1); ctx.fillStyle = p.pole;
    }
  }
  // 远岸/坡地：一条按背景坐标连续下降（或抬升）的岸线，填到画面底。
  // 合同第 3 条要「下方河谷或地面」，但从车顶往下看是被自己的车挡住的 ——
  // 能画的是**对岸**：一条斜降到河面的岸线，加上河面那一条反光。
  function m岸(p, ph, seed, x, bx, 高, w, 降, 色) {
    const 顶 = sx => 高 + Math.round(降 * (sx - x) / Math.max(1, w)) +
      Math.round(5 * vnoise(sx + bx, seed + 313, 70));
    mA(1); fill(色);
    列程(顶, x, x + w, (i, n, t) => rect(i, t, n, VHGL - t));
    fill(p.steelDark);
    for (let sx = Math.max(0, x); sx < Math.min(VWGL, x + w); sx += 2) rect(sx, 顶(sx), 2, 1);
  }
  // ---------- 隧道（合同第 4 条）----------
  // 洞口必须走 **1:1 视差**：它是「列车要穿过去的那个洞」，站在轨道线上，
  // 不是路边一座远处的房子。放进 0.55 的中景带里，车到洞口那一刻洞还在画面偏左，
  // 尺度关系就错了 —— 闸门 _dt4_mid 专门量「洞口中心与抵达时刻对齐」。
  function m洞口(p, ph, seed, x, 宽, 亮) {
    const 顶 = G.ROOF - 30 - camYRef, 底 = VH2;             // 洞顶在车顶线以上 30px
    mA(1);
    fill(p.line); rect(x + 13, 顶, Math.max(0, 宽 - 26), 底 - 顶);   // 门洞里是黑的
    fill(p.panelLo); rect(x, 顶 - 8, 14, 底 - 顶 + 8); rect(x + 宽 - 14, 顶 - 8, 14, 底 - 顶 + 8);
    fill(p.panel); rect(x, 顶 - 8, 14, 3); rect(x + 宽 - 14, 顶 - 8, 14, 3);
    fill(p.steelDark);
    for (let y = 顶 + 6; y < 底 - 4; y += 11) { rect(x + 1, y, 12, 1); rect(x + 宽 - 13, y, 12, 1); }
    fill(p.steelLo); rect(x - 12, 底 - 14, 宽 + 24, 14);               // 翼墙与仰坡坡脚
    fill(p.steelDark); rect(x - 12, 底 - 14, 宽 + 24, 2);
    fill(p.steelDark); rect(x - 8, 顶 - 17, 宽 + 16, 9);               // 棚洞檐：读得出「山从洞顶压过来」
    for (let i = 0; i < 4; i++) rect(x + 8 + Math.round(i * (宽 - 16) / 3), 顶 - 8, 3, 8);
    if (亮) {                                                          // 洞口缘灯与标志灯
      mA(0.5 + 0.5 * ph.lampGain); fill(p.lampCol);
      rect(x + 2, 顶 - 4, 3, 3); rect(x + 宽 - 5, 顶 - 4, 3, 3);
      mA(0.22 + 0.2 * ph.lampGain); rect(x - 2, 顶 - 8, 11, 11); rect(x + 宽 - 9, 顶 - 8, 11, 11);
      mA(0.6); fill(p.danger); rect(x + (宽 >> 1) - 1, 顶 - 22, 3, 3); mA(1);
    }
  }
  let VH2 = 270;
  function 隧道口带(p, M, camX, camY, VW, VH) {
    VH2 = VH;
    const ph = p.ph, 亮 = ph.lampGain > 0.25 || ph.cityLit > 0.1;
    for (const z of M.worldZones) {
      if (z.kind !== 'tunnel') continue;
      for (const 门 of [z.x0, z.x1]) {
        const sx = 门 - camX - 30;                              // 门洞宽 60，中心对准分区边界
        if (sx > VW + 80 || sx + 60 < -80) continue;
        m洞口(p, ph, M.worldSeed, sx, 60, 亮);
      }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
  }

  // 一个地块里排什么。风格与疏密都走**地块级慢噪声**，所以相邻地块是「同一片区的下一段」，
  // 不是逐槽独立抽签（那正是合同禁止的「每节车厢后面随机换一张背景」）。
  function 地块(p, ph, seed, k, o, kind, camY) {
    const bx0 = k * MID.街, x0 = Math.round(bx0 - o), 宽 = MID.街;
    const 地 = sx => Math.round(midGround(sx + o, seed) - camY);        // 这一列的地面线（屏幕行）
    const 风格 = 地段w(seed, k, 31), 疏密 = 地段w(seed, k, 77), 高偏 = 地段w(seed, k, 149);
    // 顶带避让：地标类的构件，顶边不许停在车顶障碍那一条带里。
    // 单位：这一层里 底/顶 都是**屏幕行**，而 G.ROOF 是世界 y ⇒ 带A/带B 在 midBand 里已经换过算了。
    // 抬升量取 46 而不是 4：只停在车顶线上方几像素的一条竖边，**就是**障碍块的剪影 ——
    // _dt4_mid 第 7 节量「带内有强竖边、而带上方 6~40 行的参考带里没有」，
    // 先按 -4 实现时工业章的孤立列从 8 涨到 20，等于没抬。
    const 带顶 = 带A, 带底 = 带B;
    // 禁区是「带顶以上 40 行 ~ 带底」；抬升量再按构件自己的背景坐标哈希取 40~86 行，
    // 不是全部抬到同一条线上 —— 全抬平等就是一条平天际线，把「高低变化」抹平了。
    const 顶避 = (t, k) => (t > 带顶 - 40 && t < 带底)
      ? 带顶 - 40 - Math.round(h2(seed + 307, Math.round(k)) * 46) : t;
    // 高：给定「底 + 想要的净高」，返回一个顶边不会停在障碍带里的高度。
    // 短储罐、矮管架这类东西的顶正好落在车顶线那 30px 里 —— 一条「只在这条带里出现、
    // 往上不继续」的矮胖竖边就是车顶障碍的形状（合同第 7 条要分开的那种混淆）。
    // 处理方式是合同允许的第一种：把地标挪开（顶抬到带以上），而不是给前景描边。
    const 高 = (底, h, k) => 底 - 顶避(底 - h, k);
    const 路 = () => m街道(p, ph, seed, x0, bx0, 地(x0) , 宽);
    if (kind === 'edge') {
      // 城市边缘·商业带：一条街 + 一排板楼，楼高沿地块渐变（同一片区的天际线）
      路();
      let cx = x0 + 4;
      while (cx < x0 + 宽) {
        const gbx = Math.round(cx + o), s = h2(seed + 211, gbx);
        // 楼高刻意压在「远山山脚」以下：合同第三阶段定的规矩是远山为主景，
        // 城市章也不能让楼把山和天整个吃掉（第一版楼高 70~176，出图一看是两堵墙夹一条缝）。
        let w = Math.round(18 + s * 34), h = Math.round(44 + 高偏 * 34 + s * 40);
        if (s > 0.90) { h += 46; w += 6; }                              // 偶尔一栋地标级高层
        const 底 = 地(cx), 顶 = 顶避(底 - h, gbx);
        if (s > 0.22) m楼(p, ph, seed, cx, Math.round(cx + o), 底, w, 底 - 顶, s, '商业');
        cx += w + Math.round(9 + (1 - 疏密) * 26);
      }
      if (风格 > 0.62) m输电(p, ph, seed, x0 + Math.round(宽 * 0.5), Math.round(x0 + 宽 * 0.5 + o), 地(x0 + Math.round(宽 * 0.5)), 118);
    } else if (kind === 'suburb') {
      路();
      let cx = x0 + 3;
      while (cx < x0 + 宽) {
        const gbx = Math.round(cx + o), s = h2(seed + 223, gbx);
        const 底 = 地(cx);
        if (风格 > 0.66 && s > 0.55) {
          const w = Math.round(20 + s * 22), h = Math.round(52 + 高偏 * 40 + s * 34);
          m楼(p, ph, seed, cx, gbx, 底, w, 底 - 顶避(底 - h, gbx), s, '住宅');
          cx += w + Math.round(11 + (1 - 疏密) * 20);
        } else {
          const w = Math.round(18 + s * 16), h = Math.round(34 + s * 34 + 高偏 * 16);
          m民居(p, ph, seed, cx, gbx, 底, w, 高(底, h, gbx), s);
          cx += w + Math.round(10 + (1 - 疏密) * 26);
        }
      }
    } else if (kind === 'field') {
      // 开阔地：远山是主景，中景只占稀疏的树、一段围栏、偶尔一座农舍与输电塔。
      // 「稀疏」不是「没有」—— 第一版这里只有 2.9% 可见，出图上等于空层。
      let cx = x0 + 2;
      while (cx < x0 + 宽) {
        const gbx = Math.round(cx + o), s = h2(seed + 233, gbx), 底 = 地(cx);
        if (s < 0.52 - 疏密 * 0.30) { cx += 14; continue; }             // 疏密决定「这里有没有树」
        const h = Math.round(40 + s * 52);
        m树(p, ph, seed, cx, gbx, 底, h, s);
        if (h2(seed + 239, gbx) > 0.58) m树(p, ph, seed, cx + 12, gbx + 12, 地(cx + 12), Math.round(h * 0.74), s);
        cx += Math.round(30 + (1 - 疏密) * 44);
      }
      if (风格 > 0.40) m围栏(p, ph, seed, x0, bx0, 地(x0) + 2, 宽);
      const tx = x0 + Math.round(宽 * (0.20 + 风格 * 0.55));
      m输电(p, ph, seed, tx, Math.round(tx + o), 地(tx), Math.round(118 + 高偏 * 34));
      if (疏密 > 0.58) { const ax = x0 + Math.round(宽 * 0.78); m水塔(p, ph, seed, ax, Math.round(ax + o), 地(ax), 66); }
    } else if (kind === 'river') {
      let cx = x0 + 2;
      while (cx < x0 + 宽) {
        const gbx = Math.round(cx + o), s = h2(seed + 241, gbx), 底 = 地(cx);
        if (s > 0.42) m树(p, ph, seed, cx, gbx, 底, Math.round(30 + s * 40), s);
        cx += 18;
      }
      m岸(p, ph, seed, x0 - 30, bx0, 地(x0) - 6, 宽 + 60, Math.round(18 + 疏密 * 14), p.glassDark);
      mA(1); fill(p.glass);
      for (let sx = Math.max(0, x0 - 30); sx < Math.min(VWGL, x0 + 宽 + 30); sx += 15)
        if (h2(seed + 257, Math.round(sx + o)) > 0.45) rect(sx, 地(x0) + 8, 7, 1);
      if (风格 > 0.42) m围栏(p, ph, seed, x0, bx0, 地(x0) + 2, 宽);
      if (风格 > 0.52) { const wx = x0 + Math.round(宽 * 0.35); m水塔(p, ph, seed, wx, Math.round(wx + o), 地(wx), 74); }
      const px2 = x0 + Math.round(宽 * 0.72);
      m输电(p, ph, seed, px2, Math.round(px2 + o), 地(px2), 108);
    } else if (kind === 'viaduct') {
      // 桥面高程是**定值**而不是跟着本地地面起伏：真实的引桥是有纵坡的工程结构，
      // 让它跟着 midGround 抖，护栏就会随机漂进车顶障碍那一条带里（合同第 7 条要的正是别混）。
      // 我们这座桥的桥面压在世界 214（车顶线以下，只在车厢连接处与车内窗带里露出来），
      // 对面那座引桥抬在世界 140（障碍带以上）—— 两座桥一上一下，「桥体结构」才读得出来。
      const 桥面 = G.ROOF + 12 - camY, 对桥 = G.ROOF - 62 - camY;
      // 河谷：先画对岸与河面，桥才像是「跨在什么东西上面」而不是浮在空处
      const 岸高 = Math.round(地(x0) + 6);
      m岸(p, ph, seed, x0 - 40, bx0, 岸高 - Math.round(20 + 风格 * 14), 宽 + 80,
        Math.round(22 + 疏密 * 20), p.ballastLo);
      mA(1); fill(p.glassDark);
      rect(Math.max(0, x0 - 40), 岸高 - 4, Math.min(VWGL, 宽 + 80), 6);
      fill(p.glass); for (let cx = x0 - 30; cx < x0 + 宽; cx += 17)
        if (h2(seed + 149, Math.round(cx + o)) > 0.5) rect(cx, 岸高 - 2, 8, 1);
      for (let cx = x0 + 12; cx < x0 + 宽; cx += 74)
        m桥墩(p, ph, seed, cx, Math.round(cx + o), 岸高 + 10, 桥面, 桥面);
      m桥面(p, ph, seed, x0, bx0, 桥面, 宽);
      for (let cx = x0 + 34; cx < x0 + 宽; cx += 96)
        m桥墩(p, ph, seed, cx, Math.round(cx + o), 岸高 + 4, 对桥, 对桥);
      m桥面(p, ph, seed, x0 - 90, bx0, 对桥, 宽 + 180);
      // 桥塔：每个地块一座。斜拉桥的塔是等间距的，按随机缺席会让「桥」这条信息读不出来
      const tx = x0 + Math.round(宽 * (0.18 + 风格 * 0.56)), gbx = Math.round(tx + o);
      m桥塔(p, ph, seed, tx, gbx, 桥面, Math.round(150 + 高偏 * 62), 疏密 > 0.5);
      const sx2 = x0 + Math.round(宽 * 0.86);
      m信号(p, ph, seed, sx2, Math.round(sx2 + o), 桥面, h2(seed + 251, Math.round(sx2 + o)));
    } else if (kind === 'industrial') {
      let cx = x0 + 2;
      const 排 = Math.floor(风格 * 4);                                  // 这一段的四种排布方式
      let n = 0;
      while (cx < x0 + 宽) {
        const gbx = Math.round(cx + o), s = h2(seed + 257, gbx + n * 7), 底 = 地(cx);
        const 类 = (排 + n) % 4;
        if (类 === 0) { const w = Math.round(52 + s * 46); m厂房(p, ph, seed, cx, gbx, 底, w, 高(底, Math.round(58 + 高偏 * 40 + s * 30), gbx), s > 0.4); cx += w + 8; }
        else if (类 === 1) { const w = Math.round(20 + s * 16); m储罐(p, ph, seed, cx, gbx, 底, w, 高(底, Math.round(50 + s * 46), gbx)); cx += w + 12; }
        else if (类 === 2) { const w = Math.round(60 + s * 40); m管架(p, ph, seed, cx, gbx, 底, w, 高(底, Math.round(40 + s * 26), gbx)); cx += w + 6; }
        else { m框架(p, ph, seed, cx, gbx, 底, Math.round(40 + s * 30), 高(底, Math.round(62 + s * 46), gbx)); cx += 74; }
        // 工作灯：灯头抬到障碍带以上，光锥往下洒 —— 合同第 5 条「夜晚由有来源的灯光揭示结构」
        const 亮 = !有昼夜模块 || DayNight.rank(seed + 9, gbx, n, 191) < ph.lampOn;
        m工作灯(p, ph, seed, cx - 20, gbx, 底, 高(底, 76, gbx + 5), 亮 && ph.lampGain > 0.2);
        n++;
      }
      // 每个地块至少一根烟囱：它是工业区的「方向感」来源，随机缺席会让人认不出这是同一片厂区
      const stx = x0 + Math.round(宽 * (0.30 + 风格 * 0.4));
      m烟囱(p, ph, seed, stx, Math.round(stx + o), 地(stx), Math.round(132 + 高偏 * 60));
      if (疏密 > 0.5) { const sx3 = x0 + Math.round(宽 * 0.82);
        m储罐(p, ph, seed, sx3, Math.round(sx3 + o), 地(sx3), Math.round(22 + 疏密 * 10),
          高(地(sx3), Math.round(58 + 疏密 * 40), Math.round(sx3 + o))); }
    } else if (kind === 'approach') {
      // 接近终点站：不是一栋站房打发过去。站场修在比路轨高一层的地台上（先填地台再画东西，
      // 否则后排屋脊下面是空的，读起来就是飘着 —— 合同第 6 条要的「真实、连续的地区」），
      // 地台上是镇区屋脊 + 站房 + 站台雨棚 + 门型接触网架 + 信号群。
      // 夜里这一段的灯有明确来源：站台灯、檐下光团、门架显示、站房窗，不是随机亮点。
      // 站场整体垫在一层地台上。抬升量原来取 34，出图一看站台的雨棚、门架、站台灯**全部躲在车体后面**
      // —— 地台面在世界 182~218，而车顶线在 202，从车顶机位看只露出上面 16px，
      // 结果「接近终点站」这一章白天看着和城市边缘没区别（只看见后排镇区屋顶）。
      // 抬到 58：地台顶在世界 158~194，站台檐口与门架横梁回到车顶线以上，这一段才真的读得出是站场。
      const 台 = 58;
      const 台地 = sx => 地(sx) - 台;
      mA(1); fill(p.ballastLo);
      列程(台地, x0, x0 + 宽, (i, n, t) => rect(i, t, n, VHGL - t));
      fill(p.ballastHi);
      列程(台地, x0, x0 + 宽, (i, n, t) => rect(i, t, n, 1));
      // 挡土墙立面：地台不是泥土而是站场挡墙 —— 压顶石下面每隔 26px 一道伸缩缝、
      // 墙脚一道暗线。不这么做这里就是一整条没有信息量的暗面（白天尤其明显）。
      fill(p.steelDark);
      for (let sx = Math.max(0, x0 + 8); sx < Math.min(VWGL, x0 + 宽); sx += 26) {
        const t = 台地(sx); rect(sx, t + 3, 1, 20);
      }
      fill(p.steel);
      列程(sx => 台地(sx) + 24, x0, x0 + 宽, (i, n, t) => rect(i, t, n, 1));
      // 站前街道铺在地台上（不是原来的地面层）：先填地台再铺路，
      // 否则路面与灯柱整个被地台盖掉，夜里这一段就少一排灯。
      m街道(p, ph, seed, x0, bx0, 台地(x0) + 2, 宽);
      let rx = x0 + 5;                                     // 后排：镇上的屋脊，把天际线垫起来
      while (rx < x0 + 宽) {
        const gbx = Math.round(rx + o), s = h2(seed + 271, gbx);
        m民居(p, ph, seed, rx, gbx, 台地(rx) - 2, Math.round(24 + s * 18),
          高(台地(rx) - 2, Math.round(30 + s * 30 + 高偏 * 14), gbx), s);
        rx += Math.round(30 + (1 - 疏密) * 30);
      }
      const w = Math.round(90 + 风格 * 90), cx = x0 + Math.round((1 - 疏密) * 60);
      m站房(p, ph, seed, cx, Math.round(cx + o), 台地(cx) + 2, w,
        高(台地(cx) + 2, Math.round(56 + 高偏 * 34), Math.round(cx + o)));
      m雨棚(p, ph, seed, x0 + 6, bx0, 台地(x0 + 6) + 2, Math.round(宽 * (0.55 + 风格 * 0.42)));
      for (let gx = x0 + 18; gx < x0 + 宽 - 34; gx += 92) {
        const gbx = Math.round(gx + o);
        // 门架净高走 高() ⇒ 顶边一定在障碍带上方 40 行以外；信号就挂在这道横梁上，
        // 它本体（2px 杆 + 6×6 灯头）自己站在车顶线里就是「孤立矮块」，挂在门架上才读得出是同一件事
        const 门高 = 高(台地(gx) + 2, Math.round(62 + h2(seed + 293, gbx) * 22), gbx);
        m门架(p, ph, seed, gx, gbx, 台地(gx) + 2, 门高);
        m信号(p, ph, seed, gx + 44, Math.round(gx + 44 + o), 台地(gx) + 6 - 门高, h2(seed + 251, gbx + 7));
      }
      if (风格 > 0.5) { const tx = x0 + 宽 - 40; m输电(p, ph, seed, tx, Math.round(tx + o), 台地(tx), 112); }
    }
    // 坡面：把这一格的地面填成实体，构件才像是「长在地上」而不是浮着
    mA(1); fill(p.ballastLo);
    列程(地, x0, x0 + 宽, (i, n, t) => rect(i, t, n, VHGL - t));
    // 这里试过给坡面加一层稀疏碎石斑（明暗两色、6px 一格，约 106 笔/帧），想让车窗里那道坡
    // 别是一道平填。**A/B 量出来是死成本**：把斑整段关掉，窗带判据的跳变数一字不差（178→178）。
    // 原因是这条屏幕窗带里真正是「玻璃」的列只占约 17%（82/480），斑基本落在车厢壁与窗框后面。
    // 撤掉。窗景可读性真正管用的是竖起来的东西 —— 见 7b 那批 1:1 高构件。
  }
  let VWGL = 480, VHGL = 270;
  function midBand(p, M, S, camX, camY, VW, VH, kind) {
    if (S.dbg && S.dbg.mid === false) return;      // 纯视角开关：性能 A/B 与量具反证用
    VWGL = VW; VHGL = VH;
    带A = G.ROOF - camY - 30; 带B = G.ROOF - camY + 2;      // 障碍带（屏幕行），见「带压」
    const ph = p.ph, seed = M.worldSeed + 2, o = camX * MID.par;
    // 与视口相交的地块只有 2~3 格（街宽 420、视口 480）。余量取 ±90px 而不是整格：
    // 这一层里会越出自己格子的构件最多伸出 90px（高架的引桥 m桥面 x0-90 / 宽+180），
    // 之前按整格放余量 ⇒ 每帧多画 1~2 格几乎全在屏外的楼，白白吃掉这一层三成的落笔。
    const 首 = Math.floor((o - 90) / MID.街), 末 = Math.floor((o + VW + 90) / MID.街);
    for (let k = 首; k <= 末; k++) 地块(p, ph, seed, k, o, kind, camY);
  }
  // 这里原来有一个「近地雾」：在世界 ROOF-30 ~ ROOF 这条障碍带上整幅刷一层天顶色薄雾，
  // 用来满足合同第 7 条的「降低局部对比」。已删除，原因是刷雾不分对象——
  // 它把身后的天空与远山一起压平，真机闸门 _ph8_motion 量到夜里「远山那一级 vs 天空」
  // 只剩 Δ2.5（判据 ≥6），等于为了压中景把远景的色阶毁掉。
  // 替代做法在「带压 / m细」那里：只降这一层自己的细纹理，远景一层一点不动。

  // 极远景两层（山脊 + 云带），所有地貌 kinds 共用，视差比 far 还小。
  // 为什么单独加：三层视差的底边是硬锚在 GZ-128 / GZ-74 / GZ 上的（见 layer 的 base），
  // 也就是说**没有任何一层画到世界 y 250 以上**；而站在车顶时相机可见区间是 y 34.6~304.6
  // （train-play.js 的 ty = feet - VH*0.62，ROOF=202），于是屏面上半部 230 行只有纯色天空。
  // 只用既有 PAL 键（steelDark/glassDark/skyList），不新增色板键 —— 否则 _check_train_draw
  // 的「色板逐键必须随 TOD 派生」那条会因为我加了常量而红。
  // 极远景：连续地形轮廓的两层山脊 + 一层云带。
  //
  // 为什么整段重写：前面四版都是「若干层等高矩形叠罗汉」，第四版已经证明那种画法**不成立** ——
  // 收窄小了是长方形、收窄大了每层顶边仍是平的，一排平顶加竖边读起来就是楼群；
  // 调底宽/收窄系数/颜色都属于碰运气，而闸门与颜色种数四次全绿，画面四次不对。
  //
  // 现在的做法：海拔是**背景坐标的纯函数**（value noise 三层叠加，低频为主 + 少量局部峰），
  // 沿 x 每 8px 采一个点，在采样点间插值并逐列填到地平线。
  // ① 相邻采样点连续 ⇒ 不会有分离的「山座」；② 每列的顶边就是轮廓本身 ⇒ 不会露矩形顶边；
  // ③ 自变量是背景坐标（含视差与 camX），所以区段重载、重访同一段不会跳变，
  //    也不存在按区段生成的接缝（这里根本不分段）。
  function vnoise(bx, seed, cell) {
    const i = Math.floor(bx / cell), f = bx / cell - i;
    const a = h2(seed, i), b = h2(seed, i + 1), u = f * f * (3 - 2 * f);   // smoothstep
    return a + (b - a) * u;
  }
  function ridgeH(bx, seed, 包络种子) {
    // 合同第 4 条要的是「山峰大小、坡度和间距有变化」，而三层定值叠加出来的振幅到处一样，
    // 跑完整条线像一堵被均匀揉皱的布。所以：
    //   包络  一条比主频还慢两级的调制曲线 ⇒ 有的地段是大山、有的地段只是缓丘，间距随之变；
    //   主    原来那三层叠加（低频为主），保证连续、可插值、按世界坐标稳定；
    //   尖    一个高次幂项，只在主值本来就高的地方冒出来 ⇒ 个别山头明显拔高，而不是整体变尖。
    // 三项都只吃 (背景坐标, seed)，与时间无关 ⇒ 昼夜不会让山形重排。
    // **包络必须所有地貌共用同一条**（吃层基准 seed，不吃地貌各自的 so）：它代表的是
    // 「这一带是大山还是缓丘」，属于地段、不属于地貌类型。上一版让它跟着 so 走，八种地貌
    // 各抽一条包络；而远层视差只有 0.05，一整章也就扫过几百背景像素 ⇒ 一条包络在一个地段
    // 里几乎是常数，于是「河滩章的地平线比开阔章低」这种系统性差别被各自抽到的包络盖掉了
    // （闸门 A2 实测量到 river 284 反而高于 field 278）。共用之后，同一地段的山体大小只有一套，
    // 地貌之间的差别才回到 ground 上。
    const 包络 = 0.55 + 0.45 * vnoise(bx, (包络种子 === undefined ? seed : 包络种子) + 131, 920);
    const 主 = vnoise(bx, seed, 380) * 0.56 + vnoise(bx, seed + 31, 150) * 0.26 + vnoise(bx, seed + 77, 58) * 0.12;
    const 尖 = Math.pow(vnoise(bx, seed + 199, 240), 2.2) * 0.46 * Math.max(0, 主 - 0.34);
    return Math.min(1, (主 + 尖) * 包络);
  }
  // ---------- 逐地貌的极远景轮廓（阶段七：空间与美术一致性） ----------
  // 阶段六只做了「一套山脊给所有地貌」，验收时留下的缺口：industrial / river / approach
  // 共用同一条剪影，站在车顶上开一小时，窗外的地平线从头到尾是同一座山。
  // 合同要的是「景物与列车世界位置和章节主题关联」「不能每章都出现相同三栋楼」。
  //
  // 用户 2026-09-29 已拍板：**远山是主景**。我第一版把 town/city/plant 写成「整条剪影换成
  // 平顶楼群」，出图一看是两堵墙：丘陵没了，而且楼与楼等宽等距，
  // 比阶段六那版「等高矩形叠罗汉」还机械 —— 那正是被否掉的画法。
  // 所以现在的结构是  海拔 = 山脊×本地量 + 人造物×(1 - 山脊×本地量)，
  // 也就是**人造物只往山脊上方的空天里长**，永远不替掉山；每个形态还留大片空档，
  // 让山脊本身仍是读得到的那条线。
  //
  // 关键约束（阶段六四轮失败换来的，别再破坏）：
  //   · 海拔必须是**背景坐标的纯函数**，不能按区段分段生成 —— 一分段就有接缝、一重载就跳变。
  //   · 所以「换地貌」不能写成「到这一章就换一套画法」，只能写成**两个地貌按世界位置加权混合**：
  //     形状本身仍按背景坐标取（视差速度不变），只有「掺多少」随世界位置连续变化。
  //   · 平顶与烟囱这类**硬边**必须逐列取值：每 8px 采一点再插值会把楼沿抹成 8px 宽的斜坡。
  // 人造物返回的是**绝对海拔**（0 = 这里没有东西），合成用 max 而不是加法。
  // 这一点是被判据逼出来的：第一版写成「山脊 + 人造物×(1-山脊)」，量出来 industrial/approach
  // 一整屏只有 1 段平顶 —— 因为给一条起伏的曲线加一个常数，顶边**仍然是那条曲线**，
  // 楼根本没露出来。取 max 之后：山比楼高的地方看见山，楼比山高的地方看见平的屋顶。
  const OVER = {
    // 城郊：低矮、稀疏、**宽度与间距都不同**的屋群（摩天楼留给高架章，别处不许长那么高）
    houses: (bx, s) => {
      const cell = 26, k = Math.floor(bx / cell), f = bx / cell - k, t = h2(s + 7, k);
      if (t < 0.40) return 0;
      const 宽 = 0.34 + h2(s + 191, k) * 0.42, 偏 = h2(s + 233, k) * (1 - 宽);
      if (f < 偏 || f > 偏 + 宽) return 0;
      return 0.42 + h2(s + 29, k) * 0.22 + (f > 偏 + 宽 * 0.62 ? 0.05 : 0);   // 半边略高 = 单坡屋顶
    },
    // 高架章：远处一片城市天际线，稀疏、高，个别带塔尖。
    // 合同第 4 条明确禁止「一排相同平顶块」，而这一版之前正是那副样子：
    // 每格固定占 0.08~0.92（等宽）、高度只在 0.55~0.85 里小幅抖动（等高等距）。
    // 现在宽度、格内位置、高度各自独立取哈希，并且给高楼加退台，天际线才有台阶。
    towers: (bx, s) => {
      const cell = 44, k = Math.floor(bx / cell), f = bx / cell - k, t = h2(s + 3, k);
      if (t < 0.44) return 0;
      const 宽 = 0.28 + h2(s + 61, k) * 0.48, 偏 = h2(s + 83, k) * (1 - 宽);
      if (f < 偏 || f > 偏 + 宽) return 0;
      const 高 = 0.40 + t * 0.44 + h2(s + 97, k) * 0.12;
      if (高 > 0.70 && (f < 偏 + 宽 * 0.24 || f > 偏 + 宽 * 0.76)) return 高 - 0.17;   // 退台
      return 高 + (t > 0.90 && Math.abs(f - (偏 + 宽 / 2)) < 0.045 ? 0.16 : 0);        // 个别塔尖
    },
    // 工业带：厂房屋顶 + 稀疏但**高度互不相同**的烟囱 + 矮圆柱储罐
    stacks: (bx, s) => {
      const cell = 58, k = Math.floor(bx / cell), f = bx / cell - k, t = h2(s + 11, k);
      if (t > 0.74 && f > 0.34 && f < 0.46) return 0.80 + h2(s + 17, k) * 0.15;
      if (t < 0.22 && f > 0.52 && f < 0.88) return 0.56 + t * 0.1;
      if (f < 0.06 || f > 0.94) return 0;
      return 0.55 + t * 0.18;
    },
    // 接近终点：长条站房与雨棚，站房之间是空地
    sheds: (bx, s) => {
      const cell = 96, k = Math.floor(bx / cell), f = bx / cell - k, t = h2(s + 41, k);
      if (f > 0.78) return 0;
      return 0.56 + t * 0.18 + (f > 0.70 ? 0.10 : 0);
    },
  };
  // 每种地貌自带一个 seed 偏移。**必须由地貌自己携带，不能按「本地/邻接」的角色给** ——
  // 我第一版写成「主形态用 seed、邻接形态用 seed+101」，于是同一种地貌在边界左边是
  // seed+101、在边界右边是 seed，两条山脊根本是不同的随机实现，
  // 交界那一列直接跳 17px：混合权重明明是连续的，画面却仍然在换页。
  // 闸门 A1 就是照这个反例校准的（肉眼在单张交界图上完全看不出来）。
  const ZPROF = {
    edge: { ground: 1.00, so: 0 }, field: { ground: 1.00, so: 0 }, tunnel: { ground: 1.00, so: 0 },
    river: { ground: 0.45, so: 101 },                              // 河滩：只有很缓的坡，地平线压得很低
    suburb: { ground: 0.86, over: 'houses', so: 202 },
    approach: { ground: 0.88, over: 'sheds', so: 303 },
    viaduct: { ground: 0.94, over: 'towers', so: 404 },
    industrial: { ground: 0.90, over: 'stacks', so: 505 },
  };
  // 拆成两半是为了让「这一列的顶边到底是山还是楼」可问 —— 夜里给远处城市点窗，
  // 必须知道哪几列是建筑、建筑的顶在第几行，在山坡上点窗就是画错东西了。
  function hillOf(z, bx, seed, 包络种子) { return z.ground * (0.42 + 0.58 * ridgeH(bx, seed, 包络种子)); }
  function overOf(z, bx, seed) { return z.over && OVER[z.over] ? OVER[z.over](bx, seed + z.so) : 0; }
  function elevOf(z, bx, seed, zoneOn, 包络种子) {
    // ground 必须同时缩放「基准量」和「起伏量」。只缩放起伏（旧写法 `ridgeH × ground`）时，
    // 河滩那种低 ground 得到的仍是一条平均高度几乎不变的地平线，只是不那么陡 ——
    // 合同第 4 条要的「相对高度按地带区分」在画面上读不出来（闸门 A2 就是为此而存在）。
    const hill = hillOf(z, bx, seed, 包络种子);
    if (!zoneOn || !z.over) return hill;
    return Math.max(hill, overOf(z, bx, seed));
  }
  const FADE = 620;                                   // 地貌交界处的混合带（世界像素）
  const sstep = t => t * t * (3 - 2 * t);
  // 返回 [邻接地貌, 本地貌, 邻接权重]。
  // 权重方向是个真容易写反的地方，写反时**画面看着仍然"有渐变"**，只有逐像素扫交界才发现：
  // 我第一版写成 `0.5 * sstep(dl / FADE)`，意思是「刚进这一章时邻接占 0、走满 620px 后占一半」——
  // 于是**正处在边界那一格反而从 100% 老地貌直接跳到 100% 新地貌**，渐变被做成了换页。
  // 正确的形状是：边界正中各占一半，离边界越远邻接权重越小，走满 FADE 后完全是本地貌。
  function mixAt(zs, i, wx) {
    const z = zs[i], main = ZPROF[z.kind] || ZPROF.field;
    const dl = wx - z.x0, dr = z.x1 - wx;
    if (i > 0 && dl < FADE) return [ZPROF[zs[i - 1].kind] || ZPROF.field, main, 0.5 * (1 - sstep(dl / FADE))];
    if (i + 1 < zs.length && dr < FADE) return [ZPROF[zs[i + 1].kind] || ZPROF.field, main, 0.5 * (1 - sstep(dr / FADE))];
    return [main, main, 0];
  }
  // 山脊的逐列顶线单独成一个函数，不是为了复用代码，而是天体层需要它。
  // 远山的 alpha 只有 0.88：星点先画、山后画，星就会从山体里透出来
  // —— 实测实体内部因天体层产生的亮度增量最大 13.9、超过 6 的像素有 73~120 个。
  // 合同第 3 条禁止「星点透过建筑实体显示」，所以落笔之前必须先问：这一列的山脊线在第几行。
  // 三道山脊唯一的参数来源：绘制与裁剪都从它算，两边不会各算各的轮廓。
  // floorH/varH 是按「平均海拔 300 / 258 / 224」定的三档阶梯（海拔 = floorH + varH × 合成量，
  // 合成量对开阔章的均值 ≈0.65）；上限 floorH+varH 决定最高山头能顶到哪一行 ——
  // 远层最高 346 ⇒ 屏幕第 39 行，**上面 0~38 行永远是天**。这不是审美偏好，是合同第 1 条
  // 「不要用纯色填满车顶上半屏」的反面：山如果把屏幕顶都盖住，天空层次就白做了
  // （闸门 _dt1_baseline 的机位自检专量这个）。
  const RIDGES = [
    { par: 0.05, floorH: 211, varH: 135, seedOff: 70, zoneOn: true, rimH: 1 },
    { par: 0.085, floorH: 186, varH: 110, seedOff: 96, zoneOn: false, rimH: 1 },
    { par: 0.12, floorH: 165, varH: 90, seedOff: 120, zoneOn: false, rimH: 2 },
  ];
  function ridgeTops(M, camX, r) {
    const base = GZ - 30, o = camX * r.par, by = Y(base);
    const zs = M.worldZones, seed = M.worldSeed + r.seedOff;
    const 顶 = new Int32Array(VWG), 楼 = new Int8Array(VWG);
    let zi = 0;
    while (zi + 1 < zs.length && camX >= zs[zi + 1].x0) zi++;     // 分区是有序的，游标只往前走
    for (let sx = 0; sx < VWG; sx++) {
      const wx = camX + sx;
      if (zi + 1 < zs.length && wx >= zs[zi + 1].x0) zi++;
      const mx = mixAt(zs, zi, wx), bx = sx + o, w = mx[2];
      const e = elevOf(mx[1], bx, seed + mx[1].so, r.zoneOn, seed) * (1 - w) +
        elevOf(mx[0], bx, seed + mx[0].so, r.zoneOn, seed) * w;
      // 顶边由权重占大的那一侧决定；只有那一侧「人造物高于山脊」，这一列才真的站着楼。
      // 判错会在山坡上点出一排窗 —— 那是画错东西，不是画得糙。
      if (r.zoneOn) {
        const z = w > 0.5 ? mx[0] : mx[1];
        if (z.over && overOf(z, bx, seed) > hillOf(z, bx, seed, seed)) 楼[sx] = 1;
      }
      顶[sx] = Math.round(by - (r.floorH + r.varH * e));
    }
    return { 顶, 楼 };
  }
  // 缓存键带 camX / camY / 画布宽 / worldSeed：同一帧内 world() 与 farBand() 取到同一份，
  // 镜头一动或模型一换（reset 后 seed 变）就重算，不会把上一帧的轮廓当成本帧的。
  let 顶缓存 = { x: NaN, y: NaN, vw: 0, sd: NaN, list: null };
  function ridgeTopsAll(M, camX) {
    if (顶缓存.list && 顶缓存.x === camX && 顶缓存.y === camYRef && 顶缓存.vw === VWG &&
      顶缓存.sd === M.worldSeed) return 顶缓存.list;
    顶缓存 = { x: camX, y: camYRef, vw: VWG, sd: M.worldSeed, list: RIDGES.map(r => ridgeTops(M, camX, r)) };
    return 顶缓存.list;
  }
  // 逐列「最靠上的那一道山脊线」：这一行及以下属于实体，天体不许画进去。
  function 天体裁剪线(M, camX, VW) {
    const list = ridgeTopsAll(M, camX), 线 = new Int32Array(VW);
    for (let sx = 0; sx < VW; sx++) 线[sx] = Math.min(list[0].顶[sx], list[1].顶[sx], list[2].顶[sx]);
    return 线;
  }
  function ridgeLayer(p, col, alpha, r, 顶) {
    const by = Y(GZ - 30), rimH = r.rimH;
    // body 逐列填，缘亮线按「同一水平段合并成一个矩形」。
    // 合并不是省事的优化 —— 缘线如果逐列画 1px，斜坡上会留下半行高的锯齿毛刺；
    // 按段合并后坡面是干净的，只有真正平的那一段才有一条亮边。
    ctx.globalAlpha = alpha; fill(col);
    // 每一列的顶边海拔 = floorH + varH × 合成量，而合成量自带 0.42 的底数，
    // 所以 floorH 只要保证「底数那一档也高过车顶线」即可（ROOF=202、路基在 420 ⇒ 屏幕车顶线 167）。
    // 上一版的底数是 0，一半采样点的海拔只有 80~150，山脊整段藏在车体后面，
    // 只在个别位置冒出一截斜坡，看着像渲染坏了。
    for (let sx = 0; sx < VWG; sx++) {
      const t = 顶[sx];
      rect(sx, t, 1, Math.round(by - t) + 1);                    // 逐列、互不重叠，半透明叠不出竖条
    }
    const rimCol = r.rimCol;
    if (rimCol && rimH > 0) {
      fill(rimCol);
      let sx = 0;
      while (sx < VWG) {
        const t = 顶[sx]; let e = sx;
        while (e + 1 < VWG && 顶[e + 1] === t) e++;
        // 只在「这一段比左右邻居都高」的地方画缘：谷底相接处不该有亮边，
        // 否则整条山脚会描出一圈不该存在的白线。
        const 左 = sx ? 顶[sx - 1] : t + 9, 右 = e + 1 < VWG ? 顶[e + 1] : t + 9;
        if (t <= 左 && t <= 右 && t > -4000) rect(sx, t, e - sx + 1, rimH);
        sx = e + 1;
      }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
  }
  let VWG = 480;                                               // world() 每帧写进来，避免把参数一路串下去

  // 云：按背景坐标的纯函数生成，形状与时间无关（时间只改颜色和多少）。
  // 第一版的云是「三条等高的横杠」+ 取色 skyList[2]（最暗那条天带），
  // 于是白天看到的是蓝天上抹了几道黑泥。现在：
  //   · 取云团轮廓 = 一个主脊 + 若干隆起（lobes），每块高度由 hash 定，读起来是「一团」不是「一条」；
  //   · 受光面用 cloudLit（白天近白、黄昏暖橙、夜里深蓝灰），底面用 cloudBase（永远比顶暗）；
  //   · 覆盖量随 starA 收窄：夜里只剩少量云影，符合合同「少量云影」。
  function cloudBand(p, M, camX, VW) {
    const ph = p.ph, seed = M.worldSeed + 7;
    const 云A = 0.80 - 0.34 * ph.starA;
    const 门槛 = 0.14 + 0.34 * ph.starA;
    const 顶 = rgbStr(ph.cloudLit), 底 = rgbStr(ph.cloudBase);
    const step = 132, o = -((camX * 0.05) % step);
    for (let i = -1; i * step - o < VW + step; i++) {
      const k = Math.floor(camX * 0.05 / step) + i, t = h2(seed + 977, k);
      if (t < 门槛) continue;
      const gx = Math.round(o + i * step + h2(seed + 419, k) * 26);
      const 底y = 96 + h2(seed + 313, k) * 86;          // 云底高度
      const w = Math.round(56 + t * 78);                 // 宽 56~134：云是「横着一片」不是竖一块
      const 厚 = Math.round(4 + h2(seed + 71, k) * 5);   // 平底那一层的厚度
      // 平底：先铺一条通宽的底面（背光、比顶暗），这是「一团」而不是「几条杠」的关键
      ctx.globalAlpha = 云A; fill(底); rect(gx, Y(底y), w, 厚);
      // 顶缘：沿宽度每 7px 取一个隆起高度，中间高两边收，逐段填成实体
      // 顶缘：沿宽度每 7px 取一个隆起高度，中间高两边收。
      // 每一段都要**从云底实心填到它自己的高度** —— 上一版只填「与上一段的高度差」，
      // 于是隆起之间留下竖向缺口，一团云散成一排浮在空中的短横杠。
      let 前高 = -1;
      for (let x = 0; x < w; x += 7) {
        const f = (x + 3.5) / w;
        const 收 = Math.min(1, Math.min(f, 1 - f) * 5.2);              // 两端收到 0
        const 起伏 = h2(seed + 53, k * 23 + (x / 7 | 0)) * 0.55 + h2(seed + 67, k * 7 + (x / 14 | 0)) * 0.45;
        const h = Math.round((3 + 起伏 * 15) * 收);
        if (h === 前高) continue;                                       // 同高就并段，不逐 7px 落笔
        前高 = h;
        const 宽 = Math.min(7, w - x);
        ctx.globalAlpha = 云A; fill(顶);
        rect(gx + x, Y(底y - h), 宽, h);                               // 实心：顶到云底
        ctx.globalAlpha = 云A * 0.85; fill(底);
        rect(gx + x, Y(底y - 1), 宽, 1);                                // 最底一行压暗
      }
      // 底缘压暗一行：让云有「下面更厚」的体积感，而不是一张纸
      ctx.globalAlpha = 云A * 0.75; fill(底); rect(gx + 4, Y(底y + 厚), w - 8, 2);
      // 高空卷云：一条更淡的薄纱，给天空第二层深度
      if (h2(seed + 2011, k) > 0.58) {
        ctx.globalAlpha = 云A * 0.40; fill(顶);
        const hy = 26 + h2(seed + 803, k) * 30;
        rect(gx + 10, Y(hy), Math.round(w * 0.62), 1);
        rect(gx + 26, Y(hy + 3), Math.round(w * 0.38), 1);
      }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
  }

  function farBand(p, M, S, camX, camY, VW, VH) {
    if (S.dbg && S.dbg.far === false) return;   // 性能 A/B 用的视角开关：只关这一层，数据一字不动
    const ph = p.ph;
    // 云在山脊**之前**画：远山该挡住云脚，反过来画会让云糊在山头上，
    // 夜里尤其明显（云比山亮，山头像被云吞了）。
    cloudBand(p, M, camX, VW);
    // 三道山脊，绝对色 + 各自的 alpha（空气透视：越远越往天上融）。
    // 为什么从两道变三道：合同要求夜里「保留适度轮廓与明度分层」，两道时中间没有过渡，
    // 白天的地平线也只读得出「天 / 山」两级。
    // 每道都带一条 1~2px 的**缘亮线**（ridgeRim）：夜里山体本身比它身后的地平线辉光还暗，
    // 只靠体色会糊成一整块黑，缘线才是「读得出连续山脊」的那一笔。
    // **人造物只长在最后面那道**：前面再叠一片平顶，两层楼沿前后一咬合，
    // 实测整条地平线变成一堵泥墙，山脊这条主景反而读不出来。
    const A = ph.ridgeA, 列 = ridgeTopsAll(M, camX);
    for (let i = 0; i < RIDGES.length; i++) {
      const r = Object.assign({ rimCol: rgbStr(ph.ridgeRim[i]) }, RIDGES[i]);
      ridgeLayer(p, rgbStr(ph.ridge[i]), A[i], r, 列[i].顶);
    }
    远城窗(p, M, camX, 列);                   // 三道都画完再点窗：前山挡住的地方窗也不许透出来
    // 地平线雾带：把山脚与地面带接上，越靠地平线越浓（hazeA 控制）
    const 雾 = Math.max(0, Math.min(0.6, ph.hazeA));
    for (let n = 0; n < 5; n++) {
      ctx.globalAlpha = 雾 * (0.18 + n * 0.18);
      fill(rgbStr(ph.horizon));
      rect(0, Y(天底 - 46 + n * 9), VW, 9);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
  }

  // 远处城市的窗灯：只长在「人造物高于山脊」的那些列上。
  // 这条是第二阶段遗留清单第 2 条：高架/工业/接近章远处那排塔楼是 farBand 的 over 人造物，
  // 走的是山脊这条路径，layer() 里那套 town/city 窗灯根本不知道它们在哪，
  // 于是深夜实测图里远处城市是一片死黑平板 —— 合同禁止「借夜色掩盖重复建筑」。
  // 哪一扇窗存在由 (背景坐标, seed) 的哈希定、哪一扇亮由 cityLitAt 的稳定 rank 定，
  // 点亮比例是相位的连续量 ⇒ 同 seed 同 p 逐扇一致，不会每帧重新随机。
  function 远城窗(p, M, camX, 列) {
    const ph = p.ph;
    if (!有昼夜模块 || !(ph.cityLit > 0)) return;
    const r = RIDGES[0], seed = M.worldSeed + r.seedOff, by = Y(GZ - 30);
    fill(p.lampCol); ctx.globalAlpha = 0.28 + 0.52 * ph.cityLit;
    for (let sx = 0; sx < VWG; sx++) {
      if (!列[0].楼[sx]) continue;
      // 前两道山盖住的那一行以下没有窗：楼被山挡住时，亮窗不能从山身上透出来
      const 限 = Math.min(by, 列[1].顶[sx] - 1, 列[2].顶[sx] - 1, 列[0].顶[sx] + 46);
      // 窗位按列错开（每 5 列一竖排，相位按 8 列一块换），整列都点会画成灯带而不是窗
      if ((sx + ((h2(seed, sx >> 3) * 5) | 0)) % 5) continue;
      for (let y = 列[0].顶[sx] + 3; y < 限; y += 6)
        if (DayNight.cityLitAt(ph, seed, (sx + camX * r.par) | 0, y)) rect(sx, y, 1, 2);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
  }

  // 中景/近景的分区混合：farBand 已经按世界位置混了，但 `layer()` 是**按相机中心所在分区整层换内容**的，
  // 于是驶出隧道那一刻，中景从「什么都没有」直接变成一整排站房、近景从芦苇变成信号杆 —— A11 量到
  // 单步整屏平均亮度跳 18.4，这就是合同第四条禁止的「章节边界换页」。
  // 混合带用 sstep（与 farBand 同一条曲线形状），但窗口宽度这一项中景自己定，见下面的 中淡。
  // 混合带：farBand 用 FADE=620。中景这一层用**更宽**的 中淡，不是随手加数：
  // 同样一段路，近的图层扫过的内容比远层多，所以「按同一距离淡入」在画面上其实更快
  // —— 闸门 _dt4_mid 第 6 节量出来 tunnel→approach 一步 82.6‰，而章节中段正常行进只有 30.1‰
  // （判据 ≤2.2 倍）。而这一层的密度差本来就极端：洞内 0%、站场 96%，
  // 620px 的窗口等于把整片站场在 2.3 秒里推出来。放宽到 1400px（≈5 秒）之后回到基准的 1.5 倍以内。
  const 中淡 = 1400;
  function midMix(M, wx) {
    const zs = M.worldZones;
    let i = 0; while (i + 1 < zs.length && wx >= zs[i + 1].x0) i++;
    const z = zs[i], dl = wx - z.x0, dr = z.x1 - wx;
    if (i > 0 && dl < 中淡) return [zs[i - 1].kind, z.kind, 0.5 * (1 - sstep(dl / 中淡))];
    if (i + 1 < zs.length && dr < 中淡) return [zs[i + 1].kind, z.kind, 0.5 * (1 - sstep(dr / 中淡))];
    return [z.kind, z.kind, 0];
  }

  // 天空：三段绝对色（天顶 → 上层 → 地平线）画成 6px 一格的窄带。
  // 为什么不再是三条宽带：白天那版「车顶以上是一片 #81afd3」正是合同点名的「纯色填满上半屏」；
  // 而黄昏要的「地平线偏暖、上层先转冷」、黑夜要的「有深度的暗色层次」，
  // 三条带都表达不出来。窄带仍然是 fillRect，没有用 createLinearGradient（像素风硬约束）。
  // 6px 一格在 420 世界像素里铺 70 条，白天整段亮度从 104 爬到 196，
  // 单格差 ≈1.3（8bit 下不足一个可见色阶）⇒ 看得见「有层次」，看不见「有横条」。
  // 天底 = 画面上「看得见的地平线」所在的世界 y，取车顶线略上方（ROOF=202）。
  // 为什么不用 GZ-30=420 当地平线：世界坐标里 420 才是路基，但站在车顶时屏幕只到 202，
  // 420 那一段整块被车体挡住。黄昏的暖色如果按 420 铺，就永远铺在屏幕外，
  // 结果第一版黄昏实测是「整屏糊一层紫」——正是合同禁止的「只给全画面叠一层橙色矩形」。
  // 把天底挪到 200，暖色才落在眼睛真正看到的那条线上。
  const 天底 = 200;
  const 地平世界 = GZ - 30;
  // 某一世界高度上「纯净天空」应该是什么颜色：三段（天顶→上层→地平线）按 f = y/天底 插值。
  // 单独成函数并导出，是为了让量具能问「这一行本该是天还是山」而不必抄一遍公式 ——
  // 抄公式的那份判据已经过期过一次：它把山顶当成「不是天」，误判成机位传错。
  function skyColAt(ph, wy) {
    const 混 = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)];
    const f = Math.max(0, Math.min(1, wy / 天底));
    return f < 0.55 ? 混(ph.zenith, ph.upper, f / 0.55) : 混(ph.upper, ph.horizon, (f - 0.55) / 0.45);
  }
  // 屏幕第 r 行「纯净天空」的最终呈现色：把收尾那层全屏 grade 压色一起算进来。
  // 判据要认的是「这一行是不是天」，而它拿到的像素是压过色的，所以压色必须由同一份公式给出。
  function skyPixel(pal, r, camY) {
    const ph = pal.ph, c = skyColAt(ph, r + camY), a = ph.gradeA || 0;
    return c.map((v, i) => v * (1 - a) + ph.grade[i] * a);
  }
  function skyRamp(p, VW) {
    const 带 = 6;
    for (let y = 0; y < 地平世界 + 带; y += 带) {
      fill('rgb(' + skyColAt(p.ph, y).join(',') + ')');
      rect(0, Y(y), VW, 带);
    }
    ctx.fillStyle = p.dark;
  }
  // 像素圆盘：按行取弦宽，不用 arc（本项目的画法只有 fillRect）。
  // 给了 线（逐列山脊线）就逐列裁：圆盘落在山后的那一截不画 —— 日落山后、月出山后本就该被挡住，
  // 而远山只有 0.88 的不透明度，压不住亮色，不裁就等于「星月透过实体显示」。
  function 圆盘(cx, cy, r, col, 弦缩, 线) {
    if (r <= 0) return;
    fill(col);
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.round(2 * Math.sqrt(Math.max(0, r * r - dy * dy)) * (弦缩 || 1));
      if (w <= 0) continue;
      const y = cy + dy, x0 = cx - (w >> 1);
      if (!线) { rect(x0, y, w, 1); continue; }
      let s = -1;
      for (let x = x0; x < x0 + w; x++) {
        if (y < 线(x)) { if (s < 0) s = x; }
        else if (s >= 0) { rect(s, y, x - s, 1); s = -1; }
      }
      if (s >= 0) rect(s, y, x0 + w - s, 1);
    }
  }
  function world(p, M, S, camX, camY, VW, VH) {
    camYRef = camY;
    VWG = VW;                                                   // 山脊逐列宽度：裁剪与绘制共用
    const ph = p.ph;
    const zc = M.zoneAt(camX + VW / 2);
    skyRamp(p, VW);
    // 星 / 日 / 月：三件事各自是一条连续量，不再是「night 画星、dusk 画个方块、day 什么都没有」。
    // 星星的数量按 starA 连续增加（40 个位置由 worldSeed 定，不随时间重新随机），
    // 太阳沿固定弧线落下、月亮随后升起，两者在 starA≈0.5 处交叠 —— 这一段就是「可感知的黄昏」。
    // dbg.celestial=false 是纯视角开关：只跳过这三个天体，数据与其余图层一字不动。
    // 量具需要它，否则「时间推进不许改变背景形状」那条判据会被日月自己的移动污染。
    const 天体 = !S.dbg || S.dbg.celestial !== false;
    const 地平屏 = Y(天底);
    // dbg.far=false 时山根本没画，没有东西可挡，此时不裁（否则量具关掉远景会误判成「星点自己消失了」）。
    const 遮 = (S.dbg && S.dbg.far === false) ? null : 天体裁剪线(M, camX, VW);
    const 线 = 遮 ? (x => 遮[x < 0 ? 0 : x >= VW ? VW - 1 : x | 0]) : null;
    if (天体 && ph.starA > 0) {
      const 数 = Math.round(40 * ph.starA);
      ctx.globalAlpha = Math.min(1, ph.starA);
      for (let i = 0; i < 数; i++) {
        const sx = h2(M.worldSeed, i) * VW, sy = h2(M.worldSeed, i + 99) * 地平屏 * 0.86;
        const 亮星 = h2(M.worldSeed, i + 555) > 0.82;
        const cx0 = Math.round(sx), cy0 = Math.round(sy);
        // 十字星会占到左右各一列、上下各一行：任何一角落进山体就整颗不画（半颗星更难看）。
        if (线 && (cy0 + (亮星 ? 1 : 0) >= 线(cx0) || cy0 >= 线(cx0 - 1) || cy0 >= 线(cx0 + 1))) continue;
        fill(p.steelHi); rect(sx, sy, 1, 1);
        if (亮星) { ctx.globalAlpha = Math.min(1, ph.starA) * 0.45; rect(sx - 1, sy, 3, 1); rect(sx, sy - 1, 1, 3);
          ctx.globalAlpha = Math.min(1, ph.starA); }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
    }
    if (天体 && ph.sunA > 0.01) {
      const r = Math.max(3, Math.round(ph.sunSize / 2));
      // 弧线锚在「屏幕顶到可见地平线」这一段，而不是世界地平线：
      // 世界地平线在 420，站在车顶上根本看不见，按它算会让正午的太阳也压在屏幕外。
      const sx = Math.round(VW * (0.86 - 0.62 * (1 - ph.sunY))), sy = Math.round(地平屏 - 8 - ph.sunY * (地平屏 - 34));
      const 核 = rgbStr(ph.sunCol);
      ctx.globalAlpha = ph.sunA * 0.16; 圆盘(sx, sy, r * 3, 核, 1, 线);            // 外圈散光
      ctx.globalAlpha = ph.sunA * 0.30; 圆盘(sx, sy, Math.round(r * 1.7), 核, 1, 线);
      ctx.globalAlpha = ph.sunA; 圆盘(sx, sy, r, 核, 1, 线);
      if (!线 || Math.max(sy - r - 2, sy - r - 1) < Math.min(线(sx - 1), 线(sx))) {
        ctx.globalAlpha = ph.sunA * 0.55; fill(rgbStr(ph.cloudLit)); rect(sx - 1, sy - r - 2, 2, 2);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
    }
    if (天体 && ph.moonA > 0.01 && ph.moonSize > 0) {
      const r = Math.max(3, Math.round(ph.moonSize / 2));
      // 月亮的位置只由 moonA 这条连续量决定（不跟着山脊线跳）：合同第 5 条要的是
      // 「昼夜只改变颜色和明暗」，如果为了躲山把月亮每帧挪一下，那就是随镜头变的形状。
      const sx = Math.round(VW * 0.22), sy = Math.round(地平屏 * (0.50 - 0.32 * ph.moonA));
      const 面 = rgbStr(ph.moonCol);
      ctx.globalAlpha = ph.moonA * 0.16; 圆盘(sx, sy, r * 3, 面, 1, 线);           // 月晕
      ctx.globalAlpha = ph.moonA; 圆盘(sx, sy, r, 面, 1, 线);
      ctx.globalAlpha = ph.moonA * 0.55; fill(p.steelDark);                 // 月海，避免一个纯白饼
      if (!线 || sy < Math.min(线(sx - r + 2), 线(sx - r + 3))) rect(sx - r + 2, sy - 1, 2, 2);
      if (!线 || sy + 3 < Math.min(线(sx + 1), 线(sx + 2))) rect(sx + 1, sy + 2, 2, 2);
      if (!线 || sy - r + 2 < Math.min(线(sx + 2), 线(sx + 3))) rect(sx + 2, sy - r + 3, 2, 1);
      // 原来这里还有一枚「亏角」：用天顶色画一个偏右上方的暗盘去咬月亮。看图抓到它读起来
      // 像日食而不像云经过 —— 暗盘半透明（0.80），既没把亮盘吃干净，又在自己身上留了一圈
      // 比月晕还暗的边；而天顶色也不等于月亮所在那一行的天空色。
      // 删掉，改成「满月 + 三块月海」：`moonA` 这条曲线本来表达的是「月亮在不在天上」，
      // 不是月相，合同也没有要求月相，硬造一个相位只会把量具里的圆面积判据带偏。
      ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
    }
    farBand(p, M, S, camX, camY, VW, VH);              // 极远景：先画，后面所有层都压在上面
                                                       // 地貌不再由参数给，而是逐列按世界位置取
    // 分区地面底色
    fill(p.ballastLo); rect(0, Y(GZ - 30), VW, VH);
    for (const z of M.worldZones) {
      const a = z.x0 - camX, b = z.x1 - camX;
      if (b < -40 || a > VW + 40) continue;
      ctx.fillStyle = z.kind === 'river' ? p.glassDark : z.kind === 'field' ? p.floorLo : z.kind === 'industrial' ? p.steelDark : p.ballastLo;
      ctx.fillRect(px(Math.max(0, a)), Y(GZ - 30), px(Math.min(VW, b) - Math.max(0, a)), 30);
      const nz = M.worldZones[M.worldZones.indexOf(z) + 1];
      if (nz && b > 0 && b < VW) { fill(p.steelDark); rect(b - 1, Y(GZ - 34), 3, 34); }
    }
    // 三层各自吃自己的系数：合同要求「远景 / 中景 / 轨旁近景」同时随时间变化，
    // 而第一阶段量过，这三层当时的三档比值分别是 0.30 / 0.34 / 0.31，与色板整体 0.372 差不到 0.07
    // —— 也就是它们从来没有分开过。子色板只换 fill 的取值，不改任何构件位置。
    layer(p.pFar, zc.kind, 'far', camX, camY, VW, VH, M.worldSeed + 1, 0.24);
    // 中景不再走 layer() 的 'mid' 分支（那条分支的底边钉在 GZ-74，永远在画面外），
    // 改由 midBand 按世界位置逐地块画。邻接章节的中景仍按老办法交叉淡入，
    // 淡入量走 midMix —— 与 farBand 同一条 FADE/sstep，两层在同一处开始变、同一处变完。
    const mm = midMix(M, camX + VW / 2);
    // 真正的交叉淡入淡出：本层按 (1−w) 画、邻层按 w 画。
    // 原来沿用 layer() 的写法「本层恒 1 + 邻层 w」，那是 cross-in 不是 cross-fade：
    // 相机中心一过分区线，两层身份互换，画面从 (A=1,B=0.5) 跳到 (B=1,A=0.5)。
    // 在「邻层根本没有中景」的工业→隧道边界上，这等于整条中景轮廓一帧内消失
    // （闸门量到 92.5% 的列同时突变，判据 ≤6%）。
    const 交 = mm[2] > 0 && mm[0] !== mm[1];
    中景乘 = 交 ? 1 - mm[2] : 1;
    midBand(p.pMid, M, S, camX, camY, VW, VH, zc.kind);
    if (交) {
      中景乘 = mm[2];
      midBand(p.pMid, M, S, camX, camY, VW, VH, mm[0]);
    }
    中景乘 = 1;
    // 三层新层各自要吃什么系数，是 _dt1_inventory「跨机位复核」逼出来的：那个机位专门拍
    // 「车列外空段 + 地面高度」，而这三层恰好只在那里落笔。全用主色板（k=1）会让这一整块
    // 画面重新被「一次全屏线性变换」解释（实测残差 20+ → 18.7），合同禁止的「三个调色预设」
    // 就是这么复活的。
    // 定系数的规矩不是「凑过判据」，而是**这块地面离灯有多远**。夜里站场唯一的光源就是轨旁
    // 那几盏灯，所以一条从钢轨退到中景脚线的地坪，亮度必须沿距离连续掉下去：贴着路基的那条
    // 股道还吃到 nearK（1.06），退到脚线那一条已经和楼群一样在阴影里（midK 0.62）。
    // 上一版按视差把整条带压成一个 0.865、三条股道 0.73/0.80/0.99 —— 等于宣布「站场纵深不随
    // 距离变暗」，既不合物理，也正是 _dt1 残差掉下来 0.1 的那 0.1 从哪来。
    // 不新增色板键：夜里没画过的新键会让 _check_train_draw 的「色板逐键必须随 TOD 派生」红。
    const 排 = t => 子色板(p, p.ph.midK + (p.ph.nearK - p.ph.midK) * t);
    const 站场板 = 排(0.14);                                  // 地坪主体：整条带里离灯最远的那一大片
    端外站场(站场板, M, S, camX, VW, Y,
      [排(0.05), 排(0.42), 排(0.80)]);                        // 三条股道：由远及近逐条亮起
    端外地面(排(0.90), M, S, camX, VW, Y);                    // 紧贴路基的那一条，几乎与近景同亮
    // 近景 1:1：路基、钢轨、枕木、接触网
    const gy = Y(GZ);
    fill(p.ballast); rect(0, gy, VW, VH - gy);
    pxNoise(ctx, 0, gy, VW, 10, p.ballastHi, M.worldSeed + 5, 0.10);
    fill(p.sleeper);
    for (let x = Math.floor(camX / M.sleeperStep) * M.sleeperStep; x < camX + VW; x += M.sleeperStep) rect(x - camX, gy - 3, 12, 4);
    fill(p.rail); rect(0, gy - 5, VW, 2); fill(p.railHi); rect(0, gy - 5, VW, 1);
    fill(p.rail); rect(0, gy + 1, VW, 2); fill(p.railHi); rect(0, gy + 1, VW, 1);
    路基细节(p, M, S, camX, gy, VW, VH, zc.kind);      // 吃主色板：它装饰的就是上面这几行钢轨/枕木
    layer(p.pNear, zc.kind, 'near', camX, camY, VW, VH, M.worldSeed + 3, 1, S);
    if (mm[2] > 0 && mm[0] !== mm[1]) {                  // 近景同理：芦苇↔信号杆这类换内容也要交叉淡入
      ctx.globalAlpha = mm[2];
      layer(p.pNear, mm[0], 'near', camX, camY, VW, VH, M.worldSeed + 3, 1, S);
      ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
    }
    // 轨旁构件分两级高度。原来只有一级：柱顶在世界 282（`gy-168`），而车顶线是 202、车窗带是
    // 232~278 —— 整层 1:1 近景从头到尾压在车顶线以下：站在车顶看不见，往窗外看也只看见路基
    // （补遗记的「这一层玩家基本看不见」就是它）。现在按本作自己的比例把接触网支柱做到真实高度：
    // 车顶到钢轨 248px ≈ 4.2m ⇒ 约 59px/m，于是柱顶 = 世界 62（6.6m）、承力索 110、接触导线 128。
    // 128 这一条**刻意留在山脊带（137~200）以上**：量具找「远层与天空之间那条边」是按行找跳变，
    // 一根通宽的 1px 导线要是压在某个山脊的顶行上，那一列的因果差会被它吃掉。
    // 支柱间距取 `poleStep*4`（1320~1920px ≈ 22~32m，与真实接触网同量级）：原来一屏四根短柱，
    // 密到会在障碍带（172~202）上种出一片竖线与车顶货箱抢形。
    const 柱距 = M.poleStep * 4;
    if (!S.dbg || S.dbg.near !== false) {                      // 与 layer() 里那个开关同一个键
    fill(p.wire); rect(0, gy - 322, VW, 1);                     // 接触导线（世界 128，通宽）
    for (let x = Math.floor(camX / 柱距) * 柱距; x < camX + VW + 柱距; x += 柱距) {
      const a = x - camX, 跨 = Math.min(VW, a + 柱距) - a, 半 = 跨 >> 1;
      rect(a, gy - 340, 半, 1); rect(a + 半, gy - 334, 跨 - 半, 1);   // 承力索：跨中下垂
      rect(a, gy - 340, 1, 4); rect(a + 跨 - 1, gy - 340, 1, 4);      // 两端的吊弦
    }
    fill(p.pole);
    for (let x = Math.floor(camX / M.poleStep) * M.poleStep; x < camX + VW + M.poleStep; x += M.poleStep) {
      const sx = x - camX; rect(sx, gy - 168, 3, 168); rect(sx - 12, gy - 168, 28, 3); rect(sx - 7, gy - 158, 18, 2);
      fill(p.wire); rect(sx, gy - 152, 2, 4); ctx.fillStyle = p.pole;
    }
    fill(p.pole);
    for (let x = Math.floor(camX / 柱距) * 柱距; x < camX + VW + 柱距; x += 柱距) {
      const sx = x - camX;
      rect(sx, gy - 388, 4, 388);                               // 柱身
      fill(p.wire); rect(sx + 4, gy - 388, 1, 388); fill(p.pole);   // 背光侧一条暗边
      rect(sx - 1, gy - 390, 6, 2);                             // 柱顶帽
      rect(sx - 26, gy - 356, 26, 2); rect(sx - 24, gy - 372, 20, 1);   // 腕臂 + 斜拉杆
      rect(sx - 26, gy - 354, 2, 12);                           // 定位器
      rect(sx - 7, gy - 18, 18, 2); rect(sx - 7, gy - 16, 2, 16); rect(sx + 9, gy - 16, 2, 16);
    }
    }
    // 隧道不再按「相机中心在不在隧道里」一刀切。CarLight 早就有一条 ramp（tunnelAt，
    // 洞口内外各 TUN_RAMP 像素线性淡入淡出），窗景用的是它；而车顶/外部这一层用的是二值判断，
    // 于是进洞那一瞬间：窗外是渐暗，整个屏幕却「啪」地糊成管壁 —— 合同第七阶段第四条
    // 要的是「隧道入口提前出现、进入后窗外与车顶环境同步改变、驶出后平滑恢复」。
    // 现在两层共用同一条 ramp，洞口前一段管壁是**半透明压上来**的，能同时看见洞外的天与洞内的壁。
    // 洞口：在洞外就要看得见（1:1 视差，随车逼近），所以画在 TD 压层**之前** ——
    // 进洞那一刻门洞被管壁接管，出洞时背后那座门洞继续往左退，读起来是「穿过了一个洞」。
    隧道口带(p, M, camX, camY, VW, VH);
    const TD = typeof CarLight !== 'undefined' ? CarLight.tunnelAt(M, camX + VW / 2)
      : (zc.kind === 'tunnel' ? 1 : 0);
    if (TD > 0) {
      // 洞内：遮住天空、远山与开放中景，改由洞壁结构 + 检修灯 + 有限的侧向设备组成。
      // 原来这里只有一层 p.dark 全屏压黑 + 一根根竖肋（肋画在 gy-210，也就是车顶线以下，
      // 从车顶机位看整根被车体挡住），所以「进洞」在画面上只是「变黑」，读不出在隧道里。
      const 顶 = G.ROOF - 30 - camY;
      ctx.globalAlpha = TD; fill(p.dark); rect(0, 0, VW, VH);
      // 拱顶以上不再是「一片纯黑」：隧道是埋在岩体里的一根管子，屏幕上半那一段应该是
      // 衬砌外壁与岩层。原来那里只有 p.dark 的全屏压黑 —— 白天进洞时上半屏是一个没有
      // 任何信息的黑洞（出图检查发现的，出洞那一侧同样）。
      ctx.globalAlpha = TD * 0.90; fill(p.steelLo); rect(0, 0, VW, 顶 + 7);
      ctx.globalAlpha = TD * 0.5; fill(p.steelDark);
      for (let y = 10; y < 顶; y += 27) rect(0, y, VW, 2);                 // 岩层层面
      ctx.globalAlpha = TD * 0.35; fill(p.steel);
      for (let y = 24; y < 顶; y += 27) rect(0, y, VW, 1);                 // 层面里的浅色夹层
      ctx.globalAlpha = TD;
      fill(p.steelLo); rect(0, 顶, VW, 7);            // 拱顶衬砌
      fill(p.steelDark); rect(0, 顶 + 7, VW, 4);
      fill(p.shadowTint || p.line); rect(0, 顶 + 11, VW, 2);                 // 拱脚线
      for (let x = Math.floor(camX / 300) * 300; x < camX + VW + 300; x += 300) {
        const sx = x - camX;
        fill(p.steel); rect(sx, 0, 9, VH);                                  // 环向肋（整根管壁）
        fill(p.steelHi); rect(sx, 顶, 9, 2);
        fill(p.steelDark); rect(sx + 9, 顶 + 34, 24, 4);                     // 电缆桥架
        fill(p.wire); rect(sx + 9, 顶 + 38, 24, 2); rect(sx + 9, 顶 + 42, 24, 1);
        fill(p.steelLo); rect(sx + 9, VH - 52, 28, 5);                       // 检修人行道
        fill(p.steelDark); rect(sx + 9, VH - 47, 28, 2);
        fill(p.hazard || p.paintHi); rect(sx + 9, VH - 52, 3, 5);
        fill(p.steelDark); rect(sx + 30, 顶 + 60, 10, 16);                   // 设备箱/消防箱
        fill(p.steel); rect(sx + 31, 顶 + 62, 8, 6);
      }
      // 检修灯：每 150 世界像素一盏，哪几盏坏掉由世界坐标的稳定哈希定
      // （进洞再出来必须是同一批坏灯，不能每次重新随机）
      for (let x = Math.floor(camX / 150) * 150; x < camX + VW + 150; x += 150) {
        const sx = x - camX;
        if (有昼夜模块 && DayNight.rank(M.worldSeed + 3, x | 0, 0, 227) > 0.86) continue;
        fill(p.lampCol); ctx.globalAlpha = TD * (0.62 + 0.38 * ph.lampGain); rect(sx + 5, 顶 + 12, 8, 3);
        for (let i = 1; i <= 7; i++) {                                       // 光锥往下摊开
          ctx.globalAlpha = TD * 0.045 * i;
          rect(sx + 5 - i, 顶 + 15 + i * 7, 8 + i * 2, 7);
        }
        ctx.globalAlpha = TD * 0.10; fill(p.lampCoolE); rect(sx, VH - 54, 20, 3);
      }
      // 洞壁渗流：同样按世界坐标哈希，位置不随时间/次数变
      fill(p.steelDark);
      for (let x = Math.floor(camX / 47) * 47; x < camX + VW; x += 47)
        if (h2(M.worldSeed + 13, x) > 0.72) { const sx = x - camX;
          rect(sx, 顶 + 11, 1, Math.round(18 + h2(M.worldSeed + 17, x) * 26)); }
      ctx.globalAlpha = 1; ctx.fillStyle = p.dark;
    }
  }
  const sky2 = f => TrainGen.WORLD_H * f;

  // ---------- 角色 ----------
  // 两遍上色：先把每个矩形外扩 1px 画成轮廓色，再画本体，剩下的那圈就是剪影描边。
  // 为什么非要这圈线：角色并入统一光照后，夜里本体最暗处亮度 22、身后地板 31 —— 人直接融进背景。
  // 试过让角色「少变暗一点」，救不回来（光照系数打到 0.3 也只拉开 10 级），
  // 而且那一改动会把「一整套 TOD 派生」变成例外分支，反而更不统一。分离度交给描边承担。
  // 描边色只有一条规则（见 PAL 里的 actorOut）：背景亮用暗线，背景暗用亮线。
  function figure(p, parts) {
    // 双色描边：外圈亮、内圈暗。
    // 为什么必须两圈：单色描边的亮度是从「暗线」连续插到「亮线」的，中间一定要穿过
    // 背景自己的亮度 —— 实测在 p≈0.65（昏转夜中点）描边与山坡等亮，对比掉到 1.2，
    // 同一时刻躯干也与背景等亮（0.5）。那正是合同第 6 条禁止的「黄昏/夜里人陷进背景」。
    // 两圈一明一暗，无论背景落在哪一档，至少有一圈与它相差 ≥60。
    // 两圈的次序按「谁负责顶背景谁贴背景」排：`actorOut` 的定义就是与背景极性相反的那条
    // （背景亮→描暗线，背景暗→描亮线），所以它必须在**最外圈**才摸得到背景；`actorOut2` 取反极性，
    // 贴在里面给本体一个内缘。原来正好画反：夜里最外圈是近黑的 actorOut2（亮度 8.3），
    // 贴着同样暗的夜景，等于把该干活的那圈浪费在暗对暗上 —— 量具（tools/_dt5_read.js 的边缘强度）
    // 因此报出「开阔地·车顶·黑夜」只有 11.1。
    for (const q of parts) { fill(p.actorOut); rect(q[0] - 2, q[1] - 2, q[2] + 4, q[3] + 4); }
    for (const q of parts) { fill(p.actorOut2); rect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2); }
    for (const q of parts) { fill(q[4]); rect(q[0], q[1], q[2], q[3]); }
  }
  function human(p, e, X, Y, face, hurt) {
    const x = X(e.x), y = Y(e.y);
    fill(p.dark); rect(x - 1, y + e.h - 1, e.w + 2, 2);
    figure(p, [
      [x, y + 10, e.w, e.h - 14, hurt ? p.danger : p.clothShade],
      [x + 2, y + 12, e.w - 4, 8, p.cloth],
      [x + 1, y + 12, e.w - 2, 5, p.vest],
      [x + 5, y + 1, e.w - 10, 9, p.skin],
      [x + 4, y, e.w - 8, 3, p.hair],
      [x + (face > 0 ? e.w - 8 : 3), y + 4, 5, 2, p.greenDark],
      [x + 2, y + e.h - 6, 6, 6, p.clothDark],
      [x + e.w - 8, y + e.h - 6, 6, 6, p.clothDark],
      [x + (face > 0 ? e.w : -13), y + 14, 13, 3, p.metal],
      [x + (face > 0 ? e.w + 8 : -11), y + 13, 3, 2, p.metal],
    ]);
  }
  function zombie(p, c, X, Y) {
    const e = c.e, x = X(e.x), y = Y(e.y);
    if (c.dead) { fill(p.zSkinD); rect(x - 2, y + e.h - 6, e.w + 4, 6); return; }
    fill(p.dark); rect(x - 1, y + e.h - 1, e.w + 2, 2);
    figure(p, [
      [x, y + 8, e.w, e.h - 12, c.hp < 60 ? p.zSprintSkin : p.zSkin],
      [x + 2, y + 10, e.w - 4, 6, p.zSkinS],
      [x + 5, y, e.w - 10, 9, p.zSkin],
      [x + 6, y + 4, 2, 2, p.zEye],
      [x + e.w - 8, y + 4, 2, 2, p.zEye],
      [x - 3, y + 12, 4, 3, p.zSkinD],
      [x + e.w - 1, y + 12, 4, 3, p.zSkinD],
      [x + 2, y + e.h - 5, 6, 5, p.clothDark],
      [x + e.w - 8, y + e.h - 5, 6, 5, p.clothDark],
    ]);
  }

  // ---------- 主入口 ----------
  // 通过台门：之前门实体一直存在却没有任何分支画它，所以车厢之间看着就是虚空。
  // 画出来之后还要能一眼看出「这扇要不要撞很久」：卡死门加斜撑与警示条。
  // ---------- 门：开合动画 ----------
  // 门型分派的依据全部来自已有数据（检查点的 gate 字段、门的 id、jammed），不新增关卡字段：
  //   据点闸门 → 垂直上提（它比别的门厚重，且守满才开，提起来才读得出「机构」）
  //   端门 d-entry / d-final → 向内拉开（投影变窄 + 自由边亮棱，侧视里唯一诚实的摆动画法）
  //   卡死门 → 先抖 0.3 再被踹开、崩出碎片
  //   其余通过台门 → 水平口袋滑门
  // 开度只影响画法：碰撞、可过性、路线、检查点仍然只看 opened 这个二值集合（合同第 4 条）。
  let 闸门ID = {};                                     // 每次 scene 从头建，同 viewKRef，不跨帧留陈旧数据
  // 世界内文字标签的锚点（世界坐标）。渲染与量具读同一份，闸门里就不该再抄一遍坐标 ——
  // _ph7_space A7 原来写死了 `FLOOR-100 / FLOOR-138`，本轮把两个标签分别抬到 -118 与 -156，
  // 那个采样点就悄悄落在了标签底下的血痕上，报出「垫板没降低反差」的假缺陷。
  const WORLD_LABELS = [];
  const 门时长 = { slide: 0.7, hinge: 0.9, lift: 1.2, break: 1.0 };
  function 门式(s) {
    if (s.doorId === 'd-entry' || s.doorId === 'd-final') return 'hinge';
    if (闸门ID[s.doorId]) return 'lift';
    if (s.jammed) return 'break';
    return 'slide';
  }
  // 0=关严 1=全开。doorAnim 里只有「正在动」的门，动完就被删掉，那时退回按 opened 取 0/1。
  function 门开度(S, s) {
    const t = S.doorAnim && S.doorAnim[s.doorId];
    if (typeof t !== 'number') return S.opened && S.opened.has(s.doorId) ? 1 : 0;
    const 进 = Math.max(0, Math.min(1, t / 门时长[门式(s)]));
    return 进 * 进 * (3 - 2 * 进);                     // smoothstep：起步与到位都减速，不是匀速方块
  }
  function 门扇(p, s, x, y, w, h) {
    if (w < 2 || h < 2) return;
    mat('metal', p, x, y, w, h, s.x | 0);
    strip(x, y, w, 1, p.steelHi);
    strip(x + w - 1, y, 1, h, p.steelDark);
    if (w >= 8 && h >= 30) mat('glass', p, x + 2, y + 10, w - 4, 16, s.x | 0);   // 观察窗
    strip(x + w - 4, y + h * 0.45 | 0, 3, 8, p.hazard);                          // 把手
    if (s.jammed) {
      for (let i = 0; i < h; i += 8) strip(x + 1, y + i, w - 2, 3, i % 16 ? p.warn : p.dark);
      strip(x - 3, y + h - 6, w + 6, 3, p.danger);
    }
  }
  function gangwayDoor(p, s, x, y, w, h, M, S) {
    const 式 = 门式(s), o = 门开度(S, s);
    // 1) 先画「洞」：门扇移开之后露出来的那一块。关严时会被门扇整个盖住，所以顺序不能反。
    strip(x, y, w, h, p.dark);
    for (let i = 3; i < h - 3; i += 5) strip(x + 1, y + i, w - 2, 2, p.steelDark);   // 对面风挡的褶皱
    strip(x + w - 2, y, 2, h, p.steel);                                              // 洞口远侧的受光边
    // 2) 门框（固定不动的一圈）。门开到一半时它必须还在，否则门扇像凭空消失。
    strip(x - 2, y - 3, w + 4, 3, p.steelHi);                                        // 门框上沿
    strip(x - 2, y, 2, h, p.steelLo); strip(x + w, y, 2, h, p.steelLo);
    strip(x - 2, y + h - 1, w + 4, 2, p.steelLo);
    if (式 === 'lift') {            // 上提门：两侧导轨 + 顶部链箱，门扇升起后导轨必须露出来
      strip(x - 2, y - h - 4, 2, h * 2 + 4, p.steelHi); strip(x + w, y - h - 4, 2, h * 2 + 4, p.steelHi);
      if (o > 0.02) for (let k = 0; k < 6; k++) strip(x + (w >> 1) - 1, y - 4 - o * h - k * 4, 2, 3, p.steel);
    }
    if (式 === 'slide') {
      const 幅 = Math.round(w * (1 - o));
      门扇(p, s, x, y, 幅, h);
      if (o > 0.02) strip(x + 幅, y + 2, Math.max(1, w - 幅), 2, p.rubberHi);        // 门扇滑进去的那道槽
    } else if (式 === 'lift') {
      门扇(p, s, x, Math.round(y - h * o), w, h);
    } else if (式 === 'hinge') {
      // 侧视投影里，绕竖轴转动的门扇只会「变窄」，不会画出透视扇形 —— 那是假的。
      const 幅 = Math.max(2, Math.round(w * (1 - o * 0.88)));
      门扇(p, s, x, y, 幅, h);
      strip(x + 幅 - 2, y, 2, h, p.steelHi);                                         // 正在往前探的自由边
      for (let i = 4; i < h - 4; i += 6) {                                           // 面在转开：斜向明暗随角度加深
        ctx.globalAlpha = 0.16 + 0.5 * o; fill(p.steelDark);
        rect(x + 1 + ((i / 6 | 0) % 2), y + i, Math.max(1, 幅 - 3), 2);
      }
      ctx.globalAlpha = 1;
      strip(x + w - 1, y + h - 3, 2, 3, p.warn);                                     // 铰链侧的下挡块
    } else {
      if (o < 0.3) {                                                                 // 踹不动的那 0.3：整扇抖
        const 抖 = Math.round(Math.sin((S.time || 0) * 58) * 2);
        门扇(p, s, x + 抖, y, w, h);
        strip(x - 3, y + h - 6, w + 6, 3, p.danger);
        strip(x + w, y, 2, h, p.warn);                                               // 门缝被顶开一线
      } else {
        const 后 = Math.min(1, (o - 0.3) / 0.5);
        门扇(p, s, x, y, Math.round(w * (1 - 后)), h);
        if (o < 0.82) for (let k = 0; k < 5; k++) {                                  // 崩出来的碎片往外飞
          const 飞 = (o - 0.3) / 0.52;
          strip(x + w - 2 - k * 2 - 飞 * 26, y + 6 + k * 11 + 飞 * 8, 2, 2, k % 2 ? p.steelHi : p.warn);
        }
      }
    }
  }
  // 车尾：尸潮进场通道 —— 危险条纹门槛 + 刷新点标记，让玩家一回头就知道「后面是死路」
  // 世界内的文字提示必须垫一块暗板。HUD 那两条从一开始就有 rgba 暗板，唯独这两处漏了：
  // 白天档「尸潮入口」写在亮天上、终点写在远山与城市轮廓上，字和背景互相吃。
  // 合同第七阶段第 5 条要的是「必要时降低背景局部对比」，这里降的是字底下那一小块。
  function label(p, txt, x, y, col) {
    const w = (ctx.measureText ? ctx.measureText(txt).width : 0) || txt.length * 8;
    // 垫板 0.72 → 0.82：第四阶段中景开始在这两个标签的高度上画内容，
    // 背景本身变暗了，字与背景的局部反差掉到 19（闸门 _ph7_space 要 ≥20）。
    // 加垫板而不是改判据：这块板的存在理由就是「降低局部对比让字读得出来」。
    // 垫板改成**不压暗、直接铺最不透明的暗色**（0.72 → 0.82 → 1.0 + 最深的一档 p.line）。
    // 原来那半透明版本只在「背景是天空/远山」时才成立：本轮两端画了主题构件之后，
    // 标签背后可能是白壁板（很亮）也可能是血流痕与标牌内芯（很暗），
    // 半透明垫板跟着背景一起变暗，闸门 _ph7_space A7 立刻量到「字底 76 / 旁边 70」——反差没降下来。
    // 换成不透明暗板之后，字底亮度与背景无关，垫板的作用才是确定的。
    ctx.globalAlpha = 1; fill(p.line); rect(x - 2, y - 9, w + 4, 11);
    fill(col); ctx.fillText(txt, x, y);
  }
  // ---------- 车尾：尸潮出生地。血迹 + 医疗器具 + 生化污染 ----------
  // 这一头要一眼读出「这里出过事、僵尸是从这里来的」，所以内容全是**失控**的东西：
  // 血泊与拖痕、翻倒的担架与器械、泄漏的培养罐、生物危害喷涂、被撕开的医疗柜。
  // 全部按 seed 分布（h2），所以每把 seed 的血迹位置不同，不会整列车一个样。
  function rearEnd(p, M, S, X, Y, lo, hi) {
    const x0 = M.rearSpawn, x1 = M.cars[0].x0, 地 = Y(G.FLOOR);
    if (X(x1) < -40 || X(x0) > 2000) return;
    const sd = (M.worldSeed | 0) + 7;
    // 1) 入口门架：警示斜纹柱 + 危险灯 + 「尸潮入口」牌
    for (let i = 0, x = x0; x < x1; x += 12, i++) strip(X(x), 地 - 3, 6, 3, i % 2 ? p.warn : p.dark);
    strip(X(x0), 地 - 104, 4, 104, p.danger);
    for (let i = 0; i < 5; i++) { fill(p.danger); rect(X(x0) + 5 + i * 5, 地 - 100 + i * 3, 4, 4); }
    const 亮夜 = p.ph && p.ph.lampOn > 0.3;
    fill(亮夜 ? p.lampCol : p.steelHi); rect(X(x0) + 2, 地 - 112, 9, 7);
    if (亮夜) { ctx.globalAlpha = 0.16; rect(X(x0) - 6, 地 - 116, 26, 22); ctx.globalAlpha = 1; }
    ctx.font = '8px monospace';
    label(p, '尸潮入口', X(x0) + 2, 地 - 118, p.danger);
    WORLD_LABELS.push({ 名: '尸潮入口', wx: x0 + 2, wy: G.FLOOR - 118 });
    // 2) 血泊与拖痕：六摊主血泊 + 拖痕 + 墙上擦拭痕，铺满「端墙外 → 第一节车内 900px」这一段。
    //    第一版只铺 390px、而且用色板里那块很暗的 p.blood（#5e1f1f），实机截图里车尾读起来仍是
    //    「一辆干净的行李车」—— 血迹在黄昏/夜里几乎不掉色。这里改用主题专用色并加宽铺陈范围。
    const 血 = p.blood2 || '#8d1f28', 血亮 = p.bloodHi || '#b8323c';
    // 1b) 端墙上的大字与流痕：玩家回头的第一眼要有「这里出过事」的大色块，
    //     地上那几摊 3px 的血泊在 1× 缩放下和污染带混成一条，单独靠它读不出来。
    for (let i = 0; i < 4; i++) {
      const sx = X(x0 + 14 + i * 26), 起 = 地 - 96 - h2(sd, i * 3 + 7) * 18, 长 = 52 + h2(sd, i * 3 + 8) * 34;
      ctx.globalAlpha = 0.85; fill(血); rect(sx, 起, 5, 长);
      fill(血); rect(sx - 1, 起 + 长 - 8, 7, 8);                        // 下端汇成的那一坨
      fill(血亮); rect(sx, 起, 2, 长 * 0.55 | 0);                        // 上段还亮、往下被抹淡
      ctx.globalAlpha = 1;
    }
    fill(p.warn || p.danger); rect(X(x0 + 118), 地 - 128, 44, 30);      // 端墙上的生化危害标牌
    fill(p.dark); rect(X(x0 + 120), 地 - 126, 40, 26);
    fill(p.warn || p.danger); rect(X(x0 + 138), 地 - 118, 4, 4);
    for (let k = 0; k < 3; k++) {
      const a = (k * 120 - 90) * Math.PI / 180;
      fill(p.warn || p.danger); rect(X(x0 + 140) + Math.cos(a) * 8 - 3, 地 - 114 + Math.sin(a) * 8 - 3, 7, 7);
    }
    for (let i = 0; i < 6; i++) {
      const bx = X(x0 + 60 + h2(sd, i * 5 + 1) * 860), rw = 18 + h2(sd, i * 5 + 2) * 26;
      fill(血); rect(bx, 地 - 5, rw, 5);
      fill(血亮); rect(bx + 2, 地 - 6, rw - 5, 2);
      for (let k = 0; k < 9; k++) {                      // 喷溅点：甩到墙上才读得出「发生过什么」
        fill(血);
        rect(bx + h2(sd, i * 40 + k) * rw, 地 - 6 - h2(sd, i * 40 + k + 9) * 26, 2, 2);
      }
      const 向 = h2(sd, i * 5 + 3) > 0.5 ? 1 : -1;       // 拖痕：越远越淡
      for (let k = 0; k < 8; k++) {
        ctx.globalAlpha = 0.55 - k * 0.06;
        fill(血); rect(bx + 向 * k * 9, 地 - 2, 9, 2);
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.5; fill(血);                   // 墙上抹过去的一道手印
      rect(bx + 4, 地 - 34 - h2(sd, i * 5 + 4) * 26, 7, 12); ctx.globalAlpha = 1;
    }
    // 3) 翻倒的担架 / 输液架 / 散落的器械盘
    for (let i = 0; i < 5; i++) {
      const tx = X(x0 + 90 + h2(sd, i * 9 + 20) * 840), 倒 = h2(sd, i * 9 + 21) > 0.5;
      fill(p.steelLo); rect(tx, 地 - (倒 ? 6 : 16), 30, 3);          // 架面
      fill(p.steel); rect(tx + 2, 地 - (倒 ? 4 : 14), 2, 倒 ? 4 : 14);
      rect(tx + 26, 地 - (倒 ? 4 : 14), 2, 倒 ? 4 : 14);
      if (倒) { fill(p.cloth || p.steelHi); rect(tx + 5, 地 - 9, 18, 3); }   // 毯子还搭在上面
      else { fill(p.steelHi); rect(tx + 4, 地 - 19, 22, 2); }
      fill(血); rect(tx + 10, 地 - 1, 12, 1);                               // 担架底下漏下来的一线
    }
    for (let i = 0; i < 4; i++) {                                          // 输液架：杆歪了、钩空着
      const px = X(x0 + 150 + h2(sd, i * 13 + 40) * 800), 歪 = (h2(sd, i * 13 + 41) - 0.5) * 10;
      for (let k = 0; k < 26; k++) { fill(p.steelHi); rect(px + 歪 * k / 26, 地 - 6 - k, 1, 1); }
      fill(p.steelLo); rect(px + 歪 - 3, 地 - 33, 7, 2);
      fill(p.glassDark || p.steelDark); rect(px + 歪 + 1, 地 - 31, 3, 5);   // 空袋
      fill(p.lampCool || p.steelHi); rect(px + 歪 + 5, 地 - 29, 2, 3);      // 管子里剩的一点药液
    }
    for (let i = 0; i < 8; i++) {                                          // 器械盘与针剂（散落）
      const ex = X(x0 + 70 + h2(sd, i * 7 + 60) * 880);
      fill(p.steelHi); rect(ex, 地 - 2, 9, 2);
      fill(p.metal || p.steelLo); rect(ex + 11, 地 - 2, 5, 1);
      if (h2(sd, i * 7 + 61) > 0.5) { fill(p.lampCool || p.steelHi); rect(ex + 3, 地 - 4, 2, 2); }
    }
    // 4) 生化：倒地的培养罐 + 泄漏的荧光液 + 墙上生物危害喷涂
    for (let i = 0; i < 4; i++) {
      const cx = X(x0 + 120 + h2(sd, i * 11 + 80) * 820);
      fill(p.steelDark); rect(cx, 地 - 12, 26, 12);                   // 罐体（横躺）
      fill(p.steelLo); rect(cx - 3, 地 - 11, 3, 10); rect(cx + 26, 地 - 11, 3, 10);
      fill(p.lampCoolE || p.lampCool); rect(cx + 8, 地 - 14, 8, 2);   // 破口
      ctx.globalAlpha = 0.55; fill(p.toxic || '#8fd94a');
      rect(cx + 28, 地 - 3, 20, 3); rect(cx + 34, 地 - 5, 10, 2);      // 流出来的那摊
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 4; i++) {                                     // 生物危害三叶喷涂
      const mx = X(x0 + 200 + i * 210), my = 地 - 60;
      fill(p.warn || p.danger); rect(mx - 1, my - 1, 3, 3);
      for (let k = 0; k < 3; k++) {
        const a = (k * 120 - 90) * Math.PI / 180;
        fill(p.warn || p.danger);
        rect(mx + Math.cos(a) * 5 - 2, my + Math.sin(a) * 5 - 2, 5, 5);
      }
    }
    // 5) 被撕开的医疗柜 + 掉落的药瓶 + 污染警示带
    for (let i = 0; i < 3; i++) {
      const wx = X(x0 + 240 + h2(sd, i * 17 + 100) * 520);
      fill(p.steelLo); rect(wx, 地 - 46, 22, 46);
      fill(p.dark); rect(wx + 2, 地 - 44, 18, 20);
      fill(p.steelHi); rect(wx + 20, 地 - 30, 12, 3);                 // 门被扯下来斜搭着
      for (let j = 0; j < 3; j++) { fill(p.cloth || p.lampCool); rect(wx + 4 + j * 5, 地 - 42 + j * 3, 3, 3); }
      fill(p.lampCool || p.steelHi); rect(wx + 26, 地 - 3, 4, 3);      // 掉落的药瓶
    }
    for (let x = x0 + 40; x < x1 + 900; x += 22) {                      // 黄黑污染带：从入口处一路拦进尸潮那节车
      fill(p.warn || p.danger); rect(X(x), 地 - 26, 16, 4);
      fill(p.dark); for (let k = 0; k < 3; k++) rect(X(x) + k * 6, 地 - 26, 2, 4);
    }
  }
  // ---------- 车头：人类撤离点。洁净室 + 枪械装备 + 弹药 + 防爆门 + 烟囱 ----------
  // 这一头要一眼读出「这里是安全的、是有组织的、门一关就守得住」，
  // 所以内容全是**受控**的东西：白壁洁净室、气闸、枪架、弹药箱、逃生标线、灭火器、防爆门。
  function headCab(p, M, S, X, Y) {
    const car = M.cars[M.cars.length - 1], gx = X(M.headGoal.x), gy = Y(G.FLOOR);
    if (X(car.x1) < -60 || X(car.x0) > 2000) return;
    const sd = (M.worldSeed | 0) + 31, 门 = Math.max(0, Math.min(1, S.blastDoor === undefined ? 0 : S.blastDoor));
    // 1) 洁净室：白壁板 + 顶缝 + 净化灯带（冷白，夜里更亮）+ 地面洁净区标线 + 鞋底消毒盘
    fill(p.cleanWall || p.steelHi); rect(gx - 96, gy - 118, 192, 118);
    for (let i = 0; i < 8; i++) fill(p.dark), rect(gx - 96 + i * 24, gy - 118, 1, 118);   // 壁板竖缝
    fill(p.steelLo); rect(gx - 96, gy - 118, 192, 3);
    const 夜强 = p.ph ? Math.max(0.35, p.ph.lampGain) : 0.6;
    for (let i = 0; i < 3; i++) {
      fill(p.lampCoolE || p.lampCool); ctx.globalAlpha = 0.85 * 夜强;
      rect(gx - 78 + i * 54, gy - 114, 40, 3);
      ctx.globalAlpha = 0.20 * 夜强; rect(gx - 82 + i * 54, gy - 112, 48, 16);            // 灯下那片冷光
      ctx.globalAlpha = 1;
    }
    fill(p.lampCool || p.greenText); rect(gx - 96, gy - 4, 192, 2);                        // 洁净区边界线
    fill(p.steelLo); rect(gx - 30, gy - 3, 26, 3);                                          // 鞋底消毒盘
    fill(p.lampCoolE || p.steelHi); rect(gx - 28, gy - 2, 22, 1);
    // 2) 枪械装备：枪架 + 三支步枪轮廓 + 战术柜 + 装备桌
    fill(p.steelDark); rect(gx - 90, gy - 74, 40, 4);                                       // 枪架横梁
    for (let i = 0; i < 3; i++) {
      const rx = gx - 88 + i * 13;
      fill(p.steelLo); rect(rx, gy - 70, 3, 22);                                            // 枪身竖放
      fill(p.metal || p.steelDark); rect(rx - 1, gy - 62, 5, 3);                            // 机匣
      fill(p.wood || p.steelDark); rect(rx, gy - 49, 3, 6);                                 // 枪托
    }
    fill(p.steelLo); rect(gx - 92, gy - 46, 44, 3); fill(p.steelDark); rect(gx - 88, gy - 43, 3, 43);
    fill(p.steelLo); rect(gx + 52, gy - 62, 40, 62);                                        // 战术柜
    fill(p.dark); rect(gx + 54, gy - 60, 17, 58); rect(gx + 73, gy - 60, 17, 58);
    fill(p.steelHi); rect(gx + 69, gy - 36, 3, 8); fill(p.warn); rect(gx + 56, gy - 58, 13, 2);
    fill(p.steelHi); rect(gx + 2, gy - 34, 40, 3); fill(p.steelDark);                       // 装备桌
    rect(gx + 3, gy - 31, 2, 31); rect(gx + 39, gy - 31, 2, 31);
    fill(p.metal || p.steelLo); rect(gx + 8, gy - 37, 14, 3);                               // 桌上的装备
    fill(p.lampCool || p.steelHi); rect(gx + 26, gy - 37, 6, 3);
    // 3) 弹药：弹药箱堆（带警示标签）+ 弹链卷 + 弹药托盘
    for (let i = 0; i < 5; i++) {
      const bx = gx - 44 + (i % 3) * 22, by = gy - 12 - (i / 3 | 0) * 11;
      fill(i % 2 ? p.ammoBox || p.wood || p.steelDark : p.steelDark); rect(bx, by, 20, 11);
      fill(p.warn || p.danger); rect(bx + 2, by + 2, 6, 2);                                 // 警示标签
      fill(p.dark); rect(bx, by + 5, 20, 1);
      fill(p.steelHi); rect(bx + 8, by - 1, 4, 2);                                          // 提手
    }
    for (let k = 0; k < 6; k++) { fill(p.lampCol || p.warn); rect(gx - 20 + k * 3, gy - 24, 2, 2); }   // 弹链卷
    fill(p.steelLo); rect(gx - 22, gy - 22, 20, 2);
    // 4) 防爆门：厚重门体 + 旋转闭锁轮 + 液压杆 + 斜撑纹；开度 S.blastDoor 0=全开 1=全关
    const 框宽 = 62, 门宽 = 框宽 - 4, 开 = (1 - 门) * 门宽;
    fill(p.steelDark); rect(gx - 框宽 / 2 - 3, gy - 96, 框宽 + 6, 96);                      // 门框
    fill(p.warn || p.danger); for (let i = 0; i < 7; i++) rect(gx - 框宽 / 2 - 3 + i * 9, gy - 96, 4, 3);
    fill(p.dark); rect(gx - 框宽 / 2 + 2, gy - 92, 门宽, 92);                               // 门洞（开着的里面）
    ctx.globalAlpha = 0.35; fill(p.lampCoolE || p.steelHi); rect(gx - 框宽 / 2 + 2, gy - 92, 开, 92); ctx.globalAlpha = 1;
    const mx = gx - 框宽 / 2 + 2 + 开;                                                       // 门扇从右侧滑入关闭
    fill(p.blastDoor || p.steelLo); rect(mx, gy - 92, 门宽 - 开, 92);
    for (let i = 0; i < 5; i++) {
      // 斜撑要「斜着走下去」。原来写成 `(k % 2 ? 2 : 0)` 的交替错位，2.5× 放大之后读成一片棋盘格麻点，
      // 像门被砸坏了而不是有加强筋 —— 改成随 k 稳定下降的对角线。
      fill(p.steelDark);
      for (let k = 0; k < 12; k++) rect(mx + 2 + k * 4, gy - 88 + i * 18 + (k * 1.5 | 0), 2, 3);
    }
    if (门宽 - 开 > 16) {
      const cx2 = mx + ((门宽 - 开) >> 1), cy2 = gy - 48;
      fill(p.metal || p.steelHi); rect(cx2 - 1, cy2 - 1, 3, 3);
      for (let k = 0; k < 4; k++) {                                                          // 闭锁轮（关门时转 90°）
        const a = 门 * Math.PI / 2 + k * Math.PI / 2;
        fill(p.steelHi); rect(cx2 + Math.cos(a) * 8 - 1, cy2 + Math.sin(a) * 8 - 1, 3, 3);
      }
      fill(p.steelLo); rect(cx2 - 10, cy2 + 10, 20, 3);                                      // 液压锁杆
    }
    fill(p.steelHi); rect(gx - 框宽 / 2 - 3, gy - 96, 3, 96); rect(gx + 框宽 / 2, gy - 96, 3, 96);
    // 5) 安全标识：EXIT 灯、逃生箭头地标、灭火器、护栏
    const 亮 = p.ph ? p.ph.lampOn > 0.25 : true;
    fill(亮 ? p.lampCol : p.steelLo); rect(gx - 10, gy - 108, 20, 8);
    ctx.font = '7px monospace'; fill(亮 ? p.dark : p.steelDark); ctx.fillText('EXIT', gx - 8, gy - 102);
    for (let i = 0; i < 3; i++) {                                                            // 地面逃生箭头
      fill(p.greenText || p.warn);
      rect(gx - 34 + i * 26, gy - 8, 10, 2); rect(gx - 26 + i * 26, gy - 10, 2, 6);
    }
    fill(p.danger); rect(gx + 46, gy - 24, 5, 16); fill(p.steelHi); rect(gx + 47, gy - 27, 3, 3);   // 灭火器
    fill(p.steelHi); rect(gx - 96, gy - 20, 30, 2); rect(gx - 92, gy - 20, 2, 20);           // 护栏
    // 6) 烟囱 / 排烟筒：顶上一截 + 随时间往上飘的烟
    fill(p.steelDark); rect(gx + 60, gy - 146, 12, 30); fill(p.steelLo); rect(gx + 58, gy - 150, 16, 5);
    for (let i = 0; i < 5; i++) {
      const t = ((S.time || 0) * 0.6 + i * 0.42) % 2, sy = gy - 152 - t * 30;
      ctx.globalAlpha = Math.max(0, 0.34 - t * 0.17);
      fill(p.smoke || p.steelHi); rect(gx + 60 - t * 5, sy, 12 + t * 9, 6);
      ctx.globalAlpha = 1;
    }
    ctx.font = '8px monospace';
    label(p, '机车驾驶室 · 撤离点', gx - 46, gy - 156, p.greenText || '#baff5c');
    WORLD_LABELS.push({ 名: '机车驾驶室 · 撤离点', wx: M.headGoal.x - 46, wy: G.FLOOR - 156 });
  }

  // 阶段六：整列车共用的一张摆动表（构件对象 → 摆动参数），每帧重建，不跨帧留状态
  const SWAY = typeof Map === 'function' ? new Map() : { clear() {}, set() {}, size: 0 };
  function scene(g, p, M, S, view) {
    ctx = g;
    WORLD_LABELS.length = 0;                             // 每帧重建：量具读到的永远是这一帧真的画出来的那些标签
    const { camX, camY, VW, VH } = view;
    // 关卡缩放：改成由 train-play.js 的 draw() 用 canvas transform 整体包住（见 §十一 的更正）。
    // 为什么不能在 X/Y 上乘 K —— 这套绘制里大量构件是「位置走 X/Y、宽高用固定世界像素」混写的
    // （如 `mat('grime', pi, X(car.x0), Y(car.yFloor) - 16, iw, 14, ...)`、骨架的 w/h），
    // 一乘 K 就成了锚点互相拉开而尺寸不变，真机 1.8× 实测直接散架。
    // 这里只把 K 记下来，供 human() 做「人物保持屏幕原尺寸」的反补偿。
    viewKRef = Math.max(1, Math.min(2.5, +S.viewK || 1));
    闸门ID = {}; for (const c of (M.checkpoints || [])) if (c.gate) 闸门ID[c.gate] = 1;   // 门型分派要用，每帧重建
    const X = x => x + S.trainX - camX, Y = y => y - camY;
    world(p, M, S, camX, camY, VW, VH);
    const lo = camX - S.trainX - 80, hi = camX - S.trainX + VW + 80;
    for (const car of M.cars) { if (car.x1 < lo || car.x0 > hi) continue; shell(p.pShell, M, S, car, X, Y); }
    if (!S.dbg || S.dbg.ends !== false) 端头(p, M, S, X, Y, lo, hi);   // 两端外形：画在车壳之后、窗景之前
    // 阶段六：窗景画在车壳之后（要把骨架那层玻璃盖掉重画）、家具之前（窗帘挂在窗前）。
    // 摆动表按「构件对象」建，整列车共用一张，所以每节车的窗帘相位各是各的。
    const pen2 = pen(ctx, p, X, Y, S.trainX, 2);
    const HASL = typeof CarLight !== 'undefined';
    if (HASL) SWAY.clear();
    for (const car of M.cars) {
      if (car.x1 < lo || car.x0 > hi) continue;
      const LT = HASL ? lightFor(car, M, S) : null;
      if (!LT) continue;
      CarLight.drawWindows(pen2, skeletonFor(car), S, M);
      LT.sway.forEach((e, q) => SWAY.set(q, e));
    }
    const XF = HASL ? CarLight.xform(SWAY, S, S.time) : null;
    // 车厢内部单独一条系数：夜里车外压到 0.34，但车厢是「有灯的空间」，
    // 跟着外面一起暗下去就等于把合同要的「车厢内部随时间变化」做成了「车厢内部看不见」。
    const pi = p.pInner;
    for (const car of M.cars) {
      if (car.x1 < lo || car.x0 > hi) continue;
      // 阶段七：按「这节车在屏幕里露出多少」降级细节。镜头缩放是固定的，所以距离轴
      // 不是远近而是边缘 —— 只露一小截的车不必把碎花纹和叙事小件全算一遍。
      const vis = Math.min(X(car.x1), VW) - Math.max(X(car.x0), 0);
      const FAR = vis < 140;
      const iw = X(car.x1) - X(car.x0);
      mat('grime', pi, X(car.x0), Y(car.yFloor) - 16, iw, 14, car.seed);          // 踢脚一条
      mat('grime', pi, X(car.x0), Y(car.yCeil), iw, 8, car.seed + 4);             // 顶棚烟熏一条
      for (let i = 0; i < 3; i++) {                                              // 随机几处溅污
        const gx = X(car.x0 + h2(car.seed, i + 40) * car.len), gy = Y(car.yCeil + 20 + h2(car.seed, i + 60) * (car.yFloor - car.yCeil - 40));
        mat('grime', pi, gx, gy, 14 + h2(car.seed, i + 80) * 22, 12, car.seed + i);
      }
      damage(pi, car, X, Y);
      furniture(pi, car, X, Y, S.trainX, XF, FAR);
      const LF = lifeFor(car, M);
      if (LF && LF.parts.length) CarLife.draw(pen2, LF, { xform: XF, far: FAR });
      lights(pi, car, X, Y, S.time, !!S.blackout);
      lifeLamps(pi, X, Y, S, LF);
    }
    // 断电：客室整片压暗，再把应急灯带重画到暗层之上。
    // 只靠「少画几个灯晕」是看不出来的 —— 实测过：那种画法下断电与正常供电两张图几乎一样。
    if (S.blackout) {
      fill('rgba(6,10,18,0.52)');
      for (const car of M.cars) {
        if (car.x1 < lo || car.x0 > hi) continue;
        rect(X(car.x0 + 6), Y(car.yCeil), X(car.x1) - X(car.x0) - 12, car.yFloor - car.yCeil);
      }
      if (typeof CarLife !== 'undefined') {
        ctx.globalAlpha = 0.34; fill(p.lampCoolE);
        for (const car of M.cars) {
          if (car.x1 < lo || car.x0 > hi) continue;
          const L = lifeFor(car, M);
          if (!L) continue;
          for (const q of L.parts) {
            if (q.lamp !== 'safe') continue;
            const r = (q.glow || 12) * 1.5;
            rect(X(q.x) - r / 2, Y(q.y) - r / 3, q.w + r, q.h + r * 0.7);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const s of M.solids) {                              // 结构实体：塔/顶板/地板/门/接缝/障碍
      if (s.x + s.w < lo || s.x > hi) continue;
      const x = X(s.x), y = Y(s.y), w = s.w, h = s.h;
      if (s.hatch) {
        // 车顶检修口：洞口 + 格栅盖板。必须排在 s.roof 之前 —— 这块板也带 roof:true，
        // 走顶板那条分支会被画成与车顶无差的实心金属，于是「物理上真的开了洞、画面上看不出来」，
        // 爬梯人像是从一整块车顶板里钻出来（与判断标准⑥禁止的穿模只差一张皮）。
        // 盖板是单向的（能从下往上顶开、能在上面踩住），所以画成疏格栅而不是封板。
        // 顶开动画：有人在洞口这一段高度里时盖板上抬并歪一点，人走开后自己落回。
        const 顶 = Math.max(0, Math.min(1, ((S.hatchAnim && S.hatchAnim[s.ladderId === undefined ? s.x : s.ladderId]) || 0) / 0.45));
        const 歪 = Math.round(顶 * 3), 抬 = Math.round(顶 * 7);
        strip(x, y, w, h, p.dark);                                  // 洞内是空的，不是封板
        if (顶 > 0.02) { strip(x + 1, y, w - 2, h, p.line); strip(x, y + 抬, w, 1, p.steelDark); }
        for (let k = 1; k < h - 1; k += 3) strip(x + 歪, y + k - 抬, w, 1, 顶 > 0.02 ? p.steelHi : p.steel);   // 横格栅，格间留缝
        strip(x + 歪, y - 抬, w, 1, p.steelHi);
        strip(x - 1, y, 1, h, p.warn); strip(x + w, y, 1, h, p.warn);         // 洞口两侧的警示边
        if (顶 > 0.5) { strip(x - 2, y - 抬 - 1, 2, 3, p.steelLo); strip(x + w, y - 抬 - 1, 2, 3, p.steelLo); }  // 铰链
      }
      else if (s.roof) mat('metal', p, x, y, w, h, s.car * 7 + 1);

      else if (s.floor) mat('floorcloth', p, x, y, w, h, s.car * 5 + 2);
      else if (s.plank) { mat('crate', p, x, y, w, h, s.x | 0); strip(x, y, w, 1, p.warn); }
      else if (s.seam) mat('rubber', p, x, y, w, h, s.car | 0);
      else if (s.deck) (s.mat === 'steel' ? MAT.metal : MAT.crate)(p, x, y, w, h, s.x | 0);
      else if (s.under) { /* 车底走道已由骨架的格栅构件绘制，这里再铺一层金属会把镂空盖掉 */ }
      else if (s.platform) { mat('panel', p, x, y, w, h, 1); strip(x, y, w, 1, p.warn); }
      else if (s.door) gangwayDoor(p, s, x, y, w, h, M, S);
      else if (s.gantry || s.roofGear) continue;
    }
    ladders(p, M, S, X, Y, lo, hi);   // 排在实体之后、车顶设备之前：梯子在洞口里，车顶设备在它上面
    for (const car of M.cars) { if (car.x1 < lo || car.x0 > hi) continue; roofGear(p, M, car, X, Y); }
    // 阶段六：光照必须画在地板/梯子/门这些结构实体「之上」，否则光柱全被不透明的地板盖掉，
    // 实测洞前与洞内的地板亮度一模一样（+0.0）—— 那就是「加了光照层但画面毫无变化」。
    // 但仍画在可行走面描边与角色之前：落脚描边和玩家永远不被光洗淡（可读性优先）。
    if (HASL) for (const car of M.cars) {
      if (car.x1 < lo || car.x0 > hi) continue;
      const LT = lightFor(car, M, S);
      if (LT) { CarLight.draw(pen2, LT, S, S.time); CarLight.drawFlex(pen2, LT, S, S.time); }
    }
    // 可行走面描边：亮度基本恒定、不跟着昼夜压暗。夜里若没有这一条，玩家看不出自己踩在哪里，
    // 而「看不见落脚面」在这种高度差密集的关卡里等于即死（长地图那一轮已经踩过一次）。
    // 三段色（白→暖→冷、alpha .14→.26→.34）原来是三档 if，切档时整排描边同帧跳色；
    // 现在它是相位表里的一个连续旋钮（walk / walkA），锚点处取值与改造前一致。
    ctx.fillStyle = 'rgba(' + p.ph.walk[0] + ',' + p.ph.walk[1] + ',' + p.ph.walk[2] + ',' + p.ph.walkA + ')';
    for (const s2 of M.solids) {
      if (s2.x + s2.w < lo || s2.x > hi || !(s2.main || s2.plank || s2.catwalk || s2.platform)) continue;
      if (s2.door && S.opened.has(s2.doorId)) continue;
      ctx.fillRect(px(X(s2.x)), px(Y(s2.y)), px(s2.w), 1);
    }
    for (const cp of M.checkpoints) {                         // 检查点：地面灯带 + 立柱牌
      if (cp.x < lo || cp.x > hi) continue;
      const x = X(cp.x), y = Y(G.FLOOR);
      const on = S.cpIdx >= cp.id;
      fill(on ? p.greenDark || '#1d7a45' : p.steelLo); rect(x - 1, y - 44, 3, 44);
      fill(on ? p.green || '#39ff14' : p.danger); rect(x - 1, y - 50, 16, 8);
      fill(p.dark); rect(x + 2, y - 48, 10, 4);
      fill(on ? p.green : p.steelDark); ctx.globalAlpha = 0.18; rect(x - 10, y - 2, 22, 3); ctx.globalAlpha = 1;
    }
    // 关卡缩放时，**角色类精灵要保持在屏幕上的原尺寸**（用户要的就是「关卡变大、人不变」这个对照）。
    // 外层 train-play.draw() 用 canvas transform 把整个画面放大了 viewKRef，
    // 这里以各自的锚点为不动点反向除以它 —— 位置跟着关卡走，尺寸不变。
    const 反缩 = (ax, ay, 画) => {
      if (viewKRef === 1) { 画(); return; }
      ctx.save(); ctx.translate(ax, ay); ctx.scale(1 / viewKRef, 1 / viewKRef); ctx.translate(-ax, -ay);
      画(); ctx.restore();
    };
    // 两端主题的绘制层开关（和 dbg.ends / dbg.ladder 同一类：只关这一层画法，不动任何数据）。
    // 有它才能做「有血迹 vs 没血迹」的像素 A/B，判据才不是数颜色。
    if (!S.dbg || S.dbg.themes !== false) { rearEnd(p, M, S, X, Y, lo, hi); headCab(p, M, S, X, Y); }
    for (const c of S.chasers) if (X(c.e.x) > lo - 40 && X(c.e.x) < hi + 40)
      反缩(X(c.e.x), Y(c.e.y), () => zombie(p.pActor, c, X, Y));
    // 纯视角开关：只让角色不落笔，其它一层不动。量具的反证组需要「同一个位置、同一片背景、
    // 只是没有人」这一格 —— 原来对照组是把矩形挪到 190px 外，但那一格现在可能正好站着一根
    // 接触网支柱或一棵行道树，量出来的高对比与「有没有人」无关，反证就失效了。
    if (!S.dbg || S.dbg.actor !== false)
    // 描边极性按「人身边那块背景的实际亮度」选，试过一版按色板估（pInner.floorcloth / pShell.panel）：
    // 48 个「章 × 机位 × 时刻」格里**没有任何一格被它救回来**（边缘强度一位未变），却多了一条
    // 靠猜的分支 —— 撤掉。真正弱的那一格（开阔地·车顶·黑夜 边缘强度 11.1）留作未解决项，
    // 由 tools/_dt5_read.js 每次量出来，不靠看图印象。
    反缩(X(S.player.e.x), Y(S.player.e.y),
      () => human(p.pActor, S.player.e, X, Y, S.player.e.face, S.player.hp < 40));
    ctx.fillStyle = p.muzzle || '#ffe94a';
    for (const sh of S.shots) { const x = X(sh.x), y = Y(sh.y); rect(x, y, sh.len, 1); rect(x - 2, y - 1, 4, 3); }
    // 速度线：贴地飞掠的短横条，是「210km/h」最省事的读法。
    // steelHi / hazard 本身就是从连续相位派生的，所以这里不需要再按档分支。
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 7; i++) {
      const t = (S.time * (2.2 + i * 0.3) + i * 0.37) % 1;
      const yy = Y(GZ - 150 + i * 22), xx = (1 - t) * (VW + 200) - 100;
      fill(i % 2 ? p.steelHi : p.hazard); rect(xx, yy, 30 + i * 6, 1);
    }
    ctx.globalAlpha = 1;
    fill(p.grade); rect(0, 0, VW, VH); ctx.fillStyle = '#000';
  }
  const G = TrainGen;
  // 量具认层用的唯一标签来源：返回渲染这一帧真正会用的三道山脊的 (颜色, alpha)。
  // _ph7_space / _ph6_continuity 以前各自抄过 alpha 数字，抄一次过期一次，所以改成读这里。
  // 三道山脊各自的视差速度。量具（_ph6_continuity）要按「相机移 N 像素、这一层该挪多少」
  // 反算对应列，抄数字必然过期，所以与渲染共用这一份。
  const RIDGE_PAR = [0.05, 0.085, 0.12];
  function RIDGE_TAG(pal) {
    const q = (pal && pal.ph) || phaseOf('dusk');
    return q.ridge.map((r, i) => ({ col: rgbStr(r), a: q.ridgeA[i], rim: rgbStr(q.ridgeRim[i]), par: RIDGE_PAR[i] }));
  }
  return { scene, world, PAL, PAL_AT, phaseOf, ANCHOR, TOD, RIDGE_TAG, RIDGES, ZONE, MID, midGround, midMix, 中淡,
    skyColAt, skyPixel,
    MAT, FITMAP, FIT, PROP, lifeFor, h2, px: v => Math.round(v),
    ACTOR, EMISSIVE,
    pen, spec, skeletonFor, shell, fitFor, lightFor, ink: () => INK, WORLD_LABELS };
})();
