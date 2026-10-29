import os
import subprocess
from pathlib import Path

class PDFExporter:
    """
    Handles the conversion of Markdown files to PDF.
    Currently implements a 'shell-out' strategy to Pandoc.
    """
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir

    def convert(self, md_file: Path) -> Path:
        pdf_file = md_file.with_suffix('.pdf')

        # Pandoc command: markdown -> pdf
        # We use 'pdf-engine' as a placeholder; in production this might be xelatex or weasyprint
        cmd = [
            "pandoc",
            str(md_file),
            "-o", str(pdf_file),
            "--pdf-engine=weasyprint", # Recommended for HTML/CSS based PDF layout
            "-V", "geometry:margin=1in"
        ]

        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            return pdf_file
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Pandoc conversion failed: {e.stderr}")
        except FileNotFoundError:
            raise RuntimeError("Pandoc not found on system. Please install pandoc and weasyprint.")

def export_all_to_pdf(build_dir: Path):
    exporter = PDFExporter(build_dir)
    md_files = list(build_dir.glob("*.md"))

    print(f"Exporting {len(md_files)} documents to PDF...")
    for md_file in md_files:
        try:
            pdf_path = exporter.convert(md_file)
            print(f"  ✅ PDF Created: {pdf_path.name}")
        except Exception as e:
            print(f"  ❌ PDF Failed: {md_file.name} - {e}")
