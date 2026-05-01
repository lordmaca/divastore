import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trocas e Devoluções · Brilho de Diva",
  description:
    "Direito de arrependimento de 7 dias e garantia de 90 dias para defeito. Veja como solicitar troca ou devolução de joias compradas no site Brilho de Diva.",
  alternates: { canonical: `${SITE_URL}/trocas-e-devolucoes` },
  openGraph: {
    title: "Trocas e Devoluções · Brilho de Diva",
    description:
      "7 dias de arrependimento e 90 dias de garantia para defeito.",
    url: `${SITE_URL}/trocas-e-devolucoes`,
    type: "website",
  },
};

export default async function TrocasEDevolucoesPage() {
  // Pull contact info from the about-page setting so we don't duplicate it.
  // Falls back gracefully if the admin hasn't filled the contact block.
  const about = await getSetting("about.page");
  const supportEmail = about.contact.email || "contato@brilhodediva.com.br";
  const whatsapp = about.contact.whatsapp;

  const updatedAt = "30 de abril de 2026";

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14 space-y-10">
      <header className="text-center space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--pink-500)]">
          Brilho de Diva
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-[color:var(--pink-600)]">
          Trocas e Devoluções
        </h1>
        <p className="text-sm text-[color:var(--foreground)]/65">
          Atualizado em {updatedAt}
        </p>
      </header>

      <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-3">
        <p className="text-[color:var(--foreground)]/85 leading-relaxed">
          Esperamos que cada peça da Brilho de Diva chegue do jeitinho que você
          imaginou. Quando algo não sair como o esperado, a gente facilita —
          aqui está exatamente o que vale, em que prazo, e como pedir.
        </p>
        <p className="text-sm text-[color:var(--foreground)]/65 leading-relaxed">
          Esta política segue o Código de Defesa do Consumidor (Lei 8.078/1990,
          arts. 18, 26 e 49) e se aplica a todas as compras feitas pelo site{" "}
          <Link href="/" className="text-[color:var(--pink-600)] hover:underline">
            loja.brilhodediva.com.br
          </Link>
          .
        </p>
      </section>

      {/* Section 1 — Right of regret (7 days, any reason) */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          1. Direito de arrependimento — 7 dias
        </h2>
        <p className="text-[color:var(--foreground)]/85 leading-relaxed">
          Você tem <strong>7 dias corridos</strong>, contados a partir do dia
          em que recebeu o pedido, para desistir da compra <strong>por
          qualquer motivo</strong> — não gostou, mudou de ideia, não combinou
          com você. Esse direito vale pra qualquer compra feita pela internet
          (CDC, art. 49) e independe de defeito.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>O reembolso é integral, incluindo o valor do frete pago.</li>
          <li>
            A peça precisa voltar <strong>nas mesmas condições em que foi
            recebida</strong>: sem uso, sem riscos, com etiqueta, embalagem
            original e todos os acessórios (saquinho, brinde, cartão de
            garantia). Peças que voltarem visivelmente usadas, com cheiro de
            perfume, com riscos ou marcas de pele perdem o direito ao
            arrependimento.
          </li>
          <li>
            O frete de retorno é <strong>por nossa conta</strong> — geramos
            uma etiqueta dos Correios e te enviamos por e-mail.
          </li>
        </ul>
      </section>

      {/* Section 2 — Defective products (90 days, durable goods) */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          2. Produto com defeito — 90 dias
        </h2>
        <p className="text-[color:var(--foreground)]/85 leading-relaxed">
          Joias e semi-joias são produtos duráveis, então o prazo legal pra
          reclamar de qualquer <strong>vício de fabricação</strong> é de{" "}
          <strong>90 dias</strong> a partir do recebimento (CDC, art. 26, II).
          Entram nesse caso:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>Peça enviada com defeito, parte solta ou pingente faltando.</li>
          <li>
            Banho que descasca/escurece dentro do prazo, sem uso indevido
            (entenda o que é uso indevido na seção 5).
          </li>
          <li>Peça quebrada na bolsa de envio (embalagem original violada).</li>
          <li>Tamanho ou cor diferente do que foi mostrado na página do produto.</li>
        </ul>
        <p className="text-[color:var(--foreground)]/85 leading-relaxed">
          Nesses casos, a primeira opção é <strong>troca pela mesma peça</strong>{" "}
          (ou outra de valor equivalente). Se não tivermos estoque ou se você
          preferir, fazemos o reembolso integral.
        </p>
      </section>

      {/* Section 3 — How to request */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          3. Como solicitar
        </h2>
        <ol className="list-decimal pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>
            Mande um e-mail para{" "}
            <a
              href={`mailto:${supportEmail}`}
              className="text-[color:var(--pink-600)] hover:underline"
            >
              {supportEmail}
            </a>
            {whatsapp ? (
              <>
                {" "}ou nos chame no WhatsApp{" "}
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--pink-600)] hover:underline"
                >
                  ({whatsapp})
                </a>
              </>
            ) : null}
            .
          </li>
          <li>
            Inclua o <strong>número do pedido</strong>, qual peça quer trocar
            ou devolver e o motivo (arrependimento ou defeito).
          </li>
          <li>
            Se for defeito, anexe <strong>2 ou 3 fotos</strong> mostrando o
            problema. Isso acelera bastante a aprovação.
          </li>
          <li>
            Em até <strong>2 dias úteis</strong> respondemos com a etiqueta
            dos Correios para postagem.
          </li>
        </ol>
      </section>

      {/* Section 4 — How to ship back */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          4. Como devolver a peça
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>
            Embale a peça <strong>na embalagem original</strong> com a nota
            fiscal dentro e o saquinho/brinde, se houver.
          </li>
          <li>
            Cole a etiqueta dos Correios que enviamos, leve em qualquer
            agência e <strong>guarde o comprovante de postagem</strong>.
          </li>
          <li>
            Assim que recebermos, conferimos a peça e te avisamos por e-mail
            (até 3 dias úteis após o recebimento).
          </li>
        </ul>
      </section>

      {/* Section 5 — Refund timing */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          5. Prazo do reembolso
        </h2>
        <p className="text-[color:var(--foreground)]/85 leading-relaxed">
          Após a aprovação, o reembolso é feito no <strong>mesmo meio de
          pagamento</strong> usado na compra:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>
            <strong>Pix:</strong> até 3 dias úteis na sua conta.
          </li>
          <li>
            <strong>Cartão de crédito:</strong> o estorno é solicitado na hora,
            mas a aparição na fatura depende da operadora — costuma cair na
            próxima ou na fatura seguinte (até 30 dias).
          </li>
          <li>
            <strong>Boleto:</strong> até 7 dias úteis via Pix na conta que você
            indicar.
          </li>
        </ul>
      </section>

      {/* Section 6 — What's NOT covered */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          6. O que não está coberto
        </h2>
        <p className="text-[color:var(--foreground)]/85 leading-relaxed">
          Algumas situações fogem da troca/devolução por causa da natureza da
          peça ou pelo uso. Tentamos ser sempre justas, mas vale destacar:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>
            <strong>Mau uso:</strong> banho na piscina, ducha, mar, perfume e
            cremes em contato direto comprometem o brilho e o banho. Banho
            descascando por uso indevido não é considerado defeito.
          </li>
          <li>
            <strong>Peças personalizadas</strong> (gravação, sob encomenda):
            não aceitamos arrependimento, salvo se o defeito for de fabricação.
          </li>
          <li>
            <strong>Peças visivelmente usadas</strong> ou com sinais de
            tentativa de ajuste/conserto fora da Brilho de Diva.
          </li>
          <li>
            Reclamações fora dos prazos legais (7 dias para arrependimento, 90
            dias para defeito a partir do recebimento).
          </li>
        </ul>
      </section>

      {/* Section 7 — Cuidados / care */}
      <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-3">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
          Cuidados que prolongam a vida da peça
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-[color:var(--foreground)]/85">
          <li>Tire a joia para tomar banho, dormir, dar ducha ou nadar.</li>
          <li>
            Aplique perfume e creme <strong>antes</strong> de colocar a peça,
            nunca depois.
          </li>
          <li>
            Guarde separada de outras joias (idealmente no saquinho original)
            para evitar riscos.
          </li>
          <li>Limpe ocasionalmente com pano macio e seco — sem álcool.</li>
        </ul>
      </section>

      {/* CTA / contact */}
      <section className="text-center space-y-3 py-2">
        <p className="text-[color:var(--foreground)]/85">
          Qualquer dúvida, fala com a gente —{" "}
          <a
            href={`mailto:${supportEmail}`}
            className="text-[color:var(--pink-600)] hover:underline font-medium"
          >
            {supportEmail}
          </a>
          {whatsapp ? (
            <>
              {" "}ou{" "}
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:var(--pink-600)] hover:underline font-medium"
              >
                WhatsApp
              </a>
            </>
          ) : null}
          . A gente responde rapidinho ✨
        </p>
        <p className="pt-2">
          <Link
            href="/loja"
            className="text-[color:var(--pink-600)] hover:underline text-sm font-medium"
          >
            Voltar para a loja →
          </Link>
        </p>
      </section>
    </main>
  );
}
