"""Ocean Murmur — сборка статического сайта (v19: GitHub Pages и APK).

1. Если рядом есть samples/ (WAV, только на ПК) — сжимает их в samples_mp3/ (MP3, пересжимает только новые и
   изменённые, копирует CREDITS.txt, убирает сжатые копии удалённых записей). Нужен Python-пакет soundfile.
2. Собирает _site/: страница из web/ (без проверочных _qa*), записи из samples_mp3/ и samples.json — список записей
   по категориям (его читает web/audio.js; локальный serve.py отдаёт свой список WAV, как раньше).

Запуск: python build_site.py   (на GitHub шаг 1 пропускается — WAV там нет, только samples_mp3/)
"""
import json
import os
import re
import shutil

BASE = os.path.dirname(os.path.abspath(__file__))
WAV, MP3, SITE = (os.path.join(BASE, d) for d in ("samples", "samples_mp3", "_site"))


def categories():
    """Категории записей, которые знает страница, — из CATEGORIES в web/audio.js (v20: раньше импорт web_bridge,
    которого нет в репозитории — сборка падала у любого, кто положит свои WAV)."""
    src = open(os.path.join(BASE, "web", "audio.js"), encoding="utf-8").read()
    m = re.search(r"const CATEGORIES = \[(.*?)\];", src, re.S)
    return re.findall(r"'([a-z_]+)'", m.group(1))


def compress():
    import soundfile as sf
    n = 0
    for cat in categories():
        src, dst = os.path.join(WAV, cat), os.path.join(MP3, cat)
        if not os.path.isdir(src):
            continue
        os.makedirs(dst, exist_ok=True)
        names = {f[:-4] for f in os.listdir(src) if f.lower().endswith(".wav")}
        for b in names:
            w, m = os.path.join(src, b + ".wav"), os.path.join(dst, b + ".mp3")
            mt = os.path.getmtime(w)
            if os.path.exists(m) and os.path.getmtime(m) == mt:   # v20: MP3 помечен датой своего WAV
                continue
            data, sr = sf.read(w)
            # ponytail: VBR ~64 кбит/с моно — на слух как WAV для природных звуков; поднять compression_level, если мало
            sf.write(m, data, sr, format="MP3", bitrate_mode="VARIABLE", compression_level=0.3)
            os.utime(m, (mt, mt))
            n += 1
        for f in os.listdir(dst):   # копии удалённых записей
            if f.endswith(".mp3") and f[:-4] not in names:
                os.remove(os.path.join(dst, f))
        if os.path.exists(os.path.join(src, "CREDITS.txt")):
            shutil.copy2(os.path.join(src, "CREDITS.txt"), dst)
    print("сжато записей:", n)


def build():
    shutil.rmtree(SITE, ignore_errors=True)
    shutil.copytree(os.path.join(BASE, "web"), SITE, ignore=shutil.ignore_patterns("_qa*", "test_*.mjs"))
    shutil.copytree(MP3, os.path.join(SITE, "samples"))
    known = set(categories())   # v20: только категории страницы (убранные не публикуются)
    for c in os.listdir(os.path.join(SITE, "samples")):
        if c not in known:
            shutil.rmtree(os.path.join(SITE, "samples", c))
    cats = {c: sorted(f for f in os.listdir(os.path.join(MP3, c)) if f.endswith(".mp3"))
            for c in sorted(known) if os.path.isdir(os.path.join(MP3, c))}
    with open(os.path.join(SITE, "samples.json"), "w", encoding="utf-8") as f:
        json.dump(cats, f, ensure_ascii=False)
    open(os.path.join(SITE, ".nojekyll"), "w").close()   # GitHub Pages: не пропускать файлы и папки с «_»
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(SITE) for f in fs)
    print(f"_site: {sum(len(v) for v in cats.values())} записей, {size / 1e6:.1f} МБ")


if __name__ == "__main__":
    if os.path.isdir(WAV):
        compress()
    build()
