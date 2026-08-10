# Alerta de orçamento.
#
# A stack inteira é desenhada para custar R$ 0 (free tier), então qualquer
# gasto é sinal de que algo saiu do previsto — VM redimensionada, egress
# inesperado, bucket crescendo além dos 5GB. Um alerta barato agora evita
# descobrir isso só na fatura.
#
# Fica desligado por padrão: exige `roles/billing.costsManager` no nível da
# conta de faturamento, que é concedido fora deste projeto. Preencha
# billing_account e alert_email no terraform.tfvars para habilitar.

resource "google_monitoring_notification_channel" "email" {
  count = var.alert_email != "" ? 1 : 0

  project      = var.project_id
  display_name = "E-mail do responsável"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

resource "google_billing_budget" "monthly" {
  count = var.billing_account != "" ? 1 : 0

  billing_account = var.billing_account
  display_name    = "actual-financas — teto mensal"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = "BRL"
      units         = tostring(var.budget_amount_brl)
    }
  }

  # 50% e 90% avisam a tempo de agir; 100% é o estouro consumado.
  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }

  dynamic "all_updates_rule" {
    for_each = var.alert_email != "" ? [1] : []
    content {
      monitoring_notification_channels = [google_monitoring_notification_channel.email[0].id]
      disable_default_iam_recipients   = false
    }
  }
}

data "google_project" "current" {
  project_id = var.project_id
}
