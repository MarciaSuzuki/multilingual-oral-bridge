"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  SUPPORTED_LANGUAGES,
  ELEVENLABS_VOICES,
  type AgentStep,
  type PipelineState,
} from "@/lib/types";

// ─── Utilities ────────────────────────────────────────────────

function stripFramingTags(text: string): string {
  const notesIndex = text.indexOf("## FRAMING NOTES");
  const cleaned = notesIndex !== -1 ? text.slice(0, notesIndex).trim() : text;
  return cleaned.replace(
    /\[(ATTENTIONAL|STRUCTURAL|TURN): "([^"]*)"\]/g,
    (_m, _t, content: string) => content
  );
}

function getLangLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code;
}

function outputKeyForStep(step: AgentStep): keyof PipelineState {
  const map: Record<AgentStep, keyof PipelineState> = {
    cartographer: "semanticInventory",
    analyst: "oralBlueprint",
    faithful_reconstructor: "faithfulReconstruction",
    commented_reconstructor: "commentedReconstruction",
    faithful_framer: "faithfulFramed",
    commented_framer: "commentedFramed",
    checker: "fidelityReport",
  };
  return map[step];
}

function slug(s: string) {
  return (s || "passage").replace(/[\s:–—]/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
}

type StepStatus = "pending" | "active" | "running" | "done";
type Tracks = { faithful: boolean; commented: boolean };

// Step display names
const STEP_LABELS: Record<AgentStep, string> = {
  cartographer: "Oral Exegesis",
  analyst: "Oral Patterns",
  faithful_reconstructor: "Oral Frames",
  commented_reconstructor: "Oral Frames",
  faithful_framer: "Oral Frames",
  commented_framer: "Oral Frames",
  checker: "Accuracy Check",
};

// More precise per-step labels (used inside panels)
const STEP_FULL_LABELS: Record<AgentStep, string> = {
  cartographer: "Oral Exegesis",
  analyst: "Oral Patterns",
  faithful_reconstructor: "Oral Reconstruction",
  commented_reconstructor: "Oral Reconstruction",
  faithful_framer: "Oral Frames",
  commented_framer: "Oral Frames",
  checker: "Accuracy Check",
};

const FAITHFUL_COLOR = "#6aa0dc";
const COMMENTED_COLOR = "#a078dc";
const SHARED_COLOR = "#c9922a";

// ─── Shared styles ─────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.65rem", letterSpacing: "0.1em",
  textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5,
};
const textareaBase: React.CSSProperties = {
  width: "100%", background: "rgba(13,15,20,0.7)", border: "1px solid var(--ink-700)",
  borderRadius: 5, padding: "11px 14px", color: "var(--text-primary)", resize: "vertical",
  fontFamily: "'Source Serif 4', serif", fontSize: "0.9rem", lineHeight: 1.78,
};
const inputBase: React.CSSProperties = {
  width: "100%", background: "rgba(27,31,46,0.6)", border: "1px solid var(--ink-600)",
  borderRadius: 5, padding: "8px 11px", color: "var(--text-primary)",
  fontFamily: "'Source Serif 4', serif", fontSize: "0.875rem",
};
const primaryBtn = (color: string): React.CSSProperties => ({
  padding: "8px 16px", background: `linear-gradient(135deg, ${color}, ${color}bb)`,
  border: "none", borderRadius: 4, color: "var(--ink-950)",
  fontFamily: "'Source Serif 4', serif", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
});
const ghostBtn: React.CSSProperties = {
  padding: "6px 12px", background: "transparent", border: "1px solid var(--ink-600)",
  borderRadius: 4, color: "var(--slate-light)", fontFamily: "'Source Serif 4', serif",
  fontSize: "0.76rem", cursor: "pointer",
};

// ─── Framing Marker Preview ────────────────────────────────────

function FramedPreview({ text }: { text: string }) {
  const cleaned = text.indexOf("## FRAMING NOTES") !== -1
    ? text.slice(0, text.indexOf("## FRAMING NOTES")).trim() : text;
  const TAG_RE = /\[(ATTENTIONAL|STRUCTURAL|TURN): "([^"]*)"\]/g;
  const parts: React.ReactNode[] = [];
  let last = 0; let match: RegExpExecArray | null; let key = 0;
  const S: Record<string, { bg: string; border: string; label: string }> = {
    ATTENTIONAL: { bg: "rgba(201,146,42,0.14)", border: "#c9922a", label: "ATT" },
    STRUCTURAL: { bg: "rgba(100,160,220,0.10)", border: "#6aa0dc", label: "STR" },
    TURN: { bg: "rgba(120,190,120,0.10)", border: "#78be78", label: "TRN" },
  };
  while ((match = TAG_RE.exec(cleaned)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{cleaned.slice(last, match.index)}</span>);
    const s = S[match[1]] || S.ATTENTIONAL;
    parts.push(
      <span key={key++} style={{ background: s.bg, borderBottom: `1.5px solid ${s.border}`, borderRadius: 2, padding: "1px 4px" }}>
        <span style={{ fontSize: "0.55em", letterSpacing: "0.08em", background: `${s.border}33`, color: s.border, borderRadius: 2, padding: "0 3px", marginRight: 4, fontFamily: "'JetBrains Mono', monospace" }}>{s.label}</span>
        <span style={{ color: s.border }}>{match[2]}</span>
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < cleaned.length) parts.push(<span key={key++}>{cleaned.slice(last)}</span>);
  return (
    <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: "0.9rem", lineHeight: 1.85, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "12px 14px", background: "rgba(13,15,20,0.6)", border: "1px solid var(--ink-700)", borderRadius: 5, minHeight: 80 }}>
      {parts}
    </div>
  );
}

