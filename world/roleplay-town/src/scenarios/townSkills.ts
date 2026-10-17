import type { CharacterDefinition, SceneObject, SkillDefinition } from '../shared/types.js';

export const TOWN_OBJECTS:SceneObject[]=[
  {id:'cafe-table',name:'窗边餐桌',locationId:'cafe',position:{x:218,y:309},approach:{x:218,y:324},tags:['table'],state:{cleanliness:20},reservedBy:null},
  {id:'cafe-counter',name:'咖啡吧台',locationId:'cafe',position:{x:286,y:273},approach:{x:286,y:288},tags:['counter'],state:{cupsReady:1,beans:8},reservedBy:null},
  {id:'cafe-menu',name:'手写菜单板',locationId:'cafe',position:{x:313,y:270},approach:{x:312,y:289},tags:['menu','reading'],state:{reviewed:0},reservedBy:null},
  {id:'square-desk',name:'广场读书桌',locationId:'square',position:{x:348,y:343},approach:{x:350,y:360},tags:['writing','reading','study','reporting'],state:{notes:0},reservedBy:null},
  {id:'old-street-view',name:'旧街取景点',locationId:'square',position:{x:425,y:407},approach:{x:445,y:413},tags:['view'],state:{photos:0},reservedBy:null},
  {id:'notice-board',name:'小镇公告栏',locationId:'square',position:{x:325,y:406},approach:{x:333,y:426},tags:['notice','reading'],state:{reviewed:0},reservedBy:null},
  {id:'market-crates',name:'豆料货架',locationId:'market',position:{x:593,y:336},approach:{x:580,y:352},tags:['cargo'],state:{sorted:0},reservedBy:null},
  {id:'market-ledger',name:'供货清单',locationId:'market',position:{x:539,y:329},approach:{x:540,y:348},tags:['ledger','writing'],state:{checked:0},reservedBy:null},
  {id:'garden-bench',name:'花园长椅',locationId:'square',position:{x:482,y:600},approach:{x:498,y:622},tags:['bench','reading'],state:{visits:0},reservedBy:null},
];
export const TOWN_SKILLS:SkillDefinition[]=[
  {id:'clean_table',name:'擦拭餐桌',description:'走到一张有污渍的桌边，擦掉污渍；桌面干净则不再重复。',targetTags:['table'],durationTicks:4,animation:'tidy',cooldownTicks:5,effect:{stat:'cleanliness',amount:40,maximum:100}},
  {id:'prepare_cups',name:'整理杯具',description:'到吧台清洗并摆好杯子，增加可用杯具。',targetTags:['counter'],durationTicks:4,animation:'hands',cooldownTicks:8,effect:{stat:'cupsReady',amount:2,maximum:8}},
  {id:'review_menu',name:'查看菜单',description:'站到菜单板前核对菜单；不会直接改变售价。',targetTags:['menu'],durationTicks:3,animation:'read',cooldownTicks:18,effect:{stat:'reviewed',amount:1,maximum:3}},
  {id:'prepare_lesson',name:'整理教案',description:'到读书桌旁写下教案笔记，完成后获得一份教案。',targetTags:['study'],durationTicks:5,animation:'write',cooldownTicks:10,effect:{item:'lesson_notes'}},
  {id:'take_photo',name:'拍摄旧街',description:'到取景点举起相机拍摄，获得一张旧街照片。',targetTags:['view'],durationTicks:3,animation:'photo',cooldownTicks:12,effect:{stat:'photos',amount:1,maximum:5,item:'street_photo'}},
  {id:'sort_cargo',name:'整理豆料',description:'走到货架前整理袋装豆料，完成一次清点摆放。',targetTags:['cargo'],durationTicks:5,animation:'tidy',cooldownTicks:8,effect:{stat:'sorted',amount:1,maximum:3}},
  {id:'check_ledger',name:'核对货单',description:'到供货清单前核对货物，获得核对记录，不替任何人完成付款。',targetTags:['ledger'],durationTicks:4,animation:'write',cooldownTicks:12,effect:{stat:'checked',amount:1,maximum:3,item:'delivery_notes'}},
  {id:'read_notice',name:'查看公告',description:'到公告栏阅读已公开的内容，不凭空获得未公开的租约信息。',targetTags:['notice'],durationTicks:3,animation:'read',cooldownTicks:15,effect:{stat:'reviewed',amount:1,maximum:4}},
  {id:'write_notes',name:'整理采访笔记',description:'在读书桌边整理自己已经掌握的采访笔记，获得笔记页，不自动发表报道。',targetTags:['reporting'],durationTicks:4,animation:'write',cooldownTicks:10,effect:{stat:'notes',amount:1,maximum:8,item:'interview_notes'}},
  {id:'rest',name:'坐下歇息',description:'到长椅旁停留休息，不产生工资。',targetTags:['bench'],durationTicks:4,animation:'rest',cooldownTicks:10,effect:{stat:'visits',amount:1}},
];
export const CHARACTER_SHEETS:Record<string,CharacterDefinition>={
  owner:{values:['守住熟人的聚会场所','不靠卖惨留住朋友'],habits:['会先收拾好桌子再谈事情','记住老客人的口味'],boundaries:['不替房东承诺续租','不随意公开财务压力'],relationships:{player:'多年未见的旧友',barista:'亲手教会做咖啡的年轻店员',supplier:'有情分也有货款往来的供应商'},skillIds:['clean_table','prepare_cups','review_menu','rest']},
  barista:{values:['把今天的工作做好','为自己的将来负责'],habits:['忙完一件事再停下来交谈','紧张时会整理杯具'],boundaries:['未信任前不主动说出私人录用通知','不能替店主定价'],relationships:{owner:'感激她教自己做咖啡','customer-a':'常来店里的老师'},skillIds:['prepare_cups','clean_table','review_menu','rest']},
  'customer-a':{values:['教育与社区活动','经费使用有依据'],habits:['边读边记笔记','先了解事实再提建议'],boundaries:['不动用公款私人救济','不了解别人的秘密'],relationships:{owner:'提供读书会场所的店主','customer-b':'有时讨论旧街生活的熟人'},skillIds:['prepare_lesson','read_notice','rest']},
  'customer-b':{values:['记录真实的旧街','不轻易承诺投资'],habits:['注意光线和街景','用具体画面表达感受'],boundaries:['拍照不是签约或投资','未经同意不把别人困境作为作品'],relationships:{owner:'曾约好完成旧街影集的旧友','customer-a':'镇上的熟人'},skillIds:['take_photo','read_notice','rest']},
  supplier:{values:['账目清楚','保留情分'],habits:['先清点货物再对单','谈钱尽量不让人当众难堪'],boundaries:['不能替房东作保证','不会把别人的欠款到处说'],relationships:{owner:'多年的客户与老相识',messenger:'偶尔来核实消息的编辑'},skillIds:['sort_cargo','check_ledger','read_notice','rest']},
  messenger:{values:['核实来源','尊重当事人'],habits:['记下问号而不是马上下结论','先看公告再找人询问'],boundaries:['不把匿名线索当事实','不擅自发表私人信息'],relationships:{owner:'旧街人物稿的潜在采访对象',player:'返乡旅人，有不同的观察角度'},skillIds:['read_notice','write_notes','rest']},
};
