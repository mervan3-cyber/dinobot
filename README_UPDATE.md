# Banko Kupon LAB — manuel maç önü — 5 Ekim 2026

Bu ZIP, mevcut **1 Ekim V24 Ana + Odak pre52** sürümünden itibaren birikimli kod güncellemesidir; tam bot değildir. Önceki V24 canlı geçiş, Live grup, erken ÜST ve yalnız İY/MS paketlerini de içerir. Önceki ZIP'leri ayrıca yüklemek gerekmez. Güncel sunucu sürümü: `mac-yakala-banko-coupon-lab-2026-10-05`.

## Yeni ayrı sistem: Banko Kupon

- Panelde **Banko Kupon** başlığı: tarih seç → gerekirse **LİGLERİ GETİR** → ayarları kaydet → **SEÇİLİ GÜNE KUPON OLUŞTUR**. Tarama yalnız düğmeyle çalışır; otomatik günlük Banko taraması yoktur. Bugün ve en fazla 7 gün sonrası seçilebilir. Geçmiş günlerin kaydedilmiş kuponları arşivden görüntülenir; bugünkü verilerle geçmiş kupon üretilmez.
- **SONUÇLARI GETİR · MANUEL** yalnız seçilen kupon maçlarını kontrol eder. Panelin 10 saniyelik durum yenilemesi API-Football sorgusu değildir. Banko sonuçlarına otomatik tarama eklenmedi.
- Tercih iki farklı maç: her ayak en az **1.40**, kupon toplamı varsayılan **1.95–2.40**. Uygun çift bulunmazsa **1.80–2.20** tekli olabilir. Üçüncü ayak eklenmez, uygun seçim yoksa kupon zorlanmaz. Oran sınırları panelden ayarlanabilir.
- Günlük ayrı **Banko API tavanı 2000**, ayarlardan değiştirilebilir. Bu harcama hedefi değildir. Sayaç TSİ gününe göre kalıcı tutulur, istek kuyruğunun gerçek gönderim noktasında sayılır; hata sonrası gizli tekrar yoktur. Ortak kotanın kalan bilgisi varsa **1500 canlı rezervi** ayrıca korunur. Lig/takım geçmişleri ve maç istatistikleri önbelleğe alınır.
- **Yalnız seçilen maçları otomatik kontrol et** varsayılan açık: mevcut zamanlayıcı maçtan 75 dakika önce son tamamlanmış günlük kupon sürümünün seçilen maçlarını bir kez kontrol eder. Ayarlardan kapatılabilir. Eski sürümler otomatik tekrar kontrol edilmez; **MAÇ ÖNÜ KONTROL** düğmesiyle elle incelenebilir. Başlama yaklaştığında kadro için elle tekrar kontrol yapılabilir. Tarama/sonuçlar manuel kalır.
- Her oluşturma ayrı sürümdür. İlk tahmin, oran ve model sürümü dondurulur; kontrolün yeni oranı ayrı görünür. Eski kuponlar değiştirilmez/silinmez. Eksik kadro/sakatlık kapsamı “oyuncu eksiği yok” anlamına gelmez; uyarı gösterilir. Başlamış, saati değişmiş veya güncel fiyat/veri sınırını geçemeyen seçim onaylanmaz.
- Ayrıntılarda son 5 ve son 20 **aynı lig** maçı, son 10 ev/deplasman maçı; son 10 maçın şut, isabetli şut, ceza içi/dışı şut, korner, kart ve xG örneklemleri; son 5 maçın oyuncu bağlamı; tüm dönen bookmaker marketleri, seçim/pas nedenleri ve veri eksikleri gösterilir. Diğer kupa/ligler bu ilk sürümün form/dinlenme geçmişine dahil değildir. Boş veri sıfır yapılmaz.
- Bu ilk sürüm **kalibrasyonsuz bağımsız Poisson gol tabanlı LAB modelidir**. Son 5 formu, uzun dönem ve saha gol geçmişini kullanır. Şut/xG/kart/oyuncu bilgileri ayrıntılı bağlamdır; henüz eğitilmiş karar ağırlıkları değildir. İki ayağın çarpımı gerçek kupon başarı oranı olarak sunulmaz. Varsayılan ham model %65 ve model/piyasa farkı ≥0 başlangıç filtreleridir; kanıtlanmış isabet eşikleri değildir.
- Veri yeterliyse normal süre MS/çifte şans, ALT/ÜST yarım çizgileri, KG, takım golü/gol yememe, ilk/ikinci yarı ve İY/MS kuralları değerlendirilebilir. Her iki takımda en az 10 geçmiş lig ve 5 saha maçı gerekir; yarı marketlerinde ayrıca 10 geçerli İY/MS skor örneği gerekir. Korner tahmini tanısaldır, kupon seçimi değildir. Kart, şut, oyuncu, belirsiz kombinasyon ve Asya çizgileri **yalnız analiz**: fiyatları görünür, doğrulanmamış kuralla kupona alınmaz.
- Bet365 tek bookmaker kaynağıdır; yeni eksik market eski cevapla doldurulmaz. Maç öncesi zaman damgası kontrol edilir. Sonuçlarda normal süre/ilk yarı skoru kullanılır, uzatma/penaltı golleri katılmaz. Eksik skor veya hükmen maç otomatik kazandı/kaybetti sayılmaz.
- Banko **Telegram'a otomatik göndermez**. Panel özel mevcut kimlik doğrulaması altındadır. Metni kopyalayıp elle iletebilirsiniz. V24 canlı sinyalleri ve İY/MS LAB ayrı kalır; canlı tarifeler değiştirilmedi. “Banko” mod adıdır, kazanma garantisi değildir.

