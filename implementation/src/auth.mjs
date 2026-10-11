import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config, token } from './config.mjs';
import { one, all, audit } from './db.mjs';
import { fail } from './errors.mjs';
export const digest = value => createHmac('sha256',config.secret).update(value).digest('hex');
export const legalDocuments = [
  {kind:'registration',version:'registration-0.8-demo',operator:'Локальный демонстрационный стенд ООП',text:'Демонстрационный стенд. Email используется для входа, резюме и ответы — для проверки сценариев. Данные хранятся в локальном PostgreSQL. Не вводите реальные персональные данные. Публикация профиля требует отдельного действия. Для реального запуска оператор должен утвердить документы, срок хранения и порядок удаления.'},
  {kind:'publication',version:'publication-0.8-demo',operator:'Локальный демонстрационный стенд ООП',text:'Разрешаю показывать выбранные разделы профиля работодателям этого стенда. Email и телефон скрыты до принятия отдельного приглашения. Могу скрыть профиль и отозвать доступ к контактам. Уже скачанную копию технически отозвать невозможно.'}
];
export async function createUser(db,email,role) {
  const user=await one(db,'INSERT INTO users(email,role) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING *',[email,role]);
  if(user.role==='candidate') {
    await db.query('INSERT INTO resumes(owner_id,data) VALUES($1,$2) ON CONFLICT(owner_id) DO NOTHING',[user.id,{specialization:'Backend',declared_grade:'Junior',skills:[],experience_text:'',about:'',work_modes:['remote'],salary_expectation:null,name:'',phone:null,contact_email:email,visibility_sections:['experience','skills','fsp'],name_visibility:false}]);
    await db.query('INSERT INTO self_assessments(owner_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
    for(const block of ['professional','cognitive'])await db.query('INSERT INTO program_blocks(owner_id,block) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,block]);
  } else if(user.role==='employer')await db.query('INSERT INTO companies(owner_id,data) VALUES($1,$2) ON CONFLICT(owner_id) DO NOTHING',[user.id,{name:'',description:'',domain:'',size:'1-10',stage:'startup',representative_name:'',representative_role:'',representative_email:email,representative_phone:null}]);
  return user;
}
export async function userProjection(db,user,csrf) {const c=await one(db,'SELECT id FROM companies WHERE owner_id=$1',[user.id]);return {id:user.id,role:user.role,email:user.email,email_verified:true,company_id:c?.id||null,csrf_token:csrf};}
export async function createSession(db,req,res,u,provider='email',idToken=null){
  const sessionToken=token(),csrf=token();
  const s=await one(db,'INSERT INTO sessions(user_id,token_hash,csrf_token,auth_provider,oidc_id_token) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.id,digest(sessionToken),csrf,provider,idToken]);
  res.cookie('oop_session',sessionToken,{httpOnly:true,secure:config.origin.startsWith('https://'),sameSite:'lax',maxAge:7*86400000,path:'/'});
  await audit(db,u.id,'session.created',s.id);
  return {sessionId:s.id,csrf};
}
export async function startOtp(ctx, previous=null) {
  const {db,req}=ctx, email=(previous?.email||req.body.email).trim().toLowerCase(), role=previous?.role||req.body.role;
  if(config.env==='demo'&&!/\.(test|example)$/.test(email))fail(422,'demo_email','На демостенде используйте адрес в домене .test или .example.');
  if(config.publicDemo&&(await one(db,'SELECT role FROM users WHERE email=$1',[email]))?.role==='reviewer')fail(403,'sso_required','Оператор входит через Keycloak.');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['otp:'+email]);
  const demo=config.env==='demo';
  const recent=demo?[]:await all(db,"SELECT created_at FROM otp_challenges WHERE email=$1 AND created_at>now()-interval '1 hour' ORDER BY created_at DESC",[email]);
  const ipHash=digest(req.ip);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['otp-ip:'+ipHash]);
  const ips=await one(db,"SELECT count(*)::int AS n FROM otp_challenges WHERE ip_hash=$1 AND created_at>now()-interval '1 hour'",[ipHash]);
  if(recent.length>=5||ips.n>=(demo?300:20))fail(429,'otp_rate_limit','Лимит кодов за час исчерпан.');
  if(!demo){
    if(recent[0]&&Date.now()-recent[0].created_at.getTime()<60000)fail(429,'resend_too_soon','Повторная отправка доступна через 60 секунд.');
    await db.query('UPDATE otp_challenges SET invalidated_at=now() WHERE email=$1 AND invalidated_at IS NULL',[email]);
  }
  // Shared demo profiles must not invalidate another viewer's pending login.
  const code=demo?'123456':String(randomInt(100000,1000000));
  const row=await one(db,'INSERT INTO otp_challenges(email,role,code_hash,ip_hash) VALUES($1,$2,$3,$4) RETURNING *',[email,role,digest(email+'|'+code),ipHash]);
  await db.query('INSERT INTO outbox(dedupe_key,payload) VALUES($1,$2)', ['otp:'+row.id,{to:email,subject:'Код входа в ООП',text:'Код: '+code+'\nДействует 10 минут. '+(config.env==='demo'?'Демонстрационный стенд.':'')}]);
  return {challenge_id:row.id,expires_at:row.expires_at.toISOString(),resend_available_at:new Date(row.created_at.getTime()+(demo?0:60000)).toISOString(),registration_consent_version:legalDocuments[0].version};
}
export async function verifyOtp({db,req,res,user}) {
  const b=req.body,c=await one(db,'SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE',[b.challenge_id]);
  if(!c)fail(404,'challenge_not_found','Код не найден.');
  if(c.verified_session_id){if(user?.session_id===c.verified_session_id)return userProjection(db,user,user.csrf_token);fail(409,'already_used','Код уже использован. Запросите новый.');}
  if(c.invalidated_at||Date.now()>=+c.expires_at||c.attempts>=5)fail(410,'challenge_expired','Код истёк или заблокирован. Запросите новый.');
  const good=timingSafeEqual(Buffer.from(c.code_hash),Buffer.from(digest(c.email+'|'+b.code)));
  if(!good){await db.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1',[c.id]);return {httpStatus:422,body:{code:'invalid_code',message:'Неверный код.',field_errors:{code:'Проверьте код'},request_id:req.requestId}};}
  const existing=await one(db,'SELECT * FROM users WHERE email=$1',[c.email]);
  if(!existing&&(b.registration_consent_accepted!==true||b.registration_consent_version!==legalDocuments[0].version))fail(422,'consent_required','Требуется актуальное согласие на регистрацию.');
  if(config.env==='production')fail(503,'legal_not_configured','Перед реальным запуском настройте утверждённые документы оператора.');
  if(config.publicDemo&&existing?.role==='reviewer')fail(403,'sso_required','Оператор входит через Keycloak.');
  const u=existing||await createUser(db,c.email,c.role),s=await createSession(db,req,res,u);
  await db.query('UPDATE otp_challenges SET verified_session_id=$1 WHERE id=$2',[s.sessionId,c.id]);
  if(!existing)await db.query("INSERT INTO consents(owner_id,kind,version) VALUES($1,'registration',$2)",[u.id,b.registration_consent_version]);
  return userProjection(db,u,s.csrf);
}
