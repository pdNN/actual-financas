# Infraestrutura — actual-financas

Actual Budget rodando numa VM `e2-micro` do GCP (free tier), com login Google, TLS pelo Caddy e backup do SQLite em GCS.

```text
Internet → Caddy (TLS :443) → Actual (:5006) → SQLite (/opt/actual/data)
                                             ↘ backup diário → GCS
```

Tudo é container Docker numa única VM. Custo alvo: **R$ 0/mês**.

## Princípios desta esteira

| Princípio                         | Como se manifesta                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Nenhuma chave JSON**            | O CI autentica por Workload Identity Federation. Não existe SA key no repo nem nos secrets do GitHub.            |
| **State remoto e versionado**     | Bucket GCS criado pelo `bootstrap/`, com versionamento e `prevent_destroy`.                                      |
| **Plan no PR, apply no merge**    | O `terraform plan` vira comentário no PR. Sua aprovação do PR é a aprovação do apply.                            |
| **Tag imutável**                  | O deploy publica `sha-<commit>`, nunca `latest`. É o que torna rollback possível.                                |
| **Deploy verifica antes de sair** | Espera o healthcheck do container e faz smoke test pela URL pública; se falhar, volta sozinho à versão anterior. |
| **SSH não é público**             | Porta 22 aberta só para a faixa do IAP, com OS Login. Acesso é governado por IAM.                                |

## Arquivos

| Arquivo                    | O que é                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `bootstrap/`               | Cria o bucket do state. State local, aplicado uma vez, à mão.       |
| `backend.tf`               | Backend GCS do Terraform principal                                  |
| `versions.tf`              | Versão do Terraform, do provider, e o provider (via ADC)            |
| `variables.tf`             | Variáveis                                                           |
| `terraform.tfvars`         | Valores deste projeto (versionado — não guarda segredo)             |
| `main.tf`                  | Rede, sub-rede, IP estático, instância                              |
| `firewall.tf`              | Regras de firewall (HTTP, HTTPS, SSH via IAP, deny explícito)       |
| `iam.tf`                   | WIF + service accounts (`tf-deployer`, `app-deployer`, `actual-vm`) |
| `storage.tf`               | Bucket de backup, com retenção                                      |
| `budget.tf`                | Alerta de orçamento (opcional)                                      |
| `outputs.tf`               | Saídas, incluindo os valores dos secrets do GitHub                  |
| `.terraform.lock.hcl`      | Trava a versão do provider — **versionado de propósito**            |
| `startup.sh`               | Bootstrap da VM (instala Docker)                                    |
| `deploy.sh`                | Sobe uma tag na VM, com rollback. Roda na VM.                       |
| `docker-compose.prod.yml`  | Composição de produção                                              |
| `Caddyfile`                | Proxy reverso e TLS                                                 |
| `generate-env.sh`          | Gera o `.env` a partir do Secret Manager                            |
| `backup.sh` / `restore.sh` | Backup e restauração do SQLite no GCS                               |

---

## Instalação do zero

Você só faz isto uma vez. Depois, tudo passa pelo CI.

### 1. Autenticar como humano

O primeiro apply cria as próprias identidades que o CI vai usar depois — clássico ovo e galinha. Por isso ele roda com a sua credencial:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project actual-financas
```

### 2. Criar o bucket do state

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Se você mudar `state_bucket_name`, atualize também o `bucket` em `infra/backend.tf` — o backend não aceita variável.

### 3. Aplicar a infraestrutura

```bash
cd infra
terraform init
terraform apply
```

Isso cria a VM, a rede, o firewall, o bucket de backup, o pool do WIF e as três service accounts.

### 4. Configurar os secrets do GitHub

O Terraform devolve exatamente os valores necessários:

```bash
terraform output -raw github_secret_gcp_workload_identity_provider
terraform output -raw github_secret_gcp_tf_deployer_sa
terraform output -raw github_secret_gcp_app_deployer_sa
```

Cadastre em **Settings → Secrets and variables → Actions**:

| Secret                           | Valor           |
| -------------------------------- | --------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | primeiro output |
| `GCP_TF_DEPLOYER_SA`             | segundo output  |
| `GCP_APP_DEPLOYER_SA`            | terceiro output |

Nenhum deles é credencial: são nome de recurso e e-mail de service account. A credencial é emitida na hora, dura minutos, e só funciona para workflows deste repositório (garantido pelo `attribute_condition` em `iam.tf`).

**Apague o secret `GCP_SA_KEY`** — ele era uma chave JSON de longa duração e não é mais usado. Depois, revogue a chave no IAM.

### 5. Popular os secrets de runtime

```bash
printf %s "SEU_VALOR" | gcloud secrets create ACTUAL_OPENID_CLIENT_ID     --data-file=- --replication-policy=automatic
printf %s "SEU_VALOR" | gcloud secrets create ACTUAL_OPENID_CLIENT_SECRET --data-file=- --replication-policy=automatic
printf %s "SEU_VALOR" | gcloud secrets create AI_STUDIO_API_KEY           --data-file=- --replication-policy=automatic
```

Use `printf` e não `echo`: o `echo` acrescenta `\n` ao valor, e um client secret com quebra de linha no fim falha de um jeito difícil de diagnosticar.

> **`AI_STUDIO_API_KEY` sozinha não liga nada.** A classificação por IA está
> desligada por padrão desde `specs/001-desligar-padrao-enriquecimento/`. Para
> ligar, é preciso também definir `ACTUAL_AI_CLASSIFICATION_ENABLED=true` no
> ambiente do container. Enquanto isso não for feito, o servidor recusa qualquer
> pedido de classificação e o botão não aparece na importação.
>
> Ela está desligada porque é anterior à constituição do projeto e viola os
> princípios III (determinístico antes de IA), IV (provider plugável) e VII
> (teste). A feature `003` do backlog vai reconstruí-la — o código atual foi
> mantido justamente para ser o ponto de partida dela.

Para rotacionar: `gcloud secrets versions add NOME --data-file=-`. O `generate-env.sh` sempre lê a versão `latest`, então basta um deploy para valer.

### 6. DNS e OAuth

1. Aponte `actual-financas.fglivraria.com` para o `external_ip` do output.
2. No [console de credenciais](https://console.cloud.google.com/apis/credentials?project=actual-financas), crie um OAuth Client ID do tipo **Web application** com redirect URI `https://actual-financas.fglivraria.com/openid/callback`.
3. Adicione você e a Julia como usuários de teste na tela de consentimento.