Yeni kalıcı dosyalar ilk kullanımda oluşur: `dino_banko_coupon_v1.json`, `dino_banko_api_usage.json`, `dino_banko_cache_v1.json`. Bu dosyalar pakette yoktur; var olanlarını silmeyin. Bozuk dosya üzerine yazılmadan sistem güvenli şekilde durur. Yeni `.env` alanı veya npm bağımlılığı gerekmez; mevcut API anahtarı ve panel erişimi kullanılır.

## Uygulama ve doğrulama

Botu mevcut yönteminizle durdurup değişen kodları yedekleyin. ZIP içindeki kod dosyalarını **bot köküne klasör yapısını koruyarak** uygulayın; mevcut `.env`, veri/history/cache, model ve `node_modules` dosyalarını koruyun. Botu yeniden başlatın, paneli **Ctrl+F5** ile yenileyin. Ardından Banko tarihini/ayarlarını seçip manuel tarama başlatın.

```sh
node --check server.js
npm run test:all
```

45 çevrimdışı test betiği (42 mevcut + 3 Banko), kaynak ve ZIP uygulanmış sürüm için doğrulanır. Testler API bütçesi/önbellek, veri sızıntısız geçmiş, ilk kayıt/sürüm koruma, normal süre sonuçları, manuel panel işlemleri, eksik veri uyarıları ve mevcut canlı akışları kapsar. Tarayıcı panel önizlemesi sahte verilerle kontrol edilmiştir. Bu geliştirmede gerçek API-Football/Telegram isteği yapılmamıştır. Gerçek servis yanıtı ilk manuel taramada doğrulanmalıdır. Windows yerel testlerinde yalnız izinli test-geçici klasör yönlendirmesi kullanılır; model/API davranışı değiştirilmez.

Paket sunucuya otomatik yüklenmemiştir. Aşağıdaki notlar önceki birikimli özellikleri açıklar; güncel Banko davranışı yukarıdadır.

---

## Önceki İY/MS-only güncellemesi — korundu

Bu ZIP mevcut **1 Ekim V24 Ana + Odak pre52** sürümü için birikimli güncellemedir; tam bot değildir.
Önceki 5 Ekim V24 canlı geçiş, Live grup ve erken ÜST paketlerindeki değişiklikleri de içerir; eski ZIP'leri ayrıca yüklemek gerekmez.
Önceki paketleri zaten yüklediysen bu paketi de aynı şekilde uygulayabilirsin.
Sürüm: `mac-yakala-coupon-htft-only-2026-10-05`.

## Bu sürüm: mevcut kupon modu yalnız İY/MS

