import Phaser from 'phaser';
import type { PlayView } from '../../shared/play.js';
import type { DeepReadonly, SkillActivity } from '../../shared/types.js';
import { characterSheet, FRAME_H, FRAME_ROWS, FRAME_W, IDLE_FRAMES, VILLAGERS, WALK_FRAMES } from './villagers.js';
import { createTerrain, HOMES, SPAWN, WORLD_HEIGHT, WORLD_WIDTH, regionAt, type Point } from './terrain.js';
import { findPath } from './paths.js';
import { TOWN_COMPOSITE } from './lighting.js';
import { ACTIVITY_KINDS } from './animations.js';

export interface ActorFrame { id:string;name:string;x:number;y:number;moving:boolean;interactable:boolean;screenX:number;screenY:number;activity:string;pose:number;bubble:string;bubbleKind:'ambient'|'message' }
export interface TownFrame { x:number;y:number;zoom:number;width:number;height:number;nearest:string;actors:ActorFrame[];renderer:string;created:number;steps:number }
export interface TownBridge {
  read:()=>{view:PlayView|null;blocked:boolean;keys:ReadonlySet<string>};
  move:(locationId:string)=>Promise<boolean>;
  interact:(id:string)=>void;
  frame:(frame:TownFrame)=>void;
  ready:(renderer:string)=>void;
  error:(message:string)=>void;
}
interface Actor extends Point {
  id:string;name:string;distance:number;moving:boolean;route:Point[];
  sprite:Phaser.GameObjects.Sprite;shadow:Phaser.GameObjects.Image;
  goals:Point[];seenMoves:Set<string>;observed:boolean;interactable:boolean;
  locationId:string;inTransit:boolean;motion:'travel'|'skill'|null;clock:number;skillActivity:DeepReadonly<SkillActivity>|null;spokenIntent:string;
  bubbleUntil:number;bubbleCooldown:number;bubbleText:string;bubbleKind:'ambient'|'message';lastReply:string;
}
const home=(id:string,location:string)=>HOMES[location]?.[id]??SPAWN[location]??SPAWN.square!;

