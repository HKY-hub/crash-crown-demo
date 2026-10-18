// ============ 全局配置与数据 ============
// 配件系统入口开关（用户 2026-09-30 定：「不要做配件…舍弃配件系统」→ 选「只隐藏入口，代码留着」）。
// false = 仓库里的配件编辑页与 HUD 的配件徽章都不出现；
// ATTACH_SLOTS / ATTACH_META / effectiveAttachments / aggregateAttachFx / 存档字段全部保留，
// 背包默认送的配件仍然生效、仍然画在枪上（要连这些一起停用属于玩法改动，需另行确认）。
const 配件入口开放 = false;
const CFG = {
  CW: 960, CH: 540,             // 画布逻辑分辨率
  G: 2100,                      // 重力
  MAX_FALL: 1250,               // 最大下落速度
  HUMAN_SPEED: 275,             // 人类跑速
  HUMAN_VISUAL_H: 62,           // 五名普通特战队员的战斗画面可见身高
  JUMP_V: -745,                 // 起跳初速度
  COYOTE: 0.1,                  // 土狼时间
  BUFFER: 0.13,                 // 跳跃缓冲
  WORLD_H: 540,                 // 世界高度（地面以下为坑）
  GROUND_TOP: 470,              // 默认地面高度
  KILL_Y: 565,                  // 掉落死亡线
  ROUND_TIME: 480,              // 单局秒数（6 关主题地图，含防守/撤离时长）
  ESCAPE_TIME: 3.0,             // 撤离所需秒数
  AGGRO_RANGE: 470,             // 人类AI索敌范围
  ROOM_CAP: 30,                 // 房间人数上限
  THROW_CHARGE: 1.2,            // 投掷物蓄满所需秒数（左键按住时间）
  THROW_POWER_MAX: 1.65,        // 满蓄力度倍率（点按=1.0，满蓄=1.65，曲线更远更直）
  TEAM_FADE_RANGE: 100,         // 队友靠近玩家多少像素内开始虚化（0=关闭；值越大虚化越早）
  TEAM_FADE_MIN: 0.35,          // 队友贴脸时最小透明度（越小越透明；1=不虚化）
  SHAKE_MUL: 1,                 // 全局震屏强度系数（0=关闭震屏；越小越稳）
  ADS_IRON_ZOOM: 1.25,          // 无瞄具时机瞄开镜倍率（装瞄具后按附件 zoom）
  // ---- 设置系统可调参数（运行时读取，Settings 通过 apply 写入） ----
  GLOBAL_SPREAD_MUL: 1,         // 全局散布倍率
  GLOBAL_BLOOM_MUL: 1,          // 弹道扩散增长倍率
  GLOBAL_RECOIL_MUL: 1,         // 后坐力倍率
  GLOBAL_RPM_MUL: 1,            // 射速倍率
  GLOBAL_RELOAD_MUL: 1,         // 换弹速度倍率
  ADS_MODE: 'hold',             // 开镜方式：hold 长按 / toggle 点击
  ADS_SPEED_MUL: 1,             // 开镜速度倍率
  GUN_SPREAD_OVERRIDE: {},      // 每把枪散布覆盖 { weaponKey: 倍率 }
  HUMAN_HP: 100,                // 人类血量（makeHuman 读取）
  BACKPACK_CD: 3,               // 补给点 E 切换背包 CD（秒）
  ATTRIB_CD: 30,                // B 键属性切换 CD（秒）
  ZOMBIE_HP_MUL: 1,             // 僵尸血量倍率
  ZOMBIE_SPEED_MUL: 1,          // 僵尸移速倍率
  ZOMBIE_CD_MUL: 1,             // 僵尸攻击 CD 倍率
  ZOMBIE_DMG_MUL: 1,            // 僵尸攻击力倍率
};

// 武器类别元信息（滚轮在类别内切换具体武器；HUD 显示当前类别）
const GROUP_META = {
  assault: { name: '突击步枪', color: '#8bc34a' },
  sniper:  { name: '狙击枪',   color: '#00bcd4' },
  smg:     { name: '冲锋枪',   color: '#ffc107' },
  shotgun: { name: '霰弹枪',   color: '#ff9800' },
  lmg:     { name: '机枪',     color: '#7c4dff' },
  pistol:  { name: '副武器',   color: '#90a4ae' },
  melee:   { name: '近战武器', color: '#ff7043' },
  throw:   { name: '投掷武器', color: '#26c6da' },
};
// 武器类别顺序（按 w.g 归类，滚轮在类别内切换具体武器）
const GUN_GID_ORDER = ['assault','sniper','smg','shotgun','lmg','pistol','melee','throw'];

// 生化背包槽位：每个背包 = 主武器 / 副武器 / 近战 / 投掷 四个槽位（数字键 1-4 切换）
const WEAPON_GROUP_ORDER = ['primary', 'secondary', 'melee', 'throw'];
const SLOT_META = {
  primary:   { name: '主武器',   color: '#8bc34a' },
  secondary: { name: '副武器',   color: '#90a4ae' },
  melee:     { name: '近战武器', color: '#ff7043' },
  throw:     { name: '投掷武器', color: '#26c6da' },
};
// 每个槽位允许的武器类别（w.g）
const SLOT_GROUPS = {
  primary:   ['assault', 'sniper', 'smg', 'shotgun', 'lmg'],
  secondary: ['pistol'],
  melee:     ['melee'],
  throw:     ['throw'],
};

