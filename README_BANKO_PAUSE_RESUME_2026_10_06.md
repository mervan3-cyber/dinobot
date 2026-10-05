# Banko Kupon — canlı işlemi bekle, aynı taramadan devam et

6 Ekim 2026. Bu ZIP, **5 Ekim Banko Kupon kurulmuş botun üzerine** uygulanır. Önceki 8 genel + 3 saha geçmişi, kart/xG ayrıntısı ve kupon sayısındaki 2 tavanının kaldırılmasını da içerir. Tam bot değildir; sadece Banko kodları ve panelin Banko bölümü değişir.

- Canlı tarama, sonuç yenileme veya devam eden İY/MS işlemi sırasında Banko artık hata vererek taramayı kesmez. Aynı işlem kaydı, taranan maçlar, sayfa/batch konumu ve API sayacı korunarak bekler; engel kalkınca otomatik devam eder. Yeniden kupon oluştur düğmesine basmak gerekmez.
- Panelde **⏸ Canlı taramayı bekliyor** ve ilerleme sayısı görünür. Aynı anda ikinci Banko işi başlatılamaz veya ayarları değiştirilemez.
- Bekleme sırasında yeni futbol API isteği gönderilmez; yalnız uygulamadaki canlı işlem bayrakları saniyede bir kontrol edilir. Yeni sürekli tarama veya API endpoint'i eklenmedi.
- Bekleme ortak API kuyruğunun **dışındadır**: canlı işlem kuyruğu kullanıp tamamlanabilir. Kuyrukta beklerken canlı işlem başladıysa, henüz gönderilmemiş Banko isteği ertelenir; bütçeye yazılmaz. Gönderilmiş/sonucu belirsiz/hatalı API isteği bu mekanizmayla tekrar gönderilmez. Zaten gönderilmiş istek tamamlanabilir; sonraki istek bekler.
- Günlük 2000 varsayılan bütçe, 1500 canlı rezervi, önbellek, tek Banko işi, manuel sonuçlar, seçilen maçların isteğe bağlı son kontrolü ve eski kupon sürümleri korunur. Bütçe/rezerv/disk/API hataları canlı bekleme sayılmaz; güvenli şekilde işlem durur ve kayıt korunur.
- Uzun beklemede başlayan/yaklaşan maçlar ve eskiyen oranlar yeni kupona alınmaz. Tamamlamadan önce aynı kaydedilmiş verilerle mevcut zaman/uygunluk kontrolü tekrarlanır; bunun için ekstra futbol isteği yapılmaz. Eski kuponların ilk seçimi ve oranı yeniden hesaplanmaz.
- **Sunucu yeniden başlatılırsa** yarım tarama korunur ve “interrupted” olarak görünür; otomatik yeniden başlatılmaz. Bu güncellemeden önce “partial” olmuş taramalar da geçmişte kalır. Kurulumdan sonra yeni manuel taramayı bir kez başlatın; sonraki canlı aralarda aynı iş otomatik sürdürülür.

`server.js`, V24, Telegram, paylaşılan sinyaller, erken YAKALADIK ve mevcut İY/MS kodları değiştirilmedi. Banko modelinin olasılık/edge/oran eşikleri önceki 8+3 güncellemesiyle aynıdır. Çalışma etiketi `banko-pause-resume-v1-2026-10-06`; eski kayıtlarla uyum için depolama şeması v1 kaldı.

## Kurulum

Botu mevcut yönteminizle durdurun; değişecek kodları yedekleyin. ZIP'i bot köküne **public/** yapısını koruyarak uygulayın. `.env`, `node_modules`, history/cache/model/veritabanı JSON'ları ve özellikle `dino_banko_coupon_v1.json`, `dino_banko_api_usage.json`, `dino_banko_cache_v1.json` dosyalarını silmeyin; ZIP'te bunlar yoktur. Yeni bağımlılık gerekmez.

Botu yeniden başlatın, paneli **Ctrl+F5** ile yenileyin ve seçili güne kupon oluşturmayı **bir kez** başlatın. Bekleme durumunda ikinci kez basmayın. Geçerli aday yoksa yine kupon zorlanmaz; “Banko” bir mod adı, kazanma garantisi değildir.

45 çevrimdışı test betiği; ayrıca Banko servis testinin içinde başlangıç/yarı tarama beklemesi, gerçek ortak kuyruk koduyla gönderim yarışı, sıfır bekleme kotası, aynı kayıt/ilerleme, sayfa konumu, gerçek API hatasında tekrar olmaması, bütçe/rezerv/disk durması, eskiyen oran ve başlayan maç, yeniden başlatma ve manuel sonuç beklemesi test edilir. Gerçek ZIP uygulanmış kopya da test edilir. Panel sahte verilerle tarayıcıda kontrol edilir. Gerçek API-Football/Telegram çağrısı ve sunucuya otomatik yükleme yapılmadı.
