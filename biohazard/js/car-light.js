// 阶段六：灯光与运动中的视觉表现。
// 这一层不改任何几何与碰撞，只做三件事：
//   ① 光照：把「谁在发光、照到哪里、被谁挡住」算成一张可测量的光柱图（逐列遮挡，不是画个半透明椭圆）。
//      顶灯/阅读灯是暖的，应急带/设备屏是冷的，窗外光是随 TOD 变的 —— 画面不能只剩一种色调。
//   ② 窗景：每扇窗的景色锚到「这扇窗此刻在沿线的哪个位置」，于是车头与车尾必然不同景；
//      进出隧道按洞口深度做线性过渡（逐步减弱 / 平滑恢复），玻璃室内反射有上限，不许盖掉外景。
//   ③ 运动：只有声明了安装点的构件才摆（窗帘挂在导轨上、吊带挂在顶棚上、松动面板必须有破损授权），
//      不同物件不同相位与振幅，固定柜体与座椅一律不动；轮对按行驶距离转，通过台蒙皮随车钩轻微伸缩。
// 随时间变化的量全部由 (seed, 帧号) 推出，不读 Math.random；把时间冻住就是静态图。
const CarLight = (() => {
  const H = 36;                                   // 角色身高参照，与 CarFit/CarLife 同一把尺
  // ---------- 五类光源的分工 ----------
  // key=取色键，a=基准不透明度，r=横向半径，dir=down 竖直光柱 / along 贴地铺开，
  // survivesBlackout=断电后是否还亮
  const SRC = {
    ceiling:   { key: 'lampCol',  warm: 1, a: 0.22, r: 26, dir: 'down',  survivesBlackout: 0 },
    reading:   { key: 'lampCol',  warm: 1, a: 0.20, r: 11, dir: 'down',  survivesBlackout: 0 },
    daylight:  { key: 'sun',      warm: 0, a: 0.30, r: 0,  dir: 'down',  survivesBlackout: 1 },
    emergency: { key: 'lampCool', warm: 0, a: 0.16, r: 46, dir: 'along', survivesBlackout: 1 },
    screen:    { key: 'lampCool', warm: 0, a: 0.13, r: 12, dir: 'down',  survivesBlackout: 0 },
  };
  const KINDS = Object.keys(SRC);
  // 运动强度上限：频闪、摆动、振动、蒙皮伸缩各一个旋钮，验收时要能整体压下来
  const MOTION = { sway: 1.0, rattle: 1.0, flicker: 1.0, bellows: 1.0, max: 2.2 };
  const SCREEN_RE = /monitor|screen|console|panelBank|checkGate|radar|display|camera/i;
  const LOOSE_RE = /panel|hatch|cover|board/i;
  const FIXED_RE = /seat|berth|bunk|cabinet|counter|table|bench|rack|partition|workbench/i;
  const TUN_RAMP = 240;                            // 洞口两侧各 240px 做明暗过渡
  const REFLECT_FLOOR = 0.12;                      // 不在隧道时玻璃反射的上限（外景必须看得见）
  const REFLECT_MAX = 0.46;                        // 隧道里外景本来就是黑的，反射可以给满

  const h2 = (seed, i) => {                        // 与 TrainDraw 同一个哈希，保证同 seed 同画面
    let x = (Math.imul(seed | 0, 2654435761) + Math.imul(i | 0, 40503)) >>> 0;
    x ^= x >> 13; return ((Math.imul(x, 1274126177)) >>> 0) % 1000 / 1000;
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------- 遮挡体：谁会把光挡住 ----------
  // 剖面视角下，车厢内壁、顶棚、地板都是「背景」，光照到它们是把它照亮，不是被它挡住；
  // 真正能挡光的是立在剖面上的东西：隔断、铺位挡板、笼架、暖气片、窗帘，以及所有家具。
  // 第一版把 wall-knee / radiator 之类整幅墙面也当成遮挡体，自检于是报「光穿过墙」——
  // 那不是光穿透了结构，是把背景当成了结构。
  const OCCLUDE_RE = /partition|bulkhead|stall|cage|curtain|screen|locker|cabinet|berth|bunk|seat|counter|table|bench|crate|barrel|sack|machine|rack|bin|kit|gurney|net|trunk|case/i;
  function casters(sk, fit) {
    const list = [];
    for (const p of (sk.parts || [])) {
      if (p.see || p.noDraw) continue;
      if (p.w < 3 || p.h < 3) continue;
      if (!OCCLUDE_RE.test(p.kind || '')) continue;
      list.push([p.x, p.y, p.w, p.h, p.id || p.kind]);
    }
    for (const p of (fit && fit.parts ? fit.parts : [])) {
      if (p.w < 5 || p.h < 5) continue;
      if (p.mat === 'glass') continue;
      list.push([p.x, p.y, p.w, p.h, 'fit:' + (p.kind || p.mat)]);
    }
    const cols = {};
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      for (let c = Math.floor(b[0] / 4); c <= Math.floor((b[0] + b[2]) / 4); c++) {
        (cols[c] || (cols[c] = [])).push(i);
      }
    }
    return { list, cols };
  }
  // 贴地铺开的光（应急灯带）：从灯往两边推，撞到落地件就停 —— 柜子后面应该是暗的
  function firstHitSide(occ, y, x0, dir, far) {
    let x = x0;
    while (Math.abs(x - x0) < far) {
      const ids = occ.cols[Math.floor(x / 4)];
      if (ids) for (const i of ids) {
        const b = occ.list[i];
        if (y >= b[1] && y <= b[1] + b[3] && x >= b[0] && x <= b[0] + b[2]) return x;
      }
      x += dir * 2;
    }
    return x;
  }

  // ---------- 窗景：这扇窗此刻在沿线的哪个位置 ----------
  function windowView(car, o, S, M) {
    const lineX = o.x + (S ? S.trainX : 0);        // 车在编组里的位置 + 列车已经跑过的距离
    const z = M && M.zoneAt ? M.zoneAt(lineX) : null;
    return { lineX, zone: z ? z.kind : 'field', tunnel: tunnelAt(M, lineX) };
  }
  // 洞口深度 0~1：进洞后线性升到 1，出洞前线性降回 0，洞外恒 0 —— 「逐步」而不是「啪一下」
  function tunnelAt(M, x, ramp) {
    ramp = ramp === undefined ? TUN_RAMP : ramp;
    if (!M || !M.worldZones) return 0;
    for (const z of M.worldZones) {
      if (z.kind !== 'tunnel') continue;
      if (x >= z.x0 && x <= z.x1) return clamp(Math.min((x - z.x0) / ramp, (z.x1 - x) / ramp), 0, 1);
    }
    return 0;
  }
  const reflect = td => REFLECT_FLOOR + (REFLECT_MAX - REFLECT_FLOOR) * td;
  // 昼夜改造阶段二：窗光增益不再是「查三档表」，而是读连续相位。
  // 保留 todGain 是因为还有旧闸门按档名调用它；新代码一律走 phOf()。
  const todGain = tod => tod === 'night' ? 0.28 : tod === 'dusk' ? 0.72 : 1.0;
  // 相位来源优先级：色板自带的 ph（PAL_AT 造出来的一定有）→ 运行时 S.day.ph → 按档名兜底。
  // 为什么要三档兜底：本模块被无头工具直接调用时常常没有 S，只有色板。
  function phOf(S, p) {
    if (p && p.ph) return p.ph;
    if (S && S.day && S.day.ph) return S.day.ph;
    const t = (S && S.opt && S.opt.tod) || 'dusk';
    return { winGain: todGain(t), sunIn: { day: 0.10, dusk: 0.18, night: 0.05 }[t],
      reflectK: 1, starA: t === 'night' ? 1 : 0, lampGain: t === 'night' ? 1 : t === 'dusk' ? 0.55 : 0.08,
      cityLit: 0, p: t === 'day' ? 0 : t === 'night' ? 0.9 : 0.58 };
  }

  // ---------- 装配 ----------
  function build(car, sk, fit, life, M, S) {
    const LAMP = CarArt.as(car, 'lamp');   // 阶段七：灯光与动画的相位走自己那条随机流
    const g = sk.g, occ = casters(sk, fit), srcs = [];
    const push = (kind, x, y, o) => {
      const k = SRC[kind], sd = (LAMP + ((o && o.seed) | 0)) | 0;
      srcs.push(Object.assign({ kind, x: Math.round(x), y: Math.round(y), r: k.r, ph: h2(sd, 3) * 6.283,
        flick: (o && o.flick) || 0, seed: sd, win: o && o.win, zone: o && o.zone,
        sun: (o && o.sun) || 0, flame: (o && o.flame) || 0, tunnel: (o && o.tunnel) || 0, rects: [] }));
    };
    const 相位 = phOf(S, null);
    for (let li = 0; li < (car.lights || []).length; li++) {
      const L = car.lights[li];
      // 「线路完好」与「此刻点亮」是两件事，点亮集合由稳定 rank 决定（同 seed 同 p 逐盏一致）。
      if (!(typeof DayNight === 'undefined' ? L.on : DayNight.lampLit(相位, car.seed | 0, car.i, L, li))) continue;
      push('ceiling', L.x, L.y + 3, { seed: L.x | 0, flick: L.flicker });
    }
    for (const p of (fit ? fit.parts : [])) {
      if (p.lamp) push('reading', p.x + p.w / 2, p.y + p.h, { seed: (p.x * 3) | 0 });
      else if (SCREEN_RE.test(p.kind || '')) push('screen', p.x + p.w / 2, p.y + p.h / 2, { seed: (p.x * 5) | 0 });
    }
    for (const q of (life ? life.parts : [])) {
      if (q.lamp === 'safe') push('emergency', q.x + q.w / 2, q.y + 1, { seed: (q.x * 7) | 0 });
      else if (q.lamp === 'flame') push('reading', q.x + q.w / 2, q.y, { seed: (q.x * 11) | 0, flame: 1 });
    }
    // 每扇窗一条窗外光；景色/隧道深度按这扇窗自己的沿线位置取样
    const wins = (sk.openings || []).filter(v => v.kind === 'window');
    const sun = phOf(S, null).sunIn;
    for (const o of wins) {
      const v = windowView(car, o, S, M);
      push('daylight', o.x + o.w / 2, o.y + o.h, { seed: (o.x * 13) | 0, win: o, zone: v.zone, tunnel: v.tunnel, sun });
    }
    for (const s of srcs) s.rects = cast(s, occ, g, sk);
    // 埋在货堆里照不出任何一段的小灯（阅读灯被自己机箱挡死、屏幕贴在柜背上）直接不要：
    // 与其留一个「亮着却什么都不照」的假光源，不如把它摘掉并计数 —— 顶灯不许出现这种情况。
    let dropped = 0;
    const keep = srcs.filter(s => {
      if (s.rects.length) return true;
      if (s.kind === 'ceiling') return true;                 // 顶灯照不出东西是真 bug，留着给自检报
      dropped++; return false;
    });
    return { car, srcs: keep, occ, g, dropped, flex: bellows(car, sk, LAMP), sway: swayMap(car, sk, fit, M, LAMP) };
  }
  // 光柱/光带逐列算遮挡。输出 [x, y, w, h, 横向权重, 纵向衰减]，
  // 纵向切成 ≤16px 的小段，段与段之间既衰减又能沿斜方向错位 —— 窗外光因此是斜的。
  // 每一段都裁在本车轮廓以内：灯离端墙近时，光不该穿到邻车去（第一版没裁，自检报 830 段越界）。
  function cast(s, occ, g, sk) {
    const k = SRC[s.kind], out = [];
    const bx0 = sk.x0 + 2, bx1 = sk.x1 - 2;
    const put = (x, y, w, h, wg, fd) => {
      const a = Math.max(x, bx0), b = Math.min(x + w, bx1);
      if (b - a < 1) return;
      const y0c = Math.max(y, g.ceilY), y1c = Math.min(y + h, g.floorY);
      if (y1c - y0c < 1) return;
      out.push([a | 0, y0c | 0, (b - a) | 0, (y1c - y0c) | 0, wg, fd]);
    };
    if (k.dir === 'along') {
      const y = s.y, far = s.r;
      for (const dir of [-1, 1]) {
        const stop = firstHitSide(occ, y, s.x, dir, far);
        const a = Math.min(s.x, stop), b = Math.max(s.x, stop);
        for (let x = a; x < b; x += 2) {
          const d = Math.abs(x - s.x) / far;
          put(x, y - 2, 2, 5, Math.max(0, (1 - d) * 0.9), 1);
        }
      }
      return out;
    }
    // 低角度太阳把光铺得更宽（而不是画斜）：s.sun 由 TOD 给，白天窄、黄昏宽。
    const r = s.kind === 'daylight'
      ? Math.max(6, (s.win ? s.win.w : 16) / 2 - 1) * (1 + (s.sun || 0))
      : s.r;
    const y0 = s.y, y1 = g.floorY;
    // 窗外光在这个投影里是竖直的，不做斜射：剖面看的是纵向切面，光从对面墙上的窗来是
    // 朝屏幕外走的，画成斜的本来就没有依据；更要命的是每条光柱是一段 16px 高的矩形、
    // 只能记一个 x，一旦斜射，「遮挡判定用的 x」与「矩形实际覆盖的 x」就会错开，
    // 自检报出 92 段根本不存在的光穿透。低角度太阳的横向铺开交给宽度，不交给倾斜。
    const drift = 0;
    for (let cx = Math.ceil((s.x - r) / 2) * 2; cx <= s.x + r; cx += 2) {
      const d = r ? Math.abs(cx - s.x) / r : 0;
      const w = 1 - d * d;
      if (w <= 0.04) continue;
      // 逐小步往下走，走到被挡住为止。斜射的光每一层 x 都不一样，
      // 所以必须按「这一层自己的 x」判断遮挡 —— 第一版用中点的 x 统一判断，
      // 于是斜光从暖气片侧面穿了过去（自检 through 报的就是这个）。
      let y = y0, stop = y1;
      while (y + 2 < y1) {
        const f = (y - y0) / (y1 - y0);
        // 扫的是「这一步到下一步」这一条带，不是单个点：探针一步走 6px，
        // 只测一个点会整步跨过 5~6px 薄的挡光件（暖气片去掉后光柱变长，就是这么漏的）。
        const top = blockTop(occ, (cx + drift * f) | 0, y, y + 6, y0);
        if (top !== null) { stop = Math.max(top, y); break; }   // 停在障碍物的上沿
        y += 6;
      }
      const run = stop - y0;
      if (run < 3) continue;
      const n = Math.max(1, Math.ceil(run / 16));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        put((cx + drift * f0) | 0, (y0 + run * f0) | 0, 2, Math.max(1, (run * (f1 - f0)) | 0), w, 1 - 0.72 * f0);
      }
    }
    return out;
  }
  // 扫描带 [ya, yb] 里有没有挡光件：有就返回其中最靠上的上沿，没有返回 null。
  // 返回「上沿」而不是布尔值，光柱才会正好停在物体表面。
  // 必须按「一条带」而不是「一个点」判：探针一步走 6px，只测一个点会整步跨过
  // 5~6px 厚的挡光件（去掉暖气片之后光柱变长，就是这么漏掉麻袋堆的）。
  // y0 用来排除「光源自己站在上面的那层板」与发光体自己的外壳。
  function blockTop(occ, x, ya, yb, y0) {
    const ids = occ.cols[Math.floor(x / 4)];
    if (!ids) return null;
    let best = null;
    for (const i of ids) {
      const b = occ.list[i];
      if (x < b[0] || x > b[0] + b[2]) continue;
      if (b[1] >= yb || b[1] + b[3] <= ya) continue;         // 整条带都没碰到这个件
      if (b[1] < y0 + 1) continue;
      if (y0 >= b[1] && y0 <= b[1] + b[3]) continue;         // 光源原点在该件内 = 它自己的外壳
      if (best === null || b[1] < best) best = b[1];
    }
    return best;
  }
  // 车钩伸缩：通过台的蒙皮随列车运行在 ±1px 内呼吸，间距跟着变 —— 只画线，不动几何
  function bellows(car, sk, LAMP) {
    const out = [];
    for (const p of (sk.parts || [])) {
      if (!/^gang-(canopy|floor|roof)/.test(p.kind)) continue;
      out.push({ x: p.x, y: p.y, w: p.w, h: p.h, ph: h2((LAMP + p.x * 17) | 0, 5) * 6.283 });
    }
    return out;
  }
  // 会动的构件：窗帘（挂在导轨上）、吊带（挂在顶棚/扶杆上）、松动面板（必须有破损授权且每节车限量）。
  // 「少量故障效果」是字面意思：第一版把 shelf/door 全算成松动件，一节车 58 件在抖，
  // 看着不像故障像地震，所以收紧正则 + 每节车最多 3 件。
  function swayMap(car, sk, fit, M, LAMP) {
    const map = new Map();
    if (!fit) return map;
    let loose = 0;
    for (const p of fit.parts) {
      const kind = p.kind || '';
      let ent = null;
      if (kind === 'curtain' && p.mat === 'fabric' && p.h >= 8) {
        const s = h2((LAMP + p.x * 23) | 0, 1);
        // 摆幅按构件长度给（钟摆的 tip 位移正比于绳长），不是拍一个常数：
        // 第一版统一 1.2~3px，实测整张吊网 0.25 秒只改动 0.44% 的像素，肉眼读不出来。
        ent = { amp: clamp(p.h * 0.16, 2.2, 6.5) * (0.7 + s * 0.6), w: 0.9 + h2((LAMP + p.x * 29) | 0, 2) * 0.7,
          ph: s * 6.283, shear: 1, why: 'curtain' };
      } else if (hangs(p)) {
        // 同一张吊网（60px 一档）共用一个频率（是一整件东西），但沿 x 排成一道行波，
        // 所以既不会「100 根各自乱抖」，也不会「整片一模一样地同步」。
        const grp = (LAMP + Math.floor(p.x / 60) * 13) | 0;
        ent = { amp: clamp(p.h * 0.20, 1.8, 3.6) * (0.75 + h2((LAMP + p.x) | 0, 3) * 0.5), w: 1.5 + h2(grp, 2) * 0.6,
          ph: (p.x % 60) * 0.19 + h2((LAMP + p.x) | 0, 5) * 0.4, shear: 1, why: 'strap' };
      } else if (loose < 3 && LOOSE_RE.test(kind) && !FIXED_RE.test(kind) && authorized(car, p)) {
        const s = h2((LAMP + p.x * 41) | 0, 1);
        ent = { amp: 0.6 + s * 0.9, w: 0, ph: s * 6.283, shear: 0, why: 'rattle', rseed: (LAMP + p.x * 43) | 0 };
        loose++;
      }
      if (ent) {
        ent.anchor = anchorOf(sk, fit, p);
        map.set(p, ent);
      }
    }
    return map;
  }
  // 吊着的竖丝：挂在顶上的窄条（吊网竖丝、吊带）。第一版按 kind==='strap' 找，
  // 而 CarFit 的小件 kind 继承的是配方名（net / strappedCase / strapPost），一件都没匹配上。
  const hangs = p => p.mat === 'rubber' && p.w <= 2 && p.h >= 6 && (p.mount === 'ceiling' || p.mount === 'wall');
  // 「松动」不是想松就松：必须这一带有破损数据授权（与阶段五同一条规矩）
  function authorized(car, p) {
    for (const d of (car.damage || [])) {
      if ((d.kind === 'dent' || d.kind === 'crack' || d.kind === 'wire') && Math.abs(d.x - (p.x + p.w / 2)) < 46) return true;
    }
    return false;
  }
  // 摆动必须有安装点：顶上 8px 之内得有一个不动的构件挂着它（导轨、顶棚、扶杆）
  function anchorOf(sk, fit, p) {
    const cand = [];
    for (const q of (fit ? fit.parts : [])) if (q !== p && q.y + q.h <= p.y + 2 && q.y + q.h >= p.y - 8 &&
      q.x <= p.x + p.w && q.x + q.w >= p.x) cand.push(q.kind || q.mat);
    for (const q of (sk.parts || [])) if (q.y + q.h <= p.y + 2 && q.y + q.h >= p.y - 10 &&
      q.x <= p.x + p.w && q.x + q.w >= p.x) cand.push('sk:' + q.kind);
    return cand.length ? cand[0] : null;
  }

  // ---------- 时间相关量 ----------
  function weight(s, tsec, S) {
    const k = SRC[s.kind], dark = !!(S && S.blackout);
    const mot = (S && S.opt && S.opt.motion !== undefined) ? S.opt.motion : 1;
    if (dark && !k.survivesBlackout) return 0;
    let w = 1;
    if (s.kind === 'daylight') {
      w = phOf(S, null).winGain * (1 - s.tunnel);             // 进隧道：窗外光按洞口深度逐步归零
      if (w <= 0.01) return 0;
    }
    if (s.flame && mot > 0) w *= 0.72 + 0.28 * Math.sin(tsec * 6.3 + s.ph) * mot;
    if (s.flick && mot > 0 && MOTION.flicker > 0) {
      const f = Math.sin(tsec * s.flick + s.seed) > -0.35 ? 1 : 1 - 0.75 * mot;
      // 少量故障闪断：每 1/6 秒一格，按 seed 决定这一格是不是灭掉（不是每帧随机，所以不闪瞎眼）
      const cut = h2(s.seed, Math.floor(tsec * 6)) < 0.05 * MOTION.flicker * mot ? 0.1 : 1;
      w *= f * cut;
    }
    return w;
  }
  // 加减速与阵风把摆幅放大：行驶 / 加速 / 阵风三种状态画面必须不一样
  function gustK(S) {
    const g = Math.abs((S && S.gust) || 0), b = (S && S.boost) ? 1 : 0, sh = Math.abs((S && S.shake) || 0);
    return clamp(1 + 1.8 * Math.min(1, g / 1.2) + 0.9 * b + 0.05 * sh, 1, MOTION.max);
  }
  const frame = tsec => Math.floor(tsec * 24);

  // ---------- 绘制：光 ----------
  // 注意：S.opt.motion 只管「随时间的变化」（频闪、摆动、伸缩），不管光本身 ——
  // 「暂停动态效果」应该是把灯留在原位、只是不再闪不再晃，而不是把整层光照关掉。
  function draw(pen, L, S, tsec) {
    if (!L) return 0;
    const p = pen.p, mot = (S && S.opt && S.opt.motion !== undefined) ? S.opt.motion : 1;
    let n = 0;
    for (const s of L.srcs) {
      const k = SRC[s.kind], a = k.a * weight(s, tsec, S);
      if (a < 0.012) continue;
      // 夜里太阳光柱换成冷色玻璃光：按 starA 连续混，不是「到 night 档啪地换色」。
      pen.fill(k.key === 'sun' ? mix(p[k.key] || p.lampCol, p.glassHi, phOf(S, p).starA) : (p[k.key] || p.lampCol));
      for (const r of s.rects) {
        pen.alpha(a * r[4] * r[5]);
        // rects 是「世界坐标」算出来的（遮挡必须在世界里算），画之前要过一遍相机变换。
        // 漏掉这一步时整层光会钉死在屏幕左上角，实机看就是「加了光照层但车内毫无变化」。
        pen.rect(pen.X(r[0]), pen.Y(r[1]), r[2], r[3]);
        n++;
      }
    }
    pen.alpha(1);
    return n;
  }

  // ---------- 绘制：玻璃 + 反射（窗外景不再自绘，见函数体里那段说明）----------
  // 每扇窗仍单独过一遍裁切框，所有落笔都与洞口求交，绝不越出去。
  function drawWindows(pen, sk, S, M, views) {
    if (!pen.rect || !sk.openings) return 0;
    const p = pen.p, X = pen.X, Y = pen.Y, ph = phOf(S, p);
    let n = 0;
    for (const o of sk.openings) {
      if (o.kind !== 'window') continue;
      const v = (views && views.get && views.get(o.id)) || windowView(sk.car, o, S, M);
      const bx = X(o.x), by = Y(o.y), bw = o.w, bh = o.h;
      const box = [bx, by, bw, bh];
      const td = v.tunnel;
      // 窗外不再自绘：车壳本来就把窗留成**洞**（`CarArt` 的 glazing 标 `see: true`，洞不画东西），
      // `world()` 在车壳之前已经落笔，所以洞后面就是真正的世界 —— 远山、中景、隧道衬砌与检修灯、
      // 夜里的亮窗与城市灯，全都自带视差。原来这里压着三条文带 + 五个按 `h2(seed,i)` 造的方块
      // （种子只是 `lineX/3`，与 far/mid 层毫无关系），等于把世界挡住再贴一张假窗外 —— 合同明令
      // 禁止的「借夜色掩盖空白中远景」就是这个形状；第三、四阶段把远/中景真做出来了，这一层该让开。
      // 只保留玻璃本体与室内反射：反射强度仍由 `reflectK`/`winGain` 决定（它们唯一的像素出口）。
      // 夜里外面没有光源，而车壳还接着天光与自己车厢漏出来的光 —— 所以窗应当比墙**更暗**，
      // 这才是「夜里一眼看出哪里是窗」的物理来源（量具：_dt4_mid 第 2d 节，edge 章原来窗与
      // 上墙只差 6.0 档，几乎糊在一起）。alpha 只随「太阳下去多少」走：黄昏为 0，
      // 因此不会碰到「窗里吃 world」那条判据（它量在 0.58，本来就该完全透亮）。
      const 夜压 = Math.max(0, Math.min(1, 1 - ph.sunA * 1.6)) * 0.55 * (1 - td);
      if (夜压 > 0.02) { pen.alpha(夜压); cr(pen, box, bx, by, bw, bh, p.dark); pen.alpha(1); }
      pen.alpha(0.10 + 0.06 * (1 - td));
      cr(pen, box, bx, by, bw, bh, p.glass); pen.alpha(1);
      pen.alpha(reflect(td) * (0.55 + 0.45 * ph.winGain) * ph.reflectK);
      cr(pen, box, bx, by + bh * 0.30, bw, bh * 0.34, p.paintHi);   // 室内灯在玻璃上的一条倒影
      cr(pen, box, bx + bw * 0.10, by + 2, bw * 0.16, bh - 4, p.paint);
      pen.alpha(1);
      n++;
    }
    return n;
  }
  function cr(pen, box, x, y, w, h, c) {
    const x0 = Math.max(box[0], x), y0 = Math.max(box[1], y);
    const x1 = Math.min(box[0] + box[2], x + w), y1 = Math.min(box[1] + box[3], y + h);
    if (x1 <= x0 || y1 <= y0) return;
    pen.fill(c); pen.rect(x0, y0, x1 - x0, y1 - y0);
  }
  function mix(a, b, t) {                                   // 两个 #rrggbb 按比例插值（有限色板内的过渡）
    const pa = hex(a), pb = hex(b);
    if (!pa || !pb) return a;
    const c = v => Math.round(v).toString(16).padStart(2, '0');
    return '#' + c(pa[0] + (pb[0] - pa[0]) * t) + c(pa[1] + (pb[1] - pa[1]) * t) + c(pa[2] + (pb[2] - pa[2]) * t);
  }
  const hex = s => (typeof s === 'string' && s[0] === '#' && s.length === 7)
    ? [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)] : null;

  // ---------- 绘制：车钩蒙皮伸缩 ----------
  function drawFlex(pen, L, S, tsec) {
    if (!L || !L.flex.length) return 0;
    const mot = (S && S.opt && S.opt.motion !== undefined) ? S.opt.motion : 1;
    const k = MOTION.bellows * mot;
    if (k <= 0) return 0;
    const p = pen.p, X = pen.X, Y = pen.Y;
    let n = 0;
    for (const f of L.flex) {
      const s = Math.sin(tsec * 1.7 + f.ph) * k;             // ±1px 呼吸
      const x = X(f.x + s), y = Y(f.y), w = f.w, pitch = 7 + s * 0.8;
      pen.fill(p.panelEdge);
      for (let i = 0; i < w - 2; i += Math.max(3, pitch)) { pen.rect(x + i | 0, y, 1, f.h); n++; }
    }
    return n;
  }

  // ---------- 运动变换：交给 CarFit / CarLife 的绘制函数用 ----------
  // 传入的是「构件对象 → 摆动参数」的表（整列车共用一张，按对象索引，不会串车）。
  // 返回 (part, frac) => dx。frac=0 是构件顶端、1 是底端，剪切量随 frac 增大 = 上端固定下端摆。
  // 不在表里的构件返回 null —— 固定柜体与座椅走的就是这一条。
  function xform(map, S, tsec) {
    if (!map || !map.size) return null;
    const mot = (S && S.opt && S.opt.motion !== undefined) ? S.opt.motion : 1;
    if (mot <= 0) return null;
    const gk = gustK(S), fr = frame(tsec);
    return (p, frac) => {
      const e = map.get(p);
      if (!e) return null;                                   // null = 不动（固定柜体与座椅一律走这条）
      if (e.w === 0) return (h2(e.rseed | 0, fr + (e.ph * 100 | 0)) - 0.5) * 2 * e.amp * MOTION.rattle * mot;
      return Math.sin(tsec * e.w + e.ph) * e.amp * gk * (e.shear ? clamp(frac, 0, 1) : 1) * MOTION.sway * mot;
    };
  }

  // ---------- 自检 ----------
  function audit(L, sk, S, M) {
    const bad = { spill: [], through: [], dark: [], sync: [], fixed: [], anchor: [], reflect: [], monotonic: [] };
    const g = sk.g, car = sk.car;
    const box = [sk.x0, g.ceilY, sk.x1 - sk.x0, g.floorY - g.ceilY];
    let warm = 0, cool = 0;
    for (const s of L.srcs) {
      const k = SRC[s.kind];
      if (k.warm) warm++; else cool++;                        // 窗外光算冷色：暖室内 / 冷室外正是要求的对比
      for (const r of s.rects) {
        if (r[0] < box[0] - 1 || r[0] + r[2] > box[0] + box[2] + 1 || r[1] < box[1] - 1 || r[1] + r[3] > box[1] + box[3] + 1)
          bad.spill.push(s.kind + ' 光越出本车轮廓 @' + r[0] + ',' + r[1]);
        // 光柱中间不应该再出现挡光件（除了它自己停住的那一层）
        for (const b of L.occ.list) {
          if (b[2] < 5 || b[3] < 5) continue;
          if (r[0] + r[2] <= b[0] + 1 || r[0] >= b[0] + b[2] - 1) continue;
          if (r[1] + r[3] <= b[1] + 2 || r[1] >= b[1] + b[3]) continue;
          if (b[1] > r[1] + 2) bad.through.push(s.kind + ' 的光穿过了 ' + b[4] + ' @' + r[0]);
        }
      }
      if (!s.rects.length && s.kind === 'ceiling') bad.dark.push(s.kind + ' 亮着却照不出任何一段 @' + s.x);
    }
    if (!warm || !cool) bad.reflect.push('这一节车只有' + (warm ? '暖' : '冷') + '光，画面会只剩一种色调');
    // 摆动：悬挂件不许没有安装点、不许跨组同步、不许动到固定家具
    const seen = new Map();                                   // (频率,相位) → 第一次出现它的物件组
    L.sway.forEach((e, p) => {
      if (FIXED_RE.test(p.kind || '')) bad.fixed.push('固定家具 ' + p.kind + ' 不该动');
      if (!e.shear) return;
      if (!e.anchor) bad.anchor.push((p.kind || p.mat) + ' 在摆，但头顶 8px 内没有可挂的构件');
      // 同一张吊网（60px 一档）本来就是一整件东西：共频而沿 x 错相位是「行波」，不是同步摆动。
      // 只有跨组还撞成同一 (频率, 相位)，才是两件事在一起晃。
      const grp = (p.kind || p.mat) + '@' + Math.floor(p.x / 60);
      const sig = (e.w * 1000 | 0) + '/' + (e.ph * 1000 | 0);
      const first = seen.get(sig);
      if (first === undefined) seen.set(sig, grp);
      else if (first !== grp) bad.sync.push('两组不同物件同相同频摆动：' + first + ' 与 ' + grp);
    });
    // 反射上限：不在隧道时玻璃反射必须弱到看得见外景
    if (reflect(0) > 0.16) bad.reflect.push('无隧道时反射 ' + reflect(0) + ' 太浓，会盖住外景');
    if (reflect(1) > REFLECT_MAX + 0.001) bad.reflect.push('反射上限被突破');
    // 隧道过渡：沿一条线取样，检查「无跳变」且「升到位后不再回升」
    if (M && M.worldZones) {
      for (const z of M.worldZones) {
        if (z.kind !== 'tunnel') continue;
        let prev = tunnelAt(M, z.x0 - TUN_RAMP - 10), peak = false;
        for (let x = z.x0 - TUN_RAMP; x <= z.x1 + TUN_RAMP; x += 10) {
          const v = tunnelAt(M, x);
          if (Math.abs(v - prev) > 0.06) bad.monotonic.push('隧道 ' + z.x0 + ' 在 x=' + x + ' 从 ' + prev.toFixed(2) + ' 跳到 ' + v.toFixed(2));
          if (v >= 0.999) peak = true;
          else if (peak && v > prev + 0.001) bad.monotonic.push('隧道 ' + z.x0 + ' 出洞途中又回升（x=' + x + '）');
          prev = v;
        }
        if (prev !== 0) bad.monotonic.push('隧道 ' + z.x0 + ' 出洞后没有恢复到 0（停在 ' + prev.toFixed(2) + '）');
      }
    }
    const all = Object.keys(bad).reduce((t, k) => t.concat(bad[k]), []);
    return { ok: all.length === 0, bad, warm, cool };
  }

  return { SRC, KINDS, MOTION, H, TUN_RAMP, REFLECT_FLOOR, REFLECT_MAX, build, draw, drawWindows, drawFlex,
    xform, audit, windowView, tunnelAt, reflect, todGain, gustK, weight, casters, blockTop, mix, h2, frame };
})();
