import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import "./auth.css";

export function ElderJoinPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { bindElder } = useAuth();
  const [params] = useSearchParams();
  const [code, setCode] = React.useState((params.get("code") ?? "").replace(/\D/g, "").slice(0, 6));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await bindElder(code);
      toast.push({ kind: "ok", title: "已经进入长辈端" });
      nav("/elder", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "绑定码无效，请让家人重新生成");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ys-authPage">
      <div className="ys-authCard">
        <Link to="/" className="ys-authBack">
          <Icon name="chevronLeft" size="sm" />
          返回
        </Link>
        <p className="ys-authKicker">长辈进入</p>
        <h1 className="ys-authTitle">输入家人给的 6 位绑定码</h1>
        <p className="ys-authSub">绑定一次后，这台设备就不用再输账号密码了。</p>

        <form className="ys-authForm" onSubmit={(event) => void submit(event)}>
          <label className="ys-authField">
            绑定码
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="例如：123456"
              style={{ fontSize: 30, letterSpacing: "0.25em", textAlign: "center" }}
              autoFocus
              required
            />
          </label>
          {error && <p className="ys-authError">{error}</p>}
          <button type="submit" className="btn btnPrimary ys-authSubmit" disabled={busy || code.length !== 6}>
            {busy ? "正在进入…" : "进入"}
          </button>
        </form>

        <div className="ys-inviteBox" style={{ marginTop: 20 }}>
          <strong>第一次使用？</strong>
          <ol className="ys-authSteps">
            <li>让家人在“家人端”添加长辈档案。</li>
            <li>家人会得到一个 6 位绑定码，15 分钟内有效。</li>
            <li>在这里输入绑定码即可进入。</li>
          </ol>
        </div>

        <div className="ys-authLinks">
          <Link to="/login/family">我是家人，去登录</Link>
          <Link to="/">返回首页</Link>
        </div>
      </div>
    </div>
  );
}
