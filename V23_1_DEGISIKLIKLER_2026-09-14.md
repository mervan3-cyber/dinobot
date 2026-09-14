# V23.1 — bağımsız kontroller, çift kaynak

Panel adı V23, paket sürümü 2.3.1. V21 ve V22'nin mevcut taze doğrulanmış ilk lab sinyalleri ayrı izlenir. V22'nin A/B/C etiketi korunur; V22, V21'in Pre >%50 şartına zorlanmaz. Hiçbir kontrol kaynak sinyalini veya Telegram kararını değiştirmez.

## Veri sözleşmesi

- Eski dosya zarfı ve mevcut assessment hesabı uyumluluk için korunur. Eski kayıtlar yeniden değerlendirilmez.
- Yeni kayıt: sourceModel (v21/v22), baselineSignalId/baselineVersion, matchedFilters ve derin kopyalanmış giriş değerleri.
- audit.version: v23-independent-controls-v1-2026-09-14. Kontroller: approve, reject, insufficient, observed.
- audit.controls: kimlik, Türkçe etiket, deney kuralı, statü, gerekçe kodları/etiketleri ve ölçülen değerler. Bir kontrolün hatası diğerini durdurmaz.
- audit.events: normalize olaylar, alım/ilk görülme zamanı, giriş skor/istatistikleri ve yalnız gerekli pencere uçları. Tüm tarama halkası diske yazılmaz.
- Yeni karşılaştırma experiment üzerinden yapılır. Olay bilgisi olmayan eski kayıtlar yeni deneyin paydasına eklenmez.

## Rapor hesabı

experiment.sources.v21 ve v22 ayrı baz/kontrol özetleridir; v22Filters.A/B/C alt gruplardır. unique gerçekten aynı girişleri tekilleştirir. Aynı maçın farklı girişleri bağımsız maç sayılmaz.

Her kontrol için approve/reject/insufficient/observed, comparableBaseline, rejectOnly, tags, reasons, avoidedLosses, missedWinners, coveredPercent, profitDifference bulunur.

- avoidedLosses: ret etiketli sonuçlanmış kaybeden sayısı.
- missedWinners: ret etiketli sonuçlanmış kazanan sayısı.
- rejectOnly: sadece retleri çıkartan varsayımsal sonuç; yetersiz ve gözlem kayıtları korunur.
- profitDifference: aynı giriş oranı ve birim bahisle rejectOnly.profit - baseline.profit. Kayıpları çıkarmak +1; kazananı çıkarmak -(oran-1) etkisi yapar.
- Bekleyenler isabet/ROI paydasına girmez. VOID bahis tutarı ROI paydasına girmez. 90 dakika marketi AET/PEN toplamından sonuçlandırılmaz.
- Gerekçeler ve A/B/C etiketleri çakışır. Bir sinyal birden fazla red nedeniyle toplamda tekrar tekrar sayılmaz.

Üç gol referansı eğitim sonucu değil sabit deney kuralıdır. Son 10/saha/son 5 korelasyonludur; bağımsız model oyları değildir. Olay/tempo ve son-5/kart bağlamına sonuçlara bakılarak seçilmiş veto eşikleri eklenmemiştir.

## Entegrasyon ve sınırlar

server.js değişiklikleri V23 kaynak izinleri (V21 OR V22), mevcut fixture olaylarını alım zamanı ile taşıma, bellekte pencere toplama, iki yeni lab kaydını ayrı gözleme aktarma, kaynak filtreli dışa aktarım ve sürüm/log ile sınırlıdır. Ek olay API çağrısı, paket bağımlılığı, otomasyon, V23 Telegram gönderimi yoktur. Mevcut gol profili kotası 80/gün kalır.

Olay alım zamanı olayın gerçek saniyesi değildir. Liste tutarlılığı tüm olayların eksiksiz geldiğini kanıtlamaz. Kart oyuncusu yedek/staff olabilir; olay sayısından oyuncu eksikliği modeli türetilmez. Oyuncu değişikliğinin taktik yönü varsayılmaz. Olay penceresindeki ilk istatistik noktası olaydan sonra başlar; olayın tam anına veri uydurulmaz.

## Doğrulama

25 çevrimdışı test: önceki model/panel/akış regresyonları, kaynak kilidi, V22 düşük-Pre A, çift sonuçlandırma, eski dönem, bağımsız örneklem, kaçırılan kazanan/önlenen kayıp/kâr, zaman sızıntısı, eksik/eski/iptal/VAR/own-goal olayları, ikinci sarı, 45+ devre ayrımı, araya olay/istatistik düzeltmesi, bellek sınırları, kaynak/tarih JSON/CSV ve güvenli DOM metni.

Sentetik yerel önizleme pakete dahil değildir. Canlı API kapsamı ve gerçek maç performansı yerel testlerle doğrulanmış sayılmaz. Kurulum ve günlük raporlama UBUNTU_KURULUM.md içindedir.
