# V17.2 değişiklik notları

- Ayrı yapay zekâ kör-test motoru sistemden kaldırıldı.
- Arka plandaki harici yapay zekâ çağrıları tamamen durduruldu.
- Kör-test geçmişi, sonuç takibi ve JSON/CSV indirme API uçları kaldırıldı.
- Paneldeki "Sadece Yapay Zekâ Kör Testi" kartı ve otomatik yenilemesi kaldırıldı.
- V17.1 market tarifesi, V16 puanlaması, tam-stat denetimi, Telegram sinyalleri
  ve bir ilk + bir takip sinyali mantığı değiştirilmedi.
- Sunucuda önceden oluşmuş `dino_grok_only_history.json` dosyası artık okunmaz
  veya yazılmaz; geçmiş veriyi korumak amacıyla otomatik silinmez.
