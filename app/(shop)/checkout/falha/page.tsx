import Link from "next/link";

export default async function CheckoutFail({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="glass-card rounded-3xl p-10 text-center">
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Pagamento não concluído</h1>
        <p className="mt-3 text-[color:var(--foreground)]/75">
          Não recebemos a confirmação do seu pagamento{orderId ? ` para o pedido ${orderId.slice(0, 8)}` : ""}. Tente novamente ou escolha outra forma de pagamento.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link href="/carrinho" className="rounded-full bg-[color:var(--pink-500)] text-white font-medium px-6 py-3">
            Voltar ao carrinho
          </Link>
          <Link href="/loja" className="rounded-full bg-white/70 text-[color:var(--pink-600)] font-medium px-6 py-3 border border-white">
            Continuar comprando
          </Link>
        </div>
      </div>
    </main>
  );
}
