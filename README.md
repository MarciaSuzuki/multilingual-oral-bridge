# Oral Bridge

**Generating Oral Scriptures for Bridge Languages**

A five-agent pipeline that takes a validated Prose Meaning Map and reconstructs the biblical passage as natural oral performance in a target language — without translating, without translationese.

Part of the **Tripod Method for AI-Assisted Oral Bible Translation**  
OBT Lab · Shema Bible Translation · YWAM Kansas City

---

## The Core Problem This Solves

Standard LLM-based translation defaults to what the model has memorized: known Bible translations in dozens of languages. Even when you give it a meaning map and say "don't translate," it pulls from training data.

Oral Bridge blocks this through a **five-stage constraint pipeline**:

1. **Semantic Cartographer** — Breaks the English syntactic frame by converting all map content into target-language conceptual vocabulary *before* any reconstruction begins. The reconstructor never sees English clause structure.

2. **Oral Pattern Analyst** — Identifies authentic oral narrative conventions of the target language community. The reconstructor must use these patterns — not patterns borrowed from written texts or other languages.

3. **Oral Reconstructor** — Works from the semantic inventory and oral blueprint, not from any text. Explicitly forbidden from following proposition order, matching clause counts, using church register, or producing anything that sounds written. The persona framing ("you are a master storyteller from this community") combined with specific prohibitions makes defaulting to translation much harder.

4. **Oral Framer** — Adds legitimate oral metadiscourse (attentional markers, structural markers, turn-taking markers) per the taxonomy in Suzuki, "From Eye to Ear" (2025). All additions are tagged in brackets. Governed by the subtraction rule: if removal causes no confusion, the cue is removed.

5. **Fidelity Checker** — Two-pass check: semantic completeness (every element from the inventory must be present) and naturalness (no calquing, no translationese, no written register). Not a comparison to any Bible text.

Then ElevenLabs TTS produces audio using `eleven_multilingual_v2`.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/oral-bridge.git
cd oral-bridge
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
ELEVENLABS_API_KEY=your-elevenlabs-key-here
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

### Via GitHub (recommended)

1. Push to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → select your repo.
3. In **Environment Variables**, add:
   - `ANTHROPIC_API_KEY`
   - `ELEVENLABS_API_KEY`
4. Click **Deploy**.

### Via Vercel CLI

```bash
npm install -g vercel
vercel --prod
```

When prompted for environment variables, enter both API keys.

---

## Using the App

### Input requirements

**Meaning Map** — Upload a `.txt`, `.md`, or `.json` file containing a validated Prose Meaning Map (Levels 1, 2, and 3). Or paste directly. The map must be complete and validated before use.

**Community Context** — This is the most important input. Be specific:
- Region and dialect
- Audience (elders, mixed, youth)
- Oral tradition style
- Religious background

Example: `"Terena-speaking Christian community in Mato Grosso do Sul, Brazil — oral storytelling tradition, mixed elder and young adult audience, familiar with biblical narrative through oral telling"`

Poor example: `"Portuguese speakers"`

### Workflow

Each agent runs in sequence. After each one:
- Review the output in the editable text area
- Make any corrections directly
- Click **Approve & Continue** to proceed, or **Regenerate** to try again

The reconstructor output (Agent 3) is the most important step to review. Check that it:
- Sounds spoken, not written
- Uses natural oral discourse connectors, not translated ones
- Does not follow the proposition order line by line
- Does not use formal religious register

The framer output (Agent 4) shows all metadiscourse additions in `[ATTENTIONAL: "..."]`, `[STRUCTURAL: "..."]`, `[TURN: "..."]` tags. Review each one against the subtraction rule.

After Agent 5 (Fidelity Checker), the audio panel opens. The framing tags are automatically stripped for clean TTS input.

---

## Architecture

```
oral-bridge/
├── app/
│   ├── page.tsx              # Complete pipeline UI
│   ├── layout.tsx            # HTML shell, Google Fonts
│   ├── globals.css           # Ink/amber theme, custom properties
│   └── api/
│       ├── agent/route.ts    # Streams Claude agent responses
│       └── tts/route.ts      # ElevenLabs TTS endpoint
├── lib/
│   ├── types.ts              # Pipeline types, agent configs, language list
│   └── agentPrompts.ts       # The five agent prompts (the intellectual core)
```

### API routes

**POST `/api/agent`**
```json
{
  "step": "cartographer" | "analyst" | "reconstructor" | "framer" | "checker",
  "input": {
    "targetLanguage": "Português Brasileiro",
    "communityContext": "...",
    "mapContent": "...",
    "semanticInventory": "...",
    "oralBlueprint": "...",
    "reconstruction": "...",
    "framedReconstruction": "..."
  }
}
```
Returns a streaming text response (plain text, UTF-8).

**POST `/api/tts`**
```json
{
  "text": "...",
  "voiceId": "pNInz6obpgDQGcFmaJgB",
  "modelId": "eleven_multilingual_v2"
}
```
Returns audio/mpeg stream.

---

## Extending the Pipeline

### Adding languages
Edit `lib/types.ts` → `SUPPORTED_LANGUAGES`. Add `{ code: "lg", label: "Language Name" }`.

### Adding ElevenLabs voices
Edit `lib/types.ts` → `ELEVENLABS_VOICES`. Users can also paste any custom voice ID directly in the audio panel.

### Modifying agent prompts
All prompts are in `lib/agentPrompts.ts`. Each function returns `{ system, user }`. The system prompt sets the constraint frame; the user prompt provides the data. Changes take effect immediately without redeployment (if using environment variables) or after redeployment.

### Adding a validation export
To export the full pipeline output as a structured document, add a button in the audio panel that serializes `pipelineState` to JSON or generates a formatted text file.

---

## Theoretical Basis

The anti-translationese constraint strategy is based on the Tripod Method's separation of semantic representation from linguistic expression. See:

- Suzuki, Marcia. *Prose Meaning Map — Methodology Guide*. OBT Lab, 2025.
- Suzuki, Marcia. "From Eye to Ear: Boundaries in Oral Bible Translation." OBT Lab, 2025.
- Suzuki, Marcia & Oliveira, João Victor. "Introducing Acoustography." Zenodo, 2024.

---

## Known Limitations

- **Model memory** — Claude has memorized Scripture in many languages. The constraint pipeline significantly reduces but does not eliminate the risk of the model drawing on known translations. The fidelity checker is designed to catch calquing, but human review remains essential for minority language communities where the risk is lower.

- **Token limits** — Very long meaning maps (full chapters) may approach the token limit for the cartographer. Consider splitting at natural scene boundaries.

- **ElevenLabs language support** — `eleven_multilingual_v2` supports most major languages but may have inconsistent quality for less-resourced languages. Check ElevenLabs documentation for current language support.

- **Oral pattern accuracy** — The analyst agent's accuracy depends on Claude's training data about oral traditions in the target community. For less-documented communities, the analyst output should be reviewed carefully by a community member.
