# Intelligence Layer

Permanent home for ShortForge Studio football intelligence: intent detection, entity resolution, research orchestration, context assembly, prompt construction, validation, and observability.

## Modules

| Folder | Responsibility |
|--------|----------------|
| `intent/` | Classify creator briefs into primary intent and sub-intent |
| `entities/` | Resolve players, clubs, matches, and related football entities |
| `competitions/` | Normalize competitions, seasons, and league scope |
| `planner/` | Plan scenes and story beats from script + intelligence context |
| `providers/` | Research provider registry and fetch orchestration |
| `knowledge/` | Structured facts, provenance, and knowledge graph primitives |
| `context/` | Merge sources into LLM-ready research context |
| `prompts/` | Mode-aware prompt templates and builders |
| `validator/` | Post-generation claim checks against verified context |
| `observability/` | Logging, metrics, and debug traces for intelligence pipelines |
| `shared/` | Cross-module types and utilities |

Existing implementations live in place until migrated module-by-module.
