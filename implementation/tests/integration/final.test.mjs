import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pool,transaction,one} from '../../src/db.mjs';
import {createUser,digest} from '../../src/auth.mjs';
import {validators} from '../../src/validation.mjs';
import {finalize} from '../../src/assessment.mjs';
after(()=>pool.end());
const base=process.env.TEST_BASE||'http://127.0.0.1:8088',origin=process.env.APP_ORIGIN||'http://localhost:8088';
async function actor(role='candidate'){return transaction(async db=>{const u=await createUser(db,'final-qa-'+randomUUID()+'@oop.test',role),token=randomUUID(),csrf=randomUUID();await db.query('INSERT INTO sessions(user_id,token_hash,csrf_token) VALUES($1,$2,$3)',[u.id,digest(token),csrf]);return {...u,token,csrf};});}
async function call(c,path,method='GET',body,key){const r=await fetch(base+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'oop_session='+c.token,'X-CSRF-Token':c.csrf,...(method==='POST'?{'Idempotency-Key':key||randomUUID()}: {})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('Content-Type').includes('application/pdf')?Buffer.from(await r.arrayBuffer()):await r.json()};}
async function ok(c,path,method,body,key){const r=await call(c,path,method,body,key);assert.ok(r.status>=200&&r.status<300,path+' '+r.status+' '+JSON.stringify(r.data));return r.data;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(c,a){for(let n=0;n<40&&a.state.startsWith('generating');n++){await sleep(100);a=await ok(c,'/assessments/attempts/'+a.id);}assert.ok(!a.state.startsWith('generating'));return a;}
test('PDF: извлечение предлагает поля, подтверждение через CAS, повреждённые файлы',async()=>{
 const c=await actor(),e=await actor('employer');let r=await ok(c,'/me/resume');r=await ok(c,'/me/resume','PATCH',{expected_revision:r.revision,about:'Разработчик учебного проекта на React и PostgreSQL.',experience_text:'Учебный проект — разработал API, тесты и интерфейс.',skills:['React','PostgreSQL']});
 const exported=await ok(c,'/me/resume/pdf');assert.equal(exported.subarray(0,5).toString(),'%PDF-');
 const proposal=await ok(c,'/me/resume/import-pdf','POST',{base64:exported.toString('base64')});assert.ok(proposal.proposal.skills.includes('React'));assert.ok(proposal.proposal.about.includes('Разработчик'));assert.ok(proposal.proposal.experience_text.startsWith('Учебный проект'));assert.ok(!proposal.proposal.about.includes('Заявленные навыки'));assert.ok(!proposal.proposal.experience_text.includes('Контакт:'));assert.ok(!proposal.proposal.experience_text.includes('Техническая часть:'));assert.equal((await ok(c,'/me/resume')).revision,r.revision);
 assert.equal((await call(e,'/me/resume/import-pdf','POST',{base64:exported.toString('base64')})).status,403);
 assert.equal((await call(c,'/me/resume/import-pdf','POST',{base64:Buffer.from('not a PDF').toString('base64')})).status,422);
 assert.equal((await call(c,'/me/resume/import-pdf','POST',{base64:Buffer.from('%PDF-1.7 broken document').toString('base64')})).status,422);
 r=await ok(c,'/me/resume','PATCH',{expected_revision:r.revision,about:proposal.proposal.about});assert.equal((await call(c,'/me/resume','PATCH',{expected_revision:r.revision-1,about:'stale'})).status,409);
 r=await ok(c,'/me/resume','PATCH',{expected_revision:r.revision,visibility_sections:['skills'],experience_text:'SECRET_HIDDEN_PROJECT',phone:'SECRET_PRIVATE_PHONE'});await ok(c,'/me/resume/publication','POST',{expected_revision:r.revision,action:'publish',consent_version:'publication-0.8-demo',consent_accepted:true});
 const publicPdf=await ok(e,'/candidates/'+c.id+'/pdf'),publicText=execFileSync('pdftotext',['-','-'],{input:publicPdf,encoding:'utf8'});for(const secret of ['SECRET_HIDDEN_PROJECT','SECRET_PRIVATE_PHONE',c.email,'Контакт:'])assert.equal(publicText.includes(secret),false,secret);assert.ok(publicText.includes('PostgreSQL'));
});
test('контракт и домен: пустые состояния валидны; отраслевой опыт сохраняется с CAS',async()=>{
 const c=await actor(),e=await actor('employer');assert.ok(validators.Company(await ok(e,'/me/company')));
 assert.equal(await ok(c,'/cognitive/sessions/current'),null);
 let context=await ok(c,'/me/profile-context');context=await ok(c,'/me/profile-context','PATCH',{expected_revision:context.revision,domain:'FinTech'});assert.equal(context.domain,'FinTech');
 assert.equal((await call(c,'/me/profile-context','PATCH',{expected_revision:context.revision-1,domain:'SaaS'})).status,409);assert.equal((await call(c,'/me/profile-context','PATCH',{expected_revision:context.revision,domain:'UNKNOWN'})).status,422);
});
test('Frontend Senior: полный маршрут, ручная проверка, назначение и пересмотр',async()=>{
 const c=await actor(),reviewer=await actor('reviewer'),other=await actor('reviewer');const catalog=await ok(c,'/assessments/catalog');assert.equal(catalog.length,6);assert.ok(catalog.every(x=>validators.CatalogEntry(x)));
 let a=await ok(c,'/assessments/attempts','POST',{specialization:'Frontend',target_grade:'Senior'});assert.ok(validators.Attempt(a));assert.equal(a.bank_version,'frontend-0.3.0');
 const bank=JSON.parse(readFileSync(new URL('../../private/extended-frontend.json',import.meta.url)));
 for(let n=0;n<20;n++){a=await settle(c,a);const t=a.tasks.find(t=>!t.submitted),item=bank.items.find(i=>i.id===t.item_id);assert.ok(item);const value=item.format==='closed'?{option_id:item.answer_key}:{value_text:item.reference_answer};const saved=await ok(c,'/assessments/attempts/'+a.id+'/tasks/'+t.id+'/draft','PUT',{expected_revision:t.draft_revision,...value});a=await ok(c,'/assessments/attempts/'+a.id+'/tasks/'+t.id+'/submit','POST',{draft_revision:saved.draft_revision});}
 for(let n=0;n<60&&a.state!=='review_pending';n++){await sleep(100);a=await ok(c,'/assessments/attempts/'+a.id);}assert.equal(a.state,'review_pending');assert.equal(a.tasks.filter(t=>t.format==='closed').length,10);
 let detail=await ok(reviewer,'/internal/reviews/'+a.id);const claim=await ok(reviewer,'/reviews/'+a.id+'/claim','POST',{expected_revision:detail.revision});assert.equal((await call(other,'/internal/reviews/'+a.id)).status,403);assert.equal((await call(other,'/reviews/'+a.id+'/claim','POST',{expected_revision:claim.revision})).status,403);assert.ok(Array.isArray(await ok(other,'/reviews')));
 await transaction(async db=>{const late=await one(db,'SELECT * FROM attempts WHERE id=$1 FOR UPDATE',[a.id]);assert.equal(late.revision,claim.revision);await finalize(db,late);assert.equal((await one(db,'SELECT revision FROM attempts WHERE id=$1',[a.id])).revision,claim.revision);});
 for(const t of a.tasks.filter(t=>t.format==='open')){const p='/reviews/'+a.id+'/tasks/'+t.id,d=await ok(reviewer,p);await ok(reviewer,p,'PUT',{expected_revision:d.revision,criteria:d.criteria.map(x=>({...x,score:1,evidence_quote:d.answer,reason:'Ответ содержит конкретный шаг из рубрики.'})),reason:'Проверка synthetic эталонного ответа.'});}
 detail=await ok(reviewer,'/internal/reviews/'+a.id);let result=await ok(reviewer,'/reviews/'+a.id+'/finalize','POST',{expected_revision:detail.revision,reason:'Все двадцать ответов synthetic проверены.'});assert.equal(result.S,100);assert.equal(result.outcome,'verified');assert.ok(validators.Result(result));
 let r=await ok(c,'/me/resume');assert.equal(r.confirmed_grade,null);r=await ok(c,'/me/resume','PATCH',{expected_revision:r.revision,specialization:'Frontend'});assert.equal(r.confirmed_grade,'Senior');assert.equal((await ok(c,'/me/summary')).technical.grade,'Senior');
 a=await ok(c,'/assessments/attempts/'+a.id);await ok(reviewer,'/reviews/'+a.id+'/reopen','POST',{expected_revision:a.revision,reason:'Пересмотр синтетического заключения для проверки истории.'});assert.equal((await ok(c,'/me/resume')).confirmed_grade,null);
 const prior=await one(pool,'SELECT previous_result FROM review_decisions WHERE attempt_id=$1 AND previous_result IS NOT NULL',[a.id]);assert.equal(prior.previous_result.S,100);
 const history=await ok(c,'/assessments/attempts/'+a.id+'/history');assert.equal(history.find(x=>x.previous_result).previous_result.S,100);assert.equal((await call(await actor(),'/assessments/attempts/'+a.id+'/history')).status,404);
 const t=a.tasks.find(t=>t.format==='open'),p='/reviews/'+a.id+'/tasks/'+t.id,d=await ok(reviewer,p);await ok(reviewer,p,'PUT',{expected_revision:d.revision,criteria:d.criteria.map(x=>({...x,score:0,evidence_quote:null,reason:'Критерий пересмотрен в synthetic сценарии.'})),reason:'Поправка четырёх критериев synthetic ответа.'});
 detail=await ok(reviewer,'/internal/reviews/'+a.id);result=await ok(reviewer,'/reviews/'+a.id+'/finalize','POST',{expected_revision:detail.revision,reason:'Повторное решение по сохранённым ответам.'});assert.ok(result.S<100);assert.equal(result.outcome,'verified');
 const ownSummary=await ok(c,'/me/summary');assert.equal(ownSummary.technical.score,result.S);assert.equal(ownSummary.technical.competencies.find(x=>x.competency===t.competency).C,result.competencies.find(x=>x.competency===t.competency).C);
});
test('две специализации: все черновики видны, общая пауза и возвращение к старшей попытке',async()=>{
 const c=await actor(),b=await ok(c,'/assessments/attempts','POST',{specialization:'Backend',target_grade:'Junior'}),f=await ok(c,'/assessments/attempts','POST',{specialization:'Frontend',target_grade:'Junior'});
 const t=b.tasks[0],saved=await ok(c,'/assessments/attempts/'+b.id+'/tasks/'+t.id+'/draft','PUT',{expected_revision:t.draft_revision,option_id:t.options[1].id});
 assert.deepEqual(new Set((await ok(c,'/me/assessment/active')).map(a=>a.id)),new Set([b.id,f.id]));
 await ok(c,'/me/program/professional/actions','POST',{action:'defer'});
 assert.ok((await ok(c,'/me/assessment/active')).every(a=>a.state==='paused'));
 assert.equal((await call(c,'/assessments/attempts/'+b.id+'/tasks/'+t.id+'/draft','PUT',{expected_revision:saved.draft_revision,option_id:t.options[0].id})).status,409);
 await ok(c,'/me/program/professional/actions','POST',{action:'resume'});
 assert.ok((await ok(c,'/me/assessment/active')).every(a=>a.state==='answering_B'));
 // Synthetic fixture: the newer specialization is completed, while the older has a saved draft.
 await pool.query("UPDATE attempts SET state='finalized',finalized_at=now() WHERE id=$1",[f.id]);await pool.query("UPDATE program_blocks SET state='completed' WHERE owner_id=$1 AND block='professional'",[c.id]);
 assert.equal((await ok(c,'/me/assessment/current')).id,b.id);
 let p=await ok(c,'/me/program');assert.equal(p.blocks.find(x=>x.id==='professional').state,'in_progress');assert.equal(p.blocks.find(x=>x.id==='professional').resource_id,b.id);
 const returned=await ok(c,'/assessments/attempts/'+b.id);assert.equal(returned.tasks[0].draft,t.options[1].id);assert.equal(returned.tasks[0].draft_revision,saved.draft_revision);
 await ok(c,'/me/program/professional/actions','POST',{action:'defer'});assert.equal((await ok(c,'/assessments/attempts/'+b.id)).state,'paused');await ok(c,'/me/program/professional/actions','POST',{action:'resume'});assert.equal((await ok(c,'/assessments/attempts/'+b.id)).state,'answering_B');
 await pool.query("UPDATE attempts SET expires_at=now()-interval '1 second' WHERE id=$1",[b.id]);assert.equal((await ok(c,'/me/assessment/active')).length,0);assert.equal((await ok(c,'/assessments/attempts/'+b.id)).state,'expired');
});
test('20 пользователей: GET и черновики, p95 и отсутствие потерь CAS',async()=>{
 const actors=await Promise.all(Array.from({length:20},()=>actor()));const attempts=await Promise.all(actors.map(c=>ok(c,'/assessments/attempts','POST',{specialization:'Backend',target_grade:'Junior'})));const getTimes=[],draftTimes=[];
 for(let round=0;round<3;round++){await Promise.all(actors.map(async(c,i)=>{let time=performance.now();await ok(c,'/me/resume');getTimes.push(performance.now()-time);const t=attempts[i].tasks[0];time=performance.now();const saved=await ok(c,'/assessments/attempts/'+attempts[i].id+'/tasks/'+t.id+'/draft','PUT',{expected_revision:t.draft_revision,option_id:t.options[0].id});draftTimes.push(performance.now()-time);t.draft_revision=saved.draft_revision;}));}
 const p95=values=>values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];const metrics={concurrency:20,get_operations:getTimes.length,draft_operations:draftTimes.length,get_p95_ms:p95(getTimes),draft_p95_ms:p95(draftTimes),errors:0,environment:'local Docker, Node 20, PostgreSQL 17, synthetic actors'};console.log('LOAD_METRICS '+JSON.stringify(metrics));assert.ok(metrics.get_p95_ms<=1000);assert.ok(metrics.draft_p95_ms<=500);
 if(process.env.TEST_ARTIFACT_DIR){mkdirSync(process.env.TEST_ARTIFACT_DIR,{recursive:true});writeFileSync(process.env.TEST_ARTIFACT_DIR+'/load.json',JSON.stringify(metrics,null,2));}
});
