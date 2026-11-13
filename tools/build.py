#!/usr/bin/env python3
"""รวมเนื้อหา + เกณฑ์ + โค้ด เป็นไฟล์ HTML ไฟล์เดียว (ใช้ออฟไลน์ได้ ไม่ต้องมีเซิร์ฟเวอร์)

  python3 tools/build.py

ใช้แค่ Python มาตรฐาน — ต้องรันใหม่ทุกครั้งที่แก้ data/criteria.json, data/quiz.json หรือ content/*

ผลลัพธ์:
  dist/index.html      เปิดด้วยดับเบิลคลิก (PC / มือถือ) — ไฟล์หลักสำหรับใช้งาน
  dist/artifact.html   ฉบับไม่มี <html>/<head> สำหรับเผยแพร่เป็น Artifact บน claude.ai
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(p):
    return (ROOT / p).read_text(encoding="utf-8")


def textbook_glossary(md):
    """ดึงตาราง 'อภิธานศัพท์' ท้ายตำรางบการเงิน มาเป็นหมวด 0 ของ Flashcards"""
    m = re.search(r"### อภิธานศัพท์\n\n(.*?)\n\n", md, re.S)
    terms = []
    if not m:
        return terms
    for line in m.group(1).splitlines()[2:]:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[0]:
            full, _, meaning = cells[1].partition(": ")
            if not meaning:
                full, meaning = cells[1], ""
            terms.append({"term": cells[0], "full": full, "meaning": meaning,
                          "cat": "0. ศัพท์งบการเงิน (ตำรา)", "src": "T"})
    return terms


def check_pdpa(text, name):
    bad = re.findall(r"(?<!\d)\d{13}(?!\d)|\b(?:HN|AN)\s*[:#]?\s*\d{4,}", text)
    # ตัวเลข 13 หลักที่มาจาก URL ของเอกสาร (timestamp) ไม่ใช่ข้อมูลบุคคล
    bad = [b for b in bad if not re.search(r"upload_file/" + re.escape(b), text)]
    if bad:
        sys.exit(f"PDPA: พบรูปแบบที่อาจเป็นข้อมูลผู้ป่วยใน {name}: {bad[:5]}")


def main():
    textbook = read("content/textbook.md")
    textbook = re.sub(r"^.*· @\S+\s*$", "จัดทำ 12 พ.ย. 2569 · เอกสารเรียนด้วยตนเอง", textbook, count=1, flags=re.M)
    manual = read("content/manual.html")
    criteria = json.loads(read("data/criteria.json"))
    quiz = json.loads(read("data/quiz.json"))
    glossary = json.loads(read("data/glossary.json"))
    glossary["terms"] = textbook_glossary(textbook) + glossary["terms"]

    for name, text in (("textbook.md", textbook), ("manual.html", manual)):
        check_pdpa(text, name)

    # ตรวจว่าเกณฑ์ทุกตัวมีแหล่งอ้างอิง
    srcs = criteria["sources"]
    for item in criteria["ratios"] + criteria["efficiency"]:
        if item.get("src") not in srcs:
            sys.exit(f"criteria.json: {item.get('id')} ไม่มีแหล่งอ้างอิงที่ถูกต้อง")

    data = {
        "textbook": textbook,
        "manual": manual,
        "criteria": criteria,
        "quiz": quiz,
        "glossary": glossary,
        "meta": {
            "textbook": "ตำรางบการเงินโรงพยาบาล สำหรับงานประกันสุขภาพ (เรียนด้วยตนเอง) 12 พ.ย. 2569",
            "manual": "ระบบประกันสุขภาพ โรงพยาบาลรัฐ — คู่มือปฏิบัติงานระดับจังหวัด ฉบับปรับปรุง ต.ค. 2569",
        },
    }
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    body = (read("src/template.html")
            .replace("/*__STYLE__*/", read("src/style.css"))
            .replace("/*__DATA__*/", blob)
            .replace("/*__APP__*/", read("src/app.js")))

    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    (out / "artifact.html").write_text(body, encoding="utf-8")
    full = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + body.replace("\n<div class=\"shell\">", "\n</head>\n<body>\n<div class=\"shell\">", 1)
            + "\n</body>\n</html>\n")
    (out / "index.html").write_text(full, encoding="utf-8")
    print(f"dist/index.html {len(full.encode()) / 1024:.0f} KB · {len(glossary['terms'])} ศัพท์ · "
          f"{len(quiz['questions'])} คำถามแนวคิด")


if __name__ == "__main__":
    main()
