/**
 * Frozen headless Chromium page contract — worker ↔ bundled page-render.iife.js.
 * Privacy-safe identifiers only; never paths, URLs, or manifest payloads.
 */

import { EXPORT_RENDERER_CONTRACT_VERSION } from "@/features/export/domain/headless-safe";

/** Expected manifest rendererContractVersion for v3 headless page bootstrap. */
export const HEADLESS_PAGE_CONTRACT_VERSION =
  EXPORT_RENDERER_CONTRACT_VERSION;

export const HEADLESS_PAGE_GLOBAL_BOOTSTRAP = "__SHORTFORGE_HEADLESS_BOOTSTRAP__" as const;
export const HEADLESS_PAGE_GLOBAL_RENDER_FRAME =
  "__SHORTFORGE_HEADLESS_RENDER_FRAME__" as const;
export const HEADLESS_PAGE_GLOBAL_GET_PNG = "__SHORTFORGE_HEADLESS_GET_PNG__" as const;
export const HEADLESS_PAGE_GLOBAL_CONTRACT_VERSION =
  "__SHORTFORGE_HEADLESS_PAGE_CONTRACT_VERSION__" as const;

export const HEADLESS_PAGE_GLOBAL_API_NAMES = Object.freeze([
  HEADLESS_PAGE_GLOBAL_BOOTSTRAP,
  HEADLESS_PAGE_GLOBAL_RENDER_FRAME,
  HEADLESS_PAGE_GLOBAL_GET_PNG,
  HEADLESS_PAGE_GLOBAL_CONTRACT_VERSION,
] as const);

export type HeadlessPageGlobalApiName =
  (typeof HEADLESS_PAGE_GLOBAL_API_NAMES)[number];
