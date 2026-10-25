/* ============================================================
 * 宗门长青录 - 配置表（数据驱动，可批量扩展）
 * ============================================================ */

// ---- 境界体系：9 大境界 × 4 小阶段 ----
const STAGES = ["初期", "中期", "后期", "圆满"];
const REALMS = [
  { name: "炼气", lifespan: 120,  powerBase: 10,    breakthroughBase: 0.90 },
  { name: "筑基", lifespan: 200,  powerBase: 40,    breakthroughBase: 0.80 },
  { name: "金丹", lifespan: 400,  powerBase: 150,   breakthroughBase: 0.65 },
  { name: "元婴", lifespan: 800,  powerBase: 600,   breakthroughBase: 0.50 },
  { name: "化神", lifespan: 1500, powerBase: 2500,  breakthroughBase: 0.38 },
  { name: "炼虚", lifespan: 3000, powerBase: 9000,  breakthroughBase: 0.28 },
  { name: "合体", lifespan: 6000, powerBase: 30000, breakthroughBase: 0.20 },
  { name: "大乘", lifespan: 12000,powerBase: 100000,breakthroughBase: 0.12 },
  { name: "渡劫", lifespan: 99999,powerBase: 400000,breakthroughBase: 0.05 }
];
// 每个小阶段所需修为（大境界突破 = 圆满进度满）
function stageExpNeed(realmIdx, stage) {
  return Math.round(20 * Math.pow(3.2, realmIdx) * (1 + stage * 0.6));
}

// ---- 灵根 ----
const SPIRIT_ROOTS = [
  { name: "金灵根", type: "normal", speed: 1.0 },
  { name: "木灵根", type: "normal", speed: 1.0 },
  { name: "水灵根", type: "normal", speed: 1.0 },
  { name: "火灵根", type: "normal", speed: 1.0 },
  { name: "土灵根", type: "normal", speed: 1.0 },
  { name: "变异·雷灵根", type: "mutant", speed: 1.35 },
  { name: "变异·冰灵根", type: "mutant", speed: 1.35 },
  { name: "变异·风灵根", type: "mutant", speed: 1.35 },
  { name: "天灵根", type: "heaven", speed: 1.8 }
];
// 招募时灵根权重
const ROOT_WEIGHTS = [16, 16, 16, 16, 16, 6, 6, 6, 2];

// ---- 心性 ----
const PERSONALITIES = ["沉稳", "急躁", "仁善", "邪异", "坚毅", "圆滑"];

// ---- 职业方向 ----
const CLASSES = {
  sword:  { name: "剑修", cat: "战斗", desc: "高爆发单体战力", combat: 1.3 },
  spell:  { name: "法修", cat: "战斗", desc: "范围输出", combat: 1.15 },
  body:   { name: "体修", cat: "战斗", desc: "高防御前排", combat: 1.0 },
  array:  { name: "阵修", cat: "战斗", desc: "辅助增益", combat: 0.8 },
  dan:    { name: "丹修", cat: "生产", desc: "丹房产出加成", combat: 0.5 },
  qi:     { name: "器修", cat: "生产", desc: "器阁产出加成", combat: 0.5 },
  fu:     { name: "符修", cat: "生产", desc: "符楼产出加成", combat: 0.6 },
  envoy:  { name: "外事", cat: "功能", desc: "外交效果加成", combat: 0.7 },
  preach: { name: "传道", cat: "功能", desc: "全宗修炼加成", combat: 0.6 },
  law:    { name: "执法", cat: "功能", desc: "宗门稳定加成", combat: 0.8 }
};

// ---- 资源定义 ----
const RESOURCES = {
  lingshi:  { name: "灵石", icon: "◆" },
  lingyao:  { name: "灵药", icon: "❀" },
  kuangshi: { name: "矿石", icon: "▲" },
  mucai:    { name: "木材", icon: "♣" },
  danyao:   { name: "丹药", icon: "●" }
};

