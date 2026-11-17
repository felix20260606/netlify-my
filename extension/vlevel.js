// 词频排名与按水平着色（content.js 与 level.js 共用）
function vsRank(w) {
  w = String(w).toLowerCase().replace(/’/g, "'");
  if (/\d/.test(w)) return 0;
  var m = VS_RANK;
  if (m[w]) return m[w];
  var c = [], n = w.length;
  function add(x) { if (x.length > 1) c.push(x); }
  if (/'s$/.test(w)) add(w.slice(0, -2));
  if (/ies$/.test(w)) add(w.slice(0, -3) + "y");
  if (/(es|ed|er)$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (/s$/.test(w)) add(w.slice(0, -1));
  if (/ied$/.test(w)) add(w.slice(0, -3) + "y");
  if (/ed$/.test(w) && /(.)\1$/.test(w.slice(0, -2))) add(w.slice(0, -3));
  if (/ing$/.test(w)) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); if (/(.)\1$/.test(w.slice(0, -3))) add(w.slice(0, -4)); }
  if (/ly$/.test(w)) add(w.slice(0, -2));
  if (/est$/.test(w)) add(w.slice(0, -3));
  var best = Infinity;
  for (var i = 0; i < c.length; i++) if (m[c[i]] && m[c[i]] < best) best = m[c[i]];
  return best;
}
// 个人标记与已收藏集合（由调用方填充）
var VS_MARKS = {}, VS_SAVED = new Set();
// 常见人名、地名、星期月份、国籍：大写出现时归入“特殊词汇”
var VS_NAMES = new Set("aaron abigail adam africa african alan alaska albert alex alexander alexis alice amanda amber america american amy andrea andrew andy angela ann anna annie anthony antonio april arizona arthur ashley asia asian atlanta august austin australia austria ava barbara beijing ben benjamin berlin betty beverly billy bob bobby boston bradley brandon brazil brenda brian britain british brittany brooklyn bruce bryan california canada canadian carl carlos carmen carol carolina carolyn catherine catholic charles charlie charlotte cheryl chicago china chinese chloe chris christian christina christine christmas christopher cindy colorado cynthia dallas dan daniel danielle danny dave david deborah debra december denise dennis denver detroit diana diane diego donald donna doris dorothy douglas dutch dylan easter eddie edward egypt elena elijah elizabeth ella ellie emily emma england english eric erica ethan eugene europe european evelyn february felix florida france frances frank fred french friday gabriel gary george georgia gerald german germany gloria grace greece greek gregory halloween hannah harold harry hawaii heather helen henry holland hollywood houston hugo india indian iran iraq ireland irish isabel isabella israel italian italy ivan jack jacob jacqueline jake james jane janet janice january japan japanese jason jean jeffrey jennifer jenny jeremy jerry jersey jesse jessica jewish jim jimmy joan joe john johnny jonathan jordan jose joseph josh joshua joyce juan judith judy julia julie july june justin karen kate katherine kathleen kathryn katie kayla keith kelly kenneth kevin kimberly korea kyle larry laura lauren lawrence lee leo liam lily linda lisa lisbon logan london louis lucas lucy luis luke madison madrid maggie manhattan marco margaret maria marie marilyn mario mark martha mary mason matt matthew max megan melissa mexican mexico mia miami michael michelle miguel mike molly monday monica moscow muslim nancy natalie nathan neil nicholas nick nicole noah norway november october ohio oliver olivia oscar pablo pamela paris patricia patrick paul pedro peter philadelphia philip poland polish portugal rachel ralph randy ray raymond rebecca richard rick robert roger rome ron ronald rosa rose roy russell russia russian ruth ryan sally sam samantha samuel sandra sara sarah saturday scotland scott scottish sean seattle september sharon shirley simon sofia sophia sophie spain spanish stephanie stephen steve steven sunday susan sweden swedish switzerland sydney ted teresa terry texas thanksgiving theresa thomas thursday tim timothy tina tokyo tom tommy tony tuesday turkey tyler vanessa vegas veronica victoria vietnam vincent virginia walter washington wayne wednesday wendy william willie york zachary zoe".split(" "));
// 数词与介词：归入“特殊词汇”（绿色）
var VS_NUM = new Set("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion dozen hundreds thousands millions billions".split(" "));
var VS_PREP_UNUSED = new Set("about above across after against along among around at before behind below beneath beside besides between beyond by despite down during except for from in inside into near of off on onto out outside over past per since through throughout to toward towards under underneath until unto up upon via with within without".split(" "));
// 分类：learn 将要学习(已收藏) / known 已掌握 / ignore 不学习 / special 名称地点数字 / suggest 建议 / rare 更生僻
function vsCat(w, S, first, capAdj) {
  var k = String(w).toLowerCase();
  if (VS_SAVED.has(k)) return "learn";
  if (VS_MARKS[k] === "known") return "known";
  if (VS_MARKS[k] === "ignore") return "ignore";
  if (S.level == null || S.level < 0) return "";
  if (/^\d/.test(w) || VS_NUM.has(k)) return "special";
  if (/^[A-Z]{2,}$/.test(w) && !/^(OK|TV|AM|PM|US|UK|ID|DJ|CEO|DNA|FBI|CIA|USA|NO|YES|OH|GO|STOP|WOW)$/.test(w)) return "special";
  if (first && /^[A-Z][a-z]/.test(w) && VS_NAMES.has(k) && !/^(mark|rose|grace|may|will|bill|jack|max|ray|lee|christian|jordan|china|turkey|georgia|virginia|carolina|frank|jean|ann|sally|penny|faith|hope|joy|dawn|april|june|august|march|sunday|monday|english|french|german|spanish|italian|russian|chinese|japanese|american|british|indian|mexican|canadian|european|african|asian|irish|scottish|greek|dutch|swedish|polish|jewish|muslim|catholic)$/.test(k)) return "special";
  if (!first && /^[A-Z]/.test(w) && w !== "I" && !/^I['’]/.test(w)) { var r0 = VS_RANK[k] || VS_RANK[typeof vsLemma === "function" ? vsLemma(k) : k]; if (capAdj || !r0 || r0 > 8000 || VS_NAMES.has(k)) return "special"; }
  var r = vsRank(k), lm = typeof vsLemma === "function" ? vsLemma(k) : k;
  if (lm !== k && VS_RANK[lm] && VS_RANK[lm] < r) r = VS_RANK[lm]; // 按原形判断难度
  if (r <= S.level) return "known";
  return r <= S.level + Math.max(S.level, 300) * (S.ratio || 1.5) ? "suggest" : "rare";
}
function vsClass(w, S, first, capAdj) {
  if (S.showMarks === false) return "";
  var c = vsCat(w, S, first, capAdj);
  if (c === "known") return S.greenKnown ? "vs-k" : "";
  if (c === "special") return S.showSpecial !== false ? "vs-sp" : "";
  if (c === "learn") return (S.showLearn !== false ? "vs-ln " : "") + (S.showLearnOutline !== false ? "vs-lo" : "");
  if (c === "suggest") return S.showSuggest !== false ? "vs-u1" : "";
  if (c === "ignore") return S.showIgnore !== false ? "vs-u2" : "";
  if (c === "rare") return S.showIgnore === false ? "" : "vs-u2" + (S.fadeRare && vsRank(w) > 15000 ? " vs-rare" : "");
  return "";
}
// 给一段已转义文本里的单词加标记
var VS_WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
function vsMark(escaped, S, cls) {
  return escaped.replace(VS_WORD_RE, function (w, off, str) {
    var prev = str.slice(0, off).replace(/\s+$/, ""), first = !prev || /[.?!…“‘"'(\[:;—–\-]$/.test(prev), capAdj = false;
    if (/^[A-Z]/.test(w)) {
      if (/^\s+[A-Z][a-z]/.test(str.slice(off + w.length))) capAdj = true;
      var pm = /([A-Za-z'’\-]+)$/.exec(prev);
      if (pm && /^[A-Z][a-z]/.test(pm[1]) && pm[1] !== "I") { var pp = prev.slice(0, pm.index).replace(/\s+$/, ""); if (pp && !/[.?!…“(\[]$/.test(pp)) capAdj = true; }
    }
    return '<span class="' + (cls || "vs-w") + " " + vsClass(w, S, first, capAdj) + '" data-w="' + w + '">' + w + "</span>";
  });
}

function vsStems(w) {
  w = String(w).toLowerCase(); var c = [];
  function add(x) { if (x.length > 1 && x !== w && c.indexOf(x) < 0) c.push(x); }
  if (typeof VS_IRR !== "undefined" && VS_IRR[w]) add(VS_IRR[w]);
  if (/'s$/.test(w)) add(w.slice(0, -2));
  if (/ies$/.test(w)) add(w.slice(0, -3) + "y");
  if (/(es|ed|er)$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (/s$/.test(w)) add(w.slice(0, -1));
  if (/ied$/.test(w)) add(w.slice(0, -3) + "y");
  if (/ed$/.test(w) && /(.)\1$/.test(w.slice(0, -2))) add(w.slice(0, -3));
  if (/ing$/.test(w)) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); if (/(.)\1$/.test(w.slice(0, -3))) add(w.slice(0, -4)); }
  if (/ly$/.test(w)) add(w.slice(0, -2));
  return c;
}

var VS_IRR = {"went": "go", "gone": "go", "goes": "go", "was": "be", "were": "be", "been": "be", "is": "be", "are": "be", "am": "be", "being": "be", "had": "have", "has": "have", "having": "have", "did": "do", "done": "do", "does": "do", "doing": "do", "said": "say", "made": "make", "got": "get", "gotten": "get", "took": "take", "taken": "take", "came": "come", "saw": "see", "seen": "see", "knew": "know", "known": "know", "thought": "think", "gave": "give", "given": "give", "found": "find", "told": "tell", "became": "become", "left": "leave", "felt": "feel", "brought": "bring", "began": "begin", "begun": "begin", "kept": "keep", "held": "hold", "wrote": "write", "written": "write", "stood": "stand", "heard": "hear", "meant": "mean", "met": "meet", "ran": "run", "paid": "pay", "sat": "sit", "spoke": "speak", "spoken": "speak", "grew": "grow", "grown": "grow", "lost": "lose", "fell": "fall", "fallen": "fall", "sent": "send", "built": "build", "understood": "understand", "drew": "draw", "drawn": "draw", "broke": "break", "broken": "break", "spent": "spend", "rose": "rise", "risen": "rise", "drove": "drive", "driven": "drive", "bought": "buy", "wore": "wear", "worn": "wear", "chose": "choose", "chosen": "choose", "sought": "seek", "threw": "throw", "thrown": "throw", "caught": "catch", "dealt": "deal", "won": "win", "forgot": "forget", "forgotten": "forget", "led": "lead", "sold": "sell", "slept": "sleep", "woke": "wake", "woken": "wake", "dove": "dive", "ate": "eat", "eaten": "eat", "drank": "drink", "drunk": "drink", "flew": "fly", "flown": "fly", "sang": "sing", "sung": "sing", "swam": "swim", "swum": "swim", "taught": "teach", "fought": "fight", "hid": "hide", "hidden": "hide", "shook": "shake", "shaken": "shake", "stole": "steal", "stolen": "steal", "froze": "freeze", "frozen": "freeze", "rode": "ride", "ridden": "ride", "bit": "bite", "bitten": "bite", "blew": "blow", "blown": "blow", "hung": "hang", "struck": "strike", "stuck": "stick", "swept": "sweep", "bent": "bend", "lent": "lend", "shot": "shoot", "fed": "feed", "fled": "flee", "dug": "dig", "spun": "spin", "swung": "swing", "wept": "weep", "crept": "creep", "knelt": "kneel", "leapt": "leap", "dreamt": "dream", "burnt": "burn", "learnt": "learn", "lit": "light", "shone": "shine", "slid": "slide", "tore": "tear", "torn": "tear", "swore": "swear", "sworn": "swear", "bore": "bear", "borne": "bear", "forgave": "forgive", "forgiven": "forgive", "withdrew": "withdraw", "withdrawn": "withdraw", "overcame": "overcome", "undertook": "undertake", "undertaken": "undertake", "mistook": "mistake", "mistaken": "mistake", "arose": "arise", "arisen": "arise", "awoke": "awake", "awoken": "awake", "beaten": "beat", "bound": "bind", "sank": "sink", "sunk": "sink", "shrank": "shrink", "shrunk": "shrink", "rang": "ring", "rung": "ring", "sprang": "spring", "sprung": "spring", "men": "man", "women": "woman", "children": "child", "feet": "foot", "teeth": "tooth", "mice": "mouse", "geese": "goose", "lives": "life", "wives": "wife", "knives": "knife", "selves": "self", "halves": "half", "wolves": "wolf", "shelves": "shelf", "thieves": "thief"};
var VS_NOSTEM = new Set("news this his is was has does its us as yes always perhaps series species means less unless bus plus thus gas during thing king ring bring sing spring string wing nothing something anything everything morning evening red bed need feed seed speed indeed hundred sacred naked wicked wed shed ceiling darling sibling pudding class glass grass pass mass boss loss cross dress press stress process access success business address across miss kiss guess bless focus bonus status virus campus versus analysis basis crisis physics politics mathematics economics athletics lens chaos bias canvas christmas clothes".split(" "));
// 原形：不规则表优先，其次规则变形（词表里存在才算）
function vsLemma(w) {
  w = String(w).toLowerCase().replace(/’/g, "'");
  if (VS_IRR[w]) return VS_IRR[w];
  if (VS_NOSTEM.has(w) || w.length < 4) return w;
  var c = [];
  if (/'s$/.test(w)) c.push(w.slice(0, -2));
  if (/ies$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/ied$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/(es|ed)$/.test(w)) { c.push(w.slice(0, -2)); c.push(w.slice(0, -1)); }
  if (/ed$/.test(w) && /(.)\1$/.test(w.slice(0, -2))) c.push(w.slice(0, -3));
  if (/ing$/.test(w)) { if (/(.)\1$/.test(w.slice(0, -3))) c.push(w.slice(0, -4)); c.push(w.slice(0, -3)); c.push(w.slice(0, -3) + "e"); }
  if (/s$/.test(w) && !/ss$/.test(w)) c.push(w.slice(0, -1));
  if (/iest$/.test(w)) c.push(w.slice(0, -4) + "y");
  var best = w, br = Infinity;
  for (var i = 0; i < c.length; i++) { var r = VS_RANK[c[i]]; if (c[i].length >= 3 && r && r < br) { best = c[i]; br = r; } }
  if (best === w && !VS_RANK[w]) { if (/'s$/.test(w)) return vsLemma(w.slice(0, -2)); if (/[^s]s$/.test(w) && w.length > 4) return w.slice(0, -1); }
  return best;
}
