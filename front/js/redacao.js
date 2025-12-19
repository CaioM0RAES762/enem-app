/* redacao.js */
(function () {
    "use strict";

    // ===== Config =====
    const API_BASE = `http://${window.location.hostname}:3000`;
    const API_URL = `${API_BASE}/api`;
    const AUTH_ME_URL = `${API_BASE}/api/auth/me`;

    const LS_TOKEN_KEY = "auth_token";
    const LS_USER_KEY_1 = "userData";
    const LS_USER_KEY_2 = "user_data";

    const MAX_CARACTERES = 1800;

    const temas = [
        {
            titulo: "O impacto das fake news na democracia brasileira",
            contexto:
                "A disseminação de notícias falsas tem afetado o debate público. Discuta os impactos das fake news na sociedade e apresente medidas para combater esse problema.",
        },
        {
            titulo: "A importância da saúde mental no Brasil contemporâneo",
            contexto:
                "Os transtornos mentais afetam milhões de brasileiros. Discuta a importância de políticas públicas voltadas para a saúde mental e proponha soluções.",
        },
        {
            titulo: "Desafios da mobilidade urbana nas grandes cidades",
            contexto:
                "O trânsito caótico e a falta de transporte público de qualidade afeta a população. Analise os desafios da mobilidade urbana e apresente propostas de intervenção.",
        },
        {
            titulo: "A educação digital e o acesso à tecnologia no Brasil",
            contexto:
                "A pandemia evidenciou as desigualdades no acesso à educação digital. Discuta os desafios e apresente medidas para democratizar o acesso à tecnologia.",
        },
    ];

    let currentUser = null;
    let redacaoAtualId = null;

    function redirectToLogin() {
        window.location.href = "./login.html";
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
        return user.id ?? user.usuario_id ?? user.userId ?? user._id ?? user.uid ?? user.id_usuario ?? null;
    }

    function normalizarUsuario(user) {
        if (!user || typeof user !== "object") return null;

        const id = extrairUserId(user);
        if (!id) return null;

        const email =
            user.email ?? user.mail ?? user.usuario_email ?? user.user_email ?? user.login ?? "";

        const nome =
            user.nome ?? user.name ?? user.username ?? user.full_name ?? user.nome_completo ?? "";

        const nomeDerivado =
            !nome && email ? email.split("@")[0].replace(/[._-]+/g, " ") : "";

        return {
            ...user,
            id,
            nome: (nome || nomeDerivado || "Usuário").trim(),
            email: String(email || "").trim(),
        };
    }

    function readUserFromLocalStorage() {
        const raw1 = localStorage.getItem(LS_USER_KEY_1);
        const raw2 = localStorage.getItem(LS_USER_KEY_2);
        const raw = raw1 || raw2;
        if (!raw) return null;

        const parsed = safeJsonParse(raw);
        if (!parsed) return null;

        const u = parsed.user || parsed.usuario || parsed;
        return normalizarUsuario(u);
    }

    function getAuthToken() {
        return localStorage.getItem(LS_TOKEN_KEY) || "";
    }

    function buildAuthHeaders(extra = {}) {
        const token = getAuthToken();
        return {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extra,
        };
    }

    async function fetchMeFallback() {
        const resp = await fetch(AUTH_ME_URL, {
            method: "GET",
            credentials: "include",
            headers: buildAuthHeaders(),
        });

        const text = await resp.text();
        const json = safeJsonParse(text) ?? { success: false, error: text };

        if (!resp.ok || resp.status === 401 || resp.status === 403) return null;

        const candidato =
            json?.user || json?.usuario || json?.data?.user || json?.data?.usuario || json;

        const u = normalizarUsuario(candidato);
        if (!json?.success && !u?.id) return null;

        return u?.id ? u : null;
    }

    async function getLoggedUser() {
        if (window.Auth?.getLoggedUser) {
            const u = await window.Auth.getLoggedUser({ force: true });
            return u?.id ? normalizarUsuario(u) : null;
        }

        const local = readUserFromLocalStorage();
        if (local?.id) return local;

        return fetchMeFallback();
    }

    async function requireAuth() {
        const u = await getLoggedUser();
        if (!u?.id) {
            console.warn("[redacao] usuário não autenticado -> redirect login");
            redirectToLogin();
            return null;
        }
        return u;
    }

    function atualizarMenuUsuario(user) {
        const u = normalizarUsuario(user);
        if (!u) return;

        const avatarEl = document.getElementById("avatarUsuario");
        const nomeEl = document.getElementById("nomeUsuario");
        const emailEl = document.getElementById("emailUsuario");

        if (avatarEl) {
            const base = (u.nome || u.email || "U").trim();
            avatarEl.textContent = (base[0] || "U").toUpperCase();
            avatarEl.title = u.nome || u.email || "Usuário";
        }

        if (nomeEl) nomeEl.textContent = u.nome || "Usuário";
        if (emailEl) emailEl.textContent = u.email || "";
    }

    function inicializarMenuUsuario() {
        const avatarUsuario = document.getElementById("avatarUsuario");
        const menuUsuario = document.getElementById("menuUsuario");
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
    }

    function setUserHeaderIfExists(user) {
        const nomeEl = document.getElementById("usuarioNome");
        const emailEl = document.getElementById("usuarioEmail");
        if (nomeEl) nomeEl.textContent = user?.nome || "";
        if (emailEl) emailEl.textContent = user?.email || "";
    }

    function contarPalavras(texto) {
        return texto
            .trim()
            .split(/\s+/)
            .filter((p) => p.length > 0).length;
    }

    function mostrarAlertaSucesso(mensagem) {
        const alerta = document.createElement("div");
        alerta.classList.add("alerta-sucesso");

        alerta.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${mensagem}</span>
    `;

        document.body.appendChild(alerta);

        setTimeout(() => alerta.classList.add("mostrar"), 100);

        setTimeout(() => {
            alerta.classList.remove("mostrar");
            setTimeout(() => alerta.remove(), 400);
        }, 3000);
    }

    async function apiFetch(path, options = {}) {
        if (window.Auth?.apiFetch) return window.Auth.apiFetch(path, options);

        const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
        const resp = await fetch(url, {
            method: options.method || "GET",
            credentials: "include",
            headers: buildAuthHeaders(options.headers || {}),
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const text = await resp.text();
        const json = safeJsonParse(text) ?? { success: false, error: text };
        return { ok: resp.ok, status: resp.status, json };
    }

    // ===== Main =====
    document.addEventListener("DOMContentLoaded", async () => {
        console.log("[redacao] iniciando…");
        console.log("[redacao] API_BASE:", API_BASE);
        console.log("[redacao] Auth disponível?", !!window.Auth);

        inicializarMenuUsuario();

        currentUser = await requireAuth();
        if (!currentUser?.id) return;

        atualizarMenuUsuario(currentUser);
        setUserHeaderIfExists(currentUser);

        console.log("[redacao] usuário autenticado:", currentUser.id, currentUser.email || "");

        const textoRedacao = document.getElementById("textoRedacao");
        const contadorPalavras = document.getElementById("contadorPalavras");
        const contadorCaracteres = document.getElementById("contadorCaracteres");
        const percentualPreenchido = document.getElementById("percentualPreenchido");
        const barraProgresso = document.getElementById("barraProgresso");
        const btnSalvar = document.getElementById("btnSalvar");
        const alertaErro = document.getElementById("alertaErro");
        const btnFecharDica = document.getElementById("btnFecharDica");
        const alertaDica = document.querySelector(".alerta-dica");
        const btnSortear = document.getElementById("btnSortear");
        const temaAtual = document.getElementById("temaAtual");
        const contextoTema = document.getElementById("contextoTema");

        function atualizarContadores() {
            if (!textoRedacao) return;

            const texto = textoRedacao.value;
            const numPalavras = contarPalavras(texto);
            const numCaracteres = texto.length;
            const percentual = Math.min((numCaracteres / MAX_CARACTERES) * 100, 100);

            if (contadorPalavras) contadorPalavras.textContent = String(numPalavras);
            if (contadorCaracteres) contadorCaracteres.textContent = `${numCaracteres}/${MAX_CARACTERES}`;
            if (percentualPreenchido) percentualPreenchido.textContent = Math.round(percentual) + "%";
            if (barraProgresso) barraProgresso.style.width = percentual + "%";
        }

        if (textoRedacao) textoRedacao.addEventListener("input", atualizarContadores);

        if (btnFecharDica && alertaDica) {
            btnFecharDica.addEventListener("click", () => alertaDica.classList.add("oculto"));
        }

        if (btnSortear && temaAtual && contextoTema && textoRedacao) {
            btnSortear.addEventListener("click", () => {
                const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
                temaAtual.textContent = temaAleatorio.titulo;
                contextoTema.textContent = temaAleatorio.contexto;

                textoRedacao.value = "";
                atualizarContadores();
                redacaoAtualId = null;
            });
        }

        if (btnSalvar && textoRedacao && temaAtual && contextoTema && alertaErro) {
            btnSalvar.addEventListener("click", async () => {
                const texto = textoRedacao.value.trim();
                const numCaracteres = texto.length;

                if (numCaracteres < 1000) {
                    alertaErro.classList.remove("oculto");
                    const msgEl = document.getElementById("mensagemErro");
                    if (msgEl) {
                        msgEl.innerText =
                            "Sua redação ainda está muito curta. Ela precisa ter no mínimo 1000 caracteres.";
                    }
                    return;
                }

                alertaErro.classList.add("oculto");

                const dadosRedacao = {
                    usuario_id: currentUser.id,
                    tema: temaAtual.textContent,
                    contexto: contextoTema.textContent,
                    texto,
                    palavras: contarPalavras(texto),
                    caracteres: numCaracteres,
                    status: "enviada",
                };

                try {
                    const { ok, status, json } = await apiFetch("/api/redacoes", {
                        method: "POST",
                        body: dadosRedacao,
                    });

                    if (!ok) {
                        console.error("[redacao] falha POST /api/redacoes:", status, json);
                        const msg = json?.erro || json?.error || "Erro ao salvar redação";
                        throw new Error(msg);
                    }

                    redacaoAtualId = json?.id || json?.dados?.id || null;

                    const original = btnSalvar.innerHTML;
                    btnSalvar.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg> Redação Salva!`;
                    btnSalvar.style.background = "#22c55e";

                    mostrarAlertaSucesso("Redação salva com sucesso no banco de dados!");

                    setTimeout(() => {
                        btnSalvar.innerHTML = original;
                        btnSalvar.style.background = "#1a1a1a";
                        textoRedacao.value = "";
                        atualizarContadores();
                    }, 2000);
                } catch (error) {
                    console.error("[redacao] erro ao salvar:", error);
                    alertaErro.classList.remove("oculto");
                    const msgEl = document.getElementById("mensagemErro");
                    if (msgEl) {
                        msgEl.innerText =
                            error?.message || "Erro ao salvar redação. Verifique se o servidor está rodando.";
                    }
                }
            });
        }

        async function carregarUltimoRascunho() {
            try {
                const { ok, status, json } = await apiFetch(
                    `/api/redacoes/rascunho/${currentUser.id}`,
                    { method: "GET" }
                );

                console.log("[redacao] rascunho resp:", status, json);
                if (!ok) return;

                const rascunho = json;
                if (rascunho && rascunho.texto_redacao && textoRedacao) {
                    textoRedacao.value = rascunho.texto_redacao;
                    if (temaAtual) temaAtual.textContent = rascunho.tema || temaAtual.textContent;
                    if (contextoTema && rascunho.contexto) contextoTema.textContent = rascunho.contexto;
                    redacaoAtualId = rascunho.id || null;
                    atualizarContadores();
                }
            } catch {
                console.log("[redacao] nenhum rascunho encontrado ou servidor offline");
            }
        }

        await carregarUltimoRascunho();
    });
})();
