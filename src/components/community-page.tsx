import { Link } from "@tanstack/react-router";
import { ArrowRight, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ACCESS_STATEMENT } from "@/lib/ward109";

export function CommunityPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="relative isolate overflow-hidden rounded-2xl bg-primary px-6 py-10 text-white sm:px-10 sm:py-14">
        <div
          className="pointer-events-none absolute -top-24 -right-24 -z-10 size-80 rounded-full bg-teal/25 blur-3xl"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold tracking-[0.16em] text-teal-200 uppercase">
          For every resident
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-bold sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
          {description}
        </p>
      </header>
      <div className="mt-8 space-y-8 sm:mt-10">{children}</div>
      <section className="mt-10 rounded-2xl border bg-accent p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <Users className="mt-1 hidden size-7 shrink-0 text-teal sm:block" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">A place for the whole community</h2>
            <p className="mt-2 text-muted-foreground">
              {ACCESS_STATEMENT} No party membership is required.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Fault handling is currently configured for Ward 109, Johannesburg.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild>
                <Link to="/report">
                  Report a fault <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/auth" search={{ mode: "sign-up" }}>
                  Create an account
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

export function CommunityCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <span className="grid size-11 place-items-center rounded-xl bg-accent text-teal">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
