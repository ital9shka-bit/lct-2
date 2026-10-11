import {one,all} from './db.mjs';
import {publicExperience} from './experience.mjs';
import {credential as bestCredential} from './profiles.mjs';
import {mergedSeconds} from './scoring.mjs';
import {potentialProfile} from './potential.mjs';
export async function visibleSummary(db,id){const row=await one(db,'SELECT data FROM resumes WHERE owner_id=$1',[id]),v=row?.data.visibility_sections||[];return pillarSummary(db,id,{assessment:v.includes('assessment'),experience:v.includes('experience'),fsp:v.includes('fsp')});}
export async function pillarSummary(db,id,{assessment=true,experience=true,fsp=true}={}){
 const r=await one(db,'SELECT data FROM resumes WHERE owner_id=$1',[id]),spec=r?.data.specialization||'Backend';
 const s=await one(db,'SELECT * FROM self_assessments WHERE owner_id=$1',[id]),credential=await bestCredential(db,id,spec),a=credential?.attempt_id?await one(db,'SELECT * FROM attempts WHERE id=$1',[credential.attempt_id]):await one(db,'SELECT * FROM attempts WHERE owner_id=$1 AND specialization=$2 ORDER BY started_at DESC LIMIT 1',[id,spec]),c=await one(db,'SELECT * FROM cognitive_sessions WHERE owner_id=$1 ORDER BY started_at DESC LIMIT 1',[id]),e=await one(db,'SELECT * FROM experience_cases WHERE owner_id=$1',[id]);
 const professionalBlock=await one(db,"SELECT state FROM program_blocks WHERE owner_id=$1 AND block='professional'",[id]);
 const observations=[];
 if(assessment&&c?.state==='completed')for(const dimension of ['analytical','learning','flexibility']){
  const ts=await all(db,"SELECT id,correct FROM cognitive_tasks WHERE session_id=$1 AND private_item->>'dimension'=$2",[c.id,dimension]);
  const intervals=await all(db,'SELECT i.* FROM activity_intervals i WHERE task_id=ANY($1::uuid[])',[ts.map(t=>t.id)]);
  observations.push({dimension,correct:ts.reduce((n,t)=>n+Number(t.correct||0),0),total:ts.length,active_seconds:mergedSeconds(intervals)});
 }
 const events=fsp?(await all(db,'SELECT data FROM fsp_events WHERE owner_id=$1 ORDER BY source_event_id',[id])).map(r=>r.data):[];
 const potential=assessment?{...potentialProfile(c?.state==='completed'?await all(db,'SELECT ordinal,correct,submitted_at FROM cognitive_tasks WHERE session_id=$1 ORDER BY ordinal',[c.id]):[],c?.state||'not_started',c?.version||null),answered:c?.answered_count||0}:null;
 return {version:'pillars-1',technical:assessment?{specialization:spec,state:credential?'verified':a?.state||professionalBlock?.state||'not_started',grade:credential?.grade||null,score:credential?Number(credential.score):null,synthetic:credential?.synthetic||false,date:credential?.verified_at?.toISOString()||null,competencies:a?.state==='finalized'?a.result?.competencies||[]:[]}:null,
  self:assessment?{state:s?.state||'not_started',answers:s?.state==='completed'?s.data:null}:null,
  cognitive:assessment?{state:c?.state||'not_started',observations,version:c?.version||null,potential}:null,
  fsp:fsp?{state:events.length?'available':'no_data',events}:null,
  experience:experience?publicExperience(e):null,
  complete:assessment&&s?.state==='completed'&&c?.state==='completed'&&!!credential&&experience&&['verified','no_experience'].includes(e?.state),
  note:'Четыре источника рассматриваются отдельно. Проверка опыта не меняет профессиональный грейд.'};
}
