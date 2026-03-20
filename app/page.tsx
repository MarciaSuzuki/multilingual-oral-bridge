"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  SUPPORTED_LANGUAGES,
  ELEVENLABS_VOICES,
  type AgentStep,
  type PipelineState,
} from "@/lib/types";

// ─── Brand ────────────────────────────────────────────────────

const C = {
  telha: "#be4a01",
  telhaLight: "#d4622a",
  telhaPale: "#e8956a",
  verde: "#3f3e20",
  verdeMid: "#777d45",
  verdeLight: "#a8ad78",
  cream: "#f6f5eb",
  creamDim: "#b0ad94",
  bg: "#111109",
  surface: "#1a1a0c",
  raised: "#222215",
  card: "#1e1e12",
  borderSubtle: "#35351e",
  borderMid: "#4a4a2a",
  textMuted: "#787560",
};

const TRANSLATION_COLOR = C.telha;
const COMMENTARY_COLOR = C.verdeMid;
const SHARED_COLOR = C.verdeLight;

// ─── Shema Logo SVG ────────────────────────────────────────────

function ShemaIcon({ size = 36, color = C.cream }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
      <path fill={color} d="M900,451.61V151.07H700a278.79,278.79,0,0,0-83.83,12.66c-71,22.3-116.17,92-116.17,92h0s-45-69.59-116.17-92A278.79,278.79,0,0,0,300,151.07H100V749H300a279.12,279.12,0,0,1,83.83,12.65C455,784,500,848.93,500,848.93h0s39.71-57.16,103.18-82.68c-.33-5.73-.52-11.49-.52-17.31C602.66,585,736.05,451.61,900,451.61Z"/>
      <path fill={color} d="M827.11,748.94H900V675.57C859.81,675.57,827.11,708.49,827.11,748.94Z"/>
      <path fill={color} d="M734.56,748.94h53.22c0-62.14,50.34-112.71,112.22-112.71V583.5C808.77,583.5,734.56,657.72,734.56,748.94Z"/>
      <path fill={color} d="M642,748.94q0,3,.08,6A281.75,281.75,0,0,1,695.22,749v-.1C695.22,636,787.08,544.16,900,544.16V490.94C757.74,490.94,642,606.68,642,748.94Z"/>
    </svg>
  );
}

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

const STEP_FULL_LABELS: Record<AgentStep, string> = {
  cartographer: "Oral Exegesis",
  analyst: "Oral Patterns",
  faithful_reconstructor: "Oral Reconstruction",
  commented_reconstructor: "Oral Reconstruction",
  faithful_framer: "Oral Frames",
  commented_framer: "Oral Frames",
  checker: "Accuracy Check",
};

// ─── Shared styles ─────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  display: "block", fontSize: "0.63rem", letterSpacing: "0.1em",
  textTransform: "uppercase", color: C.textMuted, marginBottom: 5,
};
const textareaSt: React.CSSProperties = {
  width: "100%", background: "rgba(10,10,5,0.7)", border: `1px solid ${C.borderMid}`,
  borderRadius: 5, padding: "11px 14px", color: C.cream, resize: "vertical",
  fontFamily: "'Source Serif 4', serif", fontSize: "0.9rem", lineHeight: 1.78,
};
const inputSt: React.CSSProperties = {
  width: "100%", background: `${C.raised}`, border: `1px solid ${C.borderMid}`,
  borderRadius: 5, padding: "8px 11px", color: C.cream,
  fontFamily: "'Source Serif 4', serif", fontSize: "0.875rem",
};
const ghostSt: React.CSSProperties = {
  padding: "6px 12px", background: "transparent", border: `1px solid ${C.borderMid}`,
  borderRadius: 4, color: C.creamDim, fontFamily: "'Source Serif 4', serif",
  fontSize: "0.75rem", cursor: "pointer",
};
function primarySt(color: string): React.CSSProperties {
  return { padding: "8px 16px", background: color, border: "none", borderRadius: 4, color: C.cream, fontFamily: "'Source Serif 4', serif", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
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

// ─── Framing Preview ───────────────────────────────────────────

function FramedPreview({ text }: { text: string }) {
  const cleaned = text.indexOf("## FRAMING NOTES") !== -1 ? text.slice(0, text.indexOf("## FRAMING NOTES")).trim() : text;
  const TAG_RE = /\[(ATTENTIONAL|STRUCTURAL|TURN): "([^"]*)"\]/g;
  const parts: React.ReactNode[] = [];
  let last = 0; let match: RegExpExecArray | null; let key = 0;
  const S: Record<string, { bg: string; border: string; label: string }> = {
    ATTENTIONAL: { bg: `${C.telha}22`, border: C.telha, label: "ATT" },
    STRUCTURAL: { bg: `${C.verdeMid}22`, border: C.verdeMid, label: "STR" },
    TURN: { bg: `${C.verdeLight}18`, border: C.verdeLight, label: "TRN" },
  };
  while ((match = TAG_RE.exec(cleaned)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{cleaned.slice(last, match.index)}</span>);
    const s = S[match[1]] || S.ATTENTIONAL;
    parts.push(
      <span key={key++} style={{ background: s.bg, borderBottom: `1.5px solid ${s.border}`, borderRadius: 2, padding: "1px 4px" }}>
        <span style={{ fontSize: "0.55em", background: `${s.border}33`, color: s.border, borderRadius: 2, padding: "0 3px", marginRight: 4, fontFamily: "'JetBrains Mono', monospace" }}>{s.label}</span>
        <span style={{ color: s.border }}>{match[2]}</span>
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < cleaned.length) parts.push(<span key={key++}>{cleaned.slice(last)}</span>);
  return (
    <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: "0.9rem", lineHeight: 1.85, color: C.cream, whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "12px 14px", background: "rgba(10,10,5,0.7)", border: `1px solid ${C.borderMid}`, borderRadius: 5, minHeight: 80 }}>
      {parts}
    </div>
  );
}

