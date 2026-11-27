"""Wandelt dist-single/index.html in ein HTML-Fragment ohne <html>/<head>/<body> um
(Format für eine geteilte Claude-Artifact-Seite). Aufruf: python3 scripts/make-artifact.py"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'dist-single' / 'index.html').read_text(encoding='utf-8')

title = re.search(r'<title>.*?</title>', src, re.S).group(0)
fonts = re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^>]*>', src)
styles = re.findall(r'<style[^>]*>.*?</style>', src, re.S)
scripts = re.findall(r'<script type="module"[^>]*>.*?</script>', src, re.S)
assert styles and scripts, 'Build-Ausgabe unerwartet'

out = '\n'.join([title, '<meta name="theme-color" content="#E8590C">', *fonts, *styles, '<div id="root"></div>', *scripts])
dest = root / 'dist-artifact' / 'habla.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding='utf-8')
print(f'{dest} ({len(out) // 1024} KB)')
