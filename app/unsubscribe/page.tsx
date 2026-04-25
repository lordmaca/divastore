import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";

export const dynamic = "force-dynamic";

// One-click unsubscribe from marketing email. Linked from every marketing
// template's footer and the RFC 8058 List-Unsubscribe-Post header. The
// `?u=` parameter is `<customerId>.<hmac>` signed with AUTH_SECRET so a
// random attacker can't opt-out arbitrary customers by guessing ids.
//
// Transactional messages (order updates, password reset) keep sending —
// that's contract fulfillment, not marketing.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; cid?: string; done?: string }>;
}) {
  const params = await searchParams;
  // Legacy links emitted before the HMAC change carried `?cid=<id>`.
  // Those are silently rejected below — the user will see the "Link
  // inválido" panel and can either click the newest marketing email's
  // footer (which now carries a signed `u=` token) or send a request to
  // contato@. This is the correct behavior: the old format gave anyone
  // with a customer id the ability to opt them out.
  const rawToken = params.u ?? null;
  const customerId = verifyUnsubscribeToken(rawToken);
  const done = params.done === "1";

  async function optOut(formData: FormData) {
    "use server";
    const token = formData.get("u");
    const verifiedId = verifyUnsubscribeToken(typeof token === "string" ? token : null);
    if (verifiedId) {
      await prisma.customer.updateMany({
        where: { id: verifiedId },
        data: { marketingOptIn: false, marketingOptInAt: null },
      });
    }
    redirect("/unsubscribe?done=1");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-3xl p-8 text-center">
        {done ? (
          <>
            <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Pronto</h1>
            <p className="mt-4 text-sm text-[color:var(--foreground)]/75">
              Você não receberá mais e-mails promocionais. Avisos sobre seus pedidos continuam sendo enviados.
            </p>
          </>
        ) : customerId ? (
          <>
            <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
              Cancelar novidades
            </h1>
            <p className="mt-4 text-sm text-[color:var(--foreground)]/75">
              Confirme o cancelamento para parar de receber novidades e promoções por e-mail.
            </p>
            <form action={optOut} className="mt-6">
              <input type="hidden" name="u" value={rawToken ?? ""} />
              <button
                type="submit"
                className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
              >
                Confirmar cancelamento
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Link inválido</h1>
            <p className="mt-4 text-xs text-[color:var(--foreground)]/60">
              Use o botão no rodapé do último e-mail recebido. Se o problema persistir, escreva
              para contato@brilhodediva.com.br.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
