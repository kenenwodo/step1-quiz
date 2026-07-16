// Netlify serverless function: generate STEP 1 questions from a transcript.
//
// The API key is read from the environment variable ANTHROPIC_API_KEY,
// which you set in the Netlify dashboard (Site settings > Environment variables).
// It is NEVER sent to the browser — this code runs on Netlify's servers.
//
// Rate limit: a rolling window of MAX_CALLS per WINDOW_MS, tracked in Netlify Blobs
// (a free built-in key-value store, so the count survives across function invocations).

import { getStore } from "@netlify/blobs";

const MAX_CALLS = 15;                 // calls allowed per window
const WINDOW_MS = 60 * 60 * 1000;     // 1 hour
const MODEL = "claude-sonnet-4-6";    // capable + cost-effective for generation
const MAX_OUTPUT_TOKENS = 4096;

const SYSTEM_PROMPT = `You are writing USMLE STEP 1 multiple-choice questions from a study transcript.

Output ONLY a valid JSON array. No commentary, no markdown code fences. The first character must be [ and the last must be ].

Each element is an object with exactly these fields:
- "subtopic": a short label (2-4 words) for the specific concept
- "question": a STEP 1-style stem. Prefer clinical vignettes where the transcript supports it.
- "choices": an array of 4 or 5 answer strings. Do NOT prefix them with letters — the website adds those.
- "answer": the 0-based index of the correct choice (0 = first choice).
- "explanation": 2-4 sentences on why the right answer is right and why tempting wrong answers are wrong. Simple HTML like <strong> is allowed.

Base every question ONLY on content in the transcript. Do not invent unsupported facts.
Write 8-15 questions depending on transcript length. Vary the position of the correct answer.`;

// Basic structural validation so we never return broken data to the site.
function validateQuestions(data) {
  if (!Array.isArray(data) || data.length === 0) return "Model did not return a non-empty array.";
  for (let i = 0; i < data.length; i++) {
    const q = data[i];
    if (typeof q !== "object" || q === null) return `Question ${i + 1} is not an object.`;
    if (typeof q.question !== "string") return `Question ${i + 1} missing 'question'.`;
    if (!Array.isArray(q.choices) || q.choices.length < 2) return `Question ${i + 1} needs 2+ choices.`;
    if (!q.choices.every(c => typeof c === "string")) return `Question ${i + 1} has a non-string choice.`;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length)
      return `Question ${i + 1} has an out-of-range 'answer'.`;
    if (typeof q.explanation !== "string") return `Question ${i + 1} missing 'explanation'.`;
  }
  return null;
}

export default async (req) => {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // ---- Parse input early (need the password before doing anything else) ----
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  // ---- Password gate (checked on the server, never in the browser) ----
  const required = process.env.GENERATE_PASSWORD;
  if (required) {
    if (!body.password || body.password !== required) {
      return json({ error: "Incorrect password." }, 401);
    }
  }

  // ---- Rate limiting (rolling window) ----
  try {
    const store = getStore("rate-limit");
    const now = Date.now();
    const raw = await store.get("calls", { type: "json" });
    let calls = Array.isArray(raw) ? raw : [];
    calls = calls.filter(ts => now - ts < WINDOW_MS);   // drop timestamps outside the window
    if (calls.length >= MAX_CALLS) {
      const oldest = Math.min(...calls);
      const retryMin = Math.ceil((WINDOW_MS - (now - oldest)) / 60000);
      return json({ error: `Rate limit reached (${MAX_CALLS}/hour). Try again in about ${retryMin} minute(s).` }, 429);
    }
    calls.push(now);
    await store.setJSON("calls", calls);
  } catch (e) {
    // If the store is unavailable, fail closed on rate limiting but let the request through.
    console.warn("Rate-limit store error:", e);
  }

  // ---- Get transcript from the already-parsed body ----
  const transcript = (body.transcript || "").trim();
  if (!transcript) return json({ error: "No transcript provided." }, 400);
  if (transcript.length > 60000) return json({ error: "Transcript too long (max ~60k characters)." }, 413);

  // ---- Call Claude ----
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "Server is missing ANTHROPIC_API_KEY." }, 500);

  let data;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: "Here is the transcript:\n\n" + transcript }]
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic API error:", res.status, detail);
      return json({ error: "Question generation failed. Please try again." }, 502);
    }
    data = await res.json();
  } catch (e) {
    console.error("Fetch to Anthropic failed:", e);
    return json({ error: "Could not reach the generation service." }, 502);
  }

  // ---- Extract and parse the JSON the model returned ----
  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  let questions;
  try {
    // strip accidental code fences just in case
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    questions = JSON.parse(cleaned);
  } catch {
    return json({ error: "Model returned unparseable output. Try again." }, 502);
  }

  const problem = validateQuestions(questions);
  if (problem) return json({ error: "Generated questions failed validation: " + problem }, 502);

  return json({ questions });
};
