import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://unused';
const {llm,completionUrl}=await import('../src/ai.mjs');const {config}=await import('../src/config.mjs');
test('AI: endpoint normalization, bounded JSON and provider error status',async()=>{
 assert.equal(completionUrl('https://example.test/v1/'),'https://example.test/v1/chat/completions');assert.equal(completionUrl('https://example.test/v1/chat/completions'),'https://example.test/v1/chat/completions');
 const fetchOriginal=globalThis.fetch,settings={...config};Object.assign(config,{llmUrl:'https://example.test/v1',llmKey:'test-secret',llmModel:'Luna'});
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://example.test/v1/chat/completions');const b=JSON.parse(options.body);assert.equal(b.max_tokens,900);assert.equal(b.messages[1].content,'{"text":"data"}');return new Response(JSON.stringify({choices:[{message:{content:'```json\n{"ok":true}\n```'},finish_reason:'stop'}]}));};
  assert.deepEqual(await llm('instruction',{text:'data'},1000,900),{ok:true});
  globalThis.fetch=async()=>new Response('{}',{status:429});await assert.rejects(llm('x',{},1000),e=>e.status===429);
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'length'}]}));await assert.rejects(llm('x',{},1000),/llm_invalid_response/);
 }finally{globalThis.fetch=fetchOriginal;Object.assign(config,settings);}
});
