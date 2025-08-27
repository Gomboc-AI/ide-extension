// Extends the package conventional-changelog/conventional-changelog-angular
// https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-angular/src/parser.js

export function createParserOpts() {
  return {
    headerPattern:
      /^(?:DEV-([0-9]+) )?([a-zA-Z]+)(?:\(([^)]+)\))?(?:[:\-] )?(.*?)(\s*\[force-release\])?$/,
    headerCorrespondence: ['issue', 'type', 'scope', 'subject', 'forceRelease'],
    noteKeywords: ['BREAKING CHANGE'],
    revertPattern:
      /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w{7,40})\b/i,
    revertCorrespondence: ['header', 'hash'],
  };
}
