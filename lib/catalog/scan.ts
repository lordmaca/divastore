import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { CategoryIssueStatus } from "@/lib/generated/prisma/enums";
import { getSetting } from "@/lib/settings";
import { classifyProductName, type ClassifyResult } from "./category-classifier";
import type { CategoryRuleSet } from "./defaults";

// Resolves category slugs to ids once per scan pass — the map stays stable
// while we iterate products, so we amortize the lookup instead of hitting
// the DB per product.
async function loadCategoryIndex(): Promise<Map<string, string>> {
  const rows = await prisma.category.findMany({ select: { id: true, slug: true } });
  return new Map(rows.map((r) => [r.slug, r.id]));
}

export type ScanOutcome =
  | { action: "unchanged" }                                   // already correct, no issue
  | { action: "resolved"; issueId: string }                   // previous issue resolved (name changed, already correct now)
  | { action: "opened"; issueId: string; confidence: "high" | "medium" | "low" }
  | { action: "auto_applied"; issueId: string; from: string | null; to: string }
  | { action: "skipped_no_suggestion" };

export async function scanProduct(productId: string, opts: { dryRun?: boolean } = {}): Promise<ScanOutcome> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, categoryId: true, category: { select: { slug: true } } },
  });
  if (!product) return { action: "unchanged" };

  const rules = (await getSetting("catalog.categoryRules")) as CategoryRuleSet;
  const autoApply = (await getSetting("catalog.autoApplyHighConfidence")).enabled;

  const result = classifyProductName(product.name, rules);

  // No actionable suggestion (name matches nothing, or is already in the
  // suggested category). Resolve any previously-open issue for this product.
  if (!result.suggestedSlug) {
    await maybeResolveExistingIssue(product.id);
    return { action: "skipped_no_suggestion" };
  }

  // Already in the right place — clean up any stale open issue.
  if (result.suggestedSlug === product.category?.slug) {
    const resolved = await maybeResolveExistingIssue(product.id);
    return resolved
      ? { action: "resolved", issueId: resolved.id }
      : { action: "unchanged" };
  }

  const index = await loadCategoryIndex();
  const suggestedCategoryId = index.get(result.suggestedSlug) ?? null;
  if (!suggestedCategoryId) {
    // Rule mentions a slug that doesn't exist as a Category row. Don't
    // surface as an issue — it's a config drift, not a product problem.
    await maybeResolveExistingIssue(product.id);
    return { action: "skipped_no_suggestion" };
  }

  // High-confidence + auto-apply ON → move the product, mark AUTO_APPLIED.
  if (result.confidence === "high" && autoApply && !opts.dryRun) {
    const previousCategoryId = product.categoryId;
    const confidenceStr: string = result.confidence;
    const issue = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: { categoryId: suggestedCategoryId },
      });
      return tx.categoryAuditIssue.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          currentCategoryId: previousCategoryId ?? null,
          suggestedCategoryId,
          confidence: confidenceStr,
          evidence: evidenceFor(result) as Prisma.InputJsonValue,
          status: CategoryIssueStatus.AUTO_APPLIED,
          resolvedBy: "cron:category-scan",
          resolvedAt: new Date(),
        },
        update: {
          currentCategoryId: previousCategoryId ?? null,
          suggestedCategoryId,
          confidence: confidenceStr,
          evidence: evidenceFor(result) as Prisma.InputJsonValue,
          status: CategoryIssueStatus.AUTO_APPLIED,
          resolvedBy: "cron:category-scan",
          resolvedAt: new Date(),
          dismissalReason: null,
        },
      });
    });
    return {
      action: "auto_applied",
      issueId: issue.id,
      from: previousCategoryId,
      to: suggestedCategoryId,
    };
  }

  // Otherwise upsert an OPEN issue for admin review.
  const issue = await prisma.categoryAuditIssue.upsert({
    where: { productId: product.id },
    create: {
      productId: product.id,
      currentCategoryId: product.categoryId,
      suggestedCategoryId,
      confidence: result.confidence ?? "low",
      evidence: evidenceFor(result) as Prisma.InputJsonValue,
      status: CategoryIssueStatus.OPEN,
    },
    update: {
      // Only reopen when the previous state was already OPEN — don't
      // re-open something the admin actively dismissed just because the
      // product name still matches the same rule.
      currentCategoryId: product.categoryId,
      suggestedCategoryId,
      confidence: result.confidence ?? "low",
      evidence: evidenceFor(result) as Prisma.InputJsonValue,
    },
  });
  return {
    action: "opened",
    issueId: issue.id,
    confidence: (result.confidence ?? "low") as "high" | "medium" | "low",
  };
}

async function maybeResolveExistingIssue(productId: string) {
  const existing = await prisma.categoryAuditIssue.findUnique({
    where: { productId },
  });
  if (!existing) return null;
  if (existing.status !== CategoryIssueStatus.OPEN) return null;
  return prisma.categoryAuditIssue.update({
    where: { productId },
    data: {
      status: CategoryIssueStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedBy: "cron:category-scan",
    },
  });
}

function evidenceFor(result: ClassifyResult) {
  return {
    score: result.score,
    secondBest: result.secondBest,
    matches: result.matches,
  };
}

export async function scanAllProducts(opts: { dryRun?: boolean } = {}): Promise<{
  scanned: number;
  opened: number;
  autoApplied: number;
  resolved: number;
  skipped: number;
}> {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let opened = 0;
  let autoApplied = 0;
  let resolved = 0;
  let skipped = 0;
  for (const p of products) {
    try {
      const r = await scanProduct(p.id, opts);
      if (r.action === "opened") opened++;
      else if (r.action === "auto_applied") autoApplied++;
      else if (r.action === "resolved") resolved++;
      else skipped++;
    } catch (err) {
      console.error(`[category-scan] product ${p.id} failed`, err);
    }
  }

  await prisma.integrationRun.create({
    data: {
      adapter: "catalog",
      operation: opts.dryRun ? "category.scan.dry" : "category.scan",
      status: "ok",
      payload: { scanned: products.length, opened, autoApplied, resolved, skipped },
    },
  });

  return { scanned: products.length, opened, autoApplied, resolved, skipped };
}

// Apply every OPEN, high-confidence issue in one pass. Used by the admin
// bulk button and the CLI. Returns the count applied.
export async function applyAllHighConfidenceIssues(actor: string): Promise<number> {
  const issues = await prisma.categoryAuditIssue.findMany({
    where: { status: CategoryIssueStatus.OPEN, confidence: "high" },
    select: { id: true, productId: true, suggestedCategoryId: true },
  });
  let applied = 0;
  for (const i of issues) {
    if (!i.suggestedCategoryId) continue;
    await prisma.$transaction([
      prisma.product.update({
        where: { id: i.productId },
        data: { categoryId: i.suggestedCategoryId },
      }),
      prisma.categoryAuditIssue.update({
        where: { id: i.id },
        data: {
          status: CategoryIssueStatus.AUTO_APPLIED,
          resolvedAt: new Date(),
          resolvedBy: actor,
        },
      }),
    ]);
    applied++;
  }
  return applied;
}
