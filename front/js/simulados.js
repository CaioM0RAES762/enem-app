// simulado.js
const BACKEND_BASE = window.APP_CONFIG.API_BASE;


let cronometroInterval = null;
const TEMPO_LIMITE_SEGUNDOS = 2 * 60 * 60;

// ==================== AUTENTIFICAÇÃO ====================

function getAuthToken() {
  return localStorage.getItem("auth_token");
}

function authHeaders() {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}


function escapeHTML(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSafeHTML(text) {
  if (!text) return "";
  const s = String(text);
  if (s.includes("<br")) return s;
  return escapeHTML(s).replaceAll("\n", "<br>");
}

function normalizeFilesArray(files) {
  if (!files) return [];
  if (Array.isArray(files)) {
    return files
      .map((f) => {
        if (!f) return null;
        if (typeof f === "string") return f;
        if (typeof f === "object") return f.url || f.href || f.path || null;
        return null;
      })
      .filter(Boolean);
  }
  if (typeof files === "string") return [files];
  if (typeof files === "object") {
    const u = files.url || files.href || files.path;
    return u ? [u] : [];
  }
  return [];
}

function normalizeAlternatives(alternatives) {
  if (!alternatives) return [];
  if (Array.isArray(alternatives)) {
    return alternatives
      .map((a) => ({
        letter: a?.letter ?? a?.key ?? a?.alternative ?? a?.label ?? null,
        text: a?.text ?? a?.value ?? a?.content ?? null,
      }))
      .filter((a) => a.letter && a.text != null);
  }
  if (typeof alternatives === "object") {
    return Object.entries(alternatives)
      .map(([letter, text]) => ({ letter, text }))
      .filter((a) => a.letter && a.text != null);
  }
  return [];
}

function normalizeDisciplina(d) {
  if (!d) return "";
  const s = String(d);
  if (s === "ciencias_humanas") return "ciencias-humanas";
  if (s === "ciencias_natureza") return "ciencias-natureza";
  return s;
}

function normalizeQuestao(questao) {
  const q = questao || {};
  return {
    ...q,
    id: q.id ?? q.index ?? null,
    year: q.year ?? q.ano ?? "",
    discipline: normalizeDisciplina(q.discipline ?? q.disciplina ?? ""),
    difficulty: q.difficulty ?? q.dificuldade ?? "media",
    correctAlternative:
      q.correctAlternative ?? q.alternativa_correta ?? q.correct_alternative ?? "",
    context: normalizeSafeHTML(q.context ?? q.contexto ?? ""),
    title: normalizeSafeHTML(q.title ?? q.titulo ?? ""),
    files: normalizeFilesArray(q.files ?? q.imagens ?? []),
    alternatives: normalizeAlternatives(q.alternatives ?? q.alternativas ?? []),
    materia: q.materia ?? null,
    tema: q.tema ?? null,
    subtema: q.subtema ?? null,
  };
}

function pickRandom(arr, n) {
  const a = Array.isArray(arr) ? [...arr] : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}

function calcTemaLabelFromQuestao(q) {
  return q?.subtema || q?.tema || q?.materia || "Geral";
}

function getMateriaBadgeLabel() {
  const nomes = {
    portugues: "Português",
    ingles: "Inglês",
    espanhol: "Espanhol",
    literatura: "Literatura",
    artes: "Artes",
    matematica: "Matemática",
    linguagens: "Linguagens",
    "ciencias-humanas": "Ciências Humanas",
    "ciencias-natureza": "Ciências da Natureza",
  };

  const m = window.estadoApp.materiaSelecionada;
  if (m) return nomes[m] || m;

  const d = window.estadoApp.disciplinaSelecionada;
  return nomes[d] || d || "Simulado";
}

// ==================== CONTROLE DA SESSÃO ====================

function getSessaoIdAtual() {
  return window.estadoApp?.sessao_id || null;
}

function setSessaoIdAtual(id) {
  window.estadoApp.sessao_id = id || null;
}

// ==================== CRONÔMETRO ====================

function ensureCronometroUI() {
  const btnFinalizar = document.getElementById("btnFinalizar");
  if (!btnFinalizar) return;

  let cronEl = document.getElementById("cronometroDisplay");
  if (cronEl) return;

  const wrapper = document.createElement("div");
  wrapper.id = "finalizarCronometroWrapper";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "12px";

  const parent = btnFinalizar.parentNode;
  parent.insertBefore(wrapper, btnFinalizar);
  wrapper.appendChild(btnFinalizar);

  cronEl = document.createElement("div");
  cronEl.id = "cronometroDisplay";
  cronEl.textContent = "02:00:00";
  cronEl.style.fontWeight = "700";
  cronEl.style.fontSize = "16px";
  cronEl.style.padding = "8px 12px";
  cronEl.style.borderRadius = "10px";
  cronEl.style.border = "1px solid #e5e7eb";
  cronEl.style.background = "#fff";
  cronEl.style.minWidth = "96px";
  cronEl.style.textAlign = "center";
  cronEl.style.userSelect = "none";

  wrapper.appendChild(cronEl);
}

function iniciarCronometro({ reset = false } = {}) {
  ensureCronometroUI();

  if (reset || !window.estadoApp.simuladoStartTime) {
    window.estadoApp.simuladoStartTime = Date.now();
    window.estadoApp.tempoDecorrido = 0;
    window.estadoApp._tempoPausadoAcumulado = 0;
    window.estadoApp._cronometroPausadoEm = null;
  }

  if (cronometroInterval) clearInterval(cronometroInterval);

  cronometroInterval = setInterval(() => {
    const agora = Date.now();
    if (window.estadoApp._cronometroPausadoEm) return;

    const pausado = Number(window.estadoApp._tempoPausadoAcumulado || 0);
    const decorrido = Math.floor((agora - window.estadoApp.simuladoStartTime - pausado) / 1000);
    window.estadoApp.tempoDecorrido = Math.max(0, decorrido);

    const tempoRestante = Math.max(0, TEMPO_LIMITE_SEGUNDOS - window.estadoApp.tempoDecorrido);
    atualizarDisplayCronometro(tempoRestante);

    if (tempoRestante === 0) {
      pararCronometro();
      alert("⏰ O tempo de 2 horas acabou! O simulado será finalizado automaticamente.");
      finalizarSimulado();
    }
  }, 1000);

  const pausado = Number(window.estadoApp._tempoPausadoAcumulado || 0);
  const decorrido = Math.floor((Date.now() - window.estadoApp.simuladoStartTime - pausado) / 1000);
  window.estadoApp.tempoDecorrido = Math.max(0, decorrido);
  atualizarDisplayCronometro(Math.max(0, TEMPO_LIMITE_SEGUNDOS - window.estadoApp.tempoDecorrido));
}

function pausarCronometro() {
  if (!window.estadoApp._cronometroPausadoEm) {
    window.estadoApp._cronometroPausadoEm = Date.now();
  }
}

function retomarCronometro() {
  const pausadoEm = window.estadoApp._cronometroPausadoEm;
  if (pausadoEm) {
    const delta = Date.now() - pausadoEm;
    window.estadoApp._tempoPausadoAcumulado = Number(window.estadoApp._tempoPausadoAcumulado || 0) + delta;
    window.estadoApp._cronometroPausadoEm = null;
  }
}

function pararCronometro() {
  if (cronometroInterval) {
    clearInterval(cronometroInterval);
    cronometroInterval = null;
  }
  window.estadoApp._cronometroPausadoEm = null;
}

function atualizarDisplayCronometro(segundosRestantes) {
  const horas = Math.floor(segundosRestantes / 3600);
  const minutos = Math.floor((segundosRestantes % 3600) / 60);
  const segundos = segundosRestantes % 60;

  const horasStr = String(horas).padStart(2, "0");
  const minutosStr = String(minutos).padStart(2, "0");
  const segundosStr = String(segundos).padStart(2, "0");

  const cronometroElement = document.getElementById("cronometroDisplay");
  if (cronometroElement) {
    cronometroElement.textContent = `${horasStr}:${minutosStr}:${segundosStr}`;

    if (segundosRestantes <= 300 && segundosRestantes > 0) {
      cronometroElement.classList.add("alerta-tempo");
      cronometroElement.style.borderColor = "#ef4444";
      cronometroElement.style.color = "#ef4444";
    } else {
      cronometroElement.classList.remove("alerta-tempo");
      cronometroElement.style.borderColor = "#e5e7eb";
      cronometroElement.style.color = "";
    }
  }
}

// ==================== SIMULADO ====================

async function iniciarSimulado(tema, questoes) {
  window.estadoApp.temaSelecionado = tema || "Simulado";
  window.estadoApp.respostas = {};
  window.estadoApp.__startTimes = {};
  setSessaoIdAtual(null);

  const lista = Array.isArray(questoes) ? questoes.map(normalizeQuestao) : [];

  const validas = lista.filter((q) => {
    const altsOk = Array.isArray(q.alternatives) && q.alternatives.length >= 4;
    const gabaritoOk = typeof q.correctAlternative === "string" && q.correctAlternative.trim().length === 1;
    const titleOk = String(q.title || "").replace(/<br>/g, "").trim().length >= 3;
    return altsOk && gabaritoOk && titleOk;
  });

  const questoesAleatorias = pickRandom(validas, 30);
  window.estadoApp.questoesSimulado = questoesAleatorias;

  window.esconderView("temaView");
  window.mostrarView("simuladoView");

  const resultadoContainer = document.getElementById("resultadoContainer");
  const questoesContainer = document.getElementById("questoesContainer");
  const btnFinalizar = document.getElementById("btnFinalizar");
  if (resultadoContainer) resultadoContainer.style.display = "none";
  if (questoesContainer) questoesContainer.style.display = "flex";
  if (btnFinalizar) btnFinalizar.style.display = "block";

  iniciarCronometro({ reset: true });

  await criarSessaoEstudoNoInicio();

  renderizarSimulado();
}

function renderizarSimulado() {
  const container = document.getElementById("questoesContainer");
  const badgeMateria = document.getElementById("badgeMateria");
  const badgeTema = document.getElementById("badgeTema");
  const badgeQuestoes = document.getElementById("badgeQuestoes");
  if (!container || !badgeMateria || !badgeTema || !badgeQuestoes) return;

  badgeMateria.textContent = getMateriaBadgeLabel();
  badgeTema.textContent = window.estadoApp.temaSelecionado || "Simulado";
  badgeQuestoes.textContent = `${window.estadoApp.questoesSimulado.length} questões`;

  container.innerHTML = "";

  window.estadoApp.questoesSimulado.forEach((questaoRaw, index) => {
    const questao = normalizeQuestao(questaoRaw);

    window.estadoApp.__startTimes[index] = Date.now();

    const card = document.createElement("div");
    card.className = "questao-card";
    card.id = `questao-${index}`;

    const imagens = normalizeFilesArray(questao.files);
    const imagensHTML =
      imagens.length > 0
        ? imagens
          .map((img) => {
            const safe = escapeHTML(img);
            return `<img src="${safe}" alt="Imagem da questão" class="questao-imagem">`;
          })
          .join("")
        : "";

    const alternativas = normalizeAlternatives(questao.alternatives);

    const alternativasHTML =
      alternativas.length > 0
        ? alternativas
          .map((alt) => {
            const letter = escapeHTML(alt.letter);
            const text = normalizeSafeHTML(alt.text);
            return `
                <button type="button" class="alternativa" data-letra="${letter}"
                  onclick="responderQuestao(${index}, '${letter}')">
                  <span class="letra-alternativa">${letter})</span>
                  <span>${text}</span>
                </button>
              `;
          })
          .join("")
        : `<div class="sem-alternativas">⚠️ Esta questão veio sem alternativas. Pule para a próxima.</div>`;

    const correctAlt = questao.correctAlternative || "";

    const tagsHTML = `
      <div class="questao-tags">
        ${questao.materia ? `<span class="tag">📌 ${escapeHTML(String(questao.materia))}</span>` : ""}
        ${questao.tema ? `<span class="tag">🏷️ ${escapeHTML(String(questao.tema))}</span>` : ""}
        ${questao.subtema ? `<span class="tag">🔎 ${escapeHTML(String(questao.subtema))}</span>` : ""}
      </div>
    `;

    card.innerHTML = `
      <div class="questao-header">
        <div class="questao-numero">Questão ${index + 1} de ${window.estadoApp.questoesSimulado.length}</div>
        <div class="questao-ano">ENEM ${escapeHTML(String(questao.year || ""))}</div>
      </div>

      ${tagsHTML}

      ${questao.context ? `<div class="questao-contexto">${questao.context}</div>` : ""}
      ${imagensHTML}
      <div class="questao-enunciado">${questao.title || ""}</div>

      <div class="alternativas" data-questao-id="${index}" data-correta="${escapeHTML(String(correctAlt))}">
        ${alternativasHTML}
      </div>

      <div class="feedback-questao" id="feedback-${index}"></div>
    `;

    container.appendChild(card);
  });
}

// ==================== RESPOSTAS ====================

function responderQuestao(index, letra) {
  const questao = normalizeQuestao(window.estadoApp.questoesSimulado[index]);
  const alternativasContainer = document.querySelector(`[data-questao-id="${index}"]`);
  const feedback = document.getElementById(`feedback-${index}`);
  if (!questao || !alternativasContainer || !feedback) return;
  if (window.estadoApp.respostas[index]) return;

  const letraCorreta = questao.correctAlternative;
  if (!letraCorreta) {
    window.estadoApp.respostas[index] = letra;
    feedback.textContent = "⚠️ Questão sem gabarito. Resposta não será contabilizada/salva.";
    feedback.className = "feedback-questao mostrar erro";
    return;
  }

  window.estadoApp.respostas[index] = letra;

  const alternativasBtns = alternativasContainer.querySelectorAll(".alternativa");

  alternativasBtns.forEach((alt) => {
    alt.classList.add("desabilitada");
    if (alt.dataset.letra === letraCorreta) alt.classList.add("correta");
  });

  const alternativaClicada = alternativasContainer.querySelector(`[data-letra="${letra}"]`);
  if (alternativaClicada) {
    alternativaClicada.classList.add("selecionada");
    if (letra !== letraCorreta) alternativaClicada.classList.add("errada");
  }

  const acertou = letra === letraCorreta;

  if (acertou) {
    feedback.textContent = "✅ Resposta correta!";
    feedback.className = "feedback-questao mostrar acerto";
  } else {
    feedback.textContent = `❌ Resposta incorreta. A alternativa correta é ${letraCorreta}.`;
    feedback.className = "feedback-questao mostrar erro";
  }

  const start = window.estadoApp.__startTimes?.[index] || Date.now();
  const tempoResposta = Math.max(0, Math.round((Date.now() - start) / 1000));

  salvarRespostaNoBanco(questao, letra, letraCorreta, acertou, tempoResposta);
}

async function salvarRespostaNoBanco(questaoRaw, respostaUsuario, respostaCorreta, acertou, tempo_resposta) {
  try {
    const token = getAuthToken();
    if (!token) {
      console.error("[simulado] auth_token não encontrado - usuário não está logado");
      return;
    }

    const questao = normalizeQuestao(questaoRaw);

    const payload = {
      sessao_id: getSessaoIdAtual(),
      questao_id: questao.id || null,
      disciplina: questao.discipline || window.estadoApp.disciplinaSelecionada,

      materia: questao.materia || window.estadoApp.materiaSelecionada || null,
      tema: questao.tema || window.estadoApp.temaSelecionado || null,
      subtema: questao.subtema || calcTemaLabelFromQuestao(questao) || null,

      ano_questao: questao.year || null,
      resposta_usuario: respostaUsuario,
      resposta_correta: respostaCorreta,
      acertou: typeof acertou === "boolean" ? acertou : respostaUsuario === respostaCorreta,
      tempo_resposta: Number(tempo_resposta) || 0,
      dificuldade: questao.difficulty || "media",

      total_questoes: Number(window.estadoApp.questoesSimulado?.length || 0),
    };

    const response = await fetch(`${BACKEND_BASE}/api/respostas`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
      credentials: "include",
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) console.error("[simulado] Erro ao salvar resposta:", result);
  } catch (error) {
    console.error("[simulado] Erro ao salvar resposta no banco:", error);
  }
}

// ==================== SESSÃO (INÍCIO / FIM) ====================

async function criarSessaoEstudoNoInicio() {
  try {
    const token = getAuthToken();
    if (!token) return;

    const total = Number(window.estadoApp.questoesSimulado?.length || 0);

    const sessaoData = {
      disciplina: window.estadoApp.disciplinaSelecionada,
      tema: window.estadoApp.temaSelecionado || "Simulado",
      questoes_respondidas: 0,
      acertos: 0,
      tempo_total: 0,
      tipo_atividade: "simulado",

      total_questoes: total,
    };

    const response = await fetch(`${BACKEND_BASE}/api/respostas/sessao`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(sessaoData),
      credentials: "include",
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[simulado] Erro ao criar sessão no início:", result);
      return;
    }

    const sessao = result?.sessao || result?.data?.sessao || result?.data || null;
    const sessaoId = sessao?.id || null;
    if (sessaoId) setSessaoIdAtual(sessaoId);
  } catch (e) {
    console.error("[simulado] Falha ao criar sessão no início:", e);
  }
}

async function finalizarSessaoEstudoNoFim(totalRespondidas, acertos, tempoTotal) {
  try {
    const token = getAuthToken();
    if (!token) return;

    const sessao_id = getSessaoIdAtual();

    const sessaoData = {
      sessao_id,
      disciplina: window.estadoApp.disciplinaSelecionada,
      tema: window.estadoApp.temaSelecionado || "Simulado",
      questoes_respondidas: Number(totalRespondidas) || 0,
      acertos: Number(acertos) || 0,
      tempo_total: Number(tempoTotal) || 0,
      tipo_atividade: "simulado",

      total_questoes: Number(window.estadoApp.questoesSimulado?.length || 0),
    };

    const response = await fetch(`${BACKEND_BASE}/api/respostas/sessao`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(sessaoData),
      credentials: "include",
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[simulado] Erro ao finalizar sessão:", result);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[simulado] Falha ao finalizar sessão:", e);
    return false;
  }
}

// ==================== FINALIZAR ====================

async function finalizarSimulado() {
  pausarCronometro();

  const totalQuestoes = window.estadoApp.questoesSimulado.length;
  const totalRespondidas = Object.keys(window.estadoApp.respostas).length;

  if (totalRespondidas < totalQuestoes) {
    const confirmar = confirm(
      `Você respondeu ${totalRespondidas} de ${totalQuestoes} questões. Finalizar mesmo assim?`
    );
    if (!confirmar) {
      retomarCronometro();
      if (!cronometroInterval) iniciarCronometro({ reset: false });
      return;
    }
  }
  pararCronometro();

  let acertos = 0;
  let validas = 0;

  window.estadoApp.questoesSimulado.forEach((questaoRaw, index) => {
    const questao = normalizeQuestao(questaoRaw);
    const gabarito = questao.correctAlternative;
    const marcada = window.estadoApp.respostas[index];

    if (!marcada) return;
    if (!gabarito) return;

    validas++;
    if (marcada === gabarito) acertos++;
  });

  const erros = validas - acertos;
  const percentual = validas > 0 ? ((acertos / validas) * 100).toFixed(1) : "0.0";

  const statAcertos = document.getElementById("statAcertos");
  const statErros = document.getElementById("statErros");
  const statPercentual = document.getElementById("statPercentual");
  if (statAcertos) statAcertos.textContent = String(acertos);
  if (statErros) statErros.textContent = String(erros);
  if (statPercentual) statPercentual.textContent = `${percentual}%`;

  const questoesContainer = document.getElementById("questoesContainer");
  const btnFinalizar = document.getElementById("btnFinalizar");
  const resultadoContainer = document.getElementById("resultadoContainer");
  if (questoesContainer) questoesContainer.style.display = "none";
  if (btnFinalizar) btnFinalizar.style.display = "none";
  if (resultadoContainer) resultadoContainer.style.display = "block";

  const tempoTotalSegundos = window.estadoApp.tempoDecorrido || 0;

  const ok = await finalizarSessaoEstudoNoFim(validas, acertos, tempoTotalSegundos);

  if (ok) {
    setTimeout(() => {
      alert("Simulado finalizado e salvo com sucesso! \n\nVeja seus resultados no Dashboard.");
    }, 250);
  } else {
    setTimeout(() => {
      alert("Simulado finalizado, mas houve falha ao salvar a sessão. \nTente novamente.");
    }, 250);
  }
}

function verGabarito() {
  const resultadoContainer = document.getElementById("resultadoContainer");
  const questoesContainer = document.getElementById("questoesContainer");
  if (resultadoContainer) resultadoContainer.style.display = "none";
  if (questoesContainer) questoesContainer.style.display = "flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.iniciarSimulado = iniciarSimulado;
window.renderizarSimulado = renderizarSimulado;
window.responderQuestao = responderQuestao;
window.finalizarSimulado = finalizarSimulado;
window.verGabarito = verGabarito;
