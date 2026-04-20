"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TestResult } from "@/lib/integration-test-actions";

type Props = {
  adapter: "mercadopago" | "tiny" | "divahub_inbound";
  action: () => Promise<TestResult>;
};

export function IntegrationTestButton({ action }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            setResult(r);
            router.refresh();
          })
        }
        className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
      >
        {pending ? "Testando…" : "Testar"}
      </button>
      {result ? (
        <div
          className={`rounded-xl p-3 text-xs ${
            result.ok
              ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
              : "bg-red-50 border border-red-200 text-red-900"
          }`}
        >
          <p className="font-medium">{result.ok ? result.summary : result.error}</p>
          {result.detail ? (
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10px] opacity-80">
              {JSON.stringify(result.detail, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
