import dynamic from "next/dynamic";
import { getSetting } from "@/lib/settings";

// Server boundary that checks the kill switch before loading the client
// bundle. If `divinha.enabled` is off, nothing ships to the browser at all.

const ChatWidget = dynamic(() => import("./ChatWidget"), {
  loading: () => null,
});

export async function ChatMount() {
  const flag = await getSetting("divinha.enabled");
  if (!flag.enabled) return null;
  return <ChatWidget />;
}