- Yeni çifte şans tahmini, yedek seçimi, ayarı, panel oran alanı ve canlı karar yolu bu kupon modundan kaldırıldı. MS1/X/MS2 oranları yalnız İY/MS analizi için bağlamdır.
- Dokuz İY/MS kombinasyonu puanlanır; en iyi üç analiz görüntülenir. Maç başına en fazla **tek ana seçim** ayrılır; alternatifler kupona dahil değildir, onların sonuçları ana seçimin başarısına katılmaz.
- Ana seçim için iki takımda en az 5 saha maçı, dört gol atma/yeme zaman profilinde en az 3 gol ve geçerli İY/2Y dağılımı, tam 9 İY/MS oranı ve MS1/X/MS2 bağlamı gerekir. Eksik veriler yalnız analiz olarak görünür; onay verilmez. Bunlar veri yeterliliği kontrolleridir, yeni bir başarı yüzdesi eşiği değildir.
- Puan bir başarı olasılığı değildir. Piyasa yüzdesi tam dokuz orandan marj ayıklanarak hesaplanır; eksik markette yüzde gösterilmez. Skor ağırlıkları korunmuştur; yeni model eğitilmedi veya performans garantisi eklenmedi.
- API takım profilinin gol ortalamaları ev/deplasman sahasına göredir. API dakika dağılımı sezonun **tüm sahaları** içindir; panel bunu açıkça belirtir. Gol dağılımı, ilk yarı kazanma sıklığı değildir.
- Pre-match ID 7 yalnız İY/MS, ID 1 yalnız maç sonu bağlamıdır. ID 12/20 çifte şansları ve ID 11 en çok gol olan yarı karışamaz. Farklı bookmaker fiyatları tek tabloda birleştirilmez; daha yeni eksik market eski oranlarla doldurulmaz.
- Maç önü kontrol yalnız ana seçimi tekrar değerlendirir; eksik market, başlamış/saati değişmiş maç veya yetersiz veri onay almaz. Yeşil ana seçim için son kontrolün geçmesi gerekir; bekleyen aday farklı renktedir.
- Eksik skor 0-0 sayılmaz. Eksik/tutarsız ilk yarı veya normal süre skoru kesin kazandı/kaybetti olarak kapanmaz. AET/PEN maçlarında normal süre `score.fulltime` kullanılır, uzatma/penaltı golleri kullanılmaz. Hükmen maçlar normal İY/MS sonucu olarak otomatik derecelendirilmez.
- Eski adaylar ve sonuçlar geçmiş dosyasında korunur; karma sürümün seçimleri aktif listeye/maç önü onayına yeniden alınmaz. Eski `maxDoubleChance` ayarı okunursa yok sayılır. Eski tamamlanmış tarama yeni yalnız-İY/MS taramasını engellemez.
- Bozuk geçmiş dosyası sıfırlanmaz/üzerine yazılmaz; yeni kupon taraması durur. Günlük API bütçesi, genel rezerv, tek ana tarama, takım profili önbelleği ve tek maç önü kontrolü korunur. Ek market başına yeni API sorgusu veya yeni zamanlayıcı yoktur.
- V24 Ana, Telegram/Live grup ve erken ÜST kararları değişmez. Kupon LAB yine Telegram'a göndermez.

## İkinci sistem: Banko Kupon (bu pakette eklendi)

Banko ayrı sistem olarak eklendi; ayrıntıları bu belgenin başındadır. İY/MS moduna Banko oran kuralları eklenmemiştir.

## Güncellemeden sonra

Paneli Ctrl+F5 ile yenile: **İY/MS Kupon LAB** görünmeli, maksimum çifte şans alanı olmamalı. Eski kayıtlar aktif listeden ayrılacağı için güncel taramayı panelden başlatabilirsin. Yeni `.env` alanı gerekmez; `dino_coupon_lab_v1.json` ve diğer kalıcı verileri silme.

42 test betiği çevrimdışı geçti. Ayrıca bir önceki gerçek API örneği yerelde tekrar ayrıştırıldı: 13 başlamamış örneğin 12 İY/MS marketi korundu, hiç çifte şans alanı üretilmedi. Bu sürüm için yeni gerçek API veya Telegram isteği yapılmadı; panel testleri DOM simülasyonuyla çalıştırıldı.

---

## Önceki birikimli V24 / Live grup / erken ÜST özellikleri (korundu)

## Onaylanan değişiklikler

