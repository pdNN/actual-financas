variable "project_id" {
  description = "ID do projeto GCP"
  type        = string
}

variable "region" {
  description = "Região do bucket de state"
  type        = string
  default     = "us-east1"
}

variable "state_bucket_name" {
  description = "Nome do bucket que guarda o state do Terraform (global, precisa ser único)"
  type        = string
}

variable "labels" {
  description = "Labels aplicadas ao bucket"
  type        = map(string)
  default = {
    environment    = "prod"
    provisioned-by = "terraform"
    component      = "tfstate"
  }
}
