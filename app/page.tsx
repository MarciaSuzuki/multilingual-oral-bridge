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
    (_match, _type, content: string) => content
  );
}

function getLangLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code;
}

function outputKeyForStep(step: AgentStep): keyof PipelineState {
  const map: Record<AgentStep, keyof PipelineState> = {
    cartographer: "semanticInventory",
    analyst: "oralBlueprint",
    reconstructor: "reconstruction",
    framer: "framedReconstruction",
    checker: "fidelityReport",
  };
  return map[step];
}

const STEP_ORDER: AgentStep[] = [
  "cartographer",
  "analyst",
  "reconstructor",
  "framer",
  "checker",
];

type StepStatus = "pending" | "active" | "running" | "done";

// ─── Shared style objects ─────────────────────────────────────

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

// ─── Framing Marker Visual Renderer ──────────────────────────

function FramedPreview({ text }: { text: string }) {
  const TAG_RE = /\[(ATTENTIONAL|STRUCTURAL|TURN): "([^"]*)"\]/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const styles: Record<string, { bg: string; border: string; badge: string; label: string }> = {
    ATTENTIONAL: { bg: "rgba(201,146,42,0.14)", border: "#c9922a", badge: "rgba(201,146,42,0.25)", label: "ATT" },
    STRUCTURAL: { bg: "rgba(100,160,220,0.10)", border: "#6aa0dc", badge: "rgba(100,160,220,0.2)", label: "STR" },
    TURN: { bg: "rgba(120,190,120,0.10)", border: "#78be78", badge: "rgba(120,190,120,0.2)", label: "TRN" },
  };

  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }
    const type = match[1];
    const content = match[2];
    const s = styles[type] || styles.ATTENTIONAL;
    parts.push(
      <span
        key={key++}
        title={`${type} marker (oral metadiscourse)`}
        style={{
          display: "inline",
          background: s.bg,
          borderBottom: `1.5px solid ${s.border}`,
          borderRadius: 2,
          padding: "1px 4px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "0.58em",
            letterSpacing: "0.08em",
            background: s.badge,
            color: s.border,
            borderRadius: 2,
            padding: "0 3px",
            marginRight: 4,
            verticalAlign: "middle",
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.6,
          }}
        >
          {s.label}
        </span>
        <span style={{ color: s.border }}>{content}</span>
      </span>
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(<span key={key++}>{text.slice(last)}</span>);
  }

  return (
    <div
      style={{
        fontFamily: "'Source Serif 4', serif",
        fontSize: "0.925rem",
        lineHeight: 1.85,
        color: "var(--text-primary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: "14px 16px",
        background: "rgba(13,15,20,0.6)",
        border: "1px solid var(--ink-700)",
        borderRadius: 5,
        minHeight: 120,
      }}
    >
      {parts}
    </div>
  );
}

// ─── Export Utilities ─────────────────────────────────────────

