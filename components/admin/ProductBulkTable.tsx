"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkProductAction, type BulkProductAction } from "@/lib/product-actions";

type Row = {
  id: string;
  slug: string;
  name: string;
  source: "MANUAL" | "DIVAHUB";
  active: boolean;
  imageUrl: string | null;
  priceLabel: string;
  variantCount: number;
  reviewCount: number;
};

export function ProductBulkTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && !allChecked;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(action: BulkProductAction) {
    if (selectedIds.length === 0) return;
    if (action === "delete") {
      const msg =
        `Excluir ${selectedIds.length} produto(s)? ` +
        `Produtos com pedidos passados serão ignorados. Esta ação não pode ser desfeita.`;
      if (!confirm(msg)) return;
    }
    start(async () => {
      const res = await bulkProductAction(selectedIds, action);
      setSelected(new Set());
      router.refresh();
      if (res.skipped.length) {
        alert(
          `${res.affected} afetado(s). ${res.skipped.length} ignorado(s):\n` +
            res.skipped.map((s) => `• ${s.slug} — ${s.reason}`).join("\n"),
        );
      }
    });
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div
        className={`flex items-center justify-between px-4 py-3 border-b border-white/50 transition-colors ${
          selected.size > 0 ? "bg-pink-50/70" : "bg-white/40"
        }`}
      >
        <div className="text-sm text-[color:var(--foreground)]/75">
          {selected.size > 0
            ? `${selected.size} selecionado(s)`
            : `${rows.length} produto(s)`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => run("activate")}
            className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40 text-xs font-medium px-3 py-1"
          >
            Ativar
          </button>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => run("deactivate")}
            className="rounded-full bg-zinc-200 text-zinc-800 hover:bg-zinc-300 disabled:opacity-40 text-xs font-medium px-3 py-1"
          >
            Desativar
          </button>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => run("delete")}
            className="rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 text-xs font-medium px-3 py-1"
          >
            Excluir
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-white/40 text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
          <tr>
            <th className="px-3 py-3 w-10">
              <input
                type="checkbox"
                aria-label="Selecionar todos"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={toggleAll}
              />
            </th>
            <th className="px-4 py-3"></th>
            <th className="px-4 py-3">Nome / slug</th>
            <th className="px-4 py-3">Origem</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Preço a partir</th>
            <th className="px-4 py-3">Var.</th>
            <th className="px-4 py-3">Aval.</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const checked = selected.has(p.id);
            return (
              <tr
                key={p.id}
                className={`border-t border-white/50 ${checked ? "bg-pink-50/50" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${p.name}`}
                    checked={checked}
                    onChange={() => toggleOne(p.id)}
                  />
                </td>
                <td className="px-2 py-2 w-12">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-pink-100" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs font-mono text-[color:var(--foreground)]/60">{p.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      p.source === "DIVAHUB"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-pink-100 text-pink-800"
                    }`}
                  >
                    {p.source === "DIVAHUB" ? "DivaHub" : "Manual"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      p.active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">{p.priceLabel}</td>
                <td className="px-4 py-3">{p.variantCount}</td>
                <td className="px-4 py-3">{p.reviewCount}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/produtos/${p.id}`}
                    className="text-[color:var(--pink-600)] hover:underline text-sm"
                  >
                    editar
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
