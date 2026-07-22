# Presentation Converter

A small local Flask app for converting between PDF, PPTX, and PNG. Drop files in the
browser, pick a target format and resolution, download the result.

## Conversions

| From | To | How |
|------|----|-----|
| PDF | PNG | PyMuPDF page rendering |
| PDF | PPTX | Pages rendered to PNG first, then placed on 16:9 slides |
| PPTX | PDF | Microsoft PowerPoint via AppleScript |
| PPTX | PNG | PowerPoint → PDF → PyMuPDF render |
| PNG/JPG | PDF | Combined into one document |
| PNG/JPG | PPTX | One image per slide |

Multiple images can be combined into a single PDF or deck. Other conversions take one
file at a time.

Resolution modes: `height_1080`, `width_1920`, `fit_16_9` (letterboxed onto a 1920×1080
canvas), and `original` (2× render for PDF sources).

## Requirements

- Python 3.11+
- Flask, PyMuPDF, python-pptx, Pillow — pinned in `requirements.txt`

Four of the six conversions are pure Python and run on macOS, Windows, and Linux with
nothing installed beyond those packages.

The two that *start* from a PPTX are the exception. Rendering a slide needs a real
layout and font engine, and no Python library provides one — so `PPTX → PDF` and
`PPTX → PNG` drive Microsoft PowerPoint over AppleScript and require **macOS with
PowerPoint installed**. They will not work on Windows, or on a Mac without PowerPoint.
Routing that one function through LibreOffice headless instead
(`soffice --headless --convert-to pdf`) would make every conversion cross-platform and
remove the PowerPoint dependency.

## Setup

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Then open http://127.0.0.1:5000

## Layout

- `app.py` — Flask routes, background conversion threads, in-memory task tracking
- `converters.py` — the conversion functions
- `templates/`, `static/` — frontend
- `data/` — uploads and conversion output (gitignored, cleaned up after 1 hour)

## Scope

A single-user tool meant to run on `127.0.0.1`. There's no authentication and it isn't
hardened for network exposure — keep it on localhost.
