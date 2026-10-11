import {config} from './config.mjs';

export function completionUrl(url) {
 const base=url.replace(/\/+$/,'');
 return base.endsWith('/chat/completions')?base:base+'/chat/completions';
}
export const aiAvailable=()=>!!(config.llmUrl&&config.llmKey&&config.llmModel);
// One bounded call per operation. Provider failures never turn into a zero score.
export async function llm(instruction,payload,timeout=20000,maxTokens=1800) {
 if(!aiAvailable())throw new Error('llm_unconfigured');
 const response=await fetch(completionUrl(config.llmUrl),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.llmKey},body:JSON.stringify({model:config.llmModel,messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(payload)}],temperature:0,max_tokens:maxTokens,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(timeout)});
 if(!response.ok){const error=new Error('llm_provider_error');error.status=response.status;throw error;}
 const data=await response.json(),content=data.choices?.[0]?.message?.content;
 if(typeof content!=='string'||data.choices[0].finish_reason==='length')throw new Error('llm_invalid_response');
 return JSON.parse(content.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
}
