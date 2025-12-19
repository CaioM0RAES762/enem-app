// ../js/auto_avaliacao.js

const API_BASE = window.APP_CONFIG.API_BASE;


// ===== MENU USUÁRIO  =====
const avatarUsuario = document.getElementById("avatarUsuario");
const menuUsuario = document.getElementById("menuUsuario");

const nomeUsuarioEl = menuUsuario?.querySelector(".nome-usuario") || null;
const emailUsuarioEl = menuUsuario?.querySelector(".email-usuario") || null;

function redirectToLogin() {
    window.location.href = "./login.html";
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

function atualizarMenuUsuario(usuario) {
    if (!usuario) return;

    const nome = usuario.nome || usuario.name || usuario.username || "Usuário";
    const email = usuario.email || usuario.mail || "";

    if (avatarUsuario) avatarUsuario.textContent = nome?.charAt(0)?.toUpperCase() || "U";
    if (nomeUsuarioEl) nomeUsuarioEl.textContent = nome;
    if (emailUsuarioEl) emailUsuarioEl.textContent = email;
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
            redirectToLogin();
            return null;
        }

        atualizarMenuUsuario(user);
        return user;
    } catch {
        redirectToLogin();
        return null;
    }
}

function inicializarDropdownUsuario() {
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

// ===== AUTO AVALIAÇÃO (COM ESTADO SALVO) =====
const AUTO_AVALIACAO_STORAGE_KEY = "auto_avaliacao_estado_v1";

function lerEstadoAutoAvaliacao() {
    try {
        const raw = localStorage.getItem(AUTO_AVALIACAO_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        if (!parsed.sliders || typeof parsed.sliders !== "object") return null;
        return parsed;
    } catch {
        return null;
    }
}

function salvarEstadoAutoAvaliacao(estado) {
    try {
        localStorage.setItem(AUTO_AVALIACAO_STORAGE_KEY, JSON.stringify(estado));
    } catch { }
}

function obterChaveSlider(slider, index) {
    return slider.id || slider.name || slider.dataset?.topico || `idx_${index}`;
}

function obterNivel(valor) {
    if (valor >= 9) return { texto: "Expert", classe: "expert" };
    if (valor >= 7) return { texto: "Avançado", classe: "avancado" };
    if (valor >= 5) return { texto: "Intermediário", classe: "intermediario" };
    if (valor >= 3) return { texto: "Básico", classe: "basico" };
    return { texto: "Iniciante", classe: "iniciante" };
}

const sliders = document.querySelectorAll(".slider");

function aplicarUIParaSlider(slider) {
    const itemTopico = slider.closest(".item-topico");
    if (!itemTopico) return;

    const valorSlider = itemTopico.querySelector(".valor-slider");
    const badgeNivel = itemTopico.querySelector(".badge-nivel");
    const trackFill = itemTopico.querySelector(".slider-track-fill");

    const valor = parseInt(slider.value, 10);
    const porcentagem = ((valor - 1) / 9) * 100;

    if (valorSlider) valorSlider.textContent = `${valor}/10`;
    if (trackFill) trackFill.style.width = `${porcentagem}%`;

    const nivel = obterNivel(valor);
    if (badgeNivel) {
        badgeNivel.textContent = nivel.texto;
        badgeNivel.className = `badge-nivel ${nivel.classe}`;
    }
}

function atualizarProgresso() {
    if (!sliders.length) return;

    let total = 0;
    sliders.forEach((slider) => {
        total += parseInt(slider.value, 10);
    });

    const media = total / sliders.length;
    const porcentagem = Math.round((media / 10) * 100);

    const barra = document.getElementById("barraProgresso");
    const texto = document.getElementById("progressoTexto");

    if (barra) barra.style.width = `${porcentagem}%`;
    if (texto) texto.textContent = `${porcentagem}%`;
}

function salvarEstadoAtualDosSliders() {
    const slidersState = {};
    sliders.forEach((slider, index) => {
        slidersState[obterChaveSlider(slider, index)] = parseInt(slider.value, 10);
    });

    salvarEstadoAutoAvaliacao({
        version: 1,
        updatedAt: new Date().toISOString(),
        sliders: slidersState,
    });
}

function restaurarEstadoDosSliders() {
    const estado = lerEstadoAutoAvaliacao();
    if (!estado) return;

    sliders.forEach((slider, index) => {
        const key = obterChaveSlider(slider, index);
        const salvo = estado.sliders?.[key];
        if (typeof salvo === "number" && !Number.isNaN(salvo)) {
            slider.value = String(salvo);
        }
    });
}

function resetarAutoAvaliacao() {
    sliders.forEach((slider) => {
        slider.value = "1";
    });
    sliders.forEach((slider) => aplicarUIParaSlider(slider));
    atualizarProgresso();
    salvarEstadoAtualDosSliders();
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
    inicializarDropdownUsuario();
    await verificarUsuarioLogado();

    restaurarEstadoDosSliders();
    sliders.forEach((slider) => aplicarUIParaSlider(slider));
    atualizarProgresso();
    salvarEstadoAtualDosSliders();

    sliders.forEach((slider) => {
        slider.addEventListener("input", (e) => {
            aplicarUIParaSlider(e.target);
            atualizarProgresso();
            salvarEstadoAtualDosSliders();
        });
    });

    const btnResetAuto = document.getElementById("btnResetAuto");
    if (btnResetAuto) btnResetAuto.addEventListener("click", resetarAutoAvaliacao);

    const btnSalvarAuto = document.getElementById("btnSalvarAuto");
    if (btnSalvarAuto) btnSalvarAuto.addEventListener("click", salvarEstadoAtualDosSliders);
});