// 枪械字段：dmg/rpm/pellets/spread/bspeed/mag/reload/recoil/range/auto/color
// 特殊机制：windup=持续开火加速；explode+splash=范围爆炸；pierce=穿透；burst=一次扣弹多发；melee=近战挥砍；grenade+effect=投掷
const WEAPONS = {
  // ---------- 突击步枪 ----------
  m4a1:    { g:'assault', name:'M4A1',         dmg:24, rpm:10,    pellets:1, spread:0.024, bspeed:1050, mag:30, reload:1.7, recoil:0.009, range:780, auto:true,  color:'#8bc34a' },
  ak47:    { g:'assault', name:'AK-47',        dmg:29, rpm:8.5,   pellets:1, spread:0.034, bspeed:1080, mag:30, reload:1.8, recoil:0.015, range:800, auto:true,  color:'#a1887f' },
  ak103:   { g:'assault', name:'AK-103',       dmg:30, rpm:8.5,   pellets:1, spread:0.030, bspeed:1090, mag:30, reload:1.8, recoil:0.014, range:800, auto:true,  color:'#9e9d24' },
  scar:    { g:'assault', name:'SCAR-LIGHT',   dmg:25, rpm:9.5,   pellets:1, spread:0.026, bspeed:1060, mag:30, reload:1.7, recoil:0.010, range:790, auto:true,  color:'#66bb6a' },
  aug:     { g:'assault', name:'AUG A1',       dmg:23, rpm:10,    pellets:1, spread:0.022, bspeed:1040, mag:30, reload:1.7, recoil:0.008, range:780, auto:true,  color:'#558b2f' },
  sg552:   { g:'assault', name:'SG552',        dmg:25, rpm:9,     pellets:1, spread:0.028, bspeed:1050, mag:30, reload:1.8, recoil:0.011, range:790, auto:true,  color:'#689f38' },
  galil:   { g:'assault', name:'GALIL',        dmg:24, rpm:9,     pellets:1, spread:0.030, bspeed:1040, mag:35, reload:1.8, recoil:0.012, range:780, auto:true,  color:'#7cb342' },
  ac556:   { g:'assault', name:'AC-556',       dmg:23, rpm:10,    pellets:1, spread:0.030, bspeed:1030, mag:30, reload:1.8, recoil:0.012, range:770, auto:true,  color:'#8d6e63' },
  type81:  { g:'assault', name:'81式自动步枪', dmg:27, rpm:9,     pellets:1, spread:0.030, bspeed:1060, mag:30, reload:1.8, recoil:0.013, range:790, auto:true,  color:'#bdb76b' },
  qbz191:  { g:'assault', name:'QBZ-191',      dmg:26, rpm:10,    pellets:1, spread:0.024, bspeed:1070, mag:30, reload:1.7, recoil:0.010, range:800, auto:true,  color:'#4caf50' },
  qbz95:   { g:'assault', name:'QBZ-95',       dmg:26, rpm:9.5,   pellets:1, spread:0.026, bspeed:1060, mag:30, reload:1.7, recoil:0.011, range:790, auto:true,  color:'#43a047' },
  g36:     { g:'assault', name:'G36',          dmg:23, rpm:10.5,  pellets:1, spread:0.023, bspeed:1050, mag:30, reload:1.7, recoil:0.009, range:780, auto:true,  color:'#5d4037' },
  famas:   { g:'assault', name:'FAMAS',        dmg:24, rpm:10.5,  pellets:1, spread:0.024, bspeed:1050, mag:25, reload:1.8, recoil:0.009, range:770, auto:true,  color:'#33691e', burst:3 },
  hk416:   { g:'assault', name:'HK416',        dmg:25, rpm:10,    pellets:1, spread:0.024, bspeed:1070, mag:30, reload:1.7, recoil:0.009, range:800, auto:true,  color:'#607d8b' },
  qcq171:  { g:'assault', name:'QCQ-171',      dmg:24, rpm:9.5,   pellets:1, spread:0.025, bspeed:1050, mag:30, reload:1.8, recoil:0.011, range:780, auto:true,  color:'#795548' },
  // ---------- 狙击枪（栓动 + 连狙） ----------
  awm:     { g:'sniper',  name:'AWM',          dmg:150, rpm:0.7,  pellets:1, spread:0.004, bspeed:1900, mag:5,  reload:2.4, recoil:0.052, range:1500, auto:false, color:'#00bcd4', pierce:1 },
  m24:     { g:'sniper',  name:'M24',          dmg:135, rpm:0.9,  pellets:1, spread:0.005, bspeed:1850, mag:5,  reload:2.3, recoil:0.048, range:1450, auto:false, color:'#26a69a' },
  m1903:   { g:'sniper',  name:'春田 M1903',   dmg:125, rpm:0.9,  pellets:1, spread:0.006, bspeed:1800, mag:5,  reload:2.2, recoil:0.045, range:1400, auto:false, color:'#7e57c2' },
  vsk94:   { g:'sniper',  name:'VSK-94',       dmg:100, rpm:1.1,  pellets:1, spread:0.006, bspeed:1500, mag:10, reload:2.0, recoil:0.040, range:1300, auto:false, color:'#5c6bc0' },
  svd:     { g:'sniper',  name:'SVD',          dmg:55,  rpm:2.5,  pellets:1, spread:0.012, bspeed:1600, mag:10, reload:2.2, recoil:0.030, range:1300, auto:false, color:'#42a5f5' },
  m14ebr:  { g:'sniper',  name:'M14EBR',       dmg:60,  rpm:3,    pellets:1, spread:0.011, bspeed:1550, mag:20, reload:2.0, recoil:0.028, range:1250, auto:false, color:'#78909c' },
  sr25:    { g:'sniper',  name:'SR-25',        dmg:55,  rpm:2.8,  pellets:1, spread:0.010, bspeed:1580, mag:20, reload:2.1, recoil:0.027, range:1300, auto:false, color:'#8d6e63' },
  mk12:    { g:'sniper',  name:'MK12',         dmg:50,  rpm:3.2,  pellets:1, spread:0.011, bspeed:1500, mag:20, reload:2.0, recoil:0.026, range:1200, auto:false, color:'#66bb6a' },
  qbu09:   { g:'sniper',  name:'QBU-09',       dmg:70,  rpm:2.2,  pellets:1, spread:0.010, bspeed:1620, mag:10, reload:2.2, recoil:0.032, range:1350, auto:false, color:'#ef6c00' },
  scarssr: { g:'sniper',  name:'SCAR-SSR',     dmg:58,  rpm:2.8,  pellets:1, spread:0.011, bspeed:1560, mag:20, reload:2.1, recoil:0.027, range:1280, auto:false, color:'#c0ca33' },
  // ---------- 冲锋枪 ----------
  vector:  { g:'smg',     name:'Vector',       dmg:10,  rpm:16,   pellets:1, spread:0.050, bspeed:930, mag:25, reload:1.7, recoil:0.005, range:560, auto:true,  color:'#ffc107' },
  thompson:{ g:'smg',     name:'汤姆逊冲锋枪', dmg:13,  rpm:12,   pellets:1, spread:0.060, bspeed:880, mag:50, reload:2.0, recoil:0.008, range:540, auto:true,  color:'#d4a017' },
  uzi:     { g:'smg',     name:'UZI',          dmg:10,  rpm:15,   pellets:1, spread:0.065, bspeed:900, mag:32, reload:1.6, recoil:0.007, range:520, auto:true,  color:'#bdbdbd' },
  ump45:   { g:'smg',     name:'UMP45',        dmg:14,  rpm:11,   pellets:1, spread:0.050, bspeed:900, mag:25, reload:1.8, recoil:0.009, range:560, auto:true,  color:'#4e342e' },
  p90:     { g:'smg',     name:'P90',          dmg:10,  rpm:15,   pellets:1, spread:0.055, bspeed:920, mag:50, reload:1.9, recoil:0.006, range:560, auto:true,  color:'#455a64' },
  evo3:    { g:'smg',     name:'EVO-III',      dmg:11,  rpm:14,   pellets:1, spread:0.055, bspeed:910, mag:30, reload:1.7, recoil:0.007, range:550, auto:true,  color:'#ffa726' },
  ppbizon: { g:'smg',     name:'PP-野牛',      dmg:11,  rpm:13,   pellets:1, spread:0.060, bspeed:890, mag:64, reload:2.1, recoil:0.007, range:540, auto:true,  color:'#ef5350' },
  cf05:    { g:'smg',     name:'CF05',         dmg:11,  rpm:13,   pellets:1, spread:0.055, bspeed:900, mag:50, reload:1.9, recoil:0.007, range:550, auto:true,  color:'#9ccc65' },
  mac10:   { g:'smg',     name:'MAC-10',       dmg:12,  rpm:16,   pellets:1, spread:0.070, bspeed:880, mag:30, reload:1.6, recoil:0.008, range:500, auto:true,  color:'#8d6e63' },
  duals:   { g:'smg',     name:'双持暴徒',     dmg:11,  rpm:17,   pellets:1, spread:0.070, bspeed:890, mag:40, reload:1.9, recoil:0.008, range:520, auto:true,  color:'#ec407a' },
  // ---------- 霰弹枪 ----------
  m1014:   { g:'shotgun', name:'M1014',        dmg:10,  rpm:1.1,  pellets:8,  spread:0.240, bspeed:760, mag:7,  reload:2.1, recoil:0.036, range:360, auto:false, color:'#ff9800' },
  m1216:   { g:'shotgun', name:'M1216',        dmg:10,  rpm:1.2,  pellets:8,  spread:0.240, bspeed:760, mag:16, reload:2.3, recoil:0.036, range:360, auto:false, color:'#f57c00' },
  aa12:    { g:'shotgun', name:'AA-12',        dmg:9,   rpm:1.6,  pellets:8,  spread:0.250, bspeed:760, mag:20, reload:2.5, recoil:0.033, range:340, auto:true,  color:'#e65100' },
  ithaca37:{ g:'shotgun', name:'ITHACA-37',    dmg:11,  rpm:0.9,  pellets:9,  spread:0.260, bspeed:750, mag:5,  reload:2.2, recoil:0.042, range:350, auto:false, color:'#a1887f' },
  steam:   { g:'shotgun', name:'汽锤',         dmg:12,  rpm:1.0,  pellets:8,  spread:0.250, bspeed:740, mag:12, reload:2.4, recoil:0.044, range:360, auto:false, color:'#616161' },
  s12k:    { g:'shotgun', name:'S12K',         dmg:10,  rpm:1.2,  pellets:8,  spread:0.240, bspeed:760, mag:8,  reload:2.1, recoil:0.036, range:360, auto:false, color:'#6d4c41' },
  qba211:  { g:'shotgun', name:'QBA-211',      dmg:10,  rpm:1.1,  pellets:8,  spread:0.230, bspeed:770, mag:8,  reload:2.1, recoil:0.035, range:370, auto:false, color:'#2e7d32' },
  dbbl:    { g:'shotgun', name:'双管猎枪',     dmg:13,  rpm:0.8,  pellets:10, spread:0.280, bspeed:750, mag:2,  reload:2.6, recoil:0.050, range:330, auto:false, color:'#795548' },
  // ---------- 机枪 ----------
  m60:     { g:'lmg',     name:'M60',          dmg:11,  rpm:10,   pellets:1, spread:0.060, bspeed:1020, mag:100, reload:3.2, recoil:0.007, range:640, auto:true,  color:'#5d4037' },
  m249:    { g:'lmg',     name:'M249 MINIMI',  dmg:9,   rpm:13,   pellets:1, spread:0.065, bspeed:1000, mag:100, reload:3.0, recoil:0.006, range:620, auto:true,  color:'#558b2f' },
  mg3:     { g:'lmg',     name:'MG3',          dmg:10,  rpm:15,   pellets:1, spread:0.070, bspeed:1000, mag:120, reload:3.3, recoil:0.007, range:620, auto:true,  color:'#78909c' },
  lewis:   { g:'lmg',     name:'刘易斯轻机枪', dmg:10,  rpm:11,   pellets:1, spread:0.060, bspeed:990,  mag:97,  reload:3.1, recoil:0.007, range:620, auto:true,  color:'#8d6e63' },
  rpk:     { g:'lmg',     name:'RPK',          dmg:11,  rpm:11,   pellets:1, spread:0.060, bspeed:1010, mag:75,  reload:2.9, recoil:0.008, range:640, auto:true,  color:'#a1887f' },
  gatling: { g:'lmg',     name:'加特林机枪',   dmg:7,   rpm:20,   pellets:1, spread:0.085, bspeed:1020, mag:150, reload:3.6, recoil:0.004, range:620, auto:true,  color:'#7c4dff', windup:true },
  ultimax: { g:'lmg',     name:'ULTIMAX-100',  dmg:10,  rpm:12,   pellets:1, spread:0.060, bspeed:1000, mag:100, reload:3.0, recoil:0.006, range:630, auto:true,  color:'#26a69a' },
  // ---------- 副武器（手枪） ----------
  usp:     { g:'pistol',  name:'USP',          dmg:22,  rpm:6.5,  pellets:1, spread:0.018, bspeed:950, mag:15, reload:1.1, recoil:0.008, range:520, auto:false, color:'#90a4ae' },
  deagle:  { g:'pistol',  name:'沙漠之鹰',     dmg:42,  rpm:4,    pellets:1, spread:0.022, bspeed:980, mag:7,  reload:1.3, recoil:0.022, range:620, auto:false, color:'#b8860b' },
  p228:    { g:'pistol',  name:'P228',         dmg:24,  rpm:6,    pellets:1, spread:0.017, bspeed:950, mag:13, reload:1.1, recoil:0.009, range:520, auto:false, color:'#9e9e9e' },
  glock18: { g:'pistol',  name:'Glock-18',     dmg:20,  rpm:9,    pellets:1, spread:0.030, bspeed:940, mag:20, reload:1.2, recoil:0.012, range:500, auto:true,  color:'#616161' },
  m1911:   { g:'pistol',  name:'柯尔特 1911',  dmg:25,  rpm:5.5,  pellets:1, spread:0.019, bspeed:960, mag:7,  reload:1.2, recoil:0.012, range:540, auto:false, color:'#6d4c41' },
  rex:     { g:'pistol',  name:'Rex 左轮',     dmg:40,  rpm:4,    pellets:1, spread:0.018, bspeed:960, mag:6,  reload:1.4, recoil:0.020, range:580, auto:false, color:'#ffb300' },
  cop357:  { g:'pistol',  name:'COP357',       dmg:35,  rpm:4.5,  pellets:1, spread:0.016, bspeed:970, mag:4,  reload:1.5, recoil:0.018, range:540, auto:false, color:'#757575' },
  anaconda:{ g:'pistol',  name:'Anaconda 蟒蛇',dmg:48,  rpm:3.5,  pellets:1, spread:0.017, bspeed:990, mag:6,  reload:1.5, recoil:0.024, range:600, auto:false, color:'#d50000' },
  // ---------- 近战武器（原型） ----------
  knife:     { g:'melee', name:'军用匕首',     dmg:45, rpm:3,    range:60,  melee:true, color:'#cfd8dc' },
  hachet:    { g:'melee', name:'轻型军用手斧', dmg:55, rpm:2.4,  range:70,  melee:true, color:'#a1887f' },
  kukri:     { g:'melee', name:'尼泊尔军刀',   dmg:60, rpm:2.2,  range:75,  melee:true, color:'#8d6e63' },
  machete:   { g:'melee', name:'马来剑',       dmg:58, rpm:2.4,  range:72,  melee:true, color:'#b0bec5' },
  spade:     { g:'melee', name:'军用铁锹',     dmg:65, rpm:2,    range:85,  melee:true, color:'#78909c' },
  claw:      { g:'melee', name:'鹰爪',         dmg:50, rpm:2.8,  range:65,  melee:true, color:'#eceff1' },
  tangdao:   { g:'melee', name:'唐刀',         dmg:62, rpm:2.2,  range:80,  melee:true, color:'#b71c1c' },
  springknife:{g:'melee', name:'弹簧刀',       dmg:48, rpm:3,    range:58,  melee:true, color:'#90a4ae' },
  butterfly: { g:'melee', name:'蝴蝶刀',       dmg:46, rpm:3.2,  range:55,  melee:true, color:'#ff8a80' },
  wrench:    { g:'melee', name:'扳手',         dmg:68, rpm:1.8,  range:80,  melee:true, color:'#ffb300' },
  mysticknife:{g:'melee',name:'秘境匕首',      dmg:52, rpm:3,    range:62,  melee:true, color:'#4dd0e1' },
  // ---------- 投掷武器（fuse=引信秒数；无 fuse 的投掷物碰触/超时即触发） ----------
  grenade:    { g:'throw', name:'普通手雷',   count:3, dmg:95,  splash:110, bspeed:620, rpm:1, grenade:true, effect:'boom',   fuse:4, color:'#26c6da' },
  hegrenade:  { g:'throw', name:'高爆手雷',   count:2, dmg:150, splash:130, bspeed:620, rpm:1, grenade:true, effect:'boom',   fuse:4, color:'#ef5350' },
  flashbang:  { g:'throw', name:'闪光弹',     count:3, splash:160, bspeed:640, rpm:1, grenade:true, effect:'flash', fuse:3, color:'#fff176' },
  smoke:      { g:'throw', name:'烟雾弹',     count:3, splash:120, bspeed:600, rpm:1, grenade:true, effect:'smoke', fuse:3, color:'#cfd8dc' },
  gasgrenade: { g:'throw', name:'烟气手雷',   count:3, dmg:15, splash:120, bspeed:600, rpm:1, grenade:true, effect:'bio',   fuse:3, color:'#8bc34a' },
  impact:     { g:'throw', name:'冲击引信手雷',count:2, dmg:120, splash:100, bspeed:700, rpm:1, grenade:true, effect:'impact',color:'#ff7043' },
  firegrenade:{ g:'throw', name:'燃烧手雷',   count:2, dmg:25, splash:110, bspeed:620, rpm:1, grenade:true, effect:'fire',  color:'#ff5722' },
  healgrenade:{ g:'throw', name:'治疗手雷',   count:3, splash:140, bspeed:600, rpm:1, grenade:true, effect:'heal',  fuse:3, color:'#81c784' },
  freezegrenade:{g:'throw', name:'冰冻手雷',  count:2, splash:150, bspeed:600, rpm:1, grenade:true, effect:'freeze',fuse:3, color:'#4fc3f7' },
  // ---------- 地面拾取特殊武器（拾取槽 1/2，定额弹药，不打入背包槽位） ----------
  rpg7:     { g:'pickup', name:'RPG-7',        dmg:130, rpm:0.9, pellets:1, spread:0.008, bspeed:720, mag:4, reload:2.4, recoil:0.028, range:900, auto:false, explode:true, splash:95,  color:'#8d6e63', pickup:true, finite:true },
  gl:       { g:'pickup', name:'榴弹发射器',   dmg:90,  rpm:1.4, pellets:1, spread:0.010, bspeed:680, mag:6, reload:2.2, recoil:0.022, range:820, auto:false, explode:true, splash:85,  color:'#5d4037', pickup:true, finite:true },
  laser:    { g:'pickup', name:'激光毁灭者',   dmg:24,  rpm:9,   pellets:1, spread:0.006, bspeed:2800, mag:80, reload:2.0, recoil:0.003, range:1100, auto:true, pierce:4, color:'#e53935', pickup:true, finite:true },
  flamer:   { g:'pickup', name:'火焰喷射器',   dmg:14,  rpm:13,  pellets:1, spread:0.060, bspeed:0, mag:60, reload:2.2, recoil:0.005, range:150, auto:true, flamer:true, color:'#ff7043', pickup:true, finite:true },
  xuanyuan: { g:'pickup', name:'轩辕剑',       dmg:130, rpm:2,   range:110, melee:true, color:'#ffd54f', pickup:true, finite:true },
  shock:    { g:'pickup', name:'震撼弹',       count:3, splash:150, bspeed:640, rpm:1, grenade:true, effect:'flash', color:'#fff176', pickup:true, finite:true },
  adrenaline:{ g:'pickup', name:'激素针',      count:3, splash:120, bspeed:640, rpm:1, grenade:true, effect:'heal', color:'#ff8a65', pickup:true, finite:true },
  // ---------- 英雄变身武器（独立武器组） ----------
  hero_light: { g:'hero', name:'圣光之枪', dmg:42, rpm:9,  pellets:1, spread:0.012, bspeed:1450, mag:999, reload:1.0, recoil:0.004, range:900, auto:true, pierce:2, color:'#fff59d', hero:true },
  hero_xuan:  { g:'hero', name:'玄月之矢', dmg:52, rpm:7,  pellets:1, spread:0.008, bspeed:1650, mag:999, reload:1.2, recoil:0.006, range:1000, auto:true, pierce:1, color:'#ce93d8', hero:true },
  turret_shot:{ g:'pickup', name:'炮台子弹', dmg:22, rpm:0,  pellets:1, spread:0.01,  bspeed:1200, mag:1,   reload:0.0, recoil:0,     range:400, auto:false, pickup:true, color:'#ffd740' },
};
// ---------- 武器特色（fx）元信息：命中/挥砍触发的特殊效果 ----------
// 参数说明：slow/slowDur=减速系数与时长；dps/dur=持续伤害与时长；critChance/critMul=暴击；
// markMul/markDur=标记增伤；knock=击退力度；stunChance/stunDur=眩晕；vamp=吸血比例；
// chainChance/chainN/chainMul=电磁连锁；rampMax=狂热连续命中递增上限
const FX_META = {
  slow:   { name:'减速弹',  color:'#80deea', desc:'命中减速 45%，持续 1.8 秒',           slow:0.55, slowDur:1.8 },
  frost:  { name:'急冻弹',  color:'#4fc3f7', desc:'命中急冻：减速 75% 并造成冰冻伤害',   slow:0.25, slowDur:1.2, dps:6, dur:1.2 },
  burn:   { name:'燃烧弹',  color:'#ff7043', desc:'点燃目标，每秒 10 点伤害，2.5 秒',     dps:10, dur:2.5 },
  poison: { name:'毒蚀弹',  color:'#aed581', desc:'目标中毒，每秒 6 点伤害，4 秒',        dps:6, dur:4 },
  shock:  { name:'电磁弹',  color:'#b388ff', desc:'命中 25% 概率连锁 2 名敌人（50% 伤害）', chainChance:0.25, chainN:2, chainMul:0.5 },
  knock:  { name:'击退弹',  color:'#ffab91', desc:'命中强力击退敌人',                    knock:260 },
  stun:   { name:'震荡弹',  color:'#fff176', desc:'命中 12% 概率眩晕 1 秒',              stunChance:0.12, stunDur:1 },
  crit:   { name:'暴击弹',  color:'#ffd54f', desc:'18% 概率造成 2.5 倍伤害',             critChance:0.18, critMul:2.5 },
  vamp:   { name:'吸血弹',  color:'#ef9a9a', desc:'命中回复伤害 25% 的生命',             vamp:0.25 },
  mark:   { name:'标记弹',  color:'#ce93d8', desc:'标记目标：4 秒内受伤害 +30%',         markMul:1.3, markDur:4 },
  ramp:   { name:'狂热',    color:'#ff8a65', desc:'连续命中伤害递增，最高 +60%',         rampMax:0.6 },
  pierce: { name:'穿透弹',  color:'#00e5ff', desc:'子弹穿透，可命中多个目标' },
};
const FX_KEYS = Object.keys(FX_META);

