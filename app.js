/* Text Escape — pure string functions; nothing is rendered or executed. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);

  function hex(n, w) { return n.toString(16).toUpperCase().padStart(w || 0, "0"); }
  function cps(s) { return Array.from(s); }
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
  function fromBytes(b) { return new TextDecoder("utf-8").decode(new Uint8Array(b)); }
  function oct3(b) { return "\\" + b.toString(8).padStart(3, "0"); }
  function nonAscii(c) { return c.codePointAt(0) > 0x7e; }
  function units(c) { var o = ""; for (var i = 0; i < c.length; i++) o += "\\u" + hex(c.charCodeAt(i), 4); return o; }

  // ---------- JSON ----------
  function jsonEsc(s, o) {
    var r = JSON.stringify(s).slice(1, -1).split(LS).join("\\u2028").split(PS).join("\\u2029");
    return o.ascii ? cps(r).map(function (c) { return nonAscii(c) ? units(c) : c; }).join("") : r;
  }
  function jsonUnesc(s) {
    try { return JSON.parse('"' + s + '"'); }
    catch (e) { throw new Error("Not a valid JSON string body (raw quotes and newlines must be escaped)"); }
  }

  // ---------- JavaScript ----------
  var JS_MAP = { "\\": "\\\\", "'": "\\'", '"': '\\"', "`": "\\`", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f", "\v": "\\v" };
  function jsEsc(s, o) {
    var out = "", a = cps(s);
    a.forEach(function (c, i) {
      var n = c.codePointAt(0);
      if (JS_MAP[c]) out += JS_MAP[c];
      else if (c === "$" && a[i + 1] === "{") out += "\\$";
      else if (n === 0) out += /[0-9]/.test(a[i + 1] || "") ? "\\x00" : "\\0";
      else if (n < 0x20 || n === 0x7f) out += "\\x" + hex(n, 2);
      else if (c === LS || c === PS) out += "\\u" + hex(n, 4);
      else if (o.ascii && n > 0x7e) out += n > 0xffff ? "\\u{" + hex(n) + "}" : "\\u" + hex(n, 4);
      else out += c;
    });
    return out;
  }
  var JS_SIMPLE = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };
  function jsUnesc(s) {
    var out = "", i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c !== "\\") { out += c; i++; continue; }
      var x = s[i + 1], m;
      if (x === undefined) throw new Error("A lone backslash at the end");
      if (JS_SIMPLE[x]) { out += JS_SIMPLE[x]; i += 2; continue; }
      if (x === "0" && !/[0-9]/.test(s[i + 2] || "")) { out += String.fromCharCode(0); i += 2; continue; }
      if (x === "x") { m = /^[0-9a-fA-F]{2}/.exec(s.slice(i + 2)); if (!m) throw new Error("Bad \\x escape at " + i); out += String.fromCharCode(parseInt(m[0], 16)); i += 4; continue; }
      if (x === "u") {
        if (s[i + 2] === "{") { m = /^\{([0-9a-fA-F]{1,6})\}/.exec(s.slice(i + 2)); if (!m || parseInt(m[1], 16) > 0x10ffff) throw new Error("Bad \\u{…} escape at " + i); out += String.fromCodePoint(parseInt(m[1], 16)); i += 2 + m[0].length; continue; }
        m = /^[0-9a-fA-F]{4}/.exec(s.slice(i + 2)); if (!m) throw new Error("Bad \\u escape at " + i);
        out += String.fromCharCode(parseInt(m[0], 16)); i += 6; continue;
      }
      if (x === "\r" && s[i + 2] === "\n") { i += 3; continue; }
      if (x === "\n" || x === "\r" || x === LS || x === PS) { i += 2; continue; }
      out += x; i += 2;
    }
    return out;
  }

  // ---------- HTML ----------
  var NAMED = { 160: "nbsp", 169: "copy", 174: "reg", 8482: "trade", 8230: "hellip", 8212: "mdash", 8211: "ndash", 8216: "lsquo", 8217: "rsquo",
    8220: "ldquo", 8221: "rdquo", 171: "laquo", 187: "raquo", 8364: "euro", 163: "pound", 165: "yen", 162: "cent", 167: "sect", 176: "deg",
    177: "plusmn", 215: "times", 247: "divide", 189: "frac12", 188: "frac14", 190: "frac34", 183: "middot", 8226: "bull", 182: "para",
    233: "eacute", 232: "egrave", 225: "aacute", 224: "agrave", 252: "uuml", 246: "ouml", 228: "auml", 231: "ccedil", 241: "ntilde", 223: "szlig" };
  function htmlEsc(s, o) {
    return cps(s).map(function (c) {
      switch (c) { case "&": return "&amp;"; case "<": return "&lt;"; case ">": return "&gt;"; case '"': return "&quot;"; case "'": return "&#39;"; }
      var n = c.codePointAt(0);
      if (o.ascii && n > 0x7e) return o.named && NAMED[n] ? "&" + NAMED[n] + ";" : "&#x" + hex(n) + ";";
      return c;
    }).join("");
  }
  var entityCache = Object.create(null), parser = null;
  function decodeNamed(ent) { // ent matches &[A-Za-z][A-Za-z0-9]*;? only: no markup can reach the parser
    if (ent in entityCache) return entityCache[ent];
    parser = parser || new DOMParser();
    var txt = parser.parseFromString("<!doctype html><body>" + ent, "text/html").body.textContent;
    return (entityCache[ent] = txt);
  }
  function numericRef(n) { return n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? String.fromCharCode(0xfffd) : String.fromCodePoint(n); }
  function htmlUnesc(s) {
    return s.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|([A-Za-z][A-Za-z0-9]*));?/g, function (m, h, d, name) {
      if (h) return numericRef(parseInt(h, 16));
      if (d) return numericRef(parseInt(d, 10));
      return decodeNamed(m);
    });
  }

  // ---------- XML ----------
  function xmlEsc(s) { return s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]; }); }
  function xmlUnesc(s) {
    return s.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, function (m, h, d, name) {
      if (h) return numericRef(parseInt(h, 16));
      if (d) return numericRef(parseInt(d, 10));
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name];
    });
  }

  // ---------- URL ----------
  function urlEsc(s, o) {
    try { var r = encodeURIComponent(s); } catch (e) { throw new Error("The text has a broken surrogate pair, which can't be URL-encoded"); }
    return o.form ? r.replace(/%20/g, "+") : r;
  }
  function urlUnesc(s, o) {
    try { return decodeURIComponent(o.form ? s.replace(/\+/g, " ") : s); }
    catch (e) { throw new Error("Malformed percent-encoding (a % not followed by valid UTF-8 bytes)"); }
  }

  // ---------- SQL ----------
  function sqlEsc(s, o) {
    var r = (o.mysql ? s.replace(/\\/g, "\\\\") : s).replace(/'/g, "''");
    return o.wrap ? "'" + r + "'" : r;
  }
  function sqlUnesc(s, o) {
    var r = s;
    if (o.wrap && /^'[\s\S]*'$/.test(r) && r.length >= 2) r = r.slice(1, -1);
    r = r.replace(/''/g, "'");
    if (o.mysql) r = r.replace(/\\([\s\S])/g, function (m, c) { return { n: "\n", r: "\r", t: "\t", 0: String.fromCharCode(0), Z: String.fromCharCode(26) }[c] || c; });
    return r;
  }

  // ---------- CSV ----------
  function csvEsc(s, o) {
    var d = o.delim || ",";
    var need = o.always || s.indexOf(d) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s);
    return need ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvUnesc(s) {
    if (/^"[\s\S]*"$/.test(s) && s.length >= 2) {
      var inner = s.slice(1, -1);
      if (inner.replace(/""/g, "").indexOf('"') >= 0) throw new Error("A lone quote inside a quoted field");
      return inner.replace(/""/g, '"');
    }
    return s;
  }

  // ---------- regex ----------
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }
  function reUnesc(s) { return s.replace(/\\([\s\S])/g, "$1"); }

  // ---------- shell (POSIX single quotes) ----------
  function shEsc(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }
  function shUnesc(s) {
    var out = "", i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === "'") { var e = s.indexOf("'", i + 1); if (e < 0) throw new Error("Unclosed single quote"); out += s.slice(i + 1, e); i = e + 1; continue; }
      if (c === '"') {
        var j = i + 1;
        for (;;) {
          if (j >= s.length) throw new Error("Unclosed double quote");
          if (s[j] === '"') break;
          if (s[j] === "\\" && /["\\$`\n]/.test(s[j + 1] || "")) { if (s[j + 1] !== "\n") out += s[j + 1]; j += 2; continue; }
          out += s[j]; j++;
        }
        i = j + 1; continue;
      }
      if (c === "\\") { if (s[i + 1] !== "\n") out += s[i + 1] || ""; i += 2; continue; }
      out += c; i++;
    }
    return out;
  }

  // ---------- C / C++ ----------
  var C_MAP = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\t": "\\t", "\r": "\\r", "\b": "\\b", "\f": "\\f", "\v": "\\v" };
  C_MAP[String.fromCharCode(7)] = "\\a";
  function cEsc(s, o) {
    return cps(s).map(function (c) {
      var n = c.codePointAt(0);
      if (C_MAP[c]) return C_MAP[c];
      if (c === "?") return "?"; // trigraphs are gone in modern C/C++
      if (n < 0x20 || n === 0x7f) return oct3(n);
      if (o.ascii && n > 0x7e) return utf8(c).map(oct3).join("");
      return c;
    }).join("");
  }
  var C_SIMPLE = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, "\\": 92, "'": 39, '"': 34, "?": 63, e: 27 };
  function cUnesc(s) {
    var bytes = [], i = 0, m;
    function text(t) { utf8(t).forEach(function (b) { bytes.push(b); }); }
    while (i < s.length) {
      var c = s[i];
      if (c !== "\\") { var cp = s.codePointAt(i), ch = String.fromCodePoint(cp); text(ch); i += ch.length; continue; }
      var x = s[i + 1];
      if (x === undefined) throw new Error("A lone backslash at the end");
      if (C_SIMPLE[x] !== undefined) { bytes.push(C_SIMPLE[x]); i += 2; continue; }
      if ((m = /^[0-7]{1,3}/.exec(s.slice(i + 1)))) { bytes.push(parseInt(m[0], 8) & 255); i += 1 + m[0].length; continue; }
      if (x === "x" && (m = /^[0-9a-fA-F]+/.exec(s.slice(i + 2)))) { bytes.push(parseInt(m[0].slice(-2), 16)); i += 2 + m[0].length; continue; }
      if (x === "u" && (m = /^[0-9a-fA-F]{4}/.exec(s.slice(i + 2)))) { text(String.fromCodePoint(parseInt(m[0], 16))); i += 6; continue; }
      if (x === "U" && (m = /^[0-9a-fA-F]{8}/.exec(s.slice(i + 2))) && parseInt(m[0], 16) <= 0x10ffff) { text(String.fromCodePoint(parseInt(m[0], 16))); i += 10; continue; }
      if (x === "\n") { i += 2; continue; }
      throw new Error("Unknown escape \\" + x);
    }
    return fromBytes(bytes);
  }

  // ---------- Java / C# ----------
  var J_MAP = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\t": "\\t", "\r": "\\r", "\b": "\\b", "\f": "\\f" };
  function javaEsc(s, o) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i], n = s.charCodeAt(i);
      if (J_MAP[c]) out += J_MAP[c];
      // control characters as octal: a \\u000a escape would end the string literal before Java even lexes it
      else if (n < 0x20 || n === 0x7f) out += oct3(n);
      else if ((o.ascii && n > 0x7e) || n === 0x2028 || n === 0x2029) out += "\\u" + hex(n, 4);
      else out += c;
    }
    return out;
  }
  function javaUnesc(s) {
    var out = "", i = 0, m;
    var simple = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", s: " ", '"': '"', "'": "'", "\\": "\\" };
    while (i < s.length) {
      var c = s[i];
      if (c !== "\\") { out += c; i++; continue; }
      var x = s[i + 1];
      if (x === undefined) throw new Error("A lone backslash at the end");
      if (simple[x] !== undefined) { out += simple[x]; i += 2; continue; }
      if ((m = /^u+([0-9a-fA-F]{4})/.exec(s.slice(i + 1)))) { out += String.fromCharCode(parseInt(m[1], 16)); i += 1 + m[0].length; continue; }
      if ((m = /^([0-3][0-7]{0,2}|[4-7][0-7]?)/.exec(s.slice(i + 1)))) { out += String.fromCharCode(parseInt(m[0], 8)); i += 1 + m[0].length; continue; }
      if (x === "\n") { i += 2; continue; }
      throw new Error("Unknown escape \\" + x);
    }
    return out;
  }

  // ---------- Unicode escapes ----------
  function uniEsc(s, o) {
    var f = o.format || "u4", all = o.all || f === "uplus";
    var parts = cps(s).map(function (c) {
      var n = c.codePointAt(0);
      if (!all && n >= 0x20 && n <= 0x7e && c !== "\\" && c !== "&") return c;
      switch (f) {
        case "u4": return units(c);
        case "ubrace": return "\\u{" + hex(n) + "}";
        case "u8": return "\\U" + hex(n, 8);
        case "html": return "&#x" + hex(n) + ";";
        case "uplus": return "U+" + hex(n, 4);
      }
    });
    return f === "uplus" ? parts.join(" ") : parts.join("");
  }
  function uniUnesc(s, o) {
    if ((o.format || "u4") === "uplus") {
      return s.trim() ? s.trim().split(/[\s,]+/).map(function (t) {
        var m = /^(?:U\+|u\+|0x)?([0-9a-fA-F]{1,6})$/.exec(t);
        if (!m || parseInt(m[1], 16) > 0x10ffff) throw new Error("Not a code point: " + t);
        return String.fromCodePoint(parseInt(m[1], 16));
      }).join("") : "";
    }
    return s.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})|&#[xX]([0-9a-fA-F]+);|&#(\d+);/g, function (m, a, b, c, d, e) {
      var n = parseInt(a || b || c || d || e, a || b || c || d ? 16 : 10);
      if (n > 0x10ffff) throw new Error("Code point out of range: " + m);
      return b ? String.fromCharCode(n) : String.fromCodePoint(n);
    });
  }
  // In "non-ASCII only" mode a literal backslash or ampersand is escaped too, so unescaping is unambiguous.

  var MODES = [
    { id: "json", name: "JSON", esc: jsonEsc, unesc: jsonUnesc, opts: [["ascii", "Escape non-ASCII as \\uXXXX"]] },
    { id: "js", name: "JavaScript", esc: jsEsc, unesc: jsUnesc, opts: [["ascii", "Escape non-ASCII"]] },
    { id: "html", name: "HTML", esc: htmlEsc, unesc: htmlUnesc, opts: [["ascii", "Encode non-ASCII"], ["named", "Prefer named entities"]] },
    { id: "xml", name: "XML", esc: xmlEsc, unesc: xmlUnesc, opts: [] },
    { id: "url", name: "URL", esc: urlEsc, unesc: urlUnesc, opts: [["form", "Form style (+ for spaces)"]] },
    { id: "sql", name: "SQL", esc: sqlEsc, unesc: sqlUnesc, opts: [["wrap", "Wrap in quotes"], ["mysql", "Backslashes too (MySQL)"]] },
    { id: "csv", name: "CSV field", esc: csvEsc, unesc: csvUnesc, opts: [["always", "Always quote"], ["delim", "Delimiter", [[",", "Comma"], [";", "Semicolon"], ["\t", "Tab"]]]] },
    { id: "regex", name: "Regex", esc: reEsc, unesc: reUnesc, opts: [] },
    { id: "shell", name: "Shell", esc: shEsc, unesc: shUnesc, opts: [] },
    { id: "c", name: "C / C++", esc: cEsc, unesc: cUnesc, opts: [["ascii", "Non-ASCII as UTF-8 octal"]] },
    { id: "java", name: "Java / C#", esc: javaEsc, unesc: javaUnesc, opts: [["ascii", "Escape non-ASCII"]] },
    { id: "unicode", name: "Unicode", esc: uniEsc, unesc: uniUnesc, opts: [["format", "Format", [["u4", "\\uXXXX (JS, JSON, Java)"], ["ubrace", "\\u{X} (ES6, Rust, Swift)"], ["u8", "\\UXXXXXXXX (Python, C)"], ["html", "&#xX; (HTML)"], ["uplus", "U+XXXX (code points)"]]], ["all", "Every character"]] }
  ];
  var BY = {}; MODES.forEach(function (m) { BY[m.id] = m; });
  var NOTES = {
    regex: "Escapes the characters that are special in JavaScript, PCRE and Python regexes, including / for literals.",
    shell: "POSIX single quotes: safe for sh, bash and zsh.",
    sql: "Standard SQL doubles single quotes. Prefer parameterised queries over escaping.",
    csv: "Quotes the field only when needed (RFC 4180).",
    url: "encodeURIComponent: for one query value or path segment."
  };

  // ================= UI =================
  var input = $("#input"), output = $("#output"), status = $("#status");
  var saved = S3.store("te.state") || {};
  var state = { mode: BY[saved.mode] ? saved.mode : "json", dir: saved.dir === "unesc" ? "unesc" : "esc", opts: saved.opts || {}, text: "", ok: false };

  MODES.forEach(function (m) {
    var b = S3.h("button", { "data-v": m.id, "aria-pressed": "false", text: m.name });
    b.addEventListener("click", function () { state.mode = m.id; drawOpts(); render(); });
    $("#mode").appendChild(b);
  });
  $$("#dir button").forEach(function (b) { b.addEventListener("click", function () { state.dir = b.dataset.v; render(); }); });

  function modeOpts(id) { state.opts[id] = state.opts[id] || {}; return state.opts[id]; }
  function drawOpts() {
    var box = $("#opts"), m = BY[state.mode], o = modeOpts(m.id);
    box.innerHTML = "";
    m.opts.forEach(function (op) {
      if (op[2]) {
        var sel = S3.h("select", { "class": "select te-sel", "aria-label": op[1] });
        op[2].forEach(function (v) { sel.appendChild(S3.h("option", { value: v[0], text: v[1] })); });
        sel.value = o[op[0]] != null ? o[op[0]] : op[2][0][0];
        sel.addEventListener("change", function () { o[op[0]] = sel.value; render(); });
        box.appendChild(sel);
      } else {
        var cb = S3.h("input", { type: "checkbox" }); cb.checked = !!o[op[0]];
        cb.addEventListener("change", function () { o[op[0]] = cb.checked; render(); });
        box.appendChild(S3.h("label", { "class": "check" }, [cb, " " + op[1]]));
      }
    });
  }
  function run(id, dir, text, o) { var m = BY[id]; return dir === "esc" ? m.esc(text, o || {}) : m.unesc(text, o || {}); }

  function render() {
    S3.store("te.state", { mode: state.mode, dir: state.dir, opts: state.opts });
    $$("#mode button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === state.mode)); });
    $$("#dir button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === state.dir)); });
    var esc = state.dir === "esc", m = BY[state.mode];
    $("#inLabel").textContent = esc ? "Text" : m.name + " escaped text";
    $("#outLabel").textContent = esc ? m.name + " escaped" : "Unescaped text";
    $("#note").textContent = NOTES[m.id] || "";
    var text = input.value;
    state.ok = false; state.text = "";
    if (!text) { output.value = ""; status.className = "chip"; status.textContent = "Waiting for text"; $("#info").textContent = ""; renderAll(); return; }
    try {
      state.text = run(m.id, state.dir, text, modeOpts(m.id));
      state.ok = true; output.value = state.text;
      status.className = "chip ok"; status.textContent = esc ? "Escaped" : "Unescaped";
      $("#info").textContent = cps(text).length.toLocaleString() + " → " + cps(state.text).length.toLocaleString() + " characters";
    } catch (e) {
      output.value = ""; status.className = "chip bad"; status.textContent = e.message; $("#info").textContent = "";
    }
    renderAll();
  }
  function renderAll() {
    var t = $("#all"), text = state.dir === "esc" ? input.value : (state.ok ? state.text : "");
    t.innerHTML = "";
    if (!text) { t.appendChild(S3.h("tbody", null, [S3.h("tr", null, [S3.h("td", { "class": "empty", text: "Type some text to see it in every format." })])])); return; }
    var tb = S3.h("tbody");
    MODES.forEach(function (m) {
      var v;
      try { v = m.esc(text, modeOpts(m.id)); } catch (e) { v = "(" + e.message + ")"; }
      var tr = S3.h("tr", { title: "Click to copy" }, [S3.h("th", { text: m.name }), S3.h("td", { "class": "mono", text: v.length > 400 ? v.slice(0, 400) + "…" : v })]);
      tr.addEventListener("click", function () { S3.copy(v, m.name + " copied"); });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
  }

  var SAMPLE = 'He said "hi" & left <b>\'now\'</b>\nC:\\path\\to\\file.txt\ttab  ' + String.fromCodePoint(0x1F600) + " caf" + String.fromCharCode(233) + " 50% off, a+b=c\n" + String.fromCharCode(1605, 1585, 1581, 1576, 1575);
  input.addEventListener("input", S3.debounce(render, 120));
  $("#swap").addEventListener("click", function () {
    if (!state.ok) return S3.toast("Nothing valid to swap yet", "error");
    input.value = state.text; state.dir = state.dir === "esc" ? "unesc" : "esc"; render();
  });
  $("#sample").addEventListener("click", function () { input.value = SAMPLE; state.dir = "esc"; render(); });
  $("#copy").addEventListener("click", function () { if (state.ok) { S3.copy(state.text); S3.done(); } else S3.toast("Nothing to copy yet", "error"); });

  window.S3_DEMO = function () { state.mode = "json"; drawOpts(); $("#sample").click(); };

  // ================= self-test =================
  window.S3_SELFTEST = function () {
    var fails = [], F = String.fromCharCode;
    function eq(name, a, b) { if (a !== b) fails.push(name + ": got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
    var NASTY = 'He said "hi" & <b>\'yo\'</b>\\ \n\t\r tab ' + String.fromCodePoint(0x1D11E) + " " + F(233) + " " + F(252) + " " + String.fromCodePoint(0x1F600) +
      " " + LS + PS + " " + F(0) + "1 " + F(7) + F(27) + F(127) + " $(rm -rf) `x` ${y} %20 a+b, c;\"d\" [x]* ^$ | ? ' '' \\' " + F(1605, 1585, 1581, 1576, 1575) + " &amp; &#169; U+0041 \\u0041 ";
    var variants = { json: [{}, { ascii: true }], js: [{}, { ascii: true }], html: [{}, { ascii: true }, { ascii: true, named: true }], xml: [{}],
      url: [{}, { form: true }], sql: [{}, { wrap: true }, { wrap: true, mysql: true }], csv: [{}, { always: true }, { delim: ";" }], regex: [{}], shell: [{}],
      c: [{}, { ascii: true }], java: [{}, { ascii: true }], unicode: [{ format: "u4" }, { format: "u4", all: true }, { format: "ubrace" }, { format: "u8" }, { format: "html" }, { format: "uplus" }] };
    Object.keys(variants).forEach(function (id) {
      variants[id].forEach(function (o, k) {
        try { eq("round trip " + id + " #" + k, run(id, "unesc", run(id, "esc", NASTY, o), o), NASTY); }
        catch (e) { fails.push("round trip " + id + " #" + k + " threw " + e.message); }
      });
    });
    eq("json", jsonEsc('a"b\\c\n', {}), 'a\\"b\\\\c\\n');
    eq("json ascii", jsonEsc(F(233), { ascii: true }), "\\u00E9");
    eq("js unicode brace", jsUnesc("\\u{1F600}"), String.fromCodePoint(0x1F600));
    eq("js nul before digit", jsEsc(F(0) + "1", {}), "\\x001");
    eq("js template", jsEsc("`${x}`", {}), "\\`\\${x}\\`");
    eq("html", htmlEsc("<a href='x'>&", {}), "&lt;a href=&#39;x&#39;&gt;&amp;");
    eq("html unescape", htmlUnesc("&copy; &#169; &#xA9; &amp;lt; &zzq; &#0;"), F(169) + " " + F(169) + " " + F(169) + " &lt; &zzq; " + F(0xfffd));
    eq("html named", htmlEsc(F(169) + F(8364), { ascii: true, named: true }), "&copy;&euro;");
    eq("xml", xmlEsc("<a b=\"c\">'&'</a>"), "&lt;a b=&quot;c&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
    eq("url", urlEsc("a b&c/d", {}), "a%20b%26c%2Fd"); eq("url form", urlEsc("a b", { form: true }), "a+b");
    var bad = null; try { urlUnesc("%E0%A4%A", {}); } catch (e) { bad = e.message; } eq("url malformed", !!bad, true);
    eq("sql", sqlEsc("O'Brien", { wrap: true }), "'O''Brien'");
    eq("csv", csvEsc('a,"b"', {}), '"a,""b"""'); eq("csv plain", csvEsc("abc", {}), "abc");
    eq("regex", reEsc("a.b*c(d)/e"), "a\\.b\\*c\\(d\\)\\/e");
    eq("shell", shEsc("it's"), "'it'\\''s'"); eq("shell unescape mixed", shUnesc("'a'\"b c\"\\ d"), "ab c d");
    eq("c", cEsc("\"\n" + F(7) + F(0) + "1", {}), "\\\"\\n\\a\\0001");
    eq("c utf8 octal", cEsc(F(233), { ascii: true }), "\\303\\251"); eq("c hex", cUnesc("\\x41\\101\\u00e9"), "AA" + F(233));
    eq("java control", javaEsc(F(10) + F(1), {}), "\\n\\001"); eq("java uuu", javaUnesc("\\uuu0041"), "A");
    eq("unicode u4 pair", uniEsc(String.fromCodePoint(0x1F600), {}), "\\uD83D\\uDE00");
    eq("unicode uplus", uniEsc("Hi", { format: "uplus" }), "U+0048 U+0069");
    return fails.length ? fails : true;
  };

  drawOpts();
  render();
})();
