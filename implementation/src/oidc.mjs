import {createHash,webcrypto} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {config,token} from './config.mjs';
import {digest,createUser,createSession,legalDocuments} from './auth.mjs';
import {one,audit} from './db.mjs';
import {fail} from './errors.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const stateCookie='oop_oidc_state',cookiePath='/api/v1/auth/oidc';
const roleMap={'oop-talent':'candidate','oop-employer':'employer','oop-reviewer':'reviewer'};
export function oidcIdentity(p,nonce,clientId){
 if(p.nonce!==nonce||p.azp&&p.azp!==clientId)fail(401,'oidc_claims','Не удалось подтвердить ответ SSO.');
 if(typeof p.sub!=='string'||!p.sub||p.email_verified!==true||typeof p.email!=='string'||!/^\S+@\S+\.\S+$/.test(p.email))fail(401,'oidc_identity','SSO должен подтвердить email.');
 const rawRoles=Array.isArray(p.realm_access?.roles)?p.realm_access.roles:[];
 const roles=[...new Set(rawRoles.filter(x=>roleMap[x]).map(x=>roleMap[x]))];
 if(roles.length!==1)fail(403,'oidc_role','В SSO должна быть назначена одна роль ООП.');
 return {subject:p.sub,email:p.email.trim().toLowerCase(),role:roles[0]};
}
export function makeOidcHandlers(settings=config.oidc,{origin=config.origin,enabled=config.authMode==='keycloak'}={}){
 const issuer=settings.issuer.replace(/\/$/,''),back=settings.internalIssuer.replace(/\/$/,''),callback=origin+'/api/v1/auth/oidc/callback';
 let keys;
 const opts={httpOnly:true,secure:origin.startsWith('https://'),sameSite:'lax',path:cookiePath};
 return {
  auth_oidc_login:async c=>{
   if(!enabled)fail(404,'oidc_disabled','Вход через SSO не подключён.');
   if(c.req.query.consent!==legalDocuments[0].version)fail(422,'consent_required','Прочитайте документ регистрации и отметьте согласие.');
   const state=token(),verifier=token(),nonce=token();
   await c.db.query('DELETE FROM oidc_login_states WHERE expires_at<now()');
   await c.db.query('INSERT INTO oidc_login_states(state_hash,verifier,nonce,consent_version) VALUES($1,$2,$3,$4)',[digest(state),verifier,nonce,c.req.query.consent]);
   c.res.cookie(stateCookie,state,{...opts,maxAge:10*60000});
   const url=new URL(issuer+'/protocol/openid-connect/auth');
   for(const [k,v] of Object.entries({client_id:settings.clientId,redirect_uri:callback,response_type:'code',scope:'openid profile email',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'login'}))url.searchParams.set(k,v);
   const hint=c.req.query.login_hint;if(typeof hint==='string'&&hint.length<=254)url.searchParams.set('login_hint',hint);
   return {redirect:url.href};
  },
  auth_oidc_callback:async c=>{
   if(!enabled)fail(404,'oidc_disabled','Вход через SSO не подключён.');
   const state=c.req.query.state,code=c.req.query.code;
   const cookie=c.req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(stateCookie+'='))?.slice(stateCookie.length+1);
   if(typeof state!=='string'||!cookie||state!==cookie)fail(401,'oidc_state','Сессия входа не совпала. Начните вход заново.');
   const flow=await one(c.db,'DELETE FROM oidc_login_states WHERE state_hash=$1 AND expires_at>now() RETURNING *',[digest(state)]);
   if(!flow)fail(401,'oidc_expired','Сессия входа истекла. Начните вход заново.');
   c.res.clearCookie(stateCookie,opts);
   if(c.req.query.error)return {redirect:origin+'/?auth_error=sso_cancelled'};
   if(typeof code!=='string'||code.length>4096)fail(401,'oidc_code','SSO не вернул код входа.');
   const response=await fetch(back+'/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:settings.clientId,client_secret:settings.clientSecret,redirect_uri:callback,code_verifier:flow.verifier,code}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)fail(401,'oidc_exchange','Не удалось подтвердить код SSO. Начните вход заново.');
   const tokens=await response.json();if(typeof tokens.id_token!=='string')fail(401,'oidc_token','SSO не вернул подтверждение личности.');
   keys ||= createRemoteJWKSet(new URL(back+'/protocol/openid-connect/certs'),{timeoutDuration:10000});
   let payload;try{({payload}=await jwtVerify(tokens.id_token,keys,{issuer,audience:settings.clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub','nonce','email'],maxTokenAge:'10m',clockTolerance:5}));}catch{fail(401,'oidc_token','Подпись или срок токена SSO не подтверждены.');}
   const identity=oidcIdentity(payload,flow.nonce,settings.clientId);
   await c.db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['identity:'+identity.email]);
   const linked=await one(c.db,'SELECT u.* FROM auth_identities i JOIN users u ON u.id=i.user_id WHERE i.issuer=$1 AND i.subject=$2',[issuer,identity.subject]);
   const existing=linked||await one(c.db,'SELECT * FROM users WHERE email=$1',[identity.email]);
   if(existing&&(existing.email!==identity.email||existing.role!==identity.role))fail(403,'oidc_role_conflict','Роль SSO не совпадает с существующим профилем.');
   const u=existing||await createUser(c.db,identity.email,identity.role);
   if(u.role!==identity.role)fail(403,'oidc_role_conflict','Роль SSO не совпадает с профилем.');
   await c.db.query('INSERT INTO auth_identities(issuer,subject,user_id) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO NOTHING',[issuer,identity.subject,u.id]);
   if(!existing)await c.db.query("INSERT INTO consents(owner_id,kind,version) VALUES($1,'registration',$2)",[u.id,flow.consent_version]);
   await createSession(c.db,c.req,c.res,u,'keycloak',tokens.id_token);
   await audit(c.db,u.id,'identity.keycloak_linked',u.id);
   return {redirect:origin+'/'};
  }
 };
}
export async function logoutOidc(c){
 const session=await one(c.db,'SELECT auth_provider,oidc_id_token FROM sessions WHERE id=$1',[c.user.session_id]);
 await c.db.query('UPDATE sessions SET revoked_at=now(),oidc_id_token=NULL WHERE id=$1',[c.user.session_id]);
 c.res.clearCookie('oop_session',{path:'/',secure:config.origin.startsWith('https://'),httpOnly:true,sameSite:'lax'});
 if(session?.auth_provider!=='keycloak'||!config.oidc.issuer)return {ok:true};
 const url=new URL(config.oidc.issuer+'/protocol/openid-connect/logout');
 url.searchParams.set('client_id',config.oidc.clientId);url.searchParams.set('post_logout_redirect_uri',config.origin+'/');
 if(session.oidc_id_token)url.searchParams.set('id_token_hint',session.oidc_id_token);
 return {ok:true,logout_url:url.href};
}
