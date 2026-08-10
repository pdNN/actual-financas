# Bucket do state remoto do Terraform.
#
# Problema do ovo e da galinha: o state precisa morar em algum lugar antes de
# existir Terraform gerenciado. Por isso este diretório é o ÚNICO com state
# local, é aplicado uma vez, à mão, com credencial humana, e praticamente nunca
# mais é tocado.
#
#   cd infra/bootstrap && terraform init && terraform apply
#
# Depois disso, todo o resto (infra/) usa o backend GCS criado aqui.

resource "google_storage_bucket" "tfstate" {
  name     = var.state_bucket_name
  project  = var.project_id
  location = upper(var.region)

  # Versionamento é a rede de segurança do state: um apply ruim é recuperável
  # voltando para a geração anterior do objeto.
  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # State nunca deve sumir por acidente.
  force_destroy = false

  lifecycle_rule {
    condition {
      num_newer_versions = 20
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = true
  }
}
