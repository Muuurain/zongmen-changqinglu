# 《宗门长青录》软件架构文档

## 1. 整体架构

纯前端单页应用（SPA）+ Electron 桌面壳，**无后端、无网络依赖**。采用「配置表 + 纯逻辑引擎 + 渲染层」三层分离：

```
┌─────────────────────────────────────────────┐
│  index.html  (入口 + 页面骨架 + 弹窗容器)      │
├──────────────┬──────────────┬───────────────┤
│   ui.js      │   game.js    │   data.js      │
│  渲染/交互层  │  核心逻辑引擎  │  配置表(数据层) │
├──────────────┴──────────────┴───────────────┤
│  css/style.css（国风水墨样式 + 资源引用）       │
│  assets/（30 项美术/音频，运行时静态加载）       │
├─────────────────────────────────────────────┤
│  main.js（Electron 主进程，仅开窗加载页面）     │
└─────────────────────────────────────────────┘
```

- **浏览器形态**：直接打开 `index.html` 即玩，存档存 localStorage
- **桌面形态**：Electron 加载同一份页面，`main.js` 仅负责创建窗口

## 2. 模块划分与职责

| 文件 | 职责 |
|---|---|
| `js/data.js` | 全部静态配置表：境界（REALMS）、灵根、职业（CLASSES）、建筑（BUILDINGS）、突破规则、NPC 宗门、随机/历练/议事/全界事件、商路、渡劫、灵界分宗等。**数据驱动，扩展新内容优先改这里** |
| `js/game.js` | 游戏状态（`Game.state`）与全部业务逻辑：新周目、招募、岗位、建筑升级、突破、外交、战争（编队/战术/战后）、附庸、商队、历练、长老院/客卿、派系、底蕴气运、联盟、渡劫、灵界分宗、全界大事件、月度结算（`nextMonth`）、存档（`save/load`） |
| `js/ui.js` | 全部视图渲染与交互：总览/弟子/长老院/建筑/历练/商路/外交/灵界/招募/宗门志 10 个视图，弹窗（突破/批量突破/战争指挥室/渡劫/议事/事件），BGM/音效控制，读取持久化事件队列 `state.pendingEvents` |
| `main.js` | Electron 主进程入口，创建 `BrowserWindow` 加载 `index.html` |
| `scripts/build-portable.js` | 便携版一键打包脚本（复制运行时 + 写入游戏文件 + 压缩 zip） |
| `package.json` | 依赖、脚本（start/pack/dist/build:portable）、electron-builder 配置 |

## 3. 技术选型

| 项 | 选型 | 理由 |
|---|---|---|
| 语言 | 原生 HTML/CSS/JavaScript（ES6+） | 零构建、零依赖即可运行，便于快速迭代与直接预览 |
| 桌面封装 | Electron 33 | 将网页打包为跨平台 exe，业界成熟方案 |
| 打包 | electron-builder（NSIS 安装包）+ 自研便携脚本 | 双通道：安装包需管理员权限，便携脚本零门槛 |
| 存档 | localStorage（JSON 序列化 `Game.state`） | 纯前端无后端的最简持久化 |
| 资源 | AI 生成 PNG/MP3，静态引用 | 美术/音乐解耦，可随时替换 |

## 4. 数据流

```
玩家操作(UI)
   │  调用 Game.xxx()
   ▼
Game 核心逻辑 ──修改 Game.state──► 更新数据
   │                                   │
   │ 返回结果 {ok, msg, ...}            │
   ▼                                   ▼
UI 弹窗/提示 + UI.render() 重渲染视图 ◄── 读取 Game.state
   │
   │ 点击「闭关一月」
   ▼
Game.nextMonth() 月度结算
   ├─ 建筑产出、弟子修炼、可选自动突破、寿元/忠诚、附庸/商队/历练/客卿/派系/联盟/分宗/世界演进
   ├─ 抽取随机事件 / 全界大事件 / 历练归来事件
   └─ autosave() 写入 localStorage
   ▼
返回 { msgs, event, advReturns, factionEvt, worldEvt }
   ▼
UI._drainQueue() 依次弹出事件弹窗，玩家逐个抉择（Game.applyEventOption / applyAdvOption / applyWorldEvent / applyFactionChoice）
```

