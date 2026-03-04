# Infrastructure — Actual Finanças

Deploy Actual Budget to GCP Compute Engine e2-micro (free tier) with Google OAuth2, Caddy TLS, and automated backups.

## Architecture

```
Internet → Caddy (TLS/HTTPS :443) → Actual Budget (:5006) → SQLite (/data)
                                  ↑
                          Google OAuth2 (login)
```

All services run as Docker containers on a single GCE e2-micro VM.

## Cost: $0/month

| Resource | Free Tier |
|----------|-----------|
| GCE e2-micro (us-east1) | ✅ Always free |
| 30GB pd-standard disk | ✅ Always free |
| Static external IP | ✅ Free (attached) |
| GCS 5GB backup bucket | ✅ Always free |
| DuckDNS | ✅ Free |
| Let's Encrypt TLS | ✅ Free |
| Google OAuth2 | ✅ Free |

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) authenticated
- GCP project `actual-financas` with billing enabled
- Service account key at `infra/credentials.json`

## Quick Start

### 1. Provision the VM

```bash
cd infra
terraform init
terraform plan
terraform apply
```

Note the `external_ip` output — you'll need it for DuckDNS.

### 2. Configure DuckDNS

1. Go to [duckdns.org](https://www.duckdns.org) and sign in with Google
2. Create subdomain: `actual-financas`
3. Set the IP to the `external_ip` from Terraform output
4. Save your DuckDNS token

### 3. Configure Google OAuth2

1. Go to [GCP Console → APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent?project=actual-financas)
2. Create **External** consent screen
3. Add test users: `pedrolucho02@gmail.com` (and Julia's email)
4. Go to [Credentials](https://console.cloud.google.com/apis/credentials?project=actual-financas) → Create OAuth 2.0 Client ID
5. Type: **Web application**
6. Authorized redirect URI: `https://actual-financas.duckdns.org/openid/callback`
7. Copy Client ID and Secret

### 4. Configure Environment

SSH into the VM:
```bash
gcloud compute ssh actual@actual-financas --zone=us-east1-b --project=actual-financas
```

Copy files to the server:
```bash
sudo mkdir -p /opt/actual
# Copy docker-compose.prod.yml, Caddyfile, backup.sh, restore.sh to /opt/actual/
```

Create `.env` from template:
```bash
sudo cp .env.example /opt/actual/.env
sudo nano /opt/actual/.env
# Fill in ACTUAL_OPENID_CLIENT_ID and ACTUAL_OPENID_CLIENT_SECRET
```

### 5. Start the Application

```bash
cd /opt/actual
sudo docker compose -f docker-compose.prod.yml up -d
```

### 6. Set Up Backups

Create the GCS bucket:
```bash
gsutil mb -l us-east1 gs://actual-financas-backups
gsutil lifecycle set <(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}') gs://actual-financas-backups
```

Add cron job:
```bash
sudo chmod +x /opt/actual/backup.sh
sudo crontab -e
# Add: 0 3 * * * /opt/actual/backup.sh >> /var/log/actual-backup.log 2>&1
```

### 7. Set Up DuckDNS Auto-Update

```bash
sudo crontab -e
# Add: */5 * * * * curl -s "https://www.duckdns.org/update?domains=actual-financas&token=YOUR_TOKEN&ip=" > /dev/null
```

## Files

| File | Purpose |
|------|---------|
| `provider.tf` | GCP provider configuration |
| `variables.tf` | Terraform variables |
| `terraform.tfvars` | Variable values for this project |
| `main.tf` | GCE instance, network, static IP |
| `firewall.tf` | Firewall rules (HTTP, HTTPS, SSH) |
| `outputs.tf` | Terraform outputs (IP, SSH command) |
| `startup.sh` | VM bootstrap (Docker install) |
| `docker-compose.prod.yml` | Production Docker Compose |
| `Caddyfile` | Caddy reverse proxy config |
| `.env.example` | Environment variables template |
| `backup.sh` | SQLite backup to GCS |
| `restore.sh` | Restore from GCS backup |
| `credentials.json` | SA key (gitignored, never commit) |

## Maintenance

### Update Actual Budget
```bash
cd /opt/actual
docker compose -f docker-compose.prod.yml pull actual
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```

### View logs
```bash
docker logs actual-budget --tail 100 -f
docker logs caddy --tail 100 -f
```

### Manual backup
```bash
sudo /opt/actual/backup.sh
```

### Restore from backup
```bash
sudo /opt/actual/restore.sh  # Lists available backups
sudo /opt/actual/restore.sh backup-20250303_030000
```

## CI/CD

The GitHub Actions workflow at `.github/workflows/deploy-gce.yml` automatically:
1. Builds the Docker image on push to `main`/`master`
2. Pushes to GitHub Container Registry
3. SSHs into the GCE instance and pulls the new image
4. Runs health checks

### Required GitHub Secrets
- `GCP_SA_KEY`: Service account JSON key (base64 of `credentials.json`)