// ─── Export ────────────────────────────────────────────────────

function exportTXT(state: PipelineState, track: "faithful" | "commented") {
  const text = track === "faithful"
    ? stripFramingTags(state.faithfulFramed || state.faithfulReconstruction)
    : stripFramingTags(state.commentedFramed || state.commentedReconstruction);
  const label = track === "faithful" ? "Translation" : "Commentary";
  const header = [`Oral Bridge — ${label}`, `Passage: ${state.passageReference || "(unnamed)"}`, `Language: ${getLangLabel(state.targetLanguage)}`, `Community: ${state.communityContext}`, `Exported: ${new Date().toLocaleString()}`, "─────────────────────────────────", ""].join("\n");
  const blob = new Blob([header + text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `oral-bridge-${track}-${slug(state.passageReference)}.txt`; a.click(); URL.revokeObjectURL(url);
}

function exportJSON(state: PipelineState) {
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `oral-bridge-pipeline-${slug(state.passageReference)}.json`; a.click(); URL.revokeObjectURL(url);
}

// ─── Collapsible Section ───────────────────────────────────────

function Section({ title, subtitle, color, icon, badge, defaultOpen = true, children }: {
  title: string; subtitle?: string; color: string; icon: string;
  badge?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 7, marginBottom: 8, overflow: "hidden", background: "rgba(19,22,32,0.5)" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none", background: `${color}0c` }}>
        <span style={{ color, fontSize: "0.9rem", flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.88rem", fontWeight: 600, color: "var(--amber-pale)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "0.62rem", color: "var(--slate-muted)", marginTop: 1 }}>{subtitle}</div>}
        </div>
        {badge && <span style={{ fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 3, padding: "2px 7px" }}>{badge}</span>}
        <span style={{ color: "var(--slate-muted)", fontSize: "0.65rem" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${color}20` }}>{children}</div>}
    </div>
  );
}

// ─── Agent Step ────────────────────────────────────────────────

function AgentStep({ step, label, description, status, output, isStreaming, error, color, onRun, onEdit, onApprove }: {
  step: AgentStep; label: string; description: string;
  status: StepStatus; output: string; isStreaming: boolean; error: string; color: string;
  onRun: () => void; onEdit: (v: string) => void; onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const isFramer = step === "faithful_framer" || step === "commented_framer";
  const hasFraming = isFramer && output.length > 0 && /\[(ATTENTIONAL|STRUCTURAL|TURN):/.test(output);
  const isDone = status === "done";
  const isActive = status === "active" || status === "running";
  const isPending = status === "pending";
  const dotColor = isDone ? color : isActive ? color : "var(--ink-600)";
  const isOral = step !== "cartographer" && step !== "analyst" && step !== "checker";
  const rows = Math.min(Math.max(output.split("\n").length + 1, 6), 28);

  useEffect(() => {
    if (status === "active") setOpen(true);
    if (status === "done") setOpen(false);
  }, [status]);

  return (
    <div style={{ borderRadius: 6, marginBottom: 5, border: `1px solid ${isDone ? color + "44" : isActive ? color + "28" : "var(--ink-700)"}`, background: isDone ? `${color}06` : isActive ? "rgba(27,31,46,0.55)" : "rgba(19,22,32,0.25)", opacity: isPending ? 0.32 : 1, transition: "all 0.25s ease" }}>
      <div onClick={() => (isDone || output) && setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: isDone || output ? "pointer" : "default", userSelect: "none" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${dotColor}`, background: isDone ? `${dotColor}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: dotColor, fontSize: "0.6rem", flexShrink: 0, animation: isStreaming ? "pulse-ring 1.2s ease-in-out infinite" : "none", transition: "all 0.3s ease" }}>
          {isDone ? "✓" : isStreaming ? "◌" : ""}
        </div>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: isActive || isDone ? "var(--text-primary)" : "var(--slate-muted)", flex: 1 }}>{label}</span>
        <span style={{ fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", color: isDone ? color : isStreaming ? "var(--amber-warm)" : isActive ? "var(--slate-muted)" : "var(--ink-600)" }}>
          {isDone ? "done" : isStreaming ? "running…" : isActive ? "ready" : "pending"}
        </span>
        {(isDone || output) && <span style={{ color: "var(--slate-muted)", fontSize: "0.58rem", marginLeft: 3 }}>{open ? "▾" : "▸"}</span>}
      </div>

      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {isActive && !output && !isStreaming && (
            <>
              <p style={{ fontSize: "0.78rem", color: "var(--slate-light)", lineHeight: 1.65, marginBottom: 10 }}>{description}</p>
              <button onClick={onRun} style={primaryBtn(color)}>Run →</button>
            </>
          )}
          {isStreaming && !output && <div className="streaming-cursor" style={{ fontSize: "0.78rem", color: "var(--slate-muted)", fontStyle: "italic", padding: "4px 0" }}>Thinking</div>}
          {output && (
            <>
              {hasFraming && (
                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                  {(["edit", "preview"] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "2px 8px", fontSize: "0.63rem", letterSpacing: "0.05em", textTransform: "uppercase", border: `1px solid ${viewMode === mode ? color : "var(--ink-600)"}`, borderRadius: 3, background: viewMode === mode ? `${color}18` : "transparent", color: viewMode === mode ? color : "var(--slate-muted)", cursor: "pointer" }}>
                      {mode === "edit" ? "Edit" : "Preview"}
                    </button>
                  ))}
                </div>
              )}
              {viewMode === "preview" && hasFraming
                ? <FramedPreview text={output} />
                : <textarea value={output} onChange={(e) => onEdit(e.target.value)} disabled={isStreaming} rows={rows} className={isStreaming ? "streaming-cursor" : ""} style={{ ...textareaBase, fontFamily: isOral ? "'Source Serif 4', serif" : "'JetBrains Mono', monospace", fontSize: isOral ? "0.9rem" : "0.75rem", opacity: isStreaming ? 0.65 : 1 }} />
              }
              {error && <div style={{ marginTop: 7, padding: "7px 10px", background: "rgba(180,50,50,0.12)", border: "1px solid rgba(180,50,50,0.3)", borderRadius: 4, color: "#e88", fontSize: "0.75rem" }}>{error}</div>}
              {!isStreaming && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                  <button onClick={onRun} style={ghostBtn}>↻ Redo</button>
                  {!isDone && <button onClick={onApprove} style={primaryBtn(color)}>Approve →</button>}
                  {isDone && <span style={{ fontSize: "0.67rem", color, alignSelf: "center" }}>✓ Approved</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Audio Panel ───────────────────────────────────────────────

function AudioPanel({ title, color, text, passageRef, langCode, trackId, onExportTXT }: {
  title: string; color: string; text: string; passageRef: string;
  langCode: string; trackId: "faithful" | "commented"; onExportTXT: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [voiceId, setVoiceId] = useState(ELEVENLABS_VOICES[0].id);
  const [customVoice, setCustomVoice] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cleanText, setCleanText] = useState(() => stripFramingTags(text));

  const generate = async () => {
    setLoading(true); setError(""); setAudioUrl(null);
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: cleanText, voiceId: customVoice.trim() || voiceId, modelId: "eleven_multilingual_v2" }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error || `ElevenLabs error ${res.status}`); }
      const blob = await res.blob(); setAudioUrl(URL.createObjectURL(blob));
    } catch (err) { setError(err instanceof Error ? err.message : "Unknown error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ border: `1px solid ${color}55`, borderRadius: 7, overflow: "hidden", background: `${color}07` }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none", background: `${color}0e` }}>
        <span style={{ color, fontSize: "1rem" }}>♪</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.88rem", fontWeight: 600, color: "var(--amber-pale)" }}>{title}</div>
          <div style={{ fontSize: "0.62rem", color: "var(--slate-muted)", fontStyle: "italic" }}>ElevenLabs · eleven_multilingual_v2</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onExportTXT(); }} style={ghostBtn}>↓ .txt</button>
        <span style={{ color: "var(--slate-muted)", fontSize: "0.65rem", marginLeft: 4 }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${color}22` }}>
          <textarea value={cleanText} onChange={(e) => setCleanText(e.target.value)} rows={9} style={{ ...textareaBase, marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Voice</label>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>
                {ELEVENLABS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Custom voice ID</label>
              <input type="text" value={customVoice} onChange={(e) => setCustomVoice(e.target.value)} placeholder="Paste ElevenLabs ID…" style={{ ...inputBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }} />
            </div>
          </div>
          <button onClick={generate} disabled={loading || !cleanText.trim()} style={{ width: "100%", padding: "10px 24px", background: loading || !cleanText.trim() ? "var(--ink-700)" : `linear-gradient(135deg, ${color}, ${color}bb)`, border: "none", borderRadius: 5, color: loading || !cleanText.trim() ? "var(--slate-muted)" : "var(--ink-950)", fontFamily: "'Playfair Display', serif", fontSize: "0.88rem", fontWeight: 600, cursor: loading || !cleanText.trim() ? "not-allowed" : "pointer", marginBottom: 10 }}>
            {loading ? "Generating…" : "Generate Audio ♪"}
          </button>
          {error && <div style={{ padding: "8px 10px", background: "rgba(180,50,50,0.12)", border: "1px solid rgba(180,50,50,0.3)", borderRadius: 4, color: "#e88", fontSize: "0.78rem", marginBottom: 8 }}>{error}</div>}
          {audioUrl && (
            <div className="fade-in" style={{ padding: "12px 13px", background: "rgba(13,15,20,0.6)", borderRadius: 5, border: `1px solid ${color}44` }}>
              <div style={{ fontSize: "0.7rem", color, marginBottom: 8 }}>✓ {passageRef} · {getLangLabel(langCode)}</div>
              <audio controls src={audioUrl} style={{ width: "100%", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 7 }}>
                <a href={audioUrl} download={`oral-bridge-${trackId}-${slug(passageRef)}.mp3`} style={{ padding: "6px 11px", background: `${color}22`, border: `1px solid ${color}`, borderRadius: 4, color, fontSize: "0.73rem", textDecoration: "none" }}>↓ .mp3</a>
                <button onClick={() => { setAudioUrl(null); generate(); }} style={ghostBtn}>↻ Redo</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Progress Strip ────────────────────────────────────────────

function ProgressStrip({ statuses, streaming, tracks }: {
  statuses: Record<AgentStep, StepStatus>; streaming: AgentStep | null; tracks: Tracks;
}) {
  const Dot = ({ id, label, color }: { id: AgentStep; label: string; color: string }) => {
    const s = statuses[id];
    const isDone = s === "done";
    const isActive = s === "active" || s === "running";
    const isRunning = streaming === id;
    const c = isDone ? color : isActive ? color : "var(--ink-600)";
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 58 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${c}`, background: isDone ? `${c}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: c, fontSize: "0.6rem", animation: isRunning ? "pulse-ring 1.2s ease-in-out infinite" : "none", transition: "all 0.3s ease" }}>
          {isDone ? "✓" : ""}
        </div>
        <span style={{ fontSize: "0.5rem", letterSpacing: "0.04em", textTransform: "uppercase", color: isDone || isActive ? c : "var(--ink-600)", textAlign: "center", lineHeight: 1.3, maxWidth: 56 }}>{label}</span>
      </div>
    );
  };
  const Line = ({ color, done }: { color: string; done: boolean }) => (
    <div style={{ height: 1, flex: 1, background: done ? color : "var(--ink-600)", transition: "background 0.4s ease", margin: "0 3px", marginBottom: 16, minWidth: 8 }} />
  );

  return (
    <div style={{ padding: "12px 24px 8px", borderBottom: "1px solid var(--ink-700)", background: "rgba(13,15,20,0.85)", overflowX: "auto" }}>
      <style>{`@keyframes pulse-ring{0%,100%{box-shadow:0 0 0 0 rgba(201,146,42,0.5)}50%{box-shadow:0 0 0 4px rgba(201,146,42,0)}}`}</style>
      {/* Shared */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: SHARED_COLOR, marginRight: 8, marginTop: 3, whiteSpace: "nowrap" }}>shared</div>
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <Dot id="cartographer" label="Oral Exegesis" color={SHARED_COLOR} />
          <Line color={SHARED_COLOR} done={statuses.cartographer === "done"} />
          <Dot id="analyst" label="Oral Patterns" color={SHARED_COLOR} />
        </div>
      </div>
      {/* Tracks */}
      <div style={{ display: "grid", gridTemplateColumns: tracks.faithful && tracks.commented ? "1fr 1fr" : "1fr", gap: 8, paddingLeft: 40 }}>
        {tracks.faithful && (
          <div>
            <div style={{ fontSize: "0.48rem", letterSpacing: "0.1em", textTransform: "uppercase", color: FAITHFUL_COLOR, marginBottom: 4 }}>translation</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Dot id="faithful_reconstructor" label="Oral Reconstruction" color={FAITHFUL_COLOR} />
              <Line color={FAITHFUL_COLOR} done={statuses.faithful_reconstructor === "done"} />
              <Dot id="faithful_framer" label="Oral Frames" color={FAITHFUL_COLOR} />
              <Line color={FAITHFUL_COLOR} done={statuses.faithful_framer === "done"} />
              <Dot id="checker" label="Accuracy Check" color={FAITHFUL_COLOR} />
            </div>
          </div>
        )}
        {tracks.commented && (
          <div>
            <div style={{ fontSize: "0.48rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COMMENTED_COLOR, marginBottom: 4 }}>commentary</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Dot id="commented_reconstructor" label="Oral Reconstruction" color={COMMENTED_COLOR} />
              <Line color={COMMENTED_COLOR} done={statuses.commented_reconstructor === "done"} />
              <Dot id="commented_framer" label="Oral Frames" color={COMMENTED_COLOR} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload Panel ──────────────────────────────────────────────

function UploadPanel({ onStart }: {
  onStart: (mapContent: string, language: string, communityContext: string, passage: string, tracks: Tracks) => void;
}) {
  const [mapText, setMapText] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [communityContext, setCommunityContext] = useState("");
  const [passage, setPassage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tracks, setTracks] = useState<Tracks>({ faithful: true, commented: true });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setMapText((e.target?.result as string) || "");
    reader.readAsText(file);
  };
  const mapOk = mapText.trim().length > 100;
  const contextOk = communityContext.trim().length > 5;
  const tracksOk = tracks.faithful || tracks.commented;
  const canStart = mapOk && language && contextOk && tracksOk;
  const wordCount = mapText.split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "44px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 34 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.8rem, 4vw, 2.5rem)", fontWeight: 700, color: "var(--amber-pale)", lineHeight: 1.15, marginBottom: 10 }}>
          From meaning to voice
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.7, maxWidth: 440, margin: "0 auto 10px" }}>
          Upload a validated Prose Meaning Map and choose which tracks to generate.
        </p>
        <div style={{ display: "inline-flex", gap: 10, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>
          <span>OBT Lab</span><span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Shema Bible Translation</span><span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Tripod Method</span>
        </div>
      </div>

      {/* Drop zone */}
      <div onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onClick={() => fileRef.current?.click()}
        style={{ border: `1.5px dashed ${dragOver ? "var(--amber-gold)" : mapOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)"}`, borderRadius: 8, padding: "20px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: dragOver ? "rgba(201,146,42,0.06)" : "rgba(27,31,46,0.3)", transition: "all 0.2s ease" }}>
        <div style={{ fontSize: "1.2rem", color: mapOk ? "var(--amber-gold)" : "var(--slate-muted)", marginBottom: 4 }}>{mapOk ? "✓" : "↑"}</div>
        <div style={{ fontSize: "0.83rem", color: "var(--slate-light)", marginBottom: 2 }}>
          {mapOk ? `${wordCount.toLocaleString()} words loaded — click to replace` : "Drop your Prose Meaning Map here, or click to browse"}
        </div>
        <div style={{ fontSize: "0.68rem", color: "var(--slate-muted)" }}>.txt · .md · .json</div>
        <input ref={fileRef} type="file" accept=".txt,.md,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Or paste the map</label>
        <textarea value={mapText} onChange={(e) => setMapText(e.target.value)} rows={4} placeholder="Paste your validated Prose Meaning Map here…" style={{ ...textareaBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", borderColor: mapOk ? "rgba(201,146,42,0.4)" : "var(--ink-700)" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Passage reference</label>
          <input type="text" value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="e.g. Ruth 1:1–7" style={inputBase} />
        </div>
        <div>
          <label style={labelStyle}>Target language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>
            {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Community context <span style={{ color: "var(--amber-gold)" }}>*</span></label>
        <textarea value={communityContext} onChange={(e) => setCommunityContext(e.target.value)} rows={2}
          placeholder={`e.g. Rural ${getLangLabel(language)}-speaking community in [region] — oral storytelling tradition`}
          style={{ ...textareaBase, fontSize: "0.875rem", borderColor: contextOk ? "rgba(201,146,42,0.4)" : "var(--ink-700)" }} />
      </div>

      {/* Track selection */}
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Output tracks</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([
            { key: "faithful" as const, label: "Translation", sub: "Faithful · consultant-approvable", color: FAITHFUL_COLOR },
            { key: "commented" as const, label: "Commentary", sub: "Rich · contextual · explanatory", color: COMMENTED_COLOR },
          ]).map(t => (
            <div key={t.key} onClick={() => setTracks(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
              style={{ padding: "11px 13px", border: `1.5px solid ${tracks[t.key] ? t.color : "var(--ink-600)"}`, borderRadius: 7, cursor: "pointer", background: tracks[t.key] ? `${t.color}0e` : "rgba(19,22,32,0.4)", transition: "all 0.2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                <div style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${tracks[t.key] ? t.color : "var(--ink-600)"}`, background: tracks[t.key] ? t.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.52rem", color: "var(--ink-950)", flexShrink: 0 }}>
                  {tracks[t.key] ? "✓" : ""}
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: tracks[t.key] ? "var(--text-primary)" : "var(--slate-muted)" }}>{t.label}</span>
              </div>
              <div style={{ fontSize: "0.67rem", color: tracks[t.key] ? t.color : "var(--ink-600)", paddingLeft: 20 }}>{t.sub}</div>
            </div>
          ))}
        </div>
        {!tracksOk && <p style={{ fontSize: "0.7rem", color: "#e88", marginTop: 6 }}>Select at least one track.</p>}
      </div>

      <button disabled={!canStart} onClick={() => onStart(mapText, language, communityContext, passage, tracks)}
        style={{ width: "100%", padding: "12px 24px", background: canStart ? "linear-gradient(135deg, var(--amber-gold), #a97420)" : "var(--ink-700)", border: "none", borderRadius: 6, color: canStart ? "var(--ink-950)" : "var(--slate-muted)", fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", fontWeight: 600, cursor: canStart ? "pointer" : "not-allowed", transition: "all 0.2s ease" }}>
        {canStart ? "Begin Pipeline →" : "Complete required fields to continue"}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function OralBridgePage() {
  const [phase, setPhase] = useState<"upload" | "pipeline">("upload");
  const [activeTracks, setActiveTracks] = useState<Tracks>({ faithful: true, commented: true });
  // Track audio readiness independently per track
  const [faithfulAudioReady, setFaithfulAudioReady] = useState(false);
  const [commentedAudioReady, setCommentedAudioReady] = useState(false);

  const [pipelineState, setPipelineState] = useState<PipelineState>({
    mapContent: "", targetLanguage: "", communityContext: "", passageReference: "",
    semanticInventory: "", oralBlueprint: "",
    faithfulReconstruction: "", faithfulFramed: "", fidelityReport: "", faithfulFinalText: "",
    commentedReconstruction: "", commentedFramed: "", commentedFinalText: "",
  });

  const stateRef = useRef(pipelineState);
  useEffect(() => { stateRef.current = pipelineState; }, [pipelineState]);

  const [stepStatuses, setStepStatuses] = useState<Record<AgentStep, StepStatus>>(() => ({
    cartographer: "pending", analyst: "pending",
    faithful_reconstructor: "pending", commented_reconstructor: "pending",
    faithful_framer: "pending", commented_framer: "pending", checker: "pending",
  }));
  const [stepErrors, setStepErrors] = useState<Record<AgentStep, string>>(() => ({
    cartographer: "", analyst: "",
    faithful_reconstructor: "", commented_reconstructor: "",
    faithful_framer: "", commented_framer: "", checker: "",
  }));
  const [streamingStep, setStreamingStep] = useState<AgentStep | null>(null);

  const handleStart = (mapContent: string, language: string, communityContext: string, passage: string, tracks: Tracks) => {
    const fresh: PipelineState = {
      mapContent, targetLanguage: language, communityContext, passageReference: passage,
      semanticInventory: "", oralBlueprint: "",
      faithfulReconstruction: "", faithfulFramed: "", fidelityReport: "", faithfulFinalText: "",
      commentedReconstruction: "", commentedFramed: "", commentedFinalText: "",
    };
    setPipelineState(fresh);
    stateRef.current = fresh;
    setActiveTracks(tracks);
    setFaithfulAudioReady(false);
    setCommentedAudioReady(false);
    setStepStatuses({
      cartographer: "active", analyst: "pending",
      faithful_reconstructor: "pending", commented_reconstructor: "pending",
      faithful_framer: "pending", commented_framer: "pending", checker: "pending",
    });
    setStepErrors({ cartographer: "", analyst: "", faithful_reconstructor: "", commented_reconstructor: "", faithful_framer: "", commented_framer: "", checker: "" });
    setPhase("pipeline");
  };

  const runStep = useCallback(async (step: AgentStep) => {
    const outputKey = outputKeyForStep(step);
    const s = stateRef.current;
    const input = {
      targetLanguage: getLangLabel(s.targetLanguage),
      communityContext: s.communityContext,
      mapContent: s.mapContent,
      semanticInventory: s.semanticInventory,
      oralBlueprint: s.oralBlueprint,
      faithfulReconstruction: s.faithfulReconstruction,
      commentedReconstruction: s.commentedReconstruction,
      faithfulFramed: s.faithfulFramed,
      commentedFramed: s.commentedFramed,
    };
    setStreamingStep(step);
    setStepStatuses(prev => ({ ...prev, [step]: "running" }));
    setStepErrors(prev => ({ ...prev, [step]: "" }));
    setPipelineState(prev => ({ ...prev, [outputKey]: "" }));
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, input }) });
      if (!response.ok) { const t = await response.text(); throw new Error(`API ${response.status}: ${t}`); }
      if (!response.body) throw new Error("Empty response");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setPipelineState(prev => ({ ...prev, [outputKey]: accumulated }));
      }
      setStepStatuses(prev => ({ ...prev, [step]: "active" }));
    } catch (err) {
      setStepErrors(prev => ({ ...prev, [step]: err instanceof Error ? err.message : "Unknown error" }));
      setStepStatuses(prev => ({ ...prev, [step]: "active" }));
    } finally { setStreamingStep(null); }
  }, []);

  // ── Approval transitions — simple, direct, per-track ──────────
  // Each track flows independently after the shared steps.
  // Approving one track never blocks or waits for the other.
  const approveStep = useCallback((step: AgentStep) => {
    setStepStatuses(prev => ({ ...prev, [step]: "done" }));

    switch (step) {
      // ── Shared ──────────────────────────────────────────────
      case "cartographer":
        setStepStatuses(prev => ({ ...prev, analyst: "active" }));
        break;

      case "analyst":
        setStepStatuses(prev => ({
          ...prev,
          ...(activeTracks.faithful ? { faithful_reconstructor: "active" } : {}),
          ...(activeTracks.commented ? { commented_reconstructor: "active" } : {}),
        }));
        break;

      // ── Translation track ────────────────────────────────────
      case "faithful_reconstructor":
        setStepStatuses(prev => ({ ...prev, faithful_framer: "active" }));
        break;

      case "faithful_framer":
        setStepStatuses(prev => ({ ...prev, checker: "active" }));
        break;

      case "checker": {
        const st = stateRef.current;
        setPipelineState(p => ({ ...p, faithfulFinalText: stripFramingTags(st.faithfulFramed || st.faithfulReconstruction) }));
        setFaithfulAudioReady(true);
        setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
        break;
      }

      // ── Commentary track ─────────────────────────────────────
      case "commented_reconstructor":
        setStepStatuses(prev => ({ ...prev, commented_framer: "active" }));
        break;

      case "commented_framer": {
        const st = stateRef.current;
        setPipelineState(p => ({ ...p, commentedFinalText: stripFramingTags(st.commentedFramed || st.commentedReconstruction) }));
        setCommentedAudioReady(true);
        setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
        break;
      }
    }
  }, [activeTracks]);

  const editOutput = useCallback((step: AgentStep, value: string) => {
    setPipelineState(prev => ({ ...prev, [outputKeyForStep(step)]: value }));
  }, []);

  const descriptions: Record<AgentStep, string> = {
    cartographer: "Reads the Prose Meaning Map and produces two sections: Section A (Level 3 propositions — the only content that may be spoken) and Section B (Levels 1–2 — the performance world that shapes register and emotional weight without contributing spoken content).",
    analyst: "Identifies authentic oral narrative conventions of the target community — discourse connectors, participant tracking, speech framing, climax marking, and the register features that distinguish oral from written.",
    faithful_reconstructor: "Tells the passage using ONLY Section A content. The subtraction test applies to every sentence: if it is not in Section A, it is deleted. This is the Translation.",
    commented_reconstructor: "Tells and illuminates the passage as a master elder would — weaving the text and its world together, drawing freely from both sections. This is the Commentary.",
    faithful_framer: "Adds oral metadiscourse (attentional, structural, turn-taking markers) to the Translation. Governed by the subtraction rule — no content is added.",
    commented_framer: "Adds oral metadiscourse to the Commentary to help listeners follow the richer, contextual telling.",
    checker: "Checks the Translation for completeness (every Level 3 element is present) and faithfulness (nothing beyond Level 3 was added).",
  };

  const audioOpen = faithfulAudioReady || commentedAudioReady;

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(13,15,20,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--ink-700)", padding: "10px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1 }}>
          <div style={{ width: 28, height: 28, border: "1.5px solid var(--amber-gold)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--amber-gold)" }}>◎</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--amber-pale)", lineHeight: 1.1 }}>Oral Bridge</div>
            <div style={{ fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>Generating Oral Scriptures for Bridge Languages</div>
          </div>
        </div>
        {phase === "pipeline" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pipelineState.passageReference && <span style={{ fontFamily: "'Playfair Display', serif", color: "var(--amber-pale)", fontSize: "0.85rem" }}>{pipelineState.passageReference}</span>}
            <span style={{ color: "var(--slate-muted)" }}>·</span>
            <span style={{ color: "var(--amber-warm)", fontSize: "0.8rem" }}>{getLangLabel(pipelineState.targetLanguage)}</span>
            <button onClick={() => setPhase("upload")} style={{ ...ghostBtn, fontSize: "0.7rem", padding: "4px 10px", marginLeft: 6 }}>← New map</button>
          </div>
        )}
      </header>

      {phase === "upload" && <UploadPanel onStart={handleStart} />}

      {phase === "pipeline" && (
        <>
          <ProgressStrip statuses={stepStatuses} streaming={streamingStep} tracks={activeTracks} />

          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 18px 80px" }}>

            {/* Shared section */}
            <Section title="Shared Analysis" subtitle="Oral Exegesis · Oral Patterns" color={SHARED_COLOR} icon="◈"
              badge={stepStatuses.analyst === "done" ? "complete" : "in progress"}
              defaultOpen={stepStatuses.analyst !== "done"}>
              <AgentStep step="cartographer" label={STEP_FULL_LABELS.cartographer} description={descriptions.cartographer}
                status={stepStatuses.cartographer} output={pipelineState.semanticInventory}
                isStreaming={streamingStep === "cartographer"} error={stepErrors.cartographer} color={SHARED_COLOR}
                onRun={() => runStep("cartographer")} onEdit={v => editOutput("cartographer", v)} onApprove={() => approveStep("cartographer")} />
              <AgentStep step="analyst" label={STEP_FULL_LABELS.analyst} description={descriptions.analyst}
                status={stepStatuses.analyst} output={pipelineState.oralBlueprint}
                isStreaming={streamingStep === "analyst"} error={stepErrors.analyst} color={SHARED_COLOR}
                onRun={() => runStep("analyst")} onEdit={v => editOutput("analyst", v)} onApprove={() => approveStep("analyst")} />
            </Section>

            {/* Two-column tracks */}
            <div style={{ display: "grid", gridTemplateColumns: activeTracks.faithful && activeTracks.commented ? "1fr 1fr" : "1fr", gap: 14, marginTop: 4 }}>

              {activeTracks.faithful && (
                <Section title="Translation" subtitle="Faithful · consultant-approvable" color={FAITHFUL_COLOR} icon="◎"
                  badge={stepStatuses.checker === "done" ? "complete" : stepStatuses.faithful_reconstructor === "pending" ? "waiting" : "in progress"}>
                  <AgentStep step="faithful_reconstructor" label={STEP_FULL_LABELS.faithful_reconstructor} description={descriptions.faithful_reconstructor}
                    status={stepStatuses.faithful_reconstructor} output={pipelineState.faithfulReconstruction}
                    isStreaming={streamingStep === "faithful_reconstructor"} error={stepErrors.faithful_reconstructor} color={FAITHFUL_COLOR}
                    onRun={() => runStep("faithful_reconstructor")} onEdit={v => editOutput("faithful_reconstructor", v)} onApprove={() => approveStep("faithful_reconstructor")} />
                  <AgentStep step="faithful_framer" label={STEP_FULL_LABELS.faithful_framer} description={descriptions.faithful_framer}
                    status={stepStatuses.faithful_framer} output={pipelineState.faithfulFramed}
                    isStreaming={streamingStep === "faithful_framer"} error={stepErrors.faithful_framer} color={FAITHFUL_COLOR}
                    onRun={() => runStep("faithful_framer")} onEdit={v => editOutput("faithful_framer", v)} onApprove={() => approveStep("faithful_framer")} />
                  <AgentStep step="checker" label={STEP_FULL_LABELS.checker} description={descriptions.checker}
                    status={stepStatuses.checker} output={pipelineState.fidelityReport}
                    isStreaming={streamingStep === "checker"} error={stepErrors.checker} color={FAITHFUL_COLOR}
                    onRun={() => runStep("checker")} onEdit={v => editOutput("checker", v)} onApprove={() => approveStep("checker")} />
                </Section>
              )}

              {activeTracks.commented && (
                <Section title="Commentary" subtitle="Rich · contextual · explanatory" color={COMMENTED_COLOR} icon="◍"
                  badge={stepStatuses.commented_framer === "done" ? "complete" : stepStatuses.commented_reconstructor === "pending" ? "waiting" : "in progress"}>
                  <AgentStep step="commented_reconstructor" label={STEP_FULL_LABELS.commented_reconstructor} description={descriptions.commented_reconstructor}
                    status={stepStatuses.commented_reconstructor} output={pipelineState.commentedReconstruction}
                    isStreaming={streamingStep === "commented_reconstructor"} error={stepErrors.commented_reconstructor} color={COMMENTED_COLOR}
                    onRun={() => runStep("commented_reconstructor")} onEdit={v => editOutput("commented_reconstructor", v)} onApprove={() => approveStep("commented_reconstructor")} />
                  <AgentStep step="commented_framer" label={STEP_FULL_LABELS.commented_framer} description={descriptions.commented_framer}
                    status={stepStatuses.commented_framer} output={pipelineState.commentedFramed}
                    isStreaming={streamingStep === "commented_framer"} error={stepErrors.commented_framer} color={COMMENTED_COLOR}
                    onRun={() => runStep("commented_framer")} onEdit={v => editOutput("commented_framer", v)} onApprove={() => approveStep("commented_framer")} />
                </Section>
              )}
            </div>

            {/* Audio outputs — appear independently as each track completes */}
            {audioOpen && (
              <div id="audio-section">
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 0 14px" }}>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to right, transparent, var(--amber-gold))" }} />
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", background: "rgba(201,146,42,0.1)", border: "1px solid var(--amber-gold)", borderRadius: 20, color: "var(--amber-warm)", fontSize: "0.73rem" }}>
                    ✓ Audio ready
                  </div>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to left, transparent, var(--amber-gold))" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <button onClick={() => exportJSON(pipelineState)} style={ghostBtn}>↓ Export pipeline .json</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: faithfulAudioReady && commentedAudioReady ? "1fr 1fr" : "1fr", gap: 14 }}>
                  {faithfulAudioReady && (
                    <AudioPanel title="Translation" color={FAITHFUL_COLOR} trackId="faithful"
                      text={pipelineState.faithfulFinalText || stripFramingTags(pipelineState.faithfulFramed || pipelineState.faithfulReconstruction)}
                      passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                      onExportTXT={() => exportTXT(pipelineState, "faithful")} />
                  )}
                  {commentedAudioReady && (
                    <AudioPanel title="Commentary" color={COMMENTED_COLOR} trackId="commented"
                      text={pipelineState.commentedFinalText || stripFramingTags(pipelineState.commentedFramed || pipelineState.commentedReconstruction)}
                      passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                      onExportTXT={() => exportTXT(pipelineState, "commented")} />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", padding: "16px 24px", borderTop: "1px solid var(--ink-700)", color: "var(--slate-muted)", fontSize: "0.6rem", letterSpacing: "0.06em" }}>
        Tripod Method · OBT Lab · Shema Bible Translation · YWAM Kansas City
      </div>
    </div>
  );
}
