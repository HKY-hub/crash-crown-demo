'use strict';
(() => {
  const engines=new WeakMap();
  const intersects=(r,v)=>r.x1>=v.x0&&r.x0<=v.x1&&(r.base??r.floor??r.y1)>=v.y0&&(r.top??r.y0??0)<=v.y1;
  function makeEngine(data,providedModel) {
    const model=providedModel||CastleRebuildModel.compileGeometry(data),chunks=new Map(),size=512,maxChunks=48;
    // Floor openings, point repairs and wall seams are the same derived source
    // used by Level. Keep the accepted raw JSON only for the old comparison.
    data=model.source||data;
    const lights=data.rooms.flatMap(r=>CastleArtProps.getLights(r).map(l=>({...l,roomId:r.id})));
    function drawStatic(g,v) {
      const a=CastleArtArchitecture;
      CastleArtEnvironment.drawUnderground(g,data,v);
      for(const volume of data.volumes)if(intersects(volume,v))a.volume(g,volume,data);
      if(typeof CastleArtExterior!=='undefined')CastleArtExterior.draw(g,data,v);
      for(const s of data.surfaces)if(!s.sky&&!s.oneway&&s.sourceKind!=='bridge'&&s.x1>=v.x0&&s.x0<=v.x1&&s.y>=v.y0&&s.y-106<=v.y1){
        a.rect(g,s.x0,s.y-106,s.x1-s.x0,106,s.y>=1780?'#1a282c':'#263137');
        for(let xx=s.x0+30;xx<s.x1-20;xx+=120){a.arch(g,xx,s.y-92,76,89,'#1c292f');a.line(g,xx,s.y-6,xx,s.y-58,'#48534f',3);}
      }
      for(const room of data.rooms)if(intersects(room,v)) {
        if(/CAVE|POOL|WATER_TUNNEL/.test(room.id)&&CastleArtEnvironment.drawCaveRoom)CastleArtEnvironment.drawCaveRoom(g,room);
        else if(!CastleArtEnvironment.drawWaterRoom?.(g,room))a.room(g,room);
        g.save();g.beginPath();g.rect(room.x0+3,room.top+5,room.x1-room.x0-6,room.floor-room.top-5);g.clip();
        CastleArtProps.drawRoom(g,room,{detail:true,time:0});g.restore();
      }
      for(const o of data.openSpaces)if(o.x1>=v.x0&&o.x0<=v.x1)a.courtyard(g,o,data);
      for(const ramp of model.ramps)if(ramp.x1+320>=v.x0&&ramp.x0-100<=v.x1&&ramp.lowerY+50>=v.y0&&ramp.upperY-35<=v.y1)a.stairs(g,ramp,ramp.rects);
      for(const s of data.surfaces)if(s.x1>=v.x0&&s.x0<=v.x1&&s.y+42>=v.y0&&s.y<=v.y1)a.surface(g,s,data);
      for(const w of model.walls||[])if(w.x+w.w>=v.x0&&w.x<=v.x1&&w.y+w.h>=v.y0&&w.y<=v.y1){
        a.masonry(g,w.x,w.y,w.w,w.h,'exterior',w.id);
        a.rect(g,w.x,w.y,2,w.h,'#7b8880');a.rect(g,w.x+w.w-3,w.y,3,w.h,'#18252c');
        a.line(g,w.x,w.y,w.x+w.w,w.y,'#a0aaa0',2);
      }
      for(const door of data.doors)if(door.x+45>=v.x0&&door.x-45<=v.x1&&(door.openingBottom??door.y)>=v.y0&&(door.openingTop??door.y-150)<=v.y1)a.door(g,door);
      for(const r of data.rooms)if(/POOL|CISTERN|WATER_TUNNEL|DRAIN/.test(r.id)&&intersects(r,v)){
        a.rect(g,r.x0+4,r.floor-9,r.x1-r.x0-8,9,'#243e43');a.line(g,r.x0+5,r.floor-9,r.x1-5,r.floor-9,'#506866');
        for(let xx=r.x0+17;xx<r.x1-8;xx+=69)a.line(g,xx,r.floor-5,xx+21,r.floor-5,'#3e595a');
      }
    }
    function chunk(cx,cy) {
      const key=cx+','+cy;if(chunks.has(key)){const c=chunks.get(key);chunks.delete(key);chunks.set(key,c);return c;}
      const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.translate(-cx*size,-cy*size);
      drawStatic(g,{x0:cx*size,y0:cy*size,x1:(cx+1)*size,y1:(cy+1)*size});
      chunks.set(key,c);if(chunks.size>maxChunks)chunks.delete(chunks.keys().next().value);return c;
    }
    function render(g,cam,options={}) {
      const scale=options.scale??1,width=options.width??960,height=options.height??540,time=options.time??0;
      const x=cam.x??cam.camX??0,y=cam.y??cam.camY??1180,v={x0:x,y0:y,x1:x+width/scale,y1:y+height/scale,camX:x,camY:y,width,height,scale};
      g.save();g.imageSmoothingEnabled=false;
      CastleArtEnvironment.drawBackground(g,{camX:x,camY:y,width,height,scale,data,time});
      g.translate(-x*scale,-y*scale);g.scale(scale,scale);
      for(let cy=Math.floor(y/size);cy<=Math.floor(v.y1/size);cy++)for(let cx=Math.floor(x/size);cx<=Math.floor(v.x1/size);cx++)g.drawImage(chunk(cx,cy),cx*size,cy*size);
      if(options.effects!==false){
        CastleArtEnvironment.drawEffects(g,data,v,time,lights.filter(l=>l.x+l.radius>=v.x0&&l.x-l.radius<=v.x1&&l.y+l.radius>=v.y0&&l.y-l.radius<=v.y1));
        for(const r of data.rooms)if(/HALL|LIBRARY|NAVE|AUDIENCE/.test(r.id)&&intersects(r,v)){
          g.save();g.beginPath();g.rect(r.x0,r.top,r.x1-r.x0,r.floor-r.top);g.clip();g.fillStyle='#c7c0a0';
          for(let i=0;i<5;i++){const phase=CastleArtArchitecture.hash(r.id+i),xx=r.x0+30+(phase*(r.x1-r.x0-60)+time*(1+i%2))%(r.x1-r.x0-60),yy=r.top+25+(phase*111+i*21)%(r.floor-r.top-40);g.globalAlpha=.08+.03*Math.sin(time+phase*7);g.fillRect(xx,yy,1,1);}g.restore();
        }
      }
      if(options.collision) {
        g.lineWidth=1/scale;g.strokeStyle='#6fdfc6';g.globalAlpha=.8;
        for(const s of model.solids)if(s.x+s.w>=v.x0&&s.x<=v.x1&&s.y+s.h>=v.y0&&s.y<=v.y1)g.strokeRect(s.x,s.y,s.w,s.h);g.globalAlpha=1;
      }
      if(options.actor) {
        const op=typeof OperatorSkins!=='undefined'?OperatorSkins.get('vanguard'):typeof OperatorVanguard!=='undefined'?OperatorVanguard:null;
        if(op) {
          const image=op.get(options.actor.anim||'idle',0,'level'),ih=62*60/56,iw=image.width/image.height*ih,ax=options.actor.x,ay=options.actor.y;
          g.drawImage(image,ax-iw/2,ay-ih,iw,ih);const insignia=op.getInsignia?.('idle',0);if(insignia)g.drawImage(insignia,ax-iw/2,ay-ih,iw,ih);
        }
      }
      g.restore();return {chunks:chunks.size,lights:lights.length,geometrySource:data,model};
    }
    return {render,model,clear:()=>chunks.clear(),get cacheSize(){return chunks.size;}};
  }
  function engine(data,model) {if(!engines.has(data))engines.set(data,makeEngine(data,model));return engines.get(data);}
  function renderWorld(g,M,cam,opts={}) {
    const factor=M.scaleFactor||1,base=M.scaleBaseModel||M,data=base.source||base;
    const view=factor===1?cam:{x:(cam.x??cam.camX??0)/factor,y:(cam.y??cam.camY??1180)/factor};
    return engine(data,base.source?base:null).render(g,view,{...opts,scale:(opts.scale??1)*factor});
  }
  function renderOverlay(g,M,cam) {
    if(!M.solids)return;g.save();g.translate(-cam.x,-cam.y);g.strokeStyle='#6fdfc6';g.lineWidth=1;g.globalAlpha=.7;
    for(const s of M.solids)if(s.x+s.w>=cam.x&&s.x<=cam.x+960&&s.y+s.h>=cam.y&&s.y<=cam.y+540)g.strokeRect(s.x,s.y,s.w,s.h);g.restore();
  }
  window.CastleArtRebuild={engine,renderWorld,renderOverlay};
})();
