# V19 Hibrit Canlı Sistem

## Telegram'a açık kurallar

- `MS1`: V16, 25–54. dakika, V16 en az %55, V16 EDGE -2.5…+2, oran 1.50–2.00.
- `2.5 ÜST`: V16, 25–34. dakika, V16 en az %50, kayıt EDGE -2.5…+2, oran 1.50–2.00.
- `X`: V16, 61–70. dakika, V16 en az %50, kayıt EDGE 0…+2, oran 1.60–2.00.
- `MS2`: V18, 25–34. dakika, V18 %65–74.9, V18 EDGE +5…+13, oran 1.60–2.00.
- `4.5 ÜST`: V18, 60–74. dakika, V18 %50–74.9, V18 EDGE 0…+10, oran 1.60–2.00.
- İkinci sinyal `MS2`: İlk sinyalden daha ileri dakikada, 45–54. dakika, V16 en az %50, V16 EDGE +2…+4, oran 1.60–2.00.

Maç başına en fazla bir ilk ve yalnız daha ileri dakikada, farklı markette bir takip sinyali gönderilir. Bütün ALT marketleri kapalıdır. Telegram öncesindeki taze fixture, skor, istatistik, oran ve Python yeniden kontrolü korunmuştur.

## Telegram dışı dar gözlem

`0.5 ÜST`, `1.5 ÜST` ve `3.5 ÜST` aktif portföyden çıkarılmış, fakat tamamen silinmemiştir. Her maçta en fazla bir gözlem kaydı `dino_hybrid_observation_history.json` dosyasına yazılır. Bu kayıtlar Telegram kararını ve gönderim kilidini etkilemez; panelde ayrı tabloda görünür ve JSON/CSV olarak indirilebilir.

## Panel ve kayıtlar

- Paylaşılan sinyal tablosu karar motorunu `V16` veya `V18` olarak gösterir.
- Tam-stat aday tablosu V16 ve V18 puanlarını yan yana gösterir.
- Hibrit gözlem için ayrı özet, tablo ve indirme düğmeleri vardır.
- JSON/CSV kayıtlarına karar modeli, karar yüzdesi, karar EDGE'i ve V18 alanları eklendi.

## Kurulum

Paket dosyalarını uygulama klasörüne kopyaladıktan sonra bağımlılıkları kurup testleri çalıştırın. Sonra PM2 sürecini yeniden başlatıp kaydedin:

```bash
npm install
npm test
pm2 restart dinobot
pm2 save
```

Eski `dino_signal_history.json`, `dino_candidate_history.json`, V18 gölge geçmişleri ve `.env` dosyası pakette bulunmaz; sunucudaki geçmiş dosyaları silinmemeli veya boş dosyayla değiştirilmemelidir.
