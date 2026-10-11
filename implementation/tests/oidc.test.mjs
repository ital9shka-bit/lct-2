import test from 'node:test';
import assert from 'node:assert/strict';
import {oidcIdentity} from '../src/oidc.mjs';
const identity={sub:'trusted-subject',email:'Talent@oop.test',email_verified:true,nonce:'login-nonce',azp:'oop-web',realm_access:{roles:['default-roles-oop-demo','oop-talent']}};
test('OIDC: role comes from verified claims and email is normalized',()=>{
 assert.deepEqual(oidcIdentity(identity,'login-nonce','oop-web'),{subject:'trusted-subject',email:'talent@oop.test',role:'candidate'});
 for(const [role,expected] of [['oop-employer','employer'],['oop-reviewer','reviewer']])assert.equal(oidcIdentity({...identity,realm_access:{roles:[role]}},'login-nonce','oop-web').role,expected);
});
test('OIDC: reject wrong nonce, authorized party, unverified email and ambiguous roles',()=>{
 for(const p of [{...identity,nonce:'other'},{...identity,azp:'other-client'},{...identity,email_verified:false},{...identity,sub:''},{...identity,realm_access:{roles:[]}},{...identity,realm_access:{roles:['oop-talent','oop-reviewer']}}])assert.throws(()=>oidcIdentity(p,'login-nonce','oop-web'));
});
