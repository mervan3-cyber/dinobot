# V22 — A/B/C Test Lab; V21 korunur

Bu paket **V22'yi ayrı bir ileri test olarak ekler**. V21'in kuralları, geçmişi ve eski V21 arşivi korunur. Telegram'ın mevcut V19 2.5/4.5 ÜST + Legacy V17 2.5 ÜST yönlendirmesi değişmez. V22 Telegram'a gönderim yapmaz. Yeni Çekirdek, V20, V19 ve Legacy V17 laboratuvarları yerinde kalır.

Kod henüz sunucuya yüklenmedi. ZIP `.env`, API anahtarları, `dino_data.json`, sinyal/aday/lab geçmişleri, API cache dosyaları, `v20_snapshot_archive` veya `node_modules` içermez. **Mevcut uygulama klasörünü silmeyin.**

## Güncelleme

Aşağıdaki `/root/dinobot` ve PM2 adı `dinobot`, yalnız mevcut kurulumunuz bu adları kullanıyorsa geçerlidir.

1. `pm2 stop dinobot` ile süreci durdurun. Mevcut uygulama dizininin kod, `.env` ve bütün geçmiş dosyalarıyla birlikte yedeğini alın; yedeğin açılabildiğini kontrol edin. Yedeği uygulama klasörünün içine koymayın.
2. `dinobot-v22-abc-test-lab-v21-korunur-ubuntu-2026-09-13.zip` dosyasını mevcut uygulama dizinine açın; yalnız paketteki kod dosyalarının üzerine yazın. ZIP'teki bütün dosyalar gerekir. Özellikle yeni `v22_tariff.js`, `v22_lab.js`, güncel `server.js`, `signal_tracker.js` ve `public/index.html` yüklenmelidir. Mevcut `.env` ve geçmişler yerinde kalmalı.
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
pm2 logs dinobot --lines 50 --nostream
```

Testler başarısızsa yeni sürümü başlatmayın. Aldığınız kod yedeğine dönün; geçmiş dosyalarını silmeyin veya eski kopyalarla geriye almayın. Bağımlılık sürümleri değişmedi. Python standart kütüphane kullanır; eğitim kütüphaneleri sunucuda gerekmez. Testler çevrimdışı çalışır ve gerçek Telegram/API istekleri göndermez.

## Açılış kontrolü

- Build: `ml-v22-union-abc-lab-v21-preserved-ubuntu-2026-09-13`; paket sürümü `2.2.0`.
- Logda `V22 LAB: AÇIK`, `A/B/C OR` ve `Telegram YOK` görülmeli.
- Paneli sert yenileyin. Test Lab'da **V21'in yanında ayrı V22 kartı ve tablosu** bulunmalı. V21 geçmişi ve Eski V21 JSON düğmesi korunmalı.
- V22 ilk uygun canlı sinyale kadar sıfır görünür. Eski tam-stat veya V21 kayıtları V22'ye aktarılmaz; başlangıç tarihi ilk gerçek V22 kaydından gelir.
- V22 tablosunda giriş skoru, A/B/C etiketi, gereken gol, Dino/V16/V18, Pre Destek, EDGE, oran ve sonuç bulunur. JSON/CSV düğmeleri seçilen güne aittir.
- A/B/C özetlerinde aynı sinyal birden fazla etikete girebilir. **Filtre sayaçlarını toplamayın:** V22 genel toplamında maç başına yalnız bir kayıt vardır.
- Telegram'ın mevcut yönlendiricisi ve diğer laboratuvarlar değişmemeli. Ham Gözlem geri eklenmedi.

## V22 kuralları

Ortak şartlar: yalnız yarım gollü ÜST; **Dino, V16 ve V18 ayrı ayrı >%50**; dakika **25–80**, oran **1.50–4.00** dahil; market giriş skoruyla zaten kazanılmış olmamalı. EDGE, kayıttaki gibi `Dino − 100/oran` hesabının bir ondalığa yuvarlanmış değeridir.

| Filtre | Durum | EDGE, sınırlar dahil | Pre Destek |
|---|---|---|---|
| A | Ev sahibi önde → ÜST | −5 … −2.5 | >%20 |
| B | 2.5 ÜST; giriş skoru 1–0 veya 0–1 | −5 … −2.5 | >%40 |
| C | ÜST için yalnız bir gol daha gerekiyor | −10 … +5 | >%75 |

A, B **veya** C yeterlidir; üçünün aynı anda karşılanması gerekmez. Aynı maç için filtreler arasında ortak tek sinyal kilidi vardır; yeniden başlatmada da korunur. İlk uygun taze taramada, birden fazla market varsa oy sayısı azalan, oran artan, market adı artan sıralama kullanılır. V21 ve V22 maç kilitleri birbirinden bağımsızdır.

Sinyal kaydı öncesi taze skor/istatistik/oran kontrolü ve model yeniden hesaplaması gerekir. İlk taramada uygun görünen fakat taze kontrolde şartları kaybeden aday yazılmaz. Eksik model veya Pre desteği onay sayılmaz.

## Geçmiş, ayarlar ve raporlar

- V22'nin ayrı dosyası: `dino_v22_union_shadow_history.json`. İlk çalıştırmada oluşturulur. Uygulama kullanıcısının bu konuma yazabilmesi gerekir. Sonraki güncellemelerde bu dosyayı da yedekleyin ve koruyun.
- `dino_v21_consensus_shadow_history.json` aynen korunur. V22'yi başlatmak için V21 geçmişini sıfırlamayın.
- `DINO_V22_SHADOW_ENABLED`: varsayılan `true`; yalnız V22'yi kapatmak için `false`.
- `DINO_V22_SHADOW_HISTORY_FILE`: isteğe bağlı özel, yazılabilir yol. Başka bir deneyin veya aktif takip dosyasının yolunu kullanmayın; çakışırsa sunucu açılışta hata verir.
- Mevcut V21/V19/V20/Yeni Çekirdek/Legacy V17 ortam ayarları korunur. `.env` paket tarafından değiştirilmez. Ortam ayarı değiştirilirse `pm2 restart dinobot --update-env` gerekebilir.

V22 API'leri:

- `/api/v22-union-shadow-history`
- `/api/v22-union-shadow-history/export?date=2026-09-13`
- `/api/v22-union-shadow-history/export.csv?date=2026-09-13`
- `/api/test-lab-comparison` ve `/api/status` içinde `v22Shadow`.

V22 adayları, Telegram adayı olmasa da mevcut kotalar çerçevesinde taze API/Python doğrulaması isteyebilir. Günlük API ve disk tüketimini izleyin; veri doğrulama kontrolleri veya kota korumaları kaldırılmadı.

Sonraki değerlendirmede V22 JSON'unu ve aynı günün tam-stat JSON'unu alın; V21 karşılaştırması için V21 JSON'unu da ayrıca saklayın. Geçmiş örneklerdeki isabet gelecekteki sonuçların garantisi değildir; V22 yalnız ileri testtir.

Teknik değişiklikler: `V22_DEGISIKLIKLER_2026-09-13.md`. ZIP içindeki `V22_PACKAGE_MANIFEST.json` dosya SHA-256 değerlerini içerir. Eski V21 değişiklik notları yalnız geçmiş sürüm referansıdır; bu kurulum belgesi günceldir.
