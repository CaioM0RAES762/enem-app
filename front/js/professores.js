"use strict";

// ===============================
// Configuração
// ===============================
const API_BASE = `${location.protocol}//${location.hostname}:3000/api`;


let authUser = null;

let turmasData = [];
let alunosData = []; 
let redacoesData = [];
let tentativasData = [];

let editandoTurmaId = null;
let turmaSelecionadaId = ""; 
let redacaoSelecionadaId = null;

let chartBar = null;
let chartDifficulty = null;
let chartRadar = null;

function qs(sel, root = document) {
    return root.querySelector(sel);
}
function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
}

function getTokenFromStorage() {
    const keys = ["auth_token", "token", "access_token", "jwt", "AUTH_TOKEN"];
    for (const k of keys) {
        const v = localStorage.getItem(k);
        if (v && String(v).trim()) return String(v).trim();
    }
    return null;
}

function decodeJwt(token) {
    try {
        const parts = String(token).split(".");
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function getAuthHeaders() {
    const token = getTokenFromStorage();
    const headers = { "Content-Type": "application/json" };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers["X-Auth-Token"] = token;
        headers["X-Token"] = token;
    }

    let uid =
        authUser?.id ||
        localStorage.getItem("user_id") ||
        localStorage.getItem("usuario_id");

    if (!uid) {
        try {
            const u = JSON.parse(localStorage.getItem("usuario") || "null");
            uid = u?.id || u?.userId || u?.usuario_id || null;
        } catch { }
    }

    if (!uid && token) {
        const payload = decodeJwt(token);
        uid = payload?.id ?? payload?.userId ?? payload?.sub ?? null;
    }

    if (uid) {
        headers["X-User-ID"] = String(uid);
        headers["X-UserId"] = String(uid);
    }

    return headers;
}

async function apiFetch(path, { method = "GET", body = null, retryAuth = true } = {}) {
    const url = `${API_BASE}${path}`;

    const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        credentials: "include",
        body: body ? JSON.stringify(body) : null,
    });

    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }

    if (!res.ok) {
        if (res.status === 401 && retryAuth) {
            try {
                await resolveAuth();
                return apiFetch(path, { method, body, retryAuth: false });
            } catch { }
            throw new Error("Não autenticado");
        }

        const msg = (json && (json.error || json.message)) || `Erro HTTP ${res.status}`;
        throw new Error(msg);
    }

    return json;
}


