// Explicit integration check against this instance; creates and removes its own project.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {loadCredentials,port} from '../server/config.mjs';
import assert from 'node:assert/strict';
const token=process.env.MCP_TOKEN||loadCredentials().mcp_token;
const url=process.env.MCP_URL||`http://127.0.0.1:${port}/mcp`;
const c=new Client({name:'paper-studio-integration',version:'1.0'});
const transport=process.env.MCP_TRANSPORT==='stdio'
 ?new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../scripts/mcp-stdio.mjs',import.meta.url))],env:{...process.env,MCP_TOKEN:token,MCP_URL:url}})
 :new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}});
await c.connect(transport);
const results=[];
async function call(name,args={}){const r=await c.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));results.push(name);return JSON.parse(r.content[0].text);}
let p,copy,toolCount;
try{
 const tools=(await c.listTools()).tools;toolCount=tools.length;assert.equal(tools.length,19);
 p=await call('create_project',{name:'Integration check'});
 assert.ok((await call('list_projects')).some(x=>x.id===p.id));
 assert.equal((await call('get_project',{projectId:p.id})).root,'main.tex');
 await call('update_project',{projectId:p.id,name:'Integration check renamed',engine:'pdflatex'});
 const f=await call('read_file',{projectId:p.id,path:'main.tex'});
 const dry=await call('replace_text',{projectId:p.id,path:'main.tex',search:'Untitled Paper',replacement:'MCP Verified Paper',expectedRevision:f.revision,dryRun:true});assert.match(dry.content,/MCP Verified Paper/);
 const edited=await call('replace_text',{projectId:p.id,path:'main.tex',search:'Untitled Paper',replacement:'MCP Verified Paper',expectedRevision:f.revision});
 const stale=await c.callTool({name:'write_file',arguments:{projectId:p.id,path:'main.tex',content:'Must never overwrite',expectedRevision:f.revision}});assert.equal(stale.isError,true);assert.equal(JSON.parse(stale.content[0].text).status,409);
 await call('write_file',{projectId:p.id,path:'sections/notes.tex',content:'% Notes\n',expectedRevision:null});
 const note=await call('read_file',{projectId:p.id,path:'sections/notes.tex'});
 await call('rename_file',{projectId:p.id,path:note.path,to:'notes.tex',expectedRevision:note.revision});
 assert.equal((await call('search_files',{projectId:p.id,query:'MCP Verified'})).length,1);
 const build=await call('compile_project',{projectId:p.id});assert.equal(build.status,'success',build.log.slice(-3000));
 assert.equal((await call('latest_build',{projectId:p.id})).id,build.id);
 const pdf=await call('read_pdf',{projectId:p.id,buildId:build.id});assert.ok(Buffer.from(pdf.content,'base64').subarray(0,5).equals(Buffer.from('%PDF-')));
 const history=await call('file_history',{projectId:p.id,path:'main.tex'});assert.equal(history.length,1);
 await call('restore_file',{projectId:p.id,path:'main.tex',historyId:history[0].id,expectedRevision:edited.revision});
 const zip=await call('export_project',{projectId:p.id});copy=await call('import_project',{name:'Integration import',base64:zip.content});assert.equal((await call('list_files',{projectId:copy.id})).length,2);
 await call('delete_file',{projectId:p.id,path:'notes.tex',expectedRevision:note.revision});
 for(const engine of ['xelatex','lualatex']){
  const source=engine==='xelatex'
   ?String.raw`\documentclass{article}\usepackage{kotex}\setmainhangulfont{Noto Serif CJK KR}\begin{document}한국어 논문과 English paper.\end{document}`
   :String.raw`\documentclass{article}\begin{document}LuaLaTeX compilation.\end{document}`;
  await call('write_file',{projectId:p.id,path:`engines/${engine}.tex`,content:source,expectedRevision:null});
  await call('update_project',{projectId:p.id,root:`engines/${engine}.tex`,engine});
  const compiled=await call('compile_project',{projectId:p.id});assert.equal(compiled.status,'success',compiled.log.slice(-3000));
 }
 await call('write_file',{projectId:p.id,path:'bad.tex',content:String.raw`\documentclass{article}\begin{document}\undefinedTestCommand\end{document}`,expectedRevision:null});
 await call('update_project',{projectId:p.id,root:'bad.tex',engine:'pdflatex'});
 const failed=await call('compile_project',{projectId:p.id});assert.equal(failed.status,'error');assert.match(failed.log,/Undefined control sequence/);assert.equal(failed.pdfUrl,null);
}finally{for(const project of [copy,p])if(project)await call('delete_project',{projectId:project.id});await c.close();}

assert.equal(new Set(results).size,19);
console.log(`PASS (${process.env.MCP_TRANSPORT||'http'}): ${toolCount} tools, ${results.length} operations, stale edit rejected, three TeX engines, Korean PDF, failed-build log, ZIP roundtrip, cleanup.`);
