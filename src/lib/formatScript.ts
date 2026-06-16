import type { FootieScript } from "@/types/footiebitz";

export function formatFullScript(script: FootieScript): string {
  const lines = [script.title, "", script.hook, ""];

  script.scenes.forEach((scene, index) => {
    lines.push(`Scene ${index + 1} (${scene.duration}s)`, scene.subtitle, "");
  });

  if (script.caption) {
    lines.push("Caption", script.caption, "");
  }

  if (script.hashtags.length > 0) {
    lines.push(script.hashtags.join(" "));
  }

  return lines.join("\n").trim();
}

export function formatHashtags(hashtags: string[]): string {
  return hashtags.join(" ");
}
