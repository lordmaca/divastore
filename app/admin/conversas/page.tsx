import Link from "next/link";
import { prisma } from "@/lib/db";
import { ChatConversationStatus } from "@/lib/generated/prisma/enums";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { deleteConversation } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ChatConversationStatus, string> = {
  OPEN: "Aberta",
  CLOSED: "Encerrada",
  HANDOFF: "Atendimento humano",
};

const STATUS_STYLE: Record<ChatConversationStatus, string> = {
  OPEN: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CLOSED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  HANDOFF: "bg-amber-100 text-amber-800 border-amber-200",
};

function formatPt(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ConversationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFilter =
    status === "OPEN" || status === "CLOSED" || status === "HANDOFF"
      ? (status as ChatConversationStatus)
      : null;

  const [conversations, counts] = await Promise.all([
    prisma.chatConversation.findMany({
      where: statusFilter ? { status: statusFilter } : {},
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      select: {
        id: true,
        externalId: true,
        status: true,
        messageCount: true,
        lastMessageAt: true,
        createdAt: true,
        customer: { select: { email: true, name: true } },
        sessionKey: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true, content: true, kind: true },
        },
      },
    }),
    prisma.chatConversation.groupBy({ by: ["status"], _count: true }),
  ]);

  const by = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const total = counts.reduce((a, c) => a + c._count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Conversas</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">
            {total} no total · {by.OPEN ?? 0} abertas · {by.HANDOFF ?? 0} aguardando humano ·{" "}
            {by.CLOSED ?? 0} encerradas
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <FilterLink href="/admin/conversas" active={!statusFilter} label="Todas" />
          <FilterLink href="/admin/conversas?status=OPEN" active={statusFilter === "OPEN"} label="Abertas" />
          <FilterLink
            href="/admin/conversas?status=HANDOFF"
            active={statusFilter === "HANDOFF"}
            label="Aguardando humano"
          />
          <FilterLink
            href="/admin/conversas?status=CLOSED"
            active={statusFilter === "CLOSED"}
            label="Encerradas"
          />
        </div>
      </div>

      <p className="text-xs text-[color:var(--foreground)]/55 -mt-2">
        Espelho local das conversas com a Divinha. A fonte da verdade continua no DivaHub —
        excluir aqui apaga apenas o registro do storefront.
      </p>

      {conversations.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhuma conversa nesse filtro.
        </div>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => {
            const last = c.messages[0];
            const who = c.customer?.email ?? c.customer?.name ?? "Visitante";
            const preview =
              last?.kind === "text"
                ? (last.content ?? "").slice(0, 140)
                : last?.kind
                  ? `[${last.kind.replace(/_/g, " ")}]`
                  : "—";
            return (
              <li
                key={c.id}
                className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/conversas/${c.id}`}
                      className="text-sm font-medium text-[color:var(--foreground)] hover:text-[color:var(--pink-600)] truncate"
                    >
                      {who}
                    </Link>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                    <span className="text-[11px] text-[color:var(--foreground)]/55">
                      {c.messageCount} mensagens
                    </span>
                  </div>
                  <p className="text-xs text-[color:var(--foreground)]/65 line-clamp-1 mt-0.5">
                    {last?.role === "USER" ? "Cliente: " : last?.role === "ASSISTANT" ? "Divinha: " : ""}
                    {preview}
                  </p>
                  <p className="text-[11px] text-[color:var(--foreground)]/50 mt-0.5">
                    Última atividade: {formatPt(c.lastMessageAt)} · id {c.externalId.slice(0, 8)}…
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/admin/conversas/${c.id}`}
                    className="rounded-full border border-[color:var(--pink-200)] text-xs px-3 py-1.5 hover:bg-white"
                  >
                    Ver
                  </Link>
                  <ConfirmDeleteButton
                    action={deleteConversation}
                    hiddenFields={[["id", c.id]]}
                    confirmMessage="Excluir esta conversa? O registro continua no DivaHub."
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 border transition ${
        active
          ? "bg-[color:var(--pink-500)] text-white border-[color:var(--pink-500)]"
          : "border-[color:var(--pink-200)] hover:bg-white"
      }`}
    >
      {label}
    </Link>
  );
}
