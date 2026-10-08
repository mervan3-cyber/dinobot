# Banko PAS görünümü + uygun seçim sınırı + bütçede devam + Güç LAB

Bu tek paket, önceki `mac-yakala-banko-alt-filtre-2026-10-08.zip` ve `mac-yakala-banko-alt-ve-guc-lab-2026-10-08.zip` paketlerinin yerine geçer; onları ayrıca kurmanız gerekmez. Mevcut V24 + Banko + kağıt showroom + yenilenmiş panel kurulumuna yamadır, tam bot değildir.

## PAS görünümü, sayı ve aynı güne bağlı tarama

Analizler ve Model karşılaştırması listelerinde ana tahmini olan maçlar öndedir; kendi içlerinde başlangıç saatine göre erkenden geçe sıralanırlar. PAS kayıtları varsayılan gizlidir. PAS’ları göster kutusu açılırsa seçilenlerin ardından, kendi saat sıralarında görünürler. Arama ve sayfalama bu görünümü kullanır, ek API istemez. PAS kayıtları silinmez; sonuç özetleri görünüm filtresinden etkilenmez.

“En fazla uygun ana tahmin (PAS hariç)” alanına 100 yazmak, 100 incelenen maç değil en fazla 100 uygun ana seçim demektir. PAS ve yalnız LAB seçimi olan maçlar sayılmaz. Mevcut veri/oran/model eşikleri gevşetilmez. Seçili günün (TSİ) maçları tükenince örneğin 37/100 ile tamamlanır; ertesi güne veya başka tarihe geçilmez. Her taramanın özgün tarih, lig/market ayarları, üst sınırı ve geçmiş kesimi kaydedilir.

## API bütçesi dolduğunda Devam et

Günlük Banko bütçesi dolunca veya canlı API rezervine gelince tarama hata olarak iptal edilmez; “waiting-budget” durumuyla diske kaydedilir. Aynı sürümde DEVAM ET · AYNI TARAMA düğmesi görünür. Bütçe artırılıp kaydedildiğinde, günlük bütçe yenilendiğinde veya genel rezerv serbest kaldığında düğmeye manuel basın. Limitler atlanmaz; otomatik bekleyip API çağırma döngüsü yoktur.

Özgün tarama listesi/sırası, biten analizler, o maçta alınmış oran sayfaları ve eksik işlem noktası korunur. Biten analizler tekrar çekilmez; genel tarih/istatistik önbelleği de diske yazılır. Devam edilen sürüm model ayarlarının özgün fotoğrafını kullanır; değişen günlük bütçe ise güncel genel ayardan okunur. Başlamış maçlar atlanır, eskimiş oranlar yeni seçim sayılmaz. Ertesi gün Devam et dahi yalnız eski seçili günü bitirir; yeni güne maç eklemez. Güncel tahmin isteniyorsa ayrı yeni manuel tarama oluşturulmalıdır.

Yeni kayıt noktalı tarama sunucu yeniden başlasa da manuel devam edebilir. Ancak gönderildiği halde yanıtı doğrulanamayan API isteği varsa güvenlik için yeniden deneme/Devam et kapalıdır; yeni manuel tarama gerekir. Eski paketlerin kayıt noktası olmayan yarım taramalarına sonradan ilerleme uydurulmaz. Tarama tamamlanmadan otomatik kupon onayı verilmez. API sayacı yeniden başlatma ve devamda sıfırlanmaz.

## Nerede görünür?

Panel → Kuponlar → Banko → **Model karşılaştırması**. Aynı maçta mevcut model ile Güç LAB seçimi, ilk kayıt oranı, beklenen gol, kısa gerekçe ve ayrı sonuç görünür. Analiz maçlarının içinde de açılır karşılaştırma kutusu vardır. Arama, yalnız farklı kararları gösterme ve sayfalama yereldir; API çağırmaz. PAS/seçim farkları da gösterilir.

Eski sürümlere sonradan LAB tahmini eklenmez. Ayarlarda “Güç LAB” açıkken yeni manuel tarama oluşturun. Bir günü yeniden taramak ayrı sürüm oluşturur; karşılaştırma özeti yalnız seçili sürümün aynı maçlarını kullanır. LAB seçimi manuel listede/showroomda veya Telegram'da kullanılmaz; salt okunur denemedir.

## Yeni taramaların varsayılanları

- Maç toplamı ALT kapalı.
- İkinci yarı toplam gol ALT kapalı.
- Güç LAB açık.
- İlk yarı ALT, takım golü ALT ve diğer marketler eski veri/oran/model şartlarıyla devam eder. İkinci yarı bahsi ilk yarı diye yeniden adlandırılmaz; ilk yarının kendi marketi ve yarı verisi gerekir.

