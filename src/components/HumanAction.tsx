import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CornerUpLeft, LoaderCircle } from 'lucide-react';
import type { Action, ActionKind, ActorId, WorldView } from '../../shared/types';
import { placeById } from '../../shared/scenario';

const names: Record<ActionKind, string> = { move: '前往别处', investigate: '调查场景', talk: '与人交谈', share: '分享线索', calm: '安抚同伴', rest: '稍作休整', seal: '尝试封印' };
export function HumanAction({ world, actorId, busy, onSubmit, onRelease }: { world: WorldView; actorId: ActorId; busy: boolean; onSubmit: (a: Action) => void; onRelease: () => void }) {
  const actor = world.actors.find(a => a.id === actorId)!;
  const [kind, setKind] = useState<ActionKind>('move');
  const [target, setTarget] = useState('');
  const [clueId, setClueId] = useState('');
  const [speech, setSpeech] = useState('');
  const local = world.actors.filter(a => a.id !== actorId && a.locationId === actor.locationId);
  const targets = kind === 'move' ? placeById[actor.locationId!].neighbors.map(id => ({ id, name: placeById[id].name })) : ['talk', 'share', 'calm'].includes(kind) ? local.map(a => ({ id: a.id, name: a.name })) : [];
  const needsTarget = ['move', 'talk', 'share', 'calm'].includes(kind);
  const known = world.clues.filter(c => actor.knownClues.includes(c.id));
  const validTarget = targets.some(t => t.id === target) ? target : targets[0]?.id ?? '';
  const validClue = known.some(c => c.id === clueId) ? clueId : known[0]?.id ?? '';
  useEffect(() => { setSpeech(''); }, [world.round]);
  function submit(e: FormEvent) { e.preventDefault(); onSubmit({ kind, target: needsTarget ? validTarget : undefined, clueId: kind === 'share' ? validClue : undefined, speech }); }
  return <form className="human-action" onSubmit={submit}>
    <div className="human-action-heading"><span><i className="live-dot" />现在，你是{actor.name}</span><button type="button" className="text-button" disabled={busy} onClick={onRelease}><CornerUpLeft size={13} aria-hidden="true" />交还角色</button></div>
    <div className="action-selects"><label><span className="sr-only">选择行动</span><select aria-label="选择行动" value={kind} onChange={e => setKind(e.target.value as ActionKind)} disabled={busy}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{needsTarget ? <label><span className="sr-only">行动目标</span><select aria-label="行动目标" value={validTarget} onChange={e => setTarget(e.target.value)} disabled={busy || !targets.length}>{targets.length ? targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>) : <option value="">当前场景没有其他人</option>}</select></label> : null}</div>
    {kind === 'share' ? <label><span className="sr-only">要分享的线索</span><select aria-label="要分享的线索" value={validClue} onChange={e => setClueId(e.target.value)} disabled={busy || !known.length}>{known.length ? known.map(c => <option key={c.id} value={c.id}>{c.title}</option>) : <option value="">你还未掌握线索</option>}</select></label> : null}
    <label><span className="sr-only">角色台词</span><textarea aria-label="角色台词" rows={2} placeholder="想说些什么？让你的角色开口……（可选）" value={speech} maxLength={400} onChange={e => setSpeech(e.target.value)} disabled={busy} /></label>
    <div className="human-submit"><span className="field-hint">其他角色将同时做出自己的选择</span><button className="button primary" disabled={busy || (needsTarget && !validTarget) || (kind === 'share' && !validClue)}>{busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}提交行动</button></div>
  </form>;
}
