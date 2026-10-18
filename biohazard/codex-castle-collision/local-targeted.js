'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createHarness}=require('./harness'),{buildContracts}=require('./contracts'),{runContract}=require('./runner');
const H=createHarness({compiler:'current'});
const ids=new Set(['D_CT_WEST','D_EW_MED_W','D_FIX_WATCH_EAST_G2','ramp:E19','ramp:E58','ramp:E100','ramp:E65','ramp:E85',
 'E35','E53','E64','H12','A13','surface:P_FIX_CT_WEST_THRESHOLD:0','surface:P_FIX_EW_MED_THRESHOLD:0','surface:EW_WATCH:1:shaft-part:0']);
const contracts=buildContracts(H).filter(c=>ids.has(c.sourceId)||ids.has(c.edgeId));
const results=contracts.map(c=>runContract(H,c));
const groups={};for(const r of results){const k=r.kind+':'+r.body,g=groups[k]||={passed:0,total:0};g.total++;if(r.pass)g.passed++;}
const report={created:new Date().toISOString(),metadata:{...H.metadata,controllerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'runner.js'))).digest('hex')},
 scope:'Bounded recheck of three door thresholds, five adjacent stair/ramp IDs, E35/E53/E64, H12/A13 and new/moved floor spans. No whole-map rerun.',
 results,groups,requiredFailures:results.filter(r=>r.required&&!r.pass).length};
fs.writeFileSync(path.join(__dirname,'reports/watch-east-targeted.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({metadata:report.metadata,groups,total:results.length,requiredFailures:report.requiredFailures,
 failures:results.filter(r=>!r.pass).map(r=>({id:r.id,status:r.status,final:r.final,blocking:r.blocking}))},null,2));
process.exitCode=report.requiredFailures?1:0;
