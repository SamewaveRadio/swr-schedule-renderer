// Format For Renderer (n8n Function node)
// Outputs 4 color variants per page.
// Adds dateLabel per row: "January 26th 7:00PM PST"

const TZ = 'America/Los_Angeles';

// ---- Pagination tuning knobs ----
const CHARS_PER_LINE = 34;
const MAX_LINES_PER_PAGE = 34;
const DAY_HEADER_COST = 2;
// --------------------------------

const COLOR_VARIANTS = [
  { key: 'blue',   bgColor: '#00aeef' },
  { key: 'red',    bgColor: '#df1931' },
  { key: 'yellow', bgColor: '#fff200' },
  { key: 'green',  bgColor: '#39e75f' },
];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function estWrappedLines(text) {
  const t = (text || '').trim();
  if (!t) return 1;
  return Math.max(1, Math.ceil(t.length / CHARS_PER_LINE));
}

function weekdayLower(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' })
    .format(date)
    .toLowerCase();
}

function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtTimeCaps(date) {
  // "7:00 PM" -> "7:00PM"
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return s.replace(' ', ''); // remove the space before AM/PM
}

function fmtDateLabel(date) {
  // "January 26th 7:00PM PST"
  const month = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'long' }).format(date);
  const dayNum = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).format(date)
  );
  const time = fmtTimeCaps(date);
  return `${month} ${ordinal(dayNum)} ${time} PST`;
}

function formatDatePillMonSun(weekStartISO) {
  const start = new Date(weekStartISO);
  const end = addDays(start, 6); // Monday -> Sunday

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
  });

  const a = fmt.format(start).toUpperCase();
  const b = fmt.format(end).toUpperCase();
  return `${a} - ${b}`;
}

// --- guard: if no input items ---
if (!items || items.length === 0) {
  return [{ json: { error: "Format For Render received 0 input items." } }];
}

// ---- weekStart/End from upstream if present; fallback if not ----
const meta = items.find(i => i?.json?.weekStartISO && i?.json?.weekEndISO);
let weekStartISO = meta?.json?.weekStartISO || null;
let weekEndISO = meta?.json?.weekEndISO || null;

if (!weekStartISO || !weekEndISO) {
  // fallback: compute next Monday (works, but ideally pass from Build Week Range)
  const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date());
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const idx = map[weekdayShort] ?? 0;

  let daysToNextMonday = (7 - idx) % 7;
  if (daysToNextMonday === 0) daysToNextMonday = 7;

  const todayYMD = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const todayMidnight = new Date(`${todayYMD}T00:00:00`);
  const weekStart = addDays(todayMidnight, daysToNextMonday);
  const weekEnd = addDays(weekStart, 7);

  weekStartISO = weekStart.toISOString();
  weekEndISO = weekEnd.toISOString();
}

const dateRange = formatDatePillMonSun(weekStartISO);

// 1) Normalize events
const events = items
  .map(i => i.json)
  .filter(e => e?.start?.dateTime)
  .map(e => {
    const start = new Date(e.start.dateTime);
    return {
      day: weekdayLower(start),
      time: fmtTimeCaps(start),            // keep if you still want time separately
      dateLabel: fmtDateLabel(start),      // ✅ FULL LABEL USED BY RENDERER
      line: (e.summary || '').trim(),
      sort: start.getTime(),
    };
  })
  .sort((a, b) => a.sort - b.sort);

if (events.length === 0) {
  return [{
    json: {
      error: "No calendar events found after filtering for start.dateTime.",
      weekStartISO,
      weekEndISO
    }
  }];
}

// 2) Group by day (Mon -> Sun)
const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const grouped = Object.fromEntries(dayOrder.map(d => [d, []]));

for (const ev of events) {
  grouped[ev.day].push({ time: ev.time, line: ev.line, dateLabel: ev.dateLabel });
}

const days = dayOrder
  .map(d => ({ day: d, rows: grouped[d] || [] }))
  .filter(d => d.rows.length > 0);

// 3) Paginate
const pages = [];
let current = [];
let used = 0;

for (const d of days) {
  const dayCost =
    DAY_HEADER_COST +
    d.rows.reduce((sum, r) => sum + estWrappedLines(r.line), 0);

  if (current.length && (used + dayCost) > MAX_LINES_PER_PAGE) {
    pages.push(current);
    current = [];
    used = 0;
  }

  current.push(d);
  used += dayCost;
}

if (current.length) pages.push(current);

// 4) Output: 4 variants per page
const out = [];
for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
  const pageDays = pages[pageIdx];

  for (let v = 0; v < COLOR_VARIANTS.length; v++) {
    const variant = COLOR_VARIANTS[v];

    out.push({
      json: {
        size: { width: 1080, height: 1350 },
        weekStartISO,
        weekEndISO,
        dateRange,
        timezoneNote: "*TIMES ARE IN PST*",
        titleLeft: "THIS WEEK ON SAMEWAVE RADIO",
        bgColor: variant.bgColor,
        themeKey: variant.key,

        pageIndex: pageIdx + 1,
        pageTotal: pages.length,
        variantIndex: v + 1,
        variantTotal: COLOR_VARIANTS.length,

        days: pageDays,
      },
    });
  }
}

return out;
