# Banko Kupon — 6 Ekim 2026 ayar güncellemesi

Bu küçük ZIP, **5 Ekim Banko Kupon kurulmuş botun üzerine** uygulanır; tam bot değildir. Yalnız Banko ve paneldeki Banko bölümü değişti. `server.js`, V24, Telegram, paylaşılan sinyaller, erken YAKALADIK, mevcut İY/MS kupon sistemi ve canlı son doğrulama değiştirilmedi.

## Yeni taramaların kuralları

- Her takım için en az **8 tamamlanmış geçmiş lig maçı** ve **3 ilgili saha maçı** gerekir. 9 maç yeterlidir; tam 10 kayıt şartı yoktur. Son 20 / son 5 formu ve mevcut gol modeli aynı kalır. Diğer kupa/lig maçları bu güncellemeyle geçmişe eklenmez.
- İlk yarı, ikinci yarı ve İY/MS marketleri için her iki takımda **10 geçerli yarı skor örneği** şartı aynen korunur. Genel veri eşiğinin 8 olması yarı eşiğini düşürmez.
- Sarı/kırmızı kart ve xG eksikliği seçim engeli **değildi, yine değil**. Bunlar artık takım profilinde kapalı **İsteğe bağlı veriler · kart / xG** ayrıntısındadır. Eksik değer “—” ve dolu kayıt sayısı ile gösterilir; sıfıra dönüştürülmez. Ana istatistik tablosu şut, isabetli şut, ceza içi/dışı şut ve korneri gösterir.
- **İstenen maksimum kupon sayısı** alanındaki sabit 2 tavanı kaldırıldı. Pozitif tam sayı girilebilir. Bu sayı üst sınırdır; uygun maç sayısı, incelenecek maç ayarı ve API bütçesi ayrıca geçerlidir. Yeterli aday yoksa sayıyı doldurmak için zayıf kupon üretilmez.
- Kuponlar yine **1–2 maçlıdır**; aynı taramadaki kuponlarda bir maç tekrar kullanılmaz. Uygun çift bulunmazsa mevcut tekli alternatifi korunur. Ayak/kupon oranları, ham model ve edge filtreleri değişmedi.
- Varsayılan günlük API bütçesi **2000**, düzenlenebilir. **1500 canlı rezervi**, önbellek ve API kuyruğu korumaları aynen kalır. Tarama ve sonuç kontrolü manuel; seçilen maçların isteğe bağlı son kontrolü korunur.

## Eski kayıtlar ve kurulum

Her tarama ayrı sürüm kaydeder. Eski kuponların ilk tahmini, oranı, sonuçları, model sürümü ve sürüm listesi yeniden hesaplanmaz veya silinmez. Yeni model etiketi `banko-model-lab-v2-2026-10-06`; depolama şeması eski kayıtları okuyabilmek için v1 kalır. Kaydettiğiniz kupon sayısı da korunur; daha fazlası için panelde sayıyı değiştirip kaydedin.

1. Botu mevcut yönteminizle durdurun ve değişecek kodları yedekleyin.
2. ZIP içindeki dosyaları bot köküne, `public/` klasör yapısını koruyarak uygulayın.
3. `.env`, `node_modules`, tüm history/cache/model/veritabanı dosyaları ve özellikle `dino_banko_coupon_v1.json`, `dino_banko_api_usage.json`, `dino_banko_cache_v1.json` korunmalıdır. Bunlar ZIP'te yoktur. Yeni bağımlılık veya `.env` değişikliği gerekmez.
4. Botu yeniden başlatıp paneli **Ctrl+F5** ile yenileyin. Banko ayarlarında sabit 2 tavanı olmayan alan ve 8 + 3 veri açıklaması görünmelidir.
5. Yeni kuralları görmek için yeni manuel tarama oluşturun; önceki sürümleri arşivden görüntüleyebilirsiniz.

Doğrulama: 45 çevrimdışı test betiği (42 mevcut + 3 Banko), gerçek ZIP'in eski Banko sürümüne uygulanmış kopyasında da çalıştırılır. 8/3 ve 10 yarı skor sınırları, eksik kart/xG, 3+ kupon, farklı maçlar, yüksek sayıdaki isteklerin zorlanmaması, eski kayıtların okunması ve canlı modüllerin değişmemesi kontrol edilir. Tarayıcı önizlemesi sahte verilerle yapılır; gerçek futbol API'si/Telegram çağrısı veya sunucuya otomatik yükleme yoktur.

“Banko” mod adıdır; kazanma garantisi değildir. Model kalibrasyonsuz LAB tahmini olarak kalır. Daha düşük veri eşiği tek başına doğruluğun yükseldiği anlamına gelmez.