// ---- 建筑配置 ----
// prod: 每名驻守在岗位弟子每月基础产出；jobCat: 匹配职业类别
const BUILDINGS = {
  shanmen: {
    name: "山门", cat: "基础", maxLv: 5, jobs: 0,
    desc: "宗门根本，决定弟子容纳上限与宗门规模。",
    cost: lv => ({ lingshi: 200 * lv, mucai: 60 * lv, kuangshi: 60 * lv }),
    effect: lv => `弟子容纳上限 +${lv * 6}`
  },
  lingtian: {
    name: "灵田", cat: "基础", maxLv: 5, jobs: 3, jobCat: "any",
    desc: "种植灵药，每名驻守弟子每月产出灵药。",
    cost: lv => ({ lingshi: 80 * lv, mucai: 30 * lv }),
    prod: { lingyao: 3 },
    effect: lv => `灵药产出 ${3 * lv}/人/月`
  },
  lingkuang: {
    name: "灵矿", cat: "基础", maxLv: 5, jobs: 3, jobCat: "any",
    desc: "开采矿石与灵石。",
    cost: lv => ({ lingshi: 100 * lv, mucai: 40 * lv }),
    prod: { kuangshi: 2, lingshi: 5 },
    effect: lv => `矿石 ${2 * lv}、灵石 ${5 * lv}/人/月`
  },
  yanwu: {
    name: "演武场", cat: "基础", maxLv: 5, jobs: 99, jobCat: "any",
    desc: "弟子在此修炼，提升修炼效率。岗位不限。",
    cost: lv => ({ lingshi: 120 * lv, kuangshi: 40 * lv }),
    effect: lv => `修炼速度 +${lv * 15}%`
  },
  danfang: {
    name: "丹房", cat: "生产", maxLv: 5, jobs: 2, jobCat: "dan",
    desc: "炼制丹药（突破、疗伤必需）。需丹修驻守。",
    cost: lv => ({ lingshi: 150 * lv, lingyao: 30 * lv, kuangshi: 20 * lv }),
    prod: { danyao: 1 },
    consume: { lingyao: 2 },
    effect: lv => `丹药 ${1 * lv}/人/月（耗灵药×2）`
  },
  cangjing: {
    name: "藏经阁", cat: "功能", maxLv: 5, jobs: 1, jobCat: "preach",
    desc: "存储功法，提升全宗弟子悟性（修炼速度）。",
    cost: lv => ({ lingshi: 150 * lv, mucai: 50 * lv }),
    effect: lv => `全宗修炼速度 +${lv * 8}%`
  },
  diziju: {
    name: "弟子居", cat: "基础", maxLv: 5, jobs: 0,
    desc: "提升弟子容纳上限。",
    cost: lv => ({ lingshi: 60 * lv, mucai: 40 * lv }),
    effect: lv => `弟子容纳上限 +${lv * 8}`
  },
  zhifa: {
    name: "执法堂", cat: "功能", maxLv: 5, jobs: 1, jobCat: "law",
    desc: "维持宗门秩序，降低负面事件发生率。",
    cost: lv => ({ lingshi: 130 * lv, kuangshi: 30 * lv }),
    effect: lv => `负面事件概率 -${lv * 6}%`
  }
};

// ---- 突破规则 ----
const BREAKTHROUGH = {
  pillBonus: 0.08,        // 每颗丹药 +8%
  guardianBonus: 0.05,    // 每名高境界护法 +5%（最多2名）
  maxPill: 3,
  failTable: [            // 失败惩罚概率分布
    { type: "drop_stage", w: 40, text: "境界跌落一阶" },
    { type: "injured",    w: 35, text: "走火入魔，重伤（12个月内无法修炼）" },
    { type: "foundation", w: 20, text: "根基受损，修炼速度永久 -20%" },
    { type: "death",      w: 5,  text: "身死道消" }
  ]
};

// ---- 招募 ----
const RECRUIT = {
  trial: { name: "入门试炼", cost: { lingshi: 50 }, count: [1, 2], desc: "举办试炼选拔苗子，资质平庸者居多，偶有良才。" },
  travel: { name: "下山游历", cost: { lingshi: 120 }, count: [1, 1], desc: "掌门亲自下山寻访，更容易遇到高资质散修。" }
};

// ---- 初始资源 ----
const INITIAL_STATE = {
  sectName: "青云观",
  year: 1, month: 1,
  reputation: 10,
  resources: { lingshi: 300, lingyao: 40, kuangshi: 60, mucai: 80, danyao: 5 },
  buildings: { shanmen: 1, lingtian: 1, lingkuang: 0, yanwu: 1, danfang: 0, cangjing: 0, diziju: 1, zhifa: 0 }
};

