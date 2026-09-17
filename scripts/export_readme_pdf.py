"""Render README.md to README.pdf for email. Optional: reportlab + Pillow."""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
OUT = ROOT / "README.pdf"
FONTS = Path("C:/Windows/Fonts")

NAVY = colors.HexColor("#0B2238")
INK = colors.HexColor("#102C43")
MUTED = colors.HexColor("#536C80")
TEAL = colors.HexColor("#007D82")
LINE = colors.HexColor("#CCD9E2")
PAPER = colors.HexColor("#F5F8FB")
WHITE = colors.HexColor("#FFFFFF")

if (FONTS / "segoeui.ttf").exists():
    pdfmetrics.registerFont(TTFont("Body", str(FONTS / "segoeui.ttf")))
    pdfmetrics.registerFont(TTFont("BodyBold", str(FONTS / "segoeuib.ttf")))
    BODY, BOLD, MONO = "Body", "BodyBold", "Courier"
else:
    BODY, BOLD, MONO = "Helvetica", "Helvetica-Bold", "Courier"


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover": ParagraphStyle("cover", parent=base["Normal"], fontName=BOLD, fontSize=26, leading=32, textColor=NAVY, spaceAfter=10),
        "h1": ParagraphStyle("h1", parent=base["Normal"], fontName=BOLD, fontSize=18, leading=24, textColor=NAVY, spaceBefore=18, spaceAfter=10),
        "h2": ParagraphStyle("h2", parent=base["Normal"], fontName=BOLD, fontSize=14, leading=19, textColor=NAVY, spaceBefore=16, spaceAfter=8),
        "h3": ParagraphStyle("h3", parent=base["Normal"], fontName=BOLD, fontSize=12, leading=16, textColor=TEAL, spaceBefore=12, spaceAfter=6),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName=BODY, fontSize=10, leading=14, textColor=INK, spaceAfter=8, alignment=TA_LEFT),
        "muted": ParagraphStyle("muted", parent=base["Normal"], fontName=BODY, fontSize=9, leading=12, textColor=MUTED, spaceAfter=8),
        "caption": ParagraphStyle("caption", parent=base["Normal"], fontName=BODY, fontSize=8.5, leading=11, textColor=MUTED, spaceBefore=4, spaceAfter=14),
        "code": ParagraphStyle("code", parent=base["Normal"], fontName=MONO, fontSize=8, leading=11, textColor=INK, backColor=PAPER, leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=10),
        "th": ParagraphStyle("th", parent=base["Normal"], fontName=BOLD, fontSize=8.5, leading=11, textColor=WHITE),
        "td": ParagraphStyle("td", parent=base["Normal"], fontName=BODY, fontSize=8.5, leading=11, textColor=INK),
        "footer": ParagraphStyle("footer", parent=base["Normal"], fontName=BODY, fontSize=8, textColor=MUTED),
        "li": ParagraphStyle("li", parent=base["Normal"], fontName=BODY, fontSize=10, leading=14, textColor=INK),
    }
    return s


INLINE = [
    (re.compile(r"`([^`]+)`"), r'<font face="Courier" size="8">\1</font>'),
    (re.compile(r"\*\*([^*]+)\*\*"), r"<b>\1</b>"),
    (re.compile(r"\[([^\]]+)\]\(([^)]+)\)"), r'\1'),
]


def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for pattern, repl in INLINE:
        text = pattern.sub(repl, text)
    return text


def split_row(line: str) -> list[str]:
    line = line.strip().strip("|")
    return [c.strip() for c in line.split("|")]


