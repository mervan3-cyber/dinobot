# DINO v15.2 — API Güç Gölge Testi

- `/teams/statistics`, `/standings` ve `/predictions` verileri yalnızca test amacıyla toplanır.
- Gölge veriler Python ihtimalini, EDGE hesabını, filtreleri, Gemini açıklamasını ve Telegram kararını değiştirmez.
- Gölge çağrıları Telegram işlemleri bittikten sonra yapılır.
- Takım istatistikleri 12 saat, puan durumu 1 saat ve API tahmini fixture bazında 36 saat önbelleklenir.
- Kalan API kotası 1500 veya altına düşerse gölge toplama otomatik atlanır.
- Aday ve sinyal JSON/CSV dışa aktarımlarına gölge güç alanları eklenmiştir.
- Panelde `API Güç Gölge Testi` bölümü yalnızca veri kapsamını gösterir.

## Sunucuya geçiş

Eski kalıcı geçmiş dosyalarını koruyun:

- `dino_data.json`
- `dino_signal_history.json`
- `dino_candidate_history.json`
- `dino_prematch_cache.json`

Yeni `dino_shadow_power_cache.json` dosyası ilk çalıştırmada otomatik oluşur.
