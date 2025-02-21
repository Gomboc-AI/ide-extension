# Gomboc VSCode Extension

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


>Note:
Since vscode extensions have to be a commonjs module, and some of the packages we use are ECMAScript modules, we have to do some tricky things with typescript. Esbuild is used to compile to commonjs, but if you try to import something that only resolves ECMA, then you have to use 
`// @ts-expect-error` 
above it.

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
