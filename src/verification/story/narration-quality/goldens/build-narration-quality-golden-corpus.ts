/** Sprint 13A — varied, provider-free narration-quality golden corpus. */

import type {
  NarrationQualityAcceptanceContract,
  NarrationQualityRejectionReason,
  NarrationQualitySignalGroup,
} from "./narration-quality-acceptance-contract";
import { NARRATION_QUALITY_ACCEPTANCE_CONTRACT_VERSION } from "./narration-quality-acceptance-contract";

export const NARRATION_QUALITY_GOLDEN_CATEGORIES = [
  "transfer_news",
  "breaking_news",
  "match_preview",
  "match_recap",
  "tactical_analysis",
  "player_analysis",
  "opinion",
  "history",
  "rankings",
  "verified_research",
  "creator_supplied_facts",
] as const;

export type NarrationQualityGoldenCategory =
  (typeof NARRATION_QUALITY_GOLDEN_CATEGORIES)[number];

export interface NarrationQualityRejectedSample {
  readonly label: string;
  readonly narration: string;
  readonly expectedReasons: readonly NarrationQualityRejectionReason[];
}

export interface NarrationQualityGoldenFixture {
  readonly id: string;
  readonly category: NarrationQualityGoldenCategory;
  readonly title: string;
  readonly brief: string;
  readonly contract: NarrationQualityAcceptanceContract;
  readonly acceptedNarration: string;
  readonly rejectedSamples: readonly NarrationQualityRejectedSample[];
}

const signal = (...anyOf: string[]): NarrationQualitySignalGroup => ({ anyOf });

function contract(
  input: Omit<NarrationQualityAcceptanceContract, "version">,
): NarrationQualityAcceptanceContract {
  return {
    version: NARRATION_QUALITY_ACCEPTANCE_CONTRACT_VERSION,
    ...input,
  };
}

