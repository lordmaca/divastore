import type { CategoryRuleSet, CategoryRulePattern } from "./defaults";

export type ClassifyMatch = {
  categorySlug: string;
  pattern: string;
  weight: number;
};

export type ClassifyResult = {
  suggestedSlug: string | null;
  confidence: "high" | "medium" | "low" | null;
  score: number;
  secondBest: { slug: string; score: number } | null;
  matches: ClassifyMatch[];
};

// Pure classifier. Runs every rule pattern against the product name and
// ranks categories by total matched weight. Highest-scoring category wins
// provided it clears `minScoreToSuggest` and is not in
// `excludeFromSuggestions`. Confidence is derived from the score gap
// between the winner and the runner-up.
//
// Stateless + deterministic — same inputs always produce the same output,
// which makes the evidence we store on CategoryAuditIssue directly
// reproducible by admins inspecting the row.
export function classifyProductName(
  name: string,
  rules: CategoryRuleSet,
): ClassifyResult {
  const normalized = name.toLowerCase();

  const scoreBySlug = new Map<string, number>();
  const matchesBySlug = new Map<string, ClassifyMatch[]>();

  for (const rule of rules.rules) {
    if (rules.excludeFromSuggestions.includes(rule.categorySlug)) continue;
    let total = 0;
    const localMatches: ClassifyMatch[] = [];
    for (const pat of rule.patterns) {
      if (testPattern(pat, normalized)) {
        total += pat.weight;
        localMatches.push({
          categorySlug: rule.categorySlug,
          pattern: pat.regex,
          weight: pat.weight,
        });
      }
    }
    if (total > 0) {
      scoreBySlug.set(rule.categorySlug, total);
      matchesBySlug.set(rule.categorySlug, localMatches);
    }
  }

  const ranked = [...scoreBySlug.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1];

  if (!best || best[1] < rules.minScoreToSuggest) {
    return {
      suggestedSlug: null,
      confidence: null,
      score: best?.[1] ?? 0,
      secondBest: second ? { slug: second[0], score: second[1] } : null,
      matches: [],
    };
  }

  const gap = best[1] - (second?.[1] ?? 0);
  const confidence: "high" | "medium" | "low" =
    gap >= rules.confidence.high
      ? "high"
      : gap >= rules.confidence.medium
        ? "medium"
        : "low";

  return {
    suggestedSlug: best[0],
    confidence,
    score: best[1],
    secondBest: second ? { slug: second[0], score: second[1] } : null,
    matches: matchesBySlug.get(best[0]) ?? [],
  };
}

// Compiled-regex cache keyed on the raw source. Avoids re-compiling the
// same patterns on every scan iteration when the ruleset stays stable.
const regexCache = new Map<string, RegExp>();

function testPattern(p: CategoryRulePattern, text: string): boolean {
  let re = regexCache.get(p.regex);
  if (!re) {
    try {
      re = new RegExp(p.regex, "iu");
      regexCache.set(p.regex, re);
    } catch {
      // Malformed regex from admin-edited settings — ignore, don't crash.
      return false;
    }
  }
  return re.test(text);
}
