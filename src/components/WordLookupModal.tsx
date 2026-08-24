/**
 * WordLookupModal.tsx — 查词面板（模态，韩中互查）
 * 用途：任意页面查词——
 *  · 输入韩语 → 本地词典释义（来源：内置词典）+ 朗读/拼读 + 加入生词本；
 *    本地未收录时自动拉取网络翻译兜底（来源：网络翻译 · MyMemory）。
 *  · 输入中文 → 反向匹配词典候选韩语词（点击即查），同时给出网络翻译。
 *  · 三个常用韩中在线词典直达（Naver 韩中 / Daum / 国立国语院）。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Search, Volume2, BookPlus, Check, ExternalLink, SpellCheck, BookOpen, Loader2, ArrowRight, Globe } from 'lucide-react';
import { lookupWord, lookupChinese, containsHangul } from '@/lib/dictionary';
import { translateText } from '@/lib/translate';
import { speakKorean, canSpeak } from '@/lib/tts';
import { spellText, spellSpeechText, decomposeWord } from '@/lib/spell';
import { DICT_SOURCES } from '@/lib/dicts';
import { addToVocabBook, readVocabBook } from '@/lib/vocab';
import { showToast } from '@/components/Toast';
import type { DictEntry } from '@/data/dictionary';
import { cn } from '@/lib/utils';

/** 翻译来源徽标 */
function SourceBadge({ source }: { source: string }) {
  const isNetwork = source.startsWith('网络');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        isNetwork ? 'bg-honey/15 text-honey' : 'bg-olive/10 text-olive',
      )}
    >
      {isNetwork ? <Globe size={10} /> : <BookOpen size={10} />}
      来源：{source}
    </span>
  );
}

interface Props {
  /** 初始查词（可选；不传则显示搜索框等待输入） */
  initialWord?: string;
  /** 出处例句（韩语）：加入生词本时一并保存 */
  exampleKo?: string;
  onClose: () => void;
}

