import { allActorIds, cocSkillNames, investigatorIds, type Actor, type ActorId, type Clue, type CocSkill, type Place, type World } from './types.js';

export const killerPlaces: Place[] = [
  { id: 'hargrave-home', name: '哈格雷夫的家', x: 170, y: 230, neighbors: ['scrapyard', 'gove-motel', 'crash-site'], description: '退休太空医学专家的乡间小屋。客厅还亮着灯，地下室堆着旧设备，街对面传来发电机的轰鸣。', flavor: '门廊上的咖啡尚温，东方传来了一声巨响。' },
  { id: 'scrapyard', name: '巴迪废品场', x: 70, y: 110, neighbors: ['hargrave-home', 'gove-motel'], description: '铁丝网里堆着报废车辆。三台起重机与独立发电机整夜轰鸣，巴迪不欢迎不请自来的客人。', flavor: '柴油味、铁锈，以及始终没有停下的机器。' },
  { id: 'crash-site', name: '航天飞机迫降点', x: 490, y: 100, neighbors: ['hargrave-home', 'command-post', 'lomax-farm'], description: '亚特兰蒂斯号横卧在州公路与麦田之间。前起落架已经断裂，舱门旁留着一道长长的拖痕。', flavor: '新闻声称它仍在轨道上。它却就在这里。' },
  { id: 'gove-motel', name: '戈夫镇汽车旅馆', x: 280, y: 330, neighbors: ['hargrave-home', 'scrapyard', 'command-post', 'checkpoint'], description: '小镇临时的隔离安置点。收音机反复播报炭疽警报，空荡的房间里有人彻夜咳嗽。', flavor: '一盏一盏亮着的窗户，正在相继熄灭。' },
  { id: 'command-post', name: 'NASA 联合指挥部', x: 430, y: 270, neighbors: ['gove-motel', 'crash-site', 'checkpoint', 'lomax-farm'], description: '帐篷、拖车和探照灯组成的临时营地。哈德森博士需要可检验的证据，德拉科将军需要秩序。', flavor: '他们拥有资源，却也在害怕自己无法解释的东西。' },
  { id: 'lomax-farm', name: '洛马克斯废弃农场', x: 585, y: 210, neighbors: ['crash-site', 'command-post'], description: '倒塌的谷仓旁有一口深井。这里的麦穗长得过于茂盛，静风中仍在缓缓摆动。', flavor: '你听见井口传来了水声，却没有风。' },
  { id: 'checkpoint', name: '70 号公路检查站', x: 230, y: 65, neighbors: ['gove-motel', 'command-post'], description: '军用车辆堵住了出口。防化服后的士兵反复强调：隔离命令没有撤销，任何人不得离开。', flavor: '路的另一端，是仍然正常运转的世界。' },
];

