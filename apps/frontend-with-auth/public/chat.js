/**
 * MCP Chatbot — frontend for the OAuth 2.0 Authorization Code + PKCE flow.
 *
 * Architecture overview:
 *  - The backend issues an opaque session ID (UUID) via POST /api/auth/session.
 *  - The frontend stores it in localStorage and sends it as a Bearer token on every request.
 *  - OAuth tokens (access / refresh) never leave the backend; the session ID is the
 *    only credential the frontend ever sees.
 *  - The OAuth flow is backend-initiated: the backend builds the authorization URL,
 *    the user's browser follows it, and the AS redirects to the backend callback which
 *    exchanges the code for tokens and redirects the browser back here.
 */

/** Base URL of the backend API. Injected at build time via window.BACKEND_URL, falls back to localhost. */
const BACKEND = window.BACKEND_URL || "http://localhost:3000";

// --- DOM references ---
const chat = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const resetBtn = document.getElementById("reset");
const subtitle = document.getElementById("subtitle");

// --- Session / auth state ---

/** localStorage key for the opaque session ID issued by the backend. */
const SESSION_KEY = "mcp_chat_user_id";
/** localStorage key for the boolean flag that tracks whether OAuth has completed. */
const AUTH_KEY = "mcp_chat_authenticated";

/**
 * Opaque session ID (UUID) issued by POST /api/auth/session.
 * Used as the Bearer token in Authorization headers.
 * Null until the user explicitly clicks "Log in".
 * @type {string | null}
 */
let userId = localStorage.getItem(SESSION_KEY);

/**
 * Whether the OAuth flow has been completed for the current session.
 * Persisted in localStorage so it survives page reloads.
 * @type {boolean}
 */
let authenticated = localStorage.getItem(AUTH_KEY) === "true";

// --- Auth banner ---

/**
 * Banner element injected above the chat area.
 * Shown when the user is not authenticated; hidden once they are.
 */
const authBanner = document.createElement("div");
authBanner.id = "auth-banner";
authBanner.className = "auth-banner";
authBanner.hidden = true;
document.querySelector("main").before(authBanner);

/**
 * Re-renders the auth banner based on the current `authenticated` state.
 * Also toggles the composer form visibility accordingly.
 */
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

/**
 * Initiates the OAuth login flow when the user clicks "Log in".
 *
 * A single POST /api/auth/login handles everything:
 *  - No session yet  → backend creates one and returns { userId, authorizationUrl }.
 *  - Existing session, pending  → backend returns { authorizationUrl }.
 *  - Existing session, authenticated → backend returns { alreadyAuthenticated: true }.
 */
async function startLogin() {
  const btn = document.getElementById("login-btn");
  if (btn) btn.disabled = true;

  try {
    // Send the session ID if we have one; omit the header otherwise so the backend
    // knows to create a fresh session. The ID is kept in the header (not the URL) to
    // stay out of server access logs and Referer headers.
    const res = await fetch(`${BACKEND}/api/auth/login`, {
      method: "POST",
      headers: userId ? { Authorization: `Bearer ${userId}` } : {},
    });
    const data = await res.json();

    if (data.userId) {
      // Backend issued a new session ID — persist it for all subsequent requests.
      userId = data.userId;
      localStorage.setItem(SESSION_KEY, userId);
    }

    if (data.alreadyAuthenticated) {
      authenticated = true;
      localStorage.setItem(AUTH_KEY, "true");
      renderAuthBanner();
      return;
    }

    if (data.authorizationUrl) {
      // Redirect the browser to the AS so the user can authenticate.
      window.location.href = data.authorizationUrl;
    }
  } catch (err) {
    authBanner.innerHTML = `<span class="auth-error">Login failed: ${err.message}. <button id="login-btn" class="login-btn">Retry</button></span>`;
    document.getElementById("login-btn").addEventListener("click", startLogin);
  }
}

