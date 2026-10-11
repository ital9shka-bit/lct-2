import { createHmac } from 'node:crypto';
import { config } from './config.mjs';
import { one, all } from './db.mjs';
import { fail, checkRevision } from './errors.mjs';
import { mergedSeconds } from './scoring.mjs';
import { potentialProfile } from './potential.mjs';
export async function cognitiveOwner(db,user,id,lock=false) {const c=await one(db,'SELECT * FROM cognitive_sessions WHERE id=$1 AND owner_id=$2'+(lock?' FOR UPDATE':''),[id,user.id]);if(!c)fail(404,'not_found','Сессия не найдена.');return c;}
export async function cognitiveView(db,c) {
 const ts=await all(db,'SELECT * FROM cognitive_tasks WHERE session_id=$1 ORDER BY ordinal',[c.id]);
 const observations=[];
 for(const dimension of ['analytical','learning','flexibility']){
  const tasks=ts.filter(t=>t.private_item.dimension===dimension),intervals=await all(db,'SELECT i.* FROM activity_intervals i JOIN cognitive_tasks t ON t.id=i.task_id WHERE t.session_id=$1 AND t.private_item->>\'dimension\'=$2',[c.id,dimension]);
  observations.push({dimension,answered:tasks.filter(t=>t.submitted_at).length,correct:tasks.reduce((s,t)=>s+(t.correct||0),0),active_seconds:mergedSeconds(intervals),sufficient:tasks.every(t=>t.submitted_at)});
 }
 const potential={...potentialProfile(c.state==='completed'?ts:[],c.state,c.version),answered:c.answered_count};
 const t=c.state==='in_progress'?ts[c.answered_count]:null;
 if(t&&!t.opened_at)await db.query('UPDATE cognitive_tasks SET opened_at=now() WHERE id=$1',[t.id]);
 return {id:c.id,revision:c.revision,state:c.state,version:c.version,tasks:t?[{id:t.id,item_id:t.private_item.id,ordinal:t.ordinal,family:t.private_item.family,format:t.private_item.format,stem:t.private_item.stem,options:Object.entries(t.private_item.options||{}).map(([id,text])=>({id,text})),draft:t.draft,draft_revision:t.draft_revision,...(t.private_item.rule_reference?{rule_reference:t.private_item.rule_reference}:{}),...(t.private_item.prompt_title?{prompt_title:t.private_item.prompt_title}:{})}]:[],answered_count:c.answered_count,feedback:c.feedback,observations,potential};
}
export async function startCognitive({db,user,req}) {
 await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
 const existing=await one(db,"SELECT * FROM cognitive_sessions WHERE owner_id=$1 AND state!='completed'",[user.id]);if(existing)return cognitiveView(db,existing);
 const version=req?.body?.version||'cognitive-0.9.0',bank=await one(db,'SELECT data FROM bank_versions WHERE version=$1',[version]);if(!bank)fail(422,'bank_version','Версия заданий недоступна.');
 const c=await one(db,'INSERT INTO cognitive_sessions(owner_id,version) VALUES($1,$2) RETURNING *',[user.id,version]),b=bank.data;
 for(const family of ['C1','C2','C3','C4']){
  const form=(createHmac('sha256',config.secret).update(c.id+'|'+family).digest()[31]&1)?'b':'a';
  for(const i of b.items.filter(i=>i.family===family&&i.id.includes('-'+form)))await db.query('INSERT INTO cognitive_tasks(session_id,ordinal,private_item) VALUES($1,$2,$3)',[c.id,i.step,i]);
 }
 await db.query("UPDATE program_blocks SET state='in_progress' WHERE owner_id=$1 AND block='cognitive'",[user.id]);return cognitiveView(db,c);
}
async function cognitiveTask(ctx) {const c=await cognitiveOwner(ctx.db,ctx.user,ctx.req.params.session_id,true),t=await one(ctx.db,'SELECT * FROM cognitive_tasks WHERE id=$1 AND session_id=$2 FOR UPDATE',[ctx.req.params.task_id,c.id]);if(!t)fail(404,'not_found','Задание не найдено.');return {c,t};}
export async function cognitiveDraft(ctx) {
 const {c,t}=await cognitiveTask(ctx),b={...ctx.req.body,...(t.private_item.format==='closed'?{option_id:ctx.req.body.value}:{value_text:ctx.req.body.value})};if(c.state!=='in_progress'||t.ordinal!==c.answered_count+1||t.submitted_at)fail(409,'step_locked','Шаг недоступен.');checkRevision({revision:t.draft_revision},b.expected_revision);
 if(t.private_item.format==='closed'&&!t.private_item.options[b.option_id])fail(422,'invalid_option','Выберите вариант.');
 if(t.private_item.format==='integer'&&(typeof b.value_text!=='string'||(b.value_text!==''&&!/^-?\d+$/.test(b.value_text))))fail(422,'invalid_number','Введите целое число.');
 const row=await one(ctx.db,'UPDATE cognitive_tasks SET draft=$1,draft_revision=draft_revision+1 WHERE id=$2 RETURNING draft_revision',[b.option_id??b.value_text,t.id]);return cognitiveView(ctx.db,c);
}
function feedbackExplanation(item){
 if(item.explanation)return item.explanation;
 const r=item.rule,n=Number(item.stem.match(/n=(\d+)/)?.[1]);
 if(r.even_add!=null){const first=n%2===0?n+r.even_add:n*r.odd_mul;return `Число ${n} ${n%2===0?'чётное':'нечётное'}, поэтому ${n%2===0?'прибавляем '+r.even_add:'умножаем на '+r.odd_mul}: получаем ${first}. Затем вычитаем ${r.subtract}: результат ${first-r.subtract}. Порядок действий важен.`;}
 if(r.even_div!=null){const first=n%2===0?n/r.even_div:n+r.odd_add;return `Число ${n} ${n%2===0?'чётное':'нечётное'}, поэтому ${n%2===0?'делим на '+r.even_div:'прибавляем '+r.odd_add}: получаем ${first}. Затем умножаем на ${r.multiply}: результат ${first*r.multiply}.` ;}
 if(r.objective==='time')return 'Сравниваем время всех маршрутов. У B оно минимально — 5. Цена на этом шаге не ограничивает выбор.';
 if(r.objective==='price')return 'Сравниваем цены всех маршрутов. У C цена минимальна — 6. Время на этом шаге не ограничивает выбор.';
 return 'Повторите порядок применения условий из задания.';
}
export async function cognitiveSubmit(ctx) {
 const {c,t}=await cognitiveTask(ctx),{db,req,user}=ctx;
 if(t.submitted_at){if(req.body.draft_revision!==t.draft_revision)fail(409,'immutable_answer','Ответ уже отправлен.');return cognitiveView(db,c);}
 if(c.state!=='in_progress'||t.ordinal!==c.answered_count+1)fail(409,'step_locked','Шаг недоступен.');checkRevision({revision:t.draft_revision},req.body.draft_revision);if(!t.draft?.trim())fail(422,'empty_answer','Введите ответ.');
 const correct=String(t.private_item.answer_key)===t.draft?1:0;
 await db.query('UPDATE cognitive_tasks SET answer=draft,correct=$1,submitted_at=now() WHERE id=$2',[correct,t.id]);
 const feedback=[2,4].includes(t.ordinal)?{task_id:t.id,correct:!!correct,explanation:'Правильный ответ: '+(t.private_item.format==='closed'?t.private_item.options[t.private_item.answer_key]:t.private_item.answer_key)+'. '+feedbackExplanation(t.private_item)}:null;
 const row=await one(db,'UPDATE cognitive_sessions SET answered_count=answered_count+1,state=$1,feedback=$2,revision=revision+1 WHERE id=$3 RETURNING *',[feedback?'feedback':t.ordinal===6?'completed':'in_progress',feedback,c.id]);
 if(row.state==='completed')await db.query("UPDATE program_blocks SET state='completed' WHERE owner_id=$1 AND block='cognitive'",[user.id]);return cognitiveView(db,row);
}
export async function cognitiveAction({db,user,req}) {
 const c=await cognitiveOwner(db,user,req.params.session_id,true);checkRevision(c,req.body.expected_revision);const a=req.body.action;
 if(c.state==='completed')fail(409,'completed','Блок завершён.');
 if(a==='advance_feedback'&&c.state!=='feedback')fail(409,'invalid_state','Нет ожидающего разбора.');
 if(a==='resume'&&c.state!=='deferred')fail(409,'invalid_state','Блок не отложен.');
 const row=await one(db,'UPDATE cognitive_sessions SET state=$1,feedback=$2,revision=revision+1 WHERE id=$3 RETURNING *',[a==='pause'?'deferred':a==='resume'&&c.feedback?'feedback':'in_progress',a==='advance_feedback'?null:c.feedback,c.id]);return cognitiveView(db,row);
}
export async function activity({db,user,req}) {
 const c=await cognitiveOwner(db,user,req.params.session_id,true),b=req.body,t=await one(db,'SELECT * FROM cognitive_tasks WHERE id=$1 AND session_id=$2',[b.task_id,c.id]);if(!t)fail(404,'not_found','Задание не найдено.');
 if(c.state!=='in_progress'||t.ordinal!==c.answered_count+1||!b.visible||!b.active)return {ok:true};
 const start=+new Date(b.start_at),end=+new Date(b.end_at);if(end<start||end-start>30000||end>Date.now()+1000||start<+t.opened_at-1000)fail(422,'invalid_interval','Некорректный интервал активности.');
 const existing=await one(db,'SELECT * FROM activity_intervals WHERE id=$1',[b.interval_id]);if(existing&&(existing.task_id!==t.id||+existing.start_at!==start||+existing.end_at!==end))fail(409,'interval_conflict','Интервал уже записан с другими данными.');
 await db.query('INSERT INTO activity_intervals(id,task_id,start_at,end_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[b.interval_id,t.id,b.start_at,b.end_at]);return {ok:true};
}
