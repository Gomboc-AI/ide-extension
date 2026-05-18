# ORL Integration Setup Guide

This guide explains how to set up and run the Gomboc VS Code extension with ORL integration locally.

## Prerequisites

- **Node.js**: Version 18+ (use `nvm` to manage versions)
- **Docker**: Running and accessible from command line
- **Git**: For cloning repositories
- **VS Code**: For extension development

## Step 1: Environment Setup

### Install Node.js with nvm

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or source profile
source ~/.bashrc  # or ~/.zshrc

# Install and use Node.js 18
nvm install 18
nvm use 18
```

### Verify Docker Installation

```bash
docker --version
docker run hello-world
```

## Step 2: Clone and Setup Extension

### Clone the Repository

```bash
cd /path/to/your/workspace
git clone <repository-url> ide-extension
cd ide-extension
```

### Install Dependencies

```bash
# Install npm dependencies
npm install

# Verify installation
npm run compile
npm test
```

## Step 3: Pull ORL Docker Image

### Pull Public ORL Image

```bash
# Pull the official ORL Docker image
docker pull gombocai/orl:v1.3.6

# Verify image was pulled
docker images | grep gombocai/orl
```

### Test ORL Image

```bash
# Test ORL functionality
docker run --rm gombocai/orl:v1.3.6 --help
docker run --rm gombocai/orl:v1.3.6 remediate --help
```

## Step 4: Configure VS Code Extension

### Set Extension Configuration

Open VS Code and configure the extension settings:

1. **Open Command Palette**: `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. **Search for**: "Preferences: Open Settings (JSON)"
3. **Add the following configuration**:

```json
{
  "gomboc-vscode-extension.remediateOrlEnabled": true,
  "gomboc-vscode-extension.orlRulesServiceUrl": "https://rules.dev.gcp.gomboc.ai",
  "gomboc-vscode-extension.orlRulesServiceToken": "YOUR_TOKEN_HERE",
  "gomboc-vscode-extension.orlChannel": "orl-test-channel"
}
```

### Get Required Credentials

You'll need to obtain:

- **Rules Service Token**: Authentication token for the rules service
- **Channel**: The channel name (default: `orl-test-channel`)

## Step 5: Test the Integration

### Launch Extension Development Mode

```bash
cd ide-extension
npm run compile
```

1. **Open VS Code**: `code .`
2. **Press F5**: This will launch a new VS Code window with the extension loaded
3. **Open Extension Development Host**: The new window will have your extension active

### Test ORL Connection

1. **Open Command Palette**: `Ctrl+Shift+P`
2. **Run**: "Gomboc: Test ORL Connection"
3. **Verify**: You should see "✅ ORL connection test successful!"

### Test with Sample Files

Create a test Terraform file to trigger ORL rules:

```bash
# Create test directory
mkdir test-workspace
cd test-workspace

# Create test Terraform file
cat > test-aws.tf << 'EOF'
# Deliberately bad AWS Terraform file to test ORL rules
resource "aws_rds_cluster" "bad_cluster" {
  cluster_identifier = "test-cluster"
  engine             = "aurora-mysql"
  deletion_protection = true
  storage_encrypted = true
  # Missing deletion_protection - should trigger rule
  # Missing storage_encrypted - should trigger rule
}

resource "aws_sns_topic" "bad_topic" {
  name = "test-topic"
  # Missing kms_master_key_id - should trigger encryption rule
}

resource "aws_instance" "bad_instance" {
  ami           = "ami-12345678"
  instance_type = "t2.micro"
  # Missing user_data with kubelet - should trigger iptables rule
}

resource "aws_db_instance" "bad_db" {
  identifier = "test-db"
  engine     = "mysql"
  # Missing backup_window - should trigger backup rule
}

resource "aws_elasticache_replication_group" "bad_cache" {
  replication_group_id       = "test-cache"
  node_type                  = "cache.t2.micro"
  auto_minor_version_upgrade = true # Should trigger update rule
}

resource "aws_neptune_cluster" "bad_neptune" {
  cluster_identifier = "test-neptune"
  engine             = "neptune"
  enable_cloudwatch_logs_exports = ["audit"]
  # Missing enable_cloudwatch_logs_exports - should trigger logging rule
}
EOF
```