İki ALT izin kutusu ayrı ayrı açılabilir. Her iki model aynı taramanın ayarlarını ve oranlarını kullanır. Kapalı market tüm marketler tablosunda gerekçesiyle kalır; uyarı kabul edilerek yalnız manuel takip için kaydedilebilir, model onayı değildir. Eski kuponlar, sürümler, manuel kayıtlar ve showroom korunur.

## Güç LAB ne yapar?

Mevcut taramanın zaten aldığı lig geçmişinden, rakiplerin hücum/savunma düzeyini de hesaba katan gol hızları çıkarır. Lig ev/deplasman gol tabanı korunur; takım hücum katsayısı ile karşı tarafın gol yeme katsayısı birleştirilir. Yeni maçların ağırlığı yüksek, eski maçların ağırlığı 180 günde yarıdır. Küçük örneklem 8 maçlık lig ortalaması önseliyle dengelenir. Endekslerde lig ortalaması 100'dür; güç endeksi hücum/gol yeme oranıdır, Elo veya kazanma yüzdesi değildir.

En az 20 geçerli lig maçı, her takımda en az 8 maç ve 3 ağırlıklı maçlık örneklem gerekir. En fazla 730 günlük/2000 maçlık geçmiş, 60 iterasyon kullanılır. Başlangıç ile veri kesimi arasında 3 saat güvenlik payı vardır. Yetersiz veya kararsız veri PAS olur. İlk/ikinci yarı gol payları mevcut modelin geçerli yarı geçmişinden aynen alınır; API maç sonucu tahmini ilk yarı olasılığına dönüştürülmez.

Ana modelin 60% aynı saha son 10 / 24% genel son 20 / 16% son 5 ağırlıkları ve gol/market olasılık hesabı değişmez. API yönüne göre ilk yarı çifte şans onayı eklenmedi. İyileşme iddiası yoktur; iki modelin ham yüzdeleri kalibre edilmiş başarı oranı değildir.

## API, RAM ve canlı güvenliği

LAB için yeni geçmiş/oran/istatistik isteği yoktur; aynı tarama verisi kullanılır. Aynı lig/veri kesimi/gol tabanı hesabı tarama içinde bir kez yapılır. Hesap önbelleği tarama bitince serbest bırakılır; kalıcı RAM deposu yoktur. Kayıtta büyük ikinci market tablosu yerine yalnız ana/yedek LAB seçimi ve kısa katsayılar saklanır. Hesap bölümler arasında kontrolü bırakır; canlı çalışmaya geçildiğinde mevcut bekle-devam mekanizmasına uyar.

“Sonuçları getir · manuel” mevcut, LAB ve manuel seçimlerin maç kimliklerini birleştirip aynı maç yanıtından sonuçlandırır; tahminler ve ilk oranlar yeniden hesaplanmaz. LAB'ın tek başına seçtiği ek maçlar varsa sonuç sorgusunun toplam parti sayısı artabilir; günlük API bütçesi ve canlı rezervi aynen geçerlidir. Her model için ayrı maç isteği yapılmaz. Otomatik LAB taraması, otomatik LAB sonuç takibi veya Telegram gönderimi yoktur.

V24, canlı sinyaller, Telegram teslimi, sunucu rotaları ve ana kupon oluşturma kuralları değişmedi. Yeni bağımlılık yoktur. Paket `.env`, API anahtarı, kayıt JSON'ları veya üretim önbelleği içermez.

## Kurulum

1. Çalışan manuel Banko taramasının bitmesini bekleyin. Paketteki mevcut dosyaların yedeğini alın.
2. ZIP içeriğini bot kök klasörüne `public/` yapısını koruyarak kopyalayın. Eski JSON kayıtlarını, önbelleği veya `.env` dosyasını silmeyin.
3. Botu kendi mevcut çalıştırma yöntemiyle yeniden başlatın. Hiçbir tarama otomatik yeniden başlamaz. Bu paketin güvenli kayıt noktalı taramaları Devam et ile manuel sürdürülebilir; eski yarım sürümler için yeni manuel tarama gerekir. Canlı sırasında bekleme aynı çalışan süreçte kaldığı yerden otomatik devam eder.
4. Panelde Ctrl+F5 yapın. Banko ayarlarında iki ALT izin kutusu boş, Güç LAB işaretli olsun; kaydedin. Yeni manuel tarama oluşturun ve Model karşılaştırması sekmesini açın.
5. Maçlar bittikten sonra seçili sürümde “Sonuçları getir · manuel”e basın. Ana ve LAB sonuçları ayrı izlenir.

Sunucuya otomatik kurulum yapılmadı. Yerel testler ve ekran kontrolü sahte veriyle, gerçek API/Telegram çağrısı yapılmadan yürütüldü.
