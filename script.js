/* ============================================================
   Адвокатура Кыргызстана — script.js
   Общий скрипт: перевод, данные, рендер, админ-хранилище
   ============================================================ */

/* ============================================================
   1. ХРАНИЛИЩЕ
   ============================================================ */
const AK = {
  get(key, def){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    }catch(e){ return def; }
  },
  set(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ console.warn('Storage error', e); return false; }
  }
};

const K = {
  lawyers: 'ak_lawyers',
  news:    'ak_news',
  laws:    'ak_laws',
  training:'ak_training',
  lang:    'ak_lang',
  overrides:'ak_lawyer_overrides',   // правки сгенерированных адвокатов
  hidden:  'ak_lawyer_hidden',        // скрытые (удалённые) адвокаты
  adminHash:'ak_admin_hash',          // хэш пароля админа
  auth:    'ak_auth'                  // сессия
};
/* ============================================================
   2. УТИЛИТЫ
   ============================================================ */
function hashCode(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h<<5) - h + str.charCodeAt(i); h |= 0; }
  return h;
}
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeXml(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
  }[c]));
}
/* ---------- Пароль админа ---------- */
function simpleHash(str){
  let h = 5381;
  for(let i=0;i<str.length;i++) h = ((h<<5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
// Пароль по умолчанию: admin2026  (смени в админке → вкладка «🔑 Пароль»)
const DEFAULT_ADMIN_HASH = simpleHash('admin2026');

function isAdminAuth(){
  try { return sessionStorage.getItem(K.auth) === '1'; } catch(e){ return false; }
}
function loginAdmin(pw){
  const stored = AK.get(K.adminHash, null) || DEFAULT_ADMIN_HASH;
  if(simpleHash(pw) === stored){
    try { sessionStorage.setItem(K.auth, '1'); } catch(e){}
    return true;
  }
  return false;
}
function logoutAdmin(){
  try { sessionStorage.removeItem(K.auth); } catch(e){}
}
function changeAdminPassword(oldPw, newPw){
  const stored = AK.get(K.adminHash, null) || DEFAULT_ADMIN_HASH;
  if(simpleHash(oldPw) !== stored) return false;
  return AK.set(K.adminHash, simpleHash(newPw));
}
const PALETTE = ['#2f8fe0','#1b6fb5','#4aa8ff','#0d5c9e','#63b3ed','#0f7bbf','#3a9bd9','#1e5f9e'];
function placeholderImage(text, w=800, h=460){
  const color = PALETTE[Math.abs(hashCode(text)) % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#0b3d66"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<text x="50%" y="50%" font-family="Arial" font-size="${Math.round(h/11)}"
 fill="rgba(255,255,255,.92)" text-anchor="middle" dominant-baseline="middle">${escapeXml(text)}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function avatarImage(name, size=300){
  const parts = String(name).trim().split(/\s+/);
  const initials = ((parts[0]?.[0]||'') + (parts[1]?.[0]||'')).toUpperCase() || 'A';
  const color = PALETTE[Math.abs(hashCode(name)) % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#0b3d66"/>
</linearGradient></defs>
<rect width="${size}" height="${size}" fill="url(#g)"/>
<text x="50%" y="52%" font-family="Arial" font-size="${size*0.36}"
 fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${escapeXml(initials)}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function stars(rating){
  const full = Math.max(1, Math.min(5, Math.round(rating/2)));
  return '★'.repeat(full) + '☆'.repeat(5-full);
}
function showToast(msg){
  let t = document.querySelector('.toast');
  if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(()=>t.classList.remove('show'), 2400);
}

/* ============================================================
   3. ПЕРЕВОД
   ============================================================ */
const I18N = {
  ru: {
    site_title:'Адвокатура Кыргызстана',
    site_sub:'Официальный юридический портал',
    nav_home:'Главная', nav_lawyers:'Адвокаты', nav_news:'Новости',
    nav_training:'Учебный центр', nav_law:'Законодательство',
    hero_title:'Добро пожаловать',
    hero_text:'Официальный сайт адвокатуры Кыргызской Республики',
    search_ph:'Поиск адвокатов, новостей...',
    news_title:'Свежие новости', news_all:'Все новости →',
    news_page_title:'Новости адвокатуры',
    footer:'© 2026 Адвокатура Кыргызстана. Все права защищены.',
    regions_title:'Выберите регион',
    bishkek:'Бишкек', osh:'Ош', naryn:'Нарын', talas:'Талас',
    chuy:'Чуй', issykkul:'Ысык-Куль', jalalabad:'Джалал-Абад', batken:'Баткен',
    osh_city:'Ош шаары', osh_region:'Ош облусу', osh_all:'Все адвокаты Оша',
    in_dev:'Раздел находится в разработке',
    in_dev_text:'Приносим извинения! База адвокатов этого региона пока заполняется. Вы можете посмотреть адвокатов Оша.',
    go_osh:'Перейти к адвокатам Оша',
    back:'← Назад',
    lawyers_found:'Найдено адвокатов',
    exp:'Опыт', years:'лет',
    phone:'Телефон', area:'Область', biography:'Биография', awards:'Награды и достижения',
    profile_title:'Профиль адвоката',
    not_found:'Адвокат не найден',
    not_found_text:'К сожалению, такой адвокат не найден в базе.',
    show_more:'Показать ещё',
    training_title:'Учебный центр адвокатуры',
    training_sub:'Подготовка и повышение квалификации адвокатов Кыргызской Республики',
    training_about:'О центре',
    training_about_text:'Учебный центр Адвокатуры Кыргызской Республики осуществляет подготовку, переподготовку и повышение квалификации адвокатов. Обучение проводится по программам, утверждённым Советом Адвокатуры.',
    training_address:'Адрес', training_phone:'Телефон', training_email:'E-mail', training_hours:'Часы работы',
    training_map:'Место положения на карте',
    law_title:'Законодательство КР',
    law_sub:'Электронная книга законов Кыргызской Республики — 2026 год',
    law_read:'Читать',
    law_close:'×'
  },
  kg: {
    site_title:'Кыргызстандын адвокатурасы',
    site_sub:'Расмий юридикалык портал',
    nav_home:'Башкы бет', nav_lawyers:'Адвокаттар', nav_news:'Жаңылыктар',
    nav_training:'Окуу борбору', nav_law:'Мыйзамдар',
    hero_title:'Кош келиңиз',
    hero_text:'Кыргыз Республикасынын адвокатурасынын расмий сайты',
    search_ph:'Адвокаттарды, жаңылыктарды издөө...',
    news_title:'Акыркы жаңылыктар', news_all:'Бардык жаңылыктар →',
    news_page_title:'Адвокатура жаңылыктары',
    footer:'© 2026 Кыргызстандын адвокатурасы. Бардык укуктар корголгон.',
    regions_title:'Аймакты тандаңыз',
    bishkek:'Бишкек', osh:'Ош', naryn:'Нарын', talas:'Талас',
    chuy:'Чүй', issykkul:'Ысык-Көл', jalalabad:'Жалал-Абад', batken:'Баткен',
    osh_city:'Ош шаары', osh_region:'Ош облусу', osh_all:'Оштун бардык адвокаттары',
    in_dev:'Бөлүм иштелип жатат',
    in_dev_text:'Кечиресиз! Бул аймактын адвокаттар базасы азырынча толукталып жатат. Оштун адвокаттарын көрө аласыз.',
    go_osh:'Оштун адвокаттарына өтүү',
    back:'← Артка',
    lawyers_found:'Адвокаттар табылды',
    exp:'Тажрыйба', years:'жыл',
    phone:'Телефон', area:'Аймак', biography:'Биография', awards:'Сыйлыктар жана жетишкендиктер',
    profile_title:'Адвокаттын профили',
    not_found:'Адвокат табылган жок',
    not_found_text:'Тилекке каршы, мындай адвокат базада табылган жок.',
    show_more:'Дагы көрсөтүү',
    training_title:'Адвокатуранын окуу борбору',
    training_sub:'Кыргыз Республикасынын адвокаттарын даярдоо жана квалификациясын жогорулатуу',
    training_about:'Борбор жөнүндө',
    training_about_text:'Кыргыз Республикасынын Адвокатурасынын Окуу борбору адвокаттарды даярдоо, кайра даярдоо жана квалификациясын жогорулатуу иштерин жүргүзөт. Окутуу Адвокатура Кеңеши тарабынан бекитилген программалар боюнча өткөрүлөт.',
    training_address:'Дарек', training_phone:'Телефон', training_email:'E-mail', training_hours:'Иштөө убактысы',
    training_map:'Картадагы жайгашкан жери',
    law_title:'КР мыйзамдары',
    law_sub:'Кыргыз Республикасынын мыйзамдарынын электрондук китеби — 2026-жыл',
    law_read:'Окуу',
    law_close:'×'
  }
};

let currentLang = AK.get(K.lang, 'ru') || 'ru';
const t = (key) => (I18N[currentLang] && I18N[currentLang][key]) || (I18N.ru[key] ?? key);

function applyLanguage(lang){
  currentLang = I18N[lang] ? lang : 'ru';
  const dict = I18N[currentLang];

  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if(dict[key] !== undefined) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
    const key = el.getAttribute('data-i18n-ph');
    if(dict[key] !== undefined) el.placeholder = dict[key];
  });
  document.querySelectorAll('.lang-buttons button').forEach(b=>{
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });
  document.documentElement.lang = currentLang === 'kg' ? 'ky' : 'ru';
  AK.set(K.lang, currentLang);

  if(typeof window.rerenderDynamic === 'function'){
    window.rerenderDynamic();
  }
}
function setLanguage(lang){ applyLanguage(lang); }

/* ============================================================
   4. ГЕНЕРАЦИЯ 700 АДВОКАТОВ ОША
   ============================================================ */
const FIRST_M = ['Нурсултан','Азамат','Бакыт','Эрмек','Тилек','Улан','Мирлан','Айбек','Жаныбек','Талант','Кубаныч','Эрлан','Нурлан','Алмаз','Бекзат','Данияр','Искендер','Кайрат','Марат','Нурбек','Руслан','Самат','Таалайбек','Урмат','Чынгыз','Ырысбек','Адилет','Бектур','Дастан','Эржан','Жоомарт','Каныбек','Максат','Нурдин','Омурбек'];
const FIRST_F = ['Айдана','Айнура','Алина','Бактыгуль','Гульнара','Дамира','Жанара','Зуура','Индира','Камила','Лейла','Мээрим','Нургуль','Перизат','Рахат','Салтанат','Тахмина','Умут','Чолпон','Ширин','Эльмира','Аида','Бермет','Венера','Гулмира','Динара','Жамиля','Кундуз','Нурзада','Сайра','Асель','Бурул','Гүлзат','Назгуль','Толкун'];
const LAST = ['Абдиев','Асанов','Бекмуратов','Жумабаев','Ибраимов','Кадыров','Мамбетов','Нурланов','Осмонов','Рахманов','Сатыбалдиев','Ташматов','Усенов','Чыналиев','Шарипов','Ыбраев','Эргешов','Абдырахманов','Байзаков','Жапаров','Кубатов','Маматов','Омурзаков','Сыдыков','Токтогулов','Абдуллаев','Бөкөшев','Дүйшөнов','Жээнбеков','Калматов'];
const SPECS = ['уголовном праве','гражданском праве','семейном праве','налоговом праве','международном праве','административном праве','земельном праве','трудовом праве','корпоративном праве','наследственном праве'];
const PHONE_CODES = ['700','555','777','705','559','772','500','708','220','990'];
const AWARDS = ['Лучший адвокат года','Международная юридическая премия','Почётная грамота Адвокатуры КР','Благодарность Совета Адвокатуры','Знак «За заслуги»','Юбилейная медаль'];

let _lawyersCache = null;

function generateOshLawyers(){
  if(_lawyersCache) return _lawyersCache;
  const rnd = mulberry32(777001);
  const used = new Set();
  const list = [];

  for(let i=0;i<700;i++){
    const isMale = rnd() < 0.55;
    let name = '', guard = 0;
    do{
      const f = isMale
        ? FIRST_M[Math.floor(rnd()*FIRST_M.length)]
        : FIRST_F[Math.floor(rnd()*FIRST_F.length)];
      let l = LAST[Math.floor(rnd()*LAST.length)];
      if(!isMale) l = l.replace(/ов$/,'ова').replace(/ев$/,'ева');
      name = l + ' ' + f;
      guard++;
    }while(used.has(name) && guard < 120);
    used.add(name);

    const exp = 1 + Math.floor(rnd()*34);
    const rating = Math.round((6.5 + rnd()*3.5)*10)/10;
    const code = PHONE_CODES[Math.floor(rnd()*PHONE_CODES.length)];
    const n = () => String(100 + Math.floor(rnd()*900));
    const phone = `+996 ${code} ${n()} ${n()}`;
    const district = rnd() < 0.6 ? 'osh_city' : 'osh_region';
    const spec = SPECS[Math.floor(rnd()*SPECS.length)];

    const aCount = 1 + Math.floor(rnd()*3);
    const awards = [];
    for(let a=0;a<aCount;a++){
      const aw = AWARDS[Math.floor(rnd()*AWARDS.length)];
      if(!awards.includes(aw)) awards.push(aw);
    }

    list.push({
      id: 'osh_' + i,
      name,
      exp,
      rating,
      phone,
      district,
      region: 'osh',
      spec,
      bio: `${name} — адвокат с опытом работы ${exp} ${exp===1?'год':(exp<5?'года':'лет')}. Специализируется на ${spec}. Оказывает юридическую помощь физическим и юридическим лицам в регионе Ош. Член Адвокатуры Кыргызской Республики.`,
      awards,
      photo: avatarImage(name, 400)
    });
  }
  _lawyersCache = list;
  return list;
}

function getAllLawyers(){
  const custom    = AK.get(K.lawyers, []);
  const generated = generateOshLawyers();
  const overrides = AK.get(K.overrides, {});
  const hidden    = AK.get(K.hidden, []);
  return [...custom, ...generated]
    .filter(l => !hidden.includes(l.id))
    .map(l => overrides[l.id] ? Object.assign({}, l, overrides[l.id]) : l);
}

// Все адвокаты включая скрытые — для админки
function getAllLawyersRaw(){
  const custom    = AK.get(K.lawyers, []);
  const generated = generateOshLawyers();
  const overrides = AK.get(K.overrides, {});
  return [...custom, ...generated]
    .map(l => overrides[l.id] ? Object.assign({}, l, overrides[l.id]) : l);
}

function isLawyerHidden(id){ return AK.get(K.hidden, []).includes(id); }
function isLawyerOverridden(id){ return !!AK.get(K.overrides, {})[id]; }
function saveLawyerOverride(id, data){
  const ov = AK.get(K.overrides, {});
  ov[id] = Object.assign({}, ov[id] || {}, data);
  return AK.set(K.overrides, ov);
}
function hideLawyer(id){
  const h = AK.get(K.hidden, []);
  if(!h.includes(id)) h.push(id);
  return AK.set(K.hidden, h);
}
function unhideLawyer(id){
  AK.set(K.hidden, AK.get(K.hidden, []).filter(x => x !== id));
}
function invalidateLawyers(){ _lawyersCache = null; }

/* ============================================================
   5. НОВОСТИ
   ============================================================ */
const DEFAULT_NEWS = [
  {
    id:'n1',
    title:'Адвокатура Кыргызстана получила международную юридическую премию',
    text:'На международной конференции в Женеве Адвокатура Кыргызской Республики была удостоена премии за вклад в развитие правовой помощи населению.',
    date:'2026-01-15',
    image: placeholderImage('Международная премия')
  },
  {
    id:'n2',
    title:'Открыт новый учебный центр подготовки адвокатов в Бишкеке',
    text:'В Бишкеке начал работу обновлённый учебный центр Адвокатуры. Центр оснащён современными аудиториями и электронной библиотекой.',
    date:'2026-02-03',
    image: placeholderImage('Новый учебный центр')
  },
  {
    id:'n3',
    title:'Реформа адвокатуры: новый закон вступает в силу с 2026 года',
    text:'С 1 января 2026 года вступили в силу изменения в Закон КР «Об адвокатуре и адвокатской деятельности», расширяющие гарантии независимости адвокатов.',
    date:'2026-01-05',
    image: placeholderImage('Реформа адвокатуры')
  },
  {
    id:'n4',
    title:'Бесплатная юридическая помощь: более 5 000 обращений за год',
    text:'Система гарантированной государственной юридической помощи обработала свыше 5 000 обращений граждан по всей республике.',
    date:'2026-02-20',
    image: placeholderImage('Бесплатная помощь')
  },
  {
    id:'n5',
    title:'Международная конференция адвокатов пройдёт в Бишкеке',
    text:'В Бишкеке состоится международная конференция, посвящённая защите прав человека и роли адвокатуры в Центральной Азии.',
    date:'2026-03-10',
    image: placeholderImage('Конференция в Бишкеке')
  },
  {
    id:'n6',
    title:'Запущена электронная библиотека законов КР',
    text:'Адвокатура запустила электронную библиотеку, в которой доступны все основные кодексы и законы Кыргызской Республики в актуальной редакции 2026 года.',
    date:'2026-03-25',
    image: placeholderImage('Электронная библиотека')
  }
];

function getAllNews(){
  const custom = AK.get(K.news, []);
  return [...custom, ...DEFAULT_NEWS];
}

/* ============================================================
   6. ЗАКОНЫ / ЭЛЕКТРОННАЯ КНИГА
   ============================================================ */
const DEFAULT_LAWS = [
  {id:'l1', title:'Конституция Кыргызской Республики', year:2026, category:'Конституционное право',
   desc:'Основной закон Кыргызской Республики, определяющий основы конституционного строя, права и свободы человека.',
   text:'КОНСТИТУЦИЯ КЫРГЫЗСКОЙ РЕСПУБЛИКИ\n\n(редакция 2026 года)\n\nМы, народ Кыргызстана, принимаем настоящую Конституцию.\n\nРаздел I. Основы конституционного строя\nСтатья 1. Кыргызская Республика — суверенное, демократическое, правовое, светское, унитарное государство.\n\nСтатья 2. Народ Кыргызстана является носителем суверенитета и единственным источником государственной власти.\n\nСтатья 3. В Кыргызской Республике признаются и гарантируются права и свободы человека и гражданина.\n\nСтатья 4. Собственность в Кыргызской Республике признаётся и защищается государством.\n\n(текст сокращён для демонстрации электронной книги)'},
  {id:'l2', title:'Закон КР «Об адвокатуре и адвокатской деятельности»', year:2026, category:'Адвокатура',
   desc:'Регулирует организацию адвокатуры, права и обязанности адвокатов, гарантии адвокатской деятельности.',
   text:'ЗАКОН КЫРГЫЗСКОЙ РЕСПУБЛИКИ\n«Об адвокатуре и адвокатской деятельности»\n\n(в редакции от 2026 года)\n\nСтатья 1. Предмет регулирования\nНастоящий Закон регулирует отношения, связанные с организацией и деятельностью адвокатуры.\n\nСтатья 2. Адвокатура\nАдвокатура — это добровольное профессиональное сообщество адвокатов.\n\nСтатья 3. Адвокат\nАдвокатом является лицо, получившее лицензию и осуществляющее адвокатскую деятельность.\n\nСтатья 4. Гарантии независимости\nАдвокат независим и подчиняется только закону.'},
  {id:'l3', title:'Уголовно-процессуальный кодекс КР', year:2026, category:'Уголовное право',
   desc:'Определяет порядок уголовного судопроизводства, права участников процесса, гарантии защиты.',
   text:'УГОЛОВНО-ПРОЦЕССУАЛЬНЫЙ КОДЕКС\nКЫРГЫЗСКОЙ РЕСПУБЛИКИ\n(2026)\n\nСтатья 1. Назначение Кодекса\nКодекс определяет порядок производства по уголовным делам.\n\nСтатья 2. Принципы\nУголовное судопроизводство осуществляется на началах законности, состязательности и равенства сторон.\n\nСтатья 3. Право на защиту\nКаждый имеет право на защиту своих прав и свобод.'},
  {id:'l4', title:'Гражданский кодекс КР', year:2026, category:'Гражданское право',
   desc:'Регулирует имущественные и личные неимущественные отношения, права собственности, сделки.',
   text:'ГРАЖДАНСКИЙ КОДЕКС\nКЫРГЫЗСКОЙ РЕСПУБЛИКИ\n(2026)\n\nСтатья 1. Основные начала\nГражданское законодательство основывается на признании равенства участников.\n\nСтатья 2. Субъекты\nУчастниками гражданских отношений являются граждане и юридические лица.'},
  {id:'l5', title:'Гражданско-процессуальный кодекс КР', year:2026, category:'Гражданское право',
   desc:'Определяет порядок рассмотрения гражданских дел в судах.',
   text:'ГРАЖДАНСКО-ПРОЦЕССУАЛЬНЫЙ КОДЕКС КР (2026)\n\nСтатья 1. Задачи\nЗадачами являются правильное и своевременное рассмотрение гражданских дел.\n\nСтатья 2. Принципы\nПравосудие осуществляется на началах равенства сторон.'},
  {id:'l6', title:'Кодекс о проступках КР', year:2026, category:'Административное право',
   desc:'Устанавливает ответственность за административные правонарушения (проступки).',
   text:'КОДЕКС О ПРОСТУПКАХ КР (2026)\n\nСтатья 1. Задачи\nОхрана прав и свобод человека, общественного порядка.\n\nСтатья 2. Основания ответственности\nОтветственность наступает только за виновные деяния.'},
  {id:'l7', title:'Семейный кодекс КР', year:2026, category:'Семейное право',
   desc:'Регулирует семейные отношения: брак, права детей, алименты, усыновление.',
   text:'СЕМЕЙНЫЙ КОДЕКС КР (2026)\n\nСтатья 1. Семейное законодательство\nСемья находится под защитой государства.\n\nСтатья 2. Брак\nБрак заключается в государственных органах регистрации.'},
  {id:'l8', title:'Закон КР «О гарантированной государственной юридической помощи»', year:2026, category:'Адвокатура',
   desc:'Обеспечивает доступ граждан к бесплатной юридической помощи.',
   text:'ЗАКОН КР «О ГАРАНТИРОВАННОЙ ГОСУДАРСТВЕННОЙ ЮРИДИЧЕСКОЙ ПОМОЩИ» (2026)\n\nСтатья 1. Право на помощь\nКаждый гражданин имеет право на получение юридической помощи.\n\nСтатья 2. Формы помощи\nПомощь оказывается в форме консультаций и представительства в суде.'},
  {id:'l9', title:'Трудовой кодекс КР', year:2026, category:'Трудовое право',
   desc:'Регулирует трудовые отношения между работником и работодателем.',
   text:'ТРУДОВОЙ КОДЕКС КР (2026)\n\nСтатья 1. Цели\nУстановление государственных гарантий трудовых прав.\n\nСтатья 2. Свобода труда\nКаждый имеет право свободно распоряжаться своими способностями к труду.'},
  {id:'l10', title:'Налоговый кодекс КР', year:2026, category:'Налоговое право',
   desc:'Устанавливает систему налогов, права и обязанности налогоплательщиков.',
   text:'НАЛОГОВЫЙ КОДЕКС КР (2026)\n\nСтатья 1. Налоговое законодательство\nНалоги устанавливаются исключительно законом.\n\nСтатья 2. Обязанность уплаты\nКаждый обязан уплачивать законно установленные налоги.'}
];

function getAllLaws(){
  const custom = AK.get(K.laws, []);
  return [...custom, ...DEFAULT_LAWS];
}

/* ============================================================
   7. УЧЕБНЫЙ ЦЕНТР
   ============================================================ */
const DEFAULT_TRAINING = {
  title:'Учебный центр Адвокатуры Кыргызской Республики',
  address:'г. Бишкек, ул. Киевская, 95',
  phone:'+996 (312) 90-00-00',
  email:'training@advokatura.kg',
  hours:'Пн–Пт: 09:00 – 18:00',
  mapQuery:'Бишкек, улица Киевская 95'
};
function getTraining(){
  return Object.assign({}, DEFAULT_TRAINING, AK.get(K.training, {}));
}

/* ============================================================
   8. РЕНДЕР: НОВОСТИ
   ============================================================ */
function renderNewsCards(container, items){
  if(!container) return;
  if(!items.length){
    container.innerHTML = `<p style="color:#5b7083;padding:20px 0;">${t('not_found_text')}</p>`;
    return;
  }
  container.innerHTML = items.map(n=>`
    <article class="news-card">
      <img src="${n.image || placeholderImage(n.title)}" alt="${escapeHtml(n.title)}"
           onerror="this.src='${placeholderImage(n.title)}'">
      <div class="news-body">
        <span class="date">${escapeHtml(n.date || '')}</span>
        <h3>${escapeHtml(n.title)}</h3>
        <p>${escapeHtml(n.text)}</p>
      </div>
    </article>
  `).join('');
}

function initIndexPage(){
  const list = document.getElementById('newsList');
  const search = document.getElementById('searchInput');

  const render = (query='') => {
    const all = getAllNews();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(n => (n.title+' '+n.text).toLowerCase().includes(q))
      : all;
    renderNewsCards(list, filtered.slice(0, 4));
  };

  render();
  if(search){
    search.addEventListener('input', function(){ render(this.value); });
  }
  window.rerenderDynamic = () => render(search ? search.value : '');
}

function initNewsPage(){
  const list = document.getElementById('newsList');
  const search = document.getElementById('searchInput');
  const render = (query='') => {
    const all = getAllNews();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(n => (n.title+' '+n.text).toLowerCase().includes(q))
      : all;
    renderNewsCards(list, filtered);
  };
  render();
  if(search) search.addEventListener('input', function(){ render(this.value); });
  window.rerenderDynamic = () => render(search ? search.value : '');
}

/* ============================================================
   9. РЕНДЕР: СТРАНИЦА АДВОКАТОВ
   ============================================================ */
const REGION_KEYS = ['bishkek','osh','naryn','talas','chuy','issykkul','jalalabad','batken'];

function initLawyersPage(){
  const regionsGrid = document.getElementById('regionsGrid');
  const oshSub = document.getElementById('oshSub');
  const listEl = document.getElementById('lawyersList');
  const noticeEl = document.getElementById('noticeBox');

  let activeRegion = null;
  let activeDistrict = null;
  let shown = 24;

  function renderRegions(){
    if(!regionsGrid) return;
    regionsGrid.innerHTML = REGION_KEYS.map(key=>`
      <div class="region-card ${activeRegion===key?'active':''}" data-region="${key}">
        ${escapeHtml(t(key))}
      </div>
    `).join('');

    regionsGrid.querySelectorAll('.region-card').forEach(card=>{
      card.addEventListener('click', ()=>{
        const key = card.dataset.region;
        activeRegion = key;
        activeDistrict = null;
        shown = 24;
        if(key === 'osh'){
          oshSub.style.display = 'flex';
          noticeEl.style.display = 'none';
        }else{
          oshSub.style.display = 'none';
          showNotice(key);
        }
        renderRegions();
        renderList();
      });
    });
  }

  function showNotice(key){
    noticeEl.style.display = 'block';
    noticeEl.innerHTML = `
      <h3>🚧 ${escapeHtml(t('in_dev'))}</h3>
      <p>${escapeHtml(t('in_dev_text'))}</p>
      <button onclick="document.querySelector('[data-region=\\'osh\\']').click()">
        ${escapeHtml(t('go_osh'))}
      </button>
    `;
  }

  function renderOshSub(){
    if(!oshSub) return;
    oshSub.innerHTML = `
      <button data-d="" class="${activeDistrict===null?'active':''}">${escapeHtml(t('osh_all'))}</button>
      <button data-d="osh_city" class="${activeDistrict==='osh_city'?'active':''}">${escapeHtml(t('osh_city'))}</button>
      <button data-d="osh_region" class="${activeDistrict==='osh_region'?'active':''}">${escapeHtml(t('osh_region'))}</button>
    `;
    oshSub.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click', ()=>{
        activeDistrict = b.dataset.d || null;
        shown = 24;
        renderOshSub();
        renderList();
      });
    });
  }

  function renderList(){
    if(!listEl) return;

    if(activeRegion !== 'osh'){
      listEl.innerHTML = '';
      return;
    }
    noticeEl.style.display = 'none';

    const all = getAllLawyers().filter(l => l.region === 'osh');
    let filtered = activeDistrict
      ? all.filter(l => l.district === activeDistrict)
      : all;

    const total = filtered.length;
    const visible = filtered.slice(0, shown);

    const cardsHtml = visible.map(l=>`
      <article class="lawyer-card" onclick="location.href='lawyer-profile.html?id=${encodeURIComponent(l.id)}'">
        <img src="${l.photo || avatarImage(l.name)}" alt="${escapeHtml(l.name)}">
        <h3>${escapeHtml(l.name)}</h3>
        <div class="meta">${escapeHtml(t('exp'))}: ${l.exp} ${escapeHtml(t('years'))}</div>
        <div class="rating">${stars(l.rating)} <span style="color:#5b7083;font-size:12px;">${l.rating}</span></div>
        <p>${escapeHtml(l.bio.slice(0, 110))}…</p>
      </article>
    `).join('');

    const moreBtn = total > shown
      ? `<button class="load-more" id="loadMoreBtn">${escapeHtml(t('show_more'))} (${shown}/${total})</button>`
      : '';

    listEl.innerHTML = `
      <div style="grid-column:1/-1;" class="counter">
        ${escapeHtml(t('lawyers_found'))}: <b>${total}</b>
      </div>
      ${cardsHtml}
    `;

    if(moreBtn){
      const wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      wrap.style.gridColumn = '1/-1';
      wrap.innerHTML = moreBtn;
      listEl.appendChild(wrap);
      document.getElementById('loadMoreBtn').addEventListener('click', ()=>{
        shown += 24;
        renderList();
      });
    }
  }

  renderRegions();
  renderOshSub();
  renderList();

  // автоматически открыть Ош, если указан ?region=osh
  const params = new URLSearchParams(location.search);
  if(params.get('region') === 'osh'){
    activeRegion = 'osh';
    oshSub.style.display = 'flex';
    renderRegions();
    renderList();
  }

  window.rerenderDynamic = () => {
    renderRegions();
    renderOshSub();
    if(activeRegion === 'osh') renderList();
    else if(activeRegion) showNotice(activeRegion);
  };
}

/* ============================================================
   10. ПРОФИЛЬ АДВОКАТА
   ============================================================ */
function initProfilePage(){
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const box = document.getElementById('profileBox');

  function render(){
    if(!id){
      box.innerHTML = `<div class="notice"><h3>${escapeHtml(t('not_found'))}</h3>
        <p>${escapeHtml(t('not_found_text'))}</p>
        <button onclick="location.href='lawyers.html?region=osh'">${escapeHtml(t('go_osh'))}</button></div>`;
      return;
    }
    const lawyer = getAllLawyers().find(l => l.id === id);
    if(!lawyer){
      box.innerHTML = `<div class="notice"><h3>${escapeHtml(t('not_found'))}</h3>
        <p>${escapeHtml(t('not_found_text'))}</p>
        <button onclick="location.href='lawyers.html?region=osh'">${escapeHtml(t('go_osh'))}</button></div>`;
      return;
    }
    const districtLabel = lawyer.district === 'osh_region' ? t('osh_region')
                        : lawyer.district === 'osh_city' ? t('osh_city')
                        : t('osh');
    const awards = (lawyer.awards && lawyer.awards.length)
      ? lawyer.awards.map(a=>`<li>${escapeHtml(a)}</li>`).join('')
      : `<li>—</li>`;

    box.innerHTML = `
      <a href="lawyers.html?region=osh" class="back-link">${escapeHtml(t('back'))}</a>
      <img src="${lawyer.photo || avatarImage(lawyer.name)}" class="profile-photo" alt="${escapeHtml(lawyer.name)}">
      <h1>${escapeHtml(lawyer.name)}</h1>
      <div class="profile-info">
        <p><strong>${escapeHtml(t('phone'))}:</strong> ${escapeHtml(lawyer.phone)}</p>
        <p><strong>${escapeHtml(t('exp'))}:</strong> ${lawyer.exp} ${escapeHtml(t('years'))}</p>
        <p><strong>${escapeHtml(t('area'))}:</strong> ${escapeHtml(districtLabel)}</p>
      </div>
      <div class="profile-rating">${stars(lawyer.rating)} <span style="font-size:15px;color:#5b7083;">${lawyer.rating} / 10</span></div>
      <div class="biography">
        <h2>${escapeHtml(t('biography'))}</h2>
        <p>${escapeHtml(lawyer.bio)}</p>
      </div>
      <div class="awards">
        <h2>${escapeHtml(t('awards'))}</h2>
        <ul>${awards}</ul>
      </div>
    `;
  }

  render();
  window.rerenderDynamic = render;
}

/* ============================================================
   11. УЧЕБНЫЙ ЦЕНТР
   ============================================================ */
function initTrainingPage(){
  const cfg = getTraining();
  const box = document.getElementById('trainingInfo');
  const map = document.getElementById('mapFrame');

  function render(){
    const c = getTraining();
    box.innerHTML = `
      <h1>${escapeHtml(t('training_title'))}</h1>
      <p class="subtitle" style="color:#5b7083;margin-bottom:22px;">${escapeHtml(t('training_sub'))}</p>
      <div class="info-card">
        <h2 style="color:#1b6fb5;margin-bottom:12px;font-size:20px;">${escapeHtml(t('training_about'))}</h2>
        <p style="line-height:1.7;color:#43566b;">${escapeHtml(t('training_about_text'))}</p>
        <div class="hr"></div>
        <p><strong>${escapeHtml(t('training_address'))}:</strong> ${escapeHtml(c.address)}</p>
        <p><strong>${escapeHtml(t('training_phone'))}:</strong> ${escapeHtml(c.phone)}</p>
        <p><strong>${escapeHtml(t('training_email'))}:</strong> ${escapeHtml(c.email)}</p>
        <p><strong>${escapeHtml(t('training_hours'))}:</strong> ${escapeHtml(c.hours)}</p>
      </div>
      <h2 style="color:#1b6fb5;margin-bottom:12px;font-size:20px;">${escapeHtml(t('training_map'))}</h2>
      <div class="map-wrap">
        <iframe id="mapFrame" loading="lazy" allowfullscreen
          src="https://www.google.com/maps?q=${encodeURIComponent(c.mapQuery)}&output=embed"></iframe>
      </div>
    `;
  }

  render();
  window.rerenderDynamic = render;
}

/* ============================================================
   12. ЗАКОНОДАТЕЛЬСТВО / ЭЛЕКТРОННАЯ КНИГА
   ============================================================ */
function initLegislationPage(){
  const grid = document.getElementById('lawsGrid');
  const modal = document.getElementById('lawModal');
  const modalBody = document.getElementById('lawModalBody');
  const closeBtn = document.getElementById('lawModalClose');

  function render(){
    const laws = getAllLaws();
    grid.innerHTML = laws.map(l=>`
      <div class="law-card">
        <span class="year">${l.year} • ${escapeHtml(l.category || '')}</span>
        <h3>${escapeHtml(l.title)}</h3>
        <p>${escapeHtml(l.desc || '')}</p>
        <button data-id="${escapeHtml(l.id)}">📖 ${escapeHtml(t('law_read'))}</button>
      </div>
    `).join('');

    grid.querySelectorAll('button[data-id]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const law = getAllLaws().find(x => x.id === btn.dataset.id);
        if(!law) return;
        modalBody.innerHTML = `
          <h2>${escapeHtml(law.title)}</h2>
          <span class="year">${law.year} • ${escapeHtml(law.category || '')}</span>
          <div class="text">${escapeHtml(law.text || law.desc || '')}</div>
        `;
        modal.classList.add('open');
      });
    });
  }

  closeBtn.addEventListener('click', ()=> modal.classList.remove('open'));
  modal.addEventListener('click', e=>{ if(e.target === modal) modal.classList.remove('open'); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') modal.classList.remove('open'); });

  render();
  window.rerenderDynamic = render;
}

/* ============================================================
   13. СКРЫТЫЙ ПЕРЕХОД В АДМИНКУ
   ============================================================ */
document.addEventListener('keydown', function(e){
  if(e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')){
    e.preventDefault();
    window.location.href = 'admin.html';
  }
});

/* ============================================================
   14. ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
(function init(){
  applyLanguage(currentLang);

  const page = document.body.dataset.page;
  if(page === 'index')        initIndexPage();
  else if(page === 'news')    initNewsPage();
  else if(page === 'lawyers') initLawyersPage();
  else if(page === 'profile') initProfilePage();
  else if(page === 'training')initTrainingPage();
  else if(page === 'legislation') initLegislationPage();
})();