// 每把枪械的特色弹（fx）分配：AWM 穿透、FAMAS 三连发、手雷/火焰喷射器等已有自身机制
const WEAPON_FX = {
  // 突击步枪
  m4a1: 'crit',   ak47: 'ramp',   ak103: 'knock',  scar: 'mark',   aug: 'slow',
  sg552: 'stun',  galil: 'burn',  ac556: 'shock',  type81: 'frost', qbz191: 'vamp',
  qbz95: 'poison',g36: 'crit',    hk416: 'slow',   qcq171: 'ramp',
  // 狙击枪（AWM 保留穿透）
  m24: 'crit',    m1903: 'knock', vsk94: 'mark',   svd: 'mark',    m14ebr: 'crit',
  sr25: 'slow',   mk12: 'frost',  qbu09: 'burn',   scarssr: 'stun',
  // 冲锋枪
  vector: 'ramp', thompson: 'burn', uzi: 'mark',   ump45: 'slow',  p90: 'pierce',
  evo3: 'crit',   ppbizon: 'poison', cf05: 'frost', mac10: 'stun', duals: 'ramp',
  // 霰弹枪
  m1014: 'knock', m1216: 'burn',  aa12: 'ramp',    ithaca37: 'slow', steam: 'frost',
  s12k: 'crit',   qba211: 'poison', dbbl: 'stun',
  // 机枪（加特林保留预热，附加电磁）
  m60: 'burn',    m249: 'ramp',   mg3: 'poison',   lewis: 'slow',  rpk: 'mark',
  gatling: 'shock', ultimax: 'crit',
  // 副武器
  usp: 'slow',    deagle: 'knock', p228: 'crit',   glock18: 'ramp', m1911: 'mark',
  rex: 'stun',    cop357: 'burn',  anaconda: 'crit',
  // 近战
  knife: 'crit',  hachet: 'knock', kukri: 'ramp',  machete: 'slow', spade: 'stun',
  claw: 'vamp',   tangdao: 'mark', springknife: 'poison', butterfly: 'ramp',
  wrench: 'stun', mysticknife: 'frost',
  // 拾取特殊武器（保留穿透/爆炸，附加特色）
  laser: 'burn',  xuanyuan: 'mark',
  // 英雄武器（保留穿透）
  hero_light: 'burn', hero_xuan: 'frost',
};

