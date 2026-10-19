// ============ 触屏控制：左摇杆 + 右侧拖动瞄准/开火 + 动作键 ============
const MobileControls = (() => {
  const touch = (() => {
    try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; }
    catch (e) { return 'ontouchstart' in window; }
  })();
  if (!touch) return { refresh() {} };

  document.body.classList.add('touch-mode');

  const $ = id => document.getElementById(id);
  const hud = $('hud');
  const menu = $('menu');
  const over = $('over');
  const stick = $('mcStick');
  const knob = $('mcKnob');
  const aimPad = $('mcAim');
  const reticle = $('mcReticle');
  let stickPointer = null;
  let aimPointer = null;
  let reticleTimer = 0;

  function setKey(code, down) {
    try { Input.keys[code] = !!down; } catch (e) {}
  }
  function tapKey(code, ms = 130) {
    setKey(code, true);
    setTimeout(() => setKey(code, false), ms);
  }
  function clearMove() {
    setKey('a', false);
    setKey('d', false);
    if (knob) knob.style.transform = 'translate(0, 0)';
  }
  function resetAim() {
    try { Input.mouse.down = false; } catch (e) {}
    if (reticle) reticle.style.display = 'none';
  }

  function updateStick(e) {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width * 0.34;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    setKey('a', nx < -0.18);
    setKey('d', nx > 0.18);
  }

  if (stick) {
    stick.addEventListener('pointerdown', e => {
      if (stickPointer !== null) return;
      stickPointer = e.pointerId;
      try { stick.setPointerCapture(e.pointerId); } catch (_) {}
      updateStick(e);
      e.preventDefault();
    }, { passive: false });
    stick.addEventListener('pointermove', e => {
      if (e.pointerId !== stickPointer) return;
      updateStick(e);
      e.preventDefault();
    }, { passive: false });
    const end = e => {
      if (e.pointerId !== stickPointer) return;
      stickPointer = null;
      clearMove();
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    stick.addEventListener('lostpointercapture', end);
  }

  function aimAt(e) {
    const c = $('game');
    if (!c || typeof CFG === 'undefined') return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * CFG.CW;
    const y = (e.clientY - r.top) / r.height * CFG.CH;
    try {
      Input.mouse.x = Math.max(0, Math.min(CFG.CW, x));
      Input.mouse.y = Math.max(0, Math.min(CFG.CH, y));
    } catch (_) {}
    if (reticle) {
      reticle.style.left = e.clientX + 'px';
      reticle.style.top = e.clientY + 'px';
      reticle.style.display = 'block';
    }
  }

  if (aimPad) {
    aimPad.addEventListener('pointerdown', e => {
      if (aimPointer !== null) return;
      aimPointer = e.pointerId;
      try { aimPad.setPointerCapture(e.pointerId); } catch (_) {}
      aimAt(e);
      try { Input.mouse.down = true; } catch (_) {}
      try { AudioFX.unlock(); } catch (_) {}
      document.body.classList.add('aiming');
      e.preventDefault();
    }, { passive: false });
    aimPad.addEventListener('pointermove', e => {
      if (e.pointerId !== aimPointer) return;
      aimAt(e);
      e.preventDefault();
    }, { passive: false });
    const end = e => {
      if (e.pointerId !== aimPointer) return;
      aimPointer = null;
      resetAim();
      document.body.classList.remove('aiming');
      clearTimeout(reticleTimer);
      reticleTimer = setTimeout(() => { if (reticle) reticle.style.display = 'none'; }, 450);
    };
    aimPad.addEventListener('pointerup', end);
    aimPad.addEventListener('pointercancel', end);
    aimPad.addEventListener('lostpointercapture', end);
  }

  const ACTIONS = { jump: ' ', reload: 'r', interact: 'e', skill: 'q' };
  document.querySelectorAll('.mc-btn[data-mc]').forEach(btn => {
    const code = ACTIONS[btn.dataset.mc];
    if (!code) return;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      tapKey(code, 140);
      btn.classList.add('active');
    }, { passive: false });
    const end = () => btn.classList.remove('active');
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  });

  function refresh() {
    const playing = !!(
      hud && !hud.classList.contains('hidden') &&
      (!menu || menu.classList.contains('hidden')) &&
      (!over || over.classList.contains('hidden'))
    );
    document.body.classList.toggle('mobile-playing', playing);
    if (!playing) { clearMove(); resetAim(); }
    document.body.classList.toggle('portrait',
      window.innerHeight > window.innerWidth);
  }

  [hud, menu, over].forEach(node => {
    if (node) new MutationObserver(refresh).observe(node, { attributes: true, attributeFilter: ['class'] });
  });
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.addEventListener('blur', () => { clearMove(); resetAim(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearMove(); resetAim(); }
  });
  document.addEventListener('touchmove', e => {
    if (e.target.closest && e.target.closest('#mobileControls')) e.preventDefault();
  }, { passive: false });

  const fsBtn = $('rotateFullscreen');
  if (fsBtn) fsBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock('landscape'); } catch (_) {}
      }
      const hint = $('rotateHint');
      if (hint) hint.classList.add('dismissed');
    } catch (e) {
      try { const hint = $('rotateHint'); if (hint) hint.classList.add('dismissed'); } catch (_) {}
    }
  });
  const dismissBtn = $('rotateDismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    const hint = $('rotateHint');
    if (hint) hint.classList.add('dismissed');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();

  return { refresh };
})();
