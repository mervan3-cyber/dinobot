# V22 A/B/C ileri test — 13 Eylül 2026

Build: `ml-v22-union-abc-lab-v21-preserved-ubuntu-2026-09-13`  
Paket: `2.2.0`  
Tarife: `v22-over-union-abc-fresh-2026-09-13`

## Kapsam

- V22, V21'e dokunmadan ayrı Test Lab kolu olarak eklendi. V21, V19, Yeni Çekirdek, Legacy V17 ve V20 yerinde kalır.
- ÜST / üç modelin tamamı >%50 / 25–80 dakika / 1.50–4.00 oran ortak şartları ve onaylanan A/B/C OR birleşimi `v22_tariff.js` içinde sabittir. Filtrelerin EDGE sınırları dahil, Pre eşikleri katıdır (>).
- `v22_lab.js` ön seçim, model onayı, taze kayıt, maç kilidi ve A/B/C raporlamasını ayrı tutar. Taze doğrulama zamanı ile kayıt zamanı eşleşmelidir. Sonuca bakarak aday seçimi yapılmaz.
- Ayrı `dino_v22_union_shadow_history.json` dosyası kullanılır. Her maçta ilk uygun taramada yalnız bir kayıt oluşturulur; aynı kayıtta A+B veya A+C gibi çoklu etiket olabilir. Yeniden başlatma kilitleri korur.
- Canlı tarama hattı V22 adaylarını taze kontrol ve Python/model yeniden hesaplamasına dahil eder. Mevcut kota/kalite kontrolleri korunur. Sonuç kontrolü V22'nin bekleyen maçlarını da takip eder.
- V22'nin API, tarih seçimi, kart, tablo, filtre özetleri ve JSON/CSV çıktıları eklendi. Giriş skoru ve gereken gol sayısı görünürdür. Genel sayaç tekrarsız; etiket sayaçları örtüşebilir.
- V22 lab adayı aktif Telegram gönderimini açamaz. Telegram'a mesaj, V21'e kayıt aktarımı, eski tam-stat sonuçlarının V22'ye doldurulması veya sunucuya otomatik yükleme yapılmaz.
- Başlangıç, ilk gerçek V22 kaydıdır. V22 eklenmesi diğer lab kollarının ortak karşılaştırma başlangıcını sıfırlamaz.

## Değişmeyenler

V21 tarife/geçmiş-kohort modülleri ve bağımsız lab seçicisi; aktif Telegram tarifesi; Dino/V16/V18 model dosyaları; V20 model/politika; mevcut deney geçmişleri. Paylaşılan takipçi yalnız V22 için `matchedFilters` ve `goalsNeeded` ek alanlarını koşullu olarak saklar. Önceki CSV şemaları bu iki alanla genişletilmez. Bağımlılıklar aynı; `package-lock.json` yalnız kök paket sürümü için yenilendi.

## Doğrulama

Toplam 18 çevrimdışı test grubu: mevcut 14 grup ve yeni 4 V22 grubu.

- `v22_tariff.test.js`: A/B/C ve kesişimler; EDGE yuvarlama/sınırlar; katı Pre/model eşikleri; eksik/geçersiz veri; skorla bitmiş market; dakika/oran aralıkları.
- `v22_lab.test.js`: taze zaman eşleşmesi, kapalı/eksik model, etiketlerin kalıcı kaydı, yeniden başlatma sonrası tek-maç kilidi, bağımsız V21 kilidi, sonuçlandırma.
- `v22_server_flow.test.js`: gerçek sunucu tarama fonksiyonları çevrimdışı API/model/Telegram ikameleriyle; V22-only/V21-only/ortak aday, değişen taze skor/oran/model reddi, Telegram izolasyonu, sonuç takibi, durum/tarih/JSON/CSV ve sıfır geçmiş aktarımı.
- `v22_panel.test.js`: gerçek panel JavaScript'i DOM test ortamında; V21/V22 ayrı sayaçları, 13 sütun, güvenli metin yazımı, etiket/pre/model bilgileri, arama, boş/kapalı durum ve tarihli dışa aktarma URL'leri. Gerçek tarayıcıda görsel ekran testi değildir.

Eski V21 akış testinin sabit tarihli verileri, gerçek takvim ilerlediğinde başlangıç süzgecine takılabiliyordu. Aynı hata değişmemiş V21.1 kopyasında da doğrulandı. Yalnız bu testin kurulumunda karşılaştırma başlangıcı sabitlendi; üretim V21 kodu veya filtreleri değiştirilmedi.

Yükleme paketi çıkarılarak dosya hash'leri ve 18 test yeniden doğrulanır; `server.js` sözdizimi kontrol edilir. `.env`, değişken geçmişler, cache, eğitim/veri analizi çıktıları ve `node_modules` pakete alınmaz. Yerel testler çalışan sunucunun API/Telegram erişimini veya gelecekteki isabeti kanıtlamaz.

Kurulum: `UBUNTU_KURULUM.md`.
