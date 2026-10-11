import {one,all} from './db.mjs';
import {needDefaults} from './profiles.mjs';
import {createInvitation} from './invitations.mjs';
import {vacancySnapshot} from './opportunities.mjs';
export async function enrichDemo(db){
 await db.query('SELECT pg_advisory_xact_lock(8450801)');
 if(await one(db,"SELECT 1 FROM demo_fixture_versions WHERE version='candidate-workspace-02'"))return;
 const candidate=await one(db,"SELECT * FROM users WHERE email='candidate@oop.test'");
 if(!candidate)return;
 await db.query('UPDATE resumes SET data=data||$1,revision=revision+1,updated_at=now() WHERE owner_id=$2',[{
  name:'Алексей Смирнов',name_visibility:true,declared_grade:'Middle',specialization:'Backend',work_modes:['remote'],salary_expectation:230000,
  about:'Backend-разработчик с 5 годами опыта. Создаю API на Python и FastAPI, проектирую модели данных в PostgreSQL и разбираю проблемы производительности. Люблю задачи, где важны понятные контракты, надёжность и измеримый результат. Ищу команду, в которой можно отвечать за сервис целиком и участвовать в технических решениях.',
  skills:['Python','PostgreSQL','FastAPI','REST API','Redis','Docker','Git'],visibility_sections:['experience','skills','fsp'],
  experience_text:'Маяк · Backend-разработчик · 2023 — настоящее время\nПлатформа для обучения и командных проектов. Команда из 8 человек.\n• Разработал API для личных кабинетов, учебных заданий и прогресса: FastAPI, PostgreSQL, Redis.\n• Снизил p95 времени ответа каталога с 680 до 190 мс: профилирование SQL, составные индексы и устранение N+1.\n• Добавил идемпотентность для загрузки результатов и платежных событий; повторные запросы перестали создавать дубли.\n• Настроил интеграционные проверки в Docker и участвовал в code review.\n\nКоманда Атлас · Python-разработчик · 2021 — 2023\nВнутренние сервисы для планирования и обработки заявок.\n• Разработал REST API и интеграции с системой учёта: Python, PostgreSQL, Docker.\n• Перевёл длительную обработку документов в фоновую очередь; пользователи получили статус задачи и повторный запуск.\n• Добавил структурированные логи и тесты против повторения найденных ошибок.\n\nУчебный проект · 2020 — 2021\nСервис бронирования рабочих пространств: API, авторизация, ограничения пересекающихся интервалов.\n\nОбразование · Прикладная информатика · 2017 — 2021\nВымышленный пример для демонстрации резюме. Компании, сроки и результаты не являются реальной биографией.'
 },candidate.id]);
 const companies=await all(db,"SELECT c.*,u.email FROM companies c JOIN users u ON u.id=c.owner_id WHERE u.email IN('employer@oop.test','employer-b@oop.test') ORDER BY u.email");
 for(const c of companies){
  const isA=c.email==='employer@oop.test';
  await db.query('UPDATE companies SET data=data||$1,revision=revision+1 WHERE id=$2',[{name:isA?'Маяк · демо':'Команда Атлас · демо',description:isA?'Создаём платформу для обучения и совместной работы. Команда из 8 специалистов: разработка, дизайн и продукт. Работаем короткими итерациями, обсуждаем технические решения и измеряем результат. Вымышленная компания.':'Разрабатываем внутренние сервисы и интеграции для команд. Небольшая инженерная команда, прямое общение с пользователями и ответственность за полный цикл продукта. Вымышленная компания.',representative_name:isA?'Анна Лебедева':'Илья Кузнецов',representative_role:isA?'Руководитель разработки':'Технический директор'},c.id]);
  const original=await one(db,"SELECT * FROM needs WHERE company_id=$1 AND data->>'title'='Backend API' ORDER BY created_at LIMIT 1",[c.id]);
  const data={...needDefaults,title:isA?'Backend-разработчик · платформа обучения':'Python-разработчик · внутренние сервисы',task_text:isA?'Развивать API учебной платформы: задания, прогресс и кабинет команды. Устранить медленные запросы PostgreSQL, добавить надёжную обработку повторных событий и покрыть важные сценарии интеграционными тестами.':'Создавать API для обработки заявок и интеграции с системами учёта. Перенести длительную обработку в фоновые задачи, добавить наблюдаемость и устойчивое поведение при сбоях внешних сервисов.',expected_result:isA?'За первые три месяца: стабильный API прогресса, p95 ключевых методов до 250 мс и тесты для повторных запросов и конфликтов сохранения.':'За первые три месяца: запуск нового сервиса заявок, прозрачные статусы фоновых задач, повторный запуск после сбоев и документация контрактов интеграции.',specialization:'Backend',min_grade:'Junior',must_skills:['PostgreSQL'],preferred_skills:['Python','Docker'],domain:'EdTech',work_modes:['remote'],salary_min:isA?200000:180000,salary_max:isA?260000:240000};
  const n=original?await one(db,'UPDATE needs SET data=$1,revision=revision+1 WHERE id=$2 RETURNING *',[data,original.id]):await one(db,"INSERT INTO needs(company_id,data,state) VALUES($1,$2,'published') RETURNING *",[c.id,data]);
  await db.query("INSERT INTO vacancies(company_id,need_id,data,state) VALUES($1,$2,$3,'published') ON CONFLICT(company_id,need_id) DO NOTHING",[c.id,n.id,await vacancySnapshot(db,c.id,n)]);
  await createInvitation({db,user:{id:c.owner_id,company_id:c.id},req:{body:{candidate_id:candidate.id,need_id:n.id,salary_min:data.salary_min,salary_max:data.salary_max,currency:'RUB',period:'month',tax_basis:'gross',message:isA?'Алексей, ваш опыт с FastAPI и оптимизацией PostgreSQL хорошо подходит задачам нашей платформы. Предлагаем обсудить развитие API прогресса и кабинета команды. В команде есть code review, время на технический долг и гибкое начало дня. Это демонстрационное приглашение.':'Алексей, ищем разработчика, который поможет сделать фоновые процессы надёжнее и упростить интеграции. В вашем демо-резюме видим подходящий опыт. Предлагаем знакомство с командой и обсуждение первой задачи. Это демонстрационное приглашение.'}}});
 }
 await db.query("INSERT INTO demo_fixture_versions(version) VALUES('candidate-workspace-02')");
 console.log('Demo resume, vacancies and invitations enriched once; existing assessment progress kept');
}
export async function enrichWorkflowDemo(db){
 await db.query('SELECT pg_advisory_xact_lock(8450801)');
 if(await one(db,"SELECT 1 FROM demo_fixture_versions WHERE version='vacancy-workflow-03'"))return;
 const examples=[
  ['candidate@oop.test','employer@oop.test','sent','Интересна задача развития API учебной платформы. Работал с FastAPI, PostgreSQL и повторными событиями; готов обсудить первые задачи и ожидания команды. Демонстрационный отклик.',''],
  ['candidate@oop.test','employer-b@oop.test','reviewing','Хочу развивать внутренние сервисы и фоновые процессы. В резюме есть опыт очередей, обработки сбоев и документирования API. Демонстрационный отклик.','Посмотрели ваш опыт. Обсуждаем первую задачу с командой и вернёмся со следующим шагом. Демонстрационное сообщение.'],
  ['junior@oop.test','employer@oop.test','reviewing','Разрабатываю API на Python и работаю с PostgreSQL. Хочу расти в продуктовой команде и готова начать с небольшой самостоятельной задачи. Демонстрационный отклик.','Спасибо за отклик. Рассматриваем опыт и задачи, с которых можно начать. Демонстрационное сообщение.'],
  ['unverified@oop.test','employer@oop.test','rejected','Интересны задачи API и учебные продукты. Готова обсудить свой опыт и пройти проверку компетенций. Демонстрационный отклик.','Для текущей задачи нужен опыт сопровождения сервиса. Спасибо за интерес; можно вернуться к другим задачам команды. Демонстрационное сообщение.']
 ];
 for(const [candidateEmail,employerEmail,state,letter,message] of examples){
  const candidate=await one(db,'SELECT id FROM users WHERE email=$1',[candidateEmail]),employer=await one(db,'SELECT c.id,c.owner_id FROM companies c JOIN users u ON u.id=c.owner_id WHERE u.email=$1',[employerEmail]);
  if(!candidate||!employer)continue;
  const v=await one(db,"SELECT id FROM vacancies WHERE company_id=$1 AND state='published' ORDER BY created_at,id LIMIT 1",[employer.id]);if(!v)continue;
  const a=await one(db,"INSERT INTO applications(vacancy_id,candidate_id,state,cover_letter,revision,created_at,updated_at) VALUES($1,$2,$3,$4,$5,now()-interval '2 days',now()-interval '1 day') ON CONFLICT(vacancy_id,candidate_id) DO NOTHING RETURNING id",[v.id,candidate.id,state,letter,state==='sent'?1:2]);
  if(!a)continue;
  await db.query("INSERT INTO application_events(application_id,actor_id,actor_role,state,created_at) VALUES($1,$2,'candidate','sent',now()-interval '2 days')",[a.id,candidate.id]);
  if(state!=='sent')await db.query("INSERT INTO application_events(application_id,actor_id,actor_role,state,message,created_at) VALUES($1,$2,'employer',$3,$4,now()-interval '1 day')",[a.id,employer.owner_id,state,message]);
 }
 await db.query("INSERT INTO demo_fixture_versions(version) VALUES('vacancy-workflow-03')");
 console.log('Demo application queue added once; existing user actions kept');
}