- Telegram yalnız V24 Ana: Sniper → B → A → MS, maç başına ilk uygun tek sinyal.
- Kadın maçları V24 Ana ve Gemini'de açık. Diğer lig seçimleri değişmedi.
- Gemini her gün LAB olarak çalışır; ÜST 25–68, Dino edge −12…0 ve İngiltere League One/Two hariç koşulları korunur.
- Eski Telegram LAB, önceki Telegram kaynak/karar kuralları ve V22'nin açık-ret kapısıyla bağımsız ilk kayıt toplar; mesaj göndermez.
- V21/V22 Yeni Filtre Deneyleri paneli ve özel kayıt/rapor/sonuç/arşiv bakım işleri durduruldu.
- Yalnız Weekend Guard paneli ve motoru durduruldu. Quiet, Seçici, V24+V25 Ortak, Odak, V21 ve V22 LAB'ları devam eder.
- Mesajdan yalnız “Öncelikli modelimiz V22” satırı kaldırıldı. Diğer alanlar, analiz biçimi, oran yazımı ve kazandı yanıtı korunur; model V24 olarak görünür.
- Maç Yakala Live grubu, mevcut ek Telegram kanalı ve X'ten bağımsız üçüncü paylaşım hedefidir.
- ÜST eşiği iki ayrı taze skor cevabında aşılmışsa, maç sonunu beklemeden tek “YAKALADIK!” yanıtı gönderilir. Kesin sonuçlandırma ayrı kalır.

## Erken ÜST kazanım bildirimi

- Paylaşılmış normal süre yarım çizgi ÜSTleri: 0.5 → en az 1 toplam gol, 1.5 → 2, 2.5 → 3, 3.5 → 4, 4.5 → 5.
- Yalnız sinyal sonrası başlamış iki ayrı fixture isteği sayılır; aynı cevap/tekrar çağrı, örtüşen istek veya 60 saniyeden kısa aralık doğrulama oluşturmaz.
- Mevcut `/fixtures?live=all` tarama cevabı dakika/lig/istatistik/oran filtresinden ÖNCE kullanılır; 80+ dakikalar da izlenir. Mevcut 10 dakikalık `/fixtures?ids=...` sonuç sorgusu da ikinci taze kontrolü sağlayabilir.
- Yeni API-Football isteği, şut/istatistik/oran/model sorgusu veya zamanlayıcı EKLENMEZ. Normal taramanın 5/10 dakika ayarı değişmedi.
- İlk uygun gözlem kaydedilir. Sonraki bağımsız taze gözlemde skor çizginin üstünde kalırsa ana kanal ve etkin ek Telegram hedefleri kendi mesajlarına yanıt verir. X'e sonuç paylaşımı eklenmedi.
- Skor azalırsa, dakika gerilerse, gol bilgisi geçersiz/eksikse veya normal süre canlı statüsü kaybolursa onay sıfırlanır. Skor azalsa bile hâlâ çizginin üstündeyse yeni iki-kontrol dizisi gerekir.
- İlk/ikinci kontrol arasında en fazla 20 dakika, kullanılan cevapta en fazla 2 dakika yaş/istek süresi kabul edilir. Sistem yeniden başlayınca eski canlı onaylar tek başına kullanılamaz; iki yeni kontrol gerekir.
- `1H/HT/2H` dışındaki uzatma/penaltı/askıya alınmış maçlar erken kazanım üretemez. ALT ve MS1/MS2 sonuçları eskisi gibi maç sonunu bekler.
- Erken onay yalnız bildirim kanıtıdır (`earlyOverWin`); `settlement.result`, kâr, ROI ve kesin final skoruna dokunmaz. Panel maç sonuna kadar “Bekliyor” gösterebilir; bu normaldir.
- Kalıcı Telegram gönderim kilitleri korunur: başarılı erken yanıt maç sonunda veya yeniden başlatmada tekrarlanmaz. Belirsiz/eksik yanıt otomatik yeniden gönderilmez; 429 mevcut bekleme kuralını kullanır ve taze onay yoksa bekler.
- İki gözlem VAR/skor düzeltmesi riskini AZALTIR, sıfırlamaz. Daha sonra iptal/yarıda kalma veya gol düzeltmesi olursa nihai panel sonucu gerçek FT/VOID verisine göre kapanır; erken mesaj resmi bahis sonuçlandırması değildir.

Bu özellik yeni sürümde otomatik çalışır; yeni `.env` alanı veya panel şalteri gerekmez. Live gruba mesaj gitmesi için mevcut grup paylaşımı anahtarı ayrıca açık olmalıdır.

## Maç Yakala Live grubunu açma

1. Mevcut Telegram botunu **Maç Yakala Live** grubuna ekle ve mesaj gönderme iznini kontrol et.
2. Bu paketi yükleyip botu yeniden başlat; paneli Ctrl+F5 ile yenile.
3. Panelin ek paylaşım bölümünde **“Maç Yakala Live grubuna paylaş”** anahtarını aç.

