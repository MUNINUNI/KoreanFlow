/**
 * words.ts — 内置韩语词库（单词学习页使用）
 * 每个词条含：韩语词、罗马音、中文释义、词性、例句（韩语+中文）、分类。
 * 共 7 个分类 × 12 词 = 84 个常用韩语词。
 */

export interface Word {
  /** 唯一编号，如 'greet-01' */
  id: string;
  /** 韩语词 */
  ko: string;
  /** 罗马音 */
  rom: string;
  /** 中文释义 */
  zh: string;
  /** 词性（名词/动词/形容词/副词/感叹词…） */
  pos: string;
  /** 例句（韩语） */
  exampleKo: string;
  /** 例句中文 */
  exampleZh: string;
  /** 分类 id，对应 CATEGORIES */
  category: string;
}

export interface WordCategory {
  id: string;
  label: string; // 中文分类名
  ko: string;    // 韩语分类小字
}

/** 词库分类列表（页头胶囊与全部词库分组共用） */
export const CATEGORIES: WordCategory[] = [
  { id: 'greet', label: '问候', ko: '인사' },
  { id: 'time', label: '数字时间', ko: '숫자·시간' },
  { id: 'food', label: '食物', ko: '음식' },
  { id: 'travel', label: '出行', ko: '여행' },
  { id: 'shopping', label: '购物', ko: '쇼핑' },
  { id: 'emotion', label: '情感', ko: '감정' },
  { id: 'school', label: '校园', ko: '학교' },
];

