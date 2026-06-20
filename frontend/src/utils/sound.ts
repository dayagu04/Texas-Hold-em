/*
 * 音效系统 - 统一管理游戏音效播放。
 * 支持全局静音开关（localStorage 持久化）。
 * 移动端浏览器需用户首次交互后解锁 AudioContext。
 */

const SOUND_FILES = {
  deal: "/sounds/deal.mp3",
  bet: "/sounds/bet.mp3",
  fold: "/sounds/fold.mp3",
  win: "/sounds/win.mp3",
  yourTurn: "/sounds/your-turn.mp3",
  chat: "/sounds/chat.mp3",
} as const;

type SoundType = keyof typeof SOUND_FILES;

class SoundManager {
  private sounds: Map<SoundType, HTMLAudioElement> = new Map();
  private muted: boolean;
  private unlocked: boolean = false;

  constructor() {
    // 从 localStorage 读取静音状态，默认静音
    this.muted = localStorage.getItem("sound_muted") !== "false";
    this.preloadSounds();
  }

  private preloadSounds() {
    Object.entries(SOUND_FILES).forEach(([key, path]) => {
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.volume = 0.5;
      this.sounds.set(key as SoundType, audio);
    });
  }

  /**
   * 解锁音频（移动端需要用户首次交互后才能播放）
   * 在用户首次点击/操作时调用
   */
  unlock() {
    if (this.unlocked) return;

    // 尝试播放并立即暂停所有音频来解锁 AudioContext
    this.sounds.forEach((audio) => {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {
        // 忽略错误，某些浏览器可能仍然阻止
      });
    });

    this.unlocked = true;
  }

  play(type: SoundType) {
    if (this.muted) return;

    const audio = this.sounds.get(type);
    if (!audio) return;

    // 重置播放位置并播放
    audio.currentTime = 0;
    audio.play().catch(() => {
      // 忽略播放失败（可能未解锁或浏览器限制）
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    localStorage.setItem("sound_muted", String(muted));
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
}

// 单例
export const soundManager = new SoundManager();

// React hook
import { useState, useEffect } from "react";

export function useSoundManager() {
  const [muted, setMuted] = useState(soundManager.isMuted());

  const toggleMute = () => {
    const newMuted = soundManager.toggleMute();
    setMuted(newMuted);
  };

  useEffect(() => {
    // 同步状态（如果其他组件修改了）
    const interval = setInterval(() => {
      setMuted(soundManager.isMuted());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { muted, toggleMute, play: soundManager.play.bind(soundManager) };
}
