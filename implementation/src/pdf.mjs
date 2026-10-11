import PDFDocument from 'pdfkit';
import { config } from './config.mjs';
export async function pdf(profile,contact=null) {
 const doc=new PDFDocument({size:'A4',margin:45,bufferPages:true,info:{Title:'ООП — Объекто-ориентированный поиск',Author:'ООП'}}),chunks=[];
 const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const states={not_started:'Не начато',completed:'Завершено',verified:'Подтверждено',draft:'Черновик',submitted:'Ожидает проверки',in_review:'На проверке',needs_info:'Нужны уточнения',partially_verified:'Проверено частично',not_verified:'Не подтверждено',deferred:'Отложено',no_experience:'Нет заявленного опыта',in_progress:'В процессе'};
 const competencyNames=specialization=>specialization==='Frontend'?{http:'Браузер и API',sql:'Состояние и данные',debug:'Отладка и качество',arch:'Архитектура интерфейса',security:'Безопасность'}:{http:'HTTP и API',sql:'Данные и SQL',debug:'Отладка и качество',arch:'Архитектура и надёжность',security:'Безопасность'};
 const fields={organization:'Организация',period:'Период',role:'Роль',contribution:'Личный вклад',results:'Результаты'},dimensions={analytical:'Анализ условий',learning:'Освоение правил',flexibility:'Изменение стратегии'};
 function heading(text){if(doc.y>doc.page.height-120)doc.addPage();doc.moveDown().fontSize(13).fillColor('#1B1C21').text(text).moveDown(.4).fontSize(10);}
 doc.font(config.pdfFont).fontSize(11).fillColor('#402FFF').text('Объекто-ориентированный поиск').moveDown().fillColor('#1B1C21').fontSize(19).text(profile.display_name||profile.name||'Резюме');
 doc.fontSize(10).text('Заявлено: '+profile.specialization+' / '+profile.declared_grade).text('Подтверждено: '+(profile.confirmed_grade||'не подтверждено'));
 if(profile.source_labels)doc.fontSize(8).fillColor('#6F7078').text(profile.source_labels.join('\n')).fontSize(10).fillColor('#1B1C21');
 if(profile.about){heading('О себе');doc.text(profile.about,{lineGap:3});}
 if(profile.skills?.length){heading('Заявленные навыки');doc.text(profile.skills.join(', '));}
 if(profile.experience_text){heading('Опыт и результаты');doc.text(profile.experience_text,{lineGap:3});}
 for(const e of profile.fsp_events||[])doc.moveDown().text('ФСП: '+e.source+' · '+new Date(e.event_date).toLocaleDateString('ru-RU')+(e.demo?' · demo':'')+(e.team_event?' · командное событие':''));
 if(profile.summary){const s=profile.summary;heading('Оценка по четырём источникам');
  if(s.cognitive?.potential){const p=s.cognitive.potential;heading('Потенциал и способ работы');doc.text('Протокол: '+(p.version||'не начат')+' · '+p.answered+' из 6 ответов');for(const d of p.directions){doc.moveDown().text(d.title+': '+d.headline);doc.text(d.evidence.map(e=>e.label+' (№ '+e.ordinal+'): '+(e.correct===null?'нет ответа':e.correct?'верно':'неверно')).join(' → '));doc.text(d.interpretation);doc.text('Для обсуждения: '+d.next);}doc.moveDown().text(p.calculation,{lineGap:2}).text(p.limit,{lineGap:2});}
  if(s.self){heading('Самооценка · слова таланта');doc.text(states[s.self.state]||s.self.state);if(s.self.answers){const labels=['Незнакомая задача','Новый инструмент','Поиск причины ошибки','Выбор между решениями','Ограничения решения'],contexts=['С поддержкой по шагам','По знакомому примеру','Типовые задачи самостоятельно','Сложные условия и ограничения','Подход для команды'];labels.forEach((title,i)=>doc.text(title+': '+contexts[s.self.answers['S'+(i+1)]-1]));if(s.self.answers.reflection)doc.moveDown().text('Пример обратной связи: '+s.self.answers.reflection);if(s.self.answers.support)doc.text('Полезная поддержка: '+s.self.answers.support);doc.text('Ответы описывают разные условия работы и не усредняются в балл.');}}
  if(s.technical){heading('Профессиональная готовность');doc.text(s.technical.specialization+' / '+(s.technical.grade||states[s.technical.state]||s.technical.state)+(s.technical.synthetic?' · демо-подтверждение':'')+(s.technical.score==null?'':' · '+s.technical.score.toFixed(1)+' / 100'));for(const c of s.technical.competencies||[])doc.text(competencyNames(s.technical.specialization)[c.competency]+': '+(c.C==null?'ожидает проверки':c.C.toFixed(1)));}
  if(s.fsp)doc.text('ФСП: '+(s.fsp.events.length?s.fsp.events.length+' событий':'нет данных'));
  if(s.experience){heading('Проверка реального опыта');doc.text((states[s.experience.state]||s.experience.state)+(s.experience.synthetic?' · демонстрационный пример':''));for(const e of s.experience.entries){doc.moveDown().text(e.organization+' · '+e.role+' · '+e.period);for(const k of Object.keys(fields)){const v=e.fields[k];doc.text(fields[k]+': '+(states[v]||v));}}}
 }
 if(contact)doc.moveDown().text('Контакт: '+contact.email+(contact.phone?' · '+contact.phone:''));
 doc.moveDown().fontSize(8).fillColor('#6F7078').text('Четыре источника и проверка опыта рассматриваются отдельно. Технический уровень рассчитывается только по профессиональным ответам.');
 const range=doc.bufferedPageRange();for(let n=0;n<range.count;n++){doc.switchToPage(n);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.fontSize(8).fillColor('#6F7078').text('ООП · '+new Date().toLocaleDateString('ru-RU')+' · '+(n+1)+' / '+range.count,45,doc.page.height-30,{width:doc.page.width-90,align:'right',lineBreak:false});doc.page.margins.bottom=bottom;}
 doc.end();return done;
}
