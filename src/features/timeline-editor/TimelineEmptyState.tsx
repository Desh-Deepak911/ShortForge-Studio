"use client";

import { Clapperboard, Timer } from "lucide-react";

import { StudioStatus } from "@/components/studio-status";

export type TimelineEmptyStateVariant = "no-scenes" | "unavailable";

export interface TimelineEmptyStateProps {
  variant: TimelineEmptyStateVariant;
}

const COPY: Record<
  TimelineEmptyStateVariant,
  { title: string; description: string; icon: typeof Clapperboard }
> = {
  "no-scenes": {
    title: "No scenes yet",
    description:
      "Use the timeline scene menu (⋮ on touch devices, or right-click on desktop) to insert your first scene.",
    icon: Clapperboard,
  },
  unavailable: {
    title: "Timeline preview unavailable",
    description: "Scene timing will appear once the story timeline can be built.",
    icon: Timer,
  },
};

/** Empty or unavailable timeline rail — presentation only. */
export default function TimelineEmptyState({ variant }: TimelineEmptyStateProps) {
  const { title, description, icon } = COPY[variant];

  return (
    <div data-timeline-empty={variant}>
      <StudioStatus
        variant="empty"
        layout="inline"
        title={title}
        description={description}
        icon={icon}
      />
    </div>
  );
}
