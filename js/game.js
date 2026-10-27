/* ============================================================
 * 宗门长青录 - 核心游戏逻辑
 * 原则：非挂机——一切成长由玩家操作驱动，时间仅在点击
 * 「闭关一月」时推进；离线无任何收益。
 * ============================================================ */

const COMBAT_FATALITY_CHANCE = 0.05;

const Game = {
  state: null,

  // ---------- 初始化 / 新周目 ----------
  newGame(options = {}) {
    options = options && typeof options === "object" ? options : {};
    const name = String(options.name ?? "顾长风").trim();
    const gender = options.gender ?? "男";
    const sectName = String(options.sectName ?? INITIAL_STATE.sectName).trim();
    const validName = value => Array.from(value).length > 0 && Array.from(value).length <= 20 && /^[\p{L}\p{N}·・ _-]+$/u.test(value);
    if (!validName(name)) return { err: "宗主姓名限 1 至 20 个中英文字符或常用姓名符号" };
    if (!["男", "女"].includes(gender)) return { err: "请选择有效性别" };
    if (!validName(sectName)) return { err: "宗门名称限 1 至 20 个中英文字符或常用名称符号" };
    const s = JSON.parse(JSON.stringify(INITIAL_STATE));
    s.sectName = sectName;
    s.disciples = [];
    s.jobs = {};            // buildingId -> [discipleId]
    s.sects = JSON.parse(JSON.stringify(NPC_SECTS_TEMPLATE));
    s.sects.forEach(x => { x.allied = false; x.trade = false; x.atWar = false; });
    s.log = [];
    s.caravans = [];
    s.pendingEvents = [];
    s.saveVersion = 3;
    s.chaos = 0;            // 宗门混乱度（提升负面事件概率）
    s.veinDamageMonths = 0; // 灵脉受损剩余月数
    s.insightBoostMonths = 0;
    s.nextId = 1;
    s.generation = 1;       // 掌门代数
    s.gameOver = false;
    this.state = s;

    // 初始：筑基掌门 + 2 炼气弟子
    const z = this.makeDisciple({ realm: 1, isLeader: true, name, gender });
    z.personality = "沉稳"; z.cls = "sword";
    const d1 = this.makeDisciple({ realm: 0 });
    const d2 = this.makeDisciple({ realm: 0 });
    s.disciples.push(z, d1, d2);
    this.log(`太元元年，${z.name} 于破败山门立下「${s.sectName}」道统，携弟子二人，誓要重振宗门。`, "good");
    return s;
  },

  // ---------- 弟子生成 ----------
  makeDisciple(opts = {}) {
    const s = this.state;
    const gender = opts.gender || (Math.random() < 0.5 ? "男" : "女");
    const id = s ? s.nextId++ : 1;
    const name = opts.name ||
      SURNAMES[rnd(SURNAMES.length)] + (gender === "男" ? GIVEN_M[rnd(GIVEN_M.length)] : GIVEN_F[rnd(GIVEN_F.length)]);
    const root = this.rollSpiritRoot(opts);
    const realm = opts.realm || 0;
    const age = opts.isLeader ? 45 : ri(15, 25);
    const d = {
      id, name, gender,
      avatarId: (gender === "男" ? "m" : "f") + ((id % 4) + 1),
      realm, stage: 0, exp: 0,
      root, autoBreakthrough: true,
      personality: PERSONALITIES[rnd(PERSONALITIES.length)],
      cls: opts.cls || randomClass(),
      luck: ri(20, 90),
      comprehension: opts.genius ? ri(70, 98) : ri(25, 85),
      loyalty: opts.isLeader ? 100 : ri(50, 85),
      age,
      lifespanLeft: REALMS[realm].lifespan - age,
      foundationDmg: false,
      injuredMonths: 0,
      isLeader: !!opts.isLeader,
      alive: true,
      status: "active",
      biography: []
    };
    this.recordDisciple(d, "joined", opts.isLeader ? "创立宗门并成为初代掌门。" : "拜入山门，成为宗门弟子。");
    return d;
  },

  // ---------- 数值计算 ----------
  recruitmentProfile(opts = {}) {
    // 对数实力避免后期数值爆炸，声望与实力分别提供一半招贤分。
    const power = this.sectPower();
    const strength = clamp(Math.log10(1 + power / 100) / 3, 0, 1);
    const reputation = clamp(this.state.reputation / 500, 0, 1);
    let quality = clamp((strength + reputation) / 2 + (opts.method === "travel" ? ROOT_RECRUIT.travelBonus : 0), 0, 1);
    if (opts.genius) quality = Math.max(quality, ROOT_RECRUIT.geniusFloor);
    const weights = ROOT_RECRUIT.low.map((w, i) => w + (ROOT_RECRUIT.high[i] - w) * quality);
    return { power, quality, weights, excellentChance: weights[4] + weights[5] };
  },
  rollSpiritRoot(opts = {}) {
    const kind = ROOT_RECRUIT.kinds[weightedPick(this.recruitmentProfile(opts).weights)];
    if (kind === "mutant") return { kind: "mutant", elements: [ROOT_MUTATIONS[rnd(ROOT_MUTATIONS.length)]] };
    // 有限次数洗牌，固定随机数测试或极端随机源也不会死循环。
    const elements = ROOT_ELEMENTS.slice();
    for (let i = elements.length - 1; i > 0; i--) { const j = rnd(i + 1); [elements[i], elements[j]] = [elements[j], elements[i]]; }
    return { kind: "normal", elements: elements.slice(0, kind).sort((a, b) => ROOT_ELEMENTS.indexOf(a) - ROOT_ELEMENTS.indexOf(b)) };
  },
  disciplePower(d) {
    const base = REALMS[d.realm].powerBase * (1 + d.stage * 0.25);
    return Math.round(base * CLASSES[d.cls].combat * (1 + d.comprehension / 200) * (1 + this.elderBonus("war")));
  },
  sectPower() {
    return this.state.disciples.filter(d => d.alive)
      .reduce((sum, d) => sum + this.disciplePower(d), 0);
  },
  capacity() {
    const s = this.state;
    return 4 + (s.buildings.shanmen || 0) * 6 + (s.buildings.diziju || 0) * 8;
  },
  aliveDisciples() { return this.state.disciples.filter(d => d.alive); },
  cultivateSpeed(d) {
    const s = this.state;
    const root = spiritRootInfo(d.root).speed;
    const yanwu = this.cultivating(d) ? (s.buildings.yanwu || 0) * 0.15 : 0;
    const cangjing = (s.buildings.cangjing || 0) * 0.08;
    const insight = s.insightBoostMonths > 0 ? 0.10 : 0;
    const heritage = this.heritageBonus ? this.heritageBonus() : 0;
    const elderCul = this.elderBonus ? this.elderBonus("cultivate") : 0;
    const fd = d.foundationDmg ? 0.8 : 1;
    const romance = d.romance ? 0.95 : 1;
    return root * (d.comprehension / 50) * (1 + yanwu + cangjing + insight + heritage + elderCul) * fd * romance;
  },
  hasJob(d) {
    return Object.values(this.state.jobs).some(list => list.includes(d.id));
  },
  cultivating(d) {
    return (this.state.jobs.yanwu || []).includes(d.id);
  },
  monthKey() { return `${this.state.year}-${this.state.month}`; },
  stationary(d) { return !!d && d.alive && !d.adventure && !this.escorting(d) && !d.tribulation && !this.state.disciples.some(x => x.alive && x.tribulation && x.tribulation.guardians.includes(d.id)); },
  atHome(d) { return this.stationary(d) && !d.inBranch; },
  escorting(d) { return this.state.caravans.some(c => c.escortId === d.id); },
  available(d) { return this.atHome(d) && d.injuredMonths <= 0; },
  ritualAvailable(d) { return this.stationary(d) && d.injuredMonths <= 0; },
  canGuard(d, g, minRealm) { return !!g && g.id !== d.id && this.ritualAvailable(g) && !!g.inBranch === !!d.inBranch && g.realm >= minRealm; },
  cultivationGain(d) {
    if (!d.alive || d.injuredMonths > 0 || d.adventure || this.escorting(d) || d.tribulation) return 0;
    return this.cultivateSpeed(d) * 10 * (this.hasJob(d) && !this.cultivating(d) ? 0.5 : 1);
  },
  addExp(d, amount) { d.exp = Math.min(stageExpNeed(d.realm, d.stage), Math.max(0, d.exp + amount)); },
  recordDisciple(d, kind, text) {
    if (!d) return;
    if (!Array.isArray(d.biography)) d.biography = [];
    const s = this.state;
    d.biography.push({ date: s ? `太元${s.year}年${s.month}月` : "入门", age: Math.floor(d.age),
      realm: d.realm, stage: d.stage, kind, text });
  },
  discipleStatus(d) {
    if (!d) return "未知";
    const status = d.status || (d.alive ? "active" : d.ascended ? "ascended" : "unknown");
    return ({ active: "在宗", deceased: "陨落", expelled: "逐出山门", departed: "离宗", ascended: "飞升", unknown: "离册（旧档原因未记载）" })[status] || "离册（旧档原因未记载）";
  },
  removeDisciple(d, legacy = true, status = legacy ? "deceased" : "departed", reason = legacy ? "身死道消" : "离开宗门") {
    if (!d || !d.alive) return;
    const wasLeader = d.isLeader;
    d.finalPower = this.disciplePower(d);
    d.exitTime = { year: this.state.year, month: this.state.month };
    d.alive = false; d.status = status; d.exitReason = reason;
    d.isLeader = false; d.isElder = false; d.inBranch = false; d.autoBreakthrough = false;
    d.adventure = null; d.tribulation = null;
    this.removeFromJobs(d.id);
    if (this.state.branch && Array.isArray(this.state.branch.disciples))
      this.state.branch.disciples = this.state.branch.disciples.filter(id => id !== d.id);
    this.state.caravans.forEach(c => { if (c.escortId === d.id) c.escortId = null; });
    this.state.disciples.forEach(x => {
      if (x.tribulation) x.tribulation.guardians = x.tribulation.guardians.filter(id => id !== d.id);
    });
    this.recordDisciple(d, status, reason);
    if (legacy) this.leaveLegacy(d);
    if (wasLeader) this.handleLeaderDeath();
    this.state.gameOver = !this.aliveDisciples().length;
  },
  resolveCombatCasualty(d, injuredMonths, reason) {
    if (!d || !d.alive) return "unharmed";
    if (Math.random() < COMBAT_FATALITY_CHANCE) {
      this.removeDisciple(d, true, "deceased", `${reason}，遭强敌重创，陨落身亡。`);
      return "deceased";
    }
    d.injuredMonths = injuredMonths;
    this.recordDisciple(d, "injured", `遭遇强敌：${reason}，重伤 ${injuredMonths} 个月。`);
    return "injured";
  },
  expelDisciple(id) {
    const d = this.state.disciples.find(x => x.id === id);
    if (!d || !d.alive) return { err: "该弟子不在宗门" };
    if (d.isLeader) return { err: "掌门不可逐出山门" };
    if (d.adventure || this.escorting(d) || d.tribulation || this.state.disciples.some(x => x.alive && x.tribulation && x.tribulation.guardians.includes(id)))
      return { err: "弟子外出、护送或参与渡劫期间不可逐出" };
    if (this.state.pendingEvents.some(item => item.type === "adv" && item.dId === id)) return { err: "请先处理该弟子的历练事件" };
    this.removeDisciple(d, false, "expelled", "经宗门裁决，逐出山门；不再享有宗门身份、岗位与供奉。");
    this.log(`${d.name} 被逐出山门，人物留档仍可查阅。`, "bad");
    const saved = this.save(0);
    return { ok: true, disciple: d, saved };
  },
  warError(sect) {
    if (this.state.gameOver) return "宗门已覆灭";
    if (!sect || !this.state.sects.includes(sect)) return "宗门不存在";
    if (sect.destroyed) return "该宗门已覆灭";
    if (sect.vassal) return "对方已是我宗附庸";
    if (sect.broken) return "请先完成该宗门的战后处置";
    if (sect.lastWarMonth === this.monthKey()) return "本月已与该宗门交战，请下月再战";
    return null;
  },
  guardianError(d, ids, max, minRealm) {
    if (!Array.isArray(ids) || ids.length > max || new Set(ids).size !== ids.length) return "护法人数无效";
    if (ids.some(id => {
      const g = this.state.disciples.find(x => x.id === id);
      return !this.canGuard(d, g, minRealm);
    })) return "护法须为同处本宗或分宗的健康高阶修士";
    return null;
  },
  canBreakthrough(d) {
    if (!d || !d.alive) return { err: "弟子不存在" };
    if (!this.ritualAvailable(d)) return { err: "需健康且驻守本宗或分宗的弟子方可突破" };
    if (d.realm >= 8 || (d.realm === 7 && d.stage === 3)) return { err: "请通过九霄雷劫渡劫飞升，不能普通突破" };
    if (d.exp < stageExpNeed(d.realm, d.stage)) return { err: "修为未满" };
    return { ok: true };
  },

  // ---------- 岗位 ----------
  assignJob(bId, dId) {
    const s = this.state;
    const b = BUILDINGS[bId];
    if (!b) return "建筑不存在";
    if (!(s.buildings[bId] > 0)) return "请先建造该建筑";
    if (!b.jobs) return "该建筑没有岗位";
    if (!this.available(s.disciples.find(d => d.id === dId))) return "弟子正在外出或疗伤，无法任职";
    if (!s.jobs[bId]) s.jobs[bId] = [];
    if (s.jobs[bId].includes(dId)) return "该弟子已在此岗位";
    if (s.jobs[bId].length >= b.jobs) return "岗位已满";
    // 从其他岗位移除（一人一岗）
    for (const k in s.jobs) s.jobs[k] = s.jobs[k].filter(x => x !== dId);
    s.jobs[bId].push(dId);
    return null;
  },
  unassignJob(bId, dId) {
    const s = this.state;
    if (s.jobs[bId]) s.jobs[bId] = s.jobs[bId].filter(x => x !== dId);
  },

  // ---------- 建筑升级 ----------
  upgradeCost(bId) {
    const s = this.state;
    const lv = s.buildings[bId] || 0;
    return BUILDINGS[bId].cost(lv + 1);
  },
  canAfford(cost) {
    const r = this.state.resources;
    return Object.entries(cost).every(([k, v]) => (r[k] || 0) >= v);
  },
  payCost(cost) {
    const r = this.state.resources;
    Object.entries(cost).forEach(([k, v]) => r[k] -= v);
  },
  gainRes(delta) {
    const r = this.state.resources;
    Object.entries(delta).forEach(([k, v]) => { r[k] = Math.max(0, (r[k] || 0) + v); });
  },
  upgradeBuilding(bId) {
    const s = this.state;
    const b = BUILDINGS[bId];
    if (!b) return "建筑不存在";
    const lv = s.buildings[bId] || 0;
    if (lv >= b.maxLv) return "已达最高等级";
    const cost = this.upgradeCost(bId);
    if (!this.canAfford(cost)) return "资源不足";
    this.payCost(cost);
    s.buildings[bId] = lv + 1;
    this.addHeritage(HERITAGE.sources.buildingLv, `${b.name}升级`);
    this.log(`【${b.name}】升至 ${lv + 1} 级。`, "good");
    return null;
  },

  // ---------- 招募 ----------
  recruit(method) {
    const s = this.state;
    if (s.gameOver) return { err: "宗门已覆灭，请读档或重开" };
    const cfg = RECRUIT[method];
    if (!cfg) return { err: "无效招募方式" };
    if (this.aliveDisciples().length >= this.capacity()) return { err: "弟子居已满，无法容纳更多弟子" };
    if (!this.canAfford(cfg.cost)) return { err: "灵石不足" };
    this.payCost(cfg.cost);
    const n = ri(cfg.count[0], cfg.count[1]);
    const list = [];
    for (let i = 0; i < n && this.aliveDisciples().length < this.capacity(); i++) {
      const d = this.makeDisciple({ realm: 0, method });
      if (method === "travel") d.comprehension = Math.min(99, d.comprehension + 15);
      s.disciples.push(d);
      list.push(d);
    }
    this.log(`通过【${cfg.name}】招收弟子 ${list.map(d => d.name).join("、")}。`);
    return { list };
  },

  // ---------- 突破 ----------
  setAutoBreakthrough(settings) {
    if (!settings || typeof settings.monthly !== "boolean" || !Object.hasOwn(AUTO_BREAKTHROUGH, settings.strategy) ||
        !Number.isInteger(settings.pills) || settings.pills < 1 || settings.pills > BREAKTHROUGH.maxPill) return { err: "自动突破设置无效" };
    this.state.autoBreakthrough = { monthly: settings.monthly, strategy: settings.strategy, pills: settings.pills };
    return { ok: true };
  },
  setDiscipleAutoBreakthrough(id, enabled) {
    const d = this.state.disciples.find(x => x.id === id && x.alive);
    if (!d || typeof enabled !== "boolean") return { err: "弟子或自动突破开关无效" };
    d.autoBreakthrough = enabled;
    return { ok: true };
  },
  autoBreakthroughError() {
    const s = this.state;
    if (s.gameOver) return "宗门已覆灭";
    if ((s.pendingEvents || []).length) return "请先处理本月事件";
    if (s.sects.some(sec => sec.broken)) return "请先完成战后处置";
    if (this.aliveDisciples().some(d => d.tribulation)) return "请先完成渡劫";
    return null;
  },
  runAutoBreakthrough() {
    const err = this.autoBreakthroughError();
    if (err) return { err };
    const cfg = this.state.autoBreakthrough;
    const report = { attempted: 0, succeeded: 0, failed: 0, waiting: 0, skipped: 0, pillsUsed: 0, results: [] };
    // 固定按 ID 依次处理，每位弟子每轮最多一次，复用手动突破的全部风险与继位流程。
    const ids = this.aliveDisciples().map(d => d.id).sort((a, b) => a - b);
    ids.forEach(id => {
      const d = this.state.disciples.find(x => x.id === id);
      if (!d.autoBreakthrough || this.canBreakthrough(d).err) { report.skipped++; return; }
      if (cfg.strategy === "wait" && this.state.resources.danyao < cfg.pills) {
        report.waiting++; report.results.push(`${d.name}：等待丹药（需 ${cfg.pills} 颗）`); return;
      }
      const pills = cfg.strategy === "direct" ? 0 : Math.min(cfg.pills, Math.floor(this.state.resources.danyao));
      const r = this.tryBreakthrough(id, pills, []);
      if (r.err) { report.skipped++; return; }
      report.attempted++; report.pillsUsed += pills;
      if (r.ok) report.succeeded++; else report.failed++;
      report.results.push(`${d.name}：${r.ok ? `突破至${REALMS[d.realm].name}${STAGES[d.stage]}` : r.msg}（丹药 ${pills} 颗）`);
    });
    this.log(`【自动突破】尝试 ${report.attempted} 人，成功 ${report.succeeded} 人，失败 ${report.failed} 人，等丹 ${report.waiting} 人，耗丹 ${report.pillsUsed} 颗。`);
    return report;
  },
  breakthroughInfo(d) {
    // 返回是否为大境界突破、成功率构成
    const isMajor = d.stage === 3;
    const base = isMajor ? REALMS[d.realm].breakthroughBase : 0.95;
    return { isMajor, base };
  },
  breakthroughRate(d, pills, guardians) {
    const { base } = this.breakthroughInfo(d);
    let rate = base + pills * BREAKTHROUGH.pillBonus
      + Math.min(2, guardians) * BREAKTHROUGH.guardianBonus
      + (d.luck - 50) / 500
      + (this.qiyunBonus ? this.qiyunBonus() : 0);
    return Math.max(0.05, Math.min(0.98, rate));
  },
  tryBreakthrough(dId, pills = 0, guardianIds = []) {
    const s = this.state;
    const d = s.disciples.find(x => x.id === dId);
    const check = this.canBreakthrough(d);
    if (check.err) return check;
    if (!Number.isInteger(pills) || pills < 0 || pills > BREAKTHROUGH.maxPill) return { err: "丹药数量无效" };
    const guardErr = this.guardianError(d, guardianIds, 2, d.realm + 1);
    if (guardErr) return { err: guardErr };
    const need = stageExpNeed(d.realm, d.stage);
    if (d.exp < need) return { err: "修为未满" };
    if (pills > 0) {
      if (s.resources.danyao < pills) return { err: "丹药不足" };
      s.resources.danyao -= pills;
    }
    const rate = this.breakthroughRate(d, pills, guardianIds.length);
    const { isMajor } = this.breakthroughInfo(d);
    const roll = Math.random();
    d.exp = 0;
    if (roll < rate) {
      if (isMajor) {
        d.realm = Math.min(REALMS.length - 1, d.realm + 1);
        d.stage = 0;
        d.lifespanLeft += Math.round(REALMS[d.realm].lifespan * 0.5);
        if (this.addHeritage) this.addHeritage(HERITAGE.sources.majorBreakthrough, `${d.name} 突破大境界`);
        this.recordDisciple(d, "breakthrough", `突破至 ${REALMS[d.realm].name}期。`);
        this.log(`【大喜】${d.name} 成功突破至【${REALMS[d.realm].name}期】！寿元大增！`, "good");
        return { ok: true, major: true };
      }
      d.stage++;
      this.recordDisciple(d, "breakthrough", `突破至 ${REALMS[d.realm].name}${STAGES[d.stage]}。`);
      this.log(`${d.name} 突破至 ${REALMS[d.realm].name}${STAGES[d.stage]}。`, "good");
      return { ok: true, major: false };
    }
    // 失败惩罚
    const penalty = weightedObjPick(BREAKTHROUGH.failTable);
    let msg = `${d.name} 突破失败——${penalty.text}。`;
    if (penalty.type === "drop_stage") {
      if (d.stage > 0) d.stage--; else if (d.realm > 0) { d.realm--; d.stage = 3; }
    } else if (penalty.type === "injured") {
      d.injuredMonths = 12;
    } else if (penalty.type === "foundation") {
      d.foundationDmg = true;
    } else if (penalty.type === "death") {
      this.removeDisciple(d, true, "deceased", "突破失败，走火入魔，身死道消。");
      msg = `${d.name} 突破失败，走火入魔，身死道消！宗门上下一片哀恸。`;
    }
    d.loyalty = Math.max(0, d.loyalty - 5);
    if (d.alive) this.recordDisciple(d, "breakthrough_failed", msg);
    this.log(msg, "bad");
    return { ok: false, penalty: penalty.type, msg };
  },
  removeFromJobs(dId) {
    for (const k in this.state.jobs)
      this.state.jobs[k] = this.state.jobs[k].filter(x => x !== dId);
  },

  // ---------- 外交 ----------
  diploAction(sectId, actionId) {
    const s = this.state;
    const sect = s.sects.find(x => x.id === sectId);
    const act = DIPLO_ACTIONS.find(a => a.id === actionId);
    if (!sect || !act) return { err: "无效操作" };
    if (sect.destroyed || sect.vassal || sect.broken) return { err: "该宗门当前不可执行此外交操作" };
    if (actionId === "declare") return this.startWar(sect);
    if (actionId === "trade" && sect.trade) return { err: "已开通贸易" };
    if (actionId === "ally" && sect.allied) return { err: "已缔结同盟" };
    if (sect.atWar && (actionId === "trade" || actionId === "ally")) return { err: "交战期间不可通商或结盟" };
    if (actionId === "lecture" && sect.lastLectureMonth === this.monthKey()) return { err: "本月已讲学" };
    if (!this.canAfford(act.cost)) return { err: "资源不足" };
    if (act.needRel && sect.relation < act.needRel) return { err: `关系不足（需≥${act.needRel}）` };
    if (act.needClass && !this.aliveDisciples().some(d => this.available(d) && d.cls === act.needClass))
      return { err: "需要一名【传道】职业弟子" };
    this.payCost(act.cost);

    if (actionId === "lecture") sect.lastLectureMonth = this.monthKey();
    if (actionId === "ally") {
      sect.allied = true;
      this.log(`与【${sect.name}】缔结攻守同盟！`, "good");
      return { ok: true, msg: `已与【${sect.name}】结盟。` };
    }
    if (actionId === "trade") {
      if (sect.trade) return { err: "已开通贸易" };
      sect.trade = true;
    }
    const relGain = act.rel > 0 ? Math.round(act.rel * (1 + this.elderBonus("diplo"))) : act.rel;
    sect.relation = clamp(sect.relation + relGain, -100, 100);
    if (act.rep) s.reputation += act.rep;
    this.log(`对【${sect.name}】执行【${act.name}】，关系 ${relGain >= 0 ? "+" : ""}${relGain}（当前 ${sect.relation}）。`);
    return { ok: true, msg: `${act.name}完成：与【${sect.name}】关系变为 ${sect.relation}（${relationLevel(sect.relation).name}）` };
  },

  // ---------- 战争（小队级冲突） ----------
  startWar(sect) {
    const s = this.state;
    const err = this.warError(sect);
    if (err) return { err };
    const fighters = this.aliveDisciples().filter(d => this.available(d));
    if (!fighters.length) return { err: "没有可出战弟子" };
    sect.lastWarMonth = this.monthKey();
    sect.atWar = true;
    sect.allied = false; sect.trade = false;
    if (s.alliance) s.alliance.members = s.alliance.members.filter(id => id !== sect.id);
    const myPower = fighters.reduce((sum, d) => sum + this.disciplePower(d), 0);
    const theirPower = sect.power;
    // 战术加成由玩家在 UI 选择；此处用默认正面强攻
    const ratio = myPower / Math.max(1, theirPower);
    const winRate = clamp(0.15 + ratio * 0.4, 0.05, 0.9);
    const win = Math.random() < winRate;
    fighters.forEach(d => this.recordDisciple(d, "battle", `参与对【${sect.name}】的宗门战争，${win ? "获胜" : "战败"}。`));
    if (win) {
      const loot = { lingshi: ri(80, 200), lingyao: ri(5, 20), kuangshi: ri(10, 30) };
      this.gainRes(loot);
      s.reputation -= 5;
      sect.power = Math.round(sect.power * 0.85);
      sect.relation = -60;
      sect.atWar = false;
      this.log(`【战报】我军攻破【${sect.name}】外围，掠夺灵石×${loot.lingshi}！声望 -5，对方怀恨在心。`, "good");
      return { ok: true, war: true, win: true, loot, msg: `战胜【${sect.name}】！缴获灵石×${loot.lingshi}、灵药×${loot.lingyao}、矿石×${loot.kuangshi}。\n声望 -5（周边宗门警惕），与对方关系降为死敌。` };
    }
    // 战败
    const loss = Math.round(s.resources.lingshi * 0.2);
    s.resources.lingshi -= loss;
    const victim = fighters[rnd(fighters.length)];
    const casualty = victim ? this.resolveCombatCasualty(victim, 6, `与【${sect.name}】交战时战败`) : "unharmed";
    s.reputation -= 3;
    const fate = victim ? `${victim.name}${casualty === "deceased" ? "陨落" : "重伤六个月"}` : "";
    this.log(`【战报】我军进攻【${sect.name}】失利，折损灵石×${loss}，${fate}。`, "bad");
    return { ok: true, war: true, win: false, casualty, victim: victim && victim.id,
      msg: `战败！损失灵石×${loss}，${fate ? fate + "，" : ""}声望 -3。` };
  },
  randomAliveDisciple() {
    const list = this.aliveDisciples();
    return list.length ? list[rnd(list.length)] : null;
  },

  // ---------- 月度结算（核心） ----------
  nextMonth() {
    const s = this.state;
    if (s.gameOver) return { err: "宗门已覆灭，请读档或重开" };
    if ((s.pendingEvents || []).length) return { err: "请先处理本月事件" };
    if (s.sects.some(sec => sec.broken)) return { err: "请先完成战后处置" };
    if (this.aliveDisciples().some(d => d.tribulation)) return { err: "请先完成渡劫" };
    const msgs = [];

    // 1. 建筑产出（驻守弟子驱动；灵气潮汐闭关月停产）
    const haltProduction = s.tideHaltMonths > 0;
    if (haltProduction) { s.tideHaltMonths--; msgs.push("【灵气潮汐】全宗闭关中，本月产业停产。"); }
    for (const bId in BUILDINGS) {
      if (haltProduction) break;
      const b = BUILDINGS[bId];
      const lv = s.buildings[bId] || 0;
      if (!lv || !b.prod) continue;
      if (bId === "danfang" && s.danfangHaltMonths > 0) continue;
      const workers = (s.jobs[bId] || [])
        .map(id => s.disciples.find(d => d.id === id))
        .filter(d => this.available(d));
      if (!workers.length) continue;
      // 职业匹配度：匹配职业 ×1.5，否则 ×1（灵田灵矿任意均可）
      let eff = 0;
      workers.forEach(d => {
        eff += ((b.jobCat === "any" || b.jobCat === d.cls) ? 1.5 : 0.6) * (d.xinyi ? 0.75 : 1);
      });
      // 丹房消耗灵药
      if (b.consume) {
        const canRun = Object.entries(b.consume).every(([k, v]) => s.resources[k] >= v * workers.length);
        if (!canRun) { msgs.push(`【${b.name}】灵药不足，本月停产。`); continue; }
        Object.entries(b.consume).forEach(([k, v]) => s.resources[k] -= Math.round(v * workers.length));
      }
      let mult = lv * eff;
      const prodBonus = (this.heritageBonus ? this.heritageBonus() : 0) + (this.elderBonus ? this.elderBonus("produce") : 0);
      mult *= (1 + prodBonus);
      if ((bId === "lingtian" || bId === "lingkuang") && s.veinDamageMonths > 0) mult *= 0.5;
      Object.entries(b.prod).forEach(([k, v]) => {
        const amount = Math.round(v * mult);
        s.resources[k] = (s.resources[k] || 0) + amount;
      });
    }
    if (s.veinDamageMonths > 0) s.veinDamageMonths--;
    if (s.danfangHaltMonths > 0) s.danfangHaltMonths--;

    // 2. 在宗弟子正常修炼，生产岗位半速兼修；外出与重伤期间暂停。
    this.aliveDisciples().forEach(d => this.addExp(d, this.cultivationGain(d)));
    if (s.autoBreakthrough.monthly) {
      const report = this.runAutoBreakthrough();
      if (report.attempted || report.waiting) {
        msgs.push(`【自动突破】成功 ${report.succeeded} 人，失败 ${report.failed} 人，等丹 ${report.waiting} 人，耗丹 ${report.pillsUsed} 颗。`, ...report.results);
      }
    }

    // 3. 贸易收益
    s.sects.forEach(sec => {
      if (sec.trade && !sec.atWar && !sec.destroyed && !sec.broken) {
        const profit = Math.round(20 + Math.max(0, sec.relation) * 0.5);
        s.resources.lingshi += profit;
      }
    });

    // 4. 弟子状态：伤势恢复、寿元、忠诚度
    s.disciples.forEach(d => {
      if (!d.alive) return;
      if (d.injuredMonths > 0) d.injuredMonths--;
      d.age += 1 / 12;
      d.lifespanLeft -= 1 / 12;
      if (d.lifespanLeft <= 0) {
        const wasLeader = d.isLeader;
        this.removeDisciple(d, true, "deceased", "寿元耗尽坐化。");
        if (wasLeader) {
          msgs.push(`【讣告】掌门 ${d.name} 寿元耗尽坐化，宗门已自动推定继任者（如有）。`);
          this.log(`掌门 ${d.name} 寿元耗尽坐化。`, "bad");
        } else {
          msgs.push(`${d.name} 寿元耗尽，无疾而终。`);
          this.log(`${d.name} 寿元耗尽，坐化而去。`, "bad");
        }
      }
      if (!d.alive) return;
      // 低忠诚弟子可能出走
      if (d.loyalty <= 15 && !d.isLeader && Math.random() < 0.2) {
        this.removeDisciple(d, false, "departed", "忠诚度归零，叛逃出宗。");
        msgs.push(`【叛逃】${d.name} 对宗门心灰意冷，连夜下山不知所踪！`);
        this.log(`${d.name} 忠诚度归零，叛逃出宗。`, "bad");
      }
      // 「异心」弟子随时间消化（每年忠诚回升）
      if (d.xinyi && d.alive) {
        d.loyalty = Math.min(70, d.loyalty + 2);
        if (d.loyalty >= 60) { d.xinyi = false; msgs.push(`${d.name} 已归心，「异心」消解。`); }
      }
    });

    // 5. 世界演进：NPC 宗门自主发展
    this.worldTick(msgs);

    // 5b. 阶段二：附庸供奉/反叛、商队结算
    this.vassalTick(msgs);
    this.caravanTick(msgs);

    // 5c-2. 阶段三：客卿俸禄、联盟冷却、派系张力（可能触发内斗）
    if (this.keqingTick) this.keqingTick(msgs);
    if (this.allianceTick) this.allianceTick();
    const factionEvt = this.factionTick ? this.factionTick(msgs) : null;

    // 5d. 阶段四：灵界分宗收益、全界大事件
    if (this.branchTick) this.branchTick(msgs);
    const worldEvt = this.worldEventTick ? this.worldEventTick() : null;

    // 5c. 历练弟子归来（触发历练事件，需玩家选择）
    const advReturns = this.adventureTick();

    // 6. 随机事件（必出一个，强制玩家响应）
    const ev = this.rollEvent();

    // 7. 时间推进
    s.month++;
    if (s.month > 12) { s.month = 1; s.year++; }
    if (s.insightBoostMonths > 0) s.insightBoostMonths--;

    // 8. 宗门覆灭判定
    if (!this.aliveDisciples().length) {
      s.gameOver = true;
      msgs.push("【宗门覆灭】门中已无一名弟子，道统断绝……游戏结束。");
    }

    s.pendingEvents = [];
    if (!s.gameOver) {
      if (factionEvt) s.pendingEvents.push({ type: "faction", ev: factionEvt });
      if (worldEvt) s.pendingEvents.push({ type: "world", ev: worldEvt });
      advReturns.forEach(({ d, ev }) => s.pendingEvents.push({ type: "adv", dId: d.id, ev }));
      if (ev) s.pendingEvents.push({ type: "event", ev });
    }
    if (msgs.length) s.pendingEvents.push({ type: "msgs", list: msgs });
    this.autosave();
    return { msgs, event: ev, advReturns, factionEvt, worldEvt };
  },

  handleLeaderDeath() {
    const s = this.state;
    s.disciples.forEach(d => { d.isLeader = false; });
    // 自动选境界最高者为继任掌门
    const candidates = this.aliveDisciples().sort((a, b) =>
      (b.realm * 4 + b.stage) - (a.realm * 4 + a.stage));
    if (candidates.length) {
      const heir = candidates.find(d => this.atHome(d)) || candidates[0];
      heir.isLeader = true;
      heir.inBranch = false; heir.adventure = null;
      s.caravans.forEach(c => { if (c.escortId === heir.id) c.escortId = null; });
      if (s.branch) s.branch.disciples = s.branch.disciples.filter(id => id !== heir.id);
      s.generation++;
      this.recordDisciple(heir, "succession", `继任第 ${s.generation} 代掌门。`);
      this.log(`【传承】${heir.name} 继任第 ${s.generation} 代掌门，肩负宗门兴衰。`, "good");
    }
  },

  worldTick(msgs) {
    const s = this.state;
    s.sects.forEach(sec => {
      if (sec.destroyed || sec.broken) return;
      // 自主发展：实力缓慢浮动
      sec.power = Math.max(50, sec.power + ri(-8, 12));
      // 侵略性高的宗门可能主动挑衅玩家
      if (!sec.vassal && !sec.atWar && sec.relation < -30 && Math.random() < sec.aggr * 0.15) {
        const loss = ri(20, 60);
        s.resources.lingshi = Math.max(0, s.resources.lingshi - loss);
        sec.relation = Math.max(-100, sec.relation - 10);
        msgs.push(`【边患】${sec.name} 弟子劫掠了我宗外围矿点，损失灵石×${loss}！`);
        this.log(`${sec.name} 劫掠我宗矿点，关系恶化。`, "bad");
      }
      // 关系自然漂移
      if (!sec.atWar) sec.relation = clamp(sec.relation + ri(-2, 2), -100, 100);
    });
    // 世界新闻
    if (Math.random() < 0.5) {
      const active = s.sects.filter(x => !x.destroyed);
      if (!active.length) return;
      const pick2 = () => active[rnd(active.length)].name;
      let news = WORLD_NEWS[rnd(WORLD_NEWS.length)];
      news = news.replace("{s1}", pick2()).replace("{s2}", pick2());
      this.log("【修真界传闻】" + news);
    }
  },

  // ---------- 随机事件 ----------
  rollEvent() {
    const s = this.state;
    const pool = EVENTS.filter(e => {
      if (e.needBuilding && !(s.buildings[e.needBuilding] > 0)) return false;
      if (e.needDisciple && !this.aliveDisciples().length) return false;
      if (e.needDisciple2 && this.aliveDisciples().length < 2) return false;
      return true;
    });
    if (!pool.length) return null;
    // 执法堂降低负面事件权重
    const zhifaLv = s.buildings.zhifa || 0;
    const weighted = pool.map(e => {
      let w = e.weight;
      if (e.bad) {
        w = w * Math.max(0.1, 1 - zhifaLv * 0.06 - this.elderBonus("order")) * (1 + s.chaos / 100);
      }
      return { item: e, w };
    });
    return weightedObjPick(weighted).item;
  },
  applyEventOption(ev, optIdx) {
    const s = this.state;
    if (!ev || !ev.options || !ev.options[optIdx]) return { err: "无效事件选项" };
    const opt = ev.options[optIdx];
    const ef = opt.effect;
    const out = [];
    if (ef.res) {
      // 资源不足检查（负向消耗）
      for (const [k, v] of Object.entries(ef.res)) {
        if (v < 0 && (s.resources[k] || 0) < -v) return { err: "资源不足，无法选择此项" };
      }
      this.gainRes(ef.res);
      const parts = Object.entries(ef.res).map(([k, v]) => `${RESOURCES[k].name}${v > 0 ? "+" : ""}${v}`);
      out.push(parts.join("，"));
    }
    if (ef.rep) { s.reputation += ef.rep; out.push(`声望${ef.rep > 0 ? "+" : ""}${ef.rep}`); }
    if (ef.chaos) { s.chaos += ef.chaos; }
    // 特殊效果
    if (ef.recruitWounded) {
      if (this.aliveDisciples().length >= this.capacity()) out.push("弟子居已满，伤者康复后告辞。");
      else if (Math.random() < 0.7) {
        const d = this.makeDisciple({ genius: Math.random() < 0.3 });
        s.disciples.push(d);
        out.push(`伤者${d.name}（${spiritRootInfo(d.root).name}）感恩戴德，拜入山门！`);
      } else out.push("那人竟是骗子，伤好后卷了些许灵药逃走了……");
    }
    if (ef.gamble) {
      if (Math.random() < ef.gamble.rate) {
        if (ef.gamble.win.res) this.gainRes(ef.gamble.win.res);
        out.push("挖掘顺利！获得灵石×200！");
      } else {
        s.veinDamageMonths = 1;
        out.push("灵脉受损！本月灵田灵矿产出减半。");
      }
    }
    if (ef.cureDemon) {
      const d = this.strongestDisciple();
      if (d) { this.addExp(d, 20); out.push(`${d.name} 心魔尽去，修为精进。`); }
    }
    if (ef.demonGamble) {
      const d = this.strongestDisciple();
      if (d) {
        if (Math.random() < 0.5) { d.comprehension = Math.min(99, d.comprehension + 5); out.push(`${d.name} 一朝顿悟，悟性 +5！`); }
        else { d.injuredMonths = 6; out.push(`${d.name} 走火入魔，重伤六个月！`); }
      }
    }
    if (ef.demonWall) {
      const d = this.strongestDisciple();
      if (d) { d.loyalty = Math.max(0, d.loyalty - 10); out.push(`${d.name} 面壁思过，忠诚度 -10。`); }
    }
    if (ef.punishBoth) {
      const list = this.aliveDisciples().slice(0, 2);
      list.forEach(d => d.loyalty = Math.max(0, d.loyalty - 8));
      out.push("私斗二人各受责罚，忠诚度 -8。");
    }
    if (ef.arbitrate) {
      this.aliveDisciples().forEach(d => d.loyalty = Math.min(100, d.loyalty + 4));
      out.push("处置公允，全宗忠诚度 +4。");
    }
    if (ef.expedition) {
      const d = this.aliveDisciples().filter(x => this.available(x)).sort((a, b) => this.disciplePower(b) - this.disciplePower(a))[0];
      if (!d) out.push("门中无人可派，只得作罢。");
      else {
        const win = Math.random() < clamp(0.3 + this.disciplePower(d) / 500, 0.2, 0.85);
        if (win) { this.gainRes({ lingshi: 180, lingyao: 15 }); out.push(`${d.name} 秘境夺宝而归！灵石+180、灵药+15！`); }
        else {
          const fate = this.resolveCombatCasualty(d, 4, "秘境争夺中不敌他宗修士");
          out.push(fate === "deceased" ? `${d.name} 陨落于秘境争夺……` : `${d.name} 在秘境中不敌他宗修士，重伤而归……`);
        }
      }
    }
    if (ef.relRandom) {
      const active = s.sects.filter(x => !x.destroyed);
      const sec = active[rnd(active.length)];
      if (sec) {
        sec.relation = clamp(sec.relation + ef.relRandom, -100, 100);
        out.push(`与【${sec.name}】关系 ${ef.relRandom > 0 ? "+" : ""}${ef.relRandom}`);
      }
    }
    if (ef.showForce) {
      const strong = this.sectPower() > 200;
      const active = s.sects.filter(x => !x.destroyed);
      const sec = active[rnd(active.length)];
      if (sec) sec.relation = clamp(sec.relation + (strong ? 5 : -8), -100, 100);
      if (strong) { s.reputation += 3; out.push(`来者见我宗兵强马壮，态度恭谨。声望+3`); }
      else out.push("来者暗中讥笑我宗羸弱，关系 -8。");
    }
    if (ef.insight) {
      const d = this.strongestDisciple();
      if (d) d.comprehension = Math.min(99, d.comprehension + 3);
      s.insightBoostMonths = 1;
      out.push("功法整理成册，全宗本月修炼速度 +10%。");
    }
    if (ef.insightSelf) {
      const d = this.strongestDisciple();
      if (d) { this.addExp(d, 50); d.loyalty = Math.max(0, d.loyalty - 5); out.push(`${d.name} 独悟秘法，修为大涨，忠诚度 -5。`); }
    }
    if (ef.punishDan) {
      const id = (s.jobs.danfang || [])[0];
      const d = s.disciples.find(x => x.id === id);
      if (d) { d.loyalty = Math.max(0, d.loyalty - 15); out.push(`${d.name} 受责罚，忠诚度 -15。`); }
    }
    if (ef.recruitGenius) {
      if (this.aliveDisciples().length < this.capacity()) {
        const d = this.makeDisciple({ genius: true });
        s.disciples.push(d);
        if (this.addQiyun) this.addQiyun(QIYUN.sources.genius, "天才弟子入门");
        out.push(`天才弟子 ${d.name}（${spiritRootInfo(d.root).name}，悟性${d.comprehension}）拜入山门！`);
      } else out.push("弟子居已满，错失良才……");
    }
    if (ef.beastFight) {
      if (this.sectPower() > 150) { this.gainRes({ lingyao: 10 }); out.push("众弟子击退兽潮，缴获妖兽灵药×10！"); }
      else {
        const defenders = this.aliveDisciples().filter(x => this.atHome(x));
        const d = defenders[rnd(defenders.length)];
        const fate = d ? this.resolveCombatCasualty(d, 3, "抵御兽潮时遭强敌围攻") : "unharmed";
        s.resources.lingyao = Math.max(0, s.resources.lingyao - 10);
        out.push(`苦战方退兽潮，灵田受损（灵药-10），${d ? `${d.name}${fate === "deceased" ? "陨落" : "重伤"}` : "无人伤亡"}。`);
      }
    }
    if (ef.haltDanfang) { s.danfangHaltMonths = 1; out.push("丹房停产一月。"); }
    this.log(`【事件·${ev.title}】${opt.label} → ${out.join("；") || "无事发生"}`);
    return { ok: true, msg: out.join("\n") || "风平浪静。" };
  },
  strongestDisciple() {
    return this.aliveDisciples().sort((a, b) => this.disciplePower(b) - this.disciplePower(a))[0] || null;
  },

  // ============================================================
  // 阶段二：宗门攻防战 / 附庸 / 商队 / 历练
  // ============================================================

  // ---------- 完整宗门攻防战 ----------
  // formation: {front:[id], mid:[id], back:[id]}
  calcAssaultPower(formation) {
    const s = this.state;
    let total = 0;
    const used = new Set();
    for (const row of ["front", "mid", "back"]) {
      (formation[row] || []).forEach(id => {
        const d = s.disciples.find(x => x.id === id);
        if (!this.available(d) || used.has(id)) return;
        used.add(id);
        const bonusMap = FORMATION_BONUS[row] || {};
        const mult = bonusMap[d.cls] !== undefined ? bonusMap[d.cls] : WAR_CONFIG.formationMismatch;
        total += this.disciplePower(d) * mult;
      });
    }
    return Math.round(total);
  },
  startAssault(sectId, formation, tacticId) {
    const s = this.state;
    const sect = s.sects.find(x => x.id === sectId);
    const tactic = TACTICS[tacticId];
    if (!sect || !tactic) return { err: "无效操作" };
    const err = this.warError(sect);
    if (err) return { err };
    if (sect.vassal) return { err: "对方已是我宗附庸" };
    if (sect.destroyed) return { err: "该宗门已覆灭" };
    if (sect.relation > WAR_CONFIG.assaultNeedRel) return { err: `关系未到敌对（需≤${WAR_CONFIG.assaultNeedRel}）` };
    const used = new Set();
    if (!formation || typeof formation !== "object") return { err: "无效编队" };
    for (const row of ["front", "mid", "back"]) {
      const ids = formation[row] || [];
      if (!Array.isArray(ids) || ids.length > 5) return { err: "每排最多五名弟子" };
      for (const id of ids) {
        if (used.has(id) || !this.available(s.disciples.find(d => d.id === id))) return { err: "编队存在重复或不可出战弟子" };
        used.add(id);
      }
    }
    if (!used.size) return { err: "至少派遣一名弟子出战" };
    if (tacticId === "incite") {
      if (s.resources.lingshi < 200) return { err: "策反内应需灵石×200" };
      s.resources.lingshi -= 200;
    }
    sect.lastWarMonth = this.monthKey();
    sect.lastTactic = tacticId;
    sect.atWar = true; sect.allied = false; sect.trade = false;
    if (s.alliance) s.alliance.members = s.alliance.members.filter(id => id !== sect.id);
    const atk = this.calcAssaultPower(formation);
    const def = Math.round(sect.power * (1 + WAR_CONFIG.defenseArrayBonus));
    const ratio = atk / Math.max(1, def);
    const winRate = clamp(0.1 + ratio * 0.5 + tactic.winMod, 0.05, 0.95);
    const win = Math.random() < winRate;
    used.forEach(id => {
      const d = s.disciples.find(x => x.id === id);
      this.recordDisciple(d, "battle", `参与攻打【${sect.name}】，${win ? "我方获胜" : "我方战败"}。`);
    });
    // 战损：随机出战弟子受伤
    const lossCount = Math.max(1, Math.round(used.size * (win ? 0.2 : 0.5) * tactic.lossMod));
    const injured = [];
    const fallen = [];
    const ids = [...used];
    for (let i = 0; i < lossCount && ids.length; i++) {
      const id = ids.splice(rnd(ids.length), 1)[0];
      const d = s.disciples.find(x => x.id === id);
      let fate;
      if (!win || def > atk) fate = this.resolveCombatCasualty(d, win ? 3 : 8, `攻打【${sect.name}】${win ? "时遭强敌反击" : "战败"}`);
      else {
        d.injuredMonths = 3;
        this.recordDisciple(d, "injured", `攻打【${sect.name}】获胜后负伤，休养 3 个月。`);
        fate = "injured";
      }
      if (fate === "deceased") fallen.push(d.name);
      else injured.push(d.name);
    }
    if (win) {
      sect.broken = !s.gameOver; // 全宗陨落时不能通过战后招降复活。
      this.log(`【大战】我军攻破【${sect.name}】山门！重伤：${injured.join("、") || "无"}；陨落：${fallen.join("、") || "无"}。${s.gameOver ? "门中已无人归来，道统断绝。" : "等待战后处置。"}`, s.gameOver ? "bad" : "good");
      return { ok: true, win: true, atk, def, injured, fallen,
        msg: `攻破【${sect.name}】山门！\n我方战力 ${atk} vs 守方（含大阵）${def}\n重伤：${injured.join("、") || "无"}\n陨落：${fallen.join("、") || "无"}\n\n${s.gameOver ? "门中无人归来，道统断绝；可在弟子页查阅生平。" : "请选择战后处置方式。"}`,
        needPostWar: !s.gameOver };
    }
    const loss = Math.round(s.resources.lingshi * 0.15);
    s.resources.lingshi -= loss;
    sect.relation = Math.max(-100, sect.relation - 20);
    if (tacticId === "incite") s.reputation -= 10;
    if (tacticId === "raid") s.resources.lingshi = Math.max(0, s.resources.lingshi - 80);
    this.log(`【大败】攻打【${sect.name}】失利，折损灵石×${loss}，重伤：${injured.join("、") || "无"}；陨落：${fallen.join("、") || "无"}。`, "bad");
    return { ok: true, win: false, atk, def, injured, fallen,
      msg: `攻城失利！\n我方战力 ${atk} vs 守方（含大阵）${def}\n损失灵石×${loss}，重伤：${injured.join("、") || "无"}；陨落：${fallen.join("、") || "无"}。${tacticId === "incite" ? "\n内应暴露，声望 -10！" : ""}` };
  },
  // 战后三选一
  postWar(sectId, choice) {
    const s = this.state;
    if (s.gameOver) return { err: "宗门已覆灭，无法处理战果" };
    const sect = s.sects.find(x => x.id === sectId);
    if (!sect || !sect.broken) return { err: "该宗门山门未破" };
    if (!["destroy", "vassal", "merge"].includes(choice)) return { err: "无效的处置方式" };
    sect.broken = false;
    sect.allied = false; sect.trade = false;
    if (choice === "destroy") {
      const loot = { lingshi: ri(200, 400), lingyao: ri(15, 40), kuangshi: ri(20, 50), danyao: ri(2, 8) };
      this.gainRes(loot);
      let captives = 0;
      if (Math.random() < WAR_CONFIG.captiveRate * (sect.lastTactic === "siege" ? 1.5 : 1) && this.aliveDisciples().length < this.capacity()) {
        const d = this.makeDisciple({ realm: 0 });
        d.loyalty = 20;
        s.disciples.push(d); captives = 1;
      }
      sect.destroyed = true; sect.atWar = false; sect.power = 0;
      s.reputation -= 20;
      s.sects.forEach(x => { if (!x.destroyed && x.id !== sect.id) x.relation = clamp(x.relation - 15, -100, 100); });
      this.log(`【灭门】${sect.name} 道统被夷灭，修真界震动！我宗声望大跌，各宗警惕。`, "bad");
      return { ok: true, msg: `【灭门掠夺】\n缴获：灵石×${loot.lingshi}、灵药×${loot.lingyao}、矿石×${loot.kuangshi}、丹药×${loot.danyao}\n俘虏弟子：${captives} 名\n声望 -20，全修真界关系 -15！` };
    }
    if (choice === "vassal") {
      sect.vassal = true; sect.atWar = false;
      sect.loyalty = VASSAL.loyaltyInit;
      sect.relation = 10;
      sect.power = Math.round(sect.power * 0.6);
      this.log(`【收服】${sect.name} 俯首称臣，成为我宗附庸，岁贡不断。`, "good");
      return { ok: true, msg: `【收为附庸】\n${sect.name} 保留建制，每年上缴供奉（产出的15%~25%）。\n初始忠诚度 ${VASSAL.loyaltyInit}，需定期安抚，过低将反叛！` };
    }
    if (choice === "merge") {
      sect.destroyed = true; sect.atWar = false; sect.power = 0;
      let joined = 0;
      const n = ri(2, 3);
      for (let i = 0; i < n && this.aliveDisciples().length < this.capacity(); i++) {
        const d = this.makeDisciple({ realm: Math.random() < 0.3 ? 1 : 0 });
        d.loyalty = 25; d.xinyi = true; // 异心 debuff
        s.disciples.push(d); joined++;
      }
      this.gainRes({ lingshi: ri(100, 200), lingyao: ri(10, 20) });
      this.log(`【合并】${sect.name} 全员并入我宗，${joined} 名弟子携资来投，然心怀异志，需时日消化。`);
      return { ok: true, msg: `【合并入宗】\n${joined} 名弟子加入（携带「异心」debuff：忠诚极低、产出打折扣，随时间消化）。\n获得对方库藏部分资源。` };
    }
    return { err: "无效的处置方式" };
  },
  // 附庸安抚
  sootheVassal(sectId) {
    const s = this.state;
    const sect = s.sects.find(x => x.id === sectId);
    if (!sect || !sect.vassal) return { err: "非附庸宗门" };
    if (!this.canAfford(VASSAL.sootheCost)) return { err: "灵石不足（需100）" };
    this.payCost(VASSAL.sootheCost);
    sect.loyalty = clamp(sect.loyalty + VASSAL.sootheLoyalty, 0, 100);
    this.log(`遣使安抚【${sect.name}】，忠诚度 +${VASSAL.sootheLoyalty}（当前 ${sect.loyalty}）。`);
    return { ok: true, msg: `安抚完成，${sect.name} 忠诚度 ${sect.loyalty}` };
  },
  // 附庸月度结算（供奉按年，反叛按月判定）
  vassalTick(msgs) {
    const s = this.state;
    s.sects.forEach(sec => {
      if (!sec.vassal) return;
      // 年度供奉
      if (s.month === 12) {
        const rate = VASSAL.tributeMin + Math.random() * (VASSAL.tributeMax - VASSAL.tributeMin);
        const tribute = Math.round(sec.power * rate * 0.5);
        s.resources.lingshi += tribute;
        msgs.push(`【岁贡】附庸【${sec.name}】上缴供奉灵石×${tribute}。`);
      }
      // 忠诚漂移与反叛
      sec.loyalty = clamp((sec.loyalty ?? 50) + ri(-4, 2), 0, 100);
      if (sec.loyalty < VASSAL.rebelThreshold && Math.random() < 0.25) {
        sec.vassal = false; sec.atWar = true; sec.relation = -80;
        const loss = Math.round(s.resources.lingshi * 0.1);
        s.resources.lingshi -= loss;
        msgs.push(`【叛乱】附庸【${sec.name}】举旗反叛！掠走灵石×${loss}，已与我宗进入战争状态！`);
        this.log(`附庸【${sec.name}】反叛，宗门颜面大损。`, "bad");
      }
    });
  },

  // ---------- 商路贸易 ----------
  dispatchCaravan(routeId, goodsId, amount, escortId) {
    const s = this.state;
    const route = TRADE_ROUTES.find(r => r.id === routeId);
    const goods = TRADE_GOODS[goodsId];
    if (!route || !goods) return { err: "无效路线或商品" };
    if (!route.goods.includes(goodsId)) return { err: "该路线不经营此商品" };
    if (s.caravans.some(c => c)) return { err: "同时只能有一支商队在外" };
    if (!Number.isInteger(amount) || amount <= 0) return { err: "货物数量须为正整数" };
    const cost = goods.unitCost * amount;
    if (s.resources.lingshi < cost) return { err: `灵石不足（货款需 ${cost}）` };
    if (escortId) {
      const esc = s.disciples.find(d => d.id === escortId);
      if (!this.available(esc)) return { err: "护送弟子不可用" };
      if (this.hasJob(esc)) return { err: "请先解除护送弟子的岗位" };
    }
    s.resources.lingshi -= cost;
    s.caravans.push({ routeId, goodsId, amount, escortId, cost, monthsLeft: route.months });
    this.log(`商队出发：【${route.name}】，贩运${goods.name}×${amount}（货款灵石×${cost}），${route.months} 个月后归返。`);
    if (escortId) this.recordDisciple(s.disciples.find(d => d.id === escortId), "caravan", `护送前往【${route.name}】的商队。`);
    return { ok: true };
  },
  caravanTick(msgs) {
    const s = this.state;
    const done = [];
    s.caravans.forEach(c => { c.monthsLeft--; if (c.monthsLeft <= 0) done.push(c); });
    s.caravans = s.caravans.filter(c => c.monthsLeft > 0);
    done.forEach(c => {
      const route = TRADE_ROUTES.find(r => r.id === c.routeId);
      const goods = TRADE_GOODS[c.goodsId];
      let risk = route.risk;
      if (c.escortId) {
        const esc = s.disciples.find(d => d.id === c.escortId);
        if (esc && esc.alive) risk *= clamp(1 - this.disciplePower(esc) / 2000, 0.2, 1);
      }
      if (Math.random() < risk) {
        // 被劫
        const esc = c.escortId ? s.disciples.find(d => d.id === c.escortId) : null;
        if (esc) { esc.injuredMonths = 4; this.recordDisciple(esc, "injured", `商队在【${route.name}】遇劫，重伤 4 个月。`); }
        msgs.push(`【商队遇劫】前往【${route.name}】的商队被劫！货款血本无归${esc ? `，${esc.name} 重伤` : ""}。`);
        this.log(`商队在【${route.name}】遇劫，损失惨重。`, "bad");
      } else {
        const profit = Math.round(route.profit * (1 + c.amount / 10));
        s.resources.lingshi += (c.cost ?? goods.unitCost * c.amount) + profit;
        msgs.push(`【商队归来】${goods.name}畅销，净赚灵石×${profit}！`);
        this.log(`商队自【${route.name}】归来，获利灵石×${profit}。`, "good");
      }
    });
  },

  // ---------- 外出历练 ----------
  sendAdventure(dId, placeId) {
    const s = this.state;
    const d = s.disciples.find(x => x.id === dId);
    const place = ADVENTURE_PLACES.find(p => p.id === placeId);
    if (!d || !d.alive || !place) return { err: "无效操作" };
    if (!this.available(d)) return { err: "该弟子当前不可派遣" };
    if (d.injuredMonths > 0) return { err: "重伤弟子无法历练" };
    if (d.adventure) return { err: "该弟子已在外历练" };
    if (this.hasJob(d)) return { err: "请先解除该弟子的岗位" };
    d.adventure = { placeId, monthsLeft: place.months };
    this.recordDisciple(d, "adventure", `前往【${place.name}】历练，预计 ${place.months} 个月后归来。`);
    this.log(`${d.name} 下山前往【${place.name}】历练，${place.months} 个月后归来。`);
    return { ok: true };
  },
  adventureTick() {
    const s = this.state;
    const returned = [];
    s.disciples.forEach(d => {
      if (!d.alive || !d.adventure) return;
      d.adventure.monthsLeft--;
      if (d.adventure.monthsLeft <= 0) {
        const placeId = d.adventure.placeId;
        d.adventure = null;
        const place = ADVENTURE_PLACES.find(p => p.id === placeId);
        this.recordDisciple(d, "adventure_return", `完成【${place ? place.name : placeId}】历练归来，等待处理途中遭遇。`);
        // 抽取该地点的历练事件
        const pool = ADV_EVENTS.filter(e => e.places.includes(placeId));
        if (pool.length) returned.push({ d, ev: pool[rnd(pool.length)] });
      }
    });
    return returned;
  },
  applyAdvOption(d, ev, optIdx) {
    const s = this.state;
    if (!d || !d.alive || !ev || !ev.options || !ev.options[optIdx]) return { err: "无效历练选项" };
    const opt = ev.options[optIdx];
    const ef = opt.effect;
    const out = [];
    if (ef.res) {
      for (const [k, v] of Object.entries(ef.res))
        if (v < 0 && (s.resources[k] || 0) < -v) return { err: "资源不足，无法选择此项" };
      this.gainRes(ef.res);
      out.push(this.resourceText(ef.res));
    }
    if (ef.luck) { d.luck = clamp(d.luck + ef.luck, 0, 100); out.push(`气运 ${ef.luck > 0 ? "+" : ""}${ef.luck}`); }
    if (ef.loyalty) { d.loyalty = clamp(d.loyalty + ef.loyalty, 0, 100); out.push(`忠诚度 ${ef.loyalty > 0 ? "+" : ""}${ef.loyalty}`); }
    if (ef.comprehension) { d.comprehension = clamp(d.comprehension + ef.comprehension, 0, 99); out.push(`悟性 +${ef.comprehension}`); }
    if (ef.advGamble) {
      if (Math.random() < ef.advGamble.rate) { this.gainRes(ef.advGamble.win); out.push("得手！" + Object.entries(ef.advGamble.win).map(([k, v]) => `${RESOURCES[k].name}+${v}`).join("，")); }
      else {
        const fate = this.resolveCombatCasualty(d, 4, "秘境中遭妖蟒袭击");
        out.push(fate === "deceased" ? `${d.name} 陨落于妖蟒之口……` : "妖蟒暴起伤人，重伤而归……");
      }
    }
    if (ef.sageGamble) {
      if (Math.random() < 0.5) { d.comprehension = Math.min(99, d.comprehension + 8); out.push("老丐竟是隐世高人，一语点醒梦中人，悟性 +8！"); }
      else out.push("老丐千恩万谢地走了，似乎只是个普通乞丐。");
    }
    if (ef.justiceFight) {
      if (this.disciplePower(d) > 60) { s.reputation += 5; this.gainRes({ lingshi: 100 }); out.push("击退魔修！散修感激赠礼灵石×100，声望 +5。"); }
      else {
        const fate = this.resolveCombatCasualty(d, 3, "出手救人时遭魔修围攻");
        out.push(fate === "deceased" ? `${d.name} 陨落于魔修围攻……` : "寡不敌众，负伤遁走……");
      }
    }
    if (ef.legacyExp) {
      this.addExp(d, stageExpNeed(d.realm, d.stage) * 0.5);
      out.push("古修士感悟灌顶，修为大涨！");
    }
    if (ef.fakePill) {
      if (Math.random() < 0.7) { this.gainRes({ danyao: 5 }); out.push("丹药×5 完好无损！"); }
      else { d.injuredMonths = 6; out.push("竟是假丹！服用后丹毒攻心，重伤六个月！"); }
    }
    if (ef.beastDuel) {
      if (this.disciplePower(d) > 50) { this.gainRes({ lingyao: 10 }); s.reputation += 2; out.push("斩杀妖狼，得灵药×10，声望 +2！"); }
      else {
        const fate = this.resolveCombatCasualty(d, 4, "与妖狼搏斗时不敌");
        out.push(fate === "deceased" ? `${d.name} 陨落于妖狼之口……` : "不敌妖狼，拼死逃脱，重伤四个月。");
      }
    }
    if (ef.flee) {
      if (s.resources.danyao >= 1) { s.resources.danyao--; out.push("激发遁符，有惊无险。（丹药-1）"); }
      else { d.injuredMonths = 2; out.push("无丹药可用，轻伤逃脱。"); }
    }
    if (ef.romance) {
      d.comprehension = Math.min(99, d.comprehension + 3);
      d.loyalty = Math.min(100, d.loyalty + 10);
      d.romance = true;
      out.push("结为道侣之约：悟性 +3、忠诚 +10。");
    }
    this.log(`【历练】${d.name}·${ev.title}：${opt.label} → ${out.join("；") || "平安归来"}`);
    this.recordDisciple(d, "adventure_event", `${ev.title}：${opt.label}。${out.join("；") || "平安归来"}`);
    return { ok: true, msg: out.join("\n") || `${d.name} 平安归来。` };
  },

  // ---------- 存档 ----------
  saveKey(slot) { return `zm_cql_save_${slot}`; },
  save(slot) {
    try {
      this.state.saveVersion = 3;
      const key = this.saveKey(slot);
      const value = JSON.stringify(this.state);
      const bridge = window.AndroidAppBridge;
      if (bridge && bridge.isAndroid && !bridge.setItem(key, value)) return false;
      try { localStorage.setItem(key, value); } catch (storageError) { if (!bridge || !bridge.isAndroid) throw storageError; }
      return true;
    } catch (e) { return false; }
  },
  load(slot) {
    try {
      const key = this.saveKey(slot);
      const bridge = window.AndroidAppBridge;
      const raw = bridge && bridge.isAndroid ? bridge.getItem(key) : localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.disciples) || !Array.isArray(parsed.sects) ||
          !parsed.resources || !parsed.buildings || !Number.isInteger(parsed.year) || parsed.year < 1 ||
          !Number.isInteger(parsed.month) || parsed.month < 1 || parsed.month > 12) return false;
      const ids = new Set();
      const version = parsed.saveVersion ?? 1;
      if (!Number.isInteger(version) || version < 1 || version > 3) return false;
      for (const d of parsed.disciples) {
        if (!d) return false;
        if (version < 3 && Number.isInteger(d.root)) d.root = migrateSpiritRoot(d.root, d.id);
        if (!Number.isInteger(d.id) || ids.has(d.id) || !REALMS[d.realm] || !STAGES[d.stage] ||
            !validSpiritRoot(d.root) || !CLASSES[d.cls] || !Number.isFinite(d.exp) || !Number.isFinite(d.lifespanLeft) ||
            ![d.age, d.comprehension, d.luck, d.loyalty].every(Number.isFinite) || typeof d.name !== "string" || typeof d.alive !== "boolean") return false;
        ids.add(d.id);
        if (d.status === undefined) d.status = d.alive ? "active" : d.ascended ? "ascended" : "unknown";
        if (!["active", "deceased", "expelled", "departed", "ascended", "unknown"].includes(d.status) || d.alive !== (d.status === "active")) return false;
        if (d.biography === undefined) d.biography = [{ date: "旧档", age: Math.floor(d.age), realm: d.realm, stage: d.stage,
          kind: "legacy", text: "旧存档未保存完整生平，无法恢复此前经历。" }];
        if (!Array.isArray(d.biography) || d.biography.some(e => !e || typeof e.date !== "string" ||
            typeof e.kind !== "string" || typeof e.text !== "string" || !Number.isFinite(e.age) || !REALMS[e.realm] || !STAGES[e.stage])) return false;
        if (!d.alive && d.exitReason !== undefined && typeof d.exitReason !== "string") return false;
        if (d.finalPower !== undefined && (!Number.isFinite(d.finalPower) || d.finalPower < 0)) return false;
        if (d.exitTime !== undefined && (!d.exitTime || !Number.isInteger(d.exitTime.year) || d.exitTime.year < 1 ||
            !Number.isInteger(d.exitTime.month) || d.exitTime.month < 1 || d.exitTime.month > 12)) return false;
        if (!d.alive && !d.exitReason && d.status === "ascended") d.exitReason = "旧存档记载该弟子已飞升。";
        if (d.avatarId !== undefined && !/^(?:[mf][1-4]|m4_legacy)$/.test(d.avatarId)) return false;
        // 历史存档仍用旧 m4 立绘；新生成的弟子使用更新后的年轻版。
        if (!d.avatarId) {
          const n = (d.id % 4) + 1;
          d.avatarId = (d.gender === "男" ? "m" : "f") + n;
          if (d.avatarId === "m4") d.avatarId = "m4_legacy";
        }
      }
      for (const key of Object.keys(RESOURCES)) if (!Number.isFinite(parsed.resources[key]) || parsed.resources[key] < 0) return false;
      for (const [key, lv] of Object.entries(parsed.buildings)) if (!BUILDINGS[key] || !Number.isInteger(lv) || lv < 0 || lv > BUILDINGS[key].maxLv) return false;
      const s = Object.assign(JSON.parse(JSON.stringify(INITIAL_STATE)), { jobs: {}, caravans: [], log: [], generation: 1,
        chaos: 0, veinDamageMonths: 0, insightBoostMonths: 0, pendingEvents: [] }, parsed);
      const auto = s.autoBreakthrough || {};
      const autoValid = typeof auto.monthly === "boolean" && Object.hasOwn(AUTO_BREAKTHROUGH, auto.strategy) &&
        Number.isInteger(auto.pills) && auto.pills >= 1 && auto.pills <= BREAKTHROUGH.maxPill;
      s.autoBreakthrough = { monthly: autoValid && auto.monthly, strategy: Object.hasOwn(AUTO_BREAKTHROUGH, auto.strategy) ? auto.strategy : "direct",
        pills: Number.isInteger(auto.pills) && auto.pills >= 1 && auto.pills <= BREAKTHROUGH.maxPill ? auto.pills : 1 };
      s.saveVersion = 3;
      s.nextId = Math.max(s.nextId || 1, ...s.disciples.map(d => d.id + 1));
      s.jobs = s.jobs && typeof s.jobs === "object" ? s.jobs : {};
      s.caravans = Array.isArray(s.caravans) ? s.caravans.filter(c => c && TRADE_ROUTES.some(r => r.id === c.routeId && r.goods.includes(c.goodsId)) && TRADE_GOODS[c.goodsId] && Number.isInteger(c.amount) && c.amount > 0 && Number.isFinite(c.monthsLeft)) : [];
      s.log = Array.isArray(s.log) ? s.log : [];
      s.pendingEvents = Array.isArray(s.pendingEvents) ? s.pendingEvents : [];
      if (s.pendingEvents.some(item => !item || !["faction", "world", "adv", "event", "msgs"].includes(item.type) ||
          (item.type === "msgs" ? !Array.isArray(item.list) : !item.ev || typeof item.ev.text !== "string" || !Array.isArray(item.ev.options)))) return false;
      for (const sec of s.sects) if (!NPC_SECTS_TEMPLATE.some(x => x.id === sec.id) || !Number.isFinite(sec.power) || !Number.isFinite(sec.relation)) return false;
      s.sects.forEach(sec => { if (sec.destroyed) { sec.power = 0; sec.allied = false; sec.trade = false; sec.atWar = false; sec.broken = false; sec.vassal = false; } });
      if (s.alliance && (!Array.isArray(s.alliance.members) || !Number.isFinite(s.alliance.prestige))) return false;
      if (s.branch && !Array.isArray(s.branch.disciples)) return false;
      if (s.branch && !Array.isArray(s.spiritSects)) s.spiritSects = JSON.parse(JSON.stringify(SPIRIT_SECTS));
      for (const d of s.disciples) {
        d.autoBreakthrough = typeof d.autoBreakthrough === "boolean" ? d.autoBreakthrough : true;
        if (d.root.kind === "normal") d.root.elements.sort((a, b) => ROOT_ELEMENTS.indexOf(a) - ROOT_ELEMENTS.indexOf(b));
        // 旧版本可通过普通突破误入渡劫境，修正为待渡劫的大乘圆满。
        if (d.alive && d.realm === 8) { d.realm = 7; d.stage = 3; d.exp = stageExpNeed(7, 3); }
        d.exp = clamp(d.exp, 0, stageExpNeed(d.realm, d.stage));
        d.injuredMonths = Number.isFinite(d.injuredMonths) ? Math.max(0, d.injuredMonths) : 0;
        if (d.adventure && (!ADVENTURE_PLACES.some(p => p.id === d.adventure.placeId) || !Number.isFinite(d.adventure.monthsLeft))) return false;
        if (d.tribulation && (d.realm !== 7 || d.stage !== 3 || !Number.isInteger(d.tribulation.wave) || d.tribulation.wave < 1 || d.tribulation.wave >= DUJIE.waves ||
            !Number.isInteger(d.tribulation.pills) || d.tribulation.pills < 0 || d.tribulation.pills > DUJIE.maxPill ||
            !Array.isArray(d.tribulation.guardians) || d.tribulation.guardians.length > DUJIE.maxGuardian || new Set(d.tribulation.guardians).size !== d.tribulation.guardians.length ||
            d.tribulation.guardians.some(id => !s.disciples.some(g => g.id === id && g.alive && g.realm >= 6)))) return false;
      }
      if (s.branch) s.branch.disciples = s.branch.disciples.filter(id => s.disciples.some(d => d.id === id && d.alive && d.inBranch));
      s.caravans.forEach(c => { if (c.escortId && !s.disciples.some(d => d.id === c.escortId && d.alive)) c.escortId = null; });
      const employed = new Set();
      for (const [key, list] of Object.entries(s.jobs)) {
        if (!BUILDINGS[key] || !s.buildings[key] || !Array.isArray(list)) { delete s.jobs[key]; continue; }
        let count = 0;
        s.jobs[key] = list.filter(id => {
          const d = s.disciples.find(x => x.id === id);
          if (count >= BUILDINGS[key].jobs || !d || !d.alive || d.adventure || d.inBranch || d.tribulation || s.caravans.some(c => c.escortId === id) || employed.has(id)) return false;
          employed.add(id); count++; return true;
        });
      }
      this.state = s;
      const leaders = this.aliveDisciples().filter(d => d.isLeader);
      if (!leaders.length && this.aliveDisciples().length) this.handleLeaderDeath();
      else if (leaders.length > 1) leaders.slice(1).forEach(d => { d.isLeader = false; });
      s.gameOver = !this.aliveDisciples().length;
      return true;
    } catch (e) { return false; }
  },
  saveInfo(slot) {
    try {
      const key = this.saveKey(slot);
      const bridge = window.AndroidAppBridge;
      const raw = bridge && bridge.isAndroid ? bridge.getItem(key) : localStorage.getItem(key);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.disciples)) return null;
      return { year: s.year, month: s.month, sectName: s.sectName, gen: s.generation, disciples: s.disciples.filter(d => d.alive).length };
    } catch (e) { return null; }
  },
  completePendingEvent() {
    (this.state.pendingEvents || []).shift();
    if (this.state.gameOver) this.state.pendingEvents = this.state.pendingEvents.filter(item => item.type === "msgs");
    this.autosave();
  },
  resourceText(res) { return Object.entries(res).map(([k, v]) => `${RESOURCES[k].name}${v > 0 ? "+" : ""}${v}`).join("，"); },
  autosave() { this.save(0); },
  log(text, cls) {
    const s = this.state;
    s.log.unshift({ date: `太元${s.year}年${s.month}月`, text, cls: cls || "" });
    if (s.log.length > 300) s.log.length = 300;
  }
};

