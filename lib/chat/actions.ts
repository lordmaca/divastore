import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureCartWritable } from "@/lib/cart";
import { evaluateCoupon } from "@/lib/coupons";
import type { ChatAction, ContractViolation } from "@/lib/integration/divahub/divinha";

// Action executor for Divinha-emitted actions. Any action outside this
// whitelist is dropped and reported as a contract violation. See
// lib/integration/divahub/DIVINHA_API_CONTRACT.md §7.

const COUPON_COOKIE = "bd_coupon";
const COUPON_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export const NAV_WHITELIST: RegExp[] = [
  /^\/$/,
  /^\/loja(?:\/|$|\?)/,
  /^\/carrinho(?:\/|$|\?)/,
  /^\/checkout(?:\/|$|\?)/,
  /^\/minha-conta(?:\/|$|\?)/,
];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_to_cart"),
    variantSku: z.string().min(1),
    qty: z.number().int().min(1).max(10),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("remove_from_cart"),
    variantId: z.string().min(1),
  }),
  z.object({
    type: z.literal("update_cart_qty"),
    variantId: z.string().min(1),
    qty: z.number().int().min(0).max(10),
  }),
  z.object({ type: z.literal("apply_coupon"), code: z.string().min(1) }),
  z.object({ type: z.literal("remove_coupon") }),
  z.object({ type: z.literal("show_product"), slug: z.string().min(1) }),
  z.object({
    type: z.literal("navigate"),
    path: z.string().startsWith("/"),
  }),
  z.object({ type: z.literal("start_checkout") }),
  z.object({ type: z.literal("handoff_human"), reason: z.string() }),
  z.object({
    type: z.literal("request_customer_info"),
    fields: z.array(z.enum(["cep", "email", "nome"])).min(1),
  }),
]);

export type ExecutionResult =
  | { ok: true; action: ChatAction; result?: Record<string, unknown> }
  | { ok: false; violation: ContractViolation };

export async function executeAction(action: ChatAction): Promise<ExecutionResult> {
  switch (action.type) {
    case "add_to_cart": {
      const variant = await prisma.variant.findFirst({
        where: { sku: action.variantSku },
        select: {
          id: true,
          stock: true,
          priceCents: true,
          product: { select: { slug: true, active: true } },
        },
      });
      if (!variant || !variant.product.active) {
        return {
          ok: false,
          violation: { code: "unknown_variant_sku", action },
        };
      }
      if (variant.stock < action.qty) {
        return {
          ok: false,
          violation: { code: "variant_out_of_stock", action },
        };
      }
      const cart = await ensureCartWritable();
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        create: { cartId: cart.id, variantId: variant.id, qty: action.qty },
        update: { qty: { increment: action.qty } },
      });
      revalidatePath("/carrinho");
      return {
        ok: true,
        action,
        result: {
          variantId: variant.id,
          productSlug: variant.product.slug,
          qty: action.qty,
        },
      };
    }

    case "update_cart_qty": {
      const cart = await ensureCartWritable();
      const item = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, variantId: action.variantId },
      });
      if (!item) return { ok: false, violation: { code: "cart_item_missing", action } };
      if (action.qty === 0) {
        await prisma.cartItem.delete({ where: { id: item.id } });
      } else {
        await prisma.cartItem.update({
          where: { id: item.id },
          data: { qty: action.qty },
        });
      }
      revalidatePath("/carrinho");
      return { ok: true, action };
    }

    case "remove_from_cart": {
      const cart = await ensureCartWritable();
      const item = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, variantId: action.variantId },
      });
      if (!item) return { ok: false, violation: { code: "cart_item_missing", action } };
      await prisma.cartItem.delete({ where: { id: item.id } });
      revalidatePath("/carrinho");
      return { ok: true, action };
    }

    case "apply_coupon": {
      const cart = await ensureCartWritable();
      const subtotalCents = cart.items.reduce(
        (acc, it) => acc + it.qty * it.variant.priceCents,
        0,
      );
      const evalResult = await evaluateCoupon(action.code, subtotalCents);
      if (!evalResult.ok) {
        return {
          ok: false,
          violation: { code: "invalid_coupon", action: { ...action, reason: evalResult.reason } as unknown as ChatAction },
        };
      }
      const jar = await cookies();
      jar.set(COUPON_COOKIE, evalResult.code, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: COUPON_COOKIE_MAX_AGE,
        path: "/",
      });
      revalidatePath("/carrinho");
      revalidatePath("/checkout");
      return {
        ok: true,
        action,
        result: { code: evalResult.code, discountCents: evalResult.discountCents },
      };
    }

    case "remove_coupon": {
      const jar = await cookies();
      jar.delete(COUPON_COOKIE);
      revalidatePath("/carrinho");
      revalidatePath("/checkout");
      return { ok: true, action };
    }

    case "show_product": {
      const product = await prisma.product.findFirst({
        where: { slug: action.slug, active: true },
        select: { slug: true },
      });
      if (!product) return { ok: false, violation: { code: "unknown_product_slug", action } };
      return { ok: true, action, result: { path: `/loja/${product.slug}` } };
    }

    case "navigate": {
      if (!NAV_WHITELIST.some((r) => r.test(action.path))) {
        return { ok: false, violation: { code: "navigate_not_whitelisted", action } };
      }
      return { ok: true, action, result: { path: action.path } };
    }

    case "start_checkout": {
      const cart = await ensureCartWritable();
      if (cart.items.length === 0) {
        return { ok: false, violation: { code: "empty_cart", action } };
      }
      return { ok: true, action, result: { path: "/checkout" } };
    }

    case "handoff_human": {
      // Surface in the UI; no direct side effect on storefront state beyond
      // marking the local thread. DivaHub's admin inbox is the work queue.
      return { ok: true, action };
    }

    case "request_customer_info":
      return { ok: true, action };
  }
}
