// Assault Vanguard: small, weapon-free pixel frames for the normal human body.
// All poses face right. The game mirrors the canvas for left-facing characters.
const OperatorVanguard = (() => {
  const W = 20, H = 30, SCALE = 2;
  const palette = Object.freeze({
    outline: '#161c21',
    helmet: '#626c53', helmetLight: '#8b9471', helmetShadow: '#404a3c',
    cloth: '#64705a', clothS: '#879174', clothD: '#465243',
    armor: '#303942', armorLight: '#56616b', armorShadow: '#222a31',
    skin: '#d5a279', skinShadow: '#9e6d51',
    glove: '#252e36', gloveLight: '#56616a',
    patch: '#f78318', patchLight: '#ffaf3b', patchShadow: '#b84a0d',
    boot: '#242c33', bootLight: '#4c555d',
  });
  const cache = Object.create(null);
  const insigniaCache = Object.create(null);

  function box(ctx, color, x, y, w, h) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  // Stair-stepped limbs keep their edges on the pixel grid, including diagonals.
  function segment(ctx, color, x0, y0, x1, y1, width) {
    const n = Math.max(Math.abs(y1 - y0), Math.abs(x1 - x0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / Math.max(1, n));
      const y = Math.round(y0 + (y1 - y0) * i / Math.max(1, n));
      box(ctx, color, x, y, width, 1);
    }
  }

  function drawBoot(ctx, x, soleY, toe, near) {
    const p = palette;
    const bootY = soleY - 3;
    box(ctx, p.outline, x - 1, bootY - 1, 4, 4);
    box(ctx, p.boot, x, bootY, 3, 3);
    box(ctx, p.bootLight, x + (near ? 1 : 0), bootY, 1, 2);
    box(ctx, p.outline, x + Math.min(0, toe), soleY - 1, 4 + Math.abs(toe), 2);
    box(ctx, p.boot, x + Math.min(0, toe), soleY - 1, 4 + Math.abs(toe), 1);
    box(ctx, p.bootLight, x + (toe > 0 ? 2 : 0), soleY - 2, 2, 1);
  }

  function drawLeg(ctx, pose, near) {
    const p = palette;
    const { hip, knee, kneeY, ankle, soleY, toe } = pose;
    segment(ctx, p.outline, hip - 1, 20, knee - 1, kneeY, 5);
    segment(ctx, near ? p.cloth : p.clothD, hip, 20, knee, kneeY, 3);
    segment(ctx, p.outline, knee - 1, kneeY + 1, ankle - 1, soleY - 3, 5);
    segment(ctx, near ? p.cloth : p.clothD, knee, kneeY + 1, ankle, soleY - 3, 3);
    box(ctx, near ? p.clothS : p.cloth, knee, kneeY + 1, 1, 2);
    // Strap and plate stay over the trouser, even in a bent running pose.
    box(ctx, p.armorShadow, knee - 1, kneeY - 1, 5, 3);
    box(ctx, p.armor, knee, kneeY - 1, 3, 2);
    box(ctx, p.armorLight, knee, kneeY - 1, 2, 1);
    box(ctx, p.armorShadow, ankle, soleY - 4, 3, 1);
    drawBoot(ctx, ankle, soleY, toe, near);
  }

  function legsFor(anim, frame) {
    if (anim === 'run') {
      return frame % 2 ? [
        { hip: 8, knee: 10, kneeY: 23, ankle: 13, soleY: 27, toe: 1 },
        { hip: 12, knee: 9, kneeY: 25, ankle: 6, soleY: 30, toe: -1 },
      ] : [
        { hip: 8, knee: 5, kneeY: 25, ankle: 3, soleY: 29, toe: -1 },
        { hip: 12, knee: 14, kneeY: 24, ankle: 15, soleY: 30, toe: 1 },
      ];
    }
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

  function drawCrouchLegs(ctx) {
    const p = palette;
    box(ctx, p.outline, 5, 22, 13, 5);
    box(ctx, p.clothD, 6, 22, 10, 3);
    box(ctx, p.clothS, 9, 23, 5, 1);
    box(ctx, p.armorShadow, 14, 24, 4, 3);
    box(ctx, p.armorLight, 15, 24, 2, 1);
    box(ctx, p.cloth, 5, 26, 4, 2);
    box(ctx, p.armor, 6, 26, 3, 2);
    drawBoot(ctx, 4, 30, -1, false);
    drawBoot(ctx, 14, 30, 1, true);
  }

  function drawBackArm(ctx, y, anim, frame, turn) {
    const p = palette;
    const swing = anim === 'run' ? (frame % 2 ? 1 : 0) : 0;
    const x = turn ? 4 : 4 + swing;
    box(ctx, p.outline, x, y + 2, 4, 6);
    box(ctx, p.clothD, x + 1, y + 2, 3, 5);
    box(ctx, p.clothS, x + 1, y + 3, 1, 3);
    box(ctx, p.armorShadow, x, y + 4, 4, 3);
    box(ctx, p.patchShadow, x + 1, y + 4, 3, 3);
    box(ctx, p.patch, x + 1, y + 4, 3, 2);
    box(ctx, p.patchLight, x + 1, y + 4, 2, 1);
    box(ctx, p.cloth, x + 1, y + 7, 2, 1);
  }

  function drawVest(ctx, y, turn) {
    const p = palette;
    const x = turn ? 6 : 7;
    box(ctx, p.outline, x, y, 10, 11);
    box(ctx, p.clothD, x + 1, y, 8, 10);
    box(ctx, p.armorShadow, x + 1, y + 1, 8, 8);
    box(ctx, p.armor, x + 2, y + 2, 7, 7);
    box(ctx, p.armorLight, x + 3, y + 2, 5, 1);
    // Shoulder straps, horizontal plate and three separated magazine pouches.
    box(ctx, p.outline, x + 1, y, 2, 4);
    box(ctx, p.armorLight, x + 2, y + 1, 1, 3);
    box(ctx, p.armorShadow, x + 3, y + 4, 6, 1);
    for (let i = 0; i < 3; i++) {
      const px = x + 2 + i * 2;
      box(ctx, p.outline, px, y + 6, 2, 4);
      box(ctx, p.armorLight, px, y + 6, 1, 3);
    }
    box(ctx, p.outline, x, y + 10, 10, 2);
    box(ctx, p.armor, x + 1, y + 10, 8, 1);
    box(ctx, p.armorLight, x + 5, y + 10, 2, 1);
    // A small cargo pocket below the vest separates the body from the legs.
    box(ctx, p.armorShadow, x + 1, y + 12, 3, 2);
    box(ctx, p.armorLight, x + 1, y + 12, 2, 1);
  }

  function drawHead(ctx, y, look, turn) {
    const p = palette;
    const lift = look === 'up' ? -1 : look === 'down' ? 1 : 0;
    const hy = y + lift;
    if (turn) {
      box(ctx, p.outline, 6, hy, 9, 9);
      box(ctx, p.helmetShadow, 7, hy, 7, 5);
      box(ctx, p.helmet, 7, hy + 1, 7, 4);
      box(ctx, p.helmetLight, 9, hy + 1, 4, 1);
      box(ctx, p.armor, 6, hy + 3, 2, 4);
      box(ctx, p.armorLight, 6, hy + 4, 1, 2);
      box(ctx, p.skinShadow, 9, hy + 5, 4, 1);
      box(ctx, p.skin, 9, hy + 5, 3, 1);
      box(ctx, p.outline, 8, hy + 6, 6, 3);
      box(ctx, p.glove, 9, hy + 6, 5, 2);
      box(ctx, p.armorLight, 10, hy + 7, 2, 1);
      return;
    }
    box(ctx, p.outline, 6, hy + 1, 11, 9);
    box(ctx, p.helmetShadow, 7, hy + 1, 8, 5);
    box(ctx, p.helmet, 8, hy + 1, 7, 4);
    box(ctx, p.helmetLight, 9, hy + 1, 4, 1);
    box(ctx, p.helmet, 14, hy + (look === 'up' ? 2 : look === 'down' ? 4 : 3), 4, 1);
    box(ctx, p.outline, 6, hy + 3, 3, 5);
    box(ctx, p.armor, 7, hy + 4, 2, 3);
    box(ctx, p.armorLight, 7, hy + 4, 1, 1);
    const eyeY = hy + (look === 'up' ? 4 : look === 'down' ? 6 : 5);
    box(ctx, p.skinShadow, 13, eyeY, 3, 2);
    box(ctx, p.skin, 14, eyeY, 2, 1);
    box(ctx, p.outline, 15, eyeY, 1, 1);
    box(ctx, p.glove, 12, hy + 7, 5, 2);
    box(ctx, p.armorLight, 12, hy + 8, 3, 1);
    // Headset boom mic is distinct from the black balaclava.
    box(ctx, p.armorLight, 8, hy + 8, 7, 1);
    box(ctx, p.outline, 15, hy + 8, 2, 1);
  }

  function drawFrontArm(ctx, y, anim, frame, turn) {
    const p = palette;
    if (turn) {
      box(ctx, p.outline, 15, y + 2, 4, 6);
      box(ctx, p.cloth, 15, y + 3, 3, 4);
      box(ctx, p.patchShadow, 16, y + 4, 3, 3);
      box(ctx, p.patch, 16, y + 4, 2, 2);
      return;
    }
    if (anim === 'fire') {
      box(ctx, p.outline, 15, y + 2, 3, 5);
      box(ctx, p.cloth, 15, y + 3, 2, 3);
      return;
    }
    const swing = anim === 'run' && frame % 2 ? -1 : 0;
    box(ctx, p.outline, 15, y + 2 + swing, 3, 5);
    box(ctx, p.cloth, 15, y + 3 + swing, 2, 3);
    box(ctx, p.clothS, 16, y + 3 + swing, 1, 3);
  }

  function draw(ctx, anim, frame, look) {
    const crouch = anim === 'crouch';
    const turn = anim === 'turn';
    const torsoY = crouch ? 15 : anim === 'run' ? 9 : 9;
    if (crouch) drawCrouchLegs(ctx);
    else {
      const legs = legsFor(anim, frame);
      drawLeg(ctx, legs[0], false);
      drawLeg(ctx, legs[1], true);
    }
    // Backpack behind the torso and the orange team band on the trailing arm.
    box(ctx, palette.outline, 5, torsoY + 2, 4, 8);
    box(ctx, palette.armorShadow, 6, torsoY + 3, 3, 6);
    box(ctx, palette.armorLight, 6, torsoY + 4, 1, 3);
    drawBackArm(ctx, torsoY, anim, frame, turn);
    drawVest(ctx, torsoY, turn);
    drawFrontArm(ctx, torsoY, anim, frame, turn);
    drawHead(ctx, torsoY - 8, look, turn);
  }

  function get(anim = 'idle', frame = 0, look = 'level') {
    if (!['idle', 'run', 'jump', 'fall', 'fire', 'turn', 'crouch'].includes(anim)) anim = 'idle';
    look = look === 'up' || look === 'down' ? look : 'level';
    frame = Number.isFinite(frame) ? Math.abs(Math.floor(frame)) % 2 : 0;
    const key = anim + '/' + frame + '/' + look;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = W * SCALE;
    c.height = H * SCALE;
    c._px = true;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(SCALE, SCALE);
    draw(ctx, anim, frame, look);
    cache[key] = c;
    return c;
  }

  // Draw after the weapon/aim arms so the team color survives weapon overlap.
  function getInsignia(anim = 'idle', frame = 0) {
    if (!['idle', 'run', 'jump', 'fall', 'fire', 'turn', 'crouch'].includes(anim)) anim = 'idle';
    frame = Number.isFinite(frame) ? Math.abs(Math.floor(frame)) % 2 : 0;
    const key = anim + '/' + frame;
    if (insigniaCache[key]) return insigniaCache[key];
    const c = document.createElement('canvas');
    c.width = W * SCALE;
    c.height = H * SCALE;
    c._px = true;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(SCALE, SCALE);
    const torsoY = anim === 'crouch' ? 15 : 9;
    const x = 4 + (anim === 'run' && frame % 2 ? 1 : 0);
    box(ctx, palette.outline, x, torsoY + 6, 4, 3);
    box(ctx, palette.patchShadow, x + 1, torsoY + 6, 3, 3);
    box(ctx, palette.patch, x + 1, torsoY + 6, 3, 2);
    box(ctx, palette.patchLight, x + 1, torsoY + 6, 2, 1);
    insigniaCache[key] = c;
    return c;
  }

  return Object.freeze({ get, getInsignia, palette, nativeWidth: W, nativeHeight: H });
})();
