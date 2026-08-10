# Bucket dos backups do SQLite.
#
# Antes era criado à mão com `gsutil mb` + `gsutil lifecycle set` (ver histórico
# do README). Trazer para o Terraform garante que a retenção e o versionamento
# existam de fato, em vez de dependerem de alguém ter rodado o comando certo.

resource "google_storage_bucket" "backups" {
  name     = var.backup_bucket_name
  project  = var.project_id
  location = upper(var.region)

  # Versionamento protege contra o pior caso: o backup.sh subir um arquivo
  # corrompido por cima do último backup bom.
  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # 5GB é o limite do free tier — a retenção existe para não estourar isso.
  lifecycle_rule {
    condition {
      age = var.backup_retention_days
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  labels = local.common_labels

  # São os dados financeiros do casal. Não some por `terraform destroy`.
  lifecycle {
    prevent_destroy = true
  }
}
