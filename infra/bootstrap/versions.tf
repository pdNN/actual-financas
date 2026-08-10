terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

# Bootstrap roda com credencial humana (ADC), nunca com CI:
#   gcloud auth application-default login
provider "google" {
  project = var.project_id
  region  = var.region
}
