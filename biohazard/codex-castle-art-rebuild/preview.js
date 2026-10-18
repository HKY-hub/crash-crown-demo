'use strict';
(() => {
  const views=[
    ['sample1','主堡大厅',1500,1180,1750,1470],['sample2','主堡出口 · 露天中庭',2460,1180,2800,1620],['sample3','中央塔楼 · 觐见厅',3420,1180,3720,1470],
    ['gate','门楼 · 绞盘与兵舍',280,1090,520,1330],['bridge','峡谷 · 双桥与桥头',4320,1150,4750,1470],
    ['library','图书库 · 文书室',5160,1120,5460,1330],['chapel','礼拜堂 · 中殿与钟楼',5830,1100,6200,1620],
    ['wing','旧翼 · 医务室',6610,1190,6840,1620],['watch','东城墙 · 守望室',7440,1180,7840,1470],
    ['prison','塔基地牢',3450,1530,3770,1780],['crypt','主堡墓室',1790,1530,2180,1780],
    ['cave','桥下天然洞窟',4310,1530,4700,1780],['water','旧翼蓄水道',6680,1700,7190,1950],['sky','塔顶与远景',3420,600,4000,860]
  ];
  const canvas=document.getElementById('art'),g=canvas.getContext('2d'),old=document.getElementById('before'),og=old.getContext('2d');
  const pick=document.getElementById('view');for(const v of views){const option=document.createElement('option');option.value=v[0];option.textContent=v[1];pick.append(option);}
  let data=null,renderer=null,time=0,pan=0,playing=false,current=views[0],scale=1;
  const desired=new URLSearchParams(location.search).get('view');if(views.some(v=>v[0]===desired))pick.value=desired;
  const oldRenderer=CastleStage5Art.createRenderer(old);
  function select(){current=views.find(v=>v[0]===pick.value)||views[0];pan=0;draw(true);}
  function draw(oldToo=false) {
    if(!data)return;
    const showAll=document.getElementById('overview').checked;scale=showAll ? 960/data.world.w : 1;
    const wantedHeight=showAll?250:540;
    if(canvas.height!==wantedHeight){canvas.height=old.height=wantedHeight;canvas.style.height=old.style.height=wantedHeight+'px';}
    const x=showAll?0:current[2]+pan,y=showAll?480:current[3];
    const info=renderer.render(g,{x,y},{scale,width:960,height:wantedHeight,time,effects:document.getElementById('effects').checked,collision:document.getElementById('collision').checked,actor:showAll?null:{x:current[4]+pan,y:current[5]}});
    document.getElementById('status').textContent=`${showAll?'全图缩略':current[1]} · X ${Math.round(x)} / Y ${y} · ${showAll?'全宽缩略':'1:1 / 人类62px'} · 静态缓存 ${info.chunks} 块`;
    if(oldToo)oldRenderer.render({region:'all',scale,camX:x,camY:y,time:0,far:true,mid:true,details:true,actors:false,collision:false,labels:false});
  }
  pick.addEventListener('change',select);for(const id of ['effects','collision','overview'])document.getElementById(id).addEventListener('change',()=>draw(true));
  document.getElementById('tour').addEventListener('click',()=>{playing=!playing;document.getElementById('tour').textContent=playing?'停止连续预览':'连续预览';});
  document.getElementById('left').addEventListener('click',()=>{pan-=320;draw(true);});document.getElementById('right').addEventListener('click',()=>{pan+=320;draw(true);});
  let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,pan};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag){pan=drag.pan-(e.clientX-drag.x)/scale;draw();}});canvas.addEventListener('pointerup',()=>drag=null);
  fetch('../codex-castle-layout/stage2-geometry.json').then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(value=>{
    data=value;renderer=CastleArtRebuild.engine(data);oldRenderer.setData(data);select();
    const detail=document.getElementById('catalog').getContext('2d');detail.imageSmoothingEnabled=false;detail.scale(2,2);CastleArtProps.drawCatalog(detail,3,8,{columns:3,limit:9});
  }).catch(e=>{document.getElementById('status').textContent=`加载失败：${e.message}`;});
  let last=performance.now();function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(data){time+=dt;if(playing){pan+=dt*55;if(current[2]+pan>=data.world.w-960){pan=Math.max(0,data.world.w-960-current[2]);playing=false;document.getElementById('tour').textContent='连续预览';}}if(!document.getElementById('overview').checked)draw();}requestAnimationFrame(loop);}requestAnimationFrame(loop);
})();
