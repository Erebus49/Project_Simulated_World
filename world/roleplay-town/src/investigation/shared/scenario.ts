import type { Actor, ActorId, Clue, Place } from './types.js';
import { allActorIds } from './types.js';
import { killerPlaces, killerClues } from './killer.js';

export const places: Place[] = [
  { id: 'square', name: '钟楼广场', x: 318, y: 220, neighbors: ['archive', 'tavern', 'docks', 'lighthouse'], description: '钟针停在六点。雨水沿着无人的摊棚滴落，一声不该响起的钟鸣穿过雾气。', flavor: '每一次钟鸣，都让潮水更近一点。' },
  { id: 'archive', name: '旧档案馆', x: 155, y: 108, neighbors: ['square', 'tavern'], description: '一栋长满常春藤的旧楼。门缝透出暖光，里面有人翻动早已发黄的航海记录。', flavor: '被划掉的名字，往往最接近真相。' },
  { id: 'tavern', name: '雾灯酒馆', x: 142, y: 323, neighbors: ['square', 'archive', 'docks'], description: '壁炉里烧着潮湿的木头。最后几个客人压低声音，酒馆老板却一直望向灯塔。', flavor: '秘密与酒一样，总有它的价钱。' },
  { id: 'docks', name: '潮汐码头', x: 470, y: 336, neighbors: ['square', 'tavern', 'lighthouse'], description: '系船绳绷得笔直，海水正在逆流。一只未上锁的货箱里，露出印有灯塔徽记的纸角。', flavor: '有些船没有出港，有些人却永远没回来。' },
  { id: 'lighthouse', name: '灰烬灯塔', x: 505, y: 104, neighbors: ['square', 'docks'], description: '灯室透出幽蓝色的光。守塔人站在石阶上，像是在等一个不会回来的人。', flavor: '雾的尽头，仍然有人等着灯亮。' },
];
export const clues: Clue[] = [
  { id: 'archive-oath', title: '被涂改的誓约', locationId: 'archive', dc: 11, text: '百年前的誓约并非献祭：第七声钟鸣前，逆转灯塔镜片，就能切断海雾与港口的联系。' },
  { id: 'docks-manifest', title: '失踪的运输清单', locationId: 'docks', dc: 11, text: '运往灯塔的货物不是灯油，而是用于扩大共鸣的黑盐。清单上的付款人，是守塔人的家族。' },
  { id: 'tavern-log', title: '船长的最后一页', locationId: 'tavern', dc: 12, text: '船长留下警告：必须先敲三下小铜钟，再逆转镜片。只转镜片会让雾吞没整个港口。' },
  { id: 'lighthouse-rune', title: '镜片背面的刻文', locationId: 'lighthouse', dc: 13, text: '镜片上刻着同一句话：让活人走向明天，让逝者归于大海。封印需要三条互相印证的线索与足够的意志。' },
];
const relationshipDefaults = (): Record<ActorId, number> => Object.fromEntries(allActorIds.map(id => [id, 0])) as Record<ActorId, number>;
export function createActors(): Actor[] {
  const base = { hp: 12, maxHp: 12, sanity: 20, maxSanity: 20, memories: [], visited: [], relationships: relationshipDefaults() };
  const definitions: Omit<Actor, keyof typeof base>[] = [
    { id: 'lin', name: '林鸦', subtitle: '追寻真相的调查员', role: 'PL', color: '#8cb7ad', personality: '敏锐、克制，习惯在下结论前寻找证据。说话简短，但从不轻易放弃同伴。', backstory: '你曾离开雾港。三天前，一封署着亡弟名字的信把你带了回来。', publicGoal: '找出钟鸣与海雾的源头。', privateGoal: '查明弟弟失踪的真相，并让港口的人活着离开。', secret: '你的弟弟曾参与灯塔的黑盐运输。你没有把这件事告诉其他人。', behavior: 'curious', attributes: { investigation: 5, persuasion: 2, resolve: 3, agility: 3 }, locationId: 'square', knownClues: [] },
    { id: 'mora', name: '莫拉', subtitle: '心存愧疚的医师', role: 'PL', color: '#c3a4bd', personality: '温和、坚定，先照顾眼前的人，再追问事情的原因。危险中会主动保护别人。', backstory: '你在雾港行医多年，熟悉这里每一张面孔。旧灾难发生时，你曾选择沉默。', publicGoal: '保护同伴，阻止雾中灾难重演。', privateGoal: '帮助林鸦完成封印，为当年的沉默赎罪。', secret: '你保存着上次海雾事件的病历，知道钟鸣会侵蚀人的心智。', behavior: 'protective', attributes: { investigation: 3, persuasion: 4, resolve: 5, agility: 2 }, locationId: 'square', knownClues: [] },
    { id: 'roan', name: '洛恩', subtitle: '另有所图的游荡者', role: 'PL', color: '#d2ac7b', personality: '机敏、爱开玩笑，不愿暴露自己的脆弱。会先衡量利益，但并非没有底线。', backstory: '你答应替人从码头取回一份清单。报酬足够买一艘离开雾港的小船。', publicGoal: '找到安全离港的办法。', privateGoal: '拿到黑盐清单，保住自己与妹妹离开的机会。', secret: '你认识黑盐的买家，而且已经收下了定金。', behavior: 'ambitious', attributes: { investigation: 4, persuasion: 3, resolve: 2, agility: 5 }, locationId: 'square', knownClues: [] },
    { id: 'eira', name: '伊蕾', subtitle: '守着旧日的灯塔人', role: 'NPC', color: '#86a6ce', personality: '寡言、执拗，对灯塔充满近乎亲情的依恋。不会轻易信任陌生人，却也无法看着人受伤。', backstory: '你的家族世代看守灯塔。你相信雾里传来的，是母亲的声音。', publicGoal: '守住灯塔，不让人贸然进入灯室。', privateGoal: '确认母亲是否真的在雾里；只有证据与信任能让你放下执念。', secret: '你知道镜片背面的刻文，但害怕关闭灯塔意味着再也听不到母亲的声音。', behavior: 'guarded', attributes: { investigation: 3, persuasion: 2, resolve: 4, agility: 3 }, locationId: 'lighthouse', knownClues: ['lighthouse-rune'] },
    { id: 'silas', name: '西拉斯', subtitle: '消息灵通的酒馆主', role: 'NPC', color: '#b1b98b', personality: '健谈、圆滑，常用反问试探别人。珍惜老朋友，也在暗中寻找值得信任的人。', backstory: '你见过太多走进雾里的人。船长留下的航海日志，如今就藏在你的柜台下面。', publicGoal: '让酒馆里的客人平安度过今晚。', privateGoal: '把船长的警告交给能真正阻止灾难的人。', secret: '你知道敲钟的顺序，也知道林鸦的弟弟曾试图停止运输。', behavior: 'sociable', attributes: { investigation: 2, persuasion: 5, resolve: 3, agility: 2 }, locationId: 'tavern', knownClues: ['tavern-log'] },
  ];
  return definitions.map(a => ({ ...structuredClone(base), ...a, visited: [a.locationId] }));
}
export const opening = '黄昏六点，早已停摆的钟楼忽然响起。\n没有人拉动钟绳。海水却开始倒流。\n\n一封来自亡者的信，将三个陌生人带到广场。灯塔在远处亮起幽蓝色的光，而最后一班渡船，已经消失在雾里。\n\n你们还有十二轮。找到线索，决定相信谁，在真正的第七声钟鸣前，为这个港口写下结局。';
export const placeById = Object.fromEntries([...places, ...killerPlaces].map(p => [p.id, p])) as Record<Place['id'], Place>;
export const scenarioClues = (world: { scenarioId?: string }) => world.scenarioId === 'killer' ? killerClues : clues;
export const scenarioPlaces = (world: { scenarioId?: string }) => world.scenarioId === 'killer' ? killerPlaces : places;
