// ============ 第 7 阶段：近战武器与投掷物的逐件美术档案 ============
// 与第 6 阶段的 js/art-guns.js 同一套机制：一件一个 WeaponArt.define()，轮廓复用 ArtGuns.Shape 收集器。
// 规则：
// 1) 外形按真实结构给坐标，不允许"近战通用条 + 换色"；每件至少两个战斗尺度能看出的结构差。
// 2) layout.muzzle 对近战＝**刃尖**，对投掷＝**离手时的物体重心**。
//    注意：近战判定是 meleeSwing 的扇形（体心 + range），不是点，所以刃尖落在权威枪口点上
//    只代表"出手方向与弹道同源"，不代表攻击距离——攻击距离仍完全由 WEAPONS[].range 决定。
// 3) 挥砍必须整件绕握点旋转（emit.swing），刃尖轨迹由真实旋转角曲线推出，
//    禁止画与武器脱节的大弧光；接触帧必须与既有判定帧（按下同帧结算）对齐在 1 帧内。
// 4) 投掷件的飞行/落地/引信/作用区只能读实体真实字段（b.fuse、b._bounced、b.vx/vy、areas.life），
//    不得另起一套美术计时器改变落点或时机。
const ArtMelee = (() => {
  const G = (typeof ArtGuns !== 'undefined') ? ArtGuns : null;
  const M = G ? G.M : null;
  // 近战专用材质（刀刃要比分体钢更亮，否则夜景下只剩一条黑边）
  const KM = {
    edgeSteel:  { base: '#7e8d9c', hi: '#cfd8dc', lo: '#4b5560', edge: '#eceff1' },  // 磨亮刃面
    bluedBlade: { base: '#4f5a66', hi: '#8b98a6', lo: '#2a3038', edge: '#cfd8dc' },  // 烤蓝刀身
    rubber:     { base: '#24292e', hi: '#3b4248', lo: '#141719', edge: '#4d555c' },  // 橡胶缠柄
    steelPart:  { base: '#5a646e', hi: '#8d99a6', lo: '#333a42', edge: '#c0cbd5' },  // 护手/柄头
  };

  // ============================================================
  // knife —— 军用匕首（制式战斗匕首，刃约 18 cm、柄约 10 cm）
  // ------------------------------------------------------------
  // 比例：整刀 13.5 布局单位（1 单位 ≈ 28 mm，与第 6 阶段枪械同一把标尺）。
  //   刃 180mm → 6.4、柄 100mm → 3.6、护手 50mm → 1.8。
  // **全部按整数像素行布局**：战斗尺度下 1 单位就是 1px，小数高度会被四舍五入吞掉，
  // 第一版按"刃厚 3.2 单位"画出来在 12× 下像一把灰铲子（已作废），改成
  // 柄 3px / 护手 5px / 刃 3px→2px→1px 收尖后才是匕首的细长比例。
  // 侧视结构：
  //   ① 刃只占全长一半不到，且**从刀背向刃口收薄、并向刀尖二次收细**（唐刀/马来剑是一条等宽长刃）；
  //   ② 刃与柄之间有**上下各凸出一格的十字护手**（弹簧刀、蝴蝶刀没有横档）；
  //   ③ 柄比刃厚一格、柄尾是独立钢质柄头，握持关系一眼可辨。
  // 战斗尺度保留的 3 个辨认锚点：暗脊亮刃的收尖短刀 / 凸出的十字护手 / 粗于刃的柄 + 钢柄头。
  //
  // 为什么按"行"而不是按毫米摆：1 单位＝1px，而 Shape 会给每个实心件外扩 1px 描边，
  // 所以"刃厚 3 单位"实际会画成 5px 高的灰铲（第一版实测已作废）。真正 20mm 宽的刀身
  // 本来就只有 1px，于是按行分配：刃口 1 行（亮）+ 刀背 1 行（暗）→ 贴根 2px、向尖 1px。
  // ============================================================
  function knifeShape() {
    const S = G.Shape();
    const SPINE = { base: '#3a4249', hi: '#4f5a66', lo: '#242a30', edge: '#5d6b78' };   // 刀背（不磨）
    // —— 柄尾钢头（比刃厚一格，是能砸的钝头）——
    S.r(KM.steelPart, 0, -1, 1.1, 3);
    // —— 缠绳橡胶柄：全刀最厚的握持段 ——
    S.r(KM.rubber, 1.1, -1, 3.4, 3);
    // —— 十字护手：上下各凸出一格，全刀最"高"的横档 ——
    S.r(KM.steelPart, 4.5, -2, 0.9, 4);
    // —— 刃口（亮）：从贴根一路到刀尖 ——
    S.r(KM.edgeSteel, 5.4, 0, 8.1, 1);
    // —— 刀背（暗）：只到贴根六成处，之后只剩刃口一行＝向刀尖收细 ——
    S.r(SPINE, 5.4, -1, 5.2, 1);
    // —— 仅检视尺度：血槽、缠柄纹路、刀背锯齿、柄头铆钉 ——
    S.l('#2a3038', 5.9, -0.4, 9.6, -0.4, true);              // 血槽（贴着刃面上方）
    S.d('#4d555c', 1.5, 0, 1, true); S.d('#4d555c', 2.3, 0, 1, true);
    S.d('#4d555c', 3.1, 0, 1, true); S.d('#3b4248', 3.9, 0, 1, true);   // 缠柄
    for (let x = 5.7; x <= 7.3; x += 0.5) S.d('#8b98a6', x, -2, 1, true);  // 刀背锯齿（贴根一段）
    S.d('#c0cbd5', 0.4, 0, 1, true);                         // 柄头铆钉
    return S;
  }
  let knifeCache = null;
  function knifeSilhouette(ctx, art, p, Pen, opts) {
    if (!knifeCache) knifeCache = knifeShape();
    knifeCache.paint(ctx, art.mats, !!(opts && opts.view === 'inspect'));
  }

  function register() {
    WeaponArt.define('knife', {
      ver: 's7-v1', mech: 'blade',
      // muzzle＝刃尖；grip＝缠绳柄的正中（手就在这里，挥砍也绕这里转）；stock＝柄头末端
      layout: {
        len: 13.5, muzzle: [13.5, 0], grip: [2.8, 0], fore: null,
        eject: null, mag: null, magBase: null, stock: [0, 0], sight: null,
      },
      mats: { body: KM.bluedBlade, furniture: KM.rubber, barrel: KM.edgeSteel, edge: KM.edgeSteel.hi },
      silhouette: knifeSilhouette,
      features: ['短刃 + 双刃收尖（刃长不足全长一半）', '刀身与柄之间明显突出的十字护手', '柄尾独立钢质柄头（比柄身高一档）'],
      emit: {
        // 正手快割/刺：u=0 抬到瞄准线上方 0.62 rad，1 帧内（u=0.06）转到瞄准线上＝接触帧，
        // 之后随势下压收招。接触帧与 meleeSwing 的同步结算帧相差 ≤1 帧。
        swing: {
          pivot: [2.8, 0],
          keys: [[0, -0.62], [0.06, 0.05], [0.26, 1.05], [0.6, 0.34], [1, -0.05]],
          lunge: { at: 0.06, px: 3.2 },
          trail: { samples: 6, fade: 0.5, width: 2 },
        },
      },
    });
  }

  if (typeof window !== 'undefined') {
    if (typeof WeaponArt !== 'undefined' && G) register();
    window.ArtMelee = { register, KM, silhouettes: { knife: knifeSilhouette } };
  }
  return { register, KM, silhouettes: { knife: knifeSilhouette } };
})();
