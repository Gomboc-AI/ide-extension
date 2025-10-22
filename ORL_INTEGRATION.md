# ORL Integration Feature Flag

This document describes the new ORL (Open Remediation Language) integration feature that can be enabled via a feature flag in the Gomboc VS Code extension.

## Overview

When the `remediateOrlEnabled` feature flag is enabled, the extension will use ORL running in a Docker container instead of the traditional API-based remediation approach.

## Configuration

### Feature Flag
- **Setting**: `gomboc-vscode-extension.remediateOrlEnabled`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable ORL-based remediation using DevContainer execution (experimental)

### ORL Configuration
- **Container Image**: `gomboc-vscode-extension.orlContainerImage` (default: `gomboc/orl:latest`)
- **Rules Service URL**: `gomboc-vscode-extension.orlRulesServiceUrl` (default: `https://rules.app.gomboc.ai`)
- **Rules Service Token**: `gomboc-vscode-extension.orlRulesServiceToken` (sensitive)
- **Rules Service Account ID**: `gomboc-vscode-extension.orlRulesServiceAccountId` (sensitive)

## Prerequisites

1. **Docker**: Docker must be installed and running on the user's machine
2. **ORL Container**: The specified ORL container image must be available (will be pulled automatically)
3. **Rules Service Access**: Valid token and account ID for the rules service

## Usage

### Enabling ORL Mode

1. Open VS Code Settings (`Ctrl/Cmd + ,`)
2. Search for "gomboc"
3. Enable "Remediate Orl Enabled"
4. Configure the ORL settings (container image, rules service credentials)

### Testing Connection

Use the "Gomboc: Test ORL Connection" command to verify:
- Docker is running
- ORL container can be executed
- Rules service credentials are valid

### Running Scans

When ORL mode is enabled:
1. Open a Terraform (`.tf`) or CloudFormation (`.yaml`, `.yml`) file
2. Use "Gomboc: Scan current file or scenario" command
3. The extension will:
   - Copy workspace files to a temporary directory
   - Execute ORL in a Docker container
   - Parse the remediation results
   - Display diagnostics and code actions in VS Code

## How It Works

### Traditional Mode (Default)
```
VS Code Extension → CustomerAPI GraphQL → Backend Processing → Results
```

### ORL Mode (Feature Flag Enabled)
```
VS Code Extension → Docker Container → ORL Engine → Rules Service → Results
```

### File Processing Flow

1. **File Collection**: Extension gathers IaC files from the workspace
2. **Container Execution**: ORL runs in Docker with workspace mounted
3. **Rules Processing**: ORL fetches rules from the rules service
4. **Remediation**: ORL applies rules and generates modified files
5. **Result Parsing**: Extension parses ORL output and creates VS Code diagnostics
6. **User Interaction**: User can apply fixes via code actions

## Benefits

- **Local Execution**: No code sent to external services
- **Rule Privacy**: Rules are fetched but not exposed to users
- **Consistent Environment**: Docker ensures identical behavior across platforms
- **No Binary Signing**: Eliminates need for platform-specific certificates

## Limitations

- **Docker Dependency**: Requires Docker installation
- **Performance Overhead**: Container startup adds 1-2 seconds per scan
- **Resource Usage**: Docker containers consume additional memory
- **Network Access**: Requires internet connection for rules service

## Troubleshooting

### Common Issues

1. **Docker Not Running**
   - Error: "Cannot connect to Docker daemon"
   - Solution: Start Docker Desktop or Docker service

2. **Container Image Not Found**
   - Error: "Unable to find image"
   - Solution: Check container image name, ensure internet connection

3. **Rules Service Authentication**
   - Error: "Authentication failed"
   - Solution: Verify token and account ID in settings

4. **Permission Denied**
   - Error: "Permission denied" when accessing files
   - Solution: Ensure Docker has access to workspace directory

### Debug Information

Enable debug logging in VS Code:
1. Open Command Palette (`Ctrl/Cmd + Shift + P`)
2. Run "Developer: Toggle Developer Tools"
3. Check Console for detailed error messages

## Future Enhancements

- **Container Caching**: Keep containers running for faster subsequent scans
- **Rule Caching**: Cache rules locally to reduce network calls
- **Progress Indicators**: Better progress feedback during long operations
- **Batch Processing**: Process multiple files in a single container execution