// ---------- 工具函数 ----------
function rnd(n) { return Math.floor(Math.random() * n); }
function ri(a, b) { return a + rnd(b - a + 1); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function weightedPick(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}
function weightedObjPick(arr) {
  const total = arr.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const o of arr) { r -= o.w; if (r <= 0) return o; }
  return arr[arr.length - 1];
}
function randomClass() {
  const keys = Object.keys(CLASSES);
  const w = [15, 13, 10, 7, 10, 10, 8, 10, 9, 8];
  return keys[weightedPick(w)];
}

/* ============================================================
 * 阶段三系统：长老院 / 客卿 / 派系 / 底蕴气运 / 联盟 / 灵界通道
 * ============================================================ */

Object.assign(Game, {

  // ---------- 客卿 ----------
  recruitKeqing() {
    const s = this.state;
    if (s.gameOver) return { err: "宗门已覆灭，请读档或重开" };
    if (!this.canAfford(KEQING.recruitCost)) return { err: "灵石不足（需500）" };
    if (this.aliveDisciples().length >= this.capacity()) return { err: "弟子容纳已满" };
    this.payCost(KEQING.recruitCost);
    const realm = ri(KEQING.realmRange[0], KEQING.realmRange[1]);
    const d = this.makeDisciple({ realm });
    d.keqing = true;
    d.loyalty = KEQING.loyaltyInit;
    d.age = ri(60, Math.min(300, REALMS[realm].lifespan - 20));
    d.lifespanLeft = REALMS[realm].lifespan - d.age;
    d.biography = [];
    this.recordDisciple(d, "joined", "以客卿身份挂单入宗，领取宗门俸禄。");
    s.disciples.push(d);
    this.log(`散修高手 ${d.name}（${REALMS[realm].name}期）挂单入宗为客卿，月俸灵石×${KEQING.salaryBase[realm]}。`, "good");
    return { ok: true, d };
  },
  keqingTick(msgs) {
    const s = this.state;
    s.disciples.forEach(d => {
      if (!d.alive || !d.keqing) return;
      const salary = KEQING.salaryBase[d.realm] ?? 10;
      if (s.resources.lingshi >= salary) {
        s.resources.lingshi -= salary;
        d.loyalty = clamp(d.loyalty + 1, 0, 100); // 供奉到位，缓慢归心
      } else {
        // 发不起俸禄，客卿离去
        this.removeDisciple(d, false, "departed", "未能支付客卿俸禄，离开宗门。");
        msgs.push(`【客卿离去】拖欠俸禄，客卿 ${d.name} 拂袖而去。`);
        this.log(`客卿 ${d.name} 因俸禄被拖欠而离宗。`, "bad");
      }
    });
  },

  // ---------- 长老院 ----------
  appointElder(dId) {
    const s = this.state;
    const d = s.disciples.find(x => x.id === dId);
    if (!d || !d.alive) return { err: "弟子不存在" };
    if (d.realm < ELDER.needRealm) return { err: `需${REALMS[ELDER.needRealm].name}期以上方可任长老` };
    if (d.isElder) return { err: "已是长老" };
    if (this.elders().length >= ELDER.maxSeats) return { err: "长老院席位已满" };
    d.isElder = true;
    this.recordDisciple(d, "elder", `受封长老，执掌${ELDER.domainName[ELDER.seatDomain[d.cls]]}。`);
    this.log(`${d.name} 受封长老，执掌${ELDER.domainName[ELDER.seatDomain[d.cls]]}。`, "good");
    return { ok: true };
  },
  dismissElder(dId) {
    const d = this.state.disciples.find(x => x.id === dId);
    if (d) { d.isElder = false; d.loyalty = Math.max(0, d.loyalty - 10); }
  },
  elders() { return this.aliveDisciples().filter(d => d.isElder); },
  elderBonus(domain) {
    return this.elders().filter(d => ELDER.seatDomain[d.cls] === domain).length * ELDER.bonusPerSeat;
  },

  // ---------- 派系 ----------
  factionOf(d) {
    for (const [k, f] of Object.entries(FACTIONS))
      if (f.personalities.includes(d.personality)) return k;
    return "neutral";
  },
  factionStats() {
    const stats = { radical: 0, steady: 0, neutral: 0 };
    this.aliveDisciples().forEach(d => stats[this.factionOf(d)]++);
    return stats;
  },
  factionTick(msgs) {
    const s = this.state;
    const stats = this.factionStats();
    const total = Math.max(1, stats.radical + stats.steady + stats.neutral);
    const max = Math.max(stats.radical, stats.steady, stats.neutral);
    // 一派独大则张力上升；中和派多则张力下降
    s.factionTension = clamp((s.factionTension || 0)
      + (max / total > 0.6 ? FACTION_CFG.driftPerMonth : -2)
      - Math.round(stats.neutral / total * 3), 0, 100);
    if (s.factionTension >= FACTION_CFG.tensionThreshold) {
      // 内斗爆发：玩家裁决（走事件队列）
      s.factionTension = 40;
      return {
        id: "faction_strife", title: "派系内斗",
        text: "激进派与持重派因宗门发展路线争执不下，竟在议事堂上公然翻脸，双方弟子各聚一处剑拔弩张！",
        options: [
          { label: "支持激进派（对外扩张）", desc: "声望 +5，持重派弟子忠诚 -10", effect: { faction: "radical" } },
          { label: "支持持重派（稳守发展）", desc: "全宗修炼加成月 +10%，激进派弟子忠诚 -10", effect: { faction: "steady" } },
          { label: "各打五十大板", desc: "灵石 -100 安抚，两派忠诚 -5，张力大降", effect: { faction: "mediate" } }
        ]
      };
    }
    return null;
  },
  applyFactionChoice(optIdx) {
    const s = this.state;
    if (![0, 1, 2].includes(optIdx)) return { err: "无效裁决" };
    const out = [];
    const apply = (facKey, delta) => {
      this.aliveDisciples().forEach(d => {
        if (this.factionOf(d) === facKey) d.loyalty = clamp(d.loyalty + delta, 0, 100);
      });
    };
    if (optIdx === 0) { s.reputation += 5; apply("steady", -10); out.push("激进派士气大振，声望 +5；持重派心怀不满（忠诚 -10）。"); }
    else if (optIdx === 1) { s.insightBoostMonths = 1; apply("radical", -10); out.push("宗门潜心发展（本月修炼 +10%）；激进派闷闷不乐（忠诚 -10）。"); }
    else {
      if (s.resources.lingshi < 100) return { err: "灵石不足（需100）" };
      s.resources.lingshi -= 100;
      apply("radical", -5); apply("steady", -5);
      s.factionTension = 15;
      out.push("掌门出面调停，灵石 -100，两派各退一步，张力大降。");
    }
    this.log(`【派系】内斗裁决 → ${out.join("")}`);
    return { ok: true, msg: out.join("\n") };
  },

  // ---------- 底蕴 / 气运 ----------
  addHeritage(n, reason) {
    const s = this.state;
    s.heritage = (s.heritage || 0) + n;
    if (reason) this.log(`宗门底蕴 +${n}（${reason}），当前 ${s.heritage}。`, "good");
  },
  addQiyun(n, reason) {
    const s = this.state;
    s.qiyun = (s.qiyun || 0) + n;
    if (reason) this.log(`宗门气运 +${n}（${reason}），当前 ${s.qiyun}。`, "good");
  },
  heritageBonus() { return Math.min(HERITAGE.maxBonus, (this.state.heritage || 0) * HERITAGE.perPoint); },
  qiyunBonus() { return Math.min(QIYUN.maxBonus, (this.state.qiyun || 0) * QIYUN.perPoint); },
  // 高阶修士陨落留传承洞府
  leaveLegacy(d) {
    const s = this.state;
    if (d.realm >= 4) {
      const heir = this.aliveDisciples().filter(x => x.id !== d.id)
        .sort((a, b) => b.comprehension - a.comprehension)[0];
      if (heir) {
        this.addExp(heir, stageExpNeed(heir.realm, heir.stage) * 0.5);
        heir.comprehension = Math.min(99, heir.comprehension + 3);
        this.addHeritage(HERITAGE.sources.legacyCave, `${d.name}留下传承洞府`);
        this.recordDisciple(heir, "legacy", `参悟 ${d.name} 留下的传承洞府，修为与悟性有所提升。`);
        this.log(`【传承】${d.name} 生前留下的传承洞府重现，${heir.name} 入内参悟，修为悟性大进！`, "good");
        return heir.name;
      }
    }
    return null;
  },

  // ---------- 联盟 ----------
  canFormAlliance() {
    const s = this.state;
    const allies = s.sects.filter(x => x.allied && !x.destroyed);
    if (s.alliance) return { err: "联盟已建立" };
    if (s.reputation < ALLIANCE_CFG.needRep) return { err: `声望不足（需≥${ALLIANCE_CFG.needRep}）` };
    if (allies.length < ALLIANCE_CFG.needAllies) return { err: `同盟宗门不足（需≥${ALLIANCE_CFG.needAllies}家）` };
    return { ok: true };
  },
  formAlliance() {
    const chk = this.canFormAlliance();
    if (chk.err) return chk;
    const s = this.state;
    const members = s.sects.filter(x => x.allied && !x.destroyed).map(x => x.id);
    s.alliance = { name: ALLIANCE_CFG.name, members, prestige: 20, raidCd: 0 };
    this.log(`【盛事】我宗牵头创立【${ALLIANCE_CFG.name}】，${members.length} 家宗门歃血为盟，共尊我宗为盟主！`, "good");
    this.addQiyun(3, "创立联盟");
    return { ok: true };
  },
  councilTopic() { return COUNCIL_TOPICS[rnd(COUNCIL_TOPICS.length)]; },
  applyCouncil(topic, optIdx) {
    const s = this.state;
    if (!s.alliance) return { err: "尚未建立联盟" };
    if (s.alliance.lastCouncilMonth === this.monthKey()) return { err: "本月已议事，请下月再议" };
    if (!topic || !topic.options || !topic.options[optIdx]) return { err: "无效议事选项" };
    const ef = topic.options[optIdx].effect;
    const out = [];
    if (ef.res) {
      for (const [k, v] of Object.entries(ef.res))
        if (v < 0 && (s.resources[k] || 0) < -v) return { err: "资源不足，无法选择此项" };
      this.gainRes(ef.res);
    }
    if (ef.prestige) { s.alliance.prestige = Math.max(0, s.alliance.prestige + ef.prestige); out.push(`联盟威望 ${ef.prestige > 0 ? "+" : ""}${ef.prestige}`); }
    if (ef.rep) { s.reputation += ef.rep; out.push(`声望 +${ef.rep}`); }
    if (ef.memberRel) {
      s.sects.forEach(x => { if (s.alliance.members.includes(x.id)) x.relation = clamp(x.relation + ef.memberRel, -100, 100); });
      out.push(`盟员关系 ${ef.memberRel > 0 ? "+" : ""}${ef.memberRel}`);
    }
    if (ef.bias) {
      const ms = s.sects.filter(x => s.alliance.members.includes(x.id));
      if (ms.length >= 2) {
        ms[0].relation = clamp(ms[0].relation + 10, -100, 100);
        ms[1].relation = clamp(ms[1].relation - 10, -100, 100);
        out.push(`偏袒了【${ms[0].name}】（+10），冷落了【${ms[1].name}】（-10）。`);
      }
    }
    if (ef.allExp) {
      this.aliveDisciples().forEach(d => this.addExp(d, ef.allExp));
      out.push(`全宗弟子修为 +${ef.allExp}`);
    }
    s.alliance.lastCouncilMonth = this.monthKey();
    this.log(`【联盟议事·${topic.title}】${topic.options[optIdx].label} → ${out.join("；") || "散会"}`);
    return { ok: true, msg: out.join("\n") || "议事已毕。" };
  },
  // 联盟讨伐魔道
  allianceRaid() {
    const s = this.state;
    if (s.gameOver) return { err: "宗门已覆灭" };
    if (!s.alliance) return { err: "尚未建立联盟" };
    if (s.alliance.raidCd > 0) return { err: `讨伐冷却中（${s.alliance.raidCd} 个月）` };
    const fighters = this.aliveDisciples().filter(d => this.available(d));
    if (!fighters.length) return { err: "没有可出战弟子" };
    const allyPower = s.alliance.members.reduce((sum, id) => {
      const sec = s.sects.find(x => x.id === id);
      return sum + (sec && sec.allied && !sec.destroyed && !sec.broken ? Math.round(sec.power * 0.5) : 0);
    }, 0);
    const total = fighters.reduce((sum, d) => sum + this.disciplePower(d), 0) + allyPower;
    const enemy = ALLIANCE_CFG.modaoBase + s.year * 30; // 魔道逐年变强
    const winRate = clamp(0.15 + (total / enemy) * 0.5, 0.05, 0.9);
    const win = Math.random() < winRate;
    s.alliance.raidCd = ALLIANCE_CFG.raidCooldown;
    if (win) {
      const loot = { lingshi: ri(300, 600), danyao: ri(5, 12) };
      this.gainRes(loot);
      s.reputation += 10;
      s.alliance.prestige += 10;
      this.addHeritage(HERITAGE.sources.allianceWin, "联盟讨伐魔道大捷");
      this.addQiyun(QIYUN.sources.warWin, "讨伐大捷");
      this.log(`【联盟大捷】${s.alliance.name}讨伐魔道凯旋！缴获丰厚，声威震于四野。`, "good");
      return { ok: true, win: true, msg: `联盟军（战力 ${total}）大破魔道（战力 ${enemy}）！\n缴获：灵石×${loot.lingshi}、丹药×${loot.danyao}\n声望 +10、联盟威望 +10、底蕴 +${HERITAGE.sources.allianceWin}、气运 +${QIYUN.sources.warWin}` };
    }
    const victim = fighters[rnd(fighters.length)];
    const casualty = victim ? this.resolveCombatCasualty(victim, 6, "联盟讨伐魔道失利") : "unharmed";
    s.alliance.prestige = Math.max(0, s.alliance.prestige - 8);
    const fate = victim ? `${victim.name}${casualty === "deceased" ? "陨落" : "重伤六个月"}` : "";
    this.log(`【联盟失利】讨伐魔道受挫，${fate ? fate + "，" : ""}联盟威望受损。`, "bad");
    return { ok: true, win: false, msg: `讨伐失利！魔道战力 ${enemy} 超出预估，联盟军折戟而归。\n${fate ? fate + "，" : ""}联盟威望 -8。` };
  },
  allianceTick() {
    const s = this.state;
    if (s.alliance && s.alliance.raidCd > 0) s.alliance.raidCd--;
  },

  // ---------- 灵界通道任务 ----------
  spiritQuest() {
    const s = this.state;
    const step = s.spiritStep || 0;
    if (step >= SPIRIT_QUESTS.length) return { err: "灵界通道已贯通" };
    const q = SPIRIT_QUESTS[step];
    if (!this.canAfford(q.need)) return { err: "资源不足：" + Object.entries(q.need).map(([k, v]) => `${RESOURCES[k].name}×${v}`).join("、") };
    if (q.powerNeed && this.sectPower() < q.powerNeed) return { err: `宗门总战力不足（需≥${q.powerNeed}）` };
    if (q.realmNeed && !this.aliveDisciples().some(d => d.realm >= q.realmNeed))
      return { err: `需要一名${REALMS[q.realmNeed].name}期以上弟子坐镇` };
    this.payCost(q.need);
    s.spiritStep = step + 1;
    this.log(`【灵界通道】完成「${q.title}」（第 ${step + 1}/3 步）。`, "good");
    if (s.spiritStep >= SPIRIT_QUESTS.length) {
      s.spiritChannel = true;
      this.addHeritage(10, "贯通灵界通道");
      return { ok: true, done: true, msg: "天穹之上裂隙洞开，灵气如潮倾泻而下——灵界通道贯通！（阶段四将解锁灵界分宗与渡劫飞升）" };
    }
    return { ok: true, msg: `「${q.title}」完成！` };
  }
});

