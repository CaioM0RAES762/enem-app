"use strict";

// ==================== CONFIG API ====================

const API_ORIGIN = window.APP_CONFIG.API_BASE;


const API_BASE_URL = `${API_ORIGIN}/api`;

const CORES_DISCIPLINAS = {
  linguagens: "#3b82f6",
  matematica: "#8b5cf6",
  "ciencias-humanas": "#ec4899",
  "ciencias-natureza": "#10b981",
};

const estadoApp = {
  disciplinas: {},
  disciplinaSelecionada: null,
  questoesTodas: [],
  materiaSelecionada: null,
  temaSelecionado: null,
  anoSelecionado: "",
  questoesSimulado: [],
  respostas: {},

  user: null,
};
window.estadoApp = estadoApp;
window.CORES_DISCIPLINAS = CORES_DISCIPLINAS;

// ==================== UTILITÁRIOS ====================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ultimaReqEm = 0;
async function aguardarJanelaMinima(minIntervalMs = 150) {
  const agora = Date.now();
  const delta = agora - ultimaReqEm;
  if (delta < minIntervalMs) await sleep(minIntervalMs - delta);
  ultimaReqEm = Date.now();
}

function getStoredUserId() {
  return (
    localStorage.getItem("userId") ||
    localStorage.getItem("usuario_id") ||
    localStorage.getItem("usuarioId") ||
    localStorage.getItem("id_usuario") ||
    null
  );
}


function normalizarUsuario(user) {
  if (!user || typeof user !== "object") return null;

  const id = user.id ?? user.user_id ?? user.usuario_id ?? null;
  const nome =
    user.nome ??
    user.name ??
    user.username ??
    user.full_name ??
    user.nome_completo ??
    null;

  const email = user.email ?? user.mail ?? user.user_email ?? null;

  const nomeDerivadoEmail =
    !nome && email ? email.split("@")[0].replace(/[._-]+/g, " ") : null;

  return {
    ...user,
    id,
    nome: nome || nomeDerivadoEmail || "Usuário",
    email: email || "",
  };
}

function atualizarMenuUsuario(user) {
  const u = normalizarUsuario(user) || normalizarUsuario(estadoApp.user);

  const elName = document.getElementById("userMenuName");
  const elEmail = document.getElementById("userMenuEmail");
  const elInitial = document.getElementById("userInitial");

  if (elName && u?.nome) elName.textContent = u.nome;
  if (elEmail) elEmail.textContent = u?.email ? u.email : "";

  if (elInitial) {
    const base = (u?.nome || u?.email || "U").trim();
    elInitial.textContent = (base[0] || "U").toUpperCase();
  }
}

async function carregarUsuarioMe() {
  if (estadoApp.user?.id) return estadoApp.user;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const user = data?.user || data?.usuario || data?.data?.user || null;

    const uNorm = normalizarUsuario(user);
    if ((data?.success && uNorm?.id) || uNorm?.id) {
      estadoApp.user = uNorm;

      try {
        localStorage.setItem("userId", String(uNorm.id));
      } catch { }

      atualizarMenuUsuario(uNorm);

      return uNorm;
    }
  } catch (e) {
    console.warn("[questoes] falha ao carregar /auth/me:", e);
  }

  atualizarMenuUsuario(estadoApp.user);
  return null;
}

function getDefaultHeaders(extra = {}) {
  const headers = { ...extra };

  const userId = getStoredUserId() || estadoApp.user?.id;
  if (userId) headers["X-User-ID"] = String(userId);

  return headers;
}

