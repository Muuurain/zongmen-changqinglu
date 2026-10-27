/* ============================================================
 * 宗门长青录 - UI 渲染与交互
 * ============================================================ */

const UI = {
  currentView: "overview",

  init() {
    // v1.1.1：DPI 自适应——依据窗口尺寸设定根字号，CSS 全部使用 rem，元素随分辨率等比缩放
    const fitUI = () => {
      if (window.innerWidth <= 960) {
        document.documentElement.style.fontSize = "16px";
        return;
      }
      const scale = Math.min(window.innerWidth / 1360, window.innerHeight / 800);
      document.documentElement.style.fontSize = (16 * Math.min(Math.max(scale, 0.8), 2.0)) + "px";
    };
    fitUI();
    window.addEventListener("resize", fitUI);
    const topbar = document.getElementById("topbar");
    const syncCloudTile = () => {
      const height = topbar.getBoundingClientRect().height;
      if (height > 0) topbar.style.setProperty("--cloud-tile-width", `${height * 8}px`);
    };
    syncCloudTile();
    if ("ResizeObserver" in window) {
      this._cloudObserver = new ResizeObserver(syncCloudTile);
      this._cloudObserver.observe(topbar);
    } else {
      window.addEventListener("resize", syncCloudTile);
    }

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.onclick = () => this.switchView(btn.dataset.view);
    });
    document.getElementById("btn-next-month").onclick = () => this.onNextMonth();
    document.getElementById("btn-save").onclick = () => this.showSaveLoad("save");
    document.getElementById("btn-load").onclick = () => this.showSaveLoad("load");
    document.getElementById("btn-menu").onclick = () => this.showStartScreen();
    document.getElementById("btn-continue").onclick = () => this.continueGame();
    document.getElementById("btn-new-game").onclick = () => this.showNewGameForm();
    document.getElementById("btn-start-load").onclick = () => this.showSaveLoad("load");
    document.getElementById("new-game-form").onsubmit = event => { event.preventDefault(); this.startNewGame(); };
    document.getElementById("new-game-form").oninput = () => { document.getElementById("new-game-error").textContent = ""; };
    // BGM
    const bgm = document.getElementById("bgm");
    const bgmBtn = document.getElementById("btn-bgm");
    bgm.volume = 0.35;
    bgmBtn.onclick = () => {
      if (bgm.paused) { bgm.play().then(() => { bgmBtn.textContent = "♪"; }).catch(() => { bgmBtn.textContent = "♪̶"; }); }
      else { bgm.pause(); bgmBtn.textContent = "♪̶"; }
    };
    // 首次交互自动播放（规避浏览器自动播放限制）
    const kick = () => { bgm.play().catch(() => {}); document.removeEventListener("click", kick); };
    document.addEventListener("click", kick);
    // v1.1.0：按钮统一点击音效
    document.addEventListener("click", e => {
      if (e.target.closest(".btn") && !e.target.closest(".btn:disabled")) this.sfx("click");
    });
    window.addEventListener("zongmen-native-back", () => this.handleBackButton());
    window.addEventListener("zongmen-native-app-state", event => this.handleAppStateChange(event.detail?.isActive));
    document.addEventListener("visibilitychange", () => this.handleAppStateChange(document.visibilityState === "visible"));
    document.getElementById("app").dataset.ready = "true";
    document.getElementById("btn-new-game").disabled = false;
    document.getElementById("btn-start-load").disabled = false;
    this.refreshStartMenu();
  },
  handleAppStateChange(isActive) {
    if (typeof isActive !== "boolean" || this._appActive === isActive) return;
    this._appActive = isActive;
    const bgm = document.getElementById("bgm");
    const bgmBtn = document.getElementById("btn-bgm");
    if (!isActive) {
      this._resumeBgmAfterBackground = !!bgm && !bgm.paused;
      if (bgm) bgm.pause();
      if (Game.state) Game.save(0);
      const bridge = window.AndroidAppBridge;
      if (bridge?.isAndroid) bridge.flush().catch(error => console.error("Android background save flush failed:", error));
      return;
    }
    if (this._resumeBgmAfterBackground && bgm) {
      this._resumeBgmAfterBackground = false;
      bgm.play().then(() => { bgmBtn.textContent = "♪"; }).catch(() => { bgmBtn.textContent = "♪̶"; });
    }
  },
  handleBackButton() {
    const start = document.getElementById("start-screen");
    const game = document.getElementById("game-screen");
    const form = document.getElementById("new-game-form");
    const modalMask = document.getElementById("modal-mask");
    if (modalMask && !modalMask.classList.contains("hidden")) {
      if (this._confirmCb) {
        this._confirmCb = null;
        this.closeModal();
        return;
      }
      const pending = this._pendingWorld || this._pendingAdv || this._pendingEvent ||
        Game.state?.disciples?.some(d => d.tribulation);
      if (pending) return this.confirm("暂时返回开始界面？未处理事件会保存在自动存档中，继续修行时可接着处理。", () => this.showStartScreen());
      this.closeModal();
      return;
    }
    if (start && !start.classList.contains("hidden")) {
      if (form && !form.classList.contains("hidden")) return this.cancelNewGame();
      return this.confirm("确定退出宗门长青录？", () => window.AndroidAppBridge?.exit().catch(() => this.toast("存档仍未写入完成，请重试退出")));
    }
    if (game && !game.classList.contains("hidden") && this.currentView !== "overview") {
      return this.switchView("overview");
    }
    if (Game.state && this.currentView === "overview") {
      return this.confirm("返回开始界面并保存当前进度？", () => this.showStartScreen());
    }
    return this.confirm("确定退出宗门长青录？", () => window.AndroidAppBridge?.exit().catch(() => this.toast("存档仍未写入完成，请重试退出")));
  },
  refreshStartMenu() {
    const save = Game.saveInfo(0);
    this._hasAutoSave = !!save;
    document.getElementById("btn-continue").disabled = !Game.state && !save;
    document.getElementById("btn-continue").textContent = Game.state ? "继续本次修行" : "继续上次修行";
    document.getElementById("start-save-info").textContent = save
      ? `${save.sectName} · 太元${save.year}年${save.month}月 · 第${save.gen}代掌门`
      : "太元年间，山门初立。";
  },

  showStartScreen() {
    this.closeModal();
    const saved = !Game.state || Game.save(0);
    this.refreshStartMenu();
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("start-actions").classList.remove("hidden");
    document.getElementById("new-game-form").classList.add("hidden");
    if (saved && window.AndroidAppBridge?.isAndroid) {
      window.AndroidAppBridge.flush().catch(() => this.toast("自动存档写入失败，请稍后重试或检查设备剩余空间"));
    }
    if (!saved) this.toast("当前进度保留在本次运行中，但自动存档失败；请继续游戏后手动存档");
  },
  continueGame() {
    if (!Game.state && !Game.load(0)) return this.toast("自动存档不存在或已损坏");
    this.enterGame();
  },
  showNewGameForm() {
    if (this._hasAutoSave || Game.state) {
      return this.confirm("开启新周目会覆盖自动存档，是否继续？", () => this._showNewGameForm(), true);
    }
    this._showNewGameForm();
  },
  _showNewGameForm() {
    document.getElementById("start-actions").classList.add("hidden");
    document.getElementById("new-game-form").classList.remove("hidden");
    document.getElementById("new-game-error").textContent = "";
  },
  cancelNewGame() {
    document.getElementById("new-game-form").classList.add("hidden");
    document.getElementById("start-actions").classList.remove("hidden");
  },
  startNewGame() {
    const result = Game.newGame({
      name: document.getElementById("leader-name").value,
      gender: document.getElementById("leader-gender").value,
      sectName: document.getElementById("new-sect-name").value
    });
    if (result.err) {
      document.getElementById("new-game-error").textContent = result.err;
      return;
    }
    const saved = Game.save(0);
    this.enterGame();
    if (!saved) this.toast("新周目已开始，但自动存档失败，请手动存档");
  },
  enterGame() {
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    this.switchView("overview");
    this.render();
    this._drainQueue();
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
      `<span class="res-item"><img class="res-icon" src="assets/icon/icon_res_${k}.png" alt="" onerror="this.style.display='none'"><span class="res-name">${r.name}</span><span class="res-val">${s.resources[k] || 0}</span></span>`
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

  // 音效（v1.1.0 新增音效位于 assets/audio/，旧音效仍在 assets/ 根目录）
  sfx(name) {
    try {
      const EXTRA = {
        click: "assets/audio/sfx_click.mp3",
        month: "assets/audio/sfx_month.mp3",
        realm_up: "assets/audio/sfx_realm_up.mp3",
        trade: "assets/audio/sfx_trade.mp3",
        fail_soft: "assets/audio/sfx_fail_soft.mp3",
      };
      const a = new Audio(EXTRA[name] || `assets/sfx_${name}.mp3`);
      a.volume = 0.6;
      a.play().catch(() => {});
    } catch (e) {}
  },
  // 弟子头像：按性别+id 稳定取图（v1.1.0 扩至 4 变体；1-2 在根目录，3-4 在 avatar/ 子目录）
  avatar(d, cls) {
    return `<img class="avatar ${cls || ""}" src="${this.avatarPath(d)}" alt="">`;
  },
  // 弟子头像路径（供招募结果等直接取地址）
  avatarPath(d) {
    const id = d.avatarId || ((d.gender === "男" ? "m" : "f") + ((d.id % 4) + 1));
    const file = id === "m4_legacy" ? "avatar_m4_legacy" : `avatar_${id}`;
    return ["m1", "m2", "f1", "f2"].includes(id) ? `assets/${file}.png` : `assets/avatar/${file}.png`;
  },
  // NPC 宗主头像映射（按宗门气质对应立绘）
  npcPortrait(secId) {
    const map = { tieyang: "portrait_npc_tieyang", hanjian: "portrait_npc_xuanjian", baihua: "portrait_npc_biluo", qingzhu: "portrait_npc_qingzhu" };
    return map[secId] ? `assets/portrait/${map[secId]}.png` : null;
  },
  // 长老立绘映射（按职业领域）
  elderPortrait(cls) {
    const map = { dan: "portrait_role_alchemist", qi: "portrait_role_forge", fu: "portrait_role_forge",
      law: "portrait_role_discipline", envoy: "portrait_role_scholar", preach: "portrait_role_scholar" };
    return map[cls] ? `assets/portrait/${map[cls]}.png` : null;
  },
  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  },
  eventOptionDescription(option) {
    const ef = option.effect || {};
    const risk = ["expedition", "beastFight", "advGamble", "justiceFight", "beastDuel", "worldWar", "tianmoWar"].some(key => ef[key]);
    return `${option.desc || ""}${risk ? `（战损时另有 ${Math.round(COMBAT_FATALITY_CHANCE * 100)}% 概率陨落）` : ""}`;
  },
  // 事件插画映射（按事件 id 归类）
  eventIll(evId) {
    const map = {
      xieyue: "ill_event_wounded", lingmai: "ill_event_vein", xinmo: "ill_event_heart_demon",
      shangdui: "ill_trade_r1", sidu: "ill_event_duel", mijing: "ill_event_ruins",
      laifang: "ill_event_guest", dunwu: "ill_event_insight", zhalu: "ill_event_furnace",
      tianjiao: "ill_event_genius", shouchao: "ill_event_beast", qiushi: "ill_adventure_town",
      adv_herb: "ill_adventure_lingchuan", adv_beggar: "ill_adventure_beggar",
      adv_duel: "ill_event_duel", adv_legacy: "ill_event_ruins", adv_beast: "ill_event_beast",
      adv_romance: "ill_adventure_romance", modao_invasion: "ill_event_beast",
      ancient_mijing: "ill_event_ruins", tide: "ill_world_tianmo", tianmo: "ill_world_tianmo"
    };
    return map[evId] ? `assets/ill/${map[evId]}.png` : null;
  },
  worldEventIll(evId) {
    return ({
      modao_invasion: "assets/bg_war.png",
      ancient_mijing: "assets/ill/ill_event_ruins.png",
      tide: "assets/bg_spirit.png",
      tianmo: "assets/ill/ill_world_tianmo.png"
    })[evId] || null;
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
      ${s.gameOver ? `<div class="panel"><h3 style="color:#d05a4e">宗门覆灭</h3><p>道统已断。可在弟子页查阅人物留档，或点击顶部「主菜单」开创新宗门，也可「读档」继续往昔进度。</p></div>` : ""}
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
        <td title="${spiritRootInfo(d.root).grade} · 修炼×${spiritRootInfo(d.root).speed}">${spiritRootInfo(d.root).name}</td>
        <td>${CLASSES[d.cls].name}</td>
        <td><div class="bar exp"><div style="width:${pct}%"></div></div></td>
        <td>${Game.disciplePower(d)}</td>
        <td>${d.loyalty}</td>
        <td>${Math.floor(d.lifespanLeft)}年</td>
        <td>${d.tribulation ? "渡劫中" : d.inBranch ? "分宗驻守" : Game.escorting(d) ? "商队护送" : d.adventure ? "历练中" : (jobName ? BUILDINGS[jobName[0]].name : "空闲")}</td>
        <td><label class="auto-participation"><input type="checkbox" aria-label="${d.name}参与自动突破" ${d.autoBreakthrough ? "checked" : ""} onchange="UI.setDiscipleAuto(${d.id},this.checked)">参与</label></td>
        <td>
          ${ready && !Game.canBreakthrough(d).err ? `<button class="btn small primary" onclick="UI.showBreakthrough(${d.id})">突破</button>` : ""}
          ${d.realm === 7 && d.stage === 3 && d.exp >= stageExpNeed(7, 3) ? `<button class="btn small danger" onclick="UI.showDujie(${d.id})">${d.tribulation ? "继续渡劫" : "渡劫"}</button>` : ""}
          <button class="btn small" onclick="UI.showDiscipleDetail(${d.id})">详情</button>
        </td>
      </tr>`;
    }).join("");
    const archive = Game.state.disciples.filter(d => !d.alive)
      .sort((a, b) => ((b.exitTime?.year || 0) * 12 + (b.exitTime?.month || 0)) - ((a.exitTime?.year || 0) * 12 + (a.exitTime?.month || 0)) || b.id - a.id)
      .map(d => `<tr><td>${this.escapeHtml(d.name)}</td><td>${Game.discipleStatus(d)}</td>
        <td>${REALMS[d.realm].name}${STAGES[d.stage]}</td><td>${Math.floor(d.age)} 岁</td>
        <td>${this.escapeHtml(d.exitReason || "旧存档未记录离宗原因")}</td>
        <td><button class="btn small" onclick="UI.showDiscipleDetail(${d.id})">生平</button></td></tr>`).join("");
    const cfg = Game.state.autoBreakthrough;
    el.innerHTML = `<div class="panel"><h3>自动突破</h3>
      <div class="auto-controls">
        <label>策略 <select id="auto-bt-strategy" onchange="UI.updateAutoBreakthrough()">${Object.entries(AUTO_BREAKTHROUGH).map(([id, x]) => `<option value="${id}" ${cfg.strategy === id ? "selected" : ""}>${x.name}</option>`).join("")}</select></label>
        <label>每人丹药 <select id="auto-bt-pills" ${cfg.strategy === "direct" ? "disabled" : ""} onchange="UI.updateAutoBreakthrough()">${[1,2,3].map(n => `<option value="${n}" ${cfg.pills === n ? "selected" : ""}>${n} 颗</option>`).join("")}</select></label>
        <label><input id="auto-bt-monthly" type="checkbox" ${cfg.monthly ? "checked" : ""} onchange="UI.updateAutoBreakthrough()">每月修炼后自动执行</label>
        <button class="btn primary" id="btn-auto-breakthrough" onclick="UI.confirmAutoBreakthrough()">一键自动突破</button>
      </div>
      <p class="scroll-hint">${AUTO_BREAKTHROUGH[cfg.strategy].desc}。按弟子编号依次分配丹药；每人每轮至多突破一次，不自动请护法，不含九霄雷劫。</p>
      <p class="scroll-hint">仅处理勾选且修为已满的健康驻守弟子，失败仍可能掉境、重伤、伤根或陨落。开启每月执行后，等丹者会在后续月结重试。</p>
      </div><div class="panel"><h3>弟子名录（${list.length}/${Game.capacity()}）</h3>
      <div class="table-scroll"><table><thead><tr>
        <th>姓名</th><th>境界</th><th>灵根</th><th>职业</th><th>修为</th>
        <th>战力</th><th>忠诚</th><th>寿元</th><th>岗位</th><th>自动突破</th><th>操作</th>
      </tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="panel"><h3>人物留档（${Game.state.disciples.length - list.length}）</h3>
        <p class="scroll-hint">陨落者、逐出者及其他离宗人物保留最后境界、离宗原因与已记录生平；离宗后不再参与修炼、战斗、岗位及宗门加成。</p>
        <div class="table-scroll"><table><thead><tr><th>姓名</th><th>状态</th><th>最后境界</th><th>年龄</th><th>离宗记录</th><th>查看</th></tr></thead>
        <tbody>${archive || `<tr><td colspan="6">暂无人物留档</td></tr>`}</tbody></table></div>
      </div>`;
  },
  updateAutoBreakthrough() {
    const r = Game.setAutoBreakthrough({ strategy: document.getElementById("auto-bt-strategy").value,
      pills: Number(document.getElementById("auto-bt-pills").value), monthly: document.getElementById("auto-bt-monthly").checked });
    if (r.err) return this.toast(r.err);
    this.renderDisciples();
    if (!Game.save(0)) this.toast("自动突破设置已应用，但自动保存失败，请手动存档");
  },
  setDiscipleAuto(id, enabled) {
    const r = Game.setDiscipleAutoBreakthrough(id, enabled);
    if (r.err) return this.toast(r.err);
    if (!Game.save(0)) this.toast("弟子设置已应用，但自动保存失败，请手动存档");
  },
  showExpel(id) {
    const d = Game.state.disciples.find(x => x.id === id && x.alive);
    if (!d) return;
    this.confirm(`确定将 ${d.name} 逐出山门？其修为与生平会永久留档，但将立即失去宗门身份、岗位、供奉和战斗身份；此操作不可撤销。`, () => {
      const result = Game.expelDisciple(id);
      if (result.err) return this.toast(result.err);
      this.render();
      this.modal(`<h2>已逐出山门</h2><div class="modal-text">${this.escapeHtml(d.name)} 已离宗，状态记为“逐出山门”。人物留档仍可在弟子页查看，之后不会继续修炼或参与宗门事务。${result.saved ? "" : "\n自动保存失败，请手动存档。"}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal()">知道了</button></div>`);
    }, true);
  },
  confirmAutoBreakthrough() {
    const err = Game.autoBreakthroughError();
    if (err) return this.toast(err);
    const cfg = Game.state.autoBreakthrough;
    this.confirm(`为勾选的弟子执行一轮自动突破？\n策略：${AUTO_BREAKTHROUGH[cfg.strategy].name}；每人最多 ${cfg.strategy === "direct" ? 0 : cfg.pills} 颗丹药。\n失败风险与手动突破相同，可能陨落。`, () => {
      const r = Game.runAutoBreakthrough();
      if (r.err) return this.toast(r.err);
      const saved = Game.save(0);
      this.render();
      this.modal(`<h2>自动突破结果</h2><div class="modal-text">尝试 ${r.attempted} 人，成功 ${r.succeeded} 人，失败 ${r.failed} 人，等丹 ${r.waiting} 人，跳过 ${r.skipped} 人；耗丹 ${r.pillsUsed} 颗。\n${r.results.join("\n") || "暂无符合条件的弟子。"}${saved ? "" : "\n⚠ 自动保存失败，请手动存档。"}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal()">知道了</button></div>`);
    }, true);
  },

  showDiscipleDetail(id) {
    const d = Game.state.disciples.find(x => x.id === id);
    if (!d) return;
    const archived = !d.alive;
    const timeline = (d.biography || []).slice().reverse().map(entry =>
      `<li><span>${this.escapeHtml(entry.date)}</span> · ${entry.age} 岁 · ${REALMS[entry.realm].name}${STAGES[entry.stage]} · ${this.escapeHtml(entry.text)}</li>`).join("");
    const details = [
      `性别：${d.gender}　${archived ? "离宗时年龄" : "年龄"}：${Math.floor(d.age)}　${d.status === "deceased" ? "寿元已终止" : `剩余寿元：${Math.floor(d.lifespanLeft)} 年`}`,
      `状态：${Game.discipleStatus(d)}`,
      archived ? `离宗时间：${d.exitTime ? `太元${d.exitTime.year}年${d.exitTime.month}月` : "旧档未记录"}\n离宗记录：${this.escapeHtml(d.exitReason || "旧存档未记录离宗原因")}` : "",
      `境界：${REALMS[d.realm].name}${STAGES[d.stage]}`,
      `灵根：${spiritRootInfo(d.root).name}（${spiritRootInfo(d.root).grade}，${spiritRootInfo(d.root).count} 属性，修炼×${spiritRootInfo(d.root).speed}）`,
      archived ? "离宗后修为与状态冻结，不再参与宗门事务。" : `自动突破：${d.autoBreakthrough ? "参与（可在弟子名录取消勾选）" : "不参与"}`,
      `职业：${CLASSES[d.cls].name}（${CLASSES[d.cls].cat}类 - ${CLASSES[d.cls].desc}）`,
      `心性：${d.personality}　气运：${d.luck}　悟性：${d.comprehension}`,
      `忠诚度：${d.loyalty}　${archived ? `离宗前战力：${d.finalPower ?? "旧档未记录"}` : `综合战力：${Game.disciplePower(d)}`}`,
      archived ? "" : `每月修为增长：${Game.cultivationGain(d).toFixed(2)}（空闲正常修炼，生产岗位半速兼修）`,
      d.injuredMonths > 0 ? archived ? `离宗时伤势：重伤（原需休养 ${d.injuredMonths} 个月）` : `⚠ 重伤中，还需 ${d.injuredMonths} 个月恢复` : "",
      d.foundationDmg ? "⚠ 根基受损：修炼速度永久 -20%" : ""
    ].filter(Boolean).join("\n");
    this.modal(`
      <h2>${this.escapeHtml(d.name)} ${d.isLeader ? "（掌门）" : ""}</h2>
      <span class="avatar-wrap big">${this.avatar(d, "big")}${archived ? "" : `<span class="sprite sprite-aura"></span>`}</span>
      <div class="modal-text">${details}</div>
      <h3>生平记录</h3><ol class="disciple-timeline">${timeline || "<li>暂无生平记录</li>"}</ol>
      <div class="modal-footer">${!archived && !d.isLeader ? `<button class="btn danger" onclick="UI.closeModal();UI.showExpel(${d.id})">逐出山门</button>` : ""}<button class="btn" onclick="UI.closeModal()">关闭</button></div>`);
  },

  // ---------- 突破 ----------
  showBreakthrough(id) {
    const s = Game.state;
    const d = s.disciples.find(x => x.id === id);
    const check = Game.canBreakthrough(d);
    if (check.err) return this.toast(check.err);
    const info = Game.breakthroughInfo(d);
    const render = () => {
      const { pills, guardians } = this._btState;
      const rate = Game.breakthroughRate(d, pills, guardians.length);
      const elder = Game.aliveDisciples().filter(x => Game.canGuard(d, x, d.realm + 1));
      this.modal(`
        <h2>${info.isMajor ? "大境界突破" : "小阶突破"} —— ${d.name}</h2>
        <div class="modal-text">
当前：${REALMS[d.realm].name}${STAGES[d.stage]} → ${info.isMajor ? `【${REALMS[Math.min(d.realm + 1, REALMS.length - 1)].name}期】` : STAGES[d.stage + 1]}
基础成功率：${Math.round(info.base * 100)}%
服用丹药：${pills} 颗（每颗 +8%，库存 ${s.resources.danyao}）
护法修士：${guardians.length} 名（每名 +5%）
气运加成：${d.luck > 50 ? "+" : ""}${Math.round((d.luck - 50) / 5)}%
<b style="color:var(--gold)">当前成功率：${Math.round(rate * 100)}%</b>
失败惩罚：掉境 40% / 重伤 35% / 根基受损 20% / 陨落 5%
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
    if (!this._btState) return;
    const { pills, guardians } = this._btState;
    const r = Game.tryBreakthrough(id, pills, guardians);
    if (r.err) return this.toast(r.err);
    this._btState = null;
    this.sfx(r.ok ? "breakthrough_success" : "breakthrough_fail");
    if (r.ok) this.sfx("realm_up");
    const d = Game.state.disciples.find(x => x.id === id);
    this.modal(`
      ${r.ok ? `<img class="modal-ill modal-ill-landscape" src="assets/ill/ill_breakthrough.png" alt="">
      <div class="sprite sprite-breakthrough"></div>` : ""}
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
      const idle = Game.aliveDisciples().filter(d => Game.available(d) && !Game.hasJob(d));
      return `<div class="panel">
        <h3><img class="b-icon" src="assets/icon/icon_building_${id}.png" alt="" onerror="this.style.display='none'">${b.name} <span style="color:var(--text-dim);font-size:0.8125rem">Lv.${lv}/${b.maxLv}</span></h3>
        <p style="color:var(--text-dim);margin-bottom:8px">${b.desc}</p>
        <p>效果：<span style="color:var(--jade)">${b.effect(Math.max(1, lv))}</span></p>
        ${b.jobs > 0 && b.jobs < 99 ? `<p>岗位：${workers.length}/${b.jobs}
          ${workers.map(d => `<span class="tag">${d.name}<a href="javascript:;" onclick="UI.unassign('${id}',${d.id})" style="color:#d05a4e;text-decoration:none"> ✕</a></span>`).join("")}
        </p>` : ""}
        ${id === "yanwu" ? `<p>修炼中：${workers.map(d => `<span class="tag">${d.name}<a href="javascript:;" onclick="UI.unassign('${id}',${d.id})" style="color:#d05a4e;text-decoration:none"> ✕</a></span>`).join("") || "无"}</p>` : ""}
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn small" ${lv >= b.maxLv ? "disabled" : ""} onclick="UI.confirmUpgrade('${id}')">升级（${costText}）</button>
          ${lv > 0 && b.jobs > 0 && workers.length < b.jobs && idle.length ? `<select id="assign-sel-${id}" style="background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              ${idle.map(d => `<option value="${d.id}">${d.name}（${CLASSES[d.cls].name}）</option>`).join("")}
            </select>
            <button class="btn small" onclick="UI.assign('${id}')">派驻</button>` : ""}
        </div>
      </div>`;
    }).join("");
    el.innerHTML = `<div class="grid cols-2">${cards}</div>
      <p class="scroll-hint">产业须派驻健康在宗弟子方有产出：职业匹配效率×1.5，不匹配×0.6。空闲弟子正常修炼，生产岗位半速兼修；演武场提供额外修炼加成，最多99人。</p>`;
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
      const npcImg = this.npcPortrait(sec.id);
      return `<div class="panel">
        <div class="npc-head">
          ${npcImg ? `<img src="${npcImg}" alt="" onerror="this.style.display='none'">` : ""}
          <h3 style="border:none;margin:0;padding:0">${sec.name} <span class="tag ${rel.cls}">${sec.atWar ? "交战中" : rel.name}</span>
          ${sec.allied ? `<span class="tag gold">同盟</span>` : ""}${sec.trade ? `<span class="tag green">通商</span>` : ""}
          ${sec.vassal ? `<span class="tag gold">附庸·忠诚${sec.loyalty}</span>` : ""}</h3>
        </div>
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
          <button class="btn small" ${al.lastCouncilMonth === Game.monthKey() ? "disabled" : ""} onclick="UI.openCouncil()">召开议事（每月一次）</button>
          <button class="btn small danger" ${al.raidCd > 0 ? "disabled" : ""} onclick="UI.doRaid()">讨伐魔道${al.raidCd > 0 ? `（冷却${al.raidCd}月）` : ""}</button>
        </div>
        <p class="scroll-hint">讨伐魔道：我方总战力 + 盟员半数战力 vs 魔道（逐年变强，当前约 ${ALLIANCE_CFG.modaoBase + s.year * 30}）。</p>`
      : `<p style="color:var(--text-dim)">声望≥${ALLIANCE_CFG.needRep}（当前 ${s.reputation}）且有 ${ALLIANCE_CFG.needAllies} 家同盟（当前 ${allyCount} 家）可牵头组建联盟。</p>
         <button class="btn primary" onclick="UI.formAlliance()">组建联盟</button>`}
    </div>`;
    el.innerHTML = `<div class="grid cols-2">${cards}</div>${alliancePanel}
      <p class="scroll-hint">我方总战力：${Game.sectPower()}。关系≤${WAR_CONFIG.assaultNeedRel} 可发动宗门攻防战。每个宗门每月只能交战一次，宣战与攻打山门共用次数；讲学每宗每月一次。</p>`;
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
    this.confirm(`发动联盟讨伐魔道？胜则缴获丰厚、声望大涨；败则弟子重伤、联盟威望受损。\n战损弟子另有 ${Math.round(COMBAT_FATALITY_CHANCE * 100)}% 概率陨落，生平将保留。`, () => {
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
    const s = Game.state;
    const sec = s.sects.find(x => x.id === sectId);
    const err = Game.warError(sec);
    if (err) return this.toast(err);
    this.warBgm();
    const formation = { front: [], mid: [], back: [] };
    const tactic = "frontal";
    const available = Game.aliveDisciples().filter(d => Game.available(d));
    const render = () => {
      const { tactic } = this._warState;
      const inFormation = new Set([...formation.front, ...formation.mid, ...formation.back]);
      const pool = available.filter(d => !inFormation.has(d.id));
      const atk = Game.calcAssaultPower(formation);
      const def = Math.round(sec.power * (1 + WAR_CONFIG.defenseArrayBonus));
      this.modal(`
        <h2>⚔ 攻打【${sec.name}】山门</h2>
        <div class="modal-text">守方战力（含护山大阵 +${Math.round(WAR_CONFIG.defenseArrayBonus * 100)}%）：<b style="color:#d05a4e">${def}</b>
