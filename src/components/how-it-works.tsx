import {
  BatteryFull,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Signal,
  Wifi,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { JOURNEY_PHASES, JOURNEY_STEPS } from "@/lib/community";
import { cn } from "@/lib/utils";

const SLIDE_MS = 7000;
const total = JOURNEY_STEPS.length;
const pad = (n: number) => String(n).padStart(2, "0");

// "How it works" slideshow: every step of the resident journey with a real screen from the app.
// Autoplay starts only in view, pauses on hover or focus, stops once the visitor navigates, and
// stays off for visitors who prefer reduced motion.
export function HowItWorks() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry!.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running = playing && inView && !held;
  const step = JOURNEY_STEPS[index]!;
  const phaseNumber = JOURNEY_PHASES.findIndex((p) => p.id === step.phase) + 1;

  // Manual navigation hands control to the visitor, so autoplay stops.
  function goTo(i: number) {
    setPlaying(false);
    setIndex((i + total) % total);
  }

  function onListKeyDown(e: KeyboardEvent<HTMLOListElement>) {
    const keys: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: total - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = (keys[e.key]! + total) % total;
    goTo(next);
    listRef.current?.querySelectorAll("button")[next]?.focus();
  }

  function onPointerUp(e: PointerEvent) {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) > 40) goTo(index + (dx < 0 ? 1 : -1));
  }

  return (
    <section
      ref={sectionRef}
      className="mx-auto max-w-6xl px-4 pt-16 pb-14"
      aria-roledescription="carousel"
      aria-labelledby="how-it-works-title"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">How it works</p>
          <h2 id="how-it-works-title" className="mt-1 text-2xl font-bold sm:text-3xl">
            From fault to resolution
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            {total} steps, from logging the fault with the City to confirming the fix. These are the
            real screens you will use.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause slideshow" : "Play slideshow"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <span className="w-16 text-center font-mono text-sm text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{pad(index + 1)}</span> / {pad(total)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => goTo(index - 1)}
            aria-label="Previous step"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            className="rounded-full"
            onClick={() => goTo(index + 1)}
            aria-label="Next step"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-12">
        {/* Step list (large screens): grouped by phase, active step expanded. */}
        <ol
          ref={listRef}
          className="hidden space-y-5 lg:block"
          aria-label="Steps"
          onKeyDown={onListKeyDown}
        >
          {JOURNEY_PHASES.map((phase, p) => (
            <li key={phase.id}>
              <p className="mb-1.5 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Stage {p + 1} · {phase.label}
              </p>
              <ol className="space-y-1">
                {JOURNEY_STEPS.map((s, i) => {
                  if (s.phase !== phase.id) return null;
                  const active = i === index;
                  const done = i < index;
                  return (
                    <li key={s.title}>
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        aria-current={active ? "step" : undefined}
                        tabIndex={active ? 0 : -1}
                        className={cn(
                          "flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          active ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-secondary/70",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                            active && "bg-teal text-teal-foreground",
                            done && "bg-accent text-accent-foreground",
                            !active && !done && "bg-secondary text-muted-foreground",
                          )}
                          aria-hidden="true"
                        >
                          {done ? <Check className="size-3.5" /> : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block font-semibold",
                              active ? "text-foreground" : "text-foreground/75",
                            )}
                          >
                            {s.title}
                          </span>
                          <span
                            className={cn(
                              "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
                              active ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                            )}
                          >
                            <span className="overflow-hidden text-sm leading-relaxed text-muted-foreground">
                              <span className="block pt-1">{s.body}</span>
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>

        <div>
          {/* Stage: the active screen in a phone frame. */}
          <div
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-strong px-6 pt-8 pb-0 sm:px-10 sm:pt-10"
            onPointerDown={(e) => (swipeStart.current = e.clientX)}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStart.current = null)}
          >
            <div
              className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-teal/35 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-28 -left-16 size-64 rounded-full bg-teal/20 blur-3xl"
              aria-hidden="true"
            />
            <div
              role="group"
              aria-roledescription="slide"
              aria-label={`Step ${index + 1} of ${total}: ${step.title}`}
              aria-live={running ? "off" : "polite"}
              className="relative mx-auto w-full max-w-[270px] touch-pan-y select-none lg:max-w-[290px]"
            >
              <div className="rounded-t-[2.6rem] border-[9px] border-b-0 border-slate-950 bg-slate-950 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)]">
                <div className="overflow-hidden rounded-t-[1.95rem] bg-primary">
                  <div
                    className="relative flex h-7 items-center justify-between px-6 text-[10px] font-semibold text-primary-foreground"
                    aria-hidden="true"
                  >
                    <span>9:41</span>
                    <span className="absolute top-1.5 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-950" />
                    <span className="flex items-center gap-1">
                      <Signal className="size-3" />
                      <Wifi className="size-3" />
                      <BatteryFull className="size-3.5" />
                    </span>
                  </div>
                  <div className="relative aspect-[390/600] overflow-hidden bg-background">
                    {JOURNEY_STEPS.map((s, i) => (
                      <img
                        key={s.image}
                        src={s.image}
                        alt={i === index ? s.alt : ""}
                        aria-hidden={i !== index}
                        width={780}
                        height={1560}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                        className={cn(
                          "absolute inset-x-0 top-0 w-full transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
                          i === index ? "opacity-100" : "translate-y-2 opacity-0",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step text (small screens), where the list above is hidden. */}
          <div className="mt-5 min-h-28 lg:hidden">
            <p className="text-xs font-semibold tracking-wider text-teal uppercase">
              Stage {phaseNumber} · Step {index + 1} of {total}
            </p>
            <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>

          {/* Progress: one segment per step, grouped by stage; the active one fills while playing. */}
          <div className="mt-4 flex gap-3 lg:mt-5">
            {JOURNEY_PHASES.map((phase) => (
              <div
                key={phase.id}
                className="flex gap-1"
                style={{ flexGrow: JOURNEY_STEPS.filter((s) => s.phase === phase.id).length }}
              >
                {JOURNEY_STEPS.map((s, i) =>
                  s.phase !== phase.id ? null : (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => goTo(i)}
                      className="group min-w-0 flex-1 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Step ${i + 1}: ${s.title}`}
                      aria-current={i === index ? "step" : undefined}
                    >
                      <span className="block h-1.5 overflow-hidden rounded-full bg-border group-hover:bg-input">
                        <span
                          key={i === index ? `active-${index}` : "idle"}
                          className={cn(
                            "block h-full origin-left rounded-full bg-teal",
                            i < index && "scale-x-100",
                            i > index && "scale-x-0",
                            i === index &&
                              (playing
                                ? "animate-[journey-progress_linear_forwards]"
                                : "scale-x-100"),
                          )}
                          style={
                            i === index && playing
                              ? {
                                  animationDuration: `${SLIDE_MS}ms`,
                                  animationPlayState: running ? "running" : "paused",
                                }
                              : undefined
                          }
                          onAnimationEnd={() => setIndex((index + 1) % total)}
                        />
                      </span>
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
