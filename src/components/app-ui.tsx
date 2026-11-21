import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { forwardRef, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  PRIORITY_INFO,
  STATUS_INFO,
  type ComplaintPriority,
  type ComplaintStatus,
} from "@/lib/ward109";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 break-words">
        {eyebrow && (
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">{actions}</div>
      )}
    </div>
  );
}

const badge =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({
  status,
  className,
}: {
  status: ComplaintStatus;
  className?: string;
}) {
  const info = STATUS_INFO[status];
  return <span className={cn(badge, info.tone, className)}>{info.label}</span>;
}

export function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  const info = PRIORITY_INFO[priority];
  return <span className={cn(badge, info.tone)}>{info.label}</span>;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "navy",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: "navy" | "teal" | "amber" | "green";
  hint?: string | undefined;
}) {
  const tones = {
    navy: "bg-secondary text-primary",
    teal: "bg-accent text-accent-foreground",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "hidden size-9 shrink-0 place-items-center rounded-lg sm:grid",
            tones[tone],
          )}
        >
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="size-6" />
      </span>
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const noticeStyles = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: Info, iconTone: "text-sky-600" },
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: CheckCircle2,
    iconTone: "text-emerald-600",
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-950",
    icon: AlertTriangle,
    iconTone: "text-amber-600",
  },
  error: { box: "border-red-200 bg-red-50 text-red-950", icon: XCircle, iconTone: "text-red-600" },
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof noticeStyles;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const s = noticeStyles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-4 text-sm", s.box, className)}
    >
      <s.icon className={cn("mt-0.5 size-4.5 shrink-0", s.iconTone)} />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const NativeSelect = forwardRef<HTMLSelectElement, ComponentProps<"select">>(
  function NativeSelect({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-card px-3 text-base shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:opacity-50 aria-invalid:border-destructive md:h-10 md:text-sm",
          className,
        )}
        {...props}
      />
    );
  },
);

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-col items-start justify-between gap-3 border-b px-4 py-4 sm:flex-row sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
