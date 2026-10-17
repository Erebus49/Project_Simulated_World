import type { ActorId } from '../../shared/types';

const palettes: Record<ActorId, [string, string, string]> = {
  lin: ['#5c8c80', '#1d3c3a', '#bcb3a0'], mora: ['#9b7a98', '#49374d', '#d9bfa8'],
  roan: ['#ac895a', '#4b3a2f', '#c3a07d'], eira: ['#728fb4', '#283e55', '#d7bda8'], silas: ['#8b966d', '#3b4535', '#c4aa84'],
};
export function Portrait({ id, className = '' }: { id: ActorId; className?: string }) {
  const [bg, coat, skin] = palettes[id];
  return <svg className={`portrait ${className}`} viewBox="0 0 100 112" aria-hidden="true">
    <rect width="100" height="112" rx="7" fill={bg} />
    <path d="M0 78 18 19 48 5 83 29 100 89v23H0Z" fill={coat} opacity=".28" />
    <circle cx="50" cy="47" r="35" fill="none" stroke="#f4e6ca" strokeOpacity=".15" />
    <path d="M9 112q2-36 29-39h24q27 4 29 39" fill={coat} />
    <path d="m38 74 12 20 12-20-3-15H41Z" fill={skin} />
    <path d="M29 39q0-25 22-25 23 0 23 26l-5 24q-8 17-19 17T32 63Z" fill={skin} />
    {id === 'lin' ? <><path d="M26 49Q17 13 47 11q31-2 31 28L61 25 48 43l-8-9-8 27Z" fill="#202b2a" /><path d="m68 41 7 28-9 13 3-30" fill="#202b2a" /><path d="m21 91 17-14 12 22-4 13H32Z" fill="#79948a" /></> : null}
    {id === 'mora' ? <><path d="M25 52Q18 12 50 11q36 0 27 48l-8-20-8-13-26 12-4 27Z" fill="#d3c7bc" /><path d="M24 44 18 83l15-6 3-30M71 44l12 41-17-8" fill="#d3c7bc" /><path d="m34 83 16 14 16-14-7 29H42Z" fill="#b3a79c" /></> : null}
    {id === 'roan' ? <><path d="M28 40 22 26l15-2-2-13 16 6L65 9l7 14 9 6-10 17-6-17-16 5-10-4-6 22Z" fill="#372c26" /><path d="m29 63 9 10 15 6 15-14-4 14-14 6-14-10Z" fill="#49392e" /><path d="m18 94 20-17 5 35H27Z" fill="#aa8050" /><path d="m61 79 15 10-14 11-8-5Z" fill="#b58e56" /></> : null}
    {id === 'eira' ? <><path d="M26 61Q16 11 50 9q36 2 25 51l-8-29-18 3-12-8-6 41-4 17-10-3Z" fill="#2b3340" /><path d="m68 40 7 45-9-5-6-12Z" fill="#2b3340" /><path d="m25 86 15-9 11 21 11-21 16 11-6 24H29Z" fill="#527087" /></> : null}
    {id === 'silas' ? <><path d="M26 46 25 30q3-20 23-19 26-1 29 23l-5 17-5-21-15 7-15-5-7 20Z" fill="#b5ad9a" /><path d="m30 57 7 7 13 1 13-1 8-8-4 21-17 13-17-13Z" fill="#aaa18e" /><path d="m38 81 12 13 12-13 9 31H29Z" fill="#a99b7b" /><path d="M47 95h6v17h-6z" fill="#574e3c" /></> : null}
    <path d="M37 49h6m14 0h6" stroke="#453e38" strokeWidth="2" strokeLinecap="round" />
    <path d="m49 51-2 9 5 1m-8 8q6 3 12-1" stroke="#806758" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M0 108h100v4H0z" fill={coat} opacity=".4" />
  </svg>;
}
