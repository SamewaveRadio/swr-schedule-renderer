import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "5mb" }));

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
    --line:rgba(244,244,245,0.22);
    --line2:rgba(244,244,245,0.30);
  }

  html,body{margin:0;padding:0;background:#000;}
  .canvas{
    width:${W}px;height:${H}px;
    background:var(--bg);
    color:var(--fg);
    position:relative;
    overflow:hidden;
  }

  /* subtle grid texture */
  .canvas:before{
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
    padding:64px 64px 56px 64px;
    height:100%;
    display:flex;
    flex-direction:column;
  }

  .top{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:24px;
    margin-bottom:26px;
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

  /* Rectangles (not pills) */
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

  /* Schedule fills remaining space + spreads vertically */
  .schedule{
    flex:1;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    gap:18px;
    min-height:0;
  }

  .day{ margin:0; }

  /* Keep divider start aligned even though day box widths vary */
  .dayHead{
    display:grid;
    grid-template-columns: 180px 1fr; /* fixed label column */
    align-items:center;
    column-gap:14px;
    margin-bottom:10px;
  }

  .dayBox{
    border:2px solid var(--line2);
    border-radius:10px;
    padding:10px 16px;
    width:fit-content;      /* variable width */
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

  .rows{
    margin-left:180px; /* align with day label column */
  }

  /* WRAPPING ENABLED */
  .row{
    display:grid;
    grid-template-columns: 110px 1fr;
    gap:18px;
    align-items:start;
    margin:8px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight:700;
    letter-spacing:0.35px;
    color:var(--muted);
    font-size:18px;
    line-height:1.25;
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
    margin-top:26px;
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

  const browser = awai
