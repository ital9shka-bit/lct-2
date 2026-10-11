import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {pool,transaction,one} from '../../src/db.mjs';
import {makeOidcHandlers} from '../../src/oidc.mjs';
import {config} from '../../src/config.mjs';
import {startOtp} from '../../src/auth.mjs';
let server,issuer,privateKey,jwks,handlers;
const codes=new Map(),origin='http://127.0.0.1:8088',clientId='oop-web';
function response(){const cookies={};return {cookies,cookie:(k,v)=>{cookies[k]=v;},clearCookie:k=>{delete cookies[k];}};}
before(async()=>{
 const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;const jwk=await exportJWK(pair.publicKey);jwks={keys:[{...jwk,kid:'test',alg:'RS256',use:'sig'}]};
 server=createServer(async(req,res)=>{
  if(req.url.endsWith('/certs')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(jwks));return;}
  let body='';for await(const chunk of req)body+=chunk;
  const params=new URLSearchParams(body),fixture=codes.get(params.get('code'));
  if(!fixture||params.get('client_secret')!=='test-secret'||createHash('sha256').update(params.get('code_verifier')||'').digest('base64url')!==fixture.challenge){res.writeHead(400);res.end('{}');return;}
  codes.delete(params.get('code'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id_token:fixture.jwt}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));issuer='http://127.0.0.1:'+server.address().port+'/realms/test';
 handlers=makeOidcHandlers({issuer,internalIssuer:issuer,clientId,clientSecret:'test-secret'},{origin,enabled:true});
});
after(async()=>{await new Promise(r=>server.close(r));await pool.end();});
async function login({email='talent-demo@oop.test',role='oop-talent',nonce,audience=clientId,badSignature=false}={}){
 const res=response(),start=await transaction(db=>handlers.auth_oidc_login({db,res,req:{query:{consent:'registration-0.8-demo',login_hint:email}}})),url=new URL(start.redirect);
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),origin+'/api/v1/auth/oidc/callback');
 const code=randomUUID(),claims={sub:'subject-'+email,email,email_verified:true,nonce:nonce??url.searchParams.get('nonce'),azp:clientId,realm_access:{roles:[role]}};
 const signingKey=badSignature?(await generateKeyPair('RS256')).privateKey:privateKey;
 const jwt=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setExpirationTime('5m').setIssuer(issuer).setAudience(audience).sign(signingKey);
 codes.set(code,{jwt,challenge:url.searchParams.get('code_challenge')});
 const req={query:{state:url.searchParams.get('state'),code},headers:{cookie:'oop_oidc_state='+res.cookies.oop_oidc_state},ip:'127.0.0.1'};
 return {req,res,callback:()=>transaction(db=>handlers.auth_oidc_callback({db,res,req}))};
}
test('OIDC: signed code flow links the ready profile, keeps data and rejects replay',async()=>{
 const before=await one(pool,"SELECT u.id,r.data FROM users u JOIN resumes r ON r.owner_id=u.id WHERE email='talent-demo@oop.test'");
 const c=await login();assert.deepEqual(await c.callback(),{redirect:origin+'/'});assert.ok(c.res.cookies.oop_session);
 const linked=await one(pool,'SELECT user_id FROM auth_identities WHERE issuer=$1 AND subject=$2',[issuer,'subject-talent-demo@oop.test']);assert.equal(linked.user_id,before.id);
 assert.deepEqual((await one(pool,'SELECT data FROM resumes WHERE owner_id=$1',[before.id])).data,before.data);
 await assert.rejects(c.callback(),e=>e.code==='oidc_expired');
 const again=await login();await again.callback();assert.equal((await one(pool,'SELECT count(*)::int AS n FROM auth_identities WHERE issuer=$1 AND user_id=$2',[issuer,before.id])).n,1);
});
test('OIDC: reject forged signature, wrong audience and wrong nonce',async()=>{
 for(const args of [{badSignature:true},{audience:'untrusted-app'},{nonce:'wrong-nonce'}]){const c=await login(args);await assert.rejects(c.callback(),e=>['oidc_token','oidc_claims'].includes(e.code));assert.equal(c.res.cookies.oop_session,undefined);}
});
test('OIDC: browser state binding and expiry are mandatory',async()=>{
 let c=await login();c.req.headers.cookie='oop_oidc_state=other-browser';await assert.rejects(c.callback(),e=>e.code==='oidc_state');
 c=await login();await pool.query("UPDATE oidc_login_states SET expires_at=now()-interval '1 minute'");await assert.rejects(c.callback(),e=>e.code==='oidc_expired');
});
test('OIDC: provider role cannot change an existing employer into a talent',async()=>{
 const c=await login({email:'employer@oop.test',role:'oop-talent'});await assert.rejects(c.callback(),e=>e.code==='oidc_role_conflict');assert.equal(c.res.cookies.oop_session,undefined);
 assert.equal((await one(pool,"SELECT role FROM users WHERE email='employer@oop.test'")).role,'employer');
});
test('OIDC: public demo operator cannot enter with the shared OTP',async()=>{
 const previous=config.publicDemo;config.publicDemo=true;
 try{await assert.rejects(transaction(db=>startOtp({db,req:{body:{email:'reviewer@oop.test',role:'candidate'},ip:'127.0.0.1'}})),e=>e.code==='sso_required');}
 finally{config.publicDemo=previous;}
});
