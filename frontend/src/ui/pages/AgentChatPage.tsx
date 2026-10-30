import React from "react";
import { ChatPanel } from "../components/ChatPanel.js";
import { useA11y } from "../state/a11y.js";

export function AgentChatPage() {
  const { voiceEnabled, toggleVoice } = useA11y();

  return (
    <div className="yl-chatPage">
      <ChatPanel
        variant="page"
        muted={!voiceEnabled}
        onToggleMute={toggleVoice}
      />
    </div>
  );
}
