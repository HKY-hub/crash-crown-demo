// ============ 输入管理 ============
const Input = (() => {
  const keys = {};
  const mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false, rDown: false, wheel: 0 };
  const canvas = () => document.getElementById('game');

  function toLogical(e) {
    const c = canvas();
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * CFG.CW,
      y: (e.clientY - r.top) / r.height * CFG.CH,
    };
  }

  function onKey(e, down) {
    const k = e.key.toLowerCase();
    keys[k] = down;
    if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(k)) e.preventDefault();
  }

  function sens() { const v = Number(CFG.AIM_SENS); return (isFinite(v) && v > 0) ? v : 1; }
  let rawPrev = null;   // 上一次的真实光标逻辑坐标，用于求位移

  function attach() {
    window.addEventListener('keydown', e => { onKey(e, true); });
    window.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('mousemove', e => {
      const p = toLogical(e);
      // 灵敏度 = 1 时保持原有的绝对定位（默认手感一字不动）；
      // ≠ 1 时改为「按位移增益累加」，准星比鼠标快/慢，并夹在画布内防止反解越界。
      if (rawPrev === null || sens() === 1) { mouse.x = p.x; mouse.y = p.y; }
      else {
        mouse.x = Math.max(0, Math.min(CFG.CW, mouse.x + (p.x - rawPrev.x) * sens()));
        mouse.y = Math.max(0, Math.min(CFG.CH, mouse.y + (p.y - rawPrev.y) * sens()));
      }
      rawPrev = p;
    });
    window.addEventListener('mousedown', e => {
      if (e.button === 0) { mouse.down = true; AudioFX.unlock(); }
      if (e.button === 2) { mouse.rDown = true; AudioFX.unlock(); }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) mouse.down = false;
      if (e.button === 2) mouse.rDown = false;
    });
    window.addEventListener('wheel', e => {
      mouse.wheel += (e.deltaY > 0 ? 1 : -1);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  // 每帧将鼠标坐标换算为世界坐标
  function update(camera) {
    mouse.wx = mouse.x + camera.x;
    mouse.wy = mouse.y + camera.y;
  }

  function pressed(k) { return !!keys[k]; }
  function any(left, right) { return !!(keys[left] || keys[right]); }
  function jumpBuffered() { return keys[' '] || keys['w'] || keys['arrowup']; }

  return { attach, update, pressed, any, jumpBuffered, mouse, keys };
})();
