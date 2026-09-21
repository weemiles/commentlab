import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplyTargets } from '../lib/reply-target.js';
test('content selects one tagged comment, not the newest unrelated reply',()=>{
 const a={id:'a',parentId:'r',author:'@other',text:'최대업적은 코스피 2000대에서 6000대까지 올려놓은거같음',publishedText:'1일 전'};
 const unrelated={...a,id:'b',text:'반도체 클러스터 예산 계획과 투자 발표',publishedText:'1일 전'};
 const c={id:'c',parentId:'r',author:'me',text:'@other 주가지수로 평가하나요? 코스피만 올랐고 코스닥은 떨어졌는데요',publishedText:'1일 전'};
 assert.equal(buildReplyTargets([a,unrelated,c]).get('c').target.id,'a');
 assert.equal(buildReplyTargets([a,{...a,id:'tie'},c]).get('c').target,null);
 assert.equal(buildReplyTargets([{...a,publishedText:'1시간 전'},c]).get('c').target,null);
 assert.equal(buildReplyTargets([{...a,parentId:'else'},c]).get('c').target,null);
 assert.equal(buildReplyTargets([a,{...c,text:'@other 무슨 소리인지 모르겠네요'}]).get('c').target,null);
});
