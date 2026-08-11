/**
 * sentences.ts — 每日一句语料（首页使用）
 * 每句含：韩语原文、罗马音、中文释义、单词拆解。
 */

export interface SentenceWord {
  word: string;   // 韩语单词
  pos: string;    // 词性
  meaning: string; // 中文释义
}

export interface DailySentence {
  korean: string;
  romanization: string;
  chinese: string;
  words: SentenceWord[];
}

export const DAILY_SENTENCES: DailySentence[] = [
  {
    korean: '천천히 가도 괜찮아, 멈추지만 않는다면.',
    romanization: 'cheon-cheon-hi ga-do gwaen-chan-a, meom-chu-ji-man an-neun-da-myeon.',
    chinese: '慢慢走也没关系，只要不停下来。',
    words: [
      { word: '천천히', pos: '副词', meaning: '慢慢地' },
      { word: '가다', pos: '动词', meaning: '走、去' },
      { word: '괜찮다', pos: '形容词', meaning: '没关系、可以' },
      { word: '멈추다', pos: '动词', meaning: '停下' },
    ],
  },
  {
    korean: '오늘도 한 걸음씩 나아가 봐요.',
    romanization: 'o-neul-do han geo-reum-ssik na-a-ga bwa-yo.',
    chinese: '今天也一步一步向前走吧。',
    words: [
      { word: '오늘', pos: '名词', meaning: '今天' },
      { word: '한 걸음', pos: '名词', meaning: '一步' },
      { word: '나아가다', pos: '动词', meaning: '向前迈进' },
    ],
  },
  {
    korean: '작은 습관이 큰 변화를 만듭니다.',
    romanization: 'ja-geun seup-gwan-i keun byeon-hwa-reul man-deum-ni-da.',
    chinese: '小习惯造就大改变。',
    words: [
      { word: '작다', pos: '形容词', meaning: '小' },
      { word: '습관', pos: '名词', meaning: '习惯' },
      { word: '변화', pos: '名词', meaning: '变化' },
      { word: '만들다', pos: '动词', meaning: '制造、造就' },
    ],
  },
  {
    korean: '포기하지 않으면 언젠가는 해낼 수 있어.',
    romanization: 'po-gi-ha-ji an-eu-myeon eon-jen-ga-neun hae-nael su i-sseo.',
    chinese: '只要不放弃，总有一天能做到。',
    words: [
      { word: '포기하다', pos: '动词', meaning: '放弃' },
      { word: '언젠가', pos: '副词', meaning: '总有一天' },
      { word: '해내다', pos: '动词', meaning: '完成、做到' },
    ],
  },
  {
    korean: '매일 조금씩, 그게 실력이 되는 길이야.',
    romanization: 'mae-il jo-geum-ssik, geu-ge sil-lyeok-i doe-neun gil-i-ya.',
    chinese: '每天进步一点点，那就是成为实力的路。',
    words: [
      { word: '매일', pos: '名词', meaning: '每天' },
      { word: '조금씩', pos: '副词', meaning: '一点一点地' },
      { word: '실력', pos: '名词', meaning: '实力' },
      { word: '길', pos: '名词', meaning: '路' },
    ],
  },
];

/** 根据日期取当日句子（同一日期恒定） */
export function getSentenceOfDay(date = new Date()): DailySentence {
  const dayIndex = Math.floor(date.getTime() / 86400000);
  return DAILY_SENTENCES[dayIndex % DAILY_SENTENCES.length];
}

/* ===================== 发音练习句子库 ===================== */

/** 难度等级：初级（日常短句）/ 中级（生活对话）/ 高级（新闻·台词节选） */
export type PracticeLevel = 'beginner' | 'intermediate' | 'advanced';

/** 跟读练习句子结构 */
export interface PracticeSentence {
  id: string;
  level: PracticeLevel;
  ko: string;   // 韩语原文
  rom: string;  // 罗马音
  zh: string;   // 中文释义
  tip?: string; // 中文发音/用法注释
}

export const LEVEL_META: { key: PracticeLevel; label: string; desc: string }[] = [
  { key: 'beginner', label: '初级', desc: '日常短句' },
  { key: 'intermediate', label: '中级', desc: '生活对话' },
  { key: 'advanced', label: '高级', desc: '新闻·台词节选' },
];

