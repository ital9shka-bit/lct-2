import {one,all,audit} from './db.mjs';
import {fail,checkRevision} from './errors.mjs';
import {config} from './config.mjs';
export const experienceFields=['organization','period','role','contribution','results'];
export const experienceStates=['draft','submitted','in_review','needs_info','verified','partially_verified','not_verified','deferred','no_experience'];
const terminal=['verified','partially_verified','not_verified'];
function role(c,r){if(c.user.role!==r)fail(403,'wrong_role','Недоступно для этой роли.');}
export async function experienceCase(db,owner,lock=false){
 await db.query('INSERT INTO experience_cases(owner_id) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
 return one(db,'SELECT * FROM experience_cases WHERE owner_id=$1'+(lock?' FOR UPDATE':''),[owner]);
}
async function event(c,row,action,message=''){
 await c.db.query('INSERT INTO experience_events(case_id,actor_id,action,state,version,snapshot,message) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,c.user.id,action,row.state,row.version,{entries:row.entries,decision:row.decision},message]);
 await audit(c.db,c.user.id,'experience.'+action,row.id,{version:row.version,state:row.state});
}
async function view(db,row){return {...row,synthetic:config.env==='demo',history:await all(db,'SELECT action,state,version,message,created_at,snapshot FROM experience_events WHERE case_id=$1 ORDER BY id DESC',[row.id])};}
async function reviewerCase(c,lock=false){
 role(c,'reviewer');const row=await one(c.db,'SELECT * FROM experience_cases WHERE id=$1'+(lock?' FOR UPDATE':''),[c.req.params.case_id]);
 if(!row)fail(404,'not_found','Проверка не найдена.');
 if(row.assigned_to!==c.user.id)fail(403,'not_assigned','Сначала возьмите заявку в работу.');return row;
}
function validateEntries(entries){
 if(new Set(entries.map(e=>e.id)).size!==entries.length)fail(422,'duplicate_entry','Записи опыта должны иметь разные идентификаторы.');
 for(const e of entries){for(const field of experienceFields)if(!e[field].trim())fail(422,'incomplete_experience','Заполните сведения об организации, периоде, роли, вкладе и результате.');
  if(e.evidence_url){let url;try{url=new URL(e.evidence_url);}catch{fail(422,'invalid_url','Укажите полную ссылку https://…');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)fail(422,'invalid_url','Допустима http(s) ссылка без логина и пароля.');}
 }
}
export function publicExperience(row){
 if(!row)return {state:'draft',version:null,reviewed_at:null,entries:[],synthetic:false};
 return {state:row.state,version:row.version,reviewed_at:row.reviewed_at?.toISOString()||null,synthetic:row.decision?.synthetic||false,
  entries:(row.decision?.items||[]).map(item=>{const entry=row.entries.find(e=>e.id===item.entry_id);return {organization:entry?.organization||'',period:entry?.period||'',role:entry?.role||'',fields:item.fields,method:item.method};})};
}
export const experienceHandlers={
 experience_get:async c=>{role(c,'candidate');return view(c.db,await experienceCase(c.db,c.user.id));},
 experience_update:async c=>{
  role(c,'candidate');const row=await experienceCase(c.db,c.user.id,true);checkRevision(row,c.req.body.expected_revision);validateEntries(c.req.body.entries);
  if(row.entries.length===c.req.body.entries.length&&row.entries.every((entry,i)=>Object.keys(entry).every(key=>entry[key]===c.req.body.entries[i][key])))return view(c.db,row);
  const saved=await one(c.db,"UPDATE experience_cases SET entries=$1,decision=NULL,state='draft',resume_state=NULL,assigned_to=NULL,reviewed_at=NULL,version=version+1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *",[JSON.stringify(c.req.body.entries),row.id]);
  await event(c,saved,'edited');return view(c.db,saved);
 },
 experience_action:async c=>{
  role(c,'candidate');const row=await experienceCase(c.db,c.user.id,true),b=c.req.body;checkRevision(row,b.expected_revision);let state=row.state,resume=row.resume_state,assigned=row.assigned_to;
  if(b.action==='submit'){
   if(!['draft','needs_info','not_verified','partially_verified'].includes(state))fail(409,'invalid_state','Заявка уже отправлена или завершена.');
   if(!row.entries.length)fail(422,'empty_experience','Добавьте проект или отметьте отсутствие опыта.');validateEntries(row.entries);state='submitted';assigned=null;
  }else if(b.action==='appeal'){
   if(!terminal.includes(state)||!b.message?.trim())fail(422,'appeal_reason','Укажите причину пересмотра завершённой проверки.');state='submitted';assigned=null;
  }else if(b.action==='defer'){
   if(state==='deferred')return view(c.db,row);resume=state;state='deferred';
  }else if(b.action==='resume'){
   if(state!=='deferred')fail(409,'invalid_state','Проверка не отложена.');state=resume||'draft';resume=null;
  }else if(b.action==='no_experience'){
   if(row.entries.length)fail(422,'has_experience','Для этого статуса список проектов должен быть пустым.');state='no_experience';assigned=null;
  }
  const saved=await one(c.db,'UPDATE experience_cases SET state=$1,resume_state=$2,assigned_to=$3,submitted_at=CASE WHEN $1=\'submitted\' THEN now() ELSE submitted_at END,revision=revision+1,updated_at=now() WHERE id=$4 RETURNING *',[state,resume,assigned,row.id]);
  await event(c,saved,b.action,b.message||'');return view(c.db,saved);
 },
 experience_queue:async c=>{role(c,'reviewer');return all(c.db,"SELECT id,state,revision,version,assigned_to,submitted_at,jsonb_array_length(entries) AS entry_count FROM experience_cases WHERE state IN('submitted','in_review') ORDER BY submitted_at,id");},
 experience_claim:async c=>{
  role(c,'reviewer');const row=await one(c.db,'SELECT * FROM experience_cases WHERE id=$1 FOR UPDATE',[c.req.params.case_id]);if(!row)fail(404,'not_found','Заявка не найдена.');checkRevision(row,c.req.body.expected_revision);
  if(row.assigned_to&&row.assigned_to!==c.user.id)fail(403,'already_assigned','Заявка у другого проверяющего.');
  if(!['submitted','in_review'].includes(row.state))fail(409,'invalid_state','Заявка недоступна для проверки.');
  const saved=await one(c.db,"UPDATE experience_cases SET assigned_to=$1,state='in_review',revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *",[c.user.id,row.id]);await event(c,saved,'claimed');return view(c.db,saved);
 },
 experience_detail:async c=>view(c.db,await reviewerCase(c)),
 experience_decide:async c=>{
  const row=await reviewerCase(c,true),b=c.req.body;checkRevision(row,b.expected_revision);if(row.state!=='in_review')fail(409,'invalid_state','Заявка изменилась.');
  if(b.reason.trim().length<10||b.items.some(i=>i.basis.trim().length<10))fail(422,'incomplete_basis','Укажите содержательное основание для решения.');
  const ids=b.items.map(i=>i.entry_id);if(new Set(ids).size!==ids.length||ids.length!==row.entries.length||row.entries.some(e=>!ids.includes(e.id)))fail(422,'incomplete_review','Нужно проверить каждую запись опыта.');
  if(b.items.some(i=>i.method==='reference'&&!row.entries.find(e=>e.id===i.entry_id).reference_permission))fail(422,'reference_permission','Нет разрешения на обращение к представителю по этой записи.');
  const statuses=b.items.flatMap(i=>experienceFields.map(f=>i.fields[f]));
  const state=statuses.includes('needs_info')?'needs_info':statuses.every(s=>s==='verified')?'verified':statuses.includes('verified')?'partially_verified':'not_verified';
  const saved=await one(c.db,'UPDATE experience_cases SET decision=$1,state=$2,reviewed_at=now(),revision=revision+1,updated_at=now() WHERE id=$3 RETURNING *',[{items:b.items,reason:b.reason,synthetic:config.env==='demo'},state,row.id]);
  await event(c,saved,'decided',b.reason);return view(c.db,saved);
 }
};
