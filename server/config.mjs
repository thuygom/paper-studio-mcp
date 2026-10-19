import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const privateDir=resolve(root,process.env.PRIVATE_DIR||'private');
export const accessPath=resolve(privateDir,'access.json');
export const port=Number(process.env.PORT||17882);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535');
export const host=process.env.HOST||'127.0.0.1';
export const publicUrl=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
if(publicUrl){
  const url=new URL(publicUrl);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==publicUrl)throw new Error('PUBLIC_URL must be an http(s) origin without credentials, path, query or fragment');
}
export function loadCredentials(){
  mkdirSync(privateDir,{recursive:true,mode:0o700});
  chmodSync(privateDir,0o700);
  if(!existsSync(accessPath)){
    const email=process.env.OWNER_EMAIL||'owner@example.com';
    if(!/^[^\s@]+@[^\s@]+$/.test(email))throw new Error('OWNER_EMAIL must be an email address');
    writeFileSync(accessPath,JSON.stringify({email,password:randomBytes(24).toString('base64url'),mcp_token:randomBytes(32).toString('base64url')},null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  chmodSync(accessPath,0o600);
  const value=JSON.parse(readFileSync(accessPath,'utf8'));
  if(!value.email||typeof value.password!=='string'||value.password.length<12||typeof value.mcp_token!=='string'||value.mcp_token.length<32)throw new Error('Invalid private/access.json; restore your account file or reset its credentials');
  return value;
}
