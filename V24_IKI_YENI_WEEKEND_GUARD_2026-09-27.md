# V24 · iki yeni Weekend Guard · 27 Eylül 2026

Bu paket iki yeni kuralı yalnız **Test Lab** olarak ekler. Telegram/V22 üretim kararı değişmez.
V24 Ana hafta sonunda çalışmaya devam eder. Bütün V24 kolları aynı taze fixture, istatistik,
oran ve olay/skor doğrulamasını paylaşır; yeni guardlar ek API çağrısı yapmaz.

## 1. V24 Seçici Weekend

- Yalnız cumartesi ve pazar çalışır.
- Maç başına ilk uygun kayıt; öncelik `SNIPER → A → B`.
- Sniper: yalnız `1.5 ÜST`, saf V24.
- A: yalnız `2.5 ÜST`, saf V24.
- B: yalnız `1.5 ÜST`, saf V24.
- MS1/MS2 kapalıdır.
- İngiltere League One, İngiltere League Two ve Eerste Divisie kapalıdır.
- Milli takım turnuvaları ve milli hazırlık maçları kapalıdır.
- `Friendlies Clubs`, `Club Friendlies` ve `Club World Cup` milli maç sayılmaz.

## 2. V24 + V25 Ortak Weekend

- Yalnız cumartesi ve pazar çalışır.
- Maç başına ilk uygun kayıt; öncelik `SNIPER → A → B`.
- Sniper: yalnız `1.5 ÜST`, saf V24; V25 onayı aranmaz.
- A: yalnız `2.5 ÜST`; V24 geçişine ek olarak V25 olasılık en az `%60`,
  V25 EDGE `-5 ≤ edge < 0` olmalıdır.
- B: yalnız `1.5 ÜST`; V24 geçişine ek olarak V25 olasılık en az `%60`,
  V25 EDGE `0 ≤ edge < +7` olmalıdır.
- MS1/MS2 kapalıdır.
- Yalnız İngiltere League One doğrudan kapalıdır.
- League Two, Eerste Divisie ve milli maçlar doğrudan yasaklanmaz. A/B kayıtları V25
  ortak filtresini geçmek zorundadır; Sniper saf V24 kuralını korur.
- V25 modeli `2026-09-25` sonuna kadar olan veriyle kilitlidir. Sunucuda Python süreci
  açmaz; dondurulmuş model saf JavaScript ile çalışır.

## 27 Eylül geriye dönük kontrol

Bugünün sonucu V25 eşik seçimine katılmamıştır.

| Guard | Gerçek V24 exportu | Net | ROI |
|---|---:|---:|---:|
| V24 Seçici Weekend | 6 · 4 K / 2 Y | +0.125u | +%2.1 |
| V24 + V25 Ortak Weekend | 2 · 2 K / 0 Y | +1.050u | +%52.5 |

İkinci guarddaki iki kayıt da Sniper'dır. O gün hiçbir A/B kaydı kilitli V25 edge
penceresinden geçmemiştir; bu nedenle tek günlük `2/2`, V25 A/B performans kanıtı sayılmaz.
İleri test ayrı geçmişlerde sürdürülmelidir.

## Panel ve kayıtlar

- İki ayrı özet kartı ve iki ayrı ayrıntı tablosu eklendi.
- V25 ortak kaydında V25 olasılık ve edge panelde görünür.
- Ayrı JSON/CSV butonları vardır.
- Varsayılan geçmişler:
  - `dino_v24_selective_weekend_history.json`
  - `dino_v24_v25_joint_weekend_history.json`
- Yeni guardlar ortak ileri-test başlangıcını açar. Eski dosyalar silinmez; panelde adil
  karşılaştırma için dağıtım anından sonraki ortak dönem gösterilir.

## Doğrulama

- Tam `npm test` zinciri geçti.
- Panel JavaScript sözdizimi, sunucu rotaları, lig/milli maç ayrımı, kural sınırları,
  V25 skor eşleşmesi, ayrı fixture kilitleri ve JSON/CSV exportları test edildi.
