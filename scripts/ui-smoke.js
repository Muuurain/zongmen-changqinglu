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
  const record = async name => { if (output) await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); };
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
    assert.deepEqual(errors,[]);assert.deepEqual([...new Set(missing)],[]);
    const result={passed:true,views:10,checks:['monthlyCultivation','pillButtons','guardianButton','warTactic','sharedWarCooldown','eventRetry','eventReload','postWarReload','tribulationReload'],pageErrors:errors,missingAssets:[...new Set(missing)]};
    if(output)fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
