import React from "react";
import { ChatPanel } from "../components/ChatPanel.js";
import type { ChatWelcomeContext } from "../components/ChatWelcome.js";
import { api } from "../../lib/api.js";
import { useA11y } from "../state/a11y.js";
import { useAuth } from "../state/auth.js";
import { useRealtime } from "../state/realtime.js";

export function AgentChatPage() {
  const { voiceEnabled, toggleVoice } = useA11y();
  const { me } = useAuth();
  const { lastEvent } = useRealtime();
  const [context, setContext] = React.useState<ChatWelcomeContext | null>(null);
  const [baseLoaded, setBaseLoaded] = React.useState(false);

  const loadBase = React.useCallback(async () => {
    const [summaryRes, memoryRes, messageRes] = await Promise.allSettled([
      api.family.summary(),
      api.memory.list(),
      api.elderMessages.list({ peek: true })
    ]);
    const summary = summaryRes.status === "fulfilled" ? summaryRes.value.summary : null;
    const latestMemory =
      memoryRes.status === "fulfilled" ? (memoryRes.value.items[0] ?? null) : null;
    const messageItems = messageRes.status === "fulfilled" ? messageRes.value.items : [];
    const familyMessage =
      messageItems.find((item) => item.fromRole === "family" && !item.read) ?? null;
    setContext((prev) => ({
      displayName: me?.user.displayName ?? prev?.displayName ?? "您好",
      brief: prev?.brief ?? null,
      summary,
      latestMemory,
      familyMessage
    }));
    setBaseLoaded(true);
  }, [me?.user.displayName]);

  React.useEffect(() => {
    void loadBase();
    let alive = true;
    api.agent
      .brief()
      .then((res) => {
        if (!alive) return;
        setContext((prev) =>
          prev
            ? { ...prev, brief: res.brief }
            : {
                displayName: me?.user.displayName ?? "您好",
                brief: res.brief,
                summary: null,
                latestMemory: null,
                familyMessage: null
              }
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [loadBase, me?.user.displayName]);

  React.useEffect(() => {
    if (lastEvent?.type === "elder.message") void loadBase();
  }, [lastEvent, loadBase]);

  async function acknowledgeFamilyMessage() {
    try {
      await api.elderMessages.list();
    } catch {
      // 预览不阻塞聊天；下次进入仍会提示未读消息。
    }
    setContext((prev) => (prev ? { ...prev, familyMessage: null } : prev));
  }

  return (
    <div className="yl-chatPage">
      <ChatPanel
        variant="page"
        muted={!voiceEnabled}
        onToggleMute={toggleVoice}
        welcomeContext={baseLoaded ? context : null}
        onAcknowledgeFamilyMessage={() => void acknowledgeFamilyMessage()}
      />
    </div>
  );
}
