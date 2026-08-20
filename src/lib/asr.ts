/**
 * asr.ts — 浏览器端韩语语音识别（Whisper via transformers.js）
 * 用途：语料中心 MP3 上传后本地转写文稿，无需服务器、保护隐私。
 * 模型：onnx-community/whisper-base（WASM q8 量化，约 80MB，首次使用自动下载并缓存）。
 */
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// 使用浏览器内 WASM 后端；模型缓存到 Cache Storage / IndexedDB
env.allowLocalModels = false;

/** 识别出的原始片段（Whisper chunk 级时间戳） */
export interface AsrChunk {
  text: string;
  /** [开始秒, 结束秒]（结束可能为 null） */
  timestamp: [number, number | null];
}

export type AsrProgress =
  | { stage: 'download'; percent: number }
  | { stage: 'decode' }
  | { stage: 'transcribe'; percent: number };

let pipePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

const MODEL_ID = 'onnx-community/whisper-base';

/** 模型源候选：HuggingFace 官方 → hf-mirror 镜像（按序探测，5s 超时自动切换） */
const HOST_CANDIDATES: { base: string; template?: string; probe: string; dtype: 'q8' }[] = [
  { base: 'https://huggingface.co', probe: `https://huggingface.co/${MODEL_ID}/resolve/main/config.json`, dtype: 'q8' },
  { base: 'https://hf-mirror.com', probe: `https://hf-mirror.com/${MODEL_ID}/resolve/main/config.json`, dtype: 'q8' },
];

/** 创建一次管线加载 Promise */
function loadPipeline(host: (typeof HOST_CANDIDATES)[number], onProgress?: (p: AsrProgress) => void) {
  env.remoteHost = host.base;
  if (host.template) env.remotePathTemplate = host.template;
  else env.remotePathTemplate = '{model}/resolve/{revision}';
  return pipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: host.dtype,
    device: 'wasm',
    progress_callback: (info: { status?: string; progress?: number }) => {
      if (info.status === 'progress' && typeof info.progress === 'number') {
        onProgress?.({ stage: 'download', percent: Math.round(info.progress) });
      }
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
}

/** 探测模型源可达性（5s 超时） */
async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 加载（并复用）ASR 管线：按序探测 HuggingFace / hf-mirror，用第一个可达源 */
async function getPipeline(onProgress?: (p: AsrProgress) => void) {
  if (!pipePromise) {
    pipePromise = (async () => {
      for (const host of HOST_CANDIDATES) {
        if (await probe(host.probe)) return loadPipeline(host, onProgress);
        console.warn(`[asr] 模型源不可达，尝试下一个：${host.base}`);
      }
      throw new Error('所有模型源均不可达，请检查网络后重试');
    })();
    // 失败后允许重试
    pipePromise.catch(() => { pipePromise = null; });
  }
  return pipePromise;
}

/**
 * 转写音频 Blob（韩语）。
 * @param blob 音频文件（mp3/m4a/wav…）
 * @param onProgress 进度回调（下载/解码/转写）
 * @returns 带时间戳的原始片段数组
 */
export async function transcribeKorean(
  blob: Blob,
  onProgress?: (p: AsrProgress) => void,
): Promise<AsrChunk[]> {
  onProgress?.({ stage: 'decode' });
  // 统一解码为 16kHz 单声道 Float32（Whisper 输入要求）
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('当前浏览器不支持音频解码');
  const ctx = new Ctx({ sampleRate: 16000 });
  let pcm: Float32Array;
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    pcm = buf.getChannelData(0);
  } finally {
    await ctx.close().catch(() => {});
  }

  const asr = await getPipeline(onProgress);
  onProgress?.({ stage: 'transcribe', percent: 0 });
  const out = await asr(pcm, {
    language: 'korean',
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  onProgress?.({ stage: 'transcribe', percent: 100 });

  const chunks = (out as { chunks?: { text: string; timestamp: [number, number | null] }[] }).chunks ?? [];
  return chunks
    .map((c) => ({ text: c.text.trim(), timestamp: c.timestamp }))
    .filter((c) => c.text.length > 0);
}
