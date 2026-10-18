// ============ 实体工厂：人类 / 僵尸 / 子弹 / 粒子 ============
let _uid = 1;
function uid() { return _uid++; }

// 人体碰撞仍用 22x36；有低梁时改用下蹲帧，避免放大的贴图穿过实体天花板。
function humanVisualHeight(e) {
  if (!e || e.kind !== 'human' || e.hero) return e ? e.h : 0;
  const full = CFG.HUMAN_VISUAL_H;
  if (typeof level === 'undefined' || !level || !level.solids) return full;
  const cache = e._visualHeightCache;
  if (cache && cache.x === e.x && cache.y === e.y && cache.solids === level.solids
    && cache.count === level.solids.length) return cache.height;
  const feet = e.y + e.h, cx = e.x + e.w / 2;
  const half = Math.max(e.w / 2, 15);
  let clearance = full + 3;
  for (const s of level.solids) {
    if (s.oneway || s.y + s.h > e.y + 1 || s.y >= feet) continue;
    if (cx - half < s.x + s.w && cx + half > s.x)
      clearance = Math.min(clearance, feet - s.y - s.h);
  }
  const height = Math.max(e.h, Math.min(full, clearance - 3));
  e._visualHeightCache = { x: e.x, y: e.y, solids: level.solids, count: level.solids.length, height };
  return height;
}

function entityFireY(e) {
  return e.kind === 'human' && !e.hero
    ? e.y + e.h - humanVisualHeight(e) * 0.52
    : e.y + e.h * 0.42;
}

function entityHurtBox(e) {
  if (e.kind !== 'human' || e.hero) return { x: e.x, y: e.y, w: e.w, h: e.h };
  const h = humanVisualHeight(e);
  const w = Math.max(e.w, Math.min(34, h * 0.54));
  return { x: e.x + (e.w - w) / 2, y: e.y + e.h - h, w, h };
}

// 人类（玩家或 AI 队友）
function makeHuman({ x, y, isPlayer, weapon, name, team, operatorSkin }) {
  const humanId = uid();
  const skin = typeof OperatorSkins !== 'undefined'
    ? OperatorSkins.normalize(operatorSkin || (isPlayer
      ? OperatorSkins.selected()
      : OperatorSkins.ids[(humanId - 1) % OperatorSkins.ids.length]))
    : 'vanguard';
  const w = WEAPONS[weapon];
  const arsenal = {};
  for (const k of WEAPON_KEYS) {
    const wk = WEAPONS[k];
    // 投掷武器用 count 计数，近战/枪械用 mag（近战弹匣无限）
    arsenal[k] = wk.grenade ? { count: wk.count } : { mag: wk.melee ? Infinity : wk.mag };
  }
  const h = {
    id: humanId, kind: 'human', faction: 'human', team: team != null ? team : null,
    x, y, w: 22, h: 36, vx: 0, vy: 0, onGround: false, facing: 1, animT: Math.random() * 10,
    hp: CFG.HUMAN_HP || 100, maxHp: CFG.HUMAN_HP || 100, dead: false,
    isPlayer: !!isPlayer, name: name || '幸存者', operatorSkin: skin,
    weapon, arsenal, groupSel: {},
    // 生化背包：当前 1-8 号；backpackCd=补给点 E 切换冷却(3s)；attribCd=B 键属性切换冷却(30s)
    backpackIdx: 0, backpackCd: 0, attribCd: 0,
    mag: w.grenade || w.melee ? Infinity : w.mag,
    count: w.count || 0,
    reloadT: 0, reloading: false, fireT: 0, muzzleT: 0,
    aim: 0, recoilKick: 0, recoilSide: 0, lastMuzzleX: 0, lastMuzzleY: 0,
    // 配件：当前武器有效配件 + 聚合效果；ADS 开镜状态（0..1 平滑过渡）
    attachments: [], attFx: null, ads: false, adsT: 0,
    // 投掷：蓄力（左键按住→松开投掷）与引信（右键拔插销→定时引爆）状态
    charging: false, throwPower: 0, chargeT: 0, pinPulled: false, fuseLeft: 0,
    // 人物装备：当前背包的护甲/战术靴聚合效果（出生即生效，不随武器切换）
    equipFx: { dmgMul: 1, jumpMul: 1, speedMul: 1 },
    // AI 控制输入（玩家使用 Input）；backT/stuckT/prevX/lastMove 为寻路脱困状态
    ai: { move: 0, wantJump: false, aim: 0, fire: false, backT: 0, stuckT: 0, prevX: null, lastMove: 0 },
    freezeT: 0,
    // 能量 / 英雄变身
    energy: 0, maxEnergy: 100, hero: null, heroT: 0,
    // 地面拾取特殊武器（拾取槽 1/2，最多 2 把）
    pickupSlots: [{ weapon: null, ammo: 0 }, { weapon: null, ammo: 0 }],
    // 钥匙（开启特定传送门）
    hasKey: false,
    // 攻防干员原型（breacher/scout/anchor/trapper；非攻防局为 null）
    role: null, _slowImmune: false,
  };
  // 初始装备大厅选中的生化背包（默认 1 号），数字键 1-4 可切换主/副/近战/投掷槽位
  const bidx = (() => {
    const el = document.getElementById('startBackpack');
    if (!el) return 0;
    const v = parseInt(el.value, 10);
    return (v >= 0 && v < BACKPACKS.length) ? v : 0;
  })();
  const b0 = BACKPACKS[bidx] || BACKPACKS[0];
  for (const gid of WEAPON_GROUP_ORDER) if (b0.loadout[gid]) h.groupSel[gid] = b0.loadout[gid];
  h.backpackIdx = bidx;   // 出生索引与开局背包一致（B 键切换、补给点「使用中」标记基于此）
  // 玩家出生直接装备开局背包主武器（而非固定 m4a1），副武器/近战/投掷按槽位配置
  if (isPlayer && b0.loadout.primary && WEAPONS[b0.loadout.primary]) {
    const pk = b0.loadout.primary;
    const pw = WEAPONS[pk];
    h.weapon = pk;
    h.mag = pw.grenade || pw.melee ? Infinity : (h.arsenal[pk].mag != null ? h.arsenal[pk].mag : pw.mag);
    h.count = pw.count || 0;
  }
  computeHumanAttachments(h);
  computeHumanEquipFx(h);
  // 扩容弹匣：出生即把当前武器满弹匣容量放大
  if (h.isPlayer && h.attFx && h.attFx.magMul > 1 && h.mag !== Infinity) {
    h.mag = Math.round(h.mag * h.attFx.magMul);
  }
  return h;
}

