// lib/types.ts

export type AgentStep =
  | "cartographer"
  | "analyst"
  | "faithful_reconstructor"
  | "commented_reconstructor"
  | "faithful_framer"
  | "commented_framer"
  | "checker";

export interface PipelineState {
  mapContent: string;
  targetLanguage: string;
  communityContext: string;
  passageReference: string;
  // Shared agents
  semanticInventory: string;
  oralBlueprint: string;
  // Track A — Oral Scripture (faithful)
  faithfulReconstruction: string;
  faithfulFramed: string;
  fidelityReport: string;
  faithfulFinalText: string;
  // Track B — Commented Scripture
  commentedReconstruction: string;
  commentedFramed: string;
  commentedFinalText: string;
}

export interface AgentConfig {
  id: AgentStep;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  track: "shared" | "faithful" | "commented";
  outputKey: keyof PipelineState;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: "cartographer",
    title: "Semantic Cartographer",
    subtitle: "Mapping the meaning space",
    icon: "◈",
    track: "shared",
    description:
      "Reads the Prose Meaning Map and produces two sections: Section A (Level 3 propositions only — the renderable content) and Section B (Levels 1–2 — the performance world). This separation enforces faithfulness from the start.",
    outputKey: "semanticInventory",
  },
  {
    id: "analyst",
    title: "Oral Pattern Analyst",
    subtitle: "Reading the oral tradition",
    icon: "◉",
    track: "shared",
    description:
      "Identifies authentic oral narrative conventions of the target language community — discourse connectors, participant-tracking patterns, speech-framing, climax-marking devices.",
    outputKey: "oralBlueprint",
  },
  {
    id: "faithful_reconstructor",
    title: "Faithful Reconstructor",
    subtitle: "Oral Scripture — consultant-approvable",
    icon: "◎",
    track: "faithful",
    description:
      "Tells the passage using ONLY Section A content (Level 3 propositions). Nothing from Levels 1 or 2 may enter the spoken text. The subtraction test applies to every sentence. This output is the translation.",
    outputKey: "faithfulReconstruction",
  },
  {
    id: "commented_reconstructor",
    title: "Commented Reconstructor",
    subtitle: "Commented Scripture — rich contextual telling",
    icon: "◍",
    track: "commented",
    description:
      "Tells the passage drawing freely from all three levels — the arc, the scene world, character depth, theological weight, and the text itself. This is a guided listening experience, not a translation. Rich, contextual, explanatory.",
    outputKey: "commentedReconstruction",
  },
  {
    id: "faithful_framer",
    title: "Faithful Framer",
    subtitle: "Performance scaffolding for Oral Scripture",
    icon: "◐",
    track: "faithful",
    description:
      "Adds legitimate oral metadiscourse to the faithful reconstruction — attentional markers, structural markers, turn-taking markers. Governed by the subtraction rule. No content is added.",
    outputKey: "faithfulFramed",
  },
  {
    id: "commented_framer",
    title: "Commented Framer",
    subtitle: "Performance scaffolding for Commented Scripture",
    icon: "◑",
    track: "commented",
    description:
      "Adds oral metadiscourse to the commented reconstruction. Because the commented version is richer, transitions and attention cues are especially important for listener orientation.",
    outputKey: "commentedFramed",
  },
  {
    id: "checker",
    title: "Fidelity Checker",
    subtitle: "Checking the Oral Scripture track only",
    icon: "◧",
    track: "faithful",
    description:
      "Checks the faithful reconstruction for completeness (every Level 3 element is present) and faithfulness (nothing beyond Level 3 was added). The commented track is not checked — it operates under different rules.",
    outputKey: "fidelityReport",
  },
];

export const SUPPORTED_LANGUAGES = [
  { code: "pt-BR", label: "Português Brasileiro" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "sw", label: "Kiswahili" },
  { code: "ar", label: "العربية" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "hi", label: "हिन्दी" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yorùbá" },
  { code: "am", label: "አማርኛ (Amharic)" },
  { code: "tr", label: "Türkçe" },
  { code: "other", label: "Other (specify in context)" },
];

export const ELEVENLABS_VOICES = [
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — deep, authoritative" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi — warm, natural" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella — clear, expressive" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni — measured, elder-like" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — resonant, strong" },
];
