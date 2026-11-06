import type { Post } from '../types'
import { post as kk_akciyalarMenZhenildikter } from './kk/akciyalar-men-zhenildikter'
import { post as kk_aktauMarketNuskaulyq } from './kk/aktau-market-nuskaulyq'
import { post as kk_aleumettikManyzyBarAzyqTulik } from './kk/aleumettik-manyzy-bar-azyq-tulik'
import { post as kk_aptalyqMaziz10000 } from './kk/aptalyq-maziz-10000'
import { post as kk_arzanZharmalar } from './kk/arzan-zharmalar'
import { post as kk_ayranQatyqQymyzBagasy } from './kk/ayran-qatyq-qymyz-bagasy'
import { post as kk_azyqTulikQaidanKeledi } from './kk/azyq-tulik-qaidan-keledi'
import { post as kk_azyqTuliktiSaqtau } from './kk/azyq-tulikti-saqtau'
import { post as kk_baqshaOnimderi } from './kk/baqsha-onimderi'
import { post as kk_bauyrsaqQuny } from './kk/bauyrsaq-quny'
import { post as kk_bazalyqMolsherleme } from './kk/bazalyq-molsherleme'
import { post as kk_besbarmaqQuny } from './kk/besbarmaq-quny'
import { post as kk_enTomengiZhalaqyZhaneKunkoris } from './kk/en-tomengi-zhalaqy-zhane-kunkoris'
import { post as kk_etPenQusEtiBagalary } from './kk/et-pen-qus-eti-bagalary'
import { post as kk_kokonisPenZhemisMausymdyqBagalar } from './kk/kokonis-pen-zhemis-mausymdyq-bagalar'
import { post as kk_makaronQalayTandau } from './kk/makaron-qalay-tandau'
import { post as kk_okushynynTangyAsy } from './kk/okushynyn-tangy-asy'
import { post as kk_otbasyAzyqTulikByudzheti } from './kk/otbasy-azyq-tulik-byudzheti'
import { post as kk_palauQuny } from './kk/palau-quny'
import { post as kk_qantZharmaMakaronBagalary } from './kk/qant-zharma-makaron-bagalary'
import { post as kk_qaymaqPenSuzbe } from './kk/qaymaq-pen-suzbe'
import { post as kk_qysqyZhemister } from './kk/qysqy-zhemister'
import { post as kk_sutBagasyQalayTandau } from './kk/sut-bagasy-qalay-tandau'
import { post as kk_tutynuBagalarynynIndeksi } from './kk/tutynu-bagalarynyn-indeksi'
import { post as kk_unBagasyZhaneUyNany } from './kk/un-bagasy-zhane-uy-nany'
import { post as kk_zeinetkerdinAzyqTulikByudzheti } from './kk/zeinetkerdin-azyq-tulik-byudzheti'
import { post as kk_zhanaZhylDastarhanyByudzheti } from './kk/zhana-zhyl-dastarhany-byudzheti'
import { post as kk_zhelilerdinAiyrmashylygy } from './kk/zhelilerdin-aiyrmashylygy'
import { post as kk_zhelilerdinZhekeMarkalary } from './kk/zhelilerdin-zheke-markalary'
import { post as kk_zhumyrtqaBagasy } from './kk/zhumyrtqa-bagasy'
import { post as ru_byudzhetStudentaNaProdukty } from './ru/byudzhet-studenta-na-produkty'
import { post as ru_cenaZaKilogrammILitr } from './ru/cena-za-kilogramm-i-litr'
import { post as ru_cenyNaHlebIMukuAktau } from './ru/ceny-na-hleb-i-muku-aktau'
import { post as ru_farshGotovyyIliDomashniy } from './ru/farsh-gotovyy-ili-domashniy'
import { post as ru_gdeDeshevleProduktyAktau } from './ru/gde-deshevle-produkty-aktau'
import { post as ru_grechkaCenyAktau } from './ru/grechka-ceny-aktau'
import { post as ru_inflyaciyaKazahstan2026 } from './ru/inflyaciya-kazahstan-2026'
import { post as ru_kakChitatCennik } from './ru/kak-chitat-cennik'
import { post as ru_kakMySobiraemCeny } from './ru/kak-my-sobiraem-ceny'
import { post as ru_kakPolzovatsyaAktauMarket } from './ru/kak-polzovatsya-aktau-market'
import { post as ru_kakSekonomitNaProduktah } from './ru/kak-sekonomit-na-produktah'
import { post as ru_kakieProduktyChashcheSoSkidkoy } from './ru/kakie-produkty-chashche-so-skidkoy'
import { post as ru_kuricaCelayaIliChastyami } from './ru/kurica-celaya-ili-chastyami'
import { post as ru_kursTengeICenyNaImportnyeProdukty } from './ru/kurs-tenge-i-ceny-na-importnye-produkty'
import { post as ru_magazinyAktauNaKarte } from './ru/magaziny-aktau-na-karte'
import { post as ru_molochnyeProduktyCeny } from './ru/molochnye-produkty-ceny'
import { post as ru_molokoIliMolokosoderzhashchiyProdukt } from './ru/moloko-ili-molokosoderzhashchiy-produkt'
import { post as ru_mzpIProduktovayaKorzina } from './ru/mzp-i-produktovaya-korzina'
import { post as ru_ovoshchiDlyaBorshchaCeny } from './ru/ovoshchi-dlya-borshcha-ceny'
import { post as ru_ovsyankaIliKashaBystrogoPrigotovleniya } from './ru/ovsyanka-ili-kasha-bystrogo-prigotovleniya'
import { post as ru_pochemuCenyVAktauDrugie } from './ru/pochemu-ceny-v-aktau-drugie'
import { post as ru_pochemuOdinTovarStoitPoRaznomu } from './ru/pochemu-odin-tovar-stoit-po-raznomu'
import { post as ru_produktovayaKorzinaAktau } from './ru/produktovaya-korzina-aktau'
import { post as ru_rastitelnoeMasloCeny } from './ru/rastitelnoe-maslo-ceny'
import { post as ru_risKakoyVybrat } from './ru/ris-kakoy-vybrat'
import { post as ru_samyyDeshevyyBelok } from './ru/samyy-deshevyy-belok'
import { post as ru_skolkoStoitZavtrakObedUzhin } from './ru/skolko-stoit-zavtrak-obed-uzhin'
import { post as ru_slivochnoeMasloIliSpred } from './ru/slivochnoe-maslo-ili-spred'
import { post as ru_syrVAktauCeny } from './ru/syr-v-aktau-ceny'
import { post as ru_yogurtyTvorogSmetanaBolshayaUpakovka } from './ru/yogurty-tvorog-smetana-bolshaya-upakovka'

