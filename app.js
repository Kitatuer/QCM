const STORAGE_KEY = "qcm-studio-active-quiz";
const ANSWERS_KEY = "qcm-studio-active-answers";
const PARTICIPANT_NAME_KEY = "qcm-studio-participant-name";
const ADMIN_RESULTS_KEY = "qcm-studio-participant-results";

const sampleQuiz = {
  title: "QCM de démonstration",
  description: "Modifie les questions, coche les bonnes réponses, puis copie le lien pour partager le QCM.",
  passScore: 70,
  questions: [
    {
      id: crypto.randomUUID(),
      text: "Quel élément permet de partager ce QCM sans serveur ?",
      type: "single",
      explanation: "Le lien contient les données encodées du questionnaire.",
      choices: [
        { id: crypto.randomUUID(), text: "Un lien contenant le questionnaire", correct: true },
        { id: crypto.randomUUID(), text: "Une base de données obligatoire", correct: false },
        { id: crypto.randomUUID(), text: "Un fichier installé sur chaque ordinateur", correct: false }
      ]
    },
    {
      id: crypto.randomUUID(),
      text: "Quelles actions sont disponibles dans l'application ?",
      type: "multiple",
      explanation: "Le QCM peut être créé, passé, corrigé, importé et exporté.",
      choices: [
        { id: crypto.randomUUID(), text: "Créer des questions", correct: true },
        { id: crypto.randomUUID(), text: "Corriger automatiquement", correct: true },
        { id: crypto.randomUUID(), text: "Exporter en JSON", correct: true },
        { id: crypto.randomUUID(), text: "Envoyer des e-mails automatiquement", correct: false }
      ]
    }
  ]
};

const sharedQuizFromUrl = readQuizFromUrl();
const sharedResultFromUrl = readResultFromUrl();
const onlineQuizIdFromUrl = readOnlineQuizIdFromUrl();
const isJoinMode = location.hash === "#join";
const isParticipantMode = Boolean(sharedQuizFromUrl || onlineQuizIdFromUrl || isJoinMode);
let quiz = loadQuiz(sharedQuizFromUrl);
let answers = loadAnswers();
let participantName = isParticipantMode ? loadParticipantName() : "";
let participantStarted = !isParticipantMode || Boolean(participantName);
let lastResult = null;
let adminResults = loadAdminResults();
let currentQuestionIndex = 0;
let activeOnlineQuizzes = [];
let adminOnlineQuizzes = [];
let onlineQuizLoading = Boolean(onlineQuizIdFromUrl);
let onlineStore = {
  enabled: false,
  ready: false,
  error: "",
  db: null,
  auth: null,
  api: null
};

if (sharedResultFromUrl && !isParticipantMode) {
  adminResults = upsertAdminResult(adminResults, sharedResultFromUrl);
  saveAdminResults();
  history.replaceState(null, "", location.pathname + location.search);
}

const elements = {
  tabs: document.querySelectorAll(".tab-button"),
  views: {
    builder: document.querySelector("#builderView"),
    player: document.querySelector("#playerView"),
    results: document.querySelector("#resultsView"),
    admin: document.querySelector("#adminView")
  },
  quizHeading: document.querySelector("#quizHeading"),
  questionCount: document.querySelector("#questionCount"),
  correctCount: document.querySelector("#correctCount"),
  passScoreLabel: document.querySelector("#passScoreLabel"),
  globalStatus: document.querySelector("#globalStatus"),
  quizTitle: document.querySelector("#quizTitle"),
  quizDescription: document.querySelector("#quizDescription"),
  passScore: document.querySelector("#passScore"),
  questionList: document.querySelector("#questionList"),
  answerForm: document.querySelector("#answerForm"),
  playerIntro: document.querySelector("#playerIntro"),
  nameGate: document.querySelector("#nameGate"),
  participantName: document.querySelector("#participantName"),
  scoreBoard: document.querySelector("#scoreBoard"),
  resultActions: document.querySelector("#resultActions"),
  reviewList: document.querySelector("#reviewList"),
  adminSummary: document.querySelector("#adminSummary"),
  participantResults: document.querySelector("#participantResults"),
  onlineQuizList: document.querySelector("#onlineQuizList"),
  shareStatus: document.querySelector("#shareStatus")
};

document.querySelector("#addQuestion").addEventListener("click", addQuestion);
document.querySelector("#resetQuiz").addEventListener("click", resetQuiz);
document.querySelector("#copyShareLink").addEventListener("click", copyShareLink);
document.querySelector("#publishQuiz").addEventListener("click", () => publishCurrentQuiz(true));
document.querySelector("#copyPortalLink").addEventListener("click", copyPortalLink);
document.querySelector("#exportJson").addEventListener("click", exportJson);
document.querySelector("#importFile").addEventListener("change", importJson);
document.querySelector("#retryQuiz").addEventListener("click", retryQuiz);
document.querySelector("#startQuiz").addEventListener("click", startQuiz);
document.querySelector("#resultImportFile").addEventListener("change", importResultJson);
document.querySelector("#clearResults").addEventListener("click", clearAdminResults);
document.querySelector("#refreshOnlineQuizzes").addEventListener("click", refreshOnlineQuizzes);
document.querySelector("#participantName").addEventListener("input", (event) => {
  participantName = event.target.value.trim();
  saveParticipantName();
});
document.querySelector("#participantName").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    startQuiz();
  }
});

elements.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    if (isParticipantMode && button.dataset.view === "builder") return;
    switchView(button.dataset.view);
  });
});

["input", "change"].forEach((eventName) => {
  document.querySelector("#quizForm").addEventListener(eventName, syncQuizMeta);
});

