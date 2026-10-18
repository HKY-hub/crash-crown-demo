// ============ 疾驰列车 · 昼夜时间系统（阶段二） ============
// 这个模块只回答两个问题：
//   ① 现在世界几点（levelTime → 周期坐标 p）；
//   ② 这个时刻的每一层该多亮、灯该不该亮（p → 一组连续参数）。
// 它不画任何东西，也不碰碰撞、路线、AI —— 画的人来读 phase()。
//
// 三条设计约束（都是第一阶段量出来的现状问题，逐条对着解）：
//   · 现状的 day/dusk/night 是「同一组线性系数应用三次」，实测把 night 帧拟合回 day 帧
//     只要一次全屏逐通道线性变换就够了（平均残差 4.4/255）。所以这里把「全局压暗」
//     降级成众多旋钮中的一个，远景 alpha、中景/近景/外壳/车内/角色各自有独立系数。
//   · 现状三档之间是 if 分支，切档那一帧整屏同时换色。这里所有参数都是 p 的
//     **smoothstep 插值**，关键帧处一阶导为 0 ⇒ 进/出过渡没有闪变。
//   · 现状灯具的「亮不亮」是生成期随机数定死的（216 盏里 136 盏 on，三档一模一样），
//     所以夜里没有任何一盏灯成为光源。这里把「线路完好」(L.on) 与「此刻点亮」(lit) 拆开，
//     点亮顺序由稳定 rank 决定 ⇒ 同 seed 同 p 的点亮集合逐盏一致，且随 p 单调增加，
//     不会每帧重新随机。
//
// 周期坐标 p：
//   p ∈ [0,1]   关卡的 0~100%：白天 → 黄昏 → 黑夜（合同给的分段点就是这里的 keyframe）
//   p ∈ (1,1+晨光] 只在循环模式出现：黑夜经晨光回到白天。晨光不另做第四套场景，
//                它就是「黑夜关键帧 → 白天关键帧」的一段插值，两端取值与 p=0 完全相同，
//                所以回卷处像素级连续。
//   自动模式（正式关卡）把 p 钳在 1，永远不进晨光段 ⇒ 结尾不会突然跳回白天。
const DayNight = (() => {
  const DAWN = 0.08;                       // 晨光段长度（占一个周期的比例）；597s 参考时长下 ≈ 48s
  const P_MAX = 1 + DAWN;

  // ---------- 关键帧表 ----------
  // 每个字段的物理含义（合同点名的十一个旋钮 + 三个天空细节）：
  //   mul/add   全局明暗（天空亮度与色彩的基础，仍然是「一层」而不是唯一手段）
  //   amb*      环境光颜色与强度   grade*  全屏氛围压色
  //   farA/nearA 极远景两层山脊 alpha   farK/midK/nearK 远/中/近景各自相对系数
  //   shellK    车厢外壳   interiorK 车厢内部   actorK 角色与追兵
  //   sunA/sunY/sunCol 太阳可见性·高度·颜色   moonA/moonCol 月亮   starA 星星
  //   winGain   窗光增益（原 todGain）  reflectK 窗户反射
  //   lampGain  人工灯光强度   lampOn 灯具启用比例   cityLit 远处建筑窗灯点亮比例
  const K = [
    { p: 0.00, mul: 1.00, add: [8, 8, 10], amb: [255, 240, 210], ambA: 0.05,
      grade: [120, 130, 150], gradeA: 0.05, farA: 0.26, nearA: 0.40,
      farK: 1.00, midK: 1.00, nearK: 1.00, shellK: 1.00, interiorK: 1.00, actorK: 1.00,
      sunA: 1.00, sunY: 0.78, sunCol: [255, 233, 192], moonA: 0.00, moonCol: [207, 224, 255], starA: 0.00, sunIn: 0.10,
      winGain: 1.00, reflectK: 1.00, lampGain: 0.08, lampOn: 0.63, cityLit: 0.00,
      walk: [255, 255, 255], walkA: 0.14 },
    // 0~27% 稳定白天：只允许极缓慢地偏暖，不允许看得出在变
    { p: 0.27, mul: 0.96, add: [12, 9, 8], amb: [255, 226, 190], ambA: 0.06,
      grade: [120, 122, 148], gradeA: 0.06, farA: 0.26, nearA: 0.40,
      farK: 1.00, midK: 0.99, nearK: 1.00, shellK: 1.00, interiorK: 1.00, actorK: 1.00,
      sunA: 1.00, sunY: 0.70, sunCol: [255, 228, 180], moonA: 0.00, moonCol: [207, 224, 255], starA: 0.00, sunIn: 0.13,
      winGain: 0.98, reflectK: 1.00, lampGain: 0.10, lampOn: 0.63, cityLit: 0.00,
      walk: [255, 248, 235], walkA: 0.18 },
    // 27~40% 白天→黄昏
    { p: 0.40, mul: 0.82, add: [26, 10, -4], amb: [255, 180, 110], ambA: 0.09,
      grade: [110, 70, 70], gradeA: 0.12, farA: 0.27, nearA: 0.42,
      farK: 0.95, midK: 0.90, nearK: 1.05, shellK: 1.10, interiorK: 0.97, actorK: 1.14,
      sunA: 1.00, sunY: 0.54, sunCol: [255, 190, 130], moonA: 0.05, moonCol: [214, 226, 250], starA: 0.02, sunIn: 0.17,
      winGain: 0.86, reflectK: 1.10, lampGain: 0.30, lampOn: 0.68, cityLit: 0.08,
      walk: [255, 242, 215], walkA: 0.22 },
    // 40~58% 明显黄昏（mul/add 在这一档对齐现状的 dusk 值，便于和第一阶段基线逐项对比）
    // 逐层系数在这一档**刻意拉得比两侧都开**：黄昏物理上就是「低角度暖光只照到一部分东西」——
    // 远山先失去亮度变剪影、中景楼体已经进阴影、轨旁与车壳还挂着暖光、车里开始暗下去靠灯。
    // 之前这一档各层系数全挤在 0.95~1.16，于是整帧几乎能被一次全屏线性变换解释
    // （_dt1_inventory 量到 day→dusk 平均残差 13.3，而 day→night 是 25.3）——
    // 那正是合同点名的「三个调色预设」的味道，所以这条不是调数字好看，是把层次做出来。
    { p: 0.58, mul: 0.72, add: [30, 8, -14], amb: [255, 140, 60], ambA: 0.10,
      grade: [80, 40, 55], gradeA: 0.18, farA: 0.30, nearA: 0.46,
      farK: 0.86, midK: 0.66, nearK: 1.06, shellK: 1.26, interiorK: 0.80, actorK: 1.42,
      sunA: 0.95, sunY: 0.38, sunCol: [255, 150, 90], moonA: 0.22, moonCol: [220, 230, 250], starA: 0.12, sunIn: 0.18,
      winGain: 0.72, reflectK: 1.35, lampGain: 0.55, lampOn: 0.74, cityLit: 0.22,
      walk: [255, 235, 200], walkA: 0.26 },
    // 58~72% 黄昏→黑夜
    { p: 0.72, mul: 0.52, add: [12, 6, 4], amb: [150, 150, 200], ambA: 0.09,
      grade: [30, 26, 46], gradeA: 0.19, farA: 0.42, nearA: 0.64,
      farK: 0.97, midK: 0.92, nearK: 1.04, shellK: 1.22, interiorK: 1.14, actorK: 1.34,
      sunA: 0.25, sunY: 0.16, sunCol: [200, 120, 90], moonA: 0.70, moonCol: [207, 224, 255], starA: 0.60, sunIn: 0.11,
      winGain: 0.46, reflectK: 0.92, lampGain: 0.82, lampOn: 0.86, cityLit: 0.58,
      walk: [228, 232, 226], walkA: 0.30 },
    // 72~90% 进入稳定黑夜（mul/add 对齐现状的 night 值）
    // gradeA 从 0.34 降到 0.16：那层全屏压色本身是合同点名的「全屏色块叠加」画法，
    // 而且它把**亮的往下压、暗的往上抬**，整屏都被拉到亮度 17 附近 —— 夜里天顶 15、
    // 近处山脊 19，真机闸门 _ph8_motion 判「天空与山脊读得出分离（≥6）」直接红。
    // 第三阶段之后天空与山脊各自有绝对色了（SKY 表），大气感已经 bake 进分层色里，
    // 这层压色只该留一点点「统一色温」的作用。
    // midK 从 0.90 降到 0.62（第四阶段）：中景开始真的出现在画面里之后，
    // 夜里它的未受光墙面算出来亮度 26，跟天顶的 23 几乎一样 —— 于是「车顶线以上最后一级
    // 台阶」和「顶部天空」又糊在一起（_dt3_sky 那条 Δ≥6 的量表掉到 1.2~1.5）。
    // 物理上中景在夜里就该比天暗：它没有任何光源照到，而天空有月光与地平线辉光。
    { p: 0.90, mul: 0.36, add: [-4, 4, 26], amb: [70, 90, 180], ambA: 0.10,
      grade: [8, 14, 38], gradeA: 0.16, farA: 0.55, nearA: 0.85,
      farK: 0.96, midK: 0.62, nearK: 1.06, shellK: 1.38, interiorK: 1.20, actorK: 1.55,
      sunA: 0.00, sunY: 0.00, sunCol: [160, 100, 90], moonA: 0.95, moonCol: [207, 224, 255], starA: 1.00, sunIn: 0.05,
      winGain: 0.30, reflectK: 0.70, lampGain: 1.00, lampOn: 0.95, cityLit: 0.80,
      walk: [205, 228, 255], walkA: 0.34 },
    { p: 1.00, mul: 0.34, add: [-6, 3, 28], amb: [60, 82, 176], ambA: 0.10,
      grade: [6, 12, 36], gradeA: 0.14, farA: 0.57, nearA: 0.88,
      farK: 0.96, midK: 0.62, nearK: 1.06, shellK: 1.38, interiorK: 1.20, actorK: 1.55,
      sunA: 0.00, sunY: 0.00, sunCol: [160, 100, 90], moonA: 1.00, moonCol: [214, 230, 255], starA: 1.00, sunIn: 0.05,
      winGain: 0.28, reflectK: 0.66, lampGain: 1.00, lampOn: 0.95, cityLit: 0.82,
      walk: [200, 226, 255], walkA: 0.35 },
    // 晨光段终点：与 p=0 逐字段相同 ⇒ 循环回卷处像素级连续，不会闪一下变白
    { p: P_MAX, mul: 1.00, add: [8, 8, 10], amb: [255, 240, 210], ambA: 0.05,
      grade: [120, 130, 150], gradeA: 0.05, farA: 0.26, nearA: 0.40,
      farK: 1.00, midK: 1.00, nearK: 1.00, shellK: 1.00, interiorK: 1.00, actorK: 1.00,
      sunA: 1.00, sunY: 0.78, sunCol: [255, 233, 192], moonA: 0.00, moonCol: [207, 224, 255], starA: 0.00, sunIn: 0.10,
      winGain: 1.00, reflectK: 1.00, lampGain: 0.08, lampOn: 0.63, cityLit: 0.00,
      walk: [255, 255, 255], walkA: 0.14 },
  ];
  const 数值键 = ['mul', 'farA', 'nearA', 'farK', 'midK', 'nearK', 'shellK', 'interiorK', 'actorK',
    'sunA', 'sunY', 'sunIn', 'moonA', 'starA', 'winGain', 'reflectK', 'lampGain', 'lampOn', 'cityLit', 'gradeA', 'ambA', 'walkA'];
  const 数组键 = ['add', 'amb', 'grade', 'sunCol', 'moonCol', 'walk'];

  const smooth = t => t * t * (3 - 2 * t);            // 两端一阶导为 0：进出过渡不闪
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- 天空 / 云 / 远山的绝对色表（第三阶段） ----------
  // 为什么不复用 mul/add：第一阶段量清的一件事是「十个场景层里九个的三档比值都挤在色板
  // 整体比值附近」，也就是天空、山脊当时只是被同一刀压暗。若第三阶段的层次仍然走那条路，
  // 夜里就只能是「深蓝底 + 更深的蓝」，读不出「天顶—上层—地平线—远山三道—近山」的次序。
  // 所以这一张表给的是**最终颜色**，不再乘全局 mul/add：
  //   zenith/upper/horizon  天顶 → 上层 → 地平线三段（画成多条窄带，白天有克制层次、
  //                         黄昏地平线偏暖而天顶先转冷、夜里是三段有深度的暗蓝而不是纯黑）
  //   cloudLit/cloudBase    云的受光面与底面（白天是白云灰底，不是现在那种「蓝天上的黑污」）
  //   ridge[3]              极远 / 中 / 近三道山脊的绝对色（空气透视：越远越靠天）
  //   hazeA                 最远那道往天上融的强度
  //   sunSize/moonSize      日月的像素直径（太阳落向地平线时视觉上变大）
  const SKY = [
    { p: 0.00, zenith: [64, 112, 164], upper: [104, 152, 196], horizon: [176, 202, 216],
      cloudLit: [246, 250, 252], cloudBase: [170, 186, 202],
      ridge: [[132, 162, 190], [100, 132, 162], [70, 98, 128]], ridgeRim: [[176, 198, 216], [142, 168, 192], [108, 134, 160]],
      hazeA: 0.34, sunSize: 13, moonSize: 0, ridgeA: [0.70, 0.86, 1.0] },
    { p: 0.27, zenith: [62, 108, 160], upper: [112, 150, 186], horizon: [200, 192, 178],
      cloudLit: [248, 246, 238], cloudBase: [178, 180, 192],
      ridge: [[130, 156, 182], [98, 124, 152], [70, 94, 122]], ridgeRim: [[174, 194, 212], [140, 164, 188], [106, 130, 156]],
      hazeA: 0.34, sunSize: 14, moonSize: 0, ridgeA: [0.70, 0.86, 1.0] },
    { p: 0.40, zenith: [52, 88, 146], upper: [126, 122, 152], horizon: [236, 168, 108],
      cloudLit: [250, 226, 194], cloudBase: [172, 130, 140],
      ridge: [[116, 126, 160], [86, 96, 130], [62, 70, 100]], ridgeRim: [[160, 164, 186], [124, 132, 160], [92, 100, 130]],
      hazeA: 0.30, sunSize: 17, moonSize: 0, ridgeA: [0.72, 0.87, 1.0] },
    // 黄昏天顶：亮度要和白天到夜里的斜坡接得上（_dt3_shots 有一条「中间点必须落在两端之间」的
    // 连续性判据），但**色相**要往深蓝走 —— 全屏线性拟合是逐通道取最大误差的，
    // 所以把 B 抬到 158（白天同位置 164，拟合按 0.75·x−26 只会给到 97）就能在不动亮度的前提下
    // 把残差拉开：黄昏的天是「还亮着的深蓝」，而地面已经被暖光染成橙紫，两者不是一条直线能连的。
    { p: 0.58, zenith: [36, 64, 188], upper: [120, 80, 134], horizon: [250, 128, 58],
      cloudLit: [252, 194, 138], cloudBase: [148, 90, 104],
      // 黄昏山脊要「从明亮转剪影但仍读得出连续轮廓」：三道本体压暗压冷（只剩天光），
      // 但缘亮线 ridgeRim 反而抬到接近地平线的暖亮 —— 轮廓靠一条亮边读出来。
      ridge: [[72, 74, 116], [50, 52, 88], [36, 38, 66]], ridgeRim: [[214, 168, 148], [128, 112, 146], [86, 82, 116]],
      hazeA: 0.26, sunSize: 19, moonSize: 9, ridgeA: [0.76, 0.89, 1.0] },
    { p: 0.72, zenith: [22, 36, 82], upper: [54, 50, 92], horizon: [126, 84, 92],
      cloudLit: [126, 118, 148], cloudBase: [62, 62, 94],
      ridge: [[40, 48, 80], [28, 36, 62], [19, 25, 46]], ridgeRim: [[74, 84, 116], [52, 62, 90], [34, 42, 66]],
      hazeA: 0.20, sunSize: 15, moonSize: 12, ridgeA: [0.82, 0.92, 1.0] },
    // 夜里「天在上、山在下」要读得出来，靠的是**明度阶梯**而不是把某一层单独调暗：
    // 天顶 23 → 中层 27 → 地平线辉光 44 → 远山 33（被辉光托着）→ 中山 11 → 近山 6。
    // 关键是「三道山与天空之间必须差开 ≥10」，而不是三道山彼此差开：
    // 真机闸门 _ph8_motion 量的是「屏幕顶部天空 vs 车顶线以上最后一级台阶」，
    // 而最后一级到底是哪一道山，取决于相机 y 与那一列的山脊高低 —— 上一版远山 26
    // 与天顶 23 几乎等亮，于是凡是「中、近两道山脊恰好都低到车顶线以下」的列，
    // 最后一级就落在远山身上，Δ 塌到 1.8~2.8（判据 ≥6）。
    // 合同第 3 条同时要求「远山不塌成纯黑块」和「保留明度分层」：远山留亮并带 ridgeRim
    // 亮线，近的两道压成剪影，正好两条都满足。
    { p: 0.90, zenith: [13, 20, 46], upper: [21, 29, 60], horizon: [38, 48, 84],
      cloudLit: [72, 86, 122], cloudBase: [30, 40, 66],
      ridge: [[24, 33, 56], [6, 10, 20], [3, 5, 12]], ridgeRim: [[52, 66, 98], [34, 46, 74], [24, 34, 56]],
      hazeA: 0.17, sunSize: 0, moonSize: 14, ridgeA: [0.88, 0.95, 1.0] },
    { p: 1.00, zenith: [11, 17, 40], upper: [18, 25, 54], horizon: [34, 44, 78],
      cloudLit: [64, 78, 112], cloudBase: [26, 35, 59],
      ridge: [[21, 29, 50], [5, 8, 17], [2, 4, 10]], ridgeRim: [[46, 58, 90], [29, 41, 67], [20, 29, 49]],
      hazeA: 0.15, sunSize: 0, moonSize: 14, ridgeA: [0.90, 0.96, 1.0] },
    { p: P_MAX, zenith: [64, 112, 164], upper: [104, 152, 196], horizon: [176, 202, 216],
      cloudLit: [246, 250, 252], cloudBase: [170, 186, 202],
      ridge: [[132, 162, 190], [100, 132, 162], [70, 98, 128]], ridgeRim: [[176, 198, 216], [142, 168, 192], [108, 134, 160]],
      hazeA: 0.34, sunSize: 13, moonSize: 0, ridgeA: [0.70, 0.86, 1.0] },
  ];
  const 色键 = ['zenith', 'upper', 'horizon', 'cloudLit', 'cloudBase'];
  const 三色键 = ['ridge', 'ridgeRim'];
  // 三道山脊各自的 alpha。它们同时是**空气透视的量**（越远越往天上融）
  // 也是量具认层的标签（_ph7_space / _ph6_continuity 用「1px 列 + 颜色 + alpha」认层，
  // 三个值互不相同且不与别处重合，改画法时不会把判据变成瞎子）。
  const 三量键 = ['ridgeA'];
  function skyAt(p) {
    const c = Math.max(0, Math.min(P_MAX, p));
    let i = 0; while (i + 2 < SKY.length && c >= SKY[i + 1].p) i++;
    const a = SKY[i], b = SKY[i + 1], t = smooth(b.p === a.p ? 0 : (c - a.p) / (b.p - a.p));
    const o = {};
    const 定 = v => Math.round(v);
    for (const k of 色键) o[k] = a[k].map((v, j) => 定(lerp(v, b[k][j], t)));
    for (const k of 三色键) o[k] = a[k].map((r, n) => r.map((v, j) => 定(lerp(v, b[k][n][j], t))));
    for (const k of 三量键) o[k] = a[k].map((v, j) => Math.round(lerp(v, b[k][j], t) * 1000) / 1000);
    for (const k of ['hazeA', 'sunSize', 'moonSize']) o[k] = 定(lerp(a[k], b[k], t) * 1000) / 1000;
    return o;
  }

  // p → 相位对象。纯函数：同样的 p 永远得到同样的结果（合同第 4 条的地基）。
  function phase(p) {
    const c = Math.max(0, Math.min(P_MAX, p));
    let i = 0; while (i + 2 < K.length && c >= K[i + 1].p) i++;
    const a = K[i], b = K[i + 1];
    const t = smooth(b.p === a.p ? 0 : (c - a.p) / (b.p - a.p));
    const o = { p: c };
    // 数值键统一四舍五入到 1e-6：lerp(a,b,1) 在浮点下不严格等于 b，
    // 而晨光段终点必须与 p=0 **逐位相同**（回卷处像素级连续这条要能被等值断言检验）。
    const 定 = v => Math.round(v * 1e6) / 1e6;
    for (const k of 数值键) o[k] = 定(lerp(a[k], b[k], t));
    for (const k of 数组键) o[k] = a[k].map((v, j) => Math.round(lerp(v, b[k][j], t)));
    // 天空/云/山脊的绝对色表并进来：与上面那套 mul/add 是**两条独立的通道**，
    // 乘在一起会得到「夜里天空被压两次」的错误结果，所以绘制侧对这些键不走 shade。
    const s = skyAt(c);
    for (const k of 色键.concat(三色键, 三量键, ['hazeA', 'sunSize', 'moonSize'])) o[k] = s[k];
    o.isNight = o.starA > 0.5;
    o.isDusk = o.sunA > 0.2 && o.starA <= 0.5 && o.mul < 0.92;
    return o;
  }

  // ---------- 关卡配置 ----------
  // T_ref 与 HUD 的「预估」同源（M.cars.length × SEC_PER_CAR），改时长滑条时曲线自动跟着缩放。
  function config(opt) {
    const o = opt || {};
    return { mode: o.mode || 'once',                          // 'once' 正式关卡 | 'loop' 预览/未来长流程
      T_ref: o.T_ref || 597, dawn: DAWN };
  }
  // levelTime（秒）→ 周期坐标 p。
  //   once：钳在 1，永不进晨光段；
  //   loop：整周期取模，黑夜满 1 之后先走完晨光段再回到白天。
  function toPhase(levelTime, cfg) {
    const c = cfg || config();
    const raw = Math.max(0, levelTime) / Math.max(1, c.T_ref);
    if (c.mode !== 'loop') return Math.min(1, raw);
    const cyc = 1 + c.dawn;
    let p = raw % cyc;
    if (p < 0) p += cyc;
    return p;
  }

  // ---------- 确定性点亮状态（合同第 4 条） ----------
  // 一盏灯「亮不亮」= 线路完好(L.on) 且 它的稳定 rank 落在当前启用比例之内。
  // rank 只由 (seed, 车厢序号, 灯序号) 决定，与 p 无关 ⇒
  //   · 同 seed 同 p 的点亮集合逐盏一致（可测）；
  //   · p 上升时按固定次序陆续点亮，不会每帧重新随机、也不会整屏一起跳。
  function rank(seed, carIdx, lampIdx, salt) {
    let h = (seed | 0) ^ 0x9e3779b9;
    const mix = v => { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= v; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
    mix(carIdx + 1); mix(lampIdx + 1); mix(salt || 0);
    return mix(0x51ed270b) / 4294967296;
  }
  const lampLit = (ph, seed, carIdx, lamp, idx) => !!lamp.on && rank(seed, carIdx, idx, 7) < ph.lampOn;
  // 远处楼房的窗灯：位置哈希决定「有没有这扇窗」，另一条哈希决定「这扇窗夜里亮不亮」。
  const cityLitAt = (ph, seed, gx, wy) => rank(seed, gx | 0, wy | 0, 131) < ph.cityLit;

  // ---------- 时间状态（挂在 S 上的那一份） ----------
  function newState(T_ref, mode) {
    return { levelTime: 0, paused: false, mode: mode || 'once', T_ref: T_ref || 597, dawn: DAWN,
      override: null,                                        // 调试覆盖：非 null 时只改视觉时间
      p: 0, ph: phase(0), advanced: 0 };
  }
  // 用「真实帧时」而不是物理步长累加：物理那边把 dt 钳到 0.033 保碰撞稳定，
  // 若时间也跟着钳，20fps 的世界就会比 120fps 慢一半地过一天（合同第 1 条明令不依赖帧率）。
  const 帧时上限 = 0.25;                                      // 只挡标签页切走后回来的一次性巨帧
  function tick(st, rawDt) {
    if (!st || st.paused) return st;
    const d = Math.max(0, Math.min(帧时上限, rawDt || 0));
    st.levelTime += d; st.advanced += d;
    sync(st);
    return st;
  }
  function sync(st) {
    st.p = st.override !== null && st.override !== undefined
      ? st.override : toPhase(st.levelTime, st);
    st.ph = phase(st.p);
    return st.ph;
  }
  // 检查点快照 / 恢复（合同第 1 条：检查点保存并恢复）
  const snapshot = st => ({ levelTime: st.levelTime, paused: st.paused, mode: st.mode, T_ref: st.T_ref });
  function restore(st, snap) {
    if (!snap) return st;
    st.levelTime = snap.levelTime; st.advanced = snap.levelTime;
    sync(st);
    return st;
  }

  return { DAWN, P_MAX, KEYS: K, SKY, skyAt, phase, config, toPhase, rank, lampLit, cityLitAt,
    newState, tick, sync, snapshot, restore, smooth, 数值键, 数组键 };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DayNight;
