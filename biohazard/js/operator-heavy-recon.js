// Two weapon-free human sprites. Drawn on the same 20x30 pixel grid as Vanguard.
// Both face right; the game mirrors the finished canvas for left-facing actors.
const OperatorHeavyRecon = (() => {
  const W = 20, H = 30, SCALE = 2;
  const animations = new Set(['idle', 'run', 'jump', 'fall', 'fire', 'turn', 'crouch']);
  const bulwarkPalette = Object.freeze({
    outline: '#11161b',
    helmet: '#444b53', helmetLight: '#727981', helmetShadow: '#292f36',
    cloth: '#303740', clothS: '#505861', clothD: '#232a31',
    armor: '#424951', armorLight: '#777d84', armorShadow: '#252b32',
    plate: '#b48137', plateLight: '#dfad5c', plateDark: '#7b5127',
    lens: '#f3b44f', lensLight: '#ffe090',
    glove: '#272e36', gloveLight: '#626a72',
    boot: '#252c33', bootLight: '#626a70',
  });
  const shadePalette = Object.freeze({
    outline: '#101a1e',
    helmet: '#29424d', helmetLight: '#476574', helmetShadow: '#1c3039',
    cloth: '#314d58', clothS: '#4d6b75', clothD: '#263d47',
    armor: '#27353c', armorLight: '#52636a', armorShadow: '#1b292f',
    lens: '#83d8dd', lensLight: '#c2fcf1', lensDark: '#388d9a',
    glove: '#202a30', gloveLight: '#45525a',
    boot: '#202a31', bootLight: '#56636a',
  });

  function box(ctx, color, x, y, w, h) {
    if (w > 0 && h > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
  }

  function line(ctx, color, x0, y0, x1, y1, width) {
    const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      box(ctx, color,
        Math.round(x0 + (x1 - x0) * i / steps),
        Math.round(y0 + (y1 - y0) * i / steps), width, 1);
    }
  }

  function legsFor(anim, frame) {
    if (anim === 'run') return frame % 2 ? [
      { hip: 8, knee: 10, ky: 23, ankle: 13, sole: 27, toe: 1 },
      { hip: 12, knee: 9, ky: 25, ankle: 6, sole: 30, toe: -1 },
    ] : [
      { hip: 8, knee: 5, ky: 25, ankle: 3, sole: 29, toe: -1 },
      { hip: 12, knee: 14, ky: 24, ankle: 15, sole: 30, toe: 1 },
    ];
    if (anim === 'jump') return [
      { hip: 8, knee: 6, ky: 24, ankle: 5, sole: 27, toe: -1 },
      { hip: 12, knee: 14, ky: 23, ankle: 15, sole: 29, toe: 1 },
    ];
    if (anim === 'fall') return [
      { hip: 8, knee: 7, ky: 24, ankle: 6, sole: 29, toe: -1 },
      { hip: 12, knee: 14, ky: 24, ankle: 15, sole: 29, toe: 1 },
    ];
    if (anim === 'fire') return [
      { hip: 8, knee: 6, ky: 25, ankle: 4, sole: 30, toe: -1 },
      { hip: 12, knee: 14, ky: 24, ankle: 15, sole: 30, toe: 1 },
    ];
    return [
      { hip: 8, knee: 8, ky: 25, ankle: 7, sole: 30, toe: -1 },
      { hip: 12, knee: 13, ky: 25, ankle: 13, sole: 30, toe: 1 },
    ];
  }

  function boot(ctx, p, x, sole, toe, heavy, near) {
    const width = heavy ? 4 : 3;
    box(ctx, p.outline, x - 1, sole - 4, width + 1, 4);
    box(ctx, p.boot, x, sole - 3, width - 1, 2);
    box(ctx, p.bootLight, x + (near ? 1 : 0), sole - 3, 1, 1);
    box(ctx, p.outline, x + Math.min(0, toe), sole - 1, width + Math.abs(toe), 1);
    box(ctx, p.bootLight, x + (toe > 0 ? 2 : 0), sole - 2, 2, 1);
  }

  function drawLeg(ctx, p, pose, heavy, near) {
    const { hip, knee, ky, ankle, sole, toe } = pose;
    const width = heavy ? 5 : 4;
    line(ctx, p.outline, hip - 1, 20, knee - 1, ky, width);
    line(ctx, near ? p.cloth : p.clothD, hip, 20, knee, ky, width - 2);
    line(ctx, p.outline, knee - 1, ky + 1, ankle - 1, sole - 3, width);
    line(ctx, near ? p.cloth : p.clothD, knee, ky + 1, ankle, sole - 3, width - 2);
    box(ctx, p.clothS, knee, ky + 1, 1, 2);
    box(ctx, p.armorShadow, knee - 1, ky - 1, width, heavy ? 4 : 3);
    box(ctx, p.armor, knee, ky - 1, width - 2, heavy ? 3 : 2);
    box(ctx, p.armorLight, knee, ky - 1, heavy ? 2 : 1, 1);
    if (heavy) box(ctx, p.armorLight, knee + 2, ky, 1, 2);
    boot(ctx, p, ankle, sole, toe, heavy, near);
  }

  function crouchLegs(ctx, p, heavy) {
    box(ctx, p.outline, 4, 22, heavy ? 15 : 14, 5);
    box(ctx, p.clothD, 5, 23, 12, 3);
    box(ctx, p.clothS, 9, 23, 5, 1);
    box(ctx, p.armorShadow, 14, 24, 4, 3);
    box(ctx, p.armorLight, 15, 24, 2, 1);
    box(ctx, p.armor, 5, 26, 4, 2);
    boot(ctx, p, 4, 30, -1, heavy, false);
    boot(ctx, p, 14, 30, 1, heavy, true);
  }

  function bulwarkHead(ctx, y, look, turn) {
    const p = bulwarkPalette;
    const hy = y + (look === 'up' ? -1 : look === 'down' ? 1 : 0);
    box(ctx, p.outline, turn ? 5 : 6, hy + 1, turn ? 10 : 12, 9);
    box(ctx, p.helmetShadow, 7, hy + 1, 8, 8);
    box(ctx, p.helmet, 8, hy + 1, 7, 6);
    box(ctx, p.helmetLight, 9, hy + 1, 4, 1);
    box(ctx, p.helmetLight, 7, hy + 3, 1, 3);
    box(ctx, p.outline, 5, hy + 3, 4, 5);
    box(ctx, p.armor, 6, hy + 4, 3, 3); // circular headset
    box(ctx, p.armorLight, 7, hy + 4, 1, 2);
    box(ctx, p.outline, 10, hy + 7, 7, 3); // enclosed jaw
    box(ctx, p.helmet, 11, hy + 7, 5, 2);
    box(ctx, p.helmetLight, 12, hy + 8, 3, 1);
    if (turn) {
      box(ctx, p.helmetLight, 10, hy + 4, 4, 1);
      box(ctx, p.lens, 11, hy + 5, 3, 1);
    } else {
      const ey = hy + (look === 'up' ? 3 : look === 'down' ? 5 : 4);
      box(ctx, p.outline, 13, ey, 5, 2);
      box(ctx, p.lens, 14, ey, 3, 1);
      box(ctx, p.lensLight, 15, ey, 1, 1);
      box(ctx, p.helmetShadow, 16, hy + 6, 2, 2);
    }
  }

  function bulwarkBody(ctx, y, anim, frame, turn) {
    const p = bulwarkPalette;
    // Distinct forward mass: tall angular chest plate and low utility belt.
    box(ctx, p.outline, 5, y, 13, 12);
    box(ctx, p.clothD, 6, y + 1, 11, 10);
    box(ctx, p.armorShadow, 7, y + 1, 10, 9);
    box(ctx, p.armor, 9, y + 2, 8, 8);
    box(ctx, p.armorLight, 11, y + 2, 5, 1);
    box(ctx, p.armorLight, 15, y + 3, 1, 4);
    box(ctx, p.armorShadow, 12, y + 5, 5, 1);
    box(ctx, p.outline, 8, y + 10, 10, 2);
    box(ctx, p.armor, 9, y + 10, 8, 1);
    box(ctx, p.armorLight, 13, y + 10, 2, 1);
    for (let i = 0; i < 3; i++) {
      const x = 9 + i * 3;
      box(ctx, p.outline, x, y + 8, 3, 3);
      box(ctx, p.armor, x + 1, y + 8, 2, 2);
      box(ctx, p.armorLight, x + 1, y + 8, 1, 1);
    }
    // Far arm carries the large ochre shoulder shield from the reference.
    const bx = turn ? 5 : 3 + (anim === 'run' && frame % 2 ? 1 : 0);
    box(ctx, p.outline, bx, y + 1, 6, 8);
    box(ctx, p.plateDark, bx + 1, y + 2, 5, 6);
    box(ctx, p.plate, bx + 1, y + 2, 4, 5);
    box(ctx, p.plateLight, bx + 2, y + 2, 2, 1);
    box(ctx, p.plateDark, bx + 2, y + 6, 2, 1);
    box(ctx, p.outline, bx + 1, y + 8, 5, 4);
    box(ctx, p.armor, bx + 2, y + 9, 3, 3);
    box(ctx, p.armorLight, bx + 2, y + 9, 1, 2);
    // Front sleeve stops above the separately animated gun hands.
    if (turn) {
      box(ctx, p.outline, 16, y + 2, 3, 7);
      box(ctx, p.armor, 16, y + 3, 2, 5);
    } else {
      box(ctx, p.outline, 16, y + 3, 3, 6);
      box(ctx, p.armor, 16, y + 4, 2, 4);
      box(ctx, p.armorLight, 17, y + 4, 1, 2);
    }
  }

  function shadeHead(ctx, y, look, turn) {
    const p = shadePalette;
    const hy = y + (look === 'up' ? -1 : look === 'down' ? 1 : 0);
    // Hood overhang and pointed front rim remain visible at game scale.
    box(ctx, p.outline, 7, hy + 1, turn ? 9 : 10, 9);
    box(ctx, p.helmetShadow, 7, hy + 2, 8, 7);
    box(ctx, p.helmet, 8, hy + 1, 7, 7);
    box(ctx, p.helmetLight, 10, hy + 1, 4, 1);
    box(ctx, p.helmetLight, 7, hy + 5, 2, 2);
    box(ctx, p.outline, 12, hy + 3, 6, 2);
    box(ctx, p.helmet, 13, hy + 3, 4, 1); // hood bill
    box(ctx, p.outline, 11, hy + 5, 6, 4);
    box(ctx, p.glove, 11, hy + 7, 5, 2); // covered face
    if (turn) {
      box(ctx, p.lensDark, 11, hy + 5, 3, 2);
      box(ctx, p.lens, 12, hy + 5, 2, 1);
    } else {
      const ey = hy + (look === 'up' ? 4 : look === 'down' ? 6 : 5);
      box(ctx, p.lensDark, 13, ey, 4, 2);
      box(ctx, p.lens, 14, ey, 3, 1);
      box(ctx, p.lensLight, 15, ey, 1, 1);
    }
  }

  function shadeBody(ctx, y, anim, frame, turn) {
    const p = shadePalette;
    // Radio pack and antenna sit behind the cloth, with a clear gap at the waist.
    box(ctx, p.outline, 4, y + 1, 4, 8);
    box(ctx, p.armor, 5, y + 2, 2, 5);
    box(ctx, p.armorLight, 5, y + 3, 1, 2);
    box(ctx, p.outline, 5, y - 4, 1, 6);
    box(ctx, p.armorLight, 5, y - 4, 1, 2);
    box(ctx, p.outline, 7, y, 10, 12);
    box(ctx, p.clothD, 8, y + 1, 8, 10);
    box(ctx, p.cloth, 9, y + 1, 7, 9);
    box(ctx, p.clothS, 12, y + 2, 2, 2);
    box(ctx, p.armorShadow, 8, y + 1, 2, 10); // harness
    box(ctx, p.armorLight, 10, y + 2, 1, 2);
    box(ctx, p.armorShadow, 13, y + 5, 3, 4); // comms pouch
    box(ctx, p.armor, 14, y + 6, 2, 2);
    box(ctx, p.armorLight, 14, y + 6, 1, 1);
    box(ctx, p.outline, 8, y + 10, 9, 2);
    box(ctx, p.clothD, 9, y + 10, 7, 1);
    const bx = turn ? 6 : 6 + (anim === 'run' && frame % 2 ? 1 : 0);
    box(ctx, p.outline, bx, y + 2, 3, 7);
    box(ctx, p.cloth, bx + 1, y + 2, 2, 6);
    box(ctx, p.clothS, bx + 1, y + 3, 1, 2);
    box(ctx, p.armorShadow, bx, y + 8, 3, 2);
    box(ctx, p.outline, 15, y + 3, 3, 6);
    box(ctx, p.cloth, 15, y + 4, 2, 4);
    box(ctx, p.clothS, 16, y + 4, 1, 2);
    if (turn) box(ctx, p.armorLight, 16, y + 4, 1, 2);
  }

  function draw(ctx, kind, anim, frame, look) {
    const heavy = kind === 'bulwark';
    const p = heavy ? bulwarkPalette : shadePalette;
    const crouch = anim === 'crouch';
    const turn = anim === 'turn';
    const y = crouch ? 15 : 9;
    if (crouch) crouchLegs(ctx, p, heavy);
    else {
      const legs = legsFor(anim, frame);
      drawLeg(ctx, p, legs[0], heavy, false);
      drawLeg(ctx, p, legs[1], heavy, true);
    }
    if (heavy) {
      bulwarkBody(ctx, y, anim, frame, turn);
      bulwarkHead(ctx, y - 8, look, turn);
    } else {
      shadeBody(ctx, y, anim, frame, turn);
      shadeHead(ctx, y - 8, look, turn);
    }
  }

  function make(kind, palette) {
    const cache = Object.create(null);
    const insigniaCache = Object.create(null);
    function normalize(anim, frame, look) {
      return {
        anim: animations.has(anim) ? anim : 'idle',
        frame: Number.isFinite(frame) ? Math.abs(Math.floor(frame)) % 2 : 0,
        look: look === 'up' || look === 'down' ? look : 'level',
      };
    }
    function canvas() {
      const c = document.createElement('canvas');
      c.width = W * SCALE;
      c.height = H * SCALE;
      c._px = true;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.scale(SCALE, SCALE);
      return { c, ctx };
    }
    function get(anim = 'idle', frame = 0, look = 'level') {
      const state = normalize(anim, frame, look);
      const key = state.anim + '/' + state.frame + '/' + state.look;
      if (cache[key]) return cache[key];
      const { c, ctx } = canvas();
      draw(ctx, kind, state.anim, state.frame, state.look);
      cache[key] = c;
      return c;
    }
    // Retain a readable class marker when weapon arms cover the left shoulder.
    function getInsignia(anim = 'idle', frame = 0) {
      const state = normalize(anim, frame, 'level');
      const key = state.anim + '/' + state.frame;
      if (insigniaCache[key]) return insigniaCache[key];
      const { c, ctx } = canvas();
      const y = state.anim === 'crouch' ? 15 : 9;
      if (kind === 'bulwark') {
        const x = state.anim === 'turn' ? 5 : 3 + (state.anim === 'run' && state.frame ? 1 : 0);
        box(ctx, palette.outline, x, y + 3, 6, 5);
        box(ctx, palette.plateDark, x + 1, y + 3, 5, 4);
        box(ctx, palette.plate, x + 1, y + 3, 4, 3);
        box(ctx, palette.plateLight, x + 2, y + 3, 2, 1);
      } else {
        box(ctx, palette.outline, 5, y - 4, 1, 5);
        box(ctx, palette.armorLight, 5, y - 4, 1, 2);
      }
      insigniaCache[key] = c;
      return c;
    }
    return Object.freeze({ get, getInsignia, palette, nativeWidth: W, nativeHeight: H });
  }

  return Object.freeze({
    bulwark: make('bulwark', bulwarkPalette),
    shade: make('shade', shadePalette),
  });
})();

const OperatorBulwark = OperatorHeavyRecon.bulwark;
const OperatorShade = OperatorHeavyRecon.shade;
