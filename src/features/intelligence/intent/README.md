# Intent

Infers **what kind of story** the creator wants from their brief.

## Responsibility

- Primary intent (Story, Player Profile, Ranked List, Match Preview, etc.)
- Sub-intent (Top Scorers, Transfers, Form, etc.)
- Topic keyword parsing (competition, ranking, match, history signals)
- Confidence scoring for UI suggestions

## Current implementation

`intent-engine.ts`, `topic-parser.ts`, and related utilities. Not yet connected to script generation.
