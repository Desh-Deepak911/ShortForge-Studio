"use client";

import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Download,
  Film,
  Info,
  Loader2,
  Share2,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";

import ExportSuccessSummary, {
  ChangeExportSettingsButton,
  CloseExportResultButton,
  ExportAgainButton,
  ExportDownloadAgainButton,
} from "@/components/export/ExportSuccessSummary";
import {
  ExportFallbackActions,
  resolveExportFallbackAudioOption,
} from "@/components/export/ExportFallbackActions";
import { buildExportFingerprint } from "@/components/export/build-export-fingerprint.utils";
import { StudioStatus } from "@/components/studio-status";
import { buildExportSuccessDiagnostics } from "@/components/export/build-export-success-diagnostics.utils";
import { buildAudioMixFromStory, getVoiceoverAvailability } from "@/features/audio";
import { prepareStoryVoiceoverForExport } from "@/features/drafts";
import {
  createInitialStorySynchronizationState,
  formatMissingSceneNumbersLabel,
  resolveExportBlockedMessage,
  resolveExportReadiness,
  useOptionalStorySync,
} from "@/features/story-sync";
import {
  applyStoryBackgroundMusic,
} from "@/features/story/utils";
import { useMixedMediaScenesEnabled } from "@/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext";
import BrandStingExportControls from "@/features/brand-sting/editor/BrandStingExportControls";
import { resolveAuthoritativeBrandStingDurationMs } from "@/features/brand-sting/domain/normalize-brand-sting";
import {
  useEngagementOverlaysEnabled,
  useKeyframedVisualEffectsEnabled,
  useShortForgeBrandStingEnabled,
  useSourceQualityIntelligenceEnabled,
  useVisualBeatDensityEnabled,
  useVisualRetentionCapabilitiesReady,
  useVisualRetentionPresetsEnabled,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import {
  buildExportDownloadFileName,
  exportFootieShort,
  getDefaultExportAudioMode,
  isExportQualityTier,
  isExportResolution,
  isHighQualityExportSettings,
  isWebmExportAvailable,
  normalizeExportSettings,
  resolveExportPath,
  resolveExportPathFormatNotice,
  resolveExportSettings,
  resolveWebmBackgroundMusicExportNotice,
  type ExportAudioMode,
  type ExportProgress,
} from "@/features/export/services";
import {
  prepareExportRequest,
  resolveCanonicalExportSuccessDurationSec,
  type ExportCapabilityResult,
} from "@/features/export/domain";
import {
  ExportFinalizationError,
  type ExportFallbackChoice,
} from "@/features/export/formats";
import { ExportCancelledError } from "@/features/export/runtime";
import {
  beginExportSessionAttempt,
  cancelExportSession,
  closeExportSessionResult,
  completeExportSession,
  createExportSession,
  exportSettingsToSessionOptions,
  failExportSession,
  openExportSessionConfiguration,
  resolveExportAgainOptions,
  sessionOptionsToExportSettings,
  type ExportSession,
} from "@/features/export/session";
import {
  logExportPipelineFailure,
  resolveExportUserFacingErrorMessage,
} from "@/features/export/utils/export-pipeline-forensics.utils";
import {
  EXPORT_NARRATION_UNAVAILABLE_WARNING,
  EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING,
  hasNarrationVoiceoverMismatch,
} from "@/features/export/utils/export-narration-voiceover.utils";
import {
  buildExportAudioDiagnostics,
  logExportAudioDiagnostics,
} from "@/features/export/utils/export-audio-input.utils";
import {
  isExportBackgroundMusicActiveFromMix,
} from "@/features/export/utils/export-background-music.utils";
import {
  downloadBlob,
  setExportDownloadCaptureHandler,
} from "@/features/export/utils/download.utils";
import {
  applyExportProfileToSettings,
  getExportProfile,
  getExportProfileNotices,
  getExportProfiles,
  resolveExportProfileId,
} from "@/features/export-profiles";
import { HeadlessExportSection } from "@/features/headless-renderer/product/ui/HeadlessExportSection";
import {
  studioBadge,
  studioChecklistItem,
  studioFieldLabel,
  studioGlass,
  studioIconBox,
  studioInput,
  studioOptionRow,
  studioPanel,
  studioGhostButton,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioSelect,
  studioSelectChevron,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSegmentedControlStacked,
  studioStepLabel,
  studioStickyMobileFooterAboveBar,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import { CREATOR_BRAND } from "@/lib/constants/product-brand";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { StoryCreationBrief } from "@/features/drafts/types";
import PublishingAssistantModal from "@/features/publishing/publishing-assistant/PublishingAssistantModal";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";

interface ExportPanelProps {
  script: FootieScript;
  disabled?: boolean;
  compact?: boolean;
  /** Called when export settings change so drafts can persist them on save. */
  onExportSettingsChange?: (settings: ExportSettings) => void;
  /** Optional — toggling background music updates the story via existing settings. */
  onScriptChange?: (script: FootieScript) => void;
  /** Optional — notifies parent when export is in progress (presentation gating). */
  onExportActiveChange?: (active: boolean) => void;
  /** Optional — draft context for post-export publishing assistant. */
  draftId?: string;
  creationBrief?: StoryCreationBrief;
  scriptMode?: ScriptMode;
  /** When true, tracks export fingerprint for stale post-export detection. */
  trackExportFingerprint?: boolean;
  /** Optional — notifies parent when export completes successfully (sync wiring only). */
  onExportSuccess?: () => void;
}

interface ChecklistItem {
  label: string;
  done: boolean;
  detail?: string;
}

type ExportState = ExportProgress["status"] | "idle";

interface ExportSuccessSnapshot {
  fileName: string;
  durationSec: number;
  resolution: string;
  voiceoverEnabled: boolean;
  backgroundMusicEnabled: boolean;
  diagnostics: string[];
  downloadBlob: Blob | null;
  downloadFileName: string;
  exportedFingerprint: string;
}

interface PendingExportContext {
  settings: ExportSettings;
  requestedVoiceover: boolean;
  requestedMusic: boolean;
  durationSec: number;
}

function resolveExportedAudioFlags(
  resultKind: ExportProgress["resultKind"] | undefined,
  requestedVoiceover: boolean,
  requestedMusic: boolean,
): Pick<ExportSuccessSnapshot, "voiceoverEnabled" | "backgroundMusicEnabled"> {
  switch (resultKind) {
    case "audio-full":
      return {
        voiceoverEnabled: requestedVoiceover,
        backgroundMusicEnabled: requestedMusic,
      };
    case "audio-voice-only":
      return {
        voiceoverEnabled: requestedVoiceover,
        backgroundMusicEnabled: false,
      };
    case "audio-silent":
      return {
        voiceoverEnabled: false,
        backgroundMusicEnabled: false,
      };
    default:
      return {
        voiceoverEnabled: requestedVoiceover,
        backgroundMusicEnabled: requestedMusic,
      };
  }
}

const FORMAT_HELPERS: Record<ExportSettings["format"], string> = {
  webm: "Faster export",
  mp4: "Wider compatibility",
};

function ExportSettingsSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 border-t border-border/20 pt-5 first:border-t-0 first:pt-0 ${className}`}>
      <div>
        <p className={`${studioFieldLabel} mb-0`}>{title}</p>
        {description ? <p className={`${studioSubtleText} mt-1`}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function ExportPanel({
  script,
  disabled = false,
  compact = false,
  onExportSettingsChange,
  onScriptChange,
  onExportActiveChange,
  draftId,
  creationBrief,
  scriptMode,
  trackExportFingerprint = false,
  onExportSuccess,
}: ExportPanelProps) {
  const storySync = useOptionalStorySync();
  const mixedMediaScenesEnabled = useMixedMediaScenesEnabled();
  const visualBeatDensityEnabled = useVisualBeatDensityEnabled();
  const sourceQualityIntelligenceEnabled =
    useSourceQualityIntelligenceEnabled();
  const keyframedVisualEffectsEnabled = useKeyframedVisualEffectsEnabled();
  const engagementOverlaysEnabled = useEngagementOverlaysEnabled();
  const visualRetentionCapabilitiesReady =
    useVisualRetentionCapabilitiesReady();
  const visualRetentionPresetsEnabled = useVisualRetentionPresetsEnabled();
  const shortForgeBrandStingCapability = useShortForgeBrandStingEnabled();
  const shortForgeBrandStingEnabled =
    visualRetentionCapabilitiesReady && shortForgeBrandStingCapability;
  const brandStingDurationMs = resolveAuthoritativeBrandStingDurationMs({
    shortForgeBrandStingEnabled,
    extensions: script.visualRetentionExtensions,
  });
  const syncState = storySync?.state ?? createInitialStorySynchronizationState();
  const exportReadiness = useMemo(
    () => resolveExportReadiness(script, syncState),
    [script, syncState],
  );
  const exportBlocked = !exportReadiness.canExport;
  const exportBlockedMessage = resolveExportBlockedMessage(script, syncState);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [availableFallbacks, setAvailableFallbacks] = useState<
    readonly ExportFallbackChoice[]
  >([]);
  const [exportRenderer, setExportRenderer] = useState<"browser" | "headless">("browser");
  const [exportSuccessSnapshot, setExportSuccessSnapshot] = useState<ExportSuccessSnapshot | null>(
    null,
  );
  const [exportSession, setExportSession] = useState<ExportSession>(() =>
    createExportSession(
      exportSettingsToSessionOptions(resolveExportSettings(script), {
        includeNarration: true,
        includeBackgroundMusic: false,
      }),
    ),
  );
  const pendingExportContextRef = useRef<PendingExportContext | null>(null);
  const capturedDownloadRef = useRef<{ blob: Blob; filename: string } | null>(null);
  const [includeNarrationPreference, setIncludeNarrationPreference] = useState(true);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [capabilityPreflight, setCapabilityPreflight] = useState<ExportCapabilityResult | null>(
    null,
  );
  const [capabilityPreflightKey, setCapabilityPreflightKey] = useState<string | null>(null);
  const baseExportSettings = useMemo(
    (): ExportSettings => resolveExportSettings(script),
    [script],
  );

  const scriptSettingsKey = useMemo(
    () => `${script.title}|${JSON.stringify(script.exportSettings ?? null)}`,
    [script.title, script.exportSettings],
  );

  const [userExportSettings, setUserExportSettings] = useState<{
    key: string;
    settings: ExportSettings;
  } | null>(null);

  const exportSettings = useMemo(() => {
    if (userExportSettings?.key === scriptSettingsKey) {
      return userExportSettings.settings;
    }
    return baseExportSettings;
  }, [baseExportSettings, userExportSettings, scriptSettingsKey]);

  const updateExportSettings = (patch: Partial<ExportSettings>) => {
    setUserExportSettings((current) => {
      const base =
        current?.key === scriptSettingsKey ? current.settings : baseExportSettings;
      const next = normalizeExportSettings({ ...base, ...patch }, script.title);
      onExportSettingsChange?.(next);
      return { key: scriptSettingsKey, settings: next };
    });
  };

  const exportProfiles = useMemo(() => getExportProfiles(), []);
  const activeExportProfileId = resolveExportProfileId(exportSettings);
  const activeExportProfile = useMemo(
    () => getExportProfile(activeExportProfileId),
    [activeExportProfileId],
  );
  const exportProfileNotices = useMemo(
    () => getExportProfileNotices(activeExportProfile, script),
    [activeExportProfile, script],
  );

  const handleExportProfileChange = (profileId: string) => {
    const profile = getExportProfile(profileId);
    if (!profile) {
      return;
    }

    setUserExportSettings((current) => {
      const base =
        current?.key === scriptSettingsKey ? current.settings : baseExportSettings;
      const next = applyExportProfileToSettings(base, profile, script);
      onExportSettingsChange?.(next);
      return { key: scriptSettingsKey, settings: next };
    });
  };

  const resolvedExportPath = useMemo(
    () => resolveExportPath(exportSettings),
    [exportSettings],
  );

  const sceneCount = script.scenes.length;
  const uploadedCount = exportReadiness.media.scenesWithMedia;
  const allImagesUploaded = exportReadiness.mediaComplete;
  const missingSceneLabel = formatMissingSceneNumbersLabel(
    script,
    exportReadiness.media.scenesMissingMedia,
  );
  const totalDuration = script.totalDuration;
  const isExporting =
    exportState === "preparing" ||
    exportState === "rendering" ||
    exportState === "loading-voiceover" ||
    exportState === "combining" ||
    exportState === "finalizing";

  useEffect(() => {
    onExportActiveChange?.(isExporting);
    return () => onExportActiveChange?.(false);
  }, [isExporting, onExportActiveChange]);

  const sessionExportObjectUrl = useMemo(() => {
    if (!exportSuccessSnapshot?.downloadBlob) {
      return undefined;
    }

    try {
      return URL.createObjectURL(exportSuccessSnapshot.downloadBlob);
    } catch {
      return undefined;
    }
  }, [exportSuccessSnapshot]);

  useEffect(() => {
    return () => {
      if (sessionExportObjectUrl) {
        URL.revokeObjectURL(sessionExportObjectUrl);
      }
    };
  }, [sessionExportObjectUrl]);

  const voiceoverAvailability = useMemo(
    () => getVoiceoverAvailability(script),
    [script],
  );
  const audioMix = useMemo(() => buildAudioMixFromStory(script), [script]);
  const voiceoverSrc = audioMix.voiceover?.src;
  const hasPersistedVoiceover = voiceoverAvailability.hasCanonicalVoiceover;
  const hasPlayableVoiceover = Boolean(voiceoverSrc);
  const narrationVoiceoverMismatch = useMemo(
    () => hasNarrationVoiceoverMismatch(script),
    [script],
  );
  const webmBackgroundMusicNotice = useMemo(
    () =>
      resolveWebmBackgroundMusicExportNotice({
        exportPath: resolvedExportPath.path,
        backgroundMusicActive: isExportBackgroundMusicActiveFromMix(audioMix),
      }),
    [audioMix, resolvedExportPath.path],
  );
  const checklist = useMemo<ChecklistItem[]>(
    () => [
      {
        label: "Story has scenes",
        done: exportReadiness.media.hasScenes,
        detail:
          sceneCount > 0
            ? `${sceneCount} scenes · ${formatDisplayDurationSec(totalDuration)} total`
            : "Add at least one scene",
      },
      {
        label: "Narration and voice synced",
        done: exportReadiness.storySynced && exportReadiness.voiceSynced,
        detail:
          exportReadiness.storySynced && exportReadiness.voiceSynced
            ? hasPersistedVoiceover
              ? hasPlayableVoiceover
                ? "Ready for preview and download"
                : "Persisted narration found — will restore before export"
              : "No narration yet — create it from your script."
            : exportReadiness.blockedReasons.find(
                (reason) => reason.includes("narration") || reason.includes("voice"),
              ) ?? "Update narration and regenerate voiceover",
      },
      {
        label: "Media complete",
        done: exportReadiness.mediaComplete,
        detail: allImagesUploaded
          ? `All ${sceneCount} scenes have images`
          : `${uploadedCount} of ${sceneCount} scenes ready${missingSceneLabel ? ` · missing: ${missingSceneLabel}` : ""}`,
      },
      {
        label: "Export settings ready",
        done: !resolvedExportPath.blocked,
        detail: resolvedExportPath.blocked
          ? resolvedExportPath.blockReason ?? "Selected export format is unavailable"
          : `${exportSettings.resolution} · ${exportSettings.format.toUpperCase()}`,
      },
      {
        label: "Ready to export",
        done: exportReadiness.isReady,
        detail: exportReadiness.isReady
          ? "All requirements met"
          : exportBlocked
            ? exportReadiness.blockedReasons[0] ?? "Export blocked"
            : exportReadiness.exportFresh
              ? "Ready to export"
              : "Export update available — story changed since last export",
      },
    ],
    [
      exportReadiness,
      sceneCount,
      totalDuration,
      hasPersistedVoiceover,
      hasPlayableVoiceover,
      allImagesUploaded,
      uploadedCount,
      missingSceneLabel,
      resolvedExportPath.blocked,
      resolvedExportPath.blockReason,
      exportSettings.resolution,
      exportSettings.format,
      exportBlocked,
    ],
  );

  const readyCount = checklist.filter((item) => item.done).length;
  const hasNarration = hasPersistedVoiceover;
  const includeNarration = hasNarration && includeNarrationPreference;
  const narrationUnavailableForExport =
    includeNarrationPreference && hasPersistedVoiceover && !hasPlayableVoiceover;
  const hasBackgroundMusicConfigured = Boolean(audioMix.background?.src);
  const includeBackgroundMusic =
    hasBackgroundMusicConfigured && Boolean(audioMix.background?.enabled);
  const exportAudioMode = useMemo((): ExportAudioMode => {
    if (!includeNarration) return "silent";
    return getDefaultExportAudioMode(true);
  }, [includeNarration]);

  const capabilityRequestKey = useMemo(
    () =>
      JSON.stringify({
        title: script.title,
        scenes: script.scenes.map((scene) => scene.id),
        exportSettings,
        exportAudioMode,
        includeBackgroundMusic,
        voiceoverUrl: script.voiceoverUrl ?? null,
        musicEnabled: script.backgroundMusic?.enabled ?? null,
        mixedMediaScenesEnabled,
        visualBeatDensityEnabled,
        sourceQualityIntelligenceEnabled,
        keyframedVisualEffectsEnabled,
        engagementOverlaysEnabled,
        shortForgeBrandStingEnabled,
        visualRetentionPresetsEnabled,
        visualRetentionCapabilitiesReady,
        brandStingDurationMs,
        sourceQualityExportTarget:
          exportSettings.resolution === "720x1280" ? "720p" : "1080p",
      }),
    [
      script.title,
      script.scenes,
      script.voiceoverUrl,
      script.backgroundMusic?.enabled,
      exportSettings,
      exportAudioMode,
      includeBackgroundMusic,
      mixedMediaScenesEnabled,
      visualBeatDensityEnabled,
      sourceQualityIntelligenceEnabled,
      keyframedVisualEffectsEnabled,
      engagementOverlaysEnabled,
      shortForgeBrandStingEnabled,
      visualRetentionPresetsEnabled,
      visualRetentionCapabilitiesReady,
      brandStingDurationMs,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    void prepareExportRequest({
      story: script,
      options: {
        audioMode: exportAudioMode,
        exportSettings,
      },
      includeBackgroundMusic,
      throwIfBlocked: false,
      mixedMediaScenesEnabled,
      visualBeatDensityEnabled,
      sourceQualityIntelligenceEnabled,
      keyframedVisualEffectsEnabled,
      engagementOverlaysEnabled,
      shortForgeBrandStingEnabled,
      visualRetentionPresetsEnabled,
      visualRetentionCapabilitiesReady,
      sourceQualityExportTarget:
        exportSettings.resolution === "720x1280" ? "720p" : "1080p",
    }).then((prepared) => {
      if (cancelled) return;
      setCapabilityPreflight(prepared.preflight);
      setCapabilityPreflightKey(capabilityRequestKey);
    }).catch(() => {
      if (cancelled) return;
      setCapabilityPreflight({
        supported: false,
        renderer: "blocked",
        warnings: [],
        blockers: [
          {
            code: "INVALID_MANIFEST",
            message: "Export preparation failed. Try again.",
          },
        ],
        estimatedCost: {
          estimatedFrames: 0,
          estimatedRawFrameBytes: 0,
          estimatedIntermediateBytes: 0,
          estimatedPeakMemoryBytes: 0,
          durationClass: "short",
          risk: "unsafe",
        },
        manifestFingerprint: "",
      });
      setCapabilityPreflightKey(capabilityRequestKey);
    });

    return () => {
      cancelled = true;
    };
  }, [
    script,
    exportSettings,
    exportAudioMode,
    includeBackgroundMusic,
    mixedMediaScenesEnabled,
    visualBeatDensityEnabled,
    sourceQualityIntelligenceEnabled,
    keyframedVisualEffectsEnabled,
    engagementOverlaysEnabled,
    shortForgeBrandStingEnabled,
    visualRetentionPresetsEnabled,
    visualRetentionCapabilitiesReady,
    capabilityRequestKey,
  ]);

  const capabilityPreflightStatus: 
    | "checking"
    | "ready"
    | "ready-with-warnings"
    | "blocked"
    | "server-required" =
    capabilityPreflightKey !== capabilityRequestKey || !capabilityPreflight
      ? "checking"
      : capabilityPreflight.renderer === "blocked"
        ? capabilityPreflight.blockers.some((blocker) => blocker.code === "SERVER_RENDERER_REQUIRED")
          ? "server-required"
          : "blocked"
        : capabilityPreflight.renderer === "server"
          ? "server-required"
          : capabilityPreflight.warnings.length > 0
            ? "ready-with-warnings"
            : "ready";

  const capabilityBlocked =
    capabilityPreflightStatus === "blocked" ||
    capabilityPreflightStatus === "server-required" ||
    capabilityPreflightStatus === "checking";
  const capabilityBlockerMessages =
    capabilityPreflight?.blockers.map((blocker) => blocker.message) ?? [];
  const capabilityWarningMessages =
    capabilityPreflight?.warnings.map((entry) => entry.message) ?? [];
  const exportWithNarration = exportAudioMode === "with-voice" && hasNarration;
  const showAudioMergeNote =
    exportWithNarration && isHighQualityExportSettings(exportSettings);
  const downloadFileName = buildExportDownloadFileName(exportSettings);
  const [exportWidth, exportHeight] = exportSettings.resolution
    .split("x")
    .map(Number);
  const isBusy = isExporting || disabled;
  const showResultScreen =
    exportSession.view === "result" &&
    (exportSession.status === "completed" ||
      exportSession.status === "failed" ||
      exportSession.status === "cancelled");
  const isPostExport =
    exportSession.status === "completed" &&
    exportSuccessSnapshot !== null &&
    exportSession.view === "result";
  const shouldTrackExportFingerprint = trackExportFingerprint || isPostExport;
  const currentExportFingerprint = useMemo(() => {
    if (!shouldTrackExportFingerprint) {
      return null;
    }

    // Editor script is already synced at DraftEditorFlow; fingerprint is presentation-only.
    return buildExportFingerprint({
      script,
      exportSettings,
      includeNarration,
      includeBackgroundMusic,
    });
  }, [
    shouldTrackExportFingerprint,
    script,
    exportSettings,
    includeNarration,
    includeBackgroundMusic,
  ]);
  const isExportStale =
    isPostExport &&
    exportSuccessSnapshot?.exportedFingerprint != null &&
    currentExportFingerprint != null &&
    exportSuccessSnapshot.exportedFingerprint !== currentExportFingerprint;
  const exportDisabledReason = isExporting
    ? "Export in progress"
    : exportBlocked
      ? exportBlockedMessage
      : resolvedExportPath.blocked
        ? resolvedExportPath.blockReason ?? "Selected export format is unavailable"
        : capabilityPreflightStatus === "checking"
          ? "Checking export..."
          : capabilityBlocked
            ? capabilityBlockerMessages[0] ??
              "This export configuration isn't available yet."
            : undefined;
  const exportAgainDisabled = isBusy || Boolean(exportDisabledReason);
  const activeFormat = exportSettings.format;
  const webmAvailable = isWebmExportAvailable();

  const handleBackgroundMusicToggle = (enabled: boolean) => {
    if (!onScriptChange || !hasBackgroundMusicConfigured) {
      return;
    }

    onScriptChange(applyStoryBackgroundMusic(script, { enabled }));
  };

  const handleExport = async (
    audioFallback?: "voice-only" | "silent" | "webm",
    optionsOverride?: ReturnType<typeof exportSettingsToSessionOptions>,
  ) => {
    setErrorMessage(null);
    setAvailableFallbacks([]);
    setExportMessage(null);
    // Keep last artifact until a new attempt starts so Change Settings can still download.
    setProgress(0);
    setExportSession((prev) => beginExportSessionAttempt(prev));

    const sessionOptions =
      optionsOverride ??
      exportSettingsToSessionOptions(exportSettings, {
        includeNarration,
        includeBackgroundMusic,
      });
    const attemptSettings = normalizeExportSettings(
      sessionOptionsToExportSettings(sessionOptions),
      script.title,
    );

    if (exportBlocked) {
      setExportState("error");
      setExportSuccessSnapshot(null);
      setErrorMessage(exportBlockedMessage ?? "Export is blocked.");
      setExportSession((prev) => failExportSession(prev));
      return;
    }

    if (
      capabilityPreflightStatus === "checking" ||
      capabilityPreflightStatus === "blocked" ||
      capabilityPreflightStatus === "server-required"
    ) {
      setExportState("error");
      setExportSuccessSnapshot(null);
      setErrorMessage(
        capabilityBlockerMessages[0] ??
          "This export configuration isn't available yet.",
      );
      setExportSession((prev) => failExportSession(prev));
      return;
    }

    setExportState("preparing");
    setExportSuccessSnapshot(null);
    pendingExportContextRef.current = null;
    capturedDownloadRef.current = null;
    setExportDownloadCaptureHandler((blob, filename) => {
      capturedDownloadRef.current = { blob, filename };
    });

    try {
      const exportPath = resolveExportPath(attemptSettings);

      if (exportPath.blocked) {
        setExportState("error");
        setErrorMessage(exportPath.blockReason ?? "Selected export format is unavailable.");
        setExportSession((prev) => failExportSession(prev));
        return;
      }

      const exportScript = prepareStoryVoiceoverForExport(syncFootieScript(script));
      const exportMix = buildAudioMixFromStory(exportScript);
      const resolvedExportAudioMode: ExportAudioMode = sessionOptions.includeNarration
        ? getDefaultExportAudioMode(true)
        : "silent";
      pendingExportContextRef.current = {
        settings: attemptSettings,
        requestedVoiceover: sessionOptions.includeNarration,
        requestedMusic: sessionOptions.includeBackgroundMusic,
        durationSec: resolveCanonicalExportSuccessDurationSec({
          story: exportScript,
          exportSettings: attemptSettings,
          audioMode: resolvedExportAudioMode,
          includeBackgroundMusic: sessionOptions.includeBackgroundMusic,
          mixedMediaScenesEnabled,
          keyframedVisualEffectsEnabled,
          engagementOverlaysEnabled,
          shortForgeBrandStingEnabled,
        }),
      };

      logExportAudioDiagnostics(
        buildExportAudioDiagnostics(
          exportScript,
          resolvedExportAudioMode,
          Boolean(exportMix.voiceover?.src),
        ),
        "export-panel",
      );

      if (sessionOptions.includeNarration && !exportMix.voiceover?.src) {
        setExportState("error");
        setErrorMessage(EXPORT_NARRATION_UNAVAILABLE_WARNING);
        setExportSession((prev) => failExportSession(prev));
        return;
      }

      // Every attempt builds a fresh ExportManifest via prepareExportRequest inside exportFootieShort.
      await exportFootieShort(
        exportScript,
        (update) => {
          setExportState(update.status);
          setProgress(update.progress);
          setExportMessage(update.message);

          if (update.status === "done") {
            const context = pendingExportContextRef.current;
            const settings = context?.settings ?? attemptSettings;
            const path = resolveExportPath(settings);
            const completedFileName = buildExportDownloadFileName(settings, path.path);
            const audioFlags = resolveExportedAudioFlags(
              update.resultKind,
              context?.requestedVoiceover ?? sessionOptions.includeNarration,
              context?.requestedMusic ?? sessionOptions.includeBackgroundMusic,
            );
            const downloadBlob = capturedDownloadRef.current?.blob ?? null;
            const downloadFileName =
              capturedDownloadRef.current?.filename ?? completedFileName;
            const fingerprint = buildExportFingerprint({
              script: exportScript,
              exportSettings: settings,
              includeNarration: context?.requestedVoiceover ?? sessionOptions.includeNarration,
              includeBackgroundMusic:
                context?.requestedMusic ?? sessionOptions.includeBackgroundMusic,
            });

            setExportSuccessSnapshot({
              fileName: completedFileName,
              durationSec: context?.durationSec ?? totalDuration,
              resolution: settings.resolution,
              ...audioFlags,
              diagnostics: buildExportSuccessDiagnostics(script, {
                runtimeWarning: update.warning,
                runtimeMessage: update.message,
              }),
              downloadBlob,
              downloadFileName,
              exportedFingerprint: fingerprint,
            });
            setExportSession((prev) =>
              completeExportSession(prev, {
                options: sessionOptions,
                artifact: downloadBlob
                  ? {
                      blob: downloadBlob,
                      fileName: downloadFileName,
                    }
                  : {
                      blob: new Blob(),
                      fileName: downloadFileName,
                    },
                manifestFingerprint: fingerprint,
                renderer: "browser",
              }),
            );
            onExportSuccess?.();
          }
        },
        {
          audioMode: resolvedExportAudioMode,
          exportSettings: attemptSettings,
          mixedMediaScenesEnabled,
          visualBeatDensityEnabled,
          sourceQualityIntelligenceEnabled,
          keyframedVisualEffectsEnabled,
          engagementOverlaysEnabled,
          shortForgeBrandStingEnabled,
          visualRetentionPresetsEnabled,
          visualRetentionCapabilitiesReady,
          sourceQualityExportTarget:
            attemptSettings.resolution === "720x1280" ? "720p" : "1080p",
          ...(audioFallback ? { audioFallback } : {}),
        },
      );
    } catch (error) {
      setExportState("error");
      setProgress(0);
      setExportMessage(null);
      logExportPipelineFailure(error);
      setErrorMessage(resolveExportUserFacingErrorMessage(error));
      if (error instanceof ExportCancelledError) {
        setExportSession((prev) => cancelExportSession(prev));
        setAvailableFallbacks([]);
      } else {
        setExportSession((prev) => failExportSession(prev));
        if (error instanceof ExportFinalizationError) {
          setAvailableFallbacks(error.availableFallbacks);
        } else {
          setAvailableFallbacks(["retry"]);
        }
      }
    } finally {
      setExportDownloadCaptureHandler(null);
    }
  };

  const handleExportAgain = () => {
    const againOptions = resolveExportAgainOptions(exportSession);
    const nextSettings = normalizeExportSettings(
      sessionOptionsToExportSettings(againOptions),
      script.title,
    );
    updateExportSettings(nextSettings);
    if (againOptions.includeNarration !== includeNarrationPreference) {
      setIncludeNarrationPreference(againOptions.includeNarration);
    }
    void handleExport(undefined, againOptions);
  };

  const handleChangeExportSettings = () => {
    setExportSession((prev) => openExportSessionConfiguration(prev));
    setErrorMessage(null);
    setAvailableFallbacks([]);
  };

  const handleCloseExportResult = () => {
    setExportSession((prev) => closeExportSessionResult(prev));
    setErrorMessage(null);
    setAvailableFallbacks([]);
    // Keep snapshot/settings as defaults — do not clear lastSuccessfulOptions.
  };

  const handleFallbackChoice = (choice: ExportFallbackChoice) => {
    const audioFallback = resolveExportFallbackAudioOption(choice);
    void handleExport(audioFallback);
  };  const handleDownloadAgain = () => {
    if (!exportSuccessSnapshot?.downloadBlob) {
      return;
    }

    downloadBlob(exportSuccessSnapshot.downloadBlob, exportSuccessSnapshot.downloadFileName);
  };

  return (
    <div className={`${compact ? "space-y-5" : "space-y-7"} min-w-0`}>
      {showResultScreen && exportSession.status === "completed" && exportSuccessSnapshot ? (
        <div className="space-y-4">
          <ExportSuccessSummary
            fileName={exportSuccessSnapshot.fileName}
            durationSec={exportSuccessSnapshot.durationSec}
            resolution={exportSuccessSnapshot.resolution}
            voiceoverEnabled={exportSuccessSnapshot.voiceoverEnabled}
            backgroundMusicEnabled={exportSuccessSnapshot.backgroundMusicEnabled}
            diagnostics={exportSuccessSnapshot.diagnostics}
            description={
              isExportStale
                ? "Your story changed after this export. Export again to update the video, or publish/download the previous version."
                : undefined
            }
          />

          {isExportStale ? (
            <StudioStatus
              variant="warning"
              layout="panel"
              icon={Info}
              description="Timeline, captions, images, audio, or export settings changed since the last render."
            />
          ) : null}

          {!draftId?.trim() ? (
            <StudioStatus
              variant="warning"
              layout="panel"
              icon={Info}
              description="Save this draft to enable publishing packages later."
            />
          ) : null}

          {isExportStale ? (
            <ExportAgainButton
              disabled={exportAgainDisabled}
              onClick={handleExportAgain}
              label="Export updated video"
              className={`${studioPrimaryButton} w-full`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPublishModalOpen(true)}
              className={`${studioPrimaryButton} w-full`}
            >
              <Share2 className="h-4 w-4" />
              Publish
            </button>
          )}

          {isExportStale ? (
            <button
              type="button"
              onClick={() => setPublishModalOpen(true)}
              className={`${studioSecondaryButton} w-full`}
            >
              <Share2 className="h-4 w-4" />
              Publish previous export
            </button>
          ) : null}

          <ExportDownloadAgainButton
            disabled={!exportSuccessSnapshot.downloadBlob}
            onClick={handleDownloadAgain}
            className={`${studioSecondaryButton} w-full`}
          />

          <ExportAgainButton
            disabled={exportAgainDisabled}
            onClick={handleExportAgain}
            className={`${studioSecondaryButton} w-full`}
          />

          <ChangeExportSettingsButton
            disabled={isBusy}
            onClick={handleChangeExportSettings}
            className={`${studioSecondaryButton} w-full`}
          />

          <CloseExportResultButton
            onClick={handleCloseExportResult}
            className={`${studioGhostButton} w-full justify-center`}
          />

          {exportAgainDisabled && exportDisabledReason ? (
            <p className={`${studioSubtleText} text-center text-xs`}>{exportDisabledReason}</p>
          ) : null}

          <PublishingAssistantModal
            key={publishModalOpen ? exportSuccessSnapshot.downloadFileName : "closed"}
            open={publishModalOpen}
            onOpenChange={setPublishModalOpen}
            script={script}
            exportSettings={exportSettings}
            exportFileName={exportSuccessSnapshot.downloadFileName}
            durationSec={exportSuccessSnapshot.durationSec}
            draftId={draftId}
            creationBrief={creationBrief}
            scriptMode={scriptMode}
            objectUrl={sessionExportObjectUrl}
          />
        </div>
      ) : showResultScreen && exportSession.status === "failed" ? (
        <div className="space-y-4">
          <StudioStatus
            variant="error"
            layout="panel"
            title="Export failed"
            description={errorMessage ?? "Export could not be completed."}
          />
          {availableFallbacks.length > 0 ? (
            <ExportFallbackActions
              availableFallbacks={availableFallbacks}
              onChoose={handleFallbackChoice}
              disabled={isBusy}
            />
          ) : (
            <ExportAgainButton
              disabled={exportAgainDisabled}
              onClick={() => void handleExport()}
              label="Retry"
              className={`${studioPrimaryButton} w-full`}
            />
          )}
          <ChangeExportSettingsButton
            disabled={isBusy}
            onClick={handleChangeExportSettings}
            className={`${studioSecondaryButton} w-full`}
          />
          <CloseExportResultButton
            onClick={handleCloseExportResult}
            className={`${studioGhostButton} w-full justify-center`}
          />
        </div>
      ) : showResultScreen && exportSession.status === "cancelled" ? (
        <div className="space-y-4">
          <StudioStatus
            variant="warning"
            layout="panel"
            title="Export cancelled"
            description="Resume is not supported. Start a new export or change settings."
          />
          <ExportAgainButton
            disabled={exportAgainDisabled}
            onClick={handleExportAgain}
            className={`${studioPrimaryButton} w-full`}
          />
          <ChangeExportSettingsButton
            disabled={isBusy}
            onClick={handleChangeExportSettings}
            className={`${studioSecondaryButton} w-full`}
          />
          <CloseExportResultButton
            onClick={handleCloseExportResult}
            className={`${studioGhostButton} w-full justify-center`}
          />
        </div>
      ) : (
        <>
      {exportSuccessSnapshot?.downloadBlob && exportSession.view === "configuration" ? (
        <div className="space-y-2">
          <StudioStatus
            variant="warning"
            layout="panel"
            icon={Info}
            description="Previous export is still available to download while you change settings."
          />
          <ExportDownloadAgainButton
            disabled={!exportSuccessSnapshot.downloadBlob}
            onClick={handleDownloadAgain}
            className={`${studioSecondaryButton} w-full`}
          />
        </div>
      ) : null}
      {!compact ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={studioIconBox}>
              <Film className="h-4.5 w-4.5 text-accent" strokeWidth={1.75} />
            </div>
            <div>
              <p className={studioStepLabel}>Export</p>
              <h2 className={studioSectionTitle}>Export</h2>
              <p className={studioSectionDesc}>Render a vertical 9:16 video from your timeline.</p>
            </div>
          </div>
          <span className={`${studioBadge} self-start`}>
            <span className="font-semibold text-foreground/90">{readyCount}/{checklist.length}</span>
            <span className="text-muted">checks</span>
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Pre-publish checklist</p>
          <span className={`${studioBadge} shrink-0`}>
            <span className="font-semibold text-foreground/90">{readyCount}/{checklist.length}</span>
          </span>
        </div>
      )}

      {compact ? (
        <details className="rounded-xl bg-surface-elevated/25 ring-1 ring-border/20 lg:hidden">
          <summary className="cursor-pointer list-none px-3.5 py-3 text-xs text-muted [&::-webkit-details-marker]:hidden">
            Pre-publish checklist ·{" "}
            <span className="font-medium text-foreground/85">
              {readyCount}/{checklist.length} ready
            </span>
          </summary>
          <ul className="space-y-2 border-t border-border/20 px-2 pb-2 pt-1">
            {checklist.map((item) => (
              <li key={`mobile-${item.label}`} className={studioChecklistItem(item.done)}>
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${item.done ? "text-foreground/90" : "text-muted"}`}
                  >
                    {item.label}
                  </p>
                  {item.detail ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ul className={`space-y-2 ${compact ? "hidden lg:block" : ""}`}>
        {checklist.map((item) => (
          <li key={item.label} className={studioChecklistItem(item.done)}>
            {item.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.done ? "text-foreground/90" : "text-muted"}`}>
                {item.label}
              </p>
              {item.detail && (
                <p className="mt-0.5 truncate text-xs text-muted">{item.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!allImagesUploaded && sceneCount > 0 && (
        <StudioStatus
          variant="warning"
          layout="panel"
          title="Media incomplete"
          description={`${uploadedCount} of ${sceneCount} scenes have images.${missingSceneLabel ? ` Attach images to ${missingSceneLabel} before exporting.` : " Attach images to all scenes before exporting."}`}
        />
      )}

      {exportBlocked &&
        exportReadiness.blockedReasons.some(
          (reason) => reason.includes("narration") || reason.includes("voice"),
        ) && (
        <StudioStatus
          variant="warning"
          layout="panel"
          title="Story sync required"
          description={
            exportReadiness.blockedReasons.find(
              (reason) => reason.includes("narration") || reason.includes("voice"),
            ) ?? "Update narration and regenerate voiceover before exporting."
          }
        />
      )}

      {exportReadiness.warnings.includes(
        "Export is based on an older version of this story.",
      ) &&
        exportReadiness.canExport && (
        <StudioStatus
          variant="warning"
          layout="panel"
          title="Export update available"
          description="Your story changed since the last export. You can export an updated video."
        />
      )}

      {narrationUnavailableForExport && (
        <StudioStatus
          variant="warning"
          layout="panel"
          title="Narration needs restoration"
          description="Saved narration was found but is not playable yet. Export will restore it automatically, or regenerate narration if export still fails."
        />
      )}

      {narrationVoiceoverMismatch && hasPersistedVoiceover && (
        <StudioStatus
          variant="warning"
          layout="panel"
          title="Script changed after narration"
          description={EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING}
        />
      )}

      {isExporting && (
        <div className={`${studioGlass} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-sm font-medium text-foreground/90">
                {exportState === "preparing" && "Preparing your video..."}
                {exportState === "rendering" && `Exporting video (${progress}%)`}
                {exportState === "loading-voiceover" && "Adding narration..."}
                {exportState === "combining" && (exportMessage ?? "Adding audio to your video")}
                {exportState === "finalizing" && "Almost done..."}
              </span>
            </div>
            <span className="text-sm font-semibold text-muted">{progress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-accent/70 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {exportMessage && (
            <p className="mt-3 text-xs text-muted">{exportMessage}</p>
          )}
          <p className="mt-2 text-[11px] text-muted">
            {exportWithNarration
              ? "Drawing your scenes, then adding narration. Keep this tab open."
              : `Drawing your scenes (~${formatDisplayDurationSec(totalDuration)}). Keep this tab open.`}
          </p>
        </div>
      )}

      <div className={`${studioPanel} min-w-0`}>
        <ExportSettingsSection
          title="Export for"
          description="Pick a platform preset — you can still change format and quality below."
        >
          <label htmlFor="export-profile" className={studioFieldLabel}>
            Platform preset
          </label>
          <div className="relative mt-1.5">
            <select
              id="export-profile"
              value={activeExportProfileId}
              onChange={(e) => handleExportProfileChange(e.target.value)}
              disabled={isBusy}
              className={studioSelect}
            >
              {exportProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevron} />
          </div>
          {activeExportProfile ? (
            <p className={studioSubtleText}>{activeExportProfile.description}</p>
          ) : null}
          {exportProfileNotices.length > 0 ? (
            <ul className="space-y-1.5 pt-1">
              {exportProfileNotices.map((notice) => (
                <li key={notice.id} className="text-xs leading-relaxed text-muted">
                  {notice.message}
                </li>
              ))}
            </ul>
          ) : null}
        </ExportSettingsSection>

        <ExportSettingsSection
          title="Format"
          description="Choose how the video file is encoded."
        >
          <div
            className={compact ? studioSegmentedControlStacked : studioSegmentedControl}
            role="radiogroup"
            aria-label="Export format"
          >
            <button
              type="button"
              role="radio"
              aria-checked={activeFormat === "webm"}
              disabled={isBusy || !webmAvailable}
              title={webmAvailable ? "Faster export" : "WebM unavailable in this browser"}
              onClick={() => updateExportSettings({ format: "webm" })}
              className={activeFormat === "webm" ? studioSegmentActive : studioSegment}
            >
              WebM
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={activeFormat === "mp4"}
              disabled={isBusy}
              title="Wider compatibility"
              onClick={() => updateExportSettings({ format: "mp4" })}
              className={activeFormat === "mp4" ? studioSegmentActive : studioSegment}
            >
              MP4
            </button>
          </div>
          <p className={studioSubtleText}>{FORMAT_HELPERS[activeFormat]}</p>
          <p className={studioSubtleText}>{resolveExportPathFormatNotice(resolvedExportPath.path)}</p>
          {resolvedExportPath.blocked ? (
            <StudioStatus
              variant="warning"
              layout="inline"
              description={resolvedExportPath.blockReason}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="export-resolution" className={studioFieldLabel}>
                Resolution
              </label>
              <div className="relative mt-1.5">
                <select
                  id="export-resolution"
                  value={exportSettings.resolution}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isExportResolution(value)) {
                      updateExportSettings({ resolution: value });
                    }
                  }}
                  disabled={isBusy}
                  className={studioSelect}
                >
                  <option value="1080x1920">1080×1920</option>
                  <option value="720x1280">720×1280</option>
                </select>
                <ChevronDown className={studioSelectChevron} />
              </div>
              <p className={`${studioSubtleText} mt-1.5`}>
                Browser export supports 720p and 1080p on this device. 4K is available
                with Headless below.
              </p>
            </div>
            <div>
              <label htmlFor="export-quality-tier" className={studioFieldLabel}>
                Quality
              </label>
              <div className="relative mt-1.5">
                <select
                  id="export-quality-tier"
                  value={exportSettings.quality}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isExportQualityTier(value)) {
                      updateExportSettings({ quality: value });
                    }
                  }}
                  disabled={isBusy}
                  className={studioSelect}
                >
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
                <ChevronDown className={studioSelectChevron} />
              </div>
            </div>
          </div>
        </ExportSettingsSection>

        <ExportSettingsSection title="Audio" description="Choose what plays in the exported file.">
          <label
            className={`${studioOptionRow(includeNarration && hasNarration)} ${
              !hasNarration || isBusy ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={includeNarration}
              onChange={(e) => setIncludeNarrationPreference(e.target.checked)}
              disabled={isBusy || !hasNarration}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium text-foreground/90">Include narration</span>
              <span className="mt-0.5 block text-xs text-muted">
                {hasNarration
                  ? `Includes spoken audio in your ${exportSettings.format.toUpperCase()} file`
                  : "No narration yet — create it from your script."}
              </span>
            </span>
          </label>

          <label
            className={`${studioOptionRow(includeBackgroundMusic)} ${
              !hasBackgroundMusicConfigured || isBusy || !onScriptChange
                ? "cursor-not-allowed opacity-50"
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={includeBackgroundMusic}
              onChange={(e) => handleBackgroundMusicToggle(e.target.checked)}
              disabled={isBusy || !hasBackgroundMusicConfigured || !onScriptChange}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium text-foreground/90">
                Include background music
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {hasBackgroundMusicConfigured
                  ? "Mixes your story background music into the export."
                  : "Add background music in the storyboard section to enable."}
              </span>
            </span>
          </label>

          {webmBackgroundMusicNotice ? (
            <StudioStatus
              variant="warning"
              layout="inline"
              description={webmBackgroundMusicNotice}
            />
          ) : null}

          {showAudioMergeNote ? (
            <p className={studioSubtleText}>
              Narration merge can take longer for high-quality browser exports — keep this
              tab open until the download finishes.
            </p>
          ) : null}
        </ExportSettingsSection>

        <ExportSettingsSection title="Branding">
          <label className={`${studioOptionRow(true)} cursor-default`}>
            <input
              type="checkbox"
              checked
              disabled
              readOnly
              aria-readonly="true"
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium text-foreground/90">
                {CREATOR_BRAND} watermark
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Adds your channel mark to the video.
              </span>
            </span>
          </label>
          {onScriptChange ? (
            <BrandStingExportControls
              script={script}
              disabled={isBusy}
              shortForgeBrandStingEnabled={shortForgeBrandStingEnabled}
              capabilitiesReady={visualRetentionCapabilitiesReady}
              onScriptCommit={(result) => {
                if (result.status === "ok") {
                  onScriptChange(result.script);
                }
              }}
            />
          ) : null}
        </ExportSettingsSection>

        <ExportSettingsSection
          title="Filename"
          description="Name the file before you download — the extension matches your format."
        >
          <label htmlFor="export-file-name" className="sr-only">
            Video filename
          </label>
          <input
            id="export-file-name"
            type="text"
            value={exportSettings.fileName}
            onChange={(e) => updateExportSettings({ fileName: e.target.value })}
            disabled={isBusy}
            className={studioInput}
            placeholder="my-football-short"
            autoComplete="off"
            spellCheck={false}
          />
          <p className={studioSubtleText}>
            Downloads as <span className="text-foreground/80">{downloadFileName}</span>
          </p>
        </ExportSettingsSection>

        <HeadlessExportSection
          draftId={draftId}
          story={script}
          exportSettings={exportSettings}
          audioMode={exportAudioMode}
          includeBackgroundMusic={includeBackgroundMusic}
          contentDurationMs={Math.max(
            1,
            Math.round(totalDuration * 1000) + brandStingDurationMs,
          )}
          renderDurationMs={Math.max(
            1,
            Math.round(totalDuration * 1000) + brandStingDurationMs + 400,
          )}
          browserBusy={isExporting}
          disabled={disabled}
          onRendererChange={setExportRenderer}
        />

        <ExportSettingsSection
          title="Download"
          className={compact ? studioStickyMobileFooterAboveBar : undefined}
        >
          {/* Shared structured preflight guidance for Browser and Headless. */}
          {capabilityPreflightStatus === "ready-with-warnings"
            ? capabilityWarningMessages.map((message) => (
                <StudioStatus
                  key={message}
                  variant="warning"
                  layout="inline"
                  description={message}
                />
              ))
            : null}
          {exportRenderer === "browser" ? (
            <>
              {capabilityPreflightStatus === "checking" ? (
                <StudioStatus
                  variant="loading"
                  layout="inline"
                  description="Checking export..."
                />
              ) : null}
              {capabilityPreflightStatus === "ready" ? (
                <StudioStatus variant="success" layout="inline" description="Ready to export." />
              ) : null}
              {capabilityPreflightStatus === "blocked" ||
              capabilityPreflightStatus === "server-required"
                ? capabilityBlockerMessages.map((message) => (
                    <StudioStatus
                      key={message}
                      variant="error"
                      layout="inline"
                      description={message}
                    />
                  ))
                : null}
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={
                  isBusy ||
                  resolvedExportPath.blocked ||
                  exportBlocked ||
                  capabilityBlocked
                }
                title={exportDisabledReason}
                className={`${studioPrimaryButton} w-full`}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : capabilityPreflightStatus === "checking" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking export...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" strokeWidth={1.75} />
                    Export Video
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-muted">
                {exportWidth}×{exportHeight} · 9:16 vertical
                {exportWithNarration && " · with narration"}
                {includeBackgroundMusic && " · with background music"}
              </p>
            </>
          ) : (
            <p className={studioSubtleText}>
              Browser Export stays available when you switch Renderer back to Browser.
              Headless failure never starts a browser export automatically.
            </p>
          )}
        </ExportSettingsSection>
      </div>
        </>
      )}

      {errorMessage && !showResultScreen ? (
        <div className="space-y-3">
          <StudioStatus variant="error" layout="panel" description={errorMessage} />
          {availableFallbacks.length > 0 ? (
            <ExportFallbackActions
              availableFallbacks={availableFallbacks}
              onChoose={handleFallbackChoice}
              disabled={isBusy}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
