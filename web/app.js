(function () {
  var SESSIONS_KEY = "bpmai-sessions";
  var THEME_KEY = "bpmai-theme";
  var THEMES = { dark: true, light: true, sand: true };
  // Chat API gateway first (Supabase), then the two lean Go brains.
  // Appwrite is compute-only (/sanitize, /math) and is not a chat upstream.
  var HOSTED_BRAINS = [
    "https://wqrriztbsifgytjzippi.supabase.co/functions/v1/api",
    "https://poor-man-ai.vercel.app",
    "https://poor-man-ai.onrender.com",
  ];
  var COMPUTE_API = "https://poor-man-ai.fra.appwrite.run";
  var SOURCE_LABEL = {
    direct: "Direct answer",
    rag_search: "Local corpus",
    web_search: "Web search",
    weather_compare: "Weather",
    local_time: "Local time",
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

  applyTheme(storedTheme());
  renderSessions();
  renderLog();
  ensureBrain();
  input.focus();

  document.getElementById("new-chat").addEventListener("click", function () {
    var current = active();
    if (current && current.messages.length === 0) {
      input.focus();
      return;
    }
    for (var i = 0; i < sessions.length; i++) {
      if (isPlaceholder(sessions[i])) {
        activeId = sessions[i].id;
        renderSessions();
        renderLog();
        input.focus();
        return;
      }
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
    sendText(input.value);
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
      if (Array.isArray(message.thinking)) {
        next.thinking = message.thinking.filter(function (step) {
          return typeof step === "string" && step.trim();
        }).slice(0, 24);
      }
    }
    return next;
  }

  function blankId() {
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }

  function blankSession() {
    return { id: blankId(), title: "New chat", createdAt: Date.now(), messages: [] };
  }

  function isPlaceholder(session) {
    return !!(session && !session.messages.length && (!session.title || session.title === "New chat"));
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
      if (isPlaceholder(session)) return;
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
    if (!session || !session.messages.length) return;
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

  var SOURCE_CAP = 12;

  function presentAnswer(content, evidence) {
    var split = splitCitations(content);
    var sources = split.sources;
    var rows = Array.isArray(evidence) ? evidence : [];
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item || typeof item.url !== "string") continue;
      addSource(sources, typeof item.title === "string" ? item.title : "", item.url);
    }
    return { prose: split.prose, sources: sources };
  }

  function splitCitations(content) {
    var text = typeof content === "string" ? content : "";
    var sources = [];
    var tail = citationTail(text);
    var prose = text;
    if (tail) {
      prose = tail.prose;
      parseCitationBlock(tail.block, sources);
    }
    prose = replaceMarkdownLinks(prose, sources);
    prose = stripBareUrls(prose, sources);
    prose = tidyProse(prose);
    if (sources.length) prose = stripTrailingCiteHeading(prose);
    return { prose: prose, sources: sources };
  }

  function citationTail(text) {
    var re = /(?:^|\n)[ \t]*(?:\*\*|__)?(?:citations?|sources?|references?)(?:\*\*|__)?[ \t]*:?[ \t]*(?=\n|$|https?:\/\/)/gi;
    var matches = [];
    var match;
    while ((match = re.exec(text))) {
      matches.push({ index: match.index, end: match.index + match[0].length });
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
    for (var i = matches.length - 1; i >= 0; i--) {
      var after = text.slice(matches[i].end);
      if (!tailIsCitations(after)) continue;
      var prose = text.slice(0, matches[i].index).replace(/\s+$/, "");
      if (!prose && !after.trim()) continue;
      return { prose: prose, block: after };
    }
    return null;
  }

  function tailIsCitations(after) {
    if (!String(after).trim()) return true;
    var lines = after.split("\n");
    var urls = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/https?:\/\//i.test(line)) {
        urls += 1;
        continue;
      }
      return false;
    }
    return urls > 0;
  }

  function parseCitationBlock(block, sources) {
    var lines = block.split("\n");
    for (var n = 0; n < lines.length; n++) {
      var line = lines[n].trim().replace(/^(?:[-*+]|\d+[.)]|\[\d+\])\s+/, "");
      if (!line) continue;
      line = replaceMarkdownLinks(line, sources);
      var at = indexOfUrl(line, 0);
      if (at < 0) continue;
      var found = readUrl(line, at);
      if (!found) continue;
      addSource(sources, line.slice(0, at), found.href);
      var rest = line.slice(at + found.consumed);
      while (rest) {
        var next = indexOfUrl(rest, 0);
        if (next < 0) break;
        var more = readUrl(rest, next);
        if (!more) break;
        addSource(sources, "", more.href);
        rest = rest.slice(next + more.consumed);
      }
    }
  }

  function replaceMarkdownLinks(text, sources) {
    var out = "";
    var i = 0;
    while (i < text.length) {
      var start = text.indexOf("[", i);
      if (start < 0) {
        out += text.slice(i);
        break;
      }
      var endText = text.indexOf("]", start + 1);
      if (endText < 0 || endText > start + 180 || text.charAt(endText + 1) !== "(") {
        out += text.slice(i, start + 1);
        i = start + 1;
        continue;
      }
      var urlStart = endText + 2;
      var found = readUrl(text, urlStart);
      var after = found ? urlStart + found.consumed : -1;
      if (!found || text.charAt(after) !== ")") {
        out += text.slice(i, start + 1);
        i = start + 1;
        continue;
      }
      var title = text.slice(start + 1, endText).replace(/[*_`]+/g, "").trim();
      if (/^https?:\/\//i.test(title)) title = "";
      out += text.slice(i, start);
      out += title;
      addSource(sources, title, found.href);
      i = after + 1;
    }
    return out;
  }

  function stripBareUrls(text, sources) {
    var out = "";
    var i = 0;
    while (i < text.length) {
      var at = indexOfUrl(text, i);
      if (at < 0) {
        out += text.slice(i);
        break;
      }
      var found = readUrl(text, at);
      if (!found) {
        out += text.slice(i, at + 1);
        i = at + 1;
        continue;
      }
      var lead = text.slice(i, at);
      var angle = lead.charAt(lead.length - 1) === "<";
      if (angle) lead = lead.slice(0, -1);
      lead = lead.replace(/[ \t]+$/, "");
      lead = lead.replace(/[ \t]*(?:[:—–]|-)[ \t]*$/, "");
      out += lead;
      out += found.trail;
      addSource(sources, "", found.href);
      i = at + found.consumed;
      if (angle && text.charAt(i) === ">") i += 1;
    }
    return out;
  }

  function indexOfUrl(text, from) {
    var re = /https?:\/\//gi;
    re.lastIndex = from || 0;
    var match = re.exec(text);
    return match ? match.index : -1;
  }

  function readUrl(text, index) {
    if (index < 0 || index >= text.length) return null;
    var head = text.slice(index, index + 8).toLowerCase();
    if (head.slice(0, 7) !== "http://" && head.slice(0, 8) !== "https://") return null;
    var depth = 0;
    var end = 0;
    for (var i = 0; i < text.length - index; i++) {
      var ch = text.charAt(index + i);
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      } else if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "<" || ch === ">" || ch === "\"" || ch === "'" || ch === "`" || ch === "]" || ch === "|") {
        break;
      }
      end = i + 1;
    }
    var raw = text.slice(index, index + end);
    var trail = "";
    while (raw.length && ".,;:!?".indexOf(raw.charAt(raw.length - 1)) !== -1) {
      trail = raw.charAt(raw.length - 1) + trail;
      raw = raw.slice(0, -1);
    }
    var parsed = safeUrl(raw);
    if (!parsed) return null;
    return { href: parsed.href, trail: trail, consumed: end };
  }

  function safeUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      var parsed = new URL(raw.trim());
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) return null;
      return parsed;
    } catch (_err) {
      return null;
    }
  }

  function addSource(list, title, url) {
    var parsed = safeUrl(url);
    if (!parsed) return;
    var host = parsed.hostname.replace(/^www\./i, "");
    var label = cleanTitle(title);
    if (!label || label.toLowerCase() === host.toLowerCase()) label = host;
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === parsed.href) {
        if (list[i].title === list[i].host && label !== host) list[i].title = label;
        return;
      }
    }
    if (list.length >= SOURCE_CAP) return;
    list.push({ title: label, url: parsed.href, host: host });
  }

  function cleanTitle(title) {
    if (typeof title !== "string") return "";
    var t = title.replace(/[*_`]+/g, " ").replace(/\s+/g, " ").trim();
    t = t.replace(/^(?:[-*+]|\d+[.)]|\[\d+\])\s+/, "");
    t = t.replace(/[ \t]*(?:[:—–]|-)[ \t]*$/, "");
    t = t.replace(/[ \t]*[\[\(]+[ \t]*$/, "").trim();
    if (typeof window !== "undefined" && /%[0-9A-Fa-f]{2}/.test(t)) {
      try {
        t = window.decodeURIComponent(t).replace(/\s+/g, " ").trim();
      } catch (_err) {
        /* keep the title as it was written */
      }
    }
    if (/^https?:\/\//i.test(t)) return "";
    if (t.length > 180) t = t.slice(0, 177) + "...";
    return t;
  }

  function tidyProse(text) {
    var lines = String(text).split("\n");
    var cleaned = [];
    var blank = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
        .replace(/\(\s*\)/g, "")
        .replace(/\[\s*\]/g, "")
        .replace(/<\s*>/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([.,;:!?])/g, "$1")
        .replace(/[ \t]+$/g, "")
        .replace(/^[ \t]+/g, "");
      if (/^(?:[-*+]|\d+[.)]|\[\d+\])$/.test(line)) continue;
      if (!line) {
        blank += 1;
        if (blank === 1 && cleaned.length) cleaned.push("");
        continue;
      }
      blank = 0;
      cleaned.push(line);
    }
    while (cleaned.length && cleaned[0] === "") cleaned.shift();
    while (cleaned.length && cleaned[cleaned.length - 1] === "") cleaned.pop();
    return cleaned.join("\n");
  }

  function stripTrailingCiteHeading(text) {
    return text.replace(/(?:^|\n)[ \t]*(?:\*\*|__)?(?:citations?|sources?|references?)(?:\*\*|__)?[ \t]*:?[ \t]*$/i, "").trim();
  }

  function sourceLinkText(item) {
    if (!item.host || item.title.toLowerCase() === item.host.toLowerCase()) return item.host || item.title || item.url;
    return item.title + " · " + item.host;
  }

  function sourcesPanel(sources) {
    var panel = document.createElement("div");
    panel.className = "sources";
    var button = document.createElement("button");
    button.type = "button";
    button.className = "sources-toggle";
    button.textContent = "Sources · " + sources.length;
    button.setAttribute("aria-expanded", "false");
    var listId = "sources-" + blankId();
    button.setAttribute("aria-controls", listId);
    var list = document.createElement("ul");
    list.className = "evidence";
    list.id = listId;
    list.hidden = true;
    sources.forEach(function (item) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.title = item.url;
      link.textContent = sourceLinkText(item);
      li.appendChild(link);
      list.appendChild(li);
    });
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", open ? "true" : "false");
      list.hidden = !open;
      if (open && list.scrollIntoView) list.scrollIntoView({ block: "nearest" });
    });
    panel.appendChild(button);
    panel.appendChild(list);
    return panel;
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

  function thinkingPanel(steps) {
    var clean = [];
    var rows = Array.isArray(steps) ? steps : [];
    rows.forEach(function (step) {
      if (typeof step === "string" && step.trim()) clean.push(step.trim());
    });
    if (!clean.length) return null;
    var details = document.createElement("details");
    details.className = "trace thinking";
    var summary = document.createElement("summary");
    summary.textContent = "Thinking";
    details.appendChild(summary);
    var list = document.createElement("ol");
    list.className = "trace-steps";
    clean.forEach(function (step) {
      var line = document.createElement("li");
      line.textContent = step;
      list.appendChild(line);
    });
    details.appendChild(list);
    return details;
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
    if (role === "assistant") {
      var thinking = thinkingPanel(message.thinking);
      if (thinking) block.appendChild(thinking);
    }
    var raw = typeof message.content === "string" ? message.content : "";
    var rendered = role === "assistant" && !message.error
      ? presentAnswer(raw, message.evidence)
      : { prose: raw, sources: [] };
    var body = document.createElement("div");
    body.className = "bubble-body";
    if (rendered.prose) {
      var prose = document.createElement("div");
      prose.className = "bubble-text";
      prose.textContent = rendered.prose;
      body.appendChild(prose);
    }
    if (rendered.sources.length) body.appendChild(sourcesPanel(rendered.sources));
    block.appendChild(body);
    if (role === "assistant" && !message.error && !message.pending) {
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = metaLine(message);
      block.appendChild(meta);
    }
    if (raw && !message.pending) block.appendChild(copyButton(raw));
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
      var rows = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.hits) ? parsed.hits : [];
      return rows
        .filter(function (row) { return row && typeof row.url === "string" && row.url; })
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

  async function answerFromBrowser(text) {
    var tools = typeof window !== "undefined" ? window.BPMAIClientTools : null;
    if (!tools || typeof tools.answerLocally !== "function") return null;
    try {
      return await tools.answerLocally(text);
    } catch (_err) {
      return null;
    }
  }

  function sanitizeBrainMessage(text) {
    var tools = typeof window !== "undefined" ? window.BPMAIClientTools : null;
    if (tools && typeof tools.sanitizeForBrain === "function") {
      return tools.sanitizeForBrain(text);
    }
    return String(text || "").trim();
  }

  function sanitizeBrainHistory(history) {
    var tools = typeof window !== "undefined" ? window.BPMAIClientTools : null;
    if (tools && typeof tools.sanitizeHistoryForBrain === "function") {
      return tools.sanitizeHistoryForBrain(history);
    }
    return Array.isArray(history) ? history : [];
  }

  function lastAssistant(session) {
    if (!session || !Array.isArray(session.messages)) return null;
    for (var i = session.messages.length - 1; i >= 0; i--) {
      var message = session.messages[i];
      if (message && message.role === "assistant" && !message.pending) return message;
    }
    return null;
  }

  function clearActiveSession() {
    var session = active();
    if (!session) return { ok: false, detail: "No active session." };
    session.messages = [];
    session.title = "New chat";
    save();
    renderSessions();
    renderLog();
    input.focus();
    return { ok: true, detail: "Cleared the active chat." };
  }

  function startNewChat() {
    var current = active();
    if (current && current.messages.length === 0) {
      return { ok: true, sessionId: current.id, detail: "Already on an empty chat." };
    }
    for (var i = 0; i < sessions.length; i++) {
      if (isPlaceholder(sessions[i])) {
        activeId = sessions[i].id;
        renderSessions();
        renderLog();
        input.focus();
        return { ok: true, sessionId: activeId, detail: "Switched to an empty chat." };
      }
    }
    var session = blankSession();
    sessions.unshift(session);
    activeId = session.id;
    save();
    renderSessions();
    renderLog();
    input.focus();
    return { ok: true, sessionId: activeId, detail: "Started a new chat." };
  }

  async function sendText(rawText, opts) {
    var text = String(rawText || "").trim();
    var session = active();
    var fromAgent = !!(opts && opts.fromAgent);
    if (!text) {
      return { ok: false, error: true, content: "Empty message.", model: "", source: "none", evidence: [] };
    }
    if (!session) {
      return { ok: false, error: true, content: "No active session.", model: "", source: "none", evidence: [] };
    }
    if (sendBtn.disabled) {
      return { ok: false, error: true, content: "Busy with another turn.", model: "", source: "none", evidence: [] };
    }

    var prior = historyOf(session);
    session.messages.push({ role: "user", content: text });
    if (session.title === "New chat") session.title = text.slice(0, 42);
    session.messages.push({ role: "assistant", content: "Thinking…", pending: true });
    if (!fromAgent) input.value = "";
    sendBtn.disabled = true;
    save();
    renderSessions();
    renderLog();

    var reply = "";
    var source = "direct";
    var evidence = [];
    var trace = [];
    var thinking = [];
    var model = "";
    var errored = null;
    var result = null;

    try {
      var local = await answerFromBrowser(text);
      if (local && typeof local.content === "string" && local.content.trim()) {
        var localMsg = {
          role: "assistant",
          content: local.content.trim(),
          model: typeof local.model === "string" ? local.model : "browser",
          source: typeof local.source === "string" ? local.source : "direct",
          evidence: Array.isArray(local.evidence) ? local.evidence : [],
          trace: [{
            label: fromAgent ? "webmcp-agent" : "browser",
            ok: true,
            steps: [{
              ok: true,
              detail: fromAgent
                ? "Thin WebMCP agent answered in the page. Hosted brains were not called."
                : "Answered in the page. Hosted brains were not called.",
            }],
          }],
          thinking: [],
        };
        replacePending(session, localMsg);
        result = {
          ok: true,
          error: false,
          content: localMsg.content,
          model: localMsg.model,
          source: localMsg.source,
          evidence: localMsg.evidence,
          via: "browser",
        };
        return result;
      }

      var brainMessage = sanitizeBrainMessage(text);
      var brainHistory = sanitizeBrainHistory(prior);
      if (!brainMessage) {
        throw new Error("After removing links and noise, nothing was left to send to the brain.");
      }
      if (brainMessage !== text || brainHistory.length !== prior.length) {
        trace.push({
          label: "webmcp-sanitize",
          ok: true,
          steps: [{
            ok: true,
            detail: "Removed weblinks and unnecessary data before the hosted brain call"
              + (brainMessage.length !== text.length ? " (message " + text.length + "→" + brainMessage.length + " chars)" : "")
              + ".",
          }],
        });
      }
      await ensureBrain();
      await streamChat(
        { message: brainMessage, history: brainHistory, thinking_level: "medium" },
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
            if (obsName === "rag_search" || obsName === "web_search" || obsName === "weather_compare" || obsName === "local_time") {
              var hits = parseEvidence(event.text);
              if (hits.length) evidence = evidence.concat(hits);
              source = obsName;
            }
            trace.push({
              label: obsName,
              ok: true,
              steps: [{ ok: true, detail: typeof event.text === "string" ? event.text.slice(0, 400) : "" }],
            });
          } else if (event.type === "thinking" && typeof event.text === "string" && event.text.trim()) {
            thinking.push(event.text.trim());
            for (var t = 0; t < session.messages.length; t++) {
              if (session.messages[t].pending) {
                session.messages[t].thinking = thinking.slice();
                break;
              }
            }
            if (!reply) updatePending(session, "Thinking…");
            renderLog();
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
        thinking: thinking,
      });
      result = {
        ok: true,
        error: false,
        content: reply,
        model: model || "go-brain",
        source: source || "direct",
        evidence: evidence,
        via: "brain",
      };
      return result;
    } catch (err) {
      var fail = failureText(err);
      replacePending(session, {
        role: "assistant",
        content: fail,
        error: true,
      });
      result = {
        ok: false,
        error: true,
        content: fail,
        model: "",
        source: "none",
        evidence: [],
        via: "error",
      };
      return result;
    } finally {
      sendBtn.disabled = false;
      save();
      renderSessions();
      renderLog();
      if (!fromAgent) input.focus();
    }
  }

  window.BPMAIChat = {
    sendText: sendText,
    getLastReply: function () {
      var message = lastAssistant(active());
      if (!message) return { ok: false, content: "", detail: "No assistant reply yet." };
      return {
        ok: true,
        content: typeof message.content === "string" ? message.content : "",
        model: typeof message.model === "string" ? message.model : "",
        source: typeof message.source === "string" ? message.source : "",
        error: !!message.error,
      };
    },
    clearSession: clearActiveSession,
    newChat: startNewChat,
    getStatus: function () {
      var session = active();
      return {
        apiBase: apiBase || "",
        computeApi: COMPUTE_API,
        sessionId: session ? session.id : "",
        title: session ? session.title : "",
        messageCount: session && Array.isArray(session.messages) ? session.messages.length : 0,
        busy: !!sendBtn.disabled,
        webmcp: !!(window.BPMAIClientTools && window.BPMAIClientTools.webmcpReady && window.BPMAIClientTools.webmcpReady()),
        search: "disabled",
      };
    },
  };

  if (window.BPMAIClientTools && typeof window.BPMAIClientTools.registerWebMCP === "function") {
    window.BPMAIClientTools.registerWebMCP();
  }
})();
