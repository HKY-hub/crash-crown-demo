/* Fixed JSON -> existing Level contract. Production game/art use the shared
 * traceable compiler; the legacy expansion below is kept for historical tools. */
(function (global) {
  'use strict';

  const SLAB_HEIGHT = 18;
  const TREAD_HEIGHT = 12;
  const finite = (value, label) => {
    if (!Number.isFinite(value)) throw new TypeError(label + ' must be finite');
    return value;
  };
  const array = (value, label) => {
    if (!Array.isArray(value)) throw new TypeError(label + ' must be an array');
    return value;
  };

  // This is the current stage3-adapter.js rampRects numeric expansion. Its
  // fixed mouth widths and named E65 overlap belong to this ramp expansion;
  // they do not edit the input JSON or add separate landings. In particular,
  // the adapter's floor cuts, inferred walls and landing pass are NOT used.
  function compileTreads(ramp) {
    const x0 = finite(ramp.x0, ramp.id + '.x0');
    const x1 = finite(ramp.x1, ramp.id + '.x1');
    const upperY = finite(ramp.upperY, ramp.id + '.upperY');
    const lowerY = finite(ramp.lowerY, ramp.id + '.lowerY');
    if (x1 <= x0 || lowerY <= upperY) throw new RangeError('Invalid ramp ' + ramp.id);
    if (ramp.upperAt !== 'left' && ramp.upperAt !== 'right') {
      throw new TypeError('Invalid upperAt for ' + ramp.id);
    }
    const rise = lowerY - upperY;
    const heavy = ramp.bodies === 'HM';
    const firstRiser = heavy ? 0 : (rise > 116 ? Math.min(70, rise - 46) : 0);
    const count = heavy
      ? Math.max(2, Math.ceil(rise / 80))
      : (firstRiser ? 1 + Math.max(1, Math.ceil((rise - firstRiser) / 45))
        : Math.max(2, Math.ceil(rise / 40)));
    const stepRise = firstRiser ? (rise - firstRiser) / (count - 1) : rise / count;
    const run = (x1 - x0) / count;
    const out = [];
    for (let i = 0; i < count; i++) {
      const fromLower = ramp.upperAt === 'right'
        ? x0 + i * run : x1 - (i + 1) * run;
      const top = lowerY - (firstRiser ? firstRiser + stepRise * i : stepRise * (i + 1));
      let x = Math.round(fromLower);
      let width = heavy ? Math.max(62, run + 1) : Math.max(22, Math.floor(run) - 4);
      const mouth = 64;
      if (i === 0 && heavy && ramp.type === 'heavySteps') {
        const exitGap = Math.min(64, Math.max(0, width - 62));
        if (ramp.upperAt === 'right') x += Math.round(exitGap);
        width -= Math.round(exitGap);
        width = Math.max(width, 160);
        if (ramp.edgeId === 'E65') { x -= 84; width += 84; }
      }
      if (heavy && ramp.type === 'heavySwitchback') {
        const broad = 220;
        width = Math.max(width, broad);
        if (i === count - 1) width = Math.max(width, broad + mouth);
      }
      if (heavy && ramp.type === 'heavySteps' && i === count - 1 && ramp.edgeId === 'E65') {
        width = Math.max(width, 310);
      }
      if (i === count - 1 && heavy) {
        if (ramp.upperAt === 'left') { x -= mouth; width += mouth; }
        else width += mouth;
      }
      out.push({
        id: ramp.id + ':tread:' + i,
        x, y: Math.round(top), w: Math.max(2, Math.round(width)), h: TREAD_HEIGHT,
        oneway: true, mat: heavy ? 'stone' : 'wood', stair: true, ramp: true,
        sid: ramp.edgeId, bodyContract: ramp.bodies,
        sourceRampId: ramp.id, sourceEdgeId: ramp.edgeId, treadIndex: i,
      });
    }
    return out;
  }

  function compileGeometry(data) {
    if (typeof CastleCollisionCompiler !== 'undefined') return CastleCollisionCompiler.compileGeometry(data);
    if (!data || !data.world || !data.levels) throw new TypeError('Fixed castle JSON is required');
    const world = Object.assign({}, data.world);
    finite(world.w, 'world.w'); finite(world.h, 'world.h');
    if (world.w <= 0 || world.h <= 40) throw new RangeError('Invalid castle world bounds');
    // stage2 JSON omits killY. The existing 2240px CastleGen world uses 2200;
    // keep that map death-line contract without changing global CFG physics.
    world.killY = world.killY == null ? world.h - 40 : finite(world.killY, 'world.killY');
    const levels = Object.assign({}, data.levels);
    finite(levels.G1, 'levels.G1');
    const surfaces = array(data.surfaces, 'surfaces').map(surface => {
      const x0 = finite(surface.x0, surface.id + '.x0');
      const x1 = finite(surface.x1, surface.id + '.x1');
      const y = finite(surface.y, surface.id + '.y');
      if (x1 <= x0) throw new RangeError('Invalid surface ' + surface.id);
      // Each JSON span already contains its authored opening cuts. Preserve
      // every span exactly: no merging, filling or stair-mouth recutting.
      return {
        id: surface.id, x: x0, y, w: x1 - x0, h: SLAB_HEIGHT,
        oneway: false, mat: 'stone', deck: surface.sourceId, lv: surface.lv,
        sourceSurfaceId: surface.id, sourceId: surface.sourceId,
        sourceKind: surface.sourceKind, sky: surface.sky === true,
      };
    });
    const treads = [];
    const ramps = array(data.ramps, 'ramps').map(ramp => {
      const rects = compileTreads(ramp);
      treads.push(...rects);
      return Object.assign({}, ramp, { rects });
    });
    const points = array(data.points, 'points').map(point => {
      finite(point.x, point.id + '.x'); finite(point.y, point.id + '.y');
      return Object.assign({}, point);
    });
    const humanSpawns = points.filter(point => point.kind === 'human');
    const zombieSpawns = points.filter(point => point.kind === 'infected');
    const supplies = points.filter(point => point.kind === 'supply');
    if (!humanSpawns.length || !zombieSpawns.length) {
      throw new RangeError('Fixed castle JSON must include human and infected anchors');
    }
    return {
      source: data, world, levels,
      // F1 is only the old Level.buildCastle compatibility name for G1. It is
      // an output alias; the source's eight named level elevations are intact.
      Y: Object.assign({}, levels, { F1: levels.G1 }),
      surfaces, ramps, treads, solids: surfaces.concat(treads),
      points, humanSpawns, zombieSpawns, supplies,
      regions: array(data.regions, 'regions').map(region => Object.assign({}, region)),
      bodyContract: data.bodyContract,
      compilePolicy: 'JSON surface spans plus existing rampRects expansion; no route repairs',
    };
  }

  function buildLevel(data) {
    if (typeof CastleCollisionCompiler !== 'undefined') return CastleCollisionCompiler.buildLevel(data);
    const model = compileGeometry(data);
    // Spawn anchors are foot coordinates. Existing game.js subtracts the
    // real entity collision height at spawn; this compiler never snaps them.
    const spawnHuman = Object.assign({}, model.humanSpawns[0]);
    const spawnZombie = Object.assign({}, model.zombieSpawns[0]);
    const stage = {
      idx: 0, startX: 0, endX: model.world.w, name: '阴森古堡', theme: 'castle',
      spawnHuman, respawns: model.humanSpawns.map(point => Object.assign({}, point)),
      shortcutSpawns: [], ammoBoxes: model.supplies.map(point => Object.assign({}, point)),
      weaponBoxes: [], capsules: [], keys: [], crystals: [], triggers: [], mechanisms: [],
      portal: null, guardTimer: 0, escapeZone: null, decor: [],
    };
    return {
      solids: model.solids, buildings: [], escapeZone: null, spawnHuman, spawnZombie,
      worldW: model.world.w, worldH: model.world.h, killY: model.world.killY,
      groundTop: model.levels.G1, stages: [stage], cliffRespawns: [],
      castle: model, source: data,
    };
  }

  global.CastleRebuildModel = { compileGeometry, buildLevel };
})(window);
