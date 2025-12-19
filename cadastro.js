document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const showRegisterLink = document.getElementById("showRegister");
  const showLoginLink = document.getElementById("showLogin");

  if (!loginForm || !registerForm || !showRegisterLink || !showLoginLink) {
    console.error("❌ cadastro.js: IDs do HTML não encontrados.", {
      loginForm: !!loginForm,
      registerForm: !!registerForm,
      showRegisterLink: !!showRegisterLink,
      showLoginLink: !!showLoginLink,
    });
    return;
  }

  // =========================
  // CONFIG
  // =========================
  const API_URL = "http://localhost:3000"; 

  const PATH_PROFESSOR_PAGE = "professores.html";
  const PATH_ALUNO_PAGE = "dashboard.html";


  showRegisterLink.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.remove("active");
    registerForm.classList.add("active");
  });

  showLoginLink.addEventListener("click", (e) => {
    e.preventDefault();
    registerForm.classList.remove("active");
    loginForm.classList.add("active");
  });

  function showMessage(message, isError = false) {
    const messageDiv = document.createElement("div");
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 25px;
      border-radius: 8px;
      background-color: ${isError ? "#ef4444" : "#10b981"};
      color: white;
      font-weight: 600;
      box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      z-index: 999999;
    `;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
      if (messageDiv && messageDiv.parentNode) messageDiv.parentNode.removeChild(messageDiv);
    }, 3000);
  }

  function saveToken(token) {
    localStorage.setItem("auth_token", token);
  }
  function saveUser(user) {
    localStorage.setItem("user_data", JSON.stringify(user));
  }
  function getToken() {
    return localStorage.getItem("auth_token");
  }
  function clearAuth() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_data");
  }

  async function safeJson(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { success: false, error: `Resposta não-JSON do servidor: ${text.slice(0, 200)}` };
    }
  }

  function toAbsolute(relPath) {
    return new URL(relPath, window.location.href).toString();
  }

  async function tryRedirectTo(relPath, labelForError) {
    const url = toAbsolute(relPath);
    try {
      const r = await fetch(url, { method: "GET", cache: "no-store" });
      if (r.ok) {
        window.location.href = url;
        return true;
      }
    } catch (_) { }
    console.error(`❌ Página não encontrada (${labelForError}):`, url);
    return false;
  }

  async function redirectByUserType(user) {
    const tipo = String(user?.tipo || "").toLowerCase();

    if (tipo === "professor") {
      const ok = await tryRedirectTo(PATH_PROFESSOR_PAGE, "professores");
      if (!ok) showMessage("Página de professor não encontrada (veja Console/F12).", true);
      return;
    }

    const ok = await tryRedirectTo(PATH_ALUNO_PAGE, "dashboard aluno");
    if (!ok) showMessage("Dashboard do aluno não encontrado (veja Console/F12).", true);
  }


  async function apiLogin(email, senha) {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, senha }),
    });
    const data = await safeJson(response);
    return { response, data };
  }

  async function apiCadastro(nome, email, senha, tipo) {
    const response = await fetch(`${API_URL}/api/auth/cadastro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nome, email, senha, tipo }),
    });
    const data = await safeJson(response);
    return { response, data };
  }

  async function apiMeWithCookieOrBearer() {

    let response = await fetch(`${API_URL}/api/auth/me`, {
      method: "GET",
      credentials: "include",
    });
    let data = await safeJson(response);
    if (response.ok && data.success) return { response, data };

    const token = getToken();
    if (!token) return { response, data };

    response = await fetch(`${API_URL}/api/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    data = await safeJson(response);
    return { response, data };
  }

  // =========================
  // LOGIN
  // =========================
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail")?.value.trim();
    const senha = document.getElementById("loginSenha")?.value;

    if (!email || !senha) {
      showMessage("Preencha todos os campos", true);
      return;
    }

    const btn = loginForm.querySelector(".btn");
    const originalText = btn?.textContent || "Entrar";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Entrando...";
    }

    try {
      const { response, data } = await apiLogin(email, senha);

      if (!response.ok) {
        showMessage(data.error || `Erro HTTP ${response.status}`, true);
        return;
      }

      if (data.success) {
        if (data.token) saveToken(data.token);
        if (data.user) saveUser(data.user);

        showMessage("Login realizado com sucesso!");
        setTimeout(() => redirectByUserType(data.user), 250);
      } else {
        showMessage(data.error || "Erro ao fazer login", true);
      }
    } catch (err) {
      console.error("Erro ao fazer login (fetch):", err);
      showMessage("Erro ao conectar ao servidor (veja Console/F12)", true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });

  // =========================
  // CADASTRO
  // =========================
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("cadNome")?.value.trim();
    const email = document.getElementById("cadEmail")?.value.trim();
    const senha = document.getElementById("cadSenha")?.value;
    const tipo = document.getElementById("cadTipo")?.value;

    if (!nome || !email || !senha || !tipo) {
      showMessage("Preencha todos os campos", true);
      return;
    }

    if (senha.length < 6) {
      showMessage("A senha deve ter no mínimo 6 caracteres", true);
      return;
    }

    const btn = registerForm.querySelector(".btn");
    const originalText = btn?.textContent || "Cadastrar";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Cadastrando...";
    }

    try {
      const { response, data } = await apiCadastro(nome, email, senha, tipo);

      if (!response.ok) {
        showMessage(data.error || `Erro HTTP ${response.status}`, true);
        return;
      }

      if (data.success) {
        if (data.token) saveToken(data.token);
        if (data.user) saveUser(data.user);

        showMessage("Cadastro realizado com sucesso!");
        setTimeout(() => redirectByUserType(data.user), 250);
      } else {
        showMessage(data.error || "Erro ao fazer cadastro", true);
      }
    } catch (err) {
      console.error("Erro ao fazer cadastro (fetch):", err);
      showMessage("Erro ao conectar ao servidor (veja Console/F12)", true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });

  // =========================
  // AUTO-LOGIN
  // =========================
  (async () => {
    const hasToken = !!getToken();
    if (!hasToken) {
      try {
        const { response, data } = await apiMeWithCookieOrBearer();
        if (response.ok && data.success) {
          redirectByUserType(data.user);
        }
      } catch (_) { }
      return;
    }

    try {
      const { response, data } = await apiMeWithCookieOrBearer();

      if (response.ok && data.success) {
        saveUser(data.user);
        redirectByUserType(data.user);
      } else {
        clearAuth();
      }
    } catch (err) {
      console.error("Erro ao verificar autenticação:", err);
      clearAuth();
    }
  })();
});
