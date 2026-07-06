// Real data comes from /api/quote and /api/news (Yahoo Finance chart data +
// Google News RSS, both no-API-key — see api/_shared.py). If those calls
// fail (offline, rate-limited, or running without devserver.py/Vercel),
// fetchQuote/fetchHeadlines fall back to the mock generators below so the
// UI never breaks.
//
// fetchQuote(ticker)      -> Promise<{ price: number, changePct: number }>
// fetchHeadlines(ticker)  -> Promise<Array<{ source, minutesAgo, text, category }>>

const DEFAULT_TICKERS = [
  'ARM', 'AMD', 'INTC', 'AVGO', 'MU', 'CRWD', 'TSM', 'NFLX', 'NVDA', 'PANW',
  'QCOM', 'AAPL', 'MSFT', 'SNOW', 'PLTR', 'AMZN', 'GOOGL', 'TSLA', 'META',
];

const BASE_PRICES = {
  ARM: 162.88, AMD: 171.30, INTC: 31.42, AVGO: 268.11, MU: 142.05,
  CRWD: 412.60, TSM: 221.67, NFLX: 987.30, NVDA: 187.42, PANW: 198.55,
  QCOM: 168.20, AAPL: 231.10, MSFT: 468.90, SNOW: 178.40, PLTR: 148.92,
  AMZN: 228.75, GOOGL: 196.30, TSLA: 342.15, META: 712.80,
};

// Curated stub headlines for names with a specific mockup catalyst; other
// tickers draw from the generic pool below.
const CURATED_HEADLINES = {
  NVDA: [{ source: 'Reuters', minutesAgo: 14, category: 'guidance', text: 'Blackwell supply tightens into Q3, per component suppliers.' }],
  MU: [{ source: 'Morgan Stanley', minutesAgo: 22, category: 'analyst_action', text: 'HBM4 demand outlook raised on AI accelerator attach-rate assumptions.' }],
  AMD: [{ source: "Tom's Hardware", minutesAgo: 36, category: 'other', text: 'Leaked roadmap slide shows MI400 timeline shift, unconfirmed by AMD.' }],
  ARM: [{ source: 'Bloomberg', minutesAgo: 60, category: 'regulatory', text: 'Court filing update in the ongoing Arm-Qualcomm licensing dispute.' }],
  PLTR: [{ source: 'Reuters', minutesAgo: 18, category: 'M&A', text: 'New government contract expansion disclosed with an existing agency.' }],
  TSM: [{ source: 'Reuters', minutesAgo: 48, category: 'regulatory', text: 'Reported changes to Taiwan chip export licensing rules.' }],
  AVGO: [{ source: "Barron's", minutesAgo: 120, category: 'guidance', text: 'Management reiterates multi-year custom silicon backlog visibility.' }],
};

const GENERIC_TEMPLATES = [
  { category: 'analyst_action', text: 'Analyst raises price target on {T} citing margin trends.' },
  { category: 'analyst_action', text: 'Sell-side note trims {T} rating on valuation concerns.' },
  { category: 'guidance', text: '{T} reiterates full-year guidance at investor conference.' },
  { category: 'guidance', text: '{T} management flags supply constraints on latest call.' },
  { category: 'regulatory', text: 'Regulatory filing flags a disclosure update for {T}.' },
  { category: 'earnings', text: '{T} beats consensus estimates on top line, mixed on margins.' },
  { category: 'M&A', text: '{T} explores strategic partnership options per sources.' },
  { category: 'other', text: '{T} trades in line with the broader sector move today.' },
];

function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickGenericTemplates(ticker, count) {
  const start = hashString(ticker) % GENERIC_TEMPLATES.length;
  const picked = [];
  for (let i = 0; i < count; i++) {
    picked.push(GENERIC_TEMPLATES[(start + i) % GENERIC_TEMPLATES.length]);
  }
  return picked;
}

function mockQuote(ticker, tick = 0) {
  const base = BASE_PRICES[ticker] ?? 100;
  const seed = hashString(ticker) + tick * 97;
  const wobble = (seededRandom(seed) - 0.5) * 0.06; // +/-3%
  const price = base * (1 + wobble);
  const changePct = wobble * 100;
  return { price: Number(price.toFixed(2)), changePct: Number(changePct.toFixed(2)) };
}

function mockHeadlines(ticker, tick = 0) {
  const curated = (CURATED_HEADLINES[ticker] ?? []).map((h) => ({ ...h, minutesAgo: h.minutesAgo + tick }));
  const genericCount = 3 - curated.length;
  const generic = pickGenericTemplates(ticker, Math.max(genericCount, 1)).map((tpl, i) => ({
    source: ['Bloomberg', 'CNBC', 'Reuters'][i % 3],
    minutesAgo: 30 + i * 45 + tick,
    category: tpl.category,
    text: tpl.text.replace('{T}', ticker),
  }));
  return [...curated, ...generic].slice(0, 3);
}

async function fetchQuote(ticker, tick = 0) {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) throw new Error(`quote ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    return mockQuote(ticker, tick);
  }
}

async function fetchHeadlines(ticker, tick = 0) {
  try {
    const res = await fetch(`/api/news?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) throw new Error(`news ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.length ? data : mockHeadlines(ticker, tick);
  } catch (e) {
    return mockHeadlines(ticker, tick);
  }
}
