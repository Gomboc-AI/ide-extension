# ORL Integration

The Gomboc VS Code extension can use ORL (Open Remediation Language) for local security remediation via Docker execution.

## Setup Guides

- **[Complete Setup Guide](SETUP_GUIDE.md)** - Comprehensive setup instructions
- **[Docker Setup Reference](DOCKER_SETUP.md)** - Docker-specific setup and troubleshooting

## Quick Setup

1. **Enable feature flag**: `gomboc-vscode-extension.remediateOrlEnabled = true`
2. **Configure credentials**:

- `orlRulesServiceToken` - Rules service authentication token
- `orlRulesServiceAccountId` - Account ID for rules service
- `orlRulesServiceUrl` - Rules service URL (default: `https://rules.app.gomboc.ai`)
- `orlChannel` - Channel name (default: `default`)

3. **Ensure Docker is running**

## How It Works

```
VS Code Extension → Docker Container → ORL Engine → Rules Service → VS Code Diagnostics
```

### Process Flow

1. **Scan trigger**: User runs "Gomboc: Scan current file or scenario"
2. **Workspace preparation**: Extension copies IaC files to `.orl-temp/` directory
3. **Rules download**: ORL pulls rules from rules service using `rules pull` command
4. **Remediation**: ORL runs `remediate --dry-run` on workspace files
5. **Result parsing**: Extension parses ORL output and creates VS Code diagnostics
6. **User interaction**: User can apply individual fixes or "Apply all fixes"

## Current Implementation

- **Docker-based execution**: ORL runs in ephemeral containers
- **Dynamic rule pulling**: Rules fetched fresh on each scan
- **File diff analysis**: Extension compares original vs ORL-modified files
- **VS Code integration**: Creates diagnostics and code actions for each fix

## Configuration

| Setting                    | Type    | Default                       | Description                      |
| -------------------------- | ------- | ----------------------------- | -------------------------------- |
| `remediateOrlEnabled`      | boolean | `false`                       | Enable ORL-based remediation     |
| `orlContainerImage`        | string  | `gombocai/orl:v1.0.0`         | Docker image for ORL             |
| `orlRulesServiceUrl`       | string  | `https://rules.app.gomboc.ai` | Rules service URL                |
| `orlRulesServiceToken`     | string  | `""`                          | Authentication token (sensitive) |
| `orlRulesServiceAccountId` | string  | `""`                          | Account ID (sensitive)           |
| `orlChannel`               | string  | `default`                     | Channel name for rules           |

## Troubleshooting

### Common Issues

- **"Cannot find module"**: Docker not running or image not available
- **"Authentication failed"**: Invalid token/account ID
- **"Permission denied"**: Docker lacks access to workspace directory
- **"0 fixes found"**: No matching rules or file already compliant

### Testing Connection

Use "Gomboc: Test ORL Connection" command to verify:

- Docker is accessible
- ORL container can execute
- Rules service credentials work

## File Support

- **Terraform**: `.tf` files
- **CloudFormation**: `.yaml`, `.yml` files
- **CloudFormation JSON**: `.json` files with "template", "cloudformation", "cfn", or "stack" in filename
