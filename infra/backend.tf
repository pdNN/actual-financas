terraform {
  # State remoto no bucket criado por infra/bootstrap/.
  # Antes disso existir, este arquivo faz o `terraform init` falhar — é o
  # comportamento correto: rode o bootstrap primeiro.
  backend "gcs" {
    bucket = "actual-financas-tfstate"
    prefix = "prod"
  }
}
