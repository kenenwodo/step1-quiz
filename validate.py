#!/usr/bin/env python3
"""
Validate all topic JSON files in data/ before pushing.
Run:  python3 validate.py
Exits non-zero if anything is wrong, so nothing broken reaches the site.
"""
import json, sys, glob, os

REQUIRED = {"question": str, "choices": list, "answer": int, "explanation": str}
OPTIONAL = {"subtopic": str}

def validate_file(path):
    errors = []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"INVALID JSON — {e}"]
    if not isinstance(data, list):
        return ["Top level must be a list [ ... ] of question objects."]
    if len(data) == 0:
        errors.append("File has no questions (empty list).")
    for i, q in enumerate(data):
        loc = f"Q{i+1}"
        if not isinstance(q, dict):
            errors.append(f"{loc}: not an object."); continue
        for field, typ in REQUIRED.items():
            if field not in q:
                errors.append(f"{loc}: missing '{field}'."); continue
            if not isinstance(q[field], typ):
                errors.append(f"{loc}: '{field}' must be {typ.__name__}.")
        for field, typ in OPTIONAL.items():
            if field in q and not isinstance(q[field], typ):
                errors.append(f"{loc}: '{field}' must be {typ.__name__}.")
        if isinstance(q.get("choices"), list):
            if len(q["choices"]) < 2:
                errors.append(f"{loc}: needs at least 2 choices.")
            if not all(isinstance(c, str) for c in q["choices"]):
                errors.append(f"{loc}: every choice must be a string.")
            if isinstance(q.get("answer"), int):
                if not (0 <= q["answer"] < len(q["choices"])):
                    errors.append(f"{loc}: 'answer' index {q['answer']} is out of range "
                                  f"(must be 0..{len(q['choices'])-1}).")
    return errors

def main():
    files = sorted(glob.glob("data/*.json"))
    if not files:
        print("No data/*.json files found."); sys.exit(1)
    total_errors = 0
    for path in files:
        errs = validate_file(path)
        name = os.path.basename(path)
        if errs:
            total_errors += len(errs)
            print(f"\n❌ {name}")
            for e in errs:
                print(f"   - {e}")
        else:
            with open(path, encoding="utf-8") as f:
                n = len(json.load(f))
            print(f"✅ {name}  ({n} questions)")
    if total_errors:
        print(f"\n{total_errors} problem(s) found. Fix before pushing.")
        sys.exit(1)
    print("\nAll files valid. Safe to push. ✓")

if __name__ == "__main__":
    main()
