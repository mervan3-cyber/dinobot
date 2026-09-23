# Maç Yakala — V22-only Telegram + Kupon LAB v2

## Canlı sinyal

- Telegram üretim kaynağı varsayılan olarak yalnız V22'dir.
- V23 canlı kapısı V22 kararına uygulanır.
- V21 hesaplaması, kaydı ve sonuç ölçümü LAB'da devam eder; yeni V21 Telegram mesajı göndermez.
- Eski V21 Telegram kayıtları silinmez.
- Ondalıklı marketler (`0.5`, `1.5`, `2.5`, `3.5`) analiz metninde parçalanmaz.

## Kupon LAB v2

- Çifte şans için API tahmini ile marjı temizlenmiş MS1/X/MS2 piyasa olasılığı aynı tarafı desteklemelidir.
- Kesin İY/MS seçimlerinde iki takımın ilgili ev/deplasman profilinde en az 5 maç bulunmalıdır.
- `1/1`, `0/1`, `2/2`, `0/2` için ilgili gol üretme ve rakibin gol yeme zaman diliminde en az 3 olay gerekir; eksik İY/2Y verisi geçmez.
- `0/0` için API beraberlik desteği, marjsız X desteği, atılan/yenen gol ortalamaları ve eksiksiz örneklem birlikte kullanılır.
- `1/0`, `2/0`, `1/2`, `2/1` yalnız bulunan marketlerde gösterilir; seçim üretmez.
- İlk 10 sırası veri tamlığı, model-piyasa uyumu ve gol profili kalite puanıyla belirlenir.
- Maç önü kontrolde aday aynı kurallardan güncel oran ve tahminle tekrar geçirilir.

## Sonuçlar

- Panelde `SONUÇLARI GÜNCELLE` düğmesi vardır.
- Yeni ana tarama yapmaz; başlangıcının üzerinden en az 105 dakika geçen bekleyen kayıtların final durumunu toplu sorgular.
- Fixture kimlikleri API'ye yirmişerli gruplar hâlinde gönderilir; günlük Kupon LAB bütçesi ve genel API rezervi korunur.
