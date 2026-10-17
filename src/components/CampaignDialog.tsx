import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpFromLine, ChevronRight, LoaderCircle, Plus } from 'lucide-react';
import type { WorldSummary, WorldView } from '../../shared/types';
import { request } from '../api';
import { Modal } from './Modal';

export function CampaignDialog({ worlds, currentId, onLoad, onClose }: { worlds: WorldSummary[]; currentId: string; onLoad: (w: WorldView) => void; onClose: () => void }) {
  const [title, setTitle] = useState('第七声钟鸣');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  async function run(task: () => Promise<WorldView>) { setBusy(true); setError(''); try { onLoad(await task()); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function create(e: FormEvent) { e.preventDefault(); await run(() => request<WorldView>('/api/worlds', { method: 'POST', body: JSON.stringify({ title }) })); }
  return <Modal title="每个故事，都有一个开始" eyebrow="YOUR CHRONICLES" onClose={onClose}>
    <form onSubmit={create} className="form-stack"><label>为这段冒险命名<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required /></label><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}开启新冒险</button></form>
    <h3 className="section-label archive-label">已保存的故事</h3>
    <div className="archive-list">{worlds.map(w => <button key={w.id} disabled={busy} className={w.id === currentId ? 'current' : ''} onClick={() => run(() => request<WorldView>(`/api/worlds/${w.id}?viewer=director`))}><span><strong>{w.title}</strong><small>第 {w.round} 轮 · {w.status === 'active' ? '故事仍在继续' : w.status === 'saved' ? '雾港幸存' : '迷失于雾中'}{w.id === currentId ? ' · 当前' : ''}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</div>
    <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="选择完整战役存档" onChange={e => { const file = e.target.files?.[0]; if (!file) return; run(async () => { if (file.size > 2 * 1024 * 1024) throw new Error('存档文件不能超过 2MB。'); let data: unknown; try { data = JSON.parse(await file.text()); } catch { throw new Error('请选择有效的 JSON 存档文件。'); } return request<WorldView>('/api/worlds/import', { method: 'POST', body: JSON.stringify(data) }); }); e.target.value = ''; }} />
    <button className="text-button import-button" disabled={busy} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={15} aria-hidden="true" />导入完整存档</button>
    <p className="field-hint">每一轮自动保存。导入会创建副本，保留原有故事。</p>
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </Modal>;
}
