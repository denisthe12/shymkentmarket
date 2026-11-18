import type { Post } from '../types'
import { post as kk_akciyalarQalayZhumysIsteidi } from './kk/akciyalar-qalay-zhumys-isteidi'
import { post as kk_auyzasharByudzheti } from './kk/auyzashar-byudzheti'
import { post as kk_baganyQalayOquKerek } from './kk/bagany-qalay-oqu-kerek'
import { post as kk_balalarTagamy } from './kk/balalar-tagamy'
import { post as kk_bazalyqMolsherlemeBagalar } from './kk/bazalyq-molsherleme-bagalar'
import { post as kk_enTomengiZhalaqyAzyqSebeti } from './kk/en-tomengi-zhalaqy-azyq-sebeti'
import { post as kk_kokonisBazaryMenZheliler } from './kk/kokonis-bazary-men-zheliler'
import { post as kk_kopbalalyOtbasyByudzheti } from './kk/kopbalaly-otbasy-byudzheti'
import { post as kk_kurishTandau } from './kk/kurish-tandau'
import { post as kk_kuzgiDayyndyq } from './kk/kuzgi-dayyndyq'
import { post as kk_metroKotermeSatypAlu } from './kk/metro-koterme-satyp-alu'
import { post as kk_nauryzKozheQuny } from './kk/nauryz-kozhe-quny'
import { post as kk_onlainZhetkizuTiimdiMe } from './kk/onlain-zhetkizu-tiimdi-me'
import { post as kk_osimdikZhaneSaryMai } from './kk/osimdik-zhane-sary-mai'
import { post as kk_ozbekstannanKeletinOnimder } from './kk/ozbekstannan-keletin-onimder'
import { post as kk_qauynQarbyzMausymy } from './kk/qauyn-qarbyz-mausymy'
import { post as kk_qoyEtiQalayTandau } from './kk/qoy-eti-qalay-tandau'
import { post as kk_qurbanAitEtBagasy } from './kk/qurban-ait-et-bagasy'
import { post as kk_qurtPenIrimshik } from './kk/qurt-pen-irimshik'
import { post as kk_shaiTandau } from './kk/shai-tandau'
import { post as kk_shymkentMarketNuskaulyq } from './kk/shymkent-market-nuskaulyq'
import { post as kk_shymkentteAzyqTulikQaidaArzan } from './kk/shymkentte-azyq-tulik-qaida-arzan'
import { post as kk_shymkenttegiInflyaciya2026 } from './kk/shymkenttegi-inflyaciya-2026'
import { post as kk_studenttinAptalyqByudzheti } from './kk/studenttin-aptalyq-byudzheti'
import { post as kk_sutOnimderinTandau } from './kk/sut-onimderin-tandau'
import { post as kk_tandyrNanMenBauyrsaq } from './kk/tandyr-nan-men-bauyrsaq'
import { post as kk_toiDastarhanyByudzheti } from './kk/toi-dastarhany-byudzheti'
import { post as kk_zeinetkerdinAzyqByudzheti } from './kk/zeinetkerdin-azyq-byudzheti'
import { post as kk_zhazgyAuyzSu } from './kk/zhazgy-auyz-su'
import { post as kk_zhumyrtqaDukendeMenBazarda } from './kk/zhumyrtqa-dukende-men-bazarda'
import { post as ru_akciiVOnlaynMagazinah } from './ru/akcii-v-onlayn-magazinah'
import { post as ru_arbuzIliMagnumGo } from './ru/arbuz-ili-magnum-go'
import { post as ru_baraninaIliGovyadina } from './ru/baranina-ili-govyadina'
import { post as ru_bazarIliSupermarketShymkent } from './ru/bazar-ili-supermarket-shymkent'
import { post as ru_byudzhetIftaraRamadan } from './ru/byudzhet-iftara-ramadan'
import { post as ru_cenaZaKgDostavkaIZal } from './ru/cena-za-kg-dostavka-i-zal'
import { post as ru_chayKakVybrat } from './ru/chay-kak-vybrat'
import { post as ru_detskoePitanieKakEkonomit } from './ru/detskoe-pitanie-kak-ekonomit'
import { post as ru_gdeDeshevleProduktyShymkent } from './ru/gde-deshevle-produkty-shymkent'
import { post as ru_gramadSupermarketShymkent } from './ru/gramad-supermarket-shymkent'
import { post as ru_inflyaciyaVShymkente2026 } from './ru/inflyaciya-v-shymkente-2026'
import { post as ru_kakEkonomitNaDostavkeProduktov } from './ru/kak-ekonomit-na-dostavke-produktov'
import { post as ru_kakMySobiraemCenyShymkent } from './ru/kak-my-sobiraem-ceny-shymkent'
import { post as ru_kakPolzovatsyaShymkentMarket } from './ru/kak-polzovatsya-shymkent-market'
import { post as ru_kalendarSezonnyhFruktovYuga } from './ru/kalendar-sezonnyh-fruktov-yuga'
import { post as ru_korzinaNaNedelyuSemyaShymkent } from './ru/korzina-na-nedelyu-semya-shymkent'
import { post as ru_kursTengeISum } from './ru/kurs-tenge-i-sum'
import { post as ru_lepeshkaIHlebShymkent } from './ru/lepeshka-i-hleb-shymkent'
import { post as ru_letnieNapitkiIMorozhenoe } from './ru/letnie-napitki-i-morozhenoe'
import { post as ru_magazinyShymkentaNaKarte } from './ru/magaziny-shymkenta-na-karte'
import { post as ru_metroOptomDlyaSemi } from './ru/metro-optom-dlya-semi'
import { post as ru_mzp2026IProdukty } from './ru/mzp-2026-i-produkty'
import { post as ru_pitevayaVodaVZharu } from './ru/pitevaya-voda-v-zharu'
import { post as ru_pomidoryIOgurcySezonnost } from './ru/pomidory-i-ogurcy-sezonnost'
import { post as ru_produktyIzUzbekistana } from './ru/produkty-iz-uzbekistana'
import { post as ru_risDlyaPlova } from './ru/ris-dlya-plova'
import { post as ru_saharIMukaMeshkami } from './ru/sahar-i-muka-meshkami'
import { post as ru_samsaDomaIliKupit } from './ru/samsa-doma-ili-kupit'
import { post as ru_skolkoStoitLagmanDoma } from './ru/skolko-stoit-lagman-doma'
import { post as ru_zagotovkiNaZimu } from './ru/zagotovki-na-zimu'

