import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplyTargets } from '../lib/reply-target.js';
test('reply targets stay in thread and prefer preceding tagged comments, with ties unresolved',()=>{
 const root={id:'r',author:'root',text:'topic',publishedText:'1일 전'};
 const a={id:'a',parentId:'r',author:'@other',text:'argument',publishedText:'22시간 전'};
 const b={id:'b',parentId:'r',author:'me',text:'@other rebuttal',publishedText:'13시간 전'};
 const outside={...a,id:'outside',parentId:'else',publishedText:'14시간 전'};
 assert.equal(buildReplyTargets([root,a,b,outside]).get('b').target.id,'a');
 assert.equal(buildReplyTargets([root,a,{...a,id:'tie'},b]).get('b').status,'ambiguous');
 assert.equal(buildReplyTargets([root,{...a,publishedText:'12시간 전'},b]).get('b').target,null);
 assert.equal(buildReplyTargets([root,b,outside]).get('b').status,'missing');
 assert.equal(buildReplyTargets([root,a,{...b,publishedText:'13시간 전(수정됨)'}]).get('b').target,null);
});
