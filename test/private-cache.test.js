import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateCache } from '../lib/private-cache.js';
test('private cache isolates credentials and parameters, expires and refuses partial reports',()=>{
 let clock=0; const c=createPrivateCache({ttl:10,now:()=>clock});
 const a=c.key('a',['video','ko']), b=c.key('b',['video','ko']);
 c.set(a,{sentimentEngine:'jev',summary:{total:3}});
 assert.equal(c.get(a).summary.total,3); assert.equal(c.get(b),null);
 assert.equal(c.get(c.key('a',['video','en'])),null);
 const copy=c.get(a); copy.summary.total=9; assert.equal(c.get(a).summary.total,3);
 c.set(b,{sentimentEngine:'jev',truncated:true}); assert.equal(c.get(b),null);
 clock=11; assert.equal(c.get(a),null);
 assert.equal(c.key('',[]),null);
});
