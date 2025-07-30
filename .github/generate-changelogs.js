// build release note
const semanticReleaseOutput = Buffer.from('${{ steps.semantic-release.outputs.releaseNote }}', 'base64').toString('utf8');
const semanticReleaseLogMatch = /^[[0-9:\sAMPM]+\]\s\[semantic-release\].*$/;
const lines = semanticReleaseOutput.split('\n');
const lastSemanticReleaseLogIndex = [...lines]
    .reverse()
    .findIndex((line) => line.match(semanticReleaseLogMatch));

const releaseNoteIndex = lines.length - lastSemanticReleaseLogIndex;
const releaseNote = lines.slice(releaseNoteIndex);

let res = releaseNote.join('\n');
if (!releaseNote.length || !res) {
    res = 'No release generated.';
}

const SEMANTIC_RELEASE_BODY_HEADER = '## Changelog';
const body = [SEMANTIC_RELEASE_BODY_HEADER, res].join('\n');

// get last comment
const comments = await github.rest.issues.listComments({
  issue_number: context.issue.number,
  owner: context.repo.owner,
  repo: context.repo.repo
});

// find comments to delete
const commentsToDelete = comments.data.filter((comment) =>
    comment.body.startsWith(SEMANTIC_RELEASE_BODY_HEADER)
);

// delete comments
const deleteComments = commentsToDelete.map((comment) =>
    github.rest.issues.deleteComment({
      comment_id: comment.id,
      owner: context.repo.owner,
      repo: context.repo.repo
    })
);

await Promise.all(deleteComments);

// create new comment for release note
github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body
});

export default async ({context, github}) => {
  
}

