# Tam-Stat Aday Tablosu Sayfalama

Tarih: 24.09.2026

## Değişiklik

- Tam-stat aday tablosunun mevcut görünümü korunmuştur.
- Temel, V16/V18, pre-match destek, gölge test, EDGE, oran, karar ve sonuç alanları aynen gösterilir.
- Panel artık bir defada en fazla 200 kayıt yükler.
- İlk, önceki, sayfa seçimi, sonraki ve son düğmeleriyle bütün arşiv gezilebilir.
- Tarih değiştirildiğinde görünüm otomatik olarak ilk sayfaya döner.
- JSON ve CSV dışa aktarımları bütün seçili tarih aralığını vermeye devam eder; sayfalama yalnız panel tablosuna uygulanır.

## Teknik Not

`/api/candidate-history` uç noktası `page` ve `limit` parametrelerini kabul eder ve toplam kayıt/sayfa bilgisini `pagination` alanında döndürür. Böylece binlerce kayıt aynı anda tarayıcı belleğine taşınmaz.
