'use strict';
const EPS=0.02,DT=1/120;
function position(e){return{x:+e.x.toFixed(2),feet:+(e.y+e.h).toFixed(2),vx:+e.vx.toFixed(2),vy:+e.vy.toFixed(2),ground:e.onGround};}
function runContract(H,c,options={}){
 const spec=H.specs[c.body],trace=[],events=[],startInfo={};let jumps=0,maxEmbedded=0,lastSupport=[],recoverySeconds=0;
 function result(status,e,t,extra={}){const contacts=H.level.solids.filter(s=>!s.oneway&&e.y<s.y+s.h&&e.y+e.h>s.y&&
   (Math.abs(e.x+e.w-s.x)<1||Math.abs(e.x-(s.x+s.w))<1));lastSupport=H.support(e);const output={id:c.id,kind:c.kind,sourceId:c.sourceId,edgeId:c.edgeId,
  body:c.body,direction:c.direction,required:c.required,status,pass:status==='PASS',seconds:+(t+recoverySeconds).toFixed(3),
  start:startInfo,final:position(e),support:lastSupport.map(s=>s.id),blocking:contacts.map(s=>s.id),embedded:maxEmbedded,jumps,...extra,
  ...(status==='PASS'?{}:{trace,events})};Object.defineProperty(output,'entity',{value:e});return output;}
 function sample(e,t,input){
  const bad=H.embedded(e);maxEmbedded=Math.max(maxEmbedded,bad.length);lastSupport=H.support(e);
  if(Math.round(t/DT)%18===0)trace.push({...position(e),t:+t.toFixed(3),input,
   support:lastSupport.map(s=>s.id),blockers:bad.map(s=>s.id)});
  if(options.onStep)options.onStep(e,t,input);
 }
 function validStart(e){return !H.embedded(e).length && H.support(e).length>0;}
 function legalSupportNear(center,feet,side=0,maxDistance=125,bounds=null){
  const candidates=[];
  for(const s of H.level.solids){
   if(Math.abs(s.y-feet)>EPS)continue;
   const supportWidth=Math.min(spec.w,18);
   if(s.w<supportWidth)continue;
   const low=Math.max(0,s.x-spec.w+supportWidth,bounds?bounds.x0:0),
     high=Math.min(H.level.worldW-spec.w,s.x+s.w-supportWidth,bounds?bounds.x1-spec.w:H.level.worldW);
   if(high<low)continue;
   let x=Math.max(low,Math.min(high,center-spec.w/2));
   const delta=x+spec.w/2-center;
   if(Math.abs(delta)>maxDistance || (side<0 && delta>12) || (side>0&&delta<-12))continue;
   const e=H.spawn(c.body,x,feet);
   if(validStart(e))candidates.push({x,s,d:Math.abs(delta)+(s.oneway?12:0)});
  }
  candidates.sort((a,b)=>a.d-b.d);return candidates[0];
 }
 if(c.kind==='supportClimb'){
  const solid=c.solid,e=options.entity;
  if(!e)throw new Error('supportClimb requires the existing runtime entity');
  Object.assign(startInfo,position(e),{support:H.support(e).map(s=>s.id)});
  const target=solid.x+solid.w/2;let cd=0,best=Infinity,still=0;
  for(let f=0;f<960;f++){
   const t=f*DT,feet=e.y+e.h,cx=e.x+e.w/2,support=H.support(e);
   if(e.onGround&&Math.abs(feet-solid.y)<EPS&&support.some(s=>s.id===solid.id))return result('PASS',e,t);
   const distance=Math.abs(cx-target)+Math.abs(feet-solid.y)*.7;
   if(distance<best-.4){best=distance;still=0;}else still+=DT;
   const mv=Math.abs(cx-target)<2?0:Math.sign(target-cx),jump=e.onGround&&feet>solid.y+EPS&&cd<=0;
   if(jump){jumps++;cd=.25;}else cd-=DT;
   const input={left:mv<0,right:mv>0,jump};H.step(e,input,DT);sample(e,t,input);
   if(e.dead)return result('UNEXPECTED_DEATH',e,t);
   if(maxEmbedded)return result('EMBEDDED',e,t);
   if(still>2.2)return result('NO_PROGRESS',e,t,{targetSupport:solid.id});
  }
  return result('TIMEOUT',e,8,{targetSupport:solid.id});
 }
 if(c.kind==='upperSideDrop'){
  const r=c.ramp,e=options.entity,asc=r.upperAt==='right'?1:-1;
  if(!e)throw new Error('upperSideDrop requires existing entity');
  Object.assign(startInfo,position(e));
  const middle=r.rects.filter(t=>t.y>r.upperY+EPS&&t.y<r.lowerY).sort((a,b)=>a.y-b.y)[0];
  if(!middle)return result('NO_DROP_TREAD',e,0);
  const enter=middle.x+middle.w/2,leave=asc>0?r.x1+spec.w/2+8:r.x0-spec.w/2-8;
  let phase=0,still=0,best=Infinity;
  const maxTime=Math.max(8,Math.abs(enter-(e.x+e.w/2))/spec.speed*2+3);
  for(let f=0;f<maxTime/DT;f++){
   const t=f*DT,cx=e.x+e.w/2,feet=e.y+e.h;
   if(e.onGround&&Math.abs(feet-r.lowerY)<EPS)return result('PASS',e,t,{dropSide:r.upperAt,phase});
   if(phase===0&&e.onGround&&feet>r.upperY+EPS&&feet<=middle.y+EPS){phase=1;best=Infinity;still=0;}
   const gx=(phase===0?enter:leave)-cx,mv=Math.abs(gx)<2?0:Math.sign(gx),input={left:mv<0,right:mv>0,jump:false};
   const distance=Math.abs(gx)+Math.abs(feet-r.lowerY)*.6;
   if(distance<best-.4){best=distance;still=0;}else still+=DT;
   H.step(e,input,DT);sample(e,t,input);
   if(e.dead)return result('UNEXPECTED_DEATH',e,t);
   if(maxEmbedded)return result('EMBEDDED',e,t);
   if(still>2.2)return result('NO_PROGRESS',e,t,{dropSide:r.upperAt,phase});
  }
  return result('TIMEOUT',e,maxTime,{dropSide:r.upperAt,phase});
 }
 if(c.kind==='surface'||c.kind==='point'){
  const p=c.kind==='point'?c.point:{x:(c.surface.x0+c.surface.x1)/2,y:c.surface.y};
  // Points are authored entity-left x and foot y; surfaces use centered body.
  const x=c.kind==='point'?p.x:p.x-spec.w/2;
  const e=H.spawn(c.body,x,p.y-1);Object.assign(startInfo,position(e));
  const initial=H.embedded(e);if(initial.length)return result('INVALID_START',e,0,{blockers:initial.map(s=>s.id)});
  for(let f=0;f<240;f++){
   const t=f*DT;H.step(e,{},DT);sample(e,t,{});
   if(e.dead)return result('UNEXPECTED_DEATH',e,t);
   if(e.onGround&&f>=12){
    const match=Math.abs(e.y+e.h-p.y)<EPS;
    if(c.kind==='point'&&match&&!maxEmbedded){
      const exits=[];
      for(const dir of [-1,1]){
       const test=H.spawn(c.body,x,p.y);let cd=0,pass=false,fell=false;
       for(let k=0;k<420;k++){
        const cx=test.x+test.w/2,look=dir>0?test.x+test.w+9:test.x-9;
        const groundAhead=H.level.solids.some(s=>Math.abs(s.y-(test.y+test.h))<EPS&&look>=s.x&&look<=s.x+s.w);
        const jump=test.onGround&&!groundAhead&&cd<=0;
        if(jump)cd=.3;else cd-=DT;
        H.step(test,{left:dir<0,right:dir>0,jump},DT);
        if(test.dead||H.embedded(test).length){fell=true;break;}
        if(Math.abs(test.x-x)>=60&&test.onGround&&Math.abs(test.y+test.h-p.y)<EPS){pass=true;break;}
       }
       exits.push({direction:dir>0?'right':'left',pass,fell,final:position(test),support:H.support(test).map(s=>s.id)});
      }
      return result(exits.some(z=>z.pass)?'PASS':'NO_LEGAL_EXIT',e,t,{expectedFeet:p.y,exits});
    }
    return result(match&&!maxEmbedded?'PASS':'WRONG_LAYER',e,t,{expectedFeet:p.y});
   }
  }
  return result('NO_SUPPORT',e,2,{expectedFeet:p.y});
 }
 if(c.kind==='door'||c.kind==='edge'){
  const edge=c.edge,dir=c.direction==='right'?1:-1;
  const lv=edge?((edge.a.match(/_(SP|RW|U2|U1|G2|G1|C1|C0)(?:_|$)/)||[])[1]):c.door.lv;
  const d=c.door||{x:dir>0?edge.x0:edge.x1,y:H.data.levels[lv]};
  const jumpGap=edge&&edge.type==='gapJump';
  const startCenter=edge?(dir>0?edge.x0:edge.x1)-dir*(jumpGap?spec.w/2+14:0):d.x-dir*(spec.w/2+22);
  const endCenter=edge?(dir>0?edge.x1:edge.x0)+dir*(jumpGap?spec.w/2+16:0):d.x+dir*(spec.w/2+28);
  const spaces=H.model.source.rooms.concat(H.model.source.openSpaces,H.model.source.platforms,H.model.source.bridges);
  const stairwell=d.passageMode==='stairwell';
  const fromRoom=stairwell?spaces.find(r=>r.id===(dir>0?d.from:d.to)):null;
  const toRoom=stairwell?spaces.find(r=>r.id===(dir>0?d.to:d.from)):null;
  const fromPort=edge&&c.ports?(dir>0?c.ports.left:c.ports.right):null;
  const toPort=edge&&c.ports?(dir>0?c.ports.right:c.ports.left):null;
  const doorStartBounds=c.kind==='door'?{x0:dir>0?(fromRoom?fromRoom.x0:0):d.x+10,
    x1:dir>0?d.x-10:(fromRoom?fromRoom.x1:H.level.worldW)}:null;
  const doorEndBounds=c.kind==='door'?{x0:dir>0?d.x+10:(toRoom?toRoom.x0:0),
    x1:dir>0?(toRoom?toRoom.x1:H.level.worldW):d.x-10}:null;
  const start=legalSupportNear(startCenter,d.y,edge?-dir:0,stairwell||fromPort?H.level.worldW:100,doorStartBounds||(fromPort&&fromPort.bounds))||
   (edge&&!jumpGap&&legalSupportNear(startCenter,d.y,0,H.level.worldW,fromPort&&fromPort.bounds));
  const end=legalSupportNear(endCenter,d.y,edge?dir:0,stairwell||toPort?H.level.worldW:100,doorEndBounds||(toPort&&toPort.bounds))||
   (edge&&!jumpGap&&legalSupportNear(endCenter,d.y,0,H.level.worldW,toPort&&toPort.bounds));
  let e=options.entity||H.spawn(c.body,start?start.x:startCenter-spec.w/2,d.y);Object.assign(startInfo,position(e),{
    support:H.support(e).map(s=>s.id),plannedSupport:start?start.s.id:null,authoredCenter:startCenter,portRoom:fromRoom?fromRoom.id:null,
    portRegion:fromPort?fromPort.region:null});
  if((!start&&!options.entity)||!end||!validStart(e))return result('INVALID_START',e,0,{startFound:!!start,endFound:!!end});
  const target=end.x+spec.w/2;let best=Infinity,noProgress=0,jumped=false,jumpCooldown=0,recoveries=0;
  if(edge&&edge.id==='E37'&&dir<0){
    const ramp=H.model.ramps.find(r=>r.id==='ramp:E89');
    const upper=ramp.rects.find(r=>r.y===ramp.upperY),drop=ramp.rects.find(r=>r.y===1548);
    const middle=H.level.solids.find(s=>s.sourceId==='P_FIX_E37_CROSS_M'),west=H.level.solids.find(s=>s.sourceId==='P_FIX_E37_CROSS_W');
    if(!upper||!drop||!middle||!west)throw new Error('E37 fixed transit supports missing');
    let phase=0,phaseTime=0,jumpIssued=false,lastPhase=0;
    for(let f=0;f<3600;f++){
      const t=f*DT,cx=e.x+e.w/2,feet=e.y+e.h;let mv=0,jump=false;
      if(phase!==lastPhase){phaseTime=0;lastPhase=phase;}else phaseTime+=DT;
      if(phase===0){
       if(e.x+e.w>upper.x+.5)mv=-1;
       if(e.onGround&&Math.abs(feet-drop.y)<EPS&&H.support(e).some(s=>s.id===drop.id)){phase=1;jumpIssued=false;continue;}
      }else if(phase===1){
       const gx=middle.x+middle.w/2-cx;mv=Math.abs(gx)<2?0:Math.sign(gx);
       if(!jumpIssued&&e.onGround){jump=true;jumpIssued=true;jumps++;}
       if(e.onGround&&Math.abs(feet-middle.y)<EPS&&H.support(e).some(s=>s.id===middle.id)&&Math.abs(gx)<Math.max(10,spec.w*.55)){phase=2;continue;}
      }else if(phase===2){
       mv=-1;
       if(e.onGround&&e.x+e.w<=middle.x+18){phase=3;jumpIssued=false;continue;}
      }else if(phase===3){
       const gx=west.x+west.w/2-cx;mv=Math.abs(gx)<2?0:Math.sign(gx);
       if(!jumpIssued&&e.onGround){jump=true;jumpIssued=true;jumps++;}
       if(e.onGround&&Math.abs(feet-west.y)<EPS&&H.support(e).some(s=>s.id===west.id)){phase=4;continue;}
      }else{
       mv=Math.abs(target-cx)<2?0:Math.sign(target-cx);
       if(Math.abs(target-cx)<Math.max(6,spec.w*.5)&&e.onGround&&Math.abs(feet-d.y)<EPS)return result('PASS',e,t,
        {target,targetSupport:end.s.id,targetRegion:toPort&&toPort.region,authoredTargetCenter:endCenter,
         fixedTransit:['E89:1470-to-1548','P_FIX_E37_CROSS_M:1470','P_FIX_E37_CROSS_W:1470','CG_G2:1470']});
      }
      const input={left:mv<0,right:mv>0,jump};H.step(e,input,DT);sample(e,t,input);
      if(e.dead)return result('UNEXPECTED_DEATH',e,t,{phase});
      if(maxEmbedded)return result('EMBEDDED',e,t,{phase});
      if(phaseTime>8)return result('NO_PROGRESS',e,t,{phase,fixedTransit:true});
    }
    return result('TIMEOUT',e,30,{phase,fixedTransit:true});
  }
  let crossedDoor=!stairwell,crossFailure=null,previousCenter=e.x+e.w/2;
  function observeDoor(actor){
    const center=actor.x+actor.w/2;
    if(stairwell&&(previousCenter-d.x)*(center-d.x)<=0&&Math.abs(center-previousCenter)>0){
      if(actor.y>=d.openingTop-EPS&&actor.y+actor.h<=d.openingBottom+EPS){crossedDoor=true;events.push({type:'DOOR_CROSS',x:center,top:actor.y,feet:actor.y+actor.h});}
      else crossFailure={x:center,top:actor.y,feet:actor.y+actor.h,openingTop:d.openingTop,openingBottom:d.openingBottom};
    }
    previousCenter=center;
  }
  const maxTime=Math.max(5,Math.abs(end.x-e.x)/spec.speed*1.8+2);
  for(let f=0;f<maxTime/DT;f++){
   const t=f*DT,cx=e.x+e.w/2,dist=Math.abs(target-cx);
   const supported=H.support(e),feet=e.y+e.h;
   if(e.onGround&&feet>d.y+EPS&&recoveries<8){
    const rampIds=supported.map(s=>s.sourceRampId).filter(Boolean);
    const up=H.model.ramps.filter(r=>(c.body==='human'||r.bodies==='HM')&&r.upperY===d.y&&r.lowerY>=feet-EPS&&
      (rampIds.includes(r.id)||(cx>=r.x0-30&&cx<=r.x1+30))&&
      Math.abs(target-(r.upperAt==='right'?r.x1:r.x0))<Math.abs(target-(r.upperAt==='right'?r.x0:r.x1))).sort((a,b)=>(rampIds.includes(b.id)?1:0)-(rampIds.includes(a.id)?1:0))[0];
    const pad=H.model.source.platforms.filter(p=>p.returnForRampId&&p.y>=d.y&&p.y<feet-EPS&&
      Math.abs((p.x0+p.x1)/2-cx)<360&&(!stairwell||d.viaRampIds.includes(p.returnForRampId))).sort((a,b)=>
        Math.abs((a.x0+a.x1)/2-target)-Math.abs((b.x0+b.x1)/2-target))[0];
    if(up||pad){
      recoveries++;const rr=up?runContract(H,{id:c.id+':ascend:'+up.id,kind:'ramp',sourceId:up.id,edgeId:up.edgeId,
        body:c.body,direction:'up',required:c.required,ramp:up},{entity:e,onStep:actor=>{observeDoor(actor);if(options.onStep)options.onStep(actor);}}):
        runContract(H,{id:c.id+':return:'+pad.id,kind:'supportClimb',sourceId:pad.id,body:c.body,required:c.required,
          solid:H.level.solids.find(s=>s.sourceId===pad.id)},{entity:e,onStep:actor=>{observeDoor(actor);if(options.onStep)options.onStep(actor);}});
      recoverySeconds+=rr.seconds;jumps+=rr.jumps;events.push({type:up?'NORMAL_STAIR_ASCENT':'VISIBLE_RETURN_PLATFORM',source:up?up.id:pad.id,status:rr.status});
      if(!rr.pass)return result('RECOVERY_FAILED',e,t,{recovery:rr});
      best=Infinity;noProgress=0;jumpCooldown=.1;continue;
    }
   }
   if(e.onGround&&feet<d.y-EPS&&recoveries<8){
    const rampIds=supported.map(s=>s.sourceRampId).filter(Boolean);
    const down=H.model.ramps.filter(r=>r.upperY<=feet+EPS&&r.lowerY>feet+EPS&&r.lowerY<=d.y+EPS&&
      (rampIds.includes(r.id)||(cx>=r.x0-40&&cx<=r.x1+40))).sort((a,b)=>(rampIds.includes(b.id)?1:0)-(rampIds.includes(a.id)?1:0))[0];
    if(down){
      const upperCloser=Math.abs(target-(down.upperAt==='right'?down.x1:down.x0))<Math.abs(target-(down.upperAt==='right'?down.x0:down.x1));
      recoveries++;const rr=runContract(H,{id:c.id+':recover:'+down.id,kind:upperCloser?'upperSideDrop':'ramp',sourceId:down.id,edgeId:down.edgeId,
       body:c.body,direction:'down',required:c.required,ramp:down},{entity:e,onStep:actor=>{observeDoor(actor);if(options.onStep)options.onStep(actor);}});
      recoverySeconds+=rr.seconds;jumps+=rr.jumps;events.push({type:'NORMAL_STAIR_DESCENT',ramp:down.id,status:rr.status});
      if(!rr.pass)return result('RECOVERY_FAILED',e,t,{recovery:rr});
      best=Infinity;noProgress=0;jumpCooldown=.1;continue;
    }
   }
   const lookX=dir>0?e.x+e.w+10:e.x-10;
   const lookSupport=H.level.solids.some(s=>Math.abs(s.y-feet)<EPS&&lookX>=s.x&&lookX<=s.x+s.w);
   const riseNeeded=e.onGround&&feet>d.y+EPS;
   const obstacle=e.onGround&&H.level.solids.some(s=>!s.oneway&&s.y<feet&&s.y+s.h>e.y&&
     (dir>0?s.x>=e.x+e.w-0.1&&s.x<=e.x+e.w+18:s.x+s.w<=e.x+0.1&&s.x+s.w>=e.x-18));
   const launch=e.onGround&&jumpCooldown<=0&&((jumpGap&&!jumped&&
     (dir>0?e.x+e.w>=edge.x0-6:e.x<=edge.x1+6))||riseNeeded||obstacle||(!jumpGap&&!lookSupport));
   if(launch){jumped=true;jumps++;}
   if(launch)jumpCooldown=.25;else jumpCooldown-=DT;
   const move=dist<=2?0:Math.sign(target-cx);
   const input={left:move<0,right:move>0,jump:launch};
   if(dist<best-0.5){best=dist;noProgress=0;}else noProgress+=DT;
   const fullDoorExit=c.kind!=='door'||(dir>0?e.x>=d.x+10-EPS:e.x+e.w<=d.x-10+EPS);
   const regionBounds=toPort&&(toPort.regionBounds||toPort.bounds);
   const targetRegionFit=!regionBounds||(e.x>=regionBounds.x0-EPS&&e.x+e.w<=regionBounds.x1+EPS);
   if(dist<(c.endTolerance||Math.max(6,spec.w*.5))&&e.onGround&&Math.abs(e.y+e.h-d.y)<EPS&&!maxEmbedded&&fullDoorExit&&targetRegionFit)return result(crossedDoor?'PASS':'DOOR_NOT_CROSSED',e,t,
     {target,targetSupport:end.s.id,targetRoom:toRoom?toRoom.id:null,targetRegion:toPort?toPort.region:null,
       authoredTargetCenter:endCenter,recoveries,crossedDoor,crossFailure});
   H.step(e,input,DT);sample(e,t,input);observeDoor(e);
   if(e.dead)return result('UNEXPECTED_DEATH',e,t);
   if(noProgress>2.2)return result(Math.abs(e.y+e.h-d.y)>spec.h+40?'WRONG_LAYER':'NO_PROGRESS',e,t,{target,expectedFeet:d.y});
  }
  return result('TIMEOUT',e,maxTime,{target});
 }
 if(c.kind==='ramp'){
  const r=c.ramp,up=c.direction==='up',asc=r.upperAt==='right'?1:-1,dir=up?asc:-asc;
  const treads=(H.model.ramps.find(x=>x.id===r.id)||{}).rects||[];
  const lowExtent=asc>0?Math.min(r.x0,...treads.map(t=>t.x)):Math.max(r.x1,...treads.map(t=>t.x+t.w));
  const lowerCenter=lowExtent-asc*(spec.w/2+6),upperCenter=asc>0?r.x1+spec.w/2+6:r.x0-spec.w/2-6;
  const feet=up?r.lowerY:r.upperY,targetFeet=up?r.upperY:r.lowerY;
  const start=legalSupportNear(up?lowerCenter:upperCenter,feet,up?-asc:asc,170)||legalSupportNear(up?lowerCenter:upperCenter,feet,0,170);
  const end=legalSupportNear(up?upperCenter:lowerCenter,targetFeet,up?asc:-asc,170)||legalSupportNear(up?upperCenter:lowerCenter,targetFeet,0,170);
  let e=options.entity||H.spawn(c.body,start?start.x:(up?lowerCenter:upperCenter)-spec.w/2,feet);
  Object.assign(startInfo,position(e),{support:H.support(e).map(s=>s.id),authoredCenter:up?lowerCenter:upperCenter});
  if((!start&&!options.entity)||!end||!validStart(e))return result('INVALID_START',e,0,{startFound:!!start,endFound:!!end,startFeet:feet,targetFeet});
  const goals=up?treads.slice().sort((a,b)=>b.y-a.y).map(s=>({x:s.x+s.w/2,y:s.y,id:s.id})):
    [{x:lowerCenter,y:targetFeet,dropPast:Math.max(...treads.map(s=>s.y))+5,id:r.id+':leave-lowest-tread'}];
  goals.push({x:end.x+spec.w/2,y:targetFeet,id:end.s.id});
  let stage=0,best=Infinity,noProgress=0,jumpLatched=false,usedRamp=false;
  const maxTime=Math.max(7,(Math.abs(goals[0].x-(e.x+e.w/2))+(r.x1-r.x0))/spec.speed*3+goals.length*1.1);
  for(let f=0;f<Math.ceil(maxTime/DT);f++){
   const t=f*DT,goal=goals[stage],cx=e.x+e.w/2,ef=e.y+e.h;
   const supports=H.support(e);if(supports.some(s=>s.sourceRampId===r.id))usedRamp=true;
   if(!up&&goal.dropPast&&ef>goal.dropPast){stage++;best=Infinity;noProgress=0;continue;}
   // Actual jumps can legally skip low treads. Advance only after a real
   // supported landing higher than the current tread, without moving entity.
   if(up&&e.onGround&&stage<goals.length-1&&ef<goal.y-EPS){
    while(stage<goals.length-1&&ef<goals[stage].y-EPS)stage++;
    best=Infinity;noProgress=0;jumpLatched=false;continue;
   }
   if(e.onGround&&Math.abs(ef-goal.y)<EPS&&(Math.abs(cx-goal.x)<Math.max(12,spec.w*.6)||
      (stage<goals.length-1&&supports.some(s=>s.id===goal.id)))){
    if(stage===goals.length-1)return result(usedRamp?'PASS':'WRONG_EXIT',e,t,{stages:goals.length,usedRamp});
    stage++;best=Infinity;noProgress=0;jumpLatched=false;continue;
   }
   const gx=goal.x-cx;const move=Math.abs(gx)<2?0:Math.sign(gx);
   let jump=false;
   if(up&&e.onGround&&ef>goal.y+EPS&&!jumpLatched){jump=true;jumpLatched=true;jumps++;}
   if(!e.onGround)jumpLatched=false;
   const input={left:move<0,right:move>0,jump};
   const distance=Math.abs(gx)+Math.abs(ef-goal.y)*.6;
   if(distance<best-1){best=distance;noProgress=0;}else noProgress+=DT;
   H.step(e,input,DT);sample(e,t,input);
   if(e.dead)return result('UNEXPECTED_DEATH',e,t,{stage,goal});
   if(maxEmbedded)return result('EMBEDDED',e,t,{stage,goal});
   if(noProgress>2.2)return result('NO_PROGRESS',e,t,{stage,goal,usedRamp});
  }
  return result('TIMEOUT',e,maxTime,{stage,goal:goals[stage],usedRamp});
 }
 throw new Error('Unknown contract '+c.kind);
}
module.exports={runContract};
