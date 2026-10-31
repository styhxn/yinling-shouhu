import React from "react";
import { Icon } from "./Icon.js";
import { RATE_STEPS, useA11y } from "../state/a11y.js";
import {
  getTtsVoiceName,
  listTtsVoices,
  onTtsError,
  setTtsVoice,
  ttsErrorZh,
  type TtsErrorCode
} from "../voice/tts.js";

/**
 * 无障碍工具条
 * -----------------------------------------------------------------------------
 * 固定在左下角的常驻控件，长辈不需要进设置页即可：
 *   放大 / 缩小字号、开关语音播报、调节语速、朗读当前页面。
 * 所有按钮触控区 ≥44px，字号与配色沿用「水韵江苏」纸感风格。
 */
export function A11yDock() {
  const {
    fontScale,
    canEnlarge,
    canShrink,
    enlarge,
    shrink,
    voiceEnabled,
    toggleVoice,
    rate,
    setRate,
    readPage,
    say,
    ttsSupported
  } = useA11y();

  const [collapsed, setCollapsed] = React.useState(true);
  const [ttsError, setTtsError] = React.useState<TtsErrorCode | null>(null);
  const [voiceOptions, setVoiceOptions] = React.useState<SpeechSynthesisVoice[]>(() =>
    listTtsVoices()
  );
  const [voiceName, setVoiceName] = React.useState<string>(() => getTtsVoiceName() ?? "");

  React.useEffect(() => onTtsError(setTtsError), []);

  React.useEffect(() => {
    const open = () => setCollapsed(false);
    window.addEventListener("yl:open-a11y", open);
    return () => window.removeEventListener("yl:open-a11y", open);
  }, []);

  React.useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => setVoiceOptions(listTtsVoices());
    refresh();
    try {
      synth.addEventListener("voiceschanged", refresh);
      return () => synth.removeEventListener("voiceschanged", refresh);
    } catch {
      return;
    }
  }, []);

  if (collapsed) {
    return (
      <div className="yl-a11y yl-a11y--collapsed" role="region" aria-label="无障碍工具">
        <button
          type="button"
          className="yl-a11y__reopen"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
        >
          <Icon name="settings" size="sm" />
          无障碍
        </button>
      </div>
    );
  }

  return (
    <div className="yl-a11y" role="region" aria-label="无障碍工具">
      <div className="yl-a11y__row">
        <button
          type="button"
          className="yl-a11y__btn"
          onClick={shrink}
          disabled={!canShrink}
          aria-label="缩小字号"
        >
          <span className="yl-a11y__glyph yl-a11y__glyph--sm" aria-hidden="true">
            A
          </span>
          <span className="yl-a11y__label">缩小</span>
        </button>
        <span className="yl-a11y__value" aria-live="polite">
          {Math.round(fontScale * 100)}%
        </span>
        <button
          type="button"
          className="yl-a11y__btn"
          onClick={enlarge}
          disabled={!canEnlarge}
          aria-label="放大字号"
        >
          <span className="yl-a11y__glyph yl-a11y__glyph--lg" aria-hidden="true">
            A
          </span>
          <span className="yl-a11y__label">放大</span>
        </button>
        <button
          type="button"
          className="yl-a11y__close"
          onClick={() => setCollapsed(true)}
          aria-label="收起无障碍工具"
        >
          <Icon name="close" size="sm" />
        </button>
      </div>

      <div className="yl-a11y__row">
        <button
          type="button"
          className={voiceEnabled ? "yl-a11y__btn yl-a11y__btn--on" : "yl-a11y__btn"}
          onClick={toggleVoice}
          aria-pressed={voiceEnabled}
          aria-label={voiceEnabled ? "关闭语音播报" : "打开语音播报"}
        >
          <Icon name="volume" size="sm" />
          <span className="yl-a11y__label">语音播报{voiceEnabled ? "开" : "关"}</span>
        </button>
        <button
          type="button"
          className="yl-a11y__btn"
          onClick={() => {
            setTtsError(null);
            readPage();
          }}
          aria-label="朗读当前页面"
        >
          <Icon name="bookOpen" size="sm" />
          <span className="yl-a11y__label">朗读本页</span>
        </button>
      </div>

      <div className="yl-a11y__row yl-a11y__row--compact">
        <span className="yl-a11y__hint">语速</span>
        {RATE_STEPS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={
              Math.abs(rate - item.value) < 0.02
                ? "yl-a11y__chip yl-a11y__chip--on"
                : "yl-a11y__chip"
            }
            onClick={() => setRate(item.value)}
            aria-pressed={Math.abs(rate - item.value) < 0.02}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="yl-a11y__row yl-a11y__row--compact">
        <span className="yl-a11y__hint">声音</span>
        <select
          className="yl-a11y__select"
          value={voiceName}
          aria-label="选择语音播报声音"
          onChange={(event) => {
            const next = event.target.value;
            setVoiceName(next);
            setTtsVoice(next || null);
            setTtsError(null);
            if (ttsSupported) {
              say(next ? "您好，我是银龄守护，这是新的声音。" : "已恢复系统默认声音。");
            }
          }}
        >
          <option value="">系统默认</option>
          {voiceOptions.map((voice) => (
            <option key={`${voice.name}_${voice.lang}`} value={voice.name}>
              {voice.name}（{voice.lang}）
            </option>
          ))}
        </select>
      </div>

      {!ttsSupported ? (
        <p className="yl-a11y__warn">当前浏览器不支持语音播报，建议使用 Chrome 或 Edge。</p>
      ) : ttsError ? (
        <p className="yl-a11y__warn">{ttsErrorZh(ttsError)}</p>
      ) : null}
    </div>
  );
}
