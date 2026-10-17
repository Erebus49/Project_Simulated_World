import { useState, type FormEvent } from 'react';
import { Brain, Heart, LockKeyhole, Pencil, UserRound, Eye, LoaderCircle } from 'lucide-react';
import type { ActorView, WorldView } from '../../shared/types';
import { placeById } from '../../shared/scenario';
import { request } from '../api';
import { Modal } from './Modal';
import { Portrait } from './Portrait';

const attributeNames = { investigation: '调查', persuasion: '交涉', resolve: '意志', agility: '敏捷' };
const behaviorNames = { curious: '追寻真相', protective: '保护他人', ambitious: '权衡利益', guarded: '谨慎守护', sociable: '主动联结' };
export function ProfileDialog({ actor, world, onClose, onUpdate, onView, onControl, disabled }: { actor: ActorView; world: WorldView; onClose: () => void; onUpdate: (w: WorldView) => void; onView: () => void; onControl: () => void; disabled: boolean }) {
  const [tab, setTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ personality: actor.personality, publicGoal: actor.publicGoal, privateGoal: actor.privateGoal || '', behavior: actor.behavior });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const readable = world.viewer === 'director' || world.viewer === actor.id;
  const known = world.clues.filter(c => actor.knownClues.includes(c.id));
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try { onUpdate(await request<WorldView>(`/api/worlds/${world.id}/actors/${actor.id}?viewer=${world.viewer}`, { method: 'PATCH', body: JSON.stringify({ revision: world.revision, profile }) })); setEditing(false); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  return <Modal title={actor.name} eyebrow={`${actor.role === 'PL' ? 'PLAYER CHARACTER' : 'NON-PLAYER CHARACTER'} · 人物档案`} onClose={onClose}>
    <div className="profile-hero"><Portrait id={actor.id} /><div><p className="profile-subtitle">{actor.subtitle}</p><p className="muted">{actor.locationId ? placeById[actor.locationId].name : '不在你的视野中'}</p><div className="profile-vitals"><span><Heart size={14} aria-hidden="true" />{actor.hp}/{actor.maxHp}</span><span><Brain size={14} aria-hidden="true" />{actor.sanity}/{actor.maxSanity}</span></div></div></div>
    <div className="tabs" role="tablist" aria-label="人物档案内容">{[['profile', '人物设定'], ['memories', `记忆 ${actor.memories.length}`], ['clues', `线索 ${known.length}`]].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setEditing(false); }} className={tab === id ? 'active' : ''}>{label}</button>)}</div>
    <div className="profile-body" role="tabpanel">
      {tab === 'profile' && !editing ? <>
        <div className="attribute-grid">{Object.entries(actor.attributes).map(([key, value]) => <div key={key}><span>{attributeNames[key as keyof typeof attributeNames]}</span><strong>+{value}</strong></div>)}</div>
        <div className="profile-section"><h3>性格与行动</h3><p>{actor.personality}</p><span className="small-badge">{behaviorNames[actor.behavior]}</span></div>
        {readable ? <div className="profile-section"><h3>来时的故事</h3><p>{actor.backstory}</p></div> : null}
        <div className="profile-section"><h3>公开目标</h3><p>{actor.publicGoal}</p></div>
        {readable ? <><div className="profile-section private-section"><h3><LockKeyhole size={14} aria-hidden="true" />个人目标</h3><p>{actor.privateGoal}</p></div><div className="profile-section private-section"><h3>不曾说出的秘密</h3><p>{actor.secret}</p></div><div className="profile-section"><h3>与他人的信任</h3><div className="relationship-list">{world.actors.filter(a => a.id !== actor.id).map(a => <span key={a.id}>{a.name}<strong>{(actor.relationships?.[a.id] ?? 0) > 0 ? '+' : ''}{actor.relationships?.[a.id] ?? 0}</strong></span>)}</div></div></> : <p className="private-notice"><LockKeyhole size={15} aria-hidden="true" />这是另一名角色的私有经历。你可以通过交谈了解对方。</p>}
        {readable ? <button className="text-button" onClick={() => setEditing(true)} disabled={disabled}><Pencil size={14} aria-hidden="true" />编辑人物设定</button> : null}
      </> : null}
      {tab === 'profile' && editing ? <form className="form-stack" onSubmit={save}>
        <label>性格<textarea value={profile.personality} maxLength={500} required onChange={e => setProfile({ ...profile, personality: e.target.value })} rows={3} /></label>
        <label>公开目标<input value={profile.publicGoal} maxLength={300} required onChange={e => setProfile({ ...profile, publicGoal: e.target.value })} /></label>
        <label>个人目标<textarea value={profile.privateGoal} maxLength={500} required onChange={e => setProfile({ ...profile, privateGoal: e.target.value })} rows={3} /></label>
        <label>行动倾向<select value={profile.behavior} onChange={e => setProfile({ ...profile, behavior: e.target.value as ActorView['behavior'] })}>{Object.entries(behaviorNames).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
        <p className="field-hint">修改会影响接下来的决策。模型模式参考全部文字设定，本地演示主要参考行动倾向。</p>
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>取消</button><button className="button primary" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : null}保存人物卡</button></div>
      </form> : null}
      {tab === 'memories' ? readable ? actor.memories.length ? <ol className="memory-list">{[...actor.memories].reverse().map((m, index) => <li key={`${m.id}-${index}`}><span>第 {m.round} 轮 · {placeById[m.locationId].name}</span><p>{m.text}</p></li>)}</ol> : <p className="empty-copy">故事才刚刚开始，还没有新的记忆。</p> : <p className="private-notice"><LockKeyhole size={15} aria-hidden="true" />你无法直接读取其他角色的记忆。</p> : null}
      {tab === 'clues' ? known.length ? <div className="clue-list">{known.map(c => <article className="clue-card" key={c.id}><span className="eyebrow">{placeById[c.locationId].name}</span><h3>{c.title}</h3><p>{c.text}</p></article>)}</div> : <p className="empty-copy">{readable ? '还未掌握线索。探索地点，或听一听他人的故事。' : '尚未向你公开线索。'}</p> : null}
    </div>
    <div className="modal-actions profile-actions"><button className="button secondary" onClick={onView} disabled={disabled}><Eye size={16} aria-hidden="true" />以 TA 的视角看世界</button><button className="button primary" onClick={onControl} disabled={disabled || world.status !== 'active'}><UserRound size={16} aria-hidden="true" />接管角色</button></div>
  </Modal>;
}
