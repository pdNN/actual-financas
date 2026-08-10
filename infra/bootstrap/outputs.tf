output "state_bucket_name" {
  description = "Bucket do state — use este valor em infra/backend.tf"
  value       = google_storage_bucket.tfstate.name
}
