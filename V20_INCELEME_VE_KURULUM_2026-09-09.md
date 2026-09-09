# V20 — eğitim, gerçekçi geçmiş testi ve kurulum

V20 oluşturuldu ve ayrı bir gölge test koluna bağlandı. İstenen %70–80 başarı düzeyinin gelecekte sürdüğünü henüz doğrulayamadık. Geliştirme dönemindeki iyi sonucu yeni günün küçük örneğiyle karıştırmamak gerekiyor.

| Dönem | Amaç | Sinyal | Kazanan / kaybeden | Başarı | ROI | Ort. oran |
|---|---|---:|---:|---:|---:|---:|
| 29 Ağustos–7 Eylül | Tüm geliştirme geçmişi; bağımsız test değildir | 64 | 44 / 20 | %68,8 | %11,3 | 1,623 |
| 4–7 Eylül | Kuralın seçildiği geliştirme dönemi | 24 | 21 / 3 | %87,5 | %44,6 | 1,649 |
| 8 Eylül | İlk sonuç görüldükten sonra teknik düzeltmeyle yeniden hesaplanan gün | 2 | 1 / 1 | %50,0 | %-16,7 | 1,733 |

4–7 Eylül tablosu, 50 önceden tanımlı genel kural arasından seçildiği için iyimser olabilir. 8 Eylül dışa aktarımı 19 maç içeriyor; önceki günlerde görülen 1 maç dışarıda bırakıldı. Sonuçlanmamış kayıtlar kayıp ya da kazanç yazılmadı. İki sinyalli son test, günlük maksimum kayıp sözü vermek için yeterli değildir.

Bunlar kaydedilmiş oran ve tarama anlarından yapılan simülasyonlardır; yeni tazelik/son fixture kontrollerinin geçmişte de geçtiği iddia edilmiyor. Eski arşivde kaynak bazında alınma/yayın zamanları yok. Canlı gölgede bu kontroller sinyali azaltabilir veya seçilecek anı değiştirebilir. Her sinyale 1 birim yatırıldığı varsayıldı; aynı maçın tekrar taranması ayrı bahis sayılmadı.

## Veri ve eğitim

26 Ağustos–7 Eylül: 70.421 market kaydı, 784 farklı maç, 5.417 tarama anı. Eski politikanın seçtiği maçlarda yaptığı ek doğrulama taramalarının 1.404 satırı çıkarıldı; 5309 normal tarama anı kaldı. Aynı maçın farklı dakikaları eğitim ve test tarafına bölünmedi.

ÜST modeli 752 farklı maç / 16712 market anı; 1-X-2 modeli 754 farklı maç / 5015 tarama anıyla eğitildi. Bir maçın çok fazla satırı olması ona orantısız eğitim ağırlığı vermiyor.

Bütün mevcut dakikalar kullanıldı. Arşivdeki gözlemler zaten 25–80. dakika arasında: bu dosyalardan 1–24 veya 81+ için öğrenilmiş başarı iddiası çıkarılamaz. Eğitim ilk üç günle başlayıp sonraki günleri önceki günlerden öğrendi; 29 Ağustos öncesi eğitim verisine eğitim-içi başarı tablosu yazılmadı.

Yalnız normal süre FT sonucu açıkça mevcut etiketler kullanıldı. Uzatma/penaltı bitişli 11 maçın eski kayıtları normal süre açısından yeterince kesin olmadığı için eğitim etiketinden çıkarıldı. Canlı skoru finalden yüksek, sonucu çelişkili veya bekleyen anlar da eğitim hedefi yapılmadı. Sonuç/karar/Telegram/EDGE gibi geleceği veya eski seçimi anlatan alanlar yeni modele girdi olmadı.

Gece yarısı sınırında önceki maçın sonraki ana taşınması için son gözlemden iki saatlik ayırma payı kullanıldı. Eski sonuçlandırma zamanları bazen sonradan topluca güncellendiğinden geçmişte sonucun kesin öğrenilme anını eksiksiz yeniden kuramıyoruz; bu bir tarihsel simülasyon sınırlamasıdır.

Son kontrol düzeltmesi: günlük eğitim/test turlarındaki iki saatlik ayırma payının son test için üretilen tek modelde uygulanmadığı görüldü. Son model için 8 Eylül Türkiye takvim günü başlangıcından iki saat önceki 7 Eylül 19:00 UTC sınırı kullanıldı; son gözlemi bu sınırdan önce olmayan 16 maç eğitimden çıkarıldı. Günlük turlar ilk değerlendirme gözleminden iki saat öncesini kullanır; son modelin takvim günü sınırı en az bu kadar ihtiyatlıdır. Aynı model türü, aynı özellik tasarımı, aynı 200 ceza değeri ve aynı sinyal kuralıyla yeniden hesaplandı; katsayılar kalan eğitim verisinden yeniden öğrenildi. İlk 8 Eylül sonucu (1 kazanan / 1 kaybeden; ROI %-16,7) saklandı; tablodaki sonuç düzeltilmiş hesaptır. Bu düzeltme ilk sonuç görüldükten sonra yapıldığı için ikinci bir hiç-görülmemiş test değildir.

