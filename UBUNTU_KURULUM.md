# Ubuntu Kurulumu — Dino V18 Gölge Karşılaştırması

Bu paket mevcut bot klasörünün üzerine kurulacak tam güncellemedir. Üretimdeki
V17 karar sistemi ve Telegram akışı aynen kalır. V18 aynı tam-stat maçları kendi
modeliyle ayrıca değerlendirir, ayrı dosyaya kaydeder ve **hiçbir mesaj
göndermez**.

## Kurulumdan önce

Sunucudaki `.env` ile aşağıdaki geçmiş/önbellek dosyalarını silmeyin veya ZIP
içindeki boş örneklerle değiştirmeyin:

- `dino_signal_history.json`
- `dino_candidate_history.json`
- `dino_data.json`
- `dino_prematch_cache.json`
- `dino_shadow_power_cache.json`

V18 ilk çalışmada `dino_v18_shadow_history.json` dosyasını otomatik oluşturur.
Daha sonraki güncellemelerde bu dosyayı da koruyun.
İndirme paketi bu kalıcı JSON dosyalarını özellikle içermez; mevcut sunucu
kayıtlarının üzerine boş veri yazılmaz.

## V18 gölge sistemi

V18; mevcut taramada zaten alınmış canlı istatistik, skor, oran, pre-match ve
takım bağlamını kullanır. Ayrı bir canlı maç taraması başlatmaz. Sonuç kontrolü
de mevcut toplu sonuç sorgusuna katılır.

Sabit kör-test tarifesi şöyledir:

| Market | Dakika | Minimum V18 | V18 EDGE | Oran |
|---|---:|---:|---:|---:|
| 0.5 ÜST | 25–64 | %45 | +2.5…+15 | 1.50–4.00 |
| 2.5 ÜST | 45–64 | %60 | +5…+15 | 1.50–4.00 |
| MS2 | 25–44 | %65 | +5…+15 | 1.50–4.00 |
| X | 75–80 | %65 | +5…+15 | 1.50–4.00 |

- Bütün ALT marketleri kapalıdır.
- Maç başına en fazla bir V18 gölge kaydı vardır.
- İkinci sinyal yeterli örnek oluşmadığı için kapalıdır.
- Aynı anda birden çok kural geçerse öncelik: `MS2`, `2.5_UST`, `0.5_UST`, `X`.
- `V18 EDGE`, V18 olasılığı eksi canlı oranın normalize edilmiş piyasa
  olasılığıdır. Eski Dino/V16 EDGE ile aynı ölçü değildir.

Bu kurallar yalnızca karşılaştırma içindir. V17 tarifesi, Telegram seçimi,
gönderim kilitleri ve mevcut panel ayarları değiştirilmez.

## Zorunlu yeni/değişen dosyalar

Bu sürümde yalnız `index.html` değil, sunucu ve model tarafı da değişmiştir.
Paketi komple yükleyin. Özellikle şu dosyalar zorunludur:

- `server.js`
- `signal_tracker.js`
- `dino_selector_v18.js`
- `dino_selector_v18.json`
- `dino_selector_v18.test.js`
- `v18_shadow_tracker.test.js`
- `market_tariff_v18.json`
- `public/index.html`
- `index.html`
- `package.json`
- `package-lock.json`

Paketteki diğer çalışma dosyalarını da aynı dizin yapısıyla kopyalayın.

## Ortam ayarı

V18 gölge modu varsayılan olarak açıktır. Normal kullanımda `.env` dosyasına
yeni satır eklemek gerekmez. Gerekirse yalnız gölge kaydını kapatmak için:

    DINO_V18_SHADOW_ENABLED=false

Bu ayar V17 veya Telegram'ı kapatmaz. Yeniden açmak için satırı silin ya da
değeri `true` yapın.

## Başlatma

    npm install
    pm2 restart dinobot --update-env
    pm2 save

Süreç adınız `dinobot` değilse kendi PM2 süreç adınızı kullanın.

Başlangıç logunda aşağıdakiler görünmelidir:

    ml-v18-shadow-comparison-ubuntu-2026-09-05
    V18 GÖLGE MODU AÇIK
    karar etkisi YOK
    Telegram YOK

Panelde üst menüde `V18 Gölge` bölümü görünür. Bu bölümde V17 ile V18 aynı
gölge dönemi ve seçilen Türkiye tarihi için yan yana gösterilir. V18 JSON ve CSV
dosyaları buradan indirilebilir.

## Sonuçların yorumu

Gölge sistemi canlı Telegram kararını değiştirmediği için güvenli A/B
karşılaştırmasıdır. Birkaç sinyal sonucuyla tarife değiştirmeyin; sinyal sayısı,
isabet, ortalama oran ve ROI birlikte değerlendirilmelidir. Geçiş kararı ayrıca
yeni günlerde görülmemiş maçlarla doğrulandıktan sonra verilmelidir.
