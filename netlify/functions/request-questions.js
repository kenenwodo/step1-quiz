// Serverless function for the "Request new questions" feature.
//
// Purpose: keep the request password a REAL secret. The password is stored as a
// Netlify environment variable (REQUEST_PASSWORD) and checked here on the
// server. The browser never sees it. This function does NOT call the Claude API,
// so it needs no billing.
//
// On a correct password, it forwards the transcript into Netlify Forms
// server-side, so submissions land in your Netlify dashboard (Forms tab) and
// trigger any email notifications you set up there.

const SITE_URL = process.env.URL; // Netlify provides this automatically at runtime

function encodeForm(data) {
  return Object.keys(data)
    .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(data[k]))
    .join("&");
}

export default async (req) => {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  // ---- Password check (the real secret lives here, server-side) ----
  const required = process.env.REQUEST_PASSWORD;
  if (!required) return json({ error: "Server is not configured yet." }, 500);
  if (!body.password || body.password !== required) {
    return json({ error: "Incorrect password." }, 401);
  }

  // ---- Validate the request payload ----
  const topic = (body.topic || "").trim();
  const transcript = (body.transcript || "").trim();
  const email = (body.email || "").trim();
  if (!topic) return json({ error: "Missing topic." }, 400);
  if (!transcript) return json({ error: "Missing transcript." }, 400);
  if (transcript.length > 100000) return json({ error: "Transcript too long." }, 413);

  // ---- Forward into Netlify Forms (server-side submission) ----
  try {
    const res = await fetch(SITE_URL + "/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeForm({
        "form-name": "question-request",
        "topic": topic,
        "email": email,
        "transcript": transcript,
        "bot-field": ""
      })
    });
    if (!res.ok) {
      console.error("Netlify Forms submission failed:", res.status);
      return json({ error: "Could not record the request. Please try again." }, 502);
    }
  } catch (e) {
    console.error("Forwarding error:", e);
    return json({ error: "Could not record the request. Please try again." }, 502);
  }

  return json({ ok: true });
};
