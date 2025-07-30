// Extends the package conventional-changelog/conventional-changelog-angular
// https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-angular/src/parser.js

function createParserOpts() {
  return {
    headerPattern:
      /^(?:DEV-([0-9]+) )?(\w*)(?:\((.*)\))?(?:[:-] )?(.*?)(?:\s*\[force-release\])?$/,
    headerCorrespondence: ['issue', 'type', 'scope', 'subject'],
    noteKeywords: ['BREAKING CHANGE'],
    revertPattern:
      /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w{7,40})\b/i,
    revertCorrespondence: ['header', 'hash'],
  };
}

module.exports = { createParserOpts };
