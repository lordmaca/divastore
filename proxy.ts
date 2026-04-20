import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth-config";
import { Role } from "@/lib/generated/prisma/enums";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // /checkout is guest-friendly — the form + server action create a customer
  // row from the email on submit. Only /minha-conta and /admin require auth.
  if (pathname.startsWith("/minha-conta") && !req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && req.auth?.user?.role !== Role.ADMIN) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/minha-conta/:path*", "/admin/:path*"],
};
