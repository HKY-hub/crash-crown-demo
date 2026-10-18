// ============ 第 4 阶段：按武器类别共享的"受击方基础视觉" ============
// 边界（务必守住）：
// 1) 只描述"真实接触发生后，目标身上/被击表面上的短暂画面"。伤害、击退、减速、眩晕、
//    燃烧、毒蚀、冰冻、标记、吸血、伤害数字、感染、死亡全部沿用原有玩法逻辑，本模块不参与判定。
// 2) 类别由**实际造成此次命中的武器 ID** 经 WEAPONS[id].g 得出，不看子弹颜色/弹道/音效，
//    也不看攻击者当前手持（子弹飞行期间可能已经切枪）。
// 3) 同枪族共用一套基础方案；材质只改颜色与碎屑材料，不改节奏与形状身份。
// 4) 随机数按 (事件序号, 类别, 目标) 稳定生成：暂停/逐帧/重播画面一致，不会逐帧重掷。

const HitArt = (() => {
  const CAP_EVENT = 96;
  const CAP_PART = 320;
  const MAX_POINTS = 8;              // 单次受击最多几个命中点（霰弹组）
  const AGG_WINDOW = 0.045;          // 同目标短时间窗：高射速合并节奏用

  const events = [];
  const parts = [];
  let clock = 0, nextId = 1, dropped = 0;
  const emitted = { total: 0, byCat: {}, merged: 0, surfaces: 0, unknownMat: 0 };
  const unknownMats = new Set();     // 开发态诊断：哪些碰撞体没有材质标记

  // ---------- 类别映射 ----------
  const CAT_OF_GROUP = {
    assault: 'assault', sniper: 'sniper', smg: 'smg', shotgun: 'shotgun', lmg: 'lmg', pistol: 'pistol',
  };
  function categoryOf(key) {
    const w = (typeof WEAPONS !== 'undefined' && key) ? WEAPONS[key] : null;
    if (!w) return { cat: 'unknown', key: key || null, g: null };
    if (CAT_OF_GROUP[w.g]) return { cat: CAT_OF_GROUP[w.g], key, g: w.g };
    if (w.melee) return { cat: 'melee', key, g: w.g };
    if (w.grenade) return { cat: 'thrown', key, g: w.g };
    if (w.flamer) return { cat: 'flame', key, g: w.g };
    if (w.hero) return { cat: 'hero', key, g: w.g };
    if (key === 'turret_shot') return { cat: 'turret', key, g: w.g };   // 内部炮台：独立来源，不当手枪
    if (w.g === 'pickup') return { cat: 'special', key, g: w.g };
    return { cat: 'other', key, g: w.g };
  }

  // ---------- 六类常规枪械的基础受击档案 ----------
  // dur 总时长；flash 命中点亮斑；chips 飞散碎屑；rim 瞬时轮廓反馈；agg 是否按组聚合
  const PROFILES = {
    assault: { dur: 0.20, flash: { r: 3.0, life: 0.10, core: true },  chips: { n: 5, spd: 150, spread: 0.55, grav: 900, life: 0.30, size: 1.6 }, rim: 0,    ring: 0,   agg: false, step: 1.00 },
    sniper:  { dur: 0.26, flash: { r: 4.5, life: 0.13, core: true },  chips: { n: 7, spd: 250, spread: 0.42, grav: 900, life: 0.36, size: 1.9 }, rim: 2.2,  ring: 1,   agg: false, step: 1.00 },
    smg:     { dur: 0.13, flash: { r: 2.2, life: 0.07, core: true },  chips: { n: 3, spd: 120, spread: 0.70, grav: 900, life: 0.20, size: 1.2 }, rim: 0,    ring: 0,   agg: true,  step: 0.70 },
    shotgun: { dur: 0.24, flash: { r: 2.6, life: 0.09, core: true },  chips: { n: 4, spd: 170, spread: 0.95, grav: 900, life: 0.26, size: 1.5 }, rim: 0,    ring: 0,   agg: true,  step: 1.00, group: true },
    lmg:     { dur: 0.22, flash: { r: 3.4, life: 0.11, core: true },  chips: { n: 6, spd: 190, spread: 0.60, grav: 900, life: 0.32, size: 1.8 }, rim: 0.8,  ring: 0,   agg: true,  step: 0.85 },
    pistol:  { dur: 0.17, flash: { r: 2.3, life: 0.10, core: true },  chips: { n: 3, spd: 130, spread: 0.34, grav: 900, life: 0.24, size: 1.3 }, rim: 0,    ring: 0,   agg: false, step: 1.00 },
    // 以下不是六种常规枪械档案，本阶段只保证"边界清楚、不硬塞"，外观留给各自专属阶段
    melee:   { dur: 0.26, flash: { r: 4.0, life: 0.12, core: true },  chips: { n: 6, spd: 210, spread: 1.10, grav: 900, life: 0.30, size: 1.8 }, rim: 1.2,  ring: 1,   agg: false, step: 1.00 },
    thrown:  { dur: 0.30, flash: { r: 5.0, life: 0.16, core: true },  chips: { n: 8, spd: 240, spread: 1.30, grav: 900, life: 0.36, size: 2.0 }, rim: 0,    ring: 1,   agg: false, step: 1.00 },
    flame:   { dur: 0.22, flash: { r: 3.2, life: 0.18, core: false }, chips: { n: 4, spd:  70, spread: 1.20, grav: -180, life: 0.34, size: 2.0 }, rim: 0,   ring: 0,   agg: true,  step: 0.60 },
    energy:  { dur: 0.18, flash: { r: 3.0, life: 0.12, core: true },  chips: { n: 4, spd: 160, spread: 0.60, grav: 500, life: 0.24, size: 1.4 }, rim: 0,    ring: 0,   agg: true,  step: 0.80 },
    hero:    { dur: 0.24, flash: { r: 4.0, life: 0.14, core: true },  chips: { n: 6, spd: 200, spread: 0.80, grav: 700, life: 0.30, size: 1.7 }, rim: 1.0,  ring: 1,   agg: true,  step: 0.90 },
    turret:  { dur: 0.20, flash: { r: 3.0, life: 0.10, core: true },  chips: { n: 5, spd: 150, spread: 0.55, grav: 900, life: 0.28, size: 1.6 }, rim: 0,    ring: 0,   agg: false, step: 1.00 },
    special: { dur: 0.20, flash: { r: 3.2, life: 0.11, core: true },  chips: { n: 5, spd: 160, spread: 0.60, grav: 900, life: 0.28, size: 1.6 }, rim: 0,    ring: 0,   agg: false, step: 1.00 },
    other:   { dur: 0.18, flash: { r: 2.6, life: 0.09, core: true },  chips: { n: 4, spd: 140, spread: 0.60, grav: 900, life: 0.26, size: 1.4 }, rim: 0,    ring: 0,   agg: false, step: 1.00 },
    unknown: { dur: 0.18, flash: { r: 2.6, life: 0.09, core: true },  chips: { n: 4, spd: 140, spread: 0.60, grav: 900, life: 0.26, size: 1.4 }, rim: 0,    ring: 0,   agg: false, step: 1.00 },
  };

  // ---------- 材质覆盖层：只改颜色与碎屑材料，不改节奏与形状 ----------
  const MAT = {
    zombie:   { kind: 'flesh',  spark: '#6dff4b', deep: '#2f6f2a', dust: '#8a1a1a', chip: '#4d7f4a' },
    human:    { kind: 'flesh',  spark: '#ff8a80', deep: '#8a2020', dust: '#c99a6e', chip: '#c94b4b' },
    armor:    { kind: 'hard',   spark: '#ffe082', deep: '#4a4a52', dust: '#9e9e9e', chip: '#78909c' },
    masonry:  { kind: 'hard',   spark: '#e8d9b8', deep: '#5a5148', dust: '#bfb49a', chip: '#8a8177' },
    stone:    { kind: 'hard',   spark: '#e0e0e0', deep: '#4a4a4a', dust: '#bdbdbd', chip: '#8d8d8d' },
    metal:    { kind: 'metal',  spark: '#fff176', deep: '#3a4550', dust: '#b0bec5', chip: '#78909c' },
    wood:     { kind: 'wood',   spark: '#e6c07b', deep: '#4a2f14', dust: '#c8a06a', chip: '#8a5a2a' },
    glass:    { kind: 'brittle',spark: '#b3e5fc', deep: '#1b3a4a', dust: '#9fd8ef', chip: '#4a7f9e' },
    unknown:  { kind: 'hard',   spark: '#d7dde2', deep: '#4a5158', dust: '#aeb6bd', chip: '#7d868f' },
  };
  // 地图 mat 标记 → 受击材质桶
  const MAT_BUCKET = {
    stone: 'stone', concrete: 'masonry', brick: 'masonry', plaster: 'masonry', paint: 'masonry',
    floor: 'masonry', rubber: 'unknown', door: 'wood', crate: 'wood', wood: 'wood',
    metal: 'metal', steel: 'metal', grate: 'metal',
  };
  function materialOfSolid(s) {
    if (!s) return MAT.unknown;
    if (s.breakable) return MAT.wood;                       // 可破坏门/木墙
    if (s.reinforce) return MAT.masonry;                    // 加固墙
    const b = MAT_BUCKET[s.mat];
    if (!b) {
      if (s.mat) unknownMats.add('未映射 mat:' + s.mat);
      else unknownMats.add('无 mat 标记的碰撞体（地面/坑台等）');
      emitted.unknownMat++;
      return MAT.unknown;                                    // 保守通用硬表面，不猜
    }
    return MAT[b];
  }
  function materialOfTarget(t) {
    if (!t) return MAT.unknown;
    if (t.kind === 'zombie') return MAT.zombie;
    if (t.kind === 'human') return (t.equipFx && t.equipFx.dmgMul < 1) ? MAT.armor : MAT.human;
    return MAT.unknown;
  }

  // ---------- 稳定随机 ----------
  function hash32(a, b, c) {
    let h = 2166136261 >>> 0;
    h = (h ^ a) * 16777619 >>> 0; h = (h ^ (b | 0)) * 16777619 >>> 0; h = (h ^ (c | 0)) * 16777619 >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- 事件 ----------
  // ctx: { key, target?, solid?, x, y, dir?, method, pellets?, estimated? }
  function emit(ctx) {
    if (!ctx) return null;
    const c = categoryOf(ctx.key);
    const prof = PROFILES[c.cat] || PROFILES.unknown;
    const mat = ctx.solid ? materialOfSolid(ctx.solid) : materialOfTarget(ctx.target);
    const tid = ctx.target ? ctx.target.id : (ctx.solid ? ('s' + (ctx.solid._sid || (ctx.solid._sid = nextId++))) : 0);
    // 短时间窗聚合：同一目标 + 同一武器 + 同一攻击者 → 合并成一次画面（不合并伤害）
    if (prof.agg) {
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.cat === c.cat && ev.tid === tid && ev.key === c.key &&
            (clock - ev.t0) < AGG_WINDOW && ev.points < MAX_POINTS) {
          ev.hits++; ev.points = Math.min(MAX_POINTS, ev.points + (ctx.pellets || 1));
          ev.maxDir = ctx.dir != null ? ctx.dir : ev.maxDir;
          emitted.merged++;
          return ev;
        }
      }
    }
    const matKey = ctx.solid ? (function () {
      for (const k in MAT_BUCKET) if (MAT_BUCKET[k] === (mat === MAT.zombie ? 'zombie' : null)) break;
      const found = Object.keys(MAT).find(mk => MAT[mk] === mat);
      return found || 'unknown';
    })() : (mat === MAT.zombie ? 'zombie' : mat === MAT.human ? 'human' : mat === MAT.armor ? 'armor' : 'unknown');
    const ev = {
      id: nextId++, cat: c.cat, key: c.key, group: c.g, tid,
      targetId: ctx.target ? ctx.target.id : null, targetRef: ctx.target || null,
      solid: ctx.solid || null,
      x: ctx.x, y: ctx.y, dir: ctx.dir == null ? 0 : ctx.dir,
      method: ctx.method || 'bullet', pellets: ctx.pellets || 1,
      points: Math.min(MAX_POINTS, ctx.pellets || 1), hits: 1,
      material: mat.kind, matKey, mat, estimated: !!ctx.estimated,
      t0: clock, dur: prof.dur, seed: hash32(nextId, c.cat.length + (c.key ? c.key.length : 0), tid | 0),
      spawned: false,
    };
    if (ctx.solid) emitted.surfaces++;
    emitted.total++; emitted.byCat[c.cat] = (emitted.byCat[c.cat] || 0) + 1;
    if (events.length >= CAP_EVENT) { events.shift(); dropped++; }
    events.push(ev);
    return ev;
  }

  // 事件在其时间轴上应产生的粒子（一次性生成，之后只推进物理，不逐帧重掷）
  function spawnFor(ev) {
    const prof = PROFILES[ev.cat] || PROFILES.unknown;
    const r = rng(ev.seed);
    const n = Math.max(1, Math.min(MAX_POINTS, ev.points));
    const per = prof.chips.n * (prof.group ? Math.min(1.6, 0.7 + n * 0.14) : 1);
    const total = Math.min(26, Math.round(per));
    for (let i = 0; i < total; i++) {
      if (parts.length >= CAP_PART) { parts.shift(); dropped++; }
      const side = r() < 0.5 ? -1 : 1;
      const a = ev.dir + side * prof.chips.spread * (0.25 + r() * 0.9) + (r() - 0.5) * 0.35;
      const spd = prof.chips.spd * (0.45 + r() * 0.85);
      // 霰弹组：命中点按真实弹丸数横向铺开，而不是挤在身体中心
      const off = prof.group ? (r() - 0.5) * 12 * (n / MAX_POINTS + 0.4) : (r() - 0.5) * 3;
      parts.push({
        x: ev.x + Math.cos(a + Math.PI / 2) * off, y: ev.y + Math.sin(a + Math.PI / 2) * off,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 30,
        life: prof.chips.life * (0.6 + r() * 0.7), maxLife: prof.chips.life,
        size: prof.chips.size * (0.6 + r() * 0.8), grav: prof.chips.grav,
        col: r() < 0.42 ? ev.mat.spark : (r() < 0.7 ? ev.mat.chip : ev.mat.dust),
        kind: ev.cat === 'flame' ? 'fire' : 'chip', ev: ev.id,
      });
    }
    // 命中点亮斑 + 可选轮廓反馈/冲击环（狙击/近战/投掷/英雄）
    if (parts.length < CAP_PART) {
      parts.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: prof.flash.life, maxLife: prof.flash.life,
        size: prof.flash.r, grav: 0, col: ev.mat.spark, kind: 'flash', ev: ev.id });
      parts.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: prof.flash.life * 0.6, maxLife: prof.flash.life * 0.6,
        size: Math.max(1, prof.flash.r * 0.45), grav: 0, col: '#ffffff', kind: 'core', ev: ev.id });
    }
    if (prof.rim && ev.targetRef && parts.length < CAP_PART) {
      parts.push({ x: ev.x, y: ev.y, ref: ev.targetRef, life: 0.10, maxLife: 0.10, size: prof.rim, grav: 0, col: ev.mat.deep, kind: 'rim', ev: ev.id });
    }
    if (prof.ring && parts.length < CAP_PART) {
      parts.push({ x: ev.x, y: ev.y, life: 0.16, maxLife: 0.16, size: 3, grav: 0, col: ev.mat.spark, kind: 'ring', ev: ev.id });
    }
    ev.spawned = true;
  }

  function step(dt) {
    clock += dt;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (!ev.spawned) spawnFor(ev);
      if (clock - ev.t0 > ev.dur + 0.05) events.splice(i, 1);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.kind === 'flash' || p.kind === 'core' || p.kind === 'rim' || p.kind === 'ring') continue;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'fire') { p.vx *= 0.94; p.size += dt * 6; }
    }
  }

  function draw(ctx, cam) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const k = Math.max(0, p.life / p.maxLife);
      let x = p.x - cam.x, y = p.y - cam.y;
      if (p.ref) {   // 轮廓反馈跟随目标，目标消失即不画
        if (p.ref.dead) continue;
        x = p.ref.x + p.ref.w / 2 - cam.x; y = p.ref.y + p.ref.h * 0.5 - cam.y;
      }
      if (x < -30 || x > CFG.CW + 30 || y < -30 || y > CFG.CH + 30) continue;   // 镜头外不画
      ctx.globalAlpha = k;
      ctx.fillStyle = p.col;
      if (p.kind === 'ring') {
        pxRing(ctx, x, y, p.size * (1 + (1 - k) * 2.2), 2);
      } else if (p.kind === 'rim') {
        const t = p.ref;
        pxLine(ctx, t.x - cam.x, t.y + t.h * 0.25 - cam.y, t.x - cam.x, t.y + t.h * 0.8 - cam.y);
        pxLine(ctx, t.x + t.w - 1 - cam.x, t.y + t.h * 0.25 - cam.y, t.x + t.w - 1 - cam.x, t.y + t.h * 0.8 - cam.y);
      } else if (p.kind === 'flash') {
        pxCircle(ctx, x, y, p.size * (0.55 + k * 0.75));
      } else if (p.kind === 'core') {
        pxCircle(ctx, x, y, p.size);
      } else {
        pxRect(ctx, x, y, Math.max(1, p.size), Math.max(1, p.size));
      }
      ctx.globalAlpha = 1;
    }
  }

  // 终止/回收：目标消失、切关、回合结束
  function prune() {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.targetRef && (ev.targetRef.dead || ev.targetRef.removed)) events.splice(i, 1);
    }
  }
  function reset(reason) {
    events.length = 0; parts.length = 0;
    if (reason === 'reset') { clock = 0; emitted.total = 0; emitted.byCat = {}; emitted.merged = 0; emitted.surfaces = 0; emitted.unknownMat = 0; unknownMats.clear(); }
  }
  function info() {
    return { clock: +clock.toFixed(3), events: events.length, parts: parts.length, cap: { events: CAP_EVENT, parts: CAP_PART }, dropped, emitted, unknownMats: Array.from(unknownMats) };
  }
  // 纯函数重播（工位/断言用）：同一事件在同一时刻必须给出同一画面
  function replay(ev, t) {
    const r = rng(ev.seed);
    const u = Math.max(0, Math.min(1, (t - ev.t0) / ev.dur));
    return { u, cat: ev.cat, profile: ev.cat, points: Math.min(MAX_POINTS, ev.points), hits: ev.hits,
      firstChipAngleJitter: r(), flashR: (PROFILES[ev.cat] || PROFILES.unknown).flash.r, material: ev.material, estimated: ev.estimated };
  }
  return { emit, step, draw, prune, reset, info, replay, categoryOf, PROFILES, MAT, MAT_BUCKET,
    materialOfSolid, materialOfTarget, get events() { return events; }, get parts() { return parts; },
    setClock(v) { clock = v; } };
})();

if (typeof window !== 'undefined') window.HitArt = HitArt;