function exportJSON(state: PipelineState) {
  const data = {
    passage: state.passageReference,
    targetLanguage: getLangLabel(state.targetLanguage),
    communityContext: state.communityContext,
    exportedAt: new Date().toISOString(),
    pipeline: {
      semanticInventory: state.semanticInventory,
      oralBlueprint: state.oralBlueprint,
      reconstruction: state.reconstruction,
      framedReconstruction: state.framedReconstruction,
      fidelityReport: state.fidelityReport,
    },
    finalText: state.finalText,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oral-bridge-${slug(state.passageReference)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTXT(state: PipelineState) {
  const clean = state.finalText || stripFramingTags(state.framedReconstruction || state.reconstruction);
  const header = [
    "Oral Bridge — Oral Reconstruction",
    `Passage: ${state.passageReference || "(unnamed)"}`,
    `Language: ${getLangLabel(state.targetLanguage)}`,
    `Community: ${state.communityContext}`,
    `Exported: ${new Date().toLocaleString()}`,
    "─────────────────────────────────",
    "",
  ].join("\n");
  const blob = new Blob([header + clean], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oral-bridge-${slug(state.passageReference)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s: string) {
  return (s || "passage").replace(/[\s:–—]/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
}

// ─── Header ───────────────────────────────────────────────────

function Header({ showBack, onBack }: { showBack?: boolean; onBack?: () => void }) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(13,15,20,0.93)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--ink-700)",
        padding: "11px 24px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <div
          style={{
            width: 30,
            height: 30,
            border: "1.5px solid var(--amber-gold)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: "var(--amber-gold)",
            flexShrink: 0,
          }}
        >
          ◎
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "1rem",
              fontWeight: 700,
              color: "var(--amber-pale)",
              lineHeight: 1.1,
            }}
          >
            Oral Bridge
          </div>
          <div
            style={{
              fontSize: "0.58rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--slate-muted)",
            }}
          >
            Generating Oral Scriptures for Bridge Languages
          </div>
        </div>
      </div>
      {showBack && (
        <button
          onClick={onBack}
          style={{ ...ghostBtn, fontSize: "0.75rem", padding: "5px 12px" }}
        >
          ← New map
        </button>
      )}
    </header>
  );
}

// ─── Upload Panel ─────────────────────────────────────────────

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const mapOk = mapText.trim().length > 100;
  const contextOk = communityContext.trim().length > 5;
  const canStart = mapOk && language && contextOk;
  const wordCount = mapText.split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto", padding: "44px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(1.9rem, 4vw, 2.7rem)",
            fontWeight: 700,
            color: "var(--amber-pale)",
            lineHeight: 1.15,
            marginBottom: 14,
          }}
        >
          From meaning to voice
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
            lineHeight: 1.75,
            maxWidth: 480,
            margin: "0 auto 16px",
          }}
        >
          A five-agent pipeline that reconstructs a biblical passage from its validated
          Prose Meaning Map — producing oral Scripture that sounds indigenous, not translated.
        </p>
        <div
          style={{
            display: "inline-flex",
            gap: 10,
            fontSize: "0.65rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--slate-muted)",
          }}
        >
          <span>OBT Lab</span>
          <span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Shema Bible Translation</span>
          <span style={{ color: "var(--amber-gold)" }}>·</span>
          <span>Tripod Method</span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragOver ? "var(--amber-gold)" : mapOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)"}`,
          borderRadius: 8,
          padding: "22px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 14,
          background: dragOver ? "rgba(201,146,42,0.06)" : "rgba(27,31,46,0.4)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ fontSize: "1.3rem", color: mapOk ? "var(--amber-gold)" : "var(--slate-muted)", marginBottom: 5 }}>
          {mapOk ? "✓" : "↑"}
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--slate-light)", marginBottom: 3 }}>
          {mapOk ? `${wordCount.toLocaleString()} words loaded — click to replace` : "Drop your Prose Meaning Map here, or click to browse"}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--slate-muted)" }}>
          .txt · .md · .json — validated maps only
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Or paste the map directly</label>
        <textarea
          value={mapText}
          onChange={(e) => setMapText(e.target.value)}
          rows={5}
          placeholder="Paste your validated Prose Meaning Map here…"
          style={{
            ...textareaBase,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.78rem",
            borderColor: mapOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)",
          }}
        />
        {wordCount > 8000 && (
          <div style={{ marginTop: 4, fontSize: "0.72rem", color: "#e8a060" }}>
            ⚠ Very long map ({wordCount.toLocaleString()} words). Consider splitting at scene boundaries to stay within token limits.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Passage reference</label>
          <input
            type="text"
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            placeholder="e.g. Ruth 1:1–7"
            style={inputBase}
          />
        </div>
        <div>
          <label style={labelStyle}>Target language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ ...inputBase, cursor: "pointer" }}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>
          Community context{" "}
          <span style={{ color: "var(--amber-gold)" }}>*</span>
        </label>
        <textarea
          value={communityContext}
          onChange={(e) => setCommunityContext(e.target.value)}
          rows={3}
          placeholder={`e.g. Rural ${getLangLabel(language)}-speaking elders in [region] — oral storytelling tradition, familiar with biblical narrative`}
          style={{
            ...textareaBase,
            fontSize: "0.875rem",
            borderColor: contextOk ? "rgba(201,146,42,0.5)" : "var(--ink-600)",
          }}
        />
      </div>
      <p style={{ fontSize: "0.77rem", color: "var(--slate-muted)", marginBottom: 26, lineHeight: 1.65 }}>
        * The community context is the most important input. Be specific: region,
        dialect, oral tradition style, audience background, degree of biblical
        familiarity. The more precise, the more indigenous the result will sound.
      </p>

      <button
        disabled={!canStart}
        onClick={() => onStart(mapText, language, communityContext, passage)}
        style={{
          width: "100%",
          padding: "13px 24px",
          background: canStart ? "linear-gradient(135deg, var(--amber-gold), #a97420)" : "var(--ink-700)",
          border: "none",
          borderRadius: 6,
          color: canStart ? "var(--ink-950)" : "var(--slate-muted)",
          fontFamily: "'Playfair Display', serif",
          fontSize: "0.975rem",
          fontWeight: 600,
          cursor: canStart ? "pointer" : "not-allowed",
          letterSpacing: "0.02em",
          transition: "all 0.2s ease",
        }}
      >
        {canStart ? "Begin Reconstruction Pipeline →" : "Complete required fields to continue"}
      </button>
    </div>
  );
}

