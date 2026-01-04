// server.js — FULL REPLACEMENT (copy/paste the whole file)

import express from "express";
import { chromium } from "playwright";

const app = express();

// Parse JSON bodies (n8n will POST JSON)
app.use(express.json({ limit: "5mb" }));

// Friendly error for bad JSON
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  next(err);
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[m]);
}

function htmlFor(data) {
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  const title = escapeHtml(data.title || "ON THE SOUNDWAVES");
  const dateRange = escapeHtml(data.dateRange || "");
  const tzNote = escapeHtml(data.timezoneNote || "*TIMES ARE IN PST*");
  const urlText = escapeHtml(data.urlText || "SWR.LIVE");

  const pageBadge =
    data?.pageTotal && data.pageTotal > 1
      ? ` <span class="page">(${escapeHtml(data.pageIndex)}/${escapeHtml(
          data.pageTotal
        )})</span>`
      : "";

  const daysHtml = (data.days || [])
    .map((d) => {
      const dayLabel = escapeHtml(d.day || "");
      const rows = (d.rows || [])
        .map(
          (r) => `
          <div class="row">
            <div class="time">${escapeHtml(r.time || "")}</div>
            <div class="line">${escapeHtml(r.line || "")}</div>
          </div>
        `
        )
        .join("");

      return `
        <section class="day">
          <div class="dayHead">
            <div class="dayBox">${dayLabel}</div>
            <div class="rule"></div>
          </div>
          <div class="rows">${rows}</div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<style>
  :root{
    --bg:#0b0c0f;
    --fg:#f4f4f5;
    --muted:rgba(244,244,245,0.82);
    --muted2:rgba(244,244,245,0.70);
    --line2:rgba(244,244,245,0.30);
  }

  /* CRITICAL: prevents padding from causing cut-off */
  *, *::before, *::after { box-sizing: border-box; }

  html,body{margin:0;padding:0;background:#000;}
  .canvas{
    width:${W}px;height:${H}px;
    background:var(--bg);
    color:var(--fg);
    position:relative;
    overflow:hidden;
  }

  /* subtle grid texture */
  .canvas::before{
    content:"";
    position:absolute; inset:0;
    background:
      linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 72px 72px;
    opacity:0.32;
    pointer-events:none;
  }

  /* Full-height layout: header + schedule (fills) + footer */
  .pad{
    position:relative;
    padding:56px 56px 48px 56px;
    height:100%;
    display:flex;
    flex-direction:column;
  }

  .top{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:24px;
    margin-bottom:22px;
  }

  .title{
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-weight:900;
    text-transform:uppercase;
    letter-spacing:2.6px;
    font-size:64px;
    line-height:1;
  }

  .meta{
    display:flex;
    align-items:center;
    gap:12px;
    white-space:nowrap;
  }

  /* Rectangular date box */
  .dateBox{
    border:2px solid var(--line2);
    border-radius:10px;
    padding:10px 16px;
    width:fit-content;
    display:inline-block;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-weight:800;
    text-transform:uppercase;
    letter-spacing:1.2px;
    font-size:20px;
  }

  .page{
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size:14px;
    color:var(--muted);
    transform: translateY(2px);
  }

  /* Schedule fills remaining space and distributes sections */
  .schedule{
    flex:1;
    display:flex;
    flex-direction:column;
    justify-content:space-evenly; /* smoother than space-between */
    min-height:0;
  }

  .day{ margin:0; }

  /* Keep divider start aligned (label column fixed) */
  .dayHead{
    display:grid;
    grid-template-columns: 180px 1fr;
    align-items:center;
    column-gap:14px;
    margin-bottom:10px;
  }

  /* Rectangular day box, variable width, even padding */
  .dayBox{
    border:2px solid var(--line2);
    border-radius:10px;
    padding:10px 16px;
    width:fit-content;
    display:inline-block;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-weight:800;
    text-transform:lowercase;
    letter-spacing:0.3px;
    font-size:20px;
    justify-self:start;
  }

  .rule{
    border-top:2px solid var(--line2);
    opacity:0.9;
  }

  /* Better spacing within each day section */
  .rows{
    margin-left:180px;
    margin-top:8px;
    display:flex;
    flex-direction:column;
    gap:12px; /* spacing BETWEEN show lines */
  }

  /* WRAPPING ENABLED */
  .row{
    display:grid;
    grid-template-columns: 110px 1fr;
    gap:18px;
    align-items:start;
    margin:0; /* IMPORTANT: no margin, spacing handled by gap */
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight:700;
    letter-spacing:0.35px;
    color:var(--muted);
    font-size:18px;
    line-height:1.35;
  }

  .time{
    text-align:right;
    padding-top:1px;
    color:var(--muted2);
    white-space:nowrap;
  }

  .line{
    white-space:normal;
    overflow-wrap:anywhere;
  }

  .footer{
    margin-top:18px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    color:var(--muted);
  }

  .tz{
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight:700;
    letter-spacing:0.8px;
    font-size:16px;
  }

  .url{
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-weight:900;
    letter-spacing:2.2px;
    font-size:22px;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="pad">
      <div class="top">
        <div class="title">${title}</div>
        <div class="meta">
          <div class="dateBox">${dateRange}</div>${pageBadge}
        </div>
      </div>

      <div class="schedule">
        ${daysHtml}
      </div>

      <div class="footer">
        <div class="tz">${tzNote}</div>
        <div class="url">${urlText}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/render", async (req, res) => {
  const data = req.body || {};
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  let browser;
  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage({ viewport: { width: W, height: H } });

    await page.setContent(htmlFor(data), { waitUntil: "networkidle" });

    // Force exact 1080x1350 output (prevents any weird clipping surprises)
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: W, height: H },
    });

    res.setHeader("Content-Type", "image/png");
    res.status(200).send(png);
  } catch (err) {
    console.error("Render failed:", err);
    res.status(500).json({ error: "Render failed" });
  } finally {
    if (browser) await browser.close();
  }
});

// Render expects binding to process.env.PORT and 0.0.0.0
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Renderer listening on :${port}`));
