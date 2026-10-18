'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createHarness}=require('./harness');
const {buildContracts}=require('./contracts');
const {runContract}=require('./runner');
const H=createHarness({compiler:'current'}),contracts=buildContracts(H);
const directory=path.join(__dirname,'reports');
const old=JSON.parse(fs.readFileSync(path.join(directory,'final.json'),'utf8'));
for(const key of ['physicsSHA256','geometrySHA256'])
 if(old.metadata[key]!==H.metadata[key])throw new Error('Frozen report geometry mismatch: '+key);
const overlayFiles=['final-doors-targeted.json','final-E37-targeted.json','watch-east-targeted.json'];
const local=new Map(old.results.filter(r=>r.kind!=='pointMainRoute'&&r.kind!=='midpointManeuver').map(r=>[r.id,r]));
for(const filename of overlayFiles){
 const report=JSON.parse(fs.readFileSync(path.join(directory,filename),'utf8'));
 for(const key of ['physicsSHA256','geometrySHA256'])
  if(report.metadata[key]!==H.metadata[key])throw new Error(filename+' geometry mismatch: '+key);
 for(const result of report.results)local.set(result.id,result);
}
const proven=[...local.values()];
const pointMainRouteLinks=[];
for(const pc of contracts.filter(c=>c.kind==='point'&&c.required)){
 const point=pc.point,region=H.model.regions.find(r=>r.id===point.region),spec=H.specs[pc.body];
 const base={id:'point-main:'+pc.id,kind:'pointMainRoute',sourceId:point.id,pointId:point.id,body:pc.body,required:true,region:region.id};
 const settled=local.get(pc.id);
 if(!settled||!settled.pass){pointMainRouteLinks.push({...base,pass:false,status:'POINT_NOT_VALID'});continue;}
 const endpoints=[];
 for(const r of proven.filter(r=>r.pass&&r.body===pc.body&&['edge','ramp'].includes(r.kind))){
  for(const part of ['start','final']){
   const pos=r[part];
   if(Math.abs(pos.feet-point.y)>.03||pos.x<region.x0||pos.x+spec.w>region.x1)continue;
   endpoints.push({contractId:r.id,part,x:pos.x,feet:pos.feet,dist:Math.abs(pos.x-point.x)});
  }
 }
 endpoints.sort((a,b)=>a.dist-b.dist);const port=endpoints[0];
 if(!port){pointMainRouteLinks.push({...base,pass:false,status:'NO_PROVEN_REGIONAL_PORT'});continue;}
 const entity=H.spawn(pc.body,point.x,point.y);H.step(entity,{},1/120);H.step(entity,{},1/120);
 if(port.dist<.1){
  const supports=H.support(entity),embedded=H.embedded(entity);
  pointMainRouteLinks.push({...base,pass:supports.length>0&&!embedded.length,status:supports.length&&!embedded.length?'EXACT_PROVEN_PORT':'INVALID_START',
   port,start:{x:entity.x,feet:entity.y+entity.h},final:{x:entity.x,feet:entity.y+entity.h},support:supports.map(s=>s.id),seconds:0});continue;
 }
 const dir=port.x>point.x?'right':'left',a=point.x+spec.w/2,b=port.x+spec.w/2;
 const regional={bounds:{x0:region.x0,x1:region.x1},region:region.id},fixed={bounds:{x0:port.x-.005,x1:port.x+spec.w+.005},
  regionBounds:{x0:region.x0,x1:region.x1},region:region.id};
 const route={id:base.id,kind:'edge',sourceId:point.id,body:pc.body,direction:dir,required:true,
  edge:{id:'point-main:'+point.id,a:'point_'+point.lv,b:'port_'+point.lv,x0:Math.min(a,b),x1:Math.max(a,b),type:'walk',bodies:pc.body==='human'?'H':'HM'},
  ports:{left:dir==='left'?fixed:regional,right:dir==='right'?fixed:regional}};
 const result=runContract(H,route,{entity});
 pointMainRouteLinks.push({...result,...base,port,evidence:'Actual input-driven link to nearest same-region endpoint of a locally passed edge or ramp. This does not prove a globally composed main route.'});
}
const maneuvers=[];
for(const choice of [{edge:'E30',body:'human'},{edge:'E73',body:'motherTitan'},{edge:'E89',body:'motherTitan'}]){
 const c=contracts.find(c=>c.kind==='ramp'&&c.edgeId===choice.edge&&c.body===choice.body&&c.direction==='up');
 if(!c)throw new Error('Missing midpoint contract '+JSON.stringify(choice));
 let intervention=null;
 const snapshots=e=>({x:+e.x.toFixed(3),feet:+(e.y+e.h).toFixed(3),ground:e.onGround,dead:!!e.dead,
  support:H.support(e).map(s=>s.id),embedded:H.embedded(e).map(s=>s.id)});
 const ramp=H.model.ramps.find(r=>r.id===c.ramp.id),asc=ramp.upperAt==='right'?1:-1;
 const r=runContract(H,c,{onStep(e,t){
  if(intervention||!e.onGround||e.y+e.h<=ramp.upperY+.02||e.y+e.h>=ramp.lowerY-.02)return;
  const support=H.support(e).find(s=>s.sourceRampId===ramp.id);
  if(!support)return;
  intervention={atRunnerTime:t,tread:support.id,before:snapshots(e),pauseFrames:24,reverseFrames:12,positionCorrections:0};
  const pause=[];for(let i=0;i<24;i++){H.step(e,{},1/120);pause.push(snapshots(e));}
  intervention.afterPause=snapshots(e);
  intervention.pauseStable=pause.every(p=>p.ground&&!p.dead&&!p.embedded.length&&Math.abs(p.feet-intervention.before.feet)<.02);
  intervention.pauseMaxDx=Math.max(...pause.map(p=>Math.abs(p.x-intervention.before.x)));
  for(let i=0;i<12;i++)H.step(e,{left:asc>0,right:asc<0},1/120);
  intervention.afterReverse=snapshots(e);
  intervention.reverseMoved=asc>0?e.x<intervention.afterPause.x-.1:e.x>intervention.afterPause.x+.1;
  intervention.reverseSafe=!e.dead&&!H.embedded(e).length;
 }});
 const pass=!!intervention&&intervention.pauseStable&&intervention.reverseMoved&&intervention.reverseSafe&&r.pass;
 maneuvers.push({...r,id:'midpoint:'+c.id,kind:'midpointManeuver',pass,status:pass?'PASS':!intervention?'NO_INTERMEDIATE_STOP':!r.pass?r.status:'MANEUVER_FAILED',
  seconds:+(r.seconds+(intervention?.3:0)).toFixed(3),intervention,normalTraversalStatus:r.status,normalTraversalPass:r.pass,
  evidence:'One initialization; actual supported tread; release 0.2 s, reverse 0.1 s, resume normal real-input ascent; no entity state correction.'});
}
const report={created:new Date().toISOString(),metadata:{...H.metadata,controllerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'runner.js'))).digest('hex')},
 scope:'Bounded supplemental evidence only: 40 required point links and three representative stair pause/reverse scenarios. No whole-map rerun.',
 pointMainRouteLinks,maneuvers,results:[...pointMainRouteLinks,...maneuvers],
 requiredFailures:pointMainRouteLinks.filter(r=>!r.pass).length+maneuvers.filter(r=>!r.pass).length};
fs.writeFileSync(path.join(directory,'bounded-evidence.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({metadata:report.metadata,pointLinks:{passed:pointMainRouteLinks.filter(r=>r.pass).length,total:pointMainRouteLinks.length,
 failed:pointMainRouteLinks.filter(r=>!r.pass).map(r=>({id:r.id,status:r.status,final:r.final,port:r.port}))},
 maneuvers:maneuvers.map(r=>({id:r.id,status:r.status,final:r.final,intervention:r.intervention})),requiredFailures:report.requiredFailures},null,2));
process.exitCode=report.requiredFailures?1:0;
