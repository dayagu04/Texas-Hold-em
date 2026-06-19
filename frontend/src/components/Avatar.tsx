/*
 * 复用头像组件。
 * 渲染真实头像 <img>，加载失败（破图 / 404）自动回退到首字母占位。
 * 统一 object-cover object-top + 圆形 + 尺寸 prop，供 SeatCard / ProfilePage /
 * GameSelection / Lobby 共用，避免各处重复 onError 兜底逻辑。
 */
import { useState, useEffect } from "react";

interface Props {
  src?: string | null;
  name?: string | null;
  /** 头像尺寸/边框等额外 class，如 "h-10 w-10 border-2 border-gold/30"。 */
  className?: string;
  /** 首字母占位的字号/底色等额外 class（可选）。 */
  fallbackClassName?: string;
}

export default function Avatar({
  src,
  name,
  className = "h-10 w-10",
  fallbackClassName = "",
}: Props) {
  const [failed, setFailed] = useState(false);

  // src 变化时重置失败态（如上传新头像后）。
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = name?.[0]?.toUpperCase() ?? "?";
  const showImg = src && !failed;

  if (showImg) {
    return (
      <img
        src={src}
        alt={name ?? "头像"}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover object-top ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gold font-bold text-base ${className} ${fallbackClassName}`}
    >
      {initial}
    </div>
  );
}
