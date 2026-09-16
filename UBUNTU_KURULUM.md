# Maç Yakala — Ubuntu kurulumu
Sürüm 2.4.0 · Build: mac-yakala-independent-telegram-2026-09-16
Paket: mac-yakala-v21-v22-telegram-ubuntu-2026-09-16.zip

Bu paket V22 + V21 bağımsız Telegram gönderimini açar. V20/V17 labda kalır. Ayrıntılar: [Değişiklik notları](MAC_YAKALA_DEGISIKLIKLER_2026-09-16.md).

## Güvenli güncelleme

1. PM2 süreç adını kontrol edin: `pm2 list`. Aşağıdaki örnek mevcut süreç adının `dinobot`, dizinin `/root/dinobot` olduğu kurulum içindir. Marka değişti diye mevcut süreç/dizin adını değiştirmeniz gerekmez.
2. Önce durdurun:

   ```bash
   pm2 stop dinobot
   ```

3. Uygulama dizinini .env, geçmişler, önbellekler ve arşivlerle birlikte ayrı bir konuma yedekleyin; yedeğin açıldığını kontrol edin. Tek süreç çalıştığından emin olun.
4. ZIP içindeki **bütün dosyaları** `/root/dinobot` içine yükleyin/üzerine yazın. Yalnız server.js yeterli değildir. Klasörü boşaltmayın.
5. Sunucuda:

   ```bash
   cd /root/dinobot
   npm ci --omit=dev
   npm test
   node --check server.js
   ```

6. Testler başarılıysa:

   ```bash
   pm2 restart dinobot --update-env
   pm2 save
   pm2 logs dinobot --lines 60 --nostream
   ```

7. Paneli sert yenileyin (Ctrl+F5). Build ve “TELEGRAM: V22 AÇIK + V21 AÇIK” logunu doğrulayın. “gönderim günlüğü hazır” beklenir.
8. İlk gerçek uygun sinyalde başlık/model/market-oran/footer ve maç bittikten sonra yanıtı gözlemleyin. Çevrimdışı testler canlı kanal izinlerini doğrulamaz.

## Korunacak dosyalar

ZIP'te .env, canlı geçmişler, API önbellekleri, eğitim arşivleri, node_modules ve özel veriler yoktur; hiçbirini silmeyin.
Özellikle `dino_signal_history.json` ve yeni oluşan `mac_yakala_telegram_delivery.json` birlikte korunmalıdır. Geçmişi/günlüğü sıfırlamak mükerrer gönderime yol açabilir.
Emekli V19/Çekirdek geçmişleri sunucuda kalır, yeni kod onları açmaz veya güncellemez.

## İsteğe bağlı Telegram anahtarları

Mevcut TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID ayarları kullanılır. Varsayılan olarak iki model de açıktır; .env'e yeni satır eklemek zorunlu değildir:

```dotenv
MAC_YAKALA_V21_TELEGRAM_ENABLED=true
MAC_YAKALA_V22_TELEGRAM_ENABLED=true
```

Birini false yapmak diğerinin veya labın çalışmasını kapatmaz. Lab ayarları mevcut DINO_V21_SHADOW_ENABLED / DINO_V22_SHADOW_ENABLED bayraklarıyla ayrı yönetilir. V20 bu paketle asla Telegram göndermez.
Sunucudaki ana sistem/tarama anahtarının açık ve program saatinin uygun olması gerekir. PM2 tek instance olmalı, cluster kullanılmamalıdır.

## Hata / geri dönüş

Test başarısızsa botu başlatmayın; hata çıktısını paylaşın. Kod yedeğine dönerken canlı geçmişleri eski kopyayla geriye almayın.
Gönderim günlüğü uyarısında dosyaları silerek çözmeye çalışmayın: bot dururken geçmiş ve günlük birlikte incelenmeli.
26 test dosyası gerçek API/Telegram çağrısı yapmaz; bağımlılık sürümleri değişmedi.
Botun Telegram profil adı, kullanıcı adı, kanal adı/biyografisi bu paket tarafından değiştirilmez; bunlar Telegram/BotFather üzerinden ayrıca düzenlenir.
