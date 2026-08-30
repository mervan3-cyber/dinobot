# Ubuntu Kurulumu — Dino V16.1 Doğruluk Kuralı

Bu paket mevcut bot klasörünün üzerine kurulacak güncellemedir. `.env`,
`dino_signal_history.json`, `dino_candidate_history.json` ve önbellek JSON
dosyalarınızı silmeyin. ZIP içindeki dosyaları aynı dizin yapısıyla sunucuya
kopyalayın.

## V16 için zorunlu yeni dosyalar

- `server.js`
- `dino_selector_v2.js`
- `dino_selector_v2.json`
- `signal_tracker.js`
- `candidate_tracker.js`
- `shadow_power.js`
- `prematch_odds.js`
- `public/index.html`
- `index.html`
- `tahmin_yap.py`
- `dino_live_models_all.json`
- `package.json`

`dino_selector_v2.js` veya `dino_selector_v2.json` eksik olursa V16 başlamaz.
Bu güvenli davranış yanlışlıkla eski karar sistemine dönülmesini önler.

## V16 nasıl karar verir?

1. Eski Dino, bütün market olasılıklarını üretir.
2. V16; Dino, canlı oran/piyasa, pre-match, skor, dakika ve canlı tempoyu
   ikinci kez birlikte puanlar.
3. Yalnız V16 puanı en az `%76`, dakika `60–80` ve oran en az `1.40` olan ön
   adaylar değerlendirmeye geçer.
4. `/teams/statistics`, `/standings` ve `/predictions` cevaplarında takım,
   fixture, lig/sezon kimliği ve en az 5 ev/deplasman örneklemi doğrulanır.
5. Güç bağlamının tam olmaması tek başına veto değildir; bulunan alanlar V16
   girdisi ve denetim verisi olarak kullanılır.
6. Telegram öncesinde fixture, canlı istatistik ve canlı oran yeniden çekilir;
   Python ve V16 ikinci kez çalışır. Sonra 12 saniyelik ikinci doğrulamada skor,
   canlı oran ve olay akışı kontrol edilir.
7. Her maçtan en fazla bir market gönderilir.

EDGE JSON/CSV denetiminde saklanır fakat V16 Telegram kararını etkilemez.
Pre-match desteği V16 model girdisidir; ayrıca sabit bir pre-destek barajı yoktur.
`0.5 ALT`, `0.5 ÜST` ve `1.5 ALT` eğitim sonucuna göre V16 seçimine kapalıdır.

## Oran ayarı

Varsayılan doğruluk modu:

    DINO_V2_MIN_ODD=1.40

Kullanıcı isterse `.env` içinde `1.60` yapabilir:

    DINO_V2_MIN_ODD=1.60

Ancak eldeki kör testte `1.60` doğruluğu artırmadı; tersine uygun dokuz adayın
yalnız dördü kazandı. Bu yüzden V16 doğruluk modunun varsayılanı `1.40`tır.

Güvenli geri dönüş için V16 kapatılabilir:

    DINO_V2_SELECTOR_ENABLED=false

Bu satır yalnız acil geri dönüş içindir; normal kullanımda eklenmemelidir.

Diğer önerilen ortam ayarları:

    PYTHON_BIN=python3
    PREMATCH_BOOKMAKER_NAME=Bet365
    SHADOW_MIN_QUOTA_REMAINING=1500

API, Telegram veya Gemini anahtarlarını ekran görüntüsünde ya da paylaşımda
göstermeyin.

## Başlatma

    npm install
    pm2 restart BOT_SUREC_ADI --update-env
    pm2 save

İlk kurulumda PM2 yoksa `node server.js` ile de başlatılabilir.

## Doğru sürümü kontrol etme

Başlangıç logunda şunlar görünmelidir:

    ml-v16.1-score-only-decision-ubuntu-2026-08-31
    V16 ikinci katman AKTİF: eşik %76 | dakika 60-80 | oran 1.4+ | EDGE kararı etkilemez.
    API güç bağlamı AÇIK ... | EKSİK BAĞLAM TEK BAŞINA VETO DEĞİL

Panelde `V16 Makine Ayarları` ve `V16 Güç Bağlamı` kartları görünmelidir.
Görünmüyorsa mutlaka `public/index.html` yanlış yere kopyalanmıştır.

## Korunacak veri dosyaları

- `dino_signal_history.json`: Telegram'a giden sinyaller ve sonuçları.
- `dino_candidate_history.json`: gönderilmeyenler dahil bütün market anları.
- `dino_prematch_cache.json`: fixture bazında pre-match önbelleği.
- `dino_shadow_power_cache.json`: takım/standings/prediction önbelleği.

Yeni JSON ve CSV dışa aktarımlarında `selectorV2Probability`, V16 red nedenleri,
tam güç bağlamı ve sonuç alanları eğitim için saklanır.