Kullanıcının verdiği `-1004308912742` hedefi bu pakette hazırdır. Yeni grup varsayılan olarak KAPALI'dır.
Mevcut ek hedefin `TELEGRAM_EXTRA_CHAT_ID` alanı, açık/kapalı durumu ve gönderim kayıtları korunur.
Yeni grubun hedefini değiştirmek istersen `.env` içine şu alanı koyabilirsin; mevcut alanları değiştirme:

```dotenv
TELEGRAM_GROUP_CHAT_ID=-1004308912742
```

Bu alan yoksa yukarıdaki hazır grup kullanılır; alanı bilerek boş bırakırsan yeni grup yapılandırılmamış sayılır.
Hedef değişikliği grubu kapatır ve eski bekleyen sonuç yanıtlarını canlandırmaz; yeni hedefi panelden tekrar açmalısın.
Grup hedefi ana kanal veya mevcut ek hedefle aynı olamaz.

Yalnız ana Telegram gönderimi onaylandıktan sonra aynı V24 metni etkin ek hedeflere gönderilir.
Grup açılınca geçmiş sinyaller taşınmaz. Her hedefin tekilleştirme ve kendi mesajına “Yakaladık!” yanıtı bağımsızdır.
Grup kapatılıp tekrar açılırsa kapatılmadan önceki bekleyen grup yanıtları yeniden başlatılmaz; mevcut ek kanalın yanıtları etkilenmez.
Grup gönderim reddi/timeout'u ana kanalı, mevcut ek kanalı veya X'i durdurmaz. Belirsiz gönderimler otomatik tekrarlanmaz.
Paylaşım ayar/günlük dosyası bozuksa veya yazılamıyorsa ek hedefler güvenli şekilde durur; dosya silinmez ve ana Telegram korunur.

Eski iki-hedefli `mac_yakala_sharing_settings.json` dosyası otomatik yükseltilir; eski kanal/X anahtarları ve dönem kilitleri korunur.
`mac_yakala_sharing_delivery.json` geçmişi korunur. Bu iki dosyayı SİLME veya ZIP içinden değiştirme; pakette bulunmazlar.
Panelde “hedef hazır” yalnız yerel ayarın tamam olduğunu gösterir; botun gerçek grup üyeliği/yetkisi Telegram gönderiminde doğrulanır.
Grup kopyası ek API-Football taraması, model hesabı veya paylaşılan sinyal sayacı oluşturmaz. Her yeni sinyal için bir Telegram mesajı ve kazanırsa bir sonuç yanıtı eklenir.

## V24 Ana eşikleri değişmedi

| Kol | V16 minimum | Pre minimumları |
|---|---|---|
| Sniper: 0-0, 1.5 ÜST | %72 | 1.5: %75 |
| B: tam 1 gol gerekli | %65 | 1.5/2.5/3.5/4.5: %70/%32/%30/%25 |
| A: tam 2 gol gerekli | %65 | 2.5/3.5/4.5: %52/%25/%25 |
| MS: öndeki taraf | %60 | Pre karar şartı değil |

ÜST: dakika25–70 dahil, oran1.50–4.00, Dino≥45 (Sniper≥50), V18≥50, Dino edge≤0, gereken gol en fazla2.
MS: dakika25–44 dahil, oran1.50–2.50, V16 edge0…+5 dahil.
Olay/skor tutarlılığı ve ortak taze fixture/stats/oran/model doğrulaması zorunlu.
Son Telegram kontrolünde güncel dakika, oran ve edge tekrar sınanır; değişen skor veya başarısız doğrulama mesajı engeller.
A3.5/A4.5 veya B2.5/B3.5/B4.5 için yeni yasak eklenmedi.

## Geçmiş ve kilitler

Eski paylaşımlar, teslim günlüğü ve LAB arşivleri silinmez.
`mac_yakala_telegram_delivery.json` içinde ilk geçişte `v24ActivatedAt` kaydedilir; yeniden başlatmada değişmez.
Geçişten önce alınmış V24 LAB kayıtları Telegram'a taşınmaz. Önceden paylaşılmış veya gönderimi belirsiz fixture da tekrar gönderilmez.
Geçişten sonraki yeni LAB kaydı canlı gönderim kilidini tüketmez; LAB ve gerçek Telegram sayıları ayrı izlenir.
Kesin Telegram reddinde yeni taze aday tekrar denenebilir; belirsiz gönderim otomatik tekrarlanmaz.