// ---- NPC 宗门 ----
const NPC_SECTS_TEMPLATE = [
  { id: "tieyang", name: "铁阳宗", power: 260, relation: 0,  trait: "尚武好战，觊觎周边矿脉", aggr: 0.7 },
  { id: "baihua", name: "百花谷", power: 180, relation: 20, trait: "以丹道立派，性情温和",     aggr: 0.2 },
  { id: "hanjian", name: "寒剑门", power: 300, relation: -10,trait: "剑修宗门，孤高冷漠",       aggr: 0.5 },
  { id: "qingzhu", name: "青竹山庄", power: 120, relation: 30, trait: "小门派，善经营贸易",     aggr: 0.1 }
];
// 关系等级阈值
function relationLevel(rel) {
  if (rel <= -60) return { name: "死敌", cls: "red" };
  if (rel <= -20) return { name: "敌对", cls: "red" };
  if (rel < 20)  return { name: "中立", cls: "" };
  if (rel < 60)  return { name: "友好", cls: "green" };
  return { name: "同盟", cls: "gold" };
}

// ---- 外交行为 ----
const DIPLO_ACTIONS = [
  { id: "gift",    name: "互赠结好", cost: { lingshi: 80 }, rel: +12, desc: "赠礼灵石×80，关系 +12" },
  { id: "lecture", name: "讲学交流", cost: {}, needClass: "preach", rel: +6, rep: +2, desc: "派传道弟子讲学，关系 +6、声望 +2" },
  { id: "trade",   name: "开通贸易", cost: {}, rel: +3, desc: "每月贸易收益（关系越好利润越高）" },
  { id: "ally",    name: "缔结同盟", cost: {}, needRel: 60, rel: 0, desc: "关系≥60 可结盟，被攻时盟友参战" },
  { id: "declare", name: "宣战", cost: {}, rel: -100, desc: "发动小队级冲突，胜可掠夺，败则损失惨重" }
];

