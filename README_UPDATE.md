# V24 Ana canlı geçiş + Maç Yakala Live grubu — 5 Ekim 2026

Bu ZIP mevcut **1 Ekim V24 Ana + Odak pre52** sürümü için birikimli güncellemedir; tam bot değildir.
Önceki 5 Ekim V24 canlı geçiş paketindeki değişiklikleri de içerir; iki ZIP'i üst üste yüklemek gerekmez.
Önceki geçiş paketini zaten yüklediysen bu paketi de aynı şekilde uygulayabilirsin.
Sürüm: `mac-yakala-v24-live-group-2026-10-05`.

## Onaylanan değişiklikler

- Telegram yalnız V24 Ana: Sniper → B → A → MS, maç başına ilk uygun tek sinyal.
- Kadın maçları V24 Ana ve Gemini'de açık. Diğer lig seçimleri değişmedi.
- Gemini her gün LAB olarak çalışır; ÜST 25–68, Dino edge −12…0 ve İngiltere League One/Two hariç koşulları korunur.
- Eski Telegram LAB, önceki Telegram kaynak/karar kuralları ve V22'nin açık-ret kapısıyla bağımsız ilk kayıt toplar; mesaj göndermez.
- V21/V22 Yeni Filtre Deneyleri paneli ve özel kayıt/rapor/sonuç/arşiv bakım işleri durduruldu.
- Yalnız Weekend Guard paneli ve motoru durduruldu. Quiet, Seçici, V24+V25 Ortak, Odak, V21 ve V22 LAB'ları devam eder.
- Mesajdan yalnız “Öncelikli modelimiz V22” satırı kaldırıldı. Diğer alanlar, analiz biçimi, oran yazımı ve kazandı yanıtı korunur; model V24 olarak görünür.
- Maç Yakala Live grubu, mevcut ek Telegram kanalı ve X'ten bağımsız üçüncü paylaşım hedefidir.

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
npm test
```

5. Testler geçince mevcut yöntemle botu yeniden başlat ve paneli Ctrl+F5 ile yenile.
6. Sürümün yukarıdaki değer olduğunu; Telegram kaynaklarının yalnız V24 olduğunu; Gemini'nin “her gün”, Eski Telegram'ın “LAB” olduğunu kontrol et. Weekend Guard ve Yeni Filtre Deneyleri görünmemeli. Ek paylaşım bölümünde mevcut ek hedef ve Maç Yakala Live ayrı anahtarlar olarak görünmeli.

Yerel doğrulama: 38 güncel test betiği; dört canlı kol, kadınlar, son dakika/oran/edge kontrolü, kalıcı fixture kilidi, belirsiz gönderim, geçmişi yeniden göndermeme, eski kapı eşdeğerliği, LAB sonuç kapatma ve panel DOM/dışa aktarma.
Yeni grup testleri: eski ayar/günlük yükseltme, üçüncü hedef, mevcut kanalın korunması, ayrı sonuç yanıtları, kapat/aç ve hedef değişikliği, reddetme/timeout/yeniden başlatma, mükerrer hedef, varsayılan/.env grup hedefi ve panel kaydetme/hata dönüşü. Gerçek sunucu akışı sahte Telegram ile ana+ek+grup gönderimini ve ortak tek taze kontrolü doğrular.
Emekli V21/V22 canlı gönderim ve V23 panel/bakım akış testlerinin yerini V24 geçiş testleri aldı; ilgili saf karar/arşiv testleri korunur.
Testler çevrimdışı yürütüldü; gerçek Telegram/API isteği yapılmadı.

Bu paket sunucuya otomatik yüklenmedi. Sunucuda etkinleşmesi dosyaları uygulayıp botu yeniden başlatmana bağlıdır.
