import { one, all, audit } from './db.mjs';
import { fail, checkRevision } from './errors.mjs';
import { salary } from './validation.mjs';
import { ownNeed } from './matching.mjs';
import { validateNeed } from './profiles.mjs';
export const grantView=g=>({id:g.id,revision:g.revision,company_id:g.company_id,candidate_id:g.candidate_id,invitation_id:g.invitation_id,granted_at:g.granted_at.toISOString(),revoked_at:g.revoked_at?.toISOString()||null});
export async function invitationView(db,i) {const grant=await one(db,'SELECT id FROM contact_grants WHERE candidate_id=$1 AND company_id=$2 AND revoked_at IS NULL',[i.candidate_id,i.company_id]);return {id:i.id,revision:i.revision,company_id:i.company_id,candidate_id:i.candidate_id,need_id:i.need_id,...i.data,state:i.state,delivery_state:i.delivery_state,created_at:i.created_at.toISOString(),viewed_at:i.viewed_at?.toISOString()||null,responded_at:i.responded_at?.toISOString()||null,active_contact_access:!!grant};}
export async function ownInvitation(db,user,id,lock=false) {const row=await one(db,'SELECT * FROM invitations WHERE id=$1 AND '+(user.role==='candidate'?'candidate_id=$2':'company_id=$2')+(lock?' FOR UPDATE':''),[id,user.role==='candidate'?user.id:user.company_id]);if(!row)fail(404,'not_found','Приглашение не найдено.');return row;}
export async function createInvitation({db,user,req}) {
 const b=req.body;salary(b);const n=await ownNeed(db,user,b.need_id);if(n.state!=='published')fail(409,'need_not_published','Сначала опубликуйте потребность.');await validateNeed(db,user.company_id,n.data);
 const r=await one(db,"SELECT * FROM resumes WHERE owner_id=$1 AND publication_state='published'",[b.candidate_id]);if(!r)fail(404,'not_found','Опубликованный талант не найден.');
 const company=(await one(db,'SELECT data FROM companies WHERE id=$1',[user.company_id])).data,representative={name:company.representative_name,role:company.representative_role,email:company.representative_email,phone:company.representative_phone};
 const row=await one(db,'INSERT INTO invitations(company_id,candidate_id,need_id,data) VALUES($1,$2,$3,$4) RETURNING *',[user.company_id,b.candidate_id,n.id,{salary_min:b.salary_min,salary_max:b.salary_max,currency:b.currency,period:b.period,tax_basis:b.tax_basis,message:b.message,representative}]);
 const email=(await one(db,'SELECT email FROM users WHERE id=$1',[b.candidate_id])).email;
 await db.query('INSERT INTO outbox(dedupe_key,payload,invitation_id) VALUES($1,$2,$3)',['invitation:'+row.id,{to:email,subject:'Предложение в ООП от '+company.name,text:'В кабинете ООП доступно предложение: '+b.salary_min+'–'+b.salary_max+' RUB/месяц gross. '+b.message},row.id]);
 await audit(db,user.id,'invitation.created',row.id);return invitationView(db,row);
}
export async function respondInvitation({db,user,req}) {
 const i=await ownInvitation(db,user,req.params.invitation_id,true),action=req.body.action,target={accept:'accepted',reject:'rejected',withdraw:'withdrawn'}[action];
 if((action==='withdraw'&&user.role!=='employer')||(action!=='withdraw'&&user.role!=='candidate'))fail(403,'wrong_role','Действие недоступно для этой роли.');
 if(i.state===target)return invitationView(db,i);
 if(!['sent','viewed'].includes(i.state))fail(409,'final_invitation','Ответ уже зафиксирован.');checkRevision(i,req.body.expected_revision);
 if(action==='accept'){
  const c=await one(db,'SELECT data FROM companies WHERE id=$1',[i.company_id]);if(!c?.data.name||!c.data.representative_name||!c.data.representative_email)fail(409,'inactive_company','Компания или представитель недоступны.');
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  await db.query('INSERT INTO contact_grants(company_id,candidate_id,invitation_id) VALUES($1,$2,$3) ON CONFLICT(company_id,candidate_id) WHERE revoked_at IS NULL DO NOTHING',[i.company_id,i.candidate_id,i.id]);
 }
 const row=await one(db,'UPDATE invitations SET state=$1,revision=revision+1,responded_at=now() WHERE id=$2 RETURNING *',[target,i.id]);await audit(db,user.id,'invitation.'+action,i.id);return invitationView(db,row);
}
export async function contacts(db,user,candidateId) {
 const grant=await one(db,'SELECT * FROM contact_grants WHERE company_id=$1 AND candidate_id=$2 AND revoked_at IS NULL',[user.company_id,candidateId]);if(!grant)fail(403,'contact_locked','Контакт закрыт. Требуется принятое приглашение и действующее разрешение.');
 const r=await one(db,'SELECT data FROM resumes WHERE owner_id=$1',[candidateId]);await audit(db,user.id,'contact.read',grant.id);return {candidate_id:candidateId,email:r.data.contact_email,phone:r.data.phone,grant_id:grant.id};
}
