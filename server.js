// server.js — FULL REPLACEMENT
// - Uses dateLabel (e.g. "JANUARY 10 7:00PM PST") when provided by n8n
// - Fixes asset serving (/Assets) robustly on Render
// - Removes outer border around the full schedule; ONLY the header is boxed
// - Keeps row divider lines between shows

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const app = express();
app.set("trust proxy", 1); // important on Render (x-forwarded-proto/host)
app.use(express.json({ limit: "8mb" }));

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Robust Assets serving ----
const assetCandidates = [
  path.join(__dirname, "Assets"),
  path.join(process.cwd(), "Assets"),
  path.join(process.cwd(), "swr-schedule-renderer", "Assets"),
];

const assetsDir = assetCandidates.find(
  (p) => fs.existsSync(p) && fs.statSync(p).isDirectory()
);

if (assetsDir) {
  console.log("Serving Assets from:", assetsDir);
  app.use("/Assets", express.static(assetsDir, { maxAge: "7d", etag: true }));
  app.use("/assets", express.static(assetsDir, { maxAge: "7d", etag: true })); // alias
} else {
  console.warn("⚠️ Assets folder not found. Tried:", assetCandidates);
}

app.get("/debug/assets", (_req, res) => {
  res.json({
    cwd: process.cwd(),
    __dirname,
    candidates: assetCandidates,
    assetsDir: assetsDir || null,
    foundIcon: assetsDir ? fs.existsSync(path.join(assetsDir, "Icon.png")) : false,
    foundFont: assetsDir
      ? fs.existsSync(path.join(assetsDir, "MainFont.woff2"))
      : false,
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[m]);
}

function normalizeRows(data) {
  // Option A: pre-flattened items [{left,right}]
  if (Array.isArray(data?.items) && data.items.length) {
    return data.items.map((it) => ({
      left: String(it.left ?? ""),
      right: String(it.right ?? ""),
    }));
  }

  // Option B: days[] format from your n8n function
  const days = Array.isArray(data?.days) ? data.days : [];
  const tz = data?.tzAbbrev ? ` ${data.tzAbbrev}` : "";

  return days.flatMap((d) => {
    const day = String(d?.day ?? "");
    const rows = Array.isArray(d?.rows) ? d.rows : [];
    return rows.map((r) => ({
      left: String(r?.line ?? ""),
      // ✅ Prefer dateLabel (JANUARY 10 7:00PM PST)
      right: String(
        r?.dateLabel ??
          (day && r?.time ? `${day} ${String(r.time)}${tz}` : String(r?.time ?? ""))
      ).trim(),
    }));
  });
}

function htmlFor(data, baseUrl) {
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  const headerLeft = escapeHtml(
    data.headerLeft || "THIS WEEK ON SAMEWAVE RADIO"
  );
  const headerRight = escapeHtml(data.headerRight || data.dateRange || "");

  // Assets
  const fontUrl = data.fontUrl || `${baseUrl}/Assets/MainFont.woff2`;
  const logoUrl = data.logoUrl || `${baseUrl}/Assets/Icon.png`;

  // Colors
  const bg = data.bgColor || "#41E14D";
  const ink = data.inkColor || "#0B0C0F";

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
  :root { --bg:${bg}; --ink:${ink}; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#000; }

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

  .logo{
    position:absolute;
    top: 40px;
    right: 56px;
    width: 250px;
    height: auto;
    image-rendering: -webkit-optimize-contrast;
  }

  /* ✅ No outer border around the schedule */
  .table{
    position:absolute;
    left:56px;
    right:56px;
    bottom:56px;
    border:none;
    background: transparent;
  }

  /* ✅ Only header has a full box border */
  .tHeader{
    display:grid;
    grid-template-columns: 1fr max-content;
    gap: 24px;
    padding: 12px 16px;
    border: 2px solid var(--ink);

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

  /* Divider lines ONLY between shows */
  .tRow{
    display:grid;
    grid-template-columns: 1fr 340px;
    gap: 18px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.35);
    align-items: start;
  }
  .tRow:last-child{ border-bottom:none; }

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

app.post("/render", async (req, res) => {
  const data = req.body || {};
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  const xfProto = (req.headers["x-forwarded-proto"] || "")
    .toString()
    .split(",")[0]
    .trim();
  const xfHost = (req.headers["x-forwarded-host"] || "")
    .toString()
    .split(",")[0]
    .trim();

  const proto = xfProto || "https";
  const host = xfHost || req.get("host");
  const baseUrl = `${proto}://${host}`;

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

