import { getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { firebaseConfig } from "../firebase-config.js";
import { DEFAULT_MODEL, GEMMA_MODELS } from "./models.js";
import "./style.css";

const STORAGE_KEY = "poorman-ai-chat";
const chatEndpoint = `${import.meta.env.VITE_CHAT_API || ""}/api/chat`;
const starters = [
  "Explain gravity like I am curious and short on time.",
  "Write a product blurb for Poor Man Ai in four sentences.",
  "Give me a three-step plan to learn JavaScript this week.",
];

const state = loadState();
let sending = false;
let abortController = null;

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="app">
    <header class="top">
      <div class="brand">
        <img class="logo" src="/images/logo.png" alt="Poor Man Ai" width="44" height="44" />
        <div>
          <h1>Poor Man Ai</h1>
          <p>Gemma 4, running on this machine.</p>
        </div>
      </div>
      <div class="controls">
        <label>Model
          <select id="model">${GEMMA_MODELS.map((model) => `<option value="${model.id}">${model.label} · ${model.note}</option>`).join("")}</select>
        </label>
        <label>Thinking
          <select id="thinking">
            <option value="minimal">Minimal</option>
            <option value="high">High</option>
          </select>
        </label>
        <button class="ghost" id="new-chat" type="button">New chat</button>
      </div>
    </header>
    <main class="stage">
      <section class="thread" id="thread" aria-live="polite"></section>
      <form class="composer" id="composer">
        <label class="sr" for="prompt" style="position:absolute;left:-999px">Message</label>
        <textarea id="prompt" rows="1" placeholder="Ask Gemma 4 something"></textarea>
        <button class="send" id="send" type="submit">Send</button>
      </form>
    </main>
  </div>
`;

const thread = document.querySelector("#thread");
const form = document.querySelector("#composer");
const prompt = document.querySelector("#prompt");
const sendButton = document.querySelector("#send");
const modelSelect = document.querySelector("#model");
const thinkingSelect = document.querySelector("#thinking");

modelSelect.value = state.model;
thinkingSelect.value = state.thinking;
render();
prompt.focus();

modelSelect.addEventListener("change", () => {
  state.model = modelSelect.value;
  saveState();
});

thinkingSelect.addEventListener("change", () => {
  state.thinking = thinkingSelect.value;
  saveState();
});

document.querySelector("#new-chat").addEventListener("click", () => {
  abortController?.abort();
  state.messages = [];
  state.error = "";
  sending = false;
  saveState();
  render();
  prompt.focus();
});

prompt.addEventListener("input", () => {
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(prompt.scrollHeight, 160)}px`;
});

prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text || sending) return;
  prompt.value = "";
  prompt.style.height = "auto";
  ask(text);
});

async function ask(text) {
  state.error = "";
  state.messages.push({ role: "user", text });
  state.messages.push({ role: "model", text: "" });
  sending = true;
  saveState();
  render();

  abortController = new AbortController();
  const reply = state.messages[state.messages.length - 1];
  try {
    const response = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        model: state.model,
        thinking: state.thinking,
        messages: state.messages.filter((message) => message.text),
      }),
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }

    await readStream(response, (delta) => {
      reply.text += delta;
      paintReply(reply.text);
    });

    if (!reply.text.trim()) reply.text = "Gemma 4 returned an empty answer.";
  } catch (error) {
    if (error.name === "AbortError") {
      if (!reply.text) state.messages.pop();
    } else {
      state.error = error.message || "Gemma 4 did not answer.";
      if (!reply.text) state.messages.pop();
    }
  } finally {
    sending = false;
    abortController = null;
    saveState();
    render();
  }
}

async function readStream(response, onText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data) continue;
      const event = JSON.parse(data);
      if (event.error) throw new Error(event.error);
      if (event.text) onText(event.text);
    }
  }
}

function render() {
  sendButton.textContent = sending ? "Stop" : "Send";
  sendButton.disabled = false;
  sendButton.type = sending ? "button" : "submit";
  sendButton.onclick = sending
    ? () => abortController?.abort()
    : null;

  if (state.messages.length === 0) {
    thread.innerHTML = `
      <div class="empty">
        <h2>Ask the open model something useful.</h2>
        <p>Poor Man Ai runs Gemma 4 on this machine. No API key.</p>
        <div class="chips">
          ${starters.map((promptText) => `<button type="button">${escapeHtml(promptText)}</button>`).join("")}
        </div>
        ${state.error ? `<p class="notice">${escapeHtml(state.error)}</p>` : ""}
      </div>
    `;
    thread.querySelectorAll(".chips button").forEach((button) => {
      button.addEventListener("click", () => ask(button.textContent));
    });
    return;
  }

  thread.innerHTML = state.messages.map((message, index) => `
    <article class="row ${message.role}${sending && index === state.messages.length - 1 ? " pending" : ""}">
      <div class="bubble">
        <span class="who">${message.role === "user" ? "You" : "Gemma 4"}</span>
        <div class="body">${renderRich(message.text)}</div>
      </div>
    </article>
  `).join("") + (state.error ? `<p class="notice">${escapeHtml(state.error)}</p>` : "");
  thread.scrollTop = thread.scrollHeight;
}

function paintReply(text) {
  const body = thread.querySelector(".row.pending .body");
  if (!body) return;
  body.innerHTML = renderRich(text);
  thread.scrollTop = thread.scrollHeight;
}

function renderRich(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  const parts = escaped.split(/```(?:[a-z0-9_-]+)?\n?([\s\S]*?)```/gi);
  return parts.map((part, index) => (index % 2 === 1 ? `<pre><code>${part.replace(/\n$/, "")}</code></pre>` : inline(part))).join("");
}

function inline(text) {
  return text
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((part) => `<p>${part.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function loadState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    return {
      model: GEMMA_MODELS.some((model) => model.id === saved.model) ? saved.model : DEFAULT_MODEL,
      thinking: saved.thinking === "high" ? "high" : "minimal",
      messages: Array.isArray(saved.messages) ? saved.messages : [],
      error: "",
    };
  } catch {
    return { model: DEFAULT_MODEL, thinking: "minimal", messages: [], error: "" };
  }
}

function saveState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    model: state.model,
    thinking: state.thinking,
    messages: state.messages,
  }));
}

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
isSupported().then((supported) => {
  if (supported) getAnalytics(firebaseApp);
}).catch(() => {});
