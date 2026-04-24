import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  ChatConversationStatus,
  ChatMessageRole,
} from "@/lib/generated/prisma/enums";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { deleteConversation } from "../actions";

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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const c = await prisma.chatConversation.findUnique({
    where: { id },
    include: {
      customer: { select: { email: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) notFound();

  const who = c.customer?.email ?? c.customer?.name ?? "Visitante";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/conversas"
          className="text-xs text-[color:var(--pink-600)] hover:underline"
        >
          ← Todas as conversas
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">{who}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-[color:var(--foreground)]/65">
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[c.status]}`}
            >
              {STATUS_LABEL[c.status]}
            </span>
            <span>{c.messageCount} mensagens</span>
            <span>·</span>
            <span>Iniciada em {formatPt(c.createdAt)}</span>
            <span>·</span>
            <span>Última: {formatPt(c.lastMessageAt)}</span>
          </div>
          <p className="text-[11px] text-[color:var(--foreground)]/50 mt-1">
            id externo: <code>{c.externalId}</code>
            {c.sessionKey ? (
              <>
                {" · "}sessão: <code>{c.sessionKey.slice(0, 12)}…</code>
              </>
            ) : null}
          </p>
        </div>
        <ConfirmDeleteButton
          action={deleteConversation}
          hiddenFields={[
            ["id", c.id],
            ["redirectTo", "list"],
          ]}
          label="Excluir conversa"
          confirmMessage="Excluir esta conversa? O registro continua no DivaHub."
        />
      </div>

      {c.messages.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Sem mensagens registradas localmente.
        </div>
      ) : (
        <ul className="space-y-3">
          {c.messages.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

type MessageRecord = {
  id: string;
  role: ChatMessageRole;
  kind: string;
  content: string | null;
  payload: unknown;
  actions: unknown;
  turnId: string | null;
  createdAt: Date;
};

function MessageRow({ m }: { m: MessageRecord }) {
  const isUser = m.role === ChatMessageRole.USER;
  const isSystem = m.role === ChatMessageRole.SYSTEM;

  return (
    <li
      className={`glass-card rounded-2xl p-3 ${
        isUser ? "ml-8 border-l-4 border-[color:var(--pink-500)]/60" : "mr-8"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-[color:var(--foreground)]/55 mb-1">
        <span className="uppercase tracking-wide font-medium">
          {isUser ? "Cliente" : isSystem ? "Sistema" : "Divinha"} · {m.kind}
        </span>
        <span>{formatPt(m.createdAt)}</span>
      </div>
      {m.content ? (
        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
      ) : null}
      {m.payload && m.kind !== "text" ? (
        <pre className="mt-1 text-[11px] bg-white/70 rounded-xl p-2 overflow-x-auto">
          {JSON.stringify(m.payload, null, 2)}
        </pre>
      ) : null}
      {Array.isArray(m.actions) && m.actions.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-medium text-[color:var(--foreground)]/65">
            Ações emitidas:
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {(m.actions as Array<{ type: string }>).map((a, i) => (
              <li
                key={i}
                className="text-[10px] bg-[color:var(--pink-50)] border border-[color:var(--pink-200)]/60 rounded-full px-2 py-0.5 text-[color:var(--pink-600)]"
              >
                {a.type}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