const WEAPON_KEYS = Object.keys(WEAPONS);
// 将 WEAPON_FX 注入 WEAPONS（w.fx 直接可用），单一赋值来源保持可维护
for (const k of Object.keys(WEAPON_FX)) if (WEAPONS[k]) WEAPONS[k].fx = WEAPON_FX[k];

// ---------- 弹道手感：扩散增长（bloom）与后坐恢复速率（recoilRecover） ----------
// bloom=每次开火扩散增量；bloomMax=扩散累积上限（1+bloom 倍率）；recoilRecover=后坐上抬回正速度
const BLOOM_BY_GROUP = {
  assault: { bloom: 0.008, bloomMax: 2.2, recover: 2.0 },   // 可控点射→连射扩散
  sniper:  { bloom: 0.003, bloomMax: 1.8, recover: 1.6 },   // 开镜后极小
  smg:     { bloom: 0.020, bloomMax: 3.0, recover: 2.3 },   // 快速泼水明显飘
  shotgun: { bloom: 0,     bloomMax: 1,   recover: 1.4 },   // 靠 pellets 大 spread
  lmg:     { bloom: 0.012, bloomMax: 3.5, recover: 1.2 },   // 火力压制越打越飘
  pistol:  { bloom: 0.005, bloomMax: 1.6, recover: 2.5 },
  pickup:  { bloom: 0.004, bloomMax: 2.0, recover: 1.8 },
  hero:    { bloom: 0.004, bloomMax: 1.8, recover: 2.2 },
};
for (const k of WEAPON_KEYS) {
  const w = WEAPONS[k];
  const b = BLOOM_BY_GROUP[w.g];
  if (!b) continue;
  if (w.bloom == null) w.bloom = b.bloom;
  if (w.bloomMax == null) w.bloomMax = b.bloomMax;
  if (w.recoilRecover == null) w.recoilRecover = b.recover;
}
// 特殊覆盖：激光/火焰精确不扩散；加特林后坐恢复最慢
if (WEAPONS.laser)   { WEAPONS.laser.bloom = 0; WEAPONS.laser.bloomMax = 1; WEAPONS.laser.recoilRecover = 2.4; }
if (WEAPONS.flamer)  { WEAPONS.flamer.bloom = 0; WEAPONS.flamer.bloomMax = 1; }
if (WEAPONS.gatling) { WEAPONS.gatling.recoilRecover = 0.8; }

// ---------- 每把枪特色音效（w.snd）与特色弹道（w.trail） ----------
// 由武器真实数据推导：威力→音调/音量/时长，射速→噪声脆度，键名→确定性微调，
// 保证同枪族内每把枪音色、弹道互不相同；特色枪再手工微调。
function gunSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function _mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

function buildGunSound(w, key) {
  const seed = gunSeed(key);
  const g = w.g;
  const dmg = Math.max(1, w.dmg || 8);
  // 波形按枪族定基色
  let tw = 'sawtooth', nt = 'lowpass';
  if (g === 'pistol' || g === 'smg' || g === 'lmg' || g === 'shotgun') tw = 'square';
  else if (g === 'hero') tw = 'triangle';
  // 威力越大音调越低（大炮轰鸣 vs 手枪啪）；rpm/种子抖动拉开同威力枪的差异
  const jitter = 0.82 + (seed % 17) / 40 + (w.rpm ? (w.rpm - 8) / 30 * 0.18 : 0);
  let t = Math.round(460 / Math.pow(dmg, 0.27) * jitter);
  t = Math.max(55, Math.min(820, t));
  let td = Math.min(0.3, 0.05 + dmg * 0.0016 + (w.rpm < 2.5 ? 0.1 : 0));
  let tv = Math.min(0.4, 0.15 + dmg * 0.0022);
  const slide = t * (0.25 + (seed % 6) / 24);
  let nd = Math.min(0.26, (w.rpm >= 12 ? 0.045 : 0.085) + dmg * 0.0012);
  let nv = Math.min(0.5, 0.2 + dmg * 0.0024);
  let nf = 0.6 + (seed % 9) / 18;
  // 第二泛音 / 回声 / 噪声沙层（枪族差异化）：狙击轰鸣回荡、霰弹中爆、冲锋沙沙高频
  let t2 = Math.min(1500, t * 2.1), t2v = 0.08, echo = 0, fb = 0, n2v = 0, n2f = 2.2, nt2 = 'highpass';
  if (g === 'sniper')  { echo = 0.16; fb = 0.3;  t2v = 0.12; n2v = 0.06; }
  else if (g === 'shotgun') { echo = 0.1; fb = 0.22; t2v = 0.1;  n2v = 0.05; }
  else if (g === 'lmg'){ echo = 0.06; fb = 0.18; t2v = 0.07; n2v = 0.08; n2f = 1.6; }
  else if (g === 'assault') { echo = 0.04; fb = 0.12; t2v = 0.06; n2v = 0.05; n2f = 2.0; }
  else if (g === 'smg'){ n2v = 0.12; n2f = 3.2; nt2 = 'highpass'; }
  else if (g === 'pistol') { n2v = 0.04; n2f = 2.6; }
  // 特殊武器
  if (w.flamer) { tw = 'sine'; t = 220 + (seed % 60); td = 0.12; nd = 0.1; nf = 1.8; nv = 0.3; n2v = 0.04; echo = 0.05; fb = 0.1; }   // 火焰呼呼
  else if (w.bspeed >= 2000) { tw = 'sine'; t = 620 + (seed % 120); td = 0.09; nd = 0.03; nf = 2.4; nv = 0.34; t2 = t * 1.4; t2v = 0.1; }   // 激光啾
  else if (w.explode) { tw = 'sawtooth'; t = 70 + (seed % 25); td = 0.3; nv = 0.5; nd = 0.24; echo = 0.2; fb = 0.32; }   // 榴弹轰
  return { tw, t, td, tv, slide, nd, nv, nf, nt, t2, t2v, echo, fb, n2v, n2f, nt2 };
}

// 每把枪散射角基准（类别倍率）：让部分枪明显在「特定夹角」内随机散布（如步枪 ~2-3°）
const SCATTER_CAT = { sniper: 0.35, assault: 1.6, smg: 1.8, lmg: 1.5, pistol: 1.4, shotgun: 1, pickup: 1, hero: 0.8 };
function buildGunTrail(w, key) {
  const g = w.g;
  const seed = gunSeed(key);
  const dmg = Math.max(1, w.dmg || 8);
  // 弹道主体色：枪械自身色与特色弹色混合（每把枪都不同）
  let color = w.color || '#ffe066';
  if (w.fx && FX_META[w.fx]) color = _mixHex(color, FX_META[w.fx].color, 0.55);
  const glowColor = (w.fx && FX_META[w.fx]) ? FX_META[w.fx].color : '#fff3c4';
  let width = w.pellets > 1 ? 2.4 : 2;
  let len = 10;
  let glow = 0.35 + Math.min(0.3, dmg * 0.002);
  let shape = 'tracer';   // 默认短粗渐隐曳光，告别「全是激光枪」
  if (w.bspeed >= 2000) { shape = 'laser'; len = 42; width = 2.2; glow = 0.9; }
  else if (w.explode) { shape = 'rocket'; len = 22; width = 3; glow = 0.85; }
  else if (w.flamer || w.bspeed <= 0) { shape = 'dot'; len = 0; width = 4; glow = 0.9; }
  else if (g === 'shotgun') { shape = 'scatter'; width = 2.4; len = 9; glow = 0.7; }   // 散射：短促消散弹丸，非直线
  else if (g === 'sniper') { len = 30; width = 2.2; glow = Math.min(1, glow + 0.3); }
  else if (g === 'smg') { len = 8; width = 1.6; glow = 0.3; }
  else if (g === 'pistol') { len = 9; width = 1.7; glow = 0.32; }
  else if (g === 'lmg') { len = 14; width = 2.4; glow = 0.42; }
  else if (g === 'assault') { len = 11; width = 1.9; glow = 0.38; }
  // 确定性微调：同枪族内每把枪 len/width/glow 各不相同（seed 派生，±10%）
  const lenJ = 0.9 + (seed % 21) / 100, widJ = 0.9 + ((seed >> 3) % 21) / 100, gloJ = 0.9 + ((seed >> 5) % 21) / 100;
  len = Math.max(1, Math.round(len * lenJ));
  width = Math.max(0.8, Math.round(width * widJ * 100) / 100);
  glow = Math.min(1, Math.max(0.15, glow * gloJ));
  // 散射角：类别倍率 × seed 微调（每把枪「特定夹角」独一无二；近战/投掷/无飞行不散）
  const scatter = (w.melee || w.grenade || w.bspeed <= 0) ? 0
    : Math.round((w.spread || 0.03) * (SCATTER_CAT[g] || 1) * (0.85 + (seed % 31) / 100) * 10000) / 10000;
  const scatterType = (seed % 11 === 0) ? 'gauss' : 'uniform';
  return { color, glowColor, width, len, glow, shape, scatter, scatterType };
}

