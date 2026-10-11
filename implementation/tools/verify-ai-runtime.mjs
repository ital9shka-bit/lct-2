import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import PDFDocument from 'pdfkit';
import {config} from '../src/config.mjs';
import {pool,one} from '../src/db.mjs';
import {evidenceValid} from '../src/scoring.mjs';
// Two live operations on one unpublished, fictional account. Never logs credentials.
const base='http://127.0.0.1:8088/api/v1';let cookie='',csrf='';
async function call(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 const data=await response.json();assert.ok(response.ok,path+': '+response.status+' '+data.code);return data;
}
try{
 const email='ai-runtime-'+randomUUID()+'@oop.test';
 const challenge=await call('/auth/otp','POST',{email,role:'candidate'});
 const user=await call('/auth/otp/verify','POST',{challenge_id:challenge.challenge_id,code:'123456',registration_consent_version:'registration-0.8-demo',registration_consent_accepted:true});csrf=user.csrf_token;
 const before=await call('/me/resume');
 const pdf=new PDFDocument();const chunks=[];pdf.on('data',chunk=>chunks.push(chunk));const ready=new Promise(resolve=>pdf.on('end',resolve));
 pdf.fontSize(12).text('Fictional resume for a hackathon API check.\nWork history\nLearning Studio, Backend developer, 2023-2026.\nBuilt REST API in Python with PostgreSQL and FastAPI. Added Docker deployment and Git workflows.\nProfile\nBackend developer focused on reliable services and database queries.\nSkills\nPython, PostgreSQL, FastAPI, Docker, Git.');pdf.end();await ready;
 const proposal=await call('/me/resume/import-pdf','POST',{base64:Buffer.concat(chunks).toString('base64'),use_ai:true});assert.equal(proposal.method,'ai');assert.ok(proposal.proposal.skills.includes('PostgreSQL'));assert.ok(proposal.proposal.experience_text.includes('2023'));assert.deepEqual(await call('/me/resume'),before);
 let attempt=await call('/assessments/attempts','POST',{specialization:'Backend',target_grade:'Junior'});
 const task=attempt.tasks.find(t=>t.competency==='sql'&&t.format==='open');assert.ok(task);
 const answer="SELECT customer_id, SUM(amount) FROM orders WHERE status = 'paid' GROUP BY customer_id. Фильтруем оплаченные строки до SUM. Одна строка на customer_id. Проверю два заказа одного клиента с разными статусами: в сумму входит только paid, затем два клиента с разными итогами.";
 const draft=await call(`/assessments/attempts/${attempt.id}/tasks/${task.id}/draft`,'PUT',{expected_revision:task.draft_revision,value_text:answer});
 await call(`/assessments/attempts/${attempt.id}/tasks/${task.id}/submit`,'POST',{draft_revision:draft.draft_revision});
 const deadline=Date.now()+45000;let scored;
 while(Date.now()<deadline){scored=await one(pool,'SELECT * FROM attempt_tasks WHERE id=$1',[task.id]);if(scored.score!=null||scored.evaluation_source==='manual_required')break;await new Promise(resolve=>setTimeout(resolve,700));}
 assert.equal(scored.evaluation_source,'llm');assert.ok(evidenceValid(scored.criteria,scored.private_item,scored.answer));
 const job=await one(pool,"SELECT status,attempts FROM jobs WHERE kind='evaluate' AND payload->>'task_id'=$1",[task.id]);assert.equal(job.status,'done');
 console.log(JSON.stringify({model:config.llmModel,synthetic:true,pdf:{method:proposal.method,skills:proposal.proposal.skills,resume_unchanged:true},worker:{source:scored.evaluation_source,score:scored.score,criteria_valid:true,criteria_count:scored.criteria.length,job_status:job.status,provider_calls:job.attempts}},null,2));
}finally{await pool.end();}
