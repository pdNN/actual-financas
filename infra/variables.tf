variable "project_id" {
  description = "ID do projeto GCP"
  type        = string
}

variable "region" {
  description = "Região do GCP (free tier: us-west1, us-central1, us-east1)"
  type        = string
  default     = "us-east1"
}

variable "zone" {
  description = "Zona do GCP"
  type        = string
  default     = "us-east1-b"
}

variable "github_repo" {
  description = "Repositório no formato owner/repo — restringe quem pode usar o WIF"
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repo))
    error_message = "github_repo precisa estar no formato owner/repo."
  }
}

variable "state_bucket_name" {
  description = "Bucket do state do Terraform, criado por infra/bootstrap/"
  type        = string
}

variable "backup_bucket_name" {
  description = "Bucket dos backups do SQLite"
  type        = string
}

variable "backup_retention_days" {
  description = "Dias de retenção dos backups antes da exclusão automática"
  type        = number
  default     = 30
}

variable "instance_name" {
  description = "Nome da instância do GCE"
  type        = string
  default     = "actual-financas"
}

variable "machine_type" {
  description = "Tipo de máquina (e2-micro é free tier)"
  type        = string
  default     = "e2-micro"
}

variable "disk_size_gb" {
  description = "Tamanho do disco de boot em GB (30GB é free tier)"
  type        = number
  default     = 30
}

variable "boot_image" {
  description = <<-EOT
    Imagem de boot da VM. Fica fixada numa família específica de propósito:
    trocar a imagem recria a instância, então isso precisa ser uma decisão
    explícita e visível no plan, nunca um efeito colateral.
  EOT
  type        = string
  default     = "ubuntu-os-cloud/ubuntu-minimal-2404-lts-amd64"
}

variable "runtime_secret_ids" {
  description = "Secrets do Secret Manager que a VM pode ler em tempo de execução"
  type        = list(string)
  default = [
    "ACTUAL_OPENID_CLIENT_ID",
    "ACTUAL_OPENID_CLIENT_SECRET",
    "AI_STUDIO_API_KEY",
  ]
}

variable "app_hostname" {
  description = "Hostname público servido pelo Caddy"
  type        = string
}

variable "ssh_source_ranges" {
  description = <<-EOT
    Faixas que podem abrir SSH. O padrão é apenas a faixa do IAP
    (35.235.240.0/20): o acesso passa por túnel autenticado por IAM, e a porta
    22 não fica exposta à internet.
  EOT
  type        = list(string)
  default     = ["35.235.240.0/20"]
}

variable "billing_account" {
  description = <<-EOT
    ID da conta de faturamento, para criar o alerta de orçamento. Vazio
    desliga o alerta — o papel necessário é concedido no nível da conta de
    faturamento, não do projeto, e nem toda conta permite isso.
  EOT
  type        = string
  default     = ""
}

variable "budget_amount_brl" {
  description = "Teto mensal do alerta de orçamento, em BRL"
  type        = number
  default     = 20
}

variable "alert_email" {
  description = "E-mail que recebe os alertas de orçamento. Vazio desliga."
  type        = string
  default     = ""
}
