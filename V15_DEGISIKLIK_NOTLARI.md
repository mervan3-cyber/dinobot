# Dino v15 — Precision Prematch

## Telegram kuralları

- Minimum canlı oran sabit 1.40.
- Minimum EDGE panelden yönetilir; önerilen değer %3.
- Dino %60–69.9 yalnız **gölge sinyal** olarak aday geçmişine kaydedilir.
- Sürpriz sinyal %70–74.9 ve 41–80. dakika aralığındadır.
- Güçlü sinyal %75+ ve 25–80. dakika aralığındadır.
- Telegram için altı temel canlı istatistiğin yanında pre-match 1X2 de zorunludur.
- Toplam gol sinyali için aynı çizgide pre-match destek en az %45 olmalıdır.

## Pre-match veri akışı

- API-Football `/odds?fixture=ID` kullanılır.
- Bet365 cevabı gerçekten varsa tercih edilir; yoksa kaynak adı uydurulmaz ve
  API-Football bookmaker konsensüsü kullanılır.
- Bookmaker marjı temizlenerek adil 1/X/2 ve ÜST/ALT olasılıkları hesaplanır.
- Fixture bazlı sonuçlar `dino_prematch_cache.json` içinde saklanır.
- Başarılı veri sekiz gün, veri bulunamayan fixture bir saat önbellekte kalır.
- Aynı maçın sonraki 10 dakikalık taramaları pre-match için yeniden API tüketmez.

## Model ve denetim

- Pre-match 1X2 alanları Python'a gönderilerek mevcut `live_plus_prematch`
  modeli etkinleştirilir.
- Aynı canlı an ayrıca `live_only` modeliyle gölge olarak hesaplanır.
- Aday JSON/CSV kayıtlarında iki olasılık, fark, pre-match kaynak ve seçilen
  marketin pre-match desteği bulunur.
- Panelde gölge sinyal, pre-match engeli ve karma model sayaçları görünür.

## Güvenlik

- İstatistik eksikliği, bitmiş/durmuş maç kontrolü, skor yeniden doğrulaması,
  market ayrıştırma, minimum oran, EDGE, tekrar kilidi, sonuç takibi ve API
  timeout toparlama kuralları v14'ten korunmuştur.
- Bu filtreler doğruluğu artırmayı hedefler; belirli bir kazanma oranını garanti etmez.
