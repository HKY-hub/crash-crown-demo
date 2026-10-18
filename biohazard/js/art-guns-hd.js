// ============ 高清程序化枪械：按对标照片逐格量化出来的轮廓，由本模块上色绘制 ============
// 数据来源：美术重构-工作区/原型图库/高清轮廓.json（生成器 工具/_gun_hd_build.js）。
// 每格一个字符：'.' 空；'0'-'4' 冷金属五档；'a'-'e' 暖木五档；'f'-'j' 深色聚合物五档；'k'-'o' 玻璃/镜片五档。
// 颜色一律查本模块由 ART_SPEC.materials 基色展开的色带，不取照片像素色 —— 这是程序化美术，
// 不是把照片缩着贴进画布。描边遍 + 本体遍两遍，与 Shape.paint 同一套房风。
const ArtHD = (() => {
  let 数据 = null, 色带 = null, 现档 = '暗';
  // 两套配色，同一套轮廓格子：
  //   暗＝默认档，也是用户 2026-10-02 点名要回退到的那版（0.42/0.66/0.9/1.18/1.5 乘 metal 基色）。
  //      用户原话：「武器HTML回退到之前暗色的版本，你这新版的金属色感没眼看」。
  //   亮＝金属亮档（系数拉高 + 顶两档朝镜面白混）。用户判定"没眼看"，所以它不再是默认，
  //      但按"被替换的美术档要留着"的规矩不删，只作可切换档（黑天以外的对照/以后想调再说）。
  // 旧档名 日/夜 仍认（夜→暗、日→亮），免得已有量具与脚本断链。
  const 谱 = {
    暗: { 基: ['metal', 'wood', 'polymer', 'glass'], 参: [[0.42, 0], [0.66, 0], [0.9, 0], [1.18, 0], [1.5, 0]] },
    亮: { 基: ['steel', 'wood', 'polymer', 'glass'], 参: [[0.62, 0], [0.92, 0], [1.25, 0.06], [1.62, 0.2], [2.05, 0.44]] },
  };
  const 别名 = { 夜: '暗', 日: '亮' };
  const 镜面 = { '0': '#dfe9f6', a: '#f2ddba', f: '#cfe2d6', k: '#d9f3ff' };   // 各材质系的高光底色
  function 带(基, 系, p) {
    const r = parseInt(基.slice(1, 3), 16), g = parseInt(基.slice(3, 5), 16), b = parseInt(基.slice(5, 7), 16);
    const w = 镜面[系] || 镜面['0'];
    const wr = parseInt(w.slice(1, 3), 16), wg = parseInt(w.slice(3, 5), 16), wb = parseInt(w.slice(5, 7), 16);
    const k = p[0], 白 = p[1] || 0;
    return '#' + [[r, wr], [g, wg], [b, wb]].map(v => {
      const x = Math.round(Math.min(255, v[0] * k) * (1 - 白) + v[1] * 白);
      return Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0');
    }).join('');
  }
  function 建带() {
    const m = (typeof ART_SPEC !== 'undefined' && ART_SPEC.materials) ? ART_SPEC.materials : {};
    const S = 谱[现档] || 谱.暗;
    const 缺 = ['#39424e', '#8a5a2a', '#2f3a34', '#1b2b3a'];
    色带 = {};
    ['0', 'a', 'f', 'k'].forEach((系, i) => {
      const 名 = S.基[i];
      色带[系] = S.参.map(p => 带((m[名] && m[名].base) || 缺[i], 系, p));
    });
  }
  function 设档(v) { const 名 = 别名[v] || v; if (!谱[名]) return false; 现档 = 名; 建带(); return true; }
  function 字色(ch) {
    const 系 = /[0-4]/.test(ch) ? '0' : /[a-e]/.test(ch) ? 'a' : /[f-j]/.test(ch) ? 'f' : 'k';
    const 档 = ch.charCodeAt(0) - 系.charCodeAt(0);
    return 色带[系][Math.max(0, Math.min(4, 档))];
  }
  const 条目 = id => (数据 && 数据.条目 && 数据.条目[id]) ? 数据.条目[id] : null;
  const ids = () => (数据 ? Object.keys(数据.条目) : []);
  function size(id) {
    const e = 条目(id);
    return e ? { w: e.格宽, h: e.格高, 格数: e.格数, 长mm: e.长mm, 高mm: e.高mm, 每格mm: e.每格mm, 图: e.图,
      档案len: e.档案len != null ? e.档案len : null, 是子件: !!e.是子件, 是造型栅格: !!e.是造型栅格 } : null;
  }

  // 以 (x,y) 为左上角绘制；1 格 = zoom 设备像素（zoom 默认 1，即原生分辨率）
  function paint(ctx, id, o) {
    const e = 条目(id); if (!e) return false;
    o = o || {};
    const z = Math.max(1, Math.round(o.zoom || 1));
    const x0 = Math.round(o.x || 0), y0 = Math.round(o.y || 0);
    if (!色带) 建带();
    const 墨 = (gx, gy) => (gy < 0 || gx < 0 || gy >= e.行.length || gx >= e.格宽) ? '.' : e.行[gy][gx];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = (typeof ART_SPEC !== 'undefined' ? ART_SPEC.outline : '#0a0a0a');
    for (let gy = 0; gy < e.行.length; gy++) for (let gx = 0; gx < e.格宽; gx++) {   // 第一遍：只在露在外面的格子四周铺描边
      if (墨(gx, gy) === '.') continue;
      let 露 = false;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (墨(gx + d[0], gy + d[1]) === '.') { 露 = true; break; }
      if (露) ctx.fillRect(x0 + (gx - 1) * z, y0 + (gy - 1) * z, z * 3, z * 3);
    }
    for (let gy = 0; gy < e.行.length; gy++) {                                       // 第二遍：本体逐格上色
      const 行 = e.行[gy];
      for (let gx = 0; gx < 行.length; gx++) {
        const ch = 行[gx]; if (ch === '.') continue;
        ctx.fillStyle = 字色(ch);
        ctx.fillRect(x0 + gx * z, y0 + gy * z, z, z);
      }
    }
    ctx.restore();
    return true;
  }
  async function 载入(url) {
    const r = await fetch(url || '../原型图库/高清轮廓.json');
    数据 = await r.json(); 建带(); return 数据;
  }
  return { 载入, paint, size, ids, 条目, 设档, 档: () => 现档, 档表: () => Object.keys(谱),
    色带: () => 色带, 格字: '0-4 冷金属 / a-e 暖木 / f-j 深色聚合物 / k-o 玻璃' };
})();
if (typeof window !== 'undefined') window.ArtHD = ArtHD;
