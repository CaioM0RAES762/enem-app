(() => {
  "use strict";

  const API_PORT = 3000;

  function getApiCandidates() {
    const host = window.location.hostname;
    const primary = `http://${host}:${API_PORT}`;
    const fallbackHost = host === "localhost" ? "127.0.0.1" : "localhost";
    const fallback = `http://${fallbackHost}:${API_PORT}`;
    return primary === fallback ? [primary] : [primary, fallback];
  }

  let API_BASE = getApiCandidates()[0];
  let API_RESULTADOS = `${API_BASE}/api/resultados`;
  let API_AUTH_ME = `${API_BASE}/api/auth/me`;
  let API_AUTH_LOGOUT = `${API_BASE}/api/auth/logout`;

  function setApiBase(base) {
    API_BASE = base;
    API_RESULTADOS = `${API_BASE}/api/resultados`;
    API_AUTH_ME = `${API_BASE}/api/auth/me`;
    API_AUTH_LOGOUT = `${API_BASE}/api/auth/logout`;
    console.log("[resultados] API_BASE definido como:", API_BASE);
  }

  const LS_TOKEN_KEYS = ["auth_token", "authToken"];
  const LS_USER_KEYS = ["userData", "user_data"];

  function getAuthToken() {
    for (const k of LS_TOKEN_KEYS) {
      const t = localStorage.getItem(k);
      if (t) return t;
    }
    return "";
  }

  function safeJsonParse(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function normalizeUser(u) {
    if (!u) return null;
    const id = u.id ?? u.usuario_id ?? u.userId ?? u._id ?? u.uid ?? null;
    if (!id) return null;
    return {
      ...u,
      id,
      nome: u.nome ?? u.name ?? "",
      email: u.email ?? "",
    };
  }

  function readUserFromLocalStorage() {
    for (const key of LS_USER_KEYS) {
      const raw = localStorage.getItem(key);
      const parsed = safeJsonParse(raw);
      if (!parsed) continue;

      const u = parsed.user || parsed.usuario || parsed;
      const norm = normalizeUser(u);
      if (norm?.id) return norm;
    }
    return null;
  }

  function writeUserToLocalStorage(user) {
    const norm = normalizeUser(user);
    if (!norm) return;

    const payload = {
      success: true,
      user: { id: norm.id, nome: norm.nome, email: norm.email, tipo: norm.tipo },
    };

    for (const key of LS_USER_KEYS) {
      localStorage.setItem(key, JSON.stringify(payload));
    }
  }

  async function fetchJson(url, options = {}) {
    const token = getAuthToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const resp = await fetch(url, {
      method: options.method || "GET",
      credentials: "include",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { success: false, error: text };
    }

    return { ok: resp.ok, status: resp.status, json };
  }

  async function fetchMeTryAllHosts() {
    const token = getAuthToken();
    const candidates = getApiCandidates();

    for (const base of candidates) {
      try {
        const res = await fetch(`${base}/api/auth/me`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) continue;

        const data = await res.json();
        const user = normalizeUser(data?.user || data?.usuario || data);

        if (user?.id) {
          setApiBase(base);
          writeUserToLocalStorage(user);
          return user;
        }
      } catch {
      }
    }
    return null;
  }

  async function requireAuthOrRedirect() {
    const me = await fetchMeTryAllHosts();
    if (me?.id) return me;

    const local = readUserFromLocalStorage();
    if (local?.id) return local;

    console.error("[resultados] Não autenticado — redirecionando login.");
    window.location.href = "./login.html";
    return null;
  }

  async function logout() {
    try {
      await fetchJson(API_AUTH_LOGOUT, { method: "POST" });
    } catch {
    }
    for (const k of LS_TOKEN_KEYS) localStorage.removeItem(k);
    for (const k of LS_USER_KEYS) localStorage.removeItem(k);
    window.location.href = "./login.html";
  }

  // ==================
  // 2) PERÍODO
  // ==================
  function getSelectedPeriodRaw() {
    const el = document.getElementById("periodFilter");
    return (el?.value || "30").toString();
  }

  function normalizePeriodValue(raw) {
    const s = String(raw || "").trim().toUpperCase();

    if (/^\d+$/.test(s)) return Number(s);

    const map = {
      ULT_7_DIAS: 7,
      ULT_15_DIAS: 15,
      ULT_30_DIAS: 30,
      ULT_60_DIAS: 60,
      ULT_90_DIAS: 90,
      "7_DIAS": 7,
      "15_DIAS": 15,
      "30_DIAS": 30,
      "60_DIAS": 60,
      "90_DIAS": 90,
    };

    if (map[s]) return map[s];

    const m = s.match(/(\d{1,3})/);
    if (m) return Number(m[1]);

    return 30;
  }

  function getPeriodoParam() {
    return normalizePeriodValue(getSelectedPeriodRaw());
  }

  function withPeriod(url) {
    const periodo = getPeriodoParam();
    const hasQuery = url.includes("?");
    return `${url}${hasQuery ? "&" : "?"}periodo=${encodeURIComponent(periodo)}`;
  }

  // ==========================================================
  // 3) API GET (resultados)
  // ==========================================================
  async function apiGet(path, userId) {
    const token = getAuthToken();
    const url = path.startsWith("http") ? path : `${API_RESULTADOS}${path}`;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "X-User-ID": String(userId) } : {}),
    };

    const resp = await fetch(url, { method: "GET", credentials: "include", headers });

    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { success: false, error: text };
    }

    return { ok: resp.ok, status: resp.status, json };
  }

  async function fetchDadosGerais(usuario_id) {
    const r = await apiGet(withPeriod(`/geral/${encodeURIComponent(usuario_id)}`), usuario_id);
    if (!r.ok) {
      console.error("[resultados] geral erro:", r.status, r.json);
      return null;
    }
    return r.json?.success ? r.json.dados : null;
  }

  async function fetchDesempenho(usuario_id) {
    const r = await apiGet(withPeriod(`/desempenho/${encodeURIComponent(usuario_id)}`), usuario_id);
    if (!r.ok) {
      console.error("[resultados] desempenho erro:", r.status, r.json);
      return null;
    }
    return r.json?.success ? r.json : null;
  }

  async function fetchAtividade(usuario_id) {
    const r = await apiGet(withPeriod(`/atividade/${encodeURIComponent(usuario_id)}`), usuario_id);
    if (!r.ok) {
      console.error("[resultados] atividade erro:", r.status, r.json);
      return null;
    }
    return r.json?.success ? r.json : null;
  }
  function unwrapPossibleData(payload) {
    if (!payload || typeof payload !== "object") return payload;
    return (
      payload.data ||
      payload.dados ||
      payload.result ||
      payload.results ||
      payload.payload ||
      payload.response ||
      payload
    );
  }

  function pickFirstArray(obj) {
    if (!obj || typeof obj !== "object") return null;

    const candidates = [
      obj.historico,
      obj.historicoSimulados,
      obj.simulados,
      obj.respostas,
      obj.items,
      obj.rows,
      obj.lista,
      obj.registros,
      obj.data,
    ];

    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }

    const innerCandidates = [
      obj.historico?.items,
      obj.historico?.rows,
      obj.historico?.data,
      obj.dados?.items,
      obj.dados?.rows,
      obj.data?.items,
      obj.data?.rows,
      obj.result?.items,
      obj.result?.rows,
    ];

    for (const c of innerCandidates) {
      if (Array.isArray(c)) return c;
    }

    return null;
  }

  async function fetchHistorico(usuario_id) {
    const r = await apiGet(withPeriod(`/historico/${encodeURIComponent(usuario_id)}`), usuario_id);

    if (!r.ok) {
      console.error("[resultados] historico erro:", r.status, r.json);
      return [];
    }

    const raw = r.json;
    const unwrapped = unwrapPossibleData(raw);

    const lista =
      pickFirstArray(raw) ||
      pickFirstArray(unwrapped) ||
      (Array.isArray(unwrapped) ? unwrapped : []) ||
      [];

    console.log("[resultados] historico bruto:", raw);
    console.log("[resultados] historico unwrapped:", unwrapped);
    console.log("[resultados] historico lista (tamanho):", lista.length);
    if (lista.length > 0) console.log("[resultados] historico exemplo item:", lista[0]);

    return lista;
  }

  async function fetchRedacoesUsuario(usuario_id) {
    try {
      const token = getAuthToken();
      const url = `${API_BASE}/api/redacoes/usuario/${encodeURIComponent(usuario_id)}`;

      const resp = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-User-ID": String(usuario_id),
        },
      });

      const text = await resp.text();
      const json = safeJsonParse(text) ?? { success: false, error: text };
      if (!resp.ok) {
        console.warn("[resultados] fetchRedacoesUsuario erro:", resp.status, json);
        return [];
      }

      const lista =
        (json?.data?.redacoes && Array.isArray(json.data.redacoes) ? json.data.redacoes : null) ||
        (json?.redacoes && Array.isArray(json.redacoes) ? json.redacoes : null) ||
        (Array.isArray(json) ? json : []);

      return lista;
    } catch (e) {
      console.warn("[resultados] fetchRedacoesUsuario exception:", e);
      return [];
    }
  }

  function normalizarHistoricoSimulados(historico) {
    return (historico || []).map((h) => {
      const data =
        h.data ||
        h.data_realizacao ||
        h.dataRealizacao ||
        h.data_inicio ||
        h.dataInicio ||
        h.data_fim ||
        h.dataFim ||
        h.finalizado_em ||
        h.finalizadoEm ||
        h.respondido_em ||
        h.respondidoEm ||
        h.created_at ||
        h.createdAt ||
        h.updated_at ||
        h.updatedAt ||
        h.criado_em ||
        h.criadoEm ||
        null;

      const materiasRaw =
        h.materias ||
        h.materias_selecionadas ||
        h.areas ||
        h.disciplinas ||
        null;

      const materias = Array.isArray(materiasRaw)
        ? materiasRaw
        : typeof materiasRaw === "string"
          ? materiasRaw.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

      const titulo =
        h.titulo ||
        h.nome ||
        h.nome_simulado ||
        h.nomeSimulado ||
        h.simulado ||
        (materias.length ? materias.join(", ") : "Simulado");

      const total =
        Number(
          h.total_questoes ??
          h.totalQuestoes ??
          h.questoes_total ??
          h.questoesTotal ??
          h.total ??
          h.qtd_questoes ??
          h.qtdQuestoes ??
          (Array.isArray(h.questoes) ? h.questoes.length : 0) ??
          0
        ) || 0;

      const acertos =
        Number(
          h.acertos ??
          h.qt_acertos ??
          h.qtd_acertos ??
          h.corretas ??
          h.qtdCorretas ??
          h.total_acertos ??
          h.totalAcertos ??
          0
        ) || 0;

      let taxa =
        Number(
          h.taxa_acerto ??
          h.taxaAcerto ??
          h.percentual ??
          h.percentual_acerto ??
          h.percentualAcerto ??
          h.score ??
          h.nota_percentual ??
          0
        ) || 0;

      if (taxa > 0 && taxa <= 1) taxa = taxa * 100;
      if (!taxa && total > 0 && acertos >= 0) taxa = (acertos / total) * 100;

      taxa = Math.max(0, Math.min(100, Number.isFinite(taxa) ? taxa : 0));

      return {
        tipo: "simulado",
        data,
        titulo,
        taxa_acerto: taxa,
        acertos,
        total_questoes: total,
      };
    });
  }

  function normalizarHistoricoRedacoes(redacoes) {
    return (redacoes || []).map((r) => {
      const status = String(r.status || "").toLowerCase().trim();
      const data =
        (status === "corrigida" ? r.corrigido_em : null) ||
        (status === "enviada" ? r.enviado_em : null) ||
        r.criado_em ||
        r.atualizado_em ||
        r.created_at ||
        r.updated_at ||
        null;

      return {
        tipo: "redacao",
        data,
        titulo: r.tema || "Redação",
        status,
        nota_total: r.nota_total ?? null,
      };
    });
  }

  function ordenarEventosPorDataDesc(eventos) {
    return [...eventos].sort((a, b) => {
      const da = new Date(a.data || 0).getTime();
      const db = new Date(b.data || 0).getTime();
      return db - da;
    });
  }

  // ==========================================================
  // 4) HELPERS (format)
  // ==========================================================
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = (text ?? "--");
  }

  function formatNum(num) {
    return Math.round(Number(num) || 0);
  }

  function formatPercent(num) {
    return `${formatNum(num)}%`;
  }

  function calcularNotaEstimada(taxaAcerto) {
    const notaBase = 300;
    const notaMaxima = 1000;
    const taxa = Math.max(0, Math.min(100, Number(taxaAcerto) || 0));
    return Math.round(notaBase + (taxa / 100) * (notaMaxima - notaBase));
  }

  function formatarNomeArea(area) {
    const mapa = {
      matematica: "Matemática",
      linguagens: "Linguagens",
      ciencias_natureza: "Ciências da Natureza",
      ciencias_humanas: "Ciências Humanas",
      redacao: "Redação",
      "ciencias-natureza": "Ciências da Natureza",
      "ciencias-humanas": "Ciências Humanas",
    };
    const a = String(area || "").trim();
    if (!a) return "";
    return mapa[a] || a.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }

  function formatarDiaSemana(dia) {
    const mapa = {
      seg: "Segunda-feira",
      ter: "Terça-feira",
      qua: "Quarta-feira",
      qui: "Quinta-feira",
      sex: "Sexta-feira",
      sab: "Sábado",
      dom: "Domingo",
      Segunda: "Segunda-feira",
      Terça: "Terça-feira",
      Quarta: "Quarta-feira",
      Quinta: "Quinta-feira",
      Sexta: "Sexta-feira",
      Sábado: "Sábado",
      Domingo: "Domingo",
    };
    return mapa[dia] || dia;
  }

  function atualizarTopoUsuario(user) {
    if (!user) return;

    const nome = user.nome || "Usuário";
    const email = user.email || "";

    // avatar
    const avatarEl = document.getElementById("avatarUsuario");
    if (avatarEl) {
      const base = (nome || email || "U").trim();
      const initial = base ? base[0].toUpperCase() : "U";
      avatarEl.textContent = initial;
    }

    // nome/email dentro do dropdown
    const menuUsuario = document.getElementById("menuUsuario");
    if (menuUsuario) {
      const nomeEl = menuUsuario.querySelector(".nome-usuario");
      const emailEl = menuUsuario.querySelector(".email-usuario");
      if (nomeEl) nomeEl.textContent = nome;
      if (emailEl) emailEl.textContent = email;
    }
  }

  // ==========================================================
  // 5) RENDER (cards + listas)
  // ==========================================================
  function atualizarDadosGerais(dados) {
    if (!dados) return;

    setText("taxaAcerto", formatPercent(dados.taxaAcerto));

    const deltaAcerto = Number(dados.evolucao?.deltaAcerto || 0);
    const deltaAcertoEl = document.getElementById("deltaAcerto");
    if (deltaAcertoEl) {
      const sinal = deltaAcerto > 0 ? "+" : "";
      deltaAcertoEl.textContent = `${sinal}${deltaAcerto.toFixed(1)}% desde o último período`;
      deltaAcertoEl.style.color = deltaAcerto >= 0 ? "#22c55e" : "#ef4444";
    }

    setText("questoesResolvidas", dados.questoesResolvidas);

    const deltaQuestoes = Number(dados.evolucao?.deltaQuestoes || 0);
    const deltaQuestoesEl = document.getElementById("deltaQuestoes");
    if (deltaQuestoesEl) {
      const sinal = deltaQuestoes > 0 ? "+" : "";
      deltaQuestoesEl.textContent = `${sinal}${deltaQuestoes} neste período`;
      deltaQuestoesEl.style.color = deltaQuestoes >= 0 ? "#22c55e" : "#ef4444";
    }

    setText("tempoEstudo", `${dados.tempoEstudo}h`);
    setText("tempoDescricao", `Aproximadamente ${dados.tempoEstudo} horas de prática`);

    const notaEstimada = dados.notaEstimada || calcularNotaEstimada(dados.taxaAcerto);
    setText("notaEstimada", notaEstimada);
    setText("notaObs", "Projeção ENEM");
  }

  function atualizarDesempenho(dados) {
    if (!dados) return;

    const listaMelhores = document.getElementById("listaMelhores");
    if (listaMelhores && Array.isArray(dados.melhores)) {
      const title = listaMelhores.querySelector(".performance-list-title");
      listaMelhores.innerHTML = "";
      if (title) listaMelhores.appendChild(title.cloneNode(true));

      dados.melhores.slice(0, 5).forEach((item) => {
        const div = document.createElement("div");
        div.className = "performance-item";
        div.innerHTML = `
          <div class="performance-name">${formatarNomeArea(item.materia || item.area)}</div>
          <div class="performance-value value-green">${formatNum(item.taxa_acerto)}%</div>
        `;
        listaMelhores.appendChild(div);
      });
    }

    const listaPiores = document.getElementById("listaPiores");
    if (listaPiores && Array.isArray(dados.piores)) {
      const title = listaPiores.querySelector(".performance-list-title");
      listaPiores.innerHTML = "";
      if (title) listaPiores.appendChild(title.cloneNode(true));

      dados.piores.slice(0, 5).forEach((item) => {
        const div = document.createElement("div");
        div.className = "performance-item";
        div.innerHTML = `
          <div class="performance-name">${formatarNomeArea(item.materia || item.area)}</div>
          <div class="performance-value value-orange">${formatNum(item.taxa_acerto)}%</div>
        `;
        listaPiores.appendChild(div);
      });
    }

    prepararGraficoLinha(dados.evolucao_diaria || []);
  }

  function atualizarAtividade(dados) {
    if (!dados) {
      setText("mediaQuestoes", `0 questões`);
      setText("mediaMinutos", `0 minutos por dia`);
      setText("melhorDiaSemana", "--");
      setText("melhorDiaDesc", `0 questões`);
      setText("sequenciaDias", `0 dias`);
      window.chartStore = window.chartStore || {};
      window.chartStore.bar = { q: [0, 0, 0, 0, 0, 0, 0], t: [0, 0, 0, 0, 0, 0, 0] };
      return;
    }

    setText("mediaQuestoes", `${dados.mediaQuestoesDia || 0} questões`);
    setText("mediaMinutos", `${dados.mediaMinutosDia || 0} minutos por dia`);
    setText("melhorDiaSemana", formatarDiaSemana(dados.melhorDia || "--"));
    setText("melhorDiaDesc", `${dados.melhorDiaQuestoes || 0} questões`);
    setText("sequenciaDias", `${dados.sequenciaDias || 0} dias`);

    if (Array.isArray(dados.atividade_semanal)) {
      prepararGraficoBarra(dados.atividade_semanal);
    } else {
      window.chartStore = window.chartStore || {};
      window.chartStore.bar = { q: [0, 0, 0, 0, 0, 0, 0], t: [0, 0, 0, 0, 0, 0, 0] };
    }
  }

  function renderHistorico(listaEventos) {
    const container = document.getElementById("listaHistorico");
    if (!container) return;

    container.innerHTML = "";

    if (!listaEventos || listaEventos.length === 0) {
      container.innerHTML =
        '<div style="padding:20px;text-align:center;color:#737373">Nenhum histórico encontrado.</div>';
      return;
    }

    listaEventos.forEach((item) => {
      const date = item.data ? new Date(item.data) : null;
      const dateStr = date && !isNaN(date.getTime()) ? date.toLocaleDateString("pt-BR") : "--";

      const div = document.createElement("div");
      div.className = "history-item";

      if (item.tipo === "redacao") {
        const st = String(item.status || "").toLowerCase();
        const badge =
          st === "corrigida"
            ? `<span class="history-badge badge-ok">✅ Redação corrigida</span>`
            : st === "enviada"
              ? `<span class="history-badge badge-medio">⏳ Redação enviada</span>`
              : `<span class="history-badge badge-medio">📝 Redação</span>`;

        const nota = st === "corrigida" ? (item.nota_total ?? "—") : "—";

        div.innerHTML = `
          <div class="history-info">
            <div class="history-title">${item.titulo || "Redação"}</div>
            <div class="history-meta">
              ${dateStr}
              ${badge}
            </div>
          </div>
          <div class="history-result">
            <div class="history-percentage">${nota}</div>
            <div class="history-fraction">nota</div>
          </div>
        `;
      } else {
        div.innerHTML = `
          <div class="history-info">
            <div class="history-title">${item.titulo || "Simulado"}</div>
            <div class="history-meta">
              ${dateStr}
              <span class="history-badge badge-medio">📚 Simulado</span>
            </div>
          </div>
          <div class="history-result">
            <div class="history-percentage">${formatNum(item.taxa_acerto)}%</div>
            <div class="history-fraction">${item.acertos}/${item.total_questoes}</div>
          </div>
        `;
      }

      container.appendChild(div);
    });
  }

  // ==========================================================
  // 6) PREPARAÇÃO DOS GRÁFICOS
  // ==========================================================
  function prepararGraficoLinha(desempenhoArray) {
    const datasets = [
      { name: "Matemática", color: "#3b82f6", data: [] },
      { name: "Linguagens", color: "#22c55e", data: [] },
      { name: "Ciências da Natureza", color: "#f59e0b", data: [] },
      { name: "Ciências Humanas", color: "#ef4444", data: [] },
      { name: "Redação", color: "#8b5cf6", data: [] },
    ];

    const days = 7;

    function pad2(n) { return String(n).padStart(2, "0"); }

    function toKey(dt) {
      if (!(dt instanceof Date) || isNaN(dt.getTime())) return null;
      dt.setHours(0, 0, 0, 0);
      return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    }

    function parseLocalDate(value) {
      if (value === null || value === undefined || value === "") return null;

      if (value instanceof Date && !isNaN(value.getTime())) return new Date(value);

      if (typeof value === "number") {
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? null : dt;
      }

      if (typeof value === "string") {
        const s = value.trim();

        const ymdExact = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymdExact) {
          const y = Number(ymdExact[1]);
          const m = Number(ymdExact[2]) - 1;
          const d = Number(ymdExact[3]);
          const dt = new Date(y, m, d);
          return isNaN(dt.getTime()) ? null : dt;
        }

        const ymdPrefix = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (ymdPrefix) {
          const y = Number(ymdPrefix[1]);
          const m = Number(ymdPrefix[2]) - 1;
          const d = Number(ymdPrefix[3]);
          const dt = new Date(y, m, d);
          return isNaN(dt.getTime()) ? null : dt;
        }

        const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (br) {
          const dt = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
          return isNaN(dt.getTime()) ? null : dt;
        }

        const dt = new Date(s);
        return isNaN(dt.getTime()) ? null : dt;
      }

      return null;
    }

    function keyFromWeekdayIndex(diaIdx0a6, anchorDate) {
      const i = Number(diaIdx0a6);
      if (!Number.isFinite(i) || i < 0 || i > 6) return null;

      const base = anchorDate instanceof Date ? new Date(anchorDate) : new Date();
      base.setHours(0, 0, 0, 0);

      const baseIdx = (base.getDay() + 6) % 7;

      const dt = new Date(base);
      dt.setDate(base.getDate() - (baseIdx - i));
      return toKey(dt);
    }

    function getRowDateKey(row, anchorDate) {
      const dt =
        parseLocalDate(row.data) ||
        parseLocalDate(row.date) ||
        parseLocalDate(row.created_at) ||
        parseLocalDate(row.updated_at) ||
        parseLocalDate(row.timestamp) ||
        parseLocalDate(row.at) ||
        parseLocalDate(row.dia);

      if (dt) return toKey(dt);

      if (row && row.dia !== undefined && row.dia !== null) {
        return keyFromWeekdayIndex(row.dia, anchorDate);
      }

      return null;
    }

    function getTaxa(row) {
      const raw =
        row.taxa_acerto ??
        row.percentual ??
        row.percentual_acerto ??
        row.taxa ??
        row.valor ??
        0;

      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;

      if (n > 0 && n <= 1) return Math.round(n * 100);

      return Math.max(0, Math.min(100, Math.round(n)));
    }

    const parsedDates = [];
    (desempenhoArray || []).forEach((row) => {
      const dt =
        parseLocalDate(row.data) ||
        parseLocalDate(row.date) ||
        parseLocalDate(row.created_at) ||
        parseLocalDate(row.updated_at) ||
        parseLocalDate(row.timestamp) ||
        parseLocalDate(row.at) ||
        parseLocalDate(row.dia);
      if (dt) parsedDates.push(new Date(dt));
    });

    let anchor = new Date();
    anchor.setHours(0, 0, 0, 0);

    if (parsedDates.length > 0) {
      const maxDt = parsedDates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
      anchor = new Date(maxDt);
      anchor.setHours(0, 0, 0, 0);
    }

    const dateKeys = [];
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(anchor);
      dt.setDate(anchor.getDate() - i);

      const y = dt.getFullYear();
      const m = pad2(dt.getMonth() + 1);
      const d = pad2(dt.getDate());

      dateKeys.push(`${y}-${m}-${d}`);
      dates.push(`${d}/${m}`);
    }

    const porDia = new Map();

    (desempenhoArray || []).forEach((row) => {
      const materia = formatarNomeArea(row.materia || row.area);
      if (!materia) return;

      const key = getRowDateKey(row, anchor);
      if (!key) return;

      if (!dateKeys.includes(key)) return;

      const taxa = getTaxa(row);

      if (!porDia.has(key)) porDia.set(key, new Map());
      porDia.get(key).set(materia, taxa);
    });

    datasets.forEach((ds) => {
      let lastValue = 0;
      ds.data = [];
      dateKeys.forEach((k) => {
        const diaMap = porDia.get(k);
        if (diaMap && diaMap.has(ds.name)) lastValue = Number(diaMap.get(ds.name) || 0);
        ds.data.push(lastValue);
      });
    });

    window.chartStore = window.chartStore || {};
    window.chartStore.line = { dates, datasets };
  }

  function prepararGraficoBarra(atividadeSemanal) {
    const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const q = Array(7).fill(0);
    const t = Array(7).fill(0);

    const arr = Array.isArray(atividadeSemanal) ? atividadeSemanal : [];

    function toLocalDate(value) {
      if (!value) return null;

      if (value instanceof Date && !isNaN(value.getTime())) return value;

      if (typeof value === "number") {
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? null : dt;
      }

      if (typeof value === "string") {
        const s = value.trim();

        const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymd) {
          const y = Number(ymd[1]);
          const m = Number(ymd[2]) - 1;
          const d = Number(ymd[3]);
          const dt = new Date(y, m, d);
          return isNaN(dt.getTime()) ? null : dt;
        }

        const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (br) {
          const dt = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
          return isNaN(dt.getTime()) ? null : dt;
        }

        const dt = new Date(s);
        return isNaN(dt.getTime()) ? null : dt;
      }

      return null;
    }

    function dowToIdx(jsDow) {
      return (jsDow + 6) % 7;
    }

    let usedDiaIndex = false;

    arr.forEach((a) => {
      const i = Number(a.dia);
      if (Number.isFinite(i) && i >= 0 && i <= 6) {
        q[i] = Number(a.questoes || 0);
        t[i] = Number(a.minutos || 0);
        usedDiaIndex = true;
      }
    });

    if (!usedDiaIndex) {
      arr.forEach((a) => {
        const dt =
          toLocalDate(a.data) ||
          toLocalDate(a.date) ||
          toLocalDate(a.created_at) ||
          toLocalDate(a.updated_at) ||
          toLocalDate(a.timestamp) ||
          toLocalDate(a.at);

        if (!dt) return;

        const idx = dowToIdx(dt.getDay());
        q[idx] = Number(a.questoes || 0);
        t[idx] = Number(a.minutos || 0);
      });
    }

    window.chartStore = window.chartStore || {};
    window.chartStore.bar = { labels, q, t };
  }

  // ==========================================================
  // 7) CANVAS (Radar / Line / Bar)
  // ==========================================================
  function drawRadarChart(currentData, lastMonthData) {
    const canvas = document.getElementById("radarChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const legend = document.getElementById("radarLegend");
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2 + 20;
    const radius = Math.min(centerX, centerY) - 80;
    const labels = ["Matemática", "Linguagens", "Ciências da\nNatureza", "Ciências\nHumanas", "Redação"];

    const current = currentData || [0, 0, 0, 0, 0];
    const previous = lastMonthData || [0, 0, 0, 0, 0];
    const angleStep = (Math.PI * 2) / labels.length;
    let lastHoverIndex = null;

    function getPoint(val, idx) {
      const angle = angleStep * idx - Math.PI / 2;
      const v = (Number(val) || 0) / 100;
      return { x: centerX + Math.cos(angle) * radius * v, y: centerY + Math.sin(angle) * radius * v };
    }

    function drawPolygon(data, fill, stroke) {
      ctx.beginPath();
      data.forEach((v, i) => {
        const p = getPoint(v, i);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function render(hoverIdx = null) {
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = "#e5e5e5";
      ctx.lineWidth = 1;
      for (let l = 1; l <= 4; l++) {
        const r = (radius / 4) * l;
        ctx.beginPath();
        for (let i = 0; i < labels.length; i++) {
          const a = angleStep * i - Math.PI / 2;
          const x = centerX + Math.cos(a) * r;
          const y = centerY + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      for (let i = 0; i < labels.length; i++) {
        const a = angleStep * i - Math.PI / 2;
        const x = centerX + Math.cos(a) * radius;
        const y = centerY + Math.sin(a) * radius;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      if (hoverIdx !== null) {
        const a1 = angleStep * (hoverIdx - 0.5) - Math.PI / 2;
        const a2 = angleStep * (hoverIdx + 0.5) - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, a1, a2);
        ctx.closePath();
        ctx.fillStyle = "rgba(200,200,200,0.06)";
        ctx.fill();
      }

      drawPolygon(previous, "rgba(147,147,255,0.08)", "#c4c4ff");
      drawPolygon(current, "rgba(147,147,255,0.20)", "#8b8bff");

      for (let i = 0; i < labels.length; i++) {
        const p1 = getPoint(previous[i], i);
        const p2 = getPoint(current[i], i);

        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#6ee7b7";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#8b8bff";
        ctx.fill();
      }

      if (hoverIdx !== null) {
        const p = getPoint(current[hoverIdx], hoverIdx);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#e5e5e5";
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = "#737373";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < labels.length; i++) {
        const a = angleStep * i - Math.PI / 2;
        const x = centerX + Math.cos(a) * (radius + 35);
        const y = centerY + Math.sin(a) * (radius + 35);
        const lines = labels[i].split("\n");
        lines.forEach((l, idx) => ctx.fillText(l, x, y + (idx - (lines.length - 1) / 2) * 16));
      }
    }

    render();

    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const dx = mx - centerX;
      const dy = my - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius * 0.25 || dist > radius * 1.1) {
        if (lastHoverIndex !== null) {
          lastHoverIndex = null;
          render();
          if (legend) legend.style.opacity = "0";
        }
        return;
      }

      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      const idx = Math.round(ang / angleStep) % labels.length;

      if (idx !== lastHoverIndex) {
        lastHoverIndex = idx;
        render(idx);
        if (legend) {
          legend.innerHTML = `
            <div class="legend-date">${labels[idx].replace("\n", " ")}</div>
            <div class="legend-item">
              <span class="legend-label">Atual:</span>
              <span class="legend-value" style="color:#8b8bff">${current[idx]}%</span>
            </div>
            <div class="legend-item">
              <span class="legend-label">Anterior:</span>
              <span class="legend-value" style="color:#6ee7b7">${previous[idx]}%</span>
            </div>
          `;
          const p = getPoint(current[idx], idx);
          let l = p.x + 24;
          const tPos = p.y - 40;
          if (l + 200 > rect.width) l = p.x - 200 - 24;
          legend.style.left = `${l}px`;
          legend.style.top = `${tPos}px`;
          legend.style.opacity = "1";
        }
      }
    };

    canvas.onmouseleave = () => {
      lastHoverIndex = null;
      render();
      if (legend) legend.style.opacity = "0";
    };
  }

  function drawLineChart(dates, datasets) {
    const canvas = document.getElementById("lineChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);

    const padding = { top: 30, right: 50, bottom: 50, left: 50 };
    const chartWidth = rect.width - padding.left - padding.right;
    const chartHeight = rect.height - padding.top - padding.bottom;

    if (!dates || dates.length === 0) return;

    const legend = document.getElementById("lineLegend");
    let hoverIndex = null;

    function render() {
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = "#e5e5e5";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
      }

      if (dates.length > 1) {
        dates.forEach((_, i) => {
          const x = padding.left + (chartWidth / (dates.length - 1)) * i;
          ctx.beginPath();
          ctx.moveTo(x, padding.top);
          ctx.lineTo(x, padding.top + chartHeight);
          ctx.stroke();
        });
      }
      ctx.setLineDash([]);

      ctx.fillStyle = "#737373";
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const value = 100 - i * 25;
        const y = padding.top + (chartHeight / 4) * i;
        ctx.fillText(value.toString(), padding.left - 10, y);
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      dates.forEach((date, i) => {
        const xPos = dates.length > 1 ? (chartWidth / (dates.length - 1)) * i : chartWidth / 2;
        const x = padding.left + xPos;
        ctx.fillText(date, x, padding.top + chartHeight + 10);
      });

      datasets.forEach((dataset) => {
        ctx.strokeStyle = dataset.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        dataset.data.forEach((value, i) => {
          const xPos = dates.length > 1 ? (chartWidth / (dates.length - 1)) * i : chartWidth / 2;
          const x = padding.left + xPos;
          const y = padding.top + chartHeight - (value / 100) * chartHeight;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        dataset.data.forEach((value, i) => {
          const xPos = dates.length > 1 ? (chartWidth / (dates.length - 1)) * i : chartWidth / 2;
          const x = padding.left + xPos;
          const y = padding.top + chartHeight - (value / 100) * chartHeight;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = dataset.color;
          ctx.fill();
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      });

      if (hoverIndex !== null && dates.length > 0) {
        const hoverXPos = dates.length > 1 ? (chartWidth / (dates.length - 1)) * hoverIndex : chartWidth / 2;
        const hoverX = padding.left + hoverXPos;

        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hoverX, padding.top);
        ctx.lineTo(hoverX, padding.top + chartHeight);
        ctx.stroke();
      }
    }

    function updateLegend() {
      if (!legend) return;
      if (hoverIndex === null) {
        legend.style.opacity = "0";
        return;
      }

      legend.innerHTML = `<div class="legend-date">${dates[hoverIndex]}</div>`;
      datasets.forEach((dataset) => {
        const currentValue = Math.round(dataset.data[hoverIndex]);
        legend.innerHTML += `
          <div class="legend-item">
            <span class="legend-label" style="color: ${dataset.color};">${dataset.name}</span>
            <span class="legend-value" style="color: ${dataset.color};">: ${currentValue}%</span>
          </div>
        `;
      });

      const step = dates.length > 1 ? chartWidth / (dates.length - 1) : 0;
      const hoverX = padding.left + (step > 0 ? step * hoverIndex : chartWidth / 2);

      const cardWidth = 220;
      let leftPosition = hoverX + 20;
      if (leftPosition + cardWidth > rect.width - padding.right) leftPosition = hoverX - cardWidth - 20;
      legend.style.left = leftPosition + "px";
      legend.style.top = padding.top + 50 + "px";
      legend.style.opacity = "1";
    }

    render();

    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mouseX = e.clientX - r.left;

      if (mouseX >= padding.left && mouseX <= padding.left + chartWidth && dates.length > 0) {
        const step = dates.length > 1 ? chartWidth / (dates.length - 1) : 0;
        const index = step > 0 ? Math.round((mouseX - padding.left) / step) : 0;
        hoverIndex = Math.max(0, Math.min(dates.length - 1, index));
        render();
        updateLegend();
      }
    };

    canvas.onmouseleave = () => {
      hoverIndex = null;
      render();
      if (legend) legend.style.opacity = "0";
    };
  }

  function drawBarChart(qData, tData) {
    const canvas = document.getElementById("barChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const legend = document.getElementById("barLegend");

    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);

    const padding = { top: 30, right: 50, bottom: 50, left: 50 };
    const chartW = rect.width - padding.left - padding.right;
    const chartH = rect.height - padding.top - padding.bottom;

    const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const q = qData || [0, 0, 0, 0, 0, 0, 0];
    const t = tData || [0, 0, 0, 0, 0, 0, 0];

    const maxQ = Math.max(...q, 5);
    const maxT = Math.max(...t, 5);
    const scaleT = maxT > 0 ? (maxQ / maxT) : 1;
    const maxVal = Math.max(maxQ, ...t.map((v) => v * scaleT)) * 1.1;

    const groupW = chartW / days.length;
    const barW = groupW * 0.3;
    const bars = [];
    let lastHover = null;

    function render(hoverIdx = null) {
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = "#e5e5e5";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();

        ctx.fillStyle = "#737373";
        ctx.font = "12px sans-serif";
        const valQ = maxVal - i * (maxVal / 4);
        ctx.textAlign = "right";
        ctx.fillText(valQ.toFixed(0), padding.left - 10, y);
        ctx.textAlign = "left";
        ctx.fillText((valQ / scaleT).toFixed(0), padding.left + chartW + 10, y);
      }

      if (hoverIdx !== null) {
        const x = padding.left + groupW * hoverIdx;
        ctx.fillStyle = "rgba(200,200,200,0.2)";
        ctx.fillRect(x, padding.top, groupW, chartH);
      }

      bars.length = 0;
      days.forEach((d, i) => {
        const cx = padding.left + groupW * i + groupW / 2;

        const h1 = maxVal > 0 ? ((q[i] / maxVal) * chartH) : 0;
        ctx.fillStyle = "#8b8bff";
        ctx.fillRect(cx - barW - 2, padding.top + chartH - h1, barW, h1);

        const h2 = maxVal > 0 ? (((t[i] * scaleT) / maxVal) * chartH) : 0;
        ctx.fillStyle = "#6ee7b7";
        ctx.fillRect(cx + 2, padding.top + chartH - h2, barW, h2);

        bars.push({ idx: i, day: d, q: q[i], t: t[i], gx: padding.left + groupW * i, gw: groupW });

        ctx.fillStyle = "#737373";
        ctx.textAlign = "center";
        ctx.fillText(d, cx, padding.top + chartH + 15);
      });
    }

    render();

    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      let hIdx = null;

      for (const b of bars) {
        if (mx >= b.gx && mx <= b.gx + b.gw && my >= padding.top && my <= padding.top + chartH) {
          hIdx = b.idx;
          break;
        }
      }

      if (hIdx !== lastHover) {
        lastHover = hIdx;
        render(hIdx);

        if (hIdx !== null && legend) {
          const b = bars[hIdx];
          legend.innerHTML = `
            <div class="legend-date">${b.day}</div>
            <div class="legend-item">
              <span class="legend-label">Questões</span>
              <span class="legend-value">${b.q}</span>
            </div>
            <div class="legend-item">
              <span class="legend-label">Tempo</span>
              <span class="legend-value">${b.t} min</span>
            </div>
          `;
          let l = b.gx + b.gw / 2 + 20;
          if (l + 180 > rect.width) l = b.gx + b.gw / 2 - 180 - 20;
          legend.style.left = `${l}px`;
          legend.style.top = `${padding.top + 40}px`;
          legend.style.opacity = "1";
        } else if (legend) {
          legend.style.opacity = "0";
        }
      }
    };

    canvas.onmouseleave = () => {
      render();
      if (legend) legend.style.opacity = "0";
    };
  }

  function refreshChart(tab) {
    setTimeout(() => {
      if (!window.chartStore) return;

      if (tab === "visao-geral") {
        const radar = window.chartStore.radar || { current: [0, 0, 0, 0, 0], prev: [0, 0, 0, 0, 0] };
        drawRadarChart(radar.current, radar.prev);
      }

      if (tab === "desempenho" && window.chartStore.line) {
        drawLineChart(window.chartStore.line.dates, window.chartStore.line.datasets);
      }

      if (tab === "atividade") {
        const bar = window.chartStore.bar || { q: [0, 0, 0, 0, 0, 0, 0], t: [0, 0, 0, 0, 0, 0, 0] };
        drawBarChart(bar.q, bar.t);
      }
    }, 50);
  }

  // ==========================================================
  // 8) INIT + EVENTOS
  // ==========================================================
  function initUserMenu() {
    const avatarUsuario = document.getElementById("avatarUsuario");
    const menuUsuario = document.getElementById("menuUsuario");

    try {
      const localUser = readUserFromLocalStorage();
      if (localUser?.id) atualizarTopoUsuario(localUser);
    } catch (e) {
      console.warn("[resultados] não consegui preencher topo pelo localStorage:", e);
    }

    if (avatarUsuario && menuUsuario) {
      avatarUsuario.addEventListener("click", (e) => {
        e.stopPropagation();
        menuUsuario.classList.toggle("ativo");
      });

      menuUsuario.addEventListener("click", (e) => e.stopPropagation());

      document.addEventListener("click", (e) => {
        if (!avatarUsuario.contains(e.target) && !menuUsuario.contains(e.target)) {
          menuUsuario.classList.remove("ativo");
        }
      });
    } else {
      console.warn("[resultados] menu/avatar não encontrados:", {
        avatarUsuario: !!avatarUsuario,
        menuUsuario: !!menuUsuario,
      });
    }

    const linkSair = document.querySelector("#menuUsuario a.item-menu.sair");
    if (linkSair) {
      linkSair.addEventListener("click", async (e) => {
        e.preventDefault();
        await logout();
      });
    }
  }

  async function carregarDados() {
    const user = await requireAuthOrRedirect();
    if (!user?.id) return;

    console.log("[resultados] Usuário autenticado:", user.id, user.email || "");
    atualizarTopoUsuario(user);

    const usuario_id = user.id;

    const [
      dadosGerais,
      dadosDesempenho,
      dadosAtividade,
      historicoSimulados,
      redacoesUsuario
    ] = await Promise.all([
      fetchDadosGerais(usuario_id).catch(() => null),
      fetchDesempenho(usuario_id).catch(() => null),
      fetchAtividade(usuario_id).catch(() => null),
      fetchHistorico(usuario_id).catch(() => []),
      fetchRedacoesUsuario(usuario_id).catch(() => []),
    ]);

    atualizarDadosGerais(dadosGerais);
    atualizarDesempenho(dadosDesempenho);
    atualizarAtividade(dadosAtividade);

    const eventos = ordenarEventosPorDataDesc([
      ...normalizarHistoricoSimulados(historicoSimulados),
      ...normalizarHistoricoRedacoes(redacoesUsuario),
    ]);

    console.log("[resultados] eventos final (tamanho):", eventos.length);
    if (eventos.length > 0) console.log("[resultados] eventos exemplo:", eventos[0]);

    renderHistorico(eventos);

    const radarCurrent = [0, 0, 0, 0, 0];
    const radarPrev = [0, 0, 0, 0, 0];

    if (dadosDesempenho && Array.isArray(dadosDesempenho.desempenho)) {
      const areas = ["matematica", "linguagens", "ciencias_natureza", "ciencias_humanas", "redacao"];
      areas.forEach((area, idx) => {
        const d = dadosDesempenho.desempenho.find((x) => String(x.materia || x.area) === area);
        const v = d ? Number(d.taxa_acerto || 0) : 0;
        radarCurrent[idx] = v;
        radarPrev[idx] = Math.max(0, v - 5);
      });
    }

    window.chartStore = window.chartStore || {};
    window.chartStore.radar = { current: radarCurrent, prev: radarPrev };

    const activeTab = document.querySelector(".tab.active");
    refreshChart(activeTab ? activeTab.getAttribute("data-tab") : "visao-geral");
  }

  function inicializar() {
    console.log("[resultados] inicializando...");

    const periodFilter = document.getElementById("periodFilter");
    if (periodFilter) {
      periodFilter.addEventListener("change", () => carregarDados());
    }

    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll(".tab-content");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-tab");

        tabs.forEach((t) => t.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        tab.classList.add("active");
        const targetContent = document.getElementById(target);
        if (targetContent) targetContent.classList.add("active");

        refreshChart(target);
      });
    });

    initUserMenu();
    carregarDados();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
})();
