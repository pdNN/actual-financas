# >>> CUSTOM: actual-financas — serviço remoto do assistente financeiro (spec 010)
# Não faz parte do upstream actualbudget/actual.
#
# Cloud Run com escala a zero que serve o MCP por HTTP + OAuth (login Google).
# Nada disto roda na VM do Actual (princípio V). Custo esperado: dentro da cota
# gratuita (spec 010, RF-024: teto de R$ 20/mês).
#
# Ordem da primeira implantação (ver specs/010-acesso-remoto-mcp/quickstart.md):
#   1. `terraform apply` com mcp_servico_ativo = false   → cria tudo menos o serviço;
#   2. popular os secrets (`gcloud secrets versions add ...`);
#   3. publicar a imagem (workflow deploy-mcp.yml);
#   4. `terraform apply` com mcp_servico_ativo = true    → cria o serviço Cloud Run.
# O Cloud Run exige que os secrets referenciados já tenham versão, por isso o
# serviço fica atrás da variável.
# <<< CUSTOM

variable "mcp_servico_ativo" {
  description = "Cria o serviço Cloud Run (só depois de popular os secrets e publicar a imagem)"
  type        = bool
  default     = false
}

variable "mcp_estado_bucket_name" {
  description = "Bucket do estado dos acessos remotos (um objeto JSON)"
  type        = string
  default     = "actual-financas-mcp-estado"
}

variable "mcp_google_client_id" {
  description = "Client ID do cliente OAuth do Google criado para este serviço (não é segredo)"
  type        = string
  default     = ""
}

variable "mcp_redirects_permitidos" {
  description = "Lista (vírgulas) de retornos de login aceitos; vazio = padrão do código (Claude e ChatGPT). Acrescentar um provedor = uma entrada aqui."
  type        = string
  default     = ""
}

variable "mcp_origens_permitidas_cidr" {
  description = "Faixas de IP aceitas em /mcp, /token, /register e /revoke (opcional; vazio = desligado, recomendado para aceitar qualquer provedor)"
  type        = string
  default     = ""
}

variable "mcp_imagem" {
  description = "Imagem inicial do serviço; o deploy-mcp.yml troca por uma tag nova a cada deploy"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

locals {
  mcp_nome = "financas-mcp"

  # URL determinística do Cloud Run (SERVIÇO-NÚMERO_DO_PROJETO.REGIÃO.run.app).
  # É o `iss` do OAuth: trocar o endereço obriga a reautorizar os aparelhos.
  mcp_url_publica = "https://${local.mcp_nome}-${data.google_project.current.number}.${var.region}.run.app"

  mcp_secrets = {
    segredo       = "financas-mcp-segredo"
    google_secret = "financas-mcp-google-secret"
    actual_token  = "financas-mcp-actual-token"
    actual_sync   = "financas-mcp-actual-sync-id"
    pessoas       = "financas-mcp-pessoas"
  }
}

# --- APIs ---

resource "google_project_service" "mcp" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- Imagem ---

resource "google_artifact_registry_repository" "mcp" {
  project       = var.project_id
  location      = var.region
  repository_id = local.mcp_nome
  format        = "DOCKER"
  description   = "Imagens do serviço remoto do assistente financeiro"

  # Mantém as últimas 3 versões e apaga o resto depois de uma semana: a imagem
  # tem centenas de MB e o espaço gratuito é de 0,5 GB.
  cleanup_policies {
    id     = "apagar-antigas"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "604800s"
    }
  }
  cleanup_policies {
    id     = "manter-ultimas-3"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  depends_on = [google_project_service.mcp]
}

# --- Identidades ---

# Papéis extras do `tf-deployer` (declarado em iam.tf) para criar o que este
# arquivo descreve. Ficam aqui, e não em iam.tf, para não mexer no arquivo que
# o `terraform fmt` já deixou alinhado.
resource "google_project_iam_member" "tf_deployer_mcp" {
  for_each = toset([
    # Serviço Cloud Run e o invoker público dele.
    "roles/run.admin",
    # Repositório de imagens do serviço remoto.
    "roles/artifactregistry.admin",
    # Habilitar as APIs usadas pelo serviço remoto.
    "roles/serviceusage.serviceUsageAdmin",
    # Filtro que exclui o log de requisições do Cloud Run.
    "roles/logging.configWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.tf_deployer.email}"
}

resource "google_service_account" "mcp_runtime" {
  project      = var.project_id
  account_id   = "mcp-runtime"
  display_name = "Serviço remoto do assistente financeiro (runtime)"
  description  = "Roda o Cloud Run; só enxerga os próprios secrets e o próprio bucket"
}

resource "google_service_account" "mcp_deployer" {
  project      = var.project_id
  account_id   = "mcp-deployer"
  display_name = "Deploy do serviço remoto (CI)"
  description  = "Publica imagem e troca a revisão do Cloud Run pelo GitHub Actions"
}

resource "google_service_account_iam_member" "wif_mcp_deployer" {
  service_account_id = google_service_account.mcp_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.wif_principal
}

resource "google_artifact_registry_repository_iam_member" "mcp_deployer_push" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.mcp.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.mcp_deployer.email}"
}

resource "google_project_iam_member" "mcp_deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.mcp_deployer.email}"
}

