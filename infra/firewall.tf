# HTTP (80) — Caddy usa para o desafio ACME e para redirecionar a HTTPS.
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

# HTTPS (443) — o Caddy termina o TLS.
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

# SSH (22) — restrito à faixa do IAP.
#
# Antes esta regra era 0.0.0.0/0, o que deixava a porta 22 exposta à internet
# inteira. Com o túnel IAP o acesso continua funcionando (`gcloud compute ssh
# --tunnel-through-iap`), mas passa por autenticação IAM antes de chegar ao
# sshd — e some da superfície de varredura automatizada.
resource "google_compute_firewall" "allow_ssh" {
  name        = "actual-allow-ssh"
  network     = google_compute_network.actual.name
  description = "SSH somente via túnel IAP"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_source_ranges
  target_tags   = ["ssh-server"]
}

# Nega o resto explicitamente, com log, para que tentativa de acesso a porta
# fechada apareça em algum lugar em vez de sumir silenciosamente.
resource "google_compute_firewall" "deny_all_ingress" {
  name        = "actual-deny-all-ingress"
  network     = google_compute_network.actual.name
  description = "Nega o restante do ingresso e registra a tentativa"
  priority    = 65000
  direction   = "INGRESS"

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]

  log_config {
    metadata = "EXCLUDE_ALL_METADATA"
  }
}
