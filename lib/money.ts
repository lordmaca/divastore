const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return formatter.format(cents / 100);
}

export function parseBRL(value: string): number {
  const digits = value.replace(/\D/g, "");
  return Number.parseInt(digits || "0", 10);
}
