import { readFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { createRetentionProductionComposer } from "@/features/retention-story/production/create-retention-production-composer";
import { createRetentionFrozenProductionComposer } from "@/features/retention-story/production/create-retention-frozen-production-composer";
import { runRetentionProductionNarration } from "@/features/retention-story/production/run-retention-production-narration";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildRetentionCreatorContentContract } from "@/features/retention-story/grounding/build-retention-creator-content-contract";
import { buildRetentionCompositionBrief } from "@/features/retention-story/composition/build-retention-composition-brief";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";

const cases = [
  {
    id: "mudryk-player",
    topic: "Mykhailo Mudryk returns to Chelsea after a two-year football ban",
    context:
      "Mykhailo Mudryk is returning to Chelsea for his first game after two years away from football because of doping charges. In his return he performed badly and struggled to touch or pass the ball properly. He is returning under Joapi Alonso in a new Chelsea side that is also struggling. He may struggle for pace after so long away. The central question is whether he will receive the support and patience he needs to recover.",
    scriptMode: "player_analysis" as const,
  },
  {
    id: "milan-united-preview",
    topic: "AC Milan versus Manchester United preseason match",
    context:
      "AC Milan and Manchester United meet in preseason. Both clubs were champions in their countries for a long time, but both have declined in the recent past. AC Milan now fails to qualify for the Champions League, while Manchester United has dwindled between the top four and the top ten. Ruben Amorim is now the coach of AC Milan. He coached Manchester United immediately before Michael Carrick and was removed from that job. This match gives Amorim a chance for redemption and a form of revenge against his former club. The central question is whether he can produce a result against Manchester United.",
    scriptMode: "match_preview" as const,
  },
  {
    id: "real-madrid-ranking",
    topic: "Top five Real Madrid players to watch next season",
    context:
      "1. Kylian Mbappe — his former club PSG has won the Champions League two times in a row. The question is whether Mbappe can now get Real Madrid across the line this season. 2. Vinicius Junior — he has renewed his contract, and the question is whether he can produce the results needed to get Madrid across the line. 3. Dean Huijsen — he receives the number four jersey worn by his idol Sergio Ramos. The question is whether he can take center stage in the new era of the Madrid defense. 4. Trent Alexander-Arnold — after a failed season last year, the question is whether he can come back strongly. 5. Diomande — the question is whether he can progress at Real Madrid in the way Gareth Bale did in his time. Preserve this ranking order and make Mbappe the explicit number-one payoff.",
    scriptMode: "top_5" as const,
  },
  {
    id: "psg-post-mbappe",
    topic: "Nasser Al-Khelaifi believes PSG are better off after Kylian Mbappe",
    context:
      "Nasser Al-Khelaifi is happy about Kylian Mbappe leaving PSG because PSG has won the Champions League twice in the post-Mbappe era. PSG has now signed World Cup hero Ferran Torres to strengthen the squad. PSG coach Luis Enrique believes the club will try to win three Champions Leagues in a row, as Real Madrid did. Mbappe has struggled during his two years at Real Madrid. The central idea is that Al-Khelaifi can now feel vindicated because PSG is replicating Real Madrid's success after Mbappe chose Madrid over PSG.",
    scriptMode: "opinion_debate" as const,
  },
  {
    id: "rodri-barcelona-transfer",
    topic: "Can Barcelona complete a deal for Rodri this season?",
    context:
      "Rodri's possible move to Barcelona has been up and down in the transfer market. A move to Real Madrid for Rodri failed last week, after which Barcelona became eager to sign him. Manchester City does not want to sell Rodri for less than 80 million. Barcelona has made two bids valued around 60 to 65 million, and both were rejected. The central question is whether Barcelona can sign Rodri this season and complete its midfield trio.",
    scriptMode: "story" as const,
  },
  {
    id: "arsenal-title-defense",
    topic: "Can Arsenal win the Premier League two seasons in a row?",
    context:
      "Arsenal looks relentless this season. The club has signed Bruno Guimaraes and retained the summer signings from its last Premier League-winning season. As Arsenal begins the new season, it stands out as the favorite because this is a more experienced and better-trained version of the title-winning squad. The central question is whether Arsenal can make it two Premier League titles in a row.",
    scriptMode: "opinion_debate" as const,
  },
] as const;

