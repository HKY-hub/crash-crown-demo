// Nine photo-referenced throwable models. One pixel model serves held, inspect,
// HUD and in-flight views; gameplay timing and collision remain in game.js.
const ThrowNineArt = (() => {
  const makeModel = MeleeSixArt.makeModel;
  const C = {
    olive: '#4b5138', oliveHi: '#747b59', oliveLo: '#303627',
    steel: '#484e4e', steelHi: '#929b99', steelLo: '#262c2d',
    black: '#242829', blackHi: '#4b5352',
    white: '#d8dcda', whiteHi: '#f3f5f1', whiteLo: '#8f9694',
    yellow: '#efbd2d', orange: '#b95c35', red: '#b83b35', redHi: '#e36755',
    blue: '#3cadd6', blueHi: '#8ddaf1', blueLo: '#1f7298',
  };
  const specs = {};

  function cap(s) {
    s.rect(C.steelLo, -3, -9, 6, 3);
    s.rect(C.blackHi, -2, -9, 4, 1);
    s.rect(C.steel, -4, -6, 8, 1);
    s.rect(C.black, 3, -8, 3, 3);
    s.polygon(C.black, [[5, -7], [7, -5], [7, 5], [6, 6], [5, 3]]);
    s.stroke(C.blackHi, [[5, -7], [6, -5], [6, 3]], 0.5);
    s.ellipse(C.steelHi, 5, -5, 2.5, 2.5);
    s.ellipse(null, 5, -5, 1.25, 1.25, true);
    s.detail(-1, -8, C.steelHi);
  }

  function cylinder(s, body, hi, lo) {
    s.rect(body, -5, -5, 10, 13);
    s.rect(hi, -5, -4, 1, 11);
    s.rect(lo, 4, -4, 1, 11);
    s.rect(lo, -5, 7, 10, 1);
    s.rect(hi, -4, -5, 8, 1);
  }

  function grenade() {
    const s = makeModel();
    s.ellipse(C.oliveLo, 0, 1, 5, 7);
    s.ellipse(C.olive, 0, 0, 5, 6);
    s.rect(C.oliveHi, -3, -5, 5, 1);
    for (const y of [-3, 0, 3]) {
      const half = y === 3 ? 3 : 4;
      s.rect(C.oliveLo, -half, y, half * 2 + 1, 1);
    }
    for (const x of [-2, 2]) {
      s.rect(C.oliveHi, x, -2, 2, 2);
      s.rect(C.oliveHi, x, 1, 2, 2);
      s.detail(x, 4, C.oliveHi);
    }
    cap(s);
    specs.grenade = { art: s, features: ['oval olive body', 'raised pineapple fragments', 'ring and safety spoon'] };
  }

  function hegrenade() {
    const s = makeModel();
    s.ellipse(C.oliveLo, 0, 1, 6, 6);
    s.ellipse(C.olive, -1, 0, 5, 5);
    s.stroke(C.oliveHi, [[-4, -2], [-3, -4], [0, -5]], 0.5);
    s.stroke(C.oliveLo, [[-5, 1], [5, 1]], 0.5);
    s.detail(-3, -1, C.oliveHi);
    cap(s);
    specs.hegrenade = { art: s, features: ['smooth spherical olive shell', 'horizontal equator seam', 'ring and safety spoon'] };
  }

  function flashbang() {
    const s = makeModel();
    cylinder(s, C.black, C.blackHi, C.steelLo);
    s.rect(C.steel, -5, -5, 10, 2);
    s.rect(C.steel, -5, 6, 10, 2);
    for (const y of [-2, 2]) for (const x of [-3, 2]) {
      s.ellipse(C.steelLo, x, y, 1.5, 1.5);
      s.detail(x, y, C.blueHi);
    }
    s.rect(C.blueHi, -3, -2, 1, 1);
    s.rect(C.blueHi, 2, -2, 1, 1);
    s.rect(C.blueHi, -3, 2, 1, 1);
    s.rect(C.blueHi, 2, 2, 1, 1);
    cap(s);
    specs.flashbang = { art: s, features: ['thin black tube', 'two rows of pale vent holes', 'heavy end caps'] };
  }

  function smoke() {
    const s = makeModel();
    cylinder(s, C.olive, C.oliveHi, C.oliveLo);
    s.rect(C.whiteLo, -5, 1, 10, 2);
    s.rect(C.white, -4, 1, 8, 1);
    s.detail(-3, 4, C.oliveHi);
    cap(s);
    specs.smoke = { art: s, features: ['tall olive canister', 'wide worn white middle band', 'flat round ends'] };
  }

  function gasgrenade() {
    const s = makeModel();
    cylinder(s, C.oliveLo, C.olive, C.black);
    s.rect(C.yellow, -5, -3, 10, 2);
    s.rect(C.oliveHi, -4, 0, 1, 5);
    s.detail(-2, 4, C.oliveHi);
    cap(s);
    specs.gasgrenade = { art: s, features: ['dark olive canister', 'bright yellow band near top', 'unmarked lower body'] };
  }

  function impact() {
    const s = makeModel();
    s.polygon(C.steelLo, [[-3, -5], [3, -5], [4, -3], [5, -2], [5, 4], [3, 7], [-3, 7], [-5, 4], [-5, -2], [-4, -3]]);
    s.rect(C.steel, -5, -2, 10, 5);
    s.rect(C.blackHi, -4, -4, 8, 2);
    s.rect(C.steelLo, -4, 3, 8, 2);
    s.rect(C.blackHi, -2, 6, 4, 1);
    s.detail(-3, 0, C.steelHi);
    cap(s);
    s.rect(C.orange, -3, -5, 6, 1);
    specs.impact = { art: s, features: ['short stepped charcoal body', 'orange neck ring', 'faceted impact shell'] };
  }

  function firegrenade() {
    const s = makeModel();
    cylinder(s, C.red, C.redHi, '#792a29');
    s.polygon(C.whiteHi, [[-2, 4], [-3, 2], [-1, 0], [-1, -2], [1, 0], [2, -1], [3, 2], [1, 5], [-1, 5]]);
    s.polygon(C.red, [[-1, 4], [0, 1], [1, 3], [1, 5], [-1, 5]]);
    s.detail(3, 5, C.redHi);
    cap(s);
    specs.firegrenade = { art: s, features: ['red cylindrical shell', 'large white flame mark', 'black pull-ring assembly'] };
  }

  function healgrenade() {
    const s = makeModel();
    cylinder(s, C.white, C.whiteHi, C.whiteLo);
    s.rect(C.red, -5, -4, 10, 2);
    s.rect(C.red, -5, 5, 10, 2);
    s.rect(C.red, -1, -1, 2, 5);
    s.rect(C.red, -3, 1, 6, 2);
    s.detail(-4, 3, C.whiteHi);
    cap(s);
    specs.healgrenade = { art: s, features: ['silver white canister', 'large red medical cross', 'red top and bottom bands'] };
  }

  function freezegrenade() {
    const s = makeModel();
    cylinder(s, C.blue, C.blueHi, C.blueLo);
    s.rect(C.blueHi, -4, -4, 2, 2);
    s.rect(C.blueHi, 2, 4, 2, 2);
    s.rect(C.whiteHi, 0, -2, 1, 7);
    s.rect(C.whiteHi, -3, 1, 7, 1);
    for (const [x, y] of [[-2, -1], [2, -1], [-2, 3], [2, 3]]) s.rect(C.white, x, y, 1, 1);
    s.detail(-4, 4, C.blueHi); s.detail(3, -3, C.white);
    cap(s);
    specs.freezegrenade = { art: s, features: ['bright ice-blue shell', 'large white snowflake', 'angular pale ice facets'] };
  }

  grenade(); hegrenade(); flashbang(); smoke(); gasgrenade(); impact();
  firegrenade(); healgrenade(); freezegrenade();

  for (const [id, spec] of Object.entries(specs)) {
    const previous = WeaponArt.get(id);
    WeaponArt.define(id, {
      ...previous,
      ver: 'throw-nine-v1',
      layout: { ...previous.layout, len: 16, muzzle: [14, -1], grip: [0, 1], fore: null,
        eject: null, mag: null, magBase: null, stock: [-4, 1], sight: null },
      silhouette(ctx, art, pose, pen, opts) { spec.art.paint(ctx, !!(opts && opts.view === 'inspect')); },
      features: spec.features,
    });
  }

  function drawProjectile(ctx, b, cam) {
    const spec = specs[b.key];
    if (!spec) return false;
    ctx.save();
    ctx.globalAlpha = 1;
    const settled = b.vx === 0 && b.vy === 0;
    ctx.translate(Math.round(b.x - cam.x), Math.round(b.y - cam.y - (settled ? 3 : 0)));
    spec.art.paint(ctx, false);
    ctx.restore();
    return true;
  }

  return { ids: Object.keys(specs), drawProjectile };
})();