export class TownScene extends Phaser.Scene {
  private terrainImage!:Phaser.GameObjects.Image;
  private objectDetails!:Phaser.GameObjects.Graphics;
  private world!:Phaser.GameObjects.RenderTexture;
  private glow!:Phaser.GameObjects.RenderTexture;
  private composite?:Phaser.GameObjects.Shader;
  private fallbackWorld?:Phaser.GameObjects.Image;
  private fallbackGlow?:Phaser.GameObjects.Image;
  private player!:Actor;
  private actors=new Map<string,Actor>();
  private passable:(x:number,y:number)=>boolean=()=>false;
  private accumulator=0;
  private cameraPoint:Point={x:0,y:0};
  private cameraFloat:Point={x:0,y:0};
  private run='';
  private lastView:PlayView|null=null;
  private transitioning=false;
  private retryAfter=0;
  private nearest='';
  private created=0;
  private steps=0;
  private rendererKind='loading';
  private zoom=3;
  constructor(private bridge:TownBridge){super('PineconeTown');}
  preload(){
    this.load.image('town-atlas','/assets/kenney-tiny-town/tilemap_packed.png');
    this.load.on('loaderror',()=>this.bridge.error('本地像素地图加载失败，请刷新重试。'));
  }
  create(){
    const terrain=createTerrain(this.textures.get('town-atlas').getSourceImage() as HTMLImageElement);
    this.passable=terrain.passable;
    this.textures.addCanvas('town-ground',terrain.canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.terrainImage=new Phaser.GameObjects.Image(this,0,0,'town-ground').setOrigin(0);
    this.objectDetails=new Phaser.GameObjects.Graphics(this);
    for(const id of Object.keys(VILLAGERS)){
      const texture=this.textures.addCanvas(`person-${id}`,characterSheet(id))!;
      for(let row=0;row<FRAME_ROWS;row++)for(let column=0;column<WALK_FRAMES;column++)texture.add(String(row*WALK_FRAMES+column),0,column*FRAME_W,row*FRAME_H,FRAME_W,FRAME_H);
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    const shadow=document.createElement('canvas');shadow.width=20;shadow.height=7;
    const ctx=shadow.getContext('2d')!;ctx.fillStyle='#253d3b55';ctx.fillRect(3,1,14,5);ctx.fillRect(0,2,20,3);
    this.textures.addCanvas('person-shadow',shadow)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.world=new Phaser.GameObjects.RenderTexture(this,0,0,WORLD_WIDTH,WORLD_HEIGHT).setOrigin(0);
    this.world.saveTexture('pinecone-world');this.world.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.glow=new Phaser.GameObjects.RenderTexture(this,0,0,WORLD_WIDTH/2,WORLD_HEIGHT/2).setOrigin(0);
    const lights=document.createElement('canvas');lights.width=WORLD_WIDTH/2;lights.height=WORLD_HEIGHT/2;
    const light=lights.getContext('2d')!;
    for(const [x,y,radius] of [[256,264,95],[299,268,70],[568,333,90],[455,213,62],[382,390,105]]){
      const gradient=light.createRadialGradient(x!/2,y!/2,0,x!/2,y!/2,radius!/2);
      gradient.addColorStop(0,'rgba(255,210,133,0.95)');gradient.addColorStop(.35,'rgba(238,188,118,0.45)');gradient.addColorStop(1,'rgba(220,164,102,0)');
      light.fillStyle=gradient;light.fillRect((x!-radius!)/2,(y!-radius!)/2,radius!,radius!);
    }
    this.textures.addCanvas('town-lightmap',lights)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const glowImage=new Phaser.GameObjects.Image(this,0,0,'town-lightmap').setOrigin(0);this.glow.draw(glowImage);this.glow.render();glowImage.destroy();
    this.glow.saveTexture('pinecone-glow');this.glow.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const webgl=this.game.renderer.type===Phaser.WEBGL;
    if(webgl){
      this.composite=this.add.shader({name:'PineconeTownComposite',fragmentSource:TOWN_COMPOSITE,
        setupUniforms:(set:(name:string,value:unknown)=>void)=>{
          set('uWorld',0);set('uGlow',1);set('uWorldSize',[WORLD_WIDTH,WORLD_HEIGHT]);
          set('uCamera',[this.cameraPoint.x,this.cameraPoint.y]);set('uView',[this.scale.width,this.scale.height]);set('uZoom',this.zoom);
        }},0,0,this.scale.width,this.scale.height,['pinecone-world','pinecone-glow']).setOrigin(0);
    }else{
      this.fallbackWorld=this.add.image(0,0,this.world.texture).setOrigin(0).setTint(0xd4e0d9);
      this.fallbackGlow=this.add.image(0,0,this.glow.texture).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.13);
    }
    this.player=this.makeActor('player','你',SPAWN.square!);
    this.rendererKind=webgl?'webgl':'canvas';this.bridge.ready(this.rendererKind);
    this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{
      if(this.bridge.read().blocked||!this.bridge.read().view?.started)return;
      const point={x:pointer.x/this.zoom+this.cameraPoint.x,y:pointer.y/this.zoom+this.cameraPoint.y};
      for(const actor of this.actors.values())if(actor.interactable&&Math.hypot(point.x-actor.x,point.y-actor.y+15)<20&&Math.hypot(actor.x-this.player.x,actor.y-this.player.y)<36){this.bridge.interact(actor.id);return;}
      if(this.passable(point.x,point.y))this.player.route=findPath(this.player,point,this.passable);
    });
    this.scale.on('resize',()=>{this.composite?.setSize(this.scale.width,this.scale.height);this.publish();});
    this.game.events.on(Phaser.Core.Events.BLUR,this.resetClock,this);
    this.game.events.on(Phaser.Core.Events.FOCUS,this.resetClock,this);
    this.events.once('shutdown',()=>{
      this.game.events.off(Phaser.Core.Events.BLUR,this.resetClock,this);this.game.events.off(Phaser.Core.Events.FOCUS,this.resetClock,this);
      this.terrainImage.destroy();this.objectDetails.destroy();this.world.destroy();this.glow.destroy();this.player.sprite.destroy();this.player.shadow.destroy();
      for(const actor of this.actors.values()){actor.sprite.destroy();actor.shadow.destroy();}this.actors.clear();
    });
  }
  private resetClock(){this.accumulator=0;}
  private makeActor(id:string,name:string,position:Point):Actor{
    this.created++;
    return {id,name,...position,distance:0,moving:false,route:[],goals:[],seenMoves:new Set(),observed:true,interactable:false,
      locationId:regionAt(position),inTransit:false,motion:null,clock:0,skillActivity:null,spokenIntent:'',
      bubbleUntil:0,bubbleCooldown:0,bubbleText:'',bubbleKind:'ambient',lastReply:'',
      sprite:new Phaser.GameObjects.Sprite(this,position.x,position.y,`person-${VILLAGERS[id]?id:'player'}`,'0').setOrigin(.5,1),
      shadow:new Phaser.GameObjects.Image(this,position.x,position.y,'person-shadow').setOrigin(.5,.5)};
  }
  private reconcile(view:PlayView){
    if(this.run!==view.runId){
      this.run=view.runId;for(const actor of this.actors.values()){actor.sprite.destroy();actor.shadow.destroy();}this.actors.clear();
      Object.assign(this.player,SPAWN[view.player.locationId]??SPAWN.square!);this.player.route=[];this.player.distance=0;
      this.cameraFloat={x:this.player.x-this.scale.width/this.zoom/2,y:this.player.y-this.scale.height/this.zoom/2};this.accumulator=0;
    }
    for(const person of view.roster){
      const appearance=person.appearance??(person.nearby?{locationId:view.player.locationId,movement:null}:null);
      let actor=this.actors.get(person.id);
      if(!appearance){if(actor){actor.observed=false;actor.interactable=false;}continue;}
      const movement=appearance.movement;
      if(!actor){
        actor=this.makeActor(person.id,person.name,appearance.activity?.stage==='approaching'?appearance.activity.from:appearance.position??home(person.id,movement?.phase==='walking'?movement.from:appearance.locationId));
        this.actors.set(person.id,actor);
        if(movement?.phase==='arrived')actor.seenMoves.add(movement.id);
      }
      const changedLocation=actor.locationId!==appearance.locationId;
      actor.observed=true;actor.interactable=person.nearby;actor.name=person.name;actor.locationId=appearance.locationId;actor.inTransit=movement?.phase==='walking';
      const activity=appearance.activity??null;
      if(activity){
        if(actor.skillActivity?.intentId!==activity.intentId){actor.goals=[];actor.route=findPath(actor,activity.to,this.passable);actor.motion='skill';}
        actor.skillActivity=activity;
        if(movement)actor.seenMoves.add(movement.id);
        continue;
      }
      actor.skillActivity=null;
      if(movement&&!actor.seenMoves.has(movement.id)){
        actor.motion='travel';actor.seenMoves.add(movement.id);
        const goal=appearance.position??home(person.id,movement.to);actor.goals.push({...goal});
      }else if(changedLocation&&!actor.route.length&&!actor.goals.length&&!movement){
        const goal=appearance.position??home(person.id,appearance.locationId);
        if(Math.hypot(actor.x-goal.x,actor.y-goal.y)>3){actor.motion='travel';actor.goals.push({...goal});}
      }

    }
  }
  private travel(actor:Actor,speed:number,dt:number){
    let remaining=speed*dt;actor.moving=false;
    while(actor.route.length&&remaining>.001){
      const waypoint=actor.route[0]!,dx=waypoint.x-actor.x,dy=waypoint.y-actor.y,distance=Math.hypot(dx,dy);
      if(distance<.01){actor.route.shift();continue;}
      const step=Math.min(distance,remaining);
      actor.x+=dx/distance*step;actor.y+=dy/distance*step;actor.distance+=step;actor.moving=true;remaining-=step;
      if(distance<=step+.01)actor.route.shift();
    }
  }
  private fixedStep(dt:number){
    this.steps++;const {view,blocked,keys}=this.bridge.read();if(!view)return;
    const player=this.player;player.moving=false;
    const inputFocused=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName??'');
    if(view.started&&!blocked&&!inputFocused){
      const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      const dy=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
      if(dx||dy){
        player.route=[];const length=Math.hypot(dx,dy),distance=68*dt,old={x:player.x,y:player.y};
        if(this.passable(player.x+dx/length*distance,player.y))player.x+=dx/length*distance;
        if(this.passable(player.x,player.y+dy/length*distance))player.y+=dy/length*distance;
        const travelled=Math.hypot(player.x-old.x,player.y-old.y);player.distance+=travelled;player.moving=travelled>.001;
      }else this.travel(player,68,dt);
      const region=regionAt(player);
      if(region!==view.player.locationId&&!this.transitioning&&!view.busy&&performance.now()>this.retryAfter){
        const next=view.locations.find(location=>location.id===view.player.locationId)?.neighborIds.includes(region)?region:'square';
        this.transitioning=true;
        void this.bridge.move(next).finally(()=>{this.transitioning=false;this.retryAfter=performance.now()+650;});
      }
    }
    for(const actor of this.actors.values()){
      if(!actor.route.length&&actor.goals.length){const next=actor.goals.shift()!;actor.route=findPath(actor,next,this.passable);}
      if(!view.started){actor.moving=false;continue;}
      actor.clock+=dt;
      const withinEarshot=actor.observed&&Math.hypot(actor.x-player.x,actor.y-player.y)<76;
      const reply=[...view.events].reverse().find(event=>event.type==='message_received'&&event.payload.senderId===actor.id&&event.payload.recipientId==='player');
      if(withinEarshot&&reply&&reply.eventId!==actor.lastReply){
        actor.lastReply=reply.eventId;
        if(view.tick-reply.tick<=2){actor.bubbleText=String(reply.payload.content);actor.bubbleKind='message';actor.bubbleUntil=actor.clock+7;}
      }
      const activity=actor.skillActivity;
      if(withinEarshot&&activity?.speech&&actor.spokenIntent!==activity.intentId){
        actor.spokenIntent=activity.intentId;actor.bubbleText=activity.speech;actor.bubbleKind='message';actor.bubbleUntil=actor.clock+6;
      }
      this.travel(actor,31,dt);
      if(!actor.route.length&&!actor.goals.length&&!actor.skillActivity)actor.motion=null;
    }
    const near=[...this.actors.values()].filter(actor=>actor.interactable&&!actor.route.length&&!actor.goals.length&&Math.hypot(actor.x-player.x,actor.y-player.y)<34).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
    this.nearest=near?.id??'';
  }
  override update(_time:number,delta:number){
    if(!this.player)return;
    const view=this.bridge.read().view;if(view&&view!==this.lastView){this.reconcile(view);this.lastView=view;}
    this.accumulator+=Math.min(delta/1000,5/60);
    let count=0;while(this.accumulator>=1/60&&count<5){this.fixedStep(1/60);this.accumulator-=1/60;count++;}
    this.zoom=this.scale.width>=1800?4:3;
    const cameraTarget={x:Math.max(0,Math.min(WORLD_WIDTH-this.scale.width/this.zoom,this.player.x-this.scale.width/this.zoom/2)),y:Math.max(0,Math.min(WORLD_HEIGHT-this.scale.height/this.zoom,this.player.y-this.scale.height/this.zoom/2+16))};
    const follow=1-Math.exp(-Math.min(delta,80)/1000*9);
    this.cameraFloat.x+=(cameraTarget.x-this.cameraFloat.x)*follow;this.cameraFloat.y+=(cameraTarget.y-this.cameraFloat.y)*follow;
    // Snap once, in screen pixels; the shader and HTML layer share this exact camera.
    this.cameraPoint={x:Math.round(this.cameraFloat.x*this.zoom)/this.zoom,y:Math.round(this.cameraFloat.y*this.zoom)/this.zoom};
    this.world.clear();this.world.draw(this.terrainImage);
    this.objectDetails.clear();
    for(const object of view?.objects??[]){
      if(object.tags.includes('table')&&(object.state.cleanliness??0)<100){
        const spots=(object.state.cleanliness??0)<50?4:2;
        this.objectDetails.fillStyle(0x6d5942,.8);
        for(let i=0;i<spots;i++)this.objectDetails.fillRect(object.position.x+2+i*3,object.position.y-2+i%2,2,2);
      }
      if(object.tags.includes('counter')){
        this.objectDetails.fillStyle(0xeee8ce,1);
        for(let i=0;i<Math.min(4,object.state.cupsReady??0);i++)this.objectDetails.fillRect(object.position.x-9+i*5,object.position.y-5,3,4);
      }
    }
    this.world.draw(this.objectDetails);
    const entities=[...this.actors.values(),this.player].sort((a,b)=>a.y-b.y);
    for(const actor of entities){
      const executing=actor.skillActivity?.stage==='acting'&&!actor.route.length&&Math.hypot(actor.x-actor.skillActivity.to.x,actor.y-actor.skillActivity.to.y)<2;
      const frame=actor.moving?Math.floor(actor.distance/3.5)%WALK_FRAMES:executing?(1+ACTIVITY_KINDS.indexOf(actor.skillActivity!.animation))*WALK_FRAMES+Math.floor(actor.clock/.42)%IDLE_FRAMES:0;
      actor.sprite.setPosition(Math.round(actor.x),Math.round(actor.y)).setFrame(String(frame));actor.shadow.setPosition(Math.round(actor.x),Math.round(actor.y-1));
      this.world.draw([actor.shadow,actor.sprite]);
    }
    this.world.render();
    this.fallbackWorld?.setPosition(-this.cameraPoint.x*this.zoom,-this.cameraPoint.y*this.zoom).setScale(this.zoom);
    this.fallbackGlow?.setPosition(-this.cameraPoint.x*this.zoom,-this.cameraPoint.y*this.zoom).setScale(this.zoom*2);
    this.publish();
  }
  private activityLabel(actor:Actor):string{
    if(actor.id==='player')return '';
    if(actor.skillActivity){
      const activity=actor.skillActivity,target=this.bridge.read().view?.objects?.find(object=>object.id===activity.targetId);
      if(actor.route.length||actor.moving)return `去${target?.name??'目标旁'}`;
      return activity.stage==='acting'?activity.title:'在目标旁准备';
    }
    return actor.motion==='travel'?'赶路':'留意周围';
  }
  private publish(){
    if(!this.player)return;
    const actors=[...this.actors.values(),this.player].map(actor=>({id:actor.id,name:actor.name,x:actor.x,y:actor.y,moving:actor.moving,interactable:actor.interactable,
      activity:this.activityLabel(actor),pose:Number(actor.sprite.frame.name),
      bubble:actor.id!=='player'&&actor.observed&&actor.clock<actor.bubbleUntil&&Math.hypot(actor.x-this.player.x,actor.y-this.player.y)<90?actor.bubbleText:'',bubbleKind:actor.bubbleKind,
      screenX:Math.round((Math.round(actor.x)-this.cameraPoint.x)*this.zoom),screenY:Math.round((Math.round(actor.y)-this.cameraPoint.y-35)*this.zoom)}));
    const frame:TownFrame={x:this.cameraPoint.x,y:this.cameraPoint.y,zoom:this.zoom,width:this.scale.width,height:this.scale.height,nearest:this.nearest,actors,renderer:this.rendererKind,created:this.created,steps:this.steps};
    this.registry.set('town-diagnostics',frame);this.bridge.frame(frame);
  }
  interact(){if(this.nearest&&!this.bridge.read().blocked)this.bridge.interact(this.nearest);}
}
