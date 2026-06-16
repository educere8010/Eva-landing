/* 에바연 학생부 설계실 — Supabase 로그인 게이트 + 프로필 동기화
   대시보드(dashboard.html) 메인 스크립트 뒤에서 로드됨.
   ?mode=demo 일 때는 로그인 없이 통과(데모). */
(function () {
  const SB_URL = "https://eytdqxlueuhqinkjxhui.supabase.co";
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dGRxeGx1ZXVocWlua2p4aHVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzQ5MTYsImV4cCI6MjA5NzAxMDkxNn0.gljEkX78tXvffkxqUOCB5z9k_bPSf_gq5RT3TURaZW4";
  if (!window.supabase) { console.error("[eva-auth] supabase-js 로드 실패"); return; }
  const sb = window.supabase.createClient(SB_URL, SB_KEY);
  window.sbClient = sb;
  const isDemo = new URLSearchParams(location.search).get("mode") === "demo";

  // 같은 기기에서 다른 계정으로 로그인하면 이전 계정의 로컬데이터(프로필/결과 등 eva_* 키)를 비움.
  // Supabase 세션 키(sb-*)는 건드리지 않으므로 로그인은 유지됨.
  function evaScopeToUser(uid) {
    try {
      if (!uid || localStorage.getItem("eva_active_uid") === uid) return;
      Object.keys(localStorage).filter(k => k.indexOf("eva_") === 0).forEach(k => localStorage.removeItem(k));
      localStorage.setItem("eva_active_uid", uid);
    } catch (e) {}
  }

  // 프로필: Supabase → 로컬 저장소 → 화면
  async function syncProfileFromSupabase() {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      evaScopeToUser(user.id);  // 계정이 바뀌었으면 이전 로컬데이터 정리 후 서버에서 새로 로드
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        const p = {
          name: data.name || "학생", grade: data.grade || "", major: data.major || "",
          track: data.track || "", interests: (data.interests || []).join(", ")
        };
        if (window.EVAAccountStore) window.EVAAccountStore.writeProfile(p);
        else localStorage.setItem("eva_profile", JSON.stringify(p));
      }
      // 회원등급(무료/유료) 조회 — 학생은 읽기 전용. 등급은 드러내지 않고 이용 범위 판정에만 사용.
      try {
        const { data: mem } = await sb.from("memberships").select("tier,paid_until").eq("user_id", user.id).maybeSingle();
        window.evaMembership = mem || { tier: "free" };
      } catch (e) { window.evaMembership = { tier: "free" }; }
      // 무료 회원이면 대시보드를 '미리보기(소프트게이트)'로 — 유료는 전체 이용
      if (window.evaMembership.tier !== "paid" && typeof window.evaActivateSoftGate === "function") {
        window.evaActivateSoftGate("free");
      }
      if (typeof loadProfile === "function") loadProfile();
      if (typeof refreshResultDrivenUI === "function") refreshResultDrivenUI();
    } catch (e) { console.error("[eva-auth] 프로필 동기화 오류", e); }
  }

  // 저장 시 Supabase에도 업서트 (기존 saveProfile 래핑)
  if (typeof saveProfile === "function") {
    const _origSave = saveProfile;
    saveProfile = function () {
      _origSave();
      (async () => {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const interests = (document.querySelector("#profileInterests")?.value || "")
          .split(",").map(s => s.trim()).filter(Boolean);
        const { error } = await sb.from("profiles").upsert({
          id: user.id,
          name: (document.querySelector("#profileName")?.value || "").trim(),
          grade: (document.querySelector("#profileGrade")?.value || "").trim(),
          major: (document.querySelector("#profileMajor")?.value || "").trim(),
          track: (document.querySelector("#profileTrack")?.value || "").trim(),
          interests, updated_at: new Date().toISOString()
        });
        if (error && typeof showToast === "function") showToast("서버 저장 오류: " + error.message);
      })();
    };
  }

  window.evaLogout = async function () {
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
    try { Object.keys(localStorage).filter(k => k.startsWith("sb-")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    try { Object.keys(localStorage).filter(k => k.startsWith("eva_")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    location.reload();
  };

  function addLogoutBtn() {
    if (document.getElementById("evaLogoutBtn")) return;
    const side = document.querySelector(".sidebar");
    if (!side) return;
    const b = document.createElement("button");
    b.id = "evaLogoutBtn"; b.textContent = "로그아웃";
    b.style.cssText = "margin:10px 0 0;width:100%;min-height:38px;border:1px solid rgba(255,255,255,.22);background:transparent;color:#fff;border-radius:12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;opacity:.8";
    b.onclick = window.evaLogout;
    side.appendChild(b);
  }

  if (isDemo) return; // 데모는 로그인 불필요

  // 로그인 오버레이
  const css = document.createElement("style");
  css.textContent = '#evaAuth{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:22px;background:#11203f;font-family:Pretendard,system-ui,sans-serif}#evaAuth .box{width:min(400px,100%);background:#fff;border-radius:22px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.35)}#evaAuth h2{margin:0 0 4px;color:#11203f;font-size:22px;letter-spacing:-.04em}#evaAuth p{margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.6}#evaAuth label{display:block;font-size:12px;font-weight:800;color:#54607a;margin:12px 0 5px}#evaAuth input{width:100%;box-sizing:border-box;border:1px solid #e3ddd0;border-radius:11px;padding:11px;font:inherit;font-size:14px;outline:0}#evaAuth input:focus{border-color:#11203f}#evaAuth .row{display:flex;gap:8px;margin-top:16px}#evaAuth button{flex:1;min-height:44px;border:0;border-radius:12px;font:inherit;font-size:14px;font-weight:900;cursor:pointer}#evaAuth .pri{background:#11203f;color:#fff}#evaAuth .sec{background:#e8714e;color:#fff}#evaAuth .msg{margin-top:14px;font-size:13px;line-height:1.6;padding:11px;border-radius:11px;background:#fbf8f1;color:#54607a;white-space:pre-wrap}';
  document.head.appendChild(css);

  const ov = document.createElement("div");
  ov.id = "evaAuth";
  ov.innerHTML = '<div class="box"><h2>에바연 학생부 설계실</h2><p>로그인하면 어디서나 내 학생부 설계가 이어집니다.</p><label for="evaAuthEmail">이메일</label><input id="evaAuthEmail" type="email" autocomplete="off"><label for="evaAuthPw">비밀번호</label><input id="evaAuthPw" type="password" autocomplete="new-password"><div class="row"><button class="sec" id="evaAuthSignup">회원가입</button><button class="pri" id="evaAuthLogin">로그인</button></div><div class="msg" id="evaAuthMsg" style="display:none"></div></div>';
  document.body.appendChild(ov);
  const emailEl = document.getElementById("evaAuthEmail");
  const pwEl = document.getElementById("evaAuthPw");
  // 로그아웃 후 브라우저 자동완성으로 이전 이메일/비번이 채워지는 것 방지: 렌더 직후 비움
  setTimeout(function () { try { emailEl.value = ""; pwEl.value = ""; } catch (e) {} }, 60);
  const setMsg = t => { const m = document.getElementById("evaAuthMsg"); m.style.display = "block"; m.textContent = t; };

  async function afterLogin() { ov.remove(); addLogoutBtn(); await syncProfileFromSupabase(); }

  async function doSignup() {
    const { data, error } = await sb.auth.signUp({
      email: emailEl.value.trim(),
      password: pwEl.value
    });
    if (error) return setMsg("가입 오류: " + error.message);
    if (data.session) afterLogin();
    else setMsg("가입 완료! 이제 로그인하세요. (이메일 확인이 켜져 있으면 메일 인증 후)");
  }
  async function doLogin() {
    const { error } = await sb.auth.signInWithPassword({
      email: emailEl.value.trim(),
      password: pwEl.value
    });
    if (error) return setMsg("로그인 오류: " + error.message);
    afterLogin();
  }
  document.getElementById("evaAuthSignup").onclick = doSignup;
  document.getElementById("evaAuthLogin").onclick = doLogin;
  // 이메일/비밀번호 칸에서 Enter → 바로 로그인
  [emailEl, pwEl].forEach(function (el) {
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doLogin(); } });
  });

  // 이미 로그인돼 있으면 통과
  sb.auth.getSession().then(({ data }) => {
    if (data.session) { ov.remove(); addLogoutBtn(); syncProfileFromSupabase(); }
  });
})();
