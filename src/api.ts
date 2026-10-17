import type { TurnProgress } from '../shared/types';

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试。');
  return data as T;
}
export async function streamTurn(url: string, body: unknown, receive: (event: TurnProgress) => void) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) { const error = await response.json(); throw new Error(error.error || '无法推进这一轮。'); }
  if (!response.body) throw new Error('浏览器不支持读取故事流，请换一个现代浏览器。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', completed = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as TurnProgress;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'complete') completed = true;
    receive(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      lines.forEach(consume);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error('故事流意外中断，请刷新以确认存档状态。');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function download(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('导出失败，请稍后重试。');
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
