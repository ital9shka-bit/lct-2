import {spawn} from 'node:child_process';
import {fail} from './errors.mjs';
import {skillCatalog} from './validation.mjs';
import {aiAvailable,llm} from './ai.mjs';
import {ruleProposal,validateAiProposal,resumeInstruction} from './resume-extraction.mjs';
function extract(buffer){return new Promise((resolve,reject)=>{
 const child=spawn('pdftotext',['-f','1','-l','12','-layout','-','-'],{stdio:['pipe','pipe','pipe']}),chunks=[];let length=0,done=false;
 const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('timeout'));},5000);
 function finish(error,value){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);}
 child.stderr.resume();child.on('error',e=>finish(e));child.stdin.on('error',()=>{});child.stdout.on('data',chunk=>{length+=chunk.length;if(length>200000){child.kill('SIGKILL');finish(new Error('too_large'));}else chunks.push(chunk);});
 child.on('close',code=>code===0?finish(null,Buffer.concat(chunks).toString('utf8')):finish(new Error('invalid_pdf')));child.stdin.end(buffer);
});}
export async function importPdf(c){
 if(c.user.role!=='candidate')fail(403,'wrong_role','Доступно таланту.');
 const buffer=Buffer.from(c.req.body.base64,'base64');if(buffer.length>4*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')fail(422,'invalid_pdf','Выберите PDF размером до 4 МБ.');
 let text;try{text=(await extract(buffer)).replace(/\f/g,'\n').replace(/[ \t]+/g,' ').trim();}catch{fail(422,'pdf_unreadable','Не удалось прочитать PDF. Проверьте, что файл не защищён паролем и содержит текст.');}
 if(text.length<30)fail(422,'pdf_no_text','В PDF не найден текст. Для сканированного резюме внесите сведения вручную.');
 const excerpt=text.slice(0,16000);let proposal=ruleProposal(excerpt,skillCatalog),method='rules',warning=null;
 // External processing is explicitly selected in the upload dialog.
 if(c.req.body.use_ai===true){
  if(aiAvailable())try{proposal=validateAiProposal(await llm(resumeInstruction,{text:excerpt,allowed_skills:skillCatalog},20000,2400),excerpt,skillCatalog);method='ai';}catch{warning='ИИ-разбор сейчас недоступен. Показан результат обычного извлечения: проверьте и дополните поля.';}
  else warning='ИИ-разбор не настроен. Показан результат обычного извлечения.';
 }
 return {proposal,method,warning,excerpt,truncated:text.length>16000,note:(method==='ai'?'ИИ разобрал структуру резюме. ':'Текст разобран по заголовкам и справочнику навыков. ')+'Прочитаны первые 12 страниц, до 16 000 символов. Проверьте поля перед сохранением.'};
}
