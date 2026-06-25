#!/usr/bin/env python3
"""
Targeted subcategory reclassification for two fixes:

1. Art, Literature & Comics — split classic-literature (was 50% of category):
   a. Fix misclassifications that landed in classic-literature:
      - language-* slugs  → language-grammar
      - superhero/comics   → comics-graphic-novels
      - "was adapted into a [year] film starring" → adaptations-theater
   b. Split out literary-quotes-and-lines (explicit quoted text / famous sayings)
   c. Remaining questions stay as classic-literature (~23% of category)

2. Music — split artists-bands (was 49% of category):
   a. Fix misclassifications that landed in artists-bands:
      - album/song questions → albums-songs-lyrics
      - instrument questions → genres-instruments-terminology
   b. Split band-lineups ("Name the [genre] band that consists of X, Y, Z")
   c. Remaining questions stay as artist-identity (~31% of category)

Usage: python3 scripts/reclassify-subcategories.py
"""

import json
import re
import shutil
from pathlib import Path

DATA_DIR = Path("data/live-trivia/categories")


# ── Art, Literature & Comics ─────────────────────────────────────────────────

def reclassify_art_literature(questions: list) -> int:
    changed = 0
    for q in questions:
        if q.get("subcategory") != "classic-literature":
            continue

        t = q["question"]
        slug = q.get("slug", "")
        new_sub = _classify_classic_literature_question(t, slug)
        if new_sub != "classic-literature":
            q["subcategory"] = new_sub
            changed += 1

    return changed


def _classify_classic_literature_question(t: str, slug: str) -> str:
    # ── Fix 1: language-grammar slugs that were misrouted ──────────────────
    # The original classifier matched these as "classic-literature" because
    # they mention literary terms; slug prefix is the reliable signal.
    if slug.startswith("language-"):
        return "language-grammar"

    # ── Fix 2: superhero/comics questions that ended up here ───────────────
    _COMICS_SIGNALS = (
        r"radioactive spider bite",
        r"Bruce Banner transform",
        r"Lasso of Truth",
        r"half-human.*half-Atlantean|half-Atlantean",
        r"Norse God of Mischief",
        r"Arkham Asylum psychiatrist",
        r"Gotham crime boss|wears a monocle",
        r"speed-ster villain|torment the Flash",
        r"fiery planet Apokolips",
        r"Fear Gas|fear-obsessed Gotham",
        r"Green Lantern.*power|power.*Green Lantern",
        r"Peter Parker.*primary occupation",
        r"what piece of jewelry gives the Green Lantern",
    )
    for pattern in _COMICS_SIGNALS:
        if re.search(pattern, t, re.I):
            return "comics-graphic-novels"

    # ── Fix 3: book-to-film adaptations that ended up here ─────────────────
    # These all describe a source novel and then ask about the film.
    if re.search(
        r"was adapted into (a |the )?\d{4} film starring"
        r"|would eventually be adapted into what \d{4} film"
        r"|was adapted into a \d{4} film directed",
        t, re.I
    ):
        return "adaptations-theater"

    # ── Split 4: literary-quotes-and-lines ─────────────────────────────────
    # Explicit quoted text embedded in the question, or famous-saying framing.
    if slug.startswith("quote-"):
        return "literary-quotes-and-lines"
    if re.search(
        r"famously (said|wrote|warned|quipped|advised|coined|declared|noted"
        r"|proclaimed|asserted|observed|remarked|stated)",
        t, re.I
    ):
        return "literary-quotes-and-lines"
    if re.search(
        r"utters? (the )?(dying words|famous line|phrase|quote)"
        r"|associated with the (phrase|quote|saying|line)"
        r"|wrote the famous line"
        r"|famous line[,\s]+'",
        t, re.I
    ):
        return "literary-quotes-and-lines"
    if re.search(
        r"opening line (read|reads)[:\s]"
        r"|novel begins with the line"
        r"|book opens? with the line"
        r"|first line (read|reads)",
        t, re.I
    ):
        return "literary-quotes-and-lines"
    # Inline quoted text of ≥12 chars — a quoted phrase is being identified
    if re.search(r"['‘’][^']{12,}['’]|\"[^\"]{12,}\"", t):
        return "literary-quotes-and-lines"

    return "classic-literature"


# ── Music ─────────────────────────────────────────────────────────────────────

def reclassify_music(questions: list) -> int:
    changed = 0
    for q in questions:
        if q.get("subcategory") != "artists-bands":
            continue

        t = q["question"]
        new_sub = _classify_artists_bands_question(t)
        if new_sub != "artists-bands":
            q["subcategory"] = new_sub
            changed += 1

    return changed


def _classify_artists_bands_question(t: str) -> str:
    # ── Fix 1: album/song questions that ended up in artists-bands ──────────
    _ALBUM_SIGNALS = (
        r"which (Pink Floyd|Led Zeppelin|Rolling Stones|Radiohead|Simon.{0,5}Garfunkel) album",
        r"on which (.*) album does",
        r"what was the final studio album released by",
        r"features? a working zipper on its original vinyl cover",
        r"on the cover of the .Abbey Road. album",
    )
    for pattern in _ALBUM_SIGNALS:
        if re.search(pattern, t, re.I):
            return "albums-songs-lyrics"

    # ── Fix 2: instrument questions ─────────────────────────────────────────
    if re.search(r"which type of reed|oboe use[sd]?", t, re.I):
        return "genres-instruments-terminology"

    # ── Split 3: band-lineups ───────────────────────────────────────────────
    # "Name the [genre] band/group/duo/trio that consists of X, Y, and Z"
    if re.search(
        r"^name the (rock|rap|hip.?hop|pop|jazz|r&b|punk|metal|indie|country|"
        r"alternative|folk|electronic|british|american|grunge|classic rock)?\s*"
        r"(band|group|duo|trio|quartet)",
        t, re.I
    ):
        return "band-lineups"
    # Explicit "consists of" with member names (band-membership questions)
    if re.search(r"consists of\s+\w+.*\band\b", t, re.I):
        return "band-lineups"

    # ── Everything else stays as artist-identity ────────────────────────────
    return "artist-identity"


# ── Main ──────────────────────────────────────────────────────────────────────

def process_file(fname: str, reclassify_fn) -> None:
    fpath = DATA_DIR / fname
    if not fpath.exists():
        print(f"SKIP: {fname} not found")
        return

    bak_path = fpath.with_suffix(fpath.suffix + ".bak")
    shutil.copy2(fpath, bak_path)

    with open(fpath) as f:
        data = json.load(f)

    questions = data.get("questions", [])
    changed = reclassify_fn(questions)

    with open(fpath, "w") as f:
        json.dump(data, f, indent=2)

    from collections import Counter
    counts = Counter(q.get("subcategory") for q in questions)
    total = len(questions)
    print(f"\n✅ {data.get('categoryName', fname)} — {changed} questions reclassified")
    for sub, count in counts.most_common():
        print(f"   {sub}: {count} ({100*count/total:.0f}%)")


def main():
    process_file("art-literature.json", reclassify_art_literature)
    process_file("music.v1.json", reclassify_music)


if __name__ == "__main__":
    main()
