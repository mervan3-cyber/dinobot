# V23 Gol Geçmişi Kontrolü — Ubuntu kurulumu

Güncel build: `ml-v23-goal-history-shadow-ubuntu-2026-09-14` · sürüm `2.3.0`.
Paket: `dinobot-v23-gol-gecmisi-test-lab-ubuntu-2026-09-14.zip`.

Bu sürüm **yalnız ayrı bir V23 Test Lab gözlemi ekler**. Telegram yönlendirmesi, Dino/V16/V18/V20 model dosyaları, V19/Legacy V17 aktif kuralları, V21 ve V22 değişmedi. Sunucuya otomatik yüklenmedi.

## Kurulum

1. PM2 süreç adınızın `dinobot` olduğunu kontrol edin. `pm2 stop dinobot` ile durdurun.
2. Mevcut uygulamanın kodunu, `.env`, bütün geçmişlerini ve önbelleklerini uygulama dizini dışına yedekleyin. Yedeğin açılabildiğini kontrol edin.
3. ZIP'i mevcut `/root/dinobot` dizinine açın. **Bütün paket dosyalarını** yükleyin; yalnız `server.js` yüklemek yeterli değildir. ZIP'te `.env`, sinyal geçmişleri, önbellekler, eğitim arşivleri ve `node_modules` yoktur. Bunları silmeyin.
4. Doğrulayın:

```bash
cd /root/dinobot
npm ci --omit=dev
npm test
```

5. Her iki komut da başarılıysa:

```bash
pm2 restart dinobot
pm2 save
pm2 logs dinobot --lines 60 --nostream
```

Testler başarısızsa yeni sürümü başlatmayın. Kod yedeğine dönün; geçmişleri silmeyin veya eski kopyalarla geriye almayın. Bağımlılıklar değişmedi; V23 yalnız Node standart kütüphanelerini kullanır. 23 test dosyası çevrimdışı çalışır; gerçek API/Python/Telegram çağrısı yapmaz.

## Açılış kontrolü

- Logda yeni build ve `V23 GOL GEÇMİŞİ: AÇIK` görünmeli.
- Paneli sert yenileyin. Test Lab'da V21/V22 yerinde, ayrıca **V23 · Gol Geçmişi Kontrolü** kartı bulunmalı.
- V23 boş başlar: eski V21/tam-stat dosyaları aktarılmaz. Yalnız bundan sonra oluşan yeni, taze doğrulanmış V21 adayları eşleştirilir.
- V23 grupları: **Onay / Ret / Veri yetersiz**. Üç grubun da maç sonucu takip edilir. Ret, maçın kaybettiği anlamına gelmez.
- Tüm eşleşen V21 bazını, verisi yeterli bazı, onaylananları ve reddedilenleri ayrı karşılaştırın. Veri yetersizleri gizleyerek başarı oranını yorumlamayın.
- Kartta elenen kayıp, kaçırılan kazanan, veri kapsamı, tutulan aday oranı ve ek API sayacı bulunur. Tarih seçimi TSİ'dir.
- İlk açılışta profil hazır değilse o aday veri yetersiz kalır; daha sonra gelen profil eski kararı değiştirmez.

## Veri ve kaynak sınırları

Profiller, aynı ligde maçın başlama anından önceki tamamlanmış maçlardan hesaplanır: son 5/10, ev-deplasman atılan/yenen gol, gol atamama ve gol yememe oranları. En fazla son 365 gün kullanılır. Mevcut sezonda örneklem azsa kota uygunsa yalnız önceki sezona bir ek istek yapılır. Mevcut sezon özetleri JSON'da ayrıca bulunur; başka ligler/takımlar karıştırılmaz.

Tam onay/ret değerlendirmesi için iki takımda da son 10 maç ve ilgili ev/deplasman tarafında en az 5 maç gerekir. Son maç 60 günden eskiyse, kart sayısı bilinmiyorsa veya kırmızı kart varsa ilk referans hesap karar vermez: **veri yetersiz**. Bu yüzden her V21 adayının mutlaka değerlendirilmesi beklenmemeli.

