// ============ 局内暂停 / 退出菜单（Esc 或右上角按钮） ============
const PauseMenu = (() => {
  let open = false;

  const el = () => document.getElementById('pauseMenu');
  const hudVisible = () => {
    const hud = document.getElementById('hud');
    return !!(hud && !hud.classList.contains('hidden'));
  };
  const hidden = id => {
    const n = document.getElementById(id);
    return !n || n.classList.contains('hidden');
  };
  const otherOverlayOpen = () => !hidden('menu') || !hidden('over') || !hidden('backpackUI') || !hidden('settingsPanel');
  const canPause = () => {
    try {
      return hudVisible() && typeof game !== 'undefined' && game && game.state !== 'over' && !otherOverlayOpen();
    } catch (e) { return false; }
  };

  function clearInput() {
    try { for (const k in Input.keys) Input.keys[k] = false; } catch (e) {}
    try { Input.mouse.down = false; Input.mouse.rDown = false; } catch (e) {}
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  }

  function pause() {
    if (open || !canPause()) return false;
    open = true;
    clearInput();
    try { if (typeof Settings !== 'undefined') Settings.paused = true; } catch (e) {}
    const node = el();
    if (node) { node.classList.remove('hidden'); node.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('paused');
    return true;
  }

  function resume() {
    if (!open) return false;
    open = false;
    clearInput();
    try { if (typeof Settings !== 'undefined') Settings.paused = false; } catch (e) {}
    const node = el();
    if (node) { node.classList.add('hidden'); node.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('paused');
    return true;
  }

  function restart() {
    if (!open) return;
    resume();
    try { startGame(); } catch (e) { console.error('重新开始失败', e); }
  }

  function lobby() {
    resume();
    try {
      if (typeof Net !== 'undefined' && Net.active && Net.active()) {
        Net.disconnect();
      } else {
        if (typeof game !== 'undefined') game = null;
        if (typeof level !== 'undefined') level = Level.build();
        const hud = document.getElementById('hud');
        if (hud) hud.classList.add('hidden');
        if (typeof UI !== 'undefined') { UI.hideOver(); UI.showMenu(); }
        if (typeof Router !== 'undefined') Router.go('lobby');
      }
    } catch (e) {
      console.error('返回大厅失败', e);
      try { if (typeof UI !== 'undefined') { UI.hideOver(); UI.showMenu(); } } catch (_) {}
    }
  }

  function bind() {
    const resumeBtn = document.getElementById('pauseResume');
    const restartBtn = document.getElementById('pauseRestart');
    const lobbyBtn = document.getElementById('pauseLobby');
    if (resumeBtn) resumeBtn.addEventListener('click', resume);
    if (restartBtn) restartBtn.addEventListener('click', restart);
    if (lobbyBtn) lobbyBtn.addEventListener('click', lobby);
    ['hudPause', 'mcPause'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => { pause(); });
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.repeat) return;
      const t = e.target;
      if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        resume();
        return;
      }
      if (!canPause()) return;
      e.preventDefault();
      e.stopPropagation();
      pause();
    }, true);

    // 切走页面时松开所有输入，回来不会“卡住油门/扳机”
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  return { pause, resume, restart, lobby, active: () => open, canPause };
})();
