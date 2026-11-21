import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Notice, SectionCard } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useUserId } from "@/hooks/use-auth";
import { db, friendlyError } from "@/lib/db";
import { formatDateTime } from "@/lib/ward109";

export function TicketConversation({ id, closed }: { id: string; closed: boolean }) {
  const userId = useUserId()!;
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const messages = useQuery({
    queryKey: ["ticket-messages", id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("ticket_messages")
        .select("id,author_id,author_role,body,created_at")
        .eq("complaint_id", id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.reverse();
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("ticket_messages")
        .insert({ complaint_id: id, author_id: userId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      setBody("");
      toast.success("Message sent");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ticket-messages", id] }),
        client.invalidateQueries({ queryKey: ["complaints"] }),
      ]);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim() && !send.isPending) send.mutate();
  }
  return (
    <SectionCard
      title="Messages & replies"
      description="A private conversation between you and the ward office. The latest 500 messages refresh automatically while this page is open."
    >
      {messages.isError ? (
        <Notice tone="error" title="Messages could not be loaded">
          {friendlyError(messages.error)}
          <Button variant="outline" size="sm" onClick={() => messages.refetch()}>
            Try again
          </Button>
        </Notice>
      ) : messages.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading messages…
        </p>
      ) : !messages.data.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4 shrink-0" />
          Ask a question or add information about this ticket.
        </p>
      ) : (
        <ol
          className="max-h-[32rem] space-y-3 overflow-y-auto pr-1"
          aria-label="Ticket conversation"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.data.map((message) => (
            <li
              key={message.id}
              className={`rounded-lg border p-4 ${message.author_role === "staff" ? "border-teal/20 bg-accent/40" : "bg-secondary/40"}`}
            >
              <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                <strong className="text-foreground">
                  {message.author_id === userId
                    ? "You"
                    : message.author_role === "staff"
                      ? "Ward office"
                      : "Resident"}
                </strong>
                <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {message.body}
              </p>
            </li>
          ))}
        </ol>
      )}
      {closed ? (
        <p className="mt-5 text-sm text-muted-foreground">
          This ticket is closed. Use the reopen action if the fault remains unresolved.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label htmlFor="ticket-message" className="block text-sm font-medium">
            Your message
          </label>
          <Textarea
            id="ticket-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            maxLength={4000}
            rows={4}
            placeholder="Write a reply or ask for an update…"
            disabled={send.isPending}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {body.length}/4000 · Saved to this ticket
            </span>
            <Button type="submit" disabled={!body.trim() || send.isPending}>
              <Send className="size-4" />
              {send.isPending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
