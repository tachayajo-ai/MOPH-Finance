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
  function download(name, text, mime) {
    try {
      var blob = new Blob(["﻿" + text], { type: mime || "text/plain;charset=utf-8" });
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
  function md(src, taskPrefix) {
    var lines = src.split("\n"), html = [], i = 0, task = 0, para = [];
    function flush() { if (para.length) { html.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } }
    function cells(l) { return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); }); }
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        flush(); var lang = l.slice(3).trim(), buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        var body = buf.join("\n");
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
      { when: "สัปดาห์ 1 (ก่อนเริ่มงาน)", ch: [1, 2], out: "เขียนสมการบัญชีและบันทึกรายการ 10 รายการด้วยมือ", from: -21, to: -14 },
      { when: "สัปดาห์ 2 (ก่อนเริ่มงาน)", ch: [3], out: "Mapping ผังบัญชีรายได้/ลูกหนี้ตามสิทธิ UC/SSS/CSMBS", from: -14, to: -7 },
      { when: "สัปดาห์ 3 (ก่อนเริ่มงาน)", ch: [4], out: "คำนวณ Ratio จากงบ รพ. ตัวอย่าง 1 แห่ง", from: -7, to: 0 },
      { when: "วันที่ 1–30", ch: [5], out: "ขอข้อมูล Risk Score และ Planfin ของ รพ. 21 แห่ง", from: 0, to: 30 },
      { when: "วันที่ 31–60", ch: [6], out: "จับคู่ AR days กับผลเคลม e-Claim/FDH ของ รพ. 3 แห่งที่ Risk สูงสุด", from: 30, to: 60 },
      { when: "วันที่ 61–90", ch: [7], out: "Action plan 1 หน้า ให้ รพ. 1 แห่ง แล้วขอ Feedback", from: 60, to: 90 }
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
    r.reserveMonths = r.NWC / r.expMonth;
    return { n: n, r: r, rows: rows, pts: pts, surv: surv, total: total, complete: allKnown };
  }
  function levelOf(score) { return C.levels.filter(function (l) { return score >= l.min && score <= l.max; })[0]; }
  function mgmtOf(score) { return C.management.filter(function (l) { return score >= l.min && score <= l.max; })[0]; }

  RENDER.ratio = function () {
    var v = S.calc || CALC_SAMPLE;
    var isSample = !S.calc;
    var inputs = CALC_FIELDS.map(function (f) {
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

  // ------------------------------------------------------------ SOURCES
  RENDER.sources = function () {
    var src = Object.keys(C.sources).map(function (k) {
      var s = C.sources[k];
      return "<tr><td>" + srcTag(k) + "</td><td>" + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" : esc(s.title)) + '</td><td class="small muted">' + esc(s.kind) + "</td></tr>";
    }).join("");
    var eff = C.efficiency.map(function (e) {
      return "<tr><td><b>" + esc(e.id) + '</b><div class="small muted">' + esc(e.name) + '</div></td><td class="small">' + esc(e.formula) + "</td><td>" + esc(e.rule) + "</td><td>" + srcTag(e.src) + "</td></tr>";
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
