import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCartReadOnly, cartTotals } from "@/lib/cart";
import { CartItemRow } from "@/components/CartItemRow";
import { CartShippingPreview } from "@/components/CartShippingPreview";
import { DeepLinkToast } from "@/components/DeepLinkToast";
import { getSetting } from "@/lib/settings";
import { formatBRL } from "@/lib/money";

export const dynamic = "force-dynamic";

// DivaHub DM deep link contract (see docs/api/divahub-dm-cart-deeplink.md):
//   /carrinho?add=<slug>&add=<slug>&cartRef=<uuid>&utm_source=divahub_dm&...
// The `add` params are processed once, then we 307-redirect to the same
// URL minus `add` so a refresh doesn't double-add. `cartRef` + `utm_*`
// survive the redirect so downstream analytics + checkout attribution
// still fire.
export default async function CarrinhoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // DivaHub DM deep-link: delegate to the route handler which is allowed
  // to write cookies (dh_cart_ref) and call ensureCartWritable. The
  // handler redirects back to /carrinho with `add` stripped + a toast code.
  if (sp.add) {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
      else if (typeof v === "string") out.append(k, v);
    }
    redirect(`/api/cart/deep-link?${out.toString()}`);
  }

  const session = await auth();
  const cart = await getCartReadOnly(session?.user?.id ?? null);
  const { subtotalCents, itemCount } = cartTotals(cart);
  const freeThreshold = await getSetting("shipping.freeThresholdCents");

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <DeepLinkToast />
      <h1 className="font-display text-4xl text-[color:var(--pink-600)] mb-8">Seu carrinho</h1>

      {itemCount === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="text-[color:var(--foreground)]/70 mb-6">Seu carrinho está vazio.</p>
          <Link
            href="/loja"
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-8 py-3"
          >
            Explorar a coleção
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-3">
            {cart!.items.map((it) => (
              <CartItemRow
                key={it.id}
                id={it.id}
                qty={it.qty}
                productSlug={it.variant.product.slug}
                productName={it.variant.product.name}
                variantLabel={it.variant.name}
                unitPriceCents={it.variant.priceCents}
                imageUrl={it.variant.product.images[0]?.url}
              />
            ))}
          </div>

          <aside className="glass-card rounded-2xl p-6 h-fit space-y-4">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatBRL(subtotalCents)}</span>
            </div>
            <div className="border-t border-white/70 pt-3">
              <CartShippingPreview
                items={cart!.items.map((it) => ({ variantId: it.variantId, qty: it.qty }))}
                freeThresholdCents={freeThreshold.cents}
                subtotalCents={subtotalCents}
              />
            </div>
            <div className="border-t border-white/70 pt-4 flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span className="text-[color:var(--pink-600)]">{formatBRL(subtotalCents)}</span>
            </div>
            <p className="text-xs text-[color:var(--foreground)]/60 text-center">
              Frete final calculado no checkout.
            </p>
            <Link
              href="/checkout"
              className="block text-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3 transition-colors"
            >
              Finalizar compra
            </Link>
            <Link href="/loja" className="block text-center text-sm text-[color:var(--foreground)]/70 hover:text-[color:var(--pink-600)]">
              Continuar comprando
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
