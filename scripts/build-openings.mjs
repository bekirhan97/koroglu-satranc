// Builds resources/openings.json from the lichess chess-openings TSV files.
// Output: { "<epd>": [eco, name, plyInLine, isLineEnd] }
// Every position along every named line is "book"; the deepest named line wins for naming.
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';

const srcDir = process.argv[2];
const out = process.argv[3];
const book = {};

const epdOf = (fen) => fen.split(' ').slice(0, 4).join(' ');

for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = fs.readFileSync(path.join(srcDir, `${f}.tsv`), 'utf8').trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    let ply = 0;
    for (const san of sans) {
      chess.move(san);
      ply++;
      const epd = epdOf(chess.fen());
      const isEnd = ply === sans.length;
      const prev = book[epd];
      // Prefer the entry that is an exact line end, then the longer line name.
      if (!prev || (isEnd && !prev[3]) || (isEnd === !!prev[3] && name.length > prev[1].length && isEnd)) {
        book[epd] = [eco, isEnd ? name : (prev ? prev[1] : name), ply, isEnd ? 1 : 0];
      }
    }
  }
}
fs.writeFileSync(out, JSON.stringify(book));
console.log('positions:', Object.keys(book).length);
