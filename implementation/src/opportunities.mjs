import {one,all,audit} from './db.mjs';
import {fail,checkRevision,uuidPattern} from './errors.mjs';
import {ownNeed} from './matching.mjs';
import {validateNeed,publicProfile} from './profiles.mjs';
import {ownInvitation,createInvitation} from './invitations.mjs';
import {validate} from './validation.mjs';
const role=(c,expected)=>{if(c.user.role!==expected)fail(403,'wrong_role','Действие недоступно для этой роли.');};
const party=c=>{if(!['candidate','employer'].includes(c.user.role))fail(403,'wrong_role','Доступно таланту и работодателю.');};
const pageSize=12;
const states=['sent','viewed','reviewing','interview','rejected','withdrawn'];
export const defaultVacancyFilters={q:'',specialization:'',grade:'',work_mode:'',salary_floor:0,skill:'',favorites_only:false,sort:'newest'};
function pageNumber(query){const value=query.page??'1';if(typeof value!=='string'||!/^\d+$/.test(value)||Number(value)<1||Number(value)>100000)fail(422,'invalid_query','Некорректная страница.');return Number(value);}
function allowedQuery(query,names){if(Object.keys(query).some(k=>!names.includes(k))||Object.values(query).some(v=>typeof v!=='string'))fail(422,'invalid_query','Некорректные параметры фильтра.');}
function catalogFilters(query){
 allowedQuery(query,[...Object.keys(defaultVacancyFilters),'page','state']);
 const f={...defaultVacancyFilters,...Object.fromEntries(Object.entries(query).filter(([k])=>k in defaultVacancyFilters))};
 if(query.salary_floor!=null&&!/^\d+$/.test(query.salary_floor))fail(422,'invalid_query','Зарплата должна быть целым положительным числом.');
 if(query.favorites_only!=null&&!['true','false'].includes(query.favorites_only))fail(422,'invalid_query','Некорректный фильтр сохранённых вакансий.');
 f.salary_floor=Number(f.salary_floor);f.favorites_only=f.favorites_only===true||f.favorites_only==='true';validate('VacancyFilters',f);return f;
}
export async function vacancySnapshot(db,companyId,n){const company=await one(db,'SELECT data FROM companies WHERE id=$1',[companyId]);return {...n.data,company_name:company.data.name,company_description:company.data.description};}
export const vacancyView=v=>({id:v.id,company_id:v.company_id,need_id:v.need_id,revision:v.revision,state:v.state,...v.data,created_at:v.created_at.toISOString()});
async function ownVacancy(c,lock=false){party(c);const v=await one(c.db,'SELECT * FROM vacancies WHERE id=$1'+(lock?' FOR UPDATE':''),[c.req.params.vacancy_id]);if(!v||(c.user.role==='employer'?v.company_id!==c.user.company_id:v.state!=='published'))fail(404,'not_found','Вакансия не найдена.');return v;}
async function ownApplication(c,lock=false){party(c);const a=await one(c.db,'SELECT a.* FROM applications a JOIN vacancies v ON v.id=a.vacancy_id WHERE a.id=$1 AND '+(c.user.role==='candidate'?'a.candidate_id=$2':'v.company_id=$2')+(lock?' FOR UPDATE OF a':''),[c.req.params.application_id,c.user.role==='candidate'?c.user.id:c.user.company_id]);if(!a)fail(404,'not_found','Отклик не найден.');return a;}
async function applicationView(c,a,history=false){
 let profile=null;
 if(c.user.role==='employer'&&a.state!=='withdrawn'){try{profile=await publicProfile(c.db,a.candidate_id);}catch(e){if(e.status!==404)throw e;}}
 const vacancy=await one(c.db,'SELECT * FROM vacancies WHERE id=$1',[a.vacancy_id]);
 const invitation=history?await one(c.db,"SELECT id,state FROM invitations WHERE candidate_id=$1 AND company_id=$2 AND need_id=$3 AND state IN('sent','viewed','accepted') ORDER BY created_at DESC LIMIT 1",[a.candidate_id,vacancy.company_id,vacancy.need_id]):null;
 return {id:a.id,revision:a.revision,state:a.state,cover_letter:a.cover_letter,created_at:a.created_at.toISOString(),updated_at:a.updated_at.toISOString(),vacancy:vacancyView(vacancy),...(c.user.role==='employer'?{profile}:{}),...(history?{invitation,history:(await all(c.db,'SELECT actor_role,state,message,created_at FROM application_events WHERE application_id=$1 ORDER BY id',[a.id])).map(e=>({...e,created_at:e.created_at.toISOString()}))}:{})};
}
async function event(c,a,state,message=''){await c.db.query('INSERT INTO application_events(application_id,actor_id,actor_role,state,message) VALUES($1,$2,$3,$4,$5)',[a.id,c.user.id,c.user.role,state,message]);await audit(c.db,c.user.id,'application.'+state,a.id);}
async function preferences(c,lock=false){role(c,'candidate');await c.db.query('INSERT INTO vacancy_preferences(candidate_id) VALUES($1) ON CONFLICT DO NOTHING',[c.user.id]);return one(c.db,'SELECT revision,filters FROM vacancy_preferences WHERE candidate_id=$1'+(lock?' FOR UPDATE':''),[c.user.id]);}
export const opportunityHandlers={
 vacancy_list:async c=>{
  party(c);const f=catalogFilters(c.req.query),page=pageNumber(c.req.query),values=[];
  const param=x=>{values.push(x);return '$'+values.length;},where=[];
  if(c.user.role==='candidate'){if(c.req.query.state)fail(422,'invalid_query','Таланту доступны только опубликованные вакансии.');where.push("v.state='published'");}
  else {if(f.favorites_only)fail(403,'wrong_role','Сохранённые вакансии доступны таланту.');where.push('v.company_id='+param(c.user.company_id));if(c.req.query.state)where.push('v.state='+param(c.req.query.state));}
  if(f.q)where.push("strpos(lower(concat_ws(' ',v.data->>'title',v.data->>'company_name',v.data->>'task_text',v.data->>'expected_result')),lower("+param(f.q.trim())+'))>0');
  if(f.specialization)where.push("v.data->>'specialization'="+param(f.specialization));
  if(f.grade)where.push("v.data->>'min_grade'="+param(f.grade));
  if(f.work_mode)where.push("v.data->'work_modes' ? "+param(f.work_mode));
  if(f.salary_floor)where.push("(v.data->>'salary_min')::numeric >= "+param(f.salary_floor));
  if(f.skill)where.push("EXISTS(SELECT 1 FROM jsonb_array_elements_text((v.data->'must_skills')||(v.data->'preferred_skills')) s WHERE lower(s)=lower("+param(f.skill.trim())+'))');
  const favorite="EXISTS(SELECT 1 FROM vacancy_favorites f WHERE f.vacancy_id=v.id AND f.candidate_id="+param(c.user.id)+')';
  if(f.favorites_only)where.push(favorite);
  const clause=where.join(' AND '),total=Number((await one(c.db,'SELECT count(*),count(*) FILTER(WHERE '+favorite+') AS filtered_saved FROM vacancies v WHERE '+clause,values)).count);
  const application="(SELECT a.state FROM applications a WHERE a.vacancy_id=v.id AND a.candidate_id=$"+values.length+')';
  const rows=await all(c.db,'SELECT v.*,'+favorite+' AS saved,'+application+' AS application_state FROM vacancies v WHERE '+clause+' ORDER BY '+(f.sort==='salary_desc'?"(v.data->>'salary_min')::numeric DESC,":'')+'v.created_at DESC,v.id DESC LIMIT '+pageSize+' OFFSET '+((page-1)*pageSize),values);
  const saved_count=c.user.role==='candidate'?Number((await one(c.db,"SELECT count(*) FROM vacancy_favorites f JOIN vacancies v ON v.id=f.vacancy_id WHERE f.candidate_id=$1 AND v.state='published'",[c.user.id])).count):0;
  return {items:rows.map(v=>({...vacancyView(v),saved:v.saved,application_state:v.application_state})),total,page,page_size:pageSize,saved_count};
 },
 vacancy_get:async c=>{const v=await ownVacancy(c);return {...vacancyView(v),saved:c.user.role==='candidate'?!!await one(c.db,'SELECT 1 FROM vacancy_favorites WHERE candidate_id=$1 AND vacancy_id=$2',[c.user.id,v.id]):false,application_state:(await one(c.db,'SELECT state FROM applications WHERE candidate_id=$1 AND vacancy_id=$2',[c.user.id,v.id]))?.state||null};},
 vacancy_preferences_get:async c=>preferences(c),
 vacancy_preferences_update:async c=>{const p=await preferences(c,true);checkRevision(p,c.req.body.expected_revision);return one(c.db,'UPDATE vacancy_preferences SET filters=$1,revision=revision+1 WHERE candidate_id=$2 RETURNING revision,filters',[c.req.body.filters,c.user.id]);},
 vacancy_favorite:async c=>{
  role(c,'candidate');const v=await one(c.db,'SELECT * FROM vacancies WHERE id=$1',[c.req.params.vacancy_id]);
  if(!v||(v.state!=='published'&&(c.req.body.saved||!await one(c.db,'SELECT 1 FROM vacancy_favorites WHERE candidate_id=$1 AND vacancy_id=$2',[c.user.id,v.id]))))fail(404,'not_found','Вакансия не найдена.');
  if(c.req.body.saved)await c.db.query('INSERT INTO vacancy_favorites(candidate_id,vacancy_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[c.user.id,v.id]);
  else await c.db.query('DELETE FROM vacancy_favorites WHERE candidate_id=$1 AND vacancy_id=$2',[c.user.id,v.id]);
  await audit(c.db,c.user.id,c.req.body.saved?'vacancy.saved':'vacancy.unsaved',v.id);return {saved:c.req.body.saved};
 },
 vacancy_create:async c=>{role(c,'employer');const n=await ownNeed(c.db,c.user,c.req.body.need_id);if(n.state!=='published')fail(409,'need_not_published','Опубликуйте потребность перед созданием вакансии.');await validateNeed(c.db,c.user.company_id,n.data);const v=await one(c.db,'INSERT INTO vacancies(company_id,need_id,data) VALUES($1,$2,$3) ON CONFLICT(company_id,need_id) DO UPDATE SET need_id=excluded.need_id RETURNING *',[c.user.company_id,n.id,await vacancySnapshot(c.db,c.user.company_id,n)]);return vacancyView(v);},
 vacancy_action:async c=>{role(c,'employer');const v=await ownVacancy(c,true);checkRevision(v,c.req.body.expected_revision);let data=v.data;if(c.req.body.action==='publish'){const n=await ownNeed(c.db,c.user,v.need_id);if(n.state!=='published')fail(409,'need_not_published','Потребность должна быть опубликована.');await validateNeed(c.db,c.user.company_id,n.data);data=await vacancySnapshot(c.db,c.user.company_id,n);}const row=await one(c.db,'UPDATE vacancies SET state=$1,data=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING *',[c.req.body.action==='publish'?'published':'archived',data,v.id]);await audit(c.db,c.user.id,'vacancy.'+c.req.body.action,v.id);return vacancyView(row);},
 application_create:async c=>{
  role(c,'candidate');await c.db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[c.user.id]);const v=await ownVacancy(c,true);await publicProfile(c.db,c.user.id);
  const prior=await one(c.db,'SELECT * FROM applications WHERE vacancy_id=$1 AND candidate_id=$2 FOR UPDATE',[v.id,c.user.id]);if(prior&&prior.state!=='withdrawn')fail(409,'already_applied','Отклик уже отправлен. Текущее состояние видно в «Моих откликах».');
  const row=prior?await one(c.db,"UPDATE applications SET state='sent',cover_letter=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *",[c.req.body.cover_letter,prior.id]):await one(c.db,'INSERT INTO applications(vacancy_id,candidate_id,cover_letter) VALUES($1,$2,$3) RETURNING *',[v.id,c.user.id,c.req.body.cover_letter]);
  await event(c,row,'sent');return applicationView(c,row);
 },
 application_list:async c=>{
  party(c);allowedQuery(c.req.query,['page','state','vacancy_id']);const page=pageNumber(c.req.query),values=[c.user.role==='candidate'?c.user.id:c.user.company_id],owner=c.user.role==='candidate'?'a.candidate_id=$1':'v.company_id=$1',filters=[];
  if(c.req.query.state){if(!states.includes(c.req.query.state))fail(422,'invalid_query','Некорректный статус.');values.push(c.req.query.state);filters.push('a.state=$'+values.length);}
  if(c.req.query.vacancy_id){if(!uuidPattern.test(c.req.query.vacancy_id))fail(422,'invalid_query','Некорректная вакансия.');values.push(c.req.query.vacancy_id);filters.push('v.id=$'+values.length);}
  const base=' FROM applications a JOIN vacancies v ON v.id=a.vacancy_id WHERE '+owner,clause=base+(filters.length?' AND '+filters.join(' AND '):'');
  const total=Number((await one(c.db,'SELECT count(*)'+clause,values)).count),rows=await all(c.db,'SELECT a.*'+clause+' ORDER BY a.updated_at DESC,a.id DESC LIMIT '+pageSize+' OFFSET '+((page-1)*pageSize),values);
  const counts=Object.fromEntries((await all(c.db,'SELECT a.state,count(*)'+base+' GROUP BY a.state',[values[0]])).map(r=>[r.state,Number(r.count)]));
  const vacancies=await all(c.db,"SELECT DISTINCT v.id,v.data->>'title' AS title"+base+' ORDER BY title,v.id',[values[0]]);
  return {items:await Promise.all(rows.map(a=>applicationView(c,a))),total,page,page_size:pageSize,counts,vacancies};
 },
 application_get:async c=>applicationView(c,await ownApplication(c),true),
 application_action:async c=>{
  const action=c.req.body.action;if(action==='withdraw')role(c,'candidate');else role(c,'employer');const a=await ownApplication(c,true);checkRevision(a,c.req.body.expected_revision);
  const target={withdraw:'withdrawn',view:'viewed',review:'reviewing',interview:'interview',reject:'rejected',reopen:'reviewing'}[action];
  const allowed={withdraw:['sent','viewed','reviewing','interview','rejected'],view:['sent'],review:['sent','viewed','interview'],interview:['sent','viewed','reviewing'],reject:['sent','viewed','reviewing','interview'],reopen:['rejected']};
  if(!allowed[action].includes(a.state))fail(409,'invalid_transition','Этот статус уже изменился или действие недоступно. Обновите список откликов.');
  if(['view','review','interview','reopen'].includes(action))await publicProfile(c.db,a.candidate_id);
  const row=await one(c.db,'UPDATE applications SET state=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *',[target,a.id]);await event(c,row,target,c.req.body.message||'');return applicationView(c,row,true);
 },
 application_invitation:async c=>{
  role(c,'employer');const a=await ownApplication(c,true);checkRevision(a,c.req.body.expected_revision);if(['withdrawn','rejected'].includes(a.state))fail(409,'inactive_application','Для предложения нужен действующий отклик.');
  const v=await one(c.db,'SELECT * FROM vacancies WHERE id=$1',[a.vacancy_id]);if(v.state!=='published')fail(409,'vacancy_not_published','Вакансия больше не опубликована.');await publicProfile(c.db,a.candidate_id);
  if(await one(c.db,"SELECT id FROM invitations WHERE candidate_id=$1 AND company_id=$2 AND need_id=$3 AND state IN('sent','viewed','accepted')",[a.candidate_id,c.user.company_id,v.need_id]))fail(409,'invitation_exists','Предложение по этой потребности уже есть в «Приглашениях».');
  return createInvitation({...c,req:{...c.req,body:{need_id:v.need_id,candidate_id:a.candidate_id,salary_min:c.req.body.salary_min,salary_max:c.req.body.salary_max,message:c.req.body.message,currency:'RUB',period:'month',tax_basis:'gross'}}});
 },
 invitation_context:async c=>{party(c);const i=await ownInvitation(c.db,c.user,c.req.params.invitation_id),company=await one(c.db,'SELECT data FROM companies WHERE id=$1',[i.company_id]),n=await one(c.db,'SELECT data FROM needs WHERE id=$1',[i.need_id]);return {company_name:company.data.name,company_description:company.data.description,role_title:n.data.title,work_modes:n.data.work_modes};}
};
