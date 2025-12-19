// front/js/config.js
"use strict";

/**
 * Config central do front (sem import/export).
 * Prioridade:
 * 1) window.API_BASE_OVERRIDE (injetado no HTML da Vercel)
 * 2) ?apiBase=https://... (querystring, para debug)
 * 3) localStorage.API_BASE_OVERRIDE (debug persistente)
 * 4) fallback inteligente: local -> http://localhost:3000
 */

(function () {
    function norm(base) {
        if (!base) return "";
        base = String(base).trim();
        // remove trailing slash
        base = base.replace(/\/+$/, "");
        return base;
    }

    function looksLikeUrl(s) {
        return /^https?:\/\/.+/i.test(s);
    }

    function getQueryParam(name) {
        try {
            return new URLSearchParams(window.location.search).get(name);
        } catch {
            return null;
        }
    }

    function defaultLocalApiBase() {
        // Se você abrir o front em 127.0.0.1:5501 ou localhost:5501, o back local normalmente está em localhost:3000
        // Não use window.location.hostname:3000 porque quando estiver na Vercel isso viraria "seuapp.vercel.app:3000" (errado)
        return "http://localhost:3000";
    }

    const fromWindow = norm(window.API_BASE_OVERRIDE);
    const fromQuery = norm(getQueryParam("apiBase"));
    const fromStorage = norm(localStorage.getItem("API_BASE_OVERRIDE"));

    let apiBase =
        (looksLikeUrl(fromWindow) && fromWindow) ||
        (looksLikeUrl(fromQuery) && fromQuery) ||
        (looksLikeUrl(fromStorage) && fromStorage) ||
        defaultLocalApiBase();

    window.APP_CONFIG = window.APP_CONFIG || {};
    window.APP_CONFIG.API_BASE = apiBase;

    window.APP_CONFIG.setApiBase = function (newBase) {
        const b = norm(newBase);
        if (!looksLikeUrl(b)) {
            console.error("[config] API_BASE inválido:", newBase);
            return;
        }
        localStorage.setItem("API_BASE_OVERRIDE", b);
        window.APP_CONFIG.API_BASE = b;
        console.log("[config] API_BASE atualizado:", b);
    };

    window.APP_CONFIG.clearApiBaseOverride = function () {
        localStorage.removeItem("API_BASE_OVERRIDE");
        window.APP_CONFIG.API_BASE = defaultLocalApiBase();
        console.log("[config] override removido. API_BASE:", window.APP_CONFIG.API_BASE);
    };

    console.log("[config] API_BASE =", window.APP_CONFIG.API_BASE);
})();