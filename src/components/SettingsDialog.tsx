import { useState, type FormEvent } from 'react';
import { Cpu, KeyRound, LoaderCircle, Sprout } from 'lucide-react';
import type { SettingsView } from '../../shared/types';
import { request } from '../api';
import { Modal } from './Modal';

export function SettingsDialog({ settings, onSave, onClose }: { settings: SettingsView; onSave: (s: SettingsView) => void; onClose: () => void }) {
  const [mode, setMode] = useState(settings.mode);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const result = await request<SettingsView>('/api/settings', { method: 'PUT', body: JSON.stringify({ mode, baseUrl, model, apiKey, clearApiKey }) });
      onSave(result); onClose();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  return <Modal title="让故事以你的方式发生" eyebrow="THE STORY ENGINE" onClose={onClose}>
    <p className="modal-intro">选择本地演示，或接入模型，让每个角色拥有真正独立的语言决策。</p>
    <form onSubmit={save} className="form-stack">
      <fieldset className="mode-options"><legend className="sr-only">叙事模式</legend>
        <label className={`mode-option ${mode === 'demo' ? 'chosen' : ''}`}><input type="radio" name="mode" value="demo" checked={mode === 'demo'} onChange={() => setMode('demo')} /><Sprout size={23} aria-hidden="true" /><span><strong>本地演示</strong><small>无需密钥。按人物倾向、记忆与已知线索做出选择；使用本地叙事。</small></span></label>
        <label className={`mode-option ${mode === 'llm' ? 'chosen' : ''}`}><input type="radio" name="mode" value="llm" checked={mode === 'llm'} onChange={() => setMode('llm')} /><Cpu size={23} aria-hidden="true" /><span><strong>连接语言模型</strong><small>五个角色分别决策，主持人负责叙事。每轮通常调用六次。</small></span></label>
      </fieldset>
      <div className={mode === 'demo' ? 'settings-fields muted-fields' : 'settings-fields'}>
        <label>API 地址<input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} required placeholder="https://api.deepseek.com/v1" /></label>
        <p className="field-hint">支持兼容 Chat Completions 的服务，也可以填写本地模型的 /v1 地址。</p>
        <label>模型名称<input value={model} onChange={e => setModel(e.target.value)} required placeholder="deepseek-chat" maxLength={150} /></label>
        <label><span><KeyRound size={14} aria-hidden="true" /> API Key</span><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" placeholder={settings.hasApiKey ? '已保存密钥，留空表示不修改' : '填写服务商提供的密钥'} /></label>
        <p className="field-hint">密钥只保存在本机服务端，不会返回到浏览器或写入战役导出文件。</p>
        {settings.hasApiKey ? <label className="checkbox-line"><input type="checkbox" checked={clearApiKey} onChange={e => setClearApiKey(e.target.checked)} />清除已保存的密钥</label> : null}
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>暂时保持</button><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}保存设置</button></div>
    </form>
  </Modal>;
}
