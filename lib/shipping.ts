import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { melhorEnvio } from "@/lib/integration/shipping/melhorenvio/provider";
import type { ShippingOption, ShippingQuoteInput } from "@/lib/integration/types";
import { normalizeCep } from "@/lib/address";

// Compose a quote request from the cart (variantIds + qty). Unknown dims fall
// back to `shipping.defaultPackage`. Today we ship everything as one package
// per line — good enough for jewelry. Can be split later if we introduce
// per-variant packaging rules.
export async function quoteForVariants(
  toCep: string,
  variantRequests: Array<{ variantId: string; qty: number }>,
): Promise<{ options: ShippingOption[]; warnings: string[] }> {
  const warnings: string[] = [];
  const [origin, defaultPkg, carriersAllowed, insuranceOn] = await Promise.all([
    getSetting("shipping.origin"),
    getSetting("shipping.defaultPackage"),
    getSetting("shipping.carriersAllowed"),
    getSetting("shipping.insuranceOn"),
  ]);
  if (!origin.cep || normalizeCep(origin.cep).length !== 8) {
    warnings.push("origin_cep_missing");
    return { options: [], warnings };
  }

  const variantIds = variantRequests.map((r) => r.variantId);
  const variants = await prisma.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, priceCents: true, weightG: true, widthCm: true, heightCm: true, lengthCm: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let insuranceValueCents = 0;
  const packages: ShippingQuoteInput["packages"] = [];
  for (const r of variantRequests) {
    const v = byId.get(r.variantId);
    if (!v) {
      warnings.push(`variant_missing:${r.variantId}`);
      continue;
    }
    packages.push({
      widthCm: v.widthCm ?? defaultPkg.widthCm,
      heightCm: v.heightCm ?? defaultPkg.heightCm,
      lengthCm: v.lengthCm ?? defaultPkg.lengthCm,
      weightG: v.weightG ?? defaultPkg.weightG,
      quantity: r.qty,
    });
    insuranceValueCents += v.priceCents * r.qty;
  }
  if (packages.length === 0) return { options: [], warnings };

  const options = await melhorEnvio.quote({
    fromCep: normalizeCep(origin.cep),
    toCep: normalizeCep(toCep),
    packages,
    insuranceValueCents: insuranceOn.enabled ? insuranceValueCents : 0,
  });

  const allowed = new Set(carriersAllowed.serviceIds ?? []);
  const filtered = allowed.size === 0
    ? options
    : options.filter((o) => allowed.has(o.serviceId));
  return { options: filtered, warnings };
}