/** 发音练习句子库：3 级 × 10 句 */
export const PRACTICE_SENTENCES: PracticeSentence[] = [
  // ---------- 初级：日常短句 ----------
  { id: 'b01', level: 'beginner', ko: '안녕하세요?', rom: 'an-nyeong-ha-se-yo', zh: '你好！', tip: '最万能的问候语，任何场合都适用。' },
  { id: 'b02', level: 'beginner', ko: '감사합니다.', rom: 'gam-sa-ham-ni-da', zh: '谢谢。', tip: '「합니다」中的 ㅂ 在 ㄴ 前同化为 ㅁ，读作 [함니다]。' },
  { id: 'b03', level: 'beginner', ko: '실례합니다.', rom: 'sil-lye-ham-ni-da', zh: '打扰一下 / 不好意思。', tip: '问路、插话前的礼貌开场白。' },
  { id: 'b04', level: 'beginner', ko: '괜찮아요.', rom: 'gwaen-chan-a-yo', zh: '没关系 / 我没事。', tip: '也可用来婉拒：「不用了，没关系」。' },
  { id: 'b05', level: 'beginner', ko: '잘 부탁드립니다.', rom: 'jal bu-tak-deu-rim-ni-da', zh: '请多多关照。', tip: '初次见面、入职第一天必说一句。' },
  { id: 'b06', level: 'beginner', ko: '맛있게 드세요.', rom: 'ma-sit-kke deu-se-yo', zh: '请慢用 / 吃得香一点。', tip: '「있게」紧音化读作 [읻께]。' },
  { id: 'b07', level: 'beginner', ko: '잠깐만요.', rom: 'jam-kkan-man-yo', zh: '稍等一下。', tip: '「깐」紧音化，读起来短促有力。' },
  { id: 'b08', level: 'beginner', ko: '수고하셨습니다.', rom: 'su-go-ha-syeot-seum-ni-da', zh: '辛苦了。', tip: '下班、下课时对同事同学说，非常常用。' },
  { id: 'b09', level: 'beginner', ko: '천천히 말해 주세요.', rom: 'cheon-cheon-hi mal-hae ju-se-yo', zh: '请慢一点说。', tip: '听不懂时的救场句，韩国人会很乐意放慢。' },
  { id: 'b10', level: 'beginner', ko: '다시 한번 말씀해 주세요.', rom: 'da-si han-beon mal-sseum-hae ju-se-yo', zh: '请再说一遍。', tip: '「한번」常读作 [한번]，注意 ㅂ 是松音不送气。' },

  // ---------- 中级：生活对话 ----------
  { id: 'i01', level: 'intermediate', ko: '이거 얼마예요?', rom: 'i-geo eol-ma-ye-yo', zh: '这个多少钱？', tip: '购物必备句，「이거」是指着东西说的「这个」。' },
  { id: 'i02', level: 'intermediate', ko: '화장실이 어디에 있어요?', rom: 'hwa-jang-sil-i eo-di-e i-sseo-yo', zh: '洗手间在哪里？', tip: '「있어요」实际读作 [이써요]，ㅆ 紧音化。' },
  { id: 'i03', level: 'intermediate', ko: '조금만 깎아 주실 수 있어요?', rom: 'jo-geum-man kka-kka ju-sil su i-sseo-yo', zh: '能便宜一点吗？', tip: '市场砍价用语，「까」要读紧音。' },
  { id: 'i04', level: 'intermediate', ko: '여기서 가까운 지하철역이 어디예요?', rom: 'yeo-gi-seo ga-kka-un ji-ha-cheol-yeo-gi eo-di-ye-yo', zh: '离这儿最近的地铁站在哪？', tip: '长句注意按意群停顿：여기서 / 가까운 지하철역이 / 어디예요?' },
  { id: 'i05', level: 'intermediate', ko: '저는 김치를 못 먹어요.', rom: 'jeo-neun gim-chi-reul mot meo-geo-yo', zh: '我不能吃泡菜（吃不了辣）。', tip: '「못」收音 ㅊ 在元音前连读为 [물 먹어요]→[문 머거요] 感觉。' },
  { id: 'i06', level: 'intermediate', ko: '사진 좀 찍어 주시겠어요?', rom: 'sa-jin jom jji-geo ju-si-ge-sseo-yo', zh: '可以帮我拍张照吗？', tip: '「찍」紧音，旅游时请路人帮忙的礼貌说法。' },
  { id: 'i07', level: 'intermediate', ko: '두 분이서 오셨어요?', rom: 'du bu-ni-seo o-syeo-sseo-yo', zh: '两位一起来的吗？', tip: '餐厅店员常用句，注意「분이서」连读。' },
  { id: 'i08', level: 'intermediate', ko: '배가 너무 고파서 밥부터 먹을래요.', rom: 'bae-ga neo-mu go-pa-seo bap-bu-teo meo-geul-lae-yo', zh: '肚子太饿了，想先吃饭。', tip: '「밥부터」收音 ㅂ+紧音，读作 [밥뿌터]。' },
  { id: 'i09', level: 'intermediate', ko: '내일 비가 온다고 해서 우산을 챙겼어요.', rom: 'nae-il bi-ga on-da-go hae-seo u-san-eul chaeng-gyeo-sseo-yo', zh: '听说明天下雨，所以带了伞。', tip: '「-ㄴ다고 해서」是中级核心语法：听说……所以……。' },
  { id: 'i10', level: 'intermediate', ko: '길을 잃었는데 좀 도와주시겠어요?', rom: 'gil-eul i-reon-neun-de jom do-wa-ju-si-ge-sseo-yo', zh: '我迷路了，能帮我一下吗？', tip: '「잃었」读作 [이럿]，ㅎ 弱化后连读。' },

  // ---------- 高级：新闻·台词节选 ----------
  { id: 'a01', level: 'advanced', ko: '오늘 서울의 최고 기온은 섭씨 30도를 넘을 것으로 보입니다.', rom: 'o-neul seo-ul-ui choe-go gi-on-eun seop-ssi sam-sip-do-reul neo-meul geo-seu-ro bo-im-ni-da', zh: '今天首尔的最高气温预计将超过摄氏30度。（新闻播报）', tip: '新闻体「-으로 보입니다」表示委婉预测。' },
  { id: 'a02', level: 'advanced', ko: '전문가들은 이러한 현상이 당분간 지속될 것이라고 전망했습니다.', rom: 'jeon-mun-ga-deu-reun i-reo-han hyeon-sang-i dang-bun-gan ji-sok-doel geo-si-ra-go jeon-mang-haet-seum-ni-da', zh: '专家预测这种现象短期内将持续。（新闻）', tip: '长句按「전문가들은 / 이러한 현상이 / 당분간 / 지속될 것이라고」切分练习。' },
  { id: 'a03', level: 'advanced', ko: '지금 이 순간에도 최선을 다하는 것, 그게 제가 할 수 있는 전부입니다.', rom: 'ji-geum i sun-ga-ne-do choe-seon-eul da-ha-neun geot, geu-ge je-ga hal su in-neun jeon-bu-im-ni-da', zh: '在此刻也全力以赴，那就是我能做的一切。（台词）', tip: '台词注意重音落在「전부」上。' },
  { id: 'a04', level: 'advanced', ko: '우리가 헤어진 건 사랑이 식어서가 아니라, 현실이 우릴 밀어냈기 때문이야.', rom: 'u-ri-ga he-eo-jin geon sa-rang-i si-geo-seo-ga a-ni-ra, hyeon-sil-i u-ril mi-reo-naet-gi ttae-mun-i-ya', zh: '我们分手不是爱情淡了，而是现实把我们推开了。（台词）', tip: '「밀어냈기」连读为 [미러냈끼]，情绪从平静到激动。' },
  { id: 'a05', level: 'advanced', ko: '정부는 내년부터 청년 주거 지원 정책을 대폭 확대하겠다고 밝혔습니다.', rom: 'jeong-bu-neun nae-nyeon-bu-teo cheong-nyeon ju-geo ji-won jeong-chae-geul dae-pok hwak-dae-ha-get-da-go bal-khyeot-seum-ni-da', zh: '政府表示将从明年起大幅扩大青年住房支援政策。（新闻）', tip: '「밝혔」读作 [발켰]，ㅎ 与 ㅋ 结合的送气化现象。' },
  { id: 'a06', level: 'advanced', ko: '사람이 꼭 성공해야 할 이유는 없지만, 후회 없이 살 이유는 있잖아요.', rom: 'sa-ram-i kkok seong-gong-hae-ya hal i-yu-neun eop-jji-man, hu-hoe eop-si sal i-yu-neun it-jan-a-yo', zh: '人不一定要成功，但有理由活得无悔。（台词）', tip: '「없지만」连读 [업찌만]，注意 ㅂ+ㅈ 的紧音化。' },
  { id: 'a07', level: 'advanced', ko: '이번 조사 결과에 따르면 응답자의 절반 이상이 찬성하는 것으로 나타났습니다.', rom: 'i-beon jo-sa gyeol-gwa-e tta-reu-myeon eung-dap-ja-ui jeol-ban i-sang-i chan-seong-ha-neun geo-seu-ro na-ta-nat-seum-ni-da', zh: '据调查结果显示，半数以上受访者表示赞成。（新闻）', tip: '「-에 따르면」是新闻高频句型：根据……。' },
  { id: 'a08', level: 'advanced', ko: '네가 아무리 멀리 가 있어도, 내 마음은 항상 네 곁에 있을 거야.', rom: 'ne-ga a-mu-ri meol-li ga i-sseo-do, nae ma-eu-meun hang-sang ne gyeo-te i-sseul geo-ya', zh: '无论你走多远，我的心都会一直在你身边。（台词）', tip: '「곁에」连读 [겨테]，抒情台词要放缓、气息连贯。' },
  { id: 'a09', level: 'advanced', ko: '기술의 발전은 우리 삶의 방식을 근본적으로 바꾸어 놓고 있습니다.', rom: 'gi-sul-ui bal-jeon-eun u-ri sal-ui bang-sik-eul geun-bon-jeo-geu-ro ba-kku-eo no-ko it-seum-ni-da', zh: '技术的发展正在从根本上改变我们的生活方式。（新闻/演讲）', tip: '「놓고」读作 [노코]，ㅎ 弱化后送气化。' },
  { id: 'a10', level: 'advanced', ko: '눈물이 나올 만큼 웃을 수 있다면, 그 하루는 실패가 아니야.', rom: 'nun-mul-i na-ol man-keum u-seul su it-da-myeon, geu ha-ru-neun sil-pae-ga a-ni-ya', zh: '如果能笑到流出眼泪，那这一天就不算失败。（台词）', tip: '「만큼」不要读成 [만큰]，韵尾 ㅁ 清晰收音。' },
];

/** 按难度等级筛选句子 */
export function getSentencesByLevel(level: PracticeLevel): PracticeSentence[] {
  return PRACTICE_SENTENCES.filter((s) => s.level === level);
}
