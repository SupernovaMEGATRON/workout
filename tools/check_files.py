#!/usr/bin/env python3
"""Check that the offline file list in sw.js matches the app files on disk.

Run from the repository root before each release:  python3 tools/check_files.py
A file missing from the list would not be available offline; a listed file missing on
disk would make the update fail to install.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIRS = ('css', 'js', 'vendor')
APP_ROOT_FILES = ('index.html', 'version.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png')

sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
block = re.search(r'const FILES = \[(.*?)\];', sw, re.S).group(1)
listed = set(re.findall(r"'([^']+)'", block)) - {'./'}

on_disk = set(f for f in APP_ROOT_FILES if os.path.exists(os.path.join(ROOT, f)))
for d in APP_DIRS:
    for base, _, files in os.walk(os.path.join(ROOT, d)):
        for f in files:
            on_disk.add(os.path.relpath(os.path.join(base, f), ROOT).replace(os.sep, '/'))

missing_from_list = sorted(on_disk - listed)
missing_on_disk = sorted(listed - on_disk)
for f in missing_from_list:
    print('NOT IN sw.js FILES:', f)
for f in missing_on_disk:
    print('LISTED BUT MISSING:', f)

# every relative import in the JS modules must point at an existing file
for f in sorted(on_disk):
    if not f.startswith('js/') or not f.endswith('.js'):
        continue
    src = open(os.path.join(ROOT, f), encoding='utf-8').read()
    for imp in re.findall(r"""from\s+['"](\.[^'"]+)['"]""", src):
        target = os.path.normpath(os.path.join(os.path.dirname(f), imp)).replace(os.sep, '/')
        if target not in on_disk:
            print('BROKEN IMPORT in', f, '->', imp)
            missing_on_disk.append(target)

if missing_from_list or missing_on_disk:
    sys.exit(1)
print('OK: %d files listed, all present' % len(listed))
