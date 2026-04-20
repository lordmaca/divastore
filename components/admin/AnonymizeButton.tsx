"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { anonymizeCustomer } from "@/lib/customer-admin-actions";

export function AnonymizeButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Anonimizar ${email}?\n\nIsso apaga nome, e-mail, telefone, CPF, endereços e snapshots de entrega dos pedidos. Ação irreversível. Pedidos e receita permanecem para reporting.`,
          )
        )
          return;
        start(async () => {
          try {
            await anonymizeCustomer(id);
            router.refresh();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Erro ao anonimizar.");
          }
        });
      }}
      className="rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 text-xs font-medium px-3 py-1"
    >
      {pending ? "…" : "Anonimizar (LGPD)"}
    </button>
  );
}
