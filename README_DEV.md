# Gomboc VSCode Extension
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/dd4c501acf1742b89fb1ba9ed692faa3)](https://app.codacy.com?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/dd4c501acf1742b89fb1ba9ed692faa3)](https://app.codacy.com?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

### Getting Started

This project is organzied under the central src directory, all of the commands are organized under the `activate` function, which runs upon activation of the extension.

#### Installation

1. Make sure using the correct version of node

```bash
  nvm use
```

2. install node packages

```bash
  nvm i
```

3. Run op-inject to get the env variables

```bash
  op-inject
```

4. Generate a frontegg PAT from portal, and use it within the env variables

5. Pull the graphql schema from customer API.

```bash
  npm run graphql:generate
```

> The frontegg PAT is required in your .env in order to run the graphql generate schema function. In order for the plugin to actually connect and work, you have to put the PAT in the vscode settings json.

🎉🎉Congrats🎉🎉 you are now ready for development :-)

### Development

When developing, you must run this using the debugger, in order to do that just use `F5`, which will open a new instance of vscode running the plugin. This will re-compile the code using esbuild. Sometimes you need to run the command manually, in which case just run `npm run compile` which will also eslint / typecheck it.

Make sure to prepend your command names with `Gomboc` so that it is easy to search for the command when looking within vscode.

The `launch.json` file within the `.vscode` directory is what controls the launch configuration for the debugger. I have set it up so that it points at a folder called `test_development/tf_test` that's not commited. If you want this folder to do your own test, just ask Jackson, otherwise feel free to create your own folders/directories to do your own development.

##### New Command

If you want to create a new comand you have to add it to the `package.json` as well as activate it within the `activate` function in `extension.ts`

##### New Setting

To add another config setting add it under `"configuration"` in `package.json`

> Note:
> Since vscode extensions have to be a commonjs module, and some of the packages we use are ECMAScript modules, we have to do some tricky things with typescript. Esbuild is used to compile to commonjs, but if you try to import something that only resolves ECMA, then you have to use
> `// @ts-expect-error`
> above it.

---

#### Some information about developing this ide extension

In order to add a `quick fix` to a particular diagnostic, you need to register a command. This works a little differently then the commands that are registered in the package.json, as these are hidden from the user and they can't invoke them. The commands object is just a giant object that you feed callback functions.

So when certain actions are taken, it invokes these callback functions:
For Example:

```typescript
  // registers the command so that it can be called
  public registerApplyRemediation() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyRemediation',
        (fixedResults, file) => {
          this.applyRemediation(fixedResults, file);
        },
      ),
    );
  }
```

### Releases

Releases are triggered by CI using [semantic-release](https://semantic-release.gitbook.io/semantic-release).
Pull requests with commits of type `feat`, `fix` and `perf` will trigger a new release. To avoid a release you
can add a scope of `no-release` to your commits to tell `semantic-release` to not include the commit.

#### Changelogs

We use [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) and [semantic-releases](https://semantic-release.gitbook.io/semantic-release/usage/getting-started) to generate changelogs. Commits messages should be structured as follows:

```yml
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

# e.g. git commit -m "chore: setup linting"
```

The following is a list of commonly used types:

```yml
  feat:     A new feature 
  fix:      A bug fix 
  docs:     Documentation only changes 
  style:    Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc) 
  refactor: A code change that neither fixes a bug nor adds a feature 
  perf:     A code change that improves performance 
  test:     Adding missing tests or correcting existing tests
  build:    Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm) 
  ci:       Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs) 
  chore:    Other changes that don't modify src or test files 
  revert:   Reverts a previous commit
```

Optionally you can run `npm run commit` to pull up a command prompt for generating a conventional commit.

### How to Force a Release

To force a release, add `[force-release]` to the end of your commit message:

```bash
git commit -m "fix: update some configuration [force-release]"
```

#### Examples

#### Force a patch release
```bash
git commit -m "docs: update README [force-release]"
```

#### Force a release with conventional commit format
```bash
git commit -m "feat: add new feature [force-release]"
```

#### Force a release with scope
```bash
git commit -m "fix(api): resolve authentication issue [force-release]"
```


### Publishing
We are using the `vsce` package in order to publish. For now, this will be done as a manual process. 

1. Install `vsce` globally (make sure you have node installed)
```bash 
  npm install -g @vscode/vsce
```

2. Login to our publisher, `GOMB
```bash 
  vsce login <GombocAI>
```

3. Enter our PAT from 1password
```bash
  Personal Access Token for publisher 'GombocAI': <PAT>
```

4. Bump the version in the package.json, either a major or minor version

5. Package the plugin
```bash
  vsce package
```

6. Publish the plugin
```bash
  vsce publish
```

> It will take about 5-10 minutes for the new version to appear on the marketplace
https://marketplace.visualstudio.com/items?itemName=GombocAI.gomboc-vscode-extension

