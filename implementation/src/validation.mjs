import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fail } from './errors.mjs';
import {addExtensions} from './extensions.mjs';
export const contract = JSON.parse(readFileSync(new URL('../private/openapi.json',import.meta.url),'utf8'));
addExtensions(contract);
const ajv = new Ajv({strict:false,allErrors:true}); addFormats(ajv);
ajv.addSchema({$id:'oop',components:contract.components});
export const validators = Object.fromEntries(Object.keys(contract.components.schemas).map(name => [name,ajv.compile({$ref:'oop#/components/schemas/'+name})]));
export function validate(name, data) {
  const fn = validators[name];
  if (!fn(data)) fail(422,'validation_error','Проверьте поля формы.', Object.fromEntries(fn.errors.map(e=>[e.instancePath||e.params.missingProperty||'body',e.message])));
}
export const skillCatalog = ['JavaScript','TypeScript','React','HTML','CSS','Accessibility','Browser APIs','Python','PostgreSQL','FastAPI','REST API','Redis','Kafka','Docker','Kubernetes','Git','Code review','Peer review','Debugging production','API design','System design','Менторинг','Incident response','Performance profiling','Интеграции','SQL performance','High-load','Production-опыт','Самостоятельность','Внутренние сервисы','Домен EdTech'];
export function validateSkills(data) { for (const field of ['skills','must_skills','preferred_skills']) if (data[field]?.some(x=>!skillCatalog.includes(x))) fail(422,'unknown_skill','Навык отсутствует в справочнике.',{[field]:'Неизвестный навык'}); }
export function salary(data) { if (data.salary_min != null && data.salary_max != null && data.salary_min > data.salary_max) fail(422,'salary_range','Нижняя граница зарплаты превышает верхнюю.'); }
