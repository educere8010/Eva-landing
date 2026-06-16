(function(root){
  const SCHEMA_VERSION='eva-readiness-v1';
  const DIMENSIONS=[
    {id:'academic',label:'학업 준비',weight:20},
    {id:'majorFit',label:'전공 적합',weight:20},
    {id:'exploration',label:'탐구 실행',weight:20},
    {id:'record',label:'교과·세특 연결',weight:20},
    {id:'reading',label:'독서 연계',weight:10},
    {id:'interview',label:'면접 활용',weight:10}
  ];
  const STAGES={
    interested:{label:'관심',progress:10,next:'exploring'},
    exploring:{label:'탐구 진행',progress:35,next:'reporting'},
    reporting:{label:'보고서 작성',progress:60,next:'recordLinked'},
    recordLinked:{label:'학생부 연결',progress:82,next:'interviewReady'},
    interviewReady:{label:'면접 활용',progress:100,next:null}
  };
  const LEGACY_STAGE={reading:'exploring',researching:'exploring',done:'reporting'};
  const clamp=value=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
  const latest=(results,id)=>results.find(result=>result.tool?.id===id)||null;
  const scoreOf=result=>result&&Number.isFinite(Number(result.summary?.score))?clamp(result.summary.score):null;
  function subjectPlanScore(result){
    if(!result)return null;
    const direct=Number(result.metrics?.subjectPlanScore);
    if(Number.isFinite(direct))return clamp(direct);
    const core=Number(result.metrics?.coreCount)||0;
    const matched=Number(result.metrics?.coreMatched);
    const missing=Array.isArray(result.metrics?.missingCore)?result.metrics.missingCore.length:null;
    const selected=Number(result.metrics?.selectedCount)||0;
    if(core){
      const coreMatched=Number.isFinite(matched)?matched:Math.max(0,core-(missing||0));
      return clamp(45+(coreMatched/core)*35+Math.min(selected,core+2)*4);
    }
    return scoreOf(result);
  }
  function normalizeStage(value){return STAGES[value]?value:LEGACY_STAGE[value]||'interested'}
  function normalizeLibrary(items){return (Array.isArray(items)?items:[]).map(item=>({...item,stage:normalizeStage(item.stage||item.status),status:normalizeStage(item.stage||item.status)}))}
  function weighted(values){const valid=values.filter(item=>item.value!==null&&item.value!==undefined);if(!valid.length)return null;const totalWeight=valid.reduce((sum,item)=>sum+item.weight,0);return clamp(valid.reduce((sum,item)=>sum+item.value*item.weight,0)/totalWeight)}
  function plannerCompletion(planner){
    const weeks=planner?.weeks||{};const key=Object.keys(weeks).sort().reverse()[0];if(!key)return 0;
    const tasks=Object.values(weeks[key]?.tasks||{});return tasks.length?clamp(tasks.filter(task=>task.done).length/tasks.length*100):0;
  }
  function projectAverage(items,predicate=()=>true){const rows=items.filter(predicate);return rows.length?clamp(rows.reduce((sum,item)=>sum+STAGES[item.stage].progress,0)/rows.length):null}
  function calculate(input={}){
    const results=Array.isArray(input.results)?input.results:[],library=normalizeLibrary(input.library),planner=input.planner||{};
    const grade=latest(results,'grade-position'),mock=latest(results,'mock-minimum'),university=latest(results,'university-fit'),major=latest(results,'major-fit'),recordResult=latest(results,'record-analysis'),subjectPlan=latest(results,'subject-plan');
    const percentile=Number(grade?.metrics?.percentile);const gradeScore=Number.isFinite(percentile)?clamp(100-percentile):null;
    const mockTotal=Number(mock?.metrics?.total)||0;const mockScore=mockTotal?clamp(((Number(mock.metrics.pass)||0)+(Number(mock.metrics.near)||0)*.5)/mockTotal*100):null;
    const universityTotal=Number(university?.metrics?.total)||0;const universityScore=universityTotal?clamp(((Number(university.metrics.safe)||0)+(Number(university.metrics.fit)||0)*.8+(Number(university.metrics.reach)||0)*.35)/universityTotal*100):null;
    const academic=weighted([{value:gradeScore,weight:7},{value:mockScore,weight:2},{value:universityScore,weight:1}]);
    const majorFit=scoreOf(major);
    const projectProgress=projectAverage(library);const planProgress=plannerCompletion(planner);
    const exploration=projectProgress===null?null:weighted([{value:projectProgress,weight:8},{value:planProgress,weight:2}]);
    const linkedRatio=library.length?clamp(library.filter(item=>['recordLinked','interviewReady'].includes(item.stage)).length/library.length*100):null;
    const record=weighted([{value:scoreOf(recordResult),weight:6},{value:subjectPlanScore(subjectPlan),weight:2},{value:linkedRatio,weight:2}]);
    const reading=projectAverage(library,item=>String(item.type||'').includes('도서'));
    const interview=library.length?clamp(library.filter(item=>item.stage==='interviewReady').length/library.length*100):null;
    const raw={academic,majorFit,exploration,record,reading,interview};
    const dimensions=DIMENSIONS.map(def=>({...def,score:raw[def.id],available:raw[def.id]!==null,source:dimensionSource(def.id,{grade,mock,university,major,recordResult,subjectPlan,library,planProgress})}));
    const available=dimensions.filter(item=>item.available),coveredWeight=available.reduce((sum,item)=>sum+item.weight,0);
    const total=available.length?clamp(available.reduce((sum,item)=>sum+item.score*item.weight,0)/coveredWeight):null;
    const deficits=dimensions.map(item=>({...item,gap:item.available?100-item.score:101})).sort((a,b)=>b.gap-a.gap);
    const actions=buildActions({dimensions,library,results,deficits});
    return {schemaVersion:SCHEMA_VERSION,total,coverage:coveredWeight,coverageLabel:`${available.length}/${DIMENSIONS.length}개 영역 평가`,dimensions,deficits,actions,projectCount:library.length,calculatedAt:new Date().toISOString()};
  }
  function dimensionSource(id,context){
    if(id==='record'&&context.recordResult&&context.subjectPlan)return '학생부 진단·선택과목 연결 기록';
    if(id==='record'&&context.subjectPlan)return '선택과목 진단 결과';
    if(id==='academic')return context.grade||context.mock||context.university?'내신·수능최저·지원 진단':'내신 위치 또는 수능최저 진단 필요';
    if(id==='majorFit')return context.major?'전공적성 탐색 결과':'전공적성 탐색 필요';
    if(id==='exploration')return context.library.length?`탐구 프로젝트 ${context.library.length}개 · 주간 실행 ${context.planProgress}%`:'탐구함 프로젝트 필요';
    if(id==='record')return context.recordResult||context.library.some(item=>['recordLinked','interviewReady'].includes(item.stage))?'학생부 진단·연결 완료 기록':'학생부 진단 또는 학생부 연결 필요';
    if(id==='reading')return context.library.some(item=>String(item.type||'').includes('도서'))?'탐구도서 진행 기록':'탐구도서 프로젝트 필요';
    return context.library.length?'면접 활용 완료 기록':'탐구 프로젝트 필요';
  }
  function buildActions({dimensions,library,results,deficits}){
    const byId=Object.fromEntries(dimensions.map(item=>[item.id,item])),actions=[];
    const add=action=>{if(!actions.some(item=>item.label===action.label))actions.push(action)};
    const subjectPlan=latest(Array.isArray(results)?results:[],'subject-plan');
    if(!byId.academic.available)add({dimensionId:'academic',label:'내신 위치 진단으로 학업 기준 만들기',toolId:'grade-position',impact:4,reason:'학업 준비 영역이 아직 평가 전입니다.'});
    if(!byId.majorFit.available)add({dimensionId:'majorFit',label:'전공적성 탐색으로 전공 근거 확인하기',toolId:'major-fit',impact:4,reason:'희망전공과 강점의 접점 데이터가 필요합니다.'});
    if(!library.length)add({dimensionId:'exploration',label:'추천 자료 1개를 탐구 프로젝트로 시작하기',page:'resources',impact:2,reason:'실행 중인 탐구 프로젝트가 없습니다.'});
    const active=library.find(item=>item.stage!=='interviewReady');
    if(active){const next=STAGES[active.stage].next;add({dimensionId:next==='recordLinked'?'record':'exploration',label:`${active.title||'탐구 프로젝트'} · ${STAGES[next]?.label||'다음 단계'}로 이동`,page:'library',sourceId:active.id,impact:Math.max(1,Math.round(((STAGES[next]?.progress||100)-STAGES[active.stage].progress)*.2)),reason:`현재 ${STAGES[active.stage].label} 단계에 머물러 있습니다.`})}
    if(!subjectPlan)add({dimensionId:'record',label:'선택과목 진단으로 교과 연결 기준 만들기',toolId:'subject-plan',impact:3,reason:'희망전공과 교과 선택의 연결 근거가 아직 저장되지 않았습니다.'});
    if(!byId.record.available)add({dimensionId:'record',label:'학생부 정밀진단으로 세특 보완점 찾기',toolId:'record-analysis',impact:4,reason:'교과·세특 연결 영역이 아직 평가 전입니다.'});
    deficits.filter(item=>item.available&&item.score<60).forEach(item=>{if(item.id==='interview')add({dimensionId:'interview',label:'완료한 탐구의 면접 질문 3개 작성하기',page:'library',impact:2,reason:'면접 활용 완료 프로젝트가 없습니다.'})});
    deficits.filter(item=>item.available&&item.score<75).forEach(item=>{
      if(item.id==='reading')add({dimensionId:'reading',label:'탐구도서 핵심 주장과 전공 접점 정리하기',page:'library',impact:2,reason:`독서 연계 점수가 ${item.score}점으로 보완 우선순위가 높습니다.`});
      if(item.id==='exploration')add({dimensionId:'exploration',label:'진행 중인 탐구의 분석 기록 완성하기',page:'library',impact:3,reason:`탐구 실행 점수가 ${item.score}점으로 실행 기록이 더 필요합니다.`});
      if(item.id==='record')add({dimensionId:'record',label:'완료한 탐구를 세특 문장으로 연결하기',page:'library',impact:3,reason:`교과·세특 연결 점수가 ${item.score}점입니다.`});
    });
    if(actions.length<3)add({dimensionId:'exploration',label:'이번 주 플래너 과제 1개 완료하기',page:'dashboard',impact:1,reason:'작은 실행을 완료 기록으로 남기면 탐구 실행 근거가 강화됩니다.'});
    return actions.slice(0,3);
  }
  function fingerprint(readiness){return JSON.stringify({total:readiness.total,coverage:readiness.coverage,dimensions:readiness.dimensions.map(item=>[item.id,item.score]),projectCount:readiness.projectCount})}
  root.EVAReadiness={SCHEMA_VERSION,DIMENSIONS,STAGES,normalizeStage,normalizeLibrary,calculate,fingerprint};
})(typeof window!=='undefined'?window:globalThis);
