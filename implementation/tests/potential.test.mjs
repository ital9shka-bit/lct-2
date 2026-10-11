import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {potentialProfile} from '../src/potential.mjs';
const pair=(a,b)=>[{ordinal:2,correct:a,submitted_at:'2026-10-10'},{ordinal:3,correct:b,submitted_at:'2026-10-10'}];
const learning=tasks=>potentialProfile(tasks,'completed','cognitive-0.9.0').directions[1];
test('Potential: one correct answer distinguishes application after feedback from a failed second attempt',()=>{
 const after=learning(pair(0,1)),before=learning(pair(1,0));assert.equal(after.correct,before.correct);assert.equal(after.correct,1);assert.notEqual(after.headline,before.headline);assert.match(after.headline,/после разбора/);assert.match(before.headline,/трудность/);
});
test('Potential: all four pairs have distinct observations, success twice does not claim improvement',()=>{
 const cases=[[0,0],[0,1],[1,0],[1,1]].map(p=>learning(pair(...p)));assert.equal(new Set(cases.map(c=>c.headline)).size,4);assert.match(cases[3].headline,/обеих ситуациях/);assert.doesNotMatch(cases[3].interpretation,/вырос|улучш|прирост|высок/);
});
test('Potential: missing and deferred answers remain unknown, no negative conclusion from a draft',()=>{
 const p=potentialProfile([{ordinal:2,correct:0,draft:'C'}],'deferred');assert.equal(p.answered,0);for(const d of p.directions){assert.equal(d.complete,false);assert.equal(d.correct,null);assert.ok(d.evidence.every(e=>e.correct===null));assert.equal(d.headline,'Ожидает ответов');}
 const single=learning(pair(0,1).slice(0,1));assert.equal(single.complete,false);assert.equal(single.correct,0);assert.equal(single.evidence[1].correct,null);assert.equal(single.headline,'Ожидает ответов');
});
test('Potential: technical scores, confidence and speed do not alter the observation',()=>{
 const plain=potentialProfile(pair(0,1),'completed');const decorated=potentialProfile(pair(0,1).map(t=>({...t,score:100,active_seconds:0.1,self_rating:5})),'completed');assert.deepEqual(decorated,plain);assert.equal('score' in plain,false);
});
test('Potential: analysis and strategy refer to the correct ordered tasks, not task array order',()=>{
 const ts=[6,5,4,3,2,1].map(ordinal=>({ordinal,correct:ordinal===5?0:1,submitted_at:'date'}));const p=potentialProfile(ts,'completed');assert.deepEqual(p.directions.map(d=>d.evidence.map(e=>e.ordinal)),[[1,6],[2,3],[4,5]]);assert.match(p.directions[2].headline,/ограничение.*трудность/);assert.equal(p.answered,6);
});
test('Potential bank: both forms yield six unique steps and deterministic keys without arithmetic in learning',()=>{
 const b=JSON.parse(readFileSync(new URL('../private/cognitive-demo.json',import.meta.url)));assert.equal(b.version,'cognitive-0.9.0');assert.equal(b.items.length,12);assert.equal(b.grade_effect,false);assert.equal(b.norms,null);
 for(const form of ['a','b']){const ts=b.items.filter(i=>i.id.includes('-'+form));assert.deepEqual(ts.map(t=>t.step).sort(),[1,2,3,4,5,6]);for(const i of ts){assert.equal(Object.keys(i.options).length,4);assert.ok(i.options[i.answer_key]);if(i.family==='C2'){assert.equal(i.format,'closed');const key=i.case.exception?i.rule_model.exception:i.case.flag?i.rule_model.flag:i.rule_model.plain;assert.equal(i.answer_key,key);if(i.step===3)assert.ok(i.rule_reference);assert.equal('input' in i,false);}if(i.routes){const r=i.rule,allowed=Object.entries(i.routes).filter(([,v])=>(r.max_price==null||v[1]<=r.max_price)&&(r.max_time==null||v[0]<=r.max_time)).sort((a,b)=>a[1][r.objective==='time'?0:1]-b[1][r.objective==='time'?0:1]);assert.equal(allowed[0][0],i.answer_key);assert.notEqual(allowed[0][1][r.objective==='time'?0:1],allowed[1]?.[1][r.objective==='time'?0:1]);}}}
});