/**
 * Called once on page load to restore session state.
 *
 * Handles the ?auth=success redirect that the backend appends after a successful
 * OAuth callback, then renders the appropriate UI (banner or composer).
 */
async function initSession() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("auth") === "success") {
    // The backend completed the OAuth code exchange and redirected here.
    // Mark the session as authenticated and clean up the URL.
    authenticated = true;
    localStorage.setItem(AUTH_KEY, "true");
    window.history.replaceState({}, "", window.location.pathname);
    appendMessage("assistant", "You are now logged in. How can I help you?");
  }

  renderAuthBanner();
}

// --- Config ---

/**
 * Fetches runtime config from the backend and displays it in the subtitle bar.
 * Fails silently — config is informational only.
 */
async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND}/api/chat/config`);
    const cfg = await res.json();
    subtitle.textContent = `Model: ${cfg.ollama.model} · MCP: ${cfg.mcp.baseUrl}`;
  } catch (_err) {
    subtitle.textContent = "Could not load config";
  }
}

// --- Markdown rendering ---

if (window.marked) {
  marked.setOptions({ gfm: true, breaks: true });
}

/**
 * Converts markdown text to sanitized HTML.
 * Returns null if marked or DOMPurify are not available (safe fallback to plain text).
 *
 * @param {string} text - Raw markdown string.
 * @returns {string | null} Sanitized HTML string, or null.
 */
function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) return null;
  const rawHtml = marked.parse(text ?? "");
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ["target", "rel"] });
}

// --- Chat rendering ---

/**
 * Appends a message bubble to the chat area and scrolls it into view.
 *
 * @param {"user" | "assistant" | "error"} role - Who sent the message.
 * @param {string} content - Message text (markdown supported for assistant messages).
 * @param {{ tools?: string[] }} [opts] - Optional metadata. `tools` lists MCP tool names used.
 * @returns {HTMLDivElement} The created DOM node.
 */
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
    // Open all assistant-generated links in a new tab safely.
    body.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  } else {
    body.textContent = content;
  }
  node.appendChild(body);

  if (opts.tools?.length) {
    const t = document.createElement("div");
    t.className = "tools";
    t.textContent = "Used tools: " + opts.tools.join(", ");
    node.appendChild(t);
  }

  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

/** Inserts a "Thinking..." placeholder that is replaced once the response arrives. */
function showTyping() {
  const node = document.createElement("div");
  node.className = "typing";
  node.textContent = "Thinking...";
  node.id = "typing";
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

/** Removes the typing indicator inserted by {@link showTyping}. */
function removeTyping() {
  document.getElementById("typing")?.remove();
}

// --- Input handling ---

// Auto-grow the textarea up to 180 px as the user types.
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
});

// Submit on Enter; Shift+Enter inserts a newline instead.
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// Clear conversation history and the chat UI.
resetBtn.addEventListener("click", () => {
  history = [];
  chat.innerHTML = "";
});

// --- Submit ---

/**
 * Conversation history sent to the backend on every request.
 * The backend forwards it to Ollama so the model has full context.
 * @type {Array<{ role: string, content: string }>}
 */
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
        Authorization: `Bearer ${userId}`,
      },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    removeTyping();

    if (res.status === 401 && data.loginRequired) {
      // The session's OAuth tokens have expired or were never issued.
      // Discard the stale session entirely so startLogin() creates a fresh one
      // instead of re-sending the old (now invalid) token.
      authenticated = false;
      userId = null;
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(SESSION_KEY);
      history.pop(); // remove the unanswered user message from context
      renderAuthBanner();
      appendMessage("error", "Your session has expired. Please log in again.");
      return;
    }

    if (!data.ok) {
      appendMessage("error", data.error || "Unknown error");
      return;
    }

    // Extract which MCP tools the model invoked from the execution trace.
    const tools = (data.trace ?? []).filter((t) => t.step.startsWith("tool_")).map((t) => t.step.replace("tool_", ""));

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
