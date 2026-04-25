import { RenderError } from "../errors";
import {
  absoluteUrl,
  brl,
  escapeHtml,
  formatDatePtBr,
  greeting,
  renderShell,
  safeEmailUrl,
} from "./shared";

// Every template produces { subject, html, text } plus a flag telling the
// dispatcher whether it is transactional (always sent) or marketing
// (gated on Customer.marketingOptIn / whatsappOptIn per LGPD).

export type RenderedMessage = {
  subject: string;
  html: string;
  text: string;
  // True for abandoned_cart and any future campaign template. Transactional
  // templates (order updates, password reset, welcome) always send.
  marketing: boolean;
};

type OrderLine = { name: string; qty: number; totalCents: number };

type Data = {
  order_created: {
    customerName?: string | null;
    orderNumber: number;
    totalCents: number;
    items: OrderLine[];
  };
  payment_pending_pix: {
    customerName?: string | null;
    orderNumber: number;
    totalCents: number;
    pixQrCode: string;
    pixQrCodeBase64?: string | null;
    pixExpiresAt?: Date | null;
    orderUrl: string;
  };
  payment_approved: {
    customerName?: string | null;
    orderNumber: number;
    totalCents: number;
    orderUrl: string;
  };
  payment_failed: {
    customerName?: string | null;
    orderNumber: number;
    retryUrl: string;
  };
  order_shipped: {
    customerName?: string | null;
    orderNumber: number;
    carrier?: string | null;
    trackingCode: string;
    trackingUrl?: string | null;
    etaDays?: number | null;
  };
  order_delivered: {
    customerName?: string | null;
    orderNumber: number;
    reviewUrl: string;
  };
  invoice_issued: {
    customerName?: string | null;
    orderNumber: number;
    invoiceNumber?: string | null;
    serie?: string | null;
    danfeUrl: string;
    xmlUrl?: string | null;
    orderUrl: string;
  };
  refund_issued: {
    customerName?: string | null;
    orderNumber: number;
    amountCents: number;              // this refund event
    totalRefundedCents: number;       // aggregate across all refunds
    fullyRefunded: boolean;
    reason: string;
    orderUrl: string;
  };
  out_for_delivery: {
    customerName?: string | null;
    orderNumber: number;
    trackingCode: string;
    trackingUrl?: string | null;
    orderUrl: string;
  };
  delivery_exception: {
    customerName?: string | null;
    orderNumber: number;
    reason: string;
    orderUrl: string;
  };
  welcome: {
    customerName?: string | null;
  };
  password_reset: {
    customerName?: string | null;
    resetUrl: string;
    expiresAt: Date;
  };
  abandoned_cart: {
    customerName?: string | null;
    items: OrderLine[];
    resumeUrl: string;
    unsubscribeUrl: string;
  };
};

export type TemplateName = keyof Data;

function lineList(items: OrderLine[]): string {
  // it.name is product.nameSnapshot or similar — admin-controlled, but an
  // email rendered into an admin inbox should still escape so an
  // attacker-controlled DivaHub product name can't drop markup.
  return items
    .map(
      (it) =>
        `<li style="margin:4px 0;">${it.qty}× ${escapeHtml(it.name)} — <strong>${brl(it.totalCents)}</strong></li>`,
    )
    .join("");
}

function lineListText(items: OrderLine[]): string {
  return items.map((it) => `- ${it.qty}× ${it.name} — ${brl(it.totalCents)}`).join("\n");
}

