#!/usr/bin/env python3
"""
Merge review-new-questions.json into the proper Live Trivia category files.
Reads each section from the review file, adds 'category' and 'subcategory' fields,
deduplicates slugs, checks for existing slugs, and appends to the target files.
"""

import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REVIEW_FILE = os.path.join(BASE_DIR, "data/live-trivia/categories/review-new-questions.json")

# Map target filenames to category names
CATEGORY_MAP = {
    "television.json": "Television",
    "music.v1.json": "Music",
    "sports.v1.json": "Sports",
}


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main():
    # Load the review file
    review = load_json(REVIEW_FILE)
    sections = review["sections"]

    total_added = 0
    total_skipped = 0
    total_duplicate_fixed = 0

    for section_idx, section in enumerate(sections):
        target_file = section["targetCategory"]
        target_subcategory = section["targetSubcategory"]
        category_name = CATEGORY_MAP.get(target_file)

        if not category_name:
            print(f"ERROR: Unknown target file '{target_file}'")
            continue

        target_path = os.path.join(
            BASE_DIR, "data/live-trivia/categories", target_file
        )

        # Load target file
        target = load_json(target_path)
        existing_questions = target["questions"]
        existing_q_count = len(existing_questions)

        # Build set of existing slugs for duplicate checking
        existing_slugs = set()
        for q in existing_questions:
            slug = q.get("slug", "")
            if slug:
                existing_slugs.add(slug)

        # Track slugs used in this batch to detect duplicates within the review
        batch_slugs = set()

        new_questions = []
        section_skipped = 0
        section_duplicate_fixed = 0

        for q in section["questions"]:
            # Add category and subcategory
            new_q = dict(q)
            new_q["category"] = category_name
            new_q["subcategory"] = target_subcategory

            # Handle duplicate slugs
            slug = new_q.get("slug", "")
            if slug:
                if slug in existing_slugs:
                    print(
                        f"  [{target_file}:{target_subcategory}] SKIPPING '{slug}' - already exists"
                    )
                    section_skipped += 1
                    continue

                if slug in batch_slugs:
                    # Duplicate slug within this batch - append a suffix
                    suffix = 2
                    while f"{slug}-{suffix}" in existing_slugs or f"{slug}-{suffix}" in batch_slugs:
                        suffix += 1
                    new_slug = f"{slug}-{suffix}"
                    print(
                        f"  [{target_file}:{target_subcategory}] FIXING duplicate slug: '{slug}' -> '{new_slug}'"
                    )
                    new_q["slug"] = new_slug
                    batch_slugs.add(new_slug)
                    section_duplicate_fixed += 1
                else:
                    batch_slugs.add(slug)

            new_questions.append(new_q)

        # Append new questions to existing questions
        target["questions"].extend(new_questions)

        # Save the updated file
        save_json(target_path, target)

        print(
            f"\n{target_file} [{target_subcategory}]:"
            f"\n  Existing questions: {existing_q_count}"
            f"\n  Added: {len(new_questions)} new questions"
            f"\n  Skipped: {section_skipped} (already existing)"
            f"\n  Duplicate slugs fixed: {section_duplicate_fixed}"
            f"\n  New total: {existing_q_count + len(new_questions)}"
        )
        total_added += len(new_questions)
        total_skipped += section_skipped
        total_duplicate_fixed += section_duplicate_fixed

    print(f"\n{'='*50}")
    print(f"MERGE COMPLETE!")
    print(f"  Total added: {total_added}")
    print(f"  Total skipped (already existing): {total_skipped}")
    print(f"  Duplicate slugs fixed within review: {total_duplicate_fixed}")


if __name__ == "__main__":
    main()
