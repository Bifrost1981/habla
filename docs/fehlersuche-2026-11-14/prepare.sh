#!/usr/bin/env bash
# Baut eine Arbeitskopie mit einer Test-Aufnahme für „hola“ (für repro.spec.ts). Ändert das Projekt nicht.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; WORK="${HABLA_WORK:-$HERE/work}"
rm -rf "$WORK"; mkdir -p "$WORK"
(cd "$ROOT" && tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=test-results --exclude=docs -cf - .) | tar -xf - -C "$WORK"
ln -s "$ROOT/node_modules" "$WORK/node_modules"; ln -sfn "$ROOT/node_modules" "$HERE/node_modules"
cd "$WORK" && node --experimental-strip-types --no-warnings -e "
import('./src/lib/audioKey.ts').then(({clipKey})=>{const fs=require('fs');fs.mkdirSync('public/audio/es-ES',{recursive:true});
const n=3200,b=Buffer.alloc(44+n);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);b.fill(128,44);
fs.writeFileSync('public/audio/es-ES/hola.wav',b);
fs.writeFileSync('public/audio/es-ES/manifest.json',JSON.stringify({dialect:'es-ES',provider:'test',voice:'t',voiceLabel:'Teststimme',createdAt:'2026-11-14T00:00:00Z',clips:{[clipKey('hola')]:'hola.wav'}}));})"
npx vite build --logLevel error
echo "Arbeitskopie fertig: $WORK"