applyAccessMode();
render();
switchView(isParticipantMode ? "player" : (sharedResultFromUrl ? "admin" : "builder"));
initOnlineStorage();

function loadQuiz(sharedQuiz) {
  if (sharedQuiz) {
    return sharedQuiz;
  }

  if (onlineQuizIdFromUrl || isJoinMode) {
    return normalizeQuiz({ title: "QCM en ligne", description: "", passScore: 70, questions: [] });
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeQuiz(saved);
  } catch {
    return structuredClone(sampleQuiz);
  }
}

function loadAnswers() {
  try {
    const saved = JSON.parse(getAnswerStorage().getItem(getAnswersKey()));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function loadParticipantName() {
  try {
    return sessionStorage.getItem(getParticipantNameKey()) || "";
  } catch {
    return "";
  }
}

function loadAdminResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_RESULTS_KEY));
    return Array.isArray(saved) ? saved.map(normalizeResult).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function readQuizFromUrl() {
  const compactPrefix = "#q=";
  const legacyPrefix = "#qcm=";
  const isCompact = location.hash.startsWith(compactPrefix);
  const isLegacy = location.hash.startsWith(legacyPrefix);
  if (!isCompact && !isLegacy) return null;

  try {
    const encoded = location.hash.slice(isCompact ? compactPrefix.length : legacyPrefix.length);
    const data = JSON.parse(decodeBase64Url(encoded));
    return normalizeQuiz(isCompact ? expandSharedQuiz(data) : data);
  } catch {
    console.warn("Lien QCM invalide.");
    return null;
  }
}

function readResultFromUrl() {
  const resultPrefix = "#r=";
  if (!location.hash.startsWith(resultPrefix)) return null;

  try {
    const encoded = location.hash.slice(resultPrefix.length);
    return normalizeResult(expandSharedResult(JSON.parse(decodeBase64Url(encoded))));
  } catch {
    console.warn("Lien résultat invalide.");
    return null;
  }
}

function readOnlineQuizIdFromUrl() {
  const prefix = "#quiz=";
  if (!location.hash.startsWith(prefix)) return "";
  return decodeURIComponent(location.hash.slice(prefix.length)).trim();
}

function normalizeQuiz(value) {
  if (!value || typeof value !== "object") return structuredClone(sampleQuiz);

  const normalized = {
    id: String(value.id || crypto.randomUUID()),
    title: String(value.title || "QCM sans titre").slice(0, 90),
    description: String(value.description || "").slice(0, 500),
    passScore: clamp(Number(value.passScore || 70), 0, 100),
    questions: Array.isArray(value.questions) ? value.questions.map(normalizeQuestion) : []
  };

  if (!normalized.questions.length) {
    normalized.questions.push(createQuestion());
  }

  return normalized;
}

function expandSharedQuiz(data) {
  if (!data || data.v !== 2) return data;

  return {
    id: data.i,
    title: data.t,
    description: data.d,
    passScore: data.p,
    questions: Array.isArray(data.q) ? data.q.map((question) => ({
      text: question.t,
      type: question.y ? "multiple" : "single",
      explanation: question.e,
      choices: Array.isArray(question.c) ? question.c.map((choice) => ({
        text: choice[0],
        correct: Boolean(choice[1])
      })) : []
    })) : []
  };
}

function expandSharedResult(data) {
  if (!data || data.v !== 1) return data;

  return {
    id: data.i,
    quizId: data.qi,
    participantName: data.n,
    quizTitle: data.t,
    date: data.d,
    score: data.s,
    correct: data.c,
    total: data.o,
    percent: data.p,
    passScore: data.ps,
    passed: data.ok,
    details: Array.isArray(data.q) ? data.q.map((item) => ({
      question: item.t,
      isCorrect: Boolean(item.ok),
      correctText: item.c || [],
      selectedText: item.a || [],
      explanation: item.e || ""
    })) : []
  };
}

function normalizeResult(result) {
  if (!result || typeof result !== "object") return null;

  const total = Number(result.total || 0);
  const correct = Number(result.correct || 0);
  const percent = Number.isFinite(Number(result.percent)) ? Number(result.percent) : (total ? Math.round((correct / total) * 100) : 0);

  return {
    id: String(result.id || crypto.randomUUID()),
    quizId: String(result.quizId || "unknown"),
    participantName: String(result.participantName || "Participant sans nom").slice(0, 80),
    quizTitle: String(result.quizTitle || "QCM sans titre").slice(0, 90),
    date: result.date || new Date().toISOString(),
    score: String(result.score || `${correct}/${total}`),
    correct,
    total,
    percent,
    passScore: clamp(Number(result.passScore || 70), 0, 100),
    passed: Boolean(result.passed || percent >= Number(result.passScore || 70)),
    details: Array.isArray(result.details) ? result.details.map((detail) => ({
      question: String(detail.question || "Question sans texte"),
      isCorrect: Boolean(detail.isCorrect),
      correctText: Array.isArray(detail.correctText) ? detail.correctText.map(String) : [],
      selectedText: Array.isArray(detail.selectedText) ? detail.selectedText.map(String) : [],
      explanation: String(detail.explanation || "")
    })) : []
  };
}

function normalizeQuestion(question) {
  const choices = Array.isArray(question.choices) ? question.choices.map(normalizeChoice) : [];
  while (choices.length < 2) choices.push(createChoice(false));

  if (!choices.some((choice) => choice.correct)) {
    choices[0].correct = true;
  }

  return {
    id: question.id || crypto.randomUUID(),
    text: String(question.text || "").slice(0, 500),
    type: question.type === "multiple" ? "multiple" : "single",
    explanation: String(question.explanation || "").slice(0, 300),
    choices
  };
}

