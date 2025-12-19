/* desempenho.js */
(function () {
    "use strict";

    const API_BASE =
        (window.Auth && window.Auth.API_BASE) ||
        `http://${window.location.hostname}:3000`;

    function qs(id) {
        return document.getElementById(id);
    }

    function safeJsonParse(txt) {
        try {
            return txt ? JSON.parse(txt) : null;
        } catch {
            return null;
        }
    }

    function extrairUserId(user) {
        if (!user) return null;
        return user.id ?? user.usuario_id ?? user.userId ?? user._id ?? user.uid ?? null;
    }

    function normalizarUsuario(user) {
        const id = extrairUserId(user);
        if (!id) return null;
        return {
            ...user,
            id,
            nome: user.nome ?? user.name ?? "Usuário",
            email: user.email ?? "",
            tipo: user.tipo ?? user.role ?? "",
        };
    }

    function readUserFromLocalStorageFallback() {
        const raw1 = localStorage.getItem("userData");
        const raw2 = localStorage.getItem("user_data");
        const raw = raw1 || raw2;
        if (!raw) return null;

        const parsed = safeJsonParse(raw);
        if (!parsed) return null;

        const u = parsed.user || parsed.usuario || parsed;
        return normalizarUsuario(u);
    }

    async function requireAuth() {
        if (window.Auth && typeof window.Auth.requireAuth === "function") {
            const user = await window.Auth.requireAuth();
            return user ? normalizarUsuario(user) : null;
        }

        const local = readUserFromLocalStorageFallback();
        if (!local?.id) {
            window.location.href = "login.html";
            return null;
        }
        return local;
    }

    async function apiFetch(path, options = {}) {
        if (window.Auth && typeof window.Auth.apiFetch === "function") {
            const { ok, status, json } = await window.Auth.apiFetch(path, options);
            if (!ok) {
                const msg = json?.error || `Erro HTTP ${status}`;
                throw new Error(msg);
            }
            return json;
        }

        const token = localStorage.getItem("auth_token") || "";
        const resp = await fetch(`${API_BASE}${path}`, {
            method: options.method || "GET",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(options.headers || {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const text = await resp.text();
        const json = safeJsonParse(text) ?? { success: false, error: text };

        if (!resp.ok) throw new Error(json?.error || `Erro HTTP ${resp.status}`);
        return json;
    }

    function atualizarInfoUsuario(usuario) {
        const nome = usuario?.nome || "Usuário";
        const email = usuario?.email || "-";
        const primeiraLetra = nome.charAt(0).toUpperCase();

        const avatar = qs("avatarUsuario");
        const nomeEl = qs("nomeUsuario");
        const emailEl = qs("emailUsuario");
        const nomeInfo = qs("nomeUsuarioInfo");
        const emailInfo = qs("emailUsuarioInfo");

        if (avatar) avatar.textContent = primeiraLetra;
        if (nomeEl) nomeEl.textContent = nome;
        if (emailEl) emailEl.textContent = email;
        if (nomeInfo) nomeInfo.value = nome;
        if (emailInfo) emailInfo.value = email;

        console.log("[desempenho] Usuário autenticado:", { id: usuario.id, nome, email });
    }

    async function carregarEstatisticasGerais(usuarioId) {
        try {
            const data = await apiFetch(`/api/resultados/geral/${usuarioId}`, { method: "GET" });

            if (data?.success && data?.dados) {
                const { taxaAcerto, questoesResolvidas, notaEstimada } = data.dados;

                const totalQuestoes = qs("totalQuestoes");
                const taxaAcertoEl = qs("taxaAcerto");
                const notaEstimadaEl = qs("notaEstimada");

                if (totalQuestoes) totalQuestoes.textContent = questoesResolvidas || 0;
                if (taxaAcertoEl) taxaAcertoEl.textContent = `${taxaAcerto || 0}%`;
                if (notaEstimadaEl) notaEstimadaEl.textContent = notaEstimada || 0;
            }
        } catch (error) {
            console.error("[desempenho] Erro ao carregar estatísticas gerais:", error);
        }
    }

    async function carregarDesempenho(usuarioId) {
        try {
            const data = await apiFetch(`/api/resultados/desempenho/${usuarioId}`, { method: "GET" });

            if (data?.success) {
                const melhores = data.melhores || [];
                const piores = data.piores || [];

                const evolucao_diaria =
                    data.evolucao_diaria ||
                    data?.estatisticas?.evolucao_diaria ||
                    data?.dados?.evolucao_diaria ||
                    [];

                renderizarBarras("pontosFortes", melhores, "#10b981");
                renderizarBarras("areasMelhoria", piores, "#f59e0b");

                criarGraficoRadar(data.desempenho || data?.estatisticas?.desempenho || []);

                if (Array.isArray(evolucao_diaria) && evolucao_diaria.length > 0) {
                    criarGraficoEvolucao(evolucao_diaria);
                } else {
                    console.warn("[desempenho] evolucao_diaria vazia (isso vem do backend).");
                }
            }
        } catch (error) {
            console.error("[desempenho] Erro ao carregar desempenho:", error);
        }
    }

    async function carregarRedacoes(usuarioId) {
        try {
            const resp = await apiFetch(`/api/redacoes/usuario/${usuarioId}`, { method: "GET" });

            const lista =
                (resp?.data?.redacoes && Array.isArray(resp.data.redacoes) ? resp.data.redacoes : null) ||
                (resp?.redacoes && Array.isArray(resp.redacoes) ? resp.redacoes : null) ||
                (Array.isArray(resp) ? resp : []);

            const statusOf = (r) => String(r?.status || r?.situacao || "").toLowerCase().trim();

            const corrigidas = lista.filter((r) => statusOf(r) === "corrigida");
            const aguardando = lista.filter((r) => statusOf(r) === "enviada"); 
            const rascunhos = lista.filter((r) => statusOf(r) === "rascunho");

            const elCorr = qs("redacoesCorrigidas");
            const elPend = qs("redacoesPendentes");
            const elRasc = qs("redacoesRascunhos");

            if (elCorr) elCorr.textContent = `${corrigidas.length} corrigida${corrigidas.length !== 1 ? "s" : ""}`;
            if (elPend) elPend.textContent = `${aguardando.length} aguardando`;
            if (elRasc) elRasc.textContent = `${rascunhos.length} rascunho${rascunhos.length !== 1 ? "s" : ""}`;

            renderizarRedacoes({
                aguardando,
                corrigidas,
                rascunhos,
            });
        } catch (error) {
            console.error("[desempenho] Erro ao carregar redações:", error);
            const listaRedacoes = qs("listaRedacoes");
            if (listaRedacoes) {
                listaRedacoes.innerHTML =
                    '<p style="text-align: center; color: #737373; padding: 2rem;">Nenhuma redação encontrada</p>';
            }
        }
    }

    function renderizarBarras(containerId, dados, cor) {
        const container = qs(containerId);
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML =
                '<p style="text-align: center; color: #737373;">Nenhum dado disponível</p>';
            return;
        }

        container.innerHTML = dados
            .map((item) => {
                const materia = item.materia || item.area || "Desconhecido";
                const taxa = Number(item.taxa_acerto || 0);
                const total = Number(item.total || 0);
                const acertos = Number(item.acertos || 0);

                return `
          <div class="item-barra">
            <div class="info-barra">
              <span class="label-barra">${materia}</span>
              <span class="porcentagem-barra" style="color: ${cor};">${taxa}%</span>
            </div>
            <div class="barra-progresso">
              <div class="preenchimento-barra" style="width: ${taxa}%; background: ${cor};"></div>
            </div>
            <p class="detalhe-barra">${acertos} de ${total} questões corretas</p>
          </div>
        `;
            })
            .join("");
    }

    function criarGraficoRadar(desempenho) {
        const ctx = qs("radarChart");
        if (!ctx || !window.Chart) return;

        const areas = {
            Matemática: 0,
            Linguagens: 0,
            "Ciências Humanas": 0,
            "Ciências da Natureza": 0,
            "Redação": 0,
        };

        const contadores = {
            Matemática: 0,
            Linguagens: 0,
            "Ciências Humanas": 0,
            "Ciências da Natureza": 0,
            "Redação": 0,
        };

        (desempenho || []).forEach((item) => {
            const materia = String(item.materia || item.area || "");
            const taxa = Number(item.taxa_acerto || 0);

            const m = materia.toLowerCase();

            if (m.includes("matem")) {
                areas["Matemática"] += taxa;
                contadores["Matemática"]++;
            } else if (m.includes("port") || m.includes("língua") || m.includes("lingu")) {
                areas["Linguagens"] += taxa;
                contadores["Linguagens"]++;
            } else if (m.includes("hist") || m.includes("geog") || m.includes("socio") || m.includes("filo") || m.includes("human")) {
                areas["Ciências Humanas"] += taxa;
                contadores["Ciências Humanas"]++;
            } else if (m.includes("fís") || m.includes("fis") || m.includes("quím") || m.includes("quim") || m.includes("biol") || m.includes("nature")) {
                areas["Ciências da Natureza"] += taxa;
                contadores["Ciências da Natureza"]++;
            } else if (m.includes("redac")) {
                areas["Redação"] += taxa;
                contadores["Redação"]++;
            }
        });

        const labels = Object.keys(areas);
        const valores = labels.map((area) => {
            const count = contadores[area];
            return count > 0 ? Math.round(areas[area] / count) : 0;
        });

        new window.Chart(ctx, {
            type: "radar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Desempenho (%)",
                        data: valores,
                        backgroundColor: "rgba(26, 26, 26, 0.1)",
                        borderColor: "rgba(26, 26, 26, 1)",
                        borderWidth: 2,
                        pointBackgroundColor: "rgba(26, 26, 26, 1)",
                        pointBorderColor: "#fff",
                        pointHoverBackgroundColor: "#fff",
                        pointHoverBorderColor: "rgba(26, 26, 26, 1)",
                    },
                ],
            },
            options: {
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { stepSize: 20 },
                    },
                },
                plugins: { legend: { display: false } },
            },
        });
    }

    function criarGraficoEvolucao(evolucaoDiaria) {
        const ctx = qs("evolucaoChart");
        if (!ctx || !window.Chart) return;

        const materiaMap = new Map();
        (evolucaoDiaria || []).forEach((item) => {
            const materia = item.materia || item.area || "Desconhecido";
            if (!materiaMap.has(materia)) materiaMap.set(materia, []);
            materiaMap.get(materia).push({
                data: item.data,
                taxa: Number(item.taxa_acerto || item.percentual || 0),
            });
        });

        const topMaterias = Array.from(materiaMap.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 5);

        const cores = [
            "rgba(26, 26, 26, 1)",
            "rgba(16, 185, 129, 1)",
            "rgba(245, 158, 11, 1)",
            "rgba(59, 130, 246, 1)",
            "rgba(239, 68, 68, 1)",
        ];

        const datasets = topMaterias.map(([materia, dados], index) => {
            dados.sort((a, b) => new Date(a.data) - new Date(b.data));
            return {
                label: materia,
                data: dados.map((d) => ({ x: d.data, y: d.taxa })),
                borderColor: cores[index],
                backgroundColor: cores[index].replace("1)", "0.1)"),
                borderWidth: 2,
                tension: 0.4,
                fill: false,
            };
        });

        new window.Chart(ctx, {
            type: "line",
            data: { datasets },
            options: {
                scales: {
                    x: {
                        type: "time",
                        time: {
                            unit: "day",
                            displayFormats: { day: "DD/MM" },
                        },
                        title: { display: true, text: "Data" },
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: "Taxa de Acerto (%)" },
                    },
                },
                plugins: {
                    legend: { display: true, position: "top" },
                    tooltip: { mode: "index", intersect: false },
                },
            },
        });
    }

    function fmtDataBR(raw) {
        if (!raw) return "-";
        const d = new Date(raw);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("pt-BR");
    }

    function badgeStatus(status) {
        const s = String(status || "").toLowerCase();
        if (s === "corrigida") return `<span class="badge-status badge-ok">✅ Corrigida</span>`;
        if (s === "enviada") return `<span class="badge-status badge-pendente">⏳ Aguardando correção</span>`;
        if (s === "rascunho") return `<span class="badge-status badge-rascunho">📝 Rascunho</span>`;
        return `<span class="badge-status badge-pendente">⏳ Aguardando correção</span>`;
    }

    function renderizarRedacoes({ aguardando = [], corrigidas = [], rascunhos = [] }) {
        const container = qs("listaRedacoes");
        if (!container) return;

        const vazio =
            aguardando.length === 0 && corrigidas.length === 0 && rascunhos.length === 0;

        if (vazio) {
            container.innerHTML =
                '<p style="text-align: center; color: #737373; padding: 2rem;">Nenhuma redação encontrada</p>';
            return;
        }

        function card(redacao) {
            const tema = redacao.tema || "Tema não especificado";
            const status = String(redacao.status || "").toLowerCase();

            const dataRaw =
                (status === "corrigida" ? redacao.corrigido_em : null) ||
                (status === "enviada" ? redacao.enviado_em : null) ||
                redacao.criado_em ||
                redacao.atualizado_em ||
                null;

            const data = fmtDataBR(dataRaw);

            const isCorrigida = status === "corrigida";

            const notaTotal = isCorrigida ? (redacao.nota_total ?? 0) : "—";
            const c1 = isCorrigida ? (redacao.competencia_1 ?? "—") : "—";
            const c2 = isCorrigida ? (redacao.competencia_2 ?? "—") : "—";
            const c3 = isCorrigida ? (redacao.competencia_3 ?? "—") : "—";
            const c4 = isCorrigida ? (redacao.competencia_4 ?? "—") : "—";
            const c5 = isCorrigida ? (redacao.competencia_5 ?? "—") : "—";

            const feedback = isCorrigida
                ? (redacao.feedback_geral || "Sem feedback disponível")
                : "Aguardando correção.";

            return `
        <div class="item-redacao">
          <div class="cabecalho-redacao">
            <div>
              <h4>${tema}</h4>
              <div class="data-redacao">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${data}
                <span style="margin-left:10px;">${badgeStatus(status)}</span>
              </div>
            </div>

            <div class="nota-total">
              <div class="valor-nota">${notaTotal}</div>
              <div class="label-nota">pontos</div>
            </div>
          </div>

          <div class="grid-competencias">
            <div class="competencia"><div class="label-competencia">C1</div><div class="valor-competencia">${c1}</div></div>
            <div class="competencia"><div class="label-competencia">C2</div><div class="valor-competencia">${c2}</div></div>
            <div class="competencia"><div class="label-competencia">C3</div><div class="valor-competencia">${c3}</div></div>
            <div class="competencia"><div class="label-competencia">C4</div><div class="valor-competencia">${c4}</div></div>
            <div class="competencia"><div class="label-competencia">C5</div><div class="valor-competencia">${c5}</div></div>
          </div>

          <div class="feedback">
            <strong>Feedback:</strong> ${feedback}
          </div>
        </div>
      `;
        }

        function bloco(titulo, arr) {
            if (!arr || arr.length === 0) return "";
            return `
        <div style="margin: 18px 0 10px; font-weight: 700; color: #111;">
          ${titulo} <span style="color:#666;font-weight:600">(${arr.length})</span>
        </div>
        ${arr.map(card).join("")}
      `;
        }

        container.innerHTML =
            bloco("⏳ Aguardando correção", aguardando) +
            bloco("✅ Corrigidas", corrigidas) +
            bloco("📝 Rascunhos", rascunhos);
    }

    function inicializarMenuUsuario() {
        const avatarUsuario = qs("avatarUsuario");
        const menuUsuario = qs("menuUsuario");
        if (!avatarUsuario || !menuUsuario) return;

        avatarUsuario.addEventListener("click", (evt) => {
            evt.stopPropagation();
            menuUsuario.classList.toggle("ativo");
        });

        document.addEventListener("click", (evt) => {
            if (!menuUsuario.contains(evt.target) && !avatarUsuario.contains(evt.target)) {
                menuUsuario.classList.remove("ativo");
            }
        });

        menuUsuario.addEventListener("click", (evt) => evt.stopPropagation());

        const btnLogout = document.getElementById("btnLogout");
        if (btnLogout && window.Auth?.logout) {
            btnLogout.addEventListener("click", (e) => {
                e.preventDefault();
                window.Auth.logout();
            });
        }
    }

    document.addEventListener("DOMContentLoaded", async () => {
        inicializarMenuUsuario();

        const usuario = await requireAuth();
        if (!usuario?.id) return;

        atualizarInfoUsuario(usuario);

        const usuarioId = usuario.id;
        await carregarEstatisticasGerais(usuarioId);
        await carregarDesempenho(usuarioId);
        await carregarRedacoes(usuarioId);
    });
})();
