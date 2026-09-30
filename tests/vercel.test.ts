import test from 'node:test';
import assert from 'node:assert/strict';
import entry from '../api/index.ts';

test('Vercel rejects client-supplied Sites identity and fails closed outside protected production',async()=>{
 const previous={mode:process.env.VERCEL_PRIVATE_OWNER_MODE,environment:process.env.VERCEL_ENV,legacy:process.env.PRIVATE_OWNER_MODE};
 try{
  process.env.VERCEL_PRIVATE_OWNER_MODE='true';process.env.VERCEL_ENV='preview';delete process.env.PRIVATE_OWNER_MODE;
  const response=await entry.fetch(new Request('https://patchgoblin.vercel.app/api/jobs',{headers:{'oai-authenticated-user-id':'spoofed-owner'}}));
  assert.equal(response.status,401);
 }finally{
  for(const [key,value] of Object.entries({VERCEL_PRIVATE_OWNER_MODE:previous.mode,VERCEL_ENV:previous.environment,PRIVATE_OWNER_MODE:previous.legacy})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
