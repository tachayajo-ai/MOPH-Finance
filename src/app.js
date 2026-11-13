/* สมุดเรียนงบ รพ. — vanilla JS, ไม่มี dependency, ทำงานออฟไลน์ได้ */
(function () {
  "use strict";
  var D = window.APP_DATA;
  var C = D.criteria;
  var START_DATE = new Date(2026, 11, 1); // 1 ธ.ค. 2569
  var KEY = "mophfin.v1";

  // ------------------------------------------------------------ storage
  var S = load();
  function blank() {
    return { read: { tb: {}, mn: {} }, checks: {}, quiz: { history: [] }, cards: { known: {} },
      plan: { hospital: "", period: "", rows: [] }, calc: null, acp: null };
  }
  function load() {
    var s = blank();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var o = JSON.parse(raw); for (var k in o) s[k] = o[k]; }
    } catch (e) { /* storage blocked: run in-memory */ }
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // ------------------------------------------------------------ theme (auto → สว่าง → มืด)
  var THEMES = { auto: { next: "light", icon: "◐", label: "ตามเครื่อง" }, light: { next: "dark", icon: "☀", label: "สว่าง" }, dark: { next: "auto", icon: "☾", label: "มืด" } };
  function applyTheme() {
    var t = THEMES[S.theme] ? S.theme : "auto", root = document.documentElement;
    if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-btn]"), function (b) {
      b.innerHTML = '<span aria-hidden="true">' + THEMES[t].icon + "</span><span>" + THEMES[t].label + "</span>";
      b.setAttribute("aria-label", "ธีม: " + THEMES[t].label + " — กดเพื่อเปลี่ยนเป็น" + THEMES[THEMES[t].next].label);
      b.title = "สลับธีม (ตอนนี้: " + THEMES[t].label + ")";
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-btn]");
    if (!b) return;
    var t = THEMES[S.theme] ? S.theme : "auto";
    S.theme = THEMES[t].next; save(); applyTheme();
    if (typeof drawMindmaps === "function") setTimeout(function () { drawMindmaps(); }, 30);
  });
  applyTheme();

  // ------------------------------------------------------------ helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function srcTag(id) {
    var s = C.sources[id];
    if (!s) return "";
    var t = esc(s.title);
    return s.url ? '<a class="src" href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + t + '">[' + id + "]</a>"
                 : '<span class="src" title="' + t + '">[' + id + "]</span>";
  }
  function verifyTag() { return '<span class="tag verify">' + esc(C.verify_label) + "</span>"; }
  function mockTag() { return '<span class="tag mock">ตัวเลขสมมติ</span>'; }
  function parseNum(v) {
    if (v == null) return NaN;
    var s = String(v).replace(/[,\s฿]/g, "").replace(/^\((.*)\)$/, "-$1");
    if (s === "" || s === "-") return NaN;
    return Number(s);
  }
  function fmtBaht(n, dp) {
    if (!isFinite(n)) return "—";
    var neg = n < 0, a = Math.abs(n);
    var s = a.toLocaleString("th-TH", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
    return neg ? "(" + s + ")" : s; // แบบบัญชี: ค่าติดลบในวงเล็บ
  }
  function fmtMB(n) { return isFinite(n) ? fmtBaht(n / 1e6, 2) + " ลบ." : "—"; }
  function fmtR(n) { return isFinite(n) ? n.toFixed(2) : "—"; }
  function toast(msg) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function copyText(text, fallbackBox) {
    function fb() {
      if (fallbackBox) { fallbackBox.hidden = false; fallbackBox.value = text; fallbackBox.focus(); fallbackBox.select(); toast("คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความให้แล้ว กด Ctrl+C"); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("คัดลอกแล้ว"); }, fb);
      } else fb();
    } catch (e) { fb(); }
  }
  // ดาวน์โหลด: ใน claude.ai ใช้ capability "downloads" (ผู้ใช้ยืนยันก่อนบันทึก) · เปิดไฟล์ในเครื่องใช้ลิงก์ปกติ
  var DL = null;
  try {
    if (window.claude && typeof window.claude.use === "function") {
      window.claude.use("downloads").then(function (ns) { DL = ns; }, function () {});
    }
  } catch (e) {}
  function download(name, text, mime) {
    var data = "\ufeff" + text; // BOM ให้ Excel อ่านภาษาไทยถูก
    if (DL) {
      DL.save({ filename: name, data: data }).then(function () { toast("บันทึกไฟล์แล้ว: " + name); }, function (err) {
        var code = err && err.code;
        if (code === "declined") toast("ยกเลิกการบันทึกไฟล์");
        else if (code === "rate_limited") toast("มีหน้าต่างยืนยันค้างอยู่ — ลองใหม่อีกครั้ง");
        else toast("ดาวน์โหลดไม่ได้ในหน้านี้ — ใช้ปุ่มคัดลอกแทน");
      });
      return;
    }
    try {
      var blob = new Blob([data], { type: mime || "text/plain;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) { toast("ดาวน์โหลดไม่ได้ในหน้านี้ — ใช้ปุ่มคัดลอกแทน"); }
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  // ------------------------------------------------------------ PDPA guard
  var PDPA_RULES = [
    { re: /\d{13}/, why: "ตัวเลข 13 หลัก (อาจเป็นเลขบัตรประชาชน)" },
    { re: /\d[\s-]\d{4}[\s-]\d{5}[\s-]\d{2}[\s-]\d/, why: "รูปแบบเลขบัตรประชาชน" },
    { re: /(^|[^A-Za-z])(HN|AN)\s*[:.#]?\s*\d{3,}/i, why: "HN / AN" },
    { re: /ชื่อผู้ป่วย|ชื่อ-สกุลผู้ป่วย/, why: "ชื่อผู้ป่วย" },
    { re: /(^|\s)(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.)\s?(?!แพทย์|กองค์การ|จ้าง|ทะเบียน|อำเภอ|ก)[ก-๙]{2,}\s+[ก-๙]{2,}/, why: "คำนำหน้าชื่อ + ชื่อ-สกุล" }
  ];
  function pdpaCheck(text) {
    for (var i = 0; i < PDPA_RULES.length; i++) if (PDPA_RULES[i].re.test(text)) return PDPA_RULES[i].why;
    return null;
  }

  // ------------------------------------------------------------ markdown (subset used by textbook.md)
  function inline(s) {
    var out = esc(s);
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>"; });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    return out;
  }
  function latexToText(s) {
    var prev;
    do {
      prev = s;
      s = s.replace(/\\text\{([^{}]*)\}/g, "$1").replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1) ÷ ($2)");
    } while (s !== prev);
    return s.replace(/\\times/g, "×").replace(/\\approx/g, "≈").replace(/\\,/g, " ").replace(/[{}]/g, "").trim();
  }
  // ------------------------------------------------------------ mind map
  // รูปแบบ: บรรทัดแรก = หัวข้อกลาง · "- " = กิ่ง · "  - " = ใบ
  function mindmap(src) {
    var lines = src.split("\n").filter(function (l) { return l.trim(); });
    var root = lines.shift().trim(), branches = [];
    lines.forEach(function (l) {
      if (/^- /.test(l)) branches.push({ t: l.slice(2).trim(), leaves: [] });
      else if (/^\s+- /.test(l) && branches.length) branches[branches.length - 1].leaves.push(l.replace(/^\s+- /, "").trim());
    });
    var half = Math.ceil(branches.length / 2);
    function card(b, i, side) {
      return '<div class="mm-branch ' + side + '" style="--c:var(--m' + (i % 6 + 1) + ')"><div class="mm-title">' + inline(b.t) + "</div>" +
        (b.leaves.length ? "<ul>" + b.leaves.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    }
    var left = branches.slice(0, half).map(function (b, i) { return card(b, i, "left"); }).join("");
    var right = branches.slice(half).map(function (b, i) { return card(b, i + half, "right"); }).join("");
    return '<figure class="mindmap" aria-label="แผนผังความคิด: ' + esc(root) + '"><svg class="mm-lines" aria-hidden="true"></svg>' +
      '<div class="mm-grid"><div class="mm-col">' + left + '</div><div class="mm-center"><div class="mm-root">' + inline(root) + '</div></div><div class="mm-col">' + right + "</div></div></figure>";
  }
  function drawMindmaps(scope) {
    $$(".mindmap", scope || document).forEach(function (fig) {
      var svg = fig.querySelector(".mm-lines"), rootEl = fig.querySelector(".mm-root");
      var box = fig.getBoundingClientRect();
      svg.setAttribute("width", box.width); svg.setAttribute("height", box.height);
      svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
      if (getComputedStyle(svg).display === "none" || !box.width) { svg.innerHTML = ""; return; }
      var r = rootEl.getBoundingClientRect(), cy = r.top + r.height / 2 - box.top;
      svg.innerHTML = $$(".mm-branch", fig).map(function (b) {
        var t = b.querySelector(".mm-title").getBoundingClientRect(), left = b.classList.contains("left");
        var x1 = left ? r.left - box.left : r.right - box.left;
        var x2 = left ? t.right - box.left : t.left - box.left, y2 = t.top + t.height / 2 - box.top;
        var mx = (x1 + x2) / 2;
        return '<path d="M' + x1 + " " + cy + " C" + mx + " " + cy + " " + mx + " " + y2 + " " + x2 + " " + y2 + '" fill="none" stroke="' + getComputedStyle(b).getPropertyValue("--c") + '" stroke-width="2.5" stroke-linecap="round"/>';
      }).join("");
    });
  }
  var mmTimer = null;
  window.addEventListener("resize", function () { clearTimeout(mmTimer); mmTimer = setTimeout(function () { drawMindmaps(); }, 120); });

  function md(src, taskPrefix) {
    var lines = src.split("\n"), html = [], i = 0, task = 0, para = [];
    function flush() { if (para.length) { html.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } }
    function cells(l) { return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); }); }
    while (i < lines.length) {
      var l = lines[i];
      var fold = /^:::\s*(\S.*)$/.exec(l);
      if (fold) {
        // บล็อกพับได้  ::: ดูเฉลย  ...  :::
        flush(); var inner = []; i++;
        while (i < lines.length && !/^:::\s*$/.test(lines[i])) inner.push(lines[i++]);
        i++;
        var sub = md(inner.join("\n"), null);
        html.push('<details class="fold"><summary>' + inline(fold[1]) + "</summary>" + sub + "</details>");
        continue;
      }
      if (/^```/.test(l)) {
        flush(); var lang = l.slice(3).trim(), buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        var body = buf.join("\n");
        if (lang === "mindmap") { html.push(mindmap(body)); continue; }
        html.push('<div class="formula">' + esc(lang === "latex" ? latexToText(body) : body) + "</div>");
        continue;
      }
      var h = /^(#{1,4})\s+(.*)$/.exec(l);
      if (h) { flush(); var lv = Math.max(2, h[1].length); html.push("<h" + lv + ">" + inline(h[2]) + "</h" + lv + ">"); i++; continue; }
      if (/^\s*\|/.test(l)) {
        flush(); var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        var t = '<div class="scroll-x"><table><thead><tr>' + cells(rows[0]).map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        rows.slice(2).forEach(function (r) {
          var cs = cells(r);
          if (cs.every(function (c) { return !c; })) return;
          t += "<tr>" + cs.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
        });
        html.push(t + "</tbody></table></div>");
        continue;
      }
      if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
        flush(); var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        var lis = items.map(function (it) {
          var m = /^\[( |x)\]\s+(.*)$/.exec(it);
          if (m && taskPrefix) {
            var id = taskPrefix + ":" + (task++);
            var on = S.checks[id] ? " checked" : "";
            return '<li class="task"><label><input type="checkbox" data-check="' + id + '"' + on + "><span>" + inline(m[2]) + "</span></label></li>";
          }
          return "<li>" + inline(it) + "</li>";
        }).join("");
        html.push(ordered ? "<ol>" + lis + "</ol>" : "<ul>" + lis + "</ul>");
        continue;
      }
      if (!l.trim()) { flush(); i++; continue; }
      para.push(l.trim()); i++;
    }
    flush();
    return html.join("\n");
  }

  // ------------------------------------------------------------ content model
  var TB = (function () {
    var parts = D.textbook.split(/\n(?=## )/);
    parts.shift(); // หัวเรื่อง + byline
    return parts.map(function (p, idx) {
      var title = p.split("\n")[0].replace(/^##\s+/, "");
      var short = idx === 0 ? "บทที่ 0 วิธีใช้ตำรา + แผนเรียน" : (idx === parts.length - 1 ? "บทที่ 8 ทบทวน · ศัพท์ · อ้างอิง" : title);
      var tasks = (p.match(/^- \[ \]/gm) || []).length;
      return { idx: idx, title: title, short: short, md: p, tasks: tasks };
    });
  })();
  var MN = (function () {
    var parts = D.manual.split(/(?=<h2)/);
    var intro = parts.shift();
    var out = [], pre = intro;
    parts.forEach(function (p) {
      var t = /<h2[^>]*>([^<]*)<\/h2>/.exec(p)[1].replace(/&quot;/g, '"');
      if (t === "สารบัญ" || t === "วิธีใช้คู่มือเล่มนี้") { pre += p; return; }
      out.push({ title: t, html: p });
    });
    out.unshift({ title: "เริ่มต้น: วิธีใช้คู่มือ", html: "<h2>เริ่มต้น: วิธีใช้คู่มือ</h2>" + pre.replace(/<h2[^>]*>([^<]*)<\/h2>/g, "<h3>$1</h3>") });
    return out;
  })();
  var GL = D.glossary.terms;

  function tbTasksDone(ch) {
    var n = 0; for (var i = 0; i < ch.tasks; i++) if (S.checks["tb" + ch.idx + ":" + i]) n++; return n;
  }
  function stats() {
    var tbRead = TB.filter(function (c) { return S.read.tb[c.idx]; }).length;
    var mnRead = MN.filter(function (c, i) { return S.read.mn[i]; }).length;
    var tasksAll = TB.reduce(function (a, c) { return a + c.tasks; }, 0);
    var tasksDone = TB.reduce(function (a, c) { return a + tbTasksDone(c); }, 0);
    var known = Object.keys(S.cards.known).filter(function (k) { return S.cards.known[k]; }).length;
    var h = S.quiz.history, last = h.length ? h[h.length - 1] : null;
    return { tbRead: tbRead, mnRead: mnRead, tasksAll: tasksAll, tasksDone: tasksDone, known: known, last: last };
  }

  // ------------------------------------------------------------ routing
  var VIEWS = [
    { id: "home", label: "หน้าหลัก", grp: "" },
    { id: "textbook", label: "ตำรางบการเงิน", grp: "เรียน" },
    { id: "manual", label: "คู่มือประกันสุขภาพ", grp: "เรียน" },
    { id: "glossary", label: "อภิธานศัพท์", grp: "เรียน" },
    { id: "ratio", label: "Ratio + Risk Score", grp: "ฝึกคำนวณ" },
    { id: "acp", label: "ACP Cash Unlock", grp: "ฝึกคำนวณ" },
    { id: "case", label: "กรณีศึกษา 21 รพ.", grp: "ฝึกคำนวณ" },
    { id: "quiz", label: "แบบทดสอบ", grp: "ทบทวน" },
    { id: "cards", label: "Flashcards", grp: "ทบทวน" },
    { id: "plan", label: "Action plan", grp: "ลงมือทำ" },
    { id: "sources", label: "เกณฑ์และแหล่งอ้างอิง", grp: "ตั้งค่า" },
    { id: "backup", label: "สำรองความคืบหน้า", grp: "ตั้งค่า" }
  ];
  var RENDER = {};
  var current = "home";

  function nav() {
    var st = stats(), badge = {
      textbook: st.tbRead + "/" + TB.length, manual: st.mnRead + "/" + MN.length,
      cards: st.known + "/" + GL.length, glossary: String(GL.length)
    };
    var g = "", html = "";
    VIEWS.forEach(function (v) {
      if (v.grp && v.grp !== g) { g = v.grp; html += '<div class="grp">' + esc(g) + "</div>"; }
      html += '<a href="#' + v.id + '"' + (v.id === current ? ' aria-current="page"' : "") + "><span>" + esc(v.label) + "</span>" + (badge[v.id] ? "<small>" + badge[v.id] + "</small>" : "") + "</a>";
    });
    $("#nav").innerHTML = html;
    $("#tabs").innerHTML = VIEWS.map(function (v) { return '<a href="#' + v.id + '"' + (v.id === current ? ' aria-current="page"' : "") + ">" + esc(v.label) + "</a>"; }).join("");
    var cur = $("#tabs a[aria-current]"); if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {}
    $("#railFoot").innerHTML = "เกณฑ์: " + esc(C.version) + "<br>" + esc(C.status);
    $("#topVer").textContent = "ร่างเพื่อการเรียน";
  }
  function route() {
    var id = (location.hash || "#home").slice(1);
    if (!RENDER[id]) id = "home";
    current = id;
    nav();
    var main = $("#main");
    main.innerHTML = '<div class="page">' + RENDER[id]() + "</div>";
    if (AFTER[id]) AFTER[id](main);
    drawMindmaps(main);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawMindmaps(main); });
    window.scrollTo(0, 0);
  }
  var AFTER = {};

  // delegated checkbox handler (textbook tasks)
  document.addEventListener("change", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-check");
    if (id) { S.checks[id] = e.target.checked; save(); nav(); }
  });

  // ------------------------------------------------------------ HOME
  RENDER.home = function () {
    var st = stats();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = daysBetween(today, START_DATE);
    var cd = d > 0 ? "<b>" + d + "</b><div>วันก่อนเริ่มงาน 1 ธ.ค. 2569</div>"
                   : "<b>" + (1 - d) + "</b><div>วันที่ทำงาน (นับจาก 1 ธ.ค. 2569) — เป้าหมาย 90 วัน</div>";
    var plan = [
      { when: "สัปดาห์ 1 (ก่อนเริ่มงาน)", ch: [1, 2], out: "ทำตัวอย่าง 1.7 ด้วยมือ แล้วสร้างงบ 4 ตัวให้ผูกกันครบ 3 จุด", from: -21, to: -14 },
      { when: "สัปดาห์ 2 (ก่อนเริ่มงาน)", ch: [3], out: "บันทึกลูกหนี้ 3 จังหวะ อ่าน Aging และคำนวณ ACP ได้เอง", from: -14, to: -7 },
      { when: "สัปดาห์ 3 (ก่อนเริ่มงาน)", ch: [4], out: "คำนวณ Ratio ด้วยมือ และอ่านเป็นคู่กับ รพ. 3 แห่งในกรณีศึกษา", from: -7, to: 0 },
      { when: "วันที่ 1–30", ch: [5], out: "ยืนยันเกณฑ์ปีงบ 2570 แล้วคัดกรอง 21 รพ. ด้วยตาราง 2×2", from: 0, to: 30 },
      { when: "วันที่ 31–60", ch: [6], out: "แยกติด C 4 ถัง และเทียบต่อขนาดงานของ รพ. เป้าหมาย 3 แห่ง", from: 30, to: 60 },
      { when: "วันที่ 61–90", ch: [7], out: "Action plan + สไลด์ กวป. 1 หน้า ให้ รพ. 1 แห่ง แล้วขอ Feedback", from: 60, to: 90 }
    ];
    var dayNo = -d; // 0 = วันเริ่มงาน
    var tl = plan.map(function (p) {
      var now = dayNo >= p.from && dayNo < p.to;
      var done = p.ch.every(function (c) { return S.read.tb[c]; });
      return '<div class="step' + (now ? " now" : "") + '"><div class="when">' + esc(p.when) + (now ? " · ตอนนี้" : "") + "</div>" +
        "<div><a href=\"#textbook\" data-goch=\"" + p.ch[0] + '">บทที่ ' + p.ch.join("–") + "</a> · " + esc(p.out) + "</div>" +
        (done ? '<span class="tag ok">อ่านแล้ว</span>' : '<span class="tag">ยังไม่อ่าน</span>') + "</div>";
    }).join("");
    var next = TB.filter(function (c) { return !S.read.tb[c.idx]; })[0];
    var pct = Math.round(100 * (st.tbRead + st.tasksDone) / (TB.length + st.tasksAll));
    return '<div class="page-head"><span class="eyebrow">เป้าหมาย 90 วัน</span><h1>อ่านงบ รพ. 1 แห่ง แล้วบอกได้ใน 30 นาทีว่าป่วยตรงไหน เพราะอะไร ต้องแก้อะไร</h1>' +
      "<p>เรียงจาก Why → What → How → So what · ทุกบทจบด้วยคำถาม “แล้วมันกระทบเงินสดของ รพ. อย่างไร”</p></div>" +
      '<div class="hero"><section class="sheet stack"><h2>แผนเรียน 3 สัปดาห์ + 90 วันแรก</h2><div class="timeline">' + tl + "</div></section>" +
      '<section class="stack"><div class="sheet countdown">' + cd + "</div>" +
      '<div class="sheet stack"><div class="row" style="justify-content:space-between"><b>ความคืบหน้าตำรา</b><span class="num">' + pct + '%</span></div><div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="grid2 small"><div class="stat"><b>' + st.tbRead + "/" + TB.length + '</b><div class="muted">บทที่อ่านแล้ว</div></div><div class="stat"><b>' + st.tasksDone + "/" + st.tasksAll + '</b><div class="muted">แบบฝึกที่ติ๊กแล้ว</div></div>' +
      '<div class="stat"><b>' + st.known + '</b><div class="muted">ศัพท์ที่จำได้ (จาก ' + GL.length + ')</div></div><div class="stat"><b>' + (st.last ? st.last.score + "/" + st.last.total : "—") + '</b><div class="muted">แบบทดสอบล่าสุด</div></div></div>' +
      (next ? '<a class="btn primary" href="#textbook" data-goch="' + next.idx + '">อ่านต่อ: ' + esc(next.short) + "</a>" : '<span class="tag ok">อ่านครบทุกบทแล้ว</span>') +
      "</div></section></div>" +
      '<section class="stack"><h2 style="font-size:1.1rem">เครื่องมือฝึก</h2><div class="tool-links">' +
      '<a href="#ratio"><b>Ratio + Risk Score</b><span>CR · QR · Cash · NWC · NI → ระดับ 0–7</span></a>' +
      '<a href="#acp"><b>ACP Cash Unlock</b><span>ลด ACP กี่วัน ได้เงินสดคืนเท่าไร</span></a>' +
      '<a href="#case"><b>กรณีศึกษา 21 รพ.</b><span>ข้อมูลจริง มิ.ย. 69 · ฝึกทาย Risk Score</span></a>' +
      '<a href="#quiz"><b>แบบทดสอบ</b><span>แนวคิด · เกณฑ์ตัวเลข · ศัพท์</span></a>' +
      '<a href="#cards"><b>Flashcards</b><span>' + GL.length + " คำ 12 หมวด</span></a>" +
      '<a href="#manual"><b>คู่มือประกันสุขภาพ</b><span>กองทุน · DRG · เคลม · ม.41 · หนังสือ</span></a>' +
      '<a href="#plan"><b>Action plan</b><span>ฟอร์ม 1 หน้า 7 คอลัมน์</span></a></div></section>' +
      '<p class="notice">เกณฑ์ตัวเลขทั้งหมดในแอปมาจากเอกสารนำเสนอ/รายงานของหน่วยงาน สธ. ที่เผยแพร่ ไม่ใช่ประกาศฉบับทางการ — ' + esc(C.verify_label) + ' · <a href="#sources">ดูแหล่งอ้างอิง</a></p>';
  };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-goch]");
    if (a) { tbPos = Number(a.getAttribute("data-goch")); }
  });

  // ------------------------------------------------------------ TEXTBOOK
  var tbPos = 0;
  RENDER.textbook = function () {
    var ch = TB[tbPos];
    var toc = TB.map(function (c) {
      return '<button data-tb="' + c.idx + '"' + (c.idx === tbPos ? ' aria-current="true"' : "") + '><span class="dot' + (S.read.tb[c.idx] ? " done" : "") + '"></span><span>' + esc(c.short) + "</span></button>";
    }).join("");
    var tasks = ch.tasks ? ' · แบบฝึก <span class="num">' + tbTasksDone(ch) + "/" + ch.tasks + "</span>" : "";
    return '<div class="page-head"><span class="eyebrow">ตำรางบการเงินโรงพยาบาล สำหรับงานประกันสุขภาพ</span><p>ตัวเลขฝึกในแบบฝึกเป็นตัวเลขสมมติ · ' + esc(C.verify_label) + "</p></div>" +
      '<div class="reader"><nav class="toc" aria-label="บท">' + toc + "</nav>" +
      '<article class="sheet"><div class="prose">' + md(ch.md, "tb" + ch.idx) + "</div>" +
      '<div class="chapter-foot"><label class="row"><input type="checkbox" id="tbRead"' + (S.read.tb[ch.idx] ? " checked" : "") + "> อ่านบทนี้จบแล้ว" + tasks + "</label>" +
      '<div class="row">' + (tbPos > 0 ? '<button class="btn" data-tb="' + (tbPos - 1) + '">← บทก่อน</button>' : "") +
      (tbPos < TB.length - 1 ? '<button class="btn primary" data-tb="' + (tbPos + 1) + '">บทถัดไป →</button>' : "") + "</div></div></article></div>";
  };
  AFTER.textbook = function (root) {
    $$("[data-tb]", root).forEach(function (b) { b.onclick = function () { tbPos = Number(b.getAttribute("data-tb")); route(); }; });
    $("#tbRead", root).onchange = function (e) { S.read.tb[tbPos] = e.target.checked; save(); route(); };
  };

  // ------------------------------------------------------------ MANUAL
  var mnPos = 0;
  RENDER.manual = function () {
    var ch = MN[mnPos];
    var toc = MN.map(function (c, i) {
      return '<button data-mn="' + i + '"' + (i === mnPos ? ' aria-current="true"' : "") + '><span class="dot' + (S.read.mn[i] ? " done" : "") + '"></span><span>' + esc(c.title.replace(" · ", " ")) + "</span></button>";
    }).join("");
    return '<div class="page-head"><span class="eyebrow">คู่มือปฏิบัติงานสำหรับงานประกันสุขภาพระดับจังหวัด · ฉบับปรับปรุง ต.ค. 2569</span>' +
      "<p>เอกสารเรียบเรียงเพื่อการเรียน อ้างอิงปีงบ 2569–2570 — ตัวเลขงบกองทุนและอัตราจ่ายต้องตรวจกับประกาศ สปสช./กรมบัญชีกลาง/สปส. ฉบับจริงก่อนอ้างในหนังสือราชการ</p></div>" +
      '<div class="reader"><nav class="toc" aria-label="บท">' + toc + "</nav>" +
      '<article class="sheet"><div class="prose" id="mnBody">' + ch.html + "</div>" +
      '<div class="chapter-foot"><label class="row"><input type="checkbox" id="mnRead"' + (S.read.mn[mnPos] ? " checked" : "") + "> อ่านบทนี้จบแล้ว</label>" +
      '<div class="row">' + (mnPos > 0 ? '<button class="btn" data-mn="' + (mnPos - 1) + '">← บทก่อน</button>' : "") +
      (mnPos < MN.length - 1 ? '<button class="btn primary" data-mn="' + (mnPos + 1) + '">บทถัดไป →</button>' : "") + "</div></div></article></div>";
  };
  AFTER.manual = function (root) {
    $$("#mnBody table", root).forEach(function (t) { var w = document.createElement("div"); w.className = "scroll-x"; t.parentNode.insertBefore(w, t); w.appendChild(t); });
    $$("[data-mn]", root).forEach(function (b) { b.onclick = function () { mnPos = Number(b.getAttribute("data-mn")); route(); }; });
    $("#mnRead", root).onchange = function (e) { S.read.mn[mnPos] = e.target.checked; save(); route(); };
  };

  // ------------------------------------------------------------ GLOSSARY
  var glQ = "", glCat = "";
  function cats() { var o = []; GL.forEach(function (t) { if (o.indexOf(t.cat) < 0) o.push(t.cat); }); return o; }
  RENDER.glossary = function () {
    return '<div class="page-head"><span class="eyebrow">' + GL.length + ' คำ · ตำรางบการเงิน + ตำราคำศัพท์ ต.ค. 2569 + ภาคผนวก 28 ต.ค. 2569</span><h1>อภิธานศัพท์</h1>' +
      "<p>คำที่มี ⟦ตรวจสอบ⟧ ต้องยืนยันกับผู้รับผิดชอบงานหรือเอกสารทางการก่อนใช้ · ตัวย่อบางคำมีหลายความหมายตามบริบท เช่น CR (Central Reimbursement / Current Ratio)</p></div>" +
      '<div class="row"><input class="inp" id="glQ" placeholder="ค้นคำ ตัวย่อ หรือความหมาย…" style="flex:1;min-width:200px" value="' + esc(glQ) + '">' +
      '<select class="inp" id="glCat" style="width:auto;max-width:100%"><option value="">ทุกหมวด</option>' + cats().map(function (c) { return "<option" + (c === glCat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
      '<section class="sheet" id="glList"></section>';
  };
  AFTER.glossary = function (root) {
    function draw() {
      var q = glQ.toLowerCase();
      var list = GL.filter(function (t) {
        return (!glCat || t.cat === glCat) && (!q || (t.term + " " + t.full + " " + t.meaning).toLowerCase().indexOf(q) >= 0);
      });
      $("#glList", root).innerHTML = (list.length ? "" : '<p class="muted">ไม่พบคำที่ค้น</p>') + list.map(function (t) {
        return '<div class="gl-item"><div><b>' + esc(t.term) + '</b><div class="small muted">' + esc(t.cat) + "</div></div><div><div>" + esc(t.full) + '</div><div class="muted small">' + esc(t.meaning) + "</div></div></div>";
      }).join("");
    }
    $("#glQ", root).oninput = function (e) { glQ = e.target.value; draw(); };
    $("#glCat", root).onchange = function (e) { glCat = e.target.value; draw(); };
    draw();
  };

  // ------------------------------------------------------------ RATIO + RISK SCORE
  var CALC_FIELDS = [
    { id: "ca", label: "สินทรัพย์หมุนเวียน" },
    { id: "inv", label: "สินค้าคงเหลือ (ยา/เวชภัณฑ์/วัสดุ)" },
    { id: "oca", label: "สินทรัพย์หมุนเวียนอื่น" },
    { id: "cash", label: "เงินสด + เทียบเท่าเงินสด + เงินฝากประจำ" },
    { id: "cl", label: "หนี้สินหมุนเวียน" },
    { id: "rev", label: "รวมรายได้ (ทั้งงวด)" },
    { id: "exp", label: "รวมค่าใช้จ่าย (ทั้งงวด รวมค่าเสื่อม)" },
    { id: "dep", label: "ค่าเสื่อมราคาและค่าตัดจำหน่าย (ทั้งงวด)" },
    { id: "months", label: "จำนวนเดือนของงวด", small: true }
  ];
  // ตัวเลขสมมติเพื่อฝึก — ไม่ใช่ข้อมูลของ รพ. ใด
  var CALC_SAMPLE = { ca: "40,000,000", inv: "8,000,000", oca: "2,000,000", cash: "12,000,000", cl: "32,000,000", rev: "180,000,000", exp: "186,000,000", dep: "9,000,000", months: "12" };

  function compute(v) {
    var n = {}; CALC_FIELDS.forEach(function (f) { n[f.id] = parseNum(v[f.id]); });
    var r = {};
    r.CR = n.ca / n.cl;
    r.QR = (n.ca - (n.inv || 0) - (n.oca || 0)) / n.cl;
    r.CASH = n.cash / n.cl;
    r.NWC = n.ca - n.cl;
    r.NI = n.rev - n.exp;
    var months = n.months > 0 ? n.months : NaN;
    r.niMonth = r.NI / months;
    r.expMonth = n.exp / months;
    r.niBeforeDep = r.NI + (n.dep || 0);
    var res = scoreRatios(r, months);
    r.reserveMonths = r.NWC / r.expMonth;
    res.n = n; res.r = r;
    return res;
  }
  // คะแนน Risk Score จาก Ratio (ใช้ทั้งเครื่องคิดเลขและกรณีศึกษา) — r ต้องมี CR, QR, CASH, NWC, NI
  function scoreRatios(r, months) {
    r.niMonth = r.NI / months;
    var pts = { liquid: 0, status: 0, survival: 0 }, rows = [];
    C.ratios.forEach(function (c) {
      var val = r[c.id], fail = null;
      if (isFinite(val)) fail = c.op === "<" ? val < c.threshold : val > c.threshold;
      if (fail) pts[c.group] += c.points;
      rows.push({ c: c, val: val, fail: fail });
    });
    // มิติที่ 3 ระยะเวลาทุนหมด
    var sv = C.survival, surv = { score: null, months: NaN, caseLabel: "", formula: "" };
    if (isFinite(r.NWC) && isFinite(r.NI) && isFinite(months)) {
      var nwcPos = r.NWC >= 0, niPos = r.NI >= 0;
      var rule = function (k) { return sv.rules.filter(function (x) { return x.case === k; })[0]; };
      if (nwcPos && niPos) { surv.score = 0; surv.rule = rule("nwc_pos_ni_pos"); }
      else if (!nwcPos && !niPos) { surv.score = 2; surv.rule = rule("nwc_neg_ni_neg"); }
      else if (nwcPos && !niPos) {
        surv.rule = rule("nwc_pos_ni_neg"); surv.months = r.NWC / Math.abs(r.niMonth);
        surv.score = surv.months > sv.long_months ? 0 : (surv.months > sv.short_months ? 1 : 2);
      } else {
        surv.rule = rule("nwc_neg_ni_pos"); surv.months = Math.abs(r.NWC) / r.niMonth;
        surv.score = surv.months <= sv.short_months ? 0 : (surv.months <= sv.long_months ? 1 : 2);
      }
      pts.survival = surv.score;
    }
    var allKnown = rows.every(function (x) { return x.fail !== null; }) && surv.score !== null;
    var total = pts.liquid + pts.status + pts.survival;
    return { rows: rows, pts: pts, surv: surv, total: total, complete: allKnown };
  }
  function levelOf(score) { return C.levels.filter(function (l) { return score >= l.min && score <= l.max; })[0]; }
  function mgmtOf(score) { return C.management.filter(function (l) { return score >= l.min && score <= l.max; })[0]; }

  RENDER.ratio = function () {
    var v = S.calc || CALC_SAMPLE;
    var isSample = !S.calc;
    var inputs = CALC_FIELDS.map(function (f) {
      if (f.id === "months") {
        var m = String(parseNum(v.months));
        return '<div class="field"><label for="c_period">งวดของงบ (ปีงบประมาณเริ่ม 1 ต.ค.)</label><div class="row" style="flex-wrap:nowrap">' +
          '<select id="c_period" style="flex:1;min-width:0">' + [["3", "Q1 · ต.ค.–ธ.ค. (3 เดือน)"], ["6", "Q2 · ต.ค.–มี.ค. (6 เดือน)"], ["9", "Q3 · ต.ค.–มิ.ย. (9 เดือน)"], ["12", "Q4 / ทั้งปี (12 เดือน)"], ["", "กำหนดเอง"]].map(function (o) {
            return '<option value="' + o[0] + '"' + ((o[0] === m) || (o[0] === "" && ["3", "6", "9", "12"].indexOf(m) < 0) ? " selected" : "") + ">" + o[1] + "</option>";
          }).join("") + '</select><input class="num" id="c_months" inputmode="decimal" autocomplete="off" aria-label="จำนวนเดือนของงวด" style="width:4.5em" value="' + esc(v.months || "") + '"></div>' +
          '<span class="hint">NI สะสมตั้งแต่ต้นปีงบ ÷ จำนวนเดือน = NI เฉลี่ยต่อเดือน (ใช้ในมิติระยะเวลาทุนหมด)</span></div>';
      }
      return '<div class="field"><label for="c_' + f.id + '">' + esc(f.label) + (f.small ? "" : " (บาท)") + "</label>" +
        '<input class="num" id="c_' + f.id + '" inputmode="decimal" autocomplete="off" value="' + esc(v[f.id] || "") + '"></div>';
    }).join("");
    return '<div class="page-head"><span class="eyebrow">ตำราบทที่ 4–5</span><h1>Ratio Calculator + Risk Score Simulator</h1>' +
      "<p>กรอกตัวเลขจากงบแสดงฐานะการเงินและงบผลการดำเนินงาน (ค่าติดลบพิมพ์ -1,000 หรือ (1,000) ได้) แอปจะคำนวณ Ratio ตามสูตร [S1] และจำลองคะแนน 0–7</p></div>" +
      '<p class="notice"><b>จำลองเพื่อการเรียน ไม่ใช่ผลทางการ</b> — สูตรคะแนนรวมละเอียดต้องยืนยันกับคู่มือ สป.สธ. · ' + esc(C.verify_label) + "</p>" +
      '<div class="grid2"><section class="sheet stack"><div class="row" style="justify-content:space-between"><h2 style="margin:0">ตัวเลขจากงบ</h2><span id="sampleTag">' + (isSample ? mockTag() : "") + "</span></div>" +
      '<div class="inputs">' + inputs + "</div>" +
      '<div class="row"><button class="btn" id="cSample">ใส่ตัวเลขสมมติ</button><button class="btn ghost" id="cClear">ล้างทั้งหมด</button></div>' +
      '<p class="small muted">ใส่เฉพาะตัวเลขระดับงบการเงินของหน่วยบริการ — ไม่มีช่องสำหรับข้อมูลผู้ป่วย</p></section>' +
      '<section class="sheet stack" id="riskOut"></section></div>' +
      '<section class="sheet stack"><h2>ผล Ratio เทียบเกณฑ์</h2><div class="scroll-x" id="ratioOut"></div></section>' +
      '<section class="sheet stack"><h2>มิติที่ 3 ระยะเวลาทุนหมด (Survival Index)</h2><div id="survOut"></div></section>';
  };
  AFTER.ratio = function (root) {
    function read() { var o = {}; CALC_FIELDS.forEach(function (f) { o[f.id] = $("#c_" + f.id, root).value; }); return o; }
    function draw() {
      var res = compute(read());
      var rows = res.rows.map(function (x) {
        var c = x.c, money = c.unit === "บาท";
        var shown = money ? '<span class="num' + (x.val < 0 ? " neg" : "") + '">' + fmtMB(x.val) + "</span>" : '<span class="num">' + fmtR(x.val) + "</span>";
        var pill = x.fail === null ? '<span class="pill na">กรอกไม่ครบ</span>' : (x.fail ? '<span class="pill fail">เสี่ยง +' + c.points + "</span>" : '<span class="pill pass">ผ่าน</span>');
        return '<tr class="result-row"><td><b>' + esc(c.id === "CASH" ? "Cash" : c.id) + '</b><div class="small muted">' + esc(c.name) + '</div></td><td class="small">' + esc(c.formula) +
          (c.note ? '<div class="muted" style="font-size:.75rem">' + esc(c.note) + "</div>" : "") + '</td><td class="r">' + shown + '</td><td class="num">' + esc(c.op + " " + (money ? "0" : c.threshold.toFixed(1))) + " " + srcTag(c.src) + "</td><td>" + pill + "</td></tr>";
      }).join("");
      rows += '<tr><td><b>NI ก่อนหักค่าเสื่อม</b><div class="small muted">ใช้ดูเงินสดจากงานหลักโดยประมาณ (ไม่ใช่ EBITDA เต็มสูตร)</div></td><td class="small">NI + ค่าเสื่อมราคาและค่าตัดจำหน่าย</td><td class="r"><span class="num' + (res.r.niBeforeDep < 0 ? " neg" : "") + '">' + fmtMB(res.r.niBeforeDep) + '</span></td><td class="muted small">ไม่ใช้คิดคะแนน</td><td></td></tr>';
      $("#ratioOut", root).innerHTML = "<table><thead><tr><th>ตัวชี้วัด</th><th>สูตร</th><th class=\"r\">ค่าที่ได้</th><th>เกณฑ์เสี่ยง</th><th>ผล</th></tr></thead><tbody>" + rows + "</tbody></table>";

      var lv = res.complete ? levelOf(res.total) : null, mg = res.complete ? mgmtOf(res.total) : null;
      var gauge = '<div class="gauge" aria-label="ระดับ 0 ถึง 7">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) {
        var l = levelOf(i); return '<div class="t-' + l.tone + (res.complete && i <= res.total ? " on" : "") + (res.complete && i === res.total ? " cur" : "") + '">' + i + "</div>";
      }).join("") + "</div>";
      $("#riskOut", root).innerHTML = '<h2 style="margin:0">Risk Score จำลอง</h2>' +
        (res.complete
          ? '<div class="row" style="align-items:flex-end;gap:14px"><span class="score-big">' + res.total + '</span><div><b>' + esc(lv.meaning) + "</b> " + srcTag(C.levels_src) + '<div class="small muted">การจัดการ: ' + esc(mg.label) + " — " + esc(mg.action) + " " + srcTag(C.management_src) + "</div></div></div>"
          : '<p class="muted">กรอกตัวเลขให้ครบเพื่อคำนวณคะแนน</p>') + gauge +
        '<div class="breakdown">' + ["liquid", "status", "survival"].map(function (g) {
          return "<div><div class=\"small muted\">" + esc(C.groups[g].name) + "</div><b>" + res.pts[g] + "</b><span class=\"muted\"> / " + C.groups[g].max + "</span></div>";
        }).join("") + "</div>" +
        '<p class="small muted">' + esc(C.national_target.text) + " " + srcTag(C.national_target.src) + "</p>" +
        (isFinite(res.r.reserveMonths) && res.r.reserveMonths < 3 ? '<p class="notice pdpa small"><b>ธงแดง:</b> ทุนสำรองคงเหลือ ≈ ' + fmtR(res.r.reserveMonths) + " เดือน (NWC ÷ ค่าใช้จ่ายรวมเฉลี่ยต่อเดือน) — " + esc(C.survival.red_flag) + " " + srcTag(C.survival.red_flag_src) + "</p>" : "");

      var s = res.surv, sv = C.survival;
      $("#survOut", root).innerHTML = (s.rule
        ? '<p><b>' + esc(s.rule.label) + "</b> → ได้ <b class=\"num\">" + s.score + "</b> คะแนน " + srcTag(sv.src) + "</p>" +
          (s.rule.formula ? '<p class="formula">' + esc(s.rule.formula) + " = " + fmtR(s.months) + " เดือน · NI เฉลี่ยต่อเดือน " + fmtMB(res.r.niMonth) + "</p>" : "") +
          '<p class="small muted">เกณฑ์: ' + esc(s.rule.score) + "</p>"
        : '<p class="muted">กรอก NWC, NI และจำนวนเดือนให้ครบ</p>') +
        '<div class="scroll-x"><table><thead><tr><th>สถานะ</th><th>การให้คะแนน</th></tr></thead><tbody>' +
        sv.rules.map(function (x) { return "<tr" + (s.rule === x ? ' style="background:var(--accent-soft)"' : "") + "><td>" + esc(x.label) + "</td><td>" + esc(x.score) + "</td></tr>"; }).join("") +
        "</tbody></table></div><p class=\"small muted\">ตาม [S1]: " + esc(sv.summary) + "</p>";
    }
    CALC_FIELDS.forEach(function (f) {
      $("#c_" + f.id, root).addEventListener("input", function () { S.calc = read(); save(); $("#sampleTag", root).innerHTML = ""; draw(); });
    });
    $("#c_period", root).onchange = function (e) { if (e.target.value) { var mi = $("#c_months", root); mi.value = e.target.value; mi.dispatchEvent(new Event("input")); } };
    $("#c_months", root).addEventListener("input", function (e) { var sel = $("#c_period", root), val = String(parseNum(e.target.value)); sel.value = ["3", "6", "9", "12"].indexOf(val) >= 0 ? val : ""; });
    $("#cSample", root).onclick = function () { S.calc = null; save(); route(); };
    $("#cClear", root).onclick = function () { var o = {}; CALC_FIELDS.forEach(function (f) { o[f.id] = f.id === "months" ? "12" : ""; }); S.calc = o; save(); route(); };
    draw();
  };

  // ------------------------------------------------------------ ACP
  var ACP_SAMPLE = { ar: "14,000,000", rev: "60,000,000", days: "365", cur: "85", target: "60", fund: "UC" };
  RENDER.acp = function () {
    var v = S.acp || ACP_SAMPLE, isSample = !S.acp;
    var acpRule = C.efficiency.filter(function (e) { return e.id === "ACP-UC"; })[0];
    function f(id, label, hint) { return '<div class="field"><label for="a_' + id + '">' + label + '</label><input class="num" id="a_' + id + '" inputmode="decimal" value="' + esc(v[id] || "") + '">' + (hint ? '<span class="hint">' + hint + "</span>" : "") + "</div>"; }
    return '<div class="page-head"><span class="eyebrow">ตำราบทที่ 4.2 และ 6.2</span><h1>ACP Cash Unlock</h1><p>ลดระยะเวลาเก็บหนี้ได้กี่วัน = เงินสดกลับเข้า รพ. เท่าไร — ใช้ตอนนำเสนอผู้บริหาร</p></div>' +
      '<div class="grid2"><section class="sheet stack"><div class="row" style="justify-content:space-between"><h2 style="margin:0">1. คำนวณ ACP ปัจจุบัน</h2><span class="acpTag">' + (isSample ? mockTag() : "") + "</span></div>" +
      '<div class="field"><label for="a_fund">สิทธิ</label><select id="a_fund">' + ["UC", "CSMBS", "SSS"].map(function (x) { return "<option" + (v.fund === x ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></div>" +
      '<div class="inputs">' + f("ar", "ลูกหนี้สิทธินี้ ณ สิ้นงวด (บาท)") + f("rev", "รายได้สิทธินี้ทั้งงวด (บาท)") + f("days", "จำนวนวันในงวด", "ทั้งปี 365 · ไตรมาส ~91") + "</div>" +
      '<div class="formula">ACP = ลูกหนี้ ÷ รายได้ × จำนวนวัน = <b id="acpNow">—</b> วัน</div>' +
      '<p class="small">เกณฑ์ ACP-UC: ' + esc(acpRule.rule) + " " + srcTag(acpRule.src) + " " + verifyTag() + "</p>" +
      '<p class="small muted">ตัวหารและจำนวนวันที่ สป.สธ. ใช้จริง ให้ตรวจกับคู่มือ 7 Plus ปีงบปัจจุบัน</p>' +
      '<button class="btn" id="aUse">ใช้ค่านี้เป็น ACP ปัจจุบัน ↓</button></section>' +
      '<section class="sheet stack"><div class="row" style="justify-content:space-between"><h2 style="margin:0">2. เงินสดที่ปลดล็อกได้</h2><span class="acpTag">' + (isSample ? mockTag() : "") + "</span></div>" +
      '<div class="inputs">' + f("cur", "ACP ปัจจุบัน (วัน)") + f("target", "ACP เป้าหมาย (วัน)", "เช่น ลดลงถึงเกณฑ์ 60 วัน") + "</div>" +
      '<div class="formula">เงินสดเพิ่ม ≈ (รายได้สิทธินั้นต่อปี ÷ 365) × จำนวนวันที่ลดได้</div>' +
      '<div><div class="small muted">เงินสดที่ปลดล็อกได้โดยประมาณ</div><div class="big-money" id="unlock">—</div><div class="small" id="unlockTxt"></div></div>' +
      '<div class="row"><button class="btn" id="aCopy">คัดลอกประโยคนำเสนอ</button><button class="btn ghost" id="aSample">ใส่ตัวเลขสมมติ</button></div>' +
      '<textarea class="copybox" id="aBox" hidden></textarea></section></div>' +
      '<p class="notice info small">ทุกตัวเลขที่นำเสนอต้องอ้างแหล่ง: e-Claim/FDH (ผลเคลม), hfo (งบการเงิน), ประกาศกองทุน (อัตราจ่าย) — ตำราบทที่ 6.2</p>';
  };
  AFTER.acp = function (root) {
    var ids = ["fund", "ar", "rev", "days", "cur", "target"];
    function read() { var o = {}; ids.forEach(function (k) { o[k] = $("#a_" + k, root).value; }); return o; }
    var sentence = "";
    function draw() {
      var v = read(), ar = parseNum(v.ar), rev = parseNum(v.rev), days = parseNum(v.days);
      var acp = ar / rev * days;
      $("#acpNow", root).textContent = isFinite(acp) ? acp.toFixed(1) : "—";
      var annual = days > 0 ? rev * 365 / days : NaN;
      var cut = parseNum(v.cur) - parseNum(v.target);
      var cash = annual / 365 * cut;
      $("#unlock", root).textContent = isFinite(cash) && cut > 0 ? fmtBaht(cash) + " บาท" : "—";
      sentence = isFinite(cash) && cut > 0
        ? "ถ้าลด ACP-" + v.fund + " จาก " + v.cur + " วัน เหลือ " + v.target + " วัน (ลด " + cut + " วัน) จะมีเงินสดกลับเข้าโรงพยาบาลประมาณ " + fmtBaht(cash) + " บาท (รายได้สิทธิ " + v.fund + " ต่อปี " + fmtBaht(annual) + " บาท ÷ 365 × " + cut + " วัน)"
        : "";
      $("#unlockTxt", root).textContent = sentence || (cut <= 0 ? "ACP เป้าหมายต้องน้อยกว่าค่าปัจจุบัน" : "");
    }
    ids.forEach(function (k) { $("#a_" + k, root).addEventListener("input", function () { S.acp = read(); save(); $$(".acpTag", root).forEach(function (t) { t.innerHTML = ""; }); draw(); }); });
    $("#aUse", root).onclick = function () { var t = $("#acpNow", root).textContent; if (t !== "—") { $("#a_cur", root).value = t; S.acp = read(); save(); draw(); } };
    $("#aCopy", root).onclick = function () { if (sentence) copyText(sentence, $("#aBox", root)); };
    $("#aSample", root).onclick = function () { S.acp = null; save(); route(); };
    draw();
  };

  // ------------------------------------------------------------ QUIZ
  function criteriaQuestions() {
    var qs = [];
    var thr = [0, 0.5, 0.8, 1.0, 1.5, 2.0];
    C.ratios.forEach(function (c) {
      if (c.unit === "บาท") {
        qs.push({ q: c.id + " (" + c.name + ") ได้คะแนนเสี่ยงเมื่อใด", choices: ["< 0 (ติดลบ)", "< 1.0", "< 1 ล้านบาท", "> 0"], answer: 0, why: c.meaning + " · สูตร: " + c.formula, ref: "criteria [" + c.src + "]", crit: true });
      } else {
        var wrong = shuffle(thr.filter(function (t) { return t !== c.threshold && t !== 0; })).slice(0, 3);
        qs.push({ q: (c.id === "CASH" ? "Cash Ratio" : c.id) + " ได้คะแนนเสี่ยงเมื่อค่าน้อยกว่าเท่าใด", choices: ["< " + c.threshold.toFixed(1)].concat(wrong.map(function (w) { return "< " + w.toFixed(1); })), answer: 0, why: "สูตร: " + c.formula + " · " + c.meaning, ref: "criteria [" + c.src + "]", crit: true });
      }
    });
    C.levels.forEach(function (l) {
      if (l.min === 0) return;
      var others = shuffle(C.levels.filter(function (x) { return x !== l; })).slice(0, 3).map(function (x) { return x.meaning; });
      qs.push({ q: "Risk Score ระดับ " + l.label + " หมายถึงอะไร", choices: [l.meaning].concat(others), answer: 0, why: "ตารางความหมายระดับ Risk Score", ref: "criteria [" + C.levels_src + "]", crit: true });
    });
    qs.push({ q: "ACP-UC เกินกี่วันถือว่าไม่ผ่าน (ตามตัวอย่างในเอกสาร)", choices: ["60 วัน", "90 วัน", "30 วัน", "120 วัน"], answer: 0, why: "เกณฑ์ที่พบในเอกสาร จ.สกลนคร — ยังต้องยืนยันฉบับทางการ", ref: "criteria [S3]", crit: true });
    qs.push({ q: "มาตรฐานระยะเวลาชำระหนี้ยา (APP) ที่อ้างในรายงาน รพ.โพธิ์ตาก", choices: ["90 วัน", "60 วัน", "180 วัน", "45 วัน"], answer: 0, why: "เกิน 180 วัน = สัญญาณผิดนัดชำระ (ตำราบทที่ 4.2)", ref: "criteria [S4]", crit: true });
    qs.push({ q: "TPS คะแนนเต็มเท่าใด", choices: ["15", "7", "10", "100"], answer: 0, why: "ตัวอย่าง จ.สกลนคร กำหนดผ่านที่ 10.5", ref: "criteria [S3]", crit: true });
    qs.push({ q: "เป้าหมายประเทศ ปีงบ 67–71 สำหรับ รพ. Risk Score ระดับ 7", choices: ["ไม่เกินร้อยละ 2", "ไม่เกินร้อยละ 4", "ไม่เกินร้อยละ 5", "ไม่เกินร้อยละ 10"], answer: 0, why: C.national_target.text, ref: "criteria [S1]", crit: true });
    qs.push({ q: "ตัวอย่าง จ.กาฬสินธุ์ ยอมให้รายได้/ค่าใช้จ่ายจริงต่างจาก Planfin ได้ไม่เกินเท่าใด", choices: ["ร้อยละ 5", "ร้อยละ 10", "ร้อยละ 2", "ร้อยละ 15"], answer: 0, why: "เกณฑ์ตัวอย่างระดับจังหวัด ไม่ใช่เกณฑ์ประเทศ", ref: "criteria [S6]", crit: true });
    qs.push({ q: "จ.อุดรธานีใช้เกณฑ์อัตราครองเตียงเท่าใด (กวป. ก.ค. 69)", choices: ["≥ 80%", "≥ 70%", "≥ 85%", "≥ 90%"], answer: 0, why: "มิ.ย. 69 ผ่าน 14 จาก 21 แห่ง", ref: "criteria [K1]", crit: true });
    qs.push({ q: "เกณฑ์ CMI ของ รพ.ชุมชนระดับ F1–F3 ที่ใช้ใน กวป. ก.ค. 69", choices: ["≥ 0.6", "≥ 0.8", "≥ 1.0", "≥ 1.2"], answer: 0, why: "A ≥ 1.6 · S ≥ 1.2 · M2 ≥ 0.8 · F ≥ 0.6", ref: "criteria [K1]", crit: true });
    qs.push({ q: "Planfin ไตรมาส 3 ใช้ “ค่าที่ควรเป็นตามแผน” คำนวณอย่างไร", choices: ["แผนทั้งปี ÷ 12 × 9", "แผนทั้งปี × 75% + 5%", "ผลจริงปีก่อน × 9/12", "แผนทั้งปี ÷ 4 × 3 − 5%"], answer: 0, why: "แล้วเทียบผลจริง ต่างได้ไม่เกิน ±5%", ref: "criteria [K1]", crit: true });
    qs.push({ q: "รพ. RS เกณฑ์กระทรวง = 3 แต่ RS เขต 8 (NI) = 7 สาเหตุที่เป็นไปได้มากที่สุดคือ", choices: ["เกณฑ์เขต 8 ใช้งบที่ปรับแล้ว ทำให้ CR/NWC/NI ต่ำกว่า", "เขต 8 ใช้คะแนนเต็ม 10", "เกณฑ์กระทรวงไม่นับ Cash Ratio", "ข้อมูลคนละปีงบ"], answer: 0, why: C.rs_variants.text, ref: "criteria [K1]", crit: true });
    return qs;
  }
  function glossaryQuestions(n) {
    var pool = GL.filter(function (t) { return t.full && t.term.length < 40; });
    return shuffle(pool).slice(0, n).map(function (t) {
      var same = GL.filter(function (x) { return x !== t && x.cat === t.cat && x.full !== t.full; });
      if (same.length < 3) same = GL.filter(function (x) { return x !== t && x.full !== t.full; });
      var wrong = shuffle(same).slice(0, 3).map(function (x) { return x.full; });
      return { q: "“" + t.term + "” คืออะไร", choices: [t.full].concat(wrong), answer: 0, why: t.meaning, ref: t.cat };
    });
  }
  var quiz = null;
  RENDER.quiz = function () {
    var h = S.quiz.history.slice(-5).reverse();
    var hist = h.length ? '<div class="scroll-x"><table><thead><tr><th>วันที่</th><th>ชุด</th><th class="r">คะแนน</th></tr></thead><tbody>' + h.map(function (x) {
      return "<tr><td>" + esc(new Date(x.at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })) + "</td><td>" + esc(x.mode) + '</td><td class="r num">' + x.score + "/" + x.total + "</td></tr>";
    }).join("") + "</tbody></table></div>" : '<p class="muted small">ยังไม่มีประวัติ</p>';
    if (!quiz) {
      return '<div class="page-head"><span class="eyebrow">ทบทวน</span><h1>แบบทดสอบ</h1><p>ชุดละ 10 ข้อ สลับตัวเลือกทุกครั้ง · เฉลยพร้อมที่มาหลังตอบ</p></div>' +
        '<div class="grid3">' +
        '<button class="sheet choice" data-mode="concept"><b>แนวคิดงบการเงิน</b><div class="small muted">' + D.quiz.questions.length + " ข้อ จากตำราบทที่ 1–7</div></button>" +
        '<button class="sheet choice" data-mode="criteria"><b>เกณฑ์ตัวเลข</b><div class="small muted">Ratio · Risk Score · ACP/APP/TPS จาก criteria.json</div></button>' +
        '<button class="sheet choice" data-mode="glossary"><b>ศัพท์และตัวย่อ</b><div class="small muted">สุ่มจาก ' + GL.length + " คำ</div></button></div>" +
        '<section class="sheet stack"><h2>แบบทดสอบตนเอง 8 ข้อ (ตำราบทที่ 8)</h2><p class="small muted">ตอบได้ครบ = พร้อมใช้งานจริง · ติ๊กเมื่อตอบได้โดยไม่เปิดตำรา</p><div class="prose">' + md(selfTestMd(), "tb" + (TB.length - 1)) + "</div></section>" +
        '<section class="sheet stack"><h2>ประวัติล่าสุด</h2>' + hist + "</section>";
    }
    var q = quiz.items[quiz.i];
    return '<div class="page-head"><span class="eyebrow">' + esc(quiz.modeLabel) + "</span><h1>ข้อ " + (quiz.i + 1) + " / " + quiz.items.length + "</h1></div>" +
      '<section class="sheet stack"><div class="qmeta"><span class="muted small">คะแนน <span class="num">' + quiz.score + "</span></span>" + (q.crit ? verifyTag() : "") + "</div>" +
      '<p style="font-size:1.1rem;margin:0"><b>' + esc(q.q) + "</b></p>" +
      '<div class="choices">' + q.order.map(function (ci, k) { return '<button class="choice" data-c="' + ci + '">' + "กขคง"[k] + ". " + esc(q.choices[ci]) + "</button>"; }).join("") + "</div>" +
      '<div id="qWhy"></div><div class="row"><button class="btn primary" id="qNext" hidden>' + (quiz.i === quiz.items.length - 1 ? "ดูผล" : "ข้อถัดไป →") + '</button><button class="btn ghost" id="qQuit">เลิกชุดนี้</button></div></section>';
  };
  function selfTestMd() {
    var last = TB[TB.length - 1].md;
    var m = /### แบบทดสอบตนเอง[^\n]*\n\n([\s\S]*?)\n\n###/.exec(last);
    return m ? m[1] : "";
  }
  AFTER.quiz = function (root) {
    if (!quiz) {
      $$("[data-mode]", root).forEach(function (b) {
        b.onclick = function () {
          var mode = b.getAttribute("data-mode"), items, label;
          if (mode === "concept") { items = shuffle(D.quiz.questions).slice(0, 10); label = "แนวคิดงบการเงิน"; }
          else if (mode === "criteria") { items = shuffle(criteriaQuestions()).slice(0, 10); label = "เกณฑ์ตัวเลข"; }
          else { items = glossaryQuestions(10); label = "ศัพท์และตัวย่อ"; }
          items = items.map(function (q) { return Object.assign({}, q, { order: shuffle(q.choices.map(function (_, i) { return i; })) }); });
          quiz = { items: items, i: 0, score: 0, modeLabel: label };
          route();
        };
      });
      // checkbox ของแบบทดสอบตนเองใช้ key เดียวกับตำราบทที่ 8 แต่ index ต้องตรงกับตำแหน่งในบท
      var lastCh = TB[TB.length - 1], before = (lastCh.md.split("### แบบทดสอบตนเอง")[0].match(/^- \[ \]/gm) || []).length;
      $$("[data-check]", root).forEach(function (cb, k) { var id = "tb" + lastCh.idx + ":" + (before + k); cb.setAttribute("data-check", id); cb.checked = !!S.checks[id]; });
      return;
    }
    var q = quiz.items[quiz.i];
    $$("[data-c]", root).forEach(function (b) {
      b.onclick = function () {
        var pick = Number(b.getAttribute("data-c")), right = pick === q.answer;
        if (right) quiz.score++;
        $$("[data-c]", root).forEach(function (x) {
          x.disabled = true;
          var ci = Number(x.getAttribute("data-c"));
          if (ci === q.answer) x.classList.add("right"); else if (ci === pick) x.classList.add("wrong");
        });
        $("#qWhy", root).innerHTML = '<p class="notice ' + (right ? "info" : "") + ' small"><b>' + (right ? "ถูก" : "ยังไม่ถูก") + "</b> — " + esc(q.why) + ' <span class="src">' + esc(q.ref) + "</span></p>";
        $("#qNext", root).hidden = false; $("#qNext", root).focus();
      };
    });
    $("#qNext", root).onclick = function () {
      if (quiz.i < quiz.items.length - 1) { quiz.i++; route(); return; }
      S.quiz.history.push({ at: Date.now(), mode: quiz.modeLabel, score: quiz.score, total: quiz.items.length });
      S.quiz.history = S.quiz.history.slice(-50); save();
      toast("ได้ " + quiz.score + "/" + quiz.items.length);
      quiz = null; route();
    };
    $("#qQuit", root).onclick = function () { quiz = null; route(); };
  };

  // ------------------------------------------------------------ FLASHCARDS
  var cardCat = "", cardOnlyUnknown = true, deck = null, cardFlip = false;
  function buildDeck() {
    deck = shuffle(GL.map(function (t, i) { return i; }).filter(function (i) {
      var t = GL[i];
      if (cardCat === "__core") { if (!t.core) return false; } else if (cardCat && t.cat !== cardCat) return false;
      return !(cardOnlyUnknown && S.cards.known[t.term]);
    }));
    cardFlip = false;
  }
  RENDER.cards = function () {
    if (!deck) buildDeck();
    var t = deck.length ? GL[deck[0]] : null;
    var nKnown = GL.filter(function (x) { return S.cards.known[x.term]; }).length;
    return '<div class="page-head"><span class="eyebrow">จำได้แล้ว ' + nKnown + " / " + GL.length + ' คำ</span><h1>Flashcards</h1><p>แตะการ์ดเพื่อดูความหมาย แล้วเลือกว่าจำได้หรือยัง · เริ่มจาก “30 ตัวย่อที่ใช้บ่อยที่สุด”</p></div>' +
      '<div class="row"><select class="inp" id="cdCat" style="width:auto;max-width:100%"><option value="">ทุกหมวด</option><option value="__core"' + (cardCat === "__core" ? " selected" : "") + ">★ 30 ตัวย่อที่ต้องจำก่อน</option>" +
      cats().map(function (c) { return "<option" + (c === cardCat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>" +
      '<label class="row small"><input type="checkbox" id="cdUnknown"' + (cardOnlyUnknown ? " checked" : "") + "> เฉพาะคำที่ยังจำไม่ได้</label>" +
      '<span class="muted small">เหลือ <span class="num">' + deck.length + "</span> ใบ</span></div>" +
      (t ? '<button class="card-flip" id="cdCard" aria-live="polite"><span class="small muted">' + esc(t.cat) + '</span><span class="term">' + esc(t.term) + "</span>" +
           (cardFlip ? '<span class="full">' + esc(t.full) + '</span><span class="meaning">' + esc(t.meaning) + "</span>" : '<span class="muted small">แตะเพื่อเฉลย</span>') + "</button>" +
           '<div class="row" style="justify-content:center"><button class="btn" id="cdNo">ยังไม่แม่น ↻</button><button class="btn primary" id="cdYes">จำได้แล้ว ✓</button></div>'
         : '<section class="sheet"><p>หมดสำรับนี้แล้ว — เลือกหมวดอื่น หรือเอาติ๊ก “เฉพาะคำที่ยังจำไม่ได้” ออกเพื่อทบทวนทั้งหมด</p><button class="btn" id="cdReset">ล้างสถานะ “จำได้แล้ว” ของหมวดนี้</button></section>');
  };
  AFTER.cards = function (root) {
    $("#cdCat", root).onchange = function (e) { cardCat = e.target.value; buildDeck(); route(); };
    $("#cdUnknown", root).onchange = function (e) { cardOnlyUnknown = e.target.checked; buildDeck(); route(); };
    var card = $("#cdCard", root);
    if (card) {
      card.onclick = function () { cardFlip = !cardFlip; route(); };
      $("#cdYes", root).onclick = function () { S.cards.known[GL[deck[0]].term] = true; save(); deck.shift(); cardFlip = false; route(); };
      $("#cdNo", root).onclick = function () { S.cards.known[GL[deck[0]].term] = false; save(); deck.push(deck.shift()); cardFlip = false; route(); };
    }
    var rs = $("#cdReset", root);
    if (rs) rs.onclick = function () {
      GL.forEach(function (t) { if (!cardCat || t.cat === cardCat || (cardCat === "__core" && t.core)) delete S.cards.known[t.term]; });
      save(); buildDeck(); route();
    };
  };

  // ------------------------------------------------------------ ACTION PLAN
  var PLAN_COLS = [
    { k: "problem", label: "ปัญหา (ตัวชี้วัด + ค่าปัจจุบัน)", ph: "เช่น ACP-UC __ วัน (เกณฑ์ 60)" },
    { k: "root", label: "สาเหตุราก", ph: "จาก RCA: ส่งช้า / ติด C / Deny / รหัสไม่ครบ" },
    { k: "measure", label: "มาตรการ", ph: "Quick win (1 ไตรมาส) / โครงสร้าง (1 ปี)" },
    { k: "owner", label: "ผู้รับผิดชอบ", ph: "ตำแหน่ง/หน่วยงาน" },
    { k: "target", label: "เป้าหมาย (ตัวเลข)", ph: "เช่น ACP-UC ≤ 60 วัน" },
    { k: "due", label: "กำหนดเสร็จ", ph: "เช่น 31 มี.ค. 2570" },
    { k: "track", label: "แหล่งข้อมูลติดตาม", ph: "e-Claim / FDH / hfo / Planfin" }
  ];
  function planRows() { if (!S.plan.rows.length) S.plan.rows = [{}, {}, {}]; return S.plan.rows; }
  function planIssues() {
    var bad = [];
    var all = [["hospital", S.plan.hospital], ["period", S.plan.period]];
    S.plan.rows.forEach(function (r, i) { PLAN_COLS.forEach(function (c) { all.push([i + ":" + c.k, r[c.k] || ""]); }); });
    all.forEach(function (x) { var w = pdpaCheck(x[1] || ""); if (w) bad.push({ key: x[0], why: w }); });
    return bad;
  }
  RENDER.plan = function () {
    var rows = planRows();
    return '<div class="page-head"><span class="eyebrow">ตำราบทที่ 7 · Detect → Diagnose → Decide → Do → Document</span><h1>Action plan 1 หน้า</h1>' +
      "<p>ทุกแถวต้องมีเป้าหมายเป็นตัวเลขและวันที่ — จบด้วย “ใครทำอะไร ภายในเมื่อไร วัดผลด้วยตัวเลขไหน”</p></div>" +
      '<p class="notice pdpa small"><b>PDPA:</b> ห้ามใส่ชื่อผู้ป่วย HN AN หรือเลขบัตรประชาชน — แอปจะตรวจและไม่ให้คัดลอก/ส่งออกจนกว่าจะลบออก</p>' +
      '<section class="sheet stack"><div class="grid2"><div class="field"><label for="pHosp">หน่วยบริการ</label><input id="pHosp" value="' + esc(S.plan.hospital) + '" placeholder="เช่น รพ.____ (ชื่อโรงพยาบาลเท่านั้น)"></div>' +
      '<div class="field"><label for="pPeriod">ข้อมูล ณ / ช่วงเวลา</label><input id="pPeriod" value="' + esc(S.plan.period) + '" placeholder="เช่น ไตรมาส 1/2570"></div></div>' +
      '<div class="scroll-x"><table class="plan-table"><thead><tr><th>#</th>' + PLAN_COLS.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") + "<th></th></tr></thead><tbody>" +
      rows.map(function (r, i) {
        return '<tr><td class="num">' + (i + 1) + "</td>" + PLAN_COLS.map(function (c) {
          return '<td><textarea data-r="' + i + '" data-k="' + c.k + '" id="p_' + i + "_" + c.k + '" placeholder="' + esc(c.ph) + '" aria-label="' + esc(c.label) + " แถว " + (i + 1) + '">' + esc(r[c.k] || "") + "</textarea></td>";
        }).join("") + '<td><button class="btn ghost danger" data-del="' + i + '" aria-label="ลบแถว ' + (i + 1) + '">✕</button></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<div id="pWarn"></div>' +
      '<div class="row"><button class="btn" id="pAdd">+ เพิ่มแถว</button><button class="btn primary" id="pCopy">คัดลอกเป็นตาราง (วางใน Word/Excel)</button><button class="btn" id="pCsv">ดาวน์โหลด CSV</button><button class="btn ghost danger" id="pClear">ล้างฟอร์ม</button></div>' +
      '<textarea class="copybox" id="pBox" hidden></textarea>' +
      '<p class="small muted">แถวที่เป้าหมายหรือกำหนดเสร็จว่าง จะถูกทำเครื่องหมายเตือนตอนคัดลอก</p></section>';
  };
  AFTER.plan = function (root) {
    var clearArmed = false;
    function check() {
      var bad = planIssues();
      $$(".bad-input", root).forEach(function (x) { x.classList.remove("bad-input"); });
      bad.forEach(function (b) {
        var el = b.key === "hospital" ? $("#pHosp", root) : b.key === "period" ? $("#pPeriod", root) : $("#p_" + b.key.replace(":", "_"), root);
        if (el) el.classList.add("bad-input");
      });
      $("#pWarn", root).innerHTML = bad.length ? '<p class="notice pdpa small">พบข้อมูลที่อาจระบุตัวผู้ป่วย: ' + esc(bad.map(function (b) { return b.why; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ")) + " — ลบออกก่อนคัดลอก/ส่งออก</p>" : "";
      $("#pCopy", root).disabled = $("#pCsv", root).disabled = bad.length > 0;
      return bad.length === 0;
    }
    $$("textarea[data-r]", root).forEach(function (t) {
      t.addEventListener("input", function () { S.plan.rows[Number(t.getAttribute("data-r"))][t.getAttribute("data-k")] = t.value; save(); check(); });
    });
    $("#pHosp", root).oninput = function (e) { S.plan.hospital = e.target.value; save(); check(); };
    $("#pPeriod", root).oninput = function (e) { S.plan.period = e.target.value; save(); check(); };
    $("#pAdd", root).onclick = function () { S.plan.rows.push({}); save(); route(); };
    $$("[data-del]", root).forEach(function (b) { b.onclick = function () { S.plan.rows.splice(Number(b.getAttribute("data-del")), 1); save(); route(); }; });
    $("#pClear", root).onclick = function (e) {
      if (!clearArmed) { clearArmed = true; e.target.textContent = "กดอีกครั้งเพื่อยืนยันล้าง"; return; }
      S.plan = { hospital: "", period: "", rows: [] }; save(); route();
    };
    function filled() { return S.plan.rows.filter(function (r) { return PLAN_COLS.some(function (c) { return (r[c.k] || "").trim(); }); }); }
    function warnMissing(rows) {
      var miss = rows.filter(function (r) { return !(r.target || "").trim() || !(r.due || "").trim(); }).length;
      if (miss) toast(miss + " แถวยังไม่มีเป้าหมายตัวเลขหรือกำหนดเสร็จ");
    }
    $("#pCopy", root).onclick = function () {
      if (!check()) return;
      var rows = filled(); warnMissing(rows);
      var head = "Action plan " + (S.plan.hospital || "") + (S.plan.period ? " (" + S.plan.period + ")" : "");
      var tsv = head + "\n" + ["ลำดับ"].concat(PLAN_COLS.map(function (c) { return c.label; })).join("\t") + "\n" +
        rows.map(function (r, i) { return [i + 1].concat(PLAN_COLS.map(function (c) { return (r[c.k] || "").replace(/[\t\n]+/g, " "); })).join("\t"); }).join("\n");
      var htmlT = "<p><b>" + esc(head) + '</b></p><table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>ลำดับ</th>' + PLAN_COLS.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") + "</tr>" +
        rows.map(function (r, i) { return "<tr><td>" + (i + 1) + "</td>" + PLAN_COLS.map(function (c) { return "<td>" + esc(r[c.k] || "") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
      try {
        if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
          navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([htmlT], { type: "text/html" }), "text/plain": new Blob([tsv], { type: "text/plain" }) })])
            .then(function () { toast("คัดลอกตารางแล้ว — วางใน Word หรือ Excel ได้เลย"); }, function () { copyText(tsv, $("#pBox", root)); });
          return;
        }
      } catch (e) {}
      copyText(tsv, $("#pBox", root));
    };
    $("#pCsv", root).onclick = function () {
      if (!check()) return;
      var rows = filled(); warnMissing(rows);
      function q(s) { return '"' + String(s || "").replace(/"/g, '""') + '"'; }
      var csv = [q("หน่วยบริการ"), q(S.plan.hospital), q("ช่วงเวลา"), q(S.plan.period)].join(",") + "\n" +
        ["ลำดับ"].concat(PLAN_COLS.map(function (c) { return c.label; })).map(q).join(",") + "\n" +
        rows.map(function (r, i) { return [i + 1].concat(PLAN_COLS.map(function (c) { return r[c.k]; })).map(q).join(","); }).join("\n");
      download("action-plan.csv", csv, "text/csv;charset=utf-8");
    };
    check();
  };

  // ------------------------------------------------------------ CASE STUDY (ข้อมูลจริง 21 รพ. ชื่อเป็นรหัส)
  var CS = D.casestudy, HS = CS.hospitals;
  var caseTab = "practice", casePick = null, caseReveal = false, caseGuess = { li: "", st: "", su: "" }, caseSort = { k: "code", dir: 1 }, caseDetail = 0;
  function mb(x) { return isFinite(x) ? fmtBaht(x / 1e6, 2) : "—"; }
  function negCls(x) { return x < 0 ? " neg" : ""; }
  function rsPill(rs) { var t = rs >= 6 ? "crit" : rs >= 4 ? "watch" : rs >= 2 ? "" : "ok"; return '<span class="tag ' + t + ' num">' + rs + "</span>"; }
  function k1() { return '<span class="src" title="' + esc(CS.source.title) + '">[K1]</span>'; }
  function pickRandom() { var c; do { c = Math.floor(Math.random() * HS.length); } while (HS.length > 1 && c === casePick); casePick = c; caseReveal = false; caseGuess = { li: "", st: "", su: "" }; }
  function caseScore(h) {
    var m = h.moph;
    return scoreRatios({ CR: m.cr, QR: m.qr, CASH: m.cash, NWC: m.nwc, NI: m.ni }, CS.months);
  }
  function trendSvg(h) {
    var lab = CS.trend_labels, a = h.trend.nwc, b = h.trend.net, all = a.concat(b, [0]);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all); if (hi === lo) hi = lo + 1;
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var W = 640, H = 230, L = 64, R = 16, T = 14, B = 34;
    function x(i) { return L + i * (W - L - R) / (lab.length - 1); }
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    function path(s) { return s.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" "); }
    var ticks = [lo + pad, 0, hi - pad].filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    var g = ticks.map(function (v) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"' + (v === 0 ? "" : ' stroke-dasharray="3 4"') + '/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--f-num)">' + fmtBaht(v, 1) + "</text>"; }).join("");
    var xl = lab.map(function (t, i) { return '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + t + "</text>"; }).join("");
    function dots(s, col) { return s.map(function (v, i) { return '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="' + (i === s.length - 1 ? 4.5 : 3) + '" fill="' + col + '"/>'; }).join(""); }
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="แนวโน้ม NWC และเงินบำรุงหลังหักหนี้ ล้านบาท">' + g + xl +
      '<path d="' + path(a) + '" fill="none" stroke="var(--accent)" stroke-width="2.5"/>' + dots(a, "var(--accent)") +
      '<path d="' + path(b) + '" fill="none" stroke="var(--warn)" stroke-width="2.5" stroke-dasharray="6 4"/>' + dots(b, "var(--warn)") + "</svg>" +
      '<div class="row small"><span><b style="color:var(--accent)">━</b> NWC</span><span><b style="color:var(--warn)">╍</b> เงินบำรุงคงเหลือหลังหักหนี้</span><span class="muted">หน่วย ล้านบาท · ' + esc(CS.pages.trend) + " " + k1() + "</span></div>";
  }
  RENDER["case"] = function () {
    var tabs = [["practice", "ฝึกทาย Risk Score"], ["table", "ภาพรวม 21 แห่ง"], ["detail", "ดูราย รพ."]];
    var head = '<div class="page-head"><span class="eyebrow">ข้อมูลจริง · ' + esc(CS.source.asof.replace(/^ข้อมูล /, "")) + '</span><h1>กรณีศึกษา 21 รพ. จังหวัดอุดรธานี</h1>' +
      "<p>ตัวเลขจากสไลด์ กวป. ก.ค. 69 " + k1() + " · ชื่อโรงพยาบาลเปลี่ยนเป็นรหัส รพ.01–21 (สุ่ม ไม่เรียงตามขนาด) · " + esc(CS.source.note) + "</p></div>" +
      '<div class="row" role="tablist">' + tabs.map(function (t) { return '<button class="btn' + (caseTab === t[0] ? " primary" : "") + '" data-ctab="' + t[0] + '" role="tab" aria-selected="' + (caseTab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (caseTab === "practice") return head + casePractice();
    if (caseTab === "table") return head + caseTable();
    return head + caseDetailView();
  };
  function casePractice() {
    if (casePick === null) pickRandom();
    var h = HS[casePick], m = h.moph, done = S.caseDone || {};
    var nDone = Object.keys(done).length, nRight = Object.keys(done).filter(function (k) { return done[k]; }).length;
    function sel(id, max) { var o = '<option value="">?</option>'; for (var i = 0; i <= max; i++) o += "<option" + (String(caseGuess[id]) === String(i) ? " selected" : "") + ">" + i + "</option>"; return '<select id="g_' + id + '" class="inp" style="width:5em"' + (caseReveal ? " disabled" : "") + ">" + o + "</select>"; }
    var card = '<section class="sheet stack"><div class="row" style="justify-content:space-between"><h2 style="margin:0">' + esc(h.code) + ' <span class="tag">ระดับ ' + esc(h.prod.level) + "</span></h2>" +
      '<span class="small muted">ทำแล้ว <span class="num">' + nDone + "/21</span> · ถูก <span class=\"num\">" + nRight + "</span></span></div>" +
      '<div class="scroll-x"><table><tbody>' +
      "<tr><td>Current Ratio</td><td class=\"r num\">" + m.cr.toFixed(2) + "</td><td>Quick Ratio</td><td class=\"r num\">" + m.qr.toFixed(2) + "</td></tr>" +
      "<tr><td>Cash Ratio</td><td class=\"r num\">" + m.cash.toFixed(2) + "</td><td>NWC (ล้านบาท)</td><td class=\"r num" + negCls(m.nwc) + "\">" + mb(m.nwc) + "</td></tr>" +
      "<tr><td>NI สะสม 9 เดือน (ล้านบาท)</td><td class=\"r num" + negCls(m.ni) + "\">" + mb(m.ni) + "</td><td>NI เฉลี่ยต่อเดือน</td><td class=\"r num" + negCls(m.ni) + "\">" + mb(m.ni / CS.months) + "</td></tr>" +
      "</tbody></table></div>" +
      '<p class="small muted">โจทย์: คิดคะแนน Risk Score เกณฑ์กระทรวง (NI) ทีละมิติ แล้วกดตรวจ — เปิดตารางเกณฑ์ได้ที่ <a href="#sources">เกณฑ์และแหล่งอ้างอิง</a></p>' +
      '<div class="breakdown"><div><div class="small muted">สภาพคล่อง (0–3)</div>' + sel("li", 3) + '</div><div><div class="small muted">ความมั่นคง (0–2)</div>' + sel("st", 2) + '</div><div><div class="small muted">ระยะเวลาทุนหมด (0–2)</div>' + sel("su", 2) + "</div></div>" +
      '<div class="row">' + (caseReveal ? "" : '<button class="btn primary" id="gCheck">ตรวจคำตอบ</button>') + '<button class="btn" id="gNext">สุ่ม รพ. ถัดไป →</button></div><div id="gOut">' + (caseReveal ? caseAnswer(h) : "") + "</div></section>";
    return card;
  }
  function caseAnswer(h) {
    var res = caseScore(h), m = h.moph, g = caseGuess;
    var mine = [Number(g.li), Number(g.st), Number(g.su)], truth = [m.li, m.st, m.su];
    var why = [
      res.rows.filter(function (x) { return x.c.group === "liquid"; }).map(function (x) { return (x.c.id === "CASH" ? "Cash" : x.c.id) + " " + fmtR(x.val) + (x.fail ? " < " + x.c.threshold.toFixed(1) + " (+1)" : " ผ่าน"); }).join(" · "),
      "NWC " + (m.nwc < 0 ? "ติดลบ (+1)" : "บวก") + " · NI " + (m.ni < 0 ? "ติดลบ (+1)" : "บวก"),
      res.surv.rule.label + (isFinite(res.surv.months) ? " · " + fmtR(res.surv.months) + " เดือน" : "")
    ];
    var names = ["สภาพคล่อง", "ความมั่นคง", "ระยะเวลาทุนหมด"];
    var rows = names.map(function (n, i) {
      var ok = mine[i] === truth[i];
      return "<tr><td>" + n + '</td><td class="num">' + (isNaN(mine[i]) ? "?" : mine[i]) + '</td><td class="num"><b>' + truth[i] + "</b></td><td>" + (ok ? '<span class="pill pass">ถูก</span>' : '<span class="pill fail">ทบทวน</span>') + '</td><td class="small">' + esc(why[i]) + "</td></tr>";
    }).join("");
    var tot = mine[0] + mine[1] + mine[2];
    var lv = levelOf(m.rs);
    return '<div class="scroll-x"><table><thead><tr><th>มิติ</th><th>คุณตอบ</th><th>เฉลย</th><th></th><th>เหตุผล</th></tr></thead><tbody>' + rows +
      '<tr><td><b>รวม</b></td><td class="num">' + (isNaN(tot) ? "?" : tot) + '</td><td class="num"><b>' + m.rs + '</b></td><td></td><td class="small">' + esc(lv.meaning) + " " + srcTag(C.levels_src) + "</td></tr></tbody></table></div>" +
      '<p class="small">เฉลยตามต้นฉบับ ' + esc(CS.pages.moph) + " " + k1() + (res.total === m.rs ? " · สูตรในแอปได้ค่าเดียวกัน" : ' · <b class="neg">สูตรในแอปได้ ' + res.total + "</b>") + "</p>" +
      '<p class="notice info small">เกณฑ์เดียวกัน แต่งบที่ปรับแบบเขต 8: RS เขต 8 (NI) = <b>' + h.r8ni.rs + "</b> · RS เขต 8 (EBITDA) = <b>" + h.r8eb.rs + "</b> (CR " + h.r8ni.cr.toFixed(2) + ", NWC " + mb(h.r8ni.nwc) + " ลบ.) · เงินบำรุงหลังหักหนี้ <b class=\"num" + negCls(h.netCash) + '">' + mb(h.netCash) + "</b> ลบ. — " + esc(C.rs_variants.open_question) + "</p>";
  }
  var CASE_COLS = [
    { k: "code", t: "รหัส", v: function (h) { return h.code; }, f: function (h) { return '<a href="#case" data-cdet="' + HS.indexOf(h) + '"><b>' + esc(h.code) + "</b></a>"; } },
    { k: "lv", t: "ระดับ", v: function (h) { return h.prod.level; }, f: function (h) { return esc(h.prod.level); } },
    { k: "rs", t: "RS กระทรวง", v: function (h) { return h.moph.rs; }, f: function (h) { return rsPill(h.moph.rs); } },
    { k: "r8", t: "RS เขต 8 (NI)", v: function (h) { return h.r8ni.rs; }, f: function (h) { return rsPill(h.r8ni.rs); } },
    { k: "r8e", t: "RS เขต 8 (EBITDA)", v: function (h) { return h.r8eb.rs; }, f: function (h) { return rsPill(h.r8eb.rs); } },
    { k: "nwc", t: "NWC ลบ.", r: 1, v: function (h) { return h.moph.nwc; }, f: function (h) { return '<span class="num' + negCls(h.moph.nwc) + '">' + mb(h.moph.nwc) + "</span>"; } },
    { k: "ni", t: "NI ลบ.", r: 1, v: function (h) { return h.moph.ni; }, f: function (h) { return '<span class="num' + negCls(h.moph.ni) + '">' + mb(h.moph.ni) + "</span>"; } },
    { k: "eb", t: "EBITDA ลบ.", r: 1, v: function (h) { return h.ebitda; }, f: function (h) { return '<span class="num' + negCls(h.ebitda) + '">' + mb(h.ebitda) + "</span>"; } },
    { k: "net", t: "เงินบำรุงหลังหักหนี้ ลบ.", r: 1, v: function (h) { return h.netCash; }, f: function (h) { return '<span class="num' + negCls(h.netCash) + '">' + mb(h.netCash) + "</span>"; } },
    { k: "p7", t: "7 Plus", v: function (h) { return h.plus7.grade; }, f: function (h) { return '<span class="pill ' + (h.plus7.pass ? "pass" : "fail") + '">' + esc(h.plus7.grade) + "</span>"; } },
    { k: "acp", t: "ACP-UC วัน", r: 1, v: function (h) { return h.plus7.acpUC; }, f: function (h) { return '<span class="num' + (h.plus7.acpUC > 60 ? " neg" : "") + '">' + h.plus7.acpUC + "</span>"; } },
    { k: "app", t: "APP วัน", r: 1, v: function (h) { return h.plus7.app; }, f: function (h) { return '<span class="num">' + h.plus7.app + "</span>"; } },
    { k: "tps", t: "TPS", r: 1, v: function (h) { return h.tps.score; }, f: function (h) { return '<span class="num' + (h.tps.score < 10.5 ? " neg" : "") + '">' + h.tps.score + " " + h.tps.q2 + "</span>"; } },
    { k: "pf", t: "Planfin รายได้ %", r: 1, v: function (h) { return h.planfin.revPct; }, f: function (h) { return '<span class="num' + (Math.abs(h.planfin.revPct) > 5 ? " neg" : "") + '">' + h.planfin.revPct.toFixed(2) + "</span>"; } },
    { k: "occ", t: "ครองเตียง %", r: 1, v: function (h) { return h.prod.occ; }, f: function (h) { return '<span class="num' + (h.prod.occ < 80 ? " neg" : "") + '">' + h.prod.occ.toFixed(1) + "</span>"; } },
    { k: "cmi", t: "CMI", r: 1, v: function (h) { return h.prod.cmi; }, f: function (h) { return '<span class="num' + (h.prod.cmi < h.prod.cmiCrit ? " neg" : "") + '">' + h.prod.cmi.toFixed(3) + "</span>"; } },
    { k: "c", t: "ติด C สะสม", r: 1, v: function (h) { return h.claimC; }, f: function (h) { return '<span class="num">' + fmtBaht(h.claimC) + "</span>"; } }
  ];
  function caseTable() {
    var col = CASE_COLS.filter(function (c) { return c.k === caseSort.k; })[0];
    var list = HS.slice().sort(function (a, b) { var x = col.v(a), y = col.v(b); return (x > y ? 1 : x < y ? -1 : 0) * caseSort.dir; });
    var rs67 = HS.filter(function (h) { return h.moph.rs >= 6; }).length, r867 = HS.filter(function (h) { return h.r8ni.rs >= 6 || h.r8eb.rs >= 6; }).length;
    var negNet = HS.filter(function (h) { return h.netCash < 0; }).length;
    var hidden = HS.filter(function (h) { return h.moph.rs <= 2 && h.netCash < 0; }).map(function (h) { return h.code; });
    var ebPos = HS.filter(function (h) { return h.ebitda > 0; }).length;
    return '<div class="grid3">' +
      '<div class="sheet stat"><b>' + rs67 + " → " + r867 + '</b><div class="small muted">รพ. ระดับ 6–7 เกณฑ์กระทรวง → เกณฑ์เขต 8 (อย่างน้อย 1 เกณฑ์)</div></div>' +
      '<div class="sheet stat"><b>' + negNet + '/21</b><div class="small muted">เงินบำรุงหลังหักหนี้ติดลบ ทั้งที่ EBITDA เป็นบวก ' + ebPos + " แห่ง</div></div>" +
      '<div class="sheet stat"><b>' + hidden.length + '</b><div class="small muted">RS กระทรวง ≤ 2 แต่เงินบำรุงติดลบ (ตำราบทที่ 5.3: Risk ต่ำซ่อนปัญหา)</div></div></div>' +
      '<section class="sheet stack"><div class="row" style="justify-content:space-between"><h2 style="margin:0">ตารางรวม</h2><span class="small muted">แตะหัวคอลัมน์เพื่อเรียง · แตะรหัสเพื่อดูรายละเอียด · ตัวแดง = ไม่ผ่าน/ติดลบ</span></div>' +
      '<div class="scroll-x"><table class="small"><thead><tr>' + CASE_COLS.map(function (c) {
        return '<th class="' + (c.r ? "r" : "") + '"><button class="btn ghost" style="padding:2px 4px;border:0;font-size:inherit;color:inherit" data-csort="' + c.k + '">' + esc(c.t) + (caseSort.k === c.k ? (caseSort.dir > 0 ? " ▲" : " ▼") : "") + "</button></th>";
      }).join("") + "</tr></thead><tbody>" + list.map(function (h) { return "<tr>" + CASE_COLS.map(function (c) { return '<td class="' + (c.r ? "r" : "") + '">' + c.f(h) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="small muted">ที่มา ' + k1() + ": RS/NWC/NI/EBITDA/เงินบำรุง " + CS.pages.moph + "–" + CS.pages.r8 + " · 7 Plus/ACP/APP " + CS.pages.plus7 + " · TPS Q2Y69 " + CS.pages.tps + " · Planfin " + CS.pages.planfin + " · ครองเตียง/CMI " + CS.pages.prod + " · ติด C (1 ต.ค. 68 – 30 ก.ค. 69) " + CS.pages.claimC + "</p></section>" +
      '<section class="sheet stack"><h2>แบบฝึก (ตำราบทที่ 5.5)</h2><ul class="small"><li>จัดกลุ่ม 21 แห่ง: ปกติ (RS 0–1) / เฝ้าระวัง (2–5) / วิกฤต (6–7) ทั้ง 2 เกณฑ์ แล้วอธิบายว่าทำไมผลต่างกัน</li>' +
      "<li>เลือก 1 รพ. จากกลุ่ม “RS ต่ำแต่เงินบำรุงติดลบ” (" + esc(hidden.join(", ")) + ") แล้วเขียนว่าความเสี่ยงที่ซ่อนอยู่คืออะไร</li>" +
      "<li>เทียบ ACP-UC กับจำนวนติด C — รพ. ที่ทั้งสองค่าสูง ควรเริ่ม RCA ที่ขั้นไหนของ Revenue cycle</li></ul></section>";
  }
  function caseDetailView() {
    var h = HS[caseDetail], m = h.moph, p7 = h.plus7, pf = h.planfin, res = caseScore(h);
    var opts = HS.map(function (x, i) { return "<option value=\"" + i + "\"" + (i === caseDetail ? " selected" : "") + ">" + esc(x.code) + " · ระดับ " + esc(x.prod.level) + "</option>"; }).join("");
    function rowv(label, val, bad, note) { return "<tr><td>" + label + '</td><td class="r num' + (bad ? " neg" : "") + '">' + val + '</td><td class="small muted">' + (note || "") + "</td></tr>"; }
    var inf = {}; C.plus7_k1.items.forEach(function (x) { inf[x.id] = x.rule; });
    return '<div class="row"><label for="cdSel" class="small muted">โรงพยาบาล</label><select id="cdSel" class="inp" style="width:auto">' + opts + '</select><button class="btn" id="cdPlan">ร่าง Action plan จาก รพ. นี้ →</button></div>' +
      '<div class="grid2"><section class="sheet stack"><h2>Risk Score 3 เกณฑ์</h2><div class="breakdown">' +
      "<div><div class=\"small muted\">กระทรวง (NI)</div>" + rsPill(m.rs) + '<div class="small muted num">' + m.li + " + " + m.st + " + " + m.su + "</div></div>" +
      "<div><div class=\"small muted\">เขต 8 (NI)</div>" + rsPill(h.r8ni.rs) + "</div><div><div class=\"small muted\">เขต 8 (EBITDA)</div>" + rsPill(h.r8eb.rs) + "</div></div>" +
      '<div class="scroll-x"><table><tbody>' + rowv("CR / QR / Cash", ["cr", "qr", "cash"].map(function (k, i) { var th = [1.5, 1.0, 0.8][i]; return '<span class="' + (m[k] < th ? "neg" : "") + '">' + m[k].toFixed(2) + "</span>"; }).join(" / "), false, "เขต 8: " + h.r8ni.cr.toFixed(2) + " / " + h.r8ni.qr.toFixed(2) + " / " + h.r8ni.cash.toFixed(2)) +
      rowv("NWC (ลบ.)", mb(m.nwc), m.nwc < 0, "เขต 8: " + mb(h.r8ni.nwc)) + rowv("NI 9 เดือน (ลบ.)", mb(m.ni), m.ni < 0, "เขต 8: " + mb(h.r8ni.ni)) +
      rowv("EBITDA (ลบ.)", mb(h.ebitda), h.ebitda < 0, "") + rowv("เงินบำรุงหลังหักหนี้ (ลบ.)", mb(h.netCash), h.netCash < 0, "") + "</tbody></table></div>" +
      '<p class="small muted">' + esc(levelOf(m.rs).meaning) + " · สูตรในแอปได้ " + res.total + " " + k1() + "</p></section>" +
      '<section class="sheet stack"><h2>7 Plus Efficiency · ' + esc(p7.grade) + " " + (p7.pass ? '<span class="pill pass">ผ่าน</span>' : '<span class="pill fail">ไม่ผ่าน</span>') + '</h2><div class="scroll-x"><table><tbody>' +
      rowv("OPM % (ค่าเฉลี่ยกลุ่ม)", p7.opm.toFixed(2) + " (" + p7.opmAvg.toFixed(2) + ")", p7.opm < p7.opmAvg, inf.OPM) +
      rowv("ROA % (ค่าเฉลี่ยกลุ่ม)", p7.roa.toFixed(2) + " (" + p7.roaAvg.toFixed(2) + ")", p7.roa < p7.roaAvg, inf.ROA) +
      rowv("APP-Drug วัน", p7.app, p7.app > 145, inf["APP-Drug"]) + rowv("ACP-UC วัน", p7.acpUC, p7.acpUC > 60, inf["ACP-UC"]) +
      rowv("ACP-CSMBS วัน", p7.acpCS, p7.acpCS > 60, inf["ACP-CSMBS"]) + rowv("ACP-SSS วัน", p7.acpSS, p7.acpSS > 120, inf["ACP-SSS"]) + rowv("IM วัน", p7.im, p7.im > 60, inf.IM) +
      '</tbody></table></div><p class="small muted">' + esc(C.plus7_k1.note) + "</p></section></div>" +
      '<section class="sheet stack"><h2>แนวโน้ม NWC และเงินบำรุง Q4Y65 → Q3Y69</h2>' + trendSvg(h) + "</section>" +
      '<section class="sheet stack"><h2>Planfin · Productivity · เคลม</h2><div class="scroll-x"><table><tbody>' +
      rowv("รายได้จริง vs แผนตามสัดส่วน 9 เดือน", (pf.revPct > 0 ? "+" : "") + pf.revPct.toFixed(2) + "%", !pf.revPass, mb(pf.revAct) + " / " + mb(pf.revPro) + " ลบ.") +
      rowv("ค่าใช้จ่ายจริง vs แผน", (pf.expPct > 0 ? "+" : "") + pf.expPct.toFixed(2) + "%", !pf.expPass, mb(pf.expAct) + " / " + mb(pf.expPro) + " ลบ.") +
      rowv("Planfin ภาพรวม", pf.pass ? "ผ่าน" : "ไม่ผ่าน", !pf.pass, "±5% อย่างน้อย 1 ช่อง") +
      rowv("TPS Q2Y69", h.tps.score + " (" + h.tps.q1 + " → " + h.tps.q2 + ")", h.tps.score < 10.5, "ผ่าน ≥ 10.5 (เกรด B)") +
      rowv("อัตราครองเตียง %", h.prod.occ.toFixed(2), h.prod.occ < 80, "เกณฑ์ ≥ 80 · " + h.prod.beds + " เตียง") +
      rowv("CMI", h.prod.cmi.toFixed(3), h.prod.cmi < h.prod.cmiCrit, "เกณฑ์ระดับ " + h.prod.level + " ≥ " + h.prod.cmiCrit) +
      rowv("Sum AdjRW (ต.ค.–มิ.ย.)", fmtBaht(h.prod.sumAdjRW, 2), false, "") +
      rowv("ติด C สะสม (รายการ)", fmtBaht(h.claimC), false, "1 ต.ค. 68 – 30 ก.ค. 69") +
      '</tbody></table></div><p class="small muted">' + k1() + " · ตัวแดง = ไม่ผ่านเกณฑ์/ติดลบ</p></section>";
  }
  AFTER["case"] = function (root) {
    $$("[data-ctab]", root).forEach(function (b) { b.onclick = function () { caseTab = b.getAttribute("data-ctab"); route(); }; });
    $$("[data-csort]", root).forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-csort"); caseSort = { k: k, dir: caseSort.k === k ? -caseSort.dir : (k === "code" || k === "lv" ? 1 : -1) }; route(); }; });
    $$("[data-cdet]", root).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); caseDetail = Number(a.getAttribute("data-cdet")); caseTab = "detail"; route(); }; });
    ["li", "st", "su"].forEach(function (k) { var el = $("#g_" + k, root); if (el) el.onchange = function () { caseGuess[k] = el.value; }; });
    var chk = $("#gCheck", root);
    if (chk) chk.onclick = function () {
      if (caseGuess.li === "" || caseGuess.st === "" || caseGuess.su === "") { toast("เลือกคะแนนให้ครบ 3 มิติก่อน"); return; }
      var h = HS[casePick], ok = Number(caseGuess.li) === h.moph.li && Number(caseGuess.st) === h.moph.st && Number(caseGuess.su) === h.moph.su;
      S.caseDone = S.caseDone || {}; S.caseDone[h.code] = ok; save();
      caseReveal = true; route();
    };
    var nx = $("#gNext", root); if (nx) nx.onclick = function () { pickRandom(); route(); };
    var cs = $("#cdSel", root); if (cs) cs.onchange = function () { caseDetail = Number(cs.value); route(); };
    var cp = $("#cdPlan", root);
    if (cp) cp.onclick = function () {
      var h = HS[caseDetail], m = h.moph, p7 = h.plus7, rows = [];
      var worst = Math.max(m.rs, h.r8ni.rs, h.r8eb.rs);
      if (worst >= 4 || h.netCash < 0) rows.push({ problem: "Risk Score กระทรวง " + m.rs + " / เขต 8 " + h.r8ni.rs + " · เงินบำรุงหลังหักหนี้ " + mb(h.netCash) + " ลบ. (มิ.ย. 69)", track: "งบการเงินรายไตรมาส (hfo) · Risk Score เขต 8" });
      if (p7.acpUC > 60) rows.push({ problem: "ACP-UC " + p7.acpUC + " วัน (เกณฑ์ 60) · ติด C สะสม " + fmtBaht(h.claimC) + " รายการ", target: "ACP-UC ≤ 60 วัน", track: "e-Claim / FDH รายเดือน" });
      if (p7.app > 145) rows.push({ problem: "APP-Drug " + p7.app + " วัน", track: "รายงานเจ้าหนี้ค่ายา / หนี้ค้าง อภ." });
      if (!h.planfin.revPass) rows.push({ problem: "รายได้จริงต่างจาก Planfin " + h.planfin.revPct.toFixed(2) + "% (เกณฑ์ ±5%)", track: "Planfin รายไตรมาส" });
      if (h.prod.occ < 80) rows.push({ problem: "อัตราครองเตียง " + h.prod.occ.toFixed(1) + "% (เกณฑ์ 80%)", target: "≥ 80%", track: "HDC / รายงานผู้ป่วยใน" });
      if (!rows.length) rows.push({ problem: "ไม่พบตัวชี้วัดที่หลุดเกณฑ์หลัก — เลือกตัวชี้วัดเพื่อพัฒนาต่อ" });
      S.plan = { hospital: h.code + " (กรณีศึกษา K1)", period: "ข้อมูล ณ มิ.ย. 2569", rows: rows }; save();
      location.hash = "plan";
    };
  };

  // ------------------------------------------------------------ SOURCES
  RENDER.sources = function () {
    var src = Object.keys(C.sources).map(function (k) {
      var s = C.sources[k];
      return "<tr><td>" + srcTag(k) + "</td><td>" + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" : esc(s.title)) + '</td><td class="small muted">' + esc(s.kind) + "</td></tr>";
    }).join("");
    var eff = C.efficiency.map(function (e) {
      return "<tr><td><b>" + esc(e.id) + '</b><div class="small muted">' + esc(e.name) + '</div></td><td class="small">' + esc(e.formula) + "</td><td>" + esc(e.rule) + "</td><td>" + srcTag(e.src) + (e.src_also ? " " + srcTag(e.src_also) : "") + "</td></tr>";
    }).join("");
    var rat = C.ratios.map(function (c) { return "<tr><td><b>" + esc(c.id === "CASH" ? "Cash" : c.id) + '</b></td><td class="small">' + esc(c.formula) + '</td><td class="num">' + esc(c.op + " " + (c.unit === "บาท" ? c.threshold : c.threshold.toFixed(1))) + "</td><td>" + c.points + "</td><td>" + srcTag(c.src) + "</td></tr>"; }).join("");
    var lv = C.levels.map(function (l) { return '<tr><td class="num">' + esc(l.label) + "</td><td>" + esc(l.meaning) + "</td></tr>"; }).join("");
    return '<div class="page-head"><span class="eyebrow">' + esc(C.version) + " · " + esc(C.status) + '</span><h1>เกณฑ์และแหล่งอ้างอิง</h1><p>เกณฑ์ทุกตัวเก็บในไฟล์ <code>data/criteria.json</code> — แก้ไฟล์นั้นทุกปีงบแล้วรัน <code>python3 tools/build.py</code> ไม่ต้องแก้โค้ด</p></div>' +
      '<p class="notice">' + esc(C.verify_label) + " · " + esc(C.todo_next_fy) + "</p>" +
      '<section class="sheet stack"><h2>Ratio ใน Risk Score</h2><div class="scroll-x"><table><thead><tr><th>ตัวชี้วัด</th><th>สูตร</th><th>เกณฑ์เสี่ยง</th><th>คะแนน</th><th>ที่มา</th></tr></thead><tbody>' + rat + "</tbody></table></div>" +
      '<p class="small">มิติระยะเวลาทุนหมด 0–2 คะแนน ' + srcTag("M1") + " " + srcTag("S1") + " · " + esc(C.survival.summary) + "</p></section>" +
      '<div class="grid2"><section class="sheet stack"><h2>ความหมายระดับ Risk Score ' + srcTag(C.levels_src) + '</h2><div class="scroll-x"><table><tbody>' + lv + "</tbody></table></div><p class=\"small muted\">" + esc(C.national_target.text) + "</p></section>" +
      '<section class="sheet stack"><h2>ประเภทลูกหนี้ตามสิทธิ (แบบรายงาน จ.อุดรธานี) ' + srcTag(C.receivable_types.src) + "</h2><ol>" + C.receivable_types.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></section></div>" +
      '<section class="sheet stack"><h2>เกณฑ์ประสิทธิภาพที่พบในเอกสาร (ยังต้องยืนยันฉบับทางการ)</h2><div class="scroll-x"><table><thead><tr><th>ตัวชี้วัด</th><th>สูตร</th><th>เกณฑ์</th><th>ที่มา</th></tr></thead><tbody>' + eff + "</tbody></table></div>" +
      '<p class="small">' + esc(C.risk_scoring_plus.text) + " " + srcTag(C.risk_scoring_plus.src) + "</p></section>" +
      '<section class="sheet stack"><h2>เกณฑ์ที่ จ.อุดรธานีใช้ (กวป. ก.ค. 69) ' + srcTag("K1") + '</h2><p class="small">' + esc(C.rs_variants.text) + '</p><p class="small muted">' + esc(C.rs_variants.open_question) + " · " + esc(C.rs_variants.app_uses) + "</p>" +
      '<div class="scroll-x"><table><thead><tr><th>ตัวชี้วัด</th><th>เกณฑ์</th><th>หน้า</th></tr></thead><tbody>' + C.province_k1.map(function (x) { return "<tr><td><b>" + esc(x.name) + "</b></td><td>" + esc(x.rule) + '</td><td class="small muted">' + esc(x.page) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<h3 style="font-size:1rem">7 Plus รายตัวชี้วัด (อนุมาน)</h3><p class="small muted">' + esc(C.plus7_k1.note) + " · " + esc(C.plus7_k1.target) + '</p><div class="scroll-x"><table><thead><tr><th>ตัวชี้วัด</th><th>เกณฑ์ที่อนุมาน</th><th class="r">ผ่าน</th></tr></thead><tbody>' +
      C.plus7_k1.items.map(function (x) { return "<tr><td>" + esc(x.id) + "</td><td>" + esc(x.rule) + '</td><td class="r num">' + esc(x.passed) + "</td></tr>"; }).join("") + "</tbody></table></div></section>" +
      '<section class="sheet stack"><h2>แหล่งอ้างอิง</h2><div class="scroll-x"><table><tbody>' + src + "</tbody></table></div>" +
      '<p class="small muted">ทุกแหล่งเป็นเอกสารนำเสนอ/รายงานของหน่วยงาน สธ. ที่เผยแพร่ ไม่ใช่ประกาศฉบับทางการ · เนื้อหาตำรา: ' + esc(D.meta.textbook) + " · คู่มือ: " + esc(D.meta.manual) + " · ศัพท์: " + esc(D.glossary.sources.G1) + "</p></section>";
  };

  // ------------------------------------------------------------ BACKUP
  RENDER.backup = function () {
    return '<div class="page-head"><span class="eyebrow">เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</span><h1>สำรองความคืบหน้า</h1>' +
      "<p>ความคืบหน้า (บทที่อ่าน แบบฝึกที่ติ๊ก คะแนน ศัพท์ที่จำได้ Action plan ตัวเลขที่กรอก) เก็บใน localStorage ของเบราว์เซอร์ — ย้ายเครื่องหรือล้างประวัติเบราว์เซอร์แล้วจะหาย ให้สำรองเป็นไฟล์ไว้</p></div>" +
      '<div class="grid2"><section class="sheet stack"><h2>ส่งออก</h2><div class="row"><button class="btn primary" id="bDl">ดาวน์โหลดไฟล์สำรอง (.json)</button><button class="btn" id="bCopy">คัดลอกเป็นข้อความ</button></div>' +
      '<textarea class="copybox" id="bBox" hidden></textarea></section>' +
      '<section class="sheet stack"><h2>นำเข้า</h2><div class="field"><label for="bFile">เลือกไฟล์สำรอง</label><input type="file" id="bFile" accept=".json,application/json"></div>' +
      '<div class="field"><label for="bPaste">หรือวางข้อความสำรอง</label><textarea class="copybox" id="bPaste"></textarea></div><button class="btn" id="bImport">นำเข้าจากข้อความ</button><div id="bMsg"></div></section></div>' +
      '<section class="sheet stack"><h2>เริ่มใหม่</h2><p class="small muted">ลบความคืบหน้าทั้งหมดในเครื่องนี้</p><div><button class="btn danger" id="bReset">ล้างข้อมูลทั้งหมด</button></div></section>';
  };
  AFTER.backup = function (root) {
    function dump() { return JSON.stringify({ app: "mophfin", v: 1, at: new Date().toISOString(), data: S }, null, 1); }
    $("#bDl", root).onclick = function () { download("mophfin-backup-" + new Date().toISOString().slice(0, 10) + ".json", dump(), "application/json"); };
    $("#bCopy", root).onclick = function () { copyText(dump(), $("#bBox", root)); };
    function imp(text) {
      try {
        var o = JSON.parse(text);
        if (o.app !== "mophfin" || !o.data) throw new Error("ไม่ใช่ไฟล์สำรองของแอปนี้");
        var b = blank(); for (var k in o.data) b[k] = o.data[k];
        S = b; save(); deck = null; route(); toast("นำเข้าแล้ว");
      } catch (e) { $("#bMsg", root).innerHTML = '<p class="notice pdpa small">นำเข้าไม่สำเร็จ: ' + esc(e.message) + "</p>"; }
    }
    $("#bFile", root).onchange = function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { imp(String(r.result).replace(/^﻿/, "")); }; r.readAsText(f); };
    $("#bImport", root).onclick = function () { imp($("#bPaste", root).value); };
    var armed = false;
    $("#bReset", root).onclick = function (e) {
      if (!armed) { armed = true; e.target.textContent = "กดอีกครั้งเพื่อยืนยัน — ลบถาวร"; return; }
      S = blank(); save(); deck = null; route(); toast("ล้างข้อมูลแล้ว");
    };
  };

  window.addEventListener("hashchange", route);
  route();
})();
