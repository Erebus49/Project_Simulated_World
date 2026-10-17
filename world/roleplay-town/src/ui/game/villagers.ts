import { ACTIVITY_KINDS, type ActivityKind } from './animations.js';
export const FRAME_W = 24, FRAME_H = 32, WALK_FRAMES = 6, IDLE_FRAMES = 6, FRAME_ROWS = 1+ACTIVITY_KINDS.length;
interface Palette { hair: string; shine: string; coat: string; light: string; trousers: string; skin: string; accent: string; style: 'bob' | 'short' | 'long' | 'cap'; accessory?: 'apron' | 'glasses' | 'camera' | 'scarf' }
export const VILLAGERS: Record<string, Palette> = {
  player: { hair:'#5c3d32',shine:'#98704d',coat:'#cb9953',light:'#efc47a',trousers:'#4a6573',skin:'#eac09a',accent:'#507e78',style:'short',accessory:'scarf' },
  owner: { hair:'#684034',shine:'#a65e40',coat:'#a35f5a',light:'#d58c79',trousers:'#66565c',skin:'#f0c4a5',accent:'#e7ce9b',style:'bob',accessory:'apron' },
  barista: { hair:'#393a38',shine:'#68644c',coat:'#588b78',light:'#88b398',trousers:'#4c5364',skin:'#e2b68d',accent:'#eee2ba',style:'short',accessory:'apron' },
  'customer-a': { hair:'#3d3544',shine:'#736078',coat:'#637fa3',light:'#96afc3',trousers:'#535776',skin:'#edc6ab',accent:'#cfbd95',style:'long',accessory:'glasses' },
  'customer-b': { hair:'#423b39',shine:'#75614f',coat:'#756c90',light:'#a196b4',trousers:'#4c5360',skin:'#dcb492',accent:'#c7a36c',style:'cap',accessory:'camera' },
  supplier: { hair:'#84725c',shine:'#b7a58b',coat:'#a18555',light:'#c8b477',trousers:'#4e605e',skin:'#d6ac85',accent:'#c5cfb2',style:'short',accessory:'scarf' },
  messenger: { hair:'#6e453f',shine:'#b27657',coat:'#a17683',light:'#d4a0a3',trousers:'#5e6177',skin:'#edc2a0',accent:'#e3bc6c',style:'bob',accessory:'scarf' },
};

