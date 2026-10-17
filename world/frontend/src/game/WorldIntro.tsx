import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Footprints, Moon } from 'lucide-react';

const pages = [
  { icon: Moon, number: '01', title: '庆典结束了，你却没能离开。',
    body: '松果镇每年都会举办秋日庆典。你是留下收尾的志愿者，忙完时却发现南门锁住了，广播还在喊你的名字。',
    note: '今晚还留着镇长、店主、守夜人和记者。他们各有心事，说的话也不一定可靠。' },
  { icon: Footprints, number: '02', title: '先走走，再问问。',
    body: '按 WASD 或方向键移动，草地也能走。建筑、树木和石井需要绕开。靠近居民或调查点，按 E 就能交谈、查看东西。',
    note: '走路不消耗回合。靠近能听见居民自语，按 E 开始交谈时对方才停下。目标重叠时按 Q 切换；手机可点名字或切换按钮。' },
  { icon: BookOpen, number: '03', title: '你的目标很简单：安全离镇。',
    body: '有人改过留镇须知。先去广场公告栏，比较线索和居民的说法；按 J 随时查看手记。别急着把每一条规则都照做。',
    note: '调查、操作和交谈会消耗回合；等待模型回复不会扣时间。发生三次异常或回合用尽，这一夜就结束了。' },
];

export default function WorldIntro({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const current = pages[page], Icon = current.icon;
  return <div className="world-intro"><div className="intro-progress" aria-label={`介绍第 ${page + 1} 步，共三步`}>{pages.map((entry, i) => <span key={entry.number} className={i <= page ? 'active' : ''} />)}</div><div className="intro-scene"><Icon size={42} strokeWidth={1} /><span>松果镇 · 第一夜</span></div><section><small>{current.number} / 初来乍到</small><h3>{current.title}</h3><p>{current.body}</p><aside>{current.note}</aside></section><footer><button className="intro-skip" onClick={onDone}>直接开始</button><div>{page > 0 && <button className="intro-back" onClick={() => setPage(value => value - 1)}><ArrowLeft size={15} />上一步</button>}<button className="night-primary" onClick={() => page < 2 ? setPage(value => value + 1) : onDone()}>{page < 2 ? '下一步' : '开始探索'}<ArrowRight size={15} /></button></div></footer></div>;
}
