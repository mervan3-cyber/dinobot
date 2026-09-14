# V23 · Gol Geçmişi Kontrolü — deney v1

Build: `ml-v23-goal-history-shadow-ubuntu-2026-09-14`; paket 2.3.0.

## Amaç ve kapsam

“ÜST adayına geçmiş gol profili ekleyince işe yarıyor mu?” sorusunu ileri testte ölçer. Yeni eğitilmiş bir model değildir. Yalnız kurulumdan sonra oluşan **aynı V21 sinyalini, aynı dakika/market/oranla** değerlendirir. Bir ret sonrası daha geç kazanan market aramaz. V21 bağımsız kaydı değişmez; V23 onayı/ret kararı Telegram'a veya diğer lab kollarına bağlanmaz.

Mevcut V21 bazı: tüm üç model >%50; aynı market Pre >%50; kayıt EDGE −5…0; ÜST; dakika 25–80; oran 1.50–4.00. Pre yine odds kaynaklı destektir, gol geçmişi değildir. Modellerin de kullandığı bu destek bağımsız dördüncü oy gibi sayılmaz.

## Profil ve deney hesabı

API-Football fixtures kullanılır; kimlik/lig/sezon kontrolü yapılır. Yalnız FT ve 90 dakika skorları; aynı lig, en fazla 365 gün. Canlı maçın kendisi, daha sonraki maçlar ve başlama anına 6 saatten yakın maçlar dışarıda kalır. Mevcut sezon azsa önceki sezon için en çok bir ek istek yapılır; başka ligdeki maçlar alınmaz. Geçmiş maçların sonradan düzeltilmesi ihtimaline karşı kullanılan profil anlık görüntüsü karar kaydında dondurulur. Sinyalden sonra indirilen profil o karara eklenmez.

- Son 5 ve 10: atılan/yenen gol ortalaması, gol atamama ve gol yememe oranları.
- Aynı ligde son 365 gün ev/deplasman ayrımı ve mevcut sezonun ayrıca ev/deplasman özetleri.
- Yeterlilik: her iki takım için en az 10 genel ve ilgili mekânda 5 maç; son maç en fazla 60 gün önce.
- Örneklem az, kimlik eksik, profil hazır değil, kart sayısı eksik veya kırmızı kart var: **veri yetersiz**. Sonuç yine takip edilir.

Referans hesap (eşikler eğitilmedi/optimize edilmedi):

1. Her takım için atılan ve yenen gol: %50 son 10 + %50 ilgili mekândaki son 365 gün ortalaması.
2. Ev gol hızı = (ev atılan + deplasman yenen) / 2. Deplasman gol hızı ters eşleşmeyle aynı hesap.
3. Kalan toplam gol beklentisi = iki hızın toplamı × (90 − dakika) / 90.
4. Gereken gol = taban(market çizgisi) + 1 − mevcut toplam gol.
5. Poisson referansında gereken veya daha çok golün olasılığı en az %50 ise **onay**, değilse **ret**.

Bu, sabit hız varsayımıdır; canlı tempo değişikliklerini, rakip kalitesini tam olarak veya maç içi koşulları öğrenmiş bir model değildir. Örneğin aynı dakika 1.5 ÜST/1–0 bir gol, 2.5 ÜST/1–0 iki gol ister. İki takımın da gol atması zorunlu tutulmaz. Son 5 maç son 10 içinde olduğundan ayrıca ağırlık/bağımsız oy değildir; “son 5'te en az 3 kez gol atamamış” notu görünür.

## Makaleden hangi çıkarım kullanıldı?

Kırmızı kart, skor durumu ve uzatmaların gol hızını etkileyebileceği dikkate alınarak bu durumlar görünür tutuldu; **%30 / %10 / %20 model olasılığına eklenmedi/çıkarılmadı**. İlk sürüm kartlı maç için güvenilir koşullu hız modeli iddia etmez. Skor önde/geride/eşit olarak kaydedilir, ancak araştırma katsayısı uygulanmaz; uzatma katkısı sıfırdır. Geçmiş “hangi durumda gol atamıyor?” sorusunun skor/kart koşullu cevabı için tarihsel olay zamanları gerekir; bu sürüm bunları toplamaz. Son skor ve ev-deplasman geçmişiyle bunun hesaplandığı iddia edilmez.

Kaynaklar: [Maia ve diğerleri — Stochastic modelling of football matches](https://arxiv.org/abs/2312.04338), [API-Football resmi veri rehberi](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [API kota/cache rehberi](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage).

## Ölçüm

Panel: tüm eşleştirilmiş V21 bazı, yalnız yeterli verili baz, onay, ret ve veri yetersiz. Her grupta adet, K/Y, bekleyen, isabet ve eşit birim bahisli teorik ROI. Ret grubunun kayıpları “elenen kayıp”, kazananları “kaçırılan kazanan”dır. Bunlar canlıda engellenmiş bahis değildir; sadece gölge karşılaştırmadır. Veri kapsamı ve korunan aday oranı ayrıca gösterilir. Bu V21 kohortu tüm geçmiş V21 ile aynı sayı olmak zorunda değildir; V23 başladığından sonraki yeni kayıtlarla sınırlıdır.

Ret/eksik veri kararını maç kaybıyla karıştırmayın. Bekleyenler başarı paydasına alınmaz. Ek süre/penaltı genel skoru 90 dakika sonucu yerine kullanılmaz. İlk yeterli örneklem oluşmadan veya tek başarılı gün gördükten sonra eşiği değiştirmeyin. Bu referansın daha iyi olduğu henüz canlı veride doğrulanmadı.

## Teknik güvenlik ve doğrulama

`v23_goal_profile.js`: sınırlı seri önbellek, iki sezon sınırı, kimlik ve as-of filtreleri. `v23_goal_policy.js`: sabit sürümlü referans. `v23_goal_lab.js`: ayrı atomik geçmiş, tüm kararların sonucu, tekil profil depolama. `v23_export.js`: geri basınç destekli JSON akışı.

Önbellek tarama bitince 12 isteğe kadar ısınır; günlük üst sınır 80, mevcut kota rezervi korunur. Başlamış istek en fazla 6 saniye sürer. Her aday için ek canlı API/model çağrısı yoktur. Önbellek azami 600 anahtar, geçmiş 12.000 kayıt; geçmiş sınırında silme yapılmaz. Mevcut büyük tam-stat dışa aktarım kodu bu sürümde değiştirilmedi; akışlı dışa aktarım yalnız V23'e eklendi.

23 çevrimdışı test dosyası: eski 18 korundu; V23 için profil/kota, hesap, kalıcı geçmiş/sonuç/akışlı dışa aktarım, gerçek sunucu akışı ve DOM/panel testleri eklendi. Gerçek API anahtarı, Telegram ve sunucu kullanılmadı. Canlı API planının geçmiş sezon erişimi ve kart alanlarının doluluğu kurulumdan sonra ayrıca gözlenmelidir.

Önceki model ağırlıkları ve tarifeler değiştirilmedi. Eski raporlar arşiv referansıdır; güncel kurulum belgesi `UBUNTU_KURULUM.md`.
