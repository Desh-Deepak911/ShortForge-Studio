/** Discriminator for a single mix lane. */
export type AudioTrackType = "voiceover" | "background";

/** One playable audio source in the engine mix. */
export interface AudioTrack {
  id: string;
  type: AudioTrackType;
  src: string;
  fileName?: string;
  durationMs?: number;
  volume: number;
  playbackRate: number;
  enabled: boolean;
  startMs: number;
  endMs?: number;
  metadata?: Record<string, unknown>;
}

/** Combined voiceover + background music configuration for preview and export. */
export interface AudioMix {
  voiceover?: AudioTrack;
  background?: AudioTrack;
  masterDurationMs: number;
  duckingEnabled: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
}

/** Top-level AudioEngine state derived from story audio inputs. */
export interface AudioEngineState {
  mix: AudioMix;
  updatedAt: string;
}
