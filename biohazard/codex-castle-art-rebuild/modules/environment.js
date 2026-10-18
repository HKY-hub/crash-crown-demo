/*
 * Castle art rebuild: environment only. Geometry is read, never written.
 * Background uses screen coordinates. Underground/effects use world coordinates.
 * All ornament and animation phases are stable; no frame-time randomness.
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const frac = n => n - Math.floor(n);
  const noise = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
  const lerp = (a, b, t) => a + (b - a) * t;

  function poly(ctx, points, fill, stroke, lineWidth) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function line(ctx, points, color, width) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.stroke();
  }

  function ellipse(ctx, x, y, rx, ry, color, rotation) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rotation || 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function viewBounds(view) {
    view = view || {};
    const s = Number(view.scale) || 1;
    const x0 = view.x0 == null ? (view.camX == null ? view.x || 0 : view.camX) : view.x0;
    const y0 = view.y0 == null ? (view.camY == null ? view.y || 0 : view.camY) : view.y0;
    return {
      x0, y0,
      x1: view.x1 == null ? x0 + (view.width || view.w || 960) / s : view.x1,
      y1: view.y1 == null ? y0 + (view.height || view.h || 540) / s : view.y1,
      scale: s
    };
  }

  function intersects(v, x0, y0, x1, y1) {
    return x1 >= v.x0 && x0 <= v.x1 && y1 >= v.y0 && y0 <= v.y1;
  }

  // Three independently authored ridgelines. Valleys are broad; illuminated facets
  // follow the mountain's slope rather than repeated triangles or noisy outlines.
  const RIDGES = [
    {
      p: .085, vertical: .48, base: 1620, color: '#2c3d50', shade: '#273548', light: '#394b5d',
      points: [[-1200,1320],[-800,1270],[-570,1170],[-220,1215],[90,1148],[280,1028],[430,1089],[605,985],[780,1110],[1060,1160],[1360,1068],[1610,1195],[1890,1244],[2230,1185],[2490,1060],[2670,1114],[2800,995],[2990,1158],[3280,1220],[3550,1128],[3900,1210],[4230,1150],[4480,1230],[4800,1080],[5160,1205],[5500,1240],[6100,1125],[6600,1225],[7200,1150],[7800,1250],[8600,1140],[9400,1240]],
      facets: [
        [[280,1028],[312,1190],[90,1325],[70,1450],[450,1510],[430,1089]],
        [[605,985],[530,1230],[715,1405],[1070,1540],[780,1110]],
        [[1360,1068],[1260,1290],[1500,1520],[1760,1530],[1610,1195]],
        [[2800,995],[2700,1290],[2870,1470],[3210,1550],[2990,1158]],
        [[4800,1080],[4680,1290],[4940,1510],[5200,1540],[5160,1205]],
        [[6100,1125],[5940,1340],[6220,1530],[6600,1580],[6600,1225]]
      ]
    },
    {
      p: .16, vertical: .64, base: 1800, color: '#263647', shade: '#21303f', light: '#314451',
      points: [[-1200,1520],[-940,1450],[-680,1320],[-420,1375],[-250,1240],[-35,1300],[130,1190],[300,1280],[440,1255],[680,1400],[970,1340],[1160,1270],[1320,1385],[1570,1350],[1810,1205],[1955,1270],[2090,1180],[2250,1355],[2560,1425],[2800,1320],[3100,1390],[3470,1260],[3680,1370],[4080,1325],[4500,1440],[4910,1300],[5220,1430],[5620,1370],[6040,1280],[6460,1375],[6850,1300],[7310,1460],[7800,1370],[8500,1450],[9400,1300]],
      facets: [
        [[130,1190],[78,1380],[230,1530],[650,1670],[440,1255],[300,1280]],
        [[1160,1270],[1080,1500],[1300,1660],[1600,1730],[1320,1385]],
        [[1810,1205],[1720,1450],[1900,1680],[2220,1760],[1955,1270]],
        [[2090,1180],[2040,1410],[2250,1620],[2560,1700],[2250,1355]],
        [[3470,1260],[3370,1470],[3660,1710],[4090,1760],[3680,1370]],
        [[4910,1300],[4760,1510],[5140,1740],[5570,1790],[5220,1430]],
        [[6040,1280],[5960,1510],[6220,1730],[6600,1790],[6460,1375]]
      ]
    },
    {
      p: .28, vertical: .77, base: 2040, color: '#1b2935', shade: '#17242d', light: '#243640',
      points: [[-1200,1660],[-840,1535],[-590,1570],[-350,1440],[-70,1515],[200,1410],[410,1510],[690,1445],[980,1540],[1180,1500],[1390,1560],[1600,1400],[1830,1465],[2060,1390],[2280,1520],[2560,1475],[2860,1550],[3150,1460],[3450,1530],[3770,1460],[4100,1555],[4450,1500],[4830,1545],[5170,1490],[5540,1550],[5950,1450],[6240,1520],[6660,1470],[7080,1580],[7540,1500],[8080,1540],[8500,1490],[9300,1560]],
      facets: [
        [[-350,1440],[-470,1630],[-50,1930],[390,2040],[-70,1515]],
        [[200,1410],[145,1650],[350,1840],[670,2030],[410,1510]],
        [[690,1445],[610,1680],[810,1870],[1180,2000],[980,1540]],
        [[1600,1400],[1510,1680],[1710,1860],[2070,2040],[1830,1465]],
        [[2060,1390],[1980,1640],[2270,1890],[2700,2050],[2280,1520]],
        [[3150,1460],[3060,1690],[3350,1950],[3770,2040],[3450,1530]],
        [[5950,1450],[5780,1710],[6100,1940],[6610,2050],[6240,1520]]
      ]
    }
  ];

  function drawRidge(ctx, ridge, camera, w, h) {
    const s = camera.scale;
    const map = pt => [(pt[0] - camera.camX * ridge.p) * s,
      (pt[1] - 1180 - (camera.camY - 1180) * ridge.vertical) * s];
    const points = ridge.points.map(map);
    points.push([points[points.length - 1][0], h + 600], [points[0][0], h + 600]);
    poly(ctx, points, ridge.color);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(pt => ctx.lineTo(pt[0], pt[1]));
    ctx.closePath();
    ctx.clip();
    ridge.facets.forEach((face, i) => {
      const mapped = face.map(map);
      if (mapped.every(pt => pt[0] < -20) || mapped.every(pt => pt[0] > w + 20)) return;
      poly(ctx, mapped, i % 2 ? ridge.shade : ridge.light);
      if (s > .4) {
        const a = mapped[0], b = mapped[mapped.length - 2];
        ctx.globalAlpha = .3;
        line(ctx, [a, [lerp(a[0], b[0], .52) + 11 * s, lerp(a[1], b[1], .52)], b], ridge.light, 1.1 * s);
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  function drawMoon(ctx, opts) {
    const s = opts.scale;
    const radius = 36 * clamp(s, .32, 1.5);
    const x = opts.width * .72 - (opts.camX - 3200) * .021 * s;
    const y = 98 * clamp(s, .36, 1.4) - (opts.camY - 1180) * .047 * s;
    const halo = ctx.createRadialGradient(x, y, radius * .65, x, y, radius * 4.8);
    halo.addColorStop(0, 'rgba(180,202,214,.16)');
    halo.addColorStop(.23, 'rgba(153,187,208,.055)');
    halo.addColorStop(1, 'rgba(120,156,185,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.clip();
    const face = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    face.addColorStop(0, '#ced2c6');
    face.addColorStop(.45, '#b4c2c4');
    face.addColorStop(1, '#6b808c');
    ctx.fillStyle = face;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    // Maria and smaller crater rims: muted, uneven areas, never another moon.
    const scars = [
      [-.22,-.28,.28,.18,.4],[-.42,.04,.16,.27,-.3],[.12,.08,.24,.3,.6],
      [.38,-.32,.18,.14,.5],[-.03,.52,.32,.13,-.2],[.36,.42,.11,.08,0]
    ];
    scars.forEach(sc => ellipse(ctx, x + sc[0] * radius, y + sc[1] * radius,
      sc[2] * radius, sc[3] * radius, 'rgba(66,86,95,.17)', sc[4]));
    for (let i = 0; i < 14; i++) {
      const angle = noise(i + 46) * TAU;
      const d = Math.sqrt(noise(i + 72)) * radius * .76;
      const cr = (1.1 + noise(i + 103) * 2.7) * radius / 36;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * d, y + Math.sin(angle) * d, cr, .25, Math.PI * 1.38);
      ctx.strokeStyle = 'rgba(225,225,207,.23)';
      ctx.lineWidth = Math.max(.4, s * .65);
      ctx.stroke();
    }
    const terminator = ctx.createRadialGradient(x - radius * .8, y - radius * .28, radius * .25,
      x - radius * .15, y, radius * 1.7);
    terminator.addColorStop(0, 'rgba(12,26,39,0)');
    terminator.addColorStop(.57, 'rgba(18,34,48,.04)');
    terminator.addColorStop(.88, 'rgba(13,25,41,.55)');
    terminator.addColorStop(1, 'rgba(13,25,41,.86)');
    ctx.fillStyle = terminator;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // Each bank is a long joined mass, with a subordinate curl at its illuminated edge.
  const CLOUD_BANKS = [
    {x:-340,y:69,w:710,h:39,p:.026,seed:11,alpha:.23},
    {x:145,y:171,w:910,h:53,p:.033,seed:48,alpha:.22},
    {x:620,y:45,w:880,h:47,p:.021,seed:83,alpha:.27},
    {x:1170,y:130,w:970,h:48,p:.03,seed:141,alpha:.2},
    {x:2030,y:87,w:1120,h:63,p:.022,seed:231,alpha:.19},
    {x:2950,y:187,w:940,h:35,p:.025,seed:322,alpha:.15},
    {x:3850,y:73,w:1080,h:60,p:.03,seed:414,alpha:.22},
    {x:4750,y:135,w:1140,h:59,p:.024,seed:515,alpha:.18},
    {x:5760,y:49,w:930,h:41,p:.021,seed:602,alpha:.22},
    {x:6570,y:160,w:1050,h:44,p:.03,seed:711,alpha:.16},
    {x:7520,y:81,w:1030,h:52,p:.026,seed:819,alpha:.22}
  ];

  function cloudPath(ctx, x, y, w, h, seed) {
    ctx.beginPath();
    ctx.moveTo(x, y + h * .45);
    const segments = 7;
    for (let i = 0; i < segments; i++) {
      const a = x + w * i / segments;
      const b = x + w * (i + 1) / segments;
      const peak = y - h * (.17 + noise(seed + i) * .69);
      ctx.bezierCurveTo(a + w * .017, peak, b - w * .055, peak - h * .1, b, y + h * (.16 + noise(seed + i * 3) * .27));
    }
    for (let i = segments; i > 0; i--) {
      const a = x + w * i / segments;
      const b = x + w * (i - 1) / segments;
      ctx.bezierCurveTo(a - w * .014, y + h * 1.05, b + w * .034, y + h * .8, b, y + h * (.38 + noise(seed + i * 11) * .31));
    }
    ctx.closePath();
  }

  function drawClouds(ctx, opts, foreground) {
    const s = opts.scale;
    const t = Number(opts.time) || 0;
    CLOUD_BANKS.forEach((bank, i) => {
      if (foreground !== (i % 3 === 0)) return;
      const x = (bank.x - opts.camX * bank.p + Math.sin(t * .011 + bank.seed) * 8) * s;
      const y = bank.y * clamp(s, .36, 1.4) - (opts.camY - 1180) * .061 * s;
      const w = bank.w * s, h = bank.h * clamp(s, .4, 1.2);
      if (x > opts.width + 50 || x + w < -50 || y - h > opts.height) return;
      ctx.save();
      cloudPath(ctx, x, y, w, h, bank.seed);
      ctx.clip();
      const gradient = ctx.createLinearGradient(0, y - h, 0, y + h);
      gradient.addColorStop(0, `rgba(115,139,160,${bank.alpha * .44})`);
      gradient.addColorStop(.43, `rgba(41,58,79,${bank.alpha})`);
      gradient.addColorStop(1, `rgba(17,29,46,${bank.alpha * .6})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 2, y - h * 1.3, w + 4, h * 2.7);
      ctx.globalAlpha = .25;
      ctx.beginPath();
      ctx.moveTo(x + w * .05, y + h * .35);
      ctx.bezierCurveTo(x + w * .28, y - h * .19, x + w * .36, y + h * .23, x + w * .63, y + h * .26);
      ctx.bezierCurveTo(x + w * .77, y + h * .17, x + w * .9, y + h * .48, x + w * .98, y + h * .44);
      ctx.strokeStyle = '#879cac';
      ctx.lineWidth = 1.1 * clamp(s, .4, 1.3);
      ctx.stroke();
      ctx.restore();
    });
  }

  function lancet(ctx, x, y, w, h, color) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + w * .7);
    ctx.quadraticCurveTo(x + w * .08, y + w * .2, x + w * .5, y);
    ctx.quadraticCurveTo(x + w * .92, y + w * .2, x + w, y + w * .7);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function distantTower(ctx, x, base, width, height, variant, palette, detail) {
    const top = base - height;
    const shoulder = variant === 2 ? top + 25 : top;
    poly(ctx, [[x,base],[x,shoulder],[x+width*.12,shoulder-7],[x+width*.83,shoulder-7],[x+width,shoulder],[x+width,base]], palette.body);
    poly(ctx, [[x+width*.68,base],[x+width*.68,shoulder],[x+width*.85,shoulder-7],[x+width,shoulder],[x+width,base]], palette.side);
    if (variant === 0 || variant === 2) {
      poly(ctx, [[x-5,shoulder],[x+width*.5,top-42-width*.32],[x+width+5,shoulder]], palette.roof);
      poly(ctx, [[x+width*.5,top-42-width*.32],[x+width*.57,shoulder],[x+width+5,shoulder]], palette.side);
      line(ctx, [[x+width*.5,top-42-width*.32],[x+width*.5,top-49-width*.32]], palette.body, 1.5);
    } else {
      const crenels = Math.max(3, Math.floor(width / 12));
      for (let i = 0; i < crenels; i++) {
        const xx = x + i * width / crenels;
        if (variant === 3 && i === 1) continue;
        ctx.fillStyle = palette.body;
        ctx.fillRect(xx, shoulder - 10 - (i % 2) * 2, width / crenels * .55, 13);
      }
    }
    if (!detail) return;
    for (let row = 0; row < Math.min(4, Math.floor(height / 43)); row++) {
      lancet(ctx, x + width * .24, shoulder + 17 + row * 40, Math.max(3,width * .11), 18, palette.window);
      if (width > 47 && row % 2 === 0) lancet(ctx, x + width * .52, shoulder + 17 + row * 40, width * .095, 18, palette.window);
    }
    line(ctx, [[x+1,base],[x+1,shoulder+9]], palette.edge, 1.05);
  }

  const REMOTE_CASTLES = [
    {x:-390,base:1485,w:440,h:97,type:0,seed:17},
    {x:280,base:1495,w:370,h:73,type:1,seed:52},
    {x:920,base:1470,w:525,h:112,type:2,seed:81},
    {x:1670,base:1560,w:340,h:92,type:3,seed:119},
    {x:2300,base:1450,w:590,h:120,type:0,seed:178},
    {x:3100,base:1490,w:450,h:82,type:1,seed:237},
    {x:3870,base:1505,w:620,h:107,type:2,seed:312},
    {x:4740,base:1520,w:420,h:87,type:3,seed:381},
    {x:5530,base:1440,w:580,h:103,type:1,seed:442},
    {x:6370,base:1515,w:460,h:93,type:0,seed:521},
    {x:7180,base:1475,w:590,h:105,type:2,seed:583},
    {x:8010,base:1500,w:430,h:83,type:3,seed:672}
  ];

  function drawRemoteCastle(ctx, c, opts) {
    const s = opts.scale;
    const x = (c.x - opts.camX * .235) * s;
    const y = (c.base - 1180 - (opts.camY - 1180) * .72) * s;
    if (x + c.w * s < -50 || x > opts.width + 50) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const palette = {body:'#233644',side:'#1e2e3b',roof:'#20313f',window:'#182a35',edge:'#344752'};
    // Individual rock podiums anchor each settlement to slopes; no hanging walls.
    poly(ctx, [[-70,33],[-15,6],[c.w*.12,-4],[c.w*.48,8],[c.w*.79,1],[c.w+40,22],[c.w+111,100],[c.w+160,195],[-90,197]], '#21323d');
    poly(ctx, [[c.w*.38,6],[c.w*.61,78],[c.w+30,113],[c.w+126,183],[c.w+111,100],[c.w+40,22],[c.w*.79,1]], '#1c2b35');
    line(ctx, [[-24,35],[c.w*.21,43],[c.w*.45,66],[c.w*.72,84]], '#2a3b45', 1.4);
    // A low irregular curtain wall connects distinct silhouettes.
    poly(ctx, [[0,10],[0,-c.h*.31],[c.w*.17,-c.h*.34],[c.w*.32,-c.h*.23],[c.w*.46,-c.h*.25],[c.w*.53,-c.h*.48],[c.w*.8,-c.h*.48],[c.w*.87,-c.h*.3],[c.w,-c.h*.34],[c.w,14]], palette.body);
    distantTower(ctx, c.w * .06, 8, 37 + c.type * 5, c.h + 33, c.type % 4, palette, s > .38);
    distantTower(ctx, c.w * .74, 13, 46 + (c.type % 2) * 13, c.h * .89 + 32, (c.type + 1) % 4, palette, s > .38);
    if (c.type === 2 || c.type === 0) distantTower(ctx, c.w * .42, 10, 43, c.h * 1.48, 0, palette, s > .38);
    // Hall, pitched roof, and side chapel: unlike repeated equal-height towers.
    const hx = c.w * .21, hw = c.w * .26, hh = c.h * .58;
    ctx.fillStyle = palette.body;
    ctx.fillRect(hx, -hh, hw, hh + 12);
    poly(ctx, [[hx-6,-hh],[hx+hw*.48,-hh-29],[hx+hw+6,-hh]], palette.roof);
    if (c.type === 1) {
      ctx.fillStyle = palette.body;
      ctx.fillRect(c.w*.56,-c.h*.56,c.w*.15,c.h*.64);
      poly(ctx, [[c.w*.53,-c.h*.56],[c.w*.62,-c.h*.94],[c.w*.74,-c.h*.56]], palette.roof);
    }
    if (s > .4) {
      for (let i = 0; i < 4; i++) lancet(ctx, hx + hw * (.13 + i * .2), -hh + 12, 5, 14, palette.window);
      for (let i = 0; i < 9; i++) {
        const wx = c.w * (.1 + i * .093);
        if (noise(c.seed + i * 5) < .55) continue;
        ctx.fillStyle = '#3c4340';
        ctx.fillRect(wx, -17 - noise(c.seed + i) * 19, 2, 5);
      }
    }
    ctx.restore();
  }

  // Natural branches are tapered irregular quadrilaterals and sparse fine twigs.
  // No foliage balls, V-shaped tree icon rows, or identical periodic spacing.
  function bareTree(ctx, x, y, height, seed, color, detail) {
    const lean = (noise(seed) - .5) * height * .18;
    const trunk = height * .059;
    poly(ctx, [[x-trunk*.52,y],[x-trunk*.18+lean*.4,y-height*.55],[x+lean,y-height],[x+lean+trunk*.2,y-height*.99],[x+trunk*.37+lean*.3,y-height*.53],[x+trunk*.51,y]], color);
    const arms = [
      [-1,.35,.32,.22], [1,.48,.36,.23], [-1,.65,.26,.19],
      [1,.77,.2,.17], [-1,.86,.15,.11]
    ];
    arms.forEach((arm,i) => {
      const by = y - height * arm[1];
      const bx = x + lean * arm[1];
      const side = arm[0];
      const reach = height * arm[2] * (.7 + noise(seed + i * 13) * .5);
      const rise = height * arm[3];
      const elbow = [bx + side * reach * .5, by - rise * .38];
      const tip = [bx + side * reach, by - rise];
      const thickness = trunk * (.41 - i * .056);
      poly(ctx, [[bx,by+thickness],[elbow[0],elbow[1]+thickness*.55],tip,[elbow[0]-side*2,elbow[1]-thickness*.25],[bx,by-thickness*.5]], color);
      if (detail) {
        const tw = Math.max(.6,height * .0047);
        line(ctx, [elbow,[elbow[0]+side*height*.09,elbow[1]-height*.12],[elbow[0]+side*height*.084,elbow[1]-height*.19]], color, tw);
        line(ctx, [[lerp(elbow[0],tip[0],.68),lerp(elbow[1],tip[1],.68)], [tip[0]+side*height*.065,tip[1]-height*.044]], color, tw*.8);
      }
    });
    if (detail) {
      line(ctx, [[x+lean,y-height*.86],[x+lean-height*.06,y-height*1.07],[x+lean-height*.11,y-height*1.12]], color, height*.006);
      line(ctx, [[x+lean,y-height*.91],[x+lean+height*.065,y-height*1.04]], color, height*.006);
    }
  }

  const TREE_GROUPS = [
    [48,1530,118,8],[95,1541,92,17],[169,1515,143,31],[217,1545,87,43],
    [715,1567,107,56],[807,1550,151,69],[876,1558,98,81],
    [1428,1580,91,92],[1486,1574,118,101],[1540,1588,79,114],
    [2119,1555,136,128],[2200,1570,103,141],[2245,1540,89,153],
    [3065,1553,141,167],[3131,1570,93,179],[3249,1545,121,193],
    [4018,1575,122,214],[4087,1590,83,226],[4171,1587,97,238],
    [5418,1560,136,263],[5517,1550,89,276],[5575,1565,122,289],
    [6253,1558,148,303],[6334,1578,91,317],[6461,1550,115,329],
    [7227,1580,121,344],[7291,1570,82,361],[7394,1568,104,376]
  ];

  function drawTreeGroups(ctx, opts) {
    const s = opts.scale;
    TREE_GROUPS.forEach(tree => {
      const x = (tree[0] - opts.camX * .37) * s;
      const y = (tree[1] - 1180 - (opts.camY - 1180) * .81) * s;
      if (x + tree[2] * s < -10 || x - tree[2] * s > opts.width + 10) return;
      bareTree(ctx, x, y, tree[2] * s, tree[3], '#162832', s > .5);
    });
  }

  // Solid landforms around the actual regions: gorge banks, west river terrace,
  // tower footing, chapel escarpment. These are background, never new platforms.
  const CLIFFS = [
    {x0:-130,x1:365,top:1580,bottom:2130,seed:20,profile:[[0,43],[.12,19],[.28,29],[.52,-8],[.69,26],[.9,40],[1,93]]},
    {x0:1130,x1:2770,top:1470,bottom:2210,seed:57,profile:[[0,136],[.11,22],[.22,-23],[.37,5],[.5,-9],[.65,14],[.76,-25],[.91,68],[1,209]]},
    {x0:2750,x1:3480,top:1640,bottom:2250,seed:81,profile:[[0,54],[.15,3],[.36,36],[.59,-17],[.78,29],[1,66]]},
    {x0:3500,x1:4598,top:1590,bottom:2250,seed:119,profile:[[0,48],[.16,12],[.38,36],[.59,-6],[.74,53],[.93,113],[1,266]]},
    {x0:5010,x1:5740,top:1550,bottom:2250,seed:152,profile:[[0,283],[.1,110],[.28,58],[.47,17],[.7,7],[.91,43],[1,96]]},
    {x0:5740,x1:6720,top:1600,bottom:2250,seed:188,profile:[[0,58],[.12,-16],[.3,5],[.48,12],[.66,-10],[.84,40],[1,61]]},
    {x0:6720,x1:8320,top:1580,bottom:2250,seed:219,profile:[[0,89],[.14,17],[.23,34],[.38,-12],[.51,42],[.7,22],[.86,69],[1,114]]}
  ];

  function cliffShape(cliff) {
    const w = cliff.x1 - cliff.x0;
    return cliff.profile.map(p => [cliff.x0 + p[0] * w, cliff.top + p[1]])
      .concat([[cliff.x1 + 60,cliff.bottom], [cliff.x0 - 30,cliff.bottom]]);
  }

  function drawCliff(ctx, cliff, detail) {
    const points = cliffShape(cliff);
    const w = cliff.x1 - cliff.x0;
    ctx.save();
    poly(ctx, points, '#222e35');
    ctx.beginPath();
    ctx.moveTo(points[0][0],points[0][1]);
    points.slice(1).forEach(pt=>ctx.lineTo(pt[0],pt[1]));
    ctx.closePath();
    ctx.clip();
    const base = ctx.createLinearGradient(cliff.x0,cliff.top,cliff.x1*.3+cliff.x0*.7,cliff.bottom);
    base.addColorStop(0,'#344047');
    base.addColorStop(.2,'#2d3a41');
    base.addColorStop(.65,'#202d33');
    base.addColorStop(1,'#17242b');
    ctx.fillStyle = base;
    ctx.fillRect(cliff.x0-80,cliff.top-60,w+180,cliff.bottom-cliff.top+100);
    const panels = Math.max(3,Math.floor(w/170));
    for(let i=0;i<panels;i++) {
      const xx = cliff.x0 + i*w/panels;
      const span = w/panels;
      const tilt = (noise(cliff.seed+i*7)-.4)*70;
      const yy = cliff.top + 22 + noise(cliff.seed+i*11)*100;
      const face = [[xx,yy],[xx+span*.45,yy-33],[xx+span*.98,yy+27],
        [xx+span*.86+tilt,cliff.top+245],[xx+span*.61+tilt,cliff.top+425],
        [xx+span*.25,cliff.bottom+13],[xx-30,cliff.bottom]];
      poly(ctx,face,i%3===0?'#2b373e':(i%3===1?'#1c2a31':'#303c42'));
      if (detail) {
        line(ctx,[[xx+span*.45,yy-33],[xx+span*.38,cliff.top+153],
          [xx+span*.66+tilt,cliff.top+264],[xx+span*.39+tilt,cliff.top+437]],'#18272d',2.3);
        line(ctx,[[xx+span*.45+3,yy-31],[xx+span*.38+3,cliff.top+153],
          [xx+span*.66+tilt+2,cliff.top+264]],'rgba(109,123,124,.15)',1.1);
        for (let seam=0;seam<3;seam++) {
          const sy=cliff.top+117+seam*123+noise(cliff.seed+seam*31+i)*35;
          line(ctx,[[xx-20,sy],[xx+span*.27,sy+14],[xx+span*.49,sy-9],[xx+span*.99,sy+12]],'rgba(8,20,27,.28)',1.3);
        }
      }
    }
    // A few large damp streaks and minerals only in creases.
    if(detail) for(let i=0;i<Math.max(2,panels/2);i++) {
      const xx=cliff.x0+w*noise(cliff.seed+301+i*29);
      const yy=cliff.top+90+noise(cliff.seed+422+i)*170;
      poly(ctx,[[xx,yy],[xx+7,yy-17],[xx+5,yy+170],[xx-10,yy+235],[xx-4,yy+107]],'rgba(13,34,39,.26)');
    }
    ctx.restore();
  }

  function drawRearArcade(ctx, x, y, width, height, count, seed) {
    // Far side of a courtyard, drawn behind traversable geometry. It has no
    // highlighted horizontal coping which could be mistaken for a path.
    ctx.save();
    ctx.fillStyle='#29333a';
    ctx.fillRect(x,y,width,height);
    poly(ctx,[[x,y],[x+width*.19,y-12],[x+width*.34,y-4],[x+width*.57,y-17],[x+width*.78,y-9],[x+width,y+4],[x+width,y+17],[x,y+17]],'#29343b');
    const pitch=width/count;
    for(let i=0;i<count;i++) {
      const ax=x+pitch*i+12;
      const aw=pitch-27;
      if(i===1 && count>5) {
        poly(ctx,[[ax,y+height],[ax-2,y+height*.36],[ax+aw*.22,y+height*.2],[ax+aw*.43,y+height*.32],[ax+aw*.63,y+height*.25],[ax+aw,y+height*.42],[ax+aw,y+height]],'#1d2b34');
      } else {
        lancet(ctx,ax,y+19,aw,height-18,'#1a2932');
        ctx.beginPath();
        ctx.moveTo(ax-4,y+height-1);
        ctx.lineTo(ax-4,y+19+aw*.7);
        ctx.quadraticCurveTo(ax-4,y+30,ax+aw*.5,y+13);
        ctx.quadraticCurveTo(ax+aw+4,y+30,ax+aw+4,y+19+aw*.7);
        ctx.lineTo(ax+aw+4,y+height-1);
        ctx.strokeStyle='#354149';
        ctx.lineWidth=3;
        ctx.stroke();
      }
      const px=x+pitch*i+3;
      poly(ctx,[[px,y+height],[px+4,y+10],[px+10,y+17],[px+18,y+height]],'#253039');
      if (noise(seed+i*7)>.5) line(ctx,[[px+12,y+24],[px+16,y+height*.67]],'#354047',1);
    }
    ctx.restore();
  }

  function drawMidground(ctx, opts) {
    const s=opts.scale;
    const v={x0:opts.camX,y0:opts.camY,x1:opts.camX+opts.width/s,y1:opts.camY+opts.height/s};
    ctx.save();
    ctx.translate(-opts.camX*s,-opts.camY*s);
    ctx.scale(s,s);
    CLIFFS.forEach(c=>{
      if(intersects(v,c.x0-80,c.top-30,c.x1+100,c.bottom)) drawCliff(ctx,c,s>.35);
    });
    if(intersects(v,2780,1460,3480,1790)) drawRearArcade(ctx,2795,1487,670,150,7,37);
    if(intersects(v,5900,1460,6060,1780)) drawRearArcade(ctx,5908,1494,148,124,2,98);
    if(intersects(v,7100,1440,7300,1780)) drawRearArcade(ctx,7120,1470,173,161,2,161);
    // Structural buttress silhouettes belong to the rear faces, not floating piers.
    [[1325,1530,89,370],[2650,1540,80,390],[3480,1490,78,447],[4360,1515,83,420],
      [5135,1510,71,430],[5840,1520,65,423],[6670,1500,73,450],[8100,1560,74,387]].forEach(b=>{
      if(!intersects(v,b[0]-20,b[1]-12,b[0]+b[2]+20,b[1]+b[3]))return;
      poly(ctx,[[b[0],b[1]+b[3]],[b[0]+b[2]*.12,b[1]+67],[b[0]+b[2]*.53,b[1]],
        [b[0]+b[2]*.7,b[1]+124],[b[0]+b[2],b[1]+b[3]]],'#29343a');
      poly(ctx,[[b[0]+b[2]*.53,b[1]],[b[0]+b[2]*.7,b[1]+124],[b[0]+b[2],b[1]+b[3]],
        [b[0]+b[2]*.65,b[1]+b[3]]],'#1d2b32');
      if(s>.5)line(ctx,[[b[0]+b[2]*.13,b[1]+69],[b[0]+b[2]*.52,b[1]+4]],'#3b454a',1);
    });
    ctx.restore();
  }

  function drawBackground(ctx, opts) {
    opts=Object.assign({width:960,height:540,camX:0,camY:1180,scale:1,time:0},opts||{});
    opts.scale=Number(opts.scale)||1;
    ctx.save();
    const sky=ctx.createLinearGradient(0,0,0,opts.height);
    sky.addColorStop(0,'#0d1424');
    sky.addColorStop(.43,'#1b2b40');
    sky.addColorStop(.79,'#35485a');
    sky.addColorStop(1,'#2b3e4d');
    ctx.fillStyle=sky;
    ctx.fillRect(0,0,opts.width,opts.height);
    // Few restrained stars, stable in their own very distant parallax plane.
    if(opts.scale>.3)for(let i=0;i<67;i++){
      const x=(noise(i*19+32)*3600-opts.camX*.012)*opts.scale;
      const y=(noise(i*7+81)*190+7)*clamp(opts.scale,.35,1.5)-(opts.camY-1180)*.035*opts.scale;
      if(x<0||x>opts.width||y<0||y>opts.height*.62)continue;
      ctx.fillStyle=`rgba(180,200,212,${.1+noise(i+25)*.24})`;
      ctx.fillRect(x,y,noise(i+108)>.9?1.4: .7, .8);
    }
    drawMoon(ctx,opts);
    drawClouds(ctx,opts,false);
    RIDGES.forEach(r=>drawRidge(ctx,r,opts,opts.width,opts.height));
    REMOTE_CASTLES.forEach(c=>drawRemoteCastle(ctx,c,opts));
    drawTreeGroups(ctx,opts);
    drawClouds(ctx,opts,true);
    drawMidground(ctx,opts);
    // At/below the actual subterranean boundary no sky survives, even before
    // room backwalls are drawn. The transition is a rock lip, not black fog.
    const rockY=(1720-opts.camY)*opts.scale;
    const fullY=(1780-opts.camY)*opts.scale;
    if(fullY<opts.height){
      const fade=ctx.createLinearGradient(0,rockY,0,fullY);
      fade.addColorStop(0,'rgba(20,29,35,0)');
      fade.addColorStop(1,'rgba(20,29,35,1)');
      ctx.fillStyle=fade;
      ctx.fillRect(0,Math.max(0,rockY),opts.width,Math.max(0,fullY-Math.max(0,rockY)));
      ctx.fillStyle='#141d23';
      ctx.fillRect(0,Math.max(0,fullY),opts.width,Math.max(0,opts.height-Math.max(0,fullY)));
    }
    ctx.restore();
  }

  // Non-tiled sediment and tectonic blocks. Large spans have hand-directed
  // fracture relationships; secondary marks are concentrated near the fracture.
  const GEO_FAULTS = [
    [[-70,1758],[180,1777],[297,1838],[404,1852],[488,1971],[693,2055],[737,2240]],
    [[513,1731],[694,1804],[767,1903],[990,1959],[1043,2118],[1160,2270]],
    [[1328,1725],[1479,1831],[1530,1861],[1644,2051],[1711,2112],[1790,2240]],
    [[2252,1734],[2137,1854],[2248,1920],[2256,2051],[2376,2121],[2311,2250]],
    [[2737,1720],[2840,1821],[2774,1903],[2912,2017],[2970,2218]],
    [[3420,1720],[3528,1765],[3460,1882],[3660,2030],[3618,2164],[3742,2280]],
    [[4156,1723],[4065,1865],[4180,1965],[4301,2043],[4226,2208]],
    [[4602,1720],[4751,1800],[4776,1922],[4900,2007],[4862,2180],[4950,2260]],
    [[5342,1720],[5400,1786],[5540,1856],[5473,2010],[5650,2120],[5699,2270]],
    [[6190,1720],[6030,1820],[6129,1890],[6080,2020],[6220,2200]],
    [[6693,1721],[6815,1827],[6750,1941],[6912,2044],[6868,2193],[6950,2290]],
    [[7390,1720],[7511,1860],[7425,1930],[7600,2102],[7681,2230]],
    [[8094,1720],[8000,1840],[8130,1940],[8080,2050],[8195,2210]]
  ];

  function drawUnderground(ctx, data, view) {
    const v=viewBounds(view);
    const worldW=data&&data.world ? data.world.w : 8200;
    const worldH=data&&data.world ? data.world.h : 2240;
    if(v.y1<1720)return;
    const x0=Math.max(-120,v.x0-80),x1=Math.min(worldW+120,v.x1+80);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0,1720,x1-x0,worldH-1720+180);
    ctx.clip();
    const rock=ctx.createLinearGradient(0,1720,0,worldH+100);
    rock.addColorStop(0,'#2c353b');
    rock.addColorStop(.42,'#242d32');
    rock.addColorStop(1,'#171f26');
    ctx.fillStyle=rock;
    ctx.fillRect(x0,1720,x1-x0,worldH-1720+180);
    const first=Math.floor(x0/410)-1,last=Math.ceil(x1/410)+1;
    for(let i=first;i<=last;i++){
      const seed=i+120;
      const x=i*410-92+noise(seed*17)*84;
      const y=1740+noise(seed*7)*130;
      const w=350+noise(seed*29)*210;
      const depth=220+noise(seed*13)*175;
      const face=[[x,y+15],[x+w*.26,y-29],[x+w*.72,y-4],[x+w,y+49],
        [x+w*.91,y+depth*.67],[x+w*.69,y+depth],[x+w*.3,y+depth*.89],[x-43,y+depth*.36]];
      poly(ctx,face,i%3===0?'#30383c':i%3===1?'#252f35':'#283137');
      poly(ctx,[[x+w*.26,y-29],[x+w*.72,y-4],[x+w*.67,y+depth*.24],
        [x+w*.23,y+depth*.32],[x-12,y+depth*.11]],'rgba(90,98,96,.105)');
      poly(ctx,[[x+w*.69,y+depth],[x+w*.9,y+depth*.65],[x+w,y+49],[x+w+44,y+depth+79],
        [x+w*.71,y+depth+154],[x+w*.26,y+depth+116],[x+w*.3,y+depth*.89]],'#1e272d');
      if(v.scale>.32){
        const strataY=y+88;
        line(ctx,[[x-27,strataY],[x+w*.23,strataY-21],[x+w*.45,strataY-10],[x+w*.76,strataY-29],[x+w*.95,strataY-6]],'rgba(121,127,113,.12)',1.4);
        line(ctx,[[x-15,strataY+8],[x+w*.23,strataY-13],[x+w*.42,strataY-1],[x+w*.63,strataY-19]],'rgba(10,21,27,.35)',1.2);
        line(ctx,[[x+w*.19,y+depth*.62],[x+w*.46,y+depth*.72],[x+w*.69,y+depth*.65],[x+w*.9,y+depth*.68]],'rgba(93,104,102,.12)',1.7);
        // Broad calcite stain in one fracture, not confetti flecks.
        if(i%4===1)poly(ctx,[[x+w*.7,y+35],[x+w*.71,y+91],[x+w*.67,y+158],[x+w*.7,y+216],
          [x+w*.65,y+232],[x+w*.65,y+165],[x+w*.69,y+89],[x+w*.67,y+39]],'rgba(125,131,113,.14)');
      }
    }
    GEO_FAULTS.forEach((points,i)=>{
      const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
      if(maxX<v.x0-30||minX>v.x1+30)return;
      line(ctx,points,'rgba(9,19,25,.62)',3.5+(i%3)*.6);
      if(v.scale>.4){
        line(ctx,points.map(p=>[p[0]+3,p[1]-2]),'rgba(87,101,103,.19)',1.2);
        const branch=points[2],side=i%2?1:-1;
        line(ctx,[branch,[branch[0]+side*67,branch[1]+21],[branch[0]+side*145,branch[1]-7]],'rgba(8,20,27,.43)',2.1);
        line(ctx,[points[3],[points[3][0]-side*44,points[3][1]+59],[points[3][0]-side*91,points[3][1]+71]],'rgba(8,20,27,.36)',1.6);
      }
    });
    // Local wet rock patches in river/crypt/old-wing strata.
    [[190,1814,251,89],[1200,2025,292,102],[2910,2067,192,87],[4650,1860,241,91],[6800,2050,356,101],[7940,2020,255,96]].forEach(p=>{
      if(!intersects(v,p[0]-p[2],p[1]-p[3],p[0]+p[2],p[1]+p[3]))return;
      const damp=ctx.createRadialGradient(p[0],p[1],4,p[0],p[1],p[2]);
      damp.addColorStop(0,'rgba(18,43,47,.23)');
      damp.addColorStop(1,'rgba(18,43,47,0)');
      ctx.fillStyle=damp;
      ctx.fillRect(p[0]-p[2],p[1]-p[3],p[2]*2,p[3]*2);
    });
    ctx.restore();
  }

  function drawCaveRoom(ctx,room) {
    if(!room)return;
    const x=Number(room.x0),y=Number(room.top);
    const w=Number(room.x1)-x,h=Number(room.floor)-y;
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
    let seed=0;
    String(room.id||'cave').split('').forEach(c=>{seed=(seed*31+c.charCodeAt(0))>>>0;});
    const water=/POOL|WATER|DRAIN/.test(String(room.id));
    const cold=water?['#283b41','#25353b','#1b2931']:['#344046','#29353d','#1b2730'];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x,y,w,h);
    ctx.clip();
    // Completely opaque backing. The shape underneath can never reveal sky.
    const wall=ctx.createLinearGradient(x,y,x+w*.84,y+h);
    wall.addColorStop(0,cold[0]);
    wall.addColorStop(.49,cold[1]);
    wall.addColorStop(1,cold[2]);
    ctx.fillStyle=wall;
    ctx.fillRect(x,y,w,h);
    const P=points=>points.map(p=>[x+p[0]*w,y+p[1]*h]);
    const faces=[
      {p:[[-.07,.05],[.19,-.06],[.34,.15],[.29,.43],[.13,.52],[-.04,.35]],c:water?'#2c3c41':'#39444a'},
      {p:[[.19,-.06],[.62,-.02],[.69,.17],[.48,.36],[.34,.15]],c:water?'#26373e':'#303e45'},
      {p:[[.69,-.03],[1.08,.04],[1.01,.52],[.78,.49],[.64,.29]],c:'#243139'},
      {p:[[-.06,.42],[.13,.52],[.27,.45],[.35,.67],[.23,.98],[-.06,1.04]],c:water?'#223239':'#2a363d'},
      {p:[[.29,.43],[.48,.36],[.63,.49],[.66,.79],[.44,.91],[.35,.67]],c:water?'#2b3b40':'#344048'},
      {p:[[.78,.49],[1.05,.54],[1.1,.96],[.83,1.09],[.67,.81],[.63,.49]],c:'#1f2c33'},
      {p:[[.23,.98],[.35,.67],[.44,.91],[.72,1.12],[.12,1.12]],c:'#1c2931'}
    ];
    faces.forEach((face,i)=>{
      poly(ctx,P(face.p),face.c);
      // A restrained lit face is embedded in the rock plane, never a floor strip.
      if(i===0||i===4){
        const a=face.p[0],b=face.p[1],c=face.p[2];
        poly(ctx,P([a,b,[c[0]-.045,c[1]-.08],[a[0]+.045,a[1]+.07]]),'rgba(119,131,129,.07)');
      }
    });
    const fault=P([[.035,.05],[.21,.22],[.29,.43],[.35,.67],[.57,.78],[.73,1.05]]);
    line(ctx,fault,'rgba(9,20,27,.72)',3.2);
    line(ctx,fault.map(p=>[p[0]+2.7,p[1]-1.4]),'rgba(122,139,138,.2)',1.05);
    const branch=P([[.29,.43],[.49,.37],[.63,.49],[.78,.49],[1.03,.65]]);
    line(ctx,branch,'rgba(10,21,28,.56)',2.2);
    line(ctx,P([[.63,.49],[.66,.79],[.84,1.04]]),'rgba(10,21,27,.52)',2.6);
    line(ctx,P([[.21,.22],[.14,.28],[.08,.42],[-.02,.45]]),'rgba(10,22,28,.4)',1.3);
    // Long low-contrast bedding marks follow the principal rock slope. No tiled
    // rows, regular polygon grid, bright ledges, or evenly spaced hanging teeth.
    for(let i=0;i<5;i++){
      const xx=.08+noise(seed+i*17)*.66;
      const yy=.23+noise(seed+i*31)*.59;
      const dx=.08+noise(seed+i*47)*.15;
      line(ctx,P([[xx,yy],[xx+dx*.5,yy-.052],[xx+dx,yy-.038]]),
        i%2?'rgba(114,129,124,.1)':'rgba(7,20,27,.26)',i%2?1.1:1.6);
    }
    // Two broad overhang lobes explain a natural vault, rather than a row of
    // spikes. They remain inside the original room, without changing headroom.
    const overhang=ctx.createLinearGradient(0,y,0,y+h*.33);
    overhang.addColorStop(0,'rgba(8,18,25,.78)');
    overhang.addColorStop(.6,'rgba(10,21,28,.55)');
    overhang.addColorStop(1,'rgba(11,22,29,0)');
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+w,y);
    ctx.lineTo(x+w,y+h*.19);
    ctx.bezierCurveTo(x+w*.82,y+h*.11,x+w*.81,y+h*.3,x+w*.64,y+h*.17);
    ctx.bezierCurveTo(x+w*.54,y+h*.08,x+w*.35,y+h*.21,x+w*.25,y+h*.15);
    ctx.bezierCurveTo(x+w*.15,y+h*.18,x+w*.09,y+h*.31,x,y+h*.23);
    ctx.closePath();
    ctx.fillStyle=overhang;
    ctx.fill();
    const recess=ctx.createRadialGradient(x+w*.81,y+h*.44,3,x+w*.81,y+h*.44,Math.min(w*.27,h*.68));
    recess.addColorStop(0,'rgba(6,17,24,.29)');
    recess.addColorStop(1,'rgba(6,17,24,0)');
    ctx.fillStyle=recess;
    ctx.fillRect(x+w*.44,y+h*.1,w*.57,h*.8);
    // Damp specular edges exist only on two sloping cracks.
    line(ctx,P([[.292,.46],[.313,.54],[.353,.66]]),'rgba(139,172,175,.24)',.85);
    line(ctx,P([[.64,.51],[.65,.64],[.668,.77]]),'rgba(116,155,165,.16)',.85);
    if(water){
      const wet=ctx.createLinearGradient(0,y+h*.62,0,y+h);
      wet.addColorStop(0,'rgba(17,42,47,0)');
      wet.addColorStop(1,'rgba(14,38,45,.3)');
      ctx.fillStyle=wet;
      ctx.fillRect(x,y+h*.62,w,h*.38);
    }
    ctx.restore();
  }

  function drawWaterRoom(ctx,room) {
    if(!room||/DRAIN/.test(String(room.id))||!/CISTERN|DEEP/.test(String(room.id)))return false;
    const x=Number(room.x0),y=Number(room.top);
    const w=Number(room.x1)-x,h=Number(room.floor)-y;
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
    const large=w>360;
    let seed=0;
    String(room.id).split('').forEach(c=>{seed=(seed*31+c.charCodeAt(0))>>>0;});
    ctx.save();
    ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    // Artificial reservoir backing: dressed masonry instead of natural cave
    // facets. All water stays on this rear plane; the actual floor is untouched.
    const base=ctx.createLinearGradient(0,y,0,room.floor);
    base.addColorStop(0,'#28363c');base.addColorStop(.55,'#2d3d40');base.addColorStop(1,'#1a3036');
    ctx.fillStyle=base;ctx.fillRect(x,y,w,h);
    const rows=[31,35,28,36,32,38];
    let yy=y-9,row=0;
    while(yy<room.floor){
      const rh=rows[row%rows.length];
      let xx=x-25+(row%2)*32,col=0;
      while(xx<x+w){
        const bw=55+noise(seed+row*31+col*17)*42;
        const tone=noise(seed+row*47+col*13);
        const color=tone>.67?'#3a494b':tone>.3?'#344449':'#303f43';
        poly(ctx,[[xx+1,yy+2],[xx+bw-3,yy+1],[xx+bw-1,yy+rh-3],[xx+2,yy+rh-1]],color);
        line(ctx,[[xx+4,yy+3],[xx+bw-6,yy+2]],'rgba(135,149,138,.16)',1);
        line(ctx,[[xx+bw-2,yy+3],[xx+bw-1,yy+rh-4]],'rgba(12,28,34,.46)',1.5);
        xx+=bw;col++;
      }
      yy+=rh;row++;
    }
    // Built-in corner quoins and low stone basin walls read as construction,
    // with no bright coping line that could masquerade as a playable ledge.
    for(const px of [x+4,x+w-17]){
      ctx.fillStyle='#37484b';ctx.fillRect(px,y+7,13,h-17);
      line(ctx,[[px+3,y+10],[px+3,room.floor-13]],'#52605b',1.1);
      for(let sy=y+24;sy<room.floor-17;sy+=34)line(ctx,[[px+1,sy],[px+12,sy]],'#1d323a',1.1);
    }
    const damp=ctx.createLinearGradient(0,room.floor-71,0,room.floor-8);
    damp.addColorStop(0,'rgba(18,50,48,0)');damp.addColorStop(.35,'rgba(16,47,45,.28)');damp.addColorStop(1,'rgba(13,40,44,.49)');
    ctx.fillStyle=damp;ctx.fillRect(x,room.floor-71,w,65);
    const mouths=large?[x+w*.19,x+w*.76]:[x+w*.58];
    mouths.forEach((cx,i)=>{
      const cy=y+h*.4+(i%2)*8;
      const rw=large?39:29,rh=large?35:30;
      // Recessed stone drain, with an unmistakable small iron grate. This is
      // infrastructure, not a doorway or traversable dark hole.
      poly(ctx,[[cx-rw*.67,cy-rh*.2],[cx-rw*.5,cy-rh*.7],[cx,cy-rh*.93],
        [cx+rw*.52,cy-rh*.68],[cx+rw*.68,cy-rh*.17],[cx+rw*.6,cy+rh*.47],[cx-rw*.61,cy+rh*.47]],'#69776e');
      poly(ctx,[[cx-rw*.5,cy-rh*.16],[cx-rw*.4,cy-rh*.53],[cx,cy-rh*.72],
        [cx+rw*.4,cy-rh*.53],[cx+rw*.5,cy-rh*.16],[cx+rw*.49,cy+rh*.29],[cx-rw*.5,cy+rh*.29]],'#152931');
      const frameTop=cy-rh*.66,frameBottom=cy+rh*.27;
      for(let j=-2;j<=2;j++){
        const gx=cx+j*rw*.15;
        const top=frameTop+Math.abs(j)*rh*.12;
        line(ctx,[[gx,top],[gx,frameBottom]],'#4f6868',1.65);
        line(ctx,[[gx+.45,top+2],[gx+.45,frameBottom-3]],'#809089',.45);
      }
      line(ctx,[[cx-rw*.43,cy],[cx+rw*.43,cy]],'#405b5f',1.4);
      line(ctx,[[cx-rw*.58,cy+rh*.41],[cx+rw*.56,cy+rh*.39]],'#344e52',1.3);
      // One muted calcite trace descends from each outlet to the rear basin.
      const end=room.floor-13;
      const wet=ctx.createLinearGradient(0,cy+10,0,end);
      wet.addColorStop(0,'rgba(137,159,142,.18)');wet.addColorStop(.42,'rgba(98,133,119,.12)');wet.addColorStop(1,'rgba(38,80,75,.06)');
      ctx.fillStyle=wet;
      ctx.beginPath();ctx.moveTo(cx-7,cy+rh*.41);ctx.lineTo(cx+8,cy+rh*.39);
      ctx.lineTo(cx+13,end);ctx.lineTo(cx-9,end-5);ctx.lineTo(cx-5,cy+38);ctx.closePath();ctx.fill();
      line(ctx,[[cx+1,cy+rh*.43],[cx+2,cy+40],[cx,end-2]],'rgba(159,185,177,.15)',.65);
    });
    // Former water levels stain only the back wall, in discontinuous traces.
    const tideY=room.floor-43;
    const sections=large?5:2;
    for(let i=0;i<sections;i++){
      const sx=x+18+(w-37)*i/sections;
      const span=(w-37)/sections*(.56+noise(seed+i*13)*.22);
      const ty=tideY+noise(seed+i*31)*8;
      line(ctx,[[sx,ty],[sx+span*.42,ty-1.1],[sx+span*.7,ty+1],[sx+span,ty]],'rgba(112,138,113,.16)',1.4);
      line(ctx,[[sx+3,ty+3],[sx+span*.67,ty+4]],'rgba(13,43,41,.29)',1.7);
    }
    // A shallow rear channel only, 10px high and inset from the real walk floor.
    // Water never occupies the full room or conceals any collision surface.
    const poolX=x+19,poolW=Math.max(1,w-38),waterY=room.floor-14;
    const channel=ctx.createLinearGradient(0,waterY,0,waterY+10);
    channel.addColorStop(0,'#294a50');channel.addColorStop(.33,'#203c44');channel.addColorStop(1,'#193139');
    ctx.fillStyle=channel;ctx.fillRect(poolX,waterY,poolW,10);
    const glints=large?11:4;
    for(let i=0;i<glints;i++){
      const gx=poolX+poolW*noise(seed+i*29);
      const gy=waterY+2+noise(seed+i*47)*5;
      const len=6+noise(seed+i*19)*17;
      line(ctx,[[gx-len*.5,gy],[gx+len*.5,gy-.55]],'rgba(139,170,168,.23)',.65);
    }
    mouths.forEach(cx=>{
      poly(ctx,[[cx-8,waterY],[cx+9,waterY],[cx+4,waterY+4],[cx+11,waterY+7],[cx-4,waterY+7],[cx-10,waterY+4]],'rgba(10,31,38,.43)');
      line(ctx,[[cx-5,waterY+3],[cx+6,waterY+3]],'rgba(121,160,157,.17)',.55);
    });
    const ceiling=ctx.createLinearGradient(0,y,0,y+40);
    ceiling.addColorStop(0,'rgba(8,20,28,.56)');ceiling.addColorStop(1,'rgba(8,20,28,0)');
    ctx.fillStyle=ceiling;ctx.fillRect(x,y,w,40);
    ctx.restore();
    return true;
  }

  function isExterior(data,x,y) {
    if(y>=1720)return false;
    const patches=data.groundSkyPatches||[];
    const levels=data.levels||{};
    if(patches.some(p=>x>=p.x0&&x<=p.x1&&y<(levels[p.groundLevel]||1620)))return true;
    const open=(data.openSpaces||[]).some(o=>o.sky&&x>=o.x0&&x<=o.x1&&y<(levels[o.floor]||1620));
    if(!open)return false;
    return !(data.volumes||[]).some(b=>x>b.x0&&x<b.x1&&y>b.top&&y<b.base);
  }

  function lightHalo(ctx, light, t, index) {
    const type=String(light.type||'torch').toLowerCase();
    const radius=Math.max(12,Number(light.radius)||75);
    const phase=Number(light.phase)||noise(index*37+31)*TAU;
    const flicker=.94+.035*Math.sin(t*5.2+phase)+.019*Math.sin(t*11.4+phase*2.7);
    const r=radius*flicker;
    const cold=/moon|blue|cold|window/.test(type);
    const g=ctx.createRadialGradient(light.x,light.y,0,light.x,light.y,r);
    if(cold){
      g.addColorStop(0,'rgba(159,187,202,.17)');
      g.addColorStop(.25,'rgba(109,157,189,.1)');
      g.addColorStop(1,'rgba(88,128,158,0)');
    }else{
      g.addColorStop(0,'rgba(237,182,93,.21)');
      g.addColorStop(.17,'rgba(214,132,59,.13)');
      g.addColorStop(.5,'rgba(171,90,43,.045)');
      g.addColorStop(1,'rgba(126,65,39,0)');
    }
    ctx.fillStyle=g;
    ctx.fillRect(light.x-r,light.y-r,r*2,r*2);
    if(cold||/lantern|lamp|window/.test(type))return;
    const len=/forge|brazier/.test(type)?14:/candle/.test(type)?6:10;
    const sway=Math.sin(t*4.5+phase)*1.3+Math.sin(t*8.3+phase*.7)*.5;
    const x=light.x,y=light.y;
    ctx.beginPath();
    ctx.moveTo(x-3.2,y+3);
    ctx.bezierCurveTo(x-5,y-len*.3,x+sway-2,y-len*.85,x+sway+1,y-len);
    ctx.bezierCurveTo(x+sway+2,y-len*.45,x+5,y-2,x+2.8,y+3);
    ctx.closePath();
    ctx.fillStyle='#c27839';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x-1.5,y+2);
    ctx.quadraticCurveTo(x-2,y-len*.32,x+sway*.7,y-len*.69);
    ctx.quadraticCurveTo(x+2.5,y-len*.26,x+1.4,y+2);
    ctx.closePath();
    ctx.fillStyle='#e8b563';
    ctx.fill();
    ellipse(ctx,x,y+.5,1,2.3,'#f3dc9e');
    if(/forge|brazier|torch/.test(type))for(let i=0;i<2;i++){
      const u=frac(t*(.19+i*.027)+phase*.18+i*.5);
      const xx=x+Math.sin(u*5+phase+i)*3;
      const yy=y-5-u*21;
      ctx.globalAlpha=(1-u)*.35;
      ctx.fillStyle='#d8974a';
      ctx.fillRect(xx,yy,.8,1.3);
    }
    ctx.globalAlpha=1;
  }

  const MIST_POOLS=[
    {x:2740,y:1616,w:407,h:20,seed:51,underground:false},
    {x:5915,y:1615,w:130,h:14,seed:84,underground:false},
    {x:7128,y:1614,w:152,h:18,seed:122,underground:false},
    {x:22,y:1770,w:303,h:13,seed:159,underground:true},
    {x:4480,y:1770,w:485,h:21,seed:207,underground:true},
    {x:6780,y:1941,w:522,h:16,seed:264,underground:true},
    {x:7650,y:1939,w:447,h:13,seed:307,underground:true}
  ];

  function drawMistPool(ctx,p,t) {
    const drift=Math.sin(t*.075+p.seed)*8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x,p.y-p.h*1.9,p.w,p.h*2);
    ctx.clip();
    const g=ctx.createLinearGradient(0,p.y-p.h*1.8,0,p.y+1);
    g.addColorStop(0,'rgba(120,154,164,0)');
    g.addColorStop(.58,'rgba(93,123,134,.043)');
    g.addColorStop(1,'rgba(106,145,152,.015)');
    ctx.fillStyle=g;
    ctx.fillRect(p.x,p.y-p.h*1.8,p.w,p.h*2);
    for(let i=0;i<3;i++){
      const xx=p.x+p.w*(.17+i*.3)+drift*Math.cos(i+1);
      const yy=p.y-p.h*(.58+.23*Math.sin(t*.12+i+p.seed));
      ellipse(ctx,xx,yy,p.w*(.23-i*.03),p.h*.32,'rgba(109,145,154,.032)');
    }
    ctx.restore();
  }

  // Authored damp ceilings; drops are attached to an actual room/rock location.
  const DRIP_SOURCES=[
    {x:917,y:1664,bottom:1774,room:'WG_DRAIN',phase:.13},
    {x:1171,y:1831,bottom:1940,room:'WG_POOL',phase:.44},
    {x:1607,y:1814,bottom:1945,room:'WK_DEEP',phase:.73},
    {x:3043,y:1670,bottom:1773,room:'CT_CELLAR',phase:.28},
    {x:4698,y:1644,bottom:1767,room:'CG_CAVE',phase:.82},
    {x:4831,y:1690,bottom:1767,room:'CG_CAVE',phase:.37},
    {x:6884,y:1820,bottom:1942,room:'EW_CISTERN',phase:.54},
    {x:7781,y:1826,bottom:1938,room:'EW_DRAIN',phase:.1},
    {x:8050,y:1840,bottom:1938,room:'EW_DRAIN',phase:.67}
  ];

  function drawDrips(ctx,data,v,t) {
    const rooms=data.rooms||[];
    DRIP_SOURCES.forEach((source,i)=>{
      if(!intersects(v,source.x-18,source.y-2,source.x+18,source.bottom+3))return;
      const room=rooms.find(r=>r.id===source.room);
      if(!room)return;
      // Clip every drop to the existing room; no moving light outside its shell.
      const top=Math.max(room.top+9,source.y),bottom=Math.min(room.floor-6,source.bottom);
      if(bottom<=top+12)return;
      const u=frac(t*.31+source.phase);
      if(u<.72){
        const fall=clamp((u-.08)/.64,0,1);
        const yy=top+(bottom-top)*fall*fall;
        ctx.strokeStyle='rgba(126,167,180,.34)';
        ctx.lineWidth=.85;
        ctx.beginPath();
        ctx.moveTo(source.x,yy-1.5-fall*3);
        ctx.lineTo(source.x,yy);
        ctx.stroke();
      }else{
        const age=(u-.72)/.28;
        ctx.beginPath();
        ctx.ellipse(source.x,bottom,2+age*10,.5+age*1.5,0,0,TAU);
        ctx.strokeStyle=`rgba(122,162,174,${(1-age)*.25})`;
        ctx.lineWidth=.65;
        ctx.stroke();
      }
      if(v.scale>.55){
        const form=frac(t*.31+source.phase+.22);
        ellipse(ctx,source.x,top-2,1.2,1.8+form*.7,'rgba(144,178,184,.26)');
      }
    });
  }

  function drawRain(ctx,data,v,t) {
    if(v.y0>=1720||v.scale<.4)return;
    const patches=data.groundSkyPatches||[];
    patches.forEach((patch,p)=>{
      const floor=(data.levels||{})[patch.groundLevel]||1620;
      if(!intersects(v,patch.x0,980,patch.x1,floor-6))return;
      const count=7;
      for(let i=0;i<count;i++){
        const phase=noise(p*89+i*19+42);
        const u=frac(t*(.39+noise(i*9+31)*.17)+phase);
        const x=lerp(patch.x0+10,patch.x1-7,noise(i*13+p*61+8))-u*9;
        const y=1040+u*(floor-1050);
        if(!isExterior(data,x,y)||y< v.y0-12||y>v.y1+12)continue;
        line(ctx,[[x+1.8,y-9],[x,y]],'rgba(160,185,197,.12)',.7);
      }
    });
  }

  function drawWaterRipples(ctx,v,t) {
    const pools=[{x0:20,x1:310,y:1782,s:43},{x0:4528,x1:4948,y:1782,s:91},
      {x0:6740,x1:7530,y:1953,s:151},{x0:7660,x1:8170,y:1953,s:208}];
    pools.forEach((p,j)=>{
      if(!intersects(v,p.x0,p.y-7,p.x1,p.y+10))return;
      for(let i=0;i<7;i++){
        const u=frac(t*.045+noise(p.s+i*11));
        const xx=lerp(p.x0+14,p.x1-14,noise(p.s+i*37));
        const yy=p.y+3+noise(p.s+i*17)*5;
        const length=7+noise(p.s+i*7)*17;
        const fade=Math.sin(u*Math.PI)*.11;
        line(ctx,[[xx-length*.5,yy],[xx+length*.5,yy-1]],`rgba(135,167,173,${fade})`,.75);
      }
    });
  }

  function drawEffects(ctx,data,view,time,lights) {
    data=data||{};
    const v=viewBounds(view);
    const t=Number(time)||0;
    ctx.save();
    // Source-bearing warm light is deliberately weaker than the physical edges.
    (lights||[]).forEach((light,i)=>{
      const radius=Number(light.radius)||75;
      if(!Number.isFinite(light.x)||!Number.isFinite(light.y))return;
      if(!intersects(v,light.x-radius,light.y-radius,light.x+radius,light.y+radius))return;
      ctx.save();
      if(light.roomId){
        const room=(data.rooms||[]).find(r=>r.id===light.roomId);
        if(!room){ctx.restore();return;}
        ctx.beginPath();
        ctx.rect(room.x0,room.top,room.x1-room.x0,room.floor-room.top);
        ctx.clip();
      }
      lightHalo(ctx,light,t,i);
      ctx.restore();
    });
    MIST_POOLS.forEach(p=>{
      if(intersects(v,p.x,p.y-p.h*2,p.x+p.w,p.y+2))drawMistPool(ctx,p,t);
    });
    drawDrips(ctx,data,v,t);
    drawRain(ctx,data,v,t);
    drawWaterRipples(ctx,v,t);
    ctx.restore();
  }

  global.CastleArtEnvironment=Object.freeze({drawBackground,drawUnderground,drawCaveRoom,drawWaterRoom,drawEffects});
})(window);
