import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { PlayView } from '../shared/play.js';
import { TownScene, type TownBridge } from './game/TownScene.js';
import { LANDMARKS } from './game/terrain.js';

interface Props {
  view: PlayView | null;
  blocked: boolean;
  onMove: (locationId: string) => Promise<boolean>;
  onInteract: (id: string) => void;
  onNear: (name: string) => void;
}
export default function PixelTown(props:Props){
  const host=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),labels=useRef<HTMLDivElement>(null),latest=useRef(props);
  latest.current=props;
  const keys=useRef(new Set<string>()),scene=useRef<TownScene|null>(null);
  const [renderer,setRenderer]=useState('loading'),[error,setError]=useState('');
  const near=useRef('');
  useEffect(()=>{
    const node=host.current,parent=surface.current;if(!node||!parent)return;
    let disposed=false;
    const layer=labels.current!;
    const landmarks=LANDMARKS.map(place=>{
      const element=document.createElement('div');element.className='town-landmark';element.dataset.landmarkId=place.id;
      const title=document.createElement('strong'),subtitle=document.createElement('span');title.textContent=place.name;subtitle.textContent=place.detail;
      element.append(title,subtitle);layer.append(element);return {place,element};
    });
    const nameplates=new Map<string,{element:HTMLDivElement;button:HTMLButtonElement;name:HTMLSpanElement;key:HTMLElement;activity:HTMLElement;bubble:HTMLElement}>();
    const objectLabels=new Map<string,HTMLDivElement>();
    const bridge:TownBridge={
      read:()=>({view:latest.current.view,blocked:latest.current.blocked,keys:keys.current}),
      move:location=>latest.current.onMove(location),interact:id=>latest.current.onInteract(id),
      frame:value=>{
        if(disposed)return;
        // Mutate the existing DOM in Phaser's render frame. React does not schedule
        // camera updates: labels and terrain reach the same browser paint together.
        layer.style.visibility=latest.current.view?.started?'visible':'hidden';
        layer.style.transform=`translate3d(${-Math.round(value.x*value.zoom)}px,${-Math.round(value.y*value.zoom)}px,0)`;
        layer.dataset.cameraX=String(value.x);layer.dataset.cameraY=String(value.y);layer.dataset.zoom=String(value.zoom);layer.dataset.steps=String(value.steps);
        for(const {place,element}of landmarks){element.style.left=`${place.x*value.zoom}px`;element.style.top=`${place.y*value.zoom}px`;}
        const active=new Set(value.actors.map(actor=>actor.id));
        for(const [id,plate]of nameplates)if(!active.has(id)){plate.element.remove();nameplates.delete(id);}
        for(const actor of value.actors){
          let plate=nameplates.get(actor.id);
          if(!plate){
            const element=document.createElement('div'),button=document.createElement('button'),name=document.createElement('span'),key=document.createElement('kbd'),activity=document.createElement('small'),bubble=document.createElement('div');
            key.textContent='E';activity.className='town-activity';bubble.className='town-speech-bubble';button.append(name,key);element.append(bubble,button,activity);element.dataset.actorId=actor.id;
            button.addEventListener('click',()=>{if(!latest.current.blocked)latest.current.onInteract(actor.id);});
            layer.append(element);plate={element,button,name,key,activity,bubble};nameplates.set(actor.id,plate);
          }
          const close=actor.id===value.nearest;
          plate.element.className=`town-nameplate ${close?'near':''} ${actor.id==='player'?'player':''}`;
          plate.element.style.left=`${Math.round(actor.x)*value.zoom}px`;plate.element.style.top=`${(Math.round(actor.y)-35)*value.zoom}px`;
          plate.element.dataset.worldX=actor.x.toFixed(2);plate.element.dataset.worldY=actor.y.toFixed(2);plate.element.dataset.moving=String(actor.moving);plate.element.dataset.pose=String(actor.pose);plate.element.dataset.activity=actor.activity;
          plate.name.textContent=actor.id==='player'?'你':actor.name;plate.button.disabled=!close||latest.current.blocked;plate.key.hidden=!close;
          plate.activity.textContent=actor.activity;plate.activity.hidden=!actor.activity;
          plate.bubble.textContent=actor.bubble;plate.bubble.hidden=!actor.bubble||latest.current.blocked;plate.bubble.dataset.kind=actor.bubbleKind;
        }
        const name=value.actors.find(actor=>actor.id===value.nearest)?.name??'';
        if(name!==near.current){near.current=name;latest.current.onNear(name);}
        const player=value.actors.find(actor=>actor.id==='player');
        for(const object of latest.current.view?.objects??[]){
          let label=objectLabels.get(object.id);
          if(!label){label=document.createElement('div');label.className='town-object-label';label.dataset.objectId=object.id;layer.append(label);objectLabels.set(object.id,label);}
          const close=player&&Math.hypot(player.x-object.approach.x,player.y-object.approach.y)<65;
          label.hidden=!close;label.style.left=`${object.position.x*value.zoom}px`;label.style.top=`${(object.position.y+18)*value.zoom}px`;
          const status=object.state.cleanliness!==undefined?(object.state.cleanliness>=100?'干净':`清洁度 ${object.state.cleanliness}`):object.reservedBy?'有人正在使用':'';
          label.textContent=`${object.name}${status?' · '+status:''}`;label.dataset.reservedBy=object.reservedBy??'';
        }
        const canvas=node.querySelector('canvas');
        if(canvas&&player){canvas.dataset.playerX=player.x.toFixed(2);canvas.dataset.playerY=player.y.toFixed(2);canvas.dataset.nearest=value.nearest;canvas.dataset.created=String(value.created);canvas.dataset.renderer=value.renderer;}
      },
      ready:value=>{if(!disposed)setRenderer(value);},error:message=>{if(!disposed)setError(message);},
    };
    const townScene=new TownScene(bridge);scene.current=townScene;
    const game=new Phaser.Game({
      type:Phaser.AUTO,parent:node,width:parent.clientWidth,height:parent.clientHeight,
      backgroundColor:'#203c33',pixelArt:true,roundPixels:true,antialias:false,antialiasGL:false,banner:false,
      input:{keyboard:false},audio:{noAudio:true},scale:{mode:Phaser.Scale.RESIZE},scene:[townScene],
      render:{preserveDrawingBuffer:true},
    });
    const observer=new ResizeObserver(()=>game.scale.resize(parent.clientWidth,parent.clientHeight));observer.observe(parent);
    const down=(event:KeyboardEvent)=>{
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName??''))return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyE'].includes(event.code))event.preventDefault();
      keys.current.add(event.code);if(event.code==='KeyE'&&!event.repeat)townScene.interact();
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.code),blur=()=>keys.current.clear();
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{disposed=true;observer.disconnect();keys.current.clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);game.destroy(true);scene.current=null;layer.replaceChildren();};
  },[]);
  return <div className="pixel-town phaser-town" ref={surface} data-renderer={renderer}>
    <div className="phaser-host" ref={host} role="img" aria-label="Phaser 像素小镇：WASD 移动，靠近角色按 E 交谈。" onPointerDown={()=>{(document.activeElement as HTMLElement|null)?.blur();}}/>
    <div className="town-label-viewport"><div ref={labels} className="town-label-layer" aria-label="地图上的地点和人物"/></div>
    {renderer==='loading'&&<div className="pixel-loading">{error||'正在铺开小镇的地图…'}</div>}
    {error&&renderer!=='loading'&&<div className="px-toast" role="alert">{error}</div>}
    {renderer==='canvas'&&<span className="town-renderer-note">兼容画面</span>}
    <div className="pixel-touch">{[['KeyW','↑'],['KeyA','←'],['KeyS','↓'],['KeyD','→']].map(([code,label])=><button key={code} className={code} aria-label={`移动${label}`} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);(document.activeElement as HTMLElement|null)?.blur();keys.current.add(code!);}} onPointerUp={()=>keys.current.delete(code!)} onPointerCancel={()=>keys.current.delete(code!)} onLostPointerCapture={()=>keys.current.delete(code!)}>{label}</button>)}</div>
  </div>;
}
