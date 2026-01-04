import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "2mb" }));

function escapeHtml(str="") {
  return str.replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function htmlFor(data) {
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  const title = escapeHtml(data.title || "ON THE SOUNDWAVES");
  const dateRange = escapeHtml(data.dateRange || "");
  const tzNote = escapeHtml(data.timezoneNote || "*TIMES ARE IN PST*");
  const urlText = escapeHtml(data.urlText || "SWR.LIVE");

  const daysHtml = (data.days || []).map(d => {
    const dayLabel = escapeHtml(d.day || "");
    const rows = (d.rows || []).map(r => `
      <div class="row">
        <div class="time">${escapeHtml(r.time || "")}</div>
        <div class="line">${escapeHtml(r.line || "")}</div>
      </div>
    `).join("");

    return `
      <section class="day">
        <div class="dayHead">
          <div class="dayPill">${dayLabel}</div>
          <div class="rule"></div>
        </div>
        <div class="rows">${rows}</div>
      </section>
    `;
  }).join("");

  const pageBadge = data.pageTotal > 1 ? ` <span class="page">(${data.pageIndex}/${data.pageTotal})</span>` : "";

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

  /* subtle texture / grid vibe (very NTS-adjacent) */
  .canvas:before{
    content:"";
    position:absolute; inset:0;
    background:
      linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 72px 72px;
    opacity:0.35;
    pointer-events:none;
  }

  .pad{ position:relative; padding:64px 64px 56px 64px; }

  .top{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:24px;
    margin-bottom:30px;
  }
  .title{
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-weight:900;
    text-transform:uppercase;
    letter-spacing:2.5px;
    font-size:64px;
    line-height:1;
  }
  .meta{
    display:flex;
    align-items:center;
    gap:12px;
    white-space:nowrap;
  }
  .datePill{
    border:2px solid var(--line2);
    border-radius:999px;
    padding:10px 16px;
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

  .day{ margin-top:18px; }
  .dayHead{
    display:flex;
    align-items:center;
    gap:14px;
    margin-bottom:10px;
  }
  .dayPill{
    border:2px solid var(--line2);
    border-radius:999px;
    padding:6px 14px;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-weight:800;
    text-transform:lowercase;
    letter-spacing:0.3px;
    font-size:20px;
    min-width:140px;
  }
  .rule{
    flex:1;
    border-top:2px solid var(--line2);
    opacity:0.9;
  }

  .rows{ margin-left:170px; }

  /* Key part: WRAPPING ENABLED */
  .row{
    display:grid;
    grid-template-columns: 110px 1fr;
    gap:18px;
    align-items:start;
    margin:8px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight:700;
    letter-spacing:0.4px;
    color:var(--muted);
    font-size:18px;
    line-height:1.25;
  }
  .time{
    text-align:right;
    padding-top:1px;
    color:rgba(244,244,245,0.75);
  }
  .line{
    white-space:normal;      /* wrap */
    overflow-wrap:anywhere;  /* wrap long tokens */
  }

  .footer{
    position:absolute;
    left:64px; right:64px; bottom:44px;
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
          <div class="datePill">${dateRange}</div>${pageBadge}
        </div>
      </div>

      ${daysHtml}
    </div>

    <div class="footer">
      <div class="tz">${tzNote}</div>
      <div class="url">${urlText}</div>
    </div>
  </div>
</body>
</html>`;
}

app.post("/render", async (req, res) => {
  const data = req.body || {};
  const W = data?.size?.width ?? 1080;
  const H = data?.size?.height ?? 1350;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  await page.setContent(htmlFor(data), { waitUntil: "networkidle" });
  const png = await page.screenshot({ type: "png" });

  await browser.close();

  res.setHeader("Content-Type", "image/png");
  res.send(png);
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(3000, () => console.log("Renderer listening on :3000"));
