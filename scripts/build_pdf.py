#!/usr/bin/env python3
"""Render the repository's limited Markdown guide into a selectable-text PDF."""
from html import escape
from pathlib import Path
import re

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/sonne-openclaw-cpu-8gb.pdf"
NAVY = colors.HexColor("#142C42")
TEAL = colors.HexColor("#087E82")
INK = colors.HexColor("#263849")
MUTED = colors.HexColor("#5D6D7B")
LINE = colors.HexColor("#DCE5EB")
PALE = colors.HexColor("#F1F6F8")
WIDTH = A4[0] - 88


def inline(text):
    text = escape(text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
                  r'<link href="\2" color="#087E82">\1</link>', text)
    text = re.sub(r"`([^`]+)`", r'<font name="Courier" size="8.5">\1</font>', text)
    return re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)


STYLES = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=29,
                            leading=33, textColor=NAVY, spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=18,
                         leading=22, textColor=NAVY, spaceBefore=0, spaceAfter=12),
    "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.5,
                         leading=14, textColor=TEAL, spaceBefore=10, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.3,
                           leading=13.2, textColor=INK, spaceAfter=7),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.3,
                             leading=13.2, textColor=INK, leftIndent=12,
                             firstLineIndent=-9, spaceAfter=5),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8,
                            leading=11, textColor=MUTED, spaceAfter=9),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.6,
                           leading=11.5, textColor=INK),
    "callout": ParagraphStyle("callout", fontName="Helvetica", fontSize=8.9,
                              leading=12.5, textColor=NAVY),
}


class CodeBlock(Flowable):
    def __init__(self, lines):
        super().__init__()
        self.lines = lines
        self.font_size = 7.5
        self.leading = 10.2
        self.height = len(lines) * self.leading + 18
        self.width = WIDTH

    def wrap(self, available_width, available_height):
        self.width = available_width
        for line in self.lines:
            if stringWidth(line, "Courier", self.font_size) > self.width - 20:
                raise ValueError(f"Code line is too wide; split it in guide.md: {line}")
        return self.width, self.height

    def draw(self):
        canvas = self.canv
        canvas.setFillColor(PALE)
        canvas.roundRect(0, 0, self.width, self.height, 5, fill=1, stroke=0)
        canvas.setFillColor(NAVY)
        text = canvas.beginText(10, self.height - 13)
        text.setFont("Courier", self.font_size)
        text.setLeading(self.leading)
        for line in self.lines:
            text.textLine(line)
        canvas.drawText(text)


class Architecture(Flowable):
    def __init__(self):
        super().__init__()
        self.width = WIDTH
        self.height = 100

    def draw(self):
        canvas = self.canv
        boxes = [(0, "Discord", "Allowed channel + users"),
                 (177, "OpenClaw", "Agent + file tools / 2 GiB"),
                 (354, "Ollama", "Qwen3.5 2B / CPU / 4 GiB")]
        for x, title, subtitle in boxes:
            canvas.setFillColor(NAVY if title == "OpenClaw" else PALE)
            canvas.roundRect(x, 40, 153, 51, 6, fill=1, stroke=0)
            canvas.setFillColor(colors.white if title == "OpenClaw" else NAVY)
            canvas.setFont("Helvetica-Bold", 12)
            canvas.drawString(x + 10, 70, title)
            canvas.setFont("Helvetica", 7.4)
            canvas.drawString(x + 10, 53, subtitle)
        canvas.setStrokeColor(TEAL)
        canvas.setLineWidth(1.2)
        for x in (153, 330):
            canvas.line(x + 3, 65, x + 21, 65)
            canvas.line(x + 17, 68, x + 21, 65)
            canvas.line(x + 17, 62, x + 21, 65)
        canvas.setFillColor(TEAL)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(177, 23, "Shared workspace/files/")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.7)
        canvas.drawString(177, 10, "Prompt files read-only; model endpoint private to Docker")