Ek istekler taramalar arasında seri çalışır. Her seferinde en çok 12, UTC günde en çok 80 istek; takım/sezon başına en çok 2 istek. Günlük sayaç yeniden başlatmada korunur. Mevcut kota rezervinin altına inilmez. Bir profil isteğinin zaman aşımı 6 saniye, deneme sayısı 1'dir. HTTP 429 sonrası 30 dakika beklenir. Başarılı önbellek 12 saat, hata 30 dakika saklanır; en fazla 600 takım/gün anahtarı tutulur. Ortak API kuyruğunda başlamış tek bir ek istek kısa gecikme yaratabilir; sinyal kararı profil indirmesini beklemez.

## Sabit deney kuralı

V21 bazı aynen: yarım gollü ÜST, Dino/V16/V18 ayrı ayrı >%50, Pre >%50, EDGE −5…0, dakika 25–80, oran 1.50–4.00, maç başına ilk sinyal. −2.7…+1.8 önerisi bu sürümde uygulanmadı.

V23, atak ile rakibin gol yeme ortalamasını karşılaştırır. Her takımın son 10 ve ilgili ev/deplasman ortalaması yarı yarıya harmanlanır. Toplam gol hızı kalan normal süreye ölçeklenir ve gereken ek gol için basit Poisson referansı hesaplanır. Referans ≥%50 ise onay, altındaysa ret. **Bu eşik veriden optimize edilmedi; bu yüzde kalibre edilmiş model güveni değildir.** Son 5 maçın gol atamama bilgisi ayrıca gösterilir, son 10 ile çakıştığından bağımsız oy sayılmaz.

Skor hangi tarafın önde olduğunu ve gereken golü belirler. Makaledeki kırmızı kart / geriye düşme yüzdeleri veya ilave uzatma dakikası doğrudan uygulanmaz. Geçmiş maçların “gerideyken/kırmızı karttan sonra” gol oranı için gerekli olay-zamanı modeli henüz yoktur. Ayrıntılar: `V23_DEGISIKLIKLER_2026-09-14.md`.

## Dosyalar ve dışa aktarım

- `dino_v23_goal_history.json`: ayrı gözlem geçmişi ve tekil profil anlık görüntüleri; yedekleyin.
- `dino_v23_goal_cache.json`: sınırlı API önbelleği ve günlük istek sayacı; yedekleyin.
- Hiçbir eski dosya temizlenmez. V23 geçmişi 12.000 kayıtta sessizce silinmez; kayıt durur ve panel/log uyarır. Arşivleme planı gerekir.
- Bozuk V23 geçmişi/önbelleği otomatik sıfırlanmaz. V23 ilgili işlevi kapanır, dosya korunur.
- V23'ü kapatmak: `DINO_V23_SHADOW_ENABLED=false`; PM2 ortam değişikliğinde `pm2 restart dinobot --update-env`. V21 kapalıysa eşleştirilmiş V23 de kapalıdır.
- API: `/api/v23-goal-history`, `/api/v23-goal-history/export?date=2026-09-14`, `/api/v23-goal-history/export.csv?date=2026-09-14`.
- JSON dışa aktarımı parça parça yazılır, profiller bir kez bulunur. Paneldeki limit dışa aktarımı kısaltmaz.
- JSON'daki `profileIds` değerleri `profiles` içindeki örnekleme bağlanır. Son 5/10, sezon, ev-deplasman ve geçmiş skorlar burada incelenebilir.
- `/api/test-lab-comparison` ve `/api/status` içinde `v23Goal` vardır.
- ZIP içindeki `V23_PACKAGE_MANIFEST.json` dosya SHA-256 değerlerini içerir.

Yarın aynı tarihin **V23 JSON'u ve V21 JSON'unu** alın. İlk birkaç sonuçla eşiği değiştirmeyin; onay/ret sayısı, kaçırılan kazananlar, veri kapsamı ve teorik ROI'yi birlikte değerlendirin. Başarı veya kâr garantisi yoktur.