export default function WordLookupModal({ initialWord = '', exampleKo, onClose }: Props) {
  const [input, setInput] = useState(initialWord);
  const [word, setWord] = useState(initialWord.trim());
  const [zhDraft, setZhDraft] = useState('');
  const [spelling, setSpelling] = useState(false);
  // 网络翻译（本地未命中 / 中文反查时兜底）
  const [netZh, setNetZh] = useState<string | null>(null);
  const [netLoading, setNetLoading] = useState(false);

  // 当前查询是否为中文（中 → 韩 反查）
  const isChineseQuery = useMemo(() => !!word && !containsHangul(word), [word]);
  // 词典命中（本地离线词典；仅韩语查询）
  const entry = useMemo(() => (word && !isChineseQuery ? lookupWord(word) : null), [word, isChineseQuery]);
  // 中文反查候选韩语词
  const candidates = useMemo<DictEntry[]>(() => (isChineseQuery ? lookupChinese(word) : []), [isChineseQuery, word]);
  // 已在生词本？
  const inVocab = useMemo(() => readVocabBook().some((v) => v.ko === word), [word]);
  // 拼读字母序列
  const jamoGroups = useMemo(() => decomposeWord(word), [word]);

  // 词条变化：同步释义草稿 + 按需拉取网络翻译
  useEffect(() => {
    setZhDraft(entry?.zh ?? '');
    setNetZh(null);
    if (!word) return;
    // 本地词典未命中（或中文反查）→ 自动网络翻译兜底
    if (entry) return;
    let cancelled = false;
    setNetLoading(true);
    void translateText(word, isChineseQuery ? 'zh-ko' : 'ko-zh').then((r) => {
      if (cancelled) return;
      setNetLoading(false);
      if (r) {
        setNetZh(r.text);
        if (!isChineseQuery) setZhDraft((d) => d || r.text);
      }
    });
    return () => { cancelled = true; };
  }, [word, entry, isChineseQuery]);

  /** 提交搜索（韩中互查：韩文→词典；中文→反查候选） */
  const doSearch = () => {
    const q = input.trim();
    if (!q) return;
    setWord(q);
    setSpelling(false);
  };

  /** 点击中文反查候选 → 转查该韩语词 */
  const pickCandidate = (ko: string) => {
    setInput(ko);
    setWord(ko);
    setSpelling(false);
  };

  /** 拼读：慢速逐字母朗读 + 展示字母序列 */
  const doSpell = () => {
    setSpelling(true);
    const speech = spellSpeechText(word);
    if (speech && !speakKorean(speech, { rate: 0.7 })) {
      showToast('当前浏览器不支持语音合成');
    }
  };

  /** 加入生词本（带释义草稿与例句） */
  const doAdd = () => {
    const added = addToVocabBook({
      ko: word,
      rom: entry?.rom ?? '',
      zh: zhDraft.trim() || entry?.zh || netZh || '',
      pos: entry?.pos ?? '',
      exampleKo: exampleKo?.trim() || undefined,
    });
    showToast(added ? '已加入生词本' : '生词本中已有该词（例句已更新）');
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(46,42,38,0.4)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-warm bg-paper p-6 shadow-lift"
        initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-ink">
            <BookOpen size={18} className="text-terracotta" /> 查词
            <span className="text-xs font-normal text-ink-muted">韩语 / 中文均可</span>
          </h3>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-ink-muted hover:bg-sand">
            <X size={18} />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="mb-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            placeholder="输入韩语单词或中文释义…"
            className="min-w-0 flex-1 rounded-xl border border-warm bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-terracotta"
          />
          <button
            onClick={doSearch}
            className="flex items-center gap-1 rounded-xl bg-terracotta px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-terracotta-deep"
          >
            <Search size={15} /> 查
          </button>
        </div>

        {word && isChineseQuery && (
          /* ── 中 → 韩 反查结果 ── */
          <div className="space-y-4">
            <div className="rounded-2xl border border-warm bg-base p-4">
              <p className="text-sm text-ink-secondary">
                「<span className="font-medium text-ink">{word}</span>」可能的韩语词：
              </p>
              {candidates.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {candidates.map((c) => (
                    <li key={c.ko}>
                      <button
                        onClick={() => pickCandidate(c.ko)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-warm bg-paper px-3 py-2 text-left transition-colors hover:border-terracotta"
                      >
                        <span className="font-kr text-lg font-bold text-ink">{c.ko}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{c.rom} · {c.zh}</span>
                        <ArrowRight size={14} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-terracotta" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">本地词典未收录该中文释义，可参考下方网络翻译。</p>
              )}
              {/* 中文 → 韩语 网络翻译 */}
              <div className="mt-3 border-t border-warm pt-3">
                {netLoading ? (
                  <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Loader2 size={12} className="animate-spin" /> 正在查询网络翻译…</p>
                ) : netZh ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-ink-secondary">
                      网络译法：<span className="font-kr text-base font-bold text-ink">{netZh}</span><button
                        onClick={() => pickCandidate(netZh)}
                        className="ml-2 text-xs font-medium text-terracotta hover:underline"
                      >
                        查这个词 →
                      </button>
                    </p>
                    <SourceBadge source="网络翻译 · MyMemory" />
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">网络翻译暂不可用，可打开下方在线词典查询。</p>
                )}
              </div>
            </div>
          </div>
        )}

        {word && !isChineseQuery && (
          /* ── 韩 → 中 结果 ── */
          <div className="space-y-4">
            {/* 词条卡 */}
            <div className="rounded-2xl border border-warm bg-base p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-serif text-2xl font-bold text-ink">{word}</p>
                  {entry?.rom && <p className="mt-0.5 text-sm text-ink-muted">{entry.rom}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => { if (!speakKorean(word)) showToast('当前浏览器不支持语音合成'); }}
                    disabled={!canSpeak(word)}
                    title="朗读"
                    className="rounded-full border border-warm bg-paper p-2 text-terracotta transition-colors hover:border-terracotta disabled:opacity-40"
                  >
                    <Volume2 size={16} />
                  </button>
                  <button
                    onClick={doSpell}
                    disabled={jamoGroups.length === 0}
                    title="拼读（逐字母慢读）"
                    className={cn(
                      'rounded-full border p-2 transition-colors disabled:opacity-40',
                      spelling ? 'border-honey bg-honey/15 text-honey' : 'border-warm bg-paper text-honey hover:border-honey',
                    )}
                  >
                    <SpellCheck size={16} />
                  </button>
                </div>
              </div>

              {/* 拼读字母序列 */}
              {spelling && jamoGroups.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-paper px-3 py-2">
                  {jamoGroups.map((g, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      {g.map((j, k) => (
                        <span key={k} className={cn(
                          'rounded-md px-1.5 py-0.5 font-serif text-base font-bold',
                          k === 0 ? 'bg-terracotta-soft text-terracotta' : k === 1 ? 'bg-olive/15 text-olive' : 'bg-honey/15 text-honey',
                        )}>{j}</span>
                      ))}
                      {i < jamoGroups.length - 1 && <span className="mx-1 text-ink-muted">·</span>}
                    </span>
                  ))}
                  <span className="ml-2 text-xs text-ink-muted">{spellText(word)}</span>
                </div>
              )}

              {/* 释义区：本地词典命中 / 网络翻译兜底 */}
              {entry ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    {entry.pos && <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] text-ink-secondary">{entry.pos}</span>}
                    <SourceBadge source="内置词典" />
                  </div>
                  <input
                    value={zhDraft}
                    onChange={(e) => setZhDraft(e.target.value)}
                    placeholder="中文释义"
                    className="mt-2 w-full rounded-lg border border-warm bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-terracotta"
                  />
                </div>
              ) : (
                <div className="mt-3">
                  {netLoading ? (
                    <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Loader2 size={12} className="animate-spin" /> 本地词典未收录，正在查询网络翻译…</p>
                  ) : netZh ? (
                    <div className="space-y-1.5">
                      <p className="text-sm text-ink-secondary">译文：<span className="font-medium text-ink">{netZh}</span></p>
                      <SourceBadge source="网络翻译 · MyMemory" />
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">本地词典与网络翻译均未收录，可手填释义或查看下方在线词典。</p>
                  )}
                  <input
                    value={zhDraft}
                    onChange={(e) => setZhDraft(e.target.value)}
                    placeholder="手填中文释义（可选）"
                    className="mt-2 w-full rounded-lg border border-warm bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-terracotta"
                  />
                </div>
              )}

              {/* 出处例句 */}
              {exampleKo && (
                <p className="mt-2 line-clamp-2 rounded-lg bg-paper px-2.5 py-1.5 text-xs text-ink-secondary">
                  例句：{exampleKo}
                </p>
              )}

              {/* 加入生词本 */}
              <button
                onClick={doAdd}
                disabled={inVocab && !exampleKo}
                className={cn(
                  'mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition-colors',
                  inVocab && !exampleKo
                    ? 'cursor-default bg-olive/10 text-olive'
                    : 'bg-terracotta text-white hover:bg-terracotta-deep',
                )}
              >
                {inVocab && !exampleKo ? <><Check size={15} /> 已在生词本</> : <><BookPlus size={15} /> 加入生词本{exampleKo ? '（含例句）' : ''}</>}
              </button>
            </div>

            {/* 在线词典来源 */}
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">在线词典（新标签页打开）</p>
              <div className="grid grid-cols-3 gap-2">
                {DICT_SOURCES.map((s) => (
                  <a
                    key={s.id}
                    href={s.buildUrl(word)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-xl border border-warm bg-base px-2 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                  >
                    {s.name}
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
