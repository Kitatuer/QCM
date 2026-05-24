const STORAGE_KEY = "qcm-studio-active-quiz";
const ANSWERS_KEY = "qcm-studio-active-answers";
const PARTICIPANT_NAME_KEY = "qcm-studio-participant-name";

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
const isParticipantMode = Boolean(sharedQuizFromUrl);
let quiz = loadQuiz(sharedQuizFromUrl);
let answers = loadAnswers();
let participantName = isParticipantMode ? loadParticipantName() : "";
let participantStarted = !isParticipantMode || Boolean(participantName);
let lastResult = null;

const elements = {
  tabs: document.querySelectorAll(".tab-button"),
  views: {
    builder: document.querySelector("#builderView"),
    player: document.querySelector("#playerView"),
    results: document.querySelector("#resultsView")
  },
  quizHeading: document.querySelector("#quizHeading"),
  questionCount: document.querySelector("#questionCount"),
  correctCount: document.querySelector("#correctCount"),
  passScoreLabel: document.querySelector("#passScoreLabel"),
  quizTitle: document.querySelector("#quizTitle"),
  quizDescription: document.querySelector("#quizDescription"),
  passScore: document.querySelector("#passScore"),
  questionList: document.querySelector("#questionList"),
  answerForm: document.querySelector("#answerForm"),
  playerIntro: document.querySelector("#playerIntro"),
  nameGate: document.querySelector("#nameGate"),
  participantName: document.querySelector("#participantName"),
  submitAnswers: document.querySelector("#submitAnswers"),
  scoreBoard: document.querySelector("#scoreBoard"),
  reviewList: document.querySelector("#reviewList"),
  shareStatus: document.querySelector("#shareStatus")
};

document.querySelector("#addQuestion").addEventListener("click", addQuestion);
document.querySelector("#resetQuiz").addEventListener("click", resetQuiz);
document.querySelector("#copyShareLink").addEventListener("click", copyShareLink);
document.querySelector("#exportJson").addEventListener("click", exportJson);
document.querySelector("#importFile").addEventListener("change", importJson);
document.querySelector("#submitAnswers").addEventListener("click", submitAnswers);
document.querySelector("#retryQuiz").addEventListener("click", retryQuiz);
document.querySelector("#startQuiz").addEventListener("click", startQuiz);
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
switchView(isParticipantMode ? "player" : "builder");

function loadQuiz(sharedQuiz) {
  if (sharedQuiz) {
    return sharedQuiz;
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

function normalizeQuiz(value) {
  if (!value || typeof value !== "object") return structuredClone(sampleQuiz);

  const normalized = {
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
  renderSummary();
  if (!isParticipantMode) renderBuilder();
  renderPlayer();
  renderResults();
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
  const answered = Object.values(answers).reduce((total, list) => total + (Array.isArray(list) && list.length ? 1 : 0), 0);
  const intro = quiz.description || "Sélectionne les réponses, puis lance la correction.";
  const participantLine = participantName ? `<br>Participant : <strong>${escapeHtml(participantName)}</strong>` : "";
  elements.playerIntro.innerHTML = `<strong>${escapeHtml(quiz.title || "QCM sans titre")}</strong><br>${escapeHtml(intro)}${participantLine}<br><span id="answerProgress">${answered}/${quiz.questions.length} question(s) répondues.</span>`;
  elements.answerForm.replaceChildren(...quiz.questions.map(renderAnswerItem));
}

function renderAnswerItem(question, index) {
  const article = document.createElement("article");
  article.className = "answer-item";

  const inputType = question.type === "multiple" ? "checkbox" : "radio";
  const savedAnswers = Array.isArray(answers[question.id]) ? answers[question.id] : [];
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
    <header>
      <h3>${index + 1}. ${escapeHtml(question.text || "Question sans texte")}</h3>
      <span class="pill ${question.type === "multiple" ? "bad" : "ok"}">${question.type === "multiple" ? "Multiple" : "Unique"}</span>
    </header>
    <div class="answer-options">${options}</div>
  `;

  article.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const checked = Array.from(article.querySelectorAll("input:checked")).map((item) => item.value);
      answers[question.id] = checked;
      saveState();
      updateAnswerProgress();
    });
  });

  return article;
}

function renderResults() {
  if (!lastResult) {
    elements.scoreBoard.className = "score-board empty-state";
    elements.scoreBoard.textContent = "Passe le QCM pour afficher la correction.";
    elements.reviewList.replaceChildren();
    return;
  }

  const passed = lastResult.percent >= quiz.passScore;
  elements.scoreBoard.className = `score-board ${passed ? "" : "failed"}`;
  elements.scoreBoard.innerHTML = `
    <strong>${lastResult.percent}% - ${passed ? "Réussi" : "À retravailler"}</strong>
    <span>${participantName ? `${escapeHtml(participantName)} : ` : ""}${lastResult.correct}/${lastResult.total} bonne(s) réponse(s). Score attendu: ${quiz.passScore}%.</span>
  `;
  elements.reviewList.replaceChildren(...lastResult.details.map(renderReviewItem));
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
  const link = createShareLink();
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Lien copié.");
  } catch {
    prompt("Copie ce lien :", link);
    setStatus("Lien prêt.");
  }
}

function createShareLink() {
  const payload = {
    v: 2,
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

  return `${location.origin}${location.pathname}${location.search}#q=${encodeBase64Url(JSON.stringify(payload))}`;
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

function applyAccessMode() {
  document.body.classList.toggle("participant-mode", isParticipantMode);
  elements.participantName.value = participantName;
  renderParticipantState();
}

function renderParticipantState() {
  const isReady = !isParticipantMode || participantStarted;
  document.body.classList.toggle("participant-ready", isReady);
  elements.submitAnswers.disabled = !isReady;
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
    correct,
    total: quiz.questions.length,
    percent: quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) : 0,
    details
  };

  renderResults();
  switchView("results");
}

function retryQuiz() {
  answers = {};
  lastResult = null;
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
  elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  Object.entries(elements.views).forEach(([key, view]) => view.classList.toggle("active", key === name));
}

function updateAnswerProgress() {
  const progress = document.querySelector("#answerProgress");
  if (!progress) return;

  const answered = Object.values(answers).reduce((total, list) => total + (Array.isArray(list) && list.length ? 1 : 0), 0);
  progress.textContent = `${answered}/${quiz.questions.length} question(s) répondues.`;
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
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    elements.shareStatus.textContent = "";
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
