/* ============================================================
   myvocab — Irregular Verbs Dataset
   83 ta noto'g'ri fe'l, o'qituvchi varaqasidagi 10 ta guruh bo'yicha.

   Format (10 maydon, uch shakl "|" bilan ajratiladi):
   [ formsBR, formsUS(yoki null), ipaBR, latBR, cyrBR, ipaUS, latUS, cyrUS, RU, UZ ]

   Masalan: "burn|burnt|burnt" (BrE) va "burn|burned|burned" (AmE)
   ============================================================ */
const VERB_GROUPS = [

 {key:"g1", title:"1 · A–A–A", hint:"uchala shakli bir xil", v:[
  ["cost|cost|cost",null,"/kɒst/|/kɒst/|/kɒst/","kost|kost|kost","кост|кост|кост","/kɔːst/|/kɔːst/|/kɔːst/","koost|koost|koost","коост|коост|коост","Стоить","Narxlamoq, turmoq"],
  ["cut|cut|cut",null,"/kʌt/|/kʌt/|/kʌt/","kat|kat|kat","кат|кат|кат","/kʌt/|/kʌt/|/kʌt/","kat|kat|kat","кат|кат|кат","Резать","Kesmoq, qirqmoq"],
  ["hit|hit|hit",null,"/hɪt/|/hɪt/|/hɪt/","hit|hit|hit","хит|хит|хит","/hɪt/|/hɪt/|/hɪt/","hit|hit|hit","хит|хит|хит","Бить, ударять","Urmoq"],
  ["hurt|hurt|hurt",null,"/hɜːt/|/hɜːt/|/hɜːt/","hyot|hyot|hyot","хёт|хёт|хёт","/hɝːt/|/hɝːt/|/hɝːt/","hyort|hyort|hyort","хёрт|хёрт|хёрт","Повредить, ранить","Jarohatlamoq, og‘ritmoq"],
  ["let|let|let",null,"/let/|/let/|/let/","let|let|let","лэт|лэт|лэт","/let/|/let/|/let/","let|let|let","лэт|лэт|лэт","Разрешать","Ruxsat bermoq"],
  ["put|put|put",null,"/pʊt/|/pʊt/|/pʊt/","put|put|put","пут|пут|пут","/pʊt/|/pʊt/|/pʊt/","put|put|put","пут|пут|пут","Ставить, класть","Qo‘ymoq"],
  ["shut|shut|shut",null,"/ʃʌt/|/ʃʌt/|/ʃʌt/","shat|shat|shat","шат|шат|шат","/ʃʌt/|/ʃʌt/|/ʃʌt/","shat|shat|shat","шат|шат|шат","Закрывать","Yopmoq"]
 ]},

 {key:"g2", title:"2 · -t / -d", hint:"A–B–B, oxiri -t yoki -d", v:[
  ["lend|lent|lent",null,"/lend/|/lent/|/lent/","lend|lent|lent","лэнд|лэнт|лэнт","/lend/|/lent/|/lent/","lend|lent|lent","лэнд|лэнт|лэнт","Одалживать, давать в долг","Qarz bermoq"],
  ["send|sent|sent",null,"/send/|/sent/|/sent/","send|sent|sent","сэнд|сэнт|сэнт","/send/|/sent/|/sent/","send|sent|sent","сэнд|сэнт|сэнт","Отправлять","Yubormoq, jo‘natmoq"],
  ["spend|spent|spent",null,"/spend/|/spent/|/spent/","spend|spent|spent","спэнд|спэнт|спэнт","/spend/|/spent/|/spent/","spend|spent|spent","спэнд|спэнт|спэнт","Тратить","Sarflamoq"],
  ["build|built|built",null,"/bɪld/|/bɪlt/|/bɪlt/","bild|bilt|bilt","билд|билт|билт","/bɪld/|/bɪlt/|/bɪlt/","bild|bilt|bilt","билд|билт|билт","Строить","Qurmoq"],
  ["burn|burnt|burnt","burn|burned|burned","/bɜːn/|/bɜːnt/|/bɜːnt/","byon|byont|byont","бён|бёнт|бёнт","/bɝːn/|/bɝːnd/|/bɝːnd/","byorn|byornd|byornd","бёрн|бёрнд|бёрнд","Гореть, жечь","Yonmoq, yondirmoq"],
  ["learn|learnt|learnt","learn|learned|learned","/lɜːn/|/lɜːnt/|/lɜːnt/","lyon|lyont|lyont","лён|лёнт|лёнт","/lɝːn/|/lɝːnd/|/lɝːnd/","lyorn|lyornd|lyornd","лёрн|лёрнд|лёрнд","Учиться, изучать","O‘rganmoq"],
  ["smell|smelt|smelt","smell|smelled|smelled","/smel/|/smelt/|/smelt/","smel|smelt|smelt","смэл|смэлт|смэлт","/smel/|/smeld/|/smeld/","smel|smeld|smeld","смэл|смэлд|смэлд","Нюхать, пахнуть","Hidlamoq, hid taratmoq"],
  ["feel|felt|felt",null,"/fiːl/|/felt/|/felt/","fiil|felt|felt","фиил|фэлт|фэлт","/fiːl/|/felt/|/felt/","fiil|felt|felt","фиил|фэлт|фэлт","Чувствовать","His qilmoq"],
  ["leave|left|left",null,"/liːv/|/left/|/left/","liiv|left|left","лиив|лэфт|лэфт","/liːv/|/left/|/left/","liiv|left|left","лиив|лэфт|лэфт","Оставлять, покидать","Tark etmoq, qoldirmoq"],
  ["meet|met|met",null,"/miːt/|/met/|/met/","miit|met|met","миит|мэт|мэт","/miːt/|/met/|/met/","miit|met|met","миит|мэт|мэт","Встречаться","Uchrashmoq"],
  ["dream|dreamt|dreamt","dream|dreamed|dreamed","/driːm/|/dremt/|/dremt/","driim|dremt|dremt","дриим|дрэмт|дрэмт","/driːm/|/driːmd/|/driːmd/","driim|driimd|driimd","дриим|дриимд|дриимд","Мечтать, видеть во сне","Orzu qilmoq, tush ko‘rmoq"],
  ["mean|meant|meant",null,"/miːn/|/ment/|/ment/","miin|ment|ment","миин|мэнт|мэнт","/miːn/|/ment/|/ment/","miin|ment|ment","миин|мэнт|мэнт","Означать, иметь в виду","Anglatmoq, nazarda tutmoq"],
  ["lose|lost|lost",null,"/luːz/|/lɒst/|/lɒst/","luuz|lost|lost","луз|лост|лост","/luːz/|/lɔːst/|/lɔːst/","luuz|loost|loost","луз|лоост|лоост","Терять","Yo‘qotmoq"],
  ["shoot|shot|shot",null,"/ʃuːt/|/ʃɒt/|/ʃɒt/","shuut|shot|shot","шуут|шот|шот","/ʃuːt/|/ʃɑːt/|/ʃɑːt/","shuut|shaat|shaat","шуут|шаат|шаат","Стрелять","Otmoq, o‘q uzmoq"],
  ["get|got|got","get|got|gotten","/ɡet/|/ɡɒt/|/ɡɒt/","get|got|got","гэт|гот|гот","/ɡet/|/ɡɑːt/|/ˈɡɑːtn/","get|gaat|gaadn","гэт|гаат|гаадн","Получать, иметь","Ega bo‘lmoq, olib kelmoq"],
  ["light|lit|lit",null,"/laɪt/|/lɪt/|/lɪt/","layt|lit|lit","лайт|лит|лит","/laɪt/|/lɪt/|/lɪt/","layt|lit|lit","лайт|лит|лит","Зажигать","Yoqmoq, yondirmoq"],
  ["sit|sat|sat",null,"/sɪt/|/sæt/|/sæt/","sit|set|set","сит|сэт|сэт","/sɪt/|/sæt/|/sæt/","sit|set|set","сит|сэт|сэт","Сидеть","O‘tirmoq"],
  ["keep|kept|kept",null,"/kiːp/|/kept/|/kept/","kiip|kept|kept","киип|кэпт|кэпт","/kiːp/|/kept/|/kept/","kiip|kept|kept","киип|кэпт|кэпт","Хранить, держать","Saqlamoq"],
  ["sleep|slept|slept",null,"/sliːp/|/slept/|/slept/","sliip|slept|slept","слиип|слэпт|слэпт","/sliːp/|/slept/|/slept/","sliip|slept|slept","слиип|слэпт|слэпт","Спать","Uxlamoq"]
 ]},

 {key:"g3", title:"3 · -ought / -aught", hint:"A–B–B, /ɔːt/ tovushi", v:[
  ["bring|brought|brought",null,"/brɪŋ/|/brɔːt/|/brɔːt/","bring|broot|broot","бринг|броот|броот","/brɪŋ/|/brɔːt/|/brɔːt/","bring|broot|broot","бринг|броот|броот","Приносить","Olib kelmoq"],
  ["buy|bought|bought",null,"/baɪ/|/bɔːt/|/bɔːt/","bay|boot|boot","бай|боот|боот","/baɪ/|/bɔːt/|/bɔːt/","bay|boot|boot","бай|боот|боот","Покупать","Sotib olmoq"],
  ["fight|fought|fought",null,"/faɪt/|/fɔːt/|/fɔːt/","fayt|foot|foot","файт|фоот|фоот","/faɪt/|/fɔːt/|/fɔːt/","fayt|foot|foot","файт|фоот|фоот","Драться, сражаться","Urushmoq, jang qilmoq"],
  ["think|thought|thought",null,"/θɪŋk/|/θɔːt/|/θɔːt/","think|thoot|thoot","синк|соот|соот","/θɪŋk/|/θɔːt/|/θɔːt/","think|thoot|thoot","синк|соот|соот","Думать","O‘ylamoq"],
  ["catch|caught|caught",null,"/kætʃ/|/kɔːt/|/kɔːt/","kech|koot|koot","кэч|коот|коот","/kætʃ/|/kɔːt/|/kɔːt/","kech|koot|koot","кэч|коот|коот","Ловить","Tutmoq, ushlamoq"],
  ["teach|taught|taught",null,"/tiːtʃ/|/tɔːt/|/tɔːt/","tiich|toot|toot","тиич|тоот|тоот","/tiːtʃ/|/tɔːt/|/tɔːt/","tiich|toot|toot","тиич|тоот|тоот","Преподавать, учить","O‘qitmoq"]
 ]},

 {key:"g4", title:"4 · A–B–B", hint:"2- va 3- shakl bir xil", v:[
  ["sell|sold|sold",null,"/sel/|/səʊld/|/səʊld/","sel|sould|sould","сэл|соулд|соулд","/sel/|/soʊld/|/soʊld/","sel|sould|sould","сэл|соулд|соулд","Продавать","Sotmoq"],
  ["tell|told|told",null,"/tel/|/təʊld/|/təʊld/","tel|tould|tould","тэл|тоулд|тоулд","/tel/|/toʊld/|/toʊld/","tel|tould|tould","тэл|тоулд|тоулд","Сказать, рассказать","Aytmoq"],
  ["find|found|found",null,"/faɪnd/|/faʊnd/|/faʊnd/","faynd|faund|faund","файнд|фаунд|фаунд","/faɪnd/|/faʊnd/|/faʊnd/","faynd|faund|faund","файнд|фаунд|фаунд","Находить","Topmoq"],
  ["have|had|had",null,"/hæv/|/hæd/|/hæd/","hev|hed|hed","хэв|хэд|хэд","/hæv/|/hæd/|/hæd/","hev|hed|hed","хэв|хэд|хэд","Иметь","Bor bo‘lmoq, ega bo‘lmoq"],
  ["hear|heard|heard",null,"/hɪə(r)/|/hɜːd/|/hɜːd/","hia|hyod|hyod","хиа|хёд|хёд","/hɪr/|/hɝːd/|/hɝːd/","hir|hyord|hyord","хир|хёрд|хёрд","Слышать","Eshitmoq"],
  ["hold|held|held",null,"/həʊld/|/held/|/held/","hould|held|held","хоулд|хэлд|хэлд","/hoʊld/|/held/|/held/","hould|held|held","хоулд|хэлд|хэлд","Держать","Ushlab turmoq"],
  ["read|read|read",null,"/riːd/|/red/|/red/","riid|red|red","риид|рэд|рэд","/riːd/|/red/|/red/","riid|red|red","риид|рэд|рэд","Читать","O‘qimoq"],
  ["say|said|said",null,"/seɪ/|/sed/|/sed/","sey|sed|sed","сэй|сэд|сэд","/seɪ/|/sed/|/sed/","sey|sed|sed","сэй|сэд|сэд","Сказать, говорить","Gapirmoq, aytmoq"],
  ["pay|paid|paid",null,"/peɪ/|/peɪd/|/peɪd/","pey|peyd|peyd","пэй|пэйд|пэйд","/peɪ/|/peɪd/|/peɪd/","pey|peyd|peyd","пэй|пэйд|пэйд","Платить","To‘lamoq"],
  ["make|made|made",null,"/meɪk/|/meɪd/|/meɪd/","meyk|meyd|meyd","мэйк|мэйд|мэйд","/meɪk/|/meɪd/|/meɪd/","meyk|meyd|meyd","мэйк|мэйд|мэйд","Делать, создавать","Yasamoq, qilmoq"],
  ["stand|stood|stood",null,"/stænd/|/stʊd/|/stʊd/","stend|stud|stud","стэнд|студ|студ","/stænd/|/stʊd/|/stʊd/","stend|stud|stud","стэнд|студ|студ","Стоять","Turmoq"],
  ["understand|understood|understood",null,"/ˌʌndəˈstænd/|/ˌʌndəˈstʊd/|/ˌʌndəˈstʊd/","andastend|andastud|andastud","андастэнд|андастуд|андастуд","/ˌʌndɚˈstænd/|/ˌʌndɚˈstʊd/|/ˌʌndɚˈstʊd/","andarstend|andarstud|andarstud","андарстэнд|андарстуд|андарстуд","Понимать","Tushunmoq"]
 ]},

 {key:"g5", title:"5 · -oke / -oken", hint:"A–B–C", v:[
  ["break|broke|broken",null,"/breɪk/|/brəʊk/|/ˈbrəʊkən/","breyk|brouk|broukan","брэйк|броук|броукан","/breɪk/|/broʊk/|/ˈbroʊkən/","breyk|brouk|broukan","брэйк|броук|броукан","Ломать","Sindirmoq"],
  ["choose|chose|chosen",null,"/tʃuːz/|/tʃəʊz/|/ˈtʃəʊzn/","chuuz|chouz|chouzn","чууз|чоуз|чоузн","/tʃuːz/|/tʃoʊz/|/ˈtʃoʊzn/","chuuz|chouz|chouzn","чууз|чоуз|чоузн","Выбирать","Tanlamoq"],
  ["speak|spoke|spoken",null,"/spiːk/|/spəʊk/|/ˈspəʊkən/","spiik|spouk|spoukan","спиик|споук|споукан","/spiːk/|/spoʊk/|/ˈspoʊkən/","spiik|spouk|spoukan","спиик|споук|споукан","Говорить","Gapirmoq, so‘zlamoq"],
  ["steal|stole|stolen",null,"/stiːl/|/stəʊl/|/ˈstəʊlən/","stiil|stoul|stoulan","стиил|стоул|стоулан","/stiːl/|/stoʊl/|/ˈstoʊlən/","stiil|stoul|stoulan","стиил|стоул|стоулан","Воровать, красть","O‘g‘irlamoq"],
  ["wake|woke|woken",null,"/weɪk/|/wəʊk/|/ˈwəʊkən/","veyk|vouk|voukan","вэйк|воук|воукан","/weɪk/|/woʊk/|/ˈwoʊkən/","veyk|vouk|voukan","вэйк|воук|воукан","Просыпаться, будить","Uyg‘onmoq, uyg‘otmoq"]
 ]},

 {key:"g6", title:"6 · -ove / -iven", hint:"aɪ → -en", v:[
  ["drive|drove|driven",null,"/draɪv/|/drəʊv/|/ˈdrɪvn/","drayv|drouv|drivn","драйв|дроув|дривн","/draɪv/|/droʊv/|/ˈdrɪvn/","drayv|drouv|drivn","драйв|дроув|дривн","Водить, управлять","Boshqarmoq, haydamoq"],
  ["ride|rode|ridden",null,"/raɪd/|/rəʊd/|/ˈrɪdn/","rayd|roud|ridn","райд|роуд|ридн","/raɪd/|/roʊd/|/ˈrɪdn/","rayd|roud|ridn","райд|роуд|ридн","Ездить верхом, кататься","Minmoq, otda sayr qilmoq"],
  ["rise|rose|risen",null,"/raɪz/|/rəʊz/|/ˈrɪzn/","rayz|rouz|rizn","райз|роуз|ризн","/raɪz/|/roʊz/|/ˈrɪzn/","rayz|rouz|rizn","райз|роуз|ризн","Подниматься, возрастать","Ko‘tarilmoq, o‘smoq"],
  ["write|wrote|written",null,"/raɪt/|/rəʊt/|/ˈrɪtn/","rayt|rout|ritn","райт|роут|ритн","/raɪt/|/roʊt/|/ˈrɪtn/","rayt|rout|ridn","райт|роут|ридн","Писать","Yozmoq"],
  ["beat|beat|beaten",null,"/biːt/|/biːt/|/ˈbiːtn/","biit|biit|biitn","биит|биит|биитн","/biːt/|/biːt/|/ˈbiːtn/","biit|biit|biidn","биит|биит|биидн","Бить, побеждать","Urmoq, yutmoq"],
  ["bite|bit|bitten",null,"/baɪt/|/bɪt/|/ˈbɪtn/","bayt|bit|bitn","байт|бит|битн","/baɪt/|/bɪt/|/ˈbɪtn/","bayt|bit|bidn","байт|бит|бидн","Кусать","Tishlamoq"],
  ["hide|hid|hidden",null,"/haɪd/|/hɪd/|/ˈhɪdn/","hayd|hid|hidn","хайд|хид|хидн","/haɪd/|/hɪd/|/ˈhɪdn/","hayd|hid|hidn","хайд|хид|хидн","Прятать, скрывать","Yashirmoq"]
 ]},

 {key:"g7", title:"7 · -en", hint:"A–B–C, 3- shakli -en", v:[
  ["eat|ate|eaten",null,"/iːt/|/et/|/ˈiːtn/","iit|et|iitn","иит|эт|иитн","/iːt/|/eɪt/|/ˈiːtn/","iit|eyt|iidn","иит|эйт|иидн","Есть, кушать","Yemoq"],
  ["fall|fell|fallen",null,"/fɔːl/|/fel/|/ˈfɔːlən/","fool|fel|foolan","фоол|фэл|фоолан","/fɔːl/|/fel/|/ˈfɔːlən/","fool|fel|foolan","фоол|фэл|фоолан","Падать","Yiqilmoq, tushib ketmoq"],
  ["forget|forgot|forgotten",null,"/fəˈɡet/|/fəˈɡɒt/|/fəˈɡɒtn/","faget|fagot|fagotn","фагэт|фагот|фаготн","/fɚˈɡet/|/fɚˈɡɑːt/|/fɚˈɡɑːtn/","farget|fargaat|fargaadn","фаргэт|фаргаат|фаргаадн","Забывать","Unutmoq"],
  ["give|gave|given",null,"/ɡɪv/|/ɡeɪv/|/ˈɡɪvn/","giv|geyv|givn","гив|гэйв|гивн","/ɡɪv/|/ɡeɪv/|/ˈɡɪvn/","giv|geyv|givn","гив|гэйв|гивн","Давать","Bermoq"],
  ["see|saw|seen",null,"/siː/|/sɔː/|/siːn/","sii|soo|siin","сии|соо|сиин","/siː/|/sɔː/|/siːn/","sii|soo|siin","сии|соо|сиин","Видеть","Ko‘rmoq"],
  ["take|took|taken",null,"/teɪk/|/tʊk/|/ˈteɪkən/","teyk|tuk|teykan","тэйк|тук|тэйкан","/teɪk/|/tʊk/|/ˈteɪkən/","teyk|tuk|teykan","тэйк|тук|тэйкан","Брать","Olmoq"]
 ]},

 {key:"g8", title:"8 · -ew / -own", hint:"A–B–C", v:[
  ["blow|blew|blown",null,"/bləʊ/|/bluː/|/bləʊn/","blou|bluu|bloun","блоу|блуу|блоун","/bloʊ/|/bluː/|/bloʊn/","blou|bluu|bloun","блоу|блуу|блоун","Дуть","Esmoq, puflamoq"],
  ["grow|grew|grown",null,"/ɡrəʊ/|/ɡruː/|/ɡrəʊn/","grou|gruu|groun","гроу|груу|гроун","/ɡroʊ/|/ɡruː/|/ɡroʊn/","grou|gruu|groun","гроу|груу|гроун","Расти","O‘smoq"],
  ["know|knew|known",null,"/nəʊ/|/njuː/|/nəʊn/","nou|nyuu|noun","ноу|нью|ноун","/noʊ/|/nuː/|/noʊn/","nou|nuu|noun","ноу|нуу|ноун","Знать","Bilmoq"],
  ["throw|threw|thrown",null,"/θrəʊ/|/θruː/|/θrəʊn/","throu|thruu|throun","сроу|сруу|сроун","/θroʊ/|/θruː/|/θroʊn/","throu|thruu|throun","сроу|сруу|сроун","Бросать","Uloqtirmoq, tashlamoq"],
  ["fly|flew|flown",null,"/flaɪ/|/fluː/|/fləʊn/","flay|fluu|floun","флай|флуу|флоун","/flaɪ/|/fluː/|/floʊn/","flay|fluu|floun","флай|флуу|флоун","Летать","Uchmoq"],
  ["draw|drew|drawn",null,"/drɔː/|/druː/|/drɔːn/","droo|druu|droon","дроо|друу|дроон","/drɔː/|/druː/|/drɔːn/","droo|druu|droon","дроо|друу|дроон","Рисовать","Chizmoq"],
  ["show|showed|shown",null,"/ʃəʊ/|/ʃəʊd/|/ʃəʊn/","shou|shoud|shoun","шоу|шоуд|шоун","/ʃoʊ/|/ʃoʊd/|/ʃoʊn/","shou|shoud|shoun","шоу|шоуд|шоун","Показывать","Ko‘rsatmoq"]
 ]},

 {key:"g9", title:"9 · i–a–u", hint:"unli tovush almashadi", v:[
  ["begin|began|begun",null,"/bɪˈɡɪn/|/bɪˈɡæn/|/bɪˈɡʌn/","bigin|bigen|bigan","бигин|бигэн|биган","/bɪˈɡɪn/|/bɪˈɡæn/|/bɪˈɡʌn/","bigin|bigen|bigan","бигин|бигэн|биган","Начинать","Boshlamoq"],
  ["drink|drank|drunk",null,"/drɪŋk/|/dræŋk/|/drʌŋk/","drink|drenk|drank","дринк|дрэнк|дранк","/drɪŋk/|/dræŋk/|/drʌŋk/","drink|drenk|drank","дринк|дрэнк|дранк","Пить","Ichmoq"],
  ["swim|swam|swum",null,"/swɪm/|/swæm/|/swʌm/","svim|svem|svam","свим|свэм|свам","/swɪm/|/swæm/|/swʌm/","svim|svem|svam","свим|свэм|свам","Плавать","Suzmoq"],
  ["ring|rang|rung",null,"/rɪŋ/|/ræŋ/|/rʌŋ/","ring|reng|rang","ринг|рэнг|ранг","/rɪŋ/|/ræŋ/|/rʌŋ/","ring|reng|rang","ринг|рэнг|ранг","Звенеть, звонить","Jiringlamoq, qo‘ng‘iroq qilmoq"],
  ["sing|sang|sung",null,"/sɪŋ/|/sæŋ/|/sʌŋ/","sing|seng|sang","синг|сэнг|санг","/sɪŋ/|/sæŋ/|/sʌŋ/","sing|seng|sang","синг|сэнг|санг","Петь","Kuylamoq"],
  ["run|ran|run",null,"/rʌn/|/ræn/|/rʌn/","ran|ren|ran","ран|рэн|ран","/rʌn/|/ræn/|/rʌn/","ran|ren|ran","ран|рэн|ран","Бегать","Yugurmoq"]
 ]},

 {key:"g10", title:"10 · maxsus", hint:"qolipga tushmaydi", v:[
  ["come|came|come",null,"/kʌm/|/keɪm/|/kʌm/","kam|keym|kam","кам|кэйм|кам","/kʌm/|/keɪm/|/kʌm/","kam|keym|kam","кам|кэйм|кам","Приходить","Kelmoq"],
  ["become|became|become",null,"/bɪˈkʌm/|/bɪˈkeɪm/|/bɪˈkʌm/","bikam|bikeym|bikam","бикам|бикэйм|бикам","/bɪˈkʌm/|/bɪˈkeɪm/|/bɪˈkʌm/","bikam|bikeym|bikam","бикам|бикэйм|бикам","Становиться","Bo‘lmoq, aylanmoq"],
  ["be|was/were|been",null,"/biː/|/wɒz/ /wɜː(r)/|/biːn/","bii|voz / vyo|biin","бии|воз / вё|биин","/biː/|/wʌz/ /wɝː/|/bɪn/","bii|vaz / vyor|bin","бии|ваз / вёр|бин","Быть","Bo‘lmoq"],
  ["do|did|done",null,"/duː/|/dɪd/|/dʌn/","duu|did|dan","дуу|дид|дан","/duː/|/dɪd/|/dʌn/","duu|did|dan","дуу|дид|дан","Делать","Qilmoq"],
  ["go|went|gone",null,"/ɡəʊ/|/went/|/ɡɒn/","gou|vent|gon","гоу|вэнт|гон","/ɡoʊ/|/went/|/ɡɔːn/","gou|vent|goon","гоу|вэнт|гоон","Идти, ходить","Bormoq, ketmoq"],
  ["shine|shone|shone",null,"/ʃaɪn/|/ʃɒn/|/ʃɒn/","shayn|shon|shon","шайн|шон|шон","/ʃaɪn/|/ʃoʊn/|/ʃoʊn/","shayn|shoun|shoun","шайн|шоун|шоун","Сиять, светить","Charaqlamoq, porlamoq"],
  ["wear|wore|worn",null,"/weə(r)/|/wɔː(r)/|/wɔːn/","vea|voo|voon","вэа|воо|воон","/wer/|/wɔːr/|/wɔːrn/","ver|vor|vorn","вэр|вор|ворн","Носить, надевать","Kiymoq"],
  ["win|won|won",null,"/wɪn/|/wʌn/|/wʌn/","vin|van|van","вин|ван|ван","/wɪn/|/wʌn/|/wʌn/","vin|van|van","вин|ван|ван","Выигрывать","G‘alaba qozonmoq, yutmoq"]
 ]}

];
