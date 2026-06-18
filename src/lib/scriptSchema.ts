export const FOOTIE_SCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    caption: { type: "string" },
    hashtags: {
      type: "array",
      items: { type: "string" },
    },
    scenes: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          duration: { type: "number" },
          subtitle: { type: "string" },
          imagePrompt: { type: "string" },
          imageSearchQuery: { type: "string" },
        },
        required: ["id", "duration", "subtitle", "imagePrompt", "imageSearchQuery"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "hook", "caption", "hashtags", "scenes"],
  additionalProperties: false,
} as const;
