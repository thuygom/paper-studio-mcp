import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { createService,safePath } from '../server/service.mjs';
test('paper files enforce paths, revisions, history, ZIP roundtrip and project boundaries',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'paper-test-')),s=createService(dir);
 try{
  for(const path of ['../secret','/secret','a/../b','a\\b','a//b','-option','a\0b'])assert.throws(()=>safePath(path));
  const p=s.createProject({name:'Paper'}),other=s.createProject({name:'Other',starter:false});
  let f=s.readFile(p.id,'main.tex');
  assert.throws(()=>s.writeFile(p.id,{path:f.path,content:'oops',expectedRevision:null}),{status:409});
  assert.throws(()=>s.writeFile(p.id,{path:f.path,content:'oops'}),{status:428});
  assert.throws(()=>s.writeFile(p.id,{path:'../x',content:'oops',expectedRevision:null}),{status:400});
  const dry=s.replaceText(p.id,{path:f.path,search:'Untitled Paper',replacement:'A Better Paper',expectedRevision:f.revision,dryRun:true});
  assert.match(dry.content,/A Better Paper/);assert.equal(s.readFile(p.id,f.path).revision,f.revision);
  const saved=s.replaceText(p.id,{path:f.path,search:'Untitled Paper',replacement:'A Better Paper',expectedRevision:f.revision});
  assert.notEqual(saved.revision,f.revision);
  assert.throws(()=>s.replaceText(p.id,{path:f.path,search:'document',replacement:'x',expectedRevision:saved.revision}),{status:409});
  const h=s.history(p.id,f.path);assert.equal(h.length,1);
  assert.throws(()=>s.restore(other.id,{path:f.path,historyId:h[0].id,expectedRevision:null}),{status:404});
  s.restore(p.id,{path:f.path,historyId:h[0].id,expectedRevision:saved.revision});
  assert.equal(s.readFile(p.id,f.path).content,f.content);
  s.renameFile(p.id,{path:'main.tex',to:'paper.tex',expectedRevision:f.revision});assert.equal(s.getProject(p.id).root,'paper.tex');
  assert.throws(()=>s.writeFile(p.id,{path:'paper.tex/nested',content:'x',expectedRevision:null}),{status:409});
  assert.throws(()=>s.writeFile(p.id,{path:'bad.bin',content:'!!not-base64',encoding:'base64',expectedRevision:null}),{status:400});
  const binary=Buffer.from([0,255,127,1]);s.writeFile(p.id,{path:'images/a.bin',content:binary.toString('base64'),encoding:'base64',expectedRevision:null});assert.equal(s.readFile(p.id,'images/a.bin').encoding,'base64');
  const maliciousZip=new yazl.ZipFile();maliciousZip.addBuffer(Buffer.from('bad'),'aa/b.tex');maliciousZip.end();const chunks=[];for await(const c of maliciousZip.outputStream)chunks.push(c);const attack=Buffer.from(Buffer.concat(chunks).toString('latin1').replaceAll('aa/b.tex','../b.tex'),'latin1');await assert.rejects(s.importZip({name:'Bad',base64:attack.toString('base64')}));assert.equal(s.listProjects().length,2);
  const symlinkZip=new yazl.ZipFile();symlinkZip.addBuffer(Buffer.from('/etc/passwd'),'link',{mode:0o120777});symlinkZip.end();const symlinkChunks=[];for await(const c of symlinkZip.outputStream)symlinkChunks.push(c);await assert.rejects(s.importZip({name:'Bad link',base64:Buffer.concat(symlinkChunks).toString('base64')}));
  const zipped=await s.exportZip(p.id),imported=await s.importZip({name:'Imported',base64:zipped.toString('base64')});assert.equal(s.listFiles(imported.id).length,2);assert.equal(s.readFile(imported.id,'paper.tex').content,f.content);
  s.deleteFile(p.id,{path:'paper.tex',expectedRevision:f.revision});assert.throws(()=>s.readFile(p.id,'paper.tex'),{status:404});assert.ok(s.history(p.id,'paper.tex').length);
  s.deleteProject(p.id);assert.throws(()=>s.getProject(p.id),{status:404});assert.equal(s.db.prepare('SELECT count(*) n FROM history WHERE project=?').get(p.id).n,0);
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true});}
});
