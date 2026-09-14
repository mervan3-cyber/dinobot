# V23.1 — V21 / V22 Kontrol Laboratuvarı

Build: ml-v23-1-dual-source-controls-ubuntu-2026-09-14 · sürüm 2.3.1.
Paket: dinobot-v23-1-v21-v22-kontrol-labi-ubuntu-2026-09-14.zip.

Panelde adı **V23** olarak kalır. V21 ve V22 yeni sinyalleri ayrı izlenir; hiçbir V23 kontrolü sinyali elemez. Telegram, V19/Legacy V17 aktif kuralları, V21/V22 seçim kuralları ve eğitilmiş modeller değişmedi. Bu paket sunucuya otomatik yüklenmedi.

## Güvenli kurulum

1. PM2 süreç adının dinobot olduğunu kontrol edin; aşağıdaki komutla durdurun:

       pm2 stop dinobot

2. Uygulama kodunu, .env, bütün geçmişleri ve önbellekleri /root/dinobot dışında yedekleyin. Yedeğin açılabildiğini doğrulayın.
3. ZIP'in **bütün dosyalarını** /root/dinobot dizinine yükleyin. Yalnız server.js yeterli değildir. .env, geçmişler, önbellekler, eğitim arşivleri ve node_modules ZIP'te yoktur; bunları silmeyin.
4. Sunucuda:

       cd /root/dinobot
       npm ci --omit=dev
       npm test

5. Başarılıysa:

       pm2 restart dinobot
       pm2 save
       pm2 logs dinobot --lines 60 --nostream

Test başarısızsa başlatmayın. Kod yedeğine dönün; canlı geçmişleri eski kopyalarla geriye almayın. Bağımlılıklar değişmedi. 25 test dosyası çevrimdışı çalışır; gerçek API, Python veya Telegram çağrısı yapmaz.

## Panelde beklenenler

- Yeni build ve V23 KONTROL LABI: AÇIK logu. Paneli sert yenileyin.
- Test Lab'daki eski V21/V22 bölümleri yerinde kalır. V23 kartında **V21, V22, tekil birleşim, eski V23** özetleri ayrıdır.
- Kaynak seçici: tümü, V21, V22, V22-A/B/C ve eski V23. JSON/CSV aynı kaynak ve TSİ tarih filtresini kullanır.
- Kontrol satırında onay K/Y, ret K/Y, yetersiz/gözlem sayısı, onay isabeti/ROI, yalnız-ret filtresi sonucu ve bazdan birim kâr farkı bulunur.
- **Ret K/Y = gereksiz elenecek kazanan / önlenebilecek kaybeden.** Bunlar gerçek veto değildir. Kural, gerekçeler ve örneklem açılır ayrıntılardadır.
- Sinyal satırındaki kontrol özetini açınca tüm bağımsız kararlar ve ölçülen değerler görünür. Veri yetersizliği ret veya kayıp sayılmaz.

## Dokuz bağımsız kontrol

1. Mevcut son 10 + ev/deplasman gol geçmişi: eski V23 sabit Poisson hesabı.
2. Yalnız iki takımın son 10 gol üretimi/yeme ortalamaları.
3. Yalnız ev sahibinin evde, deplasmanın deplasmanda gol üretimi/yeme ortalamaları; her tarafta en az 5 maç.
4. Olay listesindeki geçerli toplam gol ile giriş skorunun tutarlılığı: **veri kalitesi kontrolü**, gol tahmini değil.
5. Gol sonrası üretim.
6. Kırmızı kart sonrası üretim.
7. Oyuncu değişikliği sonrası üretim.
8. Son 5 maçta gol atamama oranları.
9. Girişteki kart ve skor durumu.

İlk üç kontrol için referans ≥%50 onay, altı ret etiketidir. Eşik veriden optimize edilmedi ve olasılıklar kalibre değildir. Kırmızı kart veya eksik kart verisinde bu üç hesap yetersiz kalır. Son 10 için en az 10, ilgili saha için en az 5 maç; son maç en fazla 60 günlük olmalıdır. Örneğin saha örneklemi azsa son-10 kontrolü yine bağımsız çalışabilir.

5–9. kontroller **yalnız gözlem etiketidir**; uydurma onay/red eşiği uygulanmaz. Şut/isabet durumları ve sonuçları grup grup raporlanır. Bunlardan birini veto yapmak ayrı ileri-test kararı gerektirir. Son 5, son 10 ve saha verileri bağımsız model oyları sayılmaz.

