# V21 — mevcut Ubuntu kurulumunu güncelleme

Bu paket **Telegram seçimini değiştirir**: V19 mevcut ÜST kuralları + Legacy V17 yalnız 2.5 ÜST. V21 ise yalnız Test Lab'da ÜST/ALT uzlaşması olarak çalışır. Yeni çekirdek, V20 ve Legacy V17 labları korunur; V19 için bağımsız lab geçmişi açılır.

Kod henüz sunucunuza yüklenmedi. Paketi açmak için önce mevcut uygulama dizininizin ve çalışan sürümünüzün yedeğini alın. `.env`, `dino_data.json`, bütün sinyal/aday/gölge geçmişleri, API cache dosyaları ve `v20_snapshot_archive` özellikle korunmalıdır. ZIP bunları içermez. Uygulama klasörünü silmeyin; boş klasörle değiştirmeyin.

## Güncelleme

Aşağıdaki `/root/dinobot` ve PM2 adı `dinobot`, yalnız mevcut kurulumunuz gerçekten bu adları kullanıyorsa geçerlidir. Farklıysa kendi uygulama yolunuzu ve PM2 adınızı kullanın.

1. Yedeği aldıktan sonra `pm2 stop dinobot` ile mevcut süreci durdurun.
2. `dinobot-v21-test-lab-ust-telegram-ubuntu-2026-09-12.zip` içindeki dosyaları mevcut uygulama dizinine açın. Yalnız HTML değil, ZIP'teki bütün kod/model dosyaları gerekir. `public/index.html` de yenilenmelidir.
3. Uygulama dizininde doğrulayın:

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

Bir kontrol başarısızsa yeni sürümü başlatmayın; aldığınız kod yedeğine dönüp mevcut geçmişleri koruyun. Paket bağımlılık sürümlerini değiştirmez. Python standart kütüphane kullanır; eğitim kütüphaneleri sunucuda gerekmez. Yerel test ortamı Node v24.19.0'dır; sunucudaki Node sürümü bu kodun gerektirdiği modern Node özelliklerini desteklemelidir.

## Açılışta kontrol

- Log ve `/api/status` build değeri: `ml-v21-lab-over-telegram-ubuntu-2026-09-12`.
- Telegram yönlendiricisi mevcut V19 2.5/4.5 ÜST + Legacy V17 2.5 ÜST olarak görünmeli.
- Paneli sert yenileyin. Test Lab'da V19 bağımsız lab, V20, Yeni Çekirdek, Legacy V17 ve V21 bulunmalı. Ham Gözlem bulunmamalı.
- V21: Pre >%50, Dino/V16/V18'den 2/3 >%50, kayıt EDGE ≤+1, dakika 25–80, oran 1.50–4.00. Henüz uygun canlı sinyal olmaması tek başına arıza değildir.
- Yeni V19 ve V21 geçmiş dosyalarının uygulama kullanıcısı tarafından yazılabildiğini kontrol edin. Dosyaları silmek tekrar kilidini kaybettirir.
- Shared sinyal takibi yalnız Telegram'ın başarılı gönderimlerini içerir. V19 labı tüm mevcut marketleri test ettiği için iki tablo artık birebir aynı olmak zorunda değildir.

## Ortam değişkenleri

Varsayılanlar yeni kurulum için yeterlidir. `.env` otomatik değiştirilmez; anahtarlar korunur.

- `DINO_V21_SHADOW_ENABLED` ve `DINO_V19_SHADOW_ENABLED`: varsayılan `true`. Yalnız ilgili lab kolunu kapatmak için `false`.
- `DINO_V21_SHADOW_HISTORY_FILE` ve `DINO_V19_SHADOW_HISTORY_FILE`: istenirse özel, yazılabilir geçmiş yolu.
- Mevcut `DINO_V20_SHADOW_ENABLED`, `DINO_CORE_SHADOW_ENABLED`, `DINO_LEGACY_V17_SHADOW_ENABLED` korunur; hepsinin labda çalışmasını istiyorsanız açık olmalıdır.
- Önceden `DINO_HYBRID_TARIFF_ENABLED=false` veya `DINO_V2_SELECTOR_ENABLED=false` ayarladıysanız Telegram'ın yeni yönlendiricisini kullanmak için bunları `true` yapın. Eski alternatif modlar yeni Telegram son kapısından sessizce başka market gönderemez.
- Ortam değişkenini değiştirirseniz PM2 için `pm2 restart dinobot --update-env` kullanmanız gerekebilir.

V21 ve bağımsız V19 uygun adayları, Telegram adayı olmasa da taze kontrol isteği oluşturabilir. Günlük API ve disk tüketimini izleyin. Bu kod taze veri kontrollerini kaldırmaz veya kotayı sınırsız artırmaz.

Eski Ham Gözlem dosyası varsa yedek/arşiv olarak bırakılır; yeni kod onu okumaz. Geçmişiniz fiziksel olarak silinmez.

Kural ayrıntıları ve doğrulama kapsamı: `V21_DEGISIKLIKLER_2026-09-12.md`. Yeni sistemin kârlılığı henüz kanıtlanmış değildir; V21'i ileri testte değerlendirin.
