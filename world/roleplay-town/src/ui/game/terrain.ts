export interface Point { x: number; y: number }
export const WORLD_WIDTH = 960, WORLD_HEIGHT = 720;
export const SPAWN: Record<string, Point> = { square: { x: 384, y: 402 }, cafe: { x: 266, y: 304 }, market: { x: 550, y: 384 } };
export const HOMES: Record<string, Record<string, Point>> = {
  cafe: { owner: { x:252,y:286 }, barista:{x:300,y:290}, 'customer-a':{x:224,y:320}, 'customer-b':{x:292,y:330}, supplier:{x:232,y:348}, messenger:{x:320,y:320} },
  square: { owner:{x:354,y:354},barista:{x:414,y:342},'customer-a':{x:356,y:410},'customer-b':{x:422,y:414},supplier:{x:462,y:395},messenger:{x:442,y:360} },
  market: { owner:{x:526,y:348},barista:{x:590,y:368},'customer-a':{x:532,y:400},'customer-b':{x:596,y:410},supplier:{x:564,y:356},messenger:{x:584,y:400} },
};
export const LANDMARKS = [
 {id:'cafe',name:'松果咖啡',detail:'COFFEE & OLD FRIENDS',x:319,y:282},
 {id:'market',name:'街角集市',detail:'THE CORNER MARKET',x:619,y:343},
 {id:'books',name:'旧街书屋',detail:'OLD STREET BOOKS',x:455,y:231},
 {id:'square',name:'松果广场',detail:'PINECONE SQUARE',x:355,y:455},
 {id:'riverside',name:'河岸步道',detail:'RIVERSIDE WALK',x:819,y:446},
 {id:'garden',name:'南侧花园',detail:'THE QUIET GARDEN',x:452,y:632},
];
export function regionAt(point: Point) {
 if(point.x>=180&&point.x<=335&&point.y>=259&&point.y<=352)return 'cafe';
 if(point.x>=513&&point.x<=624&&point.y>=323&&point.y<=435)return 'market';
 return 'square';
}
function random(x:number,y:number){return ((Math.sin(x*91.7+y*37.3)*43758.5453)%1+1)%1;}
export function createTerrain(town: HTMLImageElement) {
 const W=WORLD_WIDTH,H=WORLD_HEIGHT,T=16;
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const ground=canvas.getContext('2d')!;ground.imageSmoothingEnabled=false;
 const trees:Point[]=[];
 const solids=[{x:206,y:182,w:100,h:78},{x:414,y:134,w:84,h:73},{x:526,y:268,w:84,h:55},{x:65,y:333,w:105,h:95},{x:378,y:365,w:16,h:16}];
    function tile(context: CanvasRenderingContext2D, index: number, x: number, y: number) { context.drawImage(town, index % 12 * T, Math.floor(index / 12) * T, T, T, x, y, T, T); }
    function tree(x: number, y: number, variety: number) {
      trees.push({ x: x + 3, y });
      const shade = variety > .6 ? ['#345b37', '#467640', '#619147', '#78a554'] : ['#315e44', '#3e7950', '#58914f', '#71a25c'];
      ground.fillStyle = '#365b3940'; ground.fillRect(x - 13, y - 3, 34, 10);
      ground.fillStyle = '#795d38'; ground.fillRect(x + 2, y - 13, 6, 17); ground.fillStyle = '#9e7744'; ground.fillRect(x + 2, y - 13, 2, 16);
      ground.fillStyle = shade[0]!; ground.fillRect(x - 13, y - 39, 34, 26); ground.fillRect(x - 8, y - 47, 24, 42);
      ground.fillStyle = shade[1]!; ground.fillRect(x - 17, y - 34, 40, 16); ground.fillRect(x - 10, y - 46, 27, 32);
      ground.fillStyle = shade[2]!; ground.fillRect(x - 11, y - 36, 31, 12); ground.fillRect(x - 5, y - 44, 18, 24);
      ground.fillStyle = shade[3]!; ground.fillRect(x - 6, y - 40, 15, 5); ground.fillRect(x - 11, y - 31, 11, 5); ground.fillRect(x + 9, y - 30, 8, 4);
    }
    function building(x: number, y: number, columns: number, blue = false) {
      ground.fillStyle = '#37523744'; ground.fillRect(x + 5, y + 48, columns * 16 + 1, 21);
      ground.fillStyle = blue ? '#8b9aab' : '#bc8559'; ground.fillRect(x, y + 32, columns * 16, 32);
      for (let column = 0; column < columns; column++) {
        const edge = column === 0 ? 0 : column === columns - 1 ? 2 : 1;
        tile(ground, (blue ? 48 : 52) + edge, x + column * T, y);
        tile(ground, (blue ? 60 : 64) + edge, x + column * T, y + T);
        tile(ground, (blue ? 76 : 72) + (column === 0 ? 0 : column === columns - 1 ? 3 : column === Math.floor(columns / 2) ? 2 : 1), x + column * T, y + 32);
        if (column === Math.floor(columns / 2)) tile(ground, blue ? 89 : 85, x + column * T, y + 48);
        else if (column === 1 || column === columns - 2) tile(ground, blue ? 88 : 84, x + column * T, y + 48);
        else { ground.fillStyle = blue ? '#8b9aab' : '#bc8559'; ground.fillRect(x + column * T, y + 48, T, T); ground.fillStyle = blue ? '#657389' : '#97613f'; ground.fillRect(x + column * T, y + 61, T, 3); }
      }
      tile(ground, blue ? 51 : 55, x + (columns - 2) * T, y - 7);
    }
    function sign(x: number, y: number, _title: string) {
      ground.fillStyle = '#815c35'; ground.fillRect(x - 1, y + 6, 3, 13); ground.fillRect(x - 20, y - 5, 42, 16);
      ground.fillStyle = '#dfb76d'; ground.fillRect(x - 18, y - 3, 38, 12);
    }
    function drawTerrain() {
      for (let y = 0; y < H / T; y++) for (let x = 0; x < W / T; x++) tile(ground, random(x, y) > .7 ? 1 : 0, x * T, y * T);
      const path = (x: number, y: number) => x >= 2 && x <= 56 && y >= 23 && y <= 25 || x >= 23 && x <= 25 && y >= 10 && y <= 41 || x >= 14 && x <= 18 && y >= 16 && y <= 24 || x >= 33 && x <= 37 && y >= 20 && y <= 25 || x >= 20 && x <= 28 && y >= 20 && y <= 28 || x>=49&&x<=51&&y>=16&&y<=37 || x>=16&&x<=33&&y>=36&&y<=38 || x>=18&&x<=31&&y>=35&&y<=40;
      for (let y = 0; y < H / T; y++) for (let x = 0; x < W / T; x++) {
        if (path(x, y)) { const top = !path(x, y - 1), bottom = !path(x, y + 1), left = !path(x - 1, y), right = !path(x + 1, y); tile(ground, (top ? 12 : bottom ? 36 : 24) + (left ? 0 : right ? 2 : 1), x * T, y * T); }
        else if (random(x + 40, y) > .88) { const color = random(x, y + 91) > .5 ? '#efd272' : '#e7c6c5'; ground.fillStyle = '#588849'; ground.fillRect(x * T + 7, y * T + 10, 2, 4); ground.fillStyle = color; ground.fillRect(x * T + 5, y * T + 7, 5, 3); ground.fillRect(x * T + 7, y * T + 5, 2, 6); }
      }
      // A stream and a footbridge form the eastern edge of town.
      ground.fillStyle = '#5b8f98'; ground.fillRect(680, 0, 88, H); ground.fillStyle = '#78aeb0'; ground.fillRect(687, 0, 76, H); ground.fillStyle = '#a2c4b3'; ground.fillRect(677, 0, 5, H);
      for (let y = 0; y < H; y += 24) { ground.fillStyle = '#b2d3c080'; ground.fillRect(700 + (y % 7) * 4, y, 15, 2); ground.fillRect(734, y + 9, 9, 2); }
      ground.fillStyle = '#7f603e'; ground.fillRect(665, 366, 111, 43); ground.fillStyle = '#b49260'; for (let x = 666; x < 776; x += 10) ground.fillRect(x, 368, 8, 39); ground.fillStyle = '#705334'; ground.fillRect(662, 367, 114, 3); ground.fillRect(662, 407, 114, 3);
      // Community flowerbeds and a quiet pond.
      ground.fillStyle = '#516e41'; ground.fillRect(78, 340, 91, 84); ground.fillStyle = '#71a2a0'; ground.fillRect(84, 345, 79, 72); ground.fillStyle = '#90b9a8'; ground.fillRect(91, 351, 65, 58);
      for (let i = 0; i < 9; i++) { ground.fillStyle = '#b7d1b050'; ground.fillRect(90 + i * 7, 360 + i % 4 * 10, 9, 2); }
      for (let x = 10; x <= 14; x++) for (let y = 29; y <= 32; y++) { ground.fillStyle = '#9d7549'; ground.fillRect(x * T, y * T, 14, 14); ground.fillStyle = '#658a43'; ground.fillRect(x * T + 4, y * T + 2, 7, 8); ground.fillStyle = '#d9ad5e'; ground.fillRect(x * T + 6, y * T + 4, 4, 4); }
      building(208, 192, 6); building(416, 144, 5, true); building(528, 272, 5);
      // Market canopy, porch furniture, pots and a notice board.
      ground.fillStyle = '#94643e'; ground.fillRect(525, 322, 88, 7); ground.fillRect(528, 325, 4, 11); ground.fillRect(605, 325, 4, 11);
      for (let i = 0; i < 8; i++) { ground.fillStyle = i % 2 ? '#698f63' : '#efe2b2'; ground.fillRect(521 + i * 12, 297, 12, 20); }
      tile(ground, 107, 314, 253); tile(ground, 107, 201, 257); tile(ground, 106, 593, 336);
      for (const [x, y] of [[218, 309], [284, 334], [348, 343], [425, 407]]) { ground.fillStyle = '#805c38'; ground.fillRect(x!, y!, 17, 9); ground.fillStyle = '#c4985e'; ground.fillRect(x! - 2, y! - 3, 21, 8); }
      ground.fillStyle = '#8e9a80'; ground.fillRect(378, 365, 16, 15); ground.fillStyle = '#b8c2a1'; ground.fillRect(375, 361, 22, 9); ground.fillStyle = '#6e9a92'; ground.fillRect(379, 363, 14, 4);
      sign(318, 279, '松果咖啡'); sign(618, 340, '街角集市'); sign(454, 228, '旧街书屋'); sign(354, 452, '松果广场');
      for (let x = 10; x < W; x += 27) { tree(x, 108 + Math.floor(random(x, 0) * 16), random(x, 1)); tree(x + 13, 66, random(x, 2)); tree(x - 4, 23, random(x, 3)); }
      for (let y = 140; y < H; y += 38) { tree(14, y, random(y, 9)); tree(42, y + 15, random(y, 11)); }
      for (const [x, y] of [[103, 189], [150, 220], [100, 293], [164, 301], [325, 184], [337, 224], [532, 178], [579, 209], [622, 260], [618, 480], [560, 519], [473, 513], [308, 520], [84, 512], [283, 148]]) tree(x!, y!, random(x!, y!));
      ground.fillStyle = '#7f6546'; ground.fillRect(320, 401, 13, 22); ground.fillStyle = '#e4d9af'; ground.fillRect(318, 397, 18, 16); ground.fillStyle = '#977f57'; ground.fillRect(322, 401, 9, 1); ground.fillRect(322, 405, 8, 1);
      // New areas connect to the existing village through the bridge and the south path.
      for(const [x,y]of [[811,287],[852,506],[838,545],[850,182],[528,663],[268,663],[478,551]])tree(x!,y!,random(x!,y!));
      for(let y=165;y<690;y+=47)tree(925,y,random(y,73));
      for(let x=62;x<665;x+=31)tree(x,704,random(x,91));
      const bench=(x:number,y:number)=>{
        ground.fillStyle='#755b3e';ground.fillRect(x+2,y+7,3,7);ground.fillRect(x+25,y+7,3,7);
        ground.fillStyle='#b89762';ground.fillRect(x,y,31,5);ground.fillRect(x,y+7,31,4);ground.fillStyle='#d4b078';ground.fillRect(x,y,31,1);
        solids.push({x,y:y+4,w:31,h:9});
      };
      bench(839,330);bench(839,456);bench(286,600);bench(482,600);
      for(const [x,y]of [[298,563],[468,563],[298,642],[468,642]]){
        ground.fillStyle='#9d7549';ground.fillRect(x!,y!,55,22);
        for(let flower=0;flower<7;flower++){ground.fillStyle='#668846';ground.fillRect(x!+5+flower*7,y!+8,2,9);ground.fillStyle=flower%2?'#f0d79e':'#dba6ae';ground.fillRect(x!+3+flower*7,y!+5,6,4);}
        solids.push({x:x!,y:y!,w:55,h:22});
      }
      // A small arbor in the garden, with open space beneath it.
      ground.fillStyle='#7b6544';ground.fillRect(367,565,5,22);ground.fillRect(409,565,5,22);ground.fillRect(365,562,51,5);
      ground.fillStyle='#6e9654';ground.fillRect(361,558,59,5);ground.fillStyle='#9bb170';ground.fillRect(369,556,40,3);
      sign(818,445,'河岸步道');sign(451,632,'南侧花园');
    }

 drawTerrain();
 const passable=(x:number,y:number)=>x>51&&x<W-39&&y>124&&y<H-30&&!(x>671&&x<774&&(y<374||y>403))&&!solids.some(rect=>x>rect.x-4&&x<rect.x+rect.w+4&&y>rect.y-4&&y<rect.y+rect.h+4)&&!trees.some(tree=>Math.abs(tree.x-x)<17&&y>tree.y-23&&y<tree.y+7);
 return {canvas,passable};
}