// ---- 随机事件库（MVP 12 个）----
// effect 直接在 game.js 中按 id 实现，保持配置简洁
const EVENTS = [
  {
    id: "xieyue",
    title: "血色月夜",
    text: "月黑风高夜，巡山弟子在山门外发现一名重伤的散修，怀中似乎揣着不凡之物。",
    weight: 8, bad: false,
    options: [
      { label: "救他入门", desc: "消耗灵药×10，获得一名随机弟子（可能资质不凡，也可能是骗子）", effect: { res: { lingyao: -10 }, recruitWounded: true } },
      { label: "杀人夺宝", desc: "获得灵石×150，声望 -8，宗门心性向邪异偏移", effect: { res: { lingshi: 150 }, rep: -8 } },
      { label: "置之不理", desc: "无事发生", effect: {} }
    ]
  },
  {
    id: "lingmai",
    title: "灵脉异动",
    text: "宗门下品灵脉突然灵气翻涌，似有异宝将出，但贸然挖掘可能损毁灵脉。",
    weight: 6,
    options: [
      { label: "小心挖掘", desc: "60% 得灵石×200；40% 灵脉受损，本月产出减半", effect: { gamble: { win: { res: { lingshi: 200 } }, lose: { veinDamage: true }, rate: 0.6 } } },
      { label: "封存不动", desc: "稳妥起见，获得灵药×5", effect: { res: { lingyao: 5 } } }
    ]
  },
  {
    id: "xinmo",
    title: "弟子心魔",
    text: "一名修为精进最快的弟子夜不能寐，道心动摇，隐有心魔滋生之兆。",
    weight: 8, needDisciple: true,
    options: [
      { label: "赐丹镇压", desc: "消耗丹药×2，弟子无恙，修为略进", effect: { res: { danyao: -2 }, cureDemon: true } },
      { label: "令其自行悟道", desc: "50% 悟性 +5；50% 走火入魔重伤", effect: { demonGamble: true } },
      { label: "罚去面壁", desc: "弟子忠诚度 -10，但消除隐患", effect: { demonWall: true } }
    ]
  },
  {
    id: "shangdui",
    title: "商队途经",
    text: "一支行商队伍途经山门，愿以物易物，他们的丹药价格似乎比市面上便宜些。",
    weight: 10,
    options: [
      { label: "购入丹药", desc: "灵石 -100，丹药 +4", effect: { res: { lingshi: -100, danyao: 4 } } },
      { label: "出售灵药", desc: "灵药 -20，灵石 +120", effect: { res: { lingyao: -20, lingshi: 120 } } },
      { label: "婉拒", desc: "无事发生", effect: {} }
    ]
  },
  {
    id: "sidu",
    title: "弟子私斗",
    text: "两名弟子因分配资源不均在演武场大打出手，各有负伤，引得众弟子围观议论。",
    weight: 8, bad: true, needDisciple2: true,
    options: [
      { label: "各打五十大板", desc: "两人忠诚度各 -8，宗门稳定", effect: { punishBoth: true } },
      { label: "查明缘由秉公处置", desc: "消耗灵石×30 抚恤，忠诚度上升", effect: { res: { lingshi: -30 }, arbitrate: true } },
      { label: "放任不管", desc: "声望 -3，负面事件概率上升", effect: { rep: -3, chaos: +5 } }
    ]
  },
  {
    id: "mijing",
    title: "秘境传闻",
    text: "传闻百里外有低阶秘境出世，各宗门弟子皆跃跃欲试，其中或有灵药功法，亦暗藏杀机。",
    weight: 7,
    options: [
      { label: "派精锐前往", desc: "派遣最强弟子：胜则灵石×180+灵药×15，败则弟子重伤", effect: { expedition: true } },
      { label: "按兵不动", desc: "稳守山门", effect: {} }
    ]
  },
  {
    id: "laifang",
    title: "邻宗来访",
    text: "邻近宗门长老携礼来访，言语间试探贵宗虚实，似有为难之意，亦有结交之心。",
    weight: 8,
    options: [
      { label: "盛情款待", desc: "灵石 -40，随机一宗关系 +10", effect: { res: { lingshi: -40 }, relRandom: +10 } },
      { label: "冷淡应对", desc: "随机一宗关系 -5", effect: { relRandom: -5 } },
      { label: "展示实力震慑", desc: "战力足够则关系 +5 声望 +3，不足则被轻视（关系 -8）", effect: { showForce: true } }
    ]
  },
  {
    id: "dunwu",
    title: "功法顿悟",
    text: "藏经阁中一名弟子夜读残卷，忽有所悟，对门中心法有了全新理解。",
    weight: 6, needBuilding: "cangjing",
    options: [
      { label: "令其整理成册", desc: "该弟子悟性 +3，全宗本月修炼速度 +10%", effect: { insight: true } },
      { label: "秘而不宣", desc: "该弟子修为大涨，但忠诚度 -5", effect: { insightSelf: true } }
    ]
  },
  {
    id: "zhalu",
    title: "丹房炸炉",
    text: "轰的一声巨响！丹房炉火失控，浓烟滚滚，驻守丹修灰头土脸地逃了出来。",
    weight: 5, bad: true, needBuilding: "danfang",
    options: [
      { label: "修缮丹炉", desc: "灵石 -60，丹房下月停产", effect: { res: { lingshi: -60 }, haltDanfang: true } },
      { label: "责罚丹修", desc: "驻守丹修忠诚 -15，灵药损失 -10", effect: { res: { lingyao: -10 }, punishDan: true } }
    ]
  },
  {
    id: "tianjiao",
    title: "天才降生",
    text: "山下村庄传来异象，一婴儿出生时有紫气东来，疑似身怀灵根的好苗子。",
    weight: 4,
    options: [
      { label: "收入门下", desc: "获得一名高资质弟子（天灵根概率大幅提升）", effect: { recruitGenius: true } },
      { label: "静观其变", desc: "无事发生", effect: {} }
    ]
  },
  {
    id: "shouchao",
    title: "兽潮来袭",
    text: "山中妖兽异常躁动，一小股兽潮冲向了宗门灵田！",
    weight: 6, bad: true,
    options: [
      { label: "全员迎击", desc: "战力足够则无损且得灵药×10；不足则灵田减产且弟子受伤", effect: { beastFight: true } },
      { label: "退守山门", desc: "灵药 -15，灵石 -30", effect: { res: { lingyao: -15, lingshi: -30 } } }
    ]
  },
  {
    id: "qiushi",
    title: "修真集市",
    text: "县城十年一度的修真集市开集，各路修士云集，是采买与售卖的好机会。",
    weight: 7,
    options: [
      { label: "采买物资", desc: "灵石 -150，灵药 +15、矿石 +15、木材 +20", effect: { res: { lingshi: -150, lingyao: 15, kuangshi: 15, mucai: 20 } } },
      { label: "摆摊售卖", desc: "灵药 -10、矿石 -10，灵石 +140", effect: { res: { lingyao: -10, kuangshi: -10, lingshi: 140 } } },
      { label: "只看不买", desc: "声望 +1", effect: { rep: 1 } }
    ]
  }
];