async function main(): Promise<void> {
  loadEnvConfig(path.resolve("."));
  const selectedHookStyle =
    (process.env.STORY_QUALITY_HOOK_STYLE as HookStyleSelection | undefined) ??
    "auto";
  const selected = process.env.STORY_QUALITY_CASE
    ? cases.filter((item) => item.id === process.env.STORY_QUALITY_CASE)
    : cases;
  for (const item of selected) {
    if (process.env.STORY_QUALITY_HTTP === "1") {
      const base = process.env.STORY_QUALITY_CERT_BASE ?? "http://127.0.0.1:3477";
      const response = await fetch(`${base}/api/generate-script`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: item.topic,
          context: item.context,
          duration: 30,
          tone: "dramatic",
          qualityMode: "cheap",
          mode: "script-only",
          scriptMode: item.scriptMode,
          hookStyle: selectedHookStyle,
          formatStrategyId: "auto",
          factHandlingMode: "verified_facts_only",
          enableResearch: false,
          creationReliabilityMode: "flexible",
          stream: false,
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { title?: string; narration?: string };
        generationDisposition?: {
          disposition?: string;
          qualityBelowTarget?: boolean;
          acceptanceTrace?: {
            finalNarrationAuthority?: string;
            earliestDecisiveRejection?: string;
          };
        };
        retentionDiagnostics?: {
          acceptanceTrace?: {
            finalNarrationAuthority?: string;
            earliestDecisiveRejection?: string;
          };
        };
      };
      const trace =
        body.generationDisposition?.acceptanceTrace ??
        body.retentionDiagnostics?.acceptanceTrace;
      console.log(JSON.stringify({
        id: item.id,
        status: response.status,
        success: body.success === true,
        title: body.data?.title ?? null,
        narration: body.data?.narration ?? null,
        authority: trace?.finalNarrationAuthority ?? null,
        rejection: trace?.earliestDecisiveRejection ?? null,
        disposition: body.generationDisposition?.disposition ?? null,
        qualityBelowTarget:
          body.generationDisposition?.qualityBelowTarget ?? null,
        error: body.error ?? null,
      }));
      continue;
    }
    if (process.env.STORY_QUALITY_DEBUG_CONTRACT === "1") {
      const contractInput = buildProductionStoryContractInput({
        topic: item.topic,
        manualContext: item.context,
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        scriptMode: item.scriptMode,
        factHandlingMode: "verified_facts_only",
        tone: "dramatic",
      });
      const contract = normalizeStoryContract(contractInput);
      const contentContract = buildRetentionCreatorContentContract({
        contract,
        grounding: contractInput.grounding!,
        manualContext: item.context,
      });
      const brief = buildRetentionCompositionBrief({ contract, contentContract });
      console.log(JSON.stringify({
        id: item.id,
        units: contentContract.orderedUnits.map((unit) => ({
          id: unit.contentUnitId,
          claimId: unit.claimId,
          text: unit.text,
        })),
        ranking: brief.requiredRankingMembership,
        centralSubject: brief.centralSubject,
        controllingIdea: brief.controllingIdea,
        intendedConflict: brief.intendedConflict,
        intendedConsequence: brief.intendedConsequence,
        hookStrategy: brief.hookStrategy,
      }));
      if (process.env.STORY_QUALITY_DEBUG_ONLY === "1") continue;
    }
    const capturePath = path.resolve(
      `.tmp/story-quality-rejected-proposals/original-three-${item.id}-${selectedHookStyle}.json`,
    );
    const replayCapture =
      process.env.STORY_QUALITY_REPLAY_CAPTURE === "1"
        ? (JSON.parse(readFileSync(capturePath, "utf8")) as {
            parsedModelProposal: { title: string; narration: string };
          })
        : null;
    const result = await runRetentionProductionNarration({
      topic: item.topic,
      manualContext: item.context,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: item.scriptMode,
      tone: "dramatic",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: replayCapture
        ? createRetentionFrozenProductionComposer(replayCapture.parsedModelProposal)
        : createRetentionProductionComposer({ model: "gpt-4.1-mini" }),
      captureRejectedProposals: replayCapture == null,
      rejectedProposalCaptureCaseId: `original-three-${item.id}-${selectedHookStyle}`,
      hookStyle: selectedHookStyle,
    });
    const approved = result.ok ? result.approved : null;
    const trace = approved?.safeDiagnostics.acceptanceTrace;
    console.log(JSON.stringify({
      id: item.id,
      ok: result.ok,
      title: approved?.title ?? null,
      narration: approved?.narration ?? null,
      authority: trace?.finalNarrationAuthority ?? null,
      rejection: trace?.earliestDecisiveRejection ?? null,
      disposition: approved?.generationDisposition?.disposition ?? null,
      qualityBelowTarget:
        approved?.generationDisposition?.qualityBelowTarget ?? null,
      warningNotes: approved?.validationSummary.warningNotes ?? null,
      retentionReadiness:
        approved?.validationSummary.retentionReadiness ?? null,
      storyQualityConfidence:
        approved?.validationSummary.storyQualityConfidence ?? null,
      failure: result.ok
        ? null
        : {
            reason: result.failureCategory,
            error: result.error,
            diagnostics: result.retentionDiagnostics,
          },
      capture: result.ok && trace?.finalNarrationAuthority === "deterministic_rescue"
        ? JSON.parse(readFileSync(capturePath, "utf8"))
        : null,
    }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
