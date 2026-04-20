"use server";

import { signOut } from "@/lib/auth";

// Shared admin sign-out so client components (e.g. AdminMenu) can embed it in
// a <form> without pulling NextAuth into the client bundle.
export async function adminSignOut() {
  await signOut({ redirectTo: "/" });
}
