/**
 * tts.ts — Web Speech API 韩语发音封装
 * 用途：统一的 TTS 入口，自动挑选韩语 voice；支持用户音色偏好（localStorage `hjy:review-prefs`）；
 * 不支持时优雅降级（返回 false / 触发 onUnsupported）。
 */

export type VoiceGender = 'female' | 'male';

/** 音色偏好（localStorage `hjy:review-prefs`，与设置页/复习页共用同一 key） */
interface VoicePrefs {
  voiceGender?: VoiceGender;
  voiceName?: string;
  /** 旧字段别名：设置页 profile.md 约定为 voice: 'female' | 'male' */
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

/** 是否支持语音合成 */
export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 女声语音名启发式关键字（微软 Heami / Sun-Hi、谷歌女声等） */
const FEMALE_HINTS = ['heami', 'sun-hi', 'sunhi', 'female', 'yuna', 'seoyeon', 'jiwoo', 'woman'];
/** 男声语音名启发式关键字（微软 InJoon 等） */
const MALE_HINTS = ['injoon', 'in-joon', 'male', 'hyunsu', 'bongjin', 'man'];

/** 按名称启发式判断语音性别 */
function guessGender(name: string): VoiceGender | null {
  const n = name.toLowerCase();
  if (FEMALE_HINTS.some((h) => n.includes(h))) return 'female';
  if (MALE_HINTS.some((h) => n.includes(h))) return 'male';
  return null;
}

/** 列出全部韩语语音（供设置页展示可选音色） */
export function listKoreanVoices(): SpeechSynthesisVoice[] {
  if (!isTtsSupported()) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('ko'));
}

/** 按偏好挑选语音 + pitch 补偿 */
function resolveVoice(): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const koVoices = listKoreanVoices();
  if (!koVoices.length) return { voice: null, pitch: 1 };

  const prefs = readVoicePrefs();
  // 1. voiceName 精确匹配（用户在设置页手动选中的语音）
  if (prefs.voiceName) {
    const exact = koVoices.find((v) => v.name === prefs.voiceName);
    if (exact) return { voice: exact, pitch: 1 };
  }
  // 2. 按性别启发式匹配
  const gender: VoiceGender | undefined = prefs.voiceGender ?? prefs.voice;
  if (gender) {
    const hit = koVoices.find((v) => guessGender(v.name) === gender);
    if (hit) return { voice: hit, pitch: 1 };
    // 匹配不到目标性别：用首个 ko 语音 + pitch 补偿（女声略高 / 男声略低）
    return { voice: koVoices[0], pitch: gender === 'female' ? 1.1 : 0.8 };
  }
  // 3. 默认：优先 ko-KR 本地语音，否则首个 ko 语音
  return { voice: koVoices.find((v) => v.lang === 'ko-KR') ?? koVoices[0], pitch: 1 };
}

let cachedVoice: SpeechSynthesisVoice | null = null;
let cachedPitch = 1;

function refreshCache() {
  const resolved = resolveVoice();
  cachedVoice = resolved.voice;
  cachedPitch = resolved.pitch;
}

// 部分浏览器异步加载 voice 列表，加载完成后刷新缓存
if (isTtsSupported()) {
  window.speechSynthesis.onvoiceschanged = () => refreshCache();
}

export interface SpeakOptions {
  /** 语速 0.6–1.2，默认 1（常速），0.7 为慢速 */
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * 朗读韩语文本（自动应用用户的音色偏好）。
 * @returns 是否成功发起朗读；不支持 TTS 时返回 false，调用方应给出降级提示。
 */
export function speakKorean(text: string, options: SpeakOptions = {}): boolean {
  if (!isTtsSupported()) return false;
  const { rate = 1, onStart, onEnd } = options;

  // 取消上一次朗读，避免排队叠加
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = Math.min(1.2, Math.max(0.6, rate));
  // 每次朗读重新解析偏好（设置页改完音色立即生效），语音列表为空时回退缓存
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

/** 试听指定性别音色（设置页「试听」按钮用） */
export function previewVoice(gender: VoiceGender): boolean {
  if (!isTtsSupported()) return false;
  window.speechSynthesis.cancel();
  const koVoices = listKoreanVoices();
  const hit = koVoices.find((v) => guessGender(v.name) === gender) ?? koVoices[0] ?? null;

  const utter = new SpeechSynthesisUtterance('안녕하세요, 만나서 반갑습니다.');
  utter.lang = 'ko-KR';
  if (hit) utter.voice = hit;
  // 匹配不到目标性别时同样用 pitch 补偿
  if (!hit || guessGender(hit.name) !== gender) {
    utter.pitch = gender === 'female' ? 1.1 : 0.8;
  }
  window.speechSynthesis.speak(utter);
  return true;
}

/** 停止当前朗读（组件卸载时调用） */
export function stopSpeaking(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel();
}