function normalizeChoice(choice) {
  return {
    id: choice.id || crypto.randomUUID(),
    text: String(choice.text || "").slice(0, 220),
    correct: Boolean(choice.correct)
  };
}

function createQuestion() {
  return {
    id: crypto.randomUUID(),
    text: "",
    type: "single",
    explanation: "",
    choices: [createChoice(true), createChoice(false)]
  };
}

function createChoice(correct = false) {
  return {
    id: crypto.randomUUID(),
    text: "",
    correct
  };
}

function render() {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  currentQuestionIndex = clamp(currentQuestionIndex, 0, Math.max(quiz.questions.length - 1, 0));
  renderSummary();
  if (!isParticipantMode) renderBuilder();
  renderPlayer();
  renderResults();
  renderAdminDashboard();
  saveState();
  requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
}

function renderSummary() {
  const correctChoices = quiz.questions.reduce((total, question) => {
    return total + question.choices.filter((choice) => choice.correct).length;
  }, 0);

  elements.quizHeading.textContent = quiz.title || "QCM sans titre";
  elements.questionCount.textContent = String(quiz.questions.length);
  elements.correctCount.textContent = String(correctChoices);
  elements.passScoreLabel.textContent = `${quiz.passScore}%`;
}

function renderBuilder() {
  elements.quizTitle.value = quiz.title;
  elements.quizDescription.value = quiz.description;
  elements.passScore.value = quiz.passScore;
  elements.questionList.replaceChildren(...quiz.questions.map(renderQuestionEditor));
}

function renderQuestionEditor(question, index) {
  const template = document.querySelector("#questionTemplate");
  const node = template.content.firstElementChild.cloneNode(true);

  node.dataset.questionId = question.id;
  node.querySelector(".question-number").textContent = `Question ${index + 1}`;
  node.querySelector(".question-text").value = question.text;
  node.querySelector(".question-type").value = question.type;
  node.querySelector(".question-explanation").value = question.explanation;
  node.querySelector(".choice-list").replaceChildren(...question.choices.map((choice) => renderChoiceEditor(question, choice)));

  node.querySelector(".question-text").addEventListener("input", (event) => {
    question.text = event.target.value;
    saveAndRefreshLight();
  });
  node.querySelector(".question-type").addEventListener("change", (event) => {
    question.type = event.target.value;
    if (question.type === "single") enforceSingleCorrect(question);
    render();
  });
  node.querySelector(".question-explanation").addEventListener("input", (event) => {
    question.explanation = event.target.value;
    saveAndRefreshLight();
  });
  node.querySelector(".add-choice").addEventListener("click", () => {
    question.choices.push(createChoice(false));
    render();
  });
  node.querySelector(".remove-question").addEventListener("click", () => {
    if (quiz.questions.length === 1) {
      question.text = "";
      question.explanation = "";
      question.choices = [createChoice(true), createChoice(false)];
    } else {
      quiz.questions.splice(index, 1);
      delete answers[question.id];
    }
    render();
  });
  node.querySelector(".move-up").addEventListener("click", () => moveQuestion(index, -1));
  node.querySelector(".move-down").addEventListener("click", () => moveQuestion(index, 1));

  node.querySelector(".move-up").disabled = index === 0;
  node.querySelector(".move-down").disabled = index === quiz.questions.length - 1;

  return node;
}

function renderChoiceEditor(question, choice) {
  const template = document.querySelector("#choiceTemplate");
  const node = template.content.firstElementChild.cloneNode(true);

  node.querySelector(".choice-correct").checked = choice.correct;
  node.querySelector(".choice-text").value = choice.text;

  node.querySelector(".choice-correct").addEventListener("change", (event) => {
    choice.correct = event.target.checked;
    if (question.type === "single" && choice.correct) {
      question.choices.forEach((item) => {
        if (item.id !== choice.id) item.correct = false;
      });
    }
    if (!question.choices.some((item) => item.correct)) {
      choice.correct = true;
    }
    render();
  });
  node.querySelector(".choice-text").addEventListener("input", (event) => {
    choice.text = event.target.value;
    saveAndRefreshLight();
  });
  node.querySelector(".remove-choice").addEventListener("click", () => {
    if (question.choices.length <= 2) return;
    question.choices = question.choices.filter((item) => item.id !== choice.id);
    if (!question.choices.some((item) => item.correct)) question.choices[0].correct = true;
    render();
  });

  return node;
}

function renderPlayer() {
  renderParticipantState();

  if (isJoinMode) {
    elements.playerIntro.innerHTML = `<strong>Choisis un QCM</strong><br>Voici les questionnaires actifs disponibles.`;
    if (!onlineStore.ready) {
      elements.answerForm.innerHTML = `<div class="empty-state">Connexion au stockage en ligne...</div>`;
      return;
    }
    if (!activeOnlineQuizzes.length) {
      elements.answerForm.innerHTML = `<div class="empty-state">Aucun QCM actif pour le moment.</div>`;
      return;
    }
    elements.answerForm.className = "answer-list join-list";
    elements.answerForm.replaceChildren(...activeOnlineQuizzes.map(renderJoinQuizCard));
    return;
  }

  elements.answerForm.className = "answer-list";
  if (onlineQuizLoading) {
    elements.playerIntro.innerHTML = `<strong>Chargement du QCM...</strong><br>Connexion au stockage en ligne.`;
    elements.answerForm.innerHTML = `<div class="empty-state">Chargement...</div>`;
    return;
  }

  const answered = Object.values(answers).reduce((total, list) => total + (Array.isArray(list) && list.length ? 1 : 0), 0);
  const intro = quiz.description || "Sélectionne les réponses, puis lance la correction.";
  const participantLine = participantName ? `<br>Participant : <strong>${escapeHtml(participantName)}</strong>` : "";
  elements.playerIntro.innerHTML = `<strong>${escapeHtml(quiz.title || "QCM sans titre")}</strong><br>${escapeHtml(intro)}${participantLine}<br><span id="answerProgress">${answered}/${quiz.questions.length} question(s) répondues.</span>`;

  if (!quiz.questions.length) {
    elements.answerForm.innerHTML = `<div class="empty-state">Aucune question dans ce QCM.</div>`;
    return;
  }

  currentQuestionIndex = clamp(currentQuestionIndex, 0, quiz.questions.length - 1);
  elements.answerForm.replaceChildren(renderAnswerItem(quiz.questions[currentQuestionIndex], currentQuestionIndex));
}

