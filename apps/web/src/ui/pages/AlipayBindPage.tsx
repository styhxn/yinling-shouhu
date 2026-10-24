import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";

export function AlipayBindPage() {
  const [step, setStep] = React.useState<"intro" | "qr" | "success">("intro");

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="h1">支付宝设备绑定</h1>
          <Link to="/settings" className="btn">
            返回设置
          </Link>
        </div>
        <div className="muted">
          绑定支付宝账号后，可启用支付授权、医保码快速展示等功能。
        </div>
      </div>

      <div className="panel" style={{ minHeight: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        {step === "intro" && (
          <>
            <Icon name="creditCard" size={60} color="var(--primary)" />
            <div style={{ fontSize: 18, fontWeight: "bold" }}>绑定支付宝设备</div>
            <div className="muted" style={{ maxWidth: 300, textAlign: "center" }}>
              请准备好您的手机，打开支付宝 App 准备扫码。
            </div>
            <button className="btn btnPrimary" onClick={() => setStep("qr")}>
              开始绑定
            </button>
          </>
        )}

        {step === "qr" && (
          <>
            <div style={{ width: 200, height: 200, background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ width: "100%", height: "100%", background: "black", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <div style={{ background: "white" }} />
                <div style={{ background: "white" }} />
                <div style={{ background: "white" }} />
                <div style={{ background: "white" }} />
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "white", padding: 5 }}>
                  <div style={{ width: 20, height: 20, background: "#1677ff", borderRadius: 4 }} />
                </div>
              </div>
            </div>
            <div className="muted">请使用支付宝扫一扫</div>
            <button className="btn" onClick={() => setStep("success")}>
              扫码完成
            </button>
          </>
        )}

        {step === "success" && (
          <>
            <Icon name="circleCheck" size={60} color="var(--ok)" />
            <div style={{ fontSize: 18, fontWeight: "bold" }}>绑定成功</div>
            <div className="muted">您的设备已成功绑定支付宝账号：138****8888</div>
            <Link to="/settings" className="btn btnPrimary">
              完成
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
