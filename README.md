# STEP 1 Review Quiz

A simple, self-contained web app for practicing USMLE STEP 1-style
multiple-choice questions. Pick a topic, answer questions, and get immediate
feedback with explanations. Your progress is saved locally in your browser.

## Features

- Topic-based multiple-choice quizzes with answers and explanations
- "All Topics" mode to practice across everything at once
- Immediate feedback with a short explanation for each question
- Score tracking and a per-topic breakdown on completion
- "Review Missed Questions" to retry the ones you got wrong
- Progress saved in your browser (per device), with export/import for backups

## Tech

- Static front end: plain HTML, CSS, and JavaScript (no framework)
- Questions stored as JSON files, one per topic, in `data/`
- Optional serverless function for on-the-fly question generation
- Deploys as a static site with serverless functions

## Project structure

```
index.html              The whole quiz app (HTML + CSS + JS)
data/*.json             One file per topic; each is an array of questions
netlify/functions/      Optional serverless function
validate.py             Checks all question files are well-formed
```

## Question format

Each topic file in `data/` is a JSON array of question objects:

```json
[
  {
    "subtopic": "Short label (optional)",
    "question": "The question stem.",
    "choices": ["First option", "Second option", "Third option"],
    "answer": 0,
    "explanation": "Why the correct answer is correct."
  }
]
```

`answer` is the zero-based index of the correct choice (0 = first option).

## Running locally

Because the app loads question files over HTTP, open it through a local
server rather than double-clicking the file:

```
python3 -m http.server
```

Then visit `http://localhost:8000`.

## Validating question files

After editing anything in `data/`, check the files are well-formed:

```
python3 validate.py
```

## License

Personal study project.
