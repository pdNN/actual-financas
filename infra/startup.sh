#!/bin/bash
set -euo pipefail

LOG_FILE="/var/log/actual-startup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Actual Financas startup script — $(date) ==="

# Skip if Docker is already installed (idempotent)
if command -v docker &> /dev/null; then
  echo "Docker already installed, skipping setup."
  # Ensure services are running
  systemctl start docker
  # Start app if compose file exists
  if [ -f /opt/actual/docker-compose.prod.yml ]; then
    cd /opt/actual && docker compose -f docker-compose.prod.yml up -d
  fi
  exit 0
fi

echo "=== Installing Docker CE ==="

# Update and install prerequisites
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release sqlite3 jq

# Add Docker GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable Docker service
systemctl enable docker
systemctl start docker

# Add default user to docker group
usermod -aG docker actual 2>/dev/null || true

echo "=== Creating application directories ==="

mkdir -p /opt/actual/data/server-files
mkdir -p /opt/actual/data/user-files
mkdir -p /opt/actual/caddy_data
mkdir -p /opt/actual/caddy_config
mkdir -p /opt/actual/backups

# Set ownership (actual user UID 1001 matches Dockerfile)
chown -R 1001:1001 /opt/actual/data

echo "=== Installing gsutil for backups ==="
# gsutil comes with gcloud SDK, which is pre-installed on GCE Ubuntu images
# Just verify it's available
if command -v gsutil &> /dev/null; then
  echo "gsutil available"
else
  echo "gsutil not found, installing gcloud CLI..."
  curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/opt
  ln -sf /opt/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil
fi

echo "=== Startup script complete — $(date) ==="
echo "Deploy the app with: cd /opt/actual && docker compose -f docker-compose.prod.yml up -d"
