# V19.1 Test Lab — 8 Eylül 2026

## Canlı karar hattı

- Telegram'da çalışan V19 tarifesi değiştirilmedi.
- Test Lab kolları V19'un kararını, gönderim hakkını ve son canlılık kontrolünü etkileyemez.
- Bütün ALT marketleri kapalı kalır.

## Test Lab

V18-A ve V18-B emekliye ayrıldı. Eski geçmiş dosyaları silinmez; ancak artık yüklenmez, güncellenmez, sonuçlandırılmaz ve panelde gösterilmez.

Yeni karşılaştırma dört kol gösterir:

1. **Aktif V19:** Telegram'a giden gerçek sinyaller.
2. **İki kurallı çekirdek:** Telegram'sız, maç başına en fazla bir taze doğrulanmış sinyal.
   - MS2: 25–54. dakika, V18 en az %65, V18 EDGE +10…+100, oran 1.50–2.00.
   - 2.5 ÜST: 50–80. dakika, V18 %55–64,9, V18 EDGE +5…+10, oran 1.50–2.00.
3. **Legacy V17:** V19'dan önceki son dondurulmuş V17 tarifesi. Kendi bağımsız dosyasında bir ilk ve yalnız daha ileri dakikada/farklı markette bir takip hakkı bulunur.
4. **Hibrit gözlem:** Mevcut 0.5/1.5/3.5 ÜST dar pencereleri korunur. Bu kol ham gözlemdir; taze doğrulamalı iki kolla aynı kabul edilmez.

Core ve Legacy V17 ancak ilk politika kontrolünü gerçekten geçerse ortak taze doğrulamayı tetikler. Fixture, altı temel canlı istatistik ve oran yeniden çekilir; Python modeli tek maç için yeniden çalışır. Kural taze veride de geçerse kayıt oluşturulur. Lab'a özel bu işlem V19'da yeni bir Telegram fırsatı oluşturamaz.

Yeni geçmiş dosyaları:

- `dino_two_rule_core_shadow_history.json`
- `dino_v17_legacy_shadow_history.json`

## Panel ve dışa aktarma

- Ortak Türkiye tarihi filtresi, arama ve sonuç yenileme bulunur.
- Her kol için sinyal, kazan/kaybet, başarı, ROI ve ortalama oran ayrı gösterilir.
- Core ve V17 `TAZE DOĞRULAMA`, hibrit kol `HAM GÖZLEM` etiketi taşır.
- Core ve V17 için ayrı JSON/CSV indirme yolları vardır. CSV; sinyal tipi, ilk/takip yuvası, V16/V18/karar EDGE alanları ve taze doğrulama durumunu ayrı sütunlarda saklar.

## Güvenli kurulum

Paket çalışma geçmişi, önbellek veya `.env` içermez. Sunucudaki bu dosyaları silmeyin ya da boş dosyayla değiştirmeyin.

```bash
unzip -o dinobot-v19.1-test-lab-core-v17-ubuntu-2026-09-08.zip -d ~/dinobot
cd ~/dinobot
npm install --omit=dev
npm test
pm2 restart dinobot
pm2 save
```

Başlangıç logunda şu sürüm görünmelidir:

`ml-v19-test-lab-core-v17-ubuntu-2026-09-08`