function toast(msg, tipo = "sucesso") {
    const cores = { sucesso: "#28a745", erro: "#dc3545", aviso: "#ffc107" };

    const el = document.createElement("div");
    el.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${cores[tipo] || cores.sucesso};
    color: white;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    box-shadow: 0 10px 22px rgba(0,0,0,0.22);
    z-index: 99999;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    font-size: 14px;
    max-width: 420px;
  `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
}

function initials(name = "") {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    const a = parts[0][0] || "";
    const b = (parts[parts.length - 1][0] || "").toUpperCase();
    return (a + b).toUpperCase();
}

function formatPct(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    return x.toFixed(0);
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}


let _lastRoute = "";

document.addEventListener("DOMContentLoaded", async () => {
    wireUI();

    try {
        await resolveAuth();
        await carregarTudo();
    } catch (err) {
        console.error(err);
        toast(err.message || "Falha ao iniciar", "erro");
    }

    window.addEventListener("hashchange", onRouteChange);

    if (window.feather) feather.replace();
});



async function resolveAuth() {
    try {
        const res = await apiFetch("/auth/me");
        const u = res.user || res.data || res.usuario || res.me || null;

        authUser = u
            ? {
                id: u.id ?? u.userId ?? u.usuario_id ?? u.sub ?? null,
                nome: u.nome ?? u.name ?? "Professor",
                tipo: u.tipo ?? u.role ?? "professor",
                email: u.email,
            }
            : null;
    } catch (err) {
        const token = getTokenFromStorage();
        const payload = token ? decodeJwt(token) : null;

        if (payload) {
            authUser = {
                id: payload.id ?? payload.userId ?? payload.sub ?? null,
                nome: payload.nome ?? payload.name ?? "Professor",
                tipo: payload.tipo ?? payload.role ?? "professor",
                email: payload.email,
            };
        } else {
            throw err;
        }
    }

    if (!authUser?.id) throw new Error("Não autenticado. Faça login antes.");
    if (authUser.tipo && authUser.tipo !== "professor") throw new Error("Usuário não é professor.");

    localStorage.setItem("user_id", String(authUser.id));

    const avatar = qs(".perfil-navegacao");
    if (avatar) avatar.textContent = initials(authUser.nome || "CS");
}

function wireUI() {
    const btnHamb = qs("#menu-hamburguer");
    if (btnHamb)
        btnHamb.addEventListener("click", () => {
            const menu = qs(".menu-navegacao");
            if (menu) menu.classList.toggle("ativo");
        });

    const tabAlunos = qs("#tab-alunos");
    const tabTurmas = qs("#tab-turmas");
    const acoesAlunos = qs("#acoes-alunos-view");
    const acoesTurmas = qs("#acoes-turmas-view");
    const viewAlunos = qs("#view-lista-alunos");
    const viewTurmas = qs("#view-lista-turmas");

    if (tabAlunos && tabTurmas) {
        tabAlunos.addEventListener("click", () => {
            tabAlunos.classList.add("ativo");
            tabTurmas.classList.remove("ativo");
            if (acoesAlunos) acoesAlunos.style.display = "flex";
            if (acoesTurmas) acoesTurmas.style.display = "none";
            if (viewAlunos) viewAlunos.style.display = "block";
            if (viewTurmas) viewTurmas.style.display = "none";
        });

        tabTurmas.addEventListener("click", () => {
            tabTurmas.classList.add("ativo");
            tabAlunos.classList.remove("ativo");
            if (acoesTurmas) acoesTurmas.style.display = "flex";
            if (acoesAlunos) acoesAlunos.style.display = "none";
            if (viewTurmas) viewTurmas.style.display = "grid";
            if (viewAlunos) viewAlunos.style.display = "none";
        });
    }

    // Botões "Novo"
    const btnNovoAluno = qs("#btn-novo-aluno");
    if (btnNovoAluno) btnNovoAluno.addEventListener("click", () => abrirModalAluno?.());

    const btnNovaTurma = qs("#btn-nova-turma");
    if (btnNovaTurma) btnNovaTurma.addEventListener("click", () => abrirModalTurma?.());

    // Forms
    const formTurma = qs("#form-turma");
    if (formTurma) formTurma.addEventListener("submit", onSubmitTurma);

    const formAluno = qs("#form-aluno");
    if (formAluno) formAluno.addEventListener("submit", onSubmitAluno);

    // Fechar modais
    const btnFecharAluno = qs("#btn-fechar-modal");
    if (btnFecharAluno) btnFecharAluno.addEventListener("click", () => fecharModal("modal-aluno"));
    const btnFecharTurma = qs("#btn-fechar-modal-turma");
    if (btnFecharTurma) btnFecharTurma.addEventListener("click", () => fecharModal("modal-turma"));

    const btnCancelarAluno = qs("#btn-cancelar");
    if (btnCancelarAluno) btnCancelarAluno.addEventListener("click", () => fecharModal("modal-aluno"));
    const btnCancelarTurma = qs("#btn-cancelar-turma");
    if (btnCancelarTurma) btnCancelarTurma.addEventListener("click", () => fecharModal("modal-turma"));

    // Fechar ao clicar fora
    qsa(".modal").forEach((m) => {
        m.addEventListener("click", (e) => {
            if (e.target === m) m.classList.remove("aberto");
        });
    });

    // Filtros alunos
    const fNome = qs("#filtro-aluno-nome");
    const fTurma = qs("#filtro-aluno-turma");
    const fDes = qs("#filtro-aluno-desempenho");
    const fRed = qs("#filtro-aluno-redacao");

    [fNome, fTurma, fDes, fRed].forEach((el) => {
        if (!el) return;
        el.addEventListener("input", debounce(recarregarAlunosComFiltros, 250));
        el.addEventListener("change", debounce(recarregarAlunosComFiltros, 250));
    });

    // Filtro redações
    const fStatusRed = qs("#filtro-status-redacao");
    if (fStatusRed) fStatusRed.addEventListener("change", debounce(carregarRedacoesProfessor, 250));

    // Form correção redação
    const formCorrigir = qs("#form-correcao-redacao");
    if (formCorrigir) formCorrigir.addEventListener("submit", onSubmitCorrecaoRedacao);

    // Atualizar spans ao mover range
    qsa(".grupo-competencia input[type=range]").forEach((rng) => {
        rng.addEventListener("input", () => {
            const span = rng.closest(".controle-competencia")?.querySelector(".pontuacao-competencia");
            if (span) span.textContent = `${rng.value}/200`;
            atualizarNotaTotalPreview();
        });
    });

    // Questionários filtros
    const fAlunoQ = qs("#filtro-aluno");
    const fStatusQ = qs("#filtro-status-quiz");
    const fTurmaQ = qs("#filtro-turma");
    const fMateriaQ = qs("#filtro-materia");

    [fAlunoQ, fStatusQ, fTurmaQ, fMateriaQ].forEach((el) => {
        if (!el) return;
        el.addEventListener("input", debounce(carregarTentativasProfessor, 250));
        el.addEventListener("change", debounce(carregarTentativasProfessor, 250));
    });

    const ulQ = qs("#lista-questionarios");
    if (ulQ && !ulQ.__delegated) {
        ulQ.__delegated = true;
        ulQ.addEventListener("click", async (e) => {
            const btn = e.target.closest("[data-action='abrir-tentativa']");
            if (!btn) return;
            e.preventDefault();
            const id = btn.dataset.id;
            if (!id) return;
            try {
                await abrirDetalheTentativa(id);
                location.hash = "revisar-questionario";
            } catch (err) {
                console.error(err);
                toast(err.message || "Erro ao abrir tentativa", "erro");
            }
        });
    }
}

async function carregarTudo() {
    await Promise.all([
        carregarTurmas(),
        carregarDashboardProfessor(),
        carregarChartsDashboard().catch(() => { }),
        carregarRedacoesProfessor().catch(() => { }),
        carregarTentativasProfessor().catch(() => { }),
    ]);

    preencherSelectFiltroTurmas?.();

    const filtroTurma = qs("#filtro-aluno-turma");
    if (filtroTurma && filtroTurma.value) {
        turmaSelecionadaId = filtroTurma.value;
        await recarregarAlunosComFiltros();
    } else if (turmasData.length) {
        turmaSelecionadaId = turmasData[0].id;
        if (filtroTurma) filtroTurma.value = turmaSelecionadaId;
        await recarregarAlunosComFiltros();
    } else {
        renderizarAlunosLista?.([]);
    }
}

// ===============================
// Dashboard Professor
// ===============================
async function carregarDashboardProfessor() {
    const res = await apiFetch("/professor/dashboard");
    const row = res?.data ?? res ?? {};

    if (qs("#stat-total-alunos")) qs("#stat-total-alunos").textContent = row.total_alunos ?? 0;
    if (qs("#stat-redacoes-pendentes")) qs("#stat-redacoes-pendentes").textContent = row.redacoes_pendentes ?? 0;
    if (qs("#stat-quizzes-concluidos")) qs("#stat-quizzes-concluidos").textContent = row.quizzes_concluidos ?? 0;
    if (qs("#stat-media-geral")) qs("#stat-media-geral").textContent = row.media_geral ?? 0;
}

async function carregarChartsDashboard() {
    const [mediaTurmasRes, difMateriaRes] = await Promise.all([
        apiFetch("/professor/dashboard/media-por-turma"),
        apiFetch("/professor/dashboard/dificuldade-por-materia"),
    ]);

    const mediaTurmas = mediaTurmasRes?.data ?? mediaTurmasRes ?? [];
    const difMateria = difMateriaRes?.data ?? difMateriaRes ?? [];

    renderBarChart(Array.isArray(mediaTurmas) ? mediaTurmas : []);
    renderDifficultyChart(Array.isArray(difMateria) ? difMateria : []);

    await renderRadarFromRedacoes();
}

function renderBarChart(rows) {
    const canvas = qs("#barChart");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = (rows || []).map((r) => r.turma_nome);
    const values = (rows || []).map((r) => Number(r.media_percentual ?? 0));

    if (chartBar) chartBar.destroy();
    chartBar = new Chart(canvas, {
        type: "bar",
        data: { labels, datasets: [{ label: "Média (%)", data: values }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } },
    });
}

function renderDifficultyChart(rows) {
    const canvas = qs("#difficultyChart");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = (rows || []).map((r) => r.materia || "—");
    const values = (rows || []).map((r) => Number(r.media_acerto ?? 0));

    if (chartDifficulty) chartDifficulty.destroy();
    chartDifficulty = new Chart(canvas, {
        type: "bar",
        data: { labels, datasets: [{ label: "Média de acerto (%)", data: values }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } },
    });
}

async function renderRadarFromRedacoes() {
    const canvas = qs("#radarChart");
    if (!canvas || typeof Chart === "undefined") return;

    const turmaId =
        qs("#filtro-aluno-turma")?.value ||
        window.turmaSelecionadaId ||
        "";

    const labels = ["C1", "C2", "C3", "C4", "C5"];

    const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const isUuid = (id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(id || "")
        );

    function draw(values, subtitle = "") {
        const safe = (values || []).map(toNum);

        if (chartRadar) chartRadar.destroy();
        chartRadar = new Chart(canvas, {
            type: "radar",
            data: {
                labels,
                datasets: [
                    {
                        label: subtitle ? `Média (0-200) • ${subtitle}` : "Média (0-200)",
                        data: safe,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { beginAtZero: true, max: 200, ticks: { stepSize: 40 } },
                },
            },
        });
    }

    async function fetchCompetenciasPorTurma() {
        try {
            return await apiFetch("/professor/dashboard/redacoes/competencias-por-turma");
        } catch (e1) {
            try {
                return await apiFetch("/professor/dashboard/redacoes/por-turma");
            } catch (e2) {
                const qsParams = new URLSearchParams();
                if (turmaId && isUuid(turmaId)) qsParams.set("turmaId", turmaId);
                return await apiFetch(
                    `/professor/dashboard/redacoes/radar${qsParams.toString() ? `?${qsParams}` : ""}`
                );
            }
        }
    }

    try {
        const res = await fetchCompetenciasPorTurma();
        const data = res?.data ?? res ?? null;

        if (Array.isArray(data)) {
            const rows = data;

            if (!rows.length) {
                draw([0, 0, 0, 0, 0], "0 redações");
                return;
            }

            if (turmaId) {
                const row = rows.find((r) => String(r.turma_id) === String(turmaId));
                if (!row) {
                    draw([0, 0, 0, 0, 0], "Turma sem redações");
                    return;
                }

                draw(
                    [row.c1, row.c2, row.c3, row.c4, row.c5],
                    `${row.turma_nome || "Turma"} • ${Number(row.total_redacoes || 0)} corrigida(s)`
                );
                return;
            }

            let w = 0;
            let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;

            for (const r of rows) {
                const peso = Number(r?.total_redacoes || 0);
                if (!peso) continue;

                s1 += toNum(r.c1) * peso;
                s2 += toNum(r.c2) * peso;
                s3 += toNum(r.c3) * peso;
                s4 += toNum(r.c4) * peso;
                s5 += toNum(r.c5) * peso;
                w += peso;
            }

            if (!w) {
                draw([0, 0, 0, 0, 0], "0 redações");
                return;
            }

            draw(
                [
                    Math.round(s1 / w),
                    Math.round(s2 / w),
                    Math.round(s3 / w),
                    Math.round(s4 / w),
                    Math.round(s5 / w),
                ],
                `${w} corrigida(s) • Geral`
            );
            return;
        }

        if (data && typeof data === "object") {
            const row = data;
            const total =
                Number(row.total_redacoes || row.total_corrigidas || 0) || 0;

            const values = [
                row.c1 ?? 0,
                row.c2 ?? 0,
                row.c3 ?? 0,
                row.c4 ?? 0,
                row.c5 ?? 0,
            ].map((v) => Math.round(toNum(v)));

            const subtitle =
                turmaId && isUuid(turmaId)
                    ? `${total} corrigida(s) • Turma`
                    : `${total} corrigida(s) • Geral`;

            draw(values, subtitle);
            return;
        }

        draw([0, 0, 0, 0, 0], "0 redações");
    } catch (err) {
        console.error("[Radar] Falha ao carregar radar redações:", err);
        draw([0, 0, 0, 0, 0], "Erro");
    }
}



// ===============================
// Turmas
// ===============================
async function carregarTurmas() {
    const res = await apiFetch("/turmas");
    turmasData = res.data || res || [];
    renderizarTurmasCards(turmasData);
}

function preencherSelectFiltroTurmas() {
    const sel = qs("#filtro-aluno-turma");
    if (!sel) return;

    sel.innerHTML = `<option value="">Todas as Turmas</option>`;
    turmasData.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.nome;
        sel.appendChild(opt);
    });

    const selQuizTurma = qs("#filtro-turma");
    if (selQuizTurma) {
        selQuizTurma.innerHTML = `<option value="">Todas as Turmas</option>`;
        turmasData.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.nome;
            selQuizTurma.appendChild(opt);
        });
    }

    const selModal = qs("#turma");
    if (selModal) {
        selModal.innerHTML = `<option value="" disabled selected>Selecione...</option>`;
        turmasData.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.nome;
            selModal.appendChild(opt);
        });
    }
}

function renderizarTurmasCards(rows) {
    const container = qs("#view-lista-turmas");
    if (!container) return;

    if (!rows.length) {
        container.style.display = "none";
        return;
    }

    container.style.display = "grid";
    container.innerHTML = rows
        .map((t) => {
            const alunosAtivos = Number(t.alunos_ativos || 0);
            return `
        <div class="cartao">
          <div style="display:flex; justify-content:space-between; align-items:start; gap: 0.75rem;">
            <div>
              <h3 style="margin:0;">${escapeHtml(t.nome)}</h3>
              <p style="color:#666; margin-top:0.35rem;">${escapeHtml(t.ano_serie)} • ${escapeHtml(t.periodo)}</p>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button class="botao-icone" data-action="editar-turma" data-id="${t.id}">
                <i data-feather="edit-2"></i>
              </button>
              <button class="botao-icone perigo" data-action="deletar-turma" data-id="${t.id}" data-nome="${escapeHtml(t.nome)}">
                <i data-feather="trash-2"></i>
              </button>
            </div>
          </div>

          <div style="margin-top: 1rem; padding: 1rem; background:#f3f4f6; border-radius: 12px;">
            <strong>${alunosAtivos}</strong> alunos ativos
          </div>

          <div style="margin-top: 0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button class="botao botao-secundario" data-action="abrir-alunos-turma" data-id="${t.id}">
              Ver alunos
            </button>
            <button class="botao botao-secundario" data-action="abrir-redacoes-turma" data-id="${t.id}">
              Redações
            </button>
          </div>
        </div>
      `;
        })
        .join("");

    qsa("[data-action='editar-turma']", container).forEach((btn) =>
        btn.addEventListener("click", () => abrirModalTurma(btn.dataset.id))
    );

    qsa("[data-action='deletar-turma']", container).forEach((btn) =>
        btn.addEventListener("click", () => deletarTurma(btn.dataset.id, btn.dataset.nome))
    );

    qsa("[data-action='abrir-alunos-turma']", container).forEach((btn) =>
        btn.addEventListener("click", async () => {
            const tabAlunos = qs("#tab-alunos");
            if (tabAlunos) tabAlunos.click();
            const sel = qs("#filtro-aluno-turma");
            if (sel) sel.value = btn.dataset.id;
            turmaSelecionadaId = btn.dataset.id;
            await recarregarAlunosComFiltros();
            location.hash = "turmas";
        })
    );

    qsa("[data-action='abrir-redacoes-turma']", container).forEach((btn) =>
        btn.addEventListener("click", async () => {
            const sel = qs("#filtro-aluno-turma");
            if (sel) sel.value = btn.dataset.id;
            turmaSelecionadaId = btn.dataset.id;
            await carregarRedacoesProfessor();
            location.hash = "redacoes";
        })
    );

    if (window.feather) feather.replace();
}

async function onSubmitTurma(e) {
    e.preventDefault();
    const idHidden = qs("#turma-id");
    const turmaId = idHidden?.value || editandoTurmaId || null;

    const nome = qs("#nome-turma")?.value?.trim();
    const anoSerie = qs("#ano-turma")?.value?.trim();
    const periodo = qs("#periodo-turma")?.value;

    if (!nome || !anoSerie) return toast("Preencha nome e ano/série.", "aviso");

    const payload = { nome, ano_serie: anoSerie, periodo };

    try {
        if (turmaId) {
            await apiFetch(`/turmas/${turmaId}`, { method: "PUT", body: payload });
            toast("Turma atualizada!", "sucesso");
        } else {
            await apiFetch("/turmas", { method: "POST", body: payload });
            toast("Turma criada!", "sucesso");
        }

        fecharModal("modal-turma");
        await carregarTurmas();
        preencherSelectFiltroTurmas();
        await carregarDashboardProfessor();
        await carregarChartsDashboard();
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao salvar turma", "erro");
    }
}

async function deletarTurma(turmaId, nome) {
    if (!confirm(`Tem certeza que deseja deletar/desativar a turma "${nome}"?`)) return;
    try {
        await apiFetch(`/turmas/${turmaId}`, { method: "DELETE" });
        toast("Turma desativada!", "sucesso");
        await carregarTurmas();
        preencherSelectFiltroTurmas();
        await carregarDashboardProfessor();
        await carregarChartsDashboard();
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao deletar turma", "erro");
    }
}

// ===============================
// Modal Turma
// ===============================
function abrirModalTurma(turmaId = null) {
    editandoTurmaId = turmaId;
    const modal = qs("#modal-turma");
    if (!modal) return;

    const titulo = qs("#modal-titulo-turma");
    const form = qs("#form-turma");
    if (form) form.reset();

    const hid = qs("#turma-id");
    if (hid) hid.value = turmaId || "";

    if (titulo) titulo.textContent = turmaId ? "Editar Turma" : "Nova Turma";

    if (turmaId) {
        const t = turmasData.find((x) => String(x.id) === String(turmaId));
        if (t) {
            if (qs("#nome-turma")) qs("#nome-turma").value = t.nome || "";
            if (qs("#ano-turma")) qs("#ano-turma").value = t.ano_serie || "";
            if (qs("#periodo-turma")) qs("#periodo-turma").value = t.periodo || "Matutino";
        }
    }

    modal.classList.add("aberto");
}

function fecharModal(id) {
    const el = qs(`#${id}`);
    if (el) el.classList.remove("aberto");
    editandoTurmaId = null;
}

