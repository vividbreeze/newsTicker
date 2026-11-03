"""Erzeugt das App-Icon (Zeitung auf Orange): iOS-AppIcon (1024px) + Web-Favicon/Touch-Icon."""
from PIL import Image, ImageDraw
import sys

S = 2048  # Supersampling, am Ende auf Zielgröße skaliert

def draw(size=S):
    k = size / 1024
    # Hintergrund: Orange-Verlauf (vollflächig, iOS rundet selbst ab)
    bg = Image.new("RGB", (size, size))
    px = bg.load()
    top, bot = (255, 176, 46), (255, 122, 0)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    img = bg.convert("RGBA")

    def R(x0, y0, x1, y1): return [x0 * k, y0 * k, x1 * k, y1 * k]

    # Schatten der Zeitung
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(R(214, 236, 810, 806), 48 * k, fill=(120, 50, 0, 90))
    from PIL import ImageFilter
    sh = sh.filter(ImageFilter.GaussianBlur(22 * k))
    img.alpha_composite(sh)

    d = ImageDraw.Draw(img)
    ink, soft = (38, 38, 42, 255), (196, 198, 204, 255)
    # Zeitungsblatt
    d.rounded_rectangle(R(200, 200, 824, 780), 48 * k, fill=(255, 255, 255, 255))
    # Kopfzeile (Titel) + Linie
    d.rounded_rectangle(R(248, 248, 776, 322), 14 * k, fill=ink)
    d.rectangle(R(248, 342, 776, 350), fill=ink)
    # Bildfläche links, Orange-Akzent
    d.rounded_rectangle(R(248, 378, 438, 528), 14 * k, fill=(255, 149, 0, 255))
    # Schlagzeile rechts neben Bild
    d.rounded_rectangle(R(462, 378, 776, 406), 10 * k, fill=ink)
    d.rounded_rectangle(R(462, 424, 776, 452), 10 * k, fill=ink)
    d.rounded_rectangle(R(462, 470, 700, 498), 10 * k, fill=ink)
    # Textzeilen in zwei Spalten
    y = 556
    for _ in range(4):
        d.rounded_rectangle(R(248, y, 494, y + 20), 8 * k, fill=soft)
        d.rounded_rectangle(R(530, y, 776, y + 20), 8 * k, fill=soft)
        y += 44
    d.rectangle(R(512 - 2, 556, 512 + 2, 712 + 20), fill=(228, 229, 233, 255))
    return img

if __name__ == "__main__":
    img = draw()
    def out(path, px, flatten=True):
        im = img.resize((px, px), Image.LANCZOS)
        if flatten: im = im.convert("RGB")
        im.save(path)
        print("->", path)
    out("ios/NewsTicker/Assets.xcassets/AppIcon.appiconset/AppIcon.png", 1024)
    out("web/public/apple-touch-icon.png", 180)
    out("web/public/icon-512.png", 512)
    out("web/public/favicon-32.png", 32)
