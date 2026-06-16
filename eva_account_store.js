(function(){
  const SCHEMA_VERSION='eva-account-data-v1';
  const KEYS={
    account:'eva_account_session_v1',
    profile:'eva_profile',
    results:'eva_admission_results_v1',
    library:'eva_library_items',
    libraryLegacy:'eva_saved_recommendations',
    planner:'eva_week_planner_v3',
    preferences:'eva_user_preferences_v1',
    sync:'eva_sync_state_v1',
    readinessSnapshots:'eva_readiness_snapshots_v1'
  };

  function parse(key,fallback){
    try{const value=JSON.parse(localStorage.getItem(key));return value===null?fallback:value}catch(error){return fallback}
  }
  function write(key,value){localStorage.setItem(key,JSON.stringify(value));return value}
  function id(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  }
  function ensureAccount(){
    const saved=parse(KEYS.account,null);
    if(saved?.accountId)return saved;
    return write(KEYS.account,{accountId:id(),authState:'guest',createdAt:new Date().toISOString()});
  }
  function readProfile(){return parse(KEYS.profile,{})||{}}
  function writeProfile(profile){return write(KEYS.profile,{...profile,updatedAt:new Date().toISOString()})}
  function readResults(){const value=parse(KEYS.results,[]);return Array.isArray(value)?value:[]}
  function privacyPolicy(){
    return {
      storageMode:'summary-only',
      rawRecordStored:false,
      uploadedFileStored:false,
      description:'PDF 원문, 학생부 전문, 업로드 파일은 저장하지 않고 진단 요약 신호만 저장합니다.'
    };
  }
  function normalizeResults(results){
    return (Array.isArray(results)?results:[]).map(result=>{
      if(window.EVAResultBridge?.normalize)return window.EVAResultBridge.normalize(result);
      return {
        ...result,
        privacy:result.privacy||{
          storageMode:'summary-only',
          rawStored:false,
          fileStored:false,
          notice:privacyPolicy().description
        }
      };
    });
  }
  function writeResults(results){return write(KEYS.results,normalizeResults(results))}
  function readLibrary(){const value=parse(KEYS.library,[]);return Array.isArray(value)?value:[]}
  function writeLibrary(items){return write(KEYS.library,Array.isArray(items)?items:[])}
  function readPlanner(){return parse(KEYS.planner,{version:3,weeks:{},migratedLegacy:true})}
  function writePlanner(planner){return write(KEYS.planner,planner||{version:3,weeks:{},migratedLegacy:true})}
  function readPreferences(){return parse(KEYS.preferences,{})||{}}
  function writePreferences(preferences){return write(KEYS.preferences,{...readPreferences(),...preferences,updatedAt:new Date().toISOString()})}
  function readSyncState(){return parse(KEYS.sync,{status:'local',lastSyncedAt:null,lastError:null})}
  function writeSyncState(sync){return write(KEYS.sync,{...readSyncState(),...sync})}
  function readReadinessSnapshots(){const value=parse(KEYS.readinessSnapshots,[]);return Array.isArray(value)?value:[]}
  function writeReadinessSnapshots(items){return write(KEYS.readinessSnapshots,(Array.isArray(items)?items:[]).slice(-36))}
  function buildSnapshot(){
    const account=ensureAccount();
    return {
      schemaVersion:SCHEMA_VERSION,
      exportedAt:new Date().toISOString(),
      account,
      privacyPolicy:privacyPolicy(),
      profile:readProfile(),
      diagnosticResults:normalizeResults(readResults()),
      savedLibraryItems:readLibrary(),
      planner:readPlanner(),
      readinessSnapshots:readReadinessSnapshots(),
      preferences:{...readPreferences(),lastPage:localStorage.getItem('eva_last_page')||'dashboard'},
      sync:readSyncState()
    };
  }
  function normalizeSnapshot(input){
    if(!input||typeof input!=='object')throw new Error('백업 파일 형식이 올바르지 않습니다.');
    if(input.schemaVersion!==SCHEMA_VERSION)throw new Error(`지원하지 않는 백업 버전입니다: ${input.schemaVersion||'버전 없음'}`);
    if(!input.account?.accountId)throw new Error('계정 식별자가 없는 백업입니다.');
    return {
      ...input,
      profile:input.profile&&typeof input.profile==='object'?input.profile:{},
      diagnosticResults:Array.isArray(input.diagnosticResults)?input.diagnosticResults:[],
      savedLibraryItems:Array.isArray(input.savedLibraryItems)?input.savedLibraryItems:[],
      planner:input.planner&&typeof input.planner==='object'?input.planner:{version:3,weeks:{}},
      readinessSnapshots:Array.isArray(input.readinessSnapshots)?input.readinessSnapshots:[],
      preferences:input.preferences&&typeof input.preferences==='object'?input.preferences:{}
    };
  }
  function importSnapshot(input){
    const snapshot=normalizeSnapshot(input);
    write(KEYS.account,snapshot.account);
    writeProfile(snapshot.profile);
    writeResults(snapshot.diagnosticResults);
    writeLibrary(snapshot.savedLibraryItems);
    writePlanner(snapshot.planner);
    writeReadinessSnapshots(snapshot.readinessSnapshots);
    writePreferences(snapshot.preferences);
    if(snapshot.preferences.lastPage)localStorage.setItem('eva_last_page',snapshot.preferences.lastPage);
    writeSyncState({status:'local',lastSyncedAt:null,lastError:null,restoredAt:new Date().toISOString()});
    window.dispatchEvent(new CustomEvent('eva:data-restored',{detail:snapshot}));
    return buildSnapshot();
  }
  function buildServerPayload(){
    const snapshot=buildSnapshot();
    return {
      schema_version:snapshot.schemaVersion,
      account_id:snapshot.account.accountId,
      client_updated_at:new Date().toISOString(),
      privacy_policy:snapshot.privacyPolicy,
      profile:snapshot.profile,
      diagnostic_results:snapshot.diagnosticResults,
      saved_library_items:snapshot.savedLibraryItems,
      planner:snapshot.planner,
      readiness_snapshots:snapshot.readinessSnapshots,
      preferences:snapshot.preferences
    };
  }

  window.EVAAccountStore={
    SCHEMA_VERSION,KEYS,ensureAccount,
    readProfile,writeProfile,readResults,writeResults,readLibrary,writeLibrary,
    readPlanner,writePlanner,readPreferences,writePreferences,readSyncState,writeSyncState,readReadinessSnapshots,writeReadinessSnapshots,
    buildSnapshot,normalizeSnapshot,importSnapshot,buildServerPayload
  };
})();