export const NARRATION_QUALITY_GOLDEN_CORPUS: readonly NarrationQualityGoldenFixture[] =
  [
    {
      id: "nq-transfer-arsenal-striker-gap",
      category: "transfer_news",
      title: "Transfer negotiation gap remains unresolved",
      brief:
        "Arsenal are pursuing Mateo Silva. A £45m opening offer is reported; Porto value him at £60m. No agreement is confirmed.",
      contract: contract({
        centralSubject: {
          description: "Arsenal's pursuit of Mateo Silva",
          signals: [signal("arsenal"), signal("mateo silva", "silva")],
        },
        controllingIdea: {
          description:
            "The valuation gap, not inevitability, controls the story",
          signals: [signal("gap", "£15m"), signal("agreement", "deal")],
        },
        facts: [
          {
            id: "opening-offer",
            importance: "essential",
            description: "Reported £45m opening offer",
            signals: [
              signal("£45m", "45m"),
              signal("reported", "reportedly", "reports say"),
            ],
          },
          {
            id: "asking-price",
            importance: "essential",
            description: "Porto value Silva at £60m",
            signals: [signal("porto"), signal("£60m", "60m")],
          },
          {
            id: "contract-length",
            importance: "optional",
            description: "Two years remain on Silva's contract",
            signals: [signal("two years")],
          },
        ],
        requiredUncertainty: [
          {
            factId: "opening-offer",
            requiredSignals: [
              signal(
                "reported",
                "reportedly",
                "reports say",
                "according to reports",
              ),
            ],
          },
        ],
        conflict: {
          description: "Arsenal's offer is below Porto's valuation",
          signals: [signal("£45m", "45m"), signal("£60m", "60m")],
        },
        consequence: {
          description: "Arsenal must raise the offer or risk delay",
          signals: [
            signal("raise", "move closer", "delay"),
            signal("pre-season", "window"),
          ],
        },
        selection: {
          durationSec: 28,
          scriptMode: "story",
          tone: "news",
          hookStyle: "headline_first",
        },
        forbiddenInventions: [
          {
            description: "A completed transfer",
            signals: [signal("deal agreed", "has signed")],
          },
          {
            description: "A scheduled medical",
            signals: [signal("medical booked")],
          },
        ],
        narrativeFlow: [
          { id: "hook", signals: [signal("arsenal"), signal("£15m", "gap")] },
          {
            id: "evidence",
            signals: [signal("£45m", "45m"), signal("£60m", "60m")],
          },
          {
            id: "escalation",
            signals: [signal("but", "without"), signal("agreement", "deal")],
          },
          {
            id: "payoff",
            signals: [
              signal("raise", "move closer"),
              signal("pre-season", "window"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("arsenal"), signal("£15m", "gap")],
          bodyPayoffSignals: [
            signal("£45m", "45m"),
            signal("£60m", "60m"),
            signal("raise", "move closer"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          { description: "Arsenal", signals: [signal("arsenal")] },
          {
            description: "Mateo Silva",
            signals: [signal("mateo silva", "silva")],
          },
          { description: "Porto", signals: [signal("porto")] },
        ],
      }),
      acceptedNarration:
        "Arsenal's move for Mateo Silva is separated by a £15m gap, not a signature. Reports say the opening offer is £45m, while Porto value the striker at £60m. But without an agreement, every week lost squeezes Arsenal's pre-season planning. They must raise the bid or move closer to Porto before the window starts controlling them.",
      rejectedSamples: [
        {
          label: "invented completion",
          narration:
            "Arsenal have signed Mateo Silva after a deal agreed with Porto. The medical is booked and the £45m fee solves the gap. The striker now joins pre-season. Arsenal have won the window.",
          expectedReasons: ["forbidden_invention", "essential_fact_missing"],
        },
      ],
    },
    {
      id: "nq-breaking-riverside-manager-exit",
      category: "breaking_news",
      title: "Breaking dismissal without invented successor",
      brief:
        "Riverside FC dismissed manager Elena Cruz after training. Assistant Tom Bell takes interim charge; no permanent successor is named.",
      contract: contract({
        centralSubject: {
          description: "Riverside FC dismissing Elena Cruz",
          signals: [signal("riverside"), signal("elena cruz", "cruz")],
        },
        controllingIdea: {
          description:
            "The dismissal creates immediate uncertainty before Saturday",
          signals: [
            signal("uncertain", "uncertainty", "no permanent"),
            signal("saturday"),
          ],
        },
        facts: [
          {
            id: "dismissed-after-training",
            importance: "essential",
            description: "Cruz was dismissed after training",
            signals: [signal("dismissed", "sacked"), signal("after training")],
          },
          {
            id: "interim",
            importance: "essential",
            description: "Tom Bell takes interim charge",
            signals: [signal("tom bell", "bell"), signal("interim")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description: "A coaching change lands days before the next match",
          signals: [signal("change", "dismissed"), signal("saturday")],
        },
        consequence: {
          description: "Bell must steady the team without a permanent plan",
          signals: [
            signal("steady", "prepare"),
            signal("no permanent", "without a permanent"),
          ],
        },
        selection: {
          durationSec: 24,
          scriptMode: "story",
          tone: "news",
          hookStyle: "headline_first",
        },
        forbiddenInventions: [
          {
            description: "Named permanent successor",
            signals: [signal("marco vale appointed")],
          },
          {
            description: "Fabricated player revolt",
            signals: [signal("players demanded her removal")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("riverside"), signal("dismissed", "sacked")],
          },
          {
            id: "evidence",
            signals: [signal("after training"), signal("tom bell", "bell")],
          },
          {
            id: "escalation",
            signals: [
              signal("timing", "saturday"),
              signal("uncertain", "uncertainty"),
            ],
          },
          {
            id: "payoff",
            signals: [
              signal("steady", "prepare"),
              signal("no permanent", "without a permanent"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("riverside"), signal("dismissed", "sacked")],
          bodyPayoffSignals: [
            signal("tom bell", "bell"),
            signal("no permanent", "without a permanent"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          { description: "Riverside FC", signals: [signal("riverside")] },
          {
            description: "Elena Cruz",
            signals: [signal("elena cruz", "cruz")],
          },
          { description: "Tom Bell", signals: [signal("tom bell", "bell")] },
        ],
      }),
      acceptedNarration:
        "Riverside have dismissed Elena Cruz with Saturday already closing in. The decision came after training, and assistant Tom Bell now takes interim charge. That timing leaves the game plan uncertain before the squad can reset. Bell must steady and prepare the team while the club moves forward with no permanent successor named.",
      rejectedSamples: [
        {
          label: "generic breaking-news filler",
          narration:
            "In the world of football, anything can happen. Riverside face another big moment. Passion and determination matter. Time will tell what comes next for the beautiful game.",
          expectedReasons: ["generic_filler", "essential_fact_missing"],
        },
      ],
    },
    {
      id: "nq-preview-liverpool-city-transition-risk",
      category: "match_preview",
      title: "Preview turns tactical tension into stakes",
      brief:
        "Liverpool host Manchester City. Liverpool's full-backs push high; City have scored six transition goals in their last four league matches.",
      contract: contract({
        centralSubject: {
          description: "Liverpool versus Manchester City",
          signals: [signal("liverpool"), signal("manchester city", "city")],
        },
        controllingIdea: {
          description:
            "Liverpool's attacking width exposes City's transition route",
          signals: [signal("full-backs", "full backs"), signal("transition")],
        },
        facts: [
          {
            id: "city-transition-goals",
            importance: "essential",
            description:
              "City scored six transition goals in four league matches",
            signals: [
              signal("six"),
              signal("four"),
              signal("transition goals"),
            ],
          },
          {
            id: "venue",
            importance: "optional",
            description: "Liverpool are at home",
            signals: [signal("host", "at anfield")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description: "Liverpool need width but risk space behind it",
          signals: [
            signal("width", "full-backs", "full backs"),
            signal("space", "behind"),
          ],
        },
        consequence: {
          description: "The side controlling that space controls the match",
          signals: [signal("control"), signal("match", "game")],
        },
        selection: {
          durationSec: 26,
          scriptMode: "match_preview",
          tone: "tactical",
          hookStyle: "stakes_first",
        },
        forbiddenInventions: [
          {
            description: "Unconfirmed lineup",
            signals: [signal("salah is ruled out")],
          },
          {
            description: "Predicted certainty",
            signals: [signal("city will definitely win")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("liverpool"), signal("trap", "risk")],
          },
          {
            id: "evidence",
            signals: [signal("six"), signal("four"), signal("transition")],
          },
          {
            id: "escalation",
            signals: [signal("but", "if"), signal("space", "behind")],
          },
          {
            id: "payoff",
            signals: [signal("control"), signal("match", "game")],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("liverpool"), signal("trap", "risk")],
          bodyPayoffSignals: [
            signal("transition"),
            signal("space", "behind"),
            signal("control"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          { description: "Liverpool", signals: [signal("liverpool")] },
          {
            description: "Manchester City",
            signals: [signal("manchester city", "city")],
          },
        ],
      }),
      acceptedNarration:
        "Liverpool's greatest attacking weapon could become their biggest risk against Manchester City. City have scored six transition goals in their last four league matches. Liverpool need their full-backs high for width, but every step forward leaves space behind them. Whichever side controls that space may control the match before possession numbers even matter.",
      rejectedSamples: [
        {
          label: "fact checklist",
          narration:
            "Liverpool host City. Full-backs push high. City have six transition goals. Four league matches. Space appears behind. The match will be tactical.",
          expectedReasons: ["disconnected_checklist", "narrative_flow_broken"],
        },
      ],
    },
    {
      id: "nq-recap-northbridge-late-collapse",
      category: "match_recap",
      title: "Recap explains how the result turned",
      brief:
        "Northbridge led Redford 1-0 at half-time. Redford equalised on 71 minutes and won 2-1 with an 88th-minute header.",
      contract: contract({
        centralSubject: {
          description: "Redford's comeback against Northbridge",
          signals: [signal("redford"), signal("northbridge")],
        },
        controllingIdea: {
          description:
            "Northbridge lost control late rather than simply losing",
          signals: [signal("control"), signal("late", "88th")],
        },
        facts: [
          {
            id: "half-time-lead",
            importance: "essential",
            description: "Northbridge led 1-0 at half-time",
            signals: [signal("1-0"), signal("half-time", "halftime")],
          },
          {
            id: "equaliser",
            importance: "essential",
            description: "Redford equalised in the 71st minute",
            signals: [
              signal("71st", "71 minutes"),
              signal("equalised", "equaliser", "equalizer"),
            ],
          },
          {
            id: "winner",
            importance: "essential",
            description: "An 88th-minute header made it 2-1",
            signals: [signal("88th"), signal("header"), signal("2-1")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description:
            "Northbridge protected a lead as Redford increased pressure",
          signals: [signal("lead"), signal("pressure", "pushed")],
        },
        consequence: {
          description: "The late winner completed a 2-1 reversal",
          signals: [signal("2-1"), signal("comeback", "reversal", "turned")],
        },
        selection: {
          durationSec: 25,
          scriptMode: "match_recap",
          tone: "dramatic",
          hookStyle: "cold_open",
        },
        forbiddenInventions: [
          { description: "Unprovided red card", signals: [signal("red card")] },
          {
            description: "Unprovided scorer name",
            signals: [signal("james vale scored")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("northbridge"), signal("control", "lead")],
          },
          {
            id: "evidence",
            signals: [signal("1-0"), signal("half-time", "halftime")],
          },
          {
            id: "escalation",
            signals: [
              signal("71st", "71 minutes"),
              signal("pressure", "pushed"),
            ],
          },
          {
            id: "payoff",
            signals: [
              signal("88th"),
              signal("2-1"),
              signal("comeback", "turn", "turned"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("northbridge"), signal("control", "lead")],
          bodyPayoffSignals: [
            signal("71st", "71 minutes"),
            signal("88th"),
            signal("2-1"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          { description: "Northbridge", signals: [signal("northbridge")] },
          { description: "Redford", signals: [signal("redford")] },
        ],
      }),
      acceptedNarration:
        "Northbridge had the lead, but never had control of Redford's comeback. They reached half-time 1-0 ahead, then retreated as Redford pushed. The pressure finally produced a 71st-minute equaliser and left Northbridge protecting nothing. An 88th-minute header completed the turn, sealing a 2-1 Redford win from a match that had slipped away.",
      rejectedSamples: [
        {
          label: "wrong chronology",
          narration:
            "Redford won 2-1 when an 88th-minute header completed the comeback. Northbridge were under pressure. Northbridge led 1-0 at half-time. Redford equalised after 71 minutes, so control changed late.",
          expectedReasons: [
            "narrative_flow_broken",
            "hook_body_payoff_missing",
          ],
        },
      ],
    },
    {
      id: "nq-tactical-harbor-inverted-fullback",
      category: "tactical_analysis",
      title: "Shape change produces both control and exposure",
      brief:
        "Harbor United build in a 3-2-5 when left-back Niko Ames moves inside. Their last two conceded goals began in the vacated left channel.",
      contract: contract({
        centralSubject: {
          description: "Harbor United's inverted-left-back structure",
          signals: [
            signal("harbor united", "harbor"),
            signal("niko ames", "ames"),
          ],
        },
        controllingIdea: {
          description:
            "The same rotation creates midfield control and transition risk",
          signals: [signal("control"), signal("risk", "exposed", "vacated")],
        },
        facts: [
          {
            id: "shape",
            importance: "essential",
            description: "Harbor build in a 3-2-5",
            signals: [signal("3-2-5")],
          },
          {
            id: "conceded-channel",
            importance: "essential",
            description:
              "Last two concessions began in the vacated left channel",
            signals: [signal("two"), signal("left channel")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description: "Ames adds central control but leaves the flank open",
          signals: [
            signal("inside", "central"),
            signal("left channel", "flank"),
          ],
        },
        consequence: {
          description:
            "Harbor must cover the channel or their strength becomes a weakness",
          signals: [
            signal("cover"),
            signal("strength", "weakness", "punished"),
          ],
        },
        selection: {
          durationSec: 27,
          scriptMode: "tactical_review",
          tone: "tactical",
          hookStyle: "contrarian_claim",
        },
        forbiddenInventions: [
          {
            description: "Unprovided formation change",
            signals: [signal("switched to a back five")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("harbor", "ames"), signal("strength", "control")],
          },
          {
            id: "evidence",
            signals: [signal("3-2-5"), signal("inside", "central")],
          },
          {
            id: "escalation",
            signals: [signal("two"), signal("left channel")],
          },
          {
            id: "payoff",
            signals: [
              signal("cover"),
              signal("strength", "weakness", "punished"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [
            signal("harbor", "ames"),
            signal("strength", "control"),
          ],
          bodyPayoffSignals: [
            signal("3-2-5"),
            signal("left channel"),
            signal("cover"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          {
            description: "Harbor United",
            signals: [signal("harbor united", "harbor")],
          },
          { description: "Niko Ames", signals: [signal("niko ames", "ames")] },
        ],
      }),
      acceptedNarration:
        "Harbor United's cleverest source of control is also their clearest risk. When Niko Ames moves inside, Harbor build a 3-2-5 and gain an extra central passer. Yet their last two conceded goals both began in the vacated left channel. Unless someone rotates across to cover it, the same strength will keep turning into a weakness opponents can punish.",
      rejectedSamples: [
        {
          label: "tactical jargon without causality",
          narration:
            "Harbor use a 3-2-5. Niko Ames inverts. Central control. Two goals conceded. Left channel. Rotations matter. The tactical battle will be fascinating.",
          expectedReasons: ["disconnected_checklist", "narrative_flow_broken"],
        },
      ],
    },
    {
      id: "nq-player-maya-torres-chance-creation",
      category: "player_analysis",
      title: "Player output explained through movement",
      brief:
        "Maya Torres created eight chances and three assists across her last four matches. Her strongest actions came after drifting from the right into the half-space.",
      contract: contract({
        centralSubject: {
          description: "Maya Torres' recent creative influence",
          signals: [signal("maya torres", "torres")],
        },
        controllingIdea: {
          description:
            "Movement inside explains the output better than raw totals alone",
          signals: [
            signal("half-space", "inside"),
            signal("explains", "because", "source"),
          ],
        },
        facts: [
          {
            id: "chance-output",
            importance: "essential",
            description: "Eight chances and three assists in four matches",
            signals: [
              signal("eight chances"),
              signal("three assists"),
              signal("four matches", "four games"),
            ],
          },
          {
            id: "starting-side",
            importance: "optional",
            description: "Torres starts from the right",
            signals: [signal("from the right", "right side")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description:
            "Defenders must choose between following inside and leaving width",
          signals: [
            signal("follow", "defenders"),
            signal("width", "space outside"),
          ],
        },
        consequence: {
          description: "That dilemma creates the final pass",
          signals: [
            signal("dilemma", "choice"),
            signal("final pass", "chances"),
          ],
        },
        selection: {
          durationSec: 27,
          scriptMode: "player_analysis",
          tone: "tactical",
          hookStyle: "curiosity_gap",
        },
        forbiddenInventions: [
          {
            description: "Unprovided record claim",
            signals: [signal("league record")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("torres"), signal("inside", "half-space")],
          },
          {
            id: "evidence",
            signals: [
              signal("eight chances"),
              signal("three assists"),
              signal("four matches", "four games"),
            ],
          },
          {
            id: "escalation",
            signals: [
              signal("defenders", "follow"),
              signal("width", "outside"),
            ],
          },
          {
            id: "payoff",
            signals: [
              signal("dilemma", "choice"),
              signal("final pass", "chances"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("torres"), signal("inside", "half-space")],
          bodyPayoffSignals: [
            signal("eight chances"),
            signal("three assists"),
            signal("final pass", "chances"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          {
            description: "Maya Torres",
            signals: [signal("maya torres", "torres")],
          },
        ],
      }),
      acceptedNarration:
        "Maya Torres is creating more because she is starting wide and arriving inside. Across four matches, she has produced eight chances and three assists. Her half-space runs force defenders to follow, but that choice leaves width outside and passing lanes ahead. That dilemma, not the totals alone, explains why Torres keeps finding the final pass.",
      rejectedSamples: [
        {
          label: "numbers without explanation",
          narration:
            "Maya Torres has eight chances. Three assists. Four matches. She plays from the right. She moves inside. Defenders follow. Torres is in excellent form.",
          expectedReasons: [
            "disconnected_checklist",
            "controlling_idea_missing",
          ],
        },
      ],
    },
    {
      id: "nq-opinion-captain-minutes",
      category: "opinion",
      title: "Opinion distinguishes evidence from judgment",
      brief:
        "Argue that Kingsport should reduce captain Leo Hart's minutes. Hart has started 12 matches in 39 days; Kingsport play a semi-final in four days.",
      contract: contract({
        centralSubject: {
          description: "Whether Kingsport should rest Leo Hart",
          signals: [signal("kingsport"), signal("leo hart", "hart")],
        },
        controllingIdea: {
          description: "Resting the captain now protects the bigger match",
          signals: [
            signal("rest", "reduce"),
            signal("semi-final", "semifinal"),
          ],
        },
        facts: [
          {
            id: "workload",
            importance: "essential",
            description: "Twelve starts in 39 days",
            signals: [signal("12", "twelve"), signal("39 days")],
          },
          {
            id: "semi-final-timing",
            importance: "essential",
            description: "Semi-final in four days",
            signals: [signal("semi-final", "semifinal"), signal("four days")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description:
            "Leadership today competes with freshness for the semi-final",
          signals: [
            signal("leadership", "captain"),
            signal("fresh", "fatigue", "rest"),
          ],
        },
        consequence: {
          description:
            "Kingsport risk dulling Hart for the match that matters most",
          signals: [signal("risk"), signal("semi-final", "semifinal")],
        },
        selection: {
          durationSec: 26,
          scriptMode: "opinion_debate",
          tone: "dramatic",
          hookStyle: "contrarian_claim",
        },
        forbiddenInventions: [
          {
            description: "Unprovided injury",
            signals: [signal("hart is injured", "hamstring injury")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("kingsport"), signal("rest", "reduce")],
          },
          {
            id: "evidence",
            signals: [signal("12", "twelve"), signal("39 days")],
          },
          {
            id: "escalation",
            signals: [signal("captain", "leadership"), signal("four days")],
          },
          {
            id: "payoff",
            signals: [signal("risk"), signal("semi-final", "semifinal")],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("kingsport"), signal("rest", "reduce")],
          bodyPayoffSignals: [
            signal("39 days"),
            signal("four days"),
            signal("semi-final", "semifinal"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          { description: "Kingsport", signals: [signal("kingsport")] },
          { description: "Leo Hart", signals: [signal("leo hart", "hart")] },
        ],
      }),
      acceptedNarration:
        "Kingsport should rest Leo Hart now, precisely because he is their captain. Hart has started 12 matches in 39 days, a workload that makes fatigue the real opponent. His leadership matters tonight, but the semi-final arrives in four days. Kingsport risk spending his sharpness early and dulling their most important voice for the semi-final that matters more.",
      rejectedSamples: [
        {
          label: "opinion presented through invented injury",
          narration:
            "Kingsport must rest Leo Hart because Hart is injured. He has started 12 matches in 39 days. The captain cannot play again in four days. His hamstring injury makes the semi-final a risk.",
          expectedReasons: ["forbidden_invention"],
        },
      ],
    },
    {
      id: "nq-history-bosman-player-power",
      category: "history",
      title: "Historical fact resolves into present consequence",
      brief:
        "Explain the 1995 Bosman ruling: out-of-contract EU players could move without a transfer fee, shifting bargaining power toward players.",
      contract: contract({
        centralSubject: {
          description: "The 1995 Bosman ruling",
          signals: [signal("bosman"), signal("1995")],
        },
        controllingIdea: {
          description: "Freedom after contract expiry shifted bargaining power",
          signals: [
            signal("out of contract", "out-of-contract", "contract expired"),
            signal("power", "leverage"),
          ],
        },
        facts: [
          {
            id: "free-movement",
            importance: "essential",
            description:
              "Out-of-contract EU players could move without a transfer fee",
            signals: [
              signal("eu"),
              signal("without a transfer fee", "no transfer fee"),
            ],
          },
          {
            id: "year",
            importance: "essential",
            description: "The ruling came in 1995",
            signals: [signal("1995")],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description: "Clubs' registration control met workers' freedom",
          signals: [signal("clubs", "club"), signal("freedom", "free to move")],
        },
        consequence: {
          description: "Players gained leverage over contracts and wages",
          signals: [
            signal("players"),
            signal("leverage", "bargaining power", "wages"),
          ],
        },
        selection: {
          durationSec: 28,
          scriptMode: "historical_explainer",
          tone: "dramatic",
          hookStyle: "myth_challenge",
        },
        forbiddenInventions: [
          {
            description: "Abolition of all transfer fees",
            signals: [signal("abolished all transfer fees")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [signal("bosman"), signal("power", "leverage")],
          },
          {
            id: "evidence",
            signals: [
              signal("1995"),
              signal("eu"),
              signal("without a transfer fee", "no transfer fee"),
            ],
          },
          {
            id: "escalation",
            signals: [
              signal("clubs", "club"),
              signal("freedom", "free to move"),
            ],
          },
          {
            id: "payoff",
            signals: [
              signal("players"),
              signal("leverage", "bargaining power", "wages"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [signal("bosman"), signal("power", "leverage")],
          bodyPayoffSignals: [
            signal("without a transfer fee", "no transfer fee"),
            signal("players"),
            signal("leverage", "bargaining power"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          { description: "Bosman", signals: [signal("bosman")] },
          {
            description: "EU players",
            signals: [signal("eu"), signal("players")],
          },
        ],
      }),
      acceptedNarration:
        "Bosman changed football because one contract dispute moved power away from clubs. In 1995, the ruling let out-of-contract EU players move without a transfer fee. Clubs could no longer use an expired deal to restrict that freedom. The payoff reached far beyond one case: players gained bargaining power, contract leverage, and a stronger position when negotiating wages.",
      rejectedSamples: [
        {
          label: "overstated historical claim",
          narration:
            "Bosman abolished all transfer fees and handed every player total power. In 1995 EU players gained freedom. Clubs lost control. Players then controlled all wages and every future move.",
          expectedReasons: ["forbidden_invention", "essential_fact_missing"],
        },
      ],
    },
    {
      id: "nq-ranking-midfield-press-resistance",
      category: "rankings",
      title: "Ranking builds criteria toward number one",
      brief:
        "Rank five midfielders for press resistance using one criterion: successful turns under pressure. Order: 5 Ivo, 4 Ren, 3 Sol, 2 Dani, 1 Amina.",
      contract: contract({
        centralSubject: {
          description: "Five midfielders ranked for press resistance",
          signals: [
            signal("press resistance", "under pressure"),
            signal("five", "number five"),
          ],
        },
        controllingIdea: {
          description: "Successful turns under pressure determine the order",
          signals: [signal("turns"), signal("under pressure", "press")],
        },
        facts: [
          {
            id: "ranking-order",
            importance: "essential",
            description: "Ivo, Ren, Sol, Dani, Amina in ascending order",
            signals: [
              signal("ivo"),
              signal("ren"),
              signal("sol"),
              signal("dani"),
              signal("amina"),
            ],
          },
          {
            id: "number-one",
            importance: "essential",
            description: "Amina ranks first",
            signals: [
              signal("number one", "first place", "top spot"),
              signal("amina"),
            ],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description: "Reputation competes with the stated criterion",
          signals: [
            signal("reputation", "famous"),
            signal("criterion", "turns"),
          ],
        },
        consequence: {
          description: "Amina wins because she solves pressure most cleanly",
          signals: [signal("amina"), signal("clean", "best", "top")],
        },
        selection: {
          durationSec: 30,
          scriptMode: "top_5",
          tone: "tactical",
          hookStyle: "countdown_tease",
        },
        forbiddenInventions: [
          {
            description: "Unprovided statistical percentages",
            signals: [signal("94 percent", "94%")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [
              signal("five", "number five"),
              signal("reputation", "famous"),
            ],
          },
          {
            id: "evidence",
            signals: [signal("ivo"), signal("ren"), signal("sol")],
          },
          { id: "escalation", signals: [signal("dani"), signal("amina")] },
          {
            id: "payoff",
            signals: [
              signal("number one", "first place", "top spot"),
              signal("amina"),
              signal("turns", "pressure"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [
            signal("five", "number five"),
            signal("reputation", "famous"),
          ],
          bodyPayoffSignals: [
            signal("ivo"),
            signal("ren"),
            signal("sol"),
            signal("dani"),
            signal("amina"),
            signal("number one", "top spot"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          {
            description: "All ranked players",
            signals: [
              signal("ivo"),
              signal("ren"),
              signal("sol"),
              signal("dani"),
              signal("amina"),
            ],
          },
        ],
      }),
      acceptedNarration:
        "These five press-resistant midfielders are ranked by successful turns under pressure, not reputation. Ivo starts at five, Ren takes four, and Sol reaches three because each escapes a closing marker more cleanly. Dani is second, but Amina separates herself by turning pressure into forward momentum. That is why Amina takes the number one top spot on this turns-under-pressure criterion.",
      rejectedSamples: [
        {
          label: "spoken ranking checklist",
          narration:
            "Number five, Ivo. Number four, Ren. Number three, Sol. Number two, Dani. Number one, Amina. Press resistance. Successful turns under pressure. Reputation does not matter.",
          expectedReasons: ["disconnected_checklist", "narrative_flow_broken"],
        },
      ],
    },
    {
      id: "nq-research-womens-attendance-growth",
      category: "verified_research",
      title: "Verified research supports a bounded conclusion",
      brief:
        "Verified league report: average women's league attendance rose from 4,200 to 6,300 across two seasons; weekend fixtures accounted for most of the increase.",
      contract: contract({
        centralSubject: {
          description: "Growth in women's league attendance",
          signals: [
            signal("women's league", "womens league"),
            signal("attendance"),
          ],
        },
        controllingIdea: {
          description: "Scheduling helped convert interest into attendance",
          signals: [
            signal("weekend"),
            signal("schedule", "scheduling", "fixtures"),
          ],
        },
        facts: [
          {
            id: "attendance-rise",
            importance: "essential",
            description:
              "Average attendance rose from 4,200 to 6,300 over two seasons",
            signals: [
              signal("4,200", "4200"),
              signal("6,300", "6300"),
              signal("two seasons"),
            ],
          },
          {
            id: "weekend-share",
            importance: "essential",
            description: "Weekend fixtures accounted for most growth",
            signals: [
              signal("weekend"),
              signal("most", "majority"),
              signal("increase", "growth"),
            ],
          },
        ],
        requiredUncertainty: [],
        conflict: {
          description:
            "Interest existed, but access through scheduling limited conversion",
          signals: [
            signal("interest", "demand"),
            signal("access", "schedule", "scheduling"),
          ],
        },
        consequence: {
          description:
            "Fixture timing is a growth lever, not background detail",
          signals: [
            signal("timing", "weekend", "schedule"),
            signal("growth", "attendance"),
          ],
        },
        selection: {
          durationSec: 28,
          scriptMode: "story",
          tone: "news",
          hookStyle: "stakes_first",
        },
        forbiddenInventions: [
          {
            description: "Unsupported causal exclusivity",
            signals: [signal("weekend scheduling alone caused")],
          },
          {
            description: "Unprovided sellout count",
            signals: [signal("ten sellouts")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [
              signal("attendance"),
              signal("schedule", "scheduling", "weekend"),
            ],
          },
          {
            id: "evidence",
            signals: [
              signal("4,200", "4200"),
              signal("6,300", "6300"),
              signal("two seasons"),
            ],
          },
          {
            id: "escalation",
            signals: [
              signal("weekend"),
              signal("most", "majority"),
              signal("increase", "growth"),
            ],
          },
          {
            id: "payoff",
            signals: [
              signal("timing", "schedule"),
              signal("growth", "attendance"),
            ],
          },
        ],
        hookBodyPromise: {
          hookSignals: [
            signal("attendance"),
            signal("schedule", "scheduling", "weekend"),
          ],
          bodyPayoffSignals: [
            signal("4,200", "4200"),
            signal("6,300", "6300"),
            signal("weekend"),
            signal("growth", "attendance"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          {
            description: "Women's league",
            signals: [signal("women's league", "womens league")],
          },
        ],
      }),
      acceptedNarration:
        "Women's league attendance is rising, and the schedule appears to be part of the opportunity. A verified league report shows the average climbing from 4,200 to 6,300 across two seasons. Weekend fixtures accounted for most of that increase, connecting existing interest with easier access. The consequence is practical: fixture timing can be a genuine attendance growth lever, not background administration.",
      rejectedSamples: [
        {
          label: "research overclaim",
          narration:
            "Women's league attendance rose from 4,200 to 6,300 in two seasons. Weekend scheduling alone caused the growth and created ten sellouts. Interest is now unlimited. The schedule guarantees future attendance.",
          expectedReasons: ["forbidden_invention", "essential_fact_missing"],
        },
      ],
    },
    {
      id: "nq-creator-manchester-united-sale-before-buy",
      category: "creator_supplied_facts",
      title: "Manchester United creator-fact regression",
      brief:
        "Creator says Manchester United must sell before buying, expects a Friday bid for a midfielder, and fears a rival may move first. Research is unavailable.",
      contract: contract({
        centralSubject: {
          description: "Manchester United's sale-before-buying constraint",
          signals: [
            signal("manchester united", "united"),
            signal("sell", "sale"),
          ],
        },
        controllingIdea: {
          description:
            "One delayed exit could cost United their midfield target",
          signals: [signal("exit", "sale"), signal("lose", "cost", "rival")],
        },
        facts: [
          {
            id: "sell-before-buy",
            importance: "essential",
            description: "Creator says United must sell before buying",
            signals: [signal("sell before", "sale"), signal("buy", "buying")],
          },
          {
            id: "friday-bid",
            importance: "essential",
            description: "Creator expects a Friday bid for a midfielder",
            signals: [
              signal("friday"),
              signal("bid"),
              signal("midfielder", "midfield"),
            ],
          },
          {
            id: "three-player-shortlist",
            importance: "optional",
            description: "Three-player shortlist",
            signals: [
              signal("three-player shortlist", "three player shortlist"),
            ],
          },
        ],
        requiredUncertainty: [
          {
            factId: "friday-bid",
            requiredSignals: [
              signal(
                "creator brief says",
                "creator says",
                "expected",
                "expects",
              ),
            ],
          },
        ],
        conflict: {
          description:
            "The expected bid arrives before United have made the needed sale",
          signals: [signal("friday"), signal("sale", "sell")],
        },
        consequence: {
          description:
            "A rival could move first and United could lose the target",
          signals: [
            signal("rival"),
            signal("lose", "moves first", "move first"),
          ],
        },
        selection: {
          durationSec: 30,
          scriptMode: "story",
          tone: "dramatic",
          hookStyle: "provocative_question",
        },
        forbiddenInventions: [
          {
            description: "A confirmed bid",
            signals: [signal("submitted the bid", "bid is confirmed")],
          },
          {
            description: "A completed sale",
            signals: [signal("sale is complete", "has been sold")],
          },
          {
            description: "A named target",
            signals: [signal("joao neves", "adam wharton")],
          },
        ],
        narrativeFlow: [
          {
            id: "hook",
            signals: [
              signal("manchester united", "united"),
              signal("sale", "sell"),
            ],
          },
          {
            id: "evidence",
            signals: [
              signal("creator brief says", "creator says"),
              signal("friday"),
              signal("bid"),
            ],
          },
          {
            id: "escalation",
            signals: [signal("rival"), signal("move first", "moves first")],
          },
          {
            id: "payoff",
            signals: [signal("exit", "sale"), signal("lose", "cost")],
          },
        ],
        hookBodyPromise: {
          hookSignals: [
            signal("manchester united", "united"),
            signal("sale", "sell"),
          ],
          bodyPayoffSignals: [
            signal("friday"),
            signal("bid"),
            signal("rival"),
            signal("lose", "moves first", "move first"),
          ],
        },
        minimumDurationUtilization: 0.68,
        requiredEntities: [
          {
            description: "Manchester United",
            signals: [signal("manchester united", "united")],
          },
          {
            description: "Midfield target",
            signals: [signal("midfielder", "midfield target")],
          },
        ],
      }),
      acceptedNarration:
        "Can Manchester United make their next move when it depends on a sale they have not made? The creator brief says a Friday bid for a midfielder is expected, but United must sell before buying. That timing turns recruitment into a race because a rival could move first. So the real story is whether one exit arrives before United lose the midfield target they want.",
      rejectedSamples: [
        {
          label: "meaningless Manchester United question",
          narration:
            "Why Manchester United now? In the world of football, anything can happen. Passion and determination matter in every transfer window. Time will tell whether the beautiful game delivers another exciting story.",
          expectedReasons: [
            "generic_filler",
            "essential_fact_missing",
            "hook_body_payoff_missing",
          ],
        },
        {
          label: "creator fact stated as confirmed",
          narration:
            "Manchester United need a sale before buying. United submitted the bid on Friday for a midfielder. A rival could move first. The confirmed bid means one exit will decide whether United lose the target.",
          expectedReasons: [
            "required_uncertainty_missing",
            "forbidden_invention",
          ],
        },
      ],
    },
  ] as const;

export function listNarrationQualityGoldenCorpus(): readonly NarrationQualityGoldenFixture[] {
  return NARRATION_QUALITY_GOLDEN_CORPUS;
}