/** 内置词库：7 分类 × 12 词 = 84 词 */
export const WORDS: Word[] = [
  // ---- 问候 greet ----
  { id: 'greet-01', ko: '안녕하세요', rom: 'annyeonghaseyo', zh: '你好（敬语）', pos: '感叹词', exampleKo: '안녕하세요, 만나서 반갑습니다.', exampleZh: '你好，很高兴见到你。', category: 'greet' },
  { id: 'greet-02', ko: '안녕', rom: 'annyeong', zh: '嗨 / 再见（非敬语）', pos: '感叹词', exampleKo: '안녕, 잘 가!', exampleZh: '再见，慢走！', category: 'greet' },
  { id: 'greet-03', ko: '감사합니다', rom: 'gamsahamnida', zh: '谢谢', pos: '感叹词', exampleKo: '도와주셔서 감사합니다.', exampleZh: '谢谢你的帮助。', category: 'greet' },
  { id: 'greet-04', ko: '고마워요', rom: 'gomawoyo', zh: '谢谢（较随意）', pos: '感叹词', exampleKo: '선물 고마워요.', exampleZh: '谢谢你的礼物。', category: 'greet' },
  { id: 'greet-05', ko: '죄송합니다', rom: 'joesonghamnida', zh: '对不起', pos: '感叹词', exampleKo: '늦어서 죄송합니다.', exampleZh: '对不起，我迟到了。', category: 'greet' },
  { id: 'greet-06', ko: '실례합니다', rom: 'sillyehamnida', zh: '打扰一下', pos: '感叹词', exampleKo: '실례합니다, 화장실이 어디예요?', exampleZh: '打扰一下，洗手间在哪里？', category: 'greet' },
  { id: 'greet-07', ko: '반갑습니다', rom: 'bangapseumnida', zh: '很高兴见到你', pos: '形容词', exampleKo: '처음 뵙겠습니다. 반갑습니다.', exampleZh: '初次见面，很高兴认识你。', category: 'greet' },
  { id: 'greet-08', ko: '괜찮아요', rom: 'gwaenchanayo', zh: '没关系', pos: '形容词', exampleKo: '괜찮아요, 걱정하지 마세요.', exampleZh: '没关系，别担心。', category: 'greet' },
  { id: 'greet-09', ko: '수고하셨습니다', rom: 'sugohasyeotseumnida', zh: '辛苦了', pos: '感叹词', exampleKo: '오늘 수고하셨습니다.', exampleZh: '今天辛苦了。', category: 'greet' },
  { id: 'greet-10', ko: '안녕히 가세요', rom: 'annyeonghi gaseyo', zh: '请慢走（送客）', pos: '感叹词', exampleKo: '안녕히 가세요. 다음에 또 오세요.', exampleZh: '请慢走，下次再来。', category: 'greet' },
  { id: 'greet-11', ko: '네', rom: 'ne', zh: '是 / 好的', pos: '感叹词', exampleKo: '네, 알겠습니다.', exampleZh: '好的，我知道了。', category: 'greet' },
  { id: 'greet-12', ko: '아니요', rom: 'aniyo', zh: '不是 / 不', pos: '感叹词', exampleKo: '아니요, 괜찮습니다.', exampleZh: '不，没关系的。', category: 'greet' },
  // ---- 数字时间 time ----
  { id: 'time-01', ko: '하나', rom: 'hana', zh: '一（固有词）', pos: '数词', exampleKo: '사과 하나 주세요.', exampleZh: '请给我一个苹果。', category: 'time' },
  { id: 'time-02', ko: '둘', rom: 'dul', zh: '二（固有词）', pos: '数词', exampleKo: '커피 둘이요.', exampleZh: '两杯咖啡。', category: 'time' },
  { id: 'time-03', ko: '셋', rom: 'set', zh: '三（固有词）', pos: '数词', exampleKo: '사람이 셋 있어요.', exampleZh: '有三个人。', category: 'time' },
  { id: 'time-04', ko: '오늘', rom: 'oneul', zh: '今天', pos: '名词', exampleKo: '오늘 날씨가 좋아요.', exampleZh: '今天天气很好。', category: 'time' },
  { id: 'time-05', ko: '내일', rom: 'naeil', zh: '明天', pos: '名词', exampleKo: '내일 만나요.', exampleZh: '明天见。', category: 'time' },
  { id: 'time-06', ko: '어제', rom: 'eoje', zh: '昨天', pos: '名词', exampleKo: '어제 영화를 봤어요.', exampleZh: '昨天看了电影。', category: 'time' },
  { id: 'time-07', ko: '지금', rom: 'jigeum', zh: '现在', pos: '名词', exampleKo: '지금 몇 시예요?', exampleZh: '现在几点了？', category: 'time' },
  { id: 'time-08', ko: '시간', rom: 'sigan', zh: '时间', pos: '名词', exampleKo: '시간이 없어요.', exampleZh: '没有时间。', category: 'time' },
  { id: 'time-09', ko: '아침', rom: 'achim', zh: '早上 / 早餐', pos: '名词', exampleKo: '아침을 먹었어요?', exampleZh: '吃早餐了吗？', category: 'time' },
  { id: 'time-10', ko: '저녁', rom: 'jeonyeok', zh: '晚上 / 晚餐', pos: '名词', exampleKo: '저녁에 같이 밥 먹어요.', exampleZh: '晚上一起吃饭吧。', category: 'time' },
  { id: 'time-11', ko: '주말', rom: 'jumal', zh: '周末', pos: '名词', exampleKo: '주말에 뭐 해요?', exampleZh: '周末做什么？', category: 'time' },
  { id: 'time-12', ko: '월요일', rom: 'woryoil', zh: '星期一', pos: '名词', exampleKo: '월요일에 회의가 있어요.', exampleZh: '星期一有会议。', category: 'time' },
  // ---- 食物 food ----
  { id: 'food-01', ko: '밥', rom: 'bap', zh: '饭', pos: '名词', exampleKo: '밥 먹었어요?', exampleZh: '吃饭了吗？', category: 'food' },
  { id: 'food-02', ko: '물', rom: 'mul', zh: '水', pos: '名词', exampleKo: '물 한 잔 주세요.', exampleZh: '请给我一杯水。', category: 'food' },
  { id: 'food-03', ko: '커피', rom: 'keopi', zh: '咖啡', pos: '名词', exampleKo: '아이스 아메리카노 한 잔이요.', exampleZh: '请给我一杯冰美式。', category: 'food' },
  { id: 'food-04', ko: '김치', rom: 'gimchi', zh: '泡菜', pos: '名词', exampleKo: '김치가 조금 매워요.', exampleZh: '泡菜有点辣。', category: 'food' },
  { id: 'food-05', ko: '불고기', rom: 'bulgogi', zh: '烤肉', pos: '名词', exampleKo: '불고기를 주문했어요.', exampleZh: '点了烤肉。', category: 'food' },
  { id: 'food-06', ko: '비빔밥', rom: 'bibimbap', zh: '拌饭', pos: '名词', exampleKo: '돌솥 비빔밥이 맛있어요.', exampleZh: '石锅拌饭很好吃。', category: 'food' },
  { id: 'food-07', ko: '라면', rom: 'ramyeon', zh: '拉面 / 方便面', pos: '名词', exampleKo: '라면 먹고 갈래요?', exampleZh: '要不要吃完拉面再走？', category: 'food' },
  { id: 'food-08', ko: '떡볶이', rom: 'tteokbokki', zh: '炒年糕', pos: '名词', exampleKo: '떡볶이가 정말 맵네요.', exampleZh: '炒年糕真的很辣。', category: 'food' },
  { id: 'food-09', ko: '맛있다', rom: 'masitda', zh: '好吃', pos: '形容词', exampleKo: '이 집 음식이 맛있어요.', exampleZh: '这家店的菜很好吃。', category: 'food' },
  { id: 'food-10', ko: '맵다', rom: 'maepda', zh: '辣', pos: '形容词', exampleKo: '너무 매워요!', exampleZh: '太辣了！', category: 'food' },
  { id: 'food-11', ko: '달다', rom: 'dalda', zh: '甜', pos: '形容词', exampleKo: '이 케이크는 너무 달아요.', exampleZh: '这个蛋糕太甜了。', category: 'food' },
  { id: 'food-12', ko: '배고프다', rom: 'baegopeuda', zh: '饿', pos: '形容词', exampleKo: '배고파요. 밥 먹으러 가요.', exampleZh: '饿了，去吃饭吧。', category: 'food' },
  // ---- 出行 travel ----
  { id: 'travel-01', ko: '공항', rom: 'gonghang', zh: '机场', pos: '名词', exampleKo: '공항까지 얼마나 걸려요?', exampleZh: '到机场要多久？', category: 'travel' },
  { id: 'travel-02', ko: '지하철', rom: 'jihacheol', zh: '地铁', pos: '名词', exampleKo: '지하철로 갈 수 있어요.', exampleZh: '可以坐地铁去。', category: 'travel' },
  { id: 'travel-03', ko: '버스', rom: 'beoseu', zh: '公交车', pos: '名词', exampleKo: '버스가 곧 와요.', exampleZh: '公交车马上就到了。', category: 'travel' },
  { id: 'travel-04', ko: '택시', rom: 'taeksi', zh: '出租车', pos: '名词', exampleKo: '택시를 불러 주세요.', exampleZh: '请帮我叫一辆出租车。', category: 'travel' },
  { id: 'travel-05', ko: '역', rom: 'yeok', zh: '车站', pos: '名词', exampleKo: '서울역에서 만나요.', exampleZh: '在首尔站见吧。', category: 'travel' },
  { id: 'travel-06', ko: '길', rom: 'gil', zh: '路', pos: '名词', exampleKo: '길을 잃었어요.', exampleZh: '我迷路了。', category: 'travel' },
  { id: 'travel-07', ko: '호텔', rom: 'hotel', zh: '酒店', pos: '名词', exampleKo: '호텔을 예약했어요.', exampleZh: '订了酒店。', category: 'travel' },
  { id: 'travel-08', ko: '여행', rom: 'yeohaeng', zh: '旅行', pos: '名词', exampleKo: '제주도로 여행을 가요.', exampleZh: '去济州岛旅行。', category: 'travel' },
  { id: 'travel-09', ko: '가다', rom: 'gada', zh: '去 / 走', pos: '动词', exampleKo: '학교에 가요.', exampleZh: '去学校。', category: 'travel' },
  { id: 'travel-10', ko: '오다', rom: 'oda', zh: '来', pos: '动词', exampleKo: '언제 한국에 왔어요?', exampleZh: '什么时候来韩国的？', category: 'travel' },
  { id: 'travel-11', ko: '걷다', rom: 'geotda', zh: '走路', pos: '动词', exampleKo: '조금만 걸어 가면 돼요.', exampleZh: '走一会儿就到了。', category: 'travel' },
  { id: 'travel-12', ko: '빠르다', rom: 'ppareuda', zh: '快', pos: '形容词', exampleKo: 'KTX가 정말 빨라요.', exampleZh: 'KTX 高铁真的很快。', category: 'travel' },
  // ---- 购物 shopping ----
  { id: 'shopping-01', ko: '얼마예요', rom: 'eolmayeyo', zh: '多少钱？', pos: '惯用语', exampleKo: '이거 얼마예요?', exampleZh: '这个多少钱？', category: 'shopping' },
  { id: 'shopping-02', ko: '사다', rom: 'sada', zh: '买', pos: '动词', exampleKo: '선물을 사고 싶어요.', exampleZh: '想买礼物。', category: 'shopping' },
  { id: 'shopping-03', ko: '팔다', rom: 'palda', zh: '卖', pos: '动词', exampleKo: '여기서 기념품을 팔아요.', exampleZh: '这里卖纪念品。', category: 'shopping' },
  { id: 'shopping-04', ko: '비싸다', rom: 'bissada', zh: '贵', pos: '形容词', exampleKo: '너무 비싸요. 깎아 주세요.', exampleZh: '太贵了，请便宜点。', category: 'shopping' },
  { id: 'shopping-05', ko: '싸다', rom: 'ssada', zh: '便宜', pos: '形容词', exampleKo: '이 시장은 과일이 싸요.', exampleZh: '这个市场水果便宜。', category: 'shopping' },
  { id: 'shopping-06', ko: '돈', rom: 'don', zh: '钱', pos: '名词', exampleKo: '돈이 부족해요.', exampleZh: '钱不够。', category: 'shopping' },
  { id: 'shopping-07', ko: '카드', rom: 'kadeu', zh: '卡 / 信用卡', pos: '名词', exampleKo: '카드로 결제할게요.', exampleZh: '我用卡支付。', category: 'shopping' },
  { id: 'shopping-08', ko: '영수증', rom: 'yeongsujeung', zh: '收据', pos: '名词', exampleKo: '영수증 주세요.', exampleZh: '请给我收据。', category: 'shopping' },
  { id: 'shopping-09', ko: '가게', rom: 'gage', zh: '商店', pos: '名词', exampleKo: '가게가 문을 닫았어요.', exampleZh: '商店关门了。', category: 'shopping' },
  { id: 'shopping-10', ko: '선물', rom: 'seonmul', zh: '礼物', pos: '名词', exampleKo: '친구에게 선물을 줬어요.', exampleZh: '送了礼物给朋友。', category: 'shopping' },
  { id: 'shopping-11', ko: '크다', rom: 'keuda', zh: '大', pos: '形容词', exampleKo: '사이즈가 너무 커요.', exampleZh: '尺码太大了。', category: 'shopping' },
  { id: 'shopping-12', ko: '작다', rom: 'jakda', zh: '小', pos: '形容词', exampleKo: '조금 작은 것 같아요.', exampleZh: '好像有点小。', category: 'shopping' },
  // ---- 情感 emotion ----
  { id: 'emotion-01', ko: '좋다', rom: 'jota', zh: '好 / 喜欢', pos: '形容词', exampleKo: '날씨가 좋아요.', exampleZh: '天气很好。', category: 'emotion' },
  { id: 'emotion-02', ko: '싫다', rom: 'silta', zh: '讨厌', pos: '形容词', exampleKo: '비가 오는 날이 싫어요.', exampleZh: '讨厌下雨的日子。', category: 'emotion' },
  { id: 'emotion-03', ko: '사랑하다', rom: 'saranghada', zh: '爱', pos: '动词', exampleKo: '사랑해요.', exampleZh: '我爱你。', category: 'emotion' },
  { id: 'emotion-04', ko: '좋아하다', rom: 'joahada', zh: '喜欢', pos: '动词', exampleKo: '한국 음악을 좋아해요.', exampleZh: '喜欢韩国音乐。', category: 'emotion' },
  { id: 'emotion-05', ko: '행복하다', rom: 'haengbokada', zh: '幸福', pos: '形容词', exampleKo: '오늘 정말 행복해요.', exampleZh: '今天真的很幸福。', category: 'emotion' },
  { id: 'emotion-06', ko: '슬프다', rom: 'seulpeuda', zh: '伤心', pos: '形容词', exampleKo: '영화가 너무 슬펐어요.', exampleZh: '电影太感人了。', category: 'emotion' },
  { id: 'emotion-07', ko: '기쁘다', rom: 'gippeuda', zh: '高兴', pos: '形容词', exampleKo: '만나서 기뻐요.', exampleZh: '见到你很高兴。', category: 'emotion' },
  { id: 'emotion-08', ko: '화나다', rom: 'hwanada', zh: '生气', pos: '形容词', exampleKo: '조금 화가 났어요.', exampleZh: '有点生气了。', category: 'emotion' },
  { id: 'emotion-09', ko: '피곤하다', rom: 'pigonhada', zh: '累', pos: '形容词', exampleKo: '오늘 너무 피곤해요.', exampleZh: '今天太累了。', category: 'emotion' },
  { id: 'emotion-10', ko: '재미있다', rom: 'jaemiitda', zh: '有趣', pos: '形容词', exampleKo: '한국어 공부가 재미있어요.', exampleZh: '学韩语很有趣。', category: 'emotion' },
  { id: 'emotion-11', ko: '외롭다', rom: 'oeropda', zh: '孤独', pos: '形容词', exampleKo: '혼자 있으면 외로워요.', exampleZh: '一个人待着会孤独。', category: 'emotion' },
  { id: 'emotion-12', ko: '그립다', rom: 'geuripda', zh: '想念', pos: '形容词', exampleKo: '고향이 그리워요.', exampleZh: '想念家乡。', category: 'emotion' },
  // ---- 校园 school ----
  { id: 'school-01', ko: '학교', rom: 'hakgyo', zh: '学校', pos: '名词', exampleKo: '학교에 다녀요.', exampleZh: '在上学。', category: 'school' },
  { id: 'school-02', ko: '선생님', rom: 'seonsaengnim', zh: '老师', pos: '名词', exampleKo: '선생님께 질문했어요.', exampleZh: '向老师提了问题。', category: 'school' },
  { id: 'school-03', ko: '학생', rom: 'haksaeng', zh: '学生', pos: '名词', exampleKo: '저는 대학생이에요.', exampleZh: '我是大学生。', category: 'school' },
  { id: 'school-04', ko: '공부하다', rom: 'gongbuhada', zh: '学习', pos: '动词', exampleKo: '매일 한국어를 공부해요.', exampleZh: '每天学习韩语。', category: 'school' },
  { id: 'school-05', ko: '숙제', rom: 'sukje', zh: '作业', pos: '名词', exampleKo: '숙제를 다 했어요.', exampleZh: '作业都做完了。', category: 'school' },
  { id: 'school-06', ko: '시험', rom: 'siheom', zh: '考试', pos: '名词', exampleKo: '다음 주에 시험이 있어요.', exampleZh: '下周有考试。', category: 'school' },
  { id: 'school-07', ko: '책', rom: 'chaek', zh: '书', pos: '名词', exampleKo: '이 책이 재미있어요.', exampleZh: '这本书很有趣。', category: 'school' },
  { id: 'school-08', ko: '연필', rom: 'yeonpil', zh: '铅笔', pos: '名词', exampleKo: '연필 한 자루 빌려 주세요.', exampleZh: '请借我一支铅笔。', category: 'school' },
  { id: 'school-09', ko: '질문', rom: 'jilmun', zh: '问题 / 提问', pos: '名词', exampleKo: '질문이 있어요.', exampleZh: '我有个问题。', category: 'school' },
  { id: 'school-10', ko: '대답', rom: 'daedap', zh: '回答', pos: '名词', exampleKo: '대답을 들었어요.', exampleZh: '听到了回答。', category: 'school' },
  { id: 'school-11', ko: '수업', rom: 'sueop', zh: '课 / 上课', pos: '名词', exampleKo: '수업이 9시에 시작해요.', exampleZh: '课九点开始。', category: 'school' },
  { id: 'school-12', ko: '졸업', rom: 'joreop', zh: '毕业', pos: '名词', exampleKo: '내년에 졸업해요.', exampleZh: '明年毕业。', category: 'school' },
];

/** 按分类取词 */
export function wordsByCategory(categoryId: string): Word[] {
  return WORDS.filter((w) => w.category === categoryId);
}
