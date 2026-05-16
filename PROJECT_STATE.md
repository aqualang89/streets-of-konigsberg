# PROJECT_STATE.md

## Статус: ЖИВОЙ САЙТ + КАРТА УЛИЦ

Сайт задеплоен на Vercel (`streets-of-konigsberg.vercel.app`). Свой домен пока не куплен. Контент пополняется по одной улице.

## Решения

### 2026-04-21 Архитектура
Многостраничный статический сайт. Каждая улица = отдельный HTML-файл в `streets/`. На карте используется `data/streets.json` (минимальные данные для маркера + ссылка на страницу).

### 2026-04-26 Карта улиц
Сделана через **Leaflet + OpenStreetMap + Overpass API** в готическом/пергаментном стиле проекта.
- **Тайлы:** OSM Standard (`tile.openstreetmap.org`) — русские названия
- **Фильтр:** `sepia(0.7) saturate(0.65) contrast(1.1) brightness(0.72) hue-rotate(-8deg)` — под палитру дерево/золото/пергамент
- **Поиск улиц:** Overpass API через `relation["name"="Калининград"]["place"="city"]` → `map_to_area`. Fallback — узкий bbox `54.65,20.32,54.77,20.59`. Поиск по полям `name`, `name:ru`, `alt_name` (union)
- **Фильтр названий:** точное совпадение чтобы не ловить однофамильные улицы из пригородов
- **Маркеры:** золотые розетки (`❖`) — кастомные `divIcon`
- **Подсветка улицы:** при наведении — линия `#b8860b` (`--color-gold`), opacity 0.75
- **Атрибуция Leaflet с флагом убрана** — добавлена своя без него

### 2026-04-26 CORS и резервные Overpass-серверы
Fallback-цепочка: `overpass.kumi.systems` → `overpass.private.coffee` → `overpass-api.de`.

### 2026-04-27 Оптимизация скорости
- Один батч-запрос через `union` на все улицы сразу
- `localStorage` кеш на 7 дней (`kgsbrg_streets_v1_*`) — после первого открытия карта мгновенная
- Гранулярный кеш по имени улицы

### 2026-04-27 Мобильный UX карты
- Подсветка улицы на мобиле жирнее (weight 12 vs 8) и ярче (opacity 0.95)
- Попап на мобиле уже (240px vs 300px), карта смещается через `autoPanPadding`
- Десктоп не тронут

### 2026-04-27 OG-теги для шеринга
Добавлены `og:*` и `twitter:*` мета-теги во все страницы. Картинка превью `assets/og-image.png` (1200x630) сгенерирована через deGenAI — пергаментный свиток с прусскими гербами, готический шрифт, старая карта Кёнигсберга. URL пока `streets-of-konigsberg.vercel.app`, при покупке своего домена — поменять `og:url` (одна строка в каждом HTML).

### 2026-04-27 Шрифт заголовка карты
Заголовок "Карта улиц" использует тот же стиль что `hero-title` на главной: `IM Fell English italic`, `--color-gold-bright`, со свечением через text-shadow.

## Выполнено
- [x] Базовая структура (index.html, streets/, css, js, assets)
- [x] Дизайн в готическом/пергаментном стиле (UnifrakturMaguntia, Cinzel, IM Fell English)
- [x] Scroll-анимации через IntersectionObserver, parallax hero
- [x] Страница улицы (`streets/leninsky-prospekt.html`) с embed Рутуба
- [x] **Карта улиц** (`map.html` + `js/map.js`) с подсветкой при наведении
- [x] OG-теги для шеринга + картинка превью
- [x] Деплой на Vercel

## Файловая структура
```
/
├── index.html                    # Главная — hero, цитата, карточки улиц
├── map.html                      # Карта улиц
├── streets/
│   └── leninsky-prospekt.html    # Страница улицы
├── css/
│   ├── style.css                 # Все стили + карта
│   ├── animations.css            # Scroll-reveal, parallax
│   └── fonts.css                 # Google Fonts
├── js/
│   ├── main.js                   # Навигация, page transition
│   ├── animations.js             # IntersectionObserver scroll-reveal
│   └── map.js                    # Карта (Leaflet + Overpass + кеш)
├── data/streets.json             # Данные улиц для карты
├── assets/
│   ├── svg/                      # SVG-орнаменты
│   └── og-image.png              # Превью для шеринга 1200x630
├── PROJECT_CONTEXT.md
└── PROJECT_STATE.md
```

## Следующий шаг
1. Купить свой домен — поменять `og:url` во всех HTML на новый
2. Добавить страницы для других улиц (Чернышевского, Баранова — карточки на главной уже есть)
3. Дописать улицы в `data/streets.json` чтобы появлялись на карте