export const killerClues: Clue[] = [
  { id: 'home-geiger', title: '地下室的盖革计数器', locationId: 'hargrave-home', dc: 45, searchLabel: '检查地下室的旧仪器', skill: 'electrical', text: '防辐射掩体的架子上有一台还能工作的盖革计数器。你校准了它，可以用辐射读数追踪异常。掩体也是一处临时避难所。' },
  { id: 'broadcast', title: '自相矛盾的新闻', locationId: 'hargrave-home', dc: 65, searchLabel: '收听短波收音机', skill: 'listen', text: '当地电台报告堪萨斯出现音爆与迫降；NASA 的通稿却仍声称亚特兰蒂斯号按计划在轨运行。此前的直播记录里，飞船曾穿过一团发光的云。' },
  { id: 'crash-medical', title: '不是炭疽，也不是辐射病', locationId: 'crash-site', dc: 50, searchLabel: '检查舱门旁的宇航员', skill: 'medicine', text: '麦卡菲上校极度衰弱，组织脱水崩解。他的症状不符合炭疽或普通辐射损伤。组织残留着一种迅速消退的怪异微光。你保留了密封的组织样本。' },
  { id: 'cargo-hole', title: '没有高温的熔洞', locationId: 'crash-site', dc: 50, searchLabel: '检查航天飞机的货舱', skill: 'mechanical', text: '货舱地板有一个从内向外形成的洞，边缘像熔化过，却没有应有的热损伤。地面留着破碎的虹彩球壳。常规的火灾解释不了它们。' },
  { id: 'night-detour', title: '那道光绕过了院子', locationId: 'hargrave-home', dc: 50, searchLabel: '从门廊观察夜间麦田', skill: 'spotHidden', nightOnly: true, minRound: 3, text: '苍白的光从迫降点方向逼近，却绕开了哈格雷夫的家与街对面的废品场。皮特把这一切归功于祈祷；而废品场的发电机也始终没有停转。' },
  { id: 'yard-magnets', title: '三台持续通电的电磁铁', locationId: 'scrapyard', dc: 50, searchLabel: '检查起重机与发电机', skill: 'heavyMachinery', text: '三台起重机各挂着强力电磁铁，由独立发电机供电。其中两台车架已坏，但三个电磁铁都能工作。巴迪只是为了报复邻居，才让它们整夜通电。' },
  { id: 'magnetic-pattern', title: '可重复的磁场假说', locationId: 'scrapyard', dc: 55, searchLabel: '比较发电机与异常的活动轨迹', skill: 'science', requires: ['yard-magnets', 'night-detour'], text: '异常绕行的边界与强磁场覆盖区吻合。三组电磁铁有望围出一个封闭区域；弱小的家用电流不够。要验证假说，你需要设备、配合与正确的布置。' },
  { id: 'motel-victim', title: '镇上的新病例', locationId: 'gove-motel', dc: 50, searchLabel: '检查旅馆的隔离房间', skill: 'medicine', minRound: 3, text: '旅馆受害者与宇航员具有相同的脱水、衰弱症状。一名幸存者记得，窗外的苍白微光进入房间后，自己的生命仿佛被抽走。常规治疗没有解决病因。' },
  { id: 'archive-magnetism', title: '阿卡姆旧案的磁性陨石', locationId: 'command-post', dc: 55, searchLabel: '借用专线检索密斯卡托尼克档案', skill: 'library', requires: ['crash-medical'], text: '旧档案记载了一次相似事件：高磁性陨石、光谱之外的微光、干枯的受害者，以及无风摇动的植物。光并非疾病的附带现象。强磁场可能是一条值得验证的方向。' },
  { id: 'nasa-map', title: '辐射测绘等高线', locationId: 'command-post', dc: 55, searchLabel: '分析 NASA 辐射测绘图', skill: 'science', requires: ['crash-medical'], text: 'NASA 的等高线与现场读数都指向迫降点西侧的洛马克斯废弃农场。异常在白天收敛，夜里活动；日光会妨碍它，但没有证据表明照明能消灭它。' },
  { id: 'radiation-trail', title: '通向老井的辐射轨迹', locationId: 'lomax-farm', dc: 55, searchLabel: '用计数器测量农场', skill: 'spotHidden', requires: ['home-geiger'], text: '读数在旧井附近急剧升高，与航天飞机旁曾出现的异常一致。井周植物畸长、颜色反常。无论白天还是夜里，都不应徒手接近井水。' },
  { id: 'well-brood', title: '井底不止一个生命', locationId: 'lomax-farm', dc: 50, searchLabel: '从安全距离观察井底', skill: 'spotHidden', requires: ['nasa-map'], text: '远距观察与探针影像显示：井底黑泥中有脆弱的虹彩球体，还有已经孵化的胶质幼体。母体与后代必须分别处理。防化服并不能可靠阻挡幼体，徒手取样极其危险。' },
  { id: 'patrol-report', title: '枪声之后', locationId: 'checkpoint', dc: 60, searchLabel: '听取巡逻队无线电', skill: 'listen', minRound: 3, text: '士兵曾向一栋出现怪光的房子开火，枪弹没有阻止更多受害者出现。军方也未弄清敌人的性质。提供有说服力的证据，比空泛地谈论怪物更有用。' },
];

