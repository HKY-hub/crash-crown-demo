// ============ 阴森吸血鬼古堡 · 生化模式固定竞技地图（阶段 1：一级轮廓与建筑群体量重构） ============
// 单张大型**固定**地图：山崖台地、楼层、区域、楼板、楼梯、门洞、出生点、补给点全部来自下方手工常量表，
// 每局完全一致。seed 只驱动装饰性细节（裂缝/磨损/灯焰扰动），永不影响可行走结构 ——
// 该不变式由 tools/_check_castle.js 的「跨 seed 几何逐字节一致」闸门守护。
//
// ---------- 为什么重排（阶段 0 实测，别退回旧写法） ----------
// 旧图：世界 5600×800（7:1），只有 B1/F1/RF 三条楼板，覆盖 99% / 100% / 90%，屋脊只有 4 种高度、
// 众数占 74%，280 列只换 5 次 → 远看就是「一条超长三层建筑剖面」。
// 而且旧图的 202 块碰撞实体里**没有一块是整高墙**（全是楼板/踏面/门楣/跳台），
// 所以「像三层平房」是结构问题，画背墙、加山花、补石纹都改不了读感。
//
// ---------- 新骨架：8 条标高带 + 每个块体取不同带子集 + 真正透天的空隙 ----------
//   SP  860  塔顶（中央塔楼 crown，全图唯一最高点）
//   RW 1030  屋脊步道 / 钟室 / 角塔平台
//   U2 1180  高廊：门楼步道、主堡高阁、塔楼三层、中殿天幕步道
//   U1 1330  二层：守卫厅、主堡两端廊、宴会厅楼座、塔楼大殿、书房、钟楼、东翼上层、高桥
//   G2 1470  **高台地坪**：内庭上台阶地、主堡大厅、塔楼岩台、跨壑桥、图书馆台地、东城墙步道
//   G1 1620  **主地坪**：吊桥、门楼通道、下沉内庭、台地下底层通道、透天缝底、宴会厅、切堑、中殿、旧翼
//   C1 1780  墓穴/地牢层（横贯全图的贯通路径③，也是两条跨壑的底）
//   C0 1950  岩层内的第二层地下：内庭深潭底、东水关暗渠底
// ⇒ 地面基准本身在 x 方向分三级台阶（G1 1620 / G2 1470 / 以及地下两级），
//   同一条标高带被空隙切成 3~8 段，不再出现横贯全图的等高楼板。
//
// ---------- 排布的三条硬约束（tools/_castle_protect.js + _castle_schemes.js 实测） ----------
// 1) **台地台阶必须在 x 向上真实重叠才放得下梯**：packStairs 要求出发层覆盖 [x-58, x+w+12]、
//    到达层覆盖 [x, x+w]。两个相邻地坪标高若只是首尾相接，那 150 高差就是一面上不去的实心崖。
//    ⇒ 低处地坪要往高处台地底下再延伸：拱梯 ≥220，实体坡道 ≥326。
//    建筑学上这正好是「岩台悬挑岩棚 + 崖脚切堑 + 台地下的底层通道」。
// 2) **62×86 大母体用不了拱式薄踏板梯**（踏面间距远小于她身高，站上一级必然与上一级相交；
//    全阵营 JUMP_V 都是 -745，没有谁跳得更高）。⇒ 主干线的高台台阶另给**实体坡道**：
//    级高 ≤40、run ≥64、梯下不留净空。旧图所有换层都是拱式梯，所以她在旧图根本换不了层。
// 3) 运动学：G=2100、JUMP_V=745 → 单跳顶点 132、滞空 0.71s、满速水平射程 195；人类 22×36、母体 62×86。
//    ⇒ 高差 >132 必须有台阶；台阶 rise ≤45、run ≥28；主通道门洞 ≥88（母体可过），
//      暗道门洞 58~70（母体过不了，但两端各另有楼梯，绝不形成陷阱或死路）。
//
// ---------- 横向骨架 ----------
//   贯通路径①（地面，随台地起伏）：吊桥→门楼通道→下沉内庭→[大石阶]→岩棚台阶地→主堡大厅→
//     [底层通道]→透天缝→宴会厅→切堑→[崖脚坡道]→塔楼岩台→跨壑窄桥→图书馆台地→[梯]→中殿→钟楼
//   贯通路径②（上层）：门楼步道→主堡高阁/屋脊步道→塔楼环廊→塔顶；图书馆上层→中殿天幕步道→
//     钟楼→**高桥**跨东裂口→东翼上层→加固瞭望层
//   贯通路径③（地下）：河床→地牢→内庭地窖（上有深井）→主堡墓室→厨房地窖→塔基牢房→
//     **跨壑底**→藏骨室→地下墓→**东裂口底**→旧翼地窖→东水关（→暗渠）
//   空隙 4 处真正切进体量：下沉内庭、主堡与宴会厅之间的透天缝、西跨壑（上有窄桥）、东裂口（上有高桥）
const CastleGen = (() => {
  // ---------- 标高带（阶段 1 的核心改动：5 带 → 8 带，且每带都不连续贯通） ----------
  const Y = { SP: 860, RW: 1030, U2: 1180, U1: 1330, G2: 1470, G1: 1620, C1: 1780, C0: 1950 };
  const LVS = ['SP', 'RW', 'U2', 'U1', 'G2', 'G1', 'C1', 'C0'];   // 由高到低
  const SLB = 18, WALL = 20;
  const STOREY = 150;             // 岩台/台地填实的厚度（一个层高），不是填到世界底
  const W = 5600, H = 2240, KILL = 2200;
  // 运动参数（与 config 一致，写死以便检查脚本独立复算）
  const PHY = { G: 2100, JUMP_V: 745, SPEED: 275, BODY_W: 22, BODY_H: 36,
    JUMP_H: Math.round(745 * 745 / (2 * 2100)),      // 132
    JUMP_RUN: Math.round(275 * (2 * 745 / 2100)),    // 195
    STEP_OK: 44, MOTHER_W: 62, MOTHER_H: 86 };
  // 台阶展开参数：放在 HUBS 之前，因为 packStairs 要按高差反算梯带宽度
  const TREAD = 24, UNDER_CLEAR = 46, FIRST_RISER = TREAD + UNDER_CLEAR;   // 首级 70：梯下净空 46 > 身体 36
  const RAMP_RUN = 64, RAMP_RISE = 40;      // 实体坡道：母体体宽 62 + 余量；级高 ≤40
  const LAND = 42;      // 楼梯井低侧的同层单向盖板宽度（当前全部关闭，见 stairSteps 注释）
  // 门洞＝侧视图墙体切片上的垂直缺口，只有「净高」有意义（净宽恒等于墙厚）。
  // 母体高 72~86，普通/疾行/自爆高 36~40，小母体 48，人类 36。
  const OPEN = {
    gate: { h: 118 },   // 外城门洞：全部单位可过
    main: { h: 96 },    // 主通道：含大母体在内全部可过（感染者集群的主干道）
    side: { h: 62 },    // 暗道：大母体被挡，人类与轻型感染者可过 —— 有代价的近路
    crawl: { h: 70 },   // 水门：同上
  };

  const REGIONS = [
    { id: 'moat', name: '吊桥与河滩', x0: 0, x1: 360 },
    { id: 'gate', name: '外城门楼', x0: 360, x1: 900 },
    { id: 'court', name: '下沉内庭', x0: 900, x1: 1420 },
    { id: 'keep', name: '主堡大厅', x0: 1420, x1: 2260 },
    { id: 'banq', name: '宴会厅与透天缝', x0: 2260, x1: 2760 },
    { id: 'tower', name: '中央塔楼岩台', x0: 2760, x1: 3700 },
    { id: 'gorge', name: '西跨壑与窄桥', x0: 3700, x1: 3900 },
    { id: 'lib', name: '图书馆高台', x0: 3900, x1: 4300 },
    { id: 'chapel', name: '礼拜堂与钟楼', x0: 4300, x1: 4820 },
    { id: 'cast', name: '东裂口与高桥', x0: 4820, x1: 5000 },
    { id: 'wing', name: '东旧翼', x0: 5000, x1: 5300 },
    { id: 'east', name: '东城墙与台地', x0: 5300, x1: 5600 },
  ];

  // ---------- 楼板 / 地坪 ----------
  // 三种「板下面是什么」：
  //   默认（薄板 SLB）  = 板下是本块体的房间（剖面里看得见下一层净空）
  //   rock:true         = 岩台/台地，板下填一个层高（STOREY），读成「建筑立在活的岩体上」
  //   fill:true         = 世界最底的结构，填到世界底；carve:[[x0,x1]] 在其中挖出可行走的岩腔
  //   bridge:{piers,over} = 架在空隙上的真实地坪，over 指向它跨的那处空隙（绘制层据此画桥墩）
  // 排布规则（阶段 1 实测，改坐标前先看）：
  //   · 台地台阶处，低处地坪必须往高处台地底下再延伸：拱梯 ≥220、实体坡道 ≥326；
  //   · 同一层带被空隙切成 3~8 段，任何一条标高的最长连续跨度都不得超过世界宽的 30%。
  const DECKS = [
    // ===== C0 岩层内的第二层地下（深潭 / 暗渠） =====
    { id: 'd_pool', lv: 'C0', x0: 1000, x1: 1300, fill: true, mat: 'stone', cave: true },
    { id: 'd_east', lv: 'C0', x0: 5340, x1: 5560, fill: true, mat: 'stone', cave: true },

    // ===== C1 墓穴层（贯通路径③：横贯全图，且是两条跨壑的底） =====
    { id: 'b_moat', lv: 'C1', x0: 0, x1: 360, fill: true, mat: 'stone' },
    { id: 'b_gate', lv: 'C1', x0: 360, x1: 900, fill: true, mat: 'stone' },
    { id: 'b_court', lv: 'C1', x0: 900, x1: 1420, fill: true, mat: 'stone', carve: [[1000, 1300]] },
    { id: 'b_keep', lv: 'C1', x0: 1420, x1: 2260, fill: true, mat: 'stone' },
    { id: 'b_banq', lv: 'C1', x0: 2260, x1: 2760, fill: true, mat: 'stone' },
    { id: 'b_tower', lv: 'C1', x0: 2760, x1: 3700, fill: true, mat: 'stone' },
    { id: 'b_gorge', lv: 'C1', x0: 3700, x1: 3900, fill: true, mat: 'stone', cave: true },
    { id: 'b_lib', lv: 'C1', x0: 3900, x1: 4300, fill: true, mat: 'stone' },
    { id: 'b_chap', lv: 'C1', x0: 4300, x1: 4820, fill: true, mat: 'stone' },
    { id: 'b_cast', lv: 'C1', x0: 4820, x1: 5000, fill: true, mat: 'stone', cave: true },
    { id: 'b_wing', lv: 'C1', x0: 5000, x1: 5300, fill: true, mat: 'stone' },
    { id: 'b_east', lv: 'C1', x0: 5300, x1: 5600, fill: true, mat: 'stone', carve: [[5340, 5560]] },

    // ===== G1 主地坪 1620 =====
    // abutment：西端顶在世界边界，靠绘制的桥墩 + 桥亭表达桥头支撑。不进碰撞，
    // 所以结构检查不能把它记成「断头」，也不能拿它当能挡弹的东西。
    { id: 'f_bridge', lv: 'G1', x0: 0, x1: 360, mat: 'wood', abutment: 'pier' },
    { id: 'f_gate', lv: 'G1', x0: 360, x1: 900, mat: 'stone' },
    { id: 'f_court', lv: 'G1', x0: 900, x1: 1420, mat: 'stone', openAir: 'court' },
    // 台地下的底层通道：让 G1 往岩台底下再伸一段，台地台阶才放得下梯（排布规则第一条）
    { id: 'f_under', lv: 'G1', x0: 1420, x1: 1620, mat: 'stone' },
    { id: 'f_base', lv: 'G1', x0: 2000, x1: 2260, mat: 'stone' },
    { id: 'f_slot', lv: 'G1', x0: 2260, x1: 2350, mat: 'stone', openAir: 'slot' },
    { id: 'f_banq', lv: 'G1', x0: 2350, x1: 2760, mat: 'stone' },
    { id: 'f_ditch', lv: 'G1', x0: 2760, x1: 3260, mat: 'stone', openAir: 'ditch' },
    { id: 'f_chap', lv: 'G1', x0: 4040, x1: 4620, mat: 'stone' },
    { id: 'f_bell', lv: 'G1', x0: 4620, x1: 4820, mat: 'stone' },
    { id: 'f_wing', lv: 'G1', x0: 5000, x1: 5300, mat: 'stone' },
    { id: 'f_east', lv: 'G1', x0: 5300, x1: 5600, mat: 'stone' },

    // ===== G2 高台地坪 1470（与 G1 差 150：台地台阶） =====
    { id: 'g_tier', lv: 'G2', x0: 1180, x1: 1420, rock: true, mat: 'stone' },
    { id: 'g_keep', lv: 'G2', x0: 1420, x1: 2260, mat: 'stone' },        // 主堡大厅地坪
    { id: 'g_crag', lv: 'G2', x0: 2900, x1: 3700, rock: true, mat: 'stone' },   // 塔楼岩台
    { id: 'g_bridge', lv: 'G2', x0: 3700, x1: 3900, mat: 'stone', bridge: { piers: 3, over: 'gorge' } },
    { id: 'g_lib', lv: 'G2', x0: 3900, x1: 4300, rock: true, mat: 'stone' },
    { id: 'g_wall', lv: 'G2', x0: 5300, x1: 5560, rock: true, mat: 'stone' },   // 东城墙顶步道

    // ===== U1 二层 1330 =====
    { id: 'u_gate', lv: 'U1', x0: 360, x1: 900, mat: 'stone' },
    { id: 'u_keep', lv: 'U1', x0: 1420, x1: 2260, mat: 'stone' },        // 两端的廊，中间由 brk_hall 打开成双层高
    { id: 'u_corr', lv: 'U1', x0: 2260, x1: 2350, mat: 'wood', bridge: { piers: 2, over: 'slot' } },
    { id: 'u_banq', lv: 'U1', x0: 2350, x1: 2760, mat: 'wood' },
    { id: 'u_tower', lv: 'U1', x0: 2960, x1: 3640, mat: 'stone' },
    { id: 'u_lib', lv: 'U1', x0: 3900, x1: 4300, mat: 'wood' },
    { id: 'u_bell', lv: 'U1', x0: 4620, x1: 4820, mat: 'stone' },
    { id: 'u_br2', lv: 'U1', x0: 4820, x1: 5060, mat: 'wood', bridge: { piers: 4, over: 'cast' } },
    { id: 'u_wing', lv: 'U1', x0: 5000, x1: 5240, mat: 'wood' },

    // ===== U2 高廊 1180 =====
    { id: 'q_gate', lv: 'U2', x0: 360, x1: 900, mat: 'stone', rail: 'bg' },
    { id: 'q_keep', lv: 'U2', x0: 1420, x1: 2260, mat: 'wood' },
    { id: 'q_banq', lv: 'U2', x0: 2350, x1: 2600, mat: 'stone', rail: 'bg' },   // 东半塌顶：无板
    { id: 'q_tower', lv: 'U2', x0: 3020, x1: 3560, mat: 'stone' },
    { id: 'q_lib', lv: 'U2', x0: 3900, x1: 4200, mat: 'stone', rail: 'bg' },
    { id: 'q_chap', lv: 'U2', x0: 4300, x1: 4620, mat: 'wood' },                // 中殿天幕步道
    { id: 'q_bell', lv: 'U2', x0: 4620, x1: 4820, mat: 'stone' },
    { id: 'q_wing', lv: 'U2', x0: 5000, x1: 5160, mat: 'brick' },               // 加固瞭望层（年代不同）

    // ===== RW 屋脊步道 1030 =====
    { id: 'r_turret', lv: 'RW', x0: 420, x1: 640, mat: 'stone' },
    { id: 'r_keep', lv: 'RW', x0: 1420, x1: 2260, mat: 'brick' },
    { id: 'r_tower', lv: 'RW', x0: 3180, x1: 3480, mat: 'stone' },
    { id: 'r_bell', lv: 'RW', x0: 4650, x1: 4790, mat: 'stone' },

    // ===== SP 塔顶 860 =====
    { id: 's_top', lv: 'SP', x0: 3240, x1: 3420, mat: 'stone' },
  ];

  // ---------- 建筑体量（屋顶轮廓的唯一真源；绘制层与一致性校验都读这张表） ----------
  // 约定：eave = 檐口 y，必须**高于本块体最高可行走楼板**（由 tools/_check_castle_massing.js 断言），
  //       ridge/top = 脊或尖顶，setback = 退台（读成年代或功能差异），broken = 塌顶段（天空落到下面的楼板）。
  const MASSING = [
    { id: 'moat', x0: 0, x1: 360, kind: 'flat', g: 1620, eave: 1560, note: '桥头低台与吊桥墩' },
    { id: 'gate', x0: 360, x1: 900, kind: 'crenel', g: 1620, eave: 1140, turrets: [470], note: '双塔门楼：西塔有角塔平台，东塔残' },
    { id: 'court', x0: 900, x1: 1180, kind: 'open', g: 1620, eave: 1620, note: '下沉内庭：天空直落地坪' },
    { id: 'tier', x0: 1180, x1: 1420, kind: 'flat', g: 1470, eave: 1430, note: '岩棚上的阶梯庭院' },
    { id: 'keep', x0: 1420, x1: 2260, kind: 'gable', g: 1470, eave: 990, ridge: 210, clerestory: true,
      setback: { x0: 1420, x1: 1660, eave: 1290 }, note: '主堡：高山墙 + 天窗，明显高于两侧' },
    { id: 'banq', x0: 2350, x1: 2760, kind: 'broken', g: 1620, eave: 1140, broken: [[2600, 2760]], note: '宴会厅：东半塌顶' },
    { id: 'tower', x0: 2900, x1: 3700, kind: 'spire', g: 1470, eave: 800, top: 560, note: '中央塔楼：全图主峰' },
    { id: 'lib', x0: 3900, x1: 4300, kind: 'crenel', g: 1470, eave: 1140, buttress: true,
      setback: { x0: 4150, x1: 4300, eave: 1300 }, note: '图书馆：残城垛 + 扶壁 + 东半退台' },
    { id: 'chapel', x0: 4300, x1: 4620, kind: 'gable', g: 1620, eave: 1140, ridge: 200, note: '礼拜堂中殿：双层高' },
    { id: 'bell', x0: 4620, x1: 4820, kind: 'bell', g: 1620, eave: 1140, note: '钟楼：基座/塔身/钟室/尖顶四段' },
    { id: 'wing', x0: 5000, x1: 5300, kind: 'broken', g: 1620, eave: 1150, broken: [[5160, 5300]], note: '东旧翼：半塌，西端另加加固瞭望层' },
    { id: 'east', x0: 5300, x1: 5600, kind: 'crenel', g: 1620, eave: 1430, note: '东城墙台地与女墙' },
  ];
  // 真正切进建筑体量的露天/跨谷空隙（天空能落到地坪或岩面；bridge = 架在上面的真实地坪）
  const VOIDS = [
    { id: 'court', x0: 900, x1: 1180, floor: 1620, kind: 'court', note: '下沉内庭' },
    { id: 'slot', x0: 2260, x1: 2350, floor: 1620, kind: 'slot', bridge: 1330, note: '主堡与宴会厅之间的透天缝，上有跨缝连廊' },
    { id: 'gorge', x0: 3700, x1: 3900, floor: 1780, kind: 'chasm', bridge: 1470, note: '西跨壑：底在墓穴层，上有窄桥' },
    { id: 'cast', x0: 4820, x1: 5000, floor: 1780, kind: 'chasm', bridge: 1330, note: '东裂口：底在墓穴层，上有高桥' },
  ];

  // ---------- 破损断口（楼板上的 authored 洞：向下的捷径；每一处两侧都另有楼梯） ----------
  // 断口的落点层必须是真的实心地面：若断口正压在下一层的楼梯井上，掉下去会连着穿两层，
  // 三层漏斗会让捷径变成陷阱。位置按当前井位避开摆放。
  // 声明在 packStairs 之前：排梯要把断口当「本层不能踩的洞」一起占用（见 packStairs 注释）。
  const BREAKS = [
    { lv: 'G1', x0: 1160, x1: 1240, id: 'brk_well' },    // 内庭深井口 → 掉进地窖（160）
    { lv: 'U1', x0: 1900, x1: 2000, id: 'brk_hall' },    // 主堡二层廊断开 → 大厅成为双层高空间
    { lv: 'G2', x0: 3520, x1: 3600, id: 'brk_crag' },    // 塔楼岩台断口 → 落到塔基牢房（310）
    { lv: 'U1', x0: 2500, x1: 2580, id: 'brk_banq' },    // 宴会厅楼座断口 → 落到地坪（290）
  ];
  const HUBW = 150, GAP = 46;
  // 梯脚落脚平台宽度：身体 22 + 余量。第一级踏板顶比出发层地面高 70，若出发层的墙恰好
  // 贴在梯带西端，站在第一级上的角色身体上沿会撞进墙（过梁）里 —— 上得去、下不来。
  const FOOT = 64;
  function stairWidth(from, to, ramp) {
    const rise = Y[from] - Y[to];
    if (ramp) return RAMP_RUN * Math.max(2, Math.ceil(rise / RAMP_RISE));
    const n = Math.max(2, 1 + Math.ceil((rise - FIRST_RISER) / 45));
    return Math.max(HUBW, n * 30);
  }
  const HUBS = [
    // 河床 → 吊桥层：水门石阶。没有它，C1 西段对 86 高的大母体就是死区。
    { x0: 60, x1: 340, tag: 'moat', fl: [['C1', 'G1']] },
    // 门楼：通道→守卫厅→步道→角塔平台（西端次峰要能走上去；地牢由 moat 那道梯进，
    // 因为 540px 的门楼里排不下「地下+三层」四道互不冲突的井）
    { x0: 450, x1: 900, tag: 'gate', fl: [['G1', 'U1'], ['U1', 'U2'], ['U2', 'RW']] },
    // 内庭：地窖→地坪
    { x0: 940, x1: 1150, tag: 'court', fl: [['C1', 'G1']] },
    // 大石阶（实体坡道）：主地坪→高台地坪，是 62×86 大母体唯一能用的地面换层路
    { x0: 1300, x1: 1470, tag: 'great', fl: [['G1', 'G2', 'ramp']] },
    // 深井：地窖 → 深潭底（下去有路，靠同一口井回来）
    { x0: 1058, x1: 1180, tag: 'pool', fl: [['C0', 'C1']] },
    // 主堡西组：墓室→大厅→二层廊→高阁
    { x0: 1560, x1: 1900, tag: 'keepW', fl: [['C1', 'G2'], ['G2', 'U1'], ['U1', 'U2']] },
    // 主堡东组：底层通道→大厅；屋脊步道从东廊上
    { x0: 2010, x1: 2260, tag: 'keepE', fl: [['G1', 'G2'], ['U1', 'RW']] },
    // 宴会厅：地窖→地坪→楼座→残屋脊
    { x0: 2380, x1: 2750, tag: 'banq', fl: [['C1', 'G1'], ['G1', 'U1'], ['U1', 'U2']] },
    // 塔楼低组：切堑→岩台（崖脚坡道，母体上塔楼岩台的主路）、牢房→岩台、岩台→大殿
    { x0: 2900, x1: 3300, tag: 'towerLow', fl: [['G1', 'G2', 'ramp'], ['C1', 'G2'], ['G2', 'U1']] },
    // 塔楼高组：大殿→三层→环廊→塔顶（两条独立进入方向，不允许一个感染者封死）
    { x0: 3200, x1: 3640, tag: 'towerHigh', fl: [['U1', 'U2'], ['U2', 'RW'], ['RW', 'SP']] },
    // 图书馆：藏骨室→台地→书房→上层
    { x0: 3910, x1: 4290, tag: 'lib', fl: [['C1', 'G2'], ['G2', 'U1'], ['U1', 'U2']] },
    // 礼拜堂：地下墓→中殿地坪→天幕步道（中殿双层高，440 高差要 300 宽的梯）
    { x0: 4060, x1: 4600, tag: 'chap', fl: [['C1', 'G1'], ['G1', 'U2']] },
    // 钟楼：地坪→钟室层→高廊→顶
    { x0: 4630, x1: 4820, tag: 'bell', fl: [['G1', 'U1'], ['U1', 'U2'], ['U2', 'RW']] },
    // 东翼：地窖→地坪→上层→加固瞭望层
    { x0: 5010, x1: 5290, tag: 'wing', fl: [['C1', 'G1'], ['G1', 'U1'], ['U1', 'U2']] },
    // 东段：暗渠→水关→台地→城墙步道
    { x0: 5310, x1: 5590, tag: 'east', fl: [['C0', 'C1'], ['C1', 'G1'], ['G1', 'G2']] },
  ];
  function packStairs() {
    const holes = {}, busy = {};
    for (const l of LVS) { holes[l] = []; busy[l] = []; }
    // 断口也算「本层不能踩的洞」：不立这条，上一道梯的助跑会架在断口上（阶段 0 的坑，
    // 当时靠人眼挪位置挪了三轮；现在排梯一开始就把断口算进占用）。
    for (const b of BREAKS) holes[b.lv].push([b.x0, b.x1]);
    const deckOk = (lv, a, b2) => {
      for (let x = a; x <= b2; x += 8) if (!DECKS.some(d => d.lv === lv && x >= d.x0 && x <= d.x1)) return false;
      return true;
    };
    // 排不下时不能只记一句「dropped」—— 必须留下**卡在哪条规则**的直方图，
    // 否则调 hub 范围只能靠猜（tools/_castle_plan.js 直接读这份记录）。
    //
    // dir 两个方向都试：向上爬的梯，助跑可以在井的西头（dir=+1）也可以在东头（dir=-1）。
    // 只允许 dir=+1 时，一条 5 层链每上一级就要往东让 ~270px，一座塔得占 1100px 才排得下；
    // 允许折返（真实塔梯就是楼梯间里来回转的）之后，同一组井可以互相咬合，5 层链压进 ~500px。
    const out = [], dropped = [];
    for (const h of HUBS) {
      const used = {};
      for (const fl of h.fl) {
        const arr = fl[0], up = fl[1], ramp = fl[2] === 'ramp';
        const w = stairWidth(arr, up, ramp);
        const lo = (x, dir) => dir > 0 ? x - GAP - 12 : x - 12;
        const hi = (x, dir) => dir > 0 ? x + w + 12 : x + w + GAP + 12;
        let placed = null, pdir = 1;
        const why = {}; const blocks = [];
        const bump = (k, x, iv) => { why[k] = (why[k] || 0) + 1; if (iv) blocks.push(k + ' [' + iv[0] + '~' + iv[1] + '] @x' + x); };
        const hitIn = (list, a2, b2, k, x) => {
          for (const iv of list) if (Math.min(iv[1], b2) - Math.max(iv[0], a2) > 2) { bump(k, x, iv); return true; }
          return false;
        };
        for (let x = h.x0; x + w + GAP <= h.x1 + 1; x += 10) {
          let done = false;
          for (const dir of [1, -1]) {
            const a2 = lo(x, dir), b2 = hi(x, dir);
            if (hitIn(holes[arr], a2, b2, '出发层已有井/断口', x) ||
                hitIn(busy[arr], a2, b2, '出发层助跑被占', x)) continue;
            let bad = false;
            for (let li = LVS.indexOf(up); li < LVS.indexOf(arr) && !bad; li++)
              if (hitIn(holes[LVS[li]], a2, b2, '中间层 ' + LVS[li] + ' 有井', x) ||
                  hitIn(busy[LVS[li]], a2, b2, '中间层 ' + LVS[li] + ' 被占', x)) bad = true;
            if (bad) continue;
            if (!deckOk(arr, a2, b2)) { bump('出发层楼板不够长', x); continue; }
            if (!deckOk(up, x, x + w)) { bump('到达层楼板不够长', x); continue; }
            // 梯脚不贴墙：见 FOOT 的说明。往东挪一个候选位即可，不需要动任何门的净高。
            const near = WALLS.find(q => q.lv === arr && q.x + WALL > x - FOOT && q.x + WALL <= x + 6);
            if (near) { bump('梯脚贴墙 ' + arr + '@' + near.x, x); continue; }
            placed = x; pdir = dir; done = true; break;
          }
          if (done) break;
        }
        // 放不下不等于「不需要」：规划表里写了却没落成的梯，会让通行图上出现一条谁都不知道的
        // 空白带。必须记下来交给结构检查，绝不允许静默消失。
        if (placed == null) {
          dropped.push({ hub: h.tag, from: arr, to: up, w, ramp, x0: h.x0, x1: h.x1,
            rise: Y[arr] - Y[up], tries: Math.max(0, Math.floor((h.x1 + 1 - h.x0 - w - GAP) / 10) + 1),
            why, blocks: blocks.slice(0, 4) });
          continue;
        }
        for (let li = LVS.indexOf(up); li < LVS.indexOf(arr); li++) holes[LVS[li]].push([placed, placed + w]);
        busy[arr].push(pdir > 0 ? [placed - GAP, placed + w] : [placed, placed + w + GAP]);
        const pre = { SP: 'p', RW: 'r', U2: 'q', U1: 'u', G2: 'g', G1: 'f', C1: 'b', C0: 'd' }[arr];
        used[pre] = (used[pre] || 0) + 1;
        out.push({ id: 's' + pre + '_' + h.tag + (used[pre] > 1 ? used[pre] : ''),
          from: arr, to: up, x0: placed, x1: placed + w, dir: pdir, ramp: !!ramp });
      }
    }
    return { stairs: out, dropped };
  }
  // 注意：排梯要读 WALLS 判断「梯脚贴不贴着墙」，所以 packStairs() 必须在 WALLS 之后调用。

  // ---------- 5.2 视线切分墩（石砌矮墙/柱础）----------
  // 位置由 tools/_castle_sightcut.js 从「同一站立点用步枪同时压制 >N 个入口」的活射线里贪心选出，
  // 且只能从 M.pierSpots（生成器导出的合法位点）里挑。阶段 1 重排后旧坐标全部作废，
  // 先清空、等地形冻结后重新选点 —— 保留旧坐标会让墩子埋进新墙或堵住新逃跑车道。
  // 尺寸是这条走廊能不能同时保住「观察」和「通行」的关键，实测过两档：
  //   h=44：能挡眼(30)也能挡弹(21)，但墩顶成了落脚点 —— 环路实测从 1 个 FAIL 变 4 个 FAIL。
  //   h=26：低于眼高 30、高于枪口线 21 → 「看得见但打不到」，正是 5.2 要的档位。
  const PIERS = [];

  // ---------- 环路规划 ----------
  // 一条环 = 两个锚点 + 两条彼此不共用边的真实路线（不是「一条走廊来回走」，那不算环）。
  // 覆盖要求：西部 / 中部 / 东部各一条大环，不让所有环都绕着中央塔楼转。
  const LOOPS = [
    { id: 'W1', name: '西大环 门楼↔内庭（地面 / 地牢）', macro: true, a: [1620, 620], b: [1620, 1050] },
    { id: 'W2', name: '西大环 内庭↔台阶地（大石阶 / 墓室）', macro: true, a: [1620, 1050], b: [1470, 1500] },
    { id: 'C1', name: '中大环 主堡大厅↔底层通道', macro: true, a: [1470, 1900], b: [1620, 2150] },
    { id: 'C2', name: '中大环 宴会厅↔主堡（上层连廊 / 地坪）', macro: true, a: [1330, 2200], b: [1330, 2600] },
    { id: 'T1', name: '大环 塔楼岩台↔塔顶（东西两组梯）', macro: true, a: [1470, 3100], b: [1180, 3300] },
    { id: 'E1', name: '东大环 图书馆↔中殿（台地 / 藏骨室）', macro: true, a: [1470, 4050], b: [1620, 4400] },
    { id: 'E2', name: '东大环 钟楼↔东翼（高桥 / 地下）', macro: true, a: [1330, 4700], b: [1330, 5100] },
    { id: 'L1', name: '小环 宴会厅 G1↔U1 双梯', macro: false, a: [1620, 2450], b: [1330, 2650] },
    { id: 'L2', name: '小环 跨壑：窄桥↔壑底', macro: false, a: [1470, 3800], b: [1780, 3800] },
    { id: 'L3', name: '小环 内庭深井：地坪↔深潭', macro: false, a: [1620, 1100], b: [1950, 1150] },
    { id: 'L4', name: '小环 东城墙：台地↔步道', macro: false, a: [1620, 5380], b: [1470, 5480] },
  ];

  // ---------- 墙体（属于某一层，从该层地面向上到其上方楼板底面；无上方楼板则做女儿墙） ----------
  // 同一 x 在不同层「有的有大门、有的只有暗道、有的整段敞开」—— 环路由此而来，而非传送门。
  // 只在**两侧同一层都有楼板**的地方设门，否则门会开在空口上（阶段 0 实测过的假门）。
  const WALLS = [
    // 吊桥 → 门楼通道：城门洞（118，全部单位可过）；同一界的地下是净高 70 的水门
    { lv: 'G1', x: 360, op: 'gate' }, { lv: 'C1', x: 360, op: 'crawl' },
    // 门楼 → 下沉内庭：两道门之间 540px 通道 = 「有厚度的门楼」
    { lv: 'G1', x: 900, op: 'main' }, { lv: 'C1', x: 900, op: 'side' },
    // 台阶地 → 主堡大厅
    { lv: 'G2', x: 1420, op: 'main' }, { lv: 'C1', x: 1420, op: 'side' },
    // 主堡 → 跨缝连廊 → 宴会厅（连廊两端都有墙体入口）
    { lv: 'U1', x: 2260, op: 'main' }, { lv: 'C1', x: 2260, op: 'main' },
    { lv: 'G1', x: 2350, op: 'main' }, { lv: 'U1', x: 2350, op: 'main' },
    // 宴会厅 → 崖脚切堑：小门（有代价的近路）
    { lv: 'G1', x: 2760, op: 'side' },
    // 跨壑窄桥东头的桥头闸门
    { lv: 'G2', x: 3840, op: 'main' },
    { lv: 'C1', x: 4300, op: 'side' },
    // 中殿 → 钟楼：地坪门 + 天幕步道门（钟楼是东段上下的枢纽）
    { lv: 'G1', x: 4620, op: 'main' }, { lv: 'U2', x: 4620, op: 'main' },
    // 钟楼 → 高桥 → 东翼二层（高桥两端的墙体入口）
    { lv: 'U1', x: 4820, op: 'main' }, { lv: 'U1', x: 5040, op: 'main' },
    // 东翼 → 东城墙台地
    { lv: 'G1', x: 5300, op: 'main' }, { lv: 'C1', x: 5300, op: 'side' },
  ];
  const PACKED = packStairs();
  const STAIRS = PACKED.stairs;
  const STAIRS_DROPPED = PACKED.dropped;

  // ---------- 单向薄跳台（小环路 / 有收益的高位；四面都能跳下去，不构成陷阱） ----------
  // y 一律按「所属楼板的 dy 偏移」写，不写绝对值：台地基准一改，家具跳台自动跟过去，
  // 不会出现碰撞改了、家具还留在旧标高（阶段 0 的 lg_loft 就是这么变成假跳台的）。
  const LEDGES = [
    { id: 'lg_stump', x0: 960, x1: 1040, on: 'f_court', dy: -78 },
    { id: 'lg_statue', x0: 1190, x1: 1290, on: 'g_tier', dy: -70 },
    { id: 'lg_crate', x0: 1440, x1: 1520, on: 'f_under', dy: -72 },
    { id: 'lg_dais', x0: 1700, x1: 1860, on: 'g_keep', dy: -64 },
    { id: 'lg_organ', x0: 1500, x1: 1620, on: 'q_keep', dy: -60 },
    { id: 'lg_table', x0: 2400, x1: 2560, on: 'f_banq', dy: -88 },
    { id: 'lg_ammo', x0: 2620, x1: 2720, on: 'f_banq', dy: -74 },
    { id: 'lg_read', x0: 3960, x1: 4080, on: 'u_lib', dy: -70 },
    { id: 'lg_shelf', x0: 4120, x1: 4250, on: 'u_lib', dy: -82 },
    { id: 'lg_altar', x0: 4360, x1: 4500, on: 'f_chap', dy: -90 },
    { id: 'lg_cot', x0: 5060, x1: 5190, on: 'f_wing', dy: -74 },
    { id: 'lg_beam', x0: 5380, x1: 5480, on: 'g_wall', dy: -66 },
    { id: 'lg_coffin', x0: 1600, x1: 1720, on: 'b_keep', dy: -78 },
    { id: 'lg_cage', x0: 500, x1: 620, on: 'b_gate', dy: -84 },
    { id: 'lg_pipe', x0: 3740, x1: 3860, on: 'b_gorge', dy: -70 },
    { id: 'lg_keg', x0: 4400, x1: 4520, on: 'b_chap', dy: -76 },
    // 草料阁：顶面头顶只剩几像素，实测站人会被顶到上层楼板 —— 纯建筑构件（decor），
    // 不给碰撞、不进导航，只由绘制层画成结构（7.2 的结论，新图仍然成立）
    { id: 'lg_loft', x0: 2400, x1: 2480, on: 'q_banq', dy: -110, decor: true },
  ];

  // ---------- 出生与补给（固定候选点；占用/视线/拥堵检查在 bio-mode.js 实时做） ----------
  const HUMAN_SPAWNS = [
    { id: 'H1', deck: 'f_gate', x: 620, zone: 'gate' },
    { id: 'H2', deck: 'f_court', x: 980, zone: 'court' },
    { id: 'H3', deck: 'g_tier', x: 1250, zone: 'court' },
    { id: 'H4', deck: 'g_keep', x: 1700, zone: 'keep' },
    { id: 'H5', deck: 'g_keep', x: 2150, zone: 'keep' },
    { id: 'H6', deck: 'f_banq', x: 2550, zone: 'banq' },
    { id: 'H7', deck: 'g_crag', x: 3050, zone: 'tower' },
    { id: 'H8', deck: 'g_lib', x: 4000, zone: 'lib' },
    { id: 'H9', deck: 'f_chap', x: 4400, zone: 'chapel' },
    { id: 'H10', deck: 'f_wing', x: 5100, zone: 'wing' },
    { id: 'H11', deck: 'f_east', x: 5420, zone: 'east' },
    { id: 'H12', deck: 'u_tower', x: 3300, zone: 'tower' },
  ];
  const ZOMBIE_SPAWNS = [
    { id: 'Z1', deck: 'b_moat', x: 200, zone: 'moat' },
    { id: 'Z2', deck: 'b_gate', x: 520, zone: 'gate' },
    { id: 'Z3', deck: 'b_court', x: 1300, zone: 'court' },
    { id: 'Z4', deck: 'b_keep', x: 1800, zone: 'keep' },
    { id: 'Z5', deck: 'b_keep', x: 2150, zone: 'keep' },
    { id: 'Z6', deck: 'b_banq', x: 2600, zone: 'banq' },
    { id: 'Z7', deck: 'b_tower', x: 3100, zone: 'tower' },
    { id: 'Z8', deck: 'b_lib', x: 4100, zone: 'lib' },
    { id: 'Z9', deck: 'b_chap', x: 4500, zone: 'chapel' },
    { id: 'Z10', deck: 'b_wing', x: 5100, zone: 'wing' },
    { id: 'Z11', deck: 'b_east', x: 5450, zone: 'east' },
    { id: 'Z12', deck: 'u_banq', x: 2700, zone: 'banq' },
    { id: 'Z13', deck: 'q_lib', x: 4000, zone: 'lib' },
    { id: 'Z14', deck: 'r_keep', x: 2000, zone: 'keep' },
    { id: 'Z15', deck: 'u_wing', x: 5150, zone: 'wing' },
  ];
  const SUPPLIES = [
    { id: 'A1', deck: 'g_keep', x: 1600, kind: 'armory', label: '主堡军械室' },
    { id: 'A2', deck: 'f_banq', x: 2450, kind: 'ammo', label: '宴会厅弹药箱' },
    { id: 'A3', deck: 'u_lib', x: 4200, kind: 'medic', label: '书房医务站' },
    { id: 'A4', deck: 'b_court', x: 1280, kind: 'depot', label: '地牢补给库' },
    { id: 'A5', deck: 'b_keep', x: 2000, kind: 'ammo', label: '墓室弹药' },
    { id: 'A6', deck: 'f_chap', x: 4550, kind: 'medic', label: '礼拜堂医务' },
    { id: 'A7', deck: 'u_wing', x: 5080, kind: 'armory', label: '东翼军械' },
    { id: 'A8', deck: 'r_keep', x: 1500, kind: 'ammo', label: '屋脊弹药' },
    { id: 'A9', deck: 'q_gate', x: 800, kind: 'depot', label: '门楼步道补给' },
    { id: 'A10', deck: 's_top', x: 3300, kind: 'ammo', label: '塔顶军火' },
    { id: 'A11', deck: 'f_bridge', x: 180, kind: 'depot', label: '桥头物资' },
    { id: 'A12', deck: 'u_tower', x: 3500, kind: 'medic', label: '塔楼急救' },
    { id: 'A13', deck: 'g_wall', x: 5480, kind: 'ammo', label: '东城墙弹药' },
  ];

  const LVY = l => Y[l];
  function makeRng(seed) {
    let s = 0; const str = String(seed || 'CASTLE-1');
    for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  function regionOf(x) {
    for (const r of REGIONS) if (x >= r.x0 && x < r.x1) return r.id;
    return x < 0 ? REGIONS[0].id : REGIONS[REGIONS.length - 1].id;
  }
  // 台阶展开：**拱式薄踏板**（第一级抬高 70，梯下留 ≥46 净空）
  // 为什么不做成实心梯体：实心梯体是一道从下层地面直插上层楼板的墙，横版里它会把
  // 「下层走廊」整个切断。薄踏板让人流/人流追击都能从梯下穿过，梯上梯下两层同时可用。
  // 代价：62×86 大母体用不了薄踏板（见文件头约束 2），所以主干线的台地台阶另给 ramp 实体坡道。
  function stairSteps(st) {
    const yB = Y[st.from], yT = Y[st.to], riseTot = yB - yT;
    const width = st.x1 - st.x0;
    if (st.ramp) {                                  // 实体坡道：级高 ≤40、run ≥64，母体能走
      const n = Math.max(2, Math.ceil(riseTot / RAMP_RISE));
      const r = riseTot / n, run = width / n, steps = [];
      for (let i = 0; i < n; i++) {
        const k = st.dir > 0 ? i : n - 1 - i;
        steps.push({ x: Math.round(st.x0 + run * k), y: Math.round(yB - r * (i + 1)),
          w: Math.ceil(run) + 1, h: TREAD, i, stair: true });
      }
      return { steps, rise: +r.toFixed(1), rise1: +r.toFixed(1), run: +run.toFixed(1), n,
        under: 0, ramp: true, solidBot: yB, land: null,
        baseX: st.dir > 0 ? st.x0 : st.x1, topX: st.dir > 0 ? st.x1 : st.x0 };
    }
    let n, first;
    if (riseTot > FIRST_RISER + UNDER_CLEAR) {          // 需要梯下通行的层间梯
      first = riseTot - UNDER_CLEAR > FIRST_RISER ? FIRST_RISER : riseTot - UNDER_CLEAR;
      n = 1 + Math.max(1, Math.ceil((riseTot - first) / 45));
    } else {                                            // 小高差：均分即可
      first = 0; n = Math.max(2, Math.ceil(riseTot / 40));
    }
    while (n > 2 && width / n < 28) n--;                 // 踏面不得窄于 28
    const r = first ? (riseTot - first) / (n - 1) : riseTot / n;
    const run = width / n;
    const steps = [];
    for (let i = 0; i < n; i++) {
      const k = st.dir > 0 ? i : n - 1 - i;              // 低位在下行端
      const top = first ? yB - first - r * i : yB - r * (i + 1);
      steps.push({ x: Math.round(st.x0 + run * k), y: Math.round(top),
        w: Math.ceil(run) + 1, h: TREAD, i, stair: true });
    }
    // 井宽就等于梯带宽：到达层因此出现一道横缝，仍在 195px 起跳射程内可以双面跨过。
    // 曾经加过「低侧同层盖板」把井拓宽到 212px，结果同层走廊跨不过去、掉进井里又爬不出来，
    // 盖板方案已废弃。
    const land = null;
    return { steps, rise: +r.toFixed(1), rise1: +first.toFixed(1), run: +run.toFixed(1), n,
      under: first ? Math.round(first - TREAD) : 0, land,
      baseX: st.dir > 0 ? st.x0 : st.x1, topX: st.dir > 0 ? st.x1 : st.x0 };
  }
  // 某层楼板在该梯带范围内让位（不生成实体，由台阶面替代 —— 横向因此不会中断）
  function deckSpans(deck, punches) {
    let spans = [[deck.x0, deck.x1]];
    for (const p of punches) {
      if (p.lv !== deck.lv) continue;
      const next = [];
      for (const sp of spans) {
        if (sp[1] <= p.x0 || sp[0] >= p.x1) next.push(sp);
        else {
          if (sp[0] < p.x0) next.push([sp[0], p.x0]);
          if (sp[1] > p.x1) next.push([p.x1, sp[1]]);
        }
      }
      spans = next;
    }
    return spans;
  }
  function wallTop(lv, x, punches) {
    // 只按「 authored 断口」算天花板，不按楼梯井：井是临时挖空，墙的高度属于建筑结构。
    // 若让井参与计算，井吃掉本层楼板后墙会一路往上长到再上一层，把上面那层的门洞整个堵死。
    const bp = (punches || []).filter(p => !p.st);
    const i = LVS.indexOf(lv);
    for (let k = i - 1; k >= 0; k--) {
      for (const d of DECKS) {
        if (d.lv !== LVS[k] || x < d.x0 || x > d.x1) continue;
        for (const sp of deckSpans(d, bp)) if (x >= sp[0] && x <= sp[1]) return Y[LVS[k]] + SLB;
      }
    }
    return Y[lv] - 132;
  }

  // ---------- 几何展开 ----------
  function emit(M) {
    const S = [];
    const push = (x, y, w, h, o) => { if (w > 0 && h > 0) S.push(Object.assign({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), oneway: false, mat: 'stone', bound: true }, o || {})); };
    for (const d of M.decks) {
      const y = Y[d.lv];
      const bot = d.fill ? H : d.rock ? y + STOREY : y + SLB;
      for (const sp of deckSpans(d, M.punches)) {
        // fill 段里按 carve 挖出岩腔：腔内只留楼板厚，腔顶就是岩层里的房间天花板。
        // 阶段 0 的 tunnel 机制推广成任意多段，因为新图有 3 处岩腔（深潭、东暗渠、以及跨壑底）。
        const cuts = (d.carve || []).map(iv => [Math.max(sp[0], iv[0]), Math.min(sp[1], iv[1])])
          .filter(iv => iv[1] - iv[0] > 0).sort((a, b) => a[0] - b[0]);
        let cur = sp[0];
        for (const iv of cuts) {
          if (iv[0] > cur) push(cur, y, iv[0] - cur, bot - y, { mat: d.mat, deck: d.id });
          push(iv[0], y, iv[1] - iv[0], SLB, { mat: d.mat, deck: d.id, caveRoof: true });
          cur = iv[1];
        }
        if (cur < sp[1]) push(cur, y, sp[1] - cur, bot - y, { mat: d.mat, deck: d.id });
      }
      d.spans = deckSpans(d, M.punches).filter(s => s[1] - s[0] >= 4);
      // 只按「破损断口」算可用段：楼梯井吃掉的部分由台阶面自己替代（横向不中断），不算断头
      d.bspans = deckSpans(d, M.punches.filter(p => !p.st)).filter(s => s[1] - s[0] >= 4);
    }
    // 台阶
    for (const st of M.stairs) {
      for (const s of st.steps) push(s.x, s.y, s.w, st.solidBot ? st.solidBot - s.y : s.h,
        { mat: st.mat || 'stone', stair: true, sid: st.id, ramp: !!st.ramp, bound: false });
      if (st.land) push(st.land.x0, Y[st.to], st.land.x1 - st.land.x0, 14,
        { oneway: true, mat: 'wood', landing: st.id, bound: false });
    }
    // 视线切分墩（5.2）：参与碰撞与射线，但不参与导航面/站位判定 —— 它矮到能跳过去，路径不该因此改变
    for (const p of (M.piers || []))
      push(p.x - p.w / 2, Y[p.lv] - p.h, p.w, p.h, { mat: 'stone', pier: 1, lv: p.lv, bound: false });
    // 墙（含门洞拆分 + 门楣），并做梯带净空裁剪
    const shaft = M.stairs.map(st => ({ x0: Math.min(st.x0, st.x1) - 3, x1: Math.max(st.x0, st.x1) + 3, y0: Y[st.to] - 2, y1: Y[st.from] }));
    const carve = (x0, x1, y0, y1) => {
      let spans = [[x0, x1]];
      for (const v of shaft) {
        if (y1 <= v.y0 || y0 >= v.y1) continue;
        const next = [];
        for (const sp of spans) {
          if (sp[1] <= v.x0 || sp[0] >= v.x1) next.push(sp);
          else {
            if (sp[0] < v.x0) next.push([sp[0], v.x0]);
            if (sp[1] > v.x1) next.push([v.x1, sp[1]]);
          }
        }
        spans = next;
      }
      return spans.filter(sp => sp[1] - sp[0] >= 4);
    };
    for (const w of M.walls) {
      const floorY = Y[w.lv], top = w.top;
      if (!w.op) {
        for (const sp of carve(w.x, w.x + WALL, top, floorY)) push(sp[0], top, sp[1] - sp[0], floorY - top, { mat: 'stone', wall: true, lv: w.lv });
        continue;
      }
      // 侧视图的门 = 墙体切片上的一段垂直缺口（不是俯视图的门宽）。
      // 缺口以下什么都不放，角色直接穿洞而过；母体是否被挡只看缺口净高（她 86 高）。
      const o = OPEN[w.op], oy0 = floorY - o.h;
      if (oy0 > top) for (const sp of carve(w.x, w.x + WALL, top, oy0)) push(sp[0], top, sp[1] - sp[0], oy0 - top, { mat: 'stone', wall: true, lintel: true, lv: w.lv });
    }
    // 薄跳台（decor 跳台 = 纯建筑构件：不给碰撞、不进导航面）
    for (const lg of M.ledges) if (!lg.decor) push(lg.x0, lg.y, lg.x1 - lg.x0, 12, { oneway: true, mat: 'wood', ledge: lg.id, bound: false });
    M.solids = S;
    return S;
  }

  // ---------- 真实可行走面（从碰撞体反推，不靠手写） ----------
  // forNav=true 时排除墙体（墙是掩体不是路线，它的顶面不该成为航点）
  function surfaces(S, forNav) {
    const map = {};
    for (const s of S) {
      if (forNav && (s.wall || s.pier)) continue;   // 墩不进导航图：装墩前后路径必须一致
      const k = s.y + ':' + (s.oneway ? 'o' : 's');
      (map[k] || (map[k] = [])).push(s);
    }
    const out = [];
    for (const grp of Object.values(map)) {
      const iv = grp.map(s => [s.x, s.x + s.w, s]).sort((a, b) => a[0] - b[0]);
      let cur = null;
      for (const [x0, x1, s] of iv) {
        if (cur && x0 <= cur.x1 + 2) { cur.x1 = Math.max(cur.x1, x1); cur.solid = cur.solid; }
        else { cur = { x0, x1, y: s.y, one: !!s.oneway, solid: s, src: [] }; out.push(cur); }
        cur.src.push(s);
      }
    }
    return out.filter(v => v.x1 - v.x0 >= 26);      // 26px 以下的面放不下 22 宽的身体
  }
  const freeAt = (S, x0, y0, x1, y1, ignore) => {
    const ig = ignore || [];
    for (const s of S) {
      if (s.oneway || ig.indexOf(s) >= 0) continue;
      if (x0 < s.x + s.w - 1 && x1 > s.x + 1 && y0 < s.y + s.h - 1 && y1 > s.y + 1) return false;
    }
    return true;
  };
  // 站位是否被实体占据（楼地板本身除外：它的顶面就是 y）
  const standFree = (S, x, y) => {
    for (const s of S) {
      if (s.oneway || s.pier || s.y >= y) continue;
      if (x - 11 < s.x + s.w && x + 11 > s.x && y - PHY.BODY_H < s.y + s.h && y > s.y) return false;
    }
    return true;
  };

  // ---------- 有向通行图 ----------
  function buildNav(M) {
    const S = M.solids, SURF = M.surfaces;
    const nodes = [];
    const mk = (x, y, surf, si, kind) => {
      if (!standFree(M.solids, x, y)) return null;
      const n = { id: nodes.length, x: Math.round(x), y: Math.round(y), surfId: si, kind,
        region: regionOf(x), lv: (LVS.find(l => Y[l] === y) || 'MID') };
      nodes.push(n); return n;
    };
    SURF.forEach((v, si) => {
      v.nodes = [];
      const step = 110;
      for (let x = v.x0 + 12; x < v.x1 - 10; x += step) { const n = mk(x, v.y, v, si, v.one ? 'ledge' : 'floor'); if (n) v.nodes.push(n); }
      if (!v.nodes.length) { const n = mk((v.x0 + v.x1) / 2, v.y, v, si, v.one ? 'ledge' : 'floor'); if (n) v.nodes.push(n); }
      const last = v.nodes[v.nodes.length - 1];
      if (last && v.x1 - 12 > last.x + 30) { const n2 = mk(v.x1 - 12, v.y, v, si, v.one ? 'ledge' : 'floor'); if (n2) v.nodes.push(n2); }
      if (v.nodes.length) { v.nodes[0].end = 'L'; v.nodes[v.nodes.length - 1].end = 'R'; }
      v.si = si;
    });
    const E = [];
    const seen = {};
    const link = (a, b, type, dir, cost) => {
      if (!a || !b || a === b) return;
      const k = a.id + '>' + b.id + '>' + type;
      if (seen[k]) return; seen[k] = 1;
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      E.push({ a: a.id, b: b.id, type, dir, cost: Math.round(cost != null ? cost : dx + dy * 1.6) });
    };
    const nearestNodeOn = (v, x) => { let best = null, bd = Infinity; for (const n of v.nodes) { const d = Math.abs(n.x - x); if (d < bd) { bd = d; best = n; } } return best; };
    // 同一面内 walk（被 standFree 拒掉的站位会在节点序列里留下空洞，空洞超宽就不是「一步」，不能连）
    for (const v of SURF) for (let i = 1; i < v.nodes.length; i++) {
      const dx = Math.abs(v.nodes[i].x - v.nodes[i - 1].x);
      if (dx <= 150) link(v.nodes[i - 1], v.nodes[i], 'walk', 2, dx);
    }
    const clampX = (v, x) => Math.max(v.x0 + 8, Math.min(v.x1 - 8, x));
    for (let i = 0; i < SURF.length; i++) for (let j = 0; j < SURF.length; j++) {
      if (i === j) continue;
      const A = SURF[i], B = SURF[j];
      const hi = A.y <= B.y ? A : B, lo = hi === A ? B : A;
      const gapX = Math.max(hi.x0 - lo.x1, lo.x0 - hi.x1, 0);
      const overX = Math.min(hi.x1, lo.x1) - Math.max(hi.x0, lo.x0);
      const dy = lo.y - hi.y;
      // 1) 同层相邻 / 台阶互连：缝隙 ≤10 且高差 ≤44 → 双向（坡道的台阶链就靠这条串起来）
      if (dy <= PHY.STEP_OK && gapX <= 10) {
        const bx = (Math.max(hi.x0, lo.x0) + Math.min(hi.x1, lo.x1)) / 2;
        const na = nearestNodeOn(hi, clampX(hi, bx)), nb = nearestNodeOn(lo, clampX(lo, bx));
        if (na && nb && Math.abs(na.x - nb.x) <= 170) link(na, nb, dy <= 8 ? 'walk' : 'step', 2);
      }
      // 2) 跳跃登台（严格版）：必须存在「侧面助跑」—— 起跳点不得在目标面正下方。
      if (dy > PHY.STEP_OK && dy <= PHY.JUMP_H) {
        const disc = PHY.JUMP_V * PHY.JUMP_V - 2 * PHY.G * dy;
        const need = disc > 0 ? Math.ceil(PHY.SPEED * ((PHY.JUMP_V - Math.sqrt(disc)) / PHY.G)) + 12 : 999;
        const cand = [];
        if (lo.x0 <= hi.x0 - need) cand.push({ mx: Math.max(lo.x0 + 8, hi.x0 - need + 12), lx: hi.x0 + 12 });
        if (lo.x1 >= hi.x1 + need) cand.push({ mx: Math.min(lo.x1 - 8, hi.x1 + need - 12), lx: hi.x1 - 12 });
        if (overX <= 0 && gapX <= PHY.JUMP_RUN - 40) {           // 真正的侧面相邻（不在彼此正下方）
          const ex = hi === A ? Math.max(hi.x0, lo.x1) : Math.min(hi.x1, lo.x0);
          cand.push({ mx: hi === A ? Math.min(lo.x1 - 8, ex - 6) : Math.max(lo.x0 + 8, ex + 6),
            lx: clampX(hi, ex) });
        }
        for (const c of cand) {
          const mx = Math.max(lo.x0 + 8, Math.min(lo.x1 - 8, c.mx));
          const lx = Math.max(hi.x0 + 8, Math.min(hi.x1 - 8, c.lx));
          if (Math.abs(lx - mx) > PHY.JUMP_RUN - 10) continue;
          if (!freeAt(S, lx - 11, hi.y - PHY.BODY_H - 6, lx + 11, hi.y - 2, hi.src)) continue;   // 落脚处站得下
          if (!freeAt(S, mx - 11, lo.y - dy - PHY.BODY_H - 6, mx + 11, lo.y - 2, lo.src)) continue; // 助跑处头顶够
          link(nearestNodeOn(lo, mx), nearestNodeOn(hi, lx), 'jumpUp', 1, 240 + dy * 2 + Math.abs(lx - mx));
        }
      }
      // 3) 下落：高差 >44、≤430，且下落列真的通透
      if (dy > PHY.STEP_OK && dy <= 430) {
        const ex = hi === A ? hi.x0 : hi.x1;
        const dir = hi === A ? -1 : 1;
        const lx = clampX(lo, ex + dir * 14);
        if (Math.abs(lx - ex) <= 90 && freeAt(S, lx - 10, hi.y + 4, lx + 10, lo.y - 4) &&
          freeAt(S, lx - 11, lo.y - PHY.BODY_H - 6, lx + 11, lo.y - 2, lo.src)) {
          link(nearestNodeOn(hi, ex), nearestNodeOn(lo, lx), 'drop', 1, 150 + dy);
        }
      }
      // 4) 同层跨缝跳（断口、井口、屋顶断口）：高差 ≤12、缝隙 ≤195 → 双向
      if (dy <= 12 && overX <= 0 && gapX > 10 && gapX <= PHY.JUMP_RUN) {
        const west = A.x0 <= B.x0 ? A : B, east = west === A ? B : A;
        const na = nearestNodeOn(west, west.x1), nb = nearestNodeOn(east, east.x0);
        if (east.x0 - west.x1 <= gapX + 2 && na && nb && Math.abs(na.x - nb.x) <= PHY.JUMP_RUN + 15) link(na, nb, 'gapJump', 2, 260);
      }
    }
    const adj = nodes.map(() => []);
    E.forEach((e, i) => { adj[e.a].push(i); if (e.dir === 2) adj[e.b].push(i); });
    M.nodes = nodes; M.edges = E; M.adj = adj;
    // 出生点/补给吸附：必须落在该层自身的可站位航点上（不允许吸附到台阶面/跳台，也不贴在视线墩肚子里）
    const onPier = x => S.some(s => s.pier && Math.abs(x - (s.x + s.w / 2)) < 26);
    const onStep = (x, y) => S.some(s => (s.stair || s.oneway) && x > s.x - 2 && x < s.x + s.w + 2 && Math.abs(s.y - y) <= 2);
    const lvOfY = y => LVS.find(l => Y[l] === y) || 'G1';
    const legal = (x, y) => !M.walls.some(w => w.lv === lvOfY(y) && w.op && Math.abs(w.x - x) < 30) &&
      standFree(S, x, y) && !onPier(x);
    const pickNode = (p, strict) => {
      let best = null, bd = Infinity;
      for (const n of nodes) {
        if (n.y !== p.y || onStep(n.x, n.y)) continue;
        if (strict && !legal(n.x, n.y)) continue;
        if (onPier(n.x)) continue;
        const d = Math.abs(n.x - p.x);
        if (d < bd) { bd = d; best = n; }
      }
      return best ? { n: best, d: bd } : null;
    };
    const snap = list => { for (const p of list) {
      const d0 = M.deckById[p.deck]; p.y = d0 ? Y[d0.lv] : p.y; p.lv = d0 ? d0.lv : p.lv;
      const hit = pickNode(p, true) || pickNode(p, false);
      const best = hit && hit.n, bd = hit ? hit.d : -1;
      p.node = best ? best.id : -1;
      if (best) { p.x = best.x; p.surfId = best.surfId; p.region = best.region; p.snapD = bd; }
      else p.snapD = -1;
    } };
    snap(M.humanSpawns); snap(M.zombieSpawns); snap(M.supplies);
    return M;
  }

  function build(seed) {
    const rnd = makeRng(seed || 'CASTLE-1');
    const decks = DECKS.map(d => Object.assign({}, d, { region: regionOf((d.x0 + d.x1) / 2) }));
    const stairs = STAIRS.map(o => {
      const st = Object.assign({}, o);
      // 地下段与岩台段用石，室内楼层用木（宴会厅/东翼/图书馆是木构楼层）
      st.mat = (o.from === 'C1' || o.to === 'C1' || o.from === 'C0' || o.to === 'C0' ||
        o.from === 'G2' || o.to === 'G2' || o.ramp) ? 'stone'
        : (['sf_banq', 'sf_banq2', 'sf_wing', 'uf_wing', 'uf_lib', 'uf_lib2'].indexOf(o.id) >= 0 ? 'wood' : 'stone');
      return st;
    });
    // 把每道梯展开成踏面 + 运动学读数（rise/run/under/solidBot）。
    // hub 规则已经保证互不冲突，所以这里不再做自动挪位（旧图的 fitStair 是死代码，已删）。
    for (const st of stairs) Object.assign(st, stairSteps(st));
    const RUNUP = 46;
    const deckAt = (lv, x) => DECKS.find(d => d.lv === lv && x >= d.x0 && x <= d.x1);
    // 「连续地面」：区间内每个采样点都被该层某块楼板覆盖（相邻两块同层板算连续，不要求同一块）
    const floorOver = (lv, x0, x1) => {
      for (let x = x0; x <= x1; x += 8) if (!deckAt(lv, Math.min(x, x1))) return false;
      return true;
    };
    const ledges = LEDGES.map(l => {
      const lg = Object.assign({}, l);
      const d = decks.find(x => x.id === l.on);
      lg.lv = d ? d.lv : 'G1'; lg.baseY = Y[lg.lv];
      lg.y = l.y != null ? l.y : lg.baseY + (l.dy || 0);
      return lg;
    });
    const punches = [];
    for (const st of stairs)
      for (let li = LVS.indexOf(st.to); li < LVS.indexOf(st.from); li++)
        punches.push({ lv: LVS[li], x0: st.x0, x1: st.x1, st: true, id: st.id });
    for (const b of BREAKS) punches.push({ lv: b.lv, x0: b.x0, x1: b.x1, id: b.id });
    const wellHit = (lv, x0, x1) => punches.some(p => p.st && p.lv === lv && Math.min(p.x1, x1) - Math.max(p.x0, x0) > 4);
    const walls = [];
    const wallDropped = [];
    // 门墙落位规则：门的 ±46 两侧都必须有真楼板、且都不许是楼梯井。
    // 阶段 0 试过「只要求进得来人的那一侧」的放宽版，结果造出两扇开在空口的门 —— 已否决。
    for (const w0 of WALLS) {
      const half = w0.op ? 46 : 0, back = w0.op ? 46 : WALL;
      let placed = null;
      for (let k = 0; k <= 11 && !placed; k++) {
        for (const sgn of (k === 0 ? [0] : [1, -1])) {
          const x = w0.x + sgn * k * 13;
          const f0 = x - half, f1 = x + back;
          if (!floorOver(w0.lv, f0, f1)) continue;
          if (wellHit(w0.lv, f0, f1)) continue;
          if (!w0.op && stairs.some(st => st.from === w0.lv &&
            Math.min(st.x1 + (st.dir > 0 ? 0 : RUNUP), f1) - Math.max(st.x0 - (st.dir > 0 ? RUNUP : 0), f0) > 4)) continue;
          placed = x; break;
        }
      }
      if (placed == null) { wallDropped.push(w0.lv + '@' + w0.x); continue; }
      walls.push(Object.assign({}, w0, { x: placed, moved: placed !== w0.x ? w0.x : 0, top: wallTop(w0.lv, placed, punches) }));
    }
    // 视线墩落位规则（唯一一份）：站在该层连续楼板上、不落在楼梯井或断口里、
    // 不堵门口（≥70px）与补给点（≥46px）、不侵入楼梯占位与 base 侧助跑区。
    const okPier = (lv, x, w) => {
      const f0 = x - w / 2, f1 = x + w / 2;
      if (!floorOver(lv, f0, f1)) return false;
      if (wellHit(lv, f0 - 6, f1 + 6)) return false;
      if (BREAKS.some(b => b.lv === lv && Math.min(b.x1, f1) - Math.max(b.x0, f0) > 2)) return false;
      if (walls.some(q => q.op && q.lv === lv && Math.abs(q.x - x) < 70)) return false;
      if (SUPPLIES.some(s => (decks.find(d => d.id === s.deck) || {}).lv === lv && Math.abs(s.x - x) < 46)) return false;
      if (stairs.some(st => st.from === lv &&
        Math.min(st.x1, f1) - Math.max(st.x0 - (st.dir > 0 ? RUNUP : 0), f0 - (st.dir > 0 ? 0 : RUNUP)) > 2)) return false;
      if (stairs.some(st => st.to === lv &&
        Math.min(st.x1 + (st.dir > 0 ? 0 : RUNUP), f1) - Math.max(st.x0, f0 - (st.dir > 0 ? RUNUP : 0)) > 2)) return false;
      return true;
    };
    const pierSpots = [];
    for (const d of DECKS) for (let x = d.x0 + 60; x <= d.x1 - 60; x += 13) if (okPier(d.lv, x, 26)) pierSpots.push({ lv: d.lv, x });
    const piers = [], piersDropped = [];
    for (const p0 of PIERS) {
      let placed = null;
      for (let k = 0; k <= 8 && placed === null; k++) {
        for (const sgn of (k === 0 ? [0] : [1, -1])) {
          const x = p0.x + sgn * k * 13;
          if (okPier(p0.lv, x, p0.w)) { placed = x; break; }
        }
      }
      if (placed === null) { piersDropped.push(p0.lv + '@' + p0.x); continue; }
      piers.push(Object.assign({}, p0, { x: placed, moved: placed !== p0.x ? p0.x : 0 }));
    }
    const deckById = {}; for (const d of decks) deckById[d.id] = d;

    const M = {
      seed: String(seed || 'CASTLE-1'),
      world: { w: W, h: H, killY: KILL },
      Y, LVS, SLB, WALL, STOREY, OPEN, PHY, REGIONS, MASSING, VOIDS,
      decks, deckById, stairs, ledges, walls, punches, regions: REGIONS, piers, pierSpots,
      wallDropped, piersDropped, stairsDropped: STAIRS_DROPPED,
      humanSpawns: HUMAN_SPAWNS.map(s => Object.assign({}, s)),
      zombieSpawns: ZOMBIE_SPAWNS.map(s => Object.assign({}, s)),
      supplies: SUPPLIES.map(s => Object.assign({}, s)),
      breaks: BREAKS.map(b => Object.assign({}, b)),
      loops: LOOPS.map(l => Object.assign({}, l)),
    };
    emit(M);
    M.surfaces = surfaces(M.solids, true);
    for (const v of M.surfaces) {
      const lv = LVS.find(l => Y[l] === v.y);
      const d = decks.find(x => x.lv === lv && v.x0 >= x.x0 - 2 && v.x0 <= x.x1 + 2);
      v.lv = lv || 'STEP'; v.deckId = d ? d.id : null; v.region = regionOf((v.x0 + v.x1) / 2);
    }
    buildNav(M);

    // 断口吃掉的可用段（<60px 记为告警，检查脚本会列出）
    M.warn = [];
    for (const d of decks) for (const sp of d.bspans) if (sp[1] - sp[0] > 0 && sp[1] - sp[0] < 60) M.warn.push({ kind: 'sliver', deck: d.id, lv: d.lv, x0: sp[0], x1: sp[1] });

    // 装饰与灯光（纯美术，不参与碰撞；seed 只影响这里）
    const KINDS = ['crack', 'rubble', 'stain', 'chain', 'ivy', 'debris', 'mark'];
    M.decor = [];
    for (const d of decks) {
      const n = Math.max(1, Math.round((d.x1 - d.x0) / 260));
      for (let i = 0; i < n; i++) M.decor.push({ x: Math.round(d.x0 + rnd() * (d.x1 - d.x0)), y: Y[d.lv], lv: d.lv, kind: KINDS[Math.floor(rnd() * KINDS.length)], s: +(0.6 + rnd() * 0.9).toFixed(2), r: +rnd().toFixed(3) });
    }
    // 灯位一律按「所属楼板的标高 + 偏移」生成，不写绝对 y：台地一改灯就跟着走。
    M.lights = [];
    for (const d of decks) {
      const dark = d.lv === 'C1' || d.lv === 'C0';
      const sp = dark ? 340 : d.lv === 'G1' || d.lv === 'G2' ? 300 : 420;
      for (let x = d.x0 + 100; x < d.x1 - 60; x += sp) {
        M.lights.push({ x: Math.round(x), y: Y[d.lv] - (dark ? 96 : 120), lv: d.lv,
          deck: d.id, kind: dark ? 'emergency' : 'torch', flick: +rnd().toFixed(3) });
      }
    }
    M.lights.push({ x: 2450, y: 1500, kind: 'chandelier', deck: 'f_banq' }, { x: 1750, y: 1350, kind: 'chandelier', deck: 'g_keep' },
      { x: 3960, y: 1250, kind: 'window', deck: 'u_lib' }, { x: 4250, y: 1210, kind: 'rose', deck: 'f_chap' },
      { x: 5450, y: 1250, kind: 'window', deck: 'g_wall' }, { x: 180, y: 1560, kind: 'lantern', deck: 'f_bridge' },
      { x: 3190, y: 800, kind: 'beacon', deck: 's_top' }, { x: 4520, y: 980, kind: 'bell', deck: 'r_bell' });
    return M;
  }

  // ---------- 图上寻路（A*，阶段二实测与阶段五 AI 共用） ----------
  function findPath(M, from, to, opt) {
    const o = opt || {};
    const allow = o.allow || null;
    const blocked = o.ignore || {};
    if (from < 0 || to < 0) return null;
    if (from === to) return [from];
    const h = i => Math.hypot(M.nodes[i].x - M.nodes[to].x, (M.nodes[i].y - M.nodes[to].y) * 0.7);
    const open = [from], g = {}, came = {}, inOpen = {};
    g[from] = 0; inOpen[from] = 1;
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) {
        const f1 = (g[open[k]] || 0) + h(open[k]), f0 = (g[open[bi]] || 0) + h(open[bi]);
        if (f1 < f0) bi = k;
      }
      const cur = open.splice(bi, 1)[0]; inOpen[cur] = 0;
      if (cur === to) { const p = [cur]; let c = cur; while (came[c] != null) { c = came[c]; p.unshift(c); } return p; }
      for (const ei of M.adj[cur]) {
        if (blocked[ei]) continue;
        const e = M.edges[ei];
        if (allow && allow.indexOf(e.type) < 0) continue;
        if (o.sameY && M.nodes[e.b === cur ? e.a : e.b].y !== M.nodes[cur].y) continue;
        const nxt = e.b === cur ? e.a : e.b;
        if (e.dir === 1 && e.a !== cur) continue;         // 单向边只能按方向走
        const ng = (g[cur] || 0) + e.cost;
        if (g[nxt] != null && ng >= g[nxt]) continue;
        g[nxt] = ng; came[nxt] = cur;
        if (!inOpen[nxt]) { inOpen[nxt] = 1; open.push(nxt); }
      }
    }
    return null;
  }

  return { build, K: { W, H, KILL, Y, LVS, SLB, WALL, STOREY }, PHY, OPEN, stairSteps, stairWidth,
    deckSpans, regionOf, surfaces, LVY: Y, findPath };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CastleGen;
