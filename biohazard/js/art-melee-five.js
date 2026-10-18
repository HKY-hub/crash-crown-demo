// Remaining five photo-referenced melee models. Static silhouettes only.
const MeleeFiveArt = (() => {
  const makeModel = MeleeSixArt.makeModel;
  const C = {
    steel: '#68737b', light: '#bdc6cb', darkSteel: '#3b454c',
    black: '#30343a', blackHi: '#515960', brass: '#9a8561',
    blue: '#20647d', blueHi: '#4b9cb4', fantasy: '#263039',
  };
  const specs = {};

  function tangdao() {
    const s = makeModel();
    s.rect(C.black, 1, -1, 7, 3);
    s.rect(C.blackHi, 1, -1, 7, 1);
    s.rect(C.steel, 0, -1, 1, 3);
    s.rect(C.brass, 8, -3, 1, 7);
    s.polygon(C.steel, [[9, -2], [22, -2], [26, -1], [28, 0], [26, 1], [9, 1]]);
    s.stroke(C.light, [[10, 1], [23, 1], [27, 0], [28, 0]], 0.55);
    s.rect(C.darkSteel, 10, -2, 12, 1);
    for (const x of [2, 4, 6]) s.detail(x, 0, C.brass);
    specs.tangdao = { art: s,
      layout: { len: 28, muzzle: [28, 0], grip: [4, 0], fore: [7, 0], stock: [0, 0] },
      features: ['long narrow gently curved sword blade', 'small separate guard', 'long black wrapped grip'] };
  }

  function springknife() {
    const s = makeModel();
    s.polygon(C.black, [[0, -2], [8, -2], [10, -1], [10, 2], [8, 2], [0, 2]]);
    s.rect(C.blackHi, 2, -2, 6, 1);
    s.rect(C.steel, 0, -2, 2, 4);
    s.rect(C.steel, 9, -2, 2, 4);
    s.rect(C.light, 10, -3, 1, 6);
    s.polygon(C.steel, [[11, -1], [17, -1], [20, 0], [17, 1], [11, 1]]);
    s.stroke(C.light, [[12, 0], [17, 0], [20, 0]], 0.55);
    for (const x of [3, 6, 8]) s.detail(x, 1, C.steel);
    specs.springknife = { art: s,
      layout: { len: 20, muzzle: [20, 0], grip: [5, 0], fore: null, stock: [0, 0] },
      features: ['thick handle longer than blade', 'short pointed steel blade', 'small hinge and guard'] };
  }

  function butterfly() {
    const s = makeModel();
    s.rect(C.darkSteel, 0, -4, 12, 2);
    s.rect(C.steel, 0, 2, 12, 2);
    s.rect(C.light, 1, -4, 10, 1);
    s.rect(C.darkSteel, 1, 3, 10, 1);
    s.rect(C.steel, 11, -2, 2, 5);
    s.polygon(C.steel, [[13, -1], [19, -1], [23, 0], [19, 1], [13, 1]]);
    s.stroke(C.light, [[13, 0], [19, 0], [23, 0]], 0.55);
    s.detail(3, -3, C.black); s.detail(7, -3, C.black); s.detail(10, -3, C.black);
    s.detail(3, 2, C.black); s.detail(7, 2, C.black); s.detail(10, 2, C.black);
    specs.butterfly = { art: s,
      layout: { len: 23, muzzle: [23, 0], grip: [6, 2], fore: null, stock: [0, 0] },
      features: ['two separate parallel handle arms', 'visible continuous gap', 'short hinged blade'] };
  }

  function wrench() {
    const s = makeModel();
    s.polygon(C.steel, [[4, -2], [19, -2], [22, -1], [22, 1], [19, 2], [4, 2]]);
    s.rect(C.light, 5, -2, 14, 1);
    s.ellipse(C.steel, 3, 0, 3, 3);
    s.ellipse(null, 3, 0, 1.35, 1.35, true);
    s.polygon(C.steel, [[19, -3], [22, -5], [27, -6], [29, -6], [30, -5], [29, -4], [26, -3], [24, -1], [22, 1], [19, 1]]);
    s.polygon(C.darkSteel, [[20, 1], [23, 3], [27, 4], [29, 3], [30, 5], [28, 6], [24, 5], [21, 4]]);
    s.stroke(C.light, [[23, -4], [27, -5], [30, -5]], 0.55);
    s.stroke(C.steel, [[23, 3], [27, 4], [30, 5]], 0.55);
    s.rect(C.black, 22, 0, 2, 2);
    s.detail(22, 0, C.light);
    specs.wrench = { art: s,
      layout: { len: 30, muzzle: [30, -5], grip: [13, 0], fore: null, stock: [0, 0] },
      features: ['open asymmetric adjustable jaws', 'long narrow shaft', 'open circular tail'] };
  }

  function mysticknife() {
    const s = makeModel();
    s.polygon(C.fantasy, [[0, 4], [1, -1], [3, -3], [8, -3], [10, -1], [10, 2], [8, 4], [5, 2], [3, 5]]);
    s.stroke(C.blue, [[2, 2], [4, -1], [8, -2], [10, -1]], 0.55);
    s.polygon(C.darkSteel, [[16, -3], [22, -3], [27, -2], [30, 0], [27, 1], [23, 2], [16, 2]]);
    s.polygon(C.steel, [[17, 1], [22, 2], [26, 4], [22, 3], [17, 3]]);
    s.stroke(C.light, [[18, -3], [25, -2], [29, 0], [30, 0]], 0.55);
    s.stroke(C.blueHi, [[17, 0], [23, -1], [28, 0]], 0.55);
    s.polygon(C.fantasy, [[10, -3], [12, -6], [15, -4], [18, -5], [17, -2], [13, -2]]);
    s.polygon(C.fantasy, [[10, 3], [12, 6], [15, 4], [17, 5], [17, 2], [13, 2]]);
    s.ellipse(C.darkSteel, 13, 0, 5, 5);
    s.ellipse(C.blue, 13, 0, 3.9, 3.9);
    s.ellipse(null, 13, 0, 2.6, 2.6, true);
    for (const x of [4, 6, 8]) s.detail(x, 2, C.blueHi);
    specs.mysticknife = { art: s,
      layout: { len: 30, muzzle: [30, 0], grip: [6, 0], fore: [10, 0], stock: [0, 3] },
      features: ['layered curved blade with blue channel', 'large transparent center ring', 'hooked dark blue grip'] };
  }

  tangdao(); springknife(); butterfly(); wrench(); mysticknife();
  for (const [id, spec] of Object.entries(specs)) {
    const previous = WeaponArt.get(id);
    WeaponArt.define(id, {
      ...previous,
      ver: 'melee-five-v1',
      layout: { ...previous.layout, ...spec.layout, eject: null, mag: null, magBase: null, sight: null },
      silhouette(ctx, art, pose, pen, opts) { spec.art.paint(ctx, !!(opts && opts.view === 'inspect')); },
      features: spec.features,
    });
  }
  return { ids: Object.keys(specs) };
})();
