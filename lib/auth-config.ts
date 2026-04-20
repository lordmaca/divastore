import type { NextAuthConfig } from "next-auth";
import { Role } from "@/lib/generated/prisma/enums";

// Edge-safe shared config. Do NOT import Prisma/bcrypt/Node-only modules here —
// this file is loaded by proxy.ts which runs on the Edge runtime. The generated
// `enums.ts` is plain string consts and safe to import here.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: Role }).role ?? Role.CUSTOMER;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      session.user.role = (token.role as Role) ?? Role.CUSTOMER;
      return session;
    },
  },
} satisfies NextAuthConfig;
