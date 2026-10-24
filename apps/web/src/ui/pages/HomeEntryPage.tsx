import React from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../state/mode.js";
import { Icon } from "../components/Icon.js";

export function HomeEntryPage() {
  const { setMode } = useMode();
  const nav = useNavigate();

  const selectMode = (m: "elder" | "adult" | "child") => {
    setMode(m);
    if (m === "elder") nav("/home/senior");
    else if (m === "adult") nav("/home/adult");
    else nav("/home/child");
  };

  return (
    <div className="entryContainer">
      <div className="entryHeader">
        <div className="entryLogo">
          <div className="entryLogoInner" />
        </div>
        <h1 className="entryTitle">智伴银龄</h1>
        <p className="entrySubtitle">具身智能生活陪伴系统</p>
      </div>

      <div className="entryModes">
        <h2 className="entryModesTitle">选择您的模式</h2>
        
        <div className="entryModesGrid">
          <button
            className="modeCard modeCard--elder"
            onClick={() => selectMode("elder")}
            aria-label="选择长辈模式"
          >
            <div className="modeIcon modeIcon--elder" aria-hidden="true">
              <Icon name="user" />
            </div>
            <div className="modeContent">
              <div className="cardTitle">长辈模式</div>
              <div className="cardDesc">大字号 · 高对比度 · 语音优先</div>
            </div>
            <div className="modeArrow">
              <Icon name="arrowRight" strokeWidth={2.5} />
            </div>
          </button>

          <button
            className="modeCard modeCard--adult"
            onClick={() => selectMode("adult")}
            aria-label="选择成人模式"
          >
            <div className="modeIcon modeIcon--adult" aria-hidden="true">
              <Icon name="layoutGrid" />
            </div>
            <div className="modeContent">
              <div className="cardTitle">成人模式</div>
              <div className="cardDesc">全功能 · 数据看板 · 设备管理</div>
            </div>
            <div className="modeArrow">
              <Icon name="arrowRight" strokeWidth={2.5} />
            </div>
          </button>

          <button
            className="modeCard modeCard--child"
            onClick={() => selectMode("child")}
            aria-label="选择儿童模式"
          >
            <div className="modeIcon modeIcon--child" aria-hidden="true">
              <Icon name="smile" />
            </div>
            <div className="modeContent">
              <div className="cardTitle">儿童模式</div>
              <div className="cardDesc">趣味交互 · 学习助手 · 护眼色彩</div>
            </div>
            <div className="modeArrow">
              <Icon name="arrowRight" strokeWidth={2.5} />
            </div>
          </button>
        </div>
      </div>

      <div className="entryFooter">
        <div className="entryFeatures">
          <div className="entryFeature">
            <div className="entryFeatureIcon">
              <Icon name="activity" />
            </div>
            <span>健康监测</span>
          </div>
          <div className="entryFeature">
            <div className="entryFeatureIcon">
              <Icon name="shield" />
            </div>
            <span>安全保障</span>
          </div>
          <div className="entryFeature">
            <div className="entryFeatureIcon">
              <Icon name="message" />
            </div>
            <span>智能陪伴</span>
          </div>
        </div>
      </div>
    </div>
  );
}
