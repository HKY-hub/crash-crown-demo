// ============ 横版场景坐标区域编辑工具 · 界面层 ============
// 只做三件事：把 RegionCore 的状态画出来、把鼠标键盘事件翻译成 RegionCore 的调用、
// 以及在每次「提交」时往历史里压一帧快照。几何与判定全在数据层，这里不重复实现一遍。
const RegionEditor = (() => {
  const C = RegionCore;
  const PAL = {
    bg: '#070b0f', grid: '#13212c', gridMajor: '#1f3a4c', axis: '#3f7f9c', axisTxt: '#7fd0e8',
    quad: '#2b4a5c', scene: ['#000000', '#22303a', '#3d5566', '#2f4a2e', '#5b4a2a', '#7a6a3a', '#c8543a', '#3aa0c8'],
    region: '#39ff14', regionDim: '#1d7a10', regionFill: 'rgba(57,255,20,0.10)',
    guide: '#ffb04a', preview: 'rgba(255,176,74,0.35)', sel: '#eafff0', txt: '#cfe3ee', dim: '#6d8595',
  };
  let cv, ctx, dpr = 1, cvSize = { w: 960, h: 540 };
  let st, view, hist;
  let tool = 'select', sel = null, hover = null, drag = null, multi = new Set();
  let snapOn = true, step = 50, preview = null, lastOp = null, lastBoxes = [], badgeBox = null;
  let space = false;
  let vx = [], hy = [];                                   // 「定 X 范围 / 定 Y 范围」放的两条定位线
  const EDGES = [['left', 'v'], ['right', 'v'], ['top', 'h'], ['bottom', 'h']];
  let el = {};
  const 顶条 = 22;                                          // 画布顶部那条读数条占掉的高度，画字要避开
  let be = null, 已启动 = false;                              // 内容后端：演示网格 / 火车地图
  const IDS = ['cv', 'list', 'count', 'x0', 'x1', 'y0', 'y1', 'dims', 'flash', 'hint', 'readout', 'zoom',
    'opkind', 'pv', 'pvName', 'pe', 'peWrap', 'tplName', 'tplIdx', 'tplList', 'io', 'steps', 'batchOp',
    'snapbox', 'ydir', 'apply', 'stepbox', 'originRead', 'opnote'];

  // ---------- 内容后端一：演示网格（原有行为，一字不改地包一层） ----------
  function demoBackend(scene) {
    const ops = {};
    for (const k of Object.keys(C.OP_KINDS))
      ops[k] = { 名: C.OP_KINDS[k].名, key: C.OP_KINDS[k].key, 默认: C.OP_KINDS[k].params[C.OP_KINDS[k].key],
        附加: k === 'hatch' ? 'every' : null, 附加默认: 2, 说明: '把选区内的格子按「' + C.OP_KINDS[k].名 + '」改掉' };
    const 格 = i => { const c = i % scene.cols, r = (i / scene.cols) | 0, t = scene.tile;
      return { x0: c * t, y0: r * t, x1: (c + 1) * t, y1: (r + 1) * t }; };
    // 界面传进来的已经是世界矩形（regionWorldRect 在界面层算过一次），后端不许再换算一遍
    const 算 = rects => rects.map(rc => C.cellsInWorldRect(scene, rc));
    return {
      名: '演示网格', ops, scene,
      world: () => ({ x0: 0, y0: 0, x1: scene.w, y1: scene.h }),
      preview(st, rects, kind, params) {
        const pv = C.opPreview(scene, 算(rects), kind, params);
        const 高亮 = [];
        for (let i = 0; i < pv.after.length; i++) if (pv.after[i] !== pv.before[i]) 高亮.push(格(i));
        // 带上 before/after/changed：界面与闸门都按这几个字段读差异
        return Object.assign({}, pv, { 改动数: pv.changed, 高亮, 变了: pv.changed > 0 });
      },
      apply(st, rects, kind, params) {
        const bs = 算(rects);
        let n = 0;
        for (const idx of bs) { C.opCells(scene, idx, kind, params); n += idx.length; }
        return { 改动数: n, 高亮: [], 变了: n > 0 };
      },
      digest() { const c = scene.cells; let h = 2166136261, s = 0;
        for (let i = 0; i < c.length; i++) { h ^= c[i]; h = Math.imul(h, 16777619) >>> 0; s += c[i]; }
        return h + '|' + c.length + '|' + s; },
      snapshot() { return scene.cells.slice(); },
      restore(s) { scene.cells = s.slice(); },
      probe() { return { 说明: '' }; },
      drawBase(ctx, view, st, cvSize) {
        const t = scene.tile, tl = C.toRuler(view, cvSize, { x: 0, y: 0 }, st.axis);
        const br = C.toRuler(view, cvSize, { x: cvSize.w, y: cvSize.h }, st.axis);
        const wa = C.rulerToWorld(st, { x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y) });
        const wb = C.rulerToWorld(st, { x: Math.max(tl.x, br.x), y: Math.max(tl.y, br.y) });
        const i0 = Math.max(0, Math.floor(Math.min(wa.x, wb.x) / t) - 1), i1 = Math.min(scene.cols - 1, Math.ceil(Math.max(wa.x, wb.x) / t));
        const j0 = Math.max(0, Math.floor(Math.min(wa.y, wb.y) / t) - 1), j1 = Math.min(scene.rows - 1, Math.ceil(Math.max(wa.y, wb.y) / t));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const v = scene.cells[j * scene.cols + i]; if (!v) continue;
          const p = C.toScreen(view, cvSize, C.worldToRuler(st, { x: i * t, y: j * t }), st.axis);
          const q = C.toScreen(view, cvSize, C.worldToRuler(st, { x: (i + 1) * t, y: (j + 1) * t }), st.axis);
          ctx.fillStyle = PAL.scene[v % PAL.scene.length];
          ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x) + 0.6, Math.abs(q.y - p.y) + 0.6);
        }
      },
      highlight(ctx, view, st, cvSize, 高亮) {
        ctx.fillStyle = PAL.preview;
        for (const r of 高亮) {
          const p = C.toScreen(view, cvSize, C.worldToRuler(st, { x: r.x0, y: r.y0 }), st.axis);
          const q = C.toScreen(view, cvSize, C.worldToRuler(st, { x: r.x1, y: r.y1 }), st.axis);
          ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y));
        }
      },
    };
  }

  // ---------- 启动 ----------
  // 换一颗内容后端（火车地图页换 seed / 重放净差后要用）：区域留着，历史按新内容重建
  function 换后端(新后端) {
    be = 新后端;
    hist = C.createHistory(st, be);
    preview = null; lastOp = null;
    建操作下拉(); syncOpKind(); syncAll();
  }
  function boot(后端) {
    IDS.forEach(k => el[k] = document.getElementById(k));
    cv = el.cv; ctx = cv.getContext('2d');
    st = C.createState({ originX: 0, originY: 0, yDir: 1 });
    view = C.createView({ zoom: 1, panX: 0, panY: 0 });
    be = typeof 后端 === 'function' ? 后端(st) : 后端 || demoBackend(C.paintDemoScene(C.createScene(4000, 1200, 8)));
    已启动 = true;
    resize();                                             // 先定尺寸，下面的取景要按屏幕算
    step = C.autoStep(view.zoom, 44);
    建操作下拉();
    const 初 = be.初始区域 ? be.初始区域() : { left: 1829, right: 2000, top: 200, bottom: 400, name: '示例 171×200' };
    const r = C.addRegion(st, 初);
    // 历史基线必须在「开机就有的区域」建好之后再打：否则第一次撤销会把开机选区一起抹掉
    hist = C.createHistory(st, be);
    sel = r.id; multi = new Set([r.id]);
    const b = C.normalizeBounds(r);
    vx = [b.left, b.right]; hy = [b.top, b.bottom];
    frameRect(b, 0.5);                                    // 开机就把示例框到视野里
    wire(); setTool(); syncAll();
    requestAnimationFrame(loop);
  }
  function 建操作下拉() {
    for (const id of ['opkind', 'batchOp']) {
      const s = el[id]; if (!s) continue;
      const 保 = s.value;
      s.innerHTML = '';
      for (const k of Object.keys(be.ops)) {
        const op = document.createElement('option');
        op.value = k; op.textContent = be.ops[k].名; s.appendChild(op);
      }
      if (保 && be.ops[保]) s.value = 保;
    }
  }

  // ---------- 坐标换算（界面里只允许这两个口子） ----------
  const toS = r => C.toScreen(view, cvSize, r, st.axis);
  const toR = p => C.toRuler(view, cvSize, p, st.axis);
  const snapV = v => C.snap(v, step, snapOn);
  function evPt(e) {
    const b = cv.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  // 把某个标尺矩形取景到视口中央：证明「缩放平移只是换画面，读数与宽高一个字节都不动」
  function frameRect(b, keep) {
    const w = Math.max(1, C.widthOf(b)), h = Math.max(1, C.heightOf(b));
    const z = Math.max(0.05, Math.min(40, Math.min(cvSize.w * (keep || 0.5) / w, cvSize.h * (keep || 0.5) / h)));
    view.zoom = z;
    view.panX = -(b.left + b.right) / 2 * st.axis.xDir * z;
    view.panY = -(b.top + b.bottom) / 2 * st.axis.yDir * z;
    step = C.autoStep(z, 44);
    el.zoom && (el.zoom.textContent = (z * 100).toFixed(0) + '%');
  }

  // ---------- 命中：先区域内边界，再区域体，最后才认整根定位线 ----------
  function edgeSeg(b, k) {
    return k === 'left' || k === 'right'
      ? { a: toS({ x: b[k], y: b.top }), bb: toS({ x: b[k], y: b.bottom }), ax: 'x', at: b[k] }
      : { a: toS({ x: b.left, y: b[k] }), bb: toS({ x: b.right, y: b[k] }), ax: 'y', at: b[k] };
  }
  function hitTest(p) {
    const r = toR(p);
    for (const id of orderForHit()) {
      const reg = st.regions.find(q => q.id === id); if (!reg) continue;
      const b = C.normalizeBounds(reg);
      for (const [k] of EDGES) {
        const s = edgeSeg(b, k);
        if (distToSeg(p, { a: s.a, b: s.bb }) < 7) return { id: reg.id, edge: k, kind: 'edge' };
      }
      if (C.pointInRegion(st, b, r)) return { id: reg.id, kind: 'body' };
    }
    // 定位线是画满整屏的：线伸出区域外的那一段也要能拖，否则「拖动定位线」只剩区域内那一截。
    // 放在最后一级：只有既没碰到边界也没在某个框里时才生效，不会和「移动区域」抢。
    if (sel) {
      const reg = st.regions.find(q => q.id === sel);
      if (reg) for (const [k] of EDGES) {
        const b = C.normalizeBounds(reg);
        const s = edgeSeg(b, k), L = s.ax === 'x'
          ? { a: { x: s.a.x, y: 0 }, b: { x: s.a.x, y: cvSize.h } }
          : { a: { x: 0, y: s.a.y }, b: { x: cvSize.w, y: s.a.y } };
        if (distToSeg(p, L) < 5) return { id: reg.id, edge: k, kind: 'edge' };
      }
    }
    return null;
  }
  function orderForHit() {
    return sel ? [sel].concat(st.regions.map(q => q.id).filter(i => i !== sel)) : st.regions.map(q => q.id);
  }
  function distToSeg(p, s) {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
    let t = L2 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
  }

  // ---------- 鼠标按下 ----------
  function onDown(e) {
    if (e.button === 1 || tool === 'pan' || space) { startPan(e); return; }
    const p = evPt(e), r = toR(p);
    if (tool === 'origin') {
      const q = { x: snapV(r.x), y: snapV(r.y) };
      const world = C.rulerToWorld(st, q);                // 点这一下时，这里盖着哪个内容像素
      const moved = C.moveOrigin(st, world);              // 原点挪过去，区域读数同步平移
      const s0 = toS({ x: 0, y: 0 });                     // 再把视口挪一点，让十字交点正好落在指针上
      view.panX += p.x - s0.x; view.panY += p.y - s0.y;
      // 定位线跟着一起平移，才继续指着那两条边；清零会让新手面板第 2、3 步莫名退回未完成
      vx = vx.map(v => v + moved.dx); hy = hy.map(v => v + moved.dy);
      commit('原点移到内容 X=' + world.x.toFixed(0) + ' Y=' + world.y.toFixed(0));
      flash('原点已设为该内容像素（' + world.x.toFixed(0) + ',' + world.y.toFixed(0) + '）· ' +
        '区域读数平移 ' + moved.dx.toFixed(0) + ',' + moved.dy.toFixed(0) + '，宽高不变，盖住的内容没变');
      return;
    }
    if (tool === 'vline' || tool === 'hline') { placeLine(tool === 'vline' ? 'v' : 'h', snapV(tool === 'vline' ? r.x : r.y), p); return; }
    if (tool === 'rect') {
      const a = { x: snapV(r.x), y: snapV(r.y) };
      const reg = C.addRegion(st, { left: a.x, right: a.x + 1, top: a.y, bottom: a.y + 1 });
      sel = reg.id; multi = new Set([reg.id]);
      drag = { id: reg.id, kind: 'new', a, p0: p }; syncAll(); return;
    }
    const h = hitTest(p);
    if (h) {
      if (e.shiftKey) { multi.has(h.id) ? multi.delete(h.id) : multi.add(h.id); sel = h.id; }
      else { sel = h.id; multi = new Set([h.id]); }
      if (h.kind === 'body') {
        const reg = st.regions.find(q => q.id === h.id);
        drag = { id: h.id, kind: 'body', p0: p, offX: r.x - reg.left, offY: r.y - reg.top,
          w: reg.right - reg.left, h: reg.bottom - reg.top, moved: false };
      } else drag = { id: h.id, edge: h.edge, p0: p, moved: false };
      syncInputs(); return;
    }
    sel = null; multi.clear(); vx = []; hy = []; syncInputs();
    startPan(e);
  }
  // 一条线只改它自己那一根：第 1、2 次点击定两条线，第 3 次起改离得最近的那条
  function placeLine(ax, v, p) {
    const arr = ax === 'v' ? vx : hy;
    const which = arr.length >= 2 ? (Math.abs(v - arr[0]) <= Math.abs(v - arr[1]) ? 0 : 1) : arr.length;
    if (arr.length >= 2) arr[which] = v; else arr.push(v);
    const reg = activeOrNew();
    if (arr.length >= 2) {
      const lo = Math.min(arr[0], arr[1]), hi = Math.max(arr[0], arr[1]);
      // 关键：写回时只碰这一对边，另一对边原样留着（第 4 条要求「只有选中的那一个矩形被改」）
      if (ax === 'v') { reg.left = lo; reg.right = hi; } else { reg.top = lo; reg.bottom = hi; }
    } else if (ax === 'v') { reg.left = v; reg.right = v + 1; }
    else { reg.top = v; reg.bottom = v + 1; }
    const EDGE = ax === 'v' ? ['left', 'right', 'right'] : ['top', 'bottom', 'bottom'];
    drag = { id: reg.id, edge: EDGE[which], p0: p, moved: false };
    commit('放' + (ax === 'v' ? '竖' : '横') + '定位线 @ ' + v.toFixed(0));
    const pair = arr.slice().sort((a, b) => a - b);
    flash((ax === 'v' ? 'X' : 'Y') + ' 范围 ' + (arr.length < 2
      ? '已放第一条 ' + fmt(v) + '，再点一下放第二条'
      : fmt(pair[0]) + ' → ' + fmt(pair[1]) + ' = ' +
        fmt(ax === 'v' ? C.widthOf(reg) : C.heightOf(reg)) + 'px'));
    syncAll();
  }
  function activeOrNew() {
    const cur = st.regions.find(q => q.id === sel);
    if (cur) return cur;
    const r = C.addRegion(st, { left: 0, right: 1, top: 0, bottom: 1, name: '区域 ' + (st.regions.length + 1) });
    sel = r.id; multi = new Set([r.id]); return r;
  }
  function startPan(e) {
    const p = evPt(e);
    drag = { kind: 'pan', p0: p, v0: { x: view.panX, y: view.panY } };
  }
  function onMove(e) {
    const p = evPt(e), r = toR(p);
    if (el.readout) {
      const w = C.rulerToWorld(st, r);
      const 附 = be.probe ? be.probe(w).说明 : '';
      el.readout.textContent = '指针标尺 X ' + r.x.toFixed(1) + '  Y ' + r.y.toFixed(1) +
        '   |   内容像素 X ' + w.x.toFixed(0) + '  Y ' + w.y.toFixed(0) +
        '   |   吸附 ' + step + 'px' + (snapOn ? '' : '（已关）') + (附 ? '   |   ' + 附 : '');
    }
    if (!drag) { hover = hitTest(p); cv.style.cursor = cursorFor(hover, p); return; }
    if (drag.kind === 'pan') {
      view.panX = drag.v0.x + (p.x - drag.p0.x); view.panY = drag.v0.y + (p.y - drag.p0.y); return;
    }
    if (drag.kind === 'new') {
      const reg = st.regions.find(q => q.id === drag.id); if (!reg) return;
      const b = { x: snapV(r.x), y: snapV(r.y) };
      reg.left = Math.min(drag.a.x, b.x); reg.right = Math.max(drag.a.x, b.x);
      reg.top = Math.min(drag.a.y, b.y); reg.bottom = Math.max(drag.a.y, b.y);
      vx = [reg.left, reg.right]; hy = [reg.top, reg.bottom];
      syncInputs(); return;
    }
    const reg = st.regions.find(q => q.id === drag.id); if (!reg) return;
    if (drag.kind === 'body') {
      reg.left = snapV(r.x - drag.offX); reg.top = snapV(r.y - drag.offY);
      reg.right = reg.left + drag.w; reg.bottom = reg.top + drag.h;   // 宽高带着走：只挪位置，不改形状
      drag.moved = true; syncInputs(); return;
    }
    const v = snapV(drag.edge === 'left' || drag.edge === 'right' ? r.x : r.y);
    const keep = { left: reg.left, right: reg.right, top: reg.top, bottom: reg.bottom };
    C.setEdge(st, reg.id, drag.edge, v);
    // 只允许这一条边变；其余三条只要被动过就还原 —— 这是「拖一条不改别的」的运行时保证
    for (const k of ['left', 'right', 'top', 'bottom']) if (k !== drag.edge) reg[k] = keep[k];
    const b = C.normalizeBounds(reg);
    if (drag.edge === 'left' || drag.edge === 'right') vx = [b.left, b.right]; else hy = [b.top, b.bottom];
    drag.moved = true; syncInputs();
  }
  function cursorFor(h, p) {
    if (tool === 'pan') return space ? 'grabbing' : 'grab';
    if (tool !== 'select') return 'crosshair';
    if (!h) return 'default';
    if (h.kind === 'body') return 'move';
    return h.edge === 'left' || h.edge === 'right' ? 'col-resize' : 'row-resize';
  }
  function onUp() {
    if (!drag) return;
    if (drag.kind === 'body' && drag.moved) commit('移动区域');
    else if (drag.kind === 'edge' && drag.moved) commit('拖动 ' + drag.edge + ' 边界');
    else if (drag.kind === 'new') {
      const reg = st.regions.find(q => q.id === drag.id);
      if (reg && C.widthOf(reg) < 1 && C.heightOf(reg) < 1) C.deleteRegion(st, reg.id);
      else commit('拉框新建区域');
      tool = 'select'; setTool(); syncAll();
    }
    drag = null;
  }
  function onWheel(e) {
    e.preventDefault();
    const p = evPt(e), before = toR(p);                   // 记下指针指的标尺点
    view.zoom = Math.max(0.05, Math.min(40, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = toS(before);                            // 以光标为锚：缩放后那点必须还在原像素上，
    view.panX += p.x - after.x; view.panY += p.y - after.y;  // 否则「缩放后坐标仍准」就是空话
    step = C.autoStep(view.zoom, 44);
    el.zoom && (el.zoom.textContent = (view.zoom * 100).toFixed(0) + '%');
    if (el.stepbox) el.stepbox.textContent = step;
  }

  // ---------- 提交与历史（内容快照走后端，网格与真实编组共用同一套撤销） ----------
  function commit(note) { C.push(hist, st, be, note); syncAll(); }
  function doUndo() { const r = C.undo(hist, st, be); r ? (st = r.state, after('撤销：' + r.note)) : flash('已经是最早一步', 1); }
  function doRedo() { const r = C.redo(hist, st, be); r ? (st = r.state, after('重做：' + r.note)) : flash('没有可重做的了', 1); }
  function after(msg) {
    if (!st.regions.find(q => q.id === sel)) sel = st.regions.length ? st.regions[0].id : null;
    multi = new Set([...multi].filter(id => st.regions.find(q => q.id === id)));
    preview = null; syncAll(); if (msg) flash(msg);
  }

  // ---------- 修改（预览 → 确认应用 → 重复 / 批量）；具体落子全在后端，这里只管选区与记录 ----------
  function opTargets() {
    return multi.size > 1 ? C.batchTargets(st, [...multi])
      : (sel ? [st.regions.find(q => q.id === sel)].filter(Boolean) : []);
  }
  const 世界矩形们 = tg => tg.map(r => C.regionWorldRect(st, r));
  function 报(pv) {
    return pv.通行件 ? '；区内另有 ' + pv.通行件 + ' 件通行构件不在可改范围[' + (pv.通行名 || []).join('、') + ']' : '';
  }
  function doPreview() {
    const tg = opTargets(); if (!tg.length) return flash('先选一个区域再预览', 1);
    const kind = el.opkind.value, params = readParams();
    const pv = be.preview(st, 世界矩形们(tg), kind, params);        // 算而不改
    if (pv.拒绝) return flash(pv.拒绝, 1);
    preview = Object.assign({ kind, params, 区域数: tg.length }, pv);
    flash('预览 ' + be.ops[kind].名 + ' · ' + tg.length + ' 个区域 · 命中 ' + pv.改动数 +
      ' 处（只算没改，点「确认应用」才落）' + 报(pv));
  }
  function doApply() {
    if (!preview) return flash('先点「预览」确认效果，再应用', 1);
    const tg = opTargets();
    const r = be.apply(st, 世界矩形们(tg), preview.kind, preview.params);
    if (r.拒绝) { preview = null; return flash(r.拒绝, 1); }
    if (r.回滚) { preview = null; return flash(r.回滚 + '（' + r.原因 + '）', 1); }
    for (const reg of tg) C.recordOp(st, reg, preview.kind, preview.params, r.改动数, { text: be.ops[preview.kind].名 });
    lastOp = { kind: preview.kind, params: preview.params };
    preview = null;
    commit('应用修改 → ' + tg.map(t => t.id).join('+'));
    flash('已应用 ' + be.ops[lastOp.kind].名 + '：改动 ' + r.改动数 + ' 处（可直接撤销）' +
      (r.验证 ? ' · 路线验证 通关=' + (r.验证.ok ? 'OK' : 'FAIL') + ' 追兵=' + (r.验证.追兵ok ? 'OK' : 'FAIL') : 报(r)));
  }
  function doRepeat() {
    if (!lastOp) return flash('这一轮还没有已应用的修改', 1);
    const tg = opTargets(); if (!tg.length) return flash('先选区域', 1);
    const r = be.apply(st, 世界矩形们(tg), lastOp.kind, lastOp.params);
    if (r.拒绝 || r.回滚) return flash(r.拒绝 || (r.回滚 + '（' + r.原因 + '）'), 1);
    for (const reg of tg) C.recordOp(st, reg, lastOp.kind, lastOp.params, r.改动数, { text: '重复上一次修改' });
    commit('重复修改 ' + lastOp.kind + ' → ' + tg.map(t => t.id).join('+'));
    flash('已把上一次修改重复到 ' + tg.length + ' 个区域：改动 ' + r.改动数 + ' 处');
  }
  function readParams() {
    const k = el.opkind.value, spec = be.ops[k] || {}, p = {};
    if (spec.key) p[spec.key] = +el.pv.value;
    if (spec.附加) p[spec.附加] = +el.pe.value;
    return p;
  }
  function doBatchAll() {
    const kind = el.batchOp.value, ids = [...multi];
    if (ids.length < 2) return flash('批量要至少选中 2 个区域（Shift 点选），现在只选了 ' + ids.length, 1);
    const tg = C.batchTargets(st, ids), 参数 = {};
    const spec = be.ops[kind] || {};
    if (spec.key && spec.key !== 'n' && spec.key !== 'dx') 参数[spec.key] = +el.pv.value;
    const pv = be.preview(st, 世界矩形们(tg), kind, 参数);
    if (pv.拒绝) return flash(pv.拒绝, 1);
    const r = be.apply(st, 世界矩形们(tg), kind, 参数);
    if (r.回滚) return flash(r.回滚 + '（' + r.原因 + '）', 1);
    for (const reg of tg) C.recordOp(st, reg, kind, 参数, r.改动数, { text: '批量 ' + be.ops[kind].名 });
    commit('批量 ' + be.ops[kind].名 + ' × ' + ids.length + ' 个区域（撤销算一步）');
    flash('批量完成：' + ids.length + ' 个区域，改动 ' + r.改动数 + ' 处' + 报(r));
  }

  // ---------- 模板 / 导入导出 ----------
  function saveTpl() {
    const reg = st.regions.find(q => q.id === sel); if (!reg) return flash('先选区域', 1);
    const t = C.saveTemplate(st, reg, el.tplName.value || reg.name);
    commit('存模板'); flash('已存模板 ' + t.name + ' · ' + t.w + '×' + t.h + (t.op ? ' · 含 ' + t.op.kind : ''));
  }
  function useTpl() {
    const t = st.templates[+el.tplIdx.value | 0]; if (!t) return flash('没有这个模板', 1);
    const reg = C.applyTemplate(st, t, C.toRuler(view, cvSize, { x: cvSize.w / 2, y: cvSize.h / 2 }, st.axis));
    sel = reg.id; multi = new Set([reg.id]);
    if (t.op) {                                           // 模板 = 尺寸 + 改法，一次点完
      const r = be.apply(st, [C.regionWorldRect(st, reg)], t.op.kind, t.op.params);
      if (!r.拒绝 && !r.回滚) C.recordOp(st, reg, t.op.kind, t.op.params, r.改动数, { text: '模板自带修改' });
      else flash(r.拒绝 || r.回滚, 1);
    }
    commit('模板新建 ' + t.name);
    flash('已按模板新建 ' + t.w + '×' + t.h + (t.op ? '，并套用其修改' : ''));
  }
  function exportJson() {
    el.io.value = C.exportJSON(st, view);
    flash('已导出 ' + el.io.value.length + ' 字符（可复制到别的项目；「下载」存成 regions.json）');
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([C.exportJSON(st, view)], { type: 'application/json' }));
    a.download = 'regions.json'; a.click();
    flash('已存成 regions.json');
  }
  function importJson() {
    const r = C.importJSON(el.io.value);
    if (!r.ok) return flash('导入失败（' + r.errors.length + ' 处）：' + r.errors.join(' / '), 1);
    st = r.state; if (r.view) view = C.createView(r.view);
    sel = st.regions.length ? st.regions[0].id : null; multi = new Set();
    preview = null; lastOp = null; vx = []; hy = [];
    hist = C.createHistory(st, be);
    syncAll(); flash('导入成功：' + st.regions.length + ' 个区域 · yDir=' + st.axis.yDir + ' · 原点 ' +
      st.origin.x + ',' + st.origin.y);
  }

  // ---------- 渲染 ----------
  function loop() { draw(); requestAnimationFrame(loop); }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, cvSize.w, cvSize.h);
    drawContent(); drawGrid(); drawQuadrants(); drawRegions(); drawBadge(); drawLabels();
  }
  function drawContent() {
    be.drawBase(ctx, view, st, cvSize);
    if (preview && preview.高亮) be.highlight(ctx, view, st, cvSize, preview.高亮);
  }
  function drawGrid() {
    const minor = step, major = step * 5;
    const a = toR({ x: 0, y: 0 }), b = toR({ x: cvSize.w, y: cvSize.h });
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (const [k, on] of [[minor, 0], [major, 1]]) {
      ctx.strokeStyle = on ? PAL.gridMajor : PAL.grid; ctx.lineWidth = on ? 1 : 0.6;
      ctx.beginPath();
      for (let v = Math.ceil(x0 / k) * k; v <= x1; v += k) { const p = toS({ x: v, y: 0 }); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, cvSize.h); }
      for (let v = Math.ceil(y0 / k) * k; v <= y1; v += k) { const p = toS({ x: 0, y: v }); ctx.moveTo(0, p.y); ctx.lineTo(cvSize.w, p.y); }
      ctx.stroke();
    }
    const o = toS({ x: 0, y: 0 });
    ctx.strokeStyle = PAL.axis; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, o.y); ctx.lineTo(cvSize.w, o.y); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, cvSize.h); ctx.stroke();
    ctx.fillStyle = PAL.axisTxt; ctx.font = '11px monospace';
    // 刻度印的就是用户要输入的那套标尺值（不是世界值），所以不做任何方向换算；
    // 下边界让开顶部那条 22px 的读数条，否则刻度数字会被压在条子底下读不到
    for (let v = Math.ceil(x0 / major) * major; v <= x1; v += major) {
      const p = toS({ x: v, y: 0 });
      ctx.fillRect(p.x - 0.5, clamp(o.y - 3, 顶条, cvSize.h - 6), 1, 6);
      ctx.fillText(String(Math.round(v)), p.x + 3, clamp(o.y + 14, 顶条 + 10, cvSize.h - 2));
    }
    for (let v = Math.ceil(y0 / major) * major; v <= y1; v += major) {
      const p = toS({ x: 0, y: v });
      ctx.fillRect(clamp(o.x - 3, 0, cvSize.w - 6), clamp(p.y - 0.5, 顶条, cvSize.h - 6), 6, 1);
      ctx.fillText(String(Math.round(v)), clamp(o.x + 5, 2, cvSize.w - 40), clamp(p.y - 3, 顶条 + 10, cvSize.h - 4));
    }
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function drawQuadrants() {
    const o = toS({ x: 0, y: 0 });
    const xs = st.axis.xDir > 0 ? ['+X', '-X'] : ['-X', '+X'];
    const ys = st.axis.yDir > 0 ? ['-Y', '+Y'] : ['+Y', '-Y'];   // 向下为正 ⇒ 原点「上方」那半边是 -Y
    ctx.font = '11px monospace'; ctx.fillStyle = PAL.quad;
    for (const [dx, dy, sx, sy] of [[1, -1, 0, 0], [1, 1, 0, 1], [-1, -1, 1, 0], [-1, 1, 1, 1]]) {
      ctx.fillText('象限 ' + xs[sx] + ' ' + ys[sy], o.x + (dx > 0 ? 14 : -52), o.y + (dy < 0 ? -20 : 24));
    }
  }
  function drawRegions() {
    lastBoxes = [];
    for (const reg of st.regions) {
      const b = C.normalizeBounds(reg);
      const p = toS({ x: b.left, y: b.top }), q = toS({ x: b.right, y: b.bottom });
      const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y), w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y);
      const on = reg.id === sel, inMulti = multi.has(reg.id);
      if (on || inMulti) { ctx.fillStyle = PAL.regionFill; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = on ? PAL.region : inMulti ? PAL.regionDim : '#2a5f6e';
      ctx.lineWidth = on ? 1.8 : 1;
      ctx.setLineDash(on ? [] : [4, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      if (on) {                                           // 选中区域：四条边各画成一根贯穿整屏的定位线
        for (const [k] of EDGES) {
          const s = edgeSeg(b, k);
          ctx.strokeStyle = 'rgba(255,176,74,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
          ctx.beginPath();
          if (s.ax === 'x') { ctx.moveTo(s.a.x, 0); ctx.lineTo(s.a.x, cvSize.h); }
          else { ctx.moveTo(0, s.a.y); ctx.lineTo(cvSize.w, s.a.y); }
          ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = PAL.guide;                      // 中点手柄：一眼看出拖的是哪条边
          ctx.fillRect((s.a.x + s.bb.x) / 2 - 4, (s.a.y + s.bb.y) / 2 - 4, 8, 8);
        }
      }
      lastBoxes.push({ reg, x, y, w, h, on, ops: reg.ops.length });
    }
  }
  // 标签防遮挡：选中项优先占位，后来的往下找空位（placeLabel 是纯几何，能无头测）
  function drawLabels() {
    const used = [];
    if (badgeBox) used.push(badgeBox);                            // 徽标先占位，标签就不会压到它身上
    const list = lastBoxes.slice().sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0));
    ctx.font = '12px monospace';
    for (const bx of list) {
      const b = C.normalizeBounds(bx.reg), hi = bx.on ? 3 : 1;
      const items = [
        { t: bx.reg.id + ' ' + fmt(C.widthOf(b)) + '×' + fmt(C.heightOf(b)) + 'px', x: bx.x, y: bx.y - 17, p: hi },
        { t: 'X ' + fmt(b.left) + ' → ' + fmt(b.right), x: bx.x, y: bx.y + bx.h + 2, p: hi },
        { t: 'Y ' + fmt(b.top) + ' → ' + fmt(b.bottom), x: bx.x - 104, y: bx.y + 2, p: hi > 1 ? 2 : 0 },
      ];
      if (bx.ops) items.push({ t: '已改 ' + bx.ops + ' 次', x: bx.x + 2, y: bx.y + bx.h - 19, p: 0 });
      for (const it of items) {
        const w = ctx.measureText(it.t).width + 8, h = 16;
        const pos = C.placeLabel(used, { x: clamp(it.x, 2, cvSize.w - w - 2), y: clamp(it.y, 顶条 + 2, cvSize.h - h - 2) }, w, h, it.p);
        if (!pos) continue;
        used.push(pos);
        ctx.fillStyle = 'rgba(6,12,16,0.86)'; ctx.fillRect(pos.x, pos.y, w, h);
        ctx.strokeStyle = it.p >= 3 ? PAL.region : '#24505f'; ctx.lineWidth = 1;
        ctx.strokeRect(pos.x + 0.5, pos.y + 0.5, w, h);
        ctx.fillStyle = it.p >= 3 ? PAL.sel : PAL.txt; ctx.fillText(it.t, pos.x + 4, pos.y + 12);
      }
    }
  }
  function drawBadge() {                                    // 第 7 条要求：轴方向必须在界面上写明
    const t = 'Y 轴正方向：' + (st.axis.yDir > 0 ? '向下 ↓（场景坐标，与游戏内一致）' : '向上 ↑（数学约定）') +
      '   X 轴正方向：' + (st.axis.xDir > 0 ? '向右 →' : '向左 ←') + '   单位：场景像素（不随缩放改变）';
    ctx.font = '12px monospace';
    // measureText() 返回的是 TextMetrics 对象，必须取 .width；
    // 直接参与算术会得到 NaN，整块徽标就静默画不出来（画面右上角从此没有轴方向标注）
    const w = ctx.measureText(t).width + 16, x = cvSize.w - w - 8, y = 顶条 + 4;
    badgeBox = { x, y, w, h: 22 };                                // 标签避让要把徽标当成已占位的一块
    ctx.fillStyle = 'rgba(10,20,26,0.92)'; ctx.fillRect(x, y, w, 22);
    ctx.strokeStyle = PAL.guide; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, 22);
    ctx.fillStyle = PAL.guide; ctx.fillText(t, x + 8, y + 15);
    const o = toS({ x: 0, y: 0 });
    ctx.strokeStyle = PAL.axisTxt; ctx.lineWidth = 1.4; ctx.beginPath();
    const xe = clamp(o.x + 46 * st.axis.xDir, 12, cvSize.w - 12), ye = clamp(o.y + 46 * st.axis.yDir, 12, cvSize.h - 12);
    ctx.moveTo(o.x, o.y); ctx.lineTo(xe, o.y);
    ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, ye); ctx.stroke();
    ctx.fillStyle = PAL.axisTxt;
    ctx.fillText('X+', xe + (st.axis.xDir > 0 ? 2 : -14), o.y - 6);
    ctx.fillText('Y+', o.x + 6, ye + (st.axis.yDir > 0 ? 12 : -6));
    ctx.fillText('(0,0) 原点', o.x + 6, o.y + (st.axis.yDir > 0 ? -6 : 18));
  }

  // ---------- 面板同步 ----------
  function syncAll() { syncList(); syncInputs(); syncTpl(); syncAxis(); }
  function syncAxis() {
    if (el.originRead) el.originRead.textContent = st.origin.x.toFixed(0) + ', ' + st.origin.y.toFixed(0);
    if (el.stepbox) el.stepbox.textContent = step;
    if (el.zoom) el.zoom.textContent = (view.zoom * 100).toFixed(0) + '%';
    if (el.ydir && +el.ydir.value !== st.axis.yDir) el.ydir.value = String(st.axis.yDir);
  }
  function syncList() {
    el.list.innerHTML = '';
    for (const r of st.regions) {
      const b = C.normalizeBounds(r), li = document.createElement('li');
      li.textContent = r.id + ' ' + fmt(C.widthOf(b)) + '×' + fmt(C.heightOf(b)) + ' · X ' +
        fmt(b.left) + '→' + fmt(b.right) + ' · Y ' + fmt(b.top) + '→' + fmt(b.bottom) +
        ' · 改 ' + r.ops.length + ' 次';
      li.className = (r.id === sel ? 'on ' : '') + (multi.has(r.id) ? 'multi' : '');
      li.title = '点击选中，Shift 点击加入批量';
      li.onclick = e => { sel = r.id; if (e.shiftKey) { multi.has(r.id) ? multi.delete(r.id) : multi.add(r.id); } else multi = new Set([r.id]); syncAll(); };
      el.list.appendChild(li);
    }
    if (el.count) el.count.textContent = st.regions.length + '（多选 ' + multi.size + '）';
  }
  const fmt = v => String(Math.round(v * 100) / 100);
  function syncInputs() {
    const r = st.regions.find(q => q.id === sel), b = r ? C.normalizeBounds(r) : null;
    const put = (k, v) => { if (el[k]) el[k].value = b ? fmt(k === 'x0' ? b.left : k === 'x1' ? b.right : k === 'y0' ? b.top : b.bottom) : ''; };
    ['x0', 'x1', 'y0', 'y1'].forEach(k => put(k));
    if (el.dims) el.dims.textContent = b ? fmt(C.widthOf(b)) + ' × ' + fmt(C.heightOf(b)) + ' px（X ' +
      fmt(b.left) + '→' + fmt(b.right) + '，Y ' + fmt(b.top) + '→' + fmt(b.bottom) + '）' : '未选中区域';
    markSteps();
  }
  function syncTpl() {
    el.tplList.innerHTML = '';
    st.templates.forEach((t, i) => {
      const li = document.createElement('li');
      li.textContent = '#' + i + ' ' + t.name + ' · ' + t.w + '×' + t.h + (t.op ? ' · ' + C.OP_KINDS[t.op.kind].名 : ' · 仅尺寸');
      li.title = '点击按模板新建';
      li.onclick = () => { el.tplIdx.value = i; useTpl(); };
      el.tplList.appendChild(li);
    });
    if (!st.templates.length) {
      const li = document.createElement('li'); li.textContent = '（还没有模板）'; li.className = 'none';
      el.tplList.appendChild(li);
    }
  }
  function applyInputs() {
    const r = st.regions.find(q => q.id === sel); if (!r) return flash('先选一个区域', 1);
    const v = k => +el[k].value;
    if ([v('x0'), v('x1'), v('y0'), v('y1')].some(x => !isFinite(x))) return flash('四条边界都要填数字', 1);
    const before = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    r.left = v('x0'); r.right = v('x1'); r.top = v('y0'); r.bottom = v('y1');
    if (C.widthOf(r) < 1 || C.heightOf(r) < 1) { Object.assign(r, before); return flash('宽高至少 1px（X1 要大于 X0，Y1 要大于 Y0）', 1); }
    vx = [Math.min(r.left, r.right), Math.max(r.left, r.right)];
    hy = [Math.min(r.top, r.bottom), Math.max(r.top, r.bottom)];
    commit('输入边界'); flash('区域已按输入更新：' + C.widthOf(r) + '×' + C.heightOf(r) + 'px');
  }
  function setTool() {
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    el.hint.textContent = HINT[tool];
    cv.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    markSteps();
  }
  const HINT = {
    select: '选择 / 移动：拖框体只挪位置不改形状；拖四条边（或贯穿整屏的定位线）只改那一条；Shift 点选多个区域做批量。方向键微调，Shift+方向键 10px。',
    origin: '设原点：点画布把 (0,0) 钉到那个内容像素上。区域盖住的内容不变，读数按新原点重算，宽高不变（171×200 还是 171×200）。',
    vline: '定 X 范围：点两下放两条竖线（=区域的 X0/X1），第三次起点哪条移哪条；也可直接在左边 X0/X1 输入数值。',
    hline: '定 Y 范围：点两下放两条横线（=区域的 Y0/Y1），第三次起点哪条移哪条；也可直接在左边 Y0/Y1 输入数值。',
    rect: '拉矩形：按下拖出一个区域，松手自动回到「选择」。',
    pan: '平移：按住拖动画面；滚轮缩放（以光标为锚，缩放平移后读数不变）。空格键在任何工具下都能临时平移。',
  };
  const STEPS = ['origin', 'vline', 'hline', 'select', 'preview'];
  function markSteps() {
    if (!el.steps) return;
    const r = st.regions.find(q => q.id === sel), b = r ? C.normalizeBounds(r) : null;
    const done = [st.origin.x !== 0 || st.origin.y !== 0, vx.length >= 2 && b && C.widthOf(b) > 1,
      hy.length >= 2 && b && C.heightOf(b) > 1, !!sel, !!preview];
    [...el.steps.children].forEach((li, i) => {
      li.classList.toggle('done', !!done[i]);
      li.classList.toggle('now', STEPS[i] === tool || (STEPS[i] === 'preview' && !!preview));
    });
  }
  function flash(t, bad) {
    el.flash.textContent = t; el.flash.style.color = bad ? '#ff8f8f' : '#8fe3a0'; markSteps();
  }

  // ---------- 事件接线 ----------
  function wire() {
    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; setTool(); });
    el.apply.onclick = applyInputs;
    ['x0', 'x1', 'y0', 'y1'].forEach(k => el[k].onchange = applyInputs);
    bind('btnPreview', doPreview); bind('btnApply', doApply); bind('btnRepeat', doRepeat); bind('btnBatch', doBatchAll);
    bind('btnDup', () => {
      const r = C.duplicateRegion(st, sel, step, step);
      if (r) { sel = r.id; multi = new Set([r.id]); commit('复制区域'); flash('已复制为 ' + r.id + '（错开 ' + step + 'px）'); }
      else flash('先选区域', 1);
    });
    bind('btnDel', () => { if (C.deleteRegion(st, sel)) { sel = null; multi.clear(); commit('删除区域'); flash('已删除'); } });
    bind('btnUndo', doUndo); bind('btnRedo', doRedo);
    bind('btnTplSave', saveTpl); bind('btnTplUse', useTpl);
    bind('btnExport', exportJson); bind('btnDownload', download); bind('btnImport', importJson);
    bind('btnFit', () => {
      const r = st.regions.find(q => q.id === sel);
      if (r) { frameRect(C.normalizeBounds(r), 0.5); syncInputs(); flash('已取景到选中区域（读数没变：' + C.widthOf(r) + '×' + C.heightOf(r) + 'px）'); }
    });
    bind('btnDemo', () => {
      const r = C.addRegion(st, { left: 1829, right: 2000, top: 200, bottom: 400, name: '示例 171×200' });
      sel = r.id; multi = new Set([r.id]); vx = [1829, 2000]; hy = [200, 400];
      commit('插入示例区域'); frameRect(C.normalizeBounds(r), 0.5);
      flash('已插入示例：X 1829→2000、Y 200→400 = 171×200');
    });
    el.snapbox.onchange = () => { snapOn = el.snapbox.checked; flash('网格吸附' + (snapOn ? '开（' + step + 'px）' : '关，可放任意像素')); };
    el.ydir.onchange = () => {
      const nd = +el.ydir.value, od = st.axis.yDir;
      st.axis.yDir = nd;
      if (nd !== od) {
        // 只翻「真正换了方向的那根轴」：Y 读数取反后 world = 原点 + 方向×读数 仍指向同一批内容像素；
        // X 没翻就绝不能顺手翻（早先这里把 left/right 也取反了，选区会跳到镜像位置去改别的内容）
        for (const r of st.regions) { r.top = -r.top; r.bottom = -r.bottom; }
        hy = hy.map(v => -v);
      }
      commit('切换轴方向');
      flash('Y 轴正方向改为 ' + (nd > 0 ? '向下 ↓' : '向上 ↑') + '（区域盖住的内容没变，只是读数换了方向）');
    };
    el.opkind.onchange = syncOpKind;
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
    window.addEventListener('resize', resize);
    syncOpKind();
  }
  function bind(id, fn) { const b = document.getElementById(id); if (b) b.onclick = fn; }
  function syncOpKind() {
    const k = el.opkind.value, spec = be.ops[k] || {};
    el.pvName.textContent = (spec.key || '（无参数）') + '（' + (spec.名 || k) + '）';
    el.pv.disabled = !spec.key;
    el.pv.value = spec.默认 !== undefined ? spec.默认 : 0;
    el.peWrap.style.display = spec.附加 ? '' : 'none';
    el.pe.value = spec.附加默认 !== undefined ? spec.附加默认 : 2;
    if (el.opnote) el.opnote.textContent = spec.说明 || '';
  }
  function onKey(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') { space = true; e.preventDefault(); return; }
    const K = { v: 'select', o: 'origin', x: 'vline', y: 'hline', r: 'rect', h: 'pan' };
    if (K[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey && !e.altKey) { tool = K[e.key.toLowerCase()]; setTool(); return; }
    if (e.key === 'Escape') { preview = null; flash('已取消预览（数据一直没动）'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (C.deleteRegion(st, sel)) { sel = null; multi.clear(); commit('删除区域'); } return; }
    if (e.key === 'f' || e.key === 'F') { document.getElementById('btnFit').click(); return; }
    const n = e.shiftKey ? 10 : 1;
    if (sel && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      e.preventDefault();
      // 方向键按「屏幕看起来的方向」走，所以 yDir=-1 时上下要反号，读数才跟手
      const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
      const dy = e.key === 'ArrowUp' ? -n * st.axis.yDir : e.key === 'ArrowDown' ? n * st.axis.yDir : 0;
      for (const id of (multi.size ? [...multi] : [sel])) {
        const r = st.regions.find(q => q.id === id); if (r) C.moveRegion(st, id, dx, dy);
      }
      commit('方向键微调'); flash('移动 ' + dx + ',' + dy + '（宽高不变）');
    }
  }
  function resize() {
    const box = cv.parentElement.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cvSize = { w: Math.max(320, box.width | 0), h: Math.max(260, box.height | 0) };
    cv.style.width = cvSize.w + 'px'; cv.style.height = cvSize.h + 'px';
    cv.width = cvSize.w * dpr; cv.height = cvSize.h * dpr;
  }
  return { boot, 换后端, frameRect, setTool, get state() { return st; }, get view() { return view; },
    get scene() { return be && be.scene; }, get backend() { return be; },
    get hist() { return hist; }, get sel() { return sel; },
    get tool() { return tool; }, get preview() { return preview; }, get lines() { return { vx, hy }; },
    get cvSize() { return cvSize; }, get step() { return step; }, get snapOn() { return snapOn; },
    get 已启动() { return 已启动; },
    RegionCore };
})();
// 页面脚本可以在 DOMContentLoaded 之前自己 boot(后端)（火车地图页就这么干），
// 已经启动过就不再回落到演示后端。
window.addEventListener('DOMContentLoaded', () => { if (!RegionEditor.已启动) RegionEditor.boot(); });
