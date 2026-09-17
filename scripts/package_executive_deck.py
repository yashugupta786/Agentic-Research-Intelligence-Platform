"""Package the reviewed slide renders as a PDF and synchronize app assets."""
from pathlib import Path
import json
import shutil
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / "presentation"
manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
pdf = folder / "Demand-Sensing-Executive.pdf"
doc = canvas.Canvas(str(pdf), pagesize=(1200, 675), pageCompression=1)
doc.setTitle(manifest["title"])
doc.setAuthor(manifest["author"])
doc.setSubject("Research planning case study: architecture, nine agents, RAG, coverage and evaluation")
for slide in manifest["slides"]:
    doc.bookmarkPage(str(slide["number"]))
    doc.addOutlineEntry(slide["title"], str(slide["number"]), level=0)
    doc.drawImage(ImageReader(str(folder / slide["image"])), 0, 0, width=1200, height=675)
    doc.showPage()
doc.save()
assert len(PdfReader(str(pdf)).pages) == len(manifest["slides"])
served = ROOT / "frontend" / "public" / "presentation"
served.mkdir(parents=True, exist_ok=True)
for name in ["Demand-Sensing-Executive.pptx", "Demand-Sensing-Executive.pdf", "manifest.json"]:
    shutil.copy2(folder / name, served / name)
shutil.copytree(folder / "slides", served / "slides", dirs_exist_ok=True)
notes = ["# Demand Sensing Intelligence: speaker notes", "", f"Slides 1–{manifest['mainSlides']} form the main presentation. Slides {manifest['mainSlides']+1}–{len(manifest['slides'])} provide technical detail.", "", "Executive route: " + ", ".join(map(str, manifest.get('executiveSlides', []))), ""]
for s in manifest["slides"]:
    notes.extend([f"## {s['number']:02d}. {s['title']}", "", s["notes"], ""])
(folder / "Speaker-Notes.md").write_text("\n".join(notes), encoding="utf-8")
print(f"Packaged {len(manifest['slides'])} slides. PDF: {pdf.stat().st_size:,} bytes")