// ---- 姓名生成 ----
const SURNAMES = ["李","王","张","刘","陈","杨","赵","黄","周","吴","徐","孙","林","何","郭","马","罗","梁","宋","韩","谢","唐","冯","于","董","萧","程","楚","沈","苏"];
const GIVEN_M = ["玄风","凌云","惊鸿","长庚","无尘","问天","守拙","破军","临渊","听雪","墨白","青阳","景行","怀瑾","照夜","沧海"];
const GIVEN_F = ["凝霜","清瑶","灵犀","弄月","疏影","扶摇","紫萱","暮雪","朝雨","流萤","念慈","昭华","令仪","宛央","采薇","绛珠"];

// ---- 世界演进文案池 ----
const WORLD_NEWS = [
  "{s1}与{s2}因矿脉归属爆发冲突，死伤数人。",
  "{s1}举办丹道大会，方圆百里修士云集。",
  "{s1}一名长老突破失败，坐化于洞府之中。",
  "{s1}吞并了附近的一个小家族，势力渐涨。",
  "{s1}与{s2}结为同盟，互守望相助。",
  "{s1}的商队在山中遇劫，损失惨重。",
  "县城修真联盟发布告示：严禁私斗，违者共逐之。",
  "有散修在迷雾沼泽发现上古洞府遗迹，各方蠢蠢欲动。"
];

/* ============================================================
 * 阶段二配置：宗门攻防战 / 附庸 / 商路 / 历练
 * ============================================================ */

// ---- 战争战术 ----
const TACTICS = {
  frontal: { name: "正面强攻", winMod: 0.0,  lossMod: 1.0, desc: "稳扎稳打，胜率与战损均为基准" },
  raid:    { name: "偷袭粮道", winMod: 0.12, lossMod: 0.7, desc: "胜率 +12%，战损 -30%，失败则被反咬一口（额外损失灵石）" },
  siege:   { name: "围点打援", winMod: 0.06, lossMod: 1.2, desc: "胜率 +6%，战损 +20%，战胜可俘获更多弟子" },
  incite:  { name: "策反内应", winMod: 0.20, lossMod: 1.0, desc: "胜率 +20%，需消耗灵石×200 收买内应；若失败声望额外 -10" }
};
// 阵型加成：弟子职业置于对应排位的战力倍率
const FORMATION_BONUS = {
  front: { body: 1.4, sword: 1.1 },
  mid:   { sword: 1.3, spell: 1.2, body: 1.0 },
  back:  { spell: 1.3, array: 1.4, fu: 1.2, dan: 0.9, qi: 0.9, envoy: 0.9, preach: 0.9, law: 0.9 }
};
const WAR_CONFIG = {
  formationBonusDefault: 1.0,
  formationMismatch: 0.85,      // 职业与排位不匹配
  defenseArrayBonus: 0.35,      // 守方护山大阵加成
  assaultNeedRel: -20,          // 关系 ≤ 此值方可攻打山门
  captiveRate: 0.4              // 灭门/围城战俘获弟子概率
};

// ---- 附庸 ----
const VASSAL = {
  tributeMin: 0.15, tributeMax: 0.25,   // 每年供奉其产出的比例
  loyaltyInit: 40,
  rebelThreshold: 30,                    // 忠诚度低于此值有反叛风险
  sootheCost: { lingshi: 100 }, sootheLoyalty: +15
};

// ---- 商路 ----
const TRADE_ROUTES = [
  { id: "county",  name: "县域短商路", months: 1, profit: 60,  risk: 0.10, goods: ["lingyao", "kuangshi"],
    desc: "往返县城集市，利润薄但安全。" },
  { id: "state",   name: "州域商路",   months: 2, profit: 180, risk: 0.25, goods: ["lingyao", "kuangshi", "danyao"],
    desc: "横跨州域贩卖丹药灵材，利润可观，偶有劫匪。" },
  { id: "border",  name: "边境险路",   months: 3, profit: 400, risk: 0.45, goods: ["danyao", "kuangshi"],
    desc: "穿越敌对势力边境，暴利与杀机并存，务必派遣护送修士。" }
];
const TRADE_GOODS = {
  lingyao:  { name: "灵药", unitCost: 8 },
  kuangshi: { name: "矿石", unitCost: 10 },
  danyao:   { name: "丹药", unitCost: 40 }
};

