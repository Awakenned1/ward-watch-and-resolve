import { createFileRoute } from "@tanstack/react-router";
import {
  BellRing,
  CircleCheck,
  Download,
  EllipsisVertical,
  Monitor,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/app-ui";
import { CommunityCard, CommunityPage } from "@/components/community-page";
import { Button } from "@/components/ui/button";
import { useInstallState } from "@/hooks/use-install-state";
import { communityHead } from "@/lib/community";
import { promptInstall, type InstallPlatform } from "@/lib/pwa";
import { APP_NAME } from "@/lib/ward109";

const description = `Install ${APP_NAME} on your phone for one-tap fault reporting and ticket updates. It is free, takes a few seconds and needs no app store.`;

export const Route = createFileRoute("/app")({
  head: () => communityHead("Get the app", description),
  component: AppPage,
});

function AppPage() {
  return (
    <CommunityPage title={`Get the ${APP_NAME} app`} description={description}>
      <InstallPanel />
      <div className="grid gap-5 md:grid-cols-2">
        <Steps
          id="android"
          icon={Smartphone}
          title="Android phones"
          steps={[
            <>Open this page in Chrome, Samsung Internet or Edge.</>,
            <>
              Tap <strong>Install app</strong> above. If you don't see it, open the browser menu{" "}
              <EllipsisVertical className="inline size-4 align-text-bottom" aria-label="menu" />.
            </>,
            <>
              Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then
              confirm.
            </>,
          ]}
        />
        <Steps
          id="iphone"
          icon={Smartphone}
          title="iPhone and iPad"
          steps={[
            <>Open this page in Safari. Chrome and Edge also work on iOS 16.4 and later.</>,
            <>
              Tap the Share button{" "}
              <Share className="inline size-4 align-text-bottom" aria-label="Share" /> at the bottom
              or top of the screen.
            </>,
            <>
              Scroll down, tap <strong>Add to Home Screen</strong>{" "}
              <SquarePlus className="inline size-4 align-text-bottom" aria-hidden="true" />, then
              tap <strong>Add</strong>.
            </>,
          ]}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <CommunityCard icon={Zap} title="Faster reporting">
          <p>
            Open {APP_NAME} from your home screen and report a fault in a few taps, with your
            phone's location and camera photos.
          </p>
        </CommunityCard>
        <CommunityCard icon={BellRing} title="Stay up to date">
          <p>
            Your tickets, replies from the ward office and neighbourhood news are one tap away.
            Press and hold the icon for shortcuts.
          </p>
        </CommunityCard>
        <CommunityCard icon={ShieldCheck} title="Private and light">
          <p>
            The app uses the same secure account as the website. Your reports stay in your account,
            not on the phone, and updates install automatically.
          </p>
        </CommunityCard>
      </div>
      <Notice title="Using a computer?">
        Chrome and Edge can install {APP_NAME} too: select the install icon{" "}
        <Monitor className="inline size-4 align-text-bottom" aria-hidden="true" /> in the address
        bar. To install on your phone, open this website in your phone's browser and choose{" "}
        <strong>Get the app</strong> from the menu.
      </Notice>
    </CommunityPage>
  );
}

const platformLabel: Record<InstallPlatform, string> = {
  android: "your Android phone",
  ios: "your iPhone",
  desktop: "this device",
};

function InstallPanel() {
  const state = useInstallState();
  const [busy, setBusy] = useState(false);

  if (state.installed) {
    return (
      <Notice tone="success" title={`${APP_NAME} is installed`}>
        You're using the app. Open it any time from your home screen or app list.
      </Notice>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
      <img
        src="/icons/icon-192.png"
        alt=""
        width={96}
        height={96}
        className="size-20 shrink-0 rounded-2xl sm:size-24"
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-semibold">Install on {platformLabel[state.platform]}</h2>
        {state.canPrompt ? (
          <p className="mt-1 text-muted-foreground">
            Adds {APP_NAME} to your home screen like any other app.
          </p>
        ) : state.platform === "ios" ? (
          <p className="mt-1 text-muted-foreground">
            Follow the iPhone steps below to add it to your home screen.
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">
            Use your browser menu to install it. The steps for your phone are below.
          </p>
        )}
      </div>
      {state.canPrompt ? (
        <Button
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (await promptInstall()) toast.success(`${APP_NAME} was added to your device`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
          Install app
        </Button>
      ) : (
        <Button asChild size="lg" variant="outline">
          <a href={state.platform === "ios" ? "#iphone" : "#android"}>
            <CircleCheck className="size-4" /> Show me how
          </a>
        </Button>
      )}
    </section>
  );
}

function Steps({
  id,
  icon: Icon,
  title,
  steps,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  steps: ReactNode[];
}) {
  return (
    <section
      id={id}
      className="min-w-0 scroll-mt-24 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-accent text-teal">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
