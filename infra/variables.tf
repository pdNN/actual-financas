variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region (must be free tier eligible: us-west1, us-central1, us-east1)"
  type        = string
  default     = "us-east1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-east1-b"
}

variable "credentials_file" {
  description = "Path to GCP service account credentials JSON"
  type        = string
  default     = "credentials.json"
}

variable "instance_name" {
  description = "Name of the GCE instance"
  type        = string
  default     = "actual-financas"
}

variable "machine_type" {
  description = "GCE machine type (e2-micro is free tier)"
  type        = string
  default     = "e2-micro"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB (30GB is free tier)"
  type        = number
  default     = 30
}

variable "ssh_user" {
  description = "SSH username for the instance"
  type        = string
  default     = "actual"
}

variable "ssh_pub_key_file" {
  description = "Path to SSH public key file (leave empty to skip)"
  type        = string
  default     = ""
}
