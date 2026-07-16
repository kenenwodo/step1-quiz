#!/usr/bin/env python3
"""
Import questions a user emailed you into your data/ folder.

Handles BOTH files the site can produce:
  1. A single-topic file from the "Download JSON" button (a plain array).
  2. A full backup from "Download all my data" (has _type: step1-quiz-backup,
     with a "generated" object of topic -> questions).

Usage:
  python3 import_user_data.py <file-they-sent> [--merge]

  <file-they-sent>   the .json they emailed you
  --merge            add to the existing topic file instead of replacing it
                     (default is replace)

After running, ALWAYS run:  python3 validate.py
Then commit and push.

Nothing is deleted destructively: the original data/ file is copied to
data/backups/ before any change, so you can always roll back (and git history
is a second safety net).
"""
import json, sys, os, shutil, datetime

# Map topic display names -> data/ filenames. Keep in sync with index.html.
TOPIC_TO_FILE = {
    "Fetal Lung Development": "fetal-lung-development",
    "A-a Gradient & Gas Exchange": "aa-gradient-gas-exchange",
    "Aging Physiology": "aging-physiology",
    "Pneumonia, Effusion & Pneumothorax Exam": "pneumonia-effusion-pneumothorax",
    "Pleural Fluid Analysis": "pleural-fluid-analysis",
    "Restrictive & Granulomatous Lung Disease": "restrictive-granulomatous",
    "Emphysema & Asbestos-Related Disease": "emphysema-asbestos",
    "COPD": "copd",
    "Alveolar & Airway Disorders": "alveolar-airway-disorders",
    "Pulmonary Embolism & Vascular": "pulmonary-embolism-vascular",
    "Sepsis & Oxygen Delivery": "sepsis-oxygen-delivery",
    "Respiratory Mechanics": "respiratory-mechanics",
    "Neoplasia": "neoplasia",
    "Tuberculosis": "tuberculosis",
}

def backup_existing(path):
    if os.path.exists(path):
        os.makedirs("data/backups", exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        base = os.path.basename(path).replace(".json", "")
        dest = f"data/backups/{base}-{stamp}.json"
        shutil.copy2(path, dest)
        print(f"   backed up existing -> {dest}")

def write_topic(fname, questions, merge):
    path = f"data/{fname}.json"
    backup_existing(path)
    if merge and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            existing = json.load(f)
        combined = existing + questions
        with open(path, "w", encoding="utf-8") as f:
            json.dump(combined, f, indent=2, ensure_ascii=False)
        print(f"✓ merged {len(questions)} into {path} (now {len(combined)} total)")
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(questions, f, indent=2, ensure_ascii=False)
        print(f"✓ wrote {len(questions)} questions to {path}")

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    merge = "--merge" in sys.argv
    if not args:
        print(__doc__); sys.exit(1)
    src = args[0]
    if not os.path.exists(src):
        print(f"File not found: {src}"); sys.exit(1)

    with open(src, encoding="utf-8") as f:
        data = json.load(f)

    # Case 2: full backup bundle
    if isinstance(data, dict) and data.get("_type") == "step1-quiz-backup":
        gen = data.get("generated", {})
        if not gen:
            print("This backup has no generated questions to import."); sys.exit(0)
        print(f"Backup file with {len(gen)} generated topic(s):")
        for topic, questions in gen.items():
            fname = TOPIC_TO_FILE.get(topic)
            if not fname:
                print(f"   ! unknown topic '{topic}' — skipping (add it to TOPIC_TO_FILE)")
                continue
            write_topic(fname, questions, merge)

    # Case 1: single-topic array
    elif isinstance(data, list):
        # infer topic from filename, else ask
        base = os.path.basename(src).replace(".json", "")
        fname = base if base in TOPIC_TO_FILE.values() else None
        if not fname:
            print("Couldn't tell which topic this is from the filename.")
            print("Rename the file to match a topic (e.g. copd.json), one of:")
            for v in sorted(TOPIC_TO_FILE.values()):
                print(f"   {v}.json")
            sys.exit(1)
        write_topic(fname, data, merge)
    else:
        print("Unrecognized file format."); sys.exit(1)

    print("\nNow run:  python3 validate.py   then commit and push.")

if __name__ == "__main__":
    main()
