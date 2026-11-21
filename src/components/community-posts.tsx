import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Pencil, Plus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Notice, PageHeader } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUserId } from "@/hooks/use-auth";
import { useReferenceData } from "@/hooks/use-reference-data";
import { db, friendlyError } from "@/lib/db";
import type { Tables } from "@/lib/db-types";
import { formatDateTime } from "@/lib/ward109";

type Post = Tables<"community_posts">;

export function CommunityPosts({
  moderation = false,
  postId,
}: {
  moderation?: boolean;
  postId?: string;
}) {
  const userId = useUserId();
  const client = useQueryClient();
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [removing, setRemoving] = useState<Post | null>(null);
  const [moderating, setModerating] = useState<Post | null>(null);
  const [reason, setReason] = useState("");
  const posts = useQuery({
    queryKey: ["community-posts", moderation, mine, userId, page, postId],
    staleTime: 30_000,
    queryFn: async () => {
      let query = db.from("community_posts").select("*").order("created_at", { ascending: false });
      if (postId) query = query.eq("id", postId);
      else if (mine && userId) query = query.eq("author_id", userId);
      else if (!moderation) query = query.eq("is_hidden", false);
      const { data, error } = await query.range(page * 20, page * 20 + 19);
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["community-posts"] });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("community_posts")
        .delete()
        .eq("id", removing!.id)
        .eq("author_id", userId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      setRemoving(null);
      toast.success("Post deleted");
      await refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const moderate = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("moderate_community_post", {
        _id: moderating!.id,
        _hidden: !moderating!.is_hidden,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setModerating(null);
      setReason("");
      toast.success("Moderation saved");
      await refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className={moderation ? "" : "mx-auto max-w-3xl px-4 py-8 sm:py-10"}>
      {postId && (
        <Button asChild variant="ghost" className="mb-4">
          <Link to="/community">
            <ArrowLeft className="size-4" />
            Community
          </Link>
        </Button>
      )}
      <PageHeader
        eyebrow={moderation ? "Ward management" : "Your neighbourhood"}
        title={moderation ? "Community moderation" : "Community channel"}
        description={
          moderation
            ? "Review public resident posts. Give a reason when hiding content; authors can still see and edit their hidden posts."
            : "Stories, ideas and helpful updates from residents. Everyone is welcome."
        }
        actions={
          userId ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Write a post
            </Button>
          ) : (
            <Button asChild>
              <Link to="/auth" search={{ redirect: "/community" }}>
                Sign in to post
              </Link>
            </Button>
          )
        }
      />
      {!moderation && (
        <Notice className="mt-5" title="Community posts are public">
          Your post and first name are visible to everyone. Keep contact details, street addresses
          and ticket information private.{" "}
          <Link to="/report" className="font-semibold underline">
            Report a fault privately
          </Link>{" "}
          for help from the ward office. Be respectful; staff may hide harmful or irrelevant posts.
        </Notice>
      )}
      {!postId && !moderation && userId && (
        <div className="mt-5 flex gap-2" role="group" aria-label="Filter community posts">
          <Button
            variant={mine ? "outline" : "default"}
            onClick={() => {
              setMine(false);
              setPage(0);
            }}
          >
            Community feed
          </Button>
          <Button
            variant={mine ? "default" : "outline"}
            onClick={() => {
              setMine(true);
              setPage(0);
            }}
          >
            My posts
          </Button>
        </div>
      )}
      <div className="mt-6 space-y-4">
        {posts.isPending ? (
          <PageLoader />
        ) : posts.isError ? (
          <Notice tone="error" title="Posts could not be loaded">
            {friendlyError(posts.error)}
            <Button variant="outline" onClick={() => posts.refetch()}>
              Try again
            </Button>
          </Notice>
        ) : !posts.data.length ? (
          <EmptyState
            icon={Users}
            title={postId ? "Post unavailable" : "No posts yet"}
            description={
              postId
                ? "This post may have been removed or hidden."
                : "Share the first story or helpful update from your neighbourhood."
            }
          />
        ) : (
          posts.data.map((post) => (
            <article key={post.id} className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
              <p className="text-xs text-muted-foreground">
                {post.author_name} · {formatDateTime(post.created_at)}
                {post.updated_at !== post.created_at ? " · Edited" : ""}
              </p>
              <h2 className="mt-2 text-xl font-semibold [overflow-wrap:anywhere]">
                {postId ? (
                  post.title
                ) : (
                  <Link to="/community/$id" params={{ id: post.id }} className="hover:text-teal">
                    {post.title}
                  </Link>
                )}
              </h2>
              {post.is_hidden && (
                <Notice tone="warning" className="mt-3" title="Hidden by a moderator">
                  {post.moderation_reason}
                </Notice>
              )}
              <p className="mt-3 text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {postId || moderation
                  ? post.body
                  : post.body.slice(0, 500) + (post.body.length > 500 ? "…" : "")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!postId && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/community/$id" params={{ id: post.id }}>
                      Read post
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
                {post.author_id === userId && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(post)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(post)}>
                      Delete
                    </Button>
                  </>
                )}
                {moderation && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setModerating(post);
                      setReason("");
                    }}
                  >
                    {post.is_hidden ? "Restore post" : "Hide post"}
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {!postId && (
        <div className="mt-6 flex justify-between gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={posts.isPending || (posts.data?.length ?? 0) < 20}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {editing && <PostEditor post={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your post?</DialogTitle>
            <DialogDescription>
              This removes “{removing?.title}” from the community channel.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={remove.isPending} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete post"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!moderating}
        onOpenChange={(open) => {
          if (!open && !moderate.isPending) setModerating(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moderating?.is_hidden ? "Restore post" : "Hide post"}</DialogTitle>
            <DialogDescription>
              {moderating?.is_hidden
                ? "The post will be visible to the community again."
                : "Explain why this post is being hidden. The author will see the reason."}
            </DialogDescription>
          </DialogHeader>
          {!moderating?.is_hidden && (
            <Field id="moderation-reason" label="Reason">
              <Textarea
                id="moderation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </Field>
          )}
          <Button
            disabled={moderate.isPending || (!moderating?.is_hidden && reason.trim().length < 3)}
            onClick={() => moderate.mutate()}
          >
            {moderate.isPending ? "Saving…" : "Save moderation"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: Post | "new";
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const userId = useUserId()!;
  const reference = useReferenceData();
  const [title, setTitle] = useState(post === "new" ? "" : post.title);
  const [body, setBody] = useState(post === "new" ? "" : post.body);
  const [consent, setConsent] = useState(post !== "new");
  const save = useMutation({
    mutationFn: async () => {
      const values = { title: title.trim(), body: body.trim() };
      if (post === "new") {
        if (!reference.data?.ward.id)
          throw new Error("Ward information is unavailable. Please try again.");
        const { error } = await db
          .from("community_posts")
          .insert({ ...values, ward_id: reference.data.ward.id, author_id: userId });
        if (error) throw error;
      } else {
        const { error } = await db
          .from("community_posts")
          .update(values)
          .eq("id", post.id)
          .eq("author_id", userId);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(post === "new" ? "Post published" : "Post saved");
      await onSaved();
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (consent && !save.isPending) save.mutate();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post === "new" ? "Write a community post" : "Edit your post"}</DialogTitle>
          <DialogDescription>
            Published posts show your first name. Share neighbourhood news and ideas without
            personal contact details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field id="post-title" label="Title">
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={160}
              required
            />
          </Field>
          <Field
            id="post-body"
            label="Your story"
            hint="10–10,000 characters. Plain text; separate paragraphs with a blank line."
          >
            <Textarea
              id="post-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              minLength={10}
              maxLength={10000}
              rows={10}
              required
            />
          </Field>
          {post === "new" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
                className="mt-1 size-4 shrink-0 accent-teal"
              />
              I understand my first name and this post will be public, and I agree to keep the
              community respectful.
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                save.isPending ||
                !consent ||
                title.trim().length < 3 ||
                body.trim().length < 10 ||
                (post === "new" && !reference.data)
              }
            >
              {save.isPending ? "Saving…" : post === "new" ? "Publish post" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
