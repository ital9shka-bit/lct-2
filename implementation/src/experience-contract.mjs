export function addExperienceContract(contract){
 // Additive v09 contract: existing frozen v08 remains available in the source archive.
 const extend=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node.enum)&&node.enum.length===2&&node.enum.includes('Junior')&&node.enum.includes('Middle'))node.enum.push('Senior');for(const value of Object.values(node))extend(value);};
 extend(contract);
 contract.components.schemas.FSPEvent.properties.event_name={type:'string',maxLength:200};
 for(const name of ['CatalogEntry','AttemptStart','Attempt'])contract.components.schemas[name].properties.specialization={type:'string',enum:['Backend','Frontend']};
 for(const p of contract.paths['/assessments/eligibility']?.get?.parameters||[])if(p.name==='specialization')p.schema={type:'string',enum:['Backend','Frontend']};
 for(const key of ['name','description','representative_name','representative_role'])if(contract.components.schemas.Company.properties[key])contract.components.schemas.Company.properties[key].minLength=0;
 const current=contract.paths['/cognitive/sessions/current']?.get?.responses?.['200']?.content?.['application/json'];
 contract.components.schemas.CognitiveStart.properties.version={enum:['cognitive-0.8.0','cognitive-0.9.0']};
 contract.components.schemas.CognitiveSession.properties.potential={type:'object'};
 contract.components.schemas.CognitiveTask.properties.rule_reference={type:'string',maxLength:1500};
 contract.components.schemas.CognitiveTask.properties.prompt_title={type:'string',maxLength:200};
 for(const name of ['Self','SelfPatch'])Object.assign(contract.components.schemas[name].properties,{reflection:{type:'string',maxLength:1200},support:{type:'string',maxLength:600}});
 if(current)current.schema={anyOf:[current.schema,{type:'null'}]};
 const text=(max=1500,min=0)=>({type:'string',minLength:min,maxLength:max}),revision={type:'integer',minimum:1},uuid={type:'string',format:'uuid'},ref=name=>({$ref:'#/components/schemas/'+name});
 const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
 const observation=object({ordinal:{type:'integer',minimum:1,maximum:6},label:text(200),correct:{anyOf:[{type:'boolean'},{type:'null'}]}});
 const direction=object({dimension:{enum:['analytical','learning','flexibility']},title:text(200),answered:{type:'integer',minimum:0,maximum:2},correct:{anyOf:[{type:'integer',minimum:0,maximum:2},{type:'null'}]},total:{const:2},complete:{type:'boolean'},headline:text(200),interpretation:text(1000),next:text(1000),evidence:{type:'array',minItems:2,maxItems:2,items:observation}});
 contract.components.schemas.CognitiveSession.properties.potential=object({protocol:{const:'potential-observations-1'},state:{enum:['not_started','in_progress','deferred','feedback','completed']},version:{anyOf:[text(50),{type:'null'}]},answered:{type:'integer',minimum:0,maximum:6},directions:{type:'array',minItems:3,maxItems:3,items:direction},limit:text(1500),calculation:text(1500)});
 contract.components.schemas.PublicProfile.properties.potential_summary={anyOf:[object({learning:text(200),flexibility:text(200),version:text(50)}),{type:'null'}]};
 const fields=Object.fromEntries(['organization','period','role','contribution','results'].map(f=>[f,{enum:['verified','not_verified','needs_info']}])) ;
 Object.assign(contract.components.schemas,{
  ExperienceEntry:object({id:uuid,organization:text(200,1),period:text(120,1),role:text(200,1),contribution:text(1500,1),results:text(1500,1),evidence_url:text(2048),evidence_text:text(3000),reference_permission:{type:'boolean'}}),
  ExperienceUpdate:object({expected_revision:revision,entries:{type:'array',maxItems:8,items:ref('ExperienceEntry')}}),
  ExperienceAction:object({expected_revision:revision,action:{enum:['submit','defer','resume','appeal','no_experience']},message:text(1500)},['expected_revision','action']),
  ExperienceClaim:object({expected_revision:revision}),
  ExperienceDecisionItem:object({entry_id:uuid,fields:object(fields),method:{enum:['artifact','interview','reference','mixed']},basis:text(2000,10)}),
  ExperienceDecision:object({expected_revision:revision,items:{type:'array',minItems:1,maxItems:8,items:ref('ExperienceDecisionItem')},reason:text(2000,10)}),
  ReviewAssignment:object({expected_revision:revision}),
  ReviewReopen:object({expected_revision:revision,reason:text(2000,10)})
 });
 contract.components.schemas.PdfImport=object({base64:{type:'string',minLength:8,maxLength:5600000,pattern:'^[A-Za-z0-9+/]+={0,2}$'},use_ai:{type:'boolean'}},['base64']);
 const op=(operationId,body)=>({operationId,responses:{200:{description:'Assessment/experience projection'}},...(body?{requestBody:{required:true,content:{'application/json':{schema:ref(body)}}},parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:uuid}]}:{})});
 Object.assign(contract.paths,{
  '/me/summary':{get:op('summary_get')},'/me/summary/preview':{get:op('summary_preview')},'/candidates/{candidate_id}/summary':{get:op('summary_public')},
  '/me/experience':{get:op('experience_get'),patch:op('experience_update','ExperienceUpdate')},
  '/me/experience/actions':{post:op('experience_action','ExperienceAction')},
  '/internal/experience':{get:op('experience_queue')},
  '/internal/experience/{case_id}':{get:op('experience_detail')},
  '/internal/experience/{case_id}/claim':{post:op('experience_claim','ExperienceClaim')},
  '/internal/experience/{case_id}/decision':{post:op('experience_decide','ExperienceDecision')},
  '/reviews/{attempt_id}/claim':{post:op('review_claim','ReviewAssignment')},
  '/reviews/{attempt_id}/reopen':{post:op('review_reopen','ReviewReopen')}
 });
 contract.paths['/assessments/attempts/{attempt_id}/history']={get:op('assessment_review_history')};
 contract.paths['/me/assessment/active']={get:op('assessment_active')};
 contract.paths['/me/resume/import-pdf']={post:op('resume_import_pdf','PdfImport')};
 contract.paths['/internal/reviews/completed']={get:op('review_completed')};
 contract.components.schemas.ProfileContext=object({expected_revision:revision,domain:{enum:[null,'EdTech','FinTech','E-commerce','Gaming','SaaS','Other']}});
 contract.paths['/me/profile-context']={get:op('profile_context_get'),patch:op('profile_context_update','ProfileContext')};contract.paths['/me/profile-context'].patch.parameters=[];
 contract.paths['/me/experience'].patch.parameters=[];
 // Visibility remains opt-in; the frozen input contract is not rewritten on disk.
 for(const name of ['Resume','ResumePatch']){
  const sections=contract.components.schemas[name]?.properties?.visibility_sections?.items;
  if(sections?.enum&&!sections.enum.includes('assessment'))sections.enum.push('assessment');
 }
}