// ===============================
// Alunos por Turma + filtros
// ===============================
async function recarregarAlunosComFiltros() {
    const selTurma = qs("#filtro-aluno-turma");
    const turmaId = selTurma?.value ?? turmaSelecionadaId ?? "";

    const q = qs("#filtro-aluno-nome")?.value?.trim() || "";
    const desempenho = qs("#filtro-aluno-desempenho")?.value || "";
    const statusRedacao = qs("#filtro-aluno-redacao")?.value || "";

    try {
        if (!turmaId) {
            const all = [];
            for (const t of turmasData) {
                const res = await apiFetch(
                    `/turmas/${t.id}/alunos?q=${encodeURIComponent(q)}&desempenho=${encodeURIComponent(
                        desempenho
                    )}&statusRedacao=${encodeURIComponent(statusRedacao)}`
                );
                const rows = (res.data || []).map((a) => ({ ...a, turma_id: t.id, turma_nome: t.nome }));
                all.push(...rows);
            }
            alunosData = all;
            renderizarAlunosLista(all);
            return;
        }

        turmaSelecionadaId = turmaId;

        const res = await apiFetch(
            `/turmas/${turmaId}/alunos?q=${encodeURIComponent(q)}&desempenho=${encodeURIComponent(
                desempenho
            )}&statusRedacao=${encodeURIComponent(statusRedacao)}`
        );
        alunosData = res.data || [];
        const turmaNome = turmasData.find((t) => String(t.id) === String(turmaId))?.nome || "";
        renderizarAlunosLista(alunosData.map((a) => ({ ...a, turma_id: turmaId, turma_nome: turmaNome })));
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao carregar alunos", "erro");
    }
}

