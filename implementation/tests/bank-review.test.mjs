import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {scores} from '../src/scoring.mjs';
const get=file=>JSON.parse(readFileSync(new URL('../private/'+file,import.meta.url)));const frontend=get('extended-frontend.json');
test('Frontend: grade and adaptive branches use different problems',()=>{
 for(const c of ['http','sql','debug','arch','security']){const b=g=>frontend.items.find(i=>i.grade===g&&i.stage==='B'&&i.competency===c&&i.format==='closed');assert.notEqual(b('Junior').stem,b('Middle').stem);assert.notEqual(b('Middle').stem,b('Senior').stem);}
 for(const grade of ['Junior','Middle','Senior'])for(const stage of ['A','V'])for(const c of ['http','sql','debug','arch','security']){const item=branch=>{const f=frontend.families.find(f=>f.grade===grade&&f.stage===stage&&f.competency===c&&f.branch===branch);return frontend.items.find(i=>i.id===f.items[0]);};assert.notEqual(item('repair').stem,item('transfer').stem,`${grade}/${stage}/${c}`);}
});
test('Passability: full and 3/4 open answers pass, a weak competency cannot be hidden by the average',()=>{
 for(const file of ['professional-demo.json','extended-frontend.json','extended-backend.json']){const b=get(file);for(const grade of b.distribution.grades)for(const branch of ['repair','transfer']){
  const tasks=b.families.filter(f=>f.grade===grade&&(f.stage==='B'||f.branch===branch)).map(f=>({stage:f.stage,private_item:b.items.find(i=>i.id===f.items[0]),score:4}));
  assert.equal(tasks.length,20);assert.equal(scores(tasks).S,100);assert.equal(scores(tasks).passed,true);
  assert.equal(scores(tasks.map(t=>({...t,score:t.private_item.format==='open'?3:4}))).passed,true);
  const weak=scores(tasks.map(t=>({...t,score:t.private_item.competency==='sql'?0:4})));assert.ok(weak.S>=70);assert.equal(weak.passed,false);
 }}
});
test('Cognitive: unique logic, arithmetic and route keys match explicit rules',()=>{
 const b=get('cognitive.json');for(const i of b.items){if(i.input!=null){const n=i.input,r=i.rule,v=r.even_add!=null?(n%2===0?n+r.even_add:n*r.odd_mul)-r.subtract:(n%2===0?n/r.even_div:n+r.odd_add)*r.multiply;assert.equal(v,i.answer_key);}if(i.routes){const a=Object.entries(i.routes).filter(([,v])=>(i.rule.max_price==null||v[1]<=i.rule.max_price)&&(i.rule.max_time==null||v[0]<=i.rule.max_time));a.sort((a,b)=>a[1][i.rule.objective==='time'?0:1]-b[1][i.rule.objective==='time'?0:1]);assert.equal(a[0][0],i.answer_key);}}
 const permutations=a=>a.length===1?[a]:a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[x,...p]));
 assert.deepEqual(permutations(['A','B','C']).filter(p=>p.indexOf('A')<p.indexOf('C')&&p.indexOf('C')!==2&&p.indexOf('B')!==1),[['A','C','B']]);
 assert.deepEqual(permutations(['X','Y','Z']).filter(p=>p.indexOf('X')>p.indexOf('Y')&&p.indexOf('Z')!==0&&p.indexOf('X')!==1),[['Y','Z','X']]);
});
