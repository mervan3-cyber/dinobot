# Ubuntu Kurulumu — Dino V17 Hafta Sonu Kör Testi

Bu paket mevcut bot klasörünün üzerine kurulacak güncellemedir. `.env`,
`dino_signal_history.json`, `dino_candidate_history.json` ve önbellek JSON
dosyalarınızı silmeyin. ZIP içindeki dosyaları aynı dizin yapısıyla kopyalayın.

## Yeni karar sistemi

V17, tek bir genel V16/EDGE sınırı kullanmaz. Her marketi kendi dondurulmuş
dakika, V16 ve EDGE aralığında değerlendirir. Minimum canlı oran `1.50`dir.
Bütün `*_ALT` marketleri kapalıdır.

İlk sinyal haritası:

| Market | Dakika | Minimum V16 | EDGE |
|---|---:|---:|---|
| 0.5 ÜST | 45–74 | %50 | Dino EDGE -10…-5 |
| 1.5 ÜST | 40–44 | %50 | V16 EDGE en fazla +4 |
| 2.5 ÜST | 25–34 | %50 | Dino EDGE -2.5…+2 |
| 3.5 ÜST | 25–80 | %60 | V16 EDGE -10…0 |
| MS1 | 25–54 | %55 | V16 EDGE -2.5…+2 |
| X | 61–70 | %50 | Dino EDGE 0…+2 |

Takip sinyali haritası:

| Market | Dakika | Minimum V16 | EDGE |
|---|---:|---:|---|
| 4.5 ÜST | 25–54 | %55 | Dino EDGE -10…-5 |
| MS1 | 25–54 | %55 | V16 EDGE -2.5…+2 |
| MS2 | 45–54 | %50 | V16 EDGE +2…+4 |

Takip sinyali yalnız aynı maçta ilk sinyal başarıyla gönderilmişse, maç
dakikası daha ilerideyse ve market ilk sinyalden farklıysa gönderilir. Maç
başına en fazla bir ilk ve bir takip sinyali vardır. Aynı market tekrarlanmaz.

`Dino EDGE`, Dino yüzdesi eksi oranın ham piyasa yüzdesidir. `V16 EDGE`, V16
yüzdesi eksi oranın ham piyasa yüzdesidir. Paneldeki genel EDGE ayarı bu V17
haritasını değiştirmez.

Takım gücü, standings, API prediction, pre-match ve canlı tempo V16 puanına
girdi olmaya devam eder. Telegram öncesinde fixture, istatistik, oran ve olay
akışı yeniden doğrulanır.

## Dosyalar

Yeni `market_tariff.js` dosyası zorunludur. `server.js`, `signal_tracker.js`,
`market_tariff.js`, `dino_selector_v2.js`, `dino_selector_v2.json`,
`candidate_tracker.js`, `shadow_power.js`, `prematch_odds.js`,
`tahmin_yap.py`, `dino_live_models_all.json`, `public/index.html`, `index.html`,
`package.json` ve `package-lock.json` birlikte yüklenmelidir.

## Ortam ayarları

V17 varsayılan olarak açıktır. Acil geri dönüş için:

    DINO_V17_TARIFF_ENABLED=false

Normal kullanımda bu satırı eklemeyin. `DINO_V2_SELECTOR_ENABLED=true`
kalmalıdır. V17 minimum oranı dondurulmuş `1.50`dir; eski `DINO_V2_MIN_ODD`
değeri V17 açıkken Telegram sınırını değiştirmez.

Diğer önerilen ayarlar:

    PYTHON_BIN=python3
    PREMATCH_BOOKMAKER_NAME=Bet365
    SHADOW_MIN_QUOTA_REMAINING=1500

API, Telegram veya yapay zekâ anahtarlarını ekran görüntüsünde ya da
paylaşımda göstermeyin.

## Başlatma

    npm install
    pm2 restart BOT_SUREC_ADI --update-env
    pm2 save

Başlangıç logunda şunlar görünmelidir:

    ml-v17.2-weekend-market-map-ubuntu-2026-09-04
    V17 DONDURULMUŞ TARİFE AKTİF
    Minimum canlı oran: 1.50

Panelde `V17 Dondurulmuş Tarife`, `İlk sinyal başarı` ve `Takip başarı`
ifadeleri görünmelidir. Görünmüyorsa `public/index.html` yanlış yere
kopyalanmıştır.

## Korunacak veri dosyaları

- `dino_signal_history.json`: Telegram'a giden sinyaller ve sonuçları.
- `dino_candidate_history.json`: gönderilmeyenler dahil bütün market anları.
- `dino_prematch_cache.json`: pre-match önbelleği.
- `dino_shadow_power_cache.json`: takım/standings/prediction önbelleği.
Yeni JSON/CSV kayıtlarında `tariffVersion`, `tariffSlot`, `tariffRuleId`, V16
puanı, Dino EDGE, V16 EDGE ve sonuç alanları yer alır. Böylece yarınki kör test
tarife değiştirilmeden denetlenebilir.