## V20 nasıl karar veriyor?

Seçilen aday, canlı oranın ima ettiği olasılığı başlangıç alıp canlı istatistiklerle küçük ve güçlü biçimde sınırlandırılmış düzeltmeler öğreniyor. İki ayrı model var: ÜST gol çizgileri için ortak model ve MS1/X/MS2 için toplamı %100 olan sonuç modeli. Bu yapı eski Dino yüzdesini girdi olarak kullanmıyor.

Kullanılan alanlar: dakika/kalan süre, skor ve farkı; iki takımın şutları, isabetli şutları, kornerleri, topa sahip olma, sarı/kırmızı kart, faul, ofsayt ve kurtarışları; bunların toplam/fark/tempo değerleri, şut isabet oranları ve uygun önceki taramadan gelen değişimler. Eksik veri sıfır kabul edilmiyor. Sayacı gerileyen bir istatistiğin o aralıktaki değişimi güvenilir sayılmıyor. Devre arası veya aynı dakika üzerinden sahte tempo üretilmiyor.

İlgili ÜST çizgisi zaten aşılmışsa aday değil. Düşük gol çizgisinin ÜST olasılığı yüksek çizgiden küçük olamıyor. Önce aynı andaki uygun seçenekler sıralanıyor; en yüksek olasılık, eşitlikte beklenen değer ve sabit market sırası kullanılıyor.

## Pre-match, API tahmini, xG

- Pre-match 1-X-2 ve ilgili toplam gol marketinin desteği denendi. Bu veri setinde tutarlı, yeterli ek iyileşme göstermediği için final V20 kararına katılmadı.
- Takım/API bağlamı, aynı bağlamı bulunan maçlarda ayrıca karşılaştırıldı. Sonuç modelinde ilk dönemde küçük fayda gösterirken sonraki dönemde olasılık hatasını artırdı; final V20 bu alanları kullanmıyor. Eski sistemin bazı adaylarda toplaması da bağımsız katkı ölçümünü zorlaştırıyor.
- İki takımda xG yalnız %23,96 taramada var; 2–7 Eylül günlerinde hiç yok. xG’li seçenek denendi fakat final modele alınmadı. Dolayısıyla bu sürüm için “xG okuyarak seçiyor” demek doğru olmaz.
- Kesin şut zamanı, şutun konumu/açısı veya son 5 dakika içinde hangi olayın golü doğurduğu arşivde yok. Yaklaşık 10 dakikalık tarama aralıklarından bu olayları varmış gibi üretmedim.

## Sabit gölge kuralı

| Alan | Değer |
|---|---|
| Marketler | 0.5/1.5/2.5/3.5/4.5 ÜST ve MS1/X/MS2 |
| ALT | Kapalı |
| Dakika | 25–80 |
| Oran | 1.50–4.00 |
| V20 olasılığı | En az %70 |
| V20 ham EDGE | En az +10 yüzde puan |
| Maç başına | En fazla 1 sinyal |
| Telegram | V20 göndermez; bağımsız gölge |

EDGE = V20 olasılığı − 100/oran. Örneğin 1.50 oranda %70 yetmez: +10 puan EDGE için yaklaşık %76,67 gerekir. Beklenen değer = olasılık × oran − 1. Bunlar modelin tahminidir; kesin getiri değildir.

Dakika-market başına küçük örneklere özel onlarca yeni pencere seçilmedi. Aşağıdaki kırılımlar değerlendirme içindir; başarılı görünen küçük satırlar sonradan ayrı bir filtreye dönüştürülmedi.

### 4–7 Eylül günlük sonuç

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 2026-09-04 | 3 | 3 / 0 | %66,6 | 1,666 |
| 2026-09-06 | 15 | 14 / 1 | %55,4 | 1,654 |
| 2026-09-07 | 6 | 4 / 2 | %6,7 | 1,629 |

### 4–7 Eylül market sonuçları

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 2.5_UST | 1 | 1 / 0 | %67,5 | 1,675 |
| MS1 | 6 | 6 / 0 | %64,4 | 1,644 |
| MS2 | 15 | 12 / 3 | %30,7 | 1,632 |
| X | 2 | 2 / 0 | %78,3 | 1,784 |

