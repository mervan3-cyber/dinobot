# Maç Yakala · Ek Telegram ve X

Sürüm 2.5.0 · `mac-yakala-sharing-2026-09-16`

## .env içine eklenecekler

Mevcut `.env` dosyasını **değiştirip boşaltmayın**; aşağıdaki yeni satırları ekleyin. Gerçek anahtarları sohbet, panel veya ekran görüntüsü üzerinden paylaşmayın.

```dotenv
PANEL_ADMIN_PASSWORD=
TELEGRAM_EXTRA_CHAT_ID=
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

- `PANEL_ADMIN_PASSWORD`: sizin belirlediğiniz, en az 12 karakterlik benzersiz güçlü panel şifresi. Eski HTML içindeki sabit şifre kaldırıldı. Boşsa panel/API girişleri kapalıdır; botun ana Telegram çalışması bundan etkilenmez.
- `TELEGRAM_EXTRA_CHAT_ID`: ikinci grubun **sayısal negatif chat ID’si**, örneğin `-100…`. Grup adı yazılmaz. Botu bu gruba ekleyin ve mesaj gönderme izni verin. Aynı bot token’ı kullanılır. Ana hedefin ID’si yazılamaz.
- `X_API_KEY`, `X_API_SECRET`: X uygulamasının API Key ve API Key Secret değerleri.
- `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`: paylaşım yapılacak **kullanıcı hesabının** OAuth 1.0a Access Token ve Access Token Secret değerleri. Uygulamanın Read and Write yetkisi olmalı; yetki sonradan değiştiyse uygun kullanıcı token’larını yeniden üretmek gerekebilir. Bearer Token tek başına yeterli değildir.

Mevcut `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, API-Football, Gemini ve model ayarlarınızı koruyun.

`.env` kaydedildikten sonra `pm2 restart dinobot --update-env`. Süreç adınız farklıysa onu kullanın. Paneli sunucu adresinden Ctrl+F5 ile yenileyin, yeni şifrenizle girin ve **Paylaşım Ayarları** bölümünü açın. İki ek hedef başlangıçta **kapalıdır**. Anahtarları istediğiniz zaman ayrı ayrı açın. Panel değişiklikleri hemen uygulanır ve yeniden başlatmada korunur. `.env hazır` yalnız alanların girildiği anlamına gelir, canlı API izinlerinin doğrulandığı anlamına gelmez.

## Gönderim davranışı

- V21/V22 model kuralları, lab ve ana Telegram değişmedi. Ana kanala başarıyla gönderilen **aynı sinyal**, açık olan ek hedeflere kopyalanır. Ana gönderim başarısızsa ek hedeflere gönderilmez.
- Tek sinyalin farklı hedeflerdeki kopyaları paylaşılan sinyal istatistiklerine **ikinci kez eklenmez**.
- V21 35. dakikada, V22 60. dakikada aynı marketi seçerse yine iki ayrı sinyal olabilir. Ek hedefler aynı davranışı izler.
- Ek grup kendi mesajına `✅✅✅ YAKALADIK!` yanıtını yalnız kesinleşmiş kazanç için bir kez alır. Kayıp mesajı yoktur.
- **X sadece sinyal gönderir.** Sonuç yanıtı, Yakaladık, kayıp veya gün sonu paylaşımı yapılmaz. Otomatik zincir yoktur.
- Ek grubun anahtarını kapatmak veya `.env` ID’sini silip yeniden başlatmak ana kanalı etkilemez. Ek gruba hem yeni sinyaller hem sonuç yanıtları durur. Yola çıkmış bir API isteği geri alınamaz.
- Tekrar açmak geçmiş sinyalleri paylaşmaz. Kapatmadan önceki ek grup mesajlarının henüz gönderilmemiş sonuç yanıtları da tekrar açınca topluca gönderilmez. Ana kanalın sonuç takibi devam eder.
- `.env` içindeki ek grup veya X kullanıcı token’ı değiştirilirse/kaldırılırsa yeniden başlatmada ilgili anahtar güvenlik için kapalıya alınır. Yeni hedef için panelden tekrar açın.
- X veya ek grup hatası ana kanalın gönderimini geri almaz. Zaman aşımı/belirsiz cevap otomatik tekrar edilmez; böylece çift mesaj riski azaltılır. Bazı kopyalar bu nedenle kaçabilir. Panel son gönderimin durumunu gösterir. Ek grup sonuç yanıtında açık bir 429 varsa belirtilen süre sonra tekrar denenir.

