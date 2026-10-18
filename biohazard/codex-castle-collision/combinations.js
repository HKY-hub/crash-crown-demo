'use strict';
const fs=require('fs'),path=require('path');
const {createHarness}=require('./harness');
const {buildContracts}=require('./contracts');
const {runContract}=require('./runner');
const H=createHarness({compiler:'current'}),contracts=buildContracts(H);
const oldPath=path.join(__dirname,'reports/combinations.json');
const oldEvidence=fs.existsSync(oldPath)?JSON.parse(fs.readFileSync(oldPath,'utf8')):null;
const singleSupplement=process.argv.includes('--human-supported');
const scenarios=[
 {id:'human-ground-bridge-library',body:'human',x:4300,feet:1470,legs:[['E35','right'],['E36','right'],['E37','right']]},
 {id:'human-underground-regions',body:'human',x:3000,feet:1780,legs:[['E20','right'],['E38','right'],['E39','right'],['E40','right'],['E48','right']]},
 {id:'human-stairs-down-underground-return',body:'human',x:1160,feet:1620,legs:[['E02','up'],['E02','down'],['E01','left'],['E03','down'],['E03','up'],['E01','right'],['E02','up']]},
 {id:'mother-ground-bridge-library',body:'motherTitan',x:4300,feet:1470,legs:[['E35','right'],['E36','right'],['E37','right']]},
];
const selected=singleSupplement?[{id:'human-ground-bridge-library-supported',body:'human',x:4340,feet:1470,
 legs:[['E35','right'],['E36','right'],['E37','right']],initialPort:'source:CT_EAST_PASSAGE x4334..4400@y1470; same declared CT start region'}]:scenarios;
const results=[];
for(const s of selected){
 let entity=H.spawn(s.body,s.x,s.feet),seconds=0,pass=true;const legs=[];
 for(let f=0;f<2;f++)H.step(entity,{},1/120);
 const initialEmbedded=H.embedded(entity),initialSupport=H.support(entity);
 if(initialEmbedded.length||!initialSupport.length){results.push({...s,pass:false,status:'INVALID_START',blockers:initialEmbedded.map(x=>x.id)});continue;}
 for(const [edgeId,direction] of s.legs){
  const c=contracts.find(c=>c.edgeId===edgeId&&c.body===s.body&&c.direction===direction);
  if(!c)throw new Error('Missing composite contract '+edgeId+':'+direction);
  const r=runContract(H,c,{entity});legs.push(r);seconds+=r.seconds;entity=r.entity;
  if(!r.pass){pass=false;break;}
 }
 results.push({...s,pass,seconds:+seconds.toFixed(3),status:pass?'PASS':'FAILED_LEG',legs,
  initializationCount:1,positionCorrectionsDuringRun:0});
}
fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});
const allResults=singleSupplement&&oldEvidence?[...oldEvidence.results.filter(r=>r.id!=='human-ground-bridge-library-supported'),...results]:results;
const output={created:new Date().toISOString(),metadata:H.metadata,results:allResults,passed:allResults.filter(r=>r.pass).length,
 failed:allResults.filter(r=>!r.pass).length,scope:'Four original finite continuous input-driven combinations plus one explicit legal-supported human initial-port supplement; original unsupported x4300 failure retained. Same entity and state across legs, no combat.'};
fs.writeFileSync(path.join(__dirname,'reports/combinations.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({...output,results:results.map(r=>({...r,legs:r.legs&&r.legs.map(l=>({id:l.id,status:l.status,seconds:l.seconds,final:l.final}))}))},null,2));
process.exitCode=output.failed?1:0;
