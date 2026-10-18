/* This control resizes the world only on an explicit user slider event. */
(() => {
  'use strict';
  let panel,slider,output,status,queued=null,frame=0;
  function active(){return typeof game!=='undefined'&&game?.walk&&typeof level!=='undefined'&&level?.castle;}
  function clearInput(){
    Object.keys(Input.keys).forEach(k=>Input.keys[k]=false);
    Input.mouse.down=Input.mouse.rDown=false;
  }
  function refresh(){
    if(!panel)return;
    panel.hidden=!active();
    if(panel.hidden)return;
    const factor=level.castle.scaleFactor||1;
    slider.value=String(Math.round(factor*100));
    output.textContent=Math.round(factor*100)+'%';
  }
  function apply(value){
    if(!active())return;
    const factor=Math.max(.5,Math.min(2,Number(value)/100)),old=level.castle.scaleFactor||1;
    if(factor===old){refresh();return;}
    const next=CastleMapScaleModel.scaleLevel(level,factor),ratio=factor/old;
    const moves=[...new Set(game.entities)].filter(e=>!e.dead).map(e=>({e,...CastleMapScaleModel.entityPosition(e,ratio)}));
    if(moves.some(p=>p.x<0||p.x+p.e.w>next.worldW||CastleMapScaleModel.embedded({...p.e,x:p.x,y:p.y},next.solids))){
      status.textContent='当前位置空间不足，请移到开阔处再缩小。';
      refresh();return;
    }
    // Publish the same new collision array to Level's private support/export
    // state and the game's runtime reference before mapping actor foot anchors.
    level=Level.applyCastleScale(next);
    for(const p of moves){p.e.x=p.x;p.e.y=p.y;}
    const seen=new Set(moves.map(p=>p.e));
    function positions(value){
      if(!value||typeof value!=='object'||seen.has(value))return;
      seen.add(value);
      if(Array.isArray(value)){value.forEach(positions);return;}
      if(typeof value.x==='number')value.x*=ratio;
      if(typeof value.y==='number')value.y*=ratio;
      // Runtime pickups are category -> stage -> point arrays, not a flat list.
      for(const child of Object.values(value))if(Array.isArray(child))positions(child);
    }
    positions(game.pickups);positions(game.activeRespawns);positions(game.zRespawns);
    positions(bullets);positions(particles);positions(texts);positions(areas);
    const p=game.player;
    game.camera.x=Math.max(0,Math.min(Math.max(0,level.worldW-CFG.CW),p.x+p.w/2-CFG.CW/2));
    game.camera.y=Math.max(0,Math.min(Math.max(0,level.worldH-CFG.CH),p.y+p.h/2-CFG.CH/2));
    Input.update(game.camera);
    status.textContent=Math.round(level.worldW)+' × '+Math.round(level.worldH)+' · 人物 62px';
    clearInput();refresh();
  }
  function schedule(value){
    queued=value;
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;const value=queued;queued=null;
      try{apply(value);}catch(error){status.textContent=error.message;refresh();}
    });
  }
  function mount(){
    const style=document.createElement('style');
    style.textContent='#castle-map-scale{position:fixed;left:12px;bottom:12px;z-index:10015;width:276px;max-width:calc(100vw - 24px);padding:10px 12px;border:1px solid #627d8b;border-radius:7px;background:rgba(10,19,27,.94);color:#edf4f2;font:12px/1.5 "Microsoft YaHei",sans-serif;box-sizing:border-box;box-shadow:0 3px 14px #0008}#castle-map-scale[hidden]{display:none}#castle-map-scale .cms-title{display:flex;align-items:center;justify-content:space-between}#castle-map-scale output{color:#e8c389;font-weight:bold}#castle-map-scale input{width:100%;margin:9px 0 2px;accent-color:#dfbd7b;cursor:ew-resize}#castle-map-scale .cms-range{display:flex;justify-content:space-between;color:#9eafb8;font-size:10px}#castle-map-scale .cms-status{min-height:18px;color:#bdcdd2;font-size:11px;margin-top:4px}#castle-map-scale button{color:#e7eeee;background:#223340;border:1px solid #607887;border-radius:4px;font:inherit;cursor:pointer;padding:2px 7px}';
    document.head.appendChild(style);
    panel=document.createElement('section');panel.id='castle-map-scale';panel.hidden=true;panel.setAttribute('aria-label','古堡地图比例');
    panel.innerHTML='<div class="cms-title"><label for="castle-map-scale-slider">地图比例</label><output for="castle-map-scale-slider">100%</output><button type="button">恢复100%</button></div><input id="castle-map-scale-slider" type="range" min="50" max="200" step="1" value="100" aria-label="地图比例"><div class="cms-range"><span>50%</span><span>人物大小固定</span><span>200%</span></div><div class="cms-status" role="status">建筑与碰撞同步缩放 · 人物 62px</div>';
    document.body.appendChild(panel);
    slider=panel.querySelector('input');output=panel.querySelector('output');status=panel.querySelector('[role="status"]');
    slider.addEventListener('input',()=>schedule(slider.value));
    panel.querySelector('button').addEventListener('click',()=>schedule(100));
    panel.addEventListener('pointerdown',clearInput);
    ['pointerdown','pointerup','mousedown','mouseup','keydown','keyup','wheel','contextmenu'].forEach(type=>panel.addEventListener(type,e=>e.stopPropagation()));
    refresh();setInterval(refresh,300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
