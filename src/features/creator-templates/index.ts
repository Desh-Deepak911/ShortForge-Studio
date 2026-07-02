export type {
  CreatorTemplate,
  CreatorTemplateCategory,
  CreatorTemplateDefaults,
  CreatorTemplateId,
  CreatorTemplateMusicProfile,
  CreatorTemplatePromptHints,
  CreatorTemplateStyleProfile,
  ResolvedCreatorTemplateDefaults,
} from "./creator-template.types";

export {
  CREATOR_TEMPLATE_IDS,
  getCreatorTemplateFromRegistry,
  getCreatorTemplateRegistry,
} from "./creator-template.registry";

export {
  DEFAULT_TARGET_DURATION_SEC,
  buildTemplatePromptHints,
  formatTemplatePromptHints,
  getCreatorTemplate,
  getCreatorTemplates,
  getCreatorTemplatesByCategory,
  isCreatorTemplateId,
  resolveCreatorTemplateDefaults,
} from "./creator-template.utils";

export {
  applyCreatorTemplateToBrief,
  clearCreatorTemplateFromBrief,
  mergeCreationBriefWithTemplateSelection,
} from "./creator-template-brief.utils";

export {
  buildCreatorTemplatePromptContext,
  formatCreatorTemplatePromptBlock,
  resolveCreatorTemplatePromptBlock,
} from "./creator-template-prompt.utils";
