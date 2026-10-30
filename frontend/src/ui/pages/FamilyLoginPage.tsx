import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import { useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import "./auth.css";

export function FamilyLoginPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { familyLogin } = useAuth();
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [demoCode, setDemoCode] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function requestCode() {
    if (sending || countdown > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.auth.requestFamilyCode(phone);
      setDemoCode(res.demoCode ?? null);
      setCountdown(60);
      toast.push({
        kind: "ok",
        title: "验证码已生成",
        detail: res.demoCode ? `演示验证码：${res.demoCode}` : "请查看短信"
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setSending(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await familyLogin(phone, code, displayName.trim() || undefined);
      toast.push({ kind: "ok", title: "已进入家人端" });
      nav(next.familyLinks.length > 0 ? "/family" : "/family/elders/new", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查验证码");
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
        <p className="ys-authKicker">家人登录</p>
        <h1 className="ys-authTitle">先照顾好自己，再照顾好家人</h1>
        <p className="ys-authSub">用手机号登录，绑定长辈后即可查看照护简报、用药和确认事项。</p>

        <form className="ys-authForm" onSubmit={(event) => void submit(event)}>
          <label className="ys-authField">
            手机号
            <input
              className="input"
              inputMode="tel"
              autoComplete="tel"
              maxLength={11}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="请输入 11 位手机号"
              required
            />
          </label>

          <label className="ys-authField">
            验证码
            <div className="ys-authCodeRow">
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="6 位验证码"
                required
              />
              <button
                type="button"
                className="btn"
                onClick={() => void requestCode()}
                disabled={sending || countdown > 0 || phone.replace(/\D/g, "").length !== 11}
              >
                {sending ? "发送中…" : countdown > 0 ? `${countdown} 秒后重发` : "获取验证码"}
              </button>
            </div>
          </label>

          <label className="ys-authField">
            怎么称呼您
            <input
              className="input"
              maxLength={20}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="可选，首次登录填写，如：小王"
            />
          </label>

          {demoCode && (
            <p className="ys-authHint">演示环境验证码：{demoCode}，输入手机号后可直接登录。</p>
          )}
          {error && <p className="ys-authError">{error}</p>}

          <button type="submit" className="btn btnPrimary ys-authSubmit" disabled={busy}>
            {busy ? "登录中…" : "登录 / 注册"}
          </button>
        </form>

        <div className="ys-authLinks">
          <Link to="/login/elder">我是长辈，用绑定码进入</Link>
          <Link to="/">返回首页</Link>
        </div>
      </div>
    </div>
  );
}