// 按当前背包计算人物装备聚合效果（护甲减伤 / 战术靴跳跃移速；仅玩家）
function computeHumanEquipFx(h) {
  h.equipFx = { dmgMul: 1, jumpMul: 1, speedMul: 1 };
  if (!h || !h.isPlayer || h.kind !== 'human') return;
  const bp = BACKPACKS[h.backpackIdx] || BACKPACKS[0];
  h.equipFx = aggregateEquipFx(bp.equip);
}

// 按当前背包槽位计算有效配件 + 聚合效果（仅玩家；AI 队友不带配件）
function computeHumanAttachments(h) {
  h.attachments = [];
  h.attFx = null;
  if (!h || !h.isPlayer || h.kind !== 'human' || !h.weapon) return;
  const slot = slotOfWeapon(h.weapon);
  if (!slot) return;
  const bp = BACKPACKS[h.backpackIdx] || BACKPACKS[0];
  h.attachments = effectiveAttachments(h.weapon, backpackAtts(bp, slot));
  h.attFx = h.attachments.length ? aggregateAttachFx(h.attachments) : null;
}

// 僵尸（小僵尸 / 疾行 / 自爆 / 小母体 / 大母体）
function makeZombie(ztype, { x, y, isPlayer, invuln, team }) {
  const z = ZOMBIES[ztype];
  return {
    id: uid(), kind: 'zombie', ztype, faction: 'zombie', team: team != null ? team : null,
    x, y, w: z.w, h: z.h, vx: 0, vy: 0, onGround: false, facing: 1, animT: Math.random() * 10,
    hp: Math.round(z.hp * (CFG.ZOMBIE_HP_MUL || 1)), maxHp: Math.round(z.hp * (CFG.ZOMBIE_HP_MUL || 1)), dead: false,
    isPlayer: !!isPlayer,
    invuln: !!invuln,   // 训练营无敌木桩：hp 锁定不死亡（仍显示伤害/特效）
    speed: Math.round(z.speed * (CFG.ZOMBIE_SPEED_MUL || 1)), dmg: z.dmg,
    attackCd: 0, skillCd: z.skill === 'dash' ? 1 : (z.slamRadius ? 2 : 0),
    dashing: false, dashT: 0, slamPrep: 0, slamCD: 0,
    spawnT: (z.summonCd ? 2 : (z.skill === 'slam' ? 2 : 0)),   // 母体召唤冷却
    knock: z.knock,
    target: null, lastAttack: 0,
    // 幽灵水晶 Buff（1 被动 + 1 主动，Q 释放主动；死亡清空、切关保留）
    buffs: { passive: null, active: null, activeCd: 0 },
    // 终结者变身 / 隐身 / 飞身状态
    termT: 0, invisT: 0, flyT: 0,
    // 武器特色状态（fx 命中附加）：减速/燃烧/毒蚀/标记/眩晕/狂热计数
    slowT: 0, slowMul: 1, burnT: 0, burnDps: 0, burnAcc: 0, doTFx: null,   // doTFx 记录持续伤害来源（burn/frost），供训练营区分「燃烧/急冻」
    poisonT: 0, poisonDps: 0, poisonAcc: 0,
    markT: 0, markMul: 1, stunT: 0, rampKey: -1, rampDmg: 0,
    freezeT: 0,   // 闪光/烟雾减速（无畏意志免疫）
    knockT: 0,    // 击退状态：期间 AI 不追，仅受击退惯性（避免击退被 AI 移动瞬间抵消）
    zBackT: 0, zStuckT: 0, zPrevX: x,   // 寻路脱困：反向绕行计时 / 卡住计时 / 上一帧 x
    // 猩红母皇光环状态（被动技能）：auraT 记录光环累计时长
    auraT: 0,
  };
}

