/* Authored exterior details for the accepted fixed castle. World coordinates.
 * The module never mutates map data and never creates walkable geometry.
 */
(function(global){
  'use strict';
  const TAU=Math.PI*2;
  const hash=n=>{let h=2166136261;for(const c of String(n))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
  const lerp=(a,b,t)=>a+(b-a)*t;
  const palette={stone:'#556164',stoneLight:'#818c86',stoneDark:'#313c43',mortar:'#202c32',iron:'#39474e',ironEdge:'#7b8586',rust:'#75533e',moss:'#4c5c4d'};
  function rect(g,x,y,w,h,color){g.fillStyle=color;g.fillRect(x,y,w,h);}
  function poly(g,points,color){g.beginPath();g.moveTo(...points[0]);points.slice(1).forEach(p=>g.lineTo(...p));g.closePath();g.fillStyle=color;g.fill();}
  function line(g,points,color,width){g.beginPath();g.moveTo(...points[0]);points.slice(1).forEach(p=>g.lineTo(...p));g.strokeStyle=color;g.lineWidth=width||1;g.stroke();}
  function circle(g,x,y,r,fill,stroke,width){g.beginPath();g.arc(x,y,r,0,TAU);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width||1;g.stroke();}}
  function bounds(view){const s=view.scale||1,x=view.x0==null?view.camX||0:view.x0,y=view.y0==null?view.camY||0:view.y0;return{x0:x,y0:y,x1:view.x1==null?x+(view.width||960)/s:view.x1,y1:view.y1==null?y+(view.height||540)/s:view.y1,scale:s};}
  const visible=(v,x0,y0,x1,y1)=>x1>=v.x0&&x0<=v.x1&&y1>=v.y0&&y0<=v.y1;

  // Union subtraction of room and daylight rectangles. Overlapping room holes
  // cannot re-fill each other as they would with a simple even-odd compound path.
  function facadeClip(g,volume,data){
    const blocked=(data.rooms||[]).filter(r=>r.x1>volume.x0&&r.x0<volume.x1&&r.floor>volume.top&&r.top<volume.base)
      .map(r=>({x0:Math.max(volume.x0,r.x0),x1:Math.min(volume.x1,r.x1),top:Math.max(volume.top,r.top),bottom:Math.min(volume.base,r.floor)}));
    (data.groundSkyPatches||[]).forEach(p=>{
      if(!(p.carriersCut||[]).includes(volume.id))return;
      blocked.push({x0:Math.max(volume.x0,p.x0),x1:Math.min(volume.x1,p.x1),top:volume.top,bottom:Math.min(volume.base,(data.levels||{})[p.groundLevel]||1620)});
    });
    const ys=Array.from(new Set([volume.top,volume.base,...blocked.flatMap(b=>[b.top,b.bottom])])).sort((a,b)=>a-b);
    g.beginPath();
    for(let i=0;i<ys.length-1;i++){
      const y0=ys[i],y1=ys[i+1],mid=(y0+y1)*.5;
      const intervals=blocked.filter(b=>mid>=b.top&&mid<b.bottom).sort((a,b)=>a.x0-b.x0);
      let cursor=volume.x0;
      intervals.forEach(b=>{if(b.x0>cursor)g.rect(cursor,y0,b.x0-cursor,y1-y0);cursor=Math.max(cursor,b.x1);});
      if(cursor<volume.x1)g.rect(cursor,y0,volume.x1-cursor,y1-y0);
    }
    g.clip();
  }

  function arrowSlit(g,x,y,h){
    poly(g,[[x-7,y+2],[x+4,y],[x+8,y+5],[x+7,y+h+3],[x-5,y+h+6],[x-8,y+h-1]],'#626d6a');
    rect(g,x-3,y+7,4,h-9,'#18272f');
    rect(g,x-7,y+h*.51,12,4,'#18272f');
    line(g,[[x+3,y+7],[x+3,y+h-3]],'#8c9690',.8);
    line(g,[[x-7,y+h+3],[x+6,y+h+1]],'#29373e',1.6);
  }

  function bracket(g,x,y,w,h){
    poly(g,[[x,y],[x+w,y],[x+w,y+h*.22],[x+w*.8,y+h*.45],[x+w*.55,y+h*.52],[x+w*.34,y+h],[x+w*.13,y+h],[x,y+h*.54]],'#556260');
    poly(g,[[x+w*.61,y+3],[x+w,y+3],[x+w,y+h*.22],[x+w*.8,y+h*.45],[x+w*.55,y+h*.52]],'#343f45');
    line(g,[[x+1,y+1],[x+w-1,y+1]],'#85918a',1.2);
    line(g,[[x+w*.14,y+8],[x+w*.16,y+h*.49],[x+w*.28,y+h*.65]],'#74817a',1);
  }

  function chain(g,a,b,bow){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const n=Math.max(2,Math.ceil(length/7));
    for(let i=0;i<=n;i++){
      const t=i/n,x=lerp(a[0],b[0],t)+Math.sin(t*Math.PI)*bow,y=lerp(a[1],b[1],t)+Math.sin(t*Math.PI)*3;
      g.beginPath();g.ellipse(x,y,i%2?1.55:2.25,3.35,-.07,0,TAU);g.strokeStyle='#172731';g.lineWidth=2.1;g.stroke();
      g.beginPath();g.ellipse(x-.35,y-.3,i%2?1.05:1.65,2.8,-.07,0,TAU);g.strokeStyle=i%5===0?'#797967':'#65716e';g.lineWidth=.8;g.stroke();
    }
  }

  function gateDetails(g,v,data,view){
    g.save();facadeClip(g,v,data);
    [[435,1095,46],[626,1091,43],[839,1117,51],[1280,1103,48]].forEach(s=>{if(visible(view,s[0]-10,s[1],s[0]+10,s[1]+s[2]+7))arrowSlit(g,...s);});
    [[v.x0+12,1085,26,245],[796,1083,31,234],[v.x1-43,1050,27,254]].forEach(b=>{
      if(!visible(view,b[0],b[1],b[0]+b[2],b[1]+b[3]))return;
      poly(g,[[b[0],b[1]+b[3]],[b[0]+3,b[1]+30],[b[0]+b[2]*.53,b[1]],[b[0]+b[2]-3,b[1]+30],[b[0]+b[2],b[1]+b[3]]],'#445356');
      rect(g,b[0]+4,b[1]+34,b[2]*.4,b[3]-34,'#65706d');
      bracket(g,b[0]-3,b[1]+74,b[2]+6,25);
      line(g,[[b[0]+4,b[1]+b[3]-31],[b[0]+b[2]-3,b[1]+b[3]-31]],'#38464d',2);
    });
    g.restore();
    // Visible bearing at the winch-room outside jamb, chain to the gate header.
    // It stays above the real 118px passage and has no opaque gate across it.
    if(visible(view,339,1264,383,1504)){
      rect(g,363,1266,14,28,'#303f46');
      for(const yy of [1271,1289]){circle(g,369,yy,1.8,'#829087');}
      circle(g,369,1280,10,'#26363f','#798783',1.5);
      circle(g,369,1280,6,null,'#485950',1.8);
      line(g,[[369,1280],[382,1280]],'#6e7b77',3);
      chain(g,[368,1290],[351,1487],-4);
      rect(g,343,1484,18,7,'#4c5859');
      circle(g,351,1487,3.5,'#29383f','#85918a',1);
      bracket(g,343,1474,25,19);
      line(g,[[365,1476],[366,1452]],'#45544f',2);
    }
  }

  function crest(g,cx,y){
    poly(g,[[cx-28,y+3],[cx,y-8],[cx+28,y+3],[cx+27,y+59],[cx+14,y+67],[cx-13,y+67],[cx-28,y+59]],'#3c464b');
    poly(g,[[cx-24,y+5],[cx,y-4],[cx+24,y+5],[cx+22,y+56],[cx+12,y+61],[cx-12,y+61],[cx-24,y+55]],'#717971');
    poly(g,[[cx-17,y+12],[cx+17,y+12],[cx+15,y+39],[cx,y+52],[cx-15,y+39]],'#3e4d52');
    line(g,[[cx-15,y+14],[cx+15,y+14],[cx+13,y+38],[cx,y+49],[cx-13,y+38],[cx-15,y+14]],'#a3a28b',1);
    // An eroded griffin profile, not another colored flag or repeated glyph.
    poly(g,[[cx-7,y+35],[cx-4,y+28],[cx-7,y+20],[cx-1,y+25],[cx+2,y+19],[cx+8,y+17],[cx+5,y+23],
      [cx+11,y+25],[cx+4,y+26],[cx+3,y+34],[cx+10,y+36],[cx+6,y+39],[cx+1,y+36],[cx-2,y+42],[cx-4,y+36]],'#999783');
    line(g,[[cx-3,y+32],[cx-12,y+23],[cx-9,y+33]],'#92937f',1.4);
    line(g,[[cx-21,y+55],[cx-5,y+57]],'#4e5958',1);
    line(g,[[cx+9,y+5],[cx+3,y+13],[cx+7,y+16]],'#39464b',1);
    bracket(g,cx-29,y+64,58,13);
  }

  function keepDetails(g,v,data,view){
    g.save();facadeClip(g,v,data);
    if(visible(view,1512,1350,1600,1450))crest(g,1557,1362);
    // Masonry flue on the outer armory wall, attached continuously to the wall.
    const x=v.x1-62,y=v.top+102,h=552;
    if(visible(view,x-5,y-10,x+40,y+h)){
      rect(g,x,y,28,h,'#3b474c');rect(g,x+4,y,15,h,'#69716a');rect(g,x+19,y,7,h,'#29383f');
      poly(g,[[x-5,y+2],[x+35,y+2],[x+30,y-7],[x-1,y-7]],'#7d8477');
      rect(g,x+5,y+5,21,9,'#1f2e36');
      for(let yy=y+31;yy<y+h;yy+=37){line(g,[[x+3,yy],[x+21,yy]],'#4a5351',1.5);}
      [[y+140,14],[y+350,15]].forEach(b=>bracket(g,x-4,b[0],37,b[1]));
      line(g,[[x+1,y+67],[x-2,y+141],[x+1,y+220]],'rgba(30,38,39,.3)',2.3);
    }
    g.restore();
  }

  function towerSupport(g,v,data,view){
    g.save();facadeClip(g,v,data);
    const floor=(data.levels||{}).RW||1030;
    for(const x of [v.x0+58,v.x0+337,v.x1-87]){
      if(!visible(view,x-17,floor+12,x+43,floor+100))continue;
      bracket(g,x-7,floor+15,49,40);
      poly(g,[[x+5,floor+54],[x+19,floor+39],[x+23,floor+39],[x+23,floor+96],[x+10,floor+96]],'#475653');
      rect(g,x+7,floor+69,16,4,'#747f77');
      line(g,[[x+23,floor+42],[x+23,floor+96]],'#28383f',2);
    }
    // Paired diagonal shoulders remain attached to the tower corner pillars.
    [[v.x0+9,1],[v.x1-9,-1]].forEach(([x,side])=>{
      const y=floor+13;
      poly(g,[[x,y],[x+side*20,y+4],[x+side*53,y+120],[x+side*39,y+141],[x+side*12,y+61]],'#4f5e5d');
      line(g,[[x+side*4,y+8],[x+side*40,y+118]],'#89928a',1.3);
      bracket(g,x+(side>0?31:-59),y+133,28,19);
    });
    g.restore();
  }

  function bridgeArch(g,bridge,data,view){
    const deck=(data.levels||{})[bridge.deck];
    if(!Number.isFinite(deck))return;
    const cave=(data.rooms||[]).find(r=>r.id===bridge.underside);
    const lower=cave?cave.top-8:deck+142;
    if(!visible(view,bridge.x0,deck+10,bridge.x1,lower))return;
    const west=(data.volumes||[]).find(v=>v.id===bridge.westAbutment);
    const east=(data.volumes||[]).find(v=>v.id===bridge.eastAbutment);
    const left=west?west.x1:bridge.x0+90,right=east?east.x0:bridge.x1-90;
    const cx=(left+right)*.5,rx=(right-left)*.5,rise=lower-(deck+13),thickness=19;
    g.save();
    g.beginPath();g.rect(bridge.x0,deck+9,bridge.x1-bridge.x0,lower-deck-9);g.clip();
    // This arch's feet end above the existing cave ceiling. Cave passage at
    // 1620..1780 remains entirely untouched; root paints it after this layer.
    const pieces=19;
    for(let i=0;i<pieces;i++){
      const a=i*Math.PI/pieces,b=(i+1)*Math.PI/pieces;
      const outer=t=>[cx+Math.cos(t)*rx,lower-Math.sin(t)*rise];
      const inner=t=>[cx+Math.cos(t)*(rx-thickness*.63),lower-Math.sin(t)*(rise-thickness)];
      const aa=outer(a),bb=outer(b),ii=inner(b),jj=inner(a);
      poly(g,[aa,bb,ii,jj],i%4===0?'#68726d':i%3===0?'#465559':'#556360');
      line(g,[aa,bb],'#78847b',.8);
      line(g,[bb,ii],'#2b3b43',1.2);
      line(g,[ii,jj],'#25353e',1.7);
      if(i===9)poly(g,[[cx-12,deck+11],[cx+12,deck+11],[cx+8,deck+46],[cx-6,deck+48]],'#747d71');
    }
    for(const [x,side] of [[left,-1],[right,1]]){
      const x0=side<0?Math.max(bridge.x0,x-77):x,x1=side<0?x:Math.min(bridge.x1,x+77);
      poly(g,[[x0,deck+14],[x1,deck+14],[x1,lower],[x0,lower]],'#46555a');
      for(let yy=deck+34;yy<lower;yy+=30){line(g,[[x0+4,yy],[x1-4,yy]],'#273a43',1.2);line(g,[[x0+6,yy+2],[x1-6,yy+2]],'#5f6e6a',.8);}
      const px=side<0?x0+8:x1-18;
      rect(g,px,deck+18,11,lower-deck-18,'#5b6965');
    }
    g.restore();
  }

  function roseWindow(g,cx,cy,r){
    circle(g,cx,cy,r+6,'#303e46');
    const colors=['#7b8379','#64726c','#8c9080','#65736f','#7e857a'];
    for(let i=0;i<16;i++){
      const a=i*TAU/16+.012,b=(i+1)*TAU/16-.012;
      const pt=(angle,rr)=>[cx+Math.cos(angle)*rr,cy+Math.sin(angle)*rr];
      poly(g,[pt(a,r+5),pt(b,r+5),pt(b,r-1),pt(a,r-1)],colors[i%colors.length]);
    }
    circle(g,cx,cy,r-2,'#1c2b34','#91988a',1.1);
    const glass=['#62515b','#536b68','#726454','#4f6477','#63545f','#557078','#685f54','#5c646f'];
    for(let i=0;i<8;i++){
      g.save();g.translate(cx,cy);g.rotate(i*TAU/8);
      g.beginPath();g.moveTo(7,0);
      g.bezierCurveTo(10,-6,17,-8,r-6,0);
      g.bezierCurveTo(17,8,10,6,7,0);g.closePath();
      g.fillStyle=glass[i];g.fill();g.strokeStyle='#26373f';g.lineWidth=1.7;g.stroke();
      line(g,[[12,0],[r-7,0]],'#a0a18b',.55);
      g.restore();
    }
    for(let i=0;i<8;i++){
      const a=(i+.5)*TAU/8;
      line(g,[[cx+Math.cos(a)*7,cy+Math.sin(a)*7],[cx+Math.cos(a)*(r-3),cy+Math.sin(a)*(r-3)]],'#7e887d',1.7);
      circle(g,cx+Math.cos(a)*(r-9),cy+Math.sin(a)*(r-9),2.6,'#344952','#899184',.7);
    }
    circle(g,cx,cy,7,'#888777','#243741',1.1);
    circle(g,cx,cy,4,'#645962','#a19b80',.6);
    // Carved side foliage belongs to this sole major facade feature.
    for(const side of [-1,1]){
      line(g,[[cx+side*(r+7),cy+9],[cx+side*(r+15),cy+18],[cx+side*(r+10),cy+27]],'#747f73',2.1);
      poly(g,[[cx+side*(r+15),cy+18],[cx+side*(r+21),cy+14],[cx+side*(r+18),cy+22]],'#68796f');
    }
  }

  function chapelDetails(g,v,data,view){
    g.save();facadeClip(g,v,data);
    const nave=(data.rooms||[]).find(r=>r.id==='EL_NAVE');
    const cy=Math.min(nave?nave.top-37:v.top+113,v.top+113),cx=v.x0+(v.x1-v.x0)*.65;
    if(visible(view,cx-57,cy-40,cx+57,cy+40))roseWindow(g,cx,cy,30);
    // Buttresses remain on the existing shell edges, never span a new path.
    for(const [x,side] of [[v.x0+4,1],[v.x1-4,-1]]){
      poly(g,[[x,v.top+79],[x+side*17,v.top+89],[x+side*37,v.base-24],[x+side*21,v.base],[x,v.base]],'#445453');
      for(const yy of [v.top+164,v.top+326,v.top+490])bracket(g,x+(side<0?-28:0),yy,28,19);
      line(g,[[x+side*5,v.top+91],[x+side*22,v.base-21]],'#758079',1.2);
    }
    g.restore();
  }

  function bellDetails(g,v,data,view){
    const x=(v.x0+v.x1)*.5,y=v.top+91;
    if(!visible(view,x-48,y-8,x+48,y+91))return;
    g.save();facadeClip(g,v,data);
    const A=global.CastleArtArchitecture;
    if(A){A.arch(g,x-34,y,68,89,'#1b2b34');A.archFrame(g,x-40,y-5,80,94,7);}
    else{poly(g,[[x-34,y+89],[x-34,y+32],[x,y],[x+34,y+32],[x+34,y+89]],'#1b2b34');}
    rect(g,x-24,y+18,48,7,'#514339');line(g,[[x-20,y+19],[x+19,y+19]],'#8c795e',1.3);
    rect(g,x-3,y+22,6,15,'#494e49');
    poly(g,[[x-11,y+35],[x-17,y+40],[x-19,y+62],[x-27,y+70],[x-26,y+74],[x+26,y+74],[x+27,y+70],[x+19,y+62],[x+17,y+40],[x+11,y+35]],'#78775e');
    poly(g,[[x+6,y+36],[x+17,y+40],[x+19,y+62],[x+27,y+70],[x+26,y+74],[x+13,y+72],[x+9,y+54]],'#464b41');
    line(g,[[x-11,y+38],[x-15,y+57],[x-20,y+68]],'#b3ab7f',1.2);
    line(g,[[x-24,y+71],[x+24,y+71]],'#b1a378',1.5);
    line(g,[[x,y+70],[x+1,y+80]],'#424b46',3);circle(g,x+1,y+80,3.8,'#81806a');
    line(g,[[x+17,y+29],[x+19,y+86]],'#5c655a',1.1);
    g.restore();
  }

  function weatherAndIvy(g,v,data,view){
    g.save();facadeClip(g,v,data);
    const width=v.x1-v.x0;
    for(let i=0;i<4;i++){
      const x=v.x0+width*(.085+.264*i),y=v.top+143+hash(v.id+i)*57;
      const h=139+hash(v.id+'h'+i)*132;
      if(!visible(view,x-8,y,x+15,y+h))continue;
      const stain=g.createLinearGradient(0,y,0,y+h);
      stain.addColorStop(0,'rgba(15,25,30,.23)');stain.addColorStop(1,'rgba(23,38,39,0)');
      g.fillStyle=stain;
      g.beginPath();g.moveTo(x-6,y);g.lineTo(x+6,y+3);g.lineTo(x+9,y+h*.47);g.lineTo(x+2,y+h);g.lineTo(x-3,y+h*.69);g.closePath();g.fill();
      line(g,[[x+3,y+18],[x+4,y+h*.51],[x+1,y+h*.77]],'rgba(22,42,42,.16)',1.2);
    }
    const ix=v.x1-16,iy=v.top+172,length=Math.min(415,v.base-iy-12);
    if(visible(view,ix-39,iy,ix+15,iy+length)){
      const stem=[];
      for(let i=0;i<=8;i++)stem.push([ix+Math.sin(i*.9+hash(v.id)*TAU)*6,iy+i*length/8]);
      line(g,stem,'#435647',1.7);
      for(let i=0;i<19;i++){
        const t=hash(v.id+'t'+i),x=ix+Math.sin(t*8+hash(v.id)*TAU)*6,y=iy+t*length;
        const side=i%2?1:-1,reach=5+hash(v.id+'r'+i)*16;
        line(g,[[x,y],[x+side*reach,y-5]],'#3e5143',.8);
        poly(g,[[x+side*reach,y-5],[x+side*(reach+5),y-11],[x+side*(reach+8),y-5],[x+side*(reach+3),y-1]],i%3===0?'#64725a':'#4b604c');
      }
    }
    // One repaired wall patch per old-wing building; no false hole or sky gap.
    if(/WING/.test(v.id)){
      const x=v.x0+36,y=v.top+369,w=Math.min(79,width*.22);
      if(visible(view,x-4,y-5,x+w+6,y+83)){
        poly(g,[[x-3,y+10],[x+13,y-4],[x+w-9,y+5],[x+w+3,y+27],[x+w-1,y+71],[x+w*.4,y+80],[x-5,y+56]],'#736d5b');
        [[4,13,w*.42,25],[w*.47,11,w*.39,19],[9,42,w*.34,26],[w*.49,39,w*.36,30]].forEach(b=>{
          rect(g,x+b[0],y+b[1],b[2],b[3],'#5e635b');line(g,[[x+b[0]+2,y+b[1]+2],[x+b[0]+b[2]-2,y+b[1]+2]],'#888772',.8);
        });
        line(g,[[x+9,y+4],[x+2,y+13],[x+5,y+29]],'#394b4a',1.3);
      }
    }
    g.restore();
  }

  function damagedRoof(g,v,view){
    const w=v.x1-v.x0-10,x=v.x0+5,y=v.top+15,h=Math.min(72,w*.16);
    if(!visible(view,x-11,y-6,x+w+12,y+h))return;
    g.save();
    const shell=[[x-11,y+h],[x+w*.22,y],[x+w*.76,y-6],[x+w+12,y+h]];
    g.beginPath();g.moveTo(...shell[0]);shell.slice(1).forEach(p=>g.lineTo(...p));g.closePath();g.clip();
    const px=x+w*.2,py=y+h*.43;
    const tear=[[px-25,py+8],[px-9,py-7],[px+15,py-1],[px+23,py+13],[px+8,py+28],[px-20,py+25]];
    poly(g,tear,'#222b30');
    g.save();g.beginPath();g.moveTo(...tear[0]);tear.slice(1).forEach(p=>g.lineTo(...p));g.closePath();g.clip();
    line(g,[[px-31,py+7],[px+22,py+25]],'#67513d',3.5);
    line(g,[[px-28,py+20],[px+19,py+35]],'#514434',3.1);
    line(g,[[px-4,py-10],[px-14,py+36]],'#796149',2.2);
    g.restore();
    line(g,[tear[0],tear[1],tear[2]],'#657069',1.2);
    poly(g,[[px+19,py+14],[px+29,py+14],[px+24,py+22],[px+16,py+19]],'#515d63');
    poly(g,[[x+w*.66,y+h*.68],[x+w*.69,y+h*.68],[x+w*.68,y+h*.82],[x+w*.645,y+h*.82]],'#2b343a');
    g.restore();
  }

  function oldBench(g,x,y,w){
    // The seat is a muted rear-plane prop, with no highlighted platform edge.
    rect(g,x+3,y-25,w-6,10,'#3e4140');
    line(g,[[x+5,y-20],[x+w-5,y-20]],'#54534a',1.2);
    rect(g,x,y-14,w,4,'#515048');
    for(const xx of [x+8,x+w-12]){rect(g,xx,y-23,3,23,'#373f3e');line(g,[[xx,y-5],[xx-2,y]],'#434b45',1.5);}
    line(g,[[x+w*.62,y-21],[x+w*.67,y-15]],'#293737',1.1);
  }

  function trough(g,x,y,w){
    poly(g,[[x,y-19],[x+w,y-17],[x+w-3,y-1],[x+3,y-1]],'#414d4c');
    poly(g,[[x+5,y-18],[x+w-5,y-17],[x+w-8,y-12],[x+8,y-13]],'#273b40');
    line(g,[[x+7,y-13],[x+w-9,y-12]],'#486161',.75);
    line(g,[[x+4,y-16],[x+5,y-4]],'#616c61',1);
    line(g,[[x+w*.71,y-16],[x+w*.69,y-8],[x+w*.77,y-3]],'#2c3e41',1.1);
  }

  function yardDetails(g,data,view){
    const selected=new Set(['O_BAILEY','O_COURT','O_CEMETERY','O_EAST_YARD']);
    (data.openSpaces||[]).filter(o=>o.sky&&selected.has(o.id)).forEach(space=>{
      const patch=(data.groundSkyPatches||[]).find(p=>p.openSpace===space.id);
      const x0=patch?patch.x0:space.x0,x1=patch?patch.x1:space.x1,y=(data.levels||{})[space.floor];
      if(!Number.isFinite(y)||!visible(view,x0,y-29,x1,y+1))return;
      g.save();g.beginPath();g.rect(x0,y-36,x1-x0,36);g.clip();
      const w=x1-x0;
      if(space.id==='O_BAILEY'||space.id==='O_COURT')trough(g,x0+14,y-1,Math.min(49,w*.37));
      oldBench(g,x0+w*.61,y-1,Math.min(43,w*.31));
      // Uneven local leaf clusters instead of a regular full-ground scatter.
      for(let i=0;i<12;i++){
        const x=x0+9+w*(.18+hash(space.id+i)*.28),yy=y-2-hash(space.id+'y'+i)*3;
        const length=2+hash(space.id+'l'+i)*3;
        poly(g,[[x,yy],[x+length*.8,yy-2],[x+length*1.3,yy],[x+length*.5,yy+1]],i%3===0?'#67574a':'#4b5447');
      }
      g.restore();
    });
  }

  function draw(ctx,data,view){
    if(!data)return;
    const v=bounds(view||{});
    ctx.save();ctx.beginPath();ctx.rect(v.x0,v.y0,v.x1-v.x0,v.y1-v.y0);ctx.clip();
    (data.volumes||[]).forEach(volume=>{
      if(!visible(v,volume.x0-25,volume.top-15,volume.x1+25,volume.base))return;
      if(volume.id==='V_GATE')gateDetails(ctx,volume,data,v);
      else if(volume.id==='V_KEEP')keepDetails(ctx,volume,data,v);
      else if(volume.id==='V_TOWER')towerSupport(ctx,volume,data,v);
      else if(volume.id==='V_CHAPEL')chapelDetails(ctx,volume,data,v);
      else if(volume.id==='V_BELL')bellDetails(ctx,volume,data,v);
      else if(/V_WING_|V_EAST_WALL/.test(volume.id)){
        weatherAndIvy(ctx,volume,data,v);
        if(/V_WING_/.test(volume.id))damagedRoof(ctx,volume,v);
      }
    });
    const stoneBridge=(data.bridges||[]).find(b=>b.id==='B_STONE');
    if(stoneBridge)bridgeArch(ctx,stoneBridge,data,v);
    yardDetails(ctx,data,v);
    ctx.restore();
  }
  global.CastleArtExterior=Object.freeze({draw});
})(window);
