import { useSyncExternalStore } from "react";

import { getInstallState, SERVER_INSTALL_STATE, subscribeInstallState } from "@/lib/pwa";

/** Live install status: whether the app can be installed here, or already is. */
export function useInstallState() {
  return useSyncExternalStore(subscribeInstallState, getInstallState, () => SERVER_INSTALL_STATE);
}