def markdown_table(lines):
    rows = [[cell.strip() for cell in line.strip().strip("|").split("|")] for line in lines]
    rows = [row for row in rows if not all(re.fullmatch(r":?-+:?", cell) for cell in row)]
    header_style = ParagraphStyle("header-cell", parent=STYLES["cell"],
                                  textColor=colors.white, fontName="Helvetica-Bold")
    cells = [[Paragraph(inline(cell), header_style if index == 0 else STYLES["cell"])
              for cell in row] for index, row in enumerate(rows)]
    widths = [WIDTH * 0.49, WIDTH * 0.51]
    table = Table(cells, colWidths=widths, hAlign=TA_LEFT)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.4, NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def parse_markdown(source):
    lines = source.splitlines()
    story, index = [], 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line == "<!-- page -->":
            story.append(PageBreak())
            index += 1
        elif line == "<!-- architecture -->":
            story.append(Architecture())
            index += 1
        elif line.startswith("```"):
            index += 1
            code = []
            while index < len(lines) and not lines[index].startswith("```"):
                code.append(lines[index])
                index += 1
            if index >= len(lines):
                raise ValueError("Unclosed Markdown code fence")
            story.extend([CodeBlock(code), Spacer(1, 9)])
            index += 1
        elif line.startswith("|"):
            table = []
            while index < len(lines) and lines[index].startswith("|"):
                table.append(lines[index])
                index += 1
            story.extend([markdown_table(table), Spacer(1, 8)])
        elif line.startswith("#"):
            prefix, title = line.split(" ", 1)
            style = {"#": "title", "##": "h2", "###": "h3"}[prefix]
            story.append(Paragraph(inline(title), STYLES[style]))
            index += 1
        elif line.startswith("> "):
            box = Table([[Paragraph(inline(line[2:]), STYLES["callout"])]], colWidths=[WIDTH])
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E6F3F2")),
                ("BOX", (0, 0), (-1, -1), 0.5, TEAL),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 11),
                ("RIGHTPADDING", (0, 0), (-1, -1), 11),
            ]))
            story.extend([box, Spacer(1, 8)])
            index += 1
        elif line.startswith("- ") or re.match(r"\d+\. ", line):
            text = "- " + line[2:] if line.startswith("- ") else line
            story.append(Paragraph(inline(text), STYLES["bullet"]))
            index += 1
        else:
            paragraph = [line]
            index += 1
            while index < len(lines) and lines[index].strip():
                paragraph.append(lines[index])
                index += 1
            style = "small" if paragraph[0].startswith("Sonne / Technical") else "body"
            story.append(Paragraph(inline(" ".join(paragraph)), STYLES[style]))
    return story


def decorate(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(44, A4[1] - 36, A4[0] - 44, A4[1] - 36)
    canvas.setFillColor(TEAL)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(44, A4[1] - 27, "SONNE")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.2)
    canvas.drawRightString(A4[0] - 44, A4[1] - 27, "OPENCLAW / LOCAL CPU / DISCORD")
    canvas.line(44, 34, A4[0] - 44, 34)
    canvas.drawString(44, 22, "Krabbens/sonne  |  7 October 2026  |  Revision 3")
    canvas.drawRightString(A4[0] - 44, 22, f"{doc.page}")
    canvas.restoreState()


def make_fixture():
    from PIL import Image, ImageDraw, ImageFont
    path = ROOT / "examples/vision-check.png"
    if path.exists():
        return
    path.parent.mkdir(exist_ok=True)
    image = Image.new("RGB", (800, 440), "white")
    draw = ImageDraw.Draw(image)
    # ReportLab ships Vera, so the fixture has a portable font source.
    import reportlab
    font_path = Path(reportlab.__file__).parent / "fonts/VeraBd.ttf"
    big = ImageFont.truetype(str(font_path), 62)
    small = ImageFont.truetype(str(font_path), 22)
    draw.text((45, 35), "SONNE 42", fill="#142c42", font=big)
    draw.rectangle((55, 165, 235, 345), fill="#dc3636")
    draw.ellipse((360, 165, 540, 345), fill="#2782cc")
    draw.text((45, 385), "Synthetic vision check - no private data", fill="#5d6d7b", font=small)
    image.save(path)


def main():
    rl_config.invariant = True
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    source = (ROOT / "docs/guide.md").read_text()
    # ASCII prose and code avoid missing-glyph surprises in built-in PDF fonts.
    if not source.isascii():
        raise ValueError("guide.md must use ASCII punctuation for portable PDF fonts")
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=44, rightMargin=44,
        topMargin=53, bottomMargin=47,
        title="Sonne: OpenClaw on an 8 GB CPU host",
        author="Krabbens", subject="Docker, local multimodal model, Discord and system prompt",
    )
    doc.build(parse_markdown(source), onFirstPage=decorate, onLaterPages=decorate)
    if doc.page != 10:
        raise ValueError(f"Expected 10 pages; got {doc.page}. Adjust guide layout before delivery.")
    make_fixture()
    print(OUTPUT)


if __name__ == "__main__":
    main()
