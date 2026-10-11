import {readFile,writeFile} from 'node:fs/promises';
import {frontendClosed,frontendOpen,backendSeniorClosed,backendSeniorOpen,sources} from './extended-bank-content.mjs';
import {createHash} from 'node:crypto';
import {frontendByGrade,frontendRepairs,backendRepairs,repairClosed,backendRepairClosed} from './bank-revision-content.mjs';
const original=JSON.parse(await readFile(new URL('../private/professional.json',import.meta.url),'utf8'));
for(const specialization of ['Frontend','Backend']){
 const grades=specialization==='Frontend'?['Junior','Middle','Senior']:['Senior'],families=[],items=[];
 for(const grade of grades){const pattern=grade==='Junior'?'Junior':'Middle';
  for(const base of original.families.filter(f=>f.grade===pattern)){
   const id=specialization+'-'+base.id.replace(pattern,grade),family={...base,id,grade,items:[id+'-1',id+'-2']};families.push(family);
   const template=original.items.find(i=>i.id===base.items[0]),index=base.stage==='B'?0:base.stage==='A'?1:2;
   for(const variant of [1,2]){
    const common={...template,id:id+'-'+variant,family_id:id,specialization,grade,review_status:'authored_pending_independent_review'};
    const context=variant===1?'Сценарий: каталог проектов.':'Сценарий: кабинет учебной команды.';
    if(template.format==='closed'){
     const n=base.competency==='security'?(base.stage==='B'?base.slot-1:2):index;
     let task=(specialization==='Frontend'?(frontendByGrade[grade]||frontendClosed):backendSeniorClosed)[base.competency][n];
     if(base.branch==='repair')task=specialization==='Frontend'?repairClosed(task,base.competency,grade,base.stage):backendRepairClosed(task,base.competency,base.stage);
     delete common.reference_answer;delete common.rubric;
     const answers=[task.correct,...task.wrong],shift=createHash('sha256').update(common.id+'|v02').digest()[0]%4,rotated=answers.map((_,i)=>answers[(i+shift)%4]);
     Object.assign(common,{stem:context+'. '+task.stem,options:rotated.map((text,i)=>({id:'ABCD'[i],text})),answer_key:'ABCD'[rotated.indexOf(task.correct)],rationale:task.correct});
    }else{
     const repair=(specialization==='Frontend'?frontendRepairs[grade]:backendRepairs)[base.competency]?.[index-1];
     const task=base.branch==='repair'&&repair?repair:(specialization==='Frontend'?frontendOpen[grade]:backendSeniorOpen)[base.competency][index];
     delete common.options;delete common.answer_key;delete common.rationale;
     Object.assign(common,{stem:context+' '+task.stem+(/провер|тест/i.test(task.stem)?'':' Опишите решение и проверки его поведения.'),reference_answer:task.criteria.join('; ')+'.',rubric:task.criteria.map((criterion,i)=>({id:'c'+(i+1),points:1,criterion}))});
    }
    items.push(common);
   }
  }
 }
 const competencies=specialization==='Frontend'?{http:'Браузер и API',sql:'Состояние и данные',debug:'Отладка и качество',arch:'Архитектура интерфейса',security:'Безопасность'}:original.competencies;
 const data={...original,bank_version:specialization==='Frontend'?'frontend-0.3.0':'backend-senior-0.3.0',rubric_version:specialization.toLowerCase()+'-rubric-0.3.0',status:'authored_pending_independent_review',distribution:{...original.distribution,grades},competencies,sources,families,items};
 await writeFile(new URL('../private/extended-'+specialization.toLowerCase()+'.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
 console.log(specialization+': '+items.length+' authored items; independent review pending');
}
// Keep v08 byte-for-byte for already started attempts. New attempts use this clarified edition.
const clarified=structuredClone(original);
clarified.bank_version='backend-0.9.0';clarified.rubric_version='backend-rubric-0.9.0';
for(const item of clarified.items){
 if(item.format==='open')item.stem+=' Опишите решение, поведение при ошибке и проверки корректности.';
 if(item.id.includes('Middle-V-sql-1-repair'))item.stem=item.stem.replace('Два клиента','Три клиента');
 if(item.format==='closed'){
  const shift=createHash('sha256').update(item.id+'|v09').digest()[0]%4,key=item.options.find(o=>o.id===item.answer_key).text,texts=item.options.map(o=>o.text);
  item.options=texts.map((_,i)=>({id:'ABCD'[i],text:texts[(i+shift)%4]}));item.answer_key=item.options.find(o=>o.text===key).id;
 }
}
await writeFile(new URL('../private/professional-demo.json',import.meta.url),JSON.stringify(clarified,null,2)+'\n');
