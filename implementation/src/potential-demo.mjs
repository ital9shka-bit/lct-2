import {one,all} from './db.mjs';
import {createUser} from './auth.mjs';
import {seedPillars} from './hackathon-demo.mjs';
export async function enrichPotentialDemo(db){
 await db.query('SELECT pg_advisory_xact_lock(8450812)');
 if(await one(db,"SELECT 1 FROM demo_fixture_versions WHERE version='potential-01'"))return;
 // Never repurpose an existing account, even if it happens to have the demo email.
 if(!await one(db,"SELECT 1 FROM users WHERE email='growth-demo@oop.test'")){
  const u=await createUser(db,'growth-demo@oop.test','candidate'),reviewer=await one(db,"SELECT * FROM users WHERE email='reviewer@oop.test'");
  const t={name:'Алина Морозова',grade:'Junior',level:2,specialization:'Backend',experience:'Мастерская обучения · Разработчик учебного проекта · 2025 — 2026\nСервис регистрации на мастер-классы.\n• Реализовала API расписания и запись на занятие на Python и PostgreSQL.\n• После review добавила уникальное ограничение для защиты от повторной регистрации.\n• Написала проверку двух одновременных запросов; один проходит, второй получает понятный ответ.\n\nОбразование · Программная инженерия · 2022 — 2026'};
  await db.query("UPDATE resumes SET data=data||$1,publication_state='published' WHERE owner_id=$2",[{name:t.name,name_visibility:true,specialization:'Backend',declared_grade:'Junior',skills:['Python','PostgreSQL','Git','Docker'],about:'Начинающий Backend-разработчик. Осваиваю новые инструменты через небольшой пример и обсуждение результата. В учебном сервисе записи на занятия разобралась с повторами запросов после review и добавила проверку конкурентного доступа. Хочу расти в команде с понятной обратной связью.',experience_text:t.experience,work_modes:['remote'],salary_expectation:110000,domain:'EdTech',visibility_sections:['skills','experience','assessment','fsp'],demo_fixture:'potential-01'},u.id]);
  await seedPillars(db,u,t,reviewer);
  await db.query("UPDATE self_assessments SET data=$1 WHERE owner_id=$2",[{S1:3,S2:2,S3:3,S4:3,S5:2,S6:'C',reflection:'На review заметили, что проверка наличия записи перед INSERT не защищает от двух одновременных запросов. Я воспроизвела гонку, добавила уникальное ограничение и проверила оба ответа API. Теперь сначала формулирую инвариант, затем проверяю конкурирующий сценарий.',support:'Небольшой пример, объяснение причины ошибки и возможность проверить новое правило в другой ситуации.'},u.id]);
  const c=await one(db,'SELECT id FROM cognitive_sessions WHERE owner_id=$1',[u.id]);
  for(const task of await all(db,'SELECT * FROM cognitive_tasks WHERE session_id=$1',[c.id])){
   const correct=[1,3,4,5].includes(task.ordinal)?1:0;
   const answer=correct?task.private_item.answer_key:Object.keys(task.private_item.options).find(key=>key!==task.private_item.answer_key);
   await db.query('UPDATE cognitive_tasks SET correct=$1,answer=$2,draft=$2 WHERE id=$3',[correct,String(answer),task.id]);
  }
  await db.query("UPDATE program_blocks SET state='deferred' WHERE owner_id=$1 AND block='professional'",[u.id]);
 }
 await db.query("INSERT INTO demo_fixture_versions(version) VALUES('potential-01')");
 console.log('Potential demo added once; existing self-assessments and attempts preserved.');
}
