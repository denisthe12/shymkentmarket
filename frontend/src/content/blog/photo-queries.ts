// Фото для статей: поисковые запросы (англ., по порядку — до первого найденного) и alt на языке статьи.
// alt описывает то, что на скачанном фото: заменили фото — проверьте alt.
// Часть фото второй волны подобрана вручную (по id Openverse), запросы для них — ориентир для повторного поиска.
// Файл без импортов — его читает и сайт, и scripts/fetch-blog-photos.mjs (pnpm blog:photos)

export type PhotoQuery = { queries: string[]; alt: string }

export const PHOTO_QUERIES: Record<string, PhotoQuery> = {
  // ru
  'grocery-basket': { queries: ['basket groceries', 'groceries'], alt: 'Плетёная корзина с овощами' },
  'store-shelves': { queries: ['supermarket', 'grocery store', 'shop shelves'], alt: 'Бананы на прилавке супермаркета' },
  'supermarket-aisle': { queries: ['fruits vegetables market', 'market food', 'grocery'], alt: 'Овощи и фрукты в ящиках на рынке' },
  'cargo-truck': { queries: ['truck transportation', 'truck highway'], alt: 'Грузовик на дороге' },
  'bread-loaves': { queries: ['bread bakery', 'bread'], alt: 'Хлеб на полках пекарни' },
  'dairy-products': { queries: ['glass milk', 'milk bottle', 'milk'], alt: 'Миска молока с черникой' },
  'shopping-list': { queries: ['notebook pen', 'shopping list', 'notebook kitchen'], alt: 'Открытый блокнот на столе' },
  'price-tags': { queries: ['price tag', 'market prices', 'scale weighing'], alt: 'Фрукты и овощи на уличном прилавке' },
  'phone-shopping': { queries: ['smartphone hand', 'phone hand', 'mobile phone'], alt: 'Смартфон и распечатки с графиками на столе' },
  'citrus-fruits': { queries: ['lemons fruits', 'lemons', 'oranges'], alt: 'Лимоны на белом фоне' },
  // kk
  'meat-counter': { queries: ['meat beef', 'butcher'], alt: 'Сөредегі сиыр еті' },
  'eggs-carton': { queries: ['eggs food', 'eggs'], alt: 'Үш тауық жұмыртқасы' },
  'grains-pasta': { queries: ['pasta flour', 'pasta', 'rice grains'], alt: 'Ұннан макарон жасау' },
  'vegetables-market': { queries: ['vegetables market', 'fruits vegetables'], alt: 'Базардағы бұрыш пен көкөністер' },
  'bread-milk-staples': { queries: ['breakfast table bread', 'bread butter', 'food table'], alt: 'Таңғы ас дастарқаны' },
  'family-groceries': { queries: ['vegetables kitchen table', 'groceries bag', 'vegetables cutting board'], alt: 'Тақтайдағы туралған қызыл бұрыш' },
  'sale-sign': { queries: ['sale sign', 'discount', 'shopping bags'], alt: 'Бағасы жазылған қызанақ сөресі' },
  'pasta-shelf': { queries: ['spaghetti pasta', 'pasta dry'], alt: 'Қайнаған суға салынып жатқан спагетти' },
  'festive-table': { queries: ['festive table', 'christmas dinner table', 'holiday dinner'], alt: 'Мерекелік тәрелкедегі сыйлық қорапшасы' },
  'calculator-receipt': { queries: ['calculator', 'calculator money', 'budget'], alt: 'Калькулятор және графиктер' },

  // ru, вторая волна
  'oil-bottles': { queries: ['oliveoil jars', 'oil bottles'], alt: 'Бутылки с маслом' },
  'cheese-board': { queries: ['cheese food', 'cheese'], alt: 'Головки и куски твёрдого сыра' },
  'yogurt-bowl': { queries: ['yogurt', 'yogurt bowl'], alt: 'Йогурт с гранолой и черникой' },
  buckwheat: { queries: ['buckwheat seeds'], alt: 'Гречневая крупа крупным планом' },
  'rice-bowl': { queries: ['rice', 'rice bowl'], alt: 'Блюдо из риса с овощами' },
  'root-vegetables': { queries: ['carrots', 'potatoes', 'beets'], alt: 'Морковь' },
  'chicken-raw': { queries: ['chicken breast', 'chicken meat'], alt: 'Куриное филе на гриле' },
  'minced-meat': { queries: ['raw burger patties', 'burger patty'], alt: 'Котлеты из сырого фарша' },
  butter: { queries: ['butter', 'butter bread'], alt: 'Хлеб и сливочное масло' },
  'milk-carton': { queries: ['milk jar', 'milk bottle'], alt: 'Бутылка молока' },
  'city-street': { queries: ['storefronts', 'storefront'], alt: 'Магазины вдоль улицы' },
  'sale-shopping': { queries: ['shopping bags', 'shopping'], alt: 'Покупатели с пакетами' },
  'home-cooking': { queries: ['cooking pot', 'soup cooking', 'kitchen cooking'], alt: 'Кастрюля на плите' },
  'student-kitchen': { queries: ['cooking pasta', 'kitchen stove', 'frying pan'], alt: 'Спагетти, помидоры и специи на столе' },
  'store-shelves-2': { queries: ['vegetable stall', 'market stall'], alt: 'Овощной прилавок у магазина' },
  'price-label': { queries: ['receipt', 'shopping receipt'], alt: 'Чек рядом с чашкой кофе' },
  'wallet-money': { queries: ['wallet money', 'money wallet', 'cash'], alt: 'Деньги, кошелёк и мелочи на столе' },
  legumes: { queries: ['lentils', 'beans', 'chickpeas'], alt: 'Суп из чечевицы с гренками' },
  'laptop-data': { queries: ['laptop data', 'laptop charts', 'laptop desk'], alt: 'Ноутбук с графиком на столе' },
  oatmeal: { queries: ['oatmeal', 'porridge', 'oats'], alt: 'Овсяная каша с черникой' },
  // kk, вторая волна
  'kefir-glass': { queries: ['milk jar'], alt: 'Банкадағы сүт сусыны' },
  'milk-glass': { queries: ['milk bottles', 'milk breakfast', 'milk'], alt: 'Бөтелкедегі сүт' },
  'flour-baking': { queries: ['flour baking', 'baking dough', 'flour'], alt: 'Қамыр илеу' },
  'fried-dough': { queries: ['donuts', 'fried dough', 'pastry'], alt: 'Қолдағы қуырылған тоқаш' },
  pilaf: { queries: ['pilaf', 'rice pilaf'], alt: 'Мейіз қосылған палау' },
  'boiled-meat': { queries: ['meat soup'], alt: 'Ет сорпасы' },
  'grains-jars': { queries: ['buckwheat seeds', 'grains'], alt: 'Қарақұмық дәндері' },
  'pasta-bowl': { queries: ['pasta dish', 'pasta plate', 'macaroni'], alt: 'Тауық еті қосылған макарон' },
  'breakfast-porridge': { queries: ['breakfast bowl', 'porridge berries', 'breakfast'], alt: 'Жемістер мен жаңғақ қосылған таңғы ас' },
  'soup-pot': { queries: ['soup', 'soup bowl', 'vegetable soup'], alt: 'Тефтелі сорпа' },
  'meal-prep': { queries: ['meal prep', 'food containers', 'lunch box'], alt: 'Контейнердегі қарбыз' },
  'supermarket-cart': { queries: ['shopping carts'], alt: 'Сауда арбалары' },
  'cargo-ship': { queries: ['cargo port', 'shipping containers', 'container ship'], alt: 'Порттағы жүк кемесі' },
  'winter-fruit': { queries: ['apples'], alt: 'Қызыл алма' },
  'sour-cream': { queries: ['sour cream', 'cream bowl', 'dairy cream'], alt: 'Таңқурай мен кілегей' },
  pumpkin: { queries: ['pumpkins orange', 'pumpkins'], alt: 'Асқабақтар' },
  'fridge-food': { queries: ['refrigerator interior', 'refrigerator'], alt: 'Ашық тоңазытқыш' },
  coins: { queries: ['coins', 'coins money', 'money'], alt: 'Тиындар' },
  'wallet-cash': { queries: ['banknotes', 'cash money', 'paying cash'], alt: 'Банкноттар мен тиындар' },
  'phone-hand': { queries: ['smartphone', 'phone screen', 'mobile app'], alt: 'Үстелдегі смартфон' },
}
