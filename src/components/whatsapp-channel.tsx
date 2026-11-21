import { ExternalLink, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { WHATSAPP_CHANNEL } from "@/lib/ward109";

// Link to the ward office's WhatsApp channel. Renders nothing until the channel link is set.
export function WhatsAppChannelLink({
  tone = "default",
  className,
}: {
  tone?: "default" | "onDark" | "text";
  className?: string;
}) {
  if (!WHATSAPP_CHANNEL) return null;
  const styles = {
    default:
      "inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-semibold text-[#073E1F] shadow-sm transition-colors hover:bg-[#1ebe5b]",
    onDark:
      "inline-flex h-12 items-center gap-2 rounded-md border border-white/40 px-6 text-sm whitespace-nowrap font-semibold text-white transition-colors hover:bg-white/10",
    text: "inline-flex items-center gap-1.5 hover:text-white",
  };
  return (
    <a
      href={WHATSAPP_CHANNEL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(styles[tone], className)}
    >
      <MessageCircle className="size-4" />
      Follow on WhatsApp
      {tone !== "text" && <ExternalLink className="size-3.5 opacity-70" aria-hidden />}
      <span className="sr-only">(opens WhatsApp)</span>
    </a>
  );
}