const renderers: { [K in TemplateName]: (data: Data[K]) => RenderedMessage } = {
  order_created: (d) => {
    const subject = `Recebemos seu pedido #${d.orderNumber} 💖`;
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Recebemos o seu pedido <strong>#${d.orderNumber}</strong> e já estamos aguardando a confirmação do pagamento. Assim que cair, começamos a preparar tudo com muito carinho.</p>
      <p><strong>Itens:</strong></p>
      <ul style="padding-left:20px;margin:0 0 16px 0;">${lineList(d.items)}</ul>
      <p><strong>Total: ${brl(d.totalCents)}</strong></p>
    `;
    const text = `${greeting(d.customerName)},\n\nRecebemos o seu pedido #${d.orderNumber}. Assim que confirmarmos o pagamento, começamos a preparar com muito carinho.\n\nItens:\n${lineListText(d.items)}\n\nTotal: ${brl(d.totalCents)}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Pedido #${d.orderNumber} recebido — aguardando pagamento`,
        headline: "Seu pedido foi recebido",
        bodyHtml,
        ctaLabel: "Ver meus pedidos",
        ctaUrl: absoluteUrl("/minha-conta/pedidos"),
      }),
      text,
      marketing: false,
    };
  },

  payment_pending_pix: (d) => {
    const subject = `Seu Pix do pedido #${d.orderNumber} está pronto 💗`;
    const expiresLine = d.pixExpiresAt
      ? `<p>O código expira em <strong>${formatDatePtBr(d.pixExpiresAt)} às ${new Date(d.pixExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong>.</p>`
      : "";
    const qrImg = d.pixQrCodeBase64
      ? `<p style="text-align:center;margin:16px 0;"><img src="data:image/png;base64,${d.pixQrCodeBase64}" alt="QR code Pix" style="width:220px;height:220px;border-radius:12px;background:#ffffff;padding:8px;" /></p>`
      : "";
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Recebemos o seu pedido <strong>#${d.orderNumber}</strong>. Para confirmar, é só pagar o Pix abaixo:</p>
      ${qrImg}
      <p><strong>Código Pix copia-e-cola:</strong></p>
      <pre style="font-family:'Courier New',Courier,monospace;background:#fdf4ff;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-all;font-size:12px;">${escapeHtml(d.pixQrCode)}</pre>
      ${expiresLine}
      <p>Total do pedido: <strong>${brl(d.totalCents)}</strong></p>
    `;
    const text = `${greeting(d.customerName)},\n\nRecebemos o seu pedido #${d.orderNumber}. Pague o Pix abaixo para confirmar:\n\n${d.pixQrCode}\n\n${d.pixExpiresAt ? `Expira em ${formatDatePtBr(d.pixExpiresAt)}.\n\n` : ""}Total: ${brl(d.totalCents)}\nAcompanhe: ${d.orderUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Pix do pedido #${d.orderNumber} — copie o código e pague no seu banco`,
        headline: "Pague seu Pix para confirmar o pedido",
        bodyHtml,
        ctaLabel: "Ver pedido",
        ctaUrl: d.orderUrl,
      }),
      text,
      marketing: false,
    };
  },

  payment_approved: (d) => {
    const subject = `Pagamento confirmado — pedido #${d.orderNumber}`;
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Seu pagamento de <strong>${brl(d.totalCents)}</strong> foi aprovado e o pedido <strong>#${d.orderNumber}</strong> já está em preparação.</p>
      <p>Vamos te avisar aqui mesmo quando ele for enviado, com o código de rastreio.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nSeu pagamento de ${brl(d.totalCents)} foi aprovado e o pedido #${d.orderNumber} já está em preparação.\n\nAcompanhar: ${d.orderUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Pagamento aprovado — estamos preparando seu pedido`,
        headline: "Pagamento confirmado ✨",
        bodyHtml,
        ctaLabel: "Acompanhar pedido",
        ctaUrl: d.orderUrl,
      }),
      text,
      marketing: false,
    };
  },

  payment_failed: (d) => {
    const subject = `Seu pagamento não foi aprovado — pedido #${d.orderNumber}`;
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Infelizmente não conseguimos aprovar o pagamento do seu pedido <strong>#${d.orderNumber}</strong>. Pode acontecer por limite do cartão, dados incorretos ou Pix/Boleto expirado.</p>
      <p>Sem problema — é só tentar novamente. Seus itens continuam reservados por algumas horas.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nSeu pagamento do pedido #${d.orderNumber} não foi aprovado. Tente novamente em: ${d.retryUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Não se preocupe, é só tentar de novo`,
        headline: "Pagamento não aprovado",
        bodyHtml,
        ctaLabel: "Tentar novamente",
        ctaUrl: d.retryUrl,
      }),
      text,
      marketing: false,
    };
  },

  order_shipped: (d) => {
    const subject = `Seu pedido #${d.orderNumber} está a caminho 🚚`;
    const carrierLine = d.carrier
      ? `<p><strong>Transportadora:</strong> ${escapeHtml(d.carrier)}</p>`
      : "";
    const etaLine = d.etaDays
      ? `<p><strong>Previsão de entrega:</strong> ${d.etaDays} dias úteis</p>`
      : "";
    const trackCta = safeEmailUrl(
      d.trackingUrl ?? absoluteUrl("/minha-conta/pedidos"),
      absoluteUrl("/minha-conta/pedidos"),
    );
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Boa notícia! Seu pedido <strong>#${d.orderNumber}</strong> foi postado e já está a caminho.</p>
      ${carrierLine}
      <p><strong>Código de rastreio:</strong> <code style="background:#fdf4ff;padding:2px 6px;border-radius:4px;">${escapeHtml(d.trackingCode)}</code></p>
      ${etaLine}
    `;
    const text = `${greeting(d.customerName)},\n\nSeu pedido #${d.orderNumber} foi postado e já está a caminho.\n${d.carrier ? `Transportadora: ${d.carrier}\n` : ""}Código de rastreio: ${d.trackingCode}\n${d.etaDays ? `Previsão: ${d.etaDays} dias úteis\n` : ""}\nRastrear: ${trackCta}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Código de rastreio: ${d.trackingCode}`,
        headline: "Seu pedido está a caminho",
        bodyHtml,
        ctaLabel: d.trackingUrl ? "Rastrear pedido" : "Ver meus pedidos",
        ctaUrl: trackCta,
      }),
      text,
      marketing: false,
    };
  },

  order_delivered: (d) => {
    const subject = `Chegou! E agora, conta pra gente 💌`;
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Seu pedido <strong>#${d.orderNumber}</strong> foi entregue! Esperamos que você ame cada peça tanto quanto a gente amou preparar.</p>
      <p>Que tal deixar uma avaliação? Isso ajuda outras Divas a brilharem também ✨</p>
    `;
    const text = `${greeting(d.customerName)},\n\nSeu pedido #${d.orderNumber} foi entregue! Esperamos que você ame cada peça.\n\nDeixe sua avaliação: ${d.reviewUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Seu pedido chegou — queremos saber sua opinião`,
        headline: "Chegou! Como ficou?",
        bodyHtml,
        ctaLabel: "Avaliar meu pedido",
        ctaUrl: d.reviewUrl,
      }),
      text,
      marketing: false,
    };
  },

  invoice_issued: (d) => {
    const nfLine = d.invoiceNumber
      ? `NF-e <strong>${escapeHtml(d.invoiceNumber)}${d.serie ? "/" + escapeHtml(d.serie) : ""}</strong>`
      : "Sua nota fiscal";
    const subject = `Sua nota fiscal do pedido #${d.orderNumber} está pronta 🧾`;
    const xmlLine = d.xmlUrl
      ? `<p style="font-size:13px;"><a href="${escapeHtml(safeEmailUrl(d.xmlUrl))}" style="color:#be185d;">Baixar XML</a></p>`
      : "";
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>${nfLine} do pedido <strong>#${d.orderNumber}</strong> foi emitida. Você pode baixar o DANFE em PDF no botão abaixo.</p>
      ${xmlLine}
      <p style="color:#6b7280;font-size:13px;">Guarde o documento — ele é a comprovação fiscal da sua compra.</p>
    `;
    const text = `${greeting(d.customerName)},\n\n${d.invoiceNumber ? `NF-e ${d.invoiceNumber}${d.serie ? "/" + d.serie : ""}` : "Sua nota fiscal"} do pedido #${d.orderNumber} foi emitida.\n\nBaixar DANFE: ${d.danfeUrl}${d.xmlUrl ? `\nBaixar XML: ${d.xmlUrl}` : ""}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Sua NF-e do pedido #${d.orderNumber}`,
        headline: "Sua nota fiscal foi emitida",
        bodyHtml,
        ctaLabel: "Baixar DANFE",
        ctaUrl: d.danfeUrl,
      }),
      text,
      marketing: false,
    };
  },

  refund_issued: (d) => {
    const subject = d.fullyRefunded
      ? `Reembolso confirmado — pedido #${d.orderNumber}`
      : `Reembolso parcial confirmado — pedido #${d.orderNumber}`;
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Confirmamos um reembolso${d.fullyRefunded ? " total" : " parcial"} no seu pedido <strong>#${d.orderNumber}</strong>.</p>
      <p style="background:#fdf4ff;border-radius:8px;padding:12px;margin:16px 0;">
        <strong>Valor deste reembolso:</strong> ${brl(d.amountCents)}${
          !d.fullyRefunded
            ? `<br /><span style="color:#6b7280;font-size:13px;">Total já reembolsado até agora: ${brl(d.totalRefundedCents)}</span>`
            : ""
        }
      </p>
      <p style="color:#6b7280;font-size:13px;">Motivo: ${escapeHtml(d.reason)}</p>
      <p>O valor deve aparecer em até <strong>7 dias úteis</strong> no mesmo meio de pagamento usado na compra (Pix, cartão ou boleto).</p>
    `;
    const text = `${greeting(d.customerName)},\n\nConfirmamos um reembolso${d.fullyRefunded ? " total" : " parcial"} no pedido #${d.orderNumber}.\n\nValor deste reembolso: ${brl(d.amountCents)}${!d.fullyRefunded ? `\nTotal reembolsado: ${brl(d.totalRefundedCents)}` : ""}\nMotivo: ${d.reason}\n\nO valor aparece em até 7 dias úteis no mesmo meio de pagamento.\n\nAcompanhe: ${d.orderUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Reembolso de ${brl(d.amountCents)} no pedido #${d.orderNumber}`,
        headline: d.fullyRefunded ? "Reembolso confirmado" : "Reembolso parcial confirmado",
        bodyHtml,
        ctaLabel: "Ver pedido",
        ctaUrl: d.orderUrl,
      }),
      text,
      marketing: false,
    };
  },

  out_for_delivery: (d) => {
    const subject = `Seu pedido #${d.orderNumber} saiu para entrega 📦`;
    const trackLine = d.trackingUrl
      ? `<p><a href="${escapeHtml(safeEmailUrl(d.trackingUrl))}" style="color:#be185d;">Acompanhar pela transportadora</a></p>`
      : "";
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Boa notícia! Seu pedido <strong>#${d.orderNumber}</strong> saiu para entrega e deve chegar hoje.</p>
      <p><strong>Código de rastreio:</strong> <code style="background:#fdf4ff;padding:2px 6px;border-radius:4px;">${escapeHtml(d.trackingCode)}</code></p>
      ${trackLine}
      <p style="color:#6b7280;font-size:13px;">Se possível, deixe alguém em casa para receber. Se der problema na entrega, avisamos por aqui.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nSeu pedido #${d.orderNumber} saiu para entrega e deve chegar hoje.\nRastreio: ${d.trackingCode}\n${d.trackingUrl ? `Acompanhar: ${d.trackingUrl}\n` : ""}\nAcompanhar pedido: ${d.orderUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Rastreio ${d.trackingCode} · chegando hoje`,
        headline: "Saiu para entrega hoje",
        bodyHtml,
        ctaLabel: d.trackingUrl ? "Rastrear" : "Ver pedido",
        ctaUrl: d.trackingUrl ?? d.orderUrl,
      }),
      text,
      marketing: false,
    };
  },

  delivery_exception: (d) => {
    const subject = `Problema na entrega do pedido #${d.orderNumber}`;
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>A transportadora registrou uma ocorrência na entrega do seu pedido <strong>#${d.orderNumber}</strong>:</p>
      <p style="background:#fef3c7;border-radius:8px;padding:12px;color:#78350f;"><strong>${escapeHtml(d.reason)}</strong></p>
      <p>Não se preocupe — estamos acompanhando e vamos fazer de tudo para resolver rapidinho. Se precisar de algo, é só responder este e-mail.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nA transportadora registrou uma ocorrência na entrega do pedido #${d.orderNumber}:\n${d.reason}\n\nEstamos acompanhando. Se precisar, é só responder este e-mail.\n\nAcompanhe: ${d.orderUrl}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Ocorrência na entrega do pedido #${d.orderNumber}`,
        headline: "Tivemos um problema na entrega",
        bodyHtml,
        ctaLabel: "Ver pedido",
        ctaUrl: d.orderUrl,
      }),
      text,
      marketing: false,
    };
  },

  welcome: (d) => {
    const subject = "Bem-vinda ao Brilho de Diva ✨";
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Seja muito bem-vinda! Aqui você encontra peças que foram pensadas para realçar a sua beleza e fazer cada dia brilhar um pouquinho mais.</p>
      <p>Dá uma olhada na coleção e separa as que mais combinam com você.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nSeja muito bem-vinda ao Brilho de Diva! Realce sua beleza e brilhe como uma Diva.\n\nExplore: ${absoluteUrl("/loja")}\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Bem-vinda — vamos brilhar juntas`,
        headline: "Bem-vinda, Diva!",
        bodyHtml,
        ctaLabel: "Explorar a coleção",
        ctaUrl: absoluteUrl("/loja"),
      }),
      text,
      marketing: false,
    };
  },

  password_reset: (d) => {
    const subject = "Redefinir sua senha — Brilho de Diva";
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Recebemos um pedido para redefinir a sua senha. Clique no botão abaixo para escolher uma nova — o link é válido até <strong>${formatDatePtBr(d.expiresAt)} às ${new Date(d.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong>.</p>
      <p style="color:#6b7280;font-size:13px;">Se não foi você que pediu, pode ignorar este e-mail. Sua senha atual continua valendo.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nUse o link abaixo para redefinir sua senha (válido por 1 hora):\n${d.resetUrl}\n\nSe não foi você, ignore este e-mail.\n\nBrilho de Diva`;
    return {
      subject,
      html: renderShell({
        preheader: `Link válido por 1 hora`,
        headline: "Redefinir sua senha",
        bodyHtml,
        ctaLabel: "Criar nova senha",
        ctaUrl: d.resetUrl,
      }),
      text,
      marketing: false,
    };
  },

  abandoned_cart: (d) => {
    const subject = "Você esqueceu algo brilhante 💎";
    const bodyHtml = `
      <p>${greeting(d.customerName)},</p>
      <p>Vimos que você separou alguns itens no carrinho e não finalizou. Sem pressão — deixamos eles esperando por você:</p>
      <ul style="padding-left:20px;margin:0 0 16px 0;">${lineList(d.items)}</ul>
      <p>Se quiser concluir a compra, é só clicar no botão abaixo.</p>
    `;
    const text = `${greeting(d.customerName)},\n\nVocê separou alguns itens no carrinho:\n${lineListText(d.items)}\n\nFinalize aqui: ${d.resumeUrl}\n\nBrilho de Diva\n\nNão quer mais receber estes lembretes? ${d.unsubscribeUrl}`;
    return {
      subject,
      html: renderShell({
        preheader: `Seus itens continuam esperando`,
        headline: "Seu carrinho está te esperando",
        bodyHtml,
        ctaLabel: "Retomar compra",
        ctaUrl: d.resumeUrl,
        footerNote: `Se não quer mais receber novidades, <a href="${escapeHtml(safeEmailUrl(d.unsubscribeUrl))}" style="color:#be185d;">cancele a inscrição aqui</a>.`,
      }),
      text,
      marketing: true,
    };
  },
};

export function render<K extends TemplateName>(name: K, data: Data[K]): RenderedMessage {
  const renderer = renderers[name];
  if (!renderer) throw new RenderError(name, "unknown template");
  try {
    return renderer(data);
  } catch (err) {
    throw new RenderError(name, err);
  }
}

export type TemplateData = Data;
