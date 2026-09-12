# V21.1 — dar ÜST ileri testi

Build: `ml-v21-1-over-3of3-edge-m5-0-ubuntu-2026-09-13` · Uygulama 2.1.1.

Kullanıcının onayladığı 12 Eylül değerlendirmesi önerisi uygulandı. Bu bir model eğitimi veya geçmiş sinyalleri yeniden üretme değildir. Yeni kuralın ileri test performansı henüz bilinmiyor. Eski tarihler analiz edilmedi; kod değişikliği sınır ve regresyon testleriyle doğrulandı. Uzak sunucuya yükleme veya gerçek Telegram gönderimi yapılmadı.

## Tam kural

| Alan | Yeni V21 |
| --- | --- |
| Market | Yalnız yarım gollü ÜST. ALT, MS1/X/MS2 kapalı. |
| Model desteği | Dino **>%50**, V16 **>%50**, V18 **>%50**; üçü birlikte. |
| Eksik / geçersiz | Eksik, boş, boolean, NaN, sınır dışı model veya pre değeri geçmez. Tam %50 geçmez. |
| Pre | İlgili market çizgisinin desteği **>%50**. Yeni üst tavan yok. |
| EDGE | **−5 ≤ kayıt EDGE ≤ 0**, iki uç dahil. |
| EDGE tanımı | `Number((Dino − 100 / canlıOran).toFixed(1))`, tam-stat ile aynı. V18 EDGE kullanılmaz. |
| Dakika | 25–80, uçlar dahil. |
| Oran | 1.50–4.00, uçlar dahil. Diğer koşullar nedeniyle her oran fiilen geçmeyebilir. |
| Son kontrol | Mevcut taze fixture / istatistik / canlı oran ve ikinci model değerlendirmesi korunur. |
| Tekrar kilidi | Eski veya yeni V21 kaydı bulunan maça ikinci V21 kaydı yok; restartta korunur. |
| Öncelik | Mevcut onay sayısı azalan, oran artan, market adı sırası korunur. Sonuçlara bakılmaz. |
| Kanal | Yalnız Test Lab; V21 Telegram'a gitmez. |

Preye %80 tavanı, modellere %55 sınırı, ilave dakika/lig/market çizgisi kısıtı veya API X vetosu eklenmedi. Dino artık zorunlu olduğundan düşük Dino puanı taze veri çağrısı istenmeden önce de elenir. Taze yeniden kontrolde model, pre, dakika, oran veya edge şartı bozulursa kayıt yapılmaz.

## Geçmişler neden ayrıldı?

Yeni tarife: `v21-over-consensus-3of3-edge-m5-0-2026-09-13`.
Eski tarife: `v21-consensus-shadow-2026-09-12`.

- Fiziksel geçmiş dosyası değişmedi: `dino_v21_consensus_shadow_history.json` veya mevcut özel ortam yolu.
- Kayıtların `tariffVersion`, sonuçları ve kimlikleri yeniden yazılmadı. Taşıma/silme/toplu yeniden etiketleme yok.
- Kart, API status, V21 liste, normal JSON ve CSV yalnız yeni tarifenin kayıtlarını hesaplar.
- Eski ve yeni kurallar aynı tarihte kayıt üretse bile tarih filtresi onları birleştirmez.
- Panelde **Eski V21 JSON** düğmesi eski tarifelerin bütün tarihlerdeki kayıtlarını alır. Eski JSON kuralları da eski 2/3 tarifesini doğru gösterir; bilinmeyen sürüm varsa güncel kurallar ona yapıştırılmaz.
- API arşiv için `cohort=previous` destekler; JSON/CSV dosya adına `-previous` eklenir. Arşiv de Telegram değildir.
- Başlangıç alanı ilk yeni sinyalin zamanını gösterir; henüz yeni kayıt yoksa null ve kart sıfırdır. Eski sonuç yenilemesi yeni deneyin son kayıt saatini değiştirmez.
- Eski bekleyen ALT dahil sonuçlar aynı tracker üzerinde sonuçlanmaya devam eder. Aynı maçın tekrar kilidi eski tarifeden de geçerlidir.
- Diğer labların ortak dönem başlangıcı ileri taşınmadı. Tam-stat ve V20 snapshot arşivi korunur.

## Değişmeyenler

Telegram V19'un mevcut 2.5/4.5 ÜST kuralları ve Legacy V17 yalnız 2.5 ÜST yönlendirmesidir. Ortak Telegram kilidi değişmedi. V19 ve Legacy V17 labları tüm kendi mevcut marketlerini test etmeye devam eder. Yeni Çekirdek, V20, V16/V18 model dosyaları, Python tahmin motoru, pre hesapları ve sonuçlandırma motoru değiştirilmedi.

## Kontroller

14 çevrimdışı test paketi: önceki model/lab/Telegram regresyonları, yeni −5/0 uçları, %50 kesin sınırı, eksik modeller, ALT reddi, taze kontrol sonrası bozulan adayın engellenmesi, 3/3 uygun ÜST kaydı, eski ALT sonucunun güncellenmesi, sürümler arası restart maç kilidi, aynı gündeki eski/yeni sonuçların API/JSON/CSV/kartta ayrılması, arşiv meta bilgisi ve dosya adı, panel JavaScript sözleşmeleri ve kök/public eşliği.

Testler gerçek Telegram, API-Football veya Python ağına bağlanmaz; sahte veriler ayrı geçici dizinlerde kullanılır. Test başarısı kârlılık veya gerçek sunucuda başarılı dağıtım garantisi değildir.

Kurulum: `UBUNTU_KURULUM.md`. Mevcut uygulama, `.env`, geçmişler ve arşivler yedeklenerek korunmalıdır. Kod/model dosyalarını yenileyin; uygulama klasörünü silmeyin.
