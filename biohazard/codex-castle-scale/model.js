/* Scale the completed castle, never its authored input or actor definitions. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CastleMapScaleModel=api;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const lengths=new Set(['x','y','x0','x1','y0','y1','w','h','width','height','top','bottom','floor','base',
    'upperY','lowerY','killY','startX','endX','clearHeight','clearWidth','openingTop','openingBottom']);
  const preserved=new Set(['bodyContract','humanBody','motherTitanBody','originalSource','collisionCompilation','revisions']);
  function geometry(value,factor,key){
    if(preserved.has(key))return value;
    if(typeof value==='number')return lengths.has(key)||key==='levelHeight'?value*factor:value;
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(v=>geometry(v,factor));
    if(key==='levels'||key==='Y')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='number'?v*factor:v]));
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,geometry(v,factor,k)]));
  }
  function scaleLevel(current,factor){
    factor=Number(factor);
    if(!Number.isFinite(factor)||factor<.5||factor>2)throw new RangeError('古堡比例范围为50%～200%');
    if(!current?.castle)throw new Error('当前不是固定古堡');
    const base=current.castle.scaleBaseLevel||current;
    if(factor===1)return base;
    const model=geometry(base.castle,factor);
    model.solids=model.surfaces.concat(model.treads,model.walls);
    model.scaleFactor=factor;
    model.source.mapScale=factor;
    Object.defineProperties(model,{
      scaleBaseLevel:{value:base},
      scaleBaseModel:{value:base.castle}
    });
    return {...base,solids:model.solids,castle:model,source:model.source,
      worldW:base.worldW*factor,worldH:base.worldH*factor,killY:base.killY*factor,
      groundTop:base.groundTop*factor,
      stages:geometry(base.stages,factor),buildings:geometry(base.buildings,factor),
      spawnHuman:geometry(base.spawnHuman,factor),spawnZombie:geometry(base.spawnZombie,factor)};
  }
  function entityPosition(entity,ratio){
    return {x:(entity.x+entity.w/2)*ratio-entity.w/2,
      y:(entity.y+entity.h)*ratio-entity.h};
  }
  function embedded(box,solids){
    return solids.some(s=>!s.oneway&&box.x<s.x+s.w&&box.x+box.w>s.x&&box.y<s.y+s.h&&box.y+box.h>s.y);
  }
  return {scaleLevel,entityPosition,embedded};
});
