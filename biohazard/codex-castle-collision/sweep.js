/* Point-projectile sweep over the actual Level.solids. No extra geometry,
 * body inflation or changed collision tolerance. One-way surfaces retain
 * the game's existing projectile-through policy. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CastleCollisionSweep=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function firstHit(solids,x0,y0,x1,y1){
    const dx=x1-x0,dy=y1-y0;
    let nearest=null;
    for(const solid of solids){
      if(solid.oneway)continue;
      let entry=0,exit=1,valid=true,normalX=0,normalY=0;
      for(const [origin,delta,min,max,axis] of [[x0,dx,solid.x,solid.x+solid.w,'x'],[y0,dy,solid.y,solid.y+solid.h,'y']]){
        if(delta===0){if(origin<=min||origin>=max){valid=false;break;}continue;}
        const a=(min-origin)/delta,b=(max-origin)/delta;
        const near=Math.min(a,b);
        if(near>=entry){entry=near;normalX=axis==='x'?-Math.sign(delta):0;normalY=axis==='y'?-Math.sign(delta):0;}
        exit=Math.min(exit,Math.max(a,b));
        if(entry>=exit){valid=false;break;}
      }
      if(!valid||exit<=0||entry>1)continue;
      if(!nearest||entry<nearest.t)nearest={solid,t:entry,x:x0+dx*entry,y:y0+dy*entry,normalX,normalY};
    }
    return nearest;
  }
  return {firstHit};
});
