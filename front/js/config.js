// config.js 
const API_BASE = window.APP_CONFIG.API_BASE;




const avatarUsuario = document.getElementById("avatarUsuario");
const menuUsuario = document.getElementById("menuUsuario");
const inputNome = document.getElementById("inputNome");
const formPerfil = document.getElementById("formPerfil");
const formSenha = document.getElementById("formSenha");
const inputSenhaAtual = document.getElementById("inputSenhaAtual");
const inputNovaSenha = document.getElementById("inputNovaSenha");
const inputConfirmarSenha = document.getElementById("inputConfirmarSenha");
const btnSairConta = document.getElementById("btnSairConta");
const btnAlterarFoto = document.getElementById("btnAlterarFoto");

const nomeUsuarioEl = menuUsuario?.querySelector(".nome-usuario") || document.querySelector(".nome-usuario");
const emailUsuarioEl = menuUsuario?.querySelector(".email-usuario") || document.querySelector(".email-usuario");

function redirectToLogin() {
    window.location.href = "./login.html";
}

function buildAuthHeaders() {
    const token = localStorage.getItem("auth_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...buildAuthHeaders(),
    };

    const resp = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
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

function extrairUserId(user) {
    if (!user) return null;
    return user.id ?? user.usuario_id ?? user.userId ?? user._id ?? user.uid ?? null;
}

function normalizarUsuario(user) {
    const id = extrairUserId(user);
    if (!id) return null;
    return { ...user, id };
}

// ========================
// Menu do Usuário
// ========================
function inicializarMenuUsuario() {
    if (!avatarUsuario || !menuUsuario) return;

    avatarUsuario.addEventListener("click", (e) => {
        e.stopPropagation();
        menuUsuario.classList.toggle("ativo");
    });

    document.addEventListener("click", (e) => {
        if (!menuUsuario.contains(e.target) && !avatarUsuario.contains(e.target)) {
            menuUsuario.classList.remove("ativo");
        }
    });

    menuUsuario.addEventListener("click", (e) => e.stopPropagation());
}

function atualizarUIUsuario(user) {
    const nome = user?.nome || user?.name || user?.username || "Usuário";
    const email = user?.email || user?.mail || "";

    const primeiraLetra = (nome || "U")[0].toUpperCase();

    document.querySelectorAll(".avatar-usuario, .avatar-perfil").forEach((av) => {
        av.textContent = primeiraLetra;
    });

    if (nomeUsuarioEl) nomeUsuarioEl.textContent = nome;
    if (emailUsuarioEl) emailUsuarioEl.textContent = email;

    if (inputNome) inputNome.value = nome;
}

// ========================
// Carregar dados do usuário 
// ========================
async function carregarDadosUsuario() {
    try {
        const { ok, status, json } = await fetchJson(`${API_BASE}/api/auth/me`, { method: "GET" });

        if (!ok || status === 401 || status === 403 || !json?.success || !json?.user) {
            throw new Error(json?.error || "Não autenticado");
        }

        const user = normalizarUsuario(json.user);
        if (!user) throw new Error("Usuário inválido (sem id)");

        atualizarUIUsuario(user);

        const papelUsuarioEl = document.querySelector(".papel-usuario");
        if (papelUsuarioEl && user.tipo) {
            const nodes = Array.from(papelUsuarioEl.childNodes);
            const textNode = nodes.find((n) => n.nodeType === Node.TEXT_NODE);
            const label = user.tipo.charAt(0).toUpperCase() + user.tipo.slice(1);
            if (textNode) {
                textNode.textContent = ` ${label}`;
            } else {
                papelUsuarioEl.appendChild(document.createTextNode(` ${label}`));
            }
        }

        console.log("[config] Dados do usuário carregados:", user);
        return user;
    } catch (error) {
        console.error("[config] Erro ao carregar dados:", error);
        mostrarNotificacao("Sessão expirada. Redirecionando para login...", "erro");
        setTimeout(() => redirectToLogin(), 1200);
        return null;
    }
}

// ========================
// Atualizar Perfil
// ========================
if (formPerfil) {
    formPerfil.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nome = (inputNome?.value || "").trim();
        if (!nome) {
            mostrarNotificacao("Por favor, preencha o nome", "erro");
            return;
        }

        const btnSubmit = formPerfil.querySelector('button[type="submit"]');
        const textoOriginal = btnSubmit ? btnSubmit.textContent : "";
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = "Salvando...";
        }

        try {
            const { ok, status, json } = await fetchJson(`${API_BASE}/api/auth/atualizar-perfil`, {
                method: "PUT",
                body: JSON.stringify({ nome }),
            });

            if (!ok || status === 401 || status === 403 || !json?.success) {
                throw new Error(json?.error || "Erro ao atualizar perfil");
            }

            mostrarNotificacao("Perfil atualizado com sucesso!", "sucesso");
            await carregarDadosUsuario();
        } catch (error) {
            console.error("[config] Erro ao atualizar perfil:", error);
            mostrarNotificacao(error?.message || "Erro ao atualizar perfil", "erro");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = textoOriginal;
            }
        }
    });
}

