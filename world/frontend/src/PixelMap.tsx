import { useEffect, useRef } from 'react';
import { ArrowUpRight, Footprints, MapPin } from 'lucide-react';
import type { Game, Person } from './types';
import { CHARACTER_ATLAS, characterTiles } from './townArt';

export const rooms: Record<string, string> = { shop: '松果杂货铺', square: '庆典广场', stage: '露天舞台' };

export function PixelPerson({ color, id = '', size = 48 }: { color: string; id?: string; size?: number }) {
  const tile = characterTiles[id] ?? characterTiles.player;
  const x = (tile % 12) * 16, y = Math.floor(tile / 12) * 16;
  return <svg width={size} height={size * 1.25} viewBox="0 0 16 20" shapeRendering="crispEdges" aria-hidden="true" data-sprite-pack="kenney-tiny-dungeon" style={{ imageRendering: 'pixelated' }}>
    <ellipse cx="8" cy="17" rx="5" ry="1" fill="#14203360" />
    <path d="M4 18h8v1H4z" fill={color} opacity=".75" />
    <svg x="0" y="1" width="16" height="16" viewBox={`${x} ${y} 16 16`} overflow="hidden">
      <image href={CHARACTER_ATLAS} x="0" y="0" width="192" height="176" style={{ imageRendering: 'pixelated' }} />
    </svg>
  </svg>;
}

