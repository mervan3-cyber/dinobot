# Dino V16.2 değişiklikleri

- Mevcut V16.1 karar ve Telegram hattı değiştirilmedi.
- Bağımsız `Sadece Yapay Zekâ Kör Testi` eklendi.
- Yalnız tam-stat ve 25–80. dakika maçlar Grok'a gider.
- Kimlik körlüğü uygulanır: takım, lig ve fixture bilgileri Grok'a gönderilmez.
- Grok yalnız API'nin o anda sunduğu 1X2/toplam gol marketlerinden seçim yapar.
- Seçilebilecek canlı oran alt sınırı `1.50`dir.
- Her maçta en fazla bir Grok seçimi kaydedilir; pas verilen maç daha sonraki
  dakikada yeniden değerlendirilebilir.
- Grok'un seçtiği market ve oran sunucunun gerçek teklif listesinden doğrulanır;
  modelin uydurduğu market/oran kabul edilmez.
- Grok/proxy hatası V16, Python ve Telegram taramasını bekletmez.
- Grok kararları Telegram'a gönderilmez ve V16 kararını etkilemez.
- Seçimler maç bitince otomatik sonuçlandırılır; başarı, ortalama oran ve teorik
  ROI panelde ayrı hesaplanır.
- Kör-test kararları JSON ve CSV olarak dışa aktarılabilir.