function renderizarAlunosLista(rows) {
    const ul = qs("#lista-alunos-geral");
    if (!ul) return;

    if (!rows.length) {
        ul.innerHTML = `<li style="padding: 1rem; color:#666;">Nenhum aluno encontrado.</li>`;
        return;
    }

    ul.innerHTML = rows
        .map((a) => {
            const media = Number(a.media_percentual || 0);
            const badge = media >= 80 ? "🟢 Excelente" : media >= 60 ? "🟡 Médio" : "🔴 Atenção";
            const redPend = Number(a.redacoes_pendentes || 0);

            return `
        <li class="item-aluno" style="display:flex; align-items:center; justify-content:space-between; gap: 0.75rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <div class="avatar-aluno">${initials(a.nome)}</div>
            <div class="info-aluno">
              <strong>${escapeHtml(a.nome)}</strong>
              <span>${escapeHtml(a.email)}</span>
              <span class="turma-aluno">${escapeHtml(a.turma_nome || "—")}</span>
              <div class="estatisticas-aluno">
                Média: ${formatPct(media)}% • Quizzes: ${Number(a.quizzes_concluidos || 0)} • Redações pendentes: ${redPend} • ${badge}
              </div>
            </div>
          </div>

          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="botao botao-secundario" data-action="status-matricula" data-turma="${a.turma_id}" data-aluno="${a.aluno_id}" data-next="inativo">
              Inativar
            </button>
            <button class="botao botao-secundario" data-action="status-matricula" data-turma="${a.turma_id}" data-aluno="${a.aluno_id}" data-next="transferido">
              Transferir
            </button>
            <button class="botao botao-primario" data-action="status-matricula" data-turma="${a.turma_id}" data-aluno="${a.aluno_id}" data-next="ativo">
              Ativar
            </button>
          </div>
        </li>
      `;
        })
        .join("");

    qsa("[data-action='status-matricula']", ul).forEach((btn) => {
        btn.addEventListener("click", async () => {
            const turmaId = btn.dataset.turma;
            const alunoId = btn.dataset.aluno;
            const status = btn.dataset.next;
            await alterarStatusMatricula(turmaId, alunoId, status);
        });
    });
}

