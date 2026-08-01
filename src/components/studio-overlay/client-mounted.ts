/**
 * Hydration-safe "client mounted" signal for portal hosts.
 *
 * Server snapshot and the first client hydration render are both `false`
 * (omit portals). After hydration, React switches to the client snapshot
 * (`true`) so portals can mount without a server/client tree mismatch.
 */

export function subscribeClientMounted(onStoreChange: () => void): () => void {
  // Snapshot divergence after hydration is enough; no external subscription.
  void onStoreChange;
  return () => {};
}

export function getClientMountedSnapshot(): boolean {
  return true;
}

export function getServerMountedSnapshot(): boolean {
  return false;
}
