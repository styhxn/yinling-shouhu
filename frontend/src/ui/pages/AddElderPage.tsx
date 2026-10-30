import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { FamilyInvite } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import "./auth.css";

const RELATIONS = [
  { value: "daughter", label: "女儿" },
  { value: "son", label: "儿子" },
  { value: "spouse", label: "配偶" },
  { value: "grandchild", label: "孙辈" },
  { value: "relative", label: "亲属" },
  { value: "caregiver", label: "照护者" },
  { value: "other", label: "其他" }
];

export function AddElderPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { switchElder } = useAuth();
  const [displayName, setDisplayName] = React.useState("");
  const [relation, setRelation] = React.useState("daughter");
  const [birthYear, setBirthYear] = React.useState("");
  const [gender, setGender] = React.useState<"" | "female" | "male" | "other">("");
  const [elderId, setElderId] = React.useState<string | null>(null);
  const [invite, setInvite] = React.useState<FamilyInvite | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const year = birthYear.trim() ? Number(birthYear.trim()) : undefined;
      const res = await api.auth.createElder({
        displayName: displayName.trim(),
        relation,
        ...(year && Number.isFinite(year) ? { birthYear: year } : {}),
        ...(gender ? { gender } : {})
      });
      setElderId(res.elder.id);
      setInvite(res.invite);
      await switchElder(res.elder.id);
      toast.push({ kind: "ok", title: "长辈档案已创建", detail: "把绑定码交给长辈即可进入。" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!elderId) return;
    try {
      const res = await api.auth.regenerateInvite(elderId);
      setInvite(res.invite);
      toast.push({ kind: "ok", title: "已生成新的绑定码" });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "生成失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ kind: "ok", title: "已复制", detail: label });
    } catch {
      toast.push({ kind: "normal", title: label, detail: text });
    }
  }

  const link = invite ? `${window.location.origin}/login/elder?code=${invite.code}` : "";

  return (
    <div className="ys-authPage">
      <div className="ys-authCard">
        <Link to="/family" className="ys-authBack">
          <Icon name="chevronLeft" size="sm" />
          返回家人概览
        </Link>
        <p className="ys-authKicker">添加长辈</p>
        <h1 className="ys-authTitle">{invite ? "把绑定码交给长辈" : "先建一份长辈档案"}</h1>
        <p className="ys-authSub">
          {invite
            ? "长辈在自己的手机或平板上打开长辈入口，输入绑定码即可进入；绑定后这台设备免密。"
            : "填好姓名和关系，系统会生成一个 15 分钟内有效的 6 位绑定码。"}
        </p>

        {!invite ? (
          <form className="ys-authForm" onSubmit={(event) => void submit(event)}>
            <label className="ys-authField">
              长辈姓名
              <input
                className="input"
                maxLength={20}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：李奶奶"
                required
              />
            </label>
            <label className="ys-authField">
              您和长辈的关系
              <select className="input" value={relation} onChange={(event) => setRelation(event.target.value)}>
                {RELATIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ys-authField">
              出生年份（可选）
              <input
                className="input"
                inputMode="numeric"
                maxLength={4}
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value.replace(/\D/g, ""))}
                placeholder="例如：1948"
              />
            </label>
            <label className="ys-authField">
              性别（可选）
              <select
                className="input"
                value={gender}
                onChange={(event) => setGender(event.target.value as "" | "female" | "male" | "other")}
              >
                <option value="">不填</option>
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="other">其他</option>
              </select>
            </label>
            {error && <p className="ys-authError">{error}</p>}
            <button type="submit" className="btn btnPrimary ys-authSubmit" disabled={busy || !displayName.trim()}>
              {busy ? "创建中…" : "创建并生成绑定码"}
            </button>
          </form>
        ) : (
          <>
            <div className="ys-inviteBox">
              <p className="ys-authField" style={{ margin: 0 }}>
                长辈绑定码
              </p>
              <div className="ys-bindCode" aria-label={`绑定码 ${invite.code}`}>
                {invite.code.split("").map((digit, index) => (
                  <span key={`${digit}_${index}`}>{digit}</span>
                ))}
              </div>
              <p className="ys-authHint">
                有效期至 {new Date(invite.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}，
                一次性使用。过期或丢失可重新生成。
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
                <button type="button" className="btn" onClick={() => void regenerate()}>
                  <Icon name="refresh" size="sm" />
                  重新生成
                </button>
              </div>
            </div>
            <p className="ys-authHint" style={{ marginTop: 16 }}>
              让长辈打开 <strong>{window.location.origin}/login/elder</strong>，输入上面的 6 位数字。
              不需要给长辈设置用户名和密码。
            </p>
            <button type="button" className="btn btnPrimary ys-authSubmit" style={{ marginTop: 16 }} onClick={() => nav("/family")}>
              去照护概览
            </button>
          </>
        )}
      </div>
    </div>
  );
}
