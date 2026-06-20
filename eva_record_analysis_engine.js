(function(root){
  'use strict';

  const schema=root.EVARecordSchema;
  if(!schema)throw new Error('EVARecordSchema is required');

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const unique=items=>[...new Set(items)];
  const normalize=text=>String(text||'').replace(/\u0000/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const redact=text=>String(text||'')
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g,'[주민번호 삭제]')
    .replace(/\b01[016789]-?\d{3,4}-?\d{4}\b/g,'[연락처 삭제]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[이메일 삭제]')
    .replace(/[가-힣A-Za-z0-9]{2,20}(고등학교|중학교)/g,'[학교명 삭제]')
    .replace(/(성명|이름)\s*[:：]?\s*[가-힣]{2,4}/g,'$1 [이름 삭제]');

  function sectionForHeading(line){
    const compact=String(line||'').replace(/\s+/g,'');
    return schema.SECTIONS.find(section=>section.aliases.some(alias=>compact.includes(alias.replace(/\s+/g,''))))||null;
  }

  function splitSentences(text){
    const cleaned=normalize(text).replace(/([함됨임음줌봄냄짐룸])\.\s*/g,'$1.\n');
    return cleaned.split(/\n+|(?<=[.!?])\s+/).map(item=>item.trim()).filter(item=>item.length>=24 && item.length<=900);
  }

  function extractSectionSentences(pages){
    const rows=[];
    pages.forEach((pageText,pageIndex)=>{
      let current='unknown';
      normalize(pageText).split(/\n+/).forEach(line=>{
        const heading=sectionForHeading(line);
        if(heading)current=heading.id;
        splitSentences(line).forEach(text=>rows.push({page:pageIndex+1,sectionId:current,text}));
      });
    });
    return rows;
  }

  function indicatorIds(text){
    return Object.entries(schema.INDICATORS).filter(([,indicator])=>indicator.keywords.some(keyword=>text.includes(keyword))).map(([id])=>id);
  }

  const STOPWORDS=new Set([
    '관련','활동','경험','기록','학생','대한','통해','포함','이해','능력','역량','탐구','분석','과정','정도','기반','문제','학습','교과','주제','분야','직접','자신','다양한','이상','관점',
    '수업','과목','결과','자료','내용','보고','확인','제시','설명','활용','실시','수행','참여','관심','가지고','있으며','있음','하였다','하였으며','보임','모습','태도','노력','통하여','위하여',
    '학교','학년','학기','학급','교내','진로활동','창의적','체험활동상황','세부능력','특기사항','행동특성','종합의견',
    '역할','프로젝트','발표함','분담','갈등','개선','완성','전공','팀원','의견','수렴','끝까지','친구','멘토링','지속','피드백','반영','방식','책임감','수행함','제안함','제안','도출함','주도함','계획','관계','갖고','성찰','반영하지','못한','한계','후속','변수'
  ]);
  const SUBJECTS=['국어','문학','독서','화법과 작문','언어와 매체','수학','미적분','확률과 통계','기하','영어','물리학','화학','생명과학','지구과학','통합과학','사회문화','경제','정치와 법','생활과 윤리','윤리와 사상','한국사','세계사','한국지리','세계지리','정보','기술·가정'];
  const METHOD_GROUPS=[
    {id:'experiment',label:'실험·측정',keywords:['실험','측정','관찰','변인','대조군','반복 측정']},
    {id:'data',label:'데이터·통계 분석',keywords:['데이터','통계','자료를 수집','자료 수집','분석','시각화','상관관계','회귀','평균','분산']},
    {id:'modeling',label:'수학적 모델링',keywords:['모델링','모형화','함수','수식','계산','최적값','시뮬레이션']},
    {id:'research',label:'문헌·사례 조사',keywords:['조사','문헌','논문','기사','사례','자료를 찾아','자료를 조사']},
    {id:'design',label:'설계·제작',keywords:['설계','제작','구현','시제품','프로토타입','코딩','개발']},
    {id:'survey',label:'설문·인터뷰',keywords:['설문','인터뷰','면담','응답']},
    {id:'discussion',label:'토론·비교',keywords:['토론','논증','비교','반론','쟁점']},
    {id:'presentation',label:'발표·설명',keywords:['발표','설명','공유','프레젠테이션']}
  ];
  const OUTPUT_GROUPS=[
    {id:'report',label:'탐구 보고서',keywords:['보고서','소논문','연구 보고']},
    {id:'presentation',label:'발표 자료',keywords:['발표','프레젠테이션','포스터']},
    {id:'prototype',label:'설계·제작물',keywords:['시제품','제작물','프로토타입','설계안','모형']},
    {id:'model',label:'분석 모델',keywords:['모델링','모형화','시뮬레이션','시각화']},
    {id:'proposal',label:'제안서·개선안',keywords:['제안서','개선안','정책 제안','해결 방안']}
  ];
  const TOKEN_SUFFIXES=['으로부터','에서부터','이라고','이라는','에서는','으로는','에게서','까지는','으로써','적으로','하며','하여','해서','되어','되는','하기','하지','하고','에도','에서','에게','보다','처럼','으로','와의','과의','들을','에는','이나','거나','함','로','적','에','의','을','를','이','가','은','는','과','와'];

  function cleanTopicToken(value){
    let token=String(value||'').replace(/^[0-9]+|[0-9]+$/g,'');
    for(const suffix of TOKEN_SUFFIXES){
      if(token.endsWith(suffix)&&token.length-suffix.length>=2){
        token=token.slice(0,-suffix.length);
        break;
      }
    }
    return token;
  }

  function keywordTokens(value){
    return unique(String(value||'').match(/[가-힣A-Za-z0-9]{2,}/g)||[])
      .map(cleanTopicToken)
      .filter(token=>!STOPWORDS.has(token)&&token.length>=2);
  }

  function normalizeMajorCriteria(criteria){
    return (criteria||[]).map((item,index)=>({
      id:item.id||`major-${index+1}`,
      label:item.nm||item.label||`학과 역량 ${index+1}`,
      description:item.def||item.description||'',
      tokens:keywordTokens([item.nm,item.def,item.high,item.tag].filter(Boolean).join(' ')).slice(0,36)
    }));
  }

  function buildEvidence(rows,majorCriteria){
    return rows.map((row,index)=>{
      const indicators=indicatorIds(row.text);
      const majorHits=majorCriteria.map(criterion=>({id:criterion.id,hits:criterion.tokens.filter(token=>row.text.includes(token)).length})).filter(item=>item.hits>=2);
      if(!indicators.length&&!majorHits.length)return null;
      const confidence=indicators.length>=3||majorHits.some(item=>item.hits>=4)?'high':indicators.length>=2||majorHits.length?'medium':'low';
      return {
        evidenceId:`ev-${index+1}`,
        sectionId:row.sectionId,
        page:row.page,
        excerpt:redact(row.text).slice(0,260),
        indicatorIds:indicators,
        majorCompetencyIds:majorHits.map(item=>item.id),
        confidence,
        quality:indicators.length+majorHits.reduce((sum,item)=>sum+Math.min(item.hits,4),0)
      };
    }).filter(Boolean);
  }

  function evidenceScore(items,definition){
    if(definition.coverage){
      // 기록 축적도: '양'이 아니라 탐구 과정(질문→방법→결론→성장)의 다양성·깊이로 채점
      const rel=items.filter(item=>['inquiry','method','outcome','growth'].some(id=>item.indicatorIds.includes(id)));
      if(!rel.length)return 30;
      const process=unique(rel.flatMap(item=>item.indicatorIds).filter(id=>['inquiry','method','outcome','growth'].includes(id))).length; // 0..4
      const sections=unique(rel.map(item=>item.sectionId)).length;
      const deep=rel.filter(item=>item.quality>=4).length;
      return clamp(32+process*9+Math.min(sections,3)*3+Math.min(deep,4)*3,30,96);
    }
    const relevant=items.filter(item=>definition.indicators.some(id=>item.indicatorIds.includes(id))||(definition.majorMatch&&item.majorCompetencyIds.length));
    if(!relevant.length)return 30;
    const sections=unique(relevant.map(item=>item.sectionId)).length;
    const distinctInd=unique(relevant.flatMap(item=>item.indicatorIds).filter(id=>definition.indicators.includes(id))).length; // 이 역량 facet의 다양성=깊이
    const deep=relevant.filter(item=>item.quality>=4).length;                  // 깊이 있는(질 높은) 근거 수
    const chain=definition.processChain?['inquiry','method','outcome','growth'].filter(id=>relevant.some(item=>item.indicatorIds.includes(id))).length:0;
    return clamp(
      34
      +Math.min(relevant.length,5)*4   // 양(상한 20) — 영향 축소
      +Math.min(sections,3)*3          // 영역 분포(상한 9)
      +distinctInd*5                   // facet 다양성 = 깊이(핵심 변별 요소)
      +Math.min(deep,3)*4              // 고품질 근거(상한 12)
      +(definition.processChain?(chain>=4?10:chain>=3?6:0):0), // 과정 사슬 완성도
      30,97);
  }

  function confidenceFor(items){
    const sections=unique(items.map(item=>item.sectionId)).length;
    if(items.length>=3&&sections>=2)return'high';
    if(items.length>=1)return'medium';
    return'low';
  }

  function buildProfile(evidence,majorCriteria){
    const source=evidence.map(item=>item.excerpt).join(' ');
    const tokenScores=new Map();
    evidence.forEach(item=>{
      keywordTokens(item.excerpt).forEach(token=>{
        if(SUBJECTS.includes(token)||METHOD_GROUPS.some(group=>group.keywords.includes(token))||OUTPUT_GROUPS.some(group=>group.keywords.includes(token)))return;
        const lengthBoost=token.length>=4?2:1;
        const sectionBoost=item.sectionId==='subjectDetails'?4:item.sectionId==='career'?2:0;
        tokenScores.set(token,(tokenScores.get(token)||0)+lengthBoost+sectionBoost+Math.min(item.quality,4));
      });
    });
    majorCriteria.forEach(criterion=>criterion.tokens.forEach(token=>{
      if(source.includes(token))tokenScores.set(token,(tokenScores.get(token)||0)+3);
    }));
    const topicTerms=[...tokenScores.entries()]
      .filter(([token])=>!STOPWORDS.has(token)&&!/^(성명|이름|남자|여자|생년월일)$/.test(token))
      .sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length)
      .slice(0,12)
      .map(([token])=>token);
    const subjects=SUBJECTS.filter(subject=>source.includes(subject));
    const methods=METHOD_GROUPS
      .map(group=>({...group,hits:group.keywords.filter(keyword=>source.includes(keyword))}))
      .filter(group=>group.hits.length)
      .sort((a,b)=>b.hits.length-a.hits.length)
      .map(group=>({id:group.id,label:group.label,evidenceKeywords:group.hits.slice(0,3)}));
    const outputs=OUTPUT_GROUPS
      .map(group=>({...group,hits:group.keywords.filter(keyword=>source.includes(keyword))}))
      .filter(group=>group.hits.length)
      .sort((a,b)=>b.hits.length-a.hits.length)
      .map(group=>({id:group.id,label:group.label,evidenceKeywords:group.hits.slice(0,3)}));
    const growthSignals=['한계','보완','후속','확장','개선','성찰','피드백','재설계']
      .filter(keyword=>source.includes(keyword));
    const rawInterestPhrases=unique(evidence.flatMap(item=>{
      const phrases=[];
      const patterns=[
        /([^.!?]{2,80}?)의 관계를 탐구/g,
        /([^.!?]{2,80}?)(?:를|을) 탐구/g,
        /([^.!?]{2,60}?)에 의문/g
      ];
      patterns.forEach(pattern=>{
        let match;
        while((match=pattern.exec(item.excerpt))){
          let phrase=match[1].split(/갖고|가지고|바탕으로|통해|관심을 두고/).pop().trim();
          phrase=phrase.replace(/^(세부능력 및 특기사항|진로활동에서|수업에서|수업 중)\s*/,'').trim();
          const words=phrase.split(/\s+/).filter(Boolean);
          if(words.length>8)phrase=words.slice(-8).join(' ');
          if(phrase.length>=4&&phrase.length<=70)phrases.push(phrase);
        }
      });
      return phrases;
    }));
    const interestPhrases=rawInterestPhrases
      .filter((phrase,index,all)=>!all.slice(0,index).some(previous=>previous.includes(phrase)||phrase.includes(previous)))
      .slice(0,5);
    const dominantEvidence=[...evidence].sort((a,b)=>b.quality-a.quality).slice(0,4).map(item=>({
      excerpt:item.excerpt,
      sectionId:item.sectionId,
      indicatorIds:item.indicatorIds,
      quality:item.quality
    }));
    return {topicTerms,interestPhrases,subjects,methods,outputs,growthSignals,dominantEvidence};
  }

  function analyze(input={}){
    const pages=(Array.isArray(input.pages)&&input.pages.length?input.pages:[input.text||'']).map(normalize);
    const text=normalize(pages.join('\n'));
    const majorCriteria=normalizeMajorCriteria(input.majorCriteria);
    const rows=extractSectionSentences(pages);
    const evidence=buildEvidence(rows,majorCriteria);
    const dimensions=schema.DIMENSIONS.map(definition=>{
      const related=evidence.filter(item=>definition.indicators.some(id=>item.indicatorIds.includes(id))||(definition.majorMatch&&item.majorCompetencyIds.length));
      const score=evidenceScore(evidence,definition);
      // 모든 축이 같은 '최고 품질' 문장을 보여주지 않도록, 이 축 지표에 특화된 문장을 우선
      const ranked=related.map(item=>({item,fit:item.indicatorIds.filter(id=>definition.indicators.includes(id)).length+(definition.majorMatch?item.majorCompetencyIds.length:0)})).sort((a,b)=>b.fit-a.fit||b.item.quality-a.item.quality).map(x=>x.item);
      return {...definition,score,grade:score>=75?'A':score>=50?'B':'C',confidence:confidenceFor(related),evidence:ranked.slice(0,3)};
    });
    const majorCompetencies=majorCriteria.map(criterion=>{
      const related=evidence.filter(item=>item.majorCompetencyIds.includes(criterion.id));
      const score=related.length?clamp(45+Math.min(related.length,5)*7+Math.min(unique(related.map(item=>item.sectionId)).length,3)*5,30,90):30;
      return {...criterion,score,grade:score>=75?'A':score>=50?'B':'C',confidence:confidenceFor(related),evidence:related.sort((a,b)=>b.quality-a.quality).slice(0,3)};
    });
    const majorWeight=majorCompetencies.length?45/majorCompetencies.length:0;
    const overallScore=Math.round(dimensions.reduce((sum,item)=>sum+item.score*item.weight/100,0)+majorCompetencies.reduce((sum,item)=>sum+item.score*majorWeight/100,0));
    const sections=schema.SECTIONS.map(section=>({id:section.id,label:section.label,characterCount:rows.filter(row=>row.sectionId===section.id).reduce((sum,row)=>sum+row.text.length,0),evidenceCount:evidence.filter(item=>item.sectionId===section.id).length})).filter(section=>section.characterCount||section.evidenceCount);
    const ranked=[...dimensions,...majorCompetencies].sort((a,b)=>b.score-a.score);
    const profile=buildProfile(evidence,majorCriteria);
    return {
      schemaVersion:schema.SCHEMA_VERSION,
      document:{documentId:`record-${Date.now()}`,fileName:input.fileName||'',pageCount:pages.length,characterCount:text.length,extractionMode:input.extractionMode||'text',rawStored:false},
      sections,evidence,dimensions,majorCompetencies,overallScore,profile,
      strengths:ranked.filter(item=>item.score>=75).slice(0,3).map(item=>item.label),
      gaps:[...ranked].reverse().slice(0,3).map(item=>item.label),
      reviewRequired:true,
      privacy:{rawStored:false,savedFields:['점수','판정','근거 개수','강점·보완 영역'],notice:'생기부 원문과 근거 문장은 브라우저 메모리에서만 사용하며 대시보드에 저장하지 않습니다. 개인화 키워드도 현재 결과 화면 생성에만 사용합니다.'}
    };
  }

  root.EVARecordAnalysis={analyze,normalize,redact,splitSentences};
})(typeof globalThis!=='undefined'?globalThis:window);
