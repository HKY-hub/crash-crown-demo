// ============ 美术地基 A/B：统一视觉规范 + WeaponArt 逐 ID 注册表 + 锚点权威源 ============
// 第 1 阶段（规范与尺度）与第 2 阶段（注册表与锚点）中，第 3 阶段动作系统必须依赖的那部分。
//
// 设计约束：
// 1) 枪口只有一个权威来源 ArtCore.muzzleWorld()；人物枪线高度由 entityFireY() 给出，
//    枪口、火光、弹体共用该高度，随 62px 人物外观和低梁姿态一起移动。
// 2) 枪体按枪口反推放置（muzzle-anchored）：先有权威枪口，再由档案里的 grip/barrel 长度反算
//    握把与机匣位置。因此任何档案加长枪管，枪口都不会跑掉。
// 3) 注册表以 WEAPONS 的真实 ID 为键；缺项**必须报警**并标记 legacy，不允许静默当成"已完成"。
// 4) 本文件不含任何逐件最终造型：88 条档案的 silhouette/art 目前全部为 null（旧版兼容），
//    由第 5/6 阶段的单件提示词逐条填写。

const ART_SPEC = {
  // 统一标尺的唯一来源：1 布局单位 = 1 设备像素 = 29.4mm 真实长度。
  // 由 m4a1 定版时反推（30.6 单位 ↔ 900mm）。任何"把单位换算成毫米"的判断都必须现读这个数，
  // 不许在闸门里再抄一遍 —— 第 8 阶段的 _s8_item 抄的是 28，全轨换成 29.4 之后它就一直偏 5%。
  mmPerUnit: 29.4,
  // ---------- 人物规范比（用户 2026-10-01 定的两个基准数） ----------
  // 人物可见身高 62px 的**唯一来源是 `CFG.HUMAN_VISUAL_H`**，这里刻意不复制一份 ——
  // 两个来源迟早会漂（第 14 批 fireOrigin 那次就是活例子）。
  figure: {
    zombieVisualMaxH: 70,      // 僵尸最大可见身高（原初母体/泰坦这一档）
    // 这三个数是一根绳上的：1 单位 = 29.4mm ⇒ 62px 的人 = 1823mm、70px 的僵尸 = 2058mm。
    // 也就是说"统一毫米标尺"和"人物 62px"不是两条独立规定，而是同一条的两面：
    // 改了 mmPerUnit 就等于改了士兵的身高，改了 HUMAN_VISUAL_H 就等于改了枪的毫米数。
    // 由 _prop_probe.js 逐件量：枪的实绘长宽都不许超过 62（人），且不得超过 len + 2 的描边容差。
  },
  grid: 1,                       // 一切形状落在 1 逻辑像素网格上（px() 取整）
  outline: '#0a0a0a',            // 1px 硬描边（外圈）
  lightDir: [-1, -1],            // 受光方向：左上；高光在左上，暗部在右下
  palette: PX,                   // js/pixel.js 的统一调色板
  // 三档尺度：战斗尺度只要求 2-3 个轮廓特征，检视尺度才画机件
  scales: {
    // 区间按"布局长度"（= 档案 layout.len，不含 paint 第一遍那 1px 描边外皮）计。
    // 2026-09-30 由 [18,34] 放宽到 [18,40]：原上限 34 是第 1 阶段按"狙击一律 30px"的旧实测写的，
    // 而本轨改用统一标尺 1 单位 = 29.4mm 按真实全长建模，栓动/半自动狙击（1107~1180mm）
    // 与 GALIL（1128mm）必然落在 36~40。用户核对 9 把踩线清单后确认放宽上限。
    // 2026-09-30 再由 [18,40] 放宽到 [18,44]：刘易斯轻机枪公开全长 1295mm ⇒ 44.0 单位。
    //   当时给过三条路（压到 40 / 抬上限 / 挂例外），用户选抬上限。
    //   连带后果：**mg3 此前被压到 40 的唯一理由就是这条上限**，上限抬起来之后它已回到真实 43.1；
    //   本轨现在只剩 p90 一处长度妥协（17.0→18，那是**下限**造成的，与本次改动无关）。
    //   注意屏幕上界：44 单位 + 描边外皮 2px = 实际最多占 46px，而人物碰撞体只有 22×36px。
    combat:  { unitPx: 1, gunLenRange: [18, 44], detail: 'silhouette', note: '正常镜头，人物 36px 高' },
    pickup:  { unitPx: 1, gunLenRange: [22, 40], detail: 'silhouette+1feature', note: '地面拾取与 HUD 简化视图' },
    inspect: { unitPx: 2, gunLenRange: [120, 240], detail: 'mechanism', note: '仓库/检视尺度，画机件与磨损' },
  },
  materials: {
    metal:   { base: '#39424e', hi: '#5a6a7a', lo: '#2c3640', edge: '#6d7f92' },
    steel:   { base: '#4b5866', hi: '#71829a', lo: '#333d49', edge: '#8ba0b8' },
    brass:   { base: '#e8c060', hi: '#ffe9a8', lo: '#a8863a', edge: '#fff3c4' },
    wood:    { base: '#8a5a2a', hi: '#a9743d', lo: '#5f3a1c', edge: '#c08a4e' },
    polymer: { base: '#2f3a34', hi: '#46564c', lo: '#1d251f', edge: '#5c7062' },
    fabric:  { base: '#4d6fe0', hi: '#6a86e8', lo: '#22315e', edge: '#8ea6f0' },
    glass:   { base: '#1b2b3a', hi: '#4a7f9e', lo: '#0d161f', edge: '#9fd8ef' },
    energy:  { base: '#e53935', hi: '#ff8a80', lo: '#8e1b18', edge: '#ffd5d2' },
  },
};

