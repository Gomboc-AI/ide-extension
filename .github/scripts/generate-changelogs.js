// @ts-check
/**
 * @param {import('@actions/github-script').AsyncFunctionArguments} AsyncFunctionArguments
 */
export default async ({ github, context, core }) => {
  if (!process.env.RELEASE_NOTES_OUTPUT) {
    core.info('No release notes found.');
    return context.actor;
  }

  const HEADER = '## Pull Request Summary';

  const releaseNotesOutput = Buffer.from(
    process.env.RELEASE_NOTES_OUTPUT,
    'base64',
  ).toString('utf-8');
  core.info(`Semantic release note output: ${releaseNotesOutput}`);
  const lines = releaseNotesOutput.split('\n');
  const releaseNoteIndex = [...lines]
    .reverse()
    .findIndex(line => /^[[0-9:\sAMPM]+\]\s\[semantic-release\].*$/.test(line));
  const releaseNoteLines = lines.slice(lines.length - releaseNoteIndex);
  const releaseNotes = `${HEADER}\n\n${releaseNoteLines.join('\n')}`;

  if (releaseNoteLines.length === 0) {
    core.info('No commit summary generated.');
    return context.actor;
  }

  const comments = await github.rest.issues.listComments({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
  });

  const existingComment = comments.data.find(comment =>
    comment?.body?.startsWith(HEADER),
  );

  if (existingComment) {
    await github.rest.issues.updateComment({
      comment_id: existingComment.id,
      body: releaseNotes,
      owner: context.repo.owner,
      repo: context.repo.repo,
    });
  } else {
    await github.rest.issues.createComment({
      issue_number: context.issue.number,
      body: releaseNotes,
      owner: context.repo.owner,
      repo: context.repo.repo,
    });
  }
  return context.actor;
};
