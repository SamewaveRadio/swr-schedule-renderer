// server.js — FULL REPLACEMENT (memory-safe)
// - Reuses one Playwright browser (major RAM reduction)
// - Serializes renders (prevents overlaps from retries/timeouts)
// - Logs each /render request
// - Ensures page/context always closes

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const app = express();
app.set("trust proxy", 1);
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
  app.use("/assets", express.static(assetsDir, { maxAge: "7d", etag: true }));
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
    foundFont: assetsDir ? fs.existsSync(path.join(assetsDir, "MainFont.woff2")) : false,
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
  if (Array.isArray(data?.items) && data.items.length) {
    return data.items.map((it) => ({
      left: String(it.left ?? ""),
      right: String(it.right ?? ""),
    }));
  }

  const days = Array.isArray(data?.days) ? data.days : [];
  const tz = data?.tzAbbrev ? ` ${data.tzAbbrev}` : "";

  return days.flatMap((d) => {
    const day = String(d?.day ?? "");
    const rows = Array.isArray(d?.rows) ? d.rows : [];
    return rows.map((r) => ({
      left: String(r?.line ?? ""),
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

  const headerLeft = escapeHtml(data.headerLeft || data.titleLeft || "THIS WEEK ON SAMEWAVE RADIO");
  const headerRight = escapeHtml(data.headerRight || data.dateRange || "");

  const fontUrl = data.fontUrl || `${baseUrl}/Assets/MainFont.woff2`;
  const logoUrl = data.logoUrl || `${baseUrl}/Assets/Icon.png`;

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

  .table{
    position:absolute;
    left:56px;
    right:56px;
    bottom:56px;
    border:none;
    background: transparent;
  }

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

  .tRow{
    display:grid;
    grid-template-columns: 1fr 380px;
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

// --------------------
// Playwright: global browser reuse + serialized queue
// --------------------
let browserPromise = null;

// Simple mutex queue (one render at a time)
let queue = Promise.resolve();
function withQueue(fn) {
  const run = queue.then(fn, fn);
  // keep chain alive even if one job errors
  queue = run.catch(() => {});
  return run;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

function getBaseUrl(req) {
  const xfProto = (req.headers["x-forwarded-proto"] || "").toString().split(",")[0].trim();
  const xfHost = (req.headers["x-forwarded-host"] || "").toString().split(",")[0].trim();
  const proto = xfProto || "https";
  const host = xfHost || req.get("host");
  return `${proto}://${host}`;
}

app.post("/render", async (req, res) => {
  const startedAt = Date.now();
  const data = req.body || {};
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  console.log(`[render] start ${new Date().toISOString()} size=${W}x${H} theme=${data?.themeKey || "n/a"}`);

  return withQueue(async () => {
    let context = null;
    let page = null;

    try {
      const browser = await getBrowser();
      context = await browser.newContext({
        viewport: { width: W, height: H },
        deviceScaleFactor: 1,
      });

      page = await context.newPage();

      const baseUrl = getBaseUrl(req);

      await page.setContent(htmlFor(data, baseUrl), { waitUntil: "domcontentloaded" });

      // Ensure fonts are loaded (reduces layout shifts)
      await page.evaluate(() => document.fonts?.ready);

      // Small wait for image/font network loads (but not “networkidle”, which can hang)
      await page.waitForTimeout(150);

      const png = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: W, height: H },
      });

      res.setHeader("Content-Type", "image/png");
      res.status(200).send(png);

      console.log(`[render] ok ${Date.now() - startedAt}ms`);
    } catch (err) {
      console.error("[render] failed:", err);
      // If the browser got into a bad state, reset it (next request relaunches)
      browserPromise = null;
      res.status(500).json({ error: "Render failed" });
    } finally {
      try { if (page) await page.close(); } catch {}
      try { if (context) await context.close(); } catch {}
    }
  });
});

// Clean shutdown
process.on("SIGTERM", async () => {
  try {
    const b = await browserPromise;
    if (b) await b.close();
  } catch {}
  process.exit(0);
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Renderer listening on :${port}`));
