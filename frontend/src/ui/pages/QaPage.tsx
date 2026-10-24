import React from "react";
import { useApi } from "../state/api.js";
import { VoiceQaWindow } from "../components/VoiceQaWindow.js";

export function QaPage() {
  const api = useApi();

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">智能问答</h1>
        <div className="muted">支持语音提问与文字输入，可选择自动播报回答。</div>
      </div>

      <VoiceQaWindow ask={(q, conversationId) => api.ask(q, conversationId)} />
    </div>
  );
}
