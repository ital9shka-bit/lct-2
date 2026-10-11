import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const opts={output:'implementation/.env',origin:'http://localhost:8088',port:'8088','mail-port':'8089','keycloak-port':'8090'};
for(const arg of process.argv.slice(2)){
  if(arg==='--keycloak'){opts.keycloak=true;continue;}
  const match=/^--(output|origin|port|mail-port|keycloak-port)=(.+)$/.exec(arg);
  if(!match)throw new Error('Unknown option: '+arg);
  opts[match[1]]=match[2];
}
const output=resolve(root,opts.output);
const origin=new URL(opts.origin);
if(!['http:','https:'].includes(origin.protocol))throw new Error('Invalid origin');
for(const key of ['port','mail-port','keycloak-port'])if(!/^\d+$/.test(opts[key])||+opts[key]<1||+opts[key]>65535)throw new Error('Invalid port: '+key);
try{await readFile(output);console.log('Configuration exists; kept unchanged.');process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const values={APP_ORIGIN:origin.origin,APP_PORT:opts.port,MAILPIT_PORT:opts['mail-port'],APP_SECRET:randomBytes(32).toString('hex'),POSTGRES_PASSWORD:randomBytes(32).toString('hex')};
if(opts.keycloak){
  const sso=new URL(origin.origin);sso.port=opts['keycloak-port'];
  Object.assign(values,{AUTH_MODE:'keycloak',OIDC_ISSUER:sso.origin+'/sso/realms/oop-demo',OIDC_INTERNAL_ISSUER:'http://keycloak:8080/sso/realms/oop-demo',OIDC_CLIENT_SECRET:randomBytes(32).toString('hex'),KEYCLOAK_HOSTNAME:sso.origin+'/sso',KEYCLOAK_PORT:opts['keycloak-port'],KEYCLOAK_DB_PASSWORD:randomBytes(32).toString('hex'),KEYCLOAK_ADMIN_PASSWORD:randomBytes(32).toString('hex'),KEYCLOAK_REVIEWER_PASSWORD:randomBytes(32).toString('hex')});
}
let text=await readFile(new URL('../.env.example',import.meta.url),'utf8');
for(const [key,value] of Object.entries(values))text=text.replace(new RegExp('^'+key+'=.*$','m'),key+'='+value);
await mkdir(dirname(output),{recursive:true,mode:0o700});
await writeFile(output,text,{flag:'wx',mode:0o600});
if(opts.keycloak)execFileSync(process.execPath,[fileURLToPath(new URL('./generate-keycloak-realm.mjs',import.meta.url))],{env:{...process.env,...values},stdio:'inherit'});
console.log('Local demo configuration generated; credentials are not printed.');
