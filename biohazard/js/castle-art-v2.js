'use strict';

// Opt-in visual finish pass for the production castle renderer. It deliberately
// wraps CastleDraw instead of replacing it, so ?castleArtV2=1 is reversible.
const CastleArtV2 = (() => {
  const TAU = Math.PI * 2;
  const PALETTE = {
    moat: { edge: '#70c8c0', glow: '#dca060', deep: '#102c3a' },
    keep: { edge: '#d39883', glow: '#e1a65d', deep: '#2b1f2f' },
    tower: { edge: '#99a7de', glow: '#e3b567', deep: '#202747' },
    gorge: { edge: '#6cc8c1', glow: '#d49d6a', deep: '#112f3a' },
    chapel: { edge: '#d594b2', glow: '#edb66d', deep: '#302038' },
    wing: { edge: '#9abf7c', glow: '#d4a064', deep: '#203128' },
  };
  const hash = (a, b = 0) => {
    let n = Math.imul((a | 0) ^ 0x9e3779b9, 374761393) ^ Math.imul((b | 0) + 13, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const pFor = id => PALETTE[id] || PALETTE.keep;
  const regionAt = (M, x) => (M.regions || []).find(r => x >= r.x0 && x < r.x1) || M.regions?.[0] || { id: 'keep', x0: 0, x1: M.world.w };
  const line = (ctx, x0, y0, x1, y1, color, width = 1, alpha = 1) => { ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(Math.round(x0) + .5, Math.round(y0) + .5); ctx.lineTo(Math.round(x1) + .5, Math.round(y1) + .5); ctx.stroke(); ctx.restore(); };
  const rect = (ctx, x, y, w, h, color, alpha = 1) => { if (w <= 0 || h <= 0) return; ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); ctx.restore(); };
  const poly = (ctx, points, color, stroke, width = 1, alpha = 1) => { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]); ctx.closePath(); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); } ctx.restore(); };
  function glow(ctx, x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill(); ctx.restore();
  }
  function accents(ctx, M, cam, time = 0) {
    const view = { x0: cam.x - 40, x1: cam.x + 1000, y0: cam.y - 40, y1: cam.y + 580 };
    for (const region of M.regions || []) {
      if (region.x1 < view.x0 || region.x0 > view.x1) continue;
      const p = pFor(region.id), x0 = region.x0, x1 = region.x1;
      const yFloor = (M.Y && M.Y.G1) || (M.levels && M.levels.G1) || 470;
      const step = Math.max(130, (x1 - x0) / 6);
      for (let i = 0; i < 6; i++) {
        const x = x0 + step * (.55 + i), y = yFloor - 58 - hash(i, x0) * 44;
        if (x < view.x0 || x > view.x1) continue;
        glow(ctx, x, y + 14, 24, 'rgba(226,163,92,.12)');
        ctx.save(); ctx.fillStyle = p.glow; ctx.beginPath(); ctx.arc(x, y + 12, 3, 0, TAU); ctx.fill(); ctx.restore();
        line(ctx, x, y + 16, x, y + 32, p.edge, 1, .65);
      }
      if (region.id === 'chapel' || region.id === 'tower') {
        for (let i = 0; i < 3; i++) {
          const x = x0 + (i + 1) * (x1 - x0) / 4;
          poly(ctx, [[x - 18, yFloor], [x, yFloor - 42 - i * 6], [x + 18, yFloor]], p.deep, p.edge, 1, .48);
          line(ctx, x, yFloor - 34, x, yFloor - 10, p.edge, 1, .32);
        }
      } else if (region.id === 'gorge') {
        for (let i = 0; i < 5; i++) line(ctx, x0 + i * (x1 - x0) / 4, yFloor + 70, x0 + 70 + i * (x1 - x0) / 4, yFloor + 65, p.edge, 1, .25);
      } else if (region.id === 'wing') {
        for (let i = 0; i < 7; i++) { const x = x0 + i * (x1 - x0) / 6; line(ctx, x, yFloor - 6, x + 14, yFloor - 62 - hash(i, 7) * 24, p.edge, 2, .28); }
      }
    }
    // Fine dust and motes are deterministic in space and only drift in time.
    for (let i = 0; i < 28; i++) {
      const x = view.x0 + ((i * 137 + time * (3 + i % 3)) % Math.max(1, view.x1 - view.x0));
      const y = view.y0 + hash(i, Math.floor(cam.x / 128)) * (view.y1 - view.y0);
      rect(ctx, x, y, 1 + i % 2, 1, '#bfd1c8', .06 + hash(i, 91) * .08);
    }
  }
  function architecturalDetails(ctx, M, cam) {
    const yFloor = (M.Y && M.Y.G1) || 1620;
    const view = { x0: cam.x - 30, x1: cam.x + 990, y0: cam.y - 30, y1: cam.y + 570 };
    const inView = (x, y, w = 0, h = 0) => x + w >= view.x0 && x <= view.x1 && y + h >= view.y0 && y <= view.y1;
    for (const r of M.regions || []) {
      if (r.x1 < view.x0 || r.x0 > view.x1) continue;
      const p = pFor(r.id), mid = (r.x0 + r.x1) / 2, y = yFloor - 214;
      if (r.id === 'keep' || r.id === 'banq') {
        for (const x of [r.x0 + 150, mid, r.x1 - 150]) {
          if (!inView(x, y, 26, 78)) continue;
          rect(ctx, x - 13, y, 26, 72, 'rgba(77,24,37,.72)');
          rect(ctx, x - 16, y - 5, 32, 4, '#7d5a38', .72);
          rect(ctx, x - 7, y + 29, 14, 3, p.glow, .64);
          poly(ctx, [[x - 13, y + 72], [x - 5, y + 64], [x, y + 72], [x + 5, y + 64], [x + 13, y + 72]], '#4e1d2b', null, 1, .72);
        }
      } else if (r.id === 'chapel') {
        const x = mid, cy = yFloor - 235;
        if (inView(x - 34, cy - 34, 68, 68)) {
          glow(ctx, x, cy, 46, 'rgba(220,150,212,.11)');
          ctx.save(); ctx.globalAlpha = .7; ctx.strokeStyle = p.edge; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, cy, 25, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 22, cy); ctx.lineTo(x + 22, cy); ctx.moveTo(x, cy - 22); ctx.lineTo(x, cy + 22); ctx.stroke();
          ctx.restore();
          rect(ctx, x - 4, cy - 4, 8, 8, p.glow, .74);
        }
      } else if (r.id === 'tower') {
        const x = mid, cy = yFloor - 236;
        if (inView(x - 45, cy - 38, 90, 76)) {
          ctx.save(); ctx.globalAlpha = .56; ctx.strokeStyle = p.edge; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, cy, 30, 0, TAU); ctx.stroke();
          ctx.restore();
          line(ctx, x, cy, x + 16, cy - 8, p.glow, 2, .65); line(ctx, x, cy, x - 2, cy - 18, p.glow, 2, .65);
          for (let k = -1; k <= 1; k++) rect(ctx, x + k * 31 - 3, cy + 44, 6, 30, p.edge, .5);
        }
      } else if (r.id === 'lib') {
        for (const x of [r.x0 + 80, r.x0 + 220, r.x1 - 110]) {
          if (!inView(x, y + 18, 58, 88)) continue;
          rect(ctx, x, y + 18, 58, 5, '#604331', .72);
          rect(ctx, x, y + 54, 58, 5, '#604331', .72);
          for (let k = 0; k < 8; k++) rect(ctx, x + 4 + k * 7, y + 25 + (k % 2) * 3, 4, 26, k % 3 === 0 ? p.glow : p.edge, .42);
        }
      } else if (r.id === 'gate') {
        const x = mid;
        if (inView(x - 34, y - 4, 68, 100)) {
          rect(ctx, x - 30, y + 10, 60, 4, p.edge, .52);
          for (let k = -4; k <= 4; k++) { rect(ctx, x + k * 7 - 1, y + 14, 3, 66, '#a9b4c0', .43); rect(ctx, x + k * 7 - 4, y + 77, 9, 3, p.glow, .35); }
        }
      } else if (r.id === 'wing') {
        for (const x of [r.x0 + 36, r.x0 + 180, r.x1 - 44]) {
          if (!inView(x, y - 12, 24, 150)) continue;
          line(ctx, x, y - 12, x - 12, y + 130, '#3c7656', 3, .44);
          for (let k = 0; k < 5; k++) { rect(ctx, x - 10 - (k % 2) * 5, y + 12 + k * 23, 12, 7, '#4b8a5b', .42); }
        }
      } else if (r.id === 'gorge' || r.id === 'cast') {
        const x0 = r.x0 + 18, x1 = r.x1 - 18, yy = yFloor - 110;
        if (inView(x0, yy - 38, x1 - x0, 55)) {
          line(ctx, x0, yy - 28, x1, yy - 28, p.edge, 2, .55);
          line(ctx, x0, yy - 28, x0 + 34, yy, p.edge, 1, .42);
          line(ctx, x1, yy - 28, x1 - 34, yy, p.edge, 1, .42);
          for (let x = x0 + 12; x < x1; x += 30) rect(ctx, x, yy - 8, 3, 12, '#70503b', .66);
        }
      }
    }
  }
  function renderWorld(ctx, M, cam, options) {
    const o = options || {};
    if (typeof CastleDraw !== 'undefined') CastleDraw.renderWorld(ctx, M, cam, o);
    ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    accents(ctx, M, cam, Number(o.time) || (typeof performance !== 'undefined' ? performance.now() / 1000 : 0));
    architecturalDetails(ctx, M, cam);
    ctx.restore();
  }
  function renderOverlay(ctx, M, cam) { if (typeof CastleDraw !== 'undefined') CastleDraw.renderOverlay(ctx, M, cam); }
  return { renderWorld, renderOverlay, palette: PALETTE };
})();