### 4–7 Eylül dakika aralıkları

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 25-39 | 8 | 8 / 0 | %70,5 | 1,705 |
| 40-54 | 9 | 8 / 1 | %44,1 | 1,616 |
| 55-69 | 6 | 4 / 2 | %8,1 | 1,631 |
| 70-80 | 1 | 1 / 0 | %61,5 | 1,615 |

### 29 Ağustos–7 Eylül bütün günlük sonuçlar

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 2026-08-29 | 8 | 1 / 7 | %-80,8 | 1,609 |
| 2026-08-30 | 23 | 17 / 6 | %19,0 | 1,616 |
| 2026-08-31 | 6 | 3 / 3 | %-22,8 | 1,622 |
| 2026-09-02 | 1 | 0 / 1 | %-100,0 | 1,500 |
| 2026-09-03 | 2 | 2 / 0 | %50,0 | 1,500 |
| 2026-09-04 | 3 | 3 / 0 | %66,6 | 1,666 |
| 2026-09-06 | 15 | 14 / 1 | %55,4 | 1,654 |
| 2026-09-07 | 6 | 4 / 2 | %6,7 | 1,629 |

Tablolarda sinyal çıkmayan gruplar gösterilmez; gösterilmemeleri o gün veya marketin başarılı olduğu anlamına gelmez.

### 29 Ağustos–7 Eylül bütün marketler

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 1.5_UST | 1 | 1 / 0 | %65,0 | 1,650 |
| 2.5_UST | 10 | 7 / 3 | %13,4 | 1,631 |
| 3.5_UST | 7 | 4 / 3 | %-9,3 | 1,574 |
| 4.5_UST | 9 | 6 / 3 | %5,2 | 1,617 |
| MS1 | 14 | 6 / 8 | %-29,5 | 1,634 |
| MS2 | 20 | 17 / 3 | %37,5 | 1,619 |
| X | 3 | 3 / 0 | %68,9 | 1,689 |

### 29 Ağustos–7 Eylül dakika aralıkları

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 25-39 | 25 | 18 / 7 | %18,9 | 1,642 |
| 40-54 | 26 | 17 / 9 | %4,3 | 1,607 |
| 55-69 | 8 | 5 / 3 | %1,9 | 1,640 |
| 70-80 | 5 | 4 / 1 | %25,0 | 1,583 |

### 29 Ağustos–7 Eylül V20 olasılık aralıkları

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 0.70-0.749 | 35 | 23 / 12 | %10,0 | 1,685 |
| 0.75-0.799 | 23 | 16 / 7 | %8,9 | 1,552 |
| 0.80-0.899 | 6 | 5 / 1 | %28,1 | 1,531 |

### 29 Ağustos–7 Eylül oran aralıkları

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 1.50-1.59 | 28 | 20 / 8 | %9,5 | 1,529 |
| 1.60-1.79 | 31 | 21 / 10 | %12,4 | 1,668 |
| 1.80-1.99 | 5 | 3 / 2 | %14,7 | 1,867 |

### 29 Ağustos–7 Eylül V20 EDGE aralıkları

| Aralık / market | Sinyal | Kazanan / kaybeden | ROI | Ort. oran |
|---|---:|---:|---:|---:|
| 0.10+ | 64 | 44 / 20 | %11,3 | 1,623 |

## İkinci sinyal

Aynı kural, ilk sinyalden en az 10 maç dakikası sonra başka marketi seçebilecek şekilde de denendi. Tüm geliştirme geçmişinde ek 1 sinyal: 1 kazanan / 0 kaybeden; ROI %70,0. 4–7 Eylül ve ayrılmış 8 Eylül testinde ikinci sinyal çıkmadı. İkinci sinyalin faydasını doğrulayamadığımız için çalışma paketinde maç başına bir hak var.

## Belirsizlik ve eski sistemle karşılaştırma

Geliştirmedeki 21/24 başarının %95 Wilson aralığı yaklaşık %69,0–%95,7. Bu aralık dahi politika seçimi etkisini temizlemez. Her kazanan orandan 0.03 düşürüldüğünde geliştirme ROI %42,0, yeni gün ROI %-18,2. Türkiye’deki gerçek oynanabilir fiyat eşleşmesi olmadığından bunlar garanti edilebilir kâr değildir.

Yeni modelin ÜST olasılıkları sonraki geliştirme döneminde eski Dino ve V16’dan biraz daha düşük hata verdi. 1-X-2’de eski Dino/V16 daha düşük olasılık hatasına sahipti. Piyasa olasılığını da her karşılaştırmada geçemedik. Dolayısıyla V20’nin bütün marketlerde eskisinden daha iyi olduğu iddiası desteklenmiyor.

### Aynı gözlemlerde olasılık hatası: 4–7 Eylül

