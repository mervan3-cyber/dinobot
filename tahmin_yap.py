import json
import math
import os
import sys


MODEL_FILE = os.path.join(os.path.dirname(__file__), "dino_live_models_all.json")


def sayi(value, alan):
    if value is None or value == "":
        raise ValueError(f"Eksik alan: {alan}")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Geçersiz alan: {alan}")
    return number


def skoru_oku(mac):
    if mac.get("home_score") is not None and mac.get("away_score") is not None:
        return sayi(mac["home_score"], "home_score"), sayi(mac["away_score"], "away_score")

    skor = str(mac.get("skor", ""))
    parts = skor.split("-")
    if len(parts) != 2:
        raise ValueError("Skor home_score/away_score veya 'H-A' biçiminde gerekli")
    return sayi(parts[0], "home_score"), sayi(parts[1], "away_score")


def temel_ozellikler(mac):
    minute = sayi(mac.get("dakika", mac.get("minute")), "dakika")
    home_score, away_score = skoru_oku(mac)
    home_shot = sayi(mac.get("home_shot"), "home_shot")
    away_shot = sayi(mac.get("away_shot"), "away_shot")
    home_sot = sayi(mac.get("home_sot"), "home_sot")
    away_sot = sayi(mac.get("away_sot"), "away_sot")
    home_corner = sayi(mac.get("home_corner"), "home_corner")
    away_corner = sayi(mac.get("away_corner"), "away_corner")

    safe_minute = max(minute, 1.0)
    phase = minute / 90.0
    goal_diff = home_score - away_score
    total_goals = home_score + away_score
    shot_diff = home_shot - away_shot
    sot_diff = home_sot - away_sot
    corner_diff = home_corner - away_corner
    home_lead = 1.0 if goal_diff > 0 else 0.0
    draw_state = 1.0 if goal_diff == 0 else 0.0
    away_lead = 1.0 if goal_diff < 0 else 0.0

    return {
        "minute": minute,
        "remaining_minutes": max(0.0, 95.0 - minute),
        "home_score": home_score,
        "away_score": away_score,
        "goal_diff": goal_diff,
        "total_goals": total_goals,
        "home_shot": home_shot,
        "away_shot": away_shot,
        "shot_diff": shot_diff,
        "home_sot": home_sot,
        "away_sot": away_sot,
        "sot_diff": sot_diff,
        "home_corner": home_corner,
        "away_corner": away_corner,
        "corner_diff": corner_diff,
        "home_shot_rate90": home_shot / safe_minute * 90.0,
        "away_shot_rate90": away_shot / safe_minute * 90.0,
        "home_sot_rate90": home_sot / safe_minute * 90.0,
        "away_sot_rate90": away_sot / safe_minute * 90.0,
        "home_corner_rate90": home_corner / safe_minute * 90.0,
        "away_corner_rate90": away_corner / safe_minute * 90.0,
        "home_accuracy": home_sot / max(home_shot, 1.0),
        "away_accuracy": away_sot / max(away_shot, 1.0),
        "home_lead": home_lead,
        "draw_state": draw_state,
        "away_lead": away_lead,
        "home_lead_late": home_lead * phase,
        "draw_late": draw_state * phase,
        "away_lead_late": away_lead * phase,
        "goal_diff_late": goal_diff * phase,
        "total_goals_late": total_goals * phase,
        "shot_diff_late": shot_diff * phase,
        "sot_diff_late": sot_diff * phase,
    }


def prematch_ekle(mac, features):
    keys = ["prematch_p_home", "prematch_p_draw", "prematch_p_away"]
    if all(mac.get(key) is not None for key in keys):
        p_home, p_draw, p_away = [sayi(mac[key], key) for key in keys]
        total = p_home + p_draw + p_away
        if total <= 0:
            return False
        p_home, p_draw, p_away = p_home / total, p_draw / total, p_away / total
    elif all(mac.get(key) is not None for key in ["odd_h", "odd_d", "odd_a"]):
        odd_h = sayi(mac["odd_h"], "odd_h")
        odd_d = sayi(mac["odd_d"], "odd_d")
        odd_a = sayi(mac["odd_a"], "odd_a")
        if min(odd_h, odd_d, odd_a) <= 1:
            return False
        inv = [1.0 / odd_h, 1.0 / odd_d, 1.0 / odd_a]
        total = sum(inv)
        p_home, p_draw, p_away = [value / total for value in inv]
    else:
        return False

    phase = features["minute"] / 90.0
    features.update({
        "prematch_p_home": p_home,
        "prematch_p_draw": p_draw,
        "prematch_p_away": p_away,
        "prematch_home_late": p_home * phase,
        "prematch_draw_late": p_draw * phase,
        "prematch_away_late": p_away * phase,
    })
    return True


def softmax(logits, temperature):
    scaled = [value / temperature for value in logits]
    peak = max(scaled)
    exp = [math.exp(value - peak) for value in scaled]
    total = sum(exp)
    return [value / total for value in exp]


def model_tahmini(model, features):
    names = model["feature_names"]
    vector = []
    for index, name in enumerate(names):
        raw = features[name]
        vector.append((raw - model["mean"][index]) / model["std"][index])

    augmented = [1.0] + vector
    weights = model["weights"]
    class_count = len(weights[0])
    logits = [
        sum(augmented[row] * weights[row][column] for row in range(len(augmented)))
        for column in range(class_count)
    ]
    return softmax(logits, model.get("temperature", 1.0))


def mac_tahmini(mac, models):
    features = temel_ozellikler(mac)
    prematch_var = prematch_ekle(mac, features)
    variant = "live_plus_prematch" if prematch_var else "live_only"
    selected = models[variant]

    result_probs = model_tahmini(selected["result"], features)
    remaining_probs = model_tahmini(selected["remaining_goals"], features)
    current_total = features["home_score"] + features["away_score"]

    output = {
        "MS1": round(result_probs[0] * 100, 1),
        "X": round(result_probs[1] * 100, 1),
        "MS2": round(result_probs[2] * 100, 1),
        "MODEL_VARYANTI": variant,
    }

    for line in [0.5, 1.5, 2.5, 3.5, 4.5]:
        p_over = sum(
            probability
            for remaining, probability in enumerate(remaining_probs)
            if current_total + remaining > line
        )
        output[f"{line}_UST"] = round(p_over * 100, 1)
        output[f"{line}_ALT"] = round((1.0 - p_over) * 100, 1)

    return output


def main():
    try:
        with open(MODEL_FILE, "r", encoding="utf-8") as file:
            models = json.load(file)
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, list):
            raise ValueError("Beklenen giriş bir maç listesi")

        results = []
        for mac in payload:
            try:
                results.append(mac_tahmini(mac, models))
            except Exception as error:
                # Dizi hizasını koru; eksik maç başka maça ait sonuç alamaz.
                results.append({"HATA": str(error)})

        print(json.dumps(results, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"hata": str(error)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
