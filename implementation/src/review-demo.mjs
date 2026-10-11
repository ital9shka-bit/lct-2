import {one} from './db.mjs';
import {createUser} from './auth.mjs';
import {startAttempt,selectStage} from './assessment.mjs';
export async function enrichReviewDemo(db){
 await db.query('SELECT pg_advisory_xact_lock(8450805)');
 if((await db.query("SELECT 1 FROM demo_fixture_versions WHERE version='review-workspace-05'")).rowCount)return;
 const user=await createUser(db,'review-demo@oop.test','candidate');
 if(!(await db.query('SELECT 1 FROM attempts WHERE owner_id=$1',[user.id])).rowCount){
  const view=await startAttempt({db,user,req:{body:{specialization:'Backend',target_grade:'Junior'}}}),id=view.id;
  for(const stage of ['B','A','V']){
   const tasks=(await db.query('SELECT * FROM attempt_tasks WHERE attempt_id=$1 AND stage=$2',[id,stage])).rows;
   for(const t of tasks){const closed=t.private_item.format==='closed',answer=closed?t.private_item.answer_key:t.private_item.reference_answer;
    await db.query('UPDATE attempt_tasks SET draft=$1,answer=$1,submitted_at=now(),score=$2,evaluation_source=$3 WHERE id=$4',[answer,closed?4:null,closed?'answer_key':'manual_required',t.id]);}
   if(stage!=='V')await selectStage(db,await one(db,'SELECT * FROM attempts WHERE id=$1',[id]),stage==='B'?'A':'V',{useAI:false});
  }
  await db.query("UPDATE attempts SET state='review_pending',review_started_at=now(),revision=revision+1 WHERE id=$1",[id]);
  await db.query("UPDATE program_blocks SET state='completed' WHERE owner_id=$1 AND block='professional'",[user.id]);
 }
 await db.query("INSERT INTO demo_fixture_versions(version) VALUES('review-workspace-05')");
}
