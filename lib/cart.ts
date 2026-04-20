// Cart utilities.
//
// Next 16 forbids setting cookies in a Server Component, so we split:
//   - getCartReadOnly()        — safe in any RSC. Returns null if there's no
//                                cookie/session yet (e.g. first-time visitor).
//   - ensureCartWritable()     — server actions / route handlers only. Creates
//                                the cookie + DB cart row if missing.
//
// Logged-in customers always have a cart by `customerId`; anonymous users get
// one keyed by an opaque cookie value `bd_cart`.

import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const CART_COOKIE = "bd_cart";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const ITEM_INCLUDE = {
  items: {
    include: {
      variant: { include: { product: { include: { images: { take: 1, orderBy: { position: "asc" as const } } } } } },
    },
  },
} as const;

export type CartWithItems = NonNullable<Awaited<ReturnType<typeof getCartReadOnly>>>;

export async function getCartReadOnly(customerId?: string | null) {
  const id = customerId === undefined ? (await auth())?.user?.id : customerId;
  if (id) {
    return prisma.cart.findFirst({
      where: { customerId: id },
      orderBy: { updatedAt: "desc" },
      include: ITEM_INCLUDE,
    });
  }
  const jar = await cookies();
  const key = jar.get(CART_COOKIE)?.value;
  if (!key) return null;
  return prisma.cart.findUnique({ where: { sessionKey: key }, include: ITEM_INCLUDE });
}

export async function ensureCartWritable() {
  const session = await auth();
  if (session?.user?.id) {
    const existing = await prisma.cart.findFirst({
      where: { customerId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: ITEM_INCLUDE,
    });
    if (existing) return existing;
    return prisma.cart.create({ data: { customerId: session.user.id }, include: ITEM_INCLUDE });
  }

  const jar = await cookies();
  let key = jar.get(CART_COOKIE)?.value;
  if (!key) {
    key = randomBytes(24).toString("hex");
    jar.set(CART_COOKIE, key, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }
  const existing = await prisma.cart.findUnique({ where: { sessionKey: key }, include: ITEM_INCLUDE });
  if (existing) return existing;
  return prisma.cart.create({ data: { sessionKey: key }, include: ITEM_INCLUDE });
}

export function cartTotals(cart: CartWithItems | null) {
  if (!cart) return { subtotalCents: 0, itemCount: 0 };
  const subtotalCents = cart.items.reduce(
    (acc, it) => acc + it.qty * it.variant.priceCents,
    0,
  );
  const itemCount = cart.items.reduce((acc, it) => acc + it.qty, 0);
  return { subtotalCents, itemCount };
}
