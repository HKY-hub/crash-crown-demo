// ============================================================
// 子系统 2.3 弹窗 & 浮层管理子系统
// 子系统 2.7 的全局 Toast / 新手引导（遮罩资源与步骤数据表在此）
// ============================================================
const Overlay = (() => {
  const h = UIKit.h;
  // ---------- 四级底层数据：弹窗优先级表 ----------
  // 数值越大越优先；equal = 排队，lower 会被 higher 抢占（先挂起再恢复）。
  const PRIORITY = {
    ANTI_ADDICTION: 100,  // 防沉迷/实名强制：不可关闭、不可抢占
    ACCOUNT: 90,          // 账号校验失败
    SYSTEM: 80,           // 断线、致命错误
    CONFIRM: 60,          // 玩家操作确认（放弃更改）
    RESULT: 55,           // 结算
    REWARD: 50,           // 奖励发放
    INFO: 40,             // 普通提示
    ACTIVITY: 20,         // 活动弹窗
    GUIDE: 10,            // 引导气泡
  };
  // 遮罩材质：不同优先级用不同的底，保证高优先级"压黑"周围
  const MASK = {
    hard: 'rgba(2,4,5,.95)',
    dim: 'radial-gradient(80% 80% at 50% 50%, rgba(4,10,12,.72), rgba(2,5,6,.93))',
    none: 'transparent',
  };

  const stack = [];        // 当前实开（栈顶为可见）
  const queue = [];        // 因优先级被挂起的请求
  let seq = 0;

  function top() { return stack[stack.length - 1] || null; }

  // ---------- 基础弹窗模板 + 面板生命周期 ----------
  // 生命周期：create → mount → show → (hide → show)* → destroy
  function open(cfg) {
    const req = {
      id: cfg.id || ('dlg' + (++seq)),
      priority: cfg.priority ?? PRIORITY.INFO,
      cfg, state: 'queued', node: null,
    };
    const cur = top();
    if (cur && cur.priority > req.priority) { queue.push(req); return handle(req); }
    if (cur && cur.priority === req.priority) { queue.push(req); return handle(req); }
    if (cur) { suspend(cur); }
    show(req);
    return handle(req);
  }
  function handle(req) {
    return {
      close: () => close(req),
      node: () => req.node,
      update: patch => { Object.assign(req.cfg, patch); if (req.state === 'open') { close(req, true); } },
    };
  }
  function suspend(req) {
    if (!req.node) return;
    req.node.style.display = 'none';
    req.state = 'suspended';
  }
  function resume(req) {
    if (!req.node) return;
    req.node.style.display = '';
    req.state = 'open';
  }
  function build(req) {
    const c = req.cfg;
    // is-open 决定 .ui-mask 的 display:flex —— 少了它弹窗建出来也是隐形容器
    const mask = h('div', 'ui-mask is-open');
    const bg = h('div', 'ui-mask-bg');
    if (c.mask === 'none') bg.style.background = MASK.none;
    else if (c.mask === 'hard') bg.style.background = MASK.hard;
    const dlg = h('div', 'ui-dlg' + (c.cls ? ' ' + c.cls : ''));
    const f = UIKit.frame('g-panel--pad0' + (c.alert ? ' ui-dlg--alert' : ''), null);
    f.style.setProperty('--cut', '16px');
    const head = h('div', 'ui-dlg-h');
    head.innerHTML = `<i>${c.icon || (c.alert ? '⚠' : '◆')}</i><b>${c.title || '提示'}</b><s></s>`;
    if (c.closable !== false) {
      const x = h('button', 'ui-dlg-x', '✕'); x.type = 'button';
      x.addEventListener('click', () => { UIKit.sfx('back'); close(req); });
      head.appendChild(x);
    }
    const body = h('div', 'ui-dlg-b');
    if (typeof c.body === 'string') body.innerHTML = c.body; else if (c.body) body.appendChild(c.body);
    const foot = h('div', 'ui-dlg-f');
    for (const a of (c.actions || [])) {
      const b = UIKit.btn({ label: a.label, kind: a.kind, icon: a.icon, onClick: () => { if (a.keepOpen !== true) close(req); a.onClick && a.onClick(req); } });
      if (a.primary) foot.appendChild(b); else foot.insertBefore(b, foot.firstChild);
    }
    if (!c.actions || !c.actions.length) foot.remove();
    f.body.append(head, body, foot);
    dlg.appendChild(f);
    mask.append(bg, dlg);
    if (c.closable !== false && c.dismissable !== false) {
      bg.addEventListener('click', () => { UIKit.sfx('back'); close(req); });
    }
    mask.addEventListener('keydown', e => { if (e.key === 'Escape' && c.closable !== false) close(req); });
    req.node = mask; req.$body = body; req.$foot = foot; req.$head = head.querySelector('b');
    return mask;
  }
  function show(req) {
    build(req);
    document.body.appendChild(req.node);
    req.state = 'open';
    stack.push(req);
    UIKit.sfx(req.cfg.alert ? 'error' : 'page');
    if (req.cfg.onMount) { try { req.cfg.onMount(req.node, req); } catch (e) { console.warn('[Overlay] onMount', e); } }
    return req;
  }
  function close(req, silent) {
    const i = stack.indexOf(req);
    if (i >= 0) {
      stack.splice(i, 1);
      if (req.cfg.onClose && !silent) { try { req.cfg.onClose(); } catch (e) { console.warn('[Overlay] onClose', e); } }
      if (req.node) {
        req.node.style.opacity = '0';
        const n = req.node; setTimeout(() => n.remove(), 140);
      }
      req.state = 'destroyed';
    } else {
      const q = queue.indexOf(req);
      if (q >= 0) queue.splice(q, 1);
    }
    const nxt = queue.shift();
    if (nxt) show(nxt);
    else if (stack.length) resume(top());
  }
  function closeTop() {
    const t = top();
    if (!t) return false;
    if (t.cfg.closable === false) return false;
    close(t); return true;
  }
  function isOpen(id) { return stack.some(r => r.id === id) || queue.some(r => r.id === id); }
  function clearAll() { [...stack].reverse().forEach(r => close(r, true)); queue.length = 0; }

  // ---------- 模板：确认 / 提示 / 输入 / 列表 ----------
  function confirm(o) {
    return open({
      title: o.title || '确认操作', icon: o.icon || '?', priority: o.priority ?? PRIORITY.CONFIRM,
      body: o.html || UIKit.esc(o.text || ''), alert: o.alert,
      actions: [
        { label: o.cancelText || '取消', kind: 'dark', onClick: o.onCancel },
        { label: o.okText || '确定', kind: o.alert ? 'danger' : 'primary', primary: true, onClick: o.onOk },
      ],
      onClose: o.onDismiss,
    });
  }
  function alert(o) {
    return open({
      title: o.title || '提示', icon: o.icon || '', alert: o.alert !== false,
      priority: o.priority ?? PRIORITY.INFO, body: o.html || UIKit.esc(o.text || ''),
      actions: [{ label: o.okText || '知道了', kind: 'primary', primary: true, onClick: o.onOk }],
    });
  }
  function prompt(o) {
    const inp = h('input', 'ui-dlg-input');
    inp.value = o.value || ''; inp.maxLength = o.maxLength || 24; inp.placeholder = o.placeholder || '';
    const wrap = h('div', '', `<div class="cap" style="margin-bottom:8px">${UIKit.esc(o.hint || '')}</div>`);
    wrap.appendChild(inp);
    let val = null;
    const handle = open({
      title: o.title || '请输入', body: wrap,
      actions: [
        { label: '取消', kind: 'dark' },
        { label: o.okText || '确定', kind: 'primary', primary: true, onClick: () => { val = inp.value.trim(); o.onOk && o.onOk(val); } },
      ],
      onMount: () => setTimeout(() => inp.focus(), 40),
    });
    handle.getValue = () => val;
    return handle;
  }
  // 列表弹窗：options=[{l, note, icon, value}]
  function picker(o) {
    const list = h('div', 'g-scroll');
    list.style.maxHeight = '54vh';
    for (const it of (o.options || [])) {
      const row = h('div', 'ui-list-item');
      row.innerHTML = `<i>${it.icon || '›'}</i><span>${it.l}</span>` + (it.note ? `<u>${it.note}</u>` : '');
      row.addEventListener('click', () => { UIKit.sfx('select'); close(hdl); o.onPick && o.onPick(it.value ?? it, it); });
      list.appendChild(row);
    }
    const hdl = open({ title: o.title || '请选择', body: list, cls: o.cls, priority: o.priority });
    return hdl;
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && top()) { if (top().cfg.closable !== false) { e.stopPropagation(); close(top()); } }
  }, true);

  // 伤害飘字沿用 js/ui.js 的 canvas 层实现（game.js 的 texts 队列），
  // 这里不再另建一套 DOM 通道；2.7 的「伤害数字」开关直接管着那条路径。
  return {
    PRIORITY, open, close, closeTop, confirm, alert, prompt, picker, clearAll, isOpen,
    get count() { return stack.length; },
  };
})();

