import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../../src/db.mjs';
import {config} from '../../src/config.mjs';
import {digest,startOtp,verifyOtp} from '../../src/auth.mjs';
after(()=>pool.end());
const fixture=()=>({email:'qa-entry-'+randomUUID()+'@oop.test',ip:'qa-ip-'+randomUUID()});
const request=(f,body={})=>({ip:f.ip,body:{email:f.email,role:'candidate',...body}});
const verify=(db,f,challenge)=>verifyOtp({db,req:request(f,{challenge_id:challenge.challenge_id,code:'123456',registration_consent_version:'registration-0.8-demo',registration_consent_accepted:true}),res:{cookie(){}},user:null});
async function seedChallenges(db,f,count){
 await db.query("INSERT INTO otp_challenges(email,role,code_hash,ip_hash,created_at) SELECT $1,'candidate',$2,$3,now()-interval '2 minutes' FROM generate_series(1,$4)",[f.email,digest(f.email+'|123456'),digest(f.ip),count]);
}
test('demo: immediate resend keeps two viewers able to enter the same account',async()=>{
 const f=fixture();
 await transaction(async db=>{
  const first=await startOtp({db,req:request(f)}),second=await startOtp({db,req:request(f)});
  assert.notEqual(first.challenge_id,second.challenge_id);
  assert.ok(+new Date(second.resend_available_at)<=Date.now());
  const a=await verify(db,f,first),b=await verify(db,f,second);
  assert.equal(a.id,b.id);assert.equal(a.email,f.email);
  await assert.rejects(verify(db,f,first),e=>e.code==='already_used');
 });
});
test('demo: shared email is not blocked after five viewers',async()=>{
 const f=fixture();
 await transaction(async db=>{
  for(let n=0;n<6;n++)assert.ok((await startOtp({db,req:request({...f,ip:f.ip+'-'+n})})).challenge_id);
 });
});
test('demo: bulk requests are still limited per IP',async()=>{
 const f=fixture();
 await transaction(async db=>{
  await seedChallenges(db,f,300);
  await assert.rejects(startOtp({db,req:request({...f,email:'qa-other-'+randomUUID()+'@oop.test'})}),e=>e.status===429&&e.code==='otp_rate_limit');
 });
});
test('non-demo: email resend still requires 60 seconds',async()=>{
 const f=fixture(),previous=config.env;config.env='staging';
 try{await transaction(async db=>{
  const first=await startOtp({db,req:request(f)});
  assert.ok(+new Date(first.resend_available_at)>Date.now()+59000);
  await assert.rejects(startOtp({db,req:request(f)}),e=>e.status===429&&e.code==='resend_too_soon');
 });}finally{config.env=previous;}
});
test('non-demo: original email and IP hourly limits remain active',async()=>{
 const previous=config.env;config.env='staging';
 try{
  const emailFixture=fixture();
  await transaction(async db=>{await seedChallenges(db,emailFixture,5);await assert.rejects(startOtp({db,req:request({...emailFixture,ip:'different-'+randomUUID()})}),e=>e.code==='otp_rate_limit');});
  const ipFixture=fixture();
  await transaction(async db=>{await seedChallenges(db,ipFixture,20);await assert.rejects(startOtp({db,req:request({...ipFixture,email:'qa-other-'+randomUUID()+'@oop.test'})}),e=>e.code==='otp_rate_limit');});
 }finally{config.env=previous;}
});
test('demo: real emails and public operator OTP remain unavailable',async()=>{
 const previous=config.publicDemo;config.publicDemo=true;
 try{
  const f=fixture();
  await assert.rejects(transaction(db=>startOtp({db,req:request({...f,email:'someone@example.org'})})),e=>e.code==='demo_email');
  await assert.rejects(transaction(db=>startOtp({db,req:request({...f,email:'reviewer@oop.test'})})),e=>e.code==='sso_required');
 }finally{config.publicDemo=previous;}
});
