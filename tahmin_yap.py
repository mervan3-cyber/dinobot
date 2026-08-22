import sys
import json
import joblib
import pandas as pd
import warnings

# Gereksiz uyari mesajlarini gizle
warnings.filterwarnings('ignore') 

def ana_fonksiyon():
    try:
        dakika = float(sys.argv[1])
        home_shot = float(sys.argv[2])
        away_shot = float(sys.argv[3])
        home_sot = float(sys.argv[4])
        away_sot = float(sys.argv[5])
        home_corner = float(sys.argv[6])
        away_corner = float(sys.argv[7])
    except (IndexError, ValueError):
        print(json.dumps({"hata": "Parametre hatası."}))
        sys.exit()

    sutunlar = ['dakika', 'home_shot', 'away_shot', 'home_sot', 'away_sot', 'home_corner', 'away_corner']
    canli_mac = pd.DataFrame([[dakika, home_shot, away_shot, home_sot, away_sot, home_corner, away_corner]], columns=sutunlar)

    # DÜZELTİLDİ: Dosya isimleriyle BİREBİR aynı olması için alt çizgi yerine nokta kullanıldı.
    hedefler = ['ms1', 'x', 'ms2', '0.5_ust', '1.5_ust', '2.5_ust', '3.5_ust', '4.5_ust']
    sonuclar = {}

    for hedef in hedefler:
        dosya_adi = f"dino_{hedef}_modeli.pkl"
        try:
            model = joblib.load(dosya_adi)
            yuzde = model.predict_proba(canli_mac)[0][1] * 100
            
            # Node.js tarafı '0.5_UST', 'MS1' gibi büyük harfli ve noktalı bekliyor.
            temiz_isim = hedef.upper() 
            sonuclar[temiz_isim] = round(yuzde, 1)
                
        except FileNotFoundError:
            # Klasörde o model yoksa (Örn: dino_x_modeli.pkl yoksa) sessizce atlar
            continue

    # BEDAVA MARKETLER (ALT) - Üst ihtimallerinden otomatik türetilir
    if '0.5_UST' in sonuclar: sonuclar['0.5_ALT'] = round(100 - sonuclar['0.5_UST'], 1)
    if '1.5_UST' in sonuclar: sonuclar['1.5_ALT'] = round(100 - sonuclar['1.5_UST'], 1)
    if '2.5_UST' in sonuclar: sonuclar['2.5_ALT'] = round(100 - sonuclar['2.5_UST'], 1)
    if '3.5_UST' in sonuclar: sonuclar['3.5_ALT'] = round(100 - sonuclar['3.5_UST'], 1)
    if '4.5_UST' in sonuclar: sonuclar['4.5_ALT'] = round(100 - sonuclar['4.5_UST'], 1)

    print(json.dumps(sonuclar))

if __name__ == "__main__":
    ana_fonksiyon()
