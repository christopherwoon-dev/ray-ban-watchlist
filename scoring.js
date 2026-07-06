// Catalyst scoring — decides which headline to surface per ticker and
// whether it earns the "CATALYST" tag. Mirrors the conviction-scoring
// spirit of the swing-trade-architect / daily-catalyst-scanner skills
// (category weight + recency + real-move confirmation) rather than
// inventing a separate ranking system.

const CATEGORY_WEIGHT = {
  earnings: 1.0,
  guidance: 0.85,
  'M&A': 0.95,
  regulatory: 0.75,
  analyst_action: 0.55,
  other: 0.25,
};

const CATALYST_THRESHOLD = 0.5;
const RECENCY_HALF_LIFE_MIN = 90;
const REAL_MOVE_PCT = 1.5;

function recencyDecay(minutesAgo, halfLife = RECENCY_HALF_LIFE_MIN) {
  return Math.pow(0.5, minutesAgo / halfLife);
}

function scoreArticle(article, priceChangePct) {
  const catWeight = CATEGORY_WEIGHT[article.category] ?? CATEGORY_WEIGHT.other;
  const decay = recencyDecay(article.minutesAgo);
  const isRealMove = Math.abs(priceChangePct) >= REAL_MOVE_PCT;
  return catWeight * decay * (isRealMove ? 1.25 : 1.0);
}

// Returns articles sorted best-first, each annotated with `score` and `top`.
function rankArticles(articles, priceChangePct) {
  return articles
    .map((a) => ({ ...a, score: scoreArticle(a, priceChangePct) }))
    .sort((a, b) => b.score - a.score)
    .map((a, i) => ({ ...a, top: i === 0 }));
}

function shouldTagCatalyst(rankedArticles) {
  return rankedArticles.length > 0 && rankedArticles[0].score >= CATALYST_THRESHOLD;
}
