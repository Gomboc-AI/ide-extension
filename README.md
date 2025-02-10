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
> Note, you might have to `chmod +x` the scripts file in order to run this command.

🎉🎉Congrats🎉🎉 you are now ready for development :-)

### Development
When developing, you must run this using the debugger, in order to do that just use `F5`, which will open a new instance of vscode running the plugin. This will re-compile the code using esbuild. Sometimes you need to run the command manually, in which case just run `npm run compile` which will also eslint / typecheck it.

Make sure to prepend your command names with `Gomboc` so that it is easy to search for the command when looking within vscode. 

##### New Command
If you want to create a new comand you have to add it to the `package.json` as well as activate it within the `activate` function in `extension.ts`

##### New Setting
To add another config setting add it under `"configuration"` in `package.json`


>Note:
Since vscode extensions have to be a commonjs module, and some of the packages we use are ECMAScript modules, we have to do some tricky things with typescript. Esbuild is used to compile to commonjs, but if you try to import something that only resolves ECMA, then you have to use 
`// @ts-expect-error` 
above it.
