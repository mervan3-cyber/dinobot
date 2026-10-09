# Market LAB + isteğe bağlı saat aralığı

Mevcut V24 + Banko + showroom + yenilenmiş panel kurulumuna birleşik güncellemedir; tam bot değildir. 8 Ekim birleşik Banko/PAS/devam/Güç LAB yamasını da içerir. Son deneylerdeki güç harmanlama, yeni yarı modeli veya kalibrasyon değişiklikleri bu pakete eklenmedi.

## Kullanım

Banko → Ayarlar: **Market LAB açık** kutusunu işaretli bırakın. **Tarama zamanı** alanında **Tüm gün** veya **Saat aralığı** seçin. Örneğin 18:00–23:59; başlangıç ve bitiş dakikaları dahildir. Saatler Türkiye saatidir, sunucunun yerel saatine bağlı değildir. Başlangıç bitişi aşamaz; gece yarısını geçerek başka güne maç eklenmez. Varsayılan Tüm gün'dür.

Ayarları kaydedin, gerekirse Ligleri getir ile bu zaman diliminin liglerini yükleyin, seçili güne manuel kupon oluşturun. Aralık dışında kalan maçların oran/geçmiş/istatistik sorguları yapılmaz. Gün programının tek tarih sorgusu yine gereklidir. Tahmin hedefi ana modelde uygun seçimlerin üst sınırıdır; Market LAB seçenekleri hedefi doldurmaz. Yetersiz maçta sayı zorlanmaz.

Yarım kalan taramada Devam et, ilk sürümün tarih/lig/model/**saat aralığını** korur. Yeni saat ayarı farklı yeni tarama içindir. Güncel günlük API tavanı ve canlı rezervi yine korunur. Canlı işlem geldiğinde mevcut bekle/devam davranışı değişmez.

## Market LAB nerede?

Analizler → maçın ayrıntısını açın → **Market LAB** kartını açın. Ana tahmin ve Güç LAB ayrı kalır. Ana tahmini PAS olan maçlar mevcut PAS göster kutusuyla açılabilir. Eski tamamlanmış sürümlere sonradan LAB tahmini eklenmez; yeni manuel tarama gereklidir. LAB için manuel seçim/showroom veya Telegram gönderme düğmesi yoktur.

- Maç sonucu ve maç çifte şansı, desteklenen toplam/takım ÜST ve KG VAR/YOK kendi oran/veri/model eşikleriyle değerlendirilir.
- İlk yarı çifte şansı, ALT, kesin skor ve İY/MS Market LAB seçimlerine girmez. Bu LAB filtresi ana modelin mevcut açık/kapalı marketlerini değiştirmez.
- Doğrulanmış `25 / Result/Total Goals / Home/Over N.5` için MS1 + ÜST ortak skor dağılımından hesaplanır; ilişkili iki olasılık çarpılmaz. Şartları geçen kayıt yoksa seçim zorlanmaz.
- LAB maç sonucu/çifte şans seçiminin en fazla 3 yüzde puan yakınında, kendi eşiklerini de geçen ÜST varsa ayrıca gösterilir. Bu bağımsız alternatif bahis, birleşik kupon veya sigorta değildir.
- Korner, maç toplam şut ve maç toplam isabetli şut ayrı **deneysel** kartlardır; gol marketlerinin sıralamasına veya otomatik kupona sokulmaz. Her kullanılan takımda en az 8 dolu son-10 kaydı gerekir. Yalnız doğrulanmış ID + tam market adı ve yarım sayı ÜST çizgileri kabul edilir; tam sayı/push/Asya çizgileri kullanılmaz. Takım kornerleri doğrulanmış 57/58 adlarıyla desteklenir.
- Şut marketleri 211 `Total Shots` ve 87 `Total ShotOnGoal` ile maç toplamıdır. 276 `Away Player Shots Total` takım toplamı varsayılmaz; futbolcu ve takım şutu kimlikleri doğrulanmadığından yeni tahmin verilmez.

İstatistik modeli basit sayı-Poisson tanısıdır; dağılım/başarı kalibrasyonu veya rakibin verdiği korner/şut etkisi yoktur. Ham yüzdeler gerçek başarı oranı ya da garanti değildir. Aynı eşikler bu deneysel yüzdeleri ana gol modeline eşdeğer güvenilir yapmaz.

## Sonuç takibi ve yük

LAB aynı taramada zaten alınan geçmiş, profiller ve oranları kullanır: **ek tarama API isteği yoktur**, yeni bağımlılık yoktur. Sadece seçilen LAB seçenekleri, kısa elenme nedenleri ve kaynak kayıtları diskteki mevcut Banko sürümünde saklanır; kalıcı büyüyen RAM önbelleği eklenmedi.

Maç bitince Sonuçları getir · manuel ile ana/manuel/Güç LAB/Market LAB maç kimlikleri tekilleştirilerek ortak 10'lu partiler sorgulanır. LAB'ın tek başına takip ettiği ek maçlar parti sayısını artırabilir; günlük API tavanı/canlı rezervi atlanmaz. LAB sonuç özeti ayrı tutulur, ana başarıya eklenmez. Kupon ve ilk tahminler yeniden hesaplanmaz.

Gol sonuçları kesin normal süre ve gerekiyorsa gerçek ilk yarı skoru ile hesaplanır; FT skorundan ilk yarı çıkarılmaz. Korner/şut sonuçlarında yanıtın takım kimlikli kesin istatistikleri gerekir. Veri gelmezse bekler; eksik sıfır sayılmaz. AET/PEN istatistiği normal süre diye kabul edilmez. Yeni `/fixtures/statistics` sonucu sorguları veya otomatik LAB sonuç takibi eklenmedi.

## Kurulum

1. Manuel Banko taramasının bitmesini bekleyin. Pakette üzerine yazılacak kod dosyalarının ve mevcut JSON kayıtlarının yedeğini alın.
2. ZIP içeriğini bot köküne (`/root/dinobot`) `public/` yapısını koruyarak kopyalayın. Bu paket `.env`, API anahtarı, üretim JSON'u veya önbellek içermez; mevcut veri dosyalarını **silmeyin**.
3. Botu kullandığınız mevcut yöntemle yeniden başlatın. Panelde Ctrl+F5 yapın.
4. Ayarlarda Market LAB açık / Tüm gün veya saat aralığı seçin, kaydedin ve **yeni manuel tarama** oluşturun.

Ana gol modeli, Güç LAB modeli, V24, canlı sinyal/Telegram kodu değiştirilmedi. Sunucuya otomatik kurulum yapılmadı; gerçek API veya Telegram kullanılarak test yapılmadı. Yerel önizleme için computer-use becerisi denendi ancak uygulama tarayıcısı loopback önizlemeye erişemedi; görsel tarayıcı QA tamamlanmış sayılmıyor. Panelin salt okunur davranışı, ayar kaydı, HTML ve tema sözleşmeleri çevrimdışı DOM testleriyle doğrulandı.
