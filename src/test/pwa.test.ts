import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectPlatform } from "@/lib/pwa";

const publicDir = join(__dirname, "../../public");

type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
  shortcuts: { url: string }[];
};

describe("Installable app", () => {
  const manifest = JSON.parse(
    readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"),
  ) as Manifest;

  it("has the manifest fields browsers require to offer installation", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("ships every icon the manifest and page head reference", () => {
    const files = [
      ...manifest.icons.map((icon) => icon.src),
      "/icons/apple-touch-icon.png",
      "/offline.html",
      "/sw.js",
    ];
    for (const file of files) expect(existsSync(join(publicDir, file)), file).toBe(true);
  });

  it("never caches pages or cross-origin data in the service worker", () => {
    const sw = readFileSync(join(publicDir, "sw.js"), "utf8");
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/);
    expect(sw).toMatch(/request\.method !== "GET"\) return/);
    const pageHandler = sw.slice(
      sw.indexOf("async function networkWithOfflinePage"),
      sw.indexOf('self.addEventListener("fetch"'),
    );
    expect(pageHandler).toContain("fetch(request)");
    expect(pageHandler).not.toMatch(/\.put\(/);
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", 5, "ios"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5, "ios"],
    ["Mozilla/5.0 (Linux; Android 15; SM-A556E) Chrome/140.0 Mobile", 5, "android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Edg/140.0", 0, "desktop"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0, "desktop"],
  ] as const)("detects %s as %s touch points → %s", (ua, touch, platform) => {
    expect(detectPlatform(ua, touch)).toBe(platform);
  });
});
