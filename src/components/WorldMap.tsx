import { placeById, places } from '../../shared/scenario';
import type { ActorView, LocationId } from '../../shared/types';

function Building({ kind }: { kind: LocationId }) {
  if (kind === 'lighthouse') return <g><path d="m-45-40 45-12 45 12-45-2Z" fill="#dab77b" opacity=".12" /><path d="m-10 22 4-62H7l5 62Z" fill="#7e9b94" stroke="#bbccc1" /><path d="M-14-40h29l-7-10H-6Z" fill="#294b4c" stroke="#95aca2" /><path d="M-8-39v13H9v-13" fill="#e7d09e" stroke="#bbccc1" /><path d="M-15-25h31M-17 22h34" stroke="#abc1b3" strokeWidth="2" /><path d="M-2 22V9h7v13" fill="#22383c" /></g>;
  if (kind === 'archive') return <g><path d="M-29-16 0-34l30 18Z" fill="#365656" stroke="#83a098" /><path d="M-24-15h49v35h-49Z" fill="#294448" stroke="#7f9a93" /><path d="M-18-10v28M-7-10v28M7-10v28M19-10v28M-28 22h57M-31 26h63" stroke="#829b8f" strokeWidth="3" /><path d="M-4 7h9v14h-9Z" fill="#d5bd82" opacity=".7" /></g>;
  if (kind === 'tavern') return <g><path d="M-27-8 0-30l30 24" fill="#44665b" stroke="#a6b3a0" /><path d="M-24-7h48v29h-48Z" fill="#476359" stroke="#99ab96" /><path d="M11-20v-17h7v22" fill="#738b76" /><path d="M-16 1h9v10h-9ZM9 1h9v10H9Z" fill="#d7b56d" /><path d="M-3 6h9v16h-9" fill="#253d3d" /><path d="M-30 22h59M-25-2h49" stroke="#9aae98" /><path d="M27-5h12v14H27Z" fill="#a58e63" /></g>;
  if (kind === 'docks') return <g><path d="m-37 15 69 5M-35 24l70 4M-23 8l-3 27M-5 11l-3 27M15 14l-4 26" stroke="#7d8f7e" strokeWidth="3" /><path d="m-4-1 34 4-7 10H1Z" fill="#637e76" stroke="#a0b0a0" /><path d="M12 3v-38L-5-7h17M15-31 31-4H15" stroke="#b3bba5" fill="#789185" /></g>;
  return <g><path d="M-15 25v-50l15-11 15 11v50" fill="#4b6b64" stroke="#91aaa0" /><path d="m-19-24 19-18 19 18Z" fill="#344f4c" stroke="#8ba399" /><circle cy="-13" r="8" fill="#d8c18d" stroke="#b0bba4" /><path d="M0-19v6l4 3M-3 26V11h7v15M-21 26h42" stroke="#294b48" strokeWidth="2" /></g>;
}
export function WorldMap({ actors, selected, onSelect }: { actors: ActorView[]; selected: LocationId; onSelect: (id: LocationId) => void }) {
  const edges = places.flatMap(p => p.neighbors.filter(n => p.id < n).map(n => [p, placeById[n]]));
  return <svg className="world-map" viewBox="0 0 660 430" role="group" aria-label="雾港地图，选择地点查看详情">
    <defs>
      <radialGradient id="mapLand"><stop stopColor="#28443d" /><stop offset="1" stopColor="#192e2d" /></radialGradient>
      <radialGradient id="mapSea"><stop stopColor="#254347" /><stop offset="1" stopColor="#142b31" /></radialGradient>
      <filter id="mapGlow"><feGaussianBlur stdDeviation="10" /></filter>
      <pattern id="mapGrain" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".5" fill="#d6e1c2" opacity=".07" /></pattern>
    </defs>
    <rect width="660" height="430" fill="url(#mapSea)" />
    <path d="M0 0h440q-12 30 20 48t68 48q55 29 29 71t-23 75q27 32 22 59t-57 41q-45 11-21 51t-10 37H0Z" fill="url(#mapLand)" stroke="#8ea797" strokeOpacity=".22" />
    <path d="M443 0q-10 37 23 58t72 48q52 33 25 72t-24 61q30 41 24 66t-60 45q-31 8-20 40t-8 40" fill="none" stroke="#8ca9a5" strokeOpacity=".09" strokeWidth="8" />
    <path d="M58 0Q3 78 74 129T29 262t62 168M93 0Q37 70 109 125T64 261t63 169M125 0Q72 68 142 121T98 263t60 167M160 0Q110 71 175 119t-43 142 60 169" fill="none" stroke="#94b49b" strokeOpacity=".05" />
    <path d="M207 0q-22 59 59 91t91 107 13 122 56 110M241 0q-22 50 59 82t91 107 12 122 62 119" fill="none" stroke="#94b49b" strokeOpacity=".035" />
    <rect width="660" height="430" fill="url(#mapGrain)" />
    {[[60, 82], [90, 186], [226, 56], [249, 350], [382, 105], [375, 337], [74, 370]].map(([x, y], i) => <g key={i} opacity=".3" fill="#3e5c4e" stroke="#648375" strokeWidth=".6"><path d={`m${x} ${y} 7-21 7 21h-5l4 9h-12l4-9Z`} /><path d={`M${x + 7} ${y + 9}v6`} /></g>)}
    {edges.map(([a, b]) => <path key={`${a.id}-${b.id}`} d={`M${a.x},${a.y + 15} Q${(a.x + b.x) / 2 + 15},${(a.y + b.y) / 2 + 25} ${b.x},${b.y + 15}`} fill="none" stroke="#b5c5a1" strokeWidth="1.4" strokeOpacity=".25" strokeDasharray="3 5" />)}
    <g opacity=".2" stroke="#b0c9bf" fill="none"><path d="M585 200h33m-43 8h19m15 53h24m-52 9h21M552 373h38m-11 9h32" /></g>
    <g transform="translate(605 59)" stroke="#a9b8a0" fill="none" opacity=".55"><path d="M0-18V18M-18 0h36M-11-11l22 22m0-22-22 22" strokeWidth=".7" /><path d="m0-15 4 15-4 15-4-15Z" /><text x="0" y="-24" textAnchor="middle" fill="#bec7b5" stroke="none" fontSize="9" fontFamily="Georgia">N</text></g>
    {places.map(p => <g key={p.id} transform={`translate(${p.x} ${p.y})`} className={`map-location ${selected === p.id ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`${p.name}，${actors.filter(a => a.locationId === p.id).length}人在场`} aria-pressed={selected === p.id} onClick={() => onSelect(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}>
      <title>{p.name}：{p.description}</title>
      <circle className="map-target" r="49" fill="transparent" />
      {selected === p.id ? <><ellipse cy="19" rx="38" ry="18" fill="#c2aa68" opacity=".14" filter="url(#mapGlow)" /><ellipse cy="19" rx="40" ry="20" fill="none" stroke="#ccaf72" strokeOpacity=".5" strokeDasharray="2 5" /></> : null}
      <Building kind={p.id} />
      <rect x="-40" y="35" width="80" height="22" rx="4" fill="#152b2d" opacity=".92" />
      <text y="50" textAnchor="middle" fontSize="12" fill={selected === p.id ? '#e4c68d' : '#c0cec1'} fontFamily="inherit">{p.name}</text>
      {actors.filter(a => a.locationId === p.id).map((actor, i, list) => <g key={actor.id} transform={`translate(${(i - (list.length - 1) / 2) * 20} 72)`}><circle r="9" fill="#182c2d" stroke={actor.color} strokeWidth="1.5" /><text y="3.5" textAnchor="middle" fill={actor.color} fontSize="9">{actor.name.slice(0, 1)}</text></g>)}
    </g>)}
    <g fontSize="9" fill="#b1c2b5" opacity=".45" letterSpacing="3" fontFamily="Georgia"><text x="39" y="40">THE PORT OF FOGBOUND</text><text x="551" y="409">MIST SEA</text></g>
  </svg>;
}
