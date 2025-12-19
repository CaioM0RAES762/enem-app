
(function () {
    "use strict";

    // ==========================
    // CONFIG
    // ==========================
    const API_BASE = window.APP_CONFIG.API_BASE;


    const PATH_LOGIN_PAGE = "./login.html";

    const PATH_ALUNO_PAGE = "../htmlAlunos/dashboard.html";
    const PATH_PROFESSOR_PAGE = "../htmlProfessores/professores.html";

    const AUTH_ME_URL = `${API_BASE}/api/auth/me`;
    const AUTH_LOGOUT_URL = `${API_BASE}/api/auth/logout`;

    const LS_TOKEN_KEY = "auth_token";
    const LS_USER_KEY_1 = "userData";
    const LS_USER_KEY_2 = "user_data";

    let cachedUser = null;


    function redirectToLogin() {
        window.location.href = PATH_LOGIN_PAGE;
    }

    function toAbsolute(relPath) {
        return new URL(relPath, window.location.href).toString();
    }

    async function tryRedirectTo(relPath) {
        const url = toAbsolute(relPath);
        try {
            const r = await fetch(url, { method: "GET", cache: "no-store" });
            if (r.ok) {
                window.location.href = url;
                return true;
            }
        } catch (_) { }
        return false;
    }

    async function redirectByTipo(user) {
        const tipo = String(user?.tipo || "").toLowerCase();

        if (tipo === "professor") {
            const ok = await tryRedirectTo(PATH_PROFESSOR_PAGE);
            if (!ok) {
                console.error("❌ Página de professor não encontrada:", toAbsolute(PATH_PROFESSOR_PAGE));
            }
            return ok;
        }

        const ok = await tryRedirectTo(PATH_ALUNO_PAGE);
        if (!ok) {
            console.error("❌ Página do aluno não encontrada:", toAbsolute(PATH_ALUNO_PAGE));
        }
        return ok;
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
            nome: user.nome ?? user.name ?? "",
            email: user.email ?? "",
            tipo: user.tipo ?? "aluno",
        };
    }

    function safeJsonParse(txt) {
        try {
            return txt ? JSON.parse(txt) : {};
        } catch {
            return null;
        }
    }

    function readUserFromLocalStorage() {
        const raw1 = localStorage.getItem(LS_USER_KEY_1);
        const raw2 = localStorage.getItem(LS_USER_KEY_2);
        const raw = raw1 || raw2;
        if (!raw) return null;

        const parsed = safeJsonParse(raw);
        if (!parsed) return null;

        const u = parsed.user || parsed.usuario || parsed;
        const norm = normalizarUsuario(u);
        return norm || null;
    }

    function writeUserToLocalStorage(user) {
        const norm = normalizarUsuario(user);
        if (!norm) return;

        const payload = {
            success: true,
            user: { id: norm.id, nome: norm.nome, email: norm.email, tipo: norm.tipo },
        };

        localStorage.setItem(LS_USER_KEY_1, JSON.stringify(payload));
        localStorage.setItem(LS_USER_KEY_2, JSON.stringify(payload));
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

    // ==========================
    // FETCH PADRÃO 
    // ==========================
    async function fetchJson(url, options = {}) {
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

    async function apiFetch(pathOrUrl, options = {}) {
        const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
        return fetchJson(url, options);
    }

    // ==========================
    // AUTH PRINCIPAL
    // ==========================
    async function fetchMe() {
        let { ok, status, json } = await fetchJson(AUTH_ME_URL, { method: "GET" });

        if (!ok || status === 401 || status === 403 || !json?.success) {
            cachedUser = null;
            return null;
        }

        const user = normalizarUsuario(json.user || json.usuario || json);
        if (!user) {
            cachedUser = null;
            return null;
        }

        cachedUser = user;
        writeUserToLocalStorage(user);
        return user;
    }

    async function getLoggedUser({ force = false } = {}) {
        if (!force && cachedUser?.id) return cachedUser;

        if (!force) {
            const local = readUserFromLocalStorage();
            if (local?.id) {
                cachedUser = local;
                return local;
            }
        }

        return fetchMe();
    }

    async function requireAuth() {
        const user = await getLoggedUser({ force: true });
        if (!user?.id) {
            redirectToLogin();
            return null;
        }
        return user;
    }

    async function requireProfessor() {
        const user = await requireAuth();
        if (!user) return null;

        const tipo = String(user.tipo || "").toLowerCase();
        if (tipo !== "professor") {
            await redirectByTipo(user);
            return null;
        }
        return user;
    }

    async function requireAluno() {
        const user = await requireAuth();
        if (!user) return null;

        const tipo = String(user.tipo || "").toLowerCase();
        if (tipo !== "aluno") {
            await redirectByTipo(user);
            return null;
        }
        return user;
    }

    function getUserTipo(user) {
        return String(user?.tipo || "").toLowerCase() || "aluno";
    }

    function isProfessor(user) {
        return getUserTipo(user) === "professor";
    }

    function isAluno(user) {
        return getUserTipo(user) === "aluno";
    }

    async function logout() {
        try {
            await fetchJson(AUTH_LOGOUT_URL, { method: "POST" });
        } catch {
        }

        cachedUser = null;
        localStorage.removeItem(LS_TOKEN_KEY);
        localStorage.removeItem(LS_USER_KEY_1);
        localStorage.removeItem(LS_USER_KEY_2);

        redirectToLogin();
    }


    window.Auth = {
        API_BASE,
        apiFetch,
        fetchMe,
        getLoggedUser,
        requireAuth,
        requireProfessor,
        requireAluno,
        redirectByTipo,
        logout,
        getUserTipo,
        isProfessor,
        isAluno,
    };
})();

