const BACKEND = window.BACKEND_URL || "http://localhost:3000";

const chat = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const resetBtn = document.getElementById("reset");
const subtitle = document.getElementById("subtitle");

let history = [];

async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND}/api/chat/config`);
    const cfg = await res.json();
    subtitle.textContent = `Model: ${cfg.ollama.model} · MCP: ${cfg.mcp.baseUrl}`;
  } catch (_err) {
    subtitle.textContent = "Could not load config";
  }
}

if (window.marked) {
  marked.setOptions({ gfm: true, breaks: true });
}

function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) return null;
  const rawHtml = marked.parse(text ?? "");
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ["target", "rel"] });
}

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    removeTyping();

    if (!data.ok) {
      appendMessage("error", data.error || "Unknown error");
      return;
    }

    const tools = (data.trace || []).filter((t) => t.step.startsWith("tool_")).map((t) => t.step.replace("tool_", ""));

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

loadConfig();
appendMessage(
  "assistant",
  'Hi — ask me anything about ConnectAuz products. Try: "What does CA Fleet do?" or "Compare CA POS and CA Workforce."'
);
