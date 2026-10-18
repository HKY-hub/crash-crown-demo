// ============ 帧内性能探针（F3）============
// 用途：在真实会话里把「一帧的时间花在哪」拆开 —— 逻辑 update / 渲染 render / HUD DOM / 剩余。
// 只在按下 F3 后才包装主循环函数；不显示时零开销。
// 也可以在控制台直接 `PerfProbe.report()` 拿结构化数据（验证脚本用的就是它）。
const PerfProbe = (() => {
  const N = 90;                       // 滚动窗口帧数
  const buf = { frame: [], update: [], render: [], hud: [] };
  let on = false, wrapped = false, host = null;
  let rafCount = 0, lastT = 0, fps = 60, mutCount = 0, slowest = null;
  const t = () => performance.now();

  function wrapGlobal(name, bucket) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig.__probed) return;
    const w = function () { const a = t(); try { return orig.apply(this, arguments); } finally { push(bucket, t() - a); } };
    w.__probed = true; w.__orig = orig;
    window[name] = w;
  }
  function wrapUI(name, bucket) {
    if (typeof UI === 'undefined' || !UI || typeof UI[name] !== 'function' || UI[name].__probed) return;
    const orig = UI[name];
    const w = function () { const a = t(); try { return orig.apply(this, arguments); } finally { push(bucket, t() - a); } };
    w.__probed = true; w.__orig = orig;
    UI[name] = w;
  }
  function push(bucket, ms) { const a = buf[bucket]; a.push(ms); if (a.length > N) a.shift(); }

  function install() {
    if (wrapped) return;
    wrapped = true;
    wrapGlobal('update', 'update');
    wrapGlobal('render', 'render');
    wrapUI('updateHUD', 'hud');
    // 主循环整体：frame 是顶层函数声明，重排 requestAnimationFrame(frame) 走的是同一个全局绑定
    const origFrame = window.frame;
    if (typeof origFrame === 'function' && !origFrame.__probed) {
      const w = function (ts) {
        const a = t();
        rafCount++;
        if (lastT) { const gap = ts - lastT; if (gap > 0 && gap < 500) fps = 1000 / gap; }
        lastT = ts;
        try { return origFrame.apply(this, arguments); }
        finally {
          const cost = t() - a;
          push('frame', cost);
          const u = buf.update[buf.update.length - 1] || 0;
          const r = buf.render[buf.render.length - 1] || 0;
          const h = buf.hud[buf.hud.length - 1] || 0;
          const parts = { 逻辑: u, 渲染: r, HUD: h, 其它: Math.max(0, cost - u - r - h) };
          const top = Object.entries(parts).sort((a2, b2) => b2[1] - a2[1])[0];
          if (!slowest || cost > slowest.ms) slowest = { ms: +cost.toFixed(1), 归因: top[0], 明细: parts };
        }
      };
      w.__probed = true; w.__orig = origFrame;
      window.frame = w;
    }
    if (typeof document !== 'undefined' && document.getElementById('hud')) {
      mutCount = 0;
      new MutationObserver(rs => { mutCount += rs.length; })
        .observe(document.getElementById('hud'), { childList: true, subtree: true, characterData: true, attributes: true });
    }
  }
  const stat = a => {
    if (!a.length) return { avg: 0, p95: 0, max: 0 };
    const s = a.slice().sort((x, y) => x - y);
    return { avg: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) };
  };
  function report() {
    const c = typeof canvas !== 'undefined' && canvas ? canvas : document.getElementById('game');
    const g = typeof game !== 'undefined' && game ? game : null;
    return {
      fps: +fps.toFixed(1),
      整帧: stat(buf.frame), 逻辑: stat(buf.update), 渲染: stat(buf.render), hud: stat(buf.hud),
      最慢帧: slowest,
      实体: g ? g.entities.length : 0, 子弹: typeof bullets !== 'undefined' ? bullets.length : 0,
      粒子: typeof particles !== 'undefined' ? particles.length : 0, 飘字: typeof texts !== 'undefined' ? texts.length : 0,
      画布后备: c ? c.width + 'x' + c.height : '-', 画布显示: c ? Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height) : '-',
      DPR: +(window.devicePixelRatio || 1).toFixed(2),
      HUD每秒变更: mutCount, 面板节点: document.querySelectorAll ? document.querySelectorAll('#dbgUI *').length : 0,
      状态: g ? g.state : '-',
    };
  }
  function tick() {
    if (!on || !host) return;
    const r = report();
    host.textContent =
      `FPS ${r.fps}   整帧 ${r.整帧.avg}/${r.整帧.p95}/${r.整帧.max}ms\n` +
      `逻辑 ${r.逻辑.avg}  渲染 ${r.渲染.avg}  HUD ${r.hud.avg} ms\n` +
      `最慢帧 ${r.最慢帧 ? r.最慢帧.ms + 'ms ← ' + r.最慢帧.归因 : '-'}\n` +
      `实体 ${r.实体}  子弹 ${r.子弹}  粒子 ${r.粒子}  飘字 ${r.飘字}\n` +
      `HUD 节点变更/秒 ${r.HUD每秒变更}   面板节点 ${r.面板节点}\n` +
      `画布 ${r.画布后备} → ${r.画布显示}  DPR ${r.DPR}  状态 ${r.状态}`;
    requestAnimationFrame(tick);
  }
  function toggle() {
    on = !on;
    if (on) {
      install();
      if (!host && typeof document !== 'undefined') {
        host = document.createElement('div');
        host.id = 'perfProbe';
        document.body.appendChild(host);
      }
      if (host) { host.classList.remove('hidden'); tick(); }
    } else if (host) host.classList.add('hidden');
    return on;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', e => { if (e.key === 'F3') { e.preventDefault(); toggle(); } });
  }
  return { toggle, report, get on() { return on; }, install };
})();