// 特色枪手工微调（确保招牌枪音色/弹道辨识度）
const GUN_SND_OVERRIDE = {
  awm:      { t: 96,  td: 0.34, tv: 0.42, tw: 'sawtooth', slide: 34,  nd: 0.22, nv: 0.55, nf: 0.5 },
  deagle:   { t: 140, td: 0.2,  tv: 0.36, tw: 'square',   slide: 60,  nd: 0.14, nv: 0.45, nf: 0.8 },
  gatling:  { t: 220, td: 0.05, tv: 0.18, tw: 'square',   slide: 180, nd: 0.04, nv: 0.3,  nf: 1.5 },
  m4a1:     { t: 300, td: 0.08, tv: 0.22, tw: 'sawtooth', slide: 150, nd: 0.06, nv: 0.3,  nf: 1.1 },
  ak47:     { t: 240, td: 0.09, tv: 0.26, tw: 'sawtooth', slide: 110, nd: 0.07, nv: 0.34, nf: 1.0 },
  uzi:      { t: 480, td: 0.05, tv: 0.16, tw: 'square',   slide: 260, nd: 0.04, nv: 0.26, nf: 1.6 },
  m1014:    { t: 110, td: 0.22, tv: 0.38, tw: 'square',   slide: 40,  nd: 0.2,  nv: 0.5,  nf: 0.6 },
  rpg7:     { t: 62,  td: 0.34, tv: 0.44, tw: 'sawtooth', slide: 26,  nd: 0.26, nv: 0.55, nf: 0.4 },
  laser:    { t: 760, td: 0.08, tv: 0.3,  tw: 'sine',     slide: 420, nd: 0.03, nv: 0.4,  nf: 2.6 },
  hero_light: { t: 620, td: 0.1, tv: 0.28, tw: 'triangle', slide: 300, nd: 0.05, nv: 0.4, nf: 1.8 },
  hero_xuan:  { t: 520, td: 0.12, tv: 0.3, tw: 'triangle', slide: 240, nd: 0.06, nv: 0.4, nf: 1.6 },
  s12k:     { t: 100, td: 0.24, tv: 0.4,  tw: 'square',   slide: 38,  nd: 0.22, nv: 0.52, nf: 0.55 },
  p90:      { t: 420, td: 0.05, tv: 0.17, tw: 'square',   slide: 240, nd: 0.045, nv: 0.27, nf: 1.4 },
  gl:       { t: 58,  td: 0.32, tv: 0.42, tw: 'sawtooth', slide: 24,  nd: 0.24, nv: 0.54, nf: 0.42 },
  m249:     { t: 200, td: 0.07, tv: 0.24, tw: 'square',   slide: 120, nd: 0.05, nv: 0.32, nf: 1.2 },
};
const GUN_TRAIL_OVERRIDE = {
  // 狙击：极准（近直线）
  awm:   { color: '#80d8ff', glowColor: '#e1f5fe', glow: 0.95, len: 34, width: 2.2, scatter: 0.006, scatterType: 'gauss' },
  // 突击步枪：明显非直线（~2-3°）
  m4a1:  { color: '#a5d6a7', glowColor: '#e8f5e9', glow: 0.55, len: 13, width: 2, scatter: 0.042 },
  ak47:  { color: '#bcaaa4', glowColor: '#ffe0b2', glow: 0.6, len: 15, width: 2.2, scatter: 0.052 },
  qbz191:{ color: '#4caf50', glowColor: '#ef9a9a', glow: 0.45, len: 12, width: 1.9, scatter: 0.04 },
  scar:  { color: '#66bb6a', glowColor: '#ce93d8', glow: 0.5, len: 12, width: 1.9, scatter: 0.044 },
  aug:   { color: '#558b2f', glowColor: '#80deea', glow: 0.42, len: 11, width: 1.8, scatter: 0.038, scatterType: 'gauss' },
  // 冲锋枪：较散（泼水）；p90 准、vector 稳、thompson/uzi 大而散
  p90:   { color: '#455a64', glowColor: '#00e5ff', glow: 0.38, len: 8, width: 1.6, scatter: 0.03, scatterType: 'gauss' },
  vector:{ color: '#ffc107', glowColor: '#ff8a65', glow: 0.4, len: 8, width: 1.6, scatter: 0.045, scatterType: 'gauss' },
  thompson:{ color: '#d4a017', glowColor: '#ff7043', glow: 0.4, len: 9, width: 1.8, scatter: 0.085 },
  uzi:   { color: '#bdbdbd', glowColor: '#ce93d8', glow: 0.32, len: 7, width: 1.5, scatter: 0.075 },
  // 机枪：火力压制越打越飘
  m249:  { color: '#558b2f', glowColor: '#ff8a65', glow: 0.48, len: 15, width: 2.5, scatter: 0.06 },
  mg3:   { color: '#78909c', glowColor: '#aed581', glow: 0.46, len: 15, width: 2.4, scatter: 0.065 },
  // 霰弹枪
  m1014: { color: '#ff9800', glowColor: '#ffab91', glow: 0.72, len: 9, width: 2.4, scatter: 0.05 },
  aa12:  { color: '#e65100', glowColor: '#ff8a65', glow: 0.7, len: 8, width: 2.4, scatter: 0.045 },
  // 副武器
  deagle:{ color: '#ffd54f', glowColor: '#fff176', glow: 0.7, len: 14, width: 2.2, scatter: 0.07, scatterType: 'gauss' },
  rex:   { color: '#ffb300', glowColor: '#fff176', glow: 0.5, len: 11, width: 2, scatter: 0.05, scatterType: 'gauss' },
  gatling:{ color: '#ff9e80', glowColor: '#ffd180', glow: 0.6, len: 14, width: 2.6, scatter: 0.05 },
  // 拾取/能量武器：激光细直、震撼弹火星、轩辕剑彗星
  laser: { color: '#ff5252', glowColor: '#ffcdd2', glow: 0.95, len: 44, width: 2.2, shape: 'laser', scatter: 0.006, scatterType: 'gauss' },
  rpg7:  { color: '#a1887f', glowColor: '#ffcc80', glow: 0.9, len: 24, width: 3.2, shape: 'rocket' },
  shock: { color: '#b388ff', glowColor: '#e1bee7', glow: 0.95, len: 12, width: 2, shape: 'spark' },
  xuanyuan:{ color: '#ffd54f', glowColor: '#fff9c4', glow: 0.9, len: 18, width: 2.6, shape: 'comet' },
  // 英雄武器：彗星拖尾
  hero_light: { color: '#fff9c4', glowColor: '#ffffff', glow: 0.95, len: 20, width: 2.4, shape: 'comet', scatter: 0.012, scatterType: 'gauss' },
  hero_xuan:  { color: '#e1bee7', glowColor: '#f3e5f5', glow: 0.95, len: 22, width: 2.4, shape: 'comet', scatter: 0.01, scatterType: 'gauss' },
};

