/* Current fixed JSON -> one traceable collision model shared by game/art/tools.
 * Never imports stage1-plan or regenerates the accepted map. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CastleCollisionCompiler = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SLAB_HEIGHT = 18, TREAD_HEIGHT = 12, WALL_WIDTH = 20;
  const compiled = new WeakMap();
  const finite = (n, label) => {
    if (!Number.isFinite(n)) throw new TypeError(label + ' must be finite');
    return n;
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  function subtract(span, cuts) {
    let parts = [span];
    for (const cut of cuts) parts = parts.flatMap(part => {
      if (cut.b <= part.a || cut.a >= part.b) return [part];
      const result = [];
      if (cut.a > part.a) result.push({ a: part.a, b: Math.min(part.b, cut.a) });
      if (cut.b < part.b) result.push({ a: Math.max(part.a, cut.b), b: part.b });
      return result;
    });
    return parts.filter(part => part.b - part.a >= 1);
  }
  function union(spans) {
    const result = [];
    for (const part of spans.slice().sort((a,b) => a.a-b.a || a.b-b.b)) {
      const last = result[result.length-1];
      if (last && part.a <= last.b + .01) {
        last.b = Math.max(last.b, part.b);
        last.sources = [...new Set(last.sources.concat(part.sources || []))];
      } else result.push({ ...part, sources: [...(part.sources || [])] });
    }
    return result;
  }
  function endpointLevel(id, levels) {
    return Object.keys(levels).find(lv => new RegExp('(?:^|_)'+lv+'(?:_|$)').test(id || ''));
  }
  function compileTreads(ramp, bodies) {
    const x0 = finite(ramp.x0, ramp.id+'.x0'), x1 = finite(ramp.x1, ramp.id+'.x1');
    const upperY = finite(ramp.upperY, ramp.id+'.upperY'), lowerY = finite(ramp.lowerY, ramp.id+'.lowerY');
    if (x1 <= x0 || lowerY <= upperY || !['left','right'].includes(ramp.upperAt)) throw new RangeError('Invalid ramp '+ramp.id);
    const heavy = ramp.bodies === 'HM', body = heavy ? bodies.motherTitan : bodies.human;
    const rise = lowerY-upperY;
    const first = heavy ? 0 : (rise > 116 ? Math.min(70, rise-46) : 0);
    const count = heavy ? Math.max(2,Math.ceil(rise/80)) : (first ? 1+Math.max(1,Math.ceil((rise-first)/45)) : Math.max(2,Math.ceil(rise/40)));
    const step = first ? (rise-first)/(count-1) : rise/count, run = (x1-x0)/count;
    // Body-sized upper mouth is a named visible stair landing. It replaces
    // the old unbounded 160/220/310px tread overrides and edge-specific lips.
    const mouth = body.width+4, out = [];
    for (let i=0;i<count;i++) {
      const fromLower = ramp.upperAt === 'right' ? x0+i*run : x1-(i+1)*run;
      let x = Math.round(fromLower), width = Math.max(body.width,Math.ceil(run));
      if (i === count-1) {
        if (ramp.upperAt === 'left') { x -= mouth; width += mouth; }
        else width += mouth;
      }
      out.push({ id:ramp.id+':tread:'+i, x, y:Math.round(lowerY-(first?first+step*i:step*(i+1))), w:width,h:TREAD_HEIGHT,
        oneway:true,mat:heavy?'stone':'wood',stair:true,ramp:true,sid:ramp.edgeId,bodyContract:ramp.bodies,
        sourceRampId:ramp.id,sourceEdgeId:ramp.edgeId,treadIndex:i,upperMouth:i===count-1 });
    }
    return out;
  }
  function compileGeometry(input, options) {
    const opts = options || {};
    if (!input || !input.world || !input.levels) throw new TypeError('Fixed castle JSON is required');
    if (opts.includeWalls !== false && compiled.has(input)) return compiled.get(input);
    if (input.collisionCompilation && input.collisionCompilation.originalSource) {
      const restored = compileGeometry(input.collisionCompilation.originalSource, options);
      if (opts.includeWalls !== false) compiled.set(input,restored);
      return restored;
    }
    const data = clone(input), levels = data.levels, world = { ...data.world };
    finite(world.w,'world.w');finite(world.h,'world.h');
    world.killY = world.killY == null ? world.h-40 : finite(world.killY,'world.killY');
    const bodies = data.bodyContract || {human:{width:22,height:36},motherTitan:{width:62,height:86}};
    const revisions = [], treads = [];
    // Fixed same-region point corrections are explicit authored revisions,
    // never runtime search/snap/teleport. The original source remains intact.
    const pointRevisions = { Z3:640, Z4:1868, A7:7564, A12:4100, H11:7150, Z14:4336 };
    for (const p of data.points) if (pointRevisions[p.id] != null && p.x!==pointRevisions[p.id]) {
      revisions.push({kind:'point-coordinate',sourcePointId:p.id,before:[p.x,p.y],after:[pointRevisions[p.id],p.y],
        reason:'original anchor intersects authored stair shaft; fixed same-region same-level support'});
      p.x=pointRevisions[p.id];
    }
    // The 62px body needs a complete exit inside the unchanged 8200px world.
    // Move just the watch-room's upper east seam 40px west. Its existing
    // P_E65_G2_SHAFT platform (8104..8200) remains the visible exterior floor.
    const watch = data.rooms.find(r=>r.id==='EW_WATCH');
    revisions.push({kind:'room-east-seam',sourceId:watch.id,before:{x1:watch.x1},after:{x1:8120},
      reason:'8160px door leaves only30px past its wall; 62px body cannot fully exit within8200px boundary',
      affects:['D_FIX_WATCH_EAST_G2','P_E65_G2_SHAFT','ramp:E65','ramp:E85']});
    watch.x1=8120;
    for(const s of data.surfaces)if(s.sourceId==='EW_WATCH'&&s.x1>8120){
      revisions.push({kind:'room-floor-end',sourceSurfaceId:s.id,before:[s.x0,s.x1,s.y],after:[s.x0,8120,s.y],
        reason:'align watch-room floor with revised visible east seam; existing exterior stone carrier supplies the remaining floor'});
      s.x1=8120;
    }
    // The east watch-room wall intersects its already-authored outward G2
    // carrier. Open an explicit rendered doorway rather than leave a floor
    // passing through an invisible wall.
    if (!data.doors.some(d=>d.id==='D_FIX_WATCH_EAST_G2')) {
      data.doors.push({id:'D_FIX_WATCH_EAST_G2',x:8120,lv:'G2',y:levels.G2,from:'EW_WATCH',to:'P_E65_G2_SHAFT',clearHeight:104});
      revisions.push({kind:'door-opening',sourceDoorId:'D_FIX_WATCH_EAST_G2',x:8120,y:levels.G2,clearHeight:104,
        reason:'authored P_E65_G2_SHAFT crosses EW_WATCH east room seam'});
    }
    const ramps = data.ramps.map(r => {
      const rects = compileTreads(r,bodies);treads.push(...rects);return {...r,rects};
    });
    // These two authored door seams lie inside a real descending stairwell.
    // Retain x, adjacency and upper-level annotation; make the visible arch
    // and collision aperture describe the whole actual connected opening.
    for(const door of data.doors)if(['D_EW_ARM_BASE_W','D_EW_ARM_BASE_E'].includes(door.id)) {
      let top=door.y-door.clearHeight,bottom=door.y;
      const via=new Set();let expanded=true;
      while(expanded) {
        expanded=false;
        for(const r of ramps) {
          const body=r.bodies==='HM'?bodies.motherTitan:bodies.human,mouth=body.width+4;
          if(door.x<r.x0-mouth-WALL_WIDTH/2||door.x>r.x1+mouth+WALL_WIDTH/2)continue;
          const rt=r.upperY-body.height-8,rb=r.lowerY;
          if(rt>bottom||rb<top)continue;
          via.add(r.id);
          const nt=Math.min(top,rt),nb=Math.max(bottom,rb);
          if(nt!==top||nb!==bottom){top=nt;bottom=nb;expanded=true;}
        }
      }
      door.passageMode='stairwell';door.viaRampIds=[...via];door.openingTop=top;door.openingBottom=bottom;
      revisions.push({kind:'stairwell-arch',sourceDoorId:door.id,x:door.x,before:{y:door.y,clearHeight:door.clearHeight},
        after:{openingTop:top,openingBottom:bottom},viaRampIds:[...via],
        reason:'declared room seam passes through connected real stairwell; flat C1 threshold would seal descending shaft'});
    }
    // Every cut is owned by one authored ramp and propagated to final source
    // surfaces, so renderers cannot continue drawing a solid floor over it.
    const shaftCuts = [];
    for (const ramp of ramps) {
      const body = ramp.bodies === 'HM' ? bodies.motherTitan : bodies.human, mouth = body.width+4;
      for (const [lv,y] of Object.entries(levels)) if(y >= ramp.upperY && y < ramp.lowerY) {
        const sorted=ramp.rects.slice().sort((a,b)=>b.y-a.y);
        // Find levels intruding into the tread actor. Human flights retain
        // their full jump-entry sweep below. A mother on a 75/80px first step
        // also needs one body width plus a fall margin at the lower exit.
        const intrusive=sorted.filter(t=>t.y-body.height<y+SLAB_HEIGHT);
        if(!intrusive.length)continue;
        const lowClear=ramp.bodies==='HM'?body.width+SLAB_HEIGHT+4:0;
        let a=Math.min(...intrusive.map(t=>t.x)),b=Math.max(...intrusive.map(t=>t.x+t.w));
        // Standing clearance alone is insufficient for human jump entry.
        // v2 live traces hit the retained first-third ceiling on ascent;
        // retain v1's full authored human shaft, not a static-head shortcut.
        if(ramp.bodies==='H') {
          a=Math.min(ramp.x0,...sorted.map(t=>t.x));
          b=Math.max(ramp.x1,...sorted.map(t=>t.x+t.w));
        }
        if(lowClear>0) {
          if(ramp.upperAt==='right')a=Math.min(a,ramp.x0-lowClear);
          else b=Math.max(b,ramp.x1+lowClear);
        }
        shaftCuts.push({id:ramp.id+':shaft:'+lv,sourceRampId:ramp.id,sourceEdgeId:ramp.edgeId,lv,y,
          x0:a,x1:b});
      }
    }
    const carriers = new Map([...(data.rooms||[]),...(data.platforms||[]),...(data.openSpaces||[]),...(data.bridges||[])].map(v=>[v.id,v]));
    const finalSurfaces = [];
    for (const s of data.surfaces) {
      const cuts = shaftCuts.filter(c => c.lv===s.lv && c.x1>s.x0 && c.x0<s.x1);
      const pieces = subtract({a:s.x0,b:s.x1},cuts.map(c=>({a:c.x0,b:c.x1})));
      if (cuts.length) revisions.push({kind:'ramp-shaft-cut',sourceSurfaceId:s.id,sourceId:s.sourceId,
        before:[s.x0,s.x1,s.y],after:pieces.map(p=>[p.a,p.b,s.y]),via:cuts.map(c=>c.sourceRampId)});
      for(let i=0;i<pieces.length;i++)finalSurfaces.push({...s,id:cuts.length?s.id+':shaft-part:'+i:s.id,originalSurfaceId:s.id,x0:pieces[i].a,x1:pieces[i].b});
    }
    const lowerLandingEdges=new Set(['E29','E31','E51','E56','E78','E79','E84']);
    for(const r of ramps)if(lowerLandingEdges.has(r.edgeId)) {
      const low=r.upperAt==='right'?r.x0:r.x1,id='P_FIX_'+r.edgeId+'_LOWER';
      const lv=r.lowerLevel,x0=low-26,x1=low+26;
      const platform={id,region:data.regions.find(v=>low>=v.x0&&low<v.x1)?.id,x0,x1,lv,sky:false,
        oneway:true,mat:'wood',role:'有记录的楼梯下口短落脚台',sourceRampId:r.id};
      data.platforms.push(platform);
      finalSurfaces.push({id:'surface:'+id+':0',originalSurfaceId:id,sourceId:id,sourceKind:'platform',lv,y:r.lowerY,x0,x1,
        sky:false,oneway:true,mat:'wood',sourceRampId:r.id});
      revisions.push({kind:'lower-landing',sourceId:id,sourceRampId:r.id,after:[x0,x1,r.lowerY],oneway:true,
        reason:'neighboring authored flights leave no body-wide lower exit; local visible landing preserves descending aperture'});
    }
    function addVisiblePlatform(id,x0,x1,y,lv,extra,reason) {
      const center=(x0+x1)/2,platform={id,region:data.regions.find(v=>center>=v.x0&&center<v.x1)?.id,
        x0,x1,lv,y,sky:false,oneway:true,mat:'wood',role:reason,...extra};
      data.platforms.push(platform);
      finalSurfaces.push({...platform,id:'surface:'+id+':0',originalSurfaceId:id,sourceId:id,sourceKind:'platform'});
      revisions.push({kind:'visible-local-platform',sourceId:id,after:[x0,x1,y],oneway:true,...extra,reason});
    }
    addVisiblePlatform('P_FIX_CT_WEST_THRESHOLD',3416,3491,levels.G2,'G2',
      {sourceDoorId:'D_CT_WEST',ownerRampId:'ramp:E19'},
      '塔西门真实木质门外落脚台：完整体宽越过门侧后仍能站稳，保留下方石阶与下降空间');
    addVisiblePlatform('P_FIX_EW_MED_THRESHOLD',6700,6784,levels.G1,'G1',
      {sourceDoorId:'D_EW_MED_W',ownerRampId:'ramp:E58'},
      '医务旧翼门内真实木质短落脚台：原16px门内残面不足以稳定完整出门，保留余下楼梯井');
    addVisiblePlatform('P_FIX_E73_LEFT_RETURN',6986,7054,1836,'C1',
      {sourceRampId:'ramp:E73',returnForRampId:'ramp:E73',branch:'left-return'},
      '军械底西楼梯井真实左侧返程台：C0至木台升114px，木台至C1升56px');
    addVisiblePlatform('P_FIX_E75_LEFT_RETURN',7506,7574,1836,'C1',
      {sourceRampId:'ramp:E75',returnForRampId:'ramp:E75',branch:'left-return'},
      '军械底东楼梯井真实左侧返程台：C0至木台升114px，木台至C1升56px');
    // Sparse one-way wooden ledges preserve a readable crossing above a
    // stairwell while retaining body-wide drops into its original flight.
    // They are source-visible structures, not an unbroken replacement floor.
    addVisiblePlatform('P_FIX_E37_CROSS_W',5184,5256,levels.G2,'G2',{sourceEdgeId:'E37',ownerRampId:'ramp:E89'},'石桥至书库跨井西落脚台');
    addVisiblePlatform('P_FIX_E37_CROSS_M',5340,5412,levels.G2,'G2',{sourceEdgeId:'E37',ownerRampId:'ramp:E89'},'石桥至书库跨井中落脚台，保留84px下降缝');
    addVisiblePlatform('P_FIX_E64_CROSS_M',8012,8064,levels.G1,'G1',{sourceEdgeId:'E64',ownerRampId:'ramp:E67'},'东旧翼高层跨井短落脚台，保留人类下降缝');
    addVisiblePlatform('P_FIX_E64_EAST',8110,8200,levels.G1,'G1',{sourceEdgeId:'E64',ownerRampId:'ramp:E67'},'东旧翼高层实际完整体宽终端落脚台');
    addVisiblePlatform('P_FIX_E66_CROSS_W',7440,7512,levels.C1,'C1',{sourceEdgeId:'E66',ownerRampId:'ramp:E75'},'东排水层跨井西落脚台');
    addVisiblePlatform('P_FIX_E66_CROSS_M',7596,7668,levels.C1,'C1',{sourceEdgeId:'E66',ownerRampId:'ramp:E75'},'东排水层跨井中落脚台，保留84/85px下降缝');
    const edgeEndpoints={E37:[5100,5580],E64:[7790,8160],E66:[7440,7950]};
    for(const edge of data.edges)if(edgeEndpoints[edge.id]) {
      const before={x0:edge.x0,x1:edge.x1,movementMode:edge.movementMode||edge.type};
      [edge.x0,edge.x1]=edgeEndpoints[edge.id];
      edge.movementMode='short-jumps-over-stairwell';
      edge.localPlatforms=finalSurfaces.filter(s=>s.sourceEdgeId===edge.id).map(s=>s.sourceId);
      revisions.push({kind:'crossing-endpoints-and-movement',sourceEdgeId:edge.id,before,
        after:{x0:edge.x0,x1:edge.x1,movementMode:edge.movementMode},localPlatforms:edge.localPlatforms,
        reason:'original endpoint lies inside physical stair shaft; retain adjacency/body contract with visible short-jump crossing'});
    }
    data.surfaces = finalSurfaces;
    const surfaces = finalSurfaces.map(s=>({id:s.id,x:s.x0,y:s.y,w:s.x1-s.x0,h:SLAB_HEIGHT,oneway:s.oneway===true,mat:s.mat||'stone',
      deck:s.sourceId,lv:s.lv,sourceSurfaceId:s.originalSurfaceId,sourceId:s.sourceId,sourceKind:s.sourceKind,sky:s.sky===true}));
    // Room rectangles are back-wall semantics. Only their vertical boundary
    // seams become entity blockers; named doors/ramps/open connections own
    // openings through those seams. Furniture, arches and volumes stay art.
    const candidates = new Map(), boundaryOpenings = [], walls = [];
    const addSide = (r,side,x) => {
      const key = Math.round(x), list = candidates.get(key)||[];
      list.push({a:r.top,b:r.floor,sources:[r.id+':'+side]});candidates.set(key,list);
    };
    for (const room of data.rooms) {
      if (/露台|实体短廊/.test(room.role||'')) continue;
      addSide(room,'west',room.x0);addSide(room,'east',room.x1);
    }
    for (const [x,parts] of candidates) {
      const cuts = [];
      for(const door of data.doors)if(Math.abs(door.x-x)<=WALL_WIDTH/2+1) {
        const top=door.openingTop??door.y-door.clearHeight,bottom=door.openingBottom??door.y;
        cuts.push({a:top,b:bottom+SLAB_HEIGHT});
        boundaryOpenings.push({id:'opening:'+door.id,sourceDoorId:door.id,x0:x-WALL_WIDTH/2,x1:x+WALL_WIDTH/2,
          top,bottom,kind:door.passageMode==='stairwell'?'stairwell-door':'door'});
      }
      for(const ramp of ramps) {
        const body=ramp.bodies==='HM'?bodies.motherTitan:bodies.human,mouth=body.width+4;
        if(x>=ramp.x0-mouth-WALL_WIDTH/2&&x<=ramp.x1+mouth+WALL_WIDTH/2) {
          const top=ramp.upperY-body.height-8,bottom=ramp.lowerY;
          cuts.push({a:top,b:bottom});boundaryOpenings.push({id:ramp.id+':wall-opening:'+x,sourceRampId:ramp.id,
            x0:x-WALL_WIDTH/2,x1:x+WALL_WIDTH/2,top,bottom,kind:'stair-shaft'});
        }
      }
      // A declared continuous edge without a door is an open corridor, not
      // permission to delete an entire room wall. Only its body-clear passage
      // is removed, and the opening is exposed to the same art data.
      for(const edge of data.edges)if(['walk','bridge','cave'].includes(edge.type)&&x>=edge.x0&&x<=edge.x1) {
        const a=endpointLevel(edge.a,levels),b=endpointLevel(edge.b,levels);
        if(a&&a===b) {
          const height=(edge.bodies==='HM'?bodies.motherTitan.height:bodies.human.height)+18,y=levels[a];
          cuts.push({a:y-height,b:y+SLAB_HEIGHT});boundaryOpenings.push({id:edge.id+':wall-opening:'+x,sourceEdgeId:edge.id,
            x0:x-WALL_WIDTH/2,x1:x+WALL_WIDTH/2,top:y-height,bottom:y,kind:'open-corridor'});
        }
      }
      for(const open of data.openSpaces) {
        const y=typeof open.floor==='number'?open.floor:levels[open.floor];
        if(Number.isFinite(y)&&x>=open.x0&&x<=open.x1) {
          const height=open.sky?world.h:bodies.motherTitan.height+18;
          cuts.push({a:y-height,b:y+SLAB_HEIGHT});
        }
      }
      const merged=union(parts);
      let n=0;
      for(const part of merged)for(const keep of subtract(part,cuts)) {
        walls.push({id:'wall:seam:'+x+':'+n++,x:x-WALL_WIDTH/2,y:keep.a,w:WALL_WIDTH,h:keep.b-keep.a,
          oneway:false,mat:'stone',wall:true,sourceRoomSides:[...part.sources],sourceId:part.sources.join('|')});
      }
    }
    data.collisionOpenings=boundaryOpenings;
    data.collisionWalls=walls.map(w=>({...w}));
    data.collisionCompilation={version:3,sourceVersion:input.version,policy:'authored ramp shafts and semantic vertical room seams',originalSource:clone(input),
      revisions:revisions.map(r=>({...r}))};
    const points=data.points.map(p=>({...p}));
    const model={source:data,originalSource:input,world,levels:{...levels},Y:{...levels,F1:levels.G1},
      surfaces,ramps,treads,walls,doorLintels:walls.filter(w=>w.sourceRoomSides.some(id=>data.doors.some(d=>Math.abs(d.x-(w.x+w.w/2))<=1))),
      solids:surfaces.concat(treads,walls),points,humanSpawns:points.filter(p=>p.kind==='human'),zombieSpawns:points.filter(p=>p.kind==='infected'),
      supplies:points.filter(p=>p.kind==='supply'),regions:data.regions.map(r=>({...r})),bodyContract:clone(bodies),
      rampShaftCuts:shaftCuts,boundaryOpenings,revisions,compilePolicy:'current JSON; visible shaft cuts, bounded tread mouths, traceable room seam walls'};
    if(opts.includeWalls===false)model.solids=surfaces.concat(treads);
    if(opts.includeWalls!==false){compiled.set(input,model);compiled.set(data,model);}
    return model;
  }
  function buildLevel(data,options) {
    const model=compileGeometry(data,options),spawnHuman={...model.humanSpawns[0]},spawnZombie={...model.zombieSpawns[0]};
    const stage={idx:0,startX:0,endX:model.world.w,name:'阴森古堡',theme:'castle',spawnHuman,
      respawns:model.humanSpawns.map(p=>({...p})),shortcutSpawns:[],ammoBoxes:model.supplies.map(p=>({...p})),weaponBoxes:[],
      capsules:[],keys:[],crystals:[],triggers:[],mechanisms:[],portal:null,guardTimer:0,escapeZone:null,decor:[]};
    return {solids:model.solids,buildings:[],escapeZone:null,spawnHuman,spawnZombie,worldW:model.world.w,worldH:model.world.h,
      killY:model.world.killY,groundTop:model.levels.G1,stages:[stage],cliffRespawns:[],castle:model,source:model.source};
  }
  return {compileGeometry,buildLevel,compileTreads,subtract,union};
});
