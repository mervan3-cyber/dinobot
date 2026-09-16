# Maç Yakala — bağımsız V22 / V21 Telegram
Sürüm 2.4.0 · Build: mac-yakala-independent-telegram-2026-09-16

## Bu sürüm
- Telegram: V22 ve V21 kendi mevcut kurallarıyla bağımsız sinyal üretir. Birbirlerinin onayını beklemez.
- Aynı taramanın aynı market/girişinde birlikte uygunsalar tek mesajda iki model ayrı satırda yazılır.
- V21 aynı maçta 35. dakikada 1.5 ÜST, V22 60. dakikada 1.5 ÜST seçerse ikisi ayrı gönderilir. Model başına maçta bir sinyal sınırı korunur; her 10 dakikada aynı model tekrar atmaz.
- V21/V22 lab geçmişleri ve Telegram geçmişi ayrı kalır. Eski lab sinyalleri geriye dönük Telegram'a aktarılmaz. Yeni kurulumdan sonra uygun canlı girişler değerlendirilir.
- V20 ve Legacy V17 yalnız labda kalır. V20 yarın kendiliğinden Telegram'a geçmez.
- V19 / Yeni Çekirdek lab kartları ve çalışma yolları kapalıdır; eski env bayrakları bunu açamaz. Eski disk geçmişlerine dokunulmaz; eski API adresleri boş/kapalı uyumluluk cevapları döndürür.
- V23 bağımsız kontrol/gözlem devam eder; Telegram sinyaline veto uygulamaz.
- Eğitilmiş model dosyaları, V21/V22 politika eşikleri değişmedi. Arşiv ve .env uyumluluğu için teknik dino_* dosya/alan adları korunur; kullanıcıya görünen ana marka Maç Yakala'dır.

## Mesaj
Başlık MAÇ YAKALA. Maç, lig, dakika, skor, ayrı model satırları; market ve oran birlikte kalın; en fazla iki kısa analiz cümlesi.
EDGE, karar motoru, kaynak, ihtimaller ve uzun canlı istatistik listesi yoktur.
Son satır tam olarak: Öncelikli modelimiz V22

## Sonuç yanıtı
- Normal süre sonucu kesinleşip W olarak kaydedilince, yeni paketle paylaşılan her sinyalin orijinal Telegram mesajına yalnız “✅✅✅ YAKALADIK!” yanıtı gönderilir.
- Kayıp/iade/iptal için Telegram mesajı yok; bütün sonuçlar panel/JSON/istatistikte korunur.
- Aynı maç iki farklı girişle paylaşılmışsa her kazanan giriş kendi mesajına yanıt alır.
- Uzatma/penaltı maçında normal süre skoru eksikse sonuç bekler; uzatma golleriyle yanlış kutlama yapılmaz.
- Eski sürüm mesajlarına toplu kazanç bildirimi gönderilmez. Kayıp bildirimlerinin sessiz olması toplam performansın yalnız kazançlarla raporlandığı anlamına gelmez.
- Bot kanalda mesaj gönderme iznine sahip olmalı. Orijinal mesaj silinmişse bağımsız kutlama mesajına dönülmez.
- Telegram yanıt biçimi: https://core.telegram.org/bots/api#replyparameters

## Kalıcılık ve belirsizlik
Yeni mac_yakala_telegram_delivery.json dosyası gönderim niyetlerini, Telegram mesaj kimliklerini ve yanıt durumlarını tutar. dino_signal_history.json ile birlikte korunmalı/yedeklenmelidir.
- Başarılı gönderimler yeniden başlatmada tekrarlanmaz.
- Ağ zaman aşımında Telegram'a ulaşıp ulaşmadığı bilinmeyen işlem otomatik tekrarlanmaz; günlükte uncertain olarak kalır. Bu, olası çift mesaj yerine bazen eksik mesajı tercih eder.
- Açık Telegram ret cevabında yeni sinyal ancak yeniden taze değerlendirmeden geçerek denenebilir. Kazanç yanıtında 429 bekleme süresi dolunca tekrar denenir.
- Paylaşılan geçmiş bozuksa sunucu başlamaz. Gönderim günlüğü bozuksa veya paylaşılan yeni geçmişi kapsamıyorsa Telegram kapatılır; dosyalar sıfırlanmaz. Panel/log uyarısı görünür.
- Her iki dosya da silinirse önceki gönderimler ispatlanamaz. Dosyaları temizleyerek yeniden kurulum yapmayın.
- Dosya tabanlı kilitler tek Node/PM2 süreci içindir: cluster veya iki bot kopyası çalıştırmayın.

## Doğrulama
26 çevrimdışı test dosyası: bağımsız seçim, 35/60 dakika aynı market, tek mesajda eşleşme, taze veri reddi, son oran değişimi, API/panel sözleşmeleri, kayıp korunması, kazanç yanıtları, yeniden başlama, 400/429/zaman aşımı, bozuk/eksik günlük, emekli modellerin dosyalarının korunması.
Panel ve mesaj HTML'i Computer Use ile yalnız sentetik yerel verilerle görsel kontrol edildi. Gerçek Telegram / API-Football / Gemini çağrısı yapılmadı; canlı sunucuya yükleme yapılmadı.
