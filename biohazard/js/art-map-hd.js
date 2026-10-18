// ============ 地图尺度程序化美术：#02「阴森吸血鬼古堡」逐格量化结果的绘制层 ============
// 数据来自 美术重构-工作区/原型图库/地图高清.json（生成器 工具/_map_hd_build.js）。
// 一字符一格：'.' 不用；其余按 12 材质系 × 5 明度档 索引，颜色一律查 JSON 里自带的色板
// （色板是我们自有的材质色，不是照片取色 —— 照片只给结构与配色参照）。
// 1672×941＝155 万格，绝不能逐格 fillRect：按游程合并同色段一次画一条。
const ArtMapHD = (() => {
  let 数据 = null, 行缓存 = null;
  const 字 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function 解码(串) {
    let 出 = '';
    for (const t of 串.split(' ')) {
      const m = /^(\d+)!(.*)$/s.exec(t);
      if (m) 出 += m[2].repeat(+m[1]); else 出 += t;
    }
    return 出;
  }
  function 行(y) {
    if (!数据) return null;
    if (!行缓存) 行缓存 = 数据.行.map(解码);
    return 行缓存[y];
  }
  function 色(ch) {
    const i = 字.indexOf(ch);
    if (i < 0) return null;
    return 数据.色片[i];
  }
  // 只画视口：gx0..gx1 / gy0..gy1（格坐标），同色游程合并
  function paint(ctx, o) {
    if (!数据) return false;
    o = o || {};
    const z = o.zoom || 1, x0 = o.x || 0, y0 = o.y || 0;
    const a = Math.max(0, o.视口 ? o.视口[0] : 0), b = Math.max(0, o.视口 ? o.视口[1] : 0);
    const c = Math.min(数据.格宽, o.视口 ? o.视口[2] : 数据.格宽);
    const d = Math.min(数据.格高, o.视口 ? o.视口[3] : 数据.格高);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let y = b; y < d; y++) {
      const 行串 = 行(y); if (!行串) continue;
      let gx = a;
      while (gx < c) {
        const ch = 行串[gx]; if (!ch || ch === '.') { gx++; continue; }
        const col = 色(ch); if (!col) { gx++; continue; }
        let k = gx + 1; while (k < c && 行串[k] === ch) k++;
        ctx.fillStyle = col;
        ctx.fillRect(x0 + gx * z, y0 + (y - b) * z, (k - gx) * z, z);
        gx = k;
      }
    }
    ctx.restore();
    return true;
  }
  async function 载入(url) {
    const r = await fetch(url || '../原型图库/地图高清.json');
    数据 = await r.json(); 行缓存 = null; return 数据;
  }
  return {
    载入, paint, 行,
    尺寸: () => (数据 ? { 格宽: 数据.格宽, 格高: 数据.格高, 格数: 数据.格数, 每格单位: 数据.每格单位, 世界: 数据.世界 } : null),
    系名: () => (数据 ? 数据.系名 : []),
    系色: i => (数据 ? 数据.色片.slice(i * 5, i * 5 + 5) : []),
    统计: () => (数据 ? { 系计: 数据.系计, 档计: 数据.档计 } : null),
    条目: () => 数据,
  };
})();
if (typeof window !== 'undefined') window.ArtMapHD = ArtMapHD;
