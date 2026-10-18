// ============ 第 9 阶段：英雄专属枪 / 英雄形态 / 攻防干员 的逐件美术档案 ============
// 与第 6/7/8 阶段同一套机制：一件一个 WeaponArt.define()。
// 本轮只做 hero_light（圣光之枪）。英雄形态 light 本体**不算完成**，只做承载这把枪所需的最小连接。
//
// 能量枪的表达约束（第 9.2 步）：
//   - 它是能量武器 → 只表现"聚能 → 释放 → 复位"，绝不画抛壳、拉机柄、弹匣；
//   - 能源流动必须由真实射击事件驱动（第 3 阶段 energy 时间轴里那条一直没人消费的 charge 段，
//     本轮在 ArtEvents.replay 里开了只读通道 → pose().charge），不许用随机闪烁假装充能；
//   - 枪口焰/亮芯颜色必须跟着该件档案走（原来能量芯被硬写成红色，金色枪顶红芯）。
const ArtHero = (() => {
  const G = (typeof ArtGuns !== 'undefined') ? ArtGuns : null;
  const M = G ? G.M : null;
  const HM = {
    gold:      { base: '#c9a83a', hi: '#ffe082', lo: '#8a6a20', edge: '#fff59d' },  // 圣光主体金
    goldDark:  { base: '#8a6a20', hi: '#c9a83a', lo: '#573f12', edge: '#e0b95a' },  // 骨架/托
    whiteGold: { base: '#e8d79a', hi: '#fffde7', lo: '#a9975c', edge: '#ffffff' },  // 聚焦环
    crystal:   { base: '#fff176', hi: '#ffffff', lo: '#c9a83a', edge: '#fffde7' },  // 储能晶胞
    bore:      { base: '#3a2f10', hi: '#6b5718', lo: '#1a1503', edge: '#ffe082' },  // 发射口内腔
    // —— 第 17 批：两张参照图实测出来的涂装 ——
    // 圣光之枪的主体不是金而是**象牙白**，金只是骨架与缘饰。
    // 原来全按金色建，画出来像一根金条（见 审计产物/S9-hero_light-仓库放大预览-3x.png）。
    ivory:     { base: '#e6e1d3', hi: '#fffdf5', lo: '#a9a294', edge: '#ffffff' },  // 象牙白翼面
    // 玄月之矢：深靛蓝主体 + 月白银环 + 紫罗兰能量。调色板里没有一个够蓝够深的，
    // 用 M.glass(#1b2b3a) 会画成墨绿黑，照片主峰实测在 rgb(43,42,85) 一族。
    indigo:    { base: '#2b2a55', hi: '#54539a', lo: '#171634', edge: '#7f7ec4' },  // 深靛蓝
    moonwhite: { base: '#cfd6ea', hi: '#ffffff', lo: '#8c96b4', edge: '#eef2ff' },  // 月白/银
    violet:    { base: '#7e5bd6', hi: '#c7a8ff', lo: '#3d2a72', edge: '#e2d0ff' },  // 紫罗兰能量
  };

  // ============================================================
  // hero_light —— 圣光之枪（光能救世主的专属能量步枪，全长约 780 mm）
  // ------------------------------------------------------------
  // 比例：28 布局单位（1 单位 ≈ 28 mm，与第 6/8 阶段同一把标尺）。
  // 侧视结构（战斗尺度保留的 3 个辨认锚点）：
  //   ① **开放式双叉光托**（尾端是两根金爪夹空，不是任何常规枪的实心枪托/缓冲管）；
  //   ② 发射罩外周**三道白色聚焦环**垂直包住管身（常规枪没有环状件，加特林是旋转枪管）；
  //   ③ 机匣后上方一枚**凸起的储能晶胞**（补能口），全枪没有弹匣、没有抛壳口、没有拉机柄。
  // 与 m4a1/rpg7 的区别：没有机匣-枪管-弹匣三段式轮廓，整体是"脊骨 + 罩 + 环 + 晶胞"。
  // ============================================================
  // ============================================================
  // hero_light —— 圣光之枪（第 17 批按首张真参照图重建）
  // ------------------------------------------------------------
  // 目标格（格心 ∪ 整格，69 格，洞 10）：col 0 = 翼托尾端，col 28 = 枪口
  //   行  4：1        行  3：0-2, 6      行  2：1, 3-6, 8-10
  //   行  1：0-11     行  0：0-1, 3-4, 6-15, 17-23, 25-27
  //   行 -1：0, 8-14, 16-17, 19-20, 23-25              行 -2：8-9, 11-12, 25
  // **旧档案（s9-v1）与照片的差别不是"细节不够"，是认错了件东西**：旧版画的是
  //   "双叉光托 + 发射罩 + 三道聚焦环 + 顶置储能晶胞"，照片里这四件一件都没有 ——
  //   真实形态是**长细管 + 平顶瞄准镜 + 机匣侧面一枚日徽 + 向后展开的白翼托**。
  //   见 审计产物/S9-hero_light-仓库放大预览-3x.png（旧）与 hero_light-检视-24x放大.png（新）。
  // 长度仍取 s9 定过的 28 单位：这批两张英雄图是**各自裁切、各自缩放**导出的
  //   （画布 1254² 与 1672×941），第 16 批那套共享标尺搬不过来，也没有公开全长可反解。
  //   能立住的是**两把之间的比**：各自量自己图里的手枪握把，
  //   墨迹长 ÷ 握把长 = 1201/137 = 8.77（玄月）与 1617/179 = 9.03（圣光），
  //   差 3% ⇒ 两把实长几乎相同 ⇒ hero_xuan 按同一口径取 28 × 8.77/9.03 = 27.2。
  //   这个比值法**不需要知道握把到底多少毫米**，未知量被约掉了。
  // ============================================================
  // 枪体与"充能流光"共用的坐标 —— 写在一处，重建轮廓时流光不会画到旧位置上去。
  const LG = {
    emblem: [9.4, 1.4],      // 日徽（机匣侧面那枚发光圆盘）= 充能起点
    muzzle: [25.4, -0.6],    // 枪口星环 = 充能终点 / 发射光核
    翼羽缝: [2, 4, 6],       // 白翼上的三道羽缝（检视）
  };
  function heroLightBody(S) {
    // —— 长细管：行 0 与行 -1 交错（照片里管身只有 30~45 原图px 厚，比一格还薄）——
    S.r(HM.ivory, 0, -1, 1.0, 1);                            // 镜尾盖 → col 0 / 行 -1
    S.r(HM.ivory, 8, -1, 7.0, 1);                            // 瞄准镜筒 → cols 8-14 / 行 -1
    S.r(HM.gold, 16, -1, 2.0, 1);                            // 管身上沿 → cols 16-17 / 行 -1
    S.r(HM.gold, 19, -1, 2.0, 1);                            // 管身上沿 → cols 19-20 / 行 -1
    S.r(HM.gold, 23, -1, 3.0, 1);                            // 枪口星环上沿 → cols 23-25 / 行 -1
    S.r(HM.ivory, 0, 0, 2.0, 1);                             // 托颈 → cols 0-1 / 行 0
    S.r(HM.gold, 3, 0, 2.0, 1);                               // 机匣 → cols 3-4 / 行 0
    S.r(HM.ivory, 6, 0, 10.0, 1);                            // 机匣 + 管身 → cols 6-15 / 行 0
    S.r(HM.gold, 17, 0, 7.0, 1);                             // 管身 → cols 17-23 / 行 0
    S.r(HM.ivory, 25, 0, 3.0, 1);                            // 枪口星环 → cols 25-27 / 行 0
    // —— 平顶瞄准镜：镜筒上方两枚卡箍凸到行 -2 ——
    S.r(HM.ivory, 8, -2, 2.0, 1);                            // 前卡箍 → cols 8-9 / 行 -2
    S.r(HM.ivory, 11, -2, 2.0, 1);                           // 后卡箍 → cols 11-12 / 行 -2
    S.r(HM.gold, 25, -2, 1.0, 1);                            // 星环顶爪 → col 25 / 行 -2
    // —— 向后展开的白翼托（行 1 通长，往下收成三片羽）——
    S.r(HM.ivory, 0, 1, 12.0, 1);                            // 翼面 → cols 0-11 / 行 1
    S.r(HM.gold, 1, 2, 1.0, 1);                              // 羽尖 → col 1 / 行 2
    S.r(HM.ivory, 3, 2, 4.0, 1);                             // 羽片 → cols 3-6 / 行 2
    S.r(HM.crystal, 8, 2, 3.0, 1);                           // **日徽** → cols 8-10 / 行 2
    S.r(HM.ivory, 0, 3, 3.0, 1);                             // 羽片 → cols 0-2 / 行 3
    S.r(HM.gold, 6, 3, 1.0, 1);                              // 托底金爪 → col 6 / 行 3
    S.r(HM.gold, 1, 4, 1.0, 1);                              // 托底金爪尖 → col 1 / 行 4
    // —— 检视细节：全部落在已点亮格上，且避开 10 个洞 ——
    for (const c of LG.翼羽缝) S.l(HM.gold.lo, c + 0.4, 0.6, c + 0.4, 1.4, true);   // 羽缝（行 1）
    S.l(HM.whiteGold.hi, 8.4, -1.4, 14.4, -1.4, true);       // 镜筒高光（行 -1）
    S.l(HM.crystal.hi, 17.4, 0.4, 23.4, 0.4, true);          // 管身能量线（行 0；0.6 会被 round 到行 1）
    S.d(HM.crystal.hi, LG.emblem[0], LG.emblem[1], 1, true); // 日徽心
    S.d(HM.crystal.edge, LG.muzzle[0], LG.muzzle[1], 1, true); // 星环心
  }
  let lightCache = null;
  function lightShape() { const S = G.Shape(); heroLightBody(S); return S; }

  // 静态枪体 + 由真实事件驱动的能源流动层（聚能 → 释放）。
  // 只读 pose().charge / pose().flash：没有射击事件时两者都是 0，画面就是纯待机。
  function lightSilhouette(ctx, art, p, Pen, opts) {
    if (!lightCache) lightCache = lightShape();
    lightCache.paint(ctx, art.mats, !!(opts && opts.view === 'inspect'));
    const ch = (p && p.charge) || 0, fl = (p && p.flash) || 0;
    if (ch <= 0.01 && fl <= 0.01) return;
    const lay = art.layout;
    // 日徽充能：亮芯从机匣侧面的日徽出发，沿长管流向枪口星环（三点连线，全走 energy 时间轴的 charge 段）
    ctx.globalAlpha = Math.min(0.95, 0.35 + ch * 0.6);
    ctx.fillStyle = HM.crystal.hi;
    pxCircle(ctx, LG.emblem[0], LG.emblem[1], 1 + ch * 0.9);
    ctx.fillStyle = HM.gold.edge;
    for (let i = 0; i < 3; i++) {
      const t = i / 2, x = LG.emblem[0] + (LG.muzzle[0] - LG.emblem[0]) * t;
      pxCircle(ctx, x, LG.emblem[1] + (LG.muzzle[1] - LG.emblem[1]) * t, 0.5 + ch * (0.9 - t * 0.3));
    }
    // 管身能量线逐段点亮（顺序沿 +x，取代旧档案那三道照片里根本不存在的"聚焦环"）
    for (let i = 0; i < 3; i++) {
      const on = Math.max(0, Math.min(1, ch * 3 - i));
      if (on <= 0) continue;
      ctx.globalAlpha = 0.25 + on * 0.6;
      ctx.fillStyle = HM.crystal.edge;
      pxRect(ctx, 17 + i * 2.4, -1.4, 1.6, 2.4);
    }
    // 发射口光核：由 flash 段驱动，与枪口焰同一事件时序
    if (fl > 0.01) {
      ctx.globalAlpha = Math.min(1, fl);
      ctx.fillStyle = HM.crystal.hi;
      pxCircle(ctx, LG.muzzle[0], LG.muzzle[1], 1 + fl * 1.6);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 玄月之矢（第 17 批新建：目标并集 91 格，洞 7）----------
  // col 0 = 翼托尾端，col 27 = 枪口星尖
  //   行  6：13        行  5：0-1, 7, 9, 13    行  4：0-2, 7-9, 13-14
  //   行  3：0-2, 4, 7-9, 13-14               行  2：0-5, 7-9, 13-14
  //   行  1：0-4, 6-15  行  0：0-17, 21-25, 27  行 -1：8-20, 24-26  行 -2：11-12
  //   三串**垂挂的星形挂饰**（cols 7-9 与 13 一路到行 6）是皮肤几何的一部分，不是配件模块，
  //   所以留在本体里 —— 与第 13 批"脚架按安装方式分"同一口径：不可拆的装饰算本体。
  //   行 -1/0 交错的那条细长管，照片里只有 30~45 原图px 厚、比一格薄 ⇒ 只能占一行，
  //   这是"细件走 l()、别硬撑成三行"那条老规矩的又一次兑现。
  const XG = { dial: [11.4, -1.4], tip: [25.4, -0.6] };   // 月盘（充能起点）/ 枪口星（终点）
  function heroXuanBody(S) {
    S.r(HM.indigo, 0, 0, 18.0, 1);                           // 托 + 机匣 + 管身主线 → cols 0-17 / 行 0
    S.r(HM.gold, 21, 0, 5.0, 1);                             // 前管 → cols 21-25 / 行 0
    S.r(HM.gold, 27, 0, 1.0, 1);                             // 枪口星尖 → col 27 / 行 0
    S.r(HM.moonwhite, 8, -1, 13.0, 1);                       // 月白导管（能量走这一行）→ cols 8-20 / 行 -1
    S.r(HM.gold, 24, -1, 3.0, 1);                            // 星环上沿 → cols 24-26 / 行 -1
    S.r(HM.moonwhite, 11, -2, 2.0, 1);                       // **玄月盘**顶缘 → cols 11-12 / 行 -2
    S.r(HM.indigo, 0, 1, 5.0, 1);                            // 翼托 → cols 0-4 / 行 1
    S.r(HM.indigo, 6, 1, 10.0, 1);                           // 机匣底 + 握把根 → cols 6-15 / 行 1
    S.r(HM.indigo, 0, 2, 6.0, 1);                            // 翼托 → cols 0-5 / 行 2
    S.r(HM.gold, 7, 2, 3.0, 1);                              // 第一串星坠 → cols 7-9 / 行 2
    S.r(HM.gold, 13, 2, 2.0, 1);                             // 握把 → cols 13-14 / 行 2
    S.r(HM.indigo, 0, 3, 3.0, 1);                            // 翼托 → cols 0-2 / 行 3
    S.r(HM.gold, 4, 3, 1.0, 1);                              // 托底金爪 → col 4 / 行 3
    S.r(HM.gold, 7, 3, 3.0, 1);                              // 星坠 → cols 7-9 / 行 3
    S.r(HM.gold, 13, 3, 2.0, 1);                             // 握把 → cols 13-14 / 行 3
    S.r(HM.indigo, 0, 4, 3.0, 1);                            // 翼托 → cols 0-2 / 行 4
    S.r(HM.gold, 7, 4, 3.0, 1);                              // 星坠 → cols 7-9 / 行 4
    S.r(HM.gold, 13, 4, 2.0, 1);                             // 握把 → cols 13-14 / 行 4
    S.r(HM.indigo, 0, 5, 2.0, 1);                            // 托尾 → cols 0-1 / 行 5
    S.r(HM.gold, 7, 5, 1.0, 1);                              // 星坠尖 → col 7 / 行 5
    S.r(HM.gold, 9, 5, 1.0, 1);                              // 星坠链 → col 9 / 行 5
    S.r(HM.gold, 13, 5, 1.0, 1);                             // 握把底 → col 13 / 行 5
    S.r(HM.gold, 13, 6, 1.0, 1);                             // 最长那串星坠的末梢 → col 13 / 行 6
    // —— 检视细节：全部落在已点亮格上，避开 7 个洞 ——
    S.l(HM.violet.hi, 8.4, -1.4, 20.4, -1.4, true);          // 月白导管里的紫能量流（行 -1）
    S.d(HM.violet.hi, XG.dial[0], XG.dial[1], 1, true);      // 月盘心
    S.l(HM.gold.lo, 1.4, 2.6, 2.4, 2.6, true);               // 翼托分片（行 3 的 cols 1-2）
    S.l(HM.gold.lo, 8.4, 2.6, 8.4, 4.4, true);               // 星坠链（col 8 行 3-4）
    S.l(HM.indigo.hi, 13.4, 3.6, 13.4, 4.4, true);           // 握把纹（col 13 行 4）
  }
  let xuanCache = null;
  function xuanSilhouette(ctx, art, p, Pen, opts) {
    if (!xuanCache) { const S = G.Shape(); heroXuanBody(S); xuanCache = S; }
    xuanCache.paint(ctx, art.mats, !!(opts && opts.view === 'inspect'));
    // **只画 flash 层，不画 charge 层**：bow-hero 的 cycle 是 'draw'，走 TIMELINES.fire.draw
    // （anchor / release / flash / limb / recover），里面没有 charge 段 ⇒ pose().charge 恒为 0。
    // 若照搬圣光那套"充能流光"，它就是一段永远不会被驱动的死代码，
    // 而且等于给一把弓假装有能量充能 —— 合同明确禁止"表现该件不存在的机械过程"。
    const fl = (p && p.flash) || 0;
    if (fl <= 0.01) return;
    ctx.globalAlpha = Math.min(1, fl);
    ctx.fillStyle = HM.violet.edge;
    pxCircle(ctx, XG.tip[0], XG.tip[1], 1 + fl * 1.6);
    ctx.globalAlpha = 1;
  }

  function register() {
    WeaponArt.define('hero_light', {
      ver: 'batch17-gridfit', mech: 'energy-hero',
      layout: {
        len: 28, muzzle: [28, -0.3], grip: [9.5, 1.6], fore: [19.0, -0.6],
        eject: null, mag: [11.5, -1.6], magBase: [11.5, -3.6],
        stock: [0.6, 2.0], sight: [11.0, -2.0],
      },
      mats: { body: HM.ivory, furniture: HM.gold, barrel: HM.whiteGold },
      silhouette: lightSilhouette,
      // 能量枪的补能：机制表里 energy-hero 的 reload 是 'none'（所以 R 键有玩法时长却零阶段可播），
      // 这里按"换储能晶胞"给它一条真实的视觉路径；时长仍完全取玩法值，不改一秒。
      reloadPath: 'cell',
      shell: 'none',
      features: ['平顶瞄准镜通长 cols 8-14，两枚卡箍凸到行 -2（旧档案把它画成了"聚焦环"）', '机匣侧面一枚发光日徽（cols 8-10 行 2）—— 充能亮芯就从这里出发', '向后展开的象牙白翼托：行 1 通长 12 格，往下收成三片羽、末端两枚金爪', '长细管只占一行（照片里管身比一格还薄），到枪口才张成星环'],
      emit: {
        flash: { petals: 4, fwd: 1.1, side: 1.7, ball: 0.5, tail: 0, jitter: 0.16, win: [0, 0.55],
          col: '#fff9c4', edgeCol: '#ffffff', coreCol: '#fff59d', coreLen: 3.4, coreLen2: 1 },
        smoke: { puff: 1.8, rise: -3, drift: 5, at: 0.22, alpha: 0.30, col: '#fff59d', col2: '#ffe082' },
        energy: { col: '#fff59d' },
        // 能量弹丸：亮芯 + 光晕 + 短拖尾（第 8 阶段的 projectile 词表是火箭专用的，这里补 bolt 形态）
        projectile: {
          kind: 'bolt', core: { r: 1.6, col: '#ffffff' }, halo: { r: 3.0, col: '#fff59d', alpha: 0.55 },
          tail: { segs: 5, len: 16, col: '#fff9c4', fade: 0.5 },
        },
        reload: { cellLen: 3.2, cellW: 2.2, dropSpin: 0 },
      },
    });

    // ---------- 玄月之矢（第 17 批新建） ----------
    WeaponArt.define('hero_xuan', {
      ver: 'batch17-gridfit', mech: 'bow-hero',
      // len 27.2：**两把英雄枪之间的比值法**，不是拍的绝对毫米数。
      //   两张图各自裁切、各自缩放导出（画布 1254² 与 1672×941），所以第 16 批那套
      //   "一套系列共享 px/mm"的标定搬不过来；能量件各自量自己图里的手枪握把，
      //   墨迹长 ÷ 握把长 = 8.77（玄月）与 9.03（圣光），差 3% ⇒ 两把实长几乎相同
      //   ⇒ 玄月 = 圣光的 28 × 8.77/9.03 = 27.2。**握把到底多少毫米被约掉了**，
      //   所以这个数只依赖"两把枪的握把一样大"这一条弱假设。
      // 配置 MECH 写的是 bow-hero（拉弓循环），可照片里是**手枪握把 + 扳机护圈的枪形**，
      // 没有弓臂也没有弦。与 m1014 同一口径：按配置建、机构表不动、不自洽写在这里。
      layout: {
        len: 27.2, muzzle: [27.2, -0.3], grip: [13.5, 2.6], fore: [19.0, -0.6],
        eject: null, mag: [11.5, -1.6], magBase: [11.5, -3.6],
        stock: [0.6, 2.0], sight: [11.5, -2.4],
      },
      mats: { body: HM.indigo, furniture: HM.gold, barrel: HM.moonwhite },
      silhouette: xuanSilhouette,
      reloadPath: 'cell',
      shell: 'none',
      features: ['机匣上方一枚**玄月盘**（cols 11-12 凸到行 -2），全枪最认得的一件', '三串垂挂的星形挂饰（cols 7-9 与 col 13 一路到行 6）—— 战斗尺度下唯一比枪还长的装饰', '月白导管走行 -1、靛蓝管身走行 0，两条在 cols 18-20 之间错开一格（照片里管是斜的）', '枪口是一枚四芒星尖（col 27），不是任何常规消焰器'],
      emit: {
        flash: { petals: 4, fwd: 1.2, side: 1.5, ball: 0.5, tail: 0, jitter: 0.18, win: [0, 0.55],
          col: '#e1bee7', edgeCol: '#ffffff', coreCol: '#ce93d8', coreLen: 3.2, coreLen2: 1 },
        smoke: { puff: 1.6, rise: -3, drift: 5, at: 0.22, alpha: 0.28, col: '#b39ddb', col2: '#7e57c2' },
        energy: { col: '#ce93d8' },
        projectile: {
          kind: 'bolt', core: { r: 1.6, col: '#f3e5f5' }, halo: { r: 3.0, col: '#ce93d8', alpha: 0.55 },
          tail: { segs: 5, len: 16, col: '#e1bee7', fade: 0.5 },
        },
        reload: { cellLen: 3.0, cellW: 2.0, dropSpin: 0 },
      },
    });
  }

  if (typeof window !== 'undefined') {
    if (typeof WeaponArt !== 'undefined' && G) register();
    window.ArtHero = { register, HM, silhouettes: { hero_light: lightSilhouette, hero_xuan: xuanSilhouette } };
  }
  return { register, HM, silhouettes: { hero_light: lightSilhouette, hero_xuan: xuanSilhouette } };
})();
