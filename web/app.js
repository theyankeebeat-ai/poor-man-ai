(function () {
  var SESSIONS_KEY = "bpmai-sessions";
  var THEME_KEY = "bpmai-theme";
  var THEMES = { dark: true, light: true, sand: true };
  var HOSTED_BRAINS = [
    "https://poor-man-ai.vercel.app",
    "https://poor-man-ai.onrender.com",
    "https://wqrriztbsifgytjzippi.supabase.co/functions/v1/api",
    "https://poor-man-ai.fra.appwrite.run",
  ];
  var SOURCE_LABEL = {
    direct: "Direct answer",
    rag_search: "Local corpus",
    web_search: "Web search",
    weather_compare: "Weather",
    none: "No source",
  };

  var sessions = loadSessions();
  var activeId = sessions[0] ? sessions[0].id : null;
  var apiBase = initialApi();
  var brainReady = null;

  var listEl = document.getElementById("sessions");
  var logEl = document.getElementById("log");
  var form = document.getElementById("composer");
  var input = document.getElementById("message");
  var sendBtn = document.getElementById("send");
  var statusEl = document.getElementById("brain-status");

  applyTheme(storedTheme());
  renderSessions();
  renderLog();
  ensureBrain().then(probe);
  input.focus();

  document.getElementById("new-chat").addEventListener("click", function () {
    var current = active();
    if (current && current.messages.length === 0) {
      input.focus();
      return;
    }
    var session = blankSession();
    sessions.unshift(session);
    activeId = session.id;
    save();
    renderSessions();
    renderLog();
    input.focus();
  });

  document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
    button.addEventListener("click", function () {
      applyTheme(button.getAttribute("data-theme-choice"));
    });
  });

  input.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (event.isComposing || sendBtn.disabled) return;
    form.requestSubmit();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    send();
  });

  function storedTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || "dark";
    } catch (_err) {
      return "dark";
    }
  }

  function loadSessions() {
    try {
      var parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
      if (!Array.isArray(parsed)) return [blankSession()];
      var clean = [];
      parsed.forEach(function (session) {
        if (!session || typeof session !== "object") return;
        var messages = [];
        var raw = Array.isArray(session.messages) ? session.messages : [];
        raw.forEach(function (message) {
          var kept = cleanMessage(message);
          if (kept) messages.push(kept);
        });
        clean.push({
          id: typeof session.id === "string" && session.id ? session.id : blankId(),
          title: typeof session.title === "string" && session.title ? session.title : "New chat",
          createdAt: typeof session.createdAt === "number" ? session.createdAt : Date.now(),
          messages: messages,
        });
      });
      if (clean.length) return clean;
    } catch (_err) {
      /* start fresh */
    }
    return [blankSession()];
  }

  function cleanMessage(message) {
    if (!message || message.pending) return null;
    if (message.role !== "user" && message.role !== "assistant") return null;
    if (typeof message.content !== "string") return null;
    var next = { role: message.role, content: message.content };
    if (message.error) {
      next.error = true;
      return next;
    }
    if (message.role === "assistant") {
      if (typeof message.model === "string") next.model = message.model;
      if (typeof message.source === "string") next.source = message.source;
      if (Array.isArray(message.evidence)) next.evidence = message.evidence;
      if (Array.isArray(message.trace)) next.trace = message.trace;
    }
    return next;
  }

  function blankId() {
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }

  function blankSession() {
    return { id: blankId(), title: "New chat", createdAt: Date.now(), messages: [] };
  }

  function active() {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === activeId) return sessions[i];
    }
    return sessions[0];
  }

  function save() {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (_err) {
      /* keep the page usable if storage is blocked */
    }
  }

  function applyTheme(name) {
    if (THEMES[name] !== true) name = "dark";
    document.documentElement.setAttribute("data-theme", name);
    try {
      localStorage.setItem(THEME_KEY, name);
    } catch (_err) {
      /* theme still applies for this visit */
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-theme-choice") === name ? "true" : "false");
    });
  }

  function renderSessions() {
    listEl.textContent = "";
    sessions.forEach(function (session) {
      var title = session.title || "New chat";
      var item = document.createElement("li");
      item.className = "session" + (session.id === activeId ? " active" : "");
      var open = document.createElement("button");
      open.type = "button";
      open.className = "open";
      open.textContent = title;
      open.addEventListener("click", function () {
        activeId = session.id;
        renderSessions();
        renderLog();
      });
      var del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.textContent = "Delete";
      del.setAttribute("aria-label", "Delete " + title);
      del.addEventListener("click", function () {
        sessions = sessions.filter(function (row) { return row.id !== session.id; });
        if (!sessions.length) sessions = [blankSession()];
        if (!sessions.some(function (row) { return row.id === activeId; })) activeId = sessions[0].id;
        save();
        renderSessions();
        renderLog();
      });
      item.appendChild(open);
      item.appendChild(del);
      listEl.appendChild(item);
    });
  }

  function renderLog() {
    var session = active();
    logEl.textContent = "";
    if (!session || !session.messages.length) {
      var welcome = document.createElement("p");
      welcome.className = "welcome";
      welcome.textContent = "Ask a question. The Go brain answers from the local corpus, web search, weather, and optional Grok.";
      logEl.appendChild(welcome);
      return;
    }
    session.messages.forEach(function (message) {
      logEl.appendChild(bubble(message));
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  function sourceLabel(source) {
    if (Object.prototype.hasOwnProperty.call(SOURCE_LABEL, source)) return SOURCE_LABEL[source];
    if (typeof source === "string" && source.trim()) return source.trim();
    return "No source";
  }

  function metaLine(message) {
    var line = sourceLabel(message.source);
    var model = typeof message.model === "string" ? message.model.trim() : "";
    if (model) return line + " · " + model;
    return line;
  }

  function evidenceList(items) {
    var list = document.createElement("ul");
    list.className = "evidence";
    var count = 0;
    var rows = Array.isArray(items) ? items : [];
    for (var i = 0; i < rows.length && count < 4; i++) {
      var item = rows[i];
      if (!item || typeof item.url !== "string") continue;
      var parsed;
      try {
        parsed = new URL(item.url);
      } catch (_err) {
        continue;
      }
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) continue;
      var title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Source";
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = parsed.href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = title + " · " + parsed.hostname;
      li.appendChild(link);
      list.appendChild(li);
      count += 1;
    }
    return count ? list : null;
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_err) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function copyButton(text) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy message");
    button.addEventListener("click", function () {
      writeClipboard(text).then(function (ok) {
        button.textContent = ok ? "Copied" : "Copy failed";
        window.setTimeout(function () {
          button.textContent = "Copy";
        }, 1200);
      });
    });
    return button;
  }

  function tracePanel(trace) {
    var rows = Array.isArray(trace) ? trace : [];
    var sites = [];
    rows.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      var label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : "Step";
      var steps = [];
      var rawSteps = Array.isArray(row.steps) ? row.steps : [];
      rawSteps.forEach(function (step) {
        if (!step || typeof step.detail !== "string" || !step.detail.trim()) return;
        steps.push({ ok: step.ok === true, detail: step.detail.trim() });
      });
      if (!steps.length) return;
      sites.push({ label: label, ok: row.ok === true, steps: steps });
    });
    if (!sites.length) return null;
    var details = document.createElement("details");
    details.className = "trace";
    var summary = document.createElement("summary");
    summary.textContent = "Turn trace";
    details.appendChild(summary);
    var list = document.createElement("ol");
    list.className = "trace-list";
    sites.forEach(function (site) {
      var item = document.createElement("li");
      item.className = "trace-site" + (site.ok ? "" : " fail");
      var title = document.createElement("div");
      title.className = "trace-title";
      title.textContent = site.label + (site.ok ? " — ok" : " — failed");
      item.appendChild(title);
      var steps = document.createElement("ul");
      steps.className = "trace-steps";
      site.steps.forEach(function (step) {
        var line = document.createElement("li");
        if (!step.ok) line.className = "fail";
        line.textContent = step.detail;
        steps.appendChild(line);
      });
      item.appendChild(steps);
      list.appendChild(item);
    });
    details.appendChild(list);
    return details;
  }

  function bubble(message) {
    var block = document.createElement("article");
    var role = message.role === "user" ? "user" : "assistant";
    block.className = "bubble " + role;
    if (message.error) block.classList.add("error");
    if (message.pending) block.classList.add("pending");
    var body = document.createElement("div");
    body.className = "bubble-body";
    body.textContent = message.content;
    block.appendChild(body);
    if (role === "assistant" && !message.error && !message.pending) {
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = metaLine(message);
      block.appendChild(meta);
      var links = evidenceList(message.evidence);
      if (links) block.appendChild(links);
    }
    var text = typeof message.content === "string" ? message.content : "";
    if (text && !message.pending) block.appendChild(copyButton(text));
    if (role === "assistant" && !message.pending) {
      var panel = tracePanel(message.trace);
      if (panel) block.appendChild(panel);
    }
    return block;
  }

  function historyOf(session) {
    return session.messages
      .filter(function (message) { return message.role === "user" || message.role === "assistant"; })
      .filter(function (message) { return !message.pending && !message.error; })
      .map(function (message) { return { role: message.role, text: message.content }; });
  }

  function replacePending(session, message) {
    if (sessions.indexOf(session) < 0) return;
    var index = -1;
    for (var i = 0; i < session.messages.length; i++) {
      if (session.messages[i].pending) index = i;
    }
    if (index >= 0) session.messages.splice(index, 1, message);
    else session.messages.push(message);
  }

  function updatePending(session, content) {
    for (var i = 0; i < session.messages.length; i++) {
      if (session.messages[i].pending) {
        session.messages[i].content = content;
        return;
      }
    }
  }

  function failureText(err) {
    if (err && err.name === "AbortError") return "The lookup took too long.";
    if (err && typeof err.message === "string" && err.message.trim()) return err.message.trim();
    return "The server is unavailable.";
  }

  function initialApi() {
    if (typeof window === "undefined") return "";
    var host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "";
    return HOSTED_BRAINS[0];
  }

  function isLocalApi(base) {
    return base === "" || base.indexOf("http://127.0.0.1") === 0 || base.indexOf("http://localhost") === 0;
  }

  function probeOne(base, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    var url = (base || "") + "/health";
    return fetch(url, { cache: "no-store", signal: controller.signal })
      .then(function (response) { return response.ok; })
      .catch(function () { return false; })
      .finally(function () { clearTimeout(timer); });
  }

  function ensureBrain() {
    if (isLocalApi(apiBase)) {
      brainReady = Promise.resolve(apiBase);
      return brainReady;
    }
    if (brainReady) return brainReady;
    brainReady = new Promise(function (resolve) {
      var hosts = HOSTED_BRAINS.slice();
      var left = hosts.length;
      var best = -1;
      var settled = false;
      var finish = function () {
        if (settled) return;
        if (best === 0 || left === 0) {
          settled = true;
          apiBase = best >= 0 ? hosts[best] : hosts[0];
          resolve(apiBase);
        }
      };
      hosts.forEach(function (base, index) {
        var timeoutMs = index === 1 ? 50000 : 20000;
        probeOne(base, timeoutMs).then(function (ok) {
          if (ok && (best < 0 || index < best)) best = index;
          left -= 1;
          finish();
        });
      });
    });
    return brainReady;
  }

  function parseEvidence(text) {
    if (typeof text !== "string" || !text.trim()) return [];
    try {
      var parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (row) { return row && typeof row.url === "string"; })
        .map(function (row) {
          return {
            title: typeof row.title === "string" ? row.title : "Source",
            url: row.url,
          };
        });
    } catch (_err) {
      return [];
    }
  }

  async function streamChat(body, onEvent) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 120000);
    try {
      var response = await fetch((apiBase || "") + "/chat", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        var detail = "";
        try {
          var errBody = await response.json();
          if (errBody && typeof errBody.detail === "string") detail = errBody.detail.trim();
        } catch (_err) {
          detail = "";
        }
        throw new Error(detail || "The server is unavailable.");
      }
      if (!response.body || !response.body.getReader) {
        throw new Error("Streaming is not available in this browser.");
      }
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        var parts = buf.split("\n");
        buf = parts.pop() || "";
        for (var i = 0; i < parts.length; i++) {
          var line = parts[i].trim();
          if (!line) continue;
          var event;
          try {
            event = JSON.parse(line);
          } catch (_err) {
            continue;
          }
          if (event && typeof event.type === "string") onEvent(event);
        }
      }
      var tail = buf.trim();
      if (tail) {
        try {
          var last = JSON.parse(tail);
          if (last && typeof last.type === "string") onEvent(last);
        } catch (_err) {
          /* ignore trailing partial */
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function send() {
    var text = input.value.trim();
    var session = active();
    if (!text || !session || sendBtn.disabled) return;
    await ensureBrain();
    var prior = historyOf(session);
    session.messages.push({ role: "user", content: text });
    if (session.title === "New chat") session.title = text.slice(0, 42);
    session.messages.push({ role: "assistant", content: "Thinking…", pending: true });
    input.value = "";
    sendBtn.disabled = true;
    save();
    renderSessions();
    renderLog();

    var reply = "";
    var source = "direct";
    var evidence = [];
    var trace = [];
    var model = "";
    var errored = null;

    try {
      await streamChat(
        { message: text, history: prior, thinking_level: "medium" },
        function (event) {
          if (event.type === "plan" && typeof event.text === "string") {
            trace.push({
              label: "Plan",
              ok: true,
              steps: [{ ok: true, detail: event.text }],
            });
            updatePending(session, event.text);
            renderLog();
          } else if (event.type === "tool") {
            var toolName = typeof event.name === "string" ? event.name : "tool";
            source = toolName.indexOf("brain:") === 0 ? "direct" : toolName;
            trace.push({
              label: toolName,
              ok: true,
              steps: [{ ok: true, detail: JSON.stringify(event.args || {}) }],
            });
          } else if (event.type === "observation") {
            var obsName = typeof event.name === "string" ? event.name : "observation";
            if (obsName === "rag_search" || obsName === "web_search" || obsName === "weather_compare") {
              var hits = parseEvidence(event.text);
              if (hits.length) evidence = evidence.concat(hits);
              source = obsName;
            }
            trace.push({
              label: obsName,
              ok: true,
              steps: [{ ok: true, detail: typeof event.text === "string" ? event.text.slice(0, 400) : "" }],
            });
          } else if (event.type === "token" && typeof event.text === "string") {
            reply += event.text;
            updatePending(session, reply || "Thinking…");
            renderLog();
          } else if (event.type === "done") {
            if (typeof event.text === "string" && event.text.trim()) reply = event.text;
          } else if (event.type === "error") {
            errored = typeof event.text === "string" && event.text.trim() ? event.text.trim() : "The server is unavailable.";
          } else if (event.type === "latency") {
            model = "go-brain";
          }
        }
      );
      if (errored) throw new Error(errored);
      reply = reply.trim();
      if (!reply) throw new Error("The server is unavailable.");
      replacePending(session, {
        role: "assistant",
        content: reply,
        model: model || "go-brain",
        source: source || "direct",
        evidence: evidence,
        trace: trace,
      });
    } catch (err) {
      replacePending(session, {
        role: "assistant",
        content: failureText(err),
        error: true,
      });
    } finally {
      sendBtn.disabled = false;
      save();
      renderSessions();
      renderLog();
      input.focus();
    }
  }

  async function probe() {
    try {
      await ensureBrain();
      var response = await fetch((apiBase || "") + "/health", {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("down");
      var data = await response.json();
      if (!data || data.status !== "ok") {
        statusEl.textContent = "Server: down";
        return;
      }
      var model = typeof data.model === "string" ? data.model : "go-brain";
      var passages = typeof data.passages === "number" ? data.passages : 0;
      var host = apiBase ? apiBase.replace(/^https?:\/\//, "") : "local";
      statusEl.textContent = "Brain: " + model + " · " + passages + " passages · " + host;
    } catch (_err) {
      statusEl.textContent = "Server: down";
    }
  }
})();
