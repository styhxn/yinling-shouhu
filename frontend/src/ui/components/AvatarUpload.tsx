import React from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { useApi } from "../state/api.js";
import { useToast } from "../state/toast.js";

type AvatarUploadProps = {
  currentAvatar?: string | undefined;
  onSuccess: (newUrl: string) => void;
};

export function AvatarUpload({ currentAvatar, onSuccess }: AvatarUploadProps) {
  const api = useApi();
  const toast = useToast();
  const [image, setImage] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [showCropper, setShowCropper] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const onCropComplete = React.useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validation
      if (file.size > 5 * 1024 * 1024) {
        toast.push({ kind: "danger", title: "文件过大", detail: "图片大小不能超过 5MB" });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.push({ kind: "danger", title: "格式错误", detail: "请选择图片文件" });
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImage(reader.result as string);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<Blob | null> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.9);
    });
  };

  const handleUpload = async () => {
    if (!image || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(image, croppedAreaPixels);
      if (!blob) throw new Error("裁剪失败");

      const file = new File([blob], "avatar.webp", { type: "image/webp" });
      const res = await api.uploadAvatar(file);
      onSuccess(res.avatarUrl);
      toast.push({ kind: "ok", title: "头像已更新" });
      setShowCropper(false);
      setImage(null);
    } catch (err) {
      toast.push({ kind: "danger", title: "上传失败", detail: err instanceof Error ? err.message : "未知错误" });
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) {
        const fakeEvent = { target: { files: [file] } } as any;
        handleFileChange(fakeEvent);
      }
    }
  };

  return (
    <div className="avatarUploadContainer">
      <div 
        className="avatarPreviewWrapper" 
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {currentAvatar ? (
          <img src={currentAvatar} alt="头像" className="userAvatarLarge" />
        ) : (
          <div className="userAvatarLarge placeholder" />
        )}
        <div className="avatarOverlay">
          <span>更换头像</span>
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: "none" }}
      />

      {showCropper && image && (
        <div className="modalOverlay">
          <div className="modalContent cropperModal">
            <h2 className="h2">编辑头像</h2>
            <div className="cropperContainer">
              <Cropper
                image={image}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="cropperControls">
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="zoomRange"
              />
              <div className="row" style={{ gap: 10 }}>
                <button className="btn" onClick={() => setShowCropper(false)} disabled={uploading}>
                  取消
                </button>
                <button className="btn btnPrimary" onClick={handleUpload} disabled={uploading}>
                  {uploading ? "正在上传..." : "确认上传"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .avatarUploadContainer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .avatarPreviewWrapper {
          position: relative;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          overflow: hidden;
          cursor: pointer;
          border: 2px solid var(--panel-border);
          box-shadow: var(--shadow);
        }
        .userAvatarLarge {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .userAvatarLarge.placeholder {
          background: var(--panel);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .avatarOverlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
          color: white;
          font-size: 14px;
        }
        .avatarPreviewWrapper:hover .avatarOverlay {
          opacity: 1;
        }
        .cropperModal {
          width: 90vw;
          max-width: 500px;
          padding: 24px;
        }
        .cropperContainer {
          position: relative;
          width: 100%;
          height: 300px;
          background: #333;
          margin: 16px 0;
          border-radius: 8px;
          overflow: hidden;
        }
        .cropperControls {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
        }
        .zoomRange {
          width: 100%;
          accent-color: var(--primary);
        }
      `}</style>
    </div>
  );
}