/**
 * Дата публикации. Цифры во всех статьях сверены со снимком 06.11.2026 — это их дата обновления
 * (post.updated), поэтому у статей с более ранней публикацией на странице видно «обновлено»
 */
const publishedOn = (post: Post, date: string): Post => ({ ...post, published: date })

/** Все статьи блога. Новая статья: файл в ru/ или kk/ и строка здесь */
export const POSTS: Post[] = [
  ru_produktovayaKorzinaAktau,
  ru_gdeDeshevleProduktyAktau,
  kk_etPenQusEtiBagalary,
  publishedOn(ru_inflyaciyaKazahstan2026, '2026-11-03'),
  publishedOn(kk_zhanaZhylDastarhanyByudzheti, '2026-10-30'),
  publishedOn(ru_kakPolzovatsyaAktauMarket, '2026-10-27'),
  publishedOn(ru_kursTengeICenyNaImportnyeProdukty, '2026-10-23'),
  publishedOn(kk_qantZharmaMakaronBagalary, '2026-10-20'),
  publishedOn(ru_molochnyeProduktyCeny, '2026-10-16'),
  publishedOn(kk_akciyalarMenZhenildikter, '2026-10-13'),
  publishedOn(ru_cenaZaKilogrammILitr, '2026-10-09'),
  publishedOn(kk_zhumyrtqaBagasy, '2026-10-06'),
  publishedOn(ru_kakSekonomitNaProduktah, '2026-10-02'),
  publishedOn(kk_tutynuBagalarynynIndeksi, '2026-09-29'),
  publishedOn(ru_cenyNaHlebIMukuAktau, '2026-09-25'),
  publishedOn(kk_kokonisPenZhemisMausymdyqBagalar, '2026-09-22'),
  publishedOn(kk_aleumettikManyzyBarAzyqTulik, '2026-09-18'),
  publishedOn(ru_pochemuCenyVAktauDrugie, '2026-09-15'),
  publishedOn(kk_otbasyAzyqTulikByudzheti, '2026-09-11'),
  publishedOn(kk_zhelilerdinZhekeMarkalary, '2026-09-08'),
  publishedOn(kk_bazalyqMolsherleme, '2026-10-24'),
  publishedOn(ru_rastitelnoeMasloCeny, '2026-09-04'),
  publishedOn(kk_qysqyZhemister, '2026-09-01'),
  publishedOn(ru_syrVAktauCeny, '2026-08-29'),
  publishedOn(kk_baqshaOnimderi, '2026-08-26'),
  publishedOn(ru_kakieProduktyChashcheSoSkidkoy, '2026-08-23'),
  publishedOn(kk_ayranQatyqQymyzBagasy, '2026-08-20'),
  publishedOn(ru_grechkaCenyAktau, '2026-08-17'),
  publishedOn(kk_palauQuny, '2026-08-14'),
  publishedOn(ru_risKakoyVybrat, '2026-08-11'),
  publishedOn(kk_sutBagasyQalayTandau, '2026-08-08'),
  publishedOn(ru_ovoshchiDlyaBorshchaCeny, '2026-08-05'),
  publishedOn(kk_besbarmaqQuny, '2026-08-02'),
  publishedOn(ru_kuricaCelayaIliChastyami, '2026-07-30'),
  publishedOn(kk_unBagasyZhaneUyNany, '2026-07-27'),
  publishedOn(ru_mzpIProduktovayaKorzina, '2026-07-24'),
  publishedOn(kk_bauyrsaqQuny, '2026-07-21'),
  publishedOn(ru_farshGotovyyIliDomashniy, '2026-07-18'),
  publishedOn(kk_arzanZharmalar, '2026-07-15'),
  publishedOn(ru_slivochnoeMasloIliSpred, '2026-07-12'),
  publishedOn(kk_zhelilerdinAiyrmashylygy, '2026-07-09'),
  publishedOn(ru_molokoIliMolokosoderzhashchiyProdukt, '2026-07-06'),
  publishedOn(kk_makaronQalayTandau, '2026-07-03'),
  publishedOn(ru_magazinyAktauNaKarte, '2026-06-30'),
  publishedOn(kk_okushynynTangyAsy, '2026-06-27'),
  publishedOn(ru_yogurtyTvorogSmetanaBolshayaUpakovka, '2026-06-24'),
  publishedOn(kk_zeinetkerdinAzyqTulikByudzheti, '2026-06-21'),
  publishedOn(ru_skolkoStoitZavtrakObedUzhin, '2026-06-18'),
  publishedOn(kk_aptalyqMaziz10000, '2026-06-15'),
  publishedOn(ru_byudzhetStudentaNaProdukty, '2026-06-12'),
  publishedOn(kk_azyqTulikQaidanKeledi, '2026-06-09'),
  publishedOn(ru_pochemuOdinTovarStoitPoRaznomu, '2026-06-06'),
  publishedOn(kk_qaymaqPenSuzbe, '2026-06-03'),
  publishedOn(ru_kakChitatCennik, '2026-05-31'),
  publishedOn(kk_azyqTuliktiSaqtau, '2026-05-28'),
  publishedOn(ru_samyyDeshevyyBelok, '2026-05-25'),
  publishedOn(kk_enTomengiZhalaqyZhaneKunkoris, '2026-05-22'),
  publishedOn(ru_kakMySobiraemCeny, '2026-05-19'),
  publishedOn(kk_aktauMarketNuskaulyq, '2026-05-16'),
  publishedOn(ru_ovsyankaIliKashaBystrogoPrigotovleniya, '2026-05-13'),
]
