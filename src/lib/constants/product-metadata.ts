import type { Metadata } from "next";

import { PRODUCT_NAME } from "./product-brand";

export const PRODUCT_DESCRIPTION = `${PRODUCT_NAME} turns football ideas into narrated shorts. Write, edit, preview, and publish from one place.`;

export const rootMetadata: Metadata = {
  title: {
    default: `${PRODUCT_NAME} — Narrated Football Shorts`,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: PRODUCT_DESCRIPTION,
};

export function pageMetadata(title: string, description?: string): Metadata {
  return description ? { title, description } : { title };
}
