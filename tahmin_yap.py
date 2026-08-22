import sys
import json
import joblib
import pandas as pd
import warnings
# Gereksiz uyari mesajlarini gizle (Node.js tarafinda JSON parsing hatasi verdirmesin diye)
warnings.filterwarnings('ignore') 

def ana_fonksiyon():
    # 1. NODE.JS'TEN GELEN VERILERI AL
    # sys.argv[1] den baslar cunku sys.argv[0] 'tahmin_yap.py' dosyasinin kendi adidir.
    try:
        dakika = float(sys.argv[1])
        home_shot = float(sys.argv[2])
        away_shot = float(sys.argv[3])
        home_sot = float(sys.argv[4])
        away_sot = float(sys.argv[5])
        home_corner = float(sys.argv[6])
        away_corner = float(sys.argv[7])
    except IndexError:
        # Eger Node.js eksik veri gonderirse sistemi patlatmak yerine hata JSON'u donuyoruz
        print(json.dumps({"hata": "Eksik parametre gonderildi. 7 adet deger bekleniyor."}))
        sys.exit()
    except ValueError:
        print(json.dumps({"hata": "Gonderilen parametreler sayisal (float/int) degil."}))
        sys.exit()

    # 2. VERIYI YAPAY ZEKANIN ANLAYACAGI TABLO FORMATINA (DATAFRAME) CEVIR
    sutunlar = ['dakika', 'home_shot', 'away_shot', 'home_sot', 'away_sot', 'home_corner', 'away_corner']
    canli_mac = pd.DataFrame([[dakika, home_shot, away_shot, home_sot, away_sot, home_corner, away_corner]], 
                             columns=sutunlar)

    # 3. KLASORDEKI .PKL BEYINLERINI TARAMA VE OLASILIK HESABI
    hedefler = ['ms1', 'x', 'ms2', '0_5_ust', '1_5_ust', '2_5_ust', '3_5_ust', '4_5_ust']
    sonuclar = {}

    for hedef in hedefler:
        dosya_adi = f"dino_{hedef}_modeli.pkl"
        try:
            # Beyni (modeli) klasorden yukle
            model = joblib.load(dosya_adi)
            
            # Predict_proba komutu bize [0 gelme ihtimali, 1 gelme ihtimali] seklinde dizi verir
            # Bize 1 (Yani ustu/ms1 olma) ihtimali lazim oldugu icin [0][1] diyoruz.
            yuzde = model.predict_proba(canli_mac)[0][1] * 100
            
            # Key ismini Node.js'te guzel gozuksun diye duzelt (Ornek: 2_5_ust -> 2.5_UST)
            temiz_isim = hedef.upper().replace('_', '.').replace('.UST', '_UST')
            if temiz_isim in ['MS1', 'X', 'MS2']:
                sonuclar[temiz_isim] = round(yuzde, 1)
            else:
                sonuclar[temiz_isim] = round(yuzde, 1)
                
        except FileNotFoundError:
            # Eger ilgili marketin modeli klasorde yoksa atla
            continue

    # 4. BEDAVA MARKETLERI (ALT) TURETME (100 - UST Ihtimali)
    if '0.5_UST' in sonuclar:
        sonuclar['0.5_ALT'] = round(100 - sonuclar['0.5_UST'], 1)
    if '1.5_UST' in sonuclar:
        sonuclar['1.5_ALT'] = round(100 - sonuclar['1.5_UST'], 1)
    if '2.5_UST' in sonuclar:
        sonuclar['2.5_ALT'] = round(100 - sonuclar['2.5_UST'], 1)
    if '3.5_UST' in sonuclar:
        sonuclar['3.5_ALT'] = round(100 - sonuclar['3.5_UST'], 1)
    if '4.5_UST' in sonuclar:
        sonuclar['4.5_ALT'] = round(100 - sonuclar['4.5_UST'], 1)

    # 5. NODE.JS'IN OKUYABILECEGI TEK SATIRLIK JSON CIKTISINI YAZDIR
    print(json.dumps(sonuclar))

if __name__ == "__main__":
    ana_fonksiyon()