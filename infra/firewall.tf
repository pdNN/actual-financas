# Allow HTTP traffic (port 80) — for Caddy redirect to HTTPS
resource "google_compute_firewall" "allow_http" {
  name    = "actual-allow-http"
  network = google_compute_network.actual.name

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server"]
}

# Allow HTTPS traffic (port 443) — Caddy serves TLS
resource "google_compute_firewall" "allow_https" {
  name    = "actual-allow-https"
  network = google_compute_network.actual.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["https-server"]
}

# Allow SSH (port 22) — for management
resource "google_compute_firewall" "allow_ssh" {
  name    = "actual-allow-ssh"
  network = google_compute_network.actual.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ssh-server"]
}
