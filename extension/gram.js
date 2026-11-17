// 语法标记：把英语里中文没有的形式用下划线标出来（时态、被动、复数、冠词等）
var VS_GRAM_NAME = { pa: "过去时", pf: "完成时", pg: "进行时", md: "将来 / 情态", pv: "被动语态", s3: "第三人称单数", pl: "复数", art: "冠词", cmp: "比较级 / 最高级", neg: "否定缩写" };
(function () {
  // 不规则动词：原形 过去式 过去分词
  var T = "be was/were been|have had had|do did done|go went gone|say said said|get got got/gotten|make made made|know knew known|think thought thought|take took taken|see saw seen|come came come|give gave given|find found found|tell told told|become became become|leave left left|feel felt felt|put put put|bring brought brought|begin began begun|keep kept kept|hold held held|write wrote written|stand stood stood|hear heard heard|let let let|mean meant meant|set set set|meet met met|run ran run|pay paid paid|sit sat sat|speak spoke spoken|lie lay lain|lead led led|read read read|grow grew grown|lose lost lost|fall fell fallen|send sent sent|build built built|understand understood understood|draw drew drawn|break broke broken|spend spent spent|cut cut cut|rise rose risen|drive drove driven|buy bought bought|wear wore worn|choose chose chosen|eat ate eaten|teach taught taught|catch caught caught|fight fought fought|throw threw thrown|sell sold sold|win won won|forget forgot forgotten|sleep slept slept|sing sang sung|swim swam swum|fly flew flown|ride rode ridden|wake woke woken|shake shook shaken|steal stole stolen|hide hid hidden|bite bit bitten|blow blew blown|freeze froze frozen|forgive forgave forgiven|drink drank drunk|ring rang rung|sink sank sunk|feed fed fed|bend bent bent|lend lent lent|deal dealt dealt|dig dug dug|hang hung hung|shoot shot shot|stick stuck stuck|strike struck struck|sweep swept swept|swing swung swung|tear tore torn|bear bore born/borne|beat beat beaten|bind bound bound|bleed bled bled|breed bred bred|burn burnt burnt|creep crept crept|dive dove dived|dream dreamt dreamt|flee fled fled|grind ground ground|kneel knelt knelt|lay laid laid|leap leapt leapt|light lit lit|seek sought sought|shine shone shone|slide slid slid|spin spun spun|spit spat spat|split split split|spread spread spread|sting stung stung|swear swore sworn|weep wept wept|wind wound wound|withdraw withdrew withdrawn|hurt hurt hurt|hit hit hit|shut shut shut|cost cost cost|quit quit quit|overcome overcame overcome|undergo underwent undergone|arise arose arisen|awake awoke awoken|forbid forbade forbidden|mistake mistook mistaken|show showed shown|prove proved proven|swell swelled swollen|sew sewed sewn|sow sowed sown";
  var PAST = {}, PP = {}, SAME = {};
  T.split("|").forEach(function (r) { var a = r.split(" "); a[1].split("/").forEach(function (x) { PAST[x] = a[0]; }); a[2].split("/").forEach(function (x) { PP[x] = a[0]; }); if (a[0] === a[1]) SAME[a[0]] = 1; });
  var set = function (s) { var o = {}; s.split(" ").forEach(function (x) { o[x] = 1; }); return o; };
  var BE = set("am is are was were be been being isn't aren't wasn't weren't"), HAVE = set("have has had haven't hasn't hadn't having");
  var MODAL = set("will would can could may might shall should must won't wouldn't can't cannot couldn't shouldn't mustn't mightn't shan't gonna");
  var ADV = set("not never always just still also already really actually ever only even probably certainly definitely often usually sometimes finally simply ever now then all both so n't quite totally completely literally basically");
  var DET = set("the a an this that these those my your his her its our their some any no every each many much few several all both other another such what which whose two three four five six seven eight nine ten of in on at for with by from about into over under between among than as and or but");
  var OBJ = set("the a an this that these those my your his her its our their it him them me us you something anything everything nothing someone people");
  var SUBJ3 = set("he she it who that which this everyone everybody someone somebody nobody anyone anybody everything something nothing there what one");
  var NOING = set("thing nothing something anything everything king ring sing bring spring string wing morning evening during ceiling sibling darling interesting amazing boring exciting surprising confusing annoying willing according including regarding following building meeting wedding feeling painting beginning ending meaning clothing nursing");
  var NOED = set("need speed feed seed weed bed red hundred shed sacred naked wicked indeed proceed exceed succeed bleed breed embed");
  var NOS = set("this his is was has does its us as yes always perhaps series species means less unless bus plus thus gas news politics physics mathematics economics ethics sometimes besides towards afterwards whereas across class glass grass pass boss loss miss kiss dress stress process success access address business focus status campus virus bonus chaos crisis basis analysis thesis emphasis jesus famous various serious obvious previous nervous curious dangerous enormous anxious conscious religious ridiculous tremendous gorgeous generous jealous");
  var PLIRR = set("people men women children feet teeth mice geese lives wives knives leaves selves themselves ourselves yourselves");
  var CMP = set("better best worse worst bigger biggest smaller smallest larger largest older oldest younger youngest higher highest lower lowest longer longest shorter shortest faster fastest slower slowest easier easiest harder hardest earlier earliest later latest closer closest greater greatest stronger strongest weaker weakest happier happiest simpler simplest cheaper cheapest richer richest poorer poorest smarter smartest nicer nicest deeper deepest wider widest safer safest cleaner clearer clearest darker darkest lighter heavier heaviest hotter hottest colder coldest warmer cooler newer newest fewer fewest further furthest farther farthest busier funnier funniest quicker quickest sooner louder brighter brightest taller tallest thicker thinner tougher toughest wiser elder eldest lesser least");
  function norm(w) { return w.toLowerCase().replace(/’/g, "'"); }
  function isPP(l) { return !!PP[l] || isEd(l); }
  function isEd(l) { return l.length > 3 && /ed$/.test(l) && !NOED[l] && typeof vsLemma === "function" && vsLemma(l) !== l; }
  function isIng(l) { return l.length > 4 && /ing$/.test(l) && !NOING[l]; }
  // 返回每个词的标记数组（每个元素是用空格分开的类名）
  window.vsGram = function (words) {
    var L = words.map(norm), n = L.length, out = new Array(n), i, j, k;
    function add(x, c) { if (x < 0 || x >= n) return; var cur = out[x] ? out[x].split(" ") : []; if (cur.indexOf(c) < 0) { cur = cur.filter(function (y) { return y === "g-neg" || c === "g-neg"; }); cur.push(c); out[x] = cur.join(" "); } }
    function has(x, c) { return !!out[x] && out[x].split(" ").indexOf(c) >= 0; }
    function tense(x) { return !!out[x] && /g-(pa|pf|pg|md|pv|s3)/.test(out[x]); }
    function ahead(x, test, max) { for (var m = x + 1; m < n && m <= x + (max || 3); m++) { if (test(L[m])) return m; if (!ADV[L[m]]) return -1; } return -1; }
    for (i = 0; i < n; i++) {
      var l = L[i], prev = i ? L[i - 1] : "", next = i + 1 < n ? L[i + 1] : "";
      if (/n't$/.test(l) || l === "cannot") add(i, "g-neg");
      if (l === "a" || l === "an" || l === "the") { add(i, "g-art"); continue; }
      if (tense(i)) continue;
      var m3 = /^(.+)'(ll|ve|re|m|d|s)$/.exec(l), tail = m3 ? m3[2] : "";
      // 情态 / 将来
      if (MODAL[l] || tail === "ll") { add(i, "g-md"); j = ahead(i, function (x) { return x === "have"; }, 2); if (j > 0) { k = ahead(j, isPP, 2); if (k > 0) { add(j, "g-pf"); add(k, "g-pf"); } } continue; }
      // have + 过去分词 = 完成时
      if (HAVE[l] || tail === "ve" || tail === "d" || tail === "s") {
        j = ahead(i, isPP, 3);
        if (j > 0 && (HAVE[l] || tail === "ve" || tail === "d" || (tail === "s" && /^(been|gone|come|become|got|gotten|had|done|seen|made|taken)$/.test(L[j])))) {
          add(i, "g-pf");
          if (L[j] === "been") { add(j, "g-pf"); k = ahead(j, function (x) { return isIng(x) || isPP(x); }, 3); if (k > 0) add(k, isIng(L[k]) ? "g-pg" : "g-pv"); }
          else add(j, "g-pf");
          continue;
        }
        if (tail === "d") { add(i, "g-md"); continue; }
        if (l === "had" || l === "hadn't") { add(i, "g-pa"); continue; }
        if (l === "has" || l === "hasn't") { add(i, "g-s3"); continue; }
        if (HAVE[l] || tail === "ve") continue;
      }
      // be + doing = 进行时；be + done = 被动；be going to = 将来
      if (BE[l] || tail === "re" || tail === "m" || tail === "s") {
        j = ahead(i, function (x) { return isIng(x) || isPP(x); }, 3);
        if (j > 0) {
          if (L[j] === "going" && L[j + 1] === "to") { add(i, "g-md"); add(j, "g-md"); add(j + 1, "g-md"); }
          else if (L[j] === "being") { k = ahead(j, isPP, 2); add(i, "g-pg"); add(j, "g-pg"); if (k > 0) add(k, "g-pv"); }
          else if (isIng(L[j])) { add(i, "g-pg"); add(j, "g-pg"); }
          else if (L[j] !== "been") { add(i, "g-pv"); add(j, "g-pv"); }
          if (tense(i)) continue;
        }
        if (/^(was|were|wasn't|weren't)$/.test(l)) add(i, "g-pa");
        else if (l === "is" || l === "isn't") add(i, "g-s3");
        continue;
      }
      if (l === "did" || l === "didn't") { add(i, "g-pa"); continue; }
      if (l === "does" || l === "doesn't") { add(i, "g-s3"); continue; }
      if (l === "going" && next === "to" && BE[prev]) continue;
      // 一般过去时
      if (PAST[l] && !SAME[PAST[l]] && !(PP[l] && (DET[prev] && !SUBJ3[prev]) && /^(a|an|the|my|your|his|her|its|our|their)$/.test(prev))) { if (!(PP[l] && !PAST[l])) { add(i, "g-pa"); continue; } }
      if (isEd(l) && !/^(a|an|the|my|your|his|her|its|our|their|very|so|too|more|most|quite|really|pretty)$/.test(prev)) { add(i, "g-pa"); continue; }
      // 比较级
      if (CMP[l] || ((l === "more" || l === "most" || l === "less") && next && !DET[next] && !/^(of|than|and|or)$/.test(next))) { add(i, "g-cmp"); continue; }
      // 复数 / 第三人称单数
      if (PLIRR[l]) { add(i, "g-pl"); continue; }
      if (/[a-z]s$/.test(l) && !/(ss|us|is|ous)$/.test(l) && !NOS[l] && !/'/.test(l) && l.length > 3 && typeof vsLemma === "function" && vsLemma(l) !== l) {
        var verbish = SUBJ3[prev] || (OBJ[next] && prev && !DET[prev]);
        add(i, verbish && !/^(this|that|one|what|which|there)$/.test(prev) || (SUBJ3[prev] && /^(he|she|it|who|everyone|everybody|someone|somebody|nobody|anyone|anybody)$/.test(prev)) || (OBJ[next] && prev && !DET[prev] && !SUBJ3[prev]) ? "g-s3" : "g-pl");
      }
    }
    return out;
  };
  // 给 vsMark 生成的 HTML 加上语法类名
  window.vsGramHtml = function (html) {
    var ws = [], re = /<span class="vs-w ([^"]*)" data-w="([^"]+)">/g, m;
    while ((m = re.exec(html))) ws.push(m[2]);
    if (!ws.length) return html;
    var g = window.vsGram(ws), i = 0;
    return html.replace(re, function (a, cl, w) { var c = g[i++]; return c ? '<span class="vs-w ' + cl + " " + c + '" data-w="' + w + '">' : a; });
  };
})();