Log loss daha düşük olduğunda tahmin hatası daha küçüktür. Bu tablo sinyal seçiminin kazanç tablosu değil, aday olasılıklarının karşılaştırmasıdır. Eksik eski model alanları olduğunda yalnız iki modelde de bulunan aynı gözlemler ölçülür.

| Market ailesi | Karşılaştırma | Farklı maç | Referans hata | V20 hata |
|---|---|---:|---:|---:|
| ÜST | Canlı fiyat (ham) | 253 | 0,5241 | 0,5231 |
| ÜST | Dino | 253 | 0,5450 | 0,5231 |
| ÜST | V16 | 253 | 0,5296 | 0,5231 |
| ÜST | V18 | 42 | 0,5136 | 0,4921 |
| MS1/X/MS2 | Canlı fiyat (karma kaynak, normalize) | 254 | 0,7163 | 0,7188 |
| MS1/X/MS2 | Dino | 255 | 0,7066 | 0,7258 |
| MS1/X/MS2 | V16 | 254 | 0,7047 | 0,7188 |
| MS1/X/MS2 | V18 | 42 | 0,7191 | 0,7464 |

Oranlar her zaman aynı bahis şirketinin eşzamanlı tamamlayıcı fiyatları değildir. Normalize piyasa karşılaştırması da gerçek doğru olasılık kabul edilmedi. Eski modellerin bu arşiv üzerindeki eğitim geçmişleri bağımsız olarak garanti edilemediği için bu karşılaştırma kontrollü yeni-model yarışması değildir.

## 8 Eylül seçilen iki maç

| Maç | Dakika | Skor | Market | V20 | EDGE | Oran | Sonuç | Final |
|---|---:|---|---|---:|---:|---:|---|---|
| Barracas Central - Argentinos JRS | 66 | 0-0 | X | %72,6 | 12,6 | 1,666 | Kazandı | 0-0 |
| Incheon United - Bucheon FC 1995 | 34 | 0-1 | MS2 | %73,7 | 18,1 | 1,800 | Kaybetti | 2-1 |

## Yazılımda düzeltilenler

Takımların istatistikleri dizi sırasına göre tahmin edilmek yerine kimlik/isim eşleştirmesiyle alınır. Taze sorguda bulunmayan ek istatistik eski değerle sessizce doldurulmaz. Kaynakların alınma zamanları ve kalite bilgileri saklanır. V20 kaydı taze kontrol gerektirir; eski modellerin reddi V20 değerlendirmesini kapatmaz. V20’nin geçmişi ayrı dosyada tutulur; yeniden başlatmada maç başına sinyal hakkı korunur.

Tam istatistik anları ayrıca Türkiye tarihine göre günlük, sona eklenen bir arşive yazılır. Böylece paneldeki geçmiş sınırı dolduğunda gelecek eğitim için eski anların kaybolması önlenir. Bu arşiv zamanla disk kullanır; mevcut maç kaydı ve API önbelleklerini silmek gerekmez.

Panelde ayrı V20 kartı/tablosu, ortak tarih filtresi, arama ve JSON/CSV dışa aktarımı var. V19, eski V17 ve mevcut diğer karşılaştırma kollarının sonuçları V20 ile karışmaz.

## Kurulum

Kurulum paketi yalnız uygulama kodu ve model/kuralları içerir. .env, mevcut sinyal geçmişleri ve önbellekler içermez. Sunucudaki bu dosyalar korunmalıdır. Paket, mevcut uygulama dizinine açılacak tam güncellemedir; bu değişiklik yalnız index dosyasından ibaret değildir.

Önce mevcut dinobot dizininin yedeğini alın. ZIP’i mevcut uygulama dizinine açın, `npm ci --omit=dev`, ardından `npm test` çalıştırın. Testler başarılıysa `pm2 restart dinobot` ve `pm2 save` kullanın. Başlangıç sürümü `ml-v20-independent-shadow-ubuntu-2026-09-09` olmalıdır. V20 model/politika yüklenmediyse panel bunu açıkça gösterir; rastgele bir varsayılan model kullanmaz. Ayrıntılı dağıtım/kalıcılık bilgisi paketin UBUNTU_KURULUM.md dosyasındadır.

V20 için yeni Python eğitim kütüphanesini sunucuya kurmak gerekmez: eğitim yerelde yapıldı, model küçük bir JSON olarak JavaScript tarafında çalışır. Eski sistemin mevcut Python gereksinimleri devam eder. V20 gölge kolu varsayılan açıktır; Telegram kararını V20’ye geçirmek bu paketin davranışı değildir.

Bundan sonraki karar, bu sabit modelin yeni canlı günlerdeki V20 kayıtlarıyla verilmeli. Bugünkü kötü/iyi birkaç sonuca göre aynı veride eşikleri tekrar oynatmak, önceki fazla iyimser sonuç sorununu yeniden üretir.
