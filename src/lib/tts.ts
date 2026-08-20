/**
 * tts.ts — 韩语发音统一入口（双引擎）
 * ------------------------------------
 * 引擎一（首选）：预生成音频。内置词库/每日一句/发音练习句/40音 的音频已用
 *   标准韩语 TTS（女声 ko-KR-SunHiNeural / 男声 ko-KR-InJoonNeural）提前生成为 mp3，
 *   任何设备/浏览器（含不支持语音合成的移动端浏览器、鸿蒙设备）都能播放，
 *   且男女声在所有设备上表现完全一致。
 * 引擎二（兜底）：Web Speech API speechSynthesis，用于用户动态内容
 *   （语料划词、40音拼合等未预生成文本）。不支持时优雅降级。
 * 音色偏好：localStorage `hjy:review-prefs` 的 voiceGender（female/male）。
 */
import { TEXT_TO_AUDIO_KEY } from '@/data/audioManifest';

export type VoiceGender = 'female' | 'male';

/** 音色偏好（localStorage `hjy:review-prefs`，与设置页/复习页共用同一 key） */
interface VoicePrefs {
  voiceGender?: VoiceGender;
  voiceName?: string;
  /** 旧字段别名 */
  voice?: VoiceGender;
}

const PREFS_KEY = 'hjy:review-prefs';

/** 读取音色偏好（解析失败时返回空对象） */
function readVoicePrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VoicePrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 当前音色偏好（默认清亮女声） */
export function getPreferredGender(): VoiceGender {
  const p = readVoicePrefs();
  return p.voiceGender ?? p.voice ?? 'female';
}

/** 浏览器是否支持语音合成（仅影响动态内容兜底） */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 兼容旧调用：语音合成支持检测 */
export const isTtsSupported = isSpeechSynthesisSupported;

/** 某段文本是否有预生成音频 */
export function hasPregeneratedAudio(text: string): boolean {
  return text.trim() in TEXT_TO_AUDIO_KEY;
}

/** 综合判断：这段文本能不能发音（有预生成音频或支持语音合成即可） */
export function canSpeak(text: string): boolean {
  return hasPregeneratedAudio(text) || isSpeechSynthesisSupported();
}

/* ---------------- 预生成音频播放 ---------------- */

/** 全局当前播放的 Audio 实例（用于停止/防叠加） */
let currentAudio: HTMLAudioElement | null = null;

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

/**
 * 播放预生成音频。
 * @returns true=已发起播放；false=无该文本的预生成音频
 */
function playPregenerated(text: string, rate: number, onStart?: () => void, onEnd?: () => void): boolean {
  const key = TEXT_TO_AUDIO_KEY[text.trim()];
  if (!key) return false;
  stopCurrentAudio();
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();

  const gender = getPreferredGender();
  const audio = new Audio(`/audio/${gender}/${key}.mp3`);
  // 慢速朗读用 playbackRate 实现（同一份音频，0.7 倍速）
  audio.playbackRate = Math.min(1.2, Math.max(0.5, rate));
  audio.preload = 'auto';
  currentAudio = audio;

  let started = false;
  audio.onplaying = () => { started = true; onStart?.(); };
  audio.onended = () => { if (currentAudio === audio) currentAudio = null; onEnd?.(); };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    // 音频文件缺失/解码失败时回退语音合成
    if (!started) speakWithSynthesis(text, rate, onStart, onEnd);
    else onEnd?.();
  };
  audio.play().catch(() => {
    // 自动播放策略拦截等：回退语音合成
    if (currentAudio === audio) currentAudio = null;
    speakWithSynthesis(text, rate, onStart, onEnd);
  });
  return true;
}

/* ---------------- Web Speech API 兜底 ---------------- */

const FEMALE_HINTS = ['heami', 'sun-hi', 'sunhi', 'female', 'yuna', 'seoyeon', 'jiwoo', 'woman'];
const MALE_HINTS = ['injoon', 'in-joon', 'male', 'hyunsu', 'bongjin', 'man'];

