import React from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";

function resolveDefaultEmbedUrl() {
  const u = new URL(window.location.href);
  const view = u.searchParams.get("view");
  if (view === "dialog") return "/dh-live/dialog_RealTime.html";
  return "/dh-live/MiniLive_RealTime.html";
}

export function SmartCompanionPage() {
  const nav = useNavigate();
  const [src] = React.useState(() => resolveDefaultEmbedUrl());

  return (
    <div className="stack" style={{ height: "100%", paddingBottom: 0 }}>
      <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: -1, zIndex: 10 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="h1" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="bot" size={26} className="btnIcon" /> 智能陪伴
          </h1>
          <div className="muted">点击输入内容，获得数字人驱动的实时回答</div>
        </div>
        <button type="button" className="btn" onClick={() => nav(-1)}>
          返回
        </button>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden", flex: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0, background: "rgba(0,0,0,0.02)" }}>
        <iframe
          title="智能陪伴对话"
          src={src}
          style={{ border: 0, width: "100%", height: "100%", display: "block", background: "transparent" }}
          allow="microphone; autoplay"
        />
      </div>
    </div>
  );
}
