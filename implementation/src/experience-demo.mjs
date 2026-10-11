import {randomUUID} from 'node:crypto';
import {one} from './db.mjs';
export async function enrichExperienceDemo(db){
 await db.query('SELECT pg_advisory_xact_lock(8450801)');
 if(await one(db,"SELECT 1 FROM demo_fixture_versions WHERE version='experience-04'"))return;
 const reviewer=await one(db,"SELECT id FROM users WHERE email='reviewer@oop.test'");
 for(const [email,state] of [['candidate@oop.test','partially_verified'],['unverified@oop.test','submitted']]){
  const user=await one(db,'SELECT id FROM users WHERE email=$1',[email]);if(!user)continue;
  const entries=[{id:randomUUID(),organization:'Маяк · демонстрационный проект',period:'2023 — настоящее время',role:'Backend-разработчик',contribution:'Разработал API личных кабинетов на FastAPI и PostgreSQL; исследовал медленные запросы и устранил N+1.',results:'Заявленное снижение p95 каталога с 680 до 190 мс. Период и личный вклад проверяются отдельно от этой метрики.',evidence_url:'',evidence_text:'Приватный synthetic пример: описание изменений, фрагменты плана запросов и протокол разбора проекта. Реальных документов и контактов здесь нет.',reference_permission:false}];
  const decision=state==='partially_verified'?{items:[{entry_id:entries[0].id,fields:{organization:'verified',period:'verified',role:'verified',contribution:'verified',results:'not_verified'},method:'mixed',basis:'Синтетический пример разбора и артефактов. Для метрики p95 запрошен воспроизводимый замер. Реальная проверка человека не проводилась.'}],reason:'Демонстрационное заключение: роль и вклад показаны как проверенные, измерение p95 требует дополнительных оснований.',synthetic:true}:null;
  const row=await one(db,'INSERT INTO experience_cases(owner_id,state,entries,decision,assigned_to,submitted_at,reviewed_at) VALUES($1,$2,$3,$4,$5,now(),CASE WHEN $4::jsonb IS NOT NULL THEN now() ELSE NULL END) ON CONFLICT(owner_id) DO NOTHING RETURNING *',[user.id,state,JSON.stringify(entries),decision,decision?reviewer?.id:null]);
  if(row)await db.query('INSERT INTO experience_events(case_id,actor_id,action,state,version,snapshot,message) VALUES($1,$2,$3,$4,1,$5,$6)',[row.id,reviewer?.id||user.id,'demo_fixture',state,{entries,decision},'Синтетический пример для демонстрации процедуры.']);
  // Only untouched synthetic profiles opt in; existing candidate visibility choices are preserved.
  await db.query("UPDATE resumes SET data=jsonb_set(data,'{visibility_sections}',(data->'visibility_sections')||'\"assessment\"'::jsonb),revision=revision+1 WHERE owner_id=$1 AND revision<=2 AND NOT data->'visibility_sections' ? 'assessment'",[user.id]);
 }
 await db.query("INSERT INTO demo_fixture_versions(version) VALUES('experience-04')");
}
