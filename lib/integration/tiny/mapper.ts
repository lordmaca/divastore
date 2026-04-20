import type { OrderPayload } from "../types";

// Map a storefront OrderPayload into the Tiny v2 `pedido` shape.
// Field names match Tiny's API spec (Portuguese, snake-ish).
//
// SKU is the canonical linking key across Storefront ↔ DivaHub ↔ Tiny:
//   - Storefront: Variant.sku (unique site-wide).
//   - DivaHub:    pushes variants by SKU; upsert preserves the linkage.
//   - Tiny:       pedido.itens[i].codigo MUST equal the SKU so Tiny matches
//                 an existing produto (created by DivaHub or by the admin).
// If the SKU doesn't exist in Tiny, Tiny creates a new produto for it — which
// is fine for admin-only items, and avoidable for DivaHub items by publishing
// to Tiny first. Never mutate SKUs after creation.
export function toTinyPedido(o: OrderPayload) {
  return {
    numero_ecommerce: `BD-${o.number}`,
    data_pedido: formatDate(o.paidAt),
    cliente: {
      nome: o.customer.name,
      tipo_pessoa: "F",
      cpf_cnpj: o.customer.cpf ?? "",
      email: o.customer.email,
      fone: o.customer.phone ?? "",
      endereco: o.shippingAddress.street,
      numero: o.shippingAddress.number,
      complemento: o.shippingAddress.complement ?? "",
      bairro: o.shippingAddress.district,
      cep: o.shippingAddress.cep,
      cidade: o.shippingAddress.city,
      uf: o.shippingAddress.state,
    },
    endereco_entrega: {
      endereco: o.shippingAddress.street,
      numero: o.shippingAddress.number,
      complemento: o.shippingAddress.complement ?? "",
      bairro: o.shippingAddress.district,
      cep: o.shippingAddress.cep,
      cidade: o.shippingAddress.city,
      uf: o.shippingAddress.state,
      pais: o.shippingAddress.country,
    },
    itens: o.items.map((it) => ({
      item: {
        codigo: it.sku,
        descricao: it.nameSnapshot,
        unidade: "Un",
        quantidade: it.qty,
        valor_unitario: cents(it.unitPriceCents),
      },
    })),
    valor_frete: cents(o.shippingCents),
    valor_desconto: cents(o.discountCents),
    situacao: "Aprovado",
  };
}

function cents(c: number) {
  return Number((c / 100).toFixed(2));
}

function formatDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
