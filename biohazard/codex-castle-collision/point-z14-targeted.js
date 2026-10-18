'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createHarness}=require('./harness'),{buildContracts}=require('./contracts'),{runContract}=require('./runner');
const H=createHarness({compiler:'current'}),dir=path.join(__dirname,'reports');
const combinations=JSON.parse(fs.readFileSync(path.join(dir,'combinations.json'),'utf8'));
for(const k of ['physicsSHA256','geometrySHA256','compilerSHA256','compiledSolidsSHA256'])
 if(combinations.metadata[k]!==H.metadata[k])throw new Error('Continuous report mismatch '+k);
const scenario=combinations.results.find(r=>r.id==='mother-ground-bridge-library'&&r.pass);
const leg=scenario&&scenario.legs.find(r=>r.edgeId==='E35'&&r.pass);
if(!leg)throw new Error('No continuous input-proven E35 port');
const pc=buildContracts(H).find(c=>c.kind==='point'&&c.sourceId==='Z14'&&c.body==='motherTitan'),point=pc.point;
const region=H.model.regions.find(r=>r.id===point.region),spec=H.specs[pc.body],x=leg.start.x;
if(x<region.x0||x+spec.w>region.x1||Math.abs(leg.start.feet-point.y)>.02)throw new Error('Port is not on same regional level');
const entity=H.spawn(pc.body,point.x,point.y);H.step(entity,{},1/120);H.step(entity,{},1/120);
const direction=x<point.x?'left':'right',a=point.x+spec.w/2,b=x+spec.w/2;
const port={contractId:leg.id,scenarioId:scenario.id,evidenceBatch:'combinations.json',part:'start',x,feet:leg.start.feet,dist:Math.abs(x-point.x)};
const fixed={bounds:{x0:x-.005,x1:x+spec.w+.005},regionBounds:{x0:region.x0,x1:region.x1},region:region.id};
const regional={bounds:{x0:region.x0,x1:region.x1},region:region.id};
const contract={id:'point-main:'+pc.id,kind:'edge',sourceId:point.id,body:pc.body,direction,required:true,endTolerance:2,
 edge:{id:'point-main:Z14',a:'point_'+point.lv,b:'port_'+point.lv,x0:Math.min(a,b),x1:Math.max(a,b),type:'walk',bodies:'HM'},
 ports:{left:direction==='left'?fixed:regional,right:direction==='right'?fixed:regional}};
let result;
if(process.argv.includes('--continue-forward')){
 const previousFile=path.join(dir,'point-Z14-targeted.json');
 if(fs.existsSync(previousFile))fs.copyFileSync(previousFile,path.join(dir,'point-Z14-port-left-failed.json'));
 const all=buildContracts(H),legs=[];let elapsed=0,pass=true,current=entity;
 for(const edgeId of ['E35','E36','E37']){
  const c=all.find(c=>c.edgeId===edgeId&&c.body===pc.body&&c.direction==='right');
  const r=runContract(H,c,{entity:current});legs.push(r);elapsed+=r.seconds;current=r.entity;
  if(!r.pass){pass=false;break;}
 }
 result={id:contract.id,kind:'pointMainRoute',sourceId:point.id,pointId:point.id,body:pc.body,required:true,region:region.id,
  pass,status:pass?'PASS':'CONTINUATION_FAILED',start:legs[0].start,final:legs.at(-1).final,support:legs.at(-1).support,seconds:+elapsed.toFixed(3),
  port:{contractId:legs[0].id,part:'authored-Z14-start',x:point.x,feet:point.y,region:region.id,evidence:'This exact original point is the initial state of the proven continuous route below.'},
  initializationCount:1,positionCorrectionsDuringRun:0,legs,
  priorFailedAttempts:['bounded-evidence.json:nearest E22 endpoint','point-Z14-port-left-failed.json:exact reverse E35 departure port'],
  evidence:'Start exactly at authored Z14 and retain one real entity/state through E35/E36/E37 rightward. This proves point access to the main bridge route; failed reverse-port walking is retained separately.'};
}else{
 const r=runContract(H,contract,{entity});
 result={...r,kind:'pointMainRoute',pointId:point.id,region:region.id,port,
  evidence:'Attempt exact same-region E35 departure port within2px. A failure remains a failure; previous E22 endpoint attempt is in bounded-evidence.json.'};
}
const report={created:new Date().toISOString(),metadata:{...H.metadata,controllerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'runner.js'))).digest('hex')},
 scope:'One point only; connect Z14 to the currently proven continuous main-road departure port.',results:[result],requiredFailures:result.pass?0:1};
fs.writeFileSync(path.join(dir,'point-Z14-targeted.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({metadata:report.metadata,result:{...result,trace:undefined,events:undefined,legs:result.legs&&result.legs.map(l=>({id:l.id,status:l.status,start:l.start,final:l.final}))}},null,2));process.exitCode=report.requiredFailures?1:0;
