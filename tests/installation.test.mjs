import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {root} from '../server/config.mjs';

test('fresh owner installation, HTTP authentication, credential rotation and database backup', {timeout:30000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'studio-install-'));
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const env={...process.env,PRIVATE_DIR:directory,PORT:String(port),HOST:'127.0.0.1',OWNER_EMAIL:'writer@example.com',PUBLIC_URL:'https://tex.example.org',TRUST_PROXY:'loopback'};
 const run=(...args)=>spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8'});
 const base=`http://127.0.0.1:${port}`;
 let server,closed;
 async function start(){
  server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env,stdio:'ignore'});closed=once(server,'exit');
  for(let i=0;i<200;i++){
   if(server.exitCode!==null)throw new Error('Server exited before becoming healthy');
   try{if((await fetch(`${base}/healthz`)).ok)return;}catch{}
   await setTimeout(50);
  }
  throw new Error('Server did not become healthy');
 }
 try{
  await start();
  const credentials=JSON.parse(readFileSync(join(directory,'access.json'),'utf8'));
  assert.equal(credentials.email,'writer@example.com');
  assert.ok(credentials.password.length>=32&&credentials.mcp_token.length>=43);
  if(process.platform!=='win32')assert.equal(statSync(join(directory,'access.json')).mode&0o777,0o600);
  assert.equal((await fetch(`${base}/api/projects`)).status,401);
  assert.equal((await fetch(`${base}/mcp`,{method:'POST'})).status,401);
  const login=(body,origin=env.PUBLIC_URL)=>fetch(`${base}/api/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  assert.equal((await login(credentials,'https://untrusted.example')).status,403);
  assert.equal((await login({...credentials,password:'wrong'})).status,401);
  const authenticated=await login(credentials);assert.equal(authenticated.status,200);
  const cookieHeader=authenticated.headers.get('set-cookie');assert.match(cookieHeader,/HttpOnly/);assert.match(cookieHeader,/Secure/);assert.match(cookieHeader,/SameSite=Strict/);
  const headers={Cookie:cookieHeader.split(';')[0]};
  const config=await (await fetch(`${base}/api/mcp-config`,{headers})).json();
  assert.equal(config.url,`${env.PUBLIC_URL}/mcp`);assert.equal(config.token,credentials.mcp_token);
  const projects=await (await fetch(`${base}/api/projects`,{headers})).json();
  assert.equal(projects.length,1);assert.equal(projects[0].name,'My first paper');
  const backup=run('scripts/backup.mjs');assert.equal(backup.status,0,backup.stderr);
  const snapshot=new DatabaseSync(backup.stdout.trim(),{readOnly:true});
  try{assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(snapshot.prepare('SELECT count(*) n FROM projects').get().n,1)}finally{snapshot.close()}
  server.kill();await closed;
  await start();
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'access.json'),'utf8')),credentials);
  assert.equal((await fetch(`${base}/api/projects`,{headers})).status,401);
  const reset=run('scripts/account.mjs','--reset-token');assert.equal(reset.status,0,reset.stderr);
  const rotated=JSON.parse(reset.stdout);assert.notEqual(rotated.mcp_token,credentials.mcp_token);assert.equal(rotated.password,credentials.password);
  server.kill();await closed;
  await start();
  assert.equal((await fetch(`${base}/api/projects`,{headers:{Authorization:`Bearer ${credentials.mcp_token}`}})).status,401);
  assert.equal((await fetch(`${base}/api/projects`,{headers:{Authorization:`Bearer ${rotated.mcp_token}`}})).status,200);
 }finally{
  if(server&&server.exitCode===null){server.kill();await closed}
  rmSync(directory,{recursive:true,force:true});
 }
});

test('configuration rejects invalid ports and public URLs before creating data',()=>{
 for(const invalid of [{PORT:'0'},{PORT:'abc'},{PUBLIC_URL:'https://tex.example.org/private'},{PUBLIC_URL:'https://user:secret@tex.example.org'}]){
  const result=spawnSync(process.execPath,['--input-type=module','-e',"import './server/config.mjs'"],{cwd:root,env:{...process.env,PORT:'17882',PUBLIC_URL:'',...invalid},encoding:'utf8'});
  assert.notEqual(result.status,0);
 }
});
