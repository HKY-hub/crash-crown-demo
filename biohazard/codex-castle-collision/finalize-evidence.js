'use strict';
const fs=require('fs'),path=require('path');
const {createHarness}=require('./harness');
const directory=path.join(__dirname,'reports'),H=createHarness({compiler:'current'});
const frozenCoverageFile=path.join(directory,'pre-final-coverage.json');
if(!fs.existsSync(frozenCoverageFile))fs.copyFileSync(path.join(directory,'final.json'),frozenCoverageFile);
const sameKeys=['physicsSHA256','geometrySHA256','compilerSHA256','derivedSourceSHA256','compiledSolidsSHA256'];
const batches=['pre-final-coverage.json','final-doors-targeted.json','final-E37-targeted.json','watch-east-targeted.json','bounded-evidence.json','point-Z14-targeted.json'];
const merged=new Map(),evidenceBatches=[];
for(const filename of batches){
 const full=path.join(directory,filename);if(!fs.existsSync(full))throw new Error('Missing evidence '+filename);
 const report=JSON.parse(fs.readFileSync(full,'utf8'));
 const mismatches=sameKeys.filter(k=>report.metadata[k]!==H.metadata[k]);
 const localRevision=mismatches.length&&mismatches.every(k=>['compilerSHA256','derivedSourceSHA256','compiledSolidsSHA256'].includes(k));
 if(mismatches.length&&!localRevision)throw new Error('Incompatible original geometry/physics in '+filename);
 const reusedAffectedIds=['D_CT_WEST','D_EW_MED_W','D_FIX_WATCH_EAST_G2','ramp:E19','ramp:E58','ramp:E100','ramp:E65','ramp:E85',
  'E35','E53','E64','H12','A13','surface:EW_WATCH:1:shaft-part:0'];
 evidenceBatches.push({file:filename,created:report.created,metadata:report.metadata,controllerSHA256:report.metadata.controllerSHA256||null,
  schema:'results array',reusedBeforeLocalEastWatchRevision:!!localRevision,
  localRevisionScope:localRevision?'EW_WATCH east boundary and door move from8160to8120 with exterior slab retained; visible CT west door threshold x3416..3491 and MED threshold x6700..6784 added. Other cases reuse prior batch; affected cases superseded.':null,
  excludedAffectedIds:localRevision?reusedAffectedIds:[]});
 for(const r of report.results){
  if(filename==='pre-final-coverage.json'&&['pointMainRoute','midpointManeuver'].includes(r.kind))continue;
  if(localRevision&&reusedAffectedIds.some(id=>r.sourceId===id||r.edgeId===id||r.id.startsWith(id+':')))continue;
  merged.set(r.id,{...r,evidenceBatch:filename,evidenceCompilerSHA256:report.metadata.compilerSHA256});
 }
}
const results=[...merged.values()],groups={};
for(const r of results){
 if(r.start&&typeof r.start.support==='string'){
  const spec=H.specs[r.body],start=r.start;
  start.legacyPlannedSupport=start.support;
  start.support=H.level.solids.filter(s=>start.x<s.x+s.w-.001&&start.x+spec.w>s.x+.001&&Math.abs(start.feet-s.y)<.01).map(s=>s.id);
  start.supportEvidence='Reconstructed from the reported actual starting x/feet and current compiled solids. Legacy planned port support retained separately.';
 }
}
for(const r of results){const key=r.kind+':'+r.body,g=groups[key]||=( {total:0,passed:0,failed:0,requiredFailures:0,statuses:{}});
 g.total++;g[r.pass?'passed':'failed']++;if(r.required&&!r.pass)g.requiredFailures++;g.statuses[r.status]=(g.statuses[r.status]||0)+1;}
const allContracts=require('./contracts').buildContracts(H);
fs.writeFileSync(path.join(__dirname,'contracts.json'),JSON.stringify(allContracts,null,2));
const missingContracts=allContracts.filter(c=>!merged.has(c.id)).map(c=>({id:c.id,kind:c.kind,required:c.required}));
 const report={created:new Date().toISOString(),metadata:H.metadata,evidencePolicy:'Merged bounded batches. No final whole-map rerun. Each result retains its evidenceBatch and compiler hash. Original authored geometry and movement function unchanged; latest local EW east-boundary and CT/MED threshold revisions disclosed.',
 evidenceBatches,coverage:{...JSON.parse(fs.readFileSync(frozenCoverageFile,'utf8')).coverage,finalSurfaceSpans:H.model.source.surfaces.length,
  contracts:results.length,localContracts:allContracts.length,missingContracts:missingContracts.length},groups,
 requiredFailures:results.filter(r=>r.required&&!r.pass).length+missingContracts.filter(c=>c.required).length,missingContracts,
 pointMainRouteLinks:results.filter(r=>r.kind==='pointMainRoute'),midpointManeuvers:results.filter(r=>r.kind==='midpointManeuver'),results};