// ============================================================
// 子系统 2.2 的"红点通知" + 2.7 的"全局 Toast"
// ============================================================
const Notify = (() => {
  // 四级底层数据：红点配置表（key → 判定函数 + 是否一次性）
  const REDDOTS = {
    'nav.warehouse': { once: false, check: () => !!localStorage.getItem('zombie_wh_dirty') },
    'nav.ddt': { once: true, key: 'rd_ddt', check: () => true },
    'banner.event': { once: true, key: 'rd_event', check: () => true },
    'mode.siege': { once: true, key: 'rd_siege', check: () => true },
    'guide': { once: true, key: 'rd_guide', check: () => !localStorage.getItem('zombie_guide_done') },
    'settings.crosshair': { once: true, key: 'rd_cross', check: () => true },
    'backpack': { once: false, key: 'rd_bp', check: () => false },
  };
  function on(id) {
    const c = REDDOTS[id]; if (!c) return false;
    if (c.once && c.key && localStorage.getItem(c.key)) return false;
    try { return !!c.check(); } catch (e) { return false; }
  }
  function seen(id) { const c = REDDOTS[id]; if (c && c.once && c.key) localStorage.setItem(c.key, '1'); }
  function bind(node, id) {
    node.__reddot = id;
    refresh(node, id);
    return node;
  }
  function refresh(node, id) {
    id = id || node.__reddot;
    let b = node.querySelector(':scope > .g-badge');
    const active = on(id);
    if (active && !b) { b = UIKit.badge(null); node.appendChild(b); }
    if (!active && b) b.remove();
  }
  function refreshAll(root) {
    (root || document).querySelectorAll('[data-reddot]').forEach(n => refresh(n, n.dataset.reddot));
  }
  return { REDDOTS, on, seen, bind, refresh, refreshAll };
})();

