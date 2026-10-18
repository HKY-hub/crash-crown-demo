// ============ 区域编辑工具 · 火车地图内容后端 ============
// 把 region-editor 的「可修改内容」从演示网格换成真实编组数据。
//
// ★ 原点怎么定（用户让我定，理由写在这里而不是藏在代码里）：
//   **标尺 == 场景世界像素**，原点 (0,0) = 编组起点 x、场景顶边 y，Y 向下为正。
//   因为本仓所有常量本来就住在这套坐标里：FLOOR=348、CEIL=216、ROOF=202、UNDER=408、WORLD_H=560，
//   车厢对象上带的就是 x0/x1/yFloor/yRoof。工具里读到 X=4268 就是代码与交接文档里同一个 4268，
//   不另造一套方言；想「以某节车为 0」时用「设原点」点那节车端头，读数跟着换、内容不动。
//
// ★ 能改什么、不能改什么 —— 这条边界是查了生成器才划的，不是拍的：
//   可改：furniture 家具 / props 生活小件 / damage 破损污渍 / lights 灯具。
//   这四类都不进碰撞体：build() 在 1509 行先跑完路线验证、1514 行才摆家具，
//   且 train-gen.js:1328 明写「家具本身不是碰撞体（可跳的障碍走 car.decks）」。
//   不可改：decks / ladders / doors / holes / roofBlocks / gantries —— 它们经 buildSolids 进 M.solids，
//   改了就是改路线；而 buildSolids 是私有的，indexSolids 只按现有 M.solids 分桶、不会重建实体。
//   在工具里另抄一份 solids 构造 = 第二本账（本项目栽过 car.links 与 M.links 两本账的坑），
//   所以这里一律**拒绝**并点名是哪几类，而不是假装能改。
//   兜底：每次应用前后都复跑本仓自己的 TrainGen.traverse，「通关」掉成「不通」立刻整次回滚。
const RegionTrain = (() => {
  const SCHEMA = 'hky.region-train/1';
  const LISTS = {
    furniture: { 名: '家具', 可改: true, 贴地: true },
    props: { 名: '生活小件', 可改: true },
    damage: { 名: '破损污渍', 可改: true },
    lights: { 名: '灯具', 可改: true },
    decks: { 名: '可跳障碍', 可改: false, 通行: true },
    ladders: { 名: '梯子', 可改: false, 通行: true },
    doors: { 名: '门', 可改: false, 通行: true },
    holes: { 名: '地板破口', 可改: false, 通行: true },
    roofBlocks: { 名: '车顶挡块', 可改: false, 通行: true },
    gantries: { 名: '龙门架', 可改: false, 通行: true },
  };
  const 可改清单 = Object.keys(LISTS).filter(k => LISTS[k].可改);
  const 通行清单 = Object.keys(LISTS).filter(k => LISTS[k].通行);

  const OPS = {
    clear: { 名: '清空', key: null, 只: 可改清单, 说明: '删掉区内每件可改构件（通行构件不在范围内，见右侧说明）' },
    density: { 名: '减密', key: 'keep', 只: ['furniture', 'props', 'damage'], 说明: '按稳定身份排序后每 N 件留 1 件，其余删除（确定性，不掺随机）' },
    shift: { 名: '挪动', key: 'dx', 只: ['furniture', 'props', 'damage'], 说明: '整批水平挪动；贴地构件的 y 由地板反推不会浮空，且不许挪出本节车' },
    retype: { 名: '换种类', key: null, 只: ['furniture'], 说明: '从本节车自己的家具池里换下一种，宽高按 ITEM 表重算并贴地' },
    reseed: { 名: '换变体', key: 'turns', 只: ['furniture', 'props', 'damage'], 说明: '只换构件自己的变体种子：花纹/朝向变，位置与尺寸都不动' },
    lamp: { 名: '灯具开关', key: 'on', 只: ['lights'], 说明: '区内灯具开 / 关（位置不动，只断发光）' },
    fill: { 名: '补构件', key: 'n', 只: ['furniture'], 说明: '在区内地板空档补家具：走道余量、梯口与门口净空、互不重叠都当场验' },
  };

  // 界面要用的元信息：主参数名 + 默认值 + 说明。参数名与生成器里的字段一致，别在界面上另起名。
  const OPS带默认 = JSON.parse(JSON.stringify(OPS));
  Object.assign(OPS带默认.density, { 默认: 3 });
  Object.assign(OPS带默认.shift, { 附加: 'dy', 默认: 40, 附加默认: 0 });
  Object.assign(OPS带默认.reseed, { 默认: 1 });
  Object.assign(OPS带默认.lamp, { 默认: 0 });
  Object.assign(OPS带默认.fill, { 默认: 3 });

  function make(G, M) {
    const LADW = (G.LAD && G.LAD.w) || 12;
    let 步骤 = [];

    // ---------- 几何与身份 ----------
    function rectOf(car, key, it) {
      if (key === 'ladders') return { x0: it.x, y0: Math.min(it.y0, it.y1), x1: it.x + LADW, y1: Math.max(it.y0, it.y1) };
      if (key === 'gantries') return { x0: it.x, y0: car.yRoof - 10, x1: it.x + (it.w || 96), y1: car.yFloor };
      if (key === 'holes') return { x0: it.x, y0: car.yFloor, x1: it.x + (it.w || 20), y1: car.yFloor + 10 };
      if (key === 'roofBlocks') return { x0: it.x, y0: car.yRoof - (it.h || 20), x1: it.x + (it.w || 20), y1: car.yRoof };
      if (key === 'lights') return { x0: it.x - 8, y0: it.y - 3, x1: it.x + 8, y1: it.y + 9 };
      return { x0: it.x, y0: it.y, x1: it.x + (it.w || 10), y1: it.y + (it.h || 10) };
    }
    // 稳定身份：车种-序号（生成器阶段七就给了 car.uid）+ 清单 + 原始终态字段。
    // 同 seed 重建必然得到同一个串 ⇒ 导出的是「相对干净模型的差」，与操作顺序无关。
    function 身份(car, key, it) {
      return car.uid + '/' + key + '/' + (it.id || it.kind || 'x') + '@' + Math.round(it.x) + ',' + Math.round(it.y || 0) +
        '#' + (it.w || 0) + 'x' + (it.h || 0) + (it.seed !== undefined ? '~' + it.seed : '');
    }
    function recs(只这些) {
      const out = [];
      for (const car of M.cars) for (const key of Object.keys(LISTS)) {
        if (只这些 && 只这些.indexOf(key) < 0) continue;
        const arr = car[key]; if (!Array.isArray(arr)) continue;
        for (const it of arr) out.push({ car, list: key, item: it, 名: LISTS[key].名, 可改: LISTS[key].可改,
          通行: !!LISTS[key].通行, 贴地: !!LISTS[key].贴地, r: rectOf(car, key, it), uid: 身份(car, key, it) });
      }
      return out;
    }
    // ---------- 命中口径 ----------
    function 命中(r, rect, mode) {
      if (mode === 'inside') return r.x0 >= rect.x0 && r.x1 <= rect.x1 && r.y0 >= rect.y0 && r.y1 <= rect.y1;
      if (mode === 'overlap') return !(r.x1 <= rect.x0 || rect.x1 <= r.x0 || r.y1 <= rect.y0 || rect.y1 <= r.y0);
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      return cx >= rect.x0 && cx < rect.x1 && cy >= rect.y0 && cy < rect.y1;
    }
    function targets(rect, mode) { return recs().filter(x => 命中(x.r, rect, mode || 'center')); }

    // ---------- 通行验证：用本仓自己的验证器，不自造 ----------
    function 路线() {
      try {
        const p = G.traverse(M, { speed: G.MOVE.speed });
        const c = G.traverse(M, { speed: G.MOVE.chaserSpeed, maxFrames: 60 * 60 * 24 });
        return { ok: !!(p && p.ok), 通关s: p && p.t, 追兵ok: !!(c && c.ok), 原因: (p && p.reason) || '' };
      } catch (e) { return { ok: false, 原因: 'traverse 抛错：' + e.message }; }
    }

    // ---------- 快照 / 摘要 ----------
    function snapshot() {
      const per = {};
      for (const car of M.cars) for (const key of 可改清单)
        if (Array.isArray(car[key])) per[car.i + '/' + key] = car[key].map(it => Object.assign({}, it));
      return { per, 步骤: 步骤.slice() };
    }
    function restore(s) {
      for (const car of M.cars) for (const key of 可改清单) {
        const k = car.i + '/' + key;
        if (Array.isArray(car[key]) && s.per[k]) car[key] = s.per[k].map(it => Object.assign({}, it));
      }
      步骤 = s.步骤.slice();
    }
    function 序列化() {
      const a = [];
      for (const x of recs()) a.push(x.uid + '|' + (x.item.kind || '') + '|' +
        (x.item.on === undefined ? '' : 'on' + x.item.on) + '|' + (x.item.flicker === undefined ? '' : 'fl' + x.item.flicker));
      return a.sort();
    }
    function digest() {
      const j = 序列化().join('\n'); let h = 2166136261;
      for (let i = 0; i < j.length; i++) { h ^= j.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return h + '|' + j.length;
    }

    // ---------- 空档（补家具用）：把障碍、梯口、门口、破口都算成占位 ----------
    function 地板空档(car, rect) {
      const 左 = Math.max(car.x0 + 60, rect.x0), 右 = Math.min(car.x1 - 40, rect.x1);
      if (右 <= 左) return [];
      const 占 = [];
      const 加 = (a, b) => { const p = Math.max(左, a), q = Math.min(右, b); if (q > p) 占.push([p, q]); };
      for (const it of car.furniture) 加(it.x - 6, it.x + it.w + 6);
      for (const it of car.decks) 加(it.x - 10, it.x + it.w + 10);
      for (const L of car.ladders) 加(L.x - 40, L.x + 44);            // 梯子 + 爬上来之后身体那一段
      for (const d of car.doors) 加(d.x - 26, d.x + (d.w || 14) + 26);  // 与 train-gen.js:598 的 mustFree 同宽
      for (const h of car.holes) 加(h.x - 8, h.x + (h.w || 20) + 8);
      占.sort((a, b) => a[0] - b[0]);
      const 空 = []; let cur = 左;
      for (const s of 占) { if (s[0] > cur) 空.push([cur, s[0]]); cur = Math.max(cur, s[1]); }
      if (cur < 右) 空.push([cur, 右]);
      return 空.filter(s => s[1] - s[0] >= 20);
    }
    const 池 = car => { const p = ((G.CAR[car.type] || {}).fit || []).filter(k => G.ITEM[k]);
      return p.length ? p : Object.keys(G.ITEM).filter(k => G.ITEM[k].w <= 100); };

    // ---------- 落子（唯一一份实现，预览与应用共用） ----------
    function 执行(op, rect, params, mode) {
      const 允许 = OPS[op] && OPS[op].只 ? OPS[op].只 : 可改清单;
      const tg = targets(rect, mode).filter(x => 允许.indexOf(x.list) >= 0);
      const 改动 = [], 跳过 = [];
      const p = Object.assign({}, params || {});
      if (op === 'clear') {
        for (const x of tg) { 摘(x); 改动.push(x); }
      } else if (op === 'density') {
        const keep = Math.max(2, p.keep | 0);
        tg.slice().sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
          .forEach((x, i) => { if (i % keep !== 0) { 摘(x); 改动.push(x); } });
      } else if (op === 'shift') {
        const dx = p.dx | 0, dy = p.dy | 0;
        for (const x of tg) {
          const it = x.item;
          const 新x = Math.min(Math.max(it.x + dx, x.car.x0 + 6), x.car.x1 - 6 - (it.w || 0));
          if (新x === it.x && (x.list === 'furniture' || x.list === 'damage' || x.list === 'props')) { 跳过.push(x.uid + '（已在车端头）'); continue; }
          it.x = Math.round(新x);
          if (x.贴地) it.y = x.car.yFloor - (it.h || 0);
          else if (dy && x.list !== 'lights') it.y = Math.round(Math.min(Math.max(it.y + dy, x.car.yCeil + 2), x.car.yFloor - 2));
          改动.push(x);
        }
      } else if (op === 'retype') {
        for (const x of tg) {
          const pool = 池(x.car);
          if (pool.length < 2) { 跳过.push(x.uid + '（本节车家具池不足两种）'); continue; }
          const 新种 = pool[(pool.indexOf(x.item.kind) + 1) % pool.length];
          const it = G.ITEM[新种];
          if (!it) { 跳过.push(x.uid + '（ITEM 表里没有 ' + 新种 + '）'); continue; }
          x.item.kind = 新种; x.item.w = it.w; x.item.h = it.h;
          x.item.x = Math.round(Math.min(Math.max(x.item.x, x.car.x0 + 6), x.car.x1 - 6 - it.w));
          x.item.y = x.car.yFloor - it.h;
          改动.push(x);
        }
      } else if (op === 'reseed') {
        const t = Math.max(1, p.turns | 0);
        for (const x of tg) if (x.item.seed !== undefined) { x.item.seed = (x.item.seed * 7 + 13 * t) % 10000; 改动.push(x); }
        if (!改动.length) 跳过.push('这一批里没有带 seed 的构件');
      } else if (op === 'lamp') {
        for (const x of tg) { x.item.on = p.on ? 1 : 0; 改动.push(x); }
      } else if (op === 'fill') {
        const n = Math.max(1, p.n | 0);
        const 车们 = [...new Set(targets(rect, mode).map(x => x.car.i))].map(i => M.cars[i]);
        const 涉及 = 车们.length ? 车们 : M.cars.filter(c => rect.x0 < c.x1 && rect.x1 > c.x0);
        let 放 = 0;
        for (const car of 涉及) {
          for (const kind of 池(car)) {
            if (放 >= n) break;
            const it = G.ITEM[kind]; if (!it) continue;
            const 余 = it.h > 56 ? 34 : 4;                       // 与生成器同一套走道余量（train-gen.js:1299）
            for (const s of 地板空档(car, rect)) {
              if (s[1] - s[0] < it.w + 余 * 2) continue;
              const x = Math.round(s[0] + 余);
              const 新 = { kind, x, y: car.yFloor - it.h, w: it.w, h: it.h, seed: (x * 31 + it.w) % 10000 };
              car.furniture.push(新);
              改动.push({ car, list: 'furniture', item: 新, 名: '家具', 可改: true, 贴地: true,
                r: rectOf(car, 'furniture', 新), uid: 身份(car, 'furniture', 新) });
              放++;
              break;
            }
          }
        }
        if (!放) 跳过.push('区内地板没有够宽的净空档（走道余量与梯口/门口净空优先）');
      } else return { 拒绝: '不认识的操作：' + op };
      return { 改动, 跳过, 命中数: tg.length };
    }
    function 摘(x) { const arr = x.car[x.list], i = arr.indexOf(x.item); if (i >= 0) arr.splice(i, 1); }

    // ---------- 预览 = 真跑一遍再回滚 ⇒ 「预览到」与「应用到」必然同一份实现 ----------
    function preview(op, rect, params, mode) {
      const 全部 = targets(rect, mode);
      const 挡 = 全部.filter(x => !x.可改);
      const 前 = digest(), snap = snapshot();
      const r = 执行(op, rect, params, mode);
      const 高亮 = r.改动.map(x => x.r);
      const 变了 = digest() !== 前;
      restore(snap);
      return { op, 改动数: r.改动.length, 命中数: r.命中数, 变了, 高亮, 跳过: r.跳过,
        通行件: 挡.length, 通行名: [...new Set(挡.map(x => x.名))], 拒绝: r.拒绝 };
    }
    function apply(op, rect, params, mode) {
      const 基线 = 路线();
      const snap = snapshot();
      const r = 执行(op, rect, params, mode);
      if (r.拒绝) return r;
      const 后 = 路线();
      if (基线.ok && !后.ok) {
        restore(snap);
        return { 回滚: '这次修改把路线改坏了，已整次回滚', 原因: 后.原因, 改动数: r.改动.length };
      }
      步骤.push({ op, rect, params: params || {}, mode: mode || 'center', 改动数: r.改动.length });
      const 挡 = targets(rect, mode).filter(x => !x.可改);
      return { op, 改动数: r.改动.length, 命中数: r.命中数, 跳过: r.跳过, 验证: 后,
        通行件: 挡.length, 通行名: [...new Set(挡.map(x => x.名))],
        高亮: r.改动.map(x => x.r) };
    }

    // ---------- 导出 / 重放：相对「同 seed 干净模型」的差，顺序无关 ----------
    function 导出(regions) {
      return JSON.stringify({
        schema: SCHEMA, seed: M.seed, 单位: 'scene-px', 原点: { x: 0, y: 0 }, 轴: { xDir: 1, yDir: 1 },
        说明: '标尺即场景世界像素；Y 向下为正。重放：按 seed 干净重建后调 导入()。',
        regions: (regions || []).map(r => ({ id: r.id, name: r.name, left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
        删除: [], 改动: [], 新增: [], 步骤: 步骤.slice(),
      }, null, 2);
    }
    function 差分(净) {
      // 两侧都只取「可改清单」：把通行构件也拿进差分会出现「新增了一堆门」这种假差异
      const 现表 = {}, 净表 = {};
      for (const x of recs(可改清单)) 现表[x.uid] = x;
      for (const car of 净.cars) for (const key of 可改清单)
        (car[key] || []).forEach(it => { const u = 身份(car, key, it); 净表[u] = { car, list: key, item: it }; });
      const d = { 删除: [], 改动: [], 新增: [] };
      for (const u of Object.keys(净表)) if (!现表[u]) {
        const x = 净表[u];
        d.删除.push({ uid: u, 车: x.car.uid, 清单: x.list, kind: x.item.kind, x: x.item.x, y: x.item.y,
          w: x.item.w, h: x.item.h, seed: x.item.seed, on: x.item.on, id: x.item.id });
      }
      for (const u of Object.keys(现表)) {
        const a = 现表[u], b = 净表[u];
        if (!b) { d.新增.push({ 车: a.car.uid, 清单: a.list, kind: a.item.kind, x: a.item.x, y: a.item.y,
          w: a.item.w, h: a.item.h, seed: a.item.seed, on: a.item.on }); continue; }
        const ch = {};
        for (const k of ['x', 'y', 'w', 'h', 'kind', 'seed', 'on', 'flicker'])
          if (a.item[k] !== undefined && b.item[k] !== undefined && a.item[k] !== b.item[k]) ch[k] = a.item[k];
        if (Object.keys(ch).length) d.改动.push({ uid: u, 车: a.car.uid, 清单: a.list, 改成: ch });
      }
      return d;
    }
    function 导出净(净, regions) {
      const base = JSON.parse(导出(regions));
      return JSON.stringify(Object.assign(base, 差分(净)), null, 2);
    }
    function 导入(text, 净) {
      let d;
      try { d = JSON.parse(text); } catch (e) { return { ok: false, errors: ['JSON 解析失败：' + e.message] }; }
      if (!d || d.schema !== SCHEMA) return { ok: false, errors: ['schema 不是 ' + SCHEMA + '（收到 ' + JSON.stringify(d && d.schema) + '）'] };
      if (!净) return { ok: false, errors: ['重放需要同 seed 的干净模型：先按 种子=' + d.seed + ' 重建，再导入'] };
      if (d.seed !== 净.seed) return { ok: false, errors: ['seed 不符：文件是 ' + d.seed + '，当前模型是 ' + 净.seed] };
      const 表 = {};
      for (const car of 净.cars) for (const key of 可改清单)
        (car[key] || []).forEach(it => { 表[身份(car, key, it)] = { car, list: key, item: it }; });
      const errs = [];
      for (const s of d.删除 || []) {
        const x = 表[s.uid]; if (!x) { errs.push('删除目标不存在：' + s.uid); continue; }
        const arr = x.car[x.list], i = arr.indexOf(x.item);
        if (i >= 0) arr.splice(i, 1); else errs.push('删除时找不到对象：' + s.uid);
      }
      for (const s of d.改动 || []) {
        const x = 表[s.uid]; if (!x) { errs.push('改动目标不存在：' + s.uid); continue; }
        Object.assign(x.item, s.改成);
        if (LISTS[x.list] && LISTS[x.list].贴地 && x.item.h !== undefined) x.item.y = x.car.yFloor - x.item.h;
      }
      const 尾 = {};
      for (const s of d.新增 || []) {
        const car = 净.cars.find(c => c.uid === s.车); if (!car) { errs.push('新增找不到车厢：' + s.车); continue; }
        if (可改清单.indexOf(s.清单) < 0) { errs.push('新增清单不可改：' + s.清单); continue; }
        const k = car.i + '/' + s.清单; (尾[k] = 尾[k] || []).push(s);
      }
      for (const k of Object.keys(尾)) {
        const car = 净.cars[k.split('/')[0] | 0], list = k.split('/')[1];
        尾[k].sort((a, b) => a.x - b.x).forEach(s => car[list].push({ kind: s.kind, x: s.x, y: s.y,
          w: s.w, h: s.h, seed: s.seed, on: s.on }));
      }
      return { ok: errs.length === 0, errors: errs, 统计: { 删除: (d.删除 || []).length, 改动: (d.改动 || []).length, 新增: (d.新增 || []).length } };
    }

    // ---------- 底图：真实编组的 1:1 世界坐标剖面 ----------
    const 色 = { 壳: '#16242e', 顶: '#33586e', 车顶: '#2b4152', 车底: '#0d151b',
      furniture: '#5b8fa8', props: '#c8a05a', damage: '#8a4f4f', lights: '#ffe6a0',
      decks: '#6a8f5a', ladders: '#ffb04a', doors: '#c8543a', holes: '#05090c', roofBlocks: '#7f6a3a', gantries: '#8a6a9a' };
    function drawBase(ctx, view, st, cvSize, 隐藏) {
      const S = r => ({ x: cvSize.w / 2 + view.panX + r.x * st.axis.xDir * view.zoom,
        y: cvSize.h / 2 + view.panY + r.y * st.axis.yDir * view.zoom });
      const R = (a, b, f) => { const p = S(a), q = S(b); ctx.fillStyle = f;
        ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y)); };
      const 隐 = 隐藏 || {};
      for (const car of M.cars) {
        R({ x: car.x0, y: car.yRoof }, { x: car.x1, y: G.UNDER }, 色.车底);
        R({ x: car.x0, y: car.yRoof }, { x: car.x1, y: car.yFloor }, 色.壳);
        ctx.strokeStyle = 色.顶; ctx.lineWidth = 1; ctx.beginPath();
        for (const y of [car.yRoof, car.yCeil, car.yFloor]) {
          const a = S({ x: car.x0, y }), b = S({ x: car.x1, y }); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.strokeStyle = 色.车顶; ctx.beginPath();
        const a0 = S({ x: car.x0, y: car.yRoof - 14 }), b0 = S({ x: car.x1, y: car.yRoof - 14 });
        ctx.moveTo(a0.x, a0.y); ctx.lineTo(b0.x, b0.y); ctx.stroke();
        for (const key of Object.keys(LISTS)) {
          if (隐[key]) continue;
          for (const it of (car[key] || [])) {
            const r = rectOf(car, key, it);
            let f = 色[key];
            if (key === 'lights' && it.on === 0) f = '#39424a';
            R({ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }, f);
          }
        }
        if (view.zoom > 0.5) {
          ctx.fillStyle = '#8fb4c8'; ctx.font = '11px monospace';
          const p = S({ x: car.x0 + 4, y: car.yRoof - 20 });
          ctx.fillText('#' + car.i + ' ' + (car.name || car.type) + ' ' + car.x0 + '→' + car.x1 + ' CH' + car.chapter, p.x, p.y);
        }
      }
    }
    function probe(pt) {
      const car = M.cars.find(c => pt.x >= c.x0 && pt.x <= c.x1);
      if (!car) {
        const 前 = M.cars.filter(c => c.x1 < pt.x).length;
        return { 车: null, 说明: 前 === 0 ? '编组起点之前（车外）' : 前 >= M.cars.length ? '编组末端之后（车外）' : '车厢连接处（' + 前 + ' 与 ' + (前 + 1) + ' 节之间 26px）' };
      }
      const 层 = pt.y < car.yRoof - 14 ? '车顶上方' : pt.y < car.yRoof ? '车顶面' : pt.y < car.yCeil ? '车顶与天花板之间'
        : pt.y < car.yFloor ? '车内' : pt.y < G.UNDER ? '车底通过台' : '车底以下';
      const 在 = recs().filter(x => x.car === car && 命中(x.r, { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }, 'overlap'));
      return { 车: car.i, 车种: car.name || car.type, 章节: car.chapter, 层,
        可改件: 在.filter(x => x.可改).map(x => x.名 + ':' + (x.item.kind || '')),
        通行件: 在.filter(x => !x.可改).map(x => x.名),
        说明: '第 ' + car.i + ' 节 ' + (car.name || car.type) + ' · CH' + car.chapter + ' · ' + 层 +
          (在.length ? ' · 这里压着 ' + 在.map(x => x.名).join('、') : '') };
    }
    // ---------- 给界面层用的适配器：口径由界面设定，一次调用可传多个区域 ----------
    let 口径 = 'center';
    function 合并(rects, fn) {
      let 改动数 = 0, 通行件 = 0, 变了 = false;
      const 高亮 = [], 跳过 = [], 通行名 = [];
      let 拒绝 = null, 回滚 = null, 原因 = '', 验证 = null;
      for (const rc of rects) {
        const r = fn(rc);
        if (r.拒绝) { 拒绝 = r.拒绝; continue; }
        if (r.回滚) { 回滚 = r.回滚; 原因 = r.原因; continue; }
        改动数 += r.改动数 || 0;
        高亮.push.apply(高亮, r.高亮 || []);
        跳过.push.apply(跳过, r.跳过 || []);
        通行件 += r.通行件 || 0;
        for (const n of (r.通行名 || [])) if (通行名.indexOf(n) < 0) 通行名.push(n);
        if (r.验证) 验证 = r.验证;
        if (r.变了) 变了 = true;
      }
      return { 改动数, 高亮, 跳过, 通行件, 通行名, 拒绝, 回滚, 原因, 验证, 变了 };
    }
    const ui = {
      名: '火车地图', ops: OPS带默认, scene: null, 隐藏: {},
      // 开机就把镜头落在「有内容」的地方：第 6 节车的车内，读数一眼就是那节车的坐标
      初始区域: () => {
        const c = M.cars[Math.min(6, M.cars.length - 1)];
        return { left: c.x0 + 8, right: Math.min(c.x1 - 8, c.x0 + 260), top: c.yCeil + 4,
          bottom: c.yFloor + 24, name: '第 ' + c.i + ' 节 ' + (c.name || c.type) };
      },
      get 口径() { return 口径; }, set 口径(v) { 口径 = v; },
      world: () => ({ x0: -420, y0: -40, x1: (M.trainLen || 0) + 420, y1: G.WORLD_H + 40 }),
      digest, snapshot, restore, probe, 路线,
      drawBase: (ctx, view, st, cvSize) => drawBase(ctx, view, st, cvSize, ui.隐藏),
      highlight(ctx, view, st, cvSize, 高亮) {
        const P = (x, y) => ({ x: cvSize.w / 2 + view.panX + x * st.axis.xDir * view.zoom,
          y: cvSize.h / 2 + view.panY + y * st.axis.yDir * view.zoom });
        ctx.fillStyle = 'rgba(255,176,74,0.42)';
        for (const r of 高亮) {
          const a = P(r.x0, r.y0), b = P(r.x1, r.y1);
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y),
            Math.max(1.5, Math.abs(b.x - a.x)), Math.max(1.5, Math.abs(b.y - a.y)));
        }
      },
      preview: (stt, rects, kind, params) => 合并(rects, rc => preview(kind, rc, params, 口径)),
      apply: (stt, rects, kind, params) => 合并(rects, rc => apply(kind, rc, params, 口径)),
    };

    return {
      ui,
      名: '火车地图', ops: OPS, LISTS, 可改清单, 通行清单,
      world: { x0: -420, y0: -40, x1: (M.trainLen || 0) + 420, y1: G.WORLD_H + 40 },
      targets, recs, rectOf, 身份, digest, snapshot, restore, preview, apply, 路线,
      drawBase, probe, 导出, 导出净, 导入, 差分, 地板空档,
      get 步骤() { return 步骤; }, set 步骤(v) { 步骤 = (v || []).slice(); },
    };
  }
  return { make, SCHEMA, LISTS, OPS, 可改清单, 通行清单 };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RegionTrain;
if (typeof window !== 'undefined') window.RegionTrain = RegionTrain;
