output "instance_name" {
  description = "Name of the GCE instance"
  value       = google_compute_instance.actual.name
}

output "instance_zone" {
  description = "Zone of the GCE instance"
  value       = google_compute_instance.actual.zone
}

output "external_ip" {
  description = "External IP address of the instance"
  value       = google_compute_address.actual.address
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "gcloud compute ssh ${var.ssh_user}@${google_compute_instance.actual.name} --zone=${var.zone} --project=${var.project_id}"
}

output "app_url" {
  description = "URL to access Actual Budget (configure DuckDNS to point to external_ip)"
  value       = "https://actual-financas.duckdns.org"
}
