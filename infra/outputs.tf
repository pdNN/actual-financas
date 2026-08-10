output "instance_name" {
  description = "Nome da instância"
  value       = google_compute_instance.actual.name
}

output "instance_zone" {
  description = "Zona da instância"
  value       = google_compute_instance.actual.zone
}

output "external_ip" {
  description = "IP externo estático — aponte o DNS para cá"
  value       = google_compute_address.actual.address
}

output "ssh_command" {
  description = "Comando de SSH (via túnel IAP; a porta 22 não é pública)"
  value       = "gcloud compute ssh ${google_compute_instance.actual.name} --zone=${var.zone} --project=${var.project_id} --tunnel-through-iap"
}

output "app_url" {
  description = "URL pública da aplicação"
  value       = "https://${var.app_hostname}"
}

output "backup_bucket" {
  description = "Bucket dos backups do SQLite"
  value       = google_storage_bucket.backups.name
}

# --- Valores para configurar os secrets do GitHub ---
#
# Estes três outputs alimentam os secrets do repositório. Nenhum deles é
# credencial: são nomes de recurso e e-mails de service account. A credencial
# em si é emitida na hora, pelo WIF.

output "github_secret_gcp_workload_identity_provider" {
  description = "Valor do secret GCP_WORKLOAD_IDENTITY_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_secret_gcp_tf_deployer_sa" {
  description = "Valor do secret GCP_TF_DEPLOYER_SA"
  value       = google_service_account.tf_deployer.email
}

output "github_secret_gcp_app_deployer_sa" {
  description = "Valor do secret GCP_APP_DEPLOYER_SA"
  value       = google_service_account.app_deployer.email
}
