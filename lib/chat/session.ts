import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Chat session resolution. Divinha's contract requires `sessionKey` to be
// present on every turn (so threads survive across logout/login boundaries
// and guest sessions). We keep this independent of the cart cookie so a
// cart-clear doesn't wipe the chat thread.

const CHAT_COOKIE = "bd_chat";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type ChatSession = {
  customerId: string | null;
  sessionKey: string;
  email: string | null;
  firstName: string | null;
  isAuthenticated: boolean;
};

// Route-handler / server-action only (writes the cookie if missing).
export async function ensureChatSession(): Promise<ChatSession> {
  const session = await auth();
  const jar = await cookies();

  let sessionKey = jar.get(CHAT_COOKIE)?.value;
  if (!sessionKey) {
    sessionKey = `bd_${randomBytes(18).toString("hex")}`;
    jar.set(CHAT_COOKIE, sessionKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }

  if (!session?.user?.id) {
    return {
      customerId: null,
      sessionKey,
      email: null,
      firstName: null,
      isAuthenticated: false,
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
  return {
    customerId: customer?.id ?? null,
    sessionKey,
    email: customer?.email ?? null,
    firstName: customer?.name?.split(" ")[0] ?? null,
    isAuthenticated: Boolean(customer),
  };
}