def is_table_sep(line: str) -> bool:
    return bool(re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", line))


def parse_blocks(md: str) -> list[tuple]:
    lines = md.replace("\r\n", "\n").split("\n")
    blocks: list[tuple] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            lang = line[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append(("code", "\n".join(buf), lang))
            continue
        if line.startswith("!["):
            m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
            if m:
                blocks.append(("image", m.group(2), m.group(1)))
                i += 1
                continue
        if line.startswith("# "):
            blocks.append(("h1", line[2:].strip(), None))
            i += 1
            continue
        if line.startswith("## "):
            blocks.append(("h2", line[3:].strip(), None))
            i += 1
            continue
        if line.startswith("### "):
            blocks.append(("h3", line[4:].strip(), None))
            i += 1
            continue
        if line.strip() == "---":
            blocks.append(("hr", "", None))
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and is_table_sep(lines[i + 1]):
            headers = split_row(line)
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            blocks.append(("table", headers, rows))
            continue
        if re.match(r"^[-*] ", line):
            items = []
            while i < len(lines) and re.match(r"^[-*] ", lines[i]):
                items.append(lines[i][2:].strip())
                i += 1
            blocks.append(("ul", items, None))
            continue
        if re.match(r"^\d+\. ", line):
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                items.append(re.sub(r"^\d+\. ", "", lines[i]).strip())
                i += 1
            blocks.append(("ol", items, None))
            continue
        if not line.strip():
            i += 1
            continue
        para = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "```", "|", "!", "-", "*")) and not re.match(r"^\d+\. ", lines[i]) and lines[i].strip() != "---":
            if lines[i].startswith("  ") or lines[i].startswith("\t"):
                break
            para.append(lines[i].strip())
            i += 1
        blocks.append(("p", " ".join(para), None))
    return blocks


def make_table(headers, rows, s, width):
    n = len(headers)
    col = width / max(n, 1)
    data = [[Paragraph(inline(h), s["th"]) for h in headers]]
    for row in rows:
        padded = (row + [""] * n)[:n]
        data.append([Paragraph(inline(c), s["td"]) for c in padded])
    t = Table(data, colWidths=[col] * n, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
            ]
        )
    )
    return t


def make_image(rel: str, caption: str, s, max_w: float):
    path = (ROOT / rel).resolve()
    if not path.exists():
        return [Paragraph(f"[Missing image: {rel}]", s["muted"])]
    with PILImage.open(path) as im:
        w, h = im.size
    max_h = 3.6 * inch
    scale = min(max_w / w, max_h / h, 1)
    img = Image(str(path), width=w * scale, height=h * scale)
    img.hAlign = "CENTER"
    bits = [img]
    if caption:
        bits.append(Paragraph(inline(caption), s["caption"]))
    return [KeepTogether(bits)]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(0.7 * inch, 0.55 * inch, letter[0] - 0.7 * inch, 0.55 * inch)
    canvas.setFont(BODY, 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.7 * inch, 0.35 * inch, "Demand Sensing Intelligence  ·  setup guide")
    canvas.drawRightString(letter[0] - 0.7 * inch, 0.35 * inch, str(doc.page))
    canvas.restoreState()


def build():
    s = styles()
    md = README.read_text(encoding="utf-8")
    width = letter[0] - 1.4 * inch
    story = []
    title_done = False
    for kind, a, b in parse_blocks(md):
        if kind == "h1":
            if not title_done:
                story.append(Paragraph(inline(a), s["cover"]))
                title_done = True
            else:
                story.append(Paragraph(inline(a), s["h1"]))
        elif kind == "h2":
            story.append(Paragraph(inline(a), s["h2"]))
        elif kind == "h3":
            story.append(Paragraph(inline(a), s["h3"]))
        elif kind == "p":
            story.append(Paragraph(inline(a), s["body"]))
        elif kind == "hr":
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceAfter=10))
        elif kind == "code":
            story.append(Preformatted(a.replace("\t", "    "), s["code"]))
        elif kind == "ul":
            story.append(
                ListFlowable(
                    [ListItem(Paragraph(inline(item), s["li"]), leftIndent=8) for item in a],
                    bulletType="bullet",
                    leftIndent=18,
                    spaceAfter=8,
                )
            )
        elif kind == "ol":
            story.append(
                ListFlowable(
                    [ListItem(Paragraph(inline(item), s["li"]), leftIndent=8) for item in a],
                    bulletType="1",
                    leftIndent=18,
                    spaceAfter=8,
                )
            )
        elif kind == "table":
            story.append(make_table(a, b, s, width))
            story.append(Spacer(1, 10))
        elif kind == "image":
            story.extend(make_image(a, b, s, width))
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.75 * inch,
        title="Demand Sensing Intelligence — setup guide",
        author="Yashu Gupta",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
