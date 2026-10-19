import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {accessPath,loadCredentials} from '../server/config.mjs';
const option=process.argv[2];
if(option&&!['--reset-password','--reset-token'].includes(option))throw new Error('Usage: node scripts/account.mjs [--reset-password|--reset-token]');
const value=loadCredentials();
if(option){
  const key=option==='--reset-password'?'password':'mcp_token';
  value[key]=randomBytes(32).toString('base64url');
  writeFileSync(accessPath,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  console.error('Restart Paper Studio to apply the new credential and invalidate sessions.');
}
console.log(JSON.stringify(value,null,2));