// ---- 历练地点 ----
const ADVENTURE_PLACES = [
  { id: "wild",   name: "荒山野岭", months: 2, danger: 0.2, desc: "低阶妖兽出没，偶有灵草奇遇，适合炼气筑基弟子。" },
  { id: "town",   name: "红尘俗世", months: 2, danger: 0.15, desc: "游历凡间城镇，磨炼心性，或结缘或生事。" },
  { id: "ruins",  name: "上古遗迹", months: 3, danger: 0.45, desc: "危机四伏的古修士遗迹，或得传承，或葬身其中。" }
];

// ---- 历练事件 ----
const ADV_EVENTS = [
  {
    id: "adv_herb", places: ["wild"],
    title: "悬崖灵草",
    text: "{name}在断崖上发现一株百年灵药，旁边却盘踞着一条剧毒妖蟒。",
    options: [
      { label: "冒死采摘", desc: "60% 得灵药×20；失败则重伤", effect: { advGamble: { win: { lingyao: 20 }, rate: 0.6 } } },
      { label: "绕路而行", desc: "安全离开，气运 +2", effect: { luck: +2 } }
    ]
  },
  {
    id: "adv_beggar", places: ["town"],
    title: "邋遢老丐",
    text: "一个邋遢老乞丐拦住了{name}的去路，笑嘻嘻地讨要酒钱，眼神却深不可测。",
    options: [
      { label: "慷慨解囊", desc: "灵石 -30，50% 老者竟是隐世高人，悟性 +8", effect: { res: { lingshi: -30 }, sageGamble: true } },
      { label: "拂袖而去", desc: "心性无碍，气运 -2", effect: { luck: -2 } }
    ]
  },
  {
    id: "adv_duel", places: ["town", "wild"],
    title: "路见不平",
    text: "{name}撞见几名魔修正在围杀一名落单散修，对方已向这边投来求救的目光。",
    options: [
      { label: "拔剑相助", desc: "战力足够则声望 +5 获谢礼灵石×100；不足则受伤", effect: { justiceFight: true } },
      { label: "明哲保身", desc: "悄然退走，忠诚度 -3（道心蒙尘）", effect: { loyalty: -3 } }
    ]
  },
  {
    id: "adv_legacy", places: ["ruins"],
    title: "坐化洞府",
    text: "{name}在遗迹深处发现一具盘膝枯骨，身前石台上放着一枚古朴玉简与一只丹瓶。",
    options: [
      { label: "取玉简", desc: "获得古修士感悟：修为大涨（经验 +当前所需50%）", effect: { legacyExp: true } },
      { label: "取丹瓶", desc: "获得丹药×5，但有 30% 是假丹（服用后重伤）", effect: { fakePill: true } },
      { label: "叩首离去", desc: "不取分毫，气运 +5", effect: { luck: +5 } }
    ]
  },
  {
    id: "adv_beast", places: ["wild", "ruins"],
    title: "妖兽突袭",
    text: "一头成年铁背妖狼从密林中暴起，直扑{name}咽喉！",
    options: [
      { label: "迎战", desc: "按战力结算：胜则灵药×10 声望+2，败则重伤 4 个月", effect: { beastDuel: true } },
      { label: "遁走", desc: "消耗 1 颗丹药激发遁符逃脱（无丹药则轻伤）", effect: { flee: true } }
    ]
  },
  {
    id: "adv_romance", places: ["town"],
    title: "红尘邂逅",
    text: "灯会上，{name}与一名外宗修士相谈甚欢，互生好感，临别时对方赠下一枚同心结。",
    options: [
      { label: "结为道侣之约", desc: "悟性 +3、忠诚度 +10；但修炼速度 -5%（红尘羁绊）", effect: { romance: true } },
      { label: "斩断情丝", desc: "心性坚定，悟性 +2", effect: { comprehension: +2 } }
    ]
  }
];

/* ============================================================
 * 阶段三配置：长老院 / 客卿 / 派系 / 底蕴气运 / 联盟 / 灵界通道
 * ============================================================ */

