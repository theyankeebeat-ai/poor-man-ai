(function (global) {
  "use strict";

  var WEATHER_RE = /\b(weather|forecast|temperature|temp|rain|umbrella|jacket|°[cf]|humid|wind)\b/i;
  var CLOCK_RE = /\b(?:what(?:'s| is) the time|what time is it|current time|local time|time zone|timezone|(?:the )?time in)\b/i;
  var CLOCK_TAIL_RE = /\b(?:right now|currently|today|now|please)\b/gi;
  var SPORTS_RE = /\b(nfl|nba|wnba|mlb|nhl|mls|soccer|football|basketball|kickoff|monday night|sunday night|this weekend|who(?:'s| is) playing|what teams|what time (?:are|is) (?:they|it) playing)\b/i;
  var MATH_LEAD = /^\s*(?:what(?:'s| is)|calculate|compute|how much is)\s*/i;
  var MATH_TAIL = /[.!?]\s+(?:reply|answer|just|only|please|give|show|return)\b/i;
  var JUST_NUM = /\bjust\s+the\s+number\b/i;
  var PLACE_RE = /\b(?:in|for|at)\s+([A-Za-z][A-Za-z .'’,-]{1,60})/i;
  var FAHRENHEIT_RE = /\b(fahrenheit|°f|imperial)\b/i;

  var COUNTRY_ALIAS = {
    usa: "US",
    us: "US",
    america: "US",
    "united states": "US",
    "united states of america": "US",
    uk: "GB",
    "u.k": "GB",
    britain: "GB",
    "great britain": "GB",
    england: "GB",
    scotland: "GB",
    wales: "GB",
    "united kingdom": "GB",
    uae: "AE",
    "united arab emirates": "AE",
    "south korea": "KR",
    korea: "KR",
    "north korea": "KP",
    russia: "RU",
    "russian federation": "RU",
    "czech republic": "CZ",
    czechia: "CZ",
    holland: "NL",
    "the netherlands": "NL",
  };

  var WEATHER_CODES = {
    0: "clear",
    1: "cloudy",
    2: "cloudy",
    3: "cloudy",
    45: "fog",
    48: "fog",
    51: "rain",
    53: "rain",
    55: "rain",
    61: "rain",
    63: "rain",
    65: "rain",
    71: "snow",
    73: "snow",
    75: "snow",
    80: "rain",
    81: "rain",
    82: "rain",
    85: "snow",
    86: "snow",
    95: "thunderstorm",
    96: "thunderstorm",
    99: "thunderstorm",
  };

  function collapseSpace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function placeFrom(message) {
    var m = PLACE_RE.exec(message || "");
    if (!m) return "";
    return String(m[1] || "").replace(/^[\s.,]+|[\s.,]+$/g, "");
  }

  function clockPlace(message) {
    var place = placeFrom(message);
    if (!place) return "";
    return collapseSpace(place.replace(CLOCK_TAIL_RE, " ")).replace(/^[\s.,?]+|[\s.,?]+$/g, "");
  }

  function isWeather(message) {
    return WEATHER_RE.test(message || "");
  }

  function isTime(message) {
    var s = message || "";
    return CLOCK_RE.test(s) && !SPORTS_RE.test(s);
  }

  function safeExpr(expr) {
    if (!expr) return false;
    for (var i = 0; i < expr.length; i++) {
      var ch = expr.charAt(i);
      if ("0123456789+-*/()%. ".indexOf(ch) === -1) return false;
    }
    return true;
  }

  function formatNum(val) {
    if (!isFinite(val)) return String(val);
    if (Math.trunc(val) === val) return String(Math.trunc(val));
    return String(val);
  }

  function Parser(src) {
    this.s = src;
    this.i = 0;
  }

  Parser.prototype.parseExpr = function () {
    var left = this.parseTerm();
    while (this.i < this.s.length) {
      var op = this.s.charAt(this.i);
      if (op !== "+" && op !== "-") break;
      this.i += 1;
      var right = this.parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  Parser.prototype.parseTerm = function () {
    var left = this.parsePower();
    while (this.i < this.s.length) {
      var op = this.s.charAt(this.i);
      if (op !== "*" && op !== "/" && op !== "%") break;
      if (op === "*" && this.s.charAt(this.i + 1) === "*") break;
      this.i += 1;
      var right = this.parsePower();
      if (op === "*") left *= right;
      else if (op === "/") {
        if (right === 0) throw new Error("div0");
        left /= right;
      } else {
        if (right === 0) throw new Error("mod0");
        left %= right;
      }
    }
    return left;
  };

  Parser.prototype.parsePower = function () {
    var base = this.parseUnary();
    if (this.s.charAt(this.i) === "*" && this.s.charAt(this.i + 1) === "*") {
      this.i += 2;
      return Math.pow(base, this.parsePower());
    }
    return base;
  };

  Parser.prototype.parseUnary = function () {
    var ch = this.s.charAt(this.i);
    if (ch === "+" || ch === "-") {
      this.i += 1;
      var v = this.parseUnary();
      return ch === "-" ? -v : v;
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    if (this.s.charAt(this.i) === "(") {
      this.i += 1;
      var v = this.parseExpr();
      if (this.s.charAt(this.i) !== ")") throw new Error("paren");
      this.i += 1;
      return v;
    }
    var start = this.i;
    var c = this.s.charAt(this.i);
    if (c === "." || (c >= "0" && c <= "9")) {
      this.i += 1;
      while (this.i < this.s.length) {
        var n = this.s.charAt(this.i);
        if ((n < "0" || n > "9") && n !== ".") break;
        this.i += 1;
      }
      return parseFloat(this.s.slice(start, this.i));
    }
    throw new Error("token");
  };

  function tryMath(message) {
    var raw = String(message || "").trim();
    if (!raw) return null;
    var head = raw;
    var tail = MATH_TAIL.exec(raw);
    if (tail) head = raw.slice(0, tail.index);
    var expr = String(head).trim().replace(MATH_LEAD, "");
    expr = expr.replace(/[.!?]+$/, "");
    expr = expr.replace(/×/g, "*").replace(/÷/g, "/");
    expr = expr.replace(/\s+plus\s+/gi, "+");
    expr = expr.replace(/\s+minus\s+/gi, "-");
    expr = expr.replace(/\s+(?:times|multiplied\s+by)\s+/gi, "*");
    expr = expr.replace(/\s+(?:divided\s+by|over)\s+/gi, "/");
    expr = expr.replace(/\s+/g, "").replace(/\^/g, "**");
    if (!safeExpr(expr.replace(/\*\*/g, ""))) return null;
    try {
      var parser = new Parser(expr);
      var val = parser.parseExpr();
      if (parser.i !== parser.s.length) return null;
      if (!isFinite(val)) return null;
      var num = formatNum(val);
      if (JUST_NUM.test(raw)) {
        return { content: num, source: "direct", model: "browser-math" };
      }
      var shown = expr.replace(/\*\*/g, "^");
      return {
        content: shown + " = **" + num + "**.",
        source: "direct",
        model: "browser-math",
      };
    } catch (_err) {
      return null;
    }
  }

  function placeAttempts(place) {
    place = collapseSpace(String(place || "").replace(/[?.!]+$/g, "").replace(/,/g, " "));
    var fields = place.split(/\s+/).filter(Boolean);
    if (!fields.length) return [];
    var out = [{ name: fields.join(" "), hint: "" }];
    for (var n = 1; n <= 3 && n < fields.length; n++) {
      var name = fields.slice(0, fields.length - n).join(" ");
      if (name.replace(/\s+/g, "").length < 2) continue;
      out.push({
        name: name,
        hint: fields.slice(fields.length - n).join(" "),
      });
    }
    return out;
  }

  function countryMatches(hit, hint) {
    var h = String(hint || "").trim().toLowerCase().replace(/\.$/, "");
    if (!h) return true;
    if (COUNTRY_ALIAS[h] && String(hit.code || "").toUpperCase() === COUNTRY_ALIAS[h]) return true;
    var country = String(hit.country || "").toLowerCase();
    var admin = String(hit.admin1 || "").toLowerCase();
    if (
      h === country ||
      h === String(hit.code || "").toLowerCase() ||
      h === admin
    ) {
      return true;
    }
    if (country && (country.indexOf(h) !== -1 || h.indexOf(country) !== -1)) return true;
    if (admin && (admin === h || admin.indexOf(h) !== -1)) return true;
    return false;
  }

  function hitCovers(hit, phrase) {
    var blob = [hit.name, hit.country, hit.admin1, hit.code].join(" ").toLowerCase();
    var words = String(phrase || "").toLowerCase().split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      var word = words[i].replace(/[.,]/g, "");
      if (!word) continue;
      if (COUNTRY_ALIAS[word] && String(hit.code || "").toUpperCase() === COUNTRY_ALIAS[word]) continue;
      if (blob.indexOf(word) === -1) return false;
    }
    return true;
  }

  function pickGeo(hits, hint) {
    var matched = [];
    for (var i = 0; i < hits.length; i++) {
      if (countryMatches(hits[i], hint)) matched.push(hits[i]);
    }
    if (!matched.length) return null;
    var best = matched[0];
    for (var j = 1; j < matched.length; j++) {
      var hit = matched[j];
      if (hit.feature === "PPLC" && best.feature !== "PPLC") {
        best = hit;
        continue;
      }
      if (hit.feature === best.feature && hit.pop > best.pop) best = hit;
    }
    return best;
  }

  function geoSearch(name) {
    var url =
      "https://geocoding-api.open-meteo.com/v1/search?count=10&name=" +
      encodeURIComponent(name);
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("geocode status " + res.status);
      return res.json();
    }).then(function (geo) {
      var rows = geo && Array.isArray(geo.results) ? geo.results : [];
      return rows.map(function (row) {
        return {
          name: row.name || "",
          country: row.country || "",
          code: row.country_code || "",
          admin1: row.admin1 || "",
          latitude: row.latitude,
          longitude: row.longitude,
          pop: row.population || 0,
          feature: row.feature_code || "",
          timezone: row.timezone || "",
        };
      });
    });
  }

  function locatePlace(place) {
    var attempts = placeAttempts(place);
    var lastErr = null;
    var sawOK = false;

    function next(i) {
      if (i >= attempts.length) {
        if (!sawOK && lastErr) return Promise.reject(lastErr);
        return Promise.reject(new Error("place not found"));
      }
      var attempt = attempts[i];
      return geoSearch(attempt.name)
        .then(function (hits) {
          sawOK = true;
          if (!attempt.hint) {
            for (var h = 0; h < hits.length; h++) {
              if (hitCovers(hits[h], attempt.name)) return hits[h];
            }
            return next(i + 1);
          }
          var best = pickGeo(hits, attempt.hint);
          if (best) return best;
          return next(i + 1);
        })
        .catch(function (err) {
          lastErr = err;
          return next(i + 1);
        });
    }

    return next(0);
  }

  function weatherCode(code) {
    return WEATHER_CODES[code] || "conditions";
  }

  function weatherReport(message) {
    var place = placeFrom(message) || String(message || "").trim();
    return locatePlace(place).then(function (g) {
      var unit = "celsius";
      var speed = "kmh";
      var label = "°C";
      if (FAHRENHEIT_RE.test(message || "")) {
        unit = "fahrenheit";
        speed = "mph";
        label = "°F";
      }
      var url =
        "https://api.open-meteo.com/v1/forecast?latitude=" +
        encodeURIComponent(g.latitude) +
        "&longitude=" +
        encodeURIComponent(g.longitude) +
        "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
        "&temperature_unit=" +
        unit +
        "&wind_speed_unit=" +
        speed;
      return fetch(url, { cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("forecast status " + res.status);
        return res.json();
      }).then(function (wx) {
        var cur = (wx && wx.current) || {};
        var line =
          g.name +
          ", " +
          g.country +
          ": Open-Meteo · " +
          Math.round(Number(cur.temperature_2m || 0)) +
          label +
          " · " +
          weatherCode(Number(cur.weather_code || -1)) +
          " · wind " +
          Math.round(Number(cur.wind_speed_10m || 0)) +
          " " +
          speed +
          " · humidity " +
          Math.round(Number(cur.relative_humidity_2m || 0)) +
          "%.";
        return {
          content: line,
          source: "weather_compare",
          model: "browser-open-meteo",
          evidence: [{ title: "Open-Meteo", url: "https://open-meteo.com/" }],
        };
      });
    }).catch(function (err) {
      if (String(err && err.message) === "place not found") {
        return {
          content: "I could not find that place in the Open-Meteo gazetteer.",
          source: "weather_compare",
          model: "browser-open-meteo",
          evidence: [],
        };
      }
      return {
        content: "Open-Meteo did not respond, so I could not look up the weather.",
        source: "weather_compare",
        model: "browser-open-meteo",
        evidence: [],
      };
    });
  }

  function formatLocalTime(date, timeZone) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timeZone,
        timeZoneName: "short",
      }).format(date);
    } catch (_err) {
      return date.toUTCString();
    }
  }

  function timeReport(message) {
    var place = clockPlace(message);
    if (!place) {
      var now = new Date();
      var utc = formatLocalTime(now, "UTC");
      var line = "No city was named. The time in UTC is " + utc + ".";
      return Promise.resolve({
        content: line,
        source: "local_time",
        model: "browser-open-meteo",
        evidence: [{ title: "UTC", url: "https://www.iana.org/time-zones" }],
      });
    }
    return locatePlace(place).then(function (g) {
      var zone = g.timezone || "UTC";
      var stamped = formatLocalTime(new Date(), zone);
      var line = g.name + ", " + g.country + ": " + stamped + " (" + zone + ").";
      return {
        content: line,
        source: "local_time",
        model: "browser-open-meteo",
        evidence: [{ title: "Open-Meteo", url: "https://open-meteo.com/" }],
      };
    }).catch(function (err) {
      if (String(err && err.message) === "place not found") {
        return {
          content: "I could not find that place in the Open-Meteo gazetteer.",
          source: "local_time",
          model: "browser-open-meteo",
          evidence: [],
        };
      }
      return {
        content: "Open-Meteo did not respond, so I could not look up the time.",
        source: "local_time",
        model: "browser-open-meteo",
        evidence: [],
      };
    });
  }

  function answerLocally(message) {
    var math = tryMath(message);
    if (math) return Promise.resolve(math);
    if (isWeather(message)) return weatherReport(message);
    if (isTime(message)) return timeReport(message);
    return Promise.resolve(null);
  }

  function registerWebMCP() {
    var mc =
      (typeof document !== "undefined" && document.modelContext) ||
      (typeof navigator !== "undefined" && navigator.modelContext) ||
      null;
    if (!mc || typeof mc.registerTool !== "function") return false;

    var tools = [
      {
        name: "browser_math",
        description: "Evaluate a safe arithmetic expression in the browser. No backend call.",
        inputSchema: {
          type: "object",
          properties: { expression: { type: "string" } },
          required: ["expression"],
        },
        execute: async function (input) {
          var result = tryMath(String((input && input.expression) || ""));
          return result ? result.content : "That expression could not be evaluated safely.";
        },
      },
      {
        name: "browser_weather",
        description: "Current weather via Open-Meteo from the visitor browser. No Poor Man AI backend call.",
        inputSchema: {
          type: "object",
          properties: { place: { type: "string" } },
          required: ["place"],
        },
        execute: async function (input) {
          var place = String((input && input.place) || "").trim();
          var result = await weatherReport("weather in " + place);
          return result.content;
        },
      },
      {
        name: "browser_local_time",
        description: "Local civil time for a city via Open-Meteo timezone, run in the browser.",
        inputSchema: {
          type: "object",
          properties: { place: { type: "string" } },
          required: ["place"],
        },
        execute: async function (input) {
          var place = String((input && input.place) || "").trim();
          var result = await timeReport(place ? "what time is it in " + place : "what time is it");
          return result.content;
        },
      },
    ];

    tools.forEach(function (tool) {
      try {
        var maybe = mc.registerTool(tool);
        if (maybe && typeof maybe.catch === "function") {
          maybe.catch(function () { /* ignore unsupported shape */ });
        }
      } catch (_err) {
        /* WebMCP shape varies by browser build */
      }
    });
    return true;
  }

  var api = {
    tryMath: tryMath,
    isWeather: isWeather,
    isTime: isTime,
    weatherReport: weatherReport,
    timeReport: timeReport,
    answerLocally: answerLocally,
    registerWebMCP: registerWebMCP,
  };

  global.BPMAIClientTools = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", registerWebMCP);
    } else {
      registerWebMCP();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