## X metin uzunluğu — henüz karar verilmesi gereken nokta

Bu sürümde Telegram metninin tamamı, yalnız HTML kalın yazı etiketleri çıkarılarak X’e tek gönderi olarak hazırlanır. Analiz veya maç alanları sessizce kırpılmaz; gönderi yanıt zincirine bölünmez.

X’in standart limiti **280 ağırlıklı karakterdir**. Analizli sinyaller bunu aşabilir. Read/Write yetkisi tek başına uzun metin desteği anlamına gelmez. API uzun metni reddederse X kopyası gönderilmez, panelde hata görünür; Telegram sinyalleri çalışmaya devam eder. Canlı hesap/yetki testi yapılmadı.

Uzun sinyallerin X’te de düzenli paylaşılması için **analizi kısaltma / tam metni görsel kart yapma / doğrulanmış uzun gönderi API desteği** seçeneklerinden biri ayrıca netleştirilmeli. Bu karar verilmeden X’i kapalı bırakmanız önerilir. Bu paket kendiliğinden bunlardan birini seçmez.

Kaynaklar: [X gönderi API’si](https://docs.x.com/x-api/posts/create-post), [karakter sayımı](https://docs.x.com/fundamentals/counting-characters), [OAuth 1.0a imzası](https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature).

## Panel güvenliği

Sunucu tarafında şifre doğrulama, süreli HttpOnly/SameSite oturum çerezi, giriş deneme sınırı ve aynı-origin işlem kontrolü var. API/JSON/CSV indirmeleri de oturum ister. Yeni sekmede indirme aynı panel oturumu ile çalışır. Yeniden başlatma veya 8 saat sonunda tekrar giriş gerekir. Yerel `file://index.html` kullanımı kaldırıldı; paneli botun web adresinden açın.

Bu paket TLS/HTTPS kurmaz. Paneli açık internet üzerinde düz HTTP ile kullanmayın; **HTTPS** veya SSH tüneli kullanın. SSH tüneli örneği: kendi bilgisayarınızda `ssh -L 3300:127.0.0.1:3000 root@SUNUCU_ADRESINIZ`, ardından `http://127.0.0.1:3300`. HTTPS proxy kullanıyorsanız `Host` başlığını orijinal panel alan adı olarak iletin. Şifre/tokenları proxy günlüklerine yazmayın.

## Saklama ve güncelleme

Önce botu durdurup uygulama dizinini yedekleyin. Paket dosyalarını mevcut dizine yükleyin; klasörü boşaltmayın. Tek PM2 instance kullanın. Birden fazla cluster worker desteklenmez.

Şunları **silmeyin veya eski yedeğe tek başına döndürmeyin**:

- `dino_signal_history.json`
- `mac_yakala_telegram_delivery.json`
- `mac_yakala_sharing_settings.json`
- `mac_yakala_sharing_delivery.json`

Son iki dosya yeni ayarlar ve kopya gönderim günlüğüdür; uygulama tarafından oluşturulur. Bozuk dosya sessizce sıfırlanmaz. Ek paylaşım dosyası sorunu ana Telegram’ı durdurmaz; ana Telegram’ın kendi güvenlik kontrolleri korunur.

27 test paketi çevrimdışı çalışır. Hiçbir gerçek Telegram/X gönderimi veya sunucuya dağıtım yapılmadı. Bağımlılıklar ve model dosyaları değiştirilmedi.
