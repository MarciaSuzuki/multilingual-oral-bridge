// lib/types.ts

export type AgentStep =
  | "cartographer"
  | "analyst"
  | "reconstructor"
  | "framer"
  | "checker";

export interface PipelineState {
  mapContent: string;
  targetLanguage: string;
  communityContext: string;
  passageReference: string;
  // Agent outputs — editable by user
  semanticInventory: string;
  oralBlueprint: string;
  reconstruction: string;
  framedReconstruction: string;
  fidelityReport: string;
  // Final approved text for TTS
  finalText: string;
}

export interface AgentConfig {
  id: AgentStep;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  // Which prior output(s) this agent consumes
  inputs: (keyof PipelineState)[];
  outputKey: keyof PipelineState;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: "cartographer",
    title: "Semantic Cartographer",
    subtitle: "Mapping the meaning space",
    icon: "◈",
    description:
      "Reads the Prose Meaning Map and produces a complete semantic inventory in the target language — every participant, place, object, event, and speech act expressed in natural target-language terms. This breaks the English syntactic frame before reconstruction begins.",
    inputs: ["mapContent", "targetLanguage", "communityContext"],
    outputKey: "semanticInventory",
  },
  {
    id: "analyst",
    title: "Oral Pattern Analyst",
    subtitle: "Reading the oral tradition",
    icon: "◉",
    description:
      "Identifies how skilled storytellers in this language community naturally tell this kind of story — the discourse connectors, participant-tracking conventions, speech-framing patterns, and climax-marking devices of authentic oral narrative in this language.",
    inputs: ["semanticInventory", "targetLanguage", "communityContext"],
    outputKey: "oralBlueprint",
  },
  {
    id: "reconstructor",
    title: "Oral Reconstructor",
    subtitle: "Telling the story from meaning",
    icon: "◎",
    description:
      "A master storyteller persona tells the passage in the target language as an elder would tell it — working from the semantic inventory and oral blueprint, never from any prior text. Forbidden from following proposition order or using church register.",
    inputs: [
      "semanticInventory",
      "oralBlueprint",
      "targetLanguage",
      "communityContext",
    ],
    outputKey: "reconstruction",
  },
  {
    id: "framer",
    title: "Oral Framer",
    subtitle: "Adding performance scaffolding",
    icon: "◐",
    description:
      "Adds legitimate oral metadiscourse per the aural italics taxonomy: attentional markers, structural markers, and turn-taking markers. Each addition is tagged in brackets. Governed by the subtraction rule — if removal causes no confusion, the cue is removed.",
    inputs: ["reconstruction", "targetLanguage", "communityContext"],
    outputKey: "framedReconstruction",
  },
  {
    id: "checker",
    title: "Fidelity Checker",
    subtitle: "Checking completeness and naturalness",
    icon: "◑",
    description:
      "Checks that every semantic element from the inventory is present in the reconstruction. Flags any calquing from known translations, any non-idiomatic expressions, and any passages that sound written rather than oral.",
    inputs: [
      "semanticInventory",
      "framedReconstruction",
      "targetLanguage",
    ],
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

// ElevenLabs voice options — user can also paste a custom voice ID
export const ELEVENLABS_VOICES = [
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — deep, authoritative" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi — warm, natural" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella — clear, expressive" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni — measured, elder-like" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — resonant, strong" },
];
