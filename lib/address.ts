// ViaCEP lookup. Free, no auth. Returns null if the CEP doesn't exist or the
// service is unreachable — callers keep going with user-typed values.

export type CepLookup = {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
};

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function normalizeCep(cep: string): string {
  return onlyDigits(cep).slice(0, 8);
}

export async function lookupCep(cep: string): Promise<CepLookup | null> {
  const clean = normalizeCep(cep);
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
      // ViaCEP has no auth + low latency; short timeout keeps forms responsive.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
      erro?: boolean;
    };
    if (j.erro) return null;
    return {
      cep: clean,
      street: j.logradouro ?? "",
      district: j.bairro ?? "",
      city: j.localidade ?? "",
      state: (j.uf ?? "").toUpperCase(),
    };
  } catch {
    return null;
  }
}
