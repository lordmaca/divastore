import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Track } from "@/components/Track";
import { ChatMount } from "@/components/chat/ChatMount";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <Suspense fallback={null}>
        <Track />
      </Suspense>
      <div className="flex-1">{children}</div>
      <Footer />
      <Suspense fallback={null}>
        <WhatsAppButton />
      </Suspense>
      <Suspense fallback={null}>
        <ChatMount />
      </Suspense>
    </>
  );
}
