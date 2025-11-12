import { spawn } from 'node:child_process';
import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import kill from 'tree-kill';

const ROOT = process.cwd();
const BACKEND_PORT = 30521;
const FRONTEND_PORT = 5173;
const BASE = `http://localhost:${BACKEND_PORT}/api`;
const FRONT = `http://localhost:${FRONTEND_PORT}`;
const EXPORTS_DIR = path.join(ROOT, 'exports');
const LOGS_DIR = path.join(ROOT, 'logs');
const FRONT_DIR = path.join(ROOT, 'frontend', 'fm-app');
const NOW = new Date();
const TS = NOW.toISOString().replace(/[:.]/g, '-').slice(0,19);
const REPORT_MD = path.join(EXPORTS_DIR, `HYPER_AUDIT_${TS}.md`);
const REPORT_JSON = path.join(EXPORTS_DIR, `HYPER_AUDIT_${TS}.json`);

const ci = process.argv.includes('--ci');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function ensureDir(p){ try { await mkdir(p,{recursive:true}); } catch{} }
async function httpJson(url, opts={}){
  const res = await fetch(url, { ...opts, headers: { 'content-type':'application/json', ...(opts.headers||{}) } });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText} @ ${url}`);
  const ct = res.headers.get('content-type')||'';
  return ct.includes('application/json') ? res.json() : res.text();
}
async function httpOk(url){
  const res = await fetch(url);
  return res.ok;
}

function spawnLogged(cmd, args, options){
  const child = spawn(cmd, args, { cwd: options?.cwd||ROOT, env: { ...process.env, ...(options?.env||{}) }, shell: true, windowsHide: false });
  child.stdout.on('data', d => process.stdout.write(d));
  child.stderr.on('data', d => process.stderr.write(d));
  return child;
}

async function waitFor(fn, { tries=120, delay=500 }={}){
  for(let i=0;i<tries;i++){
    try { if(await fn()) return true; } catch {}
    await sleep(delay);
  }
  return false;
}

async function portReady(){
  try{
    const ok = await httpOk(`${BASE}/ready`);
    return ok;
  }catch{ return false; }
}

async function frontReady(){
  try{
    const res = await fetch(FRONT);
    return res.ok;
  }catch{ return false; }
}

async function safeKill(p){
  return new Promise(resolve=>{
    if(!p || p.killed) return resolve();
    try { kill(p.pid, 'SIGTERM', ()=>resolve()); }
    catch { resolve(); }
  });
}

async function run() {
  await ensureDir(EXPORTS_DIR);
  await ensureDir(LOGS_DIR);

  // 1) Sanity: ensure venv + node
  const venvPy = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
  if (!existsSync(venvPy)) {
    throw new Error('Virtuelle Umgebung fehlt: .venv\\Scripts\\python.exe – bitte venv einmal erstellen (python -m venv .venv) und requirements installieren.');
  }

  // 2) Install dev deps (idempotent)
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await new Promise((res, rej)=>{
    const c = spawnLogged(npm, ['install', '--silent'], { cwd: ROOT });
    c.on('close', code => code===0 ? res() : rej(new Error('npm install failed')));
  });

  await new Promise((res, rej)=>{
    const c = spawnLogged(npm, ['install', '--silent'], { cwd: FRONT_DIR });
    c.on('close', code => code===0 ? res() : rej(new Error('frontend npm install failed')));
  });

  // 3) Ensure Playwright installed
  await new Promise((res, rej)=>{
    const c = spawnLogged(npm, ['run','playwright:install'], { cwd: ROOT });
    c.on('close', code => code===0 ? res() : rej(new Error('playwright install failed')));
  });

  // 4) Start Backend (uvicorn) without PowerShell
  const envVars = {
    FREIRAUM_DATA_DIR: path.join(ROOT, 'data'),
    FM_BASE_URL: `${BASE}`,
  };
  const uvicorn = spawnLogged(
    venvPy,
    [path.join(ROOT, 'backend', 'run.py')],
    { cwd: ROOT, env: envVars }
  );

  // 5) Start Frontend (Vite dev)
  const vite = spawnLogged(npm, ['run','dev','--','--port', String(FRONTEND_PORT)], { cwd: FRONT_DIR });

  // 6) Wait readiness
  const backOk = await waitFor(portReady, { tries: 180, delay: 500 });
  const uiOk   = await waitFor(frontReady, { tries: 180, delay: 500 });

  let results = [];
  function OK(name, ms){ results.push({ name, status:'OK', ms }); if(!ci) console.log(`✅ ${name}`); }
  function FAIL(name, err){ results.push({ name, status:'FAIL', error: String(err)}); console.error(`❌ ${name} :: ${err}`); }

  if(!backOk) FAIL('Backend ready', 'Timeout /ready');
  else OK('Backend ready');

  if(!uiOk) FAIL('Frontend reachable', 'UI 5173 not responding');
  else OK('Frontend reachable');

  // 7) API tests (mirroring your hyper-audit set)
  async function testStep(name, fn){
    const t0 = Date.now();
    try { await fn(); OK(name, Date.now()-t0); }
    catch(e){ FAIL(name, e.message||e); }
  }

  await testStep('Health', async ()=> { const j = await httpJson(`${BASE}/health`); if(!j.ok) throw new Error('health not ok'); });
  await testStep('System Status', async ()=> { await httpJson(`${BASE}/system/status`); });
  await testStep('Reports KPIs', async ()=> { await httpJson(`${BASE}/reports/kpis`); });
  await testStep('Reports CSV', async ()=> { const r = await fetch(`${BASE}/reports/export.csv`); if(!r.ok) throw new Error('csv export'); });
  await testStep('Reports PDF', async ()=> { const r = await fetch(`${BASE}/reports/export.pdf`); if(!r.ok) throw new Error('pdf export'); });

  // Compat endpoints
  await testStep('Offer Draft (compat)', async ()=>{
    const body = { customer:"Test GmbH", items:[{ title:"Beratung", quantity:"2", price:"99,9"}] };
    const j = await httpJson(`${BASE}/offers/draft`, { method:'POST', body: JSON.stringify(body) });
    if(!j.ok) throw new Error('offer draft not ok');
  });

  await testStep('Character Event (compat)', async ()=>{
    const body = { user:"denis", message:"Audit Ping", mood:"neutral", topics:"audit,kpi" };
    const j = await httpJson(`${BASE}/character/event`, { method:'POST', body: JSON.stringify(body) });
    if(!j.ok && j.accepted!==true) throw new Error('character event not ok');
  });

  await testStep('KB Create (compat)', async ()=>{
    const body = { title:"Audit Note", body:"OK", tags:"audit,ui" };
    const j = await httpJson(`${BASE}/kb/items`, { method:'POST', body: JSON.stringify(body) });
    if(!(j.id || j.ok)) throw new Error('kb create failed');
  });

  await testStep('Insights Suggestions', async ()=> { await httpJson(`${BASE}/insights/suggestions`); });
  await testStep('Decision Think', async ()=> { const j = await httpJson(`${BASE}/decision/think`, { method:'POST', body: JSON.stringify({user_id:"denis"}) }); if(!j) throw new Error('no response'); });

  // Async Lead Hunter
  await testStep('Lead Hunter (async)', async ()=>{
    const start = await httpJson(`${BASE}/lead_hunter/hunt_async`, { method:'POST', body: JSON.stringify({ category:"shk", location:"Arnsberg", count: 10, save_to_db:true, export_excel:true }) });
    if(!start.ok) throw new Error('could not start async hunt');
    const id = start.task_id;
    // poll up to 120s
    let ok=false; let lastStatus='queued';
    for(let i=0;i<120;i++){
      await sleep(1000);
      const s = await httpJson(`${BASE}/lead_hunter/task/${id}`);
      lastStatus = s.status;
      if(s.status==='done'){ ok=true; break; }
      if(s.status==='error' || s.status==='canceled'){ throw new Error(`task ${s.status}`); }
    }
    if(!ok) throw new Error(`timeout waiting task (last=${lastStatus})`);
  });

  // Proactive 5s
  await testStep('Proactive Reminder (5s)', async ()=>{
    const r = await httpJson(`${BASE}/proactive/remember`, { method:'POST', body: JSON.stringify({ user_id:"denis", kind:"followup", note:"Audit-Reminder (5s)", in:"5s", payload:{origin:"audit"} }) });
    const rid = r.reminder?.id;
    await sleep(6000);
    await httpJson(`${BASE}/proactive/trigger`, { method:'POST' });
    const list = await httpJson(`${BASE}/proactive/reminders?status=queued`);
    const stillQueued = (list.items||[]).some(x=>x.id===rid);
    if(stillQueued) throw new Error('reminder stayed queued');
  });

  // 8) Playwright UI smoke (avatar + DE labels)
  await testStep('UI Smoke (Playwright)', async ()=>{
    // Ensure tests exist; if not, synthesize a minimal one
    const testsDir = path.join(ROOT,'frontend','fm-app','tests');
    await ensureDir(testsDir);
    const testFile = path.join(testsDir,'avatar.spec.js');
    if(!existsSync(testFile)){
      const content = `
        import { test, expect } from '@playwright/test';
        test('Avatar visible & DE labels', async ({ page })=>{
          await page.goto('http://localhost:${FRONTEND_PORT}', { waitUntil:'networkidle' });
          // Avatar
          const avatar = page.locator('[data-testid="avatar-bot"]');
          await expect(avatar).toBeVisible({ timeout: 15000 });

          // Some German nav labels (at least one should exist)
          const navLabels = ['Einstellungen','Berichte','Nachfassungen','Ablaufpläne','Wissensbasis','Angebote','Kontakt-Suche','Kontakte','Hinweise'];
          const found = await Promise.any(navLabels.map(async (txt)=>{
            const el = page.getByText(txt, { exact: false });
            await el.first().waitFor({ timeout: 5000 });
            return true;
          })).catch(()=>false);
          expect(found).toBeTruthy();
        });
      `;
      await writeFile(testFile, content, 'utf8');
    }
    await new Promise((res, rej)=>{
      const c = spawnLogged(npm, ['run','test:ui','--','--config', path.join(FRONT_DIR, 'playwright.config.js')], { cwd: FRONT_DIR });
      c.on('close', code => code===0 ? res() : rej(new Error('playwright tests failed')));
    });
  });

  // 9) Summarize & write report
  const okCount = results.filter(r=>r.status==='OK').length;
  const failCount = results.filter(r=>r.status==='FAIL').length;

  const md = [
    `# HYPER-AUDIT REPORT`,
    `**Zeit:** ${new Date().toISOString()}  |  **Backend:** :${BACKEND_PORT}  |  **Frontend:** :${FRONTEND_PORT}`,
    ``,
    `## Zusammenfassung`,
    `- **Gesamt:** ${results.length}  |  [OK] **Bestanden:** ${okCount}  |  [FAIL] **Fehlgeschlagen:** ${failCount}`,
    ``,
    `## Details`,
    ...results.map(r => r.status==='OK'
      ? `- [OK] **${r.name}**${r.ms?` - ${r.ms} ms`:''}`
      : `- [FAIL] **${r.name}** - ${r.error}`
    )
  ].join('\n');

  const json = { when: new Date().toISOString(), backend: BACKEND_PORT, frontend: FRONTEND_PORT, results };

  await writeFile(REPORT_MD, md, 'utf8');
  await writeFile(REPORT_JSON, JSON.stringify(json, null, 2), 'utf8');

  if(!ci){
    console.log('\n📄 Report gespeichert: ' + REPORT_MD);
    console.log('🧾 JSON: ' + REPORT_JSON);
  }

  // 10) Shutdown processes
  await safeKill(vite);
  await safeKill(uvicorn);
}

run().catch(async (e)=>{
  console.error('FATAL:', e?.message||e);
  process.exitCode = 1;
});