// Original dot patterns and palettes, shared by world sprites and DOM portraits.
const FACE = [
  '....hhhhhhhh....', '...hhHHHHHHhh...', '..hhHHHHHHHHhh..', '..hHHHHHHHHHHh..',
  '..hHHHssssHHHh..', '..hHssssssssHh..', '..hssSssssSssh..', '..hssEssssEssh..',
  '..hssssssssssh..', '...ssBssssBss...', '....sssMmsss....', '.....ssssss.....',
];
function drawPerson(ctx: CanvasRenderingContext2D, id: string, pose: number, working:ActivityKind|null=null) {
  const p = VILLAGERS[id] ?? VILLAGERS.player!, outline = '#3e3438';
  const colors: Record<string,string> = { h:p.hair,H:p.shine,s:p.skin,S:'#dba284',E:'#3c3740',B:'#df9a83',M:'#b77e69',m:'#f3c4a0' };
  const stride = working?0:[0,1,2,0,-1,-2][pose] ?? 0;
  const rect = (color:string,x:number,y:number,w:number,h:number) => { ctx.fillStyle=color;ctx.fillRect(x,y,w,h); };
  // Legs and soles change pose, while the torso remains stable: no whole-sprite bob or opacity changes.
  rect(outline,7,25,4,6);rect(outline,13,25,4,6);
  rect(p.trousers,8,24,3,5+Math.max(0,stride));rect(p.trousers,13,24,3,5+Math.max(0,-stride));
  rect('#55443e',7,29+Math.min(0,stride),5,2);rect('#55443e',13,29+Math.min(0,-stride),5,2);
  rect(outline,6,15,12,11);rect(p.coat,7,15,10,10);rect(p.light,7,15,3,9);rect(p.accent,8,15,8,2);
  rect(outline,4,17+Math.sign(stride),3,7);rect(outline,17,17-Math.sign(stride),3,7);
  rect(p.coat,5,17+Math.sign(stride),2,5);rect(p.light,17,17-Math.sign(stride),2,5);
  rect(p.skin,5,22+Math.sign(stride),2,2);rect(p.skin,17,22-Math.sign(stride),2,2);
  {
    ctx.save();
    FACE.forEach((row,y)=>[...row].forEach((letter,x)=>{if(colors[letter])rect(colors[letter]!,x+4,y+1,1,1);}));
    // Hair silhouettes and asymmetric details make every resident recognizable.
    if(p.style==='long'){rect(p.hair,5,9,2,10);rect(p.hair,17,8,2,11);rect(p.shine,5,8,1,9);}
    if(p.style==='bob'){rect(p.hair,5,8,2,7);rect(p.hair,17,8,2,6);rect(p.shine,5,7,1,5);}
    if(p.style==='cap'){rect('#4b5364',5,2,14,4);rect('#77768b',7,2,10,1);rect('#343b4d',13,5,8,2);}
    if(p.accessory==='glasses'){rect('#5d5157',8,8,3,2);rect('#5d5157',14,8,3,2);rect('#5d5157',11,8,3,1);rect('#c7c7b4',9,8,1,1);rect('#c7c7b4',15,8,1,1);}
    if(p.accessory==='apron'){rect(p.accent,9,17,6,8);rect('#fff0c4',10,17,1,7);rect('#af9b79',10,22,4,1);}
    if(p.accessory==='camera'){rect('#3d424b',9,19,7,5);rect('#8b9b9f',11,20,3,3);rect('#33434c',12,21,1,1);rect(p.accent,11,16,1,3);}
    if(p.accessory==='scarf'){rect(p.accent,8,14,8,2);rect(p.accent,14,16,2,4);}
    if(id==='supplier'){rect('#7a6755',9,11,6,1);rect('#a7a594',6,5,2,3);rect('#a7a594',16,5,2,3);}
    ctx.restore();
  }
  if(working&&id!=='player'){
    const phase=[0,1,2,1,0,-1][pose]??0;
    if(working==='hands'){
      rect('#dfd8b6',9,19,7,5);rect('#f5efd3',9,19,6,1);rect('#b9b79e',16,20,2,3);
      rect(p.skin,6+phase,21,4,2);rect('#f1e4bf',8+phase,20,4,3);rect(p.skin,15,23,3,2);
    }else if(working==='read'){
      rect('#5f665b',5,19,15,7);rect('#e8dbb7',6,19,6,6);rect('#f5ebcf',13,19,6,6);rect('#9b946f',12,19,1,7);
      rect('#c9c1a0',8+Math.max(0,phase),20,1,5);rect(p.skin,5,24,3,2);rect(p.skin,18,24,2,2);
    }else if(working==='photo'){
      const y=pose===2||pose===3?12:pose===1||pose===4?16:19;
      rect(p.skin,7,y+1,3,3);rect(p.skin,16,y+1,3,3);rect('#343f4a',9,y,8,5);rect('#7b9297',11,y+1,4,3);rect('#263c48',12,y+1,2,2);
    }else if(working==='write'){
      rect('#725d45',8,18,9,9);rect('#e8dab1',9,19,7,7);rect('#9b926b',10,21,4,1);rect('#aca277',10,23,3,1);
      rect(p.skin,6,24,3,2);rect(p.skin,16,20+Math.max(0,phase),3,2);rect('#cfa456',14,19+Math.max(0,phase),4,1);
    }else if(working==='tidy'){
      rect('#725938',5,23,15,3);rect('#c5a572',6,22,13,2);rect(p.skin,6+phase*2,20,4,3);rect('#f0dfb3',7+phase*2,22,5,2);rect(p.skin,16,22,3,2);
    }else{
      rect(p.skin,5,22-Math.max(0,phase),2,2);rect(p.skin,17,22-Math.max(0,-phase),2,2);rect(p.light,7,18,2,3);
    }
  }
}
const sheets = new Map<string,HTMLCanvasElement>(), portraits = new Map<string,string>();
export function characterSheet(id:string):HTMLCanvasElement {
  const found=sheets.get(id);if(found)return found;
  const canvas=document.createElement('canvas');canvas.width=FRAME_W*WALK_FRAMES;canvas.height=FRAME_H*FRAME_ROWS;
  const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  for(let row=0;row<FRAME_ROWS;row++)for(let pose=0;pose<WALK_FRAMES;pose++){ctx.save();ctx.translate(pose*FRAME_W,row*FRAME_H);drawPerson(ctx,id,pose,row===0?null:ACTIVITY_KINDS[row-1]!);ctx.restore();}
  sheets.set(id,canvas);return canvas;
}
export function characterPortrait(id:string):string {
  const found=portraits.get(id);if(found)return found;
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#283b3b';ctx.fillRect(0,0,48,48);ctx.fillStyle='#38564c';ctx.fillRect(3,3,42,42);
  ctx.save();ctx.translate(-12,-2);ctx.scale(3,3);drawPerson(ctx,id,0);ctx.restore();
  const uri=canvas.toDataURL();portraits.set(id,uri);return uri;
}
