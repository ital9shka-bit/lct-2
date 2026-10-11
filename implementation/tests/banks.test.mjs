import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const file of ['professional.json','professional-demo.json','extended-frontend.json','extended-backend.json']){
 const bank=JSON.parse(readFileSync(new URL('../private/'+file,import.meta.url)));
 test(file+': структура, ключи, рубрики и все адаптивные маршруты',()=>{
  assert.equal(new Set(bank.items.map(i=>i.id)).size,bank.items.length);
  for(const family of bank.families){assert.equal(family.items.length,2);for(const id of family.items){const item=bank.items.find(i=>i.id===id);assert.ok(item);assert.equal(item.family_id,family.id);assert.equal(item.grade,family.grade);assert.equal(item.review_status,'authored_pending_independent_review');if(item.format==='closed'){assert.equal(item.options.length,4);assert.equal(new Set(item.options.map(o=>o.text)).size,4);assert.equal(item.options.filter(o=>o.id===item.answer_key).length,1);}else{assert.equal(item.rubric.length,4);assert.equal(item.rubric.reduce((n,r)=>n+r.points,0),4);assert.ok(item.rubric.every(r=>r.criterion.length>10));}}}
  for(const grade of bank.distribution.grades)for(let route=0;route<1024;route++){
   const cs=['http','sql','debug','arch','security'];
   const families=bank.families.filter(f=>f.grade===grade&&(f.stage==='B'||f.branch===((route>>((f.stage==='A'?0:5)+cs.indexOf(f.competency)))&1?'transfer':'repair')));
   const tasks=families.map(f=>bank.items.find(i=>i.id===f.items[0]));assert.equal(tasks.length,20);assert.equal(tasks.filter(i=>i.format==='closed').length,10);assert.equal(tasks.filter(i=>i.format==='open').length,10);for(const c of cs)assert.equal(tasks.filter(i=>i.competency===c).length,4);
  }
 });
}
