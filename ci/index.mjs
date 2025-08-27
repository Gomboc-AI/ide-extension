import { createParserOpts } from './parser.mjs';
import { createWriterOpts } from './writer.mjs';
import { whatBump } from './whatBump.mjs';

export default async function createPreset() {
  return {
    parser: createParserOpts(),
    writer: await createWriterOpts(),
    whatBump,
  };
}