const Toast = (() => {
  let root = null;
  const ICON = { ok: '✓', warn: '!', err: '✕', info: 'i', reward: '★' };
  function push(msg, o = {}) {
    if (!root) { root = document.createElement('div'); root.id = 'toastRoot'; document.body.appendChild(root); }
    const kind = o.kind || 'ok';
    const n = UIKit.h('div', 'ui-toast ui-toast--' + kind);
    n.innerHTML = `<i>${o.icon || ICON[kind] || '•'}</i><span>${o.title ? `<b>${UIKit.esc(o.title)}</b> ` : ''}${UIKit.esc(msg)}</span>`;
    root.appendChild(n);
    UIKit.sfx(kind === 'err' ? 'error' : (kind === 'reward' ? 'reward' : 'select'));
    const dur = o.dur ?? 2200;
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 260); }, dur);
    while (root.children.length > 4) root.firstChild.remove();
    return n;
  }
  return {
    push,
    ok: (m, o) => push(m, { ...o, kind: 'ok' }),
    warn: (m, o) => push(m, { ...o, kind: 'warn' }),
    err: (m, o) => push(m, { ...o, kind: 'err' }),
    info: (m, o) => push(m, { ...o, kind: 'info' }),
    reward: (m, o) => push(m, { ...o, kind: 'reward' }),
  };
})();

