# DINO v15.3 — Precision 50 ve Taze Veri Doğrulaması

- Tarama ve aday kaydı 25–80. dakikada devam eder.
- Telegram için sürpriz ve güçlü dahil bütün marketlerin dakika aralığı 50–80'dir.
- Minimum canlı oran 1.40, varsayılan minimum EDGE %3 ve exact pre-match toplam desteği %45 korunmuştur.
- İlk model seçimi doğrudan Telegram'a gitmez.
- Seçilen fixture için güncel fixture, `/fixtures/statistics` ve `/odds/live?fixture=ID` yeniden çekilir.
- Şut/isabet/korner eksikliği, isabetin şuttan büyük olması, skor-isabet çelişkisi,
  kümülatif stat düşüşü ve skor değişirken donmuş stat tespit edilirse sinyal engellenir.
- Taze doğrulama geçerse Python tek maç için ikinci kez çalışır; Telegram yalnız
  ikinci sonuç ve taze oranla gönderilir.
- Telegram mesajında `Taze Veri: Skor + canlı stats + oran doğrulandı` satırı görünür.
- Gölge sistemde takım/lig/sezon/fixture kimliği ve minimum 5 ev/deplasman maçlık
  örneklem ayrıca doğrulanır.
- Gölge standings, team statistics ve API prediction verileri yine karara etki etmez;
  JSON/CSV ve panelde `fullyVerified` olarak ölçülür.
- Eski gölge cache sürümü otomatik yenilenir; sinyal, aday ve ayar geçmişleri korunur.
