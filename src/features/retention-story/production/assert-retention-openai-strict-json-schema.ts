/**
 * Provider-free OpenAI Structured Outputs (strict) JSON Schema checks.
 * additionalProperties must be false; every properties key must be required.
 */

export type RetentionOpenAiStrictJsonSchemaIssueCode =
  | "not_object_schema"
  | "additional_properties_not_false"
  | "required_not_array"
  | "required_missing_property";

export interface RetentionOpenAiStrictJsonSchemaIssue {
  readonly path: string;
  readonly code: RetentionOpenAiStrictJsonSchemaIssueCode;
  readonly propertyName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function inspectObjectSchema(
  schema: Record<string, unknown>,
  path: string,
  issues: RetentionOpenAiStrictJsonSchemaIssue[],
): void {
  if (schema.additionalProperties !== false) {
    issues.push({ path, code: "additional_properties_not_false" });
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const propertyNames = Object.keys(properties);
  if (!Array.isArray(schema.required)) {
    if (propertyNames.length > 0) {
      issues.push({ path, code: "required_not_array" });
    }
  } else {
    const required = new Set(
      schema.required.filter((item): item is string => typeof item === "string"),
    );
    for (const name of propertyNames) {
      if (!required.has(name)) {
        issues.push({
          path,
          code: "required_missing_property",
          propertyName: name,
        });
      }
    }
  }
  for (const [name, child] of Object.entries(properties)) {
    inspectNode(child, `${path}.properties.${name}`, issues);
  }
}

function inspectNode(
  node: unknown,
  path: string,
  issues: RetentionOpenAiStrictJsonSchemaIssue[],
): void {
  if (!isRecord(node)) {
    issues.push({ path, code: "not_object_schema" });
    return;
  }
  if (Array.isArray(node.anyOf)) {
    node.anyOf.forEach((branch, index) => {
      inspectNode(branch, `${path}.anyOf[${index}]`, issues);
    });
    return;
  }
  if (Array.isArray(node.oneOf)) {
    node.oneOf.forEach((branch, index) => {
      inspectNode(branch, `${path}.oneOf[${index}]`, issues);
    });
    return;
  }
  if (node.type === "array") {
    if (node.items != null) {
      inspectNode(node.items, `${path}.items`, issues);
    }
    return;
  }
  if (node.type === "object" || node.properties != null) {
    inspectObjectSchema(node, path, issues);
  }
}

export function inspectRetentionOpenAiStrictJsonSchema(
  schema: unknown,
): readonly RetentionOpenAiStrictJsonSchemaIssue[] {
  const issues: RetentionOpenAiStrictJsonSchemaIssue[] = [];
  if (!isRecord(schema)) {
    return Object.freeze([{ path: "$", code: "not_object_schema" as const }]);
  }
  inspectNode(schema, "$", issues);
  return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

export function assertRetentionOpenAiStrictJsonSchema(schema: unknown): void {
  const issues = inspectRetentionOpenAiStrictJsonSchema(schema);
  if (issues.length === 0) return;
  const first = issues[0]!;
  const suffix = first.propertyName ? `:${first.propertyName}` : "";
  throw new Error(`openai_strict_json_schema_invalid:${first.code}${suffix}`);
}
