'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

function extractMoveEntity(source) {
  const start = source.indexOf('function moveEntity(e, dt)');
  const end = source.indexOf('// 就近悬崖复活点', start);
  if (start < 0 || end < 0) throw new Error('Cannot locate original moveEntity source');
  return source.slice(start, end).trim();
}
function overlaps(e, s, eps = 0.001) {
  return e.x < s.x + s.w - eps && e.x + e.w > s.x + eps && e.y < s.y + s.h - eps && e.y + e.h > s.y + eps;
}
function createHarness(options = {}) {
  const ctx = vm.createContext({ console, document: { getElementById: () => null },
    AudioFX: { jump() {} }, game: { walk: true, bio: false, state: 'playing', stage: 0,
      advanceOpen: true, mechs: [[]] }, level: null,
    handleFall(e) { e.dead = true; e.testFall = true; }, doSlam() {},
    advanceLineX() { throw new Error('Stage fence unexpectedly active'); },
    humanFrontX() { throw new Error('Human-front fence unexpectedly active'); },
  });
  ctx.window = ctx;
  for (const file of ['js/config.js', 'js/input.js', 'js/entities.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  const moveSource = extractMoveEntity(gameSource);
  vm.runInContext(moveSource, ctx, { filename: 'js/game.js:original-moveEntity' });
  const compiler = options.compiler || 'baseline';
  if (compiler === 'baseline') {
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'baseline/codex-castle-art-rebuild/browser-model.js'), 'utf8'), ctx);
  } else {
    const compilerFile = path.join(__dirname, 'compiler.js');
    vm.runInContext(fs.readFileSync(compilerFile, 'utf8'), ctx, { filename: compilerFile });
  }
  const sourcePath = path.join(ROOT, 'codex-castle-layout/stage2-geometry.json');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const data = JSON.parse(source);
  const api = ctx.CastleCollisionCompiler || ctx.CastleRebuildModel;
  if (!api) throw new Error('Compiler not exported');
  const level = api.buildLevel(data);
  ctx.level = level;
  const bridge = vm.runInContext('({CFG, Input, makeHuman, makeZombie, moveEntity, ZOMBIES})', ctx);
  const bodies = { human: bridge.makeHuman({ x: 0, y: 0, isPlayer: true, weapon: 'm4a1' }),
    motherTitan: bridge.makeZombie('mother_titan', { x: 0, y: 0, isPlayer: true }) };
  const specs = Object.fromEntries(Object.entries(bodies).map(([id,e]) => [id, {
    w:e.w,h:e.h,speed:e.kind === 'human' ? bridge.CFG.HUMAN_SPEED*e.equipFx.speedMul : e.speed,
    jump:bridge.CFG.JUMP_V*(e.equipFx ? e.equipFx.jumpMul : 1),equipFx:e.equipFx || null,
  }]));
  function spawn(body, x, feet) {
    const e = body === 'human' ? bridge.makeHuman({ x, y: feet-specs[body].h, isPlayer:true,weapon:'m4a1' })
      : bridge.makeZombie('mother_titan',{x,y:feet-specs[body].h,isPlayer:true});
    e.onGround = false;
    for (const key of Object.keys(bridge.Input.keys)) bridge.Input.keys[key] = false;
    return e;
  }
  function step(e, input={}, dt=1/120) {
    const keys = bridge.Input.keys;
    keys.a = !!input.left; keys.d = !!input.right; keys[' '] = !!input.jump;
    bridge.moveEntity(e, dt);
    return e;
  }
  function support(e) {
    return level.solids.filter(s => e.x < s.x+s.w-0.001 && e.x+e.w>s.x+0.001 && Math.abs(e.y+e.h-s.y)<0.01);
  }
  function embedded(e) { return level.solids.filter(s=>!s.oneway && overlaps(e,s)); }
  return {ctx, data, level, model:level.castle, specs, cfg:bridge.CFG, spawn, step, support, embedded,
    metadata:{compiler,physicsSHA256:crypto.createHash('sha256').update(moveSource).digest('hex'),
      geometrySHA256:crypto.createHash('sha256').update(source).digest('hex'),
      physicsSource:'js/game.js function moveEntity(e, dt), source extracted verbatim',
      fallPolicy:'Actual moveEntity invokes handleFall; harness records terminal death instead of game respawn. No position correction.',
      compilerSHA256:crypto.createHash('sha256').update(fs.readFileSync(compiler==='baseline'?
        path.join(__dirname,'baseline/codex-castle-art-rebuild/browser-model.js'):path.join(__dirname,'compiler.js'))).digest('hex'),
      derivedSourceSHA256:crypto.createHash('sha256').update(JSON.stringify(level.castle.source)).digest('hex'),
      compiledSolidsSHA256:crypto.createHash('sha256').update(JSON.stringify(level.castle.solids)).digest('hex'),
      bodySpecs:specs,dt:1/120,crouchCollision:false,solids:level.solids.length},};
}
module.exports = {createHarness, overlaps, ROOT};
