import { one, all } from './db.mjs';
import { fail } from './errors.mjs';
import { publicProfile, credential } from './profiles.mjs';
export const gradeRank={Junior:1,Middle:2,Senior:3};
export async function ownNeed(db,user,id,lock=false) {const n=await one(db,'SELECT * FROM needs WHERE id=$1 AND company_id=$2'+(lock?' FOR UPDATE':''),[id,user.company_id]);if(!n)fail(404,'not_found','Потребность не найдена.');return n;}
export function rankMatch(d,r,c,events) {
 const skills=r.skills||[],pref=d.preferred_skills||[],weights=[];
 if(pref.length)weights.push({id:'K',weight:.5,value:100*pref.filter(s=>skills.includes(s)).length/pref.length});
 if(d.domain)weights.push({id:'D',weight:.3,value:r.domain===d.domain?100:0});
 if(d.work_modes?.length)weights.push({id:'U',weight:.2,value:d.work_modes.some(x=>r.work_modes?.includes(x))?100:0});
 const denominator=weights.reduce((s,w)=>s+w.weight,0),M=denominator?weights.reduce((s,w)=>s+w.weight*w.value,0)/denominator:null;
 const unique=[...new Map(events.filter(e=>e.specialization===d.specialization).map(e=>[e.source_event_id,e])).values()],F=Math.min(100,10*unique.length+20*unique.filter(e=>e.placement>=1&&e.placement<=3).length),T=c?Number(c.score):null;
 return {M,T,F,R:M==null||T==null?null:.5*M+.35*T+.15*F,weights:weights.map(w=>({...w,weight:w.weight/denominator}))};
}
export async function matching(db,user,n,includeUnverified=false,demoOnly=false) {
 const d=n.data,rows=await all(db,"SELECT * FROM resumes WHERE publication_state='published' AND (NOT $1::boolean OR data->>'demo_fixture' IN ('hackathon-06','potential-01')) ORDER BY owner_id",[demoOnly]);
 const confirmed=[],unverified=[],applied_filters=['specialization='+d.specialization,'min_grade='+d.min_grade,...d.must_skills.map(s=>'must_skill='+s)],context_sufficient=!!(d.specialization&&d.min_grade&&(d.preferred_skills.length||d.domain||d.work_modes.length));
 for(const row of rows) {
  const r=row.data,p=await publicProfile(db,row.owner_id),c=await credential(db,row.owner_id,d.specialization);
  if(r.specialization!==d.specialization||d.must_skills.some(s=>!p.skills.includes(s)))continue;
  if(c&&gradeRank[c.grade]<gradeRank[d.min_grade])continue;if(!c&&!includeUnverified)continue;
  const rank=rankMatch(d,r,c,p.fsp_events),grant=await one(db,'SELECT id FROM contact_grants WHERE company_id=$1 AND candidate_id=$2 AND revoked_at IS NULL',[user.company_id,row.owner_id]);
  const match={profile:p,M:context_sufficient?rank.M:null,T:rank.T,F:rank.F,R:context_sufficient?rank.R:null,formula_version:'match-0.8.0',confirmed:!!c,evidence:[...d.must_skills.map(s=>({signal:s,value:s,source:'self_reported',matched:true})),...d.preferred_skills.map(s=>({signal:s,value:p.skills.includes(s)?s:null,source:p.skills.includes(s)?'self_reported':'unknown',matched:p.skills.includes(s)})),...rank.weights.map(w=>({signal:w.id,value:w.value.toFixed(1)+'; вес '+w.weight.toFixed(3),source:w.id==='K'?'self_reported':w.id==='D'&&r.domain?'self_reported':w.id==='U'?'self_reported':'unknown',matched:w.value>0})),{signal:'T',value:c?`${rank.T}; ${c.verified_at.toISOString()}; ${c.source}`:null,source:c?'assessment':'unknown',matched:c?true:null}],reasons:[...(!context_sufficient?['Недостаточно контекста для расчёта соответствия']:[]),...(!c?['Уровень не подтверждён']:[]),...(!p.fsp_events.length?['Без ФСП']:[])],contact_access:!!grant};
  (c?confirmed:unverified).push(match);
 }
 const sort=(a,b)=>gradeRank[b.profile.confirmed_grade]-gradeRank[a.profile.confirmed_grade]||(b.R??-1)-(a.R??-1)||a.profile.candidate_id.localeCompare(b.profile.candidate_id);
 confirmed.sort(sort);unverified.sort((a,b)=>a.profile.candidate_id.localeCompare(b.profile.candidate_id));
 const data={confirmed,unverified,context_sufficient,applied_filters,next_cursor:null};
 await db.query('INSERT INTO matching_snapshots(company_id,need_id,formula_version,data) VALUES($1,$2,$3,$4)',[user.company_id,n.id,'match-0.8.0',data]);return data;
}
