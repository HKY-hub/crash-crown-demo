// Two weapon-free human sprite sets. Frames face right; the game mirrors left-facing units.
const OperatorMedicHazmat = (() => {
  const W = 20, H = 30, SCALE = 2;
  const POSES = ['idle', 'run', 'jump', 'fall', 'fire', 'turn', 'crouch'];

  function box(ctx, color, x, y, w, h) {
    if (w > 0 && h > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
  }

  function segment(ctx, color, x0, y0, x1, y1, width) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / Math.max(steps, 1));
      const y = Math.round(y0 + (y1 - y0) * i / Math.max(steps, 1));
      box(ctx, color, x, y, width, 1);
    }
  }

  function legPositions(anim, frame) {
    if (anim === 'run') return frame ? [
      { hip: 8, knee: 10, kneeY: 23, ankle: 13, soleY: 27, toe: 1 },
      { hip: 12, knee: 9, kneeY: 25, ankle: 6, soleY: 30, toe: -1 },
    ] : [
      { hip: 8, knee: 5, kneeY: 25, ankle: 3, soleY: 29, toe: -1 },
      { hip: 12, knee: 14, kneeY: 24, ankle: 15, soleY: 30, toe: 1 },
    ];
    if (anim === 'jump') return [
      { hip: 8, knee: 6, kneeY: 24, ankle: 5, soleY: 27, toe: -1 },
      { hip: 12, knee: 14, kneeY: 23, ankle: 15, soleY: 29, toe: 1 },
    ];
    if (anim === 'fall') return [
      { hip: 8, knee: 7, kneeY: 24, ankle: 6, soleY: 29, toe: -1 },
      { hip: 12, knee: 14, kneeY: 24, ankle: 15, soleY: 29, toe: 1 },
    ];
    if (anim === 'fire') return [
      { hip: 8, knee: 6, kneeY: 25, ankle: 4, soleY: 30, toe: -1 },
      { hip: 12, knee: 14, kneeY: 24, ankle: 15, soleY: 30, toe: 1 },
    ];
    return [
      { hip: 8, knee: 8, kneeY: 25, ankle: 7, soleY: 30, toe: -1 },
      { hip: 12, knee: 13, kneeY: 25, ankle: 13, soleY: 30, toe: 1 },
    ];
  }

  function drawBoot(ctx, p, x, soleY, toe, near) {
    const front = x + Math.min(0, toe);
    box(ctx, p.outline, x - 1, soleY - 4, 4, 4);
    box(ctx, p.boot, x, soleY - 3, 3, 3);
    box(ctx, p.bootLight, x + (near ? 1 : 0), soleY - 3, 1, 2);
    box(ctx, p.outline, front, soleY - 1, 4 + Math.abs(toe), 1);
    box(ctx, p.boot, front, soleY - 1, 4 + Math.abs(toe), 1);
    box(ctx, p.bootLight, x + (toe > 0 ? 2 : 0), soleY - 2, 2, 1);
  }

  function drawLeg(ctx, p, pose, near, hazmat) {
    const { hip, knee, kneeY, ankle, soleY, toe } = pose;
    const cloth = near ? p.cloth : p.clothD;
    segment(ctx, p.outline, hip - 1, 20, knee - 1, kneeY, 5);
    segment(ctx, cloth, hip, 20, knee, kneeY, 3);
    segment(ctx, p.outline, knee - 1, kneeY + 1, ankle - 1, soleY - 3, 5);
    segment(ctx, cloth, knee, kneeY + 1, ankle, soleY - 3, 3);
    box(ctx, p.clothS, knee, kneeY + 1, 1, 2);
    if (hazmat) {
      box(ctx, p.stripeD, knee - 1, kneeY - 3, 5, 2);
      box(ctx, p.stripe, knee, kneeY - 3, 3, 1);
    }
    box(ctx, p.armorShadow, knee - 1, kneeY - 1, 5, 3);
    box(ctx, p.armor, knee, kneeY - 1, 3, 2);
    box(ctx, p.armorLight, knee, kneeY - 1, 2, 1);
    box(ctx, p.armorShadow, ankle, soleY - 4, 3, 1);
    drawBoot(ctx, p, ankle, soleY, toe, near);
  }

  function drawCrouchLegs(ctx, p, hazmat) {
    box(ctx, p.outline, 5, 22, 13, 5);
    box(ctx, p.clothD, 6, 22, 10, 3);
    box(ctx, p.clothS, 9, 23, 5, 1);
    if (hazmat) {
      box(ctx, p.stripeD, 7, 24, 7, 1);
      box(ctx, p.stripe, 8, 24, 5, 1);
    }
    box(ctx, p.armorShadow, 14, 24, 4, 3);
    box(ctx, p.armorLight, 15, 24, 2, 1);
    box(ctx, p.cloth, 5, 26, 4, 2);
    box(ctx, p.armor, 6, 26, 3, 2);
    drawBoot(ctx, p, 4, 30, -1, false);
    drawBoot(ctx, p, 14, 30, 1, true);
  }

  function drawMedicHead(ctx, p, y, look, turn) {
    const hy = y + (look === 'up' ? -1 : look === 'down' ? 1 : 0);
    if (turn) {
      box(ctx, p.outline, 6, hy, 9, 9);
      box(ctx, p.helmetD, 7, hy, 7, 5);
      box(ctx, p.helmet, 7, hy + 1, 7, 4);
      box(ctx, p.helmetLight, 9, hy + 1, 4, 1);
      box(ctx, p.armor, 6, hy + 3, 2, 3);
      box(ctx, p.skinD, 10, hy + 5, 3, 2);
      box(ctx, p.skin, 10, hy + 5, 2, 1);
      box(ctx, p.glove, 9, hy + 7, 5, 2);
      return;
    }
    box(ctx, p.outline, 6, hy + 1, 11, 9);
    box(ctx, p.helmetD, 7, hy + 1, 8, 5);
    box(ctx, p.helmet, 8, hy + 1, 7, 4);
    box(ctx, p.helmetLight, 9, hy + 1, 5, 1);
    box(ctx, p.helmetD, 13, hy + (look === 'up' ? 2 : look === 'down' ? 4 : 3), 5, 1);
    box(ctx, p.armor, 7, hy + 4, 2, 3);
    box(ctx, p.armorLight, 7, hy + 4, 1, 1);
    const eyeY = hy + (look === 'up' ? 4 : look === 'down' ? 6 : 5);
    box(ctx, p.skinD, 12, eyeY, 4, 2);
    box(ctx, p.skin, 13, eyeY, 3, 1);
    box(ctx, p.outline, 15, eyeY, 1, 1);
    box(ctx, p.skin, 15, eyeY + 1, 2, 1);
    box(ctx, p.glove, 12, hy + 7, 5, 2);
    box(ctx, p.armorLight, 8, hy + 8, 7, 1); // headset microphone
    box(ctx, p.outline, 15, hy + 8, 2, 1);
  }

  function drawHazmatHead(ctx, p, y, look, turn) {
    const hy = y + (look === 'up' ? -1 : look === 'down' ? 1 : 0);
    if (turn) {
      box(ctx, p.outline, 6, hy, 10, 10);
      box(ctx, p.hoodD, 7, hy, 8, 9);
      box(ctx, p.hood, 7, hy + 1, 8, 7);
      box(ctx, p.hoodLight, 9, hy + 1, 4, 1);
      box(ctx, p.stripeD, 10, hy, 2, 4);
      box(ctx, p.stripe, 10, hy, 1, 3);
      box(ctx, p.armorShadow, 9, hy + 5, 5, 4);
      box(ctx, p.armor, 10, hy + 6, 3, 2);
      return;
    }
    box(ctx, p.outline, 6, hy + 1, 12, 10);
    box(ctx, p.hoodD, 7, hy + 1, 10, 8);
    box(ctx, p.hood, 7, hy + 1, 8, 7);
    box(ctx, p.hoodLight, 9, hy + 1, 4, 1);
    box(ctx, p.stripeD, 11, hy + 1, 2, 4);
    box(ctx, p.stripe, 11, hy + 1, 1, 3);
    const visorY = hy + (look === 'up' ? 3 : look === 'down' ? 5 : 4);
    box(ctx, p.outline, 13, visorY, 4, 3);
    box(ctx, p.visor, 14, visorY, 2, 1);
    box(ctx, p.armorShadow, 13, hy + 6, 5, 4);
    box(ctx, p.armor, 14, hy + 7, 3, 2);
    box(ctx, p.stripe, 14, hy + 7, 1, 2);
    box(ctx, p.outline, 17, hy + 7, 2, 3); // forward respirator cartridge
    box(ctx, p.stripeD, 17, hy + 7, 2, 2);
    box(ctx, p.stripe, 17, hy + 7, 1, 2);
    box(ctx, p.armorLight, 18, hy + 8, 1, 1);
  }

  function drawBackArm(ctx, p, y, anim, frame, turn, hazmat) {
    const x = turn ? 4 : 4 + (anim === 'run' && frame ? 1 : 0);
    box(ctx, p.outline, x, y + 2, 4, 6);
    box(ctx, p.clothD, x + 1, y + 2, 3, 5);
    box(ctx, p.clothS, x + 1, y + 3, 1, 3);
    if (hazmat) {
      box(ctx, p.armorShadow, x, y + 4, 4, 3);
      box(ctx, p.armor, x + 1, y + 4, 3, 2);
      box(ctx, p.stripeD, x, y + 6, 4, 2);
      box(ctx, p.stripe, x + 1, y + 6, 3, 1);
    } else {
      box(ctx, p.patch, x, y + 4, 4, 4);
      box(ctx, p.patchLight, x + 1, y + 4, 2, 1);
      cross(ctx, p.cross, x + 1, y + 5);
    }
  }

  function cross(ctx, color, x, y) {
    box(ctx, color, x + 1, y, 1, 3);
    box(ctx, color, x, y + 1, 3, 1);
  }

  function drawVest(ctx, p, y, turn, hazmat) {
    const x = turn ? 6 : 7;
    box(ctx, p.outline, x, y, 10, 11);
    box(ctx, p.clothD, x + 1, y, 8, 10);
    box(ctx, p.armorShadow, x + 1, y + 1, 8, 8);
    box(ctx, p.armor, x + 2, y + 2, 7, 7);
    box(ctx, p.armorLight, x + 3, y + 2, 5, 1);
    box(ctx, p.outline, x + 1, y, 2, 4);
    box(ctx, p.armorLight, x + 2, y + 1, 1, 3);
    if (hazmat) {
      box(ctx, p.armorShadow, x + 2, y + 5, 6, 3);
      box(ctx, p.armorLight, x + 3, y + 5, 4, 1);
      box(ctx, p.armorShadow, x + 3, y + 8, 5, 2);
      box(ctx, p.armorLight, x + 4, y + 8, 3, 1);
    } else {
      box(ctx, p.patch, x + 4, y + 2, 4, 4);
      cross(ctx, p.cross, x + 5, y + 3);
      for (let i = 0; i < 3; i++) {
        const px = x + 2 + 2 * i;
        box(ctx, p.outline, px, y + 7, 2, 3);
        box(ctx, p.armorLight, px, y + 7, 1, 2);
      }
    }
    box(ctx, p.outline, x, y + 10, 10, 2);
    box(ctx, p.armor, x + 1, y + 10, 8, 1);
    box(ctx, p.armorLight, x + 5, y + 10, 2, 1);
    box(ctx, p.armorShadow, x + 1, y + 12, 3, 2);
    box(ctx, p.armorLight, x + 1, y + 12, 2, 1);
  }

  function drawFrontArm(ctx, p, y, anim, frame, turn, hazmat) {
    if (turn) {
      box(ctx, p.outline, 15, y + 2, 4, 6);
      box(ctx, p.cloth, 15, y + 3, 3, 4);
      if (hazmat) box(ctx, p.stripe, 16, y + 6, 3, 1);
      else {
        box(ctx, p.patch, 16, y + 4, 3, 3);
        cross(ctx, p.cross, 16, y + 4);
      }
      return;
    }
    const swing = anim === 'run' && frame ? -1 : 0;
    box(ctx, p.outline, 15, y + 2 + swing, 3, 5);
    box(ctx, p.cloth, 15, y + 3 + swing, 2, 3);
    box(ctx, p.clothS, 16, y + 3 + swing, 1, 3);
  }

  function makeOperator(kind) {
    const hazmat = kind === 'hazmat';
    const palette = Object.freeze(hazmat ? {
      outline: '#16191a', hood: '#687449', hoodD: '#485438', hoodLight: '#899459',
      cloth: '#687448', clothS: '#889359', clothD: '#4b5638',
      armor: '#343b36', armorLight: '#5a6459', armorShadow: '#252b29',
      glove: '#272d2d', skin: '#3b403b', boot: '#272b2b', bootLight: '#515654',
      stripe: '#f0dd25', stripeD: '#8e8722', visor: '#797e72',
    } : {
      outline: '#22272d', helmet: '#858b8d', helmetLight: '#c3c8c7', helmetD: '#555e63',
      cloth: '#d5d7d0', clothS: '#f0f1e9', clothD: '#a4aca9',
      armor: '#384349', armorLight: '#65747a', armorShadow: '#293238',
      glove: '#343b40', skin: '#dfad86', skinD: '#a6765d',
      boot: '#343a3e', bootLight: '#697075',
      patch: '#e3e5de', patchLight: '#fffaf0', cross: '#b83332',
    });
    const cache = Object.create(null);
    const insigniaCache = Object.create(null);

    function draw(ctx, anim, frame, look) {
      const crouch = anim === 'crouch';
      const turn = anim === 'turn';
      const torsoY = crouch ? 15 : 9;
      if (crouch) drawCrouchLegs(ctx, palette, hazmat);
      else {
        const legs = legPositions(anim, frame);
        drawLeg(ctx, palette, legs[0], false, hazmat);
        drawLeg(ctx, palette, legs[1], true, hazmat);
      }
      box(ctx, palette.outline, 5, torsoY + 2, 4, 8);
      box(ctx, palette.armorShadow, 6, torsoY + 3, 3, 6);
      box(ctx, palette.armorLight, 6, torsoY + 4, 1, 3);
      if (hazmat) box(ctx, palette.armor, 5, torsoY + 4, 2, 4); // air filter canister
      else {
        box(ctx, palette.patch, 5, torsoY + 4, 2, 3); // medical pack
        box(ctx, palette.cross, 5, torsoY + 5, 2, 1);
      }
      drawBackArm(ctx, palette, torsoY, anim, frame, turn, hazmat);
      drawVest(ctx, palette, torsoY, turn, hazmat);
      drawFrontArm(ctx, palette, torsoY, anim, frame, turn, hazmat);
      if (hazmat) drawHazmatHead(ctx, palette, torsoY - 8, look, turn);
      else drawMedicHead(ctx, palette, torsoY - 8, look, turn);
    }

    function normalize(anim, frame) {
      return [POSES.includes(anim) ? anim : 'idle', Number.isFinite(frame) ? Math.abs(Math.floor(frame)) % 2 : 0];
    }

    function makeCanvas() {
      const canvas = document.createElement('canvas');
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      canvas._px = true;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.scale(SCALE, SCALE);
      return [canvas, ctx];
    }

    function get(anim = 'idle', frame = 0, look = 'level') {
      [anim, frame] = normalize(anim, frame);
      look = look === 'up' || look === 'down' ? look : 'level';
      const key = anim + '/' + frame + '/' + look;
      if (cache[key]) return cache[key];
      const [canvas, ctx] = makeCanvas();
      draw(ctx, anim, frame, look);
      cache[key] = canvas;
      return canvas;
    }

    // The shoulder identifier is drawn after aim arms, keeping each role readable.
    function getInsignia(anim = 'idle', frame = 0) {
      [anim, frame] = normalize(anim, frame);
      const key = anim + '/' + frame;
      if (insigniaCache[key]) return insigniaCache[key];
      const [canvas, ctx] = makeCanvas();
      const y = anim === 'crouch' ? 15 : 9;
      const x = 4 + (anim === 'run' && frame ? 1 : 0);
      if (hazmat) {
        box(ctx, palette.stripeD, x, y + 6, 4, 2);
        box(ctx, palette.stripe, x + 1, y + 6, 3, 1);
      } else {
        box(ctx, palette.outline, x, y + 4, 4, 4);
        box(ctx, palette.patch, x, y + 4, 4, 4);
        cross(ctx, palette.cross, x + 1, y + 5);
      }
      insigniaCache[key] = canvas;
      return canvas;
    }

    return Object.freeze({ get, getInsignia, palette, nativeWidth: W, nativeHeight: H });
  }

  return Object.freeze({ medic: makeOperator('medic'), hazmat: makeOperator('hazmat') });
})();

const OperatorMedic = OperatorMedicHazmat.medic;
const OperatorHazmat = OperatorMedicHazmat.hazmat;