// ===============================
// Modal Aluno (matricular / criar)
// ===============================
function abrirModalAluno() {
    const modal = qs("#modal-aluno");
    if (!modal) return;

    const titulo = qs("#modal-titulo");
    if (titulo) titulo.textContent = "Adicionar Novo Aluno";

    const form = qs("#form-aluno");
    if (form) form.reset();

    const hid = qs("#aluno-id");
    if (hid) hid.value = "";

    const sel = qs("#turma");
    if (sel) {
        const filtroTurma = qs("#filtro-aluno-turma");
        const tid = filtroTurma?.value || turmaSelecionadaId || "";
        if (tid) sel.value = tid;
    }

    modal.classList.add("aberto");
}

async function onSubmitAluno(e) {
    e.preventDefault();

    const nome = qs("#nome")?.value?.trim();
    const email = qs("#email")?.value?.trim();
    const turmaId = qs("#turma")?.value;

    if (!nome || !email || !turmaId) return toast("Preencha nome, e-mail e turma.", "aviso");

    try {
        let alunoId = null;

        try {
            const reg = await apiFetch("/auth/cadastro", {
                method: "POST",
                body: { nome, email, senha: "123456", tipo: "aluno" },
            });
            alunoId = reg.data?.id || reg.user?.id || reg.id || null;
        } catch {
            const lookup = await apiFetch(`/professor/alunos?email=${encodeURIComponent(email)}`);
            const found = (lookup.data || []).find((u) => u.email === email);
            alunoId = found?.id || found?.aluno_id || null;

            if (!alunoId) {
                throw new Error(
                    "Aluno já existe, mas não consegui obter o ID. Crie/ajuste a rota GET /api/professor/alunos?email= para lookup."
                );
            }
        }

        // 2) matricular
        await apiFetch(`/turmas/${turmaId}/alunos`, { method: "POST", body: { alunoId } });


        toast("Aluno matriculado!", "sucesso");
        fecharModal("modal-aluno");
        await recarregarAlunosComFiltros();
        await carregarDashboardProfessor();
        await carregarChartsDashboard();
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao salvar aluno", "erro");
    }
}

