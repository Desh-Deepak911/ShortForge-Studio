"use client";

import { ExternalLink, Search } from "lucide-react";

import { getSceneImageSearchQuery } from "@/lib/imageSearch";
import type { FootieScene } from "@/types/footiebitz";

interface ImageSourceHelperProps {
  scene: FootieScene;
}

const IMAGE_SOURCES = [
  {
    name: "Unsplash",
    buildUrl: (query: string) => `https://unsplash.com/s/photos/${query}`,
  },
  {
    name: "Pexels",
    buildUrl: (query: string) => `https://www.pexels.com/search/${query}/`,
  },
  {
    name: "Wikimedia Commons",
    buildUrl: (query: string) =>
      `https://commons.wikimedia.org/w/index.php?search=${query}&title=Special:MediaSearch&type=image`,
  },
] as const;

export default function ImageSourceHelper({ scene }: ImageSourceHelperProps) {
  const rawQuery = getSceneImageSearchQuery(scene);

  if (!rawQuery) {
    return null;
  }

  const encodedQuery = encodeURIComponent(rawQuery);

  return (
    <div className="rounded-xl border border-white/10 bg-[#06080f]/80 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        <Search className="h-3.5 w-3.5" />
        Find free images
      </div>

      <p className="mb-3 text-xs text-zinc-500">
        Search: <span className="text-zinc-400">&ldquo;{rawQuery}&rdquo;</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {IMAGE_SOURCES.map((source) => (
          <a
            key={source.name}
            href={source.buildUrl(encodedQuery)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/40 hover:text-white"
          >
            {source.name}
            <ExternalLink className="h-3 w-3 text-zinc-500" />
          </a>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Check license before publishing, especially for real match/player photos.
      </p>
    </div>
  );
}
