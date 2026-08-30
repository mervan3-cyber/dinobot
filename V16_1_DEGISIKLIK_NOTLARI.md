# Dino V16.1 değişiklikleri

- Telegram karar eşiği: V16 en az `%76`.
- Telegram dakika aralığı: `60–80`.
- Minimum canlı oran: `1.40`.
- EDGE yalnız kaydedilir; sinyali elemez.
- Pre-match ve API güç bağlamı V16 girdisi/denetim verisidir; eksiklik veya
  düşük destek tek başına veto değildir.
- `0.5 ÜST`, `0.5 ALT` ve `1.5 ALT` kapalı kalır.
- Her fixture için en fazla bir V16 güçlü sinyali gönderilir.
- Telegram öncesi taze fixture, istatistik ve oranla Python/V16 yeniden çalışır.
- Ardından 12 saniye beklenerek skor, seçilen oran ve `/fixtures/events` olay
  akışı yeniden kontrol edilir.
- Son gole iki dakika veya daha az kaldıysa sinyal gönderilmez.
- Seçilen oran ikinci kontrolde kapanır, `1.40` altına iner veya `0.03`ten fazla
  değişirse eski V16 kararı gönderilmez.

Erken dakikalar ve gönderilmeyen bütün tam-stat market anları aday JSON/CSV
kayıtlarında tutulmaya devam eder. Böylece erken ÜST fırsatları sonraki model
eğitimi ve gölge testlerinde kaybolmaz.