function renderJoinQuizCard(quizItem) {
  const article = document.createElement("article");
  article.className = "join-card";
  article.innerHTML = `
    <div>
      <h3>${escapeHtml(quizItem.title)}</h3>
      <p>${escapeHtml(quizItem.description || `${quizItem.questionCount} question(s)`)}</p>
    </div>
    <button class="primary-action" type="button">
      <span class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
      </span>
      Ouvrir
    </button>
  `;
  article.querySelector("button").addEventListener("click", () => {
    location.hash = `#quiz=${encodeURIComponent(quizItem.id)}`;
    location.reload();
  });
  return article;
}

function renderAnswerItem(question, index) {
  const article = document.createElement("article");
  article.className = "answer-item quiz-step";

  const inputType = question.type === "multiple" ? "checkbox" : "radio";
  const savedAnswers = Array.isArray(answers[question.id]) ? answers[question.id] : [];
  const progress = Math.round(((index + 1) / quiz.questions.length) * 100);
  const options = question.choices.map((choice) => {
    const id = `answer-${question.id}-${choice.id}`;
    return `
      <label class="answer-option" for="${id}">
        <input id="${id}" name="${question.id}" type="${inputType}" value="${choice.id}" ${savedAnswers.includes(choice.id) ? "checked" : ""}>
        <span>${escapeHtml(choice.text || "Choix sans texte")}</span>
      </label>
    `;
  }).join("");

  article.innerHTML = `
    <div class="quiz-progress">
      <span>Question ${index + 1} sur ${quiz.questions.length}</span>
      <div class="quiz-progress-bar" aria-hidden="true"><span style="width: ${progress}%"></span></div>
    </div>
    <header>
      <h3>${index + 1}. ${escapeHtml(question.text || "Question sans texte")}</h3>
      <span class="pill ${question.type === "multiple" ? "bad" : "ok"}">${question.type === "multiple" ? "Multiple" : "Unique"}</span>
    </header>
    <div class="answer-options">${options}</div>
    <div class="quiz-navigation">
      <button class="quiet-action previous-question" type="button" ${index === 0 ? "disabled" : ""}>
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
        </span>
        Précédent
      </button>
      <button class="${index === quiz.questions.length - 1 ? "primary-action finish-quiz" : "primary-action next-question"}" type="button">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="${index === quiz.questions.length - 1 ? "M20 6 9 17l-5-5" : "m9 18 6-6-6-6"}"/></svg>
        </span>
        ${index === quiz.questions.length - 1 ? "Terminer" : "Suivant"}
      </button>
    </div>
  `;

  article.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const checked = Array.from(article.querySelectorAll("input:checked")).map((item) => item.value);
      answers[question.id] = checked;
      saveState();
      updateAnswerProgress();
    });
  });
  article.querySelector(".previous-question").addEventListener("click", () => {
    currentQuestionIndex = Math.max(0, currentQuestionIndex - 1);
    renderPlayer();
  });

  const nextButton = article.querySelector(".next-question");
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (!hasAnsweredCurrentQuestion()) {
        setStatus("Réponds à la question avant de continuer.");
        return;
      }
      currentQuestionIndex = Math.min(quiz.questions.length - 1, currentQuestionIndex + 1);
      renderPlayer();
    });
  }

  const finishButton = article.querySelector(".finish-quiz");
  if (finishButton) {
    finishButton.addEventListener("click", submitAnswers);
  }

  return article;
}

function renderResults() {
  if (!lastResult) {
    elements.scoreBoard.className = "score-board empty-state";
    elements.scoreBoard.textContent = "Passe le QCM pour afficher la correction.";
    elements.resultActions.replaceChildren();
    elements.reviewList.replaceChildren();
    return;
  }

  const passed = lastResult.percent >= quiz.passScore;
  elements.scoreBoard.className = `score-board ${passed ? "" : "failed"}`;
  elements.scoreBoard.innerHTML = `
    <strong>${lastResult.percent}% - ${passed ? "Réussi" : "À retravailler"}</strong>
    <span>${participantName ? `${escapeHtml(participantName)} : ` : ""}${lastResult.correct}/${lastResult.total} bonne(s) réponse(s). Score attendu: ${quiz.passScore}%.</span>
  `;
  renderResultActions();
  elements.reviewList.replaceChildren(...lastResult.details.map(renderReviewItem));
}

function renderResultActions() {
  elements.resultActions.replaceChildren();
  if (!lastResult || !isParticipantMode) return;

  const copyButton = document.createElement("button");
  copyButton.className = "primary-action";
  copyButton.type = "button";
  copyButton.innerHTML = `
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.8"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.8-1.8"/></svg>
    </span>
    Copier mes résultats
  `;
  copyButton.addEventListener("click", copyResultLink);

  const exportButton = document.createElement("button");
  exportButton.className = "quiet-action";
  exportButton.type = "button";
  exportButton.innerHTML = `
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
    </span>
    Exporter
  `;
  exportButton.addEventListener("click", exportResultJson);

  elements.resultActions.append(copyButton, exportButton);
}

