import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
import { createExplorerFixtureProject } from '../examples/explorer/create-project.js';
import { createExplorerService } from '../src/application/explorer-service.js';
import { startExplorerServer } from '../src/visualization/explorer-server.js';
import { exportExplorerReport } from '../src/application/explorer-export.js';
import { servePublicReport } from '../examples/explorer/report-server.js';

const executablePath = process.env.WEFTLET_BROWSER_EXECUTABLE ?? ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
if (!executablePath) throw new Error('Set WEFTLET_BROWSER_EXECUTABLE to a sandbox-capable Chromium/Chrome executable');
const fixture = await createExplorerFixtureProject(250);
const service = await createExplorerService(fixture.configPath, fixture.snapshot.manifest.snapshotId);
const server = await startExplorerServer(service, { port: 0 });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true,
  env: { ...process.env, ...(process.platform === 'linux' && existsSync('/etc/fonts/fonts.conf') ? {
    FONTCONFIG_PATH: '/etc/fonts', FONTCONFIG_FILE: '/etc/fonts/fonts.conf',
  } : {}) } });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(server.url + '/')) external.push(request.url()); });
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('saved assertions connect'));
  const graph = () => page.evaluate(() => {
    const cy = (document.getElementById('graph') as unknown as { _cyreg: { cy: import('cytoscape').Core } })._cyreg.cy;
    return { nodes: cy.nodes().map(n => ({ id: n.data('nodeId'), kind: n.data('kind'), position: { ...n.position() }, rendered: { ...n.renderedPosition() } })),
      zoom: cy.zoom(), pan: { ...cy.pan() } };
  });
  const initial = await graph(); assert.equal(initial.nodes.length, 4);
  assert.ok(initial.nodes.every(node => ['Capability', 'Workflow', 'Contract'].includes(node.kind)));
  const box = (await page.locator('#graph').boundingBox())!, reserve = initial.nodes.find(n => n.id === 'workflow:reserve')!;
  await page.mouse.move(box.x + reserve.rendered.x, box.y + reserve.rendered.y); await page.mouse.down();
  await page.mouse.move(box.x + reserve.rendered.x + 55, box.y + reserve.rendered.y + 35, { steps: 10 }); await page.mouse.up();
  const dragged = (await graph()).nodes.find(n => n.id === reserve.id)!.position;
  assert.notDeepEqual(dragged, reserve.position);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); assert.ok((await graph()).zoom > initial.zoom);
  const pan = (await graph()).pan;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 45, { steps: 10 }); await page.mouse.up(); assert.notDeepEqual((await graph()).pan, pan);
  await page.locator('#related').getByRole('button', { name: 'Reserve inventory Workflow' }).click();
  await page.waitForFunction(() => document.querySelector('#title')!.textContent === 'Reserve inventory');
  assert.equal(await page.locator('#evidence > details[open]').count(), 0);
  assert.ok((await page.locator('#gaps').textContent())!.includes('no saved exact binding'));
  const current = await graph(), ship = current.nodes.find(n => n.id === 'workflow:ship')!;
  const focusedBox = (await page.locator('#graph').boundingBox())!;
  await page.mouse.click(focusedBox.x + ship.rendered.x, focusedBox.y + ship.rendered.y);
  await page.waitForFunction(() => document.querySelector('#title')!.textContent === 'Ship after reservation');
  assert.ok((await graph()).nodes.some(n => n.id === 'component:file:src/worker.ts'));
  await page.locator('#related').getByRole('button', { name: 'Shipping worker Component' }).click();
  await page.waitForFunction(() => document.querySelector('#title')!.textContent === 'Shipping worker');
  assert.ok((await page.locator('#related').textContent())!.includes('Ship after reservation'));
  await page.locator('#back').click(); await page.locator('#back').click(); await page.locator('#back').click();
  assert.deepEqual((await graph()).nodes.find(n => n.id === reserve.id)!.position, dragged);
  await page.locator('#related').getByRole('button', { name: 'Reserve inventory Workflow' }).focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#title')!.textContent === 'Reserve inventory');
  await page.locator('#authority').selectOption('declared');
  assert.equal((await graph()).nodes.length, 2);
  assert.ok((await page.locator('#status').textContent())!.includes('1/3 returned assertions visible'));
  await page.locator('#authority').selectOption('all');
  const evidence = page.locator('#evidence details[data-fact-id="policy-queue"]');
  await page.locator('#evidence > details').filter({ has: page.locator('details[data-fact-id="policy-queue"]') }).locator('summary').first().click();
  await evidence.locator('summary').first().click();
  assert.ok((await evidence.textContent())!.includes('Source: declared · Review: unreviewed'));
  await page.locator('#predicate').selectOption('governedBy');
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('1 matching relationships'));
  assert.equal((await graph()).nodes.length, 2);
  await page.locator('#direction').selectOption('incoming');
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('0 matching relationships'));
  assert.equal(await page.locator('#empty').innerText(), 'No relationships match the selected filters.');
  await page.getByText('Explore a path', { exact: true }).click();
  await page.locator('#from-node').fill('capability:orders');
  await page.locator('#to-node').fill('component:file:src/worker.ts');
  await page.getByRole('button', { name: 'Find saved paths' }).click();
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('static paths do not prove causality'));
  assert.equal(await page.locator('#evidence details[data-fact-id]').count(), 3);
  await page.locator('#view').selectOption('implementation');
  await page.waitForFunction(() => document.querySelector('#scope')!.textContent === 'implementation overview');
  const firstIds = (await graph()).nodes.map(node => node.id);
  await page.locator('#next').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#selection-details')!.textContent!).offset === 24);
  assert.ok((await graph()).nodes.every(node => !firstIds.includes(node.id)));
  await page.locator('#search').fill('no-such-public-evidence');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('0 catalog matches'));
  assert.ok((await page.locator('#empty').innerText()).includes('No nodes match'));
  await page.getByText('Explore a path', { exact: true }).click();
  await page.locator('#home').click();
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('saved assertions connect'));
  const screenshot = process.env.WEFTLET_BROWSER_SCREENSHOT;
  if (screenshot) { const output = resolve(screenshot); await mkdir(resolve(output, '..'), { recursive: true }); await page.screenshot({ path: output, fullPage: true }); }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const report = await exportExplorerReport(service, { output: join(fixture.root, '.context-graph/browser-report'), roots: ['workflow:reserve'], depth: 3 });
  const staticServer = await servePublicReport(report.output);
  try {
    const offline = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
    const offlineErrors: string[] = [], offlineExternal: string[] = [];
    offline.on('pageerror', error => offlineErrors.push(error.message));
    offline.on('request', request => { if (!request.url().startsWith(staticServer.url)) offlineExternal.push(request.url()); });
    await offline.goto(staticServer.url);
    await offline.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('saved assertions connect'));
    assert.ok((await offline.locator('#report-scope').innerText()).includes('5 of 256 source facts'));
    assert.equal(await offline.getByText('Explore a path', { exact: true }).isVisible(), false);
    assert.equal(await offline.locator('#refresh-state').isVisible(), false);
    await offline.locator('#related').getByRole('button', { name: 'Ship after reservation Workflow' }).click();
    await offline.waitForFunction(() => document.querySelector('#title')!.textContent === 'Ship after reservation');
    await offline.locator('#related').getByRole('button', { name: 'Shipping worker Component' }).click();
    await offline.waitForFunction(() => document.querySelector('#title')!.textContent === 'Shipping worker');
    const live = await service.exploration.neighbors({ snapshotId: fixture.snapshot.manifest.snapshotId, nodeId: 'component:file:src/worker.ts', maxFacts: 30 });
    assert.deepEqual(await offline.locator('#evidence details[data-fact-id]').evaluateAll(items => items.map(item => (item as HTMLElement).dataset.factId)), live.facts.map(fact => fact.id));
    await offline.locator('#related').getByRole('button', { name: /Future plan.*outside report/ }).click();
    await offline.waitForFunction(() => !document.querySelector<HTMLElement>('#error')!.hidden);
    assert.ok((await offline.locator('#error').innerText()).includes('outside the focused report'));
    assert.equal(await offline.locator('#title').innerText(), 'Shipping worker');
    await offline.locator('#back').click();
    assert.equal(await offline.locator('#title').innerText(), 'Ship after reservation');
    assert.ok(staticServer.requests.some(path => /\/data\/[a-f0-9]{64}\.json$/.test(path)));
    assert.ok(staticServer.requests.every(path => !path.includes('/api/')));
    assert.deepEqual(offlineErrors, []); assert.deepEqual(offlineExternal, []);
    await offline.close();
  } finally { await staticServer.close(); }
  console.log(JSON.stringify({ browser: browser.version(), sandbox: true, mode: 'local', publicFixture: true,
    passed: ['intent overview', 'canvas drill-down', 'code-to-intent return', 'drag', 'pan', 'zoom', 'back restores layout',
      'keyboard entry', 'authority and predicate/direction filters', 'bounded paths', 'catalog continuation', 'empty results',
      'collapsed inspector', 'source/review separation', 'portable static subdirectory deployment', 'portable/live assertion parity',
      'explicit portable frontier', 'no portable API dependency', 'no external requests'], screenshot: screenshot ?? null }));
} finally { await browser?.close(); await server.close(); await fixture.cleanup(); }
