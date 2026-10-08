import { DEFAULT_MODEL, GEMMA_MODELS } from "./models.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODELS = new Map([
  ...GEMMA_MODELS.map((model) => [model.id, model.id]),
  ["gemma-4-26b-a4b-it", "gemma4:12b"],
  ["gemma-4-31b-it", "gemma4:e4b"],
]);
const MAX_MESSAGES = 40;
const MAX_CHARS = 8000;
const SYSTEM =
  "You are Poor Man Ai, a direct and useful assistant running on Gemma 4. Answer in plain language and match the user's language.";

export function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw httpError(400, "Send at least one message.");
  }
  if (input.length > MAX_MESSAGES) {
    throw httpError(400, "This chat is too long. Start a new one.");
  }

  return input.map((message, index) => {
    const role = message?.role === "model" || message?.role === "user" ? message.role : "";
    const text = typeof message?.text === "string" ? message.text.trim() : "";
    if (!role || !text) {
      throw httpError(400, `Message ${index + 1} is empty or has an unknown role.`);
    }
    if (text.length > MAX_CHARS) {
      throw httpError(400, "A message is over 8,000 characters.");
    }
    return { role, parts: [{ text }] };
  });
}

export async function streamGemma({ model = DEFAULT_MODEL, thinking = "minimal", messages, onText }) {
  const contents = normalizeMessages(messages);
  const localModel = LOCAL_MODELS.get(model);
  if (!localModel) {
    throw httpError(400, "Pick a Gemma 4 model on this machine.");
  }

  let response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: localModel,
        stream: true,
        think: thinking === "high",
        messages: [
          { role: "system", content: thinking === "high" ? `<|think|>\n${SYSTEM}` : SYSTEM },
          ...contents.map((message) => ({
            role: message.role === "model" ? "assistant" : "user",
            content: message.parts[0].text,
          })),
        ],
        options: {
          temperature: 1,
          top_p: 0.95,
          top_k: 64,
          num_ctx: 4096,
        },
      }),
    });
  } catch {
    throw httpError(503, "Gemma is not running on this machine yet.");
  }

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw httpError(response.status || 502, payload.error || "Gemma did not answer.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      const text = event.message?.content || "";
      if (!text) continue;
      full += text;
      onText(text);
    }
  }
  return full;
}

export function handleChatRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  readBody(req)
    .then(async (body) => {
      const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;
      const thinking = body.thinking === "high" ? "high" : "minimal";
      let contents;
      try {
        contents = normalizeMessages(body.messages);
        if (!LOCAL_MODELS.has(model)) throw httpError(400, "Pick a Gemma 4 model on this machine.");
      } catch (error) {
        sendJson(res, error.status || 400, { error: errorMessage(error) });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      try {
        await streamGemma({
          model,
          thinking,
          messages: contents.map((message) => ({ role: message.role, text: message.parts[0].text })),
          onText(text) {
            writeEvent(res, { text });
          },
        });
        writeEvent(res, { done: true });
      } catch (error) {
        writeEvent(res, { error: errorMessage(error) });
      }
      res.end();
    })
    .catch((error) => {
      if (!res.headersSent) sendJson(res, error.status || 400, { error: errorMessage(error) });
      else res.end();
    });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(httpError(413, "Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(httpError(400, "Request body must be JSON."));
      }
    });
    req.on("error", () => reject(httpError(400, "Could not read the request.")));
  });
}

function writeEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function errorMessage(error) {
  return error?.message || "Gemma 4 did not answer.";
}
