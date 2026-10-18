// ============ 疾驰列车 · 生活细节与灾难叙事（程序化美术 阶段五） ============
// 阶段四让九类车厢「认得出是谁」，这一层要让每节车「看得出发生过什么」。
//
// 三条硬规矩（都写成可检的断言，见 audit）：
//   ① 新旧程度只能由关卡数据推出来（章节追击强度、全局 ruin、本车破损/小件密度、是否压在事件点上），
//      一次算清、重载必一致 —— 这是「同一节车重新加载细节位置不变」的前提；
//   ② 生活小件必须**坐在真实的支撑面上**：杯子在桌面上、毯子在床上、鞋在床下地板上。
//      支撑面是从阶段四画出的构件里量的（surfaceAt），不是猜的，所以不会出现悬空的水杯；
//   ③ 最要紧的一条：**绝不在可行走的地板上画误导性的破口**。
//      关卡里 breach（地板塌陷）事件只是横风+震屏+刷怪，并没有真把地板捅穿；
//      所以塌陷只画「裂缝 + 翘起的地板条 + 外露桁架 + 警示锥」，一律不画通穿的洞。
//      任何标了 hole 的构件必须落在数据真授权的开口里（car.holes 车顶破口），否则 audit 直接报错。
const CarLife = (() => {
  const H = 36;
  const px = f => Math.max(1, Math.round(H * f));
  // 四档新旧程度
  const COND = [
    { id: 'T', name: '崭新', props: 0.25, mess: 0, wreck: 0 },
    { id: 'U', name: '正常使用', props: 1.0, mess: 0, wreck: 0 },
    { id: 'M', name: '脏乱', props: 1.0, mess: 1, wreck: 0 },
    { id: 'W', name: '严重破坏', props: 1.0, mess: 1, wreck: 1 },
  ];
  function hz(s, k) {
    // 必须用 Math.imul：写成 (s|0) * 2654435761 时乘积超过 2^53，浮点精度把不同的种子
    // 挤成同一个值 —— 阶段七接上独立随机流之后，life/wreck/prop 三条流换了毫无反应，
    // 就是这个乘法让哈希退化成了常数。
    let x = (Math.imul(s | 0, 2654435761) + Math.imul(k | 0, 40503) + 1013904223) >>> 0;
    x ^= x >> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >> 13;
    return (x >>> 0) / 4294967296;
  }
  // 只读关卡数据：不读时间、不读 Math.random、不读相机
  function conditionOf(car, M) {
    const CH = typeof TrainGen !== 'undefined' ? TrainGen.CHAPTERS : null;
    const C = CH && CH[car.chapter] ? CH[car.chapter] : { chase: 0.5, light: 0.7 };
    const o = (M && M.opts) || {};
    let s = 0;
    s += C.chase * 1.55;
    s += (o.ruin === undefined ? 0.6 : o.ruin) * CarLife.RUIN_W;
    s += (car.damage.length / Math.max(1, car.len / 190)) * 0.3;
    s += car.props.length * 0.07;
    s += (car.sealed ? 0.25 : 0) + (car.routeOut !== 'FLOOR' ? 0.2 : 0);
    // 车尾方向更惨（追兵从后面来、人一路打过来），车头相对完整；再加本车自己的痕迹密度
    s += (M && M.cars && M.cars.length ? (1 - car.i / Math.max(1, M.cars.length - 1)) : 0) * 1.15;
    s += Math.min(1.2, (car.holes.length * 0.35 + car.decks.length * 0.12 + (car.links || []).length * 0.2));
    if (M && M.events) for (const e of M.events) if (e.x > car.x0 - 60 && e.x < car.x1 + 60) s += 0.75;
    if (typeof CarFit !== 'undefined') s += (CarFit.variantOf(car).id === 'C' ? 0.15 : 0);
    CarLife.raw = s;                                            // 标定用（闸门读它，不靠猜阈值）
    return Math.max(0, Math.min(3, Math.floor(s - CarLife.BASE)));
  }

  let P = [], CUR = '', SK = null, FIT = null, CAR_ = null;
  function put(x, y, w, h, mat, o) {
    if (!(w > 0 && h > 0)) return null;
    const p = Object.assign({ kind: CUR, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
      mat: mat || 'paint', face: 'side', zone: '', mount: 'floor' }, o || {});
    P.push(p); return p;
  }
  // 从阶段四画好的构件里量「这块 x 区间上最高的支撑面在哪」，小件才有地方坐。
  // 必须**整段盖住**落脚点才算面：只搭到一角的话杯子会坐在空气上（第一版就是这么悬空了 429 件）。
  function surfaceAt(x, w) {
    const fl = SK.g.floorY, hi = fl - 62;                       // 62px 以上算「够不着的柜顶」，不当桌面用
    let top = null;
    for (const p of FIT.parts) {
      if (p.mount !== 'floor' || p.h < 3 || p.y < hi) continue;
      if (p.x > x || p.x + p.w < x + w) continue;
      if (top === null || p.y < top) top = p.y;
    }
    return top === null ? fl : top;
  }
  // 「这块 x 区间上现在能落到多高」：家具顶面 + 本层已经画过的构件顶面，都没有就是地板。
  // 只认真实重叠（边贴边不算搭住），所以用它放出来的构件一定能过连通性检查。
  // maxUp：允许当支撑的最高高度（离地板多少 px 以内）。杯子不会站到 100px 高的柜顶上去。
  function topAt(x, w, maxUp) {
    const cap = maxUp === undefined ? -1e9 : floor() - maxUp;
    let top = floor();
    for (const q of FIT.parts.concat(P)) {
      if (q.mount !== 'floor') continue;
      // 必须整段盖住落脚点：自检是**逐个子件**查支撑的，只搭到一角的小件（杯把、笔、鞋头）会被判悬空
      if (q.x > x || q.x + q.w < x + w) continue;
      if (q.y < cap) continue;
      if (q.y < top) top = q.y;
    }
    return top;
  }
  // 把一件东西**放到**支撑面上（底边正好压住），而不是凭空给个高度
  function rest(x, w, h, mat, o, maxUp) {
    const y = topAt(x, w, maxUp === undefined ? 30 : maxUp) - h;
    return put(x, y, w, h, mat, o);
  }
  // 门、梯口、台阶塔入口是要害，叙事构件一律绕开（和阶段三 free() 同一套判断）
  function blocked(x, w) {
    const a = x - 6, b = x + w + 6;
    for (const d of (SK.car.doors || [])) if (a < d.x + (d.w || 14) + 2 && b > d.x - 2) return true;
    // 让位区间必须和 audit 的判据**同一条**：audit 认定「压住梯井/出梯口」的区间是 [L.x-2, exit.x1]，
    // 原来这里多让了左右各 26/6px，结果①可放区被吃光（实测 27 次细节无处可放、一节车一件没画），
    // ②放下了照样被 audit 判违规（裂缝/毒雾按窄宽度验位、按真实外轮廓画到宽处）。
    // 车底逃生梯没有 exit 字段，它的出梯跨距同样是 26 + 身宽 22，按同一个落点兜底。
    for (const L of (SK.car.ladders || [])) {
      const exitX1 = L.exit ? L.exit.x1 : L.x + 26 + 22;
      if (x < exitX1 && x + w > L.x - 2) return true;   // 与 audit 逐字同区间：不多让一像素，否则可放地被白吃掉
    }
    return false;
  }
  // 在 [lo,hi] 里找一个能放 w 宽的清净位置
  function spot(lo, hi, w) {
    for (let x = Math.round(lo); x + w <= hi; x += 10) if (!blocked(x, w)) return x;
    return null;
  }
  // 就近兜底：以 prefer 为中心向两侧扫完整节车。找不到才真的不画，并且**计入 skips**
  // —— 原来静默跳过，谁也不知道一列车少画了多少细节，现在这个数是要进闸门的。
  let SKIP = 0;
  function spotNear(prefer, w) {
    const x0 = SK.x0 + 10, x1 = SK.x1 - w - 10;
    const p = Math.max(x0, Math.min(x1, prefer));
    if (!blocked(p, w)) return p;
    for (let d = 10; d <= SK.x1 - SK.x0; d += 10) {
      for (const s of [p - d, p + d]) {
        const x = Math.round(Math.max(x0, Math.min(x1, s)));
        if (!blocked(x, w)) return x;
      }
    }
    SKIP++;
    return null;
  }
  const floor = () => SK.g.floorY;

  // ---------- 生活小件：八种，每种都是构件级 ----------
  const PROP = {
    cup(x, y, s) {
      const w = 5, h = 6;
      put(x, y - h, w, h, 'glass', { face: 'side' });
      put(x, y - h, w, 1, 'paintHi', { face: 'top' });
      put(x + w, y - h + 2, 2, 1, 'glass', { face: 'edge' });                 // 杯把
      put(x + 1, y - h + 1, w - 2, 1, 'wood', { face: 'top' });               // 液面
    },
    bottle(x, y, s) {
      put(x, y - 7, 5, 7, 'glass', { face: 'side' });                         // 瓶身底边必须正好压在支撑面上
      put(x + 1, y - 9, 3, 2, 'glass', { face: 'side' });                     // 颈
      put(x + 1, y - 11, 3, 2, 'plastic', { face: 'top' });                   // 盖
      put(x + 1, y - 5, 1, 4, 'paintHi', { face: 'edge' });                   // 高光
    },
    paper(x, y, s, tipped) {
      const w = 13, h = tipped ? 3 : 4;
      put(x, y - h, w, h, 'paintHi', { face: 'side' });
      put(x, y - h, w, 1, 'plastic', { face: 'top' });
      for (let i = 1; i < w - 2; i += 4) put(x + i, y - h + 2, 3, 1, 'steel', { face: 'edge' });   // 字行
    },
    blanket(x, y, s) {
      const w = 14, h = 6;
      put(x, y - h, w, h, 'fabric', { face: 'top', zone: 'touch' });
      put(x, y - h, w, 1, 'plastic', { face: 'top' });
      for (let i = 3; i < w; i += 5) put(x + i, y - h + 1, 1, h - 1, 'plastic', { face: 'edge' }); // 褶
    },
    shoe(x, y, s, tipped) {
      for (let i = 0; i < 2; i++) {
        const sx = x + i * 7 + (hz(s, 9 + i) * 3 | 0);
        put(sx, y - 3, 6, 3, 'fabric', { face: 'side' });                     // 鞋帮
        put(sx, y - 1, 7, 1, 'rubber', { face: 'bottom', zone: 'tread' });    // 鞋底
      }
    },
    toy(x, y, s) {
      put(x, y - 5, 5, 5, 'fabric', { face: 'side' });                        // 身
      put(x + 1, y - 8, 3, 3, 'fabric', { face: 'side' });                    // 头
      put(x, y - 9, 1, 2, 'fabric', { face: 'edge' }); put(x + 3, y - 9, 1, 2, 'fabric', { face: 'edge' });   // 耳
      put(x + 1, y - 7, 1, 1, 'steel', { face: 'side' });                     // 眼
    },
    pillPack(x, y, s) {
      put(x, y - 4, 9, 4, 'steel', { face: 'side' });
      for (let i = 0; i < 4; i++) put(x + 1 + i * 2, y - 3, 1, 1, 'paintHi', { face: 'side' });
    },
    notebook(x, y, s) {
      put(x, y - 6, 10, 6, 'crate', { face: 'side', zone: 'touch' });
      put(x, y - 6, 10, 1, 'paintHi', { face: 'top' });
      put(x + 1, y - 4, 6, 1, 'plastic', { face: 'edge' });                   // 封面压线
      put(x + 11, y - 2, 5, 1, 'danger', { face: 'edge' });                   // 笔
    },
  };
  const ON = { // 什么家具面上放什么小件 —— 有因果，不是随机撒
    cup: /Table|counter|workbench|console|desk|bar/i, bottle: /Table|counter|bench|rack|workbench/i,
    paper: /Table|seat|berth|bunk|bench/i, blanket: /berth|bunk|gurney|seat/i, shoe: /berth|bunk|seat|gurney/i,
    toy: /seat|Table|berth/i, pillPack: /Table|Cabinet|counter|med/i, notebook: /Table|seat|counter|console/i,
  };
  // 分区档位：整节车有一个基准档（conditionOf），但局部可以更烂 ——
  //   破损数据在这一带扎堆 → +1 档；压在事件点上 → 直接拉满。
  //   于是同一节车里可以「尽头还算整齐、塌陷那一段一片狼藉」，而不是一刀切。
  let BASEC = 0, MM = null;
  // 阶段七：小件 / 脏乱 / 破损各走自己的随机流。
  // 全挤在 car.seed 上时，改「散落的杯子怎么摆」会连带挪动墙上的焦痕 —— 那就不叫逐层生成了。
  let SP = 0, SL = 0, SW = 0;
  function lvlAt(x) {
    let v = BASEC;
    let near = 0;
    for (const d of (CAR_.damage || [])) if (Math.abs(d.x - x) < 90) near++;
    if (near >= 3) v += 1;
    for (const e of ((MM && MM.events) || [])) if (Math.abs(e.x - x) < 130) v = Math.max(v, 3);
    return Math.max(0, Math.min(3, v));
  }

  function placeProps(car, cond) {
    car.props.forEach((q, i) => {
      const keep = COND[lvlAt(q.x)].props;
      if (hz(SP, 300 + i) > keep) return;                                // 崭新的车几乎不留私人物品
      CUR = 'prop:' + q.kind;
      const fn = PROP[q.kind]; if (!fn) return;
      const w = q.kind === 'shoe' ? 14 : 12;
      let x = Math.max(car.x0 + 6, Math.min(car.x1 - w - 6, q.x));
      // 找最合适的支撑面：优先「这种小件该放的」那类家具，其次就近的构件面，最后地板
      let host = null;
      for (const f of car.furniture) {
        if (!ON[q.kind] || !ON[q.kind].test(f.kind)) continue;
        if (x >= f.x - 6 && x <= f.x + f.w + 6) { host = f; break; }
      }
      if (host) x = Math.max(host.x + 2, Math.min(host.x + host.w - w - 2, x));
      // 小件自己的落点抖动：谁把杯子放在桌子的哪一角，属于「小物件」这一层的随机性，
      // 不该由关卡数据决定。之前 prop 流只管「翻不翻倒」，实测 40 节车换流 0 处变化，
      // 等于这条流基本没接上。
      x += (hz(SP, 600 + i) * 9 | 0) - 4;
      const tipped = COND[lvlAt(x)].mess && hz(SP, 400 + i) > 0.62;
      if (tipped) x += (hz(SP, 410 + i) * 26 | 0) - 13;                   // 被蹭到地上/挪开
      x = Math.max(car.x0 + 4, Math.min(car.x1 - w - 4, x));
      const realW = q.kind === 'shoe' ? 14 : (q.kind === 'paper' ? 13 : (q.kind === 'blanket' ? 14 : (q.kind === 'notebook' ? 16 : (q.kind === 'bottle' ? 5 : (q.kind === 'toy' ? 5 : (q.kind === 'pillPack' ? 9 : 7))))));
      x = spotNear(x, realW); if (x === null) return;                           // 门口与梯口不堆私人物品
      const y = tipped && q.kind !== 'blanket' ? floor() : surfaceAt(x, realW); // 只坐家具的腰高面，不叠在别的小件上
      fn(x, y, q.seed, tipped);
    });
  }

  // ---------- 脏乱：成堆且有源头 ----------
  function mess(car, cond) {
    if (!COND[lvlAt(car.x0 + car.len / 2)].mess) return;
    // 找一个「容器」当散落源头：最大的 crate/barrel/pallet 类家具
    let src = null;
    for (const f of car.furniture)
      if (/crate|barrel|pallet|sack|Box|Case|Pallet|Cart/i.test(f.kind) && (!src || f.w * f.h > src.w * src.h)) src = f;
    if (!src) src = car.furniture[0];
    if (!src) return;
    CUR = 'mess:spill';
    const dir = hz(SL, 500) > 0.5 ? 1 : -1, base = floor();
    const n = 5 + (hz(SL, 501) * 4 | 0);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, w = Math.max(2, 6 - (t * 3 | 0));
      const x = src.x + (dir > 0 ? src.w + 2 : -2) + dir * t * 46;
      // 只在「离开源容器的那一侧、紧挨着源」的 24px 内找位置。
      // 原来用 spotNear：它无界地把整节车扫一遍，位置被梯口顶掉时散货会一路飞到
      // 源容器**自己肚子里**（实测 coach-14 六个散件距源 −16…−23px），
      // 闸门「散落必须紧贴它的源头」就是这么挂的。
      let sx = null;
      for (let d = 0; d <= 24 && sx === null; d += 6) {
        const cand = Math.round(x - (dir > 0 ? 0 : w) + dir * d);
        if (cand >= SK.x0 + 6 && cand + w <= SK.x1 - 6 && !blocked(cand, w)) sx = cand;
      }
      if (sx === null) { if (i === 0) SKIP++; break; }   // 挤不下就少散几件：一件都没有才算丢失
      put(sx, base - w, w, w, i % 3 === 0 ? 'crate' : 'fabric', { face: 'side', zone: 'tread' });
    }
    // 源容器被掀翻：整只歪着（用叠条近似倾斜），并且它自己贴地
    CUR = 'mess:tipped';
    const th = Math.min(18, src.h), tw = Math.min(26, src.w);
    const tx = dir > 0 ? src.x + src.w - tw : src.x;
    for (let i = 0; i < 4; i++) put(tx + i * 2, floor() - th + i * (th / 4 | 0), tw - i * 2, th / 4 | 0 + 1, 'crate', { face: 'side', zone: 'tread' });
    // 被推开的座椅：在走道上多出一只歪椅子（贴地、不挡门由 audit 管）
    CUR = 'mess:kickedSeat';
    const ks = spotNear(src.x + dir * 60, 20);
    const kx = ks;
    if (ks !== null) {
    put(kx, floor() - 9, 16, 3, 'fabric', { face: 'top', zone: 'tread' });
    put(kx + (dir > 0 ? 0 : 13), floor() - 16, 3, 8, 'fabric', { face: 'side' });
    put(kx + 2, floor() - 6, 2, 6, 'steel', { face: 'edge' }); put(kx + 12, floor() - 6, 2, 6, 'steel', { face: 'edge' });
    }
    // 翻倒的垃圾桶和它倒出来的内容
    CUR = 'mess:bin';
    const bs = spotNear(src.x - dir * 84, 22);
    if (bs !== null) {
    const bx = bs;
    put(bx, floor() - 8, 13, 8, 'plastic', { face: 'side', zone: 'tread' });
    put(bx + (dir > 0 ? 13 : -3), floor() - 6, 3, 5, 'steel', { face: 'edge' });
    for (let i = 0; i < 3; i++) put(bx + (dir > 0 ? 16 : -8) + i * 4, floor() - 2, 3, 2, 'crate', { face: 'side' });
    }
  }

  // ---------- 严重破坏：位置与数量一律由关卡的 car.damage 预算驱动 ----------
  // 以前这里自己写死「3 条翘板、4 根线缆、10 片碎玻璃」，等于美术另记了一本破损账 ——
  // 同一节车会出现「数据说有 2 处破损、画面上有 17 处」的失真。
  // 现在：破损数据里有什么 kind、在哪个 x，就只在那里画对应的表现；一档不 wreck 的地方一件都不画。
  const WRECK_OF = {
    crack: 'plank', dent: 'plank', wire: 'wire', glass: 'glass', stain: 'scorch', blood: 'scorch', scuff: 'scuff',
  };
  function wreck(car, cond, M) {
    const g = SK.g;
    for (const d of (car.damage || [])) {
      const what = WRECK_OF[d.kind]; if (!what) continue;
      const lvl = lvlAt(d.x);
      if (!COND[lvl].wreck) continue;                                     // 这一带还没烂到那份上，什么都不加
      const x = spotNear(d.x, 12); if (x === null) continue;
      if (what === 'plank') {
        CUR = 'wreck:plank';
        for (let k = 0; k < 5; k++) put(x + k * 3, g.floorY - 3 - k, 4, 2, 'wood', { face: 'top', zone: 'tread' });
        put(x + 15, g.floorY - 1, 1, 1, 'steel', { face: 'side' });        // 翘起的钉子
      } else if (what === 'wire') {
        CUR = 'wreck:wire';
        const len = 12 + hz(d.seed + SW, 71) * 22;
        let y = g.ceilY + 2;
        for (let k = 0; k < len; k += 2) { put(x + Math.sin(k / 3) * 2, y, 1, 2, 'rubber', { face: 'edge', mount: 'ceiling' }); y += 2; }
        put(x - 1, g.ceilY, 3, 2, 'steel', { face: 'bottom', mount: 'ceiling' });   // 接线盒
      } else if (what === 'glass') {
        CUR = 'wreck:glass';
        const bs = SK.openings.filter(o => o.kind === 'window');
        const b = bs.length ? bs[Math.floor(hz(d.seed + SW, 8) * bs.length)] : null;
        const gx = spotNear(b ? b.x + hz(d.seed + SW, 9) * (b.w - 2) : x, 2);
        if (gx !== null) put(gx, g.floorY - 1, 2, 1, 'glass', { face: 'top' });     // 贴着地板，不悬空
      } else if (what === 'scorch') {
        CUR = 'wreck:scorch';
        const sx2 = spotNear(x, Math.min(26, d.w)); if (sx2 === null) continue;
        put(sx2, g.winSill + 4, Math.min(26, d.w), g.floorY - g.winSill - 4, 'rubber', { face: 'side', zone: 'corner', mount: 'wall' });
      } else if (what === 'scuff') {
        CUR = 'wreck:scuff';
        put(x, g.floorY - 2, Math.min(18, d.w), 2, 'steel', { face: 'edge', zone: 'tread' });      // 蹭掉的漆条：就在地板上
      }
    }
    // 车顶破口**只在数据真有洞的地方**画撕裂边缘；没有洞就一律不画
    CUR = 'wreck:roofedge';
    for (const ho of (car.holes || [])) {
      put(ho.x, g.roofY - 2, 2, 6, 'steel', { face: 'edge', mount: 'roof' });
      put(ho.x + ho.w - 2, g.roofY - 2, 2, 6, 'steel', { face: 'edge', mount: 'roof' });
      for (let k = 4; k < ho.w - 2; k += 9) put(ho.x + k, g.roofY + 2, 3, 2, 'steel', { face: 'bottom', mount: 'roof' });
    }
  }


  // ---------- 事件主题：七种组合，每种是一组有因果的细节 ----------
  const COMBO = {
    blackout(g, car) {                                        // 断电：应急地灯带 + 桌上蜡烛 + 灭掉的灯罩
      CUR = 'ev:blackout';
      for (let x = car.x0 + 24; x < car.x1 - 24; x += 56) { const sx = spotNear(x, 12); if (sx === null) continue; put(sx, g.floorY - 2, 12, 2, 'paintHi', { face: 'top', lamp: 'safe', glow: 16, zone: 'tread' }); }   // 应急地灯带：断电也要亮
      const b = FIT.floor.find(f => /Table|counter|workbench/i.test(f.kind)) || FIT.floor[0];
      if (b) { rest(b.x + 6, 3, 6, 'plastic', { face: 'side' }, 62); put(b.x + 6, topAt(b.x + 6, 3, 62) - 3, 3, 3, 'danger', { face: 'top', lamp: 'flame', glow: 22 }); }   // 桌上蜡烛
      for (let x = car.x0 + 40; x < car.x1 - 40; x += 150) put(x, g.ceilY + 1, 10, 3, 'steel', { face: 'bottom', mount: 'ceiling' });   // 熄灭的灯罩（挂在顶棚上）
    },
    gust(g, car) {                                            // 横风：纸被吹起（离地、往车尾歪）+ 窗帘被扯平 + 悬挂物甩起
      CUR = 'ev:gust';
      for (let i = 0; i < 4; i++) {
        const x = car.x0 + 40 + hz(SW, 1100 + i) * (car.len - 100), y = g.floorY - 22 - hz(SW, 1110 + i) * 46;
        for (let k = 0; k < 4; k++) put(x - k * 3, y + k, 4, 1, 'paintHi', { face: 'edge', mount: 'wall' });
      }
      const b = SK.openings.filter(o => o.kind === 'window')[1] || SK.openings[0];
      if (b) put(b.x, g.winHead + 6, b.w * 0.7 | 0, 3, 'fabric', { face: 'side', mount: 'window' });   // 窗帘被吹成一条
      for (let i = 0; i < 3; i++) { const x = car.x0 + 60 + i * 120; put(x, g.ceilY + 6, 1, 10, 'rubber', { face: 'edge', mount: 'ceiling' }); put(x - 3, g.ceilY + 16, 7, 3, 'fabric', { face: 'side', mount: 'ceiling' }); }
    },
    breach(g, car) {                                          // 「地板塌陷」：只画裂缝/翘板/外露桁架/警示锥，绝不画通穿的洞
      CUR = 'ev:breach';
      // 三组裂缝共用一个 x，间隔 42px，所以要让开的是**整条**，不是单组 40px；
      // 整节车放不下三组就减到两组、一组（原来按 40px 验位，第三组正好压在一把换层梯的梯井上）。
      let groups = 0, bx = null;
      for (const k of [3, 2, 1]) {
        const w = (k - 1) * 42 + 34;
        const p = spot(car.x0 + 40, car.x1 - 40, w) ?? spotNear(car.x0 + 60, w);
        if (p !== null) { groups = k; bx = p; break; }
      }
      for (let i = 0; i < groups; i++) {
        const x = bx;
        for (let k = 0; k < 6; k++) put(x + i * 42 + k * 3, g.floorY - 2 - k, 5, 3, 'steel', { face: 'edge' });   // 宽 5 步进 3：相邻段重叠 2px，首段贴地，整条裂线连到地   // 裂缝（贴着地板线，不缺口）
        rest(x + 8, 14, 3, 'wood', { face: 'top', zone: 'tread' });                                             // 翘起的地板条
        rest(x + 26, 8, 10, 'danger', { face: 'side' });                                                         // 警示锥
        rest(x + 27, 6, 1, 'paintHi', { face: 'edge' }, 40);                                                 // 锥身上的反光环：压到锥上
      }
    },
    gas(g, car) {                                             // 毒雾：倾倒罐 + 蔓延液体 + 挂勾面具 + 门缝胶带
      CUR = 'ev:gas';
      // 罐 22px + 罐口 + 蔓延液面，整条占位最宽 71px；原来这个 x0 是直接从车长里算出来的，
      // 从未过 blocked()，实测 ev:gas×9 整条压在医疗章那把换层梯的梯井与出梯口上。
      // 放不下就**缩短液面**而不是整件不画：闸门要求「找不到清净位置而跳过的细节 = 0」。
      const runs = [9, 6, 3, 0];                       // 液面段数，放不下就缩短而不是整件不画
      const pref = Math.round(car.x0 + 60 + hz(SW, 1300) * 80);
      let x0 = null, run = 0;
      for (const k of runs) {
        const w = 26 + k * 5;
        const p = !blocked(pref, w) ? pref : (spot(car.x0 + 60, car.x1 - 40, w) ?? spotNear(pref, w));
        if (p !== null) { x0 = p; run = k; break; }
      }
      // spotNear 失败时自己已经计入 SKIP，这里不要再补一次，否则一次丢失被数成两次。
      if (x0 !== null) {
        put(x0, g.floorY - 12, 22, 12, 'steel', { face: 'side', zone: 'tread' });                                 // 躺倒的罐
        put(x0 + 18, g.floorY - 8, 6, 4, 'rubber', { face: 'side' });                                             // 罐口（压在罐身上）
        for (let k = 0; k < run; k++) put(x0 + 26 + k * 5, g.floorY - 1 + (k % 2), 5, 1, 'plastic', { face: 'top', zone: 'tread' });   // 蔓延的液面
      }
      const b = SK.openings.filter(o => o.kind === 'window')[0];
      if (b) { put(b.x + 4, g.winSill + 6, 8, 7, 'plastic', { face: 'side', mount: 'wall' }); put(b.x + 12, g.winSill + 8, 4, 3, 'glass', { face: 'side', mount: 'wall' }); }
      for (const d of (car.doors || [])) { const dw = d.w || 14; put(d.x, g.floorY - 60, dw, 3, 'paintHi', { face: 'edge', mount: 'wall' }); put(d.x, g.floorY - 40, dw, 3, 'paintHi', { face: 'edge', mount: 'wall' }); }   // 门缝封带（贴在门框上，不算落地件）
    },
    patrol(g, car) {                                          // 闸门连锁：放下路障 + 警示灯 + 地面标桩
      CUR = 'ev:patrol';
      const x0 = spot(car.x0 + 30, car.x1 - 120, 60); if (x0 === null) return;
      put(x0, g.floorY - 16, 54, 3, 'steel', { face: 'top', zone: 'tread' });
      for (let i = 0; i < 4; i++) put(x0 + 4 + i * 14, g.floorY - 13, 2, 13, 'steel', { face: 'edge' });
      for (let i = 0; i < 3; i++) put(x0 + 6 + i * 18, g.floorY - 16, 8, 3, 'danger', { face: 'side' });
      rest(x0 + 54, 5, 6, 'danger', { face: 'side' });
      const q = P[P.length - 1]; if (q) { q.lamp = 'beacon'; q.glow = 20; }
      for (let i = 0; i < 5; i++) { const sx = x0 - 30 + i * 24; if (blocked(sx, 3)) continue; rest(sx, 3, 4, 'paintHi', { face: 'edge' }); }
    },
    sprint(g, car) {                                          // 车头冲刺：未固定的货往前挤成一堆 + 扶手衣物甩起
      CUR = 'ev:sprint';
      const x0 = spot(car.x0 + 60, car.x1 - 60, 56); if (x0 === null) return;
      for (let i = 0; i < 4; i++) {
        const w = 12 + (i % 2) * 6, h = 8 + (i % 3) * 5, bx = x0 - i * 13;
        if (blocked(bx, w)) continue;                                     // 货往前挤也不能挤到门口前
        put(bx, g.floorY - h, w, h, i % 2 ? 'crate' : 'fabric', { face: 'side', zone: 'tread' });
        put(bx, g.floorY - h, w, 1, 'wood', { face: 'top' });
      }
      for (let i = 0; i < 2; i++) {                                              // 扶手上的衣物被惯性甩起（挂杆件，不算落地）
        const x = spot(car.x0 + 60, car.x1 - 80, 12); if (x === null) continue;
        put(x, g.floorY - 40, 8, 10, 'fabric', { face: 'side', mount: 'wall' });
        put(x + 6, g.floorY - 46, 4, 7, 'fabric', { face: 'edge', mount: 'wall' });
      }
    },
    stampede(g, car) {                                        // 成群涌来：翻倒椅子 + 散落的鞋 + 撞开的门板 + 血手印 + 打翻的杯
      CUR = 'ev:stampede';
      for (let i = 0; i < 2; i++) {
        const sx = spot(car.x0 + 50, car.x1 - 90, 22); if (sx === null) continue;
        const x = sx + hz(SW, 1600 + i) * 20;
        put(x, g.floorY - 4, 18, 3, 'fabric', { face: 'top', zone: 'tread' });
        rest(x + 13, 5, 9, 'fabric', { face: 'side' });                                 // 椅背压在椅面上
        put(x + 2, g.floorY - 1, 2, 1, 'steel', { face: 'edge' }); put(x + 12, g.floorY - 1, 2, 1, 'steel', { face: 'edge' });
      }
      for (const sx of [car.x0 + 120, car.x0 + 250, car.x1 - 150]) {
        if (blocked(sx, 14)) continue;
        if (sx === car.x1 - 150) PROP.cup(sx, g.floorY, SW + 5);          // 打翻的杯子：就在地上
        else PROP.shoe(sx, g.floorY, SW + (sx === car.x0 + 120 ? 3 : 7), true);
      }
      for (const d of (car.doors || [])) put(d.x + (d.w || 14) + 6, g.floorY - 46, 6, 40, 'paint', { face: 'side', mount: 'wall' }); // 撞开的门板：靠墙立着，不占门洞也不悬空
      for (let i = 0; i < 3; i++) {
        const x = car.x0 + 90 + i * 150;
        put(x, g.winSill + 8, 6, 8, 'danger', { face: 'side', mount: 'wall' });
        for (let k = 0; k < 4; k++) put(x + k * 2, g.winSill + 4, 1, 5, 'danger', { face: 'edge', mount: 'wall' });  // 指头
      }
    },
  };
  function events(car, M) {
    if (!M || !M.events) return [];
    const fired = [];
    for (const e of M.events) {
      if (!(e.x > car.x0 - 40 && e.x < car.x1 + 40)) continue;
      const fn = COMBO[e.kind]; if (!fn) continue;
      fn(SK.g, car, e);
      fired.push(e.kind);
    }
    return fired;
  }

  // ---------- 装配 ----------
  function build(car, sk, fit, M, forceCond) {
    P = []; SK = sk; FIT = fit;
    const cond = forceCond === undefined || forceCond < 0 ? CarLife.conditionOf(car, M) : forceCond;
    const out = { cond, condName: COND[cond].name, type: car.type, parts: [], evs: [], auth: [] };
    CAR_ = car; MM = M; BASEC = cond; SKIP = 0;
    SP = CarArt.as(car, 'prop'); SL = CarArt.as(car, 'life'); SW = CarArt.as(car, 'wreck');
    placeProps(car, cond);
    mess(car, cond);
    wreck(car, cond, M);
    out.evs = events(car, M);
    // 授权开口清单：只有这些位置允许出现「洞」
    for (const ho of (car.holes || [])) out.auth.push([ho.x, ho.w, 'roof']);
    out.parts = P;
    out.skips = SKIP;
    // 分区档位：把每 60px 一档的局部档记下来，预览台与闸门都读得到（证明「不是一刀切」）
    out.zones = [];
    for (let x = sk.x0; x < sk.x1; x += 60) out.zones.push(lvlAt(x));
    CUR = '';
    return out;
  }
  // 远看不撒芝麻：屏幕上映不到 1px 的叙事碎点直接不画（阶段七按视距喂 far）
  function draw(pen, life, opt) {
    const px = (pen && pen.px) || 1, far = !!(opt && opt.far);
    // far = 这节车在屏幕远处：小于 4px 的叙事碎点整批不画（它们在屏幕上本来就糊成一团），
    // ≥4px 的裂缝、翘板、倒罐、翻椅仍然保留 —— 远看要看得出「这节车出过事」，但不必数清有几片玻璃。
    let parts = life.parts;
    if (far || px <= 0.6) parts = parts.filter(p => Math.max(p.w, p.h) >= 4);
    else parts = parts.filter(p => Math.max(p.w, p.h) * px >= 1);
    if (typeof CarFit !== 'undefined') return CarFit.draw(pen, { parts, shadow: [] }, { xform: opt && opt.xform });
    return 0;
  }

  // ---------- 自检：三条硬规矩都在这里 ----------
  function audit(life, sk, car, M) {
    CAR_ = car; MM = M; BASEC = life.cond;
    SP = CarArt.as(car, 'prop'); SL = CarArt.as(car, 'life'); SW = CarArt.as(car, 'wreck');          // audit 可能脱离 build 单独调用，先把上下文补齐
    const g = sk.g, bad = { float: [], hole: [], door: [], stair: [], auth: [], scale: [], blank: [], wall: [], budget: [] };
    const Hh = sk.sp.bodyH;
    for (const p of life.parts) {
      // ① 洞：标了 hole 的构件必须落在数据授权的开口里
      if (p.hole) {
        const ok = life.auth.some(a => p.x >= a[0] - 1 && p.x + p.w <= a[0] + a[1] + 1);
        if (!ok) bad.hole.push(p.kind + '@' + p.x + ' 画了洞，但关卡数据这里没有开口');
      }
      // ② 可行走地板带内不许出现「缺口色」：任何贴地构件都必须是实体，不能是暗洞材质
      if (p.y + p.h > g.floorY - 1 && p.y < g.floorY + 2 && (p.mat === 'grime' || p.hole))
        bad.hole.push(p.kind + '@' + p.x + ' 在地板线上画了缺口');
      // ③ 悬空：复用阶段三/四那套连通性证明（CarFit.reach）——
      //    从贴地件与已锚定的墙/顶件出发做 BFS，落不了地也连不到任何锚面的生活构件就是画在空中的。
      //    逐件找「一跳支撑」不行：一整簇悬空的小件会互相撑着骗过去。
      // ④ 不挡门、不挡台阶塔（身高带内一律算）
      if (p.y + p.h > g.floorY - Hh) {
        for (const d of (car.doors || []))
          if (p.x + p.w > d.x - 2 && p.x < d.x + (d.w || 14) + 2) bad.door.push(p.kind + '@' + p.x + ' 挡在门 ' + d.id + ' 前');
        for (const L of (car.links || []))
          if (p.x + p.w > L.x - 2 && p.x < L.exit.x1) bad.stair.push(p.kind + '@' + p.x + ' 挡在爬梯 ' + L.id + ' 的梯井或出梯口上');
      }
      // ⑤ 尺度：叙事构件不得高过角色（它们是「掉在地上的东西」）
      if (p.mount === 'floor' && p.kind.indexOf('wreck:wire') !== 0 && p.h > Hh * 1.2)
        bad.scale.push(p.kind + '@' + p.x + ' 高 ' + p.h + ' 超过 1.2H');
      // ⑥ 授权：破损/事件构件必须落在本车破损或事件窗口内
      if (p.kind.indexOf('ev:') === 0 && M && M.events) {
        const hit = M.events.some(e => e.x > car.x0 - 40 && e.x < car.x1 + 40 && ('ev:' + e.kind) === p.kind);
        if (!hit) bad.auth.push(p.kind + '@' + p.x + ' 这节车没有这个事件却画了它的细节');
      }
    }
    const air = (typeof CarFit !== 'undefined' ? CarFit.reach(FIT.parts.concat(life.parts), g.floorY) : [])
      .filter(p => life.parts.indexOf(p) >= 0);
    for (const p of air) bad.float.push(p.kind + '@' + p.x + ',' + p.y + ' 底边离地 ' + (g.floorY - p.y - p.h) + 'px，连不到地也连不到任何锚面');
    // ⑦ 墙上不许乱画：贴墙/贴顶构件必须留在墙带内，且不许盖住窗洞（窗帘除外）
    const win = (sk.openings || []).filter(o => o.kind === 'window');
    for (const p of life.parts) {
      if (p.mount !== 'wall' && p.mount !== 'ceiling') continue;   // mount:'roof' 是屋顶锚定，不走墙带规则
      if (p.y < g.roofY || p.y + p.h > g.floorY) bad.wall.push(p.kind + '@' + p.x + ',' + p.y + ' 画出墙带之外');
      if (p.mount === 'wall') for (const b of win)
        if (p.x < b.x + b.w && p.x + p.w > b.x && p.y < g.winSill && p.y + p.h > g.winHead)
          bad.wall.push(p.kind + '@' + p.x + ' 糊住了窗洞');
    }
    // ⑧ 破损预算：wreck:* 构件的数量不得超过数据里的可表现破损条目（美术不许自己加破损）
    const wreckN = life.parts.filter(p => p.kind.indexOf('wreck:') === 0).length;
    const budget = (car.damage || []).filter(d => CarLife.WRECK_OF[d.kind] && COND[lvlAt(d.x)].wreck).length;
    if (wreckN > budget * 12 + 6 * ((car.holes || []).length ? 3 : 0))
      bad.budget.push('wreck 构件 ' + wreckN + ' 条，破损预算只有 ' + budget + ' 处');
    if (!life.parts.length && life.cond >= 1) bad.blank.push('有生活细节的车却一件没画');
    return { ok: !Object.keys(bad).some(k => bad[k].length), bad, cond: life.cond, evs: life.evs };
  }

  return { COND, H, BASE: 2.2, RUIN_W: 2.2, raw: 0, WRECK_OF, lvlAt, conditionOf, build, draw, audit, COMBO, PROP, surfaceAt, blocked, spot, hz, px };
})();
