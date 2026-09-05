# V18-A / V18-B Gölge Modu — Değişiklik Notları

## Amaç

Mevcut V17 üretim sistemini değiştirmeden aynı V18 modelini iki ayrı market
tarifesiyle canlı akışta ölçmek; mevcut V17, V18-A ve V18-B sonuçlarını aynı
başlangıç saati ve Türkiye tarihi üzerinden karşılaştırmak.

## Değişmeyenler

- Telegram mesajlarını yalnız mevcut V17 gönderir.
- V17 market/dakika/EDGE tarifesi aynıdır.
- V17 ilk ve takip sinyali kilitleri aynıdır.
- Mevcut sinyal ve tam-stat geçmişleri korunur.

## Eklenenler

- `dino_selector_v18.js`: dondurulmuş V18 modelini sunucuda çalıştırır.
- `dino_selector_v18.json`: eğitimli katsayılar, ölçekleme ve özellik şeması.
- `market_tariff_v18.json`: V18-A dar gölge tarifesi.
- `market_tariff_v18_b.json`: V18-B geniş gölge tarifesi.
- `dino_v18_shadow_history.json`: V18-A'nın bağımsız geçmişi; eski A kayıtları korunur.
- `dino_v18_b_shadow_history.json`: V18-B'nin bağımsız geçmişi.
- Panelde aynı tarih için V17, V18-A ve V18-B özetleri ile ayrı A/B tabloları.
- Her kol için ayrı JSON/CSV dışa aktarma.
- A ve B kayıtlarının mevcut sonuç yenilemesinde otomatik sonuçlandırılması.

## Kollar

- **V18-A:** 0.5 ÜST, 2.5 ÜST, MS2 ve X içeren mevcut dar tarife.
- **V18-B:** A'nın çekirdeğine 60–74. dakika 4.5 ÜST kuralını ekler; MS2'yi
  25–54. dakikaya genişletirken EDGE aralığını +10…+15 ile sıkılaştırır.
- İki kol da aynı V18 olasılığını kullanır. Ölçülen fark yalnız tarife farkıdır.
- Her kol kendi maç başına tek-sinyal kilidine sahiptir; A'nın kaydı B'yi
  engellemez.

## EDGE açıklaması

Eski analizlerde görülen eksi EDGE, eski Dino/V16 olasılığının ham piyasa
yüzdesiyle ilişkisiydi. V18 tarifesindeki artı EDGE ise yeni model olasılığının
normalize edilmiş canlı piyasa olasılığından farkıdır. Bu yüzden işaretleri
doğrudan karşılaştırılamaz.

V18-B'nin geçmişte görülen 81/8 sonucu optimize edilmiş tarihsel sonuçtur ve
gelecek performans garantisi değildir. Bu nedenle B Telegram'a bağlanmamış,
ayrı canlı gölge kolu olarak bırakılmıştır.

## Koruma kuralları

- Karara etkisi yoktur.
- Telegram göndermez.
- ALT marketi değerlendirmez.
- Her kol maç başına en fazla bir kayıt üretir.
- İkinci sinyal kapalıdır.
- Model veya tarife dosyası geçersizse sunucu başlangıçta açık hata verir;
  sessizce başka modele dönmez.