async function alterarStatusMatricula(turmaId, alunoId, status) {
    try {
        await apiFetch(`/turmas/${turmaId}/alunos/${alunoId}`, { method: "PATCH", body: { status } });
        toast("Matrícula atualizada!", "sucesso");
        await recarregarAlunosComFiltros();
        await carregarDashboardProfessor();
        await carregarChartsDashboard();
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao atualizar matrícula", "erro");
    }
}

// ===============================
// Redações (professor)
// ===============================
async function carregarRedacoesProfessor() {
    const statusUI = qs("#filtro-status-redacao")?.value || "todos";
    const turmaId = qs("#filtro-aluno-turma")?.value || turmaSelecionadaId || "";

    const status = statusUI === "pendente" ? "enviada" : statusUI === "corrigida" ? "corrigida" : "";

    const qsParams = new URLSearchParams();
    if (status) qsParams.set("status", status);
    if (turmaId) qsParams.set("turmaId", turmaId);

    try {
        const qstr = qsParams.toString();
        const url = qstr ? `/professor/redacoes?${qstr}` : `/professor/redacoes`;
        const res = await apiFetch(url);
        redacoesData = res.data || [];
        renderizarListaRedacoes(redacoesData);
        atualizarCardsRedacoes(redacoesData);
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao carregar redações", "erro");
    }
}

function atualizarCardsRedacoes(rows) {
    const pend = rows.filter((r) => r.status === "enviada").length;
    const corr = rows.filter((r) => r.status === "corrigida").length;
    const media =
        corr > 0
            ? Math.round(rows.filter((r) => r.status === "corrigida").reduce((acc, r) => acc + Number(r.nota_total || 0), 0) / corr)
            : 0;

    if (qs("#stat-red-pendentes")) qs("#stat-red-pendentes").textContent = pend;
    if (qs("#stat-red-corrigidas")) qs("#stat-red-corrigidas").textContent = corr;
    if (qs("#stat-red-media")) qs("#stat-red-media").textContent = media;
}

function renderizarListaRedacoes(rows) {
    const grid = qs("#lista-redacoes-pendentes");
    if (!grid) return;

    if (!rows.length) {
        grid.innerHTML = `<div class="cartao" style="grid-column: 1 / -1; color:#666;">Nenhuma redação encontrada.</div>`;
        return;
    }

    grid.innerHTML = rows
        .map((r) => {
            const turma = r.turma_nome || "Turma";
            const aluno = r.aluno_nome || r.usuario_nome || "Aluno";
            const badge = r.status === "corrigida" ? "etiqueta etiqueta-sucesso" : "etiqueta etiqueta-pendente";
            const badgeTxt = r.status === "corrigida" ? "Corrigida" : "Pendente";
            const nota = r.nota_total != null ? `${r.nota_total}/1000` : "—";

            return `
        <div class="cartao">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 0.75rem;">
            <div>
              <h3 style="margin:0;">${escapeHtml(aluno)}</h3>
              <p style="margin:0.35rem 0 0; color:#666;">${escapeHtml(turma)}</p>
              <p style="margin:0.35rem 0 0; color:#666;">Tema: ${escapeHtml(r.tema || "—")}</p>
            </div>
            <span class="${badge}">${badgeTxt}</span>
          </div>

          <div style="margin-top: 0.85rem; padding: 0.85rem; background:#f3f4f6; border-radius: 12px;">
            <strong>Nota:</strong> ${nota}
          </div>

          <div style="margin-top: 0.85rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button class="botao botao-primario" data-action="abrir-redacao" data-id="${r.id}">
              Abrir
            </button>
          </div>
        </div>
      `;
        })
        .join("");

    qsa("[data-action='abrir-redacao']", grid).forEach((btn) => {
        btn.addEventListener("click", async () => {
            await abrirTelaCorrecaoRedacao(btn.dataset.id);
            location.hash = "corrigir-redacao";
        });
    });

    if (window.feather) feather.replace();
}

async function abrirTelaCorrecaoRedacao(redacaoId) {
    redacaoSelecionadaId = redacaoId;

    const res = await apiFetch(`/professor/redacoes/${redacaoId}`);
    const r = res.data || res;

    const spans = qsa("#corrigir-redacao .cabecalho-correcao span");
    const turma = r.turma_nome || "Turma";
    const enviadoEm = r.enviado_em ? new Date(r.enviado_em).toLocaleString("pt-BR") : "—";
    if (spans[0]) spans[0].textContent = `${turma} • Data de envio: ${enviadoEm}`;

    const tag = qs("#corrigir-redacao .cabecalho-correcao .etiqueta");
    if (tag) {
        tag.textContent = r.status === "corrigida" ? "Corrigida" : "Pendente";
        tag.className = `etiqueta ${r.status === "corrigida" ? "etiqueta-sucesso" : "etiqueta-pendente"}`;
    }

    const temaP = qsa("#corrigir-redacao .cartao p")[0];
    const textoP = qs("#corrigir-redacao .texto-redacao");
    if (temaP) temaP.textContent = r.tema || "—";
    if (textoP) textoP.textContent = r.texto_redacao || "—";

    setRange("c1", r.competencia_1);
    setRange("c2", r.competencia_2);
    setRange("c3", r.competencia_3);
    setRange("c4", r.competencia_4);
    setRange("c5", r.competencia_5);

    const fb = qs("#feedback");
    if (fb) fb.value = r.feedback_geral || "";

    atualizarNotaTotalPreview();
}