const defaultSkills: Record<CocSkill, number> = { spotHidden: 45, listen: 45, medicine: 15, library: 35, electrical: 20, mechanical: 25, heavyMachinery: 15, persuade: 45, psychology: 30, stealth: 35, science: 20, firstAid: 35 };
export function createKillerActors(): Actor[] {
  const definitions: { id: ActorId; name: string; subtitle: string; role: Actor['role']; locationId: Actor['locationId']; color: string; personality: string; backstory: string; publicGoal: string; privateGoal: string; secret: string; behavior: Actor['behavior']; skills: Partial<Record<CocSkill, number>>; knownClues?: string[] }[] = [
    { id: 'avery', name: '艾弗里', subtitle: '记者 · 留意每个矛盾', role: 'PL', locationId: 'hargrave-home', color: '#d6b476', personality: '好奇、谨慎，善于倾听。相信证据，但不会为一篇报道牺牲身边的人。', backstory: '你和两位同行穿过堪萨斯，顺路拜访旧友哈格雷夫博士。一次寻常的过夜，被凌晨的巨响打断。', publicGoal: '查明迫降与隔离背后的真相。', privateGoal: '带着可信的报道、也带着同伴活着回去。', secret: '你曾发表过一篇未经充分核实的报道，这一次你不想再犯同样的错误。', behavior: 'curious', skills: { spotHidden: 75, listen: 70, library: 70, persuade: 65, psychology: 60, stealth: 55 } },
    { id: 'morgan', name: '摩根', subtitle: '医师 · 相信人的生命', role: 'PL', locationId: 'hargrave-home', color: '#91b8ba', personality: '沉着、富有同情心，先救人再争论；面对不符合医学常识的现象会坚持求证。', backstory: '哈格雷夫是你的前辈。你原以为这趟旅程只是一次休假，而非一场未知的公共卫生事件。', publicGoal: '找到异常病症的真正原因。', privateGoal: '保护同行的人，避免更多无谓的伤亡。', secret: '你对官方处理突发事件的方式抱有保留，但愿意在有证据时合作。', behavior: 'protective', skills: { medicine: 80, firstAid: 80, psychology: 70, science: 60, spotHidden: 60, persuade: 55, library: 55 } },
    { id: 'reed', name: '里德', subtitle: '工程师 · 拆开来看', role: 'PL', locationId: 'hargrave-home', color: '#bd987c', personality: '务实、直接，遇到问题喜欢先看线路和机械结构。对空泛保证没有耐心。', backstory: '你熟悉车辆、电器和工业设备，这次同行本来只负责开车。行李里总带着一套工具。', publicGoal: '找到可行的办法，让所有人安全离开。', privateGoal: '证明面对未知事物，观察和实践仍然有意义。', secret: '你害怕自己再一次因犹豫而错过救人的机会。', behavior: 'ambitious', skills: { electrical: 80, mechanical: 75, heavyMachinery: 75, science: 70, spotHidden: 60, firstAid: 50 } },
    { id: 'hargrave', name: '哈格雷夫', subtitle: '退休太空医学专家', role: 'NPC', locationId: 'hargrave-home', color: '#bcb7a0', personality: '朴实、勇敢，愿意倾听证据。对老朋友忠诚，也认为自己有协助科学调查的责任。', backstory: '曾为水星与双子计划工作，退休后住在戈夫镇。你对 NASA 的一些政策有意见，却不轻视科学。', publicGoal: '帮助朋友，弄清当地发生了什么。', privateGoal: '在朋友的自由与公众安全之间找到负责任的选择。', secret: '你愿意为朋友隐瞒暂住在此的事实，但如果他们的发现能救人，你会劝他们与 NASA 合作。', behavior: 'protective', skills: { medicine: 75, firstAid: 95, library: 75, psychology: 80, science: 65, persuade: 55 }, knownClues: ['home-geiger', 'broadcast'] },
    { id: 'pete', name: '皮特', subtitle: '笃信的外科医生', role: 'NPC', locationId: 'hargrave-home', color: '#a2aa88', personality: '热心、精力充沛，常引用圣经。对军队抱有疑虑，乐于帮助朋友，但会把未知事物理解为信仰的考验。', backstory: '你的全名是文森特·彼得·沃兹沃思。你本打算清晨回恩波里亚，那里有妻子和病人等着。', publicGoal: '照顾朋友，并设法联系家人。', privateGoal: '保护朋友的精神与生命，证明信仰能给人勇气。', secret: '你会误以为光芒绕行是祈祷的效果。只有亲眼见到可重复的反证，才愿意重新考虑。', behavior: 'sociable', skills: { medicine: 55, firstAid: 65, persuade: 85, library: 60, spotHidden: 45 } },
    { id: 'buddy', name: '巴迪', subtitle: '废品场老板', role: 'NPC', locationId: 'scrapyard', color: '#ac865a', personality: '粗鲁、爱财，对陌生人缺乏耐心。关心自己的设备和生意，听得进明确的利益与可证明的危险。', backstory: '阿比胡·斯特里普，大家叫你巴迪。你与街对面的哈格雷夫因噪音和起重机事故不和。', publicGoal: '守住废品场和自己的设备。', privateGoal: '避免财产损失，在合作中争取合理补偿。', secret: '你让磁铁整夜运作只是为了气邻居。两台起重机不能行走，但磁铁没坏。你并不知道它们影响了什么。', behavior: 'guarded', skills: { mechanical: 80, electrical: 65, heavyMachinery: 80, persuade: 35 }, knownClues: ['yard-magnets'] },
    { id: 'hudson', name: '哈德森', subtitle: 'NASA 科研负责人', role: 'NPC', locationId: 'command-post', color: '#9aaec3', personality: '理性、忙碌，对超自然解释存疑。更愿意听样本、测绘、实验与可验证的观察。', backstory: '你被派来处理亚特兰蒂斯号的异常。公众尚不知道真实情况，而实验室始终找不到已知病原。', publicGoal: '确认污染来源，控制危险。', privateGoal: '找到足以指导行动的科学解释，避免无根据的恐慌。', secret: '现有的细菌和病毒培养全部失败了。你担心团队的知识体系不足以解释它。', behavior: 'curious', skills: { science: 85, medicine: 65, library: 80, persuade: 60 }, knownClues: ['nasa-map', 'crash-medical', 'cargo-hole'] },
    { id: 'drako', name: '德拉科', subtitle: '隔离区军事指挥官', role: 'NPC', locationId: 'command-post', color: '#96a28b', personality: '强硬、重视秩序，不欢迎擅自行动。具体的计划和证据能争取有限合作。', backstory: '你负责维持隔离与防止污染扩散。士兵同样可能成为受害者，局势比公开通告严重得多。', publicGoal: '维持隔离，保护人员。', privateGoal: '用可执行的行动控制局势，避免军队与居民失去信心。', secret: '你也没有应对这种现象的办法，但不愿在人前显露不安。', behavior: 'guarded', skills: { persuade: 65, spotHidden: 65, heavyMachinery: 55, electrical: 50 }, knownClues: ['patrol-report'] },
  ];
  return definitions.map(d => ({ ...d, skills: { ...defaultSkills, ...d.skills }, knownClues: d.knownClues ?? [], attributes: { investigation: 4, persuasion: 3, resolve: 4, agility: d.role === 'PL' ? 4 : 2 }, hp: 12, maxHp: 12, sanity: d.id === 'pete' ? 80 : 65, maxSanity: d.id === 'pete' ? 80 : 65, inventory: d.id === 'reed' ? ['随身工具'] : [], visited: [d.locationId], memories: [], relationships: Object.fromEntries(allActorIds.map(id => [id, 0])) as Record<ActorId, number> }));
}

export const killerOpening = '凌晨 03:00，堪萨斯州，戈夫镇。\n\n一声音爆把你从哈格雷夫家的折叠床上惊醒。东方麦田上空升起烟尘，收音机里却还在播送：亚特兰蒂斯号一切正常。\n\n哈格雷夫披上外套，拿起手电。“我得去看看。你要一起来吗？”街对面的废品场仍然轰鸣着。\n\n你不知道发生了什么。先走出去，听听人们怎么说，看看现场留下了什么。';

export function storyTime(elapsedMinutes: number) {
  const total = Math.max(180, elapsedMinutes);
  const day = Math.floor(total / 1440) + 1;
  const hour = Math.floor(total % 1440 / 60);
  const minute = total % 60;
  return { day, hour, minute, night: hour < 6 || hour >= 19, label: `第 ${day} 天 · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}
export function isKiller(world: Pick<World, 'scenarioId'>) { return world.scenarioId === 'killer'; }
export { cocSkillNames, investigatorIds };
