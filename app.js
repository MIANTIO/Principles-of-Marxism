(() => {
  "use strict";

  const bank = window.QUESTION_BANK;
  const questions = bank.questions;
  const byId = new Map(questions.map((q) => [q.id, q]));
  const TYPE_LABEL = { single: "单选题", multiple: "多选题", "true-false": "判断题" };
  const STORAGE_KEY = "mayuan-study-v1";
  const defaultState = { progress: {}, theme: "light", session: null, lastRoute: "home" };
  let state = loadState();
  let route = "home";
  let listState = { query: "", type: "all", status: "all", page: 1 };
  let timerHandle = null;

  const content = document.getElementById("content");
  const modalRoot = document.getElementById("modalRoot");
  const topTitle = document.getElementById("topTitle");

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...defaultState, ...(saved || {}), progress: saved?.progress || {} };
    } catch { return structuredClone(defaultState); }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); updateNavCounts(); }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]); }
  function pct(value, total) { return total ? Math.round(value / total * 100) : 0; }
  function shuffle(items) { const arr = [...items]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  function sameAnswer(a = [], b = []) { return [...a].sort().join("|") === [...b].sort().join("|"); }
  function getProgress(id) { return state.progress[id] || { attempts: 0, correctAttempts: 0, wrongAttempts: 0, lastAnswer: [], lastAnsweredAt: null, isFavorite: false, isInWrongBook: false }; }
  function typeCounts(items = questions) { return items.reduce((a, q) => (a[q.type] = (a[q.type] || 0) + 1, a), {}); }
  function stats() {
    const entries = Object.values(state.progress);
    const attempted = entries.filter((p) => p.attempts > 0).length;
    const attempts = entries.reduce((s, p) => s + p.attempts, 0);
    const correct = entries.reduce((s, p) => s + p.correctAttempts, 0);
    return { attempted, attempts, correct, accuracy: pct(correct, attempts), wrong: entries.filter((p) => p.isInWrongBook).length, favorite: entries.filter((p) => p.isFavorite).length };
  }

  function setRoute(next) {
    clearInterval(timerHandle); timerHandle = null;
    route = next; state.lastRoute = next; saveState();
    document.querySelectorAll(".nav-item[data-route]").forEach((el) => el.classList.toggle("active", el.dataset.route === next));
    document.getElementById("sidebar").classList.remove("open");
    const titles = { home: "学习概览", bank: "浏览题库", wrong: "错题回顾", favorite: "我的收藏", exam: "模拟考试", settings: "数据与设置", quiz: "专注练习", result: "练习结果" };
    topTitle.textContent = titles[next] || "马原研习室";
    if (next === "home") renderHome();
    else if (["bank", "wrong", "favorite"].includes(next)) renderQuestionList(next);
    else if (next === "exam") renderExamSetup();
    else if (next === "settings") renderSettings();
    else if (next === "quiz") renderQuiz();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function renderHome() {
    const s = stats();
    const counts = bank.meta.counts;
    const completedByType = {};
    questions.forEach((q) => { if (getProgress(q.id).attempts) completedByType[q.type] = (completedByType[q.type] || 0) + 1; });
    content.innerHTML = `
      <section class="page-heading"><div><h1>今天，继续稳步向前</h1><p>题库共 ${bank.meta.total} 题，学习记录只保存在这台设备。</p></div>
        <button class="button primary" data-action="quick-start">开始随机练习</button></section>
      <section class="stats-grid">
        ${statCard("已练题目", s.attempted, `覆盖题库 ${pct(s.attempted, bank.meta.total)}%`, "var(--primary)")}
        ${statCard("累计正确率", `${s.accuracy}%`, `${s.correct} / ${s.attempts || 0} 次答对`, "var(--green)")}
        ${statCard("待复习错题", s.wrong, s.wrong ? "建议及时巩固" : "目前没有遗留错题", "var(--red)")}
        ${statCard("收藏题目", s.favorite, "建立自己的重点清单", "var(--accent)")}
      </section>
      <section class="dashboard-grid">
        <div class="panel"><div class="panel-title"><h2>按题型学习</h2><button class="button" data-route-go="bank">查看全部</button></div>
          <div class="type-grid">
            ${typeCard("single", "A", counts.single, completedByType.single || 0)}
            ${typeCard("multiple", "AB", counts.multiple, completedByType.multiple || 0)}
            ${typeCard("true-false", "✓", counts["true-false"], completedByType["true-false"] || 0)}
          </div>
          <div style="margin-top:22px">
            ${progressRow("单选题", completedByType.single || 0, counts.single)}
            ${progressRow("多选题", completedByType.multiple || 0, counts.multiple)}
            ${progressRow("判断题", completedByType["true-false"] || 0, counts["true-false"])}
          </div>
        </div>
        <div class="panel"><div class="panel-title"><h2>快捷入口</h2></div><div class="quick-actions">
          ${state.session ? `<button class="quick-action" data-action="resume"><span><strong>${state.session.mode === "exam" ? "继续上次考试" : "继续上次练习"}</strong><small>进度 ${state.session.index + 1} / ${state.session.ids.length}</small></span><b>→</b></button>` : ""}
          <button class="quick-action" data-action="practice-wrong"><span><strong>重做错题</strong><small>${s.wrong} 道题等待巩固</small></span><b>→</b></button>
          <button class="quick-action" data-route-go="exam"><span><strong>模拟考试</strong><small>自定义题量与倒计时</small></span><b>→</b></button>
          <button class="quick-action" data-route-go="favorite"><span><strong>复习收藏</strong><small>${s.favorite} 道重点题</small></span><b>→</b></button>
        </div></div>
      </section>`;
  }
  function statCard(label, value, note, color) { return `<article class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div><div class="stat-line" style="background:${color}"></div></article>`; }
  function typeCard(type, symbol, total, done) { return `<button class="type-card" data-action="start-type" data-type="${type}"><div class="type-card-top"><span class="type-symbol">${symbol}</span><span>${pct(done, total)}%</span></div><strong>${TYPE_LABEL[type]}</strong><small>${done} / ${total} 已练</small></button>`; }
  function progressRow(label, done, total) { return `<div class="progress-row"><div class="progress-label"><span>${label}</span><span>${done} / ${total}</span></div><div class="progress-track"><div class="progress-fill" style="width:${pct(done,total)}%"></div></div></div>`; }

  function filteredQuestions(kind) {
    let items = questions;
    if (kind === "wrong") items = items.filter((q) => getProgress(q.id).isInWrongBook);
    if (kind === "favorite") items = items.filter((q) => getProgress(q.id).isFavorite);
    if (listState.type !== "all") items = items.filter((q) => q.type === listState.type);
    if (listState.status === "unseen") items = items.filter((q) => !getProgress(q.id).attempts);
    if (listState.status === "wrong") items = items.filter((q) => getProgress(q.id).isInWrongBook);
    if (listState.status === "warning") items = items.filter((q) => q.dataWarnings.length);
    const term = listState.query.trim().toLowerCase();
    if (term) items = items.filter((q) => q.stem.toLowerCase().includes(term) || q.options.some((o) => o.text.toLowerCase().includes(term)));
    return items;
  }
  function renderQuestionList(kind) {
    const title = kind === "wrong" ? "错题回顾" : kind === "favorite" ? "我的收藏" : "浏览题库";
    const intro = kind === "wrong" ? "反复练习曾经答错的题目，直到真正掌握。" : kind === "favorite" ? "集中复习你主动标记的重点内容。" : "搜索题干或选项，并按题型与学习状态筛选。";
    const items = filteredQuestions(kind); const pageSize = 15; const pages = Math.max(1, Math.ceil(items.length / pageSize)); listState.page = Math.min(listState.page, pages);
    const pageItems = items.slice((listState.page - 1) * pageSize, listState.page * pageSize);
    content.innerHTML = `<section class="page-heading"><div><h1>${title}</h1><p>${intro}</p></div>${items.length ? `<button class="button primary" data-action="practice-filtered" data-kind="${kind}">练习当前 ${items.length} 题</button>` : ""}</section>
      <div class="toolbar"><div class="search"><input id="searchInput" value="${esc(listState.query)}" placeholder="搜索题干或选项…"></div>
        <select id="typeFilter" aria-label="题型"><option value="all">全部题型</option><option value="single">单选题</option><option value="multiple">多选题</option><option value="true-false">判断题</option></select>
        <select id="statusFilter" aria-label="状态"><option value="all">全部状态</option><option value="unseen">未练习</option><option value="wrong">做错过</option><option value="warning">数据待核验</option></select></div>
      <div class="list-summary" style="margin:0 0 12px;color:var(--muted);font-size:13px">找到 ${items.length} 道题</div>
      ${pageItems.length ? pageItems.map(questionListCard).join("") : emptyState(kind)}
      ${pageItems.length ? `<div class="pagination"><span>第 ${listState.page} / ${pages} 页</span><div><button class="button" data-action="page-prev" ${listState.page === 1 ? "disabled" : ""}>上一页</button> <button class="button" data-action="page-next" ${listState.page === pages ? "disabled" : ""}>下一页</button></div></div>` : ""}`;
    document.getElementById("typeFilter").value = listState.type; document.getElementById("statusFilter").value = listState.status;
  }
  function questionListCard(q) {
    const p = getProgress(q.id); const stateText = p.attempts ? `作答 ${p.attempts} 次 · 错误 ${p.wrongAttempts} 次` : "尚未练习";
    return `<article class="list-card"><span class="question-type">${TYPE_LABEL[q.type]}</span><div><div class="list-stem">${esc(q.stem)}</div><div class="list-meta">${q.id} · ${stateText}${q.dataWarnings.length ? " · ⚠ 数据待核验" : ""}</div></div><div class="list-actions"><button class="icon-button" data-action="toggle-favorite" data-id="${q.id}" title="收藏">${p.isFavorite ? "★" : "☆"}</button><button class="button" data-action="practice-one" data-id="${q.id}">练习</button></div></article>`;
  }
  function emptyState(kind) { const message = kind === "wrong" ? "目前没有错题，继续保持。" : kind === "favorite" ? "还没有收藏题目，可在题库或刷题页点击星标。" : "没有符合当前条件的题目。"; return `<div class="empty"><div class="empty-symbol">○</div><h2>这里暂时是空的</h2><p>${message}</p></div>`; }

  function startPractice(items, options = {}) {
    if (!items.length) return toast("当前没有可练习的题目");
    const size = Math.min(options.count || 20, items.length);
    const selected = options.keepOrder ? items.slice(0, size) : shuffle(items).slice(0, size);
    state.session = { mode: "practice", ids: selected.map((q) => q.id), index: 0, answers: {}, submitted: {}, startedAt: Date.now(), title: options.title || "随机练习" };
    saveState(); setRoute("quiz");
  }
  function renderQuiz() {
    const session = state.session; if (!session?.ids?.length) return setRoute("home");
    if (session.mode === "exam") return renderExamQuestion();
    const q = byId.get(session.ids[session.index]); if (!q) return setRoute("home");
    const selected = session.answers[q.id] || []; const submitted = !!session.submitted[q.id]; const isCorrect = submitted && sameAnswer(selected, q.correctAnswers); const p = getProgress(q.id);
    content.innerHTML = `<div class="practice-wrap"><div class="practice-head"><button class="icon-button" data-action="leave-quiz" title="退出">←</button><div class="practice-progress"><div class="practice-meta"><span>${esc(session.title)}</span><span>${session.index + 1} / ${session.ids.length}</span></div><div class="progress-track"><div class="progress-fill" style="width:${pct(session.index + 1, session.ids.length)}%"></div></div></div></div>
      <article class="question-card"><div class="question-top"><div><span class="tag">${TYPE_LABEL[q.type]}</span>${q.dataWarnings.length ? ` <span class="tag" style="color:#926118">待核验</span>` : ""}</div><button class="favorite-button ${p.isFavorite ? "on" : ""}" data-action="toggle-favorite" data-id="${q.id}" aria-label="收藏">${p.isFavorite ? "★" : "☆"}</button></div>
        <div class="question-stem">${esc(q.stem)}</div><div class="options">${q.options.map((o) => optionHtml(q, o, selected, submitted)).join("")}</div>
        ${submitted ? feedbackHtml(q, selected, isCorrect) : ""}
        <div class="practice-actions"><button class="button" data-action="prev-question" ${session.index === 0 ? "disabled" : ""}>上一题</button><div class="practice-actions-right">${!submitted ? `<button class="button primary" data-action="submit-answer" ${selected.length ? "" : "disabled"}>提交答案</button>` : `<button class="button primary" data-action="next-question">${session.index === session.ids.length - 1 ? "查看结果" : "下一题"}</button>`}</div></div>
      </article></div>`;
  }
  function optionHtml(q, option, selected, submitted) {
    const chosen = selected.includes(option.key); const correct = q.correctAnswers.includes(option.key); let cls = chosen ? " selected" : "";
    if (submitted && correct) cls = " correct"; else if (submitted && chosen && !correct) cls = " wrong";
    return `<button class="option${cls}" data-action="choose-option" data-key="${esc(option.key)}" ${submitted ? "disabled" : ""}><span class="option-key">${esc(option.key)}</span><span>${esc(option.text)}</span></button>`;
  }
  function feedbackHtml(q, selected, correct) { return `<div class="answer-panel ${correct ? "correct" : "wrong"}"><div class="answer-title">${correct ? "回答正确" : "回答错误"}</div><div>你的答案：${selected.join("、") || "未作答"}　正确答案：${q.correctAnswers.join("、")}</div><div class="explanation"><strong>解析：</strong>${q.explanation ? esc(q.explanation) : "本题暂无解析，建议结合教材核对理解。"}</div>${q.dataWarnings.length ? `<div class="warning">⚠ ${q.dataWarnings.map(esc).join("；")}</div>` : ""}</div>`; }
  function chooseOption(key) {
    const s = state.session; const q = byId.get(s.ids[s.index]); let selected = s.answers[q.id] || [];
    if (q.type === "multiple") selected = selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key]; else selected = [key];
    s.answers[q.id] = selected; saveState(); renderQuiz();
  }
  function submitCurrent() {
    const s = state.session; const q = byId.get(s.ids[s.index]); const selected = s.answers[q.id] || []; if (!selected.length) return;
    s.submitted[q.id] = true; recordAttempt(q, selected); saveState(); renderQuiz();
  }
  function recordAttempt(q, answer) {
    const old = getProgress(q.id); const correct = sameAnswer(answer, q.correctAnswers);
    state.progress[q.id] = { ...old, attempts: old.attempts + 1, correctAttempts: old.correctAttempts + (correct ? 1 : 0), wrongAttempts: old.wrongAttempts + (correct ? 0 : 1), lastAnswer: answer, lastAnsweredAt: new Date().toISOString(), isInWrongBook: correct ? false : true };
  }
  function nextQuestion() { const s = state.session; if (s.index >= s.ids.length - 1) return renderResults(s); s.index++; saveState(); renderQuiz(); }
  function renderResults(session, exam = false) {
    clearInterval(timerHandle); const answers = session.answers; const correct = session.ids.filter((id) => sameAnswer(answers[id] || [], byId.get(id).correctAnswers)).length; const total = session.ids.length; const wrongIds = session.ids.filter((id) => !sameAnswer(answers[id] || [], byId.get(id).correctAnswers)); const elapsed = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    if (!exam) state.session = null; saveState(); route = "result"; topTitle.textContent = exam ? "考试结果" : "练习结果";
    content.innerHTML = `<div class="practice-wrap"><section class="panel result-summary"><p style="color:var(--muted)">${exam ? "模拟考试已交卷" : "本组练习已完成"}</p><div class="result-score"><div><strong>${pct(correct,total)}%</strong><small>正确率</small></div></div><h1>${correct === total ? "全部答对，做得很好" : "稳步积累，继续巩固"}</h1><div class="result-grid"><div class="result-item"><strong>${correct}</strong><small>答对</small></div><div class="result-item"><strong>${total - correct}</strong><small>答错 / 未答</small></div><div class="result-item"><strong>${elapsed} 分钟</strong><small>用时</small></div></div><div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap"><button class="button" data-route-go="home">返回首页</button>${wrongIds.length ? `<button class="button" data-action="redo-result" data-ids="${wrongIds.join(",")}">重做本组错题</button>` : ""}<button class="button primary" data-action="quick-start">再练一组</button></div></section></div>`;
    if (exam) { state.session = null; saveState(); }
  }

  function renderExamSetup() {
    content.innerHTML = `<section class="page-heading"><div><h1>模拟考试</h1><p>按真实考试节奏集中作答，交卷后统一显示答案。</p></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-title"><h2>考试设置</h2></div>
      <div class="form-grid"><div class="field"><label>单选题数量</label><input id="examSingle" type="number" min="0" max="100" value="20"></div><div class="field"><label>多选题数量</label><input id="examMultiple" type="number" min="0" max="100" value="10"></div><div class="field"><label>判断题数量</label><input id="examJudge" type="number" min="0" max="100" value="10"></div><div class="field"><label>考试时长（分钟）</label><input id="examMinutes" type="number" min="1" max="180" value="45"></div></div>
      <button class="button primary" data-action="start-exam">生成试卷并开始</button></section><section class="panel"><div class="panel-title"><h2>考试说明</h2></div><div style="line-height:1.9;color:var(--muted);font-size:14px"><p>• 题目从题库中随机抽取。</p><p>• 作答过程中不显示正确答案。</p><p>• 倒计时结束后自动交卷。</p><p>• 多选题必须全部选对才得分。</p><p>• 交卷后自动加入错题本并生成成绩。</p></div></section></div>`;
  }
  function startExam() {
    const num = (id, max) => Math.max(0, Math.min(max, Number(document.getElementById(id).value) || 0));
    const single = num("examSingle", 938), multiple = num("examMultiple", 580), judge = num("examJudge", 335), minutes = Math.max(1, num("examMinutes", 180));
    const pick = (type, count) => shuffle(questions.filter((q) => q.type === type)).slice(0, count);
    const chosen = [...pick("single", single), ...pick("multiple", multiple), ...pick("true-false", judge)]; if (!chosen.length) return toast("请至少选择一道题");
    state.session = { mode: "exam", ids: chosen.map((q) => q.id), index: 0, answers: {}, startedAt: Date.now(), durationMinutes: minutes, deadline: Date.now() + minutes * 60000, title: "模拟考试" }; saveState(); setRoute("quiz");
  }
  function renderExamQuestion() {
    const s = state.session; const q = byId.get(s.ids[s.index]); const selected = s.answers[q.id] || [];
    content.innerHTML = `<div class="exam-layout"><div><div class="practice-head"><button class="icon-button" data-action="leave-exam">←</button><div class="practice-progress"><div class="practice-meta"><span>模拟考试</span><span>${s.index + 1} / ${s.ids.length}</span></div><div class="progress-track"><div class="progress-fill" style="width:${pct(s.index+1,s.ids.length)}%"></div></div></div></div><article class="question-card"><div class="question-top"><span class="tag">${TYPE_LABEL[q.type]}</span><span style="color:var(--muted);font-size:13px">第 ${s.index + 1} 题</span></div><div class="question-stem">${esc(q.stem)}</div><div class="options">${q.options.map((o) => optionHtml(q,o,selected,false)).join("")}</div><div class="practice-actions"><button class="button" data-action="exam-prev" ${s.index===0?"disabled":""}>上一题</button><div class="practice-actions-right"><button class="button primary" data-action="exam-next">${s.index === s.ids.length-1 ? "检查试卷" : "下一题"}</button></div></div></article></div>
      <aside class="panel"><div class="timer" id="timer">--:--</div><div class="panel-title"><h2>答题卡</h2><span style="font-size:12px;color:var(--muted)">已答 ${Object.values(s.answers).filter(a=>a.length).length}</span></div><div class="exam-map">${s.ids.map((id,i)=>`<button class="exam-dot ${(s.answers[id]||[]).length?"done":""} ${i===s.index?"current":""}" data-action="exam-jump" data-index="${i}">${i+1}</button>`).join("")}</div><button class="button primary" style="width:100%;margin-top:18px" data-action="finish-exam">提交试卷</button></aside></div>`;
    updateTimer(); clearInterval(timerHandle); timerHandle = setInterval(updateTimer, 1000);
  }
  function updateTimer() { const s=state.session; if (!s || s.mode!=="exam") return clearInterval(timerHandle); const left=Math.max(0,s.deadline-Date.now()); const m=Math.floor(left/60000), sec=Math.floor(left%60000/1000); const el=document.getElementById("timer"); if(el) el.textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; if(left<=0){ clearInterval(timerHandle); finishExam(true); } }
  function finishExam(auto=false) { const s=state.session; if(!s) return; const doFinish=()=>{ s.ids.forEach(id=>recordAttempt(byId.get(id),s.answers[id]||[])); saveState(); renderResults(s,true); }; if(auto) { toast("考试时间到，已自动交卷"); doFinish(); } else confirmModal("确认交卷？", `还有 ${s.ids.filter(id=>!(s.answers[id]||[]).length).length} 道题未作答。交卷后将不能修改答案。`, doFinish, "确认交卷"); }

  function renderSettings() {
    const size = new Blob([JSON.stringify(state)]).size; content.innerHTML = `<section class="page-heading"><div><h1>数据与设置</h1><p>管理本机学习记录和界面偏好。</p></div></section><div class="settings-grid"><section class="panel"><div class="panel-title"><h2>学习数据</h2></div><div class="setting-row"><div><strong>导出学习记录</strong><p>备份错题、收藏和答题统计（JSON）</p></div><button class="button" data-action="export-data">导出</button></div><div class="setting-row"><div><strong>导入学习记录</strong><p>从之前导出的 JSON 文件恢复</p></div><label class="button">导入<input id="importData" type="file" accept="application/json" hidden></label></div><div class="setting-row"><div><strong>清空学习记录</strong><p>不会删除内置题库</p></div><button class="button danger" data-action="reset-data">清空</button></div></section>
      <section class="panel"><div class="panel-title"><h2>题库信息</h2></div><div class="setting-row"><div><strong>${esc(bank.meta.title)}</strong><p>${bank.meta.total} 题 · 单选 ${bank.meta.counts.single} · 多选 ${bank.meta.counts.multiple} · 判断 ${bank.meta.counts["true-false"]}</p></div></div><div class="setting-row"><div><strong>存储状态</strong><p>学习记录约 ${(size/1024).toFixed(1)} KB，仅保存在浏览器中</p></div><span class="tag">离线</span></div><div class="setting-row"><div><strong>显示主题</strong><p>浅色或深色界面</p></div><button class="button" data-action="toggle-theme">切换主题</button></div></section></div>`;
    document.getElementById("importData").addEventListener("change", importData);
  }
  function exportData() { const blob=new Blob([JSON.stringify({...state, exportedAt:new Date().toISOString(), version:1},null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`马原研习室_学习记录_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); toast("学习记录已导出"); }
  async function importData(e) { try { const data=JSON.parse(await e.target.files[0].text()); if(!data.progress) throw new Error(); state={...defaultState,...data,progress:data.progress}; saveState(); applyTheme(); toast("学习记录已恢复"); renderSettings(); } catch { toast("文件格式不正确，无法导入"); } }
  function toggleTheme() { state.theme=state.theme==="dark"?"light":"dark"; saveState(); applyTheme(); if(route==="settings") renderSettings(); }
  function applyTheme() { document.documentElement.dataset.theme=state.theme; }
  function toggleFavorite(id) { const p=getProgress(id); state.progress[id]={...p,isFavorite:!p.isFavorite}; saveState(); toast(!p.isFavorite?"已加入收藏":"已取消收藏"); route==="quiz"?renderQuiz():["bank","wrong","favorite"].includes(route)&&renderQuestionList(route); }
  function updateNavCounts() { const s=stats(); document.getElementById("wrongNavCount").textContent=s.wrong; document.getElementById("favoriteNavCount").textContent=s.favorite; }
  function toast(message) { const el=document.createElement("div"); el.className="toast"; el.textContent=message; document.getElementById("toastRegion").appendChild(el); setTimeout(()=>el.remove(),2500); }
  function confirmModal(title,message,onConfirm,confirmText="确认") { modalRoot.innerHTML=`<div class="modal"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="modal-actions"><button class="button" data-action="close-modal">取消</button><button class="button primary" id="modalConfirm">${esc(confirmText)}</button></div></div>`; document.getElementById("modalConfirm").onclick=()=>{modalRoot.innerHTML="";onConfirm();}; }

  document.addEventListener("click", (e) => {
    const routeEl=e.target.closest("[data-route],[data-route-go]"); if(routeEl){ setRoute(routeEl.dataset.route||routeEl.dataset.routeGo); return; }
    const el=e.target.closest("[data-action]"); if(!el) return; const action=el.dataset.action;
    if(action==="quick-start") startPractice(questions,{count:20,title:"随机练习"});
    else if(action==="start-type") startPractice(questions.filter(q=>q.type===el.dataset.type),{count:20,title:TYPE_LABEL[el.dataset.type]});
    else if(action==="practice-wrong") startPractice(questions.filter(q=>getProgress(q.id).isInWrongBook),{count:20,title:"错题巩固"});
    else if(action==="resume") setRoute("quiz");
    else if(action==="practice-filtered") startPractice(filteredQuestions(el.dataset.kind),{count:Math.min(50,filteredQuestions(el.dataset.kind).length),title:"筛选练习"});
    else if(action==="practice-one") startPractice([byId.get(el.dataset.id)],{count:1,keepOrder:true,title:"单题练习"});
    else if(action==="toggle-favorite") toggleFavorite(el.dataset.id);
    else if(action==="page-prev"){listState.page--;renderQuestionList(route);}
    else if(action==="page-next"){listState.page++;renderQuestionList(route);}
    else if(action==="choose-option") chooseOption(el.dataset.key);
    else if(action==="submit-answer") submitCurrent();
    else if(action==="next-question") nextQuestion();
    else if(action==="prev-question"){state.session.index--;saveState();renderQuiz();}
    else if(action==="leave-quiz") setRoute("home");
    else if(action==="redo-result") startPractice(el.dataset.ids.split(",").map(id=>byId.get(id)),{count:999,keepOrder:true,title:"错题重练"});
    else if(action==="start-exam") startExam();
    else if(action==="exam-prev"){state.session.index--;saveState();renderQuiz();}
    else if(action==="exam-next"){if(state.session.index<state.session.ids.length-1)state.session.index++;saveState();renderQuiz();}
    else if(action==="exam-jump"){state.session.index=Number(el.dataset.index);saveState();renderQuiz();}
    else if(action==="finish-exam") finishExam();
    else if(action==="leave-exam") confirmModal("退出考试？","当前考试进度会被保留，可从首页继续。",()=>setRoute("home"),"退出");
    else if(action==="export-data") exportData();
    else if(action==="reset-data") confirmModal("清空全部学习记录？","错题、收藏、答题统计和当前练习都会被删除，此操作无法撤销。",()=>{state={...defaultState,theme:state.theme};saveState();toast("学习记录已清空");renderSettings();},"确认清空");
    else if(action==="toggle-theme") toggleTheme();
    else if(action==="close-modal") modalRoot.innerHTML="";
  });
  document.addEventListener("input", (e) => { if(e.target.id==="searchInput"){listState.query=e.target.value;listState.page=1;renderQuestionList(route);document.getElementById("searchInput")?.focus();} });
  document.addEventListener("change", (e) => { if(e.target.id==="typeFilter"){listState.type=e.target.value;listState.page=1;renderQuestionList(route);} if(e.target.id==="statusFilter"){listState.status=e.target.value;listState.page=1;renderQuestionList(route);} });
  document.getElementById("menuButton").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("themeButton").onclick=toggleTheme;
  document.getElementById("dateLabel").textContent=new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"long"}).format(new Date());
  applyTheme(); updateNavCounts(); setRoute("home");
})();
