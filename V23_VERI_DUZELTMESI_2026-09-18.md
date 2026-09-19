# Maç Yakala — V23 veri toplama düzeltmesi (2.5.1)

Bu bir **güncelleme paketi**, sıfırdan kurulum paketi değil. 16 Eylül tarihli 2.5.0 paylaşım ayarları paketinin üstüne uygulanır.

## Değişmeyenler

- V21 ve V22'nin model/eşik/seçim kuralları, Telegram gönderimi ve bağımsız kaynak kilitleri değişmedi.
- V23 yalnız lab kontrolü yapar. `ret` sonucu Telegram sinyalini engellemez.
- Eski V23 kararları ve sinyal geçmişi yeniden hesaplanmaz, silinmez veya doldurulmaz.
- `mac_yakala_telegram.js` bu ZIP'te yoktur. GitHub'da elle yaptığınız kısa analiz düzeltmesi korunur.
- `.env`, anahtarlar, gönderim günlükleri, API önbellekleri ve geçmiş JSON'ları pakete dahil değildir.
- Yeni bağımlılık yoktur. Paket sürümü 2.5.1, build `mac-yakala-v23-datafix-2026-09-18`.

## Düzeltilenler

1. Geçmiş maç sorgusunda `from` ve `to` birlikte gönderilir; aynı lig/sezon, maçtan önceki dönem ve 365 gün sınırı korunur.
2. Geçmiş ön hazırlığı tüm canlı maçları körlemesine taramaz. Erken maçlarda yalnız mevcut veride istatistik kapsamı destekli ve ÜST oranı olanlar düşük öncelikle sıraya alınır. İlave coverage isteği yapılmaz.
3. İstatistiği tam canlı adaylar ve ilk model adayları öne alınır. Erken hazırlık günlük lab bütçesinin en fazla dörtte birini kullanır.
4. Eskimiş kuyruk kota doluyken de temizlenir; dolu kuyrukta yüksek öncelikli aday düşük öncelikli hazırlığın yerine alınabilir.
5. Önceki sezon isteği başarısız olsa bile mevcut sezonun başarılı geçmişi korunur. Yalnız ilgili sahanın örneklemi tamamlanmaya çalışılır.
6. Tur sınırına denk gelen önceki sezon işi sonraki tura kalır; tamamlanmış veri gibi 12 saat bekletilmez.
7. Güvenli hata kodu/açıklaması saklanır; parametre/erişim/hız sınırı hatasında aralıksız istek tüketilmez. Anahtarlar ve HTTP başlıkları kaydedilmez.
8. Panelde hazır/kısmi/hatalı/süresi dolmuş profil, kuyruk, kota nedeniyle bekleme ve son hata nedenleri ayrı görünür.

## Kurulum

1. Güncel kod dosyalarınızı yedekleyin. Sunucudaki `.env`, geçmiş ve cache dosyalarını silmeyin.
2. Bu ZIP'teki dosyaları mevcut proje köküne (`/root/dinobot`) aynı dizin yapısıyla yükleyin. `public/index.html` konumunu koruyun. İsterseniz yalnız bu dosyaları GitHub üzerinden güncelleyip mevcut git güncelleme yönteminizi kullanın.
3. Güncelleme sonrası sunucuda sırayla:

```bash
cd /root/dinobot
node --check server.js
node --check v23_goal_profile.js
node --check v23_goal_lab.js
npm test
```

Herhangi bir komut hata verirse **yeniden başlatmayın**, hatayı paylaşın. Testler geçerse:

```bash
pm2 restart dinobot
```

Yalnız `.env` seçeneklerini ayrıca değiştirdiyseniz mevcut PM2 ortamınızın güncellenmesi gerekebilir; bu yama için `.env` değişikliği zorunlu değildir.

## Beklenen davranış ve kota notu

- Günlük ek geçmiş bütçesi varsayılan **80**, tur başına istek sınırı **6**. Ana API'nin mevcut kota rezervi korunur. İsteğe bağlı alanlar `.env.v23.history.example` dosyasında.
- Bugün 80/80 zaten tüketildiyse kurulum bunu sıfırlamaz. Panel “Lab günlük bütçesi doldu” der. Türkiye saatiyle 03:00'te yeni UTC gününde yeniden bütçe oluşur. Daha fazla istek için önce gerçek API kotasını kontrol edip `DINO_V23_HISTORY_DAILY_LIMIT` değerini bilinçli şekilde yükseltin; gereksiz yere genel kota korumasını kapatmayın.
- Eski hata cache'leri düzeltilmiş sorgu için yeniden denenebilir; başarılı eski profiller ve tüketilmiş günlük istek sayısı korunur. Cache veya geçmişi elle sıfırlamayın.
- Veri ilk sinyal anında hazır değilse o sinyal yine yetersiz olarak kalır. Sonradan gelen veriyi eski karara eklemek test sonucunu yanıltacağı için yapılmaz.
- Güncellemeden sonraki yeni sinyallere bakın. Uygun maçlar sırasında hazır profiller oluşmalı; başarısız olursa panelin “Gol geçmişi toplama · son hata nedenleri” bölümünü paylaşın. API anahtarı göndermeyin.
- Az örneklem, eski son maç, kırmızı kart veya ilgili olayın hiç olmaması gibi gerçek veri yetersizliği nedenleri devam edebilir. Her satırın onay/ret alması beklenmez.

## Doğrulama kapsamı

Yerel testler sentetik API cevaplarıyla çalışır; canlı API planınız/yanıtınız henüz doğrulanmadı. Sorgu biçimi düzeltildi, fakat önceki canlı hatanın kesin nedeninin `from` eksikliği olduğu iddia edilmez. Yeni hata görünürlüğü kalan sağlayıcı sorunlarını ayırmak içindir.

Regresyonlar: tarih aralığı, taraf bazlı örneklem, kısmi verinin korunması, sonraki turda tamamlama, öncelik, kuyruk doluluğu/eskimesi, parametre hatası, HTTP/gövde hız sınırı, gizli veri temizleme, kota, yeniden başlatma, cache geçişi ve geçmiş kararların korunması. Lab/kuyruk hatası enjekte edilen sunucu testinde ana V21/V22 Telegram gönderimleri sürer.
