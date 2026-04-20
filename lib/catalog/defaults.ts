// Default rule registry for the name-driven category classifier. Seeds
// `catalog.categoryRules` on first read when the setting is empty. Admins
// can edit the JSON at /admin/configuracoes without redeploying — this
// file is just the "what ship out of the box" baseline.
//
// Patterns are pt-BR jewelry terms. Weight reflects how specific the
// signal is (exact jewelry-type word = 10, softer synonyms = 6-8).
// `excludeFromSuggestions` lists categories we will NEVER push a product
// into. Useful for catch-all buckets (Beleza) and sandbox slugs (Testes).

export type CategoryRulePattern = {
  regex: string;      // RegExp source (no flags — compiled with `iu`)
  weight: number;
};

export type CategoryRule = {
  categorySlug: string;
  patterns: CategoryRulePattern[];
};

export type CategoryRuleSet = {
  rules: CategoryRule[];
  excludeFromSuggestions: string[];
  minScoreToSuggest: number;
  confidence: {
    high: number;      // gap between best and second-best >= this → "high"
    medium: number;    // gap >= this → "medium"; below → "low"
  };
};

export const DEFAULT_CATEGORY_RULES: CategoryRuleSet = {
  rules: [
    {
      categorySlug: "colares",
      patterns: [
        { regex: "\\bcolar(es)?\\b", weight: 10 },
        { regex: "\\bgargantilha(s)?\\b", weight: 10 },
        { regex: "\\bchoker(s)?\\b", weight: 10 },
        { regex: "\\bcorrent(e|es|aria)\\b", weight: 8 },
        { regex: "\\bpingente\\b", weight: 4 },
      ],
    },
    {
      categorySlug: "brincos",
      patterns: [
        { regex: "\\bbrincos?\\b", weight: 10 },
        { regex: "\\bargola(s)?\\b", weight: 7 },
        { regex: "\\bear ?cuff\\b", weight: 8 },
        { regex: "\\bpendente(s)?\\b", weight: 3 },
      ],
    },
    {
      categorySlug: "aneis",
      patterns: [
        { regex: "\\ban[eé](l|is|es)\\b", weight: 10 },
        { regex: "\\balian[çc]a(s)?\\b", weight: 9 },
        { regex: "\\bsolit[aá]rio(s)?\\b", weight: 8 },
      ],
    },
    {
      categorySlug: "pulseiras",
      patterns: [
        { regex: "\\bpulseira(s)?\\b", weight: 10 },
        { regex: "\\bbracelete(s)?\\b", weight: 9 },
        { regex: "\\bbangle(s)?\\b", weight: 8 },
        { regex: "\\btornozeleira(s)?\\b", weight: 9 },
      ],
    },
  ],
  // Never push anything into these. Beleza stays the catch-all for
  // products whose name matches nothing; Testes is the sandbox bucket.
  excludeFromSuggestions: ["beleza", "testes"],
  minScoreToSuggest: 6,
  confidence: {
    high: 8,
    medium: 4,
  },
};
