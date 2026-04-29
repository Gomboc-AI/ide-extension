resource "aws_dax_cluster" "test" {
  cluster_name       = "test-cluster"
  iam_role_arn       = "arn:aws:iam::123456789012:role/dax-role"
  node_type          = "dax.r4.large"
  replication_factor = 1
}
