// Installable app support: service worker registration and the browser's install prompt.
// Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once, possibly before React
// hydrates, so the listener is attached when this module loads on the client.

export type InstallPlatform = "ios" | "android" | "desktop";

export type InstallState = {
  /** The browser offered an install prompt that the app can show from a button. */
  canPrompt: boolean;
  /** Running from the home screen, or installed during this visit. */
  installed: boolean;
  platform: InstallPlatform;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const SERVER_INSTALL_STATE: InstallState = {
  canPrompt: false,
  installed: false,
  platform: "desktop",
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
let snapshot: InstallState = SERVER_INSTALL_STATE;
const listeners = new Set<() => void>();

export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS reports itself as a Mac, so touch support tells the two apart.
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1))
    return "ios";
  if (/android/i.test(userAgent)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function computeState(): InstallState {
  return {
    canPrompt: deferredPrompt !== null,
    installed: installedThisVisit || isStandalone(),
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
  };
}

function update() {
  snapshot = computeState();
  listeners.forEach((listener) => listener());
}

export function subscribeInstallState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallState(): InstallState {
  return snapshot;
}

/** Shows the browser's install dialog. Resolves true when the resident accepts. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  update();
  return outcome === "accepted";
}

/** Registers the offline-page service worker in production builds only. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
    console.warn("Service worker registration failed", error);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    update();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedThisVisit = true;
    update();
  });
  snapshot = computeState();
}
