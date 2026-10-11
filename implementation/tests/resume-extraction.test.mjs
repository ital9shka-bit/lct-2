import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleProposal,validateAiProposal} from '../src/resume-extraction.mjs';
const catalog=['Python','React','Git','PostgreSQL'];
test('Resume: English/Russian headings and no substring skill matches',()=>{
 const a=ruleProposal('Profile:\nPython engineer.\nWork history:\nAcme 2022–2025\nBuilt APIs with PostgreSQL\nTechnical skills:\nPython, Git. digital and reactive are prose.',catalog);
 assert.equal(a.about,'Python engineer.');assert.ok(a.experience_text.includes('Acme'));assert.deepEqual(a.skills,['Python','Git','PostgreSQL']);
 const b=ruleProposal('О себе\nРазработчик.\nОпыт работы\nКомпания 2023\nНавыки\nReact',catalog);assert.equal(b.about,'Разработчик.');assert.equal(b.experience_text,'Компания 2023');
});
test('Resume: real source fragments required, invented dates rejected',()=>{
 const text='Python engineer. Acme 2022–2025. Built APIs.';
 const valid={about:'Python engineer.',experience_text:'Acme 2022–2025. Built APIs.',skills:['Python'],source_quotes:{about:['Python engineer.'],experience_text:['Acme 2022–2025. Built APIs.'],skills:['Python']}};
 assert.equal(validateAiProposal(valid,text,catalog).skills[0],'Python');
 assert.throws(()=>validateAiProposal({...valid,skills:['Rust']},text,catalog));
 assert.throws(()=>validateAiProposal({...valid,experience_text:'Acme 2022–2028. Built APIs.'},text,catalog));
 assert.throws(()=>validateAiProposal({...valid,source_quotes:{...valid.source_quotes,about:['Invented text']}},text,catalog));
});