## 5. 关键数据模型

```js
// 游戏全局状态 Game.state
{
  saveVersion: 3,
  sectName, year, month, reputation, generation,
  autoBreakthrough: { monthly: false, strategy: "direct", pills: 1 },
  resources: { lingshi, lingyao, kuangshi, mucai, danyao },
  buildings: { shanmen: lv, lingtian: lv, ... },  // 8 类
  jobs: { buildingId: [discipleId, ...] },          // 岗位分配
  disciples: [ { id, name, gender, realm, stage, exp,
                 root: { kind: "normal", elements: ["金", "木"] },
                 autoBreakthrough: true, personality,
                 cls, luck, comprehension, loyalty, lifespanLeft, alive,
                 isLeader, isElder, keqing, inBranch, injuredMonths,
                 foundationDmg, xinyi, adventure, ascended, ... } ],
  sects: [ { id, name, power, relation, allied, trade, atWar, vassal, loyalty, destroyed, broken } ],
  caravans: [ { routeId, goodsId, amount, escortId, monthsLeft, cost } ],
  pendingEvents: [ { type, ev, dId, list } ],
  alliance: { name, members, prestige, raidCd },
  spiritSects: [ ... ], branch: { disciples, spiritRep },
  heritage, qiyun, factionTension, spiritStep, spiritChannel,
  worldEventCd, chaos, veinDamageMonths, insightBoostMonths, gameOver
}
```

关键派生值：`disciplePower()`（战力）、`sectPower()`（总战力）、`cultivateSpeed()`（修炼速度，含底蕴/长老/建筑/气运加成）、`capacity()`（容纳上限）、`heritageBonus()/qiyunBonus()`。

## 6. 关键接口（Game 对象方法，节选）

| 方法 | 说明 |
|---|---|
| `newGame() / save(slot) / load(slot)` | 周目与存档 |
| `nextMonth()` | 月度结算总入口，返回待处理事件集 |
| `recruit(method) / makeDisciple(opts)` | 招募与弟子生成 |
| `assignJob(bId,dId) / upgradeBuilding(bId)` | 岗位与建筑 |
| `tryBreakthrough(dId,pills,guardians)` | 突破（含失败惩罚） |
| `setAutoBreakthrough / setDiscipleAutoBreakthrough / runAutoBreakthrough` | 全局策略、个人开关、单轮批量突破；月结可选调用，复用手动规则 |
| `recruitmentProfile / rollSpiritRoot` | 战力与声望影响招贤概率，生成无重复属性的结构化灵根 |
| `diploAction(sectId,actionId) / startAssault / postWar` | 外交与战争 |
| `dispatchCaravan / sendAdventure` | 商队与历练 |
| `recruitKeqing / appointElder / factionTick` | 长老院与派系 |
| `formAlliance / allianceRaid / spiritQuest` | 联盟与灵界通道 |
| `dujieWave(dId,wave,pills,guardians)` | 渡劫逐波结算 |
| `applyEventOption / applyAdvOption / applyWorldEvent / applyFactionChoice` | 各类事件抉择 |

## 7. 部署结构

```
D:\Code\宗门长青录\
├── index.html / main.js / package.json
├── css\style.css
├── js\{data,game,ui}.js
├── assets\*.png / *.mp3      # 30 项资源
├── docs\{PRD,architecture,progress,资源清单}.md
├── scripts\build-portable.js
├── dist\                     # electron-builder 产物（NSIS 安装包 + blockmap）
└── dist-portable\            # 便携版产物（宗门长青录.exe + zip）
```

**发布**：GitHub 仓库 `Muuurain/zongmen-changqinglu`，Release v1.0.0 提供 `ZongMenChangQingLu-Setup-1.0.0.exe`（NSIS 安装包）。

## 8. v1.2.0 兼容说明

灵根的格式、倍率、招募公式和 v1/v2 迁移映射详见 [本次交接](v1.2.0-自动突破与灵根重构.md)。`root` 不再是数字索引，统一调用 `spiritRootInfo(root)` 获取展示名与倍率。自动突破不跳过风险校验，不负责渡劫，不会在读档时立即执行；旧档默认关闭月结自动执行。历史 F01—F26 记录已迁入 [Markdown 归档](v1.1.2-修复与Agent交接.md)。