function setRange(id, value) {
    const el = qs(`#${id}`);
    if (!el) return;
    if (value != null) el.value = String(value);
    const span = el.closest(".controle-competencia")?.querySelector(".pontuacao-competencia");
    if (span) span.textContent = `${el.value}/200`;
}

function atualizarNotaTotalPreview() {
    const c1 = Number(qs("#c1")?.value || 0);
    const c2 = Number(qs("#c2")?.value || 0);
    const c3 = Number(qs("#c3")?.value || 0);
    const c4 = Number(qs("#c4")?.value || 0);
    const c5 = Number(qs("#c5")?.value || 0);
    const total = c1 + c2 + c3 + c4 + c5;

    const h2 = qs("#corrigir-redacao .pontuacao-total strong");
    if (h2) h2.textContent = `${total}/1000`;
}

async function onSubmitCorrecaoRedacao(e) {
    e.preventDefault();
    if (!redacaoSelecionadaId) return toast("Nenhuma redação selecionada.", "aviso");

    const c1 = Number(qs("#c1")?.value || 0);
    const c2 = Number(qs("#c2")?.value || 0);
    const c3 = Number(qs("#c3")?.value || 0);
    const c4 = Number(qs("#c4")?.value || 0);
    const c5 = Number(qs("#c5")?.value || 0);
    const nota_total = c1 + c2 + c3 + c4 + c5;

    const feedback_geral = qs("#feedback")?.value?.trim() || "";

    try {
        await apiFetch(`/professor/redacoes/${redacaoSelecionadaId}/corrigir`, {
            method: "POST",
            body: {
                competencia_1: c1,
                competencia_2: c2,
                competencia_3: c3,
                competencia_4: c4,
                competencia_5: c5,
                nota_total,
                feedback_geral,
                status: "corrigida",
            },
        });

        toast("Correção salva!", "sucesso");
        await carregarRedacoesProfessor();
        await carregarDashboardProfessor();
        await carregarChartsDashboard();
        location.hash = "redacoes";
    } catch (err) {
        console.error(err);
        toast(err.message || "Erro ao salvar correção", "erro");
    }
}

function setAnyText(possibleIds, value) {
    for (const sel of possibleIds) {
        const el = qs(sel);
        if (el) {
            el.textContent = String(value);
            return true;
        }
    }
    return false;
}
// ===============================
// Questionários 
// ===============================

const DEBUG_QZ = true;

function logQZ(...args) {
    if (DEBUG_QZ) console.log("[QZ]", ...args);
}

function atualizarCardsQuestionarios(stats) {
    const total = stats?.totalTentativas ?? 0;
    const media = stats?.mediaAcertos ?? 0;
    const feedbacks = stats?.feedbacksEnviados ?? 0;
    const ativos = stats?.alunosAtivos ?? 0;

    const elTotal = qs("#stat-qz-total");
    const elMedia = qs("#stat-qz-media");
    const elFeedbacks = qs("#stat-qz-feedbacks");
    const elAtivos = qs("#stat-qz-alunos-ativos");

    let ok = 0;

    if (elTotal) { elTotal.textContent = String(total); ok++; }
    if (elMedia) { elMedia.textContent = `${Number(media).toFixed(1)}%`; ok++; }
    if (elFeedbacks) { elFeedbacks.textContent = String(feedbacks); ok++; }
    if (elAtivos) { elAtivos.textContent = String(ativos); ok++; }

    if (ok === 4) {
        logQZ("Cards atualizados por IDs ✅", { total, media, feedbacks, ativos });
        return true;
    }

    const section = qs("#questionarios");
    const cards = section ? Array.from(section.querySelectorAll(".cartao.cartao-estatistica")) : [];

    function setByTitle(title, value) {
        for (const c of cards) {
            const t = c.querySelector(".titulo-estatistica")?.textContent?.trim();
            if (t === title) {
                const v = c.querySelector(".valor-estatistica");
                if (v) {
                    v.textContent = String(value);
                    return true;
                }
            }
        }
        return false;
    }

    const a = setByTitle("Total de Tentativas", total);
    const b = setByTitle("Média de Acertos", `${Number(media).toFixed(1)}%`);
    const c = setByTitle("Feedbacks Enviados", feedbacks);
    const d = setByTitle("Alunos Ativos", ativos);

    logQZ("Cards por IDs (ok=", ok, ") fallback título:", { a, b, c, d });

    return a && b && c && d;
}

function setText(id, value) {
    const el = qs(id);
    if (el) el.textContent = String(value);
}

function calcStatsFromTentativas(rows) {
    const totalTentativas = rows.length;

    let soma = 0;
    let n = 0;
    let feedbacksEnviados = 0;
    const alunosAtivos = new Set();

    for (const t of rows) {
        const pct = Number(t.percentual);
        if (Number.isFinite(pct)) {
            soma += pct;
            n += 1;
        }

        if (t.feedback_id || t.tem_feedback) feedbacksEnviados += 1;

        if (t.aluno_id) alunosAtivos.add(String(t.aluno_id));
    }

    const mediaAcertos = n ? Number((soma / n).toFixed(1)) : 0;

    return {
        totalTentativas,
        mediaAcertos,
        feedbacksEnviados,
        alunosAtivos: alunosAtivos.size,
    };
}

