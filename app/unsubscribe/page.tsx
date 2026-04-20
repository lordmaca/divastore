import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// One-click unsubscribe from marketing email. Linked from every marketing
// template's footer and the RFC 8058 List-Unsubscribe-Post header.
// Transactional messages (order updates, password reset) keep sending —
// that's contract fulfillment, not marketing.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string; done?: string }>;
}) {
  const { cid, done } = await searchParams;

  async function optOut(formData: FormData) {
    "use server";
    const customerId = formData.get("cid");
    if (typeof customerId === "string" && customerId) {
      await prisma.customer.updateMany({
        where: { id: customerId },
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
        ) : cid ? (
          <>
            <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
              Cancelar novidades
            </h1>
            <p className="mt-4 text-sm text-[color:var(--foreground)]/75">
              Confirme o cancelamento para parar de receber novidades e promoções por e-mail.
            </p>
            <form action={optOut} className="mt-6">
              <input type="hidden" name="cid" value={cid} />
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
              Use o botão no rodapé do último e-mail recebido.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
