#!/usr/bin/env node
// Quick guest probe: join AGENTROOM, dump roster + remote audio publishers, exit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FLAGS = ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
const TONE = path.resolve(REPO_ROOT, 'e2e/fixtures/audio/tone-880.wav');
const AGENT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT,'AGENTROOM.json'),'utf8'));
const ROOM_ID = AGENT.id;
const URL = `http://localhost:4700/room/${ROOM_ID}`;
const args=[...FLAGS]; if (fs.existsSync(TONE)) args.push(`--use-file-for-fake-audio-capture=${TONE}`);
const b = await chromium.launch({headless:true,args});
const ctx = await b.newContext({permissions:['microphone','camera']});
const page = await ctx.newPage();
await page.goto(URL).catch(()=>{}); await page.waitForTimeout(600);
const g = page.locator('#guest-display-name');
if (await g.count()>0 && await g.isVisible().catch(()=>false)) { await g.fill('Probe'); await page.getByRole('button',{name:'Continue'}).click().catch(()=>{}); await page.waitForTimeout(300); }
const conf = page.getByRole('button',{name:/Confirm — everything works|Check mic and speaker/i});
const dl=Date.now()+8000; while(Date.now()<dl){ if(await conf.count()>0 && await conf.first().isEnabled().catch(()=>false)){await conf.first().click().catch(()=>{});break;} await page.waitForTimeout(300);}
const ni = page.locator('#display-name'); if(await ni.count()>0) await ni.fill('Probe').catch(()=>{});
const jb = page.getByRole('button',{name:/Ask to join/i}); const fb=page.getByRole('button',{name:/^Join$/i});
if(await jb.count()>0) await jb.first().click().catch(()=>{}); else if(await fb.count()>0) await fb.first().click().catch(()=>{});
await page.waitForTimeout(3000);
for(let i=0;i<20;i++){
  const info = await page.evaluate(async ()=>{
    const d=window.__meetDebug||{};
    let stats=null; try{ if(d.sfuGetStats) stats=await d.sfuGetStats(); }catch{}
    const byTrack={}; if(stats) stats.forEach(s=>{ if(s.type==='inbound-rtp'&&s.kind==='audio'&&s.trackIdentifier) byTrack[s.trackIdentifier]=Math.max(byTrack[s.trackIdentifier]||0,s.bytesReceived||0); });
    const streams=d.sfuRemoteStreams; let liveAudio=0,withBytes=0; const cids=[];
    if(streams) for(const [cid,st] of streams){ const t=st.getAudioTracks&&st.getAudioTracks()[0]; if(t&&t.readyState==='live'){liveAudio++; cids.push(cid); if((byTrack[t.id]||0)>0) withBytes++;} }
    const roster=(d.participants||d.peers||[]).map(p=>({id:(p.clientId||p.id||'').slice(0,8),name:p.displayName||p.name}));
    return {ws:d.wsStatus, myId:(d.myClientId||'').slice(0,8), streamsSize:streams?streams.size:0, liveAudio, withBytes, roster, cids:cids.map(c=>c.slice(0,8))};
  }).catch(e=>({err:String(e).slice(0,80)}));
  console.log('[PROBE]', JSON.stringify(info));
  await page.waitForTimeout(1500);
}
await b.close(); process.exit(0);
