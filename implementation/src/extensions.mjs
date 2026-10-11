import {addExperienceContract} from './experience-contract.mjs';
// Additive UI/P1 API; normative v08 files are kept unchanged.
export const vacancyFiltersSchema={type:'object',additionalProperties:false,required:['q','specialization','grade','work_mode','salary_floor','skill','favorites_only','sort'],properties:{
 q:{type:'string',maxLength:160},specialization:{enum:['','Backend','Frontend']},grade:{enum:['','Junior','Middle','Senior']},
 work_mode:{enum:['','remote','hybrid','office']},salary_floor:{type:'integer',minimum:0,maximum:10000000},
 skill:{type:'string',maxLength:80},favorites_only:{type:'boolean'},sort:{enum:['newest','salary_desc']}
}};
export function addExtensions(contract){
 addExperienceContract(contract);
 contract.paths['/auth/oidc/login']={get:{operationId:'auth_oidc_login',responses:{302:{description:'Keycloak authorization redirect'}}}};
 contract.paths['/auth/oidc/callback']={get:{operationId:'auth_oidc_callback',responses:{302:{description:'Verified session redirect'}}}};
 contract.components.schemas.AuthLogout={type:'object',additionalProperties:false,required:['ok'],properties:{ok:{const:true},logout_url:{type:'string',format:'uri'}}};
 contract.paths['/auth/logout'].post.responses['200'].content['application/json'].schema={$ref:'#/components/schemas/AuthLogout'};
 const integer={type:'integer',minimum:1};
 Object.assign(contract.components.schemas,{
  VacancyCreate:{type:'object',additionalProperties:false,required:['need_id'],properties:{need_id:{type:'string',format:'uuid'}}},
  VacancyAction:{type:'object',additionalProperties:false,required:['expected_revision','action'],properties:{expected_revision:integer,action:{enum:['publish','archive']}}},
  ApplicationCreate:{type:'object',additionalProperties:false,required:['cover_letter'],properties:{cover_letter:{type:'string',maxLength:2000}}},
  ApplicationAction:{type:'object',additionalProperties:false,required:['expected_revision','action'],properties:{expected_revision:integer,action:{enum:['withdraw','view','review','interview','reject','reopen']},message:{type:'string',maxLength:1000}}},
  VacancyFavorite:{type:'object',additionalProperties:false,required:['saved'],properties:{saved:{type:'boolean'}}},
  VacancyFilters:vacancyFiltersSchema,
  VacancyPreferences:{type:'object',additionalProperties:false,required:['expected_revision','filters'],properties:{expected_revision:integer,filters:{$ref:'#/components/schemas/VacancyFilters'}}},
  ApplicationInvitation:{type:'object',additionalProperties:false,required:['expected_revision','salary_min','salary_max','message'],properties:{expected_revision:integer,salary_min:{type:'integer',minimum:1,maximum:10000000},salary_max:{type:'integer',minimum:1,maximum:10000000},message:{type:'string',minLength:1,maxLength:2000}}}
 });
 const op=(operationId,body,status=200)=>({operationId,responses:{[status]:{description:'UI/P1 projection'}},...(body?{requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/'+body}}}},parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',format:'uuid'}}]}:{})});
 Object.assign(contract.paths,{
  '/vacancies':{get:op('vacancy_list'),post:op('vacancy_create','VacancyCreate',201)},
  '/vacancies/{vacancy_id}':{get:op('vacancy_get')},
  '/vacancies/{vacancy_id}/actions':{post:op('vacancy_action','VacancyAction')},
  '/vacancies/{vacancy_id}/applications':{post:op('application_create','ApplicationCreate',201)},
  '/me/applications':{get:op('application_list')},
  '/applications/{application_id}':{get:op('application_get')},
  '/applications/{application_id}/actions':{post:op('application_action','ApplicationAction')},
  '/applications/{application_id}/invitation':{post:op('application_invitation','ApplicationInvitation',201)},
  '/vacancies/{vacancy_id}/favorite':{post:op('vacancy_favorite','VacancyFavorite')},
  '/me/vacancy-preferences':{get:op('vacancy_preferences_get'),patch:op('vacancy_preferences_update','VacancyPreferences')},
  '/invitations/{invitation_id}/context':{get:op('invitation_context')}
 });
 const query=(name,schema)=>({name,in:'query',schema});
 contract.paths['/needs/{need_id}/candidates'].get.parameters.push(query('demo_catalog',{type:'boolean'}));
 // Preferences use the same CAS PATCH convention as resume/company forms.
 contract.paths['/me/vacancy-preferences'].patch.parameters=[];
 contract.paths['/vacancies'].get.parameters=[...Object.entries(vacancyFiltersSchema.properties).map(([name,schema])=>query(name,schema)),query('page',{type:'integer',minimum:1}),query('state',{enum:['draft','published','archived']})];
 contract.paths['/me/applications'].get.parameters=[query('page',{type:'integer',minimum:1}),query('state',{enum:['sent','viewed','reviewing','interview','rejected','withdrawn']}),query('vacancy_id',{type:'string',format:'uuid'})];
}
