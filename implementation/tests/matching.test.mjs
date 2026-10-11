import test from 'node:test';
import assert from 'node:assert/strict';
// Environment is required by db.mjs, but rankMatch itself makes no database request.
process.env.DATABASE_URL||='postgres://unused:unused@localhost/unused';
const {rankMatch}=await import('../src/matching.mjs');
test('подбор нормирует только заданные компоненты; unknown заданного домена даёт 0',()=>{
 const d={specialization:'Backend',preferred_skills:[],domain:'FinTech',work_modes:[]},r={skills:[],work_modes:[]},c={score:80};let result=rankMatch(d,r,c,[]);assert.equal(result.M,0);assert.deepEqual(result.weights.map(x=>[x.id,x.weight]),[['D',1]]);assert.equal(result.F,0);
 result=rankMatch({...d,domain:null},r,c,[]);assert.equal(result.M,null);assert.equal(result.R,null);
 result=rankMatch({...d,domain:null,preferred_skills:['Python'],work_modes:['remote']},{skills:['Python'],work_modes:['remote']},c,[]);assert.equal(result.M,100);assert.equal(result.weights.reduce((n,x)=>n+x.weight,0),1);
});
test('ФСП дедуплицирует событие, учитывает специализацию и не выдаёт грейд',()=>{
 const e={source_event_id:'one',specialization:'Backend',placement:2,team_event:true};const r=rankMatch({specialization:'Backend',preferred_skills:['Python']},{skills:['Python']},null,[e,e,{...e,source_event_id:'other',specialization:'Frontend'}]);assert.equal(r.F,30);assert.equal(r.T,null);assert.equal(r.R,null);
});
