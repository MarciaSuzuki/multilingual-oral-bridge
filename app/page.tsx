"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  AGENT_CONFIGS,
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

const STEP_ORDER: AgentStep[] = [
  "cartographer", "analyst",
  "faithful_reconstructor", "commented_reconstructor",
  "faithful_framer", "commented_framer",
  "checker",
];

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
const primaryBtn: React.CSSProperties = {
  padding: "8px 16px", background: "linear-gradient(135deg, var(--amber-gold), #a97420)",
  border: "none", borderRadius: 4, color: "var(--ink-950)",
  fontFamily: "'Source Serif 4', serif", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "6px 12px", background: "transparent", border: "1px solid var(--ink-600)",
  borderRadius: 4, color: "var(--slate-light)", fontFamily: "'Source Serif 4', serif",
  fontSize: "0.76rem", cursor: "pointer",
};

// ─── Framing Marker Preview ────────────────────────────────────

function FramedPreview({ text }: { text: string }) {
  const cleaned = text.indexOf("## FRAMING NOTES") !== -1
    ? text.slice(0, text.indexOf("## FRAMING NOTES")).trim()
    : text;
  const TAG_RE = /\[(ATTENTIONAL|STRUCTURAL|TURN): "([^"]*)"\]/g;
  const parts: React.ReactNode[] = [];
  let last = 0; let match: RegExpExecArray | null; let key = 0;
  const styles: Record<string, { bg: string; border: string; label: string }> = {
    ATTENTIONAL: { bg: "rgba(201,146,42,0.14)", border: "#c9922a", label: "ATT" },
    STRUCTURAL: { bg: "rgba(100,160,220,0.10)", border: "#6aa0dc", label: "STR" },
    TURN: { bg: "rgba(120,190,120,0.10)", border: "#78be78", label: "TRN" },
  };
  while ((match = TAG_RE.exec(cleaned)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{cleaned.slice(last, match.index)}</span>);
    const s = styles[match[1]] || styles.ATTENTIONAL;
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
  const label = track === "faithful" ? "Oral Scripture" : "Commented Scripture";
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

function Section({ title, color, icon, status, defaultOpen = true, children }: {
  title: string; color: string; icon: string; status: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 7, marginBottom: 8, overflow: "hidden", background: "rgba(19,22,32,0.5)" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", userSelect: "none", background: `${color}0a` }}>
        <span style={{ color, fontSize: "0.9rem", flexShrink: 0 }}>{icon}</span>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.88rem", fontWeight: 600, color: "var(--amber-pale)", flex: 1 }}>{title}</span>
        <span style={{ fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", color, marginRight: 8 }}>{status}</span>
        <span style={{ color: "var(--slate-muted)", fontSize: "0.65rem" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "12px 14px", borderTop: `1px solid ${color}22` }}>{children}</div>}
    </div>
  );
}

// ─── Agent Step (compact) ──────────────────────────────────────

function AgentStep({ step, label, description, status, output, isStreaming, error, color, onRun, onEdit, onApprove }: {
  step: AgentStep; label: string; description: string;
  status: StepStatus; output: string; isStreaming: boolean; error: string; color: string;
  onRun: () => void; onEdit: (v: string) => void; onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const isFramer = step === "faithful_framer" || step === "commented_framer";
  const hasFraming = isFramer && output.length > 0 && /\[(ATTENTIONAL|STRUCTURAL|TURN):/.test(output);

  // Auto-open when active, auto-close when done
  useEffect(() => {
    if (status === "active") setOpen(true);
    if (status === "done") setOpen(false);
  }, [status]);

  const isDone = status === "done";
  const isActive = status === "active" || status === "running";
  const isPending = status === "pending";
  const dotColor = isDone ? color : isActive ? color : "var(--ink-600)";
  const rows = Math.min(Math.max(output.split("\n").length + 1, 6), 28);

  return (
    <div style={{ borderRadius: 6, marginBottom: 6, border: `1px solid ${isDone ? color + "55" : isActive ? color + "33" : "var(--ink-700)"}`, background: isDone ? `${color}06` : isActive ? "rgba(27,31,46,0.6)" : "rgba(19,22,32,0.3)", opacity: isPending ? 0.35 : 1, transition: "all 0.3s ease" }}>
      <div onClick={() => (isDone || output) && setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", cursor: isDone || output ? "pointer" : "default", userSelect: "none" }}>
        {/* Status dot */}
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${dotColor}`, background: isDone ? `${dotColor}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: dotColor, fontSize: "0.65rem", flexShrink: 0, animation: isStreaming ? "pulse-ring 1.2s ease-in-out infinite" : "none" }}>
          {isDone ? "✓" : isStreaming ? "◌" : ""}
        </div>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: isActive || isDone ? "var(--text-primary)" : "var(--slate-muted)", flex: 1 }}>{label}</span>
        <span style={{ fontSize: "0.6rem", letterSpacing: "0.07em", textTransform: "uppercase", color: isDone ? color : isStreaming ? "var(--amber-warm)" : isActive ? "var(--slate-muted)" : "var(--ink-600)" }}>
          {isDone ? "done" : isStreaming ? "running…" : isActive ? "ready" : "pending"}
        </span>
        {(isDone || output) && <span style={{ color: "var(--slate-muted)", fontSize: "0.6rem", marginLeft: 4 }}>{open ? "▾" : "▸"}</span>}
      </div>

      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {isActive && !output && !isStreaming && (
            <>
              <p style={{ fontSize: "0.8rem", color: "var(--slate-light)", lineHeight: 1.65, marginBottom: 10 }}>{description}</p>
              <button onClick={onRun} style={{ ...primaryBtn, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>Run →</button>
            </>
          )}
          {isStreaming && !output && <div className="streaming-cursor" style={{ fontSize: "0.8rem", color: "var(--slate-muted)", fontStyle: "italic", padding: "4px 0" }}>Thinking</div>}
          {output && (
            <>
              {hasFraming && (
                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                  {(["edit", "preview"] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "2px 8px", fontSize: "0.65rem", letterSpacing: "0.05em", textTransform: "uppercase", border: `1px solid ${viewMode === mode ? color : "var(--ink-600)"}`, borderRadius: 3, background: viewMode === mode ? `${color}18` : "transparent", color: viewMode === mode ? color : "var(--slate-muted)", cursor: "pointer" }}>
                      {mode === "edit" ? "Edit" : "Preview"}
                    </button>
                  ))}
                </div>
              )}
              {viewMode === "preview" && hasFraming
                ? <FramedPreview text={output} />
                : <textarea value={output} onChange={(e) => onEdit(e.target.value)} disabled={isStreaming} rows={rows} className={isStreaming ? "streaming-cursor" : ""} style={{ ...textareaBase, fontFamily: step === "cartographer" || step === "analyst" || step === "checker" ? "'JetBrains Mono', monospace" : "'Source Serif 4', serif", fontSize: step === "cartographer" || step === "analyst" || step === "checker" ? "0.76rem" : "0.9rem", opacity: isStreaming ? 0.65 : 1 }} />
              }
              {error && <div style={{ marginTop: 8, padding: "7px 10px", background: "rgba(180,50,50,0.12)", border: "1px solid rgba(180,50,50,0.3)", borderRadius: 4, color: "#e88", fontSize: "0.76rem" }}>{error}</div>}
              {!isStreaming && (
                <div style={{ display: "flex", gap: 6, marginTop: 9, justifyContent: "flex-end" }}>
                  <button onClick={onRun} style={ghostBtn}>↻ Redo</button>
                  {!isDone && <button onClick={onApprove} style={{ ...primaryBtn, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>Approve →</button>}
                  {isDone && <span style={{ fontSize: "0.68rem", color, alignSelf: "center" }}>✓ Approved</span>}
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
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer", userSelect: "none", background: `${color}0d` }}>
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
          <button onClick={generate} disabled={loading || !cleanText.trim()} style={{ width: "100%", padding: "10px 24px", background: loading || !cleanText.trim() ? "var(--ink-700)" : `linear-gradient(135deg, ${color}, ${color}bb)`, border: "none", borderRadius: 5, color: loading || !cleanText.trim() ? "var(--slate-muted)" : "var(--ink-950)", fontFamily: "'Playfair Display', serif", fontSize: "0.88rem", fontWeight: 600, cursor: loading || !cleanText.trim() ? "not-allowed" : "pointer", marginBottom: 10, transition: "all 0.2s ease" }}>
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
  statuses: Record<AgentStep, StepStatus>;
  streaming: AgentStep | null;
  tracks: { faithful: boolean; commented: boolean };
}) {
  const sharedSteps = [
    { id: "cartographer" as AgentStep, label: "Semantic Cartographer", color: SHARED_COLOR },
    { id: "analyst" as AgentStep, label: "Oral Pattern Analyst", color: SHARED_COLOR },
  ];
  const faithfulSteps = [
    { id: "faithful_reconstructor" as AgentStep, label: "Faithful Reconstructor", color: FAITHFUL_COLOR },
    { id: "faithful_framer" as AgentStep, label: "Faithful Framer", color: FAITHFUL_COLOR },
    { id: "checker" as AgentStep, label: "Fidelity Checker", color: FAITHFUL_COLOR },
  ];
  const commentedSteps = [
    { id: "commented_reconstructor" as AgentStep, label: "Commented Reconstructor", color: COMMENTED_COLOR },
    { id: "commented_framer" as AgentStep, label: "Commented Framer", color: COMMENTED_COLOR },
  ];

  const Dot = ({ id, label, color }: { id: AgentStep; label: string; color: string }) => {
    const s = statuses[id];
    const isDone = s === "done";
    const isActive = s === "active" || s === "running";
    const isRunning = streaming === id;
    const c = isDone ? color : isActive ? color : "var(--ink-600)";
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 64 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${c}`, background: isDone ? `${c}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: c, fontSize: "0.65rem", animation: isRunning ? "pulse-ring 1.2s ease-in-out infinite" : "none", transition: "all 0.3s ease" }}>
          {isDone ? "✓" : ""}
        </div>
        <span style={{ fontSize: "0.54rem", letterSpacing: "0.04em", textTransform: "uppercase", color: isDone || isActive ? c : "var(--ink-600)", textAlign: "center", lineHeight: 1.3, maxWidth: 60 }}>{label}</span>
      </div>
    );
  };

  const Line = ({ color, done }: { color: string; done: boolean }) => (
    <div style={{ height: 1, flex: 1, background: done ? color : "var(--ink-600)", transition: "background 0.4s ease", marginBottom: 18, minWidth: 12 }} />
  );

  return (
    <div style={{ padding: "14px 24px 8px", borderBottom: "1px solid var(--ink-700)", background: "rgba(13,15,20,0.8)", overflowX: "auto" }}>
      <style>{`@keyframes pulse-ring{0%,100%{box-shadow:0 0 0 0 rgba(201,146,42,0.5)}50%{box-shadow:0 0 0 4px rgba(201,146,42,0)}}`}</style>

      {/* Shared steps */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: SHARED_COLOR, marginRight: 10, marginTop: 4, whiteSpace: "nowrap" }}>shared</div>
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          {sharedSteps.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < sharedSteps.length - 1 ? 1 : 0 }}>
              <Dot {...s} />
              {i < sharedSteps.length - 1 && <Line color={s.color} done={statuses[s.id] === "done"} />}
            </div>
          ))}
        </div>
      </div>

      {/* Track steps */}
      <div style={{ display: "grid", gridTemplateColumns: tracks.faithful && tracks.commented ? "1fr 1fr" : "1fr", gap: 8, paddingLeft: 42 }}>
        {tracks.faithful && (
          <div>
            <div style={{ fontSize: "0.52rem", letterSpacing: "0.1em", textTransform: "uppercase", color: FAITHFUL_COLOR, marginBottom: 4 }}>oral scripture</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {faithfulSteps.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < faithfulSteps.length - 1 ? 1 : 0 }}>
                  <Dot {...s} />
                  {i < faithfulSteps.length - 1 && <Line color={s.color} done={statuses[s.id] === "done"} />}
                </div>
              ))}
            </div>
          </div>
        )}
        {tracks.commented && (
          <div>
            <div style={{ fontSize: "0.52rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COMMENTED_COLOR, marginBottom: 4 }}>commented scripture</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {commentedSteps.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < commentedSteps.length - 1 ? 1 : 0 }}>
                  <Dot {...s} />
                  {i < commentedSteps.length - 1 && <Line color={s.color} done={statuses[s.id] === "done"} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload Panel ──────────────────────────────────────────────

function UploadPanel({ onStart }: {
  onStart: (mapContent: string, language: string, communityContext: string, passage: string, tracks: { faithful: boolean; commented: boolean }) => void;
}) {
  const [mapText, setMapText] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [communityContext, setCommunityContext] = useState("");
  const [passage, setPassage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tracks, setTracks] = useState({ faithful: true, commented: true });
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
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "44px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.9rem, 4vw, 2.6rem)", fontWeight: 700, color: "var(--amber-pale)", lineHeight: 1.15, marginBottom: 12 }}>
          From meaning to voice
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.75, maxWidth: 460, margin: "0 auto 10px" }}>
          Upload a validated Prose Meaning Map and select which outputs to generate.
        </p>
        <div style={{ display: "inline-flex", gap: 10, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>
          <span>OBT Lab</span><span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Shema Bible Translation</span><span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Tripod Method</span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{ border: `1.5px dashed ${dragOver ? "var(--amber-gold)" : mapOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)"}`, borderRadius: 8, padding: "20px", textAlign: "center", cursor: "pointer", marginBottom: 14, background: dragOver ? "rgba(201,146,42,0.06)" : "rgba(27,31,46,0.35)", transition: "all 0.2s ease" }}
      >
        <div style={{ fontSize: "1.2rem", color: mapOk ? "var(--amber-gold)" : "var(--slate-muted)", marginBottom: 4 }}>{mapOk ? "✓" : "↑"}</div>
        <div style={{ fontSize: "0.84rem", color: "var(--slate-light)", marginBottom: 2 }}>
          {mapOk ? `${wordCount.toLocaleString()} words loaded — click to replace` : "Drop your Prose Meaning Map here, or click to browse"}
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--slate-muted)" }}>.txt · .md · .json</div>
        <input ref={fileRef} type="file" accept=".txt,.md,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Or paste the map</label>
        <textarea value={mapText} onChange={(e) => setMapText(e.target.value)} rows={4} placeholder="Paste your validated Prose Meaning Map here…" style={{ ...textareaBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.76rem", borderColor: mapOk ? "rgba(201,146,42,0.4)" : "var(--ink-600)" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
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
          style={{ ...textareaBase, fontSize: "0.875rem", borderColor: contextOk ? "rgba(201,146,42,0.4)" : "var(--ink-600)" }}
        />
      </div>

      {/* Track selection */}
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Outputs to generate</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { key: "faithful" as const, label: "Oral Scripture", sub: "Faithful · consultant-approvable", color: FAITHFUL_COLOR },
            { key: "commented" as const, label: "Commented Scripture", sub: "Rich · contextual · explanatory", color: COMMENTED_COLOR },
          ].map(t => (
            <div key={t.key} onClick={() => setTracks(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
              style={{ padding: "12px 14px", border: `1.5px solid ${tracks[t.key] ? t.color : "var(--ink-600)"}`, borderRadius: 7, cursor: "pointer", background: tracks[t.key] ? `${t.color}10` : "rgba(19,22,32,0.4)", transition: "all 0.2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${tracks[t.key] ? t.color : "var(--ink-600)"}`, background: tracks[t.key] ? t.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.55rem", color: "var(--ink-950)", transition: "all 0.2s ease" }}>
                  {tracks[t.key] ? "✓" : ""}
                </div>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: tracks[t.key] ? "var(--text-primary)" : "var(--slate-muted)" }}>{t.label}</span>
              </div>
              <div style={{ fontSize: "0.68rem", color: tracks[t.key] ? t.color : "var(--ink-600)", paddingLeft: 22 }}>{t.sub}</div>
            </div>
          ))}
        </div>
        {!tracksOk && <p style={{ fontSize: "0.72rem", color: "#e88", marginTop: 6 }}>Select at least one output.</p>}
      </div>

      <button disabled={!canStart} onClick={() => onStart(mapText, language, communityContext, passage, tracks)}
        style={{ width: "100%", padding: "13px 24px", background: canStart ? "linear-gradient(135deg, var(--amber-gold), #a97420)" : "var(--ink-700)", border: "none", borderRadius: 6, color: canStart ? "var(--ink-950)" : "var(--slate-muted)", fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", fontWeight: 600, cursor: canStart ? "pointer" : "not-allowed", transition: "all 0.2s ease" }}>
        {canStart ? "Begin Pipeline →" : "Complete required fields to continue"}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function OralBridgePage() {
  const [phase, setPhase] = useState<"upload" | "pipeline">("upload");
  const [audioOpen, setAudioOpen] = useState(false);
  const [activeTracks, setActiveTracks] = useState({ faithful: true, commented: true });

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

  const handleStart = (mapContent: string, language: string, communityContext: string, passage: string, tracks: { faithful: boolean; commented: boolean }) => {
    const fresh: PipelineState = {
      mapContent, targetLanguage: language, communityContext, passageReference: passage,
      semanticInventory: "", oralBlueprint: "",
      faithfulReconstruction: "", faithfulFramed: "", fidelityReport: "", faithfulFinalText: "",
      commentedReconstruction: "", commentedFramed: "", commentedFinalText: "",
    };
    setPipelineState(fresh);
    stateRef.current = fresh;
    setActiveTracks(tracks);
    setStepStatuses({
      cartographer: "active", analyst: "pending",
      faithful_reconstructor: "pending", commented_reconstructor: "pending",
      faithful_framer: "pending", commented_framer: "pending", checker: "pending",
    });
    setStepErrors({ cartographer: "", analyst: "", faithful_reconstructor: "", commented_reconstructor: "", faithful_framer: "", commented_framer: "", checker: "" });
    setAudioOpen(false);
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
        const snap = accumulated;
        setPipelineState(prev => ({ ...prev, [outputKey]: snap }));
      }
      setStepStatuses(prev => ({ ...prev, [step]: "active" }));
    } catch (err) {
      setStepErrors(prev => ({ ...prev, [step]: err instanceof Error ? err.message : "Unknown error" }));
      setStepStatuses(prev => ({ ...prev, [step]: "active" }));
    } finally { setStreamingStep(null); }
  }, []);

  const approveStep = useCallback((step: AgentStep, tracks: { faithful: boolean; commented: boolean }) => {
    setStepStatuses(prev => ({ ...prev, [step]: "done" }));

    if (step === "cartographer") {
      setStepStatuses(prev => ({ ...prev, analyst: "active" }));
      return;
    }

    if (step === "analyst") {
      const next: Partial<Record<AgentStep, StepStatus>> = {};
      if (tracks.faithful) next.faithful_reconstructor = "active";
      if (tracks.commented) next.commented_reconstructor = "active";
      setStepStatuses(prev => ({ ...prev, ...next }));
      return;
    }

    const activateFramers = (prev: Record<AgentStep, StepStatus>, updatedStep: AgentStep) => {
      const updated = { ...prev, [updatedStep]: "done" as StepStatus };
      const faithfulDone = !tracks.faithful || updated.faithful_reconstructor === "done";
      const commentedDone = !tracks.commented || updated.commented_reconstructor === "done";
      if (faithfulDone && commentedDone) {
        if (tracks.faithful) updated.faithful_framer = "active";
        if (tracks.commented) updated.commented_framer = "active";
      }
      return updated;
    };

    if (step === "faithful_reconstructor" || step === "commented_reconstructor") {
      setStepStatuses(prev => activateFramers(prev, step));
      return;
    }

    const activateChecker = (prev: Record<AgentStep, StepStatus>, updatedStep: AgentStep) => {
      const updated = { ...prev, [updatedStep]: "done" as StepStatus };
      const faithfulDone = !tracks.faithful || updated.faithful_framer === "done";
      const commentedDone = !tracks.commented || updated.commented_framer === "done";
      if (faithfulDone && commentedDone) {
        if (tracks.faithful) updated.checker = "active";
        else {
          // No faithful track — pipeline complete
          const st = stateRef.current;
          setPipelineState(p => ({ ...p, commentedFinalText: stripFramingTags(st.commentedFramed || st.commentedReconstruction) }));
          setAudioOpen(true);
          setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
        }
      }
      return updated;
    };

    if (step === "faithful_framer" || step === "commented_framer") {
      setStepStatuses(prev => activateChecker(prev, step));
      return;
    }

    if (step === "checker") {
      const st = stateRef.current;
      setPipelineState(p => ({
        ...p,
        faithfulFinalText: stripFramingTags(st.faithfulFramed || st.faithfulReconstruction),
        commentedFinalText: stripFramingTags(st.commentedFramed || st.commentedReconstruction),
      }));
      setAudioOpen(true);
      setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
    }
  }, []);

  const editOutput = useCallback((step: AgentStep, value: string) => {
    setPipelineState(prev => ({ ...prev, [outputKeyForStep(step)]: value }));
  }, []);

  // Descriptions
  const descriptions: Record<AgentStep, string> = {
    cartographer: "Reads the map and produces Section A (Level 3 propositions — renderable content) and Section B (Levels 1–2 — performance world). This separation enforces faithfulness.",
    analyst: "Identifies authentic oral narrative conventions of the target community — discourse connectors, participant tracking, speech framing, climax marking.",
    faithful_reconstructor: "Tells the passage using ONLY Section A content. The subtraction test applies to every sentence. This is the translation.",
    commented_reconstructor: "Tells and illuminates the passage as an elder would — weaving text and world together, drawing freely from both sections.",
    faithful_framer: "Adds oral metadiscourse (attentional, structural, turn-taking markers) governed by the subtraction rule. No content added.",
    commented_framer: "Adds oral metadiscourse to help listeners follow the richer, contextual telling.",
    checker: "Checks the faithful reconstruction for completeness (all Level 3 elements present) and faithfulness (nothing beyond Level 3 added).",
  };

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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pipelineState.passageReference && <span style={{ fontFamily: "'Playfair Display', serif", color: "var(--amber-pale)", fontSize: "0.85rem" }}>{pipelineState.passageReference}</span>}
            <span style={{ color: "var(--slate-muted)", fontSize: "0.75rem" }}>·</span>
            <span style={{ color: "var(--amber-warm)", fontSize: "0.8rem" }}>{getLangLabel(pipelineState.targetLanguage)}</span>
            <button onClick={() => { setPhase("upload"); setAudioOpen(false); }} style={{ ...ghostBtn, marginLeft: 8, fontSize: "0.72rem", padding: "4px 10px" }}>← New map</button>
          </div>
        )}
      </header>

      {phase === "upload" && <UploadPanel onStart={handleStart} />}

      {phase === "pipeline" && (
        <>
          <ProgressStrip statuses={stepStatuses} streaming={streamingStep} tracks={activeTracks} />

          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 80px" }}>

            {/* Shared steps — full width */}
            <Section title="Shared Analysis" color={SHARED_COLOR} icon="◈" status={stepStatuses.analyst === "done" ? "complete" : stepStatuses.cartographer === "running" || stepStatuses.analyst === "running" ? "running…" : "in progress"} defaultOpen={stepStatuses.analyst !== "done"}>
              <AgentStep step="cartographer" label="Semantic Cartographer" description={descriptions.cartographer}
                status={stepStatuses.cartographer} output={pipelineState.semanticInventory} isStreaming={streamingStep === "cartographer"}
                error={stepErrors.cartographer} color={SHARED_COLOR}
                onRun={() => runStep("cartographer")} onEdit={(v) => editOutput("cartographer", v)} onApprove={() => approveStep("cartographer", activeTracks)} />
              <AgentStep step="analyst" label="Oral Pattern Analyst" description={descriptions.analyst}
                status={stepStatuses.analyst} output={pipelineState.oralBlueprint} isStreaming={streamingStep === "analyst"}
                error={stepErrors.analyst} color={SHARED_COLOR}
                onRun={() => runStep("analyst")} onEdit={(v) => editOutput("analyst", v)} onApprove={() => approveStep("analyst", activeTracks)} />
            </Section>

            {/* Two-column track section */}
            {(activeTracks.faithful || activeTracks.commented) && (
              <div style={{ display: "grid", gridTemplateColumns: activeTracks.faithful && activeTracks.commented ? "1fr 1fr" : "1fr", gap: 14, marginTop: 4 }}>

                {/* Faithful track */}
                {activeTracks.faithful && (
                  <div>
                    <Section title="Oral Scripture" color={FAITHFUL_COLOR} icon="◎"
                      status={stepStatuses.checker === "done" ? "complete" : stepStatuses.faithful_reconstructor === "pending" ? "waiting for analysis" : "in progress"}
                      defaultOpen={true}>
                      <AgentStep step="faithful_reconstructor" label="Faithful Reconstructor" description={descriptions.faithful_reconstructor}
                        status={stepStatuses.faithful_reconstructor} output={pipelineState.faithfulReconstruction} isStreaming={streamingStep === "faithful_reconstructor"}
                        error={stepErrors.faithful_reconstructor} color={FAITHFUL_COLOR}
                        onRun={() => runStep("faithful_reconstructor")} onEdit={(v) => editOutput("faithful_reconstructor", v)} onApprove={() => approveStep("faithful_reconstructor", activeTracks)} />
                      <AgentStep step="faithful_framer" label="Faithful Framer" description={descriptions.faithful_framer}
                        status={stepStatuses.faithful_framer} output={pipelineState.faithfulFramed} isStreaming={streamingStep === "faithful_framer"}
                        error={stepErrors.faithful_framer} color={FAITHFUL_COLOR}
                        onRun={() => runStep("faithful_framer")} onEdit={(v) => editOutput("faithful_framer", v)} onApprove={() => approveStep("faithful_framer", activeTracks)} />
                      <AgentStep step="checker" label="Fidelity Checker" description={descriptions.checker}
                        status={stepStatuses.checker} output={pipelineState.fidelityReport} isStreaming={streamingStep === "checker"}
                        error={stepErrors.checker} color={FAITHFUL_COLOR}
                        onRun={() => runStep("checker")} onEdit={(v) => editOutput("checker", v)} onApprove={() => approveStep("checker", activeTracks)} />
                    </Section>
                  </div>
                )}

                {/* Commented track */}
                {activeTracks.commented && (
                  <div>
                    <Section title="Commented Scripture" color={COMMENTED_COLOR} icon="◍"
                      status={stepStatuses.commented_framer === "done" ? "complete" : stepStatuses.commented_reconstructor === "pending" ? "waiting for analysis" : "in progress"}
                      defaultOpen={true}>
                      <AgentStep step="commented_reconstructor" label="Commented Reconstructor" description={descriptions.commented_reconstructor}
                        status={stepStatuses.commented_reconstructor} output={pipelineState.commentedReconstruction} isStreaming={streamingStep === "commented_reconstructor"}
                        error={stepErrors.commented_reconstructor} color={COMMENTED_COLOR}
                        onRun={() => runStep("commented_reconstructor")} onEdit={(v) => editOutput("commented_reconstructor", v)} onApprove={() => approveStep("commented_reconstructor", activeTracks)} />
                      <AgentStep step="commented_framer" label="Commented Framer" description={descriptions.commented_framer}
                        status={stepStatuses.commented_framer} output={pipelineState.commentedFramed} isStreaming={streamingStep === "commented_framer"}
                        error={stepErrors.commented_framer} color={COMMENTED_COLOR}
                        onRun={() => runStep("commented_framer")} onEdit={(v) => editOutput("commented_framer", v)} onApprove={() => approveStep("commented_framer", activeTracks)} />
                    </Section>
                  </div>
                )}
              </div>
            )}

            {/* Audio outputs */}
            {audioOpen && (
              <div id="audio-section">
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0 16px" }}>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to right, transparent, var(--amber-gold))" }} />
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", background: "rgba(201,146,42,0.1)", border: "1px solid var(--amber-gold)", borderRadius: 20, color: "var(--amber-warm)", fontSize: "0.74rem" }}>
                    <span>✓</span><span>Pipeline complete</span>
                  </div>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to left, transparent, var(--amber-gold))" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button onClick={() => exportJSON(pipelineState)} style={ghostBtn}>↓ Export full pipeline .json</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: activeTracks.faithful && activeTracks.commented ? "1fr 1fr" : "1fr", gap: 14 }}>
                  {activeTracks.faithful && (
                    <AudioPanel title="Oral Scripture" color={FAITHFUL_COLOR} trackId="faithful"
                      text={pipelineState.faithfulFinalText || stripFramingTags(pipelineState.faithfulFramed || pipelineState.faithfulReconstruction)}
                      passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                      onExportTXT={() => exportTXT(pipelineState, "faithful")} />
                  )}
                  {activeTracks.commented && (
                    <AudioPanel title="Commented Scripture" color={COMMENTED_COLOR} trackId="commented"
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

      <div style={{ textAlign: "center", padding: "16px 24px", borderTop: "1px solid var(--ink-700)", color: "var(--slate-muted)", fontSize: "0.62rem", letterSpacing: "0.06em" }}>
        Tripod Method · OBT Lab · Shema Bible Translation · YWAM Kansas City
      </div>
    </div>
  );
}