Yeni `dino_old_telegram_lab_history.json` yalnız Eski Telegram LAB'a aittir.
Eski kaynak bayrakları (`MAC_YAKALA_V21_TELEGRAM_ENABLED`, `MAC_YAKALA_V22_TELEGRAM_ENABLED` ve `DINO_V23_V22_GATE_ENABLED`) artık yalnız bu LAB'ı yapılandırır; canlı V24'ü eski modele döndürmez.
Mevcut `DINO_V24_SHADOW_ENABLED` LAB kayıtlarını yönetmeye devam eder; canlı V24 bu LAB bayrağına bağlı değildir.
Quiet/Seçici/Ortak hafta sonu koşulları ve önceki kadın kapsamları korunur; Odak V24 Ana'nın kapsamını izler.
Arşiv dosyalarının üzerine aktif geçmiş yolu verilirse başlangıç güvenlik kontrolü durur.

## API / RAM

Kapatılan deneylerin tracker'ı yüklenmez, raporu hesaplanmaz, sonuç sorgularına eklenmez ve bakım zamanlayıcısı kurulmaz.
Eski Telegram LAB için sadece hafif, depolamasız karar hesabı korunur. Ortak V24 olay/skor ve taze doğrulama kaldırılmaz.
Yeni bağımsız tarama veya API endpoint'i eklenmedi. Yeni bir uygun aday mevcut ortak doğrulamayı tetikleyebilir; toplam API sayısının hiç artmayacağı garanti edilmez.
RSS/RAM tasarrufu sunucuda ölçülmedi.

## Kurulum

1. Botu mevcut servis yöneticinle durdur; değişecek kaynak dosyalarını yedekle.
2. ZIP içeriğini bot köküne klasör yapısını koruyarak uygula. Hem kökteki `index.html` hem `public/index.html` değişmeli.
3. `.env`, model JSON'ları, history/cache JSON'ları, veritabanı ve `node_modules` bu ZIP'te yoktur; bunları değiştirme. Özellikle teslim günlüğünü silme.
4. Bot kökünde kontrolleri çalıştır:

```sh
node --check server.js
node --check v24_telegram_router.js
node --check sharing_delivery.js
node --check early_over_win.js
npm test
```

5. Testler geçince mevcut yöntemle botu yeniden başlat ve paneli Ctrl+F5 ile yenile.
6. Sürümün yukarıdaki değer olduğunu; Telegram kaynaklarının yalnız V24 olduğunu; Gemini'nin “her gün”, Eski Telegram'ın “LAB” olduğunu kontrol et. Weekend Guard ve Yeni Filtre Deneyleri görünmemeli. Ek paylaşım bölümünde mevcut ek hedef ve Maç Yakala Live ayrı anahtarlar olarak görünmeli.

Yerel doğrulama: 40 güncel test betiği; dört canlı kol, kadınlar, son dakika/oran/edge kontrolü, kalıcı fixture kilidi, belirsiz gönderim, geçmişi yeniden göndermeme, eski kapı eşdeğerliği, LAB sonuç kapatma ve panel DOM/dışa aktarma.
Yeni grup testleri: eski ayar/günlük yükseltme, üçüncü hedef, mevcut kanalın korunması, ayrı sonuç yanıtları, kapat/aç ve hedef değişikliği, reddetme/timeout/yeniden başlatma, mükerrer hedef, varsayılan/.env grup hedefi ve panel kaydetme/hata dönüşü. Gerçek sunucu akışı sahte Telegram ile ana+ek+grup gönderimini ve ortak tek taze kontrolü doğrular.
Erken ÜST testleri: iki taze cevap/60 saniye sınırı, aynı/örtüşen/eski cevap, yanlış fixture, skor/dakika/VAR düzeltmesi, uzatma/penaltı engeli, 80+ dakika gerçek sunucu akışı, mevcut sonuç sorgusuyla ikinci onay, kesin sonuç/kâr izolasyonu, yeniden başlatma/429/belirsiz gönderim/disk hatası ve üç hedefe bağımsız tek yanıt. Futbol istek sayısı sunucu simülasyonunda eski tarama/sonuç istekleriyle birebir aynı doğrulandı.
Emekli V21/V22 canlı gönderim ve V23 panel/bakım akış testlerinin yerini V24 geçiş testleri aldı; ilgili saf karar/arşiv testleri korunur.
Testler çevrimdışı yürütüldü; gerçek Telegram/API isteği yapılmadı.

Bu paket sunucuya otomatik yüklenmedi. Sunucuda etkinleşmesi dosyaları uygulayıp botu yeniden başlatmana bağlıdır.
