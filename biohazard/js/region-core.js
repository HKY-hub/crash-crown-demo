// ============ 横版场景坐标区域编辑工具 · 数据层（可复用，不碰 DOM） ============
// 拆成两层的理由与本仓其它生成器一致（longmap-gen / villa-gen 同一套路）：
//   数据层无 DOM ⇒ 能在 Node 里无头断言（tools/_check_region_editor.js），也能被别的项目直接 require；
//   渲染与鼠标全在 region-editor.js。
//
// ★ Y 轴正方向：**向下为正**（yDir = +1）。
//   理由不是习惯而是这个仓的事实：场景里 ROOF=202 在 FLOOR=348 之上，数值越小越高；
//   游戏内所有 y 都是这个方向。工具里 yDir 写进导出数据，界面在轴上画箭头标出来；
//   换到「向上为正」的项目里把 yDir 设成 -1 即可，标尺读数与世界映射会一起翻，不需要改代码。
//
// 三套坐标，一次定清楚（后面所有函数只用这三个名字）：
//   ruler  标尺坐标 —— 用户输入/看到的那套（X=1829 就是它），原点 (0,0) 可被鼠标拖动重设
//   world  世界像素 —— 被编辑的内容真正住的那套；world = origin + dir * ruler
//   screen 画布像素 —— 只有渲染层关心；缩放平移只改这一套，所以标尺读数与宽高不随缩放变
const RegionCore = (() => {

  const SCHEMA = 'hky.region-editor/1';
  const EPS = 1e-9;

  // ---------- 状态 ----------
  function createState(opt) {
    const o = opt || {};
    return {
      schema: SCHEMA,
      unit: 'scene-px',
      axis: { xDir: o.xDir === -1 ? -1 : 1, yDir: o.yDir === -1 ? -1 : 1 },
      origin: { x: num(o.originX, 0), y: num(o.originY, 0) },   // 标尺 (0,0) 落在世界的哪个像素上
      regions: [],
      templates: [],
      log: [],                                                  // 修改记录（导出时一起走）
      seq: 1,
    };
  }
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clone = s => JSON.parse(JSON.stringify(s));

  // ---------- 视图（缩放平移）：与 state 分开，导出的是数据不是取景 ----------
  function createView(o) {
    o = o || {};
    return { zoom: num(o.zoom, 1), panX: num(o.panX, 0), panY: num(o.panY, 0) };
  }
  // 标尺 → 画布。zoom 只作用在这一层，所以「171px」这种读数与缩放无关。
  // 画布 y 永远向下长，所以 yDir=-1（向上为正）时标尺读数要反向映射到屏幕上，
  // 否则「向上为正」只是改了个标签、图还是反的。
  function toScreen(view, cv, r, axis) {
    const xd = axis ? axis.xDir : 1, yd = axis ? axis.yDir : 1;
    return {
      x: cv.w / 2 + view.panX + r.x * xd * view.zoom,
      y: cv.h / 2 + view.panY + r.y * yd * view.zoom,
    };
  }
  function toRuler(view, cv, p, axis) {
    const xd = axis ? axis.xDir : 1, yd = axis ? axis.yDir : 1;
    return {
      x: (p.x - cv.w / 2 - view.panX) / view.zoom * xd,
      y: (p.y - cv.h / 2 - view.panY) / view.zoom * yd,
    };
  }
  // 标尺 ↔ 世界（带方向）
  function rulerToWorld(st, r) {
    return { x: st.origin.x + st.axis.xDir * r.x, y: st.origin.y + st.axis.yDir * r.y };
  }
  function worldToRuler(st, w) {
    return { x: (w.x - st.origin.x) * st.axis.xDir, y: (w.y - st.origin.y) * st.axis.yDir };
  }
  // 区域的四条标尺边界 → 世界矩形（左小右大，与方向无关，供内容裁剪用）
  // 注意必须再归一次一化：xDir=-1 时 min/max 经世界映射会互换，不夹就得到一个反向空区间。
  function regionWorldRect(st, reg) {
    const a = rulerToWorld(st, { x: Math.min(reg.left, reg.right), y: Math.min(reg.top, reg.bottom) });
    const b = rulerToWorld(st, { x: Math.max(reg.left, reg.right), y: Math.max(reg.top, reg.bottom) });
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }
  // 移动原点：内容不许跟着标尺跑。做法是把原点挪到指定世界像素，
  // 同时把所有区域的读数平移同样的量 ⇒ 每个区域盖住的世界矩形逐字节不变，宽高也不变。
  function moveOrigin(st, w) {
    const dx = (st.origin.x - w.x) * st.axis.xDir, dy = (st.origin.y - w.y) * st.axis.yDir;
    st.origin = { x: w.x, y: w.y };
    for (const r of st.regions) { r.left += dx; r.right += dx; r.top += dy; r.bottom += dy; }
    return { dx, dy };
  }

  // ---------- 网格与吸附 ----------
  // 自适应步长：缩得再小也保证屏幕上有 ≥ 40px 的间隔，读得清；步长永远是 1/2/5×10^k。
  const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  function autoStep(zoom, minPx) {
    const want = (minPx || 40) / Math.max(0.02, zoom);
    for (const s of STEPS) if (s >= want) return s;
    return 10000;
  }
  function snap(v, step, on) { return on && step > 0 ? Math.round(v / step) * step : v; }

  // ---------- 区域 ----------
  // 存四条边界（不是 x/y/w/h）：拖动任一条只动那一条，宽高是派生量。
  function addRegion(st, b) {
    const reg = {
      id: 'R' + (st.seq++), name: b && b.name ? b.name : '区域 ' + (st.regions.length + 1),
      left: num(b && b.left, 0), right: num(b && b.right, 100),
      top: num(b && b.top, 0), bottom: num(b && b.bottom, 100),
      ops: [],
    };
    st.regions.push(reg);
    return reg;
  }
  const widthOf = r => Math.abs(r.right - r.left);
  const heightOf = r => Math.abs(r.bottom - r.top);
  // 边界一律归一化成「左<右、上<下」，但保留用户给的两条线的值（谁大谁小不影响区间）
  function normalizeBounds(r) {
    const l = Math.min(r.left, r.right), rr = Math.max(r.left, r.right);
    const t = Math.min(r.top, r.bottom), bb = Math.max(r.top, r.bottom);
    return { left: l, right: rr, top: t, bottom: bb };
  }
  function setEdge(st, id, edge, v) {          // 只改这一条边，其余三条一字不动
    const r = st.regions.find(q => q.id === id);
    if (!r || ['left', 'right', 'top', 'bottom'].indexOf(edge) < 0) return null;
    r[edge] = v;
    if (widthOf(r) < 1) { if (edge === 'left') r.left = r.right - 1; else r.right = r.left + 1; }
    if (heightOf(r) < 1) { if (edge === 'top') r.top = r.bottom - 1; else r.bottom = r.top + 1; }
    return r;
  }
  function moveRegion(st, id, dx, dy) {
    const r = st.regions.find(q => q.id === id); if (!r) return null;
    r.left += dx; r.right += dx; r.top += dy; r.bottom += dy;
    return r;
  }
  function resizeRegion(st, id, w, h, anchor) {
    const r = st.regions.find(q => q.id === id); if (!r) return null;
    const b = normalizeBounds(r);
    const a = anchor || 'topleft';
    let x0 = b.left, y0 = b.top;
    if (a === 'center') { x0 = b.left + (widthOf(b) - w) / 2; y0 = b.top + (heightOf(b) - h) / 2; }
    if (a === 'bottomright') { x0 = b.right - w; y0 = b.bottom - h; }
    r.left = x0; r.right = x0 + w; r.top = y0; r.bottom = y0 + h;
    return r;
  }
  function duplicateRegion(st, id, dx, dy) {
    const r = st.regions.find(q => q.id === id); if (!r) return null;
    const c = addRegion(st, { name: r.name + ' 副本', left: r.left + dx, right: r.right + dx,
      top: r.top + dy, bottom: r.bottom + dy });
    return c;
  }
  function deleteRegion(st, id) {
    const i = st.regions.findIndex(q => q.id === id);
    if (i < 0) return false;
    st.regions.splice(i, 1); return true;
  }
  function pointInRegion(st, reg, r) {
    const b = normalizeBounds(reg);
    return r.x >= b.left && r.x <= b.right && r.y >= b.top && r.y <= b.bottom;
  }

  // ---------- 内容（演示用的世界像素网格；换项目时把它换成真实图层即可） ----------
  // 单元 1px 太贵，用 tile 网格；op 只作用于「中心落在选区世界矩形内」的那些 tile。
  function createScene(w, h, tile) {
    const cols = Math.ceil(w / tile), rows = Math.ceil(h / tile), cells = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = 0;
    return { tile, cols, rows, cells, w, h };
  }
  // 确定性花纹：让「改了什么」肉眼可见，且同参数永远同一个结果
  function paintDemoScene(sc) {
    for (let j = 0; j < sc.rows; j++) for (let i = 0; i < sc.cols; i++) {
      const x = i * sc.tile, y = j * sc.tile;
      let v = 1;
      if (y > sc.h * 0.72) v = 3;                                   // 地面
      else if ((i * 7 + j * 3) % 11 === 0) v = 2;                   // 零散构件
      if (x % 640 < 8) v = 4;                                       // 竖向标尺柱
      if (j === Math.floor(sc.rows * 0.72)) v = 5;                  // 地平线
      sc.cells[j * sc.cols + i] = v;
    }
    return sc;
  }
  function cellsInWorldRect(sc, rc) {
    const out = [];
    const i0 = Math.max(0, Math.floor(rc.x0 / sc.tile)), i1 = Math.min(sc.cols - 1, Math.ceil(rc.x1 / sc.tile) - 1);
    const j0 = Math.max(0, Math.floor(rc.y0 / sc.tile)), j1 = Math.min(sc.rows - 1, Math.ceil(rc.y1 / sc.tile) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = i * sc.tile + sc.tile / 2, cy = j * sc.tile + sc.tile / 2;   // 中心判定：边界不抖
      if (cx >= rc.x0 && cx < rc.x1 && cy >= rc.y0 && cy < rc.y1) out.push(j * sc.cols + i);
    }
    return out;
  }
  const OP_KINDS = {
    fill: { 名: '填充', key: 'value', params: { value: 6 } },
    erase: { 名: '擦除', key: 'value', params: { value: 0 } },
    tint: { 名: '改色相', key: 'delta', params: { delta: 2 } },
    hatch: { 名: '斜纹', key: 'value', params: { value: 7, every: 2 } },
    raise: { 名: '抬地板', key: 'dy', params: { dy: 1 } },
  };
  // 所有 op 一律基于「操作前」的那一帧来算，写回时也一次性写：
  // 否则 raise 这类会读邻格的 op，在同一批里读到刚被自己改过的值，形成级联、结果依赖遍历顺序。
  function opCells(sc, idx, kind, params) {
    const p = Object.assign({}, (OP_KINDS[kind] || {}).params, params || {});
    const base = sc.cells.slice();
    for (const k of idx) {
      const v = base[k];
      let t = v;
      if (kind === 'fill') t = p.value;
      else if (kind === 'erase') t = 0;
      else if (kind === 'tint') t = (v + p.delta + 16) % 16;
      else if (kind === 'hatch') {
        const i = k % sc.cols, j = Math.floor(k / sc.cols);
        t = ((i + j) % p.every === 0) ? p.value : v;
      } else if (kind === 'raise') {
        const i = k % sc.cols, j = Math.floor(k / sc.cols);
        t = base[Math.min(sc.rows - 1, Math.max(0, j + p.dy)) * sc.cols + i];
      }
      sc.cells[k] = t;
    }
    return idx.map(k => base[k]);
  }
  // 预览 = 算而不改（合同要求「修改前提供实时预览效果，确认后再生成」）
  // 一次可传多批索引（多区域/批量），返回前后两帧与差异格数，sc.cells 全程不动。
  function opPreview(sc, batches, kind, params) {
    const before = sc.cells.slice();
    const after = before.slice();
    const fake = { tile: sc.tile, cols: sc.cols, rows: sc.rows, cells: after };
    for (const idx of batches) opCells(fake, idx, kind, params);
    let changed = 0;
    for (let k = 0; k < after.length; k++) if (after[k] !== before[k]) changed++;
    return { before, after, changed };
  }

  // ---------- 修改记录 + 撤销 / 重做 ----------
  // 快照式历史：状态很小（区域与模板），比手写反向操作可靠得多。
  // 「内容」那一侧交给内容对象自己快照：演示网格给 cells 数组，真实编组给构件表 ——
  // 同一套撤销既能回滚像素格也能回滚家具。没有这两个方法的老内容对象退回按 cells 处理。
  const 内容快照 = sc => (typeof sc.snapshot === 'function' ? sc.snapshot() : sc.cells.slice());
  const 内容还原 = (sc, s) => { if (typeof sc.restore === 'function') sc.restore(s); else sc.cells = s.slice(); };
  function createHistory(st, sc) {
    return { at: 0, items: [{ st: clone(st), cells: 内容快照(sc), note: '初始' }], limit: 80 };
  }
  function push(h, st, sc, note) {
    h.items.length = h.at + 1;                     // 新操作会丢掉 redo 分支
    h.items.push({ st: clone(st), cells: 内容快照(sc), note });
    if (h.items.length > h.limit) h.items.shift();
    h.at = h.items.length - 1;
  }
  function undo(h, st, sc) {
    if (h.at <= 0) return null;
    h.at--;
    return restore(h, st, sc);
  }
  function redo(h, st, sc) {
    if (h.at >= h.items.length - 1) return null;
    h.at++;
    return restore(h, st, sc);
  }
  function restore(h, st, sc) {
    const it = h.items[h.at];
    const ns = clone(it.st);
    内容还原(sc, it.cells);
    return { state: ns, note: it.note };
  }

  function recordOp(st, reg, kind, params, count, note) {
    const rec = { id: 'OP' + (st.seq++), regionId: reg.id, kind, params: params || {},
      cells: count, at: note && note.at !== undefined ? note.at : 0, note: (note && note.text) || '' };
    reg.ops.push(rec);
    st.log.push({ at: rec.at, op: rec.id, region: reg.id, kind, cells: count });
    return rec;
  }

  // ---------- 模板 / 批量 ----------
  function saveTemplate(st, reg, name) {
    const t = { id: 'T' + (st.seq++), name: name || reg.name,
      w: widthOf(reg), h: heightOf(reg),
      op: reg.ops.length ? { kind: reg.ops[reg.ops.length - 1].kind,
        params: reg.ops[reg.ops.length - 1].params } : null };
    st.templates.push(t);
    return t;
  }
  function applyTemplate(st, t, center) {
    // 从模板新建时对齐到整数，且用「left + w」而不是「center ± w/2」：
    // 后者遇到奇数宽高会掉半个像素，模板的 171 就变成 171.0000000001。
    const l = Math.round(center.x - t.w / 2), t0 = Math.round(center.y - t.h / 2);
    return addRegion(st, { name: t.name, left: l, right: l + t.w, top: t0, bottom: t0 + t.h });
  }
  // 批量：一次作用多个区域，撤销里算**一步**
  function batchTargets(st, ids) { return st.regions.filter(r => ids.indexOf(r.id) >= 0); }

  // ---------- 导入 / 导出 ----------
  function exportJSON(st, view) {
    return JSON.stringify({
      schema: SCHEMA, unit: st.unit, axis: { xDir: st.axis.xDir, yDir: st.axis.yDir },
      origin: { x: st.origin.x, y: st.origin.y },
      regions: st.regions.map(r => ({ id: r.id, name: r.name,
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: widthOf(r), height: heightOf(r), ops: r.ops })),
      templates: st.templates, log: st.log,
      view: view ? { zoom: view.zoom, panX: view.panX, panY: view.panY } : undefined,
    }, null, 2);
  }
  // 校验严格到「宁可拒收也不静默修数据」：坏数据要当场报，不能悄悄夹带一个 NaN 进来
  function importJSON(text) {
    const errs = [];
    let o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, errors: ['JSON 解析失败：' + e.message] }; }
    if (!o || typeof o !== 'object') return { ok: false, errors: ['顶层不是对象'] };
    if (o.schema !== SCHEMA) errs.push('schema 不是 ' + SCHEMA + '（收到 ' + JSON.stringify(o.schema) + '）');
    if (!Array.isArray(o.regions)) errs.push('regions 缺失或不是数组');
    const okNum = v => typeof v === 'number' && isFinite(v);
    const st = createState({});
    if (o.axis) {
      if (!okNum(o.axis.xDir) || !okNum(o.axis.yDir)) errs.push('axis.xDir / axis.yDir 必须是数字');
      else { st.axis.xDir = o.axis.xDir < 0 ? -1 : 1; st.axis.yDir = o.axis.yDir < 0 ? -1 : 1; }
    }
    if (o.origin && (!okNum(o.origin.x) || !okNum(o.origin.y))) errs.push('origin 必须是有限数字');
    else if (o.origin) { st.origin.x = o.origin.x; st.origin.y = o.origin.y; }
    const ids = new Set();
    (o.regions || []).forEach((r, i) => {
      ['left', 'right', 'top', 'bottom'].forEach(k => {
        if (!okNum(r[k])) errs.push('regions[' + i + '].' + k + ' 不是有限数字');
      });
      if (!r.id) errs.push('regions[' + i + '] 缺 id');
      else if (ids.has(r.id)) errs.push('id 重复：' + r.id);
      ids.add(r.id);
      if (okNum(r.width) && Math.abs(r.width - Math.abs(r.right - r.left)) > 0.5)
        errs.push('regions[' + i + '].width 与四条边界对不上（' + r.width + ' vs ' + Math.abs(r.right - r.left) + '）');
      const reg = addRegion(st, r);
      if (r.id) { reg.id = r.id; st.seq = Math.max(st.seq, (parseInt(String(r.id).replace(/\D/g, ''), 10) || 0) + 1); }
      reg.ops = Array.isArray(r.ops) ? r.ops : [];
    });
    (o.templates || []).forEach(t => st.templates.push(Object.assign({ id: 'T' + (st.seq++) }, t)));
    if (Array.isArray(o.log)) st.log = o.log.slice();
    return errs.length ? { ok: false, errors: errs } : { ok: true, state: st, view: o.view };
  }

  // ---------- 标签防遮挡（纯几何，能无头测） ----------
  // used = 已经占好的框（{x,y,w,h}，x/y 是左上角）；want = 想放的位置左上角。
  // 规则：原位不冲突就直接给；否则每次往下挪 (h+2) 再试，最多 6 次；找不到返回 null 让调用方不画。
  function placeLabel(used, want, w, h, prio) {
    const hit = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    for (let k = 0; k < 7; k++) {
      const cand = { x: want.x, y: want.y + k * (h + 2), w, h, prio: prio || 0 };
      if (!used.some(b => hit(b, cand))) return cand;
    }
    return null;
  }

  return {
    SCHEMA, createState, clone, createView, toScreen, toRuler, rulerToWorld, worldToRuler, regionWorldRect,
    moveOrigin,
    autoStep, snap, STEPS,
    addRegion, widthOf, heightOf, normalizeBounds, setEdge, moveRegion, resizeRegion, duplicateRegion,
    deleteRegion, pointInRegion,
    createScene, paintDemoScene, cellsInWorldRect, OP_KINDS, opCells, opPreview,
    createHistory, push, undo, redo, recordOp,
    saveTemplate, applyTemplate, batchTargets,
    exportJSON, importJSON, placeLabel,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RegionCore;
if (typeof window !== 'undefined') window.RegionCore = RegionCore;
