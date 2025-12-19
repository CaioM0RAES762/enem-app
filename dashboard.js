const API_BASE = "http://localhost:3000";

let dadosDashboard = null;
let usuarioLogado = null;

// Ícones SVG
const icones = {
  grafico: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>`,
  alvo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="6"></circle>
    <circle cx="12" cy="12" r="2"></circle>
  </svg>`,
  tendencia: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
    <polyline points="16 7 22 7 22 13"></polyline>
  </svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>`,
};

// ========== FUNÇÕES DE AUTENTICAÇÃO ==========

function redirectToLogin() {
  window.location.href = "login.html";
}

function buildAuthHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}), ...buildAuthHeaders() };

  const resp = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "include",
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { success: false, error: text };
  }

  console.log("[dashboard] fetch:", url, "status:", resp.status, json);

  return { ok: resp.ok, status: resp.status, json };
}

function extrairUserId(user) {
  if (!user) return null;
  return user.id ?? user.usuario_id ?? user.userId ?? user._id ?? user.uid ?? null;
}

function normalizarUsuario(user) {
  const id = extrairUserId(user);
  if (!id) return null;
  return { ...user, id };
}

async function verificarUsuarioLogado() {
  try {
    const { ok, status, json } = await fetchJson(`${API_BASE}/api/auth/me`, { method: "GET" });
    if (!ok || status === 401 || status === 403 || !json?.success || !json?.user) {
      redirectToLogin();
      return null;
    }

    const user = normalizarUsuario(json.user);
    if (!user) {
      console.error("[dashboard] /auth/me retornou user sem id. user=", json.user);
      redirectToLogin();
      return null;
    }

    usuarioLogado = user;
    return user;
  } catch (erro) {
    console.error("[dashboard] Erro ao verificar usuário:", erro);
    redirectToLogin();
    return null;
  }
}

// ========== CARREGAR DADOS ==========

async function carregarDados() {
  try {
    const usuario = await verificarUsuarioLogado();
    if (!usuario) return;

    atualizarInfoUsuario(usuario);

    console.log("[dashboard] Usuário autenticado:", usuario.id, usuario.email || usuario.nome);

    const userId = usuario.id;
    if (!userId) {
      console.error("[dashboard] userId inválido (undefined/null). usuario=", usuario);
      redirectToLogin();
      return;
    }

    let resp = await fetchJson(`${API_BASE}/api/respostas/estatisticas/${encodeURIComponent(userId)}`, {
      method: "GET",
    });

    if (resp.status === 401 || resp.status === 403) {
      redirectToLogin();
      return;
    }

    if (!resp.ok || !resp.json?.success) {
      resp = await fetchJson(`${API_BASE}/api/respostas/estatisticas`, { method: "GET" });

      if (resp.status === 401 || resp.status === 403) {
        redirectToLogin();
        return;
      }
    }

    const dados = resp.json;

    if (dados?.success) {
      dadosDashboard = transformarEstatisticas(dados.estatisticas || {});
      inicializarDashboard();
      return;
    }

    console.error("[dashboard] Erro ao carregar estatísticas:", dados?.error || "Resposta inválida");
    dadosDashboard = gerarDadosExemplo();
    inicializarDashboard();
  } catch (erro) {
    console.error("[dashboard] Erro ao carregar dados:", erro);
    dadosDashboard = gerarDadosExemplo();
    inicializarDashboard();
  }
}

// ========== ATUALIZAR INFO DO USUÁRIO ==========

function atualizarInfoUsuario(usuario) {
  const avatarUsuario = document.getElementById("avatarUsuario");
  const nomeUsuario = document.getElementById("nomeUsuario");
  const emailUsuario = document.getElementById("emailUsuario");

  if (avatarUsuario) avatarUsuario.textContent = usuario.nome?.charAt(0)?.toUpperCase() || "U";
  if (nomeUsuario) nomeUsuario.textContent = usuario.nome || "Usuário";
  if (emailUsuario) emailUsuario.textContent = usuario.email || "";
}

// ========== TRANSFORMAR ESTATÍSTICAS ==========

function transformarEstatisticas(stats) {
  const materias = ["matematica", "linguagens", "ciencias-humanas", "ciencias-natureza"];
  const nomesMateriasMap = {
    matematica: "Matemática",
    linguagens: "Linguagens",
    "ciencias-humanas": "Ciências Humanas",
    "ciencias-natureza": "Ciências da Natureza",
  };

  const cores = ["#8b5cf6", "#3b82f6", "#ec4899", "#10b981"];

  const totalQuestoes = Number(stats.total_questoes || 0);
  const acertos = Number(stats.acertos || 0);
  const taxaAcerto = Number(stats.taxa_acerto || 0);
  const tempoMedio = Number(stats.tempo_medio || 0);
  void acertos;
  void tempoMedio;

  const metricas = [
    {
      rotulo: "Questões Resolvidas",
      valor: String(totalQuestoes),
      mudanca: `+15% desde o mês passado`,
      fundoIcone: "#f3f4f6",
      corIcone: "#1a1a1a",
      tipoIcone: "grafico",
    },
    {
      rotulo: "Taxa de Acerto",
      valor: `${taxaAcerto}%`,
      mudanca: `+5% desde a semana passada`,
      fundoIcone: "#dbeafe",
      corIcone: "#3b82f6",
      tipoIcone: "alvo",
    },
    {
      rotulo: "Sequência Atual",
      valor: `${Math.ceil(totalQuestoes / 100)} dias`,
      mudanca: "Estudando consecutivamente",
      fundoIcone: "#fef3c7",
      corIcone: "#f59e0b",
      tipoIcone: "tendencia",
    },
  ];

  const materiasPrioritarias = Object.keys(stats.por_materia || {})
    .map((materia) => {
      const dados = stats.por_materia[materia];
      const total = Number(dados?.total || 0);
      const ac = Number(dados?.acertos || 0);
      const taxa = total > 0 ? Math.round((ac / total) * 100) : 0;
      return { nome: nomesMateriasMap[materia] || materia, taxa };
    })
    .sort((a, b) => a.taxa - b.taxa)
    .slice(0, 2)
    .map((m) => ({
      nome: m.nome,
      prioridade: m.taxa < 50 ? "Alta" : "Média",
    }));

  if (materiasPrioritarias.length > 0) {
    metricas.push({
      rotulo: "Matérias Prioritárias",
      ehPrioridade: true,
      materias: materiasPrioritarias,
      fundoIcone: "#fee2e2",
      corIcone: "#dc2626",
      tipoIcone: "info",
    });
  }

  const ORDEM_FIXA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  function normalizarDia(dia) {
    const s = String(dia || "").trim().toLowerCase();
    if (s.startsWith("seg")) return "Seg";
    if (s.startsWith("ter")) return "Ter";
    if (s.startsWith("qua")) return "Qua";
    if (s.startsWith("qui")) return "Qui";
    if (s.startsWith("sex")) return "Sex";
    if (s.startsWith("sáb") || s.startsWith("sab")) return "Sáb";
    if (s.startsWith("dom")) return "Dom";
    return null;
  }

  const mapa = {};
  for (const d of stats.ultimos_7_dias || []) {
    const k = normalizarDia(d.dia);
    if (!k) continue;
    mapa[k] = Number(d.questoes || 0);
  }

  const atividadeSemanal = {
    rotulos: ORDEM_FIXA,
    dados: ORDEM_FIXA.map((dia) => mapa[dia] ?? 0),
  };


  const desempenhoPorMateria = {
    rotulos: materias.map((m) => nomesMateriasMap[m]),
    dados: materias.map((materia) => {
      const dados = stats.por_materia?.[materia];
      const total = Number(dados?.total || 0);
      const ac = Number(dados?.acertos || 0);
      if (!total) return 0;
      return Math.round((ac / total) * 100);
    }),
    cores,
  };

  const progressoPorMateria = materias.map((materia) => {
    const dados = stats.por_materia?.[materia];
    const total = Number(dados?.total || 0);
    const ac = Number(dados?.acertos || 0);
    const progresso = total > 0 ? Math.round((ac / total) * 100) : 0;
    return { materia: nomesMateriasMap[materia], progresso };
  });

  return { metricas, atividadeSemanal, desempenhoPorMateria, progressoPorMateria };
}

function gerarDadosExemplo() {
  return {
    metricas: [
      {
        rotulo: "Questões Resolvidas",
        valor: "1,247",
        mudanca: "+15% desde o mês passado",
        fundoIcone: "#f3f4f6",
        corIcone: "#1a1a1a",
        tipoIcone: "grafico",
      },
      {
        rotulo: "Taxa de Acerto",
        valor: "73%",
        mudanca: "+5% desde a semana passada",
        fundoIcone: "#dbeafe",
        corIcone: "#3b82f6",
        tipoIcone: "alvo",
      },
      {
        rotulo: "Sequência Atual",
        valor: "12 dias",
        mudanca: "Estudando consecutivamente",
        fundoIcone: "#fef3c7",
        corIcone: "#f59e0b",
        tipoIcone: "tendencia",
      },
      {
        rotulo: "Matérias Prioritárias",
        ehPrioridade: true,
        materias: [
          { nome: "Ciências da Natureza", prioridade: "Alta" },
          { nome: "Matemática", prioridade: "Média" },
        ],
        fundoIcone: "#fee2e2",
        corIcone: "#dc2626",
        tipoIcone: "info",
      },
    ],
    atividadeSemanal: {
      rotulos: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
      dados: [12, 19, 8, 15, 22, 18, 10],
    },
    desempenhoPorMateria: {
      rotulos: ["Linguagens", "Matemática", "Ciências da Natureza", "Ciências Humanas", "Redação"],
      dados: [85, 75, 70, 80, 78],
      cores: ["#8b5cf6", "#3b82f6", "#f59e0b", "#10b981", "#ec4899"],
    },
    progressoPorMateria: [
      { materia: "Matemática", progresso: 75 },
      { materia: "Linguagens", progresso: 85 },
      { materia: "Ciências da Natureza", progresso: 70 },
    ],
  };
}

// ========== RENDERIZAÇÃO ==========

function inicializarDashboard() {
  renderizarCardsMetricas();
  renderizarBarrasProgresso();
  renderizarGraficos();
  inicializarMenuUsuario();
}

function renderizarCardsMetricas() {
  const gradeMetricas = document.getElementById("gradeMetricas");
  if (!gradeMetricas || !dadosDashboard) return;

  gradeMetricas.innerHTML = dadosDashboard.metricas
    .map((metrica) => {
      if (metrica.ehPrioridade) {
        return `
          <div class="card-metrica">
            <div class="cabecalho-card-metrica">
              <div class="conteudo-metrica">
                <div class="rotulo-metrica">${metrica.rotulo}</div>
              </div>
              <div class="icone-metrica" style="background: ${metrica.fundoIcone}; color: ${metrica.corIcone}">
                ${icones[metrica.tipoIcone]}
              </div>
            </div>
            <ul class="materias-prioritarias">
              ${metrica.materias
            .map(
              (m) => `
                <li>
                  <span>${m.nome}</span>
                  <span class="emblema-prioridade ${m.prioridade === "Alta" ? "emblema-alta" : "emblema-media"}">
                    ${m.prioridade}
                  </span>
                </li>
              `
            )
            .join("")}
            </ul>
          </div>
        `;
      }

      return `
        <div class="card-metrica">
          <div class="cabecalho-card-metrica">
            <div class="conteudo-metrica">
              <div class="rotulo-metrica">${metrica.rotulo}</div>
              <div class="valor-metrica">${metrica.valor}</div>
              <div class="mudanca-metrica">${metrica.mudanca}</div>
            </div>
            <div class="icone-metrica" style="background: ${metrica.fundoIcone}; color: ${metrica.corIcone}">
              ${icones[metrica.tipoIcone]}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderizarBarrasProgresso() {
  const container = document.getElementById("barrasProgresso");
  if (!container || !dadosDashboard) return;

  container.innerHTML = dadosDashboard.progressoPorMateria
    .map(
      (item) => `
    <div class="item-progresso">
      <div class="cabecalho-progresso">
        <span class="rotulo-progresso">${item.materia}</span>
        <span class="porcentagem-progresso">${item.progresso}%</span>
      </div>
      <div class="container-barra-progresso">
        <div class="preenchimento-barra-progresso" style="width: ${item.progresso}%; background-color: #1a1a1a;"></div>
      </div>
    </div>
  `
    )
    .join("");
}

function renderizarGraficos() {
  renderizarGraficoAtividadeSemanal();
  renderizarGraficoDesempenho();
}

function renderizarGraficoAtividadeSemanal() {
  const ctx = document.getElementById("graficoAtividadeSemanal");
  if (!ctx || !dadosDashboard) return;

  const Chart = window.Chart;
  if (!Chart) {
    console.error("[dashboard] Chart.js não encontrado. Inclua Chart.js antes do dashboard.js");
    return;
  }

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: dadosDashboard.atividadeSemanal.rotulos,
      datasets: [
        {
          label: "Questões Resolvidas",
          data: dadosDashboard.atividadeSemanal.dados,
          backgroundColor: "#8b5cf6",
          borderRadius: 6,
          barThickness: 40,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "white",
          titleColor: "#1a1a1a",
          bodyColor: "#737373",
          borderColor: "#e5e5e5",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `${context.parsed.y} questões`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: "#737373", font: { size: 12 } },
          grid: { color: "#f5f5f5", drawBorder: false },
        },
        x: {
          ticks: { color: "#737373", font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  });
}



function renderizarGraficoDesempenho() {
  const ctx = document.getElementById("graficoDesempenho");
  if (!ctx || !dadosDashboard) return;

  const Chart = window.Chart;
  if (!Chart) {
    console.error("[dashboard] Chart.js não encontrado. Inclua Chart.js antes do dashboard.js");
    return;
  }

  const coresModernas = [
    "#6366F1",
    "#EC4899",
    "#8B5CF6",
    "#06B6D4",
    "#F59E0B",
    "#10B981",
  ];

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: dadosDashboard.desempenhoPorMateria.rotulos,
      datasets: [
        {
          data: dadosDashboard.desempenhoPorMateria.dados,
          backgroundColor: coresModernas.slice(0, dadosDashboard.desempenhoPorMateria.dados.length),
          borderColor: "#ffffff",
          borderWidth: 0.5,
          spacing: 2,
          hoverOffset: 1,
          hoverBorderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1200,
        easing: "easeInOutQuart",
      },
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "#1f2937",
            font: {
              size: 13,
              weight: "500",
              family: "'Inter', 'Segoe UI', sans-serif",
            },
            padding: 18,
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 12,
            boxHeight: 12,
            generateLabels: (chart) => {
              const data = chart.data;
              if (data.labels && data.labels.length && data.datasets && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const value = data.datasets[0].data[i];
                  return {
                    text: `${label}: ${value}%`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    hidden: false,
                    index: i,
                    fontColor: "#1f2937",
                  };
                });
              }
              return [];
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          titleColor: "#ffffff",
          bodyColor: "#e5e7eb",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          padding: 16,
          displayColors: true,
          cornerRadius: 12,
          boxPadding: 6,
          usePointStyle: true,
          titleFont: {
            size: 14,
            weight: "600",
            family: "'Inter', 'Segoe UI', sans-serif",
          },
          bodyFont: {
            size: 13,
            weight: "500",
            family: "'Inter', 'Segoe UI', sans-serif",
          },
          callbacks: {
            label: (context) => ` ${context.label}: ${context.parsed}%`,
            afterLabel: (context) => {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `Proporção: ${percentage}% do total`;
            },
          },
        },
      },
      cutout: "0%",
    },
  });
}


// ========== MENU DO USUÁRIO ==========

function inicializarMenuUsuario() {
  const avatarUsuario = document.getElementById("avatarUsuario");
  const menuUsuario = document.getElementById("menuUsuario");
  const btnSair = document.getElementById("btnSair");

  if (!avatarUsuario || !menuUsuario) return;

  avatarUsuario.addEventListener("click", (evento) => {
    evento.stopPropagation();
    menuUsuario.classList.toggle("ativo");
  });

  document.addEventListener("click", (evento) => {
    if (!menuUsuario.contains(evento.target) && !avatarUsuario.contains(evento.target)) {
      menuUsuario.classList.remove("ativo");
    }
  });

  menuUsuario.addEventListener("click", (evento) => {
    evento.stopPropagation();
  });

  if (btnSair) {
    btnSair.addEventListener("click", async (evento) => {
      evento.preventDefault();

      try {
        await fetchJson(`${API_BASE}/api/auth/logout`, { method: "POST" });
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user_data");
        redirectToLogin();
      } catch (erro) {
        console.error("[dashboard] Erro ao fazer logout:", erro);
        redirectToLogin();
      }
    });
  }
}

// ========== INICIALIZAÇÃO ==========

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", carregarDados);
} else {
  carregarDados();
}