function renderReviewItem(detail, index) {
  const article = document.createElement("article");
  article.className = `review-item ${detail.isCorrect ? "correct" : "incorrect"}`;
  article.innerHTML = `
    <header>
      <h3>${index + 1}. ${escapeHtml(detail.question)}</h3>
      <span class="pill ${detail.isCorrect ? "ok" : "bad"}">${detail.isCorrect ? "Correct" : "Incorrect"}</span>
    </header>
    <div class="review-body">
      <span><b>Bonne réponse :</b> ${escapeHtml(detail.correctText.join(", "))}</span>
      <span><b>Réponse donnée :</b> ${escapeHtml(detail.selectedText.join(", ") || "Aucune")}</span>
      ${detail.explanation ? `<span><b>Explication :</b> ${escapeHtml(detail.explanation)}</span>` : ""}
    </div>
  `;
  return article;
}

function syncQuizMeta() {
  quiz.title = elements.quizTitle.value.trim();
  quiz.description = elements.quizDescription.value.trim();
  quiz.passScore = clamp(Number(elements.passScore.value), 0, 100);
  saveAndRefreshLight();
}

function saveAndRefreshLight() {
  renderSummary();
  saveState();
}

function saveState() {
  if (!isParticipantMode) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quiz));
  }
  getAnswerStorage().setItem(getAnswersKey(), JSON.stringify(answers));
}

function addQuestion() {
  quiz.questions.push(createQuestion());
  render();
}

function moveQuestion(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= quiz.questions.length) return;
  const [question] = quiz.questions.splice(index, 1);
  quiz.questions.splice(target, 0, question);
  render();
}

function resetQuiz() {
  const confirmed = confirm("Créer un nouveau QCM et effacer le questionnaire actuel ?");
  if (!confirmed) return;
  quiz = normalizeQuiz({ title: "Nouveau QCM", description: "", passScore: 70, questions: [createQuestion()] });
  answers = {};
  lastResult = null;
  history.replaceState(null, "", location.pathname + location.search);
  render();
}

async function copyShareLink() {
  const link = await createShareLink();
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Lien copié.");
  } catch {
    prompt("Copie ce lien :", link);
    setStatus("Lien prêt.");
  }
}

async function createShareLink() {
  if (onlineStore.ready) {
    const published = await publishCurrentQuiz(true, { silent: true });
    if (published) {
      return createShortQuizLink(quiz.id);
    }
  }

  return createLegacyQuizLink();
}

function createShortQuizLink(quizId) {
  return `${location.origin}${location.pathname}${location.search}#quiz=${encodeURIComponent(quizId)}`;
}

function createPortalLink() {
  return `${location.origin}${location.pathname}${location.search}#join`;
}

function createLegacyQuizLink() {
  return `${location.origin}${location.pathname}${location.search}#q=${encodeBase64Url(JSON.stringify(createQuizSharePayload()))}`;
}

function createQuizSharePayload() {
  if (!quiz.id) quiz.id = crypto.randomUUID();
  const payload = {
    v: 2,
    i: quiz.id,
    t: quiz.title,
    d: quiz.description,
    p: quiz.passScore,
    q: quiz.questions.map((question) => ({
      t: question.text,
      y: question.type === "multiple" ? 1 : 0,
      e: question.explanation,
      c: question.choices.map((choice) => [choice.text, choice.correct ? 1 : 0])
    }))
  };
  return payload;
}

function exportJson() {
  const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(quiz.title || "qcm")}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Fichier exporté.");
}

function importJson(event) {
  const [file] = event.target.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      quiz = normalizeQuiz(JSON.parse(reader.result));
      answers = {};
      lastResult = null;
      render();
      setStatus("QCM importé.");
    } catch {
      setStatus("Import impossible: JSON invalide.");
    }
  });
  reader.readAsText(file);
  event.target.value = "";
}

function importResultJson(event) {
  const [file] = event.target.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      const incoming = Array.isArray(imported) ? imported : [imported];
      incoming.forEach((result) => {
        const normalized = normalizeResult(result);
        if (normalized) adminResults = upsertAdminResult(adminResults, normalized);
      });
      saveAdminResults();
      renderAdminDashboard();
      setStatus("Résultat importé.");
      switchView("admin");
    } catch {
      setStatus("Import impossible: résultat invalide.");
    }
  });
  reader.readAsText(file);
  event.target.value = "";
}

function renderAdminDashboard() {
  if (!elements.adminSummary || !elements.participantResults) return;
  renderOnlineQuizList();

  const total = adminResults.length;
  const passed = adminResults.filter((result) => result.passed).length;
  const average = total ? Math.round(adminResults.reduce((sum, result) => sum + result.percent, 0) / total) : 0;
  const mistakes = adminResults.reduce((sum, result) => sum + result.details.filter((detail) => !detail.isCorrect).length, 0);

  elements.adminSummary.innerHTML = `
    <div class="admin-stat"><strong>${total}</strong><span>participant(s)</span></div>
    <div class="admin-stat"><strong>${average}%</strong><span>moyenne</span></div>
    <div class="admin-stat"><strong>${passed}</strong><span>réussite(s)</span></div>
    <div class="admin-stat"><strong>${mistakes}</strong><span>erreur(s)</span></div>
    <div class="admin-stat"><strong>${onlineStore.ready ? "Oui" : "Non"}</strong><span>stockage en ligne${onlineStore.error ? ` - ${escapeHtml(onlineStore.error)}` : ""}</span></div>
  `;

  if (!adminResults.length) {
    elements.participantResults.innerHTML = `<div class="empty-state">Aucun résultat importé pour le moment. Demande aux participants de copier leur lien de résultat ou de t'envoyer le fichier exporté.</div>`;
    return;
  }

  elements.participantResults.replaceChildren(...adminResults
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(renderParticipantResult));
}