export function drawTown(ctx: CanvasRenderingContext2D) {
  const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  let seed = 417;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  rect(0, 0, 480, 285, '#91ae74');
  for (let i = 0; i < 2200; i++) { const x = Math.floor(rnd() * 480), y = Math.floor(rnd() * 285); rect(x, y, rnd() > .7 ? 2 : 1, 1, rnd() > .5 ? '#a3bb83' : '#86a46c'); }
  // Winding paths and little stone edges.
  rect(91, 161, 298, 39, '#b6a584'); rect(95, 164, 289, 33, '#d8c59f');
  rect(222, 133, 35, 152, '#b6a584'); rect(225, 135, 29, 150, '#d8c59f');
  rect(103, 133, 30, 65, '#d8c59f'); rect(362, 126, 27, 68, '#d8c59f');
  for (let i = 0; i < 310; i++) { const x = 98 + Math.floor(rnd() * 281), y = 165 + Math.floor(rnd() * 29); rect(x, y, 2, 1, rnd() > .5 ? '#c5b48f' : '#e4d2ae'); }
  // Building shadow and plaster shop.
  rect(35, 85, 124, 64, '#65885b55'); rect(37, 78, 111, 66, '#8a745a');
  rect(40, 81, 105, 59, '#ecdfb3'); rect(44, 85, 97, 6, '#cfb789');
  rect(29, 70, 127, 8, '#744c40'); rect(33, 62, 119, 8, '#915b48');
  rect(39, 54, 107, 8, '#aa6d4e'); rect(46, 46, 93, 8, '#bd8058');
  rect(52, 39, 81, 7, '#c98d60'); rect(58, 34, 69, 5, '#d7a571');
  for (let y = 43; y < 76; y += 9) for (let x = 41; x < 146; x += 13) if (x > 65 - (y - 40) && x < 125 + (y - 40)) rect(x, y, 9, 1, '#8d5d47');
  rect(121, 24, 12, 20, '#a59177'); rect(119, 22, 16, 4, '#867260');
  rect(51, 100, 25, 23, '#927251'); rect(54, 103, 19, 17, '#577e76');
  rect(62, 103, 2, 17, '#d6c58e'); rect(54, 111, 19, 2, '#d6c58e');
  rect(105, 100, 25, 23, '#927251'); rect(108, 103, 19, 17, '#577e76');
  rect(116, 103, 2, 17, '#d6c58e'); rect(108, 111, 19, 2, '#d6c58e');
  rect(82, 108, 18, 32, '#86694c'); rect(85, 111, 12, 29, '#4f6860'); rect(93, 127, 2, 2, '#e4c57b');
  rect(45, 92, 93, 7, '#7b9578');
  for (let x = 45; x < 138; x += 12) rect(x, 92, 6, 9, '#e4d7ae');
  rect(82, 141, 22, 4, '#c2b28b'); rect(80, 145, 26, 4, '#d9cba5');
  // Shop crates and flowers.
  rect(136, 127, 14, 14, '#ad8056'); rect(138, 129, 10, 2, '#d1a16d'); rect(138, 135, 10, 2, '#d1a16d');
  for (const x of [46, 123]) { rect(x, 131, 9, 10, '#ad7153'); rect(x - 2, 129, 13, 3, '#c08a62'); rect(x + 3, 120, 2, 10, '#557e57'); rect(x, 120, 8, 5, '#e3ba7a'); rect(x + 2, 117, 4, 5, '#f0d59a'); }
  // Raised stage, roof, curtains, spotlights, speaker stacks.
  rect(322, 87, 124, 57, '#63815b55'); rect(318, 101, 123, 34, '#96714f');
  rect(321, 102, 117, 28, '#bc9566');
  for (let y = 106; y < 132; y += 6) rect(321, y, 117, 1, '#a17c54');
  rect(315, 132, 130, 7, '#765c48'); rect(320, 139, 119, 4, '#c4a176');
  rect(359, 143, 44, 4, '#c7ad80'); rect(363, 147, 36, 4, '#d5c197');
  rect(320, 61, 6, 72, '#78664e'); rect(431, 61, 6, 72, '#78664e');
  rect(316, 54, 125, 8, '#6c6f55'); rect(323, 46, 111, 8, '#8c9871'); rect(330, 39, 97, 7, '#a5af81');
  rect(326, 63, 105, 6, '#c28579');
  rect(326, 69, 13, 49, '#ad6a66'); rect(418, 69, 13, 49, '#ad6a66');
  for (const x of [328, 421]) rect(x, 70, 3, 46, '#c7897a');
  rect(339, 70, 79, 33, '#6b7e6a'); rect(351, 76, 55, 19, '#e4d6a6');
  ctx.fillStyle = '#627658'; ctx.font = 'bold 9px monospace'; ctx.fillText('PINE FEST', 355, 89);
  for (const x of [328, 419]) { rect(x, 112, 10, 17, '#424d46'); rect(x + 2, 114, 6, 5, '#6a7365'); rect(x + 2, 122, 6, 5, '#303e38'); }
  rect(381, 103, 2, 23, '#555d50'); rect(378, 102, 7, 3, '#e0d1a3');
  // Square fountain.
  rect(211, 119, 54, 28, '#82956e'); rect(207, 124, 62, 17, '#b5b39a');
  rect(211, 120, 54, 22, '#c6c5aa'); rect(215, 123, 46, 15, '#73a9a3');
  rect(218, 126, 40, 8, '#91c4b6'); rect(233, 110, 11, 21, '#b7b99d');
  rect(228, 108, 21, 5, '#d7d2b0'); rect(236, 103, 5, 5, '#a4c5ad');
  for (const [x, y] of [[225, 124], [252, 127], [220, 132]]) rect(x, y, 5, 1, '#d1e2cb');
  // Noticeboard and benches.
  rect(285, 135, 3, 19, '#796a4e'); rect(306, 135, 3, 19, '#796a4e'); rect(280, 117, 34, 25, '#92774f'); rect(283, 120, 28, 19, '#d8c69c'); rect(287, 123, 11, 10, '#eee1bb'); rect(301, 124, 6, 9, '#c1ad83');
  for (const x of [177, 278]) { rect(x, 216, 30, 4, '#96704e'); rect(x, 222, 30, 4, '#b48c5d'); rect(x + 3, 226, 3, 5, '#6e6550'); rect(x + 24, 226, 3, 5, '#6e6550'); }
  // Pond with pixel banks.
  rect(18, 211, 87, 42, '#769666'); rect(26, 205, 72, 53, '#769666');
  rect(24, 214, 77, 35, '#7ba7a1'); rect(31, 209, 61, 45, '#7ba7a1');
  rect(31, 217, 61, 29, '#8abbb0'); rect(38, 212, 47, 38, '#8abbb0');
  for (const [x, y] of [[39, 226], [65, 238], [45, 245], [73, 218]]) rect(x, y, 12, 1, '#b4d4bf');
  rect(41, 231, 9, 3, '#688d61'); rect(43, 229, 4, 4, '#7d9d66'); rect(47, 229, 3, 2, '#dfb4a0');
  // Trees in foreground and background.
  const tree = (x: number, y: number, small = false) => {
    const w = small ? 16 : 24, h = small ? 18 : 28;
    rect(x + w / 2 - 2, y + h - 2, 5, 13, '#7b6a4c');
    rect(x - 1, y + h + 6, w + 3, 3, '#6f925d65');
    rect(x, y + 6, w, h - 9, '#507952'); rect(x + 4, y, w - 8, h - 2, '#507952');
    rect(x + 3, y + 5, w - 6, h - 13, '#6e965d'); rect(x + 6, y + 2, w - 12, 7, '#83a76b');
    rect(x + 4, y + h - 7, w - 8, 5, '#466f4e');
  };
  [[12, 36], [171, 33], [191, 15], [277, 30], [300, 14], [449, 47], [455, 106], [8, 137], [156, 233], [188, 249], [314, 232], [341, 247], [413, 222], [446, 247]].forEach(([x, y]) => tree(x, y));
  [[61, 179], [148, 185], [406, 173], [435, 182], [122, 226], [298, 78]].forEach(([x, y]) => tree(x, y, true));
  // Flower beds.
  for (const [x, y] of [[177, 84], [286, 199], [369, 228], [118, 202]]) {
    rect(x - 2, y + 3, 22, 8, '#7c995d');
    for (let k = 0; k < 5; k++) { rect(x + k * 4, y + (k % 2) * 3, 2, 5, '#567b50'); rect(x + k * 4 - 1, y - 1 + (k % 2) * 3, 4, 3, k % 2 ? '#e5bb8b' : '#dec9a0'); }
  }
  // Festoon lines, cloth pennants.
  ctx.strokeStyle = '#6f775b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(145, 64); ctx.quadraticCurveTo(236, 96, 322, 59); ctx.stroke();
  const pennants = ['#dcad79', '#c87f73', '#ece0ac', '#839e9b'];
  for (let i = 0; i < 12; i++) {
    const x = 153 + i * 14, t = (x - 145) / 177, y = (1 - t) * (1 - t) * 64 + 2 * (1 - t) * t * 96 + t * t * 59;
    rect(x, Math.round(y), 5, 4, pennants[i % 4]); rect(x + 1, Math.round(y) + 4, 3, 2, pennants[i % 4]); rect(x + 2, Math.round(y) + 6, 1, 1, pennants[i % 4]);
  }
  // Little lampposts.
  for (const [x, y] of [[190, 164], [314, 169], [263, 253]]) { rect(x, y - 22, 2, 24, '#596650'); rect(x - 3, y - 27, 8, 7, '#ddd19c'); rect(x - 4, y - 29, 10, 2, '#56684e'); }
}