async function fetchJsonComRetry(
  url,
  { retries = 2, timeoutMs = 15000, fetchOptions = {} } = {}
) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      await aguardarJanelaMinima();

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: getDefaultHeaders(fetchOptions.headers || {}),
        signal: ctrl.signal,
        ...fetchOptions,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} em ${url} :: ${txt.slice(0, 200)}`);
      }

      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr || new Error(`Falha ao buscar ${url}`);
}

function extrairArrayQuestoes(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.questoes)) return data.questoes;
  if (Array.isArray(data.questions)) return data.questions;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function normalizarQuestao(q) {
  if (!q || typeof q !== "object") return q;

  const year = q.year ?? q.ano ?? q.exam_year ?? q.exame_ano ?? null;
  const discipline = q.discipline ?? q.disciplina ?? q.area ?? null;

  const context = q.context ?? q.enunciado ?? q.statement ?? q.texto ?? "";
  const title = q.title ?? q.titulo ?? q.question_title ?? "";

  const language = q.language ?? q.idioma ?? q.lingua ?? null;

  return {
    ...q,
    year,
    discipline,
    context,
    title,
    language,
  };
}

function buildQuestoesUrl({ disciplina, ano, limit, offset } = {}) {
  const url = new URL(`${API_BASE_URL}/questoes`);
  if (disciplina) url.searchParams.set("disciplina", disciplina);
  if (ano) url.searchParams.set("ano", String(ano));
  if (typeof limit === "number") url.searchParams.set("limit", String(limit));
  if (typeof offset === "number") url.searchParams.set("offset", String(offset));
  return url.toString();
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener("DOMContentLoaded", async () => {
  // tenta preencher menu mesmo antes (evita piscar placeholder)
  atualizarMenuUsuario(estadoApp.user);

  await carregarUsuarioMe();

  carregarDisciplinas();

  const filtroAno = document.getElementById("filtroAno");
  if (filtroAno) {
    filtroAno.addEventListener("change", () => {
      estadoApp.anoSelecionado = filtroAno.value;
      renderizarMaterias();
    });
  }
});

// ==================== DISCIPLINAS (fixas) ====================

function carregarDisciplinas() {
  const loading = document.getElementById("loadingDisciplinas");
  const grid = document.getElementById("disciplinasGrid");

  try {
    if (loading) loading.style.display = "flex";
    if (grid) grid.style.display = "none";

    const disciplinas = {
      linguagens: {
        nome: "Linguagens e suas Tecnologias",
        cor: CORES_DISCIPLINAS.linguagens,
        value: "linguagens",
      },
      matematica: {
        nome: "Matemática e suas Tecnologias",
        cor: CORES_DISCIPLINAS.matematica,
        value: "matematica",
      },
      "ciencias-humanas": {
        nome: "Ciências Humanas e suas Tecnologias",
        cor: CORES_DISCIPLINAS["ciencias-humanas"],
        value: "ciencias-humanas",
      },
      "ciencias-natureza": {
        nome: "Ciências da Natureza e suas Tecnologias",
        cor: CORES_DISCIPLINAS["ciencias-natureza"],
        value: "ciencias-natureza",
      },
    };

    estadoApp.disciplinas = disciplinas;

    if (loading) loading.style.display = "none";
    if (grid) grid.style.display = "grid";

    renderizarDisciplinas(disciplinas);
  } catch (error) {
    console.error("Erro ao carregar disciplinas:", error);
    if (loading) {
      loading.innerHTML =
        '<p style="color: var(--cor-erro);">Erro ao carregar disciplinas.</p>';
    }
  }
}

// ==================== CARREGAMENTO DE QUESTÕES (BD) ====================

async function carregarQuestoes(disciplina) {
  const loading = document.getElementById("loadingMaterias");
  const grid = document.getElementById("materiasGrid");
  const filtrosBar = document.querySelector(".filters-bar");

  try {
    if (loading) loading.style.display = "flex";
    if (grid) grid.style.display = "none";
    if (filtrosBar) filtrosBar.style.display = "none";

    const TODAS = [];
    const LIMIT = 200;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const url = buildQuestoesUrl({
        disciplina,
        limit: LIMIT,
        offset,
      });

      const data = await fetchJsonComRetry(url, {
        retries: 2,
        timeoutMs: 20000,
      });

      const bloco = extrairArrayQuestoes(data).map(normalizarQuestao);

      if (!bloco.length) break;

      TODAS.push(...bloco);

      if (bloco.length < LIMIT) {
        hasMore = false;
      } else {
        offset += LIMIT;
      }
    }

    if (!TODAS.length) {
      throw new Error("Nenhuma questão retornada pela API.");
    }

    estadoApp.questoesTodas = TODAS.map((q) =>
      enriquecerQuestao(q, disciplina)
    );

    // monta filtro de ano
    const anosComQuestoes = Array.from(
      new Set(estadoApp.questoesTodas.map((q) => q.year).filter(Boolean))
    )
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a);

    const filtroAno = document.getElementById("filtroAno");
    if (filtroAno) {
      filtroAno.innerHTML = '<option value="">Todos os anos</option>';
      anosComQuestoes.forEach((ano) => {
        const opt = document.createElement("option");
        opt.value = ano;
        opt.textContent = ano;
        filtroAno.appendChild(opt);
      });
    }

    if (loading) loading.style.display = "none";
    if (grid) grid.style.display = "grid";
    if (filtrosBar) filtrosBar.style.display = "block";

    renderizarMaterias();
  } catch (error) {
    console.error("Erro ao carregar questões:", error);
    if (loading) {
      loading.innerHTML = `<p style="color: var(--cor-erro);">${error.message}</p>`;
    }
  }
}

// ==================== CLASSIFICAÇÃO ====================

function enriquecerQuestao(questao, disciplina) {
  let materiaId = disciplina;
  let subtema = "Geral";

  if (disciplina === "linguagens") {
    materiaId = detectarMateriaLinguagens(questao);
    subtema = detectarSubtemaLinguagens(questao, materiaId);
  } else if (disciplina === "matematica") subtema = detectarSubtemaMatematica(questao);
  else if (disciplina === "ciencias-humanas") subtema = detectarSubtemaHumanas(questao);
  else if (disciplina === "ciencias-natureza") subtema = detectarSubtemaNatureza(questao);

  return { ...questao, materiaId, subtema };
}

function detectarMateriaLinguagens(questao) {
  if (questao.language === "ingles") return "ingles";
  if (questao.language === "espanhol") return "espanhol";

  const texto = ((questao.context || "") + " " + (questao.title || "")).toLowerCase();
  if (/quinhentismo|barroco|arcadismo|romantismo|realismo|modernismo|literatura/i.test(texto)) return "literatura";
  if (/pintura|escultura|arte|música|teatro|cinema/i.test(texto)) return "artes";
  return "portugues";
}

function detectarSubtemaLinguagens(questao, materia) {
  const texto = ((questao.context || "") + " " + (questao.title || "")).toLowerCase();

  if (materia === "literatura") {
    if (/quinhentismo/i.test(texto)) return "Quinhentismo";
    if (/barroco/i.test(texto)) return "Barroco";
    if (/arcadismo/i.test(texto)) return "Arcadismo";
    if (/romantismo/i.test(texto)) return "Romantismo";
    if (/realismo|naturalismo/i.test(texto)) return "Realismo/Naturalismo";
    if (/parnasianismo/i.test(texto)) return "Parnasianismo";
    if (/simbolismo/i.test(texto)) return "Simbolismo";
    if (/modernismo/i.test(texto)) return "Modernismo";
    return "Literatura Geral";
  }

  if (/gramática|sintaxe|morfologia|ortografia/i.test(texto)) return "Gramática";
  if (/interpretação|texto/i.test(texto)) return "Interpretação de Texto";
  return "Geral";
}

function detectarSubtemaMatematica(questao) {
  const texto = ((questao.context || "") + " " + (questao.title || "")).toLowerCase();
  if (/trigonometria|seno|cosseno/i.test(texto)) return "Trigonometria";
  if (/função|gráfico/i.test(texto)) return "Funções";
  if (/geometria|triângulo|área|volume/i.test(texto)) return "Geometria";
  if (/estatística|média|gráfico/i.test(texto)) return "Estatística";
  if (/probabilidade/i.test(texto)) return "Probabilidade";
  if (/porcentagem|juros/i.test(texto)) return "Porcentagem";
  return "Geral";
}

function detectarSubtemaHumanas(questao) {
  const texto = ((questao.context || "") + " " + (questao.title || "")).toLowerCase();
  if (/história|histórico|século|guerra/i.test(texto)) return "História";
  if (/geografia|clima|relevo|população/i.test(texto)) return "Geografia";
  if (/filosofia|filósofo/i.test(texto)) return "Filosofia";
  if (/sociologia|sociedade|social/i.test(texto)) return "Sociologia";
  return "Geral";
}

function detectarSubtemaNatureza(questao) {
  const texto = ((questao.context || "") + " " + (questao.title || "")).toLowerCase();
  if (/física|força|energia|movimento/i.test(texto)) return "Física";
  if (/química|reação|átomo|molécula/i.test(texto)) return "Química";
  if (/biologia|célula|dna|organismo/i.test(texto)) return "Biologia";
  return "Geral";
}

// ==================== RENDERIZAÇÃO ====================

function renderizarDisciplinas(materias) {
  const grid = document.getElementById("disciplinasGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const icones = {
    linguagens:
      '<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13M3 6.253C4.168 5.477 5.754 5 7.5 5s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>',
    matematica:
      '<path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>',
    "ciencias-humanas":
      '<path d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    "ciencias-natureza":
      '<path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>',
  };

  Object.entries(materias).forEach(([id, materia]) => {
    const card = document.createElement("div");
    card.className = "disciplina-card";
    card.style.setProperty("--cor-disciplina", materia.cor);

    card.innerHTML = `
      <div class="disciplina-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${icones[id] || icones["linguagens"]}
        </svg>
      </div>
      <div class="disciplina-nome">${materia.nome}</div>
      <div class="disciplina-questoes">Clique para ver as matérias</div>
    `;

    card.addEventListener("click", () => selecionarDisciplina(id, materia));
    grid.appendChild(card);
  });
}

function renderizarMaterias() {
  const grid = document.getElementById("materiasGrid");
  if (!grid) return;
  grid.innerHTML = "";

  let questoesFiltradas = estadoApp.questoesTodas;
  if (estadoApp.anoSelecionado) {
    questoesFiltradas = questoesFiltradas.filter(
      (q) => String(q.year) === estadoApp.anoSelecionado
    );
  }

  const materiasPorId = {};
  questoesFiltradas.forEach((q) => {
    if (!materiasPorId[q.materiaId]) materiasPorId[q.materiaId] = [];
    materiasPorId[q.materiaId].push(q);
  });

  const nomesMaterias = {
    portugues: "Português",
    ingles: "Inglês",
    espanhol: "Espanhol",
    literatura: "Literatura",
    artes: "Artes",
    matematica: "Matemática",
    "ciencias-humanas": "Ciências Humanas",
    "ciencias-natureza": "Ciências da Natureza",
  };

  const cor = CORES_DISCIPLINAS[estadoApp.disciplinaSelecionada] || "#64748b";

  Object.entries(materiasPorId).forEach(([materiaId, questoes]) => {
    const temas = new Set(questoes.map((q) => q.subtema));

    const card = document.createElement("div");
    card.className = "materia-card";
    card.style.setProperty("--cor-materia", cor);

    card.innerHTML = `
      <div class="materia-header">
        <div class="materia-nome">${nomesMaterias[materiaId] || materiaId}</div>
        <div class="materia-badge">${questoes.length} questões</div>
      </div>
      <div class="materia-temas">${temas.size} tema${temas.size !== 1 ? "s" : ""} disponível${temas.size !== 1 ? "is" : ""}</div>
    `;

    card.addEventListener("click", () => selecionarMateria(materiaId, questoes));
    grid.appendChild(card);
  });

  if (Object.keys(materiasPorId).length === 0) {
    grid.innerHTML =
      '<div class="mensagem-vazia"><h3>Nenhuma questão encontrada</h3><p>Tente ajustar os filtros.</p></div>';
  }
}

function renderizarTemas(questoes) {
  const list = document.getElementById("temasList");
  if (!list) return;
  list.innerHTML = "";

  const temasPorNome = {};
  questoes.forEach((q) => {
    const tema = q.subtema;
    if (!temasPorNome[tema]) temasPorNome[tema] = [];
    temasPorNome[tema].push(q);
  });

  const temasOrdenados = Object.entries(temasPorNome).sort(
    (a, b) => b[1].length - a[1].length
  );

  temasOrdenados.forEach(([tema, questoesTema]) => {
    const item = document.createElement("div");
    item.className = "tema-item";

    item.innerHTML = `
      <div class="tema-info">
        <div class="tema-nome">${tema}</div>
        <div class="tema-questoes">${questoesTema.length} questão${questoesTema.length !== 1 ? "es" : ""} disponível${questoesTema.length !== 1 ? "is" : ""}</div>
      </div>
      <svg class="tema-arrow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    `;

    item.addEventListener("click", () =>
      window.iniciarSimulado(tema, questoesTema)
    );
    list.appendChild(item);
  });
}

