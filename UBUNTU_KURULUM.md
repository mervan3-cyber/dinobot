# Ubuntu Kurulumu

Bu paket mevcut bot klasörünün üzerine kurulacak güncellemedir. Mevcut `public`,
`package.json`, `.env` ve diğer proje dosyalarını silmeyin.

## Değiştirilecek dosyalar

- `server.js`
- `tahmin_yap.py`
- `dino_live_models_all.json`

Bu üç dosya aynı klasörde bulunmalıdır.

## Ortam değişkenleri

Mevcut `.env` dosyanızda anahtarlarınız bulunmalıdır. Python için aşağıdaki satır
önerilir:

```env
PYTHON_BIN=python3
```

API veya Telegram anahtarlarını sohbetlerde ve ekran görüntülerinde paylaşmayın.

## Başlatma

Mevcut başlatma yönteminizi kullanabilirsiniz. Doğrudan çalıştırıyorsanız:

```bash
node server.js
```

PM2 kullanıyorsanız mevcut süreç adını koruyarak ortamı yenileyin:

```bash
pm2 restart BOT_SUREC_ADI --update-env
```

## Doğrulama

Başlangıç logunda şu sürüm görünmelidir:

```text
ml-coverage-filter-ubuntu-v9-2026-08-23
```

Yeni tarama logunda iki canlı kaynak birleştirilir:

```text
/fixtures kaynağında 25-80 dakika aralığında X maç bulundu.
Birleştirilmiş 25-80 dakika aday havuzu: Y maç.
```

Maç durumu; aday havuzunda, güncel fixture detayında, model öncesinde ve Telegram
öncesinde yeniden doğrulanır. `FT`, `AET`, `PEN`, `finished`, `stopped`, `blocked`,
`suspended` veya 80. dakikayı geçmiş maçlar gönderilmez. Sinyal hazırlanırken skor
değişmişse eski model sonucu iptal edilir ve sonraki tarama beklenir.

İstatistik bulunmayan maçlarda kullanılan `score_only` modeli ayrıca sabit bir
doğruluk kapısından geçer: en az 60. dakika, MS1/X/MS2 için en az %85, toplam gol
marketleri için en az %80 model olasılığı, en az %10 EDGE ve en fazla 2.50 oran.
Bu koruma yalnızca fallback modeline uygulanır ve paneldeki genel EDGE ayarı
düşürülse bile gevşemez. Canlı istatistikli modelin mevcut çalışma biçimi değişmez.

## Dayanıklı canlı istatistik hattı

Lig/sezon kapsamı altı saatte bir `/leagues?current=true` üzerinden yenilenir.
`coverage.fixtures.statistics_fixtures=false` olan ligler oran ve Python aşamasından
önce çıkarılır. Destekli, desteksiz ve bilinmeyen ligler tarama logunda isimleriyle
görünür. Son taramanın ayrıntılı sonucu `/statistics-coverage` adresinde görsel
tablo, `/api/statistics-coverage` adresinde JSON olarak izlenebilir. Coverage bilgisi bilinmeyen bir lig güvenli biçimde gerçek
`/fixtures/statistics` cevabıyla sınanır; gerçek temel alanları eksikse Python'a girmez.

`/fixtures/statistics` cevabı artık tümden veya hiç şeklinde işlenmez. API yalnızca
bir takım ya da kısmi alan döndürürse gelen gerçek değerler korunur; eksikler `null`
ve Telegram'da `Veri yok` kalır. `Total Shots`, `Shots on Goal/Target` ve
`Corner Kicks/Corners` adları normalize edilerek eşleştirilir. Topa sahip olma,
sarı/kırmızı kart, faul, ofsayt, kaleci kurtarışı ve xG alanları da mevcutsa Gemini
yorumuna ve Telegram mesajına eklenir.

Model yalnızca altı temel şut/isabet/korner alanı eksiksizse canlı istatistik
varyantını kullanır. Kısmi veri modele sıfır olarak verilmez. Her fixture için logda
API takım sayısı ve `model alanı=X/6` teşhisi görünür. Tam istatistikli maçlar önce
değerlendirilir; sıkı fallback sinyali tarama başına en fazla bir tanedir.

Şut/isabet/korner sağlanmayan maçlar artık elenmez. Logda şu satır görünür:

```text
temel istatistik eksik; dakika + skor fallback modeli kullanılacak.
```

Telegram mesajları HTML olarak ve dinamik metinler escape edilerek gönderilir;
Gemini yorumundaki özel karakterler mesajın reddedilmesine neden olmaz.

Model tahmin betiği yalnızca Python standart kütüphanesini kullanır; scikit-learn,
pandas veya joblib kurulumu gerektirmez.