function renderOnlineQuizList() {
  if (!elements.onlineQuizList) return;

  if (!onlineStore.ready) {
    elements.onlineQuizList.innerHTML = `<div class="empty-state">Configure Firebase pour publier plusieurs QCM et obtenir des liens courts.</div>`;
    return;
  }

  if (!adminOnlineQuizzes.length) {
    elements.onlineQuizList.innerHTML = `<div class="empty-state">Aucun QCM publié. Utilise le bouton Publier depuis l'éditeur.</div>`;
    return;
  }

  elements.onlineQuizList.replaceChildren(...adminOnlineQuizzes
    .slice()
    .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title))
    .map(renderOnlineQuizCard));
}

function renderOnlineQuizCard(quizItem) {
  const article = document.createElement("article");
  article.className = "online-quiz-card";
  article.innerHTML = `
    <div>
      <h3>${escapeHtml(quizItem.title)}</h3>
      <p>${escapeHtml(quizItem.description || `${quizItem.questionCount} question(s)`)}</p>
      <p>${quizItem.active ? "Actif" : "Inactif"} - ${quizItem.questionCount} question(s)</p>
    </div>
    <div class="online-quiz-actions">
      <button class="quiet-action load-online-quiz" type="button">Modifier</button>
      <button class="quiet-action copy-online-quiz" type="button">Lien</button>
      <button class="${quizItem.active ? "danger-action" : "primary-action"} toggle-online-quiz" type="button">${quizItem.active ? "Désactiver" : "Activer"}</button>
    </div>
  `;

  article.querySelector(".load-online-quiz").addEventListener("click", () => loadOnlineQuizIntoAdmin(quizItem.id));
  article.querySelector(".copy-online-quiz").addEventListener("click", async () => {
    const link = createShortQuizLink(quizItem.id);
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Lien du QCM copié.");
    } catch {
      prompt("Copie ce lien :", link);
      setStatus("Lien du QCM prêt.");
    }
  });
  article.querySelector(".toggle-online-quiz").addEventListener("click", () => toggleOnlineQuiz(quizItem.id, !quizItem.active));
  return article;
}

function renderParticipantResult(result) {
  const article = document.createElement("article");
  article.className = "participant-result";
  const wrongDetails = result.details.filter((detail) => !detail.isCorrect);
  const date = new Date(result.date);
  const dateLabel = Number.isNaN(date.getTime()) ? "Date inconnue" : date.toLocaleString("fr-FR");

  article.innerHTML = `
    <header>
      <h3>${escapeHtml(result.participantName)}</h3>
      <span class="pill ${result.passed ? "ok" : "bad"}">${result.percent}%</span>
    </header>
    <div class="participant-meta">
      <span><b>QCM :</b> ${escapeHtml(result.quizTitle)}</span>
      <span><b>Date :</b> ${escapeHtml(dateLabel)}</span>
      <span><b>Score :</b> ${result.correct}/${result.total} - ${result.passed ? "Réussi" : "À retravailler"}</span>
    </div>
    <div class="mistake-list">
      ${wrongDetails.length ? wrongDetails.map((detail) => `
        <span><b>Erreur :</b> ${escapeHtml(detail.question)}<br>
        Réponse donnée : ${escapeHtml(detail.selectedText.join(", ") || "Aucune")}<br>
        Bonne réponse : ${escapeHtml(detail.correctText.join(", "))}</span>
      `).join("") : "<span>Aucune erreur.</span>"}
    </div>
  `;

  return article;
}

function clearAdminResults() {
  const confirmed = confirm("Effacer tous les résultats importés sur ce navigateur ?");
  if (!confirmed) return;

  adminResults = [];
  saveAdminResults();
  renderAdminDashboard();
}

function saveAdminResults() {
  localStorage.setItem(ADMIN_RESULTS_KEY, JSON.stringify(adminResults));
}

function upsertAdminResult(results, result) {
  return [result, ...results.filter((item) => item.id !== result.id)];
}

function createResultShareLink() {
  const result = normalizeResult(lastResult);
  const payload = {
    v: 1,
    i: result.id,
    qi: result.quizId,
    n: result.participantName,
    t: result.quizTitle,
    d: result.date,
    s: result.score,
    c: result.correct,
    o: result.total,
    p: result.percent,
    ps: result.passScore,
    ok: result.passed ? 1 : 0,
    q: result.details.map((detail) => ({
      t: detail.question,
      ok: detail.isCorrect ? 1 : 0,
      c: detail.correctText,
      a: detail.selectedText,
      e: detail.explanation
    }))
  };

  return `${location.origin}${location.pathname}${location.search}#r=${encodeBase64Url(JSON.stringify(payload))}`;
}

async function copyResultLink() {
  const link = createResultShareLink();
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Lien de résultat copié.");
  } catch {
    prompt("Copie ce lien de résultat :", link);
    setStatus("Lien de résultat prêt.");
  }
}

function exportResultJson() {
  const result = normalizeResult(lastResult);
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(result.quizTitle)}-${slugify(result.participantName)}-resultat.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Résultat exporté.");
}

async function copyPortalLink() {
  const link = createPortalLink();
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Lien du portail copié.");
  } catch {
    prompt("Copie ce lien de portail :", link);
    setStatus("Lien du portail prêt.");
  }
}

