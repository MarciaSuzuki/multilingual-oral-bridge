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
  return text.replace(
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
  "cartographer",
  "analyst",
  "faithful_reconstructor",
  "commented_reconstructor",
  "faithful_framer",
  "commented_framer",
  "checker",
];

// ─── Shared styles ─────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.68rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--slate-muted)",
  marginBottom: 6,
};

const textareaBase: React.CSSProperties = {
  width: "100%",
  background: "rgba(27,31,46,0.6)",
  border: "1px solid var(--ink-600)",
  borderRadius: 6,
  padding: "10px 14px",
  color: "var(--text-primary)",
  resize: "vertical",
};

const inputBase: React.CSSProperties = {
  width: "100%",
  background: "rgba(27,31,46,0.6)",
  border: "1px solid var(--ink-600)",
  borderRadius: 5,
  padding: "9px 12px",
  color: "var(--text-primary)",
  fontFamily: "'Source Serif 4', serif",
  fontSize: "0.875rem",
};

const primaryBtn: React.CSSProperties = {
  padding: "9px 18px",
  background: "linear-gradient(135deg, var(--amber-gold), #a97420)",
  border: "none",
  borderRadius: 5,
  color: "var(--ink-950)",
  fontFamily: "'Source Serif 4', serif",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "7px 13px",
  background: "transparent",
  border: "1px solid var(--ink-600)",
  borderRadius: 5,
  color: "var(--slate-light)",
  fontFamily: "'Source Serif 4', serif",
  fontSize: "0.78rem",
  cursor: "pointer",
};

// Track colors
const TRACK_COLORS = {
  shared: { border: "rgba(232,184,109,0.45)", bg: "rgba(27,31,46,0.55)", badge: "var(--amber-warm)", label: "SHARED" },
  faithful: { border: "rgba(100,160,220,0.5)", bg: "rgba(20,30,50,0.55)", badge: "#6aa0dc", label: "ORAL SCRIPTURE" },
  commented: { border: "rgba(160,120,220,0.5)", bg: "rgba(30,20,50,0.55)", badge: "#a078dc", label: "COMMENTED SCRIPTURE" },
};

// ─── Framing Marker Preview ────────────────────────────────────

function FramedPreview({ text }: { text: string }) {
  const TAG_RE = /\[(ATTENTIONAL|STRUCTURAL|TURN): "([^"]*)"\]/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const styles: Record<string, { bg: string; border: string; label: string }> = {
    ATTENTIONAL: { bg: "rgba(201,146,42,0.14)", border: "#c9922a", label: "ATT" },
    STRUCTURAL: { bg: "rgba(100,160,220,0.10)", border: "#6aa0dc", label: "STR" },
    TURN: { bg: "rgba(120,190,120,0.10)", border: "#78be78", label: "TRN" },
  };

  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    const s = styles[match[1]] || styles.ATTENTIONAL;
    parts.push(
      <span key={key++} style={{ background: s.bg, borderBottom: `1.5px solid ${s.border}`, borderRadius: 2, padding: "1px 4px" }}>
        <span style={{ fontSize: "0.58em", letterSpacing: "0.08em", background: `${s.border}33`, color: s.border, borderRadius: 2, padding: "0 3px", marginRight: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          {s.label}
        </span>
        <span style={{ color: s.border }}>{match[2]}</span>
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);

  return (
    <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: "0.925rem", lineHeight: 1.85, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "14px 16px", background: "rgba(13,15,20,0.6)", border: "1px solid var(--ink-700)", borderRadius: 5, minHeight: 100 }}>
      {parts}
    </div>
  );
}

// ─── Export ────────────────────────────────────────────────────

