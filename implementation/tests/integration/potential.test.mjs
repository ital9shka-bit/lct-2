import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pool,transaction,one} from '../../src/db.mjs';
import {createUser,digest} from '../../src/auth.mjs';
import {validators} from '../../src/validation.mjs';
import {pillarSummary} from '../../src/pillars.mjs';
import {enrichPotentialDemo} from '../../src/potential-demo.mjs';
import {publicProfile} from '../../src/profiles.mjs';
after(()=>pool.end());
const base=process.env.TEST_BASE||'http://127.0.0.1:8088',origin=process.env.APP_ORIGIN||'http://localhost:8088';
const bank=JSON.parse(readFileSync(new URL('../../private/cognitive-demo.json',import.meta.url)));
async function actor(role='candidate'){return transaction(async db=>{const u=await createUser(db,'potential-qa-'+randomUUID()+'@oop.test',role),token=randomUUID(),csrf=randomUUID();await db.query('INSERT INTO sessions(user_id,token_hash,csrf_token) VALUES($1,$2,$3)',[u.id,digest(token),csrf]);return {...u,token,csrf};});}
async function call(c,path,method='GET',body){const r=await fetch(base+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'oop_session='+c.token,'X-CSRF-Token':c.csrf,...(method==='POST'?{'Idempotency-Key':randomUUID()}: {})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
async function ok(c,path,method,body){const r=await call(c,path,method,body);assert.ok(r.status>=200&&r.status<300,path+' '+JSON.stringify(r));return r.data;}
test('Potential: new order, optional reflection, CAS and explicit completion without optional answers',async()=>{
 const c=await actor();assert.deepEqual((await ok(c,'/me/program')).blocks.map(b=>b.id),['self','cognitive','professional']);
 let s=(await ok(c,'/me/resume')).self_assessment;
 s=await ok(c,'/me/self-assessment','PATCH',{expected_revision:s.revision,S1:3,S2:2,S3:3,S4:3,S5:2,S6:'B'});
 s=await ok(c,'/me/self-assessment/actions','POST',{expected_revision:s.revision,action:'complete'});assert.equal(s.state,'completed');assert.ok(validators.Self(s));assert.equal((await ok(c,'/me/program')).next_block,'cognitive');
 const stale=s.revision;s=await ok(c,'/me/self-assessment','PATCH',{expected_revision:s.revision,reflection:'После разбора изменила способ проверки.',support:'Один пример и новая ситуация.'});assert.equal(s.state,'in_progress');assert.equal((await call(c,'/me/self-assessment','PATCH',{expected_revision:stale,support:'stale'})).status,409);
 assert.equal((await call(c,'/me/self-assessment','PATCH',{expected_revision:s.revision,reflection:'x'.repeat(1201)})).status,422);
 s=await ok(c,'/me/self-assessment/actions','POST',{expected_revision:s.revision,action:'complete'});assert.equal((await ok(c,'/me/summary')).self.answers.reflection,s.reflection);
});
test('Potential: 0.9 path, pause/resume, mandatory feedback, evidence keys and the same summary',async()=>{
 const c=await actor();let session=await ok(c,'/cognitive/sessions','POST',{version:'cognitive-0.9.0'});assert.ok(validators.CognitiveSession(session),JSON.stringify(validators.CognitiveSession.errors));assert.equal(session.version,'cognitive-0.9.0');
 session=await ok(c,'/cognitive/sessions/'+session.id+'/actions','POST',{expected_revision:session.revision,action:'pause'});assert.equal(session.state,'deferred');assert.ok(session.potential.directions.every(d=>d.correct===null));
 session=await ok(c,'/cognitive/sessions/'+session.id+'/actions','POST',{expected_revision:session.revision,action:'resume'});
 while(session.state!=='completed'){
  if(session.state==='feedback'){
   assert.equal(session.tasks.length,0);assert.ok(session.feedback.explanation.includes('Правильный ответ'));session=await ok(c,'/cognitive/sessions/'+session.id+'/actions','POST',{expected_revision:session.revision,action:'advance_feedback'});continue;
  }
  const t=session.tasks[0],item=bank.items.find(i=>i.id===t.item_id);assert.ok(item);assert.equal('answer_key' in t,false);assert.equal('explanation' in t,false);if(t.ordinal===3)assert.ok(t.rule_reference);
  const value=t.ordinal===2?Object.keys(item.options).find(key=>key!==item.answer_key):String(item.answer_key);
  session=await ok(c,'/cognitive/sessions/'+session.id+'/tasks/'+t.id+'/draft','PUT',{expected_revision:t.draft_revision,value});
  session=await ok(c,'/cognitive/sessions/'+session.id+'/tasks/'+t.id+'/submit','POST',{draft_revision:session.tasks[0].draft_revision});
  assert.ok(validators.CognitiveSession(session));if(session.state!=='completed')assert.ok(session.potential.directions.every(d=>d.correct===null));
 }
 const p=session.potential;assert.equal(p.answered,6);assert.deepEqual(p.directions[1].evidence.map(e=>e.correct),[false,true]);assert.match(p.directions[1].headline,/после разбора/);assert.deepEqual((await ok(c,'/me/summary')).cognitive.potential,p);
});
test('Potential: assessment visibility protects reflection and all cognitive observations',async()=>{
 const c=await actor(),e=await actor('employer');let r=await ok(c,'/me/resume');r=await ok(c,'/me/resume','PATCH',{expected_revision:r.revision,name:'Приватный пример',about:'Учебный сервис регистрации на занятия.',skills:['Python'],visibility_sections:['skills']});
 let s=r.self_assessment;s=await ok(c,'/me/self-assessment','PATCH',{expected_revision:s.revision,S1:3,S2:3,S3:3,S4:3,S5:3,S6:'C',reflection:'PRIVATE_REFLECTION',support:'PRIVATE_SUPPORT'});await ok(c,'/me/self-assessment/actions','POST',{expected_revision:s.revision,action:'complete'});
 await ok(c,'/me/resume/publication','POST',{expected_revision:r.revision,action:'publish',consent_version:'publication-0.8-demo',consent_accepted:true});
 const hidden=await ok(e,'/candidates/'+c.id+'/summary');assert.equal(hidden.self,null);assert.equal(hidden.cognitive,null);assert.equal(JSON.stringify(hidden).includes('PRIVATE_'),false);assert.equal((await publicProfile(pool,c.id)).potential_summary,null);
 r=await ok(c,'/me/resume');await ok(c,'/me/resume','PATCH',{expected_revision:r.revision,visibility_sections:['skills','assessment']});assert.equal((await ok(e,'/candidates/'+c.id+'/summary')).self.answers.reflection,'PRIVATE_REFLECTION');
});
test('Potential demo: improvement, nonuniform self-profile, deferred technical block and idempotent seed',async()=>{
 const u=await one(pool,"SELECT id FROM users WHERE email='growth-demo@oop.test'");assert.ok(u);const before=await pillarSummary(pool,u.id);assert.match(before.cognitive.potential.directions[1].headline,/после разбора/);assert.equal(before.self.answers.S2,2);assert.equal(before.self.answers.S1,3);assert.equal(before.technical.grade,null);assert.equal(before.technical.state,'deferred');
 await transaction(enrichPotentialDemo);assert.deepEqual(await pillarSummary(pool,u.id),before);
});
