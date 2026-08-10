# Identidades e federação com o GitHub Actions.
#
# Objetivo: nenhuma chave JSON de service account existe — nem no repositório,
# nem nos secrets do GitHub. O CI obtém credencial de curta duração via
# Workload Identity Federation, provando quem é pelo token OIDC do Actions.
#
# ATENÇÃO — ovo e galinha: o primeiro `terraform apply` que cria estes recursos
# precisa rodar com credencial humana (`gcloud auth application-default login`).
# A partir do segundo, o CI se autentica sozinho.

locals {
  # `principalSet` do repositório: qualquer workflow deste repo (e somente
  # deste) pode impersonar as service accounts abaixo.
  wif_principal = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# --- Workload Identity Federation ---

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Federação keyless para o CI do actual-financas"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Linha crítica de segurança: sem ela, qualquer repositório do GitHub
  # conseguiria trocar um token OIDC por credencial deste projeto — inclusive
  # um fork aberto por terceiros.
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# --- SA que roda o Terraform no CI ---

resource "google_service_account" "tf_deployer" {
  project      = var.project_id
  account_id   = "tf-deployer"
  display_name = "Terraform deployer (CI)"
  description  = "Roda terraform plan/apply pelo GitHub Actions"
}

# Papéis curados: o que o Terraform deste projeto realmente precisa mexer.
# Deliberadamente NÃO usa roles/owner nem roles/editor.
resource "google_project_iam_member" "tf_deployer" {
  for_each = toset([
    "roles/compute.admin",                   # VM, rede, firewall, IP estático
    "roles/iam.serviceAccountAdmin",         # criar/gerir as SAs deste arquivo
    "roles/iam.serviceAccountUser",          # anexar a SA da VM à instância
    "roles/iam.workloadIdentityPoolAdmin",   # pool e provider do WIF
    "roles/resourcemanager.projectIamAdmin", # conceder papéis de projeto
    "roles/secretmanager.admin",             # secrets consumidos pela VM
    "roles/storage.admin",                   # bucket de backup
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.tf_deployer.email}"
}

# Acesso ao próprio state. É o passo que costuma ser esquecido: sem isto o
# `terraform init` do CI falha ao ler o bucket do bootstrap.
resource "google_storage_bucket_iam_member" "tf_deployer_state" {
  bucket = var.state_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.tf_deployer.email}"
}

resource "google_service_account_iam_member" "wif_tf_deployer" {
  service_account_id = google_service_account.tf_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.wif_principal
}

# --- SA que faz o deploy da aplicação no CI ---

resource "google_service_account" "app_deployer" {
  project      = var.project_id
  account_id   = "app-deployer"
  display_name = "Application deployer (CI)"
  description  = "Conecta na VM por IAP e atualiza os containers"
}

# Escopo mínimo para "entrar na VM e rodar docker compose":
# - osLogin dá o acesso SSH gerenciado por IAM (sem chave em metadata);
# - tunnelResourceAccessor permite o túnel IAP, já que o SSH não fica aberto;
# - compute.viewer é necessário para o gcloud descobrir a instância.
resource "google_project_iam_member" "app_deployer" {
  for_each = toset([
    "roles/compute.osLogin",
    "roles/iap.tunnelResourceAccessor",
    "roles/compute.viewer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_deployer.email}"
}

resource "google_service_account_iam_member" "wif_app_deployer" {
  service_account_id = google_service_account.app_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.wif_principal
}

# --- SA da própria VM ---

resource "google_service_account" "vm" {
  project      = var.project_id
  account_id   = "actual-vm"
  display_name = "Actual VM runtime"
  description  = "Identidade da instância: lê secrets e grava backup"
}

resource "google_project_iam_member" "vm_logging" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.vm.email}"
}

# Acesso aos secrets é concedido secret a secret, nunca no projeto inteiro.
resource "google_secret_manager_secret_iam_member" "vm_accessor" {
  for_each = toset(var.runtime_secret_ids)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

# A VM escreve os backups do SQLite; não precisa de leitura do projeto inteiro.
resource "google_storage_bucket_iam_member" "vm_backup_writer" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm.email}"
}
