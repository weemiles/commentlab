import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, ArrowLeft, ChevronRight, ChevronDown, Download, MessageSquare, Info, Link, Users, ScanText, LoaderCircle, PanelLeft } from 'lucide-react';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from './components/ui/input-group';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from './components/ui/alert';

const initialLanguage = document.documentElement.lang === 'en' ? 'en' : 'ko';
const keyOf = (a:any) => a.id || `name:${a.name}`;
function App() {
  const language = initialLanguage;
  const [analysisLanguage,setAnalysisLanguage]=useState(initialLanguage);
  const t=(ko:string,en:string)=>language==='ko'?ko:en;
  const number=(n:number)=>new Intl.NumberFormat(language==='ko'?'ko-KR':'en-US').format(n||0);
  const [url,setUrl]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [turns,setTurns]=useState<any[]>([]); const [progress,setProgress]=useState<any>({});
  const [lines,setLines]=useState<any[]>([]);
  const [method,setMethod]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const latestRef=useRef<HTMLDivElement>(null); const streamRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{document.documentElement.lang=language;document.title='Commentlab';},[language]);
  useEffect(()=>{if(streamRef.current)streamRef.current.scrollTop=streamRef.current.scrollHeight;},[lines]);
  const labels:any={count:t('전체 댓글','All comments'),positive:t('긍정 댓글','Positive comments'),negative:t('부정 댓글','Negative comments'),neutral:t('중립 댓글','Neutral comments'),mixed:t('혼합 댓글','Mixed comments'),suspicious:t('매크로 의심 댓글','Suspected macro comments')};
  async function analyze(e:React.FormEvent){
    e.preventDefault(); if(busy)return;
    if(!url.trim()){setError(t('YouTube 영상 주소를 입력해주세요.','Enter a YouTube video URL.'));return;}
    const submittedUrl=url.trim();setBusy(true);setError('');setProgress({});setLines([]);setUrl('');
    const jobId=crypto.randomUUID();setTurns(old=>[...old,{id:jobId,url:submittedUrl,analysisLanguage,time:Date.now()}]);setTimeout(()=>latestRef.current?.scrollIntoView({block:'start',behavior:'smooth'}),60);
    const seen=new Set();
    const onProgress=(p:any)=>{setProgress(p);const fresh=(p.recent||[]).filter((c:any)=>{if(seen.has(c.id))return false;seen.add(c.id);return true;});if(fresh.length)setLines(old=>[...old,...fresh].slice(-40));};
    try{
      const response=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json','accept':'application/x-ndjson'},body:JSON.stringify({url:submittedUrl,analysisLanguage})});
      if(!response.ok){const data=await response.json();throw new Error(data.error||t('분석하지 못했습니다.','Analysis failed.'));}
      if(!response.headers.get('content-type')?.includes('application/x-ndjson')||!response.body){
        const data=await response.json();setTurns(old=>old.map(turn=>turn.id===jobId?{...turn,result:data}:turn));
      }else{
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let finished=false;
        const handleLine=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='progress')onProgress(event);else if(event.type==='result'){finished=true;setTurns(old=>old.map(turn=>turn.id===jobId?{...turn,result:event.data}:turn));}else if(event.type==='error')throw new Error(event.error||t('분석하지 못했습니다.','Analysis failed.'));};
        while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let newline;while((newline=buffer.indexOf('\n'))!==-1){handleLine(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}}
        buffer+=decoder.decode();if(buffer.trim())handleLine(buffer);
        if(!finished)throw new Error(t('분석 연결이 완료 전에 끊어졌습니다.','The analysis connection closed before completion.'));
      }
    }
    catch(e:any){setTurns(old=>old.map(turn=>turn.id===jobId?{...turn,error:e.message}:turn));}finally{setBusy(false);}
  }
  return <div className="min-h-svh">
    <header className={`page-header flex flex-col items-center gap-2 px-5 pt-5 ${turns.length&&sidebarOpen?'sidebar-offset':''}`}>
      <Tabs value={analysisLanguage} onValueChange={v=>setAnalysisLanguage(String(v))}>
        <TabsList aria-label="댓글 분석 언어" className="h-12! w-72 rounded-full p-1"><TabsTrigger value="ko" className="rounded-full text-base">한국어 댓글</TabsTrigger><TabsTrigger value="en" className="rounded-full text-base">영어 댓글</TabsTrigger></TabsList>
      </Tabs>
      <p className="language-help text-center text-xs text-muted-foreground">{t('영상의 국가와 관계없이, 분석할 댓글에서 주로 사용하는 언어를 선택해주세요.','Choose the language used by most comments, regardless of the video’s country.')}</p>
    </header>
    <div className={turns.length?`app-shell ${sidebarOpen?'sidebar-open':'sidebar-closed'}`:''}>
    {!!turns.length&&<aside className={`analysis-sidebar ${sidebarOpen?'':'is-collapsed'}`} aria-label={t('기록','History')}>
      <div className="sidebar-heading"><h2>{t('기록','History')}</h2><button type="button" data-tooltip={sidebarOpen?t('사이드바 닫기','Close sidebar'):t('사이드바 열기','Open sidebar')} onClick={()=>setSidebarOpen(v=>!v)} aria-label={sidebarOpen?t('사이드바 닫기','Close sidebar'):t('사이드바 열기','Open sidebar')} aria-expanded={sidebarOpen}><PanelLeft/></button></div>
      <nav>{turns.map((turn,index)=><button type="button" key={turn.id} onClick={()=>document.getElementById(`turn-${turn.id}`)?.scrollIntoView({behavior:'smooth',block:'start'})}><span>{turn.result?.video?.title||turn.url}</span><small>{turn.result?.video?.channel||new Date(turn.time).toLocaleTimeString(language==='ko'?'ko-KR':'en-US',{hour:'2-digit',minute:'2-digit'})}{!turn.result&&!turn.error?` · ${t('분석 중','Analyzing')}`:''}</small></button>)}</nav>
    </aside>}
    <main className={`mx-auto max-w-5xl px-5 sm:px-8 ${turns.length?'chat-main':''}`}>
      <section className={turns.length?'chat-composer':'landing'}>
        <div className="w-full max-w-4xl">
          {!turns.length&&<div className="mb-9 flex items-center justify-center gap-4"><MessageSquare className="size-7 shrink-0" strokeWidth={1.5}/><h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{t('어떤 영상의 댓글을 분석할까요?','Which video’s comments should we analyze?')}</h1></div>}
          <form onSubmit={analyze}>
            <InputGroup className="composer h-auto min-h-16 rounded-3xl">
              <label htmlFor="youtube-url" className="sr-only">{t('YouTube 영상 주소','YouTube video URL')}</label>
              <InputGroupInput id="youtube-url" value={url} onChange={e=>setUrl(e.target.value)} placeholder={t('YouTube 영상 주소를 붙여넣으세요','Paste a YouTube video URL')} className="min-w-0 px-4! text-base!" autoComplete="off" type="url" aria-invalid={!!error} aria-describedby={error?'form-error':undefined}/>
              <InputGroupAddon align="inline-end" className="gap-1 pr-3">
                <InputGroupButton variant="ghost" onClick={()=>setMethod(!method)} aria-expanded={method} aria-label={t('분석 안내','About this analysis')} className="size-10 rounded-full"><Info className="size-5!"/></InputGroupButton>
                <div className="flex items-center"><InputGroupButton type="submit" variant="default" disabled={busy||!url.trim()} className="size-11 rounded-full" aria-label={t('분석 시작','Start analysis')}>{busy?<LoaderCircle className="size-5! animate-spin"/>:<ArrowUp className="size-5!"/>}</InputGroupButton></div>
              </InputGroupAddon>
            </InputGroup>
          </form>
          {error&&<Alert id="form-error" className="mt-4"><Info/><AlertTitle>{t('분석을 시작하지 못했습니다','Unable to analyze')}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {method&&<Alert className="mt-4"><Info/><AlertTitle>{t('분석 기준과 한계','Method and limitations')}</AlertTitle><AlertDescription>{t('공개적으로 수집 가능한 댓글과 답글을 분석합니다. 감정 판정은 문맥에 따라 틀릴 수 있으며, 반복 게시나 의심 점수만으로 자동화를 단정할 수 없습니다.','Analyzes publicly accessible comments and replies. Sentiment can be misinterpreted; repeated posting and suspicious scores do not prove automation.')}</AlertDescription></Alert>}
          {!turns.length&&<div className="mx-auto mt-7 max-w-3xl space-y-5 px-3 text-sm text-muted-foreground sm:text-base">{[[Link,t('영상 링크 하나로 공개 댓글과 답글을 모읍니다.','Collect public comments and replies with one video link.')],[ScanText,t('댓글의 긍정·부정과 반복 패턴을 분석합니다.','Analyze sentiment and repeated phrases.')],[Users,t('작성자별 활동을 비교하고 원문 댓글을 확인하세요.','Compare authors and inspect their original comments.')]].map(([Icon,text]:any)=><p key={text} className="flex items-start gap-4"><Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5}/>{text}</p>)}</div>}
        </div>
      </section>
      <div className="chat-history">{turns.map((turn,index)=><div id={`turn-${turn.id}`} key={turn.id} ref={index===turns.length-1?latestRef:null} className="chat-turn"><div className="mb-10 flex flex-col items-end"><div className="max-w-[85%] rounded-3xl bg-muted px-5 py-4"><a href={turn.url} target="_blank" rel="noreferrer" className="break-all text-sm underline-offset-4 hover:underline">{turn.url}</a><p className="mt-2 text-sm">{t('이 영상의 댓글을 분석해주세요.','Analyze the comments on this video.')}</p></div><p className="mt-2 pr-2 text-xs text-muted-foreground">{new Date(turn.time).toLocaleTimeString(language==='ko'?'ko-KR':'en-US',{hour:'2-digit',minute:'2-digit'})}</p></div>{turn.result&&<ResultReply result={turn.result} language={language}/>} {turn.error&&<Alert><Info/><AlertTitle>{t('분석하지 못했습니다','Analysis failed')}</AlertTitle><AlertDescription>{turn.error}</AlertDescription></Alert>}      {!turn.result&&!turn.error&&busy&&<section className="mx-auto mb-12 max-w-4xl"><div role="status" className="mb-4 flex justify-between gap-4 text-sm"><span>{progress.stage==='classifying'||progress.stage==='finalizing'?t('댓글 분석 중','Analyzing comments'):t('공개 댓글 수집 중','Collecting public comments')} · {number(progress.done)}{progress.total?` / ${number(progress.total)}`:''}</span><span className="inline-flex shrink-0 items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4 animate-spin"/>{progress.stage==='classifying'&&progress.total?`${Math.floor(progress.done/progress.total*100)}%`:t('진행 중','In progress')}</span></div><div ref={streamRef} className="stream h-48 overflow-auto rounded-lg bg-muted p-3 text-xs leading-6">{lines.length?lines.map(c=><div key={c.id} className="truncate"><b>{c.author}</b>　{c.text}</div>):t('YouTube에 연결하고 있습니다…','Connecting to YouTube…')}</div></section>}
</div>)}</div>
    </main>
    </div>
    <footer hidden={!!turns.length} className="site-footer text-center text-xs text-muted-foreground">
      <p><strong>Commentlab</strong><span aria-hidden="true"> | </span>{t('운영: Commentlab 운영팀','Operated by the Commentlab team')}<span aria-hidden="true"> | </span>{t('주소: 서울특별시 강남구 테헤란로 000','Address: 000 Teheran-ro, Gangnam-gu, Seoul')}<span aria-hidden="true"> | </span>{t('전화: 02-0000-0000','Phone: +82-2-0000-0000')}</p>
      <p>{t('문의: hello@commentlab.example','Contact: hello@commentlab.example')}<span aria-hidden="true"> | </span>{t('사업자등록번호: 000-00-00000','Business registration: 000-00-00000')}<span aria-hidden="true"> | </span>{t('통신판매업신고번호: 2026-서울강남-0000','E-commerce registration: 2026-Seoul Gangnam-0000')}</p>
      <p><span>{t('이용약관 준비 중','Terms coming soon')}</span><span aria-hidden="true"> | </span><span>{t('개인정보 처리방침 준비 중','Privacy policy coming soon')}</span><span aria-hidden="true"> | </span><span>{t('사업자 정보 예시','Sample business information')}</span></p>
    </footer>
  </div>;
}

