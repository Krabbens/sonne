#!/usr/bin/env python3
"""Export the standalone LaTeX guide using an existing TeX compiler."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/guide.tex"
BUILD = ROOT / "tmp/pdfs/latex"
OUTPUT = ROOT / "output/pdf/sonne-openclaw-cpu-8gb.pdf"


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if compiler := shutil.which("pdflatex"):
        command = [compiler, "-interaction=nonstopmode", "-halt-on-error",
                   "-no-shell-escape", f"-output-directory={BUILD}", str(SOURCE)]
        for _ in range(2):
            subprocess.run(command, cwd=ROOT, check=True)
    elif compiler := shutil.which("tectonic"):
        subprocess.run([compiler, "--outdir", str(BUILD), str(SOURCE)],
                       cwd=ROOT, check=True)
    else:
        raise SystemExit("Open docs/guide.tex in the Codex LaTeX editor, or use "
                         "an existing pdflatex/Tectonic installation to export.")
    shutil.copyfile(BUILD / "guide.pdf", OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
