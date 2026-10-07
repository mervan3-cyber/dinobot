# Kuponlarım / Showroom — Kağıt tasarımı

8 Ekim 2026. Mevcut Banko manuel seçim takibi kurulumu üzerine uygulanacak güncellemedir; tam bot değildir. Yeni paket veya .env ayarı gerekmez. Sunucuya otomatik yüklenmedi.

## Kullanım

1. Ana / yedek / analiz seçeneklerini **Seçimlerime** kaydedin. Gerçek oynadığınız oranı girin; aynı kuponun maçlarına aynı etiketi yazın. **ORAN / ETİKETİ KAYDET** ile eski seçimlerin etiketini de değiştirebilirsiniz.
2. Aynı günün tüm tarama sürümlerindeki aynı etiketli kayıtlar **Kuponlarım / Showroom** altında tek gruptur. Üç veya daha fazla maç eklenebilir; etiketsiz kayıtlar ayrı kalır. Otomatik Banko kuponları buraya kendiliğinden eklenmez.
3. Paylaşmak istediğiniz grupları işaretleyip **SEÇİLİLERİ GÖSTER** düğmesine basın. Kağıt görünümünü yalnız işaretlediğiniz gruplar için görürsünüz.
4. **PNG İNDİR** tek görseli indirir. Çok grup / çok sayfa seçiliyse PNG'ler tek ZIP içinde gelir; ZIP'i açıp görselleri Telegram'a toplu ekleyebilirsiniz. Bir grupta beşten fazla maç varsa, görsel çok uzamasın diye sayfalara bölünür; bu bir maç sayısı sınırı değildir.
5. **TELEGRAM METNİNİ KOPYALA** aynı seçili grupların metnini hazırlar. IP / HTTP nedeniyle panoya erişim engellenirse metin seçilir; Ctrl+C ile kopyalayın. Hiçbir düğme Telegram'a otomatik göndermez veya gerçek bahis oluşturmaz.
6. Sonuçlar mevcut **SONUÇLARI GETİR · MANUEL** düğmesiyle güncellenir; Showroom yeni sonuç sorgusu veya arka plan işi eklemez.

## İçerik / kayıt davranışı

- Logosu olmayan açık renk Kağıt görünümü; büyük, kapsamı açık market adı, yeşil oynanan oran ve büyük toplam oynanan oran.
- Ev / deplasman için son 5 ve son 20 lig maçının atılan / yenilen gol ortalamaları, maç başına değerlerdir. Örneklem eksikse gerçek maç sayısı yazılır: **Son 20 · 9 maç** gibi. Olmayan bilgi **—** olur; sıfır veri uydurulmaz.
- Beklenen gol, özgün maç önü analizinin ev + deplasman model toplamıdır; **Modelin beklediği toplam gol / Maçın tamamı** diye gösterilir. İlk yarı marketinde de bu değer maçın tamamını anlatır. Sonradan yeni model çalıştırılmaz.
- Yeni seçimde küçük bir istatistik özeti mevcut Banko JSON'una kaydedilir. Eski seçimler kendi özgün tarama sürümünden okunur; en yeni taramayla karıştırılmaz ve okuma sırasında dosya göçü yapılmaz. Özgün sürüm bulunamazsa bilgiler boş görünür; API'den tamamlanmaz.
- API oranı, oynanan oran yerine kullanılmaz. Bir ayakta oynanan oran eksikse toplam hesaplanmaz. Aynı maçta farklı marketler varsa kupon gibi çarpım / toplu sonuç hesaplanmaz. Aynı maçın eşdeğer sürüm kayıtları tekilleştirilir; en son düzenlenen kayıt kullanılır ve panelde bildirilir.
- Grup sonucu mevcut manuel ayak sonuçlarından türetilir. Bir kayıp varsa grup kayıp, tüm ayaklar kazandıysa kazandı; kalanlar bekliyor. Model onayı veya yeni kontrol anlamına gelmez. Başladıktan sonra kaydedilmiş seçimler panelde ayrıca uyarılır.
- Kullanıcının kaldırdığı açıklama paragrafları PNG ve metne konmadı. Panelde mevcut model / veri / manuel takip uyarıları korunur. Exportta IP, panel bağlantısı, logo, ham model başarı yüzdesi veya yeni API verisi yoktur.

## Kaynak kullanımı / değişmeyenler

PNG, yalnız düğmeye basıldığında sizin tarayıcınızın Canvas özelliğiyle hazırlanır; sunucuda görsel oluşturma, logo indirme veya RAM önbelleği yoktur. Oluşturulan Canvas bitmap'i işlem sonunda serbest bırakılır. Yeni bağımlılık eklenmedi. Seçilen grup kimlikleri tarayıcıdaki localStorage'da tutulur; her kullanıcının / cihazın tercihi ayrıdır.

`server.js`, `banko_model.js`, canlı tarama, V24, Telegram, erken YAKALADIK ve paylaşılan sinyal akışları değişmedi. Banko karar / model / eşik / otomatik kupon mantığı da değişmedi. Günlük API bütçesi 2000 ve canlı rezervi 1500 varsayılanları aynıdır; kayıtlı ayarlar üzerine yazılmaz. Paket yalnız Banko paneli, manuel kayıt özeti ve ilgili test dosyalarını içerir.

## Yükleme

1. Değişecek kod dosyalarını ve mevcut Banko kayıtlarınızı yedekleyin.
2. ZIP'i bot köküne, **public/** yapısını koruyarak uygulayın. Klasörleri topluca silmeyin.
3. Backend değiştiği için botu mevcut yönteminizle yeniden başlatın; panelde **Ctrl+F5** yapın. Aktif canlı / Banko işlemi varsa bitmesini bekleyin. Yeniden başlatma geçmişi korur ancak yarım taramayı otomatik sürdürmez.
4. `.env`, `node_modules`, `dino_banko_coupon_v1.json`, `dino_banko_api_usage.json` ve `dino_banko_cache_v1.json` dosyalarını silmeyin / üzerine yazmayın. Paket bu dosyaları içermez.

## Doğrulama

53 çevrimdışı / mock test betiği: mevcut canlı / V24 / Telegram ve Banko testleriyle birlikte, gün / etiket gruplama, üç ve daha fazla ayak, özgün sürüm bağlamı, donmuş istatistik özeti, boş / sıfır / kısmi örneklem, gerçek oynanan oran, eşdeğer kayıt tekilleştirme, aynı maç çatışması, PNG sayfalama, ZIP CRC ve yeniden başlatma senaryoları.

Gerçek panel varlıkları sahte kayıtlı yerel headless tarayıcıda kontrol edilir: grup seçimi, 1080px PNG, çoklu ZIP, metin kopyalama alternatifi, 390 / 320px mobil görünüm ve metin güvenliği. Gerçek API veya Telegram çağrısı yapılmaz. ZIP uygulanmış kopyanın test raporu paketin yanındadır.
