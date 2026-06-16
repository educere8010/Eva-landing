(function(root){
  'use strict';

  const SCHEMA_VERSION='eva-record-analysis-v1';
  const SECTIONS=[
    {id:'attendance',label:'출결상황',aliases:['출결상황']},
    {id:'creative',label:'창의적 체험활동',aliases:['창의적 체험활동상황','창의적 체험활동 상황','자율활동','동아리활동','진로활동']},
    {id:'academic',label:'교과학습발달상황',aliases:['교과학습발달상황','교과학습 발달상황']},
    {id:'subjectDetails',label:'세부능력 및 특기사항',aliases:['세부능력 및 특기사항','세부 능력 및 특기 사항']},
    {id:'reading',label:'독서활동상황',aliases:['독서활동상황','독서 활동상황']},
    {id:'behavior',label:'행동특성 및 종합의견',aliases:['행동특성 및 종합의견','행동 특성 및 종합 의견']},
    {id:'awardsOther',label:'기타 기록',aliases:['수상경력','자격증 및 인증 취득상황','봉사활동실적']},
    {id:'unknown',label:'분류 전 원문',aliases:[]}
  ];

  const INDICATORS={
    initiative:{label:'자기주도',keywords:['스스로','자발적','주도','기획','제안','선정','의문','질문','관심을 바탕','추가로']},
    inquiry:{label:'탐구 질문',keywords:['탐구','알아보고자','궁금','문제의식','가설','연구 문제','질문을']},
    method:{label:'방법·자료',keywords:['조사','자료 수집','수집하여','실험','설계','측정','관찰','비교','분석','모델링','시뮬레이션','설문','통계','계산']},
    outcome:{label:'산출물·결론',keywords:['도출','결론','발표','보고서','제작','구현','완성','시각화','제안함','설명함']},
    growth:{label:'성장·확장',keywords:['한계','보완','개선','피드백','성찰','후속','확장','심화','변화','성장','발전','다음 탐구']},
    career:{label:'진로 연결',keywords:['진로','희망 학과','전공','학과','직업','진학','관심 분야','계열']},
    collaboration:{label:'협업·공동체',keywords:['협력','협업','모둠','팀원','역할 분담','갈등 조정','의견을 수렴','도움','배려','소통','멘토링','리더']},
    persistence:{label:'성실·지속',keywords:['꾸준','성실','책임','지속','빠짐없이','적극적으로 참여','끝까지','자기관리','개근']},
    achievement:{label:'학업 성취',keywords:['성취','향상','우수','상승','극복','학업','학습','개념을 이해','원리를 이해','정확히']},
    course:{label:'교과 선택·연계',keywords:['과목 선택','진로선택','공동교육과정','온라인학교','교과 연계','수업에서','교과 개념','과목에서']},
    reading:{label:'독서 연계',keywords:['독서','책을 읽','도서를 읽','저자','서평']}
  };

  const DIMENSIONS=[
    {id:'direction',label:'방향 정합도',weight:15,indicators:['career','course'],majorMatch:true},
    {id:'initiative',label:'활동 주도성',weight:10,indicators:['initiative','inquiry','growth']},
    {id:'recordAccumulation',label:'기록 축적도',weight:5,indicators:['inquiry','method','outcome','growth'],coverage:true},
    {id:'achievementTrend',label:'학업 성취 추이',weight:5,indicators:['achievement','growth']},
    {id:'inquiryDepth',label:'탐구력',weight:10,indicators:['inquiry','method','outcome','growth'],processChain:true},
    {id:'courseFit',label:'교과 선택 적절성',weight:10,indicators:['course','career'],majorMatch:true},
    {id:'collaboration',label:'공동체·협업 태도',weight:0,indicators:['collaboration','persistence']},
    {id:'selfManagement',label:'성실성·자기관리',weight:0,indicators:['persistence','achievement']}
  ];

  const DOCUMENT_SCHEMA={
    document:['documentId','fileName','pageCount','characterCount','extractionMode','rawStored'],
    evidence:['evidenceId','sectionId','page','excerpt','indicatorIds','majorCompetencyIds','confidence'],
    result:['dimensions','majorCompetencies','overallScore','strengths','gaps','reviewRequired','privacy']
  };

  root.EVARecordSchema={SCHEMA_VERSION,SECTIONS,INDICATORS,DIMENSIONS,DOCUMENT_SCHEMA};
})(typeof globalThis!=='undefined'?globalThis:window);
