# Maç Yakala — sade LAB ve yeni giriş filtreleri

Sürüm: 2.5.5 · Yapı: `mac-yakala-v23-filter-lab-2026-09-21`

Bu paket yalnız 2.5.4 / 20 Eylül canlı LAB paketinin üzerine uygulanacak güncellemedir. Sunucuya otomatik kurulmamıştır. Canlı API ve Telegram’a test mesajı gönderilmemiştir.

## Ne değişti?

- Eski gol geçmişi, son 10 / ev-deplasman, son 5, gol/kart/değişiklik sonrası üretim, 5/10 dakika, şut niteliği ve xG deneyleri aktif panelden kaldırıldı.
- Geçmiş toplayıcı artık oluşturulmaz, yüklenmez, kuyruğa iş eklemez ve zamanlayıcıda çalışmaz. Eski şut/olay pencereleri biriktirilmez. `DINO_V23_HISTORY_DAILY_LIMIT` ve batch ayarı artık kullanılmaz; `.env` değiştirmek gerekmez.
- Mevcut skor/olay tutarlılığı, sinyal anındaki zaten alınmış veriden hesaplanır. Canlı modellerin normal API çağrıları ve doğrulama mekanizmaları korunur. Toplam sistem API tüketimi sıfır değildir; yeni LAB’ın ilave isteği sıfırdır.
- Yeni deneyler sinyal anında sabitlenir. Sonradan gelen veriyle kararlar değiştirilmez; sadece maç sonucu güncellenir.
- V21, V22 tarifeleri, model dosyaları, Telegram metni/gönderimi, kazanma yanıtı ve bağımsız kaynak kilitleri değiştirilmedi.

## Deneyler

V21:

1. Yalnız 1.5 ÜST: 0-0 elenirdi, 1-0 / 0-1 geçerdi.
2. Aynı şart + gerideki takımda en az 4 toplam şut ve 1 isabet.

0.5 / 2.5 / diğer marketler iki deneyde de kapsam dışı olarak korunur. V21’e yeni dakika sınırı eklenmez.

V22:

1. Yalnız C: dakika <=73 (74+ elenirdi).
2. Dakika <=73 + iki takım toplamında en az 2 isabet ve en az %20 isabet oranı.
3. Dakika <=73 + yalnız 1.5 ÜST’te gerideki takımda en az 4 şut ve 1 isabet. Diğer marketlere reaksiyon şartı yoktur.

A veya B’den de geçen kayıtlar üç deneyde de korunur; A+C buna dahildir. EDGE/oran/mevcut model şartları değişmez. 0-0 için genel yasak yoktur; V22 C’nin 0.5 ÜST’ü dakika ve ayrı kalite deneyine tabidir.

Skor tutarlılığı bağımsız satırdır; diğer deneylere ek veto oluşturmaz. Tüm yeni filtreler yalnız LAB simülasyonudur; gerçek sinyal elenmez.

## Tabloyu okuma

- Onay / elenirdi sayıları maç bitmeden de görünür. K/Y ve ROI sonuç geldikçe güncellenir.
- Yetersiz veri sıfır değildir. Karar üretilemezse yetersiz gösterilir ve ret simülasyonunda korunur.
- Kapsam dışı kayıtlar onay gibi gösterilmez; ayrı “korunan” sayısındadır.
- Filtre sonrası portföy yalnız “elenirdi” kayıtları çıkarılarak hesaplanır. Engellenen kayıp / kaçırılan kazanan ve net birim farkı aynı giriş, aynı oran üzerinden hesaplanır; daha sonraki adaylar seçilmez.
- Her sinyal 1 birim. Bekleyenler kazanca/ROI’ye girmez, iptaller stake sayılmaz, iadeler ayrı tutulur. İsabet W/(W+L).
- V21/V22 raporları ayrı kaynak raporlarıdır; toplanınca tekil Telegram kasası oluşmaz.
- Şutlar sinyal anına kadar kümülatiftir; son 10 dakika değildir.
- Ana tarih seçimi gün gün çalışır. Özet tüm seçili dönemi, sinyal listesi son kayıtları kapsar. Tam veri JSON/CSV’dedir.

## Dosyalar ve eski kayıtlar

- Yeni dönem: `dino_v23_filter_history.json` ve `.archive/` dizini. İlk yeni kaynak sinyaliyle başlar. Eski kaynak kayıtları yeniden oynatılmaz.
- Eski `dino_v23_goal_history.json`, `.archive/`, `.pre-archive.bak` ve `dino_v23_goal_cache.json` silinmez/değiştirilmez. Eski bekleyen kayıtlar son saklandıkları haliyle arşivdir; eski deneyler için ayrıca sonuç/API takibi yapılmaz. Normal V21/V22 kaynak sonuç takibi sürer.
- “Eski deney arşivi” açılır alanından eski tüm JSON/CSV indirilebilir. Yalnız açık indirme talebinde okunur; yeni tablolarla karışmaz.
- Yeni bitmiş kayıtların ayrıntıları diske arşivlenir; panel özetleri hafif indeksten hesaplanır.

## Kurulum

1. Mevcut sunucu kodunu ve veri dosyalarını yedekleyin. PM2 uygulamasının gerçekten `dinobot` olduğunu `pm2 list` ile kontrol edin.
2. `pm2 stop dinobot` ile yazmayı durdurun. ZIP içindeki dosyaları mevcut uygulama klasörüne aynı yollarla aktarın. Bu bir fark paketidir; boş klasöre tek başına kurulum yapılmaz.
3. `public/v23_filter_panel.js` yeni dosyası dahil olmalı. `index.html` ve `public/index.html` birlikte güncellenmelidir.
4. Sunucuda `npm test` çalıştırın. Bağımlılık değişmedi; yeni anahtar veya `.env` ayarı gerekmiyor.
5. `pm2 restart dinobot` çalıştırın; paneli Ctrl+F5 ile yenileyin.
6. Yapı sürümünü ve “Eski deneyler / geçmiş API toplama kapalı” notunu kontrol edin. İlk yeni kaynak sinyali gelene kadar yeni tabloların sıfır olması normaldir.

ZIP `.env`, Telegram metin dosyası, canlı geçmişler, önbellekler, model dosyaları veya node_modules içermez. Sunucudaki kullanıcıya ait verilerin üzerine boş veri dosyası koymayın. Eski arşiv dizinlerini taşımayın/silmeyin.

Geri alma: PM2’yi durdurup kod yedeğini geri koyun; yeni LAB dosyasını silmeden ayrı bırakın. Eski kod geri gelirse eski geçmiş toplayıcısının tekrar çalışabileceğini unutmayın.
