# Banko Kupon — manuel seçim ve gerçek oran takibi

7 Ekim 2026. Mevcut Banko / V24 kurulumu üzerine uygulanacak güncellemedir; tam bot değildir. Yeni bağımlılık gerektirmez.

## Ne değişti?

- Her analiz maçındaki ana tahmin, gerçek yedek ve desteklenen diğer marketler **Seçimlerime** kaydedilebilir. Oran ve isteğe bağlı kupon etiketi girilir. Aynı etiketi üç veya daha fazla seçime verebilirsiniz; manuel liste iki maçla sınırlı değildir. Bu liste iddaa'da gerçek kupon oluşturmaz, bahis yapmaz, Telegram'a göndermez. Otomatik Banko kupon üretimi mevcut 1–2 maçlı mantıkla çalışmaya devam eder.
- Aynı sonucun farklı adı yedek sayılmaz: örneğin deplasman 0.5 ÜST ile ev sahibi gol yemez HAYIR eşdeğerdir. Uygun, gerçekten farklı ikinci market bulunamazsa yedek zorlanmaz. Farklı marketler yine birbiriyle ilişkili olabilir; yedek ana tahminin sigortası değildir.
- **Girilen oranı kontrol et** yeni API isteği yapmaz. Saklanmış analiz ve o taramanın eşikleri kullanılarak girilen fiyattaki oran aralığı/model-piyasa farkı tekrar hesaplanır. Veri, model veya kapalı market şartları gevşetilmez; bu işlem yeni oran/kadro kontrolü değildir. Eski fiyat veya başlamış maça ilişkin uyarılar korunur.
- Şart dışı/eski bir seçim yalnız açık uyarı onayıyla manuel takip listesine eklenebilir. Model tarafından onaylanmış seçim gibi gösterilmez. Oran boş bırakılırsa sonuç takip edilir, oynanan fiyat üzerinden getiri hesaplanmaz.
- Etiketler MAÇ / İLK YARI / İKİNCİ YARI ve ev/deplasman takım golü kapsamını açıkça yazar. Desteklenmeyen marketler sonuçlandırılmış gibi gösterilmez; korner manuel sonuç takibine alınmaz.
- **SONUÇLARI GETİR · MANUEL**, seçili taramanın kuponları ve uygun analiz marketleriyle birlikte, o günün tüm sürümlerindeki kaydedilmiş manuel seçimleri kontrol eder. Aynı maç tek fixture sorgusunda paylaşılır, en fazla 10 kimliklik partiler kullanılır. Tamamlanmış sonuçlar tekrar sorgulanmaz. İlk yarı skoru yoksa tahmin edilmez, beklemede kalır.
- Yeni tarama veya yeniden başlatma eski manuel seçimleri silmez. Aynı tarama/maç/eşdeğer seçim tekrar kaydedilmez. İlk tahmin ve API oranı değişmez; girilen oran/etiket düzeltmeleri değişiklik geçmişine yazılır.
- Maç başladıktan sonra eklenen kayıt ayrı işaretlenir. Manuel seçilmiş örneklem ve seçili taramanın ana/yedek/tüm uygun market sayımları ayrıdır. Bir maçın marketleri bağımsız örnek değildir; bu sayımlar kalibre edilmiş başarı oranı veya garanti anlamına gelmez.

## Aynen kalanlar

Banko model/örneklem/olasılık eşikleri ve otomatik kupon optimizasyonu değiştirilmedi. Günlük API sınırı 2000, canlı rezervi 1500 olarak korunur; kayıtlı kullanıcı ayarları üzerine varsayılan değer yazılmaz. Canlı tarama sırasında Banko bekler, işlem bittiğinde kaldığı yerden devam eder. Yeni arka plan sonuç tarayıcısı eklenmedi.

**Otomatik maç önü kontrol ve MAÇ ÖNÜ KONTROL düğmesi mevcut otomatik kuponların seçilmiş maçları içindir. Yeni manuel listenin kadro/oran kontrolünü otomatik yaptığı varsayılmamalıdır.** Girilen fiyatı kontrol etmek kadro kontrolü yapmaz.

`server.js`, `banko_model.js`, V24, Telegram, erken YAKALADIK ve paylaşılan sinyal kodları mevcut 7 Ekim teslim sürümüyle birebir aynı kaldı. Paket yalnız Banko çalışma/panel/test dosyaları içerir. HTML'in Banko dışındaki bölümleri değişmedi.

## Yükleme

1. Botun değişecek kod dosyalarını ve Banko kayıtlarını yedekleyin.
2. ZIP'teki dosyaları bot köküne **public/** klasör yapısını koruyarak uygulayın. Tam klasörü silmeyin.
3. Backend de değiştiği için botu mevcut yönteminizle yeniden başlatın; ardından panelde **Ctrl+F5** yapın. Devam eden tarama varsa bitmesini bekleyin: yeniden başlatma yarım işi otomatik sürdürmez, geçmişi korur.
4. `.env`, `node_modules`, model dosyaları ve özellikle `dino_banko_coupon_v1.json`, `dino_banko_api_usage.json`, `dino_banko_cache_v1.json` dosyalarını silmeyin/değiştirmeyin. Yeni `.env` ayarı gerekmez.

Manuel kayıtlar mevcut `dino_banko_coupon_v1.json` içine eklenir; eski şema/sürümler okunur. Paket içinde gizli anahtar, kullanıcı kayıtları, gerçek kupon veya test önizleme verisi bulunmaz. Sunucuya otomatik yükleme yapılmadı.

## Doğrulama

52 çevrimdışı/mock test betiği; eşdeğer yedeklerin elenmesi, üç ve daha fazla manuel kayıt, gerçek fiyat ve açık uyarı onayı, ilk tahminin değişmemesi, yeniden başlatma/sürüm geçmişi, tekil fixture sonuç sorguları, eksik ilk yarı skoru ve canlı bekle/devam senaryolarını kapsar. Panel sahte verili yerel tarayıcıda kontrol edildi; gerçek API veya Telegram çağrısı yapılmadı. Gerçek ZIP uygulanmış kopyanın doğrulama raporu paketin yanındadır.