// ─── Pipeline Progress Bar ────────────────────────────────────

function PipelineProgress({
  statuses,
  streaming,
}: {
  statuses: Record<AgentStep, StepStatus>;
  streaming: AgentStep | null;
}) {
  const labels = ["Cartographer", "Analyst", "Reconstructor", "Framer", "Checker"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "14px 24px",
        borderBottom: "1px solid var(--ink-700)",
        background: "rgba(19,22,32,0.7)",
        overflowX: "auto",
      }}
    >
      <style>{`
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(201,146,42,0.5); }
          50% { box-shadow: 0 0 0 5px rgba(201,146,42,0); }
        }
      `}</style>
      {STEP_ORDER.map((step, i) => {
        const s = statuses[step];
        const isDone = s === "done";
        const isActive = s === "active" || s === "running";
        const isRunning = streaming === step;
        const dotColor = isDone ? "var(--amber-gold)" : isActive ? "var(--amber-warm)" : "var(--ink-600)";

        return (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 70 }}>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1.5px solid ${dotColor}`,
                  background: isDone ? "rgba(201,146,42,0.15)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: dotColor,
                  fontSize: "0.72rem",
                  margin: "0 auto 5px",
                  transition: "all 0.3s ease",
                  animation: isRunning ? "pulse-ring 1.2s ease-in-out infinite" : "none",
                }}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <div
                style={{
                  fontSize: "0.6rem",
                  letterSpacing: "0.05em",
                  color: isActive || isDone ? "var(--slate-light)" : "var(--ink-600)",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                }}
              >
                {labels[i]}
              </div>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div
                style={{
                  height: 1,
                  flex: 1,
                  background: isDone ? "var(--amber-gold)" : "var(--ink-600)",
                  transition: "background 0.5s ease",
                  margin: "0 4px",
                  marginBottom: 18,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Passage Info Bar ─────────────────────────────────────────

function PassageBar({ state }: { state: PipelineState }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 24px",
        background: "rgba(19,22,32,0.8)",
        borderBottom: "1px solid var(--ink-700)",
        flexWrap: "wrap",
        fontSize: "0.82rem",
      }}
    >
      {state.passageReference && (
        <span style={{ fontFamily: "'Playfair Display', serif", color: "var(--amber-pale)", fontWeight: 600 }}>
          {state.passageReference}
        </span>
      )}
      <span style={{ color: "var(--slate-muted)" }}>→</span>
      <span style={{ color: "var(--amber-warm)" }}>{getLangLabel(state.targetLanguage)}</span>
      <span style={{ color: "var(--slate-muted)" }}>·</span>
      <span style={{ color: "var(--slate-light)", fontStyle: "italic" }}>{state.communityContext}</span>
    </div>
  );
}

// ─── Agent Step Panel ─────────────────────────────────────────

function AgentStepPanel({
  config,
  stepIndex,
  isActive,
  isComplete,
  isPending,
  output,
  isStreaming,
  error,
  onRun,
  onEdit,
  onApprove,
}: {
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

  // Auto-collapse when a step is approved and the next step becomes active
  useEffect(() => {
    if (isComplete && !isActive) {
      setCollapsed(true);
    }
  }, [isComplete, isActive]);

  // Auto-switch framer to preview on complete
  useEffect(() => {
    if (config.id === "framer" && isComplete) {
      setViewMode("preview");
    }
  }, [config.id, isComplete]);

  const hasFramingMarkers =
    config.id === "framer" &&
    output.length > 0 &&
    /\[(ATTENTIONAL|STRUCTURAL|TURN):/.test(output);

  const borderColor = isComplete
    ? "var(--amber-gold)"
    : isActive
    ? "rgba(232,184,109,0.45)"
    : "var(--ink-700)";

  const rows = Math.min(Math.max(output.split("\n").length + 2, 8), 36);

  const canInteract = isComplete || output.length > 0;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        marginBottom: 10,
        overflow: "hidden",
        opacity: isPending ? 0.3 : 1,
        transition: "opacity 0.3s ease, border-color 0.3s ease",
        background: isComplete
          ? "rgba(201,146,42,0.04)"
          : isActive
          ? "rgba(27,31,46,0.55)"
          : "rgba(19,22,32,0.35)",
      }}
    >
      {/* Header row — always visible */}
      <div
        onClick={() => canInteract && setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          cursor: canInteract ? "pointer" : "default",
          borderBottom:
            !collapsed && (isActive || isComplete || output)
              ? "1px solid rgba(201,146,42,0.12)"
              : "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `1.5px solid ${borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: borderColor,
            fontSize: "0.8rem",
            flexShrink: 0,
            transition: "all 0.3s ease",
          }}
        >
          {isComplete ? "✓" : isStreaming ? "◌" : config.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--slate-muted)" }}>
              {stepIndex + 1}
            </span>
            <span
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "0.92rem",
                fontWeight: 600,
                color: isActive || isComplete ? "var(--amber-pale)" : "var(--slate-muted)",
              }}
            >
              {config.title}
            </span>
            <span style={{ fontSize: "0.73rem", color: "var(--slate-muted)", fontStyle: "italic" }}>
              — {config.subtitle}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: isComplete
                ? "var(--amber-gold)"
                : isStreaming
                ? "var(--amber-warm)"
                : isActive
                ? "var(--slate-light)"
                : "var(--ink-600)",
            }}
          >
            {isComplete ? "approved" : isStreaming ? "generating…" : isActive ? "ready" : "pending"}
          </span>
          {canInteract && (
            <span style={{ color: "var(--slate-muted)", fontSize: "0.65rem" }}>
              {collapsed ? "▸" : "▾"}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: "14px 16px" }}>

          {/* Description — shown when active but not yet started */}
          {isActive && !output && !isStreaming && (
            <>
              <p style={{ fontSize: "0.845rem", color: "var(--slate-light)", lineHeight: 1.7, marginBottom: 14 }}>
                {config.description}
              </p>
              <button onClick={onRun} style={primaryBtn}>
                Run {config.title} →
              </button>
            </>
          )}

          {/* Streaming placeholder */}
          {isStreaming && !output && (
            <div
              className="streaming-cursor"
              style={{ fontSize: "0.84rem", color: "var(--slate-muted)", fontStyle: "italic", padding: "6px 0" }}
            >
              Thinking
            </div>
          )}

          {/* Output */}
          {output && (
            <>
              {/* View mode toggle for framer */}
              {hasFramingMarkers && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--slate-muted)", letterSpacing: "0.06em" }}>
                    View:
                  </span>
                  {(["edit", "preview"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        padding: "3px 9px",
                        fontSize: "0.68rem",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        border: `1px solid ${viewMode === mode ? "var(--amber-gold)" : "var(--ink-600)"}`,
                        borderRadius: 3,
                        background: viewMode === mode ? "rgba(201,146,42,0.12)" : "transparent",
                        color: viewMode === mode ? "var(--amber-warm)" : "var(--slate-muted)",
                        cursor: "pointer",
                      }}
                    >
                      {mode === "edit" ? "Raw / Edit" : "Visual Preview"}
                    </button>
                  ))}
                  <span style={{ fontSize: "0.65rem", color: "var(--slate-muted)", marginLeft: 6 }}>
                    <span style={{ color: "#c9922a" }}>[ATT]</span> attention{" "}
                    <span style={{ color: "#6aa0dc" }}>[STR]</span> structure{" "}
                    <span style={{ color: "#78be78" }}>[TRN]</span> turn
                  </span>
                </div>
              )}

              {/* Rendered preview or raw textarea */}
              {viewMode === "preview" && hasFramingMarkers ? (
                <FramedPreview text={output} />
              ) : (
                <textarea
                  value={output}
                  onChange={(e) => onEdit(e.target.value)}
                  disabled={isStreaming}
                  rows={rows}
                  className={isStreaming ? "streaming-cursor" : ""}
                  style={{
                    ...textareaBase,
                    fontFamily:
                      config.id === "reconstructor" || config.id === "framer"
                        ? "'Source Serif 4', serif"
                        : "'JetBrains Mono', monospace",
                    fontSize:
                      config.id === "reconstructor" || config.id === "framer"
                        ? "0.925rem"
                        : "0.78rem",
                    background: "rgba(13,15,20,0.6)",
                    border: "1px solid var(--ink-700)",
                    borderRadius: 5,
                    padding: "13px 15px",
                    lineHeight: 1.78,
                    opacity: isStreaming ? 0.65 : 1,
                  }}
                />
              )}

              {/* Error */}
              {error && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    background: "rgba(180,50,50,0.12)",
                    border: "1px solid rgba(180,50,50,0.3)",
                    borderRadius: 4,
                    color: "#e88",
                    fontSize: "0.78rem",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Action buttons */}
              {!isStreaming && (
                <div style={{ display: "flex", gap: 8, marginTop: 11, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button onClick={onRun} style={ghostBtn}>↻ Regenerate</button>
                  {!isComplete && (
                    <button onClick={onApprove} style={primaryBtn}>Approve & Continue →</button>
                  )}
                  {isComplete && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--amber-gold)", fontSize: "0.73rem" }}>
                      <span>✓</span>
                      <span>Approved — edits saved automatically</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Audio Panel ──────────────────────────────────────────────

function AudioPanel({ pipelineState }: { pipelineState: PipelineState }) {
  const [voiceId, setVoiceId] = useState(ELEVENLABS_VOICES[0].id);
  const [customVoice, setCustomVoice] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cleanText, setCleanText] = useState(
    () => pipelineState.finalText || stripFramingTags(pipelineState.framedReconstruction || pipelineState.reconstruction)
  );

  const generate = async () => {
    setLoading(true);
    setError("");
    setAudioUrl(null);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voiceId: customVoice.trim() || voiceId,
          modelId: "eleven_multilingual_v2",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || `ElevenLabs error ${res.status}`);
      }
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fname = `oral-bridge-${slug(pipelineState.passageReference)}`;

  return (
    <div
      className="fade-in"
      style={{
        border: "1px solid var(--amber-gold)",
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 32,
        background: "rgba(201,146,42,0.04)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "13px 16px",
          borderBottom: "1px solid rgba(201,146,42,0.2)",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1.5px solid var(--amber-gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--amber-gold)",
            fontSize: "0.9rem",
          }}
        >
          ♪
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.92rem", fontWeight: 600, color: "var(--amber-pale)" }}>
            Audio Production
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--slate-muted)", fontStyle: "italic" }}>
            ElevenLabs · eleven_multilingual_v2
          </div>
        </div>
        {/* Export */}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => exportTXT(pipelineState)} style={ghostBtn} title="Download reconstruction as plain text">
            ↓ .txt
          </button>
          <button onClick={() => exportJSON(pipelineState)} style={ghostBtn} title="Download full pipeline as JSON">
            ↓ .json
          </button>
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        <p style={{ fontSize: "0.82rem", color: "var(--slate-light)", lineHeight: 1.65, marginBottom: 14 }}>
          Framing markers have been resolved to their spoken text. Review and edit before
          generating. This is the final text that will be sent to the voice model.
        </p>

        <textarea
          value={cleanText}
          onChange={(e) => setCleanText(e.target.value)}
          rows={12}
          style={{
            ...textareaBase,
            fontFamily: "'Source Serif 4', serif",
            fontSize: "0.93rem",
            background: "rgba(13,15,20,0.7)",
            border: "1px solid var(--ink-700)",
            borderRadius: 5,
            padding: "13px 15px",
            lineHeight: 1.82,
            marginBottom: 14,
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Voice preset</label>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              style={{ ...inputBase, cursor: "pointer" }}
            >
              {ELEVENLABS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Custom voice ID (overrides preset)</label>
            <input
              type="text"
              value={customVoice}
              onChange={(e) => setCustomVoice(e.target.value)}
              placeholder="Paste ElevenLabs voice ID…"
              style={{ ...inputBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }}
            />
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !cleanText.trim()}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: loading || !cleanText.trim()
              ? "var(--ink-700)"
              : "linear-gradient(135deg, var(--amber-gold), #a97420)",
            border: "none",
            borderRadius: 6,
            color: loading || !cleanText.trim() ? "var(--slate-muted)" : "var(--ink-950)",
            fontFamily: "'Playfair Display', serif",
            fontSize: "0.92rem",
            fontWeight: 600,
            cursor: loading || !cleanText.trim() ? "not-allowed" : "pointer",
            marginBottom: 12,
            transition: "all 0.2s ease",
          }}
        >
          {loading ? "Generating audio…" : "Generate Audio ♪"}
        </button>

        {error && (
          <div style={{ padding: "9px 12px", background: "rgba(180,50,50,0.12)", border: "1px solid rgba(180,50,50,0.3)", borderRadius: 4, color: "#e88", fontSize: "0.8rem", marginBottom: 10 }}>
            {error}
          </div>
        )}

        {audioUrl && (
          <div
            className="fade-in"
            style={{ padding: "14px 15px", background: "rgba(13,15,20,0.6)", borderRadius: 6, border: "1px solid rgba(201,146,42,0.3)" }}
          >
            <div style={{ fontSize: "0.73rem", color: "var(--amber-gold)", marginBottom: 10, letterSpacing: "0.04em" }}>
              ✓ Audio ready{pipelineState.passageReference ? ` — ${pipelineState.passageReference}` : ""} · {getLangLabel(pipelineState.targetLanguage)}
            </div>
            <audio controls src={audioUrl} style={{ width: "100%", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={audioUrl}
                download={`${fname}.mp3`}
                style={{ display: "inline-block", padding: "7px 13px", background: "rgba(201,146,42,0.15)", border: "1px solid var(--amber-gold)", borderRadius: 4, color: "var(--amber-warm)", fontSize: "0.76rem", textDecoration: "none" }}
              >
                ↓ Download .mp3
              </a>
              <button onClick={() => { setAudioUrl(null); generate(); }} style={ghostBtn}>
                ↻ Re-generate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function OralBridgePage() {
  const [phase, setPhase] = useState<"upload" | "pipeline">("upload");
  const [audioOpen, setAudioOpen] = useState(false);

  const [pipelineState, setPipelineState] = useState<PipelineState>({
    mapContent: "",
    targetLanguage: "",
    communityContext: "",
    passageReference: "",
    semanticInventory: "",
    oralBlueprint: "",
    reconstruction: "",
    framedReconstruction: "",
    fidelityReport: "",
    finalText: "",
  });

  // Always-fresh ref — used inside async operations to avoid stale closures
  const stateRef = useRef(pipelineState);
  useEffect(() => { stateRef.current = pipelineState; }, [pipelineState]);

  const [stepStatuses, setStepStatuses] = useState<Record<AgentStep, StepStatus>>(() => ({
    cartographer: "pending",
    analyst: "pending",
    reconstructor: "pending",
    framer: "pending",
    checker: "pending",
  }));

  const [stepErrors, setStepErrors] = useState<Record<AgentStep, string>>(() => ({
    cartographer: "", analyst: "", reconstructor: "", framer: "", checker: "",
  }));

  const [streamingStep, setStreamingStep] = useState<AgentStep | null>(null);

  // ── Start pipeline ────────────────────────────────────────
  const handleStart = (mapContent: string, language: string, communityContext: string, passage: string) => {
    const fresh: PipelineState = {
      mapContent,
      targetLanguage: language,
      communityContext,
      passageReference: passage,
      semanticInventory: "",
      oralBlueprint: "",
      reconstruction: "",
      framedReconstruction: "",
      fidelityReport: "",
      finalText: "",
    };
    setPipelineState(fresh);
    stateRef.current = fresh;
    setStepStatuses({ cartographer: "active", analyst: "pending", reconstructor: "pending", framer: "pending", checker: "pending" });
    setStepErrors({ cartographer: "", analyst: "", reconstructor: "", framer: "", checker: "" });
    setAudioOpen(false);
    setPhase("pipeline");
  };

  // ── Run an agent step ─────────────────────────────────────
  // Reads from stateRef so no stale closure issue regardless of when called
  const runStep = useCallback(async (step: AgentStep) => {
    const outputKey = outputKeyForStep(step);
    const s = stateRef.current;

    const input = {
      targetLanguage: getLangLabel(s.targetLanguage),
      communityContext: s.communityContext,
      mapContent: s.mapContent,
      semanticInventory: s.semanticInventory,
      oralBlueprint: s.oralBlueprint,
      reconstruction: s.reconstruction,
      framedReconstruction: s.framedReconstruction,
    };

    setStreamingStep(step);
    setStepStatuses((prev) => ({ ...prev, [step]: "running" }));
    setStepErrors((prev) => ({ ...prev, [step]: "" }));
    setPipelineState((prev) => ({ ...prev, [outputKey]: "" }));

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, input }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Agent API returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snap = accumulated;
        setPipelineState((prev) => ({ ...prev, [outputKey]: snap }));
      }

      setStepStatuses((prev) => ({ ...prev, [step]: "active" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStepErrors((prev) => ({ ...prev, [step]: msg }));
      setStepStatuses((prev) => ({ ...prev, [step]: "active" }));
    } finally {
      setStreamingStep(null);
    }
  }, []); // no deps — reads from ref

  // ── Approve a step ────────────────────────────────────────
  const approveStep = useCallback((step: AgentStep) => {
    setStepStatuses((prev) => ({ ...prev, [step]: "done" }));
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[idx + 1];
      setStepStatuses((prev) => ({ ...prev, [next]: "active" }));
    } else {
      // Final step — open audio panel
      const s = stateRef.current;
      const finalText = stripFramingTags(s.framedReconstruction || s.reconstruction);
      setPipelineState((prev) => ({ ...prev, finalText }));
      setAudioOpen(true);
      setTimeout(() => {
        document.getElementById("audio-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }, []);

  // ── Edit a step's output ──────────────────────────────────
  const editOutput = useCallback((step: AgentStep, value: string) => {
    const outputKey = outputKeyForStep(step);
    setPipelineState((prev) => ({ ...prev, [outputKey]: value }));
  }, []);

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <Header
        showBack={phase === "pipeline"}
        onBack={() => { setPhase("upload"); setAudioOpen(false); }}
      />

      {phase === "upload" && <UploadPanel onStart={handleStart} />}

      {phase === "pipeline" && (
        <>
          <PassageBar state={pipelineState} />
          <PipelineProgress statuses={stepStatuses} streaming={streamingStep} />

          <div style={{ maxWidth: 800, margin: "0 auto", padding: "22px 24px 80px" }}>
            {AGENT_CONFIGS.map((config, idx) => {
              const step = config.id;
              const status = stepStatuses[step];
              const outputKey = outputKeyForStep(step);
              const output = pipelineState[outputKey] as string;

              return (
                <AgentStepPanel
                  key={step}
                  config={config}
                  stepIndex={idx}
                  isActive={status === "active" || status === "running"}
                  isComplete={status === "done"}
                  isPending={status === "pending"}
                  output={output}
                  isStreaming={streamingStep === step}
                  error={stepErrors[step]}
                  onRun={() => runStep(step)}
                  onEdit={(val) => editOutput(step, val)}
                  onApprove={() => approveStep(step)}
                />
              );
            })}

            {/* Audio panel — appears inline after all steps approved */}
            {audioOpen && (
              <div id="audio-panel">
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0 16px" }}>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to right, transparent, var(--amber-gold))" }} />
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 16px",
                      background: "rgba(201,146,42,0.1)",
                      border: "1px solid var(--amber-gold)",
                      borderRadius: 20,
                      color: "var(--amber-warm)",
                      fontSize: "0.76rem",
                      letterSpacing: "0.04em",
                    }}
                  >
                    <span>✓</span>
                    <span>All five agents complete</span>
                  </div>
                  <div style={{ height: 1, flex: 1, background: "linear-gradient(to left, transparent, var(--amber-gold))" }} />
                </div>
                <AudioPanel pipelineState={pipelineState} />
              </div>
            )}
          </div>
        </>
      )}

      <div
        style={{
          textAlign: "center",
          padding: "18px 24px",
          borderTop: "1px solid var(--ink-700)",
          color: "var(--slate-muted)",
          fontSize: "0.65rem",
          letterSpacing: "0.06em",
        }}
      >
        Tripod Method · OBT Lab · Shema Bible Translation · YWAM Kansas City
      </div>
    </div>
  );
}
