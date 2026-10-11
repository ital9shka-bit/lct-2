import { pool,transaction,one } from './db.mjs';
import { config } from './config.mjs';
import { createUser } from './auth.mjs';
import { needDefaults } from './profiles.mjs';
import {enrichDemo,enrichWorkflowDemo} from './demo-content.mjs';
import {enrichReviewDemo} from './review-demo.mjs';
import {enrichExperienceDemo} from './experience-demo.mjs';
import {enrichHackathonDemo} from './hackathon-demo.mjs';
import {enrichPotentialDemo} from './potential-demo.mjs';
if(config.env!=='demo')throw new Error('Seed is only allowed in demo');
await transaction(async db=>{
 await db.query('SELECT pg_advisory_xact_lock(8450801)');
 const existing=await one(db,"SELECT id FROM users WHERE email='candidate@oop.test'");if(existing){console.log('Demo seed already exists');return;}
 const profiles=[['candidate@oop.test','Алексей · synthetic','Middle',88,['Python','PostgreSQL','FastAPI','REST API']],['junior@oop.test','Ирина · synthetic','Junior',79,['Python','PostgreSQL','Git']],['nofsp@oop.test','Дмитрий · synthetic','Middle',82,['Python','PostgreSQL','Docker']],['unverified@oop.test','Мария · synthetic',null,null,['Python','PostgreSQL']]];
 for(const [email,name,grade,score,skills] of profiles){
  const u=await createUser(db,email,'candidate');
  await db.query("UPDATE resumes SET data=data||$1,publication_state='published' WHERE owner_id=$2",[{name,about:'Синтетический профиль для проверки поиска, приглашений и контактов.',experience_text:'Разрабатываю API, работаю с PostgreSQL. Все данные демонстрационные.',skills,name_visibility:false,declared_grade:grade||'Middle',domain:'EdTech'},u.id]);
  if(grade)await db.query("INSERT INTO credentials(owner_id,grade,score,source,synthetic,verified_at) VALUES($1,$2,$3,'synthetic_fixture',true,now()-interval '60 days')",[u.id,grade,score]);
  if(email==='candidate@oop.test')await db.query('INSERT INTO fsp_events(owner_id,source_event_id,data) VALUES($1,$2,$3)',[u.id,'fixture-fsp-1',{source_event_id:'fixture-fsp-1',event_date:'2025-10-01T00:00:00.000Z',specialization:'Backend',placement:2,team_event:true,demo:true,source:'Синтетический пример ФСП'}]);
 }
 for(const [email,name] of [['employer@oop.test','Компания A · synthetic'],['employer-b@oop.test','Компания B · synthetic']]){
  const u=await createUser(db,email,'employer'),c=await one(db,'UPDATE companies SET data=data||$1 WHERE owner_id=$2 RETURNING id',[{name,description:'Демонстрационная компания ООП.',domain:'EdTech',representative_name:'Анна · synthetic',representative_role:'Tech Lead'},u.id]);
  await db.query("INSERT INTO needs(company_id,data,state) VALUES($1,$2,'published')",[c.id,{...needDefaults,title:'Backend API',task_text:'Разработка API и оптимизация запросов PostgreSQL для учебного проекта.',expected_result:'Стабильный API и измеренные улучшения запросов.',specialization:'Backend',min_grade:'Junior',must_skills:['PostgreSQL'],preferred_skills:['Python','Docker'],domain:'EdTech',work_modes:['remote'],salary_min:150000,salary_max:200000}]);
 }
 await createUser(db,'reviewer@oop.test','reviewer');
 console.log('Demo seed created; all profiles are synthetic');
});await transaction(enrichDemo);await transaction(enrichWorkflowDemo);await transaction(enrichExperienceDemo);await transaction(enrichReviewDemo);await transaction(enrichHackathonDemo);await transaction(enrichPotentialDemo);await pool.end();