function ResultReply({result,language}:any) {
 const t=(ko:string,en:string)=>language==='ko'?ko:en;
 const number=(n:number)=>new Intl.NumberFormat(language==='ko'?'ko-KR':'en-US').format(n||0);
 const [kind,setKind]=useState('all');const [filter,setFilter]=useState('count');const [author,setAuthor]=useState<any>(null);const [limit,setLimit]=useState(50);const [opinion,setOpinion]=useState<any>(null);
 const labels:any={count:t('전체 댓글','All comments'),positive:t('긍정 댓글','Positive comments'),negative:t('부정 댓글','Negative comments'),neutral:t('중립 댓글','Neutral comments'),mixed:t('혼합 댓글','Mixed comments'),suspicious:t('매크로 의심 댓글','Suspected macro comments')};
  function exportCsv(){
    const quote=(x:any)=>`"${String(x??'').replaceAll('"','""')}"`;
    const rows=[['id','author','comment','sentiment','confidence','suspicious_score','suspicious_reasons','published_at'],...result.comments.map((c:any)=>[c.id,c.author,c.text,c.sentiment.label,c.sentiment.score,c.suspicious.score,c.suspicious.reasons.join(' | '),c.publishedAt])];
    const href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=href;a.download=`comments-${result.video.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
  const activity = useMemo(()=>{
    const byAuthor=new Map<string,any>();let replies=0;
    for(const c of result.comments){const key=c.authorChannelId||`name:${c.author}`;let a=byAuthor.get(key);if(!a){a={comments:[],replies:0,texts:new Map(),likes:0};byAuthor.set(key,a);}a.comments.push(c);a.replies+=c.parentId?1:0;replies+=c.parentId?1:0;a.likes+=c.likeCount||0;const text=c.text.trim().replace(/\s+/g,' ');if(text)a.texts.set(text,(a.texts.get(text)||0)+1);}
    for(const a of byAuthor.values())a.repeated=[...a.texts.values()].reduce((n:number,count:any)=>n+Math.max(0,count-1),0);
    return {byAuthor,replies};
  },[result]);
  const selected=author?activity.byAuthor.get(keyOf(author)):null;
  const authors=result?[...result.authors].filter(a=>a[filter]>0).sort((a,b)=>b[filter]-a[filter]||b.count-a.count):[];
  const matching=selected?selected.comments.filter((c:any)=>filter==='count'||(filter==='suspicious'?c.suspicious.label:c.sentiment.label===filter)):[];
  const comments=matching.filter((c:any)=>kind==='all'||(kind==='reply'?Boolean(c.parentId):!c.parentId));
  const parents=useMemo(()=>new Map(result.comments.map((c:any)=>[c.id,c])),[result]);
  const commentsById=useMemo(()=>new Map(result.comments.map((c:any)=>[c.id,c])),[result]);
  const openAuthor=(a:any)=>{setAuthor(a);setKind('all');setLimit(50);};
  const dominantSentiment=['positive','neutral','negative','mixed'].reduce((best,key)=>result.summary.sentiment[key]>result.summary.sentiment[best]?key:best,'positive');
  const isSelectedAuthor=(c:any)=>Boolean(author&&(author.id&&c.authorChannelId?author.id===c.authorChannelId:author.name===c.author));
 const authorName=(c:any)=><b>{c.author}{isSelectedAuthor(c)&&<span className="selected-author-label">{t('작성자','Author')}</span>}</b>;
 const commentTime=(c:any)=>{if(c.publishedAt){const date=new Date(c.publishedAt);if(!Number.isNaN(date.getTime()))return new Intl.DateTimeFormat(language==='ko'?'ko-KR':'en-US',{dateStyle:'medium',timeStyle:'short'}).format(date);}return c.publishedText||null;};
  const authorSentimentPercent=(label:string)=>selected?.comments.length?Math.round(selected.comments.filter((c:any)=>c.sentiment.label===label).length/selected.comments.length*100):0;

return (      <section className="assistant-result">
        <p className="mb-5 border-b pb-3 text-sm text-muted-foreground">{t('분석 완료','Analysis complete')} · {((result.timing?.totalMs || 0)/1000).toFixed(1)}s</p><div className="mb-6"><p className="text-sm text-muted-foreground">{result.video.channel}</p><h2 className="mt-1 text-xl font-semibold">{result.video.title}</h2></div>
        {result.truncated&&<Alert className="mb-6"><Info/><AlertTitle>{t('일부 댓글만 수집되었습니다','Collection is incomplete')}</AlertTitle><AlertDescription>{t('수집 한도 또는 일부 댓글 요청 실패로 전체 수집을 확인하지 못했습니다. 아래 통계는 수집된 댓글 기준입니다.','A collection limit or failed page requests prevented complete collection. Statistics cover collected comments only.')}</AlertDescription></Alert>}
        <div className="sentiment-card mb-7 rounded-xl border bg-background p-5">
          <p className="mb-3 text-xs text-muted-foreground">{t('긍정: 칭찬·축하·응원 / 부정: 인신공격·악의적 조롱 / 중립: 건설적 비판·진지한 의견·정보 / 혼합: 칭찬·응원과 공격이 함께 있는 댓글','Positive: praise and support / Negative: personal abuse and malicious ridicule / Neutral: constructive criticism, serious opinions and information / Mixed: both support and attacks')}</p>
          <p className="mb-3 text-xs text-muted-foreground">{result.sentimentEngine==='jev'?t('Jev 문맥 분석 · 반어법·인용·부모 댓글을 고려한 판정입니다.','Jev context analysis · considers irony, quotations and parent comments.'):t('로컬 규칙 분석 · Jev가 연결되지 않아 반어법과 문맥 판단이 제한됩니다.','Local rules · Jev is unavailable; irony and context detection are limited.')}</p>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-baseline gap-2"><h3 className="font-medium">{t('댓글 반응','Comment sentiment')}</h3><span className="text-sm text-muted-foreground">{language==='ko'?`댓글 ${number(result.summary.total)}개`:`${number(result.summary.total)} comments`}</span></div><Button variant="outline" onClick={exportCsv}><Download/>{t('CSV 내보내기','Export CSV')}</Button></div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">{['positive','neutral','negative','mixed'].map(k=><div key={k} className={`sentiment-item ${k===dominantSentiment?'is-dominant':''}`}><div className="flex justify-between text-sm"><span>{labels[k]}</span><strong>{number(result.summary.sentiment[k])}</strong></div><div className="my-2 h-1 bg-muted"><div className="h-full bg-neutral-500" style={{width:`${result.summary.total?result.summary.sentiment[k]/result.summary.total*100:0}%`}}/></div><p className="text-xs">{result.summary.total?(result.summary.sentiment[k]/result.summary.total*100).toFixed(1):0}%</p></div>)}</div>
        </div>
        <section className="summary-accordions" aria-label={t('댓글 내용 요약','Comment content summary')}>
          {!!result.opinions?.length&&<details><summary><span>{t('많이 나타난 의견','Most common viewpoints')}</span><span className="accordion-meta"><ChevronDown/></span></summary><div className="accordion-content"><p className="mb-4 text-xs text-muted-foreground">{t('비슷한 댓글의 공통 주제와 반응을 요약했습니다. 의견을 누르면 판단 근거가 된 실제 댓글을 볼 수 있습니다.','We summarized shared themes and reactions. Select a viewpoint to inspect the original comments behind it.')}</p><ol className="opinion-list">{result.opinions.map((item:any,index:number)=><li key={item.commentIds[0]}><button type="button" aria-expanded={opinion?.commentIds[0]===item.commentIds[0]} onClick={()=>setOpinion(opinion?.commentIds[0]===item.commentIds[0]?null:item)}><span className="opinion-rank">{index+1}</span><p>{item.summary||item.representative}</p><Badge variant="secondary" className="shrink-0 rounded-full">{number(item.count)}{t('개','')}</Badge></button>{opinion?.commentIds[0]===item.commentIds[0]&&<div className="opinion-comments">{item.commentIds.map((id:string)=>commentsById.get(id)).filter(Boolean).map((c:any)=><article key={c.id}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{c.author}</strong><span>{c.parentId?t('대댓글','Reply'):t('댓글','Comment')}{commentTime(c)?` · ${commentTime(c)}`:''} · {t('좋아요','Likes')} {number(c.likeCount)}</span></div><p>{c.text}</p></article>)}</div>}</li>)}</ol></div></details>}
          <details><summary><span>{t('자주 등장한 단어','Frequent terms')}</span><span className="accordion-meta"><ChevronDown/></span></summary><div className="accordion-content"><div className="flex flex-wrap gap-2">{[...result.topics].sort((a:any,b:any)=>b.count-a.count).map((v:any)=><Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-normal" key={v.term}>{v.term}<span className="ml-1 text-blue-600 tabular-nums">{number(v.count)}</span></Badge>)}</div></div></details>
        </section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4"><h3 className="text-lg font-semibold">{t('작성 활동','Author activity')}</h3><Tabs className="activity-tabs" value={filter} onValueChange={v=>{setFilter(String(v));setAuthor(null);setLimit(50);}}><TabsList aria-label={t('작성자 순위 기준','Ranking criteria')}>{['count','positive','negative','suspicious'].map(k=>{const count=k==='count'?result.authors.length:k==='suspicious'?result.summary.suspicious:result.summary.sentiment[k];return <TabsTrigger key={k} value={k}>{k==='count'?t('작성자','Authors'):labels[k]}<span className="tabular-nums">{number(count)}</span></TabsTrigger>;})}</TabsList></Tabs></div>
        {author ? <>
          <Button variant="ghost" className="mb-4 -ml-2" onClick={()=>{setAuthor(null);setLimit(50);}}><ArrowLeft/>{t('작성자 목록','Back to authors')}</Button>
          <div className="mb-5 pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h4 className="font-semibold">{author.name}</h4>{author.id&&<span className="break-all text-xs font-normal text-muted-foreground">{author.id}</span>}</div><span className="text-sm">{t('전체 댓글','Total comments')} <strong>{number(author.count)}</strong></span></div>
            <div className="author-details mt-3 text-xs text-muted-foreground"><div><span>{t('작성 댓글 성향','Comment tendency')}</span><strong><span className={authorSentimentPercent('positive')>=authorSentimentPercent('negative')?'text-blue-600':''}>{t('긍정','Positive')} {authorSentimentPercent('positive')}%</span> · <span className={authorSentimentPercent('negative')>authorSentimentPercent('positive')?'text-blue-600':''}>{t('부정','Negative')} {authorSentimentPercent('negative')}%</span></strong></div><div><span>{t('받은 좋아요','Likes received')}</span><strong>{number(selected.likes)}</strong></div><p>{t(`이 영상에서 수집한 댓글 ${number(selected.comments.length)}개만 기준으로 계산한 성향이며, 계정이나 사람 자체에 대한 평가는 아닙니다.`,`This tendency is based only on ${number(selected.comments.length)} comments collected from this video and is not an assessment of the account or person.`)}</p></div>
          </div>
          <Tabs className="comment-kind" value={kind} onValueChange={v=>{setKind(String(v));setLimit(50);}}><TabsList aria-label={t('댓글 유형','Comment type')}>{[['all',t('전체','All'),matching.length],['top',t('댓글','Comments'),matching.filter((c:any)=>!c.parentId).length],['reply',t('대댓글','Replies'),matching.filter((c:any)=>c.parentId).length]].map(([value,label,count])=><TabsTrigger key={String(value)} value={String(value)}>{label} <span className="ml-1 tabular-nums">{number(Number(count))}</span></TabsTrigger>)}</TabsList></Tabs>
          {comments.slice(0,limit).map((c:any,i:number)=>{
            const parent:any=c.parentId?parents.get(c.parentId):null;
            const reasons=c.suspicious.reasons.filter((r:string)=>!r.includes('동일 작성자')&&!r.includes('Same author'));
            return <article key={c.id} className="thread-record">
              <div className="thread-bubbles">
                {parent&&<div className="thread-bubble thread-parent"><div className="thread-meta">{authorName(parent)}<small>{t('댓글','Comment')}{commentTime(parent)?` · ${commentTime(parent)}`:''} · {t('좋아요','Likes')} {number(parent.likeCount)}</small></div><p>{parent.text}</p></div>}
                <div className={`thread-bubble ${parent?'thread-reply':'thread-parent'}`}><div className="thread-meta">{authorName(c)}<small>{c.parentId?t('대댓글','Reply'):t('댓글','Comment')}{commentTime(c)?` · ${commentTime(c)}`:''} · {t('좋아요','Likes')} {number(c.likeCount)}</small></div><p>{c.text}</p></div>
              </div>
              {reasons.length>0&&<p className="thread-signals">{t('의심 근거','Signals')} · {reasons.join(' · ')}</p>}
            </article>;
          })}
          {!comments.length&&<p className="py-8 text-center text-sm text-muted-foreground">{t('해당하는 댓글이 없습니다.','No matching comments.')}</p>}
          {comments.length>limit&&<Button className="mt-4" variant="outline" onClick={()=>setLimit(n=>n+50)}>{t('댓글 더 보기','Load more comments')} · {number(Math.min(limit,comments.length))} / {number(comments.length)}</Button>}
        </> : <>
          <Table><TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>{t('작성자','Author')}</TableHead><TableHead className="text-right">{labels[filter]}</TableHead></TableRow></TableHeader><TableBody>
            {authors.slice(0,limit).map((a:any,i:number)=><TableRow key={keyOf(a)} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} aria-label={a.name+' · '+labels[filter]+' '+number(a[filter])} onClick={()=>openAuthor(a)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAuthor(a);}}}><TableCell className="text-muted-foreground">{i+1}</TableCell><TableCell className="max-w-0 py-4"><span className="block truncate font-medium">{a.name}</span></TableCell><TableCell className="text-right"><span className="inline-flex items-center gap-3 tabular-nums">{number(a[filter])}<ChevronRight className="size-4 text-muted-foreground"/></span></TableCell></TableRow>)}
            {!authors.length&&<TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">{t('해당하는 작성자가 없습니다.','No matching authors.')}</TableCell></TableRow>}
          </TableBody></Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{number(Math.min(limit,authors.length))} / {t('총','Total')} {number(authors.length)}{t('명',' authors')}</p>{authors.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+50)}>{t('작성자 더 보기','Load more authors')} · {t('남은','Remaining')} {number(authors.length-limit)}{t('명','')}</Button>}</div>
        </>}
      </section>);
}

createRoot(document.getElementById('root')!).render(<App/>);
