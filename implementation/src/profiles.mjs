import { one, all, audit } from './db.mjs';
import { fail, checkRevision } from './errors.mjs';
import { validateSkills, salary } from './validation.mjs';
import { legalDocuments } from './auth.mjs';
import {potentialProfile} from './potential.mjs';
export const patchData = body => Object.fromEntries(Object.entries(body).filter(([k])=>k!=='expected_revision'));
export function document(row) {return {...row.data,id:row.id,revision:row.revision,...(row.publication_state?{publication_state:row.publication_state}:{}),...(row.company_id?{company_id:row.company_id,state:row.state}:{}),...(row.owner_id&&row.data.representative_email?{verified:false}:{})};}
export async function self(db,id,lock=false) {const row=await one(db,'SELECT * FROM self_assessments WHERE owner_id=$1'+(lock?' FOR UPDATE':''),[id]);return {...row,...{data:{S1:null,S2:null,S3:null,S4:null,S5:null,S6:null,...row.data}}};}
export const selfView = row => ({revision:row.revision,version:'self-0.8.0',state:row.state,reflection:'',support:'',...row.data});
export async function credential(db,id,specialization='Backend') {return one(db,"SELECT * FROM credentials WHERE owner_id=$1 AND specialization=$2 ORDER BY CASE grade WHEN 'Senior' THEN 3 WHEN 'Middle' THEN 2 ELSE 1 END DESC,verified_at DESC LIMIT 1",[id,specialization]);}
export async function resume(db,id) {
 const r=await one(db,'SELECT * FROM resumes WHERE owner_id=$1',[id]);if(!r)fail(404,'not_found','Профиль не найден.');
 const c=await credential(db,id,r.data.specialization),a=await one(db,'SELECT state,outcome FROM attempts WHERE owner_id=$1 AND specialization=$2 ORDER BY started_at DESC LIMIT 1',[id,r.data.specialization]);
 const {domain,demo_fixture,...safe}=document(r);
 return {...safe,self_assessment:selfView(await self(db,id)),confirmed_grade:c?.grade||null,credential_id:c?.id||null,professional_status:c?'verified':a?.outcome||(['evaluation_pending','review_pending'].includes(a?.state)?a.state:'none')};
}
export async function fspEvents(db,id) {return (await all(db,'SELECT data FROM fsp_events WHERE owner_id=$1 ORDER BY source_event_id',[id])).map(r=>r.data);}
export async function publicProfile(db,id,preview=false) {
 const r=await one(db,'SELECT * FROM resumes WHERE owner_id=$1',[id]);if(!r||(!preview&&r.publication_state!=='published'))fail(404,'not_found','Опубликованный профиль не найден.');
 const c=await credential(db,id,r.data.specialization),d=r.data,v=d.visibility_sections||[];
 let potential_summary=null;
 if(v.includes('assessment')){const session=await one(db,'SELECT * FROM cognitive_sessions WHERE owner_id=$1 ORDER BY started_at DESC LIMIT 1',[id]);if(session?.state==='completed'){const p=potentialProfile(await all(db,'SELECT ordinal,correct,submitted_at FROM cognitive_tasks WHERE session_id=$1',[session.id]),session.state,session.version);potential_summary={learning:p.directions[1].headline,flexibility:p.directions[2].headline,version:session.version};}}
 return {candidate_id:id,display_name:d.name_visibility&&d.name?d.name:'Талант #'+id.slice(0,8),specialization:d.specialization,declared_grade:d.declared_grade,confirmed_grade:c?.grade||null,credential_id:c?.id||null,about:d.about,skills:v.includes('skills')?d.skills:[],experience_text:v.includes('experience')?d.experience_text:'',fsp_events:v.includes('fsp')?await fspEvents(db,id):[],potential_summary,source_labels:['Навыки заявлены в резюме',...(c?[c.synthetic?'Демо-результат профессиональной оценки':'Профессиональная проверка · '+c.verified_at.toISOString()]:['Уровень не подтверждён'])]};
}
export async function updateDocument(ctx,table) {
 const {db,user,req}=ctx,owner=table==='needs'?'company_id':'owner_id',id=table==='needs'?req.params.need_id:user.id,sql=table==='needs'?'id=$1 AND company_id=$2':owner+'=$1',values=table==='needs'?[id,user.company_id]:[id];
 const r=await one(db,`SELECT * FROM ${table} WHERE ${sql} FOR UPDATE`,values);if(!r)fail(404,'not_found','Запись не найдена.');checkRevision(r,req.body.expected_revision);validateSkills(req.body);
 const data={...r.data,...patchData(req.body)};salary(data);
 if(data.preferred_skills)data.preferred_skills=data.preferred_skills.filter(x=>!data.must_skills?.includes(x));
 if(table==='resumes'&&data.contact_email!==user.email)fail(422,'contact_email','Контактный email должен совпадать с подтверждённым email.');
 const row=await one(db,`UPDATE ${table} SET data=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *`,[data,r.id]);
 await audit(db,user.id,table+'.updated',r.id);
 return table==='resumes'?resume(db,user.id):document(row);
}
export async function selfPatch({db,user,req}) {
 const r=await self(db,user.id,true);checkRevision(r,req.body.expected_revision);const data={...r.data,...patchData(req.body)},changed=JSON.stringify(data)!==JSON.stringify(r.data);
 const row=await one(db,"UPDATE self_assessments SET data=$1,state=$2,revision=revision+1 WHERE owner_id=$3 RETURNING *",[data,changed?'in_progress':r.state,user.id]);return selfView(row);
}
export async function selfAction({db,user,req}) {
 const r=await self(db,user.id,true);checkRevision(r,req.body.expected_revision);const a=req.body.action;
 if(a==='complete'&&['S1','S2','S3','S4','S5','S6'].some(k=>r.data[k]==null))fail(422,'incomplete_self','Заполните пять шкал и выберите подход.');
 const row=await one(db,'UPDATE self_assessments SET state=$1,revision=revision+1 WHERE owner_id=$2 RETURNING *',[a==='complete'?'completed':a==='defer'?'deferred':r.state==='completed'?'completed':'in_progress',user.id]);return selfView(row);
}
export async function publication({db,user,req}) {
 const r=await one(db,'SELECT * FROM resumes WHERE owner_id=$1 FOR UPDATE',[user.id]);checkRevision(r,req.body.expected_revision);
 if(req.body.action==='publish'){
  if(req.body.consent_version!==legalDocuments[1].version||req.body.consent_accepted!==true)fail(422,'publication_consent','Подтвердите отдельное согласие на публикацию.');
  if(!r.data.specialization||!r.data.declared_grade||!r.data.about.trim()||!r.data.skills.length)fail(422,'incomplete_profile','Для публикации заполните специализацию, уровень, описание и хотя бы один навык.');
  await db.query("INSERT INTO consents(owner_id,kind,version) VALUES($1,'publication',$2)",[user.id,req.body.consent_version]);
 } else if(req.body.revoke_all_contacts!==false)await db.query('UPDATE contact_grants SET revoked_at=now(),revision=revision+1 WHERE candidate_id=$1 AND revoked_at IS NULL',[user.id]);
 await db.query('UPDATE resumes SET publication_state=$1,revision=revision+1,updated_at=now() WHERE id=$2',[req.body.action==='publish'?'published':'hidden',r.id]);await audit(db,user.id,'resume.'+req.body.action,r.id);return resume(db,user.id);
}
export async function program(db,id) {
 await db.query("UPDATE attempts SET state='expired',revision=revision+1 WHERE owner_id=$1 AND state IN('paused','answering_B','answering_A','answering_V','generating_A','generating_V') AND expires_at<=now()",[id]);
 const s=await self(db,id),a=await one(db,"SELECT * FROM attempts WHERE owner_id=$1 ORDER BY (state IN('paused','answering_B','answering_A','answering_V','generating_A','generating_V')) DESC,(state NOT IN('finalized','expired')) DESC,started_at DESC LIMIT 1",[id]),c=await one(db,'SELECT * FROM cognitive_sessions WHERE owner_id=$1 ORDER BY started_at DESC LIMIT 1',[id]),states=await all(db,'SELECT * FROM program_blocks WHERE owner_id=$1',[id]);
 const blocks=[{id:'self',state:s.state,resource_id:null},...['professional','cognitive'].map(b=>({id:b,state:b==='professional'&&a&&['paused','answering_B','answering_A','answering_V','generating_A','generating_V'].includes(a.state)?(states.find(x=>x.block===b)?.state==='deferred'?'deferred':'in_progress'):states.find(x=>x.block===b)?.state||'not_started',resource_id:(b==='professional'?a:c)?.id||null}))];
 blocks.sort((a,b)=>['self','cognitive','professional'].indexOf(a.id)-['self','cognitive','professional'].indexOf(b.id));
 const incomplete=blocks.filter(b=>b.state!=='completed');return {blocks,next_block:(incomplete.find(b=>b.state!=='deferred')||incomplete[0])?.id||'profile',completed:!incomplete.length};
}
export async function validateNeed(db,companyId,d) {
 salary(d);validateSkills(d);
 const c=await one(db,'SELECT * FROM companies WHERE id=$1',[companyId]);
 const missing=[];
 for(const k of ['title','specialization','min_grade'])if(!d[k]?.trim())missing.push(k);
 if(d.task_text.trim().length<20)missing.push('task_text');if(d.expected_result.trim().length<10)missing.push('expected_result');
 if(!d.must_skills.length&&!d.preferred_skills.length)missing.push('skills');if(!d.work_modes.length)missing.push('work_modes');if(!d.salary_min||!d.salary_max)missing.push('salary');
 if(!c.data.name||!c.data.representative_name||!c.data.representative_role||!c.data.representative_email)missing.push('company');
 if(missing.length)fail(422,'incomplete_need','Заполните поля перед публикацией: '+missing.join(', '));
}
export const needDefaults={title:'',task_text:'',expected_result:'',specialization:'',min_grade:'Junior',must_skills:[],preferred_skills:[],domain:null,work_modes:[],salary_min:null,salary_max:null,currency:'RUB',period:'month',tax_basis:'gross'};
