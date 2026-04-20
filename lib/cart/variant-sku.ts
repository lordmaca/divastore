// Variant SKU parsing for the DivaHub DM deep-link contract.
// See docs/api/divahub-dm-cart-deeplink.md §2.1.
//
// Accepted shapes:
//   DIVA-NNNNNN-T<VALUE>   — ring size axis. Value is 15..25 or REG.
//   DIVA-NNNNNN-M<VALUE>   — material axis. Value is DOURADO, PRATEADO,
//                             ROSEGOLD, GRAFITE (uppercased, no spaces).
//
// Anything not matching falls through to slug-based resolution.

const SKU_RE = /^DIVA-\d{6}-([TM])([A-Z0-9]+)$/;

export type ParsedVariantSku = {
  full: string;
  axis: "tamanho" | "material";
  value: string;
  /** Human-friendly label, e.g. "Tamanho 17", "Acabamento Dourado". */
  label: string;
};

export function parseVariantSku(token: string): ParsedVariantSku | null {
  const m = SKU_RE.exec(token);
  if (!m) return null;
  const prefix = m[1];
  const rawValue = m[2];
  if (prefix === "T") {
    return {
      full: token,
      axis: "tamanho",
      value: rawValue,
      label: formatSizeLabel(rawValue),
    };
  }
  return {
    full: token,
    axis: "material",
    value: rawValue,
    label: formatMaterialLabel(rawValue),
  };
}

export function looksLikeVariantSku(token: string): boolean {
  return SKU_RE.test(token);
}

function formatSizeLabel(v: string): string {
  if (v === "REG") return "Regulável";
  // Numeric sizes (15..25).
  return `Tamanho ${v}`;
}

function formatMaterialLabel(v: string): string {
  const pretty: Record<string, string> = {
    DOURADO: "Acabamento Dourado",
    PRATEADO: "Acabamento Prateado",
    ROSEGOLD: "Acabamento Rosé Gold",
    GRAFITE: "Acabamento Grafite",
  };
  return pretty[v] ?? `Acabamento ${v.charAt(0) + v.slice(1).toLowerCase()}`;
}

// Maps an existing variant's `attributes` JSON into a user-facing label
// based on the axis keys DivaHub emits (`tamanho` / `material`). Used
// by the PDP picker so we can say "Tamanho 17" instead of the raw
// variant name when DivaHub pushed the product.
export function variantAxisLabel(
  attributes: Record<string, unknown> | null | undefined,
): { axis: "tamanho" | "material" | null; value: string | null; label: string | null } {
  if (!attributes || typeof attributes !== "object") {
    return { axis: null, value: null, label: null };
  }
  const tamanho = typeof attributes.tamanho === "string" ? attributes.tamanho : null;
  if (tamanho) {
    const v = tamanho.toUpperCase();
    return {
      axis: "tamanho",
      value: v,
      label: formatSizeLabel(v),
    };
  }
  const material = typeof attributes.material === "string" ? attributes.material : null;
  if (material) {
    const v = material.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return {
      axis: "material",
      value: v,
      label: formatMaterialLabel(v),
    };
  }
  return { axis: null, value: null, label: null };
}