// ========================
// Alterar Senha
// ========================
if (formSenha) {
    formSenha.addEventListener("submit", async (e) => {
        e.preventDefault();

        const senhaAtual = inputSenhaAtual?.value || "";
        const novaSenha = inputNovaSenha?.value || "";
        const confirmarSenha = inputConfirmarSenha?.value || "";

        if (!senhaAtual || !novaSenha || !confirmarSenha) {
            mostrarNotificacao("Por favor, preencha todos os campos", "erro");
            return;
        }
        if (novaSenha.length < 6) {
            mostrarNotificacao("A nova senha deve ter no mínimo 6 caracteres", "erro");
            return;
        }
        if (novaSenha !== confirmarSenha) {
            mostrarNotificacao("As senhas não coincidem", "erro");
            return;
        }
        if (senhaAtual === novaSenha) {
            mostrarNotificacao("A nova senha deve ser diferente da atual", "erro");
            return;
        }

        const btnSubmit = formSenha.querySelector('button[type="submit"]');
        const textoOriginal = btnSubmit ? btnSubmit.textContent : "";
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = "Alterando...";
        }

        try {
            const { ok, status, json } = await fetchJson(`${API_BASE}/api/auth/alterar-senha`, {
                method: "PUT",
                body: JSON.stringify({ senhaAtual, novaSenha }),
            });

            if (!ok || status === 401 || status === 403 || !json?.success) {
                throw new Error(json?.error || "Erro ao alterar senha");
            }

            mostrarNotificacao("Senha alterada com sucesso!", "sucesso");
            formSenha.reset();
        } catch (error) {
            console.error("[config] Erro ao alterar senha:", error);
            mostrarNotificacao(error?.message || "Erro ao alterar senha", "erro");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = textoOriginal;
            }
        }
    });
}

// ========================
// Sair da Conta (Logout)
// ========================
function limparSessaoLocal() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_data");
}

if (btnSairConta) {
    btnSairConta.addEventListener("click", async () => {
        if (!confirm("Tem certeza que deseja sair da conta?")) return;

        btnSairConta.disabled = true;
        const textoOriginal = btnSairConta.innerHTML;
        btnSairConta.innerHTML = "Saindo...";

        try {
            const { ok, status, json } = await fetchJson(`${API_BASE}/api/auth/logout`, { method: "POST" });

            if (!ok || status === 401 || status === 403 || !json?.success) {
                // mesmo se falhar no backend, limpa local e redireciona
                throw new Error(json?.error || "Erro ao fazer logout");
            }

            mostrarNotificacao("Logout realizado com sucesso!", "sucesso");
        } catch (error) {
            console.error("[config] Erro ao fazer logout:", error);
            mostrarNotificacao("Saindo...", "info");
        } finally {
            limparSessaoLocal();
            setTimeout(() => redirectToLogin(), 600);
            btnSairConta.disabled = false;
            btnSairConta.innerHTML = textoOriginal;
        }
    });
}

if (btnAlterarFoto) {
    btnAlterarFoto.addEventListener("click", () => {
        mostrarNotificacao("Funcionalidade de upload de foto em desenvolvimento", "info");
    });
}

// ========================
// Sistema de Notificações
// ========================
function mostrarNotificacao(mensagem, tipo = "info") {
    const existente = document.querySelector(".notificacao");
    if (existente) existente.remove();

    const notificacao = document.createElement("div");
    notificacao.className = `notificacao notificacao-${tipo}`;

    const icones = {
        sucesso: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>`,
        erro: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`,
        info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>`,
    };

    notificacao.innerHTML = `${icones[tipo] || icones.info}<span>${mensagem}</span>`;
    document.body.appendChild(notificacao);

    setTimeout(() => notificacao.classList.add("mostrar"), 10);

    setTimeout(() => {
        notificacao.classList.remove("mostrar");
        setTimeout(() => notificacao.remove(), 300);
    }, 4000);
}

// ========================
// Inicialização
// ========================
document.addEventListener("DOMContentLoaded", async () => {
    inicializarMenuUsuario();
    await carregarDadosUsuario();
});