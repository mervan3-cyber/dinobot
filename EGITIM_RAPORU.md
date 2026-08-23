# DINO Canlı Model — Sıfırdan Eğitim Raporu

## Veri kapsamı

- `ginf.csv`: 10.112 benzersiz maç.
- `events.csv`: 941.009 olay ve 9.074 olaylı maç.
- Event golleri ile final skoru uyuşmayan 25 maç eğitimden çıkarıldı.
- Kullanılan temiz maç sayısı: 9.049.
- Her maç için 25–80. dakikalar arasında 5 dakikalık 12 snapshot üretildi.
- Toplam eğitim örneği: 108.588.
- Dönem: 5 Ağustos 2011 – 22 Ocak 2017.
- Ligler: Premier League, Ligue 1, Serie A, Bundesliga ve La Liga.

## Veri ayrımı

Maç snapshot'ları rastgele karıştırılmadı. Aynı maçın farklı dakikalarının farklı
bölümlere sızmaması için tarih bazlı ayrım kullanıldı.

- Eğitim: 6.294 maç / 75.528 snapshot.
- Doğrulama: 1.780 maç / 21.360 snapshot.
- Dokunulmamış test: 975 maç / 11.700 snapshot.

## Yeni özellikler

Eski modelde olmayan mevcut skor modele eklendi. Model şu canlı girdileri kullanır:

- Dakika ve kalan süre.
- Güncel ev/deplasman skoru.
- Toplam şutlar.
- İsabetli şutlar.
- Kornerler.
- Farklar, dakika başına hızlar ve skor-zaman etkileşimleri.
- Varsa maç öncesi, marjı temizlenmiş 1X2 piyasa olasılıkları.

Eksik değerler sıfıra dönüştürülmez. Eksik temel istatistikli maç tahmin edilmez.

## Model yapısı

- MS1/X/MS2: Tek bir çok-sınıflı softmax modeli. Olasılıkların toplamı daima %100.
- Gol marketleri: Kalan gol sayısı için tek model. 0.5–4.5 Alt/Üst olasılıkları
  aynı dağılımdan türetildiği için baremler birbiriyle çelişmez.
- Kalibrasyon: Ayrı doğrulama döneminde temperature scaling.
- Üç varyant vardır:
  - `score_only`: Şut/isabet/korner yoksa yalnızca dakika + güncel skor.
  - `live_only`: Yalnızca canlı skor ve istatistikler.
  - `live_plus_prematch`: Canlı veri + maç öncesi 1X2 öncülü.

## Dokunulmamış test sonuçları

### Canlı veri + maç öncesi öncül

- MS1/X/MS2 doğruluğu: %68,1.
- MS1/X/MS2 log-loss: 0,720.
- Kalibrasyon hatası: yaklaşık %1,9.
- 2.5 Alt/Üst doğruluğu: %76,1.
- 2.5 Alt/Üst log-loss: 0,460.

### Yalnızca canlı veri

- MS1/X/MS2 doğruluğu: %65,8.
- MS1/X/MS2 log-loss: 0,759.
- Kalibrasyon hatası: yaklaşık %1,4.
- 2.5 Alt/Üst doğruluğu: %76,0.
- 2.5 Alt/Üst log-loss: 0,462.

### Dakika + skor fallback

- MS1/X/MS2 doğruluğu: %65,1.
- MS1/X/MS2 log-loss: 0,776.
- 2.5 Alt/Üst doğruluğu: %76,1.
- 2.5 Alt/Üst log-loss: 0,465.

Maç öncesi piyasa baseline'ının MS1/X/MS2 doğruluğu %56,3 ve log-loss değeri
0,937 idi. Canlı model test döneminde bu referansı geçti.

## Dakikaya göre güçlü sürüm

- 25. dakika MS1/X/MS2: yaklaşık %59,8.
- 45. dakika MS1/X/MS2: yaklaşık %64,0.
- 60. dakika MS1/X/MS2: yaklaşık %70,6.
- 75. dakika MS1/X/MS2: yaklaşık %77,7.
- 80. dakika MS1/X/MS2: yaklaşık %81,4.

## Sınırlar

- Modelin eğitim verisi beş büyük ligden gelir. Aktif server lig filtresi uygulamaz;
  API'nin sunduğu 25–80. dakika arasındaki tüm canlı maçları tarar ve VIP ligleri
  yalnızca işlem sıralamasında öne alır. Eğitim dışı liglerde yapılan tahminler
  ligden bağımsız canlı skor/şut/isabet/korner kalıplarının aktarımıdır ve
  güvenilirliği beş eğitim ligine göre daha düşük olabilir.
- Veri 2011–2017 dönemindendir; güncel futbol yapısında performans kayması olabilir.
- Veri setinde tarihsel canlı oran bulunmadığı için gerçek canlı-odds ROI backtest'i
  yapılamadı. İlk kullanım gölge modunda kaydedilmeli ve yeni canlı oranlarla ileriye
  dönük backtest yapılmalıdır.
- Model sonuçları kesinlik veya kazanç garantisi değildir.

## Dosyalar

- `server.js`: ML odaklı bot. Gemini yalnızca seçilmiş ML sonucunu açıklar.
- `tahmin_yap.py`: Paket bağımlılığı gerektirmeyen toplu tahmin betiği.
- `dino_live_models_all.json`: İki kalibre model varyantının ağırlıkları.
- `training_report.json`: Tam metrikler.
- `deployment_evaluation.json`: Dakika ve lig bazlı test dökümü.
- `server.ai-backup.js`: Önceki AI ağırlıklı sürümün yedeği.

Üç aktif dosya (`server.js`, `tahmin_yap.py`, `dino_live_models_all.json`) aynı
klasörde bulunmalıdır. Başlangıç logunda `ml-coverage-filter-ubuntu-v9-2026-08-23`
görülmelidir.
