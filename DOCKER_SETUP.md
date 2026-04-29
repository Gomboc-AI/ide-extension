# ORL Docker Setup Quick Reference

## Using the Public ORL Image

The ORL Docker image is now available publicly at [Docker Hub](https://hub.docker.com/r/gombocai/orl).

### Pull ORL Image

```bash
# Pull the official ORL Docker image
docker pull gombocai/orl:v1.3.0-latest

# Verify the image
docker images | grep gombocai/orl
```

### Test ORL Image

```bash
# Test basic functionality
docker run --rm gombocai/orl:v1.3.0-latest --help

# Test remediation command
docker run --rm gombocai/orl:v1.3.0-latest remediate --help

# Test rules pull command
docker run --rm gombocai/orl:v1.3.0-latest rules pull --help
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
  gombocai/orl:v1.3.0-latest remediate /workspace --dry-run
```

## Pulling Rules

```bash
# Create rules directory
mkdir rules

# Pull rules from service
docker run --rm \
  -v $(pwd)/rules:/output \
  -e RULE_SERVICE_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjNiMTg1OGFkIn0.eyJzdWIiOiI2NDVjYThhNC0xNmQ5LTQ3MzktYmRiZS00ZjA0NjM3ZDMwMGMiLCJ0eXBlIjoidXNlckFjY2Vzc1Rva2VuIiwidGVuYW50SWQiOiJjNjUwMWM1Yy00ZGIzLTQxMWMtOTE2OC1kZjMxYTQ1NTA1NWQiLCJ1c2VySWQiOiJlMGI5ZWYxYi05NGQ5LTQwMzUtODYyZi0yMjE5MGRhMWU4NDgiLCJhcHBsaWNhdGlvbklkIjoiMjMzZjIxOWMtZjhkMC00MDI4LTliYzItODFkNzRmMjhlNDU2Iiwicm9sZXMiOlsiRkVUQ0gtUk9MRVMtQlktQVBJIl0sInBlcm1pc3Npb25zIjpbIkZFVENILVBFUk1JU1NJT05TLUJZLUFQSSJdLCJhdWQiOiIzYjE4NThhZC0zOTExLTQ5YmItOGVkZi1lNDUzODI1YmY0YjciLCJpc3MiOiJodHRwczovL2F1dGguYXBwLmdvbWJvYy5haSIsImlhdCI6MTc3MzI2NjQ1Nn0.ANmIWMgbxKPJNLY3abDvj3NvWa8W-gUSSY8zcGCneAUo5mw0xiwlIG0riIU2c0H4UWW7HxcCl4xESbbwOe4zpHeB7cy7igBwtCkp-I2lZkU7LuAKkWCCcoSBSrWvqEdG_5yHUGJRHx8mF0T_HfmkBDXkjKW3joTyVJiT1v8UM0dhUiicUsxE2SsQK1_TNJhejvOiLLmvh0yZeNU6YJPBI1OZ1K7g453TiRcXlqjZ7Rv3b0PSWe4I-dukCt6QRoDRN0isEPY_HN1y9HzEWfrQUfi_1iIMouSXOvegEbvRh-iXjLytsVZmP4C8dk-Gpe59Q0fVwcgRgVkFX1u_QPC1PQ" \
  gombocai/orl:v1.3.0-latest rules pull \
  --url="https://rules.prod.gcp.gomboc.ai" \
  --out=/output \
  --channel="c6501c5c-4db3-411c-9168-df31a455055d/set/default"

# Verify rules were pulled
ls -la rules/
```

## Troubleshooting Docker Issues

### Image Pull Issues

```bash
# Clean Docker cache
docker system prune -a

# Pull specific version
docker pull gombocai/orl:v1.3.0-latest
```

### Permission Issues

```bash
# Fix volume mount permissions (Linux/Mac)
sudo chown -R $USER:$USER /path/to/workspace

# Or run with user mapping
docker run --rm -u $(id -u):$(id -g) -v $(pwd):/workspace gombocai/orl:v1.3.0-latest --help
```

### Network Issues

```bash
# Test network connectivity
docker run --rm gombocai/orl:v1.3.0-latest ping -c 3 google.com

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
    image: gombocai/orl:v1.3.0-latest
    volumes:
      - ./workspace:/workspace
      - ./rules:/rules
    environment:
      - RULE_SERVICE_TOKEN=${RULE_SERVICE_TOKEN}
      - RULE_SERVICE_URL=https://rules.dev.gcp.gomboc.ai
    command: remediate /workspace --dry-run
```

Usage:

```bash
# Set environment variables
export RULE_SERVICE_TOKEN="your-token"

# Run with docker-compose
docker-compose up
```
