import sys
import json
import joblib
import pandas as pd
import warnings
import os

warnings.filterwarnings("ignore")

# ---------------------------------------------------------
# MODEL DOSYALARI
# ---------------------------------------------------------

HEDEFLER = [
    "ms1",
    "x",
    "ms2",
    "0.5_ust",
    "1.5_ust",
    "2.5_ust",
    "3.5_ust",
    "4.5_ust"
]

SUTUNLAR = [
    "dakika",
    "home_shot",
    "away_shot",
    "home_sot",
    "away_sot",
    "home_corner",
    "away_corner"
]


# ---------------------------------------------------------
# MODELLERİ BİR KERE YÜKLE
# ---------------------------------------------------------

def modelleri_yukle():
    modeller = {}

    for hedef in HEDEFLER:
        dosya = f"dino_{hedef}_modeli.pkl"

        if not os.path.exists(dosya):
            continue

        try:
            modeller[hedef] = joblib.load(dosya)
        except Exception as e:
            print(
                json.dumps({
                    "hata": f"{dosya} yüklenemedi: {str(e)}"
                }),
                file=sys.stderr
            )

    return modeller


# ---------------------------------------------------------
# POZİTİF SINIF OLASILIĞI
# ---------------------------------------------------------

def pozitif_olasilik(model, X):
    try:
        probs = model.predict_proba(X)

        # Modelde classes_ varsa gerçek 1 sınıfını bul
        if hasattr(model, "classes_"):
            classes = list(model.classes_)

            if 1 in classes:
                index = classes.index(1)
                return probs[:, index]

        # Standart binary model
        if probs.shape[1] >= 2:
            return probs[:, 1]

        return probs[:, 0]

    except Exception:
        return None


# ---------------------------------------------------------
# ANA FONKSİYON
# ---------------------------------------------------------

def ana_fonksiyon():

    try:
        raw = sys.stdin.read()

        if not raw.strip():
            print(json.dumps({
                "hata": "Python'a veri gönderilmedi."
            }))
            return

        maclar = json.loads(raw)

        if not isinstance(maclar, list):
            print(json.dumps({
                "hata": "Beklenen veri listesi."
            }))
            return

    except Exception as e:
        print(json.dumps({
            "hata": f"JSON okuma hatası: {str(e)}"
        }))
        return


    # -----------------------------------------------------
    # MODELLERİ TEK SEFER YÜKLE
    # -----------------------------------------------------

    modeller = modelleri_yukle()

    if not modeller:
        print(json.dumps({
            "hata": "Hiçbir .pkl modeli bulunamadı."
        }))
        return


    # -----------------------------------------------------
    # DATAFRAME
    # -----------------------------------------------------

    try:

        satirlar = []

        for mac in maclar:

            satirlar.append([
                float(mac.get("dakika", 0)),
                float(mac.get("home_shot", 0)),
                float(mac.get("away_shot", 0)),
                float(mac.get("home_sot", 0)),
                float(mac.get("away_sot", 0)),
                float(mac.get("home_corner", 0)),
                float(mac.get("away_corner", 0))
            ])

        X = pd.DataFrame(
            satirlar,
            columns=SUTUNLAR
        )

    except Exception as e:

        print(json.dumps({
            "hata": f"DataFrame oluşturulamadı: {str(e)}"
        }))
        return


    # -----------------------------------------------------
    # SONUÇLAR
    # -----------------------------------------------------

    sonuclar = [
        {}
        for _ in maclar
    ]


    # -----------------------------------------------------
    # HER MODELİ TOPLU TAHMİN ET
    # -----------------------------------------------------

    for hedef, model in modeller.items():

        try:

            yuzdeler = pozitif_olasilik(model, X)

            if yuzdeler is None:
                continue

            for i, yuzde in enumerate(yuzdeler):

                if hedef not in sonuclar[i]:
                    sonuclar[i][hedef.upper()] = round(
                        float(yuzde) * 100,
                        1
                    )

        except Exception:
            continue


    # -----------------------------------------------------
    # ALT MARKETLERİNİ ÜRET
    # -----------------------------------------------------

    for sonuc in sonuclar:

        for barem in [
            "0.5",
            "1.5",
            "2.5",
            "3.5",
            "4.5"
        ]:

            ust = f"{barem}_UST"

            if ust in sonuc:

                sonuc[f"{barem}_ALT"] = round(
                    100 - sonuc[ust],
                    1
                )


    # -----------------------------------------------------
    # NODE'A GERİ DÖN
    # -----------------------------------------------------

    print(json.dumps(
        sonuclar,
        ensure_ascii=False
    ))


if __name__ == "__main__":
    ana_fonksiyon()