function guessGender(name: string): VoiceGender | null {
  const n = name.toLowerCase();
  if (FEMALE_HINTS.some((h) => n.includes(h))) return 'female';
  if (MALE_HINTS.some((h) => n.includes(h))) return 'male';
  return null;
}

/** 列出全部韩语语音（供设置页展示可选音色） */
export function listKoreanVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('ko'));
}

/** 按偏好挑选合成语音 + pitch 补偿（性别匹配不到时以音高模拟） */
function resolveVoice(): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const koVoices = listKoreanVoices();
  if (!koVoices.length) return { voice: null, pitch: 1 };

  const prefs = readVoicePrefs();
  if (prefs.voiceName) {
    const exact = koVoices.find((v) => v.name === prefs.voiceName);
    if (exact) return { voice: exact, pitch: 1 };
  }
  const gender: VoiceGender = prefs.voiceGender ?? prefs.voice ?? 'female';
  const hit = koVoices.find((v) => guessGender(v.name) === gender);
  if (hit) return { voice: hit, pitch: 1 };
  return { voice: koVoices.find((v) => v.lang === 'ko-KR') ?? koVoices[0], pitch: gender === 'female' ? 1.1 : 0.8 };
}

let cachedVoice: SpeechSynthesisVoice | null = null;
let cachedPitch = 1;

if (isSpeechSynthesisSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    const r = resolveVoice();
    cachedVoice = r.voice;
    cachedPitch = r.pitch;
  };
}

/** 语音合成朗读（兜底引擎） */
function speakWithSynthesis(text: string, rate: number, onStart?: () => void, onEnd?: () => void): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = Math.min(1.2, Math.max(0.6, rate));
  const resolved = resolveVoice();
  const voice = resolved.voice ?? cachedVoice;
  if (voice) utter.voice = voice;
  utter.pitch = resolved.voice ? resolved.pitch : cachedPitch;

  utter.onstart = () => onStart?.();
  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utter);
  return true;
}

/* ---------------- 统一对外 API ---------------- */

export interface SpeakOptions {
  /** 语速 0.6–1.2，默认 1（常速），0.7 为慢速 */
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * 朗读韩语文本：优先预生成音频（全平台一致男女声），无则语音合成兜底。
 * @returns 是否成功发起朗读；两者皆不可用时返回 false（调用方给降级提示）。
 */
export function speakKorean(text: string, options: SpeakOptions = {}): boolean {
  const { rate = 1, onStart, onEnd } = options;
  if (hasPregeneratedAudio(text)) {
    return playPregenerated(text, rate, onStart, onEnd);
  }
  stopCurrentAudio();
  return speakWithSynthesis(text, rate, onStart, onEnd);
}

/** 试听指定性别音色（设置页「试听」按钮）：播放预生成示例句，全平台一致 */
export function previewVoice(gender: VoiceGender): boolean {
  const sample = '안녕하세요, 만나서 반갑습니다.';
  const key = TEXT_TO_AUDIO_KEY[sample];
  if (key) {
    stopCurrentAudio();
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    const audio = new Audio(`/audio/${gender}/${key}.mp3`);
    currentAudio = audio;
    audio.onended = () => { if (currentAudio === audio) currentAudio = null; };
    audio.play().catch(() => speakWithSynthesisGender(gender));
    return true;
  }
  return speakWithSynthesisGender(gender);
}

/** 语音合成试听（预生成缺失时的兜底） */
function speakWithSynthesisGender(gender: VoiceGender): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const koVoices = listKoreanVoices();
  const hit = koVoices.find((v) => guessGender(v.name) === gender) ?? koVoices[0] ?? null;
  const utter = new SpeechSynthesisUtterance('안녕하세요, 만나서 반갑습니다.');
  utter.lang = 'ko-KR';
  if (hit) utter.voice = hit;
  if (!hit || guessGender(hit.name) !== gender) {
    utter.pitch = gender === 'female' ? 1.1 : 0.8;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return true;
}

/** 停止当前朗读（组件卸载时调用） */
export function stopSpeaking(): void {
  stopCurrentAudio();
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
