// 可选实际界面测试。需 Playwright 与已安装的 Microsoft Edge，不影响 npm test。
// ZONGMEN_PLAYWRIGHT_MODULE 可指定外部 Playwright 模块绝对路径。
const { chromium } = require(process.env.ZONGMEN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const page = await context.newPage();
  const errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (!request.url().endsWith('.mp3')) missing.push(request.url()); });
  const output = process.env.ZONGMEN_UI_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  const record = async name => {
    if (!output) return;
    // 等待有限时长的进场动画，避免截图记录到淡入中的空白页面；忽略循环背景动画。
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  };
  try {
    const entry=process.env.ZONGMEN_UI_ENTRY || path.resolve(__dirname, '..', 'index.html');
    await page.goto(pathToFileURL(path.resolve(entry)).href);
    await page.waitForFunction(() => Game.state && document.getElementById('sect-date').textContent);
    for (const view of ['disciples','elders','buildings','adventure','trade','diplomacy','spirit','recruit','log','overview']) {
      await page.locator(`.nav-btn[data-view="${view}"]`).click();
      assert.ok(await page.locator('#view-' + view).isVisible());
    }
    await page.locator('#btn-next-month').click();
    assert.equal(await page.evaluate(() => Game.aliveDisciples().every(d => d.exp > 0)), true);
    await record('month-event');
    // 实际点击加减丹药和护法，并检查文本与状态同步。
    await page.evaluate(() => {
      UI.closeModal(); Game.newGame();
      const d=Game.state.disciples[1]; d.luck=0;d.exp=stageExpNeed(d.realm,d.stage);UI.render();UI.showBreakthrough(d.id);
    });
    await page.getByRole('button',{name:'服用丹药 +1',exact:true}).click();
    assert.match(await page.locator('#modal').innerText(),/服用丹药：1 颗/);
    await page.getByRole('button',{name:'丹药 -1',exact:true}).click();
    assert.match(await page.locator('#modal').innerText(),/服用丹药：0 颗/);
    await page.getByRole('button',{name:/请 顾长风.*护法/}).click();
    assert.match(await page.locator('#modal').innerText(),/护法修士：1 名/);
    await record('breakthrough');
    // 战术和同月冷却。
    await page.evaluate(() => { UI.closeModal();Game.state.sects[0].relation=-80; UI.showWarRoom(Game.state.sects[0].id); });
    await page.locator('.tactic-btn').nth(2).click();
    assert.equal(await page.evaluate(() => UI._warState.tactic),'siege');
    assert.match(await page.locator('.tactic-btn.primary').innerText(),/围/);
    await record('war-room');
    await page.evaluate(() => { UI.closeModal();Math.random=()=>0;Game.startWar(Game.state.sects[0]);UI.render(); });
    const before=await page.evaluate(()=>Game.state.resources.lingshi);
    await page.evaluate(()=>UI.confirmDiplo(Game.state.sects[0].id,'declare'));
    await page.getByRole('button',{name:'确认',exact:true}).click();
    assert.match(await page.locator('#modal').innerText(),/本月已.*交战/);
    assert.equal(await page.evaluate(()=>Game.state.resources.lingshi),before);
    // 事件资源不足后仍能选择免费选项，重启不会吞事件。
    await page.evaluate(() => {
      UI.closeModal();Game.newGame();Game.state.resources.lingshi=0;
      Game.state.pendingEvents=[{type:'event',ev:EVENTS.find(e=>e.id==='shangdui')}];Game.autosave();
    });
    await page.reload();
    await page.getByRole('button',{name:/购入丹药/}).click();
    assert.match(await page.locator('#modal .modal-hint').innerText(),/资源不足/);
    assert.equal(await page.getByRole('button',{name:/婉拒/}).count(),1);
    await record('event-insufficient');
    await page.getByRole('button',{name:/婉拒/}).click();
    assert.equal(await page.evaluate(()=>Game.state.pendingEvents.length),0);
    // 读档恢复战后处置。
    await page.evaluate(() => {UI.closeModal();Game.state.sects[0].broken=true;Game.autosave();});
    await page.reload();assert.match(await page.locator('#modal').innerText(),/战后处置/);
    await page.getByRole('button',{name:/收为附庸/}).click();
    assert.equal(await page.evaluate(()=>Game.state.sects[0].vassal),true);
    // 雷劫第一波以后重启继续第二波。
    await page.evaluate(() => {
      UI.closeModal();const d=Game.state.disciples[0];d.realm=7;d.stage=3;d.exp=stageExpNeed(7,3);Game.state.spiritChannel=true;
      Math.random=()=>0;UI.showDujie(d.id);
    });
    assert.equal(await page.locator('.dujie-wave.fail').count(),0);
    await page.getByRole('button',{name:'引动天雷（不可逆）',exact:true}).click();
    await page.reload();
    assert.equal(await page.locator('.dujie-wave.pass').count(),1);
    assert.match(await page.locator('#modal').innerText(),/硬抗第 2 道天雷/);
    await record('tribulation-resume');
    // 自动突破设置、逐弟子开关和灵根展示。
    await page.evaluate(() => {
      UI.closeModal();Game.newGame();Math.random=()=>0;Game.state.resources.danyao=0;
      Game.state.disciples.forEach(d=>{d.exp=stageExpNeed(d.realm,d.stage);});UI.render();
    });
    await page.locator('.nav-btn[data-view="disciples"]').click();
    await page.getByRole('checkbox',{name:'顾长风参与自动突破',exact:true}).uncheck();
    await page.locator('#auto-bt-strategy').selectOption('wait');
    await page.locator('#auto-bt-pills').selectOption('2');
    await page.locator('#auto-bt-monthly').check();
    await page.reload();
    await page.locator('.nav-btn[data-view="disciples"]').click();
    assert.equal(await page.getByRole('checkbox',{name:'顾长风参与自动突破',exact:true}).isChecked(),false);
    assert.equal(await page.locator('#auto-bt-strategy').inputValue(),'wait');
    assert.equal(await page.locator('#auto-bt-pills').inputValue(),'2');
    assert.equal(await page.locator('#auto-bt-monthly').isChecked(),true);
    await record('auto-breakthrough-settings');
    const runBatch=async()=>{
      await page.locator('#btn-auto-breakthrough').click();
      await page.getByRole('button',{name:'确认',exact:true}).click();
    };
    await runBatch();assert.match(await page.locator('#modal').innerText(),/等丹 2 人/);
    assert.equal(await page.evaluate(()=>Game.state.disciples[1].stage),0);
    await page.getByRole('button',{name:'知道了',exact:true}).click();
    await page.evaluate(()=>{Game.state.resources.danyao=2;Math.random=()=>0;});
    await runBatch();assert.match(await page.locator('#modal').innerText(),/成功 1 人.*等丹 1 人/);
    await record('auto-breakthrough-result');
    await page.getByRole('button',{name:'知道了',exact:true}).click();
    await page.evaluate(()=>{Game.state.resources.danyao=2;});
    await page.locator('#btn-next-month').click();
    assert.equal(await page.evaluate(()=>Game.state.disciples[2].stage),1);
    assert.equal(await page.evaluate(()=>Game.state.disciples[0].stage),0);
    // 统一命名与招贤概率实际渲染，狭窄窗口下配置栏保持可操作。
    await page.evaluate(()=>{
      UI.closeModal();Game.newGame();
      Game.state.disciples[0].root={kind:'normal',elements:['金']};
      Game.state.disciples[1].root={kind:'normal',elements:['金','木','水','火','土']};
      Game.state.disciples[2].root={kind:'mutant',elements:['雷']};UI.render();
    });
    await page.locator('.nav-btn[data-view="disciples"]').click();
    assert.match(await page.locator('#view-disciples').innerText(),/金天灵根/);
    assert.match(await page.locator('#view-disciples').innerText(),/金木水火土五灵根/);
    assert.match(await page.locator('#view-disciples').innerText(),/雷异灵根/);
    await page.setViewportSize({width:1100,height:700});await record('auto-breakthrough-1100');
    assert.ok(await page.locator('#btn-auto-breakthrough').isVisible());
    await page.setViewportSize({width:1360,height:860});
    await page.locator('.nav-btn[data-view="recruit"]').click();
    assert.match(await page.locator('#view-recruit').innerText(),/天灵根或异灵根概率/);
    const low=await page.evaluate(()=>Game.recruitmentProfile().excellentChance);
    await page.evaluate(()=>{Game.state.reputation=500;Game.state.disciples.forEach(d=>{d.realm=7;d.stage=3;});UI.renderRecruit();});
    assert.ok(await page.evaluate(()=>Game.recruitmentProfile().excellentChance)>low);
    await record('root-recruitment');
    assert.deepEqual(errors,[]);assert.deepEqual([...new Set(missing)],[]);
    const result={passed:true,views:10,checks:['monthlyCultivation','pillButtons','guardianButton','warTactic','sharedWarCooldown','eventRetry','eventReload','postWarReload','tribulationReload','autoSettingsReload','autoWait','autoMonthly','rootNaming','rootRecruitment','autoNarrowViewport'],pageErrors:errors,missingAssets:[...new Set(missing)]};
    if(output)fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
