/* CastleArtProps: authored Canvas 2D back-wall furnishings. World-space only.
 * Furniture is decorative: this module creates no collision, platforms or exits.
 * All placement and small material variations are deterministic per room.
 */
(function (global) {
  'use strict';

  const P = {
    wood: '#514036', woodLight: '#79604a', woodDark: '#2b2527', cut: '#927357',
    iron: '#343d43', ironLight: '#798082', ironDark: '#202a30', rust: '#745246',
    brass: '#9b8555', brassDark: '#5c5543', stone: '#686969', stoneLight: '#96958a',
    stoneDark: '#3d464c', cloth: '#624148', clothLight: '#91636a', parchment: '#b7ad8b',
    paperShadow: '#837c69', green: '#566757', bottle: '#547675', bone: '#ada892',
    soot: '#17212b', blue: '#596d81', ochre: '#8b754a'
  };
  const BOOKS = ['#645251', '#55675d', '#596875', '#7f6c4b', '#674c5c', '#917b65', '#3b5358'];
  const cache = new Map();
  const ROOM_TYPES = {
    WG_GATE: 'gate', WG_WINCH: 'engine', WG_BARRACK: 'barrack', WG_BALCONY: 'small',
    WG_WATER: 'waterEngine', WG_DRAIN: 'drain', WG_POOL: 'cave',
    WK_HALL: 'hall', WK_ARMORY: 'armory', WK_CRYPT: 'crypt', WK_SERVICE: 'service',
    WK_WATER_TUNNEL: 'cave', WK_DEEP: 'cistern',
    CT_AUDIENCE: 'audience', CT_ENGINE: 'clock', CT_EAST_PASSAGE: 'passage',
    CT_TOWER_BASE: 'service', CT_PRISON: 'prison', CT_CELLAR: 'cellar', CT_FORGE: 'forge',
    CG_WEST_HOUSE: 'guard', CG_WEST_UP: 'guard', CG_EAST_HOUSE: 'guard',
    CG_EAST_UP: 'watch', CG_CAVE: 'cave',
    EL_LIBRARY: 'library', EL_LIBRARY_UP: 'libraryUpper', EL_NAVE: 'chapel',
    EL_OSSUARY: 'ossuary', EL_CRYPT: 'crypt', EL_GALLERY_E: 'gallery',
    EL_BELL_BASE: 'passage', EL_BELL_CRYPT: 'cryptPassage', EL_DEEP_DRAIN: 'drain',
    EL_BELL: 'bell', EW_INFIRMARY: 'infirmary', EW_INFIRMARY_UP: 'medicineStore',
    EW_ARMORY: 'armory', EW_ARMORY_UP: 'armoryUpper', EW_WATCH: 'watch',
    EW_WATCH_BASE: 'guard', EW_CISTERN: 'cistern', EW_DRAIN: 'drain',
    EW_WATERLOCK: 'waterPrison', EW_ARM_BASE: 'supply', EW_WALL_DRAIN: 'drain'
  };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function hash(s) {
    let n = 2166136261;
    for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619);
    return n >>> 0;
  }
  function sample(seed, i) {
    let n = (seed + Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  }
  function rect(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(x, y, w, h); }
  function poly(c, pts, fill, stroke, width) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function line(c, pts, color, width) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.strokeStyle = color; c.lineWidth = width || 1; c.stroke();
  }
  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.8; c.stroke(); }
  }
  function rounded(c, x, y, w, h, r, fill, stroke) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.8; c.stroke(); }
  }
  function shade(c, x, y, w, h, colors) {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, colors[0]); g.addColorStop(0.48, colors[1]); g.addColorStop(1, colors[2]);
    rect(c, x, y, w, h, g);
  }
  function shadow(c, w) { ellipse(c, 0, -1, w * 0.55, 3, 'rgba(12,18,23,.30)'); }
  function rivet(c, x, y, color) { ellipse(c, x, y, 0.9, 0.9, color || P.brassDark); }
  function stoneChip(c, x, y, size) {
    poly(c, [[x, y], [x + size, y + 1], [x + size * 0.7, y + size * 0.7], [x - 1, y + size * 0.45]], P.stoneDark);
    line(c, [[x - 1, y + size * 0.45], [x + size * 0.7, y + size * 0.7]], '#85867e', 0.6);
  }

  function flame(c, x, y, seed, time) {
    const sway = Math.sin((time || 0) * 1.8 + seed * 0.001) * 0.6;
    const g = c.createRadialGradient(x, y - 2, 0, x, y - 2, 9);
    g.addColorStop(0, 'rgba(227,156,79,.23)'); g.addColorStop(1, 'rgba(227,156,79,0)');
    ellipse(c, x, y - 2, 9, 11, g);
    poly(c, [[x - 2.3, y], [x - 3.1, y - 3.2], [x + sway, y - 10], [x + 1.1, y - 5.8], [x + 2.5, y - 2.6]], '#c48946');
    poly(c, [[x - 1.2, y], [x, y - 6.5], [x + 1.4, y - 1.2]], '#e7c180');
  }
  function candle(c, seed, time) {
    ellipse(c, 0, 0, 5.5, 1.6, P.brassDark); rect(c, -1, -6, 2, 5.5, P.brass);
    rect(c, -2.3, -17, 4.6, 11, '#aaa58b'); rect(c, 0.5, -16, 1.8, 9, '#7c7d70');
    line(c, [[-1.1, -15], [-1.1, -11], [-2, -9]], '#c6bd9c', 1);
    flame(c, 0, -18, seed, time);
  }
  function candleStand(c, seed, time) {
    ellipse(c, 0, 0, 11, 2.1, P.brassDark);
    poly(c, [[-7, -2], [-2, -8], [-1.7, -34], [1.7, -34], [2, -8], [7, -2]], P.brassDark);
    line(c, [[-0.6, -8], [-0.6, -33]], P.brass, 1.1);
    line(c, [[-15, -39], [-15, -31], [-8, -27], [8, -27], [15, -31], [15, -39]], P.brass, 1.8);
    for (const x of [-15, 0, 15]) {
      c.save(); c.translate(x, -37); candle(c, seed + x, time); c.restore();
    }
  }
  function torch(c, seed, time) {
    rounded(c, -4, -21, 8, 23, 2, P.ironDark, '#5a6162');
    for (const y of [-17, -1]) rivet(c, 0, y, '#777d77');
    line(c, [[0, -7], [9, -13], [5, -25]], P.iron, 3);
    poly(c, [[0, -32], [10, -32], [8, -22], [3, -22]], P.iron, P.ironLight, 0.7);
    for (let i = 0; i < 3; i++) line(c, [[2 + i * 3, -31], [3 + i * 2, -23]], '#212c33', 1);
    flame(c, 5, -32, seed, time);
  }

  function paper(c, x, y, w, h, angle, seed) {
    c.save(); c.translate(x, y); c.rotate(angle || 0);
    poly(c, [[0, 1], [w - 2, 0], [w, 2], [w - 1, h], [-1, h - 1]], P.parchment, P.paperShadow, 0.45);
    line(c, [[w - 2, 0], [w - 2, 3], [w, 2]], '#d3c49e', 0.6);
    for (let i = 0; i < 3; i++) {
      const len = w * (0.35 + sample(seed, i) * 0.3);
      line(c, [[2, 3 + i * 2.2], [2 + len, 3 + i * 2.2]], 'rgba(59,66,61,.40)', 0.5);
    }
    c.restore();
  }
  function bottle(c, x, y, h, color, seed) {
    const w = h * 0.43;
    c.save(); c.translate(x, y);
    rounded(c, -w / 2, -h * 0.75, w, h * 0.75, 2, color || P.bottle, '#314c50');
    rect(c, -w * 0.23, -h, w * 0.46, h * 0.28, color || P.bottle);
    rect(c, -w * 0.29, -h - 1, w * 0.58, 2.2, P.wood);
    line(c, [[-w * 0.3, -h * 0.6], [-w * 0.3, -3]], 'rgba(180,199,187,.43)', 0.8);
    if (h > 10) rounded(c, -w * 0.45, -h * 0.46, w * 0.88, h * 0.25, 0.5, '#aeaa8c');
    if (seed % 2) line(c, [[-1, -h * 0.38], [1, -h * 0.38]], '#667268', 0.6);
    c.restore();
  }
  function jug(c, x, y, s, color) {
    c.save(); c.translate(x, y); c.scale(s || 1, s || 1);
    ellipse(c, 4.4, -8.4, 4.1, 4.4, null, P.woodLight);
    rounded(c, -5, -14, 10, 14, 4, color || '#786c53', '#4a5149');
    ellipse(c, 0, -14, 4.8, 1.6, '#373d37', '#9a8867');
    line(c, [[-3, -11], [-3.5, -5]], '#aa9470', 0.8);
    c.restore();
  }

  function table(c, o) {
    const w = o.w || 106; shadow(c, w);
    for (const x of [-w / 2 + 8, w / 2 - 12]) {
      poly(c, [[x, -25], [x + 7, -25], [x + 5, -2], [x - 2, -1]], P.woodDark);
      line(c, [[x + 1, -22], [x - 1, -3]], '#79604a', 1);
    }
    rect(c, -w / 2 + 9, -11, w - 23, 3, '#42352e');
    shade(c, -w / 2, -28, w, 6, ['#947754', P.woodLight, '#423830']);
    line(c, [[-w / 2 + 2, -27], [w / 2 - 3, -27]], '#b29870', 0.7);
    for (let i = 1; i < 4; i++) line(c, [[-w / 2 + 3, -28 + i * 1.3], [w / 2 - 4, -28 + i * 1.3]], 'rgba(52,40,34,.33)', 0.5);
    if (o.cloth) {
      const cw = Math.min(30, w * 0.29);
      poly(c, [[-cw / 2, -28.7], [cw / 2, -28.7], [cw / 2 - 2, -13], [3, -10], [-cw / 2 + 1, -15]], P.cloth);
      line(c, [[-cw / 2 + 3, -26], [-cw / 2 + 4, -15], [2, -12]], P.clothLight, 0.8);
      line(c, [[cw / 2 - 3, -25], [cw / 2 - 5, -15]], '#382e38', 1);
      rect(c, -cw / 2 + 2, -17, cw - 5, 1.2, '#958160');
    }
    if (o.mode === 'desk' || o.mode === 'watch') {
      paper(c, -w * 0.21, -33, 27, 8, -0.045, o.seed);
      paper(c, -w * 0.18, -31.5, 22, 7, 0.025, o.seed + 1);
      rect(c, w * 0.23, -33, 5, 5, '#323f41');
      line(c, [[w * 0.25, -33], [w * 0.32, -43]], '#bab7a0', 0.8);
      line(c, [[w * 0.29, -39], [w * 0.32, -43], [w * 0.33, -39]], '#c3b99c', 0.7);
    } else if (o.mode === 'medicine') {
      for (let i = 0; i < 5; i++) bottle(c, -w * 0.28 + i * 12, -28, 9 + sample(o.seed, i) * 7, i % 2 ? '#686c54' : P.bottle, i);
      rect(c, w * 0.2, -32, 15, 4, '#b4ab8d');
      line(c, [[w * 0.2 + 2, -30], [w * 0.2 + 12, -30]], '#767669', 0.7);
    } else if (o.mode === 'dining') {
      for (const x of [-w * 0.27, w * 0.23]) {
        ellipse(c, x, -29, 9, 2, '#7c8078', '#b1ab95');
        jug(c, x + 13, -29, 0.52, '#827c64');
      }
      jug(c, w * 0.4, -28, 0.95, '#82745c');
    } else if (o.mode === 'tools') {
      line(c, [[-18, -31], [5, -32]], '#786349', 2);
      rect(c, -21, -36, 6, 9, '#646d6b');
      ellipse(c, 17, -30, 7, 2, '#3c4648', '#7a7764');
      bottle(c, w * 0.31, -28, 11, '#6b755a', 2);
    }
  }
  function chair(c, o) {
    const h = o.high ? 46 : 36; shadow(c, 18);
    const top = -h;
    poly(c, [[-10, -19], [-10, top + 6], [-5, top], [6, top], [11, top + 7], [9, -17]], P.woodDark, '#78634c', 0.8);
    poly(c, [[-6.6, -22], [-6.6, top + 10], [0, top + 5], [6.6, top + 10], [6.6, -22]], o.upholstery || '#63474d');
    line(c, [[0, top + 9], [0, -24]], '#886268', 0.7);
    rect(c, -11, -19, 23, 4, P.woodLight); rect(c, -8.8, -18.7, 18, 1.3, '#8c7360');
    for (const x of [-8, 7]) {
      line(c, [[x, -16], [x - (x < 0 ? 1.5 : -1.5), -1]], P.woodDark, 3);
      line(c, [[x, -15], [x, -3]], '#715a48', 0.8);
    }
    line(c, [[-7, -7], [7, -7]], P.woodDark, 2);
    for (const x of [-9, 10]) ellipse(c, x, top + 5, 1.7, 1.7, P.brassDark);
  }
  function bench(c, o) {
    const w = o.w || 61; shadow(c, w);
    if (o.back) {
      poly(c, [[-w / 2 + 2, -18], [-w / 2 + 2, -32], [w / 2 - 2, -32], [w / 2 - 2, -18]], '#443937');
      line(c, [[-w / 2 + 3, -30], [w / 2 - 3, -30]], '#79634e', 1);
      for (let x = -w / 2 + 14; x < w / 2 - 3; x += 16) line(c, [[x, -30], [x, -19]], '#635044', 0.8);
    }
    rect(c, -w / 2, -19, w, 4, P.woodLight);
    for (const x of [-w / 2 + 7, w / 2 - 7]) {
      poly(c, [[x - 3, -15], [x + 3, -15], [x + 4, -1], [x - 4, -1]], P.woodDark);
      line(c, [[x - 2, -14], [x - 3, -3]], '#715b48', 0.7);
    }
  }
  function bed(c, o) {
    const w = o.w || 76; shadow(c, w);
    for (const x of [-w / 2 + 2, w / 2 - 2]) {
      rect(c, x - 2, -32, 4, 31, P.woodDark);
      ellipse(c, x, -33, 3, 2.5, '#7e674f');
      line(c, [[x - 0.7, -31], [x - 0.7, -2]], '#80694f', 0.8);
    }
    shade(c, -w / 2, -24, w, 9, ['#b1aa8c', '#8f917d', '#566166']);
    rect(c, -w / 2, -15, w, 4, '#443b37');
    rounded(c, -w / 2 + 4, -29, 19, 7, 3, '#b9b39a', '#8b927f');
    poly(c, [[-w / 2 + 24, -24], [w / 2 - 2, -24], [w / 2 - 5, -11], [12, -10], [-w / 2 + 24, -14]], o.medical ? '#667c72' : '#69525a');
    for (let i = 0; i < 4; i++) line(c, [[-w / 2 + 29 + i * 9, -23], [-w / 2 + 26 + i * 10, -13]], o.medical ? '#8a9b89' : '#8d7074', 0.7);
    line(c, [[-w / 2 + 6, -16], [w / 2 - 6, -16]], '#a99f83', 0.6);
  }
  function screen(c, o) {
    const w = o.w || 61, h = o.h || 72;
    for (const x of [-w / 2, w / 2]) {
      line(c, [[x, -h], [x, -1]], P.iron, 2.1);
      ellipse(c, x, -h - 1, 2, 2, P.brassDark);
      line(c, [[x - 5, -1], [x + 6, -1]], '#4a5354', 2);
    }
    line(c, [[-w / 2, -h + 4], [w / 2, -h + 4]], '#5c6360', 1.5);
    poly(c, [[-w / 2 + 3, -h + 4], [w / 2 - 3, -h + 4], [w / 2 - 5, -15], [7, -18], [-w / 2 + 4, -14]], '#606f6b');
    for (let i = 1; i < 7; i++) {
      const x = -w / 2 + i * w / 7;
      line(c, [[x, -h + 8], [x - 2, -h * 0.56], [x + 1, -18]], i % 2 ? '#738079' : '#404f53', 1.4);
    }
    line(c, [[-w / 2 + 5, -h + 11], [w / 2 - 5, -h + 11]], '#8b9280', 0.6);
    poly(c, [[w / 2 - 5, -28], [w / 2 - 12, -20], [w / 2 - 6, -18]], '#34454a');
  }

  function shelf(c, o) {
    const w = o.w || 94, h = o.h || 106;
    shadow(c, w); shade(c, -w / 2, -h, w, h, ['#4c4039', '#343138', '#2c3138']);
    rect(c, -w / 2, -h, 5, h, P.woodLight); rect(c, w / 2 - 5, -h, 5, h, '#59483d');
    rect(c, -w / 2 - 2, -h - 5, w + 4, 5, '#705844');
    line(c, [[-w / 2, -h - 4], [w / 2, -h - 4]], '#957b58', 0.8);
    const levels = Math.max(3, Math.floor(h / 26));
    for (let row = 0; row < levels; row++) {
      const y = -7 - row * ((h - 15) / levels);
      rect(c, -w / 2 + 4, y, w - 8, 3.7, '#685442');
      line(c, [[-w / 2 + 6, y], [w / 2 - 6, y]], '#8b7455', 0.65);
      let x = -w / 2 + 8, i = 0;
      while (x < w / 2 - 10) {
        const n = sample(o.seed, row * 29 + i), bw = 3 + Math.floor(n * 5);
        const bh = 12 + sample(o.seed + 23, row * 37 + i) * 9;
        if (sample(o.seed + 77, row * 41 + i) > 0.88 && x < w / 2 - 27) {
          for (let k = 0; k < 3; k++) {
            rect(c, x, y - 4 - k * 3.2, 15 + k, 2.9, BOOKS[(i + k) % BOOKS.length]);
            rect(c, x + 2, y - 3.6 - k * 3.2, 11 + k, 0.7, '#99937a');
          }
          x += 21;
        } else {
          c.save(); c.translate(x, y); c.rotate(n < 0.13 ? -0.13 : (n > 0.82 ? 0.09 : 0));
          rect(c, 0, -bh, bw, bh, BOOKS[Math.floor(sample(o.seed + 9, i + row * 17) * BOOKS.length)]);
          rect(c, 0, -bh + 3, bw, 0.7, '#a09672'); rect(c, 0, -3, bw, 0.7, '#8b8268');
          line(c, [[0.7, -bh + 1], [0.7, -1]], 'rgba(190,180,141,.30)', 0.6);
          if (bw > 5) rect(c, 1.2, -bh / 2 - 1, bw - 2.4, 3.8, '#99917a');
          c.restore(); x += bw + 1.5;
        }
        i++;
      }
    }
    rect(c, -w / 2 - 1, -5, w + 2, 5, '#514035');
    if (o.medicine) {
      // A medicine cupboard uses taller bottles over an otherwise furnished cabinet.
      rect(c, -w / 2 + 6, -h + 9, w - 12, 19, '#353e40');
      for (let i = 0; i < 6; i++) bottle(c, -w / 2 + 13 + i * ((w - 24) / 6), -h + 28, 11 + sample(o.seed, i) * 6, i % 2 ? '#6b7157' : '#4d6b69', i);
      rect(c, -w / 2 + 5, -h + 29, w - 10, 3, '#807052');
    }
  }
  function ladderBack(c, o) {
    // Dark library furniture, not a navigation ladder. No walkable bright outline.
    c.save(); c.globalAlpha *= 0.58; c.rotate(-0.13);
    const h = o.h || 86;
    for (const x of [-6, 6]) line(c, [[x, 0], [x, -h]], '#5b5145', 2);
    for (let y = -8; y > -h + 5; y -= 12) line(c, [[-6, y], [6, y]], '#665a49', 1.7);
    c.restore();
  }
  function scrollRack(c, o) {
    const w = o.w || 43;
    rect(c, -w / 2, -45, w, 45, '#3c3734');
    for (let y = -43; y < -4; y += 13) {
      for (let x = -w / 2 + 5; x < w / 2 - 3; x += 9) {
        ellipse(c, x, y + 6, 3.3, 3.8, '#a1987b', '#635f51');
        ellipse(c, x, y + 6, 1.4, 1.5, '#5b6053');
      }
      rect(c, -w / 2, y + 11, w, 2.3, '#78644a');
    }
    rect(c, -w / 2 - 1, -47, w + 2, 3, '#82694d');
  }

  function shield(c, x, y, s, color, emblem) {
    c.save(); c.translate(x, y); c.scale(s || 1, s || 1);
    poly(c, [[-11, -15], [11, -15], [10, -1], [6, 7], [0, 12], [-7, 7], [-10, -1]], color || '#535e68', '#8a8c7b', 1.1);
    poly(c, [[-7, -12], [7, -12], [6, -1], [0, 7], [-6, -1]], 'rgba(28,37,44,.27)');
    line(c, [[-8, -10], [-7, -1], [-3, 5]], 'rgba(187,180,145,.4)', 0.65);
    if (emblem !== false) {
      poly(c, [[-2, -10], [2, -10], [2, -5], [6, -5], [6, -2], [2, -2], [2, 4], [-2, 4], [-2, -2], [-6, -2], [-6, -5], [-2, -5]], '#aaa079');
    }
    for (const p of [[-8, -12], [8, -12], [-7, 0], [7, 0], [0, 9]]) rivet(c, p[0], p[1], '#8d927f');
    line(c, [[3, -10], [6, -8], [2, -3]], '#363f43', 0.7); c.restore();
  }
  function sword(c, x, y, angle, s) {
    c.save(); c.translate(x, y); c.rotate(angle || 0); c.scale(s || 1, s || 1);
    poly(c, [[-2, 3], [-2, -27], [0, -35], [2, -27], [2, 3]], '#77878b', '#374750', 0.6);
    line(c, [[0, -31], [0, 1]], '#a6afa5', 0.8);
    rect(c, -7, 2, 14, 2, P.brassDark); rect(c, -1.8, 4, 3.6, 9, '#6e5240');
    for (let i = 0; i < 3; i++) line(c, [[-1.7, 5 + i * 2.2], [1.7, 6 + i * 2.2]], '#ac9670', 0.6);
    ellipse(c, 0, 14, 2.9, 2.2, '#9c926d'); c.restore();
  }
  function weaponRack(c, o) {
    const w = o.w || 89; shadow(c, w);
    for (const x of [-w / 2 + 4, w / 2 - 4]) rect(c, x - 3, -70, 6, 68, P.woodDark);
    for (const y of [-59, -16]) {
      shade(c, -w / 2, y, w, 5, [P.woodLight, P.wood, P.woodDark]);
      for (const x of [-w / 2 + 6, w / 2 - 6]) rivet(c, x, y + 2, '#ad9770');
    }
    const weapons = Math.max(3, Math.floor(w / 18));
    for (let i = 0; i < weapons; i++) {
      const x = -w / 2 + 13 + i * ((w - 26) / (weapons - 1));
      if (i % 3 === 0) {
        line(c, [[x, -6], [x + 2, -76]], '#7e664b', 2);
        poly(c, [[x - 1, -77], [x + 3, -87], [x + 6, -77], [x + 3, -72]], '#859397', '#44565c', 0.6);
      } else if (i % 3 === 1) {
        line(c, [[x, -5], [x + 2, -65]], '#7a6047', 2.4);
        poly(c, [[x + 2, -66], [x + 14, -65], [x + 16, -56], [x + 5, -58]], '#7c8989', '#435156', 0.8);
        line(c, [[x + 15, -64], [x + 16, -57]], '#b1b8a6', 0.8);
      } else sword(c, x, -33, 0.025, 1.03);
    }
    shield(c, -w * 0.18, -26, 0.88, '#5b5e65');
    if (w > 80) shield(c, w * 0.22, -24, 0.84, '#6b4e53');
  }
  function armor(c, o) {
    shadow(c, 29);
    line(c, [[0, -7], [0, -49]], P.woodDark, 4);
    line(c, [[-10, -1], [0, -8], [10, -1]], '#4a4840', 3);
    for (const x of [-6, 6]) {
      poly(c, [[x - 3, -28], [x + 4, -28], [x + 3, -12], [x - 2, -9]], '#596a72', '#34434b', 0.7);
      line(c, [[x - 2, -25], [x - 1, -12]], '#89989a', 0.8);
    }
    poly(c, [[-11, -50], [-7, -55], [7, -55], [11, -50], [9, -31], [0, -26], [-9, -31]], '#596a72', '#333f47', 1);
    line(c, [[0, -53], [0, -30]], '#9aa7a6', 1);
    for (const x of [-15, 15]) {
      ellipse(c, x, -48, 7, 5, '#65767c', '#34434b');
      poly(c, [[x - 4, -44], [x + 4, -44], [x + 3, -29], [x - 2, -29]], '#52636c');
      line(c, [[x - 2, -42], [x - 2, -31]], '#7f9195', 0.7);
    }
    ellipse(c, 0, -62, 8.7, 10, '#657982', '#354750');
    poly(c, [[-8, -63], [8, -63], [6, -56], [0, -52], [-7, -56]], '#485b66');
    rect(c, -6, -63, 12, 2.2, '#172a36');
    line(c, [[0, -70], [0, -55]], '#9caaa9', 0.8);
    for (const x of [-3, 3]) rivet(c, x, -57, '#8c9b96');
  }
  function chest(c, o) {
    const w = o.w || 44; shadow(c, w);
    rounded(c, -w / 2, -29, w, 12, 5, '#62513f', '#2f3131');
    shade(c, -w / 2, -19, w, 18, ['#756045', '#574a3d', '#353436']);
    for (const x of [-w / 2 + 7, w / 2 - 10]) {
      rect(c, x, -28, 4, 27, '#444b4c');
      line(c, [[x + 0.8, -26], [x + 0.8, -3]], '#7d8176', 0.8);
      for (const y of [-23, -14, -5]) rivet(c, x + 2, y, '#9b9376');
    }
    rect(c, -3, -20, 6, 9, '#8e7e57'); ellipse(c, 0, -16, 1.1, 1.5, '#2c3433');
    line(c, [[-w / 2 + 2, -18], [w / 2 - 2, -18]], '#a18a5f', 0.7);
  }
  function barrel(c, o) {
    const w = o.w || 26, h = o.h || 36; shadow(c, w);
    c.beginPath(); c.moveTo(-w * 0.38, -h); c.quadraticCurveTo(-w * 0.63, -h / 2, -w * 0.38, -1);
    c.quadraticCurveTo(0, 3, w * 0.38, -1); c.quadraticCurveTo(w * 0.63, -h / 2, w * 0.38, -h);
    c.closePath(); c.fillStyle = P.wood; c.fill();
    for (let i = -2; i <= 2; i++) {
      const x = i * w / 5.5;
      line(c, [[x * 0.82, -h + 2], [x, -h / 2], [x * 0.82, -2]], i < 0 ? '#8a7254' : '#372f2b', 0.8);
    }
    for (const y of [-h + 7, -8]) {
      rect(c, -w * 0.48, y, w * 0.96, 3.5, '#464f4e');
      line(c, [[-w * 0.42, y + 0.6], [w * 0.42, y + 0.6]], '#89907b', 0.65);
      rivet(c, w * 0.2, y + 2);
    }
    ellipse(c, 0, -h, w * 0.39, 3.2, '#665541', '#a18a63');
    line(c, [[-w * 0.25, -h - 1], [w * 0.25, -h + 1]], '#3b342d', 0.7);
  }
  function sack(c, o) {
    const w = o.w || 26, h = o.h || 29; shadow(c, w);
    c.beginPath(); c.moveTo(-4, -h + 5); c.quadraticCurveTo(-w * 0.55, -h * 0.64, -w * 0.5, -6);
    c.quadraticCurveTo(-w * 0.43, 1, 0, 0); c.quadraticCurveTo(w * 0.6, 2, w * 0.51, -8);
    c.quadraticCurveTo(w * 0.43, -h * 0.69, 4, -h + 5); c.closePath(); c.fillStyle = '#827459'; c.fill();
    poly(c, [[-4, -h + 5], [-7, -h], [6, -h - 1], [3, -h + 5]], '#9a8965');
    line(c, [[-5, -h + 4], [5, -h + 4]], '#403e35', 1.8);
    line(c, [[-4, -h + 7], [-9, -13], [-8, -4]], '#b0a17d', 0.8);
    line(c, [[3, -h + 7], [8, -11], [7, -3]], '#5a5948', 0.9);
    for (let i = 0; i < 7; i++) {
      const x = (sample(o.seed, i) - 0.5) * w * 0.8, y = -5 - sample(o.seed + 7, i) * (h - 10);
      line(c, [[x, y], [x + 2, y + 0.3]], '#6c6651', 0.5);
    }
  }
  function urn(c, o) {
    const w = o.w || 22, h = o.h || 28; shadow(c, w);
    c.beginPath(); c.moveTo(-w * 0.25, -h + 3); c.lineTo(w * 0.25, -h + 3);
    c.bezierCurveTo(w * 0.26, -h * 0.62, w * 0.7, -h * 0.65, w * 0.45, -8);
    c.quadraticCurveTo(w * 0.3, -1, w * 0.3, -2); c.lineTo(-w * 0.3, -2);
    c.bezierCurveTo(-w * 0.4, -6, -w * 0.7, -h * 0.65, -w * 0.25, -h + 3);
    c.closePath(); c.fillStyle = o.bone ? '#777a6c' : '#706452'; c.fill();
    ellipse(c, 0, -h + 3, w * 0.3, 2.2, '#333f3e', '#a09679');
    rect(c, -w * 0.3, -3, w * 0.6, 3, '#555b53');
    line(c, [[-w * 0.28, -h * 0.64], [-w * 0.39, -h * 0.42], [-w * 0.26, -7]], '#a59a7b', 0.9);
    line(c, [[-w * 0.43, -10], [w * 0.43, -10]], '#92927a', 1);
    if (o.bone) { skull(c, 0, -h + 1, 0.6); }
  }
  function skull(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s || 1, s || 1);
    ellipse(c, 0, -5, 6.6, 6.3, P.bone, '#6e796f');
    poly(c, [[-4, -2], [4, -2], [3, 4], [-3.7, 4]], '#a49e86');
    ellipse(c, -2.7, -5.2, 1.8, 2, '#384745'); ellipse(c, 2.7, -5.2, 1.8, 2, '#384745');
    poly(c, [[0, -3.4], [-1.3, -0.8], [1.2, -0.8]], '#46514b');
    for (let i = -2; i <= 2; i++) line(c, [[i * 1.2, 1.2], [i * 1.2, 3]], '#687065', 0.55);
    c.restore();
  }
  function remains(c, o) {
    c.save(); c.globalAlpha *= 0.68;
    skull(c, -18, -4, 0.84);
    for (let i = 0; i < 4; i++) {
      const x = -5 + i * 6;
      line(c, [[x - 5, -6], [x + 7, -2 - i % 2]], '#a19d85', 1.8);
      ellipse(c, x - 5, -6, 1.5, 1.5, '#898f7d');
    }
    c.beginPath(); c.ellipse(0, -7, 8, 5, 0.2, Math.PI, Math.PI * 2);
    c.strokeStyle = '#9b9e87'; c.lineWidth = 1.4; c.stroke();
    poly(c, [[-29, -3], [-20, -11], [-13, -5], [6, -2], [19, -1], [2, 2], [-17, 1]], 'rgba(63,69,65,.6)');
    c.restore();
  }

  function heraldry(c, o) {
    const w = o.w || 35, h = o.h || 67;
    line(c, [[-w / 2 - 4, -h], [w / 2 + 4, -h]], '#655e4b', 2);
    poly(c, [[-w / 2, -h], [w / 2, -h], [w / 2 - 1, -10], [4, 0], [0, -7], [-9, -1], [-w / 2 + 1, -13]], o.blue ? '#3f5667' : '#62434b');
    for (let i = 1; i <= 4; i++) {
      const x = -w / 2 + w * i / 5;
      line(c, [[x, -h + 3], [x - 2, -h * 0.55], [x - 1, -12]], i % 2 ? 'rgba(152,109,108,.32)' : 'rgba(29,32,40,.45)', 1.5);
    }
    line(c, [[-w / 2 + 3, -h + 6], [w / 2 - 3, -h + 6]], '#9d8b66', 1);
    c.save(); c.translate(0, -h * 0.55); c.scale(w / 37, w / 37);
    poly(c, [[-8, -9], [-2, -9], [0, -15], [3, -9], [8, -9], [6, -3], [8, 3], [2, 7], [0, 12], [-3, 7], [-8, 4], [-5, -2]], '#aa9671');
    line(c, [[-5, -4], [4, 0], [0, 6]], '#625b49', 0.8);
    c.restore();
    poly(c, [[w / 2 - 2, -25], [w / 2 - 9, -19], [w / 2 - 3, -15]], '#26323b');
  }
  function wallTablet(c, o) {
    const w = o.w || 44, h = o.h || 39;
    poly(c, [[-w / 2, -h + 5], [-w / 2 + 6, -h], [w / 2 - 5, -h], [w / 2, -h + 5], [w / 2, -2], [-w / 2, -2]], '#525c60', '#7e8279', 0.8);
    poly(c, [[-w / 2 + 5, -h + 8], [w / 2 - 5, -h + 8], [w / 2 - 5, -7], [-w / 2 + 5, -7]], '#464f56');
    for (let i = 0; i < 4; i++) {
      const ww = w * (0.43 + sample(o.seed, i) * 0.25);
      line(c, [[-ww / 2, -h + 14 + i * 5], [ww / 2, -h + 14 + i * 5]], '#879084', 0.65);
    }
    stoneChip(c, w / 2 - 5, -6, 4);
  }
  function wallMap(c, o) {
    const w = o.w || 64, h = o.h || 44;
    rounded(c, -w / 2 - 3, -h - 3, w + 6, h + 6, 1, '#53483c');
    poly(c, [[-w / 2, -h], [w / 2 - 2, -h + 1], [w / 2, -1], [-w / 2 + 1, 0]], '#a3997a');
    line(c, [[-w * 0.4, -h * 0.82], [-w * 0.2, -h * 0.62], [0, -h * 0.75], [w * 0.23, -h * 0.4], [w * 0.4, -h * 0.27]], '#596d69', 1.7);
    line(c, [[-w * 0.3, -h * 0.21], [-w * 0.12, -h * 0.37], [w * 0.03, -h * 0.22], [w * 0.2, -h * 0.6]], '#766b58', 0.8);
    for (let i = 0; i < 6; i++) {
      const x = (sample(o.seed, i) - 0.5) * w * 0.7, y = -h * (0.15 + sample(o.seed + 8, i) * 0.7);
      rect(c, x, y, 3, 3, '#685c4c');
      line(c, [[x - 1, y], [x + 1.5, y - 2], [x + 4, y]], '#615b4e', 0.6);
    }
    line(c, [[w * 0.31, -h * 0.7], [w * 0.31, -h * 0.92]], '#67664f', 0.7);
    poly(c, [[w * 0.31, -h * 0.95], [w * 0.26, -h * 0.85], [w * 0.36, -h * 0.85]], '#746852');
    for (const x of [-w / 2 + 2, w / 2 - 4]) rivet(c, x, -h + 2, '#443d35');
  }
  function spyglass(c, o) {
    line(c, [[-8, -1], [0, -21], [9, -1]], '#504a3e', 2);
    line(c, [[0, -20], [1, -36]], '#70644a', 2);
    c.save(); c.translate(0, -36); c.rotate(-0.15);
    shade(c, -18, -4, 36, 8, ['#a29360', '#807450', '#494d44']);
    rect(c, 12, -5, 9, 10, '#5f6252'); ellipse(c, 21, 0, 1.7, 4.7, '#293e48', '#969a80');
    rect(c, -20, -3, 6, 6, '#a2915e'); c.restore();
  }

  function hearth(c, o) {
    const w = o.w || 81, h = o.h || 75; shadow(c, w);
    poly(c, [[-w / 2, 0], [-w / 2, -h + 10], [-w * 0.3, -h], [w * 0.29, -h], [w / 2, -h + 10], [w / 2, 0]], '#5b5e5c');
    shade(c, -w / 2 + 5, -h + 14, w - 10, h - 18, ['#77776b', '#565d5d', '#39454b']);
    const iw = w * 0.6;
    c.beginPath(); c.moveTo(-iw / 2, -3); c.lineTo(-iw / 2, -35);
    c.quadraticCurveTo(0, -55, iw / 2, -35); c.lineTo(iw / 2, -3); c.closePath();
    c.fillStyle = '#182832'; c.fill(); c.strokeStyle = '#8e8c7c'; c.lineWidth = 3; c.stroke();
    rect(c, -w / 2 - 5, -h + 8, w + 10, 6, '#92917e');
    line(c, [[-w / 2 - 3, -h + 9], [w / 2 + 3, -h + 9]], '#b0a891', 0.8);
    for (let i = 0; i < 3; i++) {
      const y = -h + 23 + i * 16;
      line(c, [[-w / 2 + 3, y], [-iw / 2 - 2, y]], '#353f44', 0.8);
      line(c, [[iw / 2 + 2, y + 2], [w / 2 - 3, y + 2]], '#353f44', 0.8);
    }
    line(c, [[-18, -7], [14, -10]], '#77604b', 4);
    line(c, [[-14, -11], [18, -6]], '#5e4d3d', 4);
    for (let i = 0; i < 4; i++) flame(c, -13 + i * 8, -13, o.seed + i, o.time);
    rect(c, -w / 2 - 3, -3, w + 6, 3, '#6e736b');
    stoneChip(c, w / 2 - 4, -h + 18, 5); stoneChip(c, -w / 2 + 3, -4, 4);
  }
  function altar(c, o) {
    const w = o.w || 90; shadow(c, w);
    shade(c, -w / 2 + 6, -28, w - 12, 26, ['#8b8a7c', '#656c6b', '#46535b']);
    rect(c, -w / 2, -34, w, 7, '#969586');
    line(c, [[-w / 2 + 2, -33], [w / 2 - 3, -33]], '#bcb59d', 0.8);
    for (const x of [-w * 0.25, w * 0.25]) {
      rect(c, x - 6, -26, 12, 22, '#737a73');
      line(c, [[x - 4, -24], [x - 4, -5]], '#a1a08b', 0.8);
      line(c, [[x + 4, -24], [x + 4, -5]], '#3e4e56', 0.8);
    }
    poly(c, [[-14, -34], [14, -34], [11, -8], [0, -3], [-11, -8]], '#714d57');
    line(c, [[-10, -31], [-8, -11], [0, -7], [8, -11], [10, -31]], '#a19067', 0.8);
    rect(c, -1.4, -25, 2.8, 15, '#b5a176'); rect(c, -6, -21, 12, 2.4, '#b5a176');
    stoneChip(c, w / 2 - 4, -29, 4);
  }
  function stainedGlass(c, o) {
    const w = o.w || 70, h = o.h || 111;
    // A sealed wall artwork with painted lead/glass fragments; never an open exit.
    c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h * 0.65);
    c.quadraticCurveTo(-w * 0.37, -h * 0.89, 0, -h); c.quadraticCurveTo(w * 0.37, -h * 0.89, w / 2, -h * 0.65);
    c.lineTo(w / 2, 0); c.closePath(); c.fillStyle = '#36434d'; c.fill();
    c.strokeStyle = '#777b75'; c.lineWidth = 4; c.stroke();
    c.save(); c.clip();
    const colors = ['#506071', '#655261', '#72755b', '#796558', '#426466'];
    for (let row = 0; row < 5; row++) {
      const y = -h + row * h / 5;
      for (let col = 0; col < 3; col++) {
        const x = -w / 2 + col * w / 3, n = row * 3 + col;
        const fill = n === 4 || n === 11 ? '#2a3944' : colors[(n + (o.seed % 5)) % 5];
        poly(c, [[x, y], [x + w / 3, y + 4], [x + w / 3, y + h / 5], [x, y + h / 5 - 3]], fill, '#293a44', 1.2);
        if (n !== 4 && n !== 11) line(c, [[x + 3, y + 6], [x + w / 3 - 4, y + h / 5 - 5]], 'rgba(175,170,137,.17)', 0.7);
      }
    }
    line(c, [[0, -h + 7], [0, 0]], '#7a8072', 2);
    for (const x of [-w / 6, w / 6]) line(c, [[x, -h * 0.76], [x, -1]], '#3b464c', 1.4);
    poly(c, [[-4, -h * 0.73], [4, -h * 0.73], [4, -h * 0.55], [14, -h * 0.55], [14, -h * 0.49], [4, -h * 0.49], [4, -h * 0.27], [-4, -h * 0.27], [-4, -h * 0.49], [-14, -h * 0.49], [-14, -h * 0.55], [-4, -h * 0.55]], '#9b9170');
    line(c, [[w * 0.21, -h * 0.46], [w * 0.37, -h * 0.32], [w * 0.28, -h * 0.13]], '#1d303c', 1.5);
    c.restore();
    rect(c, -w / 2 - 4, 0, w + 8, 4, '#747d77');
  }

  function sarcophagus(c, o) {
    const w = o.w || 116; shadow(c, w);
    shade(c, -w / 2 + 4, -24, w - 8, 21, ['#838579', '#646f71', '#465661']);
    poly(c, [[-w / 2 - 2, -27], [-w / 2 + 5, -34], [w / 2 - 7, -34], [w / 2 + 2, -27]], '#999b88', '#535e60', 0.8);
    line(c, [[-w / 2 + 2, -27], [w / 2 - 2, -27]], '#b3af95', 0.9);
    // Recumbent effigy, carved into the lid rather than a live character.
    ellipse(c, -w * 0.28, -35, 7, 4.7, '#a0a18a', '#6f7a75');
    poly(c, [[-w * 0.2, -37], [-w * 0.03, -39], [w * 0.33, -35], [w * 0.39, -31], [-w * 0.18, -31]], '#959b89');
    line(c, [[-w * 0.17, -35], [w * 0.1, -34], [w * 0.32, -33]], '#667775', 0.8);
    for (let i = 0; i < 4; i++) {
      const x = -w * 0.32 + i * w * 0.22;
      poly(c, [[x - 6, -7], [x - 6, -17], [x, -22], [x + 6, -17], [x + 6, -7]], '#4a5b64', '#8b9384', 0.6);
      line(c, [[x, -18], [x, -10]], '#929783', 0.7);
    }
    rect(c, -w / 2 + 1, -3, w - 2, 3, '#53626a');
    stoneChip(c, w / 2 - 6, -22, 5); stoneChip(c, -w / 2 + 5, -7, 4);
  }
  function niche(c, o) {
    const w = o.w || 37, h = o.h || 60;
    c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h + 18);
    c.quadraticCurveTo(0, -h - 8, w / 2, -h + 18); c.lineTo(w / 2, 0); c.closePath();
    c.fillStyle = '#263b46'; c.fill(); c.strokeStyle = '#606e72'; c.lineWidth = 3.2; c.stroke();
    line(c, [[-w / 2 + 3, -7], [-w / 2 + 3, -h + 20]], '#899083', 0.8);
    rect(c, -w / 2 - 3, -1, w + 6, 4, '#767e77');
    c.save(); c.translate(0, -4); urn(c, {w: w * 0.5, h: 25, bone: true}); c.restore();
  }

  function chain(c, x, y, length, slack, rust) {
    const count = Math.ceil(length / 5.5);
    for (let i = 0; i < count; i++) {
      const xx = x + Math.sin(i / Math.max(1, count - 1) * Math.PI) * (slack || 0), yy = y + i * 5.5;
      ellipse(c, xx, yy, i % 2 ? 1.2 : 2.2, 3.2, null, rust ? '#6a6660' : '#727b75');
      if (i % 2 === 0) line(c, [[xx - 1, yy - 1.7], [xx - 1, yy + 1.3]], '#3b4b51', 0.6);
    }
  }
  function hangingChain(c, o) {
    rounded(c, -5, -o.h - 3, 10, 8, 1, '#45545a');
    rivet(c, 0, -o.h + 1, '#848b80'); chain(c, 0, -o.h + 6, o.h - 17, o.slack || 3, true);
    line(c, [[0, -12], [5, -8], [3, -3], [-1, -4]], '#737b74', 2);
  }
  function gear(c, x, y, radius, seed, teeth) {
    c.save(); c.translate(x, y); c.rotate(seed * 0.01);
    const pts = [], n = teeth || 12;
    for (let i = 0; i < n * 4; i++) {
      const a = i * Math.PI * 2 / (n * 4), r = i % 4 === 1 || i % 4 === 2 ? radius : radius * 0.83;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    poly(c, pts, '#666b61', '#93937a', 0.8);
    ellipse(c, 0, 0, radius * 0.65, radius * 0.65, '#2b3c46', '#444f51');
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      line(c, [[Math.cos(a) * 3, Math.sin(a) * 3], [Math.cos(a) * radius * 0.65, Math.sin(a) * radius * 0.65]], '#6d756a', radius * 0.13);
      line(c, [[Math.cos(a) * 5, Math.sin(a) * 5], [Math.cos(a) * radius * 0.58, Math.sin(a) * radius * 0.58]], '#9c9a7d', 0.7);
    }
    ellipse(c, 0, 0, radius * 0.23, radius * 0.23, '#858775', '#39484d');
    ellipse(c, 0, 0, radius * 0.08, radius * 0.08, '#384d55'); c.restore();
  }
  function winch(c, o) {
    const w = o.w || 110; shadow(c, w);
    for (const x of [-w * 0.37, w * 0.37]) {
      poly(c, [[x - 5, -2], [x - 5, -46], [x + 4, -46], [x + 7, -2]], '#403f37', '#71634d', 0.9);
      poly(c, [[x - 12, -1], [x - 4, -24], [x + 3, -1]], '#544b3b');
    }
    rect(c, -w * 0.43, -40, w * 0.86, 5, '#6c745f');
    shade(c, -w * 0.25, -47, w * 0.5, 20, ['#8f7a58', '#675c49', '#3d4644']);
    for (let i = 0; i < 14; i++) line(c, [[-w * 0.23 + i * w * 0.035, -45], [-w * 0.23 + i * w * 0.035, -29]], '#b09c70', 1.3);
    for (const x of [-w * 0.27, w * 0.27]) ellipse(c, x, -37, 3.2, 12, '#495149', '#a09774');
    gear(c, -w * 0.36, -38, 20, o.seed, 10);
    line(c, [[w * 0.38, -38], [w * 0.46, -50], [w * 0.5, -49]], '#929179', 3);
    line(c, [[w * 0.5, -49], [w * 0.5, -40]], '#6d563e', 3.5);
    chain(c, -8, -43, 37, 0, true);
  }
  function gearPanel(c, o) {
    const w = o.w || 105, h = o.h || 74;
    for (const x of [-w / 2 + 6, w / 2 - 6]) {
      rect(c, x - 3, -h, 6, h, '#373e3f');
      for (const y of [-h + 4, -5]) rivet(c, x, y, '#899080');
    }
    line(c, [[-w / 2, -h + 7], [w / 2, -h + 7]], '#535d58', 4);
    line(c, [[-w / 2, -9], [w / 2, -9]], '#414e51', 3);
    gear(c, -w * 0.18, -h * 0.57, 24, o.seed, 12);
    gear(c, w * 0.2, -h * 0.38, 19, o.seed + 9, 10);
    gear(c, w * 0.15, -h * 0.79, 12, o.seed + 20, 8);
    chain(c, -w * 0.39, -h + 7, h - 10, 0, true);
  }
  function bell(c, o) {
    const w = o.w || 54, h = o.h || 67;
    line(c, [[-w / 2 - 7, -h - 9], [w / 2 + 7, -h - 9]], '#5c5141', 5);
    line(c, [[0, -h - 8], [0, -h + 3]], '#63665a', 4);
    c.beginPath(); c.moveTo(-w * 0.17, -h); c.quadraticCurveTo(-w * 0.43, -h + 5, -w * 0.42, -h * 0.46);
    c.quadraticCurveTo(-w * 0.42, -h * 0.23, -w / 2, -h * 0.16); c.lineTo(w / 2, -h * 0.16);
    c.quadraticCurveTo(w * 0.42, -h * 0.23, w * 0.42, -h * 0.46); c.quadraticCurveTo(w * 0.43, -h + 5, w * 0.17, -h);
    c.closePath(); c.fillStyle = '#7d7858'; c.fill();
    line(c, [[-w * 0.2, -h + 6], [-w * 0.29, -h * 0.47], [-w * 0.35, -h * 0.23]], '#aaa27a', 1.5);
    ellipse(c, 0, -h * 0.16, w / 2, 4, '#343f3d', '#a09970');
    line(c, [[0, -h * 0.3], [0, -3]], '#635d48', 2.3);
    ellipse(c, 0, -3, 4.2, 3.2, '#8e8963');
    for (let i = 0; i < 2; i++) line(c, [[-w * 0.35, -h * (0.39 + i * 0.1)], [w * 0.35, -h * (0.39 + i * 0.1)]], '#98916a', 0.7);
  }
  function cage(c, o) {
    const w = o.w || 64, h = o.h || 77; shadow(c, w);
    // Rear-wall hanging cage: subdued closed panel, no door cutout or playable bar edge.
    poly(c, [[-w / 2, -h + 12], [-w * 0.25, -h], [w * 0.3, -h + 2], [w / 2, -h + 15], [w / 2, -5], [-w / 2, -5]], 'rgba(29,43,50,.22)');
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 4 + i * ((w - 8) / 5);
      line(c, [[x, -h + 13], [x + Math.sin(i) * 2, -h * 0.5], [x, -6]], i % 2 ? '#5e6a68' : '#465961', 1.8);
    }
    for (const y of [-h + 14, -h * 0.52, -7]) line(c, [[-w / 2 - 1, y], [w / 2 + 1, y + 1]], '#71736a', 2);
    line(c, [[-w / 2, -h + 14], [-w * 0.25, -h], [w * 0.3, -h + 2], [w / 2, -h + 14]], '#777970', 2);
    for (const x of [-w * 0.25, w * 0.25]) chain(c, x, -h - 16, 15, 0, true);
    rect(c, -4, -h * 0.52 - 4, 8, 8, '#7b7156');
    ellipse(c, 0, -h * 0.52, 1, 1.7, '#273c43');
    c.save(); c.translate(-4, -10); remains(c, o); c.restore();
  }
  function drainGrate(c, o) {
    const w = o.w || 48, h = o.h || 22;
    rounded(c, -w / 2 - 3, -h - 3, w + 6, h + 6, 3, '#4a5b61');
    rounded(c, -w / 2, -h, w, h, 2, '#243943');
    for (let x = -w / 2 + 6; x < w / 2; x += 7) line(c, [[x, -h + 1], [x, -1]], '#5c6b6b', 2);
    line(c, [[-w / 2 + 1, -h / 2], [w / 2 - 1, -h / 2]], '#737a70', 1.3);
    for (const x of [-w / 2 - 1, w / 2 + 1]) rivet(c, x, -h / 2, '#8b8c78');
    for (let i = 0; i < 3; i++) line(c, [[-w * 0.3 + i * 12, 3], [-w * 0.3 + i * 12 - 1, 9 + i * 3]], '#416166', 1.1);
  }
  function gauge(c, o) {
    rect(c, -4, -75, 8, 75, '#6f7770'); rect(c, -2, -71, 4, 67, '#2e4c58');
    rect(c, -1.4, -31, 2.8, 27, '#658885');
    for (let i = 0; i < 9; i++) line(c, [[4, -5 - i * 8], [i % 2 ? 8 : 12, -5 - i * 8]], '#8d9587', 0.7);
    rounded(c, -10, -81, 20, 10, 2, '#5b6869');
    ellipse(c, 0, -77, 3, 3, '#b1a480', '#485b5d');
  }
  function anvil(c, o) {
    shadow(c, 45); shade(c, -13, -20, 26, 19, ['#6f604b', '#514a3d', '#343d40']);
    poly(c, [[-23, -30], [17, -30], [23, -26], [11, -22], [6, -14], [-6, -14], [-12, -22], [-30, -24]], '#6e7c80', '#3b4e57', 0.9);
    line(c, [[-23, -29], [16, -29]], '#a5afa6', 1);
    line(c, [[-10, -10], [11, -9]], '#443f37', 1);
  }
  function bellows(c, o) {
    poly(c, [[-24, -9], [-20, -23], [7, -28], [21, -17], [6, -8]], '#5e4f43', '#8b7552', 0.8);
    for (let i = 0; i < 4; i++) line(c, [[-18 + i * 6, -20 - i * 1.2], [-14 + i * 6, -11 - i * 0.3]], '#302e2c', 1.5);
    poly(c, [[19, -18], [34, -20], [34, -16], [21, -13]], '#6b776f');
    rect(c, -19, -8, 26, 6, '#45433a');
  }

  function history(c, o) {
    const w = o.w || 86, h = o.h || 57;
    c.save(); c.globalAlpha *= 0.8;
    // Local worn patches, never a wall-sized replacement fill.
    for (let i = 0; i < 9; i++) {
      const x = (sample(o.seed, i) - 0.5) * w, y = -sample(o.seed + 19, i) * h;
      const rw = 3 + sample(o.seed + 33, i) * 12;
      ellipse(c, x, y, rw, rw * 0.2, o.damp ? 'rgba(64,84,76,.22)' : 'rgba(32,43,53,.19)');
    }
    line(c, [[-w * 0.28, -h + 8], [-w * 0.21, -h * 0.58], [-w * 0.25, -h * 0.45], [-w * 0.18, -h * 0.24]], 'rgba(26,44,54,.50)', 0.8);
    line(c, [[-w * 0.21, -h * 0.58], [-w * 0.11, -h * 0.65]], 'rgba(37,52,61,.42)', 0.65);
    if (o.damp) {
      for (let i = 0; i < 5; i++) {
        const x = -w * 0.4 + i * w * 0.19, len = 12 + sample(o.seed, i + 20) * h * 0.4;
        line(c, [[x, -h + 4], [x + 2, -h + len]], 'rgba(37,72,76,.33)', 1 + sample(o.seed, i) * 1.3);
      }
    } else {
      // Old hooks and faded tally cuts read as past occupation rather than random noise.
      for (let i = 0; i < 4; i++) line(c, [[w * 0.2 + i * 3.1, -h * 0.3], [w * 0.2 + i * 3.1 - 1.2, -h * 0.3 + 7]], '#798078', 0.6);
      line(c, [[w * 0.18, -h * 0.3 + 6], [w * 0.33, -h * 0.3 + 2]], '#5d6b6d', 0.7);
    }
    c.restore();
  }
  function drip(c, o) {
    line(c, [[0, -o.h], [1, -o.h + 15], [0, -o.h + 27]], 'rgba(79,113,112,.45)', 1);
    poly(c, [[0, -o.h + 29], [-1.4, -o.h + 33], [0.4, -o.h + 35], [1.7, -o.h + 33]], '#6f9690');
    ellipse(c, 1, -3, 9, 1.5, 'rgba(46,77,80,.26)', 'rgba(97,128,122,.20)');
  }

  const DRAW = {
    table, chair, bench, bed, screen, shelf, ladderBack, scrollRack, weaponRack,
    armor, chest, barrel, sack, urn, remains, heraldry, wallTablet, wallMap, spyglass,
    hearth, altar, stainedGlass, sarcophagus, niche, hangingChain, winch, gearPanel,
    bell, cage, drainGrate, gauge, anvil, bellows, history, drip,
    candle: (c, o) => candle(c, o.seed, o.time),
    candleStand: (c, o) => candleStand(c, o.seed, o.time),
    torch: (c, o) => torch(c, o.seed, o.time)
  };

  function roomType(r) {
    if (ROOM_TYPES[r.id]) return ROOM_TYPES[r.id];
    const text = String(r.name || '') + String(r.role || '');
    if (/军械|武器/.test(text)) return 'armory';
    if (/书库|书房/.test(text)) return 'library';
    if (/医务|医疗/.test(text)) return 'infirmary';
    if (/礼拜|祭坛/.test(text)) return 'chapel';
    if (/墓|藏骨/.test(text)) return 'crypt';
    if (/监牢|水牢/.test(text)) return 'waterPrison';
    if (/绞盘|传动|机械/.test(text)) return 'engine';
    if (/守望|观察/.test(text)) return 'watch';
    if (/岩洞|岩室|水洞/.test(text)) return 'cave';
    if (/水|排洪/.test(text)) return 'drain';
    if (/大厅|觐见/.test(text)) return 'hall';
    return 'service';
  }

  function getLayout(room) {
    const x0 = Number(room.x0), x1 = Number(room.x1), top = Number(room.top), floor = Number(room.floor);
    if (![x0, x1, top, floor].every(Number.isFinite) || x1 <= x0 || floor <= top) return null;
    const key = [room.id, room.name, room.role, x0, x1, top, floor].join('|');
    if (cache.has(key)) return cache.get(key);
    const w = x1 - x0, h = floor - top, seed = hash(key), items = [], lights = [];
    const margin = Math.min(70, Math.max(18, w * 0.13));
    const available = Math.max(25, w - margin * 2), bottom = floor - 4;
    const type = w < 140 ? 'small' : roomType(room);
    function put(kind, f, y, args) {
      args = Object.assign({}, args || {});
      const pw = args.w || ({candleStand: 40, torch: 18, candle: 14, chair: 26, bed: 76,
        armor: 44, spyglass: 45, hangingChain: 12, remains: 61, drip: 24, gauge: 30,
        anvil: 60, bellows: 68, bench: 61, table: 106, cage: 68, shelf: 94,
        sarcophagus: 120, heraldry: 35, niche: 40, chest: 44, barrel: 26, sack: 26,
        urn: 22, wallMap: 70, wallTablet: 44, stainedGlass: 78, winch: 116,
        gearPanel: 109, bell: 68, drainGrate: 54, screen: 64, scrollRack: 43,
        hearth: 91, altar: 94, history: 86, weaponRack: 89, ladderBack: 18}[kind] || 40);
      // Main objects keep their authored human scale; only truly tiny rooms use small props.
      const fit = Math.min(1, available / pw);
      const half = pw * fit / 2;
      const x = clamp(x0 + margin + available * f, x0 + margin + half, x1 - margin - half);
      const yy = clamp(y == null ? bottom : y, top + 12, floor - 3);
      const item = Object.assign({kind, x, y: yy, scale: fit, seed: seed + items.length * 71}, args);
      items.push(item); return item;
    }
    function localLight(item, dx, dy, kind, radius) {
      lights.push({x: item.x + dx * item.scale, y: item.y + dy * item.scale, type: kind, radius});
    }
    function litCandle(f, y) { const a = put('candle', f, y); localLight(a, 0, -22, 'candle', 92); return a; }
    function litStand(f, y) {
      const a = put('candleStand', f, y);
      for (const dx of [-15, 0, 15]) localLight(a, dx, -59, 'candle', 109);
      return a;
    }
    function litTorch(f, y) { const a = put('torch', f, y); localLight(a, 5, -36, 'torch', 133); return a; }
    function litHearth(f, y, args) {
      const a = put('hearth', f, y, args); localLight(a, 0, -20, 'hearth', type === 'forge' ? 186 : 170); return a;
    }
    const wallY = top + Math.min(h * 0.61, 122), historyY = floor - Math.min(h * 0.32, 48);
    const damp = /cave|drain|crypt|ossuary|prison|cistern|water/i.test(type);
    put('history', 0.38, historyY, {w: Math.min(112, available), h: Math.min(70, h * 0.46), damp});

    switch (type) {
      case 'small':
        put('wallTablet', 0.5, top + 70, {w: 25, h: 29});
        put('chest', 0.4, bottom, {w: 30});
        put('hangingChain', 0.78, top + 76, {h: 34, slack: 1});
        litTorch(0.6, top + 45);
        break;
      case 'hall':
        put('heraldry', 0.43, wallY - 14, {w: 40, h: 84});
        put('heraldry', 0.62, wallY - 11, {w: 33, h: 77});
        litHearth(0.15, bottom, {w: 76, h: 86});
        put('chair', 0.43, bottom, {high: true}); put('chair', 0.77, bottom, {high: true});
        const ht = put('table', 0.61, bottom, {w: Math.min(160, available * 0.52), cloth: true, mode: 'dining'});
        litCandle(0.6, ht.y - 28); put('chest', 0.92, bottom, {w: 38});
        break;
      case 'audience':
        put('heraldry', 0.5, wallY - 13, {w: 45, h: 94});
        put('wallTablet', 0.28, wallY, {w: 48, h: 48});
        put('chair', 0.5, bottom, {high: true, upholstery: '#713f4d'});
        put('bench', 0.18, bottom, {w: 60, back: true});
        put('table', 0.76, bottom, {w: 84, cloth: true, mode: 'desk'});
        litStand(0.35, bottom); litCandle(0.77, bottom - 28);
        break;
      case 'armory': case 'armoryUpper':
        put('heraldry', 0.47, wallY - 7, {w: 30, h: 57, blue: type === 'armoryUpper'});
        put('weaponRack', 0.27, bottom, {w: Math.min(104, available * 0.45)});
        put('armor', 0.67, bottom);
        put('chest', 0.88, bottom, {w: 46});
        if (available > 300) put('table', 0.52, bottom, {w: 70, mode: 'tools'});
        litTorch(0.54, top + 55);
        break;
      case 'supply':
        put('weaponRack', 0.23, bottom, {w: 98});
        put('chest', 0.51, bottom, {w: 58}); put('barrel', 0.72, bottom, {w: 30, h: 41});
        put('sack', 0.82, bottom, {w: 29, h: 29}); put('wallTablet', 0.65, wallY, {w: 50});
        litTorch(0.4, top + 54);
        break;
      case 'library': case 'libraryUpper':
        put('shelf', 0.2, bottom, {w: 101, h: 107});
        put('shelf', 0.49, bottom, {w: 89, h: 101});
        put('wallTablet', 0.77, top + 67, {w: 42, h: 35});
        put('ladderBack', 0.36, bottom, {h: 85});
        put('chair', 0.75, bottom);
        put('table', 0.8, bottom, {w: 104, mode: 'desk'});
        put('scrollRack', 0.94, bottom, {w: 36});
        litCandle(0.82, bottom - 28);
        break;
      case 'chapel':
        put('stainedGlass', 0.51, top + Math.min(h * 0.63, 260), {w: 79, h: 138});
        put('heraldry', 0.25, top + 215, {w: 30, h: 69, blue: true});
        put('heraldry', 0.79, top + 205, {w: 30, h: 79});
        put('bench', 0.12, bottom, {w: 65, back: true}); put('bench', 0.89, bottom, {w: 65, back: true});
        put('altar', 0.5, bottom, {w: 98});
        litStand(0.31, bottom); litStand(0.7, bottom);
        litCandle(0.48, bottom - 34); litCandle(0.56, bottom - 34);
        break;
      case 'gallery':
        put('wallTablet', 0.53, wallY, {w: 38, h: 48});
        put('bench', 0.5, bottom, {w: 52}); put('urn', 0.82, bottom, {w: 16, h: 22});
        litTorch(0.3, top + 51);
        break;
      case 'infirmary':
        put('screen', 0.26, bottom, {w: 58, h: 73});
        put('shelf', 0.73, bottom, {w: 58, h: 97, medicine: true});
        put('bed', 0.26, bottom, {w: 81, medical: true});
        put('bed', 0.52, bottom, {w: 78, medical: true});
        put('table', 0.88, bottom, {w: 65, mode: 'medicine'});
        put('wallTablet', 0.5, top + 61, {w: 36, h: 30});
        litCandle(0.87, bottom - 28);
        break;
      case 'medicineStore':
        put('shelf', 0.24, bottom, {w: 74, h: 105, medicine: true});
        put('screen', 0.54, bottom, {w: 47, h: 68});
        put('table', 0.74, bottom, {w: 85, mode: 'medicine'});
        put('sack', 0.44, bottom, {w: 24, h: 23}); put('wallTablet', 0.75, top + 59, {w: 36, h: 31});
        litCandle(0.79, bottom - 28);
        break;
      case 'barrack':
        put('heraldry', 0.51, top + 70, {w: 25, h: 49, blue: true});
        put('bed', 0.24, bottom, {w: 76}); put('weaponRack', 0.7, bottom, {w: 56});
        put('chest', 0.5, bottom, {w: 35}); litTorch(0.47, top + 49);
        break;
      case 'watch':
        put('wallMap', 0.56, wallY - 3, {w: Math.min(88, available * 0.53), h: 48});
        put('spyglass', 0.16, bottom); put('chair', 0.55, bottom);
        put('table', 0.57, bottom, {w: Math.min(125, available * 0.58), mode: 'watch'});
        if (available > 200) put('chest', 0.87, bottom, {w: 43});
        put('heraldry', 0.81, top + 77, {w: 25, h: 48, blue: true});
        litCandle(0.62, bottom - 28);
        break;
      case 'guard':
        put('wallMap', 0.5, top + 69, {w: Math.min(58, available * 0.58), h: 36});
        put('weaponRack', 0.17, bottom, {w: Math.min(54, available * 0.4)});
        put('chair', 0.69, bottom);
        put('table', 0.7, bottom, {w: Math.min(69, available * 0.48), mode: 'desk'});
        litCandle(0.76, bottom - 28);
        break;
      case 'engine': case 'clock': case 'gate': case 'waterEngine':
        put('gearPanel', 0.5, bottom - 47, {w: Math.min(116, available * 0.43), h: 68});
        put('hangingChain', 0.68, top + 118, {h: 96, slack: 3});
        put('wallTablet', 0.2, top + 70, {w: 42, h: 31});
        put('winch', 0.48, bottom, {w: Math.min(119, available * 0.46)});
        put('table', 0.84, bottom, {w: 61, mode: 'tools'});
        put('barrel', 0.12, bottom, {w: 27, h: 35});
        if (type === 'waterEngine') put('gauge', 0.77, bottom - 9);
        litTorch(0.75, top + 56);
        break;
      case 'bell':
        put('bell', 0.5, top + 108, {w: 56, h: 64});
        put('hangingChain', 0.73, top + 155, {h: 98});
        put('gearPanel', 0.32, bottom - 26, {w: 52, h: 55});
        put('table', 0.59, bottom, {w: 66, mode: 'watch'});
        litCandle(0.62, bottom - 28);
        break;
      case 'crypt': case 'ossuary':
        put('niche', 0.22, top + 86, {w: 37, h: 57});
        put('niche', 0.65, top + 84, {w: 37, h: 59});
        put('wallTablet', 0.45, top + 71, {w: 49, h: 45});
        put('sarcophagus', 0.41, bottom, {w: Math.min(130, available * 0.38)});
        put('urn', 0.68, bottom, {w: 27, h: 34, bone: true});
        put('urn', 0.79, bottom, {w: 23, h: 29, bone: true});
        if (available > 430) put('sarcophagus', 0.83, bottom, {w: 105});
        litStand(0.15, bottom);
        if (type === 'ossuary') put('remains', 0.57, bottom);
        break;
      case 'cryptPassage':
        put('wallTablet', 0.5, top + 66, {w: 40, h: 41});
        put('urn', 0.24, bottom, {w: 23, h: 28, bone: true});
        put('urn', 0.71, bottom, {w: 23, h: 33, bone: true});
        litTorch(0.5, top + 53);
        break;
      case 'prison': case 'waterPrison':
        put('cage', 0.29, bottom - 12, {w: 76, h: 83});
        put('hangingChain', 0.52, top + 122, {h: 105, slack: 7});
        put('hangingChain', 0.58, top + 118, {h: 87, slack: -4});
        put('drainGrate', 0.74, bottom - 12, {w: 54, h: 24});
        put('barrel', 0.87, bottom, {w: 26, h: 31});
        put('remains', 0.55, bottom); litTorch(0.69, top + 54);
        if (available > 470) put('cage', 0.8, bottom - 16, {w: 62, h: 78});
        break;
      case 'cave':
        put('remains', 0.37, bottom);
        put('urn', 0.67, bottom, {w: 18, h: 21});
        put('drip', 0.58, bottom, {h: Math.min(125, h - 10)});
        put('history', 0.6, top + 70, {w: 43, h: 32, damp: true});
        break;
      case 'drain': case 'cistern':
        put('drainGrate', 0.37, bottom - 16, {w: type === 'cistern' ? 62 : 49, h: 25});
        put('gauge', 0.63, bottom - 11);
        put('hangingChain', 0.2, top + 117, {h: 91, slack: 2});
        put('barrel', 0.77, bottom, {w: 28, h: 36});
        put('urn', 0.85, bottom, {w: 20, h: 25});
        put('drip', 0.53, bottom, {h: Math.min(129, h - 10)});
        if (type === 'cistern') put('wallTablet', 0.48, top + 67, {w: 35, h: 26});
        litTorch(0.69, top + 50);
        break;
      case 'forge':
        litHearth(0.25, bottom, {w: 91, h: 92});
        put('anvil', 0.56, bottom); put('bellows', 0.42, bottom);
        put('table', 0.81, bottom, {w: 79, mode: 'tools'});
        put('hangingChain', 0.72, top + 107, {h: 81, slack: 2});
        put('barrel', 0.93, bottom, {w: 25, h: 30});
        break;
      case 'cellar': case 'service':
        put('wallTablet', 0.4, top + 61, {w: 43, h: 31});
        put('barrel', 0.24, bottom, {w: 29, h: 41});
        put('barrel', 0.31, bottom, {w: 26, h: 35});
        put('chest', 0.55, bottom, {w: 56});
        put('sack', 0.68, bottom, {w: 29, h: 29});
        put('urn', 0.75, bottom, {w: 24, h: 31});
        if (available > 400) { put('bench', 0.85, bottom, {w: 64}); put('sack', 0.16, bottom, {w: 25, h: 23}); }
        litTorch(0.47, top + 55);
        break;
      case 'passage':
        put('heraldry', 0.3, top + 78, {w: 29, h: 59, blue: true});
        put('wallTablet', 0.65, top + 68, {w: 42, h: 34});
        put('bench', 0.43, bottom, {w: Math.min(81, available * 0.5)});
        put('chest', 0.76, bottom, {w: 35});
        litTorch(0.57, top + 49);
        break;
    }
    const layout = {x0, x1, top, floor, type, items, lights};
    if (cache.size > 95) cache.clear();
    cache.set(key, layout); return layout;
  }

  function drawRoom(ctx, room, opts) {
    if (!ctx || !room) return;
    const layout = getLayout(room); if (!layout) return;
    opts = opts || {};
    ctx.save(); ctx.beginPath(); ctx.rect(layout.x0 + 1, layout.top + 1, layout.x1 - layout.x0 - 2, layout.floor - layout.top - 2); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const item of layout.items) {
      if (opts.detail === false && (item.kind === 'history' || item.kind === 'drip')) continue;
      ctx.save(); ctx.translate(item.x, item.y); ctx.scale(item.scale, item.scale);
      DRAW[item.kind](ctx, Object.assign({}, item, {time: Number(opts.time) || 0})); ctx.restore();
    }
    ctx.restore();
  }
  function getLights(room) {
    if (!room) return [];
    const layout = getLayout(room);
    return layout ? layout.lights.map(light => Object.assign({}, light)) : [];
  }
  function drawCatalog(ctx, x, y, options) {
    if (!ctx) return;
    x = Number(x) || 0; y = Number(y) || 0;
    const specimens = [
      ['长桌 · 28px高', 'table', {w: 126, cloth: true, mode: 'dining'}],
      ['高背椅 · 46px高', 'chair', {high: true}],
      ['壁炉 · 82px高', 'hearth', {w: 81, h: 82}],
      ['纹章织物', 'heraldry', {w: 35, h: 78}],
      ['武器架 / 盾牌', 'weaponRack', {w: 96}],
      ['陈列盔甲', 'armor', {}],
      ['锁箱 / 铁箍', 'chest', {w: 51}],
      ['书架 · 107px高', 'shelf', {w: 98, h: 107}],
      ['书桌 / 文书', 'table', {w: 105, mode: 'desk'}],
      ['石祭坛', 'altar', {w: 94}],
      ['破彩窗 · 封闭背墙', 'stainedGlass', {w: 64, h: 109}],
      ['三枝烛台', 'candleStand', {}],
      ['齿轮传动', 'gearPanel', {w: 105, h: 79}],
      ['吊桥绞盘', 'winch', {w: 113}],
      ['医务床 · 24px高', 'bed', {w: 80, medical: true}],
      ['医疗帘布', 'screen', {w: 61, h: 79}],
      ['瓶罐柜', 'shelf', {w: 65, h: 105, medicine: true}],
      ['守望镜', 'spyglass', {}],
      ['壁挂地图', 'wallMap', {w: 72, h: 48}],
      ['浮雕石棺', 'sarcophagus', {w: 124}],
      ['骨坛壁龛', 'niche', {w: 40, h: 68}],
      ['旧悬笼', 'cage', {w: 69, h: 87}],
      ['挂链 / 旧锁钩', 'hangingChain', {h: 100, slack: 5}],
      ['排水铁栅', 'drainGrate', {w: 58, h: 27}],
      ['岩洞遗骸', 'remains', {}],
      ['木桶', 'barrel', {w: 28, h: 39}],
      ['麻袋', 'sack', {w: 31, h: 34}],
      ['陶罐', 'urn', {w: 28, h: 34}],
      ['石壁旧痕', 'history', {w: 98, h: 74, damp: false}],
      ['钟室铜钟', 'bell', {w: 59, h: 69}]
    ];
    options = options || {};
    const columns = options.columns || 6, cellW = 158, cellH = 153;
    const count = Math.min(specimens.length, options.limit || specimens.length);
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < count; i++) {
      const s = specimens[i], xx = (i % columns) * cellW + cellW / 2, yy = Math.floor(i / columns) * cellH + 120;
      ctx.save(); ctx.translate(xx, yy);
      DRAW[s[1]](ctx, Object.assign({seed: 347 + i * 79, time: 0}, s[2])); ctx.restore();
      ctx.fillStyle = '#b6bdad'; ctx.fillText(s[0], xx, yy + 12);
    }
    ctx.restore();
    return {width: columns * cellW, height: Math.ceil(count / columns) * cellH};
  }

  global.CastleArtProps = {drawRoom, getLights, drawCatalog};
})(window);
