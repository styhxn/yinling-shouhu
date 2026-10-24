import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { useToast } from "../state/toast.js";

export function SafetyHomePage() {
  const toast = useToast();

  return (
    <div className="yl-page">
      <section className="yl-pageHeader">
        <div>
          <h1>安心守护</h1>
          <p>遇到可疑信息、走失或紧急情况，先别慌，按下面的步骤来。</p>
        </div>
      </section>

      <div className="yl-cardGrid">
        <Link to="/elder/safety/scam" className="yl-featureCard">
          <span className="yl-featureIcon yl-featureIcon--danger">
            <Icon name="shieldCheck" size="lg" />
          </span>
          <strong>可疑信息鉴定</strong>
          <p>文字、短信截图、链接都可以帮您看看。</p>
          <span className="yl-cardLink">去鉴定 <Icon name="arrowRight" size="sm" /></span>
        </Link>

        <div className="yl-featureCard yl-featureCard--muted">
          <span className="yl-featureIcon">
            <Icon name="mapPin" size="lg" />
          </span>
          <strong>位置守护 <span className="yl-badge">W3</span></strong>
          <p>电子围栏、越界提醒、一键寻人海报将在 W3 上线。</p>
          <button
            type="button"
            className="yl-linkBtn"
            onClick={() =>
              toast.push({
                kind: "normal",
                title: "现在可以这样做",
                detail: "立即拨打 110 报警，并联系家属/社区工作人员。"
              })
            }
          >
            查看走失处理建议
          </button>
        </div>

        <div className="yl-featureCard yl-featureCard--muted">
          <span className="yl-featureIcon yl-featureIcon--danger">
            <Icon name="alertTriangle" size="lg" />
          </span>
          <strong>紧急呼救</strong>
          <p>本系统不会自动拨号。紧急情况请直接拨打 120/110，并联系家属。</p>
          <div className="yl-inlineActions">
            <a className="btn btnDanger" href="tel:120">
              <Icon name="phone" size="sm" /> 拨打 120
            </a>
            <a className="btn" href="tel:110">
              <Icon name="phone" size="sm" /> 拨打 110
            </a>
          </div>
        </div>
      </div>

      <section className="yl-tipPanel">
        <Icon name="shield" size="lg" />
        <div>
          <strong>记住三句话</strong>
          <p>不转账、不点陌生链接、不把验证码告诉任何人。拿不准就先问家人，或拨打 96110。</p>
        </div>
      </section>
    </div>
  );
}
