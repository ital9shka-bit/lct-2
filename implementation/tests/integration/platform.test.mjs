import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {pool,transaction} from '../../src/db.mjs';
import {createUser} from '../../src/auth.mjs';
import {contract as spec} from '../../src/validation.mjs';
after(async()=>pool.end());
const base=process.env.TEST_BASE||'http://127.0.0.1:8088',origin=process.env.APP_ORIGIN||'http://localhost:8088';
const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);ajv.addSchema({$id:'oop',components:spec.components});
const schema=name=>ajv.compile({$ref:'oop#/components/schemas/'+name});
function conforms(name,value){const valid=schema(name);assert.ok(valid(value),name+': '+JSON.stringify(valid.errors));}
function client(){return {cookie:'',csrf:'',user:null};}
async function call(c,path,method='GET',body,key){const r=await fetch(base+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:c?.cookie||'','X-CSRF-Token':c?.csrf||'',...((key||method==='POST')?{'Idempotency-Key':key||randomUUID()}:{})},...(body?{body:JSON.stringify(body)}:{})});const cookie=r.headers.get('set-cookie');if(cookie&&c)c.cookie=cookie.split(';')[0];const data=(r.headers.get('content-type')||'').includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer());return {status:r.status,data};}
async function ok(c,path,method,body,key){const r=await call(c,path,method,body,key);assert.ok(r.status>=200&&r.status<300,path+' '+r.status+' '+JSON.stringify(r.data));return r.data;}
async function login(email,role='candidate'){const c=client(),ch=await ok(c,'/auth/otp','POST',{email,role});conforms('OTPChallenge',ch);c.user=await ok(c,'/auth/otp/verify','POST',{challenge_id:ch.challenge_id,code:'123456',registration_consent_version:'registration-0.8-demo',registration_consent_accepted:true});c.csrf=c.user.csrf_token;conforms('User',c.user);return c;}
async function waitAttempt(c,id,predicate){const until=Date.now()+15000;let a;while(Date.now()<until){a=await ok(c,'/assessments/attempts/'+id);if(predicate(a))return a;await new Promise(r=>setTimeout(r,600));}assert.fail('attempt state timeout: '+a?.state);}
const bank=JSON.parse(readFileSync(new URL('../../private/professional-demo.json',import.meta.url))),cognitiveBank=JSON.parse(readFileSync(new URL('../../private/cognitive.json',import.meta.url)));
let candidate,employer,employerB,reviewer,a,ownProfile,needA,needB;
const counters={scenarios:0};
const scenario=(name,fn)=>test(name,async()=>{await fn();counters.scenarios++;});
async function employerFixture(label){
 const c=await login('qa-company-'+randomUUID()+'@oop.test','employer');
 const empty=await ok(c,'/me/company');
 const company=await ok(c,'/me/company','PATCH',{expected_revision:empty.revision,name:label+' · synthetic',description:'Синтетическая компания интеграционного теста.',domain:'EdTech',representative_name:'Тестовый представитель',representative_role:'Tech Lead'});conforms('Company',company);
 const draft=await ok(c,'/needs','POST',{title:'Backend API',task_text:'Разработка API и оптимизация запросов PostgreSQL для учебного проекта.',expected_result:'Стабильный API и измеренные улучшения запросов.',specialization:'Backend',min_grade:'Junior',must_skills:['PostgreSQL'],preferred_skills:['Python'],work_modes:['remote'],salary_min:150000,salary_max:200000});
 const need=await ok(c,'/needs/'+draft.id+'/actions','POST',{expected_revision:draft.revision,action:'publish'});conforms('Need',need);
 return {client:c,need};
}
scenario('вход, HttpOnly сессия, CSRF, роли и неизвестные поля',async()=>{
 assert.equal((await call(client(),'/me/resume')).status,401);
 candidate=await login('qa-'+randomUUID()+'@oop.test');
 const fixtureA=await employerFixture('Компания A'),fixtureB=await employerFixture('Компания B');employer=fixtureA.client;needA=fixtureA.need;employerB=fixtureB.client;needB=fixtureB.need;
 const reviewerEmail='qa-reviewer-'+randomUUID()+'@oop.test';await transaction(db=>createUser(db,reviewerEmail,'reviewer'));reviewer=await login(reviewerEmail);
 assert.match(candidate.cookie,/oop_session=/);assert.equal((await call(employer,'/me/resume')).status,403);
 const missing={...candidate,csrf:''};assert.equal((await call(missing,'/me/resume','PATCH',{expected_revision:1,name:'x'})).status,403);
 assert.equal((await call(candidate,'/me/resume','PATCH',{expected_revision:1,owner_id:randomUUID()})).status,422);
 ownProfile=await ok(candidate,'/me/resume');conforms('Resume',ownProfile);
 const c=await ok(employer,'/me/company');conforms('Company',c);
});
scenario('CAS гонка сохранения; самооценка завершена только явно и просмотр не сбрасывает',async()=>{
 const rev=ownProfile.revision,rows=await Promise.all([call(candidate,'/me/resume','PATCH',{expected_revision:rev,name:'Первое'}),call(candidate,'/me/resume','PATCH',{expected_revision:rev,name:'Второе'})]);assert.deepEqual(rows.map(r=>r.status).sort(),[200,409]);
 ownProfile=await ok(candidate,'/me/resume');const s=await ok(candidate,'/me/self-assessment','PATCH',{expected_revision:ownProfile.self_assessment.revision,S1:3,S2:3,S3:3,S4:3,S5:3,S6:'C'});assert.equal(s.state,'in_progress');
 const complete=await ok(candidate,'/me/self-assessment/actions','POST',{expected_revision:s.revision,action:'complete'},randomUUID());assert.equal(complete.state,'completed');assert.equal((await ok(candidate,'/me/resume')).self_assessment.state,'completed');
 const changed=await ok(candidate,'/me/self-assessment','PATCH',{expected_revision:complete.revision,S1:4});assert.equal(changed.state,'in_progress');await ok(candidate,'/me/self-assessment/actions','POST',{expected_revision:changed.revision,action:'complete'},randomUUID());
 const p=await ok(candidate,'/me/program/professional/actions','POST',{action:'defer'},randomUUID());conforms('Program',p);assert.equal(p.next_block,'cognitive');
 await ok(candidate,'/me/program/cognitive/actions','POST',{action:'defer'},randomUUID());assert.equal((await ok(candidate,'/me/program')).next_block,'cognitive');
});
scenario('единственная попытка, idempotency и замороженные вопросы без приватного банка',async()=>{
 const k=randomUUID(),body={specialization:'Backend',target_grade:'Junior'};a=await ok(candidate,'/assessments/attempts','POST',body,k);conforms('Attempt',a);assert.equal(a.tasks.length,10);
 assert.equal((await ok(candidate,'/assessments/attempts','POST',body,k)).id,a.id);
 assert.equal((await call(candidate,'/assessments/attempts','POST',{...body,target_grade:'Middle'},k)).status,409);
 assert.equal((await call(candidate,'/assessments/attempts','POST',body,randomUUID())).status,409);
 const again=await ok(candidate,'/assessments/attempts/'+a.id);assert.deepEqual(a.tasks.map(t=>[t.id,t.stem]),again.tasks.map(t=>[t.id,t.stem]));
 assert.equal(JSON.stringify(a).includes('answer_key'),false);assert.equal(JSON.stringify(a).includes('rubric'),true);assert.equal(JSON.stringify(a).includes('reference_answer'),false);
 assert.equal((await call(employer,'/assessments/attempts/'+a.id)).status,403);
 const skip=await ok(candidate,'/assessments/attempts/'+a.id+'/tasks/'+a.tasks[0].id+'/skip','POST',{expected_revision:a.revision},randomUUID());assert.equal(skip.submitted_count,0);assert.equal(skip.tasks.length,10);
 a=await ok(candidate,'/assessments/attempts/'+a.id+'/actions','POST',{expected_revision:skip.revision,action:'pause'},randomUUID());assert.equal(a.state,'paused');
 a=await ok(candidate,'/assessments/attempts/'+a.id+'/actions','POST',{expected_revision:a.revision,action:'resume'},randomUUID());assert.equal(a.state,'answering_B');
});
scenario('20 ответов B10/A5/V5; неизменяемость; очередь, review и точные баллы',async()=>{
 for(const stage of ['B','A','V']){
  a=await waitAttempt(candidate,a.id,x=>x.state==='answering_'+stage);
  assert.equal(a.tasks.filter(t=>t.stage===stage).length,stage==='B'?10:5);
  for(const task of a.tasks.filter(t=>t.stage===stage)){
   const item=bank.items.find(i=>i.id===task.item_id),draft=await ok(candidate,'/assessments/attempts/'+a.id+'/tasks/'+task.id+'/draft','PUT',{expected_revision:task.draft_revision,...(task.format==='closed'?{option_id:item.answer_key}:{value_text:item.reference_answer})});conforms('Task',draft);
   a=await ok(candidate,'/assessments/attempts/'+a.id+'/tasks/'+task.id+'/submit','POST',{draft_revision:draft.draft_revision},randomUUID());
  }
 }
 assert.equal(a.submitted_count,20);a=await waitAttempt(candidate,a.id,x=>x.state==='review_pending');const before=await ok(candidate,'/assessments/attempts/'+a.id+'/result');assert.equal(before.S,null);assert.equal(before.outcome,null);conforms('Result',before);
 const first=a.tasks[0];assert.equal((await call(candidate,'/assessments/attempts/'+a.id+'/tasks/'+first.id+'/draft','PUT',{expected_revision:first.draft_revision,option_id:'A'})).status,409);
 const reviews=await ok(reviewer,'/reviews');assert.ok(reviews.some(t=>t.attempt_id===a.id));
 for(const t of reviews.filter(t=>t.attempt_id===a.id)){
  conforms('ReviewTask',t);const criteria=t.criteria.map(c=>({...c,score:1,evidence_quote:t.answer,reason:'Эталонный ответ явно содержит решение критерия.'}));
  const saved=await ok(reviewer,'/reviews/'+a.id+'/tasks/'+t.task_id,'PUT',{expected_revision:t.revision,criteria,reason:'Проверка эталонного ответа на синтетическом стенде.'});conforms('ReviewTask',saved);
 }
 a=await ok(candidate,'/assessments/attempts/'+a.id);const final=await ok(reviewer,'/reviews/'+a.id+'/finalize','POST',{expected_revision:a.revision,reason:'Все четыре критерия каждого открытого ответа проверены.'},randomUUID());conforms('Result',final);assert.equal(final.S,100);assert.equal(final.outcome,'verified');
 const r=await ok(candidate,'/me/resume');assert.equal(r.confirmed_grade,'Junior');assert.equal((await ok(candidate,'/assessments/eligibility?specialization=Backend&target_grade=Junior')).reason,'cooldown');assert.equal((await ok(candidate,'/assessments/eligibility?specialization=Backend&target_grade=Middle')).reason,'higher_grade_cooldown');
 conforms('ListAttempts',await ok(candidate,'/assessments/attempts'));
});
scenario('когнитивные формы, обязательный feedback, раздельная активность и completed программа',async()=>{
 assert.equal(await ok(candidate,'/cognitive/sessions/current'),null);
 let c=await ok(candidate,'/cognitive/sessions','POST',{version:'cognitive-0.8.0'},randomUUID());conforms('CognitiveSession',c);
 assert.equal((await ok(candidate,'/cognitive/sessions/current')).id,c.id);
 while(c.state!=='completed'){
  if(c.state==='feedback'){assert.equal(c.tasks.length,0);assert.ok(c.feedback.explanation);c=await ok(candidate,'/cognitive/sessions/'+c.id+'/actions','POST',{expected_revision:c.revision,action:'advance_feedback'},randomUUID());continue;}
  const t=c.tasks[0],i=cognitiveBank.items.find(i=>i.id===t.item_id),saved=await ok(candidate,'/cognitive/sessions/'+c.id+'/tasks/'+t.id+'/draft','PUT',{expected_revision:t.draft_revision,value:String(i.answer_key)});conforms('CognitiveSession',saved);
  c=await ok(candidate,'/cognitive/sessions/'+c.id+'/tasks/'+t.id+'/submit','POST',{draft_revision:saved.tasks[0].draft_revision},randomUUID());
 }
 assert.equal(c.answered_count,6);assert.ok(c.observations.every(o=>o.correct===2));assert.equal((await ok(candidate,'/me/program')).completed,true);assert.equal((await ok(candidate,'/me/resume')).confirmed_grade,'Junior');
});
scenario('публикация с отдельным согласием, приватная проекция и PDF с кириллицей',async()=>{
 let r=await ok(candidate,'/me/resume');r=await ok(candidate,'/me/resume','PATCH',{expected_revision:r.revision,name:'Тестовый кандидат',about:'Синтетический профиль для сквозного тестирования сервера.',skills:['Python','PostgreSQL'],experience_text:'Разрабатываю API и проверяю запросы SQL.'});
 assert.equal((await call(candidate,'/me/resume/publication','POST',{expected_revision:r.revision,action:'publish'},randomUUID())).status,422);
 r=await ok(candidate,'/me/resume/publication','POST',{expected_revision:r.revision,action:'publish',consent_version:'publication-0.8-demo',consent_accepted:true},randomUUID());assert.equal(r.publication_state,'published');
 const preview=await ok(candidate,'/me/resume/preview');conforms('PublicProfile',preview);assert.equal(preview.display_name.includes('Тестовый'),false);assert.equal(JSON.stringify(preview).includes(candidate.user.email),false);
 const p=await call(candidate,'/me/resume/pdf');assert.equal(p.status,200);assert.equal(p.data.subarray(0,4).toString(),'%PDF');
});
scenario('подборка, hard filter, separate unverified, shortlist и межкомпанейные права',async()=>{
 assert.ok((await ok(employer,'/needs')).some(n=>n.id===needA.id));conforms('Need',needA);
 const m=await ok(employer,'/needs/'+needA.id+'/candidates?include_unverified=true');conforms('MatchList',m);assert.ok(m.confirmed.some(m=>m.profile.candidate_id===candidate.user.id));assert.ok(m.unverified.length>=1);assert.equal(JSON.stringify(m).includes(candidate.user.email),false);
 assert.equal((await call(employerB,'/needs/'+needA.id)).status,404);assert.equal((await call(employerB,'/needs/'+needA.id+'/candidates')).status,404);
 await ok(employer,'/me/shortlist/'+candidate.user.id,'PUT',{});assert.ok((await ok(employer,'/me/shortlist')).some(p=>p.candidate_id===candidate.user.id));
 assert.equal((await call(employer,'/candidates/'+candidate.user.id+'/contact')).status,403);
 const n=await ok(employer,'/needs','POST',{title:'Проверка Kafka',specialization:'Backend',min_grade:'Junior',must_skills:['Kafka'],work_modes:['remote']},randomUUID());const filtered=await ok(employer,'/needs/'+n.id+'/candidates');assert.ok(filtered.confirmed.every(m=>m.profile.skills.includes('Kafka')));assert.ok(!filtered.confirmed.some(m=>m.profile.candidate_id===candidate.user.id));
});
scenario('идемпотентное приглашение, viewed, accept, отказ второй компании и отзыв grant',async()=>{
 const body={candidate_id:candidate.user.id,need_id:needA.id,salary_min:150000,salary_max:200000,currency:'RUB',period:'month',tax_basis:'gross',message:'Синтетическое предложение для проверки согласия и доступа.'},key=randomUUID();
 const i=await ok(employer,'/invitations','POST',body,key);conforms('Invitation',i);assert.equal((await ok(employer,'/invitations','POST',body,key)).id,i.id);assert.equal((await call(employer,'/invitations','POST',{...body,message:'Другой текст'},key)).status,409);
 let viewed=await ok(candidate,'/invitations/'+i.id);assert.equal(viewed.state,'viewed');const accepted=await ok(candidate,'/invitations/'+i.id+'/response','POST',{expected_revision:viewed.revision,action:'accept'},randomUUID());assert.equal(accepted.active_contact_access,true);
 const contact=await ok(employer,'/candidates/'+candidate.user.id+'/contact');conforms('Contact',contact);assert.equal(contact.email,candidate.user.email);assert.equal((await call(employerB,'/candidates/'+candidate.user.id+'/contact')).status,403);
 const ib=await ok(employerB,'/invitations','POST',{...body,need_id:needB.id},randomUUID());await ok(candidate,'/invitations/'+ib.id+'/response','POST',{expected_revision:ib.revision,action:'reject'},randomUUID());assert.equal((await call(employerB,'/candidates/'+candidate.user.id+'/contact')).status,403);assert.equal((await call(candidate,'/invitations/'+ib.id+'/response','POST',{expected_revision:ib.revision,action:'accept'},randomUUID())).status,409);
 const grants=await ok(candidate,'/contacts/grants'),g=grants.find(g=>g.id===contact.grant_id);await ok(candidate,'/contacts/grants/'+g.id+'/revoke','POST',{expected_revision:g.revision},randomUUID());assert.equal((await call(employer,'/candidates/'+candidate.user.id+'/contact')).status,403);
});
scenario('вакансии, публикация, отклик без контактов, изоляция компаний и отзыв',async()=>{
 const key=randomUUID(),v=await ok(employer,'/vacancies','POST',{need_id:needA.id},key);assert.equal(v.state,'draft');assert.equal((await ok(employer,'/vacancies','POST',{need_id:needA.id},key)).id,v.id);
 assert.equal((await call(candidate,'/vacancies/'+v.id)).status,404);
 assert.equal((await call(employerB,'/vacancies/'+v.id+'/actions','POST',{expected_revision:v.revision,action:'publish'})).status,404);
 const published=await ok(employer,'/vacancies/'+v.id+'/actions','POST',{expected_revision:v.revision,action:'publish'});assert.equal(published.state,'published');
 const list=await ok(candidate,'/vacancies');assert.ok(list.items.some(x=>x.id===v.id));assert.equal(JSON.stringify(list).includes(employer.user.email),false);
 const aKey=randomUUID(),body={cover_letter:'Демонстрационный отклик: умею проектировать API и работать с PostgreSQL.'},applied=await ok(candidate,'/vacancies/'+v.id+'/applications','POST',body,aKey);
 assert.equal((await ok(candidate,'/vacancies/'+v.id+'/applications','POST',body,aKey)).id,applied.id);
 assert.equal((await call(candidate,'/vacancies/'+v.id+'/applications','POST',body)).status,409);
 const incoming=await ok(employer,'/me/applications');assert.equal(incoming.items.find(x=>x.id===applied.id).profile.candidate_id,candidate.user.id);assert.equal(JSON.stringify(incoming).includes(candidate.user.email),false);
 assert.equal((await ok(employerB,'/me/applications')).items.some(x=>x.id===applied.id),false);
 assert.equal((await call(employer,'/applications/'+applied.id+'/actions','POST',{expected_revision:applied.revision,action:'withdraw'})).status,403);
 assert.equal((await call(employer,'/candidates/'+candidate.user.id+'/contact')).status,403);
 await ok(candidate,'/applications/'+applied.id+'/actions','POST',{expected_revision:applied.revision,action:'withdraw'});
 assert.equal((await ok(candidate,'/me/applications')).items.find(x=>x.id===applied.id).state,'withdrawn');assert.equal((await ok(employer,'/me/applications')).items.find(x=>x.id===applied.id).profile,null);
 const archived=await ok(employer,'/vacancies/'+v.id+'/actions','POST',{expected_revision:published.revision,action:'archive'});assert.equal(archived.state,'archived');
 assert.equal((await call(candidate,'/vacancies/'+v.id+'/applications','POST',body)).status,404);
});
let catalogFixture,catalogVacancy,catalogQuery;
scenario('серверные фильтры, стабильные страницы, избранное и CAS сохранённых настроек',async()=>{
 catalogQuery='qa-filter-'+randomUUID();catalogFixture=await employerFixture(catalogQuery);
 let v=await ok(catalogFixture.client,'/vacancies','POST',{need_id:catalogFixture.need.id});catalogVacancy=await ok(catalogFixture.client,'/vacancies/'+v.id+'/actions','POST',{expected_revision:v.revision,action:'publish'});
 await transaction(async db=>{const row=(await db.query('SELECT data FROM vacancies WHERE id=$1',[v.id])).rows[0];for(let n=1;n<=12;n++){const data={...row.data,title:'Backend API · '+n};const need=(await db.query("INSERT INTO needs(company_id,data,state) VALUES($1,$2,'published') RETURNING id",[catalogFixture.client.user.company_id,data])).rows[0];await db.query("INSERT INTO vacancies(company_id,need_id,data,state) VALUES($1,$2,$3,'published')",[catalogFixture.client.user.company_id,need.id,data]);}});
 const c=await login('qa-catalog-'+randomUUID()+'@oop.test'),other=await login('qa-other-'+randomUUID()+'@oop.test');
 const filters={q:catalogQuery,specialization:'Backend',grade:'Junior',work_mode:'remote',salary_floor:150000,skill:'Python',favorites_only:false,sort:'salary_desc'},query='/vacancies?'+new URLSearchParams(filters);
 const first=await ok(c,query),second=await ok(c,query+'&page=2');assert.equal(first.total,13);assert.equal(first.items.length,12);assert.equal(second.items.length,1);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,13);assert.deepEqual((await ok(c,query)).items.map(x=>x.id),first.items.map(x=>x.id));
 for(const [field,value] of [['salary_floor','150001'],['grade','Middle'],['skill','Kafka'],['work_mode','office'],['q',catalogQuery+'%']]){assert.equal((await ok(c,'/vacancies?'+new URLSearchParams({...filters,[field]:value}))).total,0,field);}
 for(const query of ['?page=0','?page=1.5','?salary_floor=oops','?favorites_only=1','?sort=oops','?q[]=x','?unexpected=1'])assert.equal((await call(c,'/vacancies'+query)).status,422,query);
 let p=await ok(c,'/me/vacancy-preferences');const race=await Promise.all([call(c,'/me/vacancy-preferences','PATCH',{expected_revision:p.revision,filters}),call(c,'/me/vacancy-preferences','PATCH',{expected_revision:p.revision,filters:{...filters,grade:'Middle'}})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 p=await ok(c,'/me/vacancy-preferences');p=await ok(c,'/me/vacancy-preferences','PATCH',{expected_revision:p.revision,filters});await pool.query("UPDATE otp_challenges SET created_at=now()-interval '61 seconds' WHERE email=$1",[c.user.email]);const relogin=await login(c.user.email);assert.deepEqual((await ok(relogin,'/me/vacancy-preferences')).filters,filters);assert.notDeepEqual((await ok(other,'/me/vacancy-preferences')).filters,filters);assert.equal((await call(catalogFixture.client,'/me/vacancy-preferences')).status,403);
 const key=randomUUID();await ok(c,'/vacancies/'+v.id+'/favorite','POST',{saved:true},key);await ok(c,'/vacancies/'+v.id+'/favorite','POST',{saved:true},key);await ok(c,'/vacancies/'+v.id+'/favorite','POST',{saved:true});assert.equal((await ok(c,'/vacancies/'+v.id)).saved,true);assert.equal((await ok(other,'/vacancies/'+v.id)).saved,false);
 const saved=await ok(c,'/vacancies?favorites_only=true');assert.equal(saved.total,1);assert.equal(saved.saved_count,1);assert.equal(saved.items[0].id,v.id);assert.equal((await ok(other,'/vacancies?favorites_only=true')).total,0);assert.equal((await call(catalogFixture.client,'/vacancies/'+v.id+'/favorite','POST',{saved:true})).status,403);
 const archived=await ok(catalogFixture.client,'/vacancies/'+v.id+'/actions','POST',{expected_revision:catalogVacancy.revision,action:'archive'});assert.equal((await ok(c,'/vacancies?favorites_only=true')).total,0);assert.equal((await call(c,'/vacancies/'+v.id)).status,404);await ok(c,'/vacancies/'+v.id+'/favorite','POST',{saved:false});assert.equal((await call(c,'/vacancies/'+v.id+'/favorite','POST',{saved:true})).status,404);
 catalogVacancy=await ok(catalogFixture.client,'/vacancies/'+v.id+'/actions','POST',{expected_revision:archived.revision,action:'publish'});
});
scenario('обработка отклика, история, гонка отзыва и приглашение без обхода согласия',async()=>{
 const c=await login('qa-workflow-'+randomUUID()+'@oop.test'),e=catalogFixture.client,path='/applications/';
 let initial=await ok(c,'/me/resume');initial=await ok(c,'/me/resume','PATCH',{expected_revision:initial.revision,name:'Синтетический кандидат обработки',about:'Проверка обработки откликов.',skills:['Python','PostgreSQL']});await ok(c,'/me/resume/publication','POST',{expected_revision:initial.revision,action:'publish',consent_version:'publication-0.8-demo',consent_accepted:true});
 let a=await ok(c,'/vacancies/'+catalogVacancy.id+'/applications','POST',{cover_letter:'Синтетический отклик для проверки обработки.'});
 assert.equal((await call(c,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'reject'})).status,403);assert.equal((await call(employerB,path+a.id)).status,404);assert.equal((await call(employerB,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'review'})).status,404);
 assert.equal((await ok(e,path+a.id)).history.length,1);const key=randomUUID(),viewBody={expected_revision:a.revision,action:'view'};a=await ok(e,path+a.id+'/actions','POST',viewBody,key);assert.equal(a.state,'viewed');assert.equal((await ok(e,path+a.id+'/actions','POST',viewBody,key)).history.length,2);assert.equal(JSON.stringify(a).includes(c.user.email),false);
 const race=await Promise.all([call(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'review',message:'Рассмотрим опыт работы с API.'}),call(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'interview',message:'Предлагаем следующий этап.'})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);a=await ok(e,path+a.id);assert.equal(a.history.length,3);assert.ok((await ok(c,path+a.id)).history.at(-1).message);assert.equal((await call(e,'/candidates/'+c.user.id+'/contact')).status,403);
 if(a.state==='interview')a=await ok(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'review'});
 a=await ok(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'reject',message:'Сейчас нужен другой опыт. Спасибо за отклик.'});assert.equal((await ok(c,'/me/applications?state=rejected&vacancy_id='+catalogVacancy.id)).items[0].state,'rejected');assert.equal((await call(c,'/vacancies/'+catalogVacancy.id+'/applications','POST',{cover_letter:'Повтор'})).status,409);
 a=await ok(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'reopen'});a=await ok(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'interview'});
 const withdrawRace=await Promise.all([call(c,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'withdraw'}),call(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'review'})]);assert.deepEqual(withdrawRace.map(r=>r.status).sort(),[200,409]);a=await ok(c,path+a.id);if(a.state!=='withdrawn')a=await ok(c,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'withdraw'});assert.equal((await ok(e,path+a.id)).profile,null);assert.equal((await call(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'interview'})).status,409);
 a=await ok(c,'/vacancies/'+catalogVacancy.id+'/applications','POST',{cover_letter:'Повторно отправленный синтетический отклик.'});assert.equal(a.state,'sent');assert.equal((await ok(c,path+a.id)).history.at(-1).state,'sent');
 let r=await ok(c,'/me/resume');r=await ok(c,'/me/resume/publication','POST',{expected_revision:r.revision,action:'hide'});assert.equal((await ok(e,path+a.id)).profile,null);assert.equal((await call(e,path+a.id+'/actions','POST',{expected_revision:a.revision,action:'view'})).status,404);await ok(c,'/me/resume/publication','POST',{expected_revision:r.revision,action:'publish',consent_version:'publication-0.8-demo',consent_accepted:true});
 const body={expected_revision:a.revision,salary_min:150000,salary_max:200000,message:'Синтетическое приглашение из отклика: обсудим задачу на встрече.'},inviteKey=randomUUID();assert.equal((await call(employerB,path+a.id+'/invitation','POST',body)).status,404);assert.equal((await call(e,path+a.id+'/invitation','POST',{...body,salary_min:210000})).status,422);
 const invite=await ok(e,path+a.id+'/invitation','POST',body,inviteKey);assert.equal((await ok(e,path+a.id+'/invitation','POST',body,inviteKey)).id,invite.id);assert.equal((await ok(e,path+a.id)).invitation.id,invite.id);assert.equal((await ok(c,path+a.id)).invitation.id,invite.id);assert.equal((await call(e,path+a.id+'/invitation','POST',body)).status,409);assert.equal((await call(e,'/candidates/'+c.user.id+'/contact')).status,403);
 const viewed=await ok(c,'/invitations/'+invite.id);await ok(c,'/invitations/'+invite.id+'/response','POST',{expected_revision:viewed.revision,action:'accept'});assert.equal((await ok(e,'/candidates/'+c.user.id+'/contact')).email,c.user.email);assert.equal((await call(employerB,'/candidates/'+c.user.id+'/contact')).status,403);
});
scenario('OTP блокировка после пяти ошибок и приватные файлы недоступны по HTTP',async()=>{
 const c=client(),ch=await ok(c,'/auth/otp','POST',{email:'bad-'+randomUUID()+'@oop.test',role:'candidate'});
 for(let i=0;i<5;i++)assert.equal((await call(c,'/auth/otp/verify','POST',{challenge_id:ch.challenge_id,code:'000000'})).status,422);
 assert.equal((await call(c,'/auth/otp/verify','POST',{challenge_id:ch.challenge_id,code:'123456'})).status,410);
 const r=await fetch(base+'/private/professional.json');assert.equal(r.status,404);
 const assets=await (await fetch(base+'/app.js')).text();assert.equal(assets.includes('answer_key'),false);assert.equal(assets.includes('reference_answer'),false);
});