// ─── Agent Step ────────────────────────────────────────────────
// Accordion: openId controls which step is open.
// When this step's id matches openId it is open; clicking sets openId.

function AgentStep({ stepId, label, description, status, output, isStreaming, error, color, openId, setOpenId, onRun, onEdit, onApprove }: {
  stepId: string; label: string; description: string;
  status: StepStatus; output: string; isStreaming: boolean; error: string; color: string;
  openId: string; setOpenId: (id: string) => void;
  onRun: () => void; onEdit: (v: string) => void; onApprove: () => void;
}) {
  const isOpen = openId === stepId;
  const isDone = status === "done";
  const isActive = status === "active" || status === "running";
  const isPending = status === "pending";
  const isFramer = stepId.includes("framer");
  const hasFraming = isFramer && output.length > 0 && /\[(ATTENTIONAL|STRUCTURAL|TURN):/.test(output);
  const isOral = !stepId.includes("cartographer") && !stepId.includes("analyst") && !stepId.includes("checker");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const rows = Math.min(Math.max(output.split("\n").length + 1, 6), 28);
  const dotColor = isDone ? color : isActive ? color : C.borderMid;

  // Auto-open when step becomes active (if nothing else is open)
  useEffect(() => {
    if (status === "active" && openId === "") setOpenId(stepId);
  }, [status, stepId, openId, setOpenId]);

  const toggle = () => {
    if (isPending && !output) return;
    setOpenId(isOpen ? "" : stepId);
  };

  return (
    <div style={{ borderRadius: 6, marginBottom: 4, border: `1px solid ${isDone ? color + "55" : isActive ? color + "33" : C.borderSubtle}`, background: isDone ? `${color}07` : isActive ? C.raised : C.card, opacity: isPending && !output ? 0.3 : 1, transition: "all 0.2s ease" }}>
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 13px", cursor: isPending && !output ? "default" : "pointer", userSelect: "none" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${dotColor}`, background: isDone ? `${dotColor}28` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: dotColor, fontSize: "0.6rem", flexShrink: 0, animation: isStreaming ? "pulse-ring 1.2s ease-in-out infinite" : "none", transition: "all 0.3s ease" }}>
          {isDone ? "✓" : isStreaming ? "◌" : ""}
        </div>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: isActive || isDone ? C.cream : C.creamDim, flex: 1 }}>{label}</span>
        <span style={{ fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", color: isDone ? color : isStreaming ? C.telhaPale : isActive ? C.creamDim : C.textMuted }}>
          {isDone ? "done" : isStreaming ? "running…" : isActive ? "ready" : "pending"}
        </span>
        {(!isPending || output) && <span style={{ color: C.textMuted, fontSize: "0.58rem", marginLeft: 4 }}>{isOpen ? "▾" : "▸"}</span>}
      </div>

      {isOpen && (
        <div style={{ padding: "0 13px 13px" }}>
          {isActive && !output && !isStreaming && (
            <>
              <p style={{ fontSize: "0.78rem", color: C.creamDim, lineHeight: 1.65, marginBottom: 10 }}>{description}</p>
              <button onClick={onRun} style={primarySt(color)}>Run →</button>
            </>
          )}
          {isStreaming && !output && <div className="streaming-cursor" style={{ fontSize: "0.78rem", color: C.textMuted, fontStyle: "italic", padding: "4px 0" }}>Thinking</div>}
          {output && (
            <>
              {hasFraming && (
                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                  {(["edit", "preview"] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "2px 8px", fontSize: "0.63rem", letterSpacing: "0.05em", textTransform: "uppercase", border: `1px solid ${viewMode === mode ? color : C.borderMid}`, borderRadius: 3, background: viewMode === mode ? `${color}20` : "transparent", color: viewMode === mode ? color : C.textMuted, cursor: "pointer" }}>
                      {mode === "edit" ? "Edit" : "Preview"}
                    </button>
                  ))}
                </div>
              )}
              {viewMode === "preview" && hasFraming
                ? <FramedPreview text={output} />
                : <textarea value={output} onChange={(e) => onEdit(e.target.value)} disabled={isStreaming} rows={rows} className={isStreaming ? "streaming-cursor" : ""} style={{ ...textareaSt, fontFamily: isOral ? "'Source Serif 4', serif" : "'JetBrains Mono', monospace", fontSize: isOral ? "0.9rem" : "0.74rem", opacity: isStreaming ? 0.65 : 1 }} />
              }
              {error && <div style={{ marginTop: 7, padding: "7px 10px", background: "rgba(180,50,50,0.15)", border: "1px solid rgba(180,50,50,0.4)", borderRadius: 4, color: "#f08080", fontSize: "0.75rem" }}>{error}</div>}
              {!isStreaming && (
                <div style={{ display: "flex", gap: 6, marginTop: 9, justifyContent: "flex-end" }}>
                  <button onClick={onRun} style={ghostSt}>↻ Redo</button>
                  {!isDone && <button onClick={onApprove} style={primarySt(color)}>Approve →</button>}
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

// ─── Track Section ─────────────────────────────────────────────

function TrackSection({ title, subtitle, color, icon, badge, children, defaultOpen = true }: {
  title: string; subtitle: string; color: string; icon: string;
  badge?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 8, overflow: "hidden", background: C.card }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", cursor: "pointer", userSelect: "none", background: `${color}0e` }}>
        <span style={{ color, fontSize: "1.1rem", flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", fontWeight: 700, color: C.cream }}>{title}</div>
          <div style={{ fontSize: "0.62rem", color, marginTop: 1, letterSpacing: "0.05em" }}>{subtitle}</div>
        </div>
        {badge && <span style={{ fontSize: "0.57rem", letterSpacing: "0.09em", textTransform: "uppercase", color, background: `${color}1a`, border: `1px solid ${color}44`, borderRadius: 3, padding: "2px 7px" }}>{badge}</span>}
        <span style={{ color: C.textMuted, fontSize: "0.65rem" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${color}22` }}>{children}</div>}
    </div>
  );
}

// ─── Other Track Offer ─────────────────────────────────────────

function OtherTrackOffer({ completedTrack, onAdd }: { completedTrack: "faithful" | "commented"; onAdd: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const isCommentary = completedTrack === "faithful";
  const color = isCommentary ? COMMENTARY_COLOR : TRANSLATION_COLOR;
  const label = isCommentary ? "Commentary" : "Translation";
  const desc = isCommentary
    ? "Add a rich contextual telling that weaves the text and its world together."
    : "Add a faithful, consultant-approvable oral rendering.";
  return (
    <div className="fade-in" style={{ border: `1px solid ${color}55`, borderRadius: 8, padding: "16px 18px", background: `${color}0a`, marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", fontWeight: 600, color: C.cream, marginBottom: 3 }}>
          Also generate the {label}?
        </div>
        <div style={{ fontSize: "0.78rem", color: C.creamDim, lineHeight: 1.55 }}>{desc}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button onClick={onAdd} style={primarySt(color)}>Add {label} →</button>
        <button onClick={() => setDismissed(true)} style={ghostSt}>Dismiss</button>
      </div>
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
    <div style={{ border: `1px solid ${color}55`, borderRadius: 8, overflow: "hidden", background: `${color}08` }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", userSelect: "none", background: `${color}0f` }}>
        <span style={{ color, fontSize: "1rem" }}>♪</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", fontWeight: 700, color: C.cream }}>{title}</div>
          <div style={{ fontSize: "0.6rem", color: C.textMuted, fontStyle: "italic" }}>ElevenLabs · eleven_multilingual_v2</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onExportTXT(); }} style={ghostSt}>↓ .txt</button>
        <span style={{ color: C.textMuted, fontSize: "0.65rem", marginLeft: 4 }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "14px 16px", borderTop: `1px solid ${color}22` }}>
          <textarea value={cleanText} onChange={(e) => setCleanText(e.target.value)} rows={9} style={{ ...textareaSt, marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Voice</label>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} style={{ ...inputSt, cursor: "pointer" }}>
                {ELEVENLABS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Custom voice ID</label>
              <input type="text" value={customVoice} onChange={(e) => setCustomVoice(e.target.value)} placeholder="Paste ElevenLabs ID…" style={{ ...inputSt, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }} />
            </div>
          </div>
          <button onClick={generate} disabled={loading || !cleanText.trim()} style={{ width: "100%", padding: "11px", background: loading || !cleanText.trim() ? C.raised : color, border: "none", borderRadius: 6, color: loading || !cleanText.trim() ? C.textMuted : C.cream, fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", fontWeight: 700, cursor: loading || !cleanText.trim() ? "not-allowed" : "pointer", marginBottom: 10, letterSpacing: "0.02em" }}>
            {loading ? "Generating…" : "Generate Audio ♪"}
          </button>
          {error && <div style={{ padding: "8px 10px", background: "rgba(180,50,50,0.15)", border: "1px solid rgba(180,50,50,0.4)", borderRadius: 4, color: "#f08080", fontSize: "0.78rem", marginBottom: 8 }}>{error}</div>}
          {audioUrl && (
            <div className="fade-in" style={{ padding: "12px 14px", background: "rgba(10,10,5,0.6)", borderRadius: 6, border: `1px solid ${color}44` }}>
              <div style={{ fontSize: "0.7rem", color, marginBottom: 8 }}>✓ {passageRef} · {getLangLabel(langCode)}</div>
              <audio controls src={audioUrl} style={{ width: "100%", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 7 }}>
                <a href={audioUrl} download={`oral-bridge-${trackId}-${slug(passageRef)}.mp3`} style={{ padding: "6px 12px", background: `${color}22`, border: `1px solid ${color}`, borderRadius: 4, color, fontSize: "0.73rem", textDecoration: "none" }}>↓ .mp3</a>
                <button onClick={() => { setAudioUrl(null); generate(); }} style={ghostSt}>↻ Redo</button>
              </div>
            </div>
          )}
        </div>
      )}
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
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "52px 24px 80px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <ShemaIcon size={64} color={C.telha} />
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(2.4rem, 5vw, 3.6rem)", fontWeight: 700, color: C.cream, lineHeight: 1.1, marginBottom: 14, letterSpacing: "-0.02em" }}>
          Oral Bridge
        </h1>
        <p style={{ color: C.creamDim, fontSize: "clamp(0.9rem, 2vw, 1.1rem)", lineHeight: 1.65, maxWidth: 480, margin: "0 auto 18px", letterSpacing: "0.01em" }}>
          Generating Oral Scriptures and Biblical Commentaries for Bridge Languages
        </p>
        <div style={{ display: "inline-flex", gap: 10, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.textMuted }}>
          <span>OBT Lab</span><span style={{ color: C.telha }}>·</span>
          <span>Shema Bible Translation</span><span style={{ color: C.telha }}>·</span>
          <span>Tripod Method</span>
        </div>
      </div>

      {/* Map input */}
      <div onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onClick={() => fileRef.current?.click()}
        style={{ border: `1.5px dashed ${dragOver ? C.telha : mapOk ? C.telha + "88" : C.borderMid}`, borderRadius: 8, padding: "20px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: dragOver ? `${C.telha}0a` : C.surface, transition: "all 0.2s ease" }}>
        <div style={{ fontSize: "1.2rem", color: mapOk ? C.telha : C.textMuted, marginBottom: 4 }}>{mapOk ? "✓" : "↑"}</div>
        <div style={{ fontSize: "0.83rem", color: C.creamDim, marginBottom: 2 }}>
          {mapOk ? `${wordCount.toLocaleString()} words loaded — click to replace` : "Drop your Prose Meaning Map here, or click to browse"}
        </div>
        <div style={{ fontSize: "0.68rem", color: C.textMuted }}>.txt · .md · .json</div>
        <input ref={fileRef} type="file" accept=".txt,.md,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelSt}>Or paste the map</label>
        <textarea value={mapText} onChange={(e) => setMapText(e.target.value)} rows={4} placeholder="Paste your validated Prose Meaning Map here…" style={{ ...textareaSt, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", borderColor: mapOk ? C.telha + "66" : C.borderMid }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelSt}>Passage reference</label>
          <input type="text" value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="e.g. Ruth 1:1–7" style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Target language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputSt, cursor: "pointer" }}>
            {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelSt}>Community context <span style={{ color: C.telha }}>*</span></label>
        <textarea value={communityContext} onChange={(e) => setCommunityContext(e.target.value)} rows={2}
          placeholder={`e.g. Rural ${getLangLabel(language)}-speaking community in [region] — oral storytelling tradition`}
          style={{ ...textareaSt, fontSize: "0.875rem", borderColor: contextOk ? C.telha + "66" : C.borderMid }} />
      </div>

      {/* Track selection */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelSt}>Output tracks</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([
            { key: "faithful" as const, label: "Translation", sub: "Faithful · consultant-approvable", color: TRANSLATION_COLOR },
            { key: "commented" as const, label: "Commentary", sub: "Rich · contextual · explanatory", color: COMMENTARY_COLOR },
          ]).map(t => (
            <div key={t.key} onClick={() => setTracks(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
              style={{ padding: "12px 14px", border: `1.5px solid ${tracks[t.key] ? t.color : C.borderMid}`, borderRadius: 7, cursor: "pointer", background: tracks[t.key] ? `${t.color}10` : C.surface, transition: "all 0.2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <div style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${tracks[t.key] ? t.color : C.borderMid}`, background: tracks[t.key] ? t.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.52rem", color: C.cream, flexShrink: 0 }}>
                  {tracks[t.key] ? "✓" : ""}
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: tracks[t.key] ? C.cream : C.creamDim }}>{t.label}</span>
              </div>
              <div style={{ fontSize: "0.67rem", color: tracks[t.key] ? t.color : C.textMuted, paddingLeft: 20 }}>{t.sub}</div>
            </div>
          ))}
        </div>
        {!tracksOk && <p style={{ fontSize: "0.7rem", color: "#f08080", marginTop: 6 }}>Select at least one track.</p>}
      </div>

      <button disabled={!canStart} onClick={() => onStart(mapText, language, communityContext, passage, tracks)}
        style={{ width: "100%", padding: "13px 24px", background: canStart ? C.telha : C.raised, border: "none", borderRadius: 6, color: canStart ? C.cream : C.textMuted, fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, cursor: canStart ? "pointer" : "not-allowed", letterSpacing: "0.02em", transition: "all 0.2s ease" }}>
        {canStart ? "Begin Pipeline →" : "Complete required fields to continue"}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function OralBridgePage() {
  const [phase, setPhase] = useState<"upload" | "pipeline">("upload");
  const [activeTracks, setActiveTracks] = useState<Tracks>({ faithful: true, commented: true });
  const [faithfulAudioReady, setFaithfulAudioReady] = useState(false);
  const [commentedAudioReady, setCommentedAudioReady] = useState(false);
  const [showOtherTrackOffer, setShowOtherTrackOffer] = useState<"faithful" | "commented" | null>(null);

  // Global accordion state — one step open at a time across all sections
  const [openStepId, setOpenStepId] = useState("");

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
    setShowOtherTrackOffer(null);
    setOpenStepId("cartographer"); // open first step
    setStepStatuses({ cartographer: "active", analyst: "pending", faithful_reconstructor: "pending", commented_reconstructor: "pending", faithful_framer: "pending", commented_framer: "pending", checker: "pending" });
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

  const approveStep = useCallback((step: AgentStep) => {
    setStepStatuses(prev => ({ ...prev, [step]: "done" }));

    switch (step) {
      case "cartographer":
        setStepStatuses(prev => ({ ...prev, analyst: "active" }));
        setOpenStepId("analyst");
        break;

      case "analyst":
        setStepStatuses(prev => ({
          ...prev,
          ...(activeTracks.faithful ? { faithful_reconstructor: "active" } : {}),
          ...(activeTracks.commented ? { commented_reconstructor: "active" } : {}),
        }));
        // Open whichever track step comes first
        setOpenStepId(activeTracks.faithful ? "faithful_reconstructor" : "commented_reconstructor");
        break;

      case "faithful_reconstructor":
        setStepStatuses(prev => ({ ...prev, faithful_framer: "active" }));
        setOpenStepId("faithful_framer");
        break;

      case "faithful_framer":
        setStepStatuses(prev => ({ ...prev, checker: "active" }));
        setOpenStepId("checker");
        break;

      case "checker": {
        const st = stateRef.current;
        setPipelineState(p => ({ ...p, faithfulFinalText: stripFramingTags(st.faithfulFramed || st.faithfulReconstruction) }));
        setFaithfulAudioReady(true);
        setOpenStepId("");
        // Offer other track if not already active
        if (!activeTracks.commented) setShowOtherTrackOffer("faithful");
        setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
        break;
      }

      case "commented_reconstructor":
        setStepStatuses(prev => ({ ...prev, commented_framer: "active" }));
        setOpenStepId("commented_framer");
        break;

      case "commented_framer": {
        const st = stateRef.current;
        setPipelineState(p => ({ ...p, commentedFinalText: stripFramingTags(st.commentedFramed || st.commentedReconstruction) }));
        setCommentedAudioReady(true);
        setOpenStepId("");
        // Offer other track if not already active
        if (!activeTracks.faithful) setShowOtherTrackOffer("commented");
        setTimeout(() => { document.getElementById("audio-section")?.scrollIntoView({ behavior: "smooth" }); }, 120);
        break;
      }
    }
  }, [activeTracks]);

  // Add the other track mid-pipeline
  const addOtherTrack = useCallback(() => {
    if (!showOtherTrackOffer) return;
    const addingFaithful = showOtherTrackOffer === "commented"; // offer shown when commented done = add faithful
    const addingCommented = showOtherTrackOffer === "faithful";
    setActiveTracks(prev => ({
      ...prev,
      ...(addingFaithful ? { faithful: true } : {}),
      ...(addingCommented ? { commented: true } : {}),
    }));
    if (addingFaithful) {
      setStepStatuses(prev => ({ ...prev, faithful_reconstructor: "active" }));
      setOpenStepId("faithful_reconstructor");
    }
    if (addingCommented) {
      setStepStatuses(prev => ({ ...prev, commented_reconstructor: "active" }));
      setOpenStepId("commented_reconstructor");
    }
    setShowOtherTrackOffer(null);
    // Scroll back up to tracks
    setTimeout(() => { document.getElementById("track-section")?.scrollIntoView({ behavior: "smooth" }); }, 100);
  }, [showOtherTrackOffer]);

  const editOutput = useCallback((step: AgentStep, value: string) => {
    setPipelineState(prev => ({ ...prev, [outputKeyForStep(step)]: value }));
  }, []);

  const descriptions: Record<AgentStep, string> = {
    cartographer: "Reads the Prose Meaning Map and produces two sections: Section A (Level 3 propositions — the only content that may be spoken) and Section B (Levels 1–2 — performance world that shapes register without contributing spoken content).",
    analyst: "Identifies authentic oral narrative conventions of the target community — discourse connectors, participant tracking, speech framing, climax marking.",
    faithful_reconstructor: "Tells the passage using ONLY Section A content. The subtraction test applies to every sentence. This is the Translation.",
    commented_reconstructor: "Tells and illuminates the passage as a master elder would — weaving text and world together, drawing freely from both sections. This is the Commentary.",
    faithful_framer: "Adds oral metadiscourse (attentional, structural, turn-taking markers) to the Translation. Governed by the subtraction rule — no content is added.",
    commented_framer: "Adds oral metadiscourse to the Commentary to help listeners follow the richer, contextual telling.",
    checker: "Checks the Translation for completeness (all Level 3 elements present) and faithfulness (nothing beyond Level 3 added).",
  };

  const audioOpen = faithfulAudioReady || commentedAudioReady;

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(17,17,9,0.95)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${C.borderSubtle}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <ShemaIcon size={28} color={C.telha} />
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", fontWeight: 700, color: C.cream, lineHeight: 1.1 }}>Oral Bridge</div>
            <div style={{ fontSize: "0.52rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.textMuted }}>
              Generating Oral Scriptures and Biblical Commentaries for Bridge Languages
            </div>
          </div>
        </div>
        {phase === "pipeline" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pipelineState.passageReference && <span style={{ fontFamily: "'Playfair Display', serif", color: C.cream, fontSize: "0.85rem" }}>{pipelineState.passageReference}</span>}
            <span style={{ color: C.textMuted }}>·</span>
            <span style={{ color: C.telhaPale, fontSize: "0.8rem" }}>{getLangLabel(pipelineState.targetLanguage)}</span>
            <button onClick={() => setPhase("upload")} style={{ ...ghostSt, marginLeft: 6, fontSize: "0.7rem", padding: "4px 10px" }}>← New map</button>
          </div>
        )}
      </header>

      {phase === "upload" && <UploadPanel onStart={handleStart} />}

      {phase === "pipeline" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 18px 80px" }}>

          {/* Shared Analysis */}
          <TrackSection title="Shared Analysis" subtitle="Oral Exegesis · Oral Patterns" color={SHARED_COLOR} icon="◈"
            badge={stepStatuses.analyst === "done" ? "complete" : "in progress"}
            defaultOpen={stepStatuses.analyst !== "done"}>
            <AgentStep stepId="cartographer" label={STEP_FULL_LABELS.cartographer} description={descriptions.cartographer}
              status={stepStatuses.cartographer} output={pipelineState.semanticInventory}
              isStreaming={streamingStep === "cartographer"} error={stepErrors.cartographer} color={SHARED_COLOR}
              openId={openStepId} setOpenId={setOpenStepId}
              onRun={() => runStep("cartographer")} onEdit={v => editOutput("cartographer", v)} onApprove={() => approveStep("cartographer")} />
            <AgentStep stepId="analyst" label={STEP_FULL_LABELS.analyst} description={descriptions.analyst}
              status={stepStatuses.analyst} output={pipelineState.oralBlueprint}
              isStreaming={streamingStep === "analyst"} error={stepErrors.analyst} color={SHARED_COLOR}
              openId={openStepId} setOpenId={setOpenStepId}
              onRun={() => runStep("analyst")} onEdit={v => editOutput("analyst", v)} onApprove={() => approveStep("analyst")} />
          </TrackSection>

          {/* Two-column tracks */}
          <div id="track-section" style={{ display: "grid", gridTemplateColumns: activeTracks.faithful && activeTracks.commented ? "1fr 1fr" : "1fr", gap: 14, marginTop: 10 }}>
            {activeTracks.faithful && (
              <TrackSection title="Translation" subtitle="Faithful · consultant-approvable" color={TRANSLATION_COLOR} icon="◎"
                badge={stepStatuses.checker === "done" ? "complete" : stepStatuses.faithful_reconstructor === "pending" ? "waiting" : "in progress"}>
                <AgentStep stepId="faithful_reconstructor" label={STEP_FULL_LABELS.faithful_reconstructor} description={descriptions.faithful_reconstructor}
                  status={stepStatuses.faithful_reconstructor} output={pipelineState.faithfulReconstruction}
                  isStreaming={streamingStep === "faithful_reconstructor"} error={stepErrors.faithful_reconstructor} color={TRANSLATION_COLOR}
                  openId={openStepId} setOpenId={setOpenStepId}
                  onRun={() => runStep("faithful_reconstructor")} onEdit={v => editOutput("faithful_reconstructor", v)} onApprove={() => approveStep("faithful_reconstructor")} />
                <AgentStep stepId="faithful_framer" label={STEP_FULL_LABELS.faithful_framer} description={descriptions.faithful_framer}
                  status={stepStatuses.faithful_framer} output={pipelineState.faithfulFramed}
                  isStreaming={streamingStep === "faithful_framer"} error={stepErrors.faithful_framer} color={TRANSLATION_COLOR}
                  openId={openStepId} setOpenId={setOpenStepId}
                  onRun={() => runStep("faithful_framer")} onEdit={v => editOutput("faithful_framer", v)} onApprove={() => approveStep("faithful_framer")} />
                <AgentStep stepId="checker" label={STEP_FULL_LABELS.checker} description={descriptions.checker}
                  status={stepStatuses.checker} output={pipelineState.fidelityReport}
                  isStreaming={streamingStep === "checker"} error={stepErrors.checker} color={TRANSLATION_COLOR}
                  openId={openStepId} setOpenId={setOpenStepId}
                  onRun={() => runStep("checker")} onEdit={v => editOutput("checker", v)} onApprove={() => approveStep("checker")} />
              </TrackSection>
            )}

            {activeTracks.commented && (
              <TrackSection title="Commentary" subtitle="Rich · contextual · explanatory" color={COMMENTARY_COLOR} icon="◍"
                badge={stepStatuses.commented_framer === "done" ? "complete" : stepStatuses.commented_reconstructor === "pending" ? "waiting" : "in progress"}>
                <AgentStep stepId="commented_reconstructor" label={STEP_FULL_LABELS.commented_reconstructor} description={descriptions.commented_reconstructor}
                  status={stepStatuses.commented_reconstructor} output={pipelineState.commentedReconstruction}
                  isStreaming={streamingStep === "commented_reconstructor"} error={stepErrors.commented_reconstructor} color={COMMENTARY_COLOR}
                  openId={openStepId} setOpenId={setOpenStepId}
                  onRun={() => runStep("commented_reconstructor")} onEdit={v => editOutput("commented_reconstructor", v)} onApprove={() => approveStep("commented_reconstructor")} />
                <AgentStep stepId="commented_framer" label={STEP_FULL_LABELS.commented_framer} description={descriptions.commented_framer}
                  status={stepStatuses.commented_framer} output={pipelineState.commentedFramed}
                  isStreaming={streamingStep === "commented_framer"} error={stepErrors.commented_framer} color={COMMENTARY_COLOR}
                  openId={openStepId} setOpenId={setOpenStepId}
                  onRun={() => runStep("commented_framer")} onEdit={v => editOutput("commented_framer", v)} onApprove={() => approveStep("commented_framer")} />
              </TrackSection>
            )}
          </div>

          {/* Offer to add the other track */}
          {showOtherTrackOffer && (
            <OtherTrackOffer completedTrack={showOtherTrackOffer} onAdd={addOtherTrack} />
          )}

          {/* Audio outputs */}
          {audioOpen && (
            <div id="audio-section">
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0 14px" }}>
                <div style={{ height: 1, flex: 1, background: `linear-gradient(to right, transparent, ${C.telha})` }} />
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", background: `${C.telha}18`, border: `1px solid ${C.telha}66`, borderRadius: 20, color: C.telhaPale, fontSize: "0.73rem" }}>
                  ✓ Audio ready
                </div>
                <div style={{ height: 1, flex: 1, background: `linear-gradient(to left, transparent, ${C.telha})` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button onClick={() => exportJSON(pipelineState)} style={ghostSt}>↓ Export pipeline .json</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: faithfulAudioReady && commentedAudioReady ? "1fr 1fr" : "1fr", gap: 14 }}>
                {faithfulAudioReady && (
                  <AudioPanel title="Translation" color={TRANSLATION_COLOR} trackId="faithful"
                    text={pipelineState.faithfulFinalText || stripFramingTags(pipelineState.faithfulFramed || pipelineState.faithfulReconstruction)}
                    passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                    onExportTXT={() => exportTXT(pipelineState, "faithful")} />
                )}
                {commentedAudioReady && (
                  <AudioPanel title="Commentary" color={COMMENTARY_COLOR} trackId="commented"
                    text={pipelineState.commentedFinalText || stripFramingTags(pipelineState.commentedFramed || pipelineState.commentedReconstruction)}
                    passageRef={pipelineState.passageReference} langCode={pipelineState.targetLanguage}
                    onExportTXT={() => exportTXT(pipelineState, "commented")} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", padding: "16px 24px", borderTop: `1px solid ${C.borderSubtle}`, color: C.textMuted, fontSize: "0.6rem", letterSpacing: "0.08em" }}>
        Tripod Method · OBT Lab · Shema Bible Translation · YWAM Kansas City
      </div>
    </div>
  );
}