# O smoke test do deploy confere que o log de requisições da plataforma está excluído.
resource "google_project_iam_member" "mcp_deployer_logs" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.mcp_deployer.email}"
}

# O deploy "age como" a SA do runtime ao criar a revisão.
resource "google_service_account_iam_member" "mcp_deployer_acts_as_runtime" {
  service_account_id = google_service_account.mcp_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.mcp_deployer.email}"
}

# --- Estado dos acessos (um objeto JSON) ---

resource "google_storage_bucket" "mcp_estado" {
  name     = var.mcp_estado_bucket_name
  project  = var.project_id
  location = upper(var.region)

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # Versionamento permite recuperar o estado se uma gravação sair errada.
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition {
      num_newer_versions = 10
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "mcp_runtime_estado" {
  bucket = google_storage_bucket.mcp_estado.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.mcp_runtime.email}"
}

# --- Secrets (só os contêineres; os valores entram por `gcloud secrets versions add`) ---

resource "google_secret_manager_secret" "mcp" {
  for_each = local.mcp_secrets

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.mcp]
}

resource "google_secret_manager_secret_iam_member" "mcp_runtime" {
  for_each = local.mcp_secrets

  project   = var.project_id
  secret_id = google_secret_manager_secret.mcp[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_runtime.email}"
}

# --- Cloud Run ---

resource "google_cloud_run_v2_service" "mcp" {
  count = var.mcp_servico_ativo ? 1 : 0

  project  = var.project_id
  name     = local.mcp_nome
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  labels = {
    app        = local.mcp_nome
    managed-by = "terraform"
  }

  template {
    service_account                  = google_service_account.mcp_runtime.email
    timeout                          = "60s"
    max_instance_request_concurrency = 8

    # No máximo UMA instância: limita custo e memória e permite manter o cache
    # do estado em memória sem coordenação (spec 010, R-1).
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    volumes {
      name = "segredos"
      secret {
        secret = google_secret_manager_secret.mcp["pessoas"].secret_id
        items {
          version = "latest"
          path    = "pessoas.json"
        }
      }
    }

    containers {
      image = var.mcp_imagem

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "segredos"
        mount_path = "/segredos"
      }

      env {
        name  = "URL_PUBLICA"
        value = local.mcp_url_publica
      }
      env {
        name  = "ACTUAL_SERVER_URL"
        value = "https://${var.app_hostname}"
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.mcp_google_client_id
      }
      env {
        name  = "BUCKET_ESTADO"
        value = google_storage_bucket.mcp_estado.name
      }
      env {
        name  = "ARQUIVO_PESSOAS"
        value = "/segredos/pessoas.json"
      }
      env {
        name  = "REDIRECTS_PERMITIDOS"
        value = var.mcp_redirects_permitidos
      }
      env {
        name  = "ORIGENS_PERMITIDAS_CIDR"
        value = var.mcp_origens_permitidas_cidr
      }

      dynamic "env" {
        for_each = {
          SEGREDO_MESTRE        = "segredo"
          GOOGLE_CLIENT_SECRET  = "google_secret"
          ACTUAL_SESSION_TOKEN  = "actual_token"
          ACTUAL_BUDGET_SYNC_ID = "actual_sync"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.mcp[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  # A imagem é trocada pelo deploy-mcp.yml; o Terraform não deve desfazer isso.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.mcp,
    google_secret_manager_secret_iam_member.mcp_runtime,
    google_storage_bucket_iam_member.mcp_runtime_estado,
  ]
}

# A autenticação é do próprio serviço (OAuth): o Cloud Run fica público.
resource "google_cloud_run_v2_service_iam_member" "mcp_publico" {
  count = var.mcp_servico_ativo ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.mcp[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Logs (princípio VIII) ---

# O log de requisições da plataforma guarda URL com `code=`/`state=` e IP. O
# serviço escreve a própria auditoria (sem PII); este filtro tira o resto do
# Cloud Logging, como o Caddy já faz com o access log da VM.
resource "google_logging_project_exclusion" "mcp_requisicoes" {
  project     = var.project_id
  name        = "financas-mcp-requisicoes"
  description = "Remove o log de requisições do Cloud Run do serviço remoto (URL e IP)"
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.mcp_nome}\" AND log_id(\"run.googleapis.com/requests\")"

  depends_on = [google_project_service.mcp]
}

# --- Saídas ---

output "mcp_url_publica" {
  description = "Endereço do serviço remoto; o conector usa <url>/mcp e o redirect do Google é <url>/google/callback"
  value       = local.mcp_url_publica
}

output "mcp_deployer_sa" {
  description = "SA do deploy do serviço remoto (secret GCP_MCP_DEPLOYER_SA do GitHub)"
  value       = google_service_account.mcp_deployer.email
}

output "mcp_imagem_repositorio" {
  description = "Repositório de imagens do serviço remoto"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.mcp.repository_id}"
}
