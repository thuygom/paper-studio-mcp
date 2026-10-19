import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import yazl from 'yazl';
import yauzl from 'yauzl';

const exec=promisify(execFile);
const MAX_RESULT=65*1024*1024;
function readResult(buffer){
  return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true},(err,zip)=>{
    if(err)return reject(err);
    const files=new Map();let total=0;
    zip.on('error',reject);
    zip.on('end',()=>{
      const status=files.get('status')?.toString().trim();
      if(!/^\d{1,3}$/.test(status||''))return reject(new Error('Missing compiler exit status'));
      const pdf=files.get('output.pdf');
      if(pdf&&!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))return reject(new Error('Compiler output is not a PDF'));
      resolve({code:Number(status),log:(files.get('compile.log')?.toString()||'').slice(-300000),pdf});
    });
    zip.on('entry',entry=>{
      total+=entry.uncompressedSize;
      if(!['status','compile.log','output.pdf'].includes(entry.fileName)||files.has(entry.fileName)||total>MAX_RESULT){zip.close();return reject(new Error('Invalid compiler result archive'));}
      files.set(entry.fileName,null);
      zip.openReadStream(entry,(error,stream)=>{
        if(error){zip.close();return reject(error);}
        const chunks=[];stream.on('error',reject);
        stream.on('data',chunk=>chunks.push(chunk));
        stream.on('end',()=>{files.set(entry.fileName,Buffer.concat(chunks));zip.readEntry()});
      });
    });
    zip.readEntry();
  }));
}

export async function runDocker(files,project,id){
  const archive=new yazl.ZipFile();
  for(const file of files)archive.addBuffer(Buffer.from(file.data),file.path);
  archive.end();
  const name=`paper-studio-build-${id}`;
  // Stream only this snapshot; Docker Desktop and remote daemons need no host-path mapping.
  const args=['run','--rm','-i','--name',name,'--network','none','--read-only','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','768m','--cpus','1','--pids-limit','128',
    '--ulimit','fsize=52428800:52428800','--user','65532:65532',
    '--tmpfs','/tmp:rw,nosuid,nodev,size=128m,mode=1777','--tmpfs','/work:rw,nosuid,nodev,size=256m,mode=1777',
    '-e','HOME=/tmp','-e','TEXMFCACHE=/tmp','-e','TEXMFVAR=/tmp',
    process.env.TEX_IMAGE||'paper-studio-mcp-tex:local',project.engine,project.root];
  try{
    const output=await new Promise(resolve=>{
      const child=spawn('docker',args);const chunks=[];let bytes=0,log='',failure='';
      const timer=setTimeout(()=>{failure='Compilation timed out after 90 seconds';child.kill('SIGKILL')},90000);
      child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_RESULT){failure='Compiler output exceeds 65 MiB';child.kill('SIGKILL')}else chunks.push(chunk)});
      child.stderr.on('data',chunk=>{log=(log+chunk).slice(-300000)});
      child.stdin.on('error',()=>{});
      archive.outputStream.on('error',error=>{failure=error.message;child.kill('SIGKILL')});
      archive.outputStream.pipe(child.stdin);
      child.on('error',error=>{failure=error.message});
      child.on('close',code=>{clearTimeout(timer);archive.outputStream.destroy();resolve({code:failure?1:code,log:failure||log,buffer:Buffer.concat(chunks)})});
    });
    if(output.code!==0)return {code:1,log:output.log||'Docker compilation failed'};
    return await readResult(output.buffer);
  }catch(error){return {code:1,log:`Compilation failed: ${error.message}`};}
  finally{
    // A killed Docker client can leave its container running on the daemon.
    await exec('docker',['rm','-f',name],{timeout:10000}).catch(()=>{});
  }
}
