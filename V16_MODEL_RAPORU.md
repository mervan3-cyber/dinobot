# Dino V16.1 Model ve Karar Raporu

## 30 Ağustos sonrası karar güncellemesi

30 Ağustos kör gününde V16 `%76`, `60–80. dakika` ve `1.40+` kuralı 12 seçimde
9 doğru yaptı. 26–30 Ağustos yuvarlanan testinde aynı kural 65 seçimde 53 doğru
sonuç verdi (`%81,5`). Bu nedenle Telegram kapısı 60. dakikaya taşındı.

Tam API güç bağlamı veto olmaktan çıkarıldı; takım gücü, standings ve API
tahmini V16 girdisi ve denetim verisi olarak kalır. Harici pre-destek ve EDGE
barajları V16 kararını elemez. Gecikmiş skor/goal durumları için Telegram öncesi
12 saniyelik ikinci skor, oran ve olay kontrolü eklendi.

## Veri

- 260 sonuçlanmış farklı maç
- 1.370 tekil canlı maç/dakika anı
- 12.522 sonuçlanmış market adayı
- Eğitim günleri: 26–29 Ağustos 2026
- 29 Ağustos, önceki günlerden eğitilen model için tamamen ayrı kör test günü

## Teşhis

Eski Dino olasılık motorunda ALT/ÜST alan eşleşmesi veya yön tersliği yoktu.
Sorun, saldırı temposunun doğrusal eski modelde zayıf kalması ve Telegram
katmanının en yüksek Dino yüzdesini seçerek ALT marketlerine aşırı yönelmesiydi.
29 Ağustos'ta mevcut akış 28 sinyalde 16 doğru yaptı (`%57,1`). Aynı gün `2.5
ALT` yalnız 1/4 geldi; `MS2` 4/4 geldi.

## Kör test

İlk üç günle eğitilen V16 ikinci katman, hiç görmediği 29 Ağustos gününde:

- Eski ham seçim benzetimi: 118 maçta 72 doğru (`%61,0`, ROI `-%9,5`).
- V16 genel seçim: 56 maçta 41 doğru (`%73,2`, ROI `+%6,0`).
- Tam API güç doğrulaması + 50. dakika + `%76` eşiği: 7/7 doğru.

Son satır umut vericidir fakat yalnız yedi sinyaldir; `%100` kalıcı başarı
garantisi değildir. Bu nedenle model her yeni günde aynı alanları toplamaya ve
sonuçlarla yeniden ölçülmeye devam eder.

## 1.60 oran bulgusu

`1.60+` oran kör testte doğruluğu artırmadı. Uygun dokuz adayda 4/9 doğru
(`%44,4`) kaldı. Tam doğrulanmış kümede `%76` eşiğini geçen `1.60+` aday yoktu.
Bu sebeple doğruluk modunun varsayılan oranı `1.40` bırakıldı; `1.60` yalnız
isteğe bağlı ortam ayarıdır.

## V16 farkı

- EDGE karar dışı; yalnız denetim için kaydedilir.
- Dino tek başına sınıf veya market seçmez.
- Canlı oran marjı normalize edilir.
- Pre-match seçilen ALT/ÜST çizgisi doğrudan modele girer.
- Şut, isabet, korner, xG, topa sahip olma, kart, faul, ofsayt ve kurtarış
  tempoları birlikte değerlendirilir.
- Takım istatistiği, standings ve API prediction V16 girdisidir; tamlık durumu
  kaydedilir fakat eksiklik tek başına Telegram vetosu değildir.
- Telegram öncesi taze veriyle hem Python hem V16 tekrar çalışır.
- Maç başına en fazla bir sinyal seçilir.

Modelin Python ve Node.js uygulamaları 40 sabit testte karşılaştırıldı; ham ve
kalibre edilmiş olasılık farkı `0` bulundu.
