import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { FamilyInvite } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import "./auth.css";

export function FamilyInvitePage() {
  const toast = useToast();
  const { me } = useAuth();
  const elderId = me?.user.elderId ?? me?.familyLinks[0]?.elderId ?? null;
  const elderName = me?.elder?.displayName ?? me?.familyLinks[0]?.elderName ?? "长辈";
  const [invite, setInvite] = React.useState<FamilyInvite | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const generate = React.useCallback(async () => {
    if (!elderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.regenerateInvite(elderId);
      setInvite(res.invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "绑定码生成失败");
    } finally {
      setLoading(false);
    }
  }, [elderId]);

  React.useEffect(() => {
    void generate();
  }, [generate]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ kind: "ok", title: "已复制", detail: label });
    } catch {
      toast.push({ kind: "normal", title: label, detail: text });
    }
  }

  const link = invite ? `${window.location.origin}/login/elder?code=${invite.code}` : "";

  if (!elderId) {
    return (
      <div className="ys-authPage">
        <div className="ys-authCard">
          <p className="ys-authKicker">长辈绑定码</p>
          <h1 className="ys-authTitle">先添加一位长辈</h1>
          <p className="ys-authSub">没有长辈档案时无法生成绑定码。</p>
          <Link to="/family/elders/new" className="btn btnPrimary">
            去添加长辈
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ys-authPage">
      <div className="ys-authCard">
        <Link to="/family" className="ys-authBack">
          <Icon name="chevronLeft" size="sm" />
          返回家人概览
        </Link>
        <p className="ys-authKicker">长辈绑定码</p>
        <h1 className="ys-authTitle">让{elderName}进入长辈端</h1>
        <p className="ys-authSub">
          在长辈的手机或平板上打开长辈入口，输入下面的 6 位数字。绑定后这台设备免密，15 分钟内有效。
        </p>

        {loading ? (
          <p className="ys-mutedText">正在生成绑定码…</p>
        ) : error ? (
          <p className="ys-authError">{error}</p>
        ) : (
          invite && (
            <div className="ys-inviteBox">
              <div className="ys-bindCode" aria-label={`绑定码 ${invite.code}`}>
                {invite.code.split("").map((digit, index) => (
                  <span key={`${digit}_${index}`}>{digit}</span>
                ))}
              </div>
              <p className="ys-authHint">
                有效期至{" "}
                {new Date(invite.expiresAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
                ，一次性使用。
              </p>
              <div className="ys-inviteActions">
                <button type="button" className="btn" onClick={() => void copy(invite.code, "绑定码")}>
                  <Icon name="copy" size="sm" />
                  复制绑定码
                </button>
                <button type="button" className="btn" onClick={() => void copy(link, "绑定链接")}>
                  <Icon name="link" size="sm" />
                  复制绑定链接
                </button>
                <button type="button" className="btn" onClick={() => void generate()}>
                  <Icon name="refresh" size="sm" />
                  重新生成
                </button>
              </div>
            </div>
          )
        )}

        <p className="ys-authHint" style={{ marginTop: 16 }}>
          长辈入口：<strong>{window.location.origin}/login/elder</strong>
        </p>
      </div>
    </div>
  );
}
