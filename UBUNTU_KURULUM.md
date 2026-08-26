# Ubuntu Kurulumu — Dino v14

Bu paket mevcut bot klasörünün üzerine kurulacak güncellemedir. Mevcut .env
dosyanızı silmeyin veya paylaşmayın. node_modules klasörünü yeniden kopyalamanız
gerekmez.

## Güncellenecek dosyalar

Paketteki dosyaları proje klasörünüze aynı dizin yapısıyla kopyalayın. Bu sürümde
özellikle aşağıdaki dosyalar birlikte kullanılmalıdır:

- server.js
- signal_tracker.js
- candidate_tracker.js
- public/index.html
- index.html (paneli dosya olarak açan kurulumlar için aynı kopya)
- tahmin_yap.py
- dino_live_models_all.json
- package.json

İlk açılışta dino_signal_history.json otomatik oluşur. Bu dosya yalnızca Telegram
API'sine başarıyla gönderilmiş sinyalleri ve sonradan bulunan maç sonuçlarını
tutar. Güncellemelerde bu dosyayı silmeyin.

İlk açılışta dino_candidate_history.json da otomatik oluşur. Bu dosya tam
istatistikli maçlarda modelin gördüğü bütün market anlarını, eleme nedenlerini
ve final sonuçlarını tutar. Telegram'a gitmeyen adayları sonradan incelemek için
bu dosyayı da silmeyin.

## Ortam değişkenleri

Mevcut .env dosyanızda anahtarlarınız bulunmalıdır. Python için önerilen satır:

    PYTHON_BIN=python3

API, Telegram veya Gemini anahtarlarını sohbetlerde ve ekran görüntülerinde
paylaşmayın.

## Başlatma

Mevcut başlatma yönteminizi kullanabilirsiniz:

    npm install
    node server.js

PM2 kullanıyorsanız:

    pm2 restart BOT_SUREC_ADI --update-env

## Doğrulama

Başlangıç logunda şu sürüm görünmelidir:

    ml-candidate-audit-ubuntu-v14-2026-08-26

Ayrıca şu iki satır görünür:

    Minimum canlı oran: 1.40
    Sürpriz: Dino %60–74.9 ve 41–80. dakika | Güçlü: Dino %75+ ve 25–80. dakika.
    Paylaşılan sinyal takibi aktif: maç başına 1 sürpriz + 1 güçlü.
    Tam-stat aday denetimi aktif: Telegram'a gitmeyen marketler ve eleme nedenleri de sonuçlarıyla kaydedilir.

## Yeni sinyal düzeni

- Sürpriz sinyal: Dino olasılığı %60–74.9, dakika 41–80.
- Güçlü sinyal: Dino olasılığı %75+, dakika 25–80.
- Her iki sınıf da paneldeki minimum EDGE ayarını geçmelidir.
- Her iki sınıf için canlı oran en az 1.40 olmalıdır.
- Mevcut skor nedeniyle zaten kazanmış veya kaybetmiş toplam gol çizgileri
  stale/hatalı oran kabul edilerek engellenir.
- Her maç en fazla bir sürpriz ve bir güçlü sinyal gönderebilir.
- İki sinyal aynı dakikada, aynı markette veya farklı marketlerde olabilir.
- Bir sınıfta birden fazla market uygunsa Dino olasılığı en yüksek market seçilir;
  eşitlikte EDGE değeri yüksek olan seçilir.
- Aynı sınıf ikinci kez gönderilmez. Telegram gönderimi başarısızsa hak kullanılmaz
  ve sonraki taramada yeniden denenebilir.

## Paylaşılan sinyal takibi

Paneldeki Paylaşılan Sinyal Takibi bölümü yalnızca Telegram'da gerçekten
paylaşılan sinyalleri gösterir. Bot, sonuç bekleyen fixture'ları 10 dakikada bir
API-Football üzerinden kontrol eder. Paneldeki Sonuçları Kontrol Et düğmesi de
aynı işlemi elle başlatır.

Panelden iki analiz dosyası indirilebilir:

- JSON: bütün canlı istatistik anlık görüntüsünü, özetleri ve sonuçları içerir.
- CSV: Excel veya başka analiz araçları için düz tablodur.

Kazanma oranları sürpriz ve güçlü sinyaller için ayrı tutulur. Aynı maçta iki tür
paylaşılmışsa iki ayrı sinyal kaydı oluşur fakat fixture kimliği aynı kalır.

## Tam-stat aday denetimi

Paneldeki Tam-Stat Aday Denetimi, Telegram'a gönderilmeyen marketleri de kaydeder.
Her kayıtta Dino ihtimali, oran, EDGE, dakika, skor, canlı istatistikler ve kesin
karar nedeni bulunur. Model tahmini bulunup canlı oranı bulunmayan marketler de
`live_odds_missing` kararıyla tutulur. Sonuç bekleyen adaylar paylaşılan sinyallerle aynı toplu API
isteğinde kontrol edilir; böylece gereksiz ayrı sonuç istekleri oluşturulmaz.

Panelden aday geçmişi JSON veya CSV olarak indirilebilir. Aynı fixture ve market
farklı tarama dakikalarında ayrı kayıt olarak tutulur. Bu sayede EDGE, oran, dakika,
sınıf ve tekrar kilidi nedeniyle kaçırılan seçimler sonradan karşılaştırılabilir.

API istek kuyruğu timeout sonrası otomatik toparlanır. Timeout ve geçici 5xx/429
hatalarında endpoint adı loga yazılır ve en fazla üç kontrollü deneme yapılır.

## Canlı veri güvenliği

Model yalnızca iki takımın şut, isabetli şut ve korner alanlarının tamamı gerçek
API verisi olarak mevcutsa çalışır. Eksik değerler sıfıra çevrilmez ve eksik
istatistikli maç Python'a veya Telegram'a gönderilmez.

Maç durumu modelden önce ve Telegram'dan hemen önce yeniden doğrulanır. Bitmiş,
durdurulmuş, engellenmiş, askıya alınmış veya 80. dakikayı geçmiş maç gönderilmez.
Skor model çalıştıktan sonra değişmişse eski sinyal iptal edilir.
