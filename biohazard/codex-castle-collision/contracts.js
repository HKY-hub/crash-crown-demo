'use strict';
function buildContracts(H) {
  const out=[];
  function nodeRegion(node,x){
    const prefix=node.split('_')[0],names={WG:'WG',BA:'WG',GATE:'WG',WK:'WK',KEEP:'WK',CT:'CT',TW:'CT',BW:'CG',BE:'CG',
      EL:'EL',CH:'EL',BELL:'EL',CEM:'EL',EW:'EW',ARM:'EW',WALL:'EW'};
    return H.data.regions.find(r=>r.id===names[prefix])||H.data.regions.find(r=>x>=r.x0&&x<=r.x1);
  }
  for(const r of H.data.ramps) for(const body of r.bodies==='HM'?['human','motherTitan']:['human'])
    for(const direction of ['up','down']) out.push({id:r.id+':'+body+':'+direction,kind:'ramp',sourceId:r.id,
      edgeId:r.edgeId,body,direction,required:true,ramp:r,mode:'normal_jump_steps',
      startLevel:direction==='up'?r.lowerLevel:r.upperLevel,targetLevel:direction==='up'?r.upperLevel:r.lowerLevel});
  for(const d of H.model.source.doors) for(const body of ['human','motherTitan']) for(const direction of ['right','left'])
    out.push({id:d.id+':'+body+':'+direction,kind:'door',sourceId:d.id,body,direction,required:true,door:d});
  for(const edge of H.model.source.edges.filter(e=>['walk','bridge','cave','gapJump'].includes(e.type)))
    for(const body of edge.bodies==='HM'?['human','motherTitan']:['human']) for(const direction of ['right','left'])
      {
       const ar=nodeRegion(edge.a,edge.x0),br=nodeRegion(edge.b,edge.x1);
       const left=ar.x0<=br.x0?ar:br,right=ar.x0<=br.x0?br:ar;
       out.push({id:edge.id+':'+body+':'+direction,kind:'edge',sourceId:edge.id,edgeId:edge.id,
        body,direction,required:true,edge,ports:{left:{nominalX:edge.x0,bounds:{x0:left.x0,x1:left.x1},region:left.id},
          right:{nominalX:edge.x1,bounds:{x0:right.x0,x1:right.x1},region:right.id}},
        portPolicy:'Actual supported endpoint in the source node region, before/after the authored span; no runtime snapping'});
      }
  for(const s of H.model.source.surfaces) for(const body of ['human','motherTitan'])
    out.push({id:s.id+':'+body,kind:'surface',sourceId:s.id,body,required:body==='human',surface:s});
  for(const p of H.model.source.points) for(const body of ['human','motherTitan'])
    out.push({id:p.id+':'+body,kind:'point',sourceId:p.id,body,point:p,
      required:p.kind==='infected'?body==='motherTitan':body==='human'});
  return out;
}
module.exports={buildContracts};
