import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from './config.mjs';
import { pool, transaction, one, audit } from './db.mjs';
import { selectStage, evaluateTask, finalize } from './assessment.mjs';
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
const transport=nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpSecure,...(config.smtpUser?{auth:{user:config.smtpUser,pass:config.smtpPassword}}:{}),connectionTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
async function claim(table) {
 return transaction(async db=>{const item=await one(db,`SELECT * FROM ${table} WHERE (status='pending' OR (status='running' AND lease_until<now())) AND run_at<=now() ORDER BY run_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1`);if(!item)return null;
  return one(db,`UPDATE ${table} SET status='running',attempts=attempts+1,lease_until=now()+interval '60 seconds',lease_token=$1 WHERE id=$2 RETURNING *`,[randomUUID(),item.id]);
 });
}
async function processJob(item) {
 try {
  await transaction(async db=>{
   if(item.kind==='generate'){const a=await one(db,'SELECT * FROM attempts WHERE id=$1 FOR UPDATE',[item.payload.attempt_id]);if(a?.state==='generating_'+item.payload.stage)await selectStage(db,a,item.payload.stage);}
   if(item.kind==='evaluate')await evaluateTask(db,item.payload);
   if(item.kind==='finalize'){const a=await one(db,'SELECT * FROM attempts WHERE id=$1 FOR UPDATE',[item.payload.attempt_id]);if(['evaluation_pending','review_pending'].includes(a?.state))await finalize(db,a);}
   await db.query("UPDATE jobs SET status='done',lease_until=NULL WHERE id=$1 AND lease_token=$2",[item.id,item.lease_token]);
  });
 }catch(error){
  await transaction(async db=>{
   const done=item.attempts>=3||[400,401,403,404,429].includes(error.status),delay=item.attempts===1?2:5;
   await db.query("UPDATE jobs SET status=$1,last_error=$2,run_at=now()+$3*interval '1 second',lease_until=NULL WHERE id=$4 AND lease_token=$5",[done?'failed':'pending',error.code||'provider_unavailable',delay,item.id,item.lease_token]);
   if(done&&item.kind==='evaluate'){
    const t=await one(db,'SELECT * FROM attempt_tasks WHERE id=$1',[item.payload.task_id]);
    if(t){await db.query("UPDATE attempt_tasks SET evaluation_source='manual_required' WHERE id=$1 AND score IS NULL",[t.id]);await db.query("UPDATE attempts SET state='review_pending',review_started_at=coalesce(review_started_at,now()),revision=revision+1 WHERE id=$1 AND state='evaluation_pending'",[t.attempt_id]);}
   }
  });console.log(JSON.stringify({event:'job_retry',kind:item.kind,attempts:item.attempts}));
 }
}
async function processMail(item) {
 try {
  await transport.sendMail({from:config.mailFrom,...item.payload,messageId:'<'+item.id+'@oop.local>'});
  await transaction(async db=>{await db.query("UPDATE outbox SET status='sent',lease_until=NULL WHERE id=$1 AND lease_token=$2",[item.id,item.lease_token]);if(item.invitation_id)await db.query("UPDATE invitations SET delivery_state='sent' WHERE id=$1",[item.invitation_id]);});
 }catch{
  const done=item.attempts>=5,delays=[1,5,15,60,300];
  await transaction(async db=>{await db.query("UPDATE outbox SET status=$1,run_at=now()+$2*interval '1 second',lease_until=NULL WHERE id=$3 AND lease_token=$4",[done?'failed':'pending',delays[item.attempts-1],item.id,item.lease_token]);if(done&&item.invitation_id)await db.query("UPDATE invitations SET delivery_state='failed' WHERE id=$1",[item.invitation_id]);});
 }
}
let maintenance=0;
console.log('ООП worker started');
while(!stopping){
 try{
  const [job,mail]=await Promise.all([claim('jobs'),claim('outbox')]);
  await Promise.all([job?processJob(job):null,mail?processMail(mail):null]);
  if(Date.now()-maintenance>60000){maintenance=Date.now();await pool.query("UPDATE attempts SET state='expired',revision=revision+1 WHERE state IN ('paused','answering_B','answering_A','answering_V','generating_A','generating_V') AND expires_at<=now()");await pool.query("DELETE FROM rate_buckets WHERE expires_at<now()");await pool.query("DELETE FROM idempotency WHERE created_at<now()-interval '7 days'");await pool.query("DELETE FROM anonymous_idempotency WHERE created_at<now()-interval '7 days'");}
  if(!job&&!mail)await new Promise(r=>setTimeout(r,500));
 }catch(e){console.error(JSON.stringify({event:'worker_error',code:e.code||e.name}));await new Promise(r=>setTimeout(r,1000));}
}
await pool.end();
