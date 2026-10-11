import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { pool, transaction, one } from './db.mjs';
import { digest } from './auth.mjs';
import { contract, validate } from './validation.mjs';
import { handlers } from './routes.mjs';
import { fail, uuidPattern } from './errors.mjs';
import {aiAvailable} from './ai.mjs';
export const app=express();
app.disable('x-powered-by');
if(config.trustProxy)app.set('trust proxy',1);
app.use((req,res,next)=>{req.requestId=randomUUID();res.set({'X-Request-ID':req.requestId,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"});next();});
app.use(express.json({limit:'6mb'}));
app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({status:'ok',database:'postgresql'});}catch{res.status(503).json({status:'unavailable'});}});
app.get('/api/v1/meta',(req,res)=>res.json({name:'Объекто-ориентированный поиск',environment:config.env,email_demo:config.env==='demo',auth_mode:config.authMode,public_demo:config.publicDemo,llm_mode:config.llmMode,ai_available:aiAvailable(),ai_model:aiAvailable()?config.llmModel:null,bank_status:'authored_pending_independent_review',api_version:'0.8',skills:['Python','PostgreSQL','FastAPI','REST API','Redis','Kafka','Docker','Git','JavaScript','TypeScript','React','HTML','CSS','Accessibility','Browser APIs']}));
app.get('/api/v1/openapi',(req,res)=>res.json(contract));
// Public documentation: inline preview on our site or explicit download, with no session.
app.get('/docs/oop-technical-documentation.pdf',(req,res,next)=>{
 res.attachment('ООП_Техническая_документация_MVP.pdf');
 if(req.query.download!=='1')res.set('Content-Disposition',res.get('Content-Disposition').replace(/^attachment/,'inline'));
 res.sendFile(fileURLToPath(new URL('../public/docs/oop-technical-documentation.pdf',import.meta.url)),error=>{if(error)next(error);});
});
async function limit(scope,max,seconds) {
 const bucket=Math.floor(Date.now()/1000/seconds),row=await one(pool,'INSERT INTO rate_buckets(scope,bucket,count,expires_at) VALUES($1,$2,1,now()+make_interval(secs => $3)) ON CONFLICT(scope,bucket) DO UPDATE SET count=rate_buckets.count+1 RETURNING count',[scope,bucket,seconds*2]);
 if(row.count>max)fail(429,'rate_limit','Слишком много запросов. Повторите позже.');
}
function normalize(x){if(Array.isArray(x))return x.map(normalize);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])]));return x;}
// Small UI projections supplement the immutable v08 contract; private bank stays server-only.
for(const [path,id] of [['/me/assessment/current','assessment_current'],['/internal/reviews','review_queue'],['/internal/reviews/{attempt_id}','review_detail']])contract.paths[path]={get:{operationId:id,responses:{200:{description:'UI projection'}}}};
// Static routes (notably /cognitive/sessions/current) must precede UUID parameters.
const orderedPaths=Object.entries(contract.paths).sort(([a],[b])=>(a.match(/\{/g)||[]).length-(b.match(/\{/g)||[]).length);
for(const [path,methods] of orderedPaths)for(const [method,operation] of Object.entries(methods)) {
 if(!['get','post','put','patch','delete'].includes(method))continue;
 const handler=handlers[operation.operationId];if(!handler)throw new Error('Missing operation: '+operation.operationId);
 const publicRoute=operation.operationId.startsWith('auth_')&&!['auth_me','auth_logout'].includes(operation.operationId)||operation.operationId==='legal_documents';
 const schema=operation.requestBody?.content?.['application/json']?.schema?.$ref?.split('/').pop();
 const idemRequired=(operation.parameters||[]).some(p=>p.name==='Idempotency-Key'&&p.required);
 app[method]('/api/v1'+path.replace(/\{([^}]+)\}/g,':$1'),async(req,res,next)=>{
  try {
   for(const [k,v] of Object.entries(req.params))if(k!=='block'&&!uuidPattern.test(v))fail(404,'not_found','Запись не найдена.');
   if(schema)validate(schema,req.body);
   for(const p of operation.parameters||[])if(p.in==='query'){
    const v=req.query[p.name];if(p.required&&v==null)fail(422,'missing_query','Не задан параметр '+p.name);
    if(v!=null&&p.schema.enum&&!p.schema.enum.includes(v))fail(422,'invalid_query','Некорректный параметр '+p.name);
    if(v!=null&&p.schema.type==='boolean'&&!['true','false'].includes(v))fail(422,'invalid_query','Некорректный флаг '+p.name);
   }
   const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('oop_session='))?.slice(12);
   const user=raw?await one(pool,'SELECT u.*,s.id AS session_id,s.csrf_token,c.id AS company_id FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN companies c ON c.owner_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()',[digest(raw)]):null;
   if(!publicRoute&&!user)fail(401,'unauthenticated','Войдите по email.');
   if(method!=='get') {
    const origin=req.get('Origin');if(origin!==config.origin)fail(403,'origin_mismatch','Недопустимый источник запроса.');
    if(!publicRoute&&req.get('X-CSRF-Token')!==user.csrf_token)fail(403,'csrf_mismatch','Обновите сессию перед сохранением.');
   }
   await limit('requests:'+(user?.session_id||digest(req.ip)),120,60);
   if(operation.operationId.includes('draft'))await limit('draft:'+(user?.id||req.ip),60,60);
   if(operation.operationId==='assessment_submit')await limit('submit:'+user.id,30,60);
   if(operation.operationId==='invitation_create')await limit('invitation:'+user.company_id,20,3600);
   let key=req.get('Idempotency-Key');if(idemRequired&&(!key||!uuidPattern.test(key)))fail(422,'idempotency_required','Требуется Idempotency-Key UUID.');
   if(key&&!uuidPattern.test(key))fail(422,'invalid_key','Некорректный Idempotency-Key.');
   const bodyHash=createHash('sha256').update(JSON.stringify(normalize(req.body||{}))).digest('hex'),endpoint=method+':'+req.path;
   const anonymousScope=digest(req.ip),anonymousIdem=key&&!user&&['auth_start','auth_resend'].includes(operation.operationId);
   const output=await transaction(async db=>{
    if(anonymousIdem){await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[anonymousScope+endpoint+key]);const saved=await one(db,'SELECT * FROM anonymous_idempotency WHERE scope=$1 AND endpoint=$2 AND key=$3',[anonymousScope,endpoint,key]);if(saved){if(saved.body_hash!==bodyHash)fail(409,'idempotency_conflict','Ключ уже использован для других данных.');return {httpStatus:saved.status,body:saved.response};}}
    if(key&&user){await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id+endpoint+key]);const saved=await one(db,'SELECT * FROM idempotency WHERE user_id=$1 AND endpoint=$2 AND key=$3',[user.id,endpoint,key]);if(saved){if(saved.body_hash!==bodyHash)fail(409,'idempotency_conflict','Ключ уже использован для других данных.');return {httpStatus:saved.status,body:saved.response};}}
    const output=await handler({db,user,req,res});
    const codes=Object.keys(operation.responses).filter(k=>k.startsWith('2')),status=output?.httpStatus||Number(codes[0]||200),body=output?.body??output;
    if(anonymousIdem)await db.query('INSERT INTO anonymous_idempotency(scope,endpoint,key,body_hash,status,response) VALUES($1,$2,$3,$4,$5,$6)',[anonymousScope,endpoint,key,bodyHash,status,body]);
    if(key&&user&&!output?.binary)await db.query('INSERT INTO idempotency(user_id,endpoint,key,body_hash,status,response) VALUES($1,$2,$3,$4,$5,$6)',[user.id,endpoint,key,bodyHash,status,body]);
    return output?.redirect?{redirect:output.redirect}:output?.binary?{binary:output.binary}:{httpStatus:status,body};
   });
   if(output.redirect)res.redirect(302,output.redirect);else if(output.binary)res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="oop-resume.pdf"'}).send(output.binary);else res.status(output.httpStatus).json(output.body);
  }catch(e){if(operation.operationId==='auth_oidc_callback'){res.redirect(302,config.origin+'/?auth_error=sso_failed');}else next(e);}
 });
}
app.use(express.static(fileURLToPath(new URL('../public/',import.meta.url)),{index:'index.html'}));
app.use((req,res)=>res.status(404).json({code:'not_found',message:'Страница не найдена.',field_errors:{},request_id:req.requestId}));
app.use((error,req,res,next)=>{
 const status=error.status||(['23505','40P01','40001'].includes(error.code)?409:500);
 const code=status===500?'internal_error':error.code||'invalid_request';
 if(status===500)console.error(JSON.stringify({request_id:req.requestId,event:'request_failed',code:error.code||error.name}));
 if(status===429)res.set('Retry-After','60');
 res.status(status).json({code,message:status===500?'Не удалось выполнить запрос.':status===413?'Файл слишком большой. Максимальный размер PDF — 4 МБ.':error.message,field_errors:error.fields||{},request_id:req.requestId,...(error.next_eligible_at?{next_eligible_at:error.next_eligible_at}:{})});
});
const server=app.listen(config.port,'0.0.0.0',()=>console.log('ООП API listening on '+config.port));
server.requestTimeout=30000;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
