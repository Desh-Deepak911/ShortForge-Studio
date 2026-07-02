export type {
  PublishingMetadataGenerationDiagnostics,
  PublishingMetadataGeneratorInput,
  PublishingMetadataGeneratorResult,
  PublishingMetadataStyleKind,
  ResolvedPublishingMetadataStyle,
} from "./publishing-metadata-generator.types";

export {
  X_POST_CHAR_LIMIT,
  YOUTUBE_TAG_MAX,
  YOUTUBE_TAG_MIN,
  YOUTUBE_TITLE_MAX_CHARS,
  buildInstagramCaption,
  buildStyleCallToAction,
  buildStyleHashtags,
  buildStyleHook,
  buildStyleTags,
  buildStyleTitle,
  buildThumbnailText,
  buildXHashtags,
  buildXPost,
  buildYoutubeDescription,
  extractFirstSentence,
  extractNarrationExcerpt,
  normalizeHashtag,
  normalizeHashtags,
  resolvePublishingMetadataStyle,
  tokenizeKeywords,
  truncateText,
  trimText,
} from "./publishing-metadata-generator.utils";

export {
  applyPublishingMetadataToPackage,
  generatePublishingMetadata,
} from "./publishing-metadata-generator.service";
