/** Grounding rule applied before LLM prompt rendering. */
export interface PromptGroundingRule {
  id: string;
  text: string;
}

/** Style or tone directive for script generation. */
export interface PromptStyleRule {
  id: string;
  text: string;
}

/** Length or pacing constraint for narration output. */
export interface PromptLengthRule {
  id: string;
  label: string;
  guidance: string;
  targetWordCount?: number;
  minWordCount?: number;
  maxWordCount?: number;
}

/** Maps graph facts to prompt sections and narrative beats. */
export interface FactSectionAssignment {
  sectionId: string;
  factIds: string[];
}

/** Maps graph facts to narrative beats. */
export interface FactBeatAssignment {
  beatId: string;
  factIds: string[];
}

/** Plan for which facts appear in the final prompt and how they are used. */
export interface FactUsagePlan {
  requiredFactIds: string[];
  optionalFactIds: string[];
  suppressedFactIds: string[];
  sectionAssignments: FactSectionAssignment[];
  beatAssignments: FactBeatAssignment[];
}
