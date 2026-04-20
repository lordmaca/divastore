import type { Metadata } from "next";
import { Poppins, Dancing_Script } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import { getSetting } from "@/lib/settings";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dancingScript = Dancing_Script({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Brilho de Diva — Joias que realçam sua beleza",
    template: "%s — Brilho de Diva",
  },
  description:
    "Joias e acessórios para realçar sua beleza. Coleção exclusiva Brilho de Diva, com entrega para todo o Brasil.",
  metadataBase: new URL(SITE_URL),
  applicationName: "Brilho de Diva",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Brilho de Diva",
    description: "Realce sua Beleza, Brilhe como uma Diva!",
    url: SITE_URL,
    locale: "pt_BR",
    type: "website",
    siteName: "Brilho de Diva",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brilho de Diva",
    description: "Realce sua Beleza, Brilhe como uma Diva!",
  },
  themeColor: "#d23a85",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read Google Search Console token from settings so the admin can rotate it
  // without a redeploy. Silently empty when unset.
  const gsc = await getSetting("seo.googleVerification");
  return (
    <html
      lang="pt-BR"
      className={`${poppins.variable} ${dancingScript.variable} h-full antialiased`}
    >
      <head>
        {gsc.content ? <meta name="google-site-verification" content={gsc.content} /> : null}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
