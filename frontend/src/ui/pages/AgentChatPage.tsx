import React from "react";
import { ChatPanel } from "../components/ChatPanel.js";
import { setTtsEnabled } from "../voice/tts.js";

const MUTE_KEY = "yl-jasmine-muted";

export function AgentChatPage() {
  const [muted, setMuted] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    setTtsEnabled(!muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [muted]);

  return (
    <div className="yl-chatPage">
      <ChatPanel
        variant="page"
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
      />
    </div>
  );
}