function exportTXT(state: PipelineState, track: "faithful" | "commented") {
  const text = track === "faithful"
    ? (state.faithfulFinalText || stripFramingTags(state.faithfulFramed || state.faithfulReconstruction))
    : (state.commentedFinalText || stripFramingTags(state.commentedFramed || state.commentedReconstruction));
  const trackLabel = track === "faithful" ? "Oral Scripture" : "Commented Scripture";
  const header = [
    `Oral Bridge — ${trackLabel}`,
    `Passage: ${state.passageReference || "(unnamed)"}`,
    `Language: ${getLangLabel(state.targetLanguage)}`,
    `Community: ${state.communityContext}`,
    `Exported: ${new Date().toLocaleString()}`,
    "─────────────────────────────────",
    "",
  ].join("\n");
  const blob = new Blob([header + text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oral-bridge-${track}-${slug(state.passageReference)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(state: PipelineState) {
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oral-bridge-pipeline-${slug(state.passageReference)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Header ────────────────────────────────────────────────────

function Header({ showBack, onBack }: { showBack?: boolean; onBack?: () => void }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(13,15,20,0.93)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--ink-700)", padding: "11px 24px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <div style={{ width: 30, height: 30, border: "1.5px solid var(--amber-gold)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--amber-gold)" }}>◎</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "var(--amber-pale)", lineHeight: 1.1 }}>Oral Bridge</div>
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>Generating Oral Scriptures for Bridge Languages</div>
        </div>
      </div>
      {showBack && <button onClick={onBack} style={{ ...ghostBtn, fontSize: "0.75rem", padding: "5px 12px" }}>← New map</button>}
    </header>
  );
}

// ─── Upload Panel ──────────────────────────────────────────────

function UploadPanel({ onStart }: {
  onStart: (mapContent: string, language: string, communityContext: string, passage: string) => void;
}) {
  const [mapText, setMapText] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [communityContext, setCommunityContext] = useState("");
  const [passage, setPassage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setMapText((e.target?.result as string) || "");
    reader.readAsText(file);
  };

  const mapOk = mapText.trim().length > 100;
  const contextOk = communityContext.trim().length > 5;
  const canStart = mapOk && language && contextOk;
  const wordCount = mapText.split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto", padding: "44px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.9rem, 4vw, 2.7rem)", fontWeight: 700, color: "var(--amber-pale)", lineHeight: 1.15, marginBottom: 14 }}>
          From meaning to voice
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.75, maxWidth: 500, margin: "0 auto 12px" }}>
          A seven-agent pipeline producing two outputs from one validated Prose Meaning Map:
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ padding: "6px 14px", background: "rgba(100,160,220,0.12)", border: "1px solid #6aa0dc", borderRadius: 20, fontSize: "0.75rem", color: "#6aa0dc" }}>
            ◎ Oral Scripture — faithful, consultant-approvable
          </div>
          <div style={{ padding: "6px 14px", background: "rgba(160,120,220,0.12)", border: "1px solid #a078dc", borderRadius: 20, fontSize: "0.75rem", color: "#a078dc" }}>
            ◍ Commented Scripture — rich, contextual, explanatory
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 10, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>
          <span>OBT Lab</span><span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Shema Bible Translation</span><span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Tripod Method</span>
        </div>
      </div>

      <div
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{ border: `1.5px dashed ${dragOver ? "var(--amber-gold)" : mapOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)"}`, borderRadius: 8, padding: "22px", textAlign: "center", cursor: "pointer", marginBottom: 14, background: dragOver ? "rgba(201,146,42,0.06)" : "rgba(27,31,46,0.4)", transition: "all 0.2s ease" }}
      >
        <div style={{ fontSize: "1.3rem", color: mapOk ? "var(--amber-gold)" : "var(--slate-muted)", marginBottom: 5 }}>{mapOk ? "✓" : "↑"}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--slate-light)", marginBottom: 3 }}>
          {mapOk ? `${wordCount.toLocaleString()} words loaded — click to replace` : "Drop your Prose Meaning Map here, or click to browse"}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--slate-muted)" }}>.txt · .md · .json — validated maps only</div>
        <input ref={fileRef} type="file" accept=".txt,.md,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Or paste the map directly</label>
        <textarea value={mapText} onChange={(e) => setMapText(e.target.value)} rows={5} placeholder="Paste your validated Prose Meaning Map here…" style={{ ...textareaBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", borderColor: mapOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Passage reference</label>
          <input type="text" value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="e.g. Ruth 1:1–7" style={inputBase} />
        </div>
        <div>
          <label style={labelStyle}>Target language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>
            {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Community context <span style={{ color: "var(--amber-gold)" }}>*</span></label>
        <textarea value={communityContext} onChange={(e) => setCommunityContext(e.target.value)} rows={3}
          placeholder={`e.g. Rural ${getLangLabel(language)}-speaking community in [region] — oral storytelling tradition, familiar with biblical narrative`}
          style={{ ...textareaBase, fontSize: "0.875rem", borderColor: contextOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)" }}
        />
      </div>
      <p style={{ fontSize: "0.77rem", color: "var(--slate-muted)", marginBottom: 26, lineHeight: 1.65 }}>
        * Be specific: region, dialect, oral tradition style, audience background, degree of biblical familiarity.
      </p>

      <button disabled={!canStart} onClick={() => onStart(mapText, language, communityContext, passage)}
        style={{ width: "100%", padding: "13px 24px", background: canStart ? "linear-gradient(135deg, var(--amber-gold), #a97420)" : "var(--ink-700)", border: "none", borderRadius: 6, color: canStart ? "var(--ink-950)" : "var(--slate-muted)", fontFamily: "'Playfair Display', serif", fontSize: "0.975rem", fontWeight: 600, cursor: canStart ? "pointer" : "not-allowed", transition: "all 0.2s ease" }}
      >
        {canStart ? "Begin Pipeline →" : "Complete required fields to continue"}
      </button>
    </div>
  );
}

// ─── Pipeline Progress ─────────────────────────────────────────

function PipelineProgress({ statuses, streaming }: { statuses: Record<AgentStep, StepStatus>; streaming: AgentStep | null }) {
  const steps = [
    { id: "cartographer", label: "Map", track: "shared" },
    { id: "analyst", label: "Analyse", track: "shared" },
    { id: "faithful_reconstructor", label: "Scripture", track: "faithful" },
    { id: "commented_reconstructor", label: "Commented", track: "commented" },
    { id: "faithful_framer", label: "Frame A", track: "faithful" },
    { id: "commented_framer", label: "Frame B", track: "commented" },
    { id: "checker", label: "Check", track: "faithful" },
  ] as const;

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid var(--ink-700)", background: "rgba(19,22,32,0.7)", overflowX: "auto", gap: 0 }}>
      <style>{`@keyframes pulse-ring { 0%,100%{box-shadow:0 0 0 0 rgba(201,146,42,0.5)}50%{box-shadow:0 0 0 5px rgba(201,146,42,0)} }`}</style>
      {steps.map((s, i) => {
        const status = statuses[s.id as AgentStep];
        const isDone = status === "done";
        const isActive = status === "active" || status === "running";
        const isRunning = streaming === s.id;
        const tc = TRACK_COLORS[s.track];
        const dotColor = isDone ? tc.badge : isActive ? tc.badge : "var(--ink-600)";
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 60 }}>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${dotColor}`, background: isDone ? `${dotColor}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: dotColor, fontSize: "0.68rem", margin: "0 auto 4px", animation: isRunning ? "pulse-ring 1.2s ease-in-out infinite" : "none", transition: "all 0.3s ease" }}>
                {isDone ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: "0.58rem", letterSpacing: "0.04em", color: isActive || isDone ? tc.badge : "var(--ink-600)", whiteSpace: "nowrap", textTransform: "uppercase" }}>{s.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ height: 1, flex: 1, background: isDone ? tc.badge : "var(--ink-600)", transition: "background 0.5s ease", margin: "0 3px", marginBottom: 16 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Agent Step Panel ──────────────────────────────────────────

function AgentStepPanel({ config, stepIndex, isActive, isComplete, isPending, output, isStreaming, error, onRun, onEdit, onApprove }: {
  config: (typeof AGENT_CONFIGS)[0];
  stepIndex: number;
  isActive: boolean;
  isComplete: boolean;
  isPending: boolean;
  output: string;
  isStreaming: boolean;
  error: string;
  onRun: () => void;
  onEdit: (val: string) => void;
  onApprove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  useEffect(() => { if (isComplete && !isActive) setCollapsed(true); }, [isComplete, isActive]);

  const tc = TRACK_COLORS[config.track];
  const hasFraming = (config.id === "faithful_framer" || config.id === "commented_framer") && output.length > 0 && /\[(ATTENTIONAL|STRUCTURAL|TURN):/.test(output);
  const borderColor = isComplete ? tc.badge : isActive ? tc.border : "var(--ink-700)";
  const rows = Math.min(Math.max(output.split("\n").length + 2, 8), 36);
  const canInteract = isComplete || output.length > 0;
  const isOral = config.id === "faithful_reconstructor" || config.id === "commented_reconstructor" || config.id === "faithful_framer" || config.id === "commented_framer";

  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", opacity: isPending ? 0.3 : 1, transition: "all 0.3s ease", background: isComplete ? `${tc.badge}08` : isActive ? tc.bg : "rgba(19,22,32,0.35)" }}>
      <div onClick={() => canInteract && setCollapsed(c => !c)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: canInteract ? "pointer" : "default", borderBottom: !collapsed && (isActive || isComplete || output) ? "1px solid rgba(255,255,255,0.06)" : "none", userSelect: "none" }}>
        {/* Track badge */}
        <div style={{ fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: tc.badge, background: `${tc.badge}18`, border: `1px solid ${tc.badge}44`, borderRadius: 3, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>
          {tc.label}
        </div>
        <div style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${borderColor}`, display: "flex", alignItems: "center", justifyContent: "center", color: borderColor, fontSize: "0.78rem", flexShrink: 0 }}>
          {isComplete ? "✓" : isStreaming ? "◌" : config.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>{stepIndex + 1}</span>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", fontWeight: 600, color: isActive || isComplete ? "var(--amber-pale)" : "var(--slate-muted)" }}>{config.title}</span>
            <span style={{ fontSize: "0.72rem", color: "var(--slate-muted)", fontStyle: "italic" }}>— {config.subtitle}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: isComplete ? tc.badge : isStreaming ? "var(--amber-warm)" : isActive ? "var(--slate-light)" : "var(--ink-600)" }}>
            {isComplete ? "approved" : isStreaming ? "generating…" : isActive ? "ready" : "pending"}
          </span>
          {canInteract && <span style={{ color: "var(--slate-muted)", fontSize: "0.65rem" }}>{collapsed ? "▸" : "▾"}</span>}
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: "14px 16px" }}>
          {isActive && !output && !isStreaming && (
            <>
              <p style={{ fontSize: "0.845rem", color: "var(--slate-light)", lineHeight: 1.7, marginBottom: 14 }}>{config.description}</p>
              <button onClick={onRun} style={primaryBtn}>Run {config.title} →</button>
            </>
          )}
          {isStreaming && !output && (
            <div className="streaming-cursor" style={{ fontSize: "0.84rem", color: "var(--slate-muted)", fontStyle: "italic", padding: "6px 0" }}>Thinking</div>
          )}
          {output && (
            <>
              {hasFraming && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--slate-muted)" }}>View:</span>
                  {(["edit", "preview"] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "3px 9px", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase", border: `1px solid ${viewMode === mode ? tc.badge : "var(--ink-600)"}`, borderRadius: 3, background: viewMode === mode ? `${tc.badge}18` : "transparent", color: viewMode === mode ? tc.badge : "var(--slate-muted)", cursor: "pointer" }}>
                      {mode === "edit" ? "Raw / Edit" : "Visual Preview"}
                    </button>
                  ))}
                </div>
              )}
              {viewMode === "preview" && hasFraming
                ? <FramedPreview text={output} />
                : <textarea value={output} onChange={(e) => onEdit(e.target.value)} disabled={isStreaming} rows={rows} className={isStreaming ? "streaming-cursor" : ""} style={{ ...textareaBase, fontFamily: isOral ? "'Source Serif 4', serif" : "'JetBrains Mono', monospace", fontSize: isOral ? "0.925rem" : "0.78rem", background: "rgba(13,15,20,0.6)", border: "1px solid var(--ink-700)", borderRadius: 5, padding: "13px 15px", lineHeight: 1.78, opacity: isStreaming ? 0.65 : 1 }} />
              }
              {error && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(180,50,50,0.12)", border: "1px solid rgba(180,50,50,0.3)", borderRadius: 4, color: "#e88", fontSize: "0.78rem" }}>{error}</div>}
              {!isStreaming && (
                <div style={{ display: "flex", gap: 8, marginTop: 11, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button onClick={onRun} style={ghostBtn}>↻ Regenerate</button>
                  {!isComplete && <button onClick={onApprove} style={primaryBtn}>Approve & Continue →</button>}
                  {isComplete && <div style={{ display: "flex", alignItems: "center", gap: 6, color: tc.badge, fontSize: "0.73rem" }}><span>✓</span><span>Approved</span></div>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Audio Panel ────────────────────────────────────────────────

function AudioPanel({ title, trackColor, text, passageRef, langCode, trackId, onExportTXT }: {
  title: string;
  trackColor: string;
  text: string;
  passageRef: string;
  langCode: string;
  trackId: "faithful" | "commented";
  onExportTXT: () => void;
}) {
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
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally { setLoading(false); }
  };

  const fname = `oral-bridge-${trackId}-${slug(passageRef)}`;

  return (
    <div style={{ border: `1px solid ${trackColor}`, borderRadius: 8, overflow: "hidden", marginBottom: 20, background: `${trackColor}08` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: `1px solid ${trackColor}33` }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${trackColor}`, display: "flex", alignItems: "center", justifyContent: "center", color: trackColor, fontSize: "0.9rem" }}>♪</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", fontWeight: 600, color: "var(--amber-pale)" }}>{title}</div>
          <div style={{ fontSize: "0.68rem", color: "var(--slate-muted)", fontStyle: "italic" }}>ElevenLabs · eleven_multilingual_v2</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onExportTXT} style={ghostBtn}>↓ .txt</button>
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <textarea value={cleanText} onChange={(e) => setCleanText(e.target.value)} rows={10} style={{ ...textareaBase, fontFamily: "'Source Serif 4', serif", fontSize: "0.93rem", background: "rgba(13,15,20,0.7)", border: "1px solid var(--ink-700)", borderRadius: 5, padding: "13px 15px", lineHeight: 1.82, marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Voice preset</label>
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>
              {ELEVENLABS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Custom voice ID</label>
            <input type="text" value={customVoice} onChange={(e) => setCustomVoice(e.target.value)} placeholder="Paste ElevenLabs voice ID…" style={{ ...inputBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }} />
          </div>
        </div>
        <button onClick={generate} disabled={loading || !cleanText.trim()} style={{ width: "100%", padding: "11px 24px", background: loading || !cleanText.trim() ? "var(--ink-700)" : `linear-gradient(135deg, ${trackColor}, ${trackColor}99)`, border: "none", borderRadius: 6, color: loading || !cleanText.trim() ? "var(--slate-muted)" : "var(--ink-950)", fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", fontWeight: 600, cursor: loading || !cleanText.trim() ? "not-allowed" : "pointer", marginBottom: 12, transition: "all 0.2s ease" }}>
          {loading ? "Generating audio…" : "Generate Audio ♪"}
        </button>
        {error && <div style={{ padding: "9px 12px", background: "rgba(180,50,50,0.12)", border: "1px solid rgba(180,50,50,0.3)", borderRadius: 4, color: "#e88", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}
        {audioUrl && (
          <div className="fade-in" style={{ padding: "14px 15px", background: "rgba(13,15,20,0.6)", borderRadius: 6, border: `1px solid ${trackColor}44` }}>
            <div style={{ fontSize: "0.73rem", color: trackColor, marginBottom: 10 }}>✓ Audio ready — {passageRef} · {getLangLabel(langCode)}</div>
            <audio controls src={audioUrl} style={{ width: "100%", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <a href={audioUrl} download={`${fname}.mp3`} style={{ display: "inline-block", padding: "7px 13px", background: `${trackColor}22`, border: `1px solid ${trackColor}`, borderRadius: 4, color: trackColor, fontSize: "0.76rem", textDecoration: "none" }}>↓ Download .mp3</a>
              <button onClick={() => { setAudioUrl(null); generate(); }} style={ghostBtn}>↻ Re-generate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function OralBridgePage() {
  const [phase, setPhase] = useState<"upload" | "pipeline">("upload");
  const [audioOpen, setAudioOpen] = useState(false);

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

  const handleStart = (mapContent: string, language: string, communityContext: string, passage: string) => {
    const fresh: PipelineState = {
      mapContent, targetLanguage: language, communityContext, passageReference: passage,
      semanticInventory: "", oralBlueprint: "",
      faithfulReconstruction: "", faithfulFramed: "", fidelityReport: "", faithfulFinalText: "",
      commentedReconstruction: "", commentedFramed: "", commentedFinalText: "",
    };
    setPipelineState(fresh);
    stateRef.current = fresh;
    setStepStatuses({ cartographer: "active", analyst: "pending", faithful_reconstructor: "pending", commented_reconstructor: "pending", faithful_framer: "pending", commented_framer: "pending", checker: "pending" });
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
      if (!response.ok) { const t = await response.text(); throw new Error(`API error ${response.status}: ${t}`); }
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

  const approveStep = useCallback((step: AgentStep) => {
    setStepStatuses(prev => ({ ...prev, [step]: "done" }));
    const idx = STEP_ORDER.indexOf(step);

    // After analyst — activate BOTH reconstructors
    if (step === "analyst") {
      setStepStatuses(prev => ({ ...prev, faithful_reconstructor: "active", commented_reconstructor: "active" }));
      return;
    }

    // After both reconstructors — activate both framers
    // Check if the other reconstructor is also done
    if (step === "faithful_reconstructor") {
      const s = { ...stepStatuses, faithful_reconstructor: "done" as StepStatus };
      if (s.commented_reconstructor === "done") {
        setStepStatuses(prev => ({ ...prev, faithful_framer: "active", commented_framer: "active" }));
      }
      return;
    }
    if (step === "commented_reconstructor") {
      const s = { ...stepStatuses, commented_reconstructor: "done" as StepStatus };
      if (s.faithful_reconstructor === "done") {
        setStepStatuses(prev => ({ ...prev, faithful_framer: "active", commented_framer: "active" }));
      }
      return;
    }

    // After both framers — activate checker
    if (step === "faithful_framer") {
      const s = { ...stepStatuses, faithful_framer: "done" as StepStatus };
      if (s.commented_framer === "done") {
        setStepStatuses(prev => ({ ...prev, checker: "active" }));
      }
      return;
    }
    if (step === "commented_framer") {
      const s = { ...stepStatuses, commented_framer: "done" as StepStatus };
      if (s.faithful_framer === "done") {
        setStepStatuses(prev => ({ ...prev, checker: "active" }));
      }
      return;
    }

    // After checker — open audio
    if (step === "checker") {
      const st = stateRef.current;
      setPipelineState(prev => ({
        ...prev,
        faithfulFinalText: stripFramingTags(st.faithfulFramed || st.faithfulReconstruction),
        commentedFinalText: stripFramingTags(st.commentedFramed || st.commentedReconstruction),
      }));
      setAudioOpen(true);
      setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
      return;
    }

    // Default: activate next step
    if (idx < STEP_ORDER.length - 1) {
      setStepStatuses(prev => ({ ...prev, [STEP_ORDER[idx + 1]]: "active" }));
    }
  }, [stepStatuses]);

  const editOutput = useCallback((step: AgentStep, value: string) => {
    setPipelineState(prev => ({ ...prev, [outputKeyForStep(step)]: value }));
  }, []);

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <Header showBack={phase === "pipeline"} onBack={() => { setPhase("upload"); setAudioOpen(false); }} />

      {phase === "upload" && <UploadPanel onStart={handleStart} />}

      {phase === "pipeline" && (
        <>
          {/* Passage bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 24px", background: "rgba(19,22,32,0.8)", borderBottom: "1px solid var(--ink-700)", flexWrap: "wrap", fontSize: "0.82rem" }}>
            {pipelineState.passageReference && <span style={{ fontFamily: "'Playfair Display', serif", color: "var(--amber-pale)", fontWeight: 600 }}>{pipelineState.passageReference}</span>}
            <span style={{ color: "var(--slate-muted)" }}>→</span>
            <span style={{ color: "var(--amber-warm)" }}>{getLangLabel(pipelineState.targetLanguage)}</span>
            <span style={{ color: "var(--slate-muted)" }}>·</span>
            <span style={{ color: "var(--slate-light)", fontStyle: "italic" }}>{pipelineState.communityContext}</span>
          </div>

          <PipelineProgress statuses={stepStatuses} streaming={streamingStep} />

          <div style={{ maxWidth: 820, margin: "0 auto", padding: "22px 24px 80px" }}>

            {/* Legend */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {Object.entries(TRACK_COLORS).map(([key, tc]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem", color: tc.badge }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: tc.badge }} />
                  {tc.label}
                </div>
              ))}
            </div>

            {AGENT_CONFIGS.map((config, idx) => {
              const step = config.id;
              const status = stepStatuses[step];
              const output = pipelineState[config.outputKey] as string;
              return (
                <AgentStepPanel
                  key={step} config={config} stepIndex={idx}
                  isActive={status === "active" || status === "running"}
                  isComplete={status === "done"} isPending={status === "pending"}
                  output={output} isStreaming={streamingStep === step}
                  error={stepErrors[step]}
                  onRun={() => runStep(step)}
                  onEdit={(val) => editOutput(step, val)}
                  onApprove={() => approveStep(step)}
                />
              );
            })}

            {/* Audio section */}
            {audioOpen && (
              <div id="audio-section">
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0 18px" }}>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to right, transparent, var(--amber-gold))" }} />
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", background: "rgba(201,146,42,0.1)", border: "1px solid var(--amber-gold)", borderRadius: 20, color: "var(--amber-warm)", fontSize: "0.76rem" }}>
                    <span>✓</span><span>Pipeline complete — two outputs ready</span>
                  </div>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to left, transparent, var(--amber-gold))" }} />
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 }}>
                  <button onClick={() => exportJSON(pipelineState)} style={ghostBtn}>↓ Export full pipeline .json</button>
                </div>

                <AudioPanel
                  title="Oral Scripture" trackColor="#6aa0dc" trackId="faithful"
                  text={pipelineState.faithfulFinalText || stripFramingTags(pipelineState.faithfulFramed || pipelineState.faithfulReconstruction)}
                  passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                  onExportTXT={() => exportTXT(pipelineState, "faithful")}
                />
                <AudioPanel
                  title="Commented Scripture" trackColor="#a078dc" trackId="commented"
                  text={pipelineState.commentedFinalText || stripFramingTags(pipelineState.commentedFramed || pipelineState.commentedReconstruction)}
                  passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                  onExportTXT={() => exportTXT(pipelineState, "commented")}
                />
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", padding: "18px 24px", borderTop: "1px solid var(--ink-700)", color: "var(--slate-muted)", fontSize: "0.65rem", letterSpacing: "0.06em" }}>
        Tripod Method · OBT Lab · Shema Bible Translation · YWAM Kansas City
      </div>
    </div>
  );
}