/**
 * Дата публикации. Цифры во всех статьях сверены 18.11.2026 (data.ts → PUBLISHED) — это их дата обновления
 * (post.updated), поэтому у статей с более ранней публикацией на странице видно «обновлено».
 * Даты подобраны по сезону темы; статьи с данными за октябрь 2026 — не раньше их выхода в начале ноября
 */
const publishedOn = (post: Post, date: string): Post => ({ ...post, published: date })

/** Все статьи блога, новые сверху. Новая статья: файл в ru/ или kk/ и строка здесь */
export const POSTS: Post[] = [
  ru_gdeDeshevleProduktyShymkent,
  publishedOn(ru_mzp2026IProdukty, '2026-11-12'),
  publishedOn(kk_bazalyqMolsherlemeBagalar, '2026-11-07'),
  publishedOn(ru_kursTengeISum, '2026-11-06'),
  publishedOn(kk_shymkenttegiInflyaciya2026, '2026-11-05'),
  publishedOn(ru_inflyaciyaVShymkente2026, '2026-11-04'),
  publishedOn(kk_shymkentteAzyqTulikQaidaArzan, '2026-10-27'),
  publishedOn(ru_korzinaNaNedelyuSemyaShymkent, '2026-10-20'),
  publishedOn(kk_ozbekstannanKeletinOnimder, '2026-10-10'),
  publishedOn(ru_produktyIzUzbekistana, '2026-10-08'),
  publishedOn(ru_arbuzIliMagnumGo, '2026-09-28'),
  publishedOn(kk_metroKotermeSatypAlu, '2026-09-21'),
  publishedOn(ru_metroOptomDlyaSemi, '2026-09-14'),
  publishedOn(kk_kuzgiDayyndyq, '2026-09-07'),
  publishedOn(ru_samsaDomaIliKupit, '2026-08-31'),
  publishedOn(kk_studenttinAptalyqByudzheti, '2026-08-24'),
  publishedOn(ru_skolkoStoitLagmanDoma, '2026-08-17'),
  publishedOn(kk_enTomengiZhalaqyAzyqSebeti, '2026-08-10'),
  publishedOn(kk_zeinetkerdinAzyqByudzheti, '2026-08-03'),
  publishedOn(kk_toiDastarhanyByudzheti, '2026-07-27'),
  publishedOn(ru_zagotovkiNaZimu, '2026-07-21'),
  publishedOn(kk_qauynQarbyzMausymy, '2026-07-15'),
  publishedOn(kk_kopbalalyOtbasyByudzheti, '2026-07-09'),
  publishedOn(ru_pomidoryIOgurcySezonnost, '2026-07-04'),
  publishedOn(kk_qurtPenIrimshik, '2026-06-29'),
  publishedOn(ru_magazinyShymkentaNaKarte, '2026-06-24'),
  publishedOn(kk_zhumyrtqaDukendeMenBazarda, '2026-06-19'),
  publishedOn(ru_letnieNapitkiIMorozhenoe, '2026-06-15'),
  publishedOn(kk_zhazgyAuyzSu, '2026-06-10'),
  publishedOn(ru_pitevayaVodaVZharu, '2026-06-06'),
  publishedOn(kk_onlainZhetkizuTiimdiMe, '2026-06-02'),
  publishedOn(ru_kakEkonomitNaDostavkeProduktov, '2026-05-28'),
  publishedOn(kk_kokonisBazaryMenZheliler, '2026-05-23'),
  publishedOn(ru_bazarIliSupermarketShymkent, '2026-05-19'),
  publishedOn(kk_qurbanAitEtBagasy, '2026-05-15'),
  publishedOn(ru_baraninaIliGovyadina, '2026-05-11'),
  publishedOn(kk_qoyEtiQalayTandau, '2026-05-07'),
  publishedOn(ru_kalendarSezonnyhFruktovYuga, '2026-05-03'),
  publishedOn(kk_osimdikZhaneSaryMai, '2026-04-29'),
  publishedOn(ru_gramadSupermarketShymkent, '2026-04-25'),
  publishedOn(kk_sutOnimderinTandau, '2026-04-21'),
  publishedOn(ru_saharIMukaMeshkami, '2026-04-17'),
  publishedOn(kk_balalarTagamy, '2026-04-13'),
  publishedOn(ru_detskoePitanieKakEkonomit, '2026-04-09'),
  publishedOn(kk_akciyalarQalayZhumysIsteidi, '2026-04-05'),
  publishedOn(ru_akciiVOnlaynMagazinah, '2026-04-01'),
  publishedOn(kk_tandyrNanMenBauyrsaq, '2026-03-27'),
  publishedOn(ru_lepeshkaIHlebShymkent, '2026-03-23'),
  publishedOn(kk_kurishTandau, '2026-03-18'),
  publishedOn(ru_risDlyaPlova, '2026-03-14'),
  publishedOn(kk_nauryzKozheQuny, '2026-03-10'),
  publishedOn(ru_chayKakVybrat, '2026-03-05'),
  publishedOn(kk_shaiTandau, '2026-03-01'),
  publishedOn(ru_cenaZaKgDostavkaIZal, '2026-02-25'),
  publishedOn(kk_baganyQalayOquKerek, '2026-02-21'),
  publishedOn(ru_byudzhetIftaraRamadan, '2026-02-17'),
  publishedOn(kk_auyzasharByudzheti, '2026-02-16'),
  publishedOn(ru_kakMySobiraemCenyShymkent, '2026-02-14'),
  publishedOn(kk_shymkentMarketNuskaulyq, '2026-02-12'),
  publishedOn(ru_kakPolzovatsyaShymkentMarket, '2026-02-10'),
]
