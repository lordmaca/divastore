import { revalidatePath } from "next/cache";

// Catalog-derived public surfaces — both regenerate from Product/Variant
// rows. Call after ANY mutation that changes what Google should see:
// product create/update/delete, stock changes, DivaHub inbound, hero
// slide tied to a product, etc.
//
// Cheap (just busts ISR), idempotent, safe in any execution context that
// can call next/cache. Errors are intentionally swallowed — a failed
// revalidate must never break the actual mutation that triggered it.
export function revalidateCatalogPublicSurfaces(): void {
  try {
    revalidatePath("/feeds/google.xml");
  } catch {
    /* never block the caller */
  }
  try {
    revalidatePath("/sitemap.xml");
  } catch {
    /* never block the caller */
  }
}
