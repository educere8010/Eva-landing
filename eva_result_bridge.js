(function(){
  const STORAGE_KEY=window.EVAAccountStore?.KEYS?.results||'eva_admission_results_v1';
  const SCHEMA_VERSION='eva-result-v1';

  function array(value){return Array.isArray(value)?value.filter(Boolean):value?[value]:[]}
  function unique(values){return [...new Set(array(values).map(value=>String(value).trim()).filter(Boolean))]}
  const SENSITIVE_KEY_RE=/(raw|original|fullText|recordText|pdf|file|pageText|extracted|uploadAnalysis|evidence|answer|html|transcript)/i;
  const SOURCE_ALLOWLIST=new Set(['grade','major','track','mode','rawRecordStored','schemaVersion','schoolType','gradeSystem','academicYear','testName','admissionType','coreOnly','curriculum']);
  function sanitizeValue(value,key='',mode='default'){
    if(value===null||value===undefined)return value;
    if(SENSITIVE_KEY_RE.test(key))return undefined;
    if(Array.isArray(value)){
      return value.map(item=>sanitizeValue(item,'',mode)).filter(item=>item!==undefined).slice(0,30);
    }
    if(typeof value==='object'){
      const next={};
      Object.entries(value).forEach(([childKey,childValue])=>{
        if(mode==='source'&&!SOURCE_ALLOWLIST.has(childKey))return;
        const sanitized=sanitizeValue(childValue,childKey,mode);
        if(sanitized!==undefined)next[childKey]=sanitized;
      });
      return next;
    }
    if(typeof value==='string')return value.length>500?`${value.slice(0,500)}...`:value;
    return value;
  }
  function privacy(){
    return {
      storageMode:'summary-only',
      rawStored:false,
      fileStored:false,
      notice:'원문, PDF 파일, 상세 전문은 저장하지 않고 대시보드 개인화에 필요한 요약 신호만 저장합니다.'
    };
  }
  function read(){
    if(window.EVAAccountStore)return window.EVAAccountStore.readResults();
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(value)?value:[];
    }catch(error){return []}
  }
  function normalize(input){
    const now=input.createdAt||new Date().toISOString();
    const tool=input.tool||{};
    const summary=input.summary||{};
    const signals=input.signals||{};
    return {
      schemaVersion:SCHEMA_VERSION,
      resultId:input.resultId||`${tool.id||'tool'}-${now.replace(/\D/g,'').slice(0,17)}`,
      createdAt:now,
      tool:{id:tool.id||'unknown',title:tool.title||'입시 도구',category:tool.category||'진단'},
      summary:{
        title:summary.title||tool.title||'진단 결과',
        headline:summary.headline||'',
        score:summary.score??null,
        scoreLabel:summary.scoreLabel||'',
        status:summary.status||'저장됨',
        description:summary.description||''
      },
      metrics:input.metrics&&typeof input.metrics==='object'?sanitizeValue(input.metrics,'metrics'):{},
      signals:{
        strengths:unique(signals.strengths),
        gaps:unique(signals.gaps),
        interests:unique(signals.interests),
        subjects:unique(signals.subjects),
        majors:unique(signals.majors),
        keywords:unique(signals.keywords)
      },
      actions:array(input.actions).map(action=>typeof action==='string'?{label:action}:action).filter(action=>action&&action.label),
      source:input.source&&typeof input.source==='object'?sanitizeValue(input.source,'source','source'):{},
      privacy:privacy()
    };
  }
  function writeItems(items){
    if(window.EVAAccountStore)window.EVAAccountStore.writeResults(items.slice(0,40));
    else localStorage.setItem(STORAGE_KEY,JSON.stringify(items.slice(0,40)));
  }
  function store(input,notify=true){
    const result=normalize(input);
    const items=read().filter(item=>item.resultId!==result.resultId);
    items.unshift(result);
    try{
      writeItems(items);
    }catch(error){}
    if(notify){
      try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'EVA_RESULT_SAVED',payload:result},'*')}catch(error){}
      try{const channel=new BroadcastChannel('eva-admission-results');channel.postMessage(result);channel.close()}catch(error){}
    }
    return result;
  }
  function remove(resultId,notify=true){
    if(!resultId)return false;
    const before=read();
    const after=before.filter(item=>item.resultId!==resultId);
    if(after.length===before.length)return false;
    try{writeItems(after)}catch(error){}
    if(notify){
      try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'EVA_RESULT_REMOVED',resultId},'*')}catch(error){}
      try{const channel=new BroadcastChannel('eva-admission-results');channel.postMessage({type:'EVA_RESULT_REMOVED',resultId});channel.close()}catch(error){}
    }
    return true;
  }
  function latest(toolId){return read().find(item=>!toolId||item.tool?.id===toolId)||null}

  function escapeHTML(value){
    return String(value??'').replace(/[&<>"']/g,char=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));
  }
  function dashboardLabel(page){
    return ({
      dashboard:'홈에서 다음 행동 보기',
      home:'홈에서 다음 행동 보기',
      insights:'나의 리포트에서 보기',
      diagnosis:'진단센터에서 이어가기',
      roadmap:'나의 탐구 로드맵 열기',
      resources:'추천 자료 확인하기',
      report:'성장 기록실 보기'
    })[page]||'대시보드에서 이어가기';
  }
  function fallbackActions(result){
    const id=result?.tool?.id;
    const map={
      'major-fit':[
        {label:'추천 전공과 연결되는 과목 확인',page:'diagnosis'},
        {label:'관심 분야 탐구자료 찾기',page:'resources'}
      ],
      'grade-position':[
        {label:'생기부 진단으로 강점 확인하기',href:'record-deep.html?from=grade-position'},
        {label:'나에게 맞는 이번 주 행동 보기',page:'dashboard'}
      ],
      'record-analysis':[
        {label:'우선 보완 활동을 탐구 로드맵에 반영',page:'roadmap'},
        {label:'전공 연계 탐구자료 확인',page:'resources'}
      ],
      'subject-plan':[
        {label:'선택과목과 연결할 탐구자료 찾기',page:'resources'},
        {label:'나의 탐구 로드맵 열기',page:'roadmap'}
      ],
      'university-fit':[
        {label:'관심 대학 수능최저 확인하기',href:'suneung-minimum.html'},
        {label:'지원 전략 결과 대시보드에서 보기',page:'insights'}
      ],
      'mock-minimum':[
        {label:'지원 전략 범위 다시 점검하기',href:'university-match.html'},
        {label:'대시보드에서 수능최저 결과 보기',page:'insights'}
      ]
    };
    return map[id]||[
      {label:'나의 리포트에서 결과 보기',page:'insights'},
      {label:'추천 자료 확인하기',page:'resources'}
    ];
  }
  function normalizedActions(result){
    const source=(array(result?.actions).length?result.actions:fallbackActions(result)).slice(0,2);
    return source.map(action=>typeof action==='string'?{label:action}:action).filter(action=>action&&action.label);
  }
  function goDashboard(page='insights'){
    const target=page==='home'?'dashboard':(page||'insights');
    try{localStorage.setItem('eva_last_page',target)}catch(error){}
    location.href='dashboard.html';
  }
  function actionButtonHTML(action,index){
    const label=escapeHTML(action.label||dashboardLabel(action.page));
    const cls=index===0?'eva-next-btn primary':'eva-next-btn secondary';
    if(action.href){
      return `<a class="${cls}" href="${escapeHTML(action.href)}">${label}</a>`;
    }
    const page=escapeHTML(action.page||'insights');
    return `<button class="${cls}" type="button" onclick="window.EVAResultBridge.goDashboard('${page}')">${label}</button>`;
  }
  function nextActionHTML(result,options={}){
    if(!result)return '';
    const actions=normalizedActions(result);
    const title=options.title||'결과가 대시보드에 저장되었습니다';
    const subtitle=options.subtitle||`${result.tool?.title||'진단'} 결과가 나의 리포트와 추천 흐름에 반영되었습니다. 이제 바로 다음 행동으로 이어갈 수 있습니다.`;
    const dashboardPage=options.dashboardPage||'insights';
    const privacyText=result.privacy?.notice||privacy().notice;
    return `<section class="eva-next-actions noprint" role="region" aria-label="저장 후 다음 행동">
      <div class="eva-next-actions-head">
        <span class="eva-next-kicker">SAVED</span>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(subtitle)}</p>
        <div class="eva-privacy-note"><b>저장 범위</b> ${escapeHTML(privacyText)}</div>
      </div>
      <div class="eva-next-action-grid">
        <button class="eva-next-btn dashboard" type="button" onclick="window.EVAResultBridge.goDashboard('${escapeHTML(dashboardPage)}')">${escapeHTML(options.dashboardLabel||dashboardLabel(dashboardPage))}</button>
        ${actions.map(actionButtonHTML).join('')}
        <button class="eva-next-btn quiet" type="button" onclick="window.EVAResultBridge.forget('${escapeHTML(result.resultId)}',this)">대시보드 저장 해제</button>
      </div>
    </section>`;
  }
  function forget(resultId,trigger){
    const removed=remove(resultId,true);
    const card=trigger?.closest?.('.eva-next-actions');
    if(card){
      card.innerHTML=`<div class="eva-next-actions-head"><span class="eva-next-kicker">OUTPUT ONLY</span><h3>대시보드 저장을 해제했습니다</h3><p>이 화면의 출력과 확인은 그대로 사용할 수 있습니다. 다만 이 결과는 나의 리포트, 추천, 로드맵에는 반영되지 않습니다.</p></div>`;
    }
    return removed;
  }
  function renderNextActions(target,result,options={}){
    const el=typeof target==='string'?document.querySelector(target):target;
    if(!el||!result)return null;
    const html=nextActionHTML(result,options);
    el.querySelectorAll('.eva-next-actions').forEach(node=>node.remove());
    if(options.append)el.insertAdjacentHTML('beforeend',html);
    else el.innerHTML=html;
    return el;
  }

  window.EVAResultBridge={STORAGE_KEY,SCHEMA_VERSION,read,normalize,save:input=>store(input,true),import:input=>store(input,false),remove,forget,latest,nextActionHTML,renderNextActions,goDashboard};
})();
