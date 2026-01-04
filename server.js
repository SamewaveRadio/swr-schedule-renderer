// server.js — FULL REPLACEMENT (green table poster + custom font/logo from /Assets)

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "8mb" }));

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPORTANT: your folder is named "Assets" (capital A)
app.use(
  "/Assets",
  express.static(path.join(__dirname, "Assets"), {
    maxAge: "7d",
    etag: true,
  })
);

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

// Flatten either:
// A) data.items: [{ left, right }]
// B) data.days: [{ day, rows:[{time,line}]}]
function normalizeRows(data) {
  if (Array.isArray(data?.items) && data.items.length) {
    return data.items.map((it) => ({
      left: String(it.left ?? ""),
      right: String(it.right ?? ""),
    }));
  }

  const tz = data?.tzAbbrev ? ` ${data.tzAbbrev}` : "";
  const days = Array.isArray(data?.days) ? data.days : [];

  return days.flatMap((d) => {
    const day = String(d?.day ?? "");
    const rows = Array.isArray(d?.rows) ? d.rows : [];
    return rows.map((r) => ({
      left: String(r?.line ?? ""),
      right: `${day} ${String(r?.time ?? "")}${tz}`.trim(),
    }));
  });
}

function htmlFor(data, baseUrl) {
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  // Header text
  const headerLeft = escapeHtml(data.headerLeft || "THIS WEEK ON SAMEWAVE RADIO");
  const headerRight = escapeHtml(data.headerRight || (data.dateRange || ""));

  // Use your exact asset names/locations
  const fontUrl = data.fontUrl || `${baseUrl}/Assets/MainFont.woff2`;
  const logoUrl = data.logoUrl || `${baseUrl}/Assets/Icon.png`;

  // Color theme (defaults match your reference)
  const bg = data.bgColor || "#41E14D";      // bright green
  const ink = data.inkColor || "#0B0C0F";    // near-black
  const grid = data.gridColor || "rgba(0,0,0,0.20)";

  const rows = normalizeRows(data);

  const rowsHtml = rows
    .map(
      (r) => `
    <div class="tRow">
      <div class="left">${escapeHtml(r.left)}</div>
      <div class="right">${escapeHtml(r.right)}</div>
    </div>
  `
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<style>
  :root{
    --bg:${bg};
    --ink:${ink};
    --grid:${grid};
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#000; }

  /* Custom font */
  @font-face{
    font-family: "SWRCustom";
    src: url("${fontUrl}") format("woff2");
    font-weight: 400 900;
    font-style: normal;
    font-display: swap;
  }

  .canvas{
    width:${W}px;
    height:${H}px;
    position:relative;
    overflow:hidden;
    background: var(--bg);
    color: var(--ink);
  }

  /* Subtle texture/grid */
  .canvas::before{
    content:"";
    position:absolute; inset:0;
    background:
      linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px);
    background-size: 90px 90px;
    opacity: 0.22;
    pointer-events:none;
  }

  .pad{
    position:absolute;
    inset: 0;
    padding: 56px;
  }

  /* Logo in top-right */
  .logo{
    position:absolute;
    top: 40px;
    right: 56px;
    width: 250px;
    height: auto;
    image-rendering: -webkit-optimize-contrast;
  }

  /* Table container pinned to bottom */
  .table{
    position:absolute;
    left:56px;
    right:56px;
    bottom:56px;
    border: 2px solid var(--ink);
    background: transparent;
  }

  .tHeader{
    display:grid;
    grid-template-columns: 1fr max-content;
    gap: 24px;
    padding: 12px 16px;
    border-bottom: 2px solid var(--ink);
    font-family: "SWRCustom", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight: 800;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    font-size: 16px;
    line-height: 1.2;
  }
  .tHeader .rightH{
    text-align:right;
    white-space:nowrap;
  }

  .tBody{
    font-family: "SWRCustom", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight: 750;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    font-size: 14px;
    line-height: 1.25;
  }

  .tRow{
    display:grid;
    grid-template-columns: 1fr 290px;
    gap: 18px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.35);
    align-items: start;
  }
  .tRow:last-child{
    border-bottom: none;
  }

  .left{
    overflow-wrap:anywhere;
    white-space: normal;
  }
  .right{
    text-align:right;
    white-space: nowrap;
    opacity: 0.95;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="pad">
      <img class="logo" src="${logoUrl}" alt="Samewave Radio logo" />
      <div class="table">
        <div class="tHeader">
          <div class="leftH">${headerLeft}</div>
          <div class="rightH">${headerRight}</div>
        </div>
        <div class="tBody">
          ${rowsHtml}
        </div>
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

  // Base URL so HTML can load /Assets from this same service
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  let browser;
  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });

    await page.setContent(htmlFor(data, baseUrl), { waitUntil: "networkidle" });

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

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Renderer listening on :${port}`));
