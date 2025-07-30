function whatBump(commits) {
  let level = 2;
  let breakings = 0;
  let features = 0;
  let forceRelease = false;

  commits.forEach(commit => {
    console.log('Processing commit:', commit.subject);
    // Check for [force-release] flag in commit message
    if (commit.subject && commit.subject.includes('[force-release]')) {
      forceRelease = true;
    }

    if (commit.notes.length > 0) {
      breakings += commit.notes.length;
      level = 0;
    } else if (commit.type === 'feat') {
      features += 1;

      if (level === 2) {
        level = 1;
      }
    }
  });

  // If there are breaking changes, they take precedence over force-release flag
  if (breakings > 0) {
    return {
      level,
      reason:
        breakings === 1
          ? `There is ${breakings} BREAKING CHANGE and ${features} features`
          : `There are ${breakings} BREAKING CHANGES and ${features} features`,
    };
  }

  // If force-release flag is present and no breaking changes, force a patch release (level 2)
  if (forceRelease) {
    return {
      level: 2,
      reason: 'Force release triggered by [force-release] flag',
    };
  }

  return {
    level,
    reason:
      breakings === 1
        ? `There is ${breakings} BREAKING CHANGE and ${features} features`
        : `There are ${breakings} BREAKING CHANGES and ${features} features`,
  };
}

export { whatBump };
