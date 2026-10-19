import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {privateDir} from '../server/config.mjs';
const source=resolve(privateDir,'data/studio.sqlite');
if(!existsSync(source))throw new Error('No database exists; start Paper Studio first');
const directory=resolve(privateDir,'backups');mkdirSync(directory,{recursive:true,mode:0o700});
const target=resolve(directory,new Date().toISOString().replaceAll(':','-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);chmodSync(target,0o600);console.log(target)}finally{db.close()}