// ---------- 逐枪真实枪声采样映射（GUN_SNDFILE） ----------
// 每个条目 = { file: sounds/ 下的 ogg 文件名, pitch: 音高, vol: 音量, echo?: 回声反馈, hp?: 低通滤波 }
// 素材来源：petroulacl/fps-asset-kit（OpenGameArt CC0 Firearm Sound Library，免署名可商用）。
// 58 把枪械全部映射；近战/投掷/拾取/英雄武器保留程序化合成（激光/火焰/爆炸用合成更贴切）。
const GUN_SNDFILE = {
  // ---- 手枪 8 把：1:1 独占真实手枪采样 ----
  usp:     { file: 'ppq.ogg',    pitch: 1.0,  vol: 0.8 },
  deagle:  { file: 'cd.ogg',     pitch: 0.88, vol: 1.15 },
  p228:    { file: 'bersa.ogg',  pitch: 0.98, vol: 0.85 },
  glock18: { file: 'ruger.ogg',  pitch: 1.06, vol: 0.72 },
  m1911:   { file: 'm1911.ogg',  pitch: 1.0,  vol: 1.0 },
  rex:     { file: 'six.ogg',    pitch: 0.98, vol: 1.1 },
  cop357:  { file: 'sw642.ogg',  pitch: 0.95, vol: 1.0 },
  anaconda:{ file: 'revolver.ogg', pitch: 0.85, vol: 1.2, echo: 0.1 },
  // ---- 冲锋枪 10 把：M45 / PPSh / AR-15 / CD 四种采样按枪性分配 ----
  vector:  { file: 'ar15.ogg',   pitch: 1.25, vol: 0.55 },
  thompson:{ file: 'ppsh.ogg',   pitch: 0.95, vol: 1.0,  echo: 0.08 },
  uzi:     { file: 'm45.ogg',    pitch: 1.1,  vol: 0.7 },
  ump45:   { file: 'm45.ogg',    pitch: 0.85, vol: 0.85 },
  p90:     { file: 'cd.ogg',     pitch: 1.3,  vol: 0.6 },
  evo3:    { file: 'ppsh.ogg',   pitch: 1.15, vol: 0.75 },
  ppbizon: { file: 'm45.ogg',    pitch: 1.05, vol: 0.7 },
  cf05:    { file: 'cd.ogg',     pitch: 1.1,  vol: 0.7 },
  mac10:   { file: 'ppsh.ogg',   pitch: 1.3,  vol: 0.65 },
  duals:   { file: 'ppsh.ogg',   pitch: 1.2,  vol: 0.7,  echo: 0.05 },
  // ---- 突击步枪 15 把：AR-15 / AK-47 / SKS 三类采样 ----
  m4a1:    { file: 'ar15.ogg',   pitch: 1.0,  vol: 0.9 },
  ak47:    { file: 'ak47.ogg',   pitch: 1.0,  vol: 1.0 },
  ak103:   { file: 'ak47.ogg',   pitch: 0.92, vol: 1.05 },
  scar:    { file: 'ar15.ogg',   pitch: 1.05, vol: 0.85 },
  aug:     { file: 'ar15.ogg',   pitch: 1.08, vol: 0.8 },
  sg552:   { file: 'sks.ogg',    pitch: 1.0,  vol: 0.9 },
  galil:   { file: 'ak47.ogg',   pitch: 0.95, vol: 1.0 },
  ac556:   { file: 'ar15.ogg',   pitch: 1.1,  vol: 0.85 },
  type81:  { file: 'ak47.ogg',   pitch: 1.03, vol: 1.0 },
  qbz191:  { file: 'ar15.ogg',   pitch: 1.02, vol: 0.9 },
  qbz95:   { file: 'sks.ogg',    pitch: 0.95, vol: 0.95 },
  g36:     { file: 'ar15.ogg',   pitch: 1.06, vol: 0.8 },
  famas:   { file: 'ar15.ogg',   pitch: 1.12, vol: 0.75 },
  hk416:   { file: 'ar15.ogg',   pitch: 0.98, vol: 0.9 },
  qcq171:  { file: 'sks.ogg',    pitch: 1.05, vol: 0.85 },
  // ---- 狙击枪 10 把：栓动/半自动分派不同步枪采样 ----
  awm:     { file: 'mosin.ogg',  pitch: 1.0,  vol: 1.25, echo: 0.2 },
  m24:     { file: 'tikka.ogg',  pitch: 1.0,  vol: 1.1,  echo: 0.15 },
  m1903:   { file: 'arisaka.ogg',pitch: 1.0,  vol: 1.05, echo: 0.12 },
  vsk94:   { file: 'sks.ogg',    pitch: 0.78, vol: 0.9,  hp: 1600 },
  svd:     { file: 'm1894.ogg',  pitch: 0.9,  vol: 1.0,  echo: 0.1 },
  m14ebr:  { file: 'savage.ogg', pitch: 0.95, vol: 1.1 },
  sr25:    { file: 'marlin.ogg', pitch: 0.9,  vol: 1.05, echo: 0.1 },
  mk12:    { file: 'tikka.ogg',  pitch: 1.1,  vol: 0.95 },
  qbu09:   { file: 'mosin.ogg',  pitch: 0.85, vol: 1.2,  echo: 0.18 },
  scarssr: { file: 'sks.ogg',    pitch: 1.1,  vol: 0.9 },
  // ---- 霰弹枪 8 把：Model12 / Mossberg / Nova 三种泵动采样 ----
  m1014:   { file: 'm12.ogg',    pitch: 1.0,  vol: 1.1,  echo: 0.12 },
  m1216:   { file: 'mossberg.ogg', pitch: 1.0, vol: 1.1, echo: 0.12 },
  aa12:    { file: 'nova.ogg',   pitch: 1.0,  vol: 1.05, echo: 0.1 },
  ithaca37:{ file: 'm12.ogg',    pitch: 0.9,  vol: 1.15, echo: 0.15 },
  steam:   { file: 'mossberg.ogg', pitch: 0.85, vol: 1.2, echo: 0.15 },
  s12k:    { file: 'm12.ogg',    pitch: 1.1,  vol: 1.0 },
  qba211:  { file: 'mossberg.ogg', pitch: 1.1, vol: 1.0 },
  dbbl:    { file: 'nova.ogg',   pitch: 0.9,  vol: 1.25, echo: 0.18 },
  // ---- 机枪 7 把：复用步枪采样压低音调 + 更强回声 ----
  m60:     { file: 'ar15.ogg',   pitch: 0.7,  vol: 1.05, echo: 0.15 },
  m249:    { file: 'sks.ogg',    pitch: 0.85, vol: 0.95, echo: 0.1 },
  mg3:     { file: 'ak47.ogg',   pitch: 0.9,  vol: 1.0,  echo: 0.12 },
  lewis:   { file: 'ar15.ogg',   pitch: 0.75, vol: 1.0,  echo: 0.12 },
  rpk:     { file: 'ak47.ogg',   pitch: 0.85, vol: 1.05, echo: 0.1 },
  gatling: { file: 'ak47.ogg',   pitch: 0.7,  vol: 0.9,  echo: 0.08 },
  ultimax: { file: 'sks.ogg',    pitch: 0.9,  vol: 0.9 },
};

// ---------- 每把枪独立手感档案（w.feel） ----------
// 基准按枪族定档，再按 dmg/recoil/rpm + gunSeed 确定性微调，保证同枪族手感互不相同。
const FEEL_CAT = {
  sniper:  { kickMax: 0.085, kickSide: 0.012, shake: 1.6, flashMul: 1.25, flashSize: 5, shellPow: 1.5 },
  shotgun: { kickMax: 0.06,  kickSide: 0.03,  shake: 1.4, flashMul: 1.4,  flashSize: 6, shellPow: 1.2 },
  assault: { kickMax: 0.045, kickSide: 0.02,  shake: 1.0, flashMul: 1.0,  flashSize: 4, shellPow: 1.0 },
  smg:     { kickMax: 0.03,  kickSide: 0.025, shake: 0.7, flashMul: 0.85, flashSize: 3, shellPow: 0.85 },
  lmg:     { kickMax: 0.035, kickSide: 0.018, shake: 0.9, flashMul: 0.9,  flashSize: 4, shellPow: 1.1 },
  pistol:  { kickMax: 0.02,  kickSide: 0.01,  shake: 0.5, flashMul: 0.8,  flashSize: 3, shellPow: 0.8 },
  pickup:  { kickMax: 0.05,  kickSide: 0.02,  shake: 1.2, flashMul: 1.2,  flashSize: 5, shellPow: 1.2 },
  hero:    { kickMax: 0.03,  kickSide: 0.012, shake: 0.8, flashMul: 1.0,  flashSize: 4, shellPow: 1.0 },
};
function buildGunFeel(w, key) {
  const seed = gunSeed(key);
  const b = FEEL_CAT[w.g] || FEEL_CAT.assault;
  const j1 = 0.88 + (seed % 25) / 100;             // ±12% 微调
  const j2 = 0.85 + ((seed >> 3) % 31) / 100;
  const j3 = 0.85 + ((seed >> 5) % 21) / 100;
  // 重型武器（高伤/高后坐）上抬与震屏更强；高射速火光略收敛
  const heavy = Math.min(1.5, 0.7 + (w.dmg || 8) * 0.006 + (w.recoil || 0) * 35);
  return {
    kickMax:  +Math.min(0.12, b.kickMax * j1 * heavy * 0.9).toFixed(4),
    kickSide: +Math.min(0.06, b.kickSide * j2 * heavy).toFixed(4),
    shake:    +Math.min(2.2, b.shake * j2 * heavy * 0.8).toFixed(2),
    flashMul: +Math.min(2.0, b.flashMul * j3).toFixed(2),
    flashSize: Math.max(2, Math.round(b.flashSize * (0.8 + ((seed >> 4) % 3) / 10))),
    shellPow: +Math.min(2.0, b.shellPow * (0.85 + (seed % 5) / 20)).toFixed(2),
  };
}
// 招牌枪手工微调（AK 向右上飘、SCAR 平稳、AWM 巨震、加特林低闪等辨识手感）
const GUN_FEEL_OVERRIDE = {
  awm:    { kickMax: 0.11,  kickSide: 0.012, shake: 2.0, flashMul: 1.5, flashSize: 6, shellPow: 1.8 },
  deagle: { kickMax: 0.075, kickSide: 0.035, shake: 1.5, flashMul: 1.6, flashSize: 5, shellPow: 1.4 },
  gatling:{ kickMax: 0.05,  kickSide: 0.02,  shake: 1.0, flashMul: 0.7, flashSize: 3, shellPow: 1.2 },
  m4a1:   { kickMax: 0.045, kickSide: 0.015, shake: 0.9, flashMul: 0.95, flashSize: 4, shellPow: 1.0 },
  ak47:   { kickMax: 0.06,  kickSide: 0.05,  shake: 1.3, flashMul: 1.2, flashSize: 5, shellPow: 1.1 },
  scar:   { kickMax: 0.04,  kickSide: 0.012, shake: 0.85, flashMul: 0.9, flashSize: 4, shellPow: 1.0 },
  uzi:    { kickMax: 0.035, kickSide: 0.03,  shake: 0.8, flashMul: 0.85, flashSize: 3, shellPow: 0.85 },
  m1014:  { kickMax: 0.075, kickSide: 0.035, shake: 1.6, flashMul: 1.5, flashSize: 7, shellPow: 1.3 },
  s12k:   { kickMax: 0.07,  kickSide: 0.03,  shake: 1.5, flashMul: 1.4, flashSize: 6, shellPow: 1.2 },
  p90:    { kickMax: 0.028, kickSide: 0.015, shake: 0.7, flashMul: 0.85, flashSize: 3, shellPow: 0.9 },
  m249:   { kickMax: 0.045, kickSide: 0.025, shake: 1.1, flashMul: 1.0, flashSize: 4, shellPow: 1.2 },
  laser:  { kickMax: 0.02,  kickSide: 0.008, shake: 0.5, flashMul: 0.6, flashSize: 2, shellPow: 1.0 },
};

// 注入：每把枪都能拿到自己的 snd / trail / sndFile / feel（未覆盖的由推导函数生成）
for (const k of WEAPON_KEYS) {
  const w = WEAPONS[k];
  w.snd = Object.assign(buildGunSound(w, k), GUN_SND_OVERRIDE[k] || {});
  w.trail = Object.assign(buildGunTrail(w, k), GUN_TRAIL_OVERRIDE[k] || {});
  w.sndFile = GUN_SNDFILE[k] || null;
  w.feel = Object.assign(buildGunFeel(w, k), GUN_FEEL_OVERRIDE[k] || {});
}

