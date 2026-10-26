// 无第三方测试依赖：node --test scripts/game.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const storage = new Map();
  const elements = new Map();
  const element = () => ({ innerHTML: '', textContent: '', style: {}, dataset: {},
    play() { return Promise.resolve(); }, pause() {},
    classList: { add() {}, remove() {}, contains() { return true; } }, querySelector() { return null; }, appendChild() {} });
  const context = vm.createContext({ Math: Object.create(Math), console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener() {} },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element } });
  context.Math.random = () => 0.5;
  for (const name of ['data.js', 'game.js', 'ui.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), context, { filename: name });
  const api = vm.runInContext('({Game, UI, stageExpNeed, EVENTS, ADV_EVENTS, WORLD_EVENTS, COUNCIL_TOPICS, KEQING, DUJIE, SPIRIT_BRANCH, REALMS, spiritRootInfo, validSpiritRoot, migrateSpiritRoot, ROOT_ELEMENTS, AUTO_BREAKTHROUGH})', context);
  api.Game.newGame();
  api.UI.sfx = () => {};
  api.UI.modal = html => { api.html = html; };
  api.random = value => { context.Math.random = () => value; };
  api.run = code => vm.runInContext(code, context);
  api.storage = storage;
  api.quiet = () => { api.Game.rollEvent = () => null; api.Game.factionTick = () => null; api.Game.worldEventTick = () => null; api.Game.worldTick = () => {}; };
  api.rich = () => { Object.keys(api.Game.state.resources).forEach(k => { api.Game.state.resources[k] = 100000; }); };
  api.full = d => { d.exp = api.stageExpNeed(d.realm, d.stage); };
  return api;
}

test('每月所有空闲弟子都修炼，达到当前阶上限后等待手动突破', () => {
  const f = fixture(); f.quiet();
  const ds = f.Game.aliveDisciples();
  f.Game.nextMonth();
  assert.ok(ds.every(d => d.exp > 0));
  const d = ds[1]; f.full(d); f.Game.nextMonth();
  assert.equal(d.exp, f.stageExpNeed(d.realm, d.stage)); assert.equal(d.stage, 0);
});
test('生产岗位半速兼修，演武场只对任职者提供加成', () => {
  const f = fixture(), g = f.Game, d = g.state.disciples[1];
  const idle = g.cultivationGain(d);
  assert.equal(g.assignJob('lingtian', d.id), null); assert.equal(g.cultivationGain(d), idle / 2);
  assert.equal(g.assignJob('yanwu', d.id), null); assert.ok(g.cultivationGain(d) > idle);
  assert.equal(g.state.jobs.lingtian.length, 0);
});
test('伤者、历练者、护送者暂停修炼，伤者也停止生产', () => {
  const f = fixture(); f.quiet(); const g = f.Game, [a, b, c] = g.state.disciples;
  g.assignJob('lingtian', a.id); a.injuredMonths = 2;
  b.adventure = { placeId: 'wild', monthsLeft: 9 };
  g.state.caravans.push({ routeId: 'county', goodsId: 'lingyao', amount: 1, monthsLeft: 9, escortId: c.id });
  const herbs = g.state.resources.lingyao;
  assert.ok([a,b,c].every(d => g.cultivationGain(d) === 0));
  // 单独检查生产，商队本轮不结算。
  g.caravanTick = () => {}; g.nextMonth();
  assert.equal(g.state.resources.lingyao, herbs); assert.ok([a,b,c].every(d => d.exp === 0));
});
test('未建建筑、无岗位建筑、无效或外出弟子不能任职', () => {
  const { Game: g } = fixture(); const d = g.state.disciples[1];
  assert.ok(g.assignJob('danfang', d.id)); assert.ok(g.assignJob('shanmen', d.id));
  assert.ok(g.assignJob('missing', d.id)); assert.ok(g.assignJob('yanwu', 999));
  d.inBranch = true; assert.ok(g.assignJob('yanwu', d.id));
});
test('突破加减丹药与护法渲染读取同一状态，确认只消耗选定丹药', () => {
  const f = fixture(), g = f.Game, u = f.UI, d = g.state.disciples[1], leader = g.state.disciples[0];
  f.full(d); u.showBreakthrough(d.id); u._btPill(d.id, 1); assert.match(f.html, /服用丹药：1 颗/);
  u._btPill(d.id, -1); assert.match(f.html, /服用丹药：0 颗/);
  u._btGuard(d.id, leader.id); assert.match(f.html, /护法修士：1 名/);
  u._btPill(d.id, 1); const before = g.state.resources.danyao; f.random(0); u._btGo(d.id);
  assert.equal(g.state.resources.danyao, before - 1); assert.equal(d.stage, 1);
  u._btGo(d.id); assert.equal(g.state.resources.danyao, before - 1);
});
test('突破拒绝非法丹药、重复护法、外出护法和外出突破者', () => {
  const f = fixture(), g = f.Game, [a,d] = g.state.disciples; f.full(d);
  for (const n of [-1, 0.5, 4, NaN]) assert.ok(g.tryBreakthrough(d.id, n, []).err);
  assert.ok(g.tryBreakthrough(d.id, 0, [a.id,a.id]).err);
  a.adventure = { placeId: 'wild', monthsLeft: 2 }; assert.ok(g.tryBreakthrough(d.id, 0, [a.id]).err);
  d.adventure = { placeId: 'wild', monthsLeft: 2 }; assert.ok(g.tryBreakthrough(d.id, 0, []).err);
});
test('突破陨落立即继位，最后一人陨落立即结束', () => {
  const f = fixture(), g = f.Game, leader = g.state.disciples[0]; f.full(leader); f.random(0.99999);
  const r = g.tryBreakthrough(leader.id); assert.equal(r.ok, false); assert.equal(leader.alive, false);
  assert.equal(g.aliveDisciples().filter(d => d.isLeader).length, 1);
  g.aliveDisciples().forEach(d => g.removeDisciple(d)); assert.equal(g.state.gameOver, true);
});
test('两种战争入口共用每目标每月限制，读档和跨年后仍正确', () => {
  const f = fixture(), g = f.Game, sec = g.state.sects[0]; f.random(0);
  assert.equal(g.diploAction(sec.id, 'declare').win, true);
  const money = g.state.resources.lingshi;
  assert.ok(g.startWar(sec).err); assert.ok(g.startAssault(sec.id, {front:[1],mid:[],back:[]}, 'frontal').err);
  assert.equal(g.state.resources.lingshi, money); g.save(1); assert.equal(g.load(1), true);
  assert.ok(g.startWar(g.state.sects[0]).err);
  g.state.year++; assert.equal(g.startWar(g.state.sects[0]).win, true);
});
test('总攻失败也占本月次数，不得重复出战或重复计算同一弟子', () => {
  const f = fixture(), g = f.Game, sec = g.state.sects[0]; sec.relation = -80; f.random(0.9999);
  assert.ok(g.startAssault(sec.id, {front:[1],mid:[1],back:[]}, 'frontal').err);
  const single = g.calcAssaultPower({front:[1],mid:[],back:[]});
  assert.equal(g.calcAssaultPower({front:[1],mid:[1],back:[]}), single);
  assert.ok(g.startAssault(sec.id, {front:[999],mid:[],back:[]}, 'frontal').err);
  assert.equal(g.startAssault(sec.id, {front:[1],mid:[],back:[]}, 'frontal').win, false);
  assert.ok(g.startWar(sec).err);
});
test('战争战术选择立即更新高亮和说明', () => {
  const f = fixture(), u = f.UI, sec = f.Game.state.sects[0]; sec.relation = -80;
  u.showWarRoom(sec.id); u._warTactic(sec.id, 'siege');
  assert.match(f.html, /tactic-btn primary[^>]*[\s\S]*?围/); assert.equal(u._warState.tactic, 'siege');
});
test('毁灭、附庸、待处置宗门不能刷战利品，处置只能结算一次', () => {
  const f = fixture(), g = f.Game, sec = g.state.sects[0]; f.random(0); sec.relation = -80;
  assert.equal(g.startAssault(sec.id, {front:[1],mid:[],back:[]}, 'frontal').win, true);
  assert.ok(g.nextMonth().err); assert.ok(g.postWar(sec.id, 'invalid').err); assert.equal(sec.broken, true);
  assert.equal(g.postWar(sec.id, 'destroy').ok, true); const money = g.state.resources.lingshi;
  assert.ok(g.postWar(sec.id, 'destroy').err); g.state.month++;
  assert.ok(g.startWar(sec).err); g.worldTick([]); assert.equal(sec.power, 0); assert.equal(g.state.resources.lingshi, money);
  const other = g.state.sects[1]; other.vassal = true; assert.ok(g.startWar(other).err);
});
test('向盟友宣战从联盟移除，贸易与重复结盟不重复收费', () => {
  const f = fixture(), g = f.Game, sec = g.state.sects[0]; f.rich(); sec.relation = 100;
  assert.equal(g.diploAction(sec.id, 'trade').ok, true); const money = g.state.resources.lingshi;
  assert.ok(g.diploAction(sec.id, 'trade').err); assert.equal(g.state.resources.lingshi, money);
  g.diploAction(sec.id, 'ally'); const after = g.state.resources.lingshi;
  assert.ok(g.diploAction(sec.id, 'ally').err); assert.equal(g.state.resources.lingshi, after);
  g.state.alliance = {members:[sec.id],prestige:20}; g.startWar(sec);
  assert.equal(g.state.alliance.members.length, 0); assert.equal(sec.trade, false); assert.equal(sec.allied, false);
});
test('讲学按目标每月一次，联盟议事每月一次，失败不占次数', () => {
  const f = fixture(), g = f.Game, sec = g.state.sects[0]; g.state.disciples[1].cls = 'preach';
  assert.equal(g.diploAction(sec.id, 'lecture').ok, true); assert.ok(g.diploAction(sec.id, 'lecture').err);
  g.state.alliance = { members: [sec.id], prestige: 20, raidCd: 0 };
  const topic = {title:'测试', options:[{label:'修行',effect:{allExp:10}}]};
  assert.equal(g.applyCouncil(topic, 0).ok, true); assert.ok(g.applyCouncil(topic, 0).err);
  g.state.month++; assert.equal(g.applyCouncil(topic, 0).ok, true);
});
test('商队由灵石采购；成功返本加利润，失败损失货款，不改宗门商品库存', () => {
  const f = fixture(), g = f.Game; f.rich(); const route = f.run('TRADE_ROUTES[0]');
  const money = g.state.resources.lingshi, herbs = g.state.resources.lingyao;
  assert.ok(g.dispatchCaravan(route.id, route.goods[0], -10, null).err);
  assert.ok(g.dispatchCaravan(route.id, route.goods[0], 1.2, null).err);
  assert.equal(g.dispatchCaravan(route.id, route.goods[0], 10, 2).ok, true);
  const cost = g.state.caravans[0].cost; assert.equal(g.state.resources.lingshi, money-cost);
  assert.equal(g.state.resources.lingyao, herbs); assert.ok(g.sendAdventure(2, 'wild').err); assert.ok(g.assignJob('yanwu', 2));
  g.state.caravans[0].monthsLeft = 1; f.random(0.99); g.caravanTick([]);
  assert.ok(g.state.resources.lingshi > money); assert.equal(g.state.caravans.length, 0);
  const before = g.state.resources.lingshi; g.dispatchCaravan(route.id, route.goods[0], 10, 2);
  g.state.caravans[0].monthsLeft = 1; f.random(0); g.caravanTick([]);
  assert.equal(g.state.resources.lingshi, before-cost); assert.equal(g.state.disciples[1].injuredMonths, 4);
});
test('分宗拒绝重复或外出名单，分宗人员不能同时护送或历练', () => {
  const f = fixture(), g = f.Game; f.rich(); g.state.spiritChannel = true;
  for (let i=1; i<4; i++) { const d=g.makeDisciple({realm:2}); g.state.disciples.push(d); }
  const ids=g.state.disciples.slice(-3).map(d=>d.id);
  assert.ok(g.establishBranch([ids[0],ids[0],ids[0]]).err);
  assert.equal(g.establishBranch(ids).ok, true); assert.ok(g.sendAdventure(ids[0], 'wild').err);
  assert.ok(g.dispatchCaravan(f.run('TRADE_ROUTES[0].id'), 'lingyao', 10, ids[0]).err);
  g.state.disciples.slice(-3).forEach(d=>{d.injuredMonths=1;}); assert.equal(g.branchPower(), 0);
});
test('跨界贸易每宗每月一次，不能在未建分宗时领取', () => {
  const f=fixture(),g=f.Game; g.state.spiritSects=[{id:'test',relation:30}];
  assert.ok(g.spiritDiplo('test','trade').err); g.state.branch={disciples:[]};
  assert.equal(g.spiritDiplo('test','trade').ok,true); const money=g.state.resources.lingshi;
  assert.ok(g.spiritDiplo('test','trade').err); assert.equal(g.state.resources.lingshi,money);
  g.state.month++; assert.equal(g.spiritDiplo('test','trade').ok,true);
});
test('渡劫不能普通突破或跳雷；重开窗口和读档保留波次及丹药', () => {
  const f=fixture(),g=f.Game,d=g.state.disciples[0]; d.realm=7;d.stage=3;f.full(d);g.state.spiritChannel=true;f.random(0);
  assert.ok(g.tryBreakthrough(d.id).err); assert.ok(g.dujieWave(d.id,9,0,[]).err);
  const pills=g.state.resources.danyao; assert.equal(g.dujieWave(d.id,1,2,[]).passed,true);
  assert.equal(g.state.resources.danyao,pills-2); assert.ok(g.nextMonth().err);
  assert.equal(g.load(0),true); const loaded=g.state.disciples[0]; assert.equal(loaded.tribulation.wave,1);
  f.UI.showDujie(loaded.id); assert.equal(f.UI._dujieState.wave,1); assert.match(f.html,/dujie-wave pass/);
  assert.equal(g.dujieWave(loaded.id,2,999,[999]).passed,true); assert.equal(g.state.resources.danyao,pills-2);
  for(let wave=3;wave<=9;wave++) assert.equal(g.dujieWave(loaded.id,wave,0,[]).passed,true);
  assert.equal(loaded.ascended,true); assert.equal(g.aliveDisciples().filter(x=>x.isLeader).length,1);
});
test('渡劫初始雷格无失败标记；失败和陨落均清除进度并正确继位', () => {
  const f=fixture(),g=f.Game,d=g.state.disciples[0]; d.realm=7;d.stage=3;f.full(d);g.state.spiritChannel=true;
  f.UI.showDujie(d.id); assert.doesNotMatch(f.html,/dujie-wave fail/); assert.match(f.html,/dujie-wave now/);
  f.random(0.9999); const r=g.dujieWave(d.id,1,0,[]); assert.equal(r.success,false); assert.equal(d.tribulation,null); assert.equal(d.alive,false);
  assert.equal(g.aliveDisciples().filter(x=>x.isLeader).length,1);
});
test('待选事件在自动存档中保留；资源不足不丢事件，成功后只结算一次', () => {
  const f=fixture(),g=f.Game,u=f.UI; f.quiet(); const ev=f.EVENTS.find(e=>e.options.some(o=>o.effect.res&&o.effect.res.lingshi<0));
  g.rollEvent=()=>ev; g.nextMonth(); assert.equal(g.state.pendingEvents[0].type,'event');
  assert.equal(g.load(0),true); assert.equal(g.state.pendingEvents[0].ev.id,ev.id); assert.ok(g.nextMonth().err);
  u._drainQueue(); g.state.resources.lingshi=0; const index=ev.options.findIndex(o=>o.effect.res&&o.effect.res.lingshi<0);
  u.chooseEvent(ev.id,index); assert.equal(g.state.pendingEvents.length,1);
  f.rich(); u.chooseEvent(ev.id,index); const money=g.state.resources.lingshi;
  assert.equal(g.state.pendingEvents.length,0); u.chooseEvent(ev.id,index); assert.equal(g.state.resources.lingshi,money);
});
test('存档损坏安全返回且不改当前进度，旧档补齐默认字段和清理非法岗位', () => {
  const f=fixture(),g=f.Game,original=g.state; f.storage.set(g.saveKey(1),'{broken'); assert.equal(g.load(1),false); assert.equal(g.saveInfo(1),null); assert.equal(g.state,original);
  const old=JSON.parse(JSON.stringify(original)); delete old.caravans;delete old.pendingEvents;delete old.generation;
  old.jobs={yanwu:[1,1,2,999],danfang:[3]};old.disciples[1].exp=999; f.storage.set(g.saveKey(1),JSON.stringify(old));
  assert.equal(g.load(1),true); assert.equal(g.state.generation,1); assert.equal(g.state.pendingEvents.length,0);
  assert.equal(g.state.jobs.yanwu.join(','),'1,2'); assert.equal(g.state.jobs.danfang,undefined);
  assert.equal(g.state.disciples[1].exp,f.stageExpNeed(0,0));
  const bad=JSON.parse(JSON.stringify(g.state));bad.resources.lingshi=-1;f.storage.set(g.saveKey(2),JSON.stringify(bad));
  const current=g.state;assert.equal(g.load(2),false);assert.equal(g.state,current);
});
test('客卿年龄低于寿元，零俸禄按配置结算，离宗掌门自动继位', () => {
  const f=fixture(),g=f.Game; f.rich(); f.random(0); const r=g.recruitKeqing(); assert.ok(r.d.lifespanLeft>0);
  const d=r.d; d.realm=1;d.isLeader=true; g.state.disciples[0].isLeader=false;
  const money=g.state.resources.lingshi;g.keqingTick([]);assert.equal(g.state.resources.lingshi,money-f.KEQING.salaryBase[1]);
  d.realm=4;g.state.resources.lingshi=0;g.keqingTick([]);assert.equal(d.alive,false);assert.equal(g.aliveDisciples().filter(x=>x.isLeader).length,1);
});
test('建筑升级计入底蕴，丹房修复实际停产一月，传承修为不溢出', () => {
  const f=fixture(),g=f.Game; f.rich(); f.quiet(); const before=g.state.heritage||0;assert.equal(g.upgradeBuilding('lingtian'),null);assert.ok(g.state.heritage>before);
  g.state.buildings.danfang=1;const d=g.state.disciples[1];d.cls='dan';g.assignJob('danfang',d.id);
  const ev=f.EVENTS.find(e=>e.id==='zhalu');g.applyEventOption(ev,0);const pills=g.state.resources.danyao;
  g.nextMonth();assert.equal(g.state.resources.danyao,pills);g.nextMonth();assert.ok(g.state.resources.danyao>pills);
  f.full(d);const elder=g.state.disciples[0];elder.realm=4;g.removeDisciple(elder);assert.ok(d.exp<=f.stageExpNeed(d.realm,d.stage));
});

for (const [kind, poolName, method] of [['普通事件','EVENTS','applyEventOption'],['全界事件','WORLD_EVENTS','applyWorldEvent'],['联盟议事','COUNCIL_TOPICS','applyCouncil']]) {
  const seed=fixture();
  for(const ev of seed[poolName]) for(let i=0;i<ev.options.length;i++) test(`${kind} ${ev.id||ev.title} 选项${i+1}可完整结算且资源保持有效`,()=>{
    const f=fixture(),g=f.Game;f.rich();g.state.alliance={members:g.state.sects.slice(0,2).map(x=>x.id),prestige:20,raidCd:0};
    const result=g[method](f[poolName].find(x=>(x.id||x.title)===(ev.id||ev.title)),i);
    assert.equal(result.ok,true);assert.ok(Object.values(g.state.resources).every(x=>Number.isFinite(x)&&x>=0));
    assert.ok(g.aliveDisciples().every(d=>d.exp<=f.stageExpNeed(d.realm,d.stage)));
  });
}

for (const ev of fixture().ADV_EVENTS) for (let i=0;i<ev.options.length;i++) test(`历练 ${ev.id} 选项${i+1}成功与失败分支可结算`,()=>{
  for (const roll of [0,0.999]) {
    const f=fixture(),g=f.Game;f.rich();f.random(roll);
    const d=g.state.disciples[1];f.full(d);
    const result=g.applyAdvOption(d,f.ADV_EVENTS.find(x=>x.id===ev.id),i);
    assert.equal(result.ok,true);assert.ok(d.exp<=f.stageExpNeed(d.realm,d.stage));
    assert.ok(Object.values(g.state.resources).every(x=>Number.isFinite(x)&&x>=0));
  }
});

test('分宗弟子继续修炼并就地突破，护法不能跨界或重复占用',()=>{
  const f=fixture(),g=f.Game,[leader,d,guard]=g.state.disciples;f.random(0);
  d.inBranch=true;guard.inBranch=true;guard.realm=2;f.full(d);
  assert.ok(g.cultivationGain(d)>0);assert.ok(g.guardianError(d,[leader.id],2,1));
  assert.equal(g.tryBreakthrough(d.id,0,[guard.id]).ok,true);
  leader.realm=7;leader.stage=3;f.full(leader);g.state.spiritChannel=true;guard.realm=6;guard.inBranch=false;
  assert.equal(g.dujieWave(leader.id,1,0,[guard.id]).passed,true);
  assert.equal(g.available(guard),false);assert.equal(g.canGuard(d,guard,1),false);
});

test('全员寿尽后只保留覆灭消息，不再弹招募等事件复活宗门',()=>{
  const f=fixture(),g=f.Game;f.quiet();g.aliveDisciples().forEach(d=>{d.lifespanLeft=0.01;});
  g.rollEvent=()=>f.EVENTS.find(e=>e.options.some(o=>o.effect.recruitWounded));g.nextMonth();
  assert.equal(g.state.gameOver,true);assert.equal(g.aliveDisciples().length,0);
  assert.ok(g.state.pendingEvents.every(e=>e.type==='msgs'));assert.ok(g.nextMonth().err);
});

test('议事支付失败不占月度次数，补足资源后可以重试',()=>{
  const f=fixture(),g=f.Game;g.state.alliance={members:[],prestige:20};
  const topic={title:'补给',options:[{label:'筹款',effect:{res:{lingshi:-500}}}]};
  g.state.resources.lingshi=0;assert.ok(g.applyCouncil(topic,0).err);assert.equal(g.state.alliance.lastCouncilMonth,undefined);
  f.rich();assert.equal(g.applyCouncil(topic,0).ok,true);
});

test('固定随机种子连续运行180个月，事件与读档后资源、修为、掌门均保持一致',()=>{
  const f=fixture(),g=f.Game;f.rich();f.run('Math.random=(()=>{let seed=20261025;return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);})()');
  for(let month=0;month<180;month++) {
    if(g.aliveDisciples().length<5)g.recruit('trial');
    g.aliveDisciples().forEach(d=>{if(!g.canBreakthrough(d).err)g.tryBreakthrough(d.id,0,[]);});
    const result=g.nextMonth();assert.equal(result.err,undefined);
    while(g.state.pendingEvents.length) {
      const item=g.state.pendingEvents[0];let r={ok:true};
      if(item.type==='event')r=g.applyEventOption(item.ev,0);
      if(item.type==='world')r=g.applyWorldEvent(item.ev,item.ev.id==='tianmo'&&!g.state.alliance?1:0);
      if(item.type==='faction')r=g.applyFactionChoice(0);
      if(item.type==='adv')r=g.applyAdvOption(g.state.disciples.find(d=>d.id===item.dId),item.ev,0);
      assert.equal(r.err,undefined);g.completePendingEvent();
    }
    assert.equal(g.state.gameOver,false);assert.equal(g.aliveDisciples().filter(d=>d.isLeader).length,1);
    assert.ok(Object.values(g.state.resources).every(x=>Number.isFinite(x)&&x>=0));
    assert.ok(g.aliveDisciples().every(d=>d.exp>=0&&d.exp<=f.stageExpNeed(d.realm,d.stage)));
    if(month%12===11){assert.equal(g.save(1),true);assert.equal(g.load(1),true);}
  }
  assert.equal(g.state.year,16);assert.equal(g.state.month,1);
});

for(let i=0;i<3;i++)test(`派系裁决选项${i+1}经过界面只结算一次`,()=>{
  const f=fixture(),g=f.Game;f.rich();g.state.factionTension=100;
  const ev=g.factionTick([]);assert.ok(ev);g.state.pendingEvents=[{type:'faction',ev}];
  f.UI._drainQueue();f.UI.chooseFaction(i);assert.equal(g.state.pendingEvents.length,0);
  const snapshot=JSON.stringify(g.state);f.UI.chooseFaction(i);assert.equal(JSON.stringify(g.state),snapshot);
});

test('待选事件中最后一人陨落时，余下招募事件不能使宗门复活',()=>{
  const f=fixture(),g=f.Game;f.random(0);
  g.state.disciples.slice(1).forEach(d=>g.removeDisciple(d));
  g.state.pendingEvents=[{type:'world',ev:f.WORLD_EVENTS.find(e=>e.id==='ancient_mijing')},{type:'event',ev:f.EVENTS[0]}];
  assert.equal(g.applyWorldEvent(g.state.pendingEvents[0].ev,1).ok,true);assert.equal(g.state.gameOver,true);
  g.completePendingEvent();assert.equal(g.state.pendingEvents.length,0);
});

test('灵根命名统一且属性数越多修炼越慢，生成不出现重复属性',()=>{
  const f=fixture(),g=f.Game,d=g.state.disciples[1];
  let last=Infinity;
  for(let n=1;n<=5;n++){
    d.root={kind:'normal',elements:Array.from(f.ROOT_ELEMENTS).slice(0,n)};
    const info=f.spiritRootInfo(d.root),gain=g.cultivationGain(d);
    assert.ok(gain<last);last=gain;assert.equal(info.count,n);
    assert.match(info.name,n===1?/天灵根/:new RegExp(['','','双','三','四','五'][n]+'灵根'));
  }
  for(const e of ['雷','冰','风']){d.root={kind:'mutant',elements:[e]};assert.equal(f.spiritRootInfo(d.root).name,e+'异灵根');}
  f.run('Math.random=(()=>{let seed=20261026;return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);})()');
  for(let i=0;i<500;i++){const root=g.rollSpiritRoot();assert.equal(f.validSpiritRoot(root),true);}
  assert.equal(f.validSpiritRoot({kind:'normal',elements:['金','金']}),false);
  assert.equal(f.validSpiritRoot({kind:'mutant',elements:['金']}),false);
});

test('宗门实力和声望各自提高优秀灵根概率，游历和天才事件保留优势',()=>{
  const f=fixture(),g=f.Game;g.state.reputation=0;
  const base=g.recruitmentProfile();
  g.state.reputation=500;const fame=g.recruitmentProfile();assert.ok(fame.excellentChance>base.excellentChance);
  g.state.reputation=0;g.state.disciples.forEach(d=>{d.realm=7;d.stage=3;});
  const power=g.recruitmentProfile();assert.ok(power.excellentChance>base.excellentChance);
  g.state.reputation=500;const high=g.recruitmentProfile();assert.ok(high.excellentChance>fame.excellentChance);
  assert.ok(high.excellentChance<=30);assert.ok(Math.abs(high.weights.reduce((a,b)=>a+b,0)-100)<1e-8);
  g.newGame();assert.ok(g.recruitmentProfile({method:'travel'}).quality>g.recruitmentProfile().quality);
  assert.ok(g.recruitmentProfile({genius:true}).quality>=0.85);
  // 相同随机分位，高招贤分得到更少属性，验证实际抽签而非只验证展示公式。
  f.random(0.5);g.state.reputation=0;g.state.disciples.forEach(d=>{d.realm=0;d.stage=0;});const lowRoot=g.rollSpiritRoot();
  g.state.reputation=500;g.state.disciples.forEach(d=>{d.realm=7;d.stage=3;});const highRoot=g.rollSpiritRoot();
  assert.ok(highRoot.elements.length<lowRoot.elements.length);
});

test('招募实际应用寻访资质，UI名录详情和招募结果使用统一灵根名称',()=>{
  const f=fixture(),g=f.Game;f.rich();let opts;const original=g.rollSpiritRoot.bind(g);
  g.rollSpiritRoot=x=>{opts=x;return original(x);};
  const r=g.recruit('travel');assert.equal(opts.method,'travel');
  assert.equal(r.list[0].autoBreakthrough,true);assert.ok(f.validSpiritRoot(r.list[0].root));
  f.UI.showDiscipleDetail(r.list[0].id);assert.match(f.html,/灵根：.*灵根/);
  f.UI.doRecruit('trial');assert.match(f.html,/灵根/);
});

test('一键直接突破尊重个人开关且每人一轮一次，不消耗丹药',()=>{
  const f=fixture(),g=f.Game;f.random(0);g.state.disciples.forEach(f.full);
  const d=g.state.disciples[1];assert.equal(g.setDiscipleAutoBreakthrough(d.id,false).ok,true);
  const pills=g.state.resources.danyao,r=g.runAutoBreakthrough();
  assert.equal(r.attempted,2);assert.equal(r.succeeded,2);assert.equal(d.stage,0);assert.equal(g.state.resources.danyao,pills);
  const again=g.runAutoBreakthrough();assert.equal(again.attempted,0);
});

test('自动服丹按ID消耗上限，库存不足使用余量，无丹仍可突破',()=>{
  const f=fixture(),g=f.Game;f.random(0);g.state.disciples.forEach(f.full);
  g.setAutoBreakthrough({monthly:false,strategy:'pills',pills:2});g.state.resources.danyao=3;
  const r=g.runAutoBreakthrough();assert.equal(r.attempted,3);assert.equal(r.pillsUsed,3);assert.equal(g.state.resources.danyao,0);
  assert.match(r.results[0],/丹药 2 颗/);assert.match(r.results[1],/丹药 1 颗/);assert.match(r.results[2],/丹药 0 颗/);
});

test('等丹模式不足时不清经验也不扣余丹，获取丹药后可继续',()=>{
  const f=fixture(),g=f.Game;f.random(0);const d=g.state.disciples[1];f.full(d);
  g.setAutoBreakthrough({monthly:false,strategy:'wait',pills:2});g.state.resources.danyao=1;
  let r=g.runAutoBreakthrough();assert.equal(r.attempted,0);assert.equal(r.waiting,1);assert.equal(d.exp,f.stageExpNeed(0,0));assert.equal(g.state.resources.danyao,1);
  g.gainRes({danyao:1});r=g.runAutoBreakthrough();assert.equal(r.succeeded,1);assert.equal(r.pillsUsed,2);assert.equal(g.state.resources.danyao,0);
});

test('开启月结自动突破会在产丹修炼后执行，关闭时仍保留手动突破',()=>{
  const f=fixture(),g=f.Game;f.quiet();f.random(0);const [leader,d]=g.state.disciples;
  leader.cls='dan';g.state.buildings.danfang=1;g.assignJob('danfang',leader.id);g.state.resources.danyao=0;f.full(d);
  g.setAutoBreakthrough({monthly:true,strategy:'wait',pills:1});const month=g.state.month;g.nextMonth();
  assert.equal(d.stage,1);assert.equal(g.state.month,month+1);assert.ok(g.state.pendingEvents.some(x=>x.type==='msgs'));
  while(g.state.pendingEvents.length)g.completePendingEvent();
  g.setAutoBreakthrough({monthly:false,strategy:'direct',pills:1});f.full(d);g.nextMonth();assert.equal(d.stage,1);
});

test('等丹月结跨月自动重试，持久化开关后读档不触发额外突破',()=>{
  const f=fixture(),g=f.Game;f.quiet();f.random(0);let d=g.state.disciples[1];f.full(d);
  g.setAutoBreakthrough({monthly:true,strategy:'wait',pills:3});g.state.resources.danyao=0;
  g.nextMonth();assert.equal(d.stage,0);while(g.state.pendingEvents.length)g.completePendingEvent();
  g.gainRes({danyao:3});g.save(1);assert.equal(g.load(1),true);d=g.state.disciples[1];assert.equal(d.stage,0);
  g.nextMonth();assert.equal(d.stage,1);assert.equal(g.state.resources.danyao,0);
});

test('自动突破跳过重伤外出护送与大乘圆满，分宗驻守仍可就地突破',()=>{
  const f=fixture(),g=f.Game;f.random(0);const [a,b,c]=g.state.disciples;g.state.disciples.forEach(f.full);
  a.injuredMonths=1;b.adventure={placeId:'wild',monthsLeft:2};c.inBranch=true;
  let r=g.runAutoBreakthrough();assert.equal(r.attempted,1);assert.equal(c.stage,1);
  a.injuredMonths=0;b.adventure=null;a.realm=7;a.stage=3;f.full(a);
  g.state.caravans.push({escortId:b.id});r=g.runAutoBreakthrough();assert.equal(r.attempted,0);assert.equal(a.stage,3);
});

test('待选事件、战果、进行中雷劫或覆灭阻止一键突破且不扣资源',()=>{
  const f=fixture(),g=f.Game;g.state.disciples.forEach(f.full);
  g.state.pendingEvents=[{type:'msgs',list:['待处理']}];assert.ok(g.runAutoBreakthrough().err);g.state.pendingEvents=[];
  g.state.sects[0].broken=true;assert.ok(g.runAutoBreakthrough().err);g.state.sects[0].broken=false;
  g.state.disciples[0].tribulation={wave:1,guardians:[]};assert.ok(g.runAutoBreakthrough().err);g.state.disciples[0].tribulation=null;
  g.state.gameOver=true;assert.ok(g.runAutoBreakthrough().err);assert.equal(g.state.resources.danyao,5);
});

test('自动突破失败沿用原有陨落与继位逻辑，后续弟子仍只尝试一次',()=>{
  const f=fixture(),g=f.Game;f.random(0.999);g.state.disciples.forEach(d=>{f.full(d);});
  const r=g.runAutoBreakthrough();assert.equal(r.attempted,3);assert.equal(r.failed,3);
  assert.equal(g.aliveDisciples().length,0);assert.equal(g.state.gameOver,true);assert.ok(g.state.generation>=2);
});

test('自动突破拒绝非法设置且不覆盖原值，UI确认防止重复结算',()=>{
  const f=fixture(),g=f.Game;const original=JSON.stringify(g.state.autoBreakthrough);
  for(const cfg of [{monthly:true,strategy:'bad',pills:1},{monthly:true,strategy:'wait',pills:0},{monthly:true,strategy:'pills',pills:4},{monthly:'yes',strategy:'direct',pills:1}]){
    assert.ok(g.setAutoBreakthrough(cfg).err);assert.equal(JSON.stringify(g.state.autoBreakthrough),original);
  }
  assert.ok(g.setDiscipleAutoBreakthrough(999,true).err);assert.ok(g.setDiscipleAutoBreakthrough(1,1).err);
  f.random(0);g.state.disciples.forEach(f.full);f.UI.render=()=>{};f.UI.closeModal=()=>{};
  f.UI.confirmAutoBreakthrough();assert.match(f.html,/失败风险/);f.UI._confirmYes();assert.match(f.html,/成功 3 人/);
  const snapshot=JSON.stringify(g.state);f.UI._confirmYes();assert.equal(JSON.stringify(g.state),snapshot);
});

test('v3存档保存完整灵根和自动突破设置，false开关不被默认值覆盖',()=>{
  const f=fixture(),g=f.Game;g.setAutoBreakthrough({monthly:true,strategy:'wait',pills:3});
  g.setDiscipleAutoBreakthrough(g.state.disciples[0].id,false);const roots=JSON.stringify(g.state.disciples.map(d=>d.root));
  assert.equal(g.save(1),true);assert.equal(g.load(1),true);assert.equal(g.state.saveVersion,3);
  assert.equal(JSON.stringify(g.state.disciples.map(d=>d.root)),roots);assert.equal(g.state.disciples[0].autoBreakthrough,false);
  assert.equal(g.state.autoBreakthrough.monthly,true);assert.equal(g.state.autoBreakthrough.strategy,'wait');assert.equal(g.state.autoBreakthrough.pills,3);
});

test('旧版九种数字灵根确定性迁移，不改变当前修为和身份，重复读档不重抽',()=>{
  const f=fixture(),g=f.Game,old=JSON.parse(JSON.stringify(g.state));old.saveVersion=2;delete old.autoBreakthrough;
  old.disciples=Array.from({length:9},(_,i)=>({...old.disciples[0],id:i+1,root:i,isLeader:i===0,exp:7,autoBreakthrough:undefined}));
  f.storage.set(g.saveKey(1),JSON.stringify(old));assert.equal(g.load(1),true);
  const roots=JSON.stringify(g.state.disciples.map(d=>d.root));assert.equal(g.load(1),true);assert.equal(JSON.stringify(g.state.disciples.map(d=>d.root)),roots);
  assert.ok(g.state.disciples.every(d=>d.exp===7&&d.autoBreakthrough&&f.validSpiritRoot(d.root)));
  assert.equal(g.state.autoBreakthrough.monthly,false);assert.equal(g.state.disciples[0].root.elements[0],'金');
  assert.equal(f.spiritRootInfo(g.state.disciples[5].root).name,'雷异灵根');
  assert.match(f.spiritRootInfo(g.state.disciples[8].root).name,/天灵根/);assert.equal(g.state.saveVersion,3);
});

test('损坏的新版灵根与未来存档被安全拒绝，损坏自动突破选项安全回退',()=>{
  const f=fixture(),g=f.Game,current=g.state;const base=JSON.parse(JSON.stringify(current));
  for(const root of [0,{kind:'normal',elements:[]},{kind:'normal',elements:['金','金']},{kind:'mutant',elements:['雷','风']},{kind:'normal',elements:['光']}]){
    const broken=JSON.parse(JSON.stringify(base));broken.disciples[0].root=root;f.storage.set(g.saveKey(1),JSON.stringify(broken));assert.equal(g.load(1),false);assert.equal(g.state,current);
  }
  base.saveVersion=4;f.storage.set(g.saveKey(1),JSON.stringify(base));assert.equal(g.load(1),false);
  base.saveVersion=3;base.autoBreakthrough={monthly:true,strategy:'bad',pills:-1};f.storage.set(g.saveKey(1),JSON.stringify(base));
  assert.equal(g.load(1),true);assert.equal(g.state.autoBreakthrough.strategy,'direct');assert.equal(g.state.autoBreakthrough.pills,1);
  assert.equal(g.state.autoBreakthrough.monthly,false);
});