### Test ORL Scanning

1. **Open the test file**: `test-aws.tf` in VS Code
2. **Save the file**: `Ctrl+S` (this triggers the scan)
3. **Check Problems Panel**: `Ctrl+Shift+M`
4. **Look for ORL diagnostics**: You should see security issues with quick fixes
5. **Test Quick Fixes**: Click the lightbulb icon or use `Ctrl+.`

## Step 6: Development Workflow

### Making Changes

```bash
# After making code changes
npm run compile
npm test

# Reload the extension in VS Code
# Press Ctrl+Shift+P -> "Developer: Reload Window"
```

### Debugging

1. **Open Developer Tools**: `Ctrl+Shift+I` in the Extension Development Host
2. **Check Console**: Look for extension logs and errors
3. **Check Output Panel**: View "Gomboc VS Code Extension" output

### Running Tests

```bash
# Run all tests
npm test

# Run specific test files
npm test -- --testPathPatterns=orlClient
npm test -- --testPathPatterns=diffContentAnalyzer

# Run with coverage
npm run test:coverage
```

## Troubleshooting

### Common Issues

#### Docker Issues

```bash
# Check Docker is running
docker ps

# Restart Docker if needed
sudo systemctl restart docker  # Linux
# Or restart Docker Desktop on Mac/Windows
```

#### ORL Image Issues

```bash
# Pull latest ORL image
docker pull gombocai/orl:v1.3.6

# Test ORL directly
docker run --rm -v $(pwd):/workspace gombocai/orl:v1.3.6 remediate /workspace --dry-run
```

#### Extension Issues

```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check TypeScript compilation
npm run check-types
```

#### Authentication Issues

- Verify your token is correct
- Check the rules service URL is accessible
- Ensure the channel exists and has rules

### Debug Logs

Check the VS Code Developer Console for detailed logs:

1. **Open Extension Development Host**
2. **Press F12** or `Ctrl+Shift+I`
3. **Look for logs** starting with "ORL" or "Gomboc"

### Performance Issues

- **Docker Resource Limits**: Ensure Docker has enough memory/CPU
- **Large Workspaces**: ORL scans all supported files in the directory
- **Network Issues**: Rules service calls may be slow

## File Structure

```
ide-extension/
├── src/
│   ├── commands/
│   │   ├── scanFile.ts          # Main scanning logic
│   │   └── testOrlConnection.ts # ORL connection testing
│   ├── orl/
│   │   ├── orlClient.ts         # ORL Docker execution
│   │   └── orlResultConverter.ts # Convert ORL output to VS Code format
│   ├── utils/
│   │   ├── pathConverter.ts     # Docker path conversion
│   │   ├── fileDiffAnalyzer.ts  # File diff analysis with grouping
│   │   └── diffContentAnalyzer.ts # Content-based descriptions
│   └── providers/
│       └── scanResultsProvider.ts # VS Code diagnostics and quick fixes
├── package.json                 # Extension configuration
└── ORL_INTEGRATION.md          # Integration documentation
```

## Configuration Reference

### Extension Settings

- `remediateOrlEnabled`: Enable/disable ORL integration
- ORL Docker image is pinned by the extension to `gombocai/orl:v1.3.6` (not configurable via settings).
- `orlRulesServiceUrl`: Rules service endpoint
- `orlRulesServiceToken`: Authentication token
- `orlChannel`: Channel name for rules

### Environment Variables (for ORL)

- `RULE_SERVICE_TOKEN`: Authentication token
- `RULE_SERVICE_URL`: Rules service endpoint

## Next Steps

1. **Test with Real Projects**: Try the extension with actual Terraform/CloudFormation projects
2. **Customize Rules**: Modify the channel or add custom rules
3. **Performance Tuning**: Optimize Docker resources and scanning scope
4. **Integration Testing**: Test with different supported languages and configurations

## Support

For issues or questions:

1. Check the VS Code Developer Console for error logs
2. Verify Docker and ORL image are working correctly
3. Test ORL connection using the built-in test command
4. Review the troubleshooting section above
