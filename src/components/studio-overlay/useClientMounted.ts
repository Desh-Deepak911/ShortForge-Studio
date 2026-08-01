"use client";

import { useSyncExternalStore } from "react";

import {
  getClientMountedSnapshot,
  getServerMountedSnapshot,
  subscribeClientMounted,
} from "./client-mounted";

/** True only after hydration — safe to create DOM portals. */
export function useClientMounted(): boolean {
  return useSyncExternalStore(
    subscribeClientMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
}