我方出战战力：<b style="color:var(--gold)">${atk}</b>（职业与排位匹配有加成）
战败或守方强于我方时，战损弟子有 ${Math.round(COMBAT_FATALITY_CHANCE * 100)}% 概率陨落；其余照常重伤。陨落后保留生平。</div>
        <div class="war-formation">
          ${["front", "mid", "back"].map(row => `<div class="war-row">
            <h4>${{ front: "前排（体修×1.4）", mid: "中排（剑修×1.3）", back: "后排（阵修×1.4）" }[row]}</h4>
            ${formation[row].map(id => {
              const d = s.disciples.find(x => x.id === id);
              return `<span class="tag jade" title="点击移出" onclick="UI._warRemove('${sectId}','${row}',${id})">${d.name} ✕</span>`;
            }).join("") || "<span style='color:var(--text-dim)'>空缺</span>"}
          </div>`).join("")}
        </div>
        <div class="modal-text">可派遣弟子（点击加入 前/中/后排）：</div>
        <div>${pool.map(d => `<div class="war-candidate"><span class="tag">${d.name}（${CLASSES[d.cls].name}·战力${Game.disciplePower(d)}）</span>${["front", "mid", "back"].map(row => `<button class="btn small" onclick="UI._warAdd('${sectId}','${row}',${d.id})">${{front:"前",mid:"中",back:"后"}[row]}</button>`).join("")}</div>`).join("") || "无人可派"}</div>
        <div class="divider-img" aria-hidden="true"></div>
        <div class="modal-text">战术选择：</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${Object.entries(TACTICS).map(([id, t]) => `<button class="btn small tactic-btn ${tactic === id ? "primary" : ""}"
            title="${t.desc}" onclick="UI._warTactic('${sectId}','${id}')">${t.name}</button>`).join("")}
        </div>
        <div class="modal-text" style="font-size:0.75rem;color:var(--text-dim)">${TACTICS[tactic].desc}</div>
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
    if (Object.values(f).some(ids => ids.includes(dId))) return;
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
    if (!this._warState) return;
    const { formation, tactic } = this._warState;
    const r = Game.startAssault(sectId, formation, tactic);
    if (r.err) return this.toast(r.err);
    this._warState = null;
    Game.autosave();
    this.sfx("battle_result");
    if (r.win && r.needPostWar) {
      this._showPostWar(sectId, r.msg);
    } else {
      this.modal(`<div class="sprite sprite-sword-clash"></div><h2>${Game.state.gameOver ? "道统断绝……" : "败北……"}</h2><div class="modal-text">${r.msg}</div>
        <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render()">收兵回山</button></div>`);
      document.getElementById("modal").classList.add("war-result");
    }
  },
  _showPostWar(sectId, msg) {
      this.modal(`<div class="sprite sprite-sword-clash"></div><h2>大捷！</h2><div class="modal-text">${msg}</div>
        <div class="modal-options">
          <button class="btn opt-btn danger" onclick="UI._postWar('${sectId}','destroy')">灭门掠夺<span class="opt-desc">掠其库藏、概率俘虏弟子；声望大跌，各宗警惕</span></button>
          <button class="btn opt-btn" onclick="UI._postWar('${sectId}','vassal')">收为附庸<span class="opt-desc">保留其建制，年年岁贡；需维护忠诚度防反叛</span></button>
          <button class="btn opt-btn" onclick="UI._postWar('${sectId}','merge')">合并入宗<span class="opt-desc">其弟子并入我宗，携「异心」debuff，需时间消化</span></button>
        </div>`);
      document.getElementById("modal").classList.add("war-result");
  },
  _postWar(sectId, choice) {
    const r = Game.postWar(sectId, choice);
    if (r.err) return this.toast(r.err);
    Game.autosave();
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
          ${elders.map(d => {
            const ep = this.elderPortrait(d.cls);
            return `<div class="elder-row">${this.avatar(d)}<span class="elder-name">${d.name} —— ${ELDER.domainName[ELDER.seatDomain[d.cls]]} +${Math.round(ELDER.bonusPerSeat * 100)}%</span>
            ${ep ? `<img class="elder-role" src="${ep}" alt="${CLASSES[d.cls].name}职业示意" title="${CLASSES[d.cls].name}职业示意" onerror="this.style.display='none'">` : ""}
            <button class="btn small" onclick="UI.dismissElder(${d.id})">罢免</button></div>`;
          }).join("") || "<p style='color:var(--text-dim)'>虚位以待。</p>"}
          ${candidates.length ? `<hr style="border-color:var(--border);margin:8px 0">
            <p style="color:var(--text-dim)">可任命（需${REALMS[ELDER.needRealm].name}期以上）：</p>
            ${candidates.map(d => `<p>${d.name}（${REALMS[d.realm].name}·${CLASSES[d.cls].name}）
              <button class="btn small primary" onclick="UI.appointElder(${d.id})">任命长老</button></p>`).join("")}` : ""}
        </div>
        <div class="panel">
          <h3>客卿挂单</h3>
          <p style="color:var(--text-dim)">${KEQING.desc}</p>
          ${keqings.map(d => `<p>${d.name}（${REALMS[d.realm].name}期·月俸${KEQING.salaryBase[d.realm] ?? 10}灵石·忠诚${d.loyalty}）</p>`).join("") || "<p style='color:var(--text-dim)'>暂无客卿。</p>"}
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
    this.dujieBgm();
    let pills = d.tribulation ? d.tribulation.pills : 0;
    let guardians = d.tribulation ? d.tribulation.guardians.slice() : [];
    let wave = d.tribulation ? d.tribulation.wave : 0, done = false;
    const render = () => {
      const rate = Game.dujieWaveRate(pills, guardians.length);
      const elders = Game.aliveDisciples().filter(x => Game.canGuard(d, x, 6));
      const wavesHtml = Array.from({ length: DUJIE.waves }, (_, i) => {
        const n = i + 1;
        const result = this._dujieResult[i];
        const cls = result === 1 ? "pass" : result === -1 ? "fail" : (n === wave + 1 && !done ? "now" : "");
        return `<div class="dujie-wave ${cls || ""}">${n}</div>`;
      }).join("");
      this.modal(`
        ${done && this._dujieFinal && this._dujieFinal.success ? `<img class="modal-ill modal-ill-landscape" src="assets/ill/ill_ascend.png" alt="">` : ""}
        <h2>⚡ 九霄雷劫 —— ${d.name}</h2>
        <div class="modal-text">${done ? "" : `渡劫准备：渡劫丹 ${pills}/${Math.min(DUJIE.maxPill, s.resources.danyao)}（每颗 +2%）　护法 ${guardians.length}/${Math.min(DUJIE.maxGuardian, elders.length)} 名（每名 +1.5%）
底蕴加成 +${Math.round((s.heritage || 0) * DUJIE.heritageWaveBonus * 100)}%　气运加成 +${Math.round(Game.qiyunBonus() * 100)}%
<b style="color:var(--gold)">每道天雷成功率：${Math.round(rate * 100)}%</b>（九雷全过则飞升，失败：重伤掉境 50% / 道基崩损 30% / 形神俱灭 20%）`}</div>
        <div class="dujie-waves">${wavesHtml}</div>
        ${wave > 0 && !done ? `<div class="dujie-effect"><div class="sprite sprite-dujie-bolt"></div></div>` : ""}
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
    this._dujieResult = Array(wave).fill(1);
    this._dujieFinal = null;
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
    if (!st || this._dujieFinal) return;
    const nextWave = st.wave + 1;
    this.sfx("dujie");
    const r = Game.dujieWave(st.dId, nextWave, st.pills, st.guardians);
    if (r.err) return this.toast(r.err);
    this._dujieResult[nextWave - 1] = r.passed ? 1 : -1;
    st.nextWave();
    if (r.finished) {
      st.setDone();
      this._dujieFinal = r;
      Game.autosave();
      if (r.success) this.sfx("realm_up");
    }
    st.render();
    this.toast2(r.msg, r.finished);
  },
  // 渡劫专属 BGM（与战争 BGM 同理，关弹窗时复位）
  dujieBgm() {
    const bgm = document.getElementById("bgm");
    if (bgm && !bgm.dataset.dujieMode) { bgm.dataset.dujieMode = "1"; bgm.src = "assets/audio/bgm_dujie.mp3"; bgm.play().catch(() => {}); }
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
      const can = Game.aliveDisciples().filter(d => d.realm >= SPIRIT_BRANCH.minRealm && !d.isLeader && Game.available(d));
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
        <p class="scroll-hint">关系 &lt;-30 的灵界势力可能袭扰分宗；关系 ≥20 可进行跨界贸易，每宗每月一次。</p>
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
    const idle = Game.aliveDisciples().filter(d => Game.available(d) && !Game.hasJob(d));
    el.innerHTML = `
      ${active ? `<div class="panel"><h3>商队在外</h3>
        <p>路线：${TRADE_ROUTES.find(r => r.id === active.routeId).name}｜货物：${TRADE_GOODS[active.goodsId].name}×${active.amount}｜归期：${active.monthsLeft} 个月</p></div>` : ""}
      <div class="grid cols-3">
        ${TRADE_ROUTES.map((r, i) => `<div class="panel">
          <img class="card-ill" src="${({county:"assets/ill/ill_trade_r1.png",state:"assets/ill/ill_trade_state.png",border:"assets/ill/ill_trade_border.png"})[r.id]}" alt="" onerror="this.style.display='none'">
          <h3>${r.name}</h3>
          <p style="color:var(--text-dim)">${r.desc}</p>
          <p>单程 ${r.months} 个月｜基础利润 ${r.profit}｜遇劫风险 <span style="color:${r.risk > 0.3 ? "#d05a4e" : "var(--gold)"}">${Math.round(r.risk * 100)}%</span></p>
          <p>可贩商品：${r.goods.map(g => TRADE_GOODS[g].name).join("、")}</p>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
            <select id="trade-goods-${r.id}" style="background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              ${r.goods.map(g => `<option value="${g}">${TRADE_GOODS[g].name}（采购价${TRADE_GOODS[g].unitCost}灵石）</option>`).join("")}
            </select>
            <select id="trade-escort-${r.id}" style="background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              <option value="">无护送（风险高）</option>
              ${idle.map(d => `<option value="${d.id}">护送：${d.name}（战力${Game.disciplePower(d)}）</option>`).join("")}
            </select>
            <button class="btn primary" ${active ? "disabled" : ""} onclick="UI.dispatch('${r.id}')">派出商队（货10单位）</button>
          </div>
        </div>`).join("")}
      </div>
      <p class="scroll-hint">商队以灵石采购货物，货款 = 单价 × 数量；成功归来返还货款并获得利润，被劫则损失货款且护送弟子重伤。护送期间暂停修炼与任职。同时仅能有一支商队在外。</p>`;
  },
  dispatch(routeId) {
    const goods = document.getElementById("trade-goods-" + routeId).value;
    const esc = document.getElementById("trade-escort-" + routeId).value;
    this.confirm(`确认派出商队走【${TRADE_ROUTES.find(r => r.id === routeId).name}】？\n货款将立即扣除，归期结算盈亏。`, () => {
      const r = Game.dispatchCaravan(routeId, goods, 10, esc ? Number(esc) : null);
      if (r.err) { this.sfx("fail_soft"); this.toast(r.err); }
      else this.sfx("trade");
      this.render();
    });
  },

  // ---------- 外出历练 ----------
  renderAdventure() {
    const s = Game.state;
    const el = document.getElementById("view-adventure");
    const out = Game.aliveDisciples().filter(d => d.adventure);
    const can = Game.aliveDisciples().filter(d => Game.available(d) && !Game.hasJob(d));
    el.innerHTML = `
      ${out.length ? `<div class="panel"><h3>历练在外</h3>
        ${out.map(d => `<p>${this.avatar(d)}${d.name} —— ${ADVENTURE_PLACES.find(p => p.id === d.adventure.placeId).name}，${d.adventure.monthsLeft} 个月后归来</p>`).join("")}</div>` : ""}
      <div class="grid cols-3">
        ${ADVENTURE_PLACES.map(p => {
          const advIll = { wild: "assets/ill/ill_adventure_lingchuan.png", town: "assets/ill/ill_adventure_town.png", ruins: "assets/ill/ill_adventure_ruins.png" }[p.id];
          return `<div class="panel">
          <img class="card-ill" src="${advIll}" alt="" onerror="this.style.display='none'">
          <h3>${p.name}</h3>
          <p style="color:var(--text-dim)">${p.desc}</p>
          <p>历时 ${p.months} 个月｜危险度 <span style="color:${p.danger > 0.3 ? "#d05a4e" : "var(--gold)"}">${Math.round(p.danger * 100)}%</span></p>
          <div style="display:flex;gap:6px;margin-top:8px">
            <select id="adv-sel-${p.id}" style="flex:1;background:var(--panel-light);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px">
              ${can.map(d => `<option value="${d.id}">${d.name}（${REALMS[d.realm].name}·战力${Game.disciplePower(d)}）</option>`).join("")}
            </select>
            <button class="btn primary" ${can.length ? "" : "disabled"} onclick="UI.sendAdv('${p.id}')">派遣</button>
          </div>
        </div>`;}).join("")}
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
    this.confirm(`对【${sec.name}】执行【${act.name}】？\n${act.desc}${danger ? `\n\n⚠ 宣战不可逆；战败时战损弟子有 ${Math.round(COMBAT_FATALITY_CHANCE * 100)}% 概率陨落，生平保留。` : ""}`, () => {
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
    const profile = Game.recruitmentProfile();
    el.innerHTML = `<div class="panel"><h3>招贤资质</h3>
      <p>宗门战力 ${Math.round(profile.power)} · 声望 ${s.reputation} · 招贤分 ${Math.round(profile.quality * 100)}/100</p>
      <p class="scroll-hint">战力与声望越高，优秀灵根概率越高；天灵根为金木水火土中的单属性，雷冰风为异灵根，二至五灵根随属性增多修炼减慢。概率提升不保证每次招募得到天才。</p></div><div class="grid cols-2">
      ${Object.entries(RECRUIT).map(([id, r]) => `<div class="panel">
        <h3>${r.name}</h3>
        <p style="color:var(--text-dim)">${r.desc}</p>
        <p>消耗：${Object.entries(r.cost).map(([k, v]) => `${RESOURCES[k].name}×${v}`).join(" ")}</p>
        <p>名额：${Game.aliveDisciples().length}/${Game.capacity()}</p>
        <p>天灵根或异灵根概率：${Game.recruitmentProfile({ method: id }).excellentChance.toFixed(1)}%</p>
        <button class="btn primary" style="margin-top:8px" onclick="UI.doRecruit('${id}')">开始${r.name}</button>
      </div>`).join("")}
    </div>`;
  },
  doRecruit(method) {
    const r = Game.recruit(method);
    if (r.err) return this.toast(r.err);
    const list = r.list.map(d =>
      `<img class="recruit-face" src="${this.avatarPath(d)}" alt="" onerror="this.style.display='none'">${d.name}（${spiritRootInfo(d.root).name}·${CLASSES[d.cls].name}·悟性${d.comprehension}·气运${d.luck}）`).join("\n");
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
    this.sfx("month");
    const r = Game.nextMonth();
    if (r.err) { this._drainQueue(); return this.toast(r.err); }
    this.render();
    this._drainQueue();
  },
  _drainQueue() {
    this._pendingWorld = this._pendingAdv = this._pendingEvent = null;
    const item = (Game.state.pendingEvents || [])[0];
    if (!item) {
      const broken = Game.state.sects.find(sec => sec.broken);
      if (broken) return this._showPostWar(broken.id, `请完成对【${broken.name}】的战后处置。`);
      const d = Game.aliveDisciples().find(x => x.tribulation);
      if (d) return this.showDujie(d.id);
      return;
    }
    if (item.type === "world") {
      const ev = item.ev;
      const ill = this.worldEventIll(ev.id);
      this.sfx("event");
      this._pendingWorld = ev;
      this.modal(`
        <h2>【全界大事件】${ev.title}</h2>
        ${ill ? `<img class="modal-ill modal-ill-landscape" src="${ill}" alt="" onerror="this.style.display='none'">` : ""}
        <div class="modal-text">${ev.text}</div>
        <div class="modal-options">
          ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseWorld(${i})">
            ${o.label}<span class="opt-desc">${this.eventOptionDescription(o)}</span></button>`).join("")}
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
      const { ev } = item;
      const d = Game.state.disciples.find(x => x.id === item.dId);
      if (!d || !d.alive) { Game.completePendingEvent(); return this._drainQueue(); }
      this.sfx("event");
      this._pendingAdv = { d, ev };
      const ill = this.eventIll(ev.id);
      this.modal(`
        <h2>【历练归来】${d.name} · ${ev.title}</h2>
        ${ill ? `<img class="modal-ill modal-ill-landscape ${ev.id === "adv_beggar" ? "modal-ill-full" : ""}" src="${ill}" alt="" onerror="this.style.display='none'">` : ""}
        <div class="modal-text">${ev.text.replaceAll("{name}", d.name)}</div>
        <div class="modal-options">
          ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseAdv(${i})">
            ${o.label}<span class="opt-desc">${this.eventOptionDescription(o)}</span></button>`).join("")}
        </div>`);
      document.getElementById("modal").classList.add("event-mijing");
    } else if (item.type === "event") {
      this.showEvent(item.ev, null);
    } else {
      this.modal(`<h2>本月要事</h2><div class="modal-text">${item.list.join("\n")}</div>
        <div class="modal-footer"><button class="btn primary" onclick="Game.completePendingEvent();UI.closeModal();UI._drainQueue()">知道了</button></div>`);
    }
  },
  chooseWorld(optIdx) {
    const ev = this._pendingWorld;
    if (!ev) return;
    const r = Game.applyWorldEvent(ev, optIdx);
    if (r.err) return this.toast(r.err);
    this._pendingWorld = null;
    Game.completePendingEvent();
    this.modal(`<h2>【${ev.title}】结果</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },
  chooseFaction(optIdx) {
    if (!Game.state.pendingEvents.length || Game.state.pendingEvents[0].type !== "faction") return;
    const r = Game.applyFactionChoice(optIdx);
    if (r.err) return this.toast(r.err);
    Game.completePendingEvent();
    this.modal(`<h2>【内斗裁决】</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
  },
  chooseAdv(optIdx) {
    if (!this._pendingAdv) return;
    const { d, ev } = this._pendingAdv;
    const r = Game.applyAdvOption(d, ev, optIdx);
    if (r.err) return this.toast(r.err);
    this._pendingAdv = null;
    Game.completePendingEvent();
    this.modal(`<h2>【历练·${ev.title}】结果</h2><div class="modal-text">${r.msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal();UI.render();UI._drainQueue()">继续</button></div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },
  showEvent(ev, msgs) {
    this.sfx("event");
    this._pendingEvent = ev;
    const ill = this.eventIll(ev.id);
    this.modal(`
      ${ill ? `<img class="modal-ill modal-ill-landscape" src="${ill}" alt="" onerror="this.style.display='none'">` : ""}
      <h2>【事件】${ev.title}</h2>
      <div class="modal-text">${(msgs && msgs.length ? msgs.join("\n") + "\n\n" : "")}${ev.text}</div>
      <div class="modal-options">
        ${ev.options.map((o, i) => `<button class="btn opt-btn" onclick="UI.chooseEvent('${ev.id}',${i})">
          ${o.label}<span class="opt-desc">${this.eventOptionDescription(o)}</span></button>`).join("")}
      </div>`);
    document.getElementById("modal").classList.add("event-mijing");
  },
  chooseEvent(evId, optIdx) {
    const ev = this._pendingEvent;
    if (!ev || ev.id !== evId) return;
    const r = Game.applyEventOption(ev, optIdx);
    if (r.err) return this.toast(r.err);
    this._pendingEvent = null;
    Game.completePendingEvent();
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
  async doSave(slot) {
    if (!Game.save(slot)) return this.toast("存档失败，请检查本地存储空间或权限");
    try { await window.AndroidAppBridge?.flush(); }
    catch (error) { console.error("Android save flush failed:", error); return this.toast("本地存档写入失败，请检查设备剩余空间后重试"); }
    this.closeModal();
    this.toast(`已保存至档位 ${slot}`);
  },
  doLoad(slot) {
    this.confirm("读取存档将覆盖当前进度，确定？", () => {
      if (Game.load(slot)) { this.closeModal(); this.enterGame(); }
      else this.toast("该档位为空或存档已损坏，当前进度未改变");
    });
  },
  doReset() {
    this.confirm("⚠ 开启新周目将覆盖自动存档，确定继续？", () => {
      this.showStartScreen();
      this._showNewGameForm();
    }, true);
  },

  // ---------- 通用组件 ----------
  modal(html) {
    document.getElementById("modal").classList.remove("war-result", "event-mijing", "event-alliance", "event-spirit", "event-dujie");
    // v1.1.1：移除弹窗内印章（曾遮挡选项文字），印章固定于主界面 HUD
    document.getElementById("modal").innerHTML = html;
    document.getElementById("modal-mask").classList.remove("hidden");
  },
  closeModal() {
    const m = document.getElementById("modal");
    m.classList.remove("war-result", "event-mijing", "event-alliance", "event-spirit", "event-dujie");
    document.getElementById("modal-mask").classList.add("hidden");
    this._confirmCb = null;
    // 战争/渡劫 BGM 复位
    const bgm = document.getElementById("bgm");
    if (bgm && (bgm.dataset.warMode || bgm.dataset.dujieMode)) {
      bgm.src = "assets/bgm_main.mp3"; bgm.play().catch(() => {});
      delete bgm.dataset.warMode; delete bgm.dataset.dujieMode;
    }
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
    this._confirmCb = null;
    this.closeModal();
    if (cb) cb();
  },
  toast(msg) {
    // 错误提示保留原对话框，玩家仍可修改准备或重新选择事件。
    if (!document.getElementById("modal-mask").classList.contains("hidden")) {
      const m = document.getElementById("modal");
      let hint = m.querySelector(".modal-hint");
      if (!hint) { hint = document.createElement("p"); hint.className = "modal-hint"; hint.style.color = "#d05a4e"; m.appendChild(hint); }
      hint.textContent = msg;
      return;
    }
    this.modal(`<h2>提示</h2><div class="modal-text">${msg}</div>
      <div class="modal-footer"><button class="btn primary" onclick="UI.closeModal()">知道了</button></div>`);
  }
};

window.addEventListener("DOMContentLoaded", async () => {
  try { await window.AndroidAppBridge?.ready; } catch (error) { console.warn("Android save migration failed:", error); }
  UI.init();
});
