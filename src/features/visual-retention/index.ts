export * from "./domain/visual-retention-phase-gates";
export * from "./domain/visual-retention-capabilities";
export * from "./domain/visual-beat-density-capability";
export * from "./domain/source-quality-intelligence-capability";
export * from "./domain/visual-retention-ui-contract";
export * from "./domain/visual-retention-extension-contracts";
export * from "./domain/visual-retention-environment";
// Client/server adapters are leaf imports — keep them out of this barrel to
// avoid mixed-media ↔ visual-retention cycles through server resolvers.
