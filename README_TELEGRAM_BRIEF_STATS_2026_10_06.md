# Telegram — kısa, veriye dayalı V24 yorum

6 Ekim 2026. Bu yama mevcut V24/Banko botu içindir. Önceki MS prematch minimum %36 ve Banko güncellemeleri pakette korunur. Tam bot değildir.

Yeni V24 sinyalinde analiz en fazla **180 karakter ve iki kısa cümle** olur. İlk cümle girişteki mevcut şut/isabetli şut/korner sayılarıdır. ÜST için iki tarafın toplamı; MS1/MS2 için seçilen tarafın sayıları kullanılır. İkinci cümle gereken golü veya seçilen galibiyet marketini açıklar.

Örnek: `Toplam 10 şut, 3 isabetli şut, 4 korner. 2.5 ÜST için 2 gol daha gerekiyor.`

Eksik bir tarafın sayısı sıfır kabul edilmez; o toplam gösterilmez. Gerçek sıfır gösterilir. Negatif, bozuk, kesirli sayaçlar veya şuttan fazla isabetli şut yorumdan çıkarılır; tahmin edilmez. Veri hiç yoksa eksik olduğu kısa biçimde belirtilir. Sayılar ve açıklama kaydedilen kabul edilmiş giriş görüntüsünden deterministik üretilir; Gemini'nin genel yorumu ya da yazdığı doğrulanmamış sayılar V24 analizine taşınmaz. Basınç, tempo veya yaklaşan gol gibi kanıtlanmamış iddialar eklenmez.

Sinyal kararları, bütün V24 eşikleri (MS pre %36 dahil), dakika/oran/edge son kontrolü, taze veri ve olay/skor doğrulaması, ilk uygun maç kilidi, erken YAKALADIK ve LAB/Banko kuralları değiştirilmez. Ana kanal, ek kanal ve grup aynı metni kullanır. Yeni API isteği, bağımlılık veya `.env` ayarı yoktur; mevcut Gemini üretim çağrısının çalışma sırası bu yamada değiştirilmez. Geçmiş mesajlar düzenlenmez/tekrar paylaşılmaz, geçmiş kayıtlar yeniden yazılmaz.

## Kurulum

Dosyaları yedekleyin. Aktif manuel Banko taramasının bitmesini bekleyin; ZIP'i bot köküne **public/** yapısını koruyarak uygulayıp botu mevcut yönteminizle yeniden başlatın. Panelde Ctrl+F5 yapabilirsiniz; yeni yorum yalnız yeni V24 sinyallerine uygulanır.

`.env`, `node_modules`, model JSON'ları, veritabanı, Telegram teslim defteri, sinyal ve Banko çalışma kayıtlarını silmeyin veya üzerlerine yazmayın. Bunlar ZIP'te yoktur. Yeni kısa yorum için gerekli çalışma dosyaları yalnız `mac_yakala_telegram.js` ve `v24_telegram_router.js`; paket önceki onaylı MS/Banko yamalarını da kapsar.

47 çevrimdışı betik, kısa yorum senaryoları ve gerçek ZIP uygulanmış kopya test edilir. Gerçek API/Telegram çağrısı veya sunucuya yükleme yapılmaz. Kısa açıklama kazanma garantisi değildir.
