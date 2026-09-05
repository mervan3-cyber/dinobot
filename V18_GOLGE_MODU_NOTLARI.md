# V18 Gölge Modu — Değişiklik Notları

## Amaç

Mevcut V17 üretim sistemini değiştirmeden, yeniden eğitilmiş V18 modelini canlı
akışta aynı maçlar üzerinde ölçmek ve iki sistemi panelde yan yana
karşılaştırmak.

## Değişmeyenler

- Telegram mesajlarını yalnız mevcut V17 gönderir.
- V17 market/dakika/EDGE tarifesi aynıdır.
- V17 ilk ve takip sinyali kilitleri aynıdır.
- Mevcut sinyal ve tam-stat geçmişleri korunur.

## Eklenenler

- `dino_selector_v18.js`: dondurulmuş V18 modelini sunucuda çalıştırır.
- `dino_selector_v18.json`: eğitimli katsayılar, ölçekleme ve özellik şeması.
- `market_tariff_v18.json`: kör testten önce dondurulmuş gölge tarifesi.
- `dino_v18_shadow_history.json`: ilk çalışmada oluşan bağımsız V18 geçmişi.
- Panelde `V18 Gölge` karşılaştırma bölümü ve Türkiye tarihi filtresi.
- Ayrı V18 JSON/CSV dışa aktarma uçları.
- V18 kayıtlarının mevcut sonuç yenilemesinde otomatik kapatılması.

## EDGE açıklaması

Eski analizlerde görülen eksi EDGE, eski Dino/V16 olasılığının ham piyasa
yüzdesiyle ilişkisiydi. V18 tarifesindeki artı EDGE ise yeni model olasılığının
normalize edilmiş canlı piyasa olasılığından farkıdır. Bu yüzden işaretleri
doğrudan karşılaştırılamaz.

Artı aralık eğitim bölümünde keşfedildi, sonraki günlerde doğrulandı ve 4 Eylül
kör gününde değiştirilmeden sınandı. Yine de canlıya alınmadı; gerçek zamanlı
gölge testi bu ilişkinin devam edip etmediğini gösterecek.

## Koruma kuralları

- Karara etkisi yoktur.
- Telegram göndermez.
- ALT marketi değerlendirmez.
- Maç başına en fazla bir kayıt üretir.
- İkinci sinyal kapalıdır.
- Model veya tarife dosyası geçersizse sunucu başlangıçta açık hata verir;
  sessizce başka modele dönmez.
