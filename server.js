// server.js — FULL REPLACEMENT
// - Background color driven by req.body.bgColor (supports 4-variant renders)
// - Header date range corrected to MONDAY -> SUNDAY when weekStartISO is provided
// - Show date format: "JANUARY 10 7:00PM PST" (uses dateLabel if provided; otherwise formats from startISO/start)
// - Robust /Assets serving on Render
// - No outer border around schedule; ONLY header is boxed; rows have divider lines

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

const DEFAULT_TZ = "America/Los_Angeles";

// ---- Robust Assets serving ----
const assetCandidates = [
  path.join(__dirname, "Assets"),
  path.join(process.cwd(), "Assets"),
  path.join(process.cwd(), "swr-schedule-renderer", "Assets"),
];

const assetsDir = assetCandidates.find((p) => {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
});

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
    foundFont: assetsDir ? fs.existsSync(path.join(assetsDir, "MainFont.woff2")) : false,
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[m]
  );
}

function getTzAbbrev(date, timeZone) {
  // Returns "PST"/"PDT" etc.
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value || "";
    // Some envs return "GMT-8"; that's still usable, but you want PST/PDT.
    return tz;
  } catch {
    return "";
  }
}

function formatTimeCompact(date, timeZone) {
  // "7:00PM" (no space)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase();

  return `${hour}:${minute}${dayPeriod}`;
}

function formatMonthLongUpper(date, timeZone) {
  // "JANUARY"
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
  }).format(date);
  return month.toUpperCase();
}

function formatMonthShortUpper(date, timeZone) {
  // "JAN"
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
  }).format(date);
  return month.toUpperCase();
}

function formatDayNumber(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    day: "numeric",
  }).format(date);
}

function formatFullDateLabel(date, timeZone) {
  // "JANUARY 10 7:00PM PST"
  const month = formatMonthLongUpper(date, timeZone);
  const day = formatDayNumber(date, timeZone);
  const time = formatTimeCompact(date, timeZone);
  const tz = getTzAbbrev(date, timeZone);
  const tzOut = tz ? ` ${tz}` : "";
  return `${month} ${day} ${time}${tzOut}`.trim();
}
function formatWeekRangeMonSun(weekStartISO, timeZone) {
  // Accepts weekStartISO that might be Sunday; always outputs MON -> SUN range.

  try {
    let start = new Date(weekStartISO);

    // Determine weekday in target timezone
    const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(start);
    // If it's Sunday, bump to Monday
    if (wd === "Sun") {
      const bumped = new Date(start);
      bumped.setDate(bumped.getDate() + 1);
      start = bumped;
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 6); // Monday + 6 = Sunday

    const aM = formatMonthShortUpper(start, timeZone);
    const aD = formatDayNumber(start, timeZone);
    const bM = formatMonthShortUpper(end, timeZone);
    const bD = formatDayNumber(end, timeZone);

    // If month changes: "JAN 29 - FEB 4"
    if (aM !== bM) return `${aM} ${aD} - ${bM} ${bD}`;
    return `${aM} ${aD} - ${aM} ${bD}`;
  } catch {
    return "";
  }
}


function normalizeRows(data) {
  const timeZone = data?.timeZone || DEFAULT_TZ;

  // Option A: already flattened items [{left,right,dateLabel,startISO}]
  if (Array.isArray(data?.items) && data.items.length) {
    return data.items.map((it) => {
      const left = String(it.left ?? "");
      // Prefer explicit dateLabel, else right, else format from startISO/start
      let right =
        (it.dateLabel != null ? String(it.dateLabel) : "") ||
        (it.right != null ? String(it.right) : "");

      if (!right) {
        const startISO = it.startISO || it.start || it.startDateTime || null;
        if (startISO) right = formatFullDateLabel(new Date(startISO), timeZone);
      }

      return { left, right: String(right ?? "").trim() };
    });
  }

  // Option B: days[] format from your n8n function
  const days = Array.isArray(data?.days) ? data.days : [];

  return days.flatMap((d) => {
    const rows = Array.isArray(d?.rows) ? d.rows : [];
    return rows.map((r) => {
      const left = String(r?.line ?? "");

      // ✅ Prefer explicit dateLabel from n8n
      let right = r?.dateLabel != null ? String(r.dateLabel) : "";

      // If not provided, try formatting from ISO date fields
      if (!right) {
        const startISO = r?.startISO || r?.start || r?.startDateTime || null;
        if (startISO) {
          right = formatFullDateLabel(new Date(startISO), timeZone);
        } else if (r?.time) {
          // last-resort fallback (not ideal, but prevents blank)
          right = String(r.time);
        } else {
          right = "";
        }
      }

      return { left, right: right.trim() };
    });
  });
}

function htmlFor(data, baseUrl) {
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;
  const timeZone = data?.timeZone || DEFAULT_TZ;

  // Header text
  const headerLeft = escapeHtml(data.titleLeft || data.headerLeft || "THIS WEEK ON SAMEWAVE RADIO");

  // ✅ Fix header date range to Monday–Sunday if weekStartISO provided
  const computedRange = data.weekStartISO ? formatWeekRangeMonSun(data.weekStartISO, timeZone) : "";
  const headerRightRaw = computedRange || data.headerRight || data.dateRange || "";
  const headerRight = escapeHtml(headerRightRaw);

  // Assets
  const fontUrl = data.fontUrl || `${baseUrl}/Assets/MainFont.woff2`;
  const logoUrl = data.logoUrl || `${baseUrl}/Assets/Icon.png`;

  // Colors (supports your 4-color variants)
  const bg = data.bgColor || "#39e75f"; // original green fallback
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
    grid-template-columns: 1fr 360px;
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

  const xfProto = (req.headers["x-forwarded-proto"] || "").toString().split(",")[0].trim();
  const xfHost = (req.headers["x-forwarded-host"] || "").toString().split(",")[0].trim();

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
