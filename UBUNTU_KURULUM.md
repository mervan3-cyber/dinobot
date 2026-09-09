# V20 bağımsız gölge — mevcut Ubuntu kurulumunu güncelleme

Bu paket **V20'yi Telegram'a geçirmez**. Mevcut V19 karar hattı ve eski V17 / hibrit karşılaştırmaları korunur. V20, aynı veri akışından ayrı tahmin üretip yalnız test laboratuvarına kaydeder. Kod henüz sunucunuza yüklenmedi.

## Önce koruyun

Mevcut uygulama klasörünüzün bir yedeğini alın. Özellikle `.env`, `dino_data.json`, sinyal/aday/gölge geçmişleri, API önbellekleri ve varsa `v20_snapshot_archive` korunmalı. ZIP bunları içermez; yeni kodu açarken mevcut klasörü silmeyin veya boş klasörle değiştirmeyin.

Paket tam kod güncellemesidir; **yalnız index.html kopyalamak yeterli değildir**. ZIP'in kökünde server.js, public/, model JSON'ları ve testler bulunur. Bunları mevcut dinobot uygulama dizinine açın. Eski Node/Python/PM2 ve API anahtarı ayarlarınızı koruyun. Python tarafında kullanılan modüller standart kütüphanedendir; V20 eğitimi için yerelde kullanılan NumPy/scikit-learn sunucuda gerekmez.

## Kontrol ve başlatma

Uygulama dizininizde (mevcut kurulumunuz `/root/dinobot` ise):

```bash
cd /root/dinobot
npm ci --omit=dev
npm test
```

Her iki komut da başarılıysa:

```bash
pm2 restart dinobot
pm2 save
pm2 logs dinobot --lines 40 --nostream
```

Bu güncelleme için .env değişikliği zorunlu değil. Ortam değişkenini kendiniz değiştirirseniz PM2 yeniden başlatırken `--update-env` gerekebilir. Node/Python komutları sunucudaki mevcut kurulumunuzdan çalışır; yerel doğrulamada Node v24.19.0 kullanıldı. Paket üzerinde 10 çevrimdışı test grubu ve sözdizimi kontrolleri yapıldı; gerçek Ubuntu açılışı, npm indirmesi ve gerçek API/Telegram çağrıları yerelde test edilmedi.

Başlangıç sürümü: `ml-v20-independent-shadow-ubuntu-2026-09-09`.

Paneli sert yenileyin. Test laboratuvarında V20 modelinin yüklü ve gölge modunun açık olduğunu görün. Model/politika dosyası okunamazsa V20 hata gösterir; başka bir modele sessizce geçmez. Henüz sinyal olmaması tek başına arıza değildir: adaylarda V20 yüzdesi ve ret gerekçeleri de izlenebilir.

## V20'nin sabit kuralları

- ALT kapalı. 0.5/1.5/2.5/3.5/4.5 ÜST ve MS1/X/MS2 aday olabilir.
- Dakika 25–80; oran 1.50–4.00.
- V20 olasılığı en az %70 ve V20 ham EDGE en az +10 yüzde puan.
- EDGE = V20 olasılığı − 100/oran. 1.50 oranda bu iki koşul birlikte yaklaşık %76,67 gerektirir.
- Maç başına en fazla 1 gölge sinyal. İkinci sinyal üretim paketinde kapalı.
- Canlı istatistik ve oran tekrar kontrol edilir; son fixture skor/statü/kimlik kontrolü de geçmelidir. Başarısız veya bayat veriyle V20 sinyali yazılmaz.

Model canlı fiyatın ima ettiği olasılığı canlı istatistiklerle düzeltir; Dino/V16/V18 olasılıklarını kullanmaz. Pre-match, API takım/tahmin bağlamı ve xG seçenekleri incelendi, bu veride yeterli/tutarlı ek katkı doğrulanamadığından final modelde yok. Bu özellikler eski kollarda mevcut davranışlarıyla bulunabilir.

## Kalıcılık ve API yükü

V20 gölge varsayılan açıktır. İstenirse `DINO_V20_SHADOW_ENABLED=false` ile yalnız bu kol kapatılabilir. Özel konum gerekirse `DINO_V20_SHADOW_HISTORY_FILE` ve `DINO_V20_SNAPSHOT_ARCHIVE_DIR` kullanılabilir; dizin uygulama kullanıcısı için yazılabilir olmalıdır.

Yeni gölge geçmişi `dino_v20_shadow_history.json` dosyasındadır. Restart sonrasında maç başına sinyal hakkı buradan korunur. Dosyayı silmek aynı maça yeniden sinyal verilmesine yol açabilir.

Tam-stat tarama anları ayrıca `v20_snapshot_archive` altında Türkiye gününe göre eklemeli JSONL arşivlenir. Panelin kayıt sınırı eski anları çıkarsa da bu anlar arşivde kalır. Disk kullanımını düzenli kontrol edin ve arşivi yedekleyin. Panelden çıkarılmış bir maç sonradan biterse arşivin final sonucu ayrıca tamamlanmaya ihtiyaç duyabilir; bütün arşiv etiketlerinin otomatik tamamlandığını varsaymayın.

V20 uygun adayı için taze istatistik/oran ve son fixture kontrolü ek API isteği doğurabilir; günlük maliyet aday sayısına bağlıdır. Kaynakların yerel alınma zamanları kaydedilir. Sağlayıcının gerçek yayın gecikmesi bilinmediğinden bu kontroller kusursuz eşzamanlılık veya her fiyatın oynanabilirliğini garanti etmez.

## Sonuçları nasıl değerlendirelim?

Geliştirme döneminin başarısı bağımsız başarı kanıtı değildir. 8 Eylül ayrılmış örneği yalnız 2 sinyal verdi: 1 kazanan / 1 kaybeden, teorik ROI −%16,7. V20'nin üstünlüğü henüz doğrulanmadı. Sonuçlara göre eşikleri günlük oynatmadan yeni canlı günlerin V20 JSON'unu, tam-stat arşivini ve mevcut V19 sonuçlarını birlikte değerlendirin.

Ayrıntılı eğitim/test raporu paketteki `V20_INCELEME_VE_KURULUM_2026-09-09.md` dosyasındadır. Belirli bir günlük başarı veya azami kayıp sayısı taahhüt edilmez.
