import React from "react";
import { useApi } from "../state/api.js";
import { startRecognizeZhBuffered, asrErrorZh, asrStatusZh, type AsrStatus } from "../voice/asr.js";
import { unlockTtsInGesture } from "../voice/tts.js";

export function CompanionPage() {
  const api = useApi();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<AsrStatus | null>(null);
  const [listeningText, setListeningText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const stopRef = React.useRef<null | (() => void)>(null);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">陪伴指令</h1>
        <div className="muted">
          在这里可以为长辈发送一段温暖的话或提醒内容，系统会在长辈端以语音形式播报。
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setError(null);
              try {
                if (stopRef.current) return;
                unlockTtsInGesture();
                setListeningText("");
                setStatus("starting");
                const session = startRecognizeZhBuffered({
                  timeoutMs: 20_000,
                  silenceMs: 3000,
                  onPartial: (t) => setListeningText(t),
                  onStatus: (s) => setStatus(s)
                });
                stopRef.current = session.stop;
                const spoken = await session.result;
                stopRef.current = null;
                setText(spoken);
              } catch (err) {
                setError(asrErrorZh(err));
              } finally {
                setListeningText(null);
                setStatus(null);
                stopRef.current = null;
              }
            }}
          >
            {stopRef.current ? "正在聆听…" : "语音输入内容"}
          </button>
          <button
            className="btn"
            disabled={!stopRef.current || busy}
            onClick={() => {
              stopRef.current?.();
            }}
          >
            结束语音输入
          </button>
        </div>

        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <div className="pill" style={{ width: 160 }}>
            <div className="pillLabel">语音状态</div>
            <div className="pillValue">{asrStatusZh(status)}</div>
          </div>
          <div className="pill" style={{ flex: 1, minWidth: 240 }}>
            <div className="pillLabel">识别内容</div>
            <div className="pillValue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {listeningText ?? "—"}
            </div>
          </div>
        </div>

        <textarea
          className="input"
          style={{ minHeight: 90 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="想对长辈说的话，例如“今天天气不错，记得出门散散步，多喝温水。”"
        />

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn btnPrimary"
            disabled={busy || !text.trim()}
            onClick={async () => {
              const content = text.trim();
              if (!content) return;
              setBusy(true);
              setError(null);
              try {
                await api.emitMock("companion.command", {
                  kind: "voice_message",
                  content,
                  for: "elder"
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "发送失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "发送中…" : "发送到长辈端"}
          </button>
        </div>

        {error ? (
          <div className="muted" style={{ marginTop: 10 }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

