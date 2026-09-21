# Maç Yakala — tek paket: yeni LAB + isteğe bağlı 5/10 dk tarama

Sürüm **2.5.6** · Yapı: `mac-yakala-v23-adaptive-scan-2026-09-21`

Bu güncelleme **2.5.4 (20 Eylül)** veya **2.5.5 (21 Eylül yeni filtre LAB)** üzerine uygulanır. Önceki LAB ZIP’ini ayrıca yüklemeyin; o değişiklikler bu pakette var. Bu bir fark paketidir, boş klasöre tek başına kurulmaz. Sunucuya otomatik yüklenmedi; testler gerçek API veya Telegram’a bağlanmaz.

## Panelde nerede?

Ana görünüm → **Otomatik tarama** → **Tam-stat varsa 5 dk**.

İlk kurulumda yeni seçenek **kapalıdır**. Panelden açın; seçim mevcut ayar dosyasında saklanır, PM2 yeniden başlasa da korunur. `.env` satırı veya yeni anahtar gerekmez. Durum satırında çalışma nedeni, son taramadaki uygun maç sayısı ve sonraki tarama sayacı görünür.

| Normal döngüde durum | Tarama aralığı |
| --- | --- |
| Seçenek kapalı | 10 dk |
| Açık + en az 1 uygun tam-stat canlı maç | 5 dk |
| Açık + uygun maç yok / aday bilgisi eskimiş | 10 dk |
| Açık + kota bilinmiyor / rezervde / API hata koruması | 10 dk |
| Ana sistem veya otomatik tarama kapalı / çalışma saati dışında | Otomatik tarama yapılmaz |

**Uygun maç:** mevcut hazırlama hattından geçmiş, 25–80. dakikada, 1H/2H durumunda, takım kimliği doğrulanmış, iki takımın toplam şut/isabet/korner alanları eksiksiz ve geçerli canlı oranı bulunan maç. Sinyal üretmiş olması şart değildir. Aynı maç bir kez sayılır. Hızlı döngü bütün mevcut canlı taramayı yeniden çalıştırır; yalnız bir maça özel sorgu değildir.

Uygun maç kalmadığı bir sonraki taramada anlaşılır; arada ek API sorgusu açılmaz. Eski aday bilgisi 12 dakikadan sonra hızlandırmada kullanılmaz. Yeniden başlatmada aday listesi/geri sayım geri yüklenmez; ilk tarama güncel durumu belirler.

## Zaman ve kota güvenliği

- Mevcut 60 saniyelik zamanlayıcı kullanılır; 5/10 dk hedef süreleridir, kontrol turu ve devam eden işler nedeniyle gecikebilir.
- Süre son taramanın başlangıcından sayılır. Manuel “Şimdi Tara” da bu başlangıcı yeniler. Tarama uzun sürerse bitişinden en az 1 dakika sonra yeniden başlayabilir; taramalar üst üste binmez, kaçırılan turlar peş peşe telafi edilmez.
- Kapatınca normal döngü, son başlangıçtan 10 dakikaya döner. Açınca şartlar uygunsa 5 dakikaya döner; ayar düğmesi kendi başına paralel tarama başlatmaz.
- Kalan API kotası mevcut `SHADOW_MIN_QUOTA_REMAINING` rezervine eşit veya düşükse hızlandırma yapılmaz. Tanımlı değilse rezerv 1500’dür. Bu ayarı eklemeniz gerekmez. Kota bilinmiyorsa da 10 dk kullanılır.
- HTTP 429, sunucu/ağ/zaman aşımı hataları ve başarılı HTTP yanıtındaki istek limiti uyarıları son hatadan itibaren 10 dk boyunca hızlandırmayı kapatır. Normal 10 dk tarama ve mevcut API tekrar-deneme kuralları devam eder; bu, bütün API trafiğini durduran bir kota kilidi değildir.
- Çalışma programındaki mevcut **“5 Dakikada Bir Tara” sabit seçimi ayrıdır ve önceliklidir**. Yeni anahtardan/kota korumasından bağımsız eski davranışını korur. Tamamen 10 dk istiyorsanız programda da normal döngüyü seçin. “Tek sefer” tekrar eden döngüye çevrilmez.

## LAB ve canlı sinyaller

Önceki sade LAB değişikliği bu pakete dahildir: eski geçmiş/üretim/xG deneyleri panelden ve aktif işlem hattından çekildi; geçmiş toplayıcısı çalışmaz. Skor/olay tutarlılığı ve yeni V21/V22 giriş deneyleri kalır. Eski kayıtlar silinmez; arşivden talep üzerine indirilebilir. Deneylerin ayrıntıları `V23_YENI_FILTRE_LAB_2026-09-21.md` belgesindedir; bu paketin kurulumunda bu yeni belge esas alınır.

Yeni deneyler hâlâ **yalnız LAB simülasyonudur**; canlı sinyalleri elemez. Yeni LAB ek API çağrısı yapmaz. V21/V22 tarifeleri, model dosyaları ve Telegram metin/gönderim dosyası değiştirilmedi.

**Hızlı tarama açılırsa API/CPU tüketimi artabilir.** Aynı kurallar daha sık uygulanacağı için sinyal zamanı, yakalanan adaylar ve sinyal sayısı değişebilir. Telegram’ın mevcut bağımsız kaynak ve tekrar-gönderim korumaları korunur; “çıktılar birebir aynı kalır” garantisi yoktur.

## Sunucuya yükleme

1. Mevcut kodu ve veri dosyalarını yedekleyin. `pm2 list` ile uygulama adını kontrol edin; aşağıdaki komutlar adın `dinobot` olduğu kurulum içindir.
2. `pm2 stop dinobot` çalıştırın. ZIP içindekileri mevcut uygulama klasörüne **aynı yollarla** aktarın. Eski dizini veya veri dosyalarını silmeyin.
3. Yeni `adaptive_scan.js`, `v23_filter_lab.js`, `public/v23_filter_panel.js` dosyaları ve iki `index.html` kopyası dahil bütün ZIP içeriğini aktarın.
4. Uygulama klasöründe `npm test` çalıştırın. **35 test dosyasının tamamı başarılı olmadan** servisi yeniden başlatmayın. Bağımlılık değişmedi; yeni `npm install` veya `.env` düzenlemesi gerekmiyor.
5. `pm2 restart dinobot` çalıştırın. Paneli **Ctrl+F5** ile yenileyin; yapı sürümünün `mac-yakala-v23-adaptive-scan-2026-09-21` olduğunu doğrulayın.
6. İsterseniz “Tam-stat varsa 5 dk” seçeneğini açın. Ana sistem ve otomatik tarama açık olmalı; paneldeki neden satırına bakın. Uygun maç yoksa açık olsa bile 10 dk göstermesi normaldir.

ZIP `.env`, canlı geçmiş/veri/önbellek dosyaları, model dosyaları, `mac_yakala_telegram.js` veya `node_modules` içermez. Sunucudaki Telegram analiz metni düzenlemeniz korunur. Önceden değiştirdiğiniz başka bir dosya bu ZIP ile örtüşüyorsa yedeğinizle karşılaştırın.

Geri alma: önce yeni anahtarı kapatabilirsiniz. Kod geri alınacaksa PM2’yi durdurup kod yedeğini geri koyun; eski/yeni LAB veri dosyalarını silmeyin. 2.5.4’e dönmek eski API toplayıcılarını tekrar etkinleştirebilir.
