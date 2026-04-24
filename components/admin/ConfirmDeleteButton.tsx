"use client";

import { useState, useTransition } from "react";

// Minimal admin-side delete button. Wraps a server action and asks for
// confirmation client-side before submitting. Usage:
//   <ConfirmDeleteButton action={deleteX} hiddenFields={[["id", x.id]]} />

export function ConfirmDeleteButton({
  action,
  hiddenFields,
  label = "Excluir",
  confirmMessage = "Tem certeza que deseja excluir?",
  className,
}: {
  action: (formData: FormData) => Promise<void> | void;
  hiddenFields: Array<[string, string]>;
  label?: string;
  confirmMessage?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);

  function onClick() {
    if (!armed) {
      setArmed(true);
      // 5s window to confirm; then reset.
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    const fd = new FormData();
    for (const [k, v] of hiddenFields) fd.append(k, v);
    startTransition(() => {
      void action(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        className ??
        `rounded-full border text-xs px-3 py-1.5 transition ${
          armed
            ? "bg-red-600 text-white border-red-600"
            : "border-red-200 text-red-700 hover:bg-red-50"
        } disabled:opacity-50`
      }
      title={confirmMessage}
    >
      {pending ? "…" : armed ? "Confirmar exclusão" : label}
    </button>
  );
}