// 子弹
function fireBullet(owner, weaponKey, angle, opts) {
  const w = WEAPONS[weaponKey];
  const o = opts || {};
  // 每把枪独特散射角（config 注入 scatter/scatterType：特定夹角内随机散布）；
  // 霰弹等 pellets>1 沿用枪自身大散布（本就散射），近战/投掷/无飞行不散射
  const tr = w.trail || {};
  const scatBase = (tr.scatter != null && w.pellets <= 1 && w.bspeed > 0) ? tr.scatter : w.spread;
  const scat = scatBase * (o.spreadMul != null ? o.spreadMul : 1) * (o.bloomMul != null ? o.bloomMul : 1)
    * (CFG.GLOBAL_SPREAD_MUL || 1) * ((CFG.GUN_SPREAD_OVERRIDE && CFG.GUN_SPREAD_OVERRIDE[weaponKey]) || 1);
  const scatType = tr.scatterType || 'uniform';
  const bspeed = w.bspeed * (o.bspeedMul != null ? o.bspeedMul : 1);
  const range = w.range * (o.rangeMul != null ? o.rangeMul : 1);
  const pellets = [];
  for (let i = 0; i < w.pellets; i++) {
    // gauss：中间密集两侧稀疏；uniform：特定夹角内均匀随机（接近直线但带真实抖动）
    const a = scatType === 'gauss'
      ? angle + (Math.random() + Math.random() - 1) * scat
      : angle + (Math.random() - 0.5) * 2 * scat;
    const sx = owner.x + owner.w / 2 + Math.cos(angle) * (owner.w / 2 + 8);
    const sy = entityFireY(owner) + Math.sin(angle) * (owner.w / 2 + 8);
    let dmg = w.dmg;
    if (o.dmgMul != null) dmg *= o.dmgMul;
    const b = {
      x: sx, y: sy,
      vx: Math.cos(a) * bspeed, vy: Math.sin(a) * bspeed,
      dmg, owner, faction: owner.faction, team: owner.team != null ? owner.team : null,
      life: bspeed > 0 ? range / bspeed : (w.range / (w.bspeed || 1)),
      key: weaponKey,
      trail: tr,   // 每把枪特色弹道（config.js 注入）
    };
    if (o.hideTracer) b.hideTracer = true;
    // 弹药效果：穿甲 / 爆破弹头 / 曳光弹（配件注入；原生爆炸武器保持既有行为）
    if (o.pierce) b.pierce = o.pierce;
    else if (w.pierce) b.pierce = w.pierce;
    else if (w.fx === 'pierce') b.pierce = 1;
    if (o.explosive) { b.explosive = true; b.splash = o.splash || w.splash || 46; }
    else if (w.explode) { b.explosive = true; b.splash = w.splash; }
    if (o.trailBoost) b.trailBoost = o.trailBoost;
    if (w.fx) b.fx = w.fx;
    pellets.push(b);
  }
  return pellets;
}

// 粒子特效
function spawnParticle(x, y, color, opts) {
  const o = opts || {};
  particles.push({
    x, y,
    vx: o.vx != null ? o.vx : (Math.random() - 0.5) * 160,
    vy: o.vy != null ? o.vy : -Math.random() * 160,
    life: o.life != null ? o.life : 0.5,
    maxLife: o.life != null ? o.life : 0.5,
    size: o.size || 3,
    color: color || '#fff',
    grav: o.grav != null ? o.grav : 600,
    type: o.type || 'dot',
    grow: o.grow || 0,
  });
}

// 飘字（伤害数字等）
function spawnText(x, y, text, color, size) {
  texts.push({ x, y, text, color: color || '#fff', life: 0.9, maxLife: 0.9, size: size || 15, vy: -70 });
}

// 弹壳抛射（霰弹等）：带重力/旋转/落地弹跳的实体弹壳
function ejectShell(x, y, opts) {
  const o = opts || {};
  particles.push({
    kind: 'shell', x, y,
    vx: o.vx != null ? o.vx : (Math.random() - 0.5) * 120,
    vy: o.vy != null ? o.vy : -(180 + Math.random() * 140),
    grav: 950,
    life: o.life != null ? o.life : 2.8,
    maxLife: o.life != null ? o.life : 2.8,
    size: o.size || 6,          // 弹壳半长
    width: o.width || 3,        // 弹壳宽度
    color: o.color || '#d84315',
    rot: o.rot != null ? o.rot : Math.random() * Math.PI * 2,
    spin: o.spin != null ? o.spin : (Math.random() - 0.5) * 24,
    bounces: o.bounces != null ? o.bounces : 2,
  });
}

// 全局容器（game.js 初始化）
const particles = [];
const texts = [];
const bullets = [];
const areas = [];            // 效果区：烟 / 火 / 毒