// ==================== NAVEGAÇÃO ====================

function selecionarDisciplina(id, materia) {
  estadoApp.disciplinaSelecionada = id;
  estadoApp.anoSelecionado = "";

  const tituloMateria = document.getElementById("tituloMateria");
  if (tituloMateria) {
    tituloMateria.textContent = materia.nome;
    tituloMateria.style.color = materia.cor;
  }

  esconderView("disciplinaView");
  mostrarView("materiaView");

  carregarQuestoes(id);
}

function selecionarMateria(materiaId, questoes) {
  estadoApp.materiaSelecionada = materiaId;

  const nomesMaterias = {
    portugues: "Português",
    ingles: "Inglês",
    espanhol: "Espanhol",
    literatura: "Literatura",
    artes: "Artes",
  };

  const tituloTema = document.getElementById("tituloTema");
  if (tituloTema) {
    tituloTema.textContent = `${nomesMaterias[materiaId] || materiaId} - Escolha o Tema`;
  }

  esconderView("materiaView");
  mostrarView("temaView");

  renderizarTemas(questoes);
}

function voltarParaDisciplinas() {
  esconderView("materiaView");
  esconderView("temaView");
  esconderView("simuladoView");
  mostrarView("disciplinaView");

  estadoApp.disciplinaSelecionada = null;
  estadoApp.materiaSelecionada = null;
  estadoApp.temaSelecionado = null;
  estadoApp.questoesSimulado = [];
  estadoApp.respostas = {};
}

function voltarParaMaterias() {
  esconderView("temaView");
  mostrarView("materiaView");
  estadoApp.materiaSelecionada = null;
  estadoApp.temaSelecionado = null;
}

function voltarParaTemas() {
  esconderView("simuladoView");
  mostrarView("temaView");
  estadoApp.temaSelecionado = null;
  estadoApp.questoesSimulado = [];
  estadoApp.respostas = {};
}

function mostrarView(viewId) {
  const el = document.getElementById(viewId);
  if (el) el.classList.add("active");
}

function esconderView(viewId) {
  const el = document.getElementById(viewId);
  if (el) el.classList.remove("active");
}

window.selecionarDisciplina = selecionarDisciplina;
window.selecionarMateria = selecionarMateria;
window.voltarParaDisciplinas = voltarParaDisciplinas;
window.voltarParaMaterias = voltarParaMaterias;
window.voltarParaTemas = voltarParaTemas;
window.mostrarView = mostrarView;
window.esconderView = esconderView;

window.atualizarMenuUsuario = atualizarMenuUsuario;
window.carregarUsuarioMe = carregarUsuarioMe;
