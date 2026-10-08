#!/usr/bin/env python3
"""Export the standalone LaTeX guide using an existing TeX compiler."""
from pathlib import Path
import argparse
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/guide.tex"
BUILD = ROOT / "tmp/pdfs/latex"
OUTPUT = ROOT / "output/pdf/sonne-openclaw-cpu-8gb.pdf"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--auto', action='store_true', help='Build the automated-install edition')
    args = parser.parse_args()
    source = ROOT / 'docs/guide-auto.tex' if args.auto else SOURCE
    build = ROOT / 'tmp/pdfs/latex-auto' if args.auto else BUILD
    output = ROOT / 'output/pdf/sonne-auto-setup.pdf' if args.auto else OUTPUT
    build.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    if compiler := shutil.which("pdflatex"):
        command = [compiler, "-interaction=nonstopmode", "-halt-on-error",
                   "-no-shell-escape", f"-output-directory={build}", str(source)]
        for _ in range(2):
            subprocess.run(command, cwd=ROOT, check=True)
    elif compiler := shutil.which("tectonic"):
        subprocess.run([compiler, "--outdir", str(build), str(source)],
                       cwd=ROOT, check=True)
    else:
        raise SystemExit("Open docs/guide.tex in the Codex LaTeX editor, or use "
                         "an existing pdflatex/Tectonic installation to export.")
    shutil.copyfile(build / (source.stem + '.pdf'), output)
    print(output)


if __name__ == "__main__":
    main()