function quandoQuestionariosAtivo(fn) {
    const sec = qs("#questionarios");
    if (!sec) return fn(); 
    const ativo = sec.classList.contains("active");
    if (ativo) return fn();

    setTimeout(fn, 50);
    setTimeout(fn, 150);
    setTimeout(fn, 300);
}

async function carregarTentativasProfessor() {
    const fAluno = qs("#filtro-aluno")?.value?.trim() || "";
    const fStatus = qs("#filtro-status-quiz")?.value || "";
    const fTurma = qs("#filtro-turma")?.value || "";
    const fMateria = qs("#filtro-materia")?.value || "";

    const qsParams = new URLSearchParams();
    if (fAluno) qsParams.set("alunoSearch", fAluno);
    if (fStatus) qsParams.set("statusFeedback", fStatus);
    if (fTurma) qsParams.set("turmaId", fTurma);
    if (fMateria) qsParams.set("materia", fMateria);

    try {
        const res = await apiFetch(`/professor/questionarios/tentativas?${qsParams.toString()}`);

        tentativasData = Array.isArray(res?.data) ? res.data : [];

        const stats = res?.stats && typeof res.stats === "object"
            ? res.stats
            : calcStatsFromTentativas(tentativasData);

        quandoQuestionariosAtivo(() => {
            const ok = atualizarCardsQuestionarios(stats);
            logQZ("atualizarCardsQuestionarios retornou:", ok);
        });

        renderizarListaTentativas(tentativasData);
    } catch (err) {
        console.warn("Tentativas professor indisponível:", err?.message || err);

        quandoQuestionariosAtivo(() => {
            atualizarCardsQuestionarios({
                totalTentativas: 0,
                mediaAcertos: 0,
                feedbacksEnviados: 0,
                alunosAtivos: 0,
            });
        });

        renderizarListaTentativas([]);
    }
}

function renderizarListaTentativas(rows) {
    const ul = qs("#lista-questionarios");
    const count = qs("#count-questionarios");
    if (count) count.textContent = String(rows.length);
    if (!ul) return;

    if (!rows.length) {
        ul.innerHTML = `<li style="padding: 1rem; color:#666;">Nenhum resultado encontrado.</li>`;
        return;
    }

    ul.innerHTML = rows.map((t) => {
        const aluno = t.aluno_nome || "Aluno";
        const turma = t.turma_nome || "Turma";
        const materia = t.materia || t.area || "—";
        const pct = Number(t.percentual || 0);
        const badge = pct >= 70 ? "sucesso" : "aviso";

        const temFeedback = !!(t.feedback_id || t.tem_feedback);

        const idTentativa = t.tentativa_id || t.id;

        return `
      <li class="item-atividade" style="display:flex; justify-content:space-between; align-items:center; gap: 0.75rem;">
        <div style="display:flex; align-items:center; gap: 0.75rem;">
          <div class="icone-atividade"><i data-feather="check-square"></i></div>
          <div class="info-atividade">
            <strong>${escapeHtml(aluno)}</strong>
            <span>${escapeHtml(turma)} • ${escapeHtml(materia)} • ${temFeedback ? "Com feedback" : "Sem feedback"}</span>
          </div>
        </div>

        <span class="status-atividade ${badge}">${formatPct(pct)}%</span>

        <button type="button"
                class="botao botao-secundario"
                data-action="abrir-tentativa"
                data-id="${escapeHtml(idTentativa)}">
          Detalhar
        </button>
      </li>
    `;
    }).join("");

    if (window.feather) feather.replace();
}

async function abrirDetalheTentativa(tentativaId) {
    if (!tentativaId || String(tentativaId) === "undefined") {
        throw new Error("ID da tentativa está vazio/undefined. Verifique o retorno da API (id/tentativa_id).");
    }

    const res = await apiFetch(`/professor/questionarios/tentativas/${encodeURIComponent(tentativaId)}`);
    const data = res.data || res;

    setText("#quiz-titulo", data.questionario_titulo || "Quiz");
    setText("#quiz-subtitulo", `${data.aluno_nome || "Aluno"} • ${data.turma_nome || "Turma"}`);

    setText("#quiz-acertos", data.acertos ?? 0);
    setText("#quiz-erros", (data.total_questoes ?? 0) - (data.acertos ?? 0));
    setText("#quiz-total", data.total_questoes ?? 0);

    const pct = Number(data.percentual || 0);
    const bar = qs("#quiz-barra");
    const pctEl = qs("#quiz-percentual");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (pctEl) pctEl.textContent = `${formatPct(pct)}%`;

    const wrap = qs("#lista-questoes-detalhe");
    if (wrap) {
        const itens = Array.isArray(data.respostas) ? data.respostas : [];
        wrap.innerHTML = `
      <h3>Respostas Detalhadas</h3>
      ${itens.map((r, idx) => {
            const ok = r.acertou ? "✅" : "❌";
            return `
          <div class="cartao" style="margin-top: 0.75rem;">
            <strong>Questão ${idx + 1} ${ok}</strong>
            <p style="margin-top:0.5rem; color:#666;">
              Marcada: <strong>${escapeHtml(r.resposta_usuario || "-")}</strong>
              • Correta: <strong>${escapeHtml(r.resposta_correta || "-")}</strong>
            </p>
          </div>
        `;
        }).join("")}
    `;
    }

    if (window.feather) feather.replace();
}
