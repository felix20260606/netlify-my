// 句型提示：认出字幕里常见的英语句型（There be、so…that、used to…），在字幕下面用小标签提示
// 只看词，不看标点；每句最多给 3 个，先列的规则优先（更具体的放前面）
(function () {
  var G = "(?:\\S+\\s){1,3}?"; // 中间隔 1～3 个词
  var BE = "(?:am|is|are|was|were|be|been|being|i'm|you're|we're|they're|he's|she's|it's|that's|isn't|aren't|wasn't|weren't)";
  var P = [
    // ---- 倒装、简短回应（最具体，放最前）----
    ["reply", "^(me too|me neither|me either|same here|i think so|i don't think so|i hope so|i hope not|i guess so|i'm afraid so|i'm afraid not|i suppose so|so am i|so do i|so did i|so have i|so can i|neither am i|neither do i|neither did i|neither have i|neither can i|nor do i)$", "简短回应 Me too / I hope so", "我也是 / 希望如此", "口语里用 so / not 代替整句：I hope so 希望如此，I hope not 但愿不会。附和别人：肯定用 so do I / me too，否定用 neither do I / me neither。", "—I'm tired. —So am I. 我也是。"],
    ["inversion", "^(never|seldom|rarely|little|hardly|scarcely|barely|only then|only when|only if|only after|not until|not only|nowhere|under no circumstances|in no way|at no time|not once)\\s(?:\\S+\\s){0,4}?(have|has|had|do|does|did|is|are|was|were|can|could|will|would|should|must|might)\\s(i|you|he|she|it|we|they|this|that|there)\\b", "倒装句", "否定词放句首 → 助动词提前", "never / hardly / only then / not until 等放句首时，后面用疑问句语序（助动词在主语前），语气更强，多见于书面和演讲。", "Never have I seen such a mess. 我从没见过这么乱的。"],
    ["hardlywhen", "\\b(hardly|scarcely|barely)\\s(?:\\S+\\s){0,6}?(when|before)\\b", "Hardly … when", "刚…就…", "前一件事刚做完后一件就发生，前半句常用过去完成时；放句首要倒装：Hardly had I sat down when…", "I had hardly sat down when the phone rang. 我刚坐下电话就响了。"],
    ["nosooner", "\\b(no sooner)\\s(?:\\S+\\s){0,6}?(than)\\b", "No sooner … than", "一…就…", "和 hardly … when 意思一样，注意搭配 than 不是 when；放句首要倒装。", "No sooner had we left than it rained. 我们一走就下雨了。"],
    ["ifinv", "^(were|had|should)\\s(i|you|he|she|it|we|they)\\s(?!you\\b)", "Were I / Had I known", "要是…（省略 if 的倒装）", "Were I you = If I were you；Had I known = If I had known；Should you need help = If you should need help。书面。", "Had I known, I would have come. 早知道我就来了。", "nq"],
    ["ifitwerent", "\\b(if it weren't for|if it wasn't for|if it hadn't been for|if not for|but for|were it not for)\\b", "If it weren't for …", "要不是…", "虚拟语气：要不是有…（现在用 weren't，过去用 hadn't been）。", "If it weren't for you, I'd be lost. 要不是你，我就迷路了。"],
    ["suggestthat", "\\b(suggest|suggests|suggested|insist|insists|insisted|recommend|recommends|recommended|demand|demanded|propose|proposed|request|requested)\\s(that)\\b", "suggest that sb (should) do", "建议 / 坚持…（虚拟）", "suggest / insist / recommend / demand that 后面的从句用 (should) + 动词原形：I suggest that he be on time。insist 表示「坚持说（事实）」时不用虚拟。", "I suggest that you take a break. 我建议你休息一下。"],
    ["tagq", "\\s(isn't it|isn't that|aren't you|aren't they|aren't we|don't you|don't they|don't we|doesn't it|doesn't he|doesn't she|didn't you|didn't they|didn't he|didn't she|didn't it|isn't he|isn't she|wasn't it|wasn't he|weren't you|won't you|won't it|can't you|couldn't you|haven't you|hasn't he|hasn't it|shouldn't we|wouldn't you|is it|are you|do you|did you|was it|will you|would you|can you|shall we|have you|right|okay|eh|huh)$", "反义疑问句", "…，是吧？（求确认）", "陈述句后面加一个短问句：前肯后否、前否后肯。回答按事实说：It's not cold, is it? —No, it isn't.（对，不冷）", "You're new here, aren't you? 你是新来的吧？", "tag"],
    ["indirectq", "\\b(do you know|did you know|can you tell me|could you tell me|i wonder|i don't know|i didn't know|i'm not sure|i have no idea|do you remember|i can't remember|tell me|guess)\\s(what|where|when|why|how|who|which|whether|if)\\b", "间接疑问句", "陈述语序：Do you know where he is", "疑问词后面用陈述语序（主语在动词前），不说 Do you know where is he。", "Do you know where the station is? 你知道车站在哪吗？"],
    // ---- 虚拟、推测 ----
    ["wish", "\\b(i wish|if only)\\b", "I wish / If only", "但愿…（与事实相反）", "表示做不到、和现实相反的愿望。说现在用过去式，说过去用 had done。", "I wish I knew. 要是我知道就好了。"],
    ["modalperf", "\\b(would|could|should|might|must|would've|could've|should've|might've|must've)\\s?(have\\s\\S+|been|had)?(?=\\s|$)", null, null, null, null], // 占位，下面单独处理
    ["ifwould", "(?<!\\b(?:wonder|wondering|wondered|know|knew|ask|asked|asking|see|sure|check|checking|tell|remember|decide|whether)\\s)\\b(if)\\s(?:\\S+\\s){1,8}?(would|could|might|i'd|you'd|we'd|they'd|he'd|she'd|it'd)\\b", "If … would", "虚拟条件：要是…就会…", "和现实相反或不太可能的假设。从句用过去式（be 常用 were），主句用 would / could + 动词原形。", "If I were you, I would wait. 我要是你就会等等。"],
    ["ifwill", "(?<!\\b(?:wonder|wondering|wondered|know|knew|ask|asked|asking|see|sure|check|checking|tell|remember|decide|whether)\\s)\\b(if)\\s(?:\\S+\\s){1,8}?(will|won't|i'll|you'll|we'll|they'll|he'll|she'll|it'll)\\b", "If … will", "真实条件：如果…就…", "可能发生的条件。if 从句用一般现在时，主句才用 will，不说 if it will rain。", "If it rains, we'll stay home. 要是下雨我们就待在家。"],
    // ---- 习惯、过去 ----
    ["beusedto", "\\b(" + BE + "|get|got|getting|gets)\\s(?:not\\s|so\\s|really\\s|totally\\s)?(used to)\\b", "be used to doing", "习惯于…", "to 是介词，后面接名词或 -ing；和 used to do（过去常常）不是一回事。", "I'm used to getting up early. 我习惯早起了。"],
    ["usedto", "\\b(used to|didn't use to|use to)\\b", "used to do", "过去常常…（现在不了）", "说过去的习惯或状态，暗示现在已经不这样了。后面接动词原形。", "I used to live in Beijing. 我以前住在北京。"],
    // ---- 形式主语、花时间 ----
    ["ittakes", "\\b(it)\\s(takes|took|will take|'ll take|would take|might take)\\s(?:\\S+\\s){1,4}?(to)\\s", "It takes … to do", "做某事花（时间/精力）", "it 是形式主语，真正的主语是后面的 to do。", "It took me two hours to finish. 我花了两个小时才做完。"],
    ["itadjto", "\\b(it's|it is|it was|it'll be|it would be|it will be|it can be|it might be)\\s(?!up\\s+to\\b|going\\s+to\\b|about\\s+to\\b|time\\s+to\\b|due\\s+to\\b|next\\s+to\\b)(?:\\S+\\s){1,3}?(to)\\s", "It is + 形容词 + to do", "做…是…的", "it 是形式主语，真正的主语是后面的 to do；英语喜欢把长主语放后面。", "It's hard to say. 很难说。"],
    ["itthat", "\\b(it seems|it seemed|it turns out|it turned out|it looks like|it sounds like|it appears)\\b", "It seems / It turns out", "看起来… / 结果是…", "it 不指具体东西，只是占主语位置，后面接 that 从句或 like。", "It turns out he was right. 结果他是对的。"],
    ["spend", "\\b(spend|spent|spends|spending)\\s(?:\\S+\\s){1,4}?(\\S+ing)\\b", "spend time doing", "花时间做…", "spend + 时间/钱 + doing（或 on sth）。", "I spent all day cleaning. 我花了一整天打扫。"],
    ["timeto", "\\b(it's time|it is time|it's about time)\\b", "It's time to / that", "该…了", "It's time to do，或 It's time (that) + 过去式（语气更强）。", "It's time to go. 该走了。"],
    // ---- 程度、结果 ----
    ["sothat2", "\\b(so)\\s(?!that\\b)(?:\\S+\\s){1,3}?(that)\\b", "so … that", "太…以至于…", "so + 形容词/副词 + that 从句，表示结果。", "It was so cold that we stayed in. 冷得我们都没出门。"],
    ["such", "\\b(such)\\s(?:\\S+\\s){1,4}?(that)\\b", "such … that", "如此…以至于…", "such 后面接名词（a nice day），so 后面接形容词。", "It was such a mess that I left. 乱成那样，我就走了。"],
    ["tooto", "\\b(too)\\s(?:\\S+\\s){1,2}?(to)\\s", "too … to do", "太…而不能…", "形式是肯定的，意思是否定的。", "I'm too tired to think. 我累得没法思考。"],
    ["enough", "\\b(enough to)\\b", "… enough to do", "足够…可以…", "enough 放在形容词后面（old enough），名词前面（enough time）。", "He's old enough to drive. 他够年龄开车了。"],
    ["sothat", "\\b(so that|in order to|so as to)\\b", "so that / in order to", "为了…，以便…", "表示目的。so that 后面接句子，in order to 后面接动词原形。", "Speak up so that everyone can hear. 大声点，让大家都听得见。"],
    // ---- 比较 ----
    ["themore", "\\b(the (?:more|less|better|worse|sooner|bigger|harder|easier|faster|longer|higher|older|smaller|greater))\\s(?:\\S+\\s){0,6}?(the (?:more|less|better|worse|sooner|bigger|harder|easier|faster|longer|higher|older|smaller|greater))\\b", "the more … the more", "越…就越…", "两个「the + 比较级」放在一起，前面是条件，后面是结果。", "The sooner, the better. 越快越好。"],
    ["assoon", "\\b(as soon as)\\b", "as soon as", "一…就…", "表示紧接着发生。说将来时 as soon as 后面也用一般现在时。", "Call me as soon as you arrive. 一到就给我打电话。"],
    ["aslong", "\\b(as long as)\\b", "as long as", "只要…", "表示条件，也能指「和…一样长」。", "You can stay as long as you're quiet. 只要你安静就可以留下。"],
    ["aswell", "\\b(as well as)\\b", "as well as", "以及，和…一样", "连接两样东西，重点在前面那个。", "She sings as well as dances. 她会跳舞，也会唱歌。"],
    ["asif", "\\b(as if|as though)\\b", "as if", "好像…一样", "后面接句子，不真实的情况常用过去式。", "He talks as if he knew everything. 他说话好像什么都懂。"],
    ["times", "\\b(twice|half|three times|four times|five times|ten times|a hundred times|\\S+ times)\\s(as)\\s(?:\\S+\\s){1,2}?(as)\\b", "倍数 + as … as", "是…的几倍", "倍数放在 as … as 前面：twice as big as = 是…的两倍大；也可说 three times bigger than。", "It's twice as expensive as before. 比以前贵一倍。"],
    ["asas", "\\b(as)\\s(?!soon\\b|long\\b|well\\b|far\\b|if\\b|though\\b|for\\b|to\\b|a\\b|an\\b|the\\b|i\\b|you\\b|we\\b|they\\b|he\\b|she\\b|it\\b)(?:\\S+\\s){1,2}?(as)\\b", "as … as", "和…一样…", "同级比较，中间用形容词或副词原级；否定是 not as … as。", "She's as tall as me. 她和我一样高。"],
    ["ratherthan", "\\b(rather than|instead of)\\b", "rather than / instead of", "而不是…", "前后两边形式一致；instead of 后面接名词或 -ing。", "Let's walk rather than drive. 我们走路去，别开车了。"],
    // ---- 成对连词 ----
    ["notonly", "\\b(not only)\\b(?:\\s\\S+){1,10}?\\s(but)\\b", "not only … but (also)", "不但…而且…", "强调后面那部分。not only 放句首时要倒装。", "Not only is it cheap, but it's also fast. 不但便宜，还快。"],
    ["either", "\\b(either)\\s(?:\\S+\\s){1,5}?(or)\\b", "either … or", "要么…要么…", "两者选一。", "Either you go or I go. 要么你去，要么我去。"],
    ["neither", "\\b(neither)\\s(?:\\S+\\s){1,5}?(nor)\\b", "neither … nor", "既不…也不…", "两个都否定，句子里不再用 not。", "Neither he nor I knew. 他和我都不知道。"],
    ["both", "\\b(both)\\s(?:\\S+\\s){1,4}?(and)\\b", "both … and", "…和…都", "强调两个都，后面的动词用复数。", "Both Tom and Amy came. 汤姆和艾米都来了。"],
    ["whether", "\\b(whether)\\s(?:\\S+\\s){0,8}?(or not)\\b|\\b(whether)\\b", "whether (or not)", "是否…；不管…", "引出「是不是」的从句；whether … or not 也能表示「不管是不是」。", "I don't know whether he'll come. 我不知道他来不来。"],
    // ---- 让步、条件连词 ----
    ["eventhough", "\\b(even though|even if|although)\\b", "even though / even if", "尽管… / 即使…", "even though 说事实，even if 说假设；英语里不和 but 连用。", "Even though it rained, we went. 虽然下雨，我们还是去了。"],
    ["unless", "\\b(unless)\\b", "unless", "除非…（= if not）", "后面用肯定形式，意思已经带了否定。", "Don't call unless it's urgent. 不急就别打电话。"],
    ["nomatter", "\\b(no matter (?:what|how|who|where|when|which)|whatever|whoever|wherever|however)\\b", "no matter what / whatever", "不管…都…", "引导让步，后面的从句用陈述语序。", "No matter what happens, I'm here. 不管发生什么，我都在。"],
    ["bythetime", "\\b(by the time)\\b", "by the time", "到…的时候（已经）", "主句常用完成时，表示在那之前已经发生。", "By the time we got there, it had closed. 我们到的时候已经关门了。"],
    ["notuntil", "\\b(not)\\s(?:\\S+\\s){0,6}?(until|till)\\b|\\b(didn't|don't|won't|can't|wasn't)\\s(?:\\S+\\s){0,6}?(until|till)\\b", "not … until", "直到…才…", "前面否定 + until，中文说「直到…才」。", "I didn't know until today. 我直到今天才知道。"],
    // ---- 情态和固定说法 ----
    ["hadbetter", "\\b(had better|'d better|i'd better|you'd better|we'd better|better not)\\b", "had better", "最好…（带警告意味）", "后面接动词原形，否定是 had better not do。语气比 should 强。", "You'd better hurry. 你最好快点。"],
    ["wouldrather", "\\b(would rather|'d rather|i'd rather|you'd rather|we'd rather)\\b", "would rather", "宁愿…，更想…", "后面接动词原形；比较时用 would rather A than B。", "I'd rather stay in. 我宁愿待在家。"],
    ["wouldlike", "\\b(would like to|'d like to|i'd like to|would you like|would love to|i'd love to)\\b", "would like to", "想要…（客气）", "比 want 礼貌，点餐、请求常用。", "I'd like to ask a question. 我想问个问题。"],
    ["supposed", "\\b(supposed to)\\b", "be supposed to", "应该…（按规定/预期）", "表示本该如此，常暗示实际上没有做到。", "You're supposed to wear a mask. 按规定你得戴口罩。"],
    ["about", "\\b(" + BE + ")\\s(about to)\\b", "be about to", "正要…", "马上就要发生，不和具体时间连用。", "We're about to leave. 我们正要走。"],
    ["haveto", "\\b(have to|has to|had to|have got to|gotta|got to)\\b", "have to", "不得不…", "外部原因必须做；don't have to = 不必（不是「不许」）。", "I have to go now. 我现在得走了。"],
    ["cantwait", "\\b(can't wait to|cannot wait to|can't wait for)\\b", "can't wait to", "迫不及待要…", "字面是「等不了」，意思是非常期待。", "I can't wait to see you. 好想快点见到你。"],
    ["lookforward", "\\b(look forward to|looking forward to|looked forward to)\\b", "look forward to doing", "期待…", "to 是介词，后面接名词或 -ing。", "I'm looking forward to meeting you. 期待见到你。"],
    ["canthelp", "\\b(can't help|couldn't help|cannot help)\\s(\\S+ing)\\b", "can't help doing", "忍不住…", "help 在这里是「克制」，后面接 -ing。", "I couldn't help laughing. 我忍不住笑了。"],
    ["worth", "\\b(worth)\\s(\\S+ing)\\b|\\b(worth it)\\b", "be worth doing", "值得…", "worth 后面接 -ing 或名词，用主动形式表示被动意思。", "It's worth trying. 值得一试。"],
    ["feellike", "\\b(feel like|feels like|felt like)\\s(\\S+ing)\\b", "feel like doing", "想要…，有心情…", "feel like + -ing 是「想做」；feel like + 名词/句子是「感觉像」。", "I don't feel like cooking. 我不想做饭。"],
    ["vingverb", "\\b(keep|keeps|kept|stop|stops|stopped|enjoy|enjoys|enjoyed|avoid|avoided|finish|finished|mind|quit|practice|consider|imagine|miss|suggest|suggested)\\s(\\S+ing)\\b", "动词 + doing", "这些动词后面接 -ing", "keep / stop / enjoy / avoid / finish / mind 后面直接接 -ing 形式。注意 stop doing（停止做）和 stop to do（停下来去做）不同。", "Keep going. 继续走。"],
    ["letmake", "\\b(let|lets|let's|make|makes|made|making|have|has)\\s(me|you|him|her|us|them|it|everyone|people)\\s(?!been\\b|got\\b|seen\\b|done\\b|had\\b|any\\b|to\\b)(\\S+)\\b", "let / make sb do", "让某人做…", "使役动词后面接不带 to 的动词原形。", "Let me know. 告诉我一声。 It made me laugh. 这让我笑了。"],
    ["howabout", "\\b(how about|what about|why don't you|why don't we|why not)\\b", "How about / Why don't we", "…怎么样？（提建议）", "how about / what about 后面接名词或 -ing；why don't we 后面接动词原形。", "How about going for a walk? 去散散步怎么样？"],
    ["mind", "\\b(would you mind|do you mind|would you mind if)\\b", "Would you mind …?", "你介意…吗？（客气请求）", "后面接 -ing；回答「不介意」要说 No / Not at all。", "Would you mind opening the window? 能开下窗吗？"],
    ["wondering", "\\b(i was wondering|i wonder|i'm wondering)\\b", "I was wondering if …", "不知道能不能…（委婉）", "用过去进行时显得更客气，后面接 if / whether。", "I was wondering if you could help. 不知道你能不能帮个忙。"],
    ["dontthink", "\\b(i don't think|i didn't think|i don't believe|i don't suppose)\\b", "I don't think …", "我觉得…不…（否定前移）", "英语习惯把否定放在 think 上，中文说「我觉得不…」。", "I don't think it's true. 我觉得不是真的。"],
    // ---- 更多比较 ----
    ["prefer", "\\b(prefer|prefers|preferred)\\s(?:\\S+\\s){1,4}?(to|rather than|over)\\s", "prefer A to B", "比起 B 更喜欢 A", "prefer A to B（A、B 是名词或 -ing）；prefer to do A rather than (do) B。", "I prefer tea to coffee. 比起咖啡我更喜欢茶。"],
    ["nomorethan", "\\b(no more than|no less than|not more than|not less than|more or less|at least|at most|at best|at worst)\\b", "no more than / at least", "不超过 / 至少 / 大约", "no more than = 只不过（嫌少）；no less than = 多达（嫌多）；more or less = 差不多。", "It takes no more than ten minutes. 最多十分钟。"],
    ["sameas", "\\b(the same as|the same\\s\\S+\\sas|different from|similar to|compared to|compared with)\\b", "the same as / different from", "和…一样 / 不同 / 相比", "固定介词：the same as、different from（美式也说 than）、similar to、compared to/with。", "It's different from what I thought. 和我想的不一样。"],
    // ---- 口语常用结构 ----
    ["nopoint", "\\b(there's no point|there is no point|no point in|it's no use|it is no use|it's no good|it's pointless)\\b", "There's no point (in) doing", "做…没意义 / 没用", "后面接 -ing：There's no point arguing。", "There's no point waiting. 等也没用。"],
    ["trouble", "\\b(have|has|had|having)\\s(trouble|difficulty|a hard time|a difficult time|problems|a problem)\\s(\\S+ing)\\b", "have trouble doing", "做…有困难", "trouble / difficulty 后面直接接 -ing（不加 to）。", "I have trouble sleeping. 我睡不好觉。"],
    ["endup", "\\b(end up|ended up|ends up|ending up|wind up|wound up)\\b", "end up doing", "最后落得… / 结果…", "后面接 -ing、形容词或地点，表示没计划到的结果。", "We ended up staying all night. 结果我们待了一整夜。"],
    ["busy", "\\b(busy)\\s(\\S+ing)\\b", "be busy doing", "忙着做…", "busy 后面直接接 -ing，不说 busy to do。", "I'm busy packing. 我在忙着收拾行李。"],
    ["whatif", "^(what if)\\b", "What if …?", "要是…怎么办？", "提出假设或担心，后面接陈述句。", "What if it rains? 要是下雨怎么办？"],
    ["howcome", "\\b(how come)\\b", "How come …?", "怎么会…？", "口语里的 why，但后面用陈述语序：How come you're late?（不说 how come are you）。", "How come you didn't call? 你怎么没打电话？"],
    ["lastthing", "\\b(the last thing)\\b", "the last thing …", "最不想 / 最不可能的…", "the last thing I want = 我最不想要的。", "That's the last thing I need. 我最不需要这个了。"],
    ["wouldyourather", "\\b(would you rather)\\b", "Would you rather …?", "你宁愿…还是…？", "问偏好：Would you rather A or B，后面接动词原形。", "Would you rather stay or go? 你想留下还是走？"],
    ["getpass", "\\b(get|gets|got|getting|gotten)\\s(?:so\\s|really\\s)?(married|fired|hired|paid|hurt|caught|stolen|lost|dressed|stuck|killed|sued|bitten|beaten|chosen|promoted|robbed|arrested|involved|injured|confused|bored|tired|scared|excited|annoyed|divorced|engaged|elected|invited|picked|dumped|kicked|sacked|done|started|used|attached|ready)\\b", "get + 过去分词", "被… / 变得…（口语被动）", "口语常用 get 代替 be 构成被动，更强调变化或意外：got fired 被炒，get married 结婚，get dressed 穿衣服。", "He got fired last week. 他上周被炒了。"],
    ["havedone", "\\b(have|has|had|having|get|gets|got|getting)\\s(my|your|his|her|our|their|it|them|the)\\s(?:\\S+\\s){0,2}?(done|cut|fixed|made|taken|built|painted|cleaned|checked|repaired|delivered|washed|changed|printed|installed|removed|replaced|tested|styled|dyed|pierced|stolen)\\b", "have sth done", "让别人做 / 遭遇…", "have / get + 物 + 过去分词：请人做（I had my hair cut 我去剪了头发），或遭遇（had my phone stolen 手机被偷了）。", "I need to get my car fixed. 我得找人修车。"],
    ["imperor", "\\s(or|and)\\s(you'll|you will|you won't|you'd|you might|you're going to)\\b", "祈使句 + or / and", "…否则 / …那么就…", "Hurry up, or you'll be late（快点，否则迟到）；Try it, and you'll see（试试就知道了）。", "Be careful, or you'll fall. 小心点，不然会摔。"],
    ["partadv", "^(having)\\s(\\S+)\\b|^(given|considering|judging by|judging from|generally speaking|frankly speaking|strictly speaking|compared to|compared with|based on|speaking of|talking of)\\b", "分词短语开头", "做完… / 考虑到 / 从…看", "句首分词短语作状语，逻辑主语就是后面句子的主语：Having finished = 做完以后；given that = 考虑到；judging from = 从…来看。", "Having finished dinner, we went out. 吃完饭我们出去了。"],
    ["aside", "\\b(that being said|that said|having said that|all things considered|weather permitting|believe it or not|needless to say|to make matters worse|last but not least|what's more|in other words|on the contrary)\\b", "插入语", "话虽如此 / 不用说 / 更糟的是", "放在句首或句中的固定短语，引出转折、补充或总结，常用逗号隔开。", "That said, I still like it. 话虽如此，我还是喜欢。"],
    // ---- 从句 ----
    ["whatis", "^(what)\\s(i|you|we|they|he|she|it)\\s(?:\\S+\\s){0,4}?(is|was)\\b", "What … is …", "…的是…（主语从句）", "what 引导的从句当主语：What I need is time = 我需要的是时间。用来强调后半句。", "What I mean is, it's too late. 我的意思是太晚了。"],
    ["factthat", "\\b(the fact that|the idea that|the news that|the belief that)\\b", "the fact that …", "…这一事实（同位语从句）", "that 从句解释前面名词的内容，that 不能省略、不作成分。", "The fact that he lied upset me. 他撒谎这件事让我很难过。"],
    ["thereis", "\\b(there)\\s(is|are|was|were|isn't|aren't|wasn't|weren't|will be|won't be|has been|have been|used to be|might be|must be|could be|should be|would be)\\b|\\b(there's|there're|there'll)\\b", "There be", "某处有…", "表示存在。be 的单复数跟后面的名词走：There is a…，There are some…", "There's a problem. 有个问题。"],
    ["letsdo", "\\b(let's)\\b", "Let's …", "我们…吧", "提议大家一起做，后面接动词原形。", "Let's go. 走吧。"],
    ["whata", "^(what a|what an)\\b", "What a …!", "多么…啊！（感叹句）", "what a + (形容词) + 名词；how + 形容词。", "What a day! 这一天可真够呛！"],
    ["thing", "\\b(the thing is|the point is|the problem is|the truth is|the fact is)\\b", "The thing is …", "问题是…，其实…", "口语里引出重点或难处的开场白。", "The thing is, I'm busy. 问题是我很忙。"],
    ["reason", "\\b(the reason (?:why|is|was)|that's why|that is why)\\b", "That's why / The reason is", "这就是为什么… / 原因是…", "that's why 后面接结果，that's because 后面接原因。", "That's why I left. 所以我才走的。"],
    ["firsttime", "\\b(it's the first time|this is the first time|it was the first time|the last time|every time|next time)\\b", "the first time / every time", "第一次… / 每次…", "这些短语可以直接当连词用，后面接句子。", "Every time I see it, I laugh. 每次看到都会笑。"],
    ["incase", "\\b(in case)\\b", "in case", "以防…", "后面接一般现在时，不是「如果」。", "Take an umbrella in case it rains. 带把伞以防下雨。"],
    // ---- 最常见、优先级最低 ----
    ["relcl", "\\S\\s(who|whom|whose|which)\\s|\\b(the place|the city|the town|the house|the room|the country|somewhere|a place|the day|the time|the moment|the year|the reason)\\s(where|when|why)\\b", "定语从句", "who / which 修饰前面的名词", "who 指人、which 指物、whose 表示「…的」、where/when 指地点/时间。中文要把从句提到名词前面翻：the man who called = 打电话的那个人。前面有逗号的是补充说明，可以整个去掉。", "The guy who called is my boss. 打电话的那个人是我老板。", "nq"],
    ["doemph", "\\b(i|you|we|they|he|she|it)\\s(do|does|did)\\s(?!not\\b|you\\b|i\\b|we\\b|they\\b|it\\b|he\\b|she\\b|that\\b|this\\b|so\\b|the\\b|a\\b|an\\b|my\\b|your\\b|his\\b|her\\b|our\\b|their\\b|some\\b|what\\b|everything\\b|nothing\\b|something\\b|anything\\b|well\\b|good\\b|great\\b|too\\b|all\\b|any\\b|more\\b|much\\b|lots\\b|a\\b|me\\b|him\\b|us\\b|them\\b|now\\b|today\\b|yesterday\\b|again\\b|both\\b)([a-z]+)\\b", "do 强调", "确实… / 真的…", "肯定句里加 do / does / did + 动词原形表示强调：I do like it = 我真的喜欢。", "I did tell you! 我真的跟你说过！", "nq"],
  ];
  // 情态动词 + have done：对过去的推测、遗憾
  var MP = { name: "should / could / must have done", zh: "（本应 / 本可以 / 一定）已经…", tip: "情态动词 + have + 过去分词，说的是过去：should have done 本应该（但没做），could have done 本可以，must have done 一定已经，might have done 可能已经。", ex: "I should have called. 我本该打个电话的。" };
  var LIST = [];
  P.forEach(function (p) {
    if (p[0] === "modalperf") { LIST.push({ id: "modalperf", re: new RegExp("\\b(would|could|should|might|must)\\s(?:not\\s|never\\s|just\\s)?(have)\\s(\\S+)\\b|\\b(would've|could've|should've|might've|must've|wouldn't have|couldn't have|shouldn't have)\\b", "d"), name: MP.name, zh: MP.zh, tip: MP.tip, ex: MP.ex }); return; }
    LIST.push({ id: p[0], re: new RegExp(p[1], "d"), name: p[2], zh: p[3], tip: p[4], ex: p[5], fl: p[6] || "" });
  });
  window.VS_PAT_LIST = LIST;
  // words：字幕里按顺序的单词；返回 [{id,name,zh,tip,ex,keys:[词的序号]}]
  // raw：字幕原文（带标点），用来判断问句、反义疑问句
  window.vsPatterns = function (words, max, raw) {
    raw = String(raw || "").trim(); var isQ = /\?["”’)]*$/.test(raw);
    var toks = words.map(function (w) { return String(w).toLowerCase().replace(/’/g, "'"); });
    if (toks.length < 2) return [];
    var text = toks.join(" "), starts = [], o = 0;
    toks.forEach(function (t) { starts.push(o); o += t.length + 1; });
    var tokAt = function (c) { var lo = 0, hi = starts.length - 1; while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (starts[mid] <= c) lo = mid; else hi = mid - 1; } return lo; };
    var out = [], used = {};
    for (var i = 0; i < LIST.length && out.length < (max || 3); i++) {
      var p = LIST[i];
      if (p.fl === "nq" && isQ) continue;
      if (p.fl === "tag" && !(isQ && /,\s*[^,]{2,24}\?["”’)]*$/.test(raw) && toks.length >= 4)) continue;
      var m = p.re.exec(text); if (!m) continue;
      if (p.id === "modalperf" && m[3] && !/(ed|en|n|t|ne|wn|ung|ught|one)$/.test(m[3]) && !/^(been|had|done|gone|seen|made|said|got|known|told|heard|left|lost|met|paid|put|read|sent|set|spent|taken|thought|won|written|bought|brought|caught|felt|found|given|kept|meant|run|sold|stood|understood)$/.test(m[3])) continue;
      var keys = [];
      for (var g = 1; g < m.length; g++) { if (!m.indices[g]) continue; var a = tokAt(m.indices[g][0]), b = tokAt(Math.max(m.indices[g][0], m.indices[g][1] - 1)); for (var k = a; k <= b; k++) if (keys.indexOf(k) < 0) keys.push(k); }
      if (!keys.length) continue;
      if (keys.every(function (k) { return used[k]; })) continue; // 关键词已被更具体的句型占用
      keys.forEach(function (k) { used[k] = 1; });
      out.push({ id: p.id, name: p.name, zh: p.zh, tip: p.tip, ex: p.ex, keys: keys });
    }
    return out;
  };
})();