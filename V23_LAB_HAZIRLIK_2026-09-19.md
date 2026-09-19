# Maç Yakala — V23 lab hazırlık düzeltmesi · 2.5.2

Bu paket mevcut 2.5.0 / 2.5.1 kurulumu için **yalnız güncellemedir**, sıfırdan kurulum değildir. Build: `mac-yakala-v23-lab-ready-2026-09-19`.

## Korunanlar

- V21/V22 seçim kuralları, olasılık/edge/pre eşikleri ve Telegram gönderimleri değiştirilmedi.
- Lab onay veya reddi gerçek sinyali engellemez. Geçmiş isteği sinyal gönderiminde beklenmez.
- Eski sinyaller/kararlar yeniden hesaplanmaz, geçmişe sonradan başarılı veri eklenmez.
- `.env`, API anahtarları, geçmiş JSON'ları, cache'ler ve gönderim günlükleri ZIP içinde yoktur; sunucudan silmeyin.
- `mac_yakala_telegram.js` ZIP içinde yoktur. Elle yaptığınız kısa analiz düzeltmesi korunur.
- Model dosyaları ve bağımlılıklar değişmedi. `npm install` gerekmiyor.

## Ne düzeldi?

1. **Yanlış erken hazırlık sayacı:** önceki geçiş bütün eski istekleri erken hazırlık saymıştı. Yeni geçiş toplam 80/92 gibi harcamayı aynen korur, türü bilinmeyen eski harcamayı ayrıca gösterir. Yalnız yeni ölçülen erken hazırlık istekleri %25'lik alt bütçeye girer. Tekrar başlatmak yeni ölçülen sayacı sıfırlamaz.
2. **10 dakikalık taramayı bekleyen kuyruk:** ana şalter ve otomatik tarama açıkken lab, ana tarama/sonuç kontrolü çalışmıyorsa dakikada bir en fazla mevcut parti sınırı kadar geçmiş isteği yapar (varsayılan 6). Yeni canlı maç/odds/istatistik taraması başlatmaz. Günlük limit, API rezervi, tek çalışan hazırlık, hata beklemeleri ve oran sınırlayıcı korunur.
3. **Erken hazırlığın aç kalması:** ilk parti normal adaylara öncelik verir; takip eden her iki partiden biri uygun erken maçın iki takımını öne alır. Böylece sürekli yeni aday gelmesi erken hazırlığı sonsuza dek bekletmez. Günlük erken istek sınırı geçerlidir.
4. **Lig ilk kez görülüyorsa:** mevcut coverage kaydı bilinmiyor diye 5–24 dakika geçmiş hazırlığı atlanmaz. Açıkça desteksiz ligler ve ÜST oranı bulunmayan maçlar hâlâ alınmaz. Canlı sinyalin kendi coverage/taze-istatistik kapıları değişmez.
5. **Panelde iki ayrı ölçüm:** hazır takım profili ile sinyalin girişte kullandığı profil ayrılır. İki tarafı hazır izlenen maçlar, ev/deplasman hazırlık durumu, giriş anında iki geçmişi olan sinyal sayısı, gol hesabı yapılabilen kayıt sayısı, erken alt bütçe ve son hazırlık partisi görünür. Şalter/otomatik tarama kapalı veya erken alt bütçe doluysa nedeni yazılır.

## Kurulum

1. Mevcut kod dosyalarınızı yedekleyin. Proje klasörünü veya geçmiş/cache dosyalarını silmeyin.
2. ZIP'teki dosyaları mevcut `/root/dinobot` klasörüne aynı dizin yapısıyla yükleyin. `public/index.html` yerini koruyun. ZIP yalnız değiştirilmiş/yeni kod, test ve açıklama dosyalarını taşır.
3. `.env` içinde daha önce eklediğiniz satır varsa koruyun, tekrar eklemeyin:

```env
DINO_V23_HISTORY_DAILY_LIMIT=300
```

Bu değer kullanıcının bildirdiği günlük kalan ~6000 API isteği dikkate alınarak önerilmiştir; gerçek kotanız farklıysa bilinçli ayarlayın. Alan yoksa kod varsayılanı 80 kalır. `DINO_V23_HISTORY_BATCH_LIMIT` yoksa 6 kullanılır; artırmanız gerekmiyor.

4. Sunucuda doğrulayın:

```bash
cd /root/dinobot
node --check server.js
node --check v23_goal_profile.js
node --check v23_goal_lab.js
npm test
```

Hata varsa yeniden başlatmayın, hatayı paylaşın. Testler geçerse:

```bash
pm2 restart dinobot --update-env
```

5. Paneli Ctrl+F5 ile yenileyin. Ana şalter ve otomatik tarama açık olsun. Test Lab → V23 kartında yeni profil kapsamı satırı ve **“Takım geçmişi hazır mı? · izlenen maçlar”** bölümünü görün.

## Kontrolde neye bakacağız?

- Kurulumda toplam harcama örneğin 92 ise 92/300 olarak korunur. Eski sınıflandırılmamış istek 92, yeni erken hazırlık başlangıcı 0 olabilir; toplam kotaya ikinci kez eklenmez.
- Yeni canlı maç taraması uygun maçları sıraya koyduktan sonra, boş aralıklarda hazırlık partileri ilerler. Şalter/otomatik tarama kapalıysa bu arka plan çalışması durur; elle tarama kendi sonunda bir parti çalıştırabilir.
- “Hazır” takım profilidir, maç veya onay sayısı değildir. **İki tarafı hazır maç**, **sinyal girişinde iki takım geçmişi bulunan**, **gol hesabı yapılabilen** sayılarını birlikte okuyun.
- İki tarafı önceden hazır, örneklemi yeterli ve diğer lab koşulları uygun olan **yeni** sinyal geldiğinde mevcut V21/V22 lab onay/ret tablosu güncellenir. “Ret” de sağlıklı bir değerlendirme sonucudur; Telegram'ı durdurmaz.
- Hazırlık yaptığımız maç kaynak sinyal üretmeyebilir. İlk kez görüldüğü taramada hemen sinyal veren bir maçta verinin daha önce hazır olması garanti değildir. O giriş “yetersiz” kalır; sonradan değerlendirilmiş gibi değiştirilmez.
- Son 10/ilgili sahada 5 maç azlığı, eski son maç, kırmızı kart gibi gerçek yetersizlikler devam edebilir. Gol/kart/değişiklik sonrası gözlem satırlarının ilgili olay ve ölçüm penceresi olmadan artması beklenmez; bunlara yapay onay eklenmedi.

Sorun devam ederse güncel V23 JSON'unu ve yeni **“Takım geçmişi hazır mı?”** bölümünü gönderin. API anahtarı göndermeyin. Cache temizlemeyin ve limiti art arda artırmayın.

## Test kapsamı ve sınır

29 yerel test grubu çalışır. Yeni uçtan uca test gerçek sunucu/lab akışını sahte API ile kullanır: 92 harcamalı geçiş, sayaçların yeniden başlatılması, bilinmeyen coverage, dakikalık kuyruk, ana tarama/şalter/kota önceliği, iki takımın sinyalden önce hazır olması, V21/V22 onay **ve** ret tablosu, kullanılan profillerin dışa aktarımı, yavaş geçmiş isteği sürerken Telegram'ın tamamlanması ve eski kararların değişmemesi doğrulanır.

Canlı sunucuya buradan bağlanılmadı; gerçek sağlayıcı yanıtı ve yeni canlı kayıtların kapsamı kurulumdan sonra doğrulanmalıdır. Veri hazırlığının her sinyale yetişeceği veya her kontrolün onay/ret üreteceği garantisi verilmez.
