import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,transaction,one} from '../../src/db.mjs';
import {createUser,digest} from '../../src/auth.mjs';
after(()=>pool.end());
const base=process.env.TEST_BASE||'http://127.0.0.1:8088',origin=process.env.APP_ORIGIN||'http://localhost:8088';
async function actor(role){return transaction(async db=>{const u=await createUser(db,'experience-qa-'+randomUUID()+'@oop.test',role),token=randomUUID(),csrf=randomUUID();await db.query('INSERT INTO sessions(user_id,token_hash,csrf_token) VALUES($1,$2,$3)',[u.id,digest(token),csrf]);return {...u,token,csrf};});}
async function call(c,path,method='GET',body,key){const r=await fetch(base+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'oop_session='+c.token,'X-CSRF-Token':c.csrf,...(method==='POST'?{'Idempotency-Key':key||randomUUID()}: {})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
async function ok(c,path,method,body,key){const r=await call(c,path,method,body,key);assert.ok(r.status>=200&&r.status<300,path+' '+r.status+' '+JSON.stringify(r.data));return r.data;}
let candidate,other,reviewer,reviewerB,employer,data;
const entry={id:randomUUID(),organization:'Синтетический учебный проект',period:'2024 — 2025',role:'Разработчик API',contribution:'Спроектировал модели и API, добавил интеграционные проверки.',results:'Подготовил демонстрацию на PostgreSQL.',evidence_url:'https://example.test/private-evidence',evidence_text:'PRIVATE_EVIDENCE: contact-person@example.test; приватный протокол разбора.',reference_permission:false};
const items=()=>[{entry_id:entry.id,fields:{organization:'verified',period:'verified',role:'verified',contribution:'verified',results:'verified'},method:'artifact',basis:'Проверен synthetic пример протокола и истории изменений.'}];
test('опыт: ownership, роли, CAS и запрет опасных ссылок',async()=>{
 [candidate,other,reviewer,reviewerB,employer]=await Promise.all([actor('candidate'),actor('candidate'),actor('reviewer'),actor('reviewer'),actor('employer')]);
 data=await ok(candidate,'/me/experience');assert.equal(data.state,'draft');
 assert.equal((await call(employer,'/me/experience')).status,403);
 assert.equal((await call(candidate,'/internal/experience')).status,403);
 assert.equal((await call(candidate,'/me/experience','PATCH',{expected_revision:data.revision,entries:[{...entry,evidence_url:'javascript:alert(1)'}]})).status,422);
 const race=await Promise.all([call(candidate,'/me/experience','PATCH',{expected_revision:data.revision,entries:[entry]}),call(candidate,'/me/experience','PATCH',{expected_revision:data.revision,entries:[entry]})]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);data=await ok(candidate,'/me/experience');
 assert.equal((await ok(other,'/me/experience')).entries.length,0);
});
test('опыт: отправка, идемпотентность, назначение и обязательное основание',async()=>{
 const key=randomUUID(),body={expected_revision:data.revision,action:'submit'};data=await ok(candidate,'/me/experience/actions','POST',body,key);assert.equal((await ok(candidate,'/me/experience/actions','POST',body,key)).revision,data.revision);
 const queue=await ok(reviewer,'/internal/experience');assert.ok(queue.some(x=>x.id===data.id));assert.equal(JSON.stringify(queue).includes('PRIVATE_EVIDENCE'),false);
 assert.equal((await call(reviewer,'/internal/experience/'+data.id)).status,403);
 data=await ok(reviewer,'/internal/experience/'+data.id+'/claim','POST',{expected_revision:data.revision});
 assert.equal((await call(reviewerB,'/internal/experience/'+data.id)).status,403);
 assert.equal((await call(reviewerB,'/internal/experience/'+data.id+'/claim','POST',{expected_revision:data.revision})).status,403);
 assert.equal((await call(reviewer,'/internal/experience/'+data.id+'/decision','POST',{expected_revision:data.revision,items:[{...items()[0],method:'reference'}],reason:'Полное синтетическое заключение.'})).status,422);
 const before=await ok(candidate,'/me/resume');data=await ok(reviewer,'/internal/experience/'+data.id+'/decision','POST',{expected_revision:data.revision,items:items(),reason:'Подтверждены пять конкретных утверждений synthetic проекта.'});assert.equal(data.state,'verified');assert.equal((await ok(candidate,'/me/resume')).confirmed_grade,before.confirmed_grade);
});
test('опыт: opt-in заключение и отсутствие приватных материалов у работодателя',async()=>{
 let r=await ok(candidate,'/me/resume');r=await ok(candidate,'/me/resume','PATCH',{expected_revision:r.revision,about:'Синтетический профиль проверки источников оценки.',skills:['PostgreSQL'],visibility_sections:['experience','skills']});
 r=await ok(candidate,'/me/resume/publication','POST',{expected_revision:r.revision,action:'publish',consent_version:'publication-0.8-demo',consent_accepted:true});
 let s=await ok(employer,'/candidates/'+candidate.id+'/summary');assert.equal(s.technical,null);assert.equal(s.self,null);assert.equal(s.cognitive,null);assert.equal(s.experience.state,'verified');
 const text=JSON.stringify(s);for(const secret of ['PRIVATE_EVIDENCE','private-evidence','contact-person@example.test','evidence_text','basis','assigned_to'])assert.equal(text.includes(secret),false,secret);
 r=await ok(candidate,'/me/resume','PATCH',{expected_revision:r.revision,visibility_sections:['assessment']});s=await ok(employer,'/candidates/'+candidate.id+'/summary');assert.equal(s.experience,null);assert.ok(s.self);assert.equal(s.complete,false);
 assert.equal((await call(other,'/candidates/'+candidate.id+'/summary')).status,403);
 r=await ok(candidate,'/me/resume/publication','POST',{expected_revision:r.revision,action:'hide'});assert.equal((await call(employer,'/candidates/'+candidate.id+'/summary')).status,404);
});
test('опыт: пересмотр, изменение утверждения и сохранение старого решения',async()=>{
 data=await ok(candidate,'/me/experience');data=await ok(candidate,'/me/experience/actions','POST',{expected_revision:data.revision,action:'appeal',message:'Предоставляю уточнение synthetic проекта для повторной проверки.'});assert.equal(data.state,'submitted');
 data=await ok(reviewer,'/internal/experience/'+data.id+'/claim','POST',{expected_revision:data.revision});const stale=data.revision;
 data=await ok(candidate,'/me/experience','PATCH',{expected_revision:stale,entries:[{...entry,results:'Изменённое утверждение требует новой проверки.'}]});assert.equal(data.state,'draft');assert.equal(data.decision,null);assert.equal(data.reviewed_at,null);
 assert.equal((await call(reviewer,'/internal/experience/'+data.id+'/decision','POST',{expected_revision:stale,items:items(),reason:'Устаревшая проверка не должна примениться.'})).status,403);
 const previous=await one(pool,"SELECT snapshot FROM experience_events WHERE case_id=$1 AND action='decided'",[data.id]);assert.equal(previous.snapshot.decision.items[0].fields.results,'verified');assert.equal(previous.snapshot.entries[0].results,entry.results);
 data=await ok(candidate,'/me/experience/actions','POST',{expected_revision:data.revision,action:'submit'});data=await ok(reviewer,'/internal/experience/'+data.id+'/claim','POST',{expected_revision:data.revision});
 const partial=items();partial[0].fields.results='not_verified';data=await ok(reviewer,'/internal/experience/'+data.id+'/decision','POST',{expected_revision:data.revision,items:partial,reason:'Вклад подтверждён, новое утверждение результата не подтверждено.'});assert.equal(data.state,'partially_verified');
 const missing=items();missing[0].fields.results='needs_info';data=await ok(candidate,'/me/experience/actions','POST',{expected_revision:data.revision,action:'submit'});data=await ok(reviewer,'/internal/experience/'+data.id+'/claim','POST',{expected_revision:data.revision});data=await ok(reviewer,'/internal/experience/'+data.id+'/decision','POST',{expected_revision:data.revision,items:missing,reason:'Требуются дополнительные основания для заявленного результата.'});assert.equal(data.state,'needs_info');
});
test('опыт: пауза и отсутствие опыта не становятся отрицательной оценкой',async()=>{
 let d=await ok(other,'/me/experience');d=await ok(other,'/me/experience/actions','POST',{expected_revision:d.revision,action:'no_experience'});assert.equal(d.state,'no_experience');
 d=await ok(other,'/me/experience/actions','POST',{expected_revision:d.revision,action:'defer'});assert.equal(d.state,'deferred');d=await ok(other,'/me/experience/actions','POST',{expected_revision:d.revision,action:'resume'});assert.equal(d.state,'no_experience');assert.equal((await ok(other,'/me/summary')).technical.grade,null);
});
