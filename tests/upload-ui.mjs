// Run with PLAYWRIGHT_MODULE, CHROMIUM_PATH, STUDIO_URL and STUDIO_ACCESS_FILE for the installation under test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import yazl from 'yazl';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const credentials=JSON.parse(readFileSync(process.env.STUDIO_ACCESS_FILE||new URL('../private/access.json',import.meta.url)));
const origin=process.env.STUDIO_URL||'http://127.0.0.1:17882';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:950}}),ids=new Set(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const document=(text,unicode=false)=>`\\documentclass{article}\n${unicode?'\\usepackage{fontspec}\n\\setmainfont{Tinos}\n':''}\\begin{document}\n${text}\n\\end{document}`;
async function api(path,method='GET',data){const response=await page.request.fetch(origin+path,{method,data});assert.ok(response.ok(),`${method} ${path}: ${response.status()}`);return response.json();}
async function choose(files){await page.locator('input[type=file][multiple]').setInputFiles(files);await page.getByRole('dialog',{name:'Upload files',exact:true}).waitFor();return page.getByRole('dialog',{name:'Upload files',exact:true});}
async function submit(dialog){await dialog.getByRole('button',{name:'Upload files',exact:true}).click();await dialog.waitFor({state:'hidden'});}
async function compile(){const response=page.waitForResponse(r=>r.url().endsWith('/compile')&&r.request().method()==='POST',{timeout:120000});await page.getByRole('button',{name:/^Recompile/}).click();const build=await (await response).json();assert.equal(build.status,'success',build.log?.slice(-1500));await page.locator('iframe[title="Compiled paper PDF"]').waitFor();return build;}
try{
 await page.goto(origin);await page.getByLabel('Email',{exact:true}).fill(credentials.email);await page.getByLabel('Password',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'Open workspace'}).click();await page.getByRole('button',{name:'Project settings',exact:true}).waitFor();
 const baseline=await api('/api/projects','POST',{name:'Upload QA original'});ids.add(baseline.id);
 await page.getByRole('button',{name:'All papers',exact:true}).click();await page.getByRole('button',{name:/Upload QA original/}).click();await page.getByRole('textbox',{name:'LaTeX source editor'}).waitFor();
 let dialog=await choose({name:'meeting.tex',mimeType:'application/x-tex',buffer:Buffer.from(document('Standalone upload',true))});
 assert.equal(await dialog.getByLabel('Destination').inputValue(),'new');assert.equal(await dialog.getByLabel('Main document').inputValue(),'meeting.tex');assert.equal(await dialog.getByLabel('LaTeX engine').inputValue(),'xelatex');
 await dialog.getByLabel('Paper title').fill('Upload QA standalone');
 const created=page.waitForResponse(r=>r.url().endsWith('/api/projects')&&r.request().method()==='POST');await submit(dialog);const paper=await (await created).json();ids.add(paper.id);
 assert.notEqual(paper.id,baseline.id);let settings=await api(`/api/projects/${paper.id}`);assert.equal(settings.root,'meeting.tex');assert.equal(settings.engine,'xelatex');assert.equal((await api(`/api/projects/${baseline.id}`)).root,'main.tex');
 await compile();
 dialog=await choose([{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('original notes')},{name:'fragment.tex',mimeType:'application/x-tex',buffer:Buffer.from('\\section{Supporting text}')}]);assert.equal(await dialog.getByLabel('Destination').inputValue(),'current');await submit(dialog);
 assert.equal((await api(`/api/projects/${paper.id}`)).root,'meeting.tex');
 dialog=await choose({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('replacement notes')});await dialog.getByRole('button',{name:'Upload files',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal((await api(`/api/projects/${paper.id}/file?path=notes.txt`)).content,'original notes');await dialog.getByRole('checkbox').check();await submit(dialog);
 assert.equal((await api(`/api/projects/${paper.id}/file?path=notes.txt`)).content,'replacement notes');assert.equal((await api(`/api/projects/${paper.id}/history?path=notes.txt`)).length,1);
 dialog=await choose({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('stale replacement')});await dialog.getByRole('checkbox').check();const f=await api(`/api/projects/${paper.id}/file?path=notes.txt`);await api(`/api/projects/${paper.id}/file`,'PUT',{path:'notes.txt',content:'external edit',expectedRevision:f.revision});await submit(dialog);assert.equal((await api(`/api/projects/${paper.id}/file?path=notes.txt`)).content,'external edit');await page.getByText(/0\/1 files uploaded/).waitFor();
 dialog=await choose({name:'large.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(8*1024*1024,0xfa)});await submit(dialog);assert.equal((await api(`/api/projects/${paper.id}/files`)).find(f=>f.path==='large.bin').size,8*1024*1024);
 const uploadRoute='**/api/projects/*/file',failure=async route=>{const request=route.request();if(request.method()==='PUT'&&['failed.txt','failed.tex'].includes(request.postDataJSON().path))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Simulated interrupted upload'})});return route.continue();};
 await page.route(uploadRoute,failure);
 dialog=await choose([{name:'completed.txt',mimeType:'text/plain',buffer:Buffer.from('uploaded before failure')},{name:'failed.txt',mimeType:'text/plain',buffer:Buffer.from('not uploaded')}]);await submit(dialog);await page.getByText(/1\/2 files uploaded/).waitFor();assert.equal((await api(`/api/projects/${paper.id}/file?path=completed.txt`)).content,'uploaded before failure');assert.equal((await api(`/api/projects/${paper.id}/files`)).some(f=>f.path==='failed.txt'),false);assert.equal((await api(`/api/projects/${paper.id}`)).root,'meeting.tex');
 dialog=await choose({name:'failed.tex',mimeType:'application/x-tex',buffer:Buffer.from(document('Interrupted new paper'))});const failedCreation=page.waitForResponse(r=>r.url().endsWith('/api/projects')&&r.request().method()==='POST');await submit(dialog);const failedProject=await (await failedCreation).json();ids.add(failedProject.id);assert.equal((await page.request.get(`${origin}/api/projects/${failedProject.id}`)).status(),404);await page.unroute(uploadRoute,failure);
 await api(`/api/projects/${paper.id}/file`,'PUT',{path:'alternate.tex',content:document('Alternate document'),expectedRevision:null});await page.locator('.file-row').filter({hasText:'alternate.tex'}).click();await page.getByRole('button',{name:'Use as main',exact:true}).click();await page.getByText('Compile alternate.tex').waitFor();assert.equal(await page.locator('iframe[title="Compiled paper PDF"]').count(),0);settings=await api(`/api/projects/${paper.id}`);assert.equal(settings.root,'alternate.tex');assert.equal(settings.engine,'pdflatex');await compile();
 const archive=new yazl.ZipFile();for(const [path,content] of [['bundle/README.txt','project wrapper'],['bundle/nested/meeting.tex','\\documentclass{article}\n\\begin{document}\\input{piece}\\end{document}'],['bundle/nested/piece.tex','Nested ZIP upload']])archive.addBuffer(Buffer.from(content),path);archive.end();const chunks=[];for await(const chunk of archive.outputStream)chunks.push(chunk);
 const imported=page.waitForResponse(r=>r.url().endsWith('/api/import')&&r.request().method()==='POST');await page.locator('input[type=file][multiple]').setInputFiles({name:'wrapped-project.zip',mimeType:'application/zip',buffer:Buffer.concat(chunks)});const zipProject=await (await imported).json();ids.add(zipProject.id);dialog=page.getByRole('dialog',{name:'Project settings',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('Main document').inputValue(),'nested/meeting.tex');await dialog.getByRole('button',{name:'Save settings'}).click();await dialog.waitFor({state:'hidden'});await compile();
 assert.deepEqual(errors,[]);console.log('PASS standalone/new project, engine inference, assets/fragments, replacement/history, stale revision rejection, large upload, interrupted uploads/cleanup, main switch/PDF invalidation and nested ZIP compilation');
}finally{
 for(const id of ids)await page.request.delete(`${origin}/api/projects/${id}`).catch(()=>{});
 await browser.close();
}
