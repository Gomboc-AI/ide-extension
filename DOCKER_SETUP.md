# ORL Docker Setup Quick Reference

## Using the Public ORL Image

The ORL Docker image is now available publicly at [Docker Hub](https://hub.docker.com/r/gombocai/orl).

### Pull ORL Image

```bash
# Pull the official ORL Docker image
docker pull gombocai/orl:v1.0.0

# Verify the image
docker images | grep gombocai/orl
```

### Test ORL Image

```bash
# Test basic functionality
docker run --rm gombocai/orl:v1.0.0 --help

# Test remediation command
docker run --rm gombocai/orl:v1.0.0 remediate --help

# Test rules pull command
docker run --rm gombocai/orl:v1.0.0 rules pull --help
```

## Testing with Sample Files

```bash
# Create test workspace
mkdir test-workspace
cd test-workspace

# Create sample Terraform file
cat > main.tf << 'EOF'
resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
}
EOF

# Test ORL remediation
docker run --rm \
  -v $(pwd):/workspace \
  -e RULE_SERVICE_TOKEN="your-token" \
  -e RULE_SERVICE_ACCOUNT_ID="your-account-id" \
  gombocai/orl:v1.0.0 remediate /workspace --dry-run
```

## Pulling Rules

```bash
# Create rules directory
mkdir rules

# Pull rules from service
docker run --rm \
  -v $(pwd)/rules:/output \
  -e RULE_SERVICE_TOKEN="your-token" \
  -e RULE_SERVICE_ACCOUNT_ID="your-account-id" \
  gombocai/orl:v1.0.0 rules pull \
  --url="https://rules.dev.gcp.gomboc.ai" \
  --out=/output \
  --channel="orl-test-channel"

# Verify rules were pulled
ls -la rules/
```

## Troubleshooting Docker Issues

### Image Pull Issues

```bash
# Clean Docker cache
docker system prune -a

# Pull specific version
docker pull gombocai/orl:v1.0.0
```

### Permission Issues

```bash
# Fix volume mount permissions (Linux/Mac)
sudo chown -R $USER:$USER /path/to/workspace

# Or run with user mapping
docker run --rm -u $(id -u):$(id -g) -v $(pwd):/workspace gombocai/orl:v1.0.0 --help
```

### Network Issues

```bash
# Test network connectivity
docker run --rm gombocai/orl:v1.0.0 ping -c 3 google.com

# Test rules service connectivity
curl -H "Authorization: Bearer your-token" \
  "https://rules.dev.gcp.gomboc.ai/api/v1/rules?channel=orl-test-channel"
```

## Docker Compose Alternative

Create `docker-compose.yml` for easier management:

```yaml
version: '3.8'
services:
  orl:
    image: gombocai/orl:v1.0.0
    volumes:
      - ./workspace:/workspace
      - ./rules:/rules
    environment:
      - RULE_SERVICE_TOKEN=${RULE_SERVICE_TOKEN}
      - RULE_SERVICE_ACCOUNT_ID=${RULE_SERVICE_ACCOUNT_ID}
      - RULE_SERVICE_URL=https://rules.dev.gcp.gomboc.ai
    command: remediate /workspace --dry-run
```

Usage:

```bash
# Set environment variables
export RULE_SERVICE_TOKEN="your-token"
export RULE_SERVICE_ACCOUNT_ID="your-account-id"

# Run with docker-compose
docker-compose up
```
