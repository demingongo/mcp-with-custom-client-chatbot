// This is a simple frontend for the MCP client chatbot with OAuth2 authorization code flow.

const BACKEND = window.BACKEND_URL || "http://localhost:3000";

const chat = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const resetBtn = document.getElementById("reset");
const subtitle = document.getElementById("subtitle");

// --- Session / auth state ---
// userId is an opaque session ID issued by the backend (POST /api/auth/session).
// It is bound to the user's OAuth tokens after they complete the login flow.
const SESSION_KEY = "mcp_chat_user_id";
const AUTH_KEY = "mcp_chat_authenticated";

let userId = localStorage.getItem(SESSION_KEY);
let authenticated = localStorage.getItem(AUTH_KEY) === "true";

// --- Auth banner (injected above the chat area) ---
const authBanner = document.createElement("div");
authBanner.id = "auth-banner";
authBanner.className = "auth-banner";
authBanner.hidden = true;
document.querySelector("main").before(authBanner);

function renderAuthBanner() {
  if (authenticated) {
    authBanner.hidden = true;
    form.hidden = false;
  } else {
    authBanner.hidden = false;
    authBanner.innerHTML = `
      <span>You must log in before using the assistant.</span>
      <button id="login-btn" class="login-btn">Log in</button>
    `;
    document.getElementById("login-btn").addEventListener("click", startLogin);
    form.hidden = true;
  }
}

async function startLogin() {
  const btn = document.getElementById("login-btn");
  if (btn) btn.disabled = true;
  try {
    // Create a session on demand — only when the user explicitly wants to log in.
    if (!userId) {
      const sessionRes = await fetch(`${BACKEND}/api/auth/session`, { method: "POST" });
      const sessionData = await sessionRes.json();
      userId = sessionData.userId;
      localStorage.setItem(SESSION_KEY, userId);
    }

    const res = await fetch(`${BACKEND}/api/auth/login`, {
      headers: { Authorization: `Bearer ${userId}` },
    });
    const data = await res.json();
    if (data.alreadyAuthenticated) {
      authenticated = true;
      localStorage.setItem(AUTH_KEY, "true");
      renderAuthBanner();
      return;
    }
    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
    }
  } catch (err) {
    authBanner.innerHTML = `<span class="auth-error">Login failed: ${err.message}. <button id="login-btn" class="login-btn">Retry</button></span>`;
    document.getElementById("login-btn").addEventListener("click", startLogin);
  }
}

async function initSession() {
  // After OAuth callback the backend redirects here with ?auth=success.
  const params = new URLSearchParams(window.location.search);
  if (params.get("auth") === "success") {
    authenticated = true;
    localStorage.setItem(AUTH_KEY, "true");
    window.history.replaceState({}, "", window.location.pathname);
    appendMessage("assistant", "You are now logged in. How can I help you?");
  }

  renderAuthBanner();
}

// --- Config ---
async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND}/api/chat/config`);
    const cfg = await res.json();
    subtitle.textContent = `Model: ${cfg.ollama.model} · MCP: ${cfg.mcp.baseUrl}`;
  } catch (_err) {
    subtitle.textContent = "Could not load config";
  }
}

// --- Markdown ---
if (window.marked) {
  marked.setOptions({ gfm: true, breaks: true });
}

function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) return null;
  const rawHtml = marked.parse(text ?? "");
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ["target", "rel"] });
}

// --- Chat rendering ---
function appendMessage(role, content, opts = {}) {
  const node = document.createElement("div");
  node.className = `msg ${role}`;
  if (role !== "error") {
    const tag = document.createElement("div");
    tag.className = "role";
    tag.textContent = role === "user" ? "You" : "Assistant";
    node.appendChild(tag);
  }
  const body = document.createElement("div");
  body.className = "body";
  const html = role === "assistant" ? renderMarkdown(content) : null;
  if (html) {
    body.innerHTML = html;
    body.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  } else {
    body.textContent = content;
  }
  node.appendChild(body);
  if (opts.tools && opts.tools.length) {
    const t = document.createElement("div");
    t.className = "tools";
    t.textContent = "Used tools: " + opts.tools.join(", ");
    node.appendChild(t);
  }
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function showTyping() {
  const node = document.createElement("div");
  node.className = "typing";
  node.textContent = "Thinking...";
  node.id = "typing";
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function removeTyping() {
  document.getElementById("typing")?.remove();
}

// --- Input handling ---
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

resetBtn.addEventListener("click", () => {
  history = [];
  chat.innerHTML = "";
});

// --- Submit ---
let history = [];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  history.push({ role: "user", content: text });
  input.value = "";
  input.style.height = "auto";
  input.disabled = true;
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch(`${BACKEND}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userId}`,
      },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    removeTyping();

    // Tokens expired or were never issued — discard the stale session entirely so
    // startLogin() will request a fresh one instead of reusing the old token.
    if (res.status === 401 && data.loginRequired) {
      authenticated = false;
      userId = null;
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(SESSION_KEY);
      renderAuthBanner();
      appendMessage("error", "Your session has expired. Please log in again.");
      history.pop(); // remove the unanswered user message
      return;
    }

    if (!data.ok) {
      appendMessage("error", data.error || "Unknown error");
      return;
    }

    const tools = (data.trace || [])
      .filter((t) => t.step.startsWith("tool_"))
      .map((t) => t.step.replace("tool_", ""));

    appendMessage("assistant", data.reply, { tools });
    history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    removeTyping();
    appendMessage("error", err.message || String(err));
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

// --- Init ---
loadConfig();
initSession();
appendMessage(
  "assistant",
  'Hi — ask me anything about ConnectAuz products. Try: "What does CA Fleet do?" or "Compare CA POS and CA Workforce."'
);