// ---------- 机制档案：决定"这一类机构在时间上做什么"，不决定外观 ----------
// cycle   ：枪机循环类型（决定套筒/枪机部件的运动方式）
// shell   ：抛壳适用性（第 3 阶段抛壳策略的唯一依据）
// reload  ：供弹路径（弹匣/弹鼓/弹链/管式弹仓/弹巢/膛口单发）
// hands   ：几个手、第二只手抓哪里
// stages  ：该机制可用的动作阶段名（时间轴播放器的白名单）
const MECH_KINDS = {
  'ar-direct':      { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'ar-longstroke':  { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'ar-shortstroke': { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'ar-carbine':     { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'ar-bullpup':     { cycle: 'ar',      shell: 'on-cycle',      reload: 'bullpup-mag', hands: 2, foregrip: true },
  'bullpup':        { cycle: 'bullpup', shell: 'on-cycle',      reload: 'bullpup-mag', hands: 2, foregrip: true },
  'bullpup-burst':  { cycle: 'bullpup', shell: 'on-cycle',      reload: 'bullpup-mag', hands: 2, foregrip: true, burst: true },
  'bolt-sniper':    { cycle: 'bolt',    shell: 'on-bolt',       reload: 'box-mag',   hands: 2, foregrip: true, boltCycle: true },
  'bolt-sniper-wood': { cycle: 'bolt',  shell: 'on-bolt',       reload: 'stripper',  hands: 2, foregrip: true, boltCycle: true },
  'sr-carbine':     { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'semi-dmr':       { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'smg-blowback':   { cycle: 'blowback', shell: 'on-cycle',     reload: 'box-mag',   hands: 2, foregrip: false },
  'smg-blowback-telescop': { cycle: 'blowback', shell: 'on-cycle', reload: 'box-mag', hands: 1, foregrip: false },
  'smg-roller':     { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: false },
  'smg-openbolt':   { cycle: 'openbolt', shell: 'on-cycle',     reload: 'box-mag',   hands: 1, foregrip: false },
  'smg-drum':       { cycle: 'blowback', shell: 'on-cycle',     reload: 'drum',      hands: 2, foregrip: false },
  'smg-carbine':    { cycle: 'blowback', shell: 'on-cycle',     reload: 'box-mag',   hands: 2, foregrip: true },
  'bullpup-smg':    { cycle: 'bullpup', shell: 'on-cycle',      reload: 'bullpup-mag', hands: 2, foregrip: false },
  'bullpup-topmag': { cycle: 'bullpup', shell: 'on-cycle',      reload: 'top-mag',   hands: 2, foregrip: false },
  'dual-smg':       { cycle: 'blowback', shell: 'on-cycle',     reload: 'box-mag',   hands: 2, dual: true, foregrip: false },
  'pump':           { cycle: 'pump',    shell: 'on-pump',       reload: 'tubular',   hands: 2, foregrip: true, pumpCycle: true },
  'semi':           { cycle: 'ar',      shell: 'on-cycle',      reload: 'box-mag',   hands: 2, foregrip: true },
  'semi-drum':      { cycle: 'ar',      shell: 'on-cycle',      reload: 'drum',      hands: 2, foregrip: true },
  'auto-drum':      { cycle: 'ar',      shell: 'on-cycle',      reload: 'drum',      hands: 2, foregrip: true },
  'double-barrel':  { cycle: 'break',   shell: 'on-break',      reload: 'break-load', hands: 2, foregrip: false, breakAction: true },
  'lmg-belt':       { cycle: 'ar',      shell: 'on-cycle',      reload: 'belt',      hands: 2, foregrip: true, beltFeed: true },
  'lmg-drum':       { cycle: 'ar',      shell: 'on-cycle',      reload: 'drum',      hands: 2, foregrip: true },
  'lmg-drum-wood':  { cycle: 'ar',      shell: 'on-cycle',      reload: 'drum',      hands: 2, foregrip: true },
  'lmg-pan-top':    { cycle: 'ar',      shell: 'on-cycle',      reload: 'pan-top',   hands: 2, foregrip: true },
  'lmg-rotary':     { cycle: 'rotary',  shell: 'on-cycle',      reload: 'belt',      hands: 2, foregrip: true, rotary: true, windup: true },
  'pistol-semi':    { cycle: 'slide',   shell: 'on-cycle',      reload: 'box-mag',   hands: 1, foregrip: false },
  'pistol-auto':    { cycle: 'slide',   shell: 'on-cycle',      reload: 'box-mag',   hands: 1, foregrip: false },
  'pistol-comp':    { cycle: 'slide',   shell: 'on-cycle',      reload: 'box-mag',   hands: 1, foregrip: false },
  'pistol-magnum':  { cycle: 'slide',   shell: 'on-cycle',      reload: 'box-mag',   hands: 1, foregrip: false },
  'pistol-1911':    { cycle: 'slide',   shell: 'on-cycle',      reload: 'box-mag',   hands: 1, foregrip: false },
  'pistol-derringer': { cycle: 'slide', shell: 'on-cycle',      reload: 'box-mag',   hands: 1, foregrip: false },
  'revolver':       { cycle: 'revolver', shell: 'on-reload',    reload: 'cylinder',  hands: 1, foregrip: false, cylinder: true },
  'blade':          { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true },
  'blade-recurve':  { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true },
  'blade-long':     { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true },
  'blade-sword':    { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 2, melee: true },
  'blade-assist':   { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true },
  'blade-balison':  { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true, flourish: true },
  'blade-fantasy':  { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 2, melee: true },
  'axe':            { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 2, melee: true },
  'tool-edge':      { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 2, melee: true },
  'tool-blunt':     { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true },
  'claw':           { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, melee: true },
  'frag':           { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: true },
  'frag-heavy':     { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: true },
  'canister':       { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: true },
  'canister-bio':   { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: true },
  'canister-incendiary': { cycle: 'none', shell: 'none',        reload: 'none',      hands: 1, thrown: true, pin: true, igniter: true },
  'canister-med':   { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: true },
  'canister-cryo':  { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: true },
  'fuse-impact':    { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: false, impactFuse: true },
  'launcher-reusable': { cycle: 'recoil', shell: 'on-cycle',    reload: 'muzzle-load', hands: 2, foregrip: true, rocket: true },
  'launcher-breakaction': { cycle: 'break', shell: 'on-break',  reload: 'break-load', hands: 2, foregrip: true, breakAction: true },
  'energy':         { cycle: 'energy',  shell: 'none',          reload: 'cell',      hands: 2, foregrip: true, energy: true },
  'flame':          { cycle: 'flame',   shell: 'none',          reload: 'tank',      hands: 2, foregrip: true, flame: true, pilot: true },
  'injector':       { cycle: 'none',    shell: 'none',          reload: 'none',      hands: 1, thrown: true, pin: false, injector: true },
  'energy-hero':    { cycle: 'energy',  shell: 'none',          reload: 'none',      hands: 2, foregrip: true, energy: true, hero: true },
  'bow-hero':       { cycle: 'draw',    shell: 'none',          reload: 'none',      hands: 2, foregrip: false, draw: true, hero: true },
  'environment-shell': { cycle: 'none', shell: 'none',          reload: 'none',      hands: 0, internal: true },
};

// ---------- 逐 ID 注册表 ----------
const WeaponArt = (() => {
  const REG = {};                 // key -> 档案
  const legacyUsed = new Set();   // 走旧版兼容的 ID（供工位/CI 报警）
  const MECH = {};                // key -> 机制分类（第 0 阶段人工核对结果）

  // 机制分类：第 0 阶段审计时逐条核对现实型号后固定下来
  Object.assign(MECH, {
    m4a1: 'ar-direct', ak47: 'ar-longstroke-wood', ak103: 'ar-longstroke-poly', scar: 'ar-shortstroke',
    aug: 'bullpup', sg552: 'ar-carbine', galil: 'ar-longstroke', ac556: 'ar-bullpup', type81: 'ar-longstroke-wood',
    qbz191: 'ar-shortstroke', qbz95: 'bullpup', g36: 'bullpup', famas: 'bullpup-burst', hk416: 'ar-direct',
    qcq171: 'bullpup',
    awm: 'bolt-sniper', m24: 'bolt-sniper', m1903: 'bolt-sniper-wood', vsk94: 'sr-carbine', svd: 'semi-dmr',
    m14ebr: 'semi-dmr', sr25: 'semi-dmr', mk12: 'semi-dmr', qbu09: 'semi-dmr', scarssr: 'semi-dmr',
    vector: 'smg-blowback', thompson: 'smg-drum', uzi: 'smg-blowback-telescop', ump45: 'smg-roller',
    p90: 'bullpup-topmag', evo3: 'smg-carbine', ppbizon: 'smg-drum', cf05: 'bullpup-smg', mac10: 'smg-openbolt',
    duals: 'dual-smg',
    m1014: 'pump', m1216: 'semi-drum', aa12: 'auto-drum', ithaca37: 'pump', steam: 'pump', s12k: 'semi',
    qba211: 'semi', dbbl: 'double-barrel',
    m60: 'lmg-belt', m249: 'lmg-belt', mg3: 'lmg-belt', lewis: 'lmg-pan-top', rpk: 'lmg-drum-wood',
    gatling: 'lmg-rotary', ultimax: 'lmg-drum',
    usp: 'pistol-semi', deagle: 'pistol-magnum', p228: 'pistol-comp', glock18: 'pistol-auto', m1911: 'pistol-1911',
    rex: 'revolver', cop357: 'pistol-derringer', anaconda: 'revolver',
    knife: 'blade', hachet: 'axe', kukri: 'blade-recurve', machete: 'blade-long', spade: 'tool-edge',
    claw: 'claw', tangdao: 'blade-sword', springknife: 'blade-assist', butterfly: 'blade-balison',
    wrench: 'tool-blunt', mysticknife: 'blade-fantasy',
    grenade: 'frag', hegrenade: 'frag-heavy', flashbang: 'canister', smoke: 'canister', gasgrenade: 'canister-bio',
    impact: 'fuse-impact', firegrenade: 'canister-incendiary', healgrenade: 'canister-med', freezegrenade: 'canister-cryo',
    rpg7: 'launcher-reusable', gl: 'launcher-breakaction', laser: 'energy', flamer: 'flame', xuanyuan: 'blade-fantasy',
    shock: 'canister', adrenaline: 'injector',
    hero_light: 'energy-hero', hero_xuan: 'bow-hero', turret_shot: 'environment-shell',
  });

  // 战斗尺度下的默认锚点布局（枪口反推）：单位 = 逻辑像素，+x 朝枪口，+y 向下（未翻转）
  // 这些是"结构占位"，不是最终造型；第 5/6 阶段逐件覆盖。
  // 枪长沿用第 0 阶段实测的 ui.js:gunSpriteLen 分档（此处独立实现，避免依赖 ui.js 的私有函数；
  // 两者不一致时由 tools/art-audit/_s3_events.js 的回归断言报警）。
  const LEGACY_LEN = { sniper: 30, pistol: 18, melee: 22, throw: 16, pickup: 26 };
  function legacyLen(w) {
    return LEGACY_LEN[w.g] != null ? LEGACY_LEN[w.g] : 24;
  }
  function defaultLayout(key) {
    const w = WEAPONS[key] || {};
    const g = w.g;
    const L = legacyLen(w);
    const bull = /bullpup/.test(MECH[key] || '');
    const pistol = g === 'pistol';
    const melee = !!w.melee, thrown = !!w.grenade;
    if (thrown) return { len: 16, grip: [0, 1], muzzle: [14, -1], eject: null, mag: null, fore: null, stock: [-4, 1], sight: null };
    if (melee) return { len: L, grip: [-3, 1], muzzle: [L - 3, -1], eject: null, mag: null, fore: null, stock: null, sight: null };
    return {
      len: L,
      grip: pistol ? [-3, 4] : [-5, 3],
      muzzle: [L - 2, -1],
      eject: [Math.max(2, L * 0.34), -4],                 // 机匣右上（抛壳口）
      mag: [Math.max(2, L * 0.42), 2],                    // 弹匣井
      magBase: [Math.max(2, L * 0.42), bull ? 9 : (L > 26 ? 12 : 10)],
      fore: pistol ? null : [L * 0.62, 3],                // 第二只手（前握把/护木）
      stock: pistol ? null : (bull ? [-7, 1] : [-9, 0]),
      sight: (g === 'sniper') ? [L * 0.3, -7] : [L * 0.34, -5],
      drum: /drum|belt|pan/.test(MECH[key] || '') ? true : null,
    };
  }

  function makeLegacy(key) {
    const w = WEAPONS[key] || {};
    const mech = MECH_KINDS[MECH[key]] || MECH_KINDS['ar-direct'];
    return {
      key, ver: 'legacy-0',
      legacy: true,                       // 明确标记：造型未验收
      mech: MECH[key] || 'ar-direct',
      mechDef: mech,
      scale: { combat: 1, inspect: 3 },
      layout: defaultLayout(key),
      silhouette: null,                   // 第 5/6 阶段填写
      features: [],                       // 战斗尺度下用于辨认的 2-3 个轮廓特征
      mats: { body: 'metal', furniture: 'polymer', barrel: 'steel' },
      shell: mech.shell,
      reloadPath: mech.reload,
      fireTimeline: null,                 // null → 用 MECH 的默认时间轴
      reloadTimeline: null,
      attachments: [],
    };
  }

  function ensure() {
    const keys = (typeof WEAPON_KEYS !== 'undefined') ? WEAPON_KEYS : [];
    for (const k of keys) if (!REG[k]) { REG[k] = makeLegacy(k); legacyUsed.add(k); }
    return keys.length;
  }

  function get(key) {
    let a = REG[key];
    if (!a) {
      if (WEAPONS && WEAPONS[key]) { a = REG[key] = makeLegacy(key); legacyUsed.add(key); }
      else return null;
    }
    return a;
  }

  // 第 5/6 阶段用：登记真正的造型档案（覆盖 legacy）
  function define(key, def) {
    if (!WEAPONS || !WEAPONS[key]) { console.error('[WeaponArt] 未定义的武器 ID：' + key); return false; }
    const base = makeLegacy(key);
    REG[key] = Object.assign({}, base, def, { legacy: false, ver: def.ver || 'v1' });
    if (REG[key].mechDef) REG[key].shell = REG[key].shell || REG[key].mechDef.shell;
    legacyUsed.delete(key);
    return true;
  }

  function report() {
    const all = (typeof WEAPON_KEYS !== 'undefined') ? WEAPON_KEYS : [];
    return { total: all.length, defined: all.length - legacyUsed.size, legacy: legacyUsed.size, legacyIds: Array.from(legacyUsed) };
  }

  // ---------- 锚点权威源 ----------
  // 实体发射线原点：与真正弹体出生高度共用 entityFireY。
  function fireOrigin(e) {
    const w = e.w || 22, h = e.h || 36;
    return { x: e.x + w / 2, y: entityFireY(e), hw: w / 2 + 8, h };
  }
  // 权威枪口（世界坐标）。angle 省略时取 e.aim。
  function muzzleWorld(e, angle) {
    const o = fireOrigin(e);
    const a = (angle == null ? e.aim : angle) || 0;
    return { x: o.x + Math.cos(a) * o.hw, y: o.y + Math.sin(a) * o.hw, a };
  }
  // 把档案里的枪体局部锚点换算到世界：枪口固定，枪体按 aim 旋转、按 facing 翻转 y 侧。
  // 第 7 阶段新增可选参数 sw＝{rot, lunge}：近战/投掷的整件旋转与出手位移。
  // 为什么放在这里：手（arms）、刃（silhouette）、刃尖轨迹必须绕同一个支点转，
  // 若在绘制端各算各的，挥砍时手与刀就会脱开。支点是档案 emit.swing.pivot（局部坐标）。
  function anchorsWorld(e, key, angle, sw) {
    const art = get(key || e.weapon);
    if (!art) return null;
    const a = (angle == null ? e.aim : angle) || 0;
    const m = muzzleWorld(e, a);
    const lay = art.layout;
    const face = e.facing >= 0 ? 1 : -1;
    const ca = Math.cos(a), sa = Math.sin(a);
    // 局部 → 世界：先按 facing 翻 x（枪口始终指向瞄准方向，故用瞄准角承担朝向），
    // 再镜像 y（左手持枪时抛壳口在另一侧）
    function P(p) {
      if (!p) return null;
      const lx = p[0] - lay.muzzle[0], ly = (p[1] - lay.muzzle[1]) * face;
      return { x: m.x + lx * ca - ly * sa, y: m.y + lx * sa + ly * ca };
    }
    const rot = sw && sw.rot ? sw.rot : 0, lung = sw && sw.lunge ? sw.lunge : 0;
    const pv = rot ? P((art.emit && art.emit.swing && art.emit.swing.pivot) || lay.grip) : null;
    function T(p) {
      const q = P(p);
      if (!q || !pv) return q;
      const dx = q.x - pv.x, dy = q.y - pv.y;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      return { x: pv.x + dx * cr - dy * sr + ca * lung, y: pv.y + dx * sr + dy * cr + sa * lung };
    }
    return {
      art, muzzle: T(lay.muzzle), angle: a, facing: face, rot, pivot: pv,
      grip: T(lay.grip), fore: T(lay.fore), eject: T(lay.eject), mag: T(lay.mag),
      magBase: T(lay.magBase), stock: T(lay.stock), sight: T(lay.sight),
      local: T,
    };
  }

  ensure();
  return { ensure, get, define, report, anchorsWorld, muzzleWorld, fireOrigin, MECH, MECH_KINDS };
})();

// ---------- 视觉规范落地：给绘制端复用的最小笔触集 ----------
const ArtPen = (() => {
  function pen(ctx, mats) {
    return {
      ctx,
      mat(name) { return (mats && mats[name]) || ART_SPEC.materials[name] || ART_SPEC.materials.metal; },
      // 一条水平部件：主体 + 上高光 + 下暗部 + 1px 外描边
      bar(x, y, w, h, mat) {
        const m = this.mat(mat);
        ctx.fillStyle = ART_SPEC.outline; pxRect(ctx, x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = m.base; pxRect(ctx, x, y, w, h);
        ctx.fillStyle = m.hi; pxRect(ctx, x, y, w, 1);
        ctx.fillStyle = m.lo; pxRect(ctx, x, y + h - 1, w, 1);
      },
      block(x, y, w, h, mat) {
        const m = this.mat(mat);
        ctx.fillStyle = ART_SPEC.outline; pxRect(ctx, x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = m.base; pxRect(ctx, x, y, w, h);
        ctx.fillStyle = m.hi; pxRect(ctx, x, y, 1, h);
        ctx.fillStyle = m.lo; pxRect(ctx, x + w - 1, y, 1, h);
      },
      dot(x, y, r, col) { ctx.fillStyle = col; pxCircle(ctx, x, y, r); },
    };
  }
  return { pen };
})();

if (typeof window !== 'undefined') {
  window.ART_SPEC = ART_SPEC; window.WeaponArt = WeaponArt; window.ArtPen = ArtPen;
}
