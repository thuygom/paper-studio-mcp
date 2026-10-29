// Browser regression: PLAYWRIGHT_MODULE and CHROMIUM_PATH select the locally installed browser driver.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const credentials=JSON.parse(readFileSync(process.env.STUDIO_ACCESS_FILE||new URL('../private/access.json',import.meta.url)));
const origin=process.env.STUDIO_URL||'http://127.0.0.1:17882';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:950},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let id;
async function api(path,method='GET',data){const r=await page.request.fetch(origin+path,{method,data});assert.ok(r.ok(),`${method} ${path}: ${r.status()}`);return r.json();}
const selected=()=>page.evaluate(()=>window.getSelection()?.toString());
const focused=()=>page.evaluate(()=>document.activeElement?.classList.contains('cm-content'));
try{
 await page.goto(origin);await page.getByLabel('Email',{exact:true}).fill(credentials.email);await page.getByLabel('Password',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'Open workspace'}).click();await page.getByRole('button',{name:'All papers',exact:true}).waitFor();
 const p=await api('/api/projects','POST',{name:'Editor interaction QA',starter:false});id=p.id;
 const original='alpha beta gamma\nsecond line text\n한글 선택 테스트\nlast line';await api(`/api/projects/${id}/file`,'PUT',{path:'main.tex',content:original,expectedRevision:null});
 await page.getByRole('button',{name:'All papers',exact:true}).click();await page.getByRole('button',{name:/Editor interaction QA/}).click();const source=page.getByRole('textbox',{name:'LaTeX source editor'});await source.waitFor();await source.click();await page.keyboard.press('Control+Home');
 for(let i=0;i<5;i++)await page.keyboard.press('Shift+ArrowRight');assert.equal(await selected(),'alpha');await page.waitForFunction(()=>document.querySelectorAll('.cm-selectionBackground').length>0);
 await page.keyboard.press('Control+Home');await page.keyboard.press('Shift+ArrowDown');assert.equal(await selected(),'alpha beta gamma\n');await page.keyboard.press('Shift+ArrowUp');assert.equal(await selected(),'');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');assert.equal(await selected(),'한글');
 const points=await source.evaluate(el=>{const text=el.querySelector('.cm-line').firstChild;return [0,10].map(offset=>{const range=document.createRange();range.setStart(text,offset);range.collapse(true);const r=range.getBoundingClientRect();return {x:r.x+.1,y:r.y+r.height/2}})});
 await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:12});await page.mouse.up();assert.equal(await selected(),'alpha beta');
 await page.getByRole('button',{name:'Bold',exact:true}).click();assert.equal(await source.innerText(),'\\textbf{alpha beta} gamma\nsecond line text\n한글 선택 테스트\nlast line');assert.equal(await selected(),'alpha beta');assert.equal(await focused(),true);await page.keyboard.press('Shift+ArrowRight');assert.equal(await selected(),'alpha beta}');
 await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await source.innerText(),original);assert.equal(await focused(),true);await page.getByRole('button',{name:'Redo',exact:true}).click();assert.ok((await source.innerText()).startsWith('\\textbf{alpha beta}'));assert.equal(await focused(),true);await page.keyboard.press('Control+z');assert.equal(await source.innerText(),original);
 await page.keyboard.press('Control+Home');for(let i=0;i<5;i++)await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Control+i');assert.ok((await source.innerText()).startsWith('\\textit{alpha} beta'));assert.equal(await selected(),'alpha');await page.keyboard.press('Control+z');assert.equal(await source.innerText(),original);await page.keyboard.press('Control+b');assert.ok((await source.innerText()).startsWith('\\textbf{alpha} beta'));await page.keyboard.press('Control+z');
 await page.keyboard.press('Control+Home');await page.keyboard.press('Tab');assert.ok((await source.innerText()).startsWith('  alpha'));await page.keyboard.press('Shift+Tab');assert.equal(await source.innerText(),original);
 await page.keyboard.press('Control+Home');for(let i=0;i<5;i++)await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Control+c');await page.waitForFunction(async()=>await navigator.clipboard.readText()==='alpha');await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.press('Control+v');await page.waitForFunction(()=>document.querySelector('.cm-content').innerText.endsWith('\nalpha'));await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+Z');assert.ok((await source.innerText()).endsWith('\nalpha'));
 await page.keyboard.press('Control+f');const search=page.getByRole('textbox',{name:'Find',exact:true});await search.waitFor();await search.fill('second');await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await focused(),true);
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.source-footer')?.textContent.includes('Saved'));assert.equal((await api(`/api/projects/${id}/file?path=main.tex`)).content,await source.innerText());
 // A delayed read of our own prior revision must not conflict with or replace a newer local save.
 const fileRoute=`**/api/projects/${id}/file?path=main.tex`;let releaseSnapshot,markReady,markReplayed,held=false;
 const snapshotGate=new Promise(resolve=>releaseSnapshot=resolve),snapshotReady=new Promise(resolve=>markReady=resolve),snapshotReplayed=new Promise(resolve=>markReplayed=resolve);
 const delayedRead=async route=>{if(route.request().method()==='GET'&&!held){held=true;const response=await route.fetch();markReady();await snapshotGate;await route.fulfill({response});markReplayed();}else await route.continue();};
 await page.route(fileRoute,delayedRead);
 try{
  await api(`/api/projects/${id}`,'PATCH',{name:'Editor interaction QA saved'});await snapshotReady;
  await source.click();await page.keyboard.press('Control+End');await page.keyboard.type('x');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.source-footer')?.textContent.includes('Saved'));
  await page.keyboard.type('y');releaseSnapshot();await snapshotReplayed;await page.waitForTimeout(100);assert.equal((await page.locator('.source-footer').innerText()).includes('Conflict'),false);
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.source-footer')?.textContent.includes('Saved'));assert.ok((await api(`/api/projects/${id}/file?path=main.tex`)).content.endsWith('alphaxy'));
 }finally{releaseSnapshot();await page.unroute(fileRoute,delayedRead);}
 // A real external edit remains protected until the writer explicitly chooses the local version.
 const server=await api(`/api/projects/${id}/file?path=main.tex`);await page.keyboard.press('Control+End');await page.keyboard.type(' local conflict draft');
 const external=await api(`/api/projects/${id}/file`,'PUT',{path:'main.tex',content:server.content+' external update',expectedRevision:server.revision});await page.getByRole('button',{name:'Keep my edits',exact:true}).waitFor();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Keep my edits',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.source-footer')?.textContent.includes('Saved'));
 assert.ok((await api(`/api/projects/${id}/file?path=main.tex`)).content.endsWith(' local conflict draft'));assert.ok((await api(`/api/projects/${id}/history?path=main.tex`)).some(entry=>entry.revision===external.revision));await source.click();
 // CodeMirror's default Mod-Enter inserts a blank line; the app's compile shortcut must override it.
 const before=await source.innerText();let compileRequests=0;const route='**/api/projects/*/compile';await page.route(route,request=>{compileRequests++;return request.fulfill({status:200,contentType:'application/json',body:JSON.stringify({project:id,status:'error',root:'main.tex',engine:'pdflatex',createdAt:new Date().toISOString(),log:'Keyboard shortcut check'})})});const response=page.waitForResponse(r=>r.url().endsWith('/compile'));await page.keyboard.press('Control+Enter');await response;assert.equal(compileRequests,1);assert.equal(await source.innerText(),before);await page.unroute(route);
 assert.deepEqual(errors,[]);console.log('PASS mouse/Shift/Unicode selection, toolbar focus/selection, formatting, undo/redo, indentation, clipboard, search, save/compile shortcuts, delayed self-save synchronization and protected conflict recovery');
}finally{if(id)await page.request.delete(`${origin}/api/projects/${id}`).catch(()=>{});await browser.close();}
