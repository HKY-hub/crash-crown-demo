/* Explicit user checkpoint reset only. Ordinary game input/update/moveEntity
 * owns every frame after initialization. Formal bio mode is not enabled here. */
(() => {
  'use strict';
  if (typeof CastleCollisionInspector === 'undefined') return;
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  CastleCollisionInspector.attach({
    getState:()=>({game,level,CFG,Input}),
    bodySpecs:{human:{w:22,h:36},motherTitan:{w:ZOMBIES.mother_titan.w,h:ZOMBIES.mother_titan.h}},
    reset:({pointId,body})=>{
      if (!game||!game.walk||!level?.castle) throw new Error('请先进入古堡探索');
      const point=level.castle.points.find(p=>p.id===pointId);
      if(!point)throw new Error('未知检查点 '+pointId);
      const entity=body==='motherTitan'
        ?makeZombie('mother_titan',{x:point.x,y:point.y,isPlayer:true})
        :makeHuman({x:point.x,y:point.y,isPlayer:true,weapon:'m4a1',name:'玩家'});
      entity.y-=entity.h;
      const supported=level.solids.some(s=>!s.wall&&entity.x<s.x+s.w&&entity.x+entity.w>s.x&&Math.abs(point.y-s.y)<=2);
      if(!supported||level.solids.some(s=>!s.oneway&&overlap(entity,s)))throw new Error('检查点没有合法完整身体净空与支撑');
      Object.keys(Input.keys).forEach(k=>Input.keys[k]=false);
      Input.mouse.down=Input.mouse.rDown=false;
      entity.onGround=true;
      game.entities=[entity];game.player=entity;game.state='playing';
      game.camera.x=Math.max(0,Math.min(level.worldW-CFG.CW,entity.x+entity.w/2-CFG.CW/2));
      game.camera.y=Math.max(0,Math.min(level.worldH-CFG.CH,entity.y+entity.h/2-CFG.CH/2));
      return {pointId,body,x:entity.x,y:entity.y,w:entity.w,h:entity.h};
    }
  });
})();
