# Kupon LAB · İY/MS Öncelikli V3

Bu paket yalnız maç önü Kupon LAB bölümünü değiştirir. Canlı V22, V23 kapısı ve Telegram gönderimi değişmez.

## Değişiklikler

- İY/MS oranı bulunan bütün kombinasyonlar (`0/0` … `2/2`) puanlanır.
- Panel en güçlü üç İY/MS seçeneğini; uyum puanı, marjı temizlenmiş İY/MS piyasa yüzdesi ve risk etiketiyle gösterir.
- `1/2` ve `2/1` dönüşleri yalnız riskli/sürpriz LAB adayıdır ve puan cezası alır.
- Eksik takım profili artık İY/MS adayını tamamen silmez; veri güvenilirliği puanı düşer ve panelde `kısmi/zayıf` olarak kaydedilir.
- `0/0`, golsüz maç tahmini gibi değerlendirilmez. İlk yarı dengesi, MS beraberlik desteği, takım gol dengesi ve İY/MS piyasası birlikte puanlanır.
- İY/MS adayları seçim sıralamasında çifte şanstan önce gelir.
- Yalnız İY/MS adayı bulunmayan maçlardan varsayılan olarak en fazla 2 çifte şans seçilir. Bu sınır panelden değiştirilebilir.
- Gerçek olasılık iddiası yapılmaz: `puan` 0–100 uygunluk puanıdır; `piyasa %` bookmaker oranlarının marjı temizlenmiş desteğidir.

## Varsayılan ayar

```env
DINO_COUPON_MAX_DOUBLE_CHANCE=2
```

Paneldeki `Maksimum çifte şans` alanı kalıcıdır ve `.env` varsayılanını çalışma sırasında değiştirebilir.

