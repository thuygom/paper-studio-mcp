import { DatabaseSync } from 'node:sqlite';
import {documentCandidates} from '../shared/documents.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {runDocker} from './compiler.mjs';
import { EventEmitter } from 'node:events';
import yazl from 'yazl';
import yauzl from 'yauzl';

export function fail(message, status=400) { throw Object.assign(new Error(message), {status}); }
export function safePath(value) {
  if (typeof value !== 'string' || !value || value.length>512 || value.includes('\\') || /[\x00-\x1f]/.test(value) || value.startsWith('/') || value.split('/').some(p=>!p || p==='.' || p==='..') || value.startsWith('-')) fail('Invalid relative file path');
  return value;
}
const sha = b => createHash('sha256').update(b).digest('hex');
const now = () => new Date().toISOString();
export function createService(dataDir) {
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const db = new DatabaseSync(resolve(dataDir,'studio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,engine TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files(project TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,path TEXT NOT NULL,data BLOB NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(project,path));
    CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,project TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,path TEXT NOT NULL,data BLOB NOT NULL,revision TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS builds(id TEXT PRIMARY KEY,project TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,status TEXT NOT NULL,log TEXT NOT NULL,createdAt TEXT NOT NULL);`);
  const events=new EventEmitter(), compiling=new Set();
  const project=id=>db.prepare('SELECT * FROM projects WHERE id=?').get(id) || fail('Project not found',404);
  const emit=(id,details={})=>{db.prepare('UPDATE projects SET updatedAt=? WHERE id=?').run(now(),id);events.emit('change',{projectId:id,at:now(),...details});};
  const row=(id,path)=>{project(id);safePath(path);return db.prepare('SELECT * FROM files WHERE project=? AND path=?').get(id,path);};
  const checkPathCollision=(id,path,ignore)=>{for(const f of db.prepare('SELECT path FROM files WHERE project=?').all(id)){if(f.path!==ignore&&(f.path.startsWith(path+'/')||path.startsWith(f.path+'/')))fail('A file conflicts with this folder path',409);}};
  const check=(r,expected)=>{if(expected===undefined)fail('expectedRevision is required',428);if((r?.revision??null)!==expected)fail('File changed; read the latest revision before saving',409);};
  const archive=(r)=>{if(r)db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(randomUUID(),r.project,r.path,r.data,r.revision,now());};
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  const service={events,db,
    listProjects:()=>db.prepare('SELECT * FROM projects ORDER BY updatedAt DESC').all(),
    getProject:project,
    createProject({name='Untitled paper',starter=true}={}){if(typeof name!=='string'||!name.trim()||name.length>200)fail('Invalid project name');const id=randomUUID(),time=now();db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(id,name.trim(),'main.tex','pdflatex',time,time);if(starter)this.writeFile(id,{path:'main.tex',content:'\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\title{Untitled Paper}\n\\author{Your Name}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nWrite your abstract here.\n\\end{abstract}\n\\section{Introduction}\nStart writing your paper here.\n\\end{document}\n',expectedRevision:null});return project(id);},
    updateProject(id,{name,root,engine}){const p=project(id);if(name!==undefined&&(typeof name!=='string'||!name.trim()||name.length>200))fail('Invalid project name');if(root!==undefined){safePath(root);if(!root.endsWith('.tex'))fail('Root must be a .tex file');}if(engine!==undefined&&!['pdflatex','xelatex','lualatex'].includes(engine))fail('Unsupported compiler');db.prepare('UPDATE projects SET name=?,root=?,engine=?,updatedAt=? WHERE id=?').run(name?.trim()??p.name,root??p.root,engine??p.engine,now(),id);emit(id);return project(id);},
    deleteProject(id){project(id);if(compiling.has(id))fail('Wait for compilation before deleting this project',409);const builds=db.prepare('SELECT id FROM builds WHERE project=?').all(id);db.prepare('DELETE FROM projects WHERE id=?').run(id);for(const b of builds)rmSync(resolve(dataDir,'builds',b.id),{recursive:true,force:true});events.emit('change',{projectId:id,deleted:true,type:'project-deleted'});return {deleted:true};},
    listFiles(id){project(id);return db.prepare('SELECT path,length(data) size,revision FROM files WHERE project=? ORDER BY path').all(id);},
    readFile(id,path){const r=row(id,path)||fail('File not found',404),b=Buffer.from(r.data),text=b.toString('utf8'),encoding=Buffer.from(text).equals(b)&&!b.includes(0)?'utf8':'base64';return {path,content:encoding==='utf8'?text:b.toString('base64'),encoding,revision:r.revision};},
    writeFile(id,{path,content,encoding='utf8',expectedRevision}){if(typeof content!=='string'||!['utf8','base64'].includes(encoding))fail('Invalid file content');if(encoding==='base64'&&(content.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(content)||/\s/.test(content)))fail('Invalid base64 content');const b=Buffer.from(content,encoding);if(b.length>20*1024*1024)fail('File exceeds 20 MiB',413);return transaction(()=>{const r=row(id,path);check(r,expectedRevision);checkPathCollision(id,path,path);const usage=db.prepare('SELECT count(*) count,coalesce(sum(length(data)),0) bytes FROM files WHERE project=?').get(id);if(usage.bytes-(r?.data.length||0)+b.length>100*1024*1024||(!r&&usage.count>=1000))fail('Project limit is 100 MiB and 1000 files',413);archive(r);const revision=sha(b);db.prepare('INSERT INTO files VALUES(?,?,?,?) ON CONFLICT(project,path) DO UPDATE SET data=excluded.data,revision=excluded.revision').run(id,path,b,revision);emit(id,{type:'file-written',path,revision});return {path,revision,size:b.length};});},
    renameFile(id,{path,to,expectedRevision}){safePath(to);return transaction(()=>{const r=row(id,path)||fail('File not found',404);check(r,expectedRevision);if(row(id,to))fail('Destination already exists',409);checkPathCollision(id,to,path);archive(r);db.prepare('UPDATE files SET path=? WHERE project=? AND path=?').run(to,id,path);if(project(id).root===path)db.prepare('UPDATE projects SET root=? WHERE id=?').run(to,id);emit(id,{type:'file-renamed',path:to,previousPath:path,revision:r.revision});return {path:to,revision:r.revision};});},
    deleteFile(id,{path,expectedRevision}){return transaction(()=>{const r=row(id,path)||fail('File not found',404);check(r,expectedRevision);archive(r);db.prepare('DELETE FROM files WHERE project=? AND path=?').run(id,path);emit(id,{type:'file-deleted',path});return {deleted:true};});},
    replaceText(id,{path,search,replacement,expectedRevision,dryRun=false}){if(typeof search!=='string'||!search||typeof replacement!=='string')fail('Nonempty search and replacement text required');const f=this.readFile(id,path);if(f.encoding!=='utf8')fail('Cannot edit binary file');check(f,expectedRevision);const first=f.content.indexOf(search);if(first<0||f.content.indexOf(search,first+1)>=0)fail('Search must match exactly once',409);const content=f.content.slice(0,first)+replacement+f.content.slice(first+search.length);return dryRun?{...f,content,dryRun:true}:this.writeFile(id,{path,content,expectedRevision});},
    history(id,path){project(id);safePath(path);return db.prepare('SELECT id,path,revision,createdAt FROM history WHERE project=? AND path=? ORDER BY createdAt DESC').all(id,path);},
    restore(id,{path,historyId,expectedRevision}){project(id);const h=db.prepare('SELECT * FROM history WHERE id=? AND project=? AND path=?').get(historyId,id,path)||fail('History entry not found',404);return this.writeFile(id,{path,content:Buffer.from(h.data).toString('base64'),encoding:'base64',expectedRevision});},
    async exportZip(id){project(id);const zip=new yazl.ZipFile();for(const r of db.prepare('SELECT * FROM files WHERE project=?').all(id))zip.addBuffer(Buffer.from(r.data),r.path);zip.end();const chunks=[];for await(const chunk of zip.outputStream)chunks.push(chunk);return Buffer.concat(chunks);},
    async importZip({name,base64}){if(typeof base64!=='string')fail('base64 ZIP required');const data=Buffer.from(base64,'base64');if(data.length>40*1024*1024)fail('ZIP exceeds 40 MiB',413);const entries=await new Promise((res,rej)=>yauzl.fromBuffer(data,{lazyEntries:true},(err,zip)=>{if(err)return rej(err);const result=[];let total=0;zip.on('error',rej);zip.on('end',()=>res(result));zip.on('entry',entry=>{try{if(entry.fileName.endsWith('/'))return zip.readEntry();safePath(entry.fileName);if(((entry.externalFileAttributes>>>16)&0o170000)===0o120000)fail('Symlinks are not allowed');total+=entry.uncompressedSize;if(total>100*1024*1024||result.length>=1000)fail('ZIP too large');zip.openReadStream(entry,(e,s)=>{if(e)return rej(e);const chunks=[];s.on('error',rej);s.on('data',c=>chunks.push(c));s.on('end',()=>{result.push({path:entry.fileName,data:Buffer.concat(chunks)});zip.readEntry();});});}catch(e){zip.close();rej(e);}});zip.readEntry();})).catch(e=>fail('Invalid ZIP archive: '+e.message,e.status||400));const imported=entries.filter(f=>!f.path.startsWith('__MACOSX/')&&f.path.split('/').at(-1)!=='.DS_Store');
      while(imported.length&&imported.every(f=>f.path.startsWith(imported[0].path.split('/')[0]+'/'))){const prefix=imported[0].path.split('/')[0]+'/';for(const f of imported)f.path=f.path.slice(prefix.length);}
      if(new Set(imported.map(f=>f.path)).size!==imported.length)fail('ZIP contains duplicate file paths');
      const candidates=documentCandidates(imported.filter(f=>f.path.endsWith('.tex')).map(f=>({path:f.path,content:f.data.toString('utf8')})));
      if(!candidates.length)fail('ZIP has no complete LaTeX document. Upload supporting files into an existing project.');
      const p=this.createProject({name,starter:false});try{for(const f of imported)this.writeFile(p.id,{path:f.path,content:f.data.toString('base64'),encoding:'base64',expectedRevision:null});this.updateProject(p.id,{root:candidates[0].path,engine:candidates[0].engine});return project(p.id);}catch(e){this.deleteProject(p.id);throw e;}},
    latestBuild(id){project(id);const b=db.prepare('SELECT * FROM builds WHERE project=? ORDER BY createdAt DESC LIMIT 1').get(id);return b?this.buildInfo(b):null;},
    buildInfo(b){const snapshotPath=resolve(dataDir,'builds',b.id,'snapshot.json');const snapshot=existsSync(snapshotPath)?JSON.parse(readFileSync(snapshotPath,'utf8')):{};return {...b,...snapshot,pdfUrl:b.status==='success'?`/api/projects/${b.project}/builds/${b.id}/pdf`:null};},
    getPdf(id,buildId){project(id);const b=db.prepare('SELECT * FROM builds WHERE id=? AND project=?').get(buildId,id)||fail('Build not found',404);if(b.status!=='success')fail('No PDF available',404);return readFileSync(resolve(dataDir,'builds',b.id,'output.pdf'));},
    async compile(id){
      const p=project(id);
      if(compiling.has(id))fail('Compilation already running',409);
      if(compiling.size>=2)fail('Two compilations are already running; retry shortly',429);
      if(!row(id,p.root))fail('Root file does not exist');
      compiling.add(id);
      const buildId=randomUUID(),dir=resolve(dataDir,'builds',buildId);
      try{
        mkdirSync(dir,{recursive:true});
        const files=db.prepare('SELECT * FROM files WHERE project=?').all(id);
        writeFileSync(resolve(dir,'snapshot.json'),JSON.stringify({root:p.root,engine:p.engine,revisions:Object.fromEntries(files.map(f=>[f.path,f.revision]))}));
        const output=await runDocker(files,p,buildId);
        const status=output.code===0&&output.pdf?'success':'error';
        if(status==='success')writeFileSync(resolve(dir,'output.pdf'),output.pdf);
        const b={id:buildId,project:id,status,log:output.log,createdAt:now()};
        db.prepare('INSERT INTO builds VALUES(?,?,?,?,?)').run(b.id,id,status,b.log,b.createdAt);
        emit(id,{type:'build-finished',buildId});return this.buildInfo(b);
      }finally{compiling.delete(id)}
    }
  };return service;
}
