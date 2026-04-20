import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCartReadOnly, cartTotals } from "@/lib/cart";
import { mercadoPago } from "@/lib/integration/mp/client";
import { getSecret } from "@/lib/settings/config";
import { evaluateCoupon } from "@/lib/coupons";
import { getSetting } from "@/lib/settings";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { placeOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    coupon?: string;
    couponError?: string;
    error?: string;
  }>;
}) {
  const session = await auth();

  // Cart: logged-in → by customerId; guest → by cookie session.
  const cart = await getCartReadOnly(session?.user?.id ?? null);
  const { subtotalCents, itemCount } = cartTotals(cart);
  if (!cart || itemCount === 0) redirect("/carrinho");

  if (!(await mercadoPago.isEnabled())) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="glass-card rounded-3xl p-10 text-center">
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
            Pagamentos temporariamente indisponíveis
          </h1>
          <p className="mt-4 text-[color:var(--foreground)]/75">
            Estamos terminando a configuração do nosso meio de pagamento. Volte em instantes — seu carrinho fica salvo.
          </p>
        </div>
      </main>
    );
  }

  const { coupon: couponParam, couponError, error } = await searchParams;
  const couponEval = couponParam ? await evaluateCoupon(couponParam, subtotalCents) : null;
  const freeThreshold = await getSetting("shipping.freeThresholdCents");

  // Pre-fill address fields from the customer's default address so repeat
  // buyers don't retype it. Anonymous buyers still start with a blank form.
  const defaultAddress = session?.user?.id
    ? await prisma.address.findFirst({
        where: { customerId: session.user.id },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: {
          recipient: true,
          cep: true,
          street: true,
          number: true,
          complement: true,
          district: true,
          city: true,
          state: true,
        },
      })
    : null;

  // CPF is required for NF-e + ME label. Prefill from the customer record
  // when available; skip the field entirely for logged-in buyers who already
  // have one stored (the action reads it server-side).
  const customer = session?.user?.id
    ? await prisma.customer.findUnique({
        where: { id: session.user.id },
        select: { cpf: true },
      })
    : null;
  const hasStoredCpf = Boolean(customer?.cpf);

  // Show the "Modo demo" banner only when the MP token is a sandbox token
  // (starts with TEST-). Production tokens are APP_USR-prefixed.
  const mpToken = await getSecret("mp.accessToken");
  const demoMode = Boolean(mpToken?.startsWith("TEST-"));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-4xl text-[color:var(--pink-600)] mb-4">Checkout</h1>
      {error === "existing" ? (
        <p className="mb-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          Esse e-mail já tem cadastro. Entre com sua senha para continuar.
        </p>
      ) : error === "invalid_shipping" || error === "invalid_payment" || error === "invalid" ? (
        <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          Confira os dados do pedido e tente novamente.
        </p>
      ) : error === "invalid_cpf" ? (
        <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          CPF inválido. Informe um CPF válido para emitir a nota fiscal.
        </p>
      ) : error === "cpf_conflict" ? (
        <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          Este CPF já está associado a outra conta. Entre com a conta correspondente ou use outro CPF.
        </p>
      ) : error === "payments_unavailable" ? (
        <p className="mb-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          Pagamentos temporariamente indisponíveis.
        </p>
      ) : null}

      <CheckoutForm
        action={placeOrder}
        loggedIn={Boolean(session?.user)}
        needsCpf={!hasStoredCpf}
        defaultRecipient={defaultAddress?.recipient ?? session?.user?.name ?? ""}
        defaultAddress={
          defaultAddress
            ? {
                cep: `${defaultAddress.cep.slice(0, 5)}-${defaultAddress.cep.slice(5)}`,
                street: defaultAddress.street,
                number: defaultAddress.number,
                complement: defaultAddress.complement ?? "",
                district: defaultAddress.district,
                city: defaultAddress.city,
                state: defaultAddress.state,
              }
            : null
        }
        cartItems={cart.items.map((it) => ({
          id: it.id,
          variantId: it.variantId,
          qty: it.qty,
          unitPriceCents: it.variant.priceCents,
          name: `${it.variant.product.name}${it.variant.name ? " — " + it.variant.name : ""}`,
        }))}
        subtotalCents={subtotalCents}
        freeShippingThresholdCents={freeThreshold.cents}
        initialCoupon={couponParam ?? ""}
        couponOk={couponEval?.ok ? { code: couponEval.code, discountCents: couponEval.discountCents } : undefined}
        couponError={couponEval && !couponEval.ok ? couponEval.reason : couponError ?? null}
        demoMode={demoMode}
      />
    </main>
  );
}