// ============================================================
// 子系统 2.7 新手引导 UI
// 引导步骤数据表 + 引导遮罩资源（box-shadow 挖孔，无位图）
// ============================================================
const Guide = (() => {
  const STEPS = [
    { target: '#lbTopRes', title: '玩家资源', text: '这里显示你的<b>等级、经验与三种货币</b>。金币用于解锁背包槽位，钻石用于仓库里的武器，体力每局消耗 1 点。', side: 'bottom' },
    { target: '#lbModes', title: '模式选择', text: '四种玩法入口：<b>逃亡</b>是生化追逃主玩法，<b>竞技</b>为红蓝对枪，<b>战术攻防</b>是攻守回合，<b>别墅突袭</b>换到室内四层地图。选中后右侧与中央会同步刷新。', side: 'right' },
    { target: '#lbSlotRow', title: '出战装备', text: '四个槽位来自当前<b>开局背包</b>。点右侧「仓库」可换枪、配近战与投掷物，保存后立即可用。', side: 'top' },
    { target: '#lbWpnPanel', title: '武器快速预览', text: '不用进仓库也能看弹道：这里是主武器的<b>同源模型</b>与五维属性条，与局内手持完全一致。', side: 'left' },
    { target: '#lbBanner', title: '活动入口', text: '限时活动与公告在这里轮播，右上角<b>红点</b>表示有未查看的内容。', side: 'left' },
    { target: '#lbNav', title: '底部导航', text: '大厅 / 仓库 / 训练营 / 多人 / 设置 五个一级页面在此切换，右下角是<b>开始游戏</b>。', side: 'top' },
    { target: '#lbStartBtn', title: '开始战斗', text: '确认模式与背包后点这里，会先进入<b>对局加载页</b>再进入战场。祝你好运，幸存者。', side: 'top' },
  ];
  let idx = -1, root = null, hole = null, bubble = null, cur = null;

  function ensure() {
    if (root) return;
    root = UIKit.h('div', ''); root.id = 'guideRoot';
    hole = UIKit.h('div', 'gd-hole');
    bubble = UIKit.h('div', 'gd-bubble');
    const f = UIKit.frame('', null);
    f.style.setProperty('--cut', '5px');
    f.body.innerHTML = `<div class="gd-step"></div><div class="gd-title"></div><div class="gd-text"></div>
      <div class="gd-foot"><div class="gd-dots"></div></div>`;
    const skip = UIKit.btn({ label: '跳过', kind: 'dark', size: 'sm', onClick: () => stop(false) });
    const next = UIKit.btn({ label: '下一步', kind: 'primary', size: 'sm', onClick: () => go(1) });
    next.classList.add('gd-next');
    f.body.querySelector('.gd-foot').append(skip, next);
    bubble.appendChild(f);
    root.append(hole, bubble);
    document.body.appendChild(root);
  }
  function place() {
    const st = STEPS[idx]; if (!st) return;
    const t = document.querySelector(st.target);
    cur = t;
    const W = innerWidth, H = innerHeight;
    let r = { left: W / 2 - 120, top: H / 2 - 80, width: 240, height: 160 };
    if (t) r = t.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, {
      left: (r.left - pad) + 'px', top: (r.top - pad) + 'px',
      width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px',
    });
    bubble.querySelector('.gd-step').textContent = `STEP ${idx + 1} / ${STEPS.length}`;
    bubble.querySelector('.gd-title').textContent = st.title;
    bubble.querySelector('.gd-text').innerHTML = st.text;
    const dots = bubble.querySelector('.gd-dots'); dots.innerHTML = '';
    STEPS.forEach((_, i) => { const d = UIKit.h('i', i === idx ? 'on' : ''); dots.appendChild(d); });
    const bw = 330, bh = bubble.offsetHeight || 170;
    let x, y;
    if (st.side === 'right') { x = r.right + 16; y = r.top; }
    else if (st.side === 'left') { x = r.left - bw - 16; y = r.top; }
    else if (st.side === 'top') { x = r.left + r.width / 2 - bw / 2; y = r.top - bh - 16; }
    else { x = r.left + r.width / 2 - bw / 2; y = r.bottom + 16; }
    bubble.style.left = Math.max(12, Math.min(W - bw - 12, x)) + 'px';
    bubble.style.top = Math.max(12, Math.min(H - bh - 12, y)) + 'px';
    bubble.querySelector('.gd-next').querySelector('span').textContent = idx === STEPS.length - 1 ? '完成引导' : '下一步';
  }
  function go(d) {
    const n = idx + d;
    if (n >= STEPS.length) return stop(true);
    idx = n; place(); UIKit.sfx('page');
  }
  function start(from = 0) {
    if (!document.getElementById('menu') || document.getElementById('menu').classList.contains('hidden')) return;
    ensure(); idx = from; root.classList.add('on'); place();
  }
  function stop(finished) {
    if (root) root.classList.remove('on');
    idx = -1;
    if (finished) { localStorage.setItem('zombie_guide_done', '1'); Notify.refreshAll(); Toast.ok('引导已完成，可在「设置 · 辅助」里重放'); }
  }
  addEventListener('resize', () => { if (idx >= 0) place(); });
  return { STEPS, start, stop, get active() { return idx >= 0; }, replay: () => start(0) };
})();