// 分类（顺序按 GUN_GID_ORDER，keys 保持 WEAPON_KEYS 内的先后顺序）
const WEAPON_GROUPS = GUN_GID_ORDER.map(id => ({
  id,
  name: GROUP_META[id].name,
  color: GROUP_META[id].color,
  keys: WEAPON_KEYS.filter(k => WEAPONS[k].g === id),
}));
const WEAPON_GROUP_OF = {};
for (const g of WEAPON_GROUPS) for (const k of g.keys) WEAPON_GROUP_OF[k] = g;

// 武器键 → 背包槽位；槽位默认武器（兜底）
function slotOfWeapon(k) {
  const w = WEAPONS[k];
  if (!w) return null;
  for (const sid of WEAPON_GROUP_ORDER) if (SLOT_GROUPS[sid].indexOf(w.g) >= 0) return sid;
  return null;
}
function slotDefaultWeapon(sid) {
  for (const gid of SLOT_GROUPS[sid]) {
    const gr = WEAPON_GROUPS.find(x => x.id === gid);
    if (gr && gr.keys.length) return gr.keys[0];
  }
  return null;
}

// ---------- 配件系统（类似 CF 配件：瞄具 / 枪管 / 握把 / 枪口 / 激光） ----------
// 右键开镜（ADS）：无瞄具时默认机瞄 1.25 倍；装瞄具后按附件 zoom 放大并显示瞄准镜遮罩。
// 效果字段（乘法系数，缺省为 1）：zoom=开镜倍率；spreadMul=散布；recoilMul=后坐；
// bspeedMul=弹速；rangeMul=射程；volMul=枪声音量；flashMul=枪口闪光；adsSpeedMul=开镜速度；
// laser=红外线照射；hideTracer=隐藏弹道。
const ATTACH_SLOTS = {
  optics: { name: '瞄具',   color: '#26c6da', icon: '◎' },
  barrel: { name: '枪管',   color: '#90a4ae', icon: '‖' },
  under:  { name: '握把',   color: '#8d6e63', icon: '⌒' },
  muzzle: { name: '枪口',   color: '#ff7043', icon: '◍' },
  laser:  { name: '激光',   color: '#ef5350', icon: '·' },
  ammo:   { name: '弹药',   color: '#ffb300', icon: '◉' },
};
const ATTACH_META = {
  // 瞄具（光学）
  reddot:      { name: '红点镜',   slot: 'optics', color: '#ef5350', zoom: 1.5,  spreadMul: 0.92, desc: '开镜 1.5 倍 · 散布 -8%' },
  holographic: { name: '全息镜',   slot: 'optics', color: '#26c6da', zoom: 1.75, desc: '开镜 1.75 倍 · 视野开阔' },
  acog:        { name: 'ACOG',     slot: 'optics', color: '#ffb300', zoom: 2.5,  desc: '开镜 2.5 倍 · 中距离' },
  scope4x:     { name: '四倍镜',   slot: 'optics', color: '#7c4dff', zoom: 3.5,  desc: '开镜 3.5 倍 · 远距离' },
  scope8x:     { name: '八倍镜',   slot: 'optics', color: '#7c4dff', zoom: 5,    desc: '开镜 5 倍 · 狙击专用' },
  // 枪管
  longbarrel:  { name: '长枪管',   slot: 'barrel', color: '#90a4ae', spreadMul: 0.8, bspeedMul: 1.12, rangeMul: 1.15, desc: '射程 +15% · 弹速 +12% · 散布 -20%' },
  // 握把
  grip:        { name: '垂直握把', slot: 'under',  color: '#8d6e63', recoilMul: 0.78, spreadMul: 0.92, desc: '后坐 -22% · 散布 -8%' },
  angled:      { name: '直角握把', slot: 'under',  color: '#78909c', adsSpeedMul: 0.6, recoilMul: 0.85, desc: '开镜更快 · 后坐 -15%' },
  bipod:       { name: '两脚架',   slot: 'under',  color: '#546e7a', recoilMul: 0.62, spreadMul: 0.85, desc: '后坐 -38% · 散布 -15%' },
  // 枪口
  silencer:    { name: '消音器',   slot: 'muzzle', color: '#9e9e9e', volMul: 0.22, flashMul: 0.15, hideTracer: true, desc: '枪声 -78% · 隐藏枪口闪光与弹道' },
  comp:        { name: '补偿器',   slot: 'muzzle', color: '#ff7043', recoilMul: 0.72, desc: '后坐 -28%' },
  brake:       { name: '制退器',   slot: 'muzzle', color: '#ffb300', recoilMul: 0.62, desc: '后坐 -38%' },
  // 激光
  laser:       { name: '红外线',   slot: 'laser',  color: '#ff1744', spreadMul: 0.85, laser: true, desc: '红外线照射 · 散布 -15%' },
  flashlight:  { name: '战术手电', slot: 'laser',  color: '#fff59d', laser: true, flashlight: true, desc: '照亮瞄准方向' },
  // 弹药
  apammo:      { name: '穿甲弹',   slot: 'ammo',  color: '#8e24aa', pierce: 1, desc: '穿透 +1 目标' },
  tracerammo:  { name: '曳光弹',   slot: 'ammo',  color: '#ffd54f', trailBoost: 1.8, desc: '弹道更亮更长' },
  extmag:      { name: '扩容弹匣', slot: 'ammo',  color: '#fb8c00', magMul: 1.5, desc: '弹匣容量 +50%' },
  explammo:    { name: '爆破弹头', slot: 'ammo',  color: '#ff5722', explosive: 1, splash: 46, dmgMul: 0.85, desc: '命中爆炸（伤害 -15%）' },
  quickreload: { name: '快速换弹', slot: 'ammo',  color: '#26c6da', reloadMul: 0.75, desc: '换弹速度 +25%' },
};
// 各武器类别可装配件槽位（近战/投掷/拾取/英雄武器不可装配）
const ATTACH_DEFAULT_GROUPS = {
  assault: ['optics', 'barrel', 'under', 'muzzle', 'laser', 'ammo'],
  smg:     ['optics', 'under', 'muzzle', 'laser', 'ammo'],
  shotgun: ['under', 'muzzle', 'laser', 'ammo'],
  sniper:  ['optics', 'under', 'muzzle', 'laser', 'ammo'],
  lmg:     ['under', 'muzzle', 'laser', 'ammo'],
  pistol:  ['laser', 'muzzle', 'ammo'],
};
const ATTACH_OVERRIDES = {};   // 单枪覆盖（武器键 → 槽位数组），需要时可加
function attachSlotsForWeapon(k) {
  const w = WEAPONS[k];
  if (!w || w.melee || w.grenade || w.pickup || w.hero) return [];
  if (ATTACH_OVERRIDES[k]) return ATTACH_OVERRIDES[k];
  return ATTACH_DEFAULT_GROUPS[w.g] || [];
}
function attachFitsWeapon(k, slot) { return attachSlotsForWeapon(k).indexOf(slot) >= 0; }
function attachListForSlot(slot) { return Object.keys(ATTACH_META).filter(k => ATTACH_META[k].slot === slot); }
// 过滤出与武器匹配的配件键（非法/不适配/重复剔除）
function effectiveAttachments(weaponKey, attList) {
  const out = [];
  if (!Array.isArray(attList)) return out;
  for (const ak of attList) {
    const a = ATTACH_META[ak];
    if (a && attachFitsWeapon(weaponKey, a.slot) && out.indexOf(ak) < 0) out.push(ak);
  }
  return out;
}
// 把配件数组折叠为单一效果对象（供开火 / 渲染 / 开镜直接读取）
function aggregateAttachFx(attList) {
  const fx = {
    zoom: 1, spreadMul: 1, recoilMul: 1, bspeedMul: 1, rangeMul: 1,
    volMul: 1, flashMul: 1, adsSpeedMul: 1, magMul: 1, reloadMul: 1, trailBoost: 1,
    pierce: 0, splash: 0, dmgMul: 1,
    laser: false, flashlight: false, explosive: false,
    scope: false, optics: null, hideTracer: false,
  };
  for (const ak of attList) {
    const a = ATTACH_META[ak];
    if (!a) continue;
    if (a.zoom) fx.zoom *= a.zoom;
    if (a.spreadMul) fx.spreadMul *= a.spreadMul;
    if (a.recoilMul) fx.recoilMul *= a.recoilMul;
    if (a.bspeedMul) fx.bspeedMul *= a.bspeedMul;
    if (a.rangeMul) fx.rangeMul *= a.rangeMul;
    if (a.volMul) fx.volMul *= a.volMul;
    if (a.flashMul) fx.flashMul *= a.flashMul;
    if (a.adsSpeedMul) fx.adsSpeedMul *= a.adsSpeedMul;
    if (a.magMul) fx.magMul *= a.magMul;
    if (a.reloadMul) fx.reloadMul *= a.reloadMul;
    if (a.trailBoost) fx.trailBoost *= a.trailBoost;
    if (a.pierce) fx.pierce += a.pierce;
    if (a.dmgMul) fx.dmgMul *= a.dmgMul;
    if (a.splash) fx.splash = Math.max(fx.splash, a.splash);
    if (a.explosive) fx.explosive = true;
    if (a.laser) fx.laser = true;
    if (a.flashlight) fx.flashlight = true;
    if (a.hideTracer) fx.hideTracer = true;
    if (a.slot === 'optics') { fx.scope = true; fx.optics = ak; }
  }
  return fx;
}
// 背包槽位的配件配置存取（与 loadout 平级的 sibling 字段，loadout 保持 4 键不变）
function slotAttKey(gid) { return gid + 'Att'; }
function backpackAtts(bp, gid) {
  const arr = bp && bp.attachments && bp.attachments[gid];
  return Array.isArray(arr) ? arr : [];
}
function backpackAttsCopy(bp, gid) { return backpackAtts(bp, gid).slice(); }