/* ============================================================
 * 阶段四系统：渡劫飞升 / 灵界分宗 / 全界大事件
 * ============================================================ */

Object.assign(Game, {

  // ---------- 渡劫飞升 ----------
  canDujie(d) {
    if (!d || !d.alive) return { err: "弟子不存在" };
    if (d.realm !== 7 || d.stage !== 3) return { err: "需大乘期圆满方可渡劫" };
    if (d.exp < stageExpNeed(7, 3)) return { err: "修为未满" };
    if (!d.tribulation && !this.ritualAvailable(d)) return { err: "需健康且驻守本宗或分宗的弟子方可渡劫" };
    if (!this.state.spiritChannel) return { err: "灵界通道未贯通，天路未开，无法渡劫" };
    return { ok: true };
  },
  dujieWaveRate(pills, guardians) {
    const s = this.state;
    return clamp(DUJIE.baseWaveRate
      + pills * DUJIE.pillBonus
      + Math.min(DUJIE.maxGuardian, guardians) * DUJIE.guardianBonus
      + (s.heritage || 0) * DUJIE.heritageWaveBonus
      + this.qiyunBonus(), 0.3, 0.98);
  },
  // 逐波渡劫：返回 {done, wave, passed, finished, success, msg}
  dujieWave(dId, wave, pills, guardianIds) {
    const s = this.state;
    const d = s.disciples.find(x => x.id === dId);
    const chk = this.canDujie(d);
    if (chk.err) return { err: chk.err };
    const progress = d.tribulation;
    if (!Number.isInteger(wave) || wave !== (progress ? progress.wave + 1 : 1) || wave > DUJIE.waves)
      return { err: "请依次承受九道天雷" };
    if (progress) {
      pills = progress.pills; guardianIds = progress.guardians;
    } else {
      if (!Number.isInteger(pills) || pills < 0 || pills > DUJIE.maxPill) return { err: "丹药数量无效" };
      const guardErr = this.guardianError(d, guardianIds, DUJIE.maxGuardian, 6);
      if (guardErr) return { err: guardErr };
      if (s.resources.danyao < pills) return { err: "丹药不足" };
      s.resources.danyao -= pills;
      this.removeFromJobs(d.id);
      d.tribulation = { wave: 0, pills, guardians: guardianIds.slice() };
    }
    const rate = this.dujieWaveRate(pills, guardianIds.length);
    const pass = Math.random() < rate;
    if (!pass) {
      d.tribulation = null;
      const penalty = weightedObjPick(DUJIE.failTable);
      let msg = `第 ${wave} 道天雷落下，${d.name} 未能扛住——${penalty.text}！`;
      if (penalty.type === "injured") { d.realm = 7; d.stage = 0; d.exp = 0; d.injuredMonths = 36; }
      else if (penalty.type === "foundation") { d.foundationDmg = true; d.exp = 0; d.injuredMonths = 24; }
      else { this.removeDisciple(d, true, "deceased", `渡劫失败，陨落于第 ${wave} 道天雷。`); }
      this.log(`【渡劫失败】${d.name} 折戟于第 ${wave} 道天雷，${penalty.text}。`, "bad");
      this.autosave();
      return { ok: true, wave, passed: false, finished: true, success: false, msg };
    }
    if (wave >= DUJIE.waves) {
      // 飞升成功
      d.ascended = true;
      this.removeDisciple(d, false, "ascended", "九霄天劫圆满，飞升仙界，留下本命传承福泽后人。");
      this.addHeritage(15, `${d.name} 飞升仙界`);
      this.addQiyun(8, "飞升祥瑞");
      s.reputation += 20;
      // 留下本命传承：最强后辈获益
      const heir = this.aliveDisciples().sort((a, b) => b.comprehension - a.comprehension)[0];
      if (heir) { this.addExp(heir, stageExpNeed(heir.realm, heir.stage)); heir.comprehension = Math.min(99, heir.comprehension + 5); }
      this.log(`【飞升】九霄雷散，霞光万道！${d.name} 功德圆满，飞升仙界！留下本命传承福泽后人。`, "good");
      this.autosave();
      return { ok: true, wave, passed: true, finished: true, success: true,
        msg: `九道天雷尽数扛过！${d.name} 霞举飞升，名列仙籍！\n声望 +20、底蕴 +15、气运 +8${heir ? `\n本命传承归于 ${heir.name}（修为大涨、悟性 +5）` : ""}\n宗门已自动推定继任掌门（如需）。` };
    }
    d.tribulation.wave = wave;
    this.autosave();
    return { ok: true, wave, passed: true, finished: false,
      msg: `第 ${wave} 道天雷——扛住了！（当前每雷成功率 ${Math.round(rate * 100)}%）` };
  },

  // ---------- 灵界分宗 ----------
  establishBranch(dIds) {
    const s = this.state;
    if (!s.spiritChannel) return { err: "灵界通道未贯通" };
    if (s.branch) return { err: "分宗已建立" };
    if (!this.canAfford(SPIRIT_BRANCH.establishCost)) return { err: "资源不足（灵石×2000、灵药×200、矿石×200）" };
    if (!Array.isArray(dIds) || new Set(dIds).size !== dIds.length) return { err: "派驻名单不可重复" };
    const list = dIds.map(id => s.disciples.find(d => d.id === id));
    if (list.some(d => !this.available(d) || d.realm < SPIRIT_BRANCH.minRealm || d.isLeader))
      return { err: "派驻弟子须健康、在宗、达到金丹期且不是掌门" };
    if (list.length < SPIRIT_BRANCH.minDisciple) return { err: `至少需 ${SPIRIT_BRANCH.minDisciple} 名金丹期以上健康弟子（掌门不可派驻）` };
    this.payCost(SPIRIT_BRANCH.establishCost);
    list.forEach(d => {
      d.inBranch = true;
      this.removeFromJobs(d.id);
      this.recordDisciple(d, "branch", "随宗门建立灵界分宗，跨界驻守。");
    });
    s.branch = { disciples: list.map(d => d.id), spiritRep: 0 };
    s.spiritSects = JSON.parse(JSON.stringify(SPIRIT_SECTS));
    this.log(`【开疆】灵界分宗立！${list.map(d => d.name).join("、")} 共 ${list.length} 人跨界驻守。`, "good");
    return { ok: true, msg: `灵界分宗建立！${list.length} 名弟子跨界驻守，每月按分宗战力产出灵石与灵药。` };
  },
  branchPower() {
    const s = this.state;
    if (!s.branch) return 0;
    return s.disciples.filter(d => d.alive && d.inBranch && d.injuredMonths <= 0)
      .reduce((sum, d) => sum + this.disciplePower(d), 0);
  },
  branchTick(msgs) {
    const s = this.state;
    if (!s.branch) return;
    const pw = this.branchPower();
    if (pw <= 0) { msgs.push("【分宗告急】灵界分宗已无驻守弟子，产出断绝！"); return; }
    const income = Math.round(pw * SPIRIT_BRANCH.incomePerPower);
    const herb = Math.round(pw * SPIRIT_BRANCH.spiritHerbRate / 10);
    s.resources.lingshi += income;
    s.resources.lingyao += herb;
    // 灵界势力动态
    s.spiritSects.forEach(sec => {
      sec.power = Math.max(1000, sec.power + ri(-30, 40));
      if (sec.relation < -30 && Math.random() < sec.aggr * 0.1) {
        const loss = Math.round(s.resources.lingshi * 0.08);
        s.resources.lingshi -= loss;
        msgs.push(`【灵界边患】${sec.name} 袭扰分宗，损失灵石×${loss}！`);
        this.log(`灵界分宗遭【${sec.name}】袭扰。`, "bad");
      }
      sec.relation = clamp(sec.relation + ri(-2, 2), -100, 100);
    });
  },
  spiritDiplo(sectId, action) {
    const s = this.state;
    if (!s.branch) return { err: "请先建立灵界分宗" };
    const sec = (s.spiritSects || []).find(x => x.id === sectId);
    if (!sec) return { err: "无效对象" };
    if (action === "gift") {
      if (s.resources.lingshi < 300) return { err: "灵石不足（需300）" };
      s.resources.lingshi -= 300;
      sec.relation = clamp(sec.relation + 10, -100, 100);
      return { ok: true, msg: `赠礼【${sec.name}】，关系 +10（当前 ${sec.relation}）` };
    }
    if (action === "trade") {
      if (sec.relation < 20) return { err: "关系不足（需≥20）" };
      if (sec.lastTradeMonth === this.monthKey()) return { err: "本月已与该宗完成跨界贸易" };
      sec.lastTradeMonth = this.monthKey();
      const gain = ri(200, 400);
      s.resources.lingshi += gain;
      return { ok: true, msg: `与【${sec.name}】完成一笔跨界贸易，获利灵石×${gain}。` };
    }
    return { err: "无效操作" };
  },

  // ---------- 全界大事件 ----------
  worldEventTick() {
    const s = this.state;
    if (s.worldEventCd === undefined) s.worldEventCd = ri(WORLD_EVENT_CFG.intervalMin, WORLD_EVENT_CFG.intervalMax);
    if (s.worldEventCd > 0) { s.worldEventCd--; return null; }
    const pool = WORLD_EVENTS.filter(e => s.year >= e.minYear);
    if (!pool.length) return null;
    s.worldEventCd = ri(WORLD_EVENT_CFG.intervalMin, WORLD_EVENT_CFG.intervalMax);
    return pool[rnd(pool.length)];
  },
  applyWorldEvent(ev, optIdx) {
    const s = this.state;
    if (!ev || !ev.options || !ev.options[optIdx]) return { err: "无效事件选项" };
    const ef = ev.options[optIdx].effect;
    if (ef.tianmoWar && !s.alliance) return { err: "需先建立联盟方可共讨天魔" };
    const out = [];
    if (ef.res) {
      for (const [k, v] of Object.entries(ef.res))
        if (v < 0 && (s.resources[k] || 0) < -v) return { err: "资源不足，无法选择此项" };
      this.gainRes(ef.res);
    }
    if (ef.rep) { s.reputation += ef.rep; out.push(`声望 ${ef.rep > 0 ? "+" : ""}${ef.rep}`); }
    if (ef.allRel) s.sects.forEach(x => { if (!x.destroyed) x.relation = clamp(x.relation + ef.allRel, -100, 100); });
    if (ef.worldWar) {
      if (this.sectPower() >= ef.worldWar) {
        this.gainRes({ lingshi: 500 }); s.reputation += 15;
        this.addQiyun(QIYUN.sources.warWin, "击退魔道");
        out.push("我军大破魔道联军！声望 +15、灵石 +500、气运 +" + QIYUN.sources.warWin);
      } else {
        const casualties = this.aliveDisciples().filter(d => this.atHome(d)).slice(0, 3).map(d => ({ d, fate: this.resolveCombatCasualty(d, 8, "抵御魔道联军时战败") }));
        const injured = casualties.filter(x => x.fate === "injured").map(x => x.d.name);
        const fallen = casualties.filter(x => x.fate === "deceased").map(x => x.d.name);
        out.push(`力有不逮，苦战退敌但伤亡惨重：重伤 ${injured.join("、") || "无"}；陨落 ${fallen.join("、") || "无"}。`);
      }
    }
    if (ef.ancientRun) {
      const d = this.strongestDisciple();
      if (d) {
        this.gainRes({ danyao: 8, lingshi: 300 });
        if (Math.random() < 0.3) { d.injuredMonths = 6; out.push(`${d.name} 夺得秘宝但身受重伤（丹药×8、灵石×300）。`); }
        else out.push(`${d.name} 满载而归！丹药×8、灵石×300。`);
      }
    }
    if (ef.youngRun) {
      const young = this.aliveDisciples().filter(d => d.realm <= 2);
      const d = young[rnd(young.length)];
      if (d) {
        if (Math.random() < 0.2) {
          this.removeDisciple(d, true, "deceased", "陨落于秘境深处。");
          out.push(`${d.name} 陨落于秘境深处……宗门上下扼腕。`);
        } else {
          d.comprehension = Math.min(99, d.comprehension + 5);
          this.addExp(d, stageExpNeed(d.realm, d.stage));
          out.push(`${d.name} 秘境悟道：悟性 +5、修为大涨！`);
        }
      } else out.push("门中无合适弟子可派。");
    }
    if (ef.tideCultivate) {
      this.aliveDisciples().forEach(d => { this.addExp(d, stageExpNeed(d.realm, d.stage) * 0.8); });
      s.tideHaltMonths = 1;
      out.push("全宗闭关，修为一日千里！（本月建筑停产）");
    }
    if (ef.tianmoWar) {
      if (!s.alliance) return { err: "需先建立联盟方可共讨天魔" };
      if (this.sectPower() >= 3000) {
        s.reputation += 30; this.addHeritage(15, "讨伐域外天魔"); this.addQiyun(10, "救世之功");
        this.gainRes({ lingshi: 1000 });
        out.push("【青史留名】我宗率全界修士斩杀天魔！声望 +30、底蕴 +15、气运 +10、灵石×1000！");
      } else {
        const casualties = this.aliveDisciples().filter(d => this.atHome(d)).slice(0, 4).map(d => ({ d, fate: this.resolveCombatCasualty(d, 12, "天魔来袭时联军战败") }));
        const injured = casualties.filter(x => x.fate === "injured").map(x => x.d.name);
        const fallen = casualties.filter(x => x.fate === "deceased").map(x => x.d.name);
        s.reputation += 5;
        out.push(`天魔凶威滔天，联军惨胜：重伤 ${injured.join("、") || "无"}；陨落 ${fallen.join("、") || "无"}；声望 +5。`);
      }
    }
    this.log(`【大事件·${ev.title}】${ev.options[optIdx].label} → ${out.join("；") || "已处置"}`, ef.rep && ef.rep < 0 ? "bad" : "good");
    return { ok: true, msg: out.join("\n") || "风波已平。" };
  }
});
