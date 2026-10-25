/* ============================================================
 * 宗门长青录 - UI 渲染与交互
 * ============================================================ */

const UI = {
  currentView: "overview",

  init() {
    // 尝试读取自动存档，否则开新局
    if (!Game.load(0)) Game.newGame();

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.onclick = () => this.switchView(btn.dataset.view);
    });
    document.getElementById("btn-next-month").onclick = () => this.onNextMonth();
    document.getElementById("btn-save").onclick = () => this.showSaveLoad("save");
    document.getElementById("btn-load").onclick = () => this.showSaveLoad("load");
    // BGM
    const bgm = document.getElementById("bgm");
    const bgmBtn = document.getElementById("btn-bgm");
    bgm.volume = 0.35;
    bgmBtn.onclick = () => {
      if (bgm.paused) { bgm.play(); bgmBtn.textContent = "♪"; }
      else { bgm.pause(); bgmBtn.textContent = "♪̶"; }
    };
    // 首次交互自动播放（规避浏览器自动播放限制）
    const kick = () => { bgm.play().catch(() => {}); document.removeEventListener("click", kick); };
    document.addEventListener("click", kick);
    this.render();
  },

  switchView(v) {
    this.currentView = v;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    document.querySelectorAll(".view").forEach(x => x.classList.add("hidden"));
    document.getElementById("view-" + v).classList.remove("hidden");
    this.renderView();
  },

  render() {
    this.renderTopbar();
    this.renderView();
  },

  renderTopbar() {
    const s = Game.state;
    document.getElementById("sect-name").textContent = s.sectName + `（第${s.generation}代）`;
    document.getElementById("sect-date").textContent = `太元${s.year}年 ${s.month}月`;
    document.getElementById("sect-rep").textContent = `声望：${s.reputation}`;
    const bar = document.getElementById("resource-bar");
    bar.innerHTML = Object.entries(RESOURCES).map(([k, r]) =>
      `<span class="res-item"><span class="res-name">${r.icon}${r.name}</span><span class="res-val">${s.resources[k] || 0}</span></span>`
    ).join("");
    document.getElementById("nav-disciple-count").textContent =
      `(${Game.aliveDisciples().length}/${Game.capacity()})`;
  },

  renderView() {
    const map = {
      overview: () => this.renderOverview(),
      disciples: () => this.renderDisciples(),
      elders: () => this.renderElders(),
      buildings: () => this.renderBuildings(),
      adventure: () => this.renderAdventure(),
      trade: () => this.renderTrade(),
      diplomacy: () => this.renderDiplomacy(),
      spirit: () => this.renderSpirit(),
      recruit: () => this.renderRecruit(),
      log: () => this.renderLog()
    };
    map[this.currentView]();
  },

  // 音效
  sfx(name) {
    try {
      const a = new Audio(`assets/sfx_${name}.mp3`);
      a.volume = 0.6;
      a.play().catch(() => {});
    } catch (e) {}
  },
  // 弟子头像：按性别+id 稳定取图
  avatar(d, cls) {
    const file = (d.gender === "男" ? "avatar_m" : "avatar_f") + ((d.id % 2) + 1);
    return `<img class="avatar ${cls || ""}" src="assets/${file}.png" alt="">`;
  },

  // ---------- 宗门总览 ----------
  renderOverview() {
    const s = Game.state;
    const el = document.getElementById("view-overview");
    const alive = Game.aliveDisciples();
    const realmCount = {};
    alive.forEach(d => { const r = REALMS[d.realm].name; realmCount[r] = (realmCount[r] || 0) + 1; });
    const bHtml = Object.entries(s.buildings).filter(([, lv]) => lv > 0)
      .map(([id, lv]) => `<span class="tag jade">${BUILDINGS[id].name} Lv.${lv}</span>`).join("");
    el.innerHTML = `
      ${s.gameOver ? `<div class="panel"><h3 style="color:#d05a4e">宗门覆灭</h3><p>道统已断。可点击顶部「读档」或刷新重开（新周目请清除存档）。</p></div>` : ""}
      <div class="panel">
        <h3>宗门气象</h3>
        <div class="stat-row">
          <div class="stat-box"><div class="num">${alive.length}</div><div class="lbl">在册弟子</div></div>
          <div class="stat-box"><div class="num">${Game.sectPower()}</div><div class="lbl">宗门总战力</div></div>
          <div class="stat-box"><div class="num">${s.reputation}</div><div class="lbl">修真界声望</div></div>
          <div class="stat-box"><div class="num">${s.generation}</div><div class="lbl">掌门代数</div></div>
          <div class="stat-box"><div class="num">${Game.capacity()}</div><div class="lbl">弟子容纳上限</div></div>
          <div class="stat-box"><div class="num">${s.heritage || 0}</div><div class="lbl">底蕴（+${Math.round(Game.heritageBonus() * 100)}% 全宗）</div></div>
          <div class="stat-box"><div class="num">${s.qiyun || 0}</div><div class="lbl">气运（突破+${Math.round(Game.qiyunBonus() * 100)}%）</div></div>
        </div>
      </div>
      <div class="panel">
        <h3>灵界通道 ${s.spiritChannel ? `<span class="tag gold">已贯通</span>` : `<span class="tag">第 ${(s.spiritStep || 0) + 1}/3 步</span>`}</h3>
        ${s.spiritChannel
          ? `<p style="color:var(--jade)">天穹裂隙已稳，灵界在望！（阶段四解锁：渡劫飞升与灵界分宗）</p>`
          : (() => { const q = SPIRIT_QUESTS[s.spiritStep || 0]; return `
            <p><b>${q.title}</b>：${q.desc}</p>
            <button class="btn primary" style="margin-top:8px" onclick="UI.doSpiritQuest()">推进任务</button>`; })()}
      </div>
      <div class="grid cols-2">
        <div class="panel">
          <h3>境界分布</h3>
          ${Object.entries(realmCount).map(([r, n]) => `<p><span class="tag gold">${r}</span> × ${n}</p>`).join("") || "<p>门中无人。</p>"}
        </div>
        <div class="panel">
          <h3>已建建筑</h3>
          <p>${bHtml || "一片破败，亟待兴建。"}</p>
          <p class="scroll-hint">提示：点击右上角「闭关一月」推进时间，弟子修炼、产业产出、世界演进均按月结算。不操作则无进展。</p>
        </div>
      </div>
      <div class="panel">
        <h3>最近宗门志</h3>
        ${s.log.slice(0, 6).map(l => `<div class="log-entry ${l.cls}"><span class="log-date">${l.date}</span>${l.text}</div>`).join("")}
      </div>`;
  },

  // ---------- 弟子 ----------
  renderDisciples() {
    const el = document.getElementById("view-disciples");
    const list = Game.aliveDisciples();
    const rows = list.map(d => {
      const need = stageExpNeed(d.realm, d.stage);
      const pct = Math.min(100, Math.round(d.exp / need * 100));
      const ready = d.exp >= need;
      const jobName = Object.entries(Game.state.jobs).find(([, ids]) => ids.includes(d.id));
      const tags = [
        d.isLeader ? `<span class="tag gold">掌门</span>` : "",
        d.injuredMonths > 0 ? `<span class="tag red">重伤${d.injuredMonths}月</span>` : "",
        d.foundationDmg ? `<span class="tag red">根基受损</span>` : "",
        d.loyalty <= 20 ? `<span class="tag red">心怀去意</span>` : ""
      ].join("");
      return `<tr>
        <td>${this.avatar(d)}${d.name} ${tags}</td>
        <td>${REALMS[d.realm].name}${STAGES[d.stage]}</td>
        <td>${SPIRIT_ROOTS[d.root].name}</td>
        <td>${CLASSES[d.cls].name}</td>
        <td><div class="bar exp"><div style="width:${pct}%"></div></div></td>
        <td>${Game.disciplePower(d)}</td>
        <td>${d.loyalty}</td>
        <td>${Math.floor(d.lifespanLeft)}年</td>
        <td>${d.adventure ? "历练中" : (jobName ? BUILDINGS[jobName[0]].name : "空闲")}</td>
        <td>
          ${ready && d.injuredMonths <= 0 ? `<button class="btn small primary" onclick="UI.showBreakthrough(${d.id})">突破</button>` : ""}
          ${d.realm === 7 && d.stage === 3 && d.exp >= stageExpNeed(7, 3) ? `<button class="btn small danger" onclick="UI.showDujie(${d.id})">渡劫</button>` : ""}
          <button class="btn small" onclick="UI.showDiscipleDetail(${d.id})">详情</button>
        </td>
      </tr>`;
    }).join("");
    el.innerHTML = `<div class="panel"><h3>弟子名录（${list.length}/${Game.capacity()}）</h3>
      <table><thead><tr>
        <th>姓名</th><th>境界</th><th>灵根</th><th>职业</th><th>修为</th>
        <th>战力</th><th>忠诚</th><th>寿元</th><th>岗位</th><th>操作</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  showDiscipleDetail(id) {
    const d = Game.state.disciples.find(x => x.id === id);
    if (!d) return;
    this.modal(`
      <h2>${d.name} ${d.isLeader ? "（掌门）" : ""}</h2>
      ${this.avatar(d, "big")}
      <div class="modal-text">
性别：${d.gender}　年龄：${Math.floor(d.age)}　剩余寿元：${Math.floor(d.lifespanLeft)} 年
境界：${REALMS[d.realm].name}${STAGES[d.stage]}
灵根：${SPIRIT_ROOTS[d.root].name}（修炼×${SPIRIT_ROOTS[d.root].speed}）
职业：${CLASSES[d.cls].name}（${CLASSES[d.cls].cat}类 - ${CLASSES[d.cls].desc}）
心性：${d.personality}　气运：${d.luck}　悟性：${d.comprehension}
忠诚度：${d.loyalty}　综合战力：${Game.disciplePower(d)}
修炼速度：${Game.cultivateSpeed(d).toFixed(2)}/月
${d.injuredMonths > 0 ? `⚠ 重伤中，还需 ${d.injuredMonths} 个月恢复\n` : ""}
${d.foundationDmg ? "⚠ 根基受损：修炼速度永久 -20%\n" : ""}
      </div>
      <div class="modal-footer"><button class="btn" onclick="UI.closeModal()">关闭</button></div>`);
  },

  // ---------- 突破 ----------
  showBreakthrough(id) {
    const s = Game.state;
    const d = s.disciples.find(x => x.id === id);
    const info = Game.breakthroughInfo(d);
    let pills = 0, guardians = [];
    const render = () => {
      const rate = Game.breakthroughRate(d, pills, guardians.length);
      const elder = Game.aliveDisciples().filter(x => x.id !== d.id && x.realm > d.realm && x.injuredMonths <= 0);
      this.modal(`
        <h2>${info.isMajor ? "大境界突破" : "小阶突破"} —— ${d.name}</h2>
        <div class="modal-text">
当前：${REALMS[d.realm].name}${STAGES[d.stage]} → ${info.isMajor ? `【${REALMS[Math.min(d.realm + 1, REALMS.length - 1)].name}期】` : STAGES[d.stage + 1]}
基础成功率：${Math.round(info.base * 100)}%
服用丹药：${pills} 颗（每颗 +8%，库存 ${s.resources.danyao}）
护法修士：${guardians.length} 名（每名 +5%）
气运加成：${d.luck > 50 ? "+" : ""}${Math.round((d.luck - 50) / 5)}%
<b style="color:var(--gold)">当前成功率：${Math.round(rate * 100)}%</b>
失败惩罚（大境界突破）：掉境 40% / 重伤 35% / 根基受损 20% / 陨落 5%
        </div>
        <div class="modal-options">
          <button class="btn opt-btn" onclick="UI._btPill(${id},1)">服用丹药 +1</button>
          <button class="btn opt-btn" onclick="UI._btPill(${id},-1)">丹药 -1</button>
          ${elder.map(e => `<button class="btn opt-btn" onclick="UI._btGuard(${id},${e.id})">
            ${guardians.includes(e.id) ? "✓ " : ""}请 ${e.name}（${REALMS[e.realm].name}）护法</button>`).join("")}
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="UI.closeModal()">再想想</button>
          <button class="btn danger" onclick="UI._btGo(${id})">确认突破（不可逆）</button>
        </div>`);
    };
    this._btState = { pills: 0, guardians: [], render };
    this._btState.render();
  },
  _btPill(id, delta) {
    const s = Game.state;
    this._btState.pills = clamp(this._btState.pills + delta, 0, Math.min(BREAKTHROUGH.maxPill, s.resources.danyao));
    this._btState.render();
  },
  _btGuard(id, gid) {
    const g = this._btState.guardians;
    const i = g.indexOf(gid);
    if (i >= 0) g.splice(i, 1); else if (g.length < 2) g.push(gid);
    this._btState.render();
  },
  _btGo(id) {
    const { pills, guardians } = this._btState;
    const r = Game.tryBreakthrough(id, pills, guardians);
    if (r.err) return this.toast(r.err);
    this.sfx(r.ok ? "breakthrough_success" : "breakthrough_fail");
    const d = Game.state.disciples.find(x => x.id === id);
    this.modal(`
      <h2>${r.ok ? "突破成功！" : "突破失败……"}</h2>
      <div class="modal-text">${r.ok
        ? (r.major ? `${d.name} 道基大成，成功踏入【${REALMS[d.realm].name}期】！天地灵气为之倒卷！` : `${d.name} 顺利突破至 ${REALMS[d.realm].name}${STAGES[d.stage]}。`)
        : r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">知道了</button></div>`);
  },

  // ---------- 建筑 ----------
  renderBuildings() {
    const s = Game.state;
    const el = document.getElementById("view-buildings");
    const cards = Object.entries(BUILDINGS).map(([id, b]) => {
      const lv = s.buildings[id] || 0;
      const cost = Game.upgradeCost(id);
      const costText = lv >= b.maxLv ? "已满级" :
        Object.entries(cost).map(([k, v]) => `${RESOURCES[k].name}×${v}`).join(" ");
      const workers = (s.jobs[id] || []).map(did => s.disciples.find(d => d.id === did)).filter(d => d && d.alive);
      const idle = Game.aliveDisciples().filter(d => !Game.hasJob(d));
      return `<div class="panel">
        <h3><img class="b-icon" src="assets/icon_${id}.png" alt="" onerror="this.style.display='none'">${b.name} <span style="color:var(--text-dim);font-size:13px">Lv.${lv}/${b.maxLv}</span></h3>
        <p style="color:var(--text-dim);margin-bottom:8px">${b.desc}</p>
        <p>效果：<span style="color:var(--jade)">${b.effect(Math.max(1, lv))}</span></p>
        ${b.jobs > 0 && b.jobs < 99 ? `<p>岗位：${workers.length}/${b.jobs}
          ${workers.map(d => `<span class="tag">${d.name}<a href="javascript:;" onclick="UI.unassign('${id}',${d.id})" style="color:#d05a4e;text-decoration:none"> ✕</a></span>`).join("")}
        </p>` : ""}
        ${id === "yanwu" ? `<p>修炼中：${workers.map(d => `<span class="tag">${d.name}<a href="javascript:;" onclick="UI.unassign('${id}',${d.id})" style="color:#d05a4e;text-decoration:none"> ✕</a></span>`).join("") || "无"}</p>` : ""}
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn small" ${lv >= b.maxLv ? "disabled" : ""} onclick="UI.confirmUpgrade('${id}')">升级（${costText}）</button>
          ${b.jobs > 0 && idle.length ? `<select id="assign-sel-${id}" style="background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              ${idle.map(d => `<option value="${d.id}">${d.name}（${CLASSES[d.cls].name}）</option>`).join("")}
            </select>
            <button class="btn small" onclick="UI.assign('${id}')">派驻</button>` : ""}
        </div>
      </div>`;
    }).join("");
    el.innerHTML = `<div class="grid cols-2">${cards}</div>
      <p class="scroll-hint">建筑须派驻对应职业弟子方有产出：职业匹配效率×1.5，不匹配×0.6。演武场为修炼岗位，人数不限。</p>`;
  },
  assign(bId) {
    const sel = document.getElementById("assign-sel-" + bId);
    if (!sel) return;
    const err = Game.assignJob(bId, Number(sel.value));
    if (err) this.toast(err);
    this.render();
  },
  unassign(bId, dId) {
    Game.unassignJob(bId, dId);
    this.render();
  },
  confirmUpgrade(bId) {
    const b = BUILDINGS[bId];
    const cost = Game.upgradeCost(bId);
    const costText = Object.entries(cost).map(([k, v]) => `${RESOURCES[k].name}×${v}`).join("、");
    this.confirm(`升级【${b.name}】至 Lv.${(Game.state.buildings[bId] || 0) + 1}？\n消耗：${costText}`, () => {
      const err = Game.upgradeBuilding(bId);
      if (err) this.toast(err); else this.render();
    });
  },

  // ---------- 外交 ----------
  renderDiplomacy() {
    const s = Game.state;
    const el = document.getElementById("view-diplomacy");
    const cards = s.sects.map(sec => {
      if (sec.destroyed) {
        return `<div class="panel" style="opacity:.45">
          <h3>${sec.name} <span class="tag red">已覆灭</span></h3>
          <p style="color:var(--text-dim)">山门化为焦土，道统断绝。</p></div>`;
      }
      const rel = relationLevel(sec.relation);
      const pct = (sec.relation + 100) / 200 * 100;
      const color = sec.relation < 0 ? "#d05a4e" : sec.relation < 40 ? "#b8860b" : "#7fb069";
      const canAssault = sec.relation <= WAR_CONFIG.assaultNeedRel && !sec.vassal;
      return `<div class="panel">
        <h3>${sec.name} <span class="tag ${rel.cls}">${sec.atWar ? "交战中" : rel.name}</span>
          ${sec.allied ? `<span class="tag gold">同盟</span>` : ""}${sec.trade ? `<span class="tag green">通商</span>` : ""}
          ${sec.vassal ? `<span class="tag gold">附庸·忠诚${sec.loyalty}</span>` : ""}</h3>
        <p style="color:var(--text-dim)">${sec.trait}</p>
        <p>实力评估：${sec.power}　关系：${sec.relation}</p>
        <div class="rel-bar"><div style="width:${pct}%;background:${color}"></div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          ${sec.vassal
            ? `<button class="btn small" onclick="UI.soothe('${sec.id}')">安抚（灵石×100）</button>
               <span class="scroll-hint">每年12月上缴岁贡；忠诚&lt;30 有反叛风险</span>`
            : DIPLO_ACTIONS.filter(a => !(a.id === "ally" && sec.allied) && !(a.id === "trade" && sec.trade))
              .map(a => `<button class="btn small ${a.id === "declare" ? "danger" : ""}"
                onclick="UI.confirmDiplo('${sec.id}','${a.id}')" title="${a.desc}">${a.name}</button>`).join("")
              + (canAssault ? `<button class="btn small danger" onclick="UI.showWarRoom('${sec.id}')">⚔ 攻打山门</button>` : "")}
        </div>
      </div>`;
    }).join("");
    // 联盟面板
    const al = s.alliance;
    const allyCount = s.sects.filter(x => x.allied && !x.destroyed).length;
    const alliancePanel = `<div class="panel">
      <h3>修真联盟</h3>
      ${al ? `
        <p><span class="tag gold">【${al.name}】盟主</span> 威望：${al.prestige}｜成员：${al.members.map(id => {
          const sec = s.sects.find(x => x.id === id);
          return sec && !sec.destroyed ? sec.name : null;
        }).filter(Boolean).join("、") || "（成员已尽数覆灭）"}</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn small" onclick="UI.openCouncil()">召开议事</button>
          <button class="btn small danger" ${al.raidCd > 0 ? "disabled" : ""} onclick="UI.doRaid()">讨伐魔道${al.raidCd > 0 ? `（冷却${al.raidCd}月）` : ""}</button>
        </div>
        <p class="scroll-hint">讨伐魔道：我方总战力 + 盟员半数战力 vs 魔道（逐年变强，当前约 ${ALLIANCE_CFG.modaoBase + s.year * 30}）。</p>`
      : `<p style="color:var(--text-dim)">声望≥${ALLIANCE_CFG.needRep}（当前 ${s.reputation}）且有 ${ALLIANCE_CFG.needAllies} 家同盟（当前 ${allyCount} 家）可牵头组建联盟。</p>
         <button class="btn primary" onclick="UI.formAlliance()">组建联盟</button>`}
    </div>`;
    el.innerHTML = `<div class="grid cols-2">${cards}</div>${alliancePanel}
      <p class="scroll-hint">我方总战力：${Game.sectPower()}。关系≤${WAR_CONFIG.assaultNeedRel} 可发动宗门攻防战（编队+战术+战后三选一处置）。</p>`;
  },
  formAlliance() {
    this.confirm("牵头组建联盟？需消耗各方人情，成立后我宗为盟主，每月可召开议事、发动联盟讨伐。", () => {
      const r = Game.formAlliance();
      if (r.err) return this.toast(r.err);
      this.sfx("battle_result");
      this.toast(`【${ALLIANCE_CFG.name}】歃血为盟，正式成立！我宗共尊为盟主。`);
      this.render();
    });
  },
  openCouncil() {
    const topic = Game.councilTopic();
    this._councilTopic = topic;
    this.sfx("council");
    this.modal(`<h2>联盟议事 · ${topic.title}</h2>
      <div class="modal-text">${topic.text}</div>
      <div class="modal-options">
        ${topic.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseCouncil(${i})">
          ${o.label}<span class="opt-desc">${o.desc}</span></button>`).join("")}
      </div>`);
    document.getElementById("modal").classList.add("event-alliance");
  },
  chooseCouncil(i) {
    const r = Game.applyCouncil(this._councilTopic, i);
    if (r.err) return this.toast(r.err);
    this.modal(`<h2>议事结果</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">散会</button></div>`);
  },
  doRaid() {
    this.confirm("发动联盟讨伐魔道？胜则缴获丰厚、声望大涨；败则弟子重伤、联盟威望受损。", () => {
      this.warBgm();
      const r = Game.allianceRaid();
      if (r.err) return this.toast(r.err);
      this.sfx("battle_result");
      this.modal(`<h2>${r.win ? "联盟大捷！" : "讨伐失利……"}</h2><div class="modal-text">${r.msg}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">知道了</button></div>`);
      document.getElementById("modal").classList.add("war-result");
    }, true);
  },
  soothe(sectId) {
    const r = Game.sootheVassal(sectId);
    if (r.err) return this.toast(r.err);
    this.toast(r.msg); this.render();
  },

  // ---------- 战争指挥室 ----------
  showWarRoom(sectId) {
    this.warBgm();
    const s = Game.state;
    const sec = s.sects.find(x => x.id === sectId);
    const formation = { front: [], mid: [], back: [] };
    let tactic = "frontal";
    const available = Game.aliveDisciples().filter(d => d.injuredMonths <= 0 && !d.adventure);
    const render = () => {
      const inFormation = new Set([...formation.front, ...formation.mid, ...formation.back]);
      const pool = available.filter(d => !inFormation.has(d.id));
      const atk = Game.calcAssaultPower(formation);
      const def = Math.round(sec.power * (1 + WAR_CONFIG.defenseArrayBonus));
      this.modal(`
        <h2>⚔ 攻打【${sec.name}】山门</h2>
        <div class="modal-text">守方战力（含护山大阵 +${Math.round(WAR_CONFIG.defenseArrayBonus * 100)}%）：<b style="color:#d05a4e">${def}</b>
我方出战战力：<b style="color:var(--gold)">${atk}</b>（职业与排位匹配有加成）</div>
        <div class="war-formation">
          ${["front", "mid", "back"].map(row => `<div class="war-row">
            <h4>${{ front: "前排（体修×1.4）", mid: "中排（剑修×1.3）", back: "后排（阵修×1.4）" }[row]}</h4>
            ${formation[row].map(id => {
              const d = s.disciples.find(x => x.id === id);
              return `<span class="tag jade" title="点击移出" onclick="UI._warRemove('${sectId}','${row}',${id})">${d.name} ✕</span>`;
            }).join("") || "<span style='color:var(--text-dim)'>空缺</span>"}
          </div>`).join("")}
        </div>
        <div class="modal-text">可派遣弟子（点击加入 前/中/后排）：<br>
          ${pool.map(d => `<span class="tag" style="cursor:default">${d.name}（${CLASSES[d.cls].name}·战力${Game.disciplePower(d)}）</span>
            <a href="javascript:;" onclick="UI._warAdd('${sectId}','front',${d.id})">前</a>
            <a href="javascript:;" onclick="UI._warAdd('${sectId}','mid',${d.id})">中</a>
            <a href="javascript:;" onclick="UI._warAdd('${sectId}','back',${d.id})">后</a>`).join("<br>") || "无人可派"}</div>
        <img class="divider-img" src="assets/ui_divider.png">
        <div class="modal-text">战术选择：</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${Object.entries(TACTICS).map(([id, t]) => `<button class="btn small tactic-btn ${tactic === id ? "primary" : ""}"
            title="${t.desc}" onclick="UI._warTactic('${sectId}','${id}')">${t.name}</button>`).join("")}
        </div>
        <div class="modal-text" style="font-size:12px;color:var(--text-dim)">${TACTICS[tactic].desc}</div>
        <div class="modal-footer">
          <button class="btn" onclick="UI.closeModal()">撤兵</button>
          <button class="btn danger" ${atk <= 0 ? "disabled" : ""} onclick="UI._warGo('${sectId}')">发起总攻（不可逆）</button>
        </div>`);
      // 战争弹窗用战场背景
      document.getElementById("modal").classList.add("war-result");
    };
    this._warState = { formation, tactic, render };
    render();
  },
  _warAdd(sectId, row, dId) {
    const f = this._warState.formation;
    if (f[row].length >= 5) return this.toast("每排最多 5 人");
    f[row].push(dId);
    this._warState.render();
  },
  _warRemove(sectId, row, dId) {
    const f = this._warState.formation;
    f[row] = f[row].filter(x => x !== dId);
    this._warState.render();
  },
  _warTactic(sectId, id) {
    this._warState.tactic = id;
    this._warState.render();
  },
  _warGo(sectId) {
    const { formation, tactic } = this._warState;
    const r = Game.startAssault(sectId, formation, tactic);
    if (r.err) return this.toast(r.err);
    this.sfx("battle_result");
    if (r.win && r.needPostWar) {
      this.modal(`<h2>大捷！</h2><div class="modal-text">${r.msg}</div>
        <div class="modal-options">
          <button class="btn opt-btn danger" onclick="UI._postWar('${sectId}','destroy')">灭门掠夺<span class="opt-desc">掠其库藏、概率俘虏弟子；声望大跌，各宗警惕</span></button>
          <button class="btn opt-btn" onclick="UI._postWar('${sectId}','vassal')">收为附庸<span class="opt-desc">保留其建制，年年岁贡；需维护忠诚度防反叛</span></button>
          <button class="btn opt-btn" onclick="UI._postWar('${sectId}','merge')">合并入宗<span class="opt-desc">其弟子并入我宗，携「异心」debuff，需时间消化</span></button>
        </div>`);
      document.getElementById("modal").classList.add("war-result");
    } else {
      this.modal(`<h2>败北……</h2><div class="modal-text">${r.msg}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">收兵回山</button></div>`);
      document.getElementById("modal").classList.add("war-result");
    }
  },
  _postWar(sectId, choice) {
    const r = Game.postWar(sectId, choice);
    if (r.err) return this.toast(r.err);
    this.modal(`<h2>战后处置</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">知道了</button></div>`);
    document.getElementById("modal").classList.add("war-result");
  },

  // ---------- 长老院 / 派系 ----------
  renderElders() {
    const s = Game.state;
    const el = document.getElementById("view-elders");
    const elders = Game.elders();
    const candidates = Game.aliveDisciples().filter(d => d.realm >= ELDER.needRealm && !d.isElder);
    const keqings = Game.aliveDisciples().filter(d => d.keqing);
    const fs = Game.factionStats();
    const total = Math.max(1, fs.radical + fs.steady + fs.neutral);
    el.innerHTML = `
      <div class="grid cols-2">
        <div class="panel elder-hall">
          <h3>长老院（${elders.length}/${ELDER.maxSeats}）</h3>
          ${elders.map(d => `<p>${this.avatar(d)}${d.name} —— ${ELDER.domainName[ELDER.seatDomain[d.cls]]} +${Math.round(ELDER.bonusPerSeat * 100)}%
            <button class="btn small" onclick="UI.dismissElder(${d.id})">罢免</button></p>`).join("") || "<p style='color:var(--text-dim)'>虚位以待。</p>"}
          ${candidates.length ? `<hr style="border-color:var(--border);margin:8px 0">
            <p style="color:var(--text-dim)">可任命（需${REALMS[ELDER.needRealm].name}期以上）：</p>
            ${candidates.map(d => `<p>${d.name}（${REALMS[d.realm].name}·${CLASSES[d.cls].name}）
              <button class="btn small primary" onclick="UI.appointElder(${d.id})">任命长老</button></p>`).join("")}` : ""}
        </div>
        <div class="panel">
          <h3>客卿挂单</h3>
          <p style="color:var(--text-dim)">${KEQING.desc}</p>
          ${keqings.map(d => `<p>${d.name}（${REALMS[d.realm].name}期·月俸${KEQING.salaryBase[d.realm]}灵石·忠诚${d.loyalty}）</p>`).join("") || "<p style='color:var(--text-dim)'>暂无客卿。</p>"}
          <button class="btn primary" style="margin-top:8px" onclick="UI.recruitKeqing()">招募客卿（灵石×500）</button>
        </div>
      </div>
      <div class="panel">
        <h3>派系形势（张力 ${s.factionTension || 0}/100）</h3>
        <div class="bar" style="height:14px;margin:8px 0"><div style="width:${s.factionTension || 0}%;background:${(s.factionTension || 0) >= FACTION_CFG.tensionThreshold ? "#d05a4e" : "var(--gold)"}"></div></div>
        ${Object.entries(FACTIONS).map(([k, f]) => `
          <p><span class="tag" style="color:${f.color};border-color:${f.color}">${f.name}</span>
          ${fs[k]} 人（${Math.round(fs[k] / total * 100)}%）<span style="color:var(--text-dim)">${f.desc}</span></p>`).join("")}
        <p class="scroll-hint">一派独大（占比>60%）将持续推高张力；中和派弟子可缓和。张力达 ${FACTION_CFG.tensionThreshold} 将爆发内斗，需掌门亲自裁决。</p>
      </div>`;
  },
  appointElder(dId) {
    this.confirm("任命为长老？该弟子将按职业为对应领域提供全宗加成。", () => {
      const r = Game.appointElder(dId);
      if (r.err) this.toast(r.err);
      this.render();
    });
  },
  dismissElder(dId) {
    this.confirm("罢免该长老？其忠诚度 -10。", () => {
      Game.dismissElder(dId);
      this.render();
    });
  },
  recruitKeqing() {
    this.confirm("以灵石×500 招募一名散修高手为客卿？每月需支付俸禄，忠诚度偏低。", () => {
      const r = Game.recruitKeqing();
      if (r.err) return this.toast(r.err);
      this.modal(`<h2>客卿来投</h2><div class="modal-text">${r.d.name}（${REALMS[r.d.realm].name}期·${CLASSES[r.d.cls].name}）挂单入宗！\n月俸：灵石×${KEQING.salaryBase[r.d.realm]}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">好</button></div>`);
    });
  },

  // ---------- 渡劫飞升 ----------
  showDujie(dId) {
    const s = Game.state;
    const d = s.disciples.find(x => x.id === dId);
    const chk = Game.canDujie(d);
    if (chk.err) return this.toast(chk.err);
    let pills = 0, guardians = [], wave = 0, done = false;
    const render = () => {
      const rate = Game.dujieWaveRate(pills, guardians.length);
      const elders = Game.aliveDisciples().filter(x => x.id !== d.id && x.realm >= 6 && x.injuredMonths <= 0);
      const wavesHtml = Array.from({ length: DUJIE.waves }, (_, i) => {
        const n = i + 1;
        const cls = this._dujieResult ? (this._dujieResult[i] === 1 ? "pass" : "fail") : (n === wave + 1 && !done ? "now" : "");
        return `<div class="dujie-wave ${cls || ""}">${n}</div>`;
      }).join("");
      this.modal(`
        <h2>⚡ 九霄雷劫 —— ${d.name}</h2>
        <div class="modal-text">${done ? "" : `渡劫准备：渡劫丹 ${pills}/${Math.min(DUJIE.maxPill, s.resources.danyao)}（每颗 +2%）　护法 ${guardians.length}/${Math.min(DUJIE.maxGuardian, elders.length)} 名（每名 +1.5%）
底蕴加成 +${Math.round((s.heritage || 0) * DUJIE.heritageWaveBonus * 100)}%　气运加成 +${Math.round(Game.qiyunBonus() * 100)}%
<b style="color:var(--gold)">每道天雷成功率：${Math.round(rate * 100)}%</b>（九雷全过则飞升，失败：重伤掉境 50% / 道基崩损 30% / 形神俱灭 20%）`}</div>
        <div class="dujie-waves">${wavesHtml}</div>
        ${!done && wave === 0 ? `<div class="modal-options">
          <button class="btn opt-btn" onclick="UI._djPill(1)">渡劫丹 +1</button>
          <button class="btn opt-btn" onclick="UI._djPill(-1)">渡劫丹 -1</button>
          ${elders.map(e => `<button class="btn opt-btn" onclick="UI._djGuard(${e.id})">${guardians.includes(e.id) ? "✓ " : ""}请 ${e.name}（${REALMS[e.realm].name}）护法</button>`).join("")}
        </div>` : ""}
        <div class="modal-footer">
          ${done ? `<button class="btn primary" onclick="UI.closeModal();UI.render()">礼成</button>`
            : `<button class="btn" onclick="UI.closeModal()">暂缓</button>
               <button class="btn danger" onclick="UI._djWave()">${wave === 0 ? "引动天雷（不可逆）" : "硬抗第 " + (wave + 1) + " 道天雷"}</button>`}
        </div>`);
      document.getElementById("modal").classList.add("event-dujie");
    };
    this._dujieState = { dId, get pills() { return pills; }, get guardians() { return guardians; }, get wave() { return wave; },
      setPills: v => pills = v, toggleGuard: id => { const i = guardians.indexOf(id); i >= 0 ? guardians.splice(i, 1) : guardians.length < DUJIE.maxGuardian && guardians.push(id); },
      nextWave: () => ++wave, setDone: () => done = true, render };
    this._dujieResult = [];
    render();
  },
  _djPill(delta) {
    const st = this._dujieState;
    const s = Game.state;
    st.setPills(clamp(st.pills + delta, 0, Math.min(DUJIE.maxPill, s.resources.danyao)));
    st.render();
  },
  _djGuard(id) { const st = this._dujieState; st.toggleGuard(id); st.render(); },
  _djWave() {
    const st = this._dujieState;
    const nextWave = st.wave + 1;
    this.sfx("dujie");
    const r = Game.dujieWave(st.dId, nextWave, st.pills, st.guardians);
    if (r.err) return this.toast(r.err);
    this._dujieResult[nextWave - 1] = r.passed ? 1 : -1;
    st.nextWave();
    if (r.finished) {
      st.setDone();
      Game.autosave();
    }
    st.render();
    this.toast2(r.msg, r.finished);
  },
  toast2(msg, final) {
    // 渡劫过程中的轻量提示：直接更新弹窗文本区顶部
    const m = document.getElementById("modal");
    const txt = m.querySelector(".modal-text");
    if (txt) txt.innerHTML = `<b style="color:${final ? "var(--gold)" : "var(--text)"}">${msg.replaceAll("\n", "<br>")}</b>`;
  },

  // ---------- 灵界分宗 ----------
  renderSpirit() {
    const s = Game.state;
    const el = document.getElementById("view-spirit");
    if (!s.spiritChannel) {
      el.innerHTML = `<div class="panel"><h3>灵界分宗</h3>
        <p style="color:var(--text-dim)">灵界通道尚未贯通。请在「宗门总览」推进灵界通道三步任务链（当前进度 ${s.spiritStep || 0}/3）。</p></div>`;
      return;
    }
    if (!s.branch) {
      const can = Game.aliveDisciples().filter(d => d.realm >= SPIRIT_BRANCH.minRealm && !d.isLeader && d.injuredMonths <= 0 && !d.adventure);
      el.innerHTML = `<div class="panel"><h3>建立灵界分宗</h3>
        <p>消耗：灵石×2000、灵药×200、矿石×200；至少派驻 ${SPIRIT_BRANCH.minDisciple} 名金丹期以上弟子（掌门留守）。</p>
        <div class="modal-options" style="margin-top:8px">
          ${can.map(d => `<label class="btn opt-btn" style="cursor:pointer"><input type="checkbox" class="branch-chk" value="${d.id}"> ${d.name}（${REALMS[d.realm].name}·战力${Game.disciplePower(d)}）</label>`).join("") || "<p>无满足条件的弟子。</p>"}
        </div>
        <button class="btn primary" style="margin-top:10px" ${can.length >= SPIRIT_BRANCH.minDisciple ? "" : "disabled"} onclick="UI.establishBranch()">开宗立派</button></div>`;
      return;
    }
    const members = Game.aliveDisciples().filter(d => d.inBranch);
    const pw = Game.branchPower();
    el.innerHTML = `
      <div class="panel">
        <h3>灵界分宗</h3>
        <div class="stat-row">
          <div class="stat-box"><div class="num">${members.length}</div><div class="lbl">驻守弟子</div></div>
          <div class="stat-box"><div class="num">${pw}</div><div class="lbl">分宗战力</div></div>
          <div class="stat-box"><div class="num">${Math.round(pw * SPIRIT_BRANCH.incomePerPower)}</div><div class="lbl">灵石/月</div></div>
          <div class="stat-box"><div class="num">${Math.round(pw * SPIRIT_BRANCH.spiritHerbRate / 10)}</div><div class="lbl">灵药/月</div></div>
        </div>
        <p style="margin-top:8px">${members.map(d => `<span class="tag jade">${d.name}（${REALMS[d.realm].name}）</span>`).join("")}</p>
      </div>
      <div class="panel">
        <h3>灵界势力</h3>
        ${(s.spiritSects || []).map(sec => {
          const rel = relationLevel(sec.relation);
          return `<p><b>${sec.name}</b> <span class="tag ${rel.cls}">${rel.name}（${sec.relation}）</span>
            <span style="color:var(--text-dim)">${sec.trait}｜实力 ${sec.power}</span>
            <button class="btn small" onclick="UI.spiritDiplo('${sec.id}','gift')">赠礼(300)</button>
            <button class="btn small" onclick="UI.spiritDiplo('${sec.id}','trade')">跨界贸易</button></p>`;
        }).join("")}
        <p class="scroll-hint">关系 &lt;-30 的灵界势力可能袭扰分宗；关系 ≥20 可进行跨界贸易。</p>
      </div>`;
  },
  establishBranch() {
    const ids = [...document.querySelectorAll(".branch-chk:checked")].map(x => Number(x.value));
    this.confirm(`确认建立灵界分宗？派驻 ${ids.length} 名弟子跨界驻守（长期离宗）。`, () => {
      const r = Game.establishBranch(ids);
      if (r.err) return this.toast(r.err);
      this.sfx("breakthrough_success");
      this.modal(`<h2>灵界分宗立！</h2><div class="modal-text">${r.msg}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">好</button></div>`);
      document.getElementById("modal").classList.add("event-spirit");
    });
  },
  spiritDiplo(sectId, action) {
    const r = Game.spiritDiplo(sectId, action);
    if (r.err) return this.toast(r.err);
    this.toast(r.msg);
    this.render();
  },

  // ---------- 商路贸易 ----------
  renderTrade() {
    const s = Game.state;
    const el = document.getElementById("view-trade");
    const active = s.caravans[0];
    const idle = Game.aliveDisciples().filter(d => d.injuredMonths <= 0 && !d.adventure);
    el.innerHTML = `
      ${active ? `<div class="panel"><h3>商队在外</h3>
        <p>路线：${TRADE_ROUTES.find(r => r.id === active.routeId).name}｜货物：${TRADE_GOODS[active.goodsId].name}×${active.amount}｜归期：${active.monthsLeft} 个月</p></div>` : ""}
      <div class="grid cols-3">
        ${TRADE_ROUTES.map(r => `<div class="panel">
          <h3>${r.name}</h3>
          <p style="color:var(--text-dim)">${r.desc}</p>
          <p>单程 ${r.months} 个月｜基础利润 ${r.profit}｜遇劫风险 <span style="color:${r.risk > 0.3 ? "#d05a4e" : "var(--gold)"}">${Math.round(r.risk * 100)}%</span></p>
          <p>可贩商品：${r.goods.map(g => TRADE_GOODS[g].name).join("、")}</p>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
            <select id="trade-goods-${r.id}" style="background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              ${r.goods.map(g => `<option value="${g}">${TRADE_GOODS[g].name}（单价${TRADE_GOODS[g].unitCost}灵石，库存${s.resources[g] || 0}）</option>`).join("")}
            </select>
            <select id="trade-escort-${r.id}" style="background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              <option value="">无护送（风险高）</option>
              ${idle.map(d => `<option value="${d.id}">护送：${d.name}（战力${Game.disciplePower(d)}）</option>`).join("")}
            </select>
            <button class="btn primary" ${active ? "disabled" : ""} onclick="UI.dispatch('${r.id}')">派出商队（货10单位）</button>
          </div>
        </div>`).join("")}
      </div>
      <p class="scroll-hint">货款 = 单价 × 数量，从灵石扣除；归来进行风险结算：被劫则血本无归且护送弟子重伤；护送弟子战力越高风险越低。同时仅能有一支商队在外。</p>`;
  },
  dispatch(routeId) {
    const goods = document.getElementById("trade-goods-" + routeId).value;
    const esc = document.getElementById("trade-escort-" + routeId).value;
    this.confirm(`确认派出商队走【${TRADE_ROUTES.find(r => r.id === routeId).name}】？\n货款将立即扣除，归期结算盈亏。`, () => {
      const r = Game.dispatchCaravan(routeId, goods, 10, esc ? Number(esc) : null);
      if (r.err) this.toast(r.err);
      this.render();
    });
  },

  // ---------- 外出历练 ----------
  renderAdventure() {
    const s = Game.state;
    const el = document.getElementById("view-adventure");
    const out = Game.aliveDisciples().filter(d => d.adventure);
    const can = Game.aliveDisciples().filter(d => !d.adventure && d.injuredMonths <= 0 && !Game.hasJob(d));
    el.innerHTML = `
      ${out.length ? `<div class="panel"><h3>历练在外</h3>
        ${out.map(d => `<p>${this.avatar(d)}${d.name} —— ${ADVENTURE_PLACES.find(p => p.id === d.adventure.placeId).name}，${d.adventure.monthsLeft} 个月后归来</p>`).join("")}</div>` : ""}
      <div class="grid cols-3">
        ${ADVENTURE_PLACES.map(p => `<div class="panel">
          <h3>${p.name}</h3>
          <p style="color:var(--text-dim)">${p.desc}</p>
          <p>历时 ${p.months} 个月｜危险度 <span style="color:${p.danger > 0.3 ? "#d05a4e" : "var(--gold)"}">${Math.round(p.danger * 100)}%</span></p>
          <div style="display:flex;gap:6px;margin-top:8px">
            <select id="adv-sel-${p.id}" style="flex:1;background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              ${can.map(d => `<option value="${d.id}">${d.name}（${REALMS[d.realm].name}·战力${Game.disciplePower(d)}）</option>`).join("")}
            </select>
            <button class="btn primary" ${can.length ? "" : "disabled"} onclick="UI.sendAdv('${p.id}')">派遣</button>
          </div>
        </div>`).join("")}
      </div>
      <p class="scroll-hint">历练弟子须先解除岗位；归来时会触发随机事件，需你亲自抉择（影响修为/心性/气运/伤势）。</p>`;
  },
  sendAdv(placeId) {
    const sel = document.getElementById("adv-sel-" + placeId);
    if (!sel || !sel.value) return this.toast("无可派遣弟子");
    const dId = Number(sel.value);
    const d = Game.state.disciples.find(x => x.id === dId);
    this.confirm(`派遣 ${d.name} 前往【${ADVENTURE_PLACES.find(p => p.id === placeId).name}】历练？期间无法修炼与任职。`, () => {
      const r = Game.sendAdventure(dId, placeId);
      if (r.err) this.toast(r.err);
      this.render();
    });
  },
  confirmDiplo(sectId, actionId) {
    const act = DIPLO_ACTIONS.find(a => a.id === actionId);
    const sec = Game.state.sects.find(x => x.id === sectId);
    const danger = actionId === "declare";
    this.confirm(`对【${sec.name}】执行【${act.name}】？\n${act.desc}${danger ? "\n\n⚠ 宣战不可逆，战败损失惨重！" : ""}`, () => {
      const r = Game.diploAction(sectId, actionId);
      if (r.err) return this.toast(r.err);
      if (r.war) {
        this.modal(`<h2>${r.win ? "捷报！" : "败报……"}</h2><div class="modal-text">${r.msg}</div>
          <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">收兵</button></div>`);
      } else {
        this.toast(r.msg);
        this.render();
      }
    }, danger);
  },

  // ---------- 招募 ----------
  renderRecruit() {
    const s = Game.state;
    const el = document.getElementById("view-recruit");
    el.innerHTML = `<div class="grid cols-2">
      ${Object.entries(RECRUIT).map(([id, r]) => `<div class="panel">
        <h3>${r.name}</h3>
        <p style="color:var(--text-dim)">${r.desc}</p>
        <p>消耗：${Object.entries(r.cost).map(([k, v]) => `${RESOURCES[k].name}×${v}`).join(" ")}</p>
        <p>名额：${Game.aliveDisciples().length}/${Game.capacity()}</p>
        <button class="btn primary" style="margin-top:8px" onclick="UI.doRecruit('${id}')">开始${r.name}</button>
      </div>`).join("")}
    </div>`;
  },
  doRecruit(method) {
    const r = Game.recruit(method);
    if (r.err) return this.toast(r.err);
    const list = r.list.map(d =>
      `${d.name}（${SPIRIT_ROOTS[d.root].name}·${CLASSES[d.cls].name}·悟性${d.comprehension}·气运${d.luck}）`).join("\n");
    this.modal(`<h2>招募结果</h2><div class="modal-text">${list}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">收入门下</button></div>`);
  },

  // ---------- 灵界通道 ----------
  doSpiritQuest() {
    const q = SPIRIT_QUESTS[Game.state.spiritStep || 0];
    this.confirm(`推进灵界通道任务「${q.title}」？\n${q.desc}`, () => {
      const r = Game.spiritQuest();
      if (r.err) return this.toast(r.err);
      if (r.done) this.sfx("breakthrough_success");
      this.modal(`<h2>${r.done ? "灵界通道贯通！" : "任务进展"}</h2><div class="modal-text">${r.msg}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">好</button></div>`);
      document.getElementById("modal").classList.add("event-spirit");
    });
  },

  // ---------- 宗门志 ----------
  renderLog() {
    const s = Game.state;
    document.getElementById("view-log").innerHTML = `<div class="panel"><h3>宗门志</h3>
      <div id="log-list">${s.log.map(l => `<div class="log-entry ${l.cls}"><span class="log-date">${l.date}</span>${l.text}</div>`).join("")}</div></div>`;
  },

  // ---------- 月推进 ----------
  onNextMonth() {
    const s = Game.state;
    if (s.gameOver) return this.toast("宗门已覆灭，请读档或重开。");
    const r = Game.nextMonth();
    this.render();
    this._msgQueue = [];
    // 派系内斗事件（优先裁决）
    if (r.factionEvt) this._msgQueue.push({ type: "faction", ev: r.factionEvt });
    // 全界大事件
    if (r.worldEvt) this._msgQueue.push({ type: "world", ev: r.worldEvt });
    // 历练归来事件优先
    (r.advReturns || []).forEach(({ d, ev }) => this._msgQueue.push({ type: "adv", d, ev }));
    if (r.event) this._msgQueue.push({ type: "event", ev: r.event });
    if (r.msgs && r.msgs.length) this._msgQueue.push({ type: "msgs", list: r.msgs });
    this._drainQueue();
  },
  _drainQueue() {
    const item = (this._msgQueue || []).shift();
    if (!item) return;
    if (item.type === "world") {
      const ev = item.ev;
      this.sfx("event");
      this._pendingWorld = ev;
      this.modal(`
        <h2>【全界大事件】${ev.title}</h2>
        <div class="modal-text">${ev.text}</div>
        <div class="modal-options">
          ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseWorld(${i})">
            ${o.label}<span class="opt-desc">${o.desc}</span></button>`).join("")}
        </div>`);
      document.getElementById("modal").classList.add("event-mijing");
    } else if (item.type === "faction") {
      const ev = item.ev;
      this.sfx("strife");
      this.modal(`
        <h2>【内斗】${ev.title}</h2>
        <div class="modal-text">${ev.text}</div>
        <div class="modal-options">
          ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseFaction(${i})">
            ${o.label}<span class="opt-desc">${o.desc}</span></button>`).join("")}
        </div>`);
    } else if (item.type === "adv") {
      const { d, ev } = item;
      this.sfx("event");
      this._pendingAdv = item;
      this.modal(`
        <h2>【历练归来】${d.name} · ${ev.title}</h2>
        <div class="modal-text">${ev.text.replaceAll("{name}", d.name)}</div>
        <div class="modal-options">
          ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseAdv(${i})">
            ${o.label}<span class="opt-desc">${o.desc}</span></button>`).join("")}
        </div>`);
      document.getElementById("modal").classList.add("event-mijing");
    } else if (item.type === "event") {
      this.showEvent(item.ev, null);
    } else {
      this.modal(`<h2>本月要事</h2><div class="modal-text">${item.list.join("\n")}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI._drainQueue()">知道了</button></div>`);
    }
  },
  chooseWorld(optIdx) {
    const r = Game.applyWorldEvent(this._pendingWorld, optIdx);
    if (r.err) return this.toast(r.err);
    Game.autosave();
    this.modal(`<h2>【${this._pendingWorld.title}】结果</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },
  chooseFaction(optIdx) {
    const r = Game.applyFactionChoice(optIdx);
    if (r.err) return this.toast(r.err);
    Game.autosave();
    this.modal(`<h2>【内斗裁决】</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
  },
  chooseAdv(optIdx) {
    const { d, ev } = this._pendingAdv;
    const r = Game.applyAdvOption(d, ev, optIdx);
    if (r.err) return this.toast(r.err);
    Game.autosave();
    this.modal(`<h2>【历练·${ev.title}】结果</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },
  showEvent(ev, msgs) {
    this.sfx("event");
    this._pendingEvent = ev;
    this.modal(`
      <h2>【事件】${ev.title}</h2>
      <div class="modal-text">${(msgs && msgs.length ? msgs.join("\n") + "\n\n" : "")}${ev.text}</div>
      <div class="modal-options">
        ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseEvent('${ev.id}',${i})">
          ${o.label}<span class="opt-desc">${o.desc}</span></button>`).join("")}
      </div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },
  chooseEvent(evId, optIdx) {
    const ev = this._pendingEvent;
    const r = Game.applyEventOption(ev, optIdx);
    if (r.err) return this.toast(r.err);
    Game.autosave();
    this.modal(`<h2>【${ev.title}】结果</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },

  // ---------- 存档 ----------
  showSaveLoad(mode) {
    const slots = [1, 2, 3].map(slot => {
      const info = Game.saveInfo(slot);
      const label = info
        ? `${info.sectName}｜太元${info.year}年${info.month}月｜第${info.gen}代｜弟子${info.disciples}人`
        : "（空存档位）";
      return `<button class="btn opt-btn" onclick="UI.${mode === "save" ? "doSave" : "doLoad"}(${slot})">档位${slot}：${label}</button>`;
    }).join("");
    const reset = mode === "load" ? `<button class="btn opt-btn" style="border-color:#d05a4e;color:#d05a4e" onclick="UI.doReset()">⚠ 开启新周目（清空当前进度）</button>` : "";
    this.modal(`<h2>${mode === "save" ? "存档" : "读档"}</h2>
      <div class="modal-text">自动存档（档位0）每月结算后自动写入。${mode === "save" ? "当前进度将覆盖所选档位。" : "读取将覆盖当前进度！"}</div>
      <div class="modal-options">${slots}${mode === "save" ? `<button class="btn opt-btn" onclick="UI.doLoad(0)">读取自动存档（档位0）</button>` : `<button class="btn opt-btn" onclick="UI.doLoad(0)">读取自动存档（档位0）</button>`}${reset}</div>
      <div class="modal-footer"><button class="btn" onclick="UI.closeModal()">取消</button></div>`);
  },
  doSave(slot) {
    Game.save(slot);
    this.toast(`已保存至档位 ${slot}`);
    this.closeModal();
  },
  doLoad(slot) {
    this.confirm("读取存档将覆盖当前进度，确定？", () => {
      if (Game.load(slot)) { this.toast("读档成功"); this.closeModal(); this.render(); }
      else this.toast("该档位为空");
    });
  },
  doReset() {
    this.confirm("⚠ 确定放弃当前宗门、开启新周目？此操作不可撤销！", () => {
      Game.newGame();
      Game.save(0);
      this.closeModal();
      this.render();
      this.toast("新周目开启：山门初立，万象更新。");
    }, true);
  },

  // ---------- 通用组件 ----------
  modal(html) {
    document.getElementById("modal").innerHTML = html;
    document.getElementById("modal-mask").classList.remove("hidden");
  },
  closeModal() {
    const m = document.getElementById("modal");
    m.classList.remove("war-result", "event-mijing", "event-alliance", "event-spirit", "event-dujie");
    document.getElementById("modal-mask").classList.add("hidden");
    // 战争 BGM 复位
    const bgm = document.getElementById("bgm");
    if (bgm && bgm.dataset.warMode) { bgm.src = "assets/bgm_main.mp3"; bgm.play().catch(() => {}); delete bgm.dataset.warMode; }
  },
  warBgm() {
    const bgm = document.getElementById("bgm");
    if (bgm && !bgm.dataset.warMode) { bgm.dataset.warMode = "1"; bgm.src = "assets/bgm_war.mp3"; bgm.play().catch(() => {}); }
  },
  confirm(text, onYes, danger) {
    this._confirmCb = onYes;
    this.modal(`<h2>${danger ? "⚠ 危险操作" : "请确认"}</h2>
      <div class="modal-text">${text}</div>
      <div class="modal-footer">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn ${danger ? "danger" : "primary"}" onclick="UI._confirmYes()">确认</button>
      </div>`);
  },
  _confirmYes() {
    const cb = this._confirmCb;
    this.closeModal();
    if (cb) cb();
  },
  toast(msg) {
    this.modal(`<h2>提示</h2><div class="modal-text">${msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal()">知道了</button></div>`);
  }
};

window.addEventListener("DOMContentLoaded", () => UI.init());
