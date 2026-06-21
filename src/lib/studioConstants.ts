export const SAMPLE_TOPICS = [
  "Top 5 matches to watch: USA vs Iran, Portugal vs Argentina, Morocco vs Senegal, England vs Spain, France vs Norway",
  "Real Madrid comeback",
  "Messi masterclass",
  "Champions League final drama",
  "Last-minute winner",
  "Derby day chaos",
] as const;

export const WORKFLOW_STEPS = [
  { step: "01", title: "Story Brief", desc: "Describe your topic, duration, and tone" },
  { step: "02", title: "Story Draft", desc: "Refine the title and full narration" },
  { step: "03", title: "Production Timeline", desc: "Set scene timing, subtitles, and images" },
  { step: "04", title: "Narration", desc: "Generate spoken audio from your story" },
  { step: "05", title: "Preview", desc: "Review your vertical short before export" },
  { step: "06", title: "Export", desc: "Download a finished MP4 short" },
] as const;
