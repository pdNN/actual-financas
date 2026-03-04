# --- Network ---

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

# --- Static IP ---

resource "google_compute_address" "actual" {
  name         = "actual-ip"
  region       = var.region
  network_tier = "STANDARD"
}

# --- Compute Instance ---

resource "google_compute_instance" "actual" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["http-server", "https-server", "ssh-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-minimal-2404-lts-amd64"
      size  = var.disk_size_gb
      type  = "pd-standard"
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
    ssh-keys = var.ssh_pub_key_file != "" ? "${var.ssh_user}:${file(var.ssh_pub_key_file)}" : null
  }

  metadata_startup_script = file("${path.module}/startup.sh")

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
  }

  service_account {
    email  = "tf-actual@${var.project_id}.iam.gserviceaccount.com"
    scopes = ["cloud-platform"]
  }

  allow_stopping_for_update = true
}
