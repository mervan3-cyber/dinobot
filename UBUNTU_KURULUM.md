# Ubuntu Kurulumu — Dino V18-A / V18-B Gölge Karşılaştırması

Bu paket mevcut bot klasörünün üzerine kurulacak tam güncellemedir. Üretimdeki
V17 karar sistemi ve Telegram akışı aynen kalır. V18-A ile V18-B aynı tam-stat
maçları aynı modelle, farklı tarifeler ve farklı geçmiş dosyaları üzerinden
değerlendirir; **hiçbir Telegram mesajı göndermez**.

## Kurulumdan önce

Sunucudaki `.env` ile aşağıdaki geçmiş/önbellek dosyalarını silmeyin veya ZIP
içindeki boş örneklerle değiştirmeyin:

- `dino_signal_history.json`
- `dino_candidate_history.json`
- `dino_data.json`
- `dino_prematch_cache.json`
- `dino_shadow_power_cache.json`

V18-A ilk çalışmada `dino_v18_shadow_history.json`, V18-B ise
`dino_v18_b_shadow_history.json` dosyasını otomatik oluşturur. Daha sonraki
güncellemelerde iki dosyayı da koruyun.
İndirme paketi bu kalıcı JSON dosyalarını özellikle içermez; mevcut sunucu
kayıtlarının üzerine boş veri yazılmaz.

## V18-A / V18-B gölge sistemi

İki V18 kolu; mevcut taramada zaten alınmış canlı istatistik, skor, oran, pre-match ve
takım bağlamını kullanır. Ayrı bir canlı maç taraması başlatmaz. Sonuç kontrolü
de mevcut toplu sonuç sorgusuna katılır.

V18-A dar tarife şöyledir:

| Market | Dakika | Minimum V18 | V18 EDGE | Oran |
|---|---:|---:|---:|---:|
| 0.5 ÜST | 25–64 | %45 | +2.5…+15 | 1.50–4.00 |
| 2.5 ÜST | 45–64 | %60 | +5…+15 | 1.50–4.00 |
| MS2 | 25–44 | %65 | +5…+15 | 1.50–4.00 |
| X | 75–80 | %65 | +5…+15 | 1.50–4.00 |

V18-B, A'nın 0.5/2.5 ÜST ve X kurallarını aynen tutar; şu iki farkı uygular:

| Market | Dakika | Minimum V18 | V18 EDGE | Oran |
|---|---:|---:|---:|---:|
| MS2 | 25–54 | %65 | +10…+15 | 1.50–4.00 |
| 4.5 ÜST | 60–74 | %50 | 0…+10 | 1.50–4.00 |

- Bütün ALT marketleri kapalıdır.
- Her kolda maç başına en fazla bir V18 gölge kaydı vardır.
- İkinci sinyal yeterli örnek oluşmadığı için kapalıdır.
- A'nın aynı-an önceliği: `MS2`, `2.5_UST`, `0.5_UST`, `X`.
- B'nin aynı-an önceliği geçmişte dondurulan güven sırasıdır: `MS2`,
  `0.5_UST`, `2.5_UST`, `4.5_UST`, `X`.
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
- `market_tariff_v18_b.json`
- `public/index.html`
- `index.html`
- `package.json`
- `package-lock.json`

Paketteki diğer çalışma dosyalarını da aynı dizin yapısıyla kopyalayın.

## Ortam ayarı

İki V18 gölge kolu varsayılan olarak açıktır. A'yı kapatmak için `.env` dosyasına
yeni satır eklemek gerekmez. Gerekirse yalnız gölge kaydını kapatmak için:

    DINO_V18_SHADOW_ENABLED=false

B'yi ayrı kapatmak için:

    DINO_V18_B_SHADOW_ENABLED=false

Bu ayar V17 veya Telegram'ı kapatmaz. Yeniden açmak için satırı silin ya da
değeri `true` yapın.

## Başlatma

    npm install
    pm2 restart dinobot --update-env
    pm2 save

Süreç adınız `dinobot` değilse kendi PM2 süreç adınızı kullanın.

Başlangıç logunda aşağıdakiler görünmelidir:

    ml-v18-ab-shadow-comparison-ubuntu-2026-09-05
    V18-A/B GÖLGE
    karar etkisi YOK
    Telegram YOK

Panelde üst menüde `V18 Gölge` bölümü görünür. Bu bölümde V17, V18-A ve V18-B
B'nin devreye girdiği ortak test başlangıcı ve seçilen Türkiye tarihi için yan
yana gösterilir. A ve B JSON/CSV dosyaları ayrı indirilebilir.

## Sonuçların yorumu

Gölge sistemi canlı Telegram kararını değiştirmediği için güvenli A/B
karşılaştırmasıdır. Birkaç sinyal sonucuyla tarife değiştirmeyin; sinyal sayısı,
isabet, ortalama oran ve ROI birlikte değerlendirilmelidir. Geçiş kararı ayrıca
yeni günlerde görülmemiş maçlarla doğrulandıktan sonra verilmelidir.