### 7. Cron de backup na VM

```bash
gcloud compute ssh actual-financas --zone=us-east1-b --tunnel-through-iap
sudo crontab -e
# 0 3 * * * /opt/actual/backup.sh >> /var/log/actual-backup.log 2>&1
```

---

## Operação no dia a dia

### Mudar a infraestrutura

Edite os `.tf`, abra um PR. O workflow **Terraform** roda `fmt`, `validate` e `plan`, e **comenta o plan no PR**. Leia o plan; se estiver certo, faça o merge — o apply roda sozinho.

Nunca rode `terraform apply` na sua máquina para mudança normal: isso cria divergência entre o state e o que está no git. Aplicação manual é só para emergência (break-glass), e o próximo PR deve mostrar `No changes`.

### Publicar a aplicação

Merge em `master` com mudança em `packages/**` dispara build e deploy. O deploy:

1. publica a imagem como `sha-<commit>`;
2. envia os arquivos de `infra/` para a VM;
3. regenera o `.env` a partir do Secret Manager;
4. sobe a nova tag e **espera o container ficar `healthy`**;
5. faz smoke test na URL pública;
6. **se algo falhar, volta sozinho para a tag anterior.**

### Rollback manual

**Actions → Deploy to GCE → Run workflow**, e informe em `image_tag` a tag desejada (`sha-<commit>`). O build é pulado e a VM volta para aquela imagem exata.

Direto na VM, se preferir:

```bash
gcloud compute ssh actual-financas --zone=us-east1-b --tunnel-through-iap
sudo /opt/actual/deploy.sh sha-abc1234
```

### Logs

```bash
docker logs actual-budget --tail 100 -f
docker logs caddy --tail 100 -f
```

### Backup e restauração

```bash
sudo /opt/actual/backup.sh              # backup manual
sudo /opt/actual/restore.sh             # lista os disponíveis
sudo /opt/actual/restore.sh backup-20260809_030000
```

O bucket tem versionamento e `prevent_destroy`: `terraform destroy` não leva os backups junto.

---

## Custo

| Recurso                      | Free tier                  |
| ---------------------------- | -------------------------- |
| GCE `e2-micro` (us-east1)    | ✅ sempre grátis           |
| Disco `pd-standard` 30GB     | ✅ sempre grátis           |
| IP externo estático anexado  | ✅ grátis enquanto anexado |
| GCS 5GB (state + backup)     | ✅ sempre grátis           |
| Secret Manager (6 versões)   | ✅ dentro do free tier     |
| Let's Encrypt / Google OAuth | ✅ grátis                  |

Habilite o alerta de orçamento em `budget.tf` (preencha `billing_account` e `alert_email` no `terraform.tfvars`) para ser avisado se algo sair do previsto.

---

## Notas

- **Versão do Terraform**: o CI usa a versão fixada em `.github/workflows/terraform.yml` (`TF_VERSION`). Use a mesma localmente para o lock file não brigar.
- **Lock file versionado**: `.terraform.lock.hcl` está no git de propósito. Ao atualizar provider, rode `terraform init -upgrade` e commite a mudança.
- **A imagem no GHCR precisa ser pública** para a VM baixar sem autenticação. Se torná-la privada, o `deploy.sh` vai precisar de um `docker login` na VM.
- **`ignore_changes = [metadata_startup_script]`** no `main.tf`: mudar o `startup.sh` não recria a VM automaticamente — o disco tem o SQLite. Para reprovisionar de fato, é decisão manual e explícita.
