'use strict';
const fs=require('fs'),path=require('path');
const {createHarness}=require('./harness');
const {buildContracts}=require('./contracts');
const {runContract}=require('./runner');
const args=process.argv.slice(2),baseline=args.includes('--baseline'),compiler=baseline?'baseline':'current';
const selectIndex=args.indexOf('--only'),only=selectIndex>=0?args[selectIndex+1]:null;
const bodyIndex=args.indexOf('--body'),body=bodyIndex>=0?args[bodyIndex+1]:null;
const labelIndex=args.indexOf('--label'),label=labelIndex>=0?args[labelIndex+1]:baseline?'baseline':'final';
const H=createHarness({compiler});
let contracts=buildContracts(H);if(only)contracts=contracts.filter(c=>c.kind===only||c.id.includes(only));
if(body)contracts=contracts.filter(c=>c.body===body);
if(!contracts.length)throw new Error('Selection matched no contracts: '+only);
const results=contracts.map(c=>runContract(H,c));
const pointMainRouteLinks=[];
if(!only){
 for(const pc of contracts.filter(c=>c.kind==='point'&&c.required)){
  const point=pc.point,region=H.model.regions.find(r=>r.id===point.region),spec=H.specs[pc.body];
  const settled=results.find(r=>r.id===pc.id);
  if(!settled.pass){pointMainRouteLinks.push({pointId:point.id,body:pc.body,pass:false,status:'POINT_NOT_VALID'});continue;}
  const endpoints=[];
  for(const r of results.filter(r=>r.pass&&r.body===pc.body&&['edge','ramp'].includes(r.kind))){
   for(const part of ['start','final']){
    const pos=r[part];
    if(Math.abs(pos.feet-point.y)>.03||pos.x<region.x0||pos.x+spec.w>region.x1)continue;
    endpoints.push({contractId:r.id,part,x:pos.x,feet:pos.feet,dist:Math.abs(pos.x-point.x)});
   }
  }
  endpoints.sort((a,b)=>a.dist-b.dist);const port=endpoints[0];
  if(!port){pointMainRouteLinks.push({pointId:point.id,body:pc.body,pass:false,status:'NO_PROVEN_REGIONAL_PORT',region:region.id});continue;}
  const e=H.spawn(pc.body,point.x,point.y);H.step(e,{},1/120);H.step(e,{},1/120);
  if(port.dist<.1){pointMainRouteLinks.push({pointId:point.id,body:pc.body,pass:true,status:'EXACT_PROVEN_PORT',port,region:region.id,
    support:H.support(e).map(s=>s.id)});continue;}
  const dir=port.x>point.x?'right':'left',a=point.x+spec.w/2,b=port.x+spec.w/2;
  const regional={bounds:{x0:region.x0,x1:region.x1},region:region.id},fixed={bounds:{x0:port.x-.005,x1:port.x+spec.w+.005},
    regionBounds:{x0:region.x0,x1:region.x1},region:region.id};
  const route={id:'point-main:'+pc.id,kind:'edge',sourceId:point.id,body:pc.body,direction:dir,required:true,
   edge:{id:'point-main:'+point.id,a:'point_'+point.lv,b:'port_'+point.lv,x0:Math.min(a,b),x1:Math.max(a,b),type:'walk',bodies:pc.body==='human'?'H':'HM'},
   ports:{left:dir==='left'?fixed:regional,right:dir==='right'?fixed:regional}};
  const result=runContract(H,route,{entity:e});pointMainRouteLinks.push({pointId:point.id,body:pc.body,pass:result.pass,
    status:result.status,region:region.id,port,result});
 }
}
const groups={};for(const r of results){const k=r.kind+':'+r.body;(groups[k]||=( {total:0,passed:0,failed:0,requiredFailures:0,statuses:{}}));
 const g=groups[k];g.total++;g[r.pass?'passed':'failed']++;if(!r.pass&&r.required)g.requiredFailures++;g.statuses[r.status]=(g.statuses[r.status]||0)+1;}
const report={created:new Date().toISOString(),metadata:H.metadata,coverage:{ramps:H.data.ramps.length,doors:H.data.doors.length,
 surfaces:H.data.surfaces.length,finalSurfaceSpans:H.model.source.surfaces.length,points:H.data.points.length,
 corridorEdges:H.data.edges.filter(e=>['walk','bridge','cave','gapJump'].includes(e.type)).length,contracts:contracts.length},groups,
 requiredFailures:results.filter(x=>x.required&&!x.pass).length+pointMainRouteLinks.filter(x=>!x.pass).length,
 pointMainRouteLinks,results};
const reports=path.join(__dirname,'reports');fs.mkdirSync(reports,{recursive:true});
fs.writeFileSync(path.join(reports,label+'.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(reports,label+'-summary.json'),JSON.stringify({...report,results:results.map(r=>({...r,trace:undefined,events:undefined}))},null,2));
if(!only){
 fs.writeFileSync(path.join(__dirname,'contracts.json'),JSON.stringify(contracts,null,2));
 const graph={warning:'Edges represent independently proven local source connections. Long route state continuity is reported separately in combinations.json.',bodies:{}};
 for(const body of ['human','motherTitan']){
  const physical=[],failed=[];
  for(const e of H.data.edges){
   const rr=results.filter(r=>r.body===body&&r.edgeId===e.id);
   if(!rr.length)continue;
   const pair={id:e.id,a:e.a,b:e.b,type:e.type,contracts:rr.map(r=>({id:r.id,pass:r.pass,status:r.status,direction:r.direction,
     start:r.start,final:r.final,support:r.support}))};
   if(rr.every(r=>r.pass)&&rr.length===2)physical.push(pair);else failed.push(pair);
  }
  graph.bodies[body]={nodes:[...new Set(physical.flatMap(e=>[e.a,e.b]))],provenBidirectionalEdges:physical,pendingOrFailed:failed};
 }
 fs.writeFileSync(path.join(reports,label+'-physical-graph.json'),JSON.stringify(graph,null,2));
}
console.log(JSON.stringify({label,metadata:H.metadata,coverage:report.coverage,groups,requiredFailures:report.requiredFailures},null,2));
process.exitCode=report.requiredFailures?1:0;
