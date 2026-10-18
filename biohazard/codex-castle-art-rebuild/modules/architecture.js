'use strict';
(() => {
  const cache = new Map();
  const colors = { mortar:'#20272b', stone:'#485155', light:'#768184', dark:'#303a40', wood:'#594536', metal:'#69767c' };
  function hash(key) { let n=2166136261; for(const c of String(key)) n=Math.imul(n^c.charCodeAt(0),16777619); return (n>>>0)/4294967296; }
  const rect=(g,x,y,w,h,c)=>{ if(w<=0||h<=0)return; g.fillStyle=c; g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); };
  function line(g,x,y,a,b,c,w=1) { g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(Math.round(x)+.5,Math.round(y)+.5);g.lineTo(Math.round(a)+.5,Math.round(b)+.5);g.stroke(); }
  function poly(g,p,c) { g.fillStyle=c;g.beginPath();g.moveTo(...p[0]);for(const q of p.slice(1))g.lineTo(...q);g.closePath();g.fill(); }
  function archPath(g,x,y,w,h) {
    g.moveTo(x,y+h);g.lineTo(x,y+h*.43);
    g.bezierCurveTo(x,y+h*.24,x+w*.22,y+h*.1,x+w*.5,y);
    g.bezierCurveTo(x+w*.78,y+h*.1,x+w,y+h*.24,x+w,y+h*.43);
    g.lineTo(x+w,y+h);g.closePath();
  }
  function arch(g,x,y,w,h,c) { g.fillStyle=c;g.beginPath();archPath(g,x,y,w,h);g.fill(); }
  function masonry(g,x,y,w,h,kind='exterior',id='stone') {
    const key=kind; let tile=cache.get(key);
    if(!tile) {
      tile=document.createElement('canvas');tile.width=384;tile.height=256;
      const t=tile.getContext('2d');rect(t,0,0,384,256,kind==='interior'?'#222b30':'#283136');
      let yy=0,row=0;
      while(yy<256) {
        const rh=[28,34,26,38,30,36,32,32][row%8]; let xx=-60+(row%2)*29,col=0;
        while(xx<384) {
          const bw=42+Math.floor(hash(`${row}:${col}`)*42), tone=Math.floor(hash(`t:${row}:${col}`)*5);
          const palette=kind==='interior'?['#30383b','#343c3f','#384145','#3d4445','#303a3e']:['#424d50','#4b5556','#455053','#505859','#3e4a50'];
          rect(t,xx+1,yy+1,bw-2,rh-2,palette[tone]);
          line(t,xx+3,yy+2,xx+bw-4,yy+2,kind==='interior'?'#464f51':'#687275');
          line(t,xx+bw-2,yy+3,xx+bw-2,yy+rh-3,kind==='interior'?'#252d32':'#30383d');
          if(hash(`chip:${row}:${col}`)>.86)poly(t,[[xx+2,yy+rh-4],[xx+10,yy+rh-2],[xx+3,yy+rh-12]],'#283238');
          if(hash(`crack:${row}:${col}`)>.91){line(t,xx+bw*.4,yy+8,xx+bw*.46,yy+rh*.58,'#303c40');line(t,xx+bw*.46,yy+rh*.58,xx+bw*.38,yy+rh-6,'#303c40');}
          xx+=bw;col++;
        } yy+=rh;row++;
      }
      cache.set(key,tile);
    }
    g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
    const pattern=g.createPattern(tile,'repeat');g.fillStyle=pattern;g.fillRect(x,y,w,h);g.restore();
  }
  function archFrame(g,x,y,w,h,depth=9) {
    arch(g,x-4,y-4,w+8,h+8,'#151e24');arch(g,x,y,w,h,'#737973');
    arch(g,x+3,y+4,w-6,h-4,'#4c5759');arch(g,x+depth,y+depth,w-depth*2,h-depth,'#131c23');
    line(g,x+depth,y+h,x+depth,y+h*.46,'#87908a',2);
    line(g,x+w-depth,y+h*.46,x+w-depth,y+h,'#262f36',3);
    for(let i=1;i<8;i++) {
      const t=i/8, xx=x+w*t, yy=y+h*.44*Math.pow(Math.abs(t-.5)*2,1.5);
      line(g,xx,yy,xx+(t-.5)*9,yy+depth,'#293438',1);
    }
    for(let yy=y+h*.47;yy<y+h-4;yy+=21){line(g,x,yy,x+depth,yy,'#293438');line(g,x+w-depth,yy,x+w,yy,'#293438');}
    rect(g,x-3,y+h-4,w+6,7,'#626d6c');line(g,x-3,y+h-4,x+w+3,y+h-4,'#98a09a');
  }
  function window(g,x,y,w,h,variant=0) {
    archFrame(g,x,y,w,h,7);
    g.save();g.beginPath();archPath(g,x+8,y+8,w-16,h-12);g.clip();
    const sky=g.createLinearGradient(0,y,0,y+h);sky.addColorStop(0,'#1b2737');sky.addColorStop(1,variant%3===1?'#394854':'#283744');g.fillStyle=sky;g.fillRect(x+8,y+8,w-16,h-12);
    if(variant%3===2){for(let yy=y+26;yy<y+h;yy+=18)for(let xx=x+8;xx<x+w-8;xx+=12)rect(g,xx+1,yy+1,10,16,['#583c4a','#4a5267','#746148','#354d50'][(Math.floor(xx/12)+Math.floor(yy/18))%4]);}
    line(g,x+w/2,y+19,x+w/2,y+h-4,'#7a8587',3);
    line(g,x+8,y+h*.6,x+w-8,y+h*.6,'#687579',2);
    line(g,x+8,y+h*.8,x+w-8,y+h*.8,'#48585f',2);
    g.strokeStyle='#84908c';g.lineWidth=2;
    for(const s of [-1,1]){g.beginPath();g.arc(x+w/2+s*w*.15,y+h*.37,w*.19,Math.PI,0);g.stroke();}
    if(variant%4===0)poly(g,[[x+w*.7,y+h*.6],[x+w*.84,y+h*.5],[x+w*.78,y+h*.79],[x+w*.62,y+h*.74]],'#0c1720');
    g.restore();
    rect(g,x-5,y+h+3,w+10,4,'#384449');
  }
  function pilaster(g,x,y,h,w=17) {
    rect(g,x-3,y,w+6,h,'#263238');rect(g,x,y,w,h,'#5a6362');rect(g,x+3,y,3,h,'#87928c');rect(g,x+w-4,y,4,h,'#344149');
    for(let yy=y+22;yy<y+h;yy+=35)line(g,x,yy,x+w,yy,'#333f44');
    rect(g,x-5,y+9,w+10,7,'#737d75');rect(g,x-5,y+h-12,w+10,12,'#4a5759');line(g,x-5,y+h-12,x+w+5,y+h-12,'#84908a');
  }
  function banner(g,x,y,w=27,h=63,tone='#59343c') {
    rect(g,x-4,y-4,w+8,4,'#74766a');poly(g,[[x,y],[x+w,y],[x+w-2,y+h],[x+w*.68,y+h-8],[x+w*.5,y+h],[x+w*.31,y+h-10],[x+2,y+h-2]],tone);
    line(g,x+4,y+2,x+5,y+h-9,'#865457');line(g,x+w-6,y+1,x+w-5,y+h-4,'#392730',3);
    poly(g,[[x+w*.5,y+15],[x+w*.76,y+24],[x+w*.64,y+36],[x+w*.5,y+44],[x+w*.34,y+36],[x+w*.26,y+24]],'#a29270');
    line(g,x+w*.5,y+19,x+w*.5,y+38,'#4b3940',2);
  }
  function cornice(g,x,y,w) {rect(g,x-4,y-3,w+8,5,'#939b90');rect(g,x-2,y+2,w+4,6,'#5f6c6c');rect(g,x,y+8,w,7,'#263238');for(let xx=x+7;xx<x+w;xx+=30)rect(g,xx,y+7,8,8,'#65716e');}
  function roof(g,x,y,w,h,kind='slate') {
    const shape=[[x-11,y+h],[x+w*.22,y],[x+w*.76,y-6],[x+w+12,y+h]];
    poly(g,shape,'#252e36');g.save();g.beginPath();g.moveTo(...shape[0]);for(const p of shape.slice(1))g.lineTo(...p);g.closePath();g.clip();
    for(let yy=y-6;yy<y+h;yy+=9) {
      line(g,x-10,yy,x+w+12,yy,'#485860');
      for(let xx=x-10+(Math.round(yy/9)%2)*9;xx<x+w+10;xx+=22)line(g,xx,yy,xx-4,yy+8,'#1b252e');
    }g.restore();line(g,x+w*.22,y,x+w*.76,y-6,'#75898e',2);
    line(g,x-11,y+h,x+w+12,y+h,'#525f64',3);
  }
  function volume(g,v,data) {
    const x=v.x0,y=v.top,w=v.x1-v.x0,h=v.base-v.top;
    g.save();g.beginPath();g.rect(x,y,w,h);
    for(const room of data.rooms)if(room.x0>=x-2&&room.x1<=x+w+2&&room.top>=y&&room.floor<=v.base)g.rect(room.x0,room.top,room.x1-room.x0,room.floor-room.top);
    for(const p of data.groundSkyPatches||[])if(p.carriersCut?.includes(v.id))g.rect(p.x0,y,p.x1-p.x0,data.levels[p.groundLevel]-y);
    g.clip('evenodd');masonry(g,x,y,w,h,'exterior',v.id);
    const shade=g.createLinearGradient(x,0,x+w,0);shade.addColorStop(0,'rgba(11,23,31,.35)');shade.addColorStop(.12,'rgba(0,0,0,0)');shade.addColorStop(.86,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(4,12,20,.46)');g.fillStyle=shade;g.fillRect(x,y,w,h);
    for(const px of [x+5,x+w-24])pilaster(g,px,y,h,19);
    for(let px=x+160;px<x+w-55;px+=210){pilaster(g,px,y+27,h-27,14);for(let yy=y+55;yy<v.base-130;yy+=173)window(g,px-58,yy,39,80,Math.floor(hash(v.id+yy)*6));}
    for(let yy=y+92;yy<v.base-20;yy+=173)cornice(g,x,yy,w);
    const wet=g.createLinearGradient(0,v.base-110,0,v.base);wet.addColorStop(0,'rgba(0,0,0,0)');wet.addColorStop(1,'rgba(29,48,42,.5)');g.fillStyle=wet;g.fillRect(x,v.base-110,w,110);
    g.restore();cornice(g,x,y,w);
    if(w>150)roof(g,x+5,y+15,w-10,Math.min(72,w*.16));
    if(/TOWER|BELL/.test(v.id)){
      const mid=x+w*.5; arch(g,mid-32,y+110,64,115,'#25323b');window(g,mid-24,y+119,48,94,2);
      for(const xx of [x+30,x+w-43])banner(g,xx,y+140,22,78,'#3e444f');
      if(w>500){g.fillStyle='#242f39';g.beginPath();g.arc(mid,y+139,36,0,Math.PI*2);g.fill();g.strokeStyle='#81908b';g.lineWidth=3;g.stroke();for(let i=0;i<12;i++){const a=i*Math.PI/6;line(g,mid+Math.cos(a)*27,y+139+Math.sin(a)*27,mid+Math.cos(a)*31,y+139+Math.sin(a)*31,'#93917b');}line(g,mid,y+139,mid-14,y+125,'#c1b797',2);line(g,mid,y+139,mid+20,y+135,'#c1b797',2);}
    }
  }
  function room(g,r) {
    const x=r.x0,y=r.top,w=r.x1-r.x0,h=r.floor-r.top,underground=r.floor>=1780;
    rect(g,x,y,w,h,underground?'#172125':'#232b30');
    g.save();g.beginPath();g.rect(x,y,w,h);g.clip();masonry(g,x,y,w,h,'interior',r.id);g.fillStyle=underground?'rgba(7,16,19,.30)':'rgba(15,17,22,.35)';g.fillRect(x,y,w,h);
    const shadow=g.createLinearGradient(0,y,0,r.floor);shadow.addColorStop(0,'rgba(0,6,12,.6)');shadow.addColorStop(.35,'rgba(0,0,0,0)');shadow.addColorStop(1,'rgba(0,4,8,.28)');g.fillStyle=shadow;g.fillRect(x,y,w,h);
    const grand=/HALL|AUDIENCE|NAVE/.test(r.id),machine=/ENGINE|WINCH|BELL|FORGE/.test(r.id),library=/LIBRARY/.test(r.id);
    const panels=Math.max(1,Math.floor(w/(grand?235:machine?250:library?215:156))),pw=w/panels;
    for(let i=0;i<panels;i++) {
      const px=x+i*pw+12, aw=pw-24;
      if(machine||library){rect(g,px,y+19,aw,h-32,'rgba(8,19,25,.25)');line(g,px,y+23,px+aw,y+23,machine?'#455052':'#645443',3);line(g,px,y+23,px,r.floor-10,'#364346',2);}
      else {arch(g,px,y+16,aw,h-27,'rgba(8,19,25,.32)');g.strokeStyle=grand?'#4d5955':'#394747';g.lineWidth=grand?4:2;g.beginPath();archPath(g,px,y+16,aw,h-27);g.stroke();}
      if(h>=155&&aw>65&&!underground&&!machine&&!library){const ww=grand?61:48;window(g,px+aw*.5-ww/2,y+32,ww,Math.min(grand?112:90,h-66),Math.floor(hash(r.id+i)*8));}
      if(i>0)pilaster(g,x+i*pw-5,y+8,h-8,10);
    }
    if(!underground&&/HALL|LIBRARY|AUDIENCE|INFIRMARY|WATCH/.test(r.id)){
      rect(g,x,r.floor-45,w,43,'#302d2a');for(let xx=x+4;xx<x+w;xx+=23){rect(g,xx,r.floor-42,19,37,'#40392f');line(g,xx+3,r.floor-39,xx+3,r.floor-9,'#645346');rect(g,xx+3,r.floor-35,13,24,'#332f2b');}line(g,x,r.floor-45,x+w,r.floor-45,'#736351',3);
    }
    rect(g,x,y,w,9,'#141f25');rect(g,x,y+9,w,5,'#5b615a');
    if(h>230){for(const px of [x+15,x+w-30]){line(g,px,r.floor-8,px+8,y+34,'#5b6260',9);line(g,px+8,y+34,x+w/2,y+18,'#69736b',5);}}
    if(underground){for(let xx=x+20;xx<x+w;xx+=73){const hh=19+hash(r.id+xx)*24;poly(g,[[xx,r.floor-hh],[xx+22,r.floor-hh*.7],[xx+31,r.floor],[xx-8,r.floor]],'rgba(40,60,48,.28)');}line(g,x,r.floor-5,x+w,r.floor-5,'#3b514b');}
    g.restore();
  }
  function surface(g,s,data) {
    const w=s.x1-s.x0,y=s.y,x=s.x0,bridge=s.sourceKind==='bridge';
    // Local stair exit platforms are part of the final structural source.
    // Draw their actual top/span as wood and leave the shaft underneath open.
    if(s.oneway&&s.mat==='wood'){
      const plankH=s.h||18;
      rect(g,x,y,w,plankH,'#554739');rect(g,x,y,w,2,'#ad9674');rect(g,x,y+2,w,3,'#7c6750');
      for(let xx=x+12;xx<x+w;xx+=22)line(g,xx,y+4,xx,y+plankH-1,'#352f2a');
      line(g,x,y+plankH,x+w,y+plankH,'#18262d',2);
      for(const xx of [x+5,x+w-8]){rect(g,xx,y+plankH-3,3,15,'#453b32');line(g,xx,y+plankH+11,xx+7,y+plankH+2,'#6b5942',2);}
      return;
    }
    rect(g,x,y,w,14,'#343a3d');rect(g,x,y,w,3,'#9caa9f');rect(g,x,y+3,w,3,'#697674');rect(g,x,y+13,w,3,'#151f26');
    for(let xx=x;xx<x+w;xx+=38){line(g,xx,y+3,xx+2,y+13,'#202b32');if(s.sky)rect(g,xx+5,y+7,17,2,'#4d5b56');}
    if(bridge){
      rect(g,x,y+16,w,13,'#515b5b');for(let xx=x+8;xx<x+w;xx+=69){poly(g,[[xx,y+27],[xx+20,y+44],[xx+45,y+27]],'#303e44');line(g,xx,y+27,xx+20,y+42,'#73807a');}
      // Background parapet: low contrast and behind the playable deck.
      line(g,x,y-28,x+w,y-28,'#52635e',3);
      for(let xx=x+9;xx<x+w;xx+=41){rect(g,xx,y-26,4,24,'#4a5756');rect(g,xx-3,y-33,10,7,'#6c7871');}
    }else if(w>100){for(let xx=x+20;xx<x+w-15;xx+=130){rect(g,xx,y+16,14,11,'#414d4d');poly(g,[[xx,y+27],[xx+14,y+27],[xx+14,y+41]],'#29363c');line(g,xx+14,y+20,xx+14,y+34,'#566762');}}
  }
  function tread(g,s,ramp) {
    const wood=ramp.type==='humanStair',y=s.y,x=s.x,w=s.w;
    rect(g,x,y,w,wood?8:12,wood?'#554739':'#465153');rect(g,x,y,w,2,wood?'#ad9674':'#a4b1a7');
    rect(g,x,y+2,w,3,wood?'#7c6750':'#667471');rect(g,x,y+(wood?8:12),w,2,'#18262d');
    for(let xx=x+11;xx<x+w;xx+=38)line(g,xx,y+4,xx,y+(wood?7:11),wood?'#352f2a':'#2a3b40');
  }
  function stairs(g,r,treads) {
    const upperX=r.upperAt==='left'?r.x0:r.x1,lowerX=r.upperAt==='left'?r.x1:r.x0;
    line(g,lowerX,r.lowerY+13,upperX,r.upperY+13,'#293a41',7);line(g,lowerX,r.lowerY+11,upperX,r.upperY+11,'#495951',1);
    for(const t of treads)tread(g,t,r);
    // Rail belongs to the back face, so it cannot conceal the character.
    g.save();g.globalAlpha=.4;line(g,lowerX,r.lowerY-27,upperX,r.upperY-27,'#4b5c57',2);
    for(let i=0;i<=3;i++){const a=i/3,xx=lowerX+(upperX-lowerX)*a,yy=r.lowerY+(r.upperY-r.lowerY)*a;line(g,xx,yy-26,xx,yy-3,'#475956',1);rect(g,xx-1,yy-29,3,3,'#68766c');}g.restore();
  }
  function door(g,d) {
    const bottom=d.openingBottom??d.y,y=d.openingTop??(d.y-(d.clearHeight||104));
    const h=bottom-y,w=d.clearWidth||49,x=d.x-w/2;
    archFrame(g,x-6,y-7,w+12,h+7,10);
    // Recessed open doorway. Narrow leaves stay to the sides of the opening.
    arch(g,x+5,y+8,w-10,h-8,'#101d24');
    for(const side of [0,1]){const xx=side?x+w-10:x+3;rect(g,xx,y+36,7,h-37,'#594735');line(g,xx+2,y+38,xx+2,bottom-5,'#8b7355');for(const yy of [y+48,bottom-20]){rect(g,xx-1,yy,9,3,'#41494a');rect(g,xx,yy,2,2,'#a1a28c');}}
    line(g,d.x-13,bottom+1,d.x+13,bottom+1,'#9ca89b',2);
  }
  function courtyard(g,space,data) {
    const y=data.levels[space.floor],x=space.x0,w=space.x1-x;
    if(!space.sky)return;
    for(let xx=x+15;xx<x+w;xx+=53){rect(g,xx,y+5,37,3,'#4d5b59');line(g,xx,y+10,xx+31,y+10,'#253840');}
    for(let xx=x+21;xx<x+w-25;xx+=111){line(g,xx,y-1,xx-3,y-14,'#596950');line(g,xx-2,y-7,xx+5,y-11,'#6b7759');}
    // Low backdrop ruins remain visually below the travel edge.
    for(const xx of [x+20,x+w-65]){rect(g,xx,y-16,34,16,'#3b4e4f');rect(g,xx+3,y-18,26,4,'#6a7770');}
  }
  globalThis.CastleArtArchitecture={hash,rect,line,poly,archPath,arch,archFrame,window,pilaster,banner,cornice,roof,masonry,volume,room,surface,stairs,door,courtyard,cache};
})();
