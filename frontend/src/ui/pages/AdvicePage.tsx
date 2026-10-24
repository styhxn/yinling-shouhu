import React from "react";

export function AdvicePage() {
  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">智能医嘱</h1>
        <div className="muted">根据健康数据与日常记录生成风险分级与个性化建议，并支持语音播报。</div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <div className="cardTitle">今日风险</div>
            <div className="pillValue">待评估</div>
          </div>
          <div className="cardDesc">展示：低/中/高风险，以及对应就医分级提醒。</div>
        </div>
        <div className="card">
          <div className="cardHeader">
            <div className="cardTitle">建议卡片</div>
            <div className="pillValue">待生成</div>
          </div>
          <div className="cardDesc">展示：用药、生活习惯、饮食调理等可语音播报的建议。</div>
        </div>
      </div>
    </div>
  );
}
