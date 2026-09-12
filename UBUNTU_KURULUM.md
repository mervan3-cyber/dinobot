# V21.1 — ÜST / 3/3 / EDGE −5…0 denemesini Ubuntu'ya yükleme

Bu paket önceki V21'e göre **yalnız V21 deneyini daraltır**: ÜST, Dino/V16/V18'in üçü de >%50, Pre >%50, −5 ≤ kayıt EDGE ≤ 0. Telegram'daki V19 mevcut ÜST kuralları + Legacy V17 yalnız 2.5 ÜST seçimi değişmez. V21 hâlâ yalnız Test Lab'dadır. Yeni Çekirdek, V20 ve V19/V17 lab politikaları değişmedi.

Eski V21 geçmiş dosyası aynı yerde korunur. Yeni kart ve normal JSON/CSV yalnız yeni tarifeyi gösterir. **Eski V21 JSON** düğmesi önceki tarifelerin tüm tarihlerdeki kayıtlarını indirir. Eski ve yeni kayıtlar aynı güne denk gelse bile sonuçlar karışmaz. Eski bekleyen sonuçlar güncellenmeye devam eder; eski kayıtların maç kilitleri yeniden başlatmada da korunur. Yeni V21 kartının ilk uygun sinyale kadar sıfır göstermesi veri silindiği anlamına gelmez.

Kod henüz sunucunuza yüklenmedi. Paketi açmak için önce mevcut uygulama dizininizin ve çalışan sürümünüzün yedeğini alın. `.env`, `dino_data.json`, bütün sinyal/aday/gölge geçmişleri, API cache dosyaları ve `v20_snapshot_archive` özellikle korunmalıdır. ZIP bunları içermez. Uygulama klasörünü silmeyin; boş klasörle değiştirmeyin.

## Güncelleme

Aşağıdaki `/root/dinobot` ve PM2 adı `dinobot`, yalnız mevcut kurulumunuz gerçekten bu adları kullanıyorsa geçerlidir. Farklıysa kendi uygulama yolunuzu ve PM2 adınızı kullanın.

1. Yedeği aldıktan sonra `pm2 stop dinobot` ile mevcut süreci durdurun.
2. `dinobot-v21-1-ust-3onay-edge-eksi5-0-ubuntu-2026-09-13.zip` içindeki dosyaları mevcut uygulama dizinine açın. Yalnız HTML değil, ZIP'teki bütün kod/model dosyaları gerekir. Yeni `v21_history.js` dosyası da mutlaka yüklenmeli; `public/index.html` de yenilenmelidir.
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

- Log ve `/api/status` build değeri: `ml-v21-1-over-3of3-edge-m5-0-ubuntu-2026-09-13`.
- Telegram yönlendiricisi mevcut V19 2.5/4.5 ÜST + Legacy V17 2.5 ÜST olarak görünmeli.
- Paneli sert yenileyin. Test Lab'da V19 bağımsız lab, V20, Yeni Çekirdek, Legacy V17 ve V21 bulunmalı. Ham Gözlem bulunmamalı.
- V21: yalnız ÜST, Pre >%50, Dino/V16/V18'in üçü de >%50, −5 ≤ kayıt EDGE ≤ 0, dakika 25–80, oran 1.50–4.00. Pre için %80 tavanı veya modellere %55 sınırı eklenmedi. Henüz uygun canlı sinyal olmaması tek başına arıza değildir.
- V19 ve V21 geçmiş dosyalarının uygulama kullanıcısı tarafından yazılabildiğini kontrol edin. `dino_v21_consensus_shadow_history.json` dosyasını silmeyin veya boşaltmayın: eski sonuçlar ve maç kilitleri burada korunur. Özel geçmiş yolu kullanan ortam değişkenleri aynı şekilde çalışır.
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

Kural ayrıntıları ve doğrulama kapsamı: `V21_1_DEGISIKLIKLER_2026-09-13.md`. Yeni sistemin kârlılığı henüz kanıtlanmış değildir; V21'i ileri testte değerlendirin. Yeni tarife etiketi `v21-over-consensus-3of3-edge-m5-0-2026-09-13` olmalıdır. Yarın rapor için normal V21 JSON'u ve o günün tam-stat JSON'unu indirin; önceden üretilmiş sonuçlar yeni kurala taşınmaz.
