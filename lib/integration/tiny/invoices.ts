// Tiny v2 NF-e (nota fiscal eletrônica) adapter.
//
// Flow:
//   1. `nota.fiscal.emitir.php` — given a pedido id, Tiny includes the NF and
//      transmits it to SEFAZ. Returns Tiny's internal NF id and initial
//      status (frequently "aguardando_autorizacao").
//   2. `nota.fiscal.obter.php` — poll with the NF id to check SEFAZ status
//      and fetch DANFE / XML URLs once "autorizada".
//   3. `nota.fiscal.cancelar.php` — cancel an already-emitted NF (within the
//      legal window) with a required motivo.
//
// Tiny's response keys drift by account config — we accept common variants
// (`chave_acesso` ~ `chaveAcesso`, `link_nfe` ~ `linkNfe`) and always stash
// `rawPayload` so we can investigate from /admin/integrations/runs.

import { TinyError, withRetry, loadTinyConfig } from "./http";

async function rawCall(endpoint: string, payload: Record<string, string>): Promise<unknown> {
  const cfg = await loadTinyConfig();
  if (!cfg.token) throw new TinyError("Tiny API token not configured");
  const body = new URLSearchParams({
    token: cfg.token,
    formato: "JSON",
    ...payload,
  });
  const res = await fetch(`${cfg.baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new TinyError(`Tiny HTTP ${res.status} on ${endpoint}`);
  return res.json();
}

// Normalize a Tiny "situacao" string to our InvoiceStatus-shaped status.
// Tiny uses pt-BR labels which vary ("emitida", "autorizada", "aguardando
// autorizacao", "denegada", "cancelada", "rejeitada", numbered codes).
export type TinyInvoiceStatus =
  | "pending"   // waiting SEFAZ
  | "issued"    // autorizada / emitida
  | "cancelled" // cancelada
  | "failed";   // denegada / rejeitada / erro

export function mapTinySituacao(raw: unknown): TinyInvoiceStatus {
  const s = String(raw ?? "").toLowerCase();
  if (/autoriz/.test(s) || /emitida/.test(s)) return "issued";
  if (/cancel/.test(s)) return "cancelled";
  if (/deneg/.test(s) || /rejeit/.test(s) || /erro/.test(s)) return "failed";
  return "pending";
}

type EmitResponse = {
  tinyInvoiceId: string;
  situacao: TinyInvoiceStatus;
  rawPayload: unknown;
};

// Calls nota.fiscal.emitir.php with the pedido id. Tiny creates + transmits
// the NF. We consume only the NF id + current situacao — SEFAZ async
// confirmation arrives through the poll path (`tinyObterNotaFiscal`).
export async function tinyEmitirNotaFiscal(tinyOrderId: string): Promise<EmitResponse> {
  const json = await withRetry(() =>
    rawCall("nota.fiscal.emitir.php", { id: tinyOrderId, modelo: "NFe" }),
  );
  const retorno = (json as { retorno?: Record<string, unknown> }).retorno ?? {};
  const status = retorno.status;
  if (status !== "OK") {
    const msg = Array.isArray(retorno.erros)
      ? (retorno.erros as Array<{ erro?: string }>).map((e) => e.erro).join("; ")
      : `Tiny returned status=${String(status)}`;
    throw new TinyError(msg, retorno.codigo_erro as string | undefined);
  }
  const registros = (retorno.registros ?? {}) as Record<string, unknown>;
  // Tiny wraps the NF under several variant keys depending on account.
  const notaFiscal =
    (registros.registro as Record<string, unknown>) ??
    (registros.nota_fiscal as Record<string, unknown>) ??
    registros;
  const id =
    (notaFiscal.id as string | number | undefined) ??
    (notaFiscal.idNotaFiscal as string | number | undefined);
  if (id == null) {
    throw new TinyError("Tiny emitir response missing NF id");
  }
  return {
    tinyInvoiceId: String(id),
    situacao: mapTinySituacao(notaFiscal.situacao ?? notaFiscal.status),
    rawPayload: json,
  };
}

export type InvoiceSnapshot = {
  tinyInvoiceId: string;
  situacao: TinyInvoiceStatus;
  number: string | null;
  serie: string | null;
  accessKey: string | null;
  danfeUrl: string | null;
  xmlUrl: string | null;
  rawPayload: unknown;
};

// Read the current state of a Tiny NF. Safe to call repeatedly from the
// poll sweeper.
export async function tinyObterNotaFiscal(tinyInvoiceId: string): Promise<InvoiceSnapshot> {
  const json = await withRetry(() =>
    rawCall("nota.fiscal.obter.php", { id: tinyInvoiceId }),
  );
  const retorno = (json as { retorno?: Record<string, unknown> }).retorno ?? {};
  if (retorno.status !== "OK") {
    const msg = Array.isArray(retorno.erros)
      ? (retorno.erros as Array<{ erro?: string }>).map((e) => e.erro).join("; ")
      : `Tiny returned status=${String(retorno.status)}`;
    throw new TinyError(msg, retorno.codigo_erro as string | undefined);
  }
  const nf =
    ((retorno.registros as Record<string, unknown> | undefined)?.nota_fiscal as Record<string, unknown> | undefined) ??
    ((retorno.nota_fiscal as Record<string, unknown> | undefined) ?? {});

  const get = (keys: string[]): string | null => {
    for (const k of keys) {
      const v = nf[k];
      if (v != null && v !== "") return String(v);
    }
    return null;
  };

  return {
    tinyInvoiceId,
    situacao: mapTinySituacao(nf.situacao ?? nf.status),
    number: get(["numero"]),
    serie: get(["serie"]),
    accessKey: get(["chave_acesso", "chaveAcesso", "chave"]),
    danfeUrl: get(["link_danfe", "linkDanfe", "link_nfe", "linkNfe", "link"]),
    xmlUrl: get(["link_xml", "linkXml", "url_xml"]),
    rawPayload: json,
  };
}

// Cancels an emitted NF. Tiny requires a motivo (15-500 chars) per SEFAZ.
export async function tinyCancelarNotaFiscal(tinyInvoiceId: string, motivo: string): Promise<void> {
  if (motivo.trim().length < 15) {
    throw new TinyError("Motivo de cancelamento precisa ter ao menos 15 caracteres");
  }
  const json = await withRetry(() =>
    rawCall("nota.fiscal.cancelar.php", {
      id: tinyInvoiceId,
      motivo,
    }),
  );
  const retorno = (json as { retorno?: Record<string, unknown> }).retorno ?? {};
  if (retorno.status !== "OK") {
    const msg = Array.isArray(retorno.erros)
      ? (retorno.erros as Array<{ erro?: string }>).map((e) => e.erro).join("; ")
      : `Tiny returned status=${String(retorno.status)}`;
    throw new TinyError(msg, retorno.codigo_erro as string | undefined);
  }
}
