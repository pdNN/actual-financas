terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

# Sem `credentials = file(...)`: a autenticação vem de Application Default
# Credentials. Localmente isso é `gcloud auth application-default login`; no CI
# é Workload Identity Federation (ver iam.tf), sem chave JSON em lugar nenhum.
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
