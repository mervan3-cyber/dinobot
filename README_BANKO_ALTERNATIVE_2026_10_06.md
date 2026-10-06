# Banko Kupon — her analiz maçında alternatif tahmin

6 Ekim 2026. Bu ZIP, 5 Ekim Banko Kupon kurulmuş botun üzerine uygulanır; önceki 8 genel + 3 saha örneklemi, kupon sayısı ve canlı işlemi bekleyip aynı taramadan devam etme güncellemelerini de içerir. Tam bot değildir.

## Yeni özellik

- Banko Kupon → **İncelenen tüm maçlar** bölümünde her maçın başlığında **↻ Alternatif tahmin** düğmesi bulunur. Otomatik kupona alınmayan maçlarda da vardır.
- Düğme kaydedilmiş marketlerin içinden ana seçim dışındaki en yüksek ham model olasılığına sahip uygun ikinci farklı seçeneği açar. Beraberliklerde veri puanı, market kimliği ve seçim adıyla ana sistemin sıralaması kullanılır. Aynı tahminin farklı etiketli tekrarı yedek sayılmaz.
- Ana seçimdeki kayıt anına ait oran/veri/model/market ailesi şartları korunur. Sonradan değiştirilen panel ayarları eski kupona sessizce uygulanmaz. PAS maçları veya ikinci uygun seçeneği olmayan maçlarda **Uygun alternatif yok** yazılır; seçim zorlanmaz.
- Yedeğin marketi, kayıt oranı, ham model yüzdesi, veri puanı, model-piyasa farkı, kısa seçim gerekçesi ve oran zaman damgası görünür. Bu saklanan analizdir; yeni oran sorgusu veya maç önü kontrolü değildir. Eski sürümlerde gösterilenler de kayıt anına aittir.
- İkinci tıklama yedeği gizler; tekrar açmak rastgele yeni tahmin üretmez. Açık yedek aynı sürümde sayfa/arama/yenilemede korunur; başka sürüme taşınmaz.
- **Ek API çağrısı, sunucu hesaplaması, Telegram gönderimi veya veri dosyasına yazma yoktur.** Seçim yalnız tarayıcıda saklanmış analizden yapılır. Ana tahmin, kayıtlı kupon, ilk oran ve sonuç takibi değiştirilmez. Yedek ayrı bir bahis seçeneğidir; ana seçimin sigortası değildir.
- Ham model yüzdesi kalibre edilmiş gerçek başarı oranı veya kazanma garantisi değildir.

Bu özelliğin geliştirilmesinde `server.js`, `banko_coupon.js`, `banko_model.js`, V24, Telegram, erken YAKALADIK, paylaşılan sinyaller ve mevcut İY/MS çalışma kodları önceki bekle/devam sürümüyle **birebir aynı** kalmıştır. Paket, eski Banko kurulumuna uygulanabilmesi için önceden onaylanmış Banko çalışma dosyalarını da içerir.

## Kurulum

Değişecek dosyaları yedekleyin; ZIP'i bot köküne **public/** yapısını koruyarak uygulayın. Önceki Banko bekle/devam güncellemesi zaten kuruluysa bu yeni özellik yalnız panel dosyalarını değiştirir; devam eden işi kesmemek için botu yeniden başlatmak gerekmez. Panelde **Ctrl+F5** yapın. Daha eski Banko çalışma kodlarını da bu paketle güncelliyorsanız botu mevcut yönteminizle yeniden başlatın; yarım iş otomatik sürmez, yeni manuel tarama gerekir.

`.env`, `node_modules`, model/veritabanı dosyaları ve özellikle `dino_banko_coupon_v1.json`, `dino_banko_api_usage.json`, `dino_banko_cache_v1.json` dosyalarını silmeyin. ZIP'te gizli bilgi veya çalışma kayıtları yoktur. Yeni bağımlılık gerekmez.

45 çevrimdışı test betiğine alternatif ekranı için ek senaryolar katılmıştır: tüm analizlerde düğme, sıralama ve eşdeğer etiketlerin elenmesi, değişmez ilk tahmin/kupon/sonuç, PAS, eksik/bozuk oran ve olasılık, kayıt anındaki eşikler, API harcanmaması, sayfalama/arama/sürüm ve canlı beklerken yerel gösterim. Gerçek ZIP uygulanmış kopya ayrıca test edilir; panel sahte verilerle tarayıcıda kontrol edilir. Gerçek API/Telegram çağrısı veya sunucuya yükleme yapılmaz.
