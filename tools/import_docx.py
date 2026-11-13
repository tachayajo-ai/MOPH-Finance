#!/usr/bin/env python3
"""แปลงไฟล์ต้นฉบับ .docx ใน sources/ เป็นเนื้อหาที่แอปใช้ (รันครั้งเดียวเมื่อมีฉบับใหม่)

ต้องมี: pandoc และ python-docx (pip install python-docx)

  python3 tools/import_docx.py

ผลลัพธ์:
  content/manual.html      คู่มือระบบประกันสุขภาพ รพ.รัฐ (8 บท + ภาคผนวก)
  data/glossary.json       อภิธานศัพท์ 10 หมวด + ภาคผนวกศัพท์ (ฉบับ 28 ต.ค. 2569)
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources"

MANUAL = SRC / "manual-health-insurance-oct69.docx"
GLOSSARY = SRC / "glossary-oct69.docx"
ADDENDUM = SRC / "glossary-addendum-2569-10-28.docx"


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("​", "")).strip()


# ---------------------------------------------------------------- manual
def build_manual():
    raw = subprocess.run(
        ["pandoc", str(MANUAL), "-t", "html", "--wrap=none"],
        check=True, capture_output=True, text=True,
    ).stdout
    raw = re.sub(r"<colgroup>.*?</colgroup>", "", raw, flags=re.S)
    raw = re.sub(r' style="[^"]*"', "", raw)
    raw = re.sub(r' class="(odd|even|header)"', "", raw)

    def head(m):
        text = m.group(1)
        plain = clean(re.sub(r"<[^>]+>", "", text))
        if len(plain) > 110:
            return m.group(0)
        if re.match(r"^บทที่ \d+ ·", plain):
            n = re.match(r"^บทที่ (\d+)", plain).group(1)
            return f'<h2 id="m-ch{n}">{html.escape(plain)}</h2>'
        if plain == "ภาคผนวก":
            return '<h2 id="m-appx">ภาคผนวก</h2>'
        if plain in ("วิธีใช้คู่มือเล่มนี้", "สารบัญ"):
            return f"<h2>{html.escape(plain)}</h2>"
        if re.match(r"^\d+\.\d+ \S", plain) or re.match(r"^ผนวก [ก-ฮ] ·", plain):
            return f"<h3>{html.escape(plain)}</h3>"
        if re.match(r"^(ชั้นที่ \d|มิติที่ \d)", plain) or plain in (
            "สูตรที่ต้องคำนวณเองได้", "สัญญาณเตือนภัยที่ใช้จริง", "การวินิจฉัยแยกโรคที่ใช้บ่อยมาก",
        ):
            return f"<h4>{html.escape(plain)}</h4>"
        return m.group(0)

    raw = re.sub(r"<p>(.*?)</p>", head, raw)
    # กล่องเน้น (ตาราง 1 คอลัมน์) → callout
    raw = re.sub(
        r"<table>\s*<tbody>\s*<tr>\s*<td>(.*?)</td>\s*</tr>\s*</tbody>\s*</table>",
        r'<div class="callout">\1</div>', raw, flags=re.S,
    )
    out = ROOT / "content" / "manual.html"
    out.write_text(raw, encoding="utf-8")
    print("manual.html", len(raw), "bytes,", raw.count("<h2"), "h2,", raw.count("<h3"), "h3")


# ---------------------------------------------------------------- glossary
def iter_blocks(document):
    body = document.element.body
    for child in body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, document)
        elif child.tag.endswith("}tbl"):
            yield Table(child, document)


def build_glossary():
    terms, core30 = [], set()
    d = docx.Document(str(GLOSSARY))
    section = ""
    for b in iter_blocks(d):
        if isinstance(b, Paragraph):
            t = clean(b.text)
            m = re.match(r"^(\d+) · (.+)$", t)
            if m:
                section = f"{m.group(1)}. {m.group(2)}"
            continue
        rows = b.rows
        if len(b.columns) != 3 or len(rows) < 2:
            continue
        hdr = [clean(c.text) for c in rows[0].cells]
        if hdr[0] == "หมวด":
            continue  # สารบัญ
        for r in rows[1:]:
            cells = [clean(c.text) for c in r.cells]
            if not cells[0]:
                continue
            if section.startswith("1."):
                core30.add(cells[0].split(" / ")[0])
                terms.append({"term": cells[0], "full": cells[1], "meaning": cells[2],
                              "cat": section, "core": True, "src": "G1"})
            else:
                terms.append({"term": cells[0], "full": cells[1], "meaning": cells[2],
                              "cat": section, "src": "G1"})

    a = docx.Document(str(ADDENDUM))
    for t in a.tables:
        for r in t.rows[1:]:
            cells = [clean(c.text) for c in r.cells]
            if cells[0]:
                terms.append({"term": cells[0], "full": cells[1], "meaning": cells[2],
                              "cat": "11. ภาคผนวก (ฉบับ 28 ต.ค. 2569)", "src": "G2"})

    data = {
        "_note": "สร้างอัตโนมัติจาก sources/*.docx ด้วย tools/import_docx.py — แก้ที่ต้นฉบับแล้วรันใหม่",
        "sources": {
            "G1": "ตำราคำศัพท์และตัวย่อ งานประกันสุขภาพ ฉบับปรับปรุง ต.ค. 2569 (เอกสารเรียบเรียงเพื่อการเรียน)",
            "G2": "ภาคผนวกตำราคำศัพท์ ฉบับปรับปรุง 28 ต.ค. 2569 (คำที่มี ⟦ตรวจสอบ⟧ ต้องยืนยันก่อนใช้)",
        },
        "terms": terms,
    }
    out = ROOT / "data" / "glossary.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    cats = {}
    for t in terms:
        cats[t["cat"]] = cats.get(t["cat"], 0) + 1
    print("glossary.json", len(terms), "terms", cats)


if __name__ == "__main__":
    for f in (MANUAL, GLOSSARY, ADDENDUM):
        if not f.exists():
            sys.exit(f"ไม่พบไฟล์ {f}")
    build_manual()
    build_glossary()