fs.writeFileSync(path.join(directory,'final.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(directory,'final-summary.json'),JSON.stringify({...report,results:results.map(r=>({...r,trace:undefined,events:undefined}))},null,2));
const graph={created:report.created,metadata:H.metadata,
 warning:'Bidirectional edges are independently input-proven connections. Shared abstract node labels do not establish position or state continuity. Main/alternative searches are planning summaries; continuous traversal evidence remains combinations.json.',bodies:{}};
function regionOfNode(node,x){const names={WG:'WG',BA:'WG',GATE:'WG',POOL:'WG',WK:'WK',KEEP:'WK',CT:'CT',TW:'CT',BW:'CG',BE:'CG',EL:'EL',CH:'EL',BELL:'EL',CEM:'EL',EW:'EW',ARM:'EW',WALL:'EW'};
 return names[node.split('_')[0]]||H.model.regions.find(r=>x>=r.x0&&x<=r.x1)?.id;}
function findPath(edges,a,b,excluded=new Set()){
 const q=[{node:a,nodes:[a],edges:[]}],seen=new Set([a]);
 while(q.length){const current=q.shift();if(current.node===b)return current;
  for(const e of edges){if(excluded.has(e.id))continue;const next=e.a===current.node?e.b:e.b===current.node?e.a:null;
   if(!next||seen.has(next))continue;seen.add(next);q.push({node:next,nodes:[...current.nodes,next],edges:[...current.edges,e.id]});}
 }return null;
}
const intendedPairs={WG:['WG_G1','BA_G1'],WK:['WK_C1','WK_G2'],CT:['CT_G1','TW_G2'],CG:['BW_G2','BE_G2'],EL:['EL_C1','EL_G2'],EW:['EW_G1','WALL_G1']};
for(const body of ['human','motherTitan']){
 const physical=[],failed=[];
 for(const edge of H.model.source.edges){
  const rr=results.filter(r=>r.body===body&&r.edgeId===edge.id&&['edge','ramp'].includes(r.kind));
  if(!rr.length)continue;
  const pair={id:edge.id,a:edge.a,b:edge.b,type:edge.type,regionA:regionOfNode(edge.a,edge.x0),regionB:regionOfNode(edge.b,edge.x1),
   contracts:rr.map(r=>({id:r.id,pass:r.pass,status:r.status,direction:r.direction,start:r.start,final:r.final,support:r.support,evidenceBatch:r.evidenceBatch}))};
  if(rr.length===2&&rr.every(r=>r.pass))physical.push(pair);else failed.push(pair);
 }
 const regions=H.model.regions.map(region=>{
  const [a,b]=intendedPairs[region.id],main=findPath(physical,a,b),alternative=main?findPath(physical,a,b,new Set(main.edges)):null;
  const pointLinks=report.pointMainRouteLinks.filter(p=>p.body===body&&p.region===region.id).map(p=>({id:p.id,pass:p.pass,status:p.status,port:p.port}));
  return{id:region.id,name:region.name,intendedPair:{a,b},main:main?{nodes:main.nodes,edges:main.edges,status:'LOCALLY_PROVEN_ABSTRACT_PATH',continuous:false}:{status:'NO_BIDIRECTIONALLY_PROVEN_ABSTRACT_PATH',continuous:false},
   alternative:alternative?{nodes:alternative.nodes,edges:alternative.edges,status:'EDGE_DISJOINT_ABSTRACT_PATH',continuous:false}:{status:'NO_EDGE_DISJOINT_PATH_PROVEN',continuous:false},
   pointLinks,pendingLocalEdges:failed.filter(e=>e.regionA===region.id||e.regionB===region.id).map(e=>e.id)};
 });
 graph.bodies[body]={nodes:[...new Set(physical.flatMap(e=>[e.a,e.b]))],provenBidirectionalEdges:physical,pendingOrFailed:failed,regions};
}
fs.writeFileSync(path.join(directory,'final-physical-graph.json'),JSON.stringify(graph,null,2));
console.log(JSON.stringify({metadata:report.metadata,groups,missingContracts,requiredFailures:report.requiredFailures,
 graph:Object.fromEntries(Object.entries(graph.bodies).map(([body,g])=>[body,{provenEdges:g.provenBidirectionalEdges.length,pending:g.pendingOrFailed.length,
 regions:g.regions.map(r=>({id:r.id,main:r.main.status,alternative:r.alternative.status}))}]))},null,2));
process.exitCode=report.requiredFailures?1:0;
