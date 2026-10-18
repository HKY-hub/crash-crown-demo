// ============ 第 8 阶段：地面拾取特殊武器／道具的逐件美术档案 ============
// 与第 6 阶段 js/art-guns.js、第 7 阶段 js/art-melee.js 同一套机制：一件一个 WeaponArt.define()。
// 规则：
// 1) 外形按该件真实结构给坐标；不允许"通用小枪轮廓 + 换长度"（现状：7 件拾取项因 g==='pickup'
//    全被 legacyParts 画成机匣+枪管+枪托的通用枪，连轩辕剑和激素针也是）。
// 2) layout.muzzle = 该件**真实弹丸/作用的权威起点**（沿用第 2 阶段约定，不改弹道）。
// 3) 发射侧只表现该件真实存在的机械过程：
//    - RPG-7／榴弹发射器：**不抛壳**（无弹壳），真实特征是尾部后喷锥 → 用 emit.backblast；
//    - 激光毁灭者：能量释放，无壳无烟；
//    - 火焰喷射器：不产生飞行弹体（bspeed=0 的静止火点），可见主体是喷出的火舌与导火线；
//    - 轩辕剑：近战扇形，走第 7 阶段的 emit.swing；
//    - 震撼弹/激素针：投掷件，走投掷时间轴。
// 4) 弹丸本体（火箭弹/榴弹）由 emit.projectile 描述，绘制在 js/ui.js 的弹丸循环里读取同一份档案。
const ArtPickup = (() => {
  const G = (typeof ArtGuns !== 'undefined') ? ArtGuns : null;
  const M = G ? G.M : null;
  // 拾取件专用材质细分（都在同一调色板内，避免"换色当换形"）
  const PM = {
    tube:      { base: '#4a525c', hi: '#78848f', lo: '#2b3138', edge: '#9aa7b3' },  // 发射管内壁外的钢
    tubeBore:  { base: '#1a1e22', hi: '#2f363d', lo: '#0e1114', edge: '#4a525c' },  // 管口内腔
    burnt:     { base: '#3a3a38', hi: '#5c5b56', lo: '#222221', edge: '#7a6f5c' },  // 尾喷口烧蚀
    woodGuard: { base: '#8a5a2a', hi: '#a9743d', lo: '#5f3a1c', edge: '#c08a4e' },  // 隔热木护罩
    optics:    { base: '#1b2b3a', hi: '#4a7f9e', lo: '#0d161f', edge: '#9fd8ef' },  // 光学瞄具镜片
    warhead:   { base: '#4e5a45', hi: '#7d8a6f', lo: '#2c3327', edge: '#a3b092' },  // 火箭弹体
    copper:    { base: '#b87f42', hi: '#e0a86a', lo: '#7c5228', edge: '#f0cfa0' },  // 药型罩铜色
    // 第 16 批按照片改色：火焰喷射器那只主燃料罐是**橄榄绿**（实测墨色主峰在 #4e5a3c 一族），
    // 原来给的 #6d3a3a 是红棕，画出来像锈罐。PM.tank 目前只有这一处用，直接改色最省。
    tank:      { base: '#4e5a3c', hi: '#7a8a5e', lo: '#2c3524', edge: '#a2b183' },  // 燃料罐（橄榄绿）
    iron:      { base: '#4a4642', hi: '#6e6a64', lo: '#2a2724', edge: '#8f8a83' },  // 铸铁箍带/阀体
    // 激光毁灭者的等离子管束：蓝光在照片里是**几何**（三根管子），不是特效光晕，
    // 所以它进本体、直接当一个材质用；特效侧仍然只走 emit.flash。
    plasma:    { base: '#2f7fd8', hi: '#9fdcff', lo: '#144a86', edge: '#d6f2ff' },
  };

  // ============================================================
  // rpg7 —— RPG-7 型 40 mm 单发火箭筒（全长约 950 mm）
  // ------------------------------------------------------------
  // 比例：34 布局单位（1 单位 ≈ 28 mm，与第 6 阶段同一把标尺）。
  //   尾喷管(喇叭口) ≈ 100mm → 3.5；后管 + 扳机握把 ≈ 250mm → 9；
  //   木质隔热护罩 ≈ 170mm → 6；管顶光学瞄具 ≈ 120mm → 4.3；前管 + 准星 ≈ 230mm → 8；
  //   装填时 PG-7 战斗部探出管口 ≈ 120mm → 4。
  // 侧视结构（战斗尺度保留的 3 个辨认锚点）：
  //   ① **前后贯通的粗直管**，管口能看到深色内腔 —— 与"枪管+机匣"的常规枪第一眼看不同；
  //   ② 管顶**独立的光学瞄具**（带蓝色镜片）+ 管身**木护罩**（颜色与质感都跳出来）；
  //   ③ 尾部**外扩的喇叭形喷管**（后喷焰就从这里出），加上双握把与扳机护圈。
  // 状态：`mag>0` 时管口探出绿色弹体 + 铜色药型罩（已装填），打空后管口只剩内腔。
  // ============================================================
  // —— 逐格建模的共用外壳：与 js/art-guns.js 的 单向() 同一套（那边没导出，这里各建一份）——
  const 形缓存 = {};
  function 格形(name, build) {
    return function (ctx, art, p, Pen, opts) {
      if (!形缓存[name]) { const S = G.Shape(); build(S); 形缓存[name] = S; }
      形缓存[name].paint(ctx, art.mats, !!(opts && opts.view === 'inspect'));
    };
  }

  // 第 15 批量具校准搬过来用：这批四张图同属一套美术系列，共享同一个像素标尺。
  //   由 RPG-7 反解：照片里发射管段 872 原图px ↔ 公开管长 950mm ⇒ 1 原图px = 1.089mm
  //   ⇒ 1 布局单位（29.4mm）= 27 原图px。同一倍率折回来，另外三把的手枪握把分别是
  //   83 / 103 / 103 mm —— 全是标准尺寸，所以这条标尺不是挑出来的，是四方交叉对上的。
  function rpgShape(loaded) {
    const S = G.Shape();
    rpg7Body(S);
    // —— 已装填：PG-7V 战斗部探出管口 ——
    // 照片里**就是装着弹拍的**：弹头从 col 32.3 一路探到约 col 43.8（11.5 单位 = 338mm），
    // 而栅格对表只比 col 0..32 ⇒ 这一段天然落在本体对表之外，不用进本体排除表。
    // 它是"状态"不是"本体"：打空之后这些格必须全部消失。
    if (loaded) {
      S.r(PM.warhead, 32.3, -1.0, 7.0, 2);                   // 弹体（与管身同厚的起点）
      S.r(PM.warhead, 33.3, -2.0, 5.0, 4);                   // 卵形部最粗处（Ø≈75mm）
      S.r(PM.warhead, 38.3, -1.0, 3.0, 2);                   // 收向弹底
      S.r(PM.copper, 41.3, -1.0, 2.0, 2);                    // 引信探杆 + 药型罩
      S.l(PM.warhead.hi, 34.3, -1.4, 37.3, -1.4, true);      // 弹体环筋（检视）
    }
    return S;
  }
  // rpg7 本体（目标并集 96 格，洞 2）：col 0 = 尾喷管端，col 32 = 管口
  //   行  4：cols 20-21, 25-26   行  3：cols 20-21, 25-26   行  2：cols 20-22, 25-26
  //   行  1：col 0, cols 20-22, 25-26   行  0：cols 0-32   行 -1：cols 0-32
  //   行 -2：cols 0-1, 22-24, 30-31     行 -3：cols 22-24, 31
  //   洞：护圈 (18,1)(19,1) 一类的小空档 —— 见 _gun_target 的洞表，逐格里没有它们。
  //   管身在 1:1 下只有**两格厚**（照片等厚段 48.5 原图px = 52.8mm ÷ 29.4 = 1.8 格），
  //   木护罩比管身只粗 0.4 格、跨不出第三行 ⇒ 它只能靠**材质**读出来，不能靠轮廓。
  function rpg7Body(S) {
    S.r(PM.tube, 0, 0, 13.0, 1);                             // 后段发射管 → cols 0-12 / 行 0
    S.r(PM.woodGuard, 13, 0, 7.0, 1);                        // 木隔热护罩 → cols 13-19 / 行 0
    S.r(PM.tube, 20, 0, 13.0, 1);                            // 前段发射管 → cols 20-32 / 行 0
    S.r(PM.tube, 0, -1, 13.0, 1);                            // 同上 → cols 0-12 / 行 -1
    S.r(PM.woodGuard, 13, -1, 7.0, 1);                       // 木护罩上沿 → cols 13-19 / 行 -1
    S.r(PM.tube, 20, -1, 13.0, 1);                           // 前段上沿 → cols 20-32 / 行 -1
    S.r(PM.burnt, 0, -2, 2.0, 1);                            // 尾喷管喇叭口上沿 → cols 0-1 / 行 -2
    S.r(PM.burnt, 0, 1, 1.0, 1);                             // 尾喷管喇叭口下沿 → col 0 / 行 1
    S.r(PM.tube, 22, -2, 3.0, 1);                            // PGO-7 瞄具筒身 → cols 22-24 / 行 -2
    S.r(PM.optics, 22, -3, 3.0, 1);                          // 瞄具目镜端 → cols 22-24 / 行 -3
    S.r(PM.tube, 30, -2, 2.0, 1);                            // 准星护翼 → cols 30-31 / 行 -2
    S.r(PM.phosphate, 31, -3, 1.0, 1);                       // 准星座顶 → col 31 / 行 -3
    S.r(M.polyDark, 20, 1, 3.0, 1);                          // 后握把（扳机握把）→ cols 20-22 / 行 1
    S.r(M.polyDark, 25, 1, 2.0, 1);                          // 前握把 → cols 25-26 / 行 1
    S.r(M.polyDark, 20, 2, 3.0, 1);                          // 后握把 → cols 20-22 / 行 2
    S.r(M.polyDark, 25, 2, 2.0, 1);                          // 前握把 → cols 25-26 / 行 2
    S.r(M.polyDark, 20, 3, 2.0, 1);                          // 后握把 → cols 20-21 / 行 3
    S.r(M.polyDark, 25, 3, 2.0, 1);                          // 前握把 → cols 25-26 / 行 3
    S.r(M.polyDark, 20, 4, 2.0, 1);                          // 后握把底 → cols 20-21 / 行 4
    S.r(M.polyDark, 25, 4, 2.0, 1);                          // 前握把底 → cols 25-26 / 行 4
    // —— 检视细节：每一笔都落在已点亮格上，且不碰两个洞 ——
    S.l(PM.tube.hi, 2.4, -1.4, 12.4, -1.4, true);            // 后段管背高光
    S.l(PM.woodGuard.lo, 14.4, -1.4, 14.4, 0.4, true);       // 护罩分片缝（行 -1、0）
    S.l(PM.woodGuard.lo, 16.4, -1.4, 16.4, 0.4, true);
    S.l(PM.woodGuard.lo, 18.4, -1.4, 18.4, 0.4, true);
    S.d(PM.optics.hi, 23.4, -2.4, 1, true);                  // 瞄具镜片
    S.l(PM.burnt.hi, 0.4, -1.4, 0.4, 0.4, true);             // 喷口烧蚀边
    S.l(M.polyDark.hi, 20.4, 2.6, 21.4, 2.6, true);          // 握把防滑纹（行 3）
  }
  const rpgCache = { loaded: null, empty: null };
  function rpgSilhouette(ctx, art, p, Pen, opts) {
    const ent = p && p.ent;
    const loaded = !ent || !isFinite(ent.mag) || ent.mag > 0;
    if (!rpgCache[loaded ? 'loaded' : 'empty']) rpgCache[loaded ? 'loaded' : 'empty'] = rpgShape(loaded);
    rpgCache[loaded ? 'loaded' : 'empty'].paint(ctx, art.mats, !!(opts && opts.view === 'inspect'));
  }


  // ============================================================
  // gl / laser / flamer —— 第 16 批新增三把拾取件（格集合就是 _gun_target 的目标并集）
  // ============================================================

  // ---------- 榴弹发射器（目标并集 136 格，洞 2）：col 0 = 托尾，col 29 = 枪口 ----------
  //   行  6：cols 11-12      行  5：cols 9-12      行  4：cols 0-1, 9-12, 20-21
  //   行  3：cols 0-2, 9-13, 15, 20-21            行  2：cols 0-1, 4, 9-18, 20-21
  //   行  1：cols 0-5, 9-22, 29                   行  0：cols 0-7, 9-29
  //   行 -1：cols 0-29        行 -2：cols 13-20, 28-29          行 -3：cols 13-18
  //   骨架托的大空档（行 2 的 col 2-3、行 3 的 col 3）就是照片里托上那块三角镂空，必须留空。
  function glBody(S) {
    S.r(M.polyDark, 0, -1, 8.0, 1);                          // 托颈 → cols 0-7 / 行 -1
    S.r(M.olive, 8, -1, 22.0, 1);                            // 机匣 + 发射管上沿 → cols 8-29 / 行 -1
    S.r(M.polyDark, 0, 0, 8.0, 1);                           // 托身 → cols 0-7 / 行 0
    S.r(M.olive, 9, 0, 21.0, 1);                             // 机匣底 + 发射管下沿 → cols 9-29 / 行 0
    S.r(M.polyDark, 0, 1, 6.0, 1);                           // 托底 → cols 0-5 / 行 1
    S.r(M.olive, 9, 1, 14.0, 1);                             // 管身 → cols 9-22 / 行 1
    S.r(PM.tubeBore, 29, 1, 1.0, 1);                         // 口部法兰下沿 → col 29 / 行 1
    S.r(M.polyDark, 0, 2, 2.0, 1);                           // 托底板 → cols 0-1 / 行 2
    S.r(M.polyDark, 4, 2, 1.0, 1);                           // 托框立柱 → col 4 / 行 2
    S.r(M.olive, 9, 2, 10.0, 1);                             // 机匣下缘 → cols 9-18 / 行 2
    S.r(M.polyDark, 20, 2, 2.0, 1);                          // 垂直前握把 → cols 20-21 / 行 2
    S.r(M.polyDark, 0, 3, 3.0, 1);                           // 托底板 → cols 0-2 / 行 3
    S.r(M.polyDark, 9, 3, 4.0, 1);                           // 手枪握把 → cols 9-12 / 行 3
    S.r(M.olive, 13, 3, 1.0, 1);                             // 护圈后壁 → col 13 / 行 3
    S.r(M.olive, 15, 3, 1.0, 1);                             // 护圈前壁 → col 15 / 行 3
    S.r(M.polyDark, 20, 3, 2.0, 1);                          // 前握把 → cols 20-21 / 行 3
    S.r(M.polyDark, 0, 4, 2.0, 1);                           // 托底板 → cols 0-1 / 行 4
    S.r(M.polyDark, 9, 4, 4.0, 1);                           // 握把 → cols 9-12 / 行 4
    S.r(M.polyDark, 20, 4, 2.0, 1);                          // 前握把底 → cols 20-21 / 行 4
    S.r(M.polyDark, 9, 5, 4.0, 1);                           // 握把 → cols 9-12 / 行 5
    S.r(M.polyDark, 11, 6, 2.0, 1);                          // 握把底 → cols 11-12 / 行 6
    S.r(M.polyDark, 13, -2, 8.0, 1);                         // 平顶导轨 → cols 13-20 / 行 -2
    S.r(PM.tubeBore, 28, -2, 2.0, 1);                        // 口部法兰上沿 → cols 28-29 / 行 -2
    S.r(M.polyDark, 13, -3, 6.0, 1);                         // 导轨上的折叠瞄具 → cols 13-18 / 行 -3
    // —— 检视细节，全部落在已点亮格上 ——
    S.l(M.olive.hi, 9.4, -1.4, 27.4, -1.4, true);            // 管背高光
    S.l(M.polyDark.lo, 14.4, -2.4, 19.4, -2.4, true);        // 导轨齿
    S.l(M.polyDark.hi, 10.4, 2.6, 11.4, 3.4, true);          // 握把防滑纹（行 3）
    S.l(M.polyDark.hi, 20.4, 2.6, 20.4, 3.4, true);          // 前握把纵筋（行 3 的 col 20）
    S.d(PM.tubeBore.hi, 29.4, -1.4, 1, true);                // 口部内腔亮边
  }
  const glSilhouette = 格形('gl', glBody);

  // ---------- 激光毁灭者（目标并集 143 格，洞 4）：col 0 = 托尾，col 34 = 发射端 ----------
  //   行  5：cols 9-11        行  4：cols 9-11       行  3：cols 1-2, 9-12, 14
  //   行  2：cols 0-3, 9-13, 15, 17-18               行  1：cols 0-7, 9-23, 28, 32-33
  //   行  0：cols 0-34        行 -1：cols 0-28, 30-33
  //   行 -2：col 0, cols 8-22, 29-32                 行 -3：cols 12-15
  //   照片里那三根**发蓝光的发射管束**在 1:1 下就是前段的行 -1/0 —— 蓝光是本体不是特效，
  //   所以直接涂 plasma；真正不画的是辉光光晕（阈值本来也没吃到它）。
  function laserBody(S) {
    S.r(M.alu, 0, -1, 29.0, 1);                              // 机匣顶 + 管束上沿 → cols 0-28 / 行 -1
    S.r(M.alu, 30, -1, 4.0, 1);                              // 发射端上沿 → cols 30-33 / 行 -1
    S.r(M.polyDark, 0, 0, 8.0, 1);                           // 托身 → cols 0-7 / 行 0
    S.r(M.alu, 8, 0, 16.0, 1);                               // 机匣下缘 → cols 8-23 / 行 0
    S.r(PM.plasma, 24, 0, 11.0, 1);                          // 等离子管束 → cols 24-34 / 行 0
    S.r(M.polyDark, 0, 1, 8.0, 1);                           // 托框 → cols 0-7 / 行 1
    S.r(M.alu, 9, 1, 15.0, 1);                               // 机匣 → cols 9-23 / 行 1
    S.r(M.alu, 28, 1, 1.0, 1);                               // 散热鳍 → col 28 / 行 1
    S.r(PM.plasma, 32, 1, 2.0, 1);                           // 管束下缘 → cols 32-33 / 行 1
    S.r(M.polyDark, 0, 2, 4.0, 1);                           // 托底板 → cols 0-3 / 行 2
    S.r(M.polyDark, 9, 2, 5.0, 1);                           // 手枪握把 → cols 9-13 / 行 2
    S.r(M.polyDark, 15, 2, 1.0, 1);                          // 护圈后壁 → col 15 / 行 2
    S.r(M.polyDark, 17, 2, 2.0, 1);                          // 能量匣 → cols 17-18 / 行 2
    S.r(M.polyDark, 1, 3, 2.0, 1);                           // 托框下横撑 → cols 1-2 / 行 3
    S.r(M.polyDark, 9, 3, 4.0, 1);                           // 握把 → cols 9-12 / 行 3
    S.r(M.polyDark, 14, 3, 1.0, 1);                          // 护圈前壁 → col 14 / 行 3
    S.r(M.polyDark, 9, 4, 3.0, 1);                           // 握把 → cols 9-11 / 行 4
    S.r(M.polyDark, 9, 5, 3.0, 1);                           // 握把底 → cols 9-11 / 行 5
    S.r(M.polyDark, 0, -2, 1.0, 1);                          // 托尾板 → col 0 / 行 -2
    S.r(M.polyDark, 8, -2, 15.0, 1);                         // 机匣顶导轨 → cols 8-22 / 行 -2
    S.r(M.alu, 29, -2, 4.0, 1);                              // 发射端环 → cols 29-32 / 行 -2
    S.r(M.polyDark, 12, -3, 4.0, 1);                         // 红点瞄具 → cols 12-15 / 行 -3
    // —— 检视细节 ——
    S.l(PM.plasma.hi, 24.4, -0.4, 34.4, -0.4, true);         // 管束亮芯（行 0）
    S.l(M.alu.lo, 24.4, -1.4, 28.4, -1.4, true);             // 机匣与管束的分界（行 -1）
    S.l(M.polyDark.hi, 8.4, -2.4, 21.4, -2.4, true);         // 导轨齿
    S.l(M.polyDark.lo, 10.4, 3.6, 11.4, 4.4, true);          // 握把防滑纹（行 4）
    S.d(M.glass.hi, 13.4, -2.4, 1, true);                    // 红点镜片
  }
  const laserSilhouette = 格形('laser', laserBody);

  // ---------- 火焰喷射器（目标并集 176 格，洞 13）：col 0 = 罐端，col 33 = 喷口 ----------
  //   行  5：cols 3-8, 11-13  行  4：cols 3-18      行  3：cols 0-13, 17-18
  //   行  2：col 0, 2-14, 17-19                      行  1：col 0, 2-16, 18-20, 22-25, 31-32
  //   行  0：col 0, 2-33      行 -1：col 0, 3-33
  //   行 -2：cols 1-18, 20-21  行 -3：cols 4-5, 8-12          行 -4：col 10
  //   洞 13 个 —— 手柄与罐体之间全是桁架和管路围出来的真空，是本轨目前洞最多的一件；
  //   照包络涂实就等于把它的骨架画没了。**照片左端那截火舌不是本体**：
  //   量具按 GUN_INK=34.8 定标尺（本体 33.3 单位），火舌落在 col 33.3 之外，天然不进对表。
  function flamerBody(S) {
    S.r(PM.tank, 0, -1, 1.0, 1);                             // 罐顶盖 → col 0 / 行 -1
    S.r(PM.burnt, 3, -1, 31.0, 1);                           // 喷管上沿 → cols 3-33 / 行 -1
    S.r(PM.tank, 0, 0, 1.0, 1);                              // 罐顶盖 → col 0 / 行 0
    S.r(PM.burnt, 2, 0, 32.0, 1);                            // 喷管 + 机身上沿 → cols 2-33 / 行 0
    S.r(PM.tank, 0, 1, 1.0, 1);                              // 罐身 → col 0 / 行 1
    S.r(PM.tank, 2, 1, 15.0, 1);                             // 双罐 + 背架 → cols 2-16 / 行 1
    S.r(PM.burnt, 18, 1, 3.0, 1);                            // 管路 → cols 18-20 / 行 1
    S.r(M.polyDark, 22, 1, 4.0, 1);                          // 手枪握把 → cols 22-25 / 行 1
    S.r(PM.burnt, 31, 1, 2.0, 1);                            // 喷口法兰 → cols 31-32 / 行 1
    S.r(PM.tank, 0, 2, 1.0, 1);                              // 罐身 → col 0 / 行 2
    S.r(PM.tank, 2, 2, 13.0, 1);                             // 双罐 → cols 2-14 / 行 2
    S.r(PM.burnt, 17, 2, 3.0, 1);                            // 导燃管 → cols 17-19 / 行 2
    S.r(PM.tank, 0, 3, 14.0, 1);                             // 下罐 → cols 0-13 / 行 3
    S.r(PM.burnt, 17, 3, 2.0, 1);                            // 导燃管 → cols 17-18 / 行 3
    S.r(PM.tank, 3, 4, 16.0, 1);                             // 下罐底 → cols 3-18 / 行 4
    S.r(PM.tank, 3, 5, 6.0, 1);                              // 下罐箍 → cols 3-8 / 行 5
    S.r(M.polyDark, 11, 5, 3.0, 1);                          // 脚架/托底 → cols 11-13 / 行 5
    S.r(PM.iron, 1, -2, 18.0, 1);                            // 罐顶箍带 → cols 1-18 / 行 -2
    S.r(PM.iron, 20, -2, 2.0, 1);                            // 阀体 → cols 20-21 / 行 -2
    S.r(PM.iron, 4, -3, 2.0, 1);                             // 压力表 → cols 4-5 / 行 -3
    S.r(PM.iron, 8, -3, 5.0, 1);                             // 提把 → cols 8-12 / 行 -3
    S.r(PM.iron, 10, -4, 1.0, 1);                            // 提把顶 → col 10 / 行 -4
    // —— 检视细节：13 个洞，所以每一笔都只走已点亮的格 ——
    S.l(PM.burnt.hi, 24.4, -1.4, 32.4, -1.4, true);          // 喷管高光（行 -1）
    for (let i = 0; i < 5; i++) S.l(PM.iron.lo, 22.4 + i * 1.8, -0.4, 22.4 + i * 1.8, -0.4, true);  // 散热孔列（行 0）
    S.l(PM.tank.hi, 3.4, 0.6, 14.4, 0.6, true);              // 罐身环筋（行 1）
    S.l(PM.tank.lo, 4.4, 3.6, 12.4, 3.6, true);              // 下罐分界（行 4）
    S.l(M.polyDark.hi, 22.4, 0.6, 24.4, 0.6, true);          // 握把防滑纹（行 1）
  }
  const flamerSilhouette = 格形('flamer', flamerBody);

  function register() {
    WeaponArt.define('rpg7', {
      ver: 'batch16-gridfit', mech: 'launcher-reusable',
      // 权威管口＝弹丸真实出生点（第 2 阶段约定，本轮零位移）；stock＝尾喷口中心＝后喷焰锚点
      // len 由 s8-v1 的 34（当时 28mm/单位）改成 **32.3 = 950mm ÷ 29.4**，与全轨统一标尺对齐。
      // 照片是**装着弹**拍的：弹头探出管口 11.5 单位，量具用 GUN_INK=43.8 定标尺，
      // 所以那些格落在 col 32.3 之外、天然不进本体对表；它们由下面的 loaded 分支画。
      layout: {
        len: 32.3, muzzle: [32.3, -0.3], grip: [21.0, 2.6], fore: [25.5, 2.4],
        eject: null, mag: [30.0, -0.4], magBase: [36.0, -0.4],
        stock: [0.8, -0.4], sight: [23.0, -3.0],
      },
      mats: { body: PM.tube, furniture: PM.woodGuard, barrel: PM.tubeBore },
      silhouette: rpgSilhouette,
      // 后坐段：从击发到复位（recoil 0→1 由时间轴驱动，管体整体沿 -x 位移）
      shell: 'none',                       // RPG-7 无弹壳可抛：覆盖 launcher-reusable 的 on-cycle
      features: ['前后贯通的粗直发射管 + 管口深色内腔', '管顶独立光学瞄具（蓝镜片）与中段木护罩', '尾部外扩喇叭喷管 + 双握把'],
      emit: {
        // 管口焰：火箭出发时的短促火团（不是步枪的星形多瓣芒）。
        // ball 压到 0.55：实测 0.85 时焰核变成一个直径近 10px 的圆饼，把管口和弹尾都糊住了
        flash: { petals: 3, fwd: 1.7, side: 0.9, ball: 0.55, tail: 0, jitter: 0.25,
          win: [0.0, 0.26], col: '#ffe082', edgeCol: '#ff8a50' },
        // 尾喷锥：从喷口向后张开，比管口焰更长更占主导 —— 这是 RPG-7 的真实发射特征
        backblast: {
          at: 'stock', len: 15, spread: 0.52, rays: 6, alpha: 0.9, win: [0, 0.55],
          cols: ['#fff59d', '#ff8a50', '#9e9e9e'],
          smoke: { dist: 10, r: 3.4, alpha: 0.42, col: '#8d9198', col2: '#616161' },
        },
        smoke: { puff: 2.8, rise: -7, drift: 12, at: 0.16, alpha: 0.40, col: '#9e9e9e', col2: '#6d6f72' },
        // 弹丸本体：一枚能看出头部的火箭弹，而不是加粗曳光线
        projectile: {
          body: { len: 7, w: 2.2 }, bodyCol: '#4e5a45', bodyHi: '#8a9a7b',
          nose: { len: 2.6, col: '#c9a15a' },
          fins: { w: 3.0, h: 2.6, col: '#2c3327' },
          smoke: { n: 5, gap: 4, r: 1.8, fade: 0.34, col: '#8d9198', col2: '#616161' },
        },
        reload: { magRake: 0, magLen: 8, magW: 2.4, dropSpin: 0, holdOpen: false },
      },
    });

    // ---------- 榴弹发射器（第 16 批） ----------
    WeaponArt.define('gl', {
      ver: 'batch16-gridfit', mech: 'launcher-breakaction',
      // len 29.7 = 873mm：**照片内反解**，不是公开值 —— 这把是游戏件，查不到权威全长。
      // 标尺由同批 RPG-7 那张图定（管段 872 原图px ↔ 950mm ⇒ 1px = 1.089mm），
      // 折回来这只的握把高 83mm、前垂直握把 114mm，都在真实尺寸带内 ⇒ 标尺自洽。中置信。
      // 破膛装填 ⇒ mag/magBase 给**药室两端**（弹从膛口压进去），不虚构弹匣。
      // 它**有**药筒（40mm 弹壳在折膛时退出），所以不覆盖 shell，走表里的 on-break。
      layout: {
        len: 29.7, muzzle: [29.7, -0.3], grip: [10.5, 3.4], fore: [20.5, 2.6],
        eject: [16.0, -0.9], mag: [24.0, -0.3], magBase: [29.5, -0.3],
        stock: [0.5, 0.4], sight: [15.0, -3.0],
      },
      mats: { body: M.olive, furniture: M.polyDark, barrel: PM.tubeBore },
      silhouette: glSilhouette,
      features: ['粗药室 + 明显小于它的细枪管：行 -1/0 从 col 23 起收窄，口部再张一圈法兰', '平顶导轨通长 cols 13-20，上面立着折叠瞄具（行 -3）', '骨架托中间是真空三角（行 2 的 col 2-3、行 3 的 col 3 必须留空）', '扳机之前还有一只垂直前握把（cols 20-21 一路到行 4）'],
      emit: {
        flash: { petals: 4, fwd: 1.5, side: 1.0, ball: 0.7, tail: 0.1, jitter: 0.3, win: [0.0, 0.3],
          col: '#ffe082', edgeCol: '#ff8a50' },
        smoke: { puff: 3.0, rise: -6, drift: 14, life: 0.34, at: 0.18, alpha: 0.42 },
        eject: { fwd: -0.1, up: 1.0, spd: 120, spread: 0.5, spin: 14, shell: { len: 3.4, w: 3.0 } },
        bolt: { x: 20.4, y: -1.4, w: 2.0, h: 1.0, stroke: 0, mount: 'side' },
        reload: { magRake: 0, magLen: 3.2, magW: 3.0, dropSpin: 2, holdOpen: false },
      },
    });

    // ---------- 激光毁灭者（第 16 批） ----------
    WeaponArt.define('laser', {
      ver: 'batch16-gridfit', mech: 'energy',
      // len 34.3 = 1008mm：**照片内反解**（同批 RPG-7 定的 1px = 1.089mm），这把是虚构能量武器，
      // 没有公开全长可查。折回来它的手枪握把 103mm、机匣高 141mm ⇒ 中置信。
      // 前段那三根蓝管是**本体几何**不是特效：照片里它们有硬边界、有暗色分隔环，
      // 所以直接画成 PM.plasma；特效侧仍然只由 emit.flash 负责，两者不重复。
      layout: {
        len: 34.3, muzzle: [34.3, -0.3], grip: [10.5, 3.4], fore: [17.5, 1.6],
        eject: null, mag: [17.5, 0.6], magBase: [17.5, 2.6],
        stock: [0.5, -1.4], sight: [13.5, -3.0],
      },
      mats: { body: M.alu, furniture: M.polyDark, barrel: PM.plasma },
      silhouette: laserSilhouette,
      shell: 'none',                     // 能量武器无弹壳（与 MECH energy 一致，这里显式写住）
      features: ['前段两根等离子管束（行 -1/0 的 cols 24-34）与后段机匣明显分色分宽', '机匣顶一条 cols 8-22 的导轨，上面一块红点瞄具凸到行 -3', '骨架托：行 1 通到 col 7、行 2 只 cols 0-3、行 3 只 cols 1-2，中间全是真空', '能量匣插在扳机之前（cols 17-18 行 2），不挂在握把前方'],
      emit: {
        flash: { petals: 2, fwd: 1.2, side: 0.6, ball: 0.9, tail: 0, jitter: 0.12, win: [0.0, 0.2],
          col: '#9fdcff', edgeCol: '#2f7fd8' },
        smoke: { puff: 0.8, rise: -3, drift: 6, life: 0.2, at: 0.2, alpha: 0.16, col: '#8fb6cc', col2: '#5d7d92' },
        bolt: { x: 26.4, y: -1.4, w: 2.0, h: 1.0, stroke: 0, mount: 'side' },
        reload: { magRake: 0, magLen: 2.4, magW: 1.8, dropSpin: 2, holdOpen: false },
      },
    });

    // ---------- 火焰喷射器（第 16 批） ----------
    WeaponArt.define('flamer', {
      ver: 'batch16-gridfit', mech: 'flame',
      // len 33.3 = 979mm：**照片内反解**（同上）。虚构件，中置信。
      // **照片左端那截火舌不是本体**：量具按 GUN_INK=34.8 定标尺，火舌落在 col 33.3 之外。
      // 真实火焰由玩法侧的粒子负责（bspeed=0 的静止火点 + 导燃管），轮廓里不画火。
      // 本件有 13 个洞（桁架与管路围出来的真空），是全轨洞最多的一件 —— 涂实任何一个是硬伤。
      layout: {
        len: 33.3, muzzle: [33.3, -0.3], grip: [23.5, 1.0], fore: [28.0, -0.5],
        eject: null, mag: [8.0, 0.4], magBase: [8.0, 4.4],
        stock: [0.5, 1.4], sight: [10.0, -3.4],
      },
      mats: { body: PM.burnt, furniture: PM.tank, barrel: PM.iron },
      silhouette: flamerSilhouette,
      shell: 'none',                     // 喷火器无弹壳（与 MECH flame 一致）
      features: ['两只串联燃料罐挂在身后（上罐行 -1..2、下罐行 3..5），中间一条箍带 col 0 通到行 0', '喷管是一条 cols 3-33 的细管，末端两格张成法兰（行 1 的 cols 31-32）', '阀体与提把架在管子上方：行 -2 cols 20-21、行 -3 cols 8-12、行 -4 col 10', '握把与罐体之间全是桁架真空 —— 13 个洞，一个都不能填'],
      emit: {
        // 喷口不产生"星形枪口焰"：它产生的是**持续火舌**，交给玩法侧的粒子链。
        // 这里只留一个极小的点火闪光，ball 压到 0.35 免得在喷口糊出一团圆饼。
        flash: { petals: 2, fwd: 0.8, side: 0.5, ball: 0.35, tail: 0, jitter: 0.4, win: [0.0, 0.14],
          col: '#ffd54f', edgeCol: '#ff7043' },
        smoke: { puff: 1.6, rise: -4, drift: 10, life: 0.3, at: 0.1, alpha: 0.24, col: '#6d6f72', col2: '#3a3a38' },
        bolt: { x: 20.4, y: -1.4, w: 2.0, h: 1.0, stroke: 0, mount: 'side' },
        reload: { magRake: 0, magLen: 4.0, magW: 3.0, dropSpin: 0, holdOpen: false },
      },
    });
  }

  if (typeof window !== 'undefined') {
    if (typeof WeaponArt !== 'undefined' && G) register();
    window.ArtPickup = { register, PM, silhouettes: { rpg7: rpgSilhouette, gl: glSilhouette, laser: laserSilhouette, flamer: flamerSilhouette } };
  }
  return { register, PM, silhouettes: { rpg7: rpgSilhouette, gl: glSilhouette, laser: laserSilhouette, flamer: flamerSilhouette } };
})();
