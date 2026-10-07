# Maç Yakala — yeni panel / Açık ve Koyu tema

8 Ekim 2026. Bu, mevcut güncel V24 + Banko + Kağıt Showroom kurulumu üzerine uygulanan **panel güncellemesidir**, tam bot değildir. Sunucuya otomatik yüklenmedi. Backend, canlı tarama, V24 kararları ve Telegram akışı değiştirilmedi.

## Yeni yerleşim

- **Bugün:** sistem durumu, kota, sonraki tarama, manuel tarama ve mevcut sinyal görünümünün özeti. Özet seçili sinyal tarihi / tüm veriler kapsamındadır; geçmiş toplamı bugünün sonucu gibi sunulmaz.
- **Sinyaller:** yalnız mevcut başarılı Telegram paylaşım kayıtları. LAB adayı, gönderilmiş kayıt diye eklenmez.
- **Canlı maçlar:** lig kapsamı, gerçekten gelen istatistikler, arama ve filtreler.
- **Kuponlar:** Banko ve İY/MS LAB ayrı. Banko altında **Analizler / Otomatik kuponlar / Seçimlerim / Showroom / Ayarlar** sekmeleri.
- **LAB / Denetim:** varsayılan V24 Ana; model seçicisinden Gemini, Odak, Quiet, Seçici, V24/V25, Eski Telegram, V22, V21 veya tüm modeller. Tam-stat denetimi ayrı sekmede. Modellerin veri toplamaları / çalışma zamanları değişmez.
- **Sistem:** paylaşım hedefleri, zamanlayıcı, salt okunur V24 kuralları ve sistem günlüğü.

Masaüstünde sol menü; telefonda **Menü** düğmesi. Uzun tablolar kendi alanlarında yana kayar. Kurallar ve açıklamalar korunur; tekrar eden Banko uyarıları tek kutuda, yardımcı açıklamalar açılır ayrıntıda bulunur. Analizde açtığınız maç aynı oturum / sürüm için yeniden çizildiğinde açık kalır.

## Tema

Sağ üst köşede **Açık / Koyu**. İlk açılış açık, sonraki açılışlarda tercih hatırlanır. Giriş ekranında da çalışır. Son ziyaret edilen ana ekran ve alt sekmeler de hatırlanır.

Tercihler yalnız o tarayıcıdaki localStorage'a birkaç küçük metin olarak kaydedilir; sunucu RAM önbelleği veya yeni API isteği yoktur. Tarayıcı depolamayı engelliyorsa düğmeler çalışır ama tercih sonraki açılışa taşınmaz. Kağıt showroom görseli her iki temada da açık tasarımdır; PNG içeriği değişmez.

## Korunan işleyiş

Backend kodları, modeller / eşikler, API bütçeleri, kadın ligi ayarı, prematch koşulları, maç kilitleri, taze doğrulama, Telegram / ek grup gönderimleri, erken YAKALADIK, paylaşılan sinyal ve kupon sonuçlandırma mantığı aynı kalır. Mevcut oturum açma / istek güvenliği korunur.

Görünüm / tema / model seçicisi yalnız DOM görünürlüğünü değiştirir. Sekmeler arasında geçiş motoru durdurmaz ve yeni tarama başlatmaz. Mevcut panel durum yenileme aralıkları aynıdır; gizlenen bölümün motorunu kapatmak veya RAM tasarrufu yapmak bu güncellemenin işi değildir.

Kayıtlar silinmez, yeniden sınıflandırılmaz veya göç ettirilmez. Kupon ayarlarını değiştirip kaydetmedikçe mevcut ayarlar değişmez. Showroom seçimleri, PNG / ZIP / metin işlevleri korunur; kendiliğinden Telegram'a göndermez.

## Yükleme

1. Mevcut `index.html`, değişecek `public/` dosyaları ve `package.json` için yedek alın.
2. ZIP'i bot köküne, **public/** klasör yapısını koruyarak uygulayın. Mevcut klasörleri / kayıtları topluca silmeyin. Bu paket backend dosyası veya kayıt JSON'u içermez.
3. Paneli sunucu adresinden açıp **Ctrl+F5** yapın. Mevcut Express statik dosya sunumunda botu yeniden başlatmak gerekmez; canlı taramayı kesmeyin. Tarayıcı önbelleğine karşı değişen dosyalarda sürüm eki kullanılmıştır.
4. `.env`, `node_modules` ve tüm çalışma kayıtlarını olduğu gibi bırakın. Yeni paket kurulumu, domain veya ek API ayarı gerekmez. Bu ZIP, önceki Kağıt Showroom / güncel Banko kurulumunun yerine geçen tam kurulum değildir.
5. Geri dönmek gerekirse yalnız değiştirdiğiniz panel dosyalarını yedekten geri koyup Ctrl+F5 yapın; kayıt dosyalarına dokunmayın.

`npm run test:panel` tema / panel sözleşmelerini; `npm run test:all` mevcut ana + Banko testlerini çalıştırır. Burada ek güvenlik testleriyle toplam 54 çevrimdışı betik kontrol edildi. Paket çıkarılıp önceki sürüm üzerine uygulandıktan sonra aynı testler tekrar edilir.

## Doğrulama

Tam HTML ve gerçek JS / CSS varlıkları yerel headless Chrome'da sahte kayıtlarla kontrol edildi: iki tema, altı ana ekran, dokuz LAB modeli, Banko alt sekmeleri, klavye gezintisi, eski tarama / manuel kayıtlar, kaydedilmemiş ayarlar, mevcut yerel ayar kaydetme uç noktası, Kağıt PNG ve 390 / 320 piksel mobil yerleşim. Tema / görünüm geçişlerinde API çağrısı yoktur. Gerçek API, Telegram veya sunucu dağıtımı yapılmadı.

Başlıca metinler açık ve koyu temada hesaplanmış kontrast açısından kontrol edildi. Test ekranlarındaki örnek veriler gerçek performans sonucu değildir. Native dosya indirme için önceki özellik aynen korunur; bu ortamda PNG'nin uygulamanın ürettiği gerçek 1080px yükü doğrulandı.
