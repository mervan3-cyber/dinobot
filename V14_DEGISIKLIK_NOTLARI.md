# Dino v14 — Tam-Stat Aday Denetimi

## Sinyal kuralları

- Sürpriz: Dino %60–74.9, dakika 41–80.
- Güçlü: Dino %75+, dakika 25–80.
- Sabit minimum canlı oran: 1.40.
- Minimum EDGE panelden değiştirilir. Yeni paketin varsayılanı %3'tür;
  mevcut sunucudaki kayıtlı ayar korunursa panelden %3'e çekilebilir.
- ALT, ÜST, MS1, X ve MS2 marketleri kapatılmadı.

## Yeni aday geçmişi

`dino_candidate_history.json` ilk açılışta otomatik oluşur. Tam istatistikli
maçlarda modelin hesapladığı bütün desteklenen marketler kaydedilir. Canlı oranı
olmayan tahminler de bulunur. Her kayıtta filtre kararı ve daha sonra final sonucu
yer alır.

Paneldeki **Tam-Stat Aday Denetimi** bölümünden JSON veya CSV indirilebilir.
Bu dosya EDGE, oran, olasılık sınıfı, dakika, tekrar kilidi ve canlılık
kontrolü nedeniyle gönderilmeyen marketleri analiz etmek içindir.

## Veri güvenliği

- Mevcut skor toplam gol çizgisini zaten sonuçlandırmışsa market reddedilir.
  Örneğin skor 1-1 iken 1.5 ÜST/ALT oranı sinyal olamaz.
- API timeout süresi 30 saniyedir.
- Timeout, geçici ağ, 5xx ve 429 hataları kontrollü olarak tekrar denenir.
- Bir isteğin başarısız olması API kuyruğunu kalıcı olarak kilitlemez.
- Eksik canlı istatistikli maç Python'a veya Telegram'a gönderilmez.

## Korunan özellikler

Telegram, Gemini yorumlama, Python modeli, otomatik 10 dakika tarama, zamanlayıcı,
ayarlar, coverage paneli, loglar ve paylaşılan sinyal sonuç takibi korunmuştur.