// ---- 客卿（散修高手） ----
const KEQING = {
  recruitCost: { lingshi: 500 },
  salaryBase: [0, 0, 10, 25, 60],
  realmRange: [1, 3],
  loyaltyInit: 35,
  desc: "散修高手挂单为客卿，每月需供奉灵石，忠诚度低，随时可能离去。"
};
// ---- 长老院 ----
const ELDER = {
  needRealm: 3,
  maxSeats: 4,
  bonusPerSeat: 0.06,
  seatDomain: {
    sword: "war", spell: "war", body: "war", array: "war",
    dan: "produce", qi: "produce", fu: "produce",
    envoy: "diplo", preach: "cultivate", law: "order"
  },
  domainName: { war: "征伐战力", produce: "产业产出", diplo: "外交收益", cultivate: "修炼速度", order: "宗门稳定" }
};
// ---- 派系 ----
const FACTIONS = {
  radical: { name: "激进派", personalities: ["急躁", "邪异"], color: "#d05a4e", desc: "主战主扩，锐意进取" },
  steady:  { name: "持重派", personalities: ["沉稳", "坚毅"], color: "#4a9a7f", desc: "稳守山门，深耕内功" },
  neutral: { name: "中和派", personalities: ["仁善", "圆滑"], color: "#b8860b", desc: "调和各方，长袖善舞" }
};
const FACTION_CFG = { tensionThreshold: 70, driftPerMonth: 3 };
// ---- 底蕴与气运 ----
const HERITAGE = {
  maxBonus: 0.5, perPoint: 0.005,
  sources: { majorBreakthrough: 3, buildingLv: 1, legacyCave: 10, allianceWin: 8 }
};
const QIYUN = {
  maxBonus: 0.10, perPoint: 0.005,
  sources: { goodEvent: 2, genius: 5, warWin: 3 }
};
// ---- 联盟 ----
const ALLIANCE_CFG = {
  needRep: 30, needAllies: 2,
  name: "苍云盟",
  raidCooldown: 6,
  modaoBase: 800
};
const COUNCIL_TOPICS = [
  { id: "fund", title: "募集盟费", text: "盟库空虚，各宗须分摊盟费以维持联盟运转。",
    options: [
      { label: "我宗多担待", desc: "灵石 -150，联盟威望 +10，各成员关系 +5", effect: { res: { lingshi: -150 }, prestige: 10, memberRel: 5 } },
      { label: "按份额均摊", desc: "灵石 -60，无事发生", effect: { res: { lingshi: -60 } } },
      { label: "断然拒绝", desc: "联盟威望 -8，各成员关系 -5", effect: { prestige: -8, memberRel: -5 } }
    ] },
  { id: "dispute", title: "调解纷争", text: "盟内两宗因灵田边界起了争执，请你这盟主裁断。",
    options: [
      { label: "秉公裁断", desc: "声望 +4，联盟威望 +5", effect: { rep: 4, prestige: 5 } },
      { label: "偏袒亲信", desc: "一成员关系 +10，另一成员关系 -10", effect: { bias: true } },
      { label: "和稀泥", desc: "联盟威望 -3", effect: { prestige: -3 } }
    ] },
  { id: "drill", title: "联合演武", text: "有长老提议各宗弟子联合演武，切磋砥砺，增进情谊。",
    options: [
      { label: "鼎力举办", desc: "灵石 -80，全宗弟子经验 +30，联盟威望 +5", effect: { res: { lingshi: -80 }, allExp: 30, prestige: 5 } },
      { label: "作罢", desc: "无事发生", effect: {} }
    ] }
];
// ---- 灵界通道任务链 ----
const SPIRIT_QUESTS = [
  { id: 0, title: "寻虚空晶石", desc: "探得灵界裂隙方位，需虚空晶石 3 枚稳固锚点（耗灵石×800、矿石×200，宗门战力≥500）。",
    need: { lingshi: 800, kuangshi: 200 }, powerNeed: 500 },
  { id: 1, title: "布跨界大阵", desc: "聘请阵修宗师布置两界大阵，需化神期以上弟子坐镇（耗灵石×1500、灵药×100）。",
    need: { lingshi: 1500, lingyao: 100 }, realmNeed: 4 },
  { id: 2, title: "稳住空间裂隙", desc: "裂隙躁动不安，需宗门总战力≥2000 方可强行稳定（耗灵石×3000）。",
    need: { lingshi: 3000 }, powerNeed: 2000 }
];

/* ============================================================
 * 阶段四配置：渡劫飞升 / 灵界分宗 / 全界大事件
 * ============================================================ */

