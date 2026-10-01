# V24 Ana + Odak LAB B 2.5 pre %52 — 1 Ekim 2026

Bu, mevcut 27 Eylül hafta sonu tarifeleri + 28 Eylül Odak LAB sürümü için güncelleme paketidir; TAM BOT değildir. Kaynak tabanı: `mac-yakala-v24-focus-lab-six-arms-2026-09-28`. Önceki B65/Sniper75 küçük ZIP'i uygulanmışsa da kullanılabilir.

## V24 Ana: kabul edilen kural

| Kol | V16 minimum | Pre minimumları |
|---|---|---|
| Sniper: 0-0 → 1.5 ÜST | %72 | 1.5: %75 |
| B: tam 1 gol gereken | %65 | 1.5/2.5/3.5/4.5: %70/%32/%30/%25 |
| A: tam 2 gol gereken | %65 | 2.5/3.5/4.5: %52/%25/%25 |
| MS: skorda öndeki taraf | %60 | Pre karar şartı değil; mevcut kural korunur |

ÜST dakika25–70, oran1.50–4.00, Dino≥45 (Sniper≥50), V18≥50 ve Dino EDGE≤0 korunur. Ana tarifede negatif Dino edge alt sınırı yok. Gereken gol en fazla2; yalnız Sniper0-0'a girebilir. MS dakika25–44, oran1.50–2.50, V16 edge0…+5 korunur. Kadınlar kapalı; mevcut olay/skor ve taze fixture/stats/oran doğrulaması zorunlu. Ana Sniper→B→A→MS önceliği ve ortak ilk-fixture kilidi aynı.

Ana tarifeden türeyen hafta sonu ve Odak kolları B V16 %65 / Sniper pre %75'i devralır. Diğer özel hafta sonu şartları korunur. V17/V20 açılmaz. Bu paket V24'ü Telegram'a taşımaz: mevcut Telegram yönlendirmesi V22 olarak kalır.

## V24 Odak LAB: yalnız yeni deney

Mevcut6 kol korunur. Yedinci kol `B25_PRE52`: **B 2.5 ÜST · pre ≥ %52**, reaksiyon şartı yok. Mevcut B25 pre %32 ve B25 reaksiyon kolları değişmez. Yeni kol V16≥65, Dino/V18/dakika/oran/edge/taze doğrulama koşullarını aynen paylaşır. A pre %55, B3.5 pre %40 ve B4.5 pre %20 bu pakete EKLENMEDİ.

Her Odak kolu maçın kendi ilk uygun anını ayrı kilitler. %32 kolu daha önce seçilmişken %52 kolu ilk kez uygun hale gelebilir. Bu, V24 Ana'nın tek-fixture kilidini değiştirmez; LAB kol sayıları toplanıp Ana sinyal sayısı diye okunmaz.

Panelde Test LAB → V24 Odak LAB altında yeni `%52` etiketi ve **“yeni dönem pre %32 / %52”** karşılaştırması vardır. Yeni dönem kıyası yalnız bu güncellemeyle alınan iki kolun kayıtlarını içerir. Eski kayıtlar silinmez veya yeniden oynatılmaz. Güncellemeden önce mevcut B25 girişi olan fixture yeni kıyasa sokulmaz; eski kilit korunur. Genel Odak geçmişi eski kayıtları göstermeyi sürdürür. JSON/CSV dışa aktarma ve maç sonucu kapatma mevcut akışla devam eder.

Yeni kayıtlar Odak sürümü ve `analysis.sourcePolicyVersion` ile işaretlenir; eşikler `analysis.thresholds` içinde yer alır. Yeniden başlatma kilitleri ve yeni dönem kıyası korunur.

V16/V18 hesaplamaları market başına ortak önbellekten paylaşılır; sırf yedinci kol var diye model7kez hesaplanmaz. Yeni endpoint yoktur. Ancak yalnız yeni kolun henüz kaydı olmayan uygun adayı, mevcut ortak taze doğrulamayı tetikleyebilir; “her koşulda sıfır ek API” garantisi değildir.

## Uygulama

1. Mevcut botun listedeki dosyalarını tarihli bir yedeğe al. Mevcut sürümde `v24_focus_lab.js` ve Odak API entegrasyonu olmalı; daha eski bot sürümüne doğrudan uygulanmamalı.
2. ZIP içeriğini mevcut bot köküne, klasör yapısını koruyarak uygula. `public/index.html` ve kökteki `index.html` birlikte güncellenmeli.
3. `.env`, history/cache JSON'ları, veritabanı, model JSON'ları ve `node_modules` bu pakette yoktur; bunlara dokunma.
4. Bot kökünde kontrol et:

```sh
node --check server.js
node --check v24_focus_lab.js
npm test
```

5. Testler geçince mevcut hizmetini kullandığın yöntemle yeniden başlat; tarayıcıda Ctrl+F5 ile paneli yenile. Sürüm: `mac-yakala-v24-main-focus-b65-sniper75-pre52-2026-10-01`.

Bu çalışma sunucuya otomatik yüklenmedi. Geri almak için yedek kaynak dosyalarını geri koyup hizmeti yeniden başlat; history dosyalarını eski yedeklerle ezme. Yeni LAB kayıtları diskte kalabilir, eski kaynak yeni armı değerlendirmez.