async function publishCurrentQuiz(active = true, options = {}) {
  if (!onlineStore.ready) {
    if (!options.silent) setStatus("Firebase n'est pas encore prêt.");
    return false;
  }

  try {
    const { doc, serverTimestamp, setDoc } = onlineStore.api;
    const payload = createQuizSharePayload();
    await setDoc(doc(onlineStore.db, "qcmQuizzes", quiz.id), {
      quizId: quiz.id,
      title: quiz.title || "QCM sans titre",
      description: quiz.description || "",
      active,
      payload,
      questionCount: quiz.questions.length,
      updatedAt: serverTimestamp()
    }, { merge: true });
    if (!options.silent) setStatus(active ? "QCM publié en ligne." : "QCM désactivé.");
    await refreshOnlineQuizzes();
    return true;
  } catch (error) {
    console.warn(error);
    if (!options.silent) setStatus("Publication impossible. Vérifie les règles Firestore.");
    return false;
  }
}

async function refreshOnlineQuizzes() {
  if (!onlineStore.ready) {
    renderAdminDashboard();
    return;
  }

  await Promise.all([loadOnlineQuizLibrary(), loadOnlineResults()]);
  renderAdminDashboard();
  if (isJoinMode) renderPlayer();
}

async function loadOnlineQuizLibrary() {
  if (!onlineStore.ready) return;

  try {
    const { collection, getDocs } = onlineStore.api;
    const snapshot = await getDocs(collection(onlineStore.db, "qcmQuizzes"));
    adminOnlineQuizzes = [];
    activeOnlineQuizzes = [];
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const item = {
        id: docSnapshot.id,
        title: data.title || "QCM sans titre",
        description: data.description || "",
        active: Boolean(data.active),
        questionCount: Number(data.questionCount || data.payload?.q?.length || 0),
        payload: data.payload || null
      };
      adminOnlineQuizzes.push(item);
      if (item.active) activeOnlineQuizzes.push(item);
    });
  } catch (error) {
    console.warn(error);
    setStatus("Lecture des QCM en ligne impossible.");
  }
}

async function loadOnlineQuizById(quizId) {
  if (!onlineStore.ready || !quizId) return;

  try {
    const { doc, getDoc } = onlineStore.api;
    const snapshot = await getDoc(doc(onlineStore.db, "qcmQuizzes", quizId));
    if (!snapshot.exists()) {
      onlineQuizLoading = false;
      quiz = normalizeQuiz({ title: "QCM introuvable", description: "Ce lien ne correspond à aucun QCM publié.", questions: [] });
      render();
      return;
    }

    const data = snapshot.data();
    if (!data.active) {
      onlineQuizLoading = false;
      quiz = normalizeQuiz({ title: "QCM inactif", description: "Ce QCM n'est pas disponible pour le moment.", questions: [] });
      render();
      return;
    }

    quiz = normalizeQuiz(expandSharedQuiz(data.payload));
    quiz.id = snapshot.id;
    answers = {};
    lastResult = null;
    currentQuestionIndex = 0;
    onlineQuizLoading = false;
    render();
    switchView("player");
  } catch (error) {
    console.warn(error);
    onlineQuizLoading = false;
    setStatus("Chargement du QCM impossible.");
    render();
  }
}

async function toggleOnlineQuiz(quizId, active) {
  if (!onlineStore.ready) return;

  try {
    const { doc, serverTimestamp, updateDoc } = onlineStore.api;
    await updateDoc(doc(onlineStore.db, "qcmQuizzes", quizId), {
      active,
      updatedAt: serverTimestamp()
    });
    setStatus(active ? "QCM activé." : "QCM désactivé.");
    await refreshOnlineQuizzes();
  } catch (error) {
    console.warn(error);
    setStatus("Modification impossible.");
  }
}

async function loadOnlineQuizIntoAdmin(quizId) {
  const item = adminOnlineQuizzes.find((quizItem) => quizItem.id === quizId);
  if (!item?.payload) return;

  quiz = normalizeQuiz(expandSharedQuiz(item.payload));
  quiz.id = item.id;
  answers = {};
  lastResult = null;
  currentQuestionIndex = 0;
  render();
  switchView("builder");
  setStatus("QCM chargé dans l'éditeur.");
}

async function initOnlineStorage() {
  const config = window.QCM_FIREBASE_CONFIG;
  if (!config || !config.projectId) {
    onlineStore.error = "Firebase non configuré";
    renderAdminDashboard();
    return;
  }

  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const app = appModule.initializeApp(config);
    onlineStore.auth = authModule.getAuth(app);
    await authModule.signInAnonymously(onlineStore.auth);
    onlineStore.db = firestoreModule.getFirestore(app);
    onlineStore.api = firestoreModule;
    onlineStore.enabled = true;
    onlineStore.ready = true;
    onlineStore.error = "";

    if (onlineQuizIdFromUrl) {
      await loadOnlineQuizById(onlineQuizIdFromUrl);
    } else if (isJoinMode) {
      await loadOnlineQuizLibrary();
      renderPlayer();
    } else {
      await refreshOnlineQuizzes();
    }
    renderAdminDashboard();
  } catch (error) {
    onlineStore.error = "Connexion Firebase impossible";
    console.warn(error);
    renderAdminDashboard();
  }
}

async function saveResultOnline(result) {
  if (!onlineStore.ready) return false;

  try {
    const { addDoc, collection, serverTimestamp } = onlineStore.api;
    await addDoc(collection(onlineStore.db, "qcmResults"), {
      ...normalizeResult(result),
      createdAt: serverTimestamp()
    });
    setStatus("Résultat envoyé au panneau admin.");
    return true;
  } catch (error) {
    console.warn(error);
    setStatus("Envoi en ligne impossible. Utilise le bouton de copie.");
    return false;
  }
}

