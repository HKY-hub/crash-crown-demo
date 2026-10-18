// ============ 渲染与 UI ============
const UI = (() => {
  const killfeedEl = () => document.getElementById('killfeed');
  const msgEl = () => document.getElementById('centerMsg');
  let feed = [];
  let msgTimer = null;

  // ---------- 关卡主题调色板（theme 驱动背景 / 地形 / 装饰 / 氛围） ----------
  const THEMES = {
    city: {
      sky: ['#070d18', '#0d1a1e', '#122a1f'],
      celestial: { type: 'moon', color: '200,255,210', x: 760 },
      far: '#2a4a3c', near: '#1c2a24',
      ground: { base: '#3c312c', top: '#4a8f3f' },
      wood: '#7a5c46', stone: '#5d6770', oneway: '#8d6e63',
      fog: 'rgba(20,40,35,0.12)', vignette: 'rgba(0,0,0,0.24)',
      par: 'city', accent: '255,220,120',
    },
    dock: {
      sky: ['#2a1226', '#3d1f33', '#4a2c24'],
      celestial: { type: 'sun', color: '255,180,110', x: 830 },
      far: '#4a2c30', near: '#2e1c1c',
      ground: { base: '#4a3a32', top: '#8a7a5a' },
      wood: '#8a6a4a', stone: '#5d6470', oneway: '#a1887f',
      fog: 'rgba(90,40,40,0.10)', vignette: 'rgba(40,10,20,0.24)',
      par: 'dock', accent: '255,200,120',
    },
    station: {
      sky: ['#2a1410', '#3a2214', '#4a2e18'],
      celestial: { type: 'sun', color: '255,150,70', x: 700 },
      far: '#4a2a18', near: '#2a1c12',
      ground: { base: '#4a3a2a', top: '#8a7a58' },
      wood: '#8a6a48', stone: '#6a5a48', oneway: '#a1887f',
      fog: 'rgba(90,50,25,0.12)', vignette: 'rgba(30,10,5,0.22)',
      par: 'station', accent: '255,190,110',
    },
    tunnel: {
      // 地下隧道：整体抬亮一档并保留冷蓝调。旧值天空近黑(#04060a)+vignette 0.42，
      // 玩家分不清可站面与坑沿（视觉验收问题 1，属可玩性而非观感）
      sky: ['#0b141c', '#122430', '#1a3444'],
      celestial: null,
      far: '#1b3340', near: '#14262f',
      ground: { base: '#3b4248', top: '#5f8f74' },
      wood: '#5a5344', stone: '#4a555e', oneway: '#6b8a99',
      fog: 'rgba(10,26,34,0.20)', vignette: 'rgba(0,0,0,0.24)',
      par: 'tunnel', accent: '140,240,255',
    },
    lab: {
      sky: ['#0a1620', '#0e2030', '#122838'],
      celestial: null,
      far: '#163a48', near: '#102028',
      ground: { base: '#37444a', top: '#6a9a8a' },
      wood: '#5a6a5a', stone: '#4a5a62', oneway: '#78909c',
      fog: 'rgba(30,80,100,0.12)', vignette: 'rgba(5,15,25,0.26)',
      par: 'lab', accent: '140,225,255',
    },
    finale: {
      sky: ['#1c0504', '#2e0a06', '#3f120a'],
      celestial: { type: 'ember', color: '255,120,40', x: 480 },
      far: '#3a1410', near: '#260c08',
      ground: { base: '#3a2c22', top: '#7a4a2a' },
      wood: '#4a3a28', stone: '#4a4038', oneway: '#6d4c41',
      fog: 'rgba(60,15,8,0.16)', vignette: 'rgba(20,0,0,0.30)',
      par: 'finale', accent: '255,120,60',
    },
    // 末世废土 · 废弃公路服务区：全主题唯一的高明度档（阴天扬尘白昼）。
    // 差异化走「明度档位」而不是色相 —— 灰棕废土色相必然和 dock/city 糊在一起。
    // 阴天 → 无 celestial、无星点；白天对比度低 → vignette 必须更深才压得住 HUD 白字。
    highway: {
      sky: ['#6e6a5e', '#8a8073', '#a89a82'],
      celestial: null, stars: false,
      far: '#7d7466', near: '#5f584c',
      ground: { base: '#5a5148', top: '#7a6f5e' },
      wood: '#7d6a4e', stone: '#6b6b66', oneway: '#8a7f6a',
      fog: 'rgba(150,140,120,0.10)', vignette: 'rgba(40,35,25,0.20)',
      par: 'highway', accent: '255,214,110',
    },
  };
  // 建筑材质调色板（地形材质分支 / 建筑立面共用）
  // 四种材质必须在夜景下靠色相+明度双轴拉开：砖暖红 / 木黄褐 / 金属冷蓝灰 / 混凝土中性亮灰。
  // 旧值 brick(#5d6770) 与 concrete(#5a5f66) 同为蓝灰，肉眼无法区分（视觉验收问题 3）。
  const MAT_DRAW = {
    brick:    { base: '#7b4b3a', line: 'rgba(0,0,0,0.32)',    accent: 'rgba(255,190,140,0.12)' },
    wood:     { base: '#8a6338', line: 'rgba(0,0,0,0.28)',    accent: 'rgba(255,225,160,0.12)' },
    metal:    { base: '#48586a', line: 'rgba(0,0,0,0.34)',    accent: 'rgba(255,190,90,0.60)' },
    concrete: { base: '#6b7076', line: 'rgba(0,0,0,0.26)',    accent: 'rgba(255,255,255,0.10)' },
  };
  function currentTheme() {
    const st = level.stages && level.stages[(game && game.stage) || 0];
    return THEMES[st && st.theme] || THEMES.city;
  }

  // 渲染帧间隔（用于动作平滑器的阻尼过渡）
  let _lastFrameT = performance.now();
  function _frameDt() {
    const n = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (n - _lastFrameT) / 1000));
    _lastFrameT = n;
    return dt;
  }

  // 竖向分带渐暗（暗角 / 薄雾 / 隧道顶光共用）。
  // 带高必须足够小：旧版暗角是 5 条 16px、薄雾是 4 条 22px、天空是 14 条 38px，
  // 相邻带之间 alpha 差 0.026~0.05，在深色天空上就是「屏幕上几条横线」（用户反馈）。
  // 带高 4~6px、单带 alpha 差 <0.007 时，8bit 下不足一个色阶，横线看不出来，
  // 而实现仍然是 fillRect 拼像素带，不引入平滑渐变 API。
  function bandFade(ctx, rgb, x, y0, w, h, a0, a1, band, axis) {
    const span = axis === 'x' ? w : h;
    const n = Math.max(1, Math.round(span / band));
    const bs = Math.ceil(span / n);
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? a1 : a0 + (a1 - a0) * (i / (n - 1));
      ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
      if (axis === 'x') pxRect(ctx, x + i * bs, y0, bs, h);
      else pxRect(ctx, x, y0 + i * bs, w, bs);
    }
  }

  // 分层像素条带天空：sky 三色阶分段插值 → 细像素带（禁止平滑渐变，但带要细到看不出横线）
  function drawSkyBands(ctx, th) {
    const H = CFG.CH, BANDS = 72, bh = Math.ceil(H / BANDS);
    for (let i = 0; i < BANDS; i++) {
      const t = (i + 0.5) / BANDS;
      ctx.fillStyle = _bandColor(th.sky, t);
      ctx.fillRect(0, i * bh, CFG.CW, bh);
    }
  }

  // ---------- 世界背景（主题驱动的多层视差，像素条带天空） ----------
  function drawBackground(ctx, cam) {
    const th = currentTheme();
    drawSkyBands(ctx, th);
    pxStars(ctx, cam, th);
    if (th.celestial) drawCelestial(ctx, cam, th);
    drawParallaxFar(ctx, cam, th);
    drawParallaxNear(ctx, cam, th);
  }

  // 三色阶分段插值 → rgb 字符串（像素条带颜色）
  function _mixHex(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  }
  function _bandColor(sky, t) {
    const c = t <= 0.5 ? _mixHex(sky[0], sky[1], t * 2) : _mixHex(sky[1], sky[2], (t - 0.5) * 2);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // 像素星点 / 霓虹光点（世界坐标确定性伪随机，随视差平移取整）
  function pxStars(ctx, cam, th) {
    if (th.par === 'tunnel' || th.stars === false) return;   // 阴天白昼上有白点就是 bug
    for (let wx = 0; wx < level.worldW; wx += 33) {
      const sx = wx - cam.x * 0.1;
      if (sx < -4 || sx > CFG.CW + 4) continue;
      let s = ((wx * 2654435761) >>> 0) || 1;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      if (rnd() < 0.15) continue;
      const sy = px(rnd() * CFG.CH * 0.4);
      const tw = rnd() < 0.22 ? 2 : 1;
      const alpha = (0.2 + rnd() * 0.5) * (th.par === 'finale' ? 0.7 : 1);
      ctx.fillStyle = th.par === 'finale'
        ? 'rgba(255,150,70,' + alpha.toFixed(3) + ')'
        : 'rgba(200,240,255,' + alpha.toFixed(3) + ')';
      ctx.fillRect(px(sx), sy, tw, tw);
    }
  }

  function drawCelestial(ctx, cam, th) {
    const c = th.celestial;
    const cx = px(c.x - cam.x * 0.05);
    const cy = 90;
    if (c.type === 'moon') {
      ctx.fillStyle = `rgba(${c.color},0.14)`;
      pxCircle(ctx, cx, cy, 54);
      ctx.fillStyle = `rgba(${c.color},0.95)`;
      pxCircle(ctx, cx, cy, 32);
      ctx.fillStyle = `rgba(${c.color},0.45)`;
      pxCircle(ctx, cx - 10, cy - 4, 5);
      pxCircle(ctx, cx + 9, cy + 8, 4);
      pxCircle(ctx, cx + 2, cy - 12, 3);
    } else if (c.type === 'sun') {
      // 一层光晕 + 本体。旧版是 110/66/30 三层硬边圆 + 四根刻度短线，
      // 在夜景里读起来就是一个「同心靶环 / 线圈」（用户反馈的线圈观感同属一类）。
      ctx.fillStyle = `rgba(${c.color},0.10)`;
      pxCircle(ctx, cx, cy + 4, 74);
      ctx.fillStyle = `rgba(${c.color},0.9)`;
      pxCircle(ctx, cx, cy, 26);
      ctx.fillStyle = `rgba(255,255,255,0.18)`;
      pxCircle(ctx, cx - 6, cy - 6, 9);
    } else {
      // ember：最终防线燃烧天际的像素火球 + 火星
      const fl = 0.6 + 0.4 * Math.sin(performance.now() / 260);
      ctx.fillStyle = `rgba(${c.color},${(0.14 * fl).toFixed(3)})`;
      pxCircle(ctx, cx, cy + 20, 120);
      ctx.fillStyle = `rgba(${c.color},${(0.3 * fl).toFixed(3)})`;
      pxCircle(ctx, cx, cy + 12, 64);
      ctx.fillStyle = `rgba(${c.color},${(0.8 * fl).toFixed(3)})`;
      pxCircle(ctx, cx, cy, 26);
      ctx.fillStyle = '#ffd54f';
      pxCircle(ctx, cx - 4, cy - 2, 10);
      for (let i = 0; i < 8; i++) {
        const ex = px(cx + ((i * 47) % 76) - 38), ey = px(cy + ((i * 31) % 42) - 20);
        const efl = 0.5 + 0.5 * Math.sin(performance.now() / 140 + i * 2.1);
        ctx.fillStyle = `rgba(255,170,60,${(0.4 + efl * 0.4).toFixed(3)})`;
        ctx.fillRect(ex, ey, 2, 2);
      }
    }
  }

  function drawParallaxFar(ctx, cam, th) {
    const par = th.par;
    const now = performance.now();
    if (par === 'tunnel') {
      // 隧道：顶部工字钢 + 远处管道圆口（像素圆）
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let wx = 0; wx < level.worldW; wx += 200) {
        const sx = wx - cam.x * 0.2;
        if (sx < -20 || sx > CFG.CW) continue;
        pxRect(ctx, sx, 0, 14, CFG.CH - 130);
      }
      for (let wx = 0; wx < level.worldW; wx += 170) {
        const sx = wx - cam.x * 0.16;
        if (sx < -180 || sx > CFG.CW + 180) continue;
        ctx.fillStyle = 'rgba(22,38,46,0.6)';
        pxCircle(ctx, sx + 50, 170, 40);
        ctx.fillStyle = 'rgba(12,22,28,0.9)';
        pxCircle(ctx, sx + 50, 170, 24);
        ctx.fillStyle = `rgba(${th.accent},0.07)`;
        pxCircle(ctx, sx + 50, 170, 18);
      }
    } else if (par === 'dock') {
      // 港口：岸桥剪影（塔身 + 吊臂 + 垂钩货柜）+ 落地货柜堆
      // 旧版在 CFG.CH-190/-224 处画了两块半透明货柜，既没有塔身支撑也不在地面上 → 天上飘着两个方块
      const base = CFG.CH - 66;
      for (let wx = 0; wx < level.worldW; wx += 200) {
        const sx = wx - cam.x * 0.2;
        if (sx < -140 || sx > CFG.CW + 140) continue;
        const h = 130 + ((wx * 131) % 50);
        const top = base - h;
        ctx.fillStyle = 'rgba(60,40,40,0.55)';
        pxRect(ctx, sx + 24, top, 8, h);                       // 塔身（底边落在地平线）
        pxRect(ctx, sx, top - 8, 96, 8);                       // 吊臂
        pxRect(ctx, sx + 78, top, 3, 26);                      // 吊臂拉杆
        pxRect(ctx, sx + 78, top + 26, 3, 18);                 // 吊绳
        ctx.fillStyle = 'rgba(255,200,120,0.13)';
        pxRect(ctx, sx + 68, top + 44, 24, 13);                // 吊着的货柜（挂在绳端）
        ctx.fillStyle = 'rgba(60,40,40,0.45)';
        pxRect(ctx, sx + 40, top - 18, 14, 10);                // 司机室
        const n = 2 + ((wx * 7) % 3);                          // 落地货柜堆
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(74,44,48,0.55)' : 'rgba(56,38,38,0.55)';
          pxRect(ctx, sx - 46, base - 13 * (i + 1), 60, 13);
        }
      }
    } else if (par === 'highway') {
      // 废弃公路：断裂高架（每三段留一处断口）+ 输电塔 + 倒伏广告牌
      // 断口是这张图的记忆点，桥面不要铺满
      const base = CFG.CH - 46;
      for (let wx = 0; wx < level.worldW; wx += 480) {
        const sx = wx - cam.x * 0.2;
        if (sx < -520 || sx > CFG.CW + 520) continue;
        const gap = (wx / 480) % 3 === 2;
        ctx.fillStyle = 'rgba(96,90,78,0.55)';
        if (!gap) pxRect(ctx, sx, base - 132, 384, 26);                   // 桥面
        for (const pier of [26, 150, 274, 356]) {                         // 桥墩
          if (gap && (pier === 150 || pier === 274)) continue;
          pxRect(ctx, sx + pier, base - 106, 12, 106);
        }
        if (gap) {                                                        // 断口斜切残端
          ctx.fillStyle = 'rgba(88,82,70,0.55)';
          pxRect(ctx, sx + 150, base - 106, 12, 58);
          pxRect(ctx, sx + 162, base - 106, 22, 10);
        }
        ctx.fillStyle = 'rgba(84,78,68,0.45)';                            // 输电塔
        pxRect(ctx, sx + 420, base - 196, 6, 196);
        pxRect(ctx, sx + 406, base - 190, 34, 5);
        pxRect(ctx, sx + 410, base - 168, 26, 5);
        pxRect(ctx, sx + 414, base - 146, 18, 5);
      }
      for (let wx = 240; wx < level.worldW; wx += 960) {                  // 倒伏广告牌
        const sx = wx - cam.x * 0.28;
        if (sx < -120 || sx > CFG.CW + 120) continue;
        ctx.fillStyle = 'rgba(70,64,56,0.5)';
        pxRect(ctx, sx, base - 24, 48, 20);
        pxRect(ctx, sx + 10, base - 8, 6, 8);
        pxRect(ctx, sx + 30, base - 14, 6, 14);
      }
      bandFade(ctx, '60,54,46', 0, CFG.CH - 70, CFG.CW, 70, 0, 0.18, 5);
    } else if (par === 'station') {
      // 车站：拱顶大厅（像素拱）+ 钟楼
      for (let wx = 0; wx < level.worldW; wx += 180) {
        const sx = wx - cam.x * 0.2;
        if (sx < -120 || sx > CFG.CW + 120) continue;
        const h = 120 + ((wx * 97) % 45);
        ctx.fillStyle = 'rgba(70,40,25,0.5)';
        pxArch(ctx, sx + 64, CFG.CH - 70, h * 0.6);
        pxRect(ctx, sx, CFG.CH - 70 - h * 0.6, 128, h * 0.6 + 40);
        if (wx % 2 === 0) {
          ctx.fillStyle = 'rgba(84,48,28,0.55)';
          pxRect(ctx, sx + 48, CFG.CH - 70 - h * 0.6 - 42, 30, 42);
          ctx.fillStyle = 'rgba(255,190,110,0.7)';
          pxRect(ctx, sx + 56, CFG.CH - 70 - h * 0.6 - 56, 14, 14);
        }
      }
    } else if (par === 'lab') {
      // 实验室：方块楼 + 冷光玻璃带
      for (let wx = 0; wx < level.worldW; wx += 170) {
        const sx = wx - cam.x * 0.2;
        if (sx < -120 || sx > CFG.CW + 120) continue;
        const h = 120 + ((wx * 83) % 50);
        ctx.fillStyle = 'rgba(30,70,90,0.5)';
        pxRect(ctx, sx, CFG.CH - 82 - h, 116, h + 62);
        ctx.fillStyle = 'rgba(140,225,255,0.08)';
        for (let r = 0; r < Math.floor(h / 24); r++)
          pxRect(ctx, sx + 16, CFG.CH - 82 - h + 12 + r * 24, 34, 9);
        ctx.fillStyle = 'rgba(140,225,255,0.06)';
        pxRect(ctx, sx + 58, CFG.CH - 82 - h + 10, 44, h - 10);
      }
    } else if (par === 'finale') {
      // 燃烧废墟 + 像素火光
      for (let wx = 0; wx < level.worldW; wx += 170) {
        const sx = wx - cam.x * 0.2;
        if (sx < -120 || sx > CFG.CW + 120) continue;
        const h = 90 + ((wx * 71) % 60);
        ctx.fillStyle = 'rgba(52,18,12,0.6)';
        pxRect(ctx, sx, CFG.CH - 90 - h, 42, h + 52);
        ctx.fillStyle = 'rgba(52,18,12,0.45)';
        pxRect(ctx, sx + 48, CFG.CH - 70 - h * 0.7, 48, h * 0.7 + 30);
        const fl = 0.4 + 0.5 * Math.abs(Math.sin(now / 300 + wx));
        ctx.fillStyle = `rgba(255,120,40,${(0.10 + fl * 0.12).toFixed(3)})`;
        pxCircle(ctx, sx + 22, CFG.CH - 92 - h, 14);
      }
    } else {
      // city：高楼剪影 + 窗户光点（像素窗格）
      const bw = 90, bh = 120;
      for (let wx = 0; wx < level.worldW; wx += bw) {
        const sx = wx - cam.x * 0.2;
        if (sx < -bw || sx > CFG.CW) continue;
        const h = bh + ((wx * 2654435761 % 53) * 3 | 0);
        const y = CFG.CH - 70 - h;
        const a = 0.18 + ((wx * 97) % 30) / 200;
        ctx.fillStyle = `rgba(40,70,60,${a.toFixed(3)})`;
        pxRect(ctx, sx, y, bw - 12, h + 70);
        ctx.fillStyle = `rgba(${th.accent},${(0.12 + ((wx * 13) % 10) / 200).toFixed(3)})`;
        for (let r = 0; r < Math.floor(h / 26); r++)
          for (let c = 0; c < 2; c++)
            if (((wx + r * 7 + c * 31) % 4) < 2)
              pxRect(ctx, sx + 14 + c * 34, y + 14 + r * 26, 8, 10);
      }
    }
  }

  function drawParallaxNear(ctx, cam, th) {
    for (let wx = 0; wx < level.worldW; wx += 260) {
      const sx = wx - cam.x * 0.55;
      if (sx < -300 || sx > CFG.CW + 300) continue;
      ctx.fillStyle = th.near + '8c';
      const hh = 60 + ((wx * 131) % 40);
      pxRect(ctx, sx, CFG.CH - 40 - hh, 120, hh + 40);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      pxRect(ctx, sx + 90, CFG.CH - 40 - hh + 10, 24, 16);
    }
  }

  // ---------- 地形（像素化：取整矩形 + 抖动噪点 + 硬边描边） ----------
  // oneway 平台的支撑柱（视觉验收问题 2：平台只画成一块悬空木板，是全场最「假」的元素）。
  // 逐条腿单独向下探地面：跨在坑沿上的平台只会有一侧立得住，不会出现穿坑立柱。
  // 柱色取主题石材并压暗，保证支撑比板面本身更不抢眼。
  function drawOnewaySupports(ctx, th, s, sx, sy) {
    const bottom = sy + s.h;
    const legTop = s.y + s.h;
    let any = false;
    for (const off of [6, Math.max(8, s.w - 10)]) {
      const gy = Level.groundBelow(s.x + off, legTop, 4);
      if (!(gy > legTop + 6)) continue;
      const h = gy - legTop;
      const lx = px(sx + off);
      ctx.fillStyle = th.stone;
      pxRect(ctx, lx, bottom, 4, h);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      pxRect(ctx, lx, bottom, 1, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      pxRect(ctx, lx + 3, bottom, 1, h);
      pxRect(ctx, lx - 3, bottom + h - 5, 10, 5);   // 柱脚
      any = true;
    }
    if (!any) return;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    pxRect(ctx, sx + 6, bottom, Math.max(4, s.w - 14), 3);   // 柱头托梁：把两腿连成「托着板」
  }

  // 材质面板：地形实心块与建筑立面共用。
  // 之前只有地形分支画纹理，建筑 visH-physH 那段立面是纯色块 → 攻防图 210 高的塔楼
  // 上半光滑、下半混凝土噪点，中间一条明显的「拼接缝」。
  function matBody(ctx, m, mat, x, y, w, h, seed, edge) {
    ctx.fillStyle = m.base;
    pxRect(ctx, x, y, w, h);
    if (edge) pxOutline(ctx, x, y, w, h, 'rgba(0,0,0,0.35)');
    if (mat === 'brick') {
      // 错缝砖：横缝行 + 间隔竖缝
      for (let r = 0; r < Math.floor(h / 24); r++) {
        ctx.fillStyle = m.line;
        pxRect(ctx, x, y + 8 + r * 24, w, 2);
        const off = (r % 2) * 14;
        for (let bx = off; bx < w; bx += 28) pxRect(ctx, x + bx, y + 4 + r * 24, 2, 6);
      }
    } else if (mat === 'wood') {
      ctx.fillStyle = m.line;
      for (let bx = 6; bx < w; bx += 14) pxRect(ctx, x + bx, y + 2, 2, h - 4);
    } else if (mat === 'metal') {
      ctx.fillStyle = m.line;
      for (let ry = 6; ry < h; ry += 22) pxRect(ctx, x, y + ry, w, 2);
      ctx.fillStyle = m.accent;
      for (let ry = 12; ry < h; ry += 22) { pxRect(ctx, x + 4, y + ry, 3, 3); pxRect(ctx, x + w - 7, y + ry, 3, 3); }
    } else {
      pxNoise(ctx, x + 2, y + 2, w - 4, h - 4, m.line, seed, 0.10);
    }
  }

  // 该点是否被实心块盖住：用来判断地面段两端是不是真坑沿（PvP 图地面是拼块，不能每块都画坑沿）
  function coveredAt(x, y) {
    for (const t of level.solids)
      if (!t.oneway && x >= t.x - 1 && x <= t.x + t.w + 1 && y >= t.y && y <= t.y + t.h) return true;
    return false;
  }

  function drawTerrain(ctx, cam) {
    const th = currentTheme();
    for (const s of level.solids) {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      if (sx + s.w < 0 || sx > CFG.CW) continue;
      // 别墅图的结构件由 VillaDraw 画，这里只保留守方临时加固墙
      if (level.villa && !s.reinforce) continue;
      // 古堡图同理：结构件全部由 CastleDraw 画，重绘会叠成两层
      if (level.castle && !s.reinforce) continue;
      // 列车图同理，而且它**必须**跳过：这里的相机不含 trainX，重画一遍会让隐形碰撞体
      // 与画出来的车厢错开一整段列车位移（实测会看到一排灰块钉在地面上往后飞）。
      if (level.train && !s.reinforce) continue;
      const isGround = s.y + s.h >= CFG.WORLD_H - 1;
      if (isGround) {
        // 地面：底部基色 + 泥土抖动 + 顶部压边（按主题）
        ctx.fillStyle = th.ground.base;
        pxRect(ctx, sx, sy, s.w, s.h);
        ctx.fillStyle = th.ground.top;
        pxRect(ctx, sx, sy, s.w, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        pxRect(ctx, sx, sy, s.w, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        pxRect(ctx, sx, sy + 14, s.w, 4);
        // 泥土噪点：确定性 2×2 抖动（明暗两遍，seed 固定 → 不闪烁）
        const seed = ((s.x * 31 + s.y * 17) >>> 0) || 1;
        pxNoise(ctx, sx, sy + 22, s.w, Math.max(8, s.h - 90), 'rgba(0,0,0,0.10)', seed, 0.08);
        pxNoise(ctx, sx, sy + 22, s.w, Math.max(8, s.h - 90), 'rgba(255,255,255,0.05)', seed ^ 0x9e3779b9, 0.06);
        // 顶部草叶 / 金属铆钉 / 沥青车道线（主题差异）
        if (th.par === 'highway') {
          // 断续车道线：按世界坐标对齐相位，否则 250px 地面拼块之间会错位
          ctx.fillStyle = 'rgba(228,190,80,0.50)';
          for (let wx = Math.floor(s.x / 36) * 36; wx < s.x + s.w; wx += 36) {
            if (wx + 22 < s.x || wx > s.x + s.w) continue;
            pxRect(ctx, wx - cam.x, sy + 5, 22, 4);
          }
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          for (let cx2 = s.x + 17; cx2 < s.x + s.w; cx2 += 61) pxLine(ctx, cx2 - cam.x, sy + 20, cx2 - cam.x + 9, sy + 34);
        } else if (th.par === 'city' || th.par === 'dock' || th.par === 'station') {
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          for (let gx = sx + 8; gx < sx + s.w - 4; gx += 14) pxRect(ctx, gx, sy + 14, 4, 1);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          for (let gx = sx + 6; gx < sx + s.w - 6; gx += 18) pxRect(ctx, gx, sy + 1, 2, 2);
        }
        // 坑沿立边：只在该端真的接空时才画。PvP 图的地面是 250px 一块拼出来的，
        // 无条件画会在每块接缝处留下一道竖线（看起来又像「屏幕上有条线」）。
        const lipL = !coveredAt(s.x - 2, s.y + 6), lipR = !coveredAt(s.x + s.w + 2, s.y + 6);
        if (lipL || lipR) {
          ctx.fillStyle = 'rgba(255,255,255,0.20)';
          if (lipL) pxRect(ctx, sx, sy, 3, 18);
          if (lipR) pxRect(ctx, sx + s.w - 3, sy, 3, 18);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          if (lipL) pxRect(ctx, sx + 3, sy + 18, 1, s.h - 18);
          if (lipR) pxRect(ctx, sx + s.w - 4, sy + 18, 1, s.h - 18);
        }
      } else if (s.reinforce) {
        // 加固墙（攻防）：深色钢制面板 + 金色铆钉 + 交叉加强筋 + 顶部耐久条
        const w = s.wall || null;
        const hpFrac = w && w.maxHp ? Math.max(0, w.hp / w.maxHp) : 1;
        ctx.fillStyle = '#3d3a44';
        pxRect(ctx, sx, sy, s.w, s.h);
        pxOutline(ctx, sx, sy, s.w, s.h, 'rgba(255,190,90,0.55)');
        // 横向加强筋（顶部/底部各一条）
        ctx.fillStyle = 'rgba(255,190,90,0.25)';
        pxRect(ctx, sx, sy + 8, s.w, 4);
        pxRect(ctx, sx, sy + s.h - 12, s.w, 4);
        // 铆钉列
        ctx.fillStyle = 'rgba(255,200,110,0.8)';
        for (let ry = 12; ry < s.h - 10; ry += 26) {
          pxRect(ctx, sx + 3, sy + ry, 3, 3);
          pxRect(ctx, sx + s.w - 6, sy + ry, 3, 3);
        }
        // 中央交叉 X 加强筋
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        pxLine(ctx, sx + 4, sy + 4, sx + s.w - 4, sy + s.h - 4);
        pxLine(ctx, sx + s.w - 4, sy + 4, sx + 4, sy + s.h - 4);
        // 耐久条（顶边外，400hp 满）
        const bw = Math.max(16, s.w - 8);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        pxRect(ctx, sx + 4, sy - 9, bw, 4);
        ctx.fillStyle = hpFrac > 0.35 ? '#7bd43c' : (hpFrac > 0.15 ? '#ffb300' : '#ff5252');
        pxRect(ctx, sx + 4, sy - 9, Math.max(1, bw * hpFrac), 4);
        if (w) w._uiHp = w.hp;   // 供调试/测试读取
      } else if (s.oneway) {
        ctx.fillStyle = th.oneway;
        pxRect(ctx, sx, sy, s.w, s.h);
        ctx.fillStyle = '#b08d84';
        pxRect(ctx, sx, sy, s.w, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        pxRect(ctx, sx, sy + s.h - 3, s.w, 3);   // 底沿阴影：给板子厚度，不再是一张纸
        for (let x = 0; x < s.w; x += 18) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; pxRect(ctx, sx + x, sy + 5, 9, 3); }
        drawOnewaySupports(ctx, th, s, sx, sy);
      } else if (s.mat) {
        // 指定材质（brick/wood/metal/concrete）：与建筑立面共用同一套纹理
        const m = MAT_DRAW[s.mat];
        if (m) matBody(ctx, m, s.mat, sx, sy, s.w, s.h, ((s.x * 13 + s.y * 29) >>> 0) || 1, true);
      } else {
        const wood = (s.w === 52 && s.h === 44);
        if (wood) {
          ctx.fillStyle = th.wood;
          pxRect(ctx, sx, sy, s.w, s.h);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          pxLine(ctx, sx + 2, sy + 2, sx + s.w - 2, sy + s.h - 2);
          pxLine(ctx, sx + s.w - 2, sy + 2, sx + 2, sy + s.h - 2);
          pxOutline(ctx, sx, sy, s.w, s.h, 'rgba(0,0,0,0.4)');
        } else {
          ctx.fillStyle = th.stone;
          pxRect(ctx, sx, sy, s.w, s.h);
          pxOutline(ctx, sx, sy, s.w, s.h, 'rgba(0,0,0,0.35)');
          pxNoise(ctx, sx + 2, sy + 2, s.w - 4, s.h - 4, 'rgba(255,255,255,0.05)', ((s.x * 13 + s.y * 29) >>> 0) || 1, 0.10);
        }
      }
    }
    // 撤离区（像素虚线框 + 点阵光幕）
    if (level.escapeZone) {
      const ez = level.escapeZone;
      const sx = ez.x - cam.x, sy = ez.y - cam.y;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
      ctx.fillStyle = `rgba(60,255,140,${(0.12 + pulse * 0.08).toFixed(3)})`;
      pxRect(ctx, sx, sy, ez.w, ez.h);
      ctx.fillStyle = `rgba(120,255,160,${(0.5 + pulse * 0.4).toFixed(3)})`;
      for (let x = 0; x < ez.w; x += 10) { pxRect(ctx, sx + x, sy - 1, 5, 1); pxRect(ctx, sx + x, sy + ez.h, 5, 1); }
      for (let y = 0; y < ez.h; y += 10) { pxRect(ctx, sx - 1, sy + y, 1, 5); pxRect(ctx, sx + ez.w, sy + y, 1, 5); }
      ctx.fillStyle = 'rgba(200,255,220,0.9)';
      ctx.font = pxFont(15); ctx.textAlign = 'center';
      ctx.fillText('撤 离 点', px(sx + ez.w / 2), px(sy - 10));
    }
  }

  // ---------- 建筑立面（视觉层：不参与碰撞，从物理层顶向上延伸 / 在墙面叠门窗细节） ----------
  function drawBuildings(ctx, cam) {
    const t = performance.now();
    for (const b of level.buildings) {
      const sx = b.x - cam.x;
      if (sx + b.w < 0 || sx > CFG.CW) continue;
      const m = MAT_DRAW[b.mat] || MAT_DRAW.brick;
      if (b.type === 'building') {
        // 复合建筑：物理矮层顶（fy）之上继续画 visH - physH 的立面（与物理层同一套材质纹理）
        const fy = level.groundTop - b.physH;
        const fh = b.visH - b.physH;
        matBody(ctx, m, b.mat, sx, fy - fh, b.w, fh, ((b.x * 17 + b.visH * 7) >>> 0) || 1, false);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';                       // 顶部压线
        pxRect(ctx, sx, fy - fh, b.w, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';                 // 檐口亮线
        pxRect(ctx, sx, fy - fh, b.w, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';                       // 左右立边（底边不描，避免和物理层之间出现接缝线）
        pxRect(ctx, sx, fy - fh, 1, fh);
        pxRect(ctx, sx + b.w - 1, fy - fh, 1, fh);
        // 窗（坐标相对建筑底：y 为窗底距地面高，向下画 h 高）——亮灯闪烁 / 碎窗
        for (const win of b.windows || []) {
          const wx = sx + win.x;
          const wy = level.groundTop - win.y - win.h;
          const lit = (Math.floor(t / 600) + Math.floor(b.x + win.x)) % 5 < 4;
          ctx.fillStyle = lit ? 'rgba(255,220,120,0.85)' : 'rgba(8,12,18,0.92)';
          pxRect(ctx, wx, wy, win.w, win.h);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          pxOutline(ctx, wx, wy, win.w, win.h, 'rgba(0,0,0,0.6)');
          if (!lit) {                                             // 碎窗裂纹
            pxLine(ctx, wx + 2, wy + 2, wx + win.w - 2, wy + win.h - 2);
            pxLine(ctx, wx + win.w - 2, wy + 2, wx + 2, wy + win.h - 2);
          }
        }
        // 门框（物理层门洞处：暗影填满空隙 + 两侧门柱 + 顶部过梁）
        for (const d of b.doors || []) {
          const dx = sx + d.x, dw = d.w;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          pxRect(ctx, dx, fy, dw, b.physH);
          ctx.fillStyle = m.accent;
          pxRect(ctx, dx - 3, fy - 4, 3, b.physH + 4);
          pxRect(ctx, dx + dw, fy - 4, 3, b.physH + 4);
          pxRect(ctx, dx - 3, fy - 8, dw + 6, 6);
        }
        // 装饰柱（壁柱）：柱身暗面 + 左缘受光 + 柱帽柱脚，旧版只有一层 0.35 黑，落在深色立面里等于没画
        for (const p of b.posts || []) {
          const x0 = sx + p.x;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          pxRect(ctx, x0, fy - fh, p.w, fh);
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          pxRect(ctx, x0, fy - fh, 1, fh);
          ctx.fillStyle = m.accent;
          pxRect(ctx, x0 - 1, fy - fh, p.w + 2, 3);
          pxRect(ctx, x0 - 1, fy - 3, p.w + 2, 3);
        }
        // 山墙三角屋顶：实心阶梯填充 + 双像素斜檐 + 屋脊帽。
        // 旧版只用 pxLine 描两条 1px 斜线，在像素渲染下就是飘在屋顶上方的细线。
        if (b.gable) {
          const baseY = fy - fh, peak = baseY - 26, rise = baseY - peak;
          ctx.fillStyle = m.base;
          for (let y = baseY; y > peak; y -= 2) {
            const half = (b.w / 2) * ((y - peak) / rise);
            pxRect(ctx, sx + b.w / 2 - half, y - 2, half * 2, 2);
          }
          ctx.fillStyle = 'rgba(0,0,0,0.55)';                       // 斜檐暗线（画两遍加厚）
          for (let d = 0; d <= 1; d++) {
            pxLine(ctx, sx - 2, baseY + d, sx + b.w / 2, peak + d);
            pxLine(ctx, sx + b.w / 2, peak + d, sx + b.w + 2, baseY + d);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.16)';                 // 左坡受光
          pxLine(ctx, sx - 2, baseY - 2, sx + b.w / 2, peak - 2);
          ctx.fillStyle = m.line;                                   // 山墙底压线
          pxRect(ctx, sx - 2, baseY - 2, b.w + 4, 3);
          ctx.fillStyle = m.accent;                                 // 屋脊通风帽
          pxRect(ctx, sx + b.w / 2 - 4, peak - 6, 8, 6);
        }
      } else if (b.type === 'wall' && b.win) {
        // 墙段上的视觉窗
        const fy = level.groundTop - b.h;
        const wx = sx + b.w / 2 - 10, wy = fy + 14;
        ctx.fillStyle = 'rgba(8,12,18,0.92)';
        pxRect(ctx, wx, wy, 20, 14);
        pxOutline(ctx, wx, wy, 20, 14, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = 'rgba(255,220,120,0.35)';
        pxRect(ctx, wx + 2, wy + 2, 16, 3);
      } else if (b.type === 'canopy') {
        // 站台棚：顶棚面板（贴 oneway 顶） + 檐线
        const cy = level.groundTop - b.visH;
        ctx.fillStyle = m.base;
        pxRect(ctx, sx + 60, cy, b.w - 120, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        pxRect(ctx, sx + 60, cy, b.w - 120, 3);
        ctx.fillStyle = m.accent;
        pxRect(ctx, sx + 60, cy + 14, b.w - 120, 2);
      } else if (b.type === 'gasCanopy') {
        // 加油罩棚：18 厚板 + 檐口褪色招牌带。
        // 第三关站台棚是 14 薄板 + 60 宽粗柱，两者剪影必须拉开，否则新主题白做。
        const cy = level.groundTop - b.visH;
        ctx.fillStyle = m.base;
        pxRect(ctx, sx, cy, b.w, 18);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        pxRect(ctx, sx, cy, b.w, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        pxRect(ctx, sx, cy + 3, b.w, 1);
        ctx.fillStyle = 'rgba(198,74,58,0.50)';                       // 檐口招牌带
        pxRect(ctx, sx + 8, cy + 18, b.w - 16, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.42)';                           // 招牌破了一格
        pxRect(ctx, sx + Math.round(b.w * 0.55), cy + 18, 26, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        pxRect(ctx, sx, cy + 28, b.w, 3);
      } else if (b.type === 'sign') {
        // 公路招牌立柱的牌面（纯视觉、不参与碰撞）：「一眼是服务区」的最强符号
        const top = level.groundTop - b.visH, ph = b.visH - b.physH;
        ctx.fillStyle = m.base;
        pxRect(ctx, sx, top, b.w, ph);
        pxOutline(ctx, sx, top, b.w, ph, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = 'rgba(198,74,58,0.55)';
        pxRect(ctx, sx + 4, top + 6, b.w - 8, 14);
        ctx.fillStyle = 'rgba(228,190,80,0.45)';
        pxRect(ctx, sx + 4, top + 22, b.w - 8, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        pxRect(ctx, sx + b.w - 18, top + ph - 12, 18, 12);            // 缺角
      }
    }
  }

  function onScreenX(x, w) { return x + w > -20 && x - w < CFG.CW + 20; }

  // ---------- 关卡装饰物（theme 主题布景） ----------
  function drawDecor(ctx, cam) {
    const st = level.stages && level.stages[(game && game.stage) || 0];
    if (!st || !st.decor) return;
    const t = performance.now() / 1000;
    for (const d of st.decor) {
      const sx = d.x - cam.x;
      if (sx < -180 || sx > CFG.CW + 180) continue;
      drawDecorItem(ctx, d.type, sx, level.groundTop, t);
    }
  }

  function drawDecorItem(ctx, type, x, gy, t) {
    const ground = gy;
    switch (type) {
      case 'crate': {
        ctx.fillStyle = '#7a5a3e'; pxRect(ctx, x - 22, ground - 40, 44, 40);
        ctx.fillStyle = '#8a6a48'; pxRect(ctx, x - 22, ground - 40, 44, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; pxOutline(ctx, x - 22, ground - 40, 44, 40);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        pxLine(ctx, x - 22, ground - 40, x + 22, ground);
        pxLine(ctx, x + 22, ground - 40, x - 22, ground);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        pxRect(ctx, x - 20, ground - 38, 40, 2);
        break;
      }
      case 'truckwreck': {
        // 侧翻皮卡（纯装饰、无碰撞）：整体压暗到地面顶面以下，避免被读成可站面
        ctx.fillStyle = 'rgba(58,52,46,0.92)';
        pxRect(ctx, x - 46, ground - 34, 92, 22);
        pxRect(ctx, x + 6, ground - 52, 34, 20);
        ctx.fillStyle = 'rgba(12,16,18,0.9)';
        pxRect(ctx, x + 12, ground - 48, 22, 12);
        ctx.fillStyle = '#2a2622';
        pxCircle(ctx, x - 26, ground - 8, 9);
        pxCircle(ctx, x + 22, ground - 6, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        pxOutline(ctx, x - 46, ground - 34, 92, 22);
        ctx.fillStyle = 'rgba(150,60,40,0.35)';
        pxRect(ctx, x - 40, ground - 30, 18, 6);
        pxRect(ctx, x + 30, ground - 26, 14, 8);
        break;
      }
      case 'lamp': {
        ctx.fillStyle = '#3a4a3a'; pxRect(ctx, x - 3, ground - 96, 6, 96);
        const fl = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.fillStyle = `rgba(255,230,150,${(0.08 + fl * 0.06).toFixed(3)})`;
        pxCircle(ctx, x, ground - 100, 26);
        ctx.fillStyle = `rgba(255,230,150,${(0.55 + fl * 0.35).toFixed(3)})`;
        pxCircle(ctx, x, ground - 100, 7);
        ctx.fillStyle = '#4a5e4a'; pxRect(ctx, x - 5, ground - 106, 10, 8);
        break;
      }
      case 'barricade': {
        ctx.fillStyle = '#ff8f2a'; pxRect(ctx, x - 30, ground - 34, 60, 10);
        ctx.fillStyle = '#f4f4f4'; pxRect(ctx, x - 30, ground - 24, 60, 8);
        ctx.fillStyle = '#ff8f2a'; pxRect(ctx, x - 30, ground - 16, 60, 10);
        ctx.fillStyle = '#a35a1a'; pxOutline(ctx, x - 30, ground - 34, 60, 28);
        ctx.fillStyle = '#e8e8e8';
        for (let i = 0; i < 3; i++) pxRect(ctx, x - 20 + i * 16, ground - 22, 8, 4);
        break;
      }
      case 'car': {
        ctx.fillStyle = '#39424e'; pxRect(ctx, x - 56, ground - 30, 112, 30);
        ctx.fillStyle = '#4b5866'; pxRect(ctx, x - 36, ground - 46, 62, 20);
        ctx.fillStyle = '#2c3640'; pxRect(ctx, x - 46, ground - 12, 14, 12); pxRect(ctx, x + 32, ground - 12, 14, 12);
        ctx.fillStyle = 'rgba(200,230,255,0.25)'; pxRect(ctx, x - 30, ground - 42, 18, 12); pxRect(ctx, x + 6, ground - 42, 18, 12);
        ctx.fillStyle = 'rgba(255,120,60,0.6)'; pxRect(ctx, x - 56, ground - 24, 4, 8); pxRect(ctx, x + 52, ground - 24, 4, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; pxOutline(ctx, x - 56, ground - 46, 112, 46);
        break;
      }
      case 'barrel': {
        ctx.fillStyle = '#8a5a2a'; pxRect(ctx, x - 16, ground - 22, 32, 22);
        ctx.fillStyle = '#9a6a34'; pxRect(ctx, x - 16, ground - 22, 32, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 16, ground - 22, 32, 22);
        ctx.fillStyle = '#6e4216'; pxRing(ctx, x, ground - 16, 10);
        ctx.fillStyle = '#b8860b'; pxRing(ctx, x, ground - 16, 6);
        break;
      }
      case 'billboard': {
        ctx.fillStyle = '#2c3636'; pxRect(ctx, x - 4, ground - 150, 8, 150);
        ctx.fillStyle = '#1f2a2a'; pxRect(ctx, x - 52, ground - 196, 104, 50);
        ctx.fillStyle = '#ffd54f'; pxOutline(ctx, x - 52, ground - 196, 104, 50);
        ctx.fillStyle = 'rgba(255,213,79,0.25)'; pxRect(ctx, x - 52, ground - 196, 104, 50);
        ctx.fillStyle = '#ffe082'; ctx.font = pxFont(18); ctx.textAlign = 'center';
        ctx.fillText('☣', px(x), px(ground - 170));
        break;
      }
      case 'hydrant': {
        ctx.fillStyle = '#c62828'; pxRect(ctx, x - 7, ground - 24, 14, 24);
        ctx.fillStyle = '#ef5350'; pxRect(ctx, x - 11, ground - 32, 22, 10);
        ctx.fillStyle = '#ffcdd2'; pxRect(ctx, x - 4, ground - 14, 8, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 11, ground - 32, 22, 32);
        break;
      }
      case 'container': {
        ctx.fillStyle = '#5a7a6a'; pxRect(ctx, x - 46, ground - 50, 92, 50);
        ctx.fillStyle = '#6f937f'; pxRect(ctx, x - 46, ground - 50, 92, 12);
        ctx.fillStyle = '#40584c'; pxRect(ctx, x - 46, ground - 50, 8, 50); pxRect(ctx, x + 38, ground - 50, 8, 50);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 46, ground - 50, 92, 50);
        pxNoise(ctx, x - 40, ground - 44, 76, 40, 'rgba(255,255,255,0.05)', ((x * 7) | 0), 0.10);
        break;
      }
      case 'pallet': {
        ctx.fillStyle = '#7a5c46'; pxRect(ctx, x - 28, ground - 10, 56, 10);
        ctx.fillStyle = '#6a4e3a'; pxRect(ctx, x - 24, ground - 18, 6, 8); pxRect(ctx, x + 18, ground - 18, 6, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 28, ground - 10, 56, 10);
        break;
      }
      case 'crane': {
        ctx.fillStyle = '#4a4a3a'; pxRect(ctx, x - 6, ground - 150, 12, 150);
        pxRect(ctx, x - 60, ground - 156, 120, 8);
        ctx.fillStyle = '#5a5a48'; pxRect(ctx, x - 60, ground - 156, 8, 10); pxRect(ctx, x + 52, ground - 156, 8, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; pxOutline(ctx, x - 6, ground - 150, 12, 150);
        break;
      }
      case 'rail': {
        ctx.fillStyle = '#5a5a52'; pxRect(ctx, x - 60, ground - 8, 120, 5);
        ctx.fillStyle = '#3a3a34';
        for (let i = 0; i < 12; i++) pxRect(ctx, x - 56 + i * 10, ground - 14, 5, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 60, ground - 14, 120, 12);
        break;
      }
      case 'signal': {
        ctx.fillStyle = '#3a3a3a'; pxRect(ctx, x - 3, ground - 92, 6, 92);
        const c = Math.floor(t * 1.2) % 3;
        const cols = ['#ff3b30', '#ffcc00', '#4cd964'];
        ctx.fillStyle = cols[c]; pxCircle(ctx, x, ground - 98, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = pxFont(9); ctx.textAlign = 'center';
        ctx.fillText('信号', px(x), px(ground - 112));
        break;
      }
      case 'train': {
        ctx.fillStyle = '#5a2020'; pxRect(ctx, x - 70, ground - 66, 140, 66);
        ctx.fillStyle = '#7a2e2e'; pxRect(ctx, x - 70, ground - 66, 140, 14);
        ctx.fillStyle = '#3a1414'; pxRect(ctx, x - 58, ground - 52, 24, 18); pxRect(ctx, x + 34, ground - 52, 24, 18);
        ctx.fillStyle = 'rgba(255,230,150,0.5)'; pxRect(ctx, x - 22, ground - 52, 18, 14); pxRect(ctx, x - 2, ground - 52, 18, 14); pxRect(ctx, x + 18, ground - 52, 14, 14);
        ctx.fillStyle = '#2a2020';
        for (let i = 0; i < 3; i++) pxCircle(ctx, x - 46 + i * 46, ground - 4, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 70, ground - 66, 140, 66);
        break;
      }
      case 'bench': {
        ctx.fillStyle = '#6a4e3a'; pxRect(ctx, x - 34, ground - 22, 68, 6);
        ctx.fillStyle = '#5a3e2a'; pxRect(ctx, x - 30, ground - 16, 6, 16); pxRect(ctx, x + 24, ground - 16, 6, 16);
        ctx.fillStyle = '#7a5c46'; pxRect(ctx, x - 34, ground - 30, 68, 4);
        break;
      }
      case 'luggage': {
        ctx.fillStyle = '#5a4a3a'; pxRect(ctx, x - 20, ground - 20, 40, 20);
        ctx.fillStyle = '#6d5b48'; pxRect(ctx, x - 20, ground - 20, 40, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, x - 20, ground - 20, 40, 20);
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#3a3a3a'; pxRect(ctx, x - 3, ground - 100, 6, 100);
        ctx.fillStyle = '#1f5a4a'; pxRect(ctx, x - 60, ground - 130, 120, 32);
        ctx.fillStyle = '#baff5c'; ctx.font = pxFont(13); ctx.textAlign = 'center';
        ctx.fillText('→ 出 口', px(x), px(ground - 106));
        break;
      }
      case 'pipe': {
        ctx.fillStyle = '#3a434a'; pxRect(ctx, x - 44, ground - 34, 88, 12);
        ctx.fillStyle = '#4a545c'; pxCircle(ctx, x, ground - 22, 20);
        ctx.fillStyle = '#2a333a'; pxCircle(ctx, x, ground - 22, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxRing(ctx, x, ground - 22, 20);
        break;
      }
      case 'slime': {
        const fl = 0.5 + 0.5 * Math.sin(t * 3 + x);
        ctx.fillStyle = `rgba(124,255,90,${(0.16 + fl * 0.12).toFixed(3)})`;
        pxRect(ctx, x - 26, ground - 9, 52, 10);
        ctx.fillStyle = `rgba(140,255,120,${(0.3 + fl * 0.2).toFixed(3)})`;
        pxRect(ctx, x - 12, ground - 6, 24, 6);
        break;
      }
      case 'wallLamp': {
        ctx.fillStyle = '#3a3a3a'; pxRect(ctx, x - 4, ground - 110, 8, 34);
        const fl = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.fillStyle = `rgba(140,240,255,${(0.07 + fl * 0.05).toFixed(3)})`;
        pxCircle(ctx, x, ground - 76, 22);
        ctx.fillStyle = `rgba(140,240,255,${(0.5 + fl * 0.3).toFixed(3)})`;
        pxCircle(ctx, x, ground - 76, 6);
        break;
      }
      case 'grate': {
        ctx.fillStyle = '#2a2f33'; pxRect(ctx, x - 34, ground - 8, 68, 8);
        ctx.fillStyle = '#4a555c';
        for (let i = 0; i < 5; i++) pxRect(ctx, x - 28 + i * 14, ground - 8, 1, 8);
        break;
      }
      case 'tank': {
        ctx.fillStyle = '#2c3a3a'; pxRect(ctx, x - 30, ground - 96, 60, 96);
        ctx.fillStyle = '#4a5a5a'; pxOutline(ctx, x - 30, ground - 96, 60, 96);
        const fl = 0.5 + 0.5 * Math.sin(t * 2 + x);
        ctx.fillStyle = `rgba(140,255,190,${(0.2 + fl * 0.12).toFixed(3)})`;
        pxRect(ctx, x - 22, ground - 88, 44, 62);
        ctx.fillStyle = '#6a7a7a'; pxRect(ctx, x - 34, ground - 96, 8, 96);
        ctx.fillStyle = 'rgba(180,255,230,0.5)'; ctx.font = pxFont(9); ctx.textAlign = 'center';
        ctx.fillText('☣', px(x), px(ground - 104));
        break;
      }
      case 'equipment': {
        ctx.fillStyle = '#3a4a4a'; pxRect(ctx, x - 32, ground - 44, 64, 44);
        ctx.fillStyle = '#4a5e5e'; pxRect(ctx, x - 32, ground - 44, 64, 8);
        ctx.fillStyle = '#1f2a2a'; pxRect(ctx, x - 24, ground - 34, 16, 26); pxRect(ctx, x - 4, ground - 34, 16, 26); pxRect(ctx, x + 16, ground - 34, 8, 26);
        ctx.fillStyle = `rgba(140,240,255,${(0.4 + 0.3 * Math.sin(t * 3)).toFixed(3)})`;
        pxRect(ctx, x - 22, ground - 32, 4, 6); pxRect(ctx, x - 2, ground - 32, 4, 6);
        break;
      }
      case 'caution': {
        ctx.fillStyle = '#f4b400'; pxRect(ctx, x - 24, ground - 40, 48, 6);
        ctx.fillStyle = '#333'; for (let i = 0; i < 8; i++) pxRect(ctx, x - 24 + i * 6, ground - 40, 3, 6);
        ctx.fillStyle = '#f4b400'; pxRect(ctx, x - 24, ground - 34, 48, 6);
        ctx.fillStyle = '#333'; for (let i = 0; i < 8; i++) pxRect(ctx, x - 24 + i * 6 + 3, ground - 34, 3, 6);
        ctx.fillStyle = '#3a4a4a'; pxRect(ctx, x - 26, ground - 26, 52, 8);
        break;
      }
      case 'glowpipe': {
        const fl = 0.5 + 0.5 * Math.sin(t * 2.5);
        ctx.fillStyle = '#2a3a3a'; pxRect(ctx, x - 60, ground - 12, 120, 12);
        ctx.fillStyle = `rgba(140,240,255,${(0.5 + fl * 0.3).toFixed(3)})`;
        pxRect(ctx, x - 60, ground - 12, 120, 3);
        break;
      }
      case 'monitor': {
        ctx.fillStyle = '#2a2a2a'; pxRect(ctx, x - 30, ground - 40, 60, 40);
        ctx.fillStyle = '#3a3a3a'; pxRect(ctx, x - 4, ground - 8, 8, 8);
        ctx.fillStyle = `rgba(140,240,255,${(0.35 + 0.3 * Math.sin(t * 2)).toFixed(3)})`;
        pxRect(ctx, x - 24, ground - 34, 48, 28);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; pxOutline(ctx, x - 24, ground - 34, 48, 28);
        break;
      }
      case 'barbed': {
        ctx.fillStyle = '#6a6a5a'; pxRect(ctx, x - 36, ground - 6, 72, 6);
        ctx.fillStyle = '#3a3a32'; pxRect(ctx, x - 6, ground - 26, 12, 20);
        ctx.fillStyle = '#8a8a7a'; pxRect(ctx, x - 12, ground - 26, 24, 5);
        ctx.fillStyle = '#c8c8b8';
        pxLine(ctx, x - 12, ground - 22, x + 12, ground - 8);
        pxLine(ctx, x - 12, ground - 8, x + 12, ground - 22);
        break;
      }
      case 'sandbag': {
        ctx.fillStyle = '#8a7a5a';
        pxRect(ctx, x - 32, ground - 14, 28, 14);
        pxRect(ctx, x + 2, ground - 14, 28, 14);
        ctx.fillStyle = '#9a8a6a';
        pxRect(ctx, x - 18, ground - 24, 36, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; pxOutline(ctx, x - 32, ground - 24, 64, 24);
        break;
      }
      case 'fire': {
        const fl = 0.5 + 0.5 * Math.sin(t * 9 + x);
        ctx.fillStyle = 'rgba(60,30,20,0.5)';
        pxRect(ctx, x - 12, ground - 2, 24, 2);
        ctx.fillStyle = `rgba(255,110,40,${(0.3 + fl * 0.25).toFixed(3)})`;
        pxCircle(ctx, x, ground - 10, 8 + fl * 5);
        ctx.fillStyle = `rgba(255,200,80,${(0.5 + fl * 0.35).toFixed(3)})`;
        pxCircle(ctx, x - 3, ground - 14, 4 + fl * 3);
        ctx.fillStyle = `rgba(255,200,80,${(0.5 + fl * 0.4).toFixed(3)})`;
        ctx.fillRect(px(x - 8 - fl * 6), px(ground - 20 - fl * 4), 2, 2);
        ctx.fillRect(px(x + 4 + fl * 5), px(ground - 18 - fl * 5), 2, 2);
        break;
      }
      case 'redlamp': {
        const fl = 0.5 + 0.5 * Math.sin(t * 3 + x);
        ctx.fillStyle = '#3a3a3a'; pxRect(ctx, x - 4, ground - 100, 8, 100);
        ctx.fillStyle = `rgba(255,60,40,${(0.08 + fl * 0.06).toFixed(3)})`;
        pxCircle(ctx, x, ground - 106, 24);
        ctx.fillStyle = `rgba(255,60,40,${(0.6 + fl * 0.4).toFixed(3)})`;
        pxCircle(ctx, x, ground - 106, 6);
        break;
      }
    }
  }

  // ---------- 氛围层（边缘分带暗角 + 顶部压暗条带 + 地面分层薄雾） ----------
  function drawAtmosphere(ctx, cam) {
    if (level && level.castle && level.castle.source && typeof CastleArtRebuild !== 'undefined') return;
    // 列车图自带昼夜分级（TrainDraw 的 grade/amb 是随连续相位派生的），再叠一层游戏暗角
    // 会把夜里本就 34 均亮的地面压到看不见 —— 与古堡同一处理。
    if (level && level.train) return;
    const th = currentTheme();
    // 暗角：从屏幕四边向内递减。旧实现是 5 圈 2px 宽的黑色 pxRing「替代径向渐变」，
    // 圆环当然就是线圈（用户反馈）；改成 16px×5 条后又因带间 alpha 跳变留下横竖线，
    // 所以统一走 bandFade 细带。
    // THEMES.*.vignette 原本是死配置（全项目没人读），这里接上：暗角颜色与强度都随主题。
    // 取 0.55 倍是因为它是「边缘最深那一条」的值，不是全屏均值。
    const vm = th.vignette && th.vignette.match(/rgba\(([^)]+)\)/);
    const vp = vm ? vm[1].split(',') : ['0', '0', '0', '0.24'];
    const vrgb = vp[0] + ',' + vp[1] + ',' + vp[2];
    const va = (parseFloat(vp[3]) || 0.24) * 0.55;
    const VD = 84;
    bandFade(ctx, vrgb, 0, 0, CFG.CW, VD, va, 0, 4);                      // 顶
    bandFade(ctx, vrgb, 0, CFG.CH - VD, CFG.CW, VD, 0, va, 4);            // 底
    bandFade(ctx, vrgb, 0, 0, VD, CFG.CH, va, 0, 4, 'x');                 // 左
    bandFade(ctx, vrgb, CFG.CW - VD, 0, VD, CFG.CH, 0, va, 4, 'x');       // 右
    if (th.par === 'tunnel') {
      // 隧道顶部压暗：细带阶梯（旧版 4 条 28px 会在天上留下横线）
      bandFade(ctx, '0,0,0', 0, 0, CFG.CW, 112, 0.28, 0.02, 6);
    }
    if (th.fog) {
      // 地面薄雾：从雾带上沿向下递增（旧版 4 条 22px、带间跳 0.05 → 屏幕底部几条横线）
      const m = th.fog.match(/rgba\(([^)]+)/);
      if (m) {
        const p = m[1].split(',');
        const base = parseFloat(p[3]) || 0.12;
        bandFade(ctx, p[0] + ',' + p[1] + ',' + p[2], 0, CFG.CH - 90, CFG.CW, 90, 0, base * 1.8, 4);
      }
    }
  }

  // ---------- 关卡横幅（切换主题时的舞台提示） ----------
  let bannerTimer = null;
  function showStageBanner(name, theme) {
    const el = document.getElementById('stageBanner');
    if (!el || typeof el.querySelector !== 'function') return centerMsg(name, 1.6);
    const th = THEMES[theme] || THEMES.city;
    el.querySelector('.sb-name').textContent = name;
    el.querySelector('.sb-sub').textContent = '——  战 场 转 移  ——';
    el.style.borderColor = `rgb(${th.accent})`;
    el.style.color = `rgb(${th.accent})`;
    el.style.boxShadow = `0 0 44px rgba(${th.accent},0.35)`;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 500);
    }, 1900);
  }

  // ---------- 多关卡机制渲染：复活点 / 推进线 / 机关 / 刷新点 ----------
  function drawStageFx(ctx, cam) {
    if (!game || !game.portals || !game.pickups || !game.mechs) return;
    const t = performance.now() / 1000;
    // VS（竞技·攻防）图上的 respawns 只是两队出生区，画成「复活/崖」地面标记会被读成这里有刷新点
    const respawnMarks = game.vs ? [] : (game.activeRespawns || []);
    const cliffMarks = game.vs ? [] : (level.cliffRespawns || []);

    // 幽灵复活点（紫色地面标记）
    for (const r of respawnMarks) {
      const sx = r.x - cam.x;
      if (!onScreenX(sx, 30)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + r.x);
      const gy = level.groundTop - cam.y;
      ctx.fillStyle = `rgba(179,136,255,${0.18 + pulse * 0.14})`;
      ctx.fillRect(sx - 16, gy - 4, 32, 4);
      ctx.fillStyle = `rgba(179,136,255,${0.55 + pulse * 0.4})`;
      ctx.fillRect(sx - 3, gy - 9, 6, 5);
      ctx.fillStyle = 'rgba(225,190,231,0.95)';
      ctx.font = pxFont(9); ctx.textAlign = 'center';
      ctx.fillText('复活', sx, gy - 15);
    }

    // 悬崖复活点（青色地面标记）：人类/幽灵掉崖统一就近传送点
    for (const c of cliffMarks) {
      const sx = c.x - cam.x;
      if (!onScreenX(sx, 30)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + c.x);
      const gy = level.groundTop - cam.y;
      ctx.fillStyle = `rgba(79,195,247,${0.18 + pulse * 0.14})`;
      ctx.fillRect(sx - 16, gy - 4, 32, 4);
      ctx.fillStyle = `rgba(79,195,247,${0.55 + pulse * 0.4})`;
      ctx.fillRect(sx - 3, gy - 9, 6, 5);
      ctx.fillStyle = 'rgba(160,230,255,0.95)';
      ctx.font = pxFont(9); ctx.textAlign = 'center';
      ctx.fillText('崖', sx, gy - 15);
    }

    // 关卡推进线（当前关出口）：防守/钥匙开启前为红色封锁，开启后为绿色前进光幕
    const stL = level.stages[game.stage];
    const advOpen = game.advanceOpen;
    if (stL && game.stage < level.stages.length - 1) {
      const alx = (stL.portal ? stL.portal.x : stL.endX - 30) - cam.x;
      if (onScreenX(alx, 90)) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        const ay = level.groundTop - cam.y;
        if (advOpen) {
          ctx.fillStyle = `rgba(105,240,174,${(0.14 + pulse * 0.1).toFixed(3)})`;
          pxRect(ctx, alx - 6, ay - 160, 12, 160);
          // 两侧硬边光柱：像素断续条
          ctx.fillStyle = `rgba(150,255,200,${(0.7 + pulse * 0.3).toFixed(3)})`;
          for (let yy = ay - 160; yy < ay; yy += 8) { pxRect(ctx, alx - 4, yy, 2, 4); pxRect(ctx, alx + 2, yy, 2, 4); }
          ctx.fillStyle = '#b9f6ca'; ctx.font = pxFont(11); ctx.textAlign = 'center';
          ctx.fillText('前 进', px(alx), px(ay - 170));
        } else {
          ctx.fillStyle = `rgba(255,120,90,${(0.12 + pulse * 0.08).toFixed(3)})`;
          pxRect(ctx, alx - 6, ay - 160, 12, 160);
          ctx.fillStyle = `rgba(255,150,120,${(0.5 + pulse * 0.25).toFixed(3)})`;
          for (let yy = ay - 160; yy < ay; yy += 8) { pxRect(ctx, alx - 4, yy, 2, 4); pxRect(ctx, alx + 2, yy, 2, 4); }
          ctx.fillStyle = '#ffab91'; ctx.font = pxFont(11); ctx.textAlign = 'center';
          ctx.fillText('封 锁', px(alx), px(ay - 170));
        }
      }
    }

    // 机关
    for (const m of (game.mechs[game.stage] || [])) {
      if (m.broken) continue;
      const sx = m.x - cam.x, sy = m.y - cam.y;
      if (!onScreenX(sx, m.w + 60)) continue;
      if (m.type === 'door') {
        if (m.closed) {
          ctx.fillStyle = '#455a64'; pxRect(ctx, sx, sy, m.w, m.h);
          ctx.fillStyle = '#607d8b'; pxRect(ctx, sx + 4, sy + 4, m.w - 8, 10);
          ctx.fillStyle = '#263238'; pxRect(ctx, sx + 2, sy + m.h / 2, m.w - 4, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; pxOutline(ctx, sx, sy, m.w, m.h);
          if (m.hp > 0) drawMechHp(ctx, sx, sy, m.hp, 300);
        }
        ctx.fillStyle = '#90a4ae'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('大门', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'bridge') {
        ctx.fillStyle = '#6d4c41'; pxRect(ctx, sx, sy, m.w, 8);
        ctx.fillStyle = '#8d6e63'; pxRect(ctx, sx, sy + 8, m.w, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; pxOutline(ctx, sx, sy, m.w, 12);
        ctx.fillStyle = '#d7ccc8'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('断桥（E）', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'trap') {
        const fl = 0.5 + 0.5 * Math.sin(t * 10);
        ctx.fillStyle = `rgba(255,140,40,${(0.35 + fl * 0.3).toFixed(3)})`;
        pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = '#ff6d2a'; pxOutline(ctx, sx, sy, m.w, m.h);
        // 危险斜条纹（像素阶梯）
        ctx.fillStyle = 'rgba(120,40,10,0.5)';
        for (let i = 0; i < Math.floor(m.w / 14); i++)
          pxLine(ctx, sx + i * 14, sy, sx + i * 14 + 8, sy + m.h);
        ctx.fillStyle = '#ffb74d'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('伤害陷阱', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'wind') {
        ctx.fillStyle = 'rgba(79,195,247,0.16)';
        pxRect(ctx, sx, sy, m.w, m.h);
        const dir = m.dir || 1;
        ctx.fillStyle = 'rgba(200,240,255,0.7)';
        for (let i = 0; i < 4; i++) {
          const ax = sx + ((t * 150 * dir + i * (m.w / 4)) % m.w + m.w) % m.w;
          pxRect(ctx, ax, sy + 10 + i * (m.h / 5), 12, 2);
          pxRect(ctx, ax + dir * 10, sy + 9 + i * (m.h / 5), 6, 1);
          pxRect(ctx, ax + dir * 12, sy + 11 + i * (m.h / 5), 6, 1);
        }
        ctx.fillStyle = '#b3e5fc'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('气流风场', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'platform') {
        ctx.fillStyle = '#78909c'; pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = '#b0bec5'; pxRect(ctx, sx, sy, m.w, 4);
      } else if (m.type === 'lift') {
        ctx.fillStyle = '#6d4c41'; pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = '#a1887f'; pxRect(ctx, sx, sy, m.w, 4);
      } else if (m.type === 'beam') {
        const fl = 0.5 + 0.5 * Math.sin(t * 7);
        ctx.fillStyle = `rgba(255,235,130,${(0.15 + fl * 0.12).toFixed(3)})`;
        pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = 'rgba(255,224,130,0.8)';
        pxLine(ctx, sx, sy + m.h, sx + m.w, sy);
        ctx.fillStyle = '#ffe082'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('传送光线', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'rope') {
        ctx.fillStyle = '#bcaaa4';
        pxLine(ctx, sx, sy, sx + m.w, sy + 30);
        pxLine(ctx, sx + m.w, sy, sx, sy + 30);
        ctx.fillStyle = '#ffe0b2'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('滑索（E）', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'turret') {
        // 自动炮台：底座 + 炮管（锁定最近幽灵时瞄准）
        const ang = m._lastAng != null ? m._lastAng : 0;
        ctx.fillStyle = '#37474f'; pxRect(ctx, sx, sy + m.h - 14, m.w, 14);
        ctx.fillStyle = '#546e7a'; pxRect(ctx, sx + 2, sy + m.h - 12, m.w - 4, 8);
        ctx.fillStyle = '#263238'; pxCircle(ctx, sx + m.w / 2, sy + m.h - 14, 9);
        // 炮管：沿角度像素线（2px 宽）
        const tx = sx + m.w / 2, ty = sy + m.h - 14;
        const ex = tx + Math.cos(ang) * 22, ey = ty + Math.sin(ang) * 22;
        const pxo = -Math.sin(ang), pyo = Math.cos(ang);
        ctx.fillStyle = '#90a4ae';
        pxLine(ctx, tx, ty, ex, ey);
        pxLine(ctx, tx + pxo, ty + pyo, ex + pxo, ey + pyo);
        if (m._muzzle != null && m._muzzle > 0) {
          ctx.fillStyle = 'rgba(255,215,64,0.9)';
          pxCircle(ctx, sx + m.w / 2 + Math.cos(ang) * 26, sy + m.h - 14 + Math.sin(ang) * 26, 4);
        }
        ctx.fillStyle = '#b0bec5'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('炮台', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'heal') {
        const fl = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.fillStyle = `rgba(105,240,174,${(0.14 + fl * 0.1).toFixed(3)})`;
        pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = '#69f0ae'; pxOutline(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = '#b9f6ca'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('治疗站', px(sx + m.w / 2), px(sy - 6));
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = pxFont(10, '');
        ctx.fillText('✚', px(sx + m.w / 2), px(sy + m.h / 2 + 4));
      } else if (m.type === 'booster') {
        const fl = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.fillStyle = `rgba(64,196,255,${(0.18 + fl * 0.14).toFixed(3)})`;
        pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = 'rgba(200,240,255,0.8)';
        for (let i = 0; i < 4; i++) {
          const bx = sx + ((t * 120 + i * (m.w / 4)) % m.w + m.w) % m.w;
          pxRect(ctx, bx - 3, sy + m.h - 2, 7, 2);
          pxRect(ctx, bx - 1, sy + m.h - 6, 3, 4);
          pxRect(ctx, bx, sy + m.h - 10, 1, 4);
        }
        ctx.fillStyle = '#e1f5fe'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('加速带', px(sx + m.w / 2), px(sy - 6));
      } else if (m.type === 'void') {
        const fl = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.fillStyle = `rgba(206,147,216,${(0.12 + fl * 0.1).toFixed(3)})`;
        pxRect(ctx, sx, sy, m.w, m.h);
        ctx.fillStyle = `rgba(206,147,216,${(0.5 + fl * 0.4).toFixed(3)})`;
        pxLine(ctx, sx + m.w / 2, sy, sx + m.w, sy + m.h / 2);
        pxLine(ctx, sx + m.w, sy + m.h / 2, sx + m.w / 2, sy + m.h);
        pxLine(ctx, sx + m.w / 2, sy + m.h, sx, sy + m.h / 2);
        pxLine(ctx, sx, sy + m.h / 2, sx + m.w / 2, sy);
        ctx.fillStyle = '#e1bee7'; ctx.font = pxFont(10); ctx.textAlign = 'center';
        ctx.fillText('虚空门（E）', px(sx + m.w / 2), px(sy - 6));
      }
    }

    // 刷新点：弹药箱 / 武器箱 / 能量胶囊 / 钥匙 / 水晶
    drawPickupBoxes(ctx, cam, game.pickups.ammo[game.stage] || [], '弹', '弹药箱');
    drawPickupBoxes(ctx, cam, game.pickups.weapons[game.stage] || [], '武', '特殊武器');
    for (const b of (game.pickups.caps[game.stage] || [])) {
      if (b.taken) continue;
      const sx = b.x - cam.x; if (!onScreenX(sx, 30)) continue;
      const sy = b.y - cam.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(255,240,150,${(0.3 + pulse * 0.25).toFixed(3)})`;
      pxCircle(ctx, sx, sy, 10);
      ctx.fillStyle = '#fff59d'; ctx.font = pxFont(9); ctx.textAlign = 'center';
      ctx.fillText('能量', px(sx), px(sy + 3));
    }
    for (const b of (game.pickups.keys[game.stage] || [])) {
      if (b.taken) continue;
      const sx = b.x - cam.x; if (!onScreenX(sx, 30)) continue;
      const sy = b.y - cam.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(255,214,64,${(0.35 + pulse * 0.3).toFixed(3)})`;
      pxCircle(ctx, sx, sy, 9);
      ctx.fillStyle = `rgba(255,214,64,${(0.7 + pulse * 0.3).toFixed(3)})`;
      pxRing(ctx, sx, sy, 9);
      ctx.fillStyle = '#ffd740'; ctx.font = pxFont(12); ctx.textAlign = 'center';
      ctx.fillText('钥', px(sx), px(sy + 4));
    }
    for (const b of (game.pickups.crystals[game.stage] || [])) {
      if (b.taken) continue;
      const sx = b.x - cam.x; if (!onScreenX(sx, 30)) continue;
      const sy = b.y - cam.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      ctx.fillStyle = `rgba(179,136,255,${(0.4 + pulse * 0.35).toFixed(3)})`;
      pxCircle(ctx, sx, sy, 9);
      ctx.fillStyle = `rgba(179,136,255,${(0.5 + pulse * 0.4).toFixed(3)})`;
      pxRing(ctx, sx, sy, 13);
      ctx.fillStyle = '#e1bee7'; ctx.font = pxFont(8); ctx.textAlign = 'center';
      ctx.fillText('BUFF', px(sx), px(sy + 3));
    }

    // 防守倒计时提示（前线处）
    if (game.guardT > 0 && stL) {
      const alx = (stL.portal ? stL.portal.x : stL.endX - 30) - cam.x;
      if (onScreenX(alx, 100)) {
        ctx.fillStyle = '#ffd740'; ctx.font = pxFont(14); ctx.textAlign = 'center';
        ctx.fillText(`防守 ${Math.ceil(game.guardT)}s`, alx, level.groundTop - cam.y - 190);
      }
    }

    // E 交互提示
    if (game._hint && game._hint.t) {
      const h = game._hint;
      const sx = h.x - cam.x, sy = h.y - cam.y;
      if (onScreenX(sx, 80)) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 8);
        ctx.fillStyle = `rgba(255,215,64,${0.85 + pulse * 0.15})`;
        ctx.font = pxFont(13); ctx.textAlign = 'center';
        ctx.fillText(h.text, sx, sy);
      }
    }
  }


  function drawPickupBoxes(ctx, cam, list, label, fallback) {
    const t = performance.now() / 1000;
    for (const b of list) {
      if (b.taken) continue;
      const sx = b.x - cam.x; if (!onScreenX(sx, 40)) continue;
      const sy = b.y - cam.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 + b.x);
      ctx.fillStyle = '#33422e';
      ctx.fillRect(sx - 11, sy - 11, 22, 22);
      ctx.strokeStyle = `rgba(255,215,64,${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 2; ctx.strokeRect(sx - 11, sy - 11, 22, 22);
      if (b.weapon && typeof WeaponViews !== 'undefined') {
        // 地面拾取图与手持图同源：直接按该武器的视觉档案画，不再用「武」字代替。
        // 摆放按"物品下缘坐在盒口上"算：原来固定上移 20px，RPG-7 这类 11px 高的件会浮在半空。
        // 摆放按"物品下缘坐在盒口上"算：求高必须与随后绘制用同一个倍率（这里是 1x，不是档位 2x），
        // 否则量到的是两倍半高，物品会浮在盒口上方。
        const sz = WeaponViews.size(b.weapon, 'pickup', 1);
        WeaponViews.render(ctx, b.weapon, { scale: 'pickup', zoom: 1, x: sx, y: sz ? sy - 11 - sz.半高 : sy - 20 });
      } else {
        ctx.fillStyle = '#ffe082'; ctx.font = pxFont(12); ctx.textAlign = 'center';
        ctx.fillText(label, sx, sy + 4);
      }
      ctx.fillStyle = '#9ccc65'; ctx.font = pxFont(8); ctx.textAlign = 'center';
      ctx.fillText(b.weapon ? WEAPONS[b.weapon].name : fallback, sx, sy + 22);
    }
  }

  function drawMechHp(ctx, sx, sy, hp, max) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - 1, sy - 6, 40, 5);
    ctx.fillStyle = '#ff7043';
    ctx.fillRect(sx, sy - 5, 38 * Math.max(0, hp / max), 3);
  }

  // ---------- 人类 ----------
  // ---------- 精灵图动画基础设施 ----------
  // 每实体一份"动作平滑状态"：参数带指数阻尼过渡，消除状态硬切造成的粗糙感
  const _animStates = new WeakMap();
  function _animState(e) {
    let s = _animStates.get(e);
    if (!s) {
      s = {
        rot: 0, dy: 0, dx: 0, sx: 1, sy: 1,
        walkDist: 0, wasAir: false, landT: 0, landVy: 0, dust: 0,
        vxSm: 0, lean: 0,
        runF: 0, atkF: 0, fireF: 0,      // 帧交换混合量（待机↔奔跑 / 攻击 / 开火）
      };
      _animStates.set(e, s);
    }
    return s;
  }
  function _smooth(s, key, target, rate, dt) {
    s[key] += (target - s[key]) * (1 - Math.exp(-dt * rate));
  }
  const _easeOutQuad = u => 1 - (1 - u) * (1 - u);
  const _easeInQuad = u => u * u;
  const _smoothstep = u => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
  // 平滑速率：基础动作慢，挤压/后坐等快事件快
  const _R_SLOW = 8, _R_MID = 12, _R_FAST = 22;

  // 步距驱动的步行相位：相位与实际位移同步（stride=半幅步长，全周期=2×stride），
  // 步伐节奏随地面移动速度自动快慢，杜绝"慢走时贴图快颠、滑步"的粗糙感
  function _walkPhase(s, e, dt, stride) {
    s.walkDist += Math.abs(e.vx) * dt;
    return (s.walkDist / stride) * Math.PI;
  }

  // 各单位的动作帧映射（待机 / 奔跑 / 攻击）——统一程序化像素帧（PX_CHARS）
  // 第 2 阶段：武器改由叠画层按权威锚点绘制，因此人类/英雄取"无预画枪"帧，消除双枪。
  const NO_GUN = () => (typeof ArtDraw !== 'undefined' && typeof WeaponArt !== 'undefined');
  function operatorArt(e) {
    if (typeof OperatorSkins !== 'undefined') return OperatorSkins.get(e.operatorSkin);
    return typeof OperatorVanguard !== 'undefined' ? OperatorVanguard : null;
  }
  function framesForHuman(e, look) {
    const art = operatorArt(e);
    if (art) {
      return {
        idle: art.get('idle', 0, look),
        run: art.get('run', 0, look),
        runB: art.get('run', 1, look),
        fire: art.get('fire', 0, look),
        jump: art.get('jump', 0, look),
        fall: art.get('fall', 0, look),
        turn: art.get('turn', 0, look),
        crouch: art.get('crouch', 0, look),
      };
    }
    const ng = NO_GUN();
    return { idle: PX_CHARS.get('human', 'idle', 0, ng), run: PX_CHARS.get('human', 'run', 0, ng), fire: PX_CHARS.get('human', 'fire', 0, ng) };
  }
  function framesForHero(e) {
    const base = 'hero_' + e.hero;
    const ng = NO_GUN();
    return { idle: PX_CHARS.get(base, 'idle', 0, ng), run: PX_CHARS.get(base, 'run', 0, ng), fire: PX_CHARS.get(base, 'fire', 0, ng) };
  }
  function framesForZombie(e) {
    // 母体变体（mini/titan/queen）共用母体外观，按尺寸缩放区分
    let base = 'z_' + e.ztype;
    if (!PX_CHARS.UNITS[base]) base = (e.ztype === 'sprinter') ? 'z_sprinter' : (e.ztype === 'boomer') ? 'z_boomer' : 'z_mother';
    return { idle: PX_CHARS.get(base, 'idle'), run: PX_CHARS.get(base, 'run', 0), atk: PX_CHARS.get(base, 'atk') };
  }

  // 落地挤压（共用）：从下落状态恢复时，按冲击力快速下压并带一点回弹过冲
  function _applyLanding(s, e, dt) {
    if (s.wasAir && e.onGround) { s.landT = 0.001; s.landVy = Math.min(1.4, Math.max(0, (s.prevVy || 0) / 900)); }
    s.wasAir = !e.onGround;
    s.prevVy = e.vy;
    if (s.landT > 0) {
      s.landT += dt;
      const land = Math.max(0, 1 - s.landT / 0.16);
      const imp = 1 + s.landVy * 0.7;
      let sy = 1 - 0.13 * land * imp;
      let sx = 1 + 0.15 * land * imp;
      const over = Math.max(0, 1 - (s.landT - 0.11) / 0.07);   // 回弹过冲：落地后短暂拉高再归位
      sy += 0.035 * over * imp;
      sx -= 0.04 * over * imp;
      return { sx, sy };
    }
    return null;
  }

  // 脚下尘土：跑动时脚部碎屑，增加动感
  function spawnStepDust(e) {
    if (typeof spawnParticle !== 'function') return;
    const cx = e.x + e.w / 2 - e.facing * 4, cy = e.y + e.h;
    spawnParticle(cx + (Math.random() - 0.5) * 6, cy - Math.random() * 2, 'rgba(168,158,148,0.5)', {
      vx: -e.facing * (20 + Math.random() * 40) + (Math.random() - 0.5) * 30,
      vy: -18 - Math.random() * 34, life: 0.3 + Math.random() * 0.2, size: 1.5 + Math.random() * 2, grav: 480,
    });
  }

  // 像素字体栈辅助：统一 ctx.font（weight 缺省 bold；非粗体传 ''）
  function pxFont(size, weight) { return (weight || 'bold') + ' ' + size + 'px ' + PX_FONT; }

  // 精灵图：按脚底对齐、按 facing 水平翻转；anim 为动作模组变换（仅作用于贴图，不动实体/碰撞）
  // 旋转绕"重心支点"（脚底上方约 38% 高度），摆动时头部更稳、脚部更贴地，动作更自然
  // frame = { base, overlay, alpha }：在待机帧与动作帧之间交叉淡化（alpha 0..1），
  // 实现真正的肢体姿态切换（腿张开/手摆动/攻击前伸），替代"整图平移"
  // 像素帧（_px 标记）：禁用平滑插值，alpha 离散化（>0.5 直接切动作帧，保持点阵硬边）
  function drawSpriteCentered(ctx, img, cx, cy, drawH, facing, anim, frame) {
    const pxMode = !!(img && img._px) || !!(frame && frame.base && frame.base._px);
    const pivot = -drawH * 0.38;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(facing < 0 ? -1 : 1, 1);
    if (anim) {
      ctx.translate(anim.dx || 0, anim.dy || 0);
      ctx.translate(0, pivot);
      ctx.rotate(anim.rot || 0);
      ctx.translate(0, -pivot);
      ctx.scale(anim.sx || 1, anim.sy || 1);
    }
    const overlay = frame && frame.overlay;
    let alpha = frame ? (frame.alpha || 0) : 0;
    if (pxMode && alpha > 0.02 && alpha < 1) alpha = alpha > 0.5 ? 1 : 0;
    if (overlay && alpha > 0.02) {
      _drawOne(ctx, frame.base || img, cx, cy, drawH, 1 - Math.min(1, alpha));
      _drawOne(ctx, overlay, cx, cy, drawH, Math.min(1, alpha));
    } else {
      _drawOne(ctx, frame && frame.base ? frame.base : img, cx, cy, drawH, 1);
    }
    ctx.restore();
  }
  function _drawOne(ctx, img, cx, cy, drawH, alpha) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const drawW = (iw / ih) * drawH;
    ctx.imageSmoothingEnabled = !(img && img._px); // 像素帧关闭平滑保持点阵硬边
    if (alpha >= 1) ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
    else if (alpha > 0.005) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  // 人类动作模组：步距同步跑姿（前倾+非对称颠簸+触地挤压）、跳跃拉伸、落地回弹过冲、开火后坐、站定呼吸
  function animForHuman(e, t, dt, visualFacing) {
    const s = _animState(e);
    const vx = e.vx;
    const face = visualFacing || e.facing;
    const speed = Math.max(0.001, CFG.HUMAN_SPEED);
    const k = Math.min(1, Math.abs(vx) / speed);
    const moving = _smoothstep(k);                        // 连续起步，去掉布尔硬切
    const phase = _walkPhase(s, e, dt, 34);               // 步距同步：约 68px 一个完整步幅
    const step = Math.sin(phase);

    // 跑动起伏：|sin|^1.25 —— 触地瞬间压到谷底、蹬地快速抬升（尖谷圆峰），读起来是"一步一颠"
    const lift = Math.pow(Math.abs(step), 1.25);
    let dy = -(1 + lift * 2.9) * moving
            - (1 - moving) * (0.85 + Math.sin(t * 2.2) * 0.5);   // 站定呼吸
    let dx = step * 1.6 * moving * e.facing;

    // 惯性前倾/后仰：随速度前倾；加速瞬间略后仰、减速瞬间略前倾，消除"贴图随速度直挺挺"的僵硬
    _smooth(s, 'vxSm', vx, 10, dt);
    const accel = (vx - s.vxSm) * 0.0016;
    const leanT = Math.min(0.14, moving * 0.09) + Math.max(-0.06, Math.min(0.06, -accel));
    _smooth(s, 'lean', leanT, 7, dt);
    let rot = e.facing * s.lean;

    // 触地挤压 / 腾空拉伸（与起伏错相位：落地瞬间压扁，腾空时回弹）
    const contact = 1 - lift;                             // 触地=1，腾空=0
    let sy = 1 + contact * 0.035 * moving;
    let sx = 1 - contact * 0.035 * moving;

    // 开火后坐：快出慢回，带身体下压（不是纯平移——肩部下沉 + 背部后坐）
    const kick = Math.min(1, e.muzzleT / 0.05);
    rot -= face * 0.07 * kick;
    dx -= face * 3.2 * kick;
    dy += 0.7 * kick;
    sy -= 0.05 * kick; sx += 0.05 * kick;

    if (!e.onGround) {                                // 上升拉伸 / 下落压扁
      if (e.vy < 0) { sy = 1.12; sx = 0.9; rot -= face * 0.035; }
      else { sy = 0.92; sx = 1.08; }
    } else {
      const L = _applyLanding(s, e, dt);
      if (L) { sx = L.sx; sy = L.sy; }
    }

    // 跑动尘土（脚下的碎屑，增加动感）
    if (moving > 0.4 && e.onGround) {
      s.dust += dt * (3 + moving * 5);
      if (s.dust >= 1) { s.dust -= 1; spawnStepDust(e); }
    }

    // 帧切换：跑动时按步态在"待机帧↔奔跑帧"间二态切换（手脚真正摆动）；开火时短暂切到开火帧
    const runT = (step > 0 ? 1 : 0) * moving;
    const fireT = e.muzzleT > 0 ? 1 : 0;
    _smooth(s, 'runF', runT, 16, dt);
    _smooth(s, 'fireF', fireT, 30, dt);

    _smooth(s, 'rot', rot, _R_SLOW, dt);
    _smooth(s, 'dx', dx, _R_MID, dt);
    _smooth(s, 'dy', dy, _R_MID, dt);
    _smooth(s, 'sx', sx, _R_FAST, dt);
    _smooth(s, 'sy', sy, _R_FAST, dt);
    return {
      dx: s.dx, dy: s.dy, rot: s.rot, sx: s.sx, sy: s.sy,
      phase,
      frame: { run: s.runF, fire: s.fireF },
    };
  }

  // 僵尸动作模组：步距同步蹒跚步（拖步单峰起伏+大幅摇摆）、攻击前扑快出慢回、疾行压平、砸地蓄力、终结者脉动
  function animForZombie(e, t, dt, z) {
    const s = _animState(e);
    const vx = e.vx;
    const speed = Math.max(0.001, z.speed);
    const k = Math.min(1, Math.abs(vx) / speed);
    const moving = _smoothstep(k);
    const phase = _walkPhase(s, e, dt, 44);               // 僵尸步幅更大、步频更慢（蹒跚）
    const step = Math.sin(phase);

    // 蹒跚式起伏：仅正半周期抬升（每步一次抬脚），谷底长时间贴地拖行，读起来是"拖步僵尸"
    const lift = Math.max(0, step) * moving;
    let dy = -(1 + lift * 2.4)
            - (1 - moving) * (0.9 + Math.sin(t * 1.6) * 0.4);   // 站定抽搐
    let dx = step * 1.9 * moving * e.facing;
    let rot = e.facing * (step * 0.055 * moving + Math.sin(phase * 2) * 0.012 * moving)
            + (1 - moving) * Math.sin(t * 1.6) * 0.014 * e.facing;

    // 触地挤压（与抬升错相位）
    const contact = Math.max(0, -step);
    let sy = 1 + contact * 0.04 * moving;
    let sx = 1 - contact * 0.04 * moving;

    // 攻击前扑：0.15s 内快速扑出，之后 0.35s 缓回（配合攻击帧的肢体前伸）
    if (e.lastAttack > 0.12) {
      const atkT = 0.5 - e.lastAttack;
      const out = atkT < 0.15 ? _easeOutQuad(atkT / 0.15) : 1 - _easeInQuad((atkT - 0.15) / 0.35);
      dx += e.facing * 3.4 * out;
      sx += 0.1 * out;
      rot += e.facing * 0.08 * out;
    }
    if (e.dashing) { rot = e.facing * 0.18; dy = -1.6; sx = 1.18; sy = 0.9; dx += e.facing * 3; }
    if (e.slamPrep > 0) { rot = -e.facing * 0.13; dy = -1.7; sy = 0.84; sx = 1.12; }
    if (e.termT > 0) { const p = 1 + Math.sin(t * 6) * 0.035; sx *= p; sy *= p; }

    if (!e.onGround) {
      if (e.vy < 0) { sy = 1.12; sx = 0.9; rot -= e.facing * 0.045; }
      else { sy = 0.92; sx = 1.08; }
    } else {
      const L = _applyLanding(s, e, dt);
      if (L) { sx = L.sx; sy = L.sy; }
    }

    if (moving > 0.35 && e.onGround) {
      s.dust += dt * (2.5 + moving * 4);
      if (s.dust >= 1) { s.dust -= 1; spawnStepDust(e); }
    }

    // 帧切换：移动时二态切换"待机↔蹒跚奔跑"帧；攻击时切到攻击帧（上身前伸张牙舞爪）
    const runT = (step > 0 ? 1 : 0) * moving;
    const atkT = e.lastAttack > 0.12 ? 1 : 0;
    _smooth(s, 'runF', runT, 12, dt);
    _smooth(s, 'atkF', atkT, 20, dt);

    _smooth(s, 'rot', rot, _R_SLOW, dt);
    _smooth(s, 'dx', dx, _R_MID, dt);
    _smooth(s, 'dy', dy, _R_MID, dt);
    _smooth(s, 'sx', sx, _R_FAST, dt);
    _smooth(s, 'sy', sy, _R_FAST, dt);
    return {
      dx: s.dx, dy: s.dy, rot: s.rot, sx: s.sx, sy: s.sy,
      phase,
      frame: { run: s.runF, atk: s.atkF },
    };
  }

  // 手持武器目标长度（像素，按类别适配）
  function gunSpriteLen(w) {
    const g = w.g;
    if (g === 'sniper') return 30;
    if (g === 'pistol') return 18;
    if (g === 'melee') return 22;
    if (g === 'throw') return 16;
    if (g === 'pickup') return 26;
    return 24;
  }
  // 绘制手持武器：程序化像素枪（按类别画机匣/枪管/握把/瞄具，2px 逻辑网格），照片素材已退役
  function drawHandGun(e, ctx, gx, gy, ang) {
    const w = WEAPONS[e.weapon];
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    const g = w ? w.g : 'rifle';
    const len = gunSpriteLen(w || { g });
    const L = px(len), H = g === 'pistol' ? 4 : 5;
    // 枪管（金属亮）
    ctx.fillStyle = '#4b5866';
    pxRect(ctx, 0, -1, L - (g === 'sniper' ? 2 : 4), H - 2);
    // 机匣（金属暗）
    ctx.fillStyle = '#2c3640';
    pxRect(ctx, -6, -2, 8, H);
    // 弹匣（下垂，手枪/霰弹/投掷无）
    if (g === 'rifle' || g === 'smg' || g === 'lmg') {
      ctx.fillStyle = '#39424e';
      pxRect(ctx, -3, H - 1, 3, g === 'lmg' ? 7 : 5);
    }
    // 握把（手枪/步枪）
    if (g === 'pistol' || g === 'rifle' || g === 'smg' || g === 'shotgun') {
      ctx.fillStyle = '#5a3a1c';
      pxRect(ctx, -4, H - 2, 3, 4);
    }
    // 瞄具（狙击/步枪）
    if (g === 'sniper' || g === 'rifle' || g === 'lmg') {
      ctx.fillStyle = '#39424e';
      pxRect(ctx, 1, -4, 4, 2);
    }
    // 近战/投掷：刀身/手柄
    if (g === 'melee') {
      ctx.fillStyle = '#c9d2dd';
      pxRect(ctx, -2, -2, L, 3);
      ctx.fillStyle = '#8a5a2a';
      pxRect(ctx, -6, -1, 4, 3);
    } else if (g === 'throw') {
      ctx.fillStyle = '#5a6a7a';
      pxRect(ctx, -2, -3, 4, 6);
    }
    ctx.restore();
  }
  // 枪口闪光距离（配合像素枪长）
  function handGunMuzzle(e) {
    const w = WEAPONS[e.weapon];
    if (w && w.g === 'sniper') return 27;
    if (w && w.g === 'pistol') return 17;
    return 22;
  }

  // 瞄准方向的枪械叠加 + 枪口闪光（跟随身体起伏/后坐）
  function drawAimGun(e, ctx, cx, cy, anim, cam, visualFacing) {
    const ang = e.aim;
    const face = visualFacing || e.facing;
    const ox = anim ? anim.dx * face : 0;
    const oy = anim ? anim.dy : 0;
    let gx = cx + ox, gy = entityFireY(e) - cam.y + oy;
    let addRot = anim ? anim.rot * 0.4 * face : 0;
    // 跑动时枪口随步态轻微起伏（平滑，与腿摆动同相位）
    if (anim && anim.phase != null && anim.frame && anim.frame.run > 0.01) {
      gy += Math.sin(anim.phase) * 1.2;
      addRot += Math.sin(anim.phase) * 0.03;
    }
    // 第 2/3 阶段通路：枪体按权威枪口锚点绘制（跟随身体起伏的偏移），
    // 枪口火光由 shot 事件的 flash 阶段决定出现/消失时刻。旧版路径保留在 else。
    if (typeof ArtDraw !== 'undefined' && typeof WeaponArt !== 'undefined' && cam) {
      let artEntity = e;
      if (visualFacing && visualFacing !== e.facing) {
        const state = _animState(e);
        artEntity = state.artEntity || (state.artEntity = Object.create(e));
        artEntity.facing = visualFacing;
      }
      const base = WeaponArt.fireOrigin(e);
      const off = { x: gx - (base.x - cam.x), y: gy - (base.y - cam.y) };
      ArtDraw.gun(ctx, cam, artEntity, { off, anim });
      if (ArtDraw.arms) ArtDraw.arms(ctx, cam, artEntity, { off });   // 手必须落在该枪档案的握点上
      ArtDraw.flash(ctx, cam, artEntity, off);
      return;
    }
    drawHandGun(e, ctx, gx, gy, ang + addRot);
    if (e.muzzleT > 0) {
      const md = handGunMuzzle(e);
      const mx = gx + Math.cos(ang) * md, my = gy + Math.sin(ang) * md;
      const fz = ((WEAPONS[e.weapon] || {}).feel || {}).flashSize || 4;
      const fm = ((WEAPONS[e.weapon] || {}).feel || {}).flashMul || 1;
      ctx.fillStyle = `rgba(255,240,150,${(e.muzzleT / 0.05) * (e.attFx ? e.attFx.flashMul : 1) * fm})`;
      pxCircle(ctx, mx, my, 6 * (0.6 + fz * 0.12));
    }
  }

  // 玩家标识：顶部光柱 + 头顶闪烁箭头 + 「您」徽章 + 脚下脉冲光环（人类/僵尸通用，进场一眼认出控制对象）
  function drawPlayerMarker(e, ctx, cam) {
    const t = e.animT;
    const cx = e.x + e.w / 2 - cam.x;
    const gy = e.y + e.h - cam.y;
    const counting = game && game.state === 'countdown';
    const flash = counting ? (0.5 + 0.5 * Math.sin(t * 11)) : (0.5 + 0.5 * Math.sin(t * 5));
    const bob = Math.sin(t * 5) * 4;
    const visualH = e.kind === 'human' ? humanVisualHeight(e) : e.h;
    const ay = gy - visualH - 20 + bob;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 顶部光柱：亮黄像素条带从顶垂下，进场阶段最显眼（分带透明度模拟光晕衰减）
    const beamTop = gy - visualH - 46, beamBot = gy - 12;
    const beamW = e.w * 1.4, beamX = cx - beamW / 2;
    const BANDS = 5;
    for (let i = 0; i < BANDS; i++) {
      const a = (0.22 + flash * 0.12) * (1 - i / BANDS);
      ctx.fillStyle = `rgba(255,233,74,${a.toFixed(3)})`;
      const by0 = px(beamTop + (beamBot - beamTop) * i / BANDS);
      const by1 = px(beamTop + (beamBot - beamTop) * (i + 1) / BANDS);
      ctx.fillRect(px(beamX), by0, px(beamW), Math.max(1, by1 - by0));
    }

    // 箭头：粗黑描边 + 亮黄填充 + 外发光，向下指向角色
    ctx.shadowColor = '#ffe94a'; ctx.shadowBlur = 9;
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,12,20,0.95)';
    ctx.beginPath();
    ctx.moveTo(cx, ay + 11);
    ctx.lineTo(cx - 10, ay - 7);
    ctx.lineTo(cx + 10, ay - 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#ffe94a';
    ctx.fill();
    ctx.shadowBlur = 0;
    // 箭头内侧高光
    ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, ay + 7);
    ctx.lineTo(cx - 6.5, ay - 3);
    ctx.lineTo(cx + 6.5, ay - 3);
    ctx.closePath();
    ctx.stroke();
    // 「您」徽章：黑底黄边，更大更醒目
    ctx.font = pxFont(13);
    const bw = ctx.measureText('您').width + 12;
    const by = gy - visualH - 40 + bob;
    ctx.fillStyle = 'rgba(10,14,22,0.82)';
    ctx.fillRect(cx - bw / 2, by - 10, bw, 20);
    ctx.strokeStyle = 'rgba(255,233,74,0.9)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - bw / 2, by - 10, bw, 20);
    ctx.fillStyle = '#ffe94a';
    ctx.fillText('您', cx, by + 1);

    // 脚下脉冲光环（倒计时阶段扩散更大更亮）：扁平像素椭圆环
    const ringR = e.w * (0.85 + pulse * 0.5) * (counting ? 1.3 : 1);
    ctx.fillStyle = `rgba(255,233,74,${0.5 + pulse * 0.4})`;
    pxEllipseRing(ctx, cx, gy, ringR, 4.5, counting ? 3 : 2);
    ctx.restore();
  }

  function drawHuman(e, ctx, cam, dt) {
    const sx = e.x - cam.x, sy = e.y - cam.y;
    const move = Math.abs(e.vx) > 20;
    const t = e.animT;
    const cx = sx + e.w / 2, cy = sy + e.h;
    const skinArt = operatorArt(e);
    const operator = !e.hero && !!skinArt;
    const state = operator ? _animState(e) : null;
    let spriteFacing = e.facing, look = 'level';
    if (operator) {
      const aim = Number.isFinite(e.aim) ? e.aim : 0;
      const horizontal = Math.cos(aim);
      const targetFacing = Math.abs(horizontal) < 0.12 && state.renderFacing
        ? state.renderFacing : (horizontal < 0 ? -1 : 1);
      if (state.renderFacing == null) state.renderFacing = targetFacing;
      else if (state.renderFacing !== targetFacing) {
        state.renderFacing = targetFacing;
        state.turnT = 0.14;
      }
      state.turnT = Math.max(0, (state.turnT || 0) - dt);
      spriteFacing = state.renderFacing;
      const pitch = Math.sin(aim);
      look = state.look || 'level';
      if (pitch < -0.38) look = 'up';
      else if (pitch > 0.38) look = 'down';
      else if (Math.abs(pitch) < 0.23) look = 'level';
      state.look = look;
    }
    const visualH = operator ? humanVisualHeight(e) : e.h;
    const drawH = operator ? visualH * 60 / 56 : e.h * (SPRITE_SCALE[e.hero ? 'hero' : 'human'] || 1);
    const fr = e.hero ? framesForHero(e) : framesForHuman(e, look);
    const img = fr.idle;
    const anim = img ? animForHuman(e, t, dt, operator ? spriteFacing : undefined) : null;

    // 阴影（随身体起伏缩放，落地更贴地）
    const shScale = anim ? Math.max(0.7, 1 + anim.dy / 34) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    pxEllipse(ctx, cx, e.y + e.h - 2 - cam.y, e.w * 0.8 * shScale, 4 * shScale);

    if (img) {
      // 英雄变身：光晕
      if (e.hero) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        const aura = e.hero === 'light' ? '255,224,130' : '206,147,216';
        ctx.fillStyle = `rgba(${aura},${0.12 + pulse * 0.1})`;
        pxCircle(ctx, cx, cy - e.h * 0.5, e.h * 0.95);
        ctx.fillStyle = `rgba(${aura},${0.35 + pulse * 0.25})`;
        pxRing(ctx, cx, cy - e.h * 0.5, e.h * 0.95, 2);
      }
      let operatorPose = 'idle', operatorFrame = 0;
      if (operator) {
        if (visualH < CFG.HUMAN_VISUAL_H - 8 && e.onGround) operatorPose = 'crouch';
        else if (!e.onGround) operatorPose = e.vy < 0 ? 'jump' : 'fall';
        else if (state.turnT > 0) operatorPose = 'turn';
        else if (e.muzzleT > 0) operatorPose = 'fire';
        else if (move) {
          operatorPose = 'run';
          operatorFrame = Math.sin(anim.phase) >= 0 ? 0 : 1;
        }
        const body = operatorPose === 'run' && operatorFrame ? fr.runB : fr[operatorPose];
        drawSpriteCentered(ctx, body || img, cx, cy, drawH, spriteFacing, anim);
      } else {
        // 帧交换：开火帧 > 奔跑帧 > 待机帧
        let frame = null;
        if (anim && anim.frame) {
          if (anim.frame.fire > 0.02 && fr.fire) frame = { base: img, overlay: fr.fire, alpha: anim.frame.fire };
          else if (anim.frame.run > 0.02 && fr.run) frame = { base: img, overlay: fr.run, alpha: anim.frame.run };
        }
        drawSpriteCentered(ctx, img, cx, cy, drawH, e.facing, anim, frame);
      }
      drawAimGun(e, ctx, cx, cy, anim, cam, operator ? spriteFacing : undefined);
      if (operator) {
        drawSpriteCentered(ctx, skinArt.getInsignia(operatorPose, operatorFrame),
          cx, cy, drawH, spriteFacing, anim);
      }
    } else {
      const legSwing = move ? Math.sin(t * 14) * 7 : 0;
      const lean = e.vx * 0.04;
      const bodyCol = e.isPlayer ? '#ffd54f' : '#4d6fe0';
      const headCol = '#f2c49b';
      // 腿
      ctx.fillStyle = '#22315e';
      ctx.fillRect(cx - 7 + legSwing * 0.5 + lean, cy - 14, 6, 14);
      ctx.fillRect(cx + 1 - legSwing * 0.5 + lean, cy - 14, 6, 14);
      // 躯干
      ctx.fillStyle = bodyCol;
      ctx.fillRect(cx - 8 + lean, cy - 26, 16, 13);
      // 头
      ctx.fillStyle = headCol;
      pxCircle(ctx, cx + lean, cy - 30, 6.5);
      ctx.fillStyle = '#24355c';
      ctx.fillRect(cx - 8 + lean, cy - 36, 16, 5);
      // 枪
      const ang = e.aim;
      const gx = cx + lean, gy = entityFireY(e) - cam.y;
      ctx.save();
      ctx.translate(gx, gy); ctx.rotate(ang);
      ctx.fillStyle = WEAPONS[e.weapon].color || '#444';
      ctx.fillRect(0, -2, 20, 4);
      ctx.fillStyle = '#222';
      ctx.fillRect(14, -4, 6, 8);
      ctx.restore();
      // 枪口闪光
      if (e.muzzleT > 0) {
        const mx = gx + Math.cos(ang) * 22, my = gy + Math.sin(ang) * 22;
        const fz = ((WEAPONS[e.weapon] || {}).feel || {}).flashSize || 4;
        const fm = ((WEAPONS[e.weapon] || {}).feel || {}).flashMul || 1;
        ctx.fillStyle = `rgba(255,240,150,${(e.muzzleT / 0.05) * (e.attFx ? e.attFx.flashMul : 1) * fm})`;
        pxCircle(ctx, mx, my, 6 * (0.6 + fz * 0.12));
      }
    }
    // 玩家标识
    if (e.isPlayer) drawPlayerMarker(e, ctx, cam);
    drawHpBar(e, sx, cy - visualH, ctx);
  }

  // ---------- 僵尸 ----------
  function drawZombie(e, ctx, cam, dt) {
    const z = ZOMBIES[e.ztype];
    const sx = e.x - cam.x, sy = e.y - cam.y;
    const move = Math.abs(e.vx) > 20;
    const t = e.animT;
    const cx = sx + e.w / 2, cy = sy + e.h;
    const attacking = e.lastAttack > 0.12;
    const col = z.color;
    const fr = framesForZombie(e);
    const img = fr.idle;
    const anim = img ? animForZombie(e, t, dt, z) : null;

    // 阴影（随身体起伏缩放，落地更贴地）
    const shScale = anim ? Math.max(0.7, 1 + anim.dy / 34) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    pxEllipse(ctx, cx, e.y + e.h - 2 - cam.y, e.w * 0.85 * shScale, 4 * shScale);
    if (img) {
      // 终结者变身：红光环绕
      if (e.termT > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 8);
        ctx.fillStyle = `rgba(255,50,40,${0.45 + pulse * 0.4})`;
        pxRing(ctx, cx, cy - e.h * 0.5, e.h * 0.72, 3);
      }
      // 疾行冲刺：身后拖影
      if (e.dashing) {
        ctx.fillStyle = 'rgba(0,229,255,0.8)';
        pxLine(ctx, cx - e.facing * e.w * 0.8, cy - e.h * 0.45, cx - e.facing * (e.w * 0.8 + 18), cy - e.h * 0.45);
        ctx.fillRect(px(cx - e.facing * (e.w * 0.8 + 9)) - 1, px(cy - e.h * 0.45) - 1, 3, 3);
      }
      // 母体砸地蓄力：红色预警圈
      if (e.slamPrep > 0) {
        ctx.fillStyle = 'rgba(255,80,40,0.5)';
        pxCircle(ctx, cx, cy - e.h * 0.55, e.h * 0.55 + Math.sin(t * 30) * 4);
      }
      // 帧交换：攻击帧 > 奔跑帧 > 待机帧
      let frame = null;
      if (anim && anim.frame) {
        if (anim.frame.atk > 0.02 && fr.atk) frame = { base: img, overlay: fr.atk, alpha: anim.frame.atk };
        else if (anim.frame.run > 0.02 && fr.run) frame = { base: img, overlay: fr.run, alpha: anim.frame.run };
      }
      drawSpriteCentered(ctx, img, cx, cy, e.h * (SPRITE_SCALE['z_' + e.ztype] || 1), e.facing, anim, frame);
    } else {
      const legSwing = move ? Math.sin(t * 13) * 6 : 0;
      // 腿
      ctx.fillStyle = shade(col, -20);
      ctx.fillRect(cx - 7 + legSwing * 0.5, cy - 12, 6, 12);
      ctx.fillRect(cx + 1 - legSwing * 0.5, cy - 12, 6, 12);
      // 躯干（弯腰）
      ctx.fillStyle = col;
      ctx.fillRect(cx - 9, cy - 24, 18, 14);
      // 手臂（向前伸出当攻击）
      ctx.fillStyle = shade(col, -10);
      const armX = e.facing > 0 ? (attacking ? 12 : 6) : (attacking ? -20 : -14);
      ctx.fillRect(cx + armX - 3, cy - 22, 12, 4);
      // 头
      ctx.fillStyle = shade(col, 12);
      pxCircle(ctx, cx + e.facing * 2, cy - 29, 7);
      // 眼睛
      ctx.fillStyle = e.isPlayer ? '#ff5' : '#ff3b30';
      pxCircle(ctx, cx + e.facing * 4 - 2, cy - 30, 2.2);
      pxCircle(ctx, cx + e.facing * 4 + 2.6, cy - 30, 2.2);
      // 大母体装饰（按类型区分：原初=金角、泰坦=红刺、猩红母皇=紫冠）
      if (isMotherType(e.ztype) && e.ztype !== 'mother_mini') {
        if (e.ztype === 'mother_titan') {
          ctx.fillStyle = '#ff5252';
          for (let i = -2; i <= 2; i++) {
            ctx.fillRect(px(cx + i * 5 - 2), cy - 38, 5, 10);
            ctx.fillRect(px(cx + i * 5) - 1, cy - 41, 3, 3);
          }
        } else if (e.ztype === 'mother_queen') {
          ctx.fillStyle = '#e1bee7';
          pxArch(ctx, cx, cy - 26, 8);
          ctx.fillRect(cx - 8, cy - 34, 3, 8); ctx.fillRect(cx + 5, cy - 34, 3, 8);
        } else {
          ctx.fillStyle = '#ffd54f';
          ctx.fillRect(cx - 8, cy - 34, 3, 10);
          ctx.fillRect(cx + 5, cy - 34, 3, 10);
        }
      }
      if (e.dashing) {
        ctx.fillStyle = 'rgba(0,229,255,0.8)';
        pxLine(ctx, cx - e.facing * 16, cy - 16, cx - e.facing * 30, cy - 16);
      }
      if (e.slamPrep > 0) {
        ctx.fillStyle = 'rgba(255,80,40,0.6)';
        pxCircle(ctx, cx, cy - 20, 20 + Math.sin(t * 30) * 4);
      }
    }
    // 训练营专属：状态可视化（仅训练模式显示，正式模式无）
    if (game && game.training) drawTrainingStatus(e, ctx, sx, sy, t);
    // 训练营专属：测试目标实时读数面板（生命/速度/特效剩余时间）
    if (game && game.training) drawTrainingReadout(e, ctx, sx, sy, cam);
    // 玩家标识（变僵尸后同样清晰认出自己的控制对象）
    if (e.isPlayer) drawPlayerMarker(e, ctx, cam);
    drawHpBar(e, sx, sy, ctx);
  }

  // 训练营专属：特效状态可视化——颜色罩/粒子/描边/头顶图标条（仅训练模式显示）
  function drawTrainingStatus(e, ctx, sx, sy, t) {
    const cx = sx + e.w / 2, cy = sy + e.h;
    const unstop = e.buffs && e.buffs.passive === 'unstop';
    const frostDot = e.doTFx === 'frost' && e.burnT > 0;   // 急冻持续伤害（区别于燃烧）
    // 颜色罩：按激活状态叠加半透明罩层
    let veil = null, veilA = 0;
    if (e.poisonT > 0) { veil = '#aed581'; veilA = 0.28; }
    else if (e.burnT > 0 && !frostDot) { veil = '#ff7043'; veilA = 0.22 + 0.08 * Math.sin(t * 18); }
    else if (frostDot) { veil = '#4fc3f7'; veilA = 0.24 + 0.06 * Math.sin(t * 16); }
    else if (e.slowT > 0 && !unstop) { veil = '#80deea'; veilA = 0.24; }
    if (veil) {
      ctx.fillStyle = veil;
      ctx.globalAlpha = veilA;
      ctx.fillRect(sx, sy, e.w, e.h);
      ctx.globalAlpha = 1;
    }
    // 头顶图标条：当前激活特效的圆形色块（按 fx 颜色），一眼识别
    const icons = [];
    if (e.slowT > 0 && !unstop) icons.push('#80deea');
    if (e.burnT > 0 && !frostDot) icons.push('#ff7043');
    if (e.poisonT > 0) icons.push('#aed581');
    if (e.markT > 0) icons.push('#ce93d8');
    if (e.stunT > 0) icons.push('#fff176');
    if (e.rampDmg > 0) icons.push('#ff8a65');
    if (frostDot || e.freezeT > 0) icons.push('#4fc3f7');
    if (icons.length) {
      const r = 4, gap = 9, x0 = cx - (icons.length - 1) * gap / 2, y0 = sy - 4;
      for (let i = 0; i < icons.length; i++) {
        ctx.fillStyle = icons[i];
        pxCircle(ctx, x0 + i * gap, y0 - 4, r);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        pxRing(ctx, x0 + i * gap, y0 - 4, r, 1);
      }
    }
    // 粒子：减速雪花 / 燃烧火焰 / 中毒泡泡（仅训练营产生，便于观察）
    if (game && game.training && Math.random() < 0.5) {
      if (e.burnT > 0 && !frostDot) spawnParticle(cx + (Math.random() - 0.5) * e.w, cy - Math.random() * e.h, Math.random() < 0.5 ? '#ff7043' : '#ffab40', { vx: (Math.random() - 0.5) * 40, vy: -(60 + Math.random() * 80), size: 2 + Math.random() * 2, life: 0.4, grav: -120 });
      else if (frostDot) spawnParticle(cx + (Math.random() - 0.5) * e.w, cy - Math.random() * e.h, Math.random() < 0.5 ? '#4fc3f7' : '#b3e5fc', { vx: (Math.random() - 0.5) * 30, vy: -(50 + Math.random() * 70), size: 1.8 + Math.random() * 2, life: 0.5, grav: -80 });
      else if (e.poisonT > 0) spawnParticle(cx + (Math.random() - 0.5) * e.w, cy - Math.random() * e.h, '#aed581', { vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 50), size: 1.6 + Math.random() * 2, life: 0.6, grav: -60 });
      else if (e.slowT > 0 && !unstop) spawnParticle(cx + (Math.random() - 0.5) * e.w, cy - Math.random() * e.h, '#e1f5fe', { vx: (Math.random() - 0.5) * 20, vy: -(40 + Math.random() * 60), size: 1.6 + Math.random() * 1.8, life: 0.5, grav: -40 });
    }
    // 标记：紫色发光描边脉动 + 头顶菱形
    if (e.markT > 0) {
      const pulse = 0.55 + 0.35 * Math.sin(t * 9);
      ctx.strokeStyle = `rgba(206,147,216,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx - 2, sy - 2, e.w + 4, e.h + 4);
      ctx.fillStyle = '#ce93d8';
      ctx.beginPath();
      ctx.moveTo(cx, sy - 14); ctx.lineTo(cx + 5, sy - 9); ctx.lineTo(cx, sy - 4); ctx.lineTo(cx - 5, sy - 9);
      ctx.closePath(); ctx.fill();
    }
    // 眩晕：头顶旋转黄星
    if (e.stunT > 0) {
      const rr = 6, a = t * 6;
      ctx.fillStyle = '#fff176';
      ctx.save(); ctx.translate(cx, sy - 14); ctx.rotate(a);
      for (let i = 0; i < 5; i++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.fillRect(rr * 0.4, -1.6, rr * 0.6, 3.2);
      }
      ctx.restore();
    }
    // 狂热：红橙光环随 rampDmg 脉动
    if (e.rampDmg > 0) {
      ctx.fillStyle = `rgba(255,138,101,${0.5 + 0.3 * Math.sin(t * 10)})`;
      pxRing(ctx, cx, cy - e.h * 0.5, e.h * 0.6 + e.rampDmg * 18, 2);
      ctx.fillStyle = '#ff8a65';
      ctx.font = pxFont(10); ctx.textAlign = 'center';
      ctx.fillText('狂热 x' + (1 + e.rampDmg).toFixed(2), cx, sy - 20);
    }
    // 急冻（闪光/烟雾减速）：蓝白描边
    if (e.freezeT > 0) {
      ctx.strokeStyle = 'rgba(79,195,247,0.8)'; ctx.lineWidth = 2;
      ctx.strokeRect(sx - 2, sy - 2, e.w + 4, e.h + 4);
    }
  }

  // 训练营专属：测试目标实时读数面板——生命/速度/特效剩余时间的直观数字变化
  function drawTrainingReadout(e, ctx, sx, sy) {
    if (!e || e.dead || !(e.invuln || e.sandbag)) return;
    const cx = sx + e.w / 2;
    const isZ = e.kind === 'zombie';
    const name = isZ ? (ZOMBIES[e.ztype] ? ZOMBIES[e.ztype].name : e.ztype) : '人类沙包';
    const hpMax = e.maxHp;
    const hpShow = e.invuln ? (e._vhp != null ? e._vhp : e.maxHp) : e.hp;
    const unstop = e.buffs && e.buffs.passive === 'unstop';
    // 速度读数：基础移速 × 减速后（直观显示减速数字变化）
    const base = isZ ? (ZOMBIES[e.ztype] ? ZOMBIES[e.ztype].speed : 140) : CFG.HUMAN_SPEED;
    const slowed = !unstop && e.slowT > 0 && e.slowMul != null;
    const curSpeed = slowed ? Math.max(0, Math.round(base * e.slowMul)) : Math.round(base);
    // 特效剩余时间
    const fx = [];
    const frostDot = e.doTFx === 'frost' && e.burnT > 0;
    if (slowed) fx.push(['减速', e.slowT, '#80deea']);
    if (e.burnT > 0 && !frostDot) fx.push(['燃烧', e.burnT, '#ff7043']);
    if (frostDot) fx.push(['急冻', e.burnT, '#4fc3f7']);
    if (e.poisonT > 0) fx.push(['中毒', e.poisonT, '#aed581']);
    if (e.markT > 0) fx.push(['标记', e.markT, '#ce93d8']);
    if (e.stunT > 0) fx.push(['眩晕', e.stunT, '#fff176']);
    if (e.freezeT > 0) fx.push(['急冻', e.freezeT, '#4fc3f7']);
    ctx.font = pxFont(10);
    const l0 = name;
    const l1 = `HP ${Math.max(0, Math.round(hpShow))} / ${hpMax}`;
    const l2 = `速度 ${curSpeed}${slowed ? ' ↓' + Math.round((1 - e.slowMul) * 100) + '%' : ''}`;
    const w0 = ctx.measureText(l0).width, w1 = ctx.measureText(l1).width, w2 = ctx.measureText(l2).width;
    const w3 = fx.length ? fx.map(([n, tm]) => ctx.measureText(`${n} ${tm.toFixed(1)}s`).width + 8).reduce((a, b) => a + b, 0) - 8 : 0;
    const W = Math.max(w0, w1, w2, w3) + 16;
    const LH = 13, H = (3 + (fx.length ? 1 : 0)) * LH + 8;
    const x = cx - W / 2, y = sy - 10 - H;
    ctx.fillStyle = 'rgba(10,12,20,0.72)';
    ctx.fillRect(x - 1, y - 1, W + 2, H + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, W + 2, H + 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = isZ ? (ZOMBIES[e.ztype] ? ZOMBIES[e.ztype].color : '#fff') : '#ffd54f';
    ctx.fillText(l0, x + 8, y + 4);
    ctx.fillStyle = '#69f0ae';
    ctx.fillText(l1, x + 8, y + 4 + LH);
    ctx.fillStyle = slowed ? '#80deea' : '#e0e0e0';
    ctx.fillText(l2, x + 8, y + 4 + LH * 2);
    if (fx.length) {
      let tx = x + 8;
      ctx.font = pxFont(10, '');
      for (const [n, tm, c] of fx) {
        ctx.fillStyle = c;
        ctx.fillText(`${n} ${tm.toFixed(1)}s`, tx, y + 4 + LH * 3);
        tx += ctx.measureText(`${n} ${tm.toFixed(1)}s`).width + 8;
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }

  function drawHpBar(e, sx, sy, ctx) {
    // 训练营无敌木桩：满血条 + ∞ 标记
    if (e.invuln) {
      const w = Math.max(e.w, 26), x = sx + e.w / 2 - w / 2, y = sy - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#69f0ae';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = '#ffffff';
      ctx.font = pxFont(9); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('∞', x + w / 2, y - 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      return;
    }
    if (e.hp >= e.maxHp) return;
    const w = Math.max(e.w, 26), x = sx + e.w / 2 - w / 2, y = sy - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = e.kind === 'zombie' ? '#ff5252' : '#69f0ae';
    ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 3);
  }

  // 队友靠近虚化：非玩家人类贴近玩家时半透明（避免遮挡视线），距离越近越透明。
  // 范围/最小透明度由 CFG.TEAM_FADE_RANGE / TEAM_FADE_MIN 控制，范围=0 或 =1 透明度即关闭。
  function teamFadeAlpha(e, pl) {
    if (e.isPlayer || !pl || pl.dead) return 1;
    const R = CFG.TEAM_FADE_RANGE;
    if (!R || R <= 0 || CFG.TEAM_FADE_MIN >= 1) return 1;
    const d = Math.abs((e.x + e.w / 2) - (pl.x + pl.w / 2));
    if (d >= R) return 1;
    return CFG.TEAM_FADE_MIN + (1 - CFG.TEAM_FADE_MIN) * (d / R);
  }

  // ---------- 主绘制 ----------
  function drawWorld(ctx, cam, shakeX, shakeY) {
    ctx.save();
    ctx.translate(-Math.round(shakeX), -Math.round(shakeY));
    // 开镜缩放：以准星指向的世界点为缩放中心 → 镜内中央即瞄准处，能看到远处而非只看身边
    // （机瞄默认 1.25x，瞄具按 zoom；带瞄准镜时取景圆外不参与放大，由遮罩覆盖）
    const pl = (game && game.player && game.player.kind === 'human' && !game.player.dead) ? game.player : null;
    const zt = pl ? pl.adsT : 0;
    if (zt > 0.01) {
      const zBase = (pl.attFx && pl.attFx.zoom > 1) ? pl.attFx.zoom : CFG.ADS_IRON_ZOOM;
      const zoom = 1 + (zBase - 1) * _easeOutQuad(zt);
      // 准星(鼠标)指向的世界点在缩放后坐标系中的位置：鼠标画布坐标 + 震屏补偿
      const pcz = Input.mouse.x + shakeX, pcy = Input.mouse.y + shakeY;
      ctx.translate(pcz, pcy);
      ctx.scale(zoom, zoom);
      ctx.translate(-pcz, -pcy);
    }
    drawBackground(ctx, cam);
    // 别墅图：整幅画面由 VillaDraw 按世界坐标出，游戏这边只留主题天空与氛围层。
    // 游戏自己的 solids 是隐形碰撞体，不能再画一遍（drawTerrain 里按 level.villa 跳过），否则墙和楼板会叠两层。
    if (level && level.villa && typeof VillaDraw !== 'undefined') VillaDraw.renderWorld(ctx, level.villa, cam, { night: false });
    // 古堡图（生化模式专用固定地图）：结构与分层由 CastleDraw 出，game 的 solids 不再重绘；
    // game.bioDebug（?bioDebug=1）时才叠加通行图/出生点编号/补给标记，正式 HUD 不出现。
    if (level && level.castle && typeof CastleDraw !== 'undefined') {
      const rebuilt = level.castle.source && typeof CastleArtRebuild !== 'undefined';
      const artV2 = !rebuilt && typeof CastleArtV2 !== 'undefined' && /[?&]castleArtV2=1/.test(location.search);
      const castleRenderer = rebuilt ? CastleArtRebuild : (artV2 ? CastleArtV2 : CastleDraw);
      castleRenderer.renderWorld(ctx, level.castle, cam, { grid: !!(game && game.bioDebug), time: performance.now() / 1000 });
      if (game && game.bioDebug) castleRenderer.renderOverlay(ctx, level.castle, cam);
    }
    // 疾驰列车：整幅世界（天空/三层视差/路基/车厢外壳与内饰/灯光）由 TrainDraw 出，
    // 游戏这边的 level.solids 是隐形碰撞体，不能再画一遍（drawTerrain 按 level.train 跳过）。
    // 关键在 camX：TrainDraw 拿到的相机要额外平移 level.trainX —— 碰撞世界永远静止在
    // 列车自身坐标系里，只有 trainX 在推进，于是背景与路基飞速后退、车厢与玩家相对静止。
    // game.camera 本身**不许改**：实体、子弹、准星、小地图都按它画，改了整屏错位。
    if (level && level.train && typeof TrainDraw !== 'undefined') {
      const S = TrainLevel.view(game, level);
      TrainDraw.scene(ctx, TrainLevel.palette(level), level.train, S,
        { camX: cam.x + (level.trainX || 0), camY: cam.y, VW: CFG.CW, VH: CFG.CH });
    }
    drawTerrain(ctx, cam);
    drawBuildings(ctx, cam);   // 建筑立面（视觉层，不参与碰撞）
    drawDecor(ctx, cam);
    drawStageFx(ctx, cam);

    // 子弹：每把枪特色弹道。绘制本体在 js/art-bullets.js 的 BulletArt.draw ——
    // 玩法与提取台（美术重构-工作区/工具/对比台.html）必须走同一个入口，不允许两处各画一套。
    ctx.lineCap = 'round';
    for (const b of bullets) BulletArt.draw(ctx, b, cam);
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';

    // 实体：先僵尸后人类（或按 y 排序更真实）
    const ents = game.entities.slice().sort((a, b) => (a.y + a.h) - (b.y + b.h));
    const dt = _frameDt();
    for (const e of ents) {
      if (e.dead) continue;
      if (e.kind === 'human') {
        // VS 模式：队伍脚下圆环标识（看色识敌友），敌人闪烁更明显
        if (game && game.vs && e.team && typeof VS_TEAM_COLORS !== 'undefined' && VS_TEAM_COLORS[e.team]) {
          const tc = VS_TEAM_COLORS[e.team];
          const enemy = pl && pl.team != null && pl.team !== e.team;
          const pulse = 0.6 + 0.4 * Math.sin(performance.now() / (enemy ? 160 : 380));
          ctx.fillStyle = tc;
          ctx.globalAlpha = 0.55 * pulse;
          pxEllipse(ctx, e.x + e.w / 2 - cam.x, e.y + e.h + 2 - cam.y, (enemy ? 15 : 12) * pulse, 4.5);
          ctx.globalAlpha = 1;
        }
        // 队友靠近虚化：贴脸队友半透明，玩家始终实心
        const fa = teamFadeAlpha(e, pl);
        if (fa < 1) ctx.globalAlpha = fa;
        drawHuman(e, ctx, cam, dt);
        if (fa < 1) ctx.globalAlpha = 1;
      } else {
        // 隐身 buff：幽灵半透明闪烁，人类无法锁定
        if (e.invisT > 0) ctx.globalAlpha = 0.3 + Math.sin(performance.now() / 260) * 0.2;
        drawZombie(e, ctx, cam, dt);
        ctx.globalAlpha = 1;
      }
    }

    // 攻防世界层：布防点提示（准备阶段）/ 绊线雷 / 已安炸弹 / Scout 标记透视
    drawSiegeExtras(ctx, cam);

    // 红外线配件：沿瞄准方向照射激光线（宽柔光 + 细亮芯 + 末端亮点）
    if (pl && pl.attFx && pl.attFx.laser && pl.kind === 'human' && !pl.dead) {
      const lw = WEAPONS[pl.weapon];
      if (lw && !lw.melee && !lw.grenade) {
        const mx0 = pl.x + pl.w / 2 + Math.cos(pl.aim) * (pl.w / 2 + 10) - cam.x;
        const my0 = entityFireY(pl) + Math.sin(pl.aim) * (pl.w / 2 + 10) - cam.y;
        const LEN = 560;
        const ex = mx0 + Math.cos(pl.aim) * LEN, ey = my0 + Math.sin(pl.aim) * LEN;
        const la = 0.5 + 0.5 * Math.sin(performance.now() / 90);
        ctx.globalAlpha = 0.12 + 0.08 * la;
        ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(mx0, my0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.5 + 0.2 * la;
        ctx.fillStyle = '#ff5252';
        pxLine(ctx, mx0, my0, ex, ey);
        pxCircle(ctx, ex, ey, 2.2);
        ctx.globalAlpha = 1;
      }
    }

    // 战术手电：扇形光锥照亮瞄准方向（叠在激光线之上，末端渐隐）
    if (pl && pl.attFx && pl.attFx.flashlight && pl.kind === 'human' && !pl.dead) {
      const lw = WEAPONS[pl.weapon];
      if (lw && !lw.melee && !lw.grenade) {
        const mx0 = pl.x + pl.w / 2 + Math.cos(pl.aim) * (pl.w / 2 + 10) - cam.x;
        const my0 = entityFireY(pl) + Math.sin(pl.aim) * (pl.w / 2 + 10) - cam.y;
        const LEN = 420, HALF = 0.3;
        const flick = 0.5 + 0.5 * Math.sin(performance.now() / 130);
        ctx.save();
        ctx.translate(mx0, my0);
        ctx.rotate(pl.aim);
        // 光锥：径向像素条带（由近及远渐暗），替代渐变扇形
        for (let i = 0; i < 7; i++) {
          const f0 = i / 7, f1 = (i + 1) / 7;
          const a0 = -HALF + (HALF * 2) * f0, a1 = -HALF + (HALF * 2) * f1;
          ctx.globalAlpha = (0.14 + 0.05 * flick) * (1 - f0);
          ctx.fillStyle = '#fff6be';
          for (let s = 0; s <= 5; s++) {
            const sa = a0 + (a1 - a0) * s / 5;
            pxLine(ctx, 0, 0, Math.cos(sa) * LEN * (1 - f0 * 0.5), Math.sin(sa) * LEN * (1 - f0 * 0.5));
          }
        }
        ctx.globalAlpha = 0.35 + 0.15 * flick;
        ctx.fillStyle = '#fff59d';
        pxLine(ctx, 0, 0, Math.cos(-HALF) * LEN, Math.sin(-HALF) * LEN);
        pxLine(ctx, 0, 0, Math.cos(HALF) * LEN, Math.sin(HALF) * LEN);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // 类别级受击视觉（第 4 阶段）：画在实体与弹壳之上，镜头外不画
    if (typeof HitArt !== 'undefined') HitArt.draw(ctx, cam);

    // 视觉事件产物：弹壳 / 弹匣等短时对象（有上限与屏幕外回收，不参与玩法）
    if (typeof ArtFX !== 'undefined' && typeof ArtEvents !== 'undefined') {
      ArtFX.drawShells(ctx, cam);
      ArtFX.drawMags(ctx, cam);
    }

    // 粒子
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'shell') {   // 弹壳：壳体 + 黄铜弹底 + 压花封口
        ctx.save();
        ctx.translate(p.x - cam.x, p.y - cam.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.6, -p.width / 2, p.size * 1.6, p.width);
        ctx.fillStyle = '#c9a06a';
        ctx.fillRect(-p.size, -p.width / 2, p.size * 0.5, p.width);
        ctx.fillStyle = '#7b2f12';
        ctx.fillRect(p.size * 0.85, -p.width / 2, p.size * 0.15, p.width);
        ctx.restore();
        continue;
      }
      if (p.type === 'ring') {
        ctx.fillStyle = p.color;
        pxRing(ctx, p.x - cam.x, p.y - cam.y, p.size * (1 + (1 - p.life / p.maxLife) * 3), 3);
      } else {
        ctx.fillStyle = p.color;
        pxCircle(ctx, p.x - cam.x, p.y - cam.y, p.size);
      }
    }
    ctx.globalAlpha = 1;

    // 效果区（烟 / 火 / 毒）
    for (const a of areas) {
      const ax = a.x - cam.x, ay = a.y - cam.y;
      if (ax < -a.r * 2 || ax > CFG.CW + a.r * 2) continue;
      const alpha = Math.min(1, a.life / a.maxLife);
      const col = a.type === 'smoke' ? '170,178,184' : (a.type === 'fire' ? '255,110,40' : '120,200,90');
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = alpha * (0.26 - i * 0.055);
        ctx.fillStyle = `rgb(${col})`;
        pxCircle(ctx,
          ax + Math.sin(a.life * 3 + i * 2.1) * a.r * 0.18,
          ay + Math.cos(a.life * 2 + i * 1.7) * a.r * 0.14,
          a.r * (0.55 + i * 0.22));
      }
      if (a.type === 'fire' || a.type === 'bio') {
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = a.type === 'fire' ? '#ff6d2a' : '#7cb342';
        pxRing(ctx, ax, ay, a.r, 2);
      }
    }
    ctx.globalAlpha = 1;

    // 飘字：子系统 2.7「设置 · 辅助」的「伤害数字」开关在这里生效
    // （关掉只是不飘字，燃烧/毒蚀等状态结算与特效照常，不影响玩法）
    if (CFG.UI_DMG_FLOAT !== false) {
      ctx.textAlign = 'center';
      for (const t of texts) {
        ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 2);
        ctx.font = pxFont(t.size);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        ctx.strokeText(t.text, t.x - cam.x, t.y - cam.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x - cam.x, t.y - cam.y);
      }
      ctx.globalAlpha = 1;
    }
    drawAtmosphere(ctx, cam);
    if (typeof CastleCollisionInspector !== 'undefined') CastleCollisionInspector.draw(ctx, game, level, { cam, worldTransform: true });
    ctx.restore();
  }

  // 攻防专属世界层：准备阶段布防点提示 / 绊线雷 / 已安炸弹 / Scout 标记透视
  function drawSiegeExtras(ctx, cam) {
    const vs = game && game.vs;
    if (!vs || vs.mode !== 'siege') return;
    const pl = (game && game.player && game.player.kind === 'human' && !game.player.dead) ? game.player : null;
    const t = performance.now() / 1000;
    // 准备阶段：显示剩余布防点的放置提示（守方视角）
    if (vs.phase === 'prep' && pl && pl.team === 'DEF') {
      const isTrapper = pl.role === 'trapper';
      const maxT = vs.bp.maxTraps + (isTrapper ? 1 : 0);
      for (const s of (level.fortifySpots || [])) {
        const used = s.type === 'trap' ? vs.bp.traps.some(q => q.spot === s) : vs.bp.walls.some(q => q.spot === s);
        if (used) continue;
        if (s.type === 'trap' && vs.bp.traps.length >= maxT) continue;
        if (s.type === 'wall' && vs.bp.walls.length >= vs.bp.maxWalls) continue;
        const sx = s.x - cam.x, sy = s.y - cam.y;
        if (sx < -40 || sx > CFG.CW + 40) continue;
        const pulse = 0.6 + 0.4 * Math.sin(t * 5);
        if (s.type === 'trap') {
          // 地面绊线雷点位：橙色虚线框 + 脉冲「雷」图标
          ctx.fillStyle = `rgba(255,138,80,${0.12 + pulse * 0.10})`;
          pxRect(ctx, sx - 32, sy - 12, 64, 16);
          ctx.fillStyle = `rgba(255,138,80,${0.45 + pulse * 0.4})`;
          pxRect(ctx, sx - 32, sy - 12, 64, 2);
          pxRect(ctx, sx - 32, sy + 2, 64, 2);
          ctx.font = pxFont(11); ctx.textAlign = 'center';
          ctx.fillText('1', px(sx), px(sy - 24));
        } else {
          // 墙段加固位：黄色 L 形角架 + 面板轮廓
          ctx.fillStyle = `rgba(255,200,110,${0.35 + pulse * 0.4})`;
          ctx.fillRect(px(sx), px(sy), 3, px(s.h));
          ctx.fillRect(px(sx), px(sy), px(s.w), 3);
          ctx.fillRect(px(sx + s.w - 3), px(sy), 3, px(s.h));
          ctx.fillRect(px(sx), px(sy + s.h - 3), px(s.w), 3);
          ctx.font = pxFont(11); ctx.textAlign = 'center';
          ctx.fillText('2', px(sx + s.w / 2), px(sy + 20));
        }
      }
    }
    // 已部署绊线雷
    for (const tr of (vs.bp.traps || [])) {
      const sx = tr.x - cam.x, sy = tr.y - cam.y;
      if (sx < -40 || sx > CFG.CW + 40) continue;
      ctx.fillStyle = 'rgba(30,22,14,0.9)';
      pxRect(ctx, sx, sy, tr.w, tr.h);
      ctx.fillStyle = '#b08a5a';
      pxRect(ctx, sx + 6, sy + 2, tr.w - 12, 3);
      // 绊线（横贯地面）
      ctx.fillStyle = `rgba(255,150,90,${0.55 + 0.45 * Math.sin(t * 6)})`;
      pxRect(ctx, sx, sy - 2, tr.w, 1);
      // 感应端红点
      ctx.fillStyle = '#ff5252';
      pxCircle(ctx, sx + tr.w / 2, sy + tr.h / 2, 2.2);
    }
    // 已安炸弹（defuser）：黑底方块 + 红蓝 LED 交替闪烁（越接近爆炸闪越快）
    if (vs.defuser) {
      const df = vs.defuser;
      const sx = df.x - cam.x, sy = df.y - cam.y;
      if (sx > -40 && sx < CFG.CW + 40) {
        const blinkRate = Math.max(2, 18 - df.boomT);   // 剩余越少闪越快
        const on = Math.sin(t * blinkRate * 2) > 0;
        ctx.fillStyle = '#1c1a20';
        pxRect(ctx, sx, sy, df.w, df.h);
        pxOutline(ctx, sx, sy, df.w, df.h, 'rgba(255,255,255,0.5)');
        ctx.fillStyle = on ? '#ff5252' : '#222';
        pxCircle(ctx, sx + 7, sy + 6, 3);
        ctx.fillStyle = !on ? '#448aff' : '#222';
        pxCircle(ctx, sx + df.w - 7, sy + 6, 3);
        ctx.font = pxFont(9); ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd54f';
        ctx.fillText(Math.ceil(df.boomT) + 's', px(sx + df.w / 2), px(sy - 8));
      }
    }
    // Scout 标记：敌方实体橙色描边 + 上方菱形脉冲（3s 透视）
    if (pl && pl.team === 'ATK') {
      for (const e of game.entities) {
        if (e.kind !== 'human' || e.dead || e.team !== 'DEF' || !(e._scoutT > 0)) continue;
        const sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx < -60 || sx > CFG.CW + 60) continue;
        const frac = e._scoutT / 3;
        const a = 0.45 + 0.55 * frac;
        ctx.fillStyle = `rgba(255,138,80,${a * 0.35})`;
        pxRect(ctx, sx - 3, sy - 3, e.w + 6, e.h + 6);
        ctx.fillStyle = `rgba(255,138,80,${a})`;
        pxOutline(ctx, sx - 3, sy - 3, e.w + 6, e.h + 6, 'rgba(255,138,80,' + a + ')');
        // 头顶菱形 ping
        const py = sy - 12 - Math.sin(t * 6) * 2;
        ctx.fillStyle = `rgba(255,138,80,${a})`;
        ctx.beginPath();
        ctx.moveTo(px(sx + e.w / 2), px(py - 6));
        ctx.lineTo(px(sx + e.w / 2 + 5), px(py));
        ctx.lineTo(px(sx + e.w / 2), px(py + 6));
        ctx.lineTo(px(sx + e.w / 2 - 5), px(py));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawOverlays(ctx) {
    const pl = (game && game.player && game.player.kind === 'human' && !game.player.dead) ? game.player : null;
    const ads = !!(pl && pl.adsT > 0.25);
    const scoped = ads && !!(pl.attFx && pl.attFx.scope);
    const mx = Input.mouse.x, my = Input.mouse.y;
    // ---------- 投掷物：抛物线预览 + 蓄力条 + 引信提示 ----------
    const pw = (pl && WEAPONS[pl.weapon]) || null;
    if (pl && pw && pw.grenade && pl.count > 0) {
      const power = pl.charging ? pl.throwPower : 0;   // 按住蓄力实时增长，未按=基准曲线
      const startX = pl.x + pl.w / 2 + Math.cos(pl.aim) * 12;
      const startY = entityFireY(pl);
      const traj = buildThrowTrajectory(startX, startY, pl.aim, pw.bspeed, power);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const dashPts = traj.pts.map(pt => ({ x: pt.x - game.camera.x, y: pt.y - game.camera.y }));
      // 虚线路径：按固定步距断点绘制像素点线
      const step = 12;
      let acc = 0;
      for (let i = 1; i < dashPts.length; i++) {
        const a = dashPts[i - 1], b = dashPts[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= 0) continue;
        const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
        let cur = acc;
        while (cur < d) {
          const on = (cur / step) % 2 < 1;
          if (on) ctx.fillRect(px(a.x + ux * cur), px(a.y + uy * cur), 2, 2);
          cur += step / 2;
        }
        acc = d - cur + (step / 2);
      }
      ctx.restore();
      // 落点标记（落地圆环）
      if (traj.landed) {
        const lx = traj.endX - game.camera.x, ly = traj.endY - game.camera.y;
        ctx.fillStyle = 'rgba(255,233,74,0.9)';
        pxRing(ctx, lx, ly, 9, 2);
        pxRing(ctx, lx, ly, 4, 2);
      }
      // 蓄力条：按住左键时显示，颜色随力度 绿→橙→红
      if (pl.charging) {
        const bw = Math.max(4, 70 * pl.throwPower);
        const bx = mx - bw / 2, by = my + 26;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, 8);
        ctx.fillStyle = pl.throwPower < 0.5 ? '#7bd43c' : (pl.throwPower < 0.8 ? '#ffb300' : '#ff5252');
        ctx.fillRect(bx, by, bw, 4);
      }
      // 引信提示：拔销后准星上方红色倒计时
      if (pl.pinPulled) {
        const t = `引信 ${Math.max(0, pl.fuseLeft).toFixed(1)}s`;
        ctx.font = pxFont(14);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(t, mx, my - 26);
        ctx.fillStyle = '#ff5252';
        ctx.fillText(t, mx, my - 26);
      }
      ctx.restore();
    }
    if (scoped) {
      // 瞄准镜遮罩：镜筒外铺黑 + 圆形取景框 + 镜内十字准星（取景圆随倍率适度收拢，避免高倍镜视野过窄）
      const zoom = (pl.attFx && pl.attFx.zoom > 1) ? pl.attFx.zoom : CFG.ADS_IRON_ZOOM;
      const R = CFG.CH * 0.46 / (1 + (zoom - 1) * 0.10);
      ctx.save();
      // 逐行铺镜筒外区域（旧实现是 fillRect 全屏 + destination-out 挖孔，
      // 会把已经画好的世界一起擦穿 → 镜筒里全黑）
      ctx.fillStyle = 'rgba(0,0,0,0.84)';
      pxLensMask(ctx, mx, my, Math.max(30, R), CFG.CW, CFG.CH);
      // 黑色框线 + 延伸到屏幕边缘的细线（狙击镜风格）
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      pxLine(ctx, mx, 0, mx, my - R); pxLine(ctx, mx, my + R, mx, CFG.CH);
      pxLine(ctx, 0, my, mx - R, my); pxLine(ctx, mx + R, my, CFG.CW, my);
      ctx.fillStyle = 'rgba(0,0,0,0.95)';
      pxRing(ctx, mx, my, R, 2);
      // 镜内准星：按瞄具差异化（红点 / 全息环 / ACOG 倒V / 4x-8x 细十字密位）
      const reticle = (pl.attFx && pl.attFx.optics) || 'iron';
      if (reticle === 'reddot') {
        ctx.fillStyle = 'rgba(255,80,80,0.9)';
        pxLine(ctx, mx - 16, my, mx - 8, my);
        pxLine(ctx, mx + 8, my, mx + 16, my);
        pxLine(ctx, mx, my - 16, mx, my - 8);
        pxLine(ctx, mx, my + 8, mx, my + 16);
        ctx.fillStyle = 'rgba(255,40,40,0.95)';
        pxCircle(ctx, mx, my, 2.6);
      } else if (reticle === 'holographic') {
        ctx.fillStyle = 'rgba(255,60,60,0.85)';
        pxRing(ctx, mx, my, 24, 2);
        ctx.fillStyle = 'rgba(255,60,60,0.95)';
        pxRing(ctx, mx, my, 2.2, 2);
        pxLine(ctx, mx - 4, my, mx + 4, my);
        pxLine(ctx, mx, my - 4, mx, my + 4);
      } else if (reticle === 'acog') {
        ctx.fillStyle = 'rgba(120,255,120,0.9)';
        pxLine(ctx, mx - 12, my + 8, mx, my - 8);
        pxLine(ctx, mx, my - 8, mx + 12, my + 8);
        pxLine(ctx, mx, my + 12, mx, my + 20);
        pxLine(ctx, mx - 12, my, mx + 12, my);
        ctx.fillStyle = 'rgba(120,255,120,0.95)';
        pxCircle(ctx, mx, my, 1.6);
      } else {   // scope4x / scope8x / 机瞄
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        pxLine(ctx, mx - 18, my, mx - 7, my);
        pxLine(ctx, mx + 7, my, mx + 18, my);
        pxLine(ctx, mx, my - 18, mx, my - 7);
        pxLine(ctx, mx, my + 7, mx, my + 18);
        if (reticle === 'scope8x') {   // 8x 密位点
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          for (const dd of [[0,-10],[0,10],[-10,0],[10,0]]) { ctx.fillRect(px(mx+dd[0])-1, px(my+dd[1])-1, 3, 3); }
        }
        ctx.fillStyle = 'rgba(255,80,80,0.95)';
        pxCircle(ctx, mx, my, 2);
      }
      ctx.restore();
    } else if (ads) {
      // 机瞄（无瞄具 1.25x）：镜筒外像素暗角（保留中央视野与普通准星），替代径向渐变
      // 同 scoped 分支，不再用 destination-out —— 那会连世界一起擦成透明
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      pxLensMask(ctx, mx, my, Math.max(30, CFG.CH * 0.46 / (1 + (CFG.ADS_IRON_ZOOM - 1) * 0.10) * 0.92), CFG.CW, CFG.CH);
      ctx.restore();
    }
    // 准星（开镜状态下由镜内十字替代）
    if (!scoped) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      pxRing(ctx, mx, my, 7, 2);
      pxLine(ctx, mx - 12, my, mx - 5, my);
      pxLine(ctx, mx + 5, my, mx + 12, my);
      pxLine(ctx, mx, my - 12, mx, my - 5);
      pxLine(ctx, mx, my + 5, mx, my + 12);
    }

    // 玩家受击红屏
    if (game && game.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,30,20,${Math.min(0.4, game.hurtFlash)})`;
      ctx.fillRect(0, 0, CFG.CW, CFG.CH);
    }
    // 感染绿色光晕
    if (game && game.infectFlash > 0) {
      ctx.fillStyle = `rgba(80,255,80,${Math.min(0.35, game.infectFlash)})`;
      ctx.fillRect(0, 0, CFG.CW, CFG.CH);
    }
    // 进场指引：倒计时阶段提示玩家认准自己的角色（黄色箭头 + 「您」标记）
    if (game && game.state === 'countdown') {
      const label = '黄色箭头 + 「您」标记的角色就是你自己';
      ctx.font = pxFont(15);
      const tw = ctx.measureText(label).width + 30;
      const y = 48;
      ctx.fillStyle = 'rgba(8,12,20,0.62)';
      ctx.fillRect(CFG.CW / 2 - tw / 2, y - 14, tw, 28);
      ctx.strokeStyle = 'rgba(255,233,74,0.7)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(CFG.CW / 2 - tw / 2, y - 14, tw, 28);
      ctx.fillStyle = '#ffe94a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, CFG.CW / 2, y + 1);
    }
  }

  // ---------- 小地图 ----------
  function drawMinimap() {
    const c = document.getElementById('minimap');
    const scale = 200 / level.worldW;
    const h = Math.max(40, Math.round(CFG.WORLD_H * scale));
    c.width = 200; c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 200, h);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, 200, h);
    // 地形
    for (const s of level.solids) {
      g.fillStyle = s.oneway ? 'rgba(160,120,90,0.8)' : 'rgba(90,120,90,0.9)';
      g.fillRect(s.x * scale, s.y * scale, Math.max(2, s.w * scale), s.h * scale);
    }
    // 撤离点
    if (level.escapeZone) {
      const ez = level.escapeZone;
      g.fillStyle = 'rgba(80,255,140,0.7)';
      g.fillRect(ez.x * scale, ez.y * scale, ez.w * scale, ez.h * scale);
    }
    // 实体
    for (const e of game.entities) {
      if (e.dead) continue;
      if (e.kind === 'zombie' && e.invisT > 0) continue;   // 隐身幽灵不出现在小地图
      const px = (e.x + e.w / 2) * scale, py = (e.y + e.h / 2) * scale;
      if (e.kind === 'zombie') { g.fillStyle = '#ff4444'; pxCircle(g, px, py, 2.2); }
      else if (e.isPlayer) { g.fillStyle = '#ffffff'; pxCircle(g, px, py, 3.2); }
      else { g.fillStyle = '#4d6fe0'; pxCircle(g, px, py, 2); }
    }
  }

  // ---------- HUD（DOM） ----------
  function updateHUD() {
    const p = game.player;
    if (!p) return;   // 联网客户端等待首个快照时玩家为空
    const tag = document.getElementById('factionTag');
    const hpFill = document.getElementById('hpFill');
    const hpText = document.getElementById('hpText');
    const wInfo = document.getElementById('weaponInfo');
    const sInfo = document.getElementById('skillInfo');
    const timer = document.getElementById('timer');

    const isZ = p.faction === 'zombie';
    if (game.vs && p.team) {
      const tcol = (typeof VS_TEAM_COLORS !== 'undefined' && VS_TEAM_COLORS[p.team]) || '#fff';
      tag.textContent = `${vsTeamName(p.team)}阵营`;
      tag.className = 'faction vs';
      tag.style.color = tcol;
      tag.style.borderColor = tcol;
    } else {
      tag.style.color = '';
      tag.style.borderColor = '';
      tag.textContent = isZ ? '僵尸阵营' : '人类阵营';
      tag.className = 'faction ' + (isZ ? 'zombie' : 'human');
    }
    hpFill.className = isZ ? 'zombie' : '';
    const hpPct = Math.max(0, p.hp / p.maxHp * 100);
    hpFill.style.width = hpPct + '%';
    hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;

    if (isZ) {
      const z = ZOMBIES[p.ztype];
      wInfo.innerHTML = `<span class="wname">${z.name}</span> <span style="opacity:.8">— 近战感染</span>`;
      const zi = document.getElementById('hudWeaponIcon');
      if (zi && zi._sig !== 'z') { zi._sig = 'z'; zi.classList.add('hidden'); }
      let skill = '';
      if (p.ztype === 'sprinter') skill = `冲刺 ${p.skillCd > 0 ? p.skillCd.toFixed(1) + 's' : '就绪'}`;
      else if (isMotherType(p.ztype) && p.ztype !== 'mother_mini') {
        const zc = ZOMBIES[p.ztype];
        const parts = [];
        if (zc.slamRadius) parts.push(`跳跃猛击 ${p.skillCd > 0 ? p.skillCd.toFixed(1) + 's' : '就绪'}`);
        if (zc.summonCd) parts.push(`召唤 ${p.spawnT > 0 ? p.spawnT.toFixed(1) + 's' : '就绪'}`);
        if (zc.auraRadius) parts.push('母皇光环');
        skill = parts.join(' · ');
      }
      sInfo.textContent = skill ? '技能：' + skill : '';
      sInfo.classList.toggle('hidden', !skill);
    } else {
      const w = WEAPONS[p.weapon];
      const g = WEAPON_GROUP_OF[p.weapon];
      const gname = g ? g.name : '';
      let ammo = `子弹 ${Number.isFinite(p.mag) ? p.mag : '∞'}`;
      if (w.melee) ammo = `伤害 ${w.dmg}　距离 ${w.range}`;
      else if (w.grenade) ammo = `数量 ${p.count} / ${w.count}`;
      // 特色标签：自身机制 + fx 特色弹
      const tags = [];
      if (w.explode) tags.push('<span style="color:#ff8a50">范围爆炸</span>');
      if (w.pierce) tags.push('<span style="color:#00e5ff">穿透×' + w.pierce + '</span>');
      if (w.windup) tags.push('<span style="color:#b388ff">持续开火加速</span>');
      if (w.burst) tags.push('<span style="color:#ffd54f">三连发</span>');
      if (w.flamer) tags.push('<span style="color:#ff7043">火焰喷射</span>');
      if (w.melee) tags.push('<span style="color:#ff7043">近战挥砍</span>');
      if (w.grenade) {
        const eff = { boom: '高爆', flash: '致盲', smoke: '烟雾', fire: '燃烧', bio: '毒气', impact: '冲击引爆', heal: '治疗', freeze: '冰冻' }[w.effect];
        tags.push(`<span style="color:#26c6da">${eff}</span>`);
      }
      if (w.fx && FX_META[w.fx]) tags.push(`<span style="color:${FX_META[w.fx].color}">${FX_META[w.fx].name}</span>`);
      // 配件徽章：当前武器已装配的配件（瞄具/枪管/握把/枪口/激光）
      if (p.attachments && p.attachments.length) {
        if (配件入口开放) for (const ak of p.attachments) {
          const a = ATTACH_META[ak];
          if (a) tags.push(`<span style="color:${a.color}">◈${a.name}</span>`);
        }
        if (p.ads) {
          const zx = (p.attFx && p.attFx.zoom > 1) ? p.attFx.zoom : CFG.ADS_IRON_ZOOM;
          tags.push(`<span style="color:#ffe94a">开镜 ${zx.toFixed(zx < 10 ? 1 : 0)}x</span>`);
        }
      }
      // 人物装备徽章：当前背包的护甲/战术靴
      const bpEquip = BACKPACKS[p.backpackIdx] && BACKPACKS[p.backpackIdx].equip;
      if (bpEquip) {
        for (const slot of Object.keys(bpEquip)) {
          const eid = bpEquip[slot];
          const es = EQUIP_SLOTS[slot], em = EQUIP_META[eid];
          if (em && es) tags.push(`<span style="color:${em.color}">${es.icon}${em.name}</span>`);
        }
      }
      const special = tags.length ? '　' + tags.join('　') : '';
      const reload = p.reloading ? `　<font color="#ffb74d">换弹中 ${(p.reloadT).toFixed(1)}s</font>` : '';
      let opHint = '';
      if (w.grenade) {
        const fuse = w.fuse ? `　右键拔销 ${w.fuse}s 引爆` : '';
        opHint = `　<span style="color:#26c6da">左键蓄力投掷${fuse}</span>`;
      }
      wInfo.innerHTML = `<span class="wname">${gname} · ${w.name}</span>　${ammo}${reload}${special}${opHint}`;
      // HUD 武器图：与手持/检视/拾取同源，只在武器或配件变化时重绘
      const icon = document.getElementById('hudWeaponIcon');
      if (icon && typeof WeaponViews !== 'undefined') {
        const sig = p.weapon + '|' + (p.attachments || []).join(',') + '|' + (isZ ? 'z' : 'h');
        if (icon._sig !== sig) {
          icon._sig = sig;
          icon.classList.toggle('hidden', isZ);
          // fit 纵向只让 2px：HUD 画布 92×40、中心在 20，可画高度上限就是 40。
          // 按旧的"四边各让 8"给 32 会把 55 件压到 1x（选型表：第10阶段10.1取景边距选型.md），
          // 而让 2px 实测既不降档也不裁切。
          if (!isZ) WeaponViews.paint(icon, p.weapon, { scale: 'hud', fit: [icon.width - 8, icon.height - 2], attachments: p.attachments });
        }
      }
      sInfo.classList.add('hidden');
    }

    const t = game.vs ? Math.max(0, game.vs.roundT) : Math.max(0, game.timeLeft);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    timer.textContent = game.walk ? '探索' : `${m}:${s < 10 ? '0' : ''}${s}`;

    // ---- VS 模式：比分牌 / 回合 / 准备阶段 ----
    if (game.vs) {
      updateVsHud(p);
    } else if (document.getElementById('vsBoard')) {
      document.getElementById('vsBoard').classList.add('hidden');
      document.getElementById('objBar') && document.getElementById('objBar').classList.add('hidden');
      document.getElementById('roleBar') && document.getElementById('roleBar').classList.add('hidden');
    }

    // 关卡信息 + 防守倒计时
    const stageEl = document.getElementById('stageInfo');
    const st = level.stages && level.stages[game.stage];
    if (st) {
      let html = `<span>${st.name}</span>`;
      if (game.guardT > 0) html += `　<span class="guard">防守 ${Math.ceil(game.guardT)}s</span>`;
      else if (game.guardGrace > 0) html += `　<span class="guard">防守完成，${Math.ceil(game.guardGrace)}s 后封锁</span>`;
      else if (game.stage < (level.stages.length - 1)) html += `　<span style="opacity:.7">踩线触发下一关</span>`;
      stageEl.innerHTML = html;
    }

    // 人类：能量条 / 英雄条 / 拾取槽
    const enW = document.getElementById('energyWrap');
    const heW = document.getElementById('heroWrap');
    const psEl = document.getElementById('pickupSlots');
    const bufEl = document.getElementById('buffInfo');
    if (!isZ) {
      enW.classList.remove('hidden');
      document.getElementById('energyFill').style.width = (p.energy / p.maxEnergy * 100) + '%';
      document.getElementById('energyText').textContent =
        p.hero ? '变身中' : `${Math.floor(p.energy)}/${p.maxEnergy} 能量`;
      if (p.hero) {
        const htm = HERO_TYPES[p.hero];
        heW.classList.remove('hidden');
        document.getElementById('heroFill').style.width = (p.heroT / htm.dur * 100) + '%';
        document.getElementById('heroText').textContent = `${htm.name} ${p.heroT.toFixed(1)}s`;
      } else heW.classList.add('hidden');
      const slots = p.pickupSlots || [];
      const hasPk = slots.some(s => s && s.weapon);
      psEl.classList.toggle('hidden', !hasPk);
      if (hasPk) {
        psEl.innerHTML = slots.map((s, i) => {
          if (!s || !s.weapon) return '';
          const w = WEAPONS[s.weapon];
          const ammo = s.ammo > 0 ? `${s.ammo}` : '<font color="#ff8a50">耗尽</font>';
          return `<div class="pickup-slot"><span class="pk-key">${i + 5}号槽 · G丢弃</span>${w.name}<br>${ammo}</div>`;
        }).join('');
      }
      bufEl.classList.add('hidden');
    } else {
      // 幽灵：水晶 Buff（被动 + 主动 + Q 冷却）
      enW.classList.add('hidden'); heW.classList.add('hidden'); psEl.classList.add('hidden');
      const b = p.buffs || {};
      const parts = [];
      if (b.passive) {
        const bt = BUFF_TYPES[b.passive];
        parts.push(`<span class="b ${bt.rarity === 'rare' ? 'rare' : ''}">${bt.name}</span>`);
      }
      if (b.active) {
        const bt = BUFF_TYPES[b.active];
        const ready = b.activeCd <= 0;
        parts.push(`<span class="b ${bt.rarity === 'rare' ? 'rare' : ''} ${ready ? 'ready' : ''}">${bt.name}${ready ? ' [Q]' : ' [Q ' + Math.ceil(b.activeCd) + 's]'}</span>`);
      }
      if (parts.length) {
        parts.push('<span class="hint">死亡清空 · 切关保留</span>');
        bufEl.innerHTML = parts.join('');
        bufEl.classList.remove('hidden');
      } else bufEl.classList.add('hidden');
    }

    // 撤离进度
    const eb = document.getElementById('escapeBar');
    if (game.escapeProg > 0) {
      eb.classList.remove('hidden');
      document.getElementById('escapeFill').style.width = (game.escapeProg / CFG.ESCAPE_TIME * 100) + '%';
    } else eb.classList.add('hidden');

    // 生化背包信息（人类）
    const bpEl = document.getElementById('backpackInfo');
    if (!isZ) {
      bpEl.classList.remove('hidden');
      const bp = BACKPACKS[p.backpackIdx];
      let bpHtml = `背包 ${p.backpackIdx + 1}号 · ${bp.name}`;
      if (p.hero) bpHtml += '　<span style="opacity:.6">变身锁定</span>';
      else if (p.attribCd > 0) bpHtml += `　<span style="color:#ffb74d">B冷却 ${p.attribCd.toFixed(1)}s</span>`;
      else bpHtml += '　<span style="color:#7bff5e">[B] 切背包</span>';
      bpEl.innerHTML = bpHtml;
    } else bpEl.classList.add('hidden');
  }

  // ---- VS 模式 HUD：比分牌 / 回合 / 准备阶段 / (攻防)目标点进度条 ----
  function updateVsHud(p) {
    const vs = game.vs;
    const board = document.getElementById('vsBoard');
    if (!vs || !board) return;
    board.classList.remove('hidden');
    const isArena = vs.mode === 'arena';
    const tA = isArena ? 'A' : 'ATK', tB = isArena ? 'B' : 'DEF';
    const squadA = isArena ? 'A' : vs.atkSquad;
    const squadB = isArena ? 'B' : vs.defSquad;
    const colA = (typeof VS_TEAM_COLORS !== 'undefined' && VS_TEAM_COLORS[tA]) || '#ff5252';
    const colB = (typeof VS_TEAM_COLORS !== 'undefined' && VS_TEAM_COLORS[tB]) || '#448aff';
    const myTeam = p && p.team;
    const aEl = document.getElementById('vsTeamA'), bEl = document.getElementById('vsTeamB'), rEl = document.getElementById('vsRound');
    const nameA = isArena ? vsTeamName(tA) : `${vsTeamName(tA)} · ${squadA}队`;
    const nameB = isArena ? vsTeamName(tB) : `${vsTeamName(tB)} · ${squadB}队`;
    aEl.innerHTML = `<span class="vs-dot" style="background:${colA}"></span><b style="color:${colA}">${nameA}</b><em class="vs-score">${vs.points[squadA] || 0}</em>${myTeam === tA ? '<i class="vs-you">你</i>' : ''}`;
    bEl.innerHTML = `<span class="vs-dot" style="background:${colB}"></span><b style="color:${colB}">${nameB}</b><em class="vs-score">${vs.points[squadB] || 0}</em>${myTeam === tB ? '<i class="vs-you">你</i>' : ''}`;
    if (isArena) {
      rEl.textContent = `Kill to Win ${vs.killTarget}`;
      if (document.getElementById('objBar')) document.getElementById('objBar').classList.add('hidden');
      const rw = document.getElementById('roleBar');
      if (rw) rw.classList.add('hidden');
    } else {
      const need = Math.ceil((vs.bestOf + 1) / 2);
      rEl.textContent = vs.phase === 'prep'
        ? `准备阶段 ${Math.max(0, Math.ceil(vs.prepT))}s · 第 ${vs.round} 回合`
        : `第 ${vs.round} 回合 · A队[${vs.points.A}] B队[${vs.points.B}]（先 ${need} 胜）`;
      const obj = document.getElementById('objBar');
      if (obj && vs.obj) {
        obj.classList.remove('hidden');
        // 进度参数按目标类型取值：bomb 用安包/拆除/爆炸进度（与 game.js updateSiegeBomb 一致），
        // secure 用占领秒数；否则 updateHUD 每帧调用会把 game.js 已写入的正确进度覆盖成 0
        if (vs.obj.kind === 'bomb') {
          const pl = vs._plant, df = vs.defuser;
          drawObjectiveBar(pl ? pl.t : (df ? df.boomT : 0), pl ? pl.need : 45, 'bomb',
            pl ? (pl.kind === 'plant' ? 'plant' : 'defuse') : (df ? 'boom' : 'none'));
        } else {
          drawObjectiveBar(vs._holdT || 0, vs.obj.hold, 'secure', 'hold');
        }
      } else if (obj) obj.classList.add('hidden');
      // 干员角色行：攻防模式显示当前干员 + F 技能；准备阶段追加布防提示
      const rw = document.getElementById('roleBar');
      if (rw) {
        rw.classList.remove('hidden');
        const role = p && p.role ? SIEGE_ROLES[p.role] : null;
        const myTeam = p && p.team;
        rw.innerHTML = role
          ? `<span class="rb-row"><span class="rb-team" style="color:${(myTeam === 'ATK' ? VS_TEAM_COLORS.ATK : VS_TEAM_COLORS.DEF)}">${vsTeamName(myTeam)}</span>` +
            `<span class="rb-name">${role.name}</span>` +
            (role.skill !== '—' ? `<span class="rb-skill">[F] ${role.skill}${p.roleCd > 0 ? ` ${Math.ceil(p.roleCd)}s` : ''}</span>` : `<span class="rb-skill">${role.passive}</span>`) + `</span>`
          : '';
        if (vs.phase === 'prep') {
          if (myTeam === 'DEF') {
            const maxT = vs.bp.maxTraps + (p && p.role === 'trapper' ? 1 : 0);
            rw.innerHTML += `<span class="rb-hint">按 1 放绊线雷（${vs.bp.traps.length}/${maxT}） · 按 2 加固墙（${vs.bp.walls.length}/${vs.bp.maxWalls}）</span>`;
          } else {
            rw.innerHTML += `<span class="rb-hint">准备阶段 · 侦察目标点后等行动开始</span>`;
          }
        }
      }
    }
  }
  // 攻防目标点进度条（game.js 每帧调用，也在 updateVsHud 复用）
  // progress/hold 由调用方按目标类型传入：secure=占领秒数 / bomb=安包或拆除进度或爆炸倒计时
  function drawObjectiveBar(progress, hold, kind, state) {
    const obj = document.getElementById('objBar');
    if (!obj) return;
    obj.classList.remove('hidden');
    document.getElementById('objFill').style.width = Math.min(100, progress / (hold || 1) * 100) + '%';
    const label = document.getElementById('objText');
    let txt, col = 'rgba(255,255,255,.75)';
    if (kind === 'bomb') {
      if (state === 'plant') { txt = `安装炸弹 ${Math.floor(progress)}/${hold}s`; col = '#ffa726'; }
      else if (state === 'defuse') { txt = `拆除炸弹 ${Math.floor(progress)}/${hold}s`; col = '#7bd4ff'; }
      else if (state === 'boom') { txt = `爆炸倒计时 ${Math.ceil(progress)}s`; col = '#ff5252'; }
      else { txt = '目标区 · 找到炸弹并安装'; col = 'rgba(255,255,255,.75)'; }
    } else {
      txt = progress > 0 ? `占领区域 ${Math.floor(progress)}/${hold}s` : `争夺房间（需占领 ${hold}s）`;
      col = progress > 0 ? '#ffa726' : 'rgba(255,255,255,.75)';
    }
    label.textContent = txt;
    label.style.color = col;
  }

  function renderBackpackUI() {
    const grid = document.getElementById('backpackGrid');
    if (!grid) return;
    const p = game.player;
    const cur = p ? p.backpackIdx : 0;
    const curCd = p ? p.backpackCd : 0;
    grid.innerHTML = BACKPACKS.map((bp, i) => {
      const gs = bp.loadout;
      const active = i === cur;
      const cd = curCd > 0 && !active;
      const slots = WEAPON_GROUP_ORDER.map(gid => {
        const k = gs[gid];
        const w = WEAPONS[k];
        const fx = w && w.fx && FX_META[w.fx] ? `<i style="color:${FX_META[w.fx].color}">${FX_META[w.fx].name}</i>` : '';
        return `<span class="bp-slot"><b style="color:${SLOT_META[gid].color}">${SLOT_META[gid].name}</b>${w ? ' ' + w.name + (fx ? ' ' + fx : '') : ' —'}</span>`;
      }).join('');
      return `<div class="bp-cell ${active ? 'active' : ''} ${cd ? 'cd' : ''}" data-bp="${i}">
        <div class="bp-head"><span class="bp-num">${i + 1}</span><span class="bp-name">${bp.name}</span>${active ? '<span class="bp-cur">使用中</span>' : ''}${cd ? '<span class="bp-cd">冷却中</span>' : ''}</div>
        <div class="bp-meta">${slots}</div>
      </div>`;
    }).join('');
  }
  function weaponLabel(k) {
    const w = WEAPONS[k];
    if (!w) return '—';
    const fx = w.fx && FX_META[w.fx] ? `<i style="color:${FX_META[w.fx].color}">${FX_META[w.fx].name}</i>` : '';
    return `${w.name}${fx ? ' ' + fx : ''}`;
  }
  function showBackpackUI() { const el = document.getElementById('backpackUI'); if (el) el.classList.remove('hidden'); }
  function hideBackpackUI() { const el = document.getElementById('backpackUI'); if (el) el.classList.add('hidden'); }

  function pushFeed(html, cls) {
    feed.push({ html, cls, t: performance.now() });
    renderFeed();
  }
  function renderFeed() {
    const el = killfeedEl();
    const now = performance.now();
    feed = feed.filter(f => now - f.t < 4000).slice(-5);
    el.innerHTML = feed.map(f => `<div class="${f.cls || ''}">${f.html}</div>`).join('');
  }
  function centerMsg(text, dur) {
    const el = msgEl();
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(msgTimer);
    if (dur) msgTimer = setTimeout(() => el.classList.add('hidden'), dur * 1000);
  }

  return {
    drawWorld, drawOverlays, drawMinimap, updateHUD, teamFadeAlpha,
    drawObjectiveBar,
    pushFeed, renderFeed, centerMsg,
    showStageBanner,
    showBackpackUI, hideBackpackUI, renderBackpackUI,
    showMenu() { document.getElementById('menu').classList.remove('hidden'); },
    hideMenu() { document.getElementById('menu').classList.add('hidden'); },
    showHUD() { document.getElementById('hud').classList.remove('hidden'); },
    showOver(title, stats) {
      document.getElementById('overTitle').textContent = title;
      document.getElementById('overStats').textContent = stats;
      document.getElementById('over').classList.remove('hidden');
    },
    hideOver() { document.getElementById('over').classList.add('hidden'); },
  };
})();