// ---- 渡劫 ----
const DUJIE = {
  waves: 9,
  baseWaveRate: 0.82,       // 每道天雷基础扛过概率
  pillBonus: 0.02,          // 每颗渡劫丹 +2%（全程）
  maxPill: 5,
  guardianBonus: 0.015,     // 每名合体期以上护法 +1.5%
  maxGuardian: 4,
  heritageWaveBonus: 0.001, // 每点底蕴 +0.1%
  failTable: [
    { type: "injured", w: 50, text: "重伤掉境（跌落至大乘初期，伤势三年）" },
    { type: "foundation", w: 30, text: "道基崩损（根基受损 + 重伤两年）" },
    { type: "death", w: 20, text: "形神俱灭" }
  ]
};
// ---- 灵界分宗 ----
const SPIRIT_BRANCH = {
  establishCost: { lingshi: 2000, lingyao: 200, kuangshi: 200 },
  minDisciple: 3,                 // 至少派驻 3 名金丹以上弟子
  minRealm: 2,
  incomePerPower: 0.02,           // 每月灵石收益 = 分宗战力 × 系数
  spiritHerbRate: 0.5             // 灵药产出/战力
};
const SPIRIT_SECTS = [
  { id: "xuanji", name: "玄机阁", power: 5000, relation: 0, trait: "灵界老牌宗门，掌控坊市", aggr: 0.3 },
  { id: "jiuyou", name: "九幽宫", power: 7000, relation: -20, trait: "亦正亦邪，虎视下界通道", aggr: 0.6 },
  { id: "yunmeng", name: "云梦泽", power: 4000, relation: 15, trait: "中立避世，盛产灵药", aggr: 0.15 }
];
// ---- 全界大事件 ----
const WORLD_EVENTS = [
  {
    id: "modao_invasion", title: "魔道大举入侵", minYear: 2,
    text: "魔道联军倾巢而出，烽火烧遍州域，修真联盟急召各宗共御强敌！",
    options: [
      { label: "倾巢迎战", desc: "战力≥1500 则大捷：声望+15、灵石×500；不足则惨重伤亡", effect: { worldWar: 1500 } },
      { label: "固守山门", desc: "声望 -5，但无损失；战后物价上涨（灵药+20）", effect: { rep: -5, res: { lingyao: 20 } } },
      { label: "趁火打劫", desc: "掠夺战乱区：灵石×300，声望 -15，全界关系 -10", effect: { res: { lingshi: 300 }, rep: -15, allRel: -10 } }
    ]
  },
  {
    id: "ancient_mijing", title: "上古秘境开启", minYear: 1,
    text: "天现异象，一方上古大能秘境现世，各宗天骄蜂拥而至，夺宝机缘就在眼前！",
    options: [
      { label: "派掌门级精锐", desc: "最强弟子前往：得丹药×8+灵石×300，30% 概率重伤", effect: { ancientRun: true } },
      { label: "派年轻弟子历练", desc: "随机弟子悟性 +5、经验大涨，20% 概率陨落于秘境", effect: { youngRun: true } },
      { label: "不参与", desc: "无事发生", effect: {} }
    ]
  },
  {
    id: "tide", title: "灵气潮汐", minYear: 1,
    text: "天地灵气周期性潮汐来临，灵脉翻涌，正是全宗闭关突破的黄金时期！",
    options: [
      { label: "全宗闭关", desc: "本月全宗弟子经验 +80%，但停产一月", effect: { tideCultivate: true } },
      { label: "趁势采掘", desc: "灵药×30、矿石×30、灵石×150", effect: { res: { lingyao: 30, kuangshi: 30, lingshi: 150 } } }
    ]
  },
  {
    id: "tianmo", title: "域外天魔现世", minYear: 4,
    text: "域外天魔撕裂虚空降临，所过之处生灵涂炭，这是整个凡间界的浩劫，也是名垂青史的机缘！",
    options: [
      { label: "率全界共讨", desc: "需联盟且战力≥3000：胜则声望+30、底蕴+15、气运+10；败则元气大伤", effect: { tianmoWar: true } },
      { label: "贡献资源助战", desc: "灵石 -500，声望 +8", effect: { res: { lingshi: -500 }, rep: 8 } },
      { label: "闭山自守", desc: "声望 -10，全界关系 -5", effect: { rep: -10, allRel: -5 } }
    ]
  }
];
const WORLD_EVENT_CFG = { intervalMin: 18, intervalMax: 30 }; // 触发间隔（月）
