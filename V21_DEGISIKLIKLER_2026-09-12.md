# V21 — ileri test ve ÜST Telegram yönlendiricisi

> ARŞİV NOTU: Bu dosya 12 Eylül'deki eski 2/3 ÜST/ALT kuralını anlatır. Güncel 13 Eylül dar ÜST denemesi için `V21_1_DEGISIKLIKLER_2026-09-13.md` dosyasını kullanın.

Build: `ml-v21-lab-over-telegram-ubuntu-2026-09-12` · Uygulama: 2.1.0

Bu sürüm kullanıcının belirlediği kuralı uygular; yeniden eğitim, geçmiş günleri yeniden oynatma veya sonuçlara bakıp eşik arama yapılmadı. Testlerin geçmesi kârlılık kanıtı değildir. Gerçek sunucuya dağıtım ve gerçek Telegram gönderimi yerelde yapılmadı.

## V21: yalnız Test Lab

| Koşul | Uygulama |
|---|---|
| Market | Yarım gollü ÜST / ALT, MS1/X/MS2 hariç |
| Pre destek | İlgili market çizgisi için **%50 üzerinde**; eksik veya tam %50 geçmez |
| Model desteği | Dino / V16 / V18 arasından en az ikisi **%50 üzerinde** |
| Eksik model | Onay sayılmaz; ALT için V18 yoksa Dino ve V16 birlikte geçebilir |
| EDGE | Tam-stat ekrandaki Dino kayıt EDGE’i: **≤ +1**, negatiflerde alt sınır yok |
| EDGE hesabı | `round1(Dino yüzde − 100 / canlı oran)`; V16 veya V18 EDGE’i değildir |
| Önceki temel sınırlar | Dakika 25–80; oran 1.50–4.00, uçlar dahil |
| Kayıt | Taze skor/istatistik/oran kontrolü ve ikinci Python değerlendirmesi sonrası |
| Maç kilidi | ÜST ve ALT birlikte maç başına en fazla bir kayıt; restartta korunur |
| Aynı anda birden çok aday | Önce çok onay, sonra düşük oran, sonra market adı; sonuç kullanılmaz |
| Telegram | Kapalı; V21 yalnız bağımsız ileri test |

V21 tek bir yeni olasılık modeli değildir. Panelde `2/3` veya `3/3` ve gerçek Dino/V16/V18 yüzdeleri görünür. Sahte bir “V21 başarı olasılığı” üretilmez. API tahmini X olması, takım gücü dengesi veya ek bir veto bu kurala eklenmedi.

## Telegram: V19 ÜST + Legacy V17 yalnız 2.5 ÜST

“V19 bütün ÜSTleri”, V19'un mevcut karar kurallarının ÜST alt kümesi olarak uygulandı. Bunlar **2.5 ÜST ve 4.5 ÜST**. Eski Ham Gözlem'e ait 0.5/1.5/3.5 ÜST kuralları Telegram'a taşınmadı; o kol kaldırıldı.

- V19'un 2.5 ÜST kuralı: 25–34. dakika, V16 ≥ %50, Dino kayıt EDGE −2.5…+2, oran 1.50–2.00.
- V19'un 4.5 ÜST kuralı: 60–74. dakika, V18 %50–74.9, V18 EDGE 0…+10, oran 1.60–2.00.
- Legacy V17'nin 2.5 ÜST kuralı: 25–34. dakika, V16 ≥ %50, Dino kayıt EDGE −2.5…+2, oran ≥1.50; V17'de olmayan üst oran sınırı eklenmedi.
- Bu iki kaynaktan biri onaylarsa aday olabilir. Aynı marketi ikisi onaylarsa tek mesaj, iki kaynak etiketi kaydedilir. Aynı maç için ortak tek Telegram hakkı vardır. Önceden kullanılan ilk/takip hakkı da tekrar gönderimi engeller.
- V21'in Pre >50, 2/3 ve EDGE ≤+1 kuralı **Telegram'a uygulanmadı**. Telegram modelleri mevcut eşiklerini korur.
- Son gönderim kapısı da yalnız izinli ÜST politikasını, taze doğrulamayı ve maç kilidini kontrol eder. MS1/X/MS2 ve ALT Telegram'a gitmez.

## Lab ve geçmişler

- V19 artık Telegram geçmişinden bağımsızdır; mevcut MS1/X/MS2/2.5 ÜST/4.5 ÜST ilk kuralları ve MS2 takip kuralı labda kalır.
- Legacy V17'nin bütün mevcut ilk/takip kuralları korunur; Telegram'ın 2.5 filtresi bu labı daraltmaz.
- Yeni Çekirdek ve V20 kuralları değişmedi; ikisi de labda kalır.
- Yeni dosyalar: `dino_v19_independent_shadow_history.json`, `dino_v21_consensus_shadow_history.json`.
- İlk açılışta yalnız bilinen V19 sürümüne ait **zaten paylaşılmış** kayıtlar V19 lab geçmişine bir kez kopyalanır. `importedFromSharedHistory=true` ile işaretlenir. Orijinal sinyal geçmişi değiştirilmez. Geçmişte üretilmemiş lab sinyalleri geriye dönük uydurulmaz.
- V21 yeni canlı kayıtlardan başlar. Yeni V21 başlangıcı mevcut lab karşılaştırma tarihini ileri taşımaz; V20/çekirdek/V17'nin eski ortak dönem filtresi korunur. Labların başlangıçları farklı olabildiği için tarih filtresi aynı diye bağımsız örneklemlerin aynı olduğunu varsaymayın.
- Pre destek mevcutsa paylaşılan sinyal tablosu, beş lab tablosu, JSON ve CSV'de bulunur. Eski kayıtta yoksa `-`; sıfır değildir ve sonradan bugünkü bilgiyle doldurulmaz.
- Tam-stat aday denetimi ve V20 snapshot arşivi korunur.

## Kaldırılan kol

Hibrit Ham Gözlem'in paneli, politika kuralları, seçim/kayıt kodu, tracker'ı, ortam ayarları, sonuç yenilemesi ve export uç noktaları kaldırıldı. Sunucudaki eski `dino_hybrid_observation_history.json` arşiv dosyası otomatik silinmez; artık yüklenmez, değiştirilmez veya panelde gösterilmez. Önceki sürüm kopyaları/yedekler geri dönüş için korunabilir.

## Doğrulama

13 çevrimdışı test paketi: mevcut V17/V19/çekirdek/V18/V20 regresyonları; V21 sınırları ve eksik veri; bağımsız tracker ve restart; gerçek ana tarama fonksiyonunda sahte veriyle taze yeniden kontrol; Telegram kanal ayrımı/çakışma/tekrar kilidi; shared ve lab export ayrımı; Pre sütunu/boş değer/oylar; tarih, arama ve panel hata durumları. Hiçbir test gerçek Telegram veya maç sağlayıcısına bağlanmaz.

Örnek verili yerel panelde V21 ve Pre sütunları görsel olarak kontrol edildi. Paket dışındaki önizleme dosyaları üretim ZIP'ine dahil değildir. Bu kontroller gerçek Ubuntu açılışı, sağlayıcı gecikmesi veya kârlılık garantisi vermez.