async function loadOnlineResults() {
  if (!onlineStore.ready) return;

  try {
    const { collection, getDocs } = onlineStore.api;
    const snapshot = await getDocs(collection(onlineStore.db, "qcmResults"));
    snapshot.forEach((docSnapshot) => {
      const result = normalizeResult({ id: docSnapshot.id, ...docSnapshot.data() });
      if (result) adminResults = upsertAdminResult(adminResults, result);
    });
    saveAdminResults();
  } catch (error) {
    console.warn(error);
    setStatus("Lecture des résultats en ligne impossible.");
  }
}

function applyAccessMode() {
  document.body.classList.toggle("participant-mode", isParticipantMode);
  elements.participantName.value = participantName;
  renderParticipantState();
}

function renderParticipantState() {
  const isReady = isJoinMode || !isParticipantMode || participantStarted;
  document.body.classList.toggle("participant-ready", isReady);
}

function startQuiz() {
  participantName = elements.participantName.value.trim();
  if (!participantName) {
    elements.participantName.focus();
    return;
  }

  saveParticipantName();
  participantStarted = true;
  renderPlayer();
  elements.answerForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submitAnswers() {
  if (isParticipantMode && !participantName) {
    elements.participantName.focus();
    return;
  }

  const firstMissingIndex = quiz.questions.findIndex((question) => !Array.isArray(answers[question.id]) || !answers[question.id].length);
  if (firstMissingIndex !== -1) {
    currentQuestionIndex = firstMissingIndex;
    renderPlayer();
    setStatus("Réponds à toutes les questions avant de terminer.");
    return;
  }

  const details = quiz.questions.map((question) => {
    const correctIds = question.choices.filter((choice) => choice.correct).map((choice) => choice.id).sort();
    const selectedIds = (answers[question.id] || []).slice().sort();
    const isCorrect = correctIds.length === selectedIds.length && correctIds.every((id, index) => id === selectedIds[index]);
    return {
      question: question.text || "Question sans texte",
      explanation: question.explanation,
      isCorrect,
      correctText: question.choices.filter((choice) => correctIds.includes(choice.id)).map((choice) => choice.text || "Choix sans texte"),
      selectedText: question.choices.filter((choice) => selectedIds.includes(choice.id)).map((choice) => choice.text || "Choix sans texte")
    };
  });

  const correct = details.filter((detail) => detail.isCorrect).length;
  lastResult = {
    id: crypto.randomUUID(),
    quizId: getQuizId(),
    participantName: participantName || "Admin",
    quizTitle: quiz.title || "QCM sans titre",
    date: new Date().toISOString(),
    correct,
    total: quiz.questions.length,
    percent: quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) : 0,
    passScore: quiz.passScore,
    passed: quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) >= quiz.passScore : false,
    details
  };
  lastResult.score = `${lastResult.correct}/${lastResult.total}`;

  if (!isParticipantMode) {
    adminResults = upsertAdminResult(adminResults, normalizeResult(lastResult));
    saveAdminResults();
    renderAdminDashboard();
  } else {
    saveResultOnline(lastResult);
  }

  renderResults();
  switchView("results");
}

function retryQuiz() {
  answers = {};
  lastResult = null;
  currentQuestionIndex = 0;
  saveState();
  render();
  switchView("player");
}

function switchView(name) {
  if (isParticipantMode && name === "builder") {
    name = "player";
  }
  if (name === "player") renderPlayer();
  if (name === "results") renderResults();
  if (name === "admin") {
    loadOnlineResults().then(() => renderAdminDashboard());
  }
  elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  Object.entries(elements.views).forEach(([key, view]) => view.classList.toggle("active", key === name));
}

function updateAnswerProgress() {
  const progress = document.querySelector("#answerProgress");
  if (!progress) return;

  const answered = Object.values(answers).reduce((total, list) => total + (Array.isArray(list) && list.length ? 1 : 0), 0);
  progress.textContent = `${answered}/${quiz.questions.length} question(s) répondues.`;
}

function hasAnsweredCurrentQuestion() {
  const question = quiz.questions[currentQuestionIndex];
  return Boolean(question && Array.isArray(answers[question.id]) && answers[question.id].length);
}

function getAnswerStorage() {
  return isParticipantMode ? sessionStorage : localStorage;
}

function getAnswersKey() {
  return isParticipantMode ? `${ANSWERS_KEY}-${hashText(location.hash)}` : ANSWERS_KEY;
}

function getParticipantNameKey() {
  return `${PARTICIPANT_NAME_KEY}-${hashText(location.hash)}`;
}

function saveParticipantName() {
  if (!isParticipantMode) return;

  try {
    sessionStorage.setItem(getParticipantNameKey(), participantName);
  } catch {
    // Le nom reste disponible pour la session courante même si le stockage est bloqué.
  }
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getQuizId() {
  if (!quiz.id) quiz.id = crypto.randomUUID();
  return quiz.id;
}

function enforceSingleCorrect(question) {
  let found = false;
  question.choices.forEach((choice) => {
    if (choice.correct && !found) {
      found = true;
      return;
    }
    choice.correct = false;
  });
  if (!found && question.choices[0]) question.choices[0].correct = true;
}

function setStatus(message) {
  elements.shareStatus.textContent = message;
  elements.globalStatus.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    elements.shareStatus.textContent = "";
    elements.globalStatus.textContent = "";
  }, 3200);
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = value.padEnd(value.length + ((4 - value.length % 4) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "qcm";
}
