project_id  = "actual-financas"
region      = "us-east1"
zone        = "us-east1-b"
github_repo = "pdNN/actual-financas"

state_bucket_name  = "actual-financas-tfstate"
backup_bucket_name = "actual-financas-backups"

instance_name = "actual-financas"
machine_type  = "e2-micro"
disk_size_gb  = 30

app_hostname = "actual-financas.fglivraria.com"

# Alerta de orçamento — desligado até preencher os dois campos.
# Ver o comentário no topo de budget.tf sobre o papel necessário.
# billing_account   = "000000-000000-000000"
# alert_email       = "pedrolucho02@gmail.com"
# budget_amount_brl = 20