## Zaman ve veri güvenliği

- Her kaynak için maç başına kendi ilk sinyali; aynı maç iki kaynaktan gelirse birbirini engellemez.
- Aynı fixture, market, dakika, skor, giriş zamanı ve oran birleşik raporda bir kez sayılır. Farklı girişler ayrıdır. A/B/C ve gerekçe grupları çakışabilir; toplamlarını toplamayın.
- Eski V23 kayıtları korunur, eski dönem olarak gösterilir. Geçmiş V21/V22 veya tam-stat verileri yeni deneye aktarılmaz. İlk yeni sinyalle deney başlar.
- Olay ve profil bilgisi giriş anında dondurulur. Sonradan gelen profil/olay/düzeltme geçmiş değerlendirmeyi değiştirmez; yalnız maç sonucu güncellenir.
- Olaylar mevcut toplu/taze fixture cevaplarından kullanılır: **ek olay API isteği yok**. Liste eksikse veya alımı 120 saniyeden eski/girişten sonraysa veri yetersizdir. Kapsam ve sağlayıcı gecikmeleri nedeniyle her maçta olay değerlendirmesi beklenmemelidir.
- Olay sonrası üretim, aynı devrede olay görüldükten sonra alınmış iki istatistik anı arasında 3–20 dakikalık penceredir. Tam olay dakikasındaki istatistikler uydurulmaz. Araya başka gol/kart/değişiklik girerse veya istatistik gerilerse pencere kullanılmaz. Yeni veri sonradan eski sinyale eklenmez.
- 45+ uzatmaları ilk devrede kalır. Kaçan/iptal goller toplam gol sayılmaz. Kart olayından sahadaki oyuncu eksilmesi varsayılmaz; ikinci sarı/kırmızı aynı bilinen oyuncu kimliğiyle tekilleştirilir.
- Olay penceresi bellekte en fazla 300 maç × 32 an; aynı olaylar referansla paylaşılır. Yeniden başlatmada pencere sıfırdan birikir, kaydedilmiş sinyal kanıtları korunur.

## Kaynak kullanımı ve dosyalar

Gol profili önbelleği değişmedi: aynı lig, son 365 gün, maç başlamadan önceki FT sonuçları; gerekirse bir önceki sezon. Ek profil çağrıları taramalar arasında, en fazla 12/tur ve 80/UTC gün; kota rezervi korunur. Events bunun üzerine çağrı eklemez. Soğuk önbellekte aday yine kaydolur, ilgili kontrol yetersiz olur.

- dino_v23_goal_history.json: eski/yeni gözlemler, dondurulmuş kontroller/olay kanıtları ve tekil profiller.
- dino_v23_goal_cache.json: profil önbelleği ve kalıcı kota sayacı.
- 12.000 kaynak kaydında V23 yeni kayıt almayı durdurur, geçmişi silmez; uyarı verir. Aynı maçın iki kaynak kaydı kapasiteye iki kayıt olarak dahildir.
- Bozuk geçmiş/önbellek sıfırlanmaz. Dosya korunur, ilgili V23 işlevi durur. Mevcut modeller devam eder.
- Kapatmak: DINO_V23_SHADOW_ENABLED=false; ortam değişirse pm2 restart dinobot --update-env. V21 veya V22'den en az biri açıkken V23 çalışabilir.
- JSON: /api/v23-goal-history/export?date=2026-09-14&source=all
- V22-B: /api/v23-goal-history/export?date=2026-09-14&source=v22%3AB
- CSV için /export.csv. JSON akışla yazılır; panel satır limiti indirmeyi kısaltmaz.
- experiment özetleri ve her signal.audit.controls ölçümleri JSON'dadır. profiles yalnız gerekli tekil profilleri içerir.
- V23_PACKAGE_MANIFEST.json paket içindeki dosyaların SHA-256 değerlerini içerir.

Yarın aynı günün V23 JSON'unu **tümü** seçiliyken indirmek iki kolu birlikte incelemek için yeterlidir. İlk birkaç sonuçla eşik değiştirmeyin. Başarı/kâr garantisi yoktur. Geri dönüşte yeni kayıtları anlayamayabilecek eski kodu canlı V23 dosyası üzerinde başlatmadan önce ayrıca arşivleyin; hiçbir geçmişi silmeyin.
