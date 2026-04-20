// One-off debug script: fetches the full Tiny responses for a given SKU
// so we can see exactly what the API is returning. Use when the
// storefront stock doesn't match what the admin sees in Tiny's UI.

import { prisma } from "../lib/db";

const TOKEN = process.env.TINY_API_TOKEN ?? "";
const BASE = process.env.TINY_API_BASE_URL ?? "https://api.tiny.com.br/api2";

async function call(endpoint: string, payload: Record<string, string>) {
  const body = new URLSearchParams({ token: TOKEN, formato: "JSON", ...payload });
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  console.log(`\n=== ${endpoint} (status ${res.status}) ===`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
  return text;
}

async function main() {
  const sku = process.argv[2];
  if (!sku) {
    console.error("Usage: tsx scripts/probe-tiny-sku.ts <sku>");
    process.exit(2);
  }
  if (!TOKEN) {
    console.error("TINY_API_TOKEN not set");
    process.exit(1);
  }

  console.log(`Probing Tiny for SKU: ${sku}`);
  const search = await call("produtos.pesquisa.php", { pesquisa: sku });
  try {
    const parsed = JSON.parse(search);
    // Tiny's envelope varies — try every shape we've seen in the wild.
    const retorno = parsed?.retorno ?? {};
    const registros = retorno?.registros ?? {};
    const flat: Array<{ id: string; codigo: string; nome: string }> = [];
    const pools = [registros?.produto, retorno?.produto];
    for (const p of pools) if (Array.isArray(p)) flat.push(...p);
    const wrapped = [registros?.produtos, retorno?.produtos];
    for (const w of wrapped) {
      if (Array.isArray(w)) for (const row of w) if (row?.produto) flat.push(row.produto);
    }
    for (const p of flat) {
      const id = String(p.id);
      console.log(`\n--- hit: id=${id} codigo=${p.codigo} nome=${p.nome}`);
      await call("produto.obter.estoque.php", { id });
    }
  } catch {
    /* already logged raw */
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