// ---------- 人物装备（护甲 / 战术靴）：每个背包一套，出生即生效 ----------
const EQUIP_SLOTS = {
  armor: { name: '护甲', icon: '⬢' },
  boots: { name: '战术靴', icon: '⟳' },
};
const EQUIP_META = {
  light_armor: { name: '轻型护甲', slot: 'armor', color: '#b0bec5', dmgMul: 0.85, desc: '受伤 -15%' },
  heavy_armor: { name: '重型护甲', slot: 'armor', color: '#546e7a', dmgMul: 0.70, desc: '受伤 -30%' },
  jump_boots:  { name: '跳跃增强', slot: 'boots', color: '#ffb300', jumpMul: 1.25, speedMul: 1.06, desc: '跳跃 +25% · 移速 +6%' },
};
const EQUIP_KEYS = Object.keys(EQUIP_META);
function equipListForSlot(slot) { return EQUIP_KEYS.filter(k => EQUIP_META[k].slot === slot); }
// 把装备对象聚合为单一效果（数值相乘；键值 = 装备 id，值归属其所在槽位）
function aggregateEquipFx(equip) {
  const fx = { dmgMul: 1, jumpMul: 1, speedMul: 1 };
  if (!equip) return fx;
  for (const slot of Object.keys(equip)) {
    const id = equip[slot];
    if (!id || !EQUIP_META[id]) continue;
    const e = EQUIP_META[id];
    if (e.slot !== slot) continue;
    if (e.dmgMul) fx.dmgMul *= e.dmgMul;
    if (e.jumpMul) fx.jumpMul *= e.jumpMul;
    if (e.speedMul) fx.speedMul *= e.speedMul;
  }
  return fx;
}

// ---------- 生化背包（1-8 号：每背包 4 个槽位：主武器/副武器/近战/投掷） ----------
// 追击专用背包：弹药补给点 E 切换（3 秒 CD）；角色属性：B 键全图切换（30 秒 CD）
const BACKPACKS = [
  { name: '标配突击', loadout: { primary:'m4a1',    secondary:'usp',      melee:'knife',       throw:'grenade' },
    attachments: { primary:['reddot','grip','comp'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: null, boots: null } },
  { name: '重装攻坚', loadout: { primary:'aa12',    secondary:'deagle',   melee:'wrench',      throw:'hegrenade' },
    attachments: { primary:['laser','grip'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: 'heavy_armor', boots: null } },
  { name: '精准狙击', loadout: { primary:'awm',     secondary:'rex',      melee:'mysticknife', throw:'smoke' },
    attachments: { primary:['scope8x','bipod','brake'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: null, boots: null } },
  { name: '疾风冲锋', loadout: { primary:'vector',  secondary:'glock18',  melee:'springknife', throw:'flashbang' },
    attachments: { primary:['holographic','angled','comp'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: null, boots: 'jump_boots' } },
  { name: '霰弹清道', loadout: { primary:'m1216',   secondary:'m1911',    melee:'spade',       throw:'firegrenade' },
    attachments: { primary:['laser'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: 'light_armor', boots: null } },
  { name: '火力压制', loadout: { primary:'gatling', secondary:'cop357',   melee:'hachet',      throw:'impact' },
    attachments: { primary:['bipod','comp'], secondary:[], melee:[], throw:[] }, equip: { armor: 'heavy_armor', boots: null } },
  { name: '渗透突袭', loadout: { primary:'p90',     secondary:'p228',     melee:'butterfly',   throw:'gasgrenade' },
    attachments: { primary:['reddot','silencer','laser'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: null, boots: 'jump_boots' } },
  { name: '全能战术', loadout: { primary:'qbz191',  secondary:'anaconda', melee:'tangdao',     throw:'healgrenade' },
    attachments: { primary:['acog','grip'], secondary:['laser'], melee:[], throw:[] }, equip: { armor: 'light_armor', boots: null } },
];

// AI 队友只使用常规枪械（排除近战 / 投掷 / 拾取 / 英雄武器）
const GUN_KEYS = WEAPON_KEYS.filter(k => {
  const w = WEAPONS[k];
  return !w.melee && !w.grenade && !w.pickup && !w.hero;
});

// ---------- 幽灵 Buff（紫色水晶获取：1 被动 + 1 主动，Q 释放主动） ----------
const BUFF_TYPES = {
  speed:  { name:'迅捷之靴', rarity:'common', passive:true,  desc:'移速 +30%' },
  armor:  { name:'护体装甲', rarity:'common', passive:true,  desc:'受伤 -30%' },
  regen:  { name:'自愈因子', rarity:'common', passive:true,  desc:'每秒回血 8' },
  unstop: { name:'无畏意志', rarity:'rare',   passive:true,  desc:'免疫击退僵直' },
  term:   { name:'终结者',   rarity:'rare',   active:true, cd:15, dur:12, desc:'主动：变身终结者 12 秒' },
  dash:   { name:'飞身强击', rarity:'rare',   active:true, cd:6,  desc:'主动：向前飞扑猛击' },
  invis:  { name:'隐身术',   rarity:'rare',   active:true, cd:18, dur:6,  desc:'主动：隐身 6 秒（人类无法锁定你）' },
};
const BUFF_KEYS = Object.keys(BUFF_TYPES);
const RARE_BUFF_KEYS = BUFF_KEYS.filter(k => BUFF_TYPES[k].rarity === 'rare');
const COMMON_BUFF_KEYS = BUFF_KEYS.filter(k => BUFF_TYPES[k].rarity === 'common');

// ---------- 英雄变身（能量胶囊攒满触发） ----------
const HERO_TYPES = {
  light: { name:'光能救世主', color:'#fff59d', weapon:'hero_light', hp:260, dur:25 },
  xuan:  { name:'玄月射手',   color:'#ce93d8', weapon:'hero_xuan',  hp:230, dur:22 },
};

// ---------- 机关类型 ----------
const MECH_TYPES = {
  door:     { name:'可破坏门',   breakable:true },
  bridge:   { name:'断桥',       humanE:true },
  trap:     { name:'伤害陷阱' },
  wind:     { name:'气流风场' },
  platform: { name:'移动平台' },
  beam:     { name:'传送光线' },
  rope:     { name:'滑索',       humanE:true },
  lift:     { name:'升降台' },
  shortcut: { name:'幽灵近路' },
  void:     { name:'猩红女巫虚空门', ghostE:true },
  turret:   { name:'自动炮台' },
  heal:     { name:'人类治疗站' },
  booster:  { name:'加速带' },
};

// 僵尸种类：小僵尸 / 疾行 / 自爆 / 小母体 / 原初母体 / 泰坦母体 / 猩红母皇，血量与技能各不相同
const ZOMBIES = {
  normal:   { name:'小僵尸',   hp:100,  dmg:18, speed:140, w:20, h:38, color:'#4caf50',   skill:'none',  meleeCd:1.0,  knock:60 },
  sprinter: { name:'疾行僵尸', hp:70,   dmg:12, speed:240, w:18, h:36, color:'#00bcd4',   skill:'dash',  dashCd:4.0, dashSpeed:500, dashDur:0.40, meleeCd:0.9, knock:80 },
  boomer:   { name:'自爆僵尸', hp:100,  dmg:32, speed:112, w:30, h:40, color:'#ff5722',   skill:'boom',  boomRadius:68, meleeCd:1.1, knock:52 },
  // 小母体：被大母体抓到的幸存者变异而来（血厚、近战凶）
  mother_mini: { name:'小母体', hp:8000, dmg:32, speed:120, w:30, h:48, color:'#8d6e63',   skill:'none',  meleeCd:0.9, knock:80 },
  // 大母体：开局随机变异 / 关卡刷新，血量高、技能多样（slam=跳跃猛击 summon=召唤小僵尸 aura=光环强化）
  mother:      { name:'原初母体', hp:16000, dmg:36, speed:100, w:50, h:72, color:'#4e342e',   skill:'slam',        slamRadius:90,  slamCd:6.0,  meleeCd:0.95, knock:100 },
  mother_titan:{ name:'泰坦母体', hp:20000, dmg:44, speed:86,  w:62, h:86, color:'#7f1d1d',   skill:'slam+summon', slamRadius:125, slamCd:5.5,  summonCd:10, summonCount:3, meleeCd:0.95, knock:125 },
  mother_queen:{ name:'猩红母皇', hp:18000, dmg:36, speed:96,  w:54, h:78, color:'#6a1b9a',   skill:'summon+aura', summonCd:8,  summonCount:2, auraRadius:210, auraHp:60, auraDmg:1.15, meleeCd:0.95, knock:105 },
};
const BIG_MOTHERS = ['mother', 'mother_titan', 'mother_queen'];   // 开局变异的大母体类型池
const ZOMBIE_KEYS = ['normal','normal','normal','sprinter','boomer']; // 初始小僵尸随机池
// 是否母体系（大母体或小母体）：母系被击杀/变身/复活走母体专属逻辑
function isMotherType(zt) { return (zt || '').indexOf('mother') === 0; }

// 房间人数档位（上限 30）
const ROOM_SIZES = [8, 16, 24, 30];

// 命中特效 / 屏幕震动
const FX = { shakeMag: 0, shakeT: 0 };

// 攻防干员原型（战术攻防专用）：team 阵营 / skill 主动技 / passive 被动描述
const SIEGE_ROLES = {
  breacher: { team: 'ATK', name: '突破手 Breacher', desc: '爆破弹：投掷高爆弹破坏加固墙 / 破门', skill: '爆破弹', cooldown: 20, passive: '—' },
  scout:    { team: 'ATK', name: '侦察 Scout',      desc: '标记：高亮最近守方 3s（透视）', skill: '标记目标', cooldown: 12, passive: '移动 +10%' },
  anchor:   { team: 'DEF', name: '锚点 Anchor',     desc: '重装防守：生命上限 +30', skill: '—', passive: '生命 +30 · 免疫减速' },
  trapper:  { team: 'DEF', name: '陷阱师 Trapper',  desc: '布防专家：绊线雷更强更多', skill: '—', passive: '绊线雷配额 +1 · 雷伤 40→55' },
};
