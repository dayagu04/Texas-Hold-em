/*
 * 个人中心页面。
 * 显示当前头像，提供上传功能。
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import * as api from "../api";
import { zhCN } from "../i18n/zh-CN";

export default function ProfilePage() {
  const { name } = useAuth();
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 加载当前头像
    api
      .me()
      .then((res) => setAvatar(res.avatar ?? null))
      .catch(() => setAvatar(null));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("仅支持 PNG 和 JPEG 格式");
      return;
    }

    // 验证文件大小
    if (file.size > 2 * 1024 * 1024) {
      setError("文件大小不能超过 2MB");
      return;
    }

    setError(null);
    setSelectedFile(file);

    // 生成预览
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      const res = await api.uploadAvatar(selectedFile);
      setAvatar(res.avatar);
      setPreviewUrl(null);
      setSelectedFile(null);
    } catch (err: any) {
      setError(err.message ?? "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const currentAvatar = previewUrl ?? avatar;

  return (
    <div className="min-h-screen bg-vignette">
      {/* 顶部栏 */}
      <header className="border-b border-rim/50 bg-base/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1
            className="text-2xl text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.brand}
          </h1>
          <button
            onClick={() => navigate("/lobby")}
            className="rounded-card border border-rim px-3 py-1 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
          >
            返回大厅
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-panel border border-gold/30 bg-elev p-8 shadow-card">
          <h2 className="mb-6 text-2xl font-bold text-text-hi">个人中心</h2>

          {/* 用户名 */}
          <div className="mb-8">
            <div className="text-sm text-text-lo">用户名</div>
            <div className="text-xl font-medium text-text-hi">{name}</div>
          </div>

          {/* 头像区 */}
          <div className="mb-6">
            <div className="mb-3 text-sm text-text-lo">头像</div>
            <div className="flex items-center gap-6">
              {/* 当前头像 */}
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  className="h-24 w-24 rounded-full object-cover object-top border-2 border-gold/30"
                  alt={name ?? "头像"}
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gold text-4xl font-bold text-base">
                  {name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}

              {/* 文件选择 */}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFileSelect}
                  className="mb-2 text-sm text-text-lo"
                  id="avatar-input"
                />
                <div className="text-xs text-text-lo">
                  支持 PNG 和 JPEG，最大 2MB
                </div>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mt-3 text-sm text-danger">{error}</div>
            )}
          </div>

          {/* 上传按钮 */}
          {selectedFile && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-card bg-gold px-6 py-2 font-bold text-base transition hover:bg-gold-soft disabled:opacity-50"
            >
              {uploading ? "上传中..." : "上传头像"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}