const bases: Record<string, [number, number]> = { shop: [21.5, 56], square: [49, 66], stage: [79.5, 55] };
const offsets: Record<string, [number, number]> = { player: [-4, 3], mayor: [4, -2], caretaker: [1, -1], shopkeeper: [-3, -2], reporter: [8, 5] };

export default function PixelMap({ game, selected, onSelect, onMove, busy }: { game: Game | null; selected: string; onSelect: (id: string) => void; onMove: (room: string) => void; busy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext('2d'); if (ctx) drawTown(ctx); }, []);
  const people: Person[] = game?.people || [
    { id: 'player', name: '你', role: '志愿者', color: '#f4cb77', location: 'square', visible: true },
    { id: 'mayor', name: '林镇长', role: '负责人', color: '#9dabea', location: 'square', visible: true },
    { id: 'caretaker', name: '周师傅', role: '管理员', color: '#81c9bd', location: 'stage', visible: false },
    { id: 'shopkeeper', name: '阿栗', role: '店主', color: '#e5a17e', location: 'shop', visible: false },
    { id: 'reporter', name: '小满', role: '记者', color: '#d0a2d3', location: 'square', visible: true },
  ];
  return <div className="map-wrap">
    <canvas ref={ref} width={480} height={285} className="town-canvas" aria-label="松果镇像素地图：西边是杂货铺，中间是庆典广场，东边是舞台" role="img" />
    <div className="map-weather"><span className="sun">☀</span> 秋日 · 微风 <span className="weather-divider" /> 15:45</div>
    <div className="map-coordinates">PINECONE TOWN <span>·</span> 01 / 秋</div>
    {Object.entries(rooms).map(([id, name]) => <button key={id} className={`place-label place-${id} ${game?.room.id === id ? 'here' : ''}`} onClick={() => onMove(id)} disabled={busy || !game || game.status !== 'playing' || game.room.id === id} title={game?.room.id === id ? '你在这里' : `前往${name}`}><MapPin size={12} />{name}{game?.room.id === id ? <span className="here-dot" /> : <ArrowUpRight size={12} />}</button>)}
    {people.filter(p => p.location && bases[p.location]).map(person => {
      const base = bases[person.location!], offset = offsets[person.id];
      const bubble = game?.events.filter(e => e.kind === 'speak' && e.actor_id === person.id && e.turn >= game.turn - 1).at(-1);
      return <div key={person.id} className={`map-character ${person.visible ? '' : 'last-seen'} ${person.id === 'player' ? 'is-player' : ''} ${selected === person.id ? 'is-selected' : ''}`} style={{ left: `${base[0] + offset[0]}%`, top: `${base[1] + offset[1]}%` }}>
        {bubble && person.visible && selected === person.id && <div className="speech-bubble">{bubble.details.message}</div>}
        <button className="character-button" aria-label={`查看${person.name}${!person.visible ? '（上次看见的位置）' : ''}`} onClick={() => onSelect(person.id)}><PixelPerson id={person.id} color={person.color} size={32} /></button>
        <span className="character-name">{person.name}{person.id === 'player' && <span> YOU</span>}</span>
      </div>;
    })}
    <div className="map-hint"><Footprints size={13} /><span>点击地点移动 · 点击角色交谈</span><span className="map-hint-note">淡色角色为上次所见</span></div>
    <div className="map-compass"><span>N</span><div>✧</div></div>
  </div>;
}
