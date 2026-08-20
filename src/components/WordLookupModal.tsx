/**
 * WordLookupModal.tsx — 查词面板（模态）
 * 用途：任意页面查韩语单词——本地词典释义 + 朗读/拼读 + 加入生词本（可带例句）
 * + 三个常用韩中在线词典直达（Naver 韩中 / Daum / 国立国语院）。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Search, Volume2, BookPlus, Check, ExternalLink, SpellCheck, BookOpen } from 'lucide-react';
import { lookupWord, containsHangul } from '@/lib/dictionary';
import { speakKorean, canSpeak } from '@/lib/tts';
import { spellText, spellSpeechText, decomposeWord } from '@/lib/spell';
import { DICT_SOURCES } from '@/lib/dicts';
import { addToVocabBook, readVocabBook } from '@/lib/vocab';
import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

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

  // 词典命中（本地离线词典）
  const entry = useMemo(() => (word ? lookupWord(word) : null), [word]);
  // 已在生词本？
  const inVocab = useMemo(() => readVocabBook().some((v) => v.ko === word), [word]);
  // 拼读字母序列
  const jamoGroups = useMemo(() => decomposeWord(word), [word]);

  // 初始词条目变化时同步释义草稿
  useEffect(() => {
    setZhDraft(entry?.zh ?? '');
  }, [entry]);

  /** 提交搜索 */
  const doSearch = () => {
    const q = input.trim();
    if (!q) return;
    if (!containsHangul(q)) {
      showToast('请输入韩语单词');
      return;
    }
    setWord(q);
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
      zh: zhDraft.trim() || entry?.zh || '',
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
        className="w-full max-w-md rounded-3xl border border-warm bg-paper p-6 shadow-lift"
        initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-ink">
            <BookOpen size={18} className="text-terracotta" /> 查词
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
            placeholder="输入韩语单词…"
            className="min-w-0 flex-1 rounded-xl border border-warm bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-terracotta"
          />
          <button
            onClick={doSearch}
            className="flex items-center gap-1 rounded-xl bg-terracotta px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-terracotta-deep"
          >
            <Search size={15} /> 查
          </button>
        </div>

        {word && (
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

              {/* 释义（可编辑后入生词本） */}
              {entry ? (
                <div className="mt-3">
                  {entry.pos && <span className="mr-2 rounded-full bg-sand px-2 py-0.5 text-[11px] text-ink-secondary">{entry.pos}</span>}
                  <input
                    value={zhDraft}
                    onChange={(e) => setZhDraft(e.target.value)}
                    placeholder="中文释义"
                    className="mt-2 w-full rounded-lg border border-warm bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-terracotta"
                  />
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-xs text-ink-muted">本地词典未收录，可手填释义或查看下方在线词典。</p>
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
