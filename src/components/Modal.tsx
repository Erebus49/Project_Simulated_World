import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={labelId} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-heading"><div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2 id={labelId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭对话框"><X size={20} aria-hidden="true" /></button></div>
    {children}
  </dialog>;
}
