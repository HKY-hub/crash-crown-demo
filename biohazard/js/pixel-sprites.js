// ============ 程序化像素角色生成器（替代照片精灵，统一像素风） ============
// 按单位参数在低分辨率网格（16×24 / 20×28 / 24×32）上以 fillRect 绘制角色多帧：
// idle（站姿）/ runA·runB（奔跑两相位）/ fire（射击，人类/英雄）/ atk（前扑撕咬，僵尸）
// 帧以离屏 canvas 缓存，标记 _px 供 ui.js 做像素化绘制（禁平滑、离散帧切换）。
// 单位键与 sprites.js FILES 对齐：human / hero_light / hero_xuan / z_normal / z_sprinter / z_boomer / z_mother
const PX_CHARS = (() => {
  const SCALE = 2; // 逻辑 1px → 2px 显示

  const UNITS = {
    human:      { skin: '#f2c49b', skinS: '#c99a6e', cloth: '#4d6fe0', clothS: '#3a53a8', clothD: '#22315e', hair: '#24355c', eye: '#0a0a0a', gun: true },
    hero_light: { skin: '#ffe8c2', skinS: '#e0c090', cloth: '#ffd54f', clothS: '#c9a83a', clothD: '#8a6a20', hair: '#b98a2a', eye: '#7a4a00', gun: true },
    hero_xuan:  { skin: '#f0d0c0', skinS: '#c9a090', cloth: '#ce93d8', clothS: '#9d6ab0', clothD: '#5a3a70', hair: '#3a2a4a', eye: '#3a1a5a', gun: true },
    z_normal:   { skin: '#6fae6a', skinS: '#4d7f4a', cloth: '#3a5a3a', clothS: '#2f4a2f', clothD: '#243a24', hair: '#2f4f2d', eye: '#ff5252', gun: false, z: true },
    z_sprinter: { skin: '#c96a4a', skinS: '#a04e30', cloth: '#5a2a2a', clothS: '#462020', clothD: '#331717', hair: '#6e3220', eye: '#ff5252', gun: false, z: true },
    z_boomer:   { skin: '#8a5aa8', skinS: '#6a4290', cloth: '#3a2a5a', clothS: '#2f204a', clothD: '#241838', hair: '#452a5c', eye: '#ff5252', gun: false, z: true, fat: true },
    z_mother:   { skin: '#5f9a70', skinS: '#43704e', cloth: '#2a4a3a', clothS: '#1f3a2c', clothD: '#162a20', hair: '#2a4a34', eye: '#ff5252', gun: false, z: true, big: true },
  };

  // 单位网格尺寸：母体 24×32 / 爆破 20×28 / 其余 16×24
  function unitSize(u) {
    if (u.big) return [24, 32];
    if (u.fat) return [20, 28];
    return [16, 24];
  }

  // 核心绘制：在一个 w×h 逻辑网格上画角色姿态（anim: idle/runA/runB/fire/atk）
  function drawUnit(ctx, w, h, u, anim) {
    const fat = u.fat ? 1 : 0, big = u.big ? 1 : 0;
    const legW = 3 + fat;                 // 腿宽（爆破更粗）
    const legH = 8, legY = h - legH;
    const tw = w - (fat ? 6 : big ? 8 : 8); // 躯干宽：人类8 / 爆破14 / 母体16
    const tx = Math.round((w - tw) / 2);
    const ty = legY - 8;                  // 躯干顶 = 腿顶 - 8
    const hw = fat ? 8 : big ? 10 : 6;    // 头宽
    const hx = Math.round((w - hw) / 2);
    const hy = ty - 6;                    // 脸顶
    const run = anim === 'runA' ? -1 : anim === 'runB' ? 1 : 0;
    const isFire = anim === 'fire';
    const isAtk = anim === 'atk';
    const leg1 = tx + 1, leg2 = tx + tw - legW - 1; // 两腿基准 x

    // ---- 腿 ----
    ctx.fillStyle = u.clothD;
    if (run !== 0) {
      const front = run < 0 ? leg1 - 1 : leg2 + 1;  // 前腿（抬起前伸）
      const back = run < 0 ? leg2 : leg1;           // 后腿（蹬地）
      ctx.fillRect(front, legY - 1, legW, legH);
      ctx.fillRect(back, legY, legW, legH);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(front - 1, h - 3, legW + 2, 2);  // 前鞋伸出
      ctx.fillRect(back + 1, h - 3, legW, 2);
    } else if (isFire) {
      ctx.fillRect(leg1 - 2, legY, legW, legH);     // 后腿退后
      ctx.fillRect(leg2 + 2, legY - 1, legW, legH + 1); // 前腿跨前
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(leg2 + 2, h - 3, legW, 2);
    } else {
      ctx.fillRect(leg1, legY, legW, legH);
      ctx.fillRect(leg2, legY, legW, legH);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(leg1, h - 3, legW, 2);
      ctx.fillRect(leg2, h - 3, legW, 2);
    }

    // ---- 躯干 ----
    ctx.fillStyle = u.cloth;
    ctx.fillRect(tx + (isFire ? 1 : 0), ty, tw, 8); // 开火后坐微倾
    ctx.fillStyle = u.clothS;
    ctx.fillRect(tx, ty, tw, 2);                     // 肩
    ctx.fillStyle = u.clothD;
    ctx.fillRect(tx, ty + 4, tw, 1);                 // 腰带
    if (u.z) {                                       // 僵尸破衣补丁
      ctx.fillStyle = u.clothS;
      ctx.fillRect(tx + 1, ty + 6, 3, 2);
      ctx.fillStyle = u.clothD;
      ctx.fillRect(tx + tw - 4, ty + 6, 2, 2);
    }

    // ---- 臂 + 武器 ----
    // u.noGun：保留手臂与射击姿态的手位，只**不预画通用枪与枪口闪光**。
    // 第 2 阶段要求消除"人物帧里预画一把通用枪 + 游戏层再叠另一把枪"的双枪问题；
    // 武器一律由 ArtDraw / drawHandGun 按权威锚点叠画。
    if (u.gun) {
      if (isFire) {
        // 平举射击：左臂护枪、右手握把、枪身平伸 + 枪口闪光
        ctx.fillStyle = u.clothS;
        ctx.fillRect(tx - 1, ty + 3, 2, 4);
        ctx.fillStyle = u.skin;
        ctx.fillRect(tx + tw - 1, ty + 4, 2, 2);      // 右手
        if (!u.noGun) {
          ctx.fillStyle = '#39424e';
          ctx.fillRect(tx + tw - 1, ty + 5, 3, 1);      // 机身
          ctx.fillRect(tx + tw + 2, ty + 5, 4, 1);      // 枪管
          ctx.fillStyle = '#ffe94a';
          ctx.fillRect(tx + tw + 6, ty + 5, 2, 1);      // 枪口闪光
        }
      } else {
        // 持枪戒备：右手持枪口斜下，左臂垂
        ctx.fillStyle = u.clothS;
        ctx.fillRect(tx - 1, ty + 2, 2, 5);
        ctx.fillStyle = u.skin;
        ctx.fillRect(tx + tw - 1, ty + 4, 2, 2);
        if (!u.noGun) {
          ctx.fillStyle = '#39424e';
          ctx.fillRect(tx + tw, ty + 6, 2, 1);          // 机身
          ctx.fillRect(tx + tw + 2, ty + 6, 2, 1);      // 枪管
          ctx.fillStyle = '#2c3640';
          ctx.fillRect(tx + tw - 1, ty + 7, 3, 1);      // 枪托
        }
      }
    } else if (isAtk) {
      // 僵尸前扑：双臂前伸 + 尖爪
      ctx.fillStyle = u.skin;
      ctx.fillRect(tx - 3, ty + 2, 5, 2);             // 左臂
      ctx.fillRect(tx + tw - 2, ty + 3, 5, 2);        // 右臂
      ctx.fillStyle = u.skinS;
      ctx.fillRect(tx - 4, ty + 2, 1, 1); ctx.fillRect(tx - 4, ty + 3, 1, 1);
      ctx.fillRect(tx + tw + 3, ty + 3, 1, 1); ctx.fillRect(tx + tw + 3, ty + 4, 1, 1);
    } else {
      ctx.fillStyle = u.clothS;
      ctx.fillRect(tx - 1, ty + 2, 2, 5);
      ctx.fillRect(tx + tw - 1, ty + 2, 2, 5);
    }

    // ---- 头 ----
    ctx.fillStyle = u.hair;
    ctx.fillRect(hx - (big ? 2 : 0), hy - 1, hw + (big ? 4 : 0), 2 + (big ? 1 : 0)); // 发顶
    ctx.fillStyle = u.skin;
    ctx.fillRect(hx, hy, hw, 6);                       // 脸
    ctx.fillStyle = u.skinS;
    ctx.fillRect(hx, hy + 1, 2, 5);                    // 脸侧阴影
    ctx.fillStyle = u.eye;
    ctx.fillRect(hx + 2, hy + 3, 1, 1);                // 左眼
    ctx.fillRect(hx + 4, hy + 3, 1, 1);                // 右眼
    if (u.z && isAtk) {                                // 张嘴撕咬
      ctx.fillStyle = u.clothD;
      ctx.fillRect(hx + 2, hy + 5, 4, 2);
      ctx.fillStyle = '#8a1a1a';
      ctx.fillRect(hx + 4, hy + 5, 2, 1);              // 舌/血
    }
  }

  const cache = {};

  // anim 取 'idle' | 'run'（frame 0/1 → runA/runB）| 'fire' | 'atk'
  // noGun=true 时不预画通用枪与枪口闪光（第 2 阶段：消除双枪），武器由叠画层负责
  function get(unit, anim, frame, noGun) {
    const u0 = UNITS[unit] || UNITS.human;
    const u = noGun ? Object.assign({}, u0, { noGun: true }) : u0;
    const a = anim === 'run' ? (frame ? 'runB' : 'runA') : anim;
    const k = unit + '_' + a + (noGun ? '_ng' : '');
    if (cache[k]) return cache[k];
    const [w, h] = unitSize(u);
    const c = makePixelFrame(w, h, SCALE, (ctx, W, H) => drawUnit(ctx, W, H, u, a));
    cache[k] = c;
    return c;
  }

  function preload() {
    for (const unit in UNITS) {
      get(unit, 'idle');
      get(unit, 'run', 0);
      get(unit, 'run', 1);
      get(unit, UNITS[unit].gun ? 'fire' : 'atk');
      if (UNITS[unit].gun) {
        get(unit, 'idle', 0, true);
        get(unit, 'run', 0, true);
        get(unit, 'run', 1, true);
        get(unit, 'fire', 0, true);
      }
    }
  }

  return { get, preload, UNITS };
})();

if (typeof window !== 'undefined') PX_CHARS.preload();
