locals {
  # Labels em tudo que aceita label — barato agora, e é o que torna possível
  # abrir o relatório de custo por componente depois.
  common_labels = {
    environment    = "prod"
    provisioned-by = "terraform"
    application    = "actual-financas"
  }
}

# --- Rede ---

resource "google_compute_network" "actual" {
  name                    = "actual-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "actual" {
  name          = "actual-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.actual.id
}

# --- IP estático ---

resource "google_compute_address" "actual" {
  name         = "actual-ip"
  region       = var.region
  network_tier = "STANDARD"
}

# --- Instância ---

resource "google_compute_instance" "actual" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone

  tags   = ["http-server", "https-server", "ssh-server"]
  labels = local.common_labels

  boot_disk {
    initialize_params {
      image  = var.boot_image
      size   = var.disk_size_gb
      type   = "pd-standard"
      labels = local.common_labels
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.actual.id

    access_config {
      nat_ip       = google_compute_address.actual.address
      network_tier = "STANDARD"
    }
  }

  metadata = {
    # OS Login troca "chave pública no metadata" por acesso SSH governado por
    # IAM: o CI entra com a identidade da app-deployer, e revogar acesso é
    # remover um papel, não editar metadata da instância.
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = file("${path.module}/startup.sh")

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
  }

  service_account {
    email = google_service_account.vm.email
    # cloud-platform delega a autorização real para os papéis IAM da SA, que
    # são estreitos (ver iam.tf). É o padrão recomendado pelo Google desde que
    # os escopos legados foram depreciados.
    scopes = ["cloud-platform"]
  }

  allow_stopping_for_update = true

  lifecycle {
    # A VM é gado, mas o disco tem o SQLite. Recriação precisa ser deliberada:
    # o plan mostra a destruição e você decide.
    ignore_changes = [metadata_startup_script]
  }
}
