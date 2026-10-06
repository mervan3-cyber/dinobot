# V24 — taze seçim ve Telegram teslim denetimi

7 Ekim 2026. Mevcut V24/Banko botuna uygulanacak kümülatif yamadır; tam bot değildir. Önceki MS pre %36, kısa istatistik yorumu ve Banko güncellemeleri korunur. Sunucu sürümü: `mac-yakala-v24-delivery-sync-2026-10-07`.

## İncelemede doğrulananlar

Scotland–Slovenia ve Wingate & Finchley–Bedford Town, gönderilen 6 Ekim tam-stat görüntülerinde hem ilk hem taze V24 seçimini geçiyor. Paylaşılan sinyallerde yoklar. İndirilen teslim defterinde bu iki fixture için başarılı, reddedilmiş veya belirsiz gönderim denemesi bulunmuyor. Defterde yakındaki England ve Croatia teslimleri mevcut. Bu, eldeki kayıtta bu iki maç için Telegram isteği başlatıldığına dair kanıt olmadığını gösterir; Telegram hatası olduğunu kanıtlamaz.

Eski tam-stat kayıtları son canlılık kontrolünün skor/oran/gol-soğuma reddini saklamıyor. Bu nedenle o iki maçın tam elenme nedeni geriye dönük kesin söylenemez. Kayıtların `selector_v2_rejected` yazısı eski genel V16 aday değerlendirmesidir; V24'ün gerçek reddi değildir. Son kontrol görüntüsü bulunmadığı için bu iki maçın canlı Telegram'da kesin gönderilebileceği de iddia edilmez.

## Düzeltme

- İlk taramada V24 geçmeyen, ortak taze kontrolde kendi V24 kurallarını geçen adayın eski `initialTelegramSources` kapısıyla sessizce atılması düzeltildi. Sentetik regresyon eski kodda başarısız, yeni kodda başarılıdır. Bu ayrı hatanın Scotland/Wingate'in nedeni olduğu iddia edilmez.
- V24 için artık kullanılmayan Gemini yorum üretimini bekleme kaldırıldı. Kabul edilmiş şut/isabet/korner görüntüsünden en fazla 180 karakterlik mevcut kısa yorum aynen üretilir. 12 saniyelik gol/oran güvenlik beklemesi kaldırılmadı.
- Son kontrolün nedenleri mevcut tam-stat aday satırına `liveDeliveryCheck` olarak kaydedilir. Yeni veritabanı, zamanlayıcı, yeniden gönderim kuyruğu veya geçmiş göçü yoktur. Eski sınırlı aday geçmişi ve arşiv düzeni korunur; kayıt yazılamazsa mevcut log uyarısı geçerlidir.
- V24 Ana LAB'ın Olay/skor sütununda `TG: Gönderildi`, `TG: Son kontrol reddi`, `TG: Teslim belirsiz` veya `TG: Neden kaydı yok` görünür. Üzerine gelince son kontrol nedeni ve zamanı açılır. JSON'da `deliveryView`, tam-statta `liveDeliveryCheck` bulunur. Sonraki taze denemeler varsa son kontrol gösterilir; LAB giriş skoru/dakikası geçmişe dönük değiştirilmez.
- `Gönderildi` yalnız gerçek Telegram mesaj kimliğiyle doğrulanır. Başka market gönderilmişse ayrıca belirtilir. Belirsiz teslim yeniden denenmez; Telegram'ın açık reddi veya son güvenlik reddi ancak sonraki yeni taze uygun girişte yeniden değerlendirilebilir.

V24 eşikleri, ÜST 25–70 / MS 25–44, kadınların açık olması, MS pre %36, maksimum 2 gereken gol, oran/EDGE, taze stats ve olay/skor şartları aynıdır. Son skor değişimi, market kapanması, 0.03 üzeri oran kayması, 2 dakikalık gol-soğuma ve maç başına tek teslim kilidi korunur. `v24_tariff.js`, Telegram teslim/erken sonuç modülü, model dosyaları ve Banko motoru önceki sürümle aynıdır.

Yeni API türü/istatistik isteği eklenmedi. Önceden yanlışlıkla atılan taze V24 adayları artık mevcut son kontrol isteklerini çalıştırabilir; kullanılmayan Gemini çağrısı yapılmaz. Geçmiş kazanan LAB maçları sonradan gönderilmez, paylaşılmış sayılmaz veya sonuçları değiştirilmez.

## Kurulum

1. Aktif manuel Banko taraması bittikten sonra değiştireceğiniz kod dosyalarını yedekleyin.
2. ZIP dosyalarını bot köküne, `public/` klasörünü koruyarak uygulayın; mevcut botu normal yönteminizle yeniden başlatın.
3. Panelde Ctrl+F5 yapın. Yeni sürüm adı `/api/status` üzerinden doğrulanabilir.

Bu düzeltmenin gerekli çalışma dosyaları: `server.js`, `v24_telegram_router.js`, yeni `v24_delivery_audit.js`, `public/index.html` ve kök `index.html`. ZIP ayrıca önceki onaylı yamaları kapsar. Yeni bağımlılık veya `.env` ayarı gerekmez. `.env`, `node_modules`, model JSON'ları, veritabanı, teslim defteri, sinyal/Banko kayıtları silinmez veya değiştirilmez; ZIP bunları içermez.

50 çevrimdışı test betiği ve gerçek ZIP uygulanmış kaynak kopyası doğrulanır. Gerçek API/Telegram çağrısı veya sunucuya kurulum yapılmaz. Bu yama bütün LAB kayıtlarının gönderilmesini garanti etmez; güvenlik nedeniyle elenen kayıtları dürüstçe ayırır.
