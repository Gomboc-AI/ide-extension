# Gomboc VSCode Extension

### Getting Started
This project is organzied under the central src directory, all of the commands are organized under the `activate` function, which runs upon activation of the extension. 

#### Installation
1. Make sure using the correct version of node
```bash
  nvm use
```
2. This project uses our internal `scm-client` so you need to login to github. Username is your lowercase github username, and password is your generated `PAT`
```bash
  npm login --scope=@gomboc-ai --auth-type=legacy --registry=https://npm.pkg.github.com
```

2. install node packages
```bash
  nvm i
```
🎉🎉Congrats🎉🎉 you are now ready for development :-)

### Environment
The following envs must be set:

`GITHUB_APP_SECRET_PEM_PRIVATE_KEY`
`GITHUB_APP_CLIENT_ID`
`GITHUB_APP_ID`
`GITHUB_APP_CLIENT_SECRET`

### Development
When developing, you must run this using the debugger, in order to do that just use `F5`, which will open a new instance of vscode running the plugin.

##### New Command
If you want to create a new comand you have to add it to the `package.json` as well as activate it within the `activate` function in `extension.ts`

##### New Setting
To add another config setting add it under `"configuration"` in `package.json`