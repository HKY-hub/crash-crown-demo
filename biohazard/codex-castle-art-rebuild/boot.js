/* Load the same fixed 8200px JSON used by the isolated castle art preview.
 * Level.buildCastle remains synchronous; callers await CastleArtDataReady
 * before entering the castle. A failed load never falls back to CastleGen. */
(function (global) {
  'use strict';

  // Capture this while the external script is executing. This works both
  // from the main index.html and from a page inside the art directory.
  const scriptSrc = document.currentScript && document.currentScript.src;
  global.CastleArtGeometry = null;

  function displayFailure(error) {
    const render = () => {
      let alert = document.getElementById('castle-art-load-error');
      if (!alert) {
        alert = document.createElement('div');
        alert.id = 'castle-art-load-error';
        alert.setAttribute('role', 'alert');
        alert.setAttribute('aria-live', 'assertive');
        alert.style.cssText = [
          'position:fixed', 'left:16px', 'bottom:16px', 'z-index:2147483647',
          'max-width:min(640px,calc(100vw - 32px))', 'box-sizing:border-box',
          'padding:14px 18px', 'border:1px solid #c56c65', 'border-radius:6px',
          'background:#321b20', 'color:#ffe8e3', 'white-space:pre-wrap',
          'font:14px/1.5 "Microsoft YaHei",sans-serif', 'box-shadow:0 6px 24px #0008',
        ].join(';');
        // Keep the failure visible when the UI shell rebuilds #menu.
        document.body.appendChild(alert);
      }
      alert.textContent = '古堡结构数据加载失败\n' + error.message + '\n古堡探索未启动。刷新页面可重试。';
      alert.hidden = false;
    };
    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
    console.error('[CastleArtDataReady]', error);
  }

  global.CastleArtDataReady = Promise.resolve().then(() => {
    if (!scriptSrc) throw new Error('无法确定古堡数据加载脚本的位置。');
    const sourceUrl = new URL('../codex-castle-layout/stage2-geometry.json', scriptSrc);
    return fetch(sourceUrl, { cache: 'no-store' });
  }).then(response => {
    if (!response.ok) {
      throw new Error('无法读取古堡结构数据（HTTP ' + response.status + '）。');
    }
    return response.json();
  }).then(data => {
    if (!data || !data.world || data.world.w !== 8200 || data.world.h !== 2240
      || !data.levels || !Array.isArray(data.surfaces) || !Array.isArray(data.ramps)
      || !Array.isArray(data.points) || !Array.isArray(data.regions)) {
      throw new Error('古堡结构数据格式不符，需要当前 8200×2240 固定结构。');
    }
    global.CastleArtGeometry = data;
    return data;
  }).catch(error => {
    const failure = error instanceof Error ? error : new Error(String(error));
    displayFailure(failure);
    // Preserve rejection so debug autostart and other callers cannot proceed
    // with a missing map. The visible error above is outside the menu shell.
    throw failure;
  });
})(window);
