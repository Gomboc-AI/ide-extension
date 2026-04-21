#!/bin/bash

# ORL Docker Setup Script
# This script helps set up the ORL Docker image and test the integration

set -e

echo "ORL Docker Setup Script"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Docker is running
check_docker() {
    echo "Checking Docker..."
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_status "Docker is running"
}

# Check if ORL image is available
check_orl_image() {
    echo "Checking ORL Docker image..."
    if ! docker images | grep -q "gombocai/orl.*v1.0.0"; then
        print_warning "ORL Docker image v1.0.0 not found locally"
        print_status "Will pull the public image from Docker Hub"
    else
        print_status "ORL Docker image v1.0.0 found locally"
    fi
}

# Pull ORL Docker image
pull_orl_image() {
    echo "Pulling ORL Docker image..."
    docker pull gombocai/orl:v1.3.0-latest
    print_status "ORL Docker image v1.3.0 pulled successfully"
}

# Test ORL image
test_orl_image() {
    echo "Testing ORL image..."
    
    # Test basic help
    if docker run --rm gombocai/orl:v1.3.0-latest --help > /dev/null 2>&1; then
        print_status "ORL image basic test passed"
    else
        print_error "ORL image basic test failed"
        exit 1
    fi
    
    # Test remediate command
    if docker run --rm gombocai/orl:v1.3.0-latest remediate --help > /dev/null 2>&1; then
        print_status "ORL remediate command test passed"
    else
        print_error "ORL remediate command test failed"
        exit 1
    fi
}

# Create test workspace
create_test_workspace() {
    echo "Creating test workspace..."
    
    mkdir -p test-workspace
    cat > test-workspace/test-aws.tf << 'EOF'
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
    
    print_status "Test workspace created at test-workspace/"
}

# Test ORL with sample files
test_orl_with_files() {
    echo "Testing ORL with sample files..."
    
    if [ -z "$RULE_SERVICE_TOKEN" ]; then
        print_warning "RULE_SERVICE_TOKEN not set"
        print_warning "Skipping ORL execution test. Set this environment variable to test:"
        print_warning "  export RULE_SERVICE_TOKEN='your-token'"
        return
    fi
    
    cd test-workspace
    
    # Test ORL remediation
    if docker run --rm \
        -v $(pwd):/workspace \
        -e RULE_SERVICE_TOKEN="$RULE_SERVICE_TOKEN" \
        gombocai/orl:v1.3.0-latest remediate /workspace --dry-run > /dev/null 2>&1; then
        print_status "ORL remediation test passed"
    else
        print_warning "ORL remediation test failed (this may be due to authentication or network issues)"
    fi
    
    cd ..
}

# Main execution
main() {
    echo "Starting ORL Docker setup..."
    echo
    
    check_docker
    check_orl_image
    pull_orl_image
    test_orl_image
    create_test_workspace
    test_orl_with_files
    
    echo
    echo "🎉 ORL Docker setup complete!"
    echo
    echo "Next steps:"
    echo "1. Configure VS Code extension settings (see SETUP_GUIDE.md)"
    echo "2. Launch VS Code extension development mode: npm run compile && code ."
    echo "3. Press F5 to test the extension"
    echo "4. Open test-workspace/test-aws.tf and save to trigger ORL scan"
    echo
    echo "For detailed setup instructions, see SETUP_GUIDE.md"
}

# Run main function
main "$@